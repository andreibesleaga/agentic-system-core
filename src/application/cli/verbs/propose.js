'use strict';
// src/application/cli/verbs/propose.js — `propose <slug>` (AGSC-09-07).
//
// AGSC-08-04: it MUST write `dist/proposal/<n>.patch` and `dist/proposal/<n>.md`,
// print the commands a human must run, and perform NO network write. AGSC-08-05
// fixes the body: the marker `<!-- agsc:proposal v1 -->` followed by rationale,
// affected slugs and `prov.origin`.
//
// The change this engine can compute by itself is the item's CANONICAL form —
// the key order and the byte profile of AGSC-04-19/AGSC-04-07. When the item is
// already canonical the patch is empty, and the verb says so with a warning
// rather than reporting a Proposal that changes nothing.
//
// The unified diff is `diff@9.0.0` (jsdiff, BSD-3-Clause, no dependencies, no
// clock, no network): a patch format is a standard format, and D94 forbids
// reimplementing one. Owner: B (shell); wired at integration (WP-10-G).

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
    `Bring \`${item.path}\` to the canonical form of AGSC-04-19 and AGSC-04-07.`,
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
  const before = String(fs.readFile(item.path, 'utf8'));
  const after = canonicalItem(item);
  const number = nextNumber(fs);
  const patch = createTwoFilesPatch(`a/${item.path}`, `b/${item.path}`, before, after, '', '');

  fs.mkdirp(DIR);
  fs.writeFile(`${DIR}/${number}.patch`, patch);
  fs.writeFile(`${DIR}/${number}.md`, proposalBody(item, number));

  // AGSC-08-04: print the commands; perform none of them, and no network write.
  helpers.note(ctx, `wrote: ${DIR}/${number}.patch`);
  helpers.note(ctx, `wrote: ${DIR}/${number}.md`);
  helpers.note(ctx, `run: git apply ${DIR}/${number}.patch`);
  helpers.note(ctx, `run: git checkout -b proposal/${number} && git commit -a`);
  helpers.note(ctx, `run: open a pull request with the body of ${DIR}/${number}.md`);

  const findings = [];
  if (before === after) {
    findings.push({
      code: 'AGSC-E506',
      file: item.path,
      message: `the Proposal is empty: ${item.slug} is already in the canonical form of AGSC-04-19`,
      severity: 'warn',
      slug: item.slug,
    });
  }
  return { findings };
}

module.exports = { DIR, MARKER, name: 'propose', canonicalItem, nextNumber, proposalBody, run };
