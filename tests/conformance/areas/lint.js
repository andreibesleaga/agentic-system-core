'use strict';
// Conformance area `lint` (owner C) — AGSC-08-13 (the injection scan), AGSC-01-34
// and AGSC-02-98 (attachments and the SVG allow-list), AGSC-04-23 (the combining
// bound), AGSC-01-35 (the relative-path grammar) and AGSC-02-96 (ports).
//
// Each vector states one lint, so each handler runs that lint and nothing else:
// a vector that says `findings: []` is stating that ITS lint is silent, not that
// a whole Bundle is clean (an item stating only the keys under test necessarily
// warns elsewhere — AGSC-09-04's `items[]` convention).

const frontmatter = require('../../../src/knowledge/frontmatter.js');
const validate = require('../../../src/knowledge/validate.js');
const linksModule = require('../../../src/knowledge/links.js');
const lint = require('../../../src/governance/lint.js');
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

module.exports.run = (vector, ctx) => {
  const { input } = vector;
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
