'use strict';
/**
 * CONTEXT Interchange — memory adapter `claude-code` (AGSC-01-26a): Claude Code's
 * memory files, both ways.
 *
 * Claude Code keeps its memory as plain Markdown files, so both directions are file to
 * file, deterministic and offline (AGSC-00-24). THE FORMAT, as Claude Code's
 * documentation states it ("How Claude remembers your project",
 * https://code.claude.com/docs/en/memory, read on 9 November 2026):
 *   * instructions a person writes: `CLAUDE.md` in a project and in its folders,
 *     `.claude/CLAUDE.md`, `CLAUDE.local.md`, and rule files under `.claude/rules/`
 *     (whose frontmatter `paths` is "the only field Claude Code reads from a rule");
 *   * auto memory, the notes Claude writes itself: a folder holding "a `MEMORY.md`
 *     index and one topic file per memory"; "Claude records the kind as a `type` field
 *     in the memory file's frontmatter" — `user`, `feedback`, `project` or `reference`;
 *     "The first 200 lines of `MEMORY.md`, or the first 25KB, whichever comes first,
 *     are loaded at the start of every conversation"; topic files are read on demand.
 *
 * EXPORT `export --to claude-code` → an auto-memory folder, `memory/`: one topic file
 * per published item (AGSC-06-30), `memory/<slug>.md`, with the frontmatter `name`
 * (the slug), `description` (the item's description, else its title) and `type:
 * reference` ("where to find information outside the project": the node is that
 * place), then the AGSC-06-15 provenance header (AGSC-01-29), the `<!-- agsc-item … -->`
 * line that carries the item whole, `# <title>` and the body; and `memory/MEMORY.md`,
 * the index, one line `- [<title>](<slug>.md) — <description>` per item after the
 * header. Copy the files into the project's memory folder
 * (`~/.claude/projects/<project>/memory/`). Claude Code loads only the first 200 lines
 * or 25 KB of the index, so an index longer than that is reported as the warning
 * `AGSC-E506`; every topic file is still written. `export --steer --target claude`
 * already writes a `CLAUDE.md`, so this adapter does not.
 *
 * IMPORT `import --from claude-code <dir>` reads, under the folder: every `CLAUDE.md`
 * and `CLAUDE.local.md`, every `.md` under a `.claude/rules/` folder, and every topic
 * file of a folder that holds a `MEMORY.md` (the index itself is not a record). A file
 * whose `agsc-item` line this node trusts is OUR OWN and comes back item for item. Any
 * other is FOREIGN, status `draft` (AGSC-01-22):
 *   an instructions or rule file → a `concept` of kind `principle` (it states rules),
 *     titled by its first heading, else by its path; the body as written; `paths` and
 *     any other frontmatter kept in `x-claude-rest`, the path in `x-claude-path`;
 *   a topic file of type `feedback` → a `lesson` (a correction learned), severity
 *     `info`, its body the `## Lesson` section;
 *   any other topic file → a `concept` of kind `explainer`;
 *   a topic file's `name`, `description` and `type` are kept in `x-claude-name`,
 *   `x-claude-description` and `x-claude-type` (the description is also the item's
 *   when it is one line of 40 to 200 characters), every other frontmatter key in
 *   `x-claude-rest`. An `@path` import inside a file is kept as text and never
 *   followed: a memory adapter reads only the folder it is given.
 * Any other `.md` file of the folder is not read.
 *
 * PURE: no fs, no clock, no network. Requirements: AGSC-00-22, AGSC-01-22,
 * AGSC-01-23, AGSC-01-26a, AGSC-01-29, AGSC-06-30; PRD-026, PRD-070.
 */

const memory = require('../memory-records.js');
const ownRecord = require('../own-record.js');
const { canonicalize } = require('../../knowledge/jcs.js');
const { compareCodePoint, nfc, singleLine } = require('../../knowledge/unicode.js');
const { firstHeading } = require('../../knowledge/frontmatter.js');
const { oneLine } = require('../records.js');
const { finding } = require('../../knowledge/validate.js');

