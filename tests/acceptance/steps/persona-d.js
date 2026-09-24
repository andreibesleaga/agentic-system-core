'use strict';
// verifies AGSC-08-01
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
];
