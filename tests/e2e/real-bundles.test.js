'use strict';
// verifies AGSC-04-01, AGSC-04-02, AGSC-06-30, AGSC-09-02, AGSC-09-12
// END TO END, on the two real Bundles: a copy of the patterns node and a copy of
// the Bundle the main site's generator hands the engine. Each copy goes through
// the whole command line — lint, build (twice, byte for byte), verify,
// verify --ledger, ci, conform --level 2, every export form and adapter, skills,
// compose over a real selection — with every envelope and exit code checked, no
// draft reaching any published file, and the shipped checkers run on the output.
//
// An OPTIONAL lane, like the accessibility lane: the Bundles live in sibling
// repositories, so it runs only when AGSC_E2E=1 (paths from AGSC_E2E_PATTERNS
// and AGSC_E2E_SITE, defaulting to ../AgenticSystemCore-Patterns and
// ../AgenticSystemCore.com/dist/engine-bundle) and says why when it is skipped.
// Deterministic: fixed build instant and git dates, no network, scratch copies.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const AGSC = path.join(ROOT, 'bin', 'agsc.js');
const ENABLED = process.env.AGSC_E2E === '1';
const BUNDLES = [
  ['patterns node', process.env.AGSC_E2E_PATTERNS || path.join(ROOT, '..', 'AgenticSystemCore-Patterns')],
  ['main site Bundle', process.env.AGSC_E2E_SITE || path.join(ROOT, '..', 'AgenticSystemCore.com', 'dist', 'engine-bundle')],
];
const EXPORTS = [['--markdown'], ['--okf'], ['--jsonld'], ['--jsonl'], ['--steer'],
  ['--to', 'board', '--format', 'agsc-board'], ['--to', 'cogx'], ['--to', 'gabbe'], ['--to', 'llm-context'], ['--to', 'mermaid'], ['--to', 'skills']];
const COPIED = ['.git', '.well-known', 'agsc.config.json', 'content', 'LICENSE', 'LICENSE-CONTENT', 'NOTICE',
  'PRIVACY.md', 'DISCLAIMER.md', 'README.md', 'publish-set.json'];

function reason(dir) {
  if (!ENABLED) return 'the real-Bundle lane runs only with AGSC_E2E=1';
  if (!fs.existsSync(path.join(dir, 'agsc.config.json'))) return `no Bundle at ${dir}`;
  return null;
}

function files(dir) {
  const out = new Map();
  const walk = (rel) => {
    for (const name of fs.readdirSync(path.join(dir, rel)).sort()) {
      const next = rel === '' ? name : `${rel}/${name}`;
      if (fs.statSync(path.join(dir, next)).isDirectory()) walk(next);
      else out.set(next, fs.readFileSync(path.join(dir, next)));
    }
  };
  walk('');
  return out;
}

