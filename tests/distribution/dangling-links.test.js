'use strict';
// FV28-04 — the dangling-link guard, and the reason it had nothing to catch.
//
// `site.js#internalLinks` collected SITE-ABSOLUTE hrefs only, so the promise that
// "no build emits a link to a route it does not produce" held for absolute links
// alone. Measured on the patterns node: 65 distinct RELATIVE targets, 186
// occurrences on 52 of 124 pages, and not one of them resolved to an emitted route
// — `<a href="structured-output-validation">` on `/concepts/reproducible-inference/`
// resolves to `/concepts/reproducible-inference/structured-output-validation`, which
// 404s. `agsc lint` passed over it because AGSC-03-11 was satisfied (the target item
// exists in `content/`), and AGSC-06-01's route check never saw the link.
//
// Two halves, both here:
//   (a) the GUARD resolves a relative href against the page's own route, so the
//       defect is visible and `AGSC-E901` fails the build as AGSC-06-01 requires;
//   (b) the WRITER maps a body reference that resolves to a PUBLISHED item onto
//       that item's route, which is the only way an authored Bundle can satisfy
//       AGSC-03-11 and AGSC-06-01 at once — the Bundle geometry
//       (`content/concepts/a.md` → `content/concepts/b.md`) and the route geometry
//       (`/concepts/a/` → `/concepts/b/`) are different, so NO authored spelling
//       works in both without the writer resolving it.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const validate = require('../../src/knowledge/validate.js');
const { loadBundle } = require('../../src/application/bundle.js');
const site = require('../../src/distribution/site.js');
const markdown = require('../../src/knowledge/markdown.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const EPOCH = '1767225600';

function load(root = FIXTURE) {
  const fs = createFileSystem(root);
  const bundle = loadBundle(fs, { schemas: validate.schemas(readSchemas(ROOT)) });
  const clock = createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } });
  return { bundle, ports: { fs, clock }, options: { specVersion: '1.0.0-rc.5', version: '0.0.2' } };
}

// -------------------------------------------------------------------- (a) guard

test('internalLinks resolves a RELATIVE href against the page route (FV28-04)', () => {
  const files = new Map([
    ['/concepts/a/index.html', '<a href="b">x</a><a href="../c/">y</a><img src="../../assets/d.png">'],
    ['/concepts/b/index.html', '<a href="/concepts/a/">z</a>'],
  ]);
  const found = site.internalLinks(files).map((l) => [l.from, l.href, l.route]);
  assert.deepStrictEqual(found, [
    ['/concepts/a/index.html', 'b', '/concepts/a/b'],
    ['/concepts/a/index.html', '../c/', '/concepts/c/'],
    ['/concepts/a/index.html', '../../assets/d.png', '/assets/d.png'],
    ['/concepts/b/index.html', '/concepts/a/', '/concepts/a/'],
  ]);
});

test('the guard leaves external, fragment-only and mailto targets alone', () => {
  const files = new Map([['/x/index.html',
    '<a href="https://example.org/">a</a><a href="//cdn.example/x">b</a>'
    + '<a href="mailto:x@example.org">c</a><a href="#intent">d</a><a href="?q=1">e</a>']]);
  assert.deepStrictEqual(site.internalLinks(files), []);
});

test('a relative href that climbs above the site root resolves to nothing', () => {
  const files = new Map([['/a/index.html', '<a href="../../../escape">x</a>']]);
  const links = site.internalLinks(files);
  assert.strictEqual(links.length, 1);
  assert.strictEqual(links[0].route, null);
  assert.strictEqual(site.resolvesTo(files, links[0].route), null);
});

// ------------------------------------------------------------------- (b) writer

test('render() rewrites a body href through the injected resolver', () => {
  const body = '[S](supervisor) and [T](supervisor.md#intent) and ![i](../assets/x.png)\n';
  const plain = markdown.render(body).html;
  assert.ok(plain.includes('href="supervisor"'), plain);
  const rewritten = markdown.render(body, {
    href: (target) => (target.startsWith('supervisor') ? `/concepts/supervisor/${target.includes('#') ? `#${target.split('#')[1]}` : ''}` : null),
  }).html;
  assert.ok(rewritten.includes('href="/concepts/supervisor/"'), rewritten);
  assert.ok(rewritten.includes('href="/concepts/supervisor/#intent"'), rewritten);
  // A resolver that answers `null` changes nothing: the writer never invents a link.
  assert.ok(rewritten.includes('src="../assets/x.png"'), rewritten);
});

test('the minimal fixture emits no dangling link (FV28-04, end to end)', () => {
  const { bundle, ports, options } = load();
  const built = site.build(bundle, ports, options);
  const dangling = site.internalLinks(built.files)
    .filter((l) => site.resolvesTo(built.files, l.route) === null);
  assert.deepStrictEqual(dangling.map((l) => `${l.from} -> ${l.href}`), []);
  assert.deepStrictEqual(built.findings.filter((f) => f.code === 'AGSC-E901'), []);
  // `[Supervisor](supervisor)` in `content/concepts/handoff.md` now renders as the
  // published route; before rc.5 it rendered verbatim and 404ed.
  assert.ok(String(built.files.get('/concepts/handoff/index.html'))
    .includes('href="/concepts/supervisor/"'));
  // The BODY itself is untouched: `/pages/<slug>.md` is the source view (AGSC-06-02).
  assert.ok(String(built.files.get('/pages/handoff.md')).includes('](supervisor)'));
  assert.ok(String(built.files.get('/llms-full.txt')).includes('](supervisor)'));
});

test('a body link to a DRAFT item is AGSC-E901: the build emits no route for it', () => {
  const { bundle, ports, options } = load();
  const supervisor = bundle.items.find((i) => i.slug === 'supervisor');
  supervisor.frontmatter.status = 'draft';
  const built = site.build(bundle, ports, options);
  const e901 = built.findings.filter((f) => f.code === 'AGSC-E901');
  assert.strictEqual(e901.length, 1, JSON.stringify(built.findings));
  assert.match(e901[0].message, /supervisor/u);
  assert.strictEqual(e901[0].severity, 'error');
});

test('the build stays byte-identical across two runs with the guard on', () => {
  const a = load();
  const first = site.build(a.bundle, a.ports, a.options);
  const b = load();
  const second = site.build(b.bundle, b.ports, b.options);
  assert.deepStrictEqual([...first.files.keys()], [...second.files.keys()]);
  for (const [route, bytes] of first.files) assert.strictEqual(bytes, second.files.get(route), route);
});
