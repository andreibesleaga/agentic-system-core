// generated from src-ts/bench/install.ts by tsc 6.0.3; do not edit
"use strict";
// src-ts/bench/install.ts — the `install` layer of bench/measure.js: what a consumer's install of
// the packed tarball holds, and what three verbs cost to start from it (docs/MEASUREMENTS.md §9).
//
// `npm pack` the repository, `npm install --omit=dev` the tarball into an empty folder, count the
// package folders it holds (the package itself among them) and size each one without the packages
// nested in it; then five timed runs (GNU `time -v`: wall time and peak memory) of `node -e ""`,
// `agsc --version`, `agsc lint` and `agsc build` on a copy of the reference fixture, and five of
// loading each protocol package alone.
//
// The module trace is the proof that a verb loads no protocol package: one more run of each verb
// preloads a file that registers a resolve hook (`module.registerHooks`, Node 22.15 or later, which
// sees both `require` and `import`) and writes every file the process resolved when it exits.
// `agsc mcp` with an empty input is traced too, as the control that the trace sees the packages
// when a verb does load them.
//
// Why TypeScript: the benchmark kit's runners are strict TypeScript (docs/ENGINEERING.md §8). The
// spawning stays in bench/measure.js, which hands its two timers in (`io`), so every check of a
// run's outcome here is testable with stand-in timers (tests/bench/measure.test.js). Like every
// runner it requires nothing of src/ (`bench-runners-standalone`).
//
// What it needs, checked before anything runs (`prerequisites`): Node with `module.registerHooks`,
// GNU `time` at /usr/bin/time, and the npm registry (the install has a time limit, so a machine
// with no network gets a message instead of a hang; `measure --all --offline` leaves the layer out).
// A run that fails is an error with the tail of its standard error, never a number in the record.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.INSTALL_TIMEOUT_MS = exports.PROTOCOL = void 0;
exports.packJson = packJson;
exports.packageOf = packageOf;
exports.protocolPackages = protocolPackages;
exports.mustSucceed = mustSucceed;
exports.prerequisites = prerequisites;
exports.packageDirs = packageDirs;
exports.traced = traced;
exports.coldStart = coldStart;
exports.loadTimes = loadTimes;
exports.layerInstall = layerInstall;
const fs = __importStar(require("node:fs"));
const nodeModule = __importStar(require("node:module"));
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
/** The packages of the protocol servers, whose loading the trace reports. */
exports.PROTOCOL = Object.freeze(['@a2a-js/sdk', '@hono/node-server', '@modelcontextprotocol/core', '@modelcontextprotocol/node',
    '@modelcontextprotocol/sdk', '@modelcontextprotocol/server', 'hono']);
