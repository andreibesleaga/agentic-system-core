'use strict';
/* global document */
// verifies AGSC-07-05, AGSC-07-06, AGSC-07-07, AGSC-07-12, AGSC-07-13, AGSC-09-94
// Steps of features/persona-e-architect.feature. Offline: the page's own module,
// `www/compose/agsc-core.js`, is evaluated in a fresh `node:vm` context that holds
// the language and nothing else (no require, no process, no fetch, no document) and
// is fed what `/compose/` fetches — the discovery document and `/graph.jsonld` —
// exactly as `www/compose/agsc-compose.js` feeds it; its Harness is compared byte for
// byte with the real command line's. `run --dry-run` and `trace` run through the
// real command line under the network trap. In a browser (`_browser.js`): the
// architect ticks items on the served `/compose/` page, reads its panel and takes
// its downloads.

const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { ROOT, built, linkset, splitItem } = require('./_world.js');
const browser = require('./_browser.js');

const SELECTION = ['a2a', 'mcp', 'supervisor'];

/** Every file under a directory, relative path → text, in code-point order. */
function tree(dir) {
  const out = new Map();
  for (const rel of fs.readdirSync(dir, { recursive: true }).map(String).sort()) {
    const at = path.join(dir, rel);
    if (fs.statSync(at).isFile()) out.set(rel.split(path.sep).join('/'), fs.readFileSync(at, 'utf8'));
  }
  return out;
}

/** The two constants `agsc-compose.js` hands the core, read from the emitted page script. */
function pageConstant(script, name) {
  const m = new RegExp(`var ${name} = "([^"]*)";`, 'u').exec(script);
  assert.ok(m, `agsc-compose.js declares no ${name}`);
  return m[1];
}


/** A runnable Procedure: one `run` step and the result it expects (AGSC-02-21, AGSC-02-22). */
const PROCEDURE = ['---', 'type: procedure', 'title: Run the tests',
  'description: A tiny runnable procedure that prints one line, so the run verb has something real to list.',
  'when: the architect wants to see what a run would do before running it', 'clusters:', '  - agent-patterns',
  'prov:', '  origin: human', '  operator: human:andreibesleaga', '---', '', '## When', '',
  'Before a change is merged.', '', '## Steps', '', '```run', 'echo hello', '```', '', '```expect', 'hello', '```', '',
  '## Checks', '', 'The step printed what its expect block says.', ''].join('\n');

/** The `verdict:` note `agsc compose <selection>` prints (AGSC-09-12). */
function cliVerdict(world, selection) {
  const r = world.agsc(['compose', ...selection], { offline: true });
  assert.strictEqual(r.exit, 0, r.stdout + r.stderr);
  const line = `${r.stdout}${r.stderr}`.split('\n').find((l) => l.startsWith('verdict: '));
  assert.ok(line, `no verdict line in ${r.stdout}${r.stderr}`);
  return JSON.parse(line.slice('verdict: '.length));
}

/** Add one Link to an item's frontmatter, before its `kind` line. */
function addLink(world, slug, key, target) {
  const rel = `content/concepts/${slug}.md`;
  const text = world.read(rel);
  assert.ok(text.includes('\nkind: pattern\n---'), `${rel} has no kind line to add a Link before`);
  world.write(rel, text.replace('\nkind: pattern\n---', `\n${key}:\n  - ${target}\nkind: pattern\n---`));
}

/** The served `/compose/` page, opened once per scenario, with its item list loaded. */
async function composePage(world, options = {}) {
  if (!world.state.compose) {
    world.state.compose = await browser.open(world, '/compose/', options);
    await world.state.compose.page.waitForSelector('#items input[type="checkbox"]', { timeout: 10000 });
  }
  return world.state.compose;
}

/** Make exactly these items the selection of the `/compose/` page. */
async function select(world, slugs) {
  const { page } = await composePage(world);
  for (const box of await page.$$('#items input[type="checkbox"]:checked')) await box.uncheck();
  for (const slug of slugs) await page.check(`#items input[value="${slug}"]`);
}

/** The text of every entry of one panel list, or null when the list is hidden. */
function panelList(world, id) {
  return world.state.compose.page.evaluate((which) => {
    const list = document.getElementById(which);
    return list.hidden ? null : [...list.querySelectorAll('li')].map((li) => li.textContent);
  }, id);
}

/** The validity line and whether the Harness can be built. */
function validity(world) {
  return world.state.compose.page.evaluate(() => ({
    buildable: !document.getElementById('download').disabled,
    text: document.getElementById('validity').textContent,
  }));
}

