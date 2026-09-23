'use strict';
/**
 * CONTEXT Interchange — memory adapter `cogx` (AGSC-01-26a; RES1-04, `research/38` §3.3).
 *
 * `export --to cogx` writes a COGX 0.1 archive and `import --from cogx` reads one.
 * COGX (the Cognee eXchange format) is the hub format Cognee's importers translate
 * Mem0, LangMem, Letta/MemGPT and Zep/Graphiti into, so one archive on disk reaches
 * every one of those systems without this engine touching a network (AGSC-00-24).
 *
 * THE FORMAT, AS READ FROM ITS REFERENCE IMPLEMENTATION on 2026-09-23
 * (`cognee/modules/migration/cogx.py` on `topoteretes/cognee@main`; the exact quotes
 * are in the CONN-1 report, §1.1):
 *   * "An archive is a directory containing ``manifest.json`` plus one JSONL file per
 *     record kind." The file names are fixed: `documents.jsonl`, `episodes.jsonl`,
 *     `entities.jsonl`, `facts.jsonl`, `memories.jsonl`, `memory_blocks.jsonl`, and
 *     `nodes.jsonl` for raw graph nodes. A writer opens a file only for a kind it has
 *     a record of, so an absent file means "no record of that kind".
 *   * Every typed record carries `external_system` (default `"unknown"`),
 *     `external_id` (required), `scope` (`user_id`/`agent_id`/`session_id`/`run_id`),
 *     `created_at`, `updated_at` and `metadata` (a free dictionary), and is written
 *     with `model_dump_json(exclude_none=True)`: a member whose value is None is
 *     OMITTED, while a member with a default factory (`scope`, `metadata`, `aliases`,
 *     `attributes`, `turns`, `categories`, `provenance`) is always written.
 *   * A raw node is NOT a typed record: `nodes.jsonl` holds the bare property
 *     dictionary on each line (`json.dumps(node)`), and it has no `metadata` and no
 *     `scope`. This is the one place the format is easiest to get wrong.
 *   * The manifest carries `cogx_version`, `source_system`, `exported_at`, `counts`,
 *     `embedding_model`, `migration_revision` and `notes`. A reader rejects an archive
 *     "written by a newer major COGX version than this reader".
 *   * `permissions.json` "carries user emails, password HASHES, and account flags, so
 *     an archive containing this file must be handled as a secret". This adapter never
 *     writes it and refuses an archive that carries it.
 *
 * EXPORT — one PRIMARY record per published item, so nothing is exported twice:
 *   concept → `entity`, episode → `episode` (one turn), lesson → `memory`, procedure →
 *   `memory_block`, cluster and gate → a raw node. Beside them, one `document` per
 *   chunk record of AGSC-06-29 (the citable unit: id, digest, section) and one `fact`
 *   per AUTHORED Link whose target is published (computed inverses are derived, never
 *   exported — AGSC-03-04). Drafts, retired and release-gated items never leave
 *   (AGSC-06-30).
 *
 * LOSSLESS WITHOUT ABUSING THE FORMAT. Every record's `metadata` carries one member,
 * `agsc`, with the Bundle IRI, the item IRI, the licence, the Content Use Terms
 * (AGSC-01-29), the trust mark (AGSC-08-18), the specification and content versions
 * and the build instant; the PRIMARY record's `agsc` also carries the complete
 * authored frontmatter and body. A foreign reader that ignores `metadata` still gets
 * well-formed typed records; this reader rebuilds the item exactly. A raw node has no
 * `metadata`, so the same member rides in its property dictionary. The AGSC-06-15
 * provenance header lines are the manifest's `notes[]`.
 *
 * IMPORT. Our own archive: every primary record becomes the item it came from; the
 * derived records (documents, facts) are skipped because the item already holds them.
 * An `agsc` member counts as ours only when it names this node's `site.base` or a
 * declared peer and its versions agree with the manifest's provenance notes
 * (`interchange/own-record.js`, CONN2-03); any other is reported, and its record is
 * read as foreign and kept as a draft, because a COGX record states no licence.
 * A FOREIGN archive is imported by kind — `entity` → `concept`, `memory` → `lesson`,
 * `memory_block` → `procedure`, `fact` → a typed Link when both ends resolve and the
 * predicate is one of AGSC-03-01's fourteen — with `prov.origin: imported` and the
 * target Bundle's `bundle.operator`. What the mapping does not claim is kept, never
 * dropped: the rest of the foreign record rides as one JCS string in `x-cogx-rest`
 * (AGSC-02-05a). A foreign `episode` is REPORTED AND SKIPPED, because AGSC-02-14
 * requires `outcome` and COGX carries nothing that yields it; a foreign `document`
 * and a foreign raw node are reported and skipped too (a document is the source text
 * the other records were derived from, and a raw node has no typed mapping).
 *
 * DETERMINISM (AGSC-04-01, AGSC-01-23). Lines are JCS-canonical, files and records in
 * a fixed order, instants from the caller, never a clock.
 *
 * PURE: no fs, no clock, no network. Requirements: AGSC-01-22, AGSC-01-23,
 * AGSC-01-26a, AGSC-01-29, AGSC-06-30; PRD-021, PRD-026.
 * Owner: CONN-1 (session 31).
 */

