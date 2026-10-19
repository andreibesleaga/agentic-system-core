'use strict';
// tests/tools/validate-wellknown-headers.test.js — AGSC-09-93 (amended 2026-10-06 for
// 1.0.0): given a URL, the independent checker reads the response headers of every
// same-origin public artefact it fetches and checks the rules on cross-origin reading
// (AGSC-11-03) and caching (AGSC-11-05). A missing header or value is AGSC-E202, a
// forbidden one AGSC-E201; errors at Level 2 and above, warnings below.
//
// Before the fix, the checker read only the
// media type, so both live nodes passed while they served no
// `Access-Control-Expose-Headers` at all. The same run proves a second fix:
// a check that reads more than ten files over one kept-alive connection printed
// "MaxListenersExceededWarning" before its verdict.
//
// A real process over real HTTP on a loopback server this test starts, serving a real
// build of the minimal fixture with the headers its own `_headers` gives each route
// and a SHA-256 entity tag — then the same server with one header taken away or added.
// No outside network (the checker's `--dev` admits plain http to loopback only).

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { after, before, it } = require('node:test');

const rules = require('../../src/distribution/hosts/rules.js');
const { buildFixture, cleanup } = require('../distribution/hosts/_build.js');
const { REPO } = require('./helpers');

let server;
let origin;
let site;
let sets;
/** What the server changes in a response's headers for the current case. */
let mutate = (headers) => headers;

/** A node under `/many/` whose document links fourteen files, each with a digest. */
const MANY = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`/many/f${String(i).padStart(2, '0')}.json`, `{"n":${i}}\n`]));
function many(route, res) {
  const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'Link, ETag, Content-Type', etag: '"x"' };
  if (route === '/many/.well-known/knowledge-linkset') {
    const digest = (text) => `sha-256=:${crypto.createHash('sha256').update(text).digest('base64')}:`;
    const targets = Object.keys(MANY).map((p) => ({ digest: [digest(MANY[p])], href: `${origin}${p}` }));
    res.writeHead(200, { ...cors, 'cache-control': 'no-cache',
      'content-type': 'application/linkset+json; profile="https://w3id.org/agentic-system-core/profile/agentic-knowledge"' });
    res.end(`${JSON.stringify({ linkset: [{ anchor: `${origin}/many/`, 'https://w3id.org/agentic-system-core/rel#graph': targets }] })}\n`);
    return;
  }
  res.writeHead(MANY[route] ? 200 : 404, cors);
  res.end(MANY[route] || '');
}

before(async () => {
  server = http.createServer((req, res) => {
    const route = req.url;
    if (route.startsWith('/many/')) {
      many(route, res);
      return;
    }
    const rel = route.endsWith('/') ? `${route.slice(1)}index.html` : route.slice(1);
    const file = path.join(site, rel);
    if (!file.startsWith(site + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404);
      res.end();
      return;
    }
    const bytes = fs.readFileSync(file);
    const headers = Object.fromEntries(rules.headersFor(sets, route).map(([k, v]) => [k.toLowerCase(), v]));
    headers.etag = `"${crypto.createHash('sha256').update(bytes).digest('hex')}"`;
    res.writeHead(200, mutate({ ...headers }, route));
    res.end(bytes);
  });
  await new Promise((resolve) => server.listen(0, 'localhost', resolve));
  origin = `http://localhost:${server.address().port}`;
  site = path.join(buildFixture({ base: `${origin}/` }), 'www');
  sets = rules.parseHeaders(fs.readFileSync(path.join(site, '_headers'), 'utf8')).sets;
});

after(() => {
  server.close();
  cleanup();
});

function check(level, at = '/') {
  return new Promise((resolve) => {
    execFile(process.execPath, [path.join(REPO, 'tools', 'validate-wellknown'),
      `${origin}${at}.well-known/knowledge-linkset`, '--level', String(level), '--dev', '--json'],
    { encoding: 'utf8' }, (error, stdout, stderr) => resolve({
      code: error ? error.code : 0, envelope: JSON.parse(stdout), stderr,
    }));
  });
}

