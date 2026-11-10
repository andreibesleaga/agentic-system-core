'use strict';
/**
 * CONTEXT Interchange — memory adapter `zep` (AGSC-01-26a): Zep's graph episodes and
 * nodes, both ways.
 *
 * A memory adapter never reaches the network (AGSC-00-24), so this adapter reads and
 * writes FILES in the shapes of Zep's official TypeScript client, `@getzep/zep-cloud`
 * (read at 4.1.0, `api/resources/graph/resources/episode/client/requests/
 * AddEpisodeRequest.d.ts`, `api/types/Episode.d.ts` and `api/types/Node.d.ts`, on
 * 9 November 2026), and the person moves them with that client:
 * `client.graph.episode.add(graphUuid, episode)` for each episode of the export, and
 * the JSON of an episode or node list for an import. `docs/CONNECTORS.md` has the few
 * lines.
 *
 * EXPORT `export --to zep` → `episodes.json`: `{agsc_provenance, episodes}`, where
 * `agsc_provenance` is the AGSC-06-15 header (AGSC-01-29) and each episode is an
 * `AddEpisodeRequest`:
 *   `data`               the title, a blank line, the body;
 *   `type`               `text`;
 *   `sourceDescription`  the item's IRI, so Zep's facts name where they came from;
 *   `referenceTime`      the item's `modified`, else its `date`, at midnight UTC, when
 *                        it has one;
 *   `metadata`           `{agsc: <the item's own record, as one base64 string>}`, so
 *                        the item comes back exactly. The client allows at most 10
 *                        metadata keys whose values are "strings, numbers, booleans, or
 *                        arrays of scalars" (`AddEpisodeRequest.metadata`), so the record
 *                        travels encoded, as the `agsc-item` line of a Markdown export
 *                        does, never as a nested object.
 * One episode per published item, in slug order (AGSC-06-30). Zep derives its nodes
 * and edges from the episodes itself.
 *
 * IMPORT `import --from zep <dir>` reads every `*.json` file of the folder: our own
 * export, or a list of the client's `Episode` or `Node` objects (a bare array, or one
 * under `items`, `episodes` or `nodes`, the pages `episode.list` and `node.list`
 * return). An episode whose `metadata.agsc` decodes to an own record this node trusts
 * is OUR OWN and comes back item for item. Any other record is FOREIGN, status
 * `draft` (AGSC-01-22):
 *   an episode → a `lesson`: its `content` (or `data`) the `## Lesson` section,
 *                severity `info`, its first line the title, `createdAt` the date;
 *                claims `uuid`, `content`, `data`, `createdAt`;
 *   a node     → a `concept` of kind `term` (a node names a thing, the mapping COGX
 *                gives an entity): `name` the title, `summary` the body; claims
 *                `uuid`, `name`, `summary`, `labels`, `createdAt`.
 * Every other member is kept verbatim as one JCS string in `x-zep-rest`. A record that
 * is neither is reported and skipped.
 *
 * PURE: no fs, no clock, no network. Requirements: AGSC-00-22, AGSC-01-22,
 * AGSC-01-23, AGSC-01-26a, AGSC-01-29, AGSC-06-30; PRD-026, PRD-070.
 */

const memory = require('../memory-records.js');
const ownRecord = require('../own-record.js');
const { nfc } = require('../../knowledge/unicode.js');

/** The name this adapter answers to on `export --to` and `import --from`. */
const FORMAT = 'zep';

/** The one file the export writes. */
const FILE = 'episodes.json';

/** The keys this adapter claims (AGSC-01-26a), for the implementer documentation. */
const CLAIMED_KEYS = Object.freeze({
  export: 'every authored frontmatter key and the body of every published item (in metadata.agsc, base64)',
  import: Object.freeze({
    episode: Object.freeze(['uuid', 'content', 'data', 'createdAt']),
    node: Object.freeze(['uuid', 'name', 'summary', 'labels', 'createdAt']),
  }),
});

/**
 * `export --to zep`.
 *
 * @param {object} bundle the loaded Bundle.
 * @param {{instant:string, sha256:(t:string)=>string, specVersion:string, bundleVersion?:string}} options
 * @returns {{files:Array<{path:string, text:string, sha256:string}>, findings:Array<object>}}
 */
function run(bundle, options) {
  const { entries, header } = memory.exportRecords(bundle, options);
  const episodes = entries.map(({ item, record }) => {
    const day = memory.dateOf(item.modified) || memory.dateOf(item.date);
    return {
      data: memory.memoryText(item),
      metadata: { agsc: ownRecord.encodeRecord(record) },
      ...(day === null ? {} : { referenceTime: `${day}T00:00:00Z` }),
      sourceDescription: record.iri || String(item.slug),
      type: 'text',
    };
  });
  return { files: memory.filesOf(new Map([[FILE, memory.jsonText({ agsc_provenance: header, episodes })]]), options.sha256), findings: [] };
}

/** Is this a file the import reads? */
function isSourceFile(path) {
  return String(path).endsWith('.json');
}

/** The own record of one episode: `metadata.agsc`, decoded. */
function agscOf(record) {
  return memory.encodedAgscIn(record.metadata);
}

/** The `x-zep-*` keys of a foreign record: its id and what the mapping does not use. */
function zepKeys(record, claimed) {
  const fm = {};
  if (typeof record.uuid === 'string') fm['x-zep-uuid'] = record.uuid;
  const rest = memory.restOf(record, claimed.filter((key) => typeof record[key] === 'string' || Array.isArray(record[key])));
  if (rest !== null) fm['x-zep-rest'] = rest;
  return fm;
}

/** One foreign Zep node, as a concept of kind `term`. */
function nodeOf(record, where) {
  const name = nfc(record.name).trim();
  if (name === '') return { skip: `${where}: not imported: the node has no name` };
  const summary = typeof record.summary === 'string' ? nfc(record.summary).trim() : '';
  const fm = { kind: 'term', ...zepKeys(record, ['createdAt', 'labels', 'name', 'summary', 'uuid']) };
  if (Array.isArray(record.labels) && record.labels.length > 0) fm['x-zep-labels'] = record.labels.map(String);
  return { body: summary === '' ? '' : `${summary}\n`, date: memory.dateOf(record.createdAt), fm, stem: name, type: 'concept' };
}

/** One foreign Zep record, mapped: an episode, a node, or neither. */
function foreign(record, where) {
  const text = memory.firstString(record, ['content', 'data']);
  if (text !== null) {
    return memory.lessonOf(text, zepKeys(record, ['content', 'createdAt', 'data', 'uuid']), memory.firstString(record, ['createdAt']), where);
  }
  if (typeof record.name === 'string') return nodeOf(record, where);
  return { skip: `${where}: not imported: the record is neither an episode (content) nor a node (name)` };
}

/**
 * The import plan of `import --from zep`.
 *
 * @param {object} files folder-relative path → text, for every file `isSourceFile` names.
 * @param {object} options as `memory-records.js#plan`.
 * @returns {{findings:Array<object>, refused:boolean, totals:object, writes:Array<object>}}
 */
function plan(files, options) {
  const read = memory.jsonCandidates(files, { agscOf, foreign, isSourceFile, members: ['episodes', 'items', 'nodes'],
    what: 'Zep episodes or nodes' });
  const planned = memory.plan(read.candidates, options);
  return { ...planned, findings: [...read.findings, ...planned.findings] };
}

module.exports = { CLAIMED_KEYS, FILE, FORMAT, isSourceFile, plan, run };
