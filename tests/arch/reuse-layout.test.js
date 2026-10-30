'use strict';
// I-042 (REUSE layout): `REUSE.toml` and `LICENSES/`.
//
// `reuse lint` itself needs the Python tool and is run by hand in a scratch virtualenv
// (docs/ENGINEERING.md, "REUSE"). This test holds what can be read without it, so the
// layout cannot rot between those runs: every licence an annotation names has its text
// in LICENSES/, no text there is unused, the licence areas are the ones the table of
// README.md states, and the Content Use Terms file is not touched (AGSC-06-18 pins it).
//
// Deterministic: reads files only.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const toml = fs.readFileSync(path.join(ROOT, 'REUSE.toml'), 'utf8');

/** The annotations as `{path, license}` pairs, read line by line (the file is flat). */
function annotations() {
  const out = [];
  let current = null;
  for (const line of toml.split('\n')) {
    if (line.startsWith('[[annotations]]')) { current = { paths: '', license: '' }; out.push(current); continue; }
    if (current === null) continue;
    const id = /^SPDX-License-Identifier = "([^"]+)"$/u.exec(line);
    if (id) current.license = id[1];
    const one = /^path = (.*)$/u.exec(line);
    if (one) current.paths = one[1];
    else if (/^\s+"/u.test(line) && current.paths.endsWith('[')) current.paths += line.trim();
  }
  return out;
}

test('REUSE.toml declares version 1 and at least the four licence areas of the README table', () => {
  assert.match(toml, /^version = 1$/mu);
  const found = annotations();
  const areaOf = (id) => found.filter((a) => a.license === id).map((a) => a.paths).join(' ');
  assert.match(areaOf('CC0-1.0'), /schema\/\*\*/u);
  assert.match(areaOf('CC0-1.0'), /ontology\/\*\*/u);
  assert.match(areaOf('CC0-1.0'), /skills\/\*\*/u);
  assert.match(areaOf('CC0-1.0'), /plugins\/\*\*/u);
  assert.match(areaOf('CC0-1.0'), /\.claude-plugin\/\*\*/u);
  assert.match(areaOf('CC-BY-4.0'), /w3c\/\*\*/u);
  assert.match(areaOf('Apache-2.0'), /"\*\*"/u);
});

test('LICENSES/ holds exactly the texts the annotations name', () => {
  const named = [...new Set(annotations().map((a) => a.license))].sort();
  const held = fs.readdirSync(path.join(ROOT, 'LICENSES')).map((f) => f.replace(/\.txt$/u, '')).sort();
  assert.deepStrictEqual(held, named);
  for (const id of named) {
    const text = fs.readFileSync(path.join(ROOT, 'LICENSES', `${id}.txt`), 'utf8');
    assert.ok(text.length > 1000, `${id}.txt is not a licence text`);
  }
});

test('the licence table of README.md and the annotations agree on the identifiers', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  for (const id of new Set(annotations().map((a) => a.license))) {
    assert.ok(readme.includes(id), `README.md does not state ${id}`);
  }
});

test('the REUSE files ship with the package, and LICENSE-CONTENT is untouched', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(manifest.files.includes('LICENSES/'));
  assert.ok(manifest.files.includes('REUSE.toml'));
  // The pin test reads the hash out of the rule; this only checks the file is not
  // among the annotated paths (a licence text is not annotated).
  assert.ok(!annotations().some((a) => /LICENSE-CONTENT/u.test(a.paths)));
});
