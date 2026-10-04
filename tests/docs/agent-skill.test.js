'use strict';
// tests/docs/agent-skill.test.js — the agent skill in skills/agentic-system-core/ stays
// well-formed, names only real verbs, and is the same bytes as the copy the Claude Code
// plugin in plugins/agentic-system-core/ carries; the marketplace file points at that plugin.
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

test('the plugin carries the same bytes as skills/agentic-system-core/', () => {
  const copy = path.join(PLUGIN, 'skills', 'agentic-system-core');
  assert.deepEqual(files(copy), files(SKILL));
  for (const f of files(SKILL)) assert.ok(fs.readFileSync(path.join(SKILL, f)).equals(fs.readFileSync(path.join(copy, f))), `${f} differs`);
});

test('the plugin is content only: no hooks, no MCP server, no scripts, no executables', () => {
  for (const f of files(PLUGIN)) {
    assert.match(f, /^(?:\.claude-plugin\/plugin\.json|README\.md|skills\/agentic-system-core\/.+\.md)$/u, `unexpected file in the plugin: ${f}`);
  }
});

test('the marketplace names the plugin by the same name and points at its folder', () => {
  const market = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));
  const plugin = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(market.plugins.length, 1);
  assert.equal(market.plugins[0].name, plugin.name);
  assert.equal(path.resolve(ROOT, market.plugins[0].source), PLUGIN);
  assert.equal(plugin.name, 'agentic-system-core');
});
