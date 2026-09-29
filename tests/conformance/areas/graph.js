'use strict';
// Conformance area `graph` — AGSC-05 and AGSC-06-32.
//
// graph-0003 a blank node in an export block is AGSC-E605     AGSC-05-08
// graph-0005 memory:// resolution and the foreign bundle      AGSC-05-04b
// graph-0011 the context file and its round trip              AGSC-06-32
// graph-0012 N-Quads escaping and the datatypes               AGSC-05-32
// graph-0016 attachment nodes, the whole file                 AGSC-05-29
// graph-0017 ports and task state, the whole file             AGSC-05-30
// graph-0018 the three literal forms, the whole file          AGSC-05-31
// graph-0019 the context term names                           AGSC-06-32
// graph-0021 canonical N-Quads and materialised inverses      AGSC-04-15
// graph-0022 cluster nesting is skos:member                   AGSC-05-19
// graph-0023 a Source is a fragment IRI on its item           AGSC-05-14
// graph-0024 the two item-reachability edges                  AGSC-05-27
// graph-0025 the asc:mentions edge of an inline link          AGSC-05-27
// graph-0026 the Turtle profile, the whole file               AGSC-05-10
//
// Dispatch is on the `input`/`expected` member names present, which is what
// `tests/vectors/README.md` tells a port to do.

const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const nq = require('../../../src/knowledge/nquads.js');
const turtle = require('../../../src/knowledge/turtle.js');
const jsonldView = require('../../../src/knowledge/jsonld.js');
const jcs = require('../../../src/knowledge/jcs.js');
const linksModule = require('../../../src/knowledge/links.js');
const fixture = require('../../knowledge/_graph-fixture.js');
const { checks } = require('./_assert.js');

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

/**
 * The emission options a vector's input asks for. Every line of `graph.nq` is a quad
 * named by the Bundle IRI (AGSC-04-15), so the graph term is never chosen by the
 * vector's shape.
 */
function optionsFor(input) {
  return {
    base: (input.site && input.site.base) || input.base,
    ...(input.bundle ? { bundle: input.bundle } : {}),
    ...(input.attachment_bytes ? { attachmentBytes: input.attachment_bytes } : {}),
    sha256,
  };
}

/** Every predicate–object clause of a Turtle document, without prefix or terminator. */
function clauses(text) {
  return text.split('\n')
    .filter((line) => line.trim() !== '' && !line.startsWith('@prefix'))
    .map(normaliseClause);
}

function normaliseClause(line) {
  return line
    .replace(/^\s+/u, '')
    .replace(/^<[^>]*>\s+/u, '')
    .replace(/\s*[;.]$/u, '')
    .trim();
}

/** graph-0005 — the `memory://` alias (AGSC-05-04b). */
function memoryCase(vector) {
  const list = [];
  const bundleId = vector.input.bundle_id;
  const results = vector.input.value.map((value) => jsonldView.resolveMemory(value, { bundleId }));
  const own = results.find((r) => r.slug);
  const foreign = results.find((r) => r.finding);
  list.push(['resolved', own && own.slug === vector.expected.resolved, `got ${JSON.stringify(own)}`]);
  list.push(['foreign', Boolean(foreign) && foreign.finding.code === vector.expected.foreign_bundle.error,
    `got ${JSON.stringify(foreign)}`]);
  if (vector.expected.emitted_as_rdf_subject === false) {
    // The alias has no path into the dataset: every subject is built by `itemIri`.
    const items = [{ type: 'concept', slug: own.slug, title: 'Alias', lang: 'en' }];
    const text = nq.toNQuads(items, { base: vector.input.base });
    list.push(['never a subject', !text.includes('memory://'), text]);
  }
  return checks(list);
}

