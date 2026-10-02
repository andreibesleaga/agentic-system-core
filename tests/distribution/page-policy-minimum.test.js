'use strict';
// AGSC-06-17 (amended 2026-10-02 for 1.0.0): the page policy contains at least
// `default-src 'none'`, `script-src 'self'`, `style-src 'self'`, `img-src 'self'` and
// `connect-src 'self'`, and admits no inline script. This test holds the rule's list to the
// rule text and to the policy the engine writes.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { SECURITY_POLICY } = require('../../src/distribution/headers.js');

const MINIMUM = ["default-src 'none'", "script-src 'self'", "style-src 'self'", "img-src 'self'", "connect-src 'self'"];

test('AGSC-06-17: the rule names the five directives', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', '..', 'spec', '06-surfaces.md'), 'utf8');
  for (const d of MINIMUM) assert.ok(text.includes(`\`${d}\``), d);
});

test('AGSC-06-17: the engine\'s policy contains each, and no source admits inline script', () => {
  const directives = SECURITY_POLICY.split(';').map((d) => d.trim());
  for (const d of MINIMUM) assert.ok(directives.includes(d), d);
  assert.doesNotMatch(SECURITY_POLICY, /'unsafe-inline'|'unsafe-eval'/u);
});
