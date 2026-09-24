'use strict';
/**
 * CONTEXT Composition — the ARCHIVE of a multi-file result
 * AGSC-07-13's portability contract; AGSC-04-09's build instant).
 *
 * WHAT IT IS. A `.zip` container over a set of files that already exist as bytes —
 * the seven Harness files of AGSC-07-12, the skill packs of AGSC-07-19, one export
 * root of AGSC-01-26…28. It is a PACKAGING of those files and never a file of the
 * Harness itself: AGSC-07-12 closes the Harness at seven file kinds "and no others",
 * so the archive is written BESIDE the directory and never inside it, and it is never
 * a build input (AGSC-01-16 refuses an archive on the way in, `AGSC-E903`; the
 * FileSystem port enforces that on `readFile` and this module only ever produces
 * bytes for `writeFile`).
 *
 * WHY IT IS WRITTEN HERE AND NOT TAKEN FROM A LIBRARY. Three requirements meet in
 * this file and no published library holds all three at once:
 *
 *   1. AGSC-07-13 — "Harness output computed in a browser MUST be byte-identical to
 *      the equivalent CLI invocation". This project holds that by running ONE
 *      implementation in both hosts: `composition/browser.js` emits the SOURCE TEXT
 *      of the functions the CLI runs. A library cannot go through that mechanism —
 *      `tests/arch/composition-portable.test.js` fails any portable function that
 *      calls `require` — so a library would mean two code paths and a proof that
 *      decays between them.
 *   2. Byte-reproducibility (AGSC-04-02) across time zones. A ZIP entry records its
 *      timestamp in the MS-DOS fields, which are LOCAL time by the format's own
 *      definition, and `fflate`, `client-zip` and `jszip` all fill them with
 *      `Date#getFullYear`/`getHours`/… — so the same input produces different bytes
 *      under `TZ=UTC` and `TZ=Pacific/Kiritimati`. `dosTimestamp` below derives the
 *      fields from the build instant's own UTC digits and reads no clock and no zone.
 *   3. The page's host is the language and nothing else. `TextEncoder` is not an
 *      ECMAScript intrinsic and is absent from the harness that proves (1), so even
 *      the encoding step has to be language-only — which is what `utf8Bytes` is.
 *
 * The container itself is the STORE method of APPNOTE.TXT §4.3.6…4.4.5 — no
 * compression, so every byte of the archive is a function of the entry names, the
 * entry bytes and the instant, with no encoder's choices in between. The pinned
 * library `fflate` (see the library table in `src/README.md`) is the independent THIRD-PARTY
 * READER that proves these bytes in `tests/composition/archive.test.js`: what this
 * module writes, a maintained library unpacks to exactly the input.
 *
 * PURE and PORTABLE: no fs, no clock, no network, no `require` inside a portable
 * function, no module-scope binding read by one.
 */

const { compareCodePoint } = require('./compose.js');

/**
 * UTF-8 bytes of a string, using the language alone.
 *
 * A browser and Node both have `TextEncoder`, and the harness that proves
 * AGSC-07-13 (`vm.createContext(Object.create(null))`) does not, because
 * `TextEncoder` is a host interface and not an ECMAScript intrinsic. An unpaired
 * surrogate becomes U+FFFD, which is what `TextEncoder` does, so the two agree
 * everywhere they can both be called.
 *
 * @param {*} text
 * @returns {Uint8Array}
 */
function utf8Bytes(text) {
  const source = String(text == null ? '' : text);
  const out = [];
  for (let i = 0; i < source.length; i += 1) {
    let code = source.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < source.length) {
      const low = source.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) * 0x400) + (low - 0xdc00);
        i += 1;
      }
    }
    if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd;
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return Uint8Array.from(out);
}

/**
 * CRC-32/ISO-HDLC over `bytes` — the checksum APPNOTE.TXT §4.4.7 requires in every
 * local header and every central-directory record.
 *
 * Written without a lookup table so that the function is self-contained: a portable
 * function may not read a module-scope constant, and a 256-entry table rebuilt per
 * call would cost more than the eight shifts per byte this loop does. Proved against
 * `node:zlib`'s own `crc32` in the unit test, so it is measured and not asserted.
 *
 * @param {Uint8Array|Array<number>} bytes
 * @returns {number} the checksum as an unsigned 32-bit integer.
 */
