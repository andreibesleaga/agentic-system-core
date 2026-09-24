'use strict';
// src/governance/lint.js — CONTEXT Governance & Provenance, the lint aggregate.
// PURE: no fs, no process, no clock, no network — every file
// fact (which paths git tracks, which attachment files exist and how large they
// are, an attachment's bytes) is INJECTED by the caller through `options`, so the
// same Bundle always lints to the same Findings.
//
// It composes the four N9 lints of AGSC-08-13…08-17 — each its own module
// exporting `check(input) -> Finding[]` — with the structural lints the rc.3/rc.4
// vectors add, and returns one list sorted per AGSC-09-10 (file, line, col, code,
// compared code-point-wise).
//
// Codes emitted here, and the rule each comes from:
//   AGSC-E401/E402  injection-scan                      AGSC-08-13  (injection.js)
//   AGSC-E403       no-secrets, tracked `.env`          AGSC-08-15, AGSC-01-37 (secrets.js)
//   AGSC-E404       no-pii                              AGSC-08-16  (pii.js)
//   AGSC-E405       clean-room                          AGSC-08-17  (cleanroom.js)
//   AGSC-E406       expected body section missing (warn) AGSC-02-21
//   AGSC-E409       warned status transition (warn)     AGSC-02-23
//   AGSC-E412       raster or unsafe image attachment   AGSC-02-98
//   AGSC-E413       attachment absent or hash mismatch  AGSC-01-34
//   AGSC-E414       orphan attachment file (warn)       AGSC-01-34
//   AGSC-E415       `export`-tagged fence ignored (warn) AGSC-02-22
//   AGSC-E109       unsupported Markdown construct (warn) AGSC-02-20 (markdown.js)
//   AGSC-E416       overlapping labels (warn)           AGSC-05-21
//   AGSC-E205       a compiled .svg under content/diagrams/ AGSC-01-07
//   AGSC-E607       combining sequence over the bound   AGSC-04-23
//   AGSC-E804       port with no producer or consumer (warn) AGSC-02-96
//   AGSC-E902       relative-path grammar violation     AGSC-01-35
//   AGSC-E904       attachment over its size cap        AGSC-01-16, AGSC-01-34
//
// AGSC-E408 (a concept or cluster with no description) is deliberately NOT raised
// here: it belongs to knowledge/validate.js, and one fault never carries two
// codes (a design choice of 2026-09-18).

const { XMLParser, XMLValidator } = require('fast-xml-parser');

const { checkCombining, COMBINING_BOUND } = require('../knowledge/unicode.js');
const { sortFindings } = require('../knowledge/validate.js');
const { finding } = require('./finding.js');
const links = require('../knowledge/links.js');
const markdown = require('../knowledge/markdown.js');
const { isPublished } = require('../knowledge/chunks.js');
const { compareCodePoint } = require('../knowledge/unicode.js');

const injection = require('./injection.js');
const secrets = require('./secrets.js');
const pii = require('./pii.js');
const cleanroom = require('./cleanroom.js');

/** AGSC-01-34: `attachments{max_bytes}` default 1 MiB, maximum 10 MiB. */
const ATTACHMENT_MAX_BYTES_DEFAULT = 1048576;
/** AGSC-01-34: attachments live here and nowhere else. */
const ATTACHMENT_ROOT = 'content/attachments/';
/** AGSC-02-96: the port-name grammar. */
const PORT_NAME = /^[a-z][a-z0-9-]{0,63}$/u;

/**
 * AGSC-02-21: the body sections a lint warns about, per the kinds the rule
 * ENUMERATES. `taxonomy` and `explainer` are said to "keep their four headings"
 * without the rule listing them, so they are not checked here and the gap is
 * reported rather than filled with invented headings.
 */
const SECTIONS = Object.freeze({
  'concept:pattern': ['Intent', 'Context & Forces', 'Structure', 'Consequences & Trade-offs', 'Related Patterns'],
  procedure: ['When', 'Steps', 'Checks'],
  episode: ['What happened', 'Outcome', 'Next'],
  lesson: ['Lesson', 'Evidence', 'Check before'],
});

