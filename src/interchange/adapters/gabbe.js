'use strict';
/**
 * CONTEXT Interchange — memory adapter `gabbe` (AGSC-01-26a names "the Basic Memory
 * and GABBE-memory both-ways adapters").
 *
 * `export --to gabbe` writes a knowledge node into the folder layout of a GABBE
 * agent kit, and `import --from gabbe <kit-dir>` reads a kit's memory and skills
 * back as items. GABBE is a Markdown-only governance kit for coding agents: its
 * knowledge lives in plain files under `agents/`, so both directions are file to
 * file, deterministic and offline (AGSC-00-24).
 *
 * THE KIT LAYOUT this adapter reads and writes (the kit's own files, read on
 * 2026-09-23: `docs/SCHEMA.md` §"Source format", `agents/memory/*.md`,
 * `agents/memory/episodic/DECISION_LOG_TEMPLATE.md`,
 * `agents/skills/core/state-preserve.skill.md` §"What to save"):
 *   * `agents/skills/**\/*.skill.md` — "Every skill is a Markdown file with YAML
 *     frontmatter": `name` and `description` required, `triggers`, `tags`,
 *     `context_cost` optional, "Additional keys are tolerated by all consumers".
 *   * `agents/memory/CONTINUITY.md` — the failure memory: "Append new entries. Never
 *     delete.", each entry `### [Module/Area] — [Short description]` with the fields
 *     `**Failed approach**`, `**Why it failed**`, `**Resolution**`, `**Date**`,
 *     `**Status**`.
 *   * `agents/memory/AUDIT_LOG.md` — append-only; a table row
 *     `| Timestamp | Session | Actor | Type | Description | Outcome | References |`,
 *     and, in practice, bullet entries `- <date> | <actor> | <text>`.
 *   * `agents/memory/PROJECT_STATE.md` — dated state and decision lines.
 *   * `agents/memory/episodic/*.md` — per-session decision logs: a `Session Header`
 *     table and `### Entry NNN` tables with `Timestamp`, `Actor`, `Action Type`,
 *     `Subject`, `Rationale`, `Outcome` (`PASS / FAIL / PENDING / DEFERRED`) and
 *     `References`; `episodic/SESSION_SNAPSHOT/<phase>-<timestamp>.md` snapshots.
 *
 * EXPORT — published items only (AGSC-06-30: drafts, retired and release-gated items
 * never leave), each written ONCE:
 *   procedure          → `agents/skills/agsc/<slug>.skill.md` (a GABBE skill)
 *   gate               → `agents/guides/agsc/<slug>.md` (a guide)
 *   concept, cluster   → `agents/memory/semantic/agsc/<slug>.md`
 *   episode            → `agents/memory/episodic/agsc/<slug>.md` (a decision log)
 *   lesson             → one entry of `agents/memory/CONTINUITY.md`
 * plus `agents/guides/agsc/steering.md`, the AGSC-01-28 steer text (the same bytes
 * `export --steer` writes to `AGENTS.md`) — a separate file, so copying the export
 * over a kit never replaces the kit's own `agents/AGENTS.md`. Every file carries the
 * AGSC-06-15 provenance header (AGSC-01-29); nothing executable is written
 * (AGSC-07-15). LOSSLESS: beside the GABBE-shaped text, every item carries one line
 * `<!-- agsc-item <base64 of the JCS record> -->` holding its authored frontmatter,
 * body, slug, type and the node's content and specification versions, so a return
 * import rebuilds it exactly. A reader that ignores the comment loses nothing it
 * could read.
 *
 * IMPORT. A record carrying a TRUSTED `agsc-item` line is OUR OWN and comes back item
 * for item, with `prov.source_version` (AGSC-01-22). Trusted means the line names this
 * node's `site.base` or a declared peer and its versions agree with the file's
 * provenance header (`interchange/own-record.js`); an untrusted line is
 * reported and ignored, and what carries it is read as foreign and kept as a draft,
 * because a kit states no licence. Everything else is a FOREIGN kit,
 * mapped by file: a skill → a `procedure`; a CONTINUITY entry → a `lesson`
 * (severity `info`, the AGSC-09-14b default, reported); a decision-log entry whose
 * action type is a decision, and a dated PROJECT_STATE line → a `concept` of kind
 * `decision`; an AUDIT_LOG row or decision-log entry that states an outcome → an
 * `episode`. What a mapping does not use is kept in `x-gabbe-*` keys (AGSC-02-05a),
 * never dropped. A record that cannot be mapped WITHOUT INVENTING a required value is
 * reported and skipped (AGSC-01-22): an episode needs an outcome and a start instant
 * (AGSC-02-14), and a GABBE bullet entry states neither outcome nor time. Template
 * files (`*_TEMPLATE*`) and the resume pointer (working state, not knowledge) are
 * not read as records.
 *
 * PURE: no fs, no clock, no network — the verb reads the files and hands them in.
 * Requirements: AGSC-01-22, AGSC-01-23, AGSC-01-26a, AGSC-01-29, AGSC-06-30,
 * AGSC-07-15; PRD-021, PRD-026.
 */

