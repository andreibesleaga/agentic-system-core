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

/**
 * The hex and the byte count a rule states, read OUT OF THE RULE TEXT. Both pins are
 * written the same way, so both are read the same way: the sentence "whose SHA-256
 * over its bytes is `<hex>` (<n> bytes)" in the paragraph that names the file.
 */
function pinned(chapter, marker) {
  const text = fs.readFileSync(path.join(ROOT, 'spec', chapter), 'utf8');
  const line = text.split('\n').find((l) => l.includes(marker)
    && /whose SHA-256 over its bytes is/u.test(l));
  assert.ok(line, `${chapter} must state the pin beside ${marker}`);
  const digest = /whose SHA-256 over its bytes is\s+`([0-9a-f]{64})`\s+\((\d+) bytes\)/u.exec(line);
  assert.ok(digest, `${marker}'s rule must state the SHA-256 and the byte count`);
  return { hex: digest[1], bytes: Number(digest[2]) };
}

/** The bytes of a pinned file at the distribution root, checked against its rule. */
function assertPin(name, pin, advice) {
  const file = path.join(ROOT, name);
  assert.ok(fs.existsSync(file), `a distribution without ${name} is incomplete`);
  const content = fs.readFileSync(file);
  assert.strictEqual(content.length, pin.bytes,
    `${name} is ${content.length} bytes; the rule pins ${pin.bytes}. ${advice}`);
  assert.strictEqual(createHash('sha256').update(content).digest('hex'), pin.hex,
    `${name} no longer hashes to what the rule states. ${advice}`);
}

test('LICENSE-CONTENT matches the hash AGSC-06-18 pins (V9A-24)', () => {
  assertPin('LICENSE-CONTENT', pinned('06-surfaces.md', '**AGSC-06-18**'),
    'Either restore the text, or — if the terms really changed — mint a NEW '
    + 'LicenseRef identifier and update AGSC-06-18, AGSC-01-18\'s default and every '
    + 'vector that carries the old one.');
});

test('CONTRIBUTOR-AGREEMENT matches the hash AGSC-08-06 pins (rc.6, D105)', () => {
  // The same pin, for the same reason, over the text the token `CA-v1` names.
  // `agreement = "CA-v1"` is a literal the trailer grammar admits no alternative
  // to, so until rc.6 every contributor certified an agreement nobody could read.
  assertPin('CONTRIBUTOR-AGREEMENT', pinned('08-governance.md', 'CONTRIBUTOR-AGREEMENT'),
    'A distribution that ships different text MUST name it with a different token: '
    + 'mint `CA-v2`, update AGSC-08-06\'s grammar and its pin, and leave every '
    + 'contribution already signed under CA-v1 under CA-v1.');
});

test('AGSC-08-06 ships the agreement, and CONTRIBUTING.md points at it', () => {
  // "A contributor MUST be able to read that file before signing off, so a
  // distribution MUST ship it."
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok((manifest.files || []).includes('CONTRIBUTOR-AGREEMENT'),
    'package.json `files` must ship CONTRIBUTOR-AGREEMENT, or an npm consumer cannot read it');
  const contributing = fs.readFileSync(path.join(ROOT, 'CONTRIBUTING.md'), 'utf8');
  assert.match(contributing, /CONTRIBUTOR-AGREEMENT/u,
    'CONTRIBUTING.md must name the file the token CA-v1 stands for');
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
