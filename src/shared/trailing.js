'use strict';
// src/shared/trailing.js — SHARED KERNEL (DDD): the trims every context applies to
// the end of a text.
//
//   * The trailing slashes of a base address (`site.base`, a discovery document's
//     anchor) or a folder path (`build.out`, a target folder), removed before a route
//     or a file name is appended.
//   * The trailing line feeds of a text (a body, a quoted block, a written file),
//     removed, or made exactly one, before the text is compared or written.
//
// Why a scan and not a pattern: `/\/+$/u`, `/\n+$/u` and `/\n*$/u` read to the end of
// the text from every character of every run they meet, so a long run of slashes or
// line feeds followed by any other character made them quadratic (100,000 characters
// took tens of seconds). Reading back from the end examines only the characters it
// removes, plus one. The results are exactly the patterns' (the tests
// `tests/knowledge/trailing-slashes-linear.test.js` and
// `tests/knowledge/trailing-feeds-linear.test.js` compare them on seeded corpora).
//
// PURE: no fs, no process, no clock, no network, no require of any context.

const SLASH = 0x2f;
const LINE_FEED = 0x0a;

/**
 * The length of `text` without the run of the character `code` at its end.
 *
 * @param {string} text
 * @param {number} code a UTF-16 code unit.
 * @param {{steps:number}} [meter] counts the characters examined (tests/_linear-kit.js).
 * @returns {number}
 */
function trimmedLength(text, code, meter) {
  let end = text.length;
  while (end > 0 && text.charCodeAt(end - 1) === code) end -= 1;
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
  const end = trimmedLength(text, SLASH, meter);
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
  const end = trimmedLength(text, SLASH, meter);
  return end === text.length ? text : `${text.slice(0, end)}/`;
}

/**
 * `text` without the run of line feeds at its end: what `text.replace(/\n+$/u, '')`
 * and `text.replace(/\n*$/u, '')` give, in linear steps. A carriage return is not a
 * line feed and stays.
 *
 * @param {string} text
 * @param {{steps:number}} [meter]
 * @returns {string}
 */
function withoutTrailingFeeds(text, meter) {
  const end = trimmedLength(text, LINE_FEED, meter);
  return end === text.length ? text : text.slice(0, end);
}

/**
 * `text` ending with exactly one line feed, however many it ended with before (none
 * included): what `text.replace(/\n*$/u, '\n')` and
 * `` `${text.replace(/\n+$/u, '')}\n` `` give, in linear steps.
 *
 * @param {string} text
 * @param {{steps:number}} [meter]
 * @returns {string}
 */
function withOneTrailingFeed(text, meter) {
  return `${withoutTrailingFeeds(text, meter)}\n`;
}

module.exports = { collapseTrailingSlashes, withOneTrailingFeed, withoutTrailingFeeds, withoutTrailingSlashes };
