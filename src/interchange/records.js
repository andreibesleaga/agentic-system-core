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
const { provenanceLines } = require('../knowledge/provenance-header.js');
const { withoutTrailingSlashes } = require('../shared/trailing.js');

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

/**
 * What every export adapter reads from the Bundle first: the configuration, `site`, the Bundle
 * IRI (`site.base` with one trailing `/`) and the prose licence (AGSC-01-29).
 *
 * @param {object} bundle the loaded Bundle.
 * @returns {{config:object, site:object, base:string, license:string}}
 */
function exportScope(bundle) {
  const config = (bundle && bundle.config) || {};
  const site = config.site || {};
  const base = `${withoutTrailingSlashes(String(site.base || ''))}/`;
  return { config, site, base, license: (config.bundle && config.bundle.license_prose) || chunks.TERMS };
}

/**
 * `exportScope` with the terms of the licence and the AGSC-06-15 provenance lines an export
 * file starts with, and the content version those lines state (AGSC-04-25), which every
 * record of the export repeats.
 *
 * @param {object} bundle the loaded Bundle.
 * @param {{instant:string, specVersion:string, bundleVersion?:string}} options
 * @returns {{config:object, site:object, base:string, license:string, terms:string,
 *   header:string[], bundleVersion:string}}
 */
function exportHeader(bundle, options) {
  const scope = exportScope(bundle);
  const terms = chunks.termsFor(scope.license);
  const header = provenanceLines({
    bundle: scope.base, bundleVersion: options.bundleVersion, generatedAt: options.instant,
    license: scope.license, specVersion: options.specVersion, terms,
  });
  const bundleVersion = header.find((line) => line.startsWith('bundle_version: ')).slice(16);
  return { ...scope, terms, header, bundleVersion };
}

module.exports = { exportHeader, exportScope, isObject, itemText, lessonText, oneLine, plain, yamlString };
