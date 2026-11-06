'use strict';
/**
 * CONTEXT Composition — the blueprint outputs of a saved architecture (AGSC-07-29).
 *
 * A blueprint turns the composition a `kind: architecture` item saves (AGSC-02-97, AGSC-07-24)
 * into the starting documents of a build: the first three levels of the C4 model as Mermaid
 * flowcharts, one decision record for each decision the members cite, and a build plan with one
 * step per member. `compose --from <slug> --brief` writes them into the subdirectory
 * `blueprint/` of the directory beside the Harness that the brief uses (AGSC-07-25):
 *   blueprint/c4-context.mmd     level 1: the architecture as one system, and the listed items
 *                                outside the selection that a member reaches
 *   blueprint/c4-containers.mmd  level 2: the Concepts of the selection, their authored Links
 *                                and the port wiring between them (AGSC-07-23)
 *   blueprint/c4-components.mmd  level 3: the other members, each inside the Concept an
 *                                authored Link joins it to
 *   blueprint/decisions/NNNN-<slug>.md  one MADR record per distinct `decided-by` target
 *   blueprint/build-plan.md      one step per member, in dependency order (AGSC-07-26)
 * JSON Schema, OpenAPI and test scaffolds are not blueprint outputs at 1.1 (AGSC-07-29).
 *
 * WHY BESIDE THE HARNESS. The seven file kinds of AGSC-07-12 are pinned byte for byte by
 * `compose-0027`, and the Harness archive by `compose-0016`; nothing in `harness.js` reads this
 * module (`tests/arch/brief.test.js`), and no blueprint file enters the Harness directory or its
 * archive.
 *
 * ONE SOURCE, THE BRIEF'S. Every line is read from what the brief already computes
 * (`brief.js#briefParts`): the listed members, the `relations` entries with their origin and
 * scope, the dependency order and the edges it is computed from. So a blueprint names only
 * listed items (AGSC-00-05), exactly as the brief does, and depends on the verdict, the graph,
 * the build instant and the selection digest alone: two builds write the same bytes.
 *
 * PORTABLE. Every function on `PORTABLE` is a self-contained declaration that names only other
 * portable functions of this module, `compose.js`, `harness.js` and `brief.js`, so
 * `composition/browser.js` emits its own source text for the `/compose/` page, which writes the
 * same bytes (AGSC-07-13; `tests/arch/composition-portable.test.js`).
 *
 * PURE: no file system, no clock, no network, no hashing; the options are the brief's, plus
 * `architecture`, the slug of the saved architecture.
 * Requirements: PRD-037.
 */

const { byCodePoint, compareCodePoint } = require('./compose.js');
const {
  dslIdentifier, fenceProse, licenceSentence, mermaidHead, pairs, provenanceHeader, quoted, singleLine,
  withoutTrailingFeeds,
} = require('./harness.js');
const { briefMember, briefParts, listedIndex } = require('./brief.js');

// ------------------------------------------------------------------ the inputs

/**
 * What every blueprint file is written from: the brief's parts, the architecture item as a
 * member record, the members by slug, and the wiring pairs of AGSC-07-23 between two members.
 * `null` when the architecture is not a listed item, because a blueprint would have to name it.
 */
function blueprintParts(result, options) {
  const listed = listedIndex(options);
  const item = listed.get(String(options.architecture));
  if (item === undefined) return null;
  const parts = briefParts(result, options);
  const inside = new Set(parts.record.selection);
  return {
    architecture: briefMember(String(options.architecture), item, []),
    bySlug: new Map(parts.members.map((m) => [m.slug, m])),
    edges: parts.edges,
    listed,
    record: parts.record,
    wiring: pairs(result || {}).filter((p) => inside.has(p.producer) && inside.has(p.consumer)),
  };
}

/** The distinct values of `list`, in code-point order. */
function distinctSorted(list) {
  return byCodePoint([...new Set(list)]);
}

/** A list of slugs as the Markdown files write it: each between backticks, joined by `, `. */
function slugList(slugs) {
  return slugs.map((slug) => `\`${slug}\``).join(', ');
}

/** The opening lines of a C4 file: the level, the four comment lines `diagram.mmd` opens with. */
function c4Head(level, options) {
  return [`%% ${level} (https://c4model.com/)`, ...mermaidHead(options), 'flowchart LR'];
}

/** One Mermaid node line, the identifier being the one `workspace.dsl` derives from the slug. */
function nodeLine(slug, indent) {
  return `${indent}${dslIdentifier(slug)}[${quoted(slug)}]`;
}

/**
 * The edges a C4 level draws: each `relations` entry of origin `authored` and scope `inside`,
 * then each wiring pair labelled `produces <port>`, whose ends `keep` admits — in the order of
 * `relations` and of AGSC-07-23.
 */
