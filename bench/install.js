'use strict';
/**
 * bench/install.js — the `install` layer of bench/measure.js: what a consumer's
 * install of the packed tarball holds, and what three verbs cost to start from it.
 *
 * `npm pack` the repository, `npm install --omit=dev` the tarball into an empty folder,
 * count the package folders it holds (the package itself among them) and size each
 * one without the packages nested in it; then five timed runs
 * (GNU `time -v`: wall time and peak memory) of `node -e ""`, `agsc --version`,
 * `agsc lint` and `agsc build` on a copy of the reference fixture, and five of
 * loading each protocol package alone.
 *
 * The module trace is the proof that a verb loads no protocol package: one more run
 * of each verb preloads a file that registers a resolve hook (`module.registerHooks`,
 * which sees both `require` and `import`) and writes every file the process resolved
 * when it exits. `agsc mcp` with an empty input is traced too, as the control that
 * the trace sees the packages when a verb does load them.
 *
 * It spawns npm and real builds, so like measure.js it is outside the coverage set;
 * its two pure functions, `packageOf` and `protocolPackages`, are unit-tested.
 */

/* c8 ignore start — spawns npm and builds; see the header. */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const NODE = process.execPath;
const REPO = path.resolve(__dirname, '..');


const PROTOCOL = Object.freeze(['@a2a-js/sdk', '@hono/node-server', '@modelcontextprotocol/core', '@modelcontextprotocol/node',
  '@modelcontextprotocol/sdk', '@modelcontextprotocol/server', 'hono']);
const LOADED = Object.freeze(['@modelcontextprotocol/server', '@modelcontextprotocol/node', '@a2a-js/sdk']);
const COLD_RUNS = 5;

const TRACE = `'use strict';
const fs = require('node:fs');
const seen = new Set();
require('node:module').registerHooks({
  resolve(specifier, context, next) {
    const resolved = next(specifier, context);
    if (resolved.url && resolved.url.startsWith('file:')) seen.add(resolved.url);
    return resolved;
  },
});
process.on('exit', () => fs.writeFileSync(process.env.MEASURE_TRACE_OUT, JSON.stringify([...seen].sort())));
`;

/** The one entry of `npm pack --json`; the prepack script prints its own lines before npm's JSON. */
function packJson(out) {
  return JSON.parse(out.slice(out.search(/^\[/mu)))[0];
}

/** The package a file of an install belongs to: the name after its last `node_modules/`. */
function packageOf(file) {
  const at = file.lastIndexOf('/node_modules/');
  if (at === -1) return null;
  const parts = file.slice(at + '/node_modules/'.length).split('/');
  return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
}

/** The protocol packages among the files a process resolved, sorted, each once. */
function protocolPackages(files) {
  return [...new Set(files.map((f) => packageOf(decodeURI(f))).filter((name) => PROTOCOL.includes(name)))].sort();
}

/** The bytes of a package folder without the packages nested in its own node_modules. */
function ownBytes(dir) {
  let bytes = 0;
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name === 'node_modules' && entry.isDirectory()) continue;
      const where = path.join(d, entry.name);
      if (entry.isDirectory()) walk(where);
      else if (entry.isFile()) bytes += fs.statSync(where).size;
    }
  };
  walk(dir);
  return bytes;
}

/**
 * Every package folder of an install: each folder of a `node_modules` that holds a
 * `package.json` (a scope's folders included), and the packages nested in its own
 * `node_modules`. npm's own listing is not read: it masks parts of the paths it prints.
 */
function packageDirs(modules) {
  const found = [];
  for (const name of folders(modules)) {
    const where = path.join(modules, name);
    if (name.startsWith('@')) for (const inner of folders(where)) found.push(...packageAt(path.join(where, inner)));
    else found.push(...packageAt(where));
  }
  return found;
}

/** The folders of a directory, sorted, without dot-folders such as `.bin`; none when it does not exist. */
function folders(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name).sort();
}

/** One package folder and the packages nested in it, or nothing when the folder holds no package.json. */
function packageAt(dir) {
  return fs.existsSync(path.join(dir, 'package.json')) ? [dir, ...packageDirs(path.join(dir, 'node_modules'))] : [];
}

/** The environment of a measured run: the fixed clock, and no stray AGSC_* variable. */
function runEnv(epoch, extra) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGSC_')));
  return { ...env, SOURCE_DATE_EPOCH: epoch, ...extra };
}

