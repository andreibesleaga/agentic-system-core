'use strict';
// tests/knowledge/runblocks.test.js — AGSC-02-22's executable info strings and the
// pairing and comparison AGSC-09-94 defines over them. Pure; nothing is executed.

const test = require('node:test');
const assert = require('node:assert');

const runblocks = require('../../src/knowledge/runblocks.js');

const procedure = (body) => ({ body, path: 'content/procedures/p.md', slug: 'p', type: 'procedure' });

test('CommonMark 0.31.2 §4.5: fences are found with their info string and their line', () => {
  const blocks = runblocks.fences('intro\n\n```run\necho a\n```\n\n~~~expect\na\n~~~\n');
  assert.deepStrictEqual(blocks.map((b) => [b.info, b.line]), [['run', 3], ['expect', 7]]);
  assert.strictEqual(blocks[0].text, 'echo a\n');
  // A longer fence closes only on one at least as long.
  const wide = runblocks.fences('````run\n```\n````\n');
  assert.strictEqual(wide[0].text, '```\n');
  // An unterminated fence still yields what it opened.
  assert.deepStrictEqual(runblocks.fences('```run\necho a\n').map((b) => b.info), ['run']);
  // A backtick in the info string is not a fence opener (CommonMark), so the ```
  // three lines later is read as the opener of an unterminated block instead.
  assert.deepStrictEqual(runblocks.fences('```a`b\nx\n```\n').map((b) => [b.info, b.line]),
    [['', 3]]);
});

test('AGSC-02-22: ONE spelling of the info string, and the braced form runs nothing', () => {
  // CHANGED at rc.6 (ENG5-S7): AGSC-09-94 used to write `{run}`/`{expect}` while
  // AGSC-02-22, the rule that owns the item, writes `run`/`expect`. The reader
  // accepted both rather than guess. The rules now agree, and a fence this engine
  // ran while another did not would be a divergence in the worst possible place.
  assert.deepStrictEqual([...runblocks.RUN_INFO], ['run']);
  assert.deepStrictEqual([...runblocks.EXPECT_INFO], ['expect']);
  const braces = runblocks.steps(procedure('```{run}\necho a\n```\n\n```{expect}\na\n```\n'),
    { allow: ['echo'] });
  assert.deepStrictEqual(braces.steps, []);
  const plain = runblocks.steps(procedure('```run\necho a\n```\n\n```expect\na\n```\n'),
    { allow: ['echo'] });
  assert.strictEqual(plain.steps.length, 1);
  assert.strictEqual(plain.steps[0].info, 'run');
  assert.strictEqual(plain.steps[0].expected, 'a\n');
});

test('AGSC-02-22: the info strings are permitted on a procedure only', () => {
  const wrong = runblocks.steps({ ...procedure('```run\necho a\n```\n'), type: 'concept' },
    { allow: ['echo'] });
  assert.deepStrictEqual(wrong.steps, []);
  assert.strictEqual(wrong.findings[0].code, 'AGSC-E205');
  assert.match(wrong.findings[0].message, /AGSC-02-22/u);
});

test('AGSC-09-94: each run block is paired with the block that IMMEDIATELY follows it', () => {
  const parsed = runblocks.steps(procedure(
    '```run\necho a\n```\n\n```expect\na\n```\n\n```run\necho b\n```\n\nprose\n\n```expect\nb\n```\n',
  ), { allow: ['echo'] });
  assert.strictEqual(parsed.steps.length, 2);
  assert.strictEqual(parsed.steps[0].expected, 'a\n');
  // "Immediately following" is read over BLOCKS, not over lines: prose between the
  // two fences does not break the pairing, and nothing else could, since a fenced
  // block is the only thing the rule speaks about.
  assert.strictEqual(parsed.steps[1].expected, 'b\n');

  // A run block that is followed by no expect block at all is a WARNING: the rule
  // has nothing to compare with, and that is a fact about the item, not a failure.
  const alone = runblocks.steps(procedure('```run\necho a\n```\n'), { allow: ['echo'] });
  assert.strictEqual(alone.steps[0].expected, null);
  const warn = alone.findings.find((f) => f.code === 'AGSC-E406');
  assert.strictEqual(warn.severity, 'warn');
});

test('AGSC-09-94: a program outside run.allow[] is refused, and the refusal names the list', () => {
  const refused = runblocks.steps(procedure('```run\nrm -rf /\n```\n'), { allow: ['echo'] });
  assert.strictEqual(refused.steps[0].commands[0].allowed, false);
  const one = refused.findings.find((f) => f.code === 'AGSC-E203');
  assert.match(one.message, /"rm" is not in run\.allow\[\]/u);
  assert.match(one.message, /echo/u);
  // An empty allow-list says so rather than printing nothing.
  assert.match(runblocks.steps(procedure('```run\nrm\n```\n'), {}).findings[0].message, /which is empty/u);
});

test('AGSC-09-94: a line only a shell could honour is refused, and the character is named', () => {
  for (const [line, why] of [['a | b', 'pipe'], ['a > f', 'redirection'], ['echo $HOME', 'variable expansion'],
    ['echo `x`', 'command substitution'], ['echo "x"', 'quoting'], ['a; b', 'command separator'],
    ['echo *', 'glob'], ['echo ~', 'home expansion'], ['a && b', 'background or and-list'],
    ['a\\b', 'escape'], ['echo {a}', 'brace expansion'], ['a (b)', 'subshell'],
    ['echo !', 'history expansion'], ["echo 'x'", 'quoting'], ['echo ?', 'glob']]) {
    const parsed = runblocks.command(line);
    assert.strictEqual(parsed.program, '', line);
    assert.match(String(parsed.refusal), new RegExp(why.replace(/[()]/gu, '\\$&'), 'u'), line);
  }
  assert.strictEqual(runblocks.command('   ').refusal, 'the line is empty');
  assert.deepStrictEqual(runblocks.command('  node  --test  x '),
    { args: ['--test', 'x'], program: 'node', refusal: null });
});

test('an empty line inside a run block is skipped, not refused', () => {
  const parsed = runblocks.steps(procedure('```run\necho a\n\necho b\n```\n'), { allow: ['echo'] });
  assert.strictEqual(parsed.steps[0].commands.length, 2);
});

test('a procedure with no run block yields no step and no finding', () => {
  const parsed = runblocks.steps(procedure('# p\n\nJust prose.\n'), { allow: [] });
  assert.deepStrictEqual(parsed.steps, []);
  assert.deepStrictEqual(parsed.findings, []);
});

test('AGSC-09-94: the comparison ignores the trailing newline and CRLF, nothing else', () => {
  assert.ok(runblocks.matches('a\n', 'a'));
  assert.ok(runblocks.matches('a\r\nb\n\n', 'a\nb'));
  assert.ok(!runblocks.matches('a', 'b'));
  assert.ok(runblocks.matches(undefined, ''));
  assert.ok(!runblocks.matches(' a', 'a'), 'leading whitespace is data, not noise');
});

test('a shell-only line inside a run block is refused by steps(), not only by command()', () => {
  const parsed = runblocks.steps(procedure('```run\necho a | grep a\necho b\n```\n'),
    { allow: ['echo'] });
  const refusal = parsed.findings.find((f) => f.code === 'AGSC-E203' && /pipe/u.test(f.message));
  assert.ok(refusal, JSON.stringify(parsed.findings));
  assert.strictEqual(refusal.line, 1, 'the finding names the block, not the file');
  // The refused line contributes no command; the legal one still does.
  assert.deepStrictEqual(parsed.steps[0].commands.map((c) => c.program), ['echo']);
});
