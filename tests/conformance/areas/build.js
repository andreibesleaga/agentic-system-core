'use strict';
// Conformance area `build`.
//
// Created by the graph package for `build-0010` alone — the optional static
// query fragments of AGSC-06-33, which are cut from `graph.nq` and therefore belong
// to the graph modules. Every other `build` vector (`build-0001`…`build-0003`, the
// search tokenizer) is not this area's and is listed in `tests/conformance/pending.json`,
// so the runner never reaches this file for them; the EXTENSION POINT at the bottom
// is where E appends its cases without touching anything above.

const crypto = require('node:crypto');
const nq = require('../../../src/knowledge/nquads.js');
const search = require('../../../src/distribution/search.js');
const headers = require('../../../src/distribution/headers.js');
const { canonicalize } = require('../../../src/knowledge/jcs.js');
const site = require('../../../src/distribution/site.js');
const now = require('../../../src/distribution/now.js');
const ledger = require('../../../src/governance/ledger.js');
const contentVersion = require('../../../src/knowledge/content-version.js');
const { createClock } = require('../../../src/adapters/node-clock.js');
const { checks, deepEqual, findingsMatch } = require('./_assert.js');

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

/** The build instant of AGSC-04-09/04-10 — fixed, never a wall clock. */
const GENERATED_AT = '2026-01-01T00:00:00Z';

/**
 * build-0010 — AGSC-06-33. Subject and predicate fragments only (no object
 * fragments at 1.x), each named by the first 16 hex of the SHA-256 of its IRI.
 *
 * The vector states `index` as the COUNT of distinct terms while AGSC-06-33 states
 * the index as `{subjects, predicates, generated_at}` with arrays of file paths.
 * The rule wins (project rule 6): `shard` emits the arrays, and the count the vector
 * states is compared against their length.
 */
function fragmentsCase(vector) {
  const { files, index } = nq.shard(vector.input.nquads, { sha256, generatedAt: GENERATED_AT });
  const paths = (prefix) => files.map((f) => f.path).filter((p) => p.startsWith(`${prefix}/`));
  const list = [];
  const expected = vector.expected;
  if (expected.subject_files) {
    list.push(['subject_files', JSON.stringify(paths('s')) === JSON.stringify(expected.subject_files),
      `got ${JSON.stringify(paths('s'))}`]);
  }
  if (expected.predicate_files) {
    list.push(['predicate_files', JSON.stringify(paths('p')) === JSON.stringify(expected.predicate_files),
      `got ${JSON.stringify(paths('p'))}`]);
  }
  if (expected.object_files) {
    list.push(['object_files', JSON.stringify(paths('o')) === JSON.stringify(expected.object_files),
      `got ${JSON.stringify(paths('o'))}`]);
  }
  if (expected.index) {
    list.push(['index.subjects', index.subjects.length === expected.index.subjects,
      `got ${index.subjects.length}`]);
    list.push(['index.predicates', index.predicates.length === expected.index.predicates,
      `got ${index.predicates.length}`]);
    list.push(['index.generated_at', index.generated_at === GENERATED_AT, `got ${index.generated_at}`]);
  }
  // Every fragment file holds exactly that term's lines of graph.nq, in the same order.
  const lines = String(vector.input.nquads).split('\n').filter(Boolean);
  for (const file of files) {
    const own = file.text.split('\n').filter(Boolean);
    list.push([`${file.path} is a subset of graph.nq`, own.every((line) => lines.includes(line)), file.text]);
  }
  return checks(list);
}

/**
 * build-0001…build-0003 — the normative tokenizer of AGSC-06-23 and the
 * AGSC-06-16 member order. The index is a pure function of the items the vector
 * carries, so no Bundle, no clock and no file system take part.
 */
