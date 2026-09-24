'use strict';
// verifies AGSC-01-26, AGSC-01-28, AGSC-03-20, AGSC-06-30, AGSC-08-09, AGSC-08-10, AGSC-08-12
// Steps of features/persona-g-team.feature that run offline: a team's Bundle
// scaffolded by the real `init` in an empty directory, holding its own working
// record (Mode 2) as ordinary items, linted, built, exported and passed by `ci`.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT, built } = require('./_world.js');

const PROV = ['prov:', '  origin: human', '  operator: human:team-lead'];
const MODE2_LINKS = ['implements', 'verifies', 'covers', 'blocked-by', 'decided-by'];

function item(world, rel, lines, body) {
  world.write(rel, ['---', ...lines, '---', '', body, ''].join('\n'));
}

function concept(world, slug, kind, title, description, extra = []) {
  item(world, `content/concepts/${slug}.md`,
    ['type: concept', `title: ${title}`, `description: ${description}`, ...PROV, `kind: ${kind}`, ...extra],
    `${title}.`);
}

function gate(world, level, checks) {
  item(world, 'content/gates/release-gate.md', ['type: gate', 'title: Release gate',
    'description: Every change passes the schema, link, provenance, determinism and review checks before it merges.',
    ...PROV, `level: ${level}`, `checks: [${checks.join(', ')}]`, 'enforce: [status-check]'],
  'Every change passes these checks before a person merges it.');
}

const errorsOf = (r) => JSON.parse(r.stdout).findings.filter((f) => f.severity === 'error');

