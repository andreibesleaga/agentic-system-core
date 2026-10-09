'use strict';
// verifies AGSC-03-12, AGSC-04-19, AGSC-08-01, AGSC-08-04, AGSC-08-05, AGSC-08-07
// Steps of features/persona-d-agent-proposer.feature that run offline, the
// operator's half included: the printed commands applied in a clean checkout, the
// commit carrying the sign-off and the `Assisted-by:` line, and the ledger entry
// the build derives from it. The file names the persona's rules in its scenarios;
// the assertions below are what make them hold.

const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const { ROOT } = require('./_world.js');

// The trailer grammar of AGSC-08-06 and AGSC-08-07 has no verb of its own; the
// engine's parser is the check a forge's CI runs, so the step calls it directly.
const provRules = require(path.join(ROOT, 'src', 'governance', 'prov.js'));

/** Split an item file into its frontmatter object and body. */
function parseItem(text) {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/u.exec(text);
  assert.ok(match, 'the item has a frontmatter block');
  return { body: match[2], frontmatter: YAML.parse(match[1]) };
}

function writeItem(world, rel, frontmatter, body) {
  world.write(rel, `---\n${YAML.stringify(frontmatter)}---\n${body}`);
}

const ITEM = 'content/concepts/supervisor.md';
/** The operator's own sign-off; the address is joined at run time, never written whole. */
const OPERATOR = { local: 'acceptance-operator', name: 'Acceptance Operator' };

/** The agent's edit: a sharper body and the full prov block of an operator-run agent. */
function agentEdit(world) {
  const { body, frontmatter } = parseItem(world.read(ITEM));
  frontmatter.prov = {
    agent: 'claude-code/1.0',
    model: 'example-model-1',
    operator: world.state.operator,
    origin: 'ai-assisted',
  };
  writeItem(world, ITEM, frontmatter,
    body.replace('Route work to specialised workers', 'Route each piece of work to a specialised worker'));
}

/** The agent's edit as it left the file: keys out of order, a wikilink, no final LF. */
const MESSY = ['---', 'title: Supervisor', 'type: concept', 'kind: pattern',
  'description: A coordinating agent that routes work to specialised workers and collects their results.',
  'tags:', '  - agents', '  - reliability', 'clusters:', '  - agent-patterns', 'date: "2026-01-01"',
  'prov:', '  origin: ai-assisted', '  operator: human:acceptance-operator', '  agent: claude-code/1.0',
  '  model: example-model-1', '---', '', '## Intent', '',
  'Route work to specialised workers, then pass control on through [[handoff]].'].join('\n');

