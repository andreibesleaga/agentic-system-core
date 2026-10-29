'use strict';
// Conformance area `bundle`. bundle-0001 (MAJOR tolerance and unknown-key
// preservation, AGSC-00-15). bundle-0003..0005 (the agent lane, AGSC-01-36/38),
// bundle-0006 and bundle-0008 (configuration), bundle-0007, bundle-0009 and
// bundle-0010 (the fixture with files added, through the real `lint`) — dispatched
// here by vector.id since their input shapes differ from bundle-0001's.

const frontmatter = require('../../../src/knowledge/frontmatter.js');
const validate = require('../../../src/knowledge/validate.js');
const { deepEqual, findingsMatch, checks } = require('./_assert.js');
const { checkAgents } = require('../../../src/governance/agents.js');
const { guarded } = require('./_expected-reads.js');

function runAgentsConfigVector(vector) {
  const findings = checkAgents(vector.input.config);
  const errorFindings = findings.filter((f) => f.severity === 'error');
  const accepted = errorFindings.length === 0;
  const expected = vector.expected;
  const list = [['accepted', accepted === expected.accepted, `${accepted} != ${expected.accepted}`]];
  if (expected.error !== undefined) {
    list.push(['error', errorFindings.some((f) => f.code === expected.error), JSON.stringify(errorFindings)]);
  }
  if (Array.isArray(expected.findings)) {
    const m = findingsMatch(expected.findings, findings);
    list.push(['findings', m.ok && findings.length === expected.findings.length, m.detail]);
  }
  return checks(list);
}

/**
 * bundle-0006 (AGSC-00-25) — the asymmetry AGSC-00-21 names: content
 * tolerates the unknown, configuration does not.
 *
 * `agsc.config.json` is the one CLOSED surface of this format (AGSC-01-18), so a
 * reserved name is rejected there exactly as a typo is, and `AGSC-09-08` puts
 * invalid configuration in the exit-2 usage class. The exit code is asserted
 * through `application/cli/main.js`'s own mapping and not restated here, so the
 * vector proves the CLI and not this file.
 *
 * `path` in the vector is the location in an operator's spelling (`routing`,
 * `agents[0].routing`); the engine carries it at the head of the finding's
 * message and, for an unknown key, in the finding's `key` member.
 */
function reservedConfigCase(vector, ctx) {
  const main = require('../../../src/application/cli/main.js');
  const list = [];
  const byName = new Map((vector.expected.cases || []).map((c) => [c.name, c]));
  for (const input of vector.input.cases || []) {
    const want = byName.get(input.name);
    const findings = validate.config(input.config, { checkAgents, schemas: ctx.schemas });
    const errors = findings.filter((f) => f.severity === 'error');
    const accepted = errors.length === 0;
    list.push([`${input.name} accepted`, accepted === want.accepted, JSON.stringify(findings)]);
    const m = findingsMatch((want.findings || []).map((f) => ({ code: f.code, severity: f.severity })), findings);
    list.push([`${input.name} findings`, m.ok, m.detail]);
    for (const one of want.findings || []) {
      if (one.path === undefined) continue;
      list.push([`${input.name} names ${one.path}`,
        findings.some((f) => String(f.message).startsWith(`${one.path}: `)),
        JSON.stringify(findings.map((f) => f.message))]);
    }
    // AGSC-09-08's exit class, read from the CLI's own table rather than asserted
    // twice: `AGSC-E004` is the code that makes an invocation exit 2.
    const exit = accepted ? 0 : (errors.some((f) => main.USAGE_CLASS_CODES.has(f.code)) ? 2 : 1);
    list.push([`${input.name} exit`, exit === want.exit, `got ${exit}`]);
    if (want.preserved !== undefined) {
      const kept = {};
      for (const key of Object.keys(want.preserved)) kept[key] = input.config[key];
      list.push([`${input.name} preserved`, deepEqual(kept, want.preserved), JSON.stringify(kept)]);
    }
  }
  return checks(list);
}

/**
 * The minimal fixture with the vector's files added, in a scratch directory that is
 * removed afterwards, and the real `lint --json` run over it through the CLI's own
 * entry point: the shape of every case whose input is `bundle` plus `add_files`
 * (and, where a JSON string cannot carry the file, `add_sized_files` and `add_links`,
 * tests/vectors/README.md). Returns `{exit, findings, root}` to `inspect`, which runs
 * before the directory goes. The `lint` area runs its fixture cases through it too.
 */
