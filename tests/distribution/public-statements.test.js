'use strict';
// tests/distribution/public-statements.test.js — the two legal-facing surfaces and
// the inputs only a publisher can supply: RFC 9116's security contact
// (`/.well-known/security.txt`) and PRD-019's `/legal/` page (content-use terms,
// privacy notice, operator, retention).
//
// Why this file exists: until this package the writer emitted a `security.txt` with
// NO `Contact:` field and `Expires` set to the build instant — a file RFC 9116 makes
// invalid twice over (section 2.5.3 "This field MUST always be present in a
// 'security.txt' file"; section 2.5.5 "This field MUST always be present and MUST
// NOT appear more than once", "It is RECOMMENDED that the value of this field be
// less than a year into the future to avoid staleness") — and a `/legal/` page that
// carried the terms alone while PRD-019 requires four things of it.
//
// Every build here is over a real copy of `tests/fixtures/minimal` in a temporary
// directory with a fixed clock: no network, no wall clock, nothing left behind.

const test = require('node:test');
const assert = require('node:assert');
const nodeFs = require('node:fs');
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
/** 2026-01-01T00:00:00Z — the fixed instant every test in this repository uses. */
const EPOCH = '1767225600';
const INSTANT = '2026-01-01T00:00:00Z';
/** 364 days after the fixed instant: what the writer derives (inside RFC 9116's year). */
const DERIVED_EXPIRES = '2026-12-31T00:00:00Z';

const TERMS = '# Terms\n\nUse this content as follows.\n';
const NOTICE = 'This node sets no cookies and collects no personal data.\n\n'
  + 'Retention: the git history of the repository is the only record kept.\n';

const temporaries = [];
test.after(() => {
  for (const dir of temporaries) nodeFs.rmSync(dir, { force: true, recursive: true });
});

/** A throwaway copy of the fixture; `null` as a value DELETES that file. */
function workspace(extra = {}) {
  const dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'agsc-public-'));
  temporaries.push(dir);
  nodeFs.cpSync(FIXTURE, dir, { recursive: true });
  for (const [at, text] of Object.entries(extra)) {
    const target = path.join(dir, at);
    if (text === null) {
      nodeFs.rmSync(target, { force: true });
      continue;
    }
    nodeFs.mkdirSync(path.dirname(target), { recursive: true });
    nodeFs.writeFileSync(target, text);
  }
  return dir;
}

function build(dir, options = {}) {
  const fs = createFileSystem(dir);
  const bundle = loadBundle(fs, { schemas: validate.schemas(readSchemas(ROOT)) });
  const clock = createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } });
  return {
    bundle,
    ports: { clock, fs },
    ...site.build(bundle, { clock, fs }, { specVersion: '1.0.0-rc.5', version: '0.0.2', ...options }),
  };
}

const errorsOf = (findings) => findings.filter((f) => f.severity !== 'warn').map((f) => f.code);
const codesOf = (findings) => findings.map((f) => f.code);

// --------------------------------------------------------------- security.txt

test('RFC 9116 sections 2.5.3 and 2.5.5: the emitted file carries the authored Contact and a future Expires', () => {
  const { files, findings } = build(workspace());
  const text = files.get('/.well-known/security.txt');
  assert.ok(text !== undefined, 'no security.txt was emitted');
  assert.match(text, /^Contact: https:\/\/example\.org\/security-contact$/mu);
  assert.match(text, new RegExp(`^Expires: ${DERIVED_EXPIRES}$`, 'mu'));
  assert.match(text, /^Canonical: https:\/\/minimal\.example\/\.well-known\/security\.txt$/mu);
  assert.deepStrictEqual(errorsOf(findings), [], JSON.stringify(findings));
  // The derived expiry is inside RFC 9116's recommended year and after the build.
  const expires = Date.parse(DERIVED_EXPIRES) - Date.parse(INSTANT);
  assert.ok(expires > 0 && expires < 366 * 24 * 60 * 60 * 1000);
});

test('an authored Expires is published as authored when it is in the future and inside the year', () => {
  const { files, findings } = build(workspace({
    '.well-known/security.txt': 'Contact: mailto:security@example.org\nExpires: 2026-06-01T00:00:00Z\n',
  }));
  const text = files.get('/.well-known/security.txt');
  assert.match(text, /^Expires: 2026-06-01T00:00:00Z$/mu);
  assert.strictEqual((text.match(/^Expires:/gmu) || []).length, 1);
  assert.deepStrictEqual(errorsOf(findings), []);
});

