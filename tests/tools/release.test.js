'use strict';
// tests/tools/release.test.js — `tools/release`, the release lane of docs/PLAN.md §7.
//
// The one thing this suite guards above every other: the script must never be able
// to publish. That is asserted over its own source text, not only over its
// behaviour, because a behaviour test cannot prove the absence of a code path.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const { capture, envelope, tool, tmpdir, writeTree } = require('./helpers');

const release = tool('release');
const REPO = path.resolve(__dirname, '..', '..');

/** A throw-away distribution with everything the tool looks at. */
function distribution(overrides = {}) {
  const dir = tmpdir();
  writeTree(dir, {
    'CHANGELOG.md': '# Changelog\n\n## [Unreleased]\n\n### Added\n\n- something\n',
    'LICENSE': 'Apache-2.0\n',
    'README.md': '# A distribution\n',
    'package.json': `${JSON.stringify({
      dependencies: {}, files: ['src/', 'spec/', 'tests/vectors/'], name: 'agentic-system-core',
      version: '0.0.2',
    }, null, 4)}\n`,
    'packages/agsc-cli/package.json': `${JSON.stringify({
      dependencies: { 'agentic-system-core': '0.0.2' }, name: 'agsc-cli', version: '0.0.2',
    }, null, 4)}\n`,
    'spec/00-overview.md': 'spec_version 1.0.0-rc.5\n',
    'src/index.js': 'module.exports = {};\n',
    'tests/vectors/a/a.json': '{}\n',
    '.github/workflows/release.yml': [
      'permissions:', '  id-token: write', '  attestations: write',
      'steps:', '  - uses: actions/attest-build-provenance@abc',
      '  - run: npm publish --provenance',
    ].join('\n'),
    ...overrides,
  });
  return dir;
}

