'use strict';
// src/interchange/oldsite.js — CONTEXT Interchange (a foreign format, read).
//
// The old-site record reader of AGSC-01-22 (M3-T02): one authored card of
// `OldAgenticSystemPatterns.com/content/patterns/<slug>.md` in, one flat record
// out. PURE: no fs, no process, no clock, no network.
//
// The foreign format is NOT the YAML subset of AGSC-02-02 — it uses **dotted
// keys** (`references.0.label`, `diagram.file`) and flow sequences of scalars
// (`tags: [a, b]`), both of which AGSC-02-02 refuses (`AGSC-E105`). So this
// reader is the anti-corruption boundary: it accepts the foreign shape and hands
// the rest of the pipeline a plain nested object. `knowledge/yaml.js` is NOT
// reused, deliberately: it is the reader of THIS format and refusing a foreign
// file for being foreign is exactly what AGSC-01-22 forbids.
//
// Tolerance is the rule (AGSC-01-22): an unknown key, a missing optional field
// and a broken link are all carried through, never a refusal.
//
// Codes: AGSC-E101 (no frontmatter block), AGSC-E102 (unterminated),
// AGSC-E904 (over the AGSC-01-16 cap) — all three registered in spec/09 §9.4.

const { finding } = require('../knowledge/validate.js');
const { nfc } = require('../knowledge/unicode.js');

/** AGSC-01-16: the size cap every parsed input lives under. */
const MAX_BYTES = 1048576;

/** The fence AGSC-02-01 uses, and the old site uses too. */
const FENCE = '---';

/** A dotted key: `references.0.label` -> ['references', '0', 'label']. */
const KEY_LINE = /^([A-Za-z0-9_.]+):[ \t]*(.*)$/u;

/** A flow sequence of scalars: `[a, b, "c, d"]`. */
function parseFlowSequence(text) {
  const inner = text.slice(1, -1);
  const out = [];
  let current = '';
  let quote = '';
  for (const ch of inner) {
    if (quote !== '') {
      if (ch === quote) quote = '';
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ',') {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim() !== '' || out.length > 0) out.push(current.trim());
  return out.filter((v) => v !== '');
}

/** One scalar: a quoted string keeps its bytes, a plain one is trimmed. */
function parseScalar(text) {
  const value = text.trim();
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1);
  }
  return value;
}

/** `true`/`false` are the only booleans the old format writes. */
function parseValue(text) {
  const raw = text.trim();
  if (raw.startsWith('[') && raw.endsWith(']')) return parseFlowSequence(raw);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return parseScalar(raw);
}

/**
 * Set `path` (a dotted key, split) inside `target`, creating arrays for numeric
 * segments. `Object.create(null)` throughout, so a key called `__proto__`
 * cannot reach `Object.prototype` (secure-coding: prototype pollution).
 */
function setDotted(target, segments, value) {
  let node = target;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const key = segments[i];
    const nextIsIndex = /^[0-9]+$/u.test(segments[i + 1]);
    if (Array.isArray(node)) {
      const index = Number(key);
      if (node[index] === undefined) node[index] = nextIsIndex ? [] : Object.create(null);
      node = node[index];
      continue;
    }
    if (node[key] === undefined || typeof node[key] !== 'object' || node[key] === null) {
      node[key] = nextIsIndex ? [] : Object.create(null);
    }
    node = node[key];
  }
  const last = segments[segments.length - 1];
  if (Array.isArray(node)) node[Number(last)] = value;
  else node[last] = value;
}

/**
 * Read one old card.
 *
 * @param {{path:string, markdown:string}} file
 * @returns {{slug:string, path:string, record:object, body:string,
 *            keys:string[], findings:Array<object>}}
 *   `record` is the nested frontmatter, `body` the bytes after the closing fence
 *   with LF endings, NFC and exactly one trailing LF (AGSC-01-14 — the old site
 *   leaves 42 of its 153 diagram sources without one).
 */
function readCard(file) {
  const path = String(file.path).split('\\').join('/');
  const slug = path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/u, '');
  const findings = [];
  const text = String(file.markdown === undefined ? '' : file.markdown);

  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) {
    findings.push(finding('AGSC-E904',
      `"${path}" is over the ${MAX_BYTES}-byte cap (AGSC-01-16)`, { file: path, slug, line: 1 }));
    return { slug, path, record: Object.create(null), body: '', keys: [], findings };
  }

  const normalised = nfc(text.split('\r\n').join('\n').split('\r').join('\n'));
  if (!normalised.startsWith(`${FENCE}\n`)) {
    findings.push(finding('AGSC-E101',
      `"${path}" carries no frontmatter block (AGSC-02-01)`, { file: path, slug, line: 1 }));
    return { slug, path, record: Object.create(null), body: normalised, keys: [], findings };
  }
  const close = normalised.indexOf(`\n${FENCE}\n`, FENCE.length);
  if (close < 0) {
    findings.push(finding('AGSC-E102',
      `"${path}" has no closing frontmatter fence (AGSC-02-01)`, { file: path, slug, line: 1 }));
    return { slug, path, record: Object.create(null), body: normalised, keys: [], findings };
  }

  const yamlText = normalised.slice(FENCE.length + 1, close + 1);
  const rawBody = normalised.slice(close + FENCE.length + 2);
  const record = Object.create(null);
  const keys = [];
  const lines = yamlText.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const match = KEY_LINE.exec(line);
    if (match === null) {
      findings.push(finding('AGSC-E101',
        `"${path}" line ${i + 2} is not a "key: value" line and was skipped (AGSC-01-22)`,
        { file: path, slug, line: i + 2, severity: 'warn' }));
      continue;
    }
    keys.push(match[1]);
    setDotted(record, match[1].split('.'), parseValue(match[2]));
  }

  // AGSC-01-14: LF, NFC, exactly one trailing LF. The body is normalised here so
  // that no later stage has to think about the foreign file's bytes.
  const body = `${rawBody.replace(/\n+$/u, '')}\n`;

  return { slug, path, record, body, keys, findings };
}

/**
 * AGSC-01-14 over a `.diagram` source: LF endings, NFC, one trailing LF. The old
 * repository leaves 42 of 153 sources without a final newline, so this is a
 * normalisation the import owes the new Bundle, not an optional tidy-up.
 *
 * @param {string} text
 * @returns {string}
 */
function normaliseSource(text) {
  const body = nfc(String(text).split('\r\n').join('\n').split('\r').join('\n'));
  return `${body.replace(/\n+$/u, '')}\n`;
}

module.exports = { MAX_BYTES, normaliseSource, parseFlowSequence, parseScalar, parseValue, readCard, setDotted };
