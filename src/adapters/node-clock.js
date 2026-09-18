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
    const text = String(raw).trim();
    if (!/^(0|[1-9][0-9]{0,17})$/u.test(text)) {
      throw new EpochError(`SOURCE_DATE_EPOCH "${raw}" is not an integer number of seconds (AGSC-04-09)`);
    }
    seconds = Number(text);
    if (!Number.isSafeInteger(seconds)) {
      throw new EpochError(`SOURCE_DATE_EPOCH "${raw}" is out of range (AGSC-04-09)`);
    }
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

module.exports = { createClock, toInstant, EpochError };
