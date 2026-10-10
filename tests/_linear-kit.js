'use strict';
// The step-count kit of the linear-time tests (no clock is read).
//
// A text scanner that must stay linear in its input takes an optional meter, a plain
// object `{ steps: 0 }`, as its last argument and adds to `steps` the characters it
// examines and the start positions it tries. A test hands it a meter and a hostile
// input of about 1 MiB, and asserts that the steps stay within a small constant times
// the length of the input. A quadratic scan of the same input would need about a
// million times more steps, so the bound cannot flip with the speed of the machine,
// and no duration is measured or asserted anywhere.
//
// The kit also gives the fixed pseudo-random texts the equivalence tests use: a
// scanner that replaced a regular expression must find exactly what that expression
// found, and the tests compare the two over a fixed, generated set of short texts.

const assert = require('node:assert/strict');

const MIB = 1024 * 1024;

/** A fresh meter. */
function meter() {
  return { steps: 0 };
}

/**
 * Run `scan(input, meter)` once and assert the step bound.
 *
 * @param {string} name what is scanned, for the failure message.
 * @param {(input:string, meter:{steps:number}) => *} scan
 * @param {string} input
 * @param {number} [factor] the constant c of steps <= c * input.length.
 * @returns {*} whatever the scanner returned, for further assertions.
 */
function assertLinear(name, scan, input, factor = 8) {
  // A short probe first, so that a scanner that takes no meter fails here at once
  // instead of running a possibly quadratic scan over the whole input.
  const probe = meter();
  scan(input.slice(0, 64), probe);
  assert.ok(probe.steps > 0, `${name}: the scanner reported no steps (it takes no meter)`);
  const m = meter();
  const result = scan(input, m);
  assert.ok(m.steps <= factor * Math.max(1, input.length),
    `${name}: ${m.steps} steps on ${input.length} characters, over ${factor} per character`);
  return result;
}

/**
 * A 32-bit linear congruential generator (no Math.random), high bits.
 * @param {number} seed
 * @returns {() => number} the next value in [0, 65536).
 */
function generator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state >>> 16;
  };
}

/**
 * `count` short texts over `alphabet` (an array of strings, each picked whole), from
 * a fixed seed, each 1 to `maxLength` picks long. The same call gives the same texts.
 */
function* texts(seed, count, alphabet, maxLength = 24) {
  const next = generator(seed);
  for (let n = 0; n < count; n += 1) {
    const length = 1 + (next() % maxLength);
    let text = '';
    for (let i = 0; i < length; i += 1) text += alphabet[next() % alphabet.length];
    yield text;
  }
}

/**
 * Hostile inputs of about `length` characters over an alphabet: one long run of each
 * piece, and the pieces repeated in turn. These are the shapes that make a pattern
 * scan from every start position to the end.
 *
 * @param {Array<string>} alphabet
 * @param {number} [length]
 * @returns {Array<{label:string, input:string}>}
 */
function longRuns(alphabet, length = MIB) {
  const out = [];
  for (const piece of alphabet) {
    out.push({ label: `a run of ${JSON.stringify(piece)}`, input: piece.repeat(Math.ceil(length / piece.length)) });
  }
  const all = alphabet.join('');
  out.push({ label: `${JSON.stringify(all)} repeated`, input: all.repeat(Math.ceil(length / all.length)) });
  return out;
}

module.exports = { MIB, assertLinear, generator, longRuns, meter, texts };