function crc32(bytes) {
  let crc = 0xffffffff;
  const length = bytes == null ? 0 : bytes.length;
  for (let i = 0; i < length; i += 1) {
    crc ^= bytes[i] & 0xff;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * The MS-DOS date and time fields of APPNOTE.TXT §4.4.6, derived from the AGSC-04-10
 * rendering of the build instant (AGSC-04-09) and from nothing else.
 *
 * THE POINT OF THIS FUNCTION. The DOS fields hold local time and carry no zone, so
 * every library that fills them with `Date#getHours()` writes different bytes on two
 * machines that differ only in `TZ`. Here the digits of the instant — which are UTC
 * by AGSC-04-10 — are used directly, so `TZ` and `LC_ALL` cannot reach the archive.
 *
 * Total. The format cannot represent a year before 1980 or after 2107: the default
 * build instant of AGSC-04-09 (epoch 0, no git history) and an unparseable value both
 * become 1980-01-01T00:00:00, and a later year is clamped to 2107-12-31T23:59:58.
 * Clamping is stated rather than silent — `archiveBytes` is a pure function of its
 * inputs, so two hosts clamp alike.
 *
 * @param {string} instant an AGSC-04-10 instant, `YYYY-MM-DDTHH:MM:SSZ`.
 * @returns {{date: number, time: number}} two unsigned 16-bit fields.
 */
function dosTimestamp(instant) {
  const parsed = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/u
    .exec(String(instant == null ? '' : instant));
  if (parsed === null) return { date: (1 << 5) | 1, time: 0 };
  const year = Number(parsed[1]);
  if (year < 1980) return { date: (1 << 5) | 1, time: 0 };
  if (year > 2107) return { date: (127 << 9) | (12 << 5) | 31, time: (23 << 11) | (59 << 5) | 29 };
  const date = ((year - 1980) << 9) | (Number(parsed[2]) << 5) | Number(parsed[3]);
  const time = (Number(parsed[4]) << 11) | (Number(parsed[5]) << 5) | (Number(parsed[6]) >> 1);
  return { date: date >>> 0, time: time >>> 0 };
}

/**
 * The entries of an archive, in the order they are stored: by path, code point by
 * code point (AGSC-07-09's ordering, which is this system's only ordering). The
 * order is part of the bytes, so it is fixed here and never at a call site.
 *
 * Accepts the three shapes the callers already hold — a `Map` of path → text (the
 * Harness emission of `harness.js#emit`), an array of `[path, text]` pairs, and an
 * array of `{path, text}` or `{path, bytes}` records (the skill packs and the export
 * plans) — by duck typing rather than `instanceof`, because a `Map` built in the
 * page's realm is not the CLI realm's `Map` and the two hosts must agree.
 *
 * A leading `/` is dropped: a ZIP entry name is relative by APPNOTE.TXT §4.4.17.1
 * ("MUST NOT contain a drive or device letter, or a leading slash").
 *
 * @param {*} files
 * @returns {Array<{bytes: Uint8Array, path: string}>}
 */
function archiveEntries(files) {
  const pairs = [];
  if (files !== null && typeof files === 'object'
    && typeof files.forEach === 'function' && typeof files.get === 'function') {
    files.forEach((value, key) => pairs.push([key, value]));
  } else if (Array.isArray(files)) {
    for (const entry of files) {
      if (Array.isArray(entry)) pairs.push([entry[0], entry[1]]);
      else if (entry !== null && typeof entry === 'object') {
        pairs.push([entry.path, entry.bytes === undefined ? entry.text : entry.bytes]);
      }
    }
  }
  const rows = [];
  for (const [rawPath, value] of pairs) {
    const at = String(rawPath == null ? '' : rawPath).replace(/^\/+/u, '');
    if (at === '') continue;
    const bytes = (value === null || value === undefined || typeof value === 'string')
      ? utf8Bytes(value) : Uint8Array.from(value);
    rows.push({ bytes, path: at });
  }
  rows.sort((a, b) => compareCodePoint(a.path, b.path));
  return rows;
}

/**
 * Everything about a file set that makes a conforming archive impossible, as
 * Findings with registered codes — never a thrown string, and never a silently
 * truncated field.
 *
 * `AGSC-E903` is "archive refused" (AGSC-01-16); `AGSC-E902` is the relative-path
 * grammar of the same rule. Both are registered; this module mints nothing.
 *
 * @param {Array<{bytes: Uint8Array, path: string}>} entries
 * @returns {Array<{code: string, file: string, message: string, severity: string}>}
 */
function archiveViolations(entries) {
  const rows = Array.isArray(entries) ? entries : [];
  const out = [];
  // A `Set`, not a list scan: a skill pack or an export root can carry thousands of
  // entries and `indexOf` would make this check quadratic in the file count.
  const seen = new Set();
  let total = 0;
  for (const row of rows) {
    const at = String(row && row.path == null ? '' : row.path);
    if (at.charAt(0) === '/' || at.indexOf('\\') !== -1 || /(?:^|\/)\.\.(?:\/|$)/u.test(at)) {
      out.push({
        code: 'AGSC-E902', file: at, severity: 'error',
        message: `"${at}" is not a relative path inside the archive (AGSC-01-16)`,
      });
    }
    if (seen.has(at)) {
      out.push({
        code: 'AGSC-E903', file: at, severity: 'error',
        message: `"${at}" would be stored twice; an archive entry name is unique (AGSC-01-16)`,
      });
    }
    seen.add(at);
    const size = row && row.bytes ? row.bytes.length : 0;
    total += size;
    if (size > 4294967295) {
      out.push({
        code: 'AGSC-E903', file: at, severity: 'error',
        message: `"${at}" is ${size} bytes; a stored entry above 4294967295 bytes needs ZIP64,`
          + ' which this format profile does not emit (AGSC-01-16)',
      });
    }
  }
  if (rows.length > 65535) {
    out.push({
      code: 'AGSC-E903', file: '', severity: 'error',
      message: `${rows.length} entries; an archive above 65535 entries needs ZIP64, which this`
        + ' format profile does not emit (AGSC-01-16)',
    });
  }
  if (total > 4294967295) {
    out.push({
      code: 'AGSC-E903', file: '', severity: 'error',
      message: `${total} bytes in all; an archive above 4294967295 bytes needs ZIP64, which this`
        + ' format profile does not emit (AGSC-01-16)',
    });
  }
  return out;
}

/**
 * The archive bytes for an ordered entry list.
 *
 * APPNOTE.TXT 6.3.10, the STORE profile: a local file header (§4.3.7) and the file's
 * own bytes per entry, then one central-directory record per entry (§4.3.12), then
 * the end-of-central-directory record (§4.3.16). Every multi-byte field is
 * little-endian (§4.4). Nothing optional is written — no extra field, no file
 * comment, no archive comment, no data descriptor, no directory entry, no external
 * attributes — so the archive carries the file set and no host's traces.
 *
 * The general-purpose bit flag is `0x0800` alone: APPNOTE.TXT §4.4.4 bit 11 ("the
 * filename and comment fields for this file MUST be encoded using UTF-8"), which is
 * what `utf8Bytes` has already done. `version needed` and `version made by` are both
 * `20`, and the upper byte of `version made by` is `0`, so the archive claims MS-DOS
 * attribute semantics and stores none.
 *
 * Returns the bytes even when `archiveViolations` has something to say: the caller
 * reports the Findings and decides, which is the Finding discipline of this codebase
 * (a domain fact, never an exception).
 *
 * @param {Array<{bytes: Uint8Array, path: string}>} entries in storage order.
 * @param {{instant?: string}} [options] the AGSC-04-09 build instant.
 * @returns {Uint8Array}
 */
function zipArchive(entries, options) {
  const rows = Array.isArray(entries) ? entries : [];
  const settings = options || {};
  const stamp = dosTimestamp(settings.instant);

  const out = [];
  const push16 = (value) => out.push(value & 0xff, (value >>> 8) & 0xff);
  const push32 = (value) => out.push(value & 0xff, (value >>> 8) & 0xff,
    (value >>> 16) & 0xff, (value >>> 24) & 0xff);
  const pushBytes = (bytes) => { for (let i = 0; i < bytes.length; i += 1) out.push(bytes[i] & 0xff); };

  const records = [];
  for (const row of rows) {
    const name = utf8Bytes(row.path);
    const bytes = row.bytes === undefined || row.bytes === null ? Uint8Array.from([]) : row.bytes;
    const sum = crc32(bytes);
    records.push({ bytes, name, offset: out.length, sum });
    push32(0x04034b50);
    push16(20);
    push16(0x0800);
    push16(0);
    push16(stamp.time);
    push16(stamp.date);
    push32(sum);
    push32(bytes.length);
    push32(bytes.length);
    push16(name.length);
    push16(0);
    pushBytes(name);
    pushBytes(bytes);
  }

  const directoryAt = out.length;
  for (const record of records) {
    push32(0x02014b50);
    push16(20);
    push16(20);
    push16(0x0800);
    push16(0);
    push16(stamp.time);
    push16(stamp.date);
    push32(record.sum);
    push32(record.bytes.length);
    push32(record.bytes.length);
    push16(record.name.length);
    push16(0);
    push16(0);
    push16(0);
    push16(0);
    push32(0);
    push32(record.offset);
    pushBytes(record.name);
  }
  const directorySize = out.length - directoryAt;

  push32(0x06054b50);
  push16(0);
  push16(0);
  push16(records.length);
  push16(records.length);
  push32(directorySize);
  push32(directoryAt);
  push16(0);

  return Uint8Array.from(out);
}

/**
 * The whole step, in one call, for a caller that holds a file set: order the
 * entries, then write the container. This is the function the CLI verbs and the
 * `/compose/` page both call, and the reason their bytes cannot differ.
 *
 * @param {*} files a `Map` of path → text, or an array of pairs or records.
 * @param {{instant?: string}} [options] the AGSC-04-09 build instant.
 * @returns {{bytes: Uint8Array, entries: Array<object>, violations: Array<object>}}
 */
function archiveBytes(files, options) {
  const entries = archiveEntries(files);
  return {
    bytes: zipArchive(entries, options),
    entries,
    violations: archiveViolations(entries),
  };
}

/**
 * The archive's own file name: the directory the files were written into, the
 * CONTENT VERSION of the Bundle they came from (AGSC-04-25,
 * "the Harness archive name carries the content version"), and `.zip`.
 *
 * The version is tested against AGSC-04-25's grammar here rather than trusted,
 * because a name is a path and the page derives its version from a fetched document.
 * A value outside the grammar becomes `unversioned`, which says plainly that the
 * archive names no state rather than naming a wrong one.
 *
 * @param {string} stem the path of the directory the files were written into, with
 *   no trailing slash — `dist/harness/<name>`, `dist/skills`, `dist/export/steer`.
 * @param {string} version the content version, or anything outside its grammar.
 * @returns {string}
 */
function archiveName(stem, version) {
  const base = String(stem == null ? '' : stem).replace(/\/+$/u, '');
  const raw = String(version == null ? '' : version);
  const safe = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/u.test(raw) ? raw : 'unversioned';
  return `${base}-${safe}.zip`;
}

/**
 * The portable surface, in dependency order — the list `composition/browser.js`
 * emits into the page bundle of AGSC-07-13.
 */
const PORTABLE = Object.freeze(['utf8Bytes', 'crc32', 'dosTimestamp', 'archiveEntries',
  'archiveViolations', 'zipArchive', 'archiveBytes', 'archiveName']);

module.exports = {
  PORTABLE,
  archiveBytes,
  archiveEntries,
  archiveName,
  archiveViolations,
  crc32,
  dosTimestamp,
  utf8Bytes,
  zipArchive,
};
