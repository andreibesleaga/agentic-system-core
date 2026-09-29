'use strict';
/**
 * CONTEXT Distribution (Emission) — Surface: the SEVEN TOOLS AS PAGE TOOLS.
 *
 * Implements the browser half of AGSC-09-16 ("where a browser exposes
 * `document.modelContext`, the `/compose/` page AND THE ITEM PAGES register the same
 * seven tools of AGSC-09-13, with identical names, identical argument names and
 * results identical to the local MCP server's for the same input and Bundle"),
 * AGSC-09-13a (the tool error envelope), AGSC-08-18 (the one result shape, `trust`
 * fixed at `untrusted`), AGSC-09-14a (`ask`: published text only, at least one cited
 * item IRI, the fixed no-answer string, the Content Use Terms inside the answer),
 * AGSC-09-14b (`remember` synthesizes a conforming item and returns it) and
 * AGSC-08-04 / AGSC-11-14 (on this transport `propose` and `remember` PERFORM NO
 * WRITE of any kind — they return the payload and stop).
 * Requirements: PRD-051, PRD-056.
 *
 * WHY THIS MODULE EXISTS. The emitted page registers seven tools and answers every
 * one of them: `src/distribution/compose-page.js` implements `compose`, and this
 * module the other six. A page that registered seven tools and answered one would
 * satisfy the rule in the emitter and not in the artefact the site ships.
 *
 * ONE IMPLEMENTATION, TWO HOSTS (AGSC-07-13's portability contract, the pattern of
 * `composition/browser.js`). Every function below is a SELF-CONTAINED top-level
 * function whose only free names are the other functions of `PORTABLE` and its own
 * parameters — `bundle()` emits their `Function.prototype.toString()` source text as
 * the page's script, so the page runs the very bytes Node runs and the two cannot
 * drift. `tests/arch/composition-portable.test.js` enforces the same contract here
 * as it does over the algebra.
 *
 * WHAT A PAGE CAN SEE. A page has no Bundle; it has the ROUTES of AGSC-06-01 that
 * this node published. The corpus is therefore assembled from
 * `/pages/<slug>.md` (AGSC-05-07: "a byte-identical copy of the lint-normalized
 * source file", so it carries the frontmatter block and the body),
 * `/pages/<slug>.jsonld` and `/graph.jsonld` (AGSC-05: the item's type and IRI),
 * `/search.json` (AGSC-06-16: the prebuilt inverted index — the page never
 * re-tokenizes a body, it reads the postings the writer emitted) and
 * `/.well-known/knowledge-linkset` (AGSC-06-08: the node's own base).
 * No network beyond this origin, no key, no server, no cookie, no storage
 * (AGSC-06-05, AGSC-09-16).
 *
 * THE ONE HONEST BOUNDARY. The published surfaces carry the PUBLISHED set
 * (AGSC-06-30 excludes `draft`, `retired` and items held back by `releases`), while
 * the local server is handed the whole Bundle. For the published set the two
 * transports answer identically — that is what `cli-0003` now proves against the
 * emitted script — and for an unpublished item the page answers `AGSC-E301` because
 * the page cannot see what the node did not publish. That difference is a property
 * of publication, not of this implementation; it is recorded as a specification
 * item for 1.0.0 in this distribution's private records.
 *
 * Security rows of `docs/SECURITY-CONSIDERATIONS.md` addressed here: prompt injection
 * through returned prose (every envelope is `trust: "untrusted"` and the WebMCP
 * `untrustedContentHint` says the same in the browser's vocabulary, AGSC-11-18) and
 * "no path, URL or shell string in a tool signature" — `read`, `links` and `propose`
 * take slugs, matched by exact equality against an index built from the corpus and
 * never joined to a path or interpolated into a URL.
 *
 * PURE: no fs, no clock, no network, no process.
 */

/* ------------------------------------------------------------------ constants */
/*
 * Every constant is a FUNCTION. A function that closed over a module-scope `const`
 * would be emitted into the page with a free variable nothing there defines — the
 * defect `tests/arch/composition-portable.test.js` exists to catch.
 */

/** AGSC-06-18: the Content Use Terms identifier every export carries. */
function pageTerms() {
  return 'LicenseRef-AgenticSystemCore-Content-Use-1.0';
}

/** AGSC-09-14a: the answer a responder MUST give when nothing matches. */
function pageNoAnswer() {
  return 'no answer in this memory';
}

/** AGSC-03-01: the fourteen Link keys — nine core, five Mode-2. */
function pageLinkKeys() {
  return ['related', 'broader', 'narrower', 'uses', 'requires', 'excludes', 'derived-from',
    'contradicts', 'supersedes', 'implements', 'verifies', 'covers', 'blocked-by', 'decided-by'];
}

/** AGSC-03-02, §3.1 table: authored key -> computed inverse name. */
function pageInverseKeys() {
  return {
    'blocked-by': 'blocks',
    broader: 'narrower',
    contradicts: 'contradicts',
    covers: 'covered-by',
    'decided-by': 'decides',
    'derived-from': 'derivation-of',
    excludes: 'excludes',
    implements: 'implemented-by',
    narrower: 'broader',
    related: 'related',
    requires: 'required-by',
    supersedes: 'superseded-by',
    uses: 'used-by',
    verifies: 'verified-by',
  };
}

/** AGSC-05-01 / AGSC-06-01: an item type's route folder. */
function pageTypePlural(type) {
  return type === 'cluster' ? 'clusters' : `${String(type === undefined || type === null ? 'concept' : type)}s`;
}

/**
 * AGSC-02-03, second half: "a reader MUST parse with the YAML failsafe schema —
 * every scalar is a string — and MUST APPLY TYPES FROM `schema/item.schema.json`."
 *
 * These are every scalar-typed property name that schema declares, and there are six.
 * They are stated here because a page has no schema to read: the route set of
 * AGSC-06-01 publishes the ontology, not the JSON Schemas. The list is NOT authored
 * twice — `tests/distribution/page-tools.test.js` derives it from
 * `schema/item.schema.json` and fails if the two ever differ, so the schema stays the
 * source of truth and drift is a red test rather than a wrong answer.
 */
function pageTypedScalars() {
  return {
    cost_usd: 'number',
    estimate: 'boolean',
    order: 'integer',
    signature: 'boolean',
    tokens_in: 'integer',
    tokens_out: 'integer',
  };
}

/**
 * AGSC-02-04's written forms, and only those: anything else keeps the failsafe
 * string, so an unknown key's `1e3` stays `"1e3"` (vector `fm-0006`) and a reader
 * never invents a value. This is `knowledge/validate.js#coerceScalar` keyed by
 * property name instead of by schema position; the two agree because no name in
 * `pageTypedScalars()` is declared with two different scalar types.
 */
function pageApplyTypes(value, key) {
  const typed = pageTypedScalars();
  if (Array.isArray(value)) return value.map((v) => pageApplyTypes(v, key));
  if (value !== null && typeof value === 'object') {
    const out = {};
    const names = Object.keys(value);
    for (let i = 0; i < names.length; i += 1) out[names[i]] = pageApplyTypes(value[names[i]], names[i]);
    return out;
  }
  const type = typed[key];
  if (type === undefined || typeof value !== 'string') return value;
  if (type === 'integer' && /^-?(?:0|[1-9][0-9]*)$/u.test(value)) return Number(value);
  if (type === 'number' && /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][-+]?[0-9]+)?$/u.test(value)) return Number(value);
  if (type === 'boolean' && (value === 'true' || value === 'false')) return value === 'true';
  return value;
}

/** AGSC-09-14b: `kind` to item `type`, exactly `mcp-tools.js#KIND_TO_TYPE`. */
function pageKindToType() {
  // prototype-free. `kinds[args.kind]` is the guard `remember` uses to fall
  // back to `concept`; on a plain object literal it answered a function for
  // `constructor` and the item's `type` became the `Object` constructor.
  const kinds = Object.create(null);
  kinds.concept = 'concept';
  kinds.episode = 'episode';
  kinds.gate = 'gate';
  kinds.lesson = 'lesson';
  kinds.procedure = 'procedure';
  kinds.task = 'concept';
  return kinds;
}

/* ------------------------------------------------------------------- envelope */

/** AGSC-08-18: the one result shape, JCS member order, `trust` fixed. */
function pageEnvelope(source, type, body) {
  return { body, license: pageTerms(), source, trust: 'untrusted', type };
}

