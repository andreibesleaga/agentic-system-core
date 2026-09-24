'use strict';
// Conformance area `import` — AGSC-01-23.
//
// The area was declared and empty from rc.2 until rc.6, when `imp-0001`
// gave it its first vector: what an import does when a planned path is already
// taken. The three cases are the three outcomes the rule names, and they are run
// against the engine's own plan/apply pair (`verbs/import.js#survey`, `#apply`,
// `#collisionFindings`) over an in-memory FileSystem port — no temporary
// directory, no clock, no network.

const slugs = require('../../../src/knowledge/slug.js');
const verb = require('../../../src/application/cli/verbs/import.js');
const okf = require('../../../src/interchange/okf.js');
const { checks, findingsMatch } = require('./_assert.js');

/** The Bundle's FileSystem port, over a plain map of path → text. */
function memoryFs(files) {
  return {
    exists: (p) => Object.prototype.hasOwnProperty.call(files, p),
    readFile: (p) => {
      if (!Object.prototype.hasOwnProperty.call(files, p)) throw new Error(`no ${p}`);
      return files[p];
    },
    writeFile: (p, text) => { files[p] = text; },
  };
}

/** The path an imported item takes. */
const pathOf = (slug) => `content/concepts/${slug}.md`;

/** The bytes an imported item carries — the body alone is enough for this rule. */
const textOf = (body) => `${body}\n`;

/**
 * AGSC-01-23's suffix clause, over the INCOMING set alone: colliding slugs are
 * suffixed `-2`, `-3`, … in discovery order. `slugs.dedupe` does not mutate the
 * set it is given, so the set is grown by the caller — exactly as
 * `interchange/import.js` does it.
 */
function plannedWrites(incoming) {
  const taken = new Set();
  const writes = [];
  for (const file of incoming || []) {
    const base = String(file.path).replace(/\.md$/u, '');
    const slug = slugs.dedupe(slugs.isValid(base) ? base : slugs.slugify(base), taken);
    taken.add(slug);
    writes.push({ path: pathOf(slug), slug, text: textOf(file.body) });
  }
  return writes;
}

function collisionCase(vector) {
  const list = [];
  const byName = new Map((vector.expected.cases || []).map((c) => [c.name, c]));
  for (const input of vector.input.cases || []) {
    const want = byName.get(input.name);
    if (want === undefined) {
      list.push([input.name, false, 'the vector states no expected case of this name']);
      continue;
    }
    const files = {};
    for (const item of input.existing || []) files[pathOf(item.slug)] = textOf(item.body);
    const before = { ...files };
    const writes = plannedWrites(input.incoming);

    // `--dry-run` reports the same as the real run, and writes nothing.
    const survey = verb.survey(memoryFs({ ...before }), writes);
    const dryRefused = survey.collisions.length > 0;

    const applied = verb.apply(memoryFs(files), writes);
    const findings = verb.collisionFindings(applied);
    const exit = applied.refused ? 1 : 0;
    const written = applied.written.map((p) => p.replace(/^content\/concepts\/|\.md$/gu, ''));
    const unchanged = applied.unchanged.map((p) => p.replace(/^content\/concepts\/|\.md$/gu, ''));

    list.push([`${input.name} exit`, exit === want.exit, `exit ${exit}`]);
    list.push([`${input.name} written`,
      JSON.stringify(written) === JSON.stringify(want.written || []), JSON.stringify(written)]);
    if (want.unchanged !== undefined) {
      list.push([`${input.name} unchanged`,
        JSON.stringify(unchanged) === JSON.stringify(want.unchanged), JSON.stringify(unchanged)]);
    }
    // A finding of this vector names the SLUG as well as the code, so the
    // comparison is over the finding's own members (AGSC-09-06, subset).
    const seen = findings.map((f) => ({
      code: f.code,
      severity: f.severity,
      slug: String(f.file || '').replace(/^content\/concepts\/|\.md$/gu, ''),
    }));
    const matched = findingsMatch(want.findings || [], seen);
    list.push([`${input.name} findings`, matched.ok, matched.detail]);
    if ((want.findings || []).length === 0) {
      list.push([`${input.name} clean`, findings.every((f) => f.severity === 'warn'),
        JSON.stringify(findings)]);
    }
    if (want.dry_run_reports_the_same === true) {
      list.push([`${input.name} dry-run`, dryRefused === applied.refused,
        `--dry-run said ${dryRefused}, the run said ${applied.refused}`]);
    }
    // Nothing at all is written when the import refuses (AGSC-01-23).
    if (applied.refused) {
      list.push([`${input.name} wrote nothing`,
        JSON.stringify(files) === JSON.stringify(before), JSON.stringify(files)]);
    }
  }
  return checks(list);
}

/**
 * imp-0002 (rc.6, AGSC-01-22 as amended /) — the one LIMIT and the one RECORD
 * of import tolerance.
 *
 * The source is expressed abstractly by the vector (`spec_version`,
 * `bundle_version`, `bundle_hash`, `items[]`), so it is rendered here as the OKF
 * bundle a publisher would actually hand over: a bundle-root `index.md` carrying
 * the three declarations, and one Markdown document per item. That keeps the case
 * against the real reader — `interchange/okf.js#sourceFacts`, `#versionRefusal`
 * and `#plan` — rather than against a restatement of the rule.
 *
 * The exit codes are AGSC-09-08's: the refusal carries `AGSC-E004`, which
 * `application/cli/main.js` maps to exit 2 wherever it is raised, and a plan that
 * writes carries no error at all, which is exit 0.
 */
