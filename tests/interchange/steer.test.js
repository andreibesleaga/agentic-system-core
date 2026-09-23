'use strict';
// tests/interchange/steer.test.js — AGSC-01-28, the steer bundles.
// The closed registry, the closed source set, the identical bytes, the
// Channel-Auto withholding and the AGSC-01-29 obligations, each asserted at the
// boundary the rule draws.

const test = require('node:test');
const assert = require('node:assert');

const steer = require('../../src/interchange/steer.js');
const chunks = require('../../src/knowledge/chunks.js');

const NOW = { counts: { concepts: 2, procedures: 1 }, last_build: '2026-01-01T00:00:00Z' };

function item(slug, type, extra = {}, body = `# ${slug}\n\nThe body of ${slug}.\n`) {
  return {
    body,
    frontmatter: {
      description: `The description of ${slug}, long enough to look like a real one here.`,
      title: slug, type, ...extra,
    },
    path: `content/${type === 'cluster' ? 'clusters' : `${type}s`}/${slug}.md`,
    slug,
    type,
  };
}

function bundleOf(items) {
  return {
    config: {
      bundle: { id: 'node', license_prose: 'CC-BY-4.0' },
      site: { base: 'https://example.org/', title: 'A Node' },
    },
    items,
  };
}

function planOf(items, options = {}) {
  return steer.plan(bundleOf(items), {
    generatedAt: '2026-01-01T00:00:00Z', nowState: NOW, specVersion: '1.0.0-rc.5', ...options,
  });
}

test('AGSC-01-28: the registry is the eleven rows of the rule, and only those', () => {
  assert.deepStrictEqual(Object.keys(steer.TARGETS).sort(), ['agents', 'aider', 'claude', 'cline',
    'codex', 'copilot', 'cursor', 'gabbe', 'gemini', 'kiro', 'windsurf']);
  assert.strictEqual(Object.keys(steer.TARGETS).length, 11);
  assert.deepStrictEqual(steer.TARGETS, Object.freeze({
    agents: 'AGENTS.md',
    aider: 'CONVENTIONS.md',
    claude: 'CLAUDE.md',
    cline: '.clinerules/agsc.md',
    codex: 'AGENTS.override.md',
    copilot: '.github/copilot-instructions.md',
    cursor: '.cursor/rules/agsc.mdc',
    gabbe: 'GABBE/agents/AGENTS.md',
    gemini: 'GEMINI.md',
    kiro: '.kiro/steering/agsc.md',
    windsurf: '.windsurf/rules/agsc.md',
  }));
});

test('AGSC-01-28: the default is agents,claude, and every target carries the same bytes', () => {
  const plan = planOf([item('a', 'concept', { kind: 'explainer' })]);
  assert.deepStrictEqual(plan.files.map((f) => f.target), ['agents', 'claude']);
  assert.deepStrictEqual(plan.files.map((f) => f.path), ['AGENTS.md', 'CLAUDE.md']);
  assert.strictEqual(plan.files[0].text, plan.files[1].text);
});

test('AGSC-01-28: a target outside the registry is AGSC-E203 and names the eleven', () => {
  // rc.6, AGSC-00-23 (D112): a value outside a closed operator list is AGSC-E203.
  // It was AGSC-E002 until then, which AGSC-09-08 reserves for an unknown FLAG and
  // which would have made this an exit-2 usage error rather than a finding.
  const plan = planOf([], { targets: ['agents', 'notepad'] });
  assert.deepStrictEqual(plan.files.map((f) => f.target), ['agents']);
  const one = plan.findings.find((f) => f.code === 'AGSC-E203');
  assert.match(one.message, /windsurf/u);
  assert.strictEqual(plan.findings.some((f) => f.code === 'AGSC-E002'), false);
});

test('a repeated target is emitted once', () => {
  assert.deepStrictEqual(planOf([], { targets: ['claude', 'claude'] }).files.map((f) => f.path),
    ['CLAUDE.md']);
});