/** AGSC-09-13a: a domain fault is this envelope, never a transport error. */
function pageErrorEnvelope(source, code, message) {
  return pageEnvelope(source, 'error', { code, message: message === undefined ? '' : message });
}

/** A Bundle IRI always ends in exactly one `/` (AGSC-05-03). */
function pageBaseIri(base) {
  return `${String(base === undefined || base === null ? '/' : base).replace(/\/+$/, '')}/`;
}

/** AGSC-05-01: an item's canonical HTTPS IRI. */
function pageItemIri(base, type, slug) {
  return `${pageBaseIri(base)}${pageTypePlural(type)}/${slug}/`;
}

/* ------------------------------------------------------------------ text tools */

/** AGSC-01-14: every text this engine compares is NFC. */
function pageNfc(text) {
  const value = String(text === undefined || text === null ? '' : text);
  return typeof value.normalize === 'function' ? value.normalize('NFC') : value;
}

/**
 * AGSC-06-23, the QUERY half of the tokenizer. The page never tokenizes a BODY —
 * `search.json` already carries the postings the writer produced with the full
 * tokenizer, fenced code removed by the CommonMark parse — so the only text this
 * function ever sees is a caller's query string, where no fence can occur. The
 * character class is `distribution/search.js#NON_TOKEN`, spelled out for the same
 * reason it is spelled out there: `\w` and `\p{L}\p{N}` both disagree with
 * `build-0002`. Linear time, no backtracking group (the ReDoS rule).
 */
function pageTokenize(text) {
  const lowered = pageNfc(text).replace(/[A-Z]/g, (c) => c.toLowerCase());
  const parts = lowered.split(/[^a-z0-9\p{L}\p{Nd}\p{M}]+/u);
  const out = [];
  for (let i = 0; i < parts.length; i += 1) {
    if (Array.from(parts[i]).length >= 2) out.push(parts[i]);
  }
  return out;
}

/** AGSC-03-13: NFC -> ASCII lowercase -> keep `[a-z0-9 -]` -> spaces to `-` -> collapse -> trim. */
function pageAnchorOf(text) {
  return pageNfc(text)
    .replace(/[A-Z]/g, (c) => c.toLowerCase())
    .replace(/[^a-z0-9 -]/gu, '')
    .replace(/ /g, '-')
    .replace(/-+/g, '-')
    .replace(/^-/, '')
    .replace(/-$/, '');
}

/**
 * AGSC-01-10/11: the slug of a title. `knowledge/slug.js#slugify`'s algorithm, needed
 * here because `remember` derives an address from a title the caller supplies and a
 * page has no Bundle loader to ask.
 */
function pageSlugify(title) {
  const base = pageAnchorOf(title);
  return base === '' ? 'note' : base;
}

/** AGSC-01-23: `-2`, `-3`, … until the slug is free. */
function pageDedupe(slug, taken) {
  if (!taken || typeof taken.has !== 'function' || !taken.has(slug)) return slug;
  let n = 2;
  while (taken.has(`${slug}-${n}`)) n += 1;
  return `${slug}-${n}`;
}

/* ------------------------------------------------- the published source file */

/**
 * AGSC-02-01 / AGSC-05-07: split a published `/pages/<slug>.md` — the lint-normalized
 * source file — into its frontmatter BLOCK (the `---` fences included, which is
 * exactly what `knowledge/adopt.js#serialize` emits) and its body. A file with no
 * closed frontmatter block is all body, and the block is the empty string.
 */
function pageSplitFrontmatter(text) {
  const source = String(text === undefined || text === null ? '' : text);
  if (source.slice(0, 4) !== '---\n') return { block: '', body: source, yamlText: '' };
  const end = source.indexOf('\n---\n', 3);
  if (end === -1) return { block: '', body: source, yamlText: '' };
  return {
    block: source.slice(0, end + 5),
    body: source.slice(end + 5),
    yamlText: source.slice(4, end + 1),
  };
}

/**
 * The AGSC-02-02…04 FAILSAFE subset, read back.
 *
 * This is deliberately NOT a YAML parser. It reads exactly one dialect: the block
 * style `knowledge/adopt.js#serialize` emits under the AGSC-04-19 profile
 * (`schema: failsafe`, `indent: 2`, `indentSeq: true`, `lineWidth: 0`,
 * plain scalars by default) — block mappings, block sequences, nested mappings, and
 * plain, single-quoted, double-quoted and `|`/`>` block scalars. Every scalar is a
 * STRING, because that is what the failsafe schema means. A line it does not
 * recognise is skipped rather than guessed at: a page never invents content.
 *
 * `tests/distribution/page-tools.test.js` asserts, over every item of the reference
 * Bundle and of the published pattern node, that this reader returns exactly the
 * object `knowledge/yaml.js` returns for the same bytes.
 */
function pageParseFrontmatter(yamlText) {
  const state = { i: 0, lines: String(yamlText === undefined || yamlText === null ? '' : yamlText).split('\n') };
  return pageParseMap(state, 0);
}

/** The indentation of a line, in spaces (the profile emits no tab). */
function pageIndentOf(line) {
  return line.length - line.replace(/^ +/, '').length;
}

/** Advance past blank and comment lines; `false` when the document is exhausted. */
function pageNextMeaningful(state) {
  while (state.i < state.lines.length) {
    const trimmed = state.lines[state.i].trim();
    if (trimmed === '' || trimmed.charAt(0) === '#') {
      state.i += 1;
      continue;
    }
    return true;
  }
  return false;
}

/** A block mapping whose keys sit at `indent`. */
function pageParseMap(state, indent) {
  const out = {};
  for (;;) {
    if (!pageNextMeaningful(state)) return out;
    const line = state.lines[state.i];
    const at = pageIndentOf(line);
    if (at < indent) return out;
    const text = line.slice(at);
    if (text.charAt(0) === '-' && (text.length === 1 || text.charAt(1) === ' ')) return out;
    const colon = pageKeyEnd(text);
    if (colon === -1) {
      state.i += 1;
      continue;
    }
    const key = pageScalar(text.slice(0, colon).trim());
    const rest = text.slice(colon + 1).trim();
    state.i += 1;
    if (rest === '') {
      out[key] = pageParseValue(state, at);
    } else if (rest.charAt(0) === '|' || rest.charAt(0) === '>') {
      out[key] = pageBlockScalar(state, at, rest);
    } else {
      out[key] = pageScalar(rest);
    }
  }
}

/** The value written UNDER a key: a nested mapping, a sequence, or nothing. */
function pageParseValue(state, parentIndent) {
  if (!pageNextMeaningful(state)) return '';
  const line = state.lines[state.i];
  const at = pageIndentOf(line);
  if (at <= parentIndent) return '';
  const text = line.slice(at);
  if (text.charAt(0) === '-' && (text.length === 1 || text.charAt(1) === ' ')) return pageParseSeq(state, at);
  return pageParseMap(state, at);
}

/** A block sequence whose dashes sit at `indent`; an entry may open a mapping. */
function pageParseSeq(state, indent) {
  const out = [];
  for (;;) {
    if (!pageNextMeaningful(state)) return out;
    const line = state.lines[state.i];
    const at = pageIndentOf(line);
    if (at !== indent) return out;
    const text = line.slice(at);
    if (!(text.charAt(0) === '-' && (text.length === 1 || text.charAt(1) === ' '))) return out;
    const after = text.slice(1);
    const rest = after.trim();
    const inner = indent + 1 + pageIndentOf(after);
    state.i += 1;
    if (rest === '') {
      out.push(pageParseValue(state, indent));
      continue;
    }
    const colon = pageKeyEnd(rest);
    if (colon === -1) {
      out.push(pageScalar(rest));
      continue;
    }
    const map = {};
    const key = pageScalar(rest.slice(0, colon).trim());
    const value = rest.slice(colon + 1).trim();
    if (value === '') map[key] = pageParseValue(state, inner);
    else if (value.charAt(0) === '|' || value.charAt(0) === '>') map[key] = pageBlockScalar(state, inner, value);
    else map[key] = pageScalar(value);
    const more = pageParseMap(state, inner);
    const names = Object.keys(more);
    for (let i = 0; i < names.length; i += 1) map[names[i]] = more[names[i]];
    out.push(map);
  }
}

