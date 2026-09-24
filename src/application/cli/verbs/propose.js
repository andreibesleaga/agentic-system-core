'use strict';
// src/application/cli/verbs/propose.js — `propose <slug>` (AGSC-09-07).
//
// AGSC-08-04: it MUST write `dist/proposal/<n>.patch` and `dist/proposal/<n>.md`,
// print the commands a human must run, and perform NO network write. AGSC-08-05
// fixes the body: the marker `<!-- agsc:proposal v1 -->` followed by rationale,
// affected slugs and `prov.origin`.
//
// The change is the person's: the patch runs from the COMMITTED version of the
// item's file (`git show HEAD:./<path>` through the ProcessRunner port; nothing,
// for a file the last commit does not hold) to the CANONICAL form of the working
// file — the key order and the byte profile of AGSC-04-19/AGSC-04-07 — so an
// edited item is proposed with its edit. With no repository (no runner, no git,
// no commit) the only change the engine can compute is the canonical form of the
// working file itself, and the patch runs from the working bytes. When the patch
// is empty the verb says so with a warning and prints no command that would fail.
//
// The unified diff is `diff@9.0.0` (jsdiff, BSD-3-Clause, no dependencies, no
// clock, no network): a patch format is a standard format, and the library rule forbids
// reimplementing one.

const { createTwoFilesPatch } = require('diff');
const adopt = require('../../../knowledge/adopt.js');
const helpers = require('./_helpers.js');

const DIR = 'dist/proposal';
/** AGSC-08-05: the marker a Proposal body MUST carry. */
const MARKER = '<!-- agsc:proposal v1 -->';

/** The next free Proposal number under `dist/proposal/` (1-based, no gaps reused). */
function nextNumber(fs) {
  let n = 1;
  while (fs.exists(`${DIR}/${n}.md`)) n += 1;
  return n;
}

/** AGSC-04-19 + AGSC-04-07: the canonical bytes of one item. */
function canonicalItem(item) {
  const body = String(item.body == null ? '' : item.body).split('\r\n').join('\n');
  return `${adopt.serialize(item.frontmatter)}${body.replace(/\n*$/u, '\n')}`.normalize('NFC');
}

/** AGSC-08-05: the pull-request body. */
function proposalBody(item, number) {
  const prov = (item.frontmatter && item.frontmatter.prov) || {};
  return [
    MARKER,
    '',
    `# Proposal ${number}`,
    '',
    '## Rationale',
    '',
    `The change to \`${item.path}\` against its committed version, in the canonical form of AGSC-04-19 and AGSC-04-07.`,
    '',
    '## Affected slugs',
    '',
    `- ${item.slug}`,
    '',
    '## Provenance',
    '',
    `- prov.origin: ${prov.origin === undefined ? '(absent)' : prov.origin}`,
    `- prov.operator: ${prov.operator === undefined ? '(absent)' : prov.operator}`,
    '',
  ].join('\n');
}

function run(ctx) {
  const wanted = (ctx.argv || [])[0];
  if (wanted === undefined) {
    return { status: 'fail', findings: [{ code: 'AGSC-E003', message: 'propose requires <slug>', severity: 'error' }] };
  }
  const bundle = helpers.bundleOf(ctx);
  const item = bundle.byslug.get(String(wanted));
  if (item === undefined) {
    return {
      status: 'fail',
      findings: [{ code: 'AGSC-E301', message: `no item with slug "${wanted}" in this Bundle`, severity: 'error' }],
    };
  }

  const fs = ctx.ports.fs;
  const working = String(fs.readFile(item.path, 'utf8'));
  const after = canonicalItem(item);
  const committed = committedText(ctx, item.path);
  const before = committed === undefined ? working : committed.text;
  const number = nextNumber(fs);
  const oldName = committed !== undefined && committed.text === '' && !committed.present ? '/dev/null' : `a/${item.path}`;
  const patch = createTwoFilesPatch(oldName, `b/${item.path}`, before, after, '', '');

  fs.mkdirp(DIR);
  fs.writeFile(`${DIR}/${number}.patch`, patch);
  fs.writeFile(`${DIR}/${number}.md`, proposalBody(item, number));

  // AGSC-08-04: print the commands; perform none of them, and no network write.
  helpers.note(ctx, `wrote: ${DIR}/${number}.patch`);
  helpers.note(ctx, `wrote: ${DIR}/${number}.md`);
  const findings = [];
  if (before === after) {
    findings.push({
      code: 'AGSC-E506',
      file: item.path,
      message: committed === undefined
        ? `the Proposal is empty: ${item.slug} is already in the canonical form of AGSC-04-19`
        : `the Proposal is empty: ${item.path} is the same as in the last commit, in the canonical form of AGSC-04-19`,
      severity: 'warn',
      slug: item.slug,
    });
    return { findings };
  }
  for (const line of commandsFor(item.path, number, { committed: committed !== undefined, canonical: working === after })) {
    helpers.note(ctx, `run: ${line}`);
  }
  return { findings };
}

/**
 * The committed text of one file: `{text, present}` from `git show HEAD:./<path>`
 * (the `./` resolves the path against the Bundle root, which may be a directory
 * inside the repository), `{text: '', present: false}` for a file the last commit
 * does not hold, and `undefined` when there is no runner, no repository or no
 * commit — the caller then diffs against the working bytes.
 *
 * @param {object} ctx the verb context.
 * @param {string} at the Bundle-relative path.
 * @returns {{text:string, present:boolean}|undefined}
 */
function committedText(ctx, at) {
  const proc = ctx.ports && ctx.ports.proc;
  if (!proc || typeof proc.run !== 'function') return undefined;
  const ask = (args) => {
    try {
      return proc.run('git', args);
    } catch (e) {
      return null;
    }
  };
  const head = ask(['rev-parse', '--verify', '--quiet', 'HEAD']);
  if (!head || head.code !== 0) return undefined;
  const shown = ask(['-c', 'core.quotepath=off', 'show', `HEAD:./${at}`]);
  if (!shown || shown.code !== 0 || typeof shown.stdout !== 'string') return { present: false, text: '' };
  return { present: true, text: shown.stdout };
}

/**
 * The commands a person runs (AGSC-08-04). With history, the working tree already
 * carries the change, so no `git apply` is printed: the person commits the file
 * (after `agsc lint --fix` when it is not yet in the canonical form the patch
 * carries). Without history the patch runs from the working bytes and applies to
 * them.
 */
function commandsFor(at, number, { committed, canonical }) {
  const out = [];
  if (committed) {
    if (!canonical) out.push('agsc lint --fix');
    out.push(`git checkout -b proposal/${number}`, `git add ${at} && git commit`);
  } else {
    out.push(`git apply ${DIR}/${number}.patch`, `git checkout -b proposal/${number} && git commit -a`);
  }
  out.push(`open a pull request with the body of ${DIR}/${number}.md`);
  return out;
}

module.exports = { DIR, MARKER, name: 'propose', canonicalItem, commandsFor, nextNumber, run };