test('AGSC-01-28: the source set is the four types — never an Episode, never a Cluster', () => {
  const items = [
    item('c', 'concept', { kind: 'explainer' }),
    item('p', 'procedure'),
    item('g', 'gate', { level: 'L1' }),
    item('l', 'lesson', { severity: 'info' }),
    item('e', 'episode', { started: '2026-01-01T00:00:00Z', actor: 'human:x', outcome: 'success' },
      '# e\n\nSECRET EPISODE PROSE.\n'),
    item('k', 'cluster', {}, '# k\n\nSECRET CLUSTER PROSE.\n'),
  ];
  const text = planOf(items).files[0].text;
  assert.ok(!text.includes('SECRET EPISODE PROSE'), 'an Episode reached a steer target');
  assert.ok(!text.includes('SECRET CLUSTER PROSE'), 'a Cluster reached a steer target');
  for (const slug of ['c', 'p', 'g', 'l']) assert.ok(text.includes(slug), slug);
});

test('AGSC-06-30: a draft, a retired and a release-gated item are in no target', () => {
  const items = [
    item('open', 'concept', { kind: 'explainer' }),
    item('hidden', 'concept', { kind: 'explainer', status: 'draft' }, '# hidden\n\nDRAFT PROSE.\n'),
  ];
  const text = planOf(items).files[0].text;
  assert.ok(!text.includes('DRAFT PROSE'));
  assert.ok(text.includes('open'));
});

