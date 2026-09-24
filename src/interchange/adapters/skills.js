'use strict';
/**
 * CONTEXT Interchange — memory adapter `skills` (AGSC-01-26a): the
 * well-known skills repositories and rule packs, both ways.
 *
 *   agsc export --to skills --layout <layout>
 *   agsc import --from skills [--layout <layout>] [--list] <local-clone>
 *
 * THE FIVE LAYOUTS (each read at its primary source on 2026-09-23; the quotes and
 * URLs are in `docs/CONNECTORS.md` §"Skills repositories"):
 *   * `agentskills`   — the Agent Skills format (agentskills.io/specification): "A
 *     skill is a directory containing, at minimum, a `SKILL.md` file", whose YAML
 *     frontmatter carries `name` (1-64 characters, lowercase letters, digits and
 *     single hyphens, equal to the directory name) and `description` (≤ 1024),
 *     and optionally `license`, `compatibility`, `metadata` (a string map) and the
 *     experimental `allowed-tools`; optional `scripts/`, `references/`, `assets/`.
 *     Anthropic's `anthropics/skills`, the "garden" collections, OpenAI Codex
 *     (`.agents/skills/<name>/SKILL.md`) and `gh skill` all use it.
 *   * `claude-plugin` — a Claude Code plugin: `.claude-plugin/plugin.json`
 *     (`name` required; `version`, `description`, `license`, `skills` optional)
 *     and `skills/<name>/SKILL.md`.
 *   * `marketplace`   — a Claude Code plugin marketplace:
 *     `.claude-plugin/marketplace.json` with `name`, `owner`, `plugins[]`, each
 *     plugin a `name`, a `source` and optionally `version` and `skills[]`.
 *   * `cursor`        — Cursor project rules, `.cursor/rules/*.mdc`, frontmatter
 *     `description`, `globs`, `alwaysApply`.
 *   * `windsurf`      — Windsurf/Devin workspace rules, `.windsurf/rules/*.md`
 *     (or `.devin/rules/*.md`), frontmatter `trigger`, `globs`, `description`.
 *
 * IMPORT. A foreign skill becomes a `procedure` (`when` ← `description`); a foreign
 * rule becomes a `concept` of kind `explainer` (a rule explains how to work; it has
 * no steps). Provenance: `prov: {origin: imported, operator: <bundle.operator>}` and
 * `prov.source_version` when the source states a version (the `--source-version`
 * flag, else the plugin's or marketplace's `version`, else the skill's
 * `metadata.version`; AGSC-01-22); `x-skills-source` names the file, `x-skills-layout`
 * the layout, `x-skills-license` the licence carried. What a mapping does not claim
 * rides verbatim in `x-skills-rest` (AGSC-02-05a). No `Assisted-by` trailer is read
 * or written: an import writes files, never commits.
 *
 * NOTHING EXECUTABLE IS IMPORTED (AGSC-07-15). A skill's `allowed-tools` key, its
 * `scripts/` files and every file with an executable extension, and a plugin's
 * hooks, MCP server definitions and scripts are DROPPED — reported per file with
 * `AGSC-E407` (warning) and listed on the item in `x-skills-dropped`. A skill's other
 * supporting files (`references/`, `assets/`, a README) are not items; they are
 * reported and listed too. A remote plugin source is never fetched.
 *
 * THE LICENCE CHECK. A skill's licence is read from its `license` key (an SPDX
 * identifier, or a sentence naming a bundled licence file, which is then read), else
 * from a licence file beside it, else from the plugin, else from the collection's
 * root licence file. A skill whose licence this adapter does not recognise as an
 * open licence — or that has none — is imported with `status: draft` and a warning:
 * AGSC-06-30 keeps a draft out of every published surface, so it is never published
 * until a person has read the terms and changed the status.
 *
 * EXPORT — our published packs (`agsc skills`, one per Cluster, AGSC-07-19; drafts
 * never, AGSC-06-30) in each foreign layout, content-only (no script, no symlink, no
 * `allowed-tools`, AGSC-07-15), each carrying the AGSC-06-15 provenance header with
 * the content version, plus one `<!-- agsc-item <base64 of the JCS record> -->` line
 * per item of the pack (the cluster and its members), so a return import rebuilds
 * them exactly — the same own-record line the `gabbe` adapter writes. On import a line
 * is trusted only when it names this node's `site.base` or a declared peer and its
 * versions agree with the file's provenance header (`interchange/own-record.js`);
 * a file with no trusted line is read as a foreign file, licence check
 * included, and each untrusted line is reported.
 *
 * PURE: no fs, no clock, no network — the verb reads the files and hands them in.
 * Requirements: AGSC-01-22, AGSC-01-23, AGSC-01-26a, AGSC-01-29, AGSC-06-30,
 * AGSC-07-15, AGSC-07-19; PRD-021, PRD-026, PRD-032…034.
 */

const slugs = require('../../knowledge/slug.js');
const frontmatterModule = require('../../knowledge/frontmatter.js');
const yaml = require('../../knowledge/yaml.js');
const fix = require('../../governance/fix.js');
const { canonicalize } = require('../../knowledge/jcs.js');
const { compareCodePoint, nfc, singleLine } = require('../../knowledge/unicode.js');
const { serialize, titleFor } = require('../../knowledge/adopt.js');
const { finding } = require('../../knowledge/validate.js');
const { neutraliseSingleLine } = require('../mapping.js');
const okf = require('../okf.js');
const ownRecord = require('../own-record.js');

/** The name this adapter answers to on `export --to` and `import --from`. */
const FORMAT = 'skills';

/** The closed set of layouts, in detection priority order. */
const LAYOUTS = Object.freeze(['marketplace', 'claude-plugin', 'agentskills', 'cursor', 'windsurf']);

/** `export --to skills` with no `--layout`. */
const DEFAULT_LAYOUT = 'agentskills';

/** Tells `export` to hand this adapter the packs `agsc skills` emits (same bytes). */
const NEEDS_SKILL_PACKS = true;

const SKILL_FILE = 'SKILL.md';
const PLUGIN_MANIFEST = '.claude-plugin/plugin.json';
const MARKETPLACE_MANIFEST = '.claude-plugin/marketplace.json';
const CURSOR_DIR = '.cursor/rules';
const WINDSURF_DIRS = Object.freeze(['.devin/rules', '.windsurf/rules']);

