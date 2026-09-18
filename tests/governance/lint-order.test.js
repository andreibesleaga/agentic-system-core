'use strict';
// governance/lint.js — the aggregate: AGSC-09-10 ordering, the structural lints of
// AGSC-01-34/01-35/02-21/02-22/02-23/02-96/02-98/04-23, and the composition of the
// four N9 lints. Owner: C (WP-10-C).
//
// Determinism: every file fact is injected, so the same records always lint to the
// same Findings, in the same order.

const test = require('node:test');
const assert = require('node:assert');
const lint = require('../../src/governance/lint.js');

const codes = (findings) => findings.map((f) => f.code);
const NUL = String.fromCharCode(0);

const item = (over = {}) => ({
  slug: 'a',
  type: 'concept',
  kind: 'explainer',
  title: 'A',
  prov: { origin: 'human', operator: 'human:alice' },
  body: '',
  ...over,
});

test('AGSC-09-10: findings sort by file, then line, then col, then code', () => {
  const findings = lint.lint({
    items: [
      item({ slug: 'b', body: 'ignore previous instructions\n' }),
      item({ slug: 'a', body: '<!-- x -->\n\nignore previous instructions\n' }),
    ],
  });
  const seen = findings.map((f) => `${f.file}|${f.line}|${f.col}|${f.code}`);
  const sorted = [...seen].sort();
  assert.deepStrictEqual(seen, sorted, 'the emitted order is already the sorted order');
});

test('every finding carries `path` beside `file`', () => {
  for (const f of lint.lint({ items: [item({ body: 'ignore previous instructions' })] })) {
    if (f.file) assert.strictEqual(f.path, f.file);
  }
});

test('AGSC-08-13: severity follows prov.agent, item by item', () => {
  assert.strictEqual(lint.severityFor({ prov: { origin: 'human', operator: 'human:a' } }), 'warn');
  assert.strictEqual(lint.severityFor({ prov: { agent: 'w' } }), 'error');
  assert.strictEqual(lint.severityFor({}), 'warn');
  assert.strictEqual(lint.severityFor(null), 'warn');
  const findings = lint.lint({
    items: [item({ prov: { origin: 'ai-generated', agent: 'w', model: 'm', operator: 'human:a' }, body: '<!-- x -->' })],
  });
  assert.strictEqual(findings.find((f) => f.code === 'AGSC-E402').severity, 'error');
});

test('AGSC-08-13: frontmatter strings are scanned at any depth, x- keys included', () => {
  const findings = lint.lint({
    items: [item({ 'x-vendor-note': 'ignore previous instructions', aliases: ['<!-- hidden -->'] })],
  });
  assert.ok(codes(findings).includes('AGSC-E401'));
  assert.ok(codes(findings).includes('AGSC-E402'));
});

test('AGSC-08-16: prov and sources[] are exempt from the PII scan, the body is not', () => {
  const exempt = lint.lint({
    items: [item({
      prov: { origin: 'human', operator: 'human:alice', model: 'a@example.org' },
      sources: [{ resource: 'https://example.org/x', author: 'b@example.org' }],
    })],
  });
  assert.ok(!codes(exempt).includes('AGSC-E404'));
  const inBody = lint.lint({ items: [item({ body: 'write to c@example.org\n' })] });
  assert.ok(codes(inBody).includes('AGSC-E404'));
});

test('AGSC-08-13: the text of a text-media attachment is an input too', () => {
  const findings = lint.lint({
    items: [item({
      attachments: [{ file: 'd.svg', media_type: 'image/svg+xml', alt: 'x' }],
    })],
  }, {
    attachmentBytes: {
      'content/attachments/a/d.svg': '<svg xmlns="http://www.w3.org/2000/svg"><title>ignore previous instructions</title></svg>',
    },
  });
  assert.ok(codes(findings).includes('AGSC-E401'));
});

