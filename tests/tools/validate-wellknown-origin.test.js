'use strict';
// tests/tools/validate-wellknown-origin.test.js — AGSC-06-08 (amended 2026-10-02 for
// 1.0.0): a discovery document whose anchor is not on the origin it was retrieved from is
// not that node's discovery document (RFC 9264 §9, RFC 8615 §4.3), and the independent
// checker reports AGSC-E907. Until then a copy of one node's document served by any other
// origin passed.
//
// A real process over a real HTTP fetch, on a loopback server this test starts (the
// checker's `--dev` admits plain http to loopback only). No outside network.

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { after, before, it } = require('node:test');

const { REPO } = require('./helpers');

let server;
let origin;

/** A Level-0 document anchored at `anchor`. */
function documentAt(anchor) {
  return `${JSON.stringify({
    linkset: [{
      alternate: [{ href: `${anchor}llms.txt`, type: 'text/plain' }],
      anchor,
      describedby: [{ href: `${anchor}graph.jsonld`, type: 'application/ld+json' }],
    }],
  })}\n`;
}

before(async () => {
  server = http.createServer((req, res) => {
    const own = documentAt(`${origin}/`);
    const body = {
      '/.well-known/knowledge-linkset': own,
      '/copy/.well-known/knowledge-linkset': documentAt('https://example.org/'),
    }[req.url];
    if (req.url === '/moved') {
      res.writeHead(301, { location: '/copy/.well-known/knowledge-linkset' });
      res.end();
      return;
    }
    if (body === undefined) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      'content-type': 'application/linkset+json; profile="https://w3id.org/agentic-system-core/profile/agentic-knowledge"',
    });
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

function check(url) {
  return new Promise((resolve) => {
    execFile(process.execPath, [path.join(REPO, 'tools', 'validate-wellknown'), url, '--level', '0', '--dev', '--json'],
      { encoding: 'utf8' }, (error, stdout) => resolve({ code: error ? error.code : 0, envelope: JSON.parse(stdout) }));
  });
}

const codes = (envelope) => envelope.findings.map((f) => f.code);

it('AGSC-06-08: a document anchored on the origin it came from raises no origin finding', async () => {
  const { envelope } = await check(`${origin}/.well-known/knowledge-linkset`);
  assert.ok(!codes(envelope).includes('AGSC-E907'), JSON.stringify(envelope.findings));
});

it('AGSC-06-08: another node\'s document served from this origin is AGSC-E907', async () => {
  const { code, envelope } = await check(`${origin}/copy/.well-known/knowledge-linkset`);
  assert.notEqual(code, 0);
  const hit = envelope.findings.find((f) => f.code === 'AGSC-E907');
  assert.ok(hit, JSON.stringify(envelope.findings));
  assert.match(hit.message, /not on the origin the document was retrieved from/u);
});

it('AGSC-06-08: the origin judged is the one the document was finally retrieved from', async () => {
  const { envelope } = await check(`${origin}/moved`);
  assert.ok(codes(envelope).includes('AGSC-E907'), JSON.stringify(envelope.findings));
});