const about = (envelope, rule) => envelope.findings.filter((f) => f.message.includes(rule));

it('a node served with the full header set passes at Level 2', async () => {
  mutate = (headers) => headers;
  const { code, envelope, stderr } = await check(2);
  assert.equal(code, 0, JSON.stringify(envelope.findings));
  assert.deepEqual(envelope.findings, []);
  assert.equal(stderr, '');
});

it('fifteen reads over one kept-alive connection print no Node warning', async () => {
  // Before the fix every request added a `connect` listener to the reused socket, and
  // the eleventh printed "MaxListenersExceededWarning" before the verdict.
  const { envelope, stderr } = await check(2, '/many/');
  assert.doesNotMatch(stderr, /MaxListenersExceededWarning|Warning/u);
  assert.ok(!envelope.findings.some((f) => /digest|AGSC-11-0[35]/u.test(f.message)), JSON.stringify(envelope.findings));
});

it('AGSC-11-03: no Access-Control-Expose-Headers is AGSC-E202 on the document and on every target read', async () => {
  mutate = (headers) => {
    delete headers['access-control-expose-headers'];
    return headers;
  };
  const { code, envelope } = await check(2);
  assert.equal(code, 1);
  const hits = about(envelope, 'AGSC-11-03');
  assert.ok(hits.length > 1, JSON.stringify(envelope.findings));
  assert.ok(hits.every((f) => f.code === 'AGSC-E202' && f.severity === 'error'), JSON.stringify(hits));
  assert.ok(hits.some((f) => f.message.includes('/.well-known/knowledge-linkset')), 'the document itself');
  assert.ok(hits.some((f) => f.message.includes('/graph.nq')), 'a target');
});

it('AGSC-11-03: below Level 2 the same shortfall is a warning and the document still passes', async () => {
  mutate = (headers) => {
    delete headers['access-control-expose-headers'];
    return headers;
  };
  const { code, envelope } = await check(0);
  assert.equal(code, 0, JSON.stringify(envelope.findings));
  assert.equal(envelope.status, 'pass');
  const hits = about(envelope, 'AGSC-11-03');
  assert.ok(hits.some((f) => f.message.includes('/.well-known/knowledge-linkset')), JSON.stringify(hits));
  assert.ok(hits.every((f) => f.code === 'AGSC-E202' && f.severity === 'warn'), JSON.stringify(hits));
});

it('AGSC-11-03: an exposed list without ETag, a narrowed origin and a credentials header are each reported', async () => {
  mutate = (headers, route) => {
    if (route === '/graph.nq') headers['access-control-expose-headers'] = 'Link, Content-Type';
    if (route === '/llms.txt') headers['access-control-allow-origin'] = 'https://example.org';
    if (route === '/.well-known/knowledge-linkset') headers['access-control-allow-credentials'] = 'true';
    return headers;
  };
  const { envelope } = await check(2);
  const hits = about(envelope, 'AGSC-11-03');
  const one = (pattern) => hits.filter((f) => pattern.test(f.message));
  assert.equal(one(/graph\.nq.*ETag/u).length, 1, JSON.stringify(hits));
  assert.equal(one(/graph\.nq.*ETag/u)[0].code, 'AGSC-E202');
  assert.equal(one(/llms\.txt.*Access-Control-Allow-Origin/u)[0].code, 'AGSC-E201');
  assert.equal(one(/knowledge-linkset.*Access-Control-Allow-Credentials/u)[0].code, 'AGSC-E201');
});

it('AGSC-11-05: no ETag, no no-cache on the document, and immutable anywhere are reported', async () => {
  mutate = (headers, route) => {
    if (route === '/graph.jsonld') delete headers.etag;
    if (route === '/.well-known/knowledge-linkset') delete headers['cache-control'];
    if (route === '/graph.ttl') headers['cache-control'] = 'public, max-age=31536000, immutable';
    return headers;
  };
  const { code, envelope } = await check(2);
  assert.equal(code, 1);
  const hits = about(envelope, 'AGSC-11-05');
  const one = (pattern) => hits.filter((f) => pattern.test(f.message));
  assert.equal(one(/graph\.jsonld.*ETag/u)[0].code, 'AGSC-E202', JSON.stringify(hits));
  assert.equal(one(/knowledge-linkset.*no-cache/u)[0].code, 'AGSC-E202');
  assert.equal(one(/graph\.ttl.*immutable/u)[0].code, 'AGSC-E201');
});