/** "Limited to 12,000 characters per file" (Windsurf workspace rules). */
const WINDSURF_LIMIT = 12000;

/** The `when` bound (AGSC-02-15) and the concept `description` bounds (AGSC-02-24). */
const WHEN_LIMIT = 1024;
const DESCRIPTION_MIN = 40;
const DESCRIPTION_MAX = 200;

/** The own-record line. Anchored at a line start, so it cannot hide inside a line. */
const MARKER = /^<!-- agsc-item ([A-Za-z0-9+/]+={0,2}) -->$/gmu;

/** A licence file, by name. */
const LICENSE_NAME = /^(?:LICEN[CS]E|COPYING)(?:[.-][A-Za-z0-9]+)?$/u;

/** Files a skill directory may carry that are executable content (AGSC-07-15). */
const EXECUTABLE_EXT = /\.(?:bash|bat|cjs|cmd|exe|js|mjs|php|pl|ps1|py|rb|sh|ts|zsh)$/iu;

/** Plugin components that are executable or configure execution (AGSC-07-15). */
const PLUGIN_EXECUTABLE = Object.freeze(['.lsp.json', '.mcp.json', 'bin/', 'hooks/', 'scripts/']);

/** Plugin components that are not a skill directory and are not mapped. */
const PLUGIN_UNMAPPED = Object.freeze(['agents/', 'commands/', 'output-styles/']);

/**
 * The licences this adapter recognises as open (SPDX identifiers; a `-only` or
 * `-or-later` suffix is accepted). A recognised licence is carried, never judged
 * against the node's own licence — the import says so once.
 */
const OPEN_LICENSES = Object.freeze(['0BSD', 'AGPL-3.0', 'Apache-2.0', 'Artistic-2.0', 'BSD-2-Clause',
  'BSD-3-Clause', 'BSL-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'CC0-1.0', 'EPL-2.0', 'GPL-2.0', 'GPL-3.0',
  'ISC', 'LGPL-2.1', 'LGPL-3.0', 'MIT', 'MIT-0', 'MPL-2.0', 'Unlicense', 'Zlib']);

/** Common spellings that are not SPDX identifiers but name one unambiguously. */
const LICENSE_ALIASES = Object.freeze({
  'apache 2.0': 'Apache-2.0', 'apache license 2.0': 'Apache-2.0', 'apache license, version 2.0': 'Apache-2.0',
  'apache2': 'Apache-2.0', 'cc0': 'CC0-1.0', 'mit license': 'MIT', 'the unlicense': 'Unlicense',
});

/** The first lines of the recognised licence texts, for a licence FILE. */
const LICENSE_TEXTS = Object.freeze([
  [/Apache License[\s\S]{0,80}Version 2\.0/u, 'Apache-2.0'],
  [/GNU AFFERO GENERAL PUBLIC LICENSE/u, 'AGPL-3.0'],
  [/GNU LESSER GENERAL PUBLIC LICENSE[\s\S]{0,80}Version 3/u, 'LGPL-3.0'],
  [/GNU GENERAL PUBLIC LICENSE[\s\S]{0,80}Version 3/u, 'GPL-3.0'],
  [/GNU GENERAL PUBLIC LICENSE[\s\S]{0,80}Version 2/u, 'GPL-2.0'],
  [/Mozilla Public License,? [Vv]ersion 2\.0/u, 'MPL-2.0'],
  [/CC0 1\.0 Universal/u, 'CC0-1.0'],
  [/Attribution-ShareAlike 4\.0 International/u, 'CC-BY-SA-4.0'],
  [/Attribution 4\.0 International/u, 'CC-BY-4.0'],
  [/This is free and unencumbered software released into the public domain/u, 'Unlicense'],
  [/\bISC License\b/u, 'ISC'],
  [/\bMIT License\b|Permission is hereby granted, free of charge/u, 'MIT'],
  [/Redistribution and use in source and binary forms[\s\S]*Neither the name/u, 'BSD-3-Clause'],
  [/Redistribution and use in source and binary forms/u, 'BSD-2-Clause'],
]);

/** Words that state a licence is not open, whatever else its sentence names. */
const RESTRICTIVE = /\b(?:all rights reserved|proprietary|source-available|confidential)\b/iu;

/** The content-version grammar of AGSC-04-25, which `prov.source_version` carries. */
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/u;

/** The keys this adapter claims (AGSC-01-26a), for the implementer documentation. */
const CLAIMED_KEYS = Object.freeze({
  export: 'every authored frontmatter key and the body of every published item of every pack (in the agsc-item lines)',
  import: Object.freeze({
    marketplace: Object.freeze(['plugins[].source (relative only)', 'plugins[].skills', 'plugins[].version',
      'plugins[].license', 'metadata.version']),
    plugin: Object.freeze(['name', 'version', 'license', 'skills']),
    rule: Object.freeze(['description', 'globs', 'alwaysApply', 'trigger', 'body']),
    skill: Object.freeze(['name', 'description', 'license', 'metadata.version', 'body']),
  }),
});

// ------------------------------------------------------------------- shared helpers

