'use strict';
// verifies AGSC-04-02, AGSC-06-11, AGSC-08-10, AGSC-08-20, AGSC-08-22, AGSC-08-23, AGSC-08-24, AGSC-09-08
// Steps of features/persona-i-maintainer.feature that run offline: the derived,
// verifiable ledger over a scratch git history with fixed dates.

const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { canonicalize } = require('json-canonicalize');

const { ROOT, linkset } = require('./_world.js');

const LEDGER_REL = 'https://w3id.org/agentic-system-core/rel#ledger';
const GENESIS = '0'.repeat(64);

function lines(text) {
  return text.split('\n').filter((l) => l !== '');
}

/** Two commits of the fixture on `main`, built once by `build` and once by `ci`. */
function history(world) {
  world.bundle();
  world.commitAll('Add the acceptance Bundle');
  world.write('content/concepts/mcp.md', world.read('content/concepts/mcp.md')
    .replace('Reach tools and data through one protocol.', 'Reach tools and data through one open protocol.'));
  world.commitAll('Sharpen the intent of mcp', { GIT_AUTHOR_DATE: '2026-01-02T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-02T00:00:00Z' });
}

module.exports = [
  {
    pattern: '"agsc build" or "agsc ci" completes successfully',
    run(world) {
      history(world);
      // The build instant comes from the history, not from the environment.
      const build = world.agsc(['build'], { unset: ['SOURCE_DATE_EPOCH'] });
      assert.strictEqual(build.exit, 0, build.stderr);
      world.state.ledger = world.read('www/ledger.jsonl');
      const ci = world.agsc(['ci'], { unset: ['SOURCE_DATE_EPOCH'] });
      assert.strictEqual(ci.exit, 0, ci.stderr);
    },
  },
  {
    pattern: '"ledger.jsonl" is recomputed from git history into the build output as lines "{ts, kind, ref, actor, prev, hash}"',
    run(world) {
      const entries = lines(world.state.ledger).map((l) => JSON.parse(l));
      const commits = world.git(['rev-list', '--reverse', 'HEAD']).trim().split('\n');
      // One line per commit of the content branch, then the build (AGSC-08-20a).
      assert.deepStrictEqual(entries.filter((e) => e.kind === 'commit').map((e) => e.ref), commits);
      for (const e of entries) {
        for (const key of ['ts', 'kind', 'ref', 'actor', 'prev', 'hash']) assert.ok(key in e, `a ledger line lacks ${key}`);
      }
      // Recomputed, never stored: a second build of the same history gives the same bytes.
      const again = world.agsc(['build'], { unset: ['SOURCE_DATE_EPOCH'] });
      assert.strictEqual(again.exit, 0, again.stderr);
      assert.strictEqual(world.read('www/ledger.jsonl'), world.state.ledger);
    },
  },
  {
    pattern: '"hash" equals "sha256(prev + canonical(entry))"',
    run(world) {
      // AGSC-08-22, recomputed here independently of the engine.
      let prev = GENESIS;
      for (const line of lines(world.state.ledger)) {
        const entry = JSON.parse(line);
        assert.strictEqual(entry.prev, prev);
        const { hash, ...rest } = entry;
        const expected = crypto.createHash('sha256').update(Buffer.concat([
          Buffer.from(prev, 'ascii'), Buffer.from(canonicalize(rest), 'utf8')])).digest('hex');
        assert.strictEqual(hash, expected);
        assert.strictEqual(line, canonicalize(entry), 'every line is JCS-canonical');
        prev = hash;
      }
    },
  },
  {
    pattern: 'no ledger line is ever committed to the content branch',
    run(world) {
      const tracked = world.git(['ls-files']).split('\n');
      assert.ok(!tracked.some((f) => f.endsWith('ledger.jsonl')), 'a ledger file is tracked');
      assert.ok(!fs.existsSync(path.join(world.dir, 'content', 'ledger.jsonl')));
      assert.strictEqual(world.git(['status', '--porcelain', '--', 'content']), '', 'the build changed content/');
    },
  },
  {
    pattern: 'the maintainer runs "npx agentic-system-core verify --ledger"',
    run(world) {
      world.state.verify = world.agsc(['verify', '--ledger', '--json'], { unset: ['SOURCE_DATE_EPOCH'] });
    },
  },
  {
    pattern: 'the full chain re-verifies offline',
    run(world) {
      const { exit, stdout, stderr } = world.state.verify;
      assert.strictEqual(exit, 0, stdout + stderr);
      assert.strictEqual(JSON.parse(stdout).status, 'pass');
    },
  },
  {
    pattern: 'the recomputed head equals the "agsc-ledger-head" attribute of the "…rel#ledger" link in the well-known file',
    run(world) {
      const link = linkset(world).linkset[0][LEDGER_REL];
      assert.strictEqual(link.length, 1);
      const head = JSON.parse(lines(world.state.ledger).pop()).hash;
      assert.deepStrictEqual(link[0]['agsc-ledger-head'], [head]);
    },
  },
  {
    pattern: 'tampering with any one line, or truncating the tail, makes "verify --ledger" fail',
    run(world) {
      const original = world.state.ledger;
      const all = lines(original);
      const verify = () => world.agsc(['verify', '--ledger', '--json'], { unset: ['SOURCE_DATE_EPOCH'] });
      const codes = (r) => JSON.parse(r.stdout).findings.map((f) => f.code);

      // In the clone: the published file differs from the recomputation (AGSC-E702).
      world.write('www/ledger.jsonl', `${[all[0].replace('"commit"', '"release"'), ...all.slice(1)].join('\n')}\n`);
      let r = verify();
      assert.strictEqual(r.exit, 1);
      assert.ok(codes(r).includes('AGSC-E702'), r.stdout);
      world.write('www/ledger.jsonl', `${all.slice(0, -1).join('\n')}\n`);
      r = verify();
      assert.strictEqual(r.exit, 1);
      assert.ok(codes(r).includes('AGSC-E702'), r.stdout);

      // A downloaded node has no history: the published file itself is re-verified,
      // and a truncated tail is caught by the head the well-known file publishes (AGSC-E701).
      fs.renameSync(path.join(world.dir, '.git'), path.join(world.dir, '.git-away'));
      try {
        world.write('www/ledger.jsonl', original);
        r = verify();
        assert.ok(!codes(r).includes('AGSC-E701') && !codes(r).includes('AGSC-E702'), r.stdout);
        world.write('www/ledger.jsonl', `${all.slice(0, -1).join('\n')}\n`);
        r = verify();
        assert.strictEqual(r.exit, 1);
        assert.ok(codes(r).includes('AGSC-E701'), r.stdout);
        world.write('www/ledger.jsonl', `${[all[0], all[1].replace('"commit"', '"release"'), ...all.slice(2)].join('\n')}\n`);
        r = verify();
        assert.strictEqual(r.exit, 1);
        assert.ok(codes(r).includes('AGSC-E701'), r.stdout);
      } finally {
        fs.renameSync(path.join(world.dir, '.git-away'), path.join(world.dir, '.git'));
        world.write('www/ledger.jsonl', original);
      }
    },
  },
  {
    pattern: 'the maintainer runs "npx agentic-system-core ci" locally',
    run(world) {
      history(world);
      world.state.local = world.agsc(['ci'], { offline: true });
      world.state.localGate = world.read('dist/gate.json');
    },
  },
  {
    pattern: 'the pipeline runs lint, then build twice with a byte comparison, then verify, and writes "dist/gate.json" (AGSC-04-02, AGSC-08-10)',
    run(world) {
      const { local } = world.state;
      assert.strictEqual(local.exit, 0, local.stdout + local.stderr);
      assert.match(local.stderr, /^lane: parse$/mu);
      assert.match(local.stdout + local.stderr, /^ci: pass \(0 error/mu);
      const gate = JSON.parse(world.state.localGate);
      assert.deepStrictEqual(gate.checks.map((c) => c.name), ['lint', 'build', 'verify', 'forge']);
      // A difference between the two builds would be AGSC-E602 in the build check.
      assert.ok(!gate.checks.some((c) => c.findings.some((f) => f.code === 'AGSC-E602')));
      assert.strictEqual(gate.status, 'pass');
    },
  },
  {
    pattern: 'the exit code is 0 on success, 1 on a failed gate, 2 on a usage error (AGSC-09-08)',
    run(world) {
      const rel = 'content/concepts/mcp.md';
      const original = world.read(rel);
      world.write(rel, original.replace('kind: pattern', 'requires:\n  - no-such-item\nkind: pattern'));
      const failed = world.agsc(['ci'], { offline: true });
      assert.strictEqual(failed.exit, 1, failed.stdout + failed.stderr);
      assert.strictEqual(JSON.parse(world.read('dist/gate.json')).status, 'fail');
      world.write(rel, original);
      const usage = world.agsc(['ci', '--no-such-flag'], { offline: true });
      assert.strictEqual(usage.exit, 2);
      assert.match(usage.stderr, /AGSC-E002/u);
      const again = world.agsc(['ci'], { offline: true });
      assert.strictEqual(again.exit, 0, again.stdout + again.stderr);
      assert.strictEqual(world.read('dist/gate.json'), world.state.localGate);
    },
  },
  {
    pattern: 'the same commit runs "ci" in a fresh clone, as the shipped GitHub Action does with "contents: read"',
    run(world) {
      const action = fs.readFileSync(path.join(ROOT, 'action.yml'), 'utf8');
      assert.match(action, /^#\s+contents: read\b/mu, 'the action no longer asks for contents: read only');
      assert.match(action, /node "\$GITHUB_ACTION_PATH\/bin\/agsc\.js" ci \$AGSC_ACTION_ARGS/u);
      const clone = path.join(world.temp('agsc-acc-clone-'), 'bundle');
      world.git(['clone', '-q', '--no-hardlinks', world.dir, clone]);
      world.state.remote = world.agsc(['ci'], { cwd: clone, offline: true });
      world.state.remoteGate = fs.readFileSync(path.join(clone, 'dist', 'gate.json'), 'utf8');
    },
  },
  {
    pattern: 'the exit code and "dist/gate.json" match the local run exactly',
    run(world) {
      assert.strictEqual(world.state.remote.exit, world.state.local.exit, world.state.remote.stderr);
      assert.strictEqual(world.state.remoteGate, world.state.localGate);
      assert.deepStrictEqual(world.networkAttempts(), []);
    },
  },
];