test('an Expires in the past FAILS the build and nothing is emitted for the route', () => {
  const { files, findings, skipped } = build(workspace({
    '.well-known/security.txt': 'Contact: https://example.org/c\nExpires: 1970-01-01T00:00:00Z\n',
  }));
  assert.ok(!files.has('/.well-known/security.txt'), 'a stale security.txt was published');
  assert.deepStrictEqual(errorsOf(findings), ['AGSC-E204']);
  assert.ok(findings.some((f) => /stale/u.test(f.message)), JSON.stringify(findings));
  assert.ok(skipped.some((s) => s.startsWith('/.well-known/security.txt')), skipped.join(' | '));
});

test('an Expires more than a year ahead is a WARNING, and the file is still published', () => {
  const { files, findings } = build(workspace({
    '.well-known/security.txt': 'Contact: https://example.org/c\nExpires: 2030-01-01T00:00:00Z\n',
  }));
  assert.match(files.get('/.well-known/security.txt'), /^Expires: 2030-01-01T00:00:00Z$/mu);
  assert.deepStrictEqual(errorsOf(findings), []);
  assert.ok(findings.some((f) => f.code === 'AGSC-E204' && f.severity === 'warn'), JSON.stringify(findings));
});

test('no Contact field FAILS the build: an invalid published security contact is worse than none', () => {
  const { files, findings } = build(workspace({
    '.well-known/security.txt': 'Policy: https://minimal.example/legal/\nPreferred-Languages: en\n',
  }));
  assert.ok(!files.has('/.well-known/security.txt'));
  assert.deepStrictEqual(errorsOf(findings), ['AGSC-E202']);
});

test('no authored file at all FAILS the build with the file-not-found code', () => {
  const { files, findings } = build(workspace({ '.well-known/security.txt': null }));
  assert.ok(!files.has('/.well-known/security.txt'));
  assert.deepStrictEqual(errorsOf(findings), ['AGSC-E901']);
  assert.ok(findings[0].message.includes('MUST always be present'));
});

test('a line that is not a field, a comment or blank is reported', () => {
  const { findings } = build(workspace({
    '.well-known/security.txt': '# a comment\n\nContact: https://example.org/c\nnot a field line\n',
  }));
  assert.ok(errorsOf(findings).includes('AGSC-E204'), JSON.stringify(findings));
});

test('Expires stated twice is reported (RFC 9116 section 2.5.5: MUST NOT appear more than once)', () => {
  const { findings } = build(workspace({
    '.well-known/security.txt': 'Contact: https://example.org/c\nExpires: 2026-06-01T00:00:00Z\nExpires: 2026-07-01T00:00:00Z\n',
  }));
  assert.ok(errorsOf(findings).includes('AGSC-E204'));
});

test('Policy is derived only when /legal/ is emitted, and an authored Policy is never overwritten', () => {
  const withTerms = build(workspace({ 'LICENSE-CONTENT': TERMS }));
  assert.match(withTerms.files.get('/.well-known/security.txt'), /^Policy: https:\/\/minimal\.example\/legal\/$/mu);
  const without = build(workspace());
  assert.ok(!without.files.get('/.well-known/security.txt').includes('Policy:'));
  const authored = build(workspace({
    'LICENSE-CONTENT': TERMS,
    '.well-known/security.txt': 'Contact: https://example.org/c\nPolicy: https://example.org/policy\n',
  }));
  const text = authored.files.get('/.well-known/security.txt');
  assert.strictEqual((text.match(/^Policy:/gmu) || []).length, 1);
  assert.match(text, /^Policy: https:\/\/example\.org\/policy$/mu);
});

test('a Contact at another origin is not read as a dangling internal link', () => {
  const { findings } = build(workspace({ 'LICENSE-CONTENT': TERMS }));
  assert.deepStrictEqual(findings.filter((f) => f.code === 'AGSC-E901'), []);
  const links = site.internalLinks(
    new Map([['/.well-known/security.txt', 'Contact: https://elsewhere.example/c\nPolicy: https://minimal.example/legal/\n']]),
    { base: 'https://minimal.example' },
  );
  assert.deepStrictEqual(links.map((l) => l.route), ['/legal/']);
});

