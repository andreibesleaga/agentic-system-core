'use strict';
// ADAPTER — ProcessRunner over `node:child_process`, no shell.
// The only 1.0 caller is the git-log read behind AGSC-08-20a and AGSC-04-09; the
// opt-in `run` verb (AGSC-09-94) adds its own allow-list on top of this port.
// Security: `execFileSync`, never `exec`; no shell interpolation; a scrubbed
// environment; a timeout; output capped.

const { execFileSync } = require('node:child_process');

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_BUFFER = 8 * 1024 * 1024;
/** The environment a child is allowed to see; nothing else is inherited. */
const SCRUBBED_ENV = Object.freeze(['PATH', 'HOME', 'LANG', 'LC_ALL', 'SOURCE_DATE_EPOCH', 'SystemRoot']);

/**
 * Build a ProcessRunner port (see src/ports/process-runner.js).
 * @param {{cwd?: string, env?: object, timeoutMs?: number}} [options]
 */
function createProcessRunner(options = {}) {
  const parentEnv = options.env || process.env;
  const env = {};
  for (const name of SCRUBBED_ENV) if (parentEnv[name] !== undefined) env[name] = parentEnv[name];

  return {
    // AGSC-09-94 (ENG-5, rc.5): this adapter does NOT isolate a child from the
    // network — `execFileSync` cannot — so it never claims to. `agsc run` reads
    // this and refuses to execute rather than run a step under a guarantee the
    // engine cannot make. See `src/ports/process-runner.js`.
    isolated: false,
    run(cmd, args = [], runOptions = {}) {
      if (typeof cmd !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(cmd)) {
        return { code: 2, stdout: '', stderr: `refused program name: ${cmd}` };
      }
      try {
        const stdout = execFileSync(cmd, args, {
          cwd: runOptions.cwd || options.cwd || process.cwd(),
          env,
          encoding: 'utf8',
          // AGSC-09-10: under `--json` stderr carries ONE JSON object per line.
          // A child's own error text is not a Finding of this engine, so it is
          // CAPTURED, never inherited — an inherited `fatal: not a git
          // repository` would corrupt the diagnostic stream (WP-10-G).
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: runOptions.timeoutMs || options.timeoutMs || DEFAULT_TIMEOUT_MS,
          maxBuffer: DEFAULT_MAX_BUFFER,
          shell: false,
          windowsHide: true,
        });
        return { code: 0, stdout, stderr: '' };
      } catch (e) {
        return {
          code: typeof e.status === 'number' ? e.status : 1,
          stdout: e.stdout == null ? '' : String(e.stdout),
          stderr: e.stderr == null ? String(e.message) : String(e.stderr),
        };
      }
    },
  };
}

module.exports = { createProcessRunner, SCRUBBED_ENV, DEFAULT_TIMEOUT_MS };
