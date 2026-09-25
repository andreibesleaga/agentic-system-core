'use strict';
// src/knowledge/links.js — CONTEXT Knowledge, aggregate Bundle (the Link graph).
// Implements AGSC-03-01…03-13 and the relative-path grammar AGSC-01-35 where a
// body reference carries it.
//
// PURE: no fs, no process, no clock, no network. Items come in already parsed;
// what leaves is a record — edges, findings, and the diagnostic shapes the vectors
// name (`cycle`, `chain`, `parents`, `resolved`/`unresolved`/`skipped_external`).
//
// Nothing here is delegated to a library: the fourteen keys, their inverses, the
// cluster bounds and the two cycle checks are this specification's own algebra.
// Anchors come from `markdown.js`, which owns the AGSC-03-13 algorithm, so there
// is exactly one implementation of it in the engine.
//
// Codes raised here, and the rule each comes from:
//   AGSC-E301 unresolved Link target                     AGSC-03-02, AGSC-03-09
//   AGSC-E302 cycle in `requires`                        AGSC-03-07
//   AGSC-E303 cycle in `broader`/`narrower`              AGSC-03-08
//   AGSC-E304 unknown link-shaped key (warning)          AGSC-03-03, AGSC-11-12
//   AGSC-E305 orphan item (warning)                      AGSC-03-10
//   AGSC-E306 computed inverse authored                  AGSC-03-04
//   AGSC-E307 cluster nesting deeper than 3              AGSC-03-08
//   AGSC-E308 cluster with more than one `broader`       AGSC-03-08
//   AGSC-E310 unresolved relative body reference         AGSC-03-11
//   AGSC-E311 Link value is an absolute URL              AGSC-11-12
//   AGSC-E902 body reference violates the path grammar   AGSC-01-35

const { compareCodePoint } = require('./unicode.js');
const { finding, sortFindings, TYPE_PLURAL } = require('./validate.js');
const markdown = require('./markdown.js');
const { SLUG_PATTERN } = require('./slug.js');

/** AGSC-03-01: the nine core keys, in the order the specification lists them. */
const CORE_KEYS = Object.freeze(['related', 'broader', 'narrower', 'uses', 'requires',
  'excludes', 'derived-from', 'contradicts', 'supersedes']);
/** AGSC-03-01: the five Mode-2 keys (combiner semantics `none`, AGSC-03-18). */
const MODE2_KEYS = Object.freeze(['implements', 'verifies', 'covers', 'blocked-by', 'decided-by']);
/** AGSC-03-01: exactly fourteen. No fifteenth key exists at spec_version 1.x. */
const LINK_KEYS = Object.freeze([...CORE_KEYS, ...MODE2_KEYS]);

/** AGSC-03-02, §3.1 table: authored key -> computed inverse name. */
const INVERSE = Object.freeze({
  related: 'related',
  broader: 'narrower',
  narrower: 'broader',
  uses: 'used-by',
  requires: 'required-by',
  excludes: 'excludes',
  'derived-from': 'derivation-of',
  contradicts: 'contradicts',
  supersedes: 'superseded-by',
  implements: 'implemented-by',
  verifies: 'verified-by',
  covers: 'covered-by',
  'blocked-by': 'blocks',
  'decided-by': 'decides',
});

/** AGSC-03-05: materialised in both directions even when one side authored it. */
const SYMMETRIC = Object.freeze(new Set(['related', 'excludes', 'contradicts']));

/**
 * AGSC-03-04: the nine names that are computed and MUST NOT be authored.
 * `narrower` is NOT one of them — it is an authorable key whose inverse is
 * `broader` (AGSC-03-06 makes the pair idempotent).
 */
const COMPUTED_KEYS = Object.freeze(new Set(['used-by', 'required-by', 'derivation-of',
  'superseded-by', 'implemented-by', 'verified-by', 'covered-by', 'blocks', 'decides']));

/**
 * AGSC-03-03 / AGSC-11-12: the link-shaped names that are NOT among the fourteen
 * and MUST warn rather than being silently treated as a Link. The set is closed on
 * purpose: the reserved `peer-ref`, the untyped `mentions` of AGSC-03-11, and the
 * foreign spellings AGSC-03-19/03-20 map on import. An arbitrary unknown key is
 * AGSC-E207's business (knowledge/validate.js), not this module's, so that one
 * fault never carries two codes.
 */
const LINK_SHAPED_UNKNOWN = Object.freeze(new Set(['peer-ref', 'mentions', 'refines',
  'alternative-to', 'conflicts-with', 'composed-of', 'mitigates', 'recommends',
  'blockedBy', 'decidedBy', 'tests', 'traces-to']));

