'use strict';
// src/shared/trailing.js — SHARED KERNEL (DDD): the trailing-slash trim every context
// applies to a base address (`site.base`, a discovery document's anchor) or a folder
// path (`build.out`, a target folder) before it appends a route or a file name.
//
// Why a scan and not a pattern: `/\/+$/u` reads to the end of the text from every
// slash of every run it meets, so a long run of slashes followed by any other
// character made it quadratic (100,000 characters took about 23 s). Reading back from
// the end examines only the slashes it removes, plus one character. The results are
// exactly the pattern's (`tests/knowledge/trailing-slashes-linear.test.js` compares
// them on a seeded corpus).
//
// PURE: no fs, no process, no clock, no network, no require of any context.

const SLASH = 0x2f;

/**
 * The length of `text` without the run of `/` at its end.
 *
 * @param {string} text
 * @param {{steps:number}} [meter] counts the characters examined (tests/_linear-kit.js).
 * @returns {number}
 */
function trimmedLength(text, meter) {
  let end = text.length;
  while (end > 0 && text.charCodeAt(end - 1) === SLASH) end -= 1;
  if (meter) meter.steps += text.length - end + 1;
  return end;
}

/**
 * `text` without the run of `/` at its end: what `text.replace(/\/+$/u, '')` gives,
 * in linear steps.
 *
 * @param {string} text
 * @param {{steps:number}} [meter]
 * @returns {string}
 */
function withoutTrailingSlashes(text, meter) {
  const end = trimmedLength(text, meter);
  return end === text.length ? text : text.slice(0, end);
}

/**
 * `text` with the run of `/` at its end, if any, made one `/`; a text that does not
 * end with `/` is unchanged: what `text.replace(/\/+$/u, '/')` gives, in linear steps.
 *
 * @param {string} text
 * @param {{steps:number}} [meter]
 * @returns {string}
 */
function collapseTrailingSlashes(text, meter) {
  const end = trimmedLength(text, meter);
  return end === text.length ? text : `${text.slice(0, end)}/`;
}

module.exports = { collapseTrailingSlashes, withoutTrailingSlashes };
