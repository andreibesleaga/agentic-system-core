'use strict';
// AGSC-06-18 as amended at rc.5 (V9A-24, owner answer to Q-RC5-1, 2026-09-21):
//
//   "The text the identifier names is the file `LICENSE-CONTENT` at the root of this
//    specification's distribution, whose SHA-256 over its bytes is <hex> (<n> bytes).
//    A distribution that ships different text MUST use a different identifier."
//
// A hash written into prose is a pin that rots silently: the file changes, the rule
// keeps the old hex, and every `terms:` line of AGSC-06-13a and every
// `schema:usageInfo` of AGSC-05-26 becomes unverifiable while every gate stays
// green. So the pin is CHECKED, here, against the file — and the hex is read OUT OF
// THE RULE, never restated in this test, so there is exactly one place to change it.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const ROOT = path.resolve(__dirname, '..', '..');

/** The hex and the byte count AGSC-06-18 states, read out of the rule itself. */
function pinned() {
  const rule = fs.readFileSync(path.join(ROOT, 'spec', '06-surfaces.md'), 'utf8');
  const line = rule.split('\n').find((l) => l.startsWith('- **AGSC-06-18**'));
  assert.ok(line, 'AGSC-06-18 must exist in spec/06-surfaces.md');
  const digest = /whose SHA-256 over its bytes is\s+`([0-9a-f]{64})`\s+\((\d+) bytes\)/u.exec(line);
  assert.ok(digest, 'AGSC-06-18 must state the SHA-256 and the byte count of LICENSE-CONTENT');
  return { hex: digest[1], bytes: Number(digest[2]) };
}

test('LICENSE-CONTENT matches the hash AGSC-06-18 pins (V9A-24)', () => {
  const { hex, bytes } = pinned();
  const file = path.join(ROOT, 'LICENSE-CONTENT');
  assert.ok(fs.existsSync(file),
    'AGSC-06-18: a distribution without LICENSE-CONTENT is incomplete');
  const content = fs.readFileSync(file);
  assert.strictEqual(content.length, bytes,
    `LICENSE-CONTENT is ${content.length} bytes; AGSC-06-18 pins ${bytes}. `
    + 'Change the terms and you change the identifier, not the hash in the rule.');
  assert.strictEqual(createHash('sha256').update(content).digest('hex'), hex,
    'LICENSE-CONTENT no longer hashes to what AGSC-06-18 states. Either restore the '
    + 'text, or — if the terms really changed — mint a NEW LicenseRef identifier and '
    + 'update AGSC-06-18, AGSC-01-18\'s default and every vector that carries the old one.');
});

test('the Content Use Terms identifier has one spelling everywhere it is a constant', () => {
  const { TERMS } = require('../../src/knowledge/chunks.js');
  const harness = require('../../src/composition/harness.js');
  const mcpTools = require('../../src/distribution/mcp-tools.js');
  assert.strictEqual(TERMS, 'LicenseRef-AgenticSystemCore-Content-Use-1.0');
  assert.strictEqual(harness.terms(), TERMS);
  assert.strictEqual(mcpTools.CONTENT_USE_TERMS, TERMS);
  const rule = fs.readFileSync(path.join(ROOT, 'spec', '06-surfaces.md'), 'utf8');
  assert.ok(rule.includes(`\`${TERMS}\``), 'AGSC-06-18 must name the identifier the engine emits');
});
