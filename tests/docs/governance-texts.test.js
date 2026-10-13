'use strict';
// tests/docs/governance-texts.test.js — the governance texts at the root of this
// repository (GOVERNANCE.md, CONTRIBUTING.md, SECURITY.md, TRADEMARK-POLICY.md, NOTICE,
// CODE_OF_CONDUCT.md, CITATION.cff, AGENTS.md, README.md and the forms under .github/)
// say the same thing as each other and as the project does: who signs off, how the
// ledger names an author, which versions are supported, which licence covers which
// folder, how a conformance claim is worded, and the one form of a pinned reference.
//
// Deterministic: reads files only; no process, no clock, no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const ROOT = path.resolve(__dirname, '..', '..');

/** The text of one file of the repository, relative to its root. */
function read(rel) {
  return fs.readFileSync(path.join(ROOT, ...rel.split('/')), 'utf8');
}

/** The text of one `## Heading` section of a Markdown file, up to the next `## `. */
function section(text, heading) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l === `## ${heading}`);
  assert.ok(start !== -1, `no section "## ${heading}"`);
  let end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  if (end === -1) end = lines.length;
  return lines.slice(start + 1, end).join('\n');
}

/** Lines joined into one paragraph-insensitive string (hard-wrapped prose reads as one). */
function flat(text) {
  return text.replace(/\s+/gu, ' ');
}

/** The rows of the first pipe table of `text`, header and divider left out, as cells. */
function tableRows(text) {
  const rows = text.split('\n').filter((l) => l.startsWith('|'));
  return rows.slice(2).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
}

// The coverage bar the continuous-integration run enforces on src/.
const COVERAGE = Object.freeze({ lines: 99.9, functions: 99, branches: 93 });

test('the trademark policy states no conformance sentence of its own and points to the one document that does', () => {
  const policy = read('TRADEMARK-POLICY.md');
  assert.doesNotMatch(policy, /«[^»]*»\s+conforms to AgenticSystemCore/u,
    'TRADEMARK-POLICY.md restates the claim sentence');
  assert.doesNotMatch(policy, /«passed» of «total»/u, 'TRADEMARK-POLICY.md restates the claim sentence');
  assert.doesNotMatch(policy, /in exactly this form/u);
  assert.match(policy, /\]\(docs\/CONFORMANCE-STATEMENTS\.md\)/u);
  // The document it points to holds the sentence, and says where the complete list is.
  const statements = read('docs/CONFORMANCE-STATEMENTS.md');
  assert.match(statements, /«Your implementation name» «version» conforms to AgenticSystemCore/u);
  assert.match(statements, /AGSC-09-01/u);
});

test('the coverage bar in CONTRIBUTING.md is the one the test script enforces', () => {
  const text = flat(read('CONTRIBUTING.md'));
  assert.match(text, new RegExp(`line coverage ${COVERAGE.lines} %, functions ${COVERAGE.functions} %,`
    + ` branches ${COVERAGE.branches} %`, 'u'));
  assert.match(text, /enforced in CI/u);
  // Every other percentage CONTRIBUTING.md states about coverage is one of the three.
  for (const m of text.matchAll(/(\d+(?:\.\d+)?) %/gu)) {
    assert.ok(Object.values(COVERAGE).includes(Number(m[1])), `CONTRIBUTING.md states ${m[0]}`);
  }
  // Once the coverage script carries thresholds, they are the same three numbers.
  const script = JSON.parse(read('package.json')).scripts['test:coverage'];
  for (const [name, value] of Object.entries(COVERAGE)) {
    const flag = new RegExp(`--test-coverage-${name}=([0-9.]+)`, 'u').exec(script);
    if (flag !== null) assert.equal(Number(flag[1]), value, `test:coverage --test-coverage-${name}`);
  }
});