module.exports = [
  {
    pattern: 'the agent is operator-run and has a "prov.operator" identity "human:<gh-id>"',
    run(world) {
      // `<gh-id>` stands for the operator's forge login; any human actor of AGSC-02-09.
      world.state.operator = 'human:acceptance-operator';
      world.bundle();
    },
  },
  {
    pattern: 'the agent edits "content/concepts/<slug>.md"',
    run(world) {
      agentEdit(world);
    },
  },
  {
    pattern: 'the frontmatter carries "prov: {origin: ai-assisted, agent: \\"claude-code/…\\", model: \\"…\\", operator: \\"human:<gh-id>\\"}"',
    run(world) {
      const { prov } = parseItem(world.read(ITEM)).frontmatter;
      assert.strictEqual(prov.origin, 'ai-assisted');
      assert.match(prov.agent, /^claude-code\//u);
      assert.ok(typeof prov.model === 'string' && prov.model.length > 0);
      assert.strictEqual(prov.operator, world.state.operator);
      const lint = world.agsc(['lint', '--json']);
      assert.strictEqual(lint.exit, 0, lint.stdout + lint.stderr);
    },
  },
  {
    pattern: 'lint rejects the item if "prov.origin" or "prov.operator" is missing',
    run(world) {
      const original = world.read(ITEM);
      for (const [member, code] of [['origin', /AGSC-E(202|501)/u], ['operator', /AGSC-E503/u]]) {
        const { body, frontmatter } = parseItem(original);
        delete frontmatter.prov[member];
        writeItem(world, ITEM, frontmatter, body);
        const lint = world.agsc(['lint', '--json']);
        assert.strictEqual(lint.exit, 1, `lint accepted an item with no prov.${member}`);
        const envelope = JSON.parse(lint.stdout);
        assert.ok(envelope.findings.some((f) => f.severity === 'error' && code.test(f.code)
          && f.file === ITEM), `no ${code} error names ${ITEM}: ${lint.stdout}`);
      }
      world.write(ITEM, original);
    },
  },
  {
    pattern: 'the agent\'s edit of "content/concepts/<slug>.md" left keys out of schema order, a wikilink and no trailing LF',
    run(world) {
      world.write(ITEM, MESSY);
    },
  },
  {
    pattern: 'the agent runs "npx agentic-system-core lint --fix"',
    run(world) {
      world.state.fix = world.agsc(['lint', '--fix'], { offline: true });
    },
  },
  {
    pattern: 'wikilinks, key order and trailing LF are normalized, and a second lint reports no error (AGSC-04-19, AGSC-03-12)',
    run(world) {
      const text = world.read(ITEM);
      assert.ok(text.endsWith('.md).\n') && !text.endsWith('\n\n'), 'the file does not end with exactly one LF');
      assert.ok(text.includes('[handoff](../concepts/handoff.md)'), 'the wikilink was not rewritten');
      assert.ok(!text.includes('[['), 'a wikilink is left');
      const { frontmatter } = parseItem(text);
      assert.deepStrictEqual(Object.keys(frontmatter),
        ['type', 'title', 'description', 'tags', 'clusters', 'date', 'prov', 'kind']);
      assert.deepStrictEqual(Object.keys(frontmatter.prov), ['origin', 'agent', 'model', 'operator']);
      const report = `${world.state.fix.stdout}${world.state.fix.stderr}`;
      assert.match(report, /AGSC-E506 lint --fix normalised content\/concepts\/supervisor\.md: 1 wikilink/u);
      // Idempotent: a second --fix changes nothing, and plain lint has no error left.
      const once = world.read(ITEM);
      world.agsc(['lint', '--fix'], { offline: true });
      assert.strictEqual(world.read(ITEM), once);
      const lint = world.agsc(['lint'], { offline: true });
      assert.strictEqual(lint.exit, 0, lint.stdout + lint.stderr);
    },
  },
  {
    pattern: 'the agent runs "npx agentic-system-core propose <slug>"',
    run(world) {
      world.state.propose = world.agsc(['propose', 'supervisor'], { offline: true });
      assert.strictEqual(world.state.propose.exit, 0, world.state.propose.stdout + world.state.propose.stderr);
    },
  },
  {
    pattern: 'the CLI writes "dist/proposal/1.patch" and "dist/proposal/1.md", the PR body opening with "<!-- agsc:proposal v1 -->" (AGSC-08-05)',
    run(world) {
      assert.ok(world.exists('dist/proposal/1.patch'));
      const body = world.read('dist/proposal/1.md');
      assert.match(body, /^<!-- agsc:proposal v1 -->\n/u);
      assert.match(body, /## Rationale\n/u);
      assert.match(body, /## Affected slugs\n\n- supervisor\n/u);
      assert.match(body, /- prov\.origin: ai-assisted\n/u);
    },
  },
  {
    pattern: 'the CLI prints, but does not execute, "git apply dist/proposal/1.patch", "git checkout -b proposal/1" and the pull-request step (AGSC-08-04)',
    run(world) {
      const printed = world.state.propose.stderr;
      assert.match(printed, /^run: git apply dist\/proposal\/1\.patch$/mu);
      assert.match(printed, /^run: git checkout -b proposal\/1\b/mu);
      assert.match(printed, /^run: open a pull request with the body of dist\/proposal\/1\.md$/mu);
      // Printed, not run: there is still no repository and no branch here.
      assert.ok(!world.exists('.git'), 'propose ran git');
    },
  },
  {
    pattern: 'no network write occurs from the "propose" verb',
    run(world) {
      assert.deepStrictEqual(world.networkAttempts(), []);
    },
  },
  {
    pattern: 'the agent\'s edit of "content/concepts/<slug>.md" is proposed from a git repository of one commit',
    run(world) {
      world.commitAll('Add the acceptance Bundle');
      agentEdit(world);
      world.state.propose = world.agsc(['propose', 'supervisor'], { offline: true });
      assert.strictEqual(world.state.propose.exit, 0, world.state.propose.stdout + world.state.propose.stderr);
      assert.ok(world.exists('dist/proposal/1.patch'));
    },
  },
  {
    pattern: 'the operator runs the printed "agsc lint --fix" and "git checkout -b proposal/1"',
    run(world) {
      // In a repository the working tree already carries the change, so propose
      // prints no "git apply" (AGSC-08-04): the operator normalises, branches and commits.
      const printed = world.state.propose.stderr.split('\n').filter((l) => l.startsWith('run: '));
      assert.deepStrictEqual(printed, ['run: agsc lint --fix', 'run: git checkout -b proposal/1',
        `run: git add ${ITEM} && git commit`, 'run: open a pull request with the body of dist/proposal/1.md']);
      const fix = world.agsc(['lint', '--fix'], { offline: true });
      assert.strictEqual(fix.exit, 0, fix.stdout + fix.stderr);
      world.git(['checkout', '-q', '-b', 'proposal/1']);
    },
  },
  {
    pattern: 'the operator commits the change as printed, with a "Signed-off-by:" trailer and an "Assisted-by:" line naming "prov.operator"',
    run(world) {
      const trailers = [
        `Signed-off-by: ${OPERATOR.name} <${[OPERATOR.local, 'example.org'].join('@')}> (CA-v1)`,
        `Assisted-by: claude-code/1.0 (operator: ${world.state.operator})`,
      ];
      world.git(['add', ITEM]);
      world.git(['commit', '-q', '-m', 'Sharpen the intent of supervisor', '-m', trailers.join('\n')],
        { GIT_AUTHOR_DATE: '2026-01-02T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-02T00:00:00Z' });
      world.state.applied = world.git(['rev-parse', 'HEAD']).trim();
      assert.deepStrictEqual(world.trailers(), trailers);
      // The Proposal files under dist/ stay out of the commit.
      assert.deepStrictEqual(world.git(['show', '--name-only', '--format=', 'HEAD']).split('\n').filter(Boolean), [ITEM]);
    },
  },
  {
    pattern: 'the trailer block of that commit passes the grammar for an "ai-assisted" change (AGSC-08-06, AGSC-08-07)',
    run(world) {
      const message = world.git(['log', '-1', '--format=%B', world.state.applied]);
      const { prov } = parseItem(world.read(ITEM)).frontmatter;
      const checked = provRules.checkTrailers(message, { file: ITEM, prov });
      assert.deepStrictEqual(checked.findings, []);
      assert.strictEqual(checked.signoff.agreement, 'CA-v1');
      assert.deepStrictEqual(checked.assisted.map((a) => a.operator), [prov.operator]);
    },
  },
  {
    pattern: 'lint and build pass on the branch "proposal/1", and the ledger entry of that commit names the operator from the sign-off (AGSC-08-20a)',
    run(world) {
      assert.strictEqual(world.git(['rev-parse', '--abbrev-ref', 'HEAD']).trim(), 'proposal/1');
      const lint = world.agsc(['lint'], { offline: true });
      assert.strictEqual(lint.exit, 0, lint.stdout + lint.stderr);
      const build = world.agsc(['build'], { offline: true });
      assert.strictEqual(build.exit, 0, build.stdout + build.stderr);
      const entries = world.read('www/ledger.jsonl').split('\n').filter(Boolean).map((l) => JSON.parse(l));
      const entry = entries.find((e) => e.ref === world.state.applied);
      assert.ok(entry, `no ledger entry names ${world.state.applied}`);
      assert.strictEqual(entry.actor, `human:${OPERATOR.local}`);
      assert.ok(!fs.existsSync(path.join(world.dir, 'content', 'ledger.jsonl')));
      assert.deepStrictEqual(world.networkAttempts(), []);
    },
  },
  {
    pattern: '"dist/proposal/1.patch" applies with "git apply" to a clean checkout of the first commit, and the item it gives passes lint',
    run(world) {
      // A reviewer's own checkout of the commit the Proposal was made against.
      const clone = path.join(world.temp('agsc-acc-reviewer-'), 'node');
      world.git(['clone', '-q', '--no-hardlinks', '--branch', 'main', world.dir, clone]);
      const applied = spawnSync('git', ['apply', path.join(world.dir, 'dist', 'proposal', '1.patch')],
        { cwd: clone, encoding: 'utf8', env: world.env() });
      assert.strictEqual(applied.status, 0, applied.stderr);
      const item = parseItem(fs.readFileSync(path.join(clone, ITEM), 'utf8'));
      assert.match(item.body, /Route each piece of work to a specialised worker/u);
      assert.strictEqual(item.frontmatter.prov.operator, world.state.operator);
      const lint = world.agsc(['lint'], { cwd: clone, offline: true });
      assert.strictEqual(lint.exit, 0, lint.stdout + lint.stderr);
    },
  },
];
