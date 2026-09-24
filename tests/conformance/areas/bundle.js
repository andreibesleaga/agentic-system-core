'use strict';
// Conformance area `bundle`. bundle-0001 (MAJOR tolerance and unknown-key
// preservation, AGSC-00-15) — owner A. bundle-0002 (language variants,
// AGSC-01-13) and bundle-0003..0005 (the agent lane, AGSC-01-36/38) — owner
// B (the configuration/CLI package); dispatched here by vector.id
// since their input shape (`paths[]`/`config` alone, no `markdown`) differs
// from bundle-0001's.

const frontmatter = require('../../../src/knowledge/frontmatter.js');
const validate = require('../../../src/knowledge/validate.js');
const { deepEqual, findingsMatch, checks } = require('./_assert.js');
const { checkAgents } = require('../../../src/governance/agents.js');

/**
 * groupLanguageVariants(paths, config) — AGSC-01-13/01-13a: the unsuffixed
 * file is the primary and owns the slug; `<slug>.<lang>.md` shares it. No
 * module in the contract names this function (bundle loading/routing
 * is not yet assigned to any agent's API surface); implemented here,
 * self-contained, since bundle-0002 is B's vector to prove.
 */
function groupLanguageVariants(paths, config) {
  const defaultLang = (config && config.i18n && config.i18n.default) || 'en';
  const groups = new Map(); // 'dir/slug' -> { dir, typePlural, slug, hasPrimary, variants }

  for (const p of paths) {
    const lastSlash = p.lastIndexOf('/');
    const dir = p.slice(0, lastSlash);
    const file = p.slice(lastSlash + 1);
    const base = file.endsWith('.md') ? file.slice(0, -3) : file;
    const typePlural = dir.slice(dir.lastIndexOf('/') + 1);
    const dotIndex = base.indexOf('.');
    const slug = dotIndex === -1 ? base : base.slice(0, dotIndex);
    const lang = dotIndex === -1 ? null : base.slice(dotIndex + 1).toLowerCase();
    const key = `${dir}/${slug}`;
    if (!groups.has(key)) groups.set(key, { dir, typePlural, slug, hasPrimary: false, variants: [] });
    const g = groups.get(key);
    if (lang === null) g.hasPrimary = true;
    else if (lang !== defaultLang) g.variants.push(lang);
  }

  let items = 0;
  const routes = [];
  const errors = [];
  let firstPrimarySlug = null;

  for (const g of groups.values()) {
    if (g.hasPrimary) {
      items += 1;
      if (firstPrimarySlug === null) firstPrimarySlug = g.slug;
      routes.push(`/${g.typePlural}/${g.slug}/`);
      for (const lang of g.variants) routes.push(`/${g.typePlural}/${g.slug}/${lang}/`);
    } else {
      for (const lang of g.variants) errors.push({ code: 'AGSC-E208', path: `${g.dir}/${g.slug}.${lang}.md` });
    }
  }

  return { items, routes, primarySlug: firstPrimarySlug, orphanErrors: errors, variantIsSeparateItem: false };
}

function runBundle0002(vector) {
  const result = groupLanguageVariants(vector.input.paths, vector.input.config);
  const expected = vector.expected;
  const list = [
    ['items', result.items === expected.items, `${result.items} != ${expected.items}`],
    ['primary_slug', result.primarySlug === expected.primary_slug, `${result.primarySlug} != ${expected.primary_slug}`],
    ['routes', deepEqual(result.routes, expected.routes), JSON.stringify(result.routes)],
    ['variant_is_separate_item', result.variantIsSeparateItem === expected.variant_is_separate_item, '']
  ];
  const wantOrphanCode = expected.orphan_variant && expected.orphan_variant.error;
  if (wantOrphanCode) {
    list.push(['orphan_variant', result.orphanErrors.some((e) => e.code === wantOrphanCode), JSON.stringify(result.orphanErrors)]);
  }
  return checks(list);
}

function runAgentsConfigVector(vector) {
  const findings = checkAgents(vector.input.config);
  const errorFindings = findings.filter((f) => f.severity === 'error');
  const accepted = errorFindings.length === 0;
  const expected = vector.expected;
  const list = [['accepted', accepted === expected.accepted, `${accepted} != ${expected.accepted}`]];
  if (expected.error !== undefined) {
    list.push(['error', errorFindings.some((f) => f.code === expected.error), JSON.stringify(errorFindings)]);
  }
  if (Array.isArray(expected.findings)) {
    const m = findingsMatch(expected.findings, findings);
    list.push(['findings', m.ok && findings.length === expected.findings.length, m.detail]);
  }
  return checks(list);
}