test('a field value can never forge a line (AGSC-02-24)', () => {
  const { files } = build(workspace({
    '.well-known/security.txt': 'Contact: https://example.org/c Expires: 1970-01-01T00:00:00Z\n',
  }));
  const text = files.get('/.well-known/security.txt');
  assert.ok(text !== undefined);
  assert.strictEqual((text.match(/^Expires:/gmu) || []).length, 1);
  assert.match(text, new RegExp(`^Expires: ${DERIVED_EXPIRES}$`, 'mu'));
});

test('readPrivacyNotice is total: absent, blank, unreadable and no port at all', () => {
  assert.strictEqual(site.readPrivacyNotice(undefined), null);
  assert.strictEqual(site.readPrivacyNotice({ fs: {} }), null);
  assert.strictEqual(site.readPrivacyNotice({ fs: { exists: () => false, readFile: () => 'x' } }), null);
  assert.strictEqual(site.readPrivacyNotice({ fs: { exists: () => true, readFile: () => '\n \n' } }), null);
  assert.strictEqual(site.readPrivacyNotice({
    fs: { exists: () => true, readFile: () => { throw new Error('outside the root'); } },
  }), null);
  assert.strictEqual(site.readPrivacyNotice({ fs: { exists: () => true, readFile: () => 'No cookies.' } }),
    'No cookies.');
});

test('readSecurityTxt is total: absent, blank, unreadable and no port at all', () => {
  assert.strictEqual(site.readSecurityTxt(undefined), null);
  assert.strictEqual(site.readSecurityTxt({ fs: {} }), null);
  assert.strictEqual(site.readSecurityTxt({ fs: { exists: () => false, readFile: () => 'x' } }), null);
  assert.strictEqual(site.readSecurityTxt({ fs: { exists: () => true, readFile: () => '  \n' } }), null);
  assert.strictEqual(site.readSecurityTxt({
    fs: { exists: () => true, readFile: () => { throw new Error('outside the root'); } },
  }), null);
  assert.strictEqual(site.readSecurityTxt({ fs: { exists: () => true, readFile: () => 'Contact: x' } }), 'Contact: x');
});

// --------------------------------------------------------------------- /legal/

test('PRD-019: /legal/ carries the terms, the privacy notice and the operator', () => {
  const { files, findings } = build(workspace({ 'LICENSE-CONTENT': TERMS, 'PRIVACY.md': NOTICE }));
  const page = files.get('/legal/index.html');
  assert.ok(page !== undefined, '/legal/ was not emitted');
  assert.match(page, /<h1>Legal and privacy<\/h1>/u);
  assert.match(page, /Use this content as follows/u);
  assert.match(page, /<h2 id="privacy">Privacy<\/h2>/u);
  assert.match(page, /collects no personal data/u);
  assert.match(page, /Retention: the git history/u);
  assert.match(page, /<h2 id="operator">Operator<\/h2>/u);
  assert.match(page, /human:andreibesleaga/u);
  assert.deepStrictEqual(codesOf(findings).filter((c) => c === 'AGSC-E406'), []);
});

test('with no PRIVACY.md the section is OMITTED and the build warns — never invented', () => {
  const { files, findings } = build(workspace({ 'LICENSE-CONTENT': TERMS }));
  const page = files.get('/legal/index.html');
  assert.ok(!page.includes('id="privacy"'), 'a privacy section appeared with no input');
  const warn = findings.filter((f) => f.code === 'AGSC-E406');
  assert.strictEqual(warn.length, 1, JSON.stringify(findings));
  assert.strictEqual(warn[0].severity, 'warn');
  assert.strictEqual(warn[0].file, 'PRIVACY.md');
});

test('with no operator configured the section is omitted and the build warns', () => {
  const dir = workspace({ 'LICENSE-CONTENT': TERMS, 'PRIVACY.md': NOTICE });
  const config = JSON.parse(nodeFs.readFileSync(path.join(dir, 'agsc.config.json'), 'utf8'));
  delete config.bundle.operator;
  nodeFs.writeFileSync(path.join(dir, 'agsc.config.json'), `${JSON.stringify(config, null, 2)}\n`);
  const { files, findings } = build(dir);
  assert.ok(!files.get('/legal/index.html').includes('id="operator"'));
  assert.ok(findings.some((f) => f.code === 'AGSC-E406' && f.file === 'agsc.config.json'), JSON.stringify(findings));
});