const chunks = require('../../knowledge/chunks.js');
const slugs = require('../../knowledge/slug.js');
const fix = require('../../governance/fix.js');
const { canonicalize } = require('../../knowledge/jcs.js');
const { compareCodePoint, nfc } = require('../../knowledge/unicode.js');
const { provenanceLines } = require('../../knowledge/provenance-header.js');
const { serialize, titleFor } = require('../../knowledge/adopt.js');
const { LINK_PROPERTIES } = require('../../knowledge/nquads.js');
const { finding } = require('../../knowledge/validate.js');
const { neutraliseSingleLine } = require('../mapping.js');
const okf = require('../okf.js');
const ownRecord = require('../own-record.js');

/** The name this adapter answers to on `export --to` and `import --from`. */
const FORMAT = 'cogx';

/** The COGX version this adapter writes and reads (`COGX_VERSION` of the reference). */
const COGX_VERSION = '0.1';

/** `external_system` and `source_system` of everything this engine writes. */
const SOURCE_SYSTEM = 'agentic-system-core';

/** The reference's `RECORD_FILES`, verbatim, in its own read order. */
const RECORD_FILES = Object.freeze({
  document: 'documents.jsonl',
  episode: 'episodes.jsonl',
  entity: 'entities.jsonl',
  fact: 'facts.jsonl',
  memory: 'memories.jsonl',
  memory_block: 'memory_blocks.jsonl',
});
const MANIFEST_FILE = 'manifest.json';
const RAW_NODES_FILE = 'nodes.jsonl';
const PERMISSIONS_FILE = 'permissions.json';

/** Every file name a reader looks for, in the reference's read order. */
const ARCHIVE_FILES = Object.freeze([MANIFEST_FILE, ...Object.values(RECORD_FILES), RAW_NODES_FILE]);

/** The members a typed record always carries, because the reference gives them a default factory. */
const DEFAULTS = Object.freeze({
  document: {},
  entity: { aliases: [], attributes: {} },
  episode: { turns: [] },
  fact: { provenance: [] },
  memory: { categories: [] },
  memory_block: {},
});

/** AGSC-02-15: `when` is at most 1024 characters, so the block's limit is that bound. */
const BLOCK_LIMIT = 1024;

/** A record line longer than this is refused and named (AGSC-E904; the input cap of AGSC-01-16). */
const MAX_LINE_BYTES = 1024 * 1024;

/** The concept `kind` values (schema/item.schema.json) a foreign `entity_type` may map onto. */
const CONCEPT_KINDS = Object.freeze(['pattern', 'taxonomy', 'explainer', 'principle', 'decision',
  'spec', 'task', 'term', 'architecture']);

/** The keys this adapter claims (AGSC-01-26a), for the implementer documentation. */
const CLAIMED_KEYS = Object.freeze({
  export: 'every authored frontmatter key and the body of every published item (in metadata.agsc)',
  import: Object.freeze(['aliases', 'categories', 'content', 'created_at', 'description',
    'entity_type', 'external_id', 'external_system', 'label', 'name', 'object_ref', 'predicate',
    'subject_ref', 'value']),
});

// ------------------------------------------------------------------- shared helpers

/** A plain object with no prototype, so a foreign `__proto__` member is only data. */
function plain(value) {
  const out = Object.create(null);
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of Object.keys(value)) out[key] = value[key];
  }
  return out;
}

/** Is this a JSON object (not an array, not null)? */
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Drop every member whose value is `null` or `undefined`, recursively — the
 * reference's `exclude_none=True`. Arrays keep their positions.
 */
function withoutNone(value) {
  if (Array.isArray(value)) return value.map(withoutNone);
  if (isObject(value)) {
    const out = {};
    for (const key of Object.keys(value)) {
      if (value[key] === null || value[key] === undefined) continue;
      out[key] = withoutNone(value[key]);
    }
    return out;
  }
  return value;
}

/**
 * An AGSC `date` (`YYYY-MM-DD`) or instant as the COGX timestamp the reference parses
 * (`datetime.fromisoformat` after `Z` → `+00:00`); a date reads as midnight UTC, the
 * AGSC-05-14 convention. Anything else is `null`, so the member is omitted.
 */
function timestampOf(value) {
  const text = value == null ? '' : String(value);
  if (/^\d{4}-\d{2}-\d{2}$/u.test(text)) return `${text}T00:00:00Z`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/u.test(text)) return text;
  return null;
}

