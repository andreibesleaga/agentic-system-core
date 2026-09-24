'use strict';
/**
 * CONTEXT Interchange — the `board` adapter: a live board to and from the files of
 * project and product management tools (AGSC-01-26a; the live board of AGSC-10-13 and
 * AGSC-10-16).
 *
 *   export --to board --format <f>          published tasks → the tool's import file
 *   import --from board --format <f> <dir>  the tool's export files → task items
 *
 * with <f> one of asana, github, gitlab, jira, linear, markdown, notion,
 * obsidian-kanban, todotxt, trello (`interchange/board-formats.js` reads and writes
 * each through ONE intermediate table of rows).
 *
 * THE MAPPING. A task is a `concept` of `kind: task`; its state is `task_state`, one
 * of the nine Agent2Agent states (AGSC-02-99); a board is a cluster that holds at
 * least one task (AGSC-10-13); `blocked-by` is the dependency edge. A tool's state
 * word maps to a task state through `STATE_NAMES` (a fixed, documented table; an
 * unknown word is read as `TASK_STATE_UNSPECIFIED`, AGSC-11-02, and reported); the
 * word itself is always kept in `x-board-state`. The assignee is kept in
 * `x-board-assignee` — `claimed_by` is derived from history and never authored
 * (AGSC-10-13). Labels, the due date, the tool's id, the ids a link could not
 * resolve and every column the table does not name are kept in `x-board-*` keys
 * (AGSC-02-05a), never dropped. A tool `Decision`/`Spec` issue type, or a `decision`
 * / `spec` label, becomes a concept of that kind.
 *
 * EXPORT — published items only (AGSC-06-30), one file per board, deterministic. Each
 * row carries this node's own-record (base64 of the JCS of the authored frontmatter,
 * body, slug and the board's cluster), so a return import rebuilds every item and
 * board exactly; the tool ignores it (an HTML comment in a body, a column of its own
 * in a CSV, an `agsc:` key in Todo.txt).
 *
 * IMPORT. A row whose own-record is TRUSTED (`interchange/own-record.js`: it names
 * this node or a declared peer, with consistent versions) comes back item for item.
 * Every other row is foreign and is written as `status: draft`: a tracker export
 * states no licence and may hold private work, so nothing it holds is published
 * until a person decides to (AGSC-06-30). A board whose cluster the Bundle already
 * holds is joined, never rewritten. Collisions, `--dry-run` and `--replace` are the
 * shared import tail's (AGSC-01-23).
 *
 * PURE: no fs, no clock, no network.
 */

const chunks = require('../../knowledge/chunks.js');
const slugs = require('../../knowledge/slug.js');
const fix = require('../../governance/fix.js');
const { TASK_STATES, TERMINAL_STATES } = require('../../governance/boards.js');
const { canonicalize } = require('../../knowledge/jcs.js');
const { compareCodePoint, nfc, singleLine } = require('../../knowledge/unicode.js');
const { provenanceLines } = require('../../knowledge/provenance-header.js');
const { serialize, titleFor } = require('../../knowledge/adopt.js');
const { finding } = require('../../knowledge/validate.js');
const { neutraliseSingleLine } = require('../mapping.js');
const okf = require('../okf.js');
const ownRecord = require('../own-record.js');
const pii = require('../../governance/pii.js');
const { FORMATS } = require('../board-formats.js');

/** The name this adapter answers to on `export --to` and `import --from`. */
const FORMAT = 'board';

/** The `--format` values, in code-point order. */
const FORMAT_NAMES = Object.freeze(Object.keys(FORMATS).sort(compareCodePoint));

/** The kinds a board row may carry. */
const ROW_KINDS = Object.freeze(['task', 'decision', 'spec']);

/**
 * A tool's state word → a task state. Compared after lower-casing and removing
 * spaces, `-`, `_`, `:` and apostrophes, so `In Progress`, `in-progress` and
 * `IN_PROGRESS` are one word.
 */
