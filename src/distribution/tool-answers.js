'use strict';
/**
 * CONTEXT Distribution (Emission) — Surface: what the tool contract of 1.1 adds, in ONE
 * portable source for both transports.
 *
 * Implements, for the local tool server (`mcp-tools.js`) and the page tools (`page-tools.js`)
 * alike: the bound on `search` and `ask` (AGSC-09-13: at most 100 hits, in the order of the
 * ranking, `total` beside them only above the bound), the citation record of a chunk that
 * `read` carries (AGSC-09-13, from the chunk lines of AGSC-06-29 the node published), the
 * answer of `explain` (AGSC-09-13 over the readings of AGSC-05-33), the findings of `check`
 * (AGSC-09-13 over the Link warnings of AGSC-03-23…03-26) and the composition of the `brief`
 * answer (AGSC-09-13 over AGSC-07-25). A page answers over the listed set of AGSC-09-16; the
 * local server composes `brief` over the listed set too, and answers `explain` and `check` from
 * the Bundle on disk, drafts included (AGSC-09-13), so it hands in the edges it answers over.
 * Requirements: PRD-023, PRD-051.
 *
 * WHY ONE SOURCE. AGSC-09-16 asks the two transports for results equal as values. The local
 * server calls these functions in Node, and `page-tools.js#bundle` emits their own source
 * text into `/compose/agsc-page-tools.js` after its own functions, so the page runs the very
 * bytes Node runs. Every function on `PORTABLE` is a self-contained top-level declaration
 * whose only free names are the other functions on that list (`tests/arch/page-tools-portable.test.js`).
 * The file exists beside `page-tools.js` because that module is at its size budget.
 *
 * WHERE THE FACTS COME FROM. Both transports read the build's own routes: the local server
 * the route map of the build its verb made (`application/cli/verbs/mcp.js`), the page the
 * same routes fetched from its origin. The build instant, the content version and the
 * specification version come from the discovery document (AGSC-06-08), the chunk lines from
 * `/chunks.jsonl` and its shards (AGSC-06-26, AGSC-06-31). Three facts of the specification
 * are restated here because a page has no other module to read; each is compared with the
 * engine's own module by `tests/distribution/tool-answers.test.js`: the relation table of
 * `knowledge/relations.js` (inverse names, transitive keys, self-links, expected target
 * kinds), the readings of `knowledge/derive.js` and the Link warnings of `knowledge/links.js`;
 * and the citation record of `knowledge/chunks.js#citationRecord`.
 *
 * THE DOMAIN LAYER (vector `cli-0037`). For an item that states a key of AGSC-02-25, a `search`
 * hit and the `read` body gain a member `domain` (`toolDomainAnswer`, which both transports
 * apply to the answer they computed), and the `items` entries of `brief` carry it as AGSC-07-25
 * says (`composition/brief.js#briefDomainOf`, the `briefOf` the algebra hands in); an item that
 * states none gets no member, so its answer keeps its bytes. The parts are those of
 * `composition/brief.js#domainOf`, the one reader of the rule; a page reads it from the algebra
 * (`AGSC_CORE.domainOf`). The functions of `DOMAIN_PORTABLE` are emitted into the page only for
 * a node whose listed items state a domain key, so every other node's page script keeps its
 * bytes (AGSC-01-41).
 *
 * PURE: no fs, no clock, no network, no process. `toolSha256Hex` is Web Crypto, the one
 * hasher a page has; the local server hands in Node's own instead (`mcp-tools.js`).
 */

/* -------------------------------------------------------------------- the bound */

/** AGSC-09-13: the most hits a `search` answer carries and the most IRIs an `ask` answer cites. */
function toolHitBound() {
  return 100;
}

/**
 * AGSC-09-13, the bound: the first 100 hits of the ranked list and, only when more items
 * matched, `total`, their number. At or under the bound the body is `{hits}`, the bytes of 1.0.
 *
 * @param {Array<object>} hits every hit, ranked (score highest first, then slug by code point).
 * @returns {{hits:Array<object>, total?:number}}
 */
function toolBounded(hits) {
  const bound = toolHitBound();
  if (hits.length <= bound) return { hits };
  return { hits: hits.slice(0, bound), total: hits.length };
}

/* ------------------------------------------------------------ the host's build */

