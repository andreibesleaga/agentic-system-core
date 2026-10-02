'use strict';
// Conformance area `lint` — AGSC-08-13 (the injection scan), AGSC-01-34
// and AGSC-02-98 (attachments and the SVG allow-list), AGSC-04-23 (the combining
// bound), AGSC-01-35 (the relative-path grammar) and AGSC-02-96 (ports).
//
// Each vector states one lint, so each handler runs that lint and nothing else:
// a vector that says `findings: []` is stating that ITS lint is silent, not that
// a whole Bundle is clean (an item stating only the keys under test necessarily
// warns elsewhere — AGSC-09-04's `items[]` convention).

const fs = require('node:fs');
const path = require('node:path');

const frontmatter = require('../../../src/knowledge/frontmatter.js');
const validate = require('../../../src/knowledge/validate.js');
const linksModule = require('../../../src/knowledge/links.js');
const lint = require('../../../src/governance/lint.js');
const fix = require('../../../src/governance/fix.js');
const exportBundle = require('../../../src/interchange/export-bundle.js');
const { deepEqual, findingsMatch, checks } = require('./_assert.js');

const INJECTION_CODES = ['AGSC-E401', 'AGSC-E402'];

function assertFindings(list, expected, actual) {
  if (Array.isArray(expected.findings)) {
    if (expected.findings.length === 0) {
      list.push(['findings', actual.length === 0, JSON.stringify(actual.map((f) => f.code))]);
    } else {
      const m = findingsMatch(expected.findings, actual);
      list.push(['findings', m.ok, m.detail]);
    }
  }
  if (typeof expected.error === 'string') {
    list.push(['error', actual.some((f) => f.code === expected.error),
      JSON.stringify(actual.map((f) => f.code))]);
  }
  if (typeof expected.severity === 'string') {
    const hit = actual.find((f) => f.code === expected.error) || actual[0];
    list.push(['severity', hit !== undefined && hit.severity === expected.severity,
      JSON.stringify(hit)]);
  }
}

function assertClean(list, expected, clean) {
  if (!Array.isArray(expected.clean)) return;
  list.push(['clean', deepEqual(clean, expected.clean), JSON.stringify(clean)]);
}

/** lint-0001…0003: the AGSC-08-13 injection scan over one item. */
function runInjection(vector, ctx) {
  const item = frontmatter.parseItem(vector.input.markdown, {
    schemas: ctx.schemas,
    path: 'content/concepts/router.md',
  });
  const all = lint.lint({ items: [item], config: vector.input.config || {} });
  const actual = all.filter((f) => INJECTION_CODES.includes(f.code));
  const list = [];
  assertFindings(list, vector.expected, actual);
  return checks(list);
}

/** lint-0020, lint-0021: AGSC-02-98 and AGSC-01-34 over a Bundle's attachments. */
function runAttachments(vector) {
  const result = lint.checkAttachments(vector.input.items, {
    attachmentBytes: vector.input.attachment_bytes,
    filesPresent: vector.input.files_present,
    config: vector.input.config,
  });
  const list = [];
  assertFindings(list, vector.expected, result.findings);
  assertClean(list, vector.expected, result.clean);
  return checks(list);
}

/** lint-0022: the AGSC-04-23 combining bound. */
function runCombining(vector) {
  const result = lint.checkCombiningBound(vector.input.files);
  const list = [];
  assertFindings(list, vector.expected, result.findings);
  assertClean(list, vector.expected, result.clean);
  return checks(list);
}

/** lint-0023: the AGSC-01-35 relative-path grammar. */
function runPaths(vector) {
  const result = lint.checkPaths(vector.input.paths);
  const list = [];
  assertFindings(list, vector.expected, result.findings);
  assertClean(list, vector.expected, result.clean);
  return checks(list);
}

/** lint-0024: the AGSC-02-98 SVG allow-list. */
function runSvg(vector) {
  const result = lint.checkSvg(vector.input.svgs);
  const list = [];
  assertFindings(list, vector.expected, result.findings);
  assertClean(list, vector.expected, result.clean);
  return checks(list);
}

/**
 * lint-0025: AGSC-02-96 ports. The schema fault on the malformed port name is
 * AGSC-E204 and comes from knowledge/validate.js under the §9.4 precedence rule;
 * the unmatched-port warning is this module's AGSC-E804. Both are asserted here,
 * which is exactly the split the vector states.
 */
function runPorts(vector, ctx) {
  const schemaFindings = [];
  for (const raw of vector.input.items) {
    const v = linksModule.view(raw);
    for (const f of validate.item(v.fm, { schemas: ctx.schemas, file: v.path, slug: v.slug })) {
      schemaFindings.push({ ...f, path: f.file });
    }
  }
  const ports = lint.checkPorts(vector.input.items);
  const list = [];
  assertFindings(list, vector.expected, [...schemaFindings, ...ports.findings]);
  if (Array.isArray(vector.expected.matched)) {
    list.push(['matched', deepEqual(ports.matched, vector.expected.matched),
      JSON.stringify(ports.matched)]);
  }
  return checks(list);
}