/** Five timed runs of one command, then one traced run: wall time, peak memory, what it loaded. */
function coldStart(io, args, cwd, tracePath, before) {
  const { epoch, timed, timedWithRss } = io;
  const ms = [];
  const rss = [];
  for (let i = 0; i < COLD_RUNS; i += 1) {
    if (before) before();
    const r = timedWithRss(NODE, args, { cwd, env: runEnv(epoch) });
    if (r.code !== 0) throw new Error(`install layer: node ${args.join(' ')} exited ${r.code}: ${r.err.slice(-400)}`);
    ms.push(r.ms);
    rss.push(r.rss_kb);
  }
  if (before) before();
  const out = path.join(path.dirname(tracePath), 'trace-out.json');
  timed(NODE, ['--require', tracePath, ...args], { cwd, env: runEnv(epoch, { MEASURE_TRACE_OUT: out }), input: '' });
  const files = JSON.parse(fs.readFileSync(out, 'utf8'));
  return { modules_loaded: files.length, ms_runs: ms, protocol_packages: protocolPackages(files), rss_kb_runs: rss };
}

/**
 * The layer: pack, install, list, size, start, trace.
 * @param {{command:string, epoch:string, scratch:string, timed:Function, timedWithRss:Function}} io
 *   the recorded command, the fixed clock, the scratch directory, and measure.js's two timers
 */
function layerInstall(io) {
  const { command, epoch, scratch, timed } = io;
  const work = path.join(scratch, 'install');
  fs.rmSync(work, { force: true, recursive: true });
  const app = path.join(work, 'app');
  fs.mkdirSync(app, { recursive: true });
  const packed = timed('npm', ['pack', '--json', '--pack-destination', work], { cwd: REPO });
  if (packed.code !== 0) throw new Error(`install layer: npm pack exited ${packed.code}: ${packed.err.slice(-400)}`);
  const pack = packJson(packed.out);
  fs.writeFileSync(path.join(app, 'package.json'), '{ "private": true }\n');
  const installed = timed('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', path.join(work, pack.filename)], { cwd: app });
  if (installed.code !== 0) throw new Error(`install layer: npm install exited ${installed.code}: ${installed.err.slice(-400)}`);
  const dirs = packageDirs(path.join(app, 'node_modules'));
  // Keyed by the path under the install's node_modules: a package name, or `<parent>/node_modules/<name>` when nested.
  const bytes = Object.fromEntries(dirs.map((d) => [path.relative(path.join(app, 'node_modules'), d).split(path.sep).join('/'), ownBytes(d)])
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)));

  const trace = path.join(work, 'trace.cjs');
  fs.writeFileSync(trace, TRACE);
  const fixture = path.join(work, 'fixture');
  fs.cpSync(path.join(REPO, 'tests', 'fixtures', 'minimal'), fixture, { recursive: true });
  const agsc = path.join(app, 'node_modules', pack.name, 'bin', 'agsc.js');
  const clean = () => fs.rmSync(path.join(fixture, 'www'), { force: true, recursive: true });
  const loads = Object.fromEntries(LOADED.map((name) => {
    const runs = [];
    for (let i = 0; i < COLD_RUNS; i += 1) {
      const r = timed(NODE, ['-e', `const t = process.hrtime.bigint(); require(${JSON.stringify(name)}); process.stdout.write(String(Number(process.hrtime.bigint() - t) / 1e6))`], { cwd: app, env: runEnv(epoch) });
      runs.push(Math.round(Number(r.out)));
    }
    return [name, runs];
  }));
  return {
    command,
    cold_start: {
      build: coldStart(io, [agsc, 'build', '--json'], fixture, trace, clean),
      lint: coldStart(io, [agsc, 'lint', '--json'], fixture, trace),
      mcp_answering_nothing: { protocol_packages: coldStart(io, [agsc, 'mcp'], fixture, trace).protocol_packages },
      node_alone: coldStart(io, ['-e', ''], fixture, trace),
      version: coldStart(io, [agsc, '--version'], fixture, trace),
    },
    fixture: 'tests/fixtures/minimal',
    install_bytes: Object.values(bytes).reduce((a, b) => a + b, 0),
    load_ms_runs: loads,
    machine: { arch: os.arch(), node: process.version, platform: `${os.type()} ${os.release()}` },
    package_bytes: bytes,
    package_version: pack.version,
    packages: dirs.length,
    runs: COLD_RUNS,
    tarball: { files: pack.entryCount, packed_bytes: pack.size, unpacked_bytes: pack.unpackedSize },
  };
}

module.exports = { PROTOCOL, layerInstall, packJson, packageOf, protocolPackages };

/* c8 ignore stop */
