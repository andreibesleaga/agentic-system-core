'use strict';
// tests/examples/blueprints.test.js — the three blueprints under examples/blueprints/
// (AGSC-07-29, PRD-071). Each folder is a Bundle whose saved architecture
// (AGSC-02-97) `compose --from <slug> --brief` turns into a blueprint: the three C4
// levels, one decision record per decision and a build plan. For each one this file
// proves, in a scratch copy with a git history and a fixed build instant:
//
//   * `agsc lint`, `agsc ci` and `agsc conform --level 2` pass with no error and no
//     warning, and two builds write the same bytes;
//   * the blueprint is written beside the Harness, never inside it or its archive, and
//     two runs write the same bytes;
//   * the three C4 levels agree with one another and with the selection;
//   * every decision record names the options that were considered;
//   * the build plan has one step per member, and every part is verified by a check;
//   * the page of the architecture links the browser compose page, which offers the
//     blueprint as an archive;
//   * the authored text keeps the public-text rules;
//   * the "Build from this" dry run of the folder's README runs, offline, and prints the
//     lines the README quotes (tests/docs/_page-runner.js).
//
// No network, no model: the page runner refuses every network call, and the commands run
// this repository's own command line.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, SKIP, check, parse } = require('../docs/_page-runner.js');

const FOLDER = path.join(ROOT, 'examples', 'blueprints');
const AGSC = path.join(ROOT, 'bin', 'agsc.js');
/** 2026-09-14T10:00:00Z, the build instant of docs/DEMOS.md and of each README's dry run. */
const EPOCH = '1789380000';

/** Each blueprint folder and the slug of its saved architecture. */
const BLUEPRINTS = [
  { folder: 'engine', architecture: 'agenticsystemcore-engine' },
  { folder: 'linked-sites', architecture: 'two-linked-sites' },
  { folder: 'tool-server', architecture: 'tool-server-and-client' },
];

/** The environment of every command: the build instant, an empty git identity, no AGSC_ switch. */
function environment(home) {
  const env = {};
  for (const [name, value] of Object.entries(process.env)) if (!name.startsWith('AGSC_')) env[name] = value;
  return Object.assign(env, {
    GIT_AUTHOR_DATE: '2026-09-01T10:00:00Z', GIT_AUTHOR_EMAIL: 'operator@example.org', GIT_AUTHOR_NAME: 'Operator',
    GIT_COMMITTER_DATE: '2026-09-01T10:00:00Z', GIT_COMMITTER_EMAIL: 'operator@example.org', GIT_COMMITTER_NAME: 'Operator',
    GIT_CONFIG_GLOBAL: path.join(home, '.gitconfig-empty'), GIT_CONFIG_NOSYSTEM: '1', HOME: home, NO_COLOR: '1',
    SOURCE_DATE_EPOCH: EPOCH,
  });
}

function run(command, args, cwd, env) {
  const r = spawnSync(command, args, { cwd, encoding: 'utf8', env });
  return { out: `${r.stdout}${r.stderr}`, status: r.status };
}

