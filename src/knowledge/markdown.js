'use strict';
// src/knowledge/markdown.js — CONTEXT Knowledge, aggregate Item (body).
// Implements AGSC-02-20 (CommonMark 0.31.2 + GFM tables), AGSC-02-22 (fenced-block
// info strings are rendering hints; `export` is reserved), AGSC-03-13 (heading
// anchors) and the inline-link inventory AGSC-03-11 resolves.
//
// Owner: C (WP-10-C). PURE: no fs, no process, no clock, no network.
//
// The renderer is `markdown-it@15.0.2` configured `{html:false, linkify:false,
// typographer:false}`: raw HTML never passes through, bare URLs are never turned
// into links behind the author's back, and no character is substituted for a
// prettier one — three properties AGSC-02-20 and AGSC-04-07 need and that a
// hand-written renderer would have to re-earn. What is NOT delegated is the
// heading-anchor algorithm: AGSC-03-13 pins it byte for byte (including the
// `section-<n>` numbering and the collision walk), and no library implements it,
// so `anchorOf`/`assignAnchors` below are ours and are the single source of every
// anchor in the system (links.js re-exports them).
//
// Generated HTML is byte-identical within this implementation (AGSC-04-01) and is
// deliberately NOT part of the cross-implementation vector set (AGSC-04-24).

const MarkdownIt = require('markdown-it');
const { nfc } = require('./unicode.js');

/** One renderer instance: markdown-it is stateless across `render` calls. */
const md = new MarkdownIt({ html: false, linkify: false, typographer: false });

const NON_ANCHOR = /[^a-z0-9 -]/gu;
const ASCII_UPPER = /[A-Z]/gu;

/**
 * AGSC-03-13: NFC -> ASCII lowercase -> drop every character outside `[a-z0-9 -]`
 * -> spaces to `-` -> collapse runs of `-` -> trim leading and trailing `-`.
 * The empty result is the caller's business (`assignAnchors` numbers it).
 * Every regex here is linear-time (no backtracking group), per the ReDoS rule.
 */
function anchorOf(text) {
  return nfc(String(text))
    .replace(ASCII_UPPER, (c) => c.toLowerCase())
    .replace(NON_ANCHOR, '')
    .replace(/ /gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-/u, '')
    .replace(/-$/u, '');
}

/**
 * AGSC-03-13, second half: an empty anchor becomes `section-<n>` where `<n>` is
 * the 1-based document order of the heading AMONG THE EMPTY ONES; a duplicate
 * takes `-2`, `-3`, … re-checking after each suffix so that a suffixed anchor
 * never collides with a naturally occurring one.
 *
 * @param {string[]} texts heading texts in document order
 * @returns {string[]} one anchor per heading, in the same order
 */
function assignAnchors(texts) {
  let empties = 0;
  const first = texts.map((t) => {
    const a = anchorOf(t);
    if (a !== '') return a;
    empties += 1;
    return `section-${empties}`;
  });
  const taken = new Set();
  // `lastTried` remembers, per base, the highest suffix already consumed, so a body
  // with many identical headings stays linear instead of rescanning `-2`, `-3`, …
  // from the start every time (measured before this memo: 10 000 identical headings
  // took 8.3 s; V9-D lens c). `taken` is still consulted, so the emitted anchors are
  // byte-identical to the unmemoised search — a literal `base-2` heading elsewhere
  // in the body still pushes the next derived one past it.
  const lastTried = new Map();
  return first.map((base) => {
    let n = lastTried.get(base) || 1;
    let candidate = n === 1 ? base : `${base}-${n}`;
    while (taken.has(candidate)) {
      n += 1;
      candidate = `${base}-${n}`;
    }
    lastTried.set(base, n);
    taken.add(candidate);
    return candidate;
  });
}

/** The plain text of a heading: its text and inline-code children, concatenated. */
function inlineText(token) {
  if (!token || !Array.isArray(token.children)) return token && token.content ? token.content : '';
  return token.children
    .filter((c) => c.type === 'text' || c.type === 'code_inline')
    .map((c) => c.content)
    .join('');
}

function lineOf(token, fallback) {
  return Array.isArray(token.map) ? token.map[0] + 1 : fallback;
}