const STATE_NAMES = Object.freeze({
  TASK_STATE_UNSPECIFIED: ['backlog', 'icebox', 'triage', 'unspecified', 'none'],
  TASK_STATE_SUBMITTED: ['todo', 'open', 'opened', 'new', 'ready', 'selectedfordevelopment', 'submitted',
    'notstarted', 'planned', 'unstarted', 'next', 'reopened'],
  TASK_STATE_WORKING: ['inprogress', 'doing', 'started', 'working', 'inreview', 'review', 'codereview', 'active',
    'wip', 'intesting', 'testing'],
  TASK_STATE_INPUT_REQUIRED: ['blocked', 'waiting', 'onhold', 'needsinfo', 'inputrequired', 'pending',
    'waitingforinput'],
  TASK_STATE_AUTH_REQUIRED: ['authrequired', 'approval', 'awaitingapproval', 'needsapproval', 'pendingapproval'],
  TASK_STATE_COMPLETED: ['done', 'closed', 'resolved', 'complete', 'completed', 'shipped', 'released', 'fixed',
    'closedcompleted'],
  TASK_STATE_FAILED: ['failed', 'failure'],
  TASK_STATE_CANCELED: ['canceled', 'cancelled', 'wontdo', 'wontfix', 'duplicate', 'notplanned',
    'closednotplanned', 'obsolete', 'abandoned'],
  TASK_STATE_REJECTED: ['rejected', 'declined', 'invalid'],
});

/** The word each state is written as, per tool (every tool accepts custom state names on import). */
const EXPORT_NAMES = Object.freeze({
  TASK_STATE_UNSPECIFIED: 'Backlog',
  TASK_STATE_SUBMITTED: 'To Do',
  TASK_STATE_WORKING: 'In Progress',
  TASK_STATE_INPUT_REQUIRED: 'Input Required',
  TASK_STATE_AUTH_REQUIRED: 'Auth Required',
  TASK_STATE_COMPLETED: 'Done',
  TASK_STATE_FAILED: 'Failed',
  TASK_STATE_CANCELED: 'Canceled',
  TASK_STATE_REJECTED: 'Rejected',
});

/** Where a tool can hold only open/closed, the state that becomes each. */
const CLOSED_AS = Object.freeze({
  TASK_STATE_COMPLETED: 'closed',
  TASK_STATE_CANCELED: 'closed:not_planned',
  TASK_STATE_FAILED: 'closed:not_planned',
  TASK_STATE_REJECTED: 'closed:not_planned',
});

