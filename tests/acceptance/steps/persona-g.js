'use strict';
// verifies AGSC-01-23, AGSC-01-26, AGSC-01-26a, AGSC-01-28, AGSC-03-20, AGSC-06-30, AGSC-08-09, AGSC-08-10, AGSC-08-12, AGSC-10-13
// Steps of features/persona-g-team.feature that run offline: a team's Bundle
// scaffolded by the real `init` in an empty directory, holding its own working
// record (Mode 2) as ordinary items, linted, built, exported and passed by `ci`;
// the same Bundle moved into a GABBE kit and back, and a board moved to and from
// the files of eleven project tools and back (the fixtures of
// `tests/fixtures/pm-<tool>/`, the ones the adapter's own tests read).
//
// Three phrases here are reused by persona-f and persona-h, which run imports of
// their own: "the import plan wrote nothing into the Bundle", "… into a copy of the
// Bundle that holds no item", and "the same import run again writes nothing …".
// A step that sets up an import's input records the Bundle's `content/` first, in
// `world.state.contentBefore`, so that a dry run can be shown to write nothing.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT, built, splitItem } = require('./_world.js');

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

/** The content version of an untagged Bundle with no history, built at the fixed instant. */
const UNTAGGED = '0.0.0+20260101T000000Z';

/** Every file under `dir`, relative, with its bytes as base64, in code-point order. */
function tree(dir) {
  const out = new Map();
  const walk = (sub) => {
    for (const name of fs.readdirSync(path.join(dir, sub)).sort()) {
      const rel = sub === '' ? name : `${sub}/${name}`;
      if (fs.statSync(path.join(dir, rel)).isDirectory()) walk(rel);
      else out.set(rel, fs.readFileSync(path.join(dir, rel)).toString('base64'));
    }
  };
  if (fs.existsSync(dir)) walk('');
  return out;
}

/** The items of a Bundle directory, `content/<plural>/<slug>.md` → {frontmatter, body}. */
function itemsOf(dir) {
  const out = new Map();
  for (const rel of tree(path.join(dir, 'content')).keys()) {
    if (rel === 'index.md' || !rel.endsWith('.md')) continue;
    const { body, frontmatter } = splitItem(fs.readFileSync(path.join(dir, 'content', rel), 'utf8'));
    out.set(rel, { body: body.replace(/^\n+/u, ''), frontmatter });
  }
  return out;
}

/** An item as it was authored: its `prov.source_version`, which an import adds, removed. */
function authored(item) {
  const frontmatter = JSON.parse(JSON.stringify(item.frontmatter));
  if (frontmatter.prov) delete frontmatter.prov.source_version;
  return { body: item.body, frontmatter };
}

/** Assert that `target` holds exactly the items `expected` names, each as `source` authored it. */
function sameItems(world, source, target, expected) {
  assert.deepStrictEqual([...target.keys()].sort(), [...expected].sort());
  for (const rel of expected) {
    const back = target.get(rel);
    assert.strictEqual(back.frontmatter.prov.source_version, UNTAGGED, `${rel}: the exporting node's content version`);
    assert.deepStrictEqual(authored(back), authored(source.get(rel)), `${rel} did not come back as authored`);
  }
}

