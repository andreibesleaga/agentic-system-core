'use strict';
// The `init` → `ci` cases of area `adopt` (owner:): adopt-0006 (superseding
// adopt-0004, which is withdrawn and never runs) and adopt-0005. Kept beside `areas/adopt.js` rather than inside it, so that A's
// handler for adopt-0001…0003 is not rewritten (WAVE2-NOTES): `adopt.js` delegates
// here when a vector carries `input.verbs`.
//
// AGSC-02-92 is the whole point of both cases: adoption produces WARNINGS only, so
// `ci` on a bare folder exits 0 offline — step two of PRD-053's three-command promise.

const init = require('../../../src/distribution/init.js');
const validate = require('../../../src/knowledge/validate.js');
const { deepEqual, findingsMatch, checks } = require('./_assert.js');

/** The `ci` lane this case needs: validate the Bundle `init` just synthesized. */
function validateBundle(planned, ctx) {
  const findings = [...planned.findings];
  if (planned.config !== null) {
    findings.push(...validate.config(planned.config, { schemas: ctx.schemas, file: 'agsc.config.json' }));
  }
  if (planned.indexFrontmatter !== null) {
    findings.push(...validate.index(planned.indexFrontmatter, { schemas: ctx.schemas, file: 'content/index.md' }));
  }
  for (const item of planned.items) {
    findings.push(...validate.item(item, { schemas: ctx.schemas, file: item.path, slug: item.slug }));
    findings.push(...validate.placement(item.path, item));
  }
  const errors = findings.filter((f) => f.severity !== 'warn');
  return { findings, errors, exit: errors.length > 0 ? 1 : 0 };
}

module.exports.run = (vector, ctx) => {
  const { input, expected } = vector;
  const planned = init.plan(input.files, {
    directory: input.directory,
    gitUserEmail: input.git_user_email,
    specVersion: vector.options.spec_version,
    epoch: vector.options.source_date_epoch,
    // AGSC-02-94(a) as amended 2026-09-25: `init` writes its starting crawler list
    // whenever the synthesized configuration adopts the Content Use Terms, which a
    // bare folder always does — the same list the verb passes (`verbs/init.js`).
    tdmCrawlers: init.REFERENCE_TDM_CRAWLERS,
  });
  const ran = validateBundle(planned, ctx);
  const list = [];

  if (expected.config !== undefined) {
    list.push(['agsc.config.json', deepEqual(planned.config, expected.config), JSON.stringify(planned.config)]);
  }
  if (expected.index_frontmatter !== undefined) {
    list.push(['content/index.md frontmatter', deepEqual(planned.indexFrontmatter, expected.index_frontmatter),
      JSON.stringify(planned.indexFrontmatter)]);
  }
  if (expected.config_valid !== undefined) {
    const errors = validate.config(planned.config, { schemas: ctx.schemas, file: 'agsc.config.json' })
      .filter((f) => f.severity !== 'warn');
    list.push(['config validates', (errors.length === 0) === expected.config_valid,
      JSON.stringify(errors.map((f) => `${f.code} ${f.message}`))]);
  }
  if (expected.index_valid !== undefined) {
    const errors = validate.index(planned.indexFrontmatter, { schemas: ctx.schemas, file: 'content/index.md' })
      .filter((f) => f.severity !== 'warn');
    list.push(['index validates', (errors.length === 0) === expected.index_valid,
      JSON.stringify(errors.map((f) => `${f.code} ${f.message}`))]);
  }
  if (expected.exit !== undefined) {
    list.push(['exit code', ran.exit === expected.exit,
      `${ran.exit}; errors ${JSON.stringify(ran.errors.map((f) => `${f.code} ${f.file} ${f.message}`))}`]);
  }
  if (Array.isArray(expected.findings)) {
    const m = findingsMatch(expected.findings, ran.findings);
    list.push(['findings', m.ok, m.detail]);
  }
  if (expected.assets_copied !== undefined) {
    const copied = planned.copies.map((c) => c.to).sort();
    list.push(['assets copied', deepEqual(copied, [...expected.assets_copied].sort()), JSON.stringify(copied)]);
  }
  if (expected.body_bytes_unchanged === true) {
    const ok = planned.items.every((item) => {
      const source = input.files.find((f) => f.markdown != null
        && String(f.path).endsWith(`${item.slug}.md`));
      return source === undefined || item.body === source.markdown;
    });
    list.push(['body bytes unchanged', ok, 'an adopted body was rewritten (AGSC-02-90)']);
  }
  if (Array.isArray(expected.not_reported)) {
    const reported = ran.findings.filter((f) => f.code === 'AGSC-E507').map((f) => f.reference);
    list.push(['references left alone', expected.not_reported.every((r) => !reported.includes(r)),
      JSON.stringify(reported)]);
  }

  return checks(list);
};
