'use strict';
/**
 * CONTEXT Governance & Provenance — use case: `lint --fix`.
 *
 * Implements the four rules that oblige the flag:
 *   AGSC-03-12  wikilinks `[[target(#anchor)?(|alias)?]]` are normalised to relative
 *               Markdown links `[alias](../<type-plural>/<slug>.md#anchor)`; `![[…]]`
 *               embeds become images or are removed; the reversed Dendron order
 *               `[[alias|note]]` is NEVER assumed without an explicit import flag.
 *   AGSC-04-14  arrays authored by a person keep author order — this module sorts
 *               NOTHING inside a value.
 *   AGSC-04-19  the normalisations are exactly: line endings, NFC, trailing newline,
 *               frontmatter key order (schema order) and wikilink rewriting; the flag
 *               is idempotent; the emitted YAML profile is the fixed one, which is
 *               `knowledge/adopt.js#serialize` and no second writer.
 *   AGSC-04-20  no prose is changed beyond that rewriting, no authored array is
 *               reordered, and no key is added, removed or inferred.
 * and AGSC-09-09, which names `lint --fix` in the verb-flag list.
 *
 * PURE. It reads no file and writes none: the caller hands it the items it already
 * loaded and receives the bytes each file WOULD hold. That is what lets the same
 * function serve the dry run and the write, and what makes idempotence testable
 * without a filesystem.
 *
 * Requirements: PRD-003. Security (`docs/SECURITY-CONSIDERATIONS.md` T3): the
 * rewriter never follows a target outside `content/`, never resolves a scheme and
 * never touches text inside a code fence or a code span, so a rewrite can neither
 * invent a link nor smuggle one into an example.
 */

const YAML = require('yaml');
const { TYPE_PLURAL } = require('../knowledge/chunks.js');
const { serialize } = require('../knowledge/adopt.js');
const { finding } = require('../knowledge/validate.js');
const { nfc, compareCodePoint } = require('../knowledge/unicode.js');
const yaml = require('../knowledge/yaml.js');
const frontmatter = require('../knowledge/frontmatter.js');
const { withoutTrailingFeeds } = require('../shared/trailing.js');

/** The extensions an `![[…]]` embed may become an image for; anything else is removed. */
const IMAGE_EXTENSIONS = Object.freeze(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']);

/**
 * AGSC-04-19's "schema order": the top-level `properties` order of
 * `schema/item.schema.json`, then the matching `oneOf` branch's `properties` order,
 * then unknown keys in code-point order.
 *
 * @param {object} itemSchema the raw `schema/item.schema.json` object.
 * @param {string} type the item's `type`, which selects the `oneOf` branch.
 * @returns {Array<string>} the declared key order; unknown keys are appended by
 *   `orderKeys` in code-point order, because the schema cannot name them.
 */
function declaredOrder(itemSchema, type) {
  const out = [];
  const push = (name) => { if (!out.includes(name)) out.push(name); };
  for (const name of Object.keys((itemSchema && itemSchema.properties) || {})) push(name);
  for (const branch of (itemSchema && itemSchema.oneOf) || []) {
    const props = (branch && branch.properties) || {};
    const constant = props.type && props.type.const;
    if (constant !== type) continue;
    for (const name of Object.keys(props)) push(name);
  }
  return out;
}

/** Follow `$ref` (local only) and `items` to the subschema that owns a value's keys. */
function subSchema(itemSchema, node) {
  let current = node;
  for (let hop = 0; hop < 8 && current != null && typeof current === 'object'; hop += 1) {
    if (typeof current.$ref === 'string') {
      const at = /^#\/\$defs\/([A-Za-z0-9_]+)$/u.exec(current.$ref);
      if (at === null) return null;
      current = ((itemSchema && itemSchema.$defs) || {})[at[1]];
      continue;
    }
    if (current.items !== undefined) { current = current.items; continue; }
    return current;
  }
  return null;
}

/** The subschema a top-level or branch property declares, or null. */
function propertySchema(itemSchema, type, key) {
  const top = ((itemSchema && itemSchema.properties) || {})[key];
  if (top !== undefined) return subSchema(itemSchema, top);
  for (const branch of (itemSchema && itemSchema.oneOf) || []) {
    const props = (branch && branch.properties) || {};
    if ((props.type && props.type.const) !== type) continue;
    if (props[key] !== undefined) return subSchema(itemSchema, props[key]);
  }
  return null;
}

/**
 * Reorder ONE mapping's keys. Nothing is added, nothing is removed and no value is
 * touched other than by recursing into a nested mapping whose own order a `$def`
 * declares (AGSC-04-19's parenthesis). An authored array keeps author order
 * (AGSC-04-14), so an array is recursed into element by element and never sorted.
 */
function orderKeys(value, order, itemSchema, type, at) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((entry) => orderKeys(entry, order, itemSchema, type, at));
  }
  const known = order.filter((name) => Object.prototype.hasOwnProperty.call(value, name));
  const unknown = Object.keys(value).filter((name) => !order.includes(name)).sort(compareCodePoint);
  const out = {};
  for (const key of [...known, ...unknown]) {
    const nested = at === null ? propertySchema(itemSchema, type, key) : null;
    const nestedOrder = nested === null || nested === undefined
      ? []
      : Object.keys((nested && nested.properties) || {});
    out[key] = nestedOrder.length === 0
      ? value[key]
      : orderKeys(value[key], nestedOrder, itemSchema, type, key);
  }
  return out;
}

