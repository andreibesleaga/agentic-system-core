'use strict';
/**
 * interchange/memory-records — what the six direct memory adapters share (AGSC-01-26a):
 * `mem0`, `letta`, `zep`, `csv`, `basic-memory` and `claude-code`.
 *
 * Each of those adapters is one module under `adapters/` and keeps only what is its
 * own: the file shape of one tool. This module holds the two halves they have in
 * common, so that the six cannot drift apart:
 *
 *   EXPORT  `exportRecords` — the published items in slug order (AGSC-06-30: drafts,
 *           retired and release-gated items never leave), the AGSC-06-15 provenance
 *           lines (AGSC-01-29), and for every item its OWN RECORD: the authored
 *           frontmatter, the body, the slug, the type, the item IRI, the licence and
 *           the Content Use Terms, the specification and content versions. An adapter
 *           puts the record where its tool keeps free-form data — a JSON `metadata`
 *           member, a CSV column, or an `<!-- agsc-item … -->` line in Markdown — so a
 *           return import rebuilds the item exactly (AGSC-00-22).
 *
 *   IMPORT  `plan` — the candidates an adapter read from its tool's files, turned
 *           into the writes of one import. A candidate that carries an own record is
 *           OUR OWN only when `own-record.js` trusts it (this node's `site.base` or a
 *           declared peer, consistent versions); it then comes back item for item,
 *           with `prov.source_version`. Every other candidate is FOREIGN: it is
 *           written with `status: draft`, `prov.origin: imported` and this Bundle's
 *           operator, and reported once as `AGSC-E506` naming the item and the draft
 *           status (AGSC-01-22 from 1.1: a source this node does not own never
 *           publishes itself). What a mapping does not claim stays in `x-<vendor>-*`
 *           keys (AGSC-02-05a), never dropped. A source of another specification MAJOR
 *           is refused before anything is written unless `--allow-newer` is given.
 *
 * Neither half reads a file, a clock or the network: the verb reads the files and
 * hands them in, and the build instant comes from the caller (AGSC-00-24: a memory
 * adapter never reaches the network). Output is deterministic (AGSC-01-23).
 *
 * PURE. Requirements: AGSC-00-22, AGSC-01-22, AGSC-01-23, AGSC-01-26a, AGSC-01-29,
 * AGSC-06-30; PRD-026, PRD-070.
 */

const chunks = require('../knowledge/chunks.js');
const frontmatterModule = require('../knowledge/frontmatter.js');
const slugs = require('../knowledge/slug.js');
const yaml = require('../knowledge/yaml.js');
const { canonicalize } = require('../knowledge/jcs.js');
const { compareCodePoint, nfc } = require('../knowledge/unicode.js');
const { provenanceLines } = require('../knowledge/provenance-header.js');
const { titleFor } = require('../knowledge/adopt.js');
const { LINK_PROPERTIES, itemIri } = require('../knowledge/nquads.js');
const { finding } = require('../knowledge/validate.js');
const { neutraliseSingleLine } = require('./mapping.js');
const okf = require('./okf.js');
const ownRecord = require('./own-record.js');
const { isObject, itemText, oneLine, plain, yamlString } = require('./records.js');
const { withoutTrailingSlashes } = require('../shared/trailing.js');

/** AGSC-04-25's content-version grammar. */
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/u;

/** An own record in Markdown: one line, anchored, so a quoted body cannot forge one. */
const MARKER = /^<!-- agsc-item ([A-Za-z0-9+/]+={0,2}) -->$/gmu;

// -------------------------------------------------------------------------- export

/**
 * The published items of a Bundle, each with its own record, and the provenance lines.
 *
 * @param {object} bundle the loaded Bundle.
 * @param {{instant:string, specVersion:string, bundleVersion?:string}} options
 * @returns {{header:string[], base:string, entries:Array<{item:object, record:object}>}}
 */
