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
    // for the owner and a check over the workflow file, neither of which runs.
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

  it('the checklist names every gate and leaves every git command to the owner', () => {
    const lines = release.checklist('1.0.0');
    const text = lines.join('\n');
    for (const needle of ['npm ci', 'npm test', 'npm audit', 'tools/count-artifacts',
      'tools/validate-*', 'tests/arch', 'npm pack --dry-run', 'git tag -s v1.0.0',
      'Wayback']) {
      assert.match(text, new RegExp(needle.replace(/[*]/gu, '\\*'), 'u'), needle);
    }
    assert.match(text, /^The owner runs these/u);
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
