'use strict';
// src/interchange/selection.js — CONTEXT Interchange.
//
// The SELECTION file: which cards are imported, and with which `status`. The
// engine carries **no list of its own** — a list of a hundred slugs inside an
// implementation would be content in code, and the content plane of this project
// is files and ontologies only (project rule 9). So `import --from old-site`
// takes `--selection <tsv>` and reads the decision from there.
//
// The format is the machine-readable twin of the selection record:
// a tab-separated file whose first line is the header and whose columns include
// `slug`, `class`, `old_status` and `decision` (`CHOOSE` | `DEFER` | `EXCLUDE`).
// Unknown columns are carried through untouched (AGSC-01-22 tolerance).
//
// PURE: no fs, no process, no clock, no network.
//
// Codes: AGSC-E003 (the file names no usable column), AGSC-E203 (a decision or a
// class value outside the closed set) — both registered in spec/09 §9.4.

const { finding } = require('../knowledge/validate.js');

/** The three decisions the selection record writes. */
const DECISIONS = Object.freeze(['CHOOSE', 'DEFER', 'EXCLUDE']);

/** The four classes of the selection record; `B+W` is the book-overlap class. */
const CLASSES = Object.freeze(['W', 'B+W', 'O', 'X', 'B']);

/** The columns a row MUST carry for the import to act on it. */
const REQUIRED_COLUMNS = Object.freeze(['slug', 'decision']);

const TAB = '\t';

/**
 * Parse a selection TSV.
 *
 * @param {string} text the file's bytes.
 * @param {{file?:string}} [options]
 * @returns {{rows:Array<object>, chosen:Array<object>, columns:string[],
 *            findings:Array<object>}}
 *   `rows` is every data row in file order; `chosen` is the `CHOOSE` subset, in
 *   file order, which is the DISCOVERY ORDER AGSC-01-23 makes the slug-collision
 *   order.
 */
function parse(text, options = {}) {
  const file = options.file;
  const findings = [];
  const lines = String(text === undefined ? '' : text).split('\n').filter((l) => l !== '');
  if (lines.length === 0) {
    findings.push(finding('AGSC-E003', 'the selection file is empty (AGSC-01-22)', { file, line: 1 }));
    return { rows: [], chosen: [], columns: [], findings };
  }
  const columns = lines[0].split(TAB).map((c) => c.trim());
  for (const required of REQUIRED_COLUMNS) {
    if (columns.includes(required)) continue;
    findings.push(finding('AGSC-E003',
      `the selection file has no "${required}" column (AGSC-01-22)`, { file, line: 1 }));
  }
  if (findings.length > 0) return { rows: [], chosen: [], columns, findings };

  const rows = [];
  const seen = new Set();
  for (let i = 1; i < lines.length; i += 1) {
    const cells = lines[i].split(TAB);
    const row = Object.create(null);
    columns.forEach((name, index) => { row[name] = cells[index] === undefined ? '' : cells[index]; });
    row.line = i + 1;
    if (row.slug === '') {
      findings.push(finding('AGSC-E003',
        `selection line ${i + 1} carries no slug (AGSC-01-22)`, { file, line: i + 1 }));
      continue;
    }
    if (seen.has(row.slug)) {
      findings.push(finding('AGSC-E206',
        `selection names "${row.slug}" twice; the later row is ignored (AGSC-01-11)`,
        { file, line: i + 1, slug: row.slug }));
      continue;
    }
    seen.add(row.slug);
    if (!DECISIONS.includes(row.decision)) {
      findings.push(finding('AGSC-E203',
        `selection decision "${row.decision}" for "${row.slug}" is outside ${DECISIONS.join('|')}`,
        { file, line: i + 1, slug: row.slug }));
      continue;
    }
    if (row.class !== undefined && row.class !== '' && !CLASSES.includes(row.class)) {
      findings.push(finding('AGSC-E203',
        `selection class "${row.class}" for "${row.slug}" is outside ${CLASSES.join('|')}`,
        { file, line: i + 1, slug: row.slug, severity: 'warn' }));
    }
    rows.push(row);
  }

  return { rows, chosen: rows.filter((r) => r.decision === 'CHOOSE'), columns, findings };
}

module.exports = { CLASSES, DECISIONS, REQUIRED_COLUMNS, parse };
