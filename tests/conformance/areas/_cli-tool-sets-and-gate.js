'use strict';
// The `cli` cases on what the local tool server and the page tools each see, and on
// the two files `ci` writes for a gate:
//
//   cli-0023 (AGSC-09-13) the local server reads every item of the Bundle on disk, draft,
//            retired and release-gated ones included; the page tools see the listed set;
//            the server's resources are the published items;
//   cli-0024 (AGSC-08-10) the shape of `dist/gate.json`;
//   cli-0025 (AGSC-08-12) the pinned bytes of `dist/forge/status-checks.json`, and the
//            drift of a file at the forge's own path (`AGSC-E707`, never overwritten).
//
// The stdio exchange is one synchronous child process over a scratch copy of the fixture
// with `input.add_files` written over it (no timer, no network). The page tools are
// evaluated by the caller's `evaluateWebmcp` over the site the same scratch Bundle
// builds. `ci` runs through the command line with the file-system port alone, so no git
// history, at the vector's SOURCE_DATE_EPOCH (`_build-surfaces.js`).

const path = require('node:path');
const nodeFs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { createFileSystem, readSchemas } = require('../../../src/adapters/node-fs.js');
const validate = require('../../../src/knowledge/validate.js');
const { loadBundle } = require('../../../src/application/bundle.js');
const site = require('../../../src/distribution/site.js');
const { createClock } = require('../../../src/adapters/node-clock.js');
const { checks, deepEqual, findingsMatch } = require('./_assert.js');
const { subset } = require('./_cli-mcp-primitives.js');
const { isJcsWithOneLf, onBuild, parseOr } = require('./_build-surfaces.js');

/** 2026-01-01T00:00:00Z — the fixed instant of `tests/fixtures/minimal/README.md`. */
const FIXTURE_EPOCH = '1767225600';

/** A scratch copy of `input.bundle` with `input.add_files` written over it. */
function scratch(vector, ctx) {
  const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), `agsc-${vector.id}-`));
  nodeFs.cpSync(path.join((ctx && ctx.root) || '.', 'tests', String(vector.input.bundle)), root, { recursive: true });
  for (const [file, text] of Object.entries(vector.input.add_files || {})) {
    nodeFs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    nodeFs.writeFileSync(path.join(root, file), text);
  }
  return root;
}

/** The envelope a `tools/call` result carries as its one text content, or null. */
function envelopeOf(frame) {
  try { return JSON.parse(frame.result.content[0].text); } catch (e) { return null; }
}

/**
 * The routes the emitted loader (`API.load` of the page script) fetches, taken from the
 * built files in the loader's own order, synchronously: its fixed `API.ROUTES`, the
 * search shards a manifest names, the `/pages/<slug>.md` of each document the index
 * lists, and the board exports when the discovery document declares them. A browser's
 * page therefore sees the listed set, which is what AGSC-09-16 asks; the asynchronous
 * loader itself is run against a fake fetch by `tests/distribution/compose-page-run.test.js`.
 *
 * @param {object} api `AGSC_PAGE_TOOLS` as the emitted script defines it.
 * @param {Record<string, string>} files every route of the build, as text.
 * @returns {Record<string, string>}
 */
function loaderSources(api, files) {
  const sources = {};
  const get = (route) => { if (Object.prototype.hasOwnProperty.call(files, route)) sources[route] = files[route]; };
  api.ROUTES.forEach(get);
  api.pageShardRoutes(parseOr(sources['/search.json'], null)).forEach(get);
  const index = api.pageIndexOf(sources);
  for (const doc of (index && index.docs) || []) get(`/pages/${doc.slug}.md`);
  if (api.pageDeclaresBoards(sources)) {
    get('/boards/index.json');
    const boards = (parseOr(sources['/boards/index.json'], null) || {}).boards;
    for (const entry of Array.isArray(boards) ? boards : []) {
      if (entry && /^[a-z0-9]+(-[a-z0-9]+)*$/u.test(String(entry.cluster))) get(`/boards/${entry.cluster}.json`);
    }
  }
  return sources;
}

