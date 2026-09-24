'use strict';
// ADAPTER — Clock over `process.env.SOURCE_DATE_EPOCH` (AGSC-04-09, AGSC-04-10).
// Only the application layer and bin/ may require an adapter; tests/arch enforces it.

/** A malformed SOURCE_DATE_EPOCH is AGSC-E603 and exit 2, never a Finding. */
class EpochError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EpochError';
    this.code = 'AGSC-E603';
    this.exitCode = 2;
  }
}

/**
 * AGSC-04-09: the ONE definition of a well-formed `SOURCE_DATE_EPOCH`, exported so
 * that the CLI's own pre-flight check and this adapter cannot disagree.
 *
 * Until today there were two: this module trimmed the value before testing it, while
 * `application/cli/main.js` tested `^[0-9]+$` against the raw string — so `" 12 "`
 * was accepted here and refused there, and `"007"` the other way round. The value is
 * "an integer number of seconds", so surrounding whitespace and a leading zero are
 * both malformed, and both paths now say the same thing.
 */
const EPOCH_RE = /^(0|[1-9][0-9]{0,17})$/u;

/**
 * Is `raw` an unusable `SOURCE_DATE_EPOCH`? An absent or EMPTY value is not
 * malformed — AGSC-04-09 falls back to the git history and then to 0.
 * @param {*} raw
 * @returns {boolean}
 */
function isMalformedEpoch(raw) {
  if (raw === undefined || raw === null || String(raw) === '') return false;
  const text = String(raw);
  return !EPOCH_RE.test(text) || !Number.isSafeInteger(Number(text));
}

/** Render an epoch-second instant as AGSC-04-10 requires: UTC, seconds precision. */
function toInstant(seconds) {
  return `${new Date(seconds * 1000).toISOString().slice(0, 19)}Z`;
}

/**
 * Build a Clock (see src/ports/clock.js).
 *
 * @param {{env?: object, lastCommitSeconds?: number|null}} [options]
 *   `lastCommitSeconds` is the git committer time the ProcessRunner read, if any.
 * @returns {{now: () => number, iso: () => string, findings: () => Array<object>}}
 * @throws {EpochError} AGSC-E603 when SOURCE_DATE_EPOCH is present but malformed.
 */
function createClock(options = {}) {
  const env = options.env || process.env;
  const raw = env.SOURCE_DATE_EPOCH;
  const findings = [];
  let seconds;

  if (raw !== undefined && raw !== null && String(raw) !== '') {
    const text = String(raw);
    if (isMalformedEpoch(text)) {
      throw new EpochError(`SOURCE_DATE_EPOCH "${raw}" is not an integer number of seconds (AGSC-04-09)`);
    }
    seconds = Number(text);
  } else if (typeof options.lastCommitSeconds === 'number') {
    seconds = options.lastCommitSeconds;
  } else {
    // AGSC-04-09: the drop-in flow of PRD-053 runs before `git init`.
    seconds = 0;
    findings.push({
      code: 'AGSC-E606',
      col: 1,
      file: '',
      line: 1,
      message: 'build instant defaulted to 0: no SOURCE_DATE_EPOCH and no git history (AGSC-04-09)',
      severity: 'warn',
    });
  }

  return {
    now: () => seconds,
    iso: () => toInstant(seconds),
    findings: () => findings.map((f) => ({ ...f })),
  };
}

/**
 * The committer time of the last commit, read through a ProcessRunner port — the
 * second source AGSC-04-09 names ("defaulting to the last commit time"). `null` when
 * there is no runner, no git, no repository, no commit, or anything but one clean
 * integer on stdout: the caller then falls through to 0 and the AGSC-E606 warning.
 * Never throws and never guesses.
 *
 * @param {{run?: Function}} [proc] a ProcessRunner (see src/ports/process-runner.js)
 * @returns {number|null}
 */
function readLastCommitSeconds(proc) {
  if (!proc || typeof proc.run !== 'function') return null;
  let result;
  try {
    result = proc.run('git', ['log', '-1', '--format=%ct']);
  } catch (e) {
    return null;
  }
  if (!result || result.code !== 0 || typeof result.stdout !== 'string') return null;
  const text = result.stdout.trim();
  if (!EPOCH_RE.test(text) || !Number.isSafeInteger(Number(text))) return null;
  return Number(text);
}

module.exports = { createClock, toInstant, EpochError, EPOCH_RE, isMalformedEpoch, readLastCommitSeconds };
