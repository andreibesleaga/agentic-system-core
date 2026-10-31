'use strict';
// CONTEXT Knowledge — the consequences of the graph, written by `export --closure`.
//
// Implements AGSC-05-37 (and AGSC-05-23: no reasoner runs at build). The graph files
// state only what the items say; this module computes what the OWL 2 RL rules entail
// from them, so that a person or a tool can read the consequences without the engine
// storing them anywhere. The result is derived data: a text for `dist/export/closure.nt`,
// never a route, never part of a build.
//
// LIBRARY. The rules are run by the `Reasoner` of `n3@2.7.12`, the library this engine
// already uses to read Turtle and N-Quads; nothing here is a hand-written reasoner. What
// is ours is only the rule list below, kept as DATA (`RULES`), and the mapping of the
// result to the file of AGSC-05-37.
//
// THE RL SUBSET is exactly the rules AGSC-05-37 names, of OWL 2 Profiles (2nd edition,
// W3C Recommendation, 11 December 2012, section 4.3): `prp-dom`, `prp-rng`, `prp-spo1`,
// `prp-symp`, `prp-inv1`, `prp-inv2`, `prp-trp` and `cax-sco`, applied until nothing new
// appears; `prp-irp` is a check only (`irreflexiveViolations`). No other rule is applied,
// which is why the engine does not claim to be a reasoner.
//
// WHY NOT SHARED WITH `derive.js`. `derive.js` (AGSC-05-33) computes the readings of the
// Link graph and must say WHY each holds: a list of steps, over the shortest chain, in a
// fixed order. The `Reasoner` returns triples and no derivation, so it cannot give those
// reasons; `derive.js` stays plain code, as AGSC-05-23 says. The two agree where they
// meet (inverses, symmetric partners): `tests/knowledge/closure.test.js` checks that a
// graph's own inverse and symmetric edges add nothing to its closure.
//
// PURE: texts in, a text and a list of warnings out; no fs, no clock, no network. The same
// inputs give the same bytes: the derived triples are de-duplicated and sorted by
// serialized bytes (AGSC-04-13) before they are written.

const N3 = require('n3');
const nq = require('./nquads.js');
const turtle = require('./turtle.js');

const { DataFactory } = N3;
const OWL = 'http://www.w3.org/2002/07/owl#';
const TYPE = nq.RDF_TYPE;
const SUB_CLASS = `${nq.RDFS}subClassOf`;
const SUB_PROPERTY = `${nq.RDFS}subPropertyOf`;
const DOMAIN = `${nq.RDFS}domain`;
const RANGE = `${nq.RDFS}range`;
const INVERSE_OF = `${OWL}inverseOf`;
const SYMMETRIC = `${OWL}SymmetricProperty`;
const TRANSITIVE = `${OWL}TransitiveProperty`;
const IRREFLEXIVE = `${OWL}IrreflexiveProperty`;

/** The code of an item that links to itself, which an irreflexive property used toward itself is. */
const IRREFLEXIVE_CODE = 'AGSC-E313';

/**
 * The rules, as data: a name from OWL 2 Profiles table 4.3, the triple patterns that must
 * all match (`if`) and the triple patterns that are then true (`then`). A term that starts
 * with `?` is a variable; every other term is an IRI.
 */
const RULES = Object.freeze([
  { name: 'prp-dom', if: [['?p', DOMAIN, '?c'], ['?x', '?p', '?y']], then: [['?x', TYPE, '?c']] },
  // For an object property only: a literal as the subject of a triple is never written,
  // so the consequences of a datatype property's range are dropped on the way out (`derived`).
  { name: 'prp-rng', if: [['?p', RANGE, '?c'], ['?x', '?p', '?y']], then: [['?y', TYPE, '?c']] },
  { name: 'prp-spo1', if: [['?p1', SUB_PROPERTY, '?p2'], ['?x', '?p1', '?y']], then: [['?x', '?p2', '?y']] },
  { name: 'prp-symp', if: [['?p', TYPE, SYMMETRIC], ['?x', '?p', '?y']], then: [['?y', '?p', '?x']] },
  { name: 'prp-inv1', if: [['?p1', INVERSE_OF, '?p2'], ['?x', '?p1', '?y']], then: [['?y', '?p2', '?x']] },
  { name: 'prp-inv2', if: [['?p1', INVERSE_OF, '?p2'], ['?x', '?p2', '?y']], then: [['?y', '?p1', '?x']] },
  { name: 'prp-trp', if: [['?p', TYPE, TRANSITIVE], ['?x', '?p', '?y'], ['?y', '?p', '?z']], then: [['?x', '?p', '?z']] },
  { name: 'cax-sco', if: [['?c1', SUB_CLASS, '?c2'], ['?x', TYPE, '?c1']], then: [['?x', TYPE, '?c2']] },
]);

