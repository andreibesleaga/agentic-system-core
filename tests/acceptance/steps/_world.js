'use strict';
// The world of one acceptance scenario: a scratch Bundle copied from
// `tests/acceptance/bundle/`, the REAL command line spawned without a shell, the
// real local MCP server reached through the official SDK client, a scratch git
// history when a scenario needs one, and the built node served read-only on
// loopback by the real `agsc-host serve` when a scenario checks it over HTTP.
//
// Deterministic: every child gets a fixed build instant (SOURCE_DATE_EPOCH, or
// fixed git author/committer dates), an empty git identity, NO_COLOR and a
// scratch HOME; nothing reaches the network; every scratch directory is removed
// when the scenario ends, and every server it started is stopped. A child run with
// `{ offline: true }` also carries the
// preload of `_offline.js`, which refuses and records every network attempt, so a
// scenario can prove that a lane made no network or model call at all.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const AGSC = path.join(ROOT, 'bin', 'agsc.js');
const HOST = path.join(ROOT, 'bin', 'agsc-host.js');
const FIXTURE = path.join(ROOT, 'tests', 'acceptance', 'bundle');
const OFFLINE = path.join(__dirname, '_offline.js');
const EPOCH = '1767225600';
const INSTANT = '2026-01-01T00:00:00Z';

class World {
  constructor() {
    this.temporaries = [];
    this.clients = [];
    this.servers = [];
    this.home = this.temp('agsc-acc-home-');
    fs.writeFileSync(path.join(this.home, '.gitconfig-empty'), '');
    this.dir = null;
    this.last = null;
    this.trap = path.join(this.home, 'network-attempts.txt');
    this.state = Object.create(null);
    // What the next commands add to, or remove from, their environment
    // (`_common.js`: the environment variable "X" is "v" / is unset).
    this.overrides = { env: Object.create(null), unset: [] };
  }

