'use strict';
// tests/examples/domain-layer.test.js — examples/demos/domain-layer/ (AGSC-05-38…41, PRD-076).
// The folder is the smallest Bundle that shows the domain layer: a vocabulary of the site, one
// bounded context, one invariant (a SHACL shape) and one competency question. In a scratch copy
// with a git history and a fixed build instant this file proves that:
//
//   * `agsc lint`, `agsc ci` and `agsc conform --level 2` pass with no warning, `agsc verify`
//     passes (the shape and the question both ran), and two builds write the same bytes;
//   * the vocabulary reaches the graph (`graph.nq` holds the domain link and the domain types);
//   * the invariant bites: take the link away and `verify` is `AGSC-E421`; change the expected
//     answer and `verify` is `AGSC-E422`;
//   * `compose` writes the context map beside the Harness, naming the context and its members;
//   * the authored text keeps the public-text rules;
//   * the README's walk-through runs offline and prints the lines it quotes
//     (tests/docs/_page-runner.js).
//
// No network, no model: the page runner refuses every network call.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, SKIP, check, parse } = require('../docs/_page-runner.js');

const FOLDER = path.join(ROOT, 'examples', 'demos', 'domain-layer');
const AGSC = path.join(ROOT, 'bin', 'agsc.js');
/** 2026-09-14T10:00:00Z, the build instant of docs/DEMOS.md. */
const EPOCH = '1789380000';

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

test('examples/demos/domain-layer/ holds a Bundle with the four domain files, and the demos README names it', () => {
  for (const rel of ['README.md', 'agsc.config.json', 'domain/vocabulary.ttl', 'domain/shapes.ttl', 'domain/questions.json', 'content/index.md']) {
    assert.ok(fs.existsSync(path.join(FOLDER, rel)), `${rel} is missing`);
  }
  const readme = fs.readFileSync(path.join(ROOT, 'examples', 'demos', 'README.md'), 'utf8');
  assert.match(readme, /\[domain-layer\/\]\(domain-layer\/README\.md\)/u);
  const config = JSON.parse(fs.readFileSync(path.join(FOLDER, 'agsc.config.json'), 'utf8'));
  assert.equal(config.domain.contexts.length, 1, 'one context');
});

test('examples/demos/domain-layer/ shows the domain layer', { skip: SKIP }, async (t) => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-domain-layer-'));
  t.after(() => fs.rmSync(scratch, { force: true, recursive: true }));
  fs.writeFileSync(path.join(scratch, '.gitconfig-empty'), '');
  const env = environment(scratch);
  const dir = path.join(scratch, 'domain-layer');
  fs.cpSync(FOLDER, dir, { recursive: true });
  const agsc = (...args) => run(process.execPath, [AGSC, ...args], dir, env);
  const git = (...args) => run('git', args, dir, env);
  for (const args of [['init', '-q', '-b', 'main'], ['add', '-A'], ['commit', '-q', '-m', 'domain layer']]) {
    assert.equal(git(...args).status, 0, `git ${args[0]} failed`);
  }

  await t.test('lint, ci, conform --level 2 and verify pass with no warning, and two builds write the same bytes', () => {
    for (const verb of [['lint'], ['ci'], ['conform', '--level', '2'], ['verify']]) {
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

  await t.test('the vocabulary reaches the graph: the domain link and the domain types', () => {
    const graph = fs.readFileSync(path.join(dir, 'www', 'graph.nq'), 'utf8');
    const ns = 'https://domain-layer.example/ns/agent-patterns#';
    assert.ok(graph.includes(`<https://domain-layer.example/concepts/supervisor/> <${ns}controls> <https://domain-layer.example/concepts/handoff/>`));
    assert.ok(graph.includes(`<https://domain-layer.example/concepts/supervisor/> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <${ns}Coordinator>`));
    assert.ok(graph.includes(`<${ns}Handover>`));
  });

  await t.test('the invariant bites (AGSC-E421) and the question is checked (AGSC-E422)', () => {
    const file = path.join(dir, 'content', 'concepts', 'supervisor.md');
    const original = fs.readFileSync(file, 'utf8');
    const without = original.replace(/domain_links:\n {2}controls:\n {4}- handoff\n/u, '');
    assert.notEqual(without, original, 'the link to remove is not where the test looks');
    fs.writeFileSync(file, without);
    const broken = agsc('verify');
    assert.equal(broken.status, 1, broken.out);
    assert.match(broken.out, /AGSC-E421 .*Every coordinator controls at least one handover/u, broken.out);
    fs.writeFileSync(file, original);
    const questions = path.join(dir, 'domain', 'questions.json');
    const text = fs.readFileSync(questions, 'utf8');
    fs.writeFileSync(questions, text.replace('concepts/supervisor/', 'concepts/nobody/'));
    const wrong = agsc('verify');
    assert.equal(wrong.status, 1, wrong.out);
    assert.match(wrong.out, /AGSC-E422 /u, wrong.out);
    fs.writeFileSync(questions, text);
    assert.equal(agsc('verify').status, 0);
  });

  await t.test('compose writes the context map beside the Harness: the context and its members', () => {
    const r = agsc('compose', 'handoff', 'supervisor');
    assert.equal(r.status, 0, r.out);
    const harness = path.join(dir, 'dist', 'harness');
    const companion = path.join(harness, fs.readdirSync(harness).find((n) => n.endsWith('.companion')));
    const map = JSON.parse(fs.readFileSync(path.join(companion, 'context-map.json'), 'utf8'));
    assert.deepEqual(map.contexts.map((c) => [c.name, c.members.slice().sort()]), [['agent-patterns', ['handoff', 'supervisor']]]);
    assert.deepEqual(map.unassigned, []);
  });

  await t.test('the authored text keeps the public-text rules', () => {
    for (const [name, bytes] of tree(FOLDER)) {
      const words = bytes.toString('utf8').replace(/standard (input|output|error)/giu, '');
      assert.doesNotMatch(words, /\b(first|unique|standard|paid|price|pricing)\b/iu, name);
      assert.doesNotMatch(words, /\b1\.2\b/u, name);
    }
  });

  await t.test('the README walk-through runs offline and prints what it quotes', () => {
    const [walk] = parse(fs.readFileSync(path.join(FOLDER, 'README.md'), 'utf8'), { whole: 'domain-layer/README.md' });
    assert.ok(walk && walk.steps.length >= 3, 'the README holds no runnable walk-through');
    check(walk, { epoch: EPOCH, prefix: 'agsc-domain-layer-readme-' });
  });
});
