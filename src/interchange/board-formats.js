'use strict';
/**
 * CONTEXT Interchange — the file formats of project and product management tools,
 * read into and written from ONE intermediate table (the `board` adapter's rows).
 *
 * A ROW is the tool-neutral shape of one card, issue or task:
 *   { id, title, body, state, done, board, assignee, created, updated, due,
 *     labels[], blockedBy[], kind, fields{}, record, line }
 * where `state` is the tool's own state word (verbatim), `done` the checkbox of the
 * formats that have only one (`null` elsewhere), `blockedBy` the tool ids of the
 * rows that block this one, `kind` `decision`/`spec` when the tool says so (else
 * `null`), `fields` every member of the source row the table does not name (kept,
 * never dropped), and `record` the base64 own-record this node's export writes
 * beside the row (or `null`).
 *
 * Each format is `{ext, parse(text, path) → {rows, boards, notes}, write(board, rows) → text}`.
 * `boards` names the board(s) the file states; `notes` are plain-words remarks about
 * what the file holds that no row carries (reported by the adapter, never silent).
 *
 * The shapes are the tools' own export and import files (researched 2026-09-23; the
 * sources are listed in docs/CONNECTORS.md): GitHub issues (REST `GET /issues` JSON,
 * `gh issue list --json`, `gh project item-list --format json`), GitLab issues (REST
 * JSON and the CSV export), Jira (the CSV export and the CSV importer's columns),
 * Trello (the board JSON export), Linear (the CSV export), Asana (the CSV export),
 * Notion (a database's CSV export), the Obsidian Kanban plugin (its Markdown board),
 * plain GitHub-flavoured Markdown task lists and Todo.txt.
 *
 * PURE: no fs, no clock, no network.
 */

// --------------------------------------------------------------------------- CSV