/** The protocol packages whose load time alone is measured. */
const LOADED = Object.freeze(['@modelcontextprotocol/server', '@modelcontextprotocol/node', '@a2a-js/sdk']);
const COLD_RUNS = 5;
/** How long the install of the tarball may take before the layer gives up (ten minutes). */
exports.INSTALL_TIMEOUT_MS = 600_000;
/** The path of GNU time, which `timedWithRss` of bench/measure.js runs. */
const GNU_TIME = '/usr/bin/time';
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
    if (at === -1)
        return null;
    const [first = '', second = ''] = file.slice(at + '/node_modules/'.length).split('/');
    return first.startsWith('@') ? `${first}/${second}` : first;
}
/** The protocol packages among the files a process resolved, sorted, each once. */
function protocolPackages(files) {
    const names = files.map((f) => packageOf(decodeURI(f))).filter((name) => name !== null && exports.PROTOCOL.includes(name));
    return [...new Set(names)].sort();
}
/** A run that did not exit 0, as an error naming what ran and the tail of its standard error. */
function mustSucceed(r, what) {
    if (r.code === 0)
        return r;
    const how = r.code === null ? 'did not finish (killed or timed out)' : `exited ${r.code}`;
    throw new Error(`install layer: ${what} ${how}: ${r.err.slice(-400)}`);
}
/** Why the layer cannot run on this machine, one line per missing piece; none when it can. */
function prerequisites(io, hooks = nodeModule.registerHooks, timeExists = fs.existsSync(GNU_TIME)) {
    const missing = [];
    if (typeof hooks !== 'function')
        missing.push(`the module trace needs module.registerHooks (Node 22.15 or later); this is Node ${process.version}`);
    if (!timeExists)
        missing.push(`the timed runs need GNU time at ${GNU_TIME}`);
    else if (io.timedWithRss(process.execPath, ['-e', ''], {}).rss_kb === null)
        missing.push(`${GNU_TIME} is not GNU time: it reports no peak memory with -v`);
    return missing;
}
/** The bytes of a package folder without the packages nested in its own node_modules. */
function ownBytes(dir) {
    let bytes = 0;
    const walk = (d) => {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
            if (entry.name === 'node_modules' && entry.isDirectory())
                continue;
            const where = path.join(d, entry.name);
            if (entry.isDirectory())
                walk(where);
            else if (entry.isFile())
                bytes += fs.statSync(where).size;
        }
    };
    walk(dir);
    return bytes;
}
/** The folders of a directory, sorted, without dot-folders such as `.bin`; none when it does not exist. */
function folders(dir) {
    if (!fs.existsSync(dir))
        return [];
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name).sort();
}
/** One package folder and the packages nested in it, or nothing when the folder holds no package.json. */
function packageAt(dir) {
    return fs.existsSync(path.join(dir, 'package.json')) ? [dir, ...packageDirs(path.join(dir, 'node_modules'))] : [];
}
/**
 * Every package folder of an install: each folder of a `node_modules` that holds a `package.json`
 * (a scope's folders included), and the packages nested in its own `node_modules`. npm's own
 * listing is not read: it masks parts of the paths it prints.
 */
