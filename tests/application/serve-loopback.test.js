'use strict';
// tests/application/serve-loopback.test.js — the `local` hosting profile, proved
// end to end: `agsc-host serve` answers the fixture build over loopback, the
// independent discovery checker (`tools/validate-wellknown`, AGSC-09-93) passes it at
// Level 2 against that live origin, and every route carries exactly the reference
// headers of `_headers` (AGSC-06-17, AGSC-11-03, AGSC-11-05), the built bytes and a
// SHA-256 entity tag. Loopback only: nothing leaves the machine, and the build's
// history is a fixed stub, so the run is the same every time.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFile } = require('node:child_process');

const hosting = require('../../src/application/hosting.js');
const rules = require('../../src/distribution/hosts/rules.js');
const { buildFixture, cleanup, temporary, ROOT } = require('../distribution/hosts/_build.js');

let node = null;
test.before(async () => {
  const root = path.join(temporary(), 'node');
  const site = path.join(root, 'www');
  const running = await hosting.serve({ bind: 'localhost', port: 0, site });
  const port = running.server.address().port;
  buildFixture({ base: `http://localhost:${port}/`, into: root });
  node = { origin: `http://localhost:${port}`, server: running.server, site, url: running.url };
});
test.after(() => new Promise((resolve) => {
  node.server.close(() => { cleanup(); resolve(); });
}));

/** One request over loopback; resolves with status, headers and body. */
function request(method, target, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${node.origin}${target}`, { headers, method }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ body: Buffer.concat(chunks), headers: res.headers, status: res.statusCode }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('the independent discovery checker passes the served node at Level 2, over loopback', async () => {
  const run = await new Promise((resolve) => {
    execFile(process.execPath, [path.join(ROOT, 'tools', 'validate-wellknown'), '--dev', '--level', '2', '--json',
      `${node.origin}/.well-known/knowledge-linkset`], { cwd: ROOT }, (error, stdout) => resolve({ code: error ? error.code : 0, stdout }));
  });
  const envelope = JSON.parse(run.stdout);
  assert.strictEqual(run.code, 0, run.stdout);
  assert.strictEqual(envelope.status, 'pass');
  assert.deepStrictEqual(envelope.findings, []);
});

test('every route: the built bytes, the reference headers exactly, a sha-256 entity tag, no Date', async () => {
  const { input } = hosting.readSite(node.site);
  const routes = rules.routesOf(input.files);
  assert.ok(routes.includes('/ledger.jsonl'), 'the build publishes the ledger (Level 2)');
  for (const route of routes) {
    const res = await request('GET', route);
    assert.strictEqual(res.status, 200, route);
    const rel = route.endsWith('/') ? `${route.slice(1)}index.html` : route.slice(1);
    const bytes = fs.readFileSync(path.join(node.site, rel));
    assert.ok(res.body.equals(bytes), `${route}: the served bytes are the built bytes`);
    for (const [name, value] of rules.headersFor(input.sets, route)) {
      assert.strictEqual(res.headers[name.toLowerCase()], value, `${route} ${name}`);
    }
    assert.strictEqual(res.headers.etag, `"${createHash('sha256').update(bytes).digest('hex')}"`, route);
    assert.ok(res.headers['content-type'], `${route} has a content type`);
    assert.strictEqual(res.headers.date, undefined, `${route}: no clock is read`);
    assert.strictEqual(res.headers['content-length'], String(bytes.length), route);
  }
});

test('HEAD sends the headers and no body; If-None-Match is 304', async () => {
  const head = await request('HEAD', '/graph.jsonld');
  assert.strictEqual(head.status, 200);
  assert.strictEqual(head.body.length, 0);
  assert.ok(Number(head.headers['content-length']) > 0);
  const again = await request('GET', '/graph.jsonld', { 'if-none-match': head.headers.etag });
  assert.strictEqual(again.status, 304);
  assert.strictEqual(again.body.length, 0);
});

test('redirects, directories, refusals and the 404 page, as the reference host answers them', async () => {
  const alias = await request('GET', '/.well-known/agentic-knowledge');
  assert.deepStrictEqual([alias.status, alias.headers.location], [301, '/.well-known/knowledge-linkset']);
  const dir = await request('GET', '/concepts');
  assert.deepStrictEqual([dir.status, dir.headers.location], [301, '/concepts/']);
  const post = await request('POST', '/');
  assert.deepStrictEqual([post.status, post.headers.allow], [405, 'GET, HEAD']);
  const bad = await request('GET', '/%E0%A4%A');
  assert.strictEqual(bad.status, 400);
  for (const target of ['/_headers', '/_redirects', '/no/such/route', '/concepts/?q=1x']) {
    const res = await request('GET', target);
    if (target.includes('?')) {
      assert.strictEqual(res.status, 200, 'the query string is not part of the path');
      continue;
    }
    assert.strictEqual(res.status, 404, target);
    assert.strictEqual(res.headers['content-type'], 'text/html; charset=utf-8', target);
    assert.ok(res.body.equals(fs.readFileSync(path.join(node.site, '404.html'))), target);
  }
});

test('a file the server cannot read is a 500 with no body, and the server keeps running', {
  skip: process.platform === 'win32' ? 'Windows has no POSIX mode bits: chmod 000 does not stop a read'
    : typeof process.getuid === 'function' && process.getuid() === 0 ? 'root reads any file' : false,
}, async () => {
  const locked = path.join(node.site, 'locked.txt');
  fs.writeFileSync(locked, 'secret');
  fs.chmodSync(locked, 0o000);
  try {
    const res = await request('GET', '/locked.txt');
    assert.strictEqual(res.status, 500);
    assert.strictEqual(res.body.length, 0);
  } finally {
    fs.chmodSync(locked, 0o600);
    fs.rmSync(locked);
  }
  assert.strictEqual((await request('GET', '/')).status, 200);
});
