'use strict';
/**
 * CONTEXT Interchange — memory adapter `csv` (AGSC-01-26a): a table of items, both
 * ways, in RFC 4180 CSV, for a spreadsheet, a database or any memory tool that loads
 * a table.
 *
 * The CSV text is written by `csv-stringify` and read by `csv-parse` (the node-csv
 * project, MIT, pinned exactly in `package.json`), never by code of this engine: the
 * quoting of a field with a comma, a quote or a line break is the library's.
 *
 * EXPORT `export --to csv` → `items.csv` and `PROVENANCE.md`. `items.csv` has a header
 * row and one row per published item (AGSC-06-30), in slug order, records separated
 * by CRLF as RFC 4180 §2 writes them, with the columns
 *   `slug`, `type`, `title`, `description`, `tags` (joined by `; `), `date`,
 *   `modified`, `iri`, `body`, `agsc`
 * where `agsc` is the item's own record as JSON (JCS): the authored frontmatter, the
 * body, the licence and the Content Use Terms, so the item comes back exactly. A CSV
 * file has no place for a comment, so the AGSC-06-15 provenance header (AGSC-01-29)
 * travels beside it in `PROVENANCE.md`, and the licence and terms also ride in every
 * row's `agsc`. A cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return
 * (or a full-width `=`, `+`, `-`, `@`) is written behind one `'`, the library's
 * `escape_formulas`, so a spreadsheet shows it as text and never runs it (CSV
 * injection; the board writer guards its CSV the same way); the `agsc` cell starts with
 * `{`, so the exact round trip is unaffected.
 *
 * IMPORT `import --from csv <dir>` reads every `*.csv` file of the folder. The first
 * row names the columns (case and surrounding spaces ignored). A row whose `agsc`
 * this node trusts is OUR OWN and comes back item for item. Any other row is FOREIGN:
 * a `concept` of kind `explainer` (the adoption default, AGSC-02-90), status `draft`
 * (AGSC-01-22), whose title is `title` (or `name`), whose body is `body` (or
 * `content`, `text`, `memory`), whose `description` is the `description` column when
 * it is one line of 40 to 200 characters (else it is kept in `x-csv-description`), and
 * whose `date` is the `date` (or `created_at`) column when it starts with a
 * `YYYY-MM-DD` date. `tags` are kept in `x-csv-tags`; every other non-empty column is
 * kept verbatim, as one JCS string `{column: value}`, in `x-csv-rest`. One `'` before a
 * formula character, put there by this export or a careful exporter, is removed from a
 * foreign cell. A row with
 * neither a title nor a body is reported and skipped; a file the library cannot read
 * (a quote left open, rows of different lengths) is reported and skipped whole.
 *
 * PURE: no fs, no clock, no network. Requirements: AGSC-00-22, AGSC-01-22,
 * AGSC-01-23, AGSC-01-26a, AGSC-01-29, AGSC-06-30; PRD-026, PRD-070.
 */

const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const memory = require('../memory-records.js');
const { canonicalize } = require('../../knowledge/jcs.js');
const { compareCodePoint, nfc } = require('../../knowledge/unicode.js');
const { finding } = require('../../knowledge/validate.js');
const { oneLine } = require('../records.js');

/** The name this adapter answers to on `export --to` and `import --from`. */
const FORMAT = 'csv';

/** The two files the export writes. */
const FILE = 'items.csv';
const PROVENANCE = 'PROVENANCE.md';

/** The columns of the export, in order. */
const COLUMNS = Object.freeze(['slug', 'type', 'title', 'description', 'tags', 'date', 'modified', 'iri', 'body', 'agsc']);

/** Which foreign column fills which part of an item, first match wins. */
const TITLE = Object.freeze(['title', 'name']);
const BODY = Object.freeze(['body', 'content', 'text', 'memory']);
const DATE = Object.freeze(['date', 'created_at']);

/** The keys this adapter claims (AGSC-01-26a), for the implementer documentation. */
const CLAIMED_KEYS = Object.freeze({
  export: 'every authored frontmatter key and the body of every published item (in the agsc column)',
  import: Object.freeze([...TITLE, ...BODY, 'description', ...DATE, 'tags', 'agsc']),
});

/** A cell's text: a string as it is, a list joined, anything else empty. */
function cell(value) {
  if (Array.isArray(value)) return value.map(String).join('; ');
  return value == null ? '' : String(value);
}

/**
 * `export --to csv`.
 *
 * @param {object} bundle the loaded Bundle.
 * @param {{instant:string, sha256:(t:string)=>string, specVersion:string, bundleVersion?:string}} options
 * @returns {{files:Array<{path:string, text:string, sha256:string}>, findings:Array<object>}}
 */