test('SECURITY.md supports the latest 1.x release and no release candidate, and says how disclosure goes', () => {
  const text = read('SECURITY.md');
  const rows = tableRows(section(text, 'Supported versions'));
  assert.ok(rows.length >= 2, 'the supported-versions table has rows');
  for (const [version, supported] of rows) {
    if (/release candidate|-rc/u.test(version)) {
      assert.match(supported, /^no\b/u, `"${version}" is supported`);
    }
  }
  assert.ok(rows.some(([v, s]) => /`1\.0\.x`/u.test(v) && /^yes\b/u.test(s)), 'no "1.0.x — yes" row');
  assert.ok(rows.some(([v, s]) => /`1\.0\.0-rc\.\*`/u.test(v) && /^no\b/u.test(s)), 'no "1.0.0-rc.* — no" row');
  const disclosure = flat(section(text, 'Coordinated disclosure'));
  assert.match(disclosure, /fix is released first/u);
  assert.match(disclosure, /advisory/u);
  assert.match(disclosure, /CVE/u);
});

test('the sign-off is required for outside contributions; the maintainer\'s own commits are exempt', () => {
  for (const file of ['CONTRIBUTING.md', 'GOVERNANCE.md']) {
    const text = flat(read(file));
    assert.match(text, /outside contribution/u, `${file} does not limit the sign-off to outside contributions`);
    assert.match(text, /maintainer's own commits are exempt/u, `${file} does not exempt the maintainer`);
    assert.doesNotMatch(text, /Every accepted (?:change|contribution) carries/u, `${file} still asks it of every change`);
  }
  const contributing = read('CONTRIBUTING.md');
  assert.ok(contributing.split('\n').includes('## Signing off'), 'the heading is "## Signing off"');
  assert.doesNotMatch(contributing, /not settled/u);
  // The assistant line is optional; when it is written, its operator must match.
  assert.match(flat(contributing), /`Assisted-by:` line is optional/u);
});

test('CONTRIBUTING.md says how the ledger names the author of a commit', () => {
  const text = flat(section(read('CONTRIBUTING.md'), 'Signing off'));
  assert.match(text, /ledger/u);
  assert.match(text, /`Signed-off-by:` trailer/u);
  assert.match(text, /`human:unknown`/u);
});

test('a released vector is never edited, except its specification-version string', () => {
  for (const file of ['CONTRIBUTING.md', 'AGENTS.md']) {
    const text = flat(read(file));
    assert.match(text, /never edited/u, file);
    assert.match(text, /except the specification-version string/u, `${file} omits the exception`);
    assert.match(text, /AGSC-00-16/u, `${file} does not name the rule`);
  }
});

test('the release section of CONTRIBUTING.md: annotated tags, a pull request, the specification tag first', () => {
  const text = flat(section(read('CONTRIBUTING.md'), 'Releases'));
  assert.match(text, /`git tag -a`/u);
  assert.doesNotMatch(text, /git tag -s/u);
  assert.match(text, /`release\/<version>` branch/u);
  assert.match(text, /pull request/u);
  assert.match(text, /specification tag is pushed before the package tag/u);
  assert.match(text, /`release` and `pypi` environments/u);
});

test('GOVERNANCE.md: every final release is on Zenodo, every release stays in the registries', () => {
  const text = flat(read('GOVERNANCE.md'));
  assert.match(text, /Every final release is deposited on Zenodo; every release stays in the npm and PyPI registries\./u);
  assert.doesNotMatch(text, /every (?:published )?release is archived/iu);
});

test('every folder that ships text has a licence: NOTICE and the README table agree', () => {
  const notice = flat(read('NOTICE'));
  const table = tableRows(section(read('README.md'), 'Licences')).map((r) => r.join(' | '));
  const row = (folder) => table.find((r) => r.includes(`\`${folder}\``)) || '';
  for (const folder of ['docs/', 'features/', 'examples/']) {
    assert.match(notice, new RegExp(`${folder}[^;]*Apache License 2\\.0`, 'u'), `NOTICE: ${folder}`);
    assert.match(row(folder), /Apache-2\.0/u, `README: ${folder}`);
  }
  assert.match(notice, /w3c\/[^;]*CC BY 4\.0/u);
  assert.match(row('w3c/'), /CC-BY-4\.0/u);
  assert.match(notice, /internet-draft\/[^;]*BCP 78/u);
  assert.match(row('internet-draft/'), /BCP 78/u);
  // The agent skill and the plugin marketplace files declare CC0 in their own files
  // (skills/*/SKILL.md, plugins/*/.claude-plugin/plugin.json, .claude-plugin/marketplace.json).
  assert.match(notice, /skills\/ and plugins\/[^;]*\.claude-plugin\/[^;]*CC0 1\.0 Universal/u, 'NOTICE: the skill and the marketplace files');
  const skill = row('skills/');
  assert.match(skill, /`plugins\/`[^|]*`\.claude-plugin\/`/u, 'README: one row names the skill, the plugin and the marketplace files');
  assert.match(skill, /CC0-1\.0/u, 'README: the skill row');
  for (const rel of ['skills/agentic-system-core/SKILL.md', 'plugins/agentic-system-core/skills/agentic-system-core/SKILL.md']) {
    assert.match(read(rel), /^license: CC0-1\.0$/mu, `${rel} declares the same licence`);
  }
  assert.equal(JSON.parse(read('plugins/agentic-system-core/.claude-plugin/plugin.json')).license, 'CC0-1.0');
});

test('CITATION.cff names both licences of the package', () => {
  const cff = YAML.parse(read('CITATION.cff'));
  assert.deepEqual(cff.license, ['Apache-2.0', 'CC0-1.0']);
  const expression = JSON.parse(read('package.json')).license.split(/\s+AND\s+/u);
  assert.deepEqual([...expression].sort(), [...cff.license].sort());
});

test('the code of conduct names a route for a report about the maintainer', () => {
  const text = flat(section(read('CODE_OF_CONDUCT.md'), 'Reporting'));
  assert.match(text, /about the maintainer/u);
  assert.match(text, /GitHub/u);
});

test('README: one pinned form for the GitHub Action and the pre-commit hook', () => {
  const text = read('README.md');
  const uses = /^\s*- uses: andreibesleaga\/agentic-system-core@(\S+)$/mu.exec(text);
  assert.ok(uses !== null, 'no "uses:" line for the action');
  assert.match(uses[1], /^v\d+\.\d+\.\d+$/u, `the action is pinned to "${uses[1]}"`);
  const rev = /^\s*rev: (\S+)$/mu.exec(text);
  assert.ok(rev !== null, 'no "rev:" line for the hook');
  assert.equal(rev[1], uses[1], 'the hook and the action name the same tag');
  const prose = flat(text);
  assert.match(prose, /the package tag/u);
  assert.match(prose, /full commit SHA/u);
});

test('README: the pre-commit hook needs Node 22.13 or later as the system Node', () => {
  const text = flat(read('README.md'));
  const start = text.indexOf('**Lint before every commit (pre-commit).**');
  assert.ok(start !== -1);
  const paragraph = text.slice(start, text.indexOf('## ', start));
  assert.match(paragraph, /Node 22\.13 or later/u);
  assert.match(paragraph, /`language_version`/u);
});

test('README: a live run is made by an agent outside the engine, not by an adapter it does not have', () => {
  const text = flat(read('README.md'));
  assert.doesNotMatch(text, /adds an adapter of their own/u);
  assert.match(text, /a live run is made by an agent outside the engine/u);
  assert.match(text, /`agsc mcp`/u);
});

test('the issue form asks for the five parts of a rule proposal, the PR template for the sign-off', () => {
  // CONTRIBUTING.md "Proposing a change to the standard" lists five numbered parts.
  const parts = section(read('CONTRIBUTING.md'), 'Proposing a change to the standard')
    .split('\n').filter((l) => /^[1-5]\. /u.test(l));
  assert.equal(parts.length, 5);
  const form = YAML.parse(read('.github/ISSUE_TEMPLATE/rule-change.yml'));
  assert.equal(typeof form.name, 'string');
  assert.equal(typeof form.description, 'string');
  const fields = form.body.filter((b) => b.type !== 'markdown');
  assert.equal(fields.length, 5, 'one field for each part');
  for (const field of fields) {
    assert.ok(['input', 'textarea'].includes(field.type), field.id);
    assert.equal(field.validations && field.validations.required, true, `${field.id} is required`);
  }
  const config = YAML.parse(read('.github/ISSUE_TEMPLATE/config.yml'));
  assert.ok(config.contact_links.some((l) => /\/security\/advisories\/new$/u.test(l.url)),
    'the security route is private vulnerability reporting');
  const pr = flat(read('.github/pull_request_template.md'));
  assert.match(pr, /Signed-off-by: /u);
  assert.match(pr, /\(CA-v1\)/u);
  assert.match(pr, /outside contribution/u);
});
