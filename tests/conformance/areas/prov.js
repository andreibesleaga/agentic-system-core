// tests/conformance/areas/prov.js — area handler for `prov` vectors.
// prov-0001 and prov-0002 (the agent lane's proposal check), prov-0003 (claims),
// prov-0005 (the DCO-Plus trailer grammar), prov-0006 to prov-0008 (clause (g)
// of the auto-channel rule over the git-log file), prov-0009, prov-0011 and prov-0014
// (the real `lint` over the minimal fixture with files added: a missing operator, the
// clean-room pattern, an `ai-*` origin without its model), prov-0010 (the Assisted-by operator of AGSC-08-07), and
// prov-0012 and prov-0013 (a real verb over the fixture: `ci` and the forge files,
// `refresh` and the lane budget). The handler is guarded, and a case with no handler
// fails, so no case passes without being checked.
'use strict';

const { guarded } = require('./_expected-reads.js');
const { fixtureLintCase } = require('./bundle.js');

const { checkProposal } = require('../../../src/governance/agents.js');

function runCheckProposalVector(vector) {
  const result = checkProposal(vector.input.config, vector.input.proposal);
  const problems = [];
  if (result.accepted !== vector.expected.accepted) problems.push(`accepted ${result.accepted} != ${vector.expected.accepted}`);
  if (vector.expected.error !== undefined) {
    if (!result.findings.some((f) => f.code === vector.expected.error)) problems.push(`no finding with code ${vector.expected.error}`);
  }
  for (const wantFinding of vector.expected.findings || []) {
    const match = result.findings.some((f) => Object.keys(wantFinding).every((k) => f[k] === wantFinding[k]));
    if (!match) problems.push(`no finding matching ${JSON.stringify(wantFinding)}`);
  }
  return problems.length === 0 ? { status: 'pass', detail: '' } : { status: 'fail', detail: problems.join('; ') };
}

// --- appended by C, 2026-09-18: prov-0003 only; nothing above changed ---

const { checkClaims, checkTrailers } = require('../../../src/governance/prov.js');

/**
 * prov-0003 — AGSC-10-17: the work-in-progress limit of an agent lane. Each
 * Proposal is evaluated against the SAME board (a Proposal is atomic: the board
 * only changes when one is merged), so the second Proposal is judged on the
 * state the first one did not change.
 */
function runClaimVector(vector) {
  const problems = [];
  for (const want of vector.expected.results || []) {
    const proposal = (vector.input.proposals || []).find((p) => p.id === want.id);
    if (proposal === undefined) {
      problems.push(`no proposal with id ${want.id}`);
      continue;
    }
    const result = checkClaims(vector.input.config, proposal, vector.input.board);
    if (want.accepted !== undefined && result.accepted !== want.accepted) {
      problems.push(`${want.id}: accepted ${result.accepted} != ${want.accepted}`);
    }
    if (want.error !== undefined && !result.findings.some((f) => f.code === want.error)) {
      problems.push(`${want.id}: no finding with code ${want.error}`);
    }
    if (want.held_after !== undefined && result.held_after !== want.held_after) {
      problems.push(`${want.id}: held_after ${result.held_after} != ${want.held_after}`);
    }
    for (const wantFinding of want.findings || []) {
      const match = result.findings.some((f) => Object.keys(wantFinding)
        .every((k) => f[k] === wantFinding[k]));
      if (!match) problems.push(`${want.id}: no finding matching ${JSON.stringify(wantFinding)}`);
    }
  }
  return problems.length === 0 ? { status: 'pass', detail: '' } : { status: 'fail', detail: problems.join('; ') };
}

/**
 * prov-0005 — AGSC-08-06, the DCO-Plus ABNF.
 * Six trailer blocks read straight off the grammar. `valid` means the
 * block matches `trailer-block = signoff *( LF assisted )` with no finding of its
 * own; a `prov` context is deliberately not supplied, because AGSC-08-07's
 * `AGSC-E505` is a different rule and this vector pins the GRAMMAR.
 */
