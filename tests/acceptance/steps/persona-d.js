'use strict';
// verifies AGSC-03-12, AGSC-04-19, AGSC-08-01, AGSC-08-04, AGSC-08-05
// Steps of features/persona-d-agent-proposer.feature that run offline.
// The file names the persona's rules in its scenarios; the assertions below are
// what make them hold.

const assert = require('node:assert');
const YAML = require('yaml');

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
      const { body, frontmatter } = parseItem(world.read(ITEM));
      frontmatter.prov = {
        agent: 'claude-code/1.0',
        model: 'example-model-1',
        operator: world.state.operator,
        origin: 'ai-assisted',
      };
      writeItem(world, ITEM, frontmatter,
        body.replace('Route work to specialised workers', 'Route each piece of work to a specialised worker'));
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
];
