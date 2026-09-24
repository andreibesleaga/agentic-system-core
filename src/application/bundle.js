'use strict';
/**
 * APPLICATION LAYER — the Bundle loader.
 * Loads the aggregate of AGSC-01-01 to AGSC-01-04 through the FileSystem port
 * — `agsc.config.json`, `content/index.md` and every
 * `content/<type-plural>/<slug>.md` — and returns the Bundle record the
 * module contract defines: `{root, config, index, items, byslug, findings}`.
 * Parsing and validation are the Knowledge context's (`knowledge/frontmatter.js`,
 * `knowledge/validate.js`); this module only walks the port and
 * assembles, adding no rule of its own. AGSC-01-15's discovery order is the
 * port's code-point `readdir` order, so the result is deterministic.
 *
 * Lifted here from `distribution/bundle.js` at integration: a
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

/** AGSC-03-11 / AGSC-02-95: where a Bundle's non-item files live. */
const ASSETS_DIR = 'content/assets';

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
      // The port refuses a file with the code the rule names — not UTF-8 (E108,
      // AGSC-01-14), over the cap (E904), a link out of the root (E902) — and that
      // refusal is a Finding about this one file, never an internal error that hides
      // the rest of the Bundle.
      const text = readRefusable(fs, path, findings);
      if (text === null) continue;
      const item = frontmatter.parseItem(text, {
        config, path, schemas: opts.schemas,
      });
      items.push(item);
      for (const finding of item.findings || []) findings.push(finding);
    }
  }
  items.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));

  // AGSC-03-11 (wired at rc.5): "a relative Markdown link or image whose
  // target is inside the Bundle MUST resolve to an existing item, AN EXISTING ASSET
  // UNDER `content/assets/`, or an existing anchor". `knowledge/links.js#resolve`
  // reads that set from `options.assets` and no caller supplied it, so the asset
  // branch was unreachable and every body image reference to a real file was
  // `AGSC-E310`. The set is part of the AGGREGATE — it is loaded with the Bundle,
  // once, and passed to every resolver — and it is NAMES only: nothing is read, so
  // an asset costs one directory entry and never its bytes. The port's `walk` is
  // recursive because AGSC-02-95 copies adopted references to
  // `content/assets/<original-relative-path>`, which is a tree; the port refuses a
  // path that leaves the root through a link (AGSC-01-16/01-35), so the walk cannot
  // follow a symlink out of the Bundle.
  const assets = fs.exists(ASSETS_DIR) ? fs.walk(ASSETS_DIR) : [];

  let index = null;
  const indexText = fs.exists('content/index.md') ? readRefusable(fs, 'content/index.md', findings) : null;
  if (indexText !== null) {
    const split = frontmatter.split(indexText, { file: 'content/index.md' });
    let parsed = {};
    try {
      parsed = yaml.parse(split.yamlText || '');
    } catch (e) {
      findings.push(Object.freeze({
        code: e && e.code ? e.code : 'AGSC-E105',
        file: 'content/index.md',
        // (AGSC-09-11): a Finding names its fault.
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
    assets: Object.freeze(assets),
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

/** A port refusal carries a registered code; anything else is not ours to name. */
function refusalCode(e) {
  return e && typeof e.code === 'string' && /^AGSC-E\d{3}$/u.test(e.code) ? e.code : null;
}

/**
 * The text of one Bundle file, or `null` with the port's own refusal recorded as a
 * Finding. An error that carries no registered code is a programming fault and is
 * re-thrown (contract: a thrown error is a fault, a Finding is a domain fact).
 */
function readRefusable(fs, path, findings) {
  try {
    return String(fs.readFile(path, 'utf8'));
  } catch (e) {
    const code = refusalCode(e);
    if (code === null) throw e;
    findings.push(Object.freeze({ code, file: path, message: String(e.message), severity: 'error' }));
    return null;
  }
}

function readJson(ports, path, findings) {
  if (!ports.exists(path)) {
    findings.push(Object.freeze({
      code: 'AGSC-E901', file: path, message: `${path} is missing (AGSC-01-01)`, severity: 'error',
    }));
    return {};
  }
  try {
    return JSON.parse(String(ports.readFile(path, 'utf8')));
  } catch (e) {
    // an oversized or undecodable configuration is the port's refusal
    // (AGSC-E904, AGSC-E108), not a JSON syntax error.
    const code = refusalCode(e);
    if (code !== null) {
      findings.push(Object.freeze({ code, file: path, message: String(e.message), severity: 'error' }));
      return {};
    }
    findings.push(Object.freeze({
      code: 'AGSC-E201', file: path,
      message: `${path} is not valid JSON: ${(e && e.message) || 'parse error'} (AGSC-01-12)`,
      severity: 'error',
    }));
    return {};
  }
}

module.exports = { ASSETS_DIR, TYPE_FOLDERS, fileSystemOf, loadBundle };
