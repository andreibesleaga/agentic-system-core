'use strict';
// tests/tools/validate-wellknown-limits.test.js — AGSC-11-10(e, f): every cross-origin
// fetch is held to `federation.timeout_ms` PER RESPONSE and to its byte cap — 1 MiB
// for a discovery document, `federation.max_bytes` for any other artefact — and is
// aborted at the bound with `AGSC-E907`.
//
// The deadline is one timer from the request to the last byte, never an idle timer
// that each arriving chunk would reset, so a server sending one byte every few seconds
// cannot hold the checker. A response over the cap is `AGSC-E907`, the fetch code the
// rule names, and only the discovery document is held to 1 MiB, so a node whose
// `graph.jsonld` is over 1 MiB passes at Level 2.
// A local FILE over 1 MiB stays `AGSC-E904` (AGSC-01-16): that is an input, not a fetch.
//
// The deadline tests call the checker in process with a fake timer (the `timer` of
// `run`'s second argument), so they wait for no real deadline: the test fires it. The
// cap tests run the shipped command as a real process. Both go over real HTTP to a
// loopback server this test starts (the checker's `--dev` admits plain http to
// loopback only); no outside network.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { after, before, it } = require('node:test');

const { REPO } = require('./helpers');

const tool = require(path.join(REPO, 'tools', 'validate-wellknown'));

const MIB = 1024 * 1024;
const TYPE = 'application/linkset+json; profile="https://w3id.org/agentic-system-core/profile/agentic-knowledge"';

let server;
let origin;
/** Resolved by the server once it has sent part of `/stall/` and holds the rest back. */
let stalled;
let markStalled = () => {};

/** The cross-origin and caching headers of a conforming discovery document. */
const SERVED = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'Link, ETag, Content-Type',
  'cache-control': 'no-cache', 'content-type': TYPE, etag: '"e"' };

function documentAt(anchor, extra = {}) {
  return `${JSON.stringify({
    linkset: [{
      alternate: [{ href: `${anchor}llms.txt`, type: 'text/plain' }],
      anchor,
      describedby: [{ href: `${anchor}graph.jsonld`, type: 'application/ld+json', ...extra }],
    }],
  })}\n`;
}

/** A document with `count` describedby targets, each carrying a digest, so Level 2 fetches every one. */
function manyTargets(anchor, count) {
  const digest = [`sha-256=:${crypto.createHash('sha256').update('{}').digest('base64')}:`];
  return `${JSON.stringify({
    linkset: [{
      alternate: [{ href: `${anchor}llms.txt`, type: 'text/plain' }],
      anchor,
      describedby: Array.from({ length: count }, (_, i) => ({ digest, href: `${anchor}t${i}.jsonld`, type: 'application/ld+json' })),
    }],
  })}\n`;
}
/** How many target requests the server saw under /many/ (the document itself is not counted). */
let targetRequests = 0;

const bigGraph = Buffer.alloc(2 * MIB, 0x20);
const bigDigest = `sha-256=:${crypto.createHash('sha256').update(bigGraph).digest('base64')}:`;

