'use strict';
// PORT (hexagonal boundary) — ProcessRunner.
// JSDoc interface only. Used for ONE thing at 1.0: reading `git log` so that the
// ledger derivation of AGSC-08-20a and the build instant of AGSC-04-09 have an
// input. The opt-in `run` verb (AGSC-09-94) uses it too, under its own allow-list.
// An implementation MUST NOT interpolate a shell, MUST scrub the environment and
// MUST apply a timeout.

/**
 * @typedef {object} ProcessRunner
 * @property {(cmd: string, args: string[], options?: object) => ({code: number, stdout: string, stderr: string})} run
 */

module.exports = {};
