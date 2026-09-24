'use strict';
// CONTEXT Knowledge — aggregate: Item frontmatter. Implements AGSC-02-01 (second
// document), AGSC-02-02 (the permitted subset and its rejections), AGSC-02-03 and
// AGSC-02-04 (failsafe schema: every scalar is a string), AGSC-01-16 (size cap).
//
// PURE: no fs, no process, no clock, no network, no cross-context require.
//
// This module is a thin, auditable wrapper around the `yaml` package (eemeli, ISC,
// pinned): the library does the lexing and the failsafe resolution, and this file
// adds exactly what the specification pins and the library does not — the AGSC-02-02
// allow-list and the registered AGSC-E1xx codes with their line and column.
//
// Admitted   block mappings, block sequences, flow sequences OF SCALARS,
//            single/double-quoted and plain scalars, `|` and `>` block scalars,
//            `#` comments.
// Rejected   AGSC-E103 anchor (`&a`) or alias (`*a`)            (vector fm-0005)
//            AGSC-E104 tag (`!!int`) or merge key (`<<`)
//            AGSC-E105 flow mapping, complex key, any other construct outside the subset
//            AGSC-E106 duplicate key
//            AGSC-E107 a second YAML document
//            AGSC-E904 input above the AGSC-01-16 size cap
//
// Types come from schema/item.schema.json, NEVER from YAML resolution: `yes`, `no`,
// `on`, `off`, `~`, `1e3`, `0x1F` and bare dates all parse as strings (fm-0006).

const YAML = require('yaml');

/** UTF-8 byte length without Node's Buffer: knowledge/ stays runtime-portable. */
const utf8Length = (s) => new TextEncoder().encode(s).length;

/** The AGSC-01-16 cap for any single input file, in bytes. */
const MAX_INPUT_BYTES = 1024 * 1024;

/**
 * A programming-level signal that the input is outside the AGSC-02-02 subset.
 * Callers that speak Findings (frontmatter.js) convert it into one; it is thrown
 * rather than returned because a parse cannot yield a value as well as a fault.
 */
class YamlError extends Error {
  constructor(code, line, col, message) {
    super(message);
    this.name = 'YamlError';
    this.code = code;
    this.line = line;
    this.col = col;
  }
}

/** Map a library parse error code onto the registered AGSC code (spec/09 §9.4). */
function codeForLibraryError(libraryCode) {
  if (libraryCode === 'DUPLICATE_KEY') return 'AGSC-E106';
  // Everything else the library rejects is, by AGSC-02-02, a construct outside the
  // permitted subset. A second document never reaches here: `parse` detects it first.
  return 'AGSC-E105';
}

function positionOf(lineCounter, offset, lineOffset) {
  const pos = lineCounter.linePos(typeof offset === 'number' ? offset : 0);
  return { line: pos.line + lineOffset, col: pos.col };
}

/**
 * Collect every AGSC-02-02 violation in the document, each with its offset.
 *
 * Duplicate keys (AGSC-E106, AGSC-02-02) are detected HERE, with one `Set` per
 * mapping, rather than by the library's `uniqueKeys` option: that option compares
 * each new key against every key already in the mapping, which is quadratic in the
 * number of keys, and AGSC-01-16 admits a 1 MiB frontmatter block — roughly 80 000
 * `k: v` lines — so a single hostile item would have held the build for minutes
 * (measured: 20 000 keys took 6.9 s with `uniqueKeys`, 0.45 s without; lens c).
 * The offset and message reproduce the library's exactly, so the reported line,
 * column and text are unchanged.
 */
