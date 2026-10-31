'use strict';
/**
 * CONTEXT Interchange — memory adapter `skos` (AGSC-01-26a, AGSC-01-39): a SKOS
 * thesaurus in, as items.
 *
 *   agsc import <file.ttl> --from skos [--replace] [--dry-run]
 *
 * WHY. A thesaurus kept in a taxonomy tool is the vocabulary a node's concepts should
 * start from. This adapter reads one RDF 1.1 Turtle file that holds a SKOS thesaurus
 * (SKOS Reference, W3C Recommendation of 18 August 2009, <https://www.w3.org/TR/skos-reference/>)
 * and writes the items AGSC-01-39 maps it to. The export in the other direction is
 * `export --skos` (AGSC-05-36), a view of the graph and not an adapter.
 *
 * LIBRARY SPLIT. Reading Turtle is `n3`'s job (`knowledge/turtle.js#parse`, a wrapper over
 * `N3.Parser`); this module never tokenises RDF itself. What is left for it is the mapping,
 * which is the specification's and matches no library: which label is the title, which
 * definition is the description, which statement a node cannot carry.
 *
 * THE RULE IS "REPORT WHAT YOU DROP". Every statement of the file starts unused. Each
 * step of the mapping marks the statements it carries, and every statement still unused
 * at the end is one warning `AGSC-E506` naming its subject and predicate (AGSC-01-39).
 * So the list of drops is the complement of the mapping, and cannot disagree with it.
 *
 * DETERMINISM (AGSC-01-23). Subjects are taken in the code-point order of their IRIs, a
 * set of values is written in code-point order, and a choice among several values
 * (the title, the definition) has a total order with no tie left to the order of the
 * file. The plan is therefore a function of the statements and not of their order, and
 * a second run over the same file writes the same bytes, which the shared apply step
 * finds already in place (`verbs/import.js#apply`).
 *
 * EVERY ITEM IS A DRAFT (AGSC-01-22): a thesaurus is a foreign source, so nothing it
 * brings is published until a person changes the status.
 *
 * PURE: no fs, no clock, no network — the verb reads the file and hands the text in.
 * Requirements: AGSC-01-22, AGSC-01-23, AGSC-01-26a, AGSC-01-39; PRD-021, PRD-026.
 */

const turtle = require('../../knowledge/turtle.js');
const slugs = require('../../knowledge/slug.js');
const { DCTERMS, RDF, SKOS } = require('../../knowledge/nquads.js');
const { compareCodePoint, nfc } = require('../../knowledge/unicode.js');
const { titleFor } = require('../../knowledge/adopt.js');
const { finding } = require('../../knowledge/validate.js');
const { neutraliseSingleLine } = require('../mapping.js');
const { itemText, oneLine } = require('../records.js');
const { TYPE_PLURAL } = require('../okf.js');

/** The name this adapter answers to on `import --from`. */
const FORMAT = 'skos';

const XL = 'http://www.w3.org/2008/05/skos-xl#';
const RDF_TYPE = `${RDF}type`;
const RDF_FIRST = `${RDF}first`;
const RDF_REST = `${RDF}rest`;
const RDF_NIL = `${RDF}nil`;

/** AGSC-01-39 (d): the bounds of a `description`, in code points. */
const DESCRIPTION_MIN = 40;
const DESCRIPTION_MAX = 200;

/** The SKOS classes that become items, in the order that decides a subject typed with several. */
const CLASSES = Object.freeze([
  ['Concept', 'concept'], ['ConceptScheme', 'scheme'], ['Collection', 'collection'], ['OrderedCollection', 'collection'],
]);

const LINK_KEYS = Object.freeze(['broader', 'narrower', 'related']);

// ------------------------------------------------------------------- reading

/** The identifier of a subject or an object that is a resource: its IRI, or `_:` and the blank node's label. */
const idOf = (term) => (term.termType === 'BlankNode' ? `_:${term.value}` : term.value);

/** `{ id -> [statement] }`, a statement being `{id, predicate, object, used}`. */
function collect(quads) {
  const subjects = new Map();
  for (const q of quads) {
    const id = idOf(q.subject);
    if (!subjects.has(id)) subjects.set(id, []);
    subjects.get(id).push({ id, object: q.object, predicate: q.predicate.value, used: false });
  }
  return subjects;
}

