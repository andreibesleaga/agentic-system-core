'use strict';
// Conformance area `adopt` — AGSC-02-90, AGSC-02-91,
// AGSC-02-92. adopt-0006 (`init` then `ci`) and adopt-0005 (relative references,
// AGSC-02-95) are the build pipeline's cases and are handled.

const adopt = require('../../../src/knowledge/adopt.js');
const frontmatter = require('../../../src/knowledge/frontmatter.js');
const validate = require('../../../src/knowledge/validate.js');
const initVerbs = require('./_init-verbs.js');
const { deepEqual, findingsMatch, checks } = require('./_assert.js');

module.exports.run = (vector, ctx) => {
  const { input, expected } = vector;

  // --- EXTENSION POINT -------------------------------------------
  // A vector that names verbs runs the `init` → `ci` pipeline of
  // `distribution/init.js`; adopt-0006 and adopt-0005 are the only two live ones.
  if (Array.isArray(input.verbs)) return initVerbs.run(vector, ctx);
  // --- end EXTENSION POINT --------------------------------------------------

  // adopt-0003: an already-adopted item must VALIDATE, with warnings only.
  if (typeof input.markdown === 'string') {
    const item = frontmatter.parseItem(input.markdown, { schemas: ctx.schemas });
    const errors = item.findings.filter((f) => f.severity === 'error');
    const list = [];
    if (Array.isArray(expected.errors)) {
      list.push(['errors', errors.length === expected.errors.length, JSON.stringify(errors.map((f) => f.code))]);
    }
    if (expected.valid === true) list.push(['valid', errors.length === 0, JSON.stringify(errors.map((f) => f.code))]);
    if (Array.isArray(expected.findings)) {
      const m = findingsMatch(expected.findings, item.findings);
      list.push(['findings', m.ok, m.detail]);
    }
    return checks(list);
  }

  if (!Array.isArray(input.files)) {
    return { status: 'fail', detail: 'no handler for this input shape in area adopt' };
  }

  const result = adopt.adopt(input.files, { config: input.config, gitUserEmail: input.git_user_email });
  const byPath = new Map(result.files.map((f) => [f.path, f]));
  const list = [];

  if (Array.isArray(expected.files)) {
    for (const want of expected.files) {
      const got = byPath.get(want.path);
      if (!got) {
        list.push([`file ${want.path}`, false, `not produced; got ${[...byPath.keys()].join(', ')}`]);
        continue;
      }
      if (want.output !== undefined) list.push([`${want.path} output`, got.output === want.output, JSON.stringify(got.output)]);
      if (want.changed !== undefined) list.push([`${want.path} changed`, got.changed === want.changed, String(got.changed)]);
    }
  } else {
    const first = result.files[0];
    if (expected.output !== undefined) list.push(['output', first.output === expected.output, JSON.stringify(first.output)]);
    if (expected.path !== undefined) list.push(['path', first.path === expected.path, first.path]);
    if (expected.body !== undefined) list.push(['body', first.body === expected.body, JSON.stringify(first.body)]);
    if (expected.frontmatter !== undefined) {
      list.push(['frontmatter', deepEqual(first.frontmatter, expected.frontmatter), JSON.stringify(first.frontmatter)]);
      // AGSC-02-92: whatever adoption synthesizes MUST validate.
      const findings = validate.item(first.frontmatter, { schemas: ctx.schemas });
      list.push(['adopted item validates', findings.every((f) => f.severity === 'warn'),
        JSON.stringify(findings.filter((f) => f.severity === 'error').map((f) => f.code))]);
    }
  }
  if (Array.isArray(expected.findings)) {
    const m = findingsMatch(expected.findings, result.findings);
    list.push(['findings', m.ok, m.detail]);
  }
  if (expected.idempotent === true) {
    const again = adopt.adopt(result.files.map((f) => ({ path: f.path, markdown: f.output })),
      { config: input.config, gitUserEmail: input.git_user_email });
    const outputs = new Map(result.files.map((f) => [f.path, f.output]));
    list.push(['idempotent',
      again.files.every((f) => f.output === outputs.get(f.path) && f.changed === false),
      'a second adoption changed the bytes']);
  }
  return checks(list);
};
