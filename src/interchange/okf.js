'use strict';
/**
 * CONTEXT Interchange — the foreign reader of AGSC-01-22: `import --from okf`.
 *
 * AGSC-01-22 is written about exactly this format: "Import of a foreign **OKF v0.2
 * bundle** MUST accept unknown `type` values (mapped to `concept` with a warning),
 * unknown keys, missing optional fields, missing `index.md` and broken links. A
 * broken internal link is a Gate failure for the Bundle's own build but MUST NOT
 * reject an import." AGSC-10-09 adds the other direction: an export that follows
 * AGSC-01-26…29 is one "the reference engine (or any Level-1 reader) imports …
 * losslessly", which makes `export --okf` → `import --from okf` a round trip a
 * test can assert, and `tests/interchange/okf-roundtrip.test.js` asserts it item by
 * item and byte for byte.
 *
 * THE FORMAT, AS READ FROM ITS PRIMARY SOURCE on 2026-09-21
 * (<https://raw.githubusercontent.com/GoogleCloudPlatform/open-knowledge-format/main/SPEC.md>):
 *   * "A bundle is a directory tree of markdown files. The directory structure is
 *     independent of the domain: producers organize concepts however makes sense for
 *     the knowledge being captured." — so the reader walks the tree and does not
 *     require `content/<type-plural>/`.
 *   * `type` is "the only always-required field"; `title`, `description`, `resource`
 *     and `tags` are RECOMMENDED; `sources`, `generated`, `verified`, `status` and
 *     `stale_after` are the optional families.
 *   * "Bundles MAY declare the version they target with `okf_version: \"0.2\"` in a
 *     bundle-root `index.md` frontmatter block (the only place frontmatter is
 *     permitted in an `index.md`)."
 *   * "An `index.md` file MAY appear in any directory… Index files contain no
 *     frontmatter, with one exception: a bundle-root `index.md` MAY carry an
 *     `okf_version` key."
 *   * "A `log.md` file MAY appear at any level of the hierarchy…"
 * `index.md`, `log.md`, `_index.md` and `README.md` are therefore never items
 * (AGSC-01-05 says the same of the last two).
 *
 * WHAT IS PRESERVED. Every frontmatter key the foreign file carries is written out
 * again: the ones AGSC-02 knows under their own names, the `x-` vendor namespace
 * verbatim (AGSC-02-05a), and everything else as an unknown key, which AGSC-02-05
 * requires to be preserved and warned about rather than dropped. Only two keys are
 * ever rewritten, and each records what it did:
 *   * a `type` outside AGSC-00-04's six becomes `concept` and the original is kept
 *     as `x-okf-type` — the rule's own instruction, with the vendor namespace used
 *     so that nothing is lost (`AGSC-E506`, a warning);
 *   * `prov` is synthesized when absent (`origin: imported`, the target Bundle's
 *     `bundle.operator`), because AGSC-08-01 requires it and an item without one
 *     could not be linted (`AGSC-E506`).
 *
 * TOLERANCE. A file whose frontmatter this engine's failsafe YAML reader refuses
 * (AGSC-02-02 rejects anchors, aliases, tags, merge keys and flow mappings, none of
 * which OKF forbids) is NOT refused: it is imported with a synthesized frontmatter
 * and its body intact, and the reason is reported. Refusing a foreign file for
 * being foreign is the one thing AGSC-01-22 forbids. Reading such a header's keys
 * is not done: it would need `lint` run over the whole planned Bundle.
 *
 * DETERMINISM (AGSC-01-23). Input is sorted by path, code-point; colliding slugs
 * take `-2`, `-3`, … in that order; nothing reads a clock or a directory listing.
 *
 * PURE: no fs, no clock, no network. Requirements: PRD-021, PRD-026.
 *
 */

const frontmatter = require('../knowledge/frontmatter.js');
const yaml = require('../knowledge/yaml.js');
const licences = require('./licences.js');
const slugs = require('../knowledge/slug.js');
const fix = require('../governance/fix.js');
const { serialize, titleFor } = require('../knowledge/adopt.js');
const { compareCodePoint, nfc } = require('../knowledge/unicode.js');
const { neutraliseSingleLine } = require('./mapping.js');
const { finding } = require('../knowledge/validate.js');
const { compile: compileSchema } = require('../knowledge/schema.js');
const { withoutTrailingSlashes } = require('../shared/trailing.js');

/** The name this adapter answers to on `import --from <name>`. */
const FORMAT = 'okf';

/** AGSC-00-04: the six item types, and the folder each lands in (AGSC-01-03). */
const TYPE_PLURAL = Object.freeze({
  cluster: 'clusters',
  concept: 'concepts',
  episode: 'episodes',
  gate: 'gates',
  lesson: 'lessons',
  procedure: 'procedures',
});

/** Files the format reserves, which are never items (OKF §8, §9; AGSC-01-05). */
const RESERVED = Object.freeze(['index.md', 'log.md', '_index.md', 'README.md']);

/** The key an unmapped foreign `type` is preserved under (AGSC-02-05a). */
const TYPE_KEEP_KEY = 'x-okf-type';