/** The value of a JSON text, or `null` for a text that is not JSON. */
function toolParse(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

/**
 * AGSC-06-08: one value of the `describedby` link of the discovery document, or `''` when
 * the document is absent or unreadable — never a guess, and never a clock (AGSC-04-11).
 *
 * @param {object} map route -> text, as the build emitted it.
 * @param {string} key a member such as `agsc-generated-at`.
 * @returns {string}
 */
function toolDescribed(map, key) {
  const raw = (map || {})['/.well-known/knowledge-linkset'];
  const doc = typeof raw === 'string' ? toolParse(raw) : null;
  const sets = (doc && Array.isArray(doc.linkset)) ? doc.linkset : [];
  for (let i = 0; i < sets.length; i += 1) {
    const described = (sets[i] && Array.isArray(sets[i].describedby)) ? sets[i].describedby : [];
    for (let j = 0; j < described.length; j += 1) {
      const values = described[j] && described[j][key];
      if (Array.isArray(values) && values.length > 0) return String(values[0]);
    }
  }
  return '';
}

/**
 * The facts of the build a node published that the brief and the citation record carry:
 * the content version (AGSC-04-25), the build instant and the specification version.
 *
 * @param {object} map route -> text.
 * @returns {{bundleVersion:string, instant:string, specVersion:string}}
 */
function toolHost(map) {
  return {
    bundleVersion: toolDescribed(map, 'agsc-bundle-version'),
    instant: toolDescribed(map, 'agsc-generated-at'),
    specVersion: toolDescribed(map, 'agsc-spec-version'),
  };
}

/* ------------------------------------------------------- the citation records */

/**
 * AGSC-06-31: the shard routes a `/chunks.jsonl` manifest names — `/chunks-<nn>.jsonl` of
 * this origin and nothing else, without repetition. A plain export names none.
 *
 * @param {string} text the bytes of `/chunks.jsonl`.
 * @returns {Array<string>}
 */
function toolChunkShardRoutes(text) {
  const first = typeof text === 'string' ? toolParse(text.split('\n')[0]) : null;
  if (!first || !Array.isArray(first.shards)) return [];
  const out = [];
  for (let i = 0; i < first.shards.length; i += 1) {
    const route = String(first.shards[i]);
    if (/^\/chunks-[0-9]{2,}\.jsonl$/.test(route) && out.indexOf(route) === -1) out.push(route);
  }
  return out;
}

/**
 * The chunk lines of a node by item slug, in the order of the file (AGSC-06-29), read from
 * `/chunks.jsonl` or, above 500 items, from the shards its manifest names (AGSC-06-31).
 * `incomplete` is set when a named shard was not served: a reader that cannot see every line
 * must say so rather than answer an empty list. A node that published no chunk export (a
 * Level-0 node) has no line, and every item has no chunk.
 *
 * @param {object} map route -> text.
 * @returns {{bySlug:object, incomplete:boolean, missing:Array<string>}}
 */
function toolChunkIndex(map) {
  const sources = map || {};
  const bySlug = Object.create(null);
  const root = sources['/chunks.jsonl'];
  const shards = toolChunkShardRoutes(root);
  const missing = [];
  const texts = [];
  if (shards.length === 0 && typeof root === 'string') texts.push(root);
  for (let i = 0; i < shards.length; i += 1) {
    if (typeof sources[shards[i]] === 'string') texts.push(sources[shards[i]]);
    else missing.push(shards[i]);
  }
  for (let t = 0; t < texts.length; t += 1) {
    const lines = texts[t].split('\n');
    for (let l = 0; l < lines.length; l += 1) {
      const line = lines[l] === '' ? null : toolParse(lines[l]);
      if (line === null || typeof line !== 'object' || typeof line.item !== 'string') continue;
      if (bySlug[line.item] === undefined) bySlug[line.item] = [];
      bySlug[line.item].push(line);
    }
  }
  return { bySlug, incomplete: missing.length > 0, missing };
}

/**
 * AGSC-09-13, the citation record of one chunk: exactly the members the rule lists, each with
 * the value of the chunk line, the content version beside them, and no retrieval time (the
 * client adds it). `license_url` only where the line carries one (AGSC-06-44). This is
 * `knowledge/chunks.js#citationRecord`, restated for the page.
 *
 * @param {object} line one parsed line of `/chunks.jsonl`.
 * @param {string} bundleVersion the content version of AGSC-04-25.
 * @returns {object}
 */
function toolCitationRecord(line, bundleVersion) {
  const out = {
    algorithm: 'sha-256',
    bundle_version: bundleVersion,
    coverage: 'text',
    digest: line.digest,
    id: line.id,
    iri: line.iri,
    item: line.item,
    license: line.license,
  };
  if (line.license_url !== undefined) out.license_url = line.license_url;
  out.ordinal = line.ordinal;
  out.section = line.section;
  out.terms = line.terms;
  return out;
}

/* ------------------------------------------------------------ the relation table */

/**
 * AGSC-03-01, §3.1 table, the columns the two tools read: the computed inverse name, the
 * Transitive reading cell, the self-link reading (AGSC-03-23: `true` when a self-link is
 * the warning `AGSC-E313`) and the Expected target kinds cell (AGSC-03-25), in the shape of
 * `knowledge/relations.js#RELATIONS`.
 */
function toolRelations() {
  const any = { any: true };
  const concept = (kinds) => ({ kinds, type: 'concept' });
  return {
    related: { inverse: 'related', selfWarns: true, targets: any, transitive: false },
    broader: { inverse: 'narrower', selfWarns: false, targets: { sameFamily: true }, transitive: true },
    narrower: { inverse: 'broader', selfWarns: false, targets: { sameFamily: true }, transitive: true },
    uses: { inverse: 'used-by', selfWarns: true, targets: any, transitive: false },
    requires: { inverse: 'required-by', selfWarns: false, targets: any, transitive: true },
    excludes: { inverse: 'excludes', selfWarns: true, targets: any, transitive: false },
    'derived-from': { inverse: 'derivation-of', selfWarns: true, targets: { any: true, lessonTarget: { type: 'episode' } }, transitive: true },
    contradicts: { inverse: 'contradicts', selfWarns: true, targets: any, transitive: false },
    supersedes: { inverse: 'superseded-by', selfWarns: true, targets: { sameType: true }, transitive: true },
    implements: { inverse: 'implemented-by', selfWarns: true, targets: concept(['spec', 'pattern', 'architecture']), transitive: false },
    verifies: { inverse: 'verified-by', selfWarns: true, targets: { oneOf: [concept(['spec', 'task']), { type: 'procedure' }, { type: 'gate' }] }, transitive: false },
    covers: { inverse: 'covered-by', selfWarns: true, targets: any, transitive: false },
    'blocked-by': { inverse: 'blocks', selfWarns: true, targets: concept(['task']), transitive: true },
    'decided-by': { inverse: 'decides', selfWarns: true, targets: concept(['decision']), transitive: false },
  };
}

/**
 * Every name an edge of the fourteen keys can carry — each key and its computed inverse —
 * mapped to the name of the edge it is computed from (AGSC-03-02, AGSC-03-05).
 */
function toolPartners() {
  const table = toolRelations();
  const out = Object.create(null);
  const keys = Object.keys(table);
  for (let i = 0; i < keys.length; i += 1) {
    out[keys[i]] = table[keys[i]].inverse;
    out[table[keys[i]].inverse] = keys[i];
  }
  return out;
}

/* ------------------------------------------------------------------ explain */

/**
 * AGSC-05-33 (c) and (d) for one pair: the chain of two or more edges of `key` that a
 * breadth-first walk from `source` meets first, each frontier in code-point order and each
 * item kept with the predecessor it was first reached from, or `null` when the walk does not
 * reach `target` in two steps or more. `knowledge/derive.js#readings`, restated for one pair.
 */
function toolChain(edges, key, source, target) {
  const adjacency = Object.create(null);
  for (let i = 0; i < edges.length; i += 1) {
    if (edges[i].key !== key) continue;
    if (adjacency[edges[i].source] === undefined) adjacency[edges[i].source] = [];
    adjacency[edges[i].source].push(edges[i].target);
  }
  const order = (list) => list.slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const reached = Object.create(null);
  reached[source] = { depth: 0, from: null };
  let frontier = [source];
  for (let depth = 1; frontier.length > 0; depth += 1) {
    const next = [];
    for (let f = 0; f < frontier.length; f += 1) {
      const targets = order(adjacency[frontier[f]] || []);
      for (let t = 0; t < targets.length; t += 1) {
        if (reached[targets[t]] !== undefined) continue;
        reached[targets[t]] = { depth, from: frontier[f] };
        next.push(targets[t]);
      }
    }
    frontier = order(next);
  }
  const end = reached[target];
  if (end === undefined || end.depth < 2) return null;
  const chain = [];
  for (let node = target; reached[node].from !== null; node = reached[node].from) {
    chain.unshift([reached[node].from, key, node]);
  }
  return chain;
}

/**
 * AGSC-09-13 `explain`: whether the edge `source key target` holds over `edges` (the Link
 * edges the transport answers over, authored and computed), and why. `holds` is `true` for an
 * authored edge (one step, rule `authored`) and for a reading of AGSC-05-33 (its steps);
 * otherwise `holds` is `false` and `because` is `[]` — a relation that does not hold is an
 * answer, not an error. The caller has checked the key and the two slugs.
 *
 * @returns {{because:Array<{from:Array<Array<string>>, rule:string}>, holds:boolean, key:string, source:string, target:string}}
 */
function toolExplanation(edges, key, source, target) {
  const answer = (because) => ({ because, holds: because.length > 0, key, source, target });
  let computed = false;
  for (let i = 0; i < edges.length; i += 1) {
    const e = edges[i];
    if (e.source !== source || e.key !== key || e.target !== target) continue;
    if (!e.computed) return answer([{ from: [[source, key, target]], rule: 'authored' }]);
    computed = true;
  }
  const partner = toolPartners()[key];
  if (computed) {
    const rule = partner === key ? 'symmetric' : 'inverse';
    return answer([{ from: [[target, partner, source]], rule }]);
  }
  const table = toolRelations();
  const row = table[key] || table[partner];
  if (row === undefined || !row.transitive) return answer([]);
  const chain = toolChain(edges, key, source, target);
  if (chain === null) return answer([]);
  return answer([{ from: chain, rule: key === 'requires' || key === 'required-by' ? 'closure' : 'transitive' }]);
}

/* -------------------------------------------------------------------- check */

/** AGSC-03-25: one alternative of an Expected target kinds cell, read against a target. */
function toolIsKind(spec, target) {
  return target.type === spec.type && (spec.kinds === undefined || spec.kinds.indexOf(target.kind) !== -1);
}

/**
 * AGSC-03-25: whether `target` matches the Expected target kinds cell `cell` of a key that
 * `owner` authors. `concept` and `lesson` are one family; for `derived-from` the narrower cell
 * binds only when the owner is a lesson. `knowledge/links.js#matchesExpected`, restated.
 */
function toolTargetMatches(cell, owner, target) {
  const family = (type) => (type === 'lesson' ? 'concept' : type);
  if (cell.any) return cell.lessonTarget === undefined || owner.type !== 'lesson' || toolIsKind(cell.lessonTarget, target);
  if (cell.sameFamily) return family(owner.type) === family(target.type);
  if (cell.sameType) return owner.type === target.type;
  if (cell.oneOf) return cell.oneOf.some((spec) => toolIsKind(spec, target));
  return toolIsKind(cell, target);
}

/**
 * AGSC-03-23…03-26: the Link warnings `AGSC-E313`, `AGSC-E314`, `AGSC-E315` and `AGSC-E316`
 * of a set of items, as findings without a position or a message (AGSC-09-13 `check`):
 * `{code, key, severity, slug, target}`, and `with` on an `AGSC-E314`, the second key of the
 * combination, so that two combinations on one pair stay two findings. `edges` are the Link
 * edges of the set, authored and computed; `itemOf(slug)` gives `{kind, status, type}`.
 * The warnings are those `knowledge/links.js#resolve` reports, in the order of `check`.
 *
 * @returns {Array<object>}
 */
function toolLinkWarnings(edges, itemOf) {
  const table = toolRelations();
  const out = [];
  const nul = String.fromCharCode(0);
  const has = Object.create(null);
  for (let i = 0; i < edges.length; i += 1) has[edges[i].source + nul + edges[i].key + nul + edges[i].target] = true;
  const warn = (code, e, extra) => out.push(Object.assign({ code, key: e.key, severity: 'warn', slug: e.source, target: e.target }, extra));
  for (let i = 0; i < edges.length; i += 1) {
    const e = edges[i];
    const row = table[e.key];
    if (e.computed || row === undefined) continue;
    const owner = itemOf(e.source);
    const target = itemOf(e.target);
    if (e.source === e.target && row.selfWarns) warn('AGSC-E313', e, {});
    if (!toolTargetMatches(row.targets, owner, target)) warn('AGSC-E315', e, {});
    if (e.key === 'supersedes' && (target.status === undefined || target.status === 'stable')) warn('AGSC-E316', e, {});
    const pairs = { requires: ['contradicts', 'excludes', 'supersedes'], uses: ['excludes'] }[e.key] || [];
    for (let p = 0; p < pairs.length; p += 1) {
      if (e.source !== e.target && has[e.source + nul + pairs[p] + nul + e.target]) warn('AGSC-E314', e, { with: pairs[p] });
    }
  }
  const text = (value) => (value === undefined ? '' : String(value));
  const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return out.sort((a, b) => compare(a.slug, b.slug) || compare(a.code, b.code) || compare(a.key, b.key)
    || compare(a.target, b.target) || compare(text(a.with), text(b.with)));
}

/* -------------------------------------------------------------------- brief */

/**
 * AGSC-07-25 through AGSC-09-13 `brief`: the object `brief.json` holds for `selection`,
 * composed over `facts.items` (the listed set, AGSC-09-16) with the host's build instant and
 * content version, writing nothing. `core` is the composition algebra (`compose`, `briefOf`,
 * `selectionDigestInput`); `hash` is SHA-256 to lowercase hex, synchronous in Node and a
 * promise in a page, so the answer is `{body}` or a promise of it.
 *
 * A call the tool cannot fulfil answers `{fault: {code, message}}`, which each transport turns
 * into the error envelope of AGSC-09-13a: `AGSC-E901` when the host has no build instant, because
 * its discovery document (AGSC-06-08) is absent or unreadable and no instant or content version
 * may be invented; `AGSC-E904` when the brief is above the engine's bound
 * (`composition/brief.js#derivedBound`).
 *
 * @param {object} core the algebra, as `composition/browser.js` emits it with the brief.
 * @param {{base:string, host:object, items:Array<object>, licenseProse:string}} facts
 * @param {Array<string>} selection
 * @param {function(string): (string|Promise<string>)} hash
 * @returns {{body: object}|{fault: {code: string, message: string}}|Promise<object>}
 */
function toolBrief(core, facts, selection, hash) {
  if (facts.host.instant === '') {
    return { fault: { code: 'AGSC-E901', message: 'no build instant: the discovery document of a build '
      + '(/.well-known/knowledge-linkset) is absent or unreadable, and the brief carries its instant and content version (AGSC-07-25)' } };
  }
  const result = core.compose(facts.items, selection);
  const finish = (digest) => {
    try {
      return { body: core.briefOf(result, {
        base: facts.base,
        bundleVersion: facts.host.bundleVersion === '' ? undefined : facts.host.bundleVersion,
        instant: facts.host.instant,
        items: facts.items,
        licenseProse: facts.licenseProse,
        selectionDigest: digest,
        specVersion: facts.host.specVersion,
      }) };
    } catch (e) {
      if (e.code !== 'AGSC-E904') throw e;
      return { fault: { code: e.code, message: e.message } };
    }
  };
  const digest = hash(core.selectionDigestInput(result));
  return digest !== null && typeof digest === 'object' && typeof digest.then === 'function' ? digest.then(finish) : finish(digest);
}

/** SHA-256 of the UTF-8 bytes of `text`, in lowercase hex, through the page's Web Crypto. */
function toolSha256Hex(text) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then((buffer) => {
    const view = new Uint8Array(buffer);
    let out = '';
    for (let i = 0; i < view.length; i += 1) out += view[i].toString(16).padStart(2, '0');
    return out;
  });
}