/** A plain object with no prototype, so a foreign `__proto__` member is only data. */
function plain(value) {
  const out = Object.create(null);
  if (isObject(value)) for (const key of Object.keys(value)) out[key] = value[key];
  return out;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** A single-line string, whitespace collapsed, or `null` when empty. */
function oneLine(value) {
  if (typeof value !== 'string') return null;
  const text = nfc(value).replace(/\s+/gu, ' ').trim();
  return text === '' ? null : text;
}

function clip(text, max) {
  const points = [...text];
  return points.length > max ? points.slice(0, max).join('') : text;
}

function dirname(path) {
  const at = String(path).lastIndexOf('/');
  return at === -1 ? '' : String(path).slice(0, at);
}

function basename(path) {
  return String(path).split('/').pop();
}

/** `./skills/x/` → `skills/x`; `./` → ``. Never leaves the clone: `..` is refused. */
function relativeDir(value) {
  const text = String(value).split('\\').join('/').replace(/^(?:\.\/)+|^\.$/u, '').replace(/\/+$/u, '');
  if (text.split('/').some((part) => part === '..') || text.startsWith('/')) return null;
  return text;
}

function under(dir, path) {
  return dir === '' ? true : String(path).startsWith(`${dir}/`);
}

/** The own-record payload of one item, as the base64 of its JCS bytes. */
function encodeRecord(record) {
  return Buffer.from(canonicalize(record), 'utf8').toString('base64');
}

/** The payload of one `agsc-item` line, or `null` when it is not ours. */
function decodeRecord(b64) {
  let value;
  try {
    value = JSON.parse(Buffer.from(String(b64), 'base64').toString('utf8'));
  } catch (e) {
    return null;
  }
  if (!isObject(value) || !isObject(value.frontmatter) || typeof value.body !== 'string'
    || typeof value.slug !== 'string' || typeof value.type !== 'string') return null;
  return value;
}

/** A YAML double-quoted scalar: JSON's string form is one (YAML 1.2 §7.3.1). */
function yamlString(value) {
  return JSON.stringify(singleLine(nfc(String(value))));
}

/** The lint-normalized bytes of one item (AGSC-04-19), as every import lane writes them. */
function itemText(frontmatter, body, itemSchema) {
  const type = String(frontmatter.type);
  const ordered = fix.orderKeys(frontmatter, fix.declaredOrder(itemSchema, type), itemSchema, type, null);
  return fix.normaliseText(`${serialize(fix.quoteTemporal(ordered))}${nfc(body)}`);
}

// ------------------------------------------------------------------- frontmatter

/**
 * The top-level `key: value` lines of a frontmatter block, for a block the failsafe
 * subset of AGSC-02-02 refuses (a Cursor rule's unquoted `globs: *.ts` is a YAML
 * alias to a strict parser). Nested values are not read.
 */
function flatFrontmatter(yamlText) {
  const out = Object.create(null);
  for (const line of String(yamlText).split('\n')) {
    const m = /^([A-Za-z][A-Za-z0-9_-]*):[ \t]*(.*)$/u.exec(line);
    if (m === null) continue;
    let value = m[2].trim();
    if (/^".*"$/u.test(value)) {
      try {
        value = JSON.parse(value);
      } catch (e) {
        value = value.slice(1, -1);
      }
    } else if (/^'.*'$/u.test(value)) value = value.slice(1, -1).replace(/''/gu, '\'');
    out[m[1]] = String(value);
  }
  return out;
}

/**
 * One foreign Markdown file's frontmatter and body.
 *
 * @returns {{body:string, fm:(object|null), lenient:boolean}}
 */
function readFrontmatter(text, path) {
  const split = frontmatterModule.split(String(text), { file: path });
  if (!split.hasFrontmatter) return { body: String(text), fm: null, lenient: false };
  try {
    const fm = yaml.parse(split.yamlText);
    if (isObject(fm)) return { body: split.body, fm: plain(fm), lenient: false };
  } catch (e) {
    // Fall through to the line reader: a foreign tool's YAML need not be ours.
  }
  return { body: split.body, fm: flatFrontmatter(split.yamlText), lenient: true };
}

// ------------------------------------------------------------------- licences

/** An SPDX identifier (or a known alias) → the recognised id, or `null`. */
function licenceId(value) {
  const text = oneLine(value);
  if (text === null) return null;
  const alias = LICENSE_ALIASES[text.toLowerCase()];
  if (alias !== undefined) return alias;
  const bare = text.replace(/-(?:only|or-later)$/u, '').replace(/\+$/u, '');
  return OPEN_LICENSES.find((id) => id.toLowerCase() === bare.toLowerCase()) || null;
}

/** A licence file's text → the recognised id, or `null`. Only its opening is read. */
function licenceFromText(text) {
  const head = String(text).slice(0, 4000);
  for (const [pattern, id] of LICENSE_TEXTS) if (pattern.test(head)) return id;
  return null;
}

/** The licence files directly inside `dir`, in code-point order. */
function licenceFiles(dir, paths) {
  return paths.filter((p) => dirname(p) === dir && LICENSE_NAME.test(basename(p))).sort(compareCodePoint);
}

/**
 * The licence of one skill or rule, and where it was read.
 *
 * @param {object} fm the foreign frontmatter.
 * @param {string} dir the skill's directory (a rule: its rules directory).
 * @param {{files:object, paths:string[]}} input
 * @param {{declared?:string, from:string}|null} fallback the plugin's own licence.
 * @returns {{declared:(string|null), from:(string|null), id:(string|null)}}
 */
function licenceOf(fm, dir, input, fallback) {
  const fromFile = (path) => ({ id: licenceFromText(input.files[path] === undefined ? '' : input.files[path]), path });
  const declared = oneLine(fm && fm.license);
  if (declared !== null) {
    const id = licenceId(declared);
    if (id !== null) return { declared, from: 'license key', id };
    // "Complete terms in LICENSE.txt": the sentence names a bundled file.
    const named = licenceFiles(dir, input.paths).find((p) => declared.includes(basename(p)));
    if (named !== undefined) {
      // A sentence that says the terms are restrictive is believed over any licence
      // name its file happens to quote (a proprietary licence may cite an open one).
      const restrictive = RESTRICTIVE.test(declared);
      return { declared, from: named, id: restrictive ? null : fromFile(named).id };
    }
    return { declared, from: 'license key', id: null };
  }
  for (const path of licenceFiles(dir, input.paths)) {
    const read = fromFile(path);
    if (read.id !== null) return { declared: basename(path), from: path, id: read.id };
  }
  if (fallback !== null && fallback !== undefined && fallback.declared !== undefined) {
    return { declared: fallback.declared, from: fallback.from, id: licenceId(fallback.declared) };
  }
  for (const path of licenceFiles('', input.paths)) {
    const read = fromFile(path);
    if (read.id !== null) return { declared: basename(path), from: path, id: read.id };
  }
  return { declared: null, from: null, id: null };
}

// ------------------------------------------------------------------- the sources

/** The JSON document at `path`, or `null` (and a finding) when it is not one. */
function readJson(input, path, findings) {
  if (input.files[path] === undefined) return null;
  try {
    const value = JSON.parse(String(input.files[path]));
    if (isObject(value)) return plain(value);
  } catch (e) {
    // reported below
  }
  findings.push(finding('AGSC-E901', `${path} is not a JSON object; the manifest was not read (AGSC-01-22)`,
    { file: path, line: 1, severity: 'warn' }));
  return null;
}

/** Every `SKILL.md` directly inside a child of `dir` (`<dir>/<name>/SKILL.md`). */
function skillsIn(dir, paths) {
  return paths.filter((p) => basename(p) === SKILL_FILE && dirname(dirname(p)) === dir);
}

/** A skill directory named by a manifest: the directory itself, or its children. */
function skillsAt(dir, paths) {
  const direct = dir === '' ? SKILL_FILE : `${dir}/${SKILL_FILE}`;
  return paths.includes(direct) ? [direct] : skillsIn(dir, paths);
}

/** A manifest's `skills` member (string or array) as a list of directories. */
function manifestDirs(value) {
  const list = Array.isArray(value) ? value : (typeof value === 'string' ? [value] : []);
  return list.filter((v) => typeof v === 'string').map(relativeDir).filter((v) => v !== null);
}

/** The plugin's executable and unmapped components, reported per file. */
function pluginComponents(root, paths, findings) {
  for (const path of paths) {
    if (!under(root, path)) continue;
    const rel = root === '' ? path : path.slice(root.length + 1);
    if (PLUGIN_EXECUTABLE.some((c) => (c.endsWith('/') ? rel.startsWith(c) : rel === c))) {
      findings.push(finding('AGSC-E407', `${path}: plugin ${rel.includes('/') ? `${rel.split('/')[0]}/` : rel}`
        + ' is executable content or configures execution; dropped, never imported (AGSC-07-15)',
      { file: path, line: 1, severity: 'warn' }));
    } else if (PLUGIN_UNMAPPED.some((c) => rel.startsWith(c))) {
      findings.push(finding('AGSC-E506', `${path}: a plugin ${rel.split('/')[0]}/ file is not a skill directory`
        + ' and was not imported', { file: path, line: 1, severity: 'warn' }));
    }
  }
}

/**
 * What one layout reads: `[{kind, path, version?, licence?}]`, plus what it reports.
 *
 * @param {string} layout
 * @param {{files:object, paths:string[]}} input
 * @returns {{entries:Array<object>, findings:Array<object>}}
 */
function sources(layout, input) {
  const { paths } = input;
  const findings = [];
  const entries = [];
  const seen = new Set();
  const add = (entry) => {
    if (seen.has(entry.path)) return;
    seen.add(entry.path);
    entries.push(entry);
  };
  if (layout === 'agentskills') {
    for (const path of paths.filter((p) => basename(p) === SKILL_FILE)) add({ kind: 'skill', path });
  } else if (layout === 'claude-plugin') {
    const manifest = readJson(input, PLUGIN_MANIFEST, findings) || Object.create(null);
    const licence = typeof manifest.license === 'string' ? { declared: manifest.license, from: PLUGIN_MANIFEST } : null;
    const version = typeof manifest.version === 'string' ? manifest.version : undefined;
    for (const dir of ['skills', ...manifestDirs(manifest.skills)]) {
      for (const path of skillsAt(dir, paths)) add({ kind: 'skill', licence, path, version });
    }
    pluginComponents('', paths, findings);
  } else if (layout === 'marketplace') {
    const market = readJson(input, MARKETPLACE_MANIFEST, findings) || Object.create(null);
    const marketVersion = isObject(market.metadata) && typeof market.metadata.version === 'string'
      ? market.metadata.version : undefined;
    const plugins = Array.isArray(market.plugins) ? market.plugins.filter(isObject) : [];
    for (const plugin of plugins) {
      const name = typeof plugin.name === 'string' ? plugin.name : '(unnamed)';
      const root = typeof plugin.source === 'string' ? relativeDir(plugin.source) : null;
      if (root === null) {
        findings.push(finding('AGSC-E506', `${MARKETPLACE_MANIFEST}: plugin "${name}" has a source outside this`
          + ' clone; it is never fetched — clone that repository and import it', {
          file: MARKETPLACE_MANIFEST, line: 1, severity: 'warn' }));
        continue;
      }
      const manifestPath = root === '' ? PLUGIN_MANIFEST : `${root}/${PLUGIN_MANIFEST}`;
      const manifest = readJson(input, manifestPath, findings) || Object.create(null);
      const version = [plugin.version, manifest.version, marketVersion].find((v) => typeof v === 'string');
      const declared = [plugin.license, manifest.license].find((v) => typeof v === 'string');
      const licence = declared === undefined ? null
        : { declared, from: plugin.license === declared ? MARKETPLACE_MANIFEST : manifestPath };
      // A plugin's `skills` paths are relative to the PLUGIN's root (garden-skills
      // lists `"./"` under `"source": "./skills/<name>"`), as its own manifest's are.
      const join = (d) => [root, d].filter((part) => part !== '').join('/');
      const listed = manifestDirs(plugin.skills).map(join);
      const dirs = listed.length > 0 ? listed : ['skills', ...manifestDirs(manifest.skills)].map(join);
      for (const dir of dirs) for (const path of skillsAt(dir, paths)) add({ kind: 'skill', licence, path, version });
      if (root !== '') pluginComponents(root, paths, findings);
    }
    if (plugins.some((p) => typeof p.source === 'string' && relativeDir(p.source) === '')) pluginComponents('', paths, findings);
    for (const path of paths.filter((p) => basename(p) === SKILL_FILE && !seen.has(p))) {
      findings.push(finding('AGSC-E506', `${path}: no plugin of ${MARKETPLACE_MANIFEST} lists this skill, so the`
        + ' marketplace does not offer it; not imported (import it with --layout agentskills)', {
        file: path, line: 1, severity: 'warn' }));
    }
  } else if (layout === 'cursor') {
    for (const path of paths.filter((p) => under(CURSOR_DIR, p))) {
      if (path.endsWith('.mdc')) add({ kind: 'rule', path });
      else if (path.endsWith('.md')) {
        findings.push(finding('AGSC-E506', `${path}: Cursor ignores a plain .md file in ${CURSOR_DIR}`
          + ' ("it has no frontmatter to specify description, globs, and alwaysApply"); not imported', {
          file: path, line: 1, severity: 'warn' }));
      }
    }
  } else {
    for (const path of paths.filter((p) => WINDSURF_DIRS.some((d) => under(d, p)) && p.endsWith('.md'))) {
      add({ kind: 'rule', path });
    }
  }
  entries.sort((a, b) => compareCodePoint(a.path, b.path));
  // A plugin component inside a skill directory that is being read (garden-skills'
  // plugins ARE skill directories) is reported by the skill's own mapping, per file;
  // it is not reported twice.
  const skillDirs = entries.filter((e) => e.kind === 'skill').map((e) => dirname(e.path)).filter((d) => d !== '');
  return {
    entries,
    findings: findings.filter((f) => !(f.code === 'AGSC-E407' && skillDirs.some((d) => under(d, f.file)))),
  };
}

/** Which layouts a clone holds, in priority order (`LAYOUTS`). */
function detect(paths) {
  const list = (paths || []).map(String);
  const found = [];
  if (list.includes(MARKETPLACE_MANIFEST)) found.push('marketplace');
  if (list.includes(PLUGIN_MANIFEST)) found.push('claude-plugin');
  if (list.some((p) => basename(p) === SKILL_FILE)) found.push('agentskills');
  if (list.some((p) => under(CURSOR_DIR, p) && p.endsWith('.mdc'))) found.push('cursor');
  if (list.some((p) => WINDSURF_DIRS.some((d) => under(d, p)) && p.endsWith('.md'))) found.push('windsurf');
  return found;
}

/** Should the verb read this file's text? (Everything else is listed, never read.) */
function isRelevant(path) {
  const p = String(path);
  const name = basename(p);
  return name === SKILL_FILE || LICENSE_NAME.test(name) || p.endsWith(PLUGIN_MANIFEST)
    || p === MARKETPLACE_MANIFEST || p === 'README.md'
    || (under(CURSOR_DIR, p) && p.endsWith('.mdc'))
    || (WINDSURF_DIRS.some((d) => under(d, p)) && p.endsWith('.md'));
}

// ------------------------------------------------------------------- mapping

/**
 * The files of a skill directory that are not its `SKILL.md` or licence, excluding
 * any deeper skill directory's own files. Each is dropped and named.
 */
function supportingFiles(dir, paths) {
  const deeper = paths.filter((p) => basename(p) === SKILL_FILE && dirname(p) !== dir && under(dir, p)).map(dirname);
  return paths.filter((p) => under(dir, p) && p !== (dir === '' ? SKILL_FILE : `${dir}/${SKILL_FILE}`)
    && !(dirname(p) === dir && LICENSE_NAME.test(basename(p)))
    && !deeper.some((d) => under(d, p)));
}

/** The keys a mapping claims, per kind; everything else rides in `x-skills-rest`. */
const CLAIMED = Object.freeze({
  rule: Object.freeze(['alwaysApply', 'description', 'globs', 'license', 'trigger']),
  skill: Object.freeze(['allowed-tools', 'description', 'license', 'name']),
});

/**
 * One foreign skill or rule → a candidate item, or `{skip}`.
 *
 * @returns {object}
 */
function mapEntry(entry, input, layout, findings) {
  const { path } = entry;
  const read = readFrontmatter(input.files[path], path);
  if (read.fm === null) {
    return { skip: `${path}: not imported: it carries no frontmatter, so its ${entry.kind === 'skill'
      ? 'name and description' : 'description'} cannot be read (AGSC-01-22)` };
  }
  const { fm } = read;
  if (read.lenient) {
    findings.push(finding('AGSC-E506', `${path}: the frontmatter is not the failsafe YAML subset of AGSC-02-02;`
      + ' its top-level "key: value" lines were read and nested values were not', { file: path, line: 1, severity: 'warn' }));
  }
  const dir = dirname(path);
  const out = Object.create(null);
  const dropped = [];
  let stem;
  let type;
  if (entry.kind === 'skill') {
    const name = typeof fm.name === 'string' ? fm.name : basename(dir);
    const description = oneLine(fm.description);
    if (description === null) {
      return { skip: `${path}: not imported: the Agent Skills format requires a non-empty description, and`
        + ' the procedure\'s "when" is taken from it; nothing is invented' };
    }
    if (name !== basename(dir)) {
      findings.push(finding('AGSC-E506', `${path}: name "${singleLine(name)}" differs from its directory`
        + ` "${basename(dir)}", which the Agent Skills format requires; the name was used`, {
        file: path, line: 1, severity: 'warn' }));
    }
    out.when = clip(description, WHEN_LIMIT);
    if (out.when !== fm.description) out['x-skills-description'] = String(fm.description);
    out['x-skills-name'] = String(name);
    if (fm['allowed-tools'] !== undefined) {
      dropped.push('allowed-tools');
      findings.push(finding('AGSC-E407', `${path}: the "allowed-tools" key pre-approves tools and was dropped,`
        + ' never imported (AGSC-07-15)', { file: path, line: 1, severity: 'warn' }));
    }
    for (const file of supportingFiles(dir, input.paths)) {
      const rel = dir === '' ? file : file.slice(dir.length + 1);
      dropped.push(rel);
      const executable = rel.startsWith('scripts/') || rel.includes('/scripts/') || EXECUTABLE_EXT.test(rel);
      findings.push(executable
        ? finding('AGSC-E407', `${file}: executable content in a skill; dropped, never imported (AGSC-07-15)`,
          { file, line: 1, severity: 'warn' })
        : finding('AGSC-E506', `${file}: a supporting file of the skill; only ${SKILL_FILE} becomes an item,`
          + ' so it was not imported', { file, line: 1, severity: 'warn' }));
    }
    // A body that links to a file which was not imported keeps its link (the body is
    // the author's), and says so now rather than at the next lint (AGSC-03-11).
    for (const rel of dropped.filter((d) => d !== 'allowed-tools')) {
      if (read.body.includes(`](${rel})`) || read.body.includes(`](./${rel})`)) {
        findings.push(finding('AGSC-E506', `${path}: the body links to ${rel}, which was not imported; the link`
          + ' resolves to nothing in this Bundle (AGSC-03-11) until the body is edited', {
          file: path, line: 1, severity: 'warn' }));
      }
    }
    stem = name;
    type = 'procedure';
  } else {
    const description = oneLine(fm.description);
    if (description !== null && [...description].length >= DESCRIPTION_MIN
      && [...description].length <= DESCRIPTION_MAX && description === fm.description) {
      out.description = description;
    } else if (typeof fm.description === 'string' && fm.description !== '') {
      out['x-skills-description'] = String(fm.description);
    }
    out.kind = 'explainer';
    if (fm.globs !== undefined) out['x-skills-globs'] = Array.isArray(fm.globs) ? fm.globs.map(String) : String(fm.globs);
    if (fm.alwaysApply !== undefined) out['x-skills-always-apply'] = String(fm.alwaysApply);
    if (fm.trigger !== undefined) out['x-skills-trigger'] = String(fm.trigger);
    stem = basename(path).replace(/\.(?:mdc|md)$/u, '');
    type = 'concept';
  }
  const rest = {};
  for (const key of Object.keys(fm).sort(compareCodePoint)) {
    if (!CLAIMED[entry.kind].includes(key)) rest[key] = fm[key];
  }
  if (Object.keys(rest).length > 0) out['x-skills-rest'] = canonicalize(rest);
  if (dropped.length > 0) out['x-skills-dropped'] = [...new Set(dropped)].sort(compareCodePoint);
  const metadataVersion = isObject(fm.metadata) && typeof fm.metadata.version === 'string'
    ? fm.metadata.version : undefined;
  return {
    body: read.body,
    fm: out,
    licence: licenceOf(fm, dir, input, entry.licence || null),
    stem,
    type,
    version: entry.version === undefined ? metadataVersion : entry.version,
  };
}

// ------------------------------------------------------------------- import

/**
 * The import plan: what would be written, in code-point path order.
 *
 * @param {{files:object, paths:string[]}} input `files`: clone-relative path →
 *   text, for every file `isRelevant` names; `paths`: every file of the clone.
 * @param {object} options
 * @param {string} options.layout one of `LAYOUTS`.
 * @param {string} options.operator `bundle.operator` of the TARGET Bundle (AGSC-08-01).
 * @param {object} options.itemSchema the raw `schema/item.schema.json`.
 * @param {string} options.toolSpecVersion this engine's `spec_version`.
 * @param {boolean} [options.allowNewer] the adapter's `--allow-newer` (AGSC-01-22).
 * @param {string} [options.sourceVersion] the adapter's `--source-version`.
 * @returns {{entries:Array<object>, findings:Array<object>, refused:boolean,
 *   totals:object, writes:Array<{path:string, text:string}>}}
 */
function plan(input, options) {
  const opts = options || {};
  const files = plain(input && input.files);
  const paths = ((input && input.paths) || Object.keys(files)).map(String).sort(compareCodePoint);
  const source = { files, paths };
  const totals = { draft_unlicensed: 0, foreign_skipped: 0, items: 0, own: 0, records_rejected: 0, records_untrusted: 0 };
  const findings = [];
  const taken = new Set();
  const items = [];
  const entries = [];

  // Pass 1: our own records, so their slugs are kept exactly (AGSC-01-23). A pack
  // member that belongs to two clusters is carried by two packs; the identical
  // second copy is the same item and is not written twice.
  // A line is trusted only from this node or a declared peer, with consistent
  // versions; a file with no trusted line is read as a foreign file, with
  // every own-record line taken out, so the licence rule applies to it.
  const own = [];
  const ownFiles = new Set();
  const ownSeen = new Map();
  const origins = ownRecord.trustedOrigins(opts);
  const marked = new Set();
  for (const path of Object.keys(files).sort(compareCodePoint)) {
    const text = String(files[path]);
    const header = ownRecord.headerOf(text);
    MARKER.lastIndex = 0;
    for (let m = MARKER.exec(text); m !== null; m = MARKER.exec(text)) {
      const record = decodeRecord(m[1]);
      const line = text.slice(0, m.index).split('\n').length;
      marked.add(path);
      if (record === null || okf.TYPE_PLURAL[record.type] === undefined || !slugs.isValid(record.slug)) {
        totals.records_rejected += 1;
        findings.push(finding('AGSC-E201', `${path}:${line}: an agsc-item line does not decode to an item;`
          + ' skipped', { file: path, line, severity: 'warn' }));
        continue;
      }
      const why = ownRecord.distrust(record, origins, header);
      if (why !== null) {
        totals.records_untrusted += 1;
        findings.push(finding('AGSC-E506', `${path}:${line}: the agsc-item line is not trusted: ${why}. Its`
          + ' provenance and status were ignored and the file is read as a foreign file',
        { file: path, line, severity: 'warn' }));
        continue;
      }
      ownFiles.add(path);
      const bytes = canonicalize(record);
      if (ownSeen.get(record.slug) === bytes) continue;
      ownSeen.set(record.slug, bytes);
      own.push({ line, path, record });
    }
  }
  for (const path of marked) if (!ownFiles.has(path)) files[path] = ownRecord.stripLines(files[path]);
  for (const entry of own) {
    const declared = entry.record.spec_version;
    const tooNew = okf.versionRefusal(declared == null ? null : String(declared), {
      allowNewer: opts.allowNewer === true, toolSpecVersion: opts.toolSpecVersion,
    });
    if (tooNew !== null) {
      return { entries, findings: [{ ...tooNew, file: entry.path, line: entry.line }], refused: true, totals, writes: [] };
    }
  }
  for (const entry of own) {
    const { record } = entry;
    const slug = slugs.dedupe(record.slug, taken);
    taken.add(slug);
    const fm = plain(record.frontmatter);
    fm.type = record.type;
    const prov = plain(fm.prov);
    delete prov.source_version;
    delete prov.source_hash;
    if (typeof record.bundle_version === 'string' && VERSION.test(record.bundle_version)) {
      prov.source_version = record.bundle_version;
    }
    fm.prov = { ...prov };
    items.push({ body: record.body, fm, slug, type: record.type });
    totals.own += 1;
  }

  // Pass 2: the foreign skills or rules of the chosen layout.
  const listed = sources(opts.layout, source);
  findings.push(...listed.findings);
  const licences = new Map();
  for (const entry of listed.entries) {
    if (ownFiles.has(entry.path) || files[entry.path] === undefined) continue;
    const candidate = mapEntry(entry, source, opts.layout, findings);
    if (candidate.skip !== undefined) {
      totals.foreign_skipped += 1;
      findings.push(finding('AGSC-E506', candidate.skip, { file: entry.path, line: 1, severity: 'warn' }));
      continue;
    }
    const stem = oneLine(candidate.stem) || entry.path;
    const slug = slugs.dedupe(slugs.isValid(stem) ? stem : slugs.slugify(stem), taken);
    taken.add(slug);
    const derived = titleFor(candidate.body, clip(stem, 120), slug);
    findings.push(...derived.findings.map((one) => ({ ...one, file: entry.path, line: 1 })));
    const fm = Object.create(null);
    fm.type = candidate.type;
    fm.title = derived.title;
    const { licence } = candidate;
    const draft = licence.id === null;
    if (draft) fm.status = 'draft';
    const prov = { operator: String(opts.operator === undefined ? 'human:unknown' : opts.operator), origin: 'imported' };
    const version = typeof opts.sourceVersion === 'string' ? opts.sourceVersion : candidate.version;
    if (typeof version === 'string' && VERSION.test(version)) prov.source_version = version;
    else if (version !== undefined) {
      findings.push(finding('AGSC-E506', `${entry.path}: the stated version ${JSON.stringify(String(version))} is not`
        + ' a content version (AGSC-04-25), so prov.source_version was omitted', { file: entry.path, line: 1, severity: 'warn' }));
    }
    fm.prov = prov;
    for (const [key, value] of Object.entries(candidate.fm)) fm[key] = value;
    fm['x-skills-layout'] = opts.layout;
    fm['x-skills-source'] = entry.path;
    if (licence.declared !== null) {
      fm['x-skills-license'] = licence.id === null ? licence.declared : `${licence.id} (${licence.from})`;
    }
    if (draft) {
      totals.draft_unlicensed += 1;
      findings.push(finding('AGSC-E506', licence.declared === null
        ? `${entry.path}: no licence was found (not in the frontmatter, beside the file, in the plugin or at the`
          + ' collection root); imported as status: draft, so it is never published (AGSC-06-30) until a person'
          + ' has the right to publish it and changes the status'
        : `${entry.path}: the licence ${JSON.stringify(singleLine(licence.declared))} is not an open licence this adapter`
          + ' recognises; imported as status: draft, so it is never published (AGSC-06-30) until a person has read'
          + ' the terms and changes the status', { file: entry.path, line: 1, severity: 'warn' }));
    } else {
      licences.set(licence.id, (licences.get(licence.id) || 0) + 1);
    }
    const clean = neutraliseSingleLine(fm);
    items.push({ body: nfc(String(candidate.body)), fm: plain(clean.frontmatter), foreign: true, slug, type: candidate.type });
    entries.push({
      draft,
      dropped: Array.isArray(candidate.fm['x-skills-dropped']) ? candidate.fm['x-skills-dropped'].length : 0,
      kind: entry.kind,
      layout: opts.layout,
      licence: licence.id === null ? (licence.declared === null ? 'none' : `unrecognised: ${singleLine(licence.declared)}`)
        : `${licence.id} (${licence.from})`,
      name: slug,
      path: entry.path,
      version: typeof prov.source_version === 'string' ? prov.source_version : null,
    });
  }

  const writes = items.map((item) => ({
    path: `content/${okf.TYPE_PLURAL[item.type]}/${item.slug}.md`,
    text: itemText(item.fm, item.body, opts.itemSchema),
  }));
  totals.items = writes.length;
  const foreign = items.filter((item) => item.foreign).length;
  if (foreign > 0) {
    findings.push(finding('AGSC-E506',
      `${foreign} ${opts.layout} record(s) were imported with { origin: imported, operator: ${String(opts.operator)} }`
      + ' synthesized, because AGSC-08-01 requires prov', { file: '', severity: 'warn' }));
  }
  if (licences.size > 0) {
    const list = [...licences.keys()].sort(compareCodePoint).map((id) => `${id} ×${licences.get(id)}`).join(', ');
    findings.push(finding('AGSC-E506', `imported under their own licences (${list}), each kept in x-skills-license;`
      + ' check they agree with this node\'s bundle.license_prose before publishing', { file: '', severity: 'warn' }));
  }
  writes.sort((a, b) => compareCodePoint(a.path, b.path));
  return { entries, findings, refused: false, totals, writes };
}

/** The entries of a Markdown link list (an "awesome" catalogue): `- [x](https://…)`. */
function linkEntries(text) {
  return String(text || '').split('\n')
    .filter((line) => /^\s*[-*]\s+\**\[[^\]]+\]\(https?:\/\/[^)\s]+\)/u.test(line)).length;
}

