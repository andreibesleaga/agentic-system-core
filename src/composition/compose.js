'use strict';
/**
 * CONTEXT Composition — aggregate: Selection/Verdict.
 * Implements spec/07-composition.md: AGSC-07-03, AGSC-07-04 (Step 1, closure),
 * AGSC-07-05 + AGSC-07-05a (Step 2, hiding and the hard-dependency guard),
 * AGSC-07-06 (Step 3, mutex), AGSC-07-07 (Step 4, warnings), AGSC-07-08 (the
 * normative order and Step 5's verdict-neutrality), AGSC-07-09 (the verdict
 * shape and every ordering), AGSC-07-10 (the five inert keys), AGSC-07-23
 * (Step 5, port wiring), AGSC-07-24 and AGSC-02-97 (`compose --from` over a
 * `kind: architecture` item's `yaml agsc-selection` block), AGSC-11-22 (a
 * retired item named in a selection is AGSC-E802).
 * Requirements: PRD-036, PRD-038, R6, R12.
 *
 * PURE: no file system, no process, no clock, no network, no randomness
 * (tests/arch/core-purity.test.js). Every fault is a Finding or a verdict
 * member with a registered code (spec/09-conformance.md 9.4), never a thrown
 * string; a thrown error here would be a programming fault.
 */

const crypto = require('node:crypto');
const jcs = require('../knowledge/jcs.js');

/** The nine core Link keys that carry composition semantics (AGSC-03-01). */
const CORE_KEYS = Object.freeze(['related', 'broader', 'narrower', 'uses', 'requires',
  'excludes', 'derived-from', 'contradicts', 'supersedes']);
/** AGSC-07-10: these five never affect any step. */
const INERT_KEYS = Object.freeze(['related', 'broader', 'narrower', 'derived-from', 'mentions']);

const NUL = String.fromCharCode(0);