/** A line terminator as a regular expression's `^` and `$` read them under the `m` flag. */
function isLineTerminator(ch) {
  return ch === '\n' || ch === '\r' || ch === '\u2028' || ch === '\u2029';
}

/** The first line start after `from`: one past the next line terminator, or -1. */
function nextLineStart(text, from, meter) {
  let i = from;
  while (i < text.length && !isLineTerminator(text[i])) i += 1;
  if (meter !== undefined) meter.steps += i - from + 1;
  return i < text.length ? i + 1 : -1;
}

/**
 * The fence character `ch` repeated at least `size` times at `at`, after at most
 * three spaces (a closing fence line), or -1; else the index after the fence.
 */
function closingFenceAt(text, at, ch, size, meter) {
  let i = at;
  while (i < text.length && text[i] === ' ' && i - at < 3) i += 1;
  let run = 0;
  while (run < size && text[i + run] === ch) run += 1;
  if (meter !== undefined) meter.steps += i - at + run + 1;
  return run === size ? i + size : -1;
}

/**
 * Fenced code blocks (CommonMark 0.31.2 §4.5), left to right: exactly the matches of
 * the pattern this module used until 1.0.0,
 * `/^(?: {0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^(?: {0,3})\1[^\n]*(?:\n|$)|$(?![\s\S]))/gmu`,
 * found line by line in time linear in the body. An opening fence is at most three
 * spaces and a run of three or more backticks or tildes at a line start, followed
 * somewhere by a line feed; the block ends at the end of the first later line that
 * starts with at most three spaces and the same run, or at the end of the body (an
 * unclosed fence is closed by the end of the containing block). Line starts are those
 * of the pattern's `^`: after a line feed, a carriage return, U+2028 or U+2029. The
 * pattern backtracked over every shorter fence when no line feed followed one, so one
 * long run of backticks took quadratic time.
 */
function fencedBlocks(text, meter) {
  const out = [];
  let at = 0;
  while (at !== -1 && at < text.length) {
    let i = at;
    while (i < text.length && text[i] === ' ' && i - at < 4) i += 1;
    const ch = text[i];
    let run = 0;
    if (i - at <= 3 && (ch === '`' || ch === '~')) while (text[i + run] === ch) run += 1;
    if (meter !== undefined) meter.steps += i - at + run + 1;
    if (run < 3) { at = nextLineStart(text, at, meter); continue; }
    const feed = text.indexOf('\n', i + run);
    if (feed === -1) break;
    if (meter !== undefined) meter.steps += feed - i - run + 1;
    let end = text.length;
    for (let line = feed + 1; line !== -1 && line < text.length; line = nextLineStart(text, line, meter)) {
      const after = closingFenceAt(text, line, ch, run, meter);
      if (after === -1) continue;
      const close = text.indexOf('\n', after);
      if (meter !== undefined) meter.steps += (close === -1 ? text.length : close) - after + 1;
      end = close === -1 ? text.length : close + 1;
      break;
    }
    out.push([at, end]);
    at = end;
  }
  return out;
}