function exportRecords(bundle, options) {
  const config = (bundle && bundle.config) || {};
  const site = config.site || {};
  const base = `${withoutTrailingSlashes(String(site.base || ''))}/`;
  const license = (config.bundle && config.bundle.license_prose) || chunks.TERMS;
  const terms = chunks.termsFor(license);
  const header = provenanceLines({
    bundle: base, bundleVersion: options.bundleVersion, generatedAt: options.instant,
    license, specVersion: options.specVersion, terms,
  });
  const bundleVersion = header.find((line) => line.startsWith('bundle_version: ')).slice(16);
  const entries = ((bundle && bundle.items) || [])
    .filter((item) => item && item.frontmatter)
    .map((item) => ({ authored: item.frontmatter,
      item: { ...item.frontmatter, body: item.body, path: item.path, slug: item.slug, type: item.type } }))
    .filter((entry) => chunks.isPublished(entry.item, config.releases))
    .sort((a, b) => compareCodePoint(String(a.item.slug), String(b.item.slug)))
    .map(({ authored, item }) => {
      const iri = itemIri(item, { base });
      return {
        item,
        record: {
          body: String(item.body == null ? '' : item.body),
          bundle: base,
          bundle_version: bundleVersion,
          frontmatter: authored,
          ...(iri === null ? {} : { iri }),
          license,
          slug: String(item.slug),
          spec_version: String(options.specVersion),
          terms,
          type: String(item.type),
        },
      };
    });
  return { base, entries, header };
}

/**
 * The text a memory tool stores for one item: its title, a blank line, its body — the
 * title only once, when the body already opens with it as a heading.
 */
function memoryText(item) {
  const title = oneLine(String(item.title == null ? item.slug : item.title)) || String(item.slug);
  const body = String(item.body == null ? '' : item.body).replace(/^\n+/u, '').trimEnd();
  if (body === '') return title;
  return body.split('\n')[0] === `# ${title}` ? body : `${title}\n\n${body}`;
}

/** Every published item's authored Links, as `[key, target]` pairs whose target is published. */
function authoredLinks(item, published) {
  const out = [];
  for (const key of Object.keys(LINK_PROPERTIES).sort(compareCodePoint)) {
    const targets = Array.isArray(item[key]) ? item[key] : [];
    for (const target of targets) {
      const slug = String(target).split('#')[0];
      if (published.has(slug)) out.push([key, String(target)]);
    }
  }
  return out;
}

/**
 * A YAML frontmatter block from `[key, value]` pairs, in their order: a string is a
 * double-quoted scalar, a list a flow sequence of them, an absent value no line.
 *
 * @param {Array<[string, *]>} pairs
 * @returns {string[]} the lines, fences included.
 */
function yamlLines(pairs) {
  const lines = ['---'];
  for (const [key, value] of pairs) {
    if (value == null) continue;
    if (Array.isArray(value)) lines.push(`${key}: [${value.map(yamlString).join(', ')}]`);
    else lines.push(`${key}: ${yamlString(value)}`);
  }
  lines.push('---');
  return lines;
}

/** One JSON export file, with a trailing line feed: the same bytes on every run. */
function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** The files of an export, in path order, each with its digest. */
function filesOf(map, sha256) {
  return [...map.keys()].sort(compareCodePoint).map((path) => {
    const raw = map.get(path);
    const text = raw.endsWith('\n') ? raw : `${raw}\n`;
    return { path, sha256: sha256(text), text };
  });
}

// -------------------------------------------------------------------------- import

/** The own records a Markdown text carries, each with its 1-based line, or `[]`. */
function markdownRecords(text) {
  const out = [];
  MARKER.lastIndex = 0;
  for (let m = MARKER.exec(text); m !== null; m = MARKER.exec(text)) {
    out.push({ encoded: m[1], line: text.slice(0, m.index).split('\n').length });
  }
  return out;
}

