'use strict';
/**
 * CONTEXT Distribution (Emission) — Surface: the seven tools.
 * Implements AGSC-09-13 (exactly seven tools: `search`, `read`, `links`,
 * `compose`, `propose`, `ask`, `remember`), AGSC-09-13a (the tool error
 * envelope: the AGSC-08-18 envelope with `type: "error"` and a `body` of
 * `{code, message}`, NEVER a JSON-RPC transport error), AGSC-09-14a (the
 * Channel responder `ask`: an answer over published exports only, at least one
 * item IRI cited, the fixed "no answer in this memory" string, the Content Use
 * Terms embedded), AGSC-09-14b (`remember` synthesizes a conforming item and
 * hands it to the Proposal path; an invalid `sources[]` entry is DROPPED with
 * AGSC-E506, never rejected — `remember` is a total function like adoption),
 * AGSC-08-18 (item ids only, except the plain text `ask` and `remember` alone
 * may take, treated strictly as data; every result carries `source`, `trust`,
 * `license`, `type`, `body`, with `trust` fixed at `untrusted`) and AGSC-09-16
 * (one tool contract, two transports: this module IS that contract, so the
 * stdio server and the browser page can only agree).
 * Requirements: PRD-023, PRD-051, PRD-056, N9, NFR-07.
 *
 * PURE over a loaded Bundle: no clock, no network, no process. The Proposal
 * SIDE EFFECT (AGSC-08-04's `dist/proposal/<n>.patch` and `.md`) is NOT taken
 * here — `propose` and `remember` return the payload, and only the stdio
 * transport's caller may write it. That is what makes AGSC-09-16's byte
 * identity hold: the payload is the same on both transports and only the side
 * effect differs (AGSC-09-16, last sentence).
 *
 * Security rows of docs/SECURITY-CONSIDERATIONS.md addressed here: prompt
 * injection through returned prose (every envelope is `trust: "untrusted"`,
 * AGSC-08-18) and the "no path, URL or shell string in a tool signature" rule
 * — `read`, `links`, `compose` and `propose` take slugs, which are matched by
 * exact equality against the Bundle index and never joined to a path.
 */

const { compose } = require('../composition/compose.js');
const links = require('../knowledge/links.js');
const slugs = require('../knowledge/slug.js');
const adopt = require('../knowledge/adopt.js');
const { TOOL_NAMES, WEBMCP_ANNOTATIONS } = require('../boundary/surfaces.js');
const search = require('./search.js');
const { pageBoardMove, pageClaimants } = require('./page-tools.js');
const boardLanes = require('../governance/board-lanes.js');

/** AGSC-06-18: the Content Use Terms identifier every export carries. */
const CONTENT_USE_TERMS = 'LicenseRef-AgenticSystemCore-Content-Use-1.0';
/** AGSC-09-14a: the answer a responder MUST give when nothing matches. */
const NO_ANSWER = 'no answer in this memory';
/** AGSC-02-10: the two schemes a client-supplied `sources[].resource` may use. */
const SOURCE_RESOURCE = /^(https?:\/\/\S+|urn:agsc:channel:[a-z0-9-]+:\S+)$/u;
/** AGSC-02-09: the actor grammar (the `actor` definition of item.schema.json). */
const ACTOR = /^(?:human:[a-z0-9][a-z0-9._-]*|process:[a-z0-9][a-z0-9._-]*|[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._+-]*)$/u;
/** AGSC-09-14b: `kind` to item `type`. */
const KIND_TO_TYPE = Object.freeze({
  concept: 'concept', episode: 'episode', gate: 'gate', lesson: 'lesson', procedure: 'procedure', task: 'concept',
});

function plural(type) {
  return type === 'cluster' ? 'clusters' : `${type}s`;
}

/** A Bundle IRI always ends in exactly one `/` (AGSC-05-03). */
function baseIri(base) {
  return `${String(base === undefined || base === null ? '/' : base).replace(/\/+$/u, '')}/`;
}

/** AGSC-05-01: an item's canonical HTTPS IRI. */
function itemIri(base, item) {
  return `${baseIri(base)}${plural(item.type || 'concept')}/${item.slug}/`;
}

