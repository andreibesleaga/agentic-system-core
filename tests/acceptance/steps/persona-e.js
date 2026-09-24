'use strict';
// verifies AGSC-07-13
// Steps of features/persona-e-architect.feature that run offline. The page's own
// module, `www/compose/agsc-core.js`, is evaluated in a fresh `node:vm` context
// that holds the language and nothing else (no require, no process, no fetch, no
// document) and is fed what `/compose/` fetches — the discovery document and
// `/graph.jsonld` — exactly as `www/compose/agsc-compose.js` feeds it; its Harness
// is compared byte for byte with the real command line's.

const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { ROOT, built, linkset } = require('./_world.js');

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
];
