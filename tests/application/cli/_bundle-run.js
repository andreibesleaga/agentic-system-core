'use strict';
// tests/application/cli/_bundle-run.js — a scratch copy of the minimal fixture and
// one in-process `agsc` call over it, for the hardening tests of the command line.
// Not a test file itself (the leading `_`).
//
// Deterministic: fixed SOURCE_DATE_EPOCH, no network; every copy is removed when the
// test ends.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const { main } = require('../../../src/application/cli/main.js');
const { createFileSystem } = require('../../../src/adapters/node-fs.js');

/** A fresh copy of the minimal fixture, removed after the test. */
function scratch(t, prefix = 'agsc-e2-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { force: true, recursive: true }));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

/** Rewrite `agsc.config.json` through `change(config)`, or with the text given. */
function writeConfig(dir, change) {
  const file = path.join(dir, 'agsc.config.json');
  if (typeof change === 'string') {
    fs.writeFileSync(file, change);
    return;
  }
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, `${JSON.stringify(change(config) || config, null, 2)}\n`);
}

function capture() {
  let text = '';
  return { text: () => text, write: (s) => { text += s; } };
}

/**
 * Run `agsc <argv>` in `dir`, in process. `options.proc` is an optional
 * ProcessRunner port.
 * @returns {Promise<{exit:number, stdout:string, stderr:string, findings:Array<object>}>}
 */
function agsc(dir, argv, options = {}) {
  const stdout = capture();
  const stderr = capture();
  const ports = { fs: createFileSystem(dir) };
  if (options.proc) ports.proc = options.proc;
  const exit = main(argv, {
    env: { SOURCE_DATE_EPOCH: '1767225600', ...(options.env || {}) }, ports, root: dir, stderr, stdout,
  });
  return Promise.resolve(exit).then((code) => {
    const lines = `${stdout.text()}\n${stderr.text()}`.split('\n').filter((l) => l.startsWith('{'));
    const findings = [];
    for (const line of lines) {
      let parsed;
      try { parsed = JSON.parse(line); } catch { continue; }
      if (Array.isArray(parsed.findings)) findings.push(...parsed.findings);
      else if (typeof parsed.code === 'string') findings.push(parsed);
    }
    return { exit: code, findings, stderr: stderr.text(), stdout: stdout.text() };
  });
}

/** The distinct codes of a run, sorted. */
function codes(run) {
  return [...new Set(run.findings.map((f) => f.code))].sort();
}

module.exports = { FIXTURE, ROOT, agsc, codes, scratch, writeConfig };