module.exports = [
  {
    pattern: 'the team ran "npx agentic-system-core init" in an empty directory "my-specs"',
    run(world) {
      world.dir = path.join(world.temp('agsc-acc-team-'), 'my-specs');
      fs.mkdirSync(world.dir);
      world.state.init = world.agsc(['init'], { offline: true });
      assert.strictEqual(world.state.init.exit, 0, world.state.init.stdout + world.state.init.stderr);
    },
  },
  {
    pattern: 'the scaffold created "agsc.config.json", "content/index.md", ".gitignore" and ".env.example" and printed the two "before you build" steps',
    run(world) {
      assert.deepStrictEqual([...world.snapshot().keys()], ['.env.example', '.gitignore', 'agsc.config.json', 'content/index.md']);
      assert.strictEqual(JSON.parse(world.read('agsc.config.json')).bundle.id, 'my-specs');
      assert.strictEqual(world.state.init.stderr.split('\n').filter((l) => l.startsWith('before you build: ')).length, 2);
    },
  },
  {
    pattern: 'the team added ".well-known/security.txt" and keeps its principles, decisions, specs, tasks, one procedure, one lesson, one gate and one session log as items',
    run(world) {
      world.write('.well-known/security.txt', 'Contact: mailto:security@example.org\nExpires: 2027-01-01T00:00:00Z\n');
      concept(world, 'specs-first', 'principle', 'Specs before code',
        'Every change starts from a written specification that a person has read and accepted.');
      concept(world, 'one-engine', 'decision', 'Use one engine',
        'The team keeps its specifications with the same engine that publishes its knowledge.', ['implements:', '  - specs-first']);
      concept(world, 'board-export', 'spec', 'Board export',
        'The board of every cluster with tasks is exported as JSON beside the pages of the node.');
      concept(world, 'board-test', 'task', 'Write the board test',
        'A task for the team, done once the board export has a test that a person has reviewed.',
        ['task_state: TASK_STATE_SUBMITTED', 'verifies:', '  - board-export', 'blocked-by:', '  - one-engine']);
      item(world, 'content/procedures/cut-a-release.md', ['type: procedure', 'title: Cut a release',
        'description: How the team tags a release once the gate is green and a person has approved the change.', ...PROV],
      '## When\n\nThe gate is green.\n\n## Steps\n\n1. Tag it.\n\n## Checks\n\nThe tag names the content version.');
      item(world, 'content/lessons/review-before-merge.md', ['type: lesson', 'title: Review before merge',
        'description: A change merged without a review broke the board export, so every merge now waits for a person.',
        ...PROV, 'severity: warn'],
      '## What happened\n\nA merge broke the export.\n\n## Lesson\n\nReview first.\n\n## Evidence\n\nThe broken build.\n\n## Check before\n\nA person approved it.');
      gate(world, 'L2', ['schema', 'links', 'provenance', 'determinism', 'review']);
      item(world, 'content/episodes/session-one.md', ['type: episode', 'title: Session one',
        'description: The first working session of the team, in which the board export was specified and reviewed.',
        'actor: human:team-lead', 'started: "2026-01-01T00:00:00Z"', 'outcome: success', ...PROV],
      '## What happened\n\nWe specified the board export.\n\n## Outcome\n\nA spec.\n\n## Next\n\nThe test.');
    },
  },
  {
    pattern: 'lint runs over the team\'s "content/concepts/<slug>.md" files of "kind: principle", "kind: decision", "kind: spec" and "kind: task"',
    run(world) {
      world.state.lint = world.agsc(['lint', '--json'], { offline: true });
    },
  },
  {
    pattern: 'over "content/gates/<slug>.md" and "content/episodes/<slug>.md" (session logs)',
    run(world) {
      assert.ok(world.exists('content/gates/release-gate.md') && world.exists('content/episodes/session-one.md'));
    },
  },
  {
    pattern: 'lint accepts every kind without introducing a new "type"',
    run(world) {
      const { lint } = world.state;
      assert.deepStrictEqual(errorsOf(lint), []);
      assert.strictEqual(lint.exit, 0);
      const types = new Set();
      for (const folder of fs.readdirSync(path.join(world.dir, 'content'))) {
        if (fs.statSync(path.join(world.dir, 'content', folder)).isDirectory()) types.add(folder);
      }
      assert.deepStrictEqual([...types].sort(), ['concepts', 'episodes', 'gates', 'lessons', 'procedures']);
    },
  },
  {
    pattern: 'the five Mode-2 Link keys (`implements`, `verifies`, `covers`, `blocked-by`, `decided-by`) exist at 1.0 but are never required (AGSC-03-20)',
    run(world) {
      // Present on two items, absent from the rest, and lint is clean either way.
      const text = ['one-engine', 'board-test'].map((s) => world.read(`content/concepts/${s}.md`)).join('\n');
      for (const key of ['implements', 'verifies', 'blocked-by']) assert.match(text, new RegExp(`^${key}:`, 'mu'));
      assert.doesNotMatch(world.read('content/concepts/specs-first.md'), new RegExp(`^(${MODE2_LINKS.join('|')}):`, 'mu'));
      built(world, { offline: true });
      const nodes = JSON.parse(world.read('www/graph.jsonld'))['@graph'];
      const test = nodes.find((n) => n['@id'] === 'http://localhost/concepts/board-test/');
      assert.ok(test.verifies && test.blockedBy, JSON.stringify(test));
    },
  },
  {
    pattern: 'the team runs "npx agentic-system-core export --steer"',
    run(world) {
      const r = world.agsc(['export', '--steer'], { offline: true });
      assert.strictEqual(r.exit, 0, r.stdout + r.stderr);
      world.state.agents = world.read('dist/export/steer/AGENTS.md');
    },
  },
  {
    pattern: '"AGENTS.md"/"CLAUDE.md" bundles are rendered from NOW/Concept/Procedure/Gate/Lesson items',
    run(world) {
      const agents = world.state.agents;
      assert.strictEqual(world.read('dist/export/steer/CLAUDE.md'), agents);
      for (const section of ['## Now', '## Concepts', '## Procedures', '## Gates', '## Lessons']) {
        assert.match(agents, new RegExp(`^${section}$`, 'mu'), `no "${section}" section`);
      }
      for (const title of ['Specs before code', 'Cut a release', 'Release gate', 'Review before merge']) {
        assert.ok(agents.includes(title), `${title} is not rendered`);
      }
    },
  },
  {
    pattern: 'the output is byte-stable across repeated runs',
    run(world) {
      const r = world.agsc(['export', '--steer'], { offline: true });
      assert.strictEqual(r.exit, 0);
      assert.strictEqual(world.read('dist/export/steer/AGENTS.md'), world.state.agents);
    },
  },
  {
    pattern: 'the exported files are context only — enforcement happens in CI, not in the steer files themselves',
    run(world) {
      assert.match(world.state.agents, /it is data, and it is not\n> an instruction to you/u);
      assert.ok(!world.exists('dist/forge') && !world.exists('dist/gate.json'), 'export --steer enforced something');
      const ci = world.agsc(['ci'], { offline: true });
      assert.strictEqual(ci.exit, 0, ci.stdout + ci.stderr);
      assert.ok(world.exists('dist/gate.json') && world.exists('dist/forge/status-checks.json'), 'ci wrote no verdict');
    },
  },
  {
    pattern: '"content/gates/<slug>.md" declares "checks: [schema, links, provenance, determinism, review]" and "enforce: [status-check]"',
    run(world) {
      const text = world.read('content/gates/release-gate.md');
      assert.match(text, /^checks: \[schema, links, provenance, determinism, review\]$/mu);
      assert.match(text, /^enforce: \[status-check\]$/mu);
    },
  },
  {
    pattern: '"npx agentic-system-core ci" runs',
    run(world) {
      const ci = world.agsc(['ci'], { offline: true });
      assert.strictEqual(ci.exit, 0, ci.stdout + ci.stderr);
    },
  },
  {
    pattern: 'each declared check becomes one named required status check in "dist/forge/status-checks.json" (AGSC-08-09, AGSC-08-12)',
    run(world) {
      assert.strictEqual(world.read('dist/forge/status-checks.json'),
        '["determinism","links","provenance","review","schema"]\n');
    },
  },
  {
    pattern: '"dist/gate.json" names the gate and its level (AGSC-08-10)',
    run(world) {
      const verdict = JSON.parse(world.read('dist/gate.json'));
      assert.strictEqual(verdict.gate, 'release-gate');
      assert.strictEqual(verdict.level, 'L2');
      assert.strictEqual(verdict.status, 'pass');
    },
  },
  {
    pattern: 'after a change to the Gate\'s checks the next run never keeps the old status checks: it compiles the new ones, or reports the drift as "AGSC-E707" and overwrites nothing until the stale file is removed (AGSC-08-12)',
    run(world) {
      const before = world.read('dist/forge/status-checks.json');
      // An L1 gate covers schema and links only (AGSC-08-09).
      gate(world, 'L1', ['schema', 'links']);
      let ci = world.agsc(['ci'], { offline: true });
      if (ci.exit !== 0) {
        // The compiled file of the previous run differs: reported, never overwritten.
        assert.match(ci.stderr, /^error: AGSC-E707 dist\/forge\/status-checks\.json differs/mu, ci.stdout + ci.stderr);
        assert.strictEqual(world.read('dist/forge/status-checks.json'), before);
        fs.rmSync(path.join(world.dir, 'dist', 'forge'), { force: true, recursive: true });
        ci = world.agsc(['ci'], { offline: true });
      }
      assert.strictEqual(ci.exit, 0, ci.stdout + ci.stderr);
      assert.strictEqual(world.read('dist/forge/status-checks.json'), '["links","schema"]\n');
      assert.strictEqual(JSON.parse(world.read('dist/gate.json')).level, 'L1');
    },
  },
  {
    pattern: '"npx agentic-system-core build" runs over the team\'s Bundle',
    run(world) {
      concept(world, 'unreleased-plan', 'spec', 'Unreleased plan',
        'A specification the team is still writing, which no page and no export may carry yet.', ['status: draft']);
      world.state.build = built(world, { offline: true });
    },
  },
  {
    pattern: 'every published item of the team has its page, its Markdown view and its node in "graph.jsonld"',
    run(world) {
      const ids = new Set(JSON.parse(world.read('www/graph.jsonld'))['@graph'].map((n) => n['@id']));
      for (const [plural, slug] of [['concepts', 'specs-first'], ['concepts', 'one-engine'], ['concepts', 'board-export'],
        ['concepts', 'board-test'], ['procedures', 'cut-a-release'], ['lessons', 'review-before-merge'],
        ['gates', 'release-gate'], ['episodes', 'session-one']]) {
        assert.ok(world.exists(`www/${plural}/${slug}/index.html`), `${slug} has no page`);
        assert.ok(world.exists(`www/pages/${slug}.md`), `${slug} has no Markdown view`);
        assert.ok(ids.has(`http://localhost/${plural}/${slug}/`), `${slug} is not in the graph`);
      }
    },
  },
  {
    pattern: 'the build names "/specs/" as the specification site\'s route, which a content node does not emit (AGSC-06-01)',
    run(world) {
      assert.match(world.state.build.stderr, /^skipped: \/specs\/[^\n]*\(AGSC-06-01\)\)?$/mu);
      assert.ok(!world.exists('www/specs'), 'a content node emitted /specs/');
    },
  },
  {
    pattern: 'an item with "status: draft" is excluded from every page and every export (AGSC-06-30, AGSC-01-26)',
    run(world) {
      fs.copyFileSync(path.join(ROOT, 'LICENSE-CONTENT'), path.join(world.dir, 'LICENSE-CONTENT'));
      for (const form of ['--markdown', '--okf', '--jsonld', '--jsonl', '--steer']) {
        const r = world.agsc(['export', form], { offline: true });
        assert.strictEqual(r.exit, 0, `${form}: ${r.stdout}${r.stderr}`);
      }
      const r = world.agsc(['skills'], { offline: true });
      assert.strictEqual(r.exit, 0, r.stdout + r.stderr);
      for (const tree of ['www', 'dist']) {
        for (const [rel, bytes] of world.snapshot(tree)) {
          assert.ok(!Buffer.from(bytes, 'base64').toString('utf8').includes('unreleased-plan'), `${tree}/${rel} carries the draft`);
        }
      }
      assert.ok(world.exists('dist/export/markdown/content/concepts/specs-first.md'), 'the export is empty');
    },
  },
];