function c4Edges(parts, keep) {
  const lines = [];
  for (const r of parts.record.relations) {
    if (r.origin === 'authored' && r.scope === 'inside' && keep(r.source, r.target)) {
      lines.push(`  ${dslIdentifier(r.source)} -->|${r.key}| ${dslIdentifier(r.target)}`);
    }
  }
  for (const p of parts.wiring) {
    if (keep(p.producer, p.consumer)) lines.push(`  ${dslIdentifier(p.producer)} -->|produces ${p.port}| ${dslIdentifier(p.consumer)}`);
  }
  return lines;
}

/** The members of type `concept`, in dependency order. */
function conceptsOf(parts) {
  return parts.record.order.filter((slug) => parts.bySlug.get(slug).type === 'concept');
}

// ------------------------------------------------------------------ the files

/**
 * `c4-context.mmd`, level 1: the architecture as the node `system` and, as external nodes, the
 * listed items outside the selection that a member's `relations` entry of scope `outside`
 * reaches, by slug; one edge `system -->|<key>| <id>` for each distinct key from a member to
 * each of them, by slug and then key.
 */
function c4Context(parts, options) {
  const inside = new Set(parts.record.selection);
  const outward = parts.record.relations.filter((r) => r.scope === 'outside' && inside.has(r.source));
  const targets = distinctSorted(outward.map((r) => r.target));
  const lines = c4Head('C4 level 1, system context', options);
  lines.push(`  system[${quoted(singleLine(parts.architecture.title))}]`);
  for (const target of targets) lines.push(nodeLine(target, '  '));
  for (const target of targets) {
    for (const key of distinctSorted(outward.filter((r) => r.target === target).map((r) => r.key))) {
      lines.push(`  system -->|${key}| ${dslIdentifier(target)}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

/**
 * `c4-containers.mmd`, level 2: one subgraph named by the architecture's title, a node for each
 * Concept of the selection in dependency order, and the edges between two Concepts.
 */
function c4Containers(parts, options) {
  const concepts = conceptsOf(parts);
  const drawn = new Set(concepts);
  const lines = c4Head('C4 level 2, containers', options);
  lines.push(`  subgraph system[${quoted(singleLine(parts.architecture.title))}]`);
  for (const slug of concepts) lines.push(nodeLine(slug, '    '));
  lines.push('  end', ...c4Edges(parts, (a, b) => drawn.has(a) && drawn.has(b)));
  return `${lines.join('\n')}\n`;
}

/**
 * The Concept a member of another type is drawn inside at level 3: the code-point-least Concept
 * that an authored Link inside the selection joins it to, in either direction; `null` for none.
 */
function homeConcept(parts, slug, concepts) {
  const joined = [];
  for (const r of parts.record.relations) {
    if (r.origin !== 'authored' || r.scope !== 'inside') continue;
    if (r.source === slug && concepts.has(r.target)) joined.push(r.target);
    if (r.target === slug && concepts.has(r.source)) joined.push(r.source);
  }
  return joined.length === 0 ? null : distinctSorted(joined)[0];
}

/**
 * `c4-components.mmd`, level 3: each member that is not a Concept, inside the subgraph of its
 * Concept (`homeConcept`; the subgraphs in the dependency order of their Concepts, the subgraph
 * identifier being the Concept's identifier followed by `c`), the members with no Concept after
 * them, and the edges that have at least one such member as an end.
 */
function c4Components(parts, options) {
  const concepts = conceptsOf(parts);
  const others = parts.record.order.filter((slug) => parts.bySlug.get(slug).type !== 'concept');
  const drawn = new Set(others);
  const home = new Map(others.map((slug) => [slug, homeConcept(parts, slug, new Set(concepts))]));
  const lines = c4Head('C4 level 3, components', options);
  for (const concept of concepts) {
    const inner = others.filter((slug) => home.get(slug) === concept);
    if (inner.length === 0) continue;
    lines.push(`  subgraph ${dslIdentifier(concept)}c[${quoted(concept)}]`, ...inner.map((slug) => nodeLine(slug, '    ')), '  end');
  }
  for (const slug of others) if (home.get(slug) === null) lines.push(nodeLine(slug, '  '));
  lines.push(...c4Edges(parts, (a, b) => drawn.has(a) || drawn.has(b)));
  return `${lines.join('\n')}\n`;
}

/** The opening blocks of a Markdown blueprint file: provenance header, licence sentence, digest. */
function markdownOpening(options) {
  return [provenanceHeader(options), '', licenceSentence(options.licenseProse), '',
    `Selection digest: ${singleLine(options.selectionDigest)}`, ''];
}

/**
 * `decisions/NNNN-<slug>.md`: one MADR record (https://adr.github.io/madr/) for each distinct
 * listed target of a `decided-by` Link authored by a member, numbered from 0001 in code-point
 * order of the target's slug; its context names the members that cite it and quotes the
 * target's body, or its description where the body is empty, fenced as data (AGSC-01-29).
 *
 * @returns {Array<[string, string]>}
 */
function decisionFiles(parts, options) {
  const inside = new Set(parts.record.selection);
  const cited = parts.record.relations.filter((r) => r.key === 'decided-by' && r.origin === 'authored' && inside.has(r.source));
  return distinctSorted(cited.map((r) => r.target)).map((target, i) => {
    const decision = briefMember(target, parts.listed.get(target), []);
    const members = distinctSorted(cited.filter((r) => r.target === target).map((r) => r.source));
    const lines = ['---', 'status: accepted', `date: ${String(options.instant).slice(0, 10)}`, '---', '',
      `# ${singleLine(decision.title)}`, '', ...markdownOpening(options),
      '## Context and Problem Statement', '',
      `Members of this composition cite \`${target}\` as the decision behind them: ${slugList(members)}.`, '',
      fenceProse(decision.prose),
      '## Decision Outcome', '', `Chosen option: as recorded in \`${target}\`.`, '',
      '### Consequences', '', '_To be written._'];
    return [`blueprint/decisions/${String(i + 1).padStart(4, '0')}-${target}.md`, `${withoutTrailingFeeds(lines.join('\n'))}\n`];
  });
}

