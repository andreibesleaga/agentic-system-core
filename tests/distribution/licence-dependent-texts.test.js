'use strict';
// LEG2-02 / L2-01 (the legal review of 2026-09-23; ENG-9): the engine is a general
// tool, and it stamped ONE owner's legal position on every node it built — "All
// rights reserved", "Written with AI assistance", "Independent work … no organisation
// named here is connected with it" — and a no-model-training reservation beside a
// `bundle.license_prose` that may be CC BY 4.0, whose §2(a)(5)(B) says "You may not
// offer or impose any additional or different terms or conditions on … the Licensed
// Material if doing so restricts exercise of the Licensed Rights"
// (https://creativecommons.org/licenses/by/4.0/legalcode.en).
//
// What is now a function of the Bundle, and what is not:
//   * "All rights reserved. You may cite and link." — only when the prose licence IS
//     the Content Use Terms; otherwise the footer names the prose licence.
//   * the TDM reservation (tdmrep.json `tdm-reservation`) and the robots
//     `ai-train=no` signal and per-crawler `Disallow` groups — only when the prose
//     licence is the Content Use Terms (no rule says a node MUST reserve).
//   * the AI-assistance sentence of the footer — only when a published item records
//     `prov.origin` `ai-assisted` or `ai-generated` (derived, no new key).
//   * the "independent work" disclaimer — only from an authored `DISCLAIMER.md`.
//   RULE-FORCED, kept, and recorded as the open specification item LEG2-02: AGSC-06-18
//   "Every prose-carrying export MUST embed the Content Use Terms … (a CC-BY-4.0
//   Bundle still ships under the Content Use Terms)", so the footer's terms line, the
//   JSON-LD `schema:usageInfo` and the export headers still name the terms; and the
//   `/legal/` AI-assistance section quotes AGSC-06-15's constant, as AGSC-06-18 as
//   amended at rc.6 requires.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const validate = require('../../src/knowledge/validate.js');
const { loadBundle } = require('../../src/application/bundle.js');
const site = require('../../src/distribution/site.js');
const html = require('../../src/distribution/html.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const TERMS = 'LicenseRef-AgenticSystemCore-Content-Use-1.0';

function build({ license, crawlers, aiItem = false, disclaimer = null }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-licence-'));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'LICENSE-CONTENT'), path.join(dir, 'LICENSE-CONTENT'));
  fs.writeFileSync(path.join(dir, 'PRIVACY.md'), '# Privacy\n\nNo personal data is collected.\n');
  const configPath = path.join(dir, 'agsc.config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.bundle.license_prose = license;
  config.site.author = 'Ada Lovelace';
  if (crawlers !== undefined) config.site.tdm_crawlers = crawlers;
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  if (aiItem) {
    const at = path.join(dir, 'content', 'concepts', 'supervisor.md');
    fs.writeFileSync(at, fs.readFileSync(at, 'utf8').replace('origin: human', 'origin: ai-assisted\n  agent: an-assistant/1'));
  }
  if (disclaimer !== null) fs.writeFileSync(path.join(dir, 'DISCLAIMER.md'), disclaimer);
  const port = createFileSystem(dir);
  const bundle = loadBundle(port, { schemas: validate.schemas(readSchemas(ROOT)) });
  const clock = createClock({ env: { SOURCE_DATE_EPOCH: '1767225600' } });
  const built = site.build(bundle, { clock, fs: port }, {
    specVersion: '1.0.0-rc.6', version: '0.0.0',
    securityTxt: 'Contact: https://example.org/contact\n',
  });
  fs.rmSync(dir, { force: true, recursive: true });
  const text = (route) => String(built.files.get(route) || '');
  return { built, text };
}

const footerOf = (page) => page.slice(page.indexOf('<footer>'), page.indexOf('</footer>'));

test('Content Use Terms Bundle: all rights reserved, the reservation in both machine dialects', () => {
  const { text } = build({ license: TERMS });
  const footer = footerOf(text('/concepts/handoff/index.html'));
  assert.match(footer, /&#169; 2026 Ada Lovelace\. All rights reserved\. You may cite and link\./u);
  assert.deepStrictEqual(JSON.parse(text('/.well-known/tdmrep.json')), [{ location: 'https://minimal.example/', 'tdm-reservation': 1 }]);
  assert.match(text('/robots.txt'), /^User-agent: GPTBot\nContent-Signal: search=yes, ai-input=yes, ai-train=no\nDisallow: \/$/mu);
});

test('CC BY 4.0 Bundle: no "all rights reserved", no reservation, no ai-train=no — the licence governs', () => {
  const { built, text } = build({ crawlers: [], license: 'CC-BY-4.0' });
  const page = text('/concepts/handoff/index.html');
  const footer = footerOf(page);
  assert.doesNotMatch(footer, /All rights reserved/u);
  assert.match(footer, /&#169; 2026 Ada Lovelace\. The prose is licensed under CC-BY-4\.0\./u);
  assert.deepStrictEqual(JSON.parse(text('/.well-known/tdmrep.json')), [{ location: 'https://minimal.example/', 'tdm-reservation': 0 }]);
  const robots = text('/robots.txt');
  assert.doesNotMatch(robots, /ai-train=no/u);
  assert.doesNotMatch(robots, /Disallow: \//u);
  // An empty crawler list is a fault only for a node that publishes a reservation.
  assert.ok(!built.findings.some((f) => f.code === 'AGSC-E202'), JSON.stringify(built.findings));
  // RULE-FORCED (AGSC-06-18, LEG2-02 open): the terms line still names the terms.
  assert.match(footer, new RegExp(`Content Use Terms: <a href="/legal/">${TERMS}</a>`, 'u'));
});

test('the AI-assistance sentence appears only when a published item records AI assistance', () => {
  const human = footerOf(build({ license: TERMS }).text('/concepts/handoff/index.html'));
  assert.doesNotMatch(human, /Written with AI assistance/u);
  const assisted = footerOf(build({ aiItem: true, license: TERMS }).text('/concepts/handoff/index.html'));
  assert.match(assisted, /class="notice">Written with AI assistance, reviewed and published by a person\./u);
});

test('the disclaimer is the publisher\'s own DISCLAIMER.md, never a constant', () => {
  const none = build({ license: TERMS });
  assert.doesNotMatch(none.text('/concepts/handoff/index.html'), /no organisation named here/u);
  assert.doesNotMatch(none.text('/legal/index.html'), /id="disclaimer"/u);
  const own = build({
    disclaimer: '# What this work does not claim\n\nIndependent work, with no warranty.\n\nA second paragraph.\n',
    license: TERMS,
  });
  const footer = footerOf(own.text('/concepts/handoff/index.html'));
  assert.match(footer, /class="notice">Independent work, with no warranty\. <a href="\/legal\/">Full terms<\/a>/u);
  const legal = own.text('/legal/index.html');
  assert.match(legal, /<h2 id="disclaimer">What this work does not claim<\/h2>/u);
  assert.match(legal, /A second paragraph\./u);
});

test('the /legal/ page quotes AGSC-06-15\'s constant always, and the practice paragraph only with AI items', () => {
  const human = build({ license: TERMS }).text('/legal/index.html');
  assert.match(human, /id="ai-assistance"/u);
  assert.doesNotMatch(human, /an assistant drafts and checks it/u);
  const assisted = build({ aiItem: true, license: TERMS }).text('/legal/index.html');
  assert.match(assisted, /an assistant drafts and checks it/u);
});

test('termsLine: the pieces, one by one', () => {
  const plain = html.termsLine('CC0-1.0', { author: 'A', legal: false, year: '2026' });
  assert.match(plain, /&#169; 2026 A\. The prose is licensed under CC0-1\.0\.<\/p>/u);
  assert.doesNotMatch(plain, /class="notice"/u);
  assert.match(html.termsLine(null, { author: 'A', legal: true, year: '2026' }), /All rights reserved/u);
  assert.match(html.termsLine(TERMS, { aiAssisted: true, disclaimer: 'D.', legal: false }),
    /<p class="notice">Written with AI assistance, reviewed and published by a person\. D\.<\/p>/u);
});

test('readDisclaimer: absent, unreadable, heading-only and heading-less files', () => {
  const port = (files, fail) => ({ fs: {
    exists: (p) => Object.prototype.hasOwnProperty.call(files, p),
    readFile: (p) => { if (fail) throw new Error('EIO'); return files[p]; },
  } });
  assert.strictEqual(site.readDisclaimer({}), null);
  assert.strictEqual(site.readDisclaimer(port({})), null);
  assert.strictEqual(site.readDisclaimer(port({ 'DISCLAIMER.md': 'x' }, true)), null);
  assert.strictEqual(site.readDisclaimer(port({ 'DISCLAIMER.md': '# Only a heading\n' })), null);
  assert.deepStrictEqual(site.readDisclaimer(port({ 'DISCLAIMER.md': 'No heading here.\r\n' })),
    { body: 'No heading here.\n', first: 'No heading here.', heading: 'Disclaimer' });
});