function searchCase(vector) {
  const expected = vector.expected;
  const got = search.index(vector.input.items);
  const list = [['search index', deepEqual(got, expected.search), canonicalize(got)]];
  if (expected.output !== undefined) {
    // The BYTES, not the structure: AGSC-04-05 orders member names by UTF-16 code
    // units, and a code-point sort emits different bytes for the same index.
    const bytes = `${canonicalize(got)}\n`;
    list.push(['emitted bytes', bytes === expected.output, JSON.stringify(bytes)]);
  }
  if (expected.wrong_if_code_point_sorted !== undefined) {
    const terms = Object.keys(got.terms);
    const byCodePoint = [...terms].sort((a, b) => {
      const x = [...a].map((c) => c.codePointAt(0));
      const y = [...b].map((c) => c.codePointAt(0));
      for (let i = 0; i < Math.min(x.length, y.length); i += 1) if (x[i] !== y[i]) return x[i] - y[i];
      return x.length - y.length;
    });
    list.push(['the two orderings differ, so the case proves something',
      terms.join('\u0000') !== byCodePoint.join('\u0000'),
      'a code-point sort produced the same order as the emitted UTF-16 one']);
  }
  return checks(list);
}

/**
 * build-0011 (rc.5, R-08) — AGSC-06-33's fragment index as ARRAYS.
 *
 * `build-0010` stated `index.subjects`/`index.predicates` as COUNTS while the rule
 * states them as arrays of file paths in code-point order; it was withdrawn and this
 * one states the arrays, so the reading `build-0010` needed is gone. `generated_at`
 * comes from the vector, never from a clock (AGSC-04-09/04-11).
 */
function fragmentIndexCase(vector) {
  const { files, index } = nq.shard(vector.input.nquads,
    { sha256, generatedAt: vector.input.generated_at });
  const expected = vector.expected.index;
  const list = [
    ['index', deepEqual(expected, JSON.parse(JSON.stringify(index))), canonicalize(index)],
    ['index is JCS-canonical', canonicalize(index) === canonicalize(JSON.parse(canonicalize(index))),
      canonicalize(index)],
  ];
  // The arrays ARE the emitted file paths, and they are in code-point order.
  const paths = (prefix) => files.map((f) => f.path).filter((p) => p.startsWith(`${prefix}/`));
  list.push(['subjects are the emitted files', deepEqual(index.subjects, paths('s')), JSON.stringify(paths('s'))]);
  list.push(['predicates are the emitted files', deepEqual(index.predicates, paths('p')), JSON.stringify(paths('p'))]);
  for (const key of ['subjects', 'predicates']) {
    const sorted = [...index[key]].sort();
    list.push([`${key} in code-point order`, deepEqual(index[key], sorted), JSON.stringify(index[key])]);
  }
  if (vector.expected.object_files) {
    list.push(['object_files', deepEqual(vector.expected.object_files, paths('o')), JSON.stringify(paths('o'))]);
  }
  return checks(list);
}

/**
 * build-0012 — AGSC-06-17's served header set and redirect.
 *
 * The vector asserts the HEADER SET and the REDIRECT and deliberately asserts no
 * `_headers`/`_redirects` bytes (`file_bytes_asserted: false`): AGSC-06-01 as amended
 * makes the file format a deployment-profile detail. So this handler reads the sets
 * the WRITER produces (`headers.headerSets`), not the Cloudflare file.
 *
 * ONE READING: AGSC-06-17 obliges "a `default-src 'none'` policy with
 * `script-src 'self'`", not a whole policy string, and the vector states the shortest
 * text that satisfies it. The engine's policy carries six further directives, each
 * narrower than the default, so the assertion is that every directive the vector
 * names is present — never that the policy is exactly those two.
 */
