'use strict';
// Conformance area `export` — AGSC-01-26 (`export --okf`: the lint-normalized Bundle
// itself, its root document and the OKF log), AGSC-01-27 (`export --jsonl`: one
// line per item, each the item's own JSON-LD node) and AGSC-09-17 (a): `--manifest`,
// the export manifest beside the files of the run.
//
// Each case is the minimal fixture with files added, copied to a scratch directory that
// is removed afterwards; `input.flags` runs as `export <flags> --json` through the CLI's
// own entry point with SOURCE_DATE_EPOCH 1767225600. The paths a case names are
// relative to the export root, which this engine writes under `dist/export/`
// (`src/application/cli/verbs/export.js`); the rules pin the paths inside that root,
// not where the root is. The handler is guarded, so a pass that left a member of
// `expected` unread is a fail.

const path = require('node:path');
const nodeFs = require('node:fs');
const os = require('node:os');

const { main } = require('../../../src/application/cli/main.js');
const { createFileSystem } = require('../../../src/adapters/node-fs.js');
const { canonicalize } = require('../../../src/knowledge/jcs.js');
const { compareCodePoint } = require('../../../src/knowledge/unicode.js');
const { captureStream } = require('./_shared.js');
const { checks, deepEqual } = require('./_assert.js');
const { guarded } = require('./_expected-reads.js');

/** Where this engine writes each form (AGSC-01-08: a generated directory). */
const EXPORT_ROOT = Object.freeze({ '--jsonl': 'dist/export', '--okf': 'dist/export/okf' });
/** The file `export --jsonl` writes inside its root. */
const JSONL_FILE = 'items.jsonl';
/** The manifest `--manifest` adds to the root of the export (AGSC-09-17 (a)). */
const MANIFEST_FILE = 'export-manifest.json';

/** Every file under `dir`, relative and with `/`, in code-point order. */
function listFiles(dir) {
  if (!nodeFs.existsSync(dir)) return [];
  const out = [];
  const walk = (at) => {
    for (const entry of nodeFs.readdirSync(at, { withFileTypes: true })) {
      const full = path.join(at, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(path.relative(dir, full).split(path.sep).join('/'));
    }
  };
  walk(dir);
  return out.sort(compareCodePoint);
}

function cli(argv, root, vector) {
  const version = (vector.options || {}).spec_version;
  return main(argv, {
    env: { SOURCE_DATE_EPOCH: '1767225600' }, ports: { fs: createFileSystem(root) }, root,
    specVersion: version, stderr: captureStream(), stdout: captureStream(), version,
  });
}

/** The fixture with the case's files added, `inspect(root)` run, the copy removed. */
function onFixture(vector, ctx, inspect) {
  const engineRoot = (ctx && ctx.root) || '.';
  const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), `agsc-${vector.id}-`));
  try {
    nodeFs.cpSync(path.join(engineRoot, 'tests', String(vector.input.bundle)), root, { recursive: true });
    for (const [file, text] of Object.entries(vector.input.add_files || {})) {
      nodeFs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      nodeFs.writeFileSync(path.join(root, file), text);
    }
    return inspect(root);
  } finally {
    nodeFs.rmSync(root, { force: true, recursive: true });
  }
}

/** export-0001: AGSC-01-26, the OKF folder. */
function okfCase(vector, ctx) {
  const expected = vector.expected;
  return onFixture(vector, ctx, (root) => {
    const exit = cli(['export', ...vector.input.flags, '--json'], root, vector);
    const out = path.join(root, EXPORT_ROOT['--okf']);
    const read = (file) => (nodeFs.existsSync(path.join(out, file))
      ? nodeFs.readFileSync(path.join(out, file), 'utf8') : null);
    const list = [[`exit ${expected.exit}`, exit === expected.exit, `exit ${exit}`]];
    const files = listFiles(out);
    list.push(['files', deepEqual(files, expected.files), JSON.stringify(files)]);
    for (const [file, bytes] of Object.entries(expected.file_bytes)) {
      list.push([`${file} bytes`, read(file) === bytes, JSON.stringify(read(file))]);
    }
    for (const [file, texts] of Object.entries(expected.files_contain)) {
      const text = read(file);
      for (const want of texts) list.push([`${file} contains ${want}`, text !== null && text.includes(want), JSON.stringify(text)]);
    }
    for (const file of expected.byte_preserving) {
      const source = nodeFs.readFileSync(path.join(root, file), 'utf8');
      list.push([`${file} is the Bundle's own bytes`, read(file) === source, JSON.stringify(read(file))]);
    }
    return checks(list);
  });
}