/** One position of a pattern as an RDF/JS term: a variable, or a named node. */
function patternTerm(text) {
  return text.startsWith('?') ? DataFactory.variable(text.slice(1)) : DataFactory.namedNode(text);
}

/** The rules in the shape `Reasoner#reason` takes: `{ premise, conclusion }` of triple patterns. */
function reasonerRules() {
  const pattern = ([s, p, o]) => DataFactory.quad(patternTerm(s), patternTerm(p), patternTerm(o));
  return RULES.map((rule) => ({ premise: rule.if.map(pattern), conclusion: rule.then.map(pattern) }));
}

/** An n3 term as a term of this engine's writer; `null` for a blank node, which is never written. */
function ownTerm(term) {
  if (term.termType === 'NamedNode') return nq.iri(term.value);
  if (term.termType !== 'Literal') return null;
  return term.language ? nq.literal(term.value, { lang: term.language }) : nq.literal(term.value, { datatype: term.datatype.value });
}

/** A quad of the store as `[subject, predicate, object]` in this engine's terms; `null` with a blank node. */
function ownTriple(q) {
  const terms = [q.subject, q.predicate, q.object].map(ownTerm);
  return terms.includes(null) ? null : terms;
}

/** The triple without its graph, as a string that is the same for the same triple. */
const tripleKey = (terms) => terms.map(nq.nquadsTerm).join(' ');

/** Every quad of the given texts, in one store and in the default graph, so a rule joins across them. */
function loadStore(graphQuads, vocabularyQuads) {
  const store = new N3.Store();
  for (const q of [...graphQuads, ...vocabularyQuads]) {
    store.add(DataFactory.quad(q.subject, q.predicate, q.object));
  }
  return store;
}

/**
 * AGSC-05-37 `prp-irp`: each use of an irreflexive property by one item toward itself, as the
 * warning `AGSC-E313`, in code-point order of property then item. No triple follows from it.
 */
function irreflexiveViolations(store) {
  const found = [];
  for (const typing of store.getQuads(null, DataFactory.namedNode(TYPE), DataFactory.namedNode(IRREFLEXIVE))) {
    for (const use of store.getQuads(null, typing.subject, null)) {
      if (use.subject.equals(use.object)) found.push(`${use.predicate.value}\u0000${use.subject.value}`);
    }
  }
  return [...new Set(found)].sort().map((entry) => {
    const [property, item] = entry.split('\u0000');
    return {
      code: IRREFLEXIVE_CODE,
      severity: 'warn',
      message: `${item} uses the irreflexive property ${property} toward itself (AGSC-05-37, prp-irp)`,
    };
  });
}

/** The triples of the closed store that were not in the inputs, as quads of the Bundle's graph. */
function derived(store, held, graph) {
  const out = [];
  for (const q of store.getQuads(null, null, null, null)) {
    const terms = ownTriple(q);
    // A blank node or a literal subject cannot be written (AGSC-05-08, AGSC-05-37).
    if (terms === null || terms[0].termType === 'literal') continue;
    if (!held.has(tripleKey(terms))) out.push(nq.quad(...terms, graph));
  }
  return out;
}

/**
 * The closure of a graph under the RL subset of AGSC-05-37.
 *
 * @param {string} nquadsText the text of `graph.nq`
 * @param {string[]} vocabularies Turtle texts of the vocabulary files in force
 * @returns {{text: string, warnings: Array<{code: string, severity: string, message: string}>}}
 *   `text` is the N-Quads of `closure.nt`: every entailed triple that `graph.nq` and the
 *   vocabularies do not hold, in the named graph of the Bundle, sorted, one LF at the end
 *   (empty when nothing is entailed); `warnings` are the `prp-irp` findings.
 */
function closure(nquadsText, vocabularies = []) {
  const graphQuads = turtle.parse(nquadsText, { format: 'N-Quads' });
  const bundleGraph = graphQuads.find((q) => q.graph.termType === 'NamedNode');
  const store = loadStore(graphQuads, vocabularies.flatMap((text) => turtle.parse(text)));
  const held = new Set(store.getQuads(null, null, null, null).map(ownTriple).filter(Boolean).map(tripleKey));
  new N3.Reasoner(store).reason(reasonerRules());
  const graph = bundleGraph === undefined ? null : nq.iri(bundleGraph.graph.value);
  return {
    text: graph === null ? '' : nq.serialize(derived(store, held, graph)),
    warnings: irreflexiveViolations(store),
  };
}

module.exports = { RULES, closure };