/**
 * Code spans, left to right: exactly the matches of the pattern this module used
 * until 1.0.0, `/(`+)(?:[^`]|(?!\1)`)*\1/gu`, in time linear in the body.
 *
 * From the first backtick of a run (or from inside one, where the last match ended),
 * the pattern takes the longest opening `k` backticks for which a closing string of
 * `k` backticks exists: either inside the same run (when the rest of the run holds at
 * least `k` more) or at the start of the first later run of at least `k`. So `k` is
 * the larger of half the run and the smaller of the run and the longest later run.
 * The pattern found that by trying every `k` from every start, which was quadratic
 * in a long run of backticks.
 */
function backtickSpans(text, meter) {
  const runs = [];
  for (let i = text.indexOf('`'); i !== -1; i = text.indexOf('`', i)) {
    let j = i;
    while (text[j] === '`') j += 1;
    runs.push([i, j]);
    i = j;
  }
  if (meter !== undefined) meter.steps += text.length + 1;
  const longestFrom = new Array(runs.length + 1).fill(0);
  for (let r = runs.length - 1; r >= 0; r -= 1) {
    longestFrom[r] = Math.max(runs[r][1] - runs[r][0], longestFrom[r + 1]);
  }
  const out = [];
  let at = 0;
  let r = 0;
  for (;;) {
    while (r < runs.length && runs[r][1] <= at) r += 1;
    if (r === runs.length) break;
    const start = Math.max(at, runs[r][0]);
    const size = runs[r][1] - start;
    const k = Math.max(Math.floor(size / 2), Math.min(size, longestFrom[r + 1]));
    if (k === 0) break;
    let close = start + k;
    if (size - k < k) {
      let later = r + 1;
      while (runs[later][1] - runs[later][0] < k) later += 1;
      if (meter !== undefined) meter.steps += later - r;
      close = runs[later][0];
    }
    out.push([start, close + k]);
    at = close + k;
  }
  return out;
}

/**
 * The spans of a Markdown body that are CODE and therefore not prose: fenced blocks
 * (CommonMark 0.31.2 §4.5) and code spans (§6.1). A wikilink inside one of them is an
 * example, and rewriting it would change what the example says — which AGSC-04-20
 * forbids. A code span that starts inside a fenced block is part of the block.
 *
 * Both scans are linear in the body (`fencedBlocks`, `backtickSpans`); the result is
 * the one the two patterns gave.
 *
 * @param {string} body
 * @param {{steps:number}} [meter] counts the characters examined (linear-time tests).
 * @returns {Array<[number, number]>} half-open [start, end) offsets, in order.
 */
function codeSpans(body, meter) {
  const text = String(body);
  const fences = fencedBlocks(text, meter);
  const out = [];
  let f = 0;
  for (const span of backtickSpans(text, meter)) {
    while (f < fences.length && fences[f][1] <= span[0]) {
      out.push(fences[f]);
      f += 1;
    }
    if (f < fences.length && fences[f][0] <= span[0]) continue;
    out.push(span);
  }
  while (f < fences.length) {
    out.push(fences[f]);
    f += 1;
  }
  return out;
}

