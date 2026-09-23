'use strict';
// examples/connectors/_run.js — the one helper every local-route example shares.
//
// It runs the PUBLIC command line (`bin/agsc.js`) of the engine these examples ship
// with, in the Bundle's own directory, and copies what the engine wrote into the
// consumer's project. Nothing here reaches a network and nothing reads a key.
//
// The build instant is `SOURCE_DATE_EPOCH` when the caller set it (AGSC-04-09), so
// the same Bundle always yields the same bytes.

const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

/** The engine's command line: the copy these examples ship beside. */
const AGSC = path.resolve(__dirname, '..', '..', 'bin', 'agsc.js');

/**
 * Run `agsc <args…>` in `bundleDir` and return its stdout. A non-zero exit throws,
 * with the engine's own findings on stderr in the message.
 */
function agsc(bundleDir, args) {
  try {
    return execFileSync(process.execPath, [AGSC, ...args], {
      cwd: bundleDir,
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    throw new Error(`agsc ${args.join(' ')} failed (exit ${e.status}):\n${e.stderr || e.message}`);
  }
}

/** Copy one file, creating its directory. */
function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  return to;
}

/** Write one file only when it does not exist yet; an operator's own file is never replaced. */
function writeIfAbsent(at, text) {
  if (fs.existsSync(at)) return false;
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.writeFileSync(at, text);
  return true;
}

/** SHA-256 of a file's bytes, lowercase hex. */
function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/**
 * Copy every skill pack `agsc skills` emitted into `targetDir`, after checking each
 * file against the lockfile `dist/skills/index.json` carries (AGSC-07-20). A pack
 * whose bytes do not match is refused, never copied.
 *
 * @returns {Array<string>} the pack names copied.
 */
function copySkills(bundleDir, targetDir) {
  const root = path.join(bundleDir, 'dist', 'skills');
  const index = JSON.parse(fs.readFileSync(path.join(root, 'index.json'), 'utf8'));
  const names = [];
  for (const pack of index.packs) {
    for (const [file, digest] of Object.entries(pack.lock)) {
      const from = path.join(root, pack.name, file);
      if (sha256(from) !== digest) throw new Error(`${pack.name}/${file} does not match the lockfile`);
      copy(from, path.join(targetDir, pack.name, file));
    }
    names.push(pack.name);
  }
  return names;
}

/** `node <example> <bundle-dir> <project-dir>`: the two arguments, resolved. */
function argsOf(argv, usage) {
  const [bundle, project] = argv.slice(2);
  if (bundle === undefined || project === undefined) {
    process.stderr.write(`usage: ${usage}\n`);
    process.exit(2);
  }
  return { bundle: path.resolve(bundle), project: path.resolve(project) };
}

module.exports = { AGSC, agsc, argsOf, copy, copySkills, sha256, writeIfAbsent };
