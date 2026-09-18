'use strict';
// Conformance area `frontmatter` (owner A for `fm-*`) — AGSC-02-01…06, AGSC-02-14,
// AGSC-02-18, AGSC-02-05a, AGSC-02-91 and AGSC-08-01.
//
// Ids `frontmatter-0030` (length units, AGSC-02-24) and `frontmatter-0031`
// (`task_state`, AGSC-02-99) belong to the links/lint package and are listed in
// tests/conformance/pending.json until their owner adds a handler in the clearly
// marked block at the bottom of this file.

const frontmatter = require('../../../src/knowledge/frontmatter.js');
const validate = require('../../../src/knowledge/validate.js');
const adopt = require('../../../src/knowledge/adopt.js');
const { deepEqual, findingsMatch, checks } = require('./_assert.js');

/** fm-0008: the adoption case that lives in this area rather than in `adopt/`. */
function runAdoption(vector) {
  const result = adopt.adopt(vector.input.files, { config: vector.input.config });
  const first = result.files[0];
  const list = [];
  if (vector.expected.output !== undefined) {
    list.push(['output', first.output === vector.expected.output, JSON.stringify(first.output)]);
  }
  if (vector.expected.path !== undefined) {
    list.push(['path', first.path === vector.expected.path, first.path]);
  }
  if (Array.isArray(vector.expected.findings)) {
    const m = findingsMatch(vector.expected.findings, first.findings);
    list.push(['findings', m.ok, m.detail]);
  }
  if (vector.expected.idempotent === true) {
    const again = adopt.adopt(result.files.map((f) => ({ path: f.path, markdown: f.output })),
      { config: vector.input.config });
    const byPath = new Map(result.files.map((f) => [f.path, f.output]));
    list.push(['idempotent',
      again.files.every((f) => f.output === byPath.get(f.path) && f.changed === false),
      'a second adoption changed the bytes']);
  }
  return checks(list);
}

/** fm-0009: a pre-parsed frontmatter object; `slug` is the harness id, not a key. */
function runPreParsed(vector, ctx) {
  const { slug, ...fm } = vector.input.frontmatter;
  const findings = validate.item(fm, { schemas: ctx.schemas, slug });
  const keys = validate.unknownKeys(fm, { schemas: ctx.schemas });
  const preserved = {};
  for (const k of [...keys.vendor, ...keys.unknown, ...keys.malformed].sort()) preserved[k] = fm[k];
  const list = [];
  if (vector.expected.preserved !== undefined) {
    list.push(['preserved', deepEqual(preserved, vector.expected.preserved), JSON.stringify(preserved)]);
  }
  if (Array.isArray(vector.expected.findings)) {
    const m = findingsMatch(vector.expected.findings, findings);
    list.push(['findings', m.ok, m.detail]);
    // AGSC-02-05a: the reserved vendor key never raises AGSC-E207.
    const warned = new Set(findings.filter((f) => f.code === 'AGSC-E207').map((f) => f.key));
    list.push(['vendor-not-warned', keys.vendor.every((k) => !warned.has(k)),
      `AGSC-E207 raised for a reserved x- key: ${[...warned].join(', ')}`]);
  }
  if (vector.expected.valid === true) {
    // The case states only the keys under test (AGSC-09-04 `items[]` convention), so
    // "valid" means no error is attributable to a key it preserves.
    const blamed = findings.filter((f) => f.severity === 'error'
      && f.key != null && Object.prototype.hasOwnProperty.call(preserved, f.key));
    list.push(['valid', blamed.length === 0, JSON.stringify(blamed.map((f) => f.code))]);
  }
  return checks(list);
}

