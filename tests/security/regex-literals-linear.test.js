'use strict';
// A generic guard over every regular-expression literal in `src/`: no literal has one
// of the shapes known to take quadratic time on a long line. The linear-time tests
// beside each module cover the scans that replaced such patterns one by one; this
// guard keeps a new one from coming in under another name.
//
// The shapes, each of which reads a run again from every one of its positions:
//
//   1. a run of `.` to the end of the text (`(.*)$`, `(.+)$`) right after another
//      run that can give characters back (`[ \t]*`, `\s+`), or in a pattern that is
//      not anchored at the start. `.` does not match a carriage return, U+2028 or
//      U+2029, so a line holding one makes the earlier run give back one character at
//      a time and the dot run read the rest of the line again each time;
//   2. a run of `.` followed by runs to the end, one of them of blanks (`.*?\s*$`,
//      `.+?\s*#*\s*$`);
//   3. the start of the text or a line feed, then a run of blanks (`(^|\n)\s*`): it
//      starts at every line feed of a run of line feeds and reads the whole run;
//   4. an unanchored trim, a run of one kind of character to the end (`-+$`): a long
//      run followed by any other character is read again from each of its positions.
//
// A literal of one of these shapes that is linear where it is used is listed in ALLOW
// with the reason. The scripts the build copies into every node's pages are scanned
// like the rest from 1.1 (they were left out until then, so as to keep their bytes).
//
// Deterministic: the literals are read with the linter the repository already pins;
// nothing is timed, nothing is random, no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Linter } = require('eslint');

const REPO = path.resolve(__dirname, '..', '..');

/** `file<TAB>/pattern/flags` -> why that literal is linear where it is used. */
const ALLOW = new Map([
  ['src/knowledge/adopt.js\t/-+$/u', 'it trims a slug after every run of "-" was made one "-", so the run it reads is one character'],
  ['src/knowledge/slug.js\t/-+$/', 'each use follows the collapse of every run of "-" into one "-", or a cut to the slug\'s length'],
  ['src/governance/ledger.js\t/-+$/u', 'it trims a name after every run of "-" was made one "-"'],
  ['src/interchange/trace.js\t/^-+|-+$/gu', 'it trims a slug after every run of "-" was made one "-"'],
  ['src/interchange/mapping.js\t/^-+|-+$/gu', 'it trims a slug after every run of "-" was made one "-"'],
  ['src/interchange/cleanroom-rewrite.js\t/([.!?]["\')\\]”’]*\\s*)$/u', 'every start is a sentence mark, which neither run can hold, so each character is read from one start only'],
]);

// ------------------------------------------------------------------ the literals

/** Every `.js` file under `dir`, repository-relative. */
function files(dir) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...files(rel));
    else if (entry.name.endsWith('.js')) out.push(rel);
  }
  return out;
}

/** Every regular-expression literal of the scanned files: file, line, pattern, flags. */
function literals() {
  const found = [];
  let file = '';
  const collect = { create: () => ({ Literal(node) { if (node.regex) found.push({ file, line: node.loc.start.line, ...node.regex }); } }) };
  const config = [{
    files: ['**/*.js'], languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs' },
    plugins: { guard: { rules: { collect } } }, rules: { 'guard/collect': 'error' },
  }];
  const linter = new Linter();
  for (const rel of files('src')) {
    file = rel;
    const messages = linter.verify(fs.readFileSync(path.join(REPO, rel), 'utf8'), config, { filename: rel });
    assert.deepEqual(messages.filter((m) => m.fatal), [], `${rel} could not be parsed`);
  }
  return found;
}

// ------------------------------------------------------------------ the pattern tokens

/** The length of the escape at `i` (`\s`, `\u{…}`, `\uXXXX`, `\xXX`, `\p{…}`, `\k<…>`). */
function escapeLength(pattern, i) {
  const next = pattern[i + 1];
  if ((next === 'u' || next === 'p' || next === 'P') && pattern[i + 2] === '{') return pattern.indexOf('}', i) - i + 1;
  if (next === 'k' && pattern[i + 2] === '<') return pattern.indexOf('>', i) - i + 1;
  if (next === 'u') return 6;
  if (next === 'x') return 4;
  if (next === 'c') return 3;
  return 2;
}