function sourceRecordCase(vector, ctx) {
  const main = require('../../../src/application/cli/main.js');
  const list = [];
  const byName = new Map((vector.expected.cases || []).map((c) => [c.name, c]));
  for (const input of vector.input.cases || []) {
    const want = byName.get(input.name);
    const source = input.source || {};
    const rootKeys = ['spec_version', 'bundle_version', 'bundle_hash']
      .filter((k) => source[k] !== undefined)
      .map((k) => `${k}: "${source[k]}"`);
    const files = [{ path: 'index.md', text: `---\n${rootKeys.join('\n')}\n---\n` }];
    for (const item of source.items || []) {
      files.push({
        path: `${item.slug}.md`,
        text: `---\ntype: concept\nkind: pattern\ntitle: ${item.title}\n---\n\n${item.body}`,
      });
    }

    const facts = okf.sourceFacts(files);
    list.push([`${input.name} facts`,
      facts.specVersion === (source.spec_version === undefined ? null : source.spec_version)
      && facts.bundleVersion === (source.bundle_version === undefined ? null : source.bundle_version)
      && facts.bundleHash === (source.bundle_hash === undefined ? null : source.bundle_hash),
      JSON.stringify(facts)]);

    const refusal = okf.versionRefusal(facts.specVersion, {
      allowNewer: input.allow_newer === true,
      toolSpecVersion: input.tool_spec_version,
    });
    const findings = refusal === null ? [] : [refusal];
    const planned = refusal === null
      ? okf.plan(files, {
        itemSchema: ctx.itemSchema,
        operator: 'human:tester',
        sourceHash: facts.bundleHash,
        sourceVersion: facts.bundleVersion,
      })
      : { findings: [], writes: [] };
    const all = [...findings, ...planned.findings];
    const errors = all.filter((f) => f.severity === 'error');
    const exit = errors.length === 0 ? 0
      : (errors.some((f) => main.USAGE_CLASS_CODES.has(f.code)) ? 2 : 1);
    list.push([`${input.name} exit`, exit === want.exit, `got ${exit}: ${JSON.stringify(all.map((f) => f.code))}`]);
    const matched = findingsMatch(want.findings || [], all);
    list.push([`${input.name} findings`, matched.ok, matched.detail]);
    if ((want.findings || []).length === 0) {
      list.push([`${input.name} clean`, errors.length === 0, JSON.stringify(all)]);
    }

    const written = planned.writes.map((w) => String(w.path).replace(/^content\/[^/]+\/|\.md$/gu, ''));
    list.push([`${input.name} written`,
      JSON.stringify(written) === JSON.stringify(want.written || []), JSON.stringify(written)]);
    // AGSC-09-09: `--dry-run` reports the plan and writes nothing, so it must report
    // the same refusal. The refusal is computed before any write is planned, which
    // is what makes the two identical by construction rather than by coincidence.
    if (want.dry_run_reports_the_same === true) {
      list.push([`${input.name} dry-run`, planned.writes.length === 0 && refusal !== null,
        'the refusal must precede every write']);
    }

    for (const write of planned.writes) {
      const block = String(write.text).split('---')[1] || '';
      if (want.prov !== undefined) {
        for (const [key, value] of Object.entries(want.prov)) {
          list.push([`${input.name} prov.${key}`, block.includes(`  ${key}: ${value}\n`)
            || block.includes(`  ${key}: "${value}"\n`), block]);
        }
      }
      for (const absent of want.prov_members_absent || []) {
        list.push([`${input.name} prov.${absent} absent`, !block.includes(`${absent}:`), block]);
      }
    }
  }
  return checks(list);
}

/**
 * imp-0003 (AGSC-03-19, AGSC-03-20) — foreign link names are mapped on import, never
 * added to the vocabulary, through the OKF reader's own `mapFrontmatter`.
 */
function foreignLinkCase(vector) {
  const input = vector.input;
  const stem = String(input.path).replace(/\.md$/u, '');
  // The case isolates the mapping: the source's licence is taken as established, so
  // the licence record of AGSC-01-22 (a `status: draft` and its warning) is not in play.
  const { frontmatter, findings } = okf.mapFrontmatter(input.frontmatter,
    { body: '', operator: 'human:tester', path: input.path, slug: stem, sourceLicence: true, stem });
  const list = [];
  for (const [key, value] of Object.entries(vector.expected.frontmatter_has || {})) {
    list.push([`${key}`, JSON.stringify(frontmatter[key]) === JSON.stringify(value), JSON.stringify(frontmatter[key])]);
  }
  for (const key of vector.expected.keys_absent || []) list.push([`${key} absent`, frontmatter[key] === undefined, JSON.stringify(frontmatter[key])]);
  const m = findingsMatch((vector.expected.findings || []).map((f) => ({ code: f.code, severity: f.severity })), findings);
  list.push(['findings', m.ok && findings.length === (vector.expected.findings || []).length,
    `${m.detail} ${JSON.stringify(findings.map((f) => f.code))}`]);
  if (vector.expected.error_count !== undefined) {
    const errors = findings.filter((f) => f.severity === 'error');
    list.push(['error count', errors.length === vector.expected.error_count, JSON.stringify(errors)]);
  }
  return checks(list);
}

module.exports.run = (vector, ctx) => {
  if (vector.id === 'imp-0003') return foreignLinkCase(vector);
  if (vector.id === 'imp-0001') return collisionCase(vector);
  if (vector.id === 'imp-0002') return sourceRecordCase(vector, ctx);
  return { status: 'fail', detail: `${vector.id}: no handler in area import` };
};