/**
 * AGSC-02-98: the elements an SVG attachment MUST NOT contain — the DOMPurify
 * `svgDisallowed` set as read on 2026-09-17, plus `a`, `animate*`, `handler` and
 * `style`, which this specification bans deliberately.
 */
const SVG_DISALLOWED = Object.freeze(new Set(['script', 'foreignObject', 'use', 'a',
  'animate', 'animateColor', 'animateMotion', 'animateTransform', 'set', 'discard',
  'handler', 'style', 'cursor', 'color-profile', 'font-face', 'font-face-format',
  'font-face-name', 'font-face-src', 'font-face-uri', 'missing-glyph', 'hatch',
  'hatchpath', 'mesh', 'meshgradient', 'meshpatch', 'meshrow', 'solidcolor',
  'unknown']));

const svgParser = new XMLParser({
  allowBooleanAttributes: true,
  attributeNamePrefix: '@_',
  ignoreAttributes: false,
  preserveOrder: true,
  processEntities: false,
});

const asArray = (v) => (Array.isArray(v) ? v : (v === undefined || v === null ? [] : [v]));
const baseName = (p) => String(p).slice(String(p).lastIndexOf('/') + 1);
const localName = (n) => String(n).slice(String(n).lastIndexOf(':') + 1);

/** AGSC-08-16: every string of a frontmatter EXCEPT the `prov` and `sources[]` subtrees. */
function proseStrings(value, options = {}) {
  const exempt = options.exempt || new Set();
  const out = [];
  const walk = (node, path) => {
    if (typeof node === 'string') {
      out.push({ path, text: node });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child, i) => walk(child, `${path}/${i}`));
      return;
    }
    if (node === null || typeof node !== 'object') return;
    for (const key of Object.keys(node)) {
      if (path === '' && exempt.has(key)) continue;
      walk(node[key], `${path}/${key}`);
    }
  };
  walk(value, '');
  return out;
}

/** Every string of a frontmatter, `x-` vendor keys included (AGSC-02-05a). */
const allStrings = (fm) => proseStrings(fm);

/**
 * AGSC-08-13: severity is `warn` for a human-authored item and `error` when
 * `prov.agent` is set (an agent authored the change).
 */
function severityFor(fm) {
  const prov = fm && typeof fm.prov === 'object' && fm.prov !== null ? fm.prov : {};
  return prov.agent ? 'error' : 'warn';
}

/**
 * AGSC-01-35 over a list of relative paths.
 *
 * @param {string[]} paths
 * @param {{fromDir?:string, file?:string, slug?:string}} [options]
 * @returns {{findings:Array<object>, clean:string[]}}
 */
function checkPaths(paths, options = {}) {
  const findings = [];
  const clean = [];
  for (const p of paths || []) {
    const reason = links.pathGrammarError(p, options.fromDir === undefined ? '' : options.fromDir);
    if (reason === null) {
      clean.push(p);
      continue;
    }
    findings.push(finding('AGSC-E902',
      `relative path "${p}" violates the grammar (${reason}) (AGSC-01-35)`,
      { file: options.file, slug: options.slug, path: p }));
  }
  return { findings, clean };
}

/**
 * AGSC-04-23 over a list of files: a starter followed by more than 256 combining
 * marks is AGSC-E607, naming the file and the offset.
 *
 * @param {Array<{path:string, body:string}>} files
 * @returns {{findings:Array<object>, clean:string[]}}
 */
function checkCombiningBound(files, options = {}) {
  const bound = typeof options.bound === 'number' ? options.bound : COMBINING_BOUND;
  const findings = [];
  const clean = [];
  for (const file of files || []) {
    const result = checkCombining(String(file.body === undefined ? '' : file.body), bound);
    if (result.ok) {
      clean.push(file.path);
      continue;
    }
    findings.push(finding('AGSC-E607',
      `a starter followed by ${result.count} combining marks exceeds the bound of ${bound} (AGSC-04-23)`,
      { file: file.path, path: file.path, col: result.index + 1 }));
  }
  return { findings, clean };
}

