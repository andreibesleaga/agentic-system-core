'use strict';
// src/shared/key-value-line.js — SHARED KERNEL (DDD): the rest of one line after a
// fixed head, read in linear steps.
//
//   * A "key: value" line of a frontmatter block a foreign tool wrote (the skills
//     import's lenient reader, the old site's cards, a skill pack): the key, then the
//     value to the end of the line.
//   * A heading or a dated line (an adopted note's title, a GABBE entry heading or
//     state line): the text after the marks and the blanks.
//
// Why a scan and not one pattern: a head, a run of blanks and then `(.*)$` or `(.+)$`
// gives the blanks back one at a time when the rest of the line holds a line
// terminator that `.` does not match (a carriage return, U+2028, U+2029), and reads the
// rest of the line again each time, so one long line took quadratic time (a 100 KB
// line took tens of seconds). Here the head is matched once, the rest is searched for a
// line terminator once, and the rest is sliced. The results are exactly the patterns'
// (`tests/knowledge/key-value-line-linear.test.js` and `tests/security/fuzz-patterns.test.js`
// compare them on seeded corpora).
//
// A head pattern handed to these functions is anchored with `^`, carries neither the
// `g` nor the `y` flag, and matches in one way only: it ends where its own last run
// ends, so no shorter match of it could let the rest succeed.
//
// PURE: no fs, no process, no clock, no network, no require of any context.

const LINE_FEED = 0x0a;
const CARRIAGE_RETURN = 0x0d;
const LINE_SEPARATOR = 0x2028;
const PARAGRAPH_SEPARATOR = 0x2029;

/** True for a code unit `.` does not match: the four line terminators of ECMAScript. */
function isLineTerminator(code) {
  return code === LINE_FEED || code === CARRIAGE_RETURN || code === LINE_SEPARATOR || code === PARAGRAPH_SEPARATOR;
}

/**
 * Whether `text` holds a line feed, a carriage return, U+2028 or U+2029.
 *
 * @param {string} text
 * @param {{steps:number}} [meter] counts the characters examined (tests/_linear-kit.js).
 * @returns {boolean}
 */
function hasLineTerminator(text, meter) {
  let i = 0;
  while (i < text.length && !isLineTerminator(text.charCodeAt(i))) i += 1;
  if (meter) meter.steps += i + 1;
  return i < text.length;
}

/**
 * What `<head>(.*)$` captures: the rest of the line after `head`'s match, or null when
 * `head` does not match or the rest holds a line terminator.
 *
 * @param {string} line
 * @param {RegExp} head see the header for what it must be.
 * @param {{steps:number}} [meter]
 * @returns {{head:RegExpExecArray, rest:string}|null}
 */
function lineRest(line, head, meter) {
  const text = String(line);
  const m = head.exec(text);
  if (meter) meter.steps += m === null ? 1 : m[0].length + 1;
  if (m === null) return null;
  const rest = text.slice(m[0].length);
  return hasLineTerminator(rest, meter) ? null : { head: m, rest };
}

/**
 * What `<head>\s+(.+)$` captures: the text after `head`'s match and the run of blanks
 * that follows it, or null. When nothing follows the blanks, the pattern gave its last
 * blank to `(.+)` if the run had two or more and that blank is not a line terminator,
 * and so does this function.
 *
 * @param {string} line
 * @param {RegExp} head see the header for what it must be; it ends before the blanks.
 * @param {{steps:number}} [meter]
 * @returns {{head:RegExpExecArray, text:string}|null}
 */
function lineText(line, head, meter) {
  const all = String(line);
  const m = head.exec(all);
  if (meter) meter.steps += 1;
  if (m === null) return null;
  const from = m[0].length;
  let end = from;
  while (end < all.length && /\s/u.test(all[end])) end += 1;
  if (meter) meter.steps += end + 1;
  if (end === from) return null;
  if (end < all.length) {
    const rest = all.slice(end);
    return hasLineTerminator(rest, meter) ? null : { head: m, text: rest };
  }
  const last = all.charCodeAt(end - 1);
  return end - from >= 2 && !isLineTerminator(last) ? { head: m, text: all[end - 1] } : null;
}

/**
 * One "key: value" line: what `<keyPattern>(.*)$` captured as its key group and its
 * value group, or null.
 *
 * @param {string} line
 * @param {RegExp} keyPattern `^(<key>):` and the blanks after it, the key its group 1.
 * @param {{steps:number}} [meter]
 * @returns {{key:string, value:string}|null}
 */
function keyValueLine(line, keyPattern, meter) {
  const found = lineRest(line, keyPattern, meter);
  return found === null ? null : { key: found.head[1], value: found.rest };
}

module.exports = { hasLineTerminator, keyValueLine, lineRest, lineText };