/**
 * The next wikilink at or after `from`: exactly the next match of the pattern this
 * module used until 1.0.0, `/(!?)\[\[([^\]|#]*)(#[^\]|]*)?(\|[^\]]*)?\]\]/gu`, in
 * time linear over all calls with a rising `from`. After `[[` every part stops at
 * the first `]`, so a link exists exactly when that `]` is followed by another; the
 * target ends at the first `|` or `#` before it, an anchor runs from a `#` to the
 * first `|`, and an alias from that `|` to the `]`. The pattern scanned to the end of
 * the body from every `[[` of a long run of `[`, which was quadratic.
 *
 * @returns {{index:number, whole:string, embed:boolean, target:string,
 *   anchor:(string|undefined), alias:(string|undefined)}|null}
 */
function nextWikilink(text, from, closer, meter) {
  for (let open = text.indexOf('[[', from); open !== -1; open = text.indexOf('[[', open + 1)) {
    if (meter !== undefined) meter.steps += 1;
    const close = closer(open + 2);
    if (close === -1) return null;
    if (text[close + 1] !== ']') continue;
    const index = open > from && text[open - 1] === '!' ? open - 1 : open;
    let targetEnd = open + 2;
    while (targetEnd < close && text[targetEnd] !== '|' && text[targetEnd] !== '#') targetEnd += 1;
    let anchorEnd = targetEnd;
    if (text[targetEnd] === '#') while (anchorEnd < close && text[anchorEnd] !== '|') anchorEnd += 1;
    if (meter !== undefined) meter.steps += close - open;
    return {
      index,
      whole: text.slice(index, close + 2),
      embed: index !== open,
      target: text.slice(open + 2, targetEnd),
      anchor: anchorEnd === targetEnd ? undefined : text.slice(targetEnd, anchorEnd),
      alias: anchorEnd === close ? undefined : text.slice(anchorEnd, close),
    };
  }
  return null;
}

/**
 * The first `ch` at or after `from`, for queries whose `from` never decreases: each
 * answer is kept, so a run of queries scans the text once. -1 when there is none.
 */
function forwardFinder(text, ch, meter) {
  let asked = Infinity;
  let found = -1;
  return (from) => {
    if (from >= asked && (found === -1 || from <= found)) return found;
    asked = from;
    found = text.indexOf(ch, from);
    if (meter !== undefined) meter.steps += (found === -1 ? text.length : found) - from + 1;
    return found;
  };
}

/** The relative Markdown target AGSC-03-12 prescribes for a resolved wikilink. */
function relativeTarget(type, slug, anchor) {
  const plural = TYPE_PLURAL[type] || TYPE_PLURAL.concept;
  return `../${plural}/${slug}.md${anchor === '' ? '' : `#${anchor}`}`;
}

/**
 * AGSC-03-12 over one body.
 *
 * `[[target#anchor|alias]]` is the ONLY order read: the rule says the reversed
 * Dendron order `[[alias|note]]` "MUST NOT be assumed without an explicit import
 * flag", and this module carries no such flag.
 *
 * A target no item in the Bundle answers to is LEFT ALONE: rewriting it would turn a
 * wikilink a person can still repair into a relative link to a file that does not
 * exist, and `AGSC-E310` already reports the dangling reference (AGSC-03-11).
 *
 * @param {string} body
 * @param {Map<string,string>} typeOfSlug slug → item type.
 * @param {{steps:number}} [meter] counts the characters examined (linear-time tests).
 * @returns {{body:string, rewritten:number, left:Array<string>}}
 */
