'use strict';
// tools/public-hygiene — "public means clean". The seeded fixture below carries one
// violation of every check the tool knows, next to text that must NOT be a hit;
// the suite proves each is caught, that an allow-list entry with a reason turns a
// hit into an allowed one, that the allow-list cannot rot or go unexplained, and
// that the engine's own tree is clean in the fast mode the `npm test` lane runs.

const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const { REPO, capture, envelope, tmpdir, tool, writeTree } = require('./helpers');

process.setMaxListeners(0);

const hygiene = tool('public-hygiene');

// Secret-shaped strings are assembled at run time so this file never carries one.
const GH = `gh${'p_'}${'A1b2'.repeat(9)}`;
const AWS = `AK${'IA'}${'ABCDEFGHIJKLMNOP'}`;
const PRIVATE_NAME = ['discovery', 'product'].join('-');
const CONFIDENTIAL = ['05', 'wiley', 'letter', 'check.md'].join('-').toUpperCase().replace('.MD', '.md');

/** One violation of every check, and the near-misses that must stay quiet. */
const SEEDED = {
  'README.md': [
    '# Seeded',
    '',
    'See [the plan](docs/plan.md) and [a slug](supervisor) and [ok](docs/ok.md).',
    'Mail ada@example.org or bob@test is fine; git@github.com is a remote; icon@2x.png too.',
    'Write to real.person@gmail.com for help.',
    'Author: Andrei N. Besleaga. Also Andrei Besleaga and Nicolae.',
    'Call +40 21 123 4567 or visit Strada Lalelelor 3.',
    'This is the companion book to chapter 3, a Web4 thing from wiley.',
    'TODO: finish this.',
    `A token ${GH} and ${AWS} and [long](docs/${'z'.repeat(70)}.md).`,
    'The runbook, a checklist for release, you should, the next session, session 28.',
    'Decided by D113 under R126 in RC6-A (ENG-9, SITE4-05); asked Claude Opus and a sub-agent; box session 20 30.',
    'An owner decision; owner-confirmed; for the owner; internal note.',
    `Private: ../../${PRIVATE_NAME}/audit and ${CONFIDENTIAL} and GABBE/project/x and /home/someone and temp/notes.`,
    '<a href="docs/missing.html">x</a> <img src="https://example.org/x.png"> <a href="#top">t</a> <a href="&lt;slug&gt;.html">e</a>',
    '[outside](../elsewhere.md) [templ](<slug>.md) [enc](docs/%E0%A4%A.md) [q](docs/ok.md?x=1#y)',
    '',
  ].join('\n'),
  'docs/ok.md': [
    '# Fine',
    '',
    'Nothing to see: session storage is a browser API; AGSC-06-07 and AGSC-E905 are rule ids and codes;',
    'RFC 9264 and HTTP 404 are numbers; PRD-005, NFR-10, ADR-019 and the risk R-15 are public ids;',
    'Cloudflare R2 and D3 are products; 99.9 % coverage; width: 100% is a length; calc(100% - 1em) too.',
    'U+10000 encodes as D800 DC00 in UTF-16.',
    '',
  ].join('\n'),
  'docs/process.md': [
    '# Process',
    '',
    'Old ids: D60 and D38-final, R64 and R59, V9D-01 and V32B-S1, F27-11, ENG1 §3, NS-FIX and FIX-F27.',
    'Also CONN3-S3, W3R-05, RC6D-01, NS-04, AR2-23, PSF-01, session-28, (s28) and audit/D.',
    'The spaced forms too: the private register (audit D) and the lettered finding RC5B-A.',
    'The change was owner-directed, following the owner\'s three directives; 100 % covered.',
    '',
  ].join('\n'),
  'site.css': 'main { width: 100%; }\n',
  'docs/runbook.md': '# Release runbook\n\nSteps.\n',
  'docs/letter.md': 'Dear reader,\n\nhello.\n',
  'src/code.js': '// TODO in code is not a document finding\nconst k = 1;\n',
  'image.png': 'binary by extension\n',
  'blob.bin': Buffer.from([0x41, 0x00, 0x42]),
};

function seeded(extra = {}) {
  const dir = tmpdir();
  for (const [name, body] of Object.entries({ ...SEEDED, ...extra })) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), body);
  }
  return dir;
}