describe('tools/release never publishes (docs/PLAN.md §7)', () => {
  const source = fs.readFileSync(path.join(REPO, 'tools', 'release'), 'utf8');
  const body = source.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/u.test(l)).join('\n');

  it('the source has no way to run a process or reach the network', () => {
    // It cannot publish because it cannot EXECUTE anything and cannot open a
    // socket: the two strings `npm publish` it does carry are printed instructions
    // for the maintainer and a check over the workflow file, neither of which runs.
    assert.ok(!/child_process|execSync|execFile|spawn/u.test(body), 'the script can run a process');
    assert.ok(!/require\(\s*['"](node:)?(https?|dns|net)['"]/u.test(body), 'the script can reach the network');
    assert.ok(!/publishConfig|registry\.npmjs/u.test(body), 'the script configures a registry');
  });

  it('the default mode is a dry run and writes nothing', () => {
    const dir = distribution();
    const before = fs.readFileSync(path.join(dir, 'package.json'), 'utf8');
    const result = capture('release', ['--version', '1.0.0', dir]);
    assert.equal(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'), before);
    assert.match(result.out, /mode: dry run/u);
    assert.match(result.out, /nothing was published, and this script never publishes/u);
  });
});

describe('1. one version, in one place', () => {
  it('the alias must carry the engine version and pin it exactly', () => {
    const drifted = distribution({
      'packages/agsc-cli/package.json': `${JSON.stringify({
        dependencies: { 'agentic-system-core': '^0.0.2' }, name: 'agsc-cli', version: '0.0.1',
      }, null, 4)}\n`,
    });
    const { json } = envelope('release', [drifted]);
    const messages = json.findings.map((f) => f.message).join('\n');
    assert.match(messages, /one version, in one place/u);
    assert.match(messages, /never a range/u);
    assert.equal(json.status, 'fail');
  });

  it('an absent alias package is reported', () => {
    const dir = distribution();
    fs.rmSync(path.join(dir, 'packages'), { force: true, recursive: true });
    const { json } = envelope('release', [dir]);
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E901' && /alias/u.test(f.message)));
  });

  it('the proposed version must be strictly greater', () => {
    assert.equal(release.isGreater('1.0.0', '0.0.2'), true);
    assert.equal(release.isGreater('0.1.0', '0.0.9'), true);
    assert.equal(release.isGreater('0.0.3', '0.0.2'), true);
    assert.equal(release.isGreater('0.0.2', '0.0.2'), false);
    assert.equal(release.isGreater('0.0.1', '0.0.2'), false);
    // A release is greater than its own pre-release, and nothing else is.
    assert.equal(release.isGreater('1.0.0', '1.0.0-rc.5'), true);
    assert.equal(release.isGreater('1.0.0-rc.6', '1.0.0-rc.5'), false);
    const { json } = envelope('release', ['--version', '0.0.1', distribution()]);
    assert.ok(json.findings.some((f) => /is not greater than/u.test(f.message)));
  });

  it('a version that is not semver is a usage error, exit 2', () => {
    assert.equal(capture('release', ['--version', 'one']).code, 2);
    assert.equal(capture('release', ['--version=1.2']).code, 2);
    assert.equal(capture('release', ['a', 'b']).code, 2);
    assert.equal(capture('release', [path.join(tmpdir(), 'nowhere')]).code, 2);
  });
});

describe('2. the changelog section', () => {
  it('needs an [Unreleased] heading with content under it', () => {
    assert.ok(release.changelogFindings('# Changelog\n', null)
      .some((f) => /no "## \[Unreleased\]" heading/u.test(f.message)));
    assert.ok(release.changelogFindings('## [Unreleased]\n\n## [0.0.1] - 2026-01-01\n', null)
      .some((f) => /section is empty/u.test(f.message)));
    assert.deepEqual(release.changelogFindings('## [Unreleased]\n\n- a\n', null), []);
  });

  it('warns when the release heading is missing and adds it under --apply', () => {
    const warn = release.changelogFindings('## [Unreleased]\n\n- a\n', '1.0.0');
    assert.equal(warn[0].severity, 'warn');
    const applied = release.applyChangelog('# C\n\n## [Unreleased]\n\n- a\n', '1.0.0', '2026-01-01');
    assert.match(applied, /## \[Unreleased\]\n\n## \[1\.0\.0\] - 2026-01-01\n/u);
    // Idempotent: a second application changes nothing.
    assert.equal(release.applyChangelog(applied, '1.0.0', '2026-01-01'), applied);
  });

  it('the date is SOURCE_DATE_EPOCH and never a wall clock (AGSC-04-09)', () => {
    assert.equal(release.releaseDate({ SOURCE_DATE_EPOCH: '1767225600' }), '2026-01-01');
    assert.equal(release.releaseDate({ SOURCE_DATE_EPOCH: '0' }), '1970-01-01');
    assert.equal(release.releaseDate({ SOURCE_DATE_EPOCH: '951782400' }), '2000-02-29');
    assert.equal(release.releaseDate({}), null);
    assert.equal(release.releaseDate({ SOURCE_DATE_EPOCH: 'x' }), null);
  });
});

describe('3. the npm pack contents', () => {
  it('reads the excluded directories from the repository own .gitignore', () => {
    const dir = distribution({ '.gitignore': 'node_modules/\n# a comment\n!keep/\nplans/\n*.tmp/\nfile\n' });
    assert.deepEqual(release.neverShipped(dir), ['node_modules/', 'plans/']);
    // No .gitignore at all still excludes the one directory npm never ships.
    assert.deepEqual(release.neverShipped(tmpdir()), ['node_modules/']);
  });

  it('refuses a path under an excluded directory, and test-fixture bloat', () => {
    const dir = distribution({
      '.gitignore': 'node_modules/\nplans/\n',
      'package.json': `${JSON.stringify({
        dependencies: {},
        files: ['src/', 'tests/', 'plans/'],
        name: 'agentic-system-core',
        version: '0.0.2',
      }, null, 4)}\n`,
      'plans/kit.md': '# kit\n',
      'tests/fixtures/minimal/big.md': 'x'.repeat(100),
      'tests/vectors/a/a.json': '{}\n',
    });
    const { json } = envelope('release', [dir]);
    const messages = json.findings.map((f) => f.message).join('\n');
    assert.match(messages, /\.gitignore excludes plans\/ from this repository/u);
    assert.match(messages, /the only test path a distribution ships is tests\/vectors\//u);
    assert.equal(json.status, 'fail');
  });

  it('warns when a SHIPPED file names an excluded directory the spec does not', () => {
    const dir = distribution({
      '.gitignore': 'node_modules/\nplans/\n',
      'src/index.js': '// see plans/PLAN.md\n',
    });
    const { json } = envelope('release', [dir]);
    const one = json.findings.find((f) => /excludes from itself/u.test(f.message));
    assert.equal(one.severity, 'warn');
  });

  it('a directory the SPECIFICATION names is a legitimate mention', () => {
    // AGSC-01-28 writes `GABBE/agents/AGENTS.md` as a steer target, so the shipped
    // registry that implements it has to write it too. The normative text is the
    // authority on which paths are legitimate, so the tool reads spec/.
    const dir = distribution({
      '.gitignore': 'node_modules/\nplans/\n',
      'spec/01-bundle.md': 'the target writes `plans/agsc.md` and nothing else\n',
      'src/index.js': "module.exports = { target: 'plans/agsc.md' };\n",
    });
    assert.ok(release.specMentions(dir).has('plans/'));
    const { json } = envelope('release', [dir]);
    assert.deepEqual(json.findings.filter((f) => /excludes from itself/u.test(f.message)), []);
    // A distribution with no spec/ at all simply has no exemptions.
    const bare = tmpdir();
    assert.deepEqual([...release.specMentions(bare)], []);
  });

  it('the pack list is the manifest\'s files plus the three npm always ships', () => {
    const dir = distribution();
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    const files = release.packList(dir, manifest);
    assert.ok(files.includes('package.json') && files.includes('README.md') && files.includes('LICENSE'));
    assert.ok(files.includes('src/index.js'));
    assert.ok(!files.includes('packages/agsc-cli/package.json'), 'the alias is a separate package');
    // A manifest with no `files` still ships the three.
    assert.deepEqual(release.packList(dir, {}).sort(), ['LICENSE', 'README.md', 'package.json']);
    assert.deepEqual(release.walk(dir, 'nothing-here'), []);
  });
});

describe('4. the provenance step', () => {
  it('needs the two permissions, the attestation and no token', () => {
    assert.deepEqual(release.workflowFindings(distribution()), []);
    const noWorkflow = distribution();
    fs.rmSync(path.join(noWorkflow, '.github'), { force: true, recursive: true });
    assert.equal(release.workflowFindings(noWorkflow)[0].code, 'AGSC-E901');

    const bad = distribution({
      '.github/workflows/release.yml': [
        'permissions:', '  contents: read',
        'steps:', '  - run: npm publish', `  - env: \${{ secrets.NPM_TOKEN }}`,
      ].join('\n'),
    });
    const codes = release.workflowFindings(bad).map((f) => f.code).sort();
    assert.deepEqual([...new Set(codes)], ['AGSC-E202', 'AGSC-E403']);
    const messages = release.workflowFindings(bad).map((f) => f.message).join('\n');
    assert.match(messages, /id-token: write/u);
    assert.match(messages, /attest-build-provenance/u);
    assert.match(messages, /holds no secret/u);
    assert.match(messages, /publishes without --provenance/u);
  });

  it('a COMMENT naming NPM_TOKEN is not a workflow that reads one', () => {
    const commented = distribution({
      '.github/workflows/release.yml': [
        '# no NPM_TOKEN exists in this repository',
        'permissions:', '  id-token: write', '  attestations: write',
        'steps:', '  - uses: actions/attest-build-provenance@abc',
        '  - run: npm publish --provenance',
      ].join('\n'),
    });
    assert.deepEqual(release.workflowFindings(commented), []);
  });
});

describe('5. --apply, and the checklist', () => {
  it('writes the two versions and the changelog heading, and nothing else', () => {
    const dir = distribution();
    const result = capture('release', ['--version', '1.0.0', '--apply', dir]);
    // `--apply` reads the process environment for SOURCE_DATE_EPOCH; without one it
    // refuses rather than dating the release from a wall clock.
    if (process.env.SOURCE_DATE_EPOCH === undefined) {
      assert.match(result.err, /SOURCE_DATE_EPOCH is unset or malformed/u);
      assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version, '0.0.2');
      return;
    }
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version, '1.0.0');
  });

  it('--apply without --version is AGSC-E003', () => {
    const { json } = envelope('release', ['--apply', distribution()]);
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E003'));
  });

  it('the checklist names every gate and leaves every git command to the maintainer', () => {
    const lines = release.checklist('1.0.0');
    const text = lines.join('\n');
    for (const needle of ['npm ci', 'npm test', 'npm audit', 'tools/count-artifacts',
      'tools/validate-*', 'tests/arch', 'npm pack --dry-run', 'git tag -s v1.0.0',
      'Wayback']) {
      assert.match(text, new RegExp(needle.replace(/[*]/gu, '\\*'), 'u'), needle);
    }
    assert.match(text, /^The maintainer runs these/u);
    const placeholder = release.checklist(null).join('\n');
    assert.match(placeholder, /<x\.y\.z>/u);
  });

  it('--help exits 0 and --quiet prints nothing', () => {
    const help = capture('release', ['--help']);
    assert.equal(help.code, 0);
    assert.match(help.out, /^tools\/release /u);
    const quiet = capture('release', ['--quiet', distribution()]);
    assert.equal(quiet.out, '');
    assert.equal(quiet.err, '');
  });
});

describe('the real distribution passes its own release lane', () => {
  it('exits 0 with no finding', () => {
    const { code, json } = envelope('release', []);
    assert.deepEqual(json.findings, [], JSON.stringify(json.findings, null, 1));
    assert.equal(json.verb, 'release');
    assert.equal(json.schema, 'agsc.diagnostics.v1');
    assert.equal(code, 0);
  });
});

// -------------------------------------------------: the PyPI half (rc.6)

describe('tools/release — the PyPI sibling', () => {
  it('maps a SemVer version onto the PEP 440 spelling, and says when it cannot', () => {
    // The two grammars differ and both packages are published at one version, so
    // the mapping is stated once, in the tool.
    assert.equal(release.pep440('1.0.0-rc.6'), '1.0.0rc6');
    assert.equal(release.pep440('1.0.0'), '1.0.0');
    assert.equal(release.pep440('2.3.4-alpha.1'), '2.3.4a1');
    assert.equal(release.pep440('2.3.4-beta.12'), '2.3.4b12');
    assert.equal(release.pep440('1.0.0-nightly.1'), null);
    assert.equal(release.pep440('not a version'), null);
  });

  it('the sibling must state that spelling, and a mismatch is AGSC-E202', () => {
    const parent = tmpdir();
    const root = path.join(parent, 'engine');
    fs.mkdirSync(path.join(parent, release.PYTHON_DIR), { recursive: true });
    fs.mkdirSync(root, { recursive: true });
    const write = (version) => fs.writeFileSync(
      path.join(parent, release.PYTHON_DIR, 'pyproject.toml'),
      `[project]\nname = "agentic-system-core"\nversion = "${version}"\n`,
    );

    write('1.0.0rc6');
    assert.deepEqual(release.pypiFindings(root, '1.0.0-rc.6'), []);

    write('0.0.2');
    const drifted = release.pypiFindings(root, '1.0.0-rc.6');
    assert.equal(drifted.length, 1);
    assert.equal(drifted[0].code, 'AGSC-E202');
    assert.match(drifted[0].message, /states version "0\.0\.2" and the engine is 1\.0\.0-rc\.6/u);
  });

  it('a sibling that is not checked out WARNS, and blocks nothing', () => {
    // It is another repository. Its absence says what was not checked; it is not a
    // fault of this one, and it must not stop this one's release.
    const found = release.pypiFindings(path.join(tmpdir(), 'engine'), '1.0.0-rc.6');
    assert.equal(found.length, 1);
    assert.equal(found[0].code, 'AGSC-E901');
    assert.equal(found[0].severity, 'warn');
    assert.match(found[0].message, /1\.0\.0rc6/u, 'the warning must say what the version has to be');
  });

  it('it reads nothing but that one file, and never the network', () => {
    const source = fs.readFileSync(path.join(REPO, 'tools', 'release'), 'utf8');
    for (const forbidden of ['child_process', 'node:child_process', 'fetch(', 'https.request', 'npm publish ']) {
      assert.ok(!source.includes(forbidden), `tools/release must not carry ${forbidden}`);
    }
  });
});

// --------------------------------------------- the release lane, as it now stands

describe('the release workflow', () => {
  const workflow = () => fs.readFileSync(path.join(REPO, '.github', 'workflows', 'release.yml'), 'utf8');
  /** The workflow without its comments: what RUNS, not what it explains. */
  const steps = () => workflow().split('\n').filter((l) => !/^\s*#/u.test(l)).join('\n');

  it('sets the dist-tag explicitly on both publishes', () => {
    // npm's docs (docs.npmjs.com/cli/v11/commands/npm-dist-tag, read 2026-09-22):
    // "Publishing a package sets the `latest` tag to the published version unless
    // the `--tag` option is used" — and the convention is that a pre-release does
    // NOT take `latest`. decides otherwise for this release, so the flag is
    // written out rather than left to a default nobody chose.
    const publishes = steps().split('\n').filter((l) => l.includes('npm publish'));
    assert.equal(publishes.length, 2, 'the engine and the alias, and nothing else');
    for (const line of publishes) {
      assert.match(line, /--provenance/u, line);
      assert.match(line, /--access public/u, line);
      assert.match(line, /--tag latest/u, line);
    }
  });

  it('every validator blocks the release: none of the nine only reports', () => {
    // `validate-spec` was a reporting step while the specification items it found
    // were open (…05). They were applied at rc.6 and it exits 0, so the
    // carve-out is gone: a gate that reports and does not block protects nothing.
    const text = workflow();
    assert.ok(!/REPORT: /u.test(text), 'a validator is still allowed to fail without blocking');
    assert.match(text, /for t in tools\/validate-\*; do node "\$t" --json; done/u);
  });

  it('holds no npm token and runs on a tag alone', () => {
    // Over the STEPS, not the comments: a workflow that explains why it never uses
    // `pull_request_target` is not a workflow that uses it.
    const text = steps();
    assert.ok(!/NPM_TOKEN|NODE_AUTH_TOKEN/u.test(text));
    assert.ok(!text.includes('pull_request_target'));
    assert.match(text, /on:\n  push:\n    tags:\n      - 'v\*'/u);
  });

  it('the tool PRINTS the whole procedure; no repository file holds it', () => {
    // A procedure written for the maintainer is not a
    // file of a public repository. So the release procedure is printed by the tool
    // that checks the release, where whoever runs it will actually read it, and the
    // long-form runbook is kept outside the repository. Nothing here may point at a
    // repository file that a reader would then not find.
    const printed = release.checklist('1.2.3').join('\n');
    assert.match(printed, /git tag -s v1\.2\.3/u, 'the tag command');
    assert.match(printed, /npm view agentic-system-core version/u, 'the live check');
    assert.match(printed, /npm install agentic-system-core@1\.2\.3/u, 'the fresh-install smoke test');
    assert.match(printed, /npm deprecate/u, 'the rollback');
    assert.match(printed.replace(/\s+/gu, ' '), /within the first 72 hours after publishing/u,
      'the unpublish policy, quoted rather than paraphrased');
    assert.match(printed, /trusted publish/iu, 'how it publishes');
    assert.ok(!fs.existsSync(path.join(REPO, 'RELEASE.md')),
      'a release runbook must not live in the public repository');
  });
});

describe('the changelog gate, as amended at rc.6', () => {
  it('an empty [Unreleased] is a fault only while the version has no section', () => {
    const text = (unreleased, extra = '') => `# Changelog\n\n## [Unreleased]\n${unreleased}\n${extra}`;
    // Nothing anywhere: a release with no entry is not a release.
    assert.deepEqual(release.changelogFindings(text(''), null, '1.0.0-rc.6')
      .map((f) => f.code), ['AGSC-E202']);
    // Something under [Unreleased]: the state before `--apply`.
    assert.deepEqual(release.changelogFindings(text('\n- a change\n'), null, '1.0.0-rc.6'), []);
    // Nothing under [Unreleased], but the released version has its own section:
    // the correct state of a just-released tree.
    assert.deepEqual(
      release.changelogFindings(text('', '## [1.0.0-rc.6] - 2026-09-22\n\n- shipped\n'), null, '1.0.0-rc.6'),
      [],
    );
  });

  it('the shipped CHANGELOG names the version in package.json', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
    const changelog = fs.readFileSync(path.join(REPO, 'CHANGELOG.md'), 'utf8');
    assert.ok(changelog.includes(`## [${manifest.version}]`),
      `CHANGELOG.md carries no section for ${manifest.version}`);
  });
});

// ------------------------------------------------ 4c: public means clean

describe('tools/release — the public-hygiene step', () => {
  const release = require('../../tools/release');

  it('a private e-mail address in a file that would ship stops the release lane', () => {
    const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'agsc-release-hyg-'));
    // The address is assembled at run time so this file never carries one.
    fs.writeFileSync(path.join(dir, 'README.md'), `# Package\n\nWrite to ${['real.person', 'gmail.com'].join('@')}.\n`);
    const found = release.hygieneFindings(dir, ['README.md']);
    assert.deepEqual(found.map((f) => [f.code, f.file, f.line]), [['AGSC-E404', 'README.md', 3]]);
    assert.match(found[0].message, /^public hygiene: email/u);
    fs.writeFileSync(path.join(dir, 'README.md'), '# Package\n\nNothing private.\n');
    assert.deepEqual(release.hygieneFindings(dir, ['README.md']), []);
  });

  it('a sweep that cannot run is a failure, never a silent pass', () => {
    const found = release.hygieneFindings('/nowhere', [], { sweep: () => { throw new Error('boom'); } });
    assert.deepEqual(found.map((f) => f.code), ['AGSC-E901']);
    assert.match(found[0].message, /boom/u);
    const odd = release.hygieneFindings('/nowhere', [], { sweep: () => { throw null; } }); // eslint-disable-line no-throw-literal
    assert.match(odd[0].message, /unknown error/u);
  });
});
