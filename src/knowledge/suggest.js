'use strict';
// CONTEXT Knowledge — the Link suggestions of `lint --suggest`.
//
// Implements AGSC-05-35. The ontology pipeline has a stage between "write notes" and
// "link them": this module reads the items and PROPOSES Links; it never makes one. A
// person accepts a suggestion by editing the item, or an agent by a Proposal (AGSC-08-28).
// The output is a plain list (`suggestions`) and the file text (`file`); where the file is
// written is the verb's business, and it is never under `content/`.
//
// Five generators, each a small function of the items and of the Link graph:
//   G1  an inline link in the body of A to B                 -> `related`
//   G2  A and B cite two or more of the same sources          -> `related`
//   G3  the title or an alias of B is a phrase in A's body    -> `related`
//   G4  a lesson with no `derived-from`                       -> `derived-from` an episode
//   G5  the same phrase match against a term                  -> `uses`
// A suggestion is made only for a pair of two different items that have no Link between
// them in either direction (G4 is the exception: it exists because a lesson has no
// `derived-from`, and the episode it names is usually already joined to it by a Link).
// Evidence that comes only from an item whose `prov.origin` is `ai-generated` is ignored:
// a text a model wrote cannot ground another.
//
// PURE: items in, a list or a text out; no fs, no process, no clock, no network. The list
// is sorted and free of repeats, so the same items always give the same bytes.

const jcs = require('./jcs.js');
const links = require('./links.js');
const markdown = require('./markdown.js');
const { codePointLength, compareCodePoint, foldCase } = require('./unicode.js');

/** G3 and G5 compare phrases of at least this many code points (AGSC-05-35). */
const MIN_PHRASE_LENGTH = 4;

const WORD_BEFORE = /[\p{L}\p{N}]$/u;
const WORD_AFTER = /^[\p{L}\p{N}]/u;

const pairKey = (a, b) => (compareCodePoint(a, b) <= 0 ? `${a}\u0000${b}` : `${b}\u0000${a}`);
const suggestion = (generator, key, source, target, evidence) => ({ evidence, generator, key, source, target });

/** The facts every generator reads: the items, the Links between them, and which are machine-written. */
function readFacts(items) {
  const views = items.map((item) => links.view(item));
  const edges = links.resolve(items).edges;
  return {
    aiGenerated: new Set(views.filter((v) => v.fm.prov && v.fm.prov.origin === 'ai-generated').map((v) => v.slug)),
    edges,
    joined: new Set(edges.filter((e) => e.key !== 'mentions').map((e) => pairKey(e.source, e.target))),
    views,
  };
}

/** G1: an inline link between two items that no Link joins. */
function fromMentions(facts) {
  return facts.edges
    .filter((e) => e.key === 'mentions' && e.source !== e.target)
    .filter((e) => !facts.aiGenerated.has(e.source) && !facts.joined.has(pairKey(e.source, e.target)))
    .map((e) => suggestion('G1', 'related', e.source, e.target, [{ kind: 'mention' }]));
}

/** The distinct `sources[].resource` strings of an item, in code-point order. */
function resourcesOf(view) {
  const list = Array.isArray(view.fm.sources) ? view.fm.sources : [];
  return [...new Set(list.map((s) => s && s.resource).filter((r) => typeof r === 'string'))].sort(compareCodePoint);
}

/** G2: two items that cite two or more of the same resources, from the earlier slug to the later. */
function fromSharedSources(facts) {
  const citing = facts.views.filter((v) => !facts.aiGenerated.has(v.slug))
    .map((v) => ({ slug: v.slug, resources: new Set(resourcesOf(v)) }))
    .sort((a, b) => compareCodePoint(a.slug, b.slug));
  const out = [];
  for (const [i, first] of citing.entries()) {
    for (const second of citing.slice(i + 1)) {
      const shared = [...first.resources].filter((r) => second.resources.has(r)).sort(compareCodePoint);
      if (shared.length >= 2 && !facts.joined.has(pairKey(first.slug, second.slug))) {
        out.push(suggestion('G2', 'related', first.slug, second.slug,
          shared.map((resource) => ({ kind: 'shared-source', resource }))));
      }
    }
  }
  return out;
}

/** Whether `phrase` stands in `text` as a whole phrase: no letter or digit touches it on either side. */
function containsPhrase(text, phrase) {
  for (let at = text.indexOf(phrase); at >= 0; at = text.indexOf(phrase, at + 1)) {
    const before = text.slice(Math.max(0, at - 2), at);
    const after = text.slice(at + phrase.length, at + phrase.length + 2);
    if (!WORD_BEFORE.test(before) && !WORD_AFTER.test(after)) return true;
  }
  return false;
}