/**
 * The catalogue index of a local clone: what each layout found would import, and
 * what a link list points to. Reads nothing new and writes nothing; no fetching.
 *
 * @param {{files:object, paths:string[]}} input
 * @param {object} options as `plan()`'s, without `layout`.
 * @returns {{entries:Array<object>, layouts:string[], links:number, lines:string[]}}
 */
function catalogue(input, options) {
  const paths = ((input && input.paths) || []).map(String);
  const layouts = detect(paths);
  const entries = [];
  for (const layout of layouts) entries.push(...plan(input, { ...options, layout }).entries);
  const links = linkEntries(plain(input && input.files)['README.md']);
  const lines = [`skills: layouts found: ${layouts.length === 0 ? 'none' : layouts.join(', ')}`];
  for (const e of entries) {
    lines.push(`skills: [${e.layout}] ${e.kind} ${e.name} ${e.path} licence ${e.licence}`
      + `${e.version === null ? '' : ` version ${e.version}`}${e.dropped > 0 ? ` dropped ${e.dropped}` : ''}`
      + ` -> ${e.draft ? 'draft (never published until its licence is settled)' : 'importable'}`);
  }
  if (links > 0) {
    lines.push(`skills: README.md is a link list: ${links} entr${links === 1 ? 'y points' : 'ies point'} to other`
      + ' repositories; nothing is fetched — clone the one you want and import that clone');
  }
  return { entries, layouts, links, lines };
}

