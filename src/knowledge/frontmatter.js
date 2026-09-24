'use strict';
// CONTEXT Knowledge — aggregate root: Item.
// Implements AGSC-02-01 (the frontmatter block), AGSC-01-14 (encoding),
// AGSC-01-16 (size cap), AGSC-02-02…04 (delegated to knowledge/yaml.js) and
// AGSC-01-11 (the slug is the file stem).
//
// PURE: no fs, no process, no clock, no network, no cross-context require.
//
// `split` is deliberately total: it never throws. A file with no frontmatter is a
// domain fact (`hasFrontmatter: false`) that adoption acts on (AGSC-02-91), not an
// error, and a file whose block never closes is the same fact plus AGSC-E102.

const yaml = require('./yaml.js');
const validate = require('./validate.js');
const slugs = require('./slug.js');
const { nfc } = require('./unicode.js');

const FENCE = '---';
/** UTF-8 byte length without Node's Buffer: knowledge/ stays runtime-portable. */
const utf8Length = (t) => new TextEncoder().encode(t).length;
const MAX_INPUT_BYTES = yaml.MAX_INPUT_BYTES;

/**
 * Split a Markdown file into its frontmatter block and its body (AGSC-02-01).
 *
 * @param {string} markdown the whole file.
 * @param {{file?:string}} [options]
 * @returns {{hasFrontmatter:boolean, yamlText:string, body:string, bodyLine:number, errors:Array<object>}}
 *   `bodyLine` is the 1-based file line the body starts on.
 */
function split(markdown, options = {}) {
  const file = options.file || '';
  const errors = [];
  let text = String(markdown);

  if (utf8Length(text) > MAX_INPUT_BYTES) {
    errors.push(validate.finding('AGSC-E904',
      `file exceeds the ${MAX_INPUT_BYTES}-byte cap (AGSC-01-16)`, { file }));
    return { hasFrontmatter: false, yamlText: '', body: text, bodyLine: 1, errors };
  }
  // AGSC-01-14: UTF-8 without BOM, LF endings. Both faults are reported and then
  // repaired in memory so that the rest of the diagnosis stays useful; the bytes on
  // disk are never touched here.
  if (text.charCodeAt(0) === 0xfeff) {
    errors.push(validate.finding('AGSC-E108', 'file starts with a byte-order mark (AGSC-01-14)', { file }));
    text = text.slice(1);
  }
  if (text.includes('\r')) {
    errors.push(validate.finding('AGSC-E108', 'file uses CR or CRLF line endings (AGSC-01-14)', { file }));
    text = text.replace(/\r\n?/gu, '\n');
  }
  // AGSC-01-14: no C0 control but TAB and LF anywhere in a `.md`
  // file, body included (CR is the line-ending fault above, already repaired).
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(text)) {
    errors.push(validate.finding('AGSC-E108', 'file contains a C0 control character other than TAB and LF (AGSC-01-14)', { file }));
  }
  // AGSC-01-14's other two obligations: NFC, and exactly one trailing LF.
  // Neither is repaired in memory — unlike the BOM and CRLF faults above, neither
  // blocks the rest of the diagnosis, and rewriting the body here would change the
  // bytes every downstream emitter is asked to reproduce (AGSC-04-07, AGSC-04-24).
  if (nfc(text) !== text) {
    errors.push(validate.finding('AGSC-E108', 'file content is not NFC-normalized (AGSC-01-14)', { file }));
  }
  if (text !== '') {
    if (!text.endsWith('\n')) {
      errors.push(validate.finding('AGSC-E108', 'file does not end with an LF (AGSC-01-14)', { file }));
    } else if (text.endsWith('\n\n')) {
      errors.push(validate.finding('AGSC-E108', 'file ends with more than one LF (AGSC-01-14)', { file }));
    }
  }

  const lines = text.split('\n');
  if (lines[0] !== FENCE) {
    errors.push(validate.finding('AGSC-E101', 'no frontmatter block on line 1 (AGSC-02-01)', { file }));
    return { hasFrontmatter: false, yamlText: '', body: text, bodyLine: 1, errors };
  }
  let close = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === FENCE) { close = i; break; }
    if (lines[i] === '...') {
      errors.push(validate.finding('AGSC-E107',
        'a "..." document terminator is not permitted (AGSC-02-01)', { file, line: i + 1 }));
      return { hasFrontmatter: false, yamlText: '', body: text, bodyLine: 1, errors };
    }
  }
  if (close < 0) {
    errors.push(validate.finding('AGSC-E102', 'the frontmatter block is never closed (AGSC-02-01)', { file }));
    return { hasFrontmatter: false, yamlText: '', body: text, bodyLine: 1, errors };
  }
  return {
    hasFrontmatter: true,
    yamlText: lines.slice(1, close).join('\n'),
    body: lines.slice(close + 1).join('\n'),
    bodyLine: close + 2,
    errors,
  };
}

