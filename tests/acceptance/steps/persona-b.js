'use strict';
// verifies AGSC-04-02, AGSC-08-10, AGSC-08-30, AGSC-11-14
// Steps of features/persona-b-contributor.feature that run offline: the edit link
// a contributor follows, and the `ci` lane a change runs through, under a preload
// that refuses every network call (so no model service can be reached either).

const assert = require('node:assert');

const { built, linkset, splitItem } = require('./_world.js');

const TARGET = 'https://github.com/andreibesleaga/AgenticSystemCore.com';
const CONTRIBUTE = 'https://w3id.org/agentic-system-core/rel#contribute';

module.exports = [
  {
    pattern: 'the Bundle names the contribution target "https://github.com/andreibesleaga/AgenticSystemCore.com" with mode "pr"',
    run(world) {
      world.bundle();
      assert.deepStrictEqual(JSON.parse(world.read('agsc.config.json')).contribute, [{ mode: 'pr', target: TARGET }]);
    },
  },
  {
    pattern: 'the item "content/concepts/a2a.md" exists with a valid "prov" block',
    run(world) {
      const { prov } = splitItem(world.read('content/concepts/a2a.md')).frontmatter;
      assert.strictEqual(prov.origin, 'human');
      assert.match(prov.operator, /^human:/u);
      const lint = world.agsc(['lint', '--json']);
      assert.strictEqual(lint.exit, 0, lint.stdout + lint.stderr);
    },
  },
  {
    pattern: 'the contributor reads the "Propose an edit" link on "/concepts/a2a/"',
    run(world) {
      built(world);
      world.state.page = world.read('www/concepts/a2a/index.html');
      const m = /<a href="([^"]+)"([^>]*)>Propose an edit<\/a>/u.exec(world.state.page);
      assert.ok(m, 'the page offers no "Propose an edit" link');
      world.state.edit = { attributes: m[2], href: m[1] };
    },
  },
  {
    pattern: 'it points at "https://github.com/andreibesleaga/AgenticSystemCore.com/edit/HEAD/content/concepts/a2a.md", the forge\'s edit view of the default branch',
    run(world) {
      assert.strictEqual(world.state.edit.href, `${TARGET}/edit/HEAD/content/concepts/a2a.md`);
    },
  },
  {
    pattern: 'it is a plain anchor: the page has no form, and nothing it loads comes from another origin',
    run(world) {
      const page = world.state.page;
      assert.doesNotMatch(world.state.edit.attributes, /\bon[a-z]+=/u);
      assert.doesNotMatch(page, /<form\b/u);
      // What a page LOADS: scripts, stylesheets, images, frames and icons.
      const loaded = [
        ...page.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gu),
        ...page.matchAll(/<(?:img|iframe|source|audio|video)\b[^>]*\bsrc="([^"]+)"/gu),
        ...page.matchAll(/<link\b[^>]*\brel="(?:stylesheet|icon|preload|modulepreload)"[^>]*\bhref="([^"]+)"/gu),
      ].map((m) => m[1]);
      assert.ok(loaded.length > 0, 'the page loads nothing, so the check proves nothing');
      for (const url of loaded) assert.match(url, /^\/(?!\/)/u, `${url} is loaded from another origin`);
    },
  },
  {
    pattern: 'the discovery document names the same target as its "…rel#contribute" link with mode "pr" (AGSC-11-14)',
    run(world) {
      assert.deepStrictEqual(linkset(world).linkset[0][CONTRIBUTE], [{ 'agsc-contribute-mode': ['pr'], href: TARGET }]);
      assert.ok(world.state.edit.href.startsWith(`${TARGET}/`));
    },
  },
  {
    pattern: 'the contributor\'s change adds a concept with no description',
    run(world) {
      world.write('content/concepts/retry-budget.md', ['---', 'type: concept', 'title: Retry budget',
        'clusters:', '  - agent-patterns', 'prov:', '  origin: human', '  operator: human:contributor', 'kind: explainer',
        '---', '', 'Every tool call gets a small, fixed number of retries.', ''].join('\n'));
    },
  },
  {
    pattern: 'the change runs "npx agentic-system-core ci"',
    run(world) {
      world.state.ci = world.agsc(['ci', '--json'], { offline: true });
      assert.strictEqual(world.state.ci.exit, 0, world.state.ci.stdout + world.state.ci.stderr);
      world.state.gate = JSON.parse(world.read('dist/gate.json'));
    },
  },
  {
    pattern: 'ci runs lint, build, verify and forge, and "dist/gate.json" records each check with its findings (AGSC-08-10)',
    run(world) {
      const { gate } = world.state;
      assert.deepStrictEqual(gate.checks.map((c) => [c.name, c.status]),
        [['lint', 'pass'], ['build', 'pass'], ['verify', 'pass'], ['forge', 'pass']]);
      const lint = gate.checks.find((c) => c.name === 'lint');
      assert.ok(lint.findings.some((f) => f.code === 'AGSC-E408' && f.file === 'content/concepts/retry-budget.md'
        && f.severity === 'warn'), JSON.stringify(lint.findings));
      assert.strictEqual(gate.status, 'pass');
    },
  },
  {
    pattern: 'two builds of the same change give the same bytes, which ci compares before it passes (AGSC-04-02)',
    run(world) {
      built(world, { offline: true });
      const first = world.snapshot('www');
      built(world, { offline: true });
      assert.deepStrictEqual(world.snapshot('www'), first);
      // `ci` itself builds twice and compares (a difference is AGSC-E602); its pass says it found none.
      assert.ok(!world.state.gate.checks.some((c) => c.findings.some((f) => f.code === 'AGSC-E602')));
    },
  },
  {
    pattern: 'every finding names its file, line and column',
    run(world) {
      const findings = world.state.gate.checks.flatMap((c) => c.findings);
      assert.ok(findings.length > 0);
      for (const f of findings) {
        assert.ok(typeof f.file === 'string' && f.file !== '', JSON.stringify(f));
        assert.ok(Number.isInteger(f.line) && f.line >= 1, JSON.stringify(f));
        assert.ok(Number.isInteger(f.col) && f.col >= 1, JSON.stringify(f));
      }
    },
  },
  {
    pattern: 'no model or network call occurs anywhere in this lane (AGSC-08-30)',
    run(world) {
      for (const verb of ['lint', 'build', 'verify']) {
        const r = world.agsc([verb], { offline: true });
        assert.strictEqual(r.exit, 0, `${verb}: ${r.stdout}${r.stderr}`);
      }
      assert.deepStrictEqual(world.networkAttempts(), []);
    },
  },
];
