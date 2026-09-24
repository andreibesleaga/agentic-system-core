'use strict';
// Shared helpers for the tests of the PRD-054 validators and generators
// (`tools/`, AGSC-09-90). Every tool exports `run(argv, io)` and returns its exit
// code instead of calling `process.exit`, so a test drives it in process: the exit
// code, both streams and the AGSC-09-11 envelope are all observable, and the
// coverage reporter sees the lines the test executed.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TOOLS = path.resolve(__dirname, '..', '..', 'tools');
const REPO = path.resolve(__dirname, '..', '..');

/** Load one tool by its file name (the files carry no extension). */
function tool(name) {
  return require(path.join(TOOLS, name));
}

/**
 * Run a tool and capture everything it produced.
 * @returns {{code:number, out:string, err:string}}
 */
function capture(name, argv) {
  let out = '';
  let err = '';
  const code = tool(name).run(argv, { err: (s) => { err += s; }, out: (s) => { out += s; } });
  return { code, err, out };
}

/** The AGSC-09-11 envelope a `--json` run wrote, parsed. */
function envelope(name, argv) {
  const result = capture(name, ['--json', ...argv]);
  return { ...result, json: JSON.parse(result.out) };
}

/** Every finding code the run produced, sorted and de-duplicated. */
function codes(json) {
  return [...new Set(json.findings.map((f) => f.code))].sort();
}

/** A throw-away directory, removed when the process exits. */
function tmpdir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-tools-'));
  process.on('exit', () => { try { fs.rmSync(dir, { force: true, recursive: true }); } catch { /* gone */ } });
  return dir;
}

/** Write `{ 'a/b.md': 'text' }` into `dir`, creating directories as needed. */
function writeTree(dir, files) {
  for (const name of Object.keys(files).sort()) {
    const where = path.join(dir, name);
    fs.mkdirSync(path.dirname(where), { recursive: true });
    fs.writeFileSync(where, files[name]);
  }
  return dir;
}

/** A minimal root that every tool can be pointed at: one rule, one code, one version. */
function specRoot(extra = {}) {
  const dir = tmpdir();
  writeTree(dir, {
    'spec/00-overview.md': [
      '# Overview',
      '',
      '`spec_version: "1.0.0-rc.5"` The key words MUST, SHOULD are to be interpreted as described in BCP 14.',
      '',
      '- **AGSC-00-01** A Bundle is a directory tree. [PRD-002]',
      '',
    ].join('\n'),
    'spec/09-conformance.md': [
      '# Conformance',
      '',
      '## 9.4 Registry',
      '',
      '| Code | Fault | Raised by |',
      '|---|---|---|',
      '| `AGSC-E201` | schema validation failed | AGSC-01-01 |',
      '',
      '- **AGSC-09-01** An engine MUST report `AGSC-E201` for a schema failure. [PRD-054]',
      '',
    ].join('\n'),
    'spec/01-bundle.md': [
      '# Bundle',
      '',
      '- **AGSC-01-01** A Bundle MUST carry one configuration file. [PRD-002]',
      '',
    ].join('\n'),
    ...extra,
  });
  return dir;
}

module.exports = { REPO, TOOLS, capture, codes, envelope, specRoot, tmpdir, tool, writeTree };