/**
 * AGSC-03-19 / AGSC-03-20: foreign link names are MAPPED on import, never added to
 * the vocabulary. The combiner's `oneOf` (pairwise `excludes`) is a structure over
 * a selection, not a frontmatter key, and has no entry here.
 */
const FOREIGN_LINK_NAMES = Object.freeze({
  'alternative-to': 'excludes',
  blockedBy: 'blocked-by',
  'composed-of': 'uses',
  'conflicts-with': 'excludes',
  decidedBy: 'decided-by',
  mitigates: 'related',
  recommends: 'uses',
  refines: 'narrower',
  tests: 'verifies',
  'traces-to': 'covers',
});

/**
 * AGSC-02-06: an instant is `YYYY-MM-DDTHH:MM:SSZ`. A foreign one may spell UTC as `+00:00`,
 * `-00:00`, `+0000` or `-0000`, carry fractions of a second (dropped), or name another offset
 * (`±HH:MM` or `±HHMM`, hours 00 to 13 with any minutes, or exactly 14:00), which is converted to UTC. Only a real instant is
 * respelled (a valid calendar date, hour 0-23, minute and second 0-59); `24:00:00`, `23:59:60`,
 * an impossible date and a result outside the years 0001-9999 are left as written, for the lint
 * to name. The arithmetic is integer arithmetic: this module reads no clock.
 */
const FOREIGN_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(?:Z|([+-])(\d{2}):?(\d{2}))$/u;

/** The instant keys of an item, as paths into its frontmatter (`[]` is every entry of a list). */
const INSTANT_PATHS = Object.freeze([['generated', 'at'], ['stale_after'], ['started'], ['ended'], ['verified', '[]', 'at']]);