/** One JCS line of one typed record, with the reference's always-present members. */
function typedRecord(kind, fields) {
  return withoutNone({
    external_system: SOURCE_SYSTEM,
    metadata: {},
    scope: {},
    ...DEFAULTS[kind],
    ...fields,
    kind,
  });
}

/** The `## Lesson` section of a lesson body, else the whole body, trimmed. */
function lessonText(body) {
  const parts = chunks.sections(String(body == null ? '' : body));
  const lesson = parts.find((part) => /^##\s+lesson\s*$/iu.test(part.text.split('\n')[0]));
  const text = lesson === undefined ? String(body == null ? '' : body)
    : lesson.text.split('\n').slice(1).join('\n');
  return text.trim();
}

// -------------------------------------------------------------------------- export

/**
 * The PRIMARY record of one published item (§2.1 of the CONN-1 design).
 *
 * @param {object} item the flattened item (frontmatter members + body/path/slug/type).
 * @param {object} authored the item's authored frontmatter, exactly as loaded.
 * @param {object} common the `metadata.agsc` members every record carries.
 * @returns {{file:string, record:object}}
 */
function primaryRecord(item, authored, common) {
  const iri = chunks.itemIri(common.bundle, item);
  const agsc = {
    ...common,
    body: String(item.body == null ? '' : item.body),
    frontmatter: authored,
    iri,
    path: String(item.path),
    slug: String(item.slug),
    type: String(item.type),
  };
  const prov = isObject(item.prov) ? item.prov : {};
  const base = {
    created_at: timestampOf(item.date),
    external_id: iri,
    metadata: { agsc },
    scope: { agent_id: prov.agent == null ? null : String(prov.agent) },
    updated_at: timestampOf(item.modified),
  };
  const title = item.title == null ? String(item.slug) : String(item.title);
  switch (item.type) {
    case 'concept':
      return {
        file: RECORD_FILES.entity,
        record: typedRecord('entity', {
          ...base,
          aliases: Array.isArray(item.aliases) ? item.aliases.map(String) : [],
          description: item.description == null ? null : String(item.description),
          entity_type: item.kind == null ? null : String(item.kind),
          name: title,
        }),
      };
    case 'episode':
      return {
        file: RECORD_FILES.episode,
        record: typedRecord('episode', {
          ...base,
          title,
          turns: [{
            content: String(item.body == null ? '' : item.body),
            occurred_at: timestampOf(item.started),
            role: String(item.actor == null ? 'unknown' : item.actor),
          }],
        }),
      };
    case 'lesson':
      return {
        file: RECORD_FILES.memory,
        record: typedRecord('memory', {
          ...base,
          categories: Array.isArray(item.tags) ? item.tags.map(String) : [],
          content: lessonText(item.body),
        }),
      };
    case 'procedure':
      return {
        file: RECORD_FILES.memory_block,
        record: typedRecord('memory_block', {
          ...base,
          label: String(item.slug),
          limit: BLOCK_LIMIT,
          value: String(item.when == null ? title : item.when),
        }),
      };
    default:
      // cluster, gate: "a graph node persisted verbatim … when no typed mapping
      // exists". The line IS the property dictionary (`json.dumps(node)`), so the
      // `agsc` member rides in it, beside the `id` and `type` the reference names.
      return {
        file: RAW_NODES_FILE,
        record: withoutNone({ agsc, id: iri, name: title, type: String(item.type) }),
      };
  }
}

/** One `document` per chunk record (AGSC-06-29). */
function documentRecord(chunk, common) {
  return typedRecord('document', {
    content: String(chunk.text),
    external_id: String(chunk.id),
    metadata: {
      agsc: {
        ...common,
        digest: chunk.digest,
        iri: chunk.iri,
        item: chunk.item,
        kind: chunk.kind,
        links: chunk.links == null ? null : chunk.links,
        ordinal: chunk.ordinal,
        section: chunk.section,
      },
    },
    mime_type: chunk.type === 'text' ? 'text/markdown' : String(chunk.type),
    title: chunk.title == null ? null : String(chunk.title),
  });
}

/**
 * One `fact` per authored Link to a published item. The predicate is the RDF property
 * AGSC-03-01 fixes (`knowledge/nquads.js#LINK_PROPERTIES`); `broader` on a cluster is
 * nesting, not a relation (AGSC-05-19), and is not a fact.
 */
function factRecords(item, published, common) {
  const out = [];
  const links = chunks.linksOf(item) || {};
  const subject = chunks.itemIri(common.bundle, item);
  for (const key of Object.keys(links).sort(compareCodePoint)) {
    if (key === 'broader' && item.type === 'cluster') continue;
    for (const target of [...new Set(links[key])]) {
      const other = published.get(target);
      if (other === undefined) continue;
      const object = chunks.itemIri(common.bundle, other);
      out.push(typedRecord('fact', {
        external_id: `${subject}#${key}/${target}`,
        fact_text: `${item.title == null ? item.slug : item.title} ${key} ${other.title == null ? target : other.title}`,
        metadata: { agsc: { ...common, key, object: target, subject: String(item.slug) } },
        object_ref: object,
        predicate: LINK_PROPERTIES[key].property,
        subject_ref: subject,
      }));
    }
  }
  return out;
}

/** Deterministic pretty JSON for the manifest: member names in code-point order. */
function sortedJson(value) {
  const sort = (v) => {
    if (Array.isArray(v)) return v.map(sort);
    if (isObject(v)) {
      const out = {};
      for (const key of Object.keys(v).sort(compareCodePoint)) out[key] = sort(v[key]);
      return out;
    }
    return v;
  };
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}

/**
 * `export --to cogx`: the archive's files, in path order.
 *
 * @param {object} bundle the loaded Bundle.
 * @param {{instant:string, sha256:(text:string)=>string, specVersion:string,
 *   bundleVersion?:string}} options
 * @returns {{files:Array<{path:string, text:string, sha256:string}>, findings:Array<object>}}
 */
function run(bundle, options) {
  const config = (bundle && bundle.config) || {};
  const site = config.site || {};
  const base = `${String(site.base || '').replace(/\/+$/u, '')}/`;
  const license = (config.bundle && config.bundle.license_prose) || chunks.TERMS;
  const header = provenanceLines({
    bundle: base,
    bundleVersion: options.bundleVersion,
    generatedAt: options.instant,
    license,
    specVersion: options.specVersion,
    terms: chunks.TERMS,
  });
  // The content version the header states is the one every record carries, so an
  // importer can record `prov.source_version` (AGSC-01-22) from any single record.
  const bundleVersion = header.find((line) => line.startsWith('bundle_version: ')).slice(16);
  const common = {
    bundle: base,
    bundle_version: bundleVersion,
    generated_at: String(options.instant),
    license,
    spec_version: String(options.specVersion),
    terms: chunks.TERMS,
    trust: chunks.TRUST,
  };

  const entries = ((bundle && bundle.items) || [])
    .filter((item) => item && item.frontmatter)
    .map((item) => ({
      authored: item.frontmatter,
      flat: { ...item.frontmatter, body: item.body, path: item.path, slug: item.slug, type: item.type },
    }))
    .filter((entry) => chunks.isPublished(entry.flat, config.releases))
    .sort((a, b) => compareCodePoint(String(a.flat.slug), String(b.flat.slug)));
  const published = new Map(entries.map((entry) => [String(entry.flat.slug), entry.flat]));

  const lines = Object.create(null);
  const push = (file, record) => {
    if (lines[file] === undefined) lines[file] = [];
    lines[file].push(canonicalize(record));
  };
  const counts = {};
  const count = (kind) => { counts[kind] = (counts[kind] || 0) + 1; };

  for (const entry of entries) {
    const primary = primaryRecord(entry.flat, entry.authored, common);
    push(primary.file, primary.record);
    count(primary.file === RAW_NODES_FILE ? 'raw_node' : primary.record.kind);
  }
  const produced = chunks.records(entries.map((entry) => entry.flat), {
    base, license, maxBytes: (config.chunks || {}).max_bytes, releases: config.releases,
  });
  for (const chunk of produced.records) {
    push(RECORD_FILES.document, documentRecord(chunk, common));
    count('document');
  }
  for (const entry of entries) {
    for (const fact of factRecords(entry.flat, published, common)) {
      push(RECORD_FILES.fact, fact);
      count('fact');
    }
  }

  const manifest = sortedJson({
    cogx_version: COGX_VERSION,
    counts,
    exported_at: timestampOf(options.instant) || String(options.instant),
    notes: header,
    source_system: SOURCE_SYSTEM,
  });
  const texts = [[MANIFEST_FILE, manifest]];
  for (const file of Object.keys(lines)) texts.push([file, `${lines[file].join('\n')}\n`]);
  texts.sort((a, b) => compareCodePoint(a[0], b[0]));
  return {
    files: texts.map(([path, text]) => ({ path, sha256: options.sha256(text), text })),
    findings: [...(produced.findings || [])],
  };
}

// -------------------------------------------------------------------------- import

/** The MAJOR of a COGX version string, or `null` when it is not `<int>.<…>`. */
function cogxMajor(version) {
  const m = /^(\d+)(\.|$)/u.exec(String(version == null ? '' : version));
  return m === null ? null : Number(m[1]);
}

/**
 * The refusals that must happen before anything is planned: a `permissions.json`,
 * a manifest that is not JSON, a COGX version this reader cannot read.
 *
 * @returns {object|null} the finding, or `null` when the archive may be read.
 */
function archiveRefusal(files, options) {
  if (Object.prototype.hasOwnProperty.call(files, PERMISSIONS_FILE)) {
    return finding('AGSC-E403',
      `the archive carries ${PERMISSIONS_FILE}, which COGX's reference writer describes as`
      + ' "user emails, password HASHES, and account flags … handled as a secret, not just'
      + ' data". Nothing was read and nothing was written: remove the file from the archive'
      + ' (it holds no knowledge) and import again (AGSC-08-15)',
      { file: PERMISSIONS_FILE, severity: 'error' });
  }
  const text = files[MANIFEST_FILE];
  if (text === undefined) return null; // the reference reads an archive with no manifest
  let manifest;
  try {
    manifest = JSON.parse(String(text));
  } catch (e) {
    manifest = undefined;
  }
  if (!isObject(manifest)) {
    return finding('AGSC-E201', `${MANIFEST_FILE} is not a JSON object; nothing was written`,
      { file: MANIFEST_FILE, severity: 'error' });
  }
  const version = manifest.cogx_version === undefined ? COGX_VERSION : manifest.cogx_version;
  const major = cogxMajor(version);
  if (major === null) {
    return finding('AGSC-E004',
      `${MANIFEST_FILE} declares cogx_version ${JSON.stringify(String(version))}, which is not a`
      + ` version this reader recognises (it reads ${COGX_VERSION}); nothing was written`,
      { file: MANIFEST_FILE, severity: 'error' });
  }
  if (major > cogxMajor(COGX_VERSION) && options.allowNewer !== true) {
    return finding('AGSC-E004',
      `the archive was written by COGX ${String(version)}, a newer MAJOR than this reader`
      + ` (${COGX_VERSION}); nothing was written. Pass --allow-newer to read it anyway`
      + ' (AGSC-01-22)', { file: MANIFEST_FILE, severity: 'error' });
  }
  return null;
}

/**
 * Every line of every record file, parsed, in the reference's read order. A line that
 * is not a JSON object, is over the size cap, or names another kind than its file is
 * named and skipped — tolerance, never a silent loss (AGSC-01-22).
 *
 * @returns {{records:Array<{kind:string, value:object, file:string, line:number}>,
 *   findings:Array<object>, rejected:number}}
 */
function parseRecords(files) {
  const records = [];
  const findings = [];
  let rejected = 0;
  const kindOfFile = Object.create(null);
  for (const [kind, file] of Object.entries(RECORD_FILES)) kindOfFile[file] = kind;
  kindOfFile[RAW_NODES_FILE] = 'raw_node';
  for (const file of ARCHIVE_FILES.slice(1)) {
    if (files[file] === undefined) continue;
    String(files[file]).split('\n').forEach((raw, index) => {
      const text = raw.trim();
      if (text === '') return;
      const reject = (code, why) => {
        rejected += 1;
        findings.push(finding(code, `${file}:${index + 1}: ${why}; the line was skipped (AGSC-01-22)`,
          { file, line: index + 1, severity: 'warn' }));
      };
      if (chunks.byteLength(text) > MAX_LINE_BYTES) {
        reject('AGSC-E904', `the record is over ${MAX_LINE_BYTES} bytes`);
        return;
      }
      let value;
      try {
        value = JSON.parse(text);
      } catch (e) {
        value = undefined;
      }
      if (!isObject(value)) {
        reject('AGSC-E201', 'the line is not a JSON object');
        return;
      }
      const kind = kindOfFile[file];
      if (kind !== 'raw_node' && value.kind !== undefined && value.kind !== kind) {
        reject('AGSC-E201', `a "${String(value.kind)}" record in the ${kind} file`);
        return;
      }
      records.push({ file, kind, line: index + 1, value: plain(value) });
    });
  }
  return { findings, records, rejected };
}

/** The manifest's `notes` (the AGSC-06-15 header lines of our exports), or `null`. */
function manifestNotes(files) {
  if (files[MANIFEST_FILE] === undefined) return null;
  const notes = JSON.parse(String(files[MANIFEST_FILE])).notes; // archiveRefusal proved it an object
  return Array.isArray(notes) ? notes : null;
}

/** The `agsc` member of a record — in `metadata` for a typed record, inline for a raw node. */
function agscOf(entry) {
  const holder = entry.kind === 'raw_node' ? entry.value : entry.value.metadata;
  return isObject(holder) && isObject(holder.agsc) ? holder.agsc : null;
}

/** Is this one of OUR primary records, carrying a whole item? */
function isPrimary(agsc) {
  return agsc !== null && isObject(agsc.frontmatter) && typeof agsc.body === 'string'
    && typeof agsc.slug === 'string' && typeof agsc.type === 'string';
}

/** The members of a foreign record the mapping did not claim, as one JCS string or `null`. */
function restOf(value, claimed) {
  const rest = {};
  for (const key of Object.keys(value).sort(compareCodePoint)) {
    if (claimed.includes(key) || key === 'kind') continue;
    const v = value[key];
    if (v === null || v === undefined) continue;
    if (isObject(v) && Object.keys(v).length === 0) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    rest[key] = v;
  }
  return Object.keys(rest).length === 0 ? null : canonicalize(rest);
}

/** A single-line string of at most `max` code points, or `null`. */
function oneLine(value, max) {
  if (typeof value !== 'string') return null;
  const text = nfc(value).replace(/\s+/gu, ' ').trim();
  if (text === '') return null;
  return [...text].length > max ? [...text].slice(0, max).join('') : text;
}

/**
 * One FOREIGN typed record as an item, or `null` with the reason it was skipped.
 *
 * @returns {{item:(object|null), skip:(string|null), findings:Array<object>}}
 */
function foreignItem(entry, options) {
  const v = entry.value;
  const findings = [];
  const where = `${entry.file}:${entry.line}`;
  let type;
  let title;
  let body;
  const fm = Object.create(null);
  let claimed;
  switch (entry.kind) {
    case 'entity': {
      type = 'concept';
      claimed = ['aliases', 'created_at', 'description', 'entity_type', 'external_id',
        'external_system', 'name'];
      title = typeof v.name === 'string' ? v.name : '';
      const description = typeof v.description === 'string' ? nfc(v.description).trim() : '';
      const entityType = typeof v.entity_type === 'string' ? v.entity_type : '';
      if (CONCEPT_KINDS.includes(entityType)) {
        fm.kind = entityType;
      } else {
        // schema/item.schema.json requires `kind` on a concept and closes its values;
        // an entity names a thing, and `term` is the kind that means that. The
        // foreign value is kept, never lost.
        fm.kind = 'term';
        if (entityType !== '') fm['x-cogx-entity-type'] = entityType;
      }
      const single = oneLine(description, 200);
      if (single !== null && [...single].length >= 40 && single === description) fm.description = single;
      if (Array.isArray(v.aliases)) {
        const aliases = [...new Set(v.aliases.map((a) => oneLine(String(a), 120)).filter((a) => a !== null))];
        if (aliases.length > 0) fm.aliases = aliases;
      }
      body = description === '' ? '' : `${description}\n`;
      break;
    }
    case 'memory': {
      type = 'lesson';
      claimed = ['categories', 'content', 'created_at', 'external_id', 'external_system'];
      const content = typeof v.content === 'string' ? nfc(v.content).trim() : '';
      title = content.split('\n')[0];
      fm.severity = 'info';
      if (Array.isArray(v.categories) && v.categories.length > 0) {
        fm['x-cogx-categories'] = v.categories.map(String);
      }
      body = content === '' ? '' : `## Lesson\n\n${content}\n`;
      break;
    }
    case 'memory_block': {
      type = 'procedure';
      claimed = ['created_at', 'external_id', 'external_system', 'label', 'value'];
      const value = typeof v.value === 'string' ? nfc(v.value).trim() : '';
      title = typeof v.label === 'string' ? v.label : '';
      const when = oneLine(value, BLOCK_LIMIT);
      if (when !== null && when === value) fm.when = when;
      body = value === '' ? '' : `${value}\n`;
      break;
    }
    case 'episode':
      return {
        findings,
        item: null,
        skip: `${where}: a foreign episode was not imported: AGSC-02-14 requires an outcome`
          + ' (success, partial or failure) and a COGX episode carries nothing that yields one,'
          + ' so writing one would invent it',
      };
    case 'document':
      return {
        findings,
        item: null,
        skip: `${where}: a foreign document was not imported: it is the source text the archive's`
          + ' other records were derived from, and importing both would state the same knowledge twice',
      };
    default:
      return {
        findings,
        item: null,
        skip: `${where}: a foreign raw node was not imported: COGX stores it "when no typed mapping`
          + ' exists", so there is no item type to map it onto',
      };
  }
  if (typeof v.external_id === 'string') fm['x-cogx-external-id'] = v.external_id;
  if (typeof v.external_system === 'string') fm['x-cogx-external-system'] = v.external_system;
  // A member is claimed only when the mapping could USE it (a string, or a list);
  // one of any other shape stays in `x-cogx-rest`, so nothing is silently lost.
  const rest = restOf(v, claimed.filter((key) => typeof v[key] === 'string' || Array.isArray(v[key])));
  if (rest !== null) fm['x-cogx-rest'] = rest;
  const created = timestampOf(v.created_at);
  return {
    findings,
    item: {
      body,
      created: created === null ? null : created.slice(0, 10),
      fm,
      stem: oneLine(title, 120) || '',
      type,
    },
    skip: null,
  };
}

/** The Link key a foreign fact's predicate names: an AGSC-03-01 property IRI or key. */
function linkKeyOf(predicate) {
  const text = String(predicate == null ? '' : predicate);
  for (const [key, rule] of Object.entries(LINK_PROPERTIES)) {
    if (text === key || text === rule.property) return key;
  }
  return null;
}

/** The lint-normalized bytes of one item (AGSC-04-19), exactly as `okf.plan` writes them. */
function itemText(frontmatter, body, itemSchema) {
  const type = String(frontmatter.type);
  const ordered = fix.orderKeys(frontmatter, fix.declaredOrder(itemSchema, type), itemSchema, type, null);
  return fix.normaliseText(`${serialize(fix.quoteTemporal(ordered))}${nfc(body)}`);
}

/**
 * The import plan: what would be written, in code-point path order.
 *
 * @param {object} files archive file name → text, for every file the archive carries
 *   (`permissions.json` is only ever PRESENT — the caller never reads its bytes).
 * @param {object} options
 * @param {string} options.operator `bundle.operator` of the TARGET Bundle (AGSC-08-01).
 * @param {object} options.itemSchema the raw `schema/item.schema.json`.
 * @param {string} options.toolSpecVersion this engine's `spec_version`.
 * @param {boolean} [options.allowNewer] the adapter's `--allow-newer` (AGSC-01-22).
 * @returns {{findings:Array<object>, refused:boolean, totals:object,
 *   writes:Array<{path:string, text:string}>}}
 */
function plan(files, options) {
  const opts = options || {};
  const archive = plain(files);
  const totals = {
    derived_skipped: 0, draft_untrusted: 0, facts_linked: 0, facts_skipped: 0, foreign_skipped: 0, items: 0,
    lines_rejected: 0, records_untrusted: 0,
  };
  const refusal = archiveRefusal(archive, opts);
  if (refusal !== null) return { findings: [refusal], refused: true, totals, writes: [] };

  const parsed = parseRecords(archive);
  const findings = [...parsed.findings];
  totals.lines_rejected = parsed.rejected;
  // An `agsc` member is trusted only from this node or a declared peer, with
  // consistent versions (CONN2-03); an untrusted one is ignored and its record is
  // read as the foreign record it is.
  const origins = ownRecord.trustedOrigins(opts);
  const header = ownRecord.headerOf(manifestNotes(archive));
  const trust = new Map();
  for (const entry of parsed.records) {
    const agsc = agscOf(entry);
    if (agsc === null) continue;
    const why = ownRecord.distrust(agsc, origins, header);
    trust.set(entry, why === null);
    if (why !== null) {
      totals.records_untrusted += 1;
      findings.push(finding('AGSC-E506', `${entry.file}:${entry.line}: the record's agsc member is not trusted:`
        + ` ${why}. Its provenance and status were ignored and the record is read as foreign (CONN2-03)`,
      { file: entry.file, line: entry.line, severity: 'warn' }));
    }
  }
  const trustedAgsc = (entry) => (trust.get(entry) === true ? agscOf(entry) : null);
  const own = parsed.records.filter((entry) => isPrimary(trustedAgsc(entry)));
  if (own.length > 0) {
    // AGSC-01-22's LIMIT applies to our own archives, which declare the version.
    const declared = agscOf(own[0]).spec_version;
    const tooNew = okf.versionRefusal(declared == null ? null : String(declared), {
      allowNewer: opts.allowNewer === true, toolSpecVersion: opts.toolSpecVersion,
    });
    if (tooNew !== null) return { findings: [{ ...tooNew, file: MANIFEST_FILE }], refused: true, totals, writes: [] };
  }

  const taken = new Set();
  const items = [];
  const byRef = new Map();
  const remember = (ref, slug) => {
    if (ref != null && String(ref) !== '' && !byRef.has(String(ref))) byRef.set(String(ref), slug);
  };
  const facts = [];

  for (const entry of parsed.records) {
    const agsc = trustedAgsc(entry);
    if (isPrimary(agsc)) {
      const type = String(agsc.type);
      if (okf.TYPE_PLURAL[type] === undefined || !slugs.isValid(String(agsc.slug))) {
        totals.lines_rejected += 1;
        findings.push(finding('AGSC-E201',
          `${entry.file}:${entry.line}: the record names type ${JSON.stringify(type)} and slug`
          + ` ${JSON.stringify(String(agsc.slug))}, which are not an item of this format; skipped`,
          { file: entry.file, line: entry.line, severity: 'warn' }));
        continue;
      }
      const slug = slugs.dedupe(String(agsc.slug), taken);
      taken.add(slug);
      const fm = plain(agsc.frontmatter);
      fm.type = type;
      // AGSC-01-22's RECORD: the exact state the item was taken from.
      const prov = plain(fm.prov);
      delete prov.source_version;
      delete prov.source_hash;
      if (typeof agsc.bundle_version === 'string' && /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/u.test(agsc.bundle_version)) {
        prov.source_version = agsc.bundle_version;
      }
      if (typeof agsc.bundle_hash === 'string' && /^[0-9a-f]{64}$/u.test(agsc.bundle_hash)) {
        prov.source_hash = agsc.bundle_hash;
      }
      fm.prov = { ...prov };
      items.push({ body: agsc.body, fm, slug, type });
      remember(agsc.iri, slug);
      remember(entry.kind === 'raw_node' ? entry.value.id : entry.value.external_id, slug);
      continue;
    }
    if (agsc !== null) {
      // A derived record of our own (a document or a fact): the item already holds it.
      totals.derived_skipped += 1;
      continue;
    }
    if (entry.kind === 'fact') {
      facts.push(entry);
      continue;
    }
    const mapped = foreignItem(entry, opts);
    if (mapped.item === null) {
      totals.foreign_skipped += 1;
      findings.push(finding('AGSC-E506', mapped.skip, { file: entry.file, line: entry.line, severity: 'warn' }));
      continue;
    }
    // AGSC-02-91's slugifier is total, so a foreign record is never dropped for its name.
    const slug = slugs.dedupe(slugs.slugify(mapped.item.stem === ''
      ? String(entry.value.external_id == null ? '' : entry.value.external_id) : mapped.item.stem), taken);
    taken.add(slug);
    const derived = titleFor('', mapped.item.stem, slug);
    findings.push(...derived.findings.map((one) => ({ ...one, file: entry.file, line: entry.line })));
    const fm = Object.create(null);
    fm.type = mapped.item.type;
    fm.title = derived.title;
    if (mapped.item.created !== null) fm.date = mapped.item.created;
    fm.prov = { operator: String(opts.operator === undefined ? 'human:unknown' : opts.operator), origin: 'imported' };
    for (const [key, value] of Object.entries(mapped.item.fm)) fm[key] = value;
    if (trust.get(entry) === false) {
      // AGSC-06-30 keeps a draft out of every published surface; a COGX record states
      // no licence, so nothing that arrived under a forged member may publish itself.
      fm.status = 'draft';
      totals.draft_untrusted += 1;
      findings.push(finding('AGSC-E506', `${entry.file}:${entry.line}: imported as status: draft: it carried an`
        + ' untrusted agsc member and a COGX record states no licence this adapter recognises as open, so it is'
        + ' never published (AGSC-06-30) until a person has the right to publish it and changes the status',
      { file: entry.file, line: entry.line, severity: 'warn' }));
    }
    const clean = neutraliseSingleLine(fm);
    items.push({ body: mapped.item.body, fm: plain(clean.frontmatter), foreign: true, slug, type: mapped.item.type });
    remember(entry.value.external_id, slug);
    remember(entry.value.name, slug);
    remember(entry.value.label, slug);
  }

  // Foreign facts → typed Links on the subject item, when both ends resolve here.
  const bySlug = new Map(items.map((item) => [item.slug, item]));
  for (const entry of facts) {
    const v = entry.value;
    const key = linkKeyOf(v.predicate);
    const subject = byRef.get(String(v.subject_ref));
    const object = byRef.get(String(v.object_ref));
    if (key === null || subject === undefined || object === undefined || subject === object) {
      totals.facts_skipped += 1;
      findings.push(finding('AGSC-E506',
        `${entry.file}:${entry.line}: a foreign fact was not imported as a Link: `
        + (key === null ? `its predicate ${JSON.stringify(String(v.predicate))} is none of AGSC-03-01's fourteen`
          : 'its subject and object do not both name a distinct item of this import'),
        { file: entry.file, line: entry.line, severity: 'warn' }));
      continue;
    }
    const item = bySlug.get(subject);
    const current = Array.isArray(item.fm[key]) ? item.fm[key] : [];
    if (!current.includes(object)) item.fm[key] = [...current, object];
    totals.facts_linked += 1;
  }

  const writes = items.map((item) => ({
    path: `content/${okf.TYPE_PLURAL[item.type]}/${item.slug}.md`,
    text: itemText(item.fm, item.body, opts.itemSchema),
  }));
  totals.items = writes.length;
  const foreign = items.filter((item) => item.foreign).length;
  if (foreign > 0) {
    findings.push(finding('AGSC-E506',
      `${foreign} foreign record(s) were imported with { origin: imported, operator:`
      + ` ${String(opts.operator)} } synthesized, because AGSC-08-01 requires prov (AGSC-01-22)`,
      { file: '', severity: 'warn' }));
  }
  writes.sort((a, b) => compareCodePoint(a.path, b.path));
  return { findings, refused: false, totals, writes };
}

module.exports = {
  ARCHIVE_FILES, BLOCK_LIMIT, CLAIMED_KEYS, COGX_VERSION, FORMAT, MANIFEST_FILE, MAX_LINE_BYTES,
  PERMISSIONS_FILE, RAW_NODES_FILE, RECORD_FILES, SOURCE_SYSTEM,
  archiveRefusal, cogxMajor, foreignItem, lessonText, linkKeyOf, parseRecords, plan, run,
  timestampOf, withoutNone,
};
