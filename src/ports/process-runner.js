'use strict';
// PORT (hexagonal boundary) — ProcessRunner.
// JSDoc interface only. Used for ONE thing at 1.0: reading `git log` so that the
// ledger derivation of AGSC-08-20a and the build instant of AGSC-04-09 have an
// input. The opt-in `run` verb (AGSC-09-94) uses it too, under its own allow-list.
// An implementation MUST NOT interpolate a shell, MUST scrub the environment and
// MUST apply a timeout.

/**
 * `isolated` is the runner's own declaration that a child it spawns CANNOT reach
 * the network (added at rc.5 by ENG-5 for AGSC-09-94, whose executor "MUST run with
 * no network"). A Node process cannot give a child that guarantee from inside
 * itself; only an OS sandbox on the host can, so the guarantee is declared by the
 * adapter the host wires and is never inferred. `agsc run` executes only against a
 * runner that declares it; absent or `false` means "not isolated", which is what
 * the adapter in this distribution is.
 *
 * @typedef {object} ProcessRunner
 * @property {(cmd: string, args: string[], options?: object) => ({code: number, stdout: string, stderr: string})} run
 * @property {boolean} [isolated] true only when a child cannot reach the network.
 */

module.exports = {};