/* ------------------------------------------------------------ the domain parts */

/**
 * AGSC-09-13: a copy of `record` that carries `domain` among its members, all in code-point
 * order of their names, as the members of a hit and of a `read` body already are; `record`
 * itself when there is no part.
 */
function toolWithDomain(record, domain) {
  if (domain === null || domain === undefined) return record;
  const out = {};
  const names = Object.keys(record).concat(['domain']).sort();
  for (let i = 0; i < names.length; i += 1) out[names[i]] = names[i] === 'domain' ? domain : record[names[i]];
  return out;
}

/**
 * AGSC-09-13, the domain parts: the answer of `name` with `domain` on each `search` hit and on
 * the `read` body of an item that has a domain part; every other answer, and every answer about
 * an item with none, unchanged. `domainOf(slug)` gives the parts, or `null`.
 *
 * @param {string} name the tool.
 * @param {object} answer the envelope the tool returned.
 * @param {function(string): (object|null)} domainOf
 * @returns {object}
 */
function toolDomainAnswer(name, answer, domainOf) {
  const body = answer && answer.body;
  if (body === null || typeof body !== 'object') return answer;
  if (name === 'search' && answer.type === 'items' && Array.isArray(body.hits)) {
    const hits = body.hits.map((hit) => toolWithDomain(hit, domainOf(hit.slug)));
    return hits.every((hit, i) => hit === body.hits[i]) ? answer : Object.assign({}, answer, { body: Object.assign({}, body, { hits }) });
  }
  if (name === 'read' && answer.type === 'item') {
    const read = toolWithDomain(body, domainOf(body.slug));
    return read === body ? answer : Object.assign({}, answer, { body: read });
  }
  return answer;
}

