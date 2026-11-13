'use strict';
// verifies AGSC-07-25, AGSC-09-13, AGSC-09-16, AGSC-03-27, AGSC-08-32
// The domain parts on the three hosts of one node: `agsc compose --brief` on the command line,
// the local tool server (`mcp-tools.js#tools` with the site vocabulary, as the `mcp` verb starts
// it, and the real `agsc mcp` child over standard input and output, so the verb's handover of the
// vocabulary to the stdio server is tested too) and the page tools run from the two scripts the
// build published. On a node whose note states a domain link and whose other note's context is a
// draft cluster: the brief lists the domain link and its computed inverse in `relations` on all
// three, and the three briefs are the same value; the draft cluster is named in no published
// script, no `domain` member of a page answer and no brief file, and the local server gives the
// listed item the same parts as the page. A `domain.contexts` entry with no namespace declares no
// context on either transport.
//
// Deterministic: the minimal fixture copied into a scratch folder, fixed SOURCE_DATE_EPOCH, no
// network (the page runs in a `vm` context with no `fetch`); the folder is removed afterwards.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawn, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const validate = require('../../src/knowledge/validate.js');
const { loadBundle } = require('../../src/application/bundle.js');
const { siteModel } = require('../../src/application/cli/verbs/lint.js');
const site = require('../../src/distribution/site.js');
const domainView = require('../../src/distribution/domain-view.js');
const { tools } = require('../../src/distribution/mcp-tools.js');
const { VALID } = require('../knowledge/_domain-fixtures.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const AGSC = path.join(ROOT, 'bin', 'agsc.js');
const EPOCH = '1767225600';
const sha256Hex = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const plain = (value) => JSON.parse(JSON.stringify(value));

/** Replace the frontmatter line `after` of a fixture file with itself and `lines`. */
function addLines(dir, rel, after, lines) {
  const file = path.join(dir, rel);
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.includes(`\n${after}\n`), `${rel} has no line ${after}`);
  fs.writeFileSync(file, text.replace(`\n${after}\n`, `\n${[after, ...lines].join('\n')}\n`));
}

/** The minimal fixture with a site vocabulary, a draft context cluster, and the domain keys of the case. */
function scratchNode() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-domain-parity-'));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  const config = JSON.parse(fs.readFileSync(path.join(dir, 'agsc.config.json'), 'utf8'));
  config.spec_version = '1.1.0';
  config.domain = { contexts: [{ cluster: 'secret-billing', namespace: 'https://minimal.example/ns/billing#' }], vocabulary: 'domain/vocabulary.ttl' };
  fs.writeFileSync(path.join(dir, 'agsc.config.json'), `${JSON.stringify(config, null, 2)}\n`);
  fs.mkdirSync(path.join(dir, 'domain'));
  fs.writeFileSync(path.join(dir, 'domain', 'vocabulary.ttl'), VALID);
  addLines(dir, 'content/concepts/handoff.md', 'kind: pattern', ['domain_type: Engine', 'domain_links:', '  controlled-by:', '    - supervisor']);
  fs.writeFileSync(path.join(dir, 'content', 'clusters', 'secret-billing.md'), ['---', 'type: cluster', 'title: Secret billing',
    'description: A context that is not published yet.', 'status: draft', 'date: "2026-01-01"', 'prov:', '  origin: human',
    '  operator: human:andreibesleaga', '---', '', '# Secret billing', '', 'Not yet.', ''].join('\n'));
  fs.writeFileSync(path.join(dir, 'content', 'concepts', 'invoice.md'), ['---', 'type: concept', 'title: Invoice',
    'description: A bill that a supervisor hands off.', 'clusters:', '  - secret-billing', 'domain_role: entity', 'related:',
    '  - handoff', 'date: "2026-01-01"', 'prov:', '  origin: human', '  operator: human:andreibesleaga', '---', '', '# Invoice', '',
    'A bill.', ''].join('\n'));
  return dir;
}

