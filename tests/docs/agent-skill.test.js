'use strict';
// tests/docs/agent-skill.test.js — the agent skill in skills/agentic-system-core/ stays
// well-formed and names only real verbs; the copy the Claude Code plugin in
// plugins/agentic-system-core/ carries is the same bytes without the passages about the
// engine's tool server (LEFT_OUT), because the plugin declares no server and the plugin
// directory refuses a plugin whose text tells anyone to add one; the marketplace file points
// at that plugin.
//
// Deterministic: reads files only; no process, no clock, no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const SKILL = path.join(ROOT, 'skills', 'agentic-system-core');
const PLUGIN = path.join(ROOT, 'plugins', 'agentic-system-core');

/** Every file under `dir`, as sorted paths relative to it. */
function files(dir) {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(path.relative(dir, p).split(path.sep).join('/'));
    }
  })(dir);
  return out.sort();
}

/** The verb list the command line declares (src/application/cli/main.js). */
function verbs() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'application', 'cli', 'main.js'), 'utf8');
  const m = /const VERBS = \[([^\]]*)\]/u.exec(src);
  return new Set([...m[1].matchAll(/'([a-z-]+)'/gu)].map((x) => x[1]));
}

test('the skill folder holds SKILL.md and its two reference files, Markdown only', () => {
  assert.deepEqual(files(SKILL), ['SKILL.md', 'references/configuration.md', 'references/connectors.md']);
});

test('SKILL.md frontmatter meets the Agent Skills format', () => {
  const text = fs.readFileSync(path.join(SKILL, 'SKILL.md'), 'utf8');
  const fm = /^---\n([\s\S]*?)\n---\n/u.exec(text);
  assert.ok(fm, 'frontmatter block');
  const name = /^name: (.+)$/mu.exec(fm[1])[1];
  const description = /^description: (.+)$/mu.exec(fm[1])[1];
  assert.equal(name, path.basename(SKILL), 'name equals the folder name');
  assert.match(name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
  assert.ok(name.length <= 64);
  assert.ok(description.length > 0 && description.length <= 1024, `description is ${description.length} characters`);
  assert.match(fm[1], /^license: CC0-1\.0$/mu);
  assert.ok(text.split('\n').length <= 500, 'SKILL.md stays under 500 lines');
});

test('every `agsc <verb>` the skill names is a verb of the engine (AGSC-09-07)', () => {
  const known = verbs();
  for (const f of files(SKILL)) {
    const text = fs.readFileSync(path.join(SKILL, f), 'utf8');
    for (const m of text.matchAll(/`agsc ([a-z][a-z-]*)/gu)) assert.ok(known.has(m[1]), `${f}: "agsc ${m[1]}" is not a verb`);
  }
});

test('the security contact the skill teaches carries no date that expires (AGSC-06-36 derives Expires at build)', () => {
  // A fixed `Expires:` in a first-run example makes `ci` fail from that date on; with
  // the `Contact:` line alone the writer derives `Expires` from the build instant.
  for (const f of files(SKILL)) {
    const text = fs.readFileSync(path.join(SKILL, f), 'utf8');
    assert.doesNotMatch(text, /^\s*Expires:/mu, `${f} shows a dated Expires line`);
  }
  const skill = fs.readFileSync(path.join(SKILL, 'SKILL.md'), 'utf8');
  assert.match(skill, /^\s*Contact: \S+$/mu, 'the skill shows the Contact line');
});

/**
 * What the plugin's copy of the skill leaves out or shortens: [file, the text of
 * skills/agentic-system-core/, the text of the plugin's copy]. Every passage is about the
 * engine's tool server. To update the copy after a change to the skill: copy the three
 * files into the plugin, then make these replacements, each exactly once.
 */
const LEFT_OUT = [
  ['SKILL.md', 'section 6; `agsc mcp`; `agsc propose <slug>`', 'section 6; `agsc propose <slug>`'],
  ['SKILL.md', /^\| tools \| `agsc mcp [^\n]*\n/mu, ''],
  ['SKILL.md', ' Over `agsc mcp`, `remember` and `propose` return text and write nothing; you save it.', ''],
  ['SKILL.md', ' (`propose({slug, task_state, at})` over the tools)', ''],
  ['SKILL.md', 'Every result of `agsc mcp` and of a node\'s page tools is', 'Every result of a node\'s page tools is'],
  ['SKILL.md', 'Connecting coding agents, assistants, CI and trackers', 'Connecting coding agents, CI and trackers'],
  ['references/connectors.md', /^## Assistants: the tool server\n\n[^\n]+\n\n/mu, ''],
];

/** The text the plugin carries for one file of the skill: the skill's text after LEFT_OUT. */
function pluginText(file) {
  let text = fs.readFileSync(path.join(SKILL, file), 'utf8');
  for (const [f, from, to] of LEFT_OUT.filter((row) => row[0] === file)) {
    const parts = text.split(from);
    assert.equal(parts.length, 2, `${f}: the skill must hold this passage exactly once: ${from}`);
    text = parts.join(to);
  }
  return text;
}

test('the plugin carries the skill of skills/agentic-system-core/ without the tool-server passages, and the same bytes otherwise', () => {
  const copy = path.join(PLUGIN, 'skills', 'agentic-system-core');
  assert.deepEqual(files(copy), files(SKILL));
  for (const f of files(SKILL)) assert.equal(fs.readFileSync(path.join(copy, f), 'utf8'), pluginText(f), `${f} differs`);
});

test('no text in the plugin names a tool server command or tells anyone to add one', () => {
  // The plugin declares no server, so the plugin directory refuses text that sets one up
  // (https://claude.com/docs/plugins/pre-submission-checklist, read on 2026-11-28).
  for (const f of files(PLUGIN).filter((name) => !name.endsWith('.png'))) {
    assert.doesNotMatch(fs.readFileSync(path.join(PLUGIN, f), 'utf8'), /mcp/iu, `${f} names a tool server`);
  }
});

test('the plugin is content only: no hooks, no MCP server, no scripts, no executables', () => {
  for (const f of files(PLUGIN)) {
    assert.match(f, /^(?:\.claude-plugin\/plugin\.json|\.claude-plugin\/icon\.png|README\.md|skills\/agentic-system-core\/.+\.md)$/u, `unexpected file in the plugin: ${f}`);
  }
});

test('the marketplace names the plugin by the same name and points at its folder', () => {
  const market = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));
  const plugin = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(market.plugins.length, 1);
  assert.equal(market.plugins[0].name, plugin.name);
  assert.deepEqual(market.plugins[0].keywords, plugin.keywords);
  assert.equal(path.resolve(ROOT, market.plugins[0].source), PLUGIN);
  assert.equal(plugin.name, 'agentic-system-core');
});

test('the plugin carries a version equal to the package version and a square PNG icon of 512 to 2048 px under 2 MB', () => {
  const plugin = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(plugin.version, pkg.version);
  const png = fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'icon.png'));
  assert.equal(png.subarray(1, 4).toString('latin1'), 'PNG');
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
  assert.equal(w, h);
  assert.ok(w >= 512 && w <= 2048, `icon side ${w}`);
  assert.ok(png.length < 2 * 1024 * 1024);
});

test('the skill never tells an agent to read a person\'s identity from the machine', () => {
  for (const rel of ['skills/agentic-system-core/SKILL.md', path.relative(ROOT, path.join(PLUGIN, 'skills', 'agentic-system-core', 'SKILL.md'))]) {
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, rel), 'utf8'), /user\.email/u, rel);
  }
});

