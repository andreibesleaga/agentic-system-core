'use strict';
/**
 * CONTEXT Knowledge — the executable fenced blocks of AGSC-02-22, and the pairing
 * and comparison AGSC-09-94 defines over them. PURE: this module reads a body and
 * returns records; it never spawns anything.
 *
 * AGSC-02-22: "`run` and `expect` are the only executable info strings; they are
 * permitted on `procedure` items only and have effect only under the opt-in `run`
 * verb of AGSC-09-94." AGSC-09-94: "`run <slug>` executes the fenced blocks of a
 * Procedure whose info string is `{run}` and compares each captured result with the
 * immediately following `{expect}` block."
 *
 * TWO SPELLINGS ARE ACCEPTED, and the reason is recorded as a specification item
 * (ENG5-S7): AGSC-09-94 writes the info string as `{run}` and AGSC-02-22 writes it
 * as `run`, so a Bundle author cannot tell from the specification whether the fence
 * reads ```` ```run ```` or ```` ```{run} ````. This reader accepts either and
 * reports which spelling it saw, so that whichever the rule settles on, no authored
 * Bundle silently stops executing.
 *
 * NO SHELL, SO NO SHELL GRAMMAR. AGSC-09-94 requires execution "with no network, no
 * shell interpolation, a scrubbed environment and a timeout". A line is therefore
 * split on runs of whitespace into a program and its arguments, and a line carrying
 * a character that only a shell could interpret — `|`, `&`, `;`, `<`, `>`, `$`,
 * a backtick, `(`, `)`, `{`, `}`, `*`, `?`, `~`, `!`, `\`, `'` or `"` — is REFUSED
 * rather than passed through, because passing it through would hand the child a
 * literal `|` that the author meant as a pipe. The refusal names the character.
 *
 * Rules: AGSC-02-22, AGSC-09-94. Owner: ENG-5 (WP-12).
 */

const { finding } = require('./validate.js');

/** The two executable info strings, in both spellings the rules use. */
const RUN_INFO = Object.freeze(['run', '{run}']);
const EXPECT_INFO = Object.freeze(['expect', '{expect}']);

/** A character no shell-free executor can honour, with the name a person reads. */
const SHELL_CHARACTERS = Object.freeze({
  '!': 'history expansion',
  '"': 'quoting',
  $: 'variable expansion',
  '&': 'background or and-list',
  "'": 'quoting',
  '(': 'subshell',
  ')': 'subshell',
  '*': 'glob',
  ';': 'command separator',
  '<': 'redirection',
  '>': 'redirection',
  '?': 'glob',
  '\\': 'escape',
  '`': 'command substitution',
  '{': 'brace expansion',
  '|': 'pipe',
  '}': 'brace expansion',
  '~': 'home expansion',
});

/**
 * Every fenced block of a body, in document order, with its info string.
 *
 * The fence grammar is CommonMark 0.31.2 §4.5's: three or more backticks or
 * tildes, closed by at least as many of the same character.
 *
 * @param {string} body
 * @returns {Array<{info:string, line:number, text:string}>}
 */