/** AGSC-03-08: family > deck > sub-deck — at most two `broader` ancestors. */
const MAX_CLUSTER_ANCESTORS = 2;

const NUL = String.fromCharCode(0);
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/u;
/**
 * AGSC-03-02: a Link value is `<slug>` or `<slug>#<anchor>`. The slug half is built
 * from `slug.js#SLUG_PATTERN`, so the grammar has ONE definition in the engine; the
 * anchor half is the `link_target` grammar AGSC-03-13 guarantees every anchor meets.
 */
const SLUG_BODY = String(SLUG_PATTERN).replace(/^\^/u, '').replace(/\$$/u, '');
const LINK_VALUE = new RegExp(`^(${SLUG_BODY})(?:#([a-z0-9](?:[a-z0-9-]*[a-z0-9])?))?$`, 'u');

/** The frontmatter view of an item: vectors pass flat objects, the loader nests. */
function view(item) {
  const fm = (item && typeof item.frontmatter === 'object' && item.frontmatter !== null)
    ? item.frontmatter
    : item;
  const type = item.type != null ? item.type : fm.type;
  const slug = item.slug != null ? item.slug : fm.slug;
  const plural = TYPE_PLURAL[type] || 'concepts';
  return {
    slug,
    type,
    fm,
    body: typeof item.body === 'string' ? item.body : '',
    path: item.path || `content/${plural}/${slug}.md`,
  };
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

const edgeKey = (e) => [e.source, e.key, e.target].join(NUL);

/**
 * Iterative depth-first search for a cycle. Iterative, not recursive: a Bundle is
 * unbounded and a stack overflow is not a Finding.
 *
 * @returns {string[]|null} the cycle in discovery order (AGSC-03-07), root first.
 */
function findCycle(adjacency, nodes) {
  const colour = new Map();
  for (const start of nodes) {
    if (colour.has(start)) continue;
    const path = [start];
    const frames = [{ node: start, next: 0 }];
    colour.set(start, 1);
    while (frames.length > 0) {
      const top = frames[frames.length - 1];
      const neighbours = adjacency.get(top.node) || [];
      if (top.next >= neighbours.length) {
        colour.set(top.node, 2);
        frames.pop();
        path.pop();
        continue;
      }
      const next = neighbours[top.next];
      top.next += 1;
      if (!nodes.has(next)) continue;
      const seen = colour.get(next);
      if (seen === 1) return path.slice(path.indexOf(next));
      if (seen === 2) continue;
      colour.set(next, 1);
      path.push(next);
      frames.push({ node: next, next: 0 });
    }
  }
  return null;
}

/** POSIX-style join of a Bundle-relative directory and a relative reference. */
function resolveInside(fromDir, relative) {
  const out = fromDir === '' ? [] : fromDir.split('/');
  for (const segment of relative.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.join('/');
}

/**
 * AGSC-01-35, the KEYED form: no `.`/`..` segment, no leading `/`, no `\`, no NUL,
 * stays inside. This is the test for a relative path a Bundle carries as the VALUE
 * OF A KEY — `attachments[].file`, `diagram.file`, `build.out`.
 */
function pathGrammarError(relative, fromDir) {
  if (typeof relative !== 'string' || relative === '') return 'empty';
  if (relative.startsWith('/')) return 'leading slash';
  if (relative.includes('\\')) return 'backslash';
  if (relative.includes(NUL)) return 'NUL';
  const segments = relative.split('/');
  if (segments.some((s) => s === '.' || s === '..')) return 'dot segment';
  if (segments.some((s) => s === '')) return 'empty segment';
  if (fromDir !== undefined && resolveInside(fromDir, relative) === null) return 'escapes the Bundle root';
  return null;
}

/**
 * AGSC-01-35 (R-01), the BODY form. An inline Markdown link or
 * image target in a body "is held to the same rule **except that it MAY contain
 * `..` segments**, because an item under `content/<type-plural>/` cannot otherwise
 * reach `content/assets/` at all (AGSC-02-95, AGSC-03-11): it MUST not begin with
 * `/`, MUST NOT contain a `\` or a `U+0000`, and the path it resolves to —
 * relative to the file that carries it — MUST lie inside the Bundle root … for a
 * body reference the escape test wins over the segment test."
 *
 * So the segment test is disapplied here and the escape test is the operative one.
 * A body target that escapes is `AGSC-E902`; one that stays inside and resolves to
 * nothing is `AGSC-E310` (AGSC-03-11), never `AGSC-E902`.
 *
 * Added 2026-09-21: the rc.5 amendment had been applied to the
 * specification and not to this module, so `![logo](../assets/logo.png)` — the one
 * case the amendment exists to permit — was reported `AGSC-E902 (dot segment)`.
 */
function bodyPathError(relative, fromDir) {
  if (typeof relative !== 'string' || relative === '') return 'empty';
  if (relative.startsWith('/')) return 'leading slash';
  if (relative.includes('\\')) return 'backslash';
  if (relative.includes(NUL)) return 'NUL';
  if (fromDir !== undefined && resolveInside(fromDir, relative) === null) return 'escapes the Bundle root';
  return null;
}

function dirOf(filePath) {
  const i = filePath.lastIndexOf('/');
  return i < 0 ? '' : filePath.slice(0, i);
}

/**
 * AGSC-03-13 over a body: the anchors it defines. Delegates to markdown.js, the
 * single implementation of the algorithm.
 */
function anchors(body) {
  return markdown.anchors(body);
}

/** Collect the authored Link edges of one item, reporting the key-level faults. */
function collectAuthored(v, findings, push) {
  for (const key of Object.keys(v.fm)) {
    if (COMPUTED_KEYS.has(key)) {
      findings.push(finding('AGSC-E306',
        `"${key}" is a computed inverse and MUST NOT be authored (AGSC-03-04)`,
        { file: v.path, slug: v.slug, key }));
      continue;
    }
    if (LINK_SHAPED_UNKNOWN.has(key)) {
      findings.push(finding('AGSC-E304',
        `"${key}" is not one of the fourteen Link keys and is preserved (AGSC-03-03)`,
        { file: v.path, slug: v.slug, key, severity: 'warn' }));
      continue;
    }
    if (!LINK_KEYS.includes(key)) continue;
    for (const raw of asArray(v.fm[key])) {
      if (typeof raw !== 'string') continue;
      if (SCHEME.test(raw)) {
        findings.push(finding('AGSC-E311',
          `Link "${key}" value "${raw}" is an absolute URL; a Link MUST NOT cross Bundles (AGSC-11-12)`,
          { file: v.path, slug: v.slug, key }));
        continue;
      }
      push(key, raw, v);
    }
  }
}

/**
 * Resolve the Link graph of a Bundle (AGSC-03).
 *
 * @param {Array<object>} items parsed items (or the flat frontmatter objects the
 *   vectors carry); `body` is optional and drives the AGSC-03-11 body-link pass.
 * @param {{config?:object, assets?:Iterable<string>}} [options] `assets` lists the
 *   Bundle-relative paths under `content/assets/` a body reference may name.
 * @returns {object} edges, findings and the diagnostic shapes named above.
 */
function resolve(items, options = {}) {
  const views = (Array.isArray(items) ? items : []).map(view);
  const bySlug = new Map(views.map((v) => [v.slug, v]));
  // One parse per body per pass: an item linked to n times is not parsed n times.
  const anchorCache = new Map();
  const anchorsOf = (v) => {
    if (!anchorCache.has(v)) anchorCache.set(v, anchors(v.body).anchors);
    return anchorCache.get(v);
  };
  const assets = new Set(options.assets || []);
  const findings = [];
  const edges = [];
  const index = new Map();

  const add = (source, key, target, computed) => {
    const edge = { computed, key, source, target };
    const id = edgeKey(edge);
    const seen = index.get(id);
    if (seen === undefined) {
      index.set(id, edge);
      edges.push(edge);
      return;
    }
    // AGSC-03-06: asserting both directions of broader/narrower is idempotent;
    // an authored edge always wins over the same edge computed from its inverse.
    if (!computed) seen.computed = false;
  };

  // Pass 1 — authored edges, computed inverses (AGSC-03-04, 03-05, 03-06).
  const requiresAdjacency = new Map();
  const broaderAdjacency = new Map();
  for (const v of views) {
    collectAuthored(v, findings, (key, raw, owner) => {
      const m = LINK_VALUE.exec(raw);
      const targetSlug = m ? m[1] : raw;
      const fragment = m ? m[2] : undefined;
      const target = bySlug.get(targetSlug);
      if (!m || target === undefined) {
        findings.push(finding('AGSC-E301',
          `Link "${key}" target "${raw}" resolves to no item (AGSC-03-02)`,
          { file: owner.path, slug: owner.slug, key }));
        return;
      }
      if (fragment !== undefined && !anchorsOf(target).includes(fragment)) {
        findings.push(finding('AGSC-E301',
          `Link "${key}" target "${raw}" names no anchor of "${targetSlug}" (AGSC-03-02)`,
          { file: owner.path, slug: owner.slug, key }));
        return;
      }
      add(owner.slug, key, targetSlug, false);
      add(targetSlug, INVERSE[key], owner.slug, true);
      if (key === 'requires') {
        if (!requiresAdjacency.has(owner.slug)) requiresAdjacency.set(owner.slug, []);
        requiresAdjacency.get(owner.slug).push(targetSlug);
      }
      if (key === 'broader' || key === 'narrower') {
        const from = key === 'broader' ? owner.slug : targetSlug;
        const to = key === 'broader' ? targetSlug : owner.slug;
        if (!broaderAdjacency.has(from)) broaderAdjacency.set(from, []);
        broaderAdjacency.get(from).push(to);
      }
    });
  }

  // Pass 2 — the two acyclicity checks (AGSC-03-07, AGSC-03-08).
  const slugs = new Set(views.map((v) => v.slug));
  const requiresCycle = findCycle(requiresAdjacency, slugs);
  if (requiresCycle) {
    findings.push(finding('AGSC-E302',
      `cycle in "requires": ${requiresCycle.join(' -> ')} (AGSC-03-07)`,
      { file: (bySlug.get(requiresCycle[0]) || {}).path, slug: requiresCycle[0] }));
  }
  const broaderCycle = findCycle(broaderAdjacency, slugs);
  if (broaderCycle) {
    findings.push(finding('AGSC-E303',
      `cycle in "broader"/"narrower": ${broaderCycle.join(' -> ')} (AGSC-03-08)`,
      { file: (bySlug.get(broaderCycle[0]) || {}).path, slug: broaderCycle[0] }));
  }

  // Pass 3 — the two cluster bounds, checked AFTER acyclicity (AGSC-03-08).
  let parents = null;
  let chain = null;
  const chains = [];
  for (const v of views) {
    if (v.type !== 'cluster') continue;
    const broader = asArray(v.fm.broader).filter((s) => typeof s === 'string');
    if (broader.length <= 1) continue;
    const sorted = [...broader].sort(compareCodePoint);
    if (parents === null) parents = sorted;
    findings.push(finding('AGSC-E308',
      `cluster "${v.slug}" declares ${broader.length} parents (${sorted.join(', ')}); at most one is allowed (AGSC-03-08)`,
      { file: v.path, slug: v.slug, key: 'broader' }));
  }
  if (!broaderCycle) {
    for (const v of views) {
      if (v.type !== 'cluster') continue;
      const ancestry = [v.slug];
      let cursor = v;
      const guard = new Set([v.slug]);
      for (;;) {
        const next = asArray(cursor.fm.broader).find((s) => typeof s === 'string');
        if (next === undefined || guard.has(next)) break;
        const parent = bySlug.get(next);
        if (parent === undefined || parent.type !== 'cluster') break;
        guard.add(next);
        ancestry.unshift(next);
        cursor = parent;
      }
      if (ancestry.length - 1 <= MAX_CLUSTER_ANCESTORS) continue;
      chains.push(ancestry);
      if (chain === null) chain = ancestry;
      findings.push(finding('AGSC-E307',
        `cluster "${v.slug}" nests ${ancestry.length} levels deep (${ancestry.join(' > ')}); at most 3 are allowed (AGSC-03-08)`,
        { file: v.path, slug: v.slug, key: 'broader' }));
    }
  }

  // Pass 4 — orphans (AGSC-03-10): no inbound Link and no clusters[] entry.
  // A `clusters[]` entry points BOTH ways: the member is not an orphan because
  // it belongs to a cluster, and the cluster is not an orphan because members
  // name it. Counting only the member direction made every top-level cluster a
  // permanent AGSC-E305, which AGSC-03-10 does not say and AGSC-01-12's
  // membership key contradicts.
  const inbound = new Set(edges.map((e) => e.target));
  for (const v of views) for (const c of asArray(v.fm.clusters)) inbound.add(String(c));
  for (const v of views) {
    if (inbound.has(v.slug)) continue;
    if (asArray(v.fm.clusters).length > 0) continue;
    findings.push(finding('AGSC-E305',
      `"${v.slug}" has no inbound Link and no clusters[] entry (AGSC-03-10)`,
      { file: v.path, slug: v.slug, severity: 'warn' }));
  }

  // Pass 5 — inline body references (AGSC-03-11) and their path grammar (AGSC-01-35).
  const resolved = [];
  const unresolved = [];
  const skippedExternal = [];
  const byPath = new Map(views.map((v) => [v.path, v]));
  for (const v of views) {
    if (v.body === '') continue;
    const ownAnchors = anchorsOf(v);
    for (const ref of markdown.links(v.body)) {
      const raw = ref.target;
      if (raw === '') continue;
      if (SCHEME.test(raw) || raw.startsWith('//')) {
        skippedExternal.push(raw);
        continue;
      }
      const hash = raw.indexOf('#');
      const relative = hash < 0 ? raw : raw.slice(0, hash);
      const fragment = hash < 0 ? undefined : raw.slice(hash + 1);
      if (relative === '') {
        if (fragment !== undefined && ownAnchors.includes(fragment)) {
          resolved.push(raw);
        } else {
          unresolved.push(raw);
          findings.push(finding('AGSC-E310',
            `body reference "${raw}" names no anchor of this item (AGSC-03-11)`,
            { file: v.path, slug: v.slug, line: ref.line }));
        }
        continue;
      }
      const grammar = bodyPathError(relative, dirOf(v.path));
      if (grammar !== null) {
        findings.push(finding('AGSC-E902',
          `body reference "${raw}" violates the relative-path grammar (${grammar}) (AGSC-01-35)`,
          { file: v.path, slug: v.slug, line: ref.line }));
        unresolved.push(raw);
        continue;
      }
      const targetPath = resolveInside(dirOf(v.path), relative);
      // AGSC-03-11 asks that the target resolve to an existing ITEM, not to a
      // file name: on the published site the route of AGSC-06-01 is
      // extension-less, so `[Supervisor](supervisor)` is the form that works
      // for a reader and `supervisor.md` is the form that works in the
      // repository. Both designate the same item, so both resolve here
      //
      const targetItem = byPath.get(targetPath) === undefined
        ? byPath.get(`${targetPath}.md`)
        : byPath.get(targetPath);
      const anchorOk = fragment === undefined
        || (targetItem !== undefined && anchorsOf(targetItem).includes(fragment));
      if ((targetItem !== undefined && anchorOk)
          || (assets.has(targetPath) && fragment === undefined)) {
        resolved.push(raw);
        // AGSC-03-11: an inline link between items is the untyped `asc:mentions`.
        if (targetItem !== undefined) add(v.slug, 'mentions', targetItem.slug, true);
        // The asset branch resolves INSIDE the Bundle and, since rc.6, is PUBLISHED:
        // AGSC-06-01 as amended carries `/assets/<path>` for every file
        // under `content/assets/` a published body references, so the reference that
        // works in the repository works on the built site too. Until rc.6 the route
        // set carried none, and this branch reported the resolved asset as a warning
        // under AGSC-E310 because the link 404d while `lint` stayed green.
        continue;
      }
      unresolved.push(raw);
      findings.push(finding('AGSC-E310',
        `body reference "${raw}" resolves to nothing inside the Bundle (AGSC-03-11)`,
        { file: v.path, slug: v.slug, line: ref.line }));
    }
  }

  edges.sort((a, b) => compareCodePoint(a.source, b.source)
    || compareCodePoint(a.key, b.key)
    || compareCodePoint(a.target, b.target));

  const errors = sortFindings(findings);
  return {
    chain,
    chains,
    cycle: requiresCycle || broaderCycle,
    cycles: [requiresCycle, broaderCycle].filter(Boolean),
    edges,
    errors,
    findings: errors,
    inverses: edges.filter((e) => e.computed),
    parents,
    resolved,
    skippedExternal,
    skipped_external: skippedExternal,
    unresolved,
  };
}

/**
 * AGSC-03-11: "a link to an external origin is never resolved at build time". The
 * test is the scheme (or a protocol-relative `//`), and it is exported at rc.5
 * so that the writer's route mapping applies exactly the same test the
 * resolver does — one definition of "external", not two.
 */
function isExternalTarget(raw) {
  const s = String(raw == null ? '' : raw);
  return SCHEME.test(s) || s.startsWith('//');
}

module.exports = {
  CORE_KEYS,
  MODE2_KEYS,
  LINK_KEYS,
  INVERSE,
  SYMMETRIC,
  SLUG_PATTERN,
  anchors,
  bodyPathError,
  dirOf,
  findCycle,
  isExternalTarget,
  pathGrammarError,
  resolve,
  resolveInside,
  view,
};