/**
 * lint-0026 — AGSC-04-19: the YAML profile
 * `lint --fix` emits, applied twice.
 *
 * `governance/fix.js` is pure and takes the raw `schema/item.schema.json` object,
 * which fixes the key order; it is read from the ENGINE root the runner supplies,
 * never from `process.cwd()` (AGSC-04-03). The vector states one file's bytes, so
 * the `typeOfSlug` map of AGSC-03-12 is empty: there is no second item to link to.
 */
function runFix(vector, ctx) {
  const root = (ctx && ctx.root) || '.';
  const itemSchema = JSON.parse(fs.readFileSync(path.join(root, 'schema', 'item.schema.json'), 'utf8'));
  const item = { path: vector.input.file, slug: 'router', type: 'concept' };
  const once = fix.fixItem(item, { itemSchema, source: vector.input.bytes, typeOfSlug: new Map() });
  const twice = fix.fixItem(item, { itemSchema, source: once.after, typeOfSlug: new Map() });
  const list = [];
  list.push(['output', once.after === vector.expected.output, `got ${JSON.stringify(once.after)}`]);
  if (vector.expected.twice !== undefined) {
    list.push(['twice', twice.after === vector.expected.twice, `got ${JSON.stringify(twice.after)}`]);
  }
  if (vector.expected.idempotent === true) {
    list.push(['idempotent', twice.changed === false && twice.after === once.after,
      `a second --fix changed the file: ${JSON.stringify(twice.changes)}`]);
  }
  // AGSC-04-19: the encoding third reports AGSC-E108,
  // every other normalisation AGSC-E506, and both are warnings — so `--fix` never
  // moves an exit code by itself.
  const codes = new Set(once.findings.map((f) => f.code));
  for (const code of codes) {
    list.push([`code ${code}`, code === 'AGSC-E108' || code === 'AGSC-E506',
      'lint --fix reports only AGSC-E108 and AGSC-E506 (AGSC-04-19)']);
  }
  list.push(['severity', once.findings.every((f) => f.severity === 'warn'),
    JSON.stringify(once.findings)]);
  return checks(list);
}

/**
 * lint-0027 (AGSC-00-21 / AGSC-00-22) — a name this specification
 * RESERVES to 1.1 (`weights`) beside a vendor key (`x-acme-note`): a 1.0 engine
 * must not fail on either, must warn about exactly one of them, and must give both
 * back unchanged through every path that claims to preserve.
 *
 * The fixture states `kind: principle`, so the whole item lints with
 * warnings only and `exit: 0` / `status: "pass"` hold over the whole invocation,
 * with no reading; the round trips are asserted over the whole file, byte for byte.
 */
function runReservedMembers(vector, ctx) {
  const root = (ctx && ctx.root) || '.';
  const itemSchema = JSON.parse(fs.readFileSync(path.join(root, 'schema', 'item.schema.json'), 'utf8'));
  const item = { path: 'content/concepts/router.md', slug: 'router', type: 'concept' };
  const list = [];
  const byName = new Map((vector.expected.cases || []).map((c) => [c.name, c]));

  // (1) `lint`.
  const want = byName.get('lint-warns-once');
  const parsed = frontmatter.parseItem(vector.input.markdown, { schemas: ctx.schemas });
  const findings = validate.item(parsed.frontmatter || {},
    { file: item.path, schemas: ctx.schemas, slug: item.slug });
  const aboutKeys = findings.filter((f) => f.key !== undefined
    || /weights|x-acme-note/u.test(String(f.message)));
  const matched = findingsMatch(want.findings || [], aboutKeys);
  list.push(['lint findings about the two keys', matched.ok, matched.detail]);
  list.push(['exactly one', aboutKeys.length === (want.findings || []).length,
    JSON.stringify(aboutKeys.map((f) => [f.code, f.key]))]);
  for (const quiet of want.no_finding_for || []) {
    list.push([`no finding for ${quiet}`,
      !findings.some((f) => f.key === quiet || String(f.message).includes(quiet)),
      JSON.stringify(findings.map((f) => f.message))]);
  }
  // A warning is not a failed gate (AGSC-09-08), so `build` succeeds.
  list.push(['warnings only, so exit 0 and status pass',
    findings.every((f) => f.severity === 'warn') && want.exit === 0 && want.status === 'pass',
    JSON.stringify(findings)]);

  // (2) `lint --fix` — the emitted key order of AGSC-04-19, and the reserved value
  // reproduced exactly as authored, indentation included (AGSC-04-20).
  const fixed = fix.fixItem(item, { itemSchema, source: vector.input.markdown, typeOfSlug: new Map() });
  const fixCase = byName.get('fix-preserves');
  list.push(['fix output', fixed.after === fixCase.output, JSON.stringify(fixed.after)]);
  const again = fix.fixItem(item, { itemSchema, source: fixed.after, typeOfSlug: new Map() });
  list.push(['fix idempotent', again.after === fixed.after, JSON.stringify(again.after)]);
  list.push(['fix is warnings only', fixed.findings.every((f) => f.severity === 'warn'),
    JSON.stringify(fixed.findings)]);

  // (3) `export --markdown` — AGSC-00-22's round trip: the exported item file is
  // byte-for-byte the file of case (2). The export writes the lint-normalised
  // Bundle itself, so it is run through the real planner over the one item.
  const exportCase = byName.get('export-markdown-round-trip');
  const planned = exportBundle.plan({
    config: {},
    items: [{ ...item, body: parsed.body, frontmatter: parsed.frontmatter }],
  }, { itemSchema, sources: { [item.path]: vector.input.markdown } });
  const exported = (planned.files.find((f) => f.path === item.path) || {}).text;
  list.push(['export --markdown output', exported === exportCase.output, JSON.stringify(exported)]);
  list.push(['the two round trips agree', exported === fixed.after, JSON.stringify(exported)]);
  return checks(list);
}