/**
 * One Markdown note of a memory tool, read: its own record (the first `agsc-item`
 * line) with the file's provenance header, its frontmatter as the failsafe YAML of
 * AGSC-02-02 (`null` when it has none; `false` when it is not that subset), and its
 * body with every own-record line taken out, so a foreign reading never carries one.
 *
 * @param {string} text
 * @returns {{agsc:(object|null), header:(object|null), frontmatter:(object|null|false), body:string}}
 */
function markdownNote(text) {
  const records = markdownRecords(String(text));
  const agsc = records.length === 0 ? null : ownRecord.decodeRecord(records[0].encoded);
  const split = frontmatterModule.split(String(text));
  let fm = null;
  if (split.hasFrontmatter) {
    try {
      const parsed = yaml.parse(split.yamlText);
      fm = isObject(parsed) ? plain(parsed) : false;
    } catch (e) {
      fm = false;
    }
  }
  return { agsc: agsc === null ? null : plain(agsc), body: ownRecord.stripLines(split.body), frontmatter: fm,
    header: ownRecord.headerOf(String(text)) };
}

/** Is this an own record shaped as a whole item? */
function isItemRecord(value) {
  return isObject(value) && isObject(value.frontmatter) && typeof value.body === 'string'
    && typeof value.slug === 'string' && typeof value.type === 'string';
}

/** The members of a foreign record the mapping did not claim, as one JCS string, or `null`. */
function restOf(value, claimed) {
  const rest = Object.create(null);
  for (const key of Object.keys(value).sort(compareCodePoint)) {
    const v = value[key];
    if (claimed.includes(key) || v === null || v === undefined) continue;
    rest[key] = v;
  }
  return Object.keys(rest).length === 0 ? null : canonicalize(rest);
}

/** `YYYY-MM-DD…` (an instant or a date) → `YYYY-MM-DD`, or `null`. */
function dateOf(value) {
  const m = /^(\d{4}-\d{2}-\d{2})(?:$|[T ])/u.exec(String(value == null ? '' : value).trim());
  return m === null ? null : m[1];
}

/** The parsed JSON of a file, or the finding that says why it is not read. */
function parseJson(path, text) {
  try {
    return { findings: [], value: JSON.parse(String(text)) };
  } catch (e) {
    return { findings: [finding('AGSC-E201', `${path}: not imported: the file is not JSON (${e && e.message})`,
      { file: path, line: 1, severity: 'warn' })], value: undefined };
  }
}

/**
 * The records of a JSON file: a bare array, or the array under the first of `members`
 * an object carries. Anything else is `null`.
 *
 * @param {*} value
 * @param {string[]} members
 * @returns {{records:Array<*>, header:(string[]|null)}|null}
 */
function arrayIn(value, members) {
  if (Array.isArray(value)) return { header: null, records: value };
  if (!isObject(value)) return null;
  const header = Array.isArray(value.agsc_provenance) ? value.agsc_provenance.map(String) : null;
  for (const member of members) {
    if (Array.isArray(value[member])) return { header, records: value[member] };
  }
  return null;
}

/**
 * The candidates of every JSON file of a source: the records of the array the file
 * holds (`arrayIn`), each with its own record (`agscOf`) and its foreign mapping
 * (`foreign`, which answers the mapping or `{skip}`). A record is located as
 * `<file>:<n>`, its 1-based position in that array.
 *
 * @param {object} files source-relative path → text.
 * @param {{isSourceFile:(p:string)=>boolean, members:string[], what:string,
 *   agscOf:(r:object)=>(object|null), foreign:(r:object, where:string)=>object}} spec
 * @returns {{candidates:Array<object>, findings:Array<object>}}
 */