/** RFC 4180 records of a CSV text (CRLF or LF; a leading BOM ignored). */
function parseCsv(text) {
  const src = String(text).replace(/^\uFEFF/u, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 2; continue; }
      if (ch === '"') { quoted = false; i += 1; continue; }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && cell === '') { quoted = true; i += 1; continue; }
    if (ch === ',') { row.push(cell); cell = ''; i += 1; continue; }
    if (ch === '\r' || ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i += ch === '\r' && src[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

/** A spreadsheet reads a cell that starts with one of these as a formula (CSV injection). */
const FORMULA = /^[=+\-@\t\r]/u;

/** One CSV cell: formula-neutralised with a leading `'`, quoted when it must be. */
function csvCell(value) {
  let text = value == null ? '' : String(value);
  if (FORMULA.test(text)) text = `'${text}`;
  return /[",\r\n]|^\s|\s$/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

/** A CSV cell back: the `'` this writer (or a careful exporter) put before a formula character is removed. */
function uncell(value) {
  const text = String(value == null ? '' : value);
  return /^'[=+\-@\t\r]/u.test(text) ? text.slice(1) : text;
}

function writeCsv(header, records) {
  return `${[header, ...records].map((r) => r.map(csvCell).join(',')).join('\n')}\n`;
}

/**
 * CSV records as objects. A header named more than once (Jira writes one `Labels`
 * column per label) yields an array of the non-empty values under that name.
 */
function csvObjects(text) {
  const [header = [], ...records] = parseCsv(text);
  const names = header.map((h) => String(h).trim());
  const repeated = new Set(names.filter((n, i) => names.indexOf(n) !== i));
  return records.map((cells, at) => {
    const out = Object.create(null);
    names.forEach((name, i) => {
      const value = uncell(cells[i] == null ? '' : cells[i]);
      if (repeated.has(name)) {
        if (!Array.isArray(out[name])) out[name] = [];
        if (value.trim() !== '') out[name].push(value);
      } else out[name] = value;
    });
    return { line: at + 2, values: out };
  });
}

// ------------------------------------------------------------------------ helpers

const MONTHS = Object.freeze({
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
});

/**
 * A tool's date text → `YYYY-MM-DD`, or `null`. Read: ISO 8601 (with or without a
 * time), Jira's `23/Sep/26 10:15 AM`, Notion's `September 23, 2026 10:15 AM`, and
 * JavaScript's `Tue Sep 23 2026 …`. No clock and no time zone is consulted: the
 * calendar date the text states is the date kept.
 */
function dateOf(value) {
  const text = String(value == null ? '' : value).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/u.exec(text);
  if (m !== null) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/([A-Za-z]{3})\/(\d{2}|\d{4})\b/u.exec(text);
  if (m !== null && MONTHS[m[2].toLowerCase()]) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}`;
  }
  m = /^(?:[A-Za-z]{3} )?([A-Za-z]{3})[a-z]* (\d{1,2}),? (\d{4})\b/u.exec(text);
  if (m !== null && MONTHS[m[1].toLowerCase()]) return `${m[3]}-${MONTHS[m[1].toLowerCase()]}-${m[2].padStart(2, '0')}`;
  return null;
}

/** A list cell (`a, b`, or already an array) → trimmed non-empty strings. */
function listOf(value, separator = ',') {
  const parts = Array.isArray(value) ? value : String(value == null ? '' : value).split(separator);
  return parts.map((p) => String(p).trim()).filter((p) => p !== '');
}

/** The members of `source` not in `known`, as a prototype-free map (never dropped). */
function rest(source, known) {
  const out = Object.create(null);
  for (const key of Object.keys(source || {})) {
    if (known.includes(key)) continue;
    const value = source[key];
    if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) continue;
    out[key] = value;
  }
  return out;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** The label that names a kind (`decision`, `spec`) on a tool that has no such type. */
function kindOfLabels(labels) {
  const lower = labels.map((l) => l.toLowerCase().replace(/^(?:type|kind)\s*[:/]+\s*/u, ''));
  if (lower.includes('decision')) return 'decision';
  if (lower.includes('spec') || lower.includes('specification')) return 'spec';
  return null;
}

/** A row with every member present, so each format only states what it reads. */
function row(values) {
  return {
    assignee: null, blockedBy: [], board: null, body: '', created: null, done: null, due: null,
    fields: Object.create(null), id: null, kind: null, labels: [], line: 1, record: null,
    state: null, title: '', updated: null, ...values,
  };
}

/** The own-record, from a text that carries `<!-- agsc-item B64 -->` on a line of its own; and the text without it. */
function takeRecord(text) {
  const src = String(text == null ? '' : text);
  const m = /(?:^|\n)[ \t]*<!-- agsc-item ([A-Za-z0-9+/]+={0,2}) -->[ \t]*(?=\n|$)/u.exec(src);
  if (m === null) return { record: null, text: src };
  return { record: m[1], text: (src.slice(0, m.index) + src.slice(m.index + m[0].length)).replace(/\n+$/u, '') };
}

/** A body with the own-record line appended (an HTML comment: invisible where Markdown renders). */
function withRecord(body, record) {
  const text = String(body == null ? '' : body).replace(/\n+$/u, '');
  if (record == null) return text;
  return `${text}${text === '' ? '' : '\n\n'}<!-- agsc-item ${record} -->`;
}

/** The record column of the CSV formats: `agsc-item:<b64>`, so no cell starts with a formula character. */
const RECORD_COLUMN = 'AGSC record';
function recordCell(record) {
  return record == null ? '' : `agsc-item:${record}`;
}
function recordFromCell(value) {
  const m = /^agsc-item:([A-Za-z0-9+/]+={0,2})$/u.exec(String(value == null ? '' : value).trim());
  return m === null ? null : m[1];
}

/** A file stem (no directory, no extension; Notion's 32-hex suffix removed) → a board name. */
function stemOf(path) {
  return String(path).split('/').pop().replace(/\.(?:todo\.txt|[A-Za-z0-9]+)$/u, '')
    .replace(/ [0-9a-f]{32}$/u, '');
}

function parseJson(text) {
  return JSON.parse(String(text).replace(/^\uFEFF/u, ''));
}

// ------------------------------------------------------------------------ GitHub

const GITHUB_KNOWN = ['number', 'title', 'body', 'state', 'state_reason', 'stateReason', 'labels', 'assignee',
  'assignees', 'milestone', 'created_at', 'createdAt', 'updated_at', 'updatedAt', 'closed_at', 'closedAt'];

function githubIssue(issue, at, board) {
  const labels = listOf((Array.isArray(issue.labels) ? issue.labels : [])
    .map((l) => (isObject(l) ? l.name : l)).filter((l) => typeof l === 'string'));
  const people = [...(Array.isArray(issue.assignees) ? issue.assignees : []), issue.assignee]
    .filter(isObject).map((a) => a.login).filter((l) => typeof l === 'string');
  const { record, text } = takeRecord(issue.body);
  const state = String(issue.state == null ? '' : issue.state).toLowerCase();
  const reason = String(issue.state_reason == null ? (issue.stateReason == null ? '' : issue.stateReason) : issue.state_reason)
    .toLowerCase();
  return row({
    assignee: people[0] || null,
    board: isObject(issue.milestone) && typeof issue.milestone.title === 'string' ? issue.milestone.title : board,
    body: text,
    created: dateOf(issue.created_at || issue.createdAt),
    fields: rest(issue, GITHUB_KNOWN),
    id: issue.number == null ? null : `#${issue.number}`,
    kind: kindOfLabels(labels),
    labels,
    line: at,
    record,
    state: state === 'closed' ? (reason === 'not_planned' ? 'closed:not_planned' : 'closed') : (state === '' ? null : 'open'),
    title: String(issue.title == null ? '' : issue.title),
    updated: dateOf(issue.updated_at || issue.updatedAt),
  });
}

const github = {
  ext: '.json',
  parse(text, path) {
    const value = parseJson(text);
    const board = stemOf(path);
    const notes = [];
    // `gh project item-list --format json`: {items:[{content, status, …}], totalCount}.
    if (isObject(value) && Array.isArray(value.items)) {
      const rows = value.items.filter(isObject).map((item, i) => {
        const content = isObject(item.content) ? item.content : {};
        const one = githubIssue({ ...content, labels: item.labels || content.labels,
          assignees: (item.assignees || []).map((login) => (isObject(login) ? login : { login })) }, i + 1, board);
        one.state = typeof item.status === 'string' ? item.status : one.state;
        one.title = String(item.title == null ? one.title : item.title);
        one.fields = rest({ ...rest(content, GITHUB_KNOWN), ...rest(item, ['content', 'status', 'title', 'labels', 'assignees']) }, []);
        return one;
      });
      return { boards: [board], notes, rows };
    }
    if (!Array.isArray(value)) throw new Error('a GitHub issues export is a JSON array (or a project item list)');
    const pulls = value.filter((issue) => isObject(issue) && issue.pull_request !== undefined).length;
    if (pulls > 0) notes.push(`${pulls} pull request(s) in the list were not imported: a pull request is not a task`);
    const rows = value.filter((issue) => isObject(issue) && issue.pull_request === undefined)
      .map((issue, i) => githubIssue(issue, i + 1, board));
    return { boards: [board], notes, rows };
  },
  write(board, rows) {
    return `${JSON.stringify(rows.map((r) => {
      const closed = r.state.startsWith('closed');
      const out = { title: r.title, body: withRecord(r.body, r.record), state: closed ? 'closed' : 'open' };
      if (closed) out.state_reason = r.state === 'closed:not_planned' ? 'not_planned' : 'completed';
      out.labels = r.labels;
      out.assignees = r.assignee == null ? [] : [r.assignee];
      out.milestone = { title: board.title, description: board.description };
      if (r.created != null) out.created_at = `${r.created}T00:00:00Z`;
      if (r.updated != null) out.updated_at = `${r.updated}T00:00:00Z`;
      return out;
    }), null, 2)}\n`;
  },
};

// ------------------------------------------------------------------------ GitLab

const GITLAB_KNOWN = ['iid', 'title', 'description', 'state', 'labels', 'assignee', 'assignees', 'milestone',
  'created_at', 'updated_at', 'due_date', 'closed_at'];
const GITLAB_CSV_KNOWN = ['Issue ID', 'Title', 'Description', 'State', 'Assignee', 'Assignee Username', 'Labels',
  'Milestone', 'Due Date', 'Created At (UTC)', 'Updated At (UTC)', 'Closed At (UTC)', RECORD_COLUMN];

/** GitLab board lists are labels: an open issue with a list label is in that list. */
function gitlabState(state, labels) {
  const open = !/^closed$/iu.test(String(state || ''));
  if (!open) return 'closed';
  const scoped = labels.map((l) => /^(?:status|workflow)::(.+)$/iu.exec(l)).find((m) => m !== null);
  return scoped ? scoped[1].trim() : 'opened';
}

const gitlab = {
  ext: '.json',
  exts: ['.json', '.csv'],
  parse(text, path) {
    const board = stemOf(path);
    if (String(path).toLowerCase().endsWith('.csv')) {
      const rows = csvObjects(text).map(({ line, values }) => {
        const labels = listOf(values.Labels);
        return row({
          assignee: values['Assignee Username'] || values.Assignee || null,
          board: values.Milestone || board,
          body: values.Description || '',
          created: dateOf(values['Created At (UTC)']),
          due: dateOf(values['Due Date']),
          fields: rest(values, GITLAB_CSV_KNOWN),
          id: values['Issue ID'] ? `#${values['Issue ID']}` : null,
          kind: kindOfLabels(labels),
          labels,
          line,
          record: recordFromCell(values[RECORD_COLUMN]),
          state: gitlabState(values.State, labels),
          title: values.Title || '',
          updated: dateOf(values['Updated At (UTC)']),
        });
      });
      return { boards: [board], notes: [], rows };
    }
    const value = parseJson(text);
    if (!Array.isArray(value)) throw new Error('a GitLab issues export is a JSON array');
    const rows = value.filter(isObject).map((issue, i) => {
      const labels = listOf((Array.isArray(issue.labels) ? issue.labels : [])
        .map((l) => (isObject(l) ? l.name : l)).filter((l) => typeof l === 'string'));
      const people = [...(Array.isArray(issue.assignees) ? issue.assignees : []), issue.assignee]
        .filter(isObject).map((a) => a.username).filter((u) => typeof u === 'string');
      const { record, text: body } = takeRecord(issue.description);
      return row({
        assignee: people[0] || null,
        board: isObject(issue.milestone) && typeof issue.milestone.title === 'string' ? issue.milestone.title : board,
        body,
        created: dateOf(issue.created_at),
        due: dateOf(issue.due_date),
        fields: rest(issue, GITLAB_KNOWN),
        id: issue.iid == null ? null : `#${issue.iid}`,
        kind: kindOfLabels(labels),
        labels,
        line: i + 1,
        record,
        state: gitlabState(issue.state, labels),
        title: String(issue.title == null ? '' : issue.title),
        updated: dateOf(issue.updated_at),
      });
    });
    return { boards: [board], notes: [], rows };
  },
  write(board, rows) {
    return `${JSON.stringify(rows.map((r) => {
      const closed = r.state === 'closed';
      const labels = [...r.labels];
      if (!closed && r.state !== 'opened') labels.push(`status::${r.state}`);
      const out = { title: r.title, description: withRecord(r.body, r.record), state: closed ? 'closed' : 'opened', labels };
      out.assignees = r.assignee == null ? [] : [{ username: r.assignee }];
      out.milestone = { title: board.title, description: board.description };
      if (r.due != null) out.due_date = r.due;
      if (r.created != null) out.created_at = `${r.created}T00:00:00Z`;
      if (r.updated != null) out.updated_at = `${r.updated}T00:00:00Z`;
      return out;
    }), null, 2)}\n`;
  },
};

// -------------------------------------------------------------------------- Jira

const JIRA_KNOWN = ['Summary', 'Issue key', 'Issue id', 'Issue Id', 'Issue Type', 'Work item key', 'Work item ID',
  'Work type', 'Status', 'Project name',
  'Assignee', 'Created', 'Updated', 'Due date', 'Due Date', 'Labels', 'Description', 'Inward issue link (Blocks)',
  RECORD_COLUMN];

const jira = {
  ext: '.csv',
  parse(text, path) {
    const board = stemOf(path);
    const rows = csvObjects(text).map(({ line, values }) => {
      const labels = listOf(values.Labels, /\s+/u);
      // Jira Cloud renamed "issue" to "work item" (2025): both spellings are read.
      const type = String(values['Issue Type'] || values['Work type'] || '').trim();
      const kind = /^decision$/iu.test(type) ? 'decision'
        : (/^spec(?:ification)?$/iu.test(type) ? 'spec' : kindOfLabels(labels));
      const fields = rest(values, JIRA_KNOWN);
      if (type !== '' && !/^(?:task|decision|spec|specification)$/iu.test(type)) fields['Issue Type'] = type;
      return row({
        assignee: values.Assignee || null,
        blockedBy: listOf(values['Inward issue link (Blocks)']),
        board: values['Project name'] || board,
        body: values.Description || '',
        created: dateOf(values.Created),
        due: dateOf(values['Due date'] || values['Due Date']),
        fields,
        id: values['Issue key'] || values['Work item key'] || values['Issue id'] || values['Issue Id']
          || values['Work item ID'] || null,
        kind,
        labels,
        line,
        record: recordFromCell(values[RECORD_COLUMN]),
        state: values.Status || null,
        title: values.Summary || '',
        updated: dateOf(values.Updated),
      });
    });
    return { boards: [board], notes: [], rows };
  },
  write(board, rows) {
    const width = Math.max(1, ...rows.map((r) => r.labels.length));
    const links = Math.max(1, ...rows.map((r) => r.blockedBy.length));
    const header = ['Issue Id', 'Summary', 'Issue Type', 'Status', 'Project name', 'Assignee', 'Created', 'Updated',
      'Due date', ...Array(width).fill('Labels'), 'Description', ...Array(links).fill('Inward issue link (Blocks)'),
      RECORD_COLUMN];
    return writeCsv(header, rows.map((r) => [r.id, r.title, r.kind === 'decision' ? 'Decision' : (r.kind === 'spec' ? 'Spec' : 'Task'),
      r.state, board.title, r.assignee, r.created, r.updated, r.due,
      ...Array.from({ length: width }, (_, i) => (r.labels[i] || '').replace(/\s+/gu, '-')),
      r.body, ...Array.from({ length: links }, (_, i) => r.blockedBy[i] || ''), recordCell(r.record)]));
  },
};

// ------------------------------------------------------------------------ Trello

const TRELLO_KNOWN = ['id', 'name', 'desc', 'idList', 'closed', 'due', 'dueComplete', 'labels', 'idMembers',
  'dateLastActivity', 'idLabels', 'pos', 'badges'];

const trello = {
  ext: '.json',
  parse(text, path) {
    const value = parseJson(text);
    if (!isObject(value) || !Array.isArray(value.cards)) throw new Error('a Trello board export is a JSON object with cards[]');
    const board = typeof value.name === 'string' && value.name.trim() !== '' ? value.name : stemOf(path);
    const lists = new Map((Array.isArray(value.lists) ? value.lists : []).filter(isObject).map((l) => [l.id, l]));
    const members = new Map((Array.isArray(value.members) ? value.members : []).filter(isObject)
      .map((m) => [m.id, m.username || m.fullName || m.id]));
    const notes = [];
    for (const key of ['actions', 'checklists', 'customFields', 'pluginData']) {
      if (Array.isArray(value[key]) && value[key].length > 0) {
        notes.push(`the board's ${key} (${value[key].length}) were not imported: they are board history or`
          + ' add-ons, not cards');
      }
    }
    const rows = value.cards.filter(isObject).map((card, i) => {
      const list = lists.get(card.idList);
      const { record, text: body } = takeRecord(card.desc);
      const fields = rest(card, TRELLO_KNOWN);
      if (card.closed === true) fields.closed = true;
      if (list && list.closed === true) fields.listClosed = true;
      const labels = listOf((Array.isArray(card.labels) ? card.labels : []).filter(isObject)
        .map((l) => (typeof l.name === 'string' && l.name !== '' ? l.name : l.color)).filter((l) => typeof l === 'string'));
      return row({
        assignee: (Array.isArray(card.idMembers) ? card.idMembers : []).map((id) => members.get(id) || id)[0] || null,
        board,
        body,
        due: dateOf(card.due),
        done: card.dueComplete === true ? true : null,
        fields,
        id: card.shortLink || card.id || null,
        kind: kindOfLabels(labels),
        labels,
        line: i + 1,
        record,
        state: list && typeof list.name === 'string' ? list.name : null,
        title: String(card.name == null ? '' : card.name),
        updated: dateOf(card.dateLastActivity),
      });
    });
    return { boards: [board], notes, rows };
  },
  write(board, rows) {
    const names = [...new Set(rows.map((r) => r.state))];
    const lists = names.map((name, i) => ({ closed: false, id: `list-${i + 1}`, name, pos: i + 1 }));
    const people = [...new Set(rows.map((r) => r.assignee).filter((a) => a != null))].sort();
    const out = {
      cards: rows.map((r, i) => ({
        closed: false,
        dateLastActivity: r.updated == null ? null : `${r.updated}T00:00:00.000Z`,
        desc: withRecord(r.body, r.record),
        due: r.due == null ? null : `${r.due}T00:00:00.000Z`,
        dueComplete: r.done === true,
        id: `card-${i + 1}`,
        idList: `list-${names.indexOf(r.state) + 1}`,
        idMembers: r.assignee == null ? [] : [`member-${people.indexOf(r.assignee) + 1}`],
        labels: r.labels.map((name) => ({ name })),
        name: r.title,
        shortLink: r.id,
      })),
      desc: board.description,
      lists,
      members: people.map((username, i) => ({ id: `member-${i + 1}`, username })),
      name: board.title,
    };
    return `${JSON.stringify(out, null, 2)}\n`;
  },
};

// ------------------------------------------------------------------------ Linear

const LINEAR_KNOWN = ['ID', 'Title', 'Description', 'Status', 'Assignee', 'Labels', 'Created', 'Updated',
  'Due Date', 'Project', 'Team', RECORD_COLUMN];

const linear = {
  ext: '.csv',
  parse(text, path) {
    const board = stemOf(path);
    const rows = csvObjects(text).map(({ line, values }) => {
      const labels = listOf(values.Labels);
      return row({
        assignee: values.Assignee || null,
        board: values.Project || values.Team || board,
        body: values.Description || '',
        created: dateOf(values.Created),
        due: dateOf(values['Due Date']),
        fields: rest(values, LINEAR_KNOWN),
        id: values.ID || null,
        kind: kindOfLabels(labels),
        labels,
        line,
        record: recordFromCell(values[RECORD_COLUMN]),
        state: values.Status || null,
        title: values.Title || '',
        updated: dateOf(values.Updated),
      });
    });
    return { boards: [board], notes: [], rows };
  },
  write(board, rows) {
    return writeCsv(['ID', 'Title', 'Description', 'Status', 'Assignee', 'Labels', 'Created', 'Updated', 'Due Date',
      'Project', RECORD_COLUMN], rows.map((r) => [r.id, r.title, r.body, r.state, r.assignee, r.labels.join(', '),
      r.created, r.updated, r.due, board.title, recordCell(r.record)]));
  },
};

// ------------------------------------------------------------------------- Asana

const ASANA_KNOWN = ['Task ID', 'Name', 'Notes', 'Section/Column', 'Assignee', 'Assignee Email', 'Tags',
  'Created At', 'Last Modified', 'Due Date', 'Completed At', 'Projects', 'Blocked By (Dependencies)', RECORD_COLUMN];

const asana = {
  ext: '.csv',
  parse(text, path) {
    const board = stemOf(path);
    const rows = csvObjects(text).map(({ line, values }) => {
      const labels = listOf(values.Tags);
      const completed = String(values['Completed At'] || '').trim() !== '';
      return row({
        assignee: values['Assignee Email'] || values.Assignee || null,
        blockedBy: listOf(values['Blocked By (Dependencies)']),
        board: listOf(values.Projects)[0] || board,
        body: values.Notes || '',
        created: dateOf(values['Created At']),
        done: completed,
        due: dateOf(values['Due Date']),
        fields: rest(values, ASANA_KNOWN),
        id: values['Task ID'] || null,
        kind: kindOfLabels(labels),
        labels,
        line,
        record: recordFromCell(values[RECORD_COLUMN]),
        state: values['Section/Column'] || null,
        title: values.Name || '',
        updated: dateOf(values['Last Modified']),
      });
    });
    return { boards: [board], notes: [], rows };
  },
  write(board, rows) {
    return writeCsv(['Task ID', 'Name', 'Section/Column', 'Assignee', 'Tags', 'Created At', 'Last Modified',
      'Due Date', 'Completed At', 'Projects', 'Notes', 'Blocked By (Dependencies)', RECORD_COLUMN],
    rows.map((r) => [r.id, r.title, r.state, r.assignee, r.labels.join(','), r.created, r.updated, r.due,
      r.done === true ? (r.updated || r.created || '') : '', board.title, r.body, r.blockedBy.join(','),
      recordCell(r.record)]));
  },
};

// ------------------------------------------------------------------------ Notion

/** The Notion property names this table reads, in the spellings Notion's templates use. */
const NOTION_TITLE = ['Name', 'Title', 'Task', 'Task name'];
const NOTION_STATUS = ['Status', 'State', 'Stage'];
const NOTION_ASSIGNEE = ['Assignee', 'Assign', 'Owner', 'Assigned to'];
const NOTION_TAGS = ['Tags', 'Labels', 'Tag'];
const NOTION_DUE = ['Due', 'Due date', 'Due Date', 'Date'];
const NOTION_CREATED = ['Created', 'Created time', 'Created Time'];
const NOTION_UPDATED = ['Last edited time', 'Last edited', 'Updated'];
const NOTION_BODY = ['Description', 'Notes'];
const NOTION_TYPE = ['Type', 'Kind'];

function pick(values, names) {
  const name = names.find((n) => values[n] !== undefined);
  return name === undefined ? { name: null, value: '' } : { name, value: values[name] };
}

const notion = {
  ext: '.csv',
  parse(text, path) {
    const board = stemOf(path);
    const records = csvObjects(text);
    const header = records.length === 0 ? [] : Object.keys(records[0].values);
    const titleName = NOTION_TITLE.find((n) => header.includes(n)) || header[0];
    const rows = records.map(({ line, values }) => {
      const status = pick(values, NOTION_STATUS);
      const assignee = pick(values, NOTION_ASSIGNEE);
      const tags = pick(values, NOTION_TAGS);
      const due = pick(values, NOTION_DUE);
      const created = pick(values, NOTION_CREATED);
      const updated = pick(values, NOTION_UPDATED);
      const body = pick(values, NOTION_BODY);
      const type = pick(values, NOTION_TYPE);
      const labels = listOf(tags.value);
      const typed = String(type.value).trim().toLowerCase();
      const kind = typed === 'decision' ? 'decision' : (/^spec(?:ification)?$/u.test(typed) ? 'spec' : kindOfLabels(labels));
      const used = [titleName, status.name, assignee.name, tags.name, due.name, created.name, updated.name, body.name,
        RECORD_COLUMN];
      if (kind !== null && typed !== '') used.push(type.name);
      return row({
        assignee: assignee.value || null,
        board,
        body: body.value || '',
        created: dateOf(created.value),
        due: dateOf(due.value),
        fields: rest(values, used.filter((n) => n !== null)),
        id: null,
        kind,
        labels,
        line,
        record: recordFromCell(values[RECORD_COLUMN]),
        state: status.value || null,
        title: values[titleName] || '',
        updated: dateOf(updated.value),
      });
    });
    return { boards: [board], notes: [], rows };
  },
  write(board, rows) {
    return writeCsv(['Name', 'Status', 'Type', 'Assignee', 'Tags', 'Due', 'Created', 'Last edited time',
      'Description', RECORD_COLUMN], rows.map((r) => [r.title, r.state, r.kind === null ? 'Task'
      : (r.kind === 'decision' ? 'Decision' : 'Spec'), r.assignee, r.labels.join(', '), r.due, r.created, r.updated,
      r.body, recordCell(r.record)]));
  },
};

// ------------------------------------------------------------ Markdown task lists

/** `#tag`, `@person`, `due:YYYY-MM-DD` / `\u{1F4C5} YYYY-MM-DD` / Obsidian Kanban's `@{YYYY-MM-DD}` out of a card line. */
function cardTokens(text) {
  const labels = [];
  let assignee = null;
  let due = null;
  let title = String(text).replace(/@\{(\d{4}-\d{2}-\d{2})\}/gu, (_, d) => { due = d; return ''; })
    .replace(/(?:^|\s)(?:due:|\u{1F4C5}\s?)(\d{4}-\d{2}-\d{2})\b/gu, (_, d) => { due = d; return ''; })
    .replace(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu, (_, t) => { labels.push(t); return ''; })
    .replace(/(?:^|\s)@([A-Za-z0-9][A-Za-z0-9._-]*)/gu, (m, p) => {
      if (assignee === null) { assignee = p; return ''; }
      return m;
    });
  title = title.replace(/\s+/gu, ' ').trim();
  return { assignee, due, labels, title };
}

function cardLine(r, withDate) {
  const tokens = [r.title];
  if (r.assignee != null) tokens.push(`@${String(r.assignee).replace(/\s+/gu, '-')}`);
  for (const label of r.labels) tokens.push(`#${String(label).replace(/\s+/gu, '-')}`);
  if (r.due != null) tokens.push(withDate(r.due));
  return `- [${r.done === true ? 'x' : ' '}] ${tokens.join(' ')}`;
}

/** Card lines of a Markdown list (`- [ ]` / `* [x]`), their indented continuation lines, and the heading above. */
function markdownCards(text, { kanban }) {
  const lines = String(text).replace(/\r\n?/gu, '\n').split('\n');
  const cards = [];
  let h1 = null;
  let lane = null;
  let completeLane = false;
  let archived = false;
  let current = null;
  let fence = false;
  lines.forEach((line, i) => {
    if (/^(?:```|~~~)/u.test(line)) fence = !fence;
    if (fence || /^%%/u.test(line)) { current = null; return; }
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/u.exec(line);
    if (heading !== null) {
      current = null;
      if (heading[1].length === 1 && !kanban) h1 = heading[2];
      else { lane = heading[2]; completeLane = false; archived = /^archive$/iu.test(heading[2]); }
      return;
    }
    if (/^\*\*\*\s*$/u.test(line) && kanban) { archived = true; return; }
    if (/^\*\*Complete\*\*\s*$/u.test(line)) { completeLane = true; return; }
    const card = /^[-*+]\s+\[([ xX])\]\s?(.*)$/u.exec(line);
    if (card !== null) {
      const [first, ...more] = card[2].split(/<br\s*\/?>/u);
      current = { archived, body: [...more], checked: card[1] !== ' ', completeLane, lane, line: i + 1, text: first };
      cards.push(current);
      return;
    }
    if (current !== null && /^(?:\t| {2,})\S/u.test(line)) {
      current.body.push(line.replace(/^(?:\t| {2,4})/u, ''));
      return;
    }
    if (line.trim() !== '') current = null;
  });
  return { cards, h1 };
}

function markdownRows(text, path, kanban) {
  const board = stemOf(path);
  const read = markdownCards(text, { kanban });
  const rows = read.cards.map((card) => {
    const tokens = cardTokens(card.text);
    const { record, text: body } = takeRecord(card.body.join('\n'));
    const fields = Object.create(null);
    if (card.archived) fields.archived = true;
    return row({
      assignee: tokens.assignee,
      board: read.h1 || board,
      body: body.trim(),
      done: card.checked || card.completeLane,
      due: tokens.due,
      fields,
      kind: kindOfLabels(tokens.labels),
      labels: tokens.labels,
      line: card.line,
      record,
      state: card.lane,
      title: tokens.title,
    });
  });
  return { boards: [read.h1 || board], notes: [], rows };
}

const markdown = {
  ext: '.md',
  parse(text, path) {
    return markdownRows(text, path, false);
  },
  write(board, rows, header) {
    const lanes = [...new Set(rows.map((r) => r.state))];
    const out = [`# ${board.title}`, '', ...(header || []), ''];
    for (const lane of lanes) {
      out.push(`## ${lane}`, '');
      for (const r of rows.filter((one) => one.state === lane)) {
        out.push(cardLine(r, (d) => `due:${d}`));
        for (const line of withRecord(r.body, r.record).split('\n')) out.push(line === '' ? '' : `  ${line}`);
      }
      out.push('');
    }
    return `${out.join('\n').replace(/\n+$/u, '')}\n`;
  },
};

const obsidianKanban = {
  ext: '.md',
  parse(text, path) {
    if (!/^---\n[\s\S]*?kanban-plugin:/u.test(String(text).replace(/\r\n?/gu, '\n'))) {
      throw new Error('an Obsidian Kanban board starts with frontmatter naming kanban-plugin');
    }
    return markdownRows(text, path, true);
  },
  write(board, rows, header) {
    const lanes = [...new Set(rows.map((r) => r.state))];
    const out = ['---', '', 'kanban-plugin: board', '', '---', '', ...(header || []), ''];
    for (const lane of lanes) {
      out.push(`## ${lane}`, '');
      const inLane = rows.filter((one) => one.state === lane);
      if (inLane.length > 0 && inLane.every((r) => r.done === true)) out.push('**Complete**');
      for (const r of inLane) {
        out.push(cardLine(r, (d) => `@{${d}}`));
        for (const line of withRecord(r.body, r.record).split('\n')) out.push(line === '' ? '' : `\t${line}`);
      }
      out.push('', '');
    }
    out.push('%% kanban:settings', '```', '{"kanban-plugin":"board"}', '```', '%%');
    return `${out.join('\n')}\n`;
  },
};

// ---------------------------------------------------------------------- Todo.txt

const todotxt = {
  ext: '.txt',
  parse(text, path) {
    const board = stemOf(path);
    const rows = [];
    String(text).replace(/\r\n?/gu, '\n').split('\n').forEach((raw, i) => {
      let line = raw.trim();
      if (line === '') return;
      const fields = Object.create(null);
      const done = /^x\s/u.test(line);
      if (done) line = line.slice(2).trim();
      const priority = /^\(([A-Z])\)\s+/u.exec(line);
      if (priority !== null) { fields.priority = priority[1]; line = line.slice(priority[0].length); }
      const dates = /^(\d{4}-\d{2}-\d{2})(?:\s+(\d{4}-\d{2}-\d{2}))?\s+/u.exec(line);
      let created = null;
      let completed = null;
      if (dates !== null) {
        if (done && dates[2] !== undefined) { completed = dates[1]; created = dates[2]; } else created = dates[1];
        if (done && dates[2] === undefined) { completed = dates[1]; created = null; }
        line = line.slice(dates[0].length);
      }
      const projects = [];
      const labels = [];
      let due = null;
      let state = null;
      let record = null;
      const words = [];
      for (const word of line.split(/\s+/u)) {
        const kv = /^([A-Za-z][A-Za-z0-9_-]*):(\S+)$/u.exec(word);
        if (/^\+\S+$/u.test(word)) projects.push(word.slice(1));
        else if (/^@\S+$/u.test(word)) labels.push(word.slice(1));
        else if (kv !== null && kv[1] === 'due') due = dateOf(kv[2]);
        else if (kv !== null && kv[1] === 'state') state = kv[2];
        else if (kv !== null && kv[1] === 'agsc') record = /^[A-Za-z0-9+/]+={0,2}$/u.test(kv[2]) ? kv[2] : null;
        else if (kv !== null && !/^https?$/iu.test(kv[1])) fields[kv[1]] = kv[2];
        else words.push(word);
      }
      if (completed !== null) fields.completed = completed;
      if (projects.length > 1) fields.projects = projects.slice(1);
      rows.push(row({
        board: projects[0] || board, created, done, due, fields, kind: kindOfLabels(labels), labels,
        line: i + 1, record, state, title: words.join(' '),
      }));
    });
    return { boards: [board], notes: [], rows };
  },
  write(board, rows) {
    const project = String(board.slug);
    return `${rows.map((r) => {
      const parts = [];
      if (r.done === true) parts.push('x');
      if (r.created != null) parts.push(r.created);
      parts.push(String(r.title).replace(/\s+/gu, ' '), `+${project}`);
      for (const label of r.labels) parts.push(`@${String(label).replace(/\s+/gu, '-')}`);
      if (r.due != null) parts.push(`due:${r.due}`);
      if (r.state != null) parts.push(`state:${String(r.state).replace(/\s+/gu, '-')}`);
      if (r.record != null) parts.push(`agsc:${r.record}`);
      return parts.join(' ');
    }).join('\n')}\n`;
  },
};

// ------------------------------------------------- a peer's published board

/**
 * `agsc-board`: another node's board export, `/boards/<cluster>.json` (AGSC-10-13) —
 * a snapshot of a peer's board read as READ-ONLY tasks here. Each task keeps the
 * peer's IRI as its id, so a task of this node can name it (`blocked-by` the
 * imported copy) and a reader can follow it home; `blocked_by` slugs are local to
 * the peer and are expanded to the peer's IRIs (AGSC-11-15). `/boards/index.json`
 * lists boards and holds no task: it is named and skipped.
 */
function peerBase(iri) {
  return String(iri == null ? '' : iri).replace(/[^/]+\/[^/]+\/?$/u, '');
}

const agscBoard = {
  ext: '.json',
  parse(text, path) {
    const value = parseJson(text);
    if (isObject(value) && Array.isArray(value.boards)) {
      return { boards: [], notes: [`a board index (${value.boards.length} board(s)) holds no task; import each /boards/<cluster>.json`], rows: [] };
    }
    if (!isObject(value) || !Array.isArray(value.tasks)) throw new Error('a board export is a JSON object with tasks[] (AGSC-10-13)');
    const base = peerBase(value.iri);
    const board = typeof value.board === 'string' && value.board.trim() !== '' ? value.board : stemOf(path);
    // The decisions and specs this writer files beside a board ride in one extra
    // member a board reader ignores (AGSC-00-15), each with its kind.
    const extra = (Array.isArray(value['x-agsc-items']) ? value['x-agsc-items'] : []).filter(isObject)
      .map((one) => ({ ...one, state: undefined }));
    const rows = [...value.tasks.filter(isObject), ...extra].map((task, i) => {
      const record = typeof task['x-agsc-record'] === 'string' && /^[A-Za-z0-9+/]+={0,2}$/u.test(task['x-agsc-record'])
        ? task['x-agsc-record'] : null;
      const fields = rest(task, ['slug', 'iri', 'kind', 'title', 'state', 'blocked_by', 'claimed_by', 'modified',
        'x-agsc-record']);
      return row({
        assignee: typeof task.claimed_by === 'string' ? task.claimed_by : null,
        blockedBy: listOf(task.blocked_by).map((slug) => `${base}concepts/${slug}/`),
        board,
        fields,
        id: typeof task.iri === 'string' ? task.iri : null,
        kind: task.kind === 'decision' || task.kind === 'spec' ? task.kind : null,
        line: i + 1,
        record,
        state: typeof task.state === 'string' ? task.state : null,
        title: String(task.title == null ? (task.slug == null ? '' : task.slug) : task.title),
        updated: dateOf(task.modified),
      });
    });
    return { boards: [board], notes: [], rows };
  },
  write(board, rows) {
    const out = {
      board: board.title,
      iri: board.iri,
      // AGSC-10-13: a board lists tasks; a decision or spec filed on it is not one.
      tasks: rows.filter((r) => r.kind === null).map((r) => {
        const task = { iri: r.iri, slug: r.id, state: r.a2a, title: r.title };
        if (r.blockedBy.length > 0) task.blocked_by = r.blockedBy;
        if (r.updated != null) task.modified = r.updated;
        if (r.record != null) task['x-agsc-record'] = r.record;
        return task;
      }),
    };
    const others = rows.filter((r) => r.kind !== null)
      .map((r) => ({ iri: r.iri, kind: r.kind, slug: r.id, title: r.title, 'x-agsc-record': r.record }));
    if (others.length > 0) out['x-agsc-items'] = others;
    return `${JSON.stringify(out, null, 2)}\n`;
  },
};

/** Every format, by the name `--format` takes. */
const FORMATS = Object.freeze({
  'agsc-board': agscBoard, asana, github, gitlab, jira, linear, markdown, notion, 'obsidian-kanban': obsidianKanban, todotxt, trello,
});

module.exports = {
  FORMATS, cardTokens, csvCell, csvObjects, dateOf, kindOfLabels, listOf, parseCsv, recordFromCell,
  stemOf, takeRecord, uncell, withRecord, writeCsv,
};