/**
 * AGSC-02-98: is this SVG text safe? Returns the reasons it is not.
 *
 * @param {string} text the SVG source
 * @returns {string[]} one reason per violation; empty when the file is clean
 */
function svgViolations(text) {
  const source = typeof text === 'string' ? text : '';
  const reasons = [];
  // Read textually first: a DOCTYPE, an entity declaration and a processing
  // instruction are exactly what an XML parser normalises away.
  if (/<!DOCTYPE/iu.test(source)) reasons.push('a DOCTYPE');
  if (/<!ENTITY/iu.test(source)) reasons.push('an entity declaration');
  if (/<\?/u.test(source)) reasons.push('a processing instruction');

  const valid = XMLValidator.validate(source);
  if (valid !== true) {
    reasons.push('not well-formed XML');
    return reasons;
  }

  let tree;
  try {
    tree = svgParser.parse(source);
  } catch (e) {
    reasons.push('not well-formed XML');
    return reasons;
  }

  const walk = (nodes) => {
    for (const node of asArray(nodes)) {
      if (node === null || typeof node !== 'object') continue;
      for (const key of Object.keys(node)) {
        if (key === ':@' || key === '#text') continue;
        const element = localName(key);
        if (SVG_DISALLOWED.has(element)) reasons.push(`the <${element}> element`);
        walk(node[key]);
      }
      const attributes = node[':@'];
      if (!attributes || typeof attributes !== 'object') continue;
      for (const raw of Object.keys(attributes)) {
        const name = raw.startsWith('@_') ? raw.slice(2) : raw;
        const value = String(attributes[raw]);
        if (/^on/iu.test(name)) reasons.push(`the event attribute "${name}"`);
        else if (localName(name) === 'style') reasons.push('a style attribute');
        if (/data:/iu.test(value)) reasons.push(`an embedded data: URI in "${name}"`);
        if (localName(name) !== 'href') continue;
        if (value.startsWith('#')) continue;
        if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value) || value.startsWith('//')) {
          reasons.push(`an absolute href "${value}"`);
        } else if (links.pathGrammarError(value.split('#')[0], '') !== null) {
          reasons.push(`an href outside the attachments directory "${value}"`);
        }
      }
    }
  };
  walk(tree);
  return [...new Set(reasons)];
}

/** AGSC-02-98 as a lint: one AGSC-E412 per offending SVG file. */
function checkSvg(files, options = {}) {
  const findings = [];
  const clean = [];
  for (const [name, text] of Object.entries(files || {})) {
    const reasons = svgViolations(text);
    if (reasons.length === 0) {
      clean.push(name);
      continue;
    }
    findings.push(finding('AGSC-E412',
      `SVG attachment "${name}" is outside the allow-list: ${reasons.join(', ')} (AGSC-02-98)`,
      { file: name, path: name, slug: options.slug }));
  }
  return { findings, clean };
}

/**
 * AGSC-01-34 and AGSC-02-98 over a Bundle's attachments.
 *
 * @param {Array<object>} items
 * @param {{attachmentBytes?:object, fileErrors?:object, filesPresent?:object, config?:object,
 *          sha256?:function}} [options] `attachmentBytes` maps an attachment's
 *   file name (or its Bundle-relative path) to its text; `filesPresent` maps a
 *   Bundle-relative path to its byte length; `fileErrors` maps one to the
 *   `{code, message}` the FileSystem port refused it with; `sha256` hashes bytes when the
 *   caller can (this module never imports a hash).
 * @returns {{findings:Array<object>, clean:string[]}}
 */