function jsonCandidates(files, spec) {
  const candidates = [];
  const findings = [];
  for (const path of Object.keys(files).filter(spec.isSourceFile).sort(compareCodePoint)) {
    const parsed = parseJson(path, files[path]);
    findings.push(...parsed.findings);
    if (parsed.value === undefined) continue;
    const found = arrayIn(parsed.value, spec.members);
    if (found === null) {
      findings.push(finding('AGSC-E506', `${path}: not imported: the file holds no list of ${spec.what}`
        + ` (a JSON array, or one under ${spec.members.map((m) => `"${m}"`).join(' or ')})`, { file: path, line: 1, severity: 'warn' }));
      continue;
    }
    found.records.forEach((record, index) => {
      const where = `${path}:${index + 1}`;
      if (!isObject(record)) {
        candidates.push({ file: path, line: index + 1, skip: `${where}: not imported: the record is not a JSON object` });
        return;
      }
      const value = plain(record);
      const agsc = spec.agscOf(value);
      const mapped = spec.foreign(value, where);
      candidates.push({
        file: path,
        line: index + 1,
        ...(agsc === null ? {} : { agsc, header: ownRecord.headerOf(found.header) }),
        ...(typeof mapped.skip === 'string' ? { skip: mapped.skip } : { foreign: mapped }),
      });
    });
  }
  return { candidates, findings };
}

/** The `agsc` member of a JSON `metadata` object, or `null`. */
function agscIn(metadata) {
  return isObject(metadata) && isObject(metadata.agsc) ? plain(metadata.agsc) : null;
}

/**
 * The `agsc` member of a JSON `metadata` object that holds the own record encoded as one
 * base64 string (`own-record.js#encodeRecord`), for a tool whose metadata values must be
 * scalars (Zep), or `null`.
 */
function encodedAgscIn(metadata) {
  if (!isObject(metadata) || typeof metadata.agsc !== 'string') return null;
  const record = ownRecord.decodeRecord(metadata.agsc);
  return record === null ? null : plain(record);
}

/** The first string among `keys` of a record (a camelCase and a snake_case spelling, say), or `null`. */
function firstString(record, keys) {
  for (const key of keys) if (typeof record[key] === 'string') return record[key];
  return null;
}

/**
 * A foreign memory text as a lesson: its first line names it, the text is the
 * `## Lesson` section, and the severity is `info` (AGSC-09-14b's default: no memory
 * tool states one). The mapping the COGX adapter already gives a COGX `memory`.
 *
 * @param {string} text the memory text.
 * @param {object} fm the `x-<vendor>-*` keys and any other mapped key.
 * @param {string|null} created the record's creation instant or date.
 * @returns {object|{skip:string}}
 */
function lessonOf(text, fm, created, where) {
  const content = nfc(String(text == null ? '' : text)).trim();
  if (content === '') return { skip: `${where}: not imported: the record carries no text` };
  return {
    body: `## Lesson\n\n${content}\n`,
    date: dateOf(created),
    fm: { severity: 'info', ...fm },
    stem: content.split('\n')[0],
    type: 'lesson',
  };
}

/** Why an own record is not used, or `null` when it is trusted. */
function untrusted(candidate, origins) {
  if (!isItemRecord(candidate.agsc)) return 'it does not decode to an item';
  if (okf.TYPE_PLURAL[candidate.agsc.type] === undefined || !slugs.isValid(candidate.agsc.slug)) {
    return `it names type ${JSON.stringify(String(candidate.agsc.type))} and slug`
      + ` ${JSON.stringify(String(candidate.agsc.slug))}, which are not an item of this format`;
  }
  return ownRecord.distrust(candidate.agsc, origins, candidate.header || null);
}

/** The item of a trusted own record, with AGSC-01-22's record of where it came from. */
function ownItem(record, taken) {
  const slug = slugs.dedupe(String(record.slug), taken);
  taken.add(slug);
  const fm = plain(record.frontmatter);
  fm.type = String(record.type);
  const prov = plain(fm.prov);
  delete prov.source_version;
  delete prov.source_hash;
  if (typeof record.bundle_version === 'string' && VERSION.test(record.bundle_version)) {
    prov.source_version = record.bundle_version;
  }
  fm.prov = { ...prov };
  return { body: String(record.body), fm, slug, type: String(record.type) };
}

