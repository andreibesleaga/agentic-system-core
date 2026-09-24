'use strict';
/**
 * CONTEXT Composition — aggregate: saved architecture (a Selection at rest).
 * Implements AGSC-02-97 (a `kind: architecture` concept carries exactly one
 * fenced `yaml agsc-selection` block, never rendered as prose; a second block
 * is AGSC-E201; every slug in it MUST resolve or AGSC-E301; an optional
 * `verdict_digest`) and AGSC-07-24 (`compose --from <slug>` runs Steps 1 to 5
 * over that selection; a stale stored digest is the warning AGSC-E805).
 * Requirements: PRD-057.
 *
 * PURE. Findings carry registered codes and are returned, never thrown.
 *
 * Fenced-block extraction is the Knowledge context's
 * (`knowledge/markdown.js#selectionFences`): one Markdown reader
 * serves the renderer and this rule, so a block that `compose --from` sees is
 * exactly the block the page does not render. This module never renders and
 * never interprets the block's content — `knowledge/yaml.js` parses that, in
 * the same failsafe subset as frontmatter (AGSC-02-02/02-03).
 */

const markdown = require('../knowledge/markdown.js');
const yaml = require('../knowledge/yaml.js');
const {
  compose, frontmatterOf, indexBySlug, slugOf, verdictDigest,
} = require('./compose.js');

/** [{ content, info, line }] for every `yaml agsc-selection` fence, document order. */
function selectionFences(body) {
  return markdown.selectionFences(body === undefined || body === null ? '' : String(body));
}

function bodyOf(item) {
  if (item && typeof item.body === 'string') return item.body;
  const fm = frontmatterOf(item);
  return typeof fm.body === 'string' ? fm.body : '';
}

function finding(code, severity, extra) {
  return Object.freeze(Object.assign({ code, message: '', severity }, extra || {}));
}

/**
 * selectionBlock(item) -> { selection, findings, blocks }
 *
 * `selection` is the block's slugs in author order; `blocks` is how many
 * `yaml agsc-selection` fences the body carried (AGSC-02-97 allows exactly
 * one; a second is AGSC-E201).
 */
function selectionBlock(item) {
  const slug = slugOf(item);
  const blocks = selectionFences(bodyOf(item));
  const findings = [];
  if (blocks.length === 0) {
    return {
      blocks: 0,
      findings: Object.freeze([finding('AGSC-E202', 'error', {
        message: `${slug} carries no \`yaml agsc-selection\` fence (AGSC-02-97)`, slug,
      })]),
      selection: Object.freeze([]),
    };
  }
  if (blocks.length > 1) {
    findings.push(finding('AGSC-E201', 'error', {
      message: `${slug} carries ${blocks.length} \`yaml agsc-selection\` fences; AGSC-02-97 allows exactly one`, slug,
    }));
  }
  let parsed = [];
  try {
    parsed = yaml.parse(blocks[0].content);
  } catch (e) {
    return {
      blocks: blocks.length,
      findings: Object.freeze(findings.concat([finding(e && e.code ? e.code : 'AGSC-E105', 'error', {
        message: `the \`yaml agsc-selection\` fence of ${slug} is not YAML: ${(e && e.message) || 'parse error'} (AGSC-02-97)`, slug,
      })])),
      selection: Object.freeze([]),
    };
  }
  if (!Array.isArray(parsed)) {
    return {
      blocks: blocks.length,
      findings: Object.freeze(findings.concat([finding('AGSC-E201', 'error', {
        message: `the \`yaml agsc-selection\` fence of ${slug} must hold a sequence of slugs (AGSC-02-97)`, slug,
      })])),
      selection: Object.freeze([]),
    };
  }
  return {
    blocks: blocks.length,
    findings: Object.freeze(findings),
    selection: Object.freeze(parsed.filter((v) => typeof v === 'string')),
  };
}

/**
 * composeFrom(items, slug) -> { findings, result, selection }
 *
 * AGSC-07-24. `result` is the AGSC-07-09 verdict of Steps 1 to 5 over the
 * block's selection — identical to the verdict of the same explicit selection.
 * Findings: AGSC-E301 for a block entry naming no item (AGSC-02-97), and the
 * warning AGSC-E805 when the item's stored `verdict_digest` is stale.
 */
function composeFrom(items, slug) {
  const index = indexBySlug(items);
  const item = index.get(slug);
  if (!item) {
    return {
      findings: Object.freeze([finding('AGSC-E301', 'error', {
        message: `no item with the slug ${slug} in this Bundle (AGSC-07-24)`, slug, target: slug,
      })]),
      result: null,
      selection: Object.freeze([]),
    };
  }
  const block = selectionBlock(item);
  const findings = block.findings.slice();
  for (const target of block.selection) {
    if (!index.has(target)) {
      findings.push(finding('AGSC-E301', 'error', {
        message: `the selection of ${slug} names ${target}, which is in no item of this Bundle (AGSC-02-97)`, slug, target,
      }));
    }
  }
  const result = compose(items, block.selection.filter((t) => index.has(t)));
  const stored = frontmatterOf(item).verdict_digest;
  if (typeof stored === 'string' && stored !== verdictDigest(result)) {
    findings.push(finding('AGSC-E805', 'warn', {
      message: `the stored verdict_digest of ${slug} is stale; recompose to refresh it (AGSC-07-24)`, slug,
    }));
  }
  return { findings: Object.freeze(findings), result, selection: block.selection };
}

module.exports = {
  composeFrom,
  selectionBlock,
  selectionFences,
};