/** The title and aliases of an item that are long enough to match, as authored, distinct once folded. */
function labelsOf(view) {
  const aliases = Array.isArray(view.fm.aliases) ? view.fm.aliases : [];
  const seen = new Set();
  return [view.fm.title, ...aliases].filter((label) => typeof label === 'string'
    && codePointLength(label) >= MIN_PHRASE_LENGTH && !seen.has(foldCase(label)) && seen.add(foldCase(label)))
    .sort(compareCodePoint);
}

/** G3 and G5: the labels of each target found in each body, `related` for a note and `uses` for a term. */
function fromPhrases(facts) {
  const readings = facts.views.filter((v) => !facts.aiGenerated.has(v.slug))
    .map((v) => ({ slug: v.slug, text: foldCase(markdown.proseText(v.body)) }));
  const out = [];
  for (const target of facts.views) {
    const isTerm = target.fm.kind === 'term';
    const labels = labelsOf(target).map((label) => ({ label, folded: foldCase(label) }));
    for (const reading of readings) {
      if (reading.slug === target.slug || facts.joined.has(pairKey(reading.slug, target.slug))) continue;
      const found = labels.filter((l) => containsPhrase(reading.text, l.folded));
      if (found.length === 0) continue;
      out.push(suggestion(isTerm ? 'G5' : 'G3', isTerm ? 'uses' : 'related', reading.slug, target.slug,
        found.map((l) => ({ kind: 'phrase', phrase: l.label }))));
    }
  }
  return out;
}

/** The item whose text or front matter states an edge: the owner of an authored one, the source of a mention. */
function authorOf(edge) {
  return edge.computed && edge.key !== 'mentions' ? edge.target : edge.source;
}

/** G4: a lesson with no `derived-from` is offered each episode joined to it, or none. */
function fromLessons(facts) {
  const typeOf = new Map(facts.views.map((v) => [v.slug, v.type]));
  const out = [];
  for (const lesson of facts.views.filter((v) => v.type === 'lesson')) {
    if (facts.edges.some((e) => e.key === 'derived-from' && e.source === lesson.slug)) continue;
    const joined = facts.edges.filter((e) => !(facts.aiGenerated.has(lesson.slug) && authorOf(e) === lesson.slug))
      .map((e) => (e.source === lesson.slug ? e.target : (e.target === lesson.slug ? e.source : null)))
      .filter((other) => other !== null && typeOf.get(other) === 'episode');
    const episodes = [...new Set(joined)];
    if (episodes.length === 0) out.push(suggestion('G4', 'derived-from', lesson.slug, null, [{ kind: 'none' }]));
    for (const episode of episodes) out.push(suggestion('G4', 'derived-from', lesson.slug, episode, [{ kind: 'episode' }]));
  }
  return out;
}

/** Sort by source, target (`null` first: no slug is empty), key and generator, all by code point. */
function compareSuggestions(a, b) {
  const targetOf = (s) => (s.target === null ? '' : s.target);
  return compareCodePoint(a.source, b.source)
    || compareCodePoint(targetOf(a), targetOf(b))
    || compareCodePoint(a.key, b.key)
    || compareCodePoint(a.generator, b.generator);
}

/**
 * AGSC-05-35: the Links the content suggests.
 *
 * @param {Array<object>} items the loaded items of the Bundle (drafts and held-back ones too)
 * @returns {Array<{evidence: object[], generator: string, key: string, source: string, target: string|null}>}
 */
function suggestions(items) {
  const facts = readFacts(Array.isArray(items) ? items : []);
  const all = [...fromMentions(facts), ...fromSharedSources(facts), ...fromPhrases(facts), ...fromLessons(facts)];
  const unique = new Map(all.map((s) => [[s.generator, s.source, s.target, s.key].join('\u0000'), s]));
  return [...unique.values()].sort(compareSuggestions);
}

/**
 * The text of `dist/suggestions.json`: JCS-canonical, one LF at the end (AGSC-05-35).
 *
 * @param {Array<object>} items the loaded items of the Bundle
 * @param {string} bundleVersion the content version (AGSC-04-25)
 * @returns {string}
 */
function file(items, bundleVersion) {
  return `${jcs.canonicalize({ bundle_version: bundleVersion, suggestions: suggestions(items) })}\n`;
}

module.exports = { file, suggestions };
