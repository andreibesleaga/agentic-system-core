'use strict';
/* global document */
// verifies AGSC-07-05, AGSC-07-06, AGSC-07-07, AGSC-07-12, AGSC-07-13, AGSC-07-25, AGSC-07-26, AGSC-07-27, AGSC-07-28, AGSC-07-29, AGSC-07-30, AGSC-09-94
// Steps of features/persona-e-architect.feature. Offline: the page's own module,
// `www/compose/agsc-core.js`, is evaluated in a fresh `node:vm` context that holds
// the language and nothing else (no require, no process, no fetch, no document) and
// is fed what `/compose/` fetches — the discovery document and `/graph.jsonld` —
// exactly as `www/compose/agsc-compose.js` feeds it; its Harness is compared byte for
// byte with the real command line's. `run --dry-run` and `trace` run through the
// real command line under the network trap. In a browser (`_browser.js`): the
// architect ticks items on the served `/compose/` page, reads its panel and takes
// its downloads. The context map (AGSC-07-30), the brief (AGSC-07-25) and the blueprint of a
// saved architecture (AGSC-07-29) are read from the companion directory the command line writes
// beside the Harness; the brief on the architecture's page from the build.

const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { ROOT, built, linkset, splitItem } = require('./_world.js');
const browser = require('./_browser.js');
const archive = require('../../../src/composition/archive.js');

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

/** The four files of the brief (AGSC-07-25). */
const BRIEF_FILES = Object.freeze(['BRIEF.md', 'brief.json', 'brief.mmd', 'context.md']);