/** The index of the `:` that ends a mapping key, honouring quotes. */
function pageKeyEnd(text) {
  const quote = text.charAt(0);
  if (quote === '"' || quote === '\'') {
    for (let i = 1; i < text.length; i += 1) {
      if (text.charAt(i) === '\\' && quote === '"') {
        i += 1;
        continue;
      }
      if (text.charAt(i) === quote) return text.charAt(i + 1) === ':' ? i + 1 : -1;
    }
    return -1;
  }
  const at = text.indexOf(': ');
  if (at !== -1) return at;
  return text.slice(-1) === ':' ? text.length - 1 : -1;
}

/** A failsafe scalar: plain, single-quoted or double-quoted; always a string. */
function pageScalar(raw) {
  const text = String(raw);
  if (text.length >= 2 && text.charAt(0) === '\'' && text.slice(-1) === '\'') {
    return text.slice(1, -1).split('\'\'').join('\'');
  }
  if (text.length >= 2 && text.charAt(0) === '"' && text.slice(-1) === '"') {
    return text.slice(1, -1)
      .replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return text;
}

/** A `|`/`>` block scalar with its chomping indicator, per the failsafe subset. */
function pageBlockScalar(state, parentIndent, header) {
  const style = header.charAt(0);
  const collected = [];
  let blockIndent = -1;
  while (state.i < state.lines.length) {
    const line = state.lines[state.i];
    if (line.trim() !== '') {
      const at = pageIndentOf(line);
      if (at <= parentIndent) break;
      if (blockIndent === -1) blockIndent = at;
    }
    collected.push(line.trim() === '' ? '' : line.slice(blockIndent === -1 ? 0 : blockIndent));
    state.i += 1;
  }
  while (collected.length > 0 && collected[collected.length - 1] === '') collected.pop();
  const joined = style === '>' ? collected.join(' ') : collected.join('\n');
  const chomp = header.indexOf('-') !== -1 ? '' : '\n';
  return joined === '' ? '' : joined + chomp;
}

/* ------------------------------------------------------------ the search index */

/**
 * AGSC-06-21: the shard routes a `/search.json` MANIFEST may name.
 *
 * `/search-<nn>.json`, this origin, and nothing else. A page fetches the route set of
 * AGSC-06-01 and never a URL it read out of a document: a manifest that names
 * `https://evil.example/search-01.json` or `/../secret.json` is not followed, and the
 * mismatch between what it named and what may be followed makes the index INCOMPLETE
 * (below), so the tools answer a finding instead of a wrong result.
 *
 * @param {object} manifest the parsed `/search.json`.
 * @returns {Array<string>} the routes, in manifest order, without repetition.
 */
function pageShardRoutes(manifest) {
  const out = [];
  if (!manifest || !Array.isArray(manifest.shards)) return out;
  for (let i = 0; i < manifest.shards.length; i += 1) {
    const route = String(manifest.shards[i]);
    if (/^\/search-[0-9]{2,}\.json$/.test(route) && out.indexOf(route) === -1) out.push(route);
  }
  return out;
}

/**
 * The inverted index a page searches, whether the node published one document or a
 * manifest and its shards (AGSC-06-21).
 *
 * At or below 500 items `/search.json` IS the index. Above it, `/search.json` is the
 * manifest `{docs_total, shards[]}` and each shard is a WHOLE index over its own
 * slice of the slug order — so its `docs[]` is a contiguous run of the global order
 * and its posting lists count from zero WITHIN the shard. Merging is therefore a
 * concatenation of `docs[]` in shard order plus a posting merge in which every
 * posting of shard *k* is offset by the number of documents the earlier shards
 * carried. The result is exactly the index an unsharded writer would have emitted for
 * the same Bundle, which is what makes AGSC-09-16's "results identical to the local
 * MCP server's" hold above the bound as well as below it.
 *
 * `incomplete` is set when a named shard was not served, when the manifest named a
 * route outside the shape above, or when the merged document count disagrees with
 * `docs_total`. A page that cannot see the whole index must SAY so: answering an
 * empty hit list would be a wrong answer, and a silent one.
 *
 * @param {object} map route -> text, as the writer emitted it.
 * @returns {object|null} `{docs, terms, docs_total?, incomplete?, missing?}`
 */
function pageIndexOf(map) {
  const sources = map || {};
  const parse = (route) => {
    if (typeof sources[route] !== 'string') return null;
    try {
      return JSON.parse(sources[route]);
    } catch (e) {
      return null;
    }
  };
  const root = parse('/search.json');
  if (root === null || typeof root !== 'object') return null;
  if (!Array.isArray(root.shards)) return root;

  const routes = pageShardRoutes(root);
  const missing = [];
  for (let i = 0; i < root.shards.length; i += 1) {
    const named = String(root.shards[i]);
    if (routes.indexOf(named) === -1) missing.push(named);
  }
  const docs = [];
  const terms = Object.create(null);
  for (let i = 0; i < routes.length; i += 1) {
    const shard = parse(routes[i]);
    if (shard === null || !Array.isArray(shard.docs)) {
      missing.push(routes[i]);
      continue;
    }
    const offset = docs.length;
    for (let d = 0; d < shard.docs.length; d += 1) docs.push(shard.docs[d]);
    const shardTerms = shard.terms || {};
    const names = Object.keys(shardTerms);
    for (let n = 0; n < names.length; n += 1) {
      const postings = shardTerms[names[n]];
      if (!Array.isArray(postings)) continue;
      if (terms[names[n]] === undefined) terms[names[n]] = [];
      for (let p = 0; p < postings.length; p += 1) terms[names[n]].push(postings[p] + offset);
    }
  }
  const total = typeof root.docs_total === 'number' ? root.docs_total : docs.length;
  const index = { docs, docs_total: total, terms };
  if (missing.length > 0 || docs.length !== total) {
    index.incomplete = true;
    index.missing = missing.length > 0 ? missing
      : [`${docs.length} document(s) over ${routes.length} shard(s) against docs_total ${total}`];
  }
  return index;
}

/* ------------------------------------------------------------------ the corpus */

/**
 * The item records the page tools read, assembled from published routes.
 *
 * @param {object} sources a map of ROUTE -> text, exactly as the writer emitted it.
 *   `/pages/<slug>.md` is the item set; `/graph.jsonld` supplies each item's type
 *   (the published source file carries it too, and the graph is the cross-check);
 *   `/search.json` is the prebuilt index; `/.well-known/knowledge-linkset` is the
 *   node's own base.
 * @returns {object} `{base, bySlug, index, items}`
 */
function pageCorpus(sources, options) {
  const map = sources || {};
  const opts = options || {};
  const base = pageBaseOf(map);
  const items = [];
  const routes = Object.keys(map).sort();
  for (let i = 0; i < routes.length; i += 1) {
    const route = routes[i];
    if (route.slice(0, 7) !== '/pages/' || route.slice(-3) !== '.md') continue;
    const slug = route.slice(7, route.length - 3);
    const split = pageSplitFrontmatter(map[route]);
    const frontmatter = pageApplyTypes(pageParseFrontmatter(split.yamlText), null);
    const type = typeof frontmatter.type === 'string' ? frontmatter.type : 'concept';
    items.push({
      block: split.block,
      body: split.body,
      frontmatter,
      path: `content/${pageTypePlural(type)}/${slug}.md`,
      slug,
      type,
    });
  }
  // a PROTOTYPE-FREE index. A plain object literal answers a function for
  // `constructor`, `toString`, `__proto__` and the rest of `Object.prototype`, so the
  // `item === undefined` guard of every tool below never fired for those names and a
  // page answered a SUCCESS envelope where `mcp-tools.js` (a `Map`) answers
  // `AGSC-E301` — an AGSC-09-16 divergence between the two transports.
  const bySlug = Object.create(null);
  for (let i = 0; i < items.length; i += 1) bySlug[items[i].slug] = items[i];
  // AGSC-06-21: `/search.json` is the index at or below 500 items and the
  // MANIFEST above it. `pageIndexOf` reads both shapes, so the corpus carries one
  // index whatever the node's size.
  const index = pageIndexOf(map);
  return { base, bundleId: opts.bundleId, bySlug, claimed: pageClaimants(map), index, items };
}

/**
 * AGSC-10-13: the derived `claimed_by` of every task, read back from the published
 * board exports (`/boards/<cluster>.json`), so both transports see the same holder:
 * the page from the routes it fetched, the local server from the build it made.
 * @param {object} map ROUTE -> text.
 * @returns {object} a prototype-free map slug -> claimant.
 */
function pageClaimants(map) {
  const out = Object.create(null);
  const routes = Object.keys(map || {}).sort();
  for (let i = 0; i < routes.length; i += 1) {
    const route = routes[i];
    if (route.slice(0, 8) !== '/boards/' || route.slice(-5) !== '.json' || route === '/boards/index.json') continue;
    let board = null;
    try {
      board = JSON.parse(String(map[route]));
    } catch (e) {
      board = null;
    }
    const tasks = (board && Array.isArray(board.tasks)) ? board.tasks : [];
    for (let j = 0; j < tasks.length; j += 1) {
      const task = tasks[j];
      if (task && typeof task.slug === 'string' && typeof task.claimed_by === 'string') out[task.slug] = task.claimed_by;
    }
  }
  return out;
}

/**
 * AGSC-10-13 with AGSC-06-10: does the node publish a board? Only a node whose
 * discovery document carries the `…/rel#boards` link serves `/boards/index.json`,
 * so a page asks for that route only then and a node with no task logs no 404.
 * @param {object} map ROUTE -> text.
 * @returns {boolean}
 */
function pageDeclaresBoards(map) {
  const raw = (map || {})['/.well-known/knowledge-linkset'];
  if (typeof raw !== 'string') return false;
  try {
    const doc = JSON.parse(raw);
    const context = (doc && doc.linkset && doc.linkset[0]) || null;
    if (context === null || typeof context !== 'object') return false;
    // The relation is `https://` + this suffix; matched by its suffix so that the
    // emitted script names no absolute origin (AGSC-06-05).
    const suffix = '//w3id.org/agentic-system-core/rel#boards';
    return Object.keys(context).some((name) => name.slice(-suffix.length) === suffix
      && Array.isArray(context[name]) && context[name].length > 0);
  } catch (e) {
    return false;
  }
}

/** AGSC-06-08: the node's own base, from the discovery document's anchor. */
function pageBaseOf(map) {
  const raw = map['/.well-known/knowledge-linkset'];
  if (typeof raw === 'string') {
    try {
      const doc = JSON.parse(raw);
      const context = (doc && doc.linkset && doc.linkset[0]) || null;
      if (context && typeof context.anchor === 'string') return context.anchor;
    } catch (e) {
      // A document the page cannot read yields the relative base, never a guess.
    }
  }
  return '/';
}

/* -------------------------------------------------------------------- the edges */

/**
 * AGSC-03-02/03-04/03-06/03-11: the Link edges of a corpus — authored edges, their
 * computed inverses, and the untyped `mentions` of an inline body reference — sorted
 * by `(source, key, target)` exactly as `knowledge/links.js#resolve` sorts them, so
 * the `links` tool answers the same edge list on both transports.
 *
 * An authored edge always wins over the same edge computed from an inverse
 * (AGSC-03-06), which is why the merge below clears `computed` rather than pushing a
 * second entry.
 */
function pageEdges(items) {
  const list = Array.isArray(items) ? items : [];
  // prototype-free, so a Link target spelled `constructor` resolves to
  // nothing rather than to a member of `Object.prototype`.
  const bySlug = Object.create(null);
  const byPath = Object.create(null);
  for (let i = 0; i < list.length; i += 1) {
    bySlug[list[i].slug] = list[i];
    byPath[list[i].path] = list[i];
  }
  const index = {};
  const edges = [];
  const add = (source, key, target, computed) => {
    const id = `${source}\u0000${key}\u0000${target}`;
    if (index[id] === undefined) {
      index[id] = { computed, key, source, target };
      edges.push(index[id]);
      return;
    }
    if (!computed) index[id].computed = false;
  };
  const inverse = pageInverseKeys();
  const keys = pageLinkKeys();
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    const fm = item.frontmatter || {};
    const names = Object.keys(fm);
    for (let k = 0; k < names.length; k += 1) {
      const key = names[k];
      if (keys.indexOf(key) === -1) continue;
      const values = Array.isArray(fm[key]) ? fm[key] : [fm[key]];
      for (let v = 0; v < values.length; v += 1) {
        const raw = values[v];
        if (typeof raw !== 'string') continue;
        const hash = raw.indexOf('#');
        const targetSlug = hash === -1 ? raw : raw.slice(0, hash);
        const fragment = hash === -1 ? null : raw.slice(hash + 1);
        const target = bySlug[targetSlug];
        if (target === undefined) continue;
        if (fragment !== null && pageAnchors(target.body).indexOf(fragment) === -1) continue;
        add(item.slug, key, targetSlug, false);
        add(targetSlug, inverse[key], item.slug, true);
      }
    }
  }
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    const targets = pageInlineTargets(item.body);
    for (let t = 0; t < targets.length; t += 1) {
      const target = pageResolveBodyReference(item, targets[t], byPath);
      if (target !== null) add(item.slug, 'mentions', target.slug, true);
    }
  }
  edges.sort((a, b) => pageCompare(a.source, b.source)
    || pageCompare(a.key, b.key)
    || pageCompare(a.target, b.target));
  return edges;
}

