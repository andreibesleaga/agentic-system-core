'use strict';
// tests/knowledge/comment-safe.test.js — specification item 58 /: a `-->`
// inside `bundle.license_prose` closed the AGSC-06-13a provenance comment early, so
// the rest of the header left the comment and became visible document text.
//
// The defence is `knowledge/unicode.js#commentSafe`, applied by every writer of that
// header, and it is the IDENTITY on every value that does not carry the sequence —
// which is what lets it ship without moving a byte the vector `disc-0013` pins.

const test = require('node:test');
const assert = require('node:assert');
const nodeFs = require('node:fs');
const path = require('node:path');

const { commentSafe } = require('../../src/knowledge/unicode.js');
const harness = require('../../src/composition/harness.js');
const llms = require('../../src/distribution/llms.js');
const adapter = require('../../src/interchange/adapters/llm-context.js');
const skills = require('../../src/composition/skills.js');
const steer = require('../../src/interchange/steer.js');

const ROOT = path.resolve(__dirname, '..', '..');

test('the HTML Standard closes a comment on --> and on --!>; both are neutralised', () => {
  // AGSC-06-13a names the replacement: `--&gt;`.
  assert.strictEqual(commentSafe('a --> b'), 'a --&gt; b');
  assert.strictEqual(commentSafe('a --!> b'), 'a --!&gt; b');
  assert.strictEqual(commentSafe('x --> y --> z'), 'x --&gt; y --&gt; z');
  assert.strictEqual(commentSafe(null), '');
  assert.strictEqual(commentSafe(undefined), '');
});

test('it is the IDENTITY on every ordinary value, so no pinned byte moves', () => {
  for (const value of ['CC-BY-4.0', 'LicenseRef-AgenticSystemCore-Content-Use-1.0',
    'a - b -- c', '<!-- opener', '1.0.0-rc.6', '2026-01-01T00:00:00Z', 'https://example.org/']) {
    assert.strictEqual(commentSafe(value), value, value);
  }
});

test('it is idempotent', () => {
  assert.strictEqual(commentSafe(commentSafe('a --> b')), commentSafe('a --> b'));
});

test('the /llms.txt provenance comment survives a --> in the licence prose', () => {
  const bundle = {
    base: 'https://example.org/',
    clusters: [],
    description: 'A Bundle long enough to look like a real one in the block-three line.',
    items: [],
    license_prose: 'Evil --> escaped',
    title: 'A Node',
  };
  const text = llms.llmsTxt(bundle, {
    generatedAt: '2026-01-01T00:00:00Z', specVersion: '1.0.0-rc.6',
    terms: 'LicenseRef-AgenticSystemCore-Content-Use-1.0',
  });
  // Exactly one comment opener and one closer, and the closer is the last line of
  // the block — the terms, the version and the instant are still INSIDE it.
  assert.strictEqual((text.match(/<!--/gu) || []).length, 1);
  assert.strictEqual((text.match(/-->/gu) || []).length, 1);
  const block = text.slice(text.indexOf('<!--'), text.indexOf('-->') + 3);
  assert.match(block, /\nterms: /u);
  assert.match(block, /\nspec_version: /u);
  assert.match(block, /\ngenerated_at: /u);
  assert.match(block, /license: Evil --&gt; escaped/u);
});

test('every other writer of the same header carries the same defence', () => {
  const options = {
    base: 'https://example.org/', generatedAt: '2026-01-01T00:00:00Z',
    instant: '2026-01-01T00:00:00Z', license: 'Evil --> escaped',
    licenseProse: 'Evil --> escaped', specVersion: '1.0.0-rc.6',
    terms: 'LicenseRef-AgenticSystemCore-Content-Use-1.0',
  };
  for (const [what, text] of [
    ['harness', harness.provenanceHeader(options)],
    ['skills', skills.provenanceHeader(options)],
    ['steer', steer.steerText([], { ...options, nowState: {}, title: 'A Node' })],
    ['llm-context', adapter.llmsCtxTxt === undefined ? '<!-- x\n-->' : adapter.llmsCtxTxt([], { ...options, title: 'A Node' })],
  ]) {
    assert.strictEqual((String(text).match(/-->/gu) || []).length, 1, what);
  }
});

test('the AI-assistance line is one constant, and it is the last line of every block', () => {
  // AGSC-06-15: a CONSTANT of the specification, never authored, always
  // immediately before `-->`. The Harness restates it for AGSC-07-13; the two
  // must never drift.
  const { ASSISTANCE, provenanceHeader } = require('../../src/knowledge/provenance-header.js');
  assert.strictEqual(harness.assistance(), ASSISTANCE);
  const options = {
    base: 'https://example.org/', generatedAt: '2026-01-01T00:00:00Z',
    instant: '2026-01-01T00:00:00Z', license: 'CC0-1.0', licenseProse: 'CC0-1.0',
    specVersion: '1.0.0-rc.6', terms: 'LicenseRef-AgenticSystemCore-Content-Use-1.0',
  };
  for (const [what, text] of [
    ['shared', provenanceHeader({ bundle: options.base, generatedAt: options.generatedAt,
      license: options.license, specVersion: options.specVersion, terms: options.terms })],
    ['harness', harness.provenanceHeader(options)],
    ['skills', skills.provenanceHeader(options)],
    ['steer', steer.steerText([], { ...options, nowState: {}, title: 'A Node' })],
    ['llm-context', adapter.llmsCtxTxt([], { ...options, title: 'A Node' })],
  ]) {
    const lines = String(text).split('\n');
    const close = lines.indexOf('-->');
    assert.ok(close > 0, what);
    assert.strictEqual(lines[close - 1], `assistance: ${ASSISTANCE}`, what);
  }
});

test('the portable copy in composition/harness.js equals knowledge/unicode.js', () => {
  // The Harness module restates the function because of its portability contract
  // (AGSC-07-13). The two must never drift, so they are compared over the cases that
  // matter and over a sweep of hyphen/bang/angle strings.
  const alphabet = ['-', '!', '>', 'a', ' '];
  for (const a of alphabet) {
    for (const b of alphabet) {
      for (const c of alphabet) {
        for (const d of alphabet) {
          const s = `${a}${b}${c}${d}`;
          assert.strictEqual(harness.commentSafe(s), commentSafe(s), s);
        }
      }
    }
  }
  assert.strictEqual(harness.commentSafe(null), '');
});

test('every module that writes the AGSC-06-15 header calls the defence', () => {
  for (const file of ['src/distribution/llms.js', 'src/composition/harness.js',
    'src/composition/skills.js', 'src/interchange/steer.js',
    'src/interchange/adapters/llm-context.js']) {
    const source = nodeFs.readFileSync(path.join(ROOT, file), 'utf8');
    if (!source.includes('agsc:provenance')) continue;
    assert.match(source, /commentSafe\(/u, `${file} writes the header without the defence`);
  }
});
