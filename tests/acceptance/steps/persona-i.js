'use strict';
// verifies AGSC-01-12, AGSC-01-22, AGSC-01-23, AGSC-02-11, AGSC-04-02, AGSC-06-04, AGSC-06-11, AGSC-08-10, AGSC-08-20, AGSC-08-22, AGSC-08-23, AGSC-08-24, AGSC-09-08, AGSC-11-22
// Steps of features/persona-i-maintainer.feature that run offline: the derived,
// verifiable ledger over a scratch git history with fixed dates; the stale items
// the NOW page lists; the permissions and steps of the shipped release workflow,
// read from the file; the import of the old site; a retired item that keeps its
// slug and page while its successor takes the old address, and the refusal of a
// second item under the retired slug; and, where the real-Bundle lane
// is switched on, a restore from a bare clone of the patterns node. The steps of
// the scenario that waits on a gap (a channel whose publish choice is auto) are
// written here too.

const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { canonicalize } = require('json-canonicalize');
const YAML = require('yaml');

const { INSTANT, ROOT, linkset, splitItem } = require('./_world.js');
const { patternsNode } = require('./_real-bundles.js');

const LEDGER_REL = 'https://w3id.org/agentic-system-core/rel#ledger';
const GENESIS = '0'.repeat(64);
const OLD_SITE = path.join(ROOT, 'tests', 'fixtures', 'old-site-10');
const SELECTION = path.join(OLD_SITE, 'selection.tsv');
/** The rows of the selection that must not become items: deferred, excluded, unknown. */
const NOT_IMPORTED = Object.freeze(['excluded-one', 'ghost', 'not-chosen', 'unterminated']);

/** Every file of a directory, path -> bytes (base64), in code-point order. */
function tree(dir) {
  const out = new Map();
  const walk = (rel) => {
    for (const name of fs.readdirSync(path.join(dir, rel)).sort()) {
      const next = rel === '' ? name : `${rel}/${name}`;
      if (fs.statSync(path.join(dir, next)).isDirectory()) walk(next);
      else out.set(next, fs.readFileSync(path.join(dir, next)).toString('base64'));
    }
  };
  walk('');
  return out;
}