function runTrailerGrammarVector(vector) {
  const problems = [];
  for (const want of vector.expected.results || []) {
    const trailer = (vector.input.trailers || []).find((t) => t.name === want.name);
    if (trailer === undefined) {
      problems.push(`no trailer named ${want.name}`);
      continue;
    }
    const result = checkTrailers(trailer.block, {});
    const valid = result.findings.length === 0;
    if (want.valid !== undefined && valid !== want.valid) {
      problems.push(`${want.name}: valid ${valid} != ${want.valid} (${JSON.stringify(result.findings.map((f) => f.code))})`);
    }
    if (want.code !== undefined && !result.findings.some((f) => f.code === want.code)) {
      problems.push(`${want.name}: no finding with code ${want.code}`);
    }
    if (want.valid === true && result.signoff === null) {
      problems.push(`${want.name}: the signoff was not parsed`);
    }
  }
  // The greedy rule the ABNF's comment fixes: the LAST `SP "<"` starts the email,
  // so a name that itself carries `<`-free angle-like text is still read whole.
  const greedy = checkTrailers('Signed-off-by: A B <c@d.example> (CA-v1)', {});
  if (greedy.signoff === null || greedy.signoff.name !== 'A B') {
    problems.push(`the greedy name rule is not implemented: ${JSON.stringify(greedy.signoff)}`);
  }
  return problems.length === 0 ? { status: 'pass', detail: '' } : { status: 'fail', detail: problems.join('; ') };
}

// --- prov-0006 to prov-0008: AGSC-08-26(g), the part the git-log file shows ---

const autoMerge = require('../../../src/governance/auto-merge.js');

/**
 * AGSC-08-26(g): the configuration and the git-log file in, the findings out. The
 * expected `findings[]` is the whole list: the same number of findings, each
 * matching its entry's members in order; a negative case also names its `error`.
 */
function runAutoMergeHistoryVector(vector) {
  const findings = autoMerge.check(vector.input.git_log, vector.input.config);
  const want = vector.expected.findings || [];
  const problems = [];
  if (vector.expected.error !== undefined && !findings.some((f) => f.code === vector.expected.error)) {
    problems.push(`no finding with code ${vector.expected.error}`);
  }
  if (findings.length !== want.length) problems.push(`${findings.length} findings, expected ${want.length}`);
  want.forEach((w, i) => {
    if (!findings[i] || !Object.keys(w).every((k) => findings[i][k] === w[k])) {
      problems.push(`finding ${i + 1} does not match ${JSON.stringify(w)}`);
    }
  });
  return problems.length === 0 ? { status: 'pass', detail: '' }
    : { status: 'fail', detail: `${problems.join('; ')} (${JSON.stringify(findings.map((f) => f.code))})` };
}

// --- prov-0010: AGSC-08-07, the Assisted-by operator beside the change's `prov` ---

/**
 * Each sub-case is a trailer block and the `prov` of the change it signs; `codes` is
 * the whole list of codes the check reports, in order.
 */
function runAssistedOperatorVector(vector) {
  const problems = [];
  const wanted = vector.expected.results || [];
  for (const trailer of vector.input.trailers || []) {
    const want = wanted.find((w) => w.name === trailer.name);
    if (want === undefined) {
      problems.push(`no expected result named ${trailer.name}`);
      continue;
    }
    const codes = checkTrailers(trailer.block, { prov: trailer.prov }).findings.map((f) => f.code);
    if (JSON.stringify(codes) !== JSON.stringify(want.codes)) {
      problems.push(`${trailer.name}: codes ${JSON.stringify(codes)} != ${JSON.stringify(want.codes)}`);
    }
  }
  if (wanted.length !== (vector.input.trailers || []).length) problems.push('every trailer has exactly one expected result');
  return problems.length === 0 ? { status: 'pass', detail: '' } : { status: 'fail', detail: problems.join('; ') };
}

// --- prov-0012, prov-0013: a real verb over the minimal fixture with files added ---

