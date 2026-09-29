'use strict';
// Conformance area `bundle`. bundle-0001 (MAJOR tolerance and unknown-key
// preservation, AGSC-00-15). bundle-0003..0005 (the agent lane, AGSC-01-36/38) and
// bundle-0006 — dispatched here by vector.id since their input shape (`config`
// alone, no `markdown`) differs from bundle-0001's.

const frontmatter = require('../../../src/knowledge/frontmatter.js');
const validate = require('../../../src/knowledge/validate.js');
const { deepEqual, findingsMatch, checks } = require('./_assert.js');
const { checkAgents } = require('../../../src/governance/agents.js');

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
 * bundle-0007 (AGSC-01-13 as amended 2026-09-24): at 1.0 a `<slug>.<lang>.md` file
 * beside its primary is a second use of the slug (AGSC-E206) and no variant route is
 * built. Run over a scratch copy of the fixture with the vector's file added, through
 * the real `lint` and the real `build`.
 */
function variantFileAt10Case(vector, ctx) {
  const path = require('node:path');
  const nodeFs = require('node:fs');
  const os = require('node:os');
  const { main } = require('../../../src/application/cli/main.js');
  const { createFileSystem, readSchemas } = require('../../../src/adapters/node-fs.js');
  const { loadBundle } = require('../../../src/application/bundle.js');
  const site = require('../../../src/distribution/site.js');
  const { createClock } = require('../../../src/adapters/node-clock.js');
  const { captureStream } = require('./_shared.js');
  const engineRoot = (ctx && ctx.root) || '.';
  const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'agsc-bundle-0007-'));
  nodeFs.cpSync(path.join(engineRoot, 'tests', String(vector.input.bundle || 'fixtures/minimal')), root, { recursive: true });
  for (const [file, text] of Object.entries(vector.input.add_files || {})) {
    nodeFs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    nodeFs.writeFileSync(path.join(root, file), text);
  }
  const list = [];
  try {
    const stdout = captureStream();
    const stderr = captureStream();
    const exit = main(['lint', '--json', '--quiet'], {
      env: { SOURCE_DATE_EPOCH: '1767225600' }, ports: { fs: createFileSystem(root) }, root,
      specVersion: (vector.options || {}).spec_version, stderr, stdout, version: (vector.options || {}).spec_version,
    });
    let findings = [];
    try { findings = JSON.parse(stdout.text() || '{}').findings || []; } catch (e) { findings = []; }
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
  } finally { nodeFs.rmSync(root, { force: true, recursive: true }); }
  return checks(list);
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
  'bundle-0008': specVersionCase,
  'bundle-0007': variantFileAt10Case,
  'bundle-0006': reservedConfigCase,
  'bundle-0003': runAgentsConfigVector,
  'bundle-0004': runAgentsConfigVector,
  'bundle-0005': runAgentsConfigVector,
};

module.exports.run = (vector, ctx) => {
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
};