/** AGSC-04-12: code-point order, the one ordering this system compares strings in. */
function pageCompare(a, b) {
  const left = Array.from(String(a));
  const right = Array.from(String(b));
  const n = left.length < right.length ? left.length : right.length;
  for (let i = 0; i < n; i += 1) {
    const x = left[i].codePointAt(0);
    const y = right[i].codePointAt(0);
    if (x !== y) return x < y ? -1 : 1;
  }
  return left.length === right.length ? 0 : (left.length < right.length ? -1 : 1);
}

/**
 * AGSC-03-13: the anchors a body defines, from its ATX headings, with the
 * `section-<n>` numbering and the collision walk of `knowledge/markdown.js`.
 * A fenced block's lines are not headings, so the scan tracks fences.
 */
function pageAnchors(body) {
  const lines = String(body === undefined || body === null ? '' : body).split('\n');
  const texts = [];
  let fence = '';
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const opened = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence !== '') {
      if (opened !== null && opened[1].charAt(0) === fence.charAt(0) && opened[1].length >= fence.length) fence = '';
      continue;
    }
    if (opened !== null) { fence = opened[1]; continue; }
    const heading = /^ {0,3}#{1,6}(?: +(.*))?$/.exec(line);
    if (heading === null) continue;
    texts.push(String(heading[1] === undefined ? '' : heading[1]).replace(/ +#+ *$/, '').trim());
  }
  let empties = 0;
  const first = texts.map((t) => {
    const a = pageAnchorOf(t);
    if (a !== '') return a;
    empties += 1;
    return `section-${empties}`;
  });
  const taken = {};
  return first.map((candidateBase) => {
    let n = 1;
    let candidate = candidateBase;
    while (taken[candidate] === true) {
      n += 1;
      candidate = `${candidateBase}-${n}`;
    }
    taken[candidate] = true;
    return candidate;
  });
}

/**
 * AGSC-03-11: the inline link and image targets of a body, outside fenced blocks and
 * outside inline code spans. Reference-style links are not produced by this system's
 * writer and are not read here; a target this scan does not see simply produces no
 * `mentions` edge, which is the safe direction — a page never invents a Link.
 */