/** The files the last import added under `content/`, against the snapshot taken before it. */
function addedSince(world) {
  const before = world.state.contentBefore;
  assert.ok(before, 'no snapshot of content/ was taken before the import');
  return [...world.snapshot('content').keys()].filter((rel) => !before.has(rel)).map((rel) => `content/${rel}`);
}

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
  // ---------------------------------------------------------------- GABBE kit
  {
    pattern: 'the kit holds the procedure as a skill, the gate as a guide, each concept as semantic memory, the session log as a decision log and the lesson in "CONTINUITY.md"',
    run(world) {
      const kit = 'dist/export/gabbe/agents';
      assert.ok(world.exists(`${kit}/skills/agsc/cut-a-release.skill.md`), 'the procedure is not a skill');
      assert.ok(world.exists(`${kit}/guides/agsc/release-gate.md`), 'the gate is not a guide');
      for (const slug of ['specs-first', 'one-engine', 'board-export', 'board-test']) {
        assert.ok(world.exists(`${kit}/memory/semantic/agsc/${slug}.md`), `${slug} is not semantic memory`);
      }
      assert.ok(world.exists(`${kit}/memory/episodic/agsc/session-one.md`), 'the session log is not a decision log');
      assert.match(world.read(`${kit}/memory/CONTINUITY.md`), /Review before merge/u);
      // Every file starts with the provenance block, so the kit says where it came from.
      assert.match(world.read(`${kit}/skills/agsc/cut-a-release.skill.md`), /<!-- agsc:provenance\n/u);
    },
  },
  {
    pattern: /^the (?:team|author) imports "([^"]+)" with "([^"]+)" into a copy of the Bundle that holds no item$/u,
    run(world, from, flags) {
      // The same node, checked out again before any item exists: its configuration,
      // its root document and its security contact, and no item.
      const target = world.temp('agsc-acc-copy-');
      for (const rel of ['agsc.config.json', 'content/index.md', '.well-known/security.txt', 'LICENSE-CONTENT']) {
        if (!world.exists(rel)) continue;
        fs.mkdirSync(path.dirname(path.join(target, rel)), { recursive: true });
        fs.copyFileSync(path.join(world.dir, rel), path.join(target, rel));
      }
      const argv = ['import', path.join(world.dir, from), ...flags.split(' ')];
      const r = world.agsc(argv, { cwd: target, offline: true });
      assert.strictEqual(r.exit, 0, r.stdout + r.stderr);
      world.state.target = target;
      world.state.lastImport = { argv, cwd: target };
    },
  },
  {
    pattern: 'every published item comes back as authored, with the exporting node\'s content version',
    run(world) {
      const source = itemsOf(world.dir);
      const published = [...source].filter(([, item]) => item.frontmatter.status !== 'draft').map(([rel]) => rel);
      assert.ok(published.length > 0);
      sameItems(world, source, itemsOf(world.state.target), published);
    },
  },
  {
    pattern: 'the same import run again writes nothing and reports every item unchanged',
    run(world) {
      const { argv, cwd } = world.state.lastImport || { argv: world.last.argv, cwd: world.dir };
      assert.strictEqual(argv[0], 'import', `the last command was not an import: ${argv.join(' ')}`);
      const before = tree(path.join(cwd, 'content'));
      const again = world.agsc(argv.filter((a) => a !== '--json'), { cwd, offline: true });
      assert.strictEqual(again.exit, 0, again.stdout + again.stderr);
      const m = /^import: 0 written, 0 replaced, (\d+) unchanged$/mu.exec(again.stderr);
      assert.ok(m && Number(m[1]) > 0, again.stderr);
      assert.deepStrictEqual(tree(path.join(cwd, 'content')), before);
    },
  },
  // ------------------------------------------------------- boards and trackers
  {
    pattern: /^the team's "(agsc-board|asana|github|gitlab|jira|linear|markdown|notion|obsidian-kanban|todotxt|trello)" export file is in the folder "([a-z-]+)"$/u,
    run(world, tool, folder) {
      fs.cpSync(path.join(ROOT, 'tests', 'fixtures', `pm-${tool}`), path.join(world.dir, folder), { recursive: true });
      world.state.tool = tool;
      world.state.contentBefore = world.snapshot('content');
    },
  },
  {
    pattern: 'the import plan wrote nothing into the Bundle',
    run(world) {
      assert.deepStrictEqual(world.snapshot('content'), world.state.contentBefore);
    },
  },
  {
    pattern: 'every row of the export arrives as a draft task on a draft board, so nothing of it is published yet',
    run(world) {
      const added = addedSince(world);
      const items = added.map((rel) => ({ rel, ...splitItem(world.read(rel)) }));
      assert.ok(items.some((i) => i.frontmatter.kind === 'task'), `no task arrived: ${added.join(', ')}`);
      assert.ok(items.some((i) => i.frontmatter.type === 'cluster'), `no board arrived: ${added.join(', ')}`);
      for (const { frontmatter, rel } of items) {
        assert.strictEqual(frontmatter.status, 'draft', `${rel} is not a draft`);
        assert.strictEqual(frontmatter.prov.origin, 'imported', rel);
        if (frontmatter.type === 'concept') {
          assert.ok(frontmatter['x-board-source'].startsWith(`${world.state.tool}:`), `${rel} does not name its row`);
        }
      }
      world.state.imported = added;
    },
  },
  {
    pattern: 'the team publishes the imported board',
    run(world) {
      for (const rel of world.state.imported) {
        const text = world.read(rel);
        assert.match(text, /^status: draft\n/mu, rel);
        world.write(rel, text.replace(/^status: draft\n/mu, ''));
      }
    },
  },
  {
    pattern: 'every board the export carries comes back with its items as published',
    run(world) {
      const source = itemsOf(world.dir);
      const imported = world.state.imported.map((rel) => rel.slice('content/'.length));
      // A board is a cluster holding at least one task (AGSC-10-13): the export
      // carries each board with every item filed in it, and nothing else.
      const boards = new Set(imported.map((rel) => source.get(rel).frontmatter)
        .filter((fm) => fm.kind === 'task').flatMap((fm) => fm.clusters || []));
      assert.ok(boards.size > 0);
      const expected = imported.filter((rel) => {
        const fm = source.get(rel).frontmatter;
        if (fm.type === 'cluster') return boards.has(rel.replace(/^clusters\/|\.md$/gu, ''));
        return (fm.clusters || []).some((c) => boards.has(c));
      });
      sameItems(world, source, itemsOf(world.state.target), expected);
    },
  },
  {
    pattern: 'the team\'s Bundle holds a published board "delivery" with two tasks',
    run(world) {
      item(world, 'content/clusters/delivery.md', ['type: cluster', 'title: Delivery',
        'description: The delivery board of the team, which holds the tasks of the next release.', ...PROV],
      'The tasks of the next release.');
      concept(world, 'write-the-notes', 'task', 'Write the release notes',
        'A task of the delivery board, done once the release notes exist and a person has read them.',
        ['clusters:', '  - delivery', 'task_state: TASK_STATE_WORKING']);
      concept(world, 'review-the-notes', 'task', 'Review the release notes',
        'A task of the delivery board, done once a second person has reviewed the release notes.',
        ['clusters:', '  - delivery', 'task_state: TASK_STATE_SUBMITTED']);
    },
  },
  {
    pattern: '"dist/export/board/github/delivery.json" lists the two tasks of the board as issues',
    run(world) {
      const issues = JSON.parse(world.read('dist/export/board/github/delivery.json'));
      assert.deepStrictEqual(issues.map((i) => [i.title, i.state]),
        [['Review the release notes', 'open'], ['Write the release notes', 'open']]);
      for (const issue of issues) assert.strictEqual(issue.milestone.title, 'Delivery');
    },
  },
];