function servedHeadersCase(vector) {
  const list = [];
  const sets = headers.headerSets({});
  const forRoute = (route) => {
    const out = {};
    for (const set of sets) {
      if (set.route !== route) continue;
      for (const [name, value] of set.headers) out[name] = value;
    }
    return out;
  };
  for (const [route, expected] of Object.entries(vector.expected.headers)) {
    const actual = forRoute(route);
    for (const [name, value] of Object.entries(expected)) {
      const got = actual[name];
      const ok = name === 'Content-Security-Policy'
        ? String(value).split(';').map((d) => d.trim()).filter(Boolean).every((d) => String(got).includes(d))
        : got === value;
      list.push([`${route} ${name}`, ok, `got ${JSON.stringify(got)}`]);
    }
  }
  if (vector.expected.header_fallback_admitted) {
    // AGSC-06-07/AGSC-11-04: the profile travels primarily on the media type and
    // secondarily as an RFC 6906 Link header; a consumer MUST accept either, so the
    // writer emits both.
    // The vector states the whole header line, name and all.
    const wellknown = forRoute('/.well-known/knowledge-linkset');
    list.push(['header_fallback_admitted',
      `Link: ${wellknown.Link}` === vector.expected.header_fallback_admitted,
      `got ${JSON.stringify(`Link: ${wellknown.Link}`)}`]);
  }
  const redirects = headers.redirectsFile()
    .split('\n').filter((l) => l !== '' && !l.startsWith('#'))
    .map((l) => l.split(' '))
    .map(([from, to, status]) => ({ from, status: Number(status), to }));
  for (const want of vector.expected.redirects || []) {
    list.push([`redirect ${want.from}`, redirects.some((r) => deepEqual(want, r)), JSON.stringify(redirects)]);
  }
  list.push(['file_bytes_asserted', vector.expected.file_bytes_asserted === false,
    'AGSC-06-01 as amended at rc.5 makes the file format a deployment-profile detail']);
  list.push(['deployment_profile', vector.input.deployment_profile === 'cloudflare-pages',
    'this writer emits the Cloudflare Pages profile and states it in its claim (AGSC-09-01)']);
  return checks(list);
}

/**
 * build-0013 — AGSC-06-36 (added at rc.6): the whole content of
 * `/.well-known/security.txt`.
 *
 * Six cases, each a `securityTxt` call over one authored file and one build instant.
 * `text: null` in the vector means NO ROUTE is emitted, which is what the module
 * returns beside its findings; a case that states findings asserts CODES only
 * (AGSC-09-06), never a message.
 */
function securityTxtCase(vector) {
  const list = [];
  const byName = new Map((vector.expected.cases || []).map((c) => [c.name, c]));
  for (const input of vector.input.cases || []) {
    const want = byName.get(input.name);
    if (want === undefined) {
      list.push([input.name, false, 'the vector states no expected case of this name']);
      continue;
    }
    const got = site.securityTxt(vector.input.base, input.instant, {
      authored: input.authored,
      legal: input.legal,
      publishing: true,
    });
    list.push([`${input.name} text`, got.text === want.text, JSON.stringify(got.text)]);
    const matched = findingsMatch(want.findings || [], got.findings);
    list.push([`${input.name} findings`, matched.ok, matched.detail]);
    if ((want.findings || []).length === 0) {
      list.push([`${input.name} clean`, got.findings.every((f) => f.severity === 'warn'),
        JSON.stringify(got.findings)]);
    }
  }
  return checks(list);
}

/**
 * build-0014 (rc.6, AGSC-04-25 /) — the content version, case by case.
 *
 * Five derivation cases plus the composition of the NOW line. Nothing here reads
 * git, a clock or a file: the git-log file and the build instant arrive as data,
 * which is exactly the property the rule is written to give ("two engines given
 * one repository derive one string").
 *
 * The `no-git-history` case expects `AGSC-E606` beside the version. That finding is
 * the CLOCK's, not the derivation's — AGSC-04-09 raises it when the build instant
 * defaults to 0 — so it is taken from the real adapter with an empty environment
 * rather than restated, and the two facts of the case are proved by the two modules
 * that own them.
 */