/** The page tools run from the two published scripts over the build's own routes, with no network. */
function pageToolset(files) {
  const sources = {};
  for (const [route, text] of files) sources[route] = String(text);
  const context = vm.createContext({ TextEncoder });
  for (const name of ['agsc-core.js', 'agsc-page-tools.js']) vm.runInContext(sources[`/compose/${name}`], context, { filename: name });
  const api = context.AGSC_PAGE_TOOLS;
  return { sources, toolset: api.install(api.pageCorpus(sources, { bundleId: api.BUNDLE_ID, licenseProse: api.LICENSE_PROSE }), context.AGSC_CORE, sha256Hex) };
}

/** The JSON-RPC lines a child wrote so far. */
const replies = (out) => out.split('\n').filter((line) => line.trim() !== '').map((line) => JSON.parse(line));

/**
 * One `tools/call` against the real `agsc mcp` child in `cwd`, driven by its answers, never by a
 * timer: `initialize`; on its answer the `initialized` notice and the call; on that answer, end of input.
 */
function stdioCall(cwd, name, args) {
  const initialize = { id: 1, jsonrpc: '2.0', method: 'initialize', params: { capabilities: {}, clientInfo: { name: 'test', version: '0' }, protocolVersion: '2025-11-25' } };
  const call = [{ jsonrpc: '2.0', method: 'notifications/initialized' }, { id: 2, jsonrpc: '2.0', method: 'tools/call', params: { arguments: args, name } }];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [AGSC, 'mcp'], { cwd, env: { NO_COLOR: '1', PATH: process.env.PATH, SOURCE_DATE_EPOCH: EPOCH }, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    let called = false;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d) => { err += d; });
    child.stdout.on('data', (d) => {
      out += d;
      const ids = replies(out).map((r) => r.id);
      if (ids.includes(2)) child.stdin.end();
      else if (ids.includes(1) && !called) {
        called = true;
        child.stdin.write(call.map((frame) => `${JSON.stringify(frame)}\n`).join(''));
      }
    });
    child.on('exit', () => resolve({ err, reply: replies(out).find((r) => r.id === 2) }));
    child.stdin.write(`${JSON.stringify(initialize)}\n`);
  });
}

let dir = null;
let hosts = null;
test.before(() => {
  dir = scratchNode();
  const cli = spawnSync(process.execPath, [AGSC, 'compose', 'handoff', 'invoice', '--brief'], {
    cwd: dir, encoding: 'utf8', env: { NO_COLOR: '1', PATH: process.env.PATH, SOURCE_DATE_EPOCH: EPOCH },
  });
  assert.equal(cli.status, 0, cli.stderr);
  const harness = path.join(dir, 'dist', 'harness');
  const companion = path.join(harness, fs.readdirSync(harness).find((name) => name.endsWith('.companion')));
  const files = Object.fromEntries(fs.readdirSync(companion).map((name) => [name, fs.readFileSync(path.join(companion, name), 'utf8')]));
  // The build the `mcp` verb makes, with the engine's spec_version, which the command line wrote.
  const bundle = loadBundle(createFileSystem(dir), { schemas: validate.schemas(readSchemas(ROOT)) });
  const built = site.build(bundle, { clock: createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } }), fs: createFileSystem(dir) },
    { specVersion: JSON.parse(files['brief.json']).spec_version, version: '0.0.0' });
  hosts = { cli: files, local: tools(bundle, { artifacts: built.files, domain: siteModel(bundle) }), page: pageToolset(built.files) };
});
test.after(() => {
  if (dir !== null) fs.rmSync(dir, { force: true, recursive: true });
});

const SELECTION = Object.freeze({ selection: ['handoff', 'invoice'] });

