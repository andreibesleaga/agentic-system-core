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

/** AGSC-06-18: the Content Use Terms identifier every export carries. */
const CONTENT_USE_TERMS = 'LicenseRef-AgenticSystemCore-Content-Use-1.0';
/** AGSC-09-14a: the answer a responder MUST give when nothing matches. */
const NO_ANSWER = 'no answer in this memory';
/** AGSC-02-10: the two schemes a client-supplied `sources[].resource` may use. */
const SOURCE_RESOURCE = /^(https?:\/\/\S+|urn:agsc:channel:[a-z0-9-]+:\S+)$/u;
/** AGSC-09-14b: `kind` to item `type`. */
const KIND_TO_TYPE = Object.freeze({
  concept: 'concept', episode: 'episode', gate: 'gate', lesson: 'lesson', procedure: 'procedure',
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
 * carried (ENG2-D1): one shape read as another. Flattened here, so the `search` and
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

  const implementations = Object.create(null);

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
    // AGSC-08-04 / AGSC-11-14: the payload is RETURNED; no network write is
    // performed here on either transport. Only the stdio transport's caller
    // may write dist/proposal/<n>.{patch,md}, which is a side effect and not
    // part of the payload AGSC-09-16 compares.
    return envelope('propose', 'proposal', Object.freeze({
      iri: itemIri(base, item),
      markdown: `${adopt.serialize(item.frontmatter)}\n${item.body}`,
      slug: item.slug,
    }));
  };

  /**
   * AGSC-09-14a as amended at rc.5 (V9D-07), vector `cli-0007`. The AGSC-08-18
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
    const title = typeof args.title === 'string' ? args.title : '';
    const findings = [];
    const taken = new Set(byslug.keys());
    const slug = slugs.dedupe(slugs.slugify(title), taken);
    const frontmatter = { title, type };
    if (type === 'concept') frontmatter.kind = 'explainer';
    if (type === 'episode') {
      // AGSC-09-14b: `at` supplies `started`; a clock is NEVER read (AGSC-04-11).
      frontmatter.started = args.at;
      frontmatter.outcome = args.outcome === undefined ? 'partial' : args.outcome;
      frontmatter.severity = args.severity === undefined ? 'info' : args.severity;
    }
    // MCP1-03 (ENG-9): AGSC-09-14b's `severity` default reaches a lesson too, whose
    // schema branch REQUIRES the key — without it the item was not conforming.
    if (type === 'lesson') frontmatter.severity = args.severity === undefined ? 'info' : args.severity;
    if (typeof args.actor === 'string') frontmatter.actor = args.actor;
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
    // AGSC-09-13a (F27-10): `inputSchema.required` is PUBLISHED in the manifest, and a
    // published contract that is never enforced is a silent success. `AGSC-E003`
    // ("missing argument", spec/09 §9.4) is the registered code for exactly this.
    const missing = (REQUIRED_ARGUMENTS[name] || []).filter((key) => {
      const value = supplied[key];
      return value === undefined || value === null;
    });
    if (missing.length > 0) {
      return errorEnvelope(name, 'AGSC-E003', `missing required argument: ${missing.join(', ')}`);
    }
    // AGSC-01-16 (F27-12): the 1 MiB cap governs every text a tool parses, not only a
    // file read through the port. The check runs BEFORE dispatch, so an oversized
    // argument costs one length measurement and never a corpus scan.
    const oversized = ARGUMENTS[name].filter((key) => typeof supplied[key] === 'string'
      && utf8Length(supplied[key]) > MAX_ARGUMENT_BYTES);
    if (oversized.length > 0) {
      return errorEnvelope(name, 'AGSC-E904',
        `argument above the ${MAX_ARGUMENT_BYTES}-byte cap: ${oversized.join(', ')} (AGSC-01-16)`);
    }
    return implementations[name](supplied);
  }

  return Object.freeze({ call, manifest: () => manifest() });
}

/**
 * AGSC-01-16's 1 MiB cap, applied to every text argument a tool would parse
 * (F27-12). `TextEncoder` keeps this module runtime-portable — no `Buffer`.
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
  propose: Object.freeze(['slug']),
  read: Object.freeze(['slug']),
  remember: Object.freeze(['at', 'body', 'kind', 'outcome', 'severity', 'sources', 'title']),
  search: Object.freeze(['query']),
});

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
  propose: 'Return the Proposal payload for one item; performs no network write.',
  read: 'Return one item by slug.',
  remember: 'Synthesize a conforming item and return it as a Proposal payload.',
  search: 'Search this memory and return matching items.',
});

function manifest() {
  return Object.freeze({
    tools: Object.freeze(TOOL_NAMES.map((name) => Object.freeze({
      annotations: WEBMCP_ANNOTATIONS[name],
      description: DESCRIPTIONS[name],
      inputSchema: Object.freeze({
        properties: Object.freeze(Object.fromEntries(ARGUMENTS[name].map((a) => [a, { type: a === 'selection' || a === 'sources' ? 'array' : 'string' }]))),
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
  DESCRIPTIONS,
  NO_ANSWER,
  REQUIRED_ARGUMENTS,
  envelope,
  errorEnvelope,
  itemIri,
  manifest,
  tokenize,
  tools,
};
