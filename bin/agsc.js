#!/usr/bin/env node
// bin/agsc.js — the real CLI entry point (AGSC-09-07..12). Owner: B.
//
// Prefers A's real adapters (src/adapters/*.js, which implement the
// src/ports/*.js JSDoc interfaces — repository-relative FileSystem paths,
// rooted via createFileSystem(root)) and falls back to small inline
// Node-stdlib implementations only if an adapter is not yet present, so the
// CLI keeps working while other WP-10 agents' modules land.
'use strict';

const { main } = require('../src/application/cli/main.js');

function tryRequire(id) {
  try {
    return require(id);
  } catch (e) {
    return null;
  }
}

function buildFileSystemPort(root) {
  const nodeFs = tryRequire('../src/adapters/node-fs.js');
  if (nodeFs && typeof nodeFs.createFileSystem === 'function') {
    return nodeFs.createFileSystem(root);
  }
  // Interim fallback: repository-relative paths resolved against `root`,
  // matching src/ports/filesystem.js's contract.
  const fs = require('fs');
  const path = require('path');
  const abs = (p) => path.resolve(root, String(p));
  return {
    root,
    readFile: (p, encoding = 'utf8') => (encoding === null ? fs.readFileSync(abs(p)) : fs.readFileSync(abs(p), encoding)),
    writeFile: (p, data) => {
      fs.mkdirSync(path.dirname(abs(p)), { recursive: true });
      fs.writeFileSync(abs(p), data);
    },
    readdir: (p) => fs.readdirSync(abs(p)).sort(),
    stat: (p) => fs.statSync(abs(p)),
    exists: (p) => {
      try {
        return fs.existsSync(abs(p));
      } catch (e) {
        return false;
      }
    },
    mkdirp: (p) => fs.mkdirSync(abs(p), { recursive: true }),
    remove: (p) => fs.rmSync(abs(p), { recursive: true, force: true })
  };
}

function buildClockPort(env) {
  const nodeClock = tryRequire('../src/adapters/node-clock.js');
  if (nodeClock && typeof nodeClock.createClock === 'function') {
    return nodeClock.createClock({ env });
  }
  return {
    now() {
      const raw = env.SOURCE_DATE_EPOCH;
      if (raw !== undefined && /^[0-9]+$/.test(raw)) return parseInt(raw, 10);
      return 0; // AGSC-04-09/E606: no git history reachable from this stub, warned elsewhere
    }
  };
}

function buildProcessRunnerPort(root, env) {
  const nodeProc = tryRequire('../src/adapters/node-proc.js');
  if (nodeProc && typeof nodeProc.createProcessRunner === 'function') {
    return nodeProc.createProcessRunner({ cwd: root, env });
  }
  return {
    run(cmd, args) {
      const { spawnSync } = require('child_process');
      const r = spawnSync(cmd, args, { encoding: 'utf8', cwd: root });
      return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
    }
  };
}

function buildNetworkPort() {
  const nodeNet = tryRequire('../src/adapters/node-network-refusing.js');
  if (nodeNet && typeof nodeNet.createNetwork === 'function') {
    return nodeNet.createNetwork();
  }
  return {
    async fetch(url) {
      throw Object.assign(new Error(`network access is refused by this node: ${url} (AGSC-04-03)`), { code: 'AGSC-E905' });
    }
  };
}

/**
 * resolveUserConfigDir(env, homedir) — AGSC-09-09's "user configuration"
 * layer (coordinator decision, 2026-09-18): `$XDG_CONFIG_HOME/agsc`,
 * falling back to `~/.config/agsc`. `homedir` is injected (default
 * `os.homedir()`) so a test never touches the real home directory.
 */
function resolveUserConfigDir(env, homedir) {
  const path = require('path');
  const base = env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME.length > 0
    ? env.XDG_CONFIG_HOME
    : path.join(homedir, '.config');
  return path.join(base, 'agsc');
}

/**
 * loadUserConfig(userConfigPorts) -> object|undefined
 *
 * `userConfigPorts` is a FileSystem port already rooted at the user
 * configuration directory (src/ports/filesystem.js: repository-relative
 * paths) — a SECOND, separate adapter instance from the Bundle's own
 * FileSystem port (buildFileSystemPort(root) above), since the two roots
 * are unrelated directories and neither may reach outside its own root
 * (AGSC-E902). Reads `config.json`; absent or malformed -> undefined
 * (silently: there is no registered code for "no user configuration", and
 * one is not required to exist).
 */
function loadUserConfig(userConfigPorts) {
  try {
    if (!userConfigPorts.exists('config.json')) return undefined;
    return JSON.parse(String(userConfigPorts.readFile('config.json')));
  } catch (e) {
    return undefined;
  }
}

async function run() {
  const argv = process.argv.slice(2);
  const env = Object.assign({}, process.env);
  const root = process.cwd();
  const userConfigDir = resolveUserConfigDir(env, require('os').homedir());
  const userConfig = loadUserConfig(buildFileSystemPort(userConfigDir));

  const exitCode = await main(argv, {
    ports: buildFileSystemPort(root),
    clock: buildClockPort(env),
    proc: buildProcessRunnerPort(root, env),
    network: buildNetworkPort(),
    env,
    stdout: process.stdout,
    stderr: process.stderr,
    root,
    userConfig
  });
  process.exitCode = exitCode;
}

// Guard the side-effecting entry point so this file can be `require()`d by
// tests (resolveUserConfigDir/loadUserConfig/buildFileSystemPort) without
// running the real CLI.
if (require.main === module) {
  run().catch((e) => {
    // FV29-04: an error that carries a REGISTERED code is a diagnostic, not an
    // internal fault. `EpochError` (AGSC-E603, exit 2) is thrown while the ports are
    // built, before `main()` can catch anything, so a malformed SOURCE_DATE_EPOCH
    // reached this handler and was printed as a stack trace with exit 1 — the
    // opposite of AGSC-04-09 and of what `src/adapters/node-clock.js:5` and
    // `docs/IMPLEMENTERS-GUIDE.md` both state ("AGSC-E603 and exit 2, never a
    // Finding"). Only the empty string happened to take a path `main()` caught.
    const code = e && typeof e.code === 'string' && /^AGSC-E\d{3}$/u.test(e.code) ? e.code : null;
    if (code !== null) {
      const diagnostic = { code, severity: 'error', message: String(e.message) };
      const json = process.argv.slice(2).includes('--json');
      const quiet = process.argv.slice(2).includes('--quiet');
      if (json) process.stdout.write(`${JSON.stringify(diagnostic)}\n`);
      else if (!quiet) process.stderr.write(`agsc: ${code} ${diagnostic.message}\n`);
      process.exitCode = Number.isInteger(e.exitCode) ? e.exitCode : 2;
      return;
    }
    process.stderr.write(`agsc: internal error: ${e && e.stack ? e.stack : e}\n`);
    process.exitCode = 1;
  });
}

module.exports = { resolveUserConfigDir, loadUserConfig, buildFileSystemPort, run };