test('the brief lists the domain link and its computed inverse in relations, the same value on the three hosts (AGSC-07-25)', () => {
  const brief = JSON.parse(hosts.cli['brief.json']);
  const domainRows = brief.relations.filter((r) => r.key === 'controlled-by' || r.key === 'controls');
  assert.deepEqual(domainRows, [
    { key: 'controlled-by', origin: 'authored', scope: 'outside', source: 'handoff', target: 'supervisor' },
    { key: 'controls', origin: 'inverse', scope: 'outside', source: 'supervisor', target: 'handoff' },
  ]);
  assert.ok(hosts.cli['BRIEF.md'].includes('\n- `handoff` controlled-by `supervisor` (authored, outside)\n'));
  const local = plain(hosts.local.call('brief', SELECTION));
  assert.equal(local.type, 'brief', JSON.stringify(local));
  assert.deepEqual(local.body, brief);
  assert.deepEqual(plain(hosts.page.toolset.call('brief', SELECTION)).body, brief);
});

test('the real stdio server started by `agsc mcp` lists the domain link and its inverse in the brief (AGSC-07-25, AGSC-09-13)', async () => {
  const { err, reply } = await stdioCall(dir, 'brief', SELECTION);
  assert.ok(reply !== undefined && reply.result !== undefined, `no tools/call answer: ${err}`);
  const envelope = reply.result.structuredContent;
  assert.equal(envelope.type, 'brief', JSON.stringify(envelope));
  const domainRows = envelope.body.relations.filter((r) => r.key === 'controlled-by' || r.key === 'controls');
  assert.deepEqual(domainRows, [
    { key: 'controlled-by', origin: 'authored', scope: 'outside', source: 'handoff', target: 'supervisor' },
    { key: 'controls', origin: 'inverse', scope: 'outside', source: 'supervisor', target: 'handoff' },
  ]);
  assert.deepEqual(envelope.body, JSON.parse(hosts.cli['brief.json']));
});

test('a draft context cluster is named in no published script, no domain member of a page answer and no brief file (AGSC-09-16, AGSC-07-25)', () => {
  for (const name of ['agsc-core.js', 'agsc-page-tools.js']) {
    assert.doesNotMatch(hosts.page.sources[`/compose/${name}`], /secret-billing/u, `${name} names the draft cluster`);
  }
  for (const name of ['BRIEF.md', 'brief.json', 'brief.mmd', 'context.md']) {
    assert.doesNotMatch(hosts.cli[name], /secret-billing/u, `${name} names the draft cluster`);
  }
  const read = plain(hosts.page.toolset.call('read', { slug: 'invoice' }));
  assert.deepEqual(read.body.domain, { role: 'entity' });
  const hit = plain(hosts.page.toolset.call('search', { query: 'invoice' })).body.hits.find((h) => h.slug === 'invoice');
  assert.deepEqual(hit.domain, { role: 'entity' });
  // The local server, which answers drafts too, gives the listed item the same parts as the page.
  assert.deepEqual(plain(hosts.local.call('read', { slug: 'invoice' })).body.domain, { role: 'entity' });
});

test('a domain.contexts entry with no namespace declares no context, on the local server as on the page (AGSC-08-32)', () => {
  const config = { domain: { contexts: [{ cluster: 'k' }, { cluster: 'm', namespace: 'https://n.example/m#' }] } };
  const item = (slug, clusters) => ({ body: '', frontmatter: { clusters, domain_role: 'policy', title: slug, type: 'concept' }, slug, type: 'concept' });
  const local = tools({ config, items: [item('a', ['k']), item('b', ['m'])] }, {});
  assert.deepEqual(plain(local.call('read', { slug: 'a' })).body.domain, { role: 'policy' });
  assert.deepEqual(plain(local.call('read', { slug: 'b' })).body.domain, { context: 'm', role: 'policy' });
  assert.deepEqual(domainView.scripts([{ domain_role: 'policy', slug: 'a' }, { slug: 'k' }, { slug: 'm' }], config, null).contexts, ['m']);
});