/** The mapping words of one foreign item's draft warning (AGSC-01-22, AGSC-02-90). */
function mappingWords(fm) {
  if (fm.type === 'concept') return `concept, kind ${String(fm.kind)}`;
  if (fm.type === 'lesson') return `lesson, severity ${String(fm.severity)} (the AGSC-09-14b default; the source states none)`;
  return String(fm.type);
}

/** The item of a foreign candidate: always a draft, with the provenance AGSC-08-01 requires. */
function foreignItem(candidate, taken, opts) {
  const mapped = candidate.foreign;
  const stem = oneLine(mapped.stem, 400) || '';
  const slug = slugs.dedupe(slugs.slugify(stem === '' ? candidate.file : stem), taken);
  taken.add(slug);
  const derived = titleFor('', stem === '' ? slug : stem, slug);
  const fm = Object.create(null);
  fm.type = mapped.type;
  fm.title = derived.title;
  if (typeof mapped.date === 'string') fm.date = mapped.date;
  const prov = { operator: String(opts.operator === undefined ? 'human:unknown' : opts.operator), origin: 'imported' };
  if (typeof opts.sourceVersion === 'string') prov.source_version = opts.sourceVersion;
  fm.prov = prov;
  for (const [key, value] of Object.entries(mapped.fm)) fm[key] = value;
  fm.status = 'draft';
  const clean = neutraliseSingleLine(fm);
  return {
    findings: derived.findings.map((one) => ({ ...one, file: candidate.file, line: candidate.line })),
    item: { body: nfc(String(mapped.body)), fm: plain(clean.frontmatter), foreign: true, links: mapped.links || [],
      refs: mapped.refs || [], slug, type: mapped.type },
  };
}

/** Foreign relations → typed Links, where the key is one of the fourteen and the target is an item here. */
function linkForeign(items, totals) {
  const byRef = new Map();
  for (const item of items) {
    for (const ref of [item.slug, ...item.refs]) {
      const key = String(ref).toLowerCase();
      if (key !== '' && !byRef.has(key)) byRef.set(key, item.slug);
    }
  }
  for (const item of items) {
    for (const link of item.links) {
      // AGSC-03-19: a foreign link name is mapped, never added to the vocabulary.
      const named = String(link.key).replace(/_/gu, '-');
      const key = okf.FOREIGN_LINK_NAMES[named] === undefined ? named : okf.FOREIGN_LINK_NAMES[named];
      const target = byRef.get(String(link.ref).toLowerCase());
      if (LINK_PROPERTIES[key] === undefined || target === undefined || target === item.slug) continue;
      const current = Array.isArray(item.fm[key]) ? item.fm[key] : [];
      if (!current.includes(target)) item.fm[key] = [...current, target];
      totals.links += 1;
    }
  }
}

/**
 * The import plan of one direct memory adapter.
 *
 * A candidate is `{file, line, agsc?, header?, foreign?, skip?}`: `agsc` an own record
 * (trusted or not), `header` the provenance lines of the file that carried it,
 * `foreign` the mapping of the record as a foreign one — `{type, stem, body, fm,
 * date?, links?, refs?}` — and `skip` the reason a record is reported and not written.
 *
 * @param {Array<object>} candidates in the order the adapter read them.
 * @param {object} options
 * @param {string} options.operator `bundle.operator` of the TARGET Bundle (AGSC-08-01).
 * @param {object} options.itemSchema the raw `schema/item.schema.json`.
 * @param {string} options.toolSpecVersion this engine's `spec_version`.
 * @param {boolean} [options.allowNewer] the adapter's `--allow-newer` (AGSC-01-22).
 * @param {string} [options.sourceVersion] `--source-version`: the source's content version.
 * @param {string} [options.origin] this node's `site.base`; [options.peers] its peers.
 * @returns {{findings:Array<object>, refused:boolean, totals:object, writes:Array<{path:string, text:string}>}}
 */
