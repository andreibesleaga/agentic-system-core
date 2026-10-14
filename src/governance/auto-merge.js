'use strict';
// CONTEXT Governance & Provenance — the auto-channel lane's history check.
// Implements AGSC-08-26(g), the part the git-log file of AGSC-08-20b can show: on a
// Bundle with at least one `channels[]` entry whose `publish` is `auto`, every
// element of the first-parent chain after the root commit MUST be a merge commit
// (two or more `parents[]`) and MUST carry a `Signed-off-by`, `Proposal` or
// `Channel-Auto` trailer; `verify` and `ci` report each element that is not as
// `AGSC-E706`, naming its sha. The root commit, which no merge can produce, is
// exempt. A Bundle with no `auto` channel satisfies the rule vacuously.
//
// What only the forge's records show — that a merge is reachable from a merged pull
// request, that a commit's author is the ingest identity of (f), and that an ingest
// identity holds the bypass — is checked by the forge's CI under the same code and
// is not asked of this function.
//
// PURE: no fs, no process, no clock, no network. The git-log file and the
// configuration arrive as data.

const { finding } = require('./finding.js');

/** AGSC-08-26(g): the three trailers, any one of which a content-branch commit carries. */
const TRAILERS = Object.freeze(['Signed-off-by', 'Proposal', 'Channel-Auto']);

/**
 * Does the configuration register a channel whose publish choice is `auto`?
 * (AGSC-01-31: the choice defaults to `hitl`.)
 * @param {object} [config] the parsed `agsc.config.json`.
 * @returns {boolean}
 */
function hasAutoChannel(config) {
  const channels = config && config.channels;
  return Array.isArray(channels) && channels.some((c) => c !== null && typeof c === 'object' && c.publish === 'auto');
}

/** A trailer of the three with a non-empty value, keys compared without regard to case (AGSC-08-20b). */
function carriesTrailer(trailers) {
  const wanted = new Set(TRAILERS.map((t) => t.toLowerCase()));
  return Object.keys(trailers && typeof trailers === 'object' ? trailers : {})
    .some((key) => wanted.has(key.toLowerCase()) && String(trailers[key]).trim() !== '');
}

/**
 * AGSC-08-26(g) over the git-log file: one `AGSC-E706` error per element after the
 * root that is not a merge commit, or carries none of the three trailers, or both.
 *
 * @param {Array<object>|undefined} gitLog the git-log file, `[{sha, parents[], trailers{}}]`,
 *   oldest first, from the root commit; `undefined` when there is no history.
 * @param {object} [config] the parsed `agsc.config.json`.
 * @returns {Array<object>} the findings, in the order of the git-log file.
 */
function check(gitLog, config) {
  if (!hasAutoChannel(config) || !Array.isArray(gitLog)) return [];
  const out = [];
  for (let i = 1; i < gitLog.length; i += 1) {
    const element = gitLog[i] || {};
    const merge = Array.isArray(element.parents) && element.parents.length >= 2;
    const signed = carriesTrailer(element.trailers);
    if (merge && signed) continue;
    const faults = [];
    if (!merge) faults.push('is not a merge commit');
    if (!signed) faults.push(`carries none of the trailers ${TRAILERS.join(', ')}`);
    out.push(finding('AGSC-E706',
      `commit ${String(element.sha)} of the content branch ${faults.join(' and ')}; with a channel whose publish`
      + ' choice is auto, every commit after the root reaches the branch as a merged pull request (AGSC-08-26(g))'));
  }
  return out;
}

module.exports = { TRAILERS, check, hasAutoChannel };