/** The days of a month of the proleptic Gregorian calendar. */
function daysIn(year, month) {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Days since 1970-01-01 of a civil date (the algorithm of H. Hinnant; integers only). */
function daysFromCivil(year, month, day) {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** The civil date of a count of days since 1970-01-01. */
function civilFromDays(count) {
  const z = count + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { day, month, year: yoe + era * 400 + (month <= 2 ? 1 : 0) };
}

/**
 * One foreign time as UTC at seconds precision, or `null` when it is already in that form,
 * is no real instant, or falls outside the years 0001-9999.
 *
 * @param {*} value anything; only a string is read.
 * @returns {{text:string, dropped:boolean}|null}
 */
function toUtcInstant(value) {
  if (typeof value !== 'string') return null;
  const m = FOREIGN_INSTANT.exec(value);
  if (m === null) return null;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  const sign = m[8] === undefined ? 0 : (m[8] === '-' ? -1 : 1);
  const offset = sign === 0 ? 0 : sign * (Number(m[9]) * 60 + Number(m[10]));
  const real = month >= 1 && month <= 12 && day >= 1 && day <= daysIn(year, month)
    && hour <= 23 && minute <= 59 && second <= 59
    && (m[8] === undefined || (Number(m[10]) <= 59 && (Number(m[9]) <= 13 || (Number(m[9]) === 14 && Number(m[10]) === 0))));
  if (!real) return null;
  const seconds = daysFromCivil(year, month, day) * 86400 + hour * 3600 + minute * 60 + second - offset * 60;
  const date = civilFromDays(Math.floor(seconds / 86400));
  if (date.year < 1 || date.year > 9999) return null;
  const rest = seconds - Math.floor(seconds / 86400) * 86400;
  const two = (n) => String(n).padStart(2, '0');
  const text = `${String(date.year).padStart(4, '0')}-${two(date.month)}-${two(date.day)}T${two(Math.floor(rest / 3600))}:`
    + `${two(Math.floor(rest / 60) % 60)}:${two(rest % 60)}Z`;
  return text === value ? null : { dropped: m[7] !== undefined, text };
}

/** AGSC-02-06: rewrite every string instant at `steps` in place; `changed` collects each key once and whether fractions were dropped. */
function normaliseInstants(node, steps, trail, changed) {
  if (node === null || typeof node !== 'object' || steps.length === 0) return;
  const [head, ...rest] = steps;
  if (head === '[]') {
    if (Array.isArray(node)) node.forEach((entry) => normaliseInstants(entry, rest, trail, changed));
    return;
  }
  if (Array.isArray(node) || node[head] === undefined) return;
  if (rest.length > 0) { normaliseInstants(node[head], rest, trail, changed); return; }
  const utc = toUtcInstant(node[head]);
  if (utc === null) return;
  node[head] = utc.text;
  if (!changed.keys.includes(trail)) changed.keys.push(trail);
  if (utc.dropped) changed.dropped = true;
}

/** Is this path one of the format's reserved documents? */
function isReserved(path) {
  const name = String(path).split('/').pop();
  return RESERVED.includes(name);
}

/**
 * The frontmatter of one foreign document, read strictly (the reader of AGSC-02-02), tolerantly:
 * a header the reader refuses is an empty one with the reason, as the previous version imported it.
 *
 * @param {string} text the file's bytes.
 * @returns {{body:string, frontmatter:object, reason:(string|null)}}
 */
function readDocument(text) {
  const source = String(text == null ? '' : text);
  const split = frontmatter.split(source);
  if (split.hasFrontmatter !== true) {
    return { body: source, frontmatter: Object.create(null), reason: 'no frontmatter block' };
  }
  try {
    const value = yaml.parse(split.yamlText);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return { body: split.body, frontmatter: Object.create(null), reason: 'the frontmatter block is not a mapping' };
    }
    const out = Object.create(null);
    for (const [key, v] of Object.entries(value)) out[key] = v;
    return { body: split.body, frontmatter: out, reason: null };
  } catch (e) {
    return {
      body: split.body,
      frontmatter: Object.create(null),
      reason: `the frontmatter is outside the YAML subset AGSC-02-02 reads (${(e && e.message) || 'parse error'})`,
    };
  }
}

/**
 * The warning that an item was written as a draft (AGSC-01-22): it names the item and
 * the draft status, and says what the draft replaced and why.
 *
 * @param {string} path the foreign document.
 * @param {{foreign:boolean, given:*, license:*}} facts `foreign`: the source is not this
 *   node's own, so the draft is the rule; otherwise it is the licence that could not be
 *   established. `given` is the status the source stated, `license` the licence it declared.
 * @returns {object}
 */
function draftWarning(path, facts) {
  const parts = [`${path}: imported as status: draft, so it is never published (AGSC-06-30) until a person`
    + ' changes the status'];
  if (facts.given !== undefined && facts.given !== 'draft') {
    parts.push(`the status the source gave it, ${JSON.stringify(String(facts.given))}, was not kept`);
  }
  if (!facts.foreign) {
    parts.push(facts.license === undefined
      ? 'its licence could not be established (no license key, and none at the source root)'
      : `its licence ${JSON.stringify(String(facts.license))} could not be established`);
  }
  return finding('AGSC-E506', `${parts.join('; ')} (AGSC-01-22)`, { file: path, severity: 'warn' });
}

/**
 * The AGSC frontmatter of one foreign document.
 *
 * @param {object} raw the foreign frontmatter.
 * @param {object} options `{body, operator, owned, path, slug, sourceHash, sourceLicence,
 *   sourceVersion, stem}`; `owned` is true only for a source this node owns (AGSC-01-22).
 * @returns {{frontmatter:object, findings:Array<object>}}
 */
function mapFrontmatter(raw, options) {
  const findings = [];
  const out = Object.create(null);
  for (const [key, value] of Object.entries(raw)) out[key] = value;

  const declared = out.type === undefined ? '' : String(out.type);
  if (!Object.hasOwn(TYPE_PLURAL, declared)) {
    if (declared !== '' && out[TYPE_KEEP_KEY] === undefined) out[TYPE_KEEP_KEY] = declared;
    out.type = 'concept';
    findings.push(finding('AGSC-E506',
      declared === ''
        ? `${options.path}: the document declares no type; it was imported as a concept (AGSC-01-22)`
        : `${options.path}: the foreign type ${JSON.stringify(declared)} is not one of AGSC-00-04's six;`
          + ` it was imported as a concept and kept as ${TYPE_KEEP_KEY} (AGSC-01-22, AGSC-02-05a)`,
      { file: options.path, severity: 'warn' }));
  }

  // AGSC-03-19 / AGSC-03-20: each foreign link name becomes its Link key, values
  // appended to what the key already holds, in order and without repetition.
  for (const [foreign, key] of Object.entries(FOREIGN_LINK_NAMES)) {
    if (out[foreign] === undefined) continue;
    const values = Array.isArray(out[foreign]) ? out[foreign] : [out[foreign]];
    const merged = Array.isArray(out[key]) ? [...out[key]] : (out[key] === undefined ? [] : [out[key]]);
    for (const value of values) if (!merged.includes(value)) merged.push(value);
    out[key] = merged;
    delete out[foreign];
    findings.push(finding('AGSC-E506',
      `${options.path}: the foreign link name ${JSON.stringify(foreign)} was mapped to ${JSON.stringify(key)}`
      + ' (AGSC-03-19, AGSC-03-20)',
      { file: options.path, severity: 'warn' }));
  }

  if (out.title === undefined || String(out.title).trim() === '') {
    // AGSC-02-90's own synthesis: the body's first heading, else the file stem, else
    // the slug, clipped to the 3-120 code-point bound of AGSC-02-24.
    const derived = titleFor(String(options.body == null ? '' : options.body),
      options.stem, options.slug);
    out.title = derived.title;
    findings.push(...derived.findings.map((one) => ({ ...one, file: options.path })));
    findings.push(finding('AGSC-E506',
      `${options.path}: no title; one was synthesized from the document (AGSC-02-90)`,
      { file: options.path, severity: 'warn' }));
  }

  // AGSC-02-12 with AGSC-01-22: a concept carries `kind`; a document MAPPED to
  // `concept` (its own type unknown or absent) that declares none gets
  // the adoption default of AGSC-02-90, so the import passes this node's own lint.
  const mapped = !Object.hasOwn(TYPE_PLURAL, declared);
  if (mapped && (out.kind === undefined || out.kind === null || String(out.kind) === '')) {
    out.kind = 'explainer';
    findings.push(finding('AGSC-E506',
      `${options.path}: no kind; it was imported with kind: explainer, the adoption default (AGSC-02-90, AGSC-01-22)`,
      { file: options.path, severity: 'warn' }));
  }

  // AGSC-01-22 (from 1.1): every item of a source this node does not own is written
  // `status: draft`, whatever its licence and whatever status the source gave it, so it
  // is never published (AGSC-06-30) until a person changes the status. A source this
  // node owns (`options.owned`: its root document carries this Bundle's `base`) keeps
  // the 1.0 rule: only a record whose licence the importer cannot establish as
  // permitting publication is a draft, and the record's own `license` decides when it
  // declares one; else the source's (its root index.md, its root licence file).
  const given = out.status;
  const foreign = options.owned !== true;
  const own = out.license === undefined ? null : licences.established(out.license);
  const allowed = own === null ? options.sourceLicence === true : own;
  if (foreign || (!allowed && given !== 'draft')) {
    out.status = 'draft';
    findings.push(draftWarning(options.path, { foreign, given, license: out.license }));
  }

  // AGSC-02-06 (an improvement of the import, not of the previous one): a foreign time in
  // another spelling of UTC, or with an offset, is written as UTC, and each change is reported.
  const instants = { dropped: false, keys: [] };
  if (options.improve === true) {
    for (const steps of INSTANT_PATHS) {
      // `started` and `ended` are instants of an episode only; on any other type they are unknown keys.
      if ((steps[0] === 'started' || steps[0] === 'ended') && out.type !== 'episode') continue;
      // The values are the freshly parsed header of this document, so changing them in place is safe.
      normaliseInstants(out, steps, steps.join('.').replace('.[]', '[]'), instants);
    }
  }
  if (instants.keys.length > 0) {
    findings.push(finding('AGSC-E506',
      `${options.path}: the time(s) in ${instants.keys.join(', ')} were written in the UTC form AGSC-02-06 asks for`
      + `${instants.dropped ? ' (fractions of a second dropped)' : ''} (AGSC-01-22)`,
      { file: options.path, severity: 'warn' }));
  }

  if (out.prov === undefined) {
    out.prov = { operator: String(options.operator), origin: 'imported' };
    findings.push(finding('AGSC-E506',
      `${options.path}: no prov; { origin: imported, operator: ${options.operator} } was synthesized`
      + ' because AGSC-08-01 requires it (AGSC-01-22)',
      { file: options.path, severity: 'warn' }));
  }

  // AGSC-01-22's RECORD: every item an import writes names the exact
  // state it was taken from. Both members are written by `import` alone and each is
  // omitted when the source publishes neither — never invented, never carried over
  // from an earlier import of a different source.
  if (out.prov !== null && typeof out.prov === 'object' && !Array.isArray(out.prov)) {
    const record = { ...out.prov };
    delete record.source_hash;
    delete record.source_version;
    if (options.sourceVersion != null && String(options.sourceVersion) !== '') {
      record.source_version = String(options.sourceVersion);
    }
    if (options.sourceHash != null && String(options.sourceHash) !== '') {
      record.source_hash = String(options.sourceHash);
    }
    out.prov = record;
  }

  // / AGSC-02-24: a foreign single-line value may carry a control character
  // or a line separator, and the serializer wrote it back as a YAML escape that
  // parses to the same code point — so `import` produced a file its own `lint`
  // refused, while reporting a pass. Neutralised here, and the substitution is
  // reported, because AGSC-01-22's tolerance never means a silent change.
  const clean = neutraliseSingleLine(out);
  if (clean.substituted.length > 0) {
    findings.push(finding('AGSC-E506',
      `${options.path}: a control character or line separator in the single-line value(s)`
      + ` ${clean.substituted.join(', ')} was replaced by a space, because AGSC-02-24 forbids it`
      + ' and the imported file must pass this node\'s own lint (AGSC-01-22)',
      { file: options.path, severity: 'warn' }));
  }
  return { findings, frontmatter: clean.frontmatter, times: instants.keys.length > 0 };
}

// ------------------------------------------- AGSC-01-22

/**
 * AGSC-01-22: whether the SOURCE states a licence that permits publication — its
 * root index.md `license`, else a licence file at its root (`LICENSE`, `COPYING`,
 * `LICENSE-CONTENT`, handed in as `{name: text}`).
 */
function sourceLicenceOf(files, licenceFiles) {
  // The shallowest index.md is the source root's (as `sourceFacts` reads it).
  const root = (Array.isArray(files) ? files : [])
    .filter((file) => /(^|\/)index\.md$/u.test(String(file.path).replace(/^\.\//u, '')))
    .sort((a, b) => String(a.path).split('/').length - String(b.path).split('/').length)[0];
  if (root !== undefined) {
    const declared = readDocument(root.text).frontmatter.license;
    if (declared !== undefined) return licences.established(declared) === true;
  }
  return Object.entries(licenceFiles || {}).some(([, text]) => licences.establishedText(String(text)));
}

/**
 * AGSC-01-22 (from 1.1): does this node own the source? It does when the source's root
 * document — the shallowest `index.md`, as `sourceFacts` reads it — carries this
 * Bundle's `base`. Anything else, including a source with no root document, is foreign.
 *
 * @param {Array<{path:string, text:string}>} files the foreign tree.
 * @param {string|undefined} base `site.base` of the target Bundle.
 * @returns {boolean}
 */
function sourceOwned(files, base) {
  const declared = sourceFacts(files).base;
  return typeof base === 'string' && base !== '' && declared !== null
    && withoutTrailingSlashes(declared) === withoutTrailingSlashes(base);
}

/**
 * The three facts a source Bundle publishes about itself, read from its
 * bundle-root `index.md` — the only `index.md` OKF permits frontmatter in, and the
 * document `export --markdown`/`--okf` writes `spec_version` and `bundle_version`
 * into (AGSC-01-26). A source that publishes none of them yields three `null`s and
 * nothing is invented: a value nobody published cannot be recorded as if somebody
 * had.
 *
 * @param {Array<{path:string, text:string}>} files the foreign tree.
 * @returns {{base:string|null, specVersion:string|null, bundleVersion:string|null, bundleHash:string|null}}
 */
function sourceFacts(files) {
  const none = { base: null, bundleHash: null, bundleVersion: null, specVersion: null };
  const roots = (Array.isArray(files) ? files : [])
    .filter((file) => /(^|\/)index\.md$/u.test(String(file.path)))
    .sort((a, b) => String(a.path).split('/').length - String(b.path).split('/').length);
  if (roots.length === 0) return none;
  const read = readDocument(roots[0].text);
  const fm = read.frontmatter || {};
  const pick = (key) => (fm[key] === undefined || String(fm[key]) === '' ? null : String(fm[key]));
  return {
    base: pick('base'), bundleHash: pick('bundle_hash'), bundleVersion: pick('bundle_version'), specVersion: pick('spec_version'),
  };
}

/** The MAJOR and MINOR of a SemVer-shaped version string, or `null`. */
function majorMinor(version) {
  const m = /^(\d+)\.(\d+)\./u.exec(String(version == null ? '' : version));
  return m === null ? null : { major: Number(m[1]), minor: Number(m[2]) };
}

/**
 * AGSC-01-22's LIMIT: a source whose declared `spec_version` has a MAJOR this tool
 * does not implement is refused with `AGSC-E004`, before any file is written,
 * unless the caller passed the adapter's own `--allow-newer`. A source of the
 * tool's MAJOR and a newer MINOR is NOT refused: it is imported, with the warning
 * `versionWarning` returns, and every construct the tool does not know is handled
 * as AGSC-00-21 lists.
 *
 * A source that declares nothing, or declares something this reader cannot parse
 * as SemVer, is NOT refused — AGSC-01-22's tolerance covers a missing optional
 * field, and refusing for the absence of a declaration would refuse every OKF
 * bundle in the world.
 *
 * @param {string|null} sourceVersion the source's declared `spec_version`.
 * @param {{toolSpecVersion:string, allowNewer?:boolean}} options
 * @returns {object|null} the finding, or `null` when the import may proceed.
 */
function versionRefusal(sourceVersion, options) {
  const opts = options || {};
  if (opts.allowNewer === true) return null;
  const source = majorMinor(sourceVersion);
  const tool = majorMinor(opts.toolSpecVersion);
  if (source === null || tool === null) return null;
  if (source.major === tool.major) return null;
  return finding('AGSC-E004',
    `the source declares spec_version ${JSON.stringify(String(sourceVersion))}, whose MAJOR this tool`
    + ` does not implement (it implements ${JSON.stringify(String(opts.toolSpecVersion))}); nothing was`
    + ' written. Reading another MAJOR is a guess, so the choice is the operator\'s: pass --allow-newer'
    + ' to take it (AGSC-01-22)',
    { file: 'content/index.md', severity: 'error' });
}

/**
 * AGSC-01-22: a source of the tool's MAJOR and a newer MINOR is imported with the
 * warning `AGSC-E506` naming the newer version; a construct of that MINOR the tool
 * does not know is ignored and preserved as AGSC-00-21 lists.
 *
 * @param {string|null} sourceVersion the source's declared `spec_version`.
 * @param {{toolSpecVersion:string}} options
 * @returns {object|null} the warning, or `null`.
 */
function versionWarning(sourceVersion, options) {
  const opts = options || {};
  const source = majorMinor(sourceVersion);
  const tool = majorMinor(opts.toolSpecVersion);
  if (source === null || tool === null || source.major !== tool.major || source.minor <= tool.minor) return null;
  return finding('AGSC-E506',
    `the source declares spec_version ${JSON.stringify(String(sourceVersion))}, a newer MINOR than this`
    + ` tool's ${JSON.stringify(String(opts.toolSpecVersion))}; it is imported, and what that MINOR adds`
    + ' is ignored and preserved as AGSC-00-21 lists (AGSC-01-22)',
    { file: 'content/index.md', severity: 'warn' });
}

/**
 * The AGSC-01-22 warnings of a set of declared versions: one per distinct newer
 * MINOR, at the first place it is declared, so that a hundred records of one
 * source say it once.
 *
 * @param {Array<{version:(string|null), file?:string, line?:number}>} entries
 * @param {{toolSpecVersion:string}} options
 * @returns {Array<object>}
 */
function versionWarnings(entries, options) {
  const seen = new Set();
  const out = [];
  for (const entry of entries || []) {
    const warning = versionWarning(entry.version == null ? null : String(entry.version), options);
    if (warning === null || seen.has(String(entry.version))) continue;
    seen.add(String(entry.version));
    out.push({ ...warning, ...(entry.file === undefined ? {} : { file: entry.file }),
      ...(entry.line === undefined ? {} : { line: entry.line }) });
  }
  return out;
}

// ------------------------------------------- the two results of a document

/** The compiled item schema of a raw one, once per raw schema object. */
const COMPILED = new WeakMap();
function schemasOf(rawItemSchema) {
  if (rawItemSchema === null || typeof rawItemSchema !== 'object') return undefined; // no schema given: the reader's faults only
  if (!COMPILED.has(rawItemSchema)) COMPILED.set(rawItemSchema, { item: compileSchema(rawItemSchema) });
  return COMPILED.get(rawItemSchema);
}

/**
 * The faults an item file has, as keys `<code> <instance path>`, found by the reader and the
 * item schema `lint` uses (`frontmatter.parseItem`): an error, or a header nested deeper than
 * AGSC-02-02 bounds (`nesting`). A file over the input cap is `AGSC-E904`.
 *
 * @param {{path:string, text:string}} result an item file as it would be written.
 * @param {object|function|undefined} schemas `{item}` compiled, or a function that returns it; none: the reader's faults only.
 * @returns {Set<string>}
 */
function problemsOf(result, schemas) {
  const out = new Set();
  const compiled = typeof schemas === 'function' ? schemas() : schemas;
  for (const one of frontmatter.parseItem(result.text, { path: result.path, schemas: compiled }).findings) {
    const at = /^(\/[^:\s]*):/u.exec(String(one.message));
    if (one.severity === 'error') out.add(`${one.code} ${at === null ? '' : at[1]}`.trim());
    else if (one.code === 'AGSC-E105' && /is nested \d+ levels deep/u.test(String(one.message))) out.add('nesting');
  }
  return out;
}

/** The faults of each base result, found once. */
const KNOWN = new WeakMap();

/**
 * THE INVARIANT of the import (AGSC-01-22): the import may write the improved result of a
 * document only when that result has no fault the base result does not also have. The base
 * result is exactly what the previous version wrote. A fault is an error that the strict
 * reader or the item schema reports, a header nested deeper than AGSC-02-02 bounds, or a
 * file over the input cap. Otherwise the base result is written, byte for byte.
 *
 * @param {{path:string, text:string}} base
 * @param {{path:string, text:string}} improved
 * @param {object} schemas `{item}` compiled.
 * @returns {{applied:boolean, result:object, why:(string|null)}}
 */
function chooseResult(base, improved, schemas) {
  if (improved.text === base.text && improved.path === base.path) return { applied: true, result: improved, why: null };
  if (!KNOWN.has(base)) KNOWN.set(base, problemsOf(base, schemas));
  const known = KNOWN.get(base);
  const added = [...problemsOf(improved, schemas)].filter((key) => !known.has(key));
  if (added.length === 0) return { applied: true, result: improved, why: null };
  const first = added[0];
  return {
    applied: false,
    result: base,
    why: first === 'nesting'
      ? `the item would nest its header deeper than ${yaml.NESTING_BOUND} levels`
      : `the item would have the fault ${first} that the previous version's item does not have`,
  };
}

// ------------------------------------------- links, narrowly

/** An inline link to a Markdown file, with no title: `](dir/name.md)` or `](dir/name.md#anchor)`. */
const MD_FILE_LINK = /\]\(([^()\s[\]#%\\:<>"']+\.md)(#[^()\s]*)?\)/gu;

/** The path a relative `target` names from the folder of `from`, or `null` when it leaves the tree. */
function resolveFrom(from, target) {
  const parts = from.split('/').slice(0, -1);
  for (const part of target.split('/')) {
    if (part === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else if (part !== '.' && part !== '') parts.push(part);
  }
  return parts.join('/');
}

/**
 * A relative Markdown link of a foreign document names another document by its place in the
 * foreign tree. A link is rewritten to the place the linked item is written to only when it
 * names a document of this import from its place in the SOURCE tree and names no file this
 * import writes from the item's NEW place. Nothing else is touched: a link that resolves at
 * the new place stays as written, even when it now names another item. One linear pass, outside
 * fenced code, code spans and any line indented four spaces or a tab: such a line is left as written
 * also when it is a list continuation and not code, because only a Markdown reader can tell the two.
 *
 * @param {string} body the document's body.
 * @param {string} from the document's path in the foreign tree.
 * @param {string} home where the item is written (`content/<plural>/<slug>.md`).
 * @param {Map<string,string>} landing foreign document path to where its item is written.
 * @param {Set<string>} written every path this import writes.
 * @param {function(string):boolean} exists whether a path is a file already in the target Bundle.
 * @returns {{body:string, rewritten:number}}
 */
function rewriteLinks(body, from, home, landing, written, exists) {
  const text = String(body);
  if (!text.includes('](')) return { body: text, rewritten: 0 };
  const spans = fix.codeSpans(text);
  let span = 0;
  let lineStart = 0;
  let lineEnd = text.indexOf('\n');
  let rewritten = 0;
  let out = '';
  let cursor = 0;
  MD_FILE_LINK.lastIndex = 0;
  for (let m = MD_FILE_LINK.exec(text); m !== null; m = MD_FILE_LINK.exec(text)) {
    const at = m.index;
    while (span < spans.length && spans[span][1] <= at) span += 1;
    if (span < spans.length && spans[span][0] <= at) continue;
    while (lineEnd !== -1 && lineEnd < at) {
      lineStart = lineEnd + 1;
      lineEnd = text.indexOf('\n', lineStart);
    }
    if (text.startsWith('    ', lineStart) || text[lineStart] === '\t') continue;
    const target = m[1];
    const place = landing.get(resolveFrom(from, target));
    if (place === undefined || target.startsWith('/')) continue;
    const there = resolveFrom(home, target);
    if (written.has(there) || (there !== null && exists(there))) continue;
    const anchor = m[2] === undefined ? '' : m[2];
    out += `${text.slice(cursor, at)}](../${place.slice('content/'.length)}${anchor})`;
    cursor = at + m[0].length;
    rewritten += 1;
  }
  return { body: rewritten === 0 ? text : out + text.slice(cursor), rewritten };
}

/**
 * The import plan: what would be written, in code-point path order.
 *
 * Each document has two results (AGSC-01-22). The BASE result is what the previous version
 * wrote: a strict read of the header, no time respelled, no link touched. The IMPROVED result
 * adds two things: times written as UTC, and links that cross folders rewritten to where their
 * item is written. A header the strict reader refuses is never read further. `chooseResult` writes the improved result only when it has no fault the base result
 * does not have; otherwise the base result is written and one warning says what was not applied.
 *
 * @param {Array<{path:string, text:string}>} files every file of the foreign tree.
 * @param {object} options
 * @param {string} options.operator `bundle.operator` of the TARGET Bundle (AGSC-08-01).
 * @param {object} options.itemSchema the raw `schema/item.schema.json` object, so the
 *   written bytes are the lint-normalized ones (AGSC-04-19) and a second import of
 *   the same tree is a no-op (AGSC-01-23).
 * @param {string|null} [options.sourceVersion] the source's content version, written
 *   onto every item as `prov.source_version` (AGSC-01-22, AGSC-08-01).
 * @param {string|null} [options.sourceHash] the source's bundle hash, written onto
 *   every item as `prov.source_hash`.
 * @param {Set<string>|function():Set<string>} [options.existingPaths] the paths under `content/` already
 *   in the target Bundle (or a function that lists them, called at most once and only when needed).
 * @param {string} [options.base] `site.base` of the TARGET Bundle: a source whose root
 *   document carries it is this node's own (AGSC-01-22), and keeps the 1.0 draft rule.
 * @returns {{findings:Array<object>, totals:object, writes:Array<{path:string, text:string}>}}
 */
function plan(files, options) {
  const opts = options || {};
  const documents = (Array.isArray(files) ? files : [])
    .filter((file) => String(file.path).endsWith('.md') && !isReserved(file.path))
    .sort((a, b) => compareCodePoint(String(a.path), String(b.path)));

  const taken = new Set();
  const sourceLicence = sourceLicenceOf(files, opts.licenceFiles);
  const owned = sourceOwned(files, opts.base);
  // The item schema is compiled only when a document's improved result differs from its base result.
  const schemas = () => schemasOf(opts.itemSchema);
  // The files already in the target Bundle: a Set, or a function that answers one (called only
  // when a link would otherwise be rewritten, and once). None given: no file exists.
  let existing = null;
  const exists = (path) => {
    if (existing === null) {
      const given = typeof opts.existingPaths === 'function' ? opts.existingPaths() : opts.existingPaths;
      existing = given instanceof Set ? given : new Set();
    }
    return existing.has(path);
  };

  const entries = documents.map((file) => {
    const path = String(file.path);
    const stem = path.split('/').pop().replace(/\.md$/u, '');
    // AGSC-02-91's slugifier is TOTAL — it answers `note` for a file name that
    // carries nothing usable — so a foreign document can never be dropped for its
    // name, which is what AGSC-01-22's tolerance requires.
    const candidate = slugs.isValid(stem) ? stem : slugs.slugify(stem);
    const slug = slugs.dedupe(candidate, taken);
    taken.add(slug);
    const entry = { baseFile: null, path, slug, stem, strict: readDocument(file.text), text: file.text };
    entry.base = renderDocument(entry, false, { opts, owned, sourceLicence });
    entry.improved = renderDocument(entry, true, { opts, owned, sourceLicence });
    return entry;
  });

  // Links are rewritten only where the files already in the Bundle are known (`existingPaths` given):
  // a caller that gives none (the conformance handler, the plugin lane) gets the links as written.
  // An item lands where the previous version put it (the improved header never carries a type), so the
  // places of the base results are the places links are checked against.
  const landing = opts.existingPaths === undefined || opts.existingPaths === null
    ? null
    : new Map(entries.map((entry) => [entry.path, entry.base.path]));
  const chosen = entries.map((entry) => decide(entry, landing, schemas, exists));

  const findings = [];
  const writes = [];
  const totals = { items: 0, unreadable_frontmatter: 0 };
  chosen.forEach((one) => {
    findings.push(...one.findings);
    if (one.unreadable) totals.unreadable_frontmatter += 1;
    writes.push({ path: one.result.path, text: one.result.text });
    totals.items += 1;
  });
  writes.sort((a, b) => compareCodePoint(a.path, b.path));
  return { findings, totals, writes };
}

/**
 * One document as one version writes it: the item file, the findings, the improvements it
 * carries and what its header needs.
 *
 * @param {object} entry `{path, slug, stem, text}`.
 * @param {boolean} improve false for the base result, true for the improved one.
 * @param {object} shared `{opts, owned, sourceLicence}`.
 * @returns {object} the result.
 */
function renderDocument(entry, improve, shared) {
  const { opts } = shared;
  const { strict } = entry;
  // The improved result is the base header with its times respelled (a clone, so the base stays whole).
  const frontmatterOf = improve ? structuredClone(strict.frontmatter) : strict.frontmatter;
  const mapped = mapFrontmatter(frontmatterOf, {
    body: strict.body,
    improve,
    operator: opts.operator === undefined ? 'human:unknown' : opts.operator,
    owned: shared.owned,
    path: entry.path,
    slug: entry.slug,
    sourceHash: opts.sourceHash,
    sourceLicence: shared.sourceLicence,
    sourceVersion: opts.sourceVersion,
    stem: entry.stem,
  });
  const type = String(mapped.frontmatter.type);
  const ordered = fix.orderKeys(mapped.frontmatter, fix.declaredOrder(opts.itemSchema, type), opts.itemSchema, type, null);
  const header = serialize(fix.quoteTemporal(ordered), entry.path);
  const findings = [];
  if (strict.reason !== null) {
    findings.push(finding('AGSC-E506',
      `${entry.path}: ${strict.reason}; the body was imported and the frontmatter synthesized (AGSC-01-22)`,
      { file: entry.path, severity: 'warn' }));
  }
  findings.push(...mapped.findings);
  const kinds = [];
  if (mapped.times) kinds.push('times written as UTC');
  return {
    body: strict.body,
    findings,
    header,
    kinds,
    path: `content/${TYPE_PLURAL[type]}/${entry.slug}.md`,
    unreadable: strict.reason !== null,
  };
}

/** The item file of a rendered document, with its body as given. */
function fileOf(rendered, body) {
  return { path: rendered.path, text: fix.normaliseText(`${rendered.header}${nfc(body)}`) };
}

/**
 * Choose, for one document, between the base and the improved result (`chooseResult`), with
 * the links of the improved result rewritten against `landing` (null: not rewritten yet).
 */
function decide(entry, landing, schemas, exists) {
  const base = entry.base;
  if (entry.baseFile === null) entry.baseFile = fileOf(base, base.body);
  const baseFile = entry.baseFile;
  const baseOut = { findings: base.findings, result: baseFile, unreadable: base.unreadable };
  const refuse = (why, kinds) => ({
    ...baseOut,
    findings: [...base.findings, finding('AGSC-E506',
      `${entry.path}: not applied: ${kinds.join(', ')}: ${why}; the item is written as the previous version wrote it (AGSC-01-22)`,
      { file: entry.path, severity: 'warn' })],
  });
  const improved = entry.improved;
  let body = improved.body;
  const kinds = [...improved.kinds];
  const findings = [...improved.findings];
  if (landing !== null && improved.path === base.path) {
    const written = new Set(landing.values());
    const linked = rewriteLinks(body, entry.path, improved.path, landing, written, exists);
    if (linked.rewritten > 0) {
      body = linked.body;
      kinds.push('links rewritten');
      findings.push(finding('AGSC-E506',
        `${entry.path}: ${linked.rewritten} relative link(s) now name the place the linked item is written to`
        + ' (AGSC-03-11, AGSC-01-22)',
        { file: entry.path, severity: 'warn' }));
    }
  }
  const chosen = chooseResult(baseFile, fileOf(improved, body), schemas);
  if (!chosen.applied) return refuse(chosen.why, kinds);
  return { findings, result: chosen.result, unreadable: improved.unreadable };
}

module.exports = {
  FOREIGN_LINK_NAMES,
  FORMAT, RESERVED, TYPE_PLURAL,
  chooseResult, isReserved, majorMinor, mapFrontmatter, plan, readDocument, sourceFacts, sourceOwned,
  toUtcInstant, versionRefusal, versionWarning, versionWarnings,
};