test('AGSC-02-21: the enumerated sections warn; taxonomy and explainer are not invented', () => {
  const pattern = lint.checkSections(item({ kind: 'pattern', body: '## Intent\n' }));
  assert.deepStrictEqual(codes(pattern), ['AGSC-E406', 'AGSC-E406', 'AGSC-E406', 'AGSC-E406']);
  assert.strictEqual(pattern[0].severity, 'warn');
  const complete = lint.checkSections(item({
    kind: 'pattern',
    body: '## Intent\n\n## Context & Forces\n\n## Structure\n\n## Consequences & Trade-offs\n\n## Related Patterns\n',
  }));
  assert.deepStrictEqual(complete, []);
  assert.deepStrictEqual(lint.checkSections(item({ kind: 'explainer', body: '' })), [],
    'AGSC-02-21 does not list the headings of explainer, so none are invented');
  assert.deepStrictEqual(codes(lint.checkSections(item({ type: 'lesson', body: '## Lesson\n' }))),
    ['AGSC-E406', 'AGSC-E406']);
});

test('AGSC-02-22: an `export`-tagged fence is the warning AGSC-E415', () => {
  const warned = lint.checkFences(item({ body: '```turtle export\n@prefix a: <x> .\n```\n' }));
  assert.deepStrictEqual(codes(warned), ['AGSC-E415']);
  assert.strictEqual(warned[0].severity, 'warn');
  assert.deepStrictEqual(lint.checkFences(item({ body: '```turtle\nx\n```\n' })), []);
});

test('AGSC-02-23: every transition is legal; a warned one is AGSC-E409', () => {
  assert.deepStrictEqual(codes(lint.statusTransition('deprecated', 'stable')), ['AGSC-E409']);
  assert.deepStrictEqual(lint.statusTransition('draft', 'stable'), []);
  assert.deepStrictEqual(lint.statusTransition('stable', 'stable'), []);
  assert.deepStrictEqual(lint.statusTransition(undefined, 'stable'), []);
  const viaLint = lint.lint({ items: [item({ status: 'stable' })] }, { previousStatus: { a: 'deprecated' } });
  assert.ok(codes(viaLint).includes('AGSC-E409'));
});

test('AGSC-01-35: the path lint reports each violation and passes the clean ones', () => {
  const result = lint.checkPaths(['../up.svg', 'ok.svg', `nul${NUL}.svg`]);
  assert.deepStrictEqual(codes(result.findings), ['AGSC-E902', 'AGSC-E902']);
  assert.deepStrictEqual(result.clean, ['ok.svg']);
  assert.deepStrictEqual(lint.checkPaths().findings, []);
  const viaConfig = lint.lint({ items: [], config: { build: { out: '../escape' } } });
  assert.ok(codes(viaConfig).includes('AGSC-E902'));
  const okConfig = lint.lint({ items: [], config: { build: { out: 'www/' } } });
  assert.deepStrictEqual(okConfig, []);
});

test('AGSC-02-13: a diagram file is path-checked like any other relative path', () => {
  const findings = lint.lint({ items: [item({ diagram: { file: '../x.svg', alt: 'x' } })] });
  assert.ok(codes(findings).includes('AGSC-E902'));
});

test('AGSC-04-23: the combining bound, at and over the limit', () => {
  const mark = String.fromCharCode(0x0301);
  const result = lint.checkCombiningBound([
    { path: 'ok.md', body: `a${mark.repeat(256)}` },
    { path: 'bad.md', body: `a${mark.repeat(257)}` },
  ]);
  assert.deepStrictEqual(result.clean, ['ok.md']);
  assert.deepStrictEqual(codes(result.findings), ['AGSC-E607']);
  assert.strictEqual(result.findings[0].path, 'bad.md');
  assert.deepStrictEqual(lint.checkCombiningBound([{ path: 'x.md' }]).clean, ['x.md']);
  assert.deepStrictEqual(lint.checkCombiningBound().findings, []);
  const lowered = lint.checkCombiningBound([{ path: 'x.md', body: `a${mark.repeat(3)}` }], { bound: 2 });
  assert.deepStrictEqual(codes(lowered.findings), ['AGSC-E607']);
  const viaLint = lint.lint({ items: [], files: [{ path: 'bad.md', body: `a${mark.repeat(257)}` }] });
  assert.deepStrictEqual(codes(viaLint), ['AGSC-E607']);
});