function normalWord(word) {
  return String(word == null ? '' : word).toLowerCase().replace(/[\s\-_:'’]+/gu, '');
}

/** The task state a tool word names, or `null` when the table does not know it. */
function stateOfWord(word) {
  const w = normalWord(word);
  if (w === '') return null;
  for (const state of TASK_STATES) {
    if (normalWord(state) === w || normalWord(state.slice(11)) === w) return state;
    if (STATE_NAMES[state].includes(w)) return state;
  }
  return null;
}

/**
 * A row's task state: its word through the table; a checked box or a completed
 * flag makes it COMPLETED unless the word already names a terminal state; no word
 * and an unchecked box is SUBMITTED; nothing at all is UNSPECIFIED.
 *
 * @returns {{state:string, known:boolean}}
 */
function taskStateOf(row) {
  const named = stateOfWord(row.state);
  if (row.done === true && (named === null || !TERMINAL_STATES.includes(named))) {
    return { known: true, state: 'TASK_STATE_COMPLETED' };
  }
  if (named !== null) return { known: true, state: named };
  if (row.state == null || String(row.state).trim() === '') {
    return { known: true, state: row.done === false ? 'TASK_STATE_SUBMITTED' : 'TASK_STATE_UNSPECIFIED' };
  }
  return { known: false, state: 'TASK_STATE_UNSPECIFIED' };
}

/**
 * The word a task state is written as in `format`. A foreign item's own word
 * (`x-board-state`) is written back when it still names the item's state, so a
 * board's `In Review` survives a round trip.
 */
function wordFor(format, state, kept) {
  if (kept != null && stateOfWord(kept) === state) return String(kept);
  if (format === 'github') return CLOSED_AS[state] || 'open';
  if (format === 'gitlab') {
    if (CLOSED_AS[state] !== undefined) return 'closed';
    return state === 'TASK_STATE_SUBMITTED' ? 'opened' : EXPORT_NAMES[state];
  }
  if (format === 'linear' && state === 'TASK_STATE_SUBMITTED') return 'Todo';
  if (format === 'agsc-board') return state;
  return EXPORT_NAMES[state] || EXPORT_NAMES.TASK_STATE_UNSPECIFIED;
}

// ----------------------------------------------------------------------- records

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function plain(value) {
  const out = Object.create(null);
  if (isObject(value)) for (const key of Object.keys(value)) out[key] = value[key];
  return out;
}

function encodeRecord(record) {
  return Buffer.from(canonicalize(record), 'utf8').toString('base64');
}

/** The own-record of one row, or `null` when it does not decode to a task item and its board. */
function decodeRecord(b64) {
  let value;
  try {
    value = JSON.parse(Buffer.from(String(b64), 'base64').toString('utf8'));
  } catch (e) {
    return null;
  }
  const item = (v) => isObject(v) && isObject(v.frontmatter) && typeof v.body === 'string'
    && typeof v.slug === 'string' && slugs.isValid(v.slug);
  if (!item(value) || value.type !== 'concept' || (value.board !== undefined && !item(value.board))) return null;
  return value;
}

/** The lint-normalized bytes of one item (AGSC-04-19), as every import lane writes them. */
function itemText(frontmatter, body, itemSchema) {
  const type = String(frontmatter.type);
  const ordered = fix.orderKeys(frontmatter, fix.declaredOrder(itemSchema, type), itemSchema, type, null);
  return fix.normaliseText(`${serialize(fix.quoteTemporal(ordered))}${nfc(body)}`);
}

// ------------------------------------------------------------------------ export

/** The row kind of an item on a board, or `null` for an item that is not a board row. */
function rowKind(item) {
  if (item.type !== 'concept') return null;
  return ROW_KINDS.includes(item.kind) ? item.kind : null;
}

/**
 * `export --to board --format <f>`: one file per board, in path order.
 *
 * @param {object} bundle the loaded Bundle.
 * @param {{instant:string, sha256:(t:string)=>string, specVersion:string, bundleVersion?:string,
 *   flags?:object}} options
 * @returns {{files:Array<{path:string,text:string,sha256:string}>, findings:Array<object>}}
 */
function run(bundle, options) {
  const format = String((options.flags || {}).format == null ? '' : options.flags.format);
  if (FORMATS[format] === undefined) {
    return {
      files: [],
      findings: [finding('AGSC-E003', `export --to board needs --format <name>, one of ${FORMAT_NAMES.join(', ')}`
        + `${format === '' ? '' : ` (${JSON.stringify(format)} is not one)`} (AGSC-01-26a)`, { file: '', line: 1 })],
    };
  }
  const writer = FORMATS[format];
  const config = (bundle && bundle.config) || {};
  const site = config.site || {};
  const base = `${String(site.base || '').replace(/\/+$/u, '')}/`;
  const license = (config.bundle && config.bundle.license_prose) || chunks.TERMS;
  const header = provenanceLines({
    bundle: base, bundleVersion: options.bundleVersion, generatedAt: options.instant,
    license, specVersion: options.specVersion, terms: chunks.termsFor(license),
  });
  const bundleVersion = header.find((line) => line.startsWith('bundle_version: ')).slice(16);

  const published = ((bundle && bundle.items) || [])
    .filter((item) => item && item.frontmatter)
    .map((item) => ({ authored: item.frontmatter,
      flat: { ...item.frontmatter, body: item.body, slug: item.slug, type: item.type } }))
    .filter((entry) => chunks.isPublished(entry.flat, config.releases))
    .sort((a, b) => compareCodePoint(String(a.flat.slug), String(b.flat.slug)));
  const clusters = new Map(published.filter((e) => e.flat.type === 'cluster').map((e) => [String(e.flat.slug), e]));
  const byBoard = new Map();
  let unfiled = 0;
  for (const entry of published) {
    if (rowKind(entry.flat) === null) continue;
    const primary = Array.isArray(entry.flat.clusters) ? String(entry.flat.clusters[0]) : null;
    if (primary === null || !clusters.has(primary)) {
      if (entry.flat.kind === 'task') unfiled += 1;
      continue;
    }
    if (!byBoard.has(primary)) byBoard.set(primary, []);
    byBoard.get(primary).push(entry);
  }
  const findings = [];
  if (unfiled > 0) {
    findings.push(finding('AGSC-E506', `${unfiled} published task(s) belong to no published cluster, so they are on`
      + ' no board (AGSC-10-13) and were not exported', { file: '', severity: 'warn' }));
  }
  // A cluster is a board only when it holds a task (AGSC-10-13); decisions and specs
  // travel with the board they are filed on.
  const boards = [...byBoard.keys()].filter((slug) => byBoard.get(slug).some((e) => e.flat.kind === 'task'))
    .sort(compareCodePoint);
  const ids = new Map();
  for (const slug of boards) for (const e of byBoard.get(slug)) ids.set(String(e.flat.slug), String(e.flat.slug));
  const files = [];
  for (const slug of boards) {
    const cluster = clusters.get(slug);
    const board = {
      iri: `${base}clusters/${slug}/`,
      description: singleLine(String(cluster.flat.description == null ? cluster.flat.title : cluster.flat.description)),
      slug,
      title: singleLine(String(cluster.flat.title == null ? slug : cluster.flat.title)),
    };
    const clusterRecord = { body: String(cluster.flat.body == null ? '' : cluster.flat.body),
      frontmatter: cluster.authored, slug };
    const rows = byBoard.get(slug).map(({ authored, flat }) => {
      const kind = rowKind(flat);
      const state = kind === 'task' ? (TASK_STATES.includes(flat.task_state) ? flat.task_state : 'TASK_STATE_UNSPECIFIED')
        : 'TASK_STATE_COMPLETED';
      const labels = [...new Set([
        ...(Array.isArray(flat['x-board-labels']) ? flat['x-board-labels'].map(String) : []),
        ...(Array.isArray(flat.tags) ? flat.tags.map(String) : []),
        ...(kind === 'task' ? [] : [kind]),
      ])];
      return {
        assignee: flat['x-board-assignee'] == null ? null : String(flat['x-board-assignee']),
        blockedBy: (Array.isArray(flat['blocked-by']) ? flat['blocked-by'] : [])
          .map((s) => String(s).split('#')[0]).filter((s) => ids.has(s)),
        body: String(flat.body == null ? '' : flat.body).replace(/\n+$/u, ''),
        created: flat.date == null ? null : String(flat.date).slice(0, 10),
        done: state === 'TASK_STATE_COMPLETED',
        due: flat['x-board-due'] == null ? null : String(flat['x-board-due']),
        a2a: state,
        id: String(flat.slug),
        iri: `${base}concepts/${flat.slug}/`,
        kind: kind === 'task' ? null : kind,
        labels,
        record: encodeRecord({
          body: String(flat.body == null ? '' : flat.body), board: clusterRecord, bundle: base,
          bundle_version: bundleVersion, frontmatter: authored, slug: String(flat.slug),
          spec_version: String(options.specVersion), type: 'concept',
        }),
        state: wordFor(format, state, flat['x-board-state']),
        title: singleLine(String(flat.title == null ? flat.slug : flat.title)),
        updated: flat.modified == null ? null : String(flat.modified).slice(0, 10),
      };
    });
    const text = writer.write(board, rows, header);
    files.push({ path: `${format}/${slug}${writer.ext}`, sha256: options.sha256(text), text });
  }
  if (files.length === 0) {
    findings.push(finding('AGSC-E506', 'no published cluster holds a published task, so there is no board to'
      + ' export (AGSC-10-13)', { file: '', severity: 'warn' }));
  }
  return { files, findings };
}

// ------------------------------------------------------------------------ import

/** The file extensions `--format <f>` reads. */
function extensionsOf(format) {
  const one = FORMATS[format];
  if (one === undefined) return [];
  return one.exts || [one.ext];
}

/** Is this path one `--format <f>` reads? */
function isBoardFile(format, path) {
  const lower = String(path).toLowerCase();
  return extensionsOf(format).some((ext) => lower.endsWith(ext));
}

function oneLine(value, max) {
  if (value == null) return null;
  const text = nfc(String(value)).replace(/\s+/gu, ' ').trim();
  if (text === '') return null;
  return [...text].length > max ? [...text].slice(0, max).join('') : text;
}

/** The privacy check's own patterns (AGSC-08-16), global, so every match is replaced. */
const EMAIL = new RegExp(`(${pii.EMAIL.source.replace('@', ')@')}`, 'gu');
const PHONES = pii.PHONE.map((p) => new RegExp(p.source, 'gu'));

/** A text with each e-mail address reduced to its local part and each telephone number removed. */
function redact(text, redacted) {
  let out = String(text).replace(EMAIL, (_, local) => { redacted.count += 1; return local; });
  for (const phone of PHONES) out = out.replace(phone, () => { redacted.count += 1; return '[telephone number]'; });
  return out;
}

/** Every string of a foreign row's frontmatter (prov aside) redacted; its values are strings or string arrays. */
function withoutPii(fm, redacted) {
  const walk = (value) => (typeof value === 'string' ? redact(value, redacted) : value.map(walk));
  const out = Object.create(null);
  for (const key of Object.keys(fm)) out[key] = key === 'prov' ? fm[key] : walk(fm[key]);
  return out;
}

/** A cluster's frontmatter for a board the Bundle does not hold yet (drafted, like its tasks). */
function boardCluster(name, format, prov) {
  const fm = Object.create(null);
  fm.type = 'cluster';
  const derived = titleFor('', oneLine(name, 120) || 'board', slugs.slugify(name));
  fm.title = derived.title;
  fm.description = `Tasks of the board ${JSON.stringify(derived.title)}, imported from a ${format} export.`;
  fm.status = 'draft';
  fm.prov = prov;
  return fm;
}

/**
 * The import plan: what would be written, in code-point path order.
 *
 * @param {object} files source-relative path → text, for the files `isBoardFile` names.
 * @param {object} options
 * @param {string} options.format the `--format`.
 * @param {string} options.operator `bundle.operator` of the TARGET Bundle (AGSC-08-01).
 * @param {object} options.itemSchema the raw `schema/item.schema.json`.
 * @param {string} options.toolSpecVersion this engine's `spec_version`.
 * @param {(slug:string)=>boolean} [options.hasCluster] does the target Bundle hold this cluster already?
 * @param {boolean} [options.allowNewer]
 * @param {string} [options.sourceVersion]
 * @returns {{findings:Array<object>, refused:boolean, totals:object, writes:Array<{path:string,text:string}>}}
 */
function plan(files, options) {
  const opts = options || {};
  const format = String(opts.format);
  const reader = FORMATS[format];
  const totals = { boards_joined: 0, boards_new: 0, files_unreadable: 0, foreign: 0, items: 0, own: 0,
    records_rejected: 0, records_untrusted: 0, states_unknown: 0 };
  const findings = [];
  if (reader === undefined) {
    return { findings: [finding('AGSC-E003', `import --from board needs --format <name>, one of`
      + ` ${FORMAT_NAMES.join(', ')} (AGSC-01-26a)`, { file: '', line: 1 })], refused: true, totals, writes: [] };
  }
  const archive = plain(files);
  const paths = Object.keys(archive).filter((p) => isBoardFile(format, p)).sort(compareCodePoint);
  const rows = [];
  for (const path of paths) {
    let read;
    try {
      read = reader.parse(String(archive[path]), path);
    } catch (e) {
      totals.files_unreadable += 1;
      findings.push(finding('AGSC-E506', `${path}: not imported: it is not a ${format} export this adapter reads`
        + ` (${e && e.message})`, { file: path, line: 1, severity: 'warn' }));
      continue;
    }
    for (const note of read.notes) findings.push(finding('AGSC-E506', `${path}: ${note}`, { file: path, line: 1, severity: 'warn' }));
    const header = ownRecord.headerOf(String(archive[path]));
    for (const one of read.rows) rows.push({ ...one, header, path });
  }

  // Pass 1: our own rows. A record is trusted only from this node or a declared peer.
  const origins = ownRecord.trustedOrigins(opts);
  const own = [];
  const foreign = [];
  for (const one of rows) {
    if (one.record === null) {
      foreign.push(one);
      continue;
    }
    const record = decodeRecord(one.record);
    if (record === null) {
      totals.records_rejected += 1;
      findings.push(finding('AGSC-E201', `${one.path}:${one.line}: an agsc-item record does not decode to a board`
        + ' item; the row is read as foreign', { file: one.path, line: one.line, severity: 'warn' }));
      foreign.push(one);
      continue;
    }
    const why = ownRecord.distrust(record, origins, one.header);
    if (why !== null) {
      totals.records_untrusted += 1;
      findings.push(finding('AGSC-E506', `${one.path}:${one.line}: the agsc-item record is not trusted: ${why}. Its`
        + ' provenance and status were ignored and the row is read as foreign',
      { file: one.path, line: one.line, severity: 'warn' }));
      foreign.push(one);
      continue;
    }
    own.push({ one, record });
  }
  for (const entry of own) {
    const declared = entry.record.spec_version;
    const tooNew = okf.versionRefusal(declared == null ? null : String(declared), {
      allowNewer: opts.allowNewer === true, toolSpecVersion: opts.toolSpecVersion,
    });
    if (tooNew !== null) {
      return { findings: [{ ...tooNew, file: entry.one.path, line: entry.one.line }], refused: true, totals, writes: [] };
    }
  }
  const taken = new Set();
  const items = [];
  const boardSlugs = new Map();
  const withSource = (fm, record) => {
    const prov = plain(fm.prov);
    delete prov.source_version;
    delete prov.source_hash;
    prov.source_version = record.bundle_version;
    fm.prov = { ...prov };
    return fm;
  };
  for (const { record } of own) {
    if (taken.has(record.slug)) continue;
    taken.add(record.slug);
    const fm = withSource(plain(record.frontmatter), record);
    fm.type = 'concept';
    items.push({ body: record.body, fm, slug: record.slug, type: 'concept' });
    totals.own += 1;
    if (record.board !== undefined && !boardSlugs.has(record.board.slug)) {
      boardSlugs.set(record.board.slug, record.board.slug);
      const cfm = withSource(plain(record.board.frontmatter), record);
      cfm.type = 'cluster';
      items.push({ body: record.board.body, fm: cfm, slug: record.board.slug, type: 'cluster' });
    }
  }

  // Pass 2: the foreign rows, in file then row order.
  const prov = () => {
    const p = { operator: String(opts.operator === undefined ? 'human:unknown' : opts.operator), origin: 'imported' };
    if (typeof opts.sourceVersion === 'string') p.source_version = opts.sourceVersion;
    return p;
  };
  const hasCluster = typeof opts.hasCluster === 'function' ? opts.hasCluster : () => false;
  // Boards first, so a task never takes the slug of the board it sits on.
  const boardOf = new Map();
  for (const one of foreign) {
    const boardName = oneLine(one.board, 400) || 'board';
    if (boardOf.has(boardName)) continue;
    const wanted = slugs.slugify(boardName);
    if (boardSlugs.has(wanted) || hasCluster(wanted)) {
      boardOf.set(boardName, wanted);
      if (!boardSlugs.has(wanted)) totals.boards_joined += 1;
      boardSlugs.set(wanted, wanted);
      continue;
    }
    const slug = slugs.dedupe(wanted, taken);
    taken.add(slug);
    boardSlugs.set(slug, slug);
    boardOf.set(boardName, slug);
    totals.boards_new += 1;
    items.push({ body: '', fm: boardCluster(boardName, format, prov()), foreign: true, slug, type: 'cluster' });
  }
  const redacted = { count: 0 };
  const idToSlug = new Map();
  const planned = [];
  for (const one of foreign) {
    const stem = oneLine(one.title, 400) || '';
    const slug = slugs.dedupe(slugs.slugify(stem === '' ? `${one.board || 'task'} ${one.line}` : stem), taken);
    taken.add(slug);
    if (one.id != null && !idToSlug.has(String(one.id))) idToSlug.set(String(one.id), slug);
    planned.push({ one, slug, stem });
  }
  for (const { one, slug, stem } of planned) {
    const boardSlug = boardOf.get(oneLine(one.board, 400) || 'board');
    const derived = titleFor('', stem === '' ? slug : stem, slug);
    findings.push(...derived.findings.map((f) => ({ ...f, file: one.path, line: one.line })));
    const kind = one.kind === null ? 'task' : one.kind;
    const fm = Object.create(null);
    fm.type = 'concept';
    fm.title = derived.title;
    fm.status = 'draft';
    if (one.created) fm.date = one.created;
    if (one.updated) fm.modified = one.updated;
    fm.clusters = [boardSlug];
    fm.prov = prov();
    fm.kind = kind;
    const resolved = [];
    const unresolved = [];
    for (const id of one.blockedBy) {
      if (idToSlug.has(String(id))) resolved.push(idToSlug.get(String(id)));
      else unresolved.push(String(id));
    }
    if (resolved.length > 0) fm['blocked-by'] = [...new Set(resolved)];
    if (kind === 'task') {
      const state = taskStateOf(one);
      fm.task_state = state.state;
      if (!state.known) {
        totals.states_unknown += 1;
        findings.push(finding('AGSC-E506', `${one.path}:${one.line}: the state ${JSON.stringify(String(one.state))}`
          + ' names no task state this adapter knows; it was read as TASK_STATE_UNSPECIFIED (AGSC-11-02) and kept'
          + ' in x-board-state', { file: one.path, line: one.line, severity: 'warn' }));
      }
    }
    if (one.assignee != null && String(one.assignee).trim() !== '') fm['x-board-assignee'] = oneLine(one.assignee, 200);
    if (one.due) fm['x-board-due'] = one.due;
    if (Object.keys(one.fields).length > 0) fm['x-board-fields'] = canonicalize(one.fields);
    if (one.id != null) fm['x-board-id'] = String(one.id);
    if (one.labels.length > 0) fm['x-board-labels'] = [...new Set(one.labels.map(String))];
    if (unresolved.length > 0) fm['x-board-links'] = unresolved;
    fm['x-board-source'] = `${format}:${one.path}:${one.line}`;
    if (one.state != null && String(one.state).trim() !== '') fm['x-board-state'] = oneLine(one.state, 200);
    const clean = neutraliseSingleLine(withoutPii(fm, redacted));
    const body = redact(String(one.body == null ? '' : one.body).replace(/\r\n?/gu, '\n').trim(), redacted);
    items.push({ body: body === '' ? '' : `${nfc(body)}\n`, fm: plain(clean.frontmatter), foreign: true, slug, type: 'concept' });
  }

  const writes = items.map((item) => ({
    path: `content/${okf.TYPE_PLURAL[item.type]}/${item.slug}.md`,
    text: itemText(item.fm, item.body, opts.itemSchema),
  }));
  totals.foreign = items.filter((item) => item.foreign && item.type === 'concept').length;
  totals.items = writes.length;
  if (totals.foreign > 0) {
    findings.push(finding('AGSC-E506',
      `${totals.foreign} ${format} row(s) were imported as status: draft with { origin: imported, operator:`
      + ` ${String(opts.operator)} } synthesized (AGSC-08-01): a tracker export states no licence and may hold`
      + ' private work, so nothing it holds is published until a person changes the status (AGSC-06-30)'
      + `${typeof opts.sourceVersion === 'string' ? '' : '; pass --source-version <v> to record the export\'s version'}`,
      { file: '', severity: 'warn' }));
  }
  if (redacted.count > 0) {
    findings.push(finding('AGSC-E506', `${redacted.count} e-mail address(es) or telephone number(s) in the rows were`
      + ' reduced (an address to the part before the @, a number removed): an item may carry neither outside'
      + ' prov and sources[] (AGSC-08-16)', { file: '', severity: 'warn' }));
  }
  writes.sort((a, b) => compareCodePoint(a.path, b.path));
  return { findings, refused: false, totals, writes };
}

module.exports = {
  CLOSED_AS, EXPORT_NAMES, FORMAT, FORMAT_NAMES, STATE_NAMES,
  decodeRecord, encodeRecord, extensionsOf, isBoardFile, plan, run, stateOfWord, taskStateOf, wordFor,
};
