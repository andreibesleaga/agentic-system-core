#!/usr/bin/env node
// bin/agsc.js — the real CLI entry point (AGSC-09-07..12).
//
// It builds the four ports from the engine's own adapters (src/adapters/*.js, which
// implement the src/ports/*.js interfaces — repository-relative FileSystem paths,
// rooted via createFileSystem(root)) and hands them to the command line's `main()`.
'use strict';

const { main } = require('../src/application/cli/main.js');
const nodeFs = require('../src/adapters/node-fs.js');
const nodeClock = require('../src/adapters/node-clock.js');
const nodeProc = require('../src/adapters/node-proc.js');
const nodeNet = require('../src/adapters/node-network-refusing.js');

function buildFileSystemPort(root) {
  return nodeFs.createFileSystem(root);
}

function buildClockPort(env, proc) {
  // AGSC-04-09: SOURCE_DATE_EPOCH first; else the last commit time, read through
  // the ProcessRunner; else 0 with AGSC-E606. The git read is skipped when the
  // variable is set, so a pinned build never starts a process.
  const pinned = env.SOURCE_DATE_EPOCH !== undefined && env.SOURCE_DATE_EPOCH !== null && String(env.SOURCE_DATE_EPOCH) !== '';
  const lastCommitSeconds = pinned ? null : nodeClock.readLastCommitSeconds(proc);
  return nodeClock.createClock({ env, lastCommitSeconds });
}

function buildProcessRunnerPort(root, env) {
  return nodeProc.createProcessRunner({ cwd: root, env });
}

function buildNetworkPort() {
  return nodeNet.createNetwork();
}

/**
 * resolveUserConfigDir(env, homedir) — AGSC-09-09's "user configuration"
 * layer (a design choice of 2026-09-18): `$XDG_CONFIG_HOME/agsc`,
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

/**
 * AGSC-09-09 as amended at rc.6: `mcp` takes one OPTIONAL positional `<path>`, the
 * Bundle root it serves, defaulting to the working directory — so an assistant with
 * no working-directory setting starts it with no shell. Every other verb serves the
 * working directory. Returns the root, or null when the path is not a directory.
 */
function bundleRoot(argv, cwd) {
  const words = argv.filter((a) => !String(a).startsWith('-'));
  if (words[0] !== 'mcp' || words[1] === undefined) return cwd;
  const path = require('path');
  const fs = require('fs');
  const root = path.resolve(cwd, String(words[1]));
  try {
    return fs.statSync(root).isDirectory() ? root : null;
  } catch (e) {
    return null;
  }
}

async function run() {
  const argv = process.argv.slice(2);
  const env = Object.assign({}, process.env);
  const root = bundleRoot(argv, process.cwd());
  if (root === null) {
    process.stderr.write('agsc: AGSC-E003 error: mcp <path>: not a directory (AGSC-09-09)\n');
    process.exitCode = 2;
    return;
  }
  const userConfigDir = resolveUserConfigDir(env, require('os').homedir());
  const userConfig = loadUserConfig(buildFileSystemPort(userConfigDir));
  const proc = buildProcessRunnerPort(root, env);

  const exitCode = await main(argv, {
    ports: buildFileSystemPort(root),
    clock: buildClockPort(env, proc),
    proc,
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
    // an error that carries a REGISTERED code is a diagnostic, not an
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
      // under `--json` the diagnostic goes to STDERR, one JSON object per
      // line, exactly as `application/cli/main.js` writes the same fault. This is a
      // fatal, pre-verb condition: no verb ran, so there is no AGSC-09-11 envelope,
      // and stdout under `--json` carries "exactly one JCS-canonical envelope and
      // nothing else" (vector `cli-0002`). The two fatal paths used to disagree
      // about the stream.
      if (json) process.stderr.write(`${JSON.stringify(diagnostic)}\n`);
      else if (!quiet) process.stderr.write(`agsc: ${code} ${diagnostic.message}\n`);
      process.exitCode = Number.isInteger(e.exitCode) ? e.exitCode : 2;
      return;
    }
    process.stderr.write(`agsc: internal error: ${e && e.stack ? e.stack : e}\n`);
    process.exitCode = 1;
  });
}

module.exports = { bundleRoot, resolveUserConfigDir, loadUserConfig, buildFileSystemPort, run };
