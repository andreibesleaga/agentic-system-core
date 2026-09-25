'use strict';
// tests/e2e/modes/_kit.js — the shared kit of the six-mode walk.
//
// Each mode file walks one mode the way a public user does: the real command line
// (`bin/agsc.js`, `bin/agsc-host.js`) spawned in a throwaway Bundle under the system
// temporary directory, a real git history with fixed dates and an empty identity,
// the official MCP SDK client over stdio, and the built node served on loopback.
// Deterministic: SOURCE_DATE_EPOCH is fixed, git dates are fixed, no network beyond
// 127.0.0.1, and everything written is removed when the process ends.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const AGSC = path.join(ROOT, 'bin', 'agsc.js');
const HOST = path.join(ROOT, 'bin', 'agsc-host.js');
/** 2026-09-14T10:00:00Z — the build instant of every walk. */
const EPOCH = '1789380000';
const INSTANT = '2026-09-14T10:00:00Z';

const temporaries = [];
process.on('exit', () => {
  for (const dir of temporaries) fs.rmSync(dir, { force: true, recursive: true });
});

/** A fresh directory under the system temporary directory, removed at exit. */
function scratch(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `agsc-modes-${prefix}-`));
  temporaries.push(dir);
  fs.writeFileSync(path.join(dir, '.gitconfig-empty'), '');
  return dir;
}

/** The environment of every child: fixed dates, empty git identity and configuration. */
function env(home, extra = {}) {
  return {
    GIT_AUTHOR_DATE: '2026-09-01T10:00:00Z',
    GIT_AUTHOR_EMAIL: 'operator@example.org',
    GIT_AUTHOR_NAME: 'Operator',
    GIT_COMMITTER_DATE: '2026-09-01T10:00:00Z',
    GIT_COMMITTER_EMAIL: 'operator@example.org',
    GIT_COMMITTER_NAME: 'Operator',
    GIT_CONFIG_GLOBAL: path.join(home, '.gitconfig-empty'),
    GIT_CONFIG_NOSYSTEM: '1',
    HOME: home,
    NO_COLOR: '1',
    PATH: process.env.PATH,
    ...(process.env.SYSTEMROOT ? { SYSTEMROOT: process.env.SYSTEMROOT } : {}),
    ...extra,
  };
}

/** Write one file, creating its directory. */
function write(dir, rel, text) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
}

/** Read one file as text. */
function read(dir, rel) {
  return fs.readFileSync(path.join(dir, rel), 'utf8');
}

/** One item file from a flat frontmatter object and a body (block lists supported). */
function item(fm, body) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fm)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const v of value) lines.push(`  - ${v}`);
    } else if (value !== null && typeof value === 'object') {
      lines.push(`${key}:`);
      for (const [k, v] of Object.entries(value)) lines.push(`  ${k}: ${v}`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push('---', '', body.replace(/\n*$/u, '\n'));
  return lines.join('\n');
}

/** Run git in a directory; the commit date may be moved per call. */
function git(dir, args, { date } = {}) {
  const extra = date === undefined ? {} : { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8', env: env(homeOf(dir), extra) });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
}

/** `git init` + a first commit of everything. */
function commitAll(dir, message, { date } = {}) {
  if (!fs.existsSync(path.join(dir, '.git'))) git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '--allow-empty', '-m', message], { date });
}

/** The scratch home a Bundle lives in (its parent holds the empty git config). */
function homeOf(dir) {
  let at = dir;
  while (at !== path.dirname(at)) {
    if (fs.existsSync(path.join(at, '.gitconfig-empty'))) return at;
    at = path.dirname(at);
  }
  return dir;
}

/**
 * Run the real command line in a directory with the fixed epoch. `pinned: false`
 * leaves SOURCE_DATE_EPOCH out, so the build instant comes from the last commit.
 */
