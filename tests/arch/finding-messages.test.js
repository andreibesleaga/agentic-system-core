'use strict';
// F27-11 (AGSC-09-11, owner rule R64): `message` is a member of every Finding and an
// empty one helps nobody. Twenty-nine call sites across Boundary, Governance and
// Composition raised findings through helpers whose `message` defaulted to `''` and
// never supplied one, so `agsc lint` printed blank diagnostic lines.
//
// This is a SOURCE test: it reads the text of `src/`, so a helper that reintroduces
// the default is caught even when no unit test happens to exercise that branch.

const test = require('node:test');
const assert = require('node:assert');
const { sources } = require('./_scan.js');

test('no module raises a Finding with a hard-coded empty message', () => {
  const offenders = [];
  for (const file of sources()) {
    const lines = file.text.split('\n');
    lines.forEach((line, i) => {
      // A literal `message: ''` is allowed ONLY on the default of a helper whose
      // own callers override it; every such helper is named here with its reason.
      if (!/message:\s*''/u.test(line)) return;
      if (/^\s*(\/\/|\*)/u.test(line)) return;
      if (/function finding\(/u.test(lines[i - 1] || '')) return; // the helper default
      offenders.push(`${file.rel}:${i + 1}`);
    });
  }
  assert.deepStrictEqual(offenders, [], 'a Finding is raised with an empty message');
});

test('every finding helper call supplies a message', () => {
  // The five modules the report named, checked call by call: each `finding(` call
  // carries either a `message:` member or a positional message argument.
  const NAMED = ['src/boundary/federation.js', 'src/boundary/surfaces.js', 'src/boundary/visibility.js',
    'src/composition/architecture.js', 'src/governance/agents.js'];
  const offenders = [];
  for (const file of sources()) {
    if (!NAMED.includes(file.rel)) continue;
    const text = file.text;
    let from = 0;
    for (;;) {
      const at = text.indexOf('finding(', from);
      if (at < 0) break;
      from = at + 1;
      if (/function\s+$/u.test(text.slice(Math.max(0, at - 10), at))) continue;
      // Read to the matching close paren of this call.
      let depth = 0;
      let end = at + 'finding('.length - 1;
      for (; end < text.length; end += 1) {
        if (text[end] === '(') depth += 1;
        else if (text[end] === ')') { depth -= 1; if (depth === 0) break; }
      }
      const call = text.slice(at, end + 1);
      if (!/\bmessage:/u.test(call)) {
        offenders.push(`${file.rel}: ${call.split('\n')[0].trim()}`);
      }
    }
  }
  assert.deepStrictEqual(offenders, [], 'a finding() call supplies no message');
});
