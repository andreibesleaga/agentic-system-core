'use strict';
// Conformance area `graph` — AGSC-05 and AGSC-06-32.
//
// graph-0003 WITHDRAWN for 1.0.0; superseded by graph-0027     AGSC-05-08
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
// graph-0027 an export block is reserved: real lint and build  AGSC-02-22
// graph-0028 graph.jsonld and the per-item files, whole        AGSC-05-09
// graph-0029 the readings of the Link graph, each with reasons  AGSC-05-33
// graph-0030 to graph-0039 the ten questions, one each          AGSC-05-34
// graph-0043 the context address is not the ontology version   AGSC-05-09
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
const derive = require('../../../src/knowledge/derive.js');
const questions = require('../../../src/knowledge/questions.js');
const { RELATIONS } = require('../../../src/knowledge/relations.js');
const fixture = require('../../knowledge/_graph-fixture.js');
const { checks } = require('./_assert.js');
const { guarded } = require('./_expected-reads.js');

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
  if (vector.expected.emitted_as_rdf_subject !== undefined) {
    // The alias has no path into the dataset: every subject is built by `itemIri`.
    const items = [{ type: 'concept', slug: own.slug, title: 'Alias', lang: 'en' }];
    const text = nq.toNQuads(items, { base: vector.input.base });
    list.push(['emitted_as_rdf_subject', text.includes('memory://') === vector.expected.emitted_as_rdf_subject, text]);
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
  if (vector.expected.turtle_literal_has_explicit_xsd_string !== undefined) {
    const inTurtle = turtle.turtleTerm(plain);
    list.push(['turtle_literal_has_explicit_xsd_string',
      inTurtle.includes('^^') === vector.expected.turtle_literal_has_explicit_xsd_string, `got ${JSON.stringify(inTurtle)}`]);
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
  if (vector.expected.inverse_materialised !== undefined) {
    // AGSC-03-04 lists the computed inverses and `mentions` is not among them.
    list.push(['inverse_materialised',
      nquads.includes(`<${nq.bundleIri(options.base)}concepts/beta/> <${nq.NS}mentions>`) === vector.expected.inverse_materialised,
      'a computed inverse reached the export, or the one the case states did not']);
  }
  return checks(list);
}

function contextCase(vector, ctx) {
  const list = [];
  const got = jsonldView.context(vector.input.ontology_terms, vector.input.external_properties_used);
  list.push(['context', jcs.canonicalize(got) === jcs.canonicalize(vector.expected.context),
    `got ${jcs.canonicalize(got)}`]);

  if (vector.expected.roundtrip_byte_identical !== undefined) {
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
    list.push(['roundtrip_byte_identical',
      (jcs.canonicalize(JSON.parse(after)) === before) === vector.expected.roundtrip_byte_identical,
      'expanding and re-compacting changed the bytes, or kept them where the case states a change']);
  }
  return checks(list);
}

/**
 * graph-0027 — a block marked `export` is reserved at 1.x (AGSC-02-22): the real `lint`
 * and `build` over the fixture with the item added. `lint` warns AGSC-E415 and never
 * reports AGSC-E605; the built `graph.nq` holds no blank node and no triple of the block.
 */
function reservedExportBlockCase(vector, ctx) {
  const os = require('node:os');
  const { main } = require('../../../src/application/cli/main.js');
  const { createFileSystem } = require('../../../src/adapters/node-fs.js');
  const { captureStream } = require('./_shared.js');
  const { findingsMatch } = require('./_assert.js');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-graph-'));
  try {
    fs.cpSync(path.join((ctx && ctx.root) || '.', 'tests', vector.input.bundle), scratch, { recursive: true });
    const file = path.join(scratch, vector.input.item.path);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, vector.input.item.markdown);
    const run = (argv) => {
      const stdout = captureStream();
      const stderr = captureStream();
      main(argv, {
        env: { SOURCE_DATE_EPOCH: String(vector.options.source_date_epoch) },
        ports: { fs: createFileSystem(scratch) }, root: scratch, specVersion: vector.options.spec_version, stderr, stdout,
      });
      try { return JSON.parse(stdout.text()); } catch { return { findings: [] }; }
    };
    const lint = run(['lint', '--json']);
    const build = run(['build', '--json']);
    const graph = fs.existsSync(path.join(scratch, 'www', 'graph.nq')) ? fs.readFileSync(path.join(scratch, 'www', 'graph.nq'), 'utf8') : null;
    const expected = vector.expected;
    const all = [...lint.findings, ...build.findings];
    const m = findingsMatch(expected.lint, lint.findings);
    return checks([
      ['lint', m.ok, m.detail],
      ['never reported', expected.never_reported.every((code) => !all.some((f) => f.code === code)), JSON.stringify(all)],
      ['graph built', graph !== null, 'no www/graph.nq'],
      ['blank nodes', graph !== null && nq.countBlankNodes(graph) === expected.graph_blank_nodes, 'blank node in graph.nq'],
      ['no triple of the block', graph !== null && !graph.includes(expected.graph_never_contains), 'a triple of the block reached graph.nq'],
    ]);
  } finally {
    fs.rmSync(scratch, { force: true, recursive: true });
  }
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

  if (vector.expected.prefix_block_is_constant !== undefined) {
    // AGSC-05-10(a): the seven lines are emitted whether the dataset uses the
    // namespace or not, so the block of THIS dataset must equal the block of a
    // dataset that uses nothing at all — and `owl:`/`rdf:` are never declared.
    const constant = turtle.prefixBlock();
    const emitted = text.split('\n\n')[0];
    const holds = emitted === constant && constant.split('\n').filter(Boolean).length === 7
      && !/^@prefix (owl|rdf):/mu.test(constant);
    list.push(['prefix_block_is_constant', holds === vector.expected.prefix_block_is_constant,
      `got ${JSON.stringify(emitted)} against ${JSON.stringify(constant)}`]);
  }
  if (vector.expected.blank_nodes !== undefined) {
    const count = nq.countBlankNodes(nquads);
    list.push(['blank_nodes', count === vector.expected.blank_nodes, `got ${count}`]);
  }
  if (vector.expected.turtle_never_contains) {
    list.push(['turtle_never_contains', !text.includes(vector.expected.turtle_never_contains), `present in\n${text}`]);
  }
  if (vector.expected.verdict_digest_exported !== undefined) {
    const digests = vector.input.items.map((item) => item.verdict_digest).filter(Boolean);
    const exported = /verdict/iu.test(nquads) || digests.some((d) => nquads.includes(d));
    list.push(['verdict_digest_exported', exported === vector.expected.verdict_digest_exported,
      `a verdict reached the export, or the one the case states did not:\n${nquads}`]);
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

/** The RDF property a reading's key is written with, or null (`derivation-of` has none, AGSC-05-23). */
function propertyOfKey(key) {
  if (nq.LINK_PROPERTIES[key]) return nq.LINK_PROPERTIES[key].property;
  const owner = RELATIONS.find((r) => r.inverse === key);
  return owner && nq.LINK_PROPERTIES[owner.key].inverse ? nq.LINK_PROPERTIES[owner.key].inverse : null;
}

/**
 * graph-0029 — the readings of AGSC-05-33, computed from the edges and in order; and no
 * transitive or closure reading is a triple of the dataset (they are never stored).
 */
function readingsCase(vector) {
  const { items } = vector.input;
  const got = derive.readings(linksModule.resolve(items).edges);
  const list = [['readings', jcs.canonicalize(got) === jcs.canonicalize(vector.expected.readings),
    `got ${jcs.canonicalize(got)}`]];
  const options = optionsFor({ ...vector.input, base: 'https://a.example/' });
  const lines = nq.toNQuads(items, options).split('\n');
  const iri = (slug) => nq.itemIri(items.find((i) => i.slug === slug), options);
  const stored = got.filter((r) => r.because[0].rule === 'transitive' || r.because[0].rule === 'closure')
    .filter((r) => propertyOfKey(r.key) !== null
      && lines.some((line) => line.startsWith(`<${iri(r.source)}> <${propertyOfKey(r.key)}> <${iri(r.target)}> `)));
  list.push(['graph_files_unchanged', (stored.length === 0) === vector.expected.graph_files_unchanged,
    `stored readings: ${JSON.stringify(stored.map((r) => [r.source, r.key, r.target]))}`]);
  return checks(list);
}

/** graph-0030 to graph-0039 — one of the ten questions of AGSC-05-34 over the shared fixture. */
function questionCase(vector) {
  const { items, question, subject, selection, at } = vector.input;
  const got = questions.answer(question, items, { subject, selection, at });
  return checks([[`question ${question}`, jcs.canonicalize(got) === jcs.canonicalize(vector.expected.answer),
    `got ${jcs.canonicalize(got)}`]]);
}

/** One item as a Markdown file: the front matter is JSON-valued YAML, which the parser reads. */
function itemFile(item) {
  const { body, ...front } = item;
  const lines = Object.entries(front).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return `---\n${lines.join('\n')}\n---\n\n${body || 'A short body.'}\n`;
}

/**
 * graph-0043 — the context address of `graph.jsonld` (AGSC-05-09): the same Bundle built at
 * Level 0 twice, the vocabulary reporting one ontology version and then another, names the
 * context version `1.0.0` both times and gives byte-identical documents.
 */
function contextAddressCase(vector, ctx) {
  const os = require('node:os');
  const { createFileSystem, readOntology, readSchemas } = require('../../../src/adapters/node-fs.js');
  const { createClock } = require('../../../src/adapters/node-clock.js');
  const { loadBundle } = require('../../../src/application/bundle.js');
  const validate = require('../../../src/knowledge/validate.js');
  const site = require('../../../src/distribution/site.js');
  const root = (ctx && ctx.root) || '.';
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-graph-0043-'));
  try {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'fixtures', 'minimal', 'agsc.config.json'), 'utf8'));
    config.site.base = vector.input.site.base;
    fs.writeFileSync(path.join(scratch, 'agsc.config.json'), JSON.stringify(config));
    fs.mkdirSync(path.join(scratch, 'content', 'concepts'), { recursive: true });
    for (const item of vector.input.items) {
      fs.writeFileSync(path.join(scratch, 'content', 'concepts', `${item.slug}.md`), itemFile(item));
    }
    const port = createFileSystem(scratch);
    const bundle = loadBundle(port, { schemas: validate.schemas(readSchemas(root)) });
    const clock = createClock({ env: { SOURCE_DATE_EPOCH: '1767225600' } });
    const terms = turtle.ontologyTerms(readOntology(root));
    const documents = vector.input.ontology_versions.map((ontologyVersion) => site.build(bundle,
      { clock, fs: port }, { level: 0, ontologyTerms: terms, ontologyVersion, specVersion: '1.0.0', version: '0.0.2' })
      .files.get('/graph.jsonld'));
    const urls = documents.map((d) => JSON.parse(d)['@context']);
    return checks([
      ['context_url', urls.every((u) => u === vector.expected.context_url), JSON.stringify(urls)],
      ['graph_jsonld_identical_across_ontology_versions',
        documents.every((d) => d === documents[0]) === vector.expected.graph_jsonld_identical_across_ontology_versions,
        'the documents differ across ontology versions'],
    ]);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
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

/**
 * graph-0028 — AGSC-05-09: the WHOLE of `graph.jsonld` and of every per-item file,
 * compared after JCS. The context is the one generated from `ontology/agsc.ttl`, the
 * published term names of AGSC-06-32; the per-item file is built the way the writer
 * builds it (`site.js`: the one-item view, each node taken from the whole graph).
 */
function jsonldWholeCase(vector, ctx) {
  const input = vector.input;
  const context = jsonldView.context(
    turtle.ontologyTerms(fs.readFileSync(path.join((ctx && ctx.root) || '.', 'ontology', 'agsc.ttl'), 'utf8')),
    jsonldView.allExternalProperties(),
  );
  const options = { ...optionsFor(input), context, contextUrl: input.context_url };
  const whole = jsonldView.toJsonLd(input.items, options);
  const nquads = nq.toNQuads(input.items, optionsFor(input));
  const list = [
    ['nquads', nquads === vector.expected.nquads, `got\n${nquads}`],
    ['graph.jsonld', jcs.canonicalize(whole) === jcs.canonicalize(vector.expected.graph_jsonld), jcs.canonicalize(whole)],
  ];
  const slugs = input.items.map((item) => item.slug).sort();
  list.push(['per-item files', jcs.canonicalize(slugs) === jcs.canonicalize(Object.keys(vector.expected.per_item).sort()), slugs.join(', ')]);
  for (const item of input.items) {
    const one = jsonldView.restrictTo(whole, jsonldView.toJsonLd([item], options));
    const want = vector.expected.per_item[item.slug];
    list.push([`pages/${item.slug}.jsonld`, want !== undefined && jcs.canonicalize(one) === jcs.canonicalize(want), jcs.canonicalize(one)]);
  }
  return checks(list);
}

// The handler is guarded (`_expected-reads.js`): a pass that left a member of
// `expected` unread is a fail.
module.exports.run = guarded((vector, ctx) => {
  const input = vector.input || {};
  if (vector.id === 'graph-0019') return termNamesCase(vector);
  if (vector.id === 'graph-0025') return mentionsCase(vector);
  if (Array.isArray(input.value) && input.bundle_id !== undefined) return memoryCase(vector);
  if (input.literal !== undefined) return literalFormsCase(vector);
  if (Array.isArray(input.ontology_terms)) return contextCase(vector, ctx);
  if (input.item && typeof input.item.markdown === 'string' && typeof input.bundle === 'string') return reservedExportBlockCase(vector, ctx);
  const expected = vector.expected || {};
  if (expected.graph_jsonld !== undefined) return jsonldWholeCase(vector, ctx);
  if (typeof expected.turtle === 'string' && expected.turtle.startsWith('@prefix ')) return wholeFileCase(vector);
  if (typeof input.question === 'number') return questionCase(vector);
  if (Array.isArray(expected.readings)) return readingsCase(vector);
  if (Array.isArray(input.ontology_versions)) return contextAddressCase(vector, ctx);
  if (Array.isArray(input.items)) return itemsCase(vector);
  return { status: 'fail', detail: `graph: no handler for the input shape ${Object.keys(input).join(', ')}` };
});

module.exports.clauses = clauses;
module.exports.normaliseClause = normaliseClause;