/** graph-0012 — the escaping and the three literal forms as terms (AGSC-05-31/05-32). */
function literalFormsCase(vector) {
  const list = [];
  const plain = nq.literal(vector.input.literal);
  const written = nq.nquadsTerm(plain);
  list.push(['nquads_literal', written === vector.expected.nquads_literal, `got ${JSON.stringify(written)}`]);
  const lang = nq.nquadsTerm(nq.literal(vector.input.lang_literal.value, { lang: vector.input.lang_literal.lang }));
  list.push(['nquads_lang', lang === vector.expected.nquads_lang, `got ${JSON.stringify(lang)}`]);
  const typed = nq.nquadsTerm(nq.literal(vector.input.typed_literal.value, {
    datatype: jsonldView.expandCompact(vector.input.typed_literal.datatype),
  }));
  list.push(['nquads_typed', typed === vector.expected.nquads_typed, `got ${JSON.stringify(typed)}`]);
  for (const forbidden of vector.expected.forbidden_forms || []) {
    list.push([`forbidden ${forbidden}`, !written.includes(forbidden), `got ${JSON.stringify(written)}`]);
  }
  if (vector.expected.turtle_literal_has_explicit_xsd_string === false) {
    const inTurtle = turtle.turtleTerm(plain);
    list.push(['turtle has no ^^xsd:string', !inTurtle.includes('^^'), `got ${JSON.stringify(inTurtle)}`]);
  }
  return checks(list);
}

/** graph-0011 — the context file (AGSC-06-32) and the expand / re-compact round trip. */
/**
 * graph-0019 — AGSC-06-32: the term NAMES.
 *
 * The vector states the external rows itself, with the `@type` each takes, because
 * the type is fixed by the rule that emits the property and this case tests the
 * naming alone. `contextFrom` is the engine's own derivation over explicit rows —
 * the same code path `context` runs.
 */
function termNamesCase(vector) {
  const rows = (vector.input.external_properties || [])
    .map((entry) => [entry.property, entry.type]);
  const got = jsonldView.contextFrom(vector.input.ontology_terms, rows);
  const list = [['context', jcs.canonicalize(got) === jcs.canonicalize(vector.expected.context),
    `got ${jcs.canonicalize(got)}`]];
  const names = {};
  for (const [name, definition] of Object.entries(got['@context'])) {
    if (definition !== null && typeof definition === 'object' && definition['@id'] !== undefined) {
      names[definition['@id']] = name;
    }
  }
  list.push(['term_names', jcs.canonicalize(names) === jcs.canonicalize(vector.expected.term_names),
    `got ${jcs.canonicalize(names)}`]);
  // `tools/gen-ns` derives the same file from `ontology/agsc.ttl`; AGSC-06-32 makes
  // /ns/context.jsonld a constant of the specification, so the two derivations of a
  // term's name must be the same derivation.
  return checks(list);
}

/**
 * graph-0025 — AGSC-05-27: the `asc:mentions` edge of
 * an inline body link. Only the mentions lines are asserted
 * (`whole_file_asserted: false`); the rest of the serialisation is pinned by
 * graph-0016…graph-0018 and graph-0026.
 */
function mentionsCase(vector) {
  const input = vector.input;
  const items = (input.items || []).map((item) => ({ ...item, path: `content/concepts/${item.slug}.md` }));
  const edges = linksModule.resolve(items).edges
    .filter((edge) => edge.key === 'mentions' && edge.source !== edge.target)
    .map((edge) => ({ source: edge.source, target: edge.target }));
  const options = { ...optionsFor(input), lang: 'en', mentions: edges };
  const nquads = nq.toNQuads(items, options);
  const lines = nquads.split('\n').filter((line) => line.includes(`${nq.NS}mentions`))
    .map((line) => `${line}\n`);
  const list = [
    ['mentions_lines', jcs.canonicalize(lines) === jcs.canonicalize(vector.expected.mentions_lines),
      `got ${JSON.stringify(lines)}`],
    ['whole_file_asserted', vector.expected.whole_file_asserted === false,
      'no rule pins the whole document here'],
  ];
  if (vector.expected.inverse_materialised === false) {
    // AGSC-03-04 lists the computed inverses and `mentions` is not among them.
    list.push(['inverse_materialised',
      !nquads.includes(`<${nq.bundleIri(options.base)}concepts/beta/> <${nq.NS}mentions>`),
      'a computed inverse reached the export']);
  }
  return checks(list);
}

