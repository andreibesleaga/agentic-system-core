'use strict';
// Conformance area `build`.
//
// The static query fragments of AGSC-06-33 (cut from `graph.nq`), the search
// tokenizer and the sharded index, the served header set, `security.txt`, the
// content version, the trailing LF, the stale instant and the reproducible assets.
// HANDLERS at the bottom maps each case id to its handler.

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
const { guarded } = require('./_expected-reads.js');
const surfaces = require('./_build-surfaces.js');

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

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
 * build-0011 — AGSC-06-33's fragment index as ARRAYS.
 *
 * The rule states `index.subjects`/`index.predicates` as arrays of file paths in
 * code-point order, and so does the vector. `generated_at` comes from the vector,
 * never from a clock (AGSC-04-09/04-11).
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
 * A Content-Security-Policy as directives: name -> source list (CSP3 §2.2: directive
 * names are case-insensitive, sources are separated by ASCII whitespace).
 */
function policyDirectives(policy) {
  const out = new Map();
  for (const part of String(policy).split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/u).filter(Boolean);
    if (name !== undefined && !out.has(name.toLowerCase())) out.set(name.toLowerCase(), sources);
  }
  return out;
}

/**
 * True when the policy lets an inline script run: a directive that governs scripts
 * (`script-src-elem` and `script-src-attr` where present, else `script-src`, else
 * `default-src`) names 'unsafe-inline', 'unsafe-hashes', a nonce or a hash source.
 */
function admitsInlineScript(directives) {
  const governing = (name) => directives.get(name) || directives.get('script-src') || directives.get('default-src') || [];
  const inline = (source) => /^'(unsafe-inline|unsafe-hashes|nonce-[^']*|sha(256|384|512)-[^']*)'$/iu.test(source);
  return ['script-src-elem', 'script-src-attr'].some((name) => governing(name).some(inline));
}

/**
 * build-0018 — AGSC-06-17's served header set (supersedes build-0012).
 *
 * The case asserts the HEADER SET and no `_headers` bytes (`file_bytes_asserted:
 * false`): AGSC-06-01 makes the file format a deployment-profile detail, so this
 * handler reads the sets the WRITER produces (`headers.headerSets`). The policy is
 * asserted by CONTAINMENT, as the rule says (`whole_string_asserted: false`): every
 * stated directive is present with its source, and no inline script is admitted.
 */
function servedHeadersCase(vector) {
  const list = [];
  const expected = vector.expected;
  const sets = headers.headerSets({});
  const forRoute = (route) => {
    const out = {};
    for (const set of sets) {
      if (set.route !== route) continue;
      for (const [name, value] of set.headers) out[name] = value;
    }
    return out;
  };
  for (const [route, want] of Object.entries(expected.headers)) {
    const actual = forRoute(route);
    for (const [name, value] of Object.entries(want)) {
      list.push([`${route} ${name}`, actual[name] === value, `got ${JSON.stringify(actual[name])}`]);
    }
  }
  const csp = expected.content_security_policy;
  const policy = forRoute(csp.route)['Content-Security-Policy'];
  const directives = policyDirectives(policy);
  list.push([`policy served on ${csp.route}`, typeof policy === 'string', `got ${JSON.stringify(policy)}`]);
  for (const directive of csp.contains) {
    const [name, ...sources] = directive.split(/\s+/u);
    const have = directives.get(name.toLowerCase()) || [];
    list.push([`policy contains ${directive}`, sources.every((s) => have.includes(s)), `got ${JSON.stringify(policy)}`]);
  }
  list.push(['admits_inline_script', admitsInlineScript(directives) === csp.admits_inline_script,
    `got ${JSON.stringify(policy)}`]);
  list.push(['whole_string_asserted', csp.whole_string_asserted === false,
    'AGSC-06-17: a case on the policy asserts that it contains these directives, never the whole string']);
  // AGSC-06-07/AGSC-11-04: the profile travels primarily on the media type and
  // secondarily as an RFC 6906 Link header; the vector states the whole header line.
  const wellknown = forRoute('/.well-known/knowledge-linkset');
  list.push(['header_fallback_admitted', `Link: ${wellknown.Link}` === expected.header_fallback_admitted,
    `got ${JSON.stringify(`Link: ${wellknown.Link}`)}`]);
  list.push(['file_bytes_asserted', expected.file_bytes_asserted === false,
    'AGSC-06-01 makes the file format a deployment-profile detail']);
  list.push(['deployment_profile', vector.input.deployment_profile === 'cloudflare-pages',
    'this writer emits the Cloudflare Pages profile and states it in its claim (AGSC-09-01)']);
  return checks(list);
}

