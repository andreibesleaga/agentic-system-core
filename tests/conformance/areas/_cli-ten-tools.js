'use strict';
// The `cli` cases of what the tool contract of 1.1 adds to the answers of 1.0 (AGSC-09-13),
// each over a Bundle the case states inline, built with a fixed clock:
//
//   cli-0027 the bound: a `search` answer carries at most 100 hits and `total` only above
//            the bound; an `ask` answer cites at most 100 item IRIs; the page tools agree;
//   cli-0028 the citation record: `read` carries one record per chunk of the item, with
//            exactly the members of the rule and the values of the chunk lines, and `[]`
//            for a draft, which the local server answers and the page tools cannot see;
//   cli-0037 the domain parts: a `search` hit, the `read` body and the `brief` items of an
//            item that states a key of AGSC-02-25 carry `domain`; an item that states none
//            has no such member; the page tools give the same answers.
//
// The local server is `mcp-tools.js#tools` over the Bundle with the route map of its build,
// as the `mcp` verb starts it; the page tools are the scripts that build emits, evaluated
// by the caller's `evaluateWebmcp` (cli.js). No network, no clock.

const site = require('../../../src/distribution/site.js');
const { tools } = require('../../../src/distribution/mcp-tools.js');
const { checks, deepEqual } = require('./_assert.js');

/** 2026-01-01T00:00:00Z — the fixed instant of `tests/fixtures/minimal/README.md`. */
const CLOCK = Object.freeze({ iso: () => '2026-01-01T00:00:00Z', now: () => 1767225600 });

/** One loaded item from an item the case states (a flat record). */
function loaded(item) {
  const { body, slug, ...frontmatter } = item;
  return { body: body === undefined ? '' : body, frontmatter, slug, status: frontmatter.status, title: frontmatter.title, type: frontmatter.type };
}