/** The one companion directory under `dist/harness/` and its files; records the Harness directory beside it. */
function companionFiles(world) {
  const harness = path.join(world.dir, 'dist', 'harness');
  const companions = fs.readdirSync(harness).filter((name) => name.endsWith('.companion'));
  assert.strictEqual(companions.length, 1, `companion directories: ${companions}`);
  world.state.harnessDir = path.join(harness, companions[0].slice(0, -'.companion'.length));
  return tree(path.join(harness, companions[0]));
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
      // The site emits the algebra with the brief (AGSC-07-25), which the page tool `brief` runs (AGSC-09-13).
      assert.strictEqual(core, browser.bundle({ brief: true, specVersion: spec }), 'the emitted module is not the bundled module set');
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
  {
    pattern: /^the clusters "([^"]+)" and "([^"]+)" are declared contexts, and "([^"]+)" moves to "\2" by its "domain_context" \(AGSC-01-41, AGSC-08-32\)$/u,
    run(world, first, second, moved) {
      const config = JSON.parse(world.read('agsc.config.json'));
      const contexts = [first, second].map((cluster) => ({ cluster, namespace: `${config.site.base}ns/${cluster}#` }));
      world.write('agsc.config.json', `${JSON.stringify({ ...config, domain: { contexts } }, null, 2)}\n`);
      const rel = `content/concepts/${moved}.md`;
      world.write(rel, world.read(rel).replace(/\n---\n/u, `\ndomain_context: ${second}\n---\n`));
      assert.strictEqual(splitItem(world.read(rel)).frontmatter.domain_context, second);
    },
  },
  {
    pattern: /^the item "([^"]+)" takes the title of "([^"]+)"$/u,
    run(world, slug, other) {
      const rel = `content/concepts/${slug}.md`;
      const title = splitItem(world.read(`content/concepts/${other}.md`)).frontmatter.title;
      world.write(rel, world.read(rel).replace(/^title: .*$/mu, `title: ${title}`));
      assert.strictEqual(splitItem(world.read(rel)).frontmatter.title, title);
    },
  },
  {
    pattern: /^the item "([^"]+)" moves to the context "([^"]+)" of "([^"]+)" \(AGSC-08-32\)$/u,
    run(world, slug, context, other) {
      const rel = `content/concepts/${slug}.md`;
      world.write(rel, world.read(rel).replace(/^domain_context: .*$/mu, `domain_context: ${context}`));
      const fm = (name) => splitItem(world.read(`content/concepts/${name}.md`)).frontmatter;
      assert.strictEqual(fm(slug).domain_context, context);
      assert.ok((fm(other).clusters || [])[0] === context || fm(other).domain_context === context, `${other} is not in ${context}`);
    },
  },
  {
    pattern: /^the peer "([^"]+)" is a "([^"]+)" whose crosswalk "([^"]+)" maps "([^"]+)" to "([^"]+)" \(AGSC-11-24\)$/u,
    run(world, url, relationship, crosswalk, slug, peerIri) {
      const config = JSON.parse(world.read('agsc.config.json'));
      world.write('agsc.config.json', `${JSON.stringify({ ...config, peers: [{ crosswalk, relationship, url }] }, null, 2)}\n`);
      world.write(crosswalk, `@prefix skos: <http://www.w3.org/2004/02/skos/core#> .\n<${config.site.base}concepts/${slug}/> skos:exactMatch <${peerIri}> .\n`);
    },
  },
  {
    pattern: /^the companion directory beside the Harness holds "context-map\.json" alone, with "([^"]+)" in "([^"]+)", "([^"]+)" in "([^"]+)", the Link "([^"]+)" across them and the peer's crosswalk \(AGSC-07-30\)$/u,
    run(world, a, contextA, b, contextB, link) {
      const harness = path.join(world.dir, 'dist', 'harness');
      const companions = fs.readdirSync(harness).filter((name) => name.endsWith('.companion'));
      assert.strictEqual(companions.length, 1, `companion directories: ${companions}`);
      const files = tree(path.join(harness, companions[0]));
      assert.deepStrictEqual([...files.keys()], ['context-map.json']);
      const map = JSON.parse(files.get('context-map.json'));
      const membersOf = (name) => (map.contexts.find((c) => c.name === name) || { members: [] }).members;
      assert.ok(membersOf(contextA).includes(a) && membersOf(contextB).includes(b), files.get('context-map.json'));
      const [source, key, target] = link.split(' ');
      assert.deepStrictEqual(map.cross_context_links, [{ key, source, source_context: contextA, target, target_context: contextB }]);
      const config = JSON.parse(world.read('agsc.config.json'));
      assert.deepStrictEqual(map.peers.map((p) => [p.url, p.relationship, p.crosswalk.length]),
        config.peers.map((p) => [p.url, p.relationship, 1]));
      world.state.harnessDir = path.join(harness, companions[0].slice(0, -'.companion'.length));
    },
  },
  {
    pattern: 'the same composition on the node without contexts writes the same seven file kinds, byte for byte, and no companion directory (AGSC-07-30)',
    run(world) {
      const config = JSON.parse(world.read('agsc.config.json'));
      delete config.domain;
      world.write('agsc.config.json', `${JSON.stringify(config, null, 2)}\n`);
      const r = world.agsc(['compose', 'handoff', '--out', 'plain-harness'], { offline: true });
      assert.strictEqual(r.exit, 0, r.stdout + r.stderr);
      assert.ok(!world.exists('plain-harness.companion'), 'a node with no contexts got a companion directory');
      assert.deepStrictEqual(tree(path.join(world.dir, 'plain-harness')), tree(world.state.harnessDir));
    },
  },
  {
    pattern: /^the companion directory beside the Harness holds the four files of the brief, whose dependency order puts "([^"]+)" before "([^"]+)" \(AGSC-07-25, AGSC-07-26\)$/u,
    run(world, first, second) {
      const files = companionFiles(world);
      assert.deepStrictEqual([...files.keys()], BRIEF_FILES);
      const record = JSON.parse(files.get('brief.json'));
      assert.deepStrictEqual(record.order, [first, second]);
      assert.ok(files.get('BRIEF.md').includes(`1. \`${first}\`\n2. \`${second}\``), files.get('BRIEF.md'));
      assert.ok(!tree(world.state.harnessDir).has('brief.json'), 'the brief is inside the Harness directory');
      world.state.brief = record;
    },
  },
  {
    pattern: /^the brief's checklist adopts "([^"]+)" and then "([^"]+)" \(AGSC-07-27\)$/u,
    run(world, first, second) {
      const adopt = world.state.brief.checklist.filter((entry) => entry.kind === 'adopt').map((entry) => entry.slug);
      assert.deepStrictEqual(adopt, [first, second]);
    },
  },
  {
    pattern: 'the same composition without "--brief" writes the same seven file kinds, byte for byte, and no companion directory (AGSC-07-25)',
    run(world) {
      const r = world.agsc(['compose', ...world.state.brief.selection.filter((slug) => world.state.brief.items
        .find((item) => item.slug === slug).reason.kind === 'selected'), '--out', 'plain-harness'], { offline: true });
      assert.strictEqual(r.exit, 0, r.stdout + r.stderr);
      assert.ok(!world.exists('plain-harness.companion'), 'a composition without --brief got a companion directory');
      assert.deepStrictEqual(tree(path.join(world.dir, 'plain-harness')), tree(world.state.harnessDir));
    },
  },
  {
    pattern: 'the companion directory beside the Harness holds the four files of the brief and no "narration.md" (AGSC-07-28)',
    run(world) {
      assert.deepStrictEqual([...companionFiles(world).keys()], BRIEF_FILES);
    },
  },
  {
    pattern: /^the Bundle holds a chain of (\d+) Concepts, "chain-\d+" requiring "chain-\d+" and so on down to "chain-0"$/u,
    run(world, count) {
      for (let i = 0; i < Number(count); i += 1) {
        world.write(`content/concepts/chain-${i}.md`, ['---', 'type: concept', `title: Chain item ${i}`,
          `description: Item ${i} of a chain of requires Links, each needing the one before it.`, 'clusters:', '  - agent-patterns',
          'prov:', '  origin: human', '  operator: human:andreibesleaga', ...(i === 0 ? [] : ['requires:', `  - chain-${i - 1}`]),
          '---', '', `# Chain item ${i}`, '', 'Body.', ''].join('\n'));
      }
    },
  },
  {
    pattern: 'no Harness and no brief was written (AGSC-07-25)',
    run(world) {
      assert.ok(!world.exists('dist/harness'), 'a run the brief stopped wrote a Harness or a brief');
    },
  },
  {
    pattern: /^the worked blueprint "([^"]+)" of "examples\/blueprints\/" is copied into a scratch folder with a git history$/u,
    run(world, folder) {
      world.dir = world.temp(`agsc-acc-blueprint-${folder}-`);
      fs.cpSync(path.join(ROOT, 'examples', 'blueprints', folder), world.dir, { recursive: true });
      world.commitAll(folder);
    },
  },
  {
    pattern: 'the blueprint beside the Harness holds the three C4 levels, one decision record for each decision of the Bundle naming at least two considered options, and a build plan in which every step names what verifies it (AGSC-07-29)',
    run(world) {
      const files = companionFiles(world);
      for (const level of ['c4-context.mmd', 'c4-containers.mmd', 'c4-components.mmd']) assert.ok(files.has(`blueprint/${level}`), level);
      const concepts = path.join(world.dir, 'content', 'concepts');
      const decisions = fs.readdirSync(concepts).filter((name) => /^kind: decision$/mu.test(world.read(`content/concepts/${name}`)))
        .map((name) => name.replace(/\.md$/u, '')).sort();
      assert.ok(decisions.length > 0, 'the blueprint declares no decision');
      const records = [...files.keys()].filter((name) => name.startsWith('blueprint/decisions/'));
      assert.deepStrictEqual(records.map((n) => n.replace(/^blueprint\/decisions\/\d{4}-/u, '').replace(/\.md$/u, '')).sort(), decisions);
      for (const record of records) {
        const options = /## Considered options\n\n([\s\S]*?)\n## Decision\n/u.exec(files.get(record));
        assert.ok(options && (options[1].match(/^\d+\. /gmu) || []).length >= 2, `${record} names fewer than two options`);
      }
      const steps = [...files.get('blueprint/build-plan.md').matchAll(/^### Step \d+ — adopt `[^`]+`\n\n- Needs: .*\n- Verified by: (.*)$/gmu)];
      assert.ok(steps.length > 0, 'the build plan has no step');
      for (const [, verified] of steps) assert.notStrictEqual(verified.trim(), '');
      assert.ok(![...tree(world.state.harnessDir).keys()].some((name) => name.startsWith('blueprint/')), 'the blueprint is inside the Harness directory');
    },
  },
  {
    pattern: /^the Bundle holds the saved architecture "([^"]+)" selecting "([^"]+)" and "([^"]+)", and the node is rebuilt$/u,
    run(world, slug, a, b) {
      world.write(`content/concepts/${slug}.md`, ['---', 'type: concept', 'kind: architecture', `title: The ${slug}`,
        'description: A saved architecture, the selection of a starting design kept as an item.', 'clusters:', '  - agent-patterns',
        'prov:', '  origin: human', '  operator: human:andreibesleaga', '---', '', `# The ${slug}`, '',
        '```yaml agsc-selection', `- ${a}`, `- ${b}`, '```', ''].join('\n'));
      const r = built(world);
      assert.strictEqual(r.exit, 0, r.stdout + r.stderr);
    },
  },
  {
    pattern: /^the companion directory beside the Harness holds the brief and the blueprint: the three C4 levels and a build plan whose first step adopts "([^"]+)" \(AGSC-07-29\)$/u,
    run(world, first) {
      const files = companionFiles(world);
      assert.deepStrictEqual([...files.keys()], [...BRIEF_FILES, 'blueprint/build-plan.md', 'blueprint/c4-components.mmd',
        'blueprint/c4-containers.mmd', 'blueprint/c4-context.mmd'].sort());
      assert.ok(files.get('blueprint/build-plan.md').includes(`### Step 1 — adopt \`${first}\``), files.get('blueprint/build-plan.md'));
      assert.ok(![...tree(world.state.harnessDir).keys()].some((name) => name.startsWith('blueprint/')), 'the blueprint is inside the Harness directory');
    },
  },
  {
    pattern: /^the page "([^"]+)" shows the brief of the composition and links "([^"]+)" \(AGSC-07-25, AGSC-07-24\)$/u,
    run(world, route, compose) {
      const page = world.read(`www${route}index.html`);
      assert.ok(page.includes('<h2 id="composition-brief">Brief of this architecture</h2>'), 'the page shows no brief');
      assert.ok(page.includes(`<a href="${compose}">`), `the page does not link ${compose}`);
    },
  },
  {
    pattern: 'the architect opens "/compose/" to take downloads and ticks the Concept "handoff"',
    async run(world) {
      await composePage(world, { acceptDownloads: true });
      await select(world, ['handoff']);
    },
  },
  {
    pattern: /^the page shows the verdict in words and the brief, whose dependency order puts "([^"]+)" before "([^"]+)" \(AGSC-07-25, AGSC-07-26\)$/u,
    async run(world, first, second) {
      const { page } = world.state.compose;
      await page.waitForSelector('#brief-order:not([hidden])', { timeout: 10000 });
      const words = await page.evaluate(() => document.getElementById('verdict-words').textContent);
      assert.match(words, /^Items in the selection: 2\. Added by closure: 1\..* The composition is valid\.$/u);
      assert.deepStrictEqual(await panelList(world, 'brief-order'), [`Supervisor (${first})`, `Handoff (${second})`]);
    },
  },
  {
    pattern: '"Download the brief (.zip)" gives, byte for byte, the archive of the four files "agsc compose handoff --brief" writes (AGSC-07-13)',
    async run(world) {
      const { page } = world.state.compose;
      await page.waitForSelector('#brief-archive a', { timeout: 10000 });
      assert.strictEqual(await page.evaluate(() => document.querySelector('#brief-archive a').textContent), 'Download the brief (.zip)');
      const [download] = await Promise.all([page.waitForEvent('download'), page.click('#brief-archive a')]);
      const bytes = fs.readFileSync(await download.path());
      const r = world.agsc(['compose', 'handoff', '--brief'], { offline: true });
      assert.strictEqual(r.exit, 0, r.stdout + r.stderr);
      const files = companionFiles(world);
      const instant = linkset(world).linkset[0].describedby.find((l) => l['agsc-generated-at'])['agsc-generated-at'][0];
      assert.ok(bytes.equals(Buffer.from(archive.archiveBytes(files, { instant }).bytes)), 'the page archive differs from the archive of the CLI brief');
    },
  },
];
