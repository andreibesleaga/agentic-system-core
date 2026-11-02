'use strict';
// CONTEXT Knowledge — the site vocabulary of the domain layer, and the `domain` object that names it.
//
// Implements AGSC-05-38 (the rules (a) to (g) a site vocabulary file meets; a violation is
// `AGSC-E420`), the reading half of AGSC-05-39 (which class a `domain_type` names, which
// property a member of `domain_links` names, and which edge the vocabulary materialises for it),
// the name resolution of AGSC-02-25 and AGSC-03-27 (the namespace of the item's context,
// AGSC-08-32, else the site namespace), and the faults of the `domain` object of AGSC-01-41.
//
// WHY. A node may describe its own field with classes and relations of its own. A reader that
// knows only this specification must still understand every note, so each site class is a
// subclass of exactly one of the six item classes and each site property a sub-property of one
// of the fourteen link properties, stated in the file, and the file is published with the graph
// (`nquads.js#dataset` writes `triples`). The file stays inside OWL 2 RL, so the closure of
// AGSC-05-37 reads it with the rules it already runs.
//
// LIBRARY. Turtle is read by the pinned `n3` through `turtle.js#parse`; nothing here parses.
// What is ours is the rule list below and the model the graph writer reads.
//
// TWO COPIES OF THE RULES, ON PURPOSE. `tools/validate-ontology` applies the same rules to the
// same file and must stay standalone (AGSC-09-90: no import from `src/`). The parity test
// `tests/tools/validate-ontology-parity.test.js` checks that the two give the same findings,
// code and message, on every shared fixture; change both or neither.
//
// PURE: texts and plain objects in, findings and a frozen model out; no fs, no clock, no network.

const nq = require('./nquads.js');
const turtle = require('./turtle.js');
const skos = require('./skos.js');
const { RELATIONS } = require('./relations.js');
const { finding } = require('./validate.js');
const { compareCodePoint } = require('./unicode.js');
const { withoutTrailingSlashes } = require('../shared/trailing.js');

const { NS, RDF, RDFS, SKOS, DCTERMS, PROV, XSD, RDF_TYPE } = nq;
const OWL = 'http://www.w3.org/2002/07/owl#';
const VANN = 'http://purl.org/vocab/vann/';
const CODE = 'AGSC-E420';

/** AGSC-05-38 (e): the six item classes, in the order of AGSC-01-02. */
const ITEM_CLASSES = Object.freeze(['concept', 'lesson', 'episode', 'procedure', 'cluster', 'gate'].map(skos.classOf));

/** AGSC-05-38 (f): the fourteen link properties of AGSC-03-01, from the relation table. */
const LINK_PROPERTIES = Object.freeze(RELATIONS.map((r) => {
  const colon = r.property.indexOf(':');
  return `${nq.PREFIXES[r.property.slice(0, colon)]}${r.property.slice(colon + 1)}`;
}));

/** AGSC-05-38 (c): the predicates a site vocabulary may use (those of AGSC-05-22 less domain and range). */
const PREDICATES = Object.freeze(new Set([
  `${RDF}type`, `${RDFS}label`, `${RDFS}comment`, `${RDFS}seeAlso`, `${RDFS}isDefinedBy`,
  `${RDFS}subClassOf`, `${RDFS}subPropertyOf`,
  ...['deprecated', 'disjointWith', 'equivalentClass', 'equivalentProperty', 'imports', 'inverseOf',
    'propertyDisjointWith', 'versionIRI', 'versionInfo'].map((local) => `${OWL}${local}`),
  ...['title', 'description', 'created', 'modified', 'issued', 'creator', 'publisher', 'license',
    'isReplacedBy'].map((local) => `${DCTERMS}${local}`),
  `${VANN}preferredNamespacePrefix`, `${VANN}preferredNamespaceUri`, `${SKOS}definition`,
]));

/** The property characteristics AGSC-05-38 (c) admits as `rdf:type` objects. */
const CHARACTERISTICS = Object.freeze(['SymmetricProperty', 'AsymmetricProperty', 'IrreflexiveProperty',
  'TransitiveProperty', 'FunctionalProperty', 'InverseFunctionalProperty'].map((local) => `${OWL}${local}`));

/** AGSC-05-38 (c): the `rdf:type` objects a site vocabulary may use. */
const TYPES = Object.freeze(new Set([`${OWL}Class`, `${OWL}ObjectProperty`, `${OWL}Ontology`,
  `${OWL}AnnotationProperty`, ...CHARACTERISTICS]));

