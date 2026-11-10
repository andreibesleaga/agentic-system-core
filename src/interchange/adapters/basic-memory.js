'use strict';
/**
 * CONTEXT Interchange — memory adapter `basic-memory` (AGSC-01-26a names "the Basic
 * Memory … both-ways adapters"): a Basic Memory project folder, both ways.
 *
 * Basic Memory keeps its knowledge as plain Markdown files, so both directions are file
 * to file, deterministic and offline (AGSC-00-24). THE FORMAT, as its documentation
 * states it (docs.basicmemory.com, "Knowledge Format" and "Observations and
 * relations", read on 9 November 2026):
 *   * frontmatter `title`, `type` ("You can use any type you want"), `tags`,
 *     `permalink` ("A stable identifier for this note"), `created` and `modified`;
 *     "You can add any fields you want";
 *   * observations, `- [category] content #tag (context)`, and relations,
 *     `- relation_type [[Target]]`; "Wikilinks resolve exact permalinks, titles, and
 *     paths first".
 *
 * EXPORT `export --to basic-memory` → one note per published item (AGSC-06-30), at
 * `<type-plural>/<slug>.md`: frontmatter `title`, `type` (the item's type), `tags`,
 * `permalink` (the slug), `created` (its `date`) and `modified`; then `# <title>`, the
 * AGSC-06-15 provenance header (AGSC-01-29), the `<!-- agsc-item <base64 of the JCS
 * record> -->` line that carries the item whole, the body, and a `## Relations`
 * section with one `- <link key> [[<target slug>]]` per authored Link to a published
 * item — so Basic Memory's graph has the node's typed Links.
 *
 * IMPORT `import --from basic-memory <dir>` reads every `*.md` note of the folder. A
 * note whose `agsc-item` line this node trusts is OUR OWN and comes back item for
 * item. Any other note is FOREIGN: a `concept` of kind `explainer` (AGSC-02-90),
 * status `draft` (AGSC-01-22), titled by `title` (else its first heading, else its
 * file name), its body kept as written, observations included; `created` gives the
 * date; `type`, `tags`, `permalink` and `modified` are kept in `x-basic-memory-*`
 * keys and every other frontmatter key, as one JCS string, in `x-basic-memory-rest`. A
 * relation whose type is one of AGSC-03-01's fourteen Link keys (`_` read as `-`) and
 * whose target is another note of the same import becomes that typed Link; every other
 * relation stays in the body, as written. A note whose frontmatter is not the failsafe
 * YAML subset of AGSC-02-02 is reported and skipped.
 *
 * PURE: no fs, no clock, no network. Requirements: AGSC-00-22, AGSC-01-22,
 * AGSC-01-23, AGSC-01-26a, AGSC-01-29, AGSC-06-30; PRD-026, PRD-070.
 */

const memory = require('../memory-records.js');
const okf = require('../okf.js');
const ownRecord = require('../own-record.js');
const { canonicalize } = require('../../knowledge/jcs.js');
const { compareCodePoint, nfc, singleLine } = require('../../knowledge/unicode.js');
const { firstHeading } = require('../../knowledge/frontmatter.js');
const { oneLine } = require('../records.js');

/** The name this adapter answers to on `export --to` and `import --from`. */
const FORMAT = 'basic-memory';

/** The frontmatter keys of a note the mapping uses. */
const CLAIMED = Object.freeze(['title', 'type', 'tags', 'permalink', 'created', 'modified']);

/** The keys this adapter claims (AGSC-01-26a), for the implementer documentation. */
const CLAIMED_KEYS = Object.freeze({
  export: 'every authored frontmatter key and the body of every published item (in the agsc-item line)',
  import: Object.freeze([...CLAIMED, 'body', 'relations']),
});

/** A relation line: `- <type> [[<target>]]`, the type one token or a quoted phrase. */
const RELATION = /^- (?:"([^"\n]+)"|([A-Za-z0-9_-]+)) \[\[([^\]\n]+)\]\]/gmu;

/**
 * `export --to basic-memory`.
 *
 * @param {object} bundle the loaded Bundle.
 * @param {{instant:string, sha256:(t:string)=>string, specVersion:string, bundleVersion?:string}} options
 * @returns {{files:Array<{path:string, text:string, sha256:string}>, findings:Array<object>}}
 */
