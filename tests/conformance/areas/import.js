'use strict';
// Conformance area `import` — AGSC-01-22, AGSC-01-23, AGSC-01-39, AGSC-03-19.
//
// `imp-0005`, `imp-0009` and `imp-0010` pin the draft rule of AGSC-01-22 (every item of a
// source this node does not own arrives as a draft); `imp-0006` to `imp-0008` pin the SKOS
// import of AGSC-01-39 against `interchange/adapters/skos.js`.
//
// `imp-0001` states what an import does when a planned path is already
// taken. The three cases are the three outcomes the rule names, and they are run
// against the engine's own plan/apply pair (`verbs/import.js#survey`, `#apply`,
// `#collisionFindings`) over an in-memory FileSystem port — no temporary
// directory, no clock, no network.

const path = require('node:path');

const slugs = require('../../../src/knowledge/slug.js');
const verb = require('../../../src/application/cli/verbs/import.js');
const okf = require('../../../src/interchange/okf.js');
const skos = require('../../../src/interchange/adapters/skos.js');
const { readSchemas } = require('../../../src/adapters/node-fs.js');
const { compareCodePoint } = require('../../../src/knowledge/unicode.js');
const { checks, deepEqual, findingsMatch } = require('./_assert.js');
const { guarded } = require('./_expected-reads.js');

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
 * imp-0009 (AGSC-01-22) — the one LIMIT and the one RECORD of import tolerance:
 * another MAJOR is refused unless `--allow-newer`, a newer MINOR of the tool's MAJOR
 * is imported with the warning `AGSC-E506`.
 *
 * The source is expressed abstractly by the vector (`spec_version`,
 * `bundle_version`, `bundle_hash`, `items[]`), so it is rendered here as the OKF
 * bundle a publisher would actually hand over: a bundle-root `index.md` carrying
 * the three declarations, and one Markdown document per item. That keeps the case
 * against the real reader — `interchange/okf.js#sourceFacts`, `#versionRefusal`,
 * `#versionWarning` and `#plan` — rather than against a restatement of the rule.
 *
 * Every item written is a draft (AGSC-01-22 from 1.1), whatever status the source gave it.
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

    const { refusal, findings } = versionFindings(facts, input);
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

    list.push(...provChecks(input.name, want, planned.writes));
    list.push(...statusChecks(input.name, want, planned.writes));
  }
  return checks(list);
}

/**
 * AGSC-01-22's version gate for one case: the refusal of another MAJOR (null when
 * the source is accepted) and, only when it is accepted, the newer-MINOR warning.
 */
function versionFindings(facts, input) {
  const refusal = okf.versionRefusal(facts.specVersion, {
    allowNewer: input.allow_newer === true,
    toolSpecVersion: input.tool_spec_version,
  });
  const newer = refusal === null
    ? okf.versionWarning(facts.specVersion, { toolSpecVersion: input.tool_spec_version }) : null;
  return { refusal, findings: [...(refusal === null ? [] : [refusal]), ...(newer === null ? [] : [newer])] };
}

/** The `prov` members every planned write must carry, and those it must not. */
function provChecks(name, want, writes) {
  const list = [];
  for (const write of writes) {
    const block = String(write.text).split('---')[1] || '';
    if (want.prov !== undefined) {
      for (const [key, value] of Object.entries(want.prov)) {
        list.push([`${name} prov.${key}`, block.includes(`  ${key}: ${value}\n`)
          || block.includes(`  ${key}: "${value}"\n`), block]);
      }
    }
    for (const absent of want.prov_members_absent || []) {
      list.push([`${name} prov.${absent} absent`, !block.includes(`${absent}:`), block]);
    }
  }
  return list;
}

/** The `status` every planned write must carry (`imp-0009`: always `draft`). */
function statusChecks(name, want, writes) {
  if (want.status === undefined) return [];
  return writes.map((write) => [`${name} status`,
    (String(write.text).split('---')[1] || '').includes(`status: ${want.status}\n`), write.text]);
}

