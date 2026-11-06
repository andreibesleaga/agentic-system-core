'use strict';
// Not a test — a small Bundle built in a scratch folder, shared by the tests of the graph
// view (`graph-view.test.js`), of the explorer's reading of `/graph.jsonld`
// (`explorer/graph-data.test.js`) and of the domain parts in a browser
// (`domain-browser.test.js`): the minimal fixture's configuration and front page,
// the given items, their diagram sources and, when asked, a site vocabulary (AGSC-01-41).
// Deterministic: fixed build instant, no network; the folder is removed after the build.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createFileSystem, readSchemas } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const validate = require('../../src/knowledge/validate.js');
const { loadBundle } = require('../../src/application/bundle.js');
const site = require('../../src/distribution/site.js');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');

/** A frontmatter value in the YAML subset: a scalar, a block sequence or a mapping of scalars. */
function yamlLines(key, value) {
  if (Array.isArray(value)) return [`${key}:`, ...value.map((v) => `  - ${JSON.stringify(String(v))}`)];
  if (typeof value === 'object') return [`${key}:`, ...Object.entries(value).map(([k, v]) => `  ${k}: ${JSON.stringify(String(v))}`)];
  return [`${key}: ${JSON.stringify(String(value))}`];
}

/**
 * Build a Bundle of the minimal fixture's configuration and front page and the given
 * items (each `{slug, type, body?, ...frontmatter}`); `diagrams` maps a slug to its
 * `.diagram` source; `vocabulary`, when given, is written as `domain/vocabulary.ttl` and
 * named in the configuration, so the node uses the domain layer, and `contexts` is its
 * `domain.contexts` (AGSC-01-41). Returns the built files and the findings.
 *
 * @param {Array<object>} items
 * @param {{releases?:object, diagrams?:object, vocabulary?:string, contexts?:Array<object>}} [options]
 * @returns {{files:Map<string,*>, findings:Array<object>}}
 */
function buildNode(items, { releases, diagrams = {}, vocabulary, contexts } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-scratch-node-'));
  try {
    const config = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'agsc.config.json'), 'utf8'));
    if (releases) config.releases = releases;
    if (vocabulary !== undefined) {
      config.domain = { vocabulary: 'domain/vocabulary.ttl', ...(contexts === undefined ? {} : { contexts }) };
      fs.mkdirSync(path.join(dir, 'domain'));
      fs.writeFileSync(path.join(dir, 'domain', 'vocabulary.ttl'), vocabulary);
    }
    fs.writeFileSync(path.join(dir, 'agsc.config.json'), `${JSON.stringify(config, null, 2)}\n`);
    fs.mkdirSync(path.join(dir, 'content', 'diagrams'), { recursive: true });
    fs.copyFileSync(path.join(FIXTURE, 'content', 'index.md'), path.join(dir, 'content', 'index.md'));
    fs.cpSync(path.join(FIXTURE, '.well-known'), path.join(dir, '.well-known'), { recursive: true });
    for (const { slug, body, ...fields } of items) {
      const folder = fields.type === 'cluster' ? 'clusters' : 'concepts';
      const front = { date: '2026-01-01', ...fields };
      const lines = ['---', ...Object.entries(front).flatMap(([k, v]) => yamlLines(k, v)),
        'prov:', '  origin: human', '  operator: human:andreibesleaga', '---', '', body || `${slug}.`, ''];
      fs.mkdirSync(path.join(dir, 'content', folder), { recursive: true });
      fs.writeFileSync(path.join(dir, 'content', folder, `${slug}.md`), lines.join('\n'));
    }
    for (const [slug, source] of Object.entries(diagrams)) fs.writeFileSync(path.join(dir, 'content', 'diagrams', `${slug}.diagram`), source);
    const port = createFileSystem(dir);
    const bundle = loadBundle(port, { schemas: validate.schemas(readSchemas(ROOT)) });
    const clock = createClock({ env: { SOURCE_DATE_EPOCH: '1767225600' } });
    return site.build(bundle, { clock, fs: port }, { specVersion: '1.0.0', version: '0.0.0' });
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
}

module.exports = { buildNode };