const chunks = require('../../knowledge/chunks.js');
const slugs = require('../../knowledge/slug.js');
const frontmatterModule = require('../../knowledge/frontmatter.js');
const yaml = require('../../knowledge/yaml.js');
const { canonicalize } = require('../../knowledge/jcs.js');
const { compareCodePoint, nfc, singleLine } = require('../../knowledge/unicode.js');
const { provenanceLines } = require('../../knowledge/provenance-header.js');
const { titleFor } = require('../../knowledge/adopt.js');
const { finding } = require('../../knowledge/validate.js');
const { neutraliseSingleLine } = require('../mapping.js');
const okf = require('../okf.js');
const steer = require('../steer.js');
const ownRecord = require('../own-record.js');
const { decodeRecord, encodeRecord } = ownRecord;
const { isObject, itemText, lessonText, oneLine, plain, yamlString } = require('../records.js');

/** The name this adapter answers to on `export --to` and `import --from`. */
const FORMAT = 'gabbe';

/** Where each item type goes in the kit, and the one CONTINUITY file. */
const LAYOUT = Object.freeze({
  cluster: 'agents/memory/semantic/agsc',
  concept: 'agents/memory/semantic/agsc',
  episode: 'agents/memory/episodic/agsc',
  gate: 'agents/guides/agsc',
  procedure: 'agents/skills/agsc',
});
const CONTINUITY = 'agents/memory/CONTINUITY.md';
const AUDIT_LOG = 'agents/memory/AUDIT_LOG.md';
const PROJECT_STATE = 'agents/memory/PROJECT_STATE.md';
const RESUME_POINTER = 'agents/memory/RESUME_POINTER.md';
const STEERING = 'agents/guides/agsc/steering.md';

/** The own-record line. Anchored at a line start, so a quoted body cannot forge one. */
const MARKER = /^<!-- agsc-item ([A-Za-z0-9+/]+={0,2}) -->$/gmu;

/** AGSC-02-15: `when` is at most 1024 characters. */
const WHEN_LIMIT = 1024;

/** A GABBE outcome word → the AGSC-02-14 `outcome`, and nothing else is guessed. */
const OUTCOMES = Object.freeze({
  done: 'success', fail: 'failure', failed: 'failure', failure: 'failure', ok: 'success',
  partial: 'partial', pass: 'success', passed: 'success', success: 'success',
});

/** The decision-log action types that record a DECISION rather than an occurrence. */
const DECISION_TYPES = Object.freeze(['ADR_CREATED', 'ARCHITECTURE', 'DECISION', 'HUMAN_DECISION']);

/** The keys this adapter claims (AGSC-01-26a), for the implementer documentation. */
const CLAIMED_KEYS = Object.freeze({
  export: 'every authored frontmatter key and the body of every published item (in the agsc-item line)',
  import: Object.freeze({
    audit_log_row: Object.freeze(['Timestamp', 'Actor', 'Type', 'Description', 'Outcome', 'References']),
    continuity_entry: Object.freeze(['heading', 'Failed approach', 'Why it failed', 'Resolution', 'Date', 'Status']),
    decision_log_entry: Object.freeze(['Date', 'Timestamp', 'Actor', 'Action Type', 'Subject', 'Rationale',
      'Outcome', 'References']),
    project_state_line: Object.freeze(['date', 'text']),
    skill: Object.freeze(['name', 'description', 'triggers', 'tags', 'context_cost', 'body']),
  }),
});

// ------------------------------------------------------------------- shared helpers

/** A GABBE template placeholder (`[YYYY-MM-DD]`, `[agent persona / human]`) is no value. */
function valueOf(text) {
  const t = String(text == null ? '' : text).trim();
  if (t === '' || /^\[.*\]$/u.test(t) || /^\*\(.*\)\*$/u.test(t)) return '';
  return t;
}

// -------------------------------------------------------------------------- export