function plan(candidates, options) {
  const opts = options || {};
  const totals = { foreign_drafts: 0, foreign_skipped: 0, items: 0, links: 0, own: 0, records_untrusted: 0 };
  const findings = [];
  const origins = ownRecord.trustedOrigins(opts);
  const own = [];
  const rest = [];
  for (const candidate of candidates) {
    if (candidate.agsc === undefined) {
      rest.push(candidate);
      continue;
    }
    const why = untrusted(candidate, origins);
    if (why === null) {
      own.push(candidate);
      continue;
    }
    totals.records_untrusted += 1;
    findings.push(finding('AGSC-E506', `${candidate.file}:${candidate.line}: the own record is not trusted: ${why};`
      + ' its provenance and status were ignored and the record is read as foreign',
    { file: candidate.file, line: candidate.line, severity: 'warn' }));
    rest.push(candidate);
  }
  // AGSC-01-22's LIMIT, over every record of ours: one newer MAJOR refuses the whole import.
  for (const candidate of own) {
    const tooNew = okf.versionRefusal(String(candidate.agsc.spec_version), {
      allowNewer: opts.allowNewer === true, toolSpecVersion: opts.toolSpecVersion,
    });
    if (tooNew !== null) return { findings: [{ ...tooNew, file: candidate.file, line: candidate.line }], refused: true, totals, writes: [] };
  }
  findings.push(...okf.versionWarnings(own.map((candidate) => ({ file: candidate.file, line: candidate.line,
    version: candidate.agsc.spec_version })), { toolSpecVersion: opts.toolSpecVersion }));

  const taken = new Set();
  const items = own.map((candidate) => ownItem(candidate.agsc, taken));
  totals.own = items.length;
  const foreign = [];
  for (const candidate of rest) {
    if (candidate.foreign === undefined || candidate.foreign === null) {
      totals.foreign_skipped += 1;
      findings.push(finding('AGSC-E506', candidate.skip || `${candidate.file}:${candidate.line}: not imported`,
        { file: candidate.file, line: candidate.line, severity: 'warn' }));
      continue;
    }
    const made = foreignItem(candidate, taken, opts);
    findings.push(...made.findings);
    findings.push(finding('AGSC-E506', `${candidate.file}:${candidate.line}: imported as ${made.item.slug}`
      + ` (${mappingWords(made.item.fm)}) with status: draft: the source is not this node, so the item is never`
      + ' published (AGSC-06-30) until a person has the right to publish it and changes the status (AGSC-01-22)',
    { file: candidate.file, line: candidate.line, severity: 'warn' }));
    foreign.push(made.item);
  }
  linkForeign(foreign, totals);
  totals.foreign_drafts = foreign.length;
  items.push(...foreign);
  const writes = items.map((item) => ({
    path: `content/${okf.TYPE_PLURAL[item.type]}/${item.slug}.md`,
    text: itemText(item.fm, item.body, opts.itemSchema),
  })).sort((a, b) => compareCodePoint(a.path, b.path));
  totals.items = writes.length;
  if (foreign.length > 0) {
    findings.push(finding('AGSC-E506', `${foreign.length} foreign record(s) were imported with { origin: imported,`
      + ` operator: ${String(opts.operator)} } synthesized, because AGSC-08-01 requires prov${typeof opts.sourceVersion === 'string'
        ? `, and prov.source_version ${opts.sourceVersion} as --source-version stated`
        : '; the source publishes no content version, so prov.source_version is omitted (AGSC-01-22)'}`,
    { file: '', severity: 'warn' }));
  }
  return { findings, refused: false, totals, writes };
}

module.exports = {
  agscIn, authoredLinks, dateOf, encodedAgscIn, exportRecords, filesOf, firstString, jsonCandidates, jsonText, lessonOf,
  markdownNote, memoryText, plan, restOf, yamlLines,
};
