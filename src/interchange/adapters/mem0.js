'use strict';
/**
 * CONTEXT Interchange — memory adapter `mem0` (AGSC-01-26a): Mem0's memories, both ways.
 *
 * A memory adapter never reaches the network (AGSC-00-24), so this adapter reads and
 * writes FILES in the shapes of Mem0's official JavaScript client, `mem0ai` (read at
 * 3.3.1, `dist/index.d.ts`, on 9 November 2026), and the person moves them with that
 * client: `client.add(m.messages, { ...m.options, userId })` for each record of the
 * export, and `JSON.stringify(await client.getAll(...))` for an import.
 * `docs/CONNECTORS.md` has the few lines.
 *
 * EXPORT `export --to mem0` → `memories.json`: `{agsc_provenance, memories}`, where
 * `agsc_provenance` is the AGSC-06-15 header (AGSC-01-29) and each memory is the two
 * arguments of the client's `add(messages, options)`:
 *   `messages`  `[{role: "user", content: <title, a blank line, the body>}]`
 *   `options`   `{infer: false, metadata: {agsc: <the item's own record>}}` —
 *               `infer: false` stores the text as written instead of letting a model
 *               rewrite it, and `metadata.agsc` carries the authored frontmatter, the
 *               body, the item IRI, the licence and the Content Use Terms, so the item
 *               comes back exactly.
 * One memory per published item, in slug order (AGSC-06-30).
 *
 * IMPORT `import --from mem0 <dir>` reads every `*.json` file of the folder: our own
 * export, a `getAll()` page (`{count, next, previous, results}`), or a bare array of
 * the client's `Memory` objects (`camelCase`, as the client returns them, or the REST
 * API's `snake_case`). A memory whose `metadata.agsc` this node trusts is OUR OWN and
 * comes back item for item. Any other memory is FOREIGN: a `lesson` (the mapping COGX
 * gives a Mem0 memory), its text the `## Lesson` section, severity `info`, its first
 * line the title, `created_at` the date, status `draft` (AGSC-01-22). It claims `id`,
 * `memory` (or `data.memory`), `categories` and the creation instant; every other
 * member — the user, agent, app and run ids, the hash, the metadata — is kept
 * verbatim as one JCS string in `x-mem0-rest`.
 *
 * PURE: no fs, no clock, no network. Requirements: AGSC-00-22, AGSC-01-22,
 * AGSC-01-23, AGSC-01-26a, AGSC-01-29, AGSC-06-30; PRD-026, PRD-070.
 */

const memory = require('../memory-records.js');
const { isObject } = require('../records.js');

/** The name this adapter answers to on `export --to` and `import --from`. */
const FORMAT = 'mem0';

/** The one file the export writes. */
const FILE = 'memories.json';

/** The keys this adapter claims (AGSC-01-26a), for the implementer documentation. */
const CLAIMED_KEYS = Object.freeze({
  export: 'every authored frontmatter key and the body of every published item (in options.metadata.agsc)',
  import: Object.freeze(['id', 'memory', 'data.memory', 'categories', 'createdAt', 'created_at']),
});

/** The members of a foreign memory the mapping uses. */
const CLAIMED = Object.freeze(['categories', 'createdAt', 'created_at', 'id', 'memory']);

/**
 * `export --to mem0`.
 *
 * @param {object} bundle the loaded Bundle.
 * @param {{instant:string, sha256:(t:string)=>string, specVersion:string, bundleVersion?:string}} options
 * @returns {{files:Array<{path:string, text:string, sha256:string}>, findings:Array<object>}}
 */
function run(bundle, options) {
  const { entries, header } = memory.exportRecords(bundle, options);
  const memories = entries.map(({ item, record }) => ({
    messages: [{ content: memory.memoryText(item), role: 'user' }],
    options: { infer: false, metadata: { agsc: record } },
  }));
  return { files: memory.filesOf(new Map([[FILE, memory.jsonText({ agsc_provenance: header, memories })]]), options.sha256), findings: [] };
}

/** Is this a file the import reads? */
function isSourceFile(path) {
  return String(path).endsWith('.json');
}

/** The own record of one memory: ours carries it in `options.metadata`, Mem0's in `metadata`. */
function agscOf(record) {
  return memory.agscIn(isObject(record.options) ? record.options.metadata : record.metadata);
}

/** One foreign Mem0 memory, mapped. */
function foreign(record, where) {
  if (isObject(record.options) && Array.isArray(record.messages)) {
    const text = record.messages.map((m) => (isObject(m) && typeof m.content === 'string' ? m.content : '')).join('\n\n');
    return memory.lessonOf(text, restKeys(record, ['messages', 'options']), null, where);
  }
  const text = typeof record.memory === 'string' ? record.memory
    : (isObject(record.data) && typeof record.data.memory === 'string' ? record.data.memory : '');
  const fm = restKeys(record, CLAIMED.filter((key) => typeof record[key] === 'string' || Array.isArray(record[key])));
  if (typeof record.id === 'string') fm['x-mem0-id'] = record.id;
  if (Array.isArray(record.categories) && record.categories.length > 0) fm['x-mem0-categories'] = record.categories.map(String);
  return memory.lessonOf(text, fm, memory.firstString(record, ['createdAt', 'created_at']), where);
}

/** `x-mem0-rest`: what the mapping does not use, kept whole. */
function restKeys(record, claimed) {
  const rest = memory.restOf(record, claimed);
  return rest === null ? {} : { 'x-mem0-rest': rest };
}

/**
 * The import plan of `import --from mem0`.
 *
 * @param {object} files folder-relative path → text, for every file `isSourceFile` names.
 * @param {object} options as `memory-records.js#plan`.
 * @returns {{findings:Array<object>, refused:boolean, totals:object, writes:Array<object>}}
 */
function plan(files, options) {
  const read = memory.jsonCandidates(files, { agscOf, foreign, isSourceFile, members: ['memories', 'results'], what: 'Mem0 memories' });
  const planned = memory.plan(read.candidates, options);
  return { ...planned, findings: [...read.findings, ...planned.findings] };
}

module.exports = { CLAIMED_KEYS, FILE, FORMAT, isSourceFile, plan, run };
