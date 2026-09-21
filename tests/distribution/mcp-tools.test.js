'use strict';
// Unit tests for the seven tools (WP-10-F).
// AGSC-08-18, AGSC-09-13, AGSC-09-13a, AGSC-09-14a, AGSC-09-14b.
// The Bundle is the fixture, read through the FileSystem port; no clock, no
// network, no randomness is reachable from any tool.

const test = require('node:test');
const assert = require('node:assert');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const validate = require('../../src/knowledge/validate.js');
const { loadBundle, TYPE_FOLDERS } = require('../../src/application/bundle.js');
const {
  tools, manifest, tokenize, envelope, errorEnvelope, itemIri,
  ARGUMENTS, CONTENT_USE_TERMS, NO_ANSWER, REQUIRED_ARGUMENTS,
} = require('../../src/distribution/mcp-tools.js');

const plain = (v) => JSON.parse(JSON.stringify(v));

function fixture() {
  const schemas = validate.schemas(readSchemas('.'));
  return loadBundle(createFileSystem('tests/fixtures/minimal'), { schemas });
}

test('the Bundle loader reads the fixture deterministically, items sorted by slug', () => {
  const bundle = fixture();
  assert.deepStrictEqual(bundle.items.map((i) => i.slug), ['agent-patterns', 'handoff', 'supervisor']);
  assert.deepStrictEqual(plain(bundle.findings), []);
  assert.strictEqual(bundle.index.frontmatter.title, 'Minimal Bundle');
  assert.strictEqual(bundle.byslug.get('handoff').type, 'concept');
  assert.strictEqual(TYPE_FOLDERS.concepts, 'concept');
  // Two loads of the same bytes give the same record.
  assert.deepStrictEqual(plain(fixture().items), plain(bundle.items));
});

test('the loader reports a missing or malformed configuration as a Finding', () => {
  const empty = { exists: () => false, readdir: () => [], readFile: () => '' };
  assert.deepStrictEqual(plain(loadBundle(empty, {}).findings), [{
    code: 'AGSC-E901', file: 'agsc.config.json',
    message: 'agsc.config.json is missing (AGSC-01-12)', severity: 'error',
  }]);
  const broken = {
    exists: (p) => p === 'agsc.config.json', readdir: () => [], readFile: () => '{ not json',
  };
  assert.strictEqual(loadBundle(broken, {}).findings[0].code, 'AGSC-E201');
});

test('the loader reports a malformed content/index.md with its registered code', () => {
  const files = {
    'agsc.config.json': '{}',
    'content/index.md': '---\nx: &a 1\n---\n\nbody\n',
  };
  const ports = {
    exists: (p) => Object.prototype.hasOwnProperty.call(files, p),
    readFile: (p) => files[p],
    readdir: () => [],
  };
  const bundle = loadBundle(ports, {});
  assert.strictEqual(bundle.findings[0].file, 'content/index.md');
  assert.match(bundle.findings[0].code, /^AGSC-E1/u);
  assert.strictEqual(bundle.index.body.trim(), 'body');
  assert.strictEqual(bundle.root, '');
});

test('AGSC-09-13: exactly seven tools, with their argument names', () => {
  const list = manifest().tools;
  assert.deepStrictEqual(list.map((t) => t.name), ['ask', 'compose', 'links', 'propose', 'read', 'remember', 'search']);
  for (const tool of list) {
    assert.deepStrictEqual(Object.keys(tool.inputSchema.properties), [...ARGUMENTS[tool.name]]);
    assert.deepStrictEqual(tool.inputSchema.required, REQUIRED_ARGUMENTS[tool.name]);
    assert.strictEqual(typeof tool.description, 'string');
  }
});