/** cli-0023: the stdio server over frames, and the page tools over the built site. */
function runCli0023(vector, ctx, evaluateWebmcp) {
  const engine = path.resolve((ctx && ctx.root) || '.');
  const root = scratch(vector, ctx);
  const list = [];
  try {
    const run = spawnSync(process.execPath, [path.join(engine, 'bin', 'agsc.js'), 'mcp'], {
      cwd: root,
      encoding: 'utf8',
      env: { NO_COLOR: '1', PATH: process.env.PATH, SOURCE_DATE_EPOCH: FIXTURE_EPOCH },
      input: vector.input.frames.map((f) => `${JSON.stringify(f)}\n`).join(''),
      maxBuffer: 16 * 1024 * 1024,
    });
    const byId = new Map();
    for (const line of String(run.stdout || '').split('\n')) {
      if (line.trim() === '') continue;
      const frame = JSON.parse(line);
      if (frame.id !== undefined) byId.set(frame.id, frame);
    }
    for (const want of vector.expected.responses) {
      const frame = byId.get(want.id);
      list.push([`response ${want.id}`, frame !== undefined && subset(want, frame), JSON.stringify(frame)]);
    }
    for (const want of vector.expected.stdio) {
      const envelope = envelopeOf(byId.get(want.id) || {});
      const status = envelope === null ? 'none' : (envelope.type === 'error' ? 'error' : 'ok');
      list.push([`stdio ${want.slug}`, status === want.status, `got ${status}`]);
      if (want.error !== undefined) {
        list.push([`stdio ${want.slug} code`, (envelope && envelope.body && envelope.body.code) === want.error, JSON.stringify(envelope)]);
      }
    }
    const fs = createFileSystem(root);
    const bundle = loadBundle(fs, { schemas: validate.schemas(readSchemas(engine)) });
    const clock = createClock({ env: { SOURCE_DATE_EPOCH: FIXTURE_EPOCH } });
    const page = evaluateWebmcp(site.build(bundle, { clock, fs }, { specVersion: vector.options.spec_version, version: '0.0.2' }), { loader: true });
    (vector.input.calls || []).forEach((call, i) => {
      const want = vector.expected.page[i] || {};
      const got = page.pageToolset.call(call.tool, { slug: call.slug });
      const status = got && got.type === 'error' ? 'error' : 'ok';
      list.push([`page ${call.slug}`, status === want.status, `got ${status}`]);
      if (want.error !== undefined) {
        list.push([`page ${call.slug} code`, (got && got.body && got.body.code) === want.error, JSON.stringify(got)]);
      }
    });
    list.push(['the page tools made no network call', page.networkCalls === 0, `${page.networkCalls}`]);
  } finally {
    nodeFs.rmSync(root, { force: true, recursive: true });
  }
  return checks(list);
}

/** Run every sub-case of a `ci` case and hand `inspect` the run and the expected entry. */
function eachCiCase(vector, ctx, inspect) {
  const list = [];
  const byName = new Map((vector.expected.cases || []).map((c) => [c.name, c]));
  for (const sub of vector.input.cases || []) {
    const want = byName.get(sub.name);
    if (want === undefined) { list.push([sub.name, false, 'the vector states no expected case of this name']); continue; }
    onBuild(vector, ctx, sub, (run) => list.push(...inspect(sub.name, want, run)));
  }
  return checks(list);
}

/** cli-0024 (AGSC-08-10): `dist/gate.json`, its form and the members of each verdict. */
function runCli0024(vector, ctx) {
  return eachCiCase(vector, ctx, (name, want, run) => {
    const bytes = run.read('dist/gate.json');
    const value = parseOr(bytes, null);
    const verdicts = Array.isArray(value) ? value : (value === null ? [] : [value]);
    const out = [
      [`${name} exit`, run.exit === want.exit, `exit ${run.exit}`],
      [`${name} JCS and one LF`, isJcsWithOneLf(bytes) === want.jcs_with_one_lf, JSON.stringify(bytes)],
      [`${name} array`, Array.isArray(value) === want.verdict_is_array, JSON.stringify(bytes)],
      [`${name} verdicts`, deepEqual(verdicts.map((v) => ({ gate: v.gate, level: v.level, status: v.status })), want.verdicts),
        JSON.stringify(verdicts.map((v) => [v.gate, v.level, v.status]))],
    ];
    for (const v of verdicts) {
      out.push([`${name} ${v.gate} members`, deepEqual(Object.keys(v).sort(), [...want.verdict_members].sort()), JSON.stringify(Object.keys(v))]);
      const ok = Array.isArray(v.checks) && v.checks.length > 0
        && v.checks.every((c) => deepEqual(Object.keys(c).sort(), [...want.check_members].sort())
          && ['pass', 'fail'].includes(c.status) && Array.isArray(c.findings));
      out.push([`${name} ${v.gate} checks`, ok, JSON.stringify(v.checks)]);
    }
    return out;
  });
}

/** cli-0025 (AGSC-08-12): the bytes of `dist/forge/status-checks.json`, where it is written. */
function runCli0025(vector, ctx) {
  return eachCiCase(vector, ctx, (name, want, run) => {
    const first = run.read('dist/forge/status-checks.json');
    const out = [[`${name} bytes`, first === want.output, JSON.stringify(first)]];
    if (want.exit !== undefined) out.push([`${name} exit`, run.exit === want.exit, `exit ${run.exit}`]);
    if (want.findings !== undefined) {
      const m = findingsMatch(want.findings, run.findings);
      out.push([`${name} findings`, m.ok, m.detail]);
    }
    // A file at the forge's own path that differs is reported, never overwritten.
    for (const [file, bytes] of Object.entries(want.unchanged || {})) {
      out.push([`${name} ${file} unchanged`, run.read(file) === bytes, JSON.stringify(run.read(file))]);
    }
    const inOut = [...run.files.keys()].filter((r) => r.includes('forge') || r.endsWith('status-checks.json'));
    out.push([`${name} nothing under build.out`, (inOut.length === 0) === want.not_in_build_out, JSON.stringify(inOut)]);
    run.rerun();
    const second = run.read('dist/forge/status-checks.json');
    out.push([`${name} idempotent`, (second === first) === want.idempotent, JSON.stringify(second)]);
    return out;
  });
}

module.exports = { loaderSources, runCli0023, runCli0024, runCli0025 };