/**
 * bundle-0006 (rc.6, AGSC-00-25/) — the asymmetry AGSC-00-21 names: content
 * tolerates the unknown, configuration does not.
 *
 * `agsc.config.json` is the one CLOSED surface of this format (AGSC-01-18), so a
 * reserved name is rejected there exactly as a typo is, and `AGSC-09-08` puts
 * invalid configuration in the exit-2 usage class. The exit code is asserted
 * through `application/cli/main.js`'s own mapping and not restated here, so the
 * vector proves the CLI and not this file.
 *
 * `path` in the vector is the location in an operator's spelling (`routing`,
 * `agents[0].routing`); the engine carries it at the head of the finding's
 * message and, for an unknown key, in the finding's `key` member.
 */
function reservedConfigCase(vector, ctx) {
  // eslint-disable-next-line global-require
  const main = require('../../../src/application/cli/main.js');
  const list = [];
  const byName = new Map((vector.expected.cases || []).map((c) => [c.name, c]));
  for (const input of vector.input.cases || []) {
    const want = byName.get(input.name);
    const findings = validate.config(input.config, { checkAgents, schemas: ctx.schemas });
    const errors = findings.filter((f) => f.severity === 'error');
    const accepted = errors.length === 0;
    list.push([`${input.name} accepted`, accepted === want.accepted, JSON.stringify(findings)]);
    const m = findingsMatch((want.findings || []).map((f) => ({ code: f.code, severity: f.severity })), findings);
    list.push([`${input.name} findings`, m.ok, m.detail]);
    for (const one of want.findings || []) {
      if (one.path === undefined) continue;
      list.push([`${input.name} names ${one.path}`,
        findings.some((f) => String(f.message).startsWith(`${one.path}: `)),
        JSON.stringify(findings.map((f) => f.message))]);
    }
    // AGSC-09-08's exit class, read from the CLI's own table rather than asserted
    // twice: `AGSC-E004` is the code that makes an invocation exit 2.
    const exit = accepted ? 0 : (errors.some((f) => main.USAGE_CLASS_CODES.has(f.code)) ? 2 : 1);
    list.push([`${input.name} exit`, exit === want.exit, `got ${exit}`]);
    if (want.preserved !== undefined) {
      const kept = {};
      for (const key of Object.keys(want.preserved)) kept[key] = input.config[key];
      list.push([`${input.name} preserved`, deepEqual(kept, want.preserved), JSON.stringify(kept)]);
    }
  }
  return checks(list);
}

const B_HANDLERS = {
  'bundle-0006': reservedConfigCase,
  'bundle-0002': runBundle0002,
  'bundle-0003': runAgentsConfigVector,
  'bundle-0004': runAgentsConfigVector,
  'bundle-0005': runAgentsConfigVector
};

module.exports.run = (vector, ctx) => {
  const bHandler = B_HANDLERS[vector.id];
  if (bHandler) return bHandler(vector, ctx);

  const { input, expected } = vector;
  if (typeof input.markdown !== 'string') {
    return { status: 'fail', detail: 'no handler for this input shape in area bundle' };
  }
  const item = frontmatter.parseItem(input.markdown, { schemas: ctx.schemas });
  const errors = item.findings.filter((f) => f.severity === 'error');
  const keys = validate.unknownKeys(item.frontmatter || {}, { schemas: ctx.schemas });
  const preserved = {};
  for (const k of [...keys.vendor, ...keys.unknown].sort()) preserved[k] = item.frontmatter[k];

  const list = [];
  if (expected.accepted === true) {
    const major = validate.majorCompatible(item.frontmatter && item.frontmatter.spec_version, ctx.specVersion);
    list.push(['accepted', errors.length === 0 && major, JSON.stringify(errors.map((f) => f.code))]);
  }
  if (expected.preserved !== undefined) {
    list.push(['preserved', deepEqual(preserved, expected.preserved), JSON.stringify(preserved)]);
  }
  if (Array.isArray(expected.findings)) {
    const m = findingsMatch(expected.findings, item.findings);
    list.push(['findings', m.ok, m.detail]);
  }
  return checks(list);
};

module.exports.groupLanguageVariants = groupLanguageVariants;