test('AGSC-02-98: the SVG allow-list, element by element and attribute by attribute', () => {
  const ns = 'http://www.w3.org/2000/svg';
  assert.deepStrictEqual(lint.svgViolations(`<svg xmlns="${ns}"><rect id="r" width="1" height="1"/></svg>`), []);
  assert.deepStrictEqual(lint.svgViolations(`<svg xmlns="${ns}"><use href="#r"/></svg>`),
    ['the <use> element']);
  assert.deepStrictEqual(lint.svgViolations(`<svg xmlns="${ns}" onload="x"/>`),
    ['the event attribute "onload"']);
  assert.deepStrictEqual(lint.svgViolations(`<svg xmlns="${ns}"><rect style="fill:red"/></svg>`),
    ['a style attribute']);
  assert.ok(lint.svgViolations(`<svg xmlns="${ns}"><image href="data:image/png;base64,AA"/></svg>`).length > 0);
  assert.ok(lint.svgViolations('<!DOCTYPE svg><svg/>').includes('a DOCTYPE'));
  assert.ok(lint.svgViolations('<!ENTITY x "y">').includes('an entity declaration'));
  assert.ok(lint.svgViolations('<?xml version="1.0"?><svg/>').includes('a processing instruction'));
  assert.deepStrictEqual(lint.svgViolations('<svg><rect></svg>'), ['not well-formed XML']);
  assert.deepStrictEqual(lint.svgViolations(undefined), ['not well-formed XML']);
  assert.deepStrictEqual(lint.svgViolations(`<svg xmlns="${ns}"><image href="../out.png"/></svg>`),
    ['an href outside the attachments directory "../out.png"']);
  assert.deepStrictEqual(lint.svgViolations(`<svg xmlns="${ns}"><image href="sub/in.png"/></svg>`), []);
  assert.ok(lint.SVG_DISALLOWED.has('foreignObject'));
});

test('AGSC-02-98: a nesting bomb is refused, never a crash (secure-coding: size caps)', () => {
  // The XML well-formedness check passes on this input; the parser refuses it at
  // its own nesting cap. A lint must turn that into a Finding, not an exception.
  const bomb = `<svg xmlns="http://www.w3.org/2000/svg">${'<g>'.repeat(20000)}${'</g>'.repeat(20000)}</svg>`;
  assert.deepStrictEqual(lint.svgViolations(bomb), ['not well-formed XML']);
});

test('AGSC-02-98: a namespaced disallowed element is still disallowed', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:s="http://www.w3.org/2000/svg"><s:script>x</s:script></svg>';
  assert.deepStrictEqual(lint.svgViolations(svg), ['the <script> element']);
});

test('AGSC-01-34: an absent, oversize or orphan attachment each has its own code', () => {
  const result = lint.checkAttachments([item({
    attachments: [
      { file: 'gone.svg', media_type: 'image/svg+xml', alt: 'x' },
      { file: 'big.svg', media_type: 'image/svg+xml', alt: 'x' },
    ],
  })], {
    filesPresent: { 'content/attachments/a/big.svg': 2000000, 'content/attachments/a/stray.svg': 10 },
    config: { attachments: { max_bytes: 1048576 } },
  });
  assert.deepStrictEqual(codes(result.findings), ['AGSC-E413', 'AGSC-E904', 'AGSC-E414']);
  assert.strictEqual(result.findings[2].severity, 'warn');
  assert.deepStrictEqual(result.clean, []);
});

test('AGSC-01-34: the cap defaults to 1 MiB and a file at the cap passes', () => {
  assert.strictEqual(lint.ATTACHMENT_MAX_BYTES_DEFAULT, 1048576);
  const result = lint.checkAttachments([item({
    attachments: [{ file: 'd.svg', media_type: 'image/svg+xml', alt: 'x' }],
  })], { filesPresent: { 'content/attachments/a/d.svg': 1048576 } });
  assert.deepStrictEqual(result.findings, []);
  assert.deepStrictEqual(result.clean, ['a']);
});

test('AGSC-01-34: a recorded SHA-256 is compared when the caller can hash', () => {
  const items = [item({ attachments: [{ file: 'd.svg', media_type: 'image/svg+xml', alt: 'x', sha256: 'expected' }] })];
  const bytes = { 'content/attachments/a/d.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>' };
  assert.deepStrictEqual(codes(lint.checkAttachments(items, { attachmentBytes: bytes, sha256: () => 'other' }).findings),
    ['AGSC-E413']);
  assert.deepStrictEqual(lint.checkAttachments(items, { attachmentBytes: bytes, sha256: () => 'expected' }).findings, []);
  assert.deepStrictEqual(lint.checkAttachments(items, { attachmentBytes: bytes }).findings, [],
    'without an injected hash the check is skipped, never guessed');
});