/** The name this adapter answers to on `export --to` and `import --from`. */
const FORMAT = 'claude-code';

/** The auto-memory folder of the export, and its index. */
const MEMORY_DIR = 'memory';
const INDEX = 'MEMORY.md';

/** How much of `MEMORY.md` Claude Code loads at the start of a conversation. */
const INDEX_LINES = 200;
const INDEX_BYTES = 25 * 1024;

/** The instruction files Claude Code reads, by name. */
const INSTRUCTIONS = Object.freeze(['CLAUDE.md', 'CLAUDE.local.md']);

/** The keys this adapter claims (AGSC-01-26a), for the implementer documentation. */
const CLAIMED_KEYS = Object.freeze({
  export: 'every authored frontmatter key and the body of every published item (in the agsc-item line)',
  import: Object.freeze({
    instructions: Object.freeze(['body', 'path']),
    topic_file: Object.freeze(['name', 'description', 'type', 'body']),
  }),
});

/**
 * `export --to claude-code`.
 *
 * @param {object} bundle the loaded Bundle.
 * @param {{instant:string, sha256:(t:string)=>string, specVersion:string, bundleVersion?:string}} options
 * @returns {{files:Array<{path:string, text:string, sha256:string}>, findings:Array<object>}}
 */
function run(bundle, options) {
  const { entries, header } = memory.exportRecords(bundle, options);
  const files = new Map();
  const index = [];
  for (const { item, record } of entries) {
    const title = singleLine(String(item.title == null ? item.slug : item.title));
    const description = item.description == null ? title : singleLine(String(item.description));
    const body = String(item.body == null ? '' : item.body).replace(/^\n+/u, '').trimEnd();
    files.set(`${MEMORY_DIR}/${item.slug}.md`, [
      ...memory.yamlLines([['name', String(item.slug)], ['description', description], ['type', 'reference']]),
      '', ...header, `<!-- agsc-item ${ownRecord.encodeRecord(record)} -->`, '', `# ${title}`, '',
      ...(body === '' ? [] : [body, '']),
    ].join('\n'));
    index.push(`- [${title.replace(/[[\]]/gu, '')}](${item.slug}.md) — ${description}`);
  }
  const indexText = [...header, '# Memory Index', ...index, ''].join('\n');
  files.set(`${MEMORY_DIR}/${INDEX}`, indexText);
  return { files: memory.filesOf(files, options.sha256), findings: indexFindings(indexText) };
}

/**
 * The warning for an index longer than Claude Code loads: "the first 200 lines of
 * `MEMORY.md`, or the first 25KB, whichever comes first". The topic files are all
 * written; the index lines past that point are only not loaded at the start, so the
 * person is told rather than the export cut short.
 */
function indexFindings(text) {
  const lines = text.split('\n').length - 1;
  const bytes = Buffer.byteLength(text, 'utf8');
  if (lines <= INDEX_LINES && bytes <= INDEX_BYTES) return [];
  return [finding('AGSC-E506', `${MEMORY_DIR}/${INDEX} has ${lines} lines (${bytes} bytes); Claude Code loads only the`
    + ` first ${INDEX_LINES} lines or ${INDEX_BYTES / 1024} KB of it at the start of a conversation, so the items listed`
    + ' after that point are not seen until a topic file is opened; export a smaller selection or shorten the descriptions',
  { file: `${MEMORY_DIR}/${INDEX}`, severity: 'warn' })];
}

/** Is this a file the import may read? (`plan` decides which of them are records.) */
function isSourceFile(path) {
  return String(path).endsWith('.md');
}