function rewriteWikilinks(body, typeOfSlug, meter) {
  const text = String(body);
  const spans = codeSpans(text, meter);
  // The links come in rising order, so one pass over the spans (in order of their
  // starts) answers "is this index inside code": the furthest end of every span that
  // starts at or before it.
  let next = 0;
  let reach = 0;
  const inCode = (index) => {
    while (next < spans.length && spans[next][0] <= index) {
      reach = Math.max(reach, spans[next][1]);
      next += 1;
    }
    return index < reach;
  };
  const closer = forwardFinder(text, ']', meter);
  const left = [];
  let rewritten = 0;
  let out = '';
  let cursor = 0;
  for (let m = nextWikilink(text, 0, closer, meter); m !== null;
    m = nextWikilink(text, m.index + m.whole.length, closer, meter)) {
    const { whole, embed } = m;
    if (inCode(m.index)) continue;
    const target = m.target.trim();
    const anchor = (m.anchor === undefined ? '' : m.anchor.slice(1)).trim();
    const alias = (m.alias === undefined ? '' : m.alias.slice(1)).trim();
    let replacement = null;
    if (embed) {
      // "`![[…]]` embeds MUST be converted to images or removed" (AGSC-03-12). An
      // embed naming an image file becomes one; anything else has no image to
      // become, so it is removed rather than invented.
      const lower = target.toLowerCase();
      replacement = IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))
        ? `![${alias === '' ? target : alias}](${target})`
        : '';
    } else if (typeOfSlug.has(target)) {
      replacement = `[${alias === '' ? target : alias}](${relativeTarget(typeOfSlug.get(target), target, anchor)})`;
    } else {
      left.push(target);
    }
    if (replacement !== null) {
      out += text.slice(cursor, m.index) + replacement;
      cursor = m.index + whole.length;
      rewritten += 1;
    }
  }
  out += text.slice(cursor);
  return { body: out, left, rewritten };
}

/** AGSC-04-10 / AGSC-02-06: a date, and an instant at seconds precision, in UTC. */
const DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u;
const INSTANT = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/u;

/**
 * AGSC-02-04: "dates and instants MUST be quoted strings." AGSC-04-19's profile is
 * plain scalars "unless the value would re-parse as another type", and a date is
 * exactly that case — YAML 1.1 reads `2026-01-01` as a timestamp — so the two rules
 * agree and a temporal value keeps its quotes.
 *
 * The quoting is expressed by handing the writer a `Scalar` node with its style set,
 * rather than by a second emitter or by patching the emitted text: `adopt.js#serialize`
 * stays the ONE YAML writer (AGSC-04-19), and it renders the node it is given.
 */
function quoteTemporal(value) {
  if (Array.isArray(value)) return value.map(quoteTemporal);
  if (typeof value === 'string') {
    if (!DATE.test(value) && !INSTANT.test(value)) return value;
    const scalar = new YAML.Scalar(value);
    scalar.type = 'QUOTE_DOUBLE';
    return scalar;
  }
  if (value === null || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value)) out[key] = quoteTemporal(value[key]);
  return out;
}

/**
 * AGSC-04-19's encoding third — the one whose finding is `AGSC-E108` (AGSC-01-14),
 * where every other normalisation of that rule is `AGSC-E506`.
 */
const ENCODING_CHANGE = 'line endings, NFC and the trailing newline';

/** AGSC-04-19: LF line endings, NFC, exactly one trailing newline. */
function normaliseText(text, meter) {
  return `${withoutTrailingFeeds(nfc(String(text).split('\r\n').join('\n').split('\r').join('\n')), meter)}\n`;
}

/**
 * The bytes one item file WOULD hold after `lint --fix`.
 *
 * @param {object} item a loaded Item `{path, slug, type, frontmatter, body}`.
 * @param {object} options
 * @param {object} options.itemSchema the raw `schema/item.schema.json` object.
 * @param {Map<string,string>} options.typeOfSlug slug → type, for AGSC-03-12.
 * @param {string} options.source the file's authored bytes.
 * @returns {{after:string, before:string, changed:boolean, changes:Array<string>,
 *   findings:Array<object>, path:string}}
 */