/** The job of release.yml that holds `id-token: write`, with its name. */
function publishingJobs(workflow) {
  return Object.entries(workflow.jobs).filter(([, job]) => job.permissions && job.permissions['id-token'] === 'write');
}

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
  {
    pattern: /^the item "(content\/[a-z-]+\/[a-z0-9-]+\.md)" went stale on "([0-9T:Z-]+)", before the build instant$/u,
    run(world, rel, instant) {
      assert.strictEqual(String(splitItem(world.read(rel)).frontmatter.stale_after), instant);
      assert.ok(instant < INSTANT, `${instant} is not before ${INSTANT}`);
      world.state.stale = path.basename(rel, '.md');
    },
  },
  {
    pattern: '"now.md" lists "tool-use-retries" as its one stale item, and the NOW page says so too (AGSC-02-11)',
    run(world) {
      const now = world.read('www/now.md');
      const section = /\n## Stale items\n\n((?:- [^\n]*\n)+)/u.exec(now);
      assert.ok(section, `now.md has no stale items:\n${now}`);
      assert.deepStrictEqual(section[1].trim().split('\n'), [`- ${world.state.stale}`]);
      const page = world.read('www/now/index.html');
      assert.match(page, /<h2 id="stale-items">Stale items<\/h2>\n<ul>\n<li>tool-use-retries<\/li>\n<\/ul>/u);
    },
  },
  {
    pattern: 'the build created no commit and changed nothing under "content/"',
    run(world) {
      assert.strictEqual(world.git(['rev-list', '--count', 'HEAD']).trim(), '1');
      assert.strictEqual(world.git(['status', '--porcelain', '--', 'content']), '');
    },
  },
  {
    pattern: 'the maintainer reads ".github/workflows/release.yml"',
    run(world) {
      world.state.release = YAML.parse(fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'release.yml'), 'utf8'));
    },
  },
  {
    pattern: 'it runs on a pushed "v*" tag or a manual run, and never on a pull request',
    run(world) {
      const on = world.state.release.on;
      assert.deepStrictEqual(Object.keys(on).sort(), ['push', 'workflow_dispatch']);
      assert.deepStrictEqual(on.push, { tags: ['v*'] });
    },
  },
  {
    pattern: 'the workflow reads with "contents: read", and only the publishing job, behind the "release" environment, adds "id-token: write" and "attestations: write"',
    run(world) {
      const workflow = world.state.release;
      assert.deepStrictEqual(workflow.permissions, { contents: 'read' });
      const publishing = publishingJobs(workflow);
      assert.strictEqual(publishing.length, 1, 'exactly one job may mint an identity token');
      const [, job] = publishing[0];
      assert.strictEqual(job.environment, 'release');
      assert.deepStrictEqual(job.permissions, { attestations: 'write', contents: 'read', 'id-token': 'write' });
      for (const [name, other] of Object.entries(workflow.jobs)) {
        if (other === job || !other.permissions) continue;
        for (const [scope, level] of Object.entries(other.permissions)) {
          assert.notStrictEqual(level, 'write', `job ${name} writes ${scope}`);
        }
      }
    },
  },
  {
    pattern: 'the publishing job runs on Node 24, attests the packed tarballs with "actions/attest-build-provenance" pinned to a commit, and publishes "agentic-system-core" and "agsc-cli" each with "--provenance"',
    run(world) {
      const [, job] = publishingJobs(world.state.release)[0];
      const node = job.steps.find((step) => /^actions\/setup-node@/u.test(step.uses || ''));
      assert.strictEqual(String(node.with['node-version']), '24');
      const attest = job.steps.find((step) => /^actions\/attest-build-provenance@/u.test(step.uses || ''));
      assert.ok(attest, 'no attest step');
      assert.match(attest.uses, /^actions\/attest-build-provenance@[0-9a-f]{40}$/u);
      assert.match(attest.with['subject-path'], /\.tgz/u);
      const scripts = job.steps.map((step) => step.run || '').join('\n');
      for (const name of ['agentic-system-core', 'agsc-cli']) {
        assert.match(scripts, new RegExp(`npm publish --provenance [^\\n]*"\\./${name}-\\$\\{VERSION\\}\\.tgz"`, 'u'));
      }
      // The attested tarballs are the published ones: packing happens before the attest step.
      const packed = job.steps.findIndex((step) => /npm pack/u.test(step.run || ''));
      assert.ok(packed >= 0 && packed < job.steps.indexOf(attest));
    },
  },
  {
    pattern: 'the patterns node of the real-Bundle lane, with its git history',
    run(world) {
      world.state.origin = patternsNode();
      assert.ok(fs.existsSync(path.join(world.state.origin, '.git')));
    },
  },
  {
    pattern: 'the maintainer clones it fresh into two folders and runs "npx agentic-system-core ci" in each',
    run(world) {
      world.state.clones = ['first', 'second'].map((name) => {
        const clone = path.join(world.temp(`agsc-acc-restore-${name}-`), 'node');
        world.git(['clone', '-q', '--no-hardlinks', world.state.origin, clone]);
        // A restore takes its build instant from the history, as a fresh checkout does.
        const ci = world.agsc(['ci'], { cwd: clone, offline: true, unset: ['SOURCE_DATE_EPOCH'] });
        return { ci, dir: clone };
      });
    },
  },
  {
    pattern: 'ci passes in both clones, offline',
    run(world) {
      for (const { ci } of world.state.clones) assert.strictEqual(ci.exit, 0, ci.stdout + ci.stderr);
      assert.deepStrictEqual(world.networkAttempts(), []);
    },
  },
  {
    pattern: '"agsc build" in the two clones gives byte-identical "www/" trees',
    run(world) {
      const outputs = world.state.clones.map(({ dir }) => {
        const build = world.agsc(['build'], { cwd: dir, offline: true, unset: ['SOURCE_DATE_EPOCH'] });
        assert.strictEqual(build.exit, 0, build.stdout + build.stderr);
        const out = JSON.parse(fs.readFileSync(path.join(dir, 'agsc.config.json'), 'utf8')).build.out || 'www';
        return tree(path.join(dir, out));
      });
      assert.ok(outputs[0].size > 0);
      assert.deepStrictEqual([...outputs[1].keys()], [...outputs[0].keys()]);
      for (const [rel, bytes] of outputs[0]) assert.strictEqual(outputs[1].get(rel), bytes, `${rel} differs`);
    },
  },
  {
    pattern: /^the Bundle registers a channel "([a-z0-9-]+)" whose publish choice is "(auto|hitl)"$/u,
    run(world, name, publish) {
      const config = JSON.parse(world.read('agsc.config.json'));
      config.channels = [{ adapter: 'github', author: 'channel-bot', name, owner: config.bundle.operator, publish }];
      world.write('agsc.config.json', `${JSON.stringify(config, null, 2)}\n`);
    },
  },
  {
    pattern: /^a commit "([^"]+)" with no trailer is made directly on the content branch$/u,
    run(world, subject) {
      world.state.root = world.git(['rev-list', '--max-parents=0', 'HEAD']).trim();
      world.write('content/concepts/mcp.md', world.read('content/concepts/mcp.md')
        .replace('Reach tools and data through one protocol.', 'Reach tools and data through one open protocol.'));
      world.commit(subject, [], { GIT_AUTHOR_DATE: '2026-01-02T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-02T00:00:00Z' });
      world.state.direct = world.git(['rev-parse', 'HEAD']).trim();
      assert.deepStrictEqual(world.trailers(), []);
      assert.strictEqual(world.git(['rev-list', '--parents', '-n', '1', 'HEAD']).trim().split(' ').length, 2, 'not a non-merge commit');
    },
  },
  {
    pattern: /^the "(AGSC-E\d{3})" finding names the sha of that commit, and not the root commit \(AGSC-08-26\)$/u,
    run(world, code) {
      const messages = world.json().findings.filter((f) => f.code === code).map((f) => JSON.stringify(f));
      assert.ok(messages.some((m) => m.includes(world.state.direct)), messages.join('\n'));
      assert.ok(!messages.some((m) => m.includes(world.state.root)), 'the root commit is exempt');
    },
  },
  {
    pattern: 'an empty Bundle that names its identity, its crawlers and a security contact',
    run(world) {
      world.dir = world.temp('agsc-acc-oldsite-');
      world.write('agsc.config.json', `${JSON.stringify({
        bundle: { id: 'old-site-node', operator: 'human:andreibesleaga' },
        site: { base: 'https://example.org/', tdm_crawlers: ['CCBot', 'GPTBot'], title: 'Old site node' },
        spec_version: '1.0.0',
      }, null, 2)}\n`);
      world.write('.well-known/security.txt', 'Contact: https://security.example.net/report\n');
    },
  },
  {
    pattern: 'the maintainer imports the old-site fixture with its selection file, under the network trap',
    run(world) {
      world.state.import = world.agsc(['import', '--from', 'old-site', '--selection', SELECTION, OLD_SITE, '--json'],
        { offline: true });
      world.state.imported = world.snapshot();
    },
  },
  {
    pattern: 'the import names the deliberate defects of the fixture, the selected "ghost" that no card holds among them, and exits 1',
    run(world) {
      const { exit, stdout, stderr } = world.state.import;
      assert.strictEqual(exit, 1, stdout + stderr);
      const findings = JSON.parse(stdout).findings;
      assert.ok(findings.some((f) => f.code === 'AGSC-E901' && f.severity === 'error' && /"ghost"/u.test(f.message)), stdout);
      // The one unreadable card is reported, not imported.
      assert.ok(findings.some((f) => f.code === 'AGSC-E102' && /unterminated\.md/u.test(f.message)), stdout);
    },
  },
  {
    pattern: 'the chosen records become items, clusters and diagrams, and the deferred, excluded and unknown rows of the selection do not (AGSC-01-22)',
    run(world) {
      for (const rel of ['content/index.md', 'content/concepts/alpha-one.md', 'content/clusters/alpha.md',
        'content/diagrams/alpha-one.diagram']) assert.ok(world.exists(rel), `${rel} was not written`);
      const files = [...world.state.imported.keys()];
      for (const slug of NOT_IMPORTED) {
        assert.ok(!files.some((rel) => rel.includes(slug)), `${slug} was imported: ${files.join(', ')}`);
      }
      // A record the selection holds back by its class is imported as a draft.
      assert.strictEqual(splitItem(world.read('content/concepts/beta-one.md')).frontmatter.status, 'draft');
    },
  },
  {
    pattern: 'each imported item keeps the old card\'s aliases',
    run(world) {
      assert.deepStrictEqual(splitItem(world.read('content/concepts/alpha-one.md')).frontmatter.aliases, ['a-one', 'the first']);
    },
  },
  {
    pattern: 'a second import over the same input writes nothing (AGSC-01-23)',
    run(world) {
      const again = world.agsc(['import', '--from', 'old-site', '--selection', SELECTION, OLD_SITE, '--json'], { offline: true });
      assert.strictEqual(again.exit, world.state.import.exit);
      assert.deepStrictEqual(world.snapshot(), world.state.imported);
    },
  },
  {
    pattern: 'the imported Bundle passes "agsc ci"',
    run(world) {
      const ci = world.agsc(['ci', '--json'], { offline: true });
      assert.strictEqual(ci.exit, 0, ci.stdout + ci.stderr);
      assert.strictEqual(JSON.parse(ci.stdout).status, 'pass');
    },
  },
  {
    pattern: /^the item "(content\/concepts\/[a-z0-9-]+\.md)" is retired and superseded by "([a-z0-9-]+)", which keeps the old address "(\/[a-z0-9/-]+\/)" among its aliases$/u,
    run(world, rel, successor, alias) {
      const old = world.read(rel);
      const { frontmatter } = splitItem(old);
      assert.strictEqual(frontmatter.status, undefined, `${rel} already carries a status`);
      // AGSC-11-22: the retired item stays in the Bundle, under its own slug.
      world.write(rel, old.replace(/\nkind: pattern\n/u, '\nkind: pattern\nstatus: retired\n'));
      assert.strictEqual(splitItem(world.read(rel)).frontmatter.status, 'retired');
      const retired = path.basename(rel, '.md');
      // The successor is a new item with a new slug; `supersedes` names the retired one
      // (AGSC-01-12), and the address an earlier site gave it is one of its aliases.
      world.write(`content/concepts/${successor}.md`, ['---', 'type: concept', 'title: Bounded retries',
        'description: Every failed tool call is retried a fixed number of times with backoff, then reported.',
        'clusters:', '  - agent-patterns', 'date: "2026-01-01"', 'prov:', '  origin: human', '  operator: human:andreibesleaga',
        'supersedes:', `  - ${retired}`, 'aliases:', `  - ${alias}`, 'kind: pattern', '---', '',
        splitItem(old).body.trim(), ''].join('\n'));
      world.state.superseded = { alias, retired, successor };
    },
  },
  {
    pattern: /^the retired item keeps its slug and its page "(\/concepts\/[a-z0-9-]+\/)", which says it is retired \(AGSC-01-12, AGSC-11-22\)$/u,
    run(world, route) {
      const { retired } = world.state.superseded;
      assert.strictEqual(route, `/concepts/${retired}/`);
      const page = world.read(`www${route}index.html`);
      assert.match(page, /This item is retired\. Its address stays valid and its identifier never changes/u);
      // The successor has a page of its own, at its own slug.
      assert.ok(world.exists(`www/concepts/${world.state.superseded.successor}/index.html`));
    },
  },
  {
    pattern: /^"_redirects" sends "(\/[a-z0-9/-]+\/)" to "(\/concepts\/[a-z0-9-]+\/)" with a 301, and no line redirects the retired page \(AGSC-06-04\)$/u,
    run(world, from, to) {
      const lines = world.read('www/_redirects').split('\n').filter((l) => l !== '' && !l.startsWith('#'));
      assert.ok(lines.includes(`${from} ${to} 301`), lines.join('\n'));
      const retiredPage = `/concepts/${world.state.superseded.retired}/`;
      assert.ok(!lines.some((l) => l.split(' ')[0] === retiredPage), lines.join('\n'));
    },
  },
  {
    pattern: /^a new lesson "(content\/lessons\/([a-z0-9-]+)\.md)" reuses the retired slug$/u,
    run(world, rel, slug) {
      assert.strictEqual(slug, world.state.superseded.retired);
      world.write(rel, world.read('content/lessons/record-why-a-handoff-happened.md')
        .replace('title: Record why a handoff happened', 'title: Tool-use retries need a budget'));
      assert.strictEqual(splitItem(world.read(rel)).frontmatter.title, 'Tool-use retries need a budget');
    },
  },
];