function pageInlineTargets(body) {
  const out = [];
  const lines = String(body === undefined || body === null ? '' : body).split('\n');
  let fence = '';
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const opened = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence !== '') {
      if (opened !== null && opened[1].charAt(0) === fence.charAt(0) && opened[1].length >= fence.length) fence = '';
      continue;
    }
    if (opened !== null) { fence = opened[1]; continue; }
    const stripped = line.replace(/`[^`]*`/g, '');
    const pattern = /!?\[[^\]]*\]\(([^()\s]*)(?:\s+"[^"]*")?\)/g;
    let match = pattern.exec(stripped);
    while (match !== null) {
      if (match[1] !== '') out.push(match[1]);
      match = pattern.exec(stripped);
    }
  }
  return out;
}

/**
 * AGSC-03-11 + AGSC-01-35: a body reference resolves to an item when the path it
 * names, relative to the referring file, is an item's path (with or without the `.md`
 * suffix — the repository spelling and the route spelling both designate the item).
 * Anything with a scheme, anything that escapes the Bundle root and anything that
 * names no item resolves to `null`.
 */
function pageResolveBodyReference(item, raw, byPath) {
  const text = String(raw);
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(text) || text.slice(0, 2) === '//' || text.charAt(0) === '/') return null;
  const hash = text.indexOf('#');
  const relative = hash === -1 ? text : text.slice(0, hash);
  const fragment = hash === -1 ? null : text.slice(hash + 1);
  if (relative === '') return null;
  const from = item.path.slice(0, item.path.lastIndexOf('/'));
  const segments = from === '' ? [] : from.split('/');
  const parts = relative.split('/');
  for (let i = 0; i < parts.length; i += 1) {
    if (parts[i] === '' || parts[i] === '.') continue;
    if (parts[i] === '..') {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(parts[i]);
  }
  const path = segments.join('/');
  const target = byPath[path] === undefined ? byPath[`${path}.md`] : byPath[path];
  if (target === undefined) return null;
  if (fragment !== null && pageAnchors(target.body).indexOf(fragment) === -1) return null;
  return target;
}

/* -------------------------------------------------------------------- the tools */

/**
 * The AGSC-09-13 tool implementations over a page corpus.
 *
 * @param {object} corpus `pageCorpus()`'s result.
 * @param {object} core the composition algebra — `globalThis.AGSC_CORE` in a page,
 *   the same functions required directly in Node. Injected rather than imported so
 *   that this module holds ONE implementation and no host-specific branch.
 * @returns {{call:Function}} `call(name, args)` returns an AGSC-08-18 envelope and
 *   never throws for a domain fault.
 */
function pageToolset(corpus, core) {
  const model = corpus || { base: '/', bundleId: undefined, bySlug: {}, index: null, items: [] };
  const base = model.base;
  // re-key into a prototype-free map whatever the caller supplied, so that a
  // corpus built by hand is as safe as one `pageCorpus` built.
  const bySlug = Object.create(null);
  {
    const supplied = model.bySlug || {};
    const names = Object.keys(supplied);
    for (let i = 0; i < names.length; i += 1) bySlug[names[i]] = supplied[names[i]];
  }

  // AGSC-06-21: an index the page could not read WHOLE is not an empty
  // index. Returning no hit over a manifest whose shard was not served is a wrong
  // answer and a silent one — so the two tools that read the index say what is
  // missing, with the registered code for a file that is not there.
  const indexFault = () => {
    const index = model.index;
    if (index === null || index === undefined || index.incomplete !== true) return null;
    const missing = Array.isArray(index.missing) ? index.missing.join(', ') : 'a shard';
    return `the search index is incomplete: this node published /search.json as the`
      + ` AGSC-06-21 manifest and ${missing} could not be read from this origin`;
  };

  const hitsFor = (query) => {
    const wanted = pageTokenize(query);
    const index = model.index;
    if (wanted.length === 0 || index === null || index === undefined || !Array.isArray(index.docs)) return [];
    const terms = index.terms || {};
    const hits = [];
    for (let d = 0; d < index.docs.length; d += 1) {
      const doc = index.docs[d];
      let score = 0;
      for (let w = 0; w < wanted.length; w += 1) {
        const postings = terms[wanted[w]];
        if (Array.isArray(postings) && postings.indexOf(d) !== -1) score += 1;
      }
      if (score === 0) continue;
      const item = bySlug[doc.slug];
      hits.push({
        iri: pageItemIri(base, item === undefined ? 'concept' : item.type, doc.slug),
        score,
        slug: doc.slug,
        title: doc.title,
      });
    }
    hits.sort((a, b) => b.score - a.score || pageCompare(a.slug, b.slug));
    return hits;
  };

  const describe = (slug) => {
    const item = bySlug[slug];
    const fm = (item && item.frontmatter) || {};
    return typeof fm.description === 'string' && fm.description !== '' ? fm.description : String(fm.title === undefined ? '' : fm.title);
  };

  const implementations = {
    ask: (args) => {
      const fault = indexFault();
      if (fault !== null) return pageErrorEnvelope('ask', 'AGSC-E901', fault);
      const question = typeof args.question === 'string' ? args.question : '';
      const hits = hitsFor(question);
      if (hits.length === 0) {
        return {
          body: pageNoAnswer(), citations: [], license: pageTerms(),
          source: 'ask', trust: 'untrusted', type: 'answer',
        };
      }
      const cited = hits.slice(0, 3);
      return {
        body: `${cited.map((h) => describe(h.slug)).join(' ')} Content Use Terms: ${pageTerms()}.`,
        citations: cited.map((h) => h.iri),
        license: pageTerms(),
        source: 'ask',
        trust: 'untrusted',
        type: 'answer',
      };
    },

    compose: (args) => {
      const selection = Array.isArray(args.selection) ? args.selection : [];
      const flat = model.items.map((i) => {
        const copy = { slug: i.slug, type: i.type };
        const fm = i.frontmatter || {};
        const names = Object.keys(fm);
        for (let k = 0; k < names.length; k += 1) copy[names[k]] = fm[names[k]];
        return copy;
      });
      const result = core.compose(flat, selection);
      return pageEnvelope('compose', 'verdict', {
        added: result.added,
        conflicts: result.conflicts,
        hidden: result.hidden,
        selection: result.selection,
        valid: result.valid,
        warnings: result.warnings,
      });
    },

    links: (args) => {
      let slug = args.slug;
      if (slug === undefined && args.iri !== undefined) {
        const resolved = pageSlugOfIri(String(args.iri), base, model.bundleId);
        if (resolved.code !== null) {
          return pageErrorEnvelope('links', resolved.code, resolved.code === 'AGSC-E309'
            ? 'memory:// names a foreign bundle — use the https:// IRI'
            : 'no item with that IRI in this Bundle');
        }
        slug = resolved.slug;
      }
      const item = bySlug[slug];
      if (item === undefined) return pageErrorEnvelope('links', 'AGSC-E301', 'no item with that slug in this Bundle');
      const edges = pageEdges(model.items).filter((e) => e.source === item.slug);
      return pageEnvelope('links', 'links', { edges, slug: item.slug });
    },

    // AGSC-08-04 / AGSC-11-14: the payload is RETURNED. A page performs no write of
    // any kind — no network write, and not even the local patch file the stdio
    // transport's caller may write. `markdown` is the published source file with
    // exactly one blank line between the frontmatter block and the body, as
    // `mcp-tools.js` writes it, so the bytes are the local server's bytes.
    propose: (args) => {
      const item = bySlug[args.slug];
      if (item === undefined) return pageErrorEnvelope('propose', 'AGSC-E301', 'no item with that slug in this Bundle');
      if (args.task_state !== undefined) {
        const moved = pageBoardMove(item.block, item.body, item.frontmatter, item.type, item.slug, args,
          (model.claimed || {})[item.slug]);
        if (moved.code !== undefined) return pageErrorEnvelope('propose', moved.code, moved.message);
        return pageEnvelope('propose', 'proposal', {
          from: moved.from,
          iri: pageItemIri(base, item.type, item.slug),
          markdown: moved.markdown,
          patch: moved.patch,
          path: moved.path,
          slug: item.slug,
          task_state: moved.task_state,
        });
      }
      return pageEnvelope('propose', 'proposal', {
        iri: pageItemIri(base, item.type, item.slug),
        markdown: `${item.block}${item.body.charAt(0) === '\n' ? '' : '\n'}${item.body}`,
        slug: item.slug,
      });
    },

    read: (args) => {
      const item = bySlug[args.slug];
      if (item === undefined) return pageErrorEnvelope('read', 'AGSC-E301', 'no item with that slug in this Bundle');
      return pageEnvelope('read', 'item', {
        body: item.body,
        frontmatter: item.frontmatter,
        iri: pageItemIri(base, item.type, item.slug),
        slug: item.slug,
      });
    },

    // AGSC-09-14b: a total function — an invalid `sources[]` entry is DROPPED with
    // AGSC-E506, never rejected. `at` supplies the instant; a clock is never read.
    remember: (args) => {
      const kinds = pageKindToType();
      const kind = kinds[args.kind] === undefined ? 'concept' : args.kind;
      const type = kinds[kind];
      // AGSC-09-14b: a Gate's Level is a governance decision a
      // tool call may not invent, and an episode's schema branch requires `actor`.
      if (args.kind === 'gate') {
        return pageErrorEnvelope('remember', 'AGSC-E203', 'remember does not accept kind "gate": a Gate\'s Level is a governance decision (AGSC-09-14b)');
      }
      if (type === 'episode' && typeof args.actor !== 'string') {
        return pageErrorEnvelope('remember', 'AGSC-E003', 'an episode needs the declared actor (AGSC-09-14b)');
      }
      // AGSC-09-14b: no `at` on an episode is AGSC-E003; an actor outside AGSC-02-09 is refused.
      if (type === 'episode' && typeof args.at !== 'string') {
        return pageErrorEnvelope('remember', 'AGSC-E003', 'an episode needs the instant it started, `at` (AGSC-09-14b)');
      }
      if (args.actor !== undefined && !/^(?:human:[a-z0-9][a-z0-9._-]*|process:[a-z0-9][a-z0-9._-]*|[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._+-]*)$/u.test(String(args.actor))) {
        return pageErrorEnvelope('remember', 'AGSC-E204', 'actor must be human:<id>, process:<id> or <producer>/<version> (AGSC-02-09)');
      }
      const title = typeof args.title === 'string' ? args.title : '';
      const findings = [];
      // AGSC-09-14b (2026-09-25): the page has no identity to declare, so a call
      // without an operator returns the item with `prov.operator` absent and says
      // so; the Proposal path refuses it until a person supplies one.
      if (typeof args.operator !== 'string') {
        findings.push({ code: 'AGSC-E506', message: 'no operator declared: prov.operator is absent and the Proposal needs one (AGSC-09-14b)', severity: 'warn' });
      }
      const taken = new Set(Object.keys(bySlug));
      const slug = pageDedupe(pageSlugify(title), taken);
      const frontmatter = { title, type };
      if (type === 'concept') frontmatter.kind = args.kind === 'task' ? 'task' : 'explainer';
      // AGSC-10-16: a new task on a board — SUBMITTED, filed in the cluster named.
      if (args.kind === 'task') {
        frontmatter.task_state = 'TASK_STATE_SUBMITTED';
        if (typeof args.cluster === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/u.test(args.cluster)) frontmatter.clusters = [args.cluster];
      }
      // A comment on a task (or any item) links to it.
      if (typeof args.about === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/u.test(args.about)) frontmatter.related = [args.about];
      if (type === 'episode') {
        frontmatter.started = args.at;
        frontmatter.outcome = args.outcome === undefined ? 'partial' : args.outcome;
        // no `severity`: the episode branch has no such key (AGSC-09-14b, 2026-09-24)
      }
      // the lesson branch requires `severity` (AGSC-09-14b default).
      if (type === 'lesson') frontmatter.severity = args.severity === undefined ? 'info' : args.severity;
      if (typeof args.actor === 'string') frontmatter.actor = args.actor;
      // AGSC-09-14b / AGSC-02-14: `usage` is carried onto the episode verbatim.
      if (type === 'episode' && args.usage !== null && typeof args.usage === 'object' && !Array.isArray(args.usage)) {
        frontmatter.usage = args.usage;
      }
      frontmatter.prov = {
        agent: args.agent,
        model: args.model,
        operator: args.operator,
        origin: args.origin === 'human' ? 'human' : 'ai-generated',
      };
      const sources = [];
      const supplied = Array.isArray(args.sources) ? args.sources : [];
      for (let i = 0; i < supplied.length; i += 1) {
        const source = supplied[i];
        if (!source || typeof source.resource !== 'string'
          || !/^(https?:\/\/\S+|urn:agsc:channel:[a-z0-9-]+:\S+)$/u.test(source.resource)) {
          findings.push({ code: 'AGSC-E506', message: 'source dropped', severity: 'warn' });
          continue;
        }
        sources.push({ id: source.id, resource: source.resource });
      }
      if (sources.length > 0) frontmatter.sources = sources;
      return pageEnvelope('remember', 'proposal', {
        body: typeof args.body === 'string' ? pageNfc(args.body) : '',
        findings,
        frontmatter,
        path: `content/${pageTypePlural(type)}/${slug}.md`,
        slug,
      });
    },

    search: (args) => {
      const fault = indexFault();
      if (fault !== null) return pageErrorEnvelope('search', 'AGSC-E901', fault);
      return pageEnvelope('search', 'items', {
        hits: hitsFor(typeof args.query === 'string' ? args.query : ''),
      });
    },
  };

  return {
    call: (name, args) => {
      // AGSC-09-13: the tool set is the set of implementations above and is stated
      // nowhere else in this module — `boundary/surfaces.js#TOOL_NAMES` is the one
      // declaration of the seven names, and `tests/distribution/page-tools.test.js`
      // asserts that these implementations are exactly those names.
      if (!Object.prototype.hasOwnProperty.call(implementations, name)) {
        return pageErrorEnvelope(String(name), 'AGSC-E001', 'no such tool');
      }
      const supplied = args && typeof args === 'object' ? args : {};
      const required = pageRequiredArguments()[name];
      const missing = required.filter((key) => supplied[key] === undefined || supplied[key] === null);
      if (missing.length > 0) {
        return pageErrorEnvelope(name, 'AGSC-E003', `missing required argument: ${missing.join(', ')}`);
      }
      const cap = 1024 * 1024;
      const oversized = pageArguments()[name].filter((key) => typeof supplied[key] === 'string'
        && new TextEncoder().encode(supplied[key]).length > cap);
      if (oversized.length > 0) {
        return pageErrorEnvelope(name, 'AGSC-E904',
          `argument above the ${cap}-byte cap: ${oversized.join(', ')} (AGSC-01-16)`);
      }
      // AGSC-05-04b: a `memory://` alias is accepted wherever a slug argument is and
      // normalized to the slug before any other rule runs — `mcp-tools.js#memoryAliases`.
      const normalized = Object.assign({}, supplied);
      let refused = null;
      const prefix = pageBaseIri(base);
      const one = (value) => {
        if (refused !== null || typeof value !== 'string') return value;
        // AGSC-05-04a: wherever `memory://` is accepted, this node's https item IRI is too.
        const iri = /^https?:\/\//u.test(prefix) && value.slice(0, prefix.length) === prefix;
        if (value.slice(0, 9) !== 'memory://' && !iri) return value;
        const resolved = pageSlugOfIri(value, base, model.bundleId);
        if (resolved.code !== null) refused = resolved.code;
        return resolved.slug;
      };
      ['about', 'cluster', 'slug'].forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(normalized, key)) normalized[key] = one(normalized[key]);
      });
      if (Array.isArray(normalized.selection)) normalized.selection = normalized.selection.map(one);
      if (refused !== null) {
        return pageErrorEnvelope(name, refused, refused === 'AGSC-E309'
          ? 'memory:// names a foreign bundle — use the https:// IRI'
          : 'no item with that IRI in this Bundle');
      }
      return implementations[name](normalized);
    },
  };
}