module.exports.run = (vector, ctx) => {
  const { input, expected } = vector;
  if (Array.isArray(input.files)) return runAdoption(vector);
  if (input.frontmatter !== undefined) return runPreParsed(vector, ctx);
  if (typeof input.markdown === 'string') {
    const item = frontmatter.parseItem(input.markdown, { schemas: ctx.schemas });
    const errors = item.findings.filter((f) => f.severity === 'error');
    const warnings = item.findings.filter((f) => f.severity === 'warn');
    const list = [];
    if (typeof expected.error === 'string') {
      list.push(['error', errors.length > 0 && errors[0].code === expected.error,
        JSON.stringify(errors.map((f) => f.code))]);
      if (typeof expected.line === 'number') {
        list.push(['line', errors.length > 0 && errors[0].line === expected.line,
          `got line ${errors.length > 0 ? errors[0].line : 'none'}`]);
      }
    }
    if (Array.isArray(expected.errors)) {
      list.push(['errors', errors.length === expected.errors.length,
        JSON.stringify(errors.map((f) => f.code))]);
    }
    if (expected.frontmatter !== undefined) {
      list.push(['frontmatter', deepEqual(item.frontmatter, expected.frontmatter),
        JSON.stringify(item.frontmatter)]);
    }
    if (Array.isArray(expected.warnings)) {
      const m = findingsMatch(expected.warnings, warnings);
      list.push(['warnings', m.ok, m.detail]);
    }
    if (Array.isArray(expected.findings)) {
      const m = findingsMatch(expected.findings, item.findings);
      list.push(['findings', m.ok, m.detail]);
    }
    return checks(list);
  }
  // ---------------------------------------------------------------------------
  // EXTENSION POINT — `frontmatter-0030` (AGSC-02-24) and `frontmatter-0031`
  // (AGSC-02-99) are owned by the links/lint package (C, WP-10-C). Added
  // 2026-09-18; nothing above this line was changed.
  // ---------------------------------------------------------------------------
  {
    // The two cases state only the keys under test, so each one is validated
    // inside the smallest frontmatter that is otherwise conformant; every
    // Finding the handler reads is attributable to the key the vector names.
    const prov = require('../../../src/governance/prov.js');
    const OPERATOR = 'human:tester';
    const DESCRIPTION = 'A concept used as a fixture for the frontmatter length and task-state vectors.';

    // frontmatter-0030 — AGSC-02-24: `minLength`/`maxLength` count Unicode code
    // points, so a 120-code-point astral title is valid and 121 is AGSC-E204.
    if (Array.isArray(input.items) && input.items.every((i) => typeof i.title === 'string')) {
      const actual = input.items.map((i) => {
        const findings = validate.item({
          type: 'concept',
          kind: 'explainer',
          title: i.title,
          description: DESCRIPTION,
          prov: { origin: 'human', operator: OPERATOR },
        }, { schemas: ctx.schemas, slug: i.slug });
        const blamed = findings.filter((f) => f.severity === 'error' && f.message.startsWith('/title:'));
        const row = {
          code_points: validate.codePointLength(i.title),
          slug: i.slug,
          valid: blamed.length === 0,
        };
        if (blamed.length > 0) row.code = blamed[0].code;
        return row;
      });
      const list = (expected.results || []).map((want) => {
        const got = actual.find((r) => r.slug === want.slug);
        return [`result ${want.slug}`, got !== undefined && deepEqual(
          Object.fromEntries(Object.keys(want).map((k) => [k, got[k]])), want), JSON.stringify(got)];
      });
      return checks(list);
    }

    // frontmatter-0031 — AGSC-02-99: the nine A2A task states verbatim, default
    // TASK_STATE_UNSPECIFIED; an unknown value is AGSC-E203 in the node's own
    // frontmatter and AGSC-11-02's UNSPECIFIED when read from a foreign board.
    if (Array.isArray(input.own_items)) {
      const actual = input.own_items.map((i) => {
        const fm = {
          type: 'concept',
          kind: 'task',
          title: `Task ${i.slug}`,
          description: DESCRIPTION,
          prov: { origin: 'human', operator: OPERATOR },
        };
        if (i.task_state !== undefined) fm.task_state = i.task_state;
        const findings = validate.item(fm, { schemas: ctx.schemas, slug: i.slug });
        const enumFault = findings.find((f) => f.code === 'AGSC-E203');
        if (enumFault !== undefined) return { code: 'AGSC-E203', slug: i.slug };
        return {
          slug: i.slug,
          state: i.task_state === undefined ? 'TASK_STATE_UNSPECIFIED' : i.task_state,
        };
      });
      const list = (expected.results || []).map((want) => {
        const got = actual.find((r) => r.slug === want.slug);
        return [`result ${want.slug}`, got !== undefined && deepEqual(got, want), JSON.stringify(got)];
      });
      if (expected.foreign_read_as !== undefined) {
        const read = prov.readForeignTaskState(input.foreign_board_state);
        list.push(['foreign_read_as', read === expected.foreign_read_as, read]);
      }
      return checks(list);
    }
  }
  return { status: 'fail', detail: 'no handler for this input shape in area frontmatter' };
};