function run(bundle, options) {
  const { entries, header } = memory.exportRecords(bundle, options);
  const published = new Set(entries.map(({ item }) => String(item.slug)));
  const files = new Map();
  for (const { item, record } of entries) {
    const title = singleLine(String(item.title == null ? item.slug : item.title));
    const relations = memory.authoredLinks(item, published).map(([key, target]) => `- ${key} [[${target.split('#')[0]}]]`);
    const body = String(item.body == null ? '' : item.body).replace(/^\n+/u, '').trimEnd();
    const text = [
      ...memory.yamlLines([['title', title], ['type', String(item.type)],
        ['tags', Array.isArray(item.tags) && item.tags.length > 0 ? item.tags.map(String) : null],
        ['permalink', String(item.slug)], ['created', item.date == null ? null : String(item.date)],
        ['modified', item.modified == null ? null : String(item.modified)]]),
      '', `# ${title}`, '', ...header, `<!-- agsc-item ${ownRecord.encodeRecord(record)} -->`, '',
      ...(body === '' ? [] : [body, '']),
      ...(relations.length === 0 ? [] : ['## Relations', '', ...relations, '']),
    ].join('\n');
    files.set(`${okf.TYPE_PLURAL[item.type]}/${item.slug}.md`, text);
  }
  return { files: memory.filesOf(files, options.sha256), findings: [] };
}

/** Is this a file the import reads? */
function isSourceFile(path) {
  return String(path).endsWith('.md');
}

/** The relations of a note body, as `{key, ref}`. */
function relationsOf(body) {
  const out = [];
  RELATION.lastIndex = 0;
  for (let m = RELATION.exec(body); m !== null; m = RELATION.exec(body)) {
    out.push({ key: (m[1] || m[2]).trim(), ref: m[3].split('|')[0].trim() });
  }
  return out;
}

/** One foreign note, mapped. */
function foreign(path, note) {
  if (note.frontmatter === false) {
    return { skip: `${path}: not imported: the note's frontmatter is not the failsafe YAML subset of AGSC-02-02,`
      + ' so its title and keys cannot be read' };
  }
  const fm0 = note.frontmatter || {};
  const stemOfPath = path.split('/').pop().replace(/\.md$/u, '');
  const title = oneLine(typeof fm0.title === 'string' ? fm0.title : (firstHeading(note.body) || stemOfPath), 400) || stemOfPath;
  const fm = { kind: 'explainer' };
  for (const key of ['type', 'permalink', 'modified']) {
    if (typeof fm0[key] === 'string') fm[`x-basic-memory-${key}`] = fm0[key];
  }
  const tags = Array.isArray(fm0.tags) ? fm0.tags.map(String)
    : (typeof fm0.tags === 'string' ? fm0.tags.split(',').map((t) => t.trim()).filter((t) => t !== '') : []);
  if (tags.length > 0) fm['x-basic-memory-tags'] = tags;
  const rest = Object.create(null);
  for (const key of Object.keys(fm0).sort(compareCodePoint)) if (!CLAIMED.includes(key)) rest[key] = fm0[key];
  if (Object.keys(rest).length > 0) fm['x-basic-memory-rest'] = canonicalize(rest);
  const body = nfc(note.body).replace(/^\n+/u, '');
  const refs = [title, stemOfPath, path.replace(/\.md$/u, ''), ...(typeof fm0.permalink === 'string' ? [fm0.permalink] : [])];
  return { body, date: memory.dateOf(fm0.created), fm, links: relationsOf(body), refs, stem: title, type: 'concept' };
}

/**
 * The import plan of `import --from basic-memory`.
 *
 * @param {object} files folder-relative path → text, for every file `isSourceFile` names.
 * @param {object} options as `memory-records.js#plan`.
 * @returns {{findings:Array<object>, refused:boolean, totals:object, writes:Array<object>}}
 */
function plan(files, options) {
  const candidates = Object.keys(files).filter(isSourceFile).sort(compareCodePoint).map((path) => {
    const note = memory.markdownNote(files[path]);
    const mapped = foreign(path, note);
    return { file: path, line: 1, ...(note.agsc === null ? {} : { agsc: note.agsc, header: note.header }),
      ...(typeof mapped.skip === 'string' ? { skip: mapped.skip } : { foreign: mapped }) };
  });
  return memory.plan(candidates, options);
}

module.exports = { CLAIMED_KEYS, FORMAT, isSourceFile, plan, relationsOf, run };