/** The statements of `statements` with this predicate. */
const having = (statements, predicate) => statements.filter((s) => s.predicate === predicate);

/** A literal as `{lang, value}`: the tag lower-cased, the value in NFC. */
const literalOf = (term) => ({ lang: term.language.toLowerCase(), value: nfc(term.value) });

/** Mark statements as carried. */
function carry(...statements) {
  for (const statement of statements) statement.used = true;
}

/** The order of two literals: by tag, then by lexical form, both by code point. */
const byTagThenValue = (a, b) => compareCodePoint(a.lang, b.lang) || compareCodePoint(a.value, b.value);

/** The order of two literals: by lexical form, then by tag (AGSC-01-39 (d)). */
const byValueThenTag = (a, b) => compareCodePoint(a.value, b.value) || compareCodePoint(a.lang, b.lang);

/**
 * AGSC-01-39 (c): the SKOS-XL label a resource names, read as its `skosxl:literalForm`.
 * The label resource is dropped, so the statements read here are carried and the rest of
 * its statements are reported.
 */
function literalForm(subjects, term) {
  const statements = subjects.get(idOf(term)) || [];
  const forms = having(statements, `${XL}literalForm`).filter((s) => s.object.termType === 'Literal')
    .map((statement) => ({ ...literalOf(statement.object), statement })).sort(byValueThenTag);
  if (forms.length === 0) return null;
  carry(forms[0].statement, ...having(statements, RDF_TYPE).filter((s) => s.object.value === `${XL}Label`));
  return forms[0];
}

/**
 * The labels of one item under one SKOS property (`prefLabel`, `altLabel`), plain or SKOS-XL:
 * `{lang, value, statement}`, the statement being the item's own, which is carried only when
 * the label is kept.
 */
function labelsOf(subjects, item, local) {
  const labels = [];
  for (const statement of item.statements) {
    if (statement.predicate === `${SKOS}${local}` && statement.object.termType === 'Literal') {
      labels.push({ ...literalOf(statement.object), statement });
    } else if (statement.predicate === `${XL}${local}` && statement.object.termType !== 'Literal') {
      const form = literalForm(subjects, statement.object);
      if (form !== null) labels.push({ lang: form.lang, statement, value: form.value });
    }
  }
  return labels;
}

/**
 * AGSC-01-39 (b): the title label — the `prefLabel` in the default language, else the
 * untagged one, else the one whose tag is least; two of one tag, the lexically least.
 */
function titleLabel(labels, i18nDefault) {
  const wanted = String(i18nDefault).toLowerCase();
  const rank = (label) => (label.lang === wanted ? 0 : (label.lang === '' ? 1 : 2));
  return labels.slice().sort((a, b) => rank(a) - rank(b) || byTagThenValue(a, b))[0] || null;
}