module.exports = [
  {
    pattern: '"/compose/" loads "/graph.jsonld" and "www/compose/agsc-core.js"',
    run(world) {
      world.bundle();
      built(world);
      const page = world.read('www/compose/index.html');
      // The page sits at /compose/, so its relative src names /compose/agsc-core.js.
      assert.ok(page.includes('<script src="agsc-core.js">'), 'the page does not load the core module');
      const glue = world.read('www/compose/agsc-compose.js');
      assert.ok(glue.includes("fetch('/graph.jsonld')"), 'the page does not read /graph.jsonld');
      assert.ok(world.exists('www/graph.jsonld'));
    },
  },
  {
    pattern: '"www/compose/agsc-core.js" is the "src/composition/" module set, bundled, with no "node:" import',
    run(world) {
      const core = world.read('www/compose/agsc-core.js');
      const browser = require(path.join(ROOT, 'src', 'composition', 'browser.js'));
      const spec = JSON.parse(world.read('agsc.config.json')).spec_version;
      assert.strictEqual(core, browser.bundle({ specVersion: spec }), 'the emitted module is not the bundled module set');
      assert.doesNotMatch(core, /require\(|\bnode:[a-z]/u);
    },
  },
  {
    pattern: 'the architect runs "npx agentic-system-core compose a2a mcp supervisor --out ./harness-x/" on the CLI',
    run(world) {
      const r = world.agsc(['compose', ...SELECTION, '--out', './harness-x/'], { offline: true });
      assert.strictEqual(r.exit, 0, r.stdout + r.stderr);
      world.state.cli = tree(path.join(world.dir, 'harness-x'));
      assert.ok(world.state.cli.size >= 7, [...world.state.cli.keys()].join(', '));
    },
  },
  {
    pattern: 'separately runs "www/compose/agsc-core.js" as "/compose/" does, over the published "/graph.jsonld", in a context that holds nothing but the language',
    run(world) {
      const context = vm.createContext(Object.create(null));
      vm.runInContext(world.read('www/compose/agsc-core.js'), context, { filename: 'agsc-core.js' });
      for (const name of ['require', 'process', 'fetch', 'document']) {
        assert.strictEqual(vm.runInContext(`typeof ${name}`, context), 'undefined', `${name} is reachable`);
      }
      const core = vm.runInContext('globalThis.AGSC_CORE', context);
      const glue = world.read('www/compose/agsc-compose.js');
      // What start() reads: the build instant from the discovery document, the
      // items from /graph.jsonld; the base is the page's own origin.
      const described = linkset(world).linkset[0].describedby[0];
      const items = core.itemsFromGraph(JSON.parse(world.read('www/graph.jsonld')));
      const result = core.compose(items, SELECTION);
      assert.ok(result.valid, JSON.stringify(result));
      const digest = crypto.createHash('sha256').update(core.selectionDigestInput(result), 'utf8').digest('hex');
      const out = core.emit(result, {
        base: 'https://agenticsystemcore.com/',
        instant: described['agsc-generated-at'][0],
        items,
        licenseProse: pageConstant(glue, 'LICENSE_PROSE'),
        name: core.harnessName(digest),
        selectionDigest: digest,
        specVersion: pageConstant(glue, 'SPEC_VERSION'),
      });
      world.state.page = new Map([...out.files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    },
  },
  {
    pattern: 'the Harness files from both paths are the same files, byte for byte (AGSC-07-13)',
    run(world) {
      assert.deepStrictEqual([...world.state.page.keys()], [...world.state.cli.keys()]);
      for (const [rel, text] of world.state.cli) {
        assert.strictEqual(world.state.page.get(rel), text, `${rel} differs between the page and the command line`);
      }
      assert.deepStrictEqual(world.networkAttempts(), []);
    },
  },
  {
    pattern: 'the architect ticks the Concept "handoff" on "/compose/"',
    async run(world) {
      await select(world, ['handoff']);
      await world.state.compose.page.waitForSelector('#explanations:not([hidden])', { timeout: 10000 });
    },
  },
  {
    pattern: 'the panel\'s list "Why an item was added" reads "supervisor was added: handoff requires supervisor"',
    async run(world) {
      const { page } = world.state.compose;
      assert.strictEqual(await page.evaluate(() => document.getElementById('explanations-heading').textContent), 'Why an item was added');
      assert.deepStrictEqual(await panelList(world, 'explanations'), ['supervisor was added: handoff requires supervisor']);
    },
  },
  {
    pattern: 'the verdict the page shows equals the one "agsc compose handoff" prints, with the path from the selection to "supervisor"',
    async run(world) {
      const shown = JSON.parse(await world.state.compose.page.evaluate(() => document.getElementById('verdict').textContent));
      const cli = cliVerdict(world, ['handoff']);
      assert.deepStrictEqual(shown, cli);
      assert.deepStrictEqual(shown.added, [{ path: [['handoff', 'requires', 'supervisor']], slug: 'supervisor' }]);
      assert.deepStrictEqual(world.state.compose.errors, []);
      assert.deepStrictEqual(world.state.compose.offOrigin, []);
    },
  },
  {
    pattern: 'the Concepts carry an "excludes", a "contradicts" and a "uses" Link, and the node is rebuilt',
    run(world) {
      addLink(world, 'a2a', 'excludes', 'supervisor');
      addLink(world, 'mcp', 'contradicts', 'tool-use-retries');
      addLink(world, 'supervisor', 'uses', 'tool-use-retries');
      built(world);
    },
  },
  {
    pattern: /^the architect has selected two Concepts related by "(excludes|contradicts)"$/u,
    async run(world, key) {
      await select(world, key === 'excludes' ? ['a2a', 'supervisor'] : ['mcp', 'tool-use-retries']);
    },
  },
  {
    pattern: 'a selected Concept has a "uses" target that is not selected',
    async run(world) {
      await select(world, ['supervisor']);
    },
  },
  {
    pattern: 'the closure runs',
    async run(world) {
      // The page composes on every change of the selection; the verdict is the trace.
      await world.state.compose.page.waitForFunction(() => document.getElementById('verdict').textContent !== '', null, { timeout: 10000 });
    },
  },
  {
    pattern: 'the panel reports a mutex conflict naming the violating pair',
    async run(world) {
      assert.deepStrictEqual(await panelList(world, 'conflicts'), ['AGSC-E801 on excludes: a2a / supervisor']);
    },
  },
  {
    pattern: 'the Harness cannot be built from that selection',
    async run(world) {
      const v = await validity(world);
      assert.strictEqual(v.buildable, false);
      assert.match(v.text, /^invalid — no Harness is emitted \(AGSC-07-17\)$/u);
    },
  },
  {
    pattern: 'the panel shows a warning, not a hard error',
    async run(world) {
      assert.strictEqual(await panelList(world, 'conflicts'), null);
      const warnings = await panelList(world, 'warnings');
      assert.strictEqual(warnings.length, 1, JSON.stringify(warnings));
      assert.match(warnings[0], /^AGSC-E803: mcp names tool-use-retries under contradicts, /u);
      assert.deepStrictEqual(await validity(world), { buildable: true, text: 'valid' });
    },
  },
  {
    pattern: 'the panel shows a soft warning for the missing "uses" target',
    async run(world) {
      assert.strictEqual(await panelList(world, 'conflicts'), null);
      const warnings = await panelList(world, 'warnings');
      assert.strictEqual(warnings.length, 1, JSON.stringify(warnings));
      assert.match(warnings[0], /^AGSC-E803: supervisor names tool-use-retries under uses, /u);
      assert.deepStrictEqual(await validity(world), { buildable: true, text: 'valid' });
      assert.deepStrictEqual(world.state.compose.errors, []);
      assert.deepStrictEqual(world.state.compose.offOrigin, []);
    },
  },
  {
    pattern: 'the Bundle holds the Procedure "run-the-tests", and the node is rebuilt',
    run(world) {
      world.write('content/procedures/run-the-tests.md', PROCEDURE);
      const r = built(world);
      assert.ok(!/AGSC-E406/u.test(r.stdout + r.stderr), r.stdout + r.stderr);
    },
  },
  {
    pattern: 'the architect ticks "handoff" and "run-the-tests" on "/compose/" and presses "Build the Harness"',
    async run(world) {
      await composePage(world, { acceptDownloads: true });
      await select(world, ['handoff', 'run-the-tests']);
      const { page } = world.state.compose;
      assert.strictEqual(await page.evaluate(() => document.getElementById('download').textContent), 'Build the Harness');
      await page.click('#download');
      await page.waitForSelector('#archive a', { timeout: 10000 });
    },
  },
  {
    pattern: 'the page offers one download per Harness file, and the files are exactly:',
    async run(world, table) {
      const offered = await world.state.compose.page.evaluate(() => [...document.querySelectorAll('#files li a')]
        .map((a) => ({ download: a.getAttribute('download'), file: a.textContent })));
      const rows = table.rows.slice(1).map((row) => row.cells[0].value);
      const pattern = (row) => new RegExp(`^${row.replace(/[.]/gu, '\\.').replace('<nnnn>', '\\d{4}').replace(/<slug>/gu, '[a-z0-9-]+')}$`, 'u');
      for (const { download, file } of offered) {
        assert.strictEqual(rows.filter((row) => pattern(row).test(file)).length, 1, `${file} matches no single row`);
        assert.ok(download, `${file} is not offered as a download`);
      }
      for (const row of rows) assert.ok(offered.some(({ file }) => pattern(row).test(file)), `no file for ${row}`);
      // The same files, by name, as the command line writes for the same selection.
      const r = world.agsc(['compose', 'handoff', 'run-the-tests', '--out', './harness-cli/'], { offline: true });
      assert.strictEqual(r.exit, 0, r.stdout + r.stderr);
      assert.deepStrictEqual(offered.map((o) => o.file).sort(), [...tree(path.join(world.dir, 'harness-cli')).keys()].sort());
      assert.deepStrictEqual(offered.map((o) => o.file).filter((f) => f.startsWith('skills/')), ['skills/run-the-tests/SKILL.md']);
    },
  },
  {
    pattern: '"Download all (.zip)" gives, byte for byte, the archive "agsc compose handoff run-the-tests --zip" writes (AGSC-07-13)',
    async run(world) {
      const { errors, offOrigin, page } = world.state.compose;
      assert.strictEqual(await page.evaluate(() => document.querySelector('#archive a').textContent), 'Download all (.zip)');
      const [download] = await Promise.all([page.waitForEvent('download'), page.click('#archive a')]);
      const fromPage = fs.readFileSync(await download.path());
      const r = world.agsc(['compose', 'handoff', 'run-the-tests', '--zip'], { offline: true });
      assert.strictEqual(r.exit, 0, r.stdout + r.stderr);
      const harness = path.join(world.dir, 'dist', 'harness');
      const zip = fs.readdirSync(harness).find((n) => n.endsWith('.zip'));
      assert.ok(zip, 'the command line wrote no archive');
      assert.strictEqual(download.suggestedFilename(), zip, 'the page names its archive differently');
      assert.ok(fromPage.equals(fs.readFileSync(path.join(harness, zip))), 'the page\'s archive differs from the command line\'s');
      assert.deepStrictEqual(errors, []);
      assert.deepStrictEqual(offOrigin, []);
    },
  },
  {
    pattern: 'the configuration enables "run" for the program "echo" only',
    run(world) {
      const config = JSON.parse(world.read('agsc.config.json'));
      config.run = { allow: ['echo'], enabled: true };
      world.write('agsc.config.json', `${JSON.stringify(config, null, 2)}\n`);
      world.state.before = world.snapshot();
    },
  },
  {
    pattern: 'no file of the Bundle changed and no network call was attempted (AGSC-09-94)',
    run(world) {
      assert.deepStrictEqual(world.snapshot(), world.state.before);
      assert.deepStrictEqual(world.networkAttempts(), []);
    },
  },
  {
    pattern: /^the captured run record "([a-z0-9-]+\.json)" of an agent run that started at "([0-9T:Z-]+)"$/u,
    run(world, file, started) {
      world.state.record = { actor: 'process:worker', outcome: 'success', started, title: 'First run', tool: 'probe' };
      world.write(file, `${JSON.stringify(world.state.record)}\n`);
    },
  },
  {
    pattern: /^that Episode starts at "([0-9T:Z-]+)", names the record's actor and keeps the record's unknown member under an "x-" name \(AGSC-09-94\)$/u,
    run(world, started) {
      const { frontmatter } = splitItem(world.read('content/episodes/first-run.md'));
      assert.strictEqual(frontmatter.type, 'episode');
      assert.strictEqual(frontmatter.started, started);
      assert.strictEqual(frontmatter.actor, world.state.record.actor);
      assert.strictEqual(frontmatter.outcome, world.state.record.outcome);
      const kept = Object.keys(frontmatter).filter((k) => /^x-[a-z0-9]+-tool$/u.test(k));
      assert.strictEqual(kept.length, 1, JSON.stringify(frontmatter));
      assert.strictEqual(frontmatter[kept[0]], world.state.record.tool);
      assert.ok(!('tool' in frontmatter), 'the unknown member was kept under its own name');
    },
  },
];