/**
 * The page toolset with the domain parts: each answer of `toolset` through `toolDomainAnswer`,
 * a promise of one through it when it settles. The parts are the algebra's (`core.domainOf`,
 * emitted with the domain paragraph of the brief), over the corpus the toolset reads and the
 * declared contexts of the node; a page without that algebra has no brief either, and keeps
 * the toolset as it is.
 *
 * @param {{call: Function}} toolset what `page-tools.js#pageToolset` returned.
 * @param {object} corpus the corpus it reads (`bySlug`).
 * @param {object} core the algebra (`globalThis.AGSC_CORE`).
 * @param {Array<string>} contexts the slugs of the clusters `domain.contexts` declares.
 * @returns {{call: Function}}
 */
function toolDomainToolset(toolset, corpus, core, contexts) {
  if (core === null || typeof core !== 'object' || typeof core.domainOf !== 'function') return toolset;
  const bySlug = (corpus && corpus.bySlug) || {};
  const domainOf = (slug) => (Object.prototype.hasOwnProperty.call(bySlug, slug) ? core.domainOf(bySlug[slug], contexts) : null);
  return {
    call: function (name, args) {
      const answer = toolset.call(name, args);
      if (answer !== null && typeof answer === 'object' && typeof answer.then === 'function') {
        return answer.then((value) => toolDomainAnswer(name, value, domainOf));
      }
      return toolDomainAnswer(name, answer, domainOf);
    },
  };
}