function fixItem(item, options) {
  const path = String(item.path);
  const before = String(options.source);
  const changes = [];
  const findings = [];

  const split = frontmatter.split(before);
  if (split.hasFrontmatter !== true) {
    // No closed frontmatter block: AGSC-04-20 forbids inferring one, so only the
    // three whole-file normalisations apply. Adoption (AGSC-02-90) is `init`'s job.
    const after = normaliseText(before);
    if (after !== before) changes.push(ENCODING_CHANGE);
    return { after, before, changed: after !== before, changes, findings, path };
  }

  let parsed;
  try {
    parsed = yaml.parse(split.yamlText);
  } catch (e) {
    // A frontmatter block this engine cannot read is the parse lane's finding, not
    // this one's: `--fix` leaves the file byte-identical rather than guessing.
    return { after: before, before, changed: false, changes, findings, path };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { after: before, before, changed: false, changes, findings, path };
  }

  const type = typeof parsed.type === 'string' ? parsed.type : String(item.type || 'concept');
  const ordered = orderKeys(parsed, declaredOrder(options.itemSchema, type), options.itemSchema, type, null);

  // The block is re-emitted through the one writer, in the profile AGSC-04-19 fixes —
  // block style, two-space indentation, one space after every colon, no document
  // markers — with dates and instants kept as quoted strings (AGSC-02-04).
  // `frontmatter.split` returns the YAML text without its closing newline, so the
  // authored block is reassembled with exactly one before it is compared.
  const block = serialize(quoteTemporal(ordered));
  const authored = split.yamlText === ''
    ? '---\n---\n'
    : `---\n${withoutTrailingFeeds(String(split.yamlText))}\n---\n`;
  if (block !== authored) changes.push('frontmatter key order and the AGSC-04-19 YAML profile');

  const rewrite = rewriteWikilinks(split.body, options.typeOfSlug);
  if (rewrite.rewritten > 0) changes.push(`${rewrite.rewritten} wikilink${rewrite.rewritten === 1 ? '' : 's'} (AGSC-03-12)`);
  for (const target of rewrite.left) {
    findings.push(finding('AGSC-E506',
      `the wikilink [[${target}]] names no item of this Bundle and was left as authored (AGSC-03-12)`,
      { file: path, severity: 'warn' }));
  }

  // AGSC-04-19 reports PER NORMALISATION, not per file:
  // "a line-ending, BOM, NFC or trailing-newline normalisation under AGSC-E108 …,
  // every other normalisation of this rule under AGSC-E506". So the encoding third
  // is recorded on its own even when the frontmatter also moved, and a file that needs
  // both is never reported under AGSC-E506 alone.
  if (normaliseText(before) !== before) changes.unshift(ENCODING_CHANGE);
  const after = normaliseText(`${block}${rewrite.body}`);
  return { after, before, changed: after !== before, changes, findings, path };
}

/**
 * `lint --fix` over a whole Bundle, as data.
 *
 * @param {object} bundle the loaded Bundle.
 * @param {object} options
 * @param {object} options.itemSchema the raw `schema/item.schema.json` object.
 * @param {Map<string,string>|object} [options.sources] path → authored bytes; an
 *   item whose bytes the caller did not supply is skipped, because `--fix` compares
 *   against what is ON DISK and never against a re-serialisation of what it parsed.
 * @returns {{files:Array<object>, findings:Array<object>, changed:Array<string>}}
 */
function plan(bundle, options = {}) {
  const sources = options.sources instanceof Map
    ? options.sources
    : new Map(Object.entries(options.sources || {}));
  const typeOfSlug = new Map();
  for (const item of (bundle && bundle.items) || []) {
    const slug = String(item.slug);
    if (!typeOfSlug.has(slug)) typeOfSlug.set(slug, String(item.type || 'concept'));
  }
  const files = [];
  const findings = [];
  for (const item of (bundle && bundle.items) || []) {
    const source = sources.get(String(item.path));
    if (source === undefined) continue;
    const result = fixItem(item, { itemSchema: options.itemSchema, source, typeOfSlug });
    findings.push(...result.findings);
    files.push(result);
  }
  files.sort((a, b) => compareCodePoint(a.path, b.path));
  return {
    changed: files.filter((f) => f.changed).map((f) => f.path),
    files,
    findings,
  };
}

module.exports = {
  ENCODING_CHANGE,
  codeSpans,
  declaredOrder,
  fixItem,
  normaliseText,
  quoteTemporal,
  orderKeys,
  plan,
  propertySchema,
  relativeTarget,
  rewriteWikilinks,
  subSchema,
};
