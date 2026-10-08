'use strict';
// tests/tools/validate-wellknown-limits.test.js — AGSC-11-10(e, f): every cross-origin
// fetch is held to `federation.timeout_ms` PER RESPONSE and to its byte cap — 1 MiB
// for a discovery document, `federation.max_bytes` for any other artefact — and is
// aborted at the bound with `AGSC-E907`.
//
// Until 2026-10-06 (verification finding C17 (a) and (b)) the independent checker
// (a) used an idle timeout, so a server sending one byte every few seconds held it for
//     as long as it liked; and
// (b) reported a response over the cap as `AGSC-E904` (the input-file code) where the
//     rule names `AGSC-E907`, and held every target to 1 MiB, so a node whose
//     `graph.jsonld` was over 1 MiB could not pass at Level 2.
// A local FILE over 1 MiB stays `AGSC-E904` (AGSC-01-16): that is an input, not a fetch.
//
// A real process over real HTTP on a loopback server this test starts (the checker's
// `--dev` admits plain http to loopback only); no outside network. The slow server
// writes a chunk every 2 s and would finish after 16 s; the checker's deadline is
// 10 s, so the margins on both sides are several seconds.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { after, before, it } = require('node:test');

const { REPO } = require('./helpers');

const MIB = 1024 * 1024;
const TYPE = 'application/linkset+json; profile="https://w3id.org/agentic-system-core/profile/agentic-knowledge"';

let server;
let origin;
const timers = new Set();

function documentAt(anchor, extra = {}) {
  return `${JSON.stringify({
    linkset: [{
      alternate: [{ href: `${anchor}llms.txt`, type: 'text/plain' }],
      anchor,
      describedby: [{ href: `${anchor}graph.jsonld`, type: 'application/ld+json', ...extra }],
    }],
  })}\n`;
}

const bigGraph = Buffer.alloc(2 * MIB, 0x20);
const bigDigest = `sha-256=:${crypto.createHash('sha256').update(bigGraph).digest('base64')}:`;

before(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/slow/.well-known/knowledge-linkset') {
      const body = Buffer.from(documentAt(`${origin}/slow/`));
      res.writeHead(200, { 'content-length': String(body.length), 'content-type': TYPE });
      const pieces = 8;
      let sent = 0;
      const step = Math.ceil(body.length / pieces);
      const tick = () => {
        if (res.destroyed) return;
        res.write(body.subarray(sent, sent + step));
        sent += step;
        if (sent >= body.length) { res.end(); return; }
        const timer = setTimeout(tick, 2000);
        timers.add(timer);
      };
      tick();
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
  for (const timer of timers) clearTimeout(timer);
  server.closeAllConnections();
  server.close();
});

function check(target, level = '0') {
  return new Promise((resolve) => {
    execFile(process.execPath, [path.join(REPO, 'tools', 'validate-wellknown'), target, '--level', level, '--dev', '--json'],
      { encoding: 'utf8', timeout: 60000 }, (error, stdout) => resolve({ code: error ? error.code : 0, envelope: JSON.parse(stdout) }));
  });
}

it('C17 (a): a response that does not complete within the deadline is AGSC-E907', async () => {
  const { code, envelope } = await check(`${origin}/slow/.well-known/knowledge-linkset`);
  assert.notEqual(code, 0, JSON.stringify(envelope));
  const hit = envelope.findings.find((f) => f.code === 'AGSC-E907');
  assert.ok(hit, JSON.stringify(envelope.findings));
  assert.match(hit.message, /10000 ms|timeout/u);
});

it('C17 (b): a fetched discovery document over 1 MiB is AGSC-E907, not AGSC-E904', async () => {
  const { code, envelope } = await check(`${origin}/big/.well-known/knowledge-linkset`);
  assert.notEqual(code, 0);
  const codes = envelope.findings.map((f) => f.code);
  assert.ok(codes.includes('AGSC-E907'), JSON.stringify(envelope.findings));
  assert.ok(!codes.includes('AGSC-E904'), JSON.stringify(envelope.findings));
});

it('C17 (b): a target over 1 MiB and under federation.max_bytes is read and its digest checked', async () => {
  const { envelope } = await check(`${origin}/large-graph/.well-known/knowledge-linkset`, '2');
  const about = envelope.findings.filter((f) => /relation describedby|graph\.jsonld/u.test(f.message));
  assert.ok(!about.some((f) => ['AGSC-E904', 'AGSC-E907'].includes(f.code)), JSON.stringify(about));
  assert.ok(!about.some((f) => /digest does not match/u.test(f.message)), JSON.stringify(about));
});

it('C17 (b): a local file over 1 MiB stays AGSC-E904, the input cap of AGSC-01-16', async () => {
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