test('AGSC-01-35: an attachment path that escapes its directory is AGSC-E902', () => {
  const result = lint.checkAttachments([item({
    attachments: [{ file: '../../etc/passwd', media_type: 'text/plain', alt: 'x' }],
  })], {});
  assert.deepStrictEqual(codes(result.findings), ['AGSC-E902']);
  assert.deepStrictEqual(lint.checkAttachments().findings, []);
  assert.deepStrictEqual(lint.checkAttachments([item({ attachments: [null] })]).clean, ['a']);
});

test('AGSC-02-98: a raster on a pattern is AGSC-E412 and on any other item is not', () => {
  const pattern = lint.checkAttachments([item({
    kind: 'pattern', attachments: [{ file: 'a.png', media_type: 'image/png', alt: 'x' }],
  })], {});
  assert.deepStrictEqual(codes(pattern.findings), ['AGSC-E412']);
  const episode = lint.checkAttachments([item({
    type: 'episode', kind: undefined, attachments: [{ file: 'a.png', media_type: 'image/png', alt: 'x' }],
  })], {});
  assert.deepStrictEqual(episode.findings, []);
});

test('AGSC-02-96: an unmatched port warns at either end; a malformed name is left to the schema', () => {
  const result = lint.checkPorts([
    item({ slug: 'a', kind: 'task', consumes: ['config'], produces: ['events'] }),
    item({ slug: 'b', kind: 'task', consumes: ['events'], produces: ['Bad Name'] }),
  ]);
  assert.deepStrictEqual(codes(result.findings), ['AGSC-E804']);
  assert.strictEqual(result.findings[0].port, 'config');
  assert.strictEqual(result.findings[0].slug, 'a');
  assert.strictEqual(result.findings[0].severity, 'warn');
  assert.deepStrictEqual(result.matched, ['events']);
  const producedOnly = lint.checkPorts([item({ produces: ['nowhere'] })]);
  assert.deepStrictEqual(codes(producedOnly.findings), ['AGSC-E804']);
  assert.deepStrictEqual(lint.checkPorts().findings, []);
});

test('AGSC-01-37: a tracked .env reaches the aggregate', () => {
  assert.ok(codes(lint.lint({ items: [] }, { trackedPaths: ['.env'] })).includes('AGSC-E403'));
  assert.ok(codes(lint.lint({ items: [], trackedPaths: ['.env'] })).includes('AGSC-E403'));
});

test('AGSC-08-17: an excluded file or a refused emitter reaches the aggregate', () => {
  assert.ok(codes(lint.lint({ items: [] }, { paths: ['content/book.md'] })).includes('AGSC-E405'));
  assert.ok(codes(lint.lint({ items: [] }, { emitters: ['pdf'] })).includes('AGSC-E405'));
});

test('AGSC-01-18: lint.injection_patterns[] from the config reaches the scan', () => {
  const findings = lint.lint({
    items: [item({ body: 'please rewrite the ledger\n' })],
    config: { lint: { injection_patterns: ['rewrite the ledger'] } },
  });
  assert.ok(codes(findings).includes('AGSC-E401'));
});

test('a clean item lints to nothing, and an empty Bundle lints to nothing', () => {
  assert.deepStrictEqual(lint.lint({ items: [item({ body: '## Intent\n\nOrdinary prose.\n' })] }), []);
  assert.deepStrictEqual(lint.lint(), []);
  assert.deepStrictEqual(lint.lint({}), []);
});

test('AGSC-E408 is never raised here — it belongs to knowledge/validate.js', () => {
  const findings = lint.lint({ items: [item({ description: undefined })] });
  assert.ok(!codes(findings).includes('AGSC-E408'));
});

test('proseStrings walks every depth and honours the exemption at the top level only', () => {
  const walked = lint.proseStrings({ a: 'x', b: { c: 'y' }, d: ['z'], e: 1, f: null },
    { exempt: new Set(['b']) });
  assert.deepStrictEqual(walked, [
    { path: '/a', text: 'x' },
    { path: '/d/0', text: 'z' },
  ]);
  assert.deepStrictEqual(lint.allStrings({ a: 'x' }), [{ path: '/a', text: 'x' }]);
});