it('a file argument has no response headers: the header checks do not run on it', async () => {
  const run = await new Promise((resolve) => {
    execFile(process.execPath, [path.join(REPO, 'tools', 'validate-wellknown'),
      path.join(site, '.well-known', 'knowledge-linkset'), '--level', '2', '--dev', '--json'],
    { encoding: 'utf8' }, (error, stdout) => resolve({ code: error ? error.code : 0, envelope: JSON.parse(stdout) }));
  });
  assert.equal(run.code, 0, JSON.stringify(run.envelope.findings));
  assert.deepEqual(run.envelope.findings, []);
});

// AGSC-11-20: a restricted node applies the wildcard to its discovery document alone, so
// the checker asks the cross-origin pair of the document and of nothing else it reads.
// A second loopback origin, because the artefact paths are origin-rooted.
it('AGSC-11-20: a restricted node is asked the cross-origin pair on its document alone', async () => {
  const graph = '{"@graph":[]}\n';
  const llms = '# A node\n';
  let documentCors = true;
  const gated = http.createServer((req, res) => {
    const at = `http://localhost:${gated.address().port}`;
    const digest = (text) => `sha-256=:${crypto.createHash('sha256').update(text).digest('base64')}:`;
    const files = { '/graph.jsonld': graph, '/llms.txt': llms };
    if (req.url === '/.well-known/knowledge-linkset') {
      const ctx = {
        alternate: [{ digest: [digest(llms)], href: `${at}/llms.txt`, type: 'text/plain' }],
        anchor: `${at}/`,
        describedby: [{ 'agsc-generated-at': ['2026-01-01T00:00:00Z'], 'agsc-spec-version': ['1.0.0'],
          'agsc-visibility': ['restricted'], digest: [digest(graph)], href: `${at}/graph.jsonld`, type: 'application/ld+json' }],
        'https://w3id.org/agentic-system-core/rel#access': [{ 'agsc-access': ['credential'], href: `${at}/access/`, type: 'text/html' }],
      };
      res.writeHead(200, { 'cache-control': 'no-cache', etag: '"d"',
        'content-type': 'application/linkset+json; profile="https://w3id.org/agentic-system-core/profile/agentic-knowledge"',
        ...(documentCors ? { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'Link, ETag, Content-Type' } : {}) });
      res.end(`${JSON.stringify({ linkset: [ctx] })}\n`);
      return;
    }
    res.writeHead(files[req.url] ? 200 : 404, { etag: '"t"' });
    res.end(files[req.url] || '');
  });
  await new Promise((resolve) => gated.listen(0, 'localhost', resolve));
  const run = () => new Promise((resolve) => {
    execFile(process.execPath, [path.join(REPO, 'tools', 'validate-wellknown'),
      `http://localhost:${gated.address().port}/.well-known/knowledge-linkset`, '--level', '2', '--dev', '--json'],
    { encoding: 'utf8' }, (error, stdout) => resolve(JSON.parse(stdout)));
  });
  try {
    const clean = await run();
    assert.deepEqual(clean.findings, [], 'the gated graph and llms.txt carry no wildcard, as AGSC-11-20 requires');
    assert.equal(clean.status, 'pass');
    documentCors = false;
    const bare = await run();
    const hits = about(bare, 'AGSC-11-03');
    assert.equal(hits.length, 2, JSON.stringify(bare.findings));
    assert.ok(hits.every((f) => f.message.includes('/.well-known/knowledge-linkset') && f.code === 'AGSC-E202'));
  } finally {
    gated.close();
  }
});