const checksOf = (json) => [...new Set(json.findings.map((f) => f.message.split(':')[0]))].sort();
const messages = (json) => json.findings.map((f) => `${f.file}:${f.line} ${f.code} ${f.message}`);

describe('tools/public-hygiene', () => {
  it('catches one seeded violation of every check', () => {
    const root = seeded();
    const { code, json } = envelope('public-hygiene', [root]);
    assert.equal(code, 1);
    assert.equal(json.verb, 'public-hygiene');
    assert.equal(json.schema, 'agsc.diagnostics.v1');
    assert.deepEqual(checksOf(json), ['email', 'internal-note', 'missing-file', 'owner-addressed',
      'personal', 'private-name', 'private-path', 'process', 'secret', 'todo', 'wording']);
    const all = messages(json).join('\n');
    for (const needle of ['real.person@gmail.com', 'telephone number', 'street address', 'Web4',
      'publisher name', 'chapter reference', 'book framing', 'decision id: D113', 'requirement id: R126',
      'work-package id: RC6-A', 'audit finding id: SITE4-05', 'agent or model name', 'session number',
      'next session', 'runbook', 'checklist for', 'you should', 'owner decision', 'addressed to the owner',
      'internal note', 'governance project folder', 'home directory', 'temp/ folder', 'docs/plan.md',
      'docs/missing.html', 'docs/%E0%A4%A.md', 'docs/runbook.md:1', 'docs/letter.md:1', 'AGSC-E403', 'AGSC-E310']) {
      assert.ok(all.includes(needle), `expected a hit for ${needle}\n${all}`);
    }
    // A secret is never echoed; a long match is shortened.
    assert.ok(!all.includes(GH) && !all.includes(AWS));
    // The near-misses stay quiet.
    for (const quiet of ['ada@example.org', 'bob@test', 'git@github.com', 'icon@2x', 'docs/ok.md:',
      'src/code.js', 'supervisor', 'elsewhere', '<slug>', 'site.css']) {
      assert.ok(!all.includes(quiet), `unexpected hit for ${quiet}`);
    }
    // Two author-name hits (Andrei Besleaga) and Nicolae; the canonical form is not one.
    assert.equal(json.findings.filter((f) => f.message.startsWith('personal: author name form')).length, 3);
    assert.equal(json.findings.filter((f) => f.message.startsWith('private-name')).length, 2);
  });

  it('catches two-digit decision and requirement ids, audit ids, session labels and owner directions', () => {
    const root = seeded();
    const { json } = envelope('public-hygiene', [root]);
    const hits = json.findings.filter((f) => f.file === 'docs/process.md').map((f) => f.message.split(': ').slice(-1)[0]);
    for (const id of ['D60', 'D38-final', 'R64', 'R59', 'V9D-01', 'V32B-S1', 'F27-11', 'ENG1', 'NS-FIX', 'FIX-F27',
      'CONN3-S3', 'W3R-05', 'RC6D-01', 'NS-04', 'AR2-23', 'PSF-01', 'session-28', '(s28)', 'audit/D',
      'audit D', 'RC5B-A',
      'owner-directed', "owner's three directives", '100 %']) {
      assert.ok(hits.includes(id), `expected a hit for ${id}: ${JSON.stringify(hits)}`);
    }
    // Rule ids, codes, RFC numbers, HTTP codes, public requirement ids, products and CSS lengths stay quiet.
    assert.deepEqual(json.findings.filter((f) => f.file === 'docs/ok.md' || f.file === 'site.css'), []);
  });

  it('reads only text: binaries are counted, not read', () => {
    const root = seeded();
    const r = capture('public-hygiene', [root]);
    assert.equal(r.code, 1);
    assert.match(r.out, /public-hygiene: 7 input file\(s\) read \(walk\), 0 skipped by the allow-list, 2 binary, 0 allowed hit\(s\), \d+ error, 0 warn/u);
    assert.match(r.err, /^error: README\.md:\d+:\d+ AGSC-E/mu);
  });

  it('an allow-list entry with a reason allows the hit, and --allowed lists it', () => {
    const root = seeded({
      '.public-hygiene.json': JSON.stringify({
        allow: [
          { check: 'email', path: 'README.md', reason: 'the seeded address is the documented contact', text: 'real.person@' },
          { check: 'process', path: '**/*.md', reason: 'the fixture names process vocabulary on purpose' },
        ],
        skip: [{ path: 'docs/**', reason: 'the docs folder is not published by this fixture' }],
      }, null, 2),
    });
    const r = capture('public-hygiene', ['--allowed', root]);
    assert.match(r.err, /allowed: README\.md:5 email — the seeded address is the documented contact/u);
    assert.ok(!/real\.person/u.test(r.err.split('\n').filter((l) => l.startsWith('error')).join('\n')));
    assert.match(r.out, /5 skipped by the allow-list/u);
    const { json } = envelope('public-hygiene', [root]);
    assert.ok(!checksOf(json).includes('process'));
  });

  it('a clean tree passes, and the envelope is canonical', () => {
    const root = writeTree(tmpdir(), { 'README.md': '# Clean\n\nNothing private here.\n' });
    const r = capture('public-hygiene', ['--json', root]);
    assert.equal(r.code, 0);
    const json = JSON.parse(r.out);
    assert.equal(json.status, 'pass');
    assert.equal(r.out, `${hygiene.canonicalize(json)}\n`);
    assert.equal(capture('public-hygiene', ['--quiet', root]).out, '');
  });

  it('a run that reads nothing fails with AGSC-E901', () => {
    const root = writeTree(tmpdir(), { 'a.png': 'x' });
    const { code, json } = envelope('public-hygiene', [root]);
    assert.equal(code, 1);
    assert.deepEqual(json.findings.map((f) => f.code), ['AGSC-E901']);
  });

  it('every allow-list entry must be well formed, carry a reason, and match something', () => {
    const root = writeTree(tmpdir(), {
      '.public-hygiene.json': JSON.stringify({
        allow: [
          { check: 'email', path: 'x.md' },
          { check: 'nope', path: 'x.md', reason: 'a reason long enough' },
          { check: 'email', path: 'x.md', reason: 'a reason long enough', text: '' },
          { reason: 'no path at all here' },
          null,
          { check: 'email', path: 'never.md', reason: 'stale: matches no file' },
        ],
        built: 'www',
        skip: { path: 'x' },
      }, null, 2),
      'README.md': '# Clean\n',
    });
    const { code, json } = envelope('public-hygiene', [root]);
    assert.equal(code, 1);
    const codes = json.findings.map((f) => f.code).sort();
    assert.deepEqual(codes, ['AGSC-E201', 'AGSC-E201', 'AGSC-E201', 'AGSC-E201', 'AGSC-E201',
      'AGSC-E202', 'AGSC-E203', 'AGSC-E506']);
    // In fast mode a stale entry is not reported: built outputs were not swept.
    const fast = envelope('public-hygiene', ['--fast', root]).json;
    assert.ok(!fast.findings.some((f) => f.code === 'AGSC-E506'));
    const stale = writeTree(tmpdir(), {
      '.public-hygiene.json': JSON.stringify({ skip: [{ path: 'gone/**', reason: 'nothing is here' }] }),
      'README.md': '# Clean\n',
    });
    assert.match(capture('public-hygiene', [stale]).err, /stale allow-list entry: skip gone\/\*\*/u);
  });

  it('sweeps the built outputs in a full run and resolves root-absolute links there', () => {
    const root = writeTree(tmpdir(), {
      '.public-hygiene.json': JSON.stringify({ built: ['www', 'absent'] }),
      'README.md': '# Source\n\n[abs](/nowhere.md)\n',
      'www/index.html': '<a href="/specs/">s</a> <a href="/about">a</a> <a href="/gone.html">g</a> <a href="page/">p</a>\n',
      'www/specs/index.html': '<p>spec</p>\n',
      'www/about.html': '<p>about</p>\n',
      'www/page/index.html': '<p>hello, owner-side leak</p>\n',
    });
    const full = envelope('public-hygiene', [root]).json;
    const all = messages(full).join('\n');
    assert.ok(all.includes('www/index.html:1 AGSC-E310 missing-file: link to a file not in the repository: /gone.html'));
    assert.ok(all.includes('www/page/index.html'));
    assert.ok(!all.includes('/specs/') && !all.includes('/about') && !all.includes('nowhere'));
    const fast = envelope('public-hygiene', ['--fast', root]).json;
    assert.equal(fast.status, 'pass');
    assert.match(capture('public-hygiene', ['--fast', root]).out, /\(walk, fast\)/u);
  });

  it('in a git tree it reads tracked and untracked-not-ignored files only', () => {
    const root = writeTree(tmpdir(), {
      '.gitignore': 'ignored/\n',
      'README.md': '# Tracked\n',
      'ignored/leak.md': 'Mail real.person@gmail.com\n',
      'new.md': 'Untracked but not ignored: next session.\n',
    });
    const git = (args) => cp.spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(git(['init', '-q']).status, 0);
    git(['add', 'README.md', '.gitignore']);
    fs.rmSync(path.join(root, 'README.md')); // tracked but deleted: not read
    const r = capture('public-hygiene', ['--json', root]);
    const json = JSON.parse(r.out);
    const files = json.findings.map((f) => f.file);
    assert.deepEqual([...new Set(files)], ['new.md']);
    assert.match(capture('public-hygiene', [root]).out, /\(git\)/u);
    assert.equal(hygiene.sourceFiles(root).mode, 'git');
    // A tracked symbolic link is not read as a file.
    fs.symlinkSync(root, path.join(root, 'loop'));
    git(['add', 'loop']);
    assert.match(capture('public-hygiene', [root]).out, /1 skipped by the allow-list/u);
  });

  it('answers --help and refuses bad usage with exit 2', () => {
    assert.equal(capture('public-hygiene', ['--help']).code, 0);
    assert.match(capture('public-hygiene', ['-h']).out, /Exit 0 pass, 1 fail, 2 usage/u);
    assert.equal(capture('public-hygiene', ['--nope']).code, 2);
    assert.equal(capture('public-hygiene', ['a', 'b']).code, 2);
    assert.equal(capture('public-hygiene', [path.join(tmpdir(), 'absent')]).code, 2);
    const badJson = writeTree(tmpdir(), { '.public-hygiene.json': '{', 'a.md': 'x\n' });
    assert.match(capture('public-hygiene', [badJson]).err, /could not start/u);
    const notObject = writeTree(tmpdir(), { '.public-hygiene.json': '[]', 'a.md': 'x\n' });
    assert.match(capture('public-hygiene', [notObject]).err, /not a JSON object/u);
  });

  it('sweeps exactly the file list a caller passes, starting no process', () => {
    const root = seeded();
    const r = hygiene.sweep(root, { fast: true, files: ['docs/ok.md'] });
    assert.equal(r.mode, 'list');
    assert.equal(r.read, 1);
    assert.deepEqual(r.findings, []);
  });

  it('defaults to the current directory', () => {
    const root = writeTree(tmpdir(), { 'a.md': '# A\n' });
    const here = process.cwd();
    process.chdir(root);
    try { assert.equal(capture('public-hygiene', ['--quiet']).code, 0); } finally { process.chdir(here); }
  });

  it('exposes its helpers: globs, link targets, private names, a walk over a file', () => {
    assert.ok(hygiene.globToRegExp('docs/**/*.md').test('docs/a/b/c.md'));
    assert.ok(hygiene.globToRegExp('docs/**/*.md').test('docs/c.md'));
    assert.ok(hygiene.globToRegExp('**').test('any/thing'));
    assert.ok(hygiene.globToRegExp('a?.m+d').test('ab.m+d'));
    assert.ok(!hygiene.globToRegExp('*.md').test('a/b.md'));
    assert.deepEqual(hygiene.linkTargets('[a](b.md "t") src="c.png"').map((l) => l.target), ['b.md', 'c.png']);
    assert.equal(hygiene.privateNameHits(`x ${PRIVATE_NAME} y`).length, 1);
    assert.equal(hygiene.privateNameHits('no-private here').length, 0);
    assert.deepEqual(hygiene.walk(path.join(REPO, 'package.json'), REPO, []), []);
    assert.equal(hygiene.compareCodePoint('a', 'a'), 0);
    assert.equal(hygiene.compareCodePoint('a', 'ab'), -1);
    assert.equal(hygiene.compareCodePoint('b', 'a'), 1);
    assert.equal(hygiene.canonicalize({ b: [true, false, null, 1], a: 'x' }), '{"a":"x","b":[true,false,null,1]}');
  });

  it('the engine tree itself is clean in fast mode (the npm test lane)', () => {
    const r = capture('public-hygiene', ['--fast', REPO]);
    assert.equal(r.code, 0, `${r.err}\n${r.out}`);
  });
});