/**
 * build-0019 — AGSC-06-21: a search index above 500 items. `/search.json` is the
 * manifest (its bytes), and each `/search-<nn>.json` shard is a complete AGSC-06-16
 * index over its own slice of the slug order, with postings counted in its own
 * `docs[]`; a shard entry states its size, first and last slug, and may state its
 * whole bytes.
 */
function shardedSearchCase(vector) {
  const expected = vector.expected;
  const emitted = new Map(search.files(vector.input.items).files.map((f) => [f.path, `${canonicalize(f.value)}\n`]));
  const list = [['/search.json bytes', emitted.get('/search.json') === expected.output,
    JSON.stringify(emitted.get('/search.json'))]];
  const paths = [...emitted.keys()].filter((p) => p !== '/search.json');
  list.push(['shard paths', deepEqual(paths, expected.shards.map((s) => s.path)), JSON.stringify(paths)]);
  for (const want of expected.shards) {
    const bytes = emitted.get(want.path);
    const docs = bytes === undefined ? [] : JSON.parse(bytes).docs;
    list.push([`${want.path} docs_count`, docs.length === want.docs_count, `${docs.length}`]);
    list.push([`${want.path} first_slug`, (docs[0] || {}).slug === want.first_slug, JSON.stringify(docs[0])]);
    list.push([`${want.path} last_slug`, (docs[docs.length - 1] || {}).slug === want.last_slug,
      JSON.stringify(docs[docs.length - 1])]);
    if (want.output !== undefined) list.push([`${want.path} bytes`, bytes === want.output, JSON.stringify(bytes)]);
  }
  return checks(list);
}

/**
 * build-0013 — AGSC-06-36: the whole content of
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
 * build-0014 (AGSC-04-25) — the content version, case by case.
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
      const derived = ledger.derive(input.git_log, 'f'.repeat(40), '1.0.0',
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
  list.push(['every text file ends with exactly one LF',
    (bad.length === 0) === vector.expected.every_text_file_ends_with_exactly_one_lf, JSON.stringify(bad)]);
  list.push(['no byte-order mark', (bom.length === 0) === vector.expected.no_byte_order_mark, JSON.stringify(bom)]);
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
  if (vector.expected.no_error_finding !== undefined) {
    list.push(['no_error_finding', first.findings.every((f) => f.severity !== 'error') === vector.expected.no_error_finding,
      JSON.stringify(first.findings.filter((f) => f.severity === 'error').map((f) => `${f.code} ${f.message}`))]);
  }
  for (const route of vector.expected.includes_routes || []) list.push([`emits ${route}`, first.files.has(route), routesA.filter((r) => r.startsWith('/assets/')).join(' ')]);
  return checks(list);
}

const HANDLERS = {
  'build-0011': fragmentIndexCase,
  'build-0013': securityTxtCase,
  'build-0014': contentVersionCase,
  'build-0015': trailingLfCase,
  'build-0016': staleCase,
  'build-0017': reproducibleAssetsCase,
  'build-0018': servedHeadersCase,
  'build-0019': shardedSearchCase,
  // The cases over the files a whole build writes (_build-surfaces.js).
  ...surfaces.HANDLERS,
  // The search-tokenizer cases (AGSC-06-16/06-23).
  'build-0001': searchCase,
  'build-0002': searchCase,
  'build-0003': searchCase,
};

// Guarded: a pass that left a member of `expected` unread is a fail (_expected-reads.js).
module.exports.run = guarded((vector, ctx) => {
  const handler = HANDLERS[vector.id];
  if (handler === undefined) return { status: 'fail', detail: `${vector.id}: no handler in area build` };
  return handler(vector, ctx);
});