/** Code-point comparison — the ordering of AGSC-04-12 (never locale, never UTF-16). */
function compareCodePoint(a, b) {
  const x = [...String(a)];
  const y = [...String(b)];
  for (let i = 0; i < Math.min(x.length, y.length); i += 1) {
    const d = x[i].codePointAt(0) - y[i].codePointAt(0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  if (x.length === y.length) return 0;
  return x.length < y.length ? -1 : 1;
}

function byCodePoint(list) {
  return list.slice().sort(compareCodePoint);
}

/** A vector supplies bare frontmatter objects; a Bundle supplies parsed Items. */
function frontmatterOf(item) {
  if (item && typeof item === 'object' && item.frontmatter && typeof item.frontmatter === 'object') {
    return item.frontmatter;
  }
  return item || {};
}

/** The array under `key`. AGSC-03-02 allows `<slug>#<anchor>`; composition uses the slug. */
function linkTargets(item, key) {
  const value = frontmatterOf(item)[key];
  if (!Array.isArray(value)) return [];
  return value.filter((v) => typeof v === 'string').map((v) => v.split('#')[0]);
}

function portNames(item, key) {
  const value = frontmatterOf(item)[key];
  return Array.isArray(value) ? value.filter((v) => typeof v === 'string') : [];
}

/** AGSC-11-22: `status: retired` excludes an item from every composition selection. */
function isRetired(item) {
  return frontmatterOf(item).status === 'retired';
}

function slugOf(item) {
  const fm = frontmatterOf(item);
  if (typeof fm.slug === 'string') return fm.slug;
  return item && typeof item.slug === 'string' ? item.slug : undefined;
}

function indexBySlug(items) {
  const index = new Map();
  for (const item of items || []) {
    const slug = slugOf(item);
    if (typeof slug === 'string' && !index.has(slug)) index.set(slug, item);
  }
  return index;
}

/** AGSC-07-03: de-duplicate the selection preserving first-occurrence order. */
function dedupe(selection) {
  const seen = new Set();
  const out = [];
  for (const slug of selection || []) {
    if (typeof slug !== 'string' || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

/**
 * Step 1 — closure (AGSC-07-04). Breadth-first from the whole de-duplicated
 * selection, each frontier expanded in code-point slug order and each item's
 * `requires` targets in code-point order; the path recorded is the first the
 * traversal finds, which is a shortest path with ties broken by the least slug
 * sequence. A per-item union or a depth-first walk records a different path[]
 * and is non-conforming (`compose-0013` proves it).
 */
function closure(index, seedOrder, conflicts) {
  const path = new Map();
  for (const slug of seedOrder) path.set(slug, []);
  let frontier = byCodePoint(seedOrder);
  while (frontier.length > 0) {
    const next = [];
    for (const source of frontier) {
      const item = index.get(source);
      if (!item) continue;
      for (const target of byCodePoint(linkTargets(item, 'requires'))) {
        if (path.has(target)) continue;
        if (!index.has(target)) {
          conflicts.push({ code: 'AGSC-E802', key: 'requires', pair: byCodePoint([source, target]) });
          path.set(target, null);
          continue;
        }
        path.set(target, path.get(source).concat([[source, 'requires', target]]));
        next.push(target);
      }
    }
    frontier = byCodePoint(next);
  }
  return path;
}

/** Sort keys of AGSC-07-09, every comparison by code point. */
function sortConflicts(conflicts) {
  return conflicts.slice().sort((a, b) => compareCodePoint(a.pair[0], b.pair[0])
    || compareCodePoint(a.pair[1], b.pair[1])
    || compareCodePoint(a.code, b.code));
}

function sortWarnings(warnings) {
  return warnings.slice().sort((a, b) => compareCodePoint(a.source, b.source)
    || compareCodePoint(a.target, b.target)
    || compareCodePoint(a.code, b.code)
    || compareCodePoint(a.key, b.key));
}

/**
 * compose(items, selection) -> verdict
 *
 * The five steps run exactly once each, in the order 1 to 5 (AGSC-07-08).
 * The returned object carries the six verdict members of AGSC-07-09 —
 * `added`, `conflicts`, `hidden`, `selection`, `valid`, `warnings` — plus the
 * verdict-neutral `wiring[]` of AGSC-07-23 and the first-occurrence `order[]`
 * of AGSC-07-12, which belong to the Harness and never to the canonical
 * verdict (`verdictOf` returns that).
 */
function compose(items, selection) {
  const index = indexBySlug(items);
  const seedOrder = dedupe(selection);
  const conflicts = [];
  const warnings = [];

  // AGSC-07-03 / AGSC-11-22: a selected slug that is absent, or retired, is E802.
  for (const slug of seedOrder) {
    if (!index.has(slug)) conflicts.push({ code: 'AGSC-E802', key: 'selection', pair: [slug, slug] });
    else if (isRetired(index.get(slug))) conflicts.push({ code: 'AGSC-E802', key: 'status', pair: [slug, slug] });
  }

  // Step 1 — closure.
  const path = closure(index, seedOrder.filter((s) => index.has(s)), conflicts);
  const closed = [...path.keys()].filter((slug) => path.get(slug) !== null);

  // Step 2 — hiding, then the AGSC-07-05a hard-dependency guard.
  const supersededBy = new Map();
  for (const slug of closed) {
    for (const target of linkTargets(index.get(slug), 'supersedes')) {
      if (path.has(target) && path.get(target) !== null && !supersededBy.has(target)) {
        supersededBy.set(target, slug);
      }
    }
  }
  const hiddenSet = new Set([...supersededBy.keys()]);
  const survivors = closed.filter((slug) => !hiddenSet.has(slug));
  const survivorSet = new Set(survivors);
  for (const slug of byCodePoint(survivors)) {
    for (const target of byCodePoint(linkTargets(index.get(slug), 'requires'))) {
      if (!hiddenSet.has(target)) continue;
      conflicts.push({
        code: 'AGSC-E802', key: 'requires', pair: [slug, target], superseding: supersededBy.get(target),
      });
    }
  }

  // Step 3 — mutex over the survivors only (AGSC-07-06).
  const seenPair = new Set();
  for (const slug of byCodePoint(survivors)) {
    for (const target of byCodePoint(linkTargets(index.get(slug), 'excludes'))) {
      if (!survivorSet.has(target)) continue;
      const pair = byCodePoint([slug, target]);
      const key = pair[0] + NUL + pair[1];
      if (seenPair.has(key)) continue;
      seenPair.add(key);
      conflicts.push({ code: 'AGSC-E801', key: 'excludes', pair });
    }
  }

  // Step 4 — warnings; they never invalidate (AGSC-07-07).
  const seenContradiction = new Set();
  for (const slug of byCodePoint(survivors)) {
    for (const target of byCodePoint(linkTargets(index.get(slug), 'contradicts'))) {
      if (!survivorSet.has(target)) continue;
      const pair = byCodePoint([slug, target]);
      const key = pair[0] + NUL + pair[1];
      if (seenContradiction.has(key)) continue;
      seenContradiction.add(key);
      warnings.push({ code: 'AGSC-E803', key: 'contradicts', source: slug, target });
    }
    for (const target of byCodePoint(linkTargets(index.get(slug), 'uses'))) {
      if (survivorSet.has(target)) continue;
      warnings.push({ code: 'AGSC-E803', key: 'uses', source: slug, target });
    }
  }

  // Step 5 — port wiring; verdict-neutral but for its AGSC-E804 warnings.
  const wiring = [];
  for (const consumer of byCodePoint(survivors)) {
    for (const port of byCodePoint(portNames(index.get(consumer), 'consumes'))) {
      const producers = byCodePoint(survivors.filter((s) => portNames(index.get(s), 'produces').includes(port)));
      wiring.push(Object.freeze({ consumer, port, producers: Object.freeze(producers) }));
      if (producers.length === 0) {
        warnings.push({ code: 'AGSC-E804', key: 'consumes', source: consumer, target: port });
      }
    }
  }
  wiring.sort((a, b) => compareCodePoint(a.consumer, b.consumer) || compareCodePoint(a.port, b.port));

  const added = byCodePoint(closed.filter((slug) => !seedOrder.includes(slug) && survivorSet.has(slug)))
    .map((slug) => Object.freeze({ path: Object.freeze(path.get(slug)), slug }));
  const sortedConflicts = sortConflicts(conflicts).map(Object.freeze);

  return Object.freeze({
    added: Object.freeze(added),
    conflicts: Object.freeze(sortedConflicts),
    hidden: Object.freeze(byCodePoint([...hiddenSet])),
    selection: Object.freeze(byCodePoint(survivors)),
    valid: sortedConflicts.length === 0,
    warnings: Object.freeze(sortWarnings(warnings).map(Object.freeze)),
    wiring: Object.freeze(wiring),
    order: Object.freeze(seedOrder.filter((slug) => survivorSet.has(slug))),
  });
}

/**
 * The canonical verdict of AGSC-07-09 — exactly six members, in JCS member
 * order. `wiring` and `order` are Harness inputs (AGSC-07-12/07-23), not
 * verdict members, which is what makes Step 5 verdict-neutral (AGSC-07-08).
 */
function verdictOf(result) {
  return {
    added: result.added.map((a) => ({ path: a.path, slug: a.slug })),
    conflicts: result.conflicts.map((c) => (c.superseding === undefined
      ? { code: c.code, key: c.key, pair: c.pair }
      : {
        code: c.code, key: c.key, pair: c.pair, superseding: c.superseding,
      })),
    hidden: result.hidden,
    selection: result.selection,
    valid: result.valid,
    warnings: result.warnings.map((w) => ({
      code: w.code, key: w.key, source: w.source, target: w.target,
    })),
  };
}

/** AGSC-07-24: the SHA-256 of the JCS verdict, compared with `verdict_digest`. */
function verdictDigest(result) {
  return crypto.createHash('sha256').update(jcs.canonicalize(verdictOf(result)), 'utf8').digest('hex');
}

module.exports = {
  CORE_KEYS,
  INERT_KEYS,
  byCodePoint,
  compareCodePoint,
  compose,
  dedupe,
  frontmatterOf,
  indexBySlug,
  slugOf,
  verdictDigest,
  verdictOf,
};