  /** A scratch directory under the system temporary directory, removed at the end. */
  temp(prefix) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    this.temporaries.push(dir);
    return dir;
  }

  /** The environment every child runs in: fixed, minimal, no identity, no network. */
  env(extra = {}) {
    return {
      GIT_AUTHOR_DATE: INSTANT,
      GIT_AUTHOR_EMAIL: 'operator@example.org',
      GIT_AUTHOR_NAME: 'Operator',
      GIT_COMMITTER_DATE: INSTANT,
      GIT_COMMITTER_EMAIL: 'operator@example.org',
      GIT_COMMITTER_NAME: 'Operator',
      GIT_CONFIG_GLOBAL: path.join(this.home, '.gitconfig-empty'),
      GIT_CONFIG_NOSYSTEM: '1',
      HOME: this.home,
      NO_COLOR: '1',
      PATH: process.env.PATH,
      SOURCE_DATE_EPOCH: EPOCH,
      ...(process.env.SYSTEMROOT ? { SYSTEMROOT: process.env.SYSTEMROOT } : {}),
      ...extra,
    };
  }

  /** The environment of a child that may not reach the network (see `_offline.js`). */
  offlineEnv(extra = {}) {
    return this.env({
      ACCEPTANCE_NETWORK_TRAP: this.trap,
      NODE_OPTIONS: `--require ${JSON.stringify(OFFLINE)}`,
      ...extra,
    });
  }

  /** Every network attempt the offline children recorded (none, when all is well). */
  networkAttempts() {
    return fs.existsSync(this.trap) ? fs.readFileSync(this.trap, 'utf8').split('\n').filter(Boolean) : [];
  }

  /** Copy the acceptance fixture Bundle into a scratch directory and make it current. */
  bundle() {
    this.dir = this.temp('agsc-acc-bundle-');
    fs.cpSync(FIXTURE, this.dir, { recursive: true });
    return this.dir;
  }

  /** Run `agsc <argv…>` in the current Bundle (or `cwd`), no shell; remembers the result. */
  agsc(argv, options = {}) {
    const extra = { ...this.overrides.env, ...(options.env || {}) };
    const env = options.offline ? this.offlineEnv(extra) : this.env(extra);
    for (const name of [...this.overrides.unset, ...(options.unset || [])]) delete env[name];
    const r = spawnSync(process.execPath, [AGSC, ...argv], {
      cwd: options.cwd || this.dir, encoding: 'utf8', env,
    });
    this.last = { argv, exit: r.status, stderr: r.stderr, stdout: r.stdout };
    return this.last;
  }

  /** Run a shipped tool under tools/. */
  tool(name, argv) {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', name), ...argv], {
      cwd: this.dir, encoding: 'utf8', env: this.env(),
    });
    this.last = { argv, exit: r.status, stderr: r.stderr, stdout: r.stdout };
    return this.last;
  }

  /** git in the current Bundle, with the fixed identity and dates of `env()`. */
  git(argv, extraEnv = {}) {
    const r = spawnSync('git', argv, { cwd: this.dir, encoding: 'utf8', env: this.env(extraEnv) });
    if (r.status !== 0) throw new Error(`git ${argv.join(' ')}: ${r.stderr}`);
    return r.stdout;
  }

  /** Turn the current Bundle into a git history of one commit on `main`. */
  commitAll(message, extraEnv = {}) {
    if (!fs.existsSync(path.join(this.dir, '.git'))) this.git(['init', '-q', '-b', 'main']);
    this.git(['add', '-A']);
    this.git(['commit', '-q', '-m', message], extraEnv);
  }

  /**
   * One more commit on the fixed dates, with the given trailers (`Key: value`
   * lines) after a blank line, as `git interpret-trailers` reads them. The
   * working tree is committed as it is; with nothing changed the commit is empty.
   * The first commit of a Bundle that has no history yet holds the whole tree.
   */
  commit(subject, trailers = [], extraEnv = {}) {
    if (!fs.existsSync(path.join(this.dir, '.git'))) this.git(['init', '-q', '-b', 'main']);
    this.git(['add', '-A']);
    const body = trailers.length ? ['-m', trailers.join('\n')] : [];
    this.git(['commit', '-q', '--allow-empty', '-m', subject, ...body], extraEnv);
  }

  /** The trailers of the last commit, one `Key: value` string each. */
  trailers() {
    return this.git(['log', '-1', '--format=%(trailers:only,unfold)']).split('\n').filter(Boolean);
  }

  /** The last command's standard output as the AGSC-09-11 envelope (or any JSON). */
  json() {
    if (!this.last) throw new Error('no command has run yet');
    try {
      return JSON.parse(this.last.stdout);
    } catch (e) {
      throw new Error(`the output is not JSON: ${this.last.stdout}${this.last.stderr}`, { cause: e });
    }
  }

  /**
   * Serve a directory of the Bundle read-only on loopback with the real `agsc-host
   * serve`, on a port the system picks. Resolves with the origin once the server
   * prints it; the server is stopped when the scenario ends.
   * @returns {Promise<{origin: string, port: number}>}
   */
  serve(rel = 'www') {
    const site = path.join(this.dir, rel);
    fs.mkdirSync(site, { recursive: true });
    const child = spawn(process.execPath, [HOST, 'serve', '--site', site, '--port', '0', '--bind', '127.0.0.1'], {
      cwd: this.dir, env: this.env(), stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.servers.push(child);
    return new Promise((resolve, reject) => {
      let out = '';
      const fail = (why) => reject(new Error(`agsc-host serve ${why}: ${out}`));
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => { out += chunk; });
      child.stdout.on('data', (chunk) => {
        out += chunk;
        const m = /at http:\/\/127\.0\.0\.1:(\d+)\//u.exec(out);
        if (m) resolve({ origin: `http://127.0.0.1:${m[1]}`, port: Number(m[1]) });
      });
      child.on('error', (e) => fail(`could not start (${e.message})`));
      child.on('exit', (code) => fail(`stopped with exit ${code}`));
    });
  }

  read(rel) {
    return fs.readFileSync(path.join(this.dir, rel), 'utf8');
  }

  write(rel, text) {
    fs.mkdirSync(path.dirname(path.join(this.dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(this.dir, rel), text);
  }

  exists(rel) {
    return fs.existsSync(path.join(this.dir, rel));
  }

  /** Every file under a directory of the Bundle, with its bytes, in code-point order. */
  snapshot(rel = '') {
    const out = new Map();
    const base = path.join(this.dir, rel);
    const walk = (sub) => {
      const entries = fs.readdirSync(path.join(base, sub), { withFileTypes: true })
        .map((e) => e.name).sort();
      for (const name of entries) {
        const next = sub === '' ? name : `${sub}/${name}`;
        if (name === '.git') continue;
        if (fs.statSync(path.join(base, next)).isDirectory()) walk(next);
        else out.set(next, fs.readFileSync(path.join(base, next)).toString('base64'));
      }
    };
    if (fs.existsSync(base)) walk('');
    return out;
  }

  /**
   * The real local MCP server through the SDK client: over the current Bundle, or
   * over `options.path` given as the verb's argument from `options.cwd`.
   */
  async mcp(options = {}) {
    const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
    const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
    const transport = new StdioClientTransport({
      args: [AGSC, 'mcp', ...(options.path ? [options.path] : [])],
      command: process.execPath,
      cwd: options.cwd || this.dir,
      env: options.offline ? this.offlineEnv() : this.env(),
    });
    const client = new Client({ name: 'acceptance', version: '1.0.0' }, { capabilities: {} });
    await client.connect(transport);
    this.clients.push(client);
    return client;
  }

  async close() {
    for (const client of this.clients) {
      try { await client.close(); } catch (e) { /* already closed */ }
    }
    for (const child of this.servers) {
      if (child.exitCode === null && child.signalCode === null) {
        const gone = new Promise((resolve) => child.once('exit', resolve));
        child.kill();
        await gone;
      }
    }
    for (const dir of this.temporaries) fs.rmSync(dir, { force: true, recursive: true });
  }
}

/** The discovery document of a build output, as parsed JSON. */
function linkset(world, out = 'www') {
  return JSON.parse(world.read(`${out}/.well-known/knowledge-linkset`));
}

/**
 * The Python checker package of persona P10, when this machine has it: its
 * checkout beside the engine (or the directory ACCEPTANCE_PYTHON_PACKAGE names —
 * read here only, never by the engine) and a Python 3.9+ interpreter (`python3`,
 * or `python` on Windows, or the PYTHON variable). Probed without the network.
 * @returns {{available: boolean, reason: string, python?: string, source?: string}}
 */
function pythonPackage() {
  const checkout = process.env.ACCEPTANCE_PYTHON_PACKAGE
    || path.resolve(ROOT, '..', 'agentic-system-core-python');
  const source = path.join(checkout, 'src');
  if (!fs.existsSync(path.join(source, 'agentic_system_core', 'cli.py'))) {
    return { available: false, reason: `no Python checker package at ${checkout}` };
  }
  const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const r = spawnSync(python, ['-c', 'import sys; print(sys.version_info >= (3, 9))'], { encoding: 'utf8' });
  if (r.status !== 0 || r.stdout.trim() !== 'True') {
    return { available: false, reason: `no Python 3.9 or newer as "${python}"` };
  }
  return { available: true, python, reason: '', source };
}

/** The frontmatter object and the body of an item file. */
function splitItem(text) {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/u.exec(text);
  if (!match) throw new Error('the file has no frontmatter block');
  return { body: match[2], frontmatter: require('yaml').parse(match[1]) };
}

/** Build the current Bundle; fail the step when the build does not pass. */
function built(world, options = {}) {
  const r = world.agsc(['build'], options);
  if (r.exit !== 0) throw new Error(`build failed: ${r.stdout}${r.stderr}`);
  return r;
}

module.exports = { AGSC, EPOCH, FIXTURE, HOST, INSTANT, ROOT, World, built, linkset, pythonPackage, splitItem };