/**
 * Every name whose source text `page-tools.js#bundle` emits into the page after its own, in
 * emission order.
 */
const PORTABLE = Object.freeze(['toolHitBound', 'toolBounded', 'toolParse', 'toolDescribed', 'toolHost',
  'toolChunkShardRoutes', 'toolChunkIndex', 'toolCitationRecord', 'toolRelations', 'toolPartners',
  'toolChain', 'toolExplanation', 'toolIsKind', 'toolTargetMatches', 'toolLinkWarnings', 'toolBrief',
  'toolSha256Hex']);

/** The domain parts' functions, emitted after `PORTABLE` only on a node whose listed items state a domain key. */
const DOMAIN_PORTABLE = Object.freeze(['toolWithDomain', 'toolDomainAnswer', 'toolDomainToolset']);

module.exports = {
  DOMAIN_PORTABLE,
  PORTABLE,
  toolBounded,
  toolBrief,
  toolChain,
  toolChunkIndex,
  toolChunkShardRoutes,
  toolCitationRecord,
  toolDescribed,
  toolDomainAnswer,
  toolDomainToolset,
  toolExplanation,
  toolHitBound,
  toolHost,
  toolIsKind,
  toolLinkWarnings,
  toolParse,
  toolPartners,
  toolRelations,
  toolSha256Hex,
  toolTargetMatches,
  toolWithDomain,
};