/** export-0002: AGSC-01-27, each line the per-item node of the same build. */
function jsonlCase(vector, ctx) {
  const expected = vector.expected;
  return onFixture(vector, ctx, (root) => {
    const exit = cli(['export', ...vector.input.flags, '--json'], root, vector);
    const at = path.join(root, EXPORT_ROOT['--jsonl'], JSONL_FILE);
    const got = nodeFs.existsSync(at) ? nodeFs.readFileSync(at, 'utf8') : null;
    const built = cli(['build', '--json', '--quiet'], root, vector);
    const out = JSON.parse(nodeFs.readFileSync(path.join(root, 'agsc.config.json'), 'utf8')).build.out;
    const lines = expected.lines_from_pages.map((slug) => {
      const page = path.join(root, out, 'pages', `${slug}.jsonld`);
      return nodeFs.existsSync(page) ? nodeFs.readFileSync(page, 'utf8').replace(/\n$/u, '') : `<no pages/${slug}.jsonld>`;
    });
    const want = `${lines.join('\n')}\n`;
    const list = [
      [`exit ${expected.exit}`, exit === expected.exit, `exit ${exit}`],
      ['the build that gives the pages', built === 0, `build exit ${built}`],
      ['each line is the item node of pages/<slug>.jsonld, in this order', got === want, JSON.stringify(got)],
      ['each line is JCS-canonical', got !== null
        && got.split('\n').slice(0, -1).every((line) => canonicalize(JSON.parse(line)) === line), JSON.stringify(got)],
    ];
    return checks(list);
  });
}

/** The manifest of an export root, parsed, with the text it was read from; `null` text when absent. */
function manifestOf(root, form) {
  const at = path.join(root, EXPORT_ROOT[form], MANIFEST_FILE);
  const text = nodeFs.existsSync(at) ? nodeFs.readFileSync(at, 'utf8') : null;
  return { manifest: text === null ? null : JSON.parse(text), text };
}

/** export-0003: AGSC-09-17 (a), the manifest of an OKF export. */
function manifestOkfCase(vector, ctx) {
  const expected = vector.expected;
  return onFixture(vector, ctx, (root) => {
    const exit = cli(['export', ...vector.input.flags, '--json'], root, vector);
    const files = listFiles(path.join(root, EXPORT_ROOT['--okf']));
    const { manifest, text } = manifestOf(root, '--okf');
    // `spec_version` is the tool's own and is not pinned by the case.
    const { spec_version: specVersion, ...pinned } = manifest || {};
    return checks([
      [`exit ${expected.exit}`, exit === expected.exit, `exit ${exit}`],
      ['files', deepEqual(files, expected.files), JSON.stringify(files)],
      ['the manifest is there', manifest !== null, 'no export-manifest.json'],
      ['the manifest members', deepEqual(Object.keys(manifest || {}).sort(), expected.manifest_members), text],
      ['the manifest values', deepEqual(pinned, (({ spec_version: dropped, ...rest }) => rest)(expected.manifest)), text],
      ['spec_version is the tool\'s own', typeof specVersion === 'string' && specVersion !== '', String(specVersion)],
      ['one JCS object and one LF', expected.jcs_with_one_lf === true && text === `${canonicalize(manifest)}\n`, text],
    ]);
  });
}

/** export-0004: AGSC-09-17 (a), the manifest only on request, and repeatable. */
function manifestRequestCase(vector, ctx) {
  const byName = new Map(vector.expected.cases.map((c) => [c.name, c]));
  const list = [];
  for (const input of vector.input.cases) {
    const want = byName.get(input.name);
    const run = () => onFixture({ ...vector, input: { ...vector.input, flags: input.flags } }, ctx, (root) => {
      cli(['export', ...input.flags, '--json'], root, vector);
      return { files: listFiles(path.join(root, EXPORT_ROOT['--jsonl'])), ...manifestOf(root, '--jsonl') };
    });
    const first = run();
    list.push([`${input.name} files`, deepEqual(first.files, want.files), JSON.stringify(first.files)]);
    if (want.manifest !== undefined) {
      const { spec_version: dropped, ...pinned } = first.manifest || {};
      list.push([`${input.name} manifest`, deepEqual(pinned, (({ spec_version: s, ...rest }) => rest)(want.manifest)), first.text]);
      list.push([`${input.name} does not list itself`, want.manifest_lists_itself === false
        && !(first.manifest.files || []).some((f) => f.path === MANIFEST_FILE), first.text]);
      list.push([`${input.name} repeats`, want.repeat_identical === true && run().text === first.text, first.text]);
    }
  }
  return checks(list);
}

function run(vector, ctx) {
  const flags = vector.input.flags || [];
  if (vector.id === 'export-0003') return manifestOkfCase(vector, ctx);
  if (vector.id === 'export-0004') return manifestRequestCase(vector, ctx);
  if (flags.includes('--okf')) return okfCase(vector, ctx);
  if (flags.includes('--jsonl')) return jsonlCase(vector, ctx);
  return { status: 'fail', detail: `${vector.id}: no handler for this input shape in area export` };
}

module.exports.run = guarded(run);