/**
 * Parse a body once and report everything the rest of the engine reads from it.
 *
 * @param {string} body the item body (LF, NFC — AGSC-01-14)
 * @returns {{tokens:Array, headings:Array, anchors:string[], fences:Array, links:Array}}
 */
function scan(body) {
  const tokens = md.parse(String(body), {});
  const headings = [];
  const fences = [];
  const links = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.type === 'heading_open') {
      headings.push({
        level: Number(token.tag.slice(1)),
        text: inlineText(tokens[i + 1]),
        line: lineOf(token, 1),
      });
    } else if (token.type === 'fence') {
      fences.push({ info: token.info, content: token.content, line: lineOf(token, 1) });
    } else if (token.type === 'inline') {
      const line = lineOf(token, 1);
      for (const child of token.children || []) {
        if (child.type === 'link_open') links.push({ kind: 'link', target: child.attrGet('href') || '', line });
        else if (child.type === 'image') links.push({ kind: 'image', target: child.attrGet('src') || '', line });
      }
    }
  }
  const anchors = assignAnchors(headings.map((h) => h.text));
  headings.forEach((h, i) => { h.id = anchors[i]; });
  return { tokens, headings, anchors, fences, links };
}

/**
 * Render a body to HTML with AGSC-03-13 heading ids.
 *
 * @param {string} body
 * @returns {{html:string, headings:Array, anchors:string[], fences:Array, links:Array}}
 */
function render(body, options = {}) {
  const scanned = scan(body);
  // AGSC-03-13 anchors are ours, so the heading tag carries the id we computed.
  let heading = 0;
  for (const token of scanned.tokens) {
    if (token.type !== 'heading_open') continue;
    token.attrSet('id', scanned.anchors[heading]);
    heading += 1;
  }
  // AGSC-03-11 + AGSC-06-01 (added at rc.5, FV28-04): the OPTIONAL href resolver.
  // A body reference is authored in the BUNDLE's geometry
  // (`content/concepts/a.md` → `content/concepts/b.md`, AGSC-03-12's normal form)
  // and the page is served in the ROUTE geometry (`/concepts/a/` → `/concepts/b/`),
  // and the two are different — so no authored spelling resolves in both and the
  // writer that emits the page has to map one onto the other. The MAPPING is the
  // caller's, because a route set is Distribution's (AGSC-06-01) and this module is
  // Knowledge; this function only applies it. A resolver that answers `null` leaves
  // the target exactly as authored: a writer never invents a link.
  const resolveHref = typeof options.href === 'function' ? options.href : null;
  if (resolveHref !== null) {
    const rewriteAll = (tokens) => {
      for (const token of tokens) {
        if (token.children) rewriteAll(token.children);
        const attribute = token.type === 'link_open' ? 'href' : (token.type === 'image' ? 'src' : null);
        if (attribute === null) continue;
        const current = token.attrGet(attribute);
        if (current === null) continue;
        const next = resolveHref(current);
        if (typeof next === 'string' && next !== '') token.attrSet(attribute, next);
      }
    };
    rewriteAll(scanned.tokens);
  }
  const html = md.renderer.render(scanned.tokens, md.options, {});
  return {
    html,
    headings: scanned.headings,
    anchors: scanned.anchors,
    fences: scanned.fences,
    links: scanned.links,
  };
}

/** AGSC-03-13 over a whole body: the anchors it defines, in document order. */
function anchors(body) {
  const scanned = scan(body);
  return { anchors: scanned.anchors, headings: scanned.headings, errors: [] };
}

/** Every relative and absolute inline link or image target (AGSC-03-11). */
function links(body) {
  return scan(body).links;
}

/** Every fenced block with its info string preserved verbatim (AGSC-02-22). */
function fences(body) {
  return scan(body).fences;
}

/** The AGSC-02-97 `yaml agsc-selection` fences of an `architecture` body. */
function selectionFences(body) {
  return fences(body).filter((f) => f.info.trim() === 'yaml agsc-selection');
}

/** The ATX headings of a body (level, text, id, line) in document order. */
function headings(body) {
  return scan(body).headings;
}

module.exports = {
  anchorOf,
  assignAnchors,
  anchors,
  fences,
  headings,
  links,
  render,
  scan,
  selectionFences,
};