/** What a path is to Claude Code: `instructions`, `index`, `topic`, or `null`. */
function kindOf(path, indexDirs) {
  const parts = String(path).split('/');
  const name = parts[parts.length - 1];
  const dir = parts.slice(0, -1).join('/');
  if (INSTRUCTIONS.includes(name) || `/${path}`.includes('/.claude/rules/')) return 'instructions';
  if (name === INDEX) return 'index';
  return indexDirs.has(dir) ? 'topic' : null;
}

/** The frontmatter keys not claimed, as `x-claude-rest`. */
function restOf(fm0, claimed) {
  const rest = Object.create(null);
  for (const key of Object.keys(fm0).sort(compareCodePoint)) if (!claimed.includes(key)) rest[key] = fm0[key];
  return Object.keys(rest).length === 0 ? {} : { 'x-claude-rest': canonicalize(rest) };
}

/** One foreign instructions or rule file, as a principle. */
function instructionsOf(path, note) {
  const body = nfc(note.body).replace(/^\n+/u, '');
  const stem = firstHeading(body) || path;
  return { body, fm: { kind: 'principle', 'x-claude-path': path, ...restOf(note.frontmatter || {}, []) }, stem, type: 'concept' };
}

/** One foreign topic file: a lesson for feedback, an explainer otherwise. */
function topicOf(path, note) {
  const fm0 = note.frontmatter || {};
  const type = typeof fm0.type === 'string' ? fm0.type
    : (fm0.metadata && typeof fm0.metadata.type === 'string' ? fm0.metadata.type : '');
  const fm = {};
  for (const key of ['name', 'description']) if (typeof fm0[key] === 'string') fm[`x-claude-${key}`] = fm0[key];
  if (type !== '') fm['x-claude-type'] = type;
  Object.assign(fm, restOf(fm0, ['name', 'description', 'type']));
  const body = nfc(note.body).replace(/^\n+/u, '').trimEnd();
  const named = typeof fm0.name === 'string' ? fm0.name : path.split('/').pop().replace(/\.md$/u, '');
  const said = oneLine(fm0.description, 400);
  const stem = firstHeading(body) || (said !== null && [...said].length <= 120 ? said : named);
  if (type === 'feedback') {
    const lesson = memory.lessonOf(body === '' ? stem : body, fm, null, path);
    return { ...lesson, stem };
  }
  const description = typeof fm0.description === 'string' ? fm0.description : '';
  const single = oneLine(description, 200);
  if (single !== null && single === description && [...single].length >= 40) fm.description = single;
  return { body: body === '' ? '' : `${body}\n`, fm: { kind: 'explainer', ...fm }, stem, type: 'concept' };
}

/**
 * The import plan of `import --from claude-code`.
 *
 * @param {object} files folder-relative path → text, for every file `isSourceFile` names.
 * @param {object} options as `memory-records.js#plan`.
 * @returns {{findings:Array<object>, refused:boolean, totals:object, writes:Array<object>}}
 */
function plan(files, options) {
  const paths = Object.keys(files).filter(isSourceFile).sort(compareCodePoint);
  const indexDirs = new Set(paths.filter((p) => p.split('/').pop() === INDEX).map((p) => p.split('/').slice(0, -1).join('/')));
  const candidates = [];
  for (const path of paths) {
    const kind = kindOf(path, indexDirs);
    if (kind === null || kind === 'index') continue;
    const note = memory.markdownNote(files[path]);
    const mapped = note.frontmatter === false
      ? { skip: `${path}: not imported: the frontmatter is not the failsafe YAML subset of AGSC-02-02` }
      : (kind === 'instructions' ? instructionsOf(path, note) : topicOf(path, note));
    candidates.push({ file: path, line: 1, ...(note.agsc === null ? {} : { agsc: note.agsc, header: note.header }),
      ...(typeof mapped.skip === 'string' ? { skip: mapped.skip } : { foreign: mapped }) });
  }
  return memory.plan(candidates, options);
}

module.exports = { CLAIMED_KEYS, FORMAT, isSourceFile, kindOf, plan, run };