function contextCase(vector, ctx) {
  const list = [];
  const got = jsonldView.context(vector.input.ontology_terms, vector.input.external_properties_used);
  list.push(['context', jcs.canonicalize(got) === jcs.canonicalize(vector.expected.context),
    `got ${jcs.canonicalize(got)}`]);

  if (vector.expected.roundtrip_byte_identical === true) {
    // The round trip needs a document that uses the WHOLE vocabulary, so it is run
    // against the context generated from `ontology/agsc.ttl` and the representative
    // Bundle, not against the four terms this vector's input names.
    const full = jsonldView.context(
      turtle.ontologyTerms(fs.readFileSync(path.join(ctx.root, 'ontology', 'agsc.ttl'), 'utf8')),
      jsonldView.allExternalProperties(),
    );
    const options = fixture.options({ context: full });
    const document = jsonldView.toJsonLd(fixture.ITEMS, options);
    const before = jcs.canonicalize(document);
    const helper = path.join(__dirname, '_jsonld-roundtrip.js');
    let after;
    try {
      after = execFileSync(process.execPath, [helper], {
        cwd: ctx.root,
        encoding: 'utf8',
        input: JSON.stringify({ doc: document, context: full, contextUrl: options.contextUrl }),
      });
    } catch (error) {
      return checks([...list, ['roundtrip', false, `the processor failed: ${error.message}`]]);
    }
    list.push(['roundtrip', jcs.canonicalize(JSON.parse(after)) === before, 'expanding and re-compacting changed the bytes']);
  }
  return checks(list);
}

/** graph-0003 — a blank node in an authored export block (AGSC-05-08). */
function exportBlockCase(vector) {
  const findings = turtle.checkExportBlocks(vector.input.markdown);
  return checks([['error', findings.some((f) => f.code === vector.expected.error),
    `got ${JSON.stringify(findings)}`]]);
}

/**
 * graph-0016/0017/0018/0026 — the WHOLE file, byte for byte.
 *
 * `expected.nquads` and `expected.turtle` are compared as bytes, which is what
 * AGSC-04-24 names for `graph.nq` and `graph.ttl` in the cross-implementation set.
 * The discriminator is `expected.turtle` being a whole document (it opens with the
 * `@prefix` block).
 */
function wholeFileCase(vector) {
  const options = optionsFor(vector.input);
  const list = [];
  const nquads = nq.toNQuads(vector.input.items, options);
  const text = turtle.toTurtle(vector.input.items, options);
  list.push(['nquads', nquads === vector.expected.nquads, `got\n${nquads}`]);
  list.push(['turtle', text === vector.expected.turtle, `got\n${text}`]);

  if (vector.expected.prefix_block_is_constant === true) {
    // AGSC-05-10(a): the seven lines are emitted whether the dataset uses the
    // namespace or not, so the block of THIS dataset must equal the block of a
    // dataset that uses nothing at all — and `owl:`/`rdf:` are never declared.
    const constant = turtle.prefixBlock();
    const emitted = text.split('\n\n')[0];
    list.push(['prefix block', emitted === constant, `got ${JSON.stringify(emitted)}`]);
    list.push(['seven lines', constant.split('\n').filter(Boolean).length === 7, constant]);
    list.push(['no owl:/rdf: prefix', !/^@prefix (owl|rdf):/mu.test(constant), constant]);
  }
  if (vector.expected.blank_nodes !== undefined) {
    const count = nq.countBlankNodes(nquads);
    list.push(['blank_nodes', count === vector.expected.blank_nodes, `got ${count}`]);
  }
  if (vector.expected.turtle_never_contains) {
    list.push(['turtle_never_contains', !text.includes(vector.expected.turtle_never_contains), `present in\n${text}`]);
  }
  if (vector.expected.verdict_digest_exported === false) {
    const digests = vector.input.items.map((item) => item.verdict_digest).filter(Boolean);
    list.push(['verdict_digest', !/verdict/iu.test(nquads) && !digests.some((d) => nquads.includes(d)),
      `a verdict reached the export:\n${nquads}`]);
  }
  for (const forbidden of vector.expected.forbidden || []) list.push(forbiddenCheck(forbidden, vector, options, nquads, text));
  return checks(list);
}

