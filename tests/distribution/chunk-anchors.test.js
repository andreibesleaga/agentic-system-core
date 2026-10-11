'use strict';
// verifies AGSC-06-28, AGSC-06-30
// AGSC-06-28: an agent cites a chunk back as the item IRI followed by `#chunk-` and
// the first 16 hex characters of its `id`, "which a page MUST render as an in-page
// anchor on the chunk's heading". AGSC-06-30: the anchor is required only for the
// chunks that begin with a heading; every other chunk is cited at the top of its page.
// The anchor is an empty element inside the heading, so the heading keeps its
// AGSC-03-13 `id` and every link to it still resolves.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const validate = require('../../src/knowledge/validate.js');
const { loadBundle } = require('../../src/application/bundle.js');
const html = require('../../src/distribution/html.js');
const site = require('../../src/distribution/site.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');

/** The minimal fixture plus one long item, built at the given Level. */
function build(level) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-chunk-anchors-'));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  // A lead paragraph (chunk 0), a short section, a section long enough for Cut 2 to
  // split it, and an h4 that is no cut point.
  const long = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} of a long section that Cut 2 splits by size.`).join('\n\n');
  fs.writeFileSync(path.join(dir, 'content', 'concepts', 'long-read.md'), [
    '---', 'type: concept', 'title: Long read', 'description: An item with a lead, short and long sections.',
    'date: "2026-01-01"', 'prov:', '  origin: human', '  operator: human:andreibesleaga', '---', '',
    'The lead paragraph is chunk 0.', '', '## Short part', '', 'One paragraph.', '',
    '### Smaller part', '', 'Another paragraph.', '', '#### Not a cut', '', 'Still the smaller part.', '',
    '## Long part', '', long, '',
  ].join('\n'));
  fs.writeFileSync(path.join(dir, 'agsc.config.json'), JSON.stringify({
    ...JSON.parse(fs.readFileSync(path.join(dir, 'agsc.config.json'), 'utf8')), chunks: { max_bytes: 512 },
  }));
  const port = createFileSystem(dir);
  const bundle = loadBundle(port, { schemas: validate.schemas(readSchemas(ROOT)) });
  const clock = createClock({ env: { SOURCE_DATE_EPOCH: '1767225600' } });
  const built = site.build(bundle, { clock, fs: port }, { level, specVersion: '1.0.0-rc.7', version: '0.0.0' });
  fs.rmSync(dir, { force: true, recursive: true });
  return built.files;
}

function chunkLines(files) {
  return String(files.get('/chunks.jsonl')).trim().split('\n').map((l) => JSON.parse(l));
}

const anchorsIn = (page) => [...page.matchAll(/id="chunk-([^"]*)"/gu)].map((m) => m[1]);

test('the anchor goes inside the named h2/h3 and leaves every other heading as it was', () => {
  const body = '<h2 id="a">A</h2>\n<p>x</p>\n<h3 id="b">B</h3>\n<h2 id="c">C</h2>\n<h4 id="a">D</h4>\n';
  const out = html.withChunkAnchors(body, [
    { anchor: 'chunk-0123456789abcdef', section: 'a' },
    { anchor: 'chunk-fedcba9876543210', section: 'b' },
  ]);
  assert.strictEqual(out, '<h2 id="a"><span id="chunk-0123456789abcdef"></span>A</h2>\n<p>x</p>\n'
    + '<h3 id="b"><span id="chunk-fedcba9876543210"></span>B</h3>\n<h2 id="c">C</h2>\n<h4 id="a">D</h4>\n');
  assert.strictEqual(html.withChunkAnchors(body, []), body);
  assert.strictEqual(html.withChunkAnchors(body, undefined), body);
});

test('chunkAnchors keeps only the chunks that begin with a heading, by item', () => {
  const id = 'ab'.repeat(32);
  const anchors = html.chunkAnchors([
    { id, item: 'x', ordinal: 0, section: '', type: 'text' },
    { id, item: 'x', ordinal: 0, section: 'intro', type: 'text' },
    { id, item: 'x', ordinal: 1, section: 'intro', type: 'text' },
    { id, item: 'x', ordinal: 0, section: 'attachment-1', type: 'image/png' },
    { id, item: 'y', ordinal: 0, section: 'other', type: 'text' },
  ]);
  assert.deepStrictEqual([...anchors.keys()], ['x', 'y']);
  assert.deepStrictEqual(anchors.get('x'), [{ anchor: `chunk-${id.slice(0, 16)}`, section: 'intro' }]);
});

test('a Level-2 page carries the anchor of each chunk that begins with a heading, on that heading (AGSC-06-28)', () => {
  const files = build(2);
  const lines = chunkLines(files);
  const own = lines.filter((c) => c.item === 'long-read');
  assert.ok(own.some((c) => c.section === 'long-part' && c.ordinal > 0), 'Cut 2 did not split the long section');
  const page = String(files.get('/concepts/long-read/index.html'));
  for (const c of own.filter((x) => x.section !== '' && x.ordinal === 0)) {
    const heading = new RegExp(`<(h[23]) id="${c.section}">([\\s\\S]*?)</\\1>`, 'u').exec(page);
    assert.ok(heading, `no heading ${c.section}`);
    assert.ok(heading[2].startsWith(`<span id="chunk-${c.id.slice(0, 16)}"></span>`), heading[0]);
  }
  // AGSC-06-30: chunk 0 and the later pieces of the long section have no anchor.
  const headed = own.filter((c) => c.section !== '' && c.ordinal === 0).map((c) => c.id.slice(0, 16));
  assert.deepStrictEqual(anchorsIn(page).sort(), headed.sort());
  assert.strictEqual(headed.length, 3);
  assert.match(page, /<h4 id="not-a-cut">Not a cut<\/h4>/u);
});

test('every page of the build carries exactly the anchors of its own headed chunks', () => {
  const files = build(2);
  const byRoute = new Map();
  for (const c of chunkLines(files)) {
    const route = `${new URL(c.iri).pathname}index.html`;
    if (!byRoute.has(route)) byRoute.set(route, []);
    if (c.section !== '' && c.ordinal === 0 && c.type === 'text') byRoute.get(route).push(c.id.slice(0, 16));
  }
  let pages = 0;
  for (const [route, bytes] of files) {
    if (!route.endsWith('.html')) continue;
    pages += 1;
    assert.deepStrictEqual(anchorsIn(String(bytes)).sort(), (byRoute.get(route) || []).sort(), route);
  }
  assert.ok(pages > 5);
});

test('a build that emits no chunks renders no chunk anchor (AGSC-10-02, AGSC-10-04)', () => {
  const files = build(0);
  assert.strictEqual(files.has('/chunks.jsonl'), false);
  for (const [route, bytes] of files) {
    if (route.endsWith('.html')) assert.deepStrictEqual(anchorsIn(String(bytes)), [], route);
  }
});