/** Every file under `dir`, relative path → bytes, in code-point order. */
function tree(dir) {
  const files = new Map();
  const walk = (at) => {
    for (const entry of fs.readdirSync(path.join(dir, at), { withFileTypes: true })) {
      const rel = at ? `${at}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(rel);
      else files.set(rel, fs.readFileSync(path.join(dir, rel)));
    }
  };
  walk('');
  return new Map([...files].sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** The selection of the saved architecture, and the type and kind of every item of the Bundle. */
function bundleOf(dir, architecture) {
  const items = new Map();
  for (const folder of ['concepts', 'procedures']) {
    for (const name of fs.readdirSync(path.join(dir, 'content', folder))) {
      const text = fs.readFileSync(path.join(dir, 'content', folder, name), 'utf8');
      items.set(name.replace(/\.md$/u, ''), {
        kind: (/^kind: (\S+)$/mu.exec(text) || [])[1], text, type: /^type: (\S+)$/mu.exec(text)[1],
      });
    }
  }
  const block = /```yaml agsc-selection\n([\s\S]*?)```/u.exec(items.get(architecture).text)[1];
  return { items, selection: block.trim().split('\n').map((line) => line.replace(/^- /u, '')) };
}

/** The nodes, subgraphs and edges of one generated Mermaid file. */
function mermaid(text) {
  const nodes = new Map();
  const subgraphs = new Map();
  const edges = [];
  for (const line of text.split('\n')) {
    let m;
    if ((m = /^\s*subgraph (\S+)\["(.*)"\]$/u.exec(line))) subgraphs.set(m[1], m[2]);
    else if ((m = /^\s*(\S+) -->\|([^|]+)\| (\S+)$/u.exec(line))) edges.push({ from: m[1], key: m[2], to: m[3] });
    else if ((m = /^\s*(\S+)\["(.*)"\]$/u.exec(line))) nodes.set(m[1], m[2]);
  }
  return { edges, nodes, subgraphs };
}

test('examples/blueprints/ holds the three blueprints and its README names each', () => {
  const folders = fs.readdirSync(FOLDER, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  assert.deepEqual(folders, BLUEPRINTS.map((b) => b.folder).sort());
  const readme = fs.readFileSync(path.join(FOLDER, 'README.md'), 'utf8');
  for (const { folder } of BLUEPRINTS) assert.match(readme, new RegExp(`\\[${folder}/\\]\\(${folder}/README\\.md\\)`, 'u'));
});

for (const { folder, architecture } of BLUEPRINTS) {
  test(`blueprint ${folder}/`, { skip: SKIP }, async (t) => {
    const source = path.join(FOLDER, folder);
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `agsc-blueprint-${folder}-`));
    t.after(() => fs.rmSync(scratch, { force: true, recursive: true }));
    fs.writeFileSync(path.join(scratch, '.gitconfig-empty'), '');
    const env = environment(scratch);
    const dir = path.join(scratch, folder);
    fs.cpSync(source, dir, { recursive: true });
    const agsc = (...args) => run(process.execPath, [AGSC, ...args], dir, env);
    for (const args of [['init', '-q', '-b', 'main'], ['add', '-A'], ['commit', '-q', '--allow-empty', '-m', folder]]) {
      assert.equal(run('git', args, dir, env).status, 0, `git ${args[0]} failed`);
    }

    await t.test('lint, ci and conform --level 2 pass with no warning, and two builds write the same bytes', () => {
      for (const verb of [['lint'], ['ci'], ['conform', '--level', '2']]) {
        const r = agsc(...verb);
        assert.equal(r.status, 0, r.out);
        assert.match(r.out, new RegExp(`^${verb[0]}: pass \\(0 error, 0 warn\\)$`, 'mu'), r.out);
      }
      assert.equal(agsc('build').status, 0);
      const once = tree(path.join(dir, 'www'));
      fs.rmSync(path.join(dir, 'www'), { recursive: true });
      assert.equal(agsc('build').status, 0);
      assert.deepEqual(tree(path.join(dir, 'www')), once);
    });

    const harness = path.join(dir, 'dist', 'harness');
    const companion = () => path.join(harness, fs.readdirSync(harness).find((n) => n.endsWith('.companion')));
    let blueprint;
    await t.test('compose --from writes the blueprint beside the Harness, never in it or its archive, the same bytes twice', () => {
      const r = agsc('compose', '--from', architecture, '--brief', '--zip');
      assert.equal(r.status, 0, r.out);
      assert.match(r.out, /^compose: pass \(0 error, \d+ warn\)$/mu);
      // The only warnings are the outside systems, named under `uses` and kept out of the selection.
      for (const line of r.out.split('\n').filter((l) => l.startsWith('warn:'))) assert.match(line, /AGSC-E803 .* under `uses`/u);
      blueprint = tree(path.join(companion(), 'blueprint'));
      const names = fs.readdirSync(harness);
      const harnessDir = names.find((n) => !n.includes('.'));
      const archive = names.find((n) => n.endsWith('.zip'));
      assert.ok(!fs.existsSync(path.join(harness, harnessDir, 'blueprint')));
      assert.ok(!fs.readFileSync(path.join(harness, archive)).includes('build-plan.md'));
      const zipBytes = fs.readFileSync(path.join(harness, archive));
      fs.rmSync(harness, { recursive: true });
      assert.equal(agsc('compose', '--from', architecture, '--brief', '--zip').status, 0);
      assert.deepEqual(tree(path.join(companion(), 'blueprint')), blueprint);
      assert.deepEqual(fs.readFileSync(path.join(harness, archive)), zipBytes);
    });

    const { items, selection } = bundleOf(source, architecture);
    const text = (name) => blueprint.get(name).toString('utf8');

    await t.test('the three C4 levels agree with one another and with the selection', () => {
      const [l1, l2, l3] = ['c4-context.mmd', 'c4-containers.mmd', 'c4-components.mmd'].map((n) => mermaid(text(n)));
      const title = /^title: (.+)$/mu.exec(items.get(architecture).text)[1];
      // Level 1: the system is the architecture; every other node is listed and outside the selection.
      assert.equal(l1.nodes.get('system'), title);
      for (const [id, label] of l1.nodes) if (id !== 'system') assert.ok(items.has(label) && !selection.includes(label), `level 1 draws ${label}`);
      assert.ok(l1.edges.every((e) => e.from === 'system' && l1.nodes.has(e.to)));
      // Level 2: one box named by the architecture, holding exactly the Concepts of the selection.
      assert.deepEqual([...l2.subgraphs], [['system', title]]);
      const concepts = selection.filter((s) => items.get(s).type === 'concept');
      assert.deepEqual([...l2.nodes.values()].sort(), [...concepts].sort());
      assert.ok(l2.edges.every((e) => l2.nodes.has(e.from) && l2.nodes.has(e.to)));
      // Level 3: every other member, each inside the box of a level-2 node, and edges that reach level 2 or 3 only.
      const others = selection.filter((s) => items.get(s).type !== 'concept');
      assert.deepEqual([...l3.nodes.values()].sort(), [...others].sort());
      for (const [id, label] of l3.subgraphs) assert.equal(l2.nodes.get(id.replace(/c$/u, '')), label, `level 3 box ${label} is no level-2 node`);
      for (const e of l3.edges) {
        assert.ok(l3.nodes.has(e.from) || l3.nodes.has(e.to));
        for (const end of [e.from, e.to]) assert.ok(l3.nodes.has(end) || l2.nodes.has(end), `level 3 edge end ${end}`);
      }
    });

    await t.test('every decision has a record, and every record names the options that were considered', () => {
      const decisions = [...items].filter(([, i]) => i.kind === 'decision').map(([slug]) => slug).sort();
      const records = [...blueprint.keys()].filter((n) => n.startsWith('decisions/'));
      assert.deepEqual(records.map((n) => n.replace(/^decisions\/\d{4}-/u, '').replace(/\.md$/u, '')), decisions);
      for (const record of records) {
        const options = /## Considered options\n\n([\s\S]*?)\n## Decision\n/u.exec(text(record));
        assert.ok(options, `${record} quotes no considered options`);
        assert.ok((options[1].match(/^\d+\. /gmu) || []).length >= 2, `${record} names fewer than two options`);
        assert.match(text(record), /^## Decision Outcome$/mu);
      }
    });

    await t.test('the build plan has one step per member, and every part is verified by a check', () => {
      const plan = text('build-plan.md');
      const steps = [...plan.matchAll(/^### Step \d+ — adopt `([^`]+)`\n\n- Needs: (.*)\n- Verified by: (.*)$/gmu)];
      assert.deepEqual(steps.map((m) => m[1]).sort(), [...selection].sort());
      for (const [, slug, , verified] of steps) {
        if (items.get(slug).kind === 'spec') assert.notEqual(verified, 'no check authored', `part ${slug} has no check`);
      }
    });

    await t.test('the page of the architecture links the compose page, which offers the blueprint as an archive', () => {
      const page = fs.readFileSync(path.join(dir, 'www', 'concepts', architecture, 'index.html'), 'utf8');
      assert.ok(page.includes(`/compose/?from=${architecture}`));
      assert.ok(fs.existsSync(path.join(dir, 'www', 'compose', 'index.html')));
    });

    // Publisher and book names, private paths and owner-addressed text are public-hygiene's sweep of
    // the whole tree (tools/public-hygiene, run in CI); this adds the words a blueprint never uses.
    await t.test('the authored text keeps the public-text rules', () => {
      const files = [...tree(source)].map(([name, bytes]) => [`${folder}/${name}`, bytes]);
      files.push(['README.md', fs.readFileSync(path.join(FOLDER, 'README.md'))]);
      for (const [name, bytes] of files) {
        const words = bytes.toString('utf8').replace(/standard (input|output|error)/giu, '');
        assert.doesNotMatch(words, /\b(first|unique|standard|paid|price|pricing)\b/iu, name);
        assert.doesNotMatch(words, /\b1\.2\b/u, name);
      }
    });

    await t.test('the README\'s "Build from this" dry run runs offline and prints what it quotes', () => {
      const [walk] = parse(fs.readFileSync(path.join(source, 'README.md'), 'utf8'), { whole: `${folder}/README.md` });
      assert.ok(walk && walk.steps.length >= 4, 'the README holds no runnable dry run');
      check(walk, { epoch: EPOCH, prefix: `agsc-blueprint-readme-${folder}-` });
    });
  });
}
