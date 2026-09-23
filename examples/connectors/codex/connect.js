#!/usr/bin/env node
'use strict';
// examples/connectors/codex/connect.js — wire a published Bundle into a project
// that Codex works in. RUN BY THE TEST SUITE (tests/connectors/examples.test.js).
//
//   node connect.js <bundle-dir> <project-dir>
//
// Codex "reads `AGENTS.override.md` if it exists. Otherwise, Codex reads
// `AGENTS.md`." (learn.chatgpt.com/docs/agent-configuration/agents-md, read
// 2026-09-23). The two steer targets are therefore used for two different jobs:
//
//   AGENTS.md            the `agents` target — ONLY IF ABSENT. It is read by Codex,
//                        Cursor, Copilot and Claude Code alike, so a project that
//                        already has one keeps it.
//   AGENTS.override.md   the `codex` target — Codex-only (Claude Code explicitly does
//                        not read it). Written ONLY IF ABSENT too, because an
//                        override file REPLACES the project's AGENTS.md for Codex:
//                        use it when the node's steering should win for Codex.
//
// Budget: Codex "stops adding files once the combined size reaches the limit
// defined by `project_doc_max_bytes` (32 KiB by default)". The script prints the
// size so the operator can see how much of that budget the node takes.

const fs = require('node:fs');
const path = require('node:path');
const { agsc, argsOf, writeIfAbsent } = require('../_run.js');

const CODEX_BUDGET = 32 * 1024;

function connect(bundle, project, options = {}) {
  agsc(bundle, ['export', '--steer', '--target', 'agents,codex']);
  const steer = path.join(bundle, 'dist', 'export', 'steer');
  const agents = fs.readFileSync(path.join(steer, 'AGENTS.md'), 'utf8');
  const override = fs.readFileSync(path.join(steer, 'AGENTS.override.md'), 'utf8');
  const wrote = [];
  if (writeIfAbsent(path.join(project, 'AGENTS.md'), agents)) wrote.push('AGENTS.md');
  if (options.override === true && writeIfAbsent(path.join(project, 'AGENTS.override.md'), override)) {
    wrote.push('AGENTS.override.md');
  }
  return { bytes: Buffer.byteLength(agents, 'utf8'), budget: CODEX_BUDGET, wrote };
}

if (require.main === module) {
  const { bundle, project } = argsOf(process.argv, 'node connect.js <bundle-dir> <project-dir> [--override]');
  fs.mkdirSync(project, { recursive: true });
  const result = connect(bundle, project, { override: process.argv.includes('--override') });
  for (const at of result.wrote) process.stdout.write(`wrote ${at}\n`);
  process.stdout.write(`steering takes ${result.bytes} of Codex's ${result.budget}-byte default budget\n`);
}

module.exports = { CODEX_BUDGET, connect };