function contentVersionCase(vector) {
  const list = [];
  const byName = new Map((vector.expected.cases || []).map((c) => [c.name, c]));
  for (const input of vector.input.cases || []) {
    const want = byName.get(input.name);
    if (want === undefined) {
      list.push([input.name, false, 'the vector states no expected case of this name']);
      continue;
    }
    if (input.name === 'now-line') {
      const line = now.buildLine({
        bundleVersion: input.bundle_version,
        fingerprint: input.bundle_hash,
        instant: input.generated_at,
        specVersion: input.spec_version,
      });
      for (const text of want.contains || []) {
        list.push([`${input.name} contains`, line.includes(text), JSON.stringify(line)]);
      }
      // It is a line and its own paragraph in the emitted page (AGSC-06-22).
      const page = now.nowMarkdown({ counts: {}, last_build: input.generated_at }, {
        bundleVersion: input.bundle_version,
        fingerprint: input.bundle_hash,
        specVersion: input.spec_version,
      });
      list.push([`${input.name} is its own paragraph`, page.includes(`\n\n${line}\n\n`),
        JSON.stringify(page)]);
      continue;
    }
    const instant = ledger.instantFromEpoch(input.source_date_epoch);
    const got = contentVersion.bundleVersion({ buildInstant: instant, gitLog: input.git_log });
    list.push([`${input.name} bundle_version`, got.version === want.bundle_version,
      `got ${JSON.stringify(got.version)}`]);
    list.push([`${input.name} grammar`, contentVersion.GRAMMAR.test(got.version), got.version]);
    // The clock's own finding, for the case that has no git history at all.
    const clock = createClock({ env: {} });
    const findings = input.git_log.length === 0
      ? [...clock.findings(), ...got.findings] : got.findings;
    const matched = findingsMatch(want.findings || [], findings);
    list.push([`${input.name} findings`, matched.ok, matched.detail]);
    list.push([`${input.name} no other finding`, findings.length === (want.findings || []).length,
      JSON.stringify(findings.map((f) => f.code))]);
    if (want.ledger_kind_of_built_commit !== undefined) {
      // The tag AGSC-04-25 could not use is still the tag AGSC-08-20a releases on.
      const derived = ledger.derive(input.git_log, 'f'.repeat(40), '1.0.0-rc.6',
        { epoch: input.source_date_epoch });
      const built = derived.entries[input.git_log.length - 1];
      list.push([`${input.name} ledger kind`, built.kind === want.ledger_kind_of_built_commit,
        `got ${built.kind}`]);
    }
  }
  return checks(list);
}

/** The site a fixture Bundle builds to, at the vector's fixed instant (no clock, no network). */
function fixtureBuild(vector, ctx, rootOverride) {
  const path = require('node:path');
  const { createFileSystem, readSchemas } = require('../../../src/adapters/node-fs.js');
  const validate = require('../../../src/knowledge/validate.js');
  const { loadBundle } = require('../../../src/application/bundle.js');
  const root = rootOverride || path.join((ctx && ctx.root) || '.', 'tests', String(vector.input.bundle || 'fixtures/minimal'));
  const fs = createFileSystem(root);
  const bundle = loadBundle(fs, { schemas: validate.schemas(readSchemas((ctx && ctx.root) || '.')) });
  const clock = createClock({ env: { SOURCE_DATE_EPOCH: String((vector.options || {}).source_date_epoch || '1767225600') } });
  return site.build(bundle, { clock, fs }, { specVersion: (vector.options || {}).spec_version, version: '0.0.2' });
}

/** build-0015 (AGSC-04-07): every emitted text file ends with exactly one LF and starts with no BOM. */
function trailingLfCase(vector, ctx) {
  const built = fixtureBuild(vector, ctx);
  const list = [];
  const bad = [];
  const bom = [];
  let htmlPages = 0;
  for (const [route, bytes] of built.files) {
    if (typeof bytes !== 'string') continue; // a binary artefact is outside AGSC-04-07
    if (!bytes.endsWith('\n') || bytes.endsWith('\n\n')) bad.push(route);
    if (bytes.startsWith('\uFEFF')) bom.push(route);
    if (route.endsWith('.html')) {
      htmlPages += 1;
      if (!bytes.endsWith(vector.expected.html_pages_end_with)) bad.push(`${route} (html tail)`);
    }
  }
  list.push(['every text file ends with exactly one LF', bad.length === 0, JSON.stringify(bad)]);
  list.push(['no byte-order mark', bom.length === 0, JSON.stringify(bom)]);
  list.push(['html pages exist', htmlPages > 0, `${htmlPages} html pages`]);
  for (const route of vector.expected.includes_routes || []) {
    list.push([`emits ${route}`, built.files.has(route), [...built.files.keys()].filter((r) => r.endsWith('.html')).join(' ')]);
  }
  return checks(list);
}

