'use strict';
/**
 * CONTEXT Interchange — memory adapter `letta` (AGSC-01-26a): Letta's archival memory
 * passages, both ways.
 *
 * A memory adapter never reaches the network (AGSC-00-24), so this adapter reads and
 * writes FILES in the shapes of Letta's official TypeScript client,
 * `@letta-ai/letta-client` (read at 1.12.1, `resources/archives/passages.d.ts` and
 * `resources/passages.d.ts`, on 9 November 2026), and the person moves them with that
 * client: `client.archives.passages.createMany(archiveId, { passages })` for the
 * export, and the JSON of a passage list for an import. `docs/CONNECTORS.md` has the
 * few lines.
 *
 * EXPORT `export --to letta` → `passages.json`: `{agsc_provenance, passages}`, where
 * `agsc_provenance` is the AGSC-06-15 header (AGSC-01-29) and each passage is a
 * `PassageCreateParams` of the archives resource:
 *   `text`      the title, a blank line, the body;
 *   `tags`      the item's tags, when it has any;
 *   `metadata`  `{agsc: <the item's own record>}` — the authored frontmatter, the
 *               body, the item IRI, the licence and the Content Use Terms, so the item
 *               comes back exactly.
 * One passage per published item, in slug order (AGSC-06-30).
 *
 * IMPORT `import --from letta <dir>` reads every `*.json` file of the folder: our own
 * export, or a list of the client's `Passage` objects (a bare array, or one under
 * `passages`, `items` or `data`). A passage whose `metadata.agsc` this node trusts is
 * OUR OWN and comes back item for item. Any other passage is FOREIGN: a `lesson`, its
 * text the `## Lesson` section, severity `info`, its first line the title,
 * `created_at` the date, status `draft` (AGSC-01-22). It claims `id`, `text`, `tags`
 * and `created_at`; every other member — the archive, the embedding and its
 * configuration, the metadata — is kept verbatim as one JCS string in `x-letta-rest`.
 * An agent file (`.af`) is a different document — its core memory blocks, messages and
 * tools — and is not read: its tool source code is executable content (AGSC-07-15).
 *
 * PURE: no fs, no clock, no network. Requirements: AGSC-00-22, AGSC-01-22,
 * AGSC-01-23, AGSC-01-26a, AGSC-01-29, AGSC-06-30; PRD-026, PRD-070.
 */

const memory = require('../memory-records.js');

/** The name this adapter answers to on `export --to` and `import --from`. */
const FORMAT = 'letta';

/** The one file the export writes. */
const FILE = 'passages.json';

/** The keys this adapter claims (AGSC-01-26a), for the implementer documentation. */
const CLAIMED_KEYS = Object.freeze({
  export: 'every authored frontmatter key and the body of every published item (in metadata.agsc)',
  import: Object.freeze(['id', 'text', 'tags', 'created_at']),
});

/** The members of a foreign passage the mapping uses. */
const CLAIMED = Object.freeze(['created_at', 'id', 'tags', 'text']);

/**
 * `export --to letta`.
 *
 * @param {object} bundle the loaded Bundle.
 * @param {{instant:string, sha256:(t:string)=>string, specVersion:string, bundleVersion?:string}} options
 * @returns {{files:Array<{path:string, text:string, sha256:string}>, findings:Array<object>}}
 */
function run(bundle, options) {
  const { entries, header } = memory.exportRecords(bundle, options);
  const passages = entries.map(({ item, record }) => ({
    metadata: { agsc: record },
    ...(Array.isArray(item.tags) && item.tags.length > 0 ? { tags: item.tags.map(String) } : {}),
    text: memory.memoryText(item),
  }));
  return { files: memory.filesOf(new Map([[FILE, memory.jsonText({ agsc_provenance: header, passages })]]), options.sha256), findings: [] };
}

/** Is this a file the import reads? */
function isSourceFile(path) {
  return String(path).endsWith('.json');
}

/** The own record of one passage. */
function agscOf(record) {
  return memory.agscIn(record.metadata);
}

/** One foreign Letta passage, mapped. */
function foreign(record, where) {
  const fm = {};
  const rest = memory.restOf(record, CLAIMED.filter((key) => typeof record[key] === 'string' || Array.isArray(record[key])));
  if (typeof record.id === 'string') fm['x-letta-id'] = record.id;
  if (Array.isArray(record.tags) && record.tags.length > 0) fm['x-letta-tags'] = record.tags.map(String);
  if (rest !== null) fm['x-letta-rest'] = rest;
  return memory.lessonOf(typeof record.text === 'string' ? record.text : '', fm,
    memory.firstString(record, ['created_at']), where);
}

/**
 * The import plan of `import --from letta`.
 *
 * @param {object} files folder-relative path → text, for every file `isSourceFile` names.
 * @param {object} options as `memory-records.js#plan`.
 * @returns {{findings:Array<object>, refused:boolean, totals:object, writes:Array<object>}}
 */
function plan(files, options) {
  const read = memory.jsonCandidates(files, { agscOf, foreign, isSourceFile, members: ['passages', 'items', 'data'],
    what: 'Letta passages' });
  const planned = memory.plan(read.candidates, options);
  return { ...planned, findings: [...read.findings, ...planned.findings] };
}

module.exports = { CLAIMED_KEYS, FILE, FORMAT, isSourceFile, plan, run };