function agsc(dir, args, { pinned = true, input, extraEnv = {} } = {}) {
  const r = spawnSync(process.execPath, [AGSC, ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: env(homeOf(dir), { ...(pinned ? { SOURCE_DATE_EPOCH: EPOCH } : {}), ...extraEnv }),
    input,
  });
  const json = args.includes('--json') && r.stdout.trim() !== '' ? safeJson(r.stdout) : null;
  return { code: r.status, envelope: json, stderr: r.stderr, stdout: r.stdout };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

/** The codes of a run's findings, from `--json` or from the plain lines. */
function codes(result) {
  if (result.envelope && Array.isArray(result.envelope.findings)) return result.envelope.findings.map((f) => f.code);
  return [...`${result.stdout}\n${result.stderr}`.matchAll(/AGSC-E\d{3}/gu)].map((m) => m[0]);
}

/** A Bundle with a configuration and nothing else; `site` members are merged in. */
function bundle(prefix, { base = 'https://proj.example/', id = prefix, site = {}, config = {} } = {}) {
  const home = scratch(prefix);
  const dir = path.join(home, 'bundle');
  fs.mkdirSync(dir);
  write(dir, 'agsc.config.json', `${JSON.stringify({
    build: { out: 'www/' },
    bundle: { id, operator: 'human:tester' },
    site: { base, title: id, ...site },
    spec_version: '1.0.0-rc.6',
    ...config,
  }, null, 2)}\n`);
  return dir;
}

const ACCEPTANCE = path.join(ROOT, 'tests', 'acceptance', 'bundle');

/**
 * The acceptance Bundle (five concepts, two clusters, a lesson) re-based on `base`,
 * plus a board: the cluster `login`, two tasks and the procedure that tests them.
 */
function projectBundle(prefix, { base = 'https://proj.example/', agents } = {}) {
  const home = scratch(prefix);
  const dir = path.join(home, 'bundle');
  fs.cpSync(ACCEPTANCE, dir, { recursive: true });
  for (const rel of ['agsc.config.json', 'content/index.md']) {
    write(dir, rel, read(dir, rel).split('https://agenticsystemcore.com/').join(base));
  }
  if (agents !== undefined) {
    const config = JSON.parse(read(dir, 'agsc.config.json'));
    config.agents = agents;
    write(dir, 'agsc.config.json', `${JSON.stringify(config, null, 2)}\n`);
  }
  write(dir, 'content/clusters/login.md', item({
    type: 'cluster', title: 'Login work',
    description: 'The tasks that build and test the login form, gathered on one board for people and agents.',
    date: '"2026-09-01"', prov: PROV,
  }, '# Login work\n\nThe login form and its tests.'));
  for (const [slug, title] of [['task-login-form', 'Build the login form'], ['task-login-tests', 'Test the login form']]) {
    write(dir, `content/concepts/${slug}.md`, item({
      type: 'concept', title,
      description: `${title}, one task on the login board, pulled by whoever claims it first.`,
      clusters: ['login'], date: '"2026-09-01"', prov: PROV, kind: 'task', task_state: 'TASK_STATE_SUBMITTED',
    }, `## Task\n\n${title}.`));
  }
  write(dir, 'content/procedures/run-the-tests.md', item({
    type: 'procedure', title: 'Run the tests',
    description: 'The steps that run the login tests and record what they found, so the task can be closed.',
    when: 'A login change is ready for review', clusters: ['login'], date: '"2026-09-01"', prov: PROV,
  }, '## When\n\nA login change is ready.\n\n## Steps\n\n1. Run the tests.\n\n## Checks\n\nEvery test passes.'));
  return dir;
}

/**
 * The official MCP SDK client over stdio against `agsc mcp` in a Bundle — the two
 * classes an assistant product uses. `call` answers the parsed AGSC-08-18 envelope.
 */
async function mcpClient(dir) {
  const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
  const transport = new StdioClientTransport({
    args: [AGSC, 'mcp'], command: process.execPath, cwd: dir,
    env: env(homeOf(dir), { SOURCE_DATE_EPOCH: EPOCH }), stderr: 'pipe',
  });
  const client = new Client({ name: 'modes-walk', version: '1.0.0' });
  await client.connect(transport);
  return {
    call: async (name, args) => {
      const r = await client.callTool({ arguments: args, name });
      return JSON.parse(r.content[0].text);
    },
    client,
    close: () => client.close(),
  };
}

/** Serve a build directory read-only on loopback (the `agsc-host serve` function). */
async function serve(site) {
  const hosting = require('../../../src/application/hosting.js');
  const running = await hosting.serve({ bind: '127.0.0.1', port: 0, site });
  const origin = `http://127.0.0.1:${running.server.address().port}`;
  const get = (route) => new Promise((resolve, reject) => {
    require('node:http').get(`${origin}${route}`, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ body: Buffer.concat(chunks), headers: res.headers, status: res.statusCode }));
    }).on('error', reject);
  });
  return { close: () => new Promise((resolve) => running.server.close(resolve)), get, origin };
}

/** Every file under a directory, as route → text (the fetch a page makes). */
function routes(dir) {
  const out = new Map();
  const walk = (at) => {
    for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
      const full = path.join(at, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.set(`/${path.relative(dir, full).split(path.sep).join('/')}`, fs.readFileSync(full, 'utf8'));
    }
  };
  walk(dir);
  return out;
}

/**
 * The page tools as a browser runs them: the three scripts an item page loads, run in
 * a fresh `node:vm` context whose `fetch` reads the built node's own files (no other
 * origin exists), `document.modelContext` absent. `call` answers the envelope.
 */
async function pageTools(www) {
  const vm = require('node:vm');
  const { PAGE_TOOL_SCRIPTS } = require('../../../src/distribution/compose-page.js');
  const files = routes(www);
  const fetched = [];
  const sandbox = {
    document: { getElementById: () => null },
    fetch: (route) => {
      fetched.push(String(route));
      const body = files.get(String(route));
      if (body === undefined) return Promise.resolve({ json: () => Promise.reject(new Error('404')), ok: false, text: () => Promise.resolve('') });
      return Promise.resolve({ json: () => Promise.resolve(JSON.parse(body)), ok: true, text: () => Promise.resolve(body) });
    },
    location: { origin: 'http://127.0.0.1:8205', search: '' },
    Promise,
    TextEncoder,
  };
  const context = vm.createContext(sandbox);
  for (const script of PAGE_TOOL_SCRIPTS) vm.runInContext(files.get(script), context, { filename: script });
  // A browser without `document.modelContext` reads the corpus on the first tool
  // call; the kit starts that read here, so that the routes the page read are
  // inspectable before the first call and every call after it is synchronous.
  await vm.runInContext('globalThis.AGSC_PAGE_TOOLS.start()', context);
  return {
    call: async (name, args) => JSON.parse(JSON.stringify(await sandbox.AGSC_TOOLS.call(name, args))),
    fetched,
  };
}

/** The standard provenance block of a hand-written item. */
const PROV = Object.freeze({ origin: 'human', operator: 'human:tester' });

module.exports = {
  AGSC, EPOCH, HOST, INSTANT, PROV, ROOT,
  agsc, bundle, codes, commitAll, env, git, item, mcpClient, pageTools, projectBundle, read, routes, scratch, serve, write,
};