test('AGSC-08-18: every result carries source, trust, license, type and body', () => {
  const toolset = tools(fixture(), {});
  for (const name of manifest().tools.map((t) => t.name)) {
    const result = toolset.call(name, { question: 'x', query: 'x', selection: [], slug: 'handoff', title: 'T' });
    // AGSC-09-14a as amended at rc.5 (V9D-07, cli-0007): `ask` — and only `ask` —
    // adds EXACTLY ONE top-level member, `citations[]`, to the AGSC-08-18 envelope.
    assert.deepStrictEqual(Object.keys(result),
      name === 'ask' ? ['body', 'citations', 'license', 'source', 'trust', 'type']
        : ['body', 'license', 'source', 'trust', 'type']);
    assert.strictEqual(result.trust, 'untrusted');
    assert.strictEqual(result.license, CONTENT_USE_TERMS);
    assert.strictEqual(result.source, name);
  }
  assert.deepStrictEqual(envelope('x', 'y', 1), { body: 1, license: CONTENT_USE_TERMS, source: 'x', trust: 'untrusted', type: 'y' });
});

test('AGSC-09-13a: an unknown tool and an unknown slug are envelopes, never throws', () => {
  const toolset = tools(fixture(), {});
  assert.strictEqual(toolset.call('nonesuch', {}).body.code, 'AGSC-E001');
  assert.strictEqual(toolset.call('read', { slug: 'no-such-item' }).body.code, 'AGSC-E301');
  // F27-10: a call with no `slug` at all is a MISSING ARGUMENT, not an unknown slug.
  assert.strictEqual(toolset.call('read').body.code, 'AGSC-E003');
  assert.strictEqual(toolset.call('links', { slug: 'no-such-item' }).body.code, 'AGSC-E301');
  assert.strictEqual(toolset.call('propose', { slug: 'no-such-item' }).body.code, 'AGSC-E301');
  assert.strictEqual(errorEnvelope('read', 'AGSC-E301').body.message, '');
});

test('AGSC-05-04b: a memory:// alias naming a foreign bundle is AGSC-E309', () => {
  const toolset = tools(fixture(), {});
  assert.strictEqual(toolset.call('links', { iri: 'memory://other-bundle/concepts/x' }).body.code, 'AGSC-E309');
  // The node's own alias resolves, as does its HTTPS IRI.
  assert.strictEqual(toolset.call('links', { iri: 'memory://minimal/concepts/handoff' }).body.slug, 'handoff');
  assert.strictEqual(toolset.call('links', { iri: 'https://minimal.example/concepts/handoff/' }).body.slug, 'handoff');
  assert.strictEqual(toolset.call('links', { iri: 'https://elsewhere.example/x' }).body.code, 'AGSC-E301');
});