test('the operator line is site.author, bundle.operator, both, or nothing', () => {
  assert.strictEqual(site.operatorLine({}), null);
  assert.strictEqual(site.operatorLine({ site: { author: 'A Person' } }), 'A Person');
  assert.strictEqual(site.operatorLine({ bundle: { operator: 'human:a' } }), 'human:a');
  assert.strictEqual(site.operatorLine({ bundle: { operator: 'human:a' }, site: { author: 'A Person' } }),
    'A Person (human:a)');
});

test('the legal page adds no term, no notice and no operator of its own', () => {
  const page = html.legalPage({
    licenseProse: 'CC-BY-4.0', operator: null, privacy: null, rendered: '<p>Body.</p>', terms: 'LicenseRef-X',
  }, { licenseProse: 'CC-BY-4.0', render: (t) => ({ html: t }) });
  assert.match(page, /<code>LicenseRef-X<\/code>/u);
  assert.match(page, /<p>Body\.<\/p>/u);
  assert.ok(!page.includes('id="privacy"'));
  assert.ok(!page.includes('id="operator"'));
});

// --------------------------------------- rc.6: the AI-assistance statement (D105)

test('AGSC-06-18 (rc.6): /legal/ carries the assistance statement, in the same words', () => {
  const { ASSISTANCE } = require('../../src/knowledge/provenance-header.js');
  const page = html.legalPage({
    licenseProse: 'CC-BY-4.0', operator: null, privacy: null, rendered: '<p>Body.</p>', terms: 'LicenseRef-X',
  }, { licenseProse: 'CC-BY-4.0', render: (t) => ({ html: t }) });
  assert.ok(page.includes('id="ai-assistance"'), 'the /legal/ page states nothing about AI assistance');
  // "in the same words the provenance header of every agent-facing export carries":
  // the page QUOTES the constant, so the two cannot drift.
  assert.ok(page.includes(html.escapeHtml(ASSISTANCE)), page);
  // It needs no authored input, so it is never absent and never invented.
  assert.ok(html.legalPage({ licenseProse: null, operator: 'A Person', privacy: '<p>P</p>', rendered: '<p>B</p>', terms: 'X' },
    { render: (t) => ({ html: t }) }).includes('id="ai-assistance"'));
});

test('B-04 (rc.6): the page footer carries the copyright line, from configuration', () => {
  const withAuthor = html.termsLine('CC-BY-4.0', {
    aiAssisted: true, author: 'Ada Lovelace', disclaimer: html.NO_CLAIM_SENTENCE, legal: true, year: '2026',
  });
  assert.match(withAuthor, /class="copyright">&#169; 2026 Ada Lovelace\./u);
  assert.match(withAuthor, /class="notice">Written with AI assistance/u);
  assert.match(withAuthor, /no warranty and no liability/u);
  // The engine is a general tool: with no `site.author` it names NOBODY rather than
  // stamping one owner's name into somebody else's pages.
  const anonymous = html.termsLine('CC-BY-4.0', { legal: true });
  assert.ok(!anonymous.includes('copyright'), anonymous);
  // CHANGED by ENG-9 (LEG2-02): the notice is no longer a constant. With no AI item
  // and no authored DISCLAIMER.md there is nothing true to say, and nothing is said.
  assert.doesNotMatch(anonymous, /class="notice"/u);
  // The /legal/ link is emitted only where that route exists (V9D-A6).
  assert.ok(!html.termsLine('CC-BY-4.0', { author: 'A', legal: false, year: '2026' }).includes('href="/legal/"'));
});

test('B-04 (rc.6): the year is the BUILD INSTANT\'s year, never a clock', () => {
  const configured = JSON.stringify({
    ...JSON.parse(nodeFs.readFileSync(path.join(FIXTURE, 'agsc.config.json'), 'utf8')),
    site: {
      ...JSON.parse(nodeFs.readFileSync(path.join(FIXTURE, 'agsc.config.json'), 'utf8')).site,
      author: 'Ada Lovelace',
    },
  }, null, 2);
  const build = (epoch) => {
    const dir = workspace({ 'agsc.config.json': configured });
    const fs = createFileSystem(dir);
    const bundle = loadBundle(fs, { schemas: validate.schemas(readSchemas(ROOT)) });
    const clock = createClock({ env: { SOURCE_DATE_EPOCH: epoch } });
    return String(site.build(bundle, { clock, fs },
      { specVersion: '1.0.0-rc.6', version: '0.0.2' }).files.get('/index.html'));
  };
  assert.match(build(EPOCH), /&#169; 2026 /u);
  assert.match(build('1104537600'), /&#169; 2005 /u);   // 2005-01-01T00:00:00Z
});

// ------------------------------------------------- one fault is counted once

test('AGSC-09-11: under ci the publication findings are reported by ONE lane', () => {
  const ci = require('../../src/distribution/ci.js');
  const dir = workspace({ '.well-known/security.txt': null });
  const fs = createFileSystem(dir);
  const bundle = loadBundle(fs, { schemas: validate.schemas(readSchemas(ROOT)) });
  const clock = createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } });
  const lintLane = require('../../src/application/cli/verbs/lint.js');
  const ctx = { ports: { clock, fs } };
  const result = ci.ci(bundle, { clock, fs }, {
    lint: (loaded) => lintLane.lane(ctx, loaded).findings,
    specVersion: '1.0.0-rc.5',
    version: '0.0.2',
  });
  assert.strictEqual(result.findings.filter((f) => f.code === 'AGSC-E901').length, 1,
    JSON.stringify(result.findings.map((f) => f.code)));
  assert.strictEqual(result.exit, 1);
});