/** A term typed with one of these is a property, whether or not (f) then accepts it. */
const PROPERTY_TYPES = Object.freeze(new Set([`${OWL}ObjectProperty`, `${OWL}AnnotationProperty`,
  `${OWL}DatatypeProperty`, ...CHARACTERISTICS]));

/** AGSC-05-25: the one type triple a file may state about an entity of another vocabulary it names. */
const DECLARATIONS = Object.freeze(new Set([`${OWL}Class`, `${OWL}AnnotationProperty`, `${OWL}ObjectProperty`]));

/** AGSC-05-38 (b): the namespaces no term of a site vocabulary may be defined in. */
const FORBIDDEN = Object.freeze([NS, OWL, RDF, RDFS, SKOS, DCTERMS, PROV, XSD]);

/** The predicates whose object is a class, which the file declares (AGSC-05-25). */
const CLASS_POSITIONS = Object.freeze(new Set([`${RDFS}subClassOf`, `${OWL}disjointWith`, `${OWL}equivalentClass`]));

/** AGSC-05-38 (g): the two predicates a site property never carries. */
const DOMAIN_RANGE = Object.freeze(new Set([`${RDFS}domain`, `${RDFS}range`]));

/** OWL 2 Profiles section 4.2: the datatypes of OWL 2 RL (`rdf:langString` is a tagged `rdf:PlainLiteral`). */
const RL_DATATYPES = Object.freeze(new Set([
  `${RDF}PlainLiteral`, `${RDF}XMLLiteral`, `${RDF}langString`, `${RDFS}Literal`,
  ...['decimal', 'integer', 'nonNegativeInteger', 'nonPositiveInteger', 'positiveInteger', 'negativeInteger',
    'long', 'int', 'short', 'byte', 'unsignedLong', 'unsignedInt', 'unsignedShort', 'unsignedByte', 'float',
    'double', 'string', 'normalizedString', 'token', 'language', 'Name', 'NCName', 'NMTOKEN', 'boolean',
    'hexBinary', 'base64Binary', 'anyURI', 'dateTime', 'dateTimeStamp'].map((local) => `${XSD}${local}`),
]));

/** AGSC-01-19: the default of `build.out`, under which no file of the domain layer may lie. */
const DEFAULT_OUT = 'www';

// ---------------------------------------------------------------- the index of a file

/** Every node reachable upward from `start` through the edges of `parents`. */
function ancestors(start, parents) {
  const seen = new Set();
  const stack = [start];
  while (stack.length > 0) {
    for (const parent of parents.get(stack.pop()) || []) {
      if (!seen.has(parent)) {
        seen.add(parent);
        stack.push(parent);
      }
    }
  }
  return seen;
}

/** The statements of a parsed file, by subject, with the type and the two hierarchies indexed. */
function indexOf(quads) {
  const bySubject = new Map();
  const types = new Map();
  const superClasses = new Map();
  const superProperties = new Map();
  const add = (map, key, value) => (map.has(key) ? map.get(key) : map.set(key, new Set()).get(key)).add(value);
  for (const q of quads) {
    if (q.subject.termType !== 'NamedNode') continue;
    const s = q.subject.value;
    if (!bySubject.has(s)) bySubject.set(s, []);
    bySubject.get(s).push(q);
    if (q.object.termType !== 'NamedNode') continue;
    if (q.predicate.value === RDF_TYPE) add(types, s, q.object.value);
    if (q.predicate.value === `${RDFS}subClassOf`) add(superClasses, s, q.object.value);
    if (q.predicate.value === `${RDFS}subPropertyOf`) add(superProperties, s, q.object.value);
  }
  const typesOf = (iri) => types.get(iri) || new Set();
  const ontologies = [...bySubject.keys()].filter((s) => typesOf(s).has(`${OWL}Ontology`)).sort(compareCodePoint);
  return { bySubject, ontologies, superClasses, superProperties, typesOf };
}

