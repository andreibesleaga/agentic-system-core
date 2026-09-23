#!/usr/bin/env node
'use strict';
// examples/connectors/cursor/connect.js — wire a published Bundle into a project
// that Cursor works in. RUN BY THE TEST SUITE (tests/connectors/examples.test.js).
//
//   node connect.js <bundle-dir> <project-dir>
//
// "Project rules live in `.cursor/rules` as `.mdc` files and are version-controlled."
// Frontmatter: `description`, `globs`, `alwaysApply`; "Keep rules under 500 lines"
// (cursor.com/docs/context/rules, read 2026-09-23). The `cursor` steer target
// writes `.cursor/rules/agsc.mdc`; this script copies it into the project (replacing
// only its own earlier copy, never another rule) and reports its line count
// against that guidance. For live search and reading, add the node's MCP server
// as docs/USING-WITH-ASSISTANTS.md shows for Cursor.

const fs = require('node:fs');
const path = require('node:path');
const { agsc, argsOf, copy } = require('../_run.js');

const LINE_GUIDANCE = 500;

function connect(bundle, project) {
  agsc(bundle, ['export', '--steer', '--target', 'cursor']);
  const rule = copy(path.join(bundle, 'dist', 'export', 'steer', '.cursor', 'rules', 'agsc.mdc'),
    path.join(project, '.cursor', 'rules', 'agsc.mdc'));
  const lines = fs.readFileSync(rule, 'utf8').split('\n').length - 1;
  return { lines, rule, withinGuidance: lines <= LINE_GUIDANCE };
}

if (require.main === module) {
  const { bundle, project } = argsOf(process.argv, 'node connect.js <bundle-dir> <project-dir>');
  fs.mkdirSync(project, { recursive: true });
  const result = connect(bundle, project);
  process.stdout.write(`wrote .cursor/rules/agsc.mdc (${result.lines} lines;`
    + ` Cursor's guidance is under ${LINE_GUIDANCE})\n`);
}

module.exports = { LINE_GUIDANCE, connect };