function checkAttachments(items, options = {}) {
  const bytes = options.attachmentBytes || {};
  const present = options.filesPresent || {};
  const cap = (options.config && options.config.attachments
    && typeof options.config.attachments.max_bytes === 'number')
    ? options.config.attachments.max_bytes
    : ATTACHMENT_MAX_BYTES_DEFAULT;
  const refused = options.fileErrors || {};
  // `presenceChecked`: the caller looked at the disk, so an attachment missing from
  // `filesPresent` IS absent (AGSC-E413) even when no attachment at all is present.
  const hasPresence = options.presenceChecked === true
    || Object.keys(present).length > 0 || Object.keys(refused).length > 0;
  const findings = [];
  const clean = [];
  const named = new Set();

  for (const item of items || []) {
    const v = links.view(item);
    const attachments = asArray(v.fm.attachments).filter((a) => a && typeof a === 'object');
    let dirty = false;
    for (const attachment of attachments) {
      const file = String(attachment.file === undefined ? '' : attachment.file);
      const path = `${ATTACHMENT_ROOT}${v.slug}/${file}`;
      named.add(path);
      const base = { file, path, slug: v.slug };

      const grammar = links.pathGrammarError(file, `${ATTACHMENT_ROOT}${v.slug}`);
      if (grammar !== null) {
        findings.push(finding('AGSC-E902',
          `attachment path "${file}" violates the grammar (${grammar}) (AGSC-01-35)`, base));
        dirty = true;
      }

      const media = String(attachment.media_type === undefined ? '' : attachment.media_type);
      const text = bytes[path] !== undefined ? bytes[path] : bytes[file];

      // AGSC-02-98: on a `kind: pattern` concept an image attachment MUST be SVG.
      if (v.type === 'concept' && v.fm.kind === 'pattern'
          && media.startsWith('image/') && media !== 'image/svg+xml') {
        findings.push(finding('AGSC-E412',
          `a ${media} attachment on a pattern must be image/svg+xml (AGSC-02-98)`, base));
        dirty = true;
      }
      if (media === 'image/svg+xml' && typeof text === 'string') {
        const reasons = svgViolations(text);
        if (reasons.length > 0) {
          findings.push(finding('AGSC-E412',
            `SVG attachment "${file}" is outside the allow-list: ${reasons.join(', ')} (AGSC-02-98)`, base));
          dirty = true;
        }
      }

      if (hasPresence) {
        const size = present[path];
        if (refused[path] !== undefined) {
          // The FileSystem port refused the file with the code AGSC-01-16/01-35 name
          // over the cap (E904), an archive (E903), a link out (E902).
          findings.push(finding(String(refused[path].code),
            `attachment "${file}" was refused: ${String(refused[path].message)}`, base));
          dirty = true;
        } else if (size === undefined) {
          findings.push(finding('AGSC-E413',
            `attachment "${file}" is absent from ${ATTACHMENT_ROOT}${v.slug}/ (AGSC-01-34)`, base));
          dirty = true;
        } else if (size > cap) {
          findings.push(finding('AGSC-E904',
            `attachment "${file}" is ${size} bytes, over the cap of ${cap} (AGSC-01-16, AGSC-01-34)`, base));
          dirty = true;
        }
      }

      if (attachment.sha256 && typeof options.sha256 === 'function' && text !== undefined) {
        if (options.sha256(text) !== attachment.sha256) {
          findings.push(finding('AGSC-E413',
            `attachment "${file}" does not match its recorded SHA-256 (AGSC-01-34)`, base));
          dirty = true;
        }
      }
    }
    if (!dirty) clean.push(v.slug);
  }

  // AGSC-01-34: a file under content/attachments/ that no item names is a warning.
  for (const path of Object.keys(present)) {
    if (!path.startsWith(ATTACHMENT_ROOT) || named.has(path)) continue;
    findings.push(finding('AGSC-E414',
      `"${path}" is under ${ATTACHMENT_ROOT} and no item names it (AGSC-01-34)`,
      { file: baseName(path), path, severity: 'warn' }));
  }

  return { findings, clean };
}

