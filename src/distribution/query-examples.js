'use strict';
// CONTEXT Distribution (Emission) — what the examples and the vocabulary of `/query/` say
// for one node (AGSC-06-39 (b), (f)).
//
// THE TEN QUESTIONS. Each question of AGSC-05-34 is defined by a SPARQL text with up to three
// placeholders: `?x`, the item asked about; `<S...>`, a selection of items; `"T"`, an instant.
// As published, question 4 does not parse (a data block cannot hold the variable `?x`) and
// question 9 answers nothing (`"T"` is no date), so the page fills them in from the node
// itself, and says which values it put in (`exampleNote`):
//   * `?x` is the first item, in code-point order of its slug, that the question has something
//     to say about (an item with a link of the question's key, a cluster with something under
//     it, an item with consumed names or with sources), else the node's first item;
//   * for question 4, `<S...>` is at most three other items that produce a name `?x` consumes;
//   * for question 9, `<S...>` is the first four items that are deprecated, draft, retired or
//     stale at the build's instant and the first item that is none of these, and `"T"` is that
//     instant.
// The choice reads only the items and the instant, never their order (AGSC-04-02), and a
// test runs each filled query with the engine the page ships and compares its rows with the
// question's own function (`knowledge/questions.js`), so the example and the function
// cannot drift apart (`tests/distribution/query-examples.test.js`).
//
// THE NODE'S OWN. A node that declares competency questions (AGSC-05-41) has them offered
// after the ten, as its file states them (`siteQuestions`); a node with a site vocabulary
// (AGSC-05-38) has its classes and relations listed after the fourteen (`siteTerms`). A file
// that is not of the right shape gives nothing here: `lint`, `verify` and `ci` report it.
//
// Pure: items, texts and the vocabulary model in, plain values out; no I/O.

const links = require('../knowledge/links.js');
const questions = require('../knowledge/questions.js');
const { isValid: isSlug } = require('../knowledge/slug.js');
const { compareCodePoint } = require('../shared/ordering.js');

const OWL = 'http://www.w3.org/2002/07/owl#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const SKOS_DEFINITION = 'http://www.w3.org/2004/02/skos/core#definition';
const DCTERMS_TITLE = 'http://purl.org/dc/terms/title';

/** The questions whose subject is fit when it is the source of an edge of one of these keys. */
const EDGE_KEYS = Object.freeze({
  1: ['requires'], 2: ['excludes'], 3: ['superseded-by'], 5: ['verifies', 'verified-by'], 6: ['blocked-by'], 7: ['derived-from'],
});
/** How many items the selection of question 4 and question 9 names at most. */
const PRODUCERS_SHOWN = 3;
const REASONS_SHOWN = 4;

const listOf = (item, key) => (Array.isArray(item[key]) ? item[key] : []);

/** The slugs `?x` may be for each question with a subject, by question number, as sets. */
function fitSubjects(items) {
  const edges = links.resolve(items).edges;
  const sources = (keys) => new Set(edges.filter((e) => keys.includes(e.key)).map((e) => e.source));
  const fit = Object.fromEntries(Object.entries(EDGE_KEYS).map(([n, keys]) => [n, sources(keys)]));
  const clusters = new Set(items.filter((i) => i.type === 'cluster').map((i) => i.slug));
  fit[4] = new Set(items.filter((i) => listOf(i, 'consumes').length > 0).map((i) => i.slug));
  fit[8] = new Set([...items.flatMap((i) => listOf(i, 'clusters')),
    ...edges.filter((e) => e.key === 'broader' && clusters.has(e.source)).map((e) => e.target)].filter((s) => clusters.has(s)));
  fit[10] = new Set(items.filter((i) => listOf(i, 'sources').length > 0).map((i) => i.slug));
  return fit;
}

/** Question 4's selection: at most three other items that produce a name the subject consumes. */
function producersFor(items, subject) {
  const wanted = new Set(listOf(items.find((i) => i.slug === subject), 'consumes'));
  return items.filter((i) => i.slug !== subject && listOf(i, 'produces').some((name) => wanted.has(name)))
    .map((i) => i.slug).slice(0, PRODUCERS_SHOWN);
}

/**
 * The values each of the ten questions is asked with on this node.
 *
 * @param {Array<{slug:string, type:string}>} items the items of the published projection (AGSC-06-30)
 * @param {string} at the build's instant (AGSC-04-09)
 * @returns {Array<{number:number, subject:(string|null), selection:string[], at:(string|null), fits:boolean}>}
 *   `fits` says whether the node has an item the question has something to say about; with no
 *   item at all, `subject` is null and the defining text is shown as published.
 */
function exampleValues(items, at) {
  const sorted = [...items].filter((i) => typeof i.slug === 'string').sort((a, b) => compareCodePoint(a.slug, b.slug));
  const first = sorted.length > 0 ? sorted[0].slug : null;
  const fit = fitSubjects(sorted);
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((number) => {
    if (first === null) return { at: null, fits: false, number, selection: [], subject: null };
    if (number === 9) {
      // AGSC-02-11, AGSC-02-23: the question's own function says which items have a reason.
      const reasons = new Set(questions.unhealthy(sorted, sorted.map((i) => i.slug), at).map((entry) => entry.slug));
      const [unhealthy, healthy] = [true, false].map((want) => sorted.filter((i) => reasons.has(i.slug) === want).map((i) => i.slug));
      return { at, fits: unhealthy.length > 0, number, selection: [...unhealthy.slice(0, REASONS_SHOWN), ...healthy.slice(0, 1)], subject: null };
    }
    const found = sorted.find((i) => fit[number].has(i.slug));
    const subject = found === undefined ? first : found.slug;
    return { at: null, fits: found !== undefined, number, selection: number === 4 ? producersFor(sorted, subject) : [], subject };
  });
}