function run(bundle, options) {
  const { entries, header } = memory.exportRecords(bundle, options);
  const rows = entries.map(({ item, record }) => [item.slug, item.type, item.title, item.description, item.tags,
    item.date, item.modified, record.iri, record.body, canonicalize(record)].map(cell));
  // A field holding a line break is quoted, a bare LF too: only CRLF ends a record (RFC 4180).
  const table = stringify([[...COLUMNS], ...rows], { escape_formulas: true, quoted_match: /[\r\n]/u, record_delimiter: 'windows' });
  const note = [...header, '', `# ${FILE}`, '',
    `One row per published item of ${header[1].slice('bundle: '.length)}, under the licence and the Content Use Terms`
    + ' named above. The `agsc` column holds each item whole, for `agsc import --from csv`.', ''].join('\n');
  return { files: memory.filesOf(new Map([[FILE, table], [PROVENANCE, note]]), options.sha256), findings: [] };
}

/** Is this a file the import reads? */
function isSourceFile(path) {
  return String(path).toLowerCase().endsWith('.csv');
}

/** The `'` a careful writer puts before a cell a spreadsheet would read as a formula. */
const ESCAPED_FORMULA = /^'[=+\-@\t\r\uFF1D\uFF0B\uFF0D\uFF20]/u;

/** A foreign cell as its author wrote it: the formula escape removed. */
function uncell(value) {
  return ESCAPED_FORMULA.test(value) ? value.slice(1) : value;
}

/** The first non-empty value among `names`, or `''`. */
function pick(row, names) {
  for (const name of names) if (typeof row[name] === 'string' && row[name].trim() !== '') return uncell(row[name]);
  return '';
}

/** The own record of a row's `agsc` cell, or `null`. */
function agscOf(row) {
  if (typeof row.agsc !== 'string' || row.agsc.trim() === '') return null;
  try {
    return memory.agscIn({ agsc: JSON.parse(row.agsc) });
  } catch (e) {
    return null;
  }
}

/** One foreign row, mapped. */
function foreign(row, where) {
  const title = oneLine(pick(row, TITLE), 400) || '';
  const body = nfc(pick(row, BODY)).trim();
  if (title === '' && body === '') return { skip: `${where}: not imported: the row has neither a title nor a body` };
  const fm = { kind: 'explainer' };
  const description = pick(row, ['description']);
  const single = oneLine(description, 200);
  if (single !== null && single === description && [...single].length >= 40) fm.description = single;
  else if (description !== '') fm['x-csv-description'] = description;
  const tags = pick(row, ['tags']).split(/[;,]/u).map((t) => t.trim()).filter((t) => t !== '');
  if (tags.length > 0) fm['x-csv-tags'] = tags;
  const claimed = [...TITLE, ...BODY, 'description', 'tags', 'agsc', ...DATE];
  const rest = Object.create(null);
  for (const name of Object.keys(row).sort(compareCodePoint)) {
    if (!claimed.includes(name) && row[name] !== '') rest[name] = uncell(row[name]);
  }
  if (Object.keys(rest).length > 0) fm['x-csv-rest'] = canonicalize(rest);
  return { body: body === '' ? '' : `${body}\n`, date: memory.dateOf(pick(row, DATE)), fm,
    stem: title === '' ? body.split('\n')[0] : title, type: 'concept' };
}

/** The rows of one CSV file as objects keyed by the normalised header, with their lines. */
function rowsOf(path, text) {
  let records;
  try {
    records = parse(String(text), { bom: true, info: true, skip_empty_lines: true });
  } catch (e) {
    return { findings: [finding('AGSC-E201', `${path}: not imported: the file is not CSV the library can read`
      + ` (${e && e.message})`, { file: path, line: 1, severity: 'warn' })], rows: [] };
  }
  if (records.length === 0) return { findings: [], rows: [] };
  const names = records[0].record.map((name) => String(name).trim().toLowerCase());
  const rows = records.slice(1).map(({ info, record }) => {
    const row = Object.create(null);
    names.forEach((name, i) => {
      if (name !== '' && row[name] === undefined) row[name] = String(record[i] == null ? '' : record[i]);
    });
    return { line: info.lines, row };
  });
  return { findings: [], rows };
}

/**
 * The import plan of `import --from csv`.
 *
 * @param {object} files folder-relative path → text, for every file `isSourceFile` names.
 * @param {object} options as `memory-records.js#plan`.
 * @returns {{findings:Array<object>, refused:boolean, totals:object, writes:Array<object>}}
 */
function plan(files, options) {
  const findings = [];
  const candidates = [];
  for (const path of Object.keys(files).filter(isSourceFile).sort(compareCodePoint)) {
    const read = rowsOf(path, files[path]);
    findings.push(...read.findings);
    for (const { line, row } of read.rows) {
      const where = `${path}:${line}`;
      const agsc = agscOf(row);
      const mapped = foreign(row, where);
      candidates.push({ file: path, line, ...(agsc === null ? {} : { agsc }),
        ...(typeof mapped.skip === 'string' ? { skip: mapped.skip } : { foreign: mapped }) });
    }
  }
  const planned = memory.plan(candidates, options);
  return { ...planned, findings: [...findings, ...planned.findings] };
}

module.exports = { CLAIMED_KEYS, COLUMNS, FILE, FORMAT, PROVENANCE, isSourceFile, plan, run };