/** The index just after the character class that starts at `i`. */
function classEnd(pattern, i) {
  let j = i + 1;
  while (j < pattern.length && pattern[j] !== ']') j += pattern[j] === '\\' ? 2 : 1;
  return j + 1;
}

/** One token at `i`: an atom, a group opener or closer, an alternation or an anchor. */
function tokenAt(pattern, i) {
  const c = pattern[i];
  if (c === '\\') return { length: escapeLength(pattern, i), type: 'atom' };
  if (c === '[') return { length: classEnd(pattern, i) - i, type: 'atom' };
  if (c === '(') return { length: /^\((?:\?(?::|=|!|<=|<!|<[A-Za-z_$][\w$]*>))?/u.exec(pattern.slice(i))[0].length, type: 'open' };
  const kinds = { $: 'end', ')': 'close', '^': 'start', '|': 'alt' };
  return { length: 1, type: kinds[c] || 'atom' };
}

/** The tokens of a pattern, each atom or group closer with its quantifier. */
function tokens(pattern) {
  const out = [];
  let i = 0;
  while (i < pattern.length) {
    const { length, type } = tokenAt(pattern, i);
    const token = { text: pattern.slice(i, i + length), type };
    i += length;
    const q = /^(?:([*+?])|\{(\d+)(,(\d*))?\})\??/u.exec(pattern.slice(i));
    if (q !== null && (type === 'atom' || type === 'close')) {
      const max = { '*': Infinity, '+': Infinity, '?': 1 };
      token.max = q[1] !== undefined ? max[q[1]] : (q[3] === undefined ? Number(q[2]) : (q[4] === '' ? Infinity : Number(q[4])));
      i += q[0].length;
    }
    out.push(token);
  }
  return out;
}

/** The top-level alternatives of a token list. */
function alternatives(list) {
  const out = [[]];
  let depth = 0;
  for (const token of list) {
    if (token.type === 'open') depth += 1;
    if (token.type === 'close') depth -= 1;
    if (token.type === 'alt' && depth === 0) out.push([]);
    else out[out.length - 1].push(token);
  }
  return out;
}

const unbounded = (t) => t !== undefined && t.max === Infinity;
const isDotRun = (t) => t.type === 'atom' && t.text === '.' && unbounded(t);
const isBlankRun = (t) => t.type === 'atom' && t.text === '\\s' && unbounded(t);

/** The index of the first token at or after `j` that is not an unrepeated group closer. */
function pastClosers(alt, j) {
  let k = j;
  while (k < alt.length && alt[k].type === 'close' && !(alt[k].max > 1)) k += 1;
  return k;
}

/** The index of the last token at or before `j` that opens or closes no group. */
function beforeGroups(alt, j) {
  let k = j;
  while (k >= 0 && (alt[k].type === 'open' || (alt[k].type === 'close' && alt[k].max === undefined))) k -= 1;
  return k;
}

/** Shapes 1 and 2 at the dot run `i` of an alternative. */
function dotRunShape(alt, i, flags) {
  const next = pastClosers(alt, i + 1);
  const toEnd = next < alt.length && alt[next].type === 'end';
  if (toEnd && !/[ms]/u.test(flags)) {
    const before = beforeGroups(alt, i - 1);
    if (alt[0].type !== 'start') return 'a run of "." to the end in an unanchored pattern';
    if (before >= 0 && unbounded(alt[before])) return 'a run of "." to the end after a run that gives characters back';
  }
  // the runs after it, up to the end: each repeated without bound, a blank run among them
  let k = next;
  let blanks = false;
  while (k < alt.length && alt[k].type === 'atom' && unbounded(alt[k])) {
    blanks = blanks || isBlankRun(alt[k]);
    k = pastClosers(alt, k + 1);
  }
  return blanks && k < alt.length && alt[k].type === 'end' ? 'a run of "." and then runs of blanks to the end' : null;
}

/** Shape 3 at the group opener `i` of an alternative. */
function lineStartShape(alt, i) {
  const inner = alt.slice(i + 1, i + 4).map((t) => (t.type === 'atom' ? t.text : t.type)).join(' ');
  const close = alt[i + 4];
  if (!['start alt \\n', '\\n alt start'].includes(inner) || close === undefined || close.type !== 'close' || close.max !== undefined) return null;
  return alt[i + 5] !== undefined && isBlankRun(alt[i + 5]) ? 'the start or a line feed, then a run of blanks' : null;
}

/** Shape 4 for one alternative. */
function trimShape(alt) {
  if (alt.length === 0 || alt[0].type === 'start' || alt[alt.length - 1].type !== 'end') return null;
  const last = beforeGroups(alt, alt.length - 2);
  if (last < 0 || alt[last].type !== 'atom' || !unbounded(alt[last])) return null;
  const before = beforeGroups(alt, last - 1);
  return before < 0 || unbounded(alt[before]) ? 'an unanchored run to the end' : null;
}

/** The first known quadratic shape of a pattern, or null. */
function shapeOf(pattern, flags) {
  for (const alt of alternatives(tokens(pattern))) {
    for (let i = 0; i < alt.length; i += 1) {
      const found = (isDotRun(alt[i]) && dotRunShape(alt, i, flags)) || (alt[i].type === 'open' && lineStartShape(alt, i));
      if (found) return found;
    }
    const trim = trimShape(alt);
    if (trim) return trim;
  }
  return null;
}

// ------------------------------------------------------------------ the tests

test('the guard refuses each shape that was found slow, and passes the scans that replaced them', () => {
  const slow = [
    /^([A-Za-z][A-Za-z0-9_-]*):[ \t]*(.*)$/u, /^([A-Za-z0-9_.]+):[ \t]*(.*)$/u, /^#[ \t]+(.*)$/u,
    /\/+$/u, /(^|\n)\s*allowed-tools\s*:/u, /^\s{0,3}(`{3,}|~{3,})\s*(\S.*?)?\s*$/u,
    /^([a-z][a-z0-9_-]*):\s*(.*)$/u, /^###\s+(.+)$/u, /^(\d{4}-\d{2}-\d{2})(?:[^:\n]{0,60})?:\s+(.+)$/u,
    /\n+$/u, /\n*$/u, /[ \t]+$/u, /(?:\n|^)\s+x/u, /x(.*)$/u, /^(#{1,6})\s+(.+?)\s*#*\s*$/u, / +#+ *$/u,
  ];
  for (const re of slow) assert.notEqual(shapeOf(re.source, re.flags), null, String(re));
  const linear = [
    /^([A-Za-z][A-Za-z0-9_-]*):[ \t]*/u, /^#[ \t]+/u, /^\s{0,3}(`{3,}|~{3,})/u, /^###/u, /^## (.*)$/u,
    /^([a-z_]+): (.*)$/u, /^\*\*([^*]+)\*\*:\s?(.*)$/u, /^#\s+(.+)$/mu, /(?:^|\n)[ \t]*<!-- x -->/u,
    /\.([A-Za-z0-9]+)$/u, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u, /^".*"$/u, /\.md$/u, /[\r\u2028\u2029]/u,
  ];
  for (const re of linear) assert.equal(shapeOf(re.source, re.flags), null, String(re));
});

test('no regular-expression literal in src/ has a known quadratic shape outside the allow-list', () => {
  const found = literals();
  assert.ok(found.length > 300, `the scan read the literals of src/ (${found.length})`);
  const offenders = [];
  const used = new Set();
  for (const { file, flags, line, pattern } of found) {
    const shape = shapeOf(pattern, flags);
    if (shape === null) continue;
    const key = `${file}\t/${pattern}/${flags}`;
    if (ALLOW.has(key)) used.add(key);
    else offenders.push(`${file}:${line} /${pattern}/${flags}: ${shape}`);
  }
  assert.deepEqual(offenders, []);
  assert.deepEqual([...ALLOW.keys()].filter((key) => !used.has(key)), [], 'an allow-list entry names a literal that is gone');
});
