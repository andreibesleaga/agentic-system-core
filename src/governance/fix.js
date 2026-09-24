'use strict';
/**
 * CONTEXT Governance & Provenance — use case: `lint --fix`.
 *
 * Implements the four rules that oblige the flag and, until rc.5, were obliged by
 * nothing:
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
 * and AGSC-09-09 (rc.5), which names `lint --fix` in the verb-flag list.
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

/**
 * The spans of a Markdown body that are CODE and therefore not prose: fenced blocks
 * (CommonMark 0.31.2 §4.5) and code spans (§6.1). A wikilink inside one of them is an
 * example, and rewriting it would change what the example says — which AGSC-04-20
 * forbids.
 *
 * @param {string} body
 * @returns {Array<[number, number]>} half-open [start, end) offsets, in order.
 */
function codeSpans(body) {
  const out = [];
  const text = String(body);
  // `$` is per line under `m`, so the "no closing fence" arm asserts the true end of
  // the input with `$(?![\s\S])`: an unclosed fence runs to the end of the file, which
  // is what CommonMark 0.31.2 §4.5 says ("closed by the end of the containing block").
  const fence = /^(?: {0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^(?: {0,3})\1[^\n]*(?:\n|$)|$(?![\s\S]))/gmu;
  let m = fence.exec(text);
  while (m !== null) {
    out.push([m.index, m.index + m[0].length]);
    m = fence.exec(text);
  }
  const span = /(`+)(?:[^`]|(?!\1)`)*\1/gu;
  m = span.exec(text);
  while (m !== null) {
    if (!out.some(([s, e]) => m.index >= s && m.index < e)) out.push([m.index, m.index + m[0].length]);
    m = span.exec(text);
  }
  return out.sort((a, b) => a[0] - b[0]);
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
 * @returns {{body:string, rewritten:number, left:Array<string>}}
 */
function rewriteWikilinks(body, typeOfSlug) {
  const text = String(body);
  const spans = codeSpans(text);
  const inCode = (index) => spans.some(([s, e]) => index >= s && index < e);
  const left = [];
  let rewritten = 0;
  const pattern = /(!?)\[\[([^\]|#]*)(#[^\]|]*)?(\|[^\]]*)?\]\]/gu;
  let out = '';
  let cursor = 0;
  let m = pattern.exec(text);
  while (m !== null) {
    const whole = m[0];
    if (inCode(m.index)) { m = pattern.exec(text); continue; }
    const target = m[2].trim();
    const anchor = (m[3] === undefined ? '' : m[3].slice(1)).trim();
    const alias = (m[4] === undefined ? '' : m[4].slice(1)).trim();
    const embed = m[1] === '!';
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
    m = pattern.exec(text);
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
function normaliseText(text) {
  return `${nfc(String(text).split('\r\n').join('\n').split('\r').join('\n')).replace(/\n+$/u, '')}\n`;
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
    : `---\n${String(split.yamlText).replace(/\n*$/u, '')}\n---\n`;
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
  // is recorded on its own even when the frontmatter also moved — until rc.5 it was
  // recorded only when it was the file's ONLY change, and a file that needed both
  // was reported under AGSC-E506 alone.
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