/**
 * AGSC-02-96: over the whole Bundle, a `consumes` name with no producer and a
 * `produces` name with no consumer are each the warning AGSC-E804. A name outside
 * the grammar is the schema's AGSC-E204 (knowledge/validate.js) and is excluded
 * from the matching here, so one fault never carries two codes.
 */
function checkPorts(items) {
  const producers = new Map();
  const consumers = new Map();
  const record = (map, name, slug) => {
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(slug);
  };
  for (const item of items || []) {
    const v = links.view(item);
    for (const name of asArray(v.fm.produces)) {
      if (typeof name === 'string' && PORT_NAME.test(name)) record(producers, name, v.slug);
    }
    for (const name of asArray(v.fm.consumes)) {
      if (typeof name === 'string' && PORT_NAME.test(name)) record(consumers, name, v.slug);
    }
  }
  const findings = [];
  const matched = [];
  for (const [name, slugs] of consumers) {
    if (producers.has(name)) {
      matched.push(name);
      continue;
    }
    findings.push(finding('AGSC-E804',
      `port "${name}" is consumed by ${slugs.join(', ')} and produced by nothing (AGSC-02-96)`,
      { slug: slugs[0], port: name, severity: 'warn' }));
  }
  for (const [name, slugs] of producers) {
    if (consumers.has(name)) continue;
    findings.push(finding('AGSC-E804',
      `port "${name}" is produced by ${slugs.join(', ')} and consumed by nothing (AGSC-02-96)`,
      { slug: slugs[0], port: name, severity: 'warn' }));
  }
  matched.sort();
  return { findings, matched };
}

/** AGSC-02-21: the enumerated body sections, as warnings. */
function checkSections(item) {
  const v = links.view(item);
  const key = v.type === 'concept' ? `concept:${v.fm.kind}` : v.type;
  const wanted = SECTIONS[key];
  if (!wanted) return [];
  const present = new Set(markdown.headings(v.body).map((h) => h.text.trim()));
  return wanted
    .filter((heading) => !present.has(heading))
    .map((heading) => finding('AGSC-E406',
      `a ${key.replace(':', ' of kind ')} body has no "## ${heading}" section (AGSC-02-21)`,
      { file: v.path, slug: v.slug, severity: 'warn' }));
}

/** AGSC-02-22: an `export`-tagged fenced block is ignored at 1.x, with a warning. */
function checkFences(item) {
  const v = links.view(item);
  return markdown.fences(v.body)
    .filter((f) => f.info.split(/\s+/u).includes('export'))
    .map((f) => finding('AGSC-E415',
      'an `export`-tagged fenced block is not extracted at 1.x (AGSC-02-22)',
      { file: v.path, slug: v.slug, line: f.line, severity: 'warn' }));
}

/**
 * AGSC-02-20: each unsupported construct outside a code span or a fenced block is
 * one AGSC-E109 warning, never a silent rendering difference.
 */
function checkConstructs(item) {
  const v = links.view(item);
  return markdown.constructs(v.body).map((c) => finding('AGSC-E109',
    `unsupported Markdown construct, ${c.construct}: ${c.text} (AGSC-02-20)`,
    { file: v.path, line: c.line, severity: 'warn', slug: v.slug }));
}

/**
 * AGSC-05-21: two published items of one `type` whose `title` values are equal after
 * NFC and case folding are the warning AGSC-E416, reported on the later one (by
 * path) and naming the earlier.
 */
function checkOverlappingLabels(items, config = {}) {
  const findings = [];
  const seen = new Map();
  const releases = config.releases;
  const views = items.map((item) => links.view(item))
    .filter((v) => v.fm && typeof v.fm.title === 'string' && isPublished(v.fm, releases))
    .sort((a, b) => compareCodePoint(String(a.path), String(b.path)));
  for (const v of views) {
    const key = `${v.fm.type}\u0000${String(v.fm.title).normalize('NFC').toUpperCase().toLowerCase()}`;
    const earlier = seen.get(key);
    if (earlier === undefined) {
      seen.set(key, v);
      continue;
    }
    findings.push(finding('AGSC-E416',
      `the title "${v.fm.title}" of ${v.fm.type} "${v.slug}" overlaps the title of "${earlier.slug}" after NFC and case folding (AGSC-05-21)`,
      { file: v.path, severity: 'warn', slug: v.slug }));
  }
  return findings;
}