// ------------------------------- FV29-11: the drop-in build with no date source

test('AGSC-04-09 + RFC 9116: a defaulted build instant FAILS instead of publishing a 1970 expiry', () => {
  // `agsc init` then `agsc build`, before `git init` and with no SOURCE_DATE_EPOCH:
  // AGSC-04-09 lets the instant default to 0 with the warning AGSC-E606. The writer
  // then derived `Expires: 1970-12-31T00:00:00Z` — a security contact that expired
  // decades before it was published, which RFC 9116 section 2.5.5 makes stale by
  // definition. That is the very defect the authored-Expires check closes, surviving
  // in the DERIVED branch.
  const dir = workspace();
  const fs = createFileSystem(dir);
  const bundle = loadBundle(fs, { schemas: validate.schemas(readSchemas(ROOT)) });
  const clock = createClock({ env: {} });                    // no epoch, no git history
  assert.strictEqual(clock.now(), 0, 'the fixture of this test is wrong');
  const { files, findings } = site.build(bundle, { clock, fs },
    { specVersion: '1.0.0-rc.5', version: '0.0.2' });
  assert.ok(!files.has('/.well-known/security.txt'),
    `an expired security contact was published: ${files.get('/.well-known/security.txt')}`);
  const fault = findings.find((f) => f.file === '.well-known/security.txt' && f.severity !== 'warn');
  assert.ok(fault, `the build did not fail: ${JSON.stringify(findings.map((f) => f.code))}`);
  assert.strictEqual(fault.code, 'AGSC-E204');
  // The message must tell the publisher what to DO, in plain words.
  assert.match(fault.message, /SOURCE_DATE_EPOCH/u);
  assert.match(fault.message, /commit/iu);
});

test('AGSC-04-02: the derived expiry stays a pure function of the build instant', () => {
  // The fix must not reach for a real clock: two builds at the same instant, in two
  // time zones, still derive the same byte.
  const dir = workspace();
  const run = () => {
    const fs = createFileSystem(dir);
    const bundle = loadBundle(fs, { schemas: validate.schemas(readSchemas(ROOT)) });
    const clock = createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } });
    return site.build(bundle, { clock, fs }, { specVersion: '1.0.0-rc.5', version: '0.0.2' })
      .files.get('/.well-known/security.txt');
  };
  const first = String(run());
  assert.match(first, new RegExp(`^Expires: ${DERIVED_EXPIRES}$`, 'mu'));
  assert.strictEqual(String(run()), first);
  // And a Bundle whose git history supplies the instant is unaffected.
  const fs = createFileSystem(dir);
  const bundle = loadBundle(fs, { schemas: validate.schemas(readSchemas(ROOT)) });
  const fromGit = createClock({ env: {}, lastCommitSeconds: Number(EPOCH) });
  assert.match(String(site.build(bundle, { clock: fromGit, fs },
    { specVersion: '1.0.0-rc.5', version: '0.0.2' }).files.get('/.well-known/security.txt')),
  new RegExp(`^Expires: ${DERIVED_EXPIRES}$`, 'mu'));
});
