'use strict';
// verifies AGSC-04-02, AGSC-08-05, AGSC-08-06, AGSC-08-10, AGSC-08-27, AGSC-08-30, AGSC-09-07, AGSC-11-14
// Steps of features/persona-b-contributor.feature that run offline: the edit link
// a contributor follows, the local half of a contribution (the Proposal files
// `propose` writes, a commit signed off under the contributor agreement, and the
// ledger entry the build derives from it), and the `ci` and `review` lanes a
// change runs through, under a preload that refuses every network call (so no
// model service can be reached either).

const assert = require('node:assert');
const path = require('node:path');

const { ROOT, built, linkset, splitItem } = require('./_world.js');

// The trailer grammar of AGSC-08-06 has no verb of its own; the engine's parser is
// the check a forge's CI runs, so the step calls it directly.
const prov = require(path.join(ROOT, 'src', 'governance', 'prov.js'));

const TARGET = 'https://github.com/andreibesleaga/AgenticSystemCore.com';
const CONTRIBUTE = 'https://w3id.org/agentic-system-core/rel#contribute';
/** The outside contributor; the address is joined at run time, never written whole. */
const CONTRIBUTOR = { local: 'ada.contributor', name: 'Ada Contributor' };
const signOff = () => `Signed-off-by: ${CONTRIBUTOR.name} <${[CONTRIBUTOR.local, 'example.org'].join('@')}> (CA-v1)`;

module.exports = [
  {
    pattern: 'the contributor has edited the body of "content/concepts/a2a.md" in the fork',
    run(world) {
      const before = world.read('content/concepts/a2a.md');
      const after = before.replace(/\n## Intent\n\n([^\n]+)\n/u, '\n## Intent\n\n$1 Each agent keeps its own tools private.\n');
      assert.notStrictEqual(after, before, 'the item has no Intent paragraph to edit');
      world.write('content/concepts/a2a.md', after);
    },
  },
  {
    pattern: '"dist/proposal/1.md" opens with the marker "<!-- agsc:proposal v1 -->" and states the rationale, the affected slug "a2a" and "prov.origin" (AGSC-08-05)',
    run(world) {
      const body = world.read('dist/proposal/1.md');
      assert.match(body, /^<!-- agsc:proposal v1 -->\n/u);
      assert.match(body, /## Rationale\n/u);
      assert.match(body, /## Affected slugs\n\n- a2a\n/u);
      assert.match(body, /- prov\.origin: human\n/u);
      assert.ok(world.exists('dist/proposal/1.patch'));
    },
  },
  {
    pattern: 'the contributor commits the change with the trailer "Signed-off-by: <Name> <email> (CA-v1)"',
    run(world) {
      // The content change only: the Proposal files under dist/ are not committed.
      world.git(['add', 'content']);
      world.git(['commit', '-q', '-m', 'Say what each agent keeps private', '-m', signOff()],
        { GIT_AUTHOR_DATE: '2026-01-02T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-02T00:00:00Z' });
      world.state.signed = world.git(['rev-parse', 'HEAD']).trim();
      assert.deepStrictEqual(world.trailers(), [signOff()]);
    },
  },
  {
    pattern: 'the trailer block of that commit passes the sign-off grammar, with the agreement "CA-v1" (AGSC-08-06)',
    run(world) {
      const message = world.git(['log', '-1', '--format=%B', world.state.signed]);
      const { findings, signoff } = prov.checkTrailers(message, { prov: { origin: 'human' } });
      assert.deepStrictEqual(findings, []);
      assert.strictEqual(signoff.name, CONTRIBUTOR.name);
      assert.strictEqual(signoff.agreement, 'CA-v1');
    },
  },
  {
    pattern: 'after "agsc build" the ledger entry of that commit names the contributor from the sign-off, not "human:unknown" (AGSC-08-20a)',
    run(world) {
      built(world, { offline: true });
      const entries = world.read('www/ledger.jsonl').split('\n').filter(Boolean).map((l) => JSON.parse(l));
      const entry = entries.find((e) => e.ref === world.state.signed);
      assert.ok(entry, `no ledger entry names ${world.state.signed}`);
      assert.strictEqual(entry.kind, 'commit');
      assert.strictEqual(entry.actor, `human:${CONTRIBUTOR.local}`);
      // The commit's author is the scratch identity: the actor comes from the sign-off.
      assert.notStrictEqual(world.git(['log', '-1', '--format=%an', world.state.signed]).trim(), CONTRIBUTOR.name);
      assert.deepStrictEqual(world.networkAttempts(), []);
    },
  },
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
    pattern: 'the change runs "npx agentic-system-core review" under the network trap',
    run(world) {
      world.state.review = world.agsc(['review'], { offline: true });
    },
  },
  {
    pattern: 'review exits 0, and its label is the verdict with the counts, "review: pass (0 error, 1 warn)" (AGSC-09-07)',
    run(world) {
      const { review } = world.state;
      assert.strictEqual(review.exit, 0, review.stdout + review.stderr);
      // The label is the one line on standard output; the comment goes to standard error.
      assert.strictEqual(review.stdout, 'review: pass (0 error, 1 warn)\n');
    },
  },
  {
    pattern: 'its comment names each finding by code and file, the concept with no description among them, and says the lane is lint-only (AGSC-08-27)',
    run(world) {
      const lines = world.state.review.stderr.split('\n').filter(Boolean);
      const findings = lines.filter((l) => /^(error|warn): /u.test(l));
      assert.deepStrictEqual(findings,
        ['warn: AGSC-E408 a concept carries no description (AGSC-02-21) — content/concepts/retry-budget.md']);
      assert.ok(lines.includes('lane: review is lint-only — no model call is reachable from it (AGSC-08-27, NFR-11)'),
        world.state.review.stderr);
    },
  },
  {
    pattern: 'the same review with "--json" gives every finding its file, line and column',
    run(world) {
      const r = world.agsc(['review', '--json'], { offline: true });
      assert.strictEqual(r.exit, 0, r.stdout + r.stderr);
      const envelope = world.json();
      assert.strictEqual(envelope.verb, 'review');
      assert.strictEqual(envelope.status, 'pass');
      assert.deepStrictEqual(envelope.counts, { error: 0, warn: 1 });
      assert.deepStrictEqual(envelope.findings.map((f) => [f.code, f.file, f.line, f.col]),
        [['AGSC-E408', 'content/concepts/retry-budget.md', 1, 1]]);
    },
  },
  {
    pattern: 'with "AGSC_FEATURE_LLM_REVIEW" set to "1" the review still passes, warns that no model adapter ran, and makes no model call',
    run(world) {
      const r = world.agsc(['review', '--json'], { env: { AGSC_FEATURE_LLM_REVIEW: '1' }, offline: true });
      assert.strictEqual(r.exit, 0, r.stdout + r.stderr);
      const envelope = world.json();
      assert.strictEqual(envelope.status, 'pass');
      assert.deepStrictEqual(envelope.findings.map((f) => [f.code, f.severity]).sort(),
        [['AGSC-E408', 'warn'], ['AGSC-E510', 'warn']]);
    },
  },
  {
    pattern: 'no model or network call occurs anywhere in the review lane (AGSC-08-27, AGSC-08-30)',
    run(world) {
      assert.deepStrictEqual(world.networkAttempts(), []);
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