/** Every file under `dir`, relative and with `/`, in code-point order. */
function listFiles(nodeFs, path, dir) {
  const out = [];
  const walk = (at) => {
    for (const entry of nodeFs.readdirSync(at, { withFileTypes: true })) {
      const full = path.join(at, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(path.relative(dir, full).split(path.sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * The fixture is copied to a scratch directory, the case's files are added, and
 * `input.argv` runs through the CLI's own entry point with SOURCE_DATE_EPOCH
 * 1767225600; the directory is removed afterwards. `findings` is the WHOLE list of the
 * `--json` envelope, each entry a subset of one finding; `files_unchanged` keeps the
 * bytes the case added; `files_present` exist afterwards; `nothing_written` says the
 * run added, changed and removed no file.
 */
function runVerbOnFixture(vector, ctx) {
  const path = require('node:path');
  const nodeFs = require('node:fs');
  const os = require('node:os');
  const { main } = require('../../../src/application/cli/main.js');
  const { createFileSystem } = require('../../../src/adapters/node-fs.js');
  const { captureStream } = require('./_shared.js');
  const { findingsMatch, checks } = require('./_assert.js');
  const engineRoot = (ctx && ctx.root) || '.';
  const input = vector.input;
  const expected = vector.expected;
  const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), `agsc-${vector.id}-`));
  try {
    nodeFs.cpSync(path.join(engineRoot, 'tests', String(input.bundle)), root, { recursive: true });
    for (const [file, text] of Object.entries(input.add_files || {})) {
      nodeFs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      nodeFs.writeFileSync(path.join(root, file), text);
    }
    const before = new Map(listFiles(nodeFs, path, root).map((f) => [f, nodeFs.readFileSync(path.join(root, f), 'utf8')]));
    const stdout = captureStream();
    const exit = main(input.argv, {
      env: { SOURCE_DATE_EPOCH: '1767225600' }, ports: { fs: createFileSystem(root) }, root,
      specVersion: (vector.options || {}).spec_version, stderr: captureStream(), stdout,
      version: (vector.options || {}).spec_version,
    });
    let findings = [];
    try { findings = JSON.parse(stdout.text() || '{}').findings || []; } catch (e) { findings = []; }
    const list = [[`exit ${expected.exit}`, exit === expected.exit, `exit ${exit}`]];
    const m = findingsMatch(expected.findings, findings);
    list.push(['findings', m.ok && findings.length === expected.findings.length,
      `${m.detail} ${JSON.stringify(findings.map((f) => [f.code, f.file, f.severity]))}`]);
    for (const file of expected.files_unchanged || []) {
      const now = nodeFs.existsSync(path.join(root, file)) ? nodeFs.readFileSync(path.join(root, file), 'utf8') : null;
      list.push([`${file} unchanged`, now !== null && now === input.add_files[file], JSON.stringify(now)]);
    }
    for (const file of expected.files_present || []) {
      list.push([`${file} present`, nodeFs.existsSync(path.join(root, file)), file]);
    }
    if (expected.nothing_written !== undefined) {
      const after = listFiles(nodeFs, path, root);
      const same = after.length === before.size
        && after.every((f) => before.get(f) === nodeFs.readFileSync(path.join(root, f), 'utf8'));
      list.push(['nothing written', same === expected.nothing_written, JSON.stringify(after.filter((f) => !before.has(f)))]);
    }
    return checks(list);
  } finally {
    nodeFs.rmSync(root, { force: true, recursive: true });
  }
}

const HANDLERS = {
  'prov-0001': runCheckProposalVector,
  'prov-0002': runCheckProposalVector,
  'prov-0003': runClaimVector,
  'prov-0005': runTrailerGrammarVector,
  'prov-0006': runAutoMergeHistoryVector,
  'prov-0007': runAutoMergeHistoryVector,
  'prov-0008': runAutoMergeHistoryVector,
  'prov-0009': fixtureLintCase,
  'prov-0010': runAssistedOperatorVector,
  'prov-0011': fixtureLintCase,
  'prov-0012': runVerbOnFixture,
  'prov-0013': runVerbOnFixture,
  'prov-0014': fixtureLintCase,
};

module.exports.run = guarded(function run(vector, ctx) {
  const handler = HANDLERS[vector.id];
  if (!handler) return { status: 'fail', detail: `${vector.id}: no handler in area prov` };
  return handler(vector, ctx);
});