/** AGSC-08-18: the one result shape, JCS member order, `trust` fixed. */
function envelope(source, type, body) {
  return Object.freeze({
    body, license: CONTENT_USE_TERMS, source, trust: 'untrusted', type,
  });
}

/** AGSC-09-13a: a domain fault is this envelope, never a transport error. */
function errorEnvelope(source, code, message) {
  return envelope(source, 'error', Object.freeze({ code, message: message || '' }));
}

/**
 * AGSC-06-23's tokenizer and its input are `distribution/search.js`'s (owner
 * E) and are used here unchanged: one Bundle can never be tokenized two ways,
 * so a hit from this tool and a posting in `search.json` mean the same thing.
 */
function tokenize(text) {
  return text === undefined || text === null ? [] : search.tokenize(text);
}

/** The tokenizer input of AGSC-06-23: title, description, tags, body without fences. */
/**
 * AGSC-06-23 pins the tokenizer input: "`title`, `description`, every `tags` value
 * and the body with fenced code blocks removed". `search.tokenizerInput` reads those
 * from a FLAT item, while a loaded Bundle carries them under `frontmatter` — so
 * until rc.5 this tool tokenized the body alone and silently matched neither a title
 * nor a description nor a tag. That is the same defect the `/compose/` combiner
 * carried: one shape read as another. Flattened here, so the `search` and
 * `ask` tools and `search.json` index exactly the same text and a hit means the same
 * thing on every surface. Found by vector `cli-0007`.
 */
function documentText(item) {
  const flat = item && item.frontmatter != null
    ? { ...item.frontmatter, body: item.body, slug: item.slug, type: item.type }
    : item;
  return search.tokenizerInput(flat);
}

/**
 * AGSC-03-02/03-04: the Knowledge context's resolver owns the edges, the
 * computed inverses and AGSC-E301, so the `links` tool reports exactly what
 * the graph exports report.
 */
function edgesFor(bundle, item) {
  const resolved = links.resolve(bundle.items, { assets: bundle.assets, config: bundle.config });
  return (resolved.edges || []).filter((e) => e.source === item.slug);
}