// ------------------------------------------------------------------- export

/** The body of a pack's `SKILL.md`, after its frontmatter block. */
function packBody(text) {
  const source = String(text);
  const end = source.indexOf('\n---\n', 3);
  return end === -1 ? source : source.slice(end + 5);
}

/** The pack's own `license:` line value (AGSC-07-20). */
function packLicence(text) {
  const m = /^license: (.*)$/mu.exec(String(text));
  return m === null ? '' : m[1];
}

/**
 * `export --to skills --layout <layout>`: our published packs in one foreign layout,
 * under `dist/export/skills/<layout>/`.
 *
 * @param {object} bundle the loaded Bundle.
 * @param {{instant:string, sha256:(text:string)=>string, specVersion:string,
 *   bundleVersion?:string, flags?:object, skillPacks?:object}} options
 * @returns {{files:Array<{path:string, text:string, sha256:string}>, findings:Array<object>}}
 */
function run(bundle, options) {
  const opts = options || {};
  const flags = opts.flags || {};
  const layout = flags.layout === undefined ? DEFAULT_LAYOUT : String(flags.layout);
  if (!LAYOUTS.includes(layout)) {
    return {
      files: [],
      findings: [finding('AGSC-E003', `--layout ${JSON.stringify(layout)} is not a layout of the skills adapter;`
        + ` the set is ${LAYOUTS.join(', ')} (AGSC-01-26a)`, { file: '', line: 1 })],
    };
  }
  const produced = opts.skillPacks || { files: [], findings: [], index: { packs: [] } };
  const findings = [...(produced.findings || [])];
  if (findings.some((f) => f.severity === 'error')) return { files: [], findings };
  const config = (bundle && bundle.config) || {};
  const site = config.site || {};
  const base = `${String(site.base || '').replace(/\/+$/u, '')}/`;
  const bundleVersion = String(produced.index.bundle_version || opts.bundleVersion || '');
  const bySlug = new Map(((bundle && bundle.items) || []).filter((i) => i && i.frontmatter).map((i) => [String(i.slug), i]));
  const texts = new Map((produced.files || []).map((f) => [f.path, f.text]));
  const recordOf = (slug) => {
    const item = bySlug.get(slug);
    if (item === undefined) return null;
    return encodeRecord({
      body: String(item.body == null ? '' : item.body),
      bundle: base,
      bundle_version: bundleVersion,
      frontmatter: item.frontmatter,
      slug: String(item.slug),
      spec_version: String(opts.specVersion),
      type: String(item.type),
    });
  };

  const out = new Map();
  const packs = (produced.index.packs || []).slice().sort((a, b) => compareCodePoint(String(a.name), String(b.name)));
  for (const pack of packs) {
    const name = String(pack.name);
    const text = texts.get(`${name}/${SKILL_FILE}`);
    if (text === undefined) continue;
    const records = [name, ...(pack.members || []).map(String).sort(compareCodePoint)]
      .map(recordOf).filter((r) => r !== null).map((r) => `<!-- agsc-item ${r} -->`);
    const body = `${packBody(text).replace(/\n+$/u, '')}\n\n${records.join('\n')}\n`;
    const description = yamlString(pack.description);
    if (layout === 'cursor') {
      out.set(`${CURSOR_DIR}/${name}.mdc`, `---\ndescription: ${description}\nglobs:\nalwaysApply: false\n---\n${body}`);
    } else if (layout === 'windsurf') {
      const file = `---\ntrigger: model_decision\ndescription: ${description}\n---\n${body}`;
      if ([...file].length > WINDSURF_LIMIT) {
        findings.push(finding('AGSC-E506', `.windsurf/rules/${name}.md is ${[...file].length} characters, above the`
          + ` ${WINDSURF_LIMIT} a Windsurf workspace rule file is limited to; split the cluster or use another layout`,
        { file: `.windsurf/rules/${name}.md`, line: 1, severity: 'warn' }));
      }
      out.set(`.windsurf/rules/${name}.md`, file);
    } else {
      out.set(`skills/${name}/${SKILL_FILE}`, ['---', `name: ${name}`, `description: ${description}`,
        `license: ${yamlString(packLicence(text))}`, 'metadata:', `  agsc-bundle: ${yamlString(base)}`,
        `  agsc-bundle-version: ${yamlString(bundleVersion)}`, `  agsc-spec-version: ${yamlString(opts.specVersion)}`,
        '---', ''].join('\n') + body);
    }
  }
  const pluginName = slugs.slugify(String((config.bundle && config.bundle.id) || site.title || 'agsc'));
  const summary = `Skill packs of ${singleLine(site.title || base)}, generated from ${base} (content version`
    + ` ${bundleVersion}); the prose travels under ${singleLine(produced.index.license || '')}.`;
  const skillDirs = packs.map((p) => `./skills/${String(p.name)}`);
  if (layout === 'claude-plugin') {
    out.set(PLUGIN_MANIFEST, `${JSON.stringify({
      name: pluginName, version: bundleVersion, description: summary,
      license: String(produced.index.license || ''),
    }, null, 2)}\n`);
  } else if (layout === 'marketplace') {
    out.set(MARKETPLACE_MANIFEST, `${JSON.stringify({
      name: `${pluginName}-skills`,
      owner: { name: singleLine(site.title || pluginName) },
      metadata: { description: summary, version: bundleVersion },
      plugins: [{
        name: pluginName, source: './', description: summary, version: bundleVersion, strict: false, skills: skillDirs,
      }],
    }, null, 2)}\n`);
  }
  const paths = [...out.keys()].sort(compareCodePoint);
  return {
    files: paths.map((path) => ({ path: `${layout}/${path}`, sha256: opts.sha256(out.get(path)), text: out.get(path) })),
    findings,
  };
}

module.exports = {
  CLAIMED_KEYS, DEFAULT_LAYOUT, FORMAT, LAYOUTS, MARKETPLACE_MANIFEST, NEEDS_SKILL_PACKS, OPEN_LICENSES,
  PLUGIN_MANIFEST, SKILL_FILE, WINDSURF_LIMIT,
  catalogue, decodeRecord, detect, encodeRecord, flatFrontmatter, isRelevant, licenceFromText, licenceId,
  licenceOf, linkEntries, mapEntry, packBody, packLicence, plan, readFrontmatter, relativeDir, run, sources,
  supportingFiles,
};
