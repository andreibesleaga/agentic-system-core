'use strict';
// src/governance/portable-names.js — CONTEXT Governance & Provenance.
// PURE: no fs, no process, no clock, no network; the caller lists the paths and the texts.
//
// AGSC-01-40 (1.1): names and paths that only some file systems refuse, and AGSC-04-05:
// Unicode noncharacters in authored text. Each is the warning `AGSC-E423` naming the
// file, and nothing is refused (AGSC-00-14): a Bundle that was valid stays valid.
// The reserved names, characters and the limit are those of Microsoft Learn, "Naming
// Files, Paths, and Namespaces" (read 2026-10-29), as the rule states.

const { finding } = require('./finding.js');
const { compareCodePoint } = require('../knowledge/unicode.js');
const links = require('../knowledge/links.js');

/** AGSC-01-40(a): `con`, `prn`, `aux`, `nul`, `com1`-`com9`, `lpt1`-`lpt9` and the superscript forms. */
const DEVICE_NAME = /^(?:con|prn|aux|nul|(?:com|lpt)[1-9¹²³])$/u;
/** AGSC-01-40(d): a segment that ends in a space or a period, or holds a Windows reserved character. */
const RESERVED_SEGMENT = /[ .]$|[<>:"|?*]/u;
/** AGSC-01-40(c): a path longer than this many code points. */
const MAX_PATH_CODE_POINTS = 200;
/** AGSC-01-40(b): the folders whose files are compared for case-only collisions. */
const FOLDED_FOLDERS = Object.freeze(['content/attachments/', 'content/assets/']);

const warn = (file, message) => finding('AGSC-E423', message, { file, path: file, severity: 'warn' });

/** The reasons (a), (c) and (d) of AGSC-01-40 for one path; empty when the path is portable. */
function reasonsFor(path) {
  const reasons = [];
  const segments = path.split('/');
  const device = segments.find((s) => DEVICE_NAME.test(s.split('.')[0].toLowerCase()));
  if (device !== undefined) reasons.push(`the segment "${device}" is a Windows device name`);
  if (Array.from(path).length > MAX_PATH_CODE_POINTS) {
    reasons.push(`the path is longer than ${MAX_PATH_CODE_POINTS} code points`);
  }
  const reserved = segments.find((s) => RESERVED_SEGMENT.test(s));
  if (reserved !== undefined) reasons.push(`the segment "${reserved}" ends in a space or a period or holds a reserved character`);
  return reasons;
}

/** The key two paths share when they are equal after NFC and simple case folding. */
const foldKey = (path) => path.normalize('NFC').toUpperCase().toLowerCase();

/**
 * AGSC-01-40(b): under `content/attachments/` and `content/assets/`, every path of a
 * group that folds to one name except the first in code-point order.
 *
 * @param {string[]} paths
 * @returns {Map<string, string>} later path -> first path of its group
 */
function collisions(paths) {
  const groups = new Map();
  for (const path of paths.filter((p) => FOLDED_FOLDERS.some((f) => p.startsWith(f)))) {
    const key = foldKey(path);
    groups.set(key, [...(groups.get(key) || []), path]);
  }
  const later = new Map();
  for (const group of groups.values()) {
    const sorted = [...new Set(group)].sort(compareCodePoint);
    for (const path of sorted.slice(1)) later.set(path, sorted[0]);
  }
  return later;
}

/**
 * AGSC-01-40 (a) to (d) over the files of a Bundle.
 *
 * @param {string[]} paths Bundle-relative file paths.
 * @returns {Array<object>} One warning per file that has a reason, reasons joined.
 */
function checkPaths(paths) {
  const list = Array.isArray(paths) ? paths.map(String) : [];
  const later = collisions(list);
  const findings = [];
  for (const path of list) {
    const reasons = reasonsFor(path);
    if (later.has(path)) reasons.push(`it differs from ${later.get(path)} only in case or Unicode form`);
    if (reasons.length > 0) findings.push(warn(path, `${path}: ${reasons.join('; ')}; some file systems refuse it (AGSC-01-40)`));
  }
  return findings;
}

/**
 * The index of the first noncharacter in `text`, or -1 (AGSC-04-05): U+FDD0 to U+FDEF
 * and the last two code points of each of the seventeen planes.
 */
function firstNoncharacter(text) {
  let index = 0;
  for (const ch of String(text)) {
    const cp = ch.codePointAt(0);
    if ((cp >= 0xfdd0 && cp <= 0xfdef) || (cp & 0xfffe) === 0xfffe) return index;
    index += ch.length;
  }
  return -1;
}

/**
 * AGSC-04-05 and AGSC-01-40(e): one warning for each string that holds a noncharacter.
 *
 * @param {string} file the file the strings come from.
 * @param {Array<{path:string, text:string}>} strings each with the place it was read.
 */
function checkStrings(file, strings) {
  return strings.filter((s) => firstNoncharacter(s.text) >= 0).map((s) => warn(file,
    `${file}: ${s.path} holds a Unicode noncharacter, which RFC 7493 excludes from I-JSON; it is kept unchanged (AGSC-04-05)`));
}

/**
 * Every string of a parsed value, member names included, each with a place.
 *
 * @param {*} value a parsed front matter or configuration.
 * @param {string} where the label of the root (`frontmatter`, `agsc.config.json`).
 */
function keyedStrings(value, where) {
  const out = [];
  const walk = (node, path) => {
    if (typeof node === 'string') out.push({ path, text: node });
    else if (Array.isArray(node)) node.forEach((child, i) => walk(child, `${path}/${i}`));
    else if (node !== null && typeof node === 'object') {
      for (const key of Object.keys(node)) {
        out.push({ path: `${path} member name`, text: key });
        walk(node[key], `${path}/${key}`);
      }
    }
  };
  walk(value, where);
  return out;
}

/**
 * AGSC-04-05 over a loaded Bundle: the body and the front matter (values and member
 * names) of the root document and of every item, and the configuration.
 *
 * @param {{items?:Array<object>, index?:{body:string, frontmatter:object}, config?:object}} bundle
 */
function checkBundleText(bundle) {
  const findings = [];
  const root = bundle.index;
  if (root) {
    findings.push(...checkStrings('content/index.md', [{ path: 'the body', text: root.body || '' },
      ...keyedStrings(root.frontmatter, 'frontmatter')]));
  }
  for (const item of bundle.items || []) {
    const v = links.view(item);
    findings.push(...checkStrings(v.path, [{ path: 'the body', text: v.body }, ...keyedStrings(v.fm, 'frontmatter')]));
  }
  if (bundle.config) findings.push(...checkStrings('agsc.config.json', keyedStrings(bundle.config, 'configuration')));
  return findings;
}

module.exports = { checkBundleText, checkPaths, checkStrings, firstNoncharacter, keyedStrings };
