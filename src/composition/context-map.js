'use strict';
/**
 * CONTEXT Composition — the context map of a composition (AGSC-07-30).
 *
 * For a node that declares contexts (`domain.contexts` not empty, AGSC-01-41), every `compose`
 * that emits a Harness also writes `context-map.json` in the companion directory: which declared
 * context each member belongs to (AGSC-08-32), the authored Links inside the selection whose two
 * ends lie in two different contexts, the members in no context, and the relationships and
 * crosswalks the node declares for its peers (AGSC-11-24). For any other node it writes nothing,
 * so the domain layer costs a node that does not use it not one file (vector `compose-0033`).
 *
 * WHY BESIDE THE HARNESS. The seven file kinds of AGSC-07-12 are pinned byte for byte by
 * `compose-0027`, and a MINOR may not move them. So the map is a file of its own in the
 * companion directory of AGSC-07-25 (`<harness dir>.companion/`), and nothing here is read by
 * `harness.js`: the Harness of a node that declares contexts is the Harness of one that does not
 * (`compose-0032` states the same digests as `compose-0033`).
 *
 * The members `bundle_version`, `generated_at`, `license`, `selection`, `selection_digest`,
 * `spec_version` and `terms_statement` are those of `harness.jsonld`, computed by the same
 * functions of `harness.js`, so the two files cannot disagree.
 * Requirements: PRD-037.
 *
 * PURE: the verdict, the items and the options in, a JSON object and a text out. The caller
 * (`application/cli/verbs/compose.js`) hashes the selection, reads the crosswalk files and writes
 * the file; the crosswalk statements arrive already read by `boundary/federation.js`.
 */

const { compareCodePoint, frontmatterOf, indexBySlug } = require('./compose.js');
const harness = require('./harness.js');
const bounded = require('../knowledge/contexts.js');

/** The file name of AGSC-07-30, inside the companion directory. */
const FILE = 'context-map.json';

/** AGSC-07-30: one entry per declared context a member belongs to, ordered by name. */
function contextEntries(contextOfMember, entries, selection) {
  return entries
    .map((entry) => ({ members: selection.filter((slug) => contextOfMember(slug) === entry.cluster), name: entry.cluster, namespace: entry.namespace }))
    .filter((entry) => entry.members.length > 0)
    .sort((a, b) => compareCodePoint(a.name, b.name));
}

/** AGSC-07-30: the authored Links inside the selection whose ends lie in two different contexts. */
function crossContextLinks(contextOfMember, index, selection) {
  const inside = new Set(selection);
  const out = [];
  for (const source of selection) {
    for (const [key, targets] of Object.entries(harness.linksOf(index.get(source)))) {
      for (const target of targets) {
        const [from, to] = [contextOfMember(source), contextOfMember(target)];
        if (inside.has(target) && from !== null && to !== null && from !== to) {
          out.push({ key, source, source_context: from, target, target_context: to });
        }
      }
    }
  }
  return out.sort((a, b) => compareCodePoint(a.source, b.source) || compareCodePoint(a.key, b.key) || compareCodePoint(a.target, b.target));
}

/** AGSC-11-24: the peers' declared relationships and crosswalks, ordered by address. */
function peerEntries(peers) {
  return (peers || [])
    .map((peer) => ({
      crosswalk: (peer.statements || []).map((s) => ({ local: s.local, match: s.match, peer: s.peer })),
      relationship: peer.relationship,
      url: bounded.peerUrl(peer.url),
    }))
    .sort((a, b) => compareCodePoint(a.url, b.url));
}

/**
 * AGSC-07-30: the context map of a valid composition, or `null` for an invalid one (no Harness,
 * AGSC-07-17) and for a node that declares no context.
 *
 * @param {object} result the verdict of `compose.js#compose`
 * @param {{contexts?: Array<{cluster: string, namespace: string}>, items: Array<object>,
 *   peers?: Array<{url: string, relationship: string, statements?: Array<object>}>,
 *   bundleVersion?: string, instant: string, licenseProse?: string, selectionDigest: string,
 *   specVersion: string, listed?: string[]}} options `contexts` is `domain.contexts`; `peers` the
 *   typed peers with the statements of their crosswalks; `listed` the slugs of the listed items
 *   (every item when absent); the rest as `harness.js#emit` takes them
 * @returns {object|null} the members in the order JCS writes them
 */
function contextMap(result, options) {
  const entries = bounded.declared({ domain: { contexts: options.contexts } });
  if (!harness.isEmitted(result) || entries.length === 0) return null;
  const selection = [...result.selection];
  const index = indexBySlug(options.items);
  const contextOf = bounded.contextOf(entries);
  // AGSC-07-30 as amended 2026-11-10: a context whose cluster is not a listed item (a draft, a
  // retired or a held-back cluster, AGSC-00-05) is never named; its members belong to none.
  const listed = options.listed === undefined ? null : new Set(options.listed);
  const named = (context) => (context !== null && (listed === null || listed.has(context)) ? context : null);
  const contextOfMember = (slug) => (index.has(slug) ? named(contextOf(frontmatterOf(index.get(slug)))) : null);
  return {
    bundle_version: harness.contentVersion(options.bundleVersion, options.instant),
    contexts: contextEntries(contextOfMember, entries, selection),
    cross_context_links: crossContextLinks(contextOfMember, index, selection),
    generated_at: options.instant,
    license: { prose: options.licenseProse, structure: harness.structureLicence(), terms: harness.terms(options.licenseProse) },
    peers: peerEntries(options.peers),
    selection,
    selection_digest: options.selectionDigest,
    spec_version: options.specVersion,
    terms_statement: harness.licenceSentence(options.licenseProse),
    unassigned: selection.filter((slug) => contextOfMember(slug) === null),
  };
}

/**
 * AGSC-07-30: the files of the companion directory this composition writes for the context map —
 * `[['context-map.json', text]]` for a node that declares contexts, `[]` for any other, in which
 * case no companion directory is created.
 *
 * @returns {Array<[string, string]>}
 */
function contextMapFiles(result, options) {
  const map = contextMap(result, options);
  return map === null ? [] : [[FILE, `${harness.canonicalJson(map)}\n`]];
}

module.exports = { FILE, contextMap, contextMapFiles };