test('AGSC-09-13: read returns the item, links its authored edges, compose a verdict', () => {
  const toolset = tools(fixture(), {});
  const read = toolset.call('read', { slug: 'supervisor' });
  assert.strictEqual(read.type, 'item');
  assert.strictEqual(read.body.iri, 'https://minimal.example/concepts/supervisor/');
  assert.match(read.body.body, /^\n## Intent/u);
  // The Knowledge context's resolver owns the edge record and may carry more
  // members than the authored triple (computed inverses, AGSC-03-04; the
  // untyped `mentions` edge an inline body link produces, AGSC-03-11), so the
  // assertion is on the authored edge itself and on the body edge beside it.
  const edges = plain(toolset.call('links', { slug: 'supervisor' }).body.edges);
  const authored = edges.filter((e) => e.key === 'uses');
  assert.strictEqual(authored.length, 1);
  assert.strictEqual(authored[0].source, 'supervisor');
  assert.strictEqual(authored[0].target, 'handoff');
  // AGSC-03-11: `See [Handoff](handoff)` in the body is one `mentions` edge.
  assert.deepStrictEqual(edges.filter((e) => e.key === 'mentions').map((e) => e.target), ['handoff']);
  const verdict = toolset.call('compose', { selection: ['supervisor', 'handoff'] });
  assert.deepStrictEqual(Object.keys(verdict.body), ['added', 'conflicts', 'hidden', 'selection', 'valid', 'warnings']);
  assert.strictEqual(verdict.body.valid, true);
  // F27-10: `selection` is published as required, so an absent one is AGSC-E003.
  assert.strictEqual(toolset.call('compose', {}).body.code, 'AGSC-E003');
});

test('AGSC-06-23: the tokenizer lower-cases ASCII, keeps letters and drops short tokens', () => {
  assert.deepStrictEqual(tokenize('Supervisor and Handoff'), ['supervisor', 'and', 'handoff']);
  assert.deepStrictEqual(tokenize('a bc'), ['bc']);
  assert.deepStrictEqual(tokenize('कानबान बोर्ड'), ['कानबान', 'बोर्ड']);
  assert.deepStrictEqual(tokenize('two² Ⅷ'), ['two']);
  assert.deepStrictEqual(tokenize(undefined), []);
});

test('AGSC-09-14a: ask cites at least one IRI, or says exactly so', () => {
  const toolset = tools(fixture(), {});
  const answer = toolset.call('ask', { question: 'supervisor' });
  assert.strictEqual(answer.type, 'answer');
  // rc.5: `citations[]` is a TOP-LEVEL member and `body` is the answer TEXT, with
  // the Content Use Terms line embedded in it (AGSC-09-14a, cli-0007).
  assert.strictEqual(typeof answer.body, 'string');
  assert.ok(answer.citations.length >= 1);
  assert.ok(answer.citations.every((c) => c.startsWith('https://minimal.example/')));
  assert.ok(answer.body.includes(CONTENT_USE_TERMS));
  assert.strictEqual(answer.license, CONTENT_USE_TERMS);
  const nothing = toolset.call('ask', { question: 'zzzzzzz' });
  assert.strictEqual(nothing.body, NO_ANSWER, 'the no-answer body is exactly the fixed string');
  assert.deepStrictEqual(plain(nothing.citations), []);
  // F27-10: `question` and `query` are published as required arguments.
  assert.strictEqual(toolset.call('ask', {}).body.code, 'AGSC-E003');
  assert.strictEqual(toolset.call('search', {}).body.code, 'AGSC-E003');
  // An EMPTY string is supplied, not missing, and keeps the total-function answer.
  assert.strictEqual(toolset.call('ask', { question: '' }).body, NO_ANSWER);
  assert.deepStrictEqual(plain(toolset.call('search', { query: '' }).body.hits), []);
});

test('AGSC-08-04: propose returns the payload and performs no write', () => {
  const toolset = tools(fixture(), {});
  const proposal = toolset.call('propose', { slug: 'handoff' });
  assert.strictEqual(proposal.type, 'proposal');
  assert.match(proposal.body.markdown, /^---\ntype: concept\n/u);
  assert.match(proposal.body.markdown, /tags:\n {2}- agents\n/u);
  assert.match(proposal.body.markdown, /prov:\n {2}origin: human\n/u);
});

test('AGSC-09-14b: remember synthesizes a conforming item from a fixed instant', () => {
  const toolset = tools(fixture(), {});
  const result = toolset.call('remember', {
    at: '2026-01-01T00:00:00Z', body: 'It ran.', kind: 'episode', title: 'A Recorded Run',
  });
  assert.strictEqual(result.body.slug, 'a-recorded-run');
  assert.strictEqual(result.body.path, 'content/episodes/a-recorded-run.md');
  assert.strictEqual(result.body.frontmatter.started, '2026-01-01T00:00:00Z');
  assert.strictEqual(result.body.frontmatter.outcome, 'partial');
  assert.strictEqual(result.body.frontmatter.severity, 'info');
  assert.strictEqual(result.body.frontmatter.prov.origin, 'ai-generated');
  // A concept gets `kind: explainer`; an unknown kind falls back to a concept.
  assert.strictEqual(toolset.call('remember', { body: '', kind: 'concept', title: 'T' }).body.frontmatter.kind, 'explainer');
  assert.strictEqual(toolset.call('remember', { body: '', kind: 'nonsense', title: 'T' }).body.frontmatter.type, 'concept');
  // A client asserting `human` keeps that origin.
  assert.strictEqual(toolset.call('remember', { body: '', kind: 'concept', origin: 'human', title: 'T' })
    .body.frontmatter.prov.origin, 'human');
});

test('AGSC-09-14b: remember is total — a bad source is DROPPED with AGSC-E506', () => {
  const toolset = tools(fixture(), {});
  const result = toolset.call('remember', {
    body: '',
    kind: 'concept',
    sources: [{ id: 'a', resource: 'ftp://bad/' }, { id: 'b', resource: 'https://ok.example/x' },
      { id: 'c', resource: 'urn:agsc:channel:mail:abc' }, {}],
    title: 'T',
  });
  assert.strictEqual(result.type, 'proposal');
  assert.strictEqual(result.body.findings.length, 2);
  assert.ok(result.body.findings.every((f) => f.code === 'AGSC-E506' && f.severity === 'warn'));
  assert.deepStrictEqual(plain(result.body.frontmatter.sources),
    [{ id: 'b', resource: 'https://ok.example/x' }, { id: 'c', resource: 'urn:agsc:channel:mail:abc' }]);
});

test('AGSC-02-91: a colliding remember slug takes the -2 suffix', () => {
  const toolset = tools(fixture(), {});
  assert.strictEqual(toolset.call('remember', { body: '', kind: 'concept', title: 'Handoff' }).body.slug, 'handoff-2');
});

test('itemIri uses the type plural of the route set', () => {
  assert.strictEqual(itemIri('https://a.example/', { slug: 'x', type: 'cluster' }), 'https://a.example/clusters/x/');
  assert.strictEqual(itemIri('https://a.example/', { slug: 'x' }), 'https://a.example/concepts/x/');
  assert.strictEqual(itemIri('https://a.example', { slug: 'x', type: 'lesson' }), 'https://a.example/lessons/x/');
});

test('a Bundle may carry its own byslug Map, and a missing site base still resolves', () => {
  const bundle = { config: {}, items: [{ body: '', frontmatter: {}, slug: 'a', type: 'concept' }] };
  const toolset = tools(bundle, {});
  assert.strictEqual(toolset.call('read', { slug: 'a' }).body.iri, '/concepts/a/');
});

// F27-03 (D94: never hand-write what a module already provides). `propose` used to
// build its Markdown with a local YAML writer that emitted unparseable bytes for an
// ordinary title. It now uses knowledge/adopt.js#serialize, the one canonical writer
// (AGSC-04-19, AGSC-09-16's one-contract byte claim).
test('AGSC-09-16: propose serialises frontmatter through the canonical writer', () => {
  const yaml = require('../../src/knowledge/yaml.js');
  const frontmatter = {
    title: 'Handoff: the protocol',
    description: '#not a comment',
    note: 'line one\nline two',
    astral: 'a \u{1F600} \u{20BB7} z',
    nested: { depth: 'two', kind: 'object' },
    tags: ['a: b', '- c'],
  };
  const bundle = {
    byslug: new Map([['handoff', { slug: 'handoff', type: 'concept', frontmatter, body: 'Body text.\n' }]]),
    config: { site: { base: '/' } },
    items: [],
  };
  const markdown = tools(bundle, {}).call('propose', { slug: 'handoff' }).body.markdown;
  assert.ok(markdown.startsWith('---\n'), 'the fenced block opens the document');
  const yamlText = markdown.slice(4, markdown.indexOf('\n---\n', 3) + 1);
  const parsed = JSON.parse(JSON.stringify(yaml.parse(yamlText)));
  assert.deepStrictEqual(parsed, JSON.parse(JSON.stringify(frontmatter)),
    'every value survives the round trip through the failsafe parser');
  assert.ok(markdown.endsWith('\n\nBody text.\n'), 'the body follows one blank line');
});

// F27-10: `REQUIRED_ARGUMENTS` was published in the manifest's `inputSchema.required`
// and enforced nowhere, so `remember` with no body and no title returned a SUCCESSFUL
// Proposal payload with an empty body (AGSC-09-13a, AGSC-E003 "missing argument").
test('AGSC-09-13a: a call missing a required argument is an error envelope', () => {
  const toolset = tools(fixture(), {});
  for (const name of Object.keys(REQUIRED_ARGUMENTS)) {
    const required = REQUIRED_ARGUMENTS[name];
    const result = toolset.call(name, {});
    if (required.length === 0) {
      assert.notStrictEqual(result.body.code, 'AGSC-E003', `${name} requires nothing`);
      continue;
    }
    assert.strictEqual(result.type, 'error', name);
    assert.strictEqual(result.body.code, 'AGSC-E003', name);
    for (const key of required) assert.ok(result.body.message.includes(key), `${name}: ${key} is named`);
  }
  // The probed case: a Proposal payload must never come back for an empty `remember`.
  const remembered = toolset.call('remember', {});
  assert.strictEqual(remembered.type, 'error');
  assert.strictEqual(remembered.body.code, 'AGSC-E003');
  // A partial call names only what is missing.
  const partial = toolset.call('remember', { body: 'text', kind: 'note' });
  assert.strictEqual(partial.body.code, 'AGSC-E003');
  assert.strictEqual(partial.body.message, 'missing required argument: title');
});

// F27-12: no size cap on tool text arguments — a 2 MB `search` query or `ask` question
// bought work proportional to input × corpus. AGSC-01-16's 1 MiB cap is the bound and
// AGSC-E904 the registered code; the check runs before dispatch, so nothing is scanned.
test('AGSC-01-16: a text argument above the 1 MiB cap is AGSC-E904', () => {
  const toolset = tools(fixture(), {});
  const twoMegabytes = 'a'.repeat(2 * 1024 * 1024);
  for (const [name, args] of [
    ['search', { query: twoMegabytes }],
    ['ask', { question: twoMegabytes }],
    ['remember', { body: twoMegabytes, kind: 'note', title: 'x' }],
  ]) {
    const result = toolset.call(name, args);
    assert.strictEqual(result.type, 'error', name);
    assert.strictEqual(result.body.code, 'AGSC-E904', name);
    assert.match(result.body.message, /AGSC-01-16/u);
  }
  // The cap counts UTF-8 BYTES, not code points: 600 000 four-byte characters are over it.
  const astral = '\u{1F600}'.repeat(600000);
  assert.strictEqual(toolset.call('search', { query: astral }).body.code, 'AGSC-E904');
  // Exactly at the cap is admitted.
  assert.notStrictEqual(toolset.call('search', { query: 'a'.repeat(1024 * 1024) }).body.code, 'AGSC-E904');
});

test('AGSC-06-23: the search tool tokenizes title, description and tags, not the body alone', () => {
  // The defect cli-0007 found: a loaded Bundle carries title/description under
  // `frontmatter`, and `search.tokenizerInput` reads a FLAT item, so until rc.5 the
  // tool matched neither. A hit must mean the same thing here and in `search.json`.
  const bundle = {
    config: { site: { base: 'https://a.example/' } },
    items: [{
      body: 'An unrelated sentence.',
      frontmatter: { description: 'Routes work to workers.', tags: ['dispatch'], title: 'Supervisor', type: 'concept' },
      slug: 'supervisor',
      type: 'concept',
    }],
  };
  const toolset = tools(bundle, {});
  for (const query of ['supervisor', 'routes', 'workers', 'dispatch', 'unrelated']) {
    assert.strictEqual(toolset.call('search', { query }).body.hits.length, 1, query);
  }
  assert.strictEqual(toolset.call('search', { query: 'nowherenear' }).body.hits.length, 0);
  // And `ask` cites the item it found, with the terms line in the answer text.
  const answer = toolset.call('ask', { question: 'who routes work?' });
  assert.deepStrictEqual(plain(answer.citations), ['https://a.example/concepts/supervisor/']);
  assert.ok(answer.body.includes(CONTENT_USE_TERMS));
});
