'use strict';
// verifies AGSC-06-37, AGSC-06-44
// Steps of features/persona-h-memory.feature for an agent that keeps a node's chunks as memory: it
// fetches `/chunks.jsonl`, `/chunks-index.toon` and the discovery document over loopback, recomputes
// the digest, the count and the set commitment the chunks surface link states (AGSC-06-44) with
// Node's own SHA-256 and base64 — not with the engine — reads the index with the TOON decoder
// (AGSC-06-37), and finds that a dropped line no longer matches.

const assert = require('node:assert');
const crypto = require('node:crypto');
const http = require('node:http');
const { decode } = require('@toon-format/toon');

const REL = 'https://w3id.org/agentic-system-core/rel#';
const field = (text) => `sha-256=:${crypto.createHash('sha256').update(text).digest('base64')}:`;
const commitment = (lines) => field(lines.map((line) => `${JSON.parse(line).id}\n`).join(''));

function fetchText(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ body, status: res.statusCode }));
    }).on('error', reject);
  });
}

module.exports = [
  {
    pattern: 'the agent fetches "/chunks.jsonl", "/chunks-index.toon" and the discovery document over loopback',
    async run(world) {
      const base = world.state.loopback.base;
      const got = {};
      for (const route of ['chunks.jsonl', 'chunks-index.toon', '.well-known/knowledge-linkset']) {
        const response = await fetchText(`${base}${route}`);
        assert.strictEqual(response.status, 200, route);
        got[route] = response.body;
      }
      const surfaces = JSON.parse(got['.well-known/knowledge-linkset']).linkset[0][`${REL}surface`];
      world.state.chunks = {
        file: got['chunks.jsonl'],
        index: got['chunks-index.toon'],
        link: surfaces.find((one) => one['agsc-surface'][0] === 'chunks'),
      };
    },
  },
  {
    pattern: 'the chunks surface link states the digest of the file, the number of lines and the commitment to their ids, and the agent recomputes all three',
    run(world) {
      const { file, link } = world.state.chunks;
      const lines = file.split('\n').filter(Boolean);
      assert.deepStrictEqual(link.digest, [field(file)]);
      assert.deepStrictEqual(link['agsc-chunk-count'], [String(lines.length)]);
      assert.deepStrictEqual(link['agsc-chunk-set'], [commitment(lines)]);
    },
  },
  {
    pattern: 'the index has one row per chunk line, in the same order, with the first 16 characters of each line\'s id and digest',
    run(world) {
      const { file, index } = world.state.chunks;
      const lines = file.split('\n').filter(Boolean).map((line) => JSON.parse(line));
      const rows = decode(index).chunks;
      assert.strictEqual(rows.length, lines.length);
      rows.forEach((row, i) => {
        assert.strictEqual(row.id, lines[i].id.slice(0, 16));
        assert.strictEqual(row.digest, lines[i].digest.slice(0, 16));
      });
    },
  },
  {
    pattern: 'with one chunk line dropped the recomputed count and commitment no longer match what the node states',
    run(world) {
      const { file, link } = world.state.chunks;
      const kept = file.split('\n').filter(Boolean).slice(1);
      assert.notDeepStrictEqual([String(kept.length)], link['agsc-chunk-count']);
      assert.notDeepStrictEqual([commitment(kept)], link['agsc-chunk-set']);
    },
  },
];