/**
 * AGSC-02-99: the nine Agent2Agent task states, verbatim — the values a board move
 * may propose (AGSC-10-17).
 */
function pageTaskStates() {
  return ['TASK_STATE_UNSPECIFIED', 'TASK_STATE_SUBMITTED', 'TASK_STATE_WORKING',
    'TASK_STATE_INPUT_REQUIRED', 'TASK_STATE_AUTH_REQUIRED', 'TASK_STATE_COMPLETED',
    'TASK_STATE_FAILED', 'TASK_STATE_CANCELED', 'TASK_STATE_REJECTED'];
}

/**
 * One top-level scalar line of a frontmatter block set to `value`: replaced where
 * the key is, else inserted after the first line whose key is in `after`, else
 * before the line whose key is `before`. The block is the canonical one
 * (AGSC-04-19), so a key is one line and the text edit is exact.
 */
function pageSetLine(block, key, value, after, before) {
  const lines = block.split('\n');
  const line = `${key}: ${value}`;
  const keyOf = (text) => {
    const m = /^([A-Za-z_][A-Za-z0-9_-]*):/u.exec(text);
    return m === null ? null : m[1];
  };
  for (let i = 0; i < lines.length; i += 1) {
    if (keyOf(lines[i]) === key) {
      lines[i] = line;
      return lines.join('\n');
    }
  }
  for (let a = 0; a < after.length; a += 1) {
    for (let i = 0; i < lines.length; i += 1) {
      if (keyOf(lines[i]) !== after[a]) continue;
      let end = i + 1;
      while (end < lines.length && /^(?: |- )/u.test(lines[end])) end += 1;
      lines.splice(end, 0, line);
      return lines.join('\n');
    }
  }
  for (let i = 0; i < lines.length; i += 1) {
    if (keyOf(lines[i]) === before) {
      lines.splice(i, 0, line);
      return lines.join('\n');
    }
  }
  const close = lines.lastIndexOf('---');
  lines.splice(close, 0, line);
  return lines.join('\n');
}

