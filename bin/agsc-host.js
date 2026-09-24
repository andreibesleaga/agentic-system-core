#!/usr/bin/env node
// bin/agsc-host.js — put a built node on a host: the hosting profiles, a read-only
// local server and the ledger anchor check (`src/application/hosting.js`). A command
// of its own, beside `agsc`, whose verb set AGSC-09-07 closes at sixteen.
'use strict';

const hosting = require('../src/application/hosting.js');
const { SPEC_VERSION } = require('../src/application/cli/main.js');

if (require.main === module) {
  // A reader that closes the pipe early (`agsc-host list | head -1`) is not an error:
  // stop quietly, as a Unix tool does, instead of printing an EPIPE stack trace.
  for (const stream of [process.stdout, process.stderr]) {
    stream.on('error', (e) => {
      if (e && e.code === 'EPIPE') process.exit(process.exitCode === undefined ? 0 : process.exitCode);
      throw e;
    });
  }
  hosting.main(process.argv.slice(2), {
    cwd: process.cwd(), specVersion: SPEC_VERSION, stderr: process.stderr, stdout: process.stdout,
  }).then((code) => { process.exitCode = code; }, (e) => {
    process.stderr.write(`agsc-host: internal error: ${e && e.stack ? e.stack : e}\n`);
    process.exitCode = 1;
  });
}