test('AGSC-01-29: the provenance header, the terms and the fenced prose are all there', () => {
  const text = planOf([item('p', 'procedure')]).files[0].text;
  assert.match(text, /^# A Node — steering for coding agents\n\n<!-- agsc:provenance\n/u);
  assert.match(text, /\nbundle: https:\/\/example\.org\/\n/u);
  assert.match(text, /\nlicense: CC-BY-4\.0\n/u);
  assert.match(text, new RegExp(`\nterms: ${chunks.TERMS.replace(/[.]/gu, '\\.')}\n`, 'u'));
  assert.match(text, /\nspec_version: 1\.0\.0-rc\.5\n/u);
  assert.match(text, /\ngenerated_at: 2026-01-01T00:00:00Z\nassistance: content may be AI-assisted; each item states its origin in prov\.origin and each accepted contribution carries an Assisted-by: trailer\n-->\n/u);
  assert.match(text, /```text agsc-content\n/u);
  assert.ok(text.endsWith('\n'));
});

test('AGSC-01-29: a body carrying a fence cannot close ours', () => {
  const text = planOf([item('p', 'procedure', {}, '# p\n\n```\nnested\n```\n')]).files[0].text;
  assert.match(text, /````text agsc-content\n/u);
  assert.strictEqual(steer.fenceProse('a ```` b'), '`````text agsc-content\na ```` b\n`````');
});

test('AGSC-02-24: an authored value cannot forge a heading in a line-oriented target', () => {
  const evil = item('c', 'concept',
    { kind: 'explainer', title: 'Fine\n\n## Forged\n\n- [x](https://evil.example/): pwned' });
  const text = planOf([evil]).files[0].text;
  assert.ok(!text.includes('\n## Forged'), text);
});

test('AGSC-01-28: a concept is INDEXED by description; a procedure, gate and lesson are quoted', () => {
  const text = planOf([
    item('c', 'concept', { kind: 'explainer' }, '# c\n\nCONCEPT BODY.\n'),
    item('p', 'procedure', {}, '# p\n\nPROCEDURE BODY.\n'),
  ]).files[0].text;
  assert.ok(!text.includes('CONCEPT BODY'), 'a concept body was quoted');
  assert.ok(text.includes('PROCEDURE BODY'), 'a procedure body was not quoted');
  assert.match(text, /- \[c\]\(https:\/\/example\.org\/concepts\/c\/\): The description of c/u);
});

test('AGSC-01-28: the Channel-Auto withholding, and the human verified[] that clears it', () => {
  const gitLog = [
    { files: ['content/concepts/a.md'], sha: '1', trailers: {} },
    { files: ['content/concepts/a.md', 'content/concepts/b.md'], sha: '2', trailers: { 'Channel-Auto': 'slack' } },
    { files: ['content/concepts/b.md'], sha: '3', trailers: {} },
  ];
  const items = [
    item('a', 'concept', { kind: 'explainer' }, '# a\n\nAUTO PROSE.\n'),
    item('b', 'concept', { kind: 'explainer' }),
  ];
  const plan = planOf(items, { gitLog });
  assert.deepStrictEqual(plan.withheld, ['a'], 'the latest commit decides, not any commit');
  assert.ok(!plan.files[0].text.includes('AUTO PROSE'));
  assert.ok(plan.findings.some((f) => f.code === 'AGSC-E506' && /Channel-Auto/u.test(f.message)));

  // A human `verified[]` entry clears it; a process one does not (AGSC-02-09).
  const verified = [item('a', 'concept', { kind: 'explainer', verified: [{ by: 'human:x', at: '2026-01-02T00:00:00Z' }] }),
    items[1]];
  assert.deepStrictEqual(planOf(verified, { gitLog }).withheld, []);
  const byProcess = [item('a', 'concept', { kind: 'explainer', verified: [{ by: 'process:bot', at: '2026-01-02T00:00:00Z' }] }),
    items[1]];
  assert.deepStrictEqual(planOf(byProcess, { gitLog }).withheld, ['a']);
});

test('AGSC-08-20b: a commit with no files[] can neither add to nor clear the withheld set', () => {
  assert.deepStrictEqual([...steer.channelAutoPaths([
    { sha: '1', trailers: { 'Channel-Auto': 'x' } },
    { files: ['content/concepts/a.md'], sha: '2', trailers: { 'Channel-Auto': 'x' } },
    { sha: '3', trailers: {} },
  ])], ['content/concepts/a.md']);
  assert.deepStrictEqual([...steer.channelAutoPaths(undefined)], []);
  // The trailer key is compared case-insensitively (AGSC-08-20b).
  assert.deepStrictEqual([...steer.channelAutoPaths([
    { files: ['x.md'], sha: '1', trailers: { 'channel-auto': 'x' } },
  ])], ['x.md']);
});

test('the lane says so when no git-log file was supplied, rather than reporting a green one', () => {
  assert.match(planOf([]).lanes[0], /NOT RUN/u);
  assert.match(planOf([], { gitLog: [] }).lanes[0], /^channel-auto \(from/u);
});

test('AGSC-06-22: the NOW block omits a member the state does not carry', () => {
  const rich = steer.nowLines({
    counts: { concepts: 1 },
    last_build: 'X',
    open_lessons: ['l'],
    stale: ['s'],
    waiting_for_a_person: [{ slug: 't', state: 'TASK_STATE_INPUT_REQUIRED' }],
  });
  assert.ok(rich.some((l) => l.includes('stale items: s')));
  assert.ok(rich.some((l) => l.includes('open lessons: l')));
  assert.ok(rich.some((l) => l.includes('waiting for a person: t (TASK_STATE_INPUT_REQUIRED)')));
  const bare = steer.nowLines({});
  assert.deepStrictEqual(bare, ['## Now', '', '']);
  assert.deepStrictEqual(steer.nowLines(undefined), ['## Now', '', '']);
});

test('AGSC-04-01: the same Bundle yields the same bytes twice', () => {
  const items = [item('p', 'procedure')];
  assert.strictEqual(planOf(items).files[0].text, planOf(items).files[0].text);
});

test('a Bundle with no site.title falls back to bundle.id, never to the word null', () => {
  const plan = steer.plan({ config: { bundle: { id: 'fallback' }, site: {} }, items: [] },
    { generatedAt: 'X', nowState: NOW, specVersion: 'Y' });
  assert.match(plan.files[0].text, /^# fallback — steering/u);
  const none = steer.plan({ config: {}, items: [] }, { generatedAt: 'X', nowState: NOW, specVersion: 'Y' });
  assert.match(none.files[0].text, /^# This node — steering/u);
});

test('flatten() leaves an already-flat record alone', () => {
  assert.deepStrictEqual(steer.flatten({ slug: 'a', type: 'concept' }), { slug: 'a', type: 'concept' });
  assert.strictEqual(steer.hasHumanVerification({}), false);
});

// ENG-9 (found while building the GABBE adapter): `plan` accepted `bundleVersion`
// and dropped it, so every steer target stated the build-instant fallback
// `0.0.0+<instant>` even when the Bundle has a real content version (AGSC-04-25,
// AGSC-06-15: every provenance header carries THE content version).
test('AGSC-04-25: the steer header states the content version it was handed', () => {
  const planned = require('../../src/interchange/steer.js').plan(
    { config: { site: { base: 'https://x.example/', title: 'X' } }, items: [] },
    { bundleVersion: 'v9.9.9', generatedAt: '2026-01-01T00:00:00Z', specVersion: '1.0.0-rc.6' });
  assert.ok(planned.files[0].text.split('\n').includes('bundle_version: v9.9.9'));
});
