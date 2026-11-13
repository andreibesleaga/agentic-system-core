'use strict';
// tests/standard/surfaces-wording.test.js — the wording of the chapters on the
// published surfaces (spec/06) and on governance (spec/08), of the standards
// register (docs/SPEC.md section 4) and of the compliance crosswalk: what each
// sentence credits to another standard is what that standard says, the two sets
// of items ("published" and "listed") are named as spec/00 defines them, every
// "fail" names its code or says that it has none, and an optional line is called
// optional.
//
// These are assertions on plain text. They check that a sentence is there, or
// that a wrong one is gone; they do not check the behaviour the sentence states,
// which the conformance cases and the unit tests do. That is why the test titles
// below name chapters and topics, not rule ids: a rule counts as verified only
// through a check of its behaviour.
//
// Deterministic: reads files only; no process, no clock, no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, ...rel.split('/')), 'utf8');

const CH06 = read('spec/06-surfaces.md');
const CH08 = read('spec/08-governance.md');
const SPEC_DOC = read('docs/SPEC.md');
const CROSSWALK = read('docs/COMPLIANCE-CROSSWALK.md');

/** The text of one rule: from its bold id to the next rule bullet or heading. */
function rule(text, id) {
  const at = text.indexOf(`- **${id}**`);
  assert.ok(at >= 0, `${id} is not in this chapter`);
  const rest = text.slice(at + 1);
  const next = rest.search(/\n- \*\*AGSC-|\n#{1,6} /u);
  return next < 0 ? text.slice(at) : text.slice(at, at + 1 + next);
}

/** The sentences of a text, split after a full stop, a question mark or a semicolon. */
function sentences(text) {
  return text.replace(/\s+/gu, ' ').split(/(?<=[.;])\s+(?=[A-Z`(*])/u);
}

/** The rows of the pipe table under one `## ` heading of a Markdown file. */
function registerRows(text, heading) {
  const start = text.indexOf(`## ${heading}`);
  assert.ok(start >= 0, `no heading "## ${heading}"`);
  const end = text.indexOf('\n## ', start + 1);
  return text.slice(start, end < 0 ? undefined : end).split('\n').filter((l) => l.startsWith('| '));
}

test('spec/06, the licence dialects: robots.txt is credited with its per-crawler groups, not with AI-usage signals', () => {
  const text = rule(CH06, 'AGSC-06-18');
  assert.doesNotMatch(text, /AI-usage signals/u, 'RFC 9309 defines no AI-usage signal');
  assert.match(text, /per-crawler `User-agent`\/`Disallow` groups/u);
});

test('spec/06, the licence dialects: Content-Signal is named as an optional other record that is not a dialect', () => {
  const text = rule(CH06, 'AGSC-06-18').replace(/\s+/gu, ' ');
  assert.match(text, /Content-Signal/u);
  assert.match(text, /RFC 9309 §2\.2\.4/u);
  assert.match(text, /optional "other record"/u);
  assert.match(text, /not counted as a dialect/u);
});

test('spec/06, the licence dialects: each sentence that makes a build fail names its code', () => {
  const text = rule(CH06, 'AGSC-06-18');
  const failing = sentences(text).filter((s) => /MUST (?:\*\*)?fail(?:\*\*)?/u.test(s));
  assert.ok(failing.length >= 2, 'the two build failures of the rule are gone');
  for (const s of failing) assert.match(s, /AGSC-E\d{3}/u, `no code in: ${s.slice(0, 160)}`);
});

test('spec/06 and docs/SPEC.md: /llms.txt is not called a profile of llms.txt, and the summary a v2 parser reads is said (from 1.1)', () => {
  for (const [name, text] of [['spec/06', CH06], ['docs/SPEC.md', SPEC_DOC]]) {
    assert.doesNotMatch(text, /profile of llms\.txt/iu, `${name} still calls /llms.txt a profile of llms.txt`);
  }
  // 1.1 (AGSC-06-13, AGSC-06-13a): the summary follows the H1, so a v2 parser reads it.
  assert.match(rule(CH06, 'AGSC-06-13').replace(/\s+/gu, ' '), /so a v2 parser reads the summary again/u);
  assert.match(rule(CH06, 'AGSC-06-13a').replace(/\s+/gu, ' '), /the summary follows the H1/u);
  const row = registerRows(SPEC_DOC, '4. Standards Register').find((l) => l.startsWith('| llms.txt |'));
  assert.ok(row, 'no llms.txt row in the register');
  // 1.1 (AGSC-06-13a): the summary follows the H1, so a v2 parser reads it; the 1.0 note stays in the rule.
  assert.match(row, /a v2 parser reads the summary/u);
});

test('spec/06, the llms.txt index: every listed item is reachable, as spec/00 names that set', () => {
  const text = rule(CH06, 'AGSC-06-14');
  assert.match(text, /Every listed item MUST be reachable from `\/llms\.txt`/u);
  assert.doesNotMatch(text, /Every published item/u);
});

test('spec/06, the legacy discovery alias: no version before this line, SHOULD, a name that will not be registered', () => {
  const text = rule(CH06, 'AGSC-06-17').replace(/\s+/gu, ' ');
  assert.doesNotMatch(text, /0\.0\.x/u);
  assert.doesNotMatch(text, /alias MUST be present/u);
  assert.match(text, /`_redirects` SHOULD carry `\/\.well-known\/agentic-knowledge`/u);
  assert.match(text, /legacy name/u);
  assert.match(text, /will not be registered/u);
});

test('spec/06, target attributes: the CoRE registry of RFC 9423 is named, and no Web-wide registry is claimed', () => {
  const text = rule(CH06, 'AGSC-06-10').replace(/\s+/gu, ' ');
  assert.doesNotMatch(text, /no registry of target attributes exists/u);
  assert.match(text, /RFC 9423/u);
  assert.match(text, /no Web-wide registry/u);
});

test('spec/06, the context file: no claim that every external property has a typed term definition', () => {
  assert.doesNotMatch(rule(CH06, 'AGSC-06-32'), /typed term definition for every external property/u);
});

test('spec/06, the about page: the honest-limit statement is this specification\'s own text, not an Internet-Draft\'s', () => {
  const text = rule(CH06, 'AGSC-06-24').replace(/\s+/gu, ' ');
  assert.doesNotMatch(text, /Internet-Draft/u);
  assert.match(text, /both of its sentences/u);
});

test('spec/08, the trailer block: the Assisted-by line MAY be added, and a present line must name the operator', () => {
  const text = rule(CH08, 'AGSC-08-07').replace(/\s+/gu, ' ');
  assert.doesNotMatch(text, /is REQUIRED/u);
  assert.match(text, /`Assisted-by:` line naming the operator MAY be added/u);
  assert.match(text, /when one is present, its operator MUST match `prov\.operator` \(`AGSC-E505`\)/u);
});

test('spec/08, the trailer block: the maintainer\'s own commits are not contributions', () => {
  const text = rule(CH08, 'AGSC-08-06').replace(/\s+/gu, ' ');
  assert.match(text, /someone other than the node's maintainer/u);
});

test('spec/08, auto-channel merges: clause (g) exempts the root commit and says what the git-log file lets verify and ci check', () => {
  const text = rule(CH08, 'AGSC-08-26').replace(/\s+/gu, ' ');
  const g = text.slice(text.indexOf('(g)'), text.indexOf('The channel-auto lane is OPTIONAL'));
  assert.match(g, /root commit/u);
  assert.match(g, /git-log file of AGSC-08-20b/u);
  assert.match(g, /`publish` is `auto`/u);
  assert.match(g, /`verify` and `ci` MUST report/u);
  assert.match(g, /AGSC-E706/u);
  assert.match(g, /forge's CI/u, 'the parts only the forge can see are not assigned');
});

test('spec/08, the ledger file and the review lane: a "not run" and a failing build say that they carry no code', () => {
  const notRun = sentences(rule(CH08, 'AGSC-08-20b')).find((s) => /not run/u.test(s));
  assert.ok(notRun, 'the "not run" sentence is gone');
  assert.match(notRun, /no finding code/u);
  const fail = sentences(rule(CH08, 'AGSC-08-27')).find((s) => /MUST \*\*fail\*\*/u.test(s));
  assert.ok(fail, 'the failing-build sentence is gone');
  assert.match(fail, /no finding code/u);
});

test('spec/08, the spend meter and the ledger head: what a build can read and what "attested" means are stated', () => {
  const meter = rule(CH08, 'AGSC-08-25').replace(/\s+/gu, ' ');
  assert.match(meter, /a build reads only the Bundle/u);
  assert.match(rule(CH08, 'AGSC-08-24').replace(/\s+/gu, ' '), /release assets/u);
  assert.match(rule(CH08, 'AGSC-08-02').replace(/\s+/gu, ' '), /[Nn]o 1\.0 route, view or export carries either member/u);
  const lane = rule(CH08, 'AGSC-08-28').replace(/\s+/gu, ' ');
  assert.doesNotMatch(lane, /recording the skipped run as the warning `AGSC-E510` in the NOW page/u);
});

test('docs/SPEC.md register: rows for Content-Signal, RFC 9111 and RFC 9423; robots.txt is not credited with AI-usage signals', () => {
  const rows = registerRows(SPEC_DOC, '4. Standards Register');
  for (const name of ['Content-Signal', 'RFC 9111', 'RFC 9423']) {
    assert.ok(rows.some((l) => l.split('|')[1].includes(name)), `no register row for ${name}`);
  }
  assert.ok(!rows.some((l) => /AI-usage/u.test(l)), 'a register row still speaks of AI-usage signals or policy');
});

test('docs/COMPLIANCE-CROSSWALK.md: the robots.txt reading agrees with the dialect rule on Content-Signal', () => {
  const row = CROSSWALK.split('\n').find((l) => l.startsWith('| **RFC 9309 robots.txt**'));
  assert.ok(row, 'no RFC 9309 row');
  assert.doesNotMatch(row, /neither requires nor forbids/u);
  assert.match(row, /optional "other record"/u);
  assert.match(row, /not counted as a dialect/u);
});