/** The inline Bundle, its build, the local server and the page tools over that build. */
function hosts(vector, items, evaluateWebmcp) {
  const input = vector.input.bundle || {};
  const bundle = {
    config: {
      bundle: { id: vector.id, license_prose: input.license_prose, operator: 'human:conformance' },
      site: { base: input.base, tdm_crawlers: ['GPTBot'], title: 'A Node' },
    },
    items: items.map(loaded),
  };
  const options = { specVersion: vector.options.spec_version, version: '0.0.2' };
  if (vector.input.bundle_version !== undefined) options.bundleVersion = vector.input.bundle_version;
  const built = site.build(bundle, { clock: CLOCK }, options);
  return { local: tools(bundle, { artifacts: built.files }), page: evaluateWebmcp(built, {}) };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** cli-0027 — AGSC-09-13, the bound on `search` and `ask`, equal on both transports. */
function runCli0027(vector, ctx, evaluateWebmcp) {
  const template = vector.input.item_template;
  const many = Array.from({ length: vector.input.item_count },
    (_, i) => ({ ...template, slug: `w-${String(i + 1).padStart(3, '0')}` }));
  const { local, page } = hosts(vector, [...many, ...vector.input.items], evaluateWebmcp);
  const list = [];
  let equal = true;
  vector.input.calls.forEach((call, i) => {
    const answer = local.call(call.tool, call.arguments);
    if (!same(answer, page.pageToolset.call(call.tool, call.arguments))) equal = false;
    const want = vector.expected.results[i];
    const body = answer.body || {};
    if (want.tool === 'ask') {
      const [low, high] = want.citation_count_between;
      list.push([`${i} ask cites ${low}..${high}`, answer.type === 'answer' && answer.citations.length >= low && answer.citations.length <= high,
        JSON.stringify(answer.citations)]);
      return;
    }
    const hits = body.hits || [];
    list.push([`${i} search hit_count`, hits.length === want.hit_count, String(hits.length)]);
    if (want.total_absent === true) list.push([`${i} search total absent`, !Object.prototype.hasOwnProperty.call(body, 'total'), JSON.stringify(body.total)]);
    if (want.total !== undefined) list.push([`${i} search total`, body.total === want.total, JSON.stringify(body.total)]);
    if (want.first_slug !== undefined) list.push([`${i} first slug`, hits.length > 0 && hits[0].slug === want.first_slug, JSON.stringify(hits[0])]);
    if (want.last_slug !== undefined) list.push([`${i} last slug`, hits.length > 0 && hits[hits.length - 1].slug === want.last_slug, JSON.stringify(hits[hits.length - 1])]);
  });
  list.push(['transports_equal', equal === vector.expected.transports_equal, 'the page tools and the local server differ']);
  list.push(['no network call', page.networkCalls === 0, String(page.networkCalls)]);
  return checks(list);
}

/** cli-0028 — AGSC-09-13, the citation records of `read`; the page agrees on listed items. */
function runCli0028(vector, ctx, evaluateWebmcp) {
  const { local, page } = hosts(vector, vector.input.items, evaluateWebmcp);
  const list = [];
  vector.input.calls.forEach((call, i) => {
    const answer = local.call(call.tool, call.arguments);
    const want = vector.expected.chunk_records[i];
    list.push([`${want.slug} chunks`, answer.type === 'item' && answer.body.slug === want.slug && deepEqual(want.chunks, answer.body.chunks),
      JSON.stringify(answer.body)]);
    const viaPage = page.pageToolset.call(call.tool, call.arguments);
    const listed = viaPage.type === 'item';
    if (listed) list.push([`${want.slug} equal on the page`, same(viaPage, answer), JSON.stringify(viaPage.body)]);
    else list.push([`${want.slug} not listed, so AGSC-E301 on the page`, want.chunks.length === 0 && viaPage.body.code === 'AGSC-E301', JSON.stringify(viaPage.body)]);
  });
  return checks(list);
}

/** The `domain` member of each entry of `list` that has one, by slug; the slugs of every entry. */
function domainsBySlug(list) {
  const out = {};
  for (const entry of list) if (Object.prototype.hasOwnProperty.call(entry, 'domain')) out[entry.slug] = entry.domain;
  return out;
}

/** One expected result of cli-0037 against the local server's answer. */
function domainCheck(i, want, answer) {
  const body = answer.body || {};
  if (want.domain_of_hits !== undefined) {
    return [`${i} search hits carry the domain parts`, deepEqual(domainsBySlug(body.hits || []), want.domain_of_hits), JSON.stringify(body.hits)];
  }
  if (want.brief_items_domain !== undefined) {
    return [`${i} brief items carry the domain parts`, deepEqual(domainsBySlug(body.items || []), want.brief_items_domain), JSON.stringify(body.items)];
  }
  if (want.domain_absent === true) {
    return [`${i} read has no domain member`, answer.type === 'item' && !Object.prototype.hasOwnProperty.call(body, 'domain'), JSON.stringify(body)];
  }
  return [`${i} read carries the domain parts`, answer.type === 'item' && deepEqual(body.domain, want.domain), JSON.stringify(body.domain)];
}

/** cli-0037 — AGSC-09-13, the domain parts of `search`, `read` and `brief`, equal on both transports. */
function runCli0037(vector, ctx, evaluateWebmcp) {
  const { local, page } = hosts(vector, vector.input.items, evaluateWebmcp);
  const list = [];
  let equal = true;
  vector.input.calls.forEach((call, i) => {
    const want = vector.expected.results[i];
    const answer = local.call(call.tool, call.arguments);
    if (!same(answer, page.pageToolset.call(call.tool, call.arguments))) equal = false;
    list.push([`${i} tool`, want.tool === call.tool, String(want.tool)], domainCheck(i, want, answer));
  });
  list.push(['transports_equal', equal === vector.expected.transports_equal, 'the page tools and the local server differ']);
  list.push(['no network call', page.networkCalls === 0, String(page.networkCalls)]);
  return checks(list);
}

module.exports = { runCli0027, runCli0028, runCli0037 };