before(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/stall/.well-known/knowledge-linkset') {
      // Two pieces of the body, then nothing: the response never completes.
      const body = Buffer.from(documentAt(`${origin}/stall/`));
      res.writeHead(200, { ...SERVED, 'content-length': String(body.length) });
      res.write(body.subarray(0, 10), () => res.write(body.subarray(10, 20), () => markStalled()));
      return;
    }
    if (req.url === '/many/.well-known/knowledge-linkset') {
      res.writeHead(200, SERVED);
      res.end(manyTargets(`${origin}/many/`, 6));
      return;
    }
    if (req.url.startsWith('/many/t')) {
      targetRequests += 1;
      res.writeHead(200, { 'content-type': 'application/ld+json' });
      res.end('{}');
      return;
    }
    if (req.url === '/surf/.well-known/knowledge-linkset') {
      res.writeHead(200, SERVED);
      res.end(`${JSON.stringify({ linkset: [{
        anchor: `${origin}/surf/`,
        'https://w3id.org/agentic-system-core/rel#surface': [{ href: `${origin}/surf/llms.txt`, 'agsc-access': ['open'], 'agsc-surface': ['llms-txt'] }],
      }] })}\n`);
      return;
    }
    if (req.url === '/surf/llms.txt') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('# x\n');
      return;
    }
    if (req.url === '/quick/.well-known/knowledge-linkset') {
      res.writeHead(200, SERVED);
      res.end(documentAt(`${origin}/quick/`));
      return;
    }
    if (req.url === '/big/.well-known/knowledge-linkset') {
      res.writeHead(200, { 'content-type': TYPE });
      res.end(Buffer.concat([Buffer.from('{"linkset":[],"x":"'), Buffer.alloc(MIB, 0x61), Buffer.from('"}')]));
      return;
    }
    if (req.url === '/large-graph/.well-known/knowledge-linkset') {
      res.writeHead(200, { 'content-type': TYPE });
      res.end(documentAt(`${origin}/large-graph/`, { digest: [bigDigest] }));
      return;
    }
    if (req.url === '/large-graph/graph.jsonld') {
      res.writeHead(200, { 'content-type': 'application/ld+json' });
      res.end(bigGraph);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

function check(target, level = '0') {
  return new Promise((resolve) => {
    execFile(process.execPath, [path.join(REPO, 'tools', 'validate-wellknown'), target, '--level', level, '--dev', '--json'],
      { encoding: 'utf8', timeout: 60000 }, (error, stdout) => resolve({ code: error ? error.code : 0, envelope: JSON.parse(stdout) }));
  });
}

/**
 * A timer the test fires itself: it records every deadline the checker sets (its
 * callback and its length) and every one it clears.
 */
function fakeTimer() {
  const set = [];
  const cleared = [];
  return {
    clear(handle) { cleared.push(handle); },
    cleared,
    set(callback, ms) { const handle = { callback, ms }; set.push(handle); return handle; },
    setCalls: set,
  };
}

/** The checker in process, with a fake timer; the streams are captured. */
function inProcess(target, timer) {
  const io = { err: '', out: '' };
  const done = tool.run([target, '--dev', '--json'], { err: (s) => { io.err += s; }, out: (s) => { io.out += s; }, timer });
  return { done, io };
}

it('a response that does not complete within the deadline is AGSC-E907, and arriving data does not move the deadline', async () => {
  const started = process.hrtime.bigint();
  stalled = new Promise((resolve) => { markStalled = resolve; });
  const timer = fakeTimer();
  const { done, io } = inProcess(`${origin}/stall/.well-known/knowledge-linkset`, timer);
  await stalled;
  // One deadline for the response, of the default length, set before the first byte.
  assert.equal(timer.setCalls.length, 1);
  assert.equal(timer.setCalls[0].ms, 10000);
  timer.setCalls[0].callback();
  const code = await done;
  assert.equal(code, 1, io.out);
  const hit = JSON.parse(io.out).findings.find((f) => f.code === 'AGSC-E907');
  assert.ok(hit, io.out);
  assert.match(hit.message, /^timeout: no complete response within 10000 ms \(AGSC-11-10\(e, f\)\)$/u);
  // The two pieces that arrived set no new deadline.
  assert.equal(timer.setCalls.length, 1);
  assert.ok(process.hrtime.bigint() - started < 1_000_000_000n, 'the deadline test waited for real time');
});

it('a complete response clears its own deadline, and only that one', async () => {
  const timer = fakeTimer();
  const { done, io } = inProcess(`${origin}/quick/.well-known/knowledge-linkset`, timer);
  assert.equal(await done, 0, io.out);
  assert.equal(io.err, '');
  assert.equal(JSON.parse(io.out).status, 'pass');
  assert.equal(timer.setCalls.length, 1);
  assert.ok(timer.cleared.length >= 1);
  assert.ok(timer.cleared.every((handle) => handle === timer.setCalls[0]), 'a deadline other than the response\'s own was cleared');
});

it('a fetched discovery document over 1 MiB is AGSC-E907, not AGSC-E904', async () => {
  const { code, envelope } = await check(`${origin}/big/.well-known/knowledge-linkset`);
  assert.notEqual(code, 0);
  const codes = envelope.findings.map((f) => f.code);
  assert.ok(codes.includes('AGSC-E907'), JSON.stringify(envelope.findings));
  assert.ok(!codes.includes('AGSC-E904'), JSON.stringify(envelope.findings));
});

it('a target over 1 MiB and under federation.max_bytes is read and its digest checked', async () => {
  const { envelope } = await check(`${origin}/large-graph/.well-known/knowledge-linkset`, '2');
  const about = envelope.findings.filter((f) => /relation describedby|graph\.jsonld/u.test(f.message));
  assert.ok(!about.some((f) => ['AGSC-E904', 'AGSC-E907'].includes(f.code)), JSON.stringify(about));
  assert.ok(!about.some((f) => /digest does not match/u.test(f.message)), JSON.stringify(about));
});

it('a local file over 1 MiB stays AGSC-E904, the input cap of AGSC-01-16', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-wk-limits-'));
  try {
    const file = path.join(dir, '.well-known', 'knowledge-linkset');
    fs.mkdirSync(path.dirname(file));
    fs.writeFileSync(file, Buffer.alloc(MIB + 1, 0x20));
    const { envelope } = await check(file);
    assert.ok(envelope.findings.some((f) => f.code === 'AGSC-E904'), JSON.stringify(envelope.findings));
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

// I-083 (AGSC-11-10(c)): no document can make the checker fetch without bound. The
// request budget is `federation.max_requests` (500 by default, 1 to 2000); every request,
// the document's own included, counts, and the one past the budget is AGSC-E906.
it('--max-requests ends a run that would fetch more targets than the budget, with AGSC-E906', async () => {
  targetRequests = 0;
  const done = await new Promise((resolve) => {
    execFile(process.execPath, [path.join(REPO, 'tools', 'validate-wellknown'), `${origin}/many/.well-known/knowledge-linkset`,
      '--level', '2', '--dev', '--json', '--max-requests', '3'], { encoding: 'utf8', timeout: 60000 },
    (error, stdout) => resolve({ code: error ? error.code : 0, envelope: JSON.parse(stdout) }));
  });
  assert.equal(targetRequests, 2, 'the document plus two targets spend the budget of three');
  const hits = done.envelope.findings.filter((f) => f.code === 'AGSC-E906');
  assert.ok(hits.length >= 1, JSON.stringify(done.envelope.findings));
  assert.match(hits[0].message, /request budget of 3/u);
});

it('--max-requests spent while resolving a rel#surface target is AGSC-E906, not "does not resolve"', async () => {
  const done = await new Promise((resolve) => {
    execFile(process.execPath, [path.join(REPO, 'tools', 'validate-wellknown'), `${origin}/surf/.well-known/knowledge-linkset`,
      '--level', '2', '--dev', '--json', '--max-requests', '1'], { encoding: 'utf8', timeout: 60000 },
    (error, stdout) => resolve({ code: error ? error.code : 0, envelope: JSON.parse(stdout) }));
  });
  const surface = done.envelope.findings.filter((f) => /rel#surface/u.test(f.message));
  assert.ok(surface.some((f) => f.code === 'AGSC-E906'), JSON.stringify(done.envelope.findings));
  assert.ok(!surface.some((f) => /does not resolve/u.test(f.message) && f.code === 'AGSC-E210'), JSON.stringify(surface));
});

it('without --max-requests the default budget of 500 lets a small document through', async () => {
  targetRequests = 0;
  const { envelope } = await check(`${origin}/many/.well-known/knowledge-linkset`, '2');
  assert.equal(targetRequests, 6);
  assert.ok(!envelope.findings.some((f) => f.code === 'AGSC-E906'), JSON.stringify(envelope.findings));
});

it('--max-requests takes a whole number from 1 to 2000', async () => {
  for (const bad of ['0', '2001', 'ten', '']) {
    const io = { err: '', out: '' };
    const code = await tool.run(['x', '--max-requests', bad], { err: (s) => { io.err += s; }, out: (s) => { io.out += s; } });
    assert.equal(code, 2, bad);
    assert.match(io.err, /AGSC-E003 --max-requests needs a whole number from 1 to 2000/u);
  }
});

// I-083 (opt-in): the Python checker needs --allow-network to fetch. The Node checker
// accepts the same flag; from 1.1 a URL without it is still fetched, with a note on the
// error stream in the human form (a refusal of a 1.0-valid command line waits for 2.0).
it('--allow-network is accepted, and a URL without it is fetched with one note in the human form', async () => {
  const run = async (args) => {
    const io = { err: '', out: '' };
    const code = await tool.run(args, { err: (s) => { io.err += s; }, out: (s) => { io.out += s; } });
    return { code, io };
  };
  const target = `${origin}/quick/.well-known/knowledge-linkset`;
  const without = await run([target, '--dev']);
  assert.equal(without.code, 0, without.io.err);
  assert.match(without.io.err, /^validate-wellknown: fetching over the network without --allow-network;/u);
  const withFlag = await run([target, '--dev', '--allow-network']);
  assert.equal(withFlag.code, 0, withFlag.io.err);
  assert.equal(withFlag.io.err, '');
  const json = await run([target, '--dev', '--json']);
  assert.equal(json.io.err, '');
});
