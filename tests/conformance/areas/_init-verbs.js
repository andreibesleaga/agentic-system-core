'use strict';
// The `init` → `ci` cases of area `adopt`: adopt-0005, adopt-0007 and adopt-0008. Kept
// beside `areas/adopt.js` rather than inside it, so that the handler for
// adopt-0001…0003 stays as it is: `adopt.js` delegates here when a vector carries
// `input.verbs`.
//
// AGSC-02-92 is the whole point of both cases: adoption produces WARNINGS only, so
// `ci` on a bare folder exits 0 offline — step two of PRD-053's three-command promise.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const init = require('../../../src/distribution/init.js');
const validate = require('../../../src/knowledge/validate.js');
const { main } = require('../../../src/application/cli/main.js');
const { createFileSystem } = require('../../../src/adapters/node-fs.js');
const { captureStream } = require('./_shared.js');
const { deepEqual, findingsMatch, checks } = require('./_assert.js');

/**
 * A case that states `after_init` runs the REAL verbs (adopt-0007, adopt-0008): the
 * engine's own `init`, then the files the publisher adds, then the engine's own
 * `ci --json`, in a scratch folder named `input.directory`. The only stand-in is the
 * ProcessRunner, which answers `git config --get user.email` with the case's
 * `git_user_email` and refuses every other command, so the run depends on no git
 * checkout. This replaced, for 1.0.0, the schema check below that let adopt-0006
 * pass although the real `ci` refused the folder (AGSC-02-94 as amended 2026-10-02).
 */
function runVerbs(vector) {
  const { input, expected } = vector;
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-adopt-'));
  try {
    const root = path.join(scratch, String(input.directory));
    for (const f of input.files) {
      const file = path.join(root, f.path);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, f.binary === true ? Buffer.from([0x89, 0x50, 0x4e, 0x47]) : f.markdown);
    }
    const proc = {
      run(cmd, args) {
        if (cmd === 'git' && args.join(' ') === 'config --get user.email') return { code: 0, stderr: '', stdout: `${input.git_user_email}\n` };
        return { code: 1, stderr: 'not available in a conformance run', stdout: '' };
      },
    };
    const run = (argv) => {
      const stdout = captureStream();
      const stderr = captureStream();
      const exit = main(argv, {
        env: { SOURCE_DATE_EPOCH: String(vector.options.source_date_epoch) },
        ports: { fs: createFileSystem(root), proc },
        root,
        specVersion: vector.options.spec_version,
        stderr,
        stdout,
      });
      return { exit, stdout: stdout.text() };
    };
    const ran = { init: run(['init', '--json']) };
    let initEnvelope = { findings: [] };
    try { initEnvelope = JSON.parse(ran.init.stdout); } catch { /* reported below */ }
    for (const f of input.after_init) {
      const file = path.join(root, f.path);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, f.text);
    }
    ran.ci = run(['ci', '--json']);
    let envelope = { findings: [] };
    try { envelope = JSON.parse(ran.ci.stdout); } catch { /* reported below */ }
    const list = [['init exit code', ran.init.exit === 0, String(ran.init.exit)]];
    if (expected.exit !== undefined) list.push(['ci exit code', ran.ci.exit === expected.exit, `${ran.ci.exit}: ${ran.ci.stdout.slice(0, 400)}`]);
    if (Array.isArray(expected.findings)) {
      const m = findingsMatch(expected.findings, envelope.findings);
      list.push(['findings', m.ok, m.detail]);
    }
    if (Array.isArray(expected.init_findings)) {
      const m = findingsMatch(expected.init_findings, initEnvelope.findings);
      list.push(['init findings', m.ok, m.detail]);
    }
    if (Array.isArray(expected.init_not_reported)) {
      const reported = initEnvelope.findings.filter((f) => f.code === 'AGSC-E507').map((f) => f.reference);
      list.push(['references left alone', expected.init_not_reported.every((r) => !reported.includes(r)), JSON.stringify(reported)]);
    }
    if (Array.isArray(expected.assets_copied)) {
      const missing = expected.assets_copied.filter((p) => !fs.existsSync(path.join(root, p)));
      list.push(['assets copied', missing.length === 0, `missing ${JSON.stringify(missing)}`]);
    }
    if (expected.body_bytes_unchanged === true) {
      const changed = input.files.filter((f) => f.markdown != null).filter((f) => {
        const adopted = path.join(root, 'content', 'concepts', path.basename(f.path));
        const text = fs.existsSync(adopted) ? fs.readFileSync(adopted, 'utf8') : '';
        return !text.endsWith(f.markdown);
      });
      list.push(['body bytes unchanged', changed.length === 0, JSON.stringify(changed.map((f) => f.path))]);
    }
    if (expected.no_errors === true) {
      const errors = envelope.findings.filter((f) => f.severity !== 'warn');
      list.push(['no error', errors.length === 0, JSON.stringify(errors)]);
    }
    return checks(list);
  } finally {
    fs.rmSync(scratch, { force: true, recursive: true });
  }
}

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
  if (Array.isArray(input.after_init)) return runVerbs(vector);
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