/** One exported file per item type, the GABBE-shaped text around the record line. */
function itemFile(item, record, header) {
  const title = singleLine(item.title == null ? item.slug : item.title);
  const body = String(item.body == null ? '' : item.body);
  const marker = `<!-- agsc-item ${record} -->`;
  if (item.type === 'procedure') {
    const description = item.description == null
      ? (item.when == null ? title : item.when) : item.description;
    const triggers = Array.isArray(item['x-gabbe-triggers'])
      ? item['x-gabbe-triggers'] : (item.when == null ? [] : [item.when]);
    const tags = ['agsc', ...(Array.isArray(item['x-gabbe-tags']) ? item['x-gabbe-tags']
      : (Array.isArray(item.tags) ? item.tags : []))];
    const fm = ['---', `name: ${yamlString(item['x-gabbe-name'] == null ? title : item['x-gabbe-name'])}`,
      `description: ${yamlString(description)}`];
    if (triggers.length > 0) fm.push(`triggers: [${triggers.map(yamlString).join(', ')}]`);
    fm.push(`tags: [${[...new Set(tags.map(String))].map(yamlString).join(', ')}]`);
    if (typeof item['x-gabbe-context-cost'] === 'string') fm.push(`context_cost: ${yamlString(item['x-gabbe-context-cost'])}`);
    fm.push('---');
    return `${[...fm, ...header, marker, ''].join('\n')}${body}`;
  }
  if (item.type === 'episode') {
    const started = String(item.started == null ? '' : item.started);
    const rows = [
      ['Session ID', item.slug], ['Date', started.slice(0, 10)], ['Started by', item.actor],
      ['Goal for this Session', title],
    ];
    const outcome = { failure: 'FAIL', partial: 'PARTIAL', success: 'PASS' }[String(item.outcome)] || '';
    const entry = [['Timestamp', started], ['Actor', item.actor], ['Action Type', 'TASK_DONE'],
      ['Subject', title], ['Outcome', outcome]];
    const table = (pairs) => ['| Field | Value |', '|---|---|',
      ...pairs.map(([k, v]) => `| **${k}** | ${singleLine(v == null ? '' : v).replace(/\|/gu, '\\|')} |`)];
    return `${[`# Decision Log — ${title}`, '', ...header, marker, '', '## Session Header', '',
      ...table(rows), '', '## Decision Log Entries', '', '### Entry 001', '', ...table(entry), ''].join('\n')}\n${body}`;
  }
  return `${[`# ${title}`, '', ...header, marker, ''].join('\n')}\n${body}`;
}

/** One CONTINUITY entry for a lesson; the body is quoted so its headings stay inside. */
function continuityEntry(item, record) {
  const title = singleLine(item.title == null ? item.slug : item.title);
  const lines = [`### ${title}`, `<!-- agsc-item ${record} -->`,
    `**Resolution**: ${singleLine(lessonText(item.body)) || title}`];
  const date = item.modified == null ? item.date : item.modified;
  if (date != null) lines.push(`**Date**: ${singleLine(date)}`);
  lines.push(`**Status**: ${item['x-gabbe-status'] == null ? 'ACTIVE' : singleLine(item['x-gabbe-status'])}`);
  lines.push(`**Severity**: ${singleLine(item.severity == null ? 'info' : item.severity)}`);
  const body = String(item.body == null ? '' : item.body).replace(/\n+$/u, '');
  if (body !== '') lines.push('', ...body.split('\n').map((l) => (l === '' ? '>' : `> ${l}`)));
  return lines.join('\n');
}

/**
 * `export --to gabbe`: the kit's files, in path order.
 *
 * @param {object} bundle the loaded Bundle.
 * @param {{instant:string, sha256:(text:string)=>string, specVersion:string,
 *   bundleVersion?:string, nowState?:object}} options
 * @returns {{files:Array<{path:string, text:string, sha256:string}>, findings:Array<object>}}
 */
function run(bundle, options) {
  const config = (bundle && bundle.config) || {};
  const site = config.site || {};
  const base = `${String(site.base || '').replace(/\/+$/u, '')}/`;
  const license = (config.bundle && config.bundle.license_prose) || chunks.TERMS;
  const header = provenanceLines({
    bundle: base, bundleVersion: options.bundleVersion, generatedAt: options.instant,
    license, specVersion: options.specVersion, terms: chunks.termsFor(license),
  });
  const bundleVersion = header.find((line) => line.startsWith('bundle_version: ')).slice(16);

  const entries = ((bundle && bundle.items) || [])
    .filter((item) => item && item.frontmatter)
    .map((item) => ({
      authored: item.frontmatter,
      flat: { ...item.frontmatter, body: item.body, path: item.path, slug: item.slug, type: item.type },
    }))
    .filter((entry) => chunks.isPublished(entry.flat, config.releases))
    .sort((a, b) => compareCodePoint(String(a.flat.slug), String(b.flat.slug)));

  const files = new Map();
  const lessons = [];
  for (const entry of entries) {
    const item = entry.flat;
    const record = encodeRecord({
      body: String(item.body == null ? '' : item.body),
      bundle: base,
      bundle_version: bundleVersion,
      frontmatter: entry.authored,
      slug: String(item.slug),
      spec_version: String(options.specVersion),
      type: String(item.type),
    });
    if (item.type === 'lesson') {
      lessons.push(continuityEntry(item, record));
      continue;
    }
    const dir = LAYOUT[item.type];
    if (dir === undefined) continue;
    const name = item.type === 'procedure' ? `${item.slug}.skill.md` : `${item.slug}.md`;
    files.set(`${dir}/${name}`, itemFile(item, record, header));
  }
  if (lessons.length > 0) {
    files.set(CONTINUITY, `${['# CONTINUITY — Project Failure Memory',
      '<!-- Lessons exported from a published knowledge Bundle. Append these entries to the',
      '     kit\'s own CONTINUITY.md under "## Entries"; never copy this file over it. -->', '',
      ...header, '', '## Entries', '', lessons.join('\n\n---\n\n')].join('\n')}\n`);
  }
  const findings = [];
  const steered = steer.plan(bundle, {
    bundleVersion: options.bundleVersion,
    generatedAt: options.instant,
    nowState: options.nowState,
    specVersion: options.specVersion,
    targets: ['agents'],
  });
  findings.push(...steered.findings);
  if (steered.files.length === 1) files.set(STEERING, steered.files[0].text);

  const paths = [...files.keys()].sort(compareCodePoint);
  return {
    files: paths.map((path) => {
      const text = files.get(path).endsWith('\n') ? files.get(path) : `${files.get(path)}\n`;
      return { path, sha256: options.sha256(text), text };
    }),
    findings,
  };
}