/** The last segment of an IRI: what a concept with no `prefLabel` is titled by (AGSC-01-39 (b)). */
function lastSegment(iri) {
  const segments = iri.split(/[/#]/u).filter((part) => part !== '');
  const last = segments.length === 0 ? iri : segments[segments.length - 1];
  try {
    return decodeURIComponent(last);
  } catch (e) {
    return last;
  }
}

/** AGSC-01-39 (a), (f): the item kind of a subject, from its `rdf:type` statements; `null` for anything else. */
function kindOf(statements) {
  const types = new Set(having(statements, RDF_TYPE).map((s) => s.object.value));
  const found = CLASSES.find(([local]) => types.has(`${SKOS}${local}`));
  if (found === undefined) return null;
  carry(...having(statements, RDF_TYPE).filter((s) => s.object.value === `${SKOS}${found[0]}`));
  return found[1];
}

// ------------------------------------------------------------------- mapping

/** One finding of this adapter: the warning `AGSC-E506` of AGSC-01-39. */
const warning = (message, file = '') => finding('AGSC-E506', `${message} (AGSC-01-39)`, { file, severity: 'warn' });

/** The items of the file, by IRI in code-point order, each with its kind and its statements. */
function itemsOf(subjects) {
  const items = [];
  for (const id of [...subjects.keys()].sort(compareCodePoint)) {
    const statements = subjects.get(id);
    const kind = id.startsWith('_:') ? null : kindOf(statements);
    if (kind !== null) items.push({ id, kind, statements });
  }
  return items;
}

/** Slug and title of every item (AGSC-01-39 (a), (b)); slugs are suffixed in IRI order (AGSC-01-23). */
function namesOf(subjects, items, i18nDefault) {
  const taken = new Set();
  for (const item of items) {
    item.label = titleLabel(labelsOf(subjects, item, 'prefLabel'), i18nDefault);
    const raw = item.label === null ? lastSegment(item.id) : item.label.value;
    item.slug = slugs.dedupe(slugs.slugify(raw), taken);
    taken.add(item.slug);
    item.rawTitle = raw;
  }
}

/** AGSC-01-39 (f): which cluster items each item is a member of, as `{memberId -> [container item]}`. */
function membershipsOf(subjects, byId) {
  const memberships = new Map();
  const add = (container, statement, memberId) => {
    if (!byId.has(memberId)) return;
    if (!memberships.has(memberId)) memberships.set(memberId, []);
    memberships.get(memberId).push({ container, statement });
  };
  for (const container of byId.values()) {
    if (container.kind !== 'collection') continue;
    for (const statement of having(container.statements, `${SKOS}member`)) {
      if (statement.object.termType !== 'Literal') add(container, statement, idOf(statement.object));
    }
    for (const statement of having(container.statements, `${SKOS}memberList`)) {
      for (const memberId of listMembers(subjects, statement.object)) add(container, null, memberId);
    }
  }
  return memberships;
}

/** The `rdf:first` values of an RDF list, in order, the list's statements carried; a loop ends the walk. */
function listMembers(subjects, head) {
  const members = [];
  const seen = new Set();
  let node = head;
  while (node.termType !== 'Literal' && idOf(node) !== RDF_NIL && !seen.has(idOf(node))) {
    seen.add(idOf(node));
    const statements = subjects.get(idOf(node)) || [];
    const first = having(statements, RDF_FIRST)[0];
    const rest = having(statements, RDF_REST)[0];
    if (first === undefined || rest === undefined) break;
    carry(first, rest);
    if (first.object.termType !== 'Literal') members.push(idOf(first.object));
    node = rest.object;
  }
  return members;
}

/** The clusters an item names by `skos:inScheme` or `skos:topConceptOf` (a concept only). */
function schemeIdsOf(item, byId) {
  if (item.kind !== 'concept') return [];
  const ids = [];
  for (const key of ['inScheme', 'topConceptOf']) {
    for (const statement of having(item.statements, `${SKOS}${key}`)) {
      const target = statement.object.termType === 'Literal' ? undefined : byId.get(idOf(statement.object));
      if (target === undefined || target.kind === 'concept') continue;
      carry(statement);
      ids.push(target.id);
    }
  }
  return ids;
}

/**
 * AGSC-01-39 (f): the slugs of the clusters a concept joins, and the one `broader` of a
 * collection that is a member of others (the first container by IRI; the other
 * memberships stay unused, so they are reported).
 */
function clusterLinks(item, byId, memberships) {
  const memberOf = (memberships.get(item.id) || []).slice().sort((a, b) => compareCodePoint(a.container.id, b.container.id));
  if (item.kind === 'collection') {
    if (memberOf.length === 0) return {};
    if (memberOf[0].statement !== null) carry(memberOf[0].statement);
    return { broader: [memberOf[0].container.slug] };
  }
  if (item.kind !== 'concept') return {};
  for (const { statement } of memberOf) if (statement !== null) carry(statement);
  const ids = [...schemeIdsOf(item, byId), ...memberOf.map((m) => m.container.id)];
  const clusters = [...new Set(ids.map((id) => byId.get(id).slug))].sort(compareCodePoint);
  return clusters.length === 0 ? {} : { clusters };
}

/** AGSC-01-39 (e): `broader`, `narrower` and `related` between two concepts of the file, as slugs. */
function conceptLinks(item, byId) {
  if (item.kind !== 'concept') return {};
  const links = {};
  for (const key of LINK_KEYS) {
    const found = having(item.statements, `${SKOS}${key}`).filter((statement) => {
      const target = statement.object.termType === 'Literal' ? undefined : byId.get(idOf(statement.object));
      return target !== undefined && target.kind === 'concept';
    });
    carry(...found);
    const targets = [...new Set(found.map((s) => byId.get(idOf(s.object)).slug))].sort(compareCodePoint);
    if (targets.length > 0) links[key] = targets;
  }
  return links;
}

/** AGSC-01-39 (g): each `dcterms:source` whose object is an `http` or `https` IRI. */
function sourcesOf(item) {
  const found = having(item.statements, `${DCTERMS}source`)
    .filter((s) => s.object.termType === 'NamedNode' && /^https?:\/\//u.test(s.object.value));
  carry(...found);
  const resources = [...new Set(found.map((s) => s.object.value))].sort(compareCodePoint);
  return resources.length === 0 ? {} : { sources: resources.map((resource) => ({ resource })) };
}

/** The licence a scheme states (`dcterms:license`), the least in code-point order; `null` when none. */
function schemeLicence(scheme) {
  const found = having(scheme.statements, `${DCTERMS}license`);
  carry(...found);
  const values = found.map((s) => nfc(s.object.value)).sort(compareCodePoint);
  return values.length === 0 ? null : values[0];
}

/** AGSC-01-39 (h): the licence of the first scheme (by IRI) that states one, for an item in that scheme. */
function licenceOf(item, byId, licences) {
  const own = item.kind === 'scheme' ? [item.id] : [];
  const schemes = [...own, ...schemeIdsOf(item, byId).filter((id) => byId.get(id).kind === 'scheme')].sort(compareCodePoint);
  const found = schemes.map((id) => licences.get(id)).find((licence) => licence !== null && licence !== undefined);
  return found === undefined ? {} : { 'x-skos-license': found };
}

/**
 * AGSC-01-39 (d): the `skos:definition` least in code-point order of its lexical form (ties by
 * tag) is the description when it has 40 to 200 code points, and otherwise the first
 * paragraph of the body. The others stay unused and are reported.
 */
function definitionOf(item) {
  const found = having(item.statements, `${SKOS}definition`)
    .filter((s) => s.object.termType === 'Literal' && s.object.value.trim() !== '')
    .map((statement) => ({ ...literalOf(statement.object), statement })).sort(byValueThenTag)[0];
  if (found === undefined) return { body: '', findings: [] };
  carry(found.statement);
  const text = oneLine(found.value);
  const length = text === null ? 0 : [...text].length;
  if (length >= DESCRIPTION_MIN && length <= DESCRIPTION_MAX) return { body: '', description: text, findings: [] };
  return {
    body: `${found.value.trim()}\n`,
    findings: [warning(`${item.id}: the definition has ${length} code points, outside ${DESCRIPTION_MIN} to ${DESCRIPTION_MAX},`
      + ' so it was written as the first paragraph of the body and no description was written')],
  };
}

/** AGSC-01-39 (c): the `altLabel` values, without duplicates and without the title, in code-point order. */
function aliasesOf(subjects, item, title) {
  const labels = labelsOf(subjects, item, 'altLabel');
  carry(...labels.map((label) => label.statement));
  const aliases = [...new Set(labels.map((label) => label.value))].filter((value) => value !== title).sort(compareCodePoint);
  return aliases.length === 0 ? {} : { aliases };
}

/** The title of an item (AGSC-01-39 (b), clipped or replaced as AGSC-02-90 does) and what that reported. */
function titleOf(item, path) {
  if (item.label !== null) carry(item.label.statement);
  const derived = titleFor('', item.rawTitle, item.slug);
  const findings = derived.findings.map((one) => ({ ...one, file: path }));
  if (item.label === null) {
    findings.push(warning(`${item.id}: no prefLabel; the last segment of the IRI was taken as the title`, path));
  }
  return { findings, title: derived.title };
}

/** The write, and its findings, of one item. */
function writeOf(item, context) {
  const path = `content/${TYPE_PLURAL[item.kind === 'concept' ? 'concept' : 'cluster']}/${item.slug}.md`;
  const named = titleOf(item, path);
  const defined = definitionOf(item);
  const links = { ...clusterLinks(item, context.byId, context.memberships), ...conceptLinks(item, context.byId) };
  const raw = {
    ...(item.kind === 'concept' ? { type: 'concept', kind: 'term' } : { type: 'cluster' }),
    title: named.title,
    ...aliasesOf(context.subjects, item, named.title),
    ...(defined.description === undefined ? {} : { description: defined.description }),
    ...links,
    ...sourcesOf(item),
    status: 'draft',
    prov: { operator: String(context.operator), origin: 'imported' },
    'x-skos-iri': item.id,
    ...licenceOf(item, context.byId, context.licences),
  };
  const clean = neutraliseSingleLine(raw);
  const findings = [...named.findings, ...defined.findings];
  if (clean.substituted.length > 0) {
    findings.push(warning(`${item.id}: a control character or line separator in ${clean.substituted.join(', ')} was replaced`
      + ' by a space, because AGSC-02-24 forbids it', path));
  }
  findings.push(warning(`${item.id}: imported as status: draft, so it is not published (AGSC-06-30)`
    + ' until a person changes the status', path));
  return { findings, write: { path, text: itemText(clean.frontmatter, defined.body, context.itemSchema) } };
}

/** One warning for each statement that nothing carried (AGSC-01-39: "every statement that none of (a) to (i) uses"). */
function droppedFindings(subjects) {
  const out = [];
  for (const id of [...subjects.keys()].sort(compareCodePoint)) {
    const unused = subjects.get(id).filter((s) => !s.used)
      .sort((a, b) => compareCodePoint(a.predicate, b.predicate)
        || compareCodePoint(a.object.value, b.object.value)
        || compareCodePoint(a.object.language || '', b.object.language || ''));
    for (const statement of unused) {
      out.push({
        ...warning(`${id}: the statement ${statement.predicate} ${JSON.stringify(statement.object.value)} is not carried`
          + ' by the SKOS import and was dropped'),
        predicate: statement.predicate,
        subject: id,
      });
    }
  }
  return out;
}

/**
 * The import plan of one Turtle file.
 *
 * @param {{turtle:string}} input the file's text.
 * @param {object} options
 * @param {string} options.i18nDefault `i18n.default` of the target Bundle.
 * @param {object} options.itemSchema the raw `schema/item.schema.json` object, so the written
 *   bytes are the lint-normalized ones (AGSC-04-19).
 * @param {string} options.operator `bundle.operator` of the target Bundle (AGSC-08-01).
 * @returns {{findings:Array<object>, totals:object, writes:Array<{path:string, text:string}>}}
 */
function plan(input, options) {
  let quads;
  try {
    quads = turtle.parse(input.turtle);
  } catch (e) {
    return {
      findings: [finding('AGSC-E003', `the file is not RDF 1.1 Turtle: ${(e && e.message) || 'parse error'} (AGSC-01-39)`,
        { file: '', line: 1 })],
      totals: { items: 0 },
      writes: [],
    };
  }
  const subjects = collect(quads);
  const items = itemsOf(subjects);
  if (items.length === 0) {
    return {
      findings: [finding('AGSC-E901', 'the file holds no skos:Concept, skos:ConceptScheme or skos:Collection (AGSC-01-39)',
        { file: '', line: 1 })],
      totals: { items: 0 },
      writes: [],
    };
  }
  namesOf(subjects, items, options.i18nDefault);
  const byId = new Map(items.map((item) => [item.id, item]));
  const licences = new Map(items.filter((item) => item.kind === 'scheme').map((item) => [item.id, schemeLicence(item)]));
  const context = {
    byId, itemSchema: options.itemSchema, licences, memberships: membershipsOf(subjects, byId),
    operator: options.operator, subjects,
  };
  const findings = [];
  const writes = [];
  for (const item of items) {
    const written = writeOf(item, context);
    findings.push(...written.findings);
    writes.push(written.write);
  }
  findings.push(...droppedFindings(subjects));
  writes.sort((a, b) => compareCodePoint(a.path, b.path));
  return { findings, totals: { items: writes.length }, writes };
}

module.exports = { FORMAT, plan };
