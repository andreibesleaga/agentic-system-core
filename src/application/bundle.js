'use strict';
/**
 * APPLICATION LAYER — the Bundle loader.
 * Loads the aggregate of AGSC-01-01 to AGSC-01-04 through the FileSystem port
 * — `agsc.config.json`, `content/index.md` and every
 * `content/<type-plural>/<slug>.md` — and returns the Bundle record the
 * module contract defines: `{root, config, index, items, byslug, findings}`.
 * Parsing and validation are the Knowledge context's (`knowledge/frontmatter.js`,
 * `knowledge/validate.js`, owner A); this module only walks the port and
 * assembles, adding no rule of its own. AGSC-01-15's discovery order is the
 * port's code-point `readdir` order, so the result is deterministic.
 *
 * Lifted here from `distribution/bundle.js` at integration (WP-10-G): a
 * Bundle loader orchestrates across contexts and owns no domain rule, which
 * is the application layer's definition, and Distribution reads results — it
 * does not assemble them. The call convention is the port bag the rest of the
 * application layer uses, `loadBundle(ports, options)` with
 * `ports = {fs, clock, proc, network}`, the same bag `distribution/site.js`
 * and `distribution/ci.js` take.
 */

const frontmatter = require('../knowledge/frontmatter.js');
const validate = require('../knowledge/validate.js');
const yaml = require('../knowledge/yaml.js');

/** AGSC-01-03: the type folders, in the plural form the route set uses. */
const TYPE_FOLDERS = Object.freeze({
  clusters: 'cluster',
  concepts: 'concept',
  episodes: 'episode',
  gates: 'gate',
  lessons: 'lesson',
  procedures: 'procedure',
});

/**
 * loadBundle(ports, options) -> Bundle
 * ports: the port bag `{fs, clock, proc, network}`; only `fs` is read here.
 * A bare FileSystem port is accepted too, so that a caller holding one port
 * need not wrap it (the bag is the convention, not a ceremony).
 * options: { schemas } — the compiled schemas of `knowledge/validate.js#schemas`,
 * INJECTED because the Knowledge context never reads a file and only an
 * adapter may (`adapters/node-fs.js#readSchemas`).
 */
function loadBundle(ports, options) {
  const opts = options || {};
  const fs = fileSystemOf(ports);
  const findings = [];
  const config = readJson(fs, 'agsc.config.json', findings);
  const items = [];

  for (const folder of Object.keys(TYPE_FOLDERS)) {
    const dir = `content/${folder}`;
    if (!fs.exists(dir)) continue;
    for (const entry of fs.readdir(dir)) {
      if (!entry.endsWith('.md')) continue;
      const path = `${dir}/${entry}`;
      const item = frontmatter.parseItem(String(fs.readFile(path, 'utf8')), {
        config, path, schemas: opts.schemas,
      });
      items.push(item);
      for (const finding of item.findings || []) findings.push(finding);
    }
  }
  items.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));

  let index = null;
  if (fs.exists('content/index.md')) {
    const split = frontmatter.split(String(fs.readFile('content/index.md', 'utf8')), { file: 'content/index.md' });
    let parsed = {};
    try {
      parsed = yaml.parse(split.yamlText || '');
    } catch (e) {
      findings.push(Object.freeze({
        code: e && e.code ? e.code : 'AGSC-E105',
        file: 'content/index.md',
        // F27-11 (AGSC-09-11, R64): a Finding names its fault.
        message: `the frontmatter of content/index.md is not YAML: ${(e && e.message) || 'parse error'} (AGSC-02-02)`,
        severity: 'error',
      }));
    }
    const typed = opts.schemas && opts.schemas.bundle
      ? validate.applyTypes(parsed, opts.schemas.bundle.schema || {})
      : parsed;
    index = Object.freeze({ body: split.body, frontmatter: typed });
  }

  return Object.freeze({
    byslug: new Map(items.map((i) => [i.slug, i])),
    config,
    findings: Object.freeze(findings),
    index,
    items: Object.freeze(items),
    root: fs.root === undefined ? '' : fs.root,
  });
}

/** The FileSystem port of a port bag, or the port itself when one was passed. */
function fileSystemOf(ports) {
  const bag = ports || {};
  return bag.fs === undefined ? bag : bag.fs;
}

function readJson(ports, path, findings) {
  if (!ports.exists(path)) {
    findings.push(Object.freeze({
      code: 'AGSC-E901', file: path, message: `${path} is missing (AGSC-01-12)`, severity: 'error',
    }));
    return {};
  }
  try {
    return JSON.parse(String(ports.readFile(path, 'utf8')));
  } catch (e) {
    findings.push(Object.freeze({
      code: 'AGSC-E201', file: path,
      message: `${path} is not valid JSON: ${(e && e.message) || 'parse error'} (AGSC-01-12)`,
      severity: 'error',
    }));
    return {};
  }
}

module.exports = { TYPE_FOLDERS, fileSystemOf, loadBundle };