function fences(body) {
  const lines = String(body == null ? '' : body).split('\n');
  const out = [];
  let open = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (open === null) {
      const start = /^\s{0,3}(`{3,}|~{3,})\s*(\S.*?)?\s*$/u.exec(line);
      if (start === null) continue;
      if (start[1].startsWith('`') && (start[2] || '').includes('`')) continue;
      open = { fence: start[1], info: (start[2] || '').trim(), line: i + 1, text: [] };
      continue;
    }
    const close = new RegExp(`^\\s{0,3}${open.fence[0] === '`' ? '`' : '~'}{${open.fence.length},}\\s*$`, 'u');
    if (close.test(line)) {
      out.push({ info: open.info, line: open.line, text: `${open.text.join('\n')}\n` });
      open = null;
      continue;
    }
    open.text.push(line);
  }
  if (open !== null) out.push({ info: open.info, line: open.line, text: `${open.text.join('\n')}\n` });
  return out;
}

/**
 * One `{run}` line as a program and its arguments, or a refusal.
 *
 * @param {string} line
 * @returns {{args:Array<string>, program:string, refusal:(string|null)}}
 */
function command(line) {
  const text = String(line).trim();
  for (const [character, why] of Object.entries(SHELL_CHARACTERS)) {
    if (text.includes(character)) {
      return {
        args: [], program: '',
        refusal: `the line carries ${JSON.stringify(character)} (${why}), and AGSC-09-94 forbids`
          + ' shell interpolation, so it can only be passed to the program literally',
      };
    }
  }
  const tokens = text.split(/\s+/u).filter((token) => token !== '');
  if (tokens.length === 0) return { args: [], program: '', refusal: 'the line is empty' };
  return { args: tokens.slice(1), program: tokens[0], refusal: null };
}

/**
 * The `{run}` steps of one Procedure, each with the `{expect}` block that
 * immediately follows it (AGSC-09-94) and the allow-list verdict (`run.allow[]`).
 *
 * @param {object} item the item, flattened `{body, slug, type, path}`.
 * @param {object} options `{allow: string[]}` from `agsc.config.json`.
 * @returns {{findings:Array<object>, steps:Array<object>}}
 */
function steps(item, options = {}) {
  const findings = [];
  const file = String(item.path == null ? '' : item.path);
  if (String(item.type) !== 'procedure') {
    findings.push(finding('AGSC-E205',
      `${item.slug} is a ${item.type}; AGSC-02-22 permits the run and expect info strings on`
      + ' procedure items only', { file, severity: 'error' }));
    return { findings, steps: [] };
  }
  const allow = (Array.isArray(options.allow) ? options.allow : []).map(String);
  const blocks = fences(item.body);
  const out = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (!RUN_INFO.includes(block.info)) continue;
    const next = blocks[i + 1];
    const expected = next !== undefined && EXPECT_INFO.includes(next.info) ? next.text : null;
    const commands = [];
    for (const line of block.text.split('\n')) {
      if (line.trim() === '') continue;
      const parsed = command(line);
      if (parsed.refusal !== null) {
        findings.push(finding('AGSC-E203',
          `${item.slug}: ${parsed.refusal} (AGSC-09-94)`,
          { file, line: block.line, severity: 'error' }));
        continue;
      }
      // AGSC-09-94: "Execution MUST be refused unless the command's program name is
      // listed in `run.allow[]`." §9.4 registers no code for that refusal; the
      // closest registered row is AGSC-E203, "value outside enum or `tags.allowed`",
      // whose rule (AGSC-01-21) is the same shape of closed operator list. The
      // missing registration is the specification item ENG5-S8.
      const allowed = allow.includes(parsed.program);
      if (!allowed) {
        findings.push(finding('AGSC-E203',
          `${item.slug}: the program ${JSON.stringify(parsed.program)} is not in run.allow[]`
          + ` (${allow.length === 0 ? 'which is empty' : allow.join(', ')}), so AGSC-09-94 refuses it`,
          { file, line: block.line, severity: 'error' }));
      }
      commands.push({ allowed, args: parsed.args, program: parsed.program });
    }
    if (expected === null) {
      findings.push(finding('AGSC-E406',
        `${item.slug}: the run block at line ${block.line} is followed by no expect block, so`
        + ' AGSC-09-94 has nothing to compare its result with',
        { file, line: block.line, severity: 'warn' }));
    }
    out.push({ commands, expected, info: block.info, line: block.line, ordinal: out.length + 1 });
  }
  return { findings, steps: out };
}

/**
 * AGSC-09-94's comparison: the captured result against the `{expect}` block.
 * Both sides are compared after AGSC-04-19's trailing-newline normalisation, so a
 * missing final newline in an authored fence is not a failure.
 *
 * @param {string} captured
 * @param {string} expected
 * @returns {boolean}
 */
function matches(captured, expected) {
  const trim = (text) => String(text == null ? '' : text).replace(/\r\n/gu, '\n').replace(/\n+$/u, '');
  return trim(captured) === trim(expected);
}

module.exports = { EXPECT_INFO, RUN_INFO, SHELL_CHARACTERS, command, fences, matches, steps };