/** The listed items a member reaches by `key`, authored or computed, in code-point order. */
function reachedBy(parts, slug, keys, within) {
  return distinctSorted(parts.edges.filter((e) => e.source === slug && keys.indexOf(e.key) !== -1
    && e.target !== slug && (within === null || within.has(e.target))).map((e) => e.target));
}

/**
 * `build-plan.md`: one step for each member in dependency order, with the members it needs (its
 * predecessors of AGSC-07-26), the listed items that verify it, and the listed items it is
 * `blocked-by`, the last line only when there is one.
 */
function buildPlan(parts, options) {
  const inside = new Set(parts.record.selection);
  const lines = [`# Build plan — ${singleLine(parts.architecture.title)}`, '', ...markdownOpening(options), '## Steps', ''];
  parts.record.order.forEach((slug, i) => {
    const needs = reachedBy(parts, slug, ['requires', 'broader', 'derived-from'], inside);
    const checks = reachedBy(parts, slug, ['verified-by'], null);
    const blockers = reachedBy(parts, slug, ['blocked-by'], null);
    lines.push(`### Step ${i + 1} — adopt \`${slug}\``, '',
      `- Needs: ${needs.length === 0 ? 'nothing' : slugList(needs)}`,
      `- Verified by: ${checks.length === 0 ? 'no check authored' : slugList(checks)}`);
    if (blockers.length > 0) lines.push(`- Blocked by: ${slugList(blockers)}`);
    lines.push('');
  });
  return `${withoutTrailingFeeds(lines.join('\n'))}\n`;
}

/**
 * AGSC-07-29: the blueprint outputs of a saved architecture, paths relative to the directory
 * beside the Harness, in code-point order of the path. Empty when the architecture is not a
 * listed item. Whether to write them — `compose --from <slug> --brief` for an item of
 * `kind: architecture` — is the caller's decision.
 *
 * @param {object} result the verdict `compose.js#compose` returned for the saved selection.
 * @param {object} options as `brief.js#briefOf` takes them, and `architecture`, the item's slug.
 * @returns {Array<[string, string]>} path and text.
 */
function blueprintFiles(result, options) {
  const parts = blueprintParts(result, options);
  if (parts === null) return [];
  const files = [
    ['blueprint/build-plan.md', buildPlan(parts, options)],
    ['blueprint/c4-components.mmd', c4Components(parts, options)],
    ['blueprint/c4-containers.mmd', c4Containers(parts, options)],
    ['blueprint/c4-context.mmd', c4Context(parts, options)],
    ...decisionFiles(parts, options),
  ];
  return files.sort((a, b) => compareCodePoint(a[0], b[0]));
}

/** The portable surface, in dependency order (`composition/browser.js`, AGSC-07-13). */
const PORTABLE = Object.freeze(['blueprintParts', 'distinctSorted', 'slugList', 'c4Head', 'nodeLine',
  'c4Edges', 'conceptsOf', 'c4Context', 'c4Containers', 'homeConcept', 'c4Components', 'markdownOpening',
  'decisionFiles', 'reachedBy', 'buildPlan', 'blueprintFiles']);

module.exports = {
  PORTABLE,
  blueprintFiles,
  blueprintParts,
  buildPlan,
  c4Components,
  c4Containers,
  c4Context,
  c4Edges,
  c4Head,
  conceptsOf,
  decisionFiles,
  distinctSorted,
  homeConcept,
  markdownOpening,
  nodeLine,
  reachedBy,
  slugList,
};