/**
 * AGSC-01-07: a compiled `.svg` MUST NOT be committed under `content/diagrams/`; one
 * that is there is AGSC-E205, a file-placement violation. `paths` are the files under
 * that directory (and any tracked path), repository-relative.
 */
function checkCompiledSvg(paths) {
  const seen = new Set();
  const findings = [];
  for (const p of paths || []) {
    const file = String(p);
    if (!/^content\/diagrams\/.+\.svg$/iu.test(file) || seen.has(file)) continue;
    seen.add(file);
    findings.push(finding('AGSC-E205',
      `${file} is a compiled diagram under content/diagrams/; a .svg is produced into the build, never committed (AGSC-01-07)`,
      { file }));
  }
  return findings;
}

/** AGSC-02-23: every transition is legal; a warned one is AGSC-E409. */
/**
 * AGSC-08-12: the four `enforce[]` values, each with a compilation target. The list
 * lives in the Governance context because the rule is AGSC-08's; `distribution/forge.js`
 * reads it and maps each value to its file, so the closed set is stated once.
 */
const ENFORCE_VALUES = Object.freeze(['codeowner', 'hook', 'ruleset', 'status-check']);

/**
 * AGSC-08-12, second obligation: "`lint` MUST report an `enforce[]` value it cannot
 * compile as `AGSC-E707` as well." The schema's enum already refuses an unknown value
 * with `AGSC-E203`, so this fires for a value that is admitted and that no compiler
 * in this distribution answers to — the case that would otherwise be silent.
 *
 * @param {Array<object>} items the loaded items.
 * @returns {Array<object>} Findings.
 */
function checkEnforce(items) {
  const out = [];
  for (const item of Array.isArray(items) ? items : []) {
    const v = links.view(item);
    if (v.fm.type !== 'gate' && item.type !== 'gate') continue;
    for (const value of asArray(v.fm.enforce)) {
      if (typeof value !== 'string' || ENFORCE_VALUES.includes(value)) continue;
      out.push(finding('AGSC-E707',
        `enforce[] value "${value}" cannot be compiled by this distribution (AGSC-08-12)`,
        { file: v.path, slug: v.slug }));
    }
  }
  return out;
}

const WARNED_TRANSITIONS = Object.freeze([['deprecated', 'stable'], ['retired', 'draft'],
  ['retired', 'stable'], ['retired', 'deprecated']]);

function statusTransition(previous, next, context = {}) {
  if (!previous || !next || previous === next) return [];
  const warned = WARNED_TRANSITIONS.some(([a, b]) => a === previous && b === next);
  if (!warned) return [];
  return [finding('AGSC-E409',
    `status "${previous}" -> "${next}" is legal but unusual (AGSC-02-23)`,
    { file: context.file, slug: context.slug, severity: 'warn' })];
}

/**
 * Lint a loaded Bundle (AGSC-08-13…08-17 plus the structural lints above).
 *
 * @param {{config?:object, items?:Array<object>, index?:object, files?:Array}} bundle
 * @param {{ports?:object, trackedPaths?:string[], attachmentBytes?:object,
 *          filesPresent?:object, previousStatus?:object, sha256?:function}} [options]
 * @returns {Array<object>} Findings sorted per AGSC-09-10.
 */