/**
 * imp-0005 and imp-0010 (AGSC-01-22, AGSC-03-19, AGSC-03-20) — one foreign document through the
 * OKF reader's own `mapFrontmatter`, which is given no sign that the source is this node's
 * own, so it is foreign: its record arrives as a draft whatever licence it declares
 * (`imp-0005`), and foreign link names are mapped on import, never added to the vocabulary
 * (`imp-0010`). The licence is established in both, so the case is isolated by its input alone.
 */
function foreignLinkCase(vector) {
  const input = vector.input;
  const stem = String(input.path).replace(/\.md$/u, '');
  const { frontmatter, findings } = okf.mapFrontmatter(input.frontmatter,
    { body: '', operator: 'human:tester', path: input.path, slug: stem, stem });
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

/** The items of a plan as the vectors state them: slug, parsed frontmatter, body text. */
function itemsOfPlan(writes) {
  return writes.map((write) => {
    const read = okf.readDocument(write.text);
    return { body: read.body, frontmatter: { ...read.frontmatter }, slug: write.path.replace(/^content\/[^/]+\/|\.md$/gu, '') };
  }).sort((a, b) => compareCodePoint(a.slug, b.slug));
}

/** The SKOS plan of a vector's Turtle input, with the options the vector states. */
function skosPlan(input) {
  return skos.plan({ turtle: input.turtle }, {
    i18nDefault: input.i18n_default,
    itemSchema: readSchemas(path.resolve(__dirname, '..', '..', '..')).item,
    operator: input.operator,
  });
}

/**
 * imp-0006 and imp-0007 (AGSC-01-39) — the mapping and the drops of the SKOS import:
 * the items as parsed frontmatter and body in slug order, and the warnings. A warning of
 * a dropped statement names its subject and predicate, so those members are compared.
 */
function skosMappingCase(vector) {
  const planned = skosPlan(vector.input);
  const items = itemsOfPlan(planned.writes);
  const want = vector.expected;
  const list = [
    ['items', deepEqual(items, want.items), JSON.stringify(items)],
    ['no error', planned.findings.every((f) => f.severity === 'warn'), JSON.stringify(planned.findings)],
    ['one warning for each expected one', planned.findings.length === want.findings.length,
      `${planned.findings.length} warnings, ${want.findings.length} expected`],
  ];
  const matched = findingsMatch(want.findings, planned.findings);
  list.push(['findings', matched.ok, matched.detail]);
  return checks(list);
}

/**
 * imp-0008 (AGSC-01-39 with AGSC-01-23) — the file is imported `runs` times into one
 * in-memory Bundle. The first run writes every item; a later run finds every planned path
 * holding exactly the bytes it would write, so it writes nothing and reports no collision.
 * `second_run_findings` is what the apply step reports of that run (`collisionFindings`).
 */
function skosIdempotenceCase(vector) {
  const files = {};
  const planned = skosPlan(vector.input);
  const first = verb.apply(memoryFs(files), planned.writes);
  const second = verb.apply(memoryFs(files), skosPlan(vector.input).writes);
  const slugOf = (p) => p.replace(/^content\/[^/]+\/|\.md$/gu, '');
  const want = vector.expected;
  return checks([
    ['first run writes', deepEqual(first.written.map(slugOf).sort(), want.first_run_writes), JSON.stringify(first.written)],
    ['second run changes nothing', deepEqual([...second.written, ...second.replaced].map(slugOf), want.second_run_changed),
      JSON.stringify(second)],
    ['second run reports nothing', deepEqual(verb.collisionFindings(second), want.second_run_findings),
      JSON.stringify(verb.collisionFindings(second))],
    ['the vector runs the import twice', vector.input.runs === 2, String(vector.input.runs)],
  ]);
}

// The handler is guarded (`_expected-reads.js`): a pass that left a member of
// `expected` unread is a fail.
module.exports.run = guarded((vector, ctx) => {
  if (['imp-0005', 'imp-0010'].includes(vector.id)) return foreignLinkCase(vector);
  if (vector.id === 'imp-0001') return collisionCase(vector);
  if (vector.id === 'imp-0009') return sourceRecordCase(vector, ctx);
  if (['imp-0006', 'imp-0007'].includes(vector.id)) return skosMappingCase(vector);
  if (vector.id === 'imp-0008') return skosIdempotenceCase(vector);
  return { status: 'fail', detail: `${vector.id}: no handler in area import` };
});