/** lint-0030 (AGSC-05-05): an authored `iri` must be the computed one, else AGSC-E204. */
function runIriCases(vector) {
  const base = ((vector.input.config || {}).site || {}).base;
  const byName = new Map((vector.expected.cases || []).map((c) => [c.name, c]));
  const list = [];
  for (const input of vector.input.cases || []) {
    const want = byName.get(input.name);
    const findings = validate.itemIri(input.path, input.frontmatter, base);
    if (want.error !== undefined) {
      list.push([`${input.name} code`, findings.some((f) => f.code === want.error), JSON.stringify(findings.map((f) => f.code))]);
    } else {
      list.push([`${input.name} valid`, findings.length === 0, JSON.stringify(findings.map((f) => f.code))]);
    }
  }
  return checks(list);
}

/**
 * lint-0031 (AGSC-01-21): the 2–5 tag count is the warning AGSC-E213 and nothing
 * else changes. The item is a conforming concept whose only variable is `tags`,
 * validated through the same `validate.item` the lint lane runs.
 */
function runTagCountCases(vector, ctx) {
  const byName = new Map((vector.expected.cases || []).map((c) => [c.name, c]));
  const list = [];
  for (const input of vector.input.cases || []) {
    const want = byName.get(input.name);
    const fm = {
      type: 'concept', kind: 'principle', title: 'Router',
      description: 'A routing concept whose tag count is the only variable of this case, held here for lint-0031.',
      tags: input.tags, prov: { origin: 'human', operator: 'human:tester' },
    };
    const findings = validate.item(fm, { schemas: ctx.schemas, file: 'content/concepts/router.md', slug: 'router' });
    const m = findingsMatch((want.findings || []).map((f) => ({ code: f.code, severity: f.severity })), findings);
    list.push([`${input.name} findings`, m.ok && findings.length === (want.findings || []).length,
      `${m.detail} ${JSON.stringify(findings.map((f) => f.code))}`]);
  }
  return checks(list);
}

/**
 * lint-0032, lint-0033: the minimum shapes of AGSC-08-15 (`no-secrets`) and AGSC-08-16
 * (`no-pii`), each string the concatenation of its `parts`, checked alone; `code` is the
 * code reported, or null.
 */
function runShapes(vector) {
  const module = vector.input.check === 'no-secrets'
    ? require('../../../src/governance/secrets.js')
    : require('../../../src/governance/pii.js');
  const want = new Map(vector.expected.cases.map((c) => [c.name, c.code]));
  const list = [];
  for (const { name, parts } of vector.input.strings) {
    const text = parts.join('');
    const codes = [...new Set(module.check({ text }).map((f) => f.code))];
    const expected = want.get(name);
    list.push([name, expected === null ? codes.length === 0 : codes.length === 1 && codes[0] === expected, JSON.stringify(codes)]);
  }
  list.push(['every string has an expectation', vector.input.strings.every((s) => want.has(s.name)), '']);
  return checks(list);
}

module.exports.run = (vector, ctx) => {
  const { input } = vector;
  if (vector.id === 'lint-0027') return runReservedMembers(vector, ctx);
  if (vector.id === 'lint-0030') return runIriCases(vector);
  if (vector.id === 'lint-0031') return runTagCountCases(vector, ctx);
  if (input.check === 'no-secrets' || input.check === 'no-pii') return runShapes(vector);
  if (typeof input.bytes === 'string' && typeof input.file === 'string') return runFix(vector, ctx);
  if (typeof input.markdown === 'string') return runInjection(vector, ctx);
  if (input.svgs !== undefined) return runSvg(vector);
  if (Array.isArray(input.paths)) return runPaths(vector);
  if (Array.isArray(input.files)) return runCombining(vector);
  if (Array.isArray(input.items) && (input.attachment_bytes !== undefined || input.files_present !== undefined)) {
    return runAttachments(vector);
  }
  if (Array.isArray(input.items)) return runPorts(vector, ctx);
  return { status: 'fail', detail: `no handler for this input shape in area lint (${vector.id})` };
};
