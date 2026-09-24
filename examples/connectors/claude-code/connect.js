#!/usr/bin/env node
'use strict';
// examples/connectors/claude-code/connect.js — wire a published Bundle into a
// project that Claude Code works in. RUN BY THE TEST SUITE
// (tests/connectors/examples.test.js).
//
//   node connect.js <bundle-dir> <project-dir>
//
// What it writes into <project-dir>, and why each path:
//
//   .agsc/CLAUDE.md            the `claude` steer target (AGSC-01-28): NOW state and
//                              the node's concepts, procedures, gates and lessons.
//   .agsc/llms-ctx.txt         the `llm-context` skim view (AGSC-01-26a), one
//   .agsc/chunks-index.toon    labelled section per chunk, prose fenced as data.
//   CLAUDE.md                  ONLY IF ABSENT: one `@.agsc/CLAUDE.md` import line.
//                              Claude Code expands `@path` imports in a CLAUDE.md
//                              ("with a maximum depth of four hops",
//                              code.claude.com/docs/en/memory, read 2026-09-23). An
//                              existing CLAUDE.md is never touched: add the line
//                              yourself.
//   .claude/skills/<pack>/     the node's skill packs (AGSC-07-19…21), each file
//                              checked against the lockfile before it is copied.
//   .claude/agsc-recall.js     a hook script that prints the sections of
//                              llms-ctx.txt most related to the user's prompt.
//   .claude/settings.agsc.json the hook wiring, as a SEPARATE file for you to merge
//                              into .claude/settings.json (never written over yours).
//
// Instruction files are "context, not enforced configuration" in Anthropic's own
// words; to block an action use a hook, which is what a Gate compiles to.

const fs = require('node:fs');
const path = require('node:path');
const { agsc, argsOf, copy, copySkills, writeIfAbsent } = require('../_run.js');

function connect(bundle, project) {
  agsc(bundle, ['export', '--steer', '--target', 'claude']);
  agsc(bundle, ['export', '--to', 'llm-context']);
  agsc(bundle, ['skills']);

  const out = path.join(bundle, 'dist', 'export');
  const written = [
    copy(path.join(out, 'steer', 'CLAUDE.md'), path.join(project, '.agsc', 'CLAUDE.md')),
    copy(path.join(out, 'llm-context', 'llms-ctx.txt'), path.join(project, '.agsc', 'llms-ctx.txt')),
    copy(path.join(out, 'llm-context', 'chunks-index.toon'), path.join(project, '.agsc', 'chunks-index.toon')),
    copy(path.join(__dirname, 'agsc-recall.js'), path.join(project, '.claude', 'agsc-recall.js')),
    copy(path.join(__dirname, 'settings.example.json'), path.join(project, '.claude', 'settings.agsc.json')),
  ];
  const created = writeIfAbsent(path.join(project, 'CLAUDE.md'), '@.agsc/CLAUDE.md\n');
  const packs = copySkills(bundle, path.join(project, '.claude', 'skills'));
  return { created, packs, written };
}

if (require.main === module) {
  const { bundle, project } = argsOf(process.argv, 'node connect.js <bundle-dir> <project-dir>');
  fs.mkdirSync(project, { recursive: true });
  const result = connect(bundle, project);
  for (const at of result.written) process.stdout.write(`wrote ${path.relative(project, at)}\n`);
  for (const pack of result.packs) process.stdout.write(`skill .claude/skills/${pack}/\n`);
  process.stdout.write(result.created ? 'wrote CLAUDE.md (one import line)\n'
    : 'CLAUDE.md exists and was not touched: add the line @.agsc/CLAUDE.md to it\n');
}

module.exports = { connect };