/** The adapter names one row of the skill's command table lists after the word "adapters". */
function rowAdapters(job) {
  const text = fs.readFileSync(path.join(SKILL, 'SKILL.md'), 'utf8');
  const row = text.split('\n').find((l) => l.startsWith(`| ${job} |`));
  assert.ok(row, `SKILL.md has no "${job}" row`);
  const tail = row.slice(row.indexOf('adapters '));
  return new Set([...tail.matchAll(/`([a-z][a-z0-9-]*)`/gu)].map((m) => m[1]));
}

test('the skill names every import adapter and every direct memory adapter the engine ships (AGSC-01-26a)', () => {
  // The import verb's own list is the source; an adapter the skill leaves out is one an
  // assistant reading the skill never offers.
  const { FORMATS, MEMORY_ADAPTERS } = require('../../src/application/cli/verbs/import.js');
  const imports = rowAdapters('import');
  assert.deepEqual(FORMATS.filter((f) => !imports.has(f)), [], 'import adapters the SKILL.md import row does not name');
  const row = fs.readFileSync(path.join(SKILL, 'SKILL.md'), 'utf8').split('\n').find((l) => l.startsWith('| import |'));
  for (const flag of ['--allow-newer', '--source-version']) assert.ok(row.includes(flag), `the import row does not name ${flag}`);
  const exports = rowAdapters('export');
  const memory = MEMORY_ADAPTERS.map((a) => a.FORMAT);
  assert.deepEqual(memory.filter((f) => !exports.has(f)), [], 'memory adapters the SKILL.md export row does not name');
  const connectors = fs.readFileSync(path.join(SKILL, 'references', 'connectors.md'), 'utf8');
  for (const f of memory) assert.ok(connectors.includes(`--to ${f}`) || connectors.includes(`\`${f}\``), `references/connectors.md does not name the ${f} adapter`);
});