/**
 * AGSC-04-19's temporal quoting, on the text of a frontmatter block: a scalar that
 * is a date or an instant is written double-quoted, as `lint --fix` writes it
 * (`governance/fix.js#quoteTemporal`), so a patch prepared from the block applies
 * to the lint-normalized file in the repository.
 */
function pageQuoteTemporal(block) {
  return block.split('\n').map((line) => line.replace(
    /^(\s*(?:- )?(?:[A-Za-z_][A-Za-z0-9_-]*: )?)(\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}Z)?)$/u,
    (_, lead, value) => `${lead}"${value}"`,
  )).join('\n');
}

/**
 * A unified diff of two texts that differ only inside the frontmatter block, as
 * one hunk over the whole block (every unchanged line is context), which
 * `git apply` accepts. Lines are aligned by a longest-common-subsequence table:
 * the block is a few dozen lines, so the table is small.
 */
function pageUnifiedDiff(path, before, after) {
  const a = before.split('\n');
  const b = after.split('\n');
  const endA = a.indexOf('---', 1);
  const endB = b.indexOf('---', 1);
  const x = a.slice(0, endA + 1);
  const y = b.slice(0, endB + 1);
  const table = [];
  for (let i = x.length; i >= 0; i -= 1) {
    table[i] = [];
    for (let j = y.length; j >= 0; j -= 1) {
      if (i === x.length || j === y.length) table[i][j] = 0;
      else if (x[i] === y[j]) table[i][j] = table[i + 1][j + 1] + 1;
      else table[i][j] = Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) {
      out.push(` ${x[i]}`);
      i += 1;
      j += 1;
    } else if (i < x.length && (j === y.length || table[i + 1][j] >= table[i][j + 1])) {
      out.push(`-${x[i]}`);
      i += 1;
    } else {
      out.push(`+${y[j]}`);
      j += 1;
    }
  }
  return [`--- a/${path}`, `+++ b/${path}`, `@@ -1,${x.length} +1,${y.length} @@`, ...out, ''].join('\n');
}

/**
 * AGSC-10-17: a board move — claim (`TASK_STATE_WORKING`), progress or finish — as a
 * PREPARED Proposal: the diff touches `task_state` and, when `at` is given,
 * `modified`, and nothing else of the task. It is a payload; nothing is written,
 * sent or merged (AGSC-08-04). `from` is the state the move was prepared against:
 * a second claim prepared against the same state no longer applies once the first
 * is merged (the forge conflict of AGSC-10-17).
 */
function pageBoardMove(block, body, frontmatter, type, slug, args, claimedBy) {
  const states = pageTaskStates();
  if (states.indexOf(args.task_state) === -1) {
    return { code: 'AGSC-E203', message: `task_state must be one of ${states.join(', ')} (AGSC-02-99)` };
  }
  if (type !== 'concept' || frontmatter.kind !== 'task') {
    return { code: 'AGSC-E207', message: 'only a concept of kind task has a task_state (AGSC-02-99)' };
  }
  // AGSC-10-17: a claim of a task already held in TASK_STATE_WORKING by another
  // participant is AGSC-E511, for EVERY caller — a person, an agent that declares
  // no lane, a lane. The holder is the derived `claimed_by` of the board export,
  // else the task's `prov.agent`; a lane's commit author `process:<name>` and the
  // lane name `<name>` are one participant.
  if (args.task_state === 'TASK_STATE_WORKING' && frontmatter.task_state === 'TASK_STATE_WORKING') {
    const prov = frontmatter.prov || {};
    const holder = claimedBy !== undefined && claimedBy !== null ? String(claimedBy)
      : (prov.agent === undefined || prov.agent === null ? null : String(prov.agent));
    const caller = args.agent !== undefined && args.agent !== null ? String(args.agent)
      : (args.operator !== undefined && args.operator !== null ? String(args.operator) : null);
    const bare = (v) => v.replace(/^process:/u, '');
    // A holder no history names is still somebody: only the known holder may re-claim.
    if (holder === null || caller === null || bare(holder) !== bare(caller)) {
      return { code: 'AGSC-E511', message: `the task "${slug}" is already TASK_STATE_WORKING${holder === null ? '' : ` under ${holder}`}; the first merged claim wins (AGSC-10-17)` };
    }
  }
  const current = pageQuoteTemporal(block);
  let next = pageSetLine(current, 'task_state', args.task_state, ['kind'], 'prov');
  if (args.at !== undefined) {
    const day = /^\d{4}-\d{2}-\d{2}/u.exec(String(args.at));
    if (day === null) return { code: 'AGSC-E204', message: 'at must be a date or an instant (AGSC-02-06)' };
    next = pageSetLine(next, 'modified', `"${day[0]}"`, ['date'], 'prov');
  }
  const path = `content/${pageTypePlural(type)}/${slug}.md`;
  const before = `${current}${body}`;
  const after = `${next}${body}`;
  return {
    from: frontmatter.task_state === undefined ? 'TASK_STATE_UNSPECIFIED' : String(frontmatter.task_state),
    markdown: after,
    patch: pageUnifiedDiff(path, before, after),
    path,
    task_state: args.task_state,
  };
}

/** AGSC-09-13: the ARGUMENT names, the same list the manifest publishes. */
function pageArguments() {
  return {
    ask: ['question'],
    compose: ['selection'],
    links: ['iri', 'slug'],
    propose: ['agent', 'at', 'slug', 'task_state'],
    read: ['slug'],
    remember: ['about', 'actor', 'agent', 'at', 'body', 'cluster', 'kind', 'model', 'operator', 'origin',
      'outcome', 'severity', 'sources', 'title', 'usage'],
    search: ['query'],
  };
}

/** AGSC-09-13a: a published `required` that is never enforced is a silent success. */
function pageRequiredArguments() {
  return {
    ask: ['question'],
    compose: ['selection'],
    links: [],
    propose: ['slug'],
    read: ['slug'],
    remember: ['body', 'kind', 'title'],
    search: ['query'],
  };
}

/**
 * AGSC-05-04b + AGSC-05-01: the slug an IRI names, with the code to answer when it
 * names none. `memory://<bundle-id>/<slug>` resolves only for THIS Bundle's own id
 * and is `AGSC-E309` for any other, "because a node has no registry of other nodes'
 * ids"; an `https:` IRI under this node's base yields its slug; anything else is
 * `AGSC-E301`. This is `mcp-tools.js#slugFromIri`, over the id the writer emitted
 * into this script rather than over a loaded configuration.
 */