/** AGSC-05-38 (a): the site namespace — the IRI of the one ontology followed by `#` — or `null`. */
function namespaceOf(index) {
  if (index.ontologies.length !== 1 || /[#/]$/u.test(index.ontologies[0])) return null;
  return `${index.ontologies[0]}#`;
}

/** The namespaces of the contexts `domain.contexts` declares (AGSC-08-32). */
function contextNamespaces(contexts) {
  return (Array.isArray(contexts) ? contexts : [])
    .map((entry) => entry && entry.namespace).filter((value) => typeof value === 'string');
}

// ---------------------------------------------------------------- the rules (a) to (g)

/** (a): LF line endings and NFC text. UTF-8 is the port's to refuse (AGSC-01-14). */
function encodingFaults(text, fault) {
  if (text.includes('\r')) fault('(a)', 'the site vocabulary has CR line endings; it uses LF');
  if (text.normalize('NFC') !== text) fault('(a)', 'the site vocabulary is not NFC');
}

/** (a): no blank node, and exactly one ontology whose IRI does not end in `#` or `/`. */
function shapeFaults(quads, index, fault) {
  const blank = new Set();
  for (const q of quads) {
    for (const term of [q.subject, q.object]) if (term.termType === 'BlankNode') blank.add(term.value);
  }
  if (blank.size > 0) fault('(a)', `the site vocabulary holds ${blank.size} blank node(s); it is blank-node-free (AGSC-05-08)`);
  if (index.ontologies.length !== 1) {
    fault('(a)', `the site vocabulary declares ${index.ontologies.length} owl:Ontology; it declares exactly one`);
  } else if (namespaceOf(index) === null) {
    fault('(a)', `the ontology IRI <${index.ontologies[0]}> ends in "#" or "/"; the site namespace is that IRI followed by "#"`);
  }
}

/** (c) and (g): each statement's predicate, type and literal datatype; the declarations of AGSC-05-25. */
function statementFaults(index, fault) {
  const undeclared = new Map();
  const declaredAs = (iri, types) => [...index.typesOf(iri)].some((type) => types.has(type));
  for (const [s, quads] of index.bySubject) {
    for (const { predicate, object } of quads) {
      const p = predicate.value;
      if (DOMAIN_RANGE.has(p)) fault('(g)', `<${s}> declares <${p}>; a property of the site vocabulary declares no domain and no range`);
      else if (!PREDICATES.has(p)) fault('(c)', `the predicate <${p}> on <${s}> is not one the site vocabulary may use`);
      if (p === RDF_TYPE && object.termType === 'NamedNode' && !TYPES.has(object.value)) {
        fault('(c)', `<${s}> is declared a <${object.value}>, which the site vocabulary may not use`);
      }
      if (object.termType === 'Literal' && !index.ontologies.includes(s) && !RL_DATATYPES.has(object.datatype.value)) {
        fault('(c)', `a literal on <${s}> has the datatype <${object.datatype.value}>, which is not an OWL 2 RL datatype`);
      }
      if (![RDF, RDFS, OWL].some((ns) => p.startsWith(ns)) && !declaredAs(p, PROPERTY_TYPES)) {
        undeclared.set(p, `the annotation property <${p}> is used and not declared (owl:AnnotationProperty) in the file (AGSC-05-25)`);
      }
      if (CLASS_POSITIONS.has(p) && object.termType === 'NamedNode' && !index.typesOf(object.value).has(`${OWL}Class`)) {
        undeclared.set(object.value, `<${object.value}> is used as a class and not declared (owl:Class) in the file (AGSC-05-25)`);
      }
    }
  }
  for (const iri of [...undeclared.keys()].sort(compareCodePoint)) fault('(c)', undeclared.get(iri));
}

/** The subjects the file defines: all but the ontology and the declarations of other vocabularies' entities. */
function definedTerms(index, own) {
  return [...index.bySubject.keys()].sort(compareCodePoint).filter((s) => {
    if (index.ontologies.includes(s)) return false;
    const quads = index.bySubject.get(s);
    const declaration = quads.length === 1 && quads[0].predicate.value === RDF_TYPE && DECLARATIONS.has(quads[0].object.value);
    return own(s) || !declaration;
  });
}

/** (b), (d), (e) and (f), for each term the file defines. */
function termFaults(index, contexts, fault) {
  const namespace = namespaceOf(index);
  const allowed = [...(namespace === null ? [] : [namespace]), ...contextNamespaces(contexts)];
  const own = (s) => allowed.some((ns) => s.startsWith(ns)) && !FORBIDDEN.some((ns) => s.startsWith(ns));
  for (const term of definedTerms(index, own)) {
    if (FORBIDDEN.some((ns) => term.startsWith(ns)) || (namespace !== null && !own(term))) {
      fault('(b)', `<${term}> is defined outside the site namespace and the namespaces of the declared contexts, or in a namespace it may not extend`);
      continue;
    }
    const types = index.typesOf(term);
    if (!index.bySubject.get(term).some((q) => q.predicate.value === `${RDFS}label`)) fault('(d)', `<${term}> has no rdfs:label`);
    const isClass = types.has(`${OWL}Class`);
    const isProperty = [...types].some((type) => PROPERTY_TYPES.has(type));
    if (!isClass && !isProperty) fault('(e), (f)', `<${term}> is neither a class nor a property; a site vocabulary defines classes and object properties`);
    if (isClass) {
      const count = [...ancestors(term, index.superClasses)].filter((c) => ITEM_CLASSES.includes(c)).length;
      if (count !== 1) fault('(e)', `<${term}> is a subclass of ${count} of the six item classes; it is a subclass of exactly one`);
    }
    if (isProperty && !(types.has(`${OWL}ObjectProperty`)
        && [...ancestors(term, index.superProperties)].some((p) => LINK_PROPERTIES.includes(p)))) {
      fault('(f)', `<${term}> is not an owl:ObjectProperty that is a sub-property of one of the fourteen link properties`);
    }
  }
}

/**
 * AGSC-05-38: the faults of a site vocabulary file, each the error `AGSC-E420` on the file, its
 * message naming the rule it breaks. A text that is not Turtle is one finding, and nothing else
 * is judged. The findings are sorted by message, so the same text gives the same list.
 *
 * @param {string} text the file's text, as the FileSystem port read it
 * @param {{file?: string, contexts?: Array<{cluster: string, namespace: string}>}} [options]
 *   `file` the path the findings name; `contexts` `domain.contexts`, whose namespaces admit terms (b)
 * @returns {Array<object>} findings
 */
function check(text, options = {}) {
  const findings = [];
  const fault = (rule, message) => findings.push(finding(CODE, `${message} (AGSC-05-38 ${rule})`, { file: options.file || '' }));
  encodingFaults(text, fault);
  let quads;
  try {
    quads = turtle.parse(text);
  } catch (e) {
    fault('(a)', `the site vocabulary is not well-formed Turtle: ${e.message}`);
    quads = null;
  }
  if (quads !== null) {
    const index = indexOf(quads);
    shapeFaults(quads, index, fault);
    statementFaults(index, fault);
    termFaults(index, options.contexts, fault);
  }
  return findings.sort((a, b) => compareCodePoint(a.message, b.message));
}

// ---------------------------------------------------------------- the model

/** One RDF/JS term of the file as a term of this engine's writer (`nquads.js`). */
function ownTerm(term) {
  if (term.termType === 'NamedNode') return nq.iri(term.value);
  return term.language ? nq.literal(term.value, { lang: term.language }) : nq.literal(term.value, { datatype: term.datatype.value });
}

/** `owl:inverseOf` read in both directions: a property and the one its edge runs back as. */
function inversesOf(quads) {
  const inverse = new Map();
  const pairs = quads.filter((q) => q.predicate.value === `${OWL}inverseOf` && q.object.termType === 'NamedNode')
    .map((q) => [q.subject.value, q.object.value])
    .sort((a, b) => compareCodePoint(a[0], b[0]) || compareCodePoint(a[1], b[1]));
  for (const [a, b] of pairs) {
    if (!inverse.has(a)) inverse.set(a, b);
    if (!inverse.has(b)) inverse.set(b, a);
  }
  return inverse;
}

/**
 * The site vocabulary as the graph writer and the item checks read it (AGSC-05-38, AGSC-05-39).
 * `null` for a text that is not Turtle (`check` reports it). A statement with a blank node is
 * left out of `triples` (the dataset is blank-node-free, AGSC-05-08; `check` reports it).
 *
 * @param {string} text the file's text
 * @param {{contexts?: Array<{cluster: string, namespace: string}>}} [options] `domain.contexts`
 * @returns {null|{ontology: string|null, namespace: string|null, triples: Array<Array<object>>,
 *   contextOf: Function, classFor: Function, propertyFor: Function}}
 */
function load(text, options = {}) {
  let quads;
  try {
    quads = turtle.parse(text);
  } catch {
    return null;
  }
  const named = quads.filter((q) => q.subject.termType !== 'BlankNode' && q.object.termType !== 'BlankNode');
  const index = indexOf(named);
  const namespace = namespaceOf(index);
  const inverse = inversesOf(named);
  const contexts = new Map((Array.isArray(options.contexts) ? options.contexts : [])
    .filter((entry) => entry && typeof entry.cluster === 'string' && typeof entry.namespace === 'string')
    .map((entry) => [entry.cluster, entry.namespace]));

  /** AGSC-08-32: the declared context named by `domain_context`, else that of the primary cluster, else none. */
  const contextOf = (item) => {
    if (typeof item.domain_context === 'string' && contexts.has(item.domain_context)) return item.domain_context;
    const primary = Array.isArray(item.clusters) ? item.clusters[0] : undefined;
    return contexts.has(primary) ? primary : null;
  };
  /** AGSC-02-25 / AGSC-03-27: a local name in the item's context namespace, else in the site namespace. */
  const iriFor = (item, local) => {
    const context = contextOf(item);
    const base = context === null ? namespace : contexts.get(context);
    return base === null || typeof local !== 'string' ? null : `${base}${local}`;
  };
  const classFor = (item) => {
    const iri = iriFor(item, item.domain_type);
    return iri !== null && index.typesOf(iri).has(`${OWL}Class`) ? iri : null;
  };
  const propertyFor = (item, name) => {
    const iri = iriFor(item, name);
    if (iri === null || !index.typesOf(iri).has(`${OWL}ObjectProperty`)) return null;
    return {
      conceptOnly: [...ancestors(iri, index.superProperties)].some((p) => skos.isSemanticRelation(p)),
      inverse: inverse.get(iri) || null,
      iri,
      symmetric: index.typesOf(iri).has(`${OWL}SymmetricProperty`),
    };
  };
  return Object.freeze({
    classFor,
    contextOf,
    namespace,
    ontology: index.ontologies.length === 1 ? index.ontologies[0] : null,
    propertyFor,
    triples: Object.freeze(named.map((q) => Object.freeze([ownTerm(q.subject), ownTerm(q.predicate), ownTerm(q.object)]))),
  });
}

// ---------------------------------------------------------------- AGSC-01-41

/** Is `path` the directory `dir` or under it, compared ASCII case-insensitively as AGSC-01-19 does? */
function under(path, dir) {
  const p = path.toLowerCase();
  const d = withoutTrailingSlashes(dir).toLowerCase();
  return p === d || p.startsWith(`${d}/`);
}

/**
 * AGSC-01-41 (with AGSC-08-32): the faults of the `domain` object that the schema cannot see —
 * a file path under `content/`, `dist/` or `build.out` (`AGSC-E204`), a context for a slug that
 * is no cluster item (`AGSC-E301`), and a repeated cluster or namespace, or a namespace that is
 * the vocabulary namespace of AGSC-05-02 (`AGSC-E209`). A configuration with no `domain` object
 * has none. A named file that is absent is the loader's `AGSC-E901`.
 *
 * @param {object} config the configuration
 * @param {{items?: Array<{slug: string, type: string}>}} [options] the items of the Bundle
 * @returns {Array<object>} findings on `agsc.config.json`, in the order of the object
 */
function configFindings(config, options = {}) {
  const object = config && config.domain;
  if (object === null || typeof object !== 'object' || Array.isArray(object)) return [];
  const findings = [];
  const fault = (code, key, message) => findings.push(finding(code, message, { file: 'agsc.config.json', key }));
  const out = (config.build && typeof config.build.out === 'string' && config.build.out) || DEFAULT_OUT;
  for (const key of ['vocabulary', 'shapes', 'questions']) {
    const named = object[key];
    if (typeof named === 'string' && ['content', 'dist', out].some((dir) => under(named, dir))) {
      fault('AGSC-E204', `domain.${key}`, `domain.${key} names ${named}, which is under content/, dist/ or build.out; `
        + 'the files of the domain layer are inputs and lie outside them (AGSC-01-41)');
    }
  }
  const clusters = new Set((options.items || []).filter((item) => item.type === 'cluster').map((item) => item.slug));
  const seen = { cluster: new Set(), namespace: new Set([NS]) };
  (Array.isArray(object.contexts) ? object.contexts : []).forEach((entry, n) => {
    if (entry === null || typeof entry !== 'object') return;
    const where = `domain.contexts[${n}]`;
    if (typeof entry.cluster === 'string' && !clusters.has(entry.cluster)) {
      fault('AGSC-E301', `${where}.cluster`, `${where}.cluster names ${entry.cluster}, which is no cluster item of this Bundle (AGSC-01-41)`);
    }
    for (const member of ['cluster', 'namespace']) {
      const value = entry[member];
      if (typeof value !== 'string') continue;
      if (seen[member].has(value)) {
        fault('AGSC-E209', `${where}.${member}`, `${where}.${member} ${value} is ${value === NS ? 'the vocabulary namespace of AGSC-05-02' : 'named twice'}; `
          + 'each context has a cluster and a namespace of its own (AGSC-01-41, AGSC-08-32)');
      }
      seen[member].add(value);
    }
  });
  return findings;
}

module.exports = { ITEM_CLASSES, LINK_PROPERTIES, check, configFindings, load };
