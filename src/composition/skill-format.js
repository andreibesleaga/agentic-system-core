'use strict';
/**
 * CONTEXT Composition — the Agent Skills check of a `SKILL.md` before it is written
 * (AGSC-07-22; the format is the Agent Skills specification, agentskills.io/specification,
 * read 2026-10-29 and again 2026-11-07).
 *
 * WHY HERE. Three writers emit a `SKILL.md`: a published pack (`skills.js#packs`, AGSC-07-19,
 * for `build` and `skills`), and a Harness's per-Procedure file (`harness.js#skillFiles`,
 * AGSC-07-12, checked by the `compose` verb after the emission, because `skillFiles` is a
 * portable function whose source text the `/compose/` page ships and whose bytes must not
 * move). Each passes the file it is about to write to `check`, which reads it back the way a
 * reader of the format would: the frontmatter block by `knowledge/frontmatter.js#split` and
 * its YAML by `knowledge/yaml.js` (the pinned `yaml` library), then the six fields.
 *
 * WHAT THE RULE PINS. `name` is 1 to 64 characters of the slug grammar of AGSC-01-10 and
 * equals the name of the directory that holds the file; `description` is 1 to 1024
 * characters; `license` is present and one line; `compatibility`, if present, is at most 500
 * characters; `metadata`, if present, maps strings to strings; `allowed-tools` is absent
 * (AGSC-07-15); no other key is present. Codes: a bound E204, a missing `license` E202, a
 * `metadata` that is not a map of strings E201, `allowed-tools` E407, any other key E207. A
 * file that fails is not written, except that a bound fault in a file of the Harness, which a
 * 1.0 writer wrote, is the warning E204 and the file is written as authored (AGSC-00-14).
 * A `license` of more than one line is read as outside its bound (E204): the rule names no
 * other code for it. Characters are Unicode code points, as in every bound of AGSC-02-24.
 *
 * Own code, not a library: the format's reference validator (`skills-ref`) is Python, and
 * the JavaScript ports on npm are not the format's own, accept letters outside the slug
 * grammar and answer messages, not the five codes (audit record of B08-WP5).
 *
 * PURE: no fs, no clock, no network.
 */

const { parse } = require('../knowledge/yaml.js');
const { split } = require('../knowledge/frontmatter.js');
const { finding } = require('../knowledge/validate.js');
const slugs = require('../knowledge/slug.js');
const { singleLine } = require('../knowledge/unicode.js');

/** The six frontmatter fields of the Agent Skills format, in the specification's order. */
const FIELDS = Object.freeze(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);

/** AGSC-07-22: the bounds, in characters. */
const DESCRIPTION_MAX = 1024;
const COMPATIBILITY_MAX = 500;

const length = (text) => [...text].length;
const isText = (value) => typeof value === 'string';
const isMap = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const withinBound = (value, max) => isText(value) && length(value) >= 1 && length(value) <= max;

/**
 * The faults of the fields, each `[code, message]`, in the order of `FIELDS` and then of the
 * keys the file states.
 *
 * @param {object} fields the parsed frontmatter.
 * @param {string} directory the name of the directory that holds the file.
 * @returns {Array<[string, string]>}
 */
function faults(fields, directory) {
  const out = [];
  const { name, description, license, compatibility, metadata } = fields;
  if (!isText(name) || !slugs.isValid(name) || name !== directory) {
    out.push(['AGSC-E204', `"name" must be 1 to 64 characters of the slug grammar (AGSC-01-10) and equal the directory "${directory}"`]);
  }
  if (!withinBound(description, DESCRIPTION_MAX)) out.push(['AGSC-E204', `"description" must be 1 to ${DESCRIPTION_MAX} characters`]);
  if (license === undefined) out.push(['AGSC-E202', '"license" is missing']);
  else if (!isText(license) || license === '' || singleLine(license) !== license) out.push(['AGSC-E204', '"license" must be one line']);
  if (compatibility !== undefined && !withinBound(compatibility, COMPATIBILITY_MAX)) {
    out.push(['AGSC-E204', `"compatibility" must be 1 to ${COMPATIBILITY_MAX} characters`]);
  }
  if (metadata !== undefined && !(isMap(metadata) && Object.values(metadata).every(isText))) {
    out.push(['AGSC-E201', '"metadata" must map strings to strings']);
  }
  for (const key of Object.keys(fields)) {
    if (key === 'allowed-tools') out.push(['AGSC-E407', '"allowed-tools" is not permitted (AGSC-07-15)']);
    else if (!FIELDS.includes(key)) out.push(['AGSC-E207', `"${key}" is not a field of the Agent Skills format`]);
  }
  return out;
}

/**
 * AGSC-07-22: the findings of the check over one `SKILL.md` a writer is about to write.
 *
 * @param {string} text the bytes of the file.
 * @param {{directory:string, file:string, harness?:boolean}} where the directory that holds
 *   the file, its path for the findings, and whether it is a file of the Harness.
 * @returns {Array<object>} findings; none when the file passes. An `error` finding means the
 *   file is not written.
 */
function check(text, where) {
  const file = String(where.file);
  // Only the frontmatter block is read: the body of a pack may be larger than the size cap
  // of an item file (AGSC-01-16), which is not a bound of this format.
  const source = String(text);
  const close = source.indexOf('\n---\n');
  const parts = split(close < 0 ? source : source.slice(0, close + 5), { file });
  if (!parts.hasFrontmatter) {
    return [finding('AGSC-E101', `${file}: a SKILL.md must begin with a frontmatter block (AGSC-07-22)`, { file })];
  }
  let fields;
  try {
    fields = parse(parts.yamlText, { lineOffset: 1 });
  } catch (error) {
    return [finding(error.code, `${file}: ${error.message} (AGSC-07-22)`, { file, line: error.line })];
  }
  return faults(isMap(fields) ? fields : {}, String(where.directory)).map(([code, message]) => finding(code,
    `${file}: ${message} (AGSC-07-22, Agent Skills format)`,
    { file, severity: where.harness === true && code === 'AGSC-E204' ? 'warn' : 'error' }));
}

/**
 * AGSC-07-22 over the skill files of one Harness emission (`harness.js#emit`, `kinds.skills`):
 * each `skills/<slug>/SKILL.md` is checked as a file of the Harness, its directory the slug.
 *
 * @param {Array<{path:string, slug:string, text:string}>} files
 * @returns {Array<object>} findings: a bound fault is a warning, any other fault an error.
 */
function harnessFindings(files) {
  return (files || []).flatMap((f) => check(f.text, { directory: f.slug, file: f.path, harness: true }));
}

module.exports = { COMPATIBILITY_MAX, DESCRIPTION_MAX, FIELDS, check, harnessFindings };