function packageDirs(modules) {
    const found = [];
    for (const name of folders(modules)) {
        const where = path.join(modules, name);
        if (name.startsWith('@'))
            for (const inner of folders(where))
                found.push(...packageAt(path.join(where, inner)));
        else
            found.push(...packageAt(where));
    }
    return found;
}
/** The environment of a measured run: the fixed clock, and no stray AGSC_* variable. */
function runEnv(epoch, extra = {}) {
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('AGSC_')));
    return { ...env, SOURCE_DATE_EPOCH: epoch, ...extra };
}
/** One traced run: the files the process resolved. The trace file is removed first, so a failed run never reads an older one. */
function traced(io, args, cwd, tracePath) {
    const out = path.join(path.dirname(tracePath), 'trace-out.json');
    fs.rmSync(out, { force: true });
    const r = io.timed(process.execPath, ['--require', tracePath, ...args], { cwd, env: runEnv(io.epoch, { MEASURE_TRACE_OUT: out }), input: '' });
    mustSucceed(r, `the traced run of node ${args.join(' ')}`);
    return JSON.parse(fs.readFileSync(out, 'utf8'));
}
/** Five timed runs of one command, then one traced run: wall time, peak memory, what it loaded. */
function coldStart(io, args, cwd, tracePath, before = () => undefined) {
    const ms = [];
    const rss = [];
    for (let i = 0; i < COLD_RUNS; i += 1) {
        before();
        const r = io.timedWithRss(process.execPath, args, { cwd, env: runEnv(io.epoch) });
        mustSucceed(r, `node ${args.join(' ')}`);
        ms.push(r.ms);
        rss.push(r.rss_kb);
    }
    before();
    const files = traced(io, args, cwd, tracePath);
    return { modules_loaded: files.length, ms_runs: ms, protocol_packages: protocolPackages(files), rss_kb_runs: rss };
}
/** Five runs of loading each protocol package alone, in milliseconds as the run printed them. */
function loadTimes(io, app) {
    return Object.fromEntries(LOADED.map((name) => {
        const runs = [];
        for (let i = 0; i < COLD_RUNS; i += 1) {
            const script = `const t = process.hrtime.bigint(); require(${JSON.stringify(name)}); process.stdout.write(String(Number(process.hrtime.bigint() - t) / 1e6))`;
            const r = mustSucceed(io.timed(process.execPath, ['-e', script], { cwd: app, env: runEnv(io.epoch) }), `loading ${name}`);
            const loaded = Number(r.out);
            if (r.out.trim() === '' || !Number.isFinite(loaded))
                throw new Error(`install layer: loading ${name} printed no time: ${JSON.stringify(r.out)}`);
            runs.push(Math.round(loaded));
        }
        return [name, runs];
    }));
}
/** Pack the repository and install the tarball into `<work>/app`: the pack entry and the install's node_modules. */
function packAndInstall(io, work) {
    const app = path.join(work, 'app');
    fs.mkdirSync(app, { recursive: true });
    const pack = packJson(mustSucceed(io.timed('npm', ['pack', '--json', '--pack-destination', work], { cwd: io.repo }), 'npm pack').out);
    fs.writeFileSync(path.join(app, 'package.json'), '{ "private": true }\n');
    const installed = io.timed('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', path.join(work, pack.filename)], { cwd: app, timeout: exports.INSTALL_TIMEOUT_MS });
    if (installed.code === null) {
        throw new Error('install layer: npm install did not finish within ten minutes (is the npm registry reachable?); `measure --all --offline` leaves this layer out');
    }
    mustSucceed(installed, 'npm install');
    return { modules: path.join(app, 'node_modules'), pack };
}
/** The own bytes of every package folder, keyed by its path under node_modules, largest first. */
function packageBytes(modules, dirs) {
    // A package name, or `<parent>/node_modules/<name>` when nested.
    return Object.fromEntries(dirs.map((d) => [path.relative(modules, d).split(path.sep).join('/'), ownBytes(d)])
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)));
}
/** The cold start of each verb from the install, on a copy of the reference fixture, and the control run of `agsc mcp`. */
function coldStarts(io, work, agsc) {
    const trace = path.join(work, 'trace.cjs');
    fs.writeFileSync(trace, TRACE);
    const fixture = path.join(work, 'fixture');
    fs.cpSync(path.join(io.repo, 'tests', 'fixtures', 'minimal'), fixture, { recursive: true });
    const clean = () => { fs.rmSync(path.join(fixture, 'www'), { force: true, recursive: true }); };
    return {
        build: coldStart(io, [agsc, 'build', '--json'], fixture, trace, clean),
        lint: coldStart(io, [agsc, 'lint', '--json'], fixture, trace),
        mcp_answering_nothing: { protocol_packages: protocolPackages(traced(io, [agsc, 'mcp'], fixture, trace)) },
        node_alone: coldStart(io, ['-e', ''], fixture, trace),
        version: coldStart(io, [agsc, '--version'], fixture, trace),
    };
}
/** The layer: check the machine, pack, install, list, size, start, trace. */
function layerInstall(io) {
    const missing = prerequisites(io);
    if (missing.length > 0)
        throw new Error(`install layer cannot run here: ${missing.join('; ')}`);
    const work = path.join(io.scratch, 'install');
    fs.rmSync(work, { force: true, recursive: true });
    const { modules, pack } = packAndInstall(io, work);
    const dirs = packageDirs(modules);
    const bytes = packageBytes(modules, dirs);
    return {
        command: io.command,
        cold_start: coldStarts(io, work, path.join(modules, pack.name, 'bin', 'agsc.js')),
        fixture: 'tests/fixtures/minimal',
        install_bytes: Object.values(bytes).reduce((a, b) => a + b, 0),
        load_ms_runs: loadTimes(io, path.dirname(modules)),
        machine: { arch: os.arch(), node: process.version, platform: `${os.type()} ${os.release()}` },
        package_bytes: bytes,
        package_version: pack.version,
        packages: dirs.length,
        runs: COLD_RUNS,
        tarball: { files: pack.entryCount, packed_bytes: pack.size, unpacked_bytes: pack.unpackedSize },
    };
}