/** True when the file carries a CLOSED frontmatter block (the AGSC-02-91 guard). */
function hasClosedFrontmatter(markdown) {
  return split(markdown).hasFrontmatter;
}

/**
 * The file line each TOP-LEVEL frontmatter key sits on, so that a Finding can point
 * at the key rather than at line 1 (AGSC-09-11).
 * @returns {Map<string, number>}
 */
function keyLines(yamlText, lineOffset = 1) {
  const map = new Map();
  yamlText.split('\n').forEach((line, i) => {
    const m = /^([A-Za-z_][A-Za-z0-9_-]*|"[^"]*"|'[^']*'):(\s|$)/u.exec(line);
    if (m) {
      const key = m[1].replace(/^["']|["']$/gu, '');
      if (!map.has(key)) map.set(key, i + 1 + lineOffset);
    }
  });
  return map;
}

/**
 * The first ATX `#` heading of a body, NFC-normalized and trimmed, or null
 * (AGSC-02-90's title source). The pattern is deliberately linear — no trailing
 * `\s*$` after a greedy `.*` — so a pathological line cannot cost quadratic time.
 */
function firstHeading(body) {
  for (const line of String(body).split('\n')) {
    const m = /^#[ \t]+(.*)$/u.exec(line);
    if (m) {
      const text = nfc(m[1]).trim();
      if (text !== '') return text;
    }
  }
  return null;
}

/**
 * Parse one item file into the shared Item record (see src/README.md).
 *
 * @param {string} markdown the whole file.
 * @param {{path?:string, schemas:object, config?:object}} options
 * @returns {{path:string, slug:string, type:(string|null), frontmatter:(object|null),
 *   body:string, lineOffset:number, findings:Array<object>}}
 */
function parseItem(markdown, options = {}) {
  const file = options.path || '';
  const parts = split(markdown, { file });
  const findings = [...parts.errors];
  const item = {
    path: file,
    slug: file ? slugs.stemOf(file).split('.')[0] : '',
    type: null,
    frontmatter: null,
    body: parts.body,
    lineOffset: parts.bodyLine,
    findings,
  };
  if (!parts.hasFrontmatter) return item;

  const lines = keyLines(parts.yamlText, 1);
  let frontmatter;
  try {
    frontmatter = yaml.parse(parts.yamlText, { lineOffset: 1 });
  } catch (e) {
    if (e instanceof yaml.YamlError) {
      findings.push(validate.finding(e.code, e.message, { file, line: e.line, col: e.col }));
      return item;
    }
    throw e;
  }
  // AGSC-02-03: parse failsafe (every scalar a string), then APPLY the types the
  // item schema declares, so `order: 1` on a cluster is the integer the schema wants
  // while an unknown key's `1e3` stays the string the failsafe reader produced.
  item.frontmatter = options.schemas
    ? validate.applyTypes(frontmatter, options.schemas.item.schema)
    : frontmatter;
  item.type = typeof item.frontmatter.type === 'string' ? item.frontmatter.type : null;

  if (options.schemas) {
    findings.push(...validate.item(item.frontmatter, {
      schemas: options.schemas,
      config: options.config,
      file,
      keyLines: lines,
      slug: item.slug,
    }));
  }
  if (file) findings.push(...validate.placement(file, item.frontmatter));
  item.findings = validate.sortFindings(findings);
  return item;
}

module.exports = { split, parseItem, hasClosedFrontmatter, keyLines, firstHeading, FENCE, MAX_INPUT_BYTES };
