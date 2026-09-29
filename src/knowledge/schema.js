'use strict';
// CONTEXT Knowledge — aggregate: Item / Bundle root / Configuration.
// Implements AGSC-00-09 (schema validation), AGSC-02-24 (length bounds in Unicode
// code points) and AGSC-01-10 (portable, `u`-flag regular expressions).
//
// PURE: no fs, no process, no clock, no network, no cross-context require.
//
// A thin wrapper around Ajv 2020-12 (`ajv/dist/2020`, MIT, pinned) with
// `ajv-formats`. Ajv is the validator; this file adds exactly two things the
// specification pins and Ajv does not:
//
//   1. a stable error shape `{path, keyword, message, params}` that
//      knowledge/validate.js maps onto the registered AGSC-E codes; and
//   2. `oneOf` DISCRIMINATION. The item schema's six `oneOf` branches are keyed by
//      `type` const and the configuration's `contribute[]` branches by `mode`, so a
//      failing `concept` must report the concept branch's own error and never an
//      opaque "matched no branch"; §9.4's precedence paragraph ("the more specific
//      code wins") is unsatisfiable without it.
//
// Ajv options fixed here, each for a normative reason:
//   allErrors        §9.4 precedence needs every candidate fault, not the first
//   strict           an unsupported or misspelled keyword throws AT COMPILE TIME,
//                    so a schema can never grow a keyword this engine ignores
//   strictRequired   OFF. config.schema.json and item.schema.json both
//                    compile with `strictRequired: true`; it stays off for
//                    one reason — schema/bundle.schema.json carries
//                    `"not": {"required": ["type"]}` (AGSC-01-04) and `type`
//                    is deliberately absent from that
//                    schema's `properties`, since the Bundle root is not an item.
//                    Ajv's heuristic reads that as "required property not
//                    defined" and refuses to compile. The construct is legal
//                    2020-12 and is exactly what the rule states, so the
//                    heuristic is the thing that is wrong.
//   unicodeRegExp    `pattern` compiles with the `u` flag (AGSC-01-10)
//   validateFormats  the schemas declare `format: "uri"` (config.peers[])
//
// Ajv already counts `minLength`/`maxLength` in Unicode code points, which is what
// AGSC-02-24 requires; `tests/knowledge/schema.test.js` pins that with an astral
// title, as does vector frontmatter-0030.

const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

class SchemaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SchemaError';
  }
}

function newAjv() {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    unicodeRegExp: true,
    validateFormats: true,
    allowUnionTypes: false,
    messages: true,
  });
  addFormats(ajv);
  return ajv;
}

/** Resolve a JSON pointer such as `#/properties/contribute/items/oneOf`. */
function pointer(root, schemaPath) {
  const parts = schemaPath.replace(/^#\/?/, '').split('/').filter((s) => s !== '');
  let node = root;
  for (const raw of parts) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (node === null || typeof node !== 'object') return undefined;
    node = Array.isArray(node) ? node[Number(key)] : node[key];
  }
  return node;
}

/** Resolve an Ajv `instancePath` such as `/prov/origin` against the instance. */
function atInstancePath(instance, instancePath) {
  if (!instancePath) return instance;
  let node = instance;
  for (const raw of instancePath.split('/').slice(1)) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (node === null || typeof node !== 'object') return undefined;
    node = Array.isArray(node) ? node[Number(key)] : node[key];
  }
  return node;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => deepEqual(a[k], b[k]));
}

/**
 * The unique branch index all of whose const-valued properties match the instance
 * (`type` for an item, `mode` for a `contribute[]` entry), or -1.
 */
function discriminate(branches, value) {
  if (!Array.isArray(branches) || value === null || typeof value !== 'object' || Array.isArray(value)) {
    return -1;
  }
  const candidates = [];
  branches.forEach((branch, i) => {
    const props = branch && branch.properties;
    if (!props) return;
    const consts = Object.entries(props).filter(([, s]) => s && typeof s === 'object' && 'const' in s);
    if (consts.length === 0) return;
    if (consts.every(([name, s]) => deepEqual(value[name], s.const))) candidates.push(i);
  });
  return candidates.length === 1 ? candidates[0] : -1;
}

/**
 * Reduce Ajv's `oneOf` noise to the branch the instance was aiming at. With no
 * discriminator, keep the most specific keyword any branch reported, so that §9.4's
 * precedence (enum/const beats pattern/length beats the generic failure) still holds.
 */
function narrowOneOf(errors, rootSchema, instance) {
  let out = errors;
  const oneOfErrors = errors.filter((e) => e.keyword === 'oneOf');
  for (const e of oneOfErrors) {
    const prefix = e.schemaPath; // e.g. '#/oneOf'
    const branches = pointer(rootSchema, prefix);
    const value = atInstancePath(instance, e.instancePath);
    const chosen = discriminate(branches, value);
    const attributable = (err) => err.schemaPath.startsWith(`${prefix}/`);
    const branchOf = (err) => Number(err.schemaPath.slice(prefix.length + 1).split('/')[0]);
    if (chosen >= 0) {
      out = out.filter((err) => err !== e && !(attributable(err) && branchOf(err) !== chosen));
    } else {
      const mine = out.filter(attributable);
      const specific = mine.find((x) => x.keyword === 'enum' || x.keyword === 'const')
        || mine.find((x) => ['pattern', 'minLength', 'maxLength'].includes(x.keyword));
      out = out.filter((err) => err !== e && !attributable(err));
      if (specific) out = out.concat([specific]);
    }
  }
  return out;
}

/**
 * Compile a JSON Schema 2020-12 document.
 *
 * @param {object} schemaObject the raw schema.
 * @returns {function(unknown): {valid: boolean, errors: Array<{path:string, keyword:string, message:string, params:object}>}}
 *   The returned function carries a non-enumerable `.schema` (the raw object), which
 *   knowledge/validate.js uses to derive the known-key set of AGSC-02-05.
 * @throws {SchemaError} for any keyword, format or `$ref` Ajv's strict mode rejects.
 */
function compile(schemaObject) {
  let validateFn;
  try {
    validateFn = newAjv().compile(schemaObject);
  } catch (e) {
    throw new SchemaError(e.message);
  }
  const fn = function validate(value) {
    const valid = validateFn(value);
    if (valid) return { valid: true, errors: [] };
    const narrowed = narrowOneOf(validateFn.errors || [], schemaObject, value);
    return {
      valid: false,
      errors: narrowed.map((e) => ({
        path: e.instancePath,
        keyword: e.keyword,
        message: e.message,
        params: e.params || {},
        schemaPath: e.schemaPath,
      })),
    };
  };
  Object.defineProperty(fn, 'schema', { value: schemaObject, enumerable: false });
  return fn;
}

/**
 * Every JSON Schema keyword and `format` value a schema document uses — the derived
 * list `src/README.md` publishes, so that the README can never drift from the files.
 */
function keywordsUsed(schemaObject) {
  const keywords = new Set();
  const formats = new Set();
  const walk = (node) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) {
      keywords.add(k);
      if (k === 'properties' || k === 'patternProperties' || k === '$defs') {
        Object.values(v).forEach(walk);
        continue;
      }
      if (k === 'format' && typeof v === 'string') formats.add(v);
      if (['items', 'additionalProperties', 'if', 'then', 'else', 'oneOf', 'allOf', 'anyOf', 'not'].includes(k)) {
        walk(v);
      }
    }
  };
  walk(schemaObject);
  return { keywords: [...keywords].sort(), formats: [...formats].sort() };
}

module.exports = { compile, keywordsUsed, SchemaError };