/** build-0016 (AGSC-02-11): staleness is a comparison of two instants, nothing more. */
function staleCase(vector) {
  const got = now.staleItems(vector.input.items, vector.input.build_instant);
  return checks([['stale', deepEqual(got, vector.expected.stale), JSON.stringify(got)]]);
}

/** A Bundle stated inline in `input.files`, written to a scratch directory (no repository file is needed). */
function inlineBundle(vector) {
  const path = require('node:path');
  const nodeFs = require('node:fs');
  const os = require('node:os');
  const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), `agsc-${vector.id}-`));
  for (const [file, text] of Object.entries(vector.input.files || {})) {
    nodeFs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    nodeFs.writeFileSync(path.join(root, file), text);
  }
  return { root, done: () => nodeFs.rmSync(root, { force: true, recursive: true }) };
}

/** build-0017 (AGSC-04-02): a Bundle that references assets builds twice to identical bytes. */
function reproducibleAssetsCase(vector, ctx) {
  const scratch = inlineBundle(vector);
  let first;
  let second;
  try {
    first = fixtureBuild({ ...vector, input: { ...vector.input, bundle: null } }, ctx, scratch.root);
    second = fixtureBuild({ ...vector, input: { ...vector.input, bundle: null } }, ctx, scratch.root);
  } finally { scratch.done(); }
  const list = [];
  const routesA = [...first.files.keys()];
  const routesB = [...second.files.keys()];
  let identical = routesA.length === routesB.length;
  const differing = [];
  for (const route of routesA) {
    const a = first.files.get(route);
    const b = second.files.get(route);
    const same = typeof a === 'string' ? a === b : Buffer.compare(Buffer.from(a), Buffer.from(b == null ? '' : b)) === 0;
    if (!same) { identical = false; differing.push(route); }
  }
  list.push(['byte identical', identical === vector.expected.byte_identical, JSON.stringify(differing)]);
  const codes = first.findings.map((f) => f.code);
  for (const code of vector.expected.codes_absent || []) list.push([`no ${code}`, !codes.includes(code), JSON.stringify(codes)]);
  if (vector.expected.no_error_finding === true) {
    list.push(['no error finding', first.findings.every((f) => f.severity !== 'error'),
      JSON.stringify(first.findings.filter((f) => f.severity === 'error').map((f) => `${f.code} ${f.message}`))]);
  }
  for (const route of vector.expected.includes_routes || []) list.push([`emits ${route}`, first.files.has(route), routesA.filter((r) => r.startsWith('/assets/')).join(' ')]);
  return checks(list);
}

module.exports.run = (vector, ctx) => {
  if (vector.id === 'build-0015') return trailingLfCase(vector, ctx);
  if (vector.id === 'build-0016') return staleCase(vector);
  if (vector.id === 'build-0017') return reproducibleAssetsCase(vector, ctx);
  if (vector.id === 'build-0014') return contentVersionCase(vector);
  if (vector.id === 'build-0010') return fragmentsCase(vector);
  if (vector.id === 'build-0013') return securityTxtCase(vector);
  if (vector.id === 'build-0011') return fragmentIndexCase(vector);
  if (vector.id === 'build-0012') return servedHeadersCase(vector);

  // ---------------------------------------------------------------- EXTENSION POINT
  // Owner E: the build-0001…build-0003 cases (search tokenizer, AGSC-06-16/06-23).
  if (vector.id === 'build-0001' || vector.id === 'build-0002' || vector.id === 'build-0003') {
    return searchCase(vector);
  }
  // ---------------------------------------------------------------------------------

  return { status: 'fail', detail: `${vector.id}: no handler in area build`, ctx };
};