function onFixture(vector, ctx, inspect) {
  const path = require('node:path');
  const nodeFs = require('node:fs');
  const os = require('node:os');
  const { main } = require('../../../src/application/cli/main.js');
  const { createFileSystem } = require('../../../src/adapters/node-fs.js');
  const { captureStream } = require('./_shared.js');
  const engineRoot = (ctx && ctx.root) || '.';
  const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), `agsc-${vector.id}-`));
  nodeFs.cpSync(path.join(engineRoot, 'tests', String(vector.input.bundle || 'fixtures/minimal')), root, { recursive: true });
  const place = (file) => {
    nodeFs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    return path.join(root, file);
  };
  for (const [file, text] of Object.entries(vector.input.add_files || {})) nodeFs.writeFileSync(place(file), text);
  // A file of `bytes` bytes, each the one ASCII character `fill`.
  for (const [file, { bytes, fill }] of Object.entries(vector.input.add_sized_files || {})) {
    nodeFs.writeFileSync(place(file), Buffer.alloc(bytes, String(fill)));
  }
  // A symbolic link whose target is read from the link's own folder.
  for (const [file, target] of Object.entries(vector.input.add_links || {})) {
    const at = place(file);
    const kind = nodeFs.statSync(path.resolve(path.dirname(at), target)).isDirectory() ? 'dir' : 'file';
    nodeFs.symlinkSync(target, at, kind);
  }
  try {
    const stdout = captureStream();
    const stderr = captureStream();
    const exit = main(['lint', '--json', '--quiet'], {
      env: { SOURCE_DATE_EPOCH: '1767225600' }, ports: { fs: createFileSystem(root) }, root,
      specVersion: (vector.options || {}).spec_version, stderr, stdout, version: (vector.options || {}).spec_version,
    });
    let findings = [];
    try { findings = JSON.parse(stdout.text() || '{}').findings || []; } catch (e) { findings = []; }
    return inspect({ exit, findings, root });
  } finally { nodeFs.rmSync(root, { force: true, recursive: true }); }
}

/**
 * bundle-0007 (AGSC-01-13 as amended 2026-09-24): at 1.0 a `<slug>.<lang>.md` file
 * beside its primary is a second use of the slug (AGSC-E206) and no variant route is
 * built. Run over a scratch copy of the fixture with the vector's file added, through
 * the real `lint` and the real `build`.
 */
function variantFileAt10Case(vector, ctx) {
  const { createFileSystem, readSchemas } = require('../../../src/adapters/node-fs.js');
  const { loadBundle } = require('../../../src/application/bundle.js');
  const site = require('../../../src/distribution/site.js');
  const { createClock } = require('../../../src/adapters/node-clock.js');
  const engineRoot = (ctx && ctx.root) || '.';
  return onFixture(vector, ctx, ({ exit, findings, root }) => {
    const list = [];
    const want = vector.expected.lint;
    list.push(['lint exit 1', exit === 1, `exit ${exit}`]);
    list.push([`lint ${want.error} for ${want.slug}`,
      findings.some((f) => f.code === want.error && f.slug === want.slug), JSON.stringify(findings.map((f) => [f.code, f.slug]))]);
    const fs = createFileSystem(root);
    const bundle = loadBundle(fs, { schemas: validate.schemas(readSchemas(engineRoot)) });
    const clock = createClock({ env: { SOURCE_DATE_EPOCH: '1767225600' } });
    const built = site.build(bundle, { clock, fs }, { specVersion: (vector.options || {}).spec_version, version: '0.0.2' });
    for (const route of vector.expected.build.routes_absent || []) list.push([`no ${route}`, !built.files.has(route), route]);
    for (const route of vector.expected.build.routes_present || []) list.push([`emits ${route}`, built.files.has(route), route]);
    return checks(list);
  });
}

/**
 * bundle-0009 (AGSC-01-05) and bundle-0010 (AGSC-01-13), as amended 2026-10-10 for
 * 1.0.0: what `lint` reports for the fixture with the vector's files added. The
 * fixture alone reports nothing, so `expected.lint.findings` is the WHOLE list —
 * each entry a subset of one finding's members, and no finding beyond them — and
 * `expected.lint.exit` the exit code.
 */