/**
 * One entry of `expected.forbidden`. Each is a prose statement of a form the rules
 * exclude; an entry this handler does not recognise FAILS rather than passing
 * silently, so a new clause in a future vector cannot be met by doing nothing.
 */
function forbiddenCheck(forbidden, vector, options, nquads, text) {
  if (forbidden === '"Lit"@en^^' || forbidden.endsWith('@en^^')) {
    return ['no datatype on a language-tagged literal', !nquads.includes('@en^^') && !text.includes('@en^^'), nquads];
  }
  if (forbidden.includes('^^xsd:string in Turtle')) {
    return ['no ^^xsd:string in Turtle', !text.includes('^^xsd:string'), text];
  }
  if (forbidden.includes('status is not authored')) {
    const stripped = vector.input.items.map(({ status, ...rest }) => rest);
    const without = nq.toNQuads(stripped, options);
    return ['no asc:status when status is not authored', !without.includes(`${nq.NS}status`), without];
  }
  if (forbidden.includes('ordered by prefixed name')) {
    // AGSC-05-10(c): predicates sort by predicate IRI code points. The vectors were
    // chosen so the two orders differ, which is the whole point of `graph-0018`:
    // `dcterms:modified` (http://purl.org/…) precedes `rdf:type` under IRI order and
    // follows every `asc:` clause under prefixed-name order.
    const clauseNames = clauses(text)
      .map((clause) => clause.split(/\s/u)[0])
      .filter((name) => name !== '');
    const byPrefixedName = [...clauseNames].sort();
    return ['predicates are not ordered by prefixed name',
      clauseNames.join('|') !== byPrefixedName.join('|'),
      `the emitted order ${clauseNames.join(' ')} is also the prefixed-name order`];
  }
  return [`forbidden ${forbidden}`, false, 'this handler does not implement that clause'];
}

/** graph-0021/0022/0023/0024 — the dataset of a set of items. */
function itemsCase(vector) {
  const options = optionsFor(vector.input);
  const nquads = nq.toNQuads(vector.input.items, options);
  const list = [];

  if (typeof vector.expected.nquads === 'string') {
    list.push(['nquads', nquads === vector.expected.nquads, `got\n${nquads}`]);
  }
  for (const line of vector.expected.contains || []) {
    list.push(['contains', nquads.includes(line), `missing ${line} in\n${nquads}`]);
  }
  for (const line of vector.expected.excludes || []) {
    list.push(['excludes', !nquads.includes(line), `present: ${line}`]);
  }
  return checks(list);
}

module.exports.run = (vector, ctx) => {
  const input = vector.input || {};
  if (vector.id === 'graph-0019') return termNamesCase(vector);
  if (vector.id === 'graph-0025') return mentionsCase(vector);
  if (Array.isArray(input.value) && input.bundle_id !== undefined) return memoryCase(vector);
  if (input.literal !== undefined) return literalFormsCase(vector);
  if (Array.isArray(input.ontology_terms)) return contextCase(vector, ctx);
  if (typeof input.markdown === 'string') return exportBlockCase(vector);
  const expected = vector.expected || {};
  if (typeof expected.turtle === 'string' && expected.turtle.startsWith('@prefix ')) return wholeFileCase(vector);
  if (Array.isArray(input.items)) return itemsCase(vector);
  return { status: 'fail', detail: `graph: no handler for the input shape ${Object.keys(input).join(', ')}` };
};

module.exports.clauses = clauses;
module.exports.normaliseClause = normaliseClause;