/** AGSC-05-04b: a `memory://` alias naming a FOREIGN bundle is AGSC-E309. */
function slugFromIri(bundle, iri) {
  const bundleId = ((bundle.config || {}).bundle || {}).id;
  const memory = /^memory:\/\/([^/]+)\/(?:[a-z]+\/)?([^/#?]+)/u.exec(String(iri));
  if (memory) {
    if (memory[1] !== bundleId) return { code: 'AGSC-E309', slug: null };
    return { code: null, slug: memory[2] };
  }
  const base = String(((bundle.config || {}).site || {}).base || '');
  if (base !== '' && String(iri).startsWith(base)) {
    const rest = String(iri).slice(base.length).replace(/^\/+/u, '');
    const parts = rest.split('/').filter((p) => p !== '');
    if (parts.length >= 2) return { code: null, slug: parts[1] };
  }
  return { code: 'AGSC-E301', slug: null };
}

/**
 * tools(bundle, options) -> { call, manifest }
 *
 * `manifest()` is the AGSC-09-13 tool list — the SAME object the browser
 * transport registers (AGSC-09-16). `call(name, args)` returns an AGSC-08-18
 * envelope and never throws for a domain fault.
 */
function tools(bundle, options) {
  const opts = options || {};
  const config = opts.config || bundle.config || {};
  const base = ((config.site || {}).base) || '/';
  const byslug = bundle.byslug instanceof Map
    ? bundle.byslug
    : new Map((bundle.items || []).map((i) => [i.slug, i]));

  // AGSC-10-13 / AGSC-10-17: the derived `claimed_by` of every task, read from the
  // board exports of the build this server made — the same routes the page reads,
  // so a claim is checked against the same holder on both transports.
  const artifacts = opts.artifacts instanceof Map ? opts.artifacts : new Map();
  const published = Object.create(null);
  for (const [route, text] of artifacts) if (route.startsWith('/boards/')) published[route] = String(text);
  const claimed = new Map(Object.entries(pageClaimants(published)));

  const implementations = Object.create(null);
  const flatItems = () => (bundle.items || [])
    .map((i) => Object.assign({}, i.frontmatter, { slug: i.slug, type: i.type }));

  implementations.search = (args) => {
    const query = typeof args.query === 'string' ? args.query : '';
    const wanted = tokenize(query);
    if (wanted.length === 0) return envelope('search', 'items', Object.freeze({ hits: Object.freeze([]) }));
    const hits = [];
    for (const item of bundle.items || []) {
      const tokens = new Set(tokenize(documentText(item)));
      const score = wanted.filter((t) => tokens.has(t)).length;
      if (score > 0) hits.push({ iri: itemIri(base, item), score, slug: item.slug, title: (item.frontmatter || {}).title });
    }
    hits.sort((a, b) => b.score - a.score || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    return envelope('search', 'items', Object.freeze({ hits: Object.freeze(hits.map(Object.freeze)) }));
  };

  implementations.read = (args) => {
    const item = byslug.get(args.slug);
    if (!item) return errorEnvelope('read', 'AGSC-E301', 'no item with that slug in this Bundle');
    return envelope('read', 'item', Object.freeze({
      body: item.body, frontmatter: item.frontmatter, iri: itemIri(base, item), slug: item.slug,
    }));
  };

  implementations.links = (args) => {
    let slug = args.slug;
    if (slug === undefined && args.iri !== undefined) {
      const resolved = slugFromIri(bundle, args.iri);
      if (resolved.code !== null) {
        return errorEnvelope('links', resolved.code, resolved.code === 'AGSC-E309'
          ? 'memory:// names a foreign bundle — use the https:// IRI'
          : 'no item with that IRI in this Bundle');
      }
      slug = resolved.slug;
    }
    const item = byslug.get(slug);
    if (!item) return errorEnvelope('links', 'AGSC-E301', 'no item with that slug in this Bundle');
    return envelope('links', 'links', Object.freeze({
      edges: Object.freeze(edgesFor(bundle, item).map(Object.freeze)), slug: item.slug,
    }));
  };

  implementations.compose = (args) => {
    const selection = Array.isArray(args.selection) ? args.selection : [];
    const items = (bundle.items || []).map((i) => Object.assign({ slug: i.slug, type: i.type }, i.frontmatter));
    const result = compose(items, selection);
    return envelope('compose', 'verdict', Object.freeze({
      added: result.added,
      conflicts: result.conflicts,
      hidden: result.hidden,
      selection: result.selection,
      valid: result.valid,
      warnings: result.warnings,
    }));
  };

  implementations.propose = (args) => {
    const item = byslug.get(args.slug);
    if (!item) return errorEnvelope('propose', 'AGSC-E301', 'no item with that slug in this Bundle');
    // AGSC-10-17: a board move is the SAME portable function the page runs, so the
    // two transports return the same prepared Proposal (AGSC-09-16).
    if (args.task_state !== undefined) {
      const moved = pageBoardMove(adopt.serialize(item.frontmatter), item.body, item.frontmatter || {},
        item.type, item.slug, args, claimed.get(item.slug));
      if (moved.code !== undefined) return errorEnvelope('propose', moved.code, moved.message);
      // AGSC-08-28 / AGSC-10-17: a caller that declares one of this node's agent lanes
      // is held to the lane's gates on the prepared Proposal. Only this transport
      // knows the lanes (they are configuration, never published), so the page
      // answers the same payload and the gates run again at review.
      const refused = boardLanes.moveRefusal(config, flatItems(), {
        agent: args.agent, claimed, path: moved.path, slug: item.slug, task_state: moved.task_state,
      });
      if (refused !== null) return errorEnvelope('propose', refused.code, refused.message);
      return envelope('propose', 'proposal', Object.freeze({
        from: moved.from,
        iri: itemIri(base, item),
        markdown: moved.markdown,
        patch: moved.patch,
        path: moved.path,
        slug: item.slug,
        task_state: moved.task_state,
      }));
    }
    // AGSC-08-04 / AGSC-11-14: the payload is RETURNED; no network write is
    // performed here on either transport. Only the stdio transport's caller
    // may write dist/proposal/<n>.{patch,md}, which is a side effect and not
    // part of the payload AGSC-09-16 compares.
    return envelope('propose', 'proposal', Object.freeze({
      iri: itemIri(base, item),
      // One blank line between the block and the body — the canonical file's own
      // bytes, not a second blank line before a body that already opens with one.
      markdown: `${adopt.serialize(item.frontmatter)}${String(item.body).startsWith('\n') ? '' : '\n'}${item.body}`,
      slug: item.slug,
    }));
  };

  /**
   * AGSC-09-14a, vector `cli-0007`. The AGSC-08-18
   * envelope with EXACTLY ONE added top-level member, `citations[]`: six members and
   * no more. `body` is the answer TEXT, never an object — before rc.5 this engine
   * returned `{answer, citations, terms}` inside `body`, which was the second of the
   * two readings the rule then admitted and the one that makes the fixed no-answer
   * string unreachable. The Content Use Terms line lives INSIDE `body`, except in the
   * no-answer case, where the rule fixes `body` to exactly `no answer in this memory`.
   */
  function answerEnvelope(body, citations) {
    return Object.freeze({
      body,
      citations: Object.freeze(citations),
      license: CONTENT_USE_TERMS,
      source: 'ask',
      trust: 'untrusted',
      type: 'answer',
    });
  }

  implementations.ask = (args) => {
    const question = typeof args.question === 'string' ? args.question : '';
    const hits = implementations.search({ query: question }).body.hits;
    if (hits.length === 0) return answerEnvelope(NO_ANSWER, []);
    const cited = hits.slice(0, 3);
    const answer = cited.map((h) => describe(byslug.get(h.slug))).join(' ');
    return answerEnvelope(`${answer} Content Use Terms: ${CONTENT_USE_TERMS}.`,
      cited.map((h) => h.iri));
  };

  implementations.remember = (args) => {
    const kind = KIND_TO_TYPE[args.kind] === undefined ? 'concept' : args.kind;
    const type = KIND_TO_TYPE[kind];
    // AGSC-09-14b: a Gate's Level is a governance decision a
    // tool call may not invent, and an episode's schema branch requires `actor`.
    if (args.kind === 'gate') {
      return errorEnvelope('remember', 'AGSC-E203', 'remember does not accept kind "gate": a Gate\'s Level is a governance decision (AGSC-09-14b)');
    }
    if (type === 'episode' && typeof args.actor !== 'string') {
      return errorEnvelope('remember', 'AGSC-E003', 'an episode needs the declared actor (AGSC-09-14b)');
    }
    // AGSC-09-14b: `at` supplies an episode's schema-required `started`, and a call
    // that declares none is AGSC-E003; an `actor` outside the grammar of AGSC-02-09
    // would make the synthesized item non-conforming, so it is refused here.
    if (type === 'episode' && typeof args.at !== 'string') {
      return errorEnvelope('remember', 'AGSC-E003', 'an episode needs the instant it started, `at` (AGSC-09-14b)');
    }
    if (args.actor !== undefined && !ACTOR.test(String(args.actor))) {
      return errorEnvelope('remember', 'AGSC-E204', 'actor must be human:<id>, process:<id> or <producer>/<version> (AGSC-02-09)');
    }
    const title = typeof args.title === 'string' ? args.title : '';
    const findings = [];
    const taken = new Set(byslug.keys());
    const slug = slugs.dedupe(slugs.slugify(title), taken);
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
      // AGSC-09-14b: `at` supplies `started`; a clock is NEVER read (AGSC-04-11).
      frontmatter.started = args.at;
      frontmatter.outcome = args.outcome === undefined ? 'partial' : args.outcome;
      // No `severity` here: the episode branch has no such key, and a defaulted one
      // was reported by lint as unknown (AGSC-09-14b as corrected 2026-09-24).
    }
    // AGSC-09-14b's `severity` default reaches the lesson alone, the one kind whose
    // schema branch carries the key — without it the item was not conforming.
    if (type === 'lesson') frontmatter.severity = args.severity === undefined ? 'info' : args.severity;
    if (typeof args.actor === 'string') frontmatter.actor = args.actor;
    // AGSC-09-14b / AGSC-02-14: `usage` is carried onto the episode verbatim, so a
    // responder or a lane records its spend and AGSC-08-25's rollup counts it.
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
    for (const source of args.sources || []) {
      if (!source || typeof source.resource !== 'string' || !SOURCE_RESOURCE.test(source.resource)) {
        findings.push(Object.freeze({ code: 'AGSC-E506', message: 'source dropped', severity: 'warn' }));
        continue;
      }
      sources.push(Object.freeze({ id: source.id, resource: source.resource }));
    }
    if (sources.length > 0) frontmatter.sources = Object.freeze(sources);
    const refused = boardLanes.createRefusal(config, {
      agent: args.agent, path: `content/${plural(type)}/${slug}.md`, task: args.kind === 'task' ? 'plan' : undefined, type,
    });
    if (refused !== null) return errorEnvelope('remember', refused.code, refused.message);
    return envelope('remember', 'proposal', Object.freeze({
      body: typeof args.body === 'string' ? args.body.normalize('NFC') : '',
      findings: Object.freeze(findings),
      frontmatter: Object.freeze(frontmatter),
      path: `content/${plural(type)}/${slug}.md`,
      slug,
    }));
  };

  function describe(item) {
    const fm = (item && item.frontmatter) || {};
    return typeof fm.description === 'string' && fm.description !== '' ? fm.description : String(fm.title || '');
  }

  function call(name, args) {
    if (!TOOL_NAMES.includes(name)) {
      return errorEnvelope(String(name), 'AGSC-E001', 'no such tool');
    }
    const supplied = args && typeof args === 'object' ? args : {};
    // AGSC-09-13a: `inputSchema.required` is PUBLISHED in the manifest, and a
    // published contract that is never enforced is a silent success. `AGSC-E003`
    // ("missing argument", spec/09 §9.4) is the registered code for exactly this.
    const missing = (REQUIRED_ARGUMENTS[name] || []).filter((key) => {
      const value = supplied[key];
      return value === undefined || value === null;
    });
    if (missing.length > 0) {
      return errorEnvelope(name, 'AGSC-E003', `missing required argument: ${missing.join(', ')}`);
    }
    // AGSC-01-16: the 1 MiB cap governs every text a tool parses, not only a
    // file read through the port. The check runs BEFORE dispatch, so an oversized
    // argument costs one length measurement and never a corpus scan.
    const oversized = ARGUMENTS[name].filter((key) => typeof supplied[key] === 'string'
      && utf8Length(supplied[key]) > MAX_ARGUMENT_BYTES);
    if (oversized.length > 0) {
      return errorEnvelope(name, 'AGSC-E904',
        `argument above the ${MAX_ARGUMENT_BYTES}-byte cap: ${oversized.join(', ')} (AGSC-01-16)`);
    }
    // AGSC-05-04b: `memory://<bundle-id>/<slug>` is accepted wherever a slug
    // argument is, and normalized to the slug before any other rule runs; and
    // AGSC-05-04a: wherever `memory://` is accepted, the item's https IRI is too.
    const siteBase = String(((bundle.config || {}).site || {}).base || '');
    const aliased = memoryAliases(supplied, (value) => slugFromIri(bundle, value),
      (value) => /^https?:\/\//u.test(siteBase) && value.startsWith(siteBase));
    if (aliased.code !== null) {
      return errorEnvelope(name, aliased.code, aliased.code === 'AGSC-E309'
        ? 'memory:// names a foreign bundle — use the https:// IRI'
        : 'no item with that IRI in this Bundle');
    }
    return implementations[name](aliased.args);
  }

  return Object.freeze({ call, manifest: () => manifest() });
}

/** AGSC-05-04b: the tool arguments that name one item by slug, plus `selection[]`. */
const SLUG_ARGUMENTS = Object.freeze(['about', 'cluster', 'slug']);

/**
 * AGSC-05-04b: replace every `memory://` alias among the slug arguments by the slug
 * it names, through `resolve` (`slugFromIri`); AGSC-05-04a: an https item IRI of this
 * node (`isItemIri`) is accepted the same way. The first alias that names no item of
 * this Bundle ends the call with its code. Every other value passes unchanged.
 * @returns {{args:object|null, code:string|null}}
 */
function memoryAliases(args, resolve, isItemIri = () => false) {
  const out = Object.assign({}, args);
  const one = (value) => {
    if (typeof value !== 'string' || !(value.startsWith('memory://') || isItemIri(value))) return { code: null, value };
    const resolved = resolve(value);
    return { code: resolved.code, value: resolved.slug };
  };
  for (const key of SLUG_ARGUMENTS) {
    if (!Object.prototype.hasOwnProperty.call(out, key)) continue;
    const r = one(out[key]);
    if (r.code !== null) return { args: null, code: r.code };
    out[key] = r.value;
  }
  if (Array.isArray(out.selection)) {
    const selection = [];
    for (const value of out.selection) {
      const r = one(value);
      if (r.code !== null) return { args: null, code: r.code };
      selection.push(r.value);
    }
    out.selection = selection;
  }
  return { args: out, code: null };
}

/**
 * AGSC-01-16's 1 MiB cap, applied to every text argument a tool would parse
 * `TextEncoder` keeps this module runtime-portable — no `Buffer`.
 */
const MAX_ARGUMENT_BYTES = 1024 * 1024;
const utf8Length = (t) => new TextEncoder().encode(t).length;

/**
 * AGSC-09-13 + AGSC-09-16: the tool list, with names and ARGUMENT names. The
 * browser transport registers this very object, so the two manifests cannot
 * drift. Annotations are the security floor in WebMCP's own vocabulary
 * (AGSC-11-18), carried here so one definition serves both transports.
 */
const ARGUMENTS = Object.freeze({
  ask: Object.freeze(['question']),
  compose: Object.freeze(['selection']),
  links: Object.freeze(['iri', 'slug']),
  // `agent`, `model`, `operator` and `origin` are the caller's declared identity
  // (AGSC-09-14b, AGSC-08-28): the server honours them, so the manifest names them.
  propose: Object.freeze(['agent', 'at', 'slug', 'task_state']),
  read: Object.freeze(['slug']),
  remember: Object.freeze(['about', 'actor', 'agent', 'at', 'body', 'cluster', 'kind', 'model', 'operator', 'origin',
    'outcome', 'severity', 'sources', 'title', 'usage']),
  search: Object.freeze(['query']),
});

/** The JSON type of every argument that is not a string. */
const ARGUMENT_TYPES = Object.freeze({ selection: 'array', sources: 'array', usage: 'object' });

const REQUIRED_ARGUMENTS = Object.freeze({
  ask: Object.freeze(['question']),
  compose: Object.freeze(['selection']),
  links: Object.freeze([]),
  propose: Object.freeze(['slug']),
  read: Object.freeze(['slug']),
  remember: Object.freeze(['body', 'kind', 'title']),
  search: Object.freeze(['query']),
});

const DESCRIPTIONS = Object.freeze({
  ask: 'Answer a question from this memory, citing at least one item IRI.',
  compose: 'Run the AGSC-07 closure algebra over a selection of item slugs.',
  links: 'Return the typed Links authored on one item.',
  propose: 'Return the Proposal payload for one item — with task_state, a prepared board move (claim, progress, finish) as a patch; performs no write.',
  read: 'Return one item by slug.',
  remember: 'Synthesize a conforming item — a new task on a board (kind task, cluster), a comment on one (about) — and return it as a Proposal payload.',
  search: 'Search this memory and return matching items.',
});

function manifest() {
  return Object.freeze({
    tools: Object.freeze(TOOL_NAMES.map((name) => Object.freeze({
      annotations: WEBMCP_ANNOTATIONS[name],
      description: DESCRIPTIONS[name],
      inputSchema: Object.freeze({
        properties: Object.freeze(Object.fromEntries(ARGUMENTS[name].map((a) => [a, { type: ARGUMENT_TYPES[a] || 'string' }]))),
        required: REQUIRED_ARGUMENTS[name],
        type: 'object',
      }),
      name,
    }))),
  });
}

module.exports = {
  ARGUMENTS,
  CONTENT_USE_TERMS,
  NO_ANSWER,
  REQUIRED_ARGUMENTS,
  envelope,
  errorEnvelope,
  itemIri,
  manifest,
  tokenize,
  tools,
};