for (const [name, source] of BUNDLES) {
  const skip = reason(source);
  test(`the ${name} goes through the whole command line`, { skip: skip || false }, () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-e2e-'));
    try {
      fs.writeFileSync(path.join(home, '.gitconfig-empty'), '');
      const dir = path.join(home, 'bundle');
      fs.mkdirSync(dir);
      for (const entry of COPIED) {
        if (fs.existsSync(path.join(source, entry))) fs.cpSync(path.join(source, entry), path.join(dir, entry), { recursive: true });
      }
      const env = {
        GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_AUTHOR_EMAIL: 'operator@example.org', GIT_AUTHOR_NAME: 'Operator',
        GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_EMAIL: 'operator@example.org', GIT_COMMITTER_NAME: 'Operator',
        GIT_CONFIG_GLOBAL: path.join(home, '.gitconfig-empty'), GIT_CONFIG_NOSYSTEM: '1', HOME: home, NO_COLOR: '1',
        PATH: process.env.PATH, SOURCE_DATE_EPOCH: '1767225600',
        ...(process.env.SYSTEMROOT ? { SYSTEMROOT: process.env.SYSTEMROOT } : {}),
      };
      const run = (cmd, argv) => spawnSync(cmd, argv, { cwd: dir, encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024 });
      if (!fs.existsSync(path.join(dir, '.git'))) {
        // A Bundle handed over without history gets one commit, so the ledger derives.
        for (const argv of [['init', '-q', '-b', 'main'], ['add', '-A'], ['commit', '-q', '-m', 'Bundle']]) {
          assert.strictEqual(run('git', argv).status, 0);
        }
      }
      const agsc = (...argv) => {
        const r = run(process.execPath, [AGSC, ...argv, '--json']);
        let envelope;
        try { envelope = JSON.parse(r.stdout); } catch (e) { assert.fail(`agsc ${argv.join(' ')}: not an envelope: ${r.stdout}${r.stderr}`); }
        assert.strictEqual(envelope.schema, 'agsc.diagnostics.v1');
        assert.strictEqual(envelope.verb, argv[0]);
        assert.strictEqual(r.status, 0, `agsc ${argv.join(' ')} exit ${r.status}: ${JSON.stringify(envelope.findings.filter((f) => f.severity === 'error'))}`);
        assert.strictEqual(envelope.status, 'pass');
        return envelope;
      };
      const config = JSON.parse(fs.readFileSync(path.join(dir, 'agsc.config.json'), 'utf8'));
      const out = path.join(dir, (config.build && config.build.out) || 'www');

      agsc('lint');
      agsc('build');
      const first = files(out);
      agsc('build');
      const second = files(out);
      assert.deepStrictEqual([...second.keys()], [...first.keys()], 'the two builds emit different file sets');
      for (const [file, bytes] of first) assert.ok(bytes.equals(second.get(file)), `${file} differs between two builds`);
      agsc('verify');
      agsc('verify', '--ledger');
      agsc('ci');
      agsc('conform', '--level', '2');
      for (const form of EXPORTS) agsc('export', ...form);
      agsc('skills');

      // No draft reaches a published file (AGSC-06-30).
      const drafts = [];
      for (const folder of fs.readdirSync(path.join(dir, 'content'))) {
        const at = path.join(dir, 'content', folder);
        if (!fs.statSync(at).isDirectory()) continue;
        for (const f of fs.readdirSync(at)) {
          if (/^status: draft$/mu.test(fs.readFileSync(path.join(at, f), 'utf8'))) drafts.push(`/${folder}/${f.replace(/\.md$/u, '')}/`);
        }
      }
      for (const [file, bytes] of first) {
        const text = bytes.toString('utf8');
        for (const route of drafts) assert.ok(!text.includes(route), `${file} names the draft ${route}`);
      }

      // compose over a real selection: the first two published concepts.
      const slugs = [...first.keys()].map((f) => /^concepts\/([^/]+)\/index\.html$/u.exec(f))
        .filter(Boolean).map((m) => m[1]).slice(0, 2);
      assert.ok(slugs.length >= 1, 'no published concept to compose');
      agsc('compose', ...slugs, '--out', path.join('dist', 'harness-e2e'));

      // The shipped checkers on the output and on the distribution.
      const wellknown = run(process.execPath, [path.join(ROOT, 'tools', 'validate-wellknown'),
        path.join(out, '.well-known', 'knowledge-linkset'), '--level', '2', '--json']);
      assert.strictEqual(wellknown.status, 0, wellknown.stdout);
      for (const tool of ['validate-spec', 'validate-schemas', 'validate-ontology', 'validate-vectors', 'validate-features', 'validate-diagrams']) {
        const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', tool), '--json'], { cwd: ROOT, encoding: 'utf8', env });
        assert.strictEqual(r.status, 0, `${tool}: ${r.stdout}`);
      }
    } finally {
      fs.rmSync(home, { force: true, recursive: true });
    }
  });
}