function lint(bundle = {}, options = {}) {
  const items = Array.isArray(bundle.items) ? bundle.items : [];
  const config = bundle.config || options.config || {};
  const patterns = config.lint && Array.isArray(config.lint.injection_patterns)
    ? config.lint.injection_patterns
    : undefined;
  const findings = [];

  for (const item of items) {
    const v = links.view(item);
    const severity = severityFor(v.fm);
    const at = { file: v.path, slug: v.slug };

    findings.push(...injection.check({ ...at, text: v.body, severity, patterns, where: 'the body' }));
    findings.push(...secrets.check({ ...at, text: v.body, where: 'the body' }));
    findings.push(...pii.check({ ...at, text: v.body, where: 'the body' }));
    findings.push(...cleanroom.check({ ...at, text: v.body, frontmatter: v.fm }));

    for (const { path, text } of allStrings(v.fm)) {
      findings.push(...injection.check({ ...at, text, severity, patterns, where: `frontmatter ${path}` }));
      findings.push(...secrets.check({ ...at, text, where: `frontmatter ${path}` }));
    }
    for (const { path, text } of proseStrings(v.fm, { exempt: pii.EXEMPT_KEYS })) {
      findings.push(...pii.check({ ...at, text, where: `frontmatter ${path}` }));
    }

    // AGSC-08-13: the text of every text-media attachment is an input too,
    // because it enters the chunk export verbatim (AGSC-06-30).
    const bytes = options.attachmentBytes || {};
    for (const attachment of asArray(v.fm.attachments)) {
      if (!attachment || typeof attachment !== 'object') continue;
      const key = `${ATTACHMENT_ROOT}${v.slug}/${attachment.file}`;
      const text = bytes[key] !== undefined ? bytes[key] : bytes[attachment.file];
      if (typeof text !== 'string') continue;
      findings.push(...injection.check({ ...at, text, severity, patterns, where: `attachment ${attachment.file}` }));
    }

    findings.push(...checkSections(item));
    findings.push(...checkFences(item));
    findings.push(...checkConstructs(item));

    const previous = (options.previousStatus || {})[v.slug];
    findings.push(...statusTransition(previous, v.fm.status, at));

    const diagram = v.fm.diagram && typeof v.fm.diagram === 'object' ? v.fm.diagram.file : undefined;
    if (typeof diagram === 'string') {
      findings.push(...checkPaths([diagram], { fromDir: 'content/diagrams', ...at }).findings);
    }
  }

  findings.push(...checkAttachments(items, { ...options, config }).findings);
  findings.push(...checkOverlappingLabels(items, config));
  findings.push(...checkCompiledSvg([...(options.diagramPaths || []), ...(options.trackedPaths || bundle.trackedPaths || [])]));
  findings.push(...checkPorts(items).findings);
  findings.push(...checkEnforce(items));
  findings.push(...secrets.checkTracked(options.trackedPaths || bundle.trackedPaths));
  findings.push(...cleanroom.check({ paths: options.paths || [], emitters: options.emitters || [] }));

  if (Array.isArray(bundle.files)) {
    findings.push(...checkCombiningBound(bundle.files).findings);
  }
  if (typeof config.build === 'object' && config.build !== null && typeof config.build.out === 'string') {
    findings.push(...checkPaths([config.build.out.replace(/\/$/u, '')],
      { file: 'agsc.config.json' }).findings);
  }

  // Every Finding carries `path` beside `file` so that a caller which reports by
  // path (the vectors, the CLI envelope) never has to guess which member to read.
  for (const f of findings) {
    if (f.path === undefined && f.file) f.path = f.file;
  }
  return sortFindings(findings);
}

module.exports = {
  ATTACHMENT_MAX_BYTES_DEFAULT,
  ATTACHMENT_ROOT,
  ENFORCE_VALUES,
  PORT_NAME,
  SECTIONS,
  SVG_DISALLOWED,
  WARNED_TRANSITIONS,
  allStrings,
  checkAttachments,
  checkCombiningBound,
  checkCompiledSvg,
  checkConstructs,
  checkFences,
  checkOverlappingLabels,
  checkPaths,
  checkEnforce,
  checkPorts,
  checkSections,
  checkSvg,
  lint,
  proseStrings,
  severityFor,
  statusTransition,
  svgViolations,
};
