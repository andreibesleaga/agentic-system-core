'use strict';
/**
 * interchange/records — the small helpers every import and export adapter shares:
 * reading a foreign JSON value safely, one-line text, and the lint-normalized bytes
 * an imported item is written with (AGSC-04-19). One definition each, so the
 * adapters cannot drift apart.
 *
 * PURE: no fs, no clock, no network.
 */

const chunks = require('../knowledge/chunks.js');
const fix = require('../governance/fix.js');
const { nfc, singleLine } = require('../knowledge/unicode.js');
const { serialize } = require('../knowledge/adopt.js');

/** Is this a JSON object (not an array, not null)? */
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** A plain object with no prototype, so a foreign `__proto__` member is only data. */
function plain(value) {
  const out = Object.create(null);
  if (isObject(value)) for (const key of Object.keys(value)) out[key] = value[key];
  return out;
}

/** A single-line string of at most `max` code points (no bound by default), or `null`. */
function oneLine(value, max = Infinity) {
  if (typeof value !== 'string') return null;
  const text = nfc(value).replace(/\s+/gu, ' ').trim();
  if (text === '') return null;
  return [...text].length > max ? [...text].slice(0, max).join('') : text;
}

/** The lint-normalized bytes of one item (AGSC-04-19), as every import lane writes them. */
function itemText(frontmatter, body, itemSchema) {
  const type = String(frontmatter.type);
  const ordered = fix.orderKeys(frontmatter, fix.declaredOrder(itemSchema, type), itemSchema, type, null);
  return fix.normaliseText(`${serialize(fix.quoteTemporal(ordered))}${nfc(body)}`);
}

/** A YAML double-quoted scalar: JSON's string form is one (YAML 1.2 §7.3.1). */
function yamlString(value) {
  return JSON.stringify(singleLine(nfc(String(value))));
}

/** The first `## Lesson` section of a lesson body, else the whole body, trimmed. */
function lessonText(body) {
  const parts = chunks.sections(String(body == null ? '' : body));
  const lesson = parts.find((part) => /^##\s+lesson\s*$/iu.test(part.text.split('\n')[0]));
  const text = lesson === undefined ? String(body == null ? '' : body)
    : lesson.text.split('\n').slice(1).join('\n');
  return text.trim();
}

module.exports = { isObject, itemText, lessonText, oneLine, plain, yamlString };