function collectViolations(doc) {
  const found = [];
  const push = (code, offset, message) => found.push({ code, offset, message });
  /** One key set per mapping node; `WeakMap` so it dies with the document. */
  const keysSeen = new WeakMap();

  YAML.visit(doc, {
    Alias(_key, node) {
      push('AGSC-E103', node.range ? node.range[0] : 0,
        'YAML aliases are outside the permitted subset (AGSC-02-02)');
    },
    Node(_key, node, path) {
      if (node.anchor) {
        push('AGSC-E103', node.range ? node.range[0] : 0,
          'YAML anchors are outside the permitted subset (AGSC-02-02)');
      }
      if (node.tag) {
        push('AGSC-E104', node.range ? node.range[0] : 0,
          `YAML tags are outside the permitted subset (AGSC-02-02): ${node.tag}`);
      }
      const isCollection = YAML.isMap(node) || YAML.isSeq(node);
      if (YAML.isMap(node) && node.flow === true) {
        push('AGSC-E105', node.range ? node.range[0] : 0,
          'flow mappings are outside the permitted subset (AGSC-02-02)');
      }
      if (isCollection && path.some((p) => (YAML.isSeq(p) || YAML.isMap(p)) && p.flow === true)) {
        push('AGSC-E105', node.range ? node.range[0] : 0,
          'a flow sequence may contain scalars only (AGSC-02-02)');
      }
    },
    Pair(_key, pair, path) {
      const key = pair.key;
      if (YAML.isMap(key) || YAML.isSeq(key)) {
        push('AGSC-E105', key.range ? key.range[0] : 0,
          'complex keys are outside the permitted subset (AGSC-02-02)');
      }
      if (YAML.isScalar(key) && key.value === '<<') {
        push('AGSC-E104', key.range ? key.range[0] : 0,
          'merge keys are outside the permitted subset (AGSC-02-02)');
      }
      // AGSC-02-02 / AGSC-E106: a repeated key in the SAME mapping. The owning
      // mapping is the last collection on the visit path.
      if (YAML.isScalar(key)) {
        const owner = path[path.length - 1];
        if (YAML.isMap(owner)) {
          let seen = keysSeen.get(owner);
          if (!seen) { seen = new Set(); keysSeen.set(owner, seen); }
          if (seen.has(key.value)) {
            push('AGSC-E106', key.range ? key.range[0] : 0, 'Map keys must be unique');
          } else {
            seen.add(key.value);
          }
        }
      }
    },
  });
  return found;
}

/**
 * Parse the AGSC-02-02 failsafe subset.
 *
 * @param {string} text YAML source (no document markers).
 * @param {{lineOffset?: number, maxBytes?: number}} [options] `lineOffset` shifts
 *   reported lines so that a frontmatter block reports against its file
 *   (frontmatter.js passes 1, so the opening `---` is line 1).
 * @returns {unknown} a value whose every scalar is a string (AGSC-02-03).
 * @throws {YamlError} carrying a registered AGSC-E1xx code, a line and a column.
 */
function parse(text, options = {}) {
  const lineOffset = options.lineOffset || 0;
  const maxBytes = options.maxBytes == null ? MAX_INPUT_BYTES : options.maxBytes;
  const source = String(text);
  if (utf8Length(source) > maxBytes) {
    throw new YamlError('AGSC-E904', 1 + lineOffset, 1,
      `YAML input exceeds the ${maxBytes}-byte cap (AGSC-01-16)`);
  }

  const lineCounter = new YAML.LineCounter();
  const docs = YAML.parseAllDocuments(source, {
    schema: 'failsafe',
    // Duplicate keys are AGSC-E106 and are found in `collectViolations` in linear
    // time; the library's own check is quadratic in the key count (see there).
    uniqueKeys: false,
    merge: false,
    lineCounter,
    prettyErrors: false,
  });
  if (docs.length > 1) {
    const second = docs[1];
    const offset = second.range ? second.range[0] : 0;
    const pos = positionOf(lineCounter, offset, lineOffset);
    throw new YamlError('AGSC-E107', pos.line, pos.col,
      'a second YAML document is not permitted (AGSC-02-01)');
  }
  const doc = docs[0];
  if (!doc) return {};

  const faults = [
    ...doc.errors.map((e) => ({
      code: codeForLibraryError(e.code),
      offset: e.pos ? e.pos[0] : 0,
      message: e.message.split('\n')[0],
    })),
    ...collectViolations(doc),
  ];
  if (faults.length > 0) {
    faults.sort((a, b) => a.offset - b.offset);
    const first = faults[0];
    const pos = positionOf(lineCounter, first.offset, lineOffset);
    throw new YamlError(first.code, pos.line, pos.col, first.message);
  }

  const value = doc.toJS({ maxAliasCount: 0 });
  return value === null || value === undefined ? {} : value;
}

module.exports = { parse, YamlError, MAX_INPUT_BYTES };