/**
 * The text of one question with its values put in, after the prologue of the prefixes; the
 * defining text as published when the node has no item.
 *
 * @param {{sparql:string}} question one entry of `docs/ontology-questions.json`
 * @param {string[]} prefixes the prefixes of that file (`asc: <…>`)
 * @param {object} values one entry of `exampleValues`
 * @param {function(string):string} iriOf the IRI of an item by its slug (AGSC-05-01)
 * @returns {string}
 */
function exampleText(question, prefixes, values, iriOf) {
  const prologue = prefixes.map((p) => `PREFIX ${p}`).join('\n');
  if (values.subject === null && values.at === null) return `${prologue}\n${question.sparql}`;
  // Each value is put in by a function, so no `$` in an IRI is read as a replacement pattern.
  const subject = values.subject === null ? '?x' : `<${iriOf(values.subject)}>`;
  const selection = values.selection.map((one) => `<${iriOf(one)}>`).join(' ');
  const filled = question.sparql.replace(/\?x\b/gu, () => subject).replace('<S...>', () => selection)
    .replace('"T"', () => `"${values.at}"`);
  return `${prologue}\n${filled}`;
}

/**
 * The sentence under an example that says which values were put in (plain text; the caller escapes it).
 *
 * @param {object} values one entry of `exampleValues`
 * @param {function(string):string} titleOf an item's title by its slug
 * @returns {string}
 */
function exampleNote(values, titleOf) {
  if (values.subject === null && values.at === null) {
    return 'This node has no item yet: put your own in place of ?x, <S...> and "T" before you run the query.';
  }
  const named = (slug) => `“${titleOf(slug)}” (${slug})`;
  const parts = [
    ...(values.subject === null ? [] : [`?x is ${named(values.subject)}`]),
    ...(values.number === 4 || values.number === 9 ? [`<S...> is ${values.selection.length === 0 ? 'empty' : values.selection.map(named).join(', ')}`] : []),
    ...(values.at === null ? [] : [`"T" is ${values.at}, the instant of this build`]),
  ];
  const empty = values.fits ? '' : ' No item of this node has what this question asks about, so the answer is empty.';
  return `Filled in from this node: ${parts.join('; ')}.${empty}`;
}

/**
 * AGSC-05-41: the competency questions of a node, in the order of its file, as `{id, query,
 * question}`. The file is read for its shape only — a JSON array of objects whose `id` is a
 * slug and whose `query` and `question` are strings, no `id` twice — and gives nothing
 * otherwise; the id names elements of the page, so nothing else may reach an attribute. Its SPARQL
 * is not parsed here: the build never reaches the SPARQL parser or engine
 * (`tests/arch/sparql-library.test.js`); `lint`, `verify` and `ci` report a faulty file.
 *
 * @param {string|null|undefined} text the JSON at `domain.questions`
 * @returns {Array<{id:string, query:string, question:string}>}
 */
function siteQuestions(text) {
  let array;
  try {
    array = JSON.parse(String(text));
  } catch {
    return [];
  }
  const fit = (entry) => entry !== null && typeof entry === 'object' && ['id', 'query', 'question'].every((key) => typeof entry[key] === 'string')
    && isSlug(entry.id);
  if (!Array.isArray(array) || !array.every(fit) || new Set(array.map((entry) => entry.id)).size !== array.length) return [];
  return array.map(({ id, query, question }) => ({ id, query, question }));
}

/**
 * AGSC-05-38: the classes and the relations a site vocabulary defines — the terms it gives an
 * `rdfs:label` (rule (d)) and types `owl:Class` or `owl:ObjectProperty`; a declaration of
 * another vocabulary's term (AGSC-05-25) carries no label — each with its label, its parents
 * (`rdfs:subClassOf`, `rdfs:subPropertyOf`), its inverse and its meaning (`skos:definition`,
 * else `rdfs:comment`), in code-point order of the IRI.
 *
 * @param {object|null} model the site vocabulary as `knowledge/domain.js#load` reads it
 * @returns {null|{ontology:{iri:string, label:(string|null)}|null, classes:object[], relations:object[]}}
 */
function siteTerms(model) {
  if (model === null || model === undefined) return null;
  const bySubject = new Map();
  for (const [s, p, o] of model.triples) {
    if (!bySubject.has(s.value)) bySubject.set(s.value, []);
    bySubject.get(s.value).push([p.value, o.value]);
  }
  const values = (iri, predicate) => (bySubject.get(iri) || []).filter(([p]) => p === predicate).map(([, o]) => o).sort(compareCodePoint);
  const one = (iri, ...predicates) => predicates.map((p) => values(iri, p)[0]).find((v) => v !== undefined) || null;
  const typed = (type) => [...bySubject.keys()].sort(compareCodePoint)
    .filter((iri) => values(iri, RDF_TYPE).includes(type) && one(iri, `${RDFS}label`) !== null);
  const term = (iri, parent) => ({ iri, label: one(iri, `${RDFS}label`), meaning: one(iri, SKOS_DEFINITION, `${RDFS}comment`), parents: values(iri, parent) });
  return {
    classes: typed(`${OWL}Class`).map((iri) => term(iri, `${RDFS}subClassOf`)),
    ontology: model.ontology === null ? null : { iri: model.ontology, label: one(model.ontology, `${RDFS}label`, DCTERMS_TITLE) },
    relations: typed(`${OWL}ObjectProperty`).map((iri) => ({ inverse: one(iri, `${OWL}inverseOf`), ...term(iri, `${RDFS}subPropertyOf`) })),
  };
}

module.exports = { exampleNote, exampleText, exampleValues, siteQuestions, siteTerms };