// -------------------------------------------------------------------------- import

/** Which kind of kit file a path is, or `null` when this adapter does not read it. */
function kindOf(path) {
  const p = String(path);
  if (!p.endsWith('.md') || /TEMPLATE/u.test(p.split('/').pop())) return null;
  if (p.startsWith('agents/skills/') && p.endsWith('.skill.md')) return 'skill';
  if (p === CONTINUITY) return 'continuity';
  if (p === AUDIT_LOG) return 'audit';
  if (p === PROJECT_STATE) return 'state';
  if (p === RESUME_POINTER) return 'resume';
  if (p.startsWith('agents/memory/episodic/')) return 'episodic';
  if (p.startsWith('agents/memory/semantic/agsc/') || p.startsWith('agents/guides/agsc/')) return 'own';
  return null;
}

/** Is this path one the verb should read? (`resume` is read only to be reported.) */
function isKitFile(path) {
  return kindOf(path) !== null;
}

/** The AGSC-02-09 actor of a GABBE actor cell, or `null` when none can be named. */
function actorOf(text) {
  const t = valueOf(text);
  if (t === '') return null;
  const human = /\bhuman:[a-z0-9][a-z0-9._-]*/u.exec(t);
  if (human !== null) return human[0];
  if (/^(?:process:[a-z0-9][a-z0-9._-]*|[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._+-]*)$/u.test(t)) return t;
  const token = t.split(/[\s(]/u)[0] || '';
  // `slugify` is total (it answers `note` for nothing), so an empty token is caught first.
  return /[A-Za-z0-9]/u.test(token) ? `process:${slugs.slugify(token)}` : null;
}

/** `YYYY-MM-DD[THH:MM[:SS]][Z]` → an AGSC-02-06 instant, or `null`. */
function instantOf(date, time) {
  const d = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?Z?)?$/u.exec(valueOf(date));
  if (d === null) return null;
  const t = /^(\d{2}):(\d{2})(?::(\d{2}))?/u.exec(valueOf(time));
  const [hh, mm, ss] = d[2] !== undefined ? [d[2], d[3], d[4] || '00']
    : (t !== null ? [t[1], t[2], t[3] || '00'] : ['00', '00', '00']);
  return `${d[1]}T${hh}:${mm}:${ss}Z`;
}

/** The outcome a GABBE outcome cell states, or `null` when it states none we can read. */
function outcomeOf(text) {
  const word = valueOf(text).toLowerCase().replace(/[^a-z]/gu, ' ').trim().split(/\s+/u)[0] || '';
  return OUTCOMES[word] === undefined ? null : OUTCOMES[word];
}

/** The cells of one Markdown table row, or `null` for a line that is not one. */
function cells(line) {
  const m = /^\|(.*)\|\s*$/u.exec(line);
  if (m === null) return null;
  return m[1].split(/(?<!\\)\|/u).map((c) => c.replace(/\\\|/gu, '|').trim());
}

/** `| **Key** | value |` rows of a field table, as a prototype-free map. */
function fieldTable(lines) {
  const out = Object.create(null);
  for (const line of lines) {
    const c = cells(line);
    if (c === null || c.length < 2) continue;
    const key = /^\*\*(.+)\*\*$/u.exec(c[0]);
    if (key !== null) out[key[1].trim()] = c.slice(1).join(' | ');
  }
  return out;
}

/** The text with every `<!-- … -->` block removed, line count preserved. */
function withoutComments(text) {
  return String(text).replace(/<!--[\s\S]*?-->/gu, (block) => block.replace(/[^\n]/gu, ''));
}

/**
 * Is line `i` past the kit's own `## Action Type Reference` section? The list lines
 * of that reference (and of any heading before the log) are documentation, not
 * entries, and are not counted as unread records.
 */
function pastReference(lines, i) {
  for (let n = i; n >= 0; n -= 1) {
    const heading = /^## (.+)$/u.exec(lines[n]);
    if (heading !== null) return !/reference|how to/iu.test(heading[1]);
  }
  return false;
}

/**
 * Parse one foreign file into candidate records. Each candidate is
 * `{type, title, body, fm, line}` or `{skip: reason, line}`.
 */
