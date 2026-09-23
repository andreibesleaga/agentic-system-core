#!/usr/bin/env node
// `agsc` — the short command name for the AgenticSystemCore engine.
//
// This package is an ALIAS: it carries no engine of its own, depends on
// `agentic-system-core` at the exact same version, and hands it this process's
// argv untouched, so every verb, every flag and every exit code is the engine's
// (AGSC-09-07..12). One implementation, two command names.
//
// It must CALL the engine, not merely load it: `bin/agsc.js` guards its own
// auto-run behind `require.main === module`, and under this wrapper that test is
// false — so a bare `require(…)` of it loaded the CLI and ran nothing, and
// `agsc --version` printed an empty line and exited 0. `bin/agentic-system-core`
// in the engine has always invoked `run()` explicitly; this does the same.
'use strict';

let agsc;
try {
  // eslint-disable-next-line import/no-extraneous-dependencies
  agsc = require('agentic-system-core/bin/agsc.js');
} catch (e) {
  process.stderr.write('agsc: the engine package `agentic-system-core` is not installed beside'
    + ' this alias. Install them together (`npm install agsc-cli`), or run the engine\'s own'
    + ' `agsc` command.\n');
  process.exit(1);
}

agsc.run().catch((e) => {
  process.stderr.write(`agsc: internal error: ${e && e.stack ? e.stack : e}\n`);
  process.exitCode = 1;
});