function pageSlugOfIri(iri, base, bundleId) {
  const text = String(iri);
  const memory = /^memory:\/\/([^/]+)\/(?:[a-z]+\/)?([^/#?]+)/u.exec(text);
  if (memory) {
    if (memory[1] !== bundleId) return { code: 'AGSC-E309', slug: null };
    return { code: null, slug: memory[2] };
  }
  const prefix = pageBaseIri(base);
  if (base !== '' && text.slice(0, prefix.length) === prefix) {
    const parts = text.slice(prefix.length).split('/').filter((p) => p !== '');
    if (parts.length >= 2) return { code: null, slug: parts[1] };
  }
  return { code: 'AGSC-E301', slug: null };
}

/* ------------------------------------------------------------------- the bundle */

/**
 * Every name whose SOURCE TEXT is emitted into the page, in emission order. A
 * function added here without being self-contained fails
 * `tests/arch/composition-portable.test.js`.
 */
const PORTABLE = Object.freeze(['pageTerms', 'pageNoAnswer', 'pageLinkKeys',
  'pageInverseKeys', 'pageTypePlural', 'pageTypedScalars', 'pageApplyTypes', 'pageKindToType',
  'pageEnvelope', 'pageErrorEnvelope',
  'pageBaseIri', 'pageItemIri', 'pageNfc', 'pageTokenize', 'pageAnchorOf', 'pageSlugify',
  'pageDedupe', 'pageSplitFrontmatter', 'pageParseFrontmatter', 'pageIndentOf', 'pageNextMeaningful',
  'pageParseMap', 'pageParseValue', 'pageParseSeq', 'pageKeyEnd', 'pageScalar',
  'pageBlockScalar', 'pageShardRoutes', 'pageIndexOf', 'pageCorpus', 'pageClaimants', 'pageDeclaresBoards', 'pageBaseOf', 'pageEdges', 'pageCompare', 'pageAnchors',
  'pageInlineTargets', 'pageResolveBodyReference', 'pageToolset', 'pageArguments',
  'pageRequiredArguments', 'pageSlugOfIri', 'pageTaskStates', 'pageQuoteTemporal', 'pageSetLine', 'pageUnifiedDiff', 'pageBoardMove']);

const SOURCE = Object.freeze({
  pageTerms,
  pageNoAnswer,
  pageLinkKeys,
  pageInverseKeys,
  pageTypePlural,
  pageTypedScalars,
  pageApplyTypes,
  pageKindToType,
  pageEnvelope,
  pageErrorEnvelope,
  pageBaseIri,
  pageItemIri,
  pageNfc,
  pageTokenize,
  pageAnchorOf,
  pageSlugify,
  pageDedupe,
  pageSplitFrontmatter,
  pageParseFrontmatter,
  pageIndentOf,
  pageNextMeaningful,
  pageParseMap,
  pageParseValue,
  pageParseSeq,
  pageKeyEnd,
  pageScalar,
  pageBlockScalar,
  pageShardRoutes,
  pageIndexOf,
  pageCorpus,
  pageClaimants,
  pageDeclaresBoards,
  pageBaseOf,
  pageEdges,
  pageCompare,
  pageAnchors,
  pageInlineTargets,
  pageResolveBodyReference,
  pageToolset,
  pageArguments,
  pageRequiredArguments,
  pageSlugOfIri,
  pageTaskStates,
  pageQuoteTemporal,
  pageSetLine,
  pageUnifiedDiff,
  pageBoardMove,
});

/**
 * The page-tool script: a CLASSIC script (AGSC-06-17's `script-src 'self'` admits no
 * module graph and no inline script) that installs `globalThis.AGSC_PAGE_TOOLS` and,
 * in a document, fetches the published routes of AGSC-06-01 from THIS ORIGIN ONLY and
 * installs `globalThis.AGSC_TOOLS` — the object `distribution/webmcp.js` dispatches
 * to. Until the corpus has loaded, a call returns a promise of the envelope: the
 * WebMCP draft's `ToolExecuteCallback` is `Promise<any>`, so a promise is exactly
 * what the browser expects.
 *
 * @param {object} [options]
 * @param {string} [options.specVersion] recorded in the banner comment only.
 * @returns {string} LF-terminated, ending in exactly one LF.
 */
function bundle(options) {
  const opts = options || {};
  const bundleId = opts.bundleId === undefined || opts.bundleId === null ? '' : String(opts.bundleId);
  const parts = ['\'use strict\';',
    '// SPDX-License-Identifier: Apache-2.0 (the engine\'s code; the prose it carries keeps its own terms)',
    '// AgenticSystemCore page tools (AGSC-09-13, AGSC-09-16). GENERATED — every',
    '// function below is the SOURCE TEXT of the function Node runs, so the local',
    '// tools and the page tools cannot drift. No network beyond this origin, no key,',
    '// no server, no cookie, no storage.',
    `// spec_version: ${opts.specVersion === undefined ? 'unset' : opts.specVersion}`,
    '(function () {'];
  for (let i = 0; i < PORTABLE.length; i += 1) parts.push(String(SOURCE[PORTABLE[i]]));
  parts.push(`  var API = {
${PORTABLE.map((name) => `    ${name}: ${name}`).join(',\n')}
  };
  globalThis.AGSC_PAGE_TOOLS = API;

  // AGSC-05-04b: a page resolves \`memory://<bundle-id>/<slug>\` only for THIS
  // Bundle's id, which no published route carries, so the writer emits it here.
  API.BUNDLE_ID = ${JSON.stringify(bundleId)};

  // AGSC-06-01: the routes a page reads, and no others. Every one is same-origin.
  API.ROUTES = ['/.well-known/knowledge-linkset', '/search.json'];

  API.load = function (fetchLike) {
    var get = function (route) {
      return fetchLike(route).then(function (r) { return r.ok ? r.text() : null; })
        .catch(function () { return null; });
    };
    var sources = {};
    return Promise.all(API.ROUTES.map(function (route) {
      return get(route).then(function (text) { if (text !== null) sources[route] = text; });
    })).then(function () {
      // AGSC-06-21: above 500 items /search.json is the MANIFEST {docs_total,
      // shards[]} and the index is the shards. The page follows it exactly as the
      // local tools do, and only to the /search-<nn>.json routes of this origin
      // (pageShardRoutes) — never to a URL a document named.
      var manifest = null;
      try { manifest = JSON.parse(sources['/search.json']); } catch (e) { manifest = null; }
      return Promise.all(pageShardRoutes(manifest).map(function (route) {
        return get(route).then(function (text) { if (text !== null) sources[route] = text; });
      }));
    }).then(function () {
      var index = pageIndexOf(sources);
      var docs = (index && index.docs) || [];
      return Promise.all(docs.map(function (doc) {
        return get('/pages/' + encodeURIComponent(doc.slug) + '.md').then(function (text) {
          if (text !== null) sources['/pages/' + doc.slug + '.md'] = text;
        });
      }));
    }).then(function () {
      // AGSC-10-13: the board exports carry the derived \`claimed_by\` a claim is
      // checked against (AGSC-10-17). A node with no task has no /boards/ route and
      // no rel#boards link, so the page asks for the index only when it is declared.
      if (!pageDeclaresBoards(sources)) return null;
      return get('/boards/index.json').then(function (text) {
        var boards = [];
        try { boards = (JSON.parse(text) || {}).boards || []; } catch (e) { boards = []; }
        return Promise.all(boards.map(function (entry) {
          var cluster = entry && typeof entry.cluster === 'string' ? entry.cluster : '';
          if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(cluster)) return null;
          return get('/boards/' + cluster + '.json').then(function (board) {
            if (board !== null) sources['/boards/' + cluster + '.json'] = board;
          });
        }));
      });
    }).then(function () { return pageCorpus(sources, { bundleId: API.BUNDLE_ID }); });
  };

  API.install = function (corpus, core) {
    var toolset = pageToolset(corpus, core);
    globalThis.AGSC_TOOLS = toolset;
    return toolset;
  };

  // Feature detection is WebMCP's, in webmcp.js; this bootstrap only makes the
  // implementation available. A page without \`fetch\` or without \`document\` keeps
  // working and simply has no page tools (AGSC-09-16).
  //
  // WHEN the corpus is read. The corpus is every published item's Markdown view
  // plus the index, the discovery document and the boards — the whole node, one
  // same-origin request per item — and a person reading one item page never calls
  // a tool. So the read starts at once only where a caller is expected: a browser
  // that exposes \`document.modelContext\` (an agent may call the moment the tools
  // register) and the \`/compose/\` page (its controller calls \`start\`). Elsewhere
  // the first \`AGSC_TOOLS.call\` starts it, and every call before the corpus is in
  // returns a promise of the envelope, exactly as before. No answer changes: the
  // same routes, the same bytes, the same toolset — read later or not at all.
  API.ready = null;
  API.start = function () {
    if (API.ready !== null) return API.ready;
    var pending = API.load(function (route) { return fetch(route); })
      .then(function (corpus) { return pageToolset(corpus, globalThis.AGSC_CORE); });
    // Once the corpus is in, the SYNCHRONOUS toolset replaces the promise wrapper, so
    // a tool call costs no round trip and executeTool resolves immediately.
    API.ready = pending.then(function (toolset) {
      globalThis.AGSC_TOOLS = toolset;
      return toolset;
    }).catch(function () { return globalThis.AGSC_TOOLS; });
    return API.ready;
  };
  if (typeof document !== 'undefined' && typeof fetch === 'function' && globalThis.AGSC_TOOLS === undefined) {
    globalThis.AGSC_TOOLS = {
      call: function (name, args) {
        return API.start().then(function (toolset) { return toolset.call(name, args); });
      }
    };
    var context = document.modelContext;
    if (context && typeof context.registerTool === 'function') API.start();
  }
}());`);
  return `${parts.join('\n')}\n`;
}

module.exports = {
  PORTABLE,
  bundle,
  pageBoardMove,
  pageTaskStates,
  pageUnifiedDiff,
  pageApplyTypes,
  pageTypedScalars,
  pageAnchorOf,
  pageAnchors,
  pageCorpus,
  pageClaimants,
  pageDeclaresBoards,
  pageEdges,
  pageIndexOf,
  pageInlineTargets,
  pageParseFrontmatter,
  pageSplitFrontmatter,
  pageShardRoutes,
  pageTokenize,
  pageToolset,
};