function foreignRecords(path, text, kind) {
  const out = [];
  const lines = String(text).split('\n');
  if (kind === 'resume') {
    out.push({ line: 1, skip: `${path}: not imported: the resume pointer is working state for the next`
      + ' session, not knowledge' });
    return out;
  }
  if (kind === 'skill') {
    const split = frontmatterModule.split(text, { file: path });
    let fm;
    try {
      fm = split.hasFrontmatter ? yaml.parse(split.yamlText) : null;
    } catch (e) {
      fm = null;
    }
    if (!isObject(fm)) {
      out.push({ line: 1, skip: `${path}: not imported: the skill's frontmatter is not the failsafe YAML`
        + ' subset of AGSC-02-02, so its name and description cannot be read' });
      return out;
    }
    const name = typeof fm.name === 'string' ? fm.name : path.split('/').pop().replace(/\.skill\.md$/u, '');
    const x = Object.create(null);
    const description = oneLine(fm.description, 10000);
    const triggers = Array.isArray(fm.triggers) ? fm.triggers.filter((t) => typeof t === 'string') : [];
    const when = triggers.length === 0 ? null : oneLine(triggers.join('; '), WHEN_LIMIT);
    const item = { body: split.body, fm: x, line: 1, stem: name, type: 'procedure' };
    if (description !== null && description === fm.description) x.description = description;
    if (when !== null && when === triggers.join('; ')) x.when = when;
    if (triggers.length > 0) x['x-gabbe-triggers'] = triggers;
    if (Array.isArray(fm.tags)) x['x-gabbe-tags'] = fm.tags.map(String);
    if (typeof fm.context_cost === 'string') x['x-gabbe-context-cost'] = fm.context_cost;
    const rest = {};
    for (const key of Object.keys(fm).sort(compareCodePoint)) {
      if (!['name', 'description', 'triggers', 'tags', 'context_cost'].includes(key)) rest[key] = fm[key];
    }
    if (typeof fm.description === 'string' && x.description === undefined) rest.description = fm.description;
    if (Object.keys(rest).length > 0) x['x-gabbe-rest'] = canonicalize(rest);
    item.name = name;
    out.push(item);
    return out;
  }
  if (kind === 'continuity') {
    const clean = withoutComments(text).split('\n');
    let inEntries = false;
    let current = null;
    const flush = () => {
      // An entry that carries an agsc-item line is one of OUR lessons, appended to the
      // kit's file as the export tells the reader to; it came back in pass 1.
      if (current === null || current.own) {
        current = null;
        return;
      }
      const f = Object.create(null);
      const other = [];
      for (const line of current.lines) {
        const m = /^\*\*([^*]+)\*\*:\s?(.*)$/u.exec(line);
        if (m !== null) f[m[1].trim()] = m[2];
        else other.push(line);
      }
      const resolution = valueOf(f.Resolution);
      const evidence = [];
      if (valueOf(f['Failed approach']) !== '') evidence.push(`**Failed approach**: ${valueOf(f['Failed approach'])}`);
      if (valueOf(f['Why it failed']) !== '') evidence.push(`**Why it failed**: ${valueOf(f['Why it failed'])}`);
      const rest = other.join('\n').trim();
      if (rest !== '') evidence.push(rest);
      const fm = Object.create(null);
      fm.severity = 'info';
      if (valueOf(f.Status) !== '') fm['x-gabbe-status'] = valueOf(f.Status);
      const date = /^\d{4}-\d{2}-\d{2}$/u.test(valueOf(f.Date)) ? valueOf(f.Date) : null;
      out.push({
        body: `## Lesson\n\n${resolution === '' ? current.title : resolution}\n${
          evidence.length > 0 ? `\n## Evidence\n\n${evidence.join('\n\n')}\n` : ''}`,
        date, fm, line: current.line, stem: current.title, synthesized: 'severity', type: 'lesson',
      });
      current = null;
    };
    clean.forEach((line, i) => {
      if (/^## /u.test(line)) {
        flush();
        inEntries = /^##\s+Entries\s*$/u.test(line);
        return;
      }
      if (!inEntries) return;
      const heading = /^###\s+(.+)$/u.exec(line);
      if (heading !== null) {
        flush();
        current = { line: i + 1, lines: [], own: false, title: heading[1].trim() };
      } else if (current !== null && /^<!-- agsc-item /u.test(lines[i])) current.own = true;
      else if (current !== null && line.trim() !== '---') current.lines.push(line);
    });
    flush();
    return out;
  }
  if (kind === 'audit') {
    const bullets = [];
    const prose = [];
    lines.forEach((line, i) => {
      const c = cells(line);
      if (c !== null && c.length >= 7 && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(c[0])) {
        const [timestamp, session, actorCell, type, description, outcomeCell, references] = c;
        const actor = actorOf(actorCell);
        const outcome = outcomeOf(outcomeCell);
        if (actor === null || outcome === null) {
          out.push({ line: i + 1, skip: `${path}:${i + 1}: an audit row was not imported: it states`
            + ` ${outcome === null ? `no outcome this adapter can read (${JSON.stringify(outcomeCell)})` : 'no actor'},`
            + ' and AGSC-02-14 requires one' });
          return;
        }
        const fm = Object.create(null);
        fm.started = timestamp;
        fm.actor = actor;
        fm.outcome = outcome;
        if (valueOf(type) !== '') fm['x-gabbe-type'] = valueOf(type);
        if (valueOf(session) !== '') fm['x-gabbe-session'] = valueOf(session);
        out.push({
          body: `${valueOf(description)}\n${valueOf(references) === '' ? '' : `\nReferences: ${valueOf(references)}\n`}`,
          fm, line: i + 1, stem: valueOf(description), type: 'episode',
        });
        return;
      }
      if (/^- \d{4}-\d{2}-\d{2}\b.*\|/u.test(line)) bullets.push(i + 1);
      else if (/^- \S/u.test(line) && pastReference(lines, i)) prose.push(i + 1);
    });
    if (prose.length > 0) {
      out.push({ line: prose[0], skip: `${path}: ${prose.length} further list line(s) (from line ${prose[0]})`
        + ' were not imported: they follow neither the row nor the bullet entry shape' });
    }
    if (bullets.length > 0) {
      out.push({ line: bullets[0], skip: `${path}: ${bullets.length} bullet entr${bullets.length === 1 ? 'y' : 'ies'}`
        + ` (line${bullets.length === 1 ? '' : 's'} ${bullets.join(', ')}) ${bullets.length === 1 ? 'was' : 'were'}`
        + ' not imported: a bullet entry records a date, an actor and a text, and no outcome or start time,'
        + ' which an episode must have (AGSC-02-14); nothing is invented' });
    }
    return out;
  }
  if (kind === 'state') {
    lines.forEach((line, i) => {
      const m = /^(\d{4}-\d{2}-\d{2})(?:[^:\n]{0,60})?:\s+(.+)$/u.exec(line);
      if (m === null) return;
      const text = m[2].trim();
      const plainText = text.replace(/\*\*/gu, '');
      const first = (/^(.+?[.!?])(\s|$)/u.exec(plainText) || [null, plainText])[1];
      const fm = Object.create(null);
      fm.kind = 'decision';
      out.push({ body: `${text}\n`, date: m[1], fm, line: i + 1, stem: first, type: 'concept' });
    });
    return out;
  }
  // episodic: decision logs and session snapshots.
  const header = fieldTable(lines);
  const sessionDate = header.Date;
  const startedBy = header['Started by'];
  const entryStarts = [];
  lines.forEach((line, i) => { if (/^###\s+Entry\b/u.test(line)) entryStarts.push(i); });
  if (entryStarts.length === 0) {
    const outcome = outcomeOf(header.Outcome);
    const started = instantOf(sessionDate || '', '');
    const actor = actorOf(startedBy);
    if (outcome === null || started === null || actor === null) {
      out.push({ line: 1, skip: `${path}: not imported: the file states no ${outcome === null ? 'outcome'
        : (started === null ? 'date' : 'actor')} an episode could carry (AGSC-02-14); nothing is invented` });
      return out;
    }
    const fm = Object.create(null);
    fm.started = started;
    fm.actor = actor;
    fm.outcome = outcome;
    const title = (/^#\s+(.+)$/mu.exec(text) || [null, path.split('/').pop().replace(/\.md$/u, '')])[1];
    out.push({ body: String(text), fm, line: 1, stem: title, type: 'episode' });
    return out;
  }
  entryStarts.forEach((start, n) => {
    const end = n + 1 < entryStarts.length ? entryStarts[n + 1] : lines.length;
    const f = fieldTable(lines.slice(start, end));
    const subject = valueOf(f.Subject);
    const rationale = valueOf(f.Rationale);
    const references = valueOf(f.References);
    const type = valueOf(f['Action Type']).toUpperCase();
    if (subject === '') return; // a template entry: nothing was recorded
    const body = `${rationale === '' ? subject : rationale}\n${references === '' ? '' : `\nReferences: ${references}\n`}`;
    const fm = Object.create(null);
    if (type !== '') fm['x-gabbe-type'] = type;
    if (DECISION_TYPES.includes(type)) {
      fm.kind = 'decision';
      const date = instantOf(sessionDate || '', '');
      out.push({ body, date: date === null ? null : date.slice(0, 10), fm, line: start + 1, stem: subject, type: 'concept' });
      return;
    }
    const outcome = outcomeOf(f.Outcome);
    const started = instantOf(sessionDate || '', f.Timestamp);
    const actor = actorOf(f.Actor || startedBy);
    if (outcome === null || started === null || actor === null) {
      out.push({ line: start + 1, skip: `${path}:${start + 1}: an entry was not imported: it states no`
        + ` ${outcome === null ? `outcome this adapter can read (${JSON.stringify(valueOf(f.Outcome))})`
          : (started === null ? 'date' : 'actor')}, and AGSC-02-14 requires one; nothing is invented` });
      return;
    }
    fm.started = started;
    fm.actor = actor;
    fm.outcome = outcome;
    out.push({ body, fm, line: start + 1, stem: subject, type: 'episode' });
  });
  return out;
}

/**
 * What an untrusted own-record line taints: the whole file, or — in
 * CONTINUITY, which mixes the kit's entries with ours — only the entry that carries
 * it. The lines themselves are blanked (line numbers kept), so the foreign reading
 * neither carries them nor mistakes the entry for one of ours.
 *
 * @param {string} path
 * @param {string} text
 * @param {number[]} lines the 1-based lines of the untrusted records.
 * @returns {{all:boolean, entries:Set<number>, text:string}}
 */
function taintOf(path, text, lines) {
  if (lines.length === 0) return { all: false, entries: new Set(), text };
  const rows = text.split('\n');
  for (const line of lines) rows[line - 1] = '';
  if (kindOf(path) !== 'continuity') return { all: true, entries: new Set(), text: rows.join('\n') };
  const entries = new Set();
  for (const line of lines) {
    let at = line - 1;
    while (at > 0 && !/^###\s+/u.test(rows[at - 1])) at -= 1;
    entries.add(at);
  }
  return { all: false, entries, text: rows.join('\n') };
}

/**
 * The import plan: what would be written, in code-point path order.
 *
 * @param {object} files kit-relative path → text, for every file `isKitFile` names.
 * @param {object} options
 * @param {string} options.operator `bundle.operator` of the TARGET Bundle (AGSC-08-01).
 * @param {object} options.itemSchema the raw `schema/item.schema.json`.
 * @param {string} options.toolSpecVersion this engine's `spec_version`.
 * @param {boolean} [options.allowNewer] the adapter's `--allow-newer` (AGSC-01-22).
 * @param {string} [options.sourceVersion] the adapter's `--source-version`: the
 *   content version of a foreign kit, which a kit does not publish itself.
 * @returns {{findings:Array<object>, refused:boolean, totals:object,
 *   writes:Array<{path:string, text:string}>}}
 */
function plan(files, options) {
  const opts = options || {};
  const archive = plain(files);
  const totals = { draft_untrusted: 0, foreign_skipped: 0, items: 0, own: 0, records_rejected: 0, records_untrusted: 0 };
  const findings = [];
  const taken = new Set();
  const items = [];
  const paths = Object.keys(archive).filter(isKitFile).sort(compareCodePoint);

  // Pass 1: our own records, so their slugs are kept exactly (AGSC-01-23). A line
  // is trusted only from this node or a declared peer, with consistent versions
  // an untrusted line is ignored and what carries it is read as foreign.
  const own = [];
  const origins = ownRecord.trustedOrigins(opts);
  const untrusted = new Map();
  for (const path of paths) {
    const text = String(archive[path]);
    const header = ownRecord.headerOf(text);
    MARKER.lastIndex = 0;
    for (let m = MARKER.exec(text); m !== null; m = MARKER.exec(text)) {
      const record = decodeRecord(m[1]);
      const line = text.slice(0, m.index).split('\n').length;
      if (record === null || okf.TYPE_PLURAL[record.type] === undefined || !slugs.isValid(record.slug)) {
        totals.records_rejected += 1;
        findings.push(finding('AGSC-E201', `${path}:${line}: an agsc-item line does not decode to an item;`
          + ' skipped', { file: path, line, severity: 'warn' }));
        continue;
      }
      const why = ownRecord.distrust(record, origins, header);
      if (why !== null) {
        totals.records_untrusted += 1;
        findings.push(finding('AGSC-E506', `${path}:${line}: the agsc-item line is not trusted: ${why}. Its`
          + ' provenance and status were ignored and what carries it is read as foreign',
        { file: path, line, severity: 'warn' }));
        untrusted.set(path, [...(untrusted.get(path) || []), line]);
        continue;
      }
      own.push({ line, path, record });
    }
  }
  // AGSC-01-22's LIMIT, over EVERY record of ours: one newer record refuses the
  // whole import before anything is written.
  for (const entry of own) {
    const declared = entry.record.spec_version;
    const tooNew = okf.versionRefusal(declared == null ? null : String(declared), {
      allowNewer: opts.allowNewer === true, toolSpecVersion: opts.toolSpecVersion,
    });
    if (tooNew !== null) {
      return { findings: [{ ...tooNew, file: entry.path, line: entry.line }], refused: true, totals, writes: [] };
    }
  }
  for (const entry of own) {
    const { record } = entry;
    const slug = slugs.dedupe(record.slug, taken);
    taken.add(slug);
    const fm = plain(record.frontmatter);
    fm.type = record.type;
    const prov = plain(fm.prov);
    delete prov.source_version;
    delete prov.source_hash;
    if (typeof record.bundle_version === 'string' && /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/u.test(record.bundle_version)) {
      prov.source_version = record.bundle_version;
    }
    fm.prov = { ...prov };
    items.push({ body: record.body, fm, slug, type: record.type });
    totals.own += 1;
  }

  // Pass 2: the foreign kit, file by file, in path order.
  const ownFiles = new Set(own.map((entry) => entry.path));
  let synthesizedSeverity = 0;
  for (const path of paths) {
    const forged = untrusted.get(path) || [];
    if (kindOf(path) === 'own' && forged.length > 0 && !ownFiles.has(path)) {
      totals.foreign_skipped += 1;
      findings.push(finding('AGSC-E506', `${path}: not imported: only this node's exports write this path, its`
        + ' agsc-item line is not trusted, and a kit file of this kind has no foreign reading', { file: path, line: forged[0], severity: 'warn' }));
      continue;
    }
    // A single-item file of ours came back whole in pass 1; CONTINUITY may mix the
    // kit's own entries with ours, so it is read again and skips ours entry by entry.
    if ((ownFiles.has(path) && kindOf(path) !== 'continuity') || kindOf(path) === 'own') continue;
    const tainted = taintOf(path, String(archive[path]), forged);
    for (const candidate of foreignRecords(path, tainted.text, kindOf(path))) {
      if (candidate.skip !== undefined) {
        totals.foreign_skipped += 1;
        findings.push(finding('AGSC-E506', candidate.skip, { file: path, line: candidate.line, severity: 'warn' }));
        continue;
      }
      const stem = oneLine(candidate.stem, 400) || '';
      const slug = slugs.dedupe(slugs.slugify(stem === '' ? path : stem), taken);
      taken.add(slug);
      const derived = titleFor('', oneLine(stem, 400) || slug, slug);
      findings.push(...derived.findings.map((one) => ({ ...one, file: path, line: candidate.line })));
      const fm = Object.create(null);
      fm.type = candidate.type;
      fm.title = derived.title;
      if (candidate.date) fm.date = candidate.date;
      const prov = { operator: String(opts.operator === undefined ? 'human:unknown' : opts.operator), origin: 'imported' };
      if (typeof opts.sourceVersion === 'string') prov.source_version = opts.sourceVersion;
      fm.prov = prov;
      for (const [key, value] of Object.entries(candidate.fm)) fm[key] = value;
      if (candidate.type === 'procedure' && derived.title !== candidate.name) fm['x-gabbe-name'] = candidate.name;
      fm['x-gabbe-source'] = `${path}:${candidate.line}`;
      if (tainted.all || tainted.entries.has(candidate.line)) {
        // AGSC-06-30 keeps a draft out of every published surface; a kit states no
        // licence, so nothing that arrived under a forged line may publish itself.
        fm.status = 'draft';
        totals.draft_untrusted += 1;
        findings.push(finding('AGSC-E506', `${path}:${candidate.line}: imported as status: draft: it carried an`
          + ' untrusted agsc-item line and a GABBE kit states no licence this adapter recognises as open, so it'
          + ' is never published (AGSC-06-30) until a person has the right to publish it and changes the status',
        { file: path, line: candidate.line, severity: 'warn' }));
      }
      if (candidate.synthesized === 'severity') synthesizedSeverity += 1;
      const clean = neutraliseSingleLine(fm);
      items.push({ body: nfc(String(candidate.body)), fm: plain(clean.frontmatter), foreign: true, slug, type: candidate.type });
    }
  }

  const writes = items.map((item) => ({
    path: `content/${okf.TYPE_PLURAL[item.type]}/${item.slug}.md`,
    text: itemText(item.fm, item.body, opts.itemSchema),
  }));
  totals.items = writes.length;
  const foreign = items.filter((item) => item.foreign).length;
  if (foreign > 0) {
    findings.push(finding('AGSC-E506',
      `${foreign} kit record(s) were imported with { origin: imported, operator: ${String(opts.operator)} }`
      + ` synthesized, because AGSC-08-01 requires prov${typeof opts.sourceVersion === 'string'
        ? `, and prov.source_version ${opts.sourceVersion} as --source-version stated`
        : '; a GABBE kit publishes no content version, so prov.source_version is omitted (AGSC-01-22) —'
          + ' pass --source-version <v> (for instance the kit\'s commit) to record one'}`,
      { file: '', severity: 'warn' }));
  }
  if (synthesizedSeverity > 0) {
    findings.push(finding('AGSC-E506',
      `${synthesizedSeverity} CONTINUITY entr${synthesizedSeverity === 1 ? 'y was' : 'ies were'} imported as`
      + ' lesson(s) with severity "info", the AGSC-09-14b default: a GABBE entry states no severity',
      { file: CONTINUITY, severity: 'warn' }));
  }
  writes.sort((a, b) => compareCodePoint(a.path, b.path));
  return { findings, refused: false, totals, writes };
}

module.exports = {
  AUDIT_LOG, CLAIMED_KEYS, CONTINUITY, FORMAT, PROJECT_STATE, RESUME_POINTER,
  actorOf, cells, decodeRecord, encodeRecord, instantOf,
  isKitFile, kindOf, outcomeOf, plan, run, valueOf, withoutComments,
};
