'use strict';
// verifies AGSC-01-37, AGSC-04-18
// AGSC-01-37: "The configuration input of the build function (AGSC-04-01) is the
// configuration as resolved after these overrides"; AGSC-04-18: the build's input is
// "`agsc.config.json` with the environment overrides of AGSC-01-37 applied". So an
// `AGSC_*` value from the process environment or from the `.env` file reaches the
// built bytes, exactly as the same value written in the file would. The other layers
// (the schema defaults, a user configuration) are not overrides and are not build
// inputs: a build with no override is the build of the file alone.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const helpers = require('../../../src/application/cli/verbs/_helpers.js');
const { agsc, scratch, writeConfig } = require('./_bundle-run.js');

const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
const linksetOf = (dir) => JSON.parse(read(dir, 'www/.well-known/knowledge-linkset'));

/** Every built file as relative path → bytes (base64), for byte comparisons. */
function tree(dir, rel = 'www') {
  const out = new Map();
  const walk = (sub) => {
    for (const entry of fs.readdirSync(path.join(dir, sub), { withFileTypes: true })) {
      const p = `${sub}/${entry.name}`;
      if (entry.isDirectory()) walk(p);
      else out.set(p, fs.readFileSync(path.join(dir, p)).toString('base64'));
    }
  };
  walk(rel);
  return out;
}

test('AGSC_SITE_BASE from the process environment is the base of the built node', async (t) => {
  const dir = scratch(t, 'agsc-envbuild-');
  const run = await agsc(dir, ['build'], { env: { AGSC_SITE_BASE: 'https://env.example/' } });
  assert.strictEqual(run.exit, 0, run.stderr);
  assert.strictEqual(linksetOf(dir).linkset[0].anchor, 'https://env.example/');
  assert.ok(!read(dir, 'www/graph.jsonld').includes('minimal.example'), 'the file\'s base is still in the graph');
  assert.match(read(dir, 'www/sitemap.xml'), /<loc>https:\/\/env\.example\//u);
});

test('AGSC_SITE_TITLE reaches the pages and /llms.txt', async (t) => {
  const dir = scratch(t, 'agsc-envbuild-');
  const run = await agsc(dir, ['build'], { env: { AGSC_SITE_TITLE: 'Title From The Environment' } });
  assert.strictEqual(run.exit, 0, run.stderr);
  assert.ok(read(dir, 'www/llms.txt').startsWith('# Title From The Environment\n'), read(dir, 'www/llms.txt').slice(0, 80));
  // The title and the brand are the configuration's; the body heading is the index's own text.
  assert.match(read(dir, 'www/index.html'), /<title>Title From The Environment<\/title>/u);
  assert.match(read(dir, 'www/concepts/handoff/index.html'), /<a class="brand" href="\/">Title From The Environment<\/a>/u);
});

test('the .env file is a layer too, and the process environment wins over it', async (t) => {
  const dir = scratch(t, 'agsc-envbuild-');
  fs.writeFileSync(path.join(dir, '.env'), 'AGSC_SITE_BASE=https://dotenv.example/\n');
  const fromFile = await agsc(dir, ['build']);
  assert.strictEqual(fromFile.exit, 0, fromFile.stderr);
  assert.strictEqual(linksetOf(dir).linkset[0].anchor, 'https://dotenv.example/');
  const fromProcess = await agsc(dir, ['build'], { env: { AGSC_SITE_BASE: 'https://process.example/' } });
  assert.strictEqual(fromProcess.exit, 0, fromProcess.stderr);
  assert.strictEqual(linksetOf(dir).linkset[0].anchor, 'https://process.example/');
});

test('AGSC_VISIBILITY and AGSC_ACCESS build a restricted node (AGSC-11-20)', async (t) => {
  const dir = scratch(t, 'agsc-envbuild-');
  const run = await agsc(dir, ['build'], { env: { AGSC_ACCESS: 'https://minimal.example/access/', AGSC_VISIBILITY: 'restricted' } });
  assert.strictEqual(run.exit, 0, run.stderr);
  const doc = linksetOf(dir).linkset[0];
  assert.deepStrictEqual(doc.describedby[0]['agsc-visibility'], ['restricted']);
  assert.deepStrictEqual(doc['https://w3id.org/agentic-system-core/rel#access'].map((l) => l.href), ['https://minimal.example/access/']);
});

test('an override that repeats the file\'s value changes no byte; no override builds the file alone', async (t) => {
  const plain = scratch(t, 'agsc-envbuild-');
  const same = scratch(t, 'agsc-envbuild-');
  assert.strictEqual((await agsc(plain, ['build'])).exit, 0);
  assert.strictEqual((await agsc(same, ['build'], { env: { AGSC_SITE_BASE: 'https://minimal.example/', AGSC_SITE_TITLE: 'Minimal Bundle' } })).exit, 0);
  assert.deepStrictEqual(tree(same), tree(plain));
});

test('`verify` rebuilds with the same overrides as `build`, so the two agree', async (t) => {
  const dir = scratch(t, 'agsc-envbuild-');
  const env = { AGSC_SITE_BASE: 'https://env.example/' };
  assert.strictEqual((await agsc(dir, ['build'], { env })).exit, 0);
  const same = await agsc(dir, ['verify'], { env });
  assert.strictEqual(same.exit, 0, same.stdout + same.stderr);
});

test('resolvedConfig applies only the environment layers to the file\'s configuration', () => {
  const file = { agents: [{ kind: 'llm', name: 'editor' }], site: { base: 'https://a.example/', title: 'A' } };
  const ctx = {
    config: {
      agents: [{ budget_usd_month: 3, kind: 'llm', name: 'editor' }, { enabled: true, name: 'reviewer' }],
      build: { out: 'www' },
      run: { enabled: false },
      site: { base: 'https://env.example/', title: 'From user' },
    },
    sources: {
      'agents.editor.budget_usd_month': 'env',
      'agents.reviewer.enabled': 'dotenv',
      'build.out': 'default',
      'run.enabled': 'default',
      'site.base': 'env',
      'site.title': 'user',
    },
  };
  const resolved = helpers.resolvedConfig(file, ctx);
  assert.deepStrictEqual(resolved, {
    agents: [{ budget_usd_month: 3, kind: 'llm', name: 'editor' }, { enabled: true, name: 'reviewer' }],
    site: { base: 'https://env.example/', title: 'A' },
  });
  assert.deepStrictEqual(file.site.base, 'https://a.example/', 'the file\'s object is never changed');
  assert.deepStrictEqual(file.agents, [{ kind: 'llm', name: 'editor' }]);
  assert.strictEqual(helpers.resolvedConfig(file, { config: {}, sources: { 'site.base': 'project' } }), file,
    'with no override the file\'s configuration is used as it is');
  assert.strictEqual(helpers.resolvedConfig(file, {}), file);
});

test('a configuration fault in an override stops the build as one in the file would (AGSC-01-37)', async (t) => {
  const dir = scratch(t, 'agsc-envbuild-');
  writeConfig(dir, (c) => c);
  const run = await agsc(dir, ['build'], { env: { AGSC_VISIBILITY: 'restricted' } });
  assert.notStrictEqual(run.exit, 0, 'a restricted node with no access page was built');
  assert.ok(!fs.existsSync(path.join(dir, 'www')), 'a failed build wrote files');
});