function fixtureLintCase(vector, ctx) {
  return onFixture(vector, ctx, ({ exit, findings }) => {
    const want = vector.expected.lint;
    const m = findingsMatch(want.findings, findings);
    return checks([
      [`lint exit ${want.exit}`, exit === want.exit, `exit ${exit}`],
      ['lint findings', m.ok && findings.length === want.findings.length,
        `${m.detail} ${JSON.stringify(findings.map((f) => [f.code, f.file, f.severity, f.slug]))}`],
    ]);
  });
}

/**
 * bundle-0008 (AGSC-00-15 as amended 2026-09-25) — a writer refuses a Bundle whose
 * `spec_version` MAJOR it does not implement (`AGSC-E004`, exit 2 through the CLI's
 * own usage class) and warns on a newer MINOR of its own MAJOR (`AGSC-E506`). The
 * tool's own version is the vector's `options.spec_version`, as everywhere else.
 */
function specVersionCase(vector, ctx) {
  const main = require('../../../src/application/cli/main.js');
  const list = [];
  const byName = new Map((vector.expected.cases || []).map((c) => [c.name, c]));
  for (const input of vector.input.cases || []) {
    const want = byName.get(input.name);
    const findings = validate.config(input.config, {
      checkAgents, ownVersion: vector.options.spec_version, schemas: ctx.schemas,
    });
    const errors = findings.filter((f) => f.severity === 'error');
    const accepted = errors.length === 0;
    list.push([`${input.name} accepted`, accepted === want.accepted, JSON.stringify(findings)]);
    const m = findingsMatch((want.findings || []).map((f) => ({ code: f.code, severity: f.severity })), findings);
    list.push([`${input.name} findings`, m.ok && findings.length === (want.findings || []).length,
      `${m.detail} ${JSON.stringify(findings.map((f) => f.code))}`]);
    const exit = accepted ? 0 : (errors.some((f) => main.USAGE_CLASS_CODES.has(f.code)) ? 2 : 1);
    list.push([`${input.name} exit`, exit === want.exit, `got ${exit}`]);
  }
  return checks(list);
}

const B_HANDLERS = {
  'bundle-0012': reservedConfigCase,
  'bundle-0021': fixtureLintCase,
  'bundle-0015': fixtureLintCase,
  'bundle-0014': fixtureLintCase,
  'bundle-0013': fixtureLintCase,
  'bundle-0011': specVersionCase,
  'bundle-0017': fixtureLintCase,
  'bundle-0016': fixtureLintCase,
  'bundle-0010': fixtureLintCase,
  'bundle-0009': fixtureLintCase,
  'bundle-0008': specVersionCase,
  'bundle-0007': variantFileAt10Case,
  'bundle-0006': reservedConfigCase,
  'bundle-0003': runAgentsConfigVector,
  'bundle-0004': runAgentsConfigVector,
  'bundle-0005': runAgentsConfigVector,
};

function run(vector, ctx) {
  const bHandler = B_HANDLERS[vector.id];
  if (bHandler) return bHandler(vector, ctx);

  const { input, expected } = vector;
  if (typeof input.markdown !== 'string') {
    return { status: 'fail', detail: 'no handler for this input shape in area bundle' };
  }
  const item = frontmatter.parseItem(input.markdown, { schemas: ctx.schemas });
  const errors = item.findings.filter((f) => f.severity === 'error');
  const keys = validate.unknownKeys(item.frontmatter || {}, { schemas: ctx.schemas });
  const preserved = {};
  for (const k of [...keys.vendor, ...keys.unknown].sort()) preserved[k] = item.frontmatter[k];

  const list = [];
  if (expected.accepted === true) {
    const major = validate.majorCompatible(item.frontmatter && item.frontmatter.spec_version, ctx.specVersion);
    list.push(['accepted', errors.length === 0 && major, JSON.stringify(errors.map((f) => f.code))]);
  }
  if (expected.preserved !== undefined) {
    list.push(['preserved', deepEqual(preserved, expected.preserved), JSON.stringify(preserved)]);
  }
  if (Array.isArray(expected.findings)) {
    const m = findingsMatch(expected.findings, item.findings);
    list.push(['findings', m.ok, m.detail]);
  }
  return checks(list);
}

module.exports.run = guarded(run);
// The fixture runner, shared with the `lint` area's cases of the same input shape.
module.exports.fixtureLintCase = fixtureLintCase;
