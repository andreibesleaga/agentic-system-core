'use strict';
// CONTEXT Knowledge — aggregate: Item, Bundle root, Configuration.
// Implements AGSC-00-15 (unknown keys preserved), AGSC-01-03 (placement),
// AGSC-01-11 (slug identity), AGSC-01-18 (closed configuration), AGSC-02-05 and
// AGSC-02-05a (key names, the `x-` vendor namespace), AGSC-02-07/AGSC-08-01 (prov),
// AGSC-02-21 (AGSC-E408), AGSC-02-24 (length bounds) and the §9.4 code precedence.
//
// PURE: no fs, no process, no clock, no network, no cross-context require.
//
// Faults are FINDINGS, never exceptions: a malformed item is a domain fact this
// engine reports, not a programming error. The only throw here is a SchemaError
// from schema.js, which means the SCHEMA is wrong — a programming fault.
//
// §9.4 precedence, implemented once in `codeFor` so that two conforming engines
// report the same code for the same input:
//   enum / const / `tags.allowed`        -> AGSC-E203
//   pattern / minLength / maxLength      -> AGSC-E204   (lengths in code points)
//   required                             -> AGSC-E202, except `prov` -> AGSC-E501
//                                          and `prov.operator` -> AGSC-E503
//   `broader` maxItems on a cluster      -> AGSC-E308   (never AGSC-E201)
//   unknown configuration key            -> AGSC-E004
//   anything else no code names          -> AGSC-E201

const { compile } = require('./schema.js');
const { nfc, codePointLength, compareCodePoint } = require('./unicode.js');

/** AGSC-01-02: the folder each `type` lives in. */
const TYPE_PLURAL = Object.freeze({
  concept: 'concepts',
  episode: 'episodes',
  procedure: 'procedures',
  lesson: 'lessons',
  cluster: 'clusters',
  gate: 'gates',
});

/** AGSC-02-05: the general frontmatter key-name grammar. */
const KEY_NAME_RE = /^[a-z][a-z0-9_-]*$/u;
/** AGSC-02-05a: the reserved `x-<vendor>-<key>` extension namespace. */
const VENDOR_KEY_RE = /^x-[a-z0-9]+(-[a-z0-9]+)+$/u;
/** AGSC-02-21: the two types lint requires a `description` on. */
/** AGSC-01-21, §2.2 table: the tag count outside which lint warns (AGSC-E213). */
const TAGS_MIN = 2;
const TAGS_MAX = 5;

const DESCRIPTION_REQUIRED_TYPES = Object.freeze(['concept', 'cluster']);

/**
 * Build one AGSC-09-11 Finding. `severity` is the literal `warn`, never `warning`.
 * @returns {{code:string, col:number, file:string, line:number, message:string, severity:string}}
 */
function finding(code, message, extra = {}) {
  const f = {
    code,
    col: extra.col == null ? 1 : extra.col,
    file: extra.file == null ? '' : extra.file,
    line: extra.line == null ? 1 : extra.line,
    message,
    severity: extra.severity === 'warn' ? 'warn' : 'error',
  };
  if (extra.slug != null) f.slug = extra.slug;
  if (extra.key != null) f.key = extra.key;
  return f;
}

/**
 * AGSC-09-11: every Finding carries `code`, `col`, `file`, `line`, `message` and
 * `severity`. A finding about a whole file (a folder note, a missing file) is made
 * without a position; it takes line 1 and column 1, and one made without a file takes
 * the empty path — the defaults of `finding()` above, so both kinds sort and serialise
 * alike (AGSC-09-10, AGSC-04-04). Every other member is kept; a member whose value is
 * `undefined` is dropped, because no JSON form exists for it.
 * @param {object} f
 * @returns {object}
 */
function withPosition(f) {
  const out = {};
  for (const [k, v] of Object.entries(f || {})) if (v !== undefined) out[k] = v;
  if (out.col == null) out.col = 1;
  if (out.file == null) out.file = '';
  if (out.line == null) out.line = 1;
  out.message = out.message == null ? '' : String(out.message);
  return out;
}

/**
 * AGSC-09-11: one fault is counted once. Two lanes that see the same fault report
 * byte-identical findings (the lint lane and the build lane both read an item's
 * frontmatter); the second is dropped. Findings that differ in any member are kept.
 * @param {Array<object>} findings findings already passed through `withPosition`
 * @param {(value:object)=>string} keyOf a canonical serialisation
 * @returns {Array<object>}
 */
function uniqueFindings(findings, keyOf) {
  const seen = new Set();
  const out = [];
  for (const f of findings) {
    const key = keyOf(f);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

/** AGSC-09-10: order findings by (file, line, col, code), compared code-point-wise. */
function sortFindings(findings) {
  return [...findings].sort((a, b) => compareCodePoint(a.file, b.file)
    || a.line - b.line
    || a.col - b.col
    || compareCodePoint(a.code, b.code));
}

/**
 * Compile the three schema documents once. knowledge/ never reads files: the caller
 * (adapters/node-fs.js `readSchemas`) hands the raw objects in.
 * @param {{item:object, config:object, bundle:object}} raw
 * @returns {{item:Function, config:Function, bundle:Function}}
 */
function schemas(raw) {
  return { item: compile(raw.item), config: compile(raw.config), bundle: compile(raw.bundle) };
}

/** The `oneOf` branch of the item schema that a `type` selects, or null. */
function branchFor(itemSchema, type) {
  for (const branch of itemSchema.oneOf || []) {
    const c = branch.properties && branch.properties.type && branch.properties.type.const;
    if (c === type) return branch;
  }
  return null;
}

/**
 * AGSC-00-15 / AGSC-02-05 / AGSC-02-05a: classify the keys a document carries.
 * Unknown keys are always PRESERVED; this only says how they are reported.
 * @returns {{known:string[], vendor:string[], unknown:string[], malformed:string[]}}
 */
function unknownKeys(frontmatter, options = {}) {
  const schema = options.schema || (options.schemas && options.schemas.item.schema);
  const type = frontmatter && frontmatter.type;
  const allowed = new Set(Object.keys((schema && schema.properties) || {}));
  const branch = schema ? branchFor(schema, type) : null;
  if (branch) for (const k of Object.keys(branch.properties || {})) allowed.add(k);
  const out = { known: [], vendor: [], unknown: [], malformed: [] };
  for (const key of Object.keys(frontmatter || {})) {
    if (allowed.has(key)) out.known.push(key);
    else if (VENDOR_KEY_RE.test(key)) out.vendor.push(key);
    else if (!KEY_NAME_RE.test(key)) out.malformed.push(key);
    else out.unknown.push(key);
  }
  return out;
}

// AGSC-02-04: how a typed scalar MUST be written, and therefore the only forms this
// reader will coerce. Anything else stays the failsafe string, so the schema reports
// the fault honestly instead of the reader inventing a value.
const INTEGER_RE = /^-?(?:0|[1-9][0-9]*)$/u;
const NUMBER_RE = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][-+]?[0-9]+)?$/u;

function deref(schema, root, depth = 0) {
  let node = schema;
  let guard = depth;
  while (node && typeof node === 'object' && node.$ref) {
    if (guard > 32) return node;
    guard += 1;
    const name = node.$ref === '#' ? null : node.$ref.replace('#/$defs/', '');
    node = name === null ? root : (root.$defs || {})[name];
    if (!node) return {};
  }
  return node || {};
}

function coerceScalar(value, types) {
  if (typeof value !== 'string') return value;
  if (types.includes('integer') && INTEGER_RE.test(value)) return Number(value);
  if (types.includes('number') && NUMBER_RE.test(value)) return Number(value);
  if (types.includes('boolean') && (value === 'true' || value === 'false')) return value === 'true';
  return value;
}

/**
 * AGSC-02-03, second half: "a reader MUST parse with the YAML failsafe schema —
 * every scalar is a string — and MUST APPLY TYPES FROM schema/item.schema.json".
 *
 * The failsafe reader hands back strings everywhere; this walks the schema and turns
 * a string into the integer, number or boolean the schema declares for that position
 * (`cluster.order`, `concept.signature`, `episode.usage.tokens_in`, …), in the exact
 * written forms AGSC-02-04 pins. A key the schema does not type keeps its string, so
 * `scale: 1e3` on an unknown key stays `"1e3"` (vector fm-0006).
 *
 * @param {unknown} value the parsed frontmatter.
 * @param {object} schema the schema to read the types from.
 * @returns {unknown} a new value; the input is never mutated.
 */
function applyTypes(value, schema, root) {
  const rootSchema = root || schema;
  const s = deref(schema, rootSchema);
  const declared = s.type === undefined ? [] : (Array.isArray(s.type) ? s.type : [s.type]);

  if (Array.isArray(value)) {
    const itemSchema = s.items;
    return itemSchema ? value.map((v) => applyTypes(v, itemSchema, rootSchema)) : value;
  }
  if (value !== null && typeof value === 'object') {
    const branches = [s];
    if (Array.isArray(s.oneOf)) {
      for (const branch of s.oneOf) {
        const b = deref(branch, rootSchema);
        const consts = Object.entries(b.properties || {})
          .filter(([, ps]) => ps && typeof ps === 'object' && 'const' in ps);
        if (consts.length > 0 && consts.every(([n, ps]) => value[n] === ps.const)) branches.push(b);
      }
    }
    if (Array.isArray(s.allOf)) for (const a of s.allOf) branches.push(deref(a, rootSchema));
    const out = {};
    for (const key of Object.keys(value)) {
      let sub;
      for (const b of branches) {
        if (b.properties && Object.prototype.hasOwnProperty.call(b.properties, key)) sub = b.properties[key];
        if (b.patternProperties) {
          for (const p of Object.keys(b.patternProperties)) {
            if (new RegExp(p, 'u').test(key)) sub = b.patternProperties[p];
          }
        }
      }
      out[key] = sub ? applyTypes(value[key], sub, rootSchema) : value[key];
    }
    return out;
  }
  return coerceScalar(value, declared);
}

/**
 * AGSC-00-25: the configuration names this specification RESERVES to a later
 * version. They are rejected by NOT being in `schema/config.schema.json` — the way
 * a closed schema reserves a name — and are named here only so that the diagnostic
 * can say WHY, which is the difference between a typo and a 1.1 configuration.
 */
const RESERVED_CONFIG_NAMES = Object.freeze(['routing', 'rdfxml', 'feed']);

/** §9.4 precedence. `ctx` is `item`, `index` or `config`. */
function codeFor(error, ctx) {
  const { keyword, path, params } = error;
  if (keyword === 'required') {
    const missing = params.missingProperty;
    if (ctx !== 'config' && path === '' && missing === 'prov') return 'AGSC-E501';
    if (ctx !== 'config' && path === '/prov' && missing === 'operator') return 'AGSC-E503';
    return 'AGSC-E202';
  }
  if (keyword === 'enum' || keyword === 'const') return 'AGSC-E203';
  if (keyword === 'pattern' || keyword === 'minLength' || keyword === 'maxLength') return 'AGSC-E204';
  if (keyword === 'maxItems' && /(^|\/)broader$/u.test(path)) return 'AGSC-E308';
  if (keyword === 'format') return 'AGSC-E204';
  if (keyword === 'additionalProperties' && ctx === 'config') return 'AGSC-E004';
  return 'AGSC-E201';
}

/**
 * Where a configuration error IS, in the spelling an operator uses to find it:
 * `routing`, `agents[0].routing`. A JSON Pointer names the CONTAINER of an
 * `additionalProperties` error and not the offending key, so "/: must NOT have
 * additional properties" left the reader to guess which of their keys was wrong —
 * and AGSC-00-25 makes that guess matter, because one of the names a 1.0 tool
 * rejects here is a name reserved to 1.1.
 *
 * @param {{path:string, keyword:string, params:object}} error
 * @returns {string}
 */
function locationOf(error) {
  const dotted = String(error.path || '')
    .split('/').filter((seg) => seg !== '')
    .map((seg) => (/^\d+$/u.test(seg) ? `[${seg}]` : `.${seg}`))
    .join('')
    .replace(/^\./u, '');
  const extra = error.keyword === 'additionalProperties'
    ? String((error.params || {}).additionalProperty || '') : '';
  if (extra === '') return dotted === '' ? '/' : dotted;
  return dotted === '' ? extra : `${dotted}.${extra}`;
}

function lineOf(keyLines, path) {
  if (!keyLines) return 1;
  const top = String(path || '').split('/')[1];
  const hit = keyLines.get ? keyLines.get(top) : keyLines[top];
  return hit == null ? 1 : hit;
}

/**
 * Validate one item's frontmatter (AGSC-02). Returns Findings, never throws.
 *
 * @param {object} frontmatter the parsed frontmatter object (failsafe strings).
 * @param {{schemas:object, file?:string, keyLines?:Map, slug?:string, config?:object}} options
 * @returns {Array<object>} Findings ordered per AGSC-09-10.
 */
function item(frontmatter, options = {}) {
  const { schemas: s, file = '', keyLines, slug } = options;
  const base = { file, slug };
  const findings = [];
  if (frontmatter === null || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
    findings.push(finding('AGSC-E201', 'frontmatter is not a mapping', base));
    return findings;
  }

  const result = s.item(frontmatter);
  for (const e of result.errors) {
    findings.push(finding(
      codeFor(e, 'item'),
      `${e.path || '/'}: ${e.message}`,
      { ...base, line: lineOf(keyLines, e.path) },
    ));
  }

  const keys = unknownKeys(frontmatter, { schemas: s });
  for (const key of keys.malformed) {
    findings.push(finding('AGSC-E204', `key name "${key}" does not match ^[a-z][a-z0-9_-]*$ (AGSC-02-05)`,
      { ...base, key, line: lineOf(keyLines, `/${key}`) }));
  }
  for (const key of keys.unknown) {
    findings.push(finding('AGSC-E207', `unknown key "${key}" is preserved (AGSC-02-05)`,
      { ...base, key, severity: 'warn', line: lineOf(keyLines, `/${key}`) }));
  }
  // AGSC-02-05a: a reserved x- vendor key is preserved verbatim and never warned.

  // AGSC-02-21: a concept or cluster with no description is a warning, never an error,
  // because the schema leaves `description` optional so an adopted file validates
  // (AGSC-02-92, vector adopt-0003).
  if (DESCRIPTION_REQUIRED_TYPES.includes(frontmatter.type)
      && (frontmatter.description == null || frontmatter.description === '')) {
    findings.push(finding('AGSC-E408', `a ${frontmatter.type} carries no description (AGSC-02-21)`,
      { ...base, severity: 'warn' }));
  }

  // AGSC-01-21: the 2–5 count of the §2.2 table is a WARNING,
  // with or without a closed vocabulary; the schema carries no bound for it.
  if (Array.isArray(frontmatter.tags) && (frontmatter.tags.length < TAGS_MIN || frontmatter.tags.length > TAGS_MAX)) {
    findings.push(finding('AGSC-E213',
      `tags carries ${frontmatter.tags.length} value${frontmatter.tags.length === 1 ? '' : 's'}; the §2.2 table asks for ${TAGS_MIN} to ${TAGS_MAX} (AGSC-01-21)`,
      { ...base, line: lineOf(keyLines, '/tags'), severity: 'warn' }));
  }

  // AGSC-00-17: an item MAY carry `spec_version`; when it does, its MAJOR is the one
  // the Bundle root fixes (`agsc.config.json`), and another MAJOR is `AGSC-E204`.
  const own = options.config && options.config.spec_version;
  if (typeof frontmatter.spec_version === 'string' && typeof own === 'string'
      && !majorCompatible(frontmatter.spec_version, own)) {
    findings.push(finding('AGSC-E204',
      `spec_version "${frontmatter.spec_version}" carries another MAJOR than the Bundle root's "${own}" (AGSC-00-17)`,
      { ...base, key: 'spec_version', line: lineOf(keyLines, '/spec_version') }));
  }

  // AGSC-01-21: a tag outside the closed vocabulary, when the Bundle declares one.
  const allowed = options.config && options.config.tags && options.config.tags.allowed;
  if (Array.isArray(allowed) && Array.isArray(frontmatter.tags)) {
    for (const tag of frontmatter.tags) {
      if (!allowed.includes(tag)) {
        findings.push(finding('AGSC-E203', `tag "${tag}" is outside tags.allowed (AGSC-01-21)`,
          { ...base, line: lineOf(keyLines, '/tags') }));
      }
    }
  }

  return sortFindings(findings);
}

/**
 * Validate `content/index.md` frontmatter against schema/bundle.schema.json
 * (AGSC-01-04). The root is NOT an item and MUST NOT carry `type`.
 */
function index(frontmatter, options = {}) {
  const { schemas: s, file = 'content/index.md', keyLines } = options;
  const findings = [];
  if (frontmatter === null || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
    return [finding('AGSC-E201', 'frontmatter is not a mapping', { file })];
  }
  for (const e of s.bundle(frontmatter).errors) {
    // bundle.schema.json's one `not` is `{"required": ["type"]}`.
    // AGSC-01-04 names AGSC-E205 for a `type` key on the Bundle root
    // — a file-placement violation, because the root is not an item — and the
    // §9.4 precedence paragraph reserves AGSC-E201 for a schema failure that no
    // more specific registered code names. The dedicated check below raises that
    // one finding, with the key's own line, so the schema failure adds nothing.
    if (e.keyword === 'not' && e.schemaPath === '#/not'
      && Object.prototype.hasOwnProperty.call(frontmatter, 'type')) continue;
    findings.push(finding(codeFor(e, 'index'), `${e.path || '/'}: ${e.message}`,
      { file, line: lineOf(keyLines, e.path) }));
  }
  if (Object.prototype.hasOwnProperty.call(frontmatter, 'type')) {
    findings.push(finding('AGSC-E205', 'the Bundle root MUST NOT carry `type` (AGSC-01-04)',
      { file, line: lineOf(keyLines, '/type') }));
  }
  const keys = unknownKeys(frontmatter, { schema: s.bundle.schema });
  // §9.4 precedence: `type` on the root is already the more specific AGSC-E205.
  for (const key of keys.unknown.filter((k) => k !== 'type')) {
    findings.push(finding('AGSC-E207', `unknown key "${key}" is preserved (AGSC-02-05)`,
      { file, key, severity: 'warn', line: lineOf(keyLines, `/${key}`) }));
  }
  return sortFindings(findings);
}

/**
 * Validate `agsc.config.json` (AGSC-01-17, AGSC-01-18). Configuration is CLOSED:
 * an unknown key is AGSC-E004, not a warning.
 *
 * The agent-lane semantics of AGSC-01-36/37/38 (AGSC-E212/E509/E510/E511) belong to
 * the Governance context. Knowledge never reaches into Governance, so the check is
 * INJECTED as `options.checkAgents` by the application layer that owns both. The
 * context-boundary test enforces the direction of that arrow.
 */
function config(configObject, options = {}) {
  const { schemas: s, file = 'agsc.config.json' } = options;
  const findings = [];
  if (configObject === null || typeof configObject !== 'object' || Array.isArray(configObject)) {
    return [finding('AGSC-E004', 'agsc.config.json is not a JSON object', { file })];
  }
  for (const e of s.config(configObject).errors) {
    // AGSC-01-18 / AGSC-00-25: `agsc.config.json` is the one CLOSED surface of this
    // format, so an unknown key is a refusal and not a preserved unknown — and the
    // refusal names the key, because a reserved name (`routing`) and a typo are
    // both AGSC-E004 and the operator must be able to tell which they wrote.
    const where = locationOf(e);
    const reserved = e.keyword === 'additionalProperties'
      && RESERVED_CONFIG_NAMES.includes(String((e.params || {}).additionalProperty || ''));
    findings.push(finding(codeFor(e, 'config'),
      `${where}: ${e.message}${reserved ? ' — that name is RESERVED to a later version of this'
        + ' specification and a 1.0 tool rejects it rather than running with it ignored'
        + ' (AGSC-00-25, AGSC-00-21)' : ''}`,
      { file, key: e.keyword === 'additionalProperties' ? String((e.params || {}).additionalProperty || '') : undefined }));
  }
  // AGSC-00-15 (2026-09-25): a Bundle whose `spec_version` has a MAJOR this tool does
  // not implement is refused (`AGSC-E004`, the exit-2 class of AGSC-09-08); a newer
  // MINOR of the tool's own MAJOR is read, with a warning. The tool's version is
  // INJECTED as `options.ownVersion`: this module knows no version of its own.
  const { ownVersion } = options;
  if (typeof ownVersion === 'string' && typeof configObject.spec_version === 'string') {
    const declared = /^(\d+)\.(\d+)\./u.exec(configObject.spec_version);
    const own = /^(\d+)\.(\d+)\./u.exec(ownVersion);
    if (declared && own && declared[1] !== own[1]) {
      findings.push(finding('AGSC-E004',
        `spec_version: "${configObject.spec_version}" has MAJOR ${declared[1]}; this tool implements ${ownVersion} and reads MAJOR ${own[1]} alone (AGSC-00-15)`,
        { file, key: 'spec_version' }));
    } else if (declared && own && Number(declared[2]) > Number(own[2])) {
      findings.push(finding('AGSC-E506',
        `spec_version: "${configObject.spec_version}" is a newer MINOR than this tool's ${ownVersion}; the Bundle is read, and a key of that MINOR would be refused as unknown (AGSC-00-15)`,
        { file, key: 'spec_version', severity: 'warn' }));
    }
  }
  const { checkAgents } = options;
  if (typeof checkAgents === 'function' && Array.isArray(configObject.agents)) {
    for (const f of checkAgents(configObject) || []) findings.push({ file, ...f });
  }
  return sortFindings(findings);
}

/**
 * AGSC-05-05: an item that carries `iri` MUST carry the computed one,
 * `<site.base>/<type-plural>/<slug>/` (AGSC-05-01); a mismatch is `AGSC-E204`.
 * @param {string} filePath `content/<type-plural>/<slug>.md`
 * @param {object} frontmatter
 * @param {string} base `site.base`
 */
function itemIri(filePath, frontmatter, base) {
  if (!frontmatter || frontmatter.iri == null || typeof base !== 'string' || base === '') return [];
  const m = /^content\/([a-z]+)\/([^/.]+)(?:\.[^/]+)?\.md$/u.exec(String(filePath).split('\\').join('/'));
  if (!m) return [];
  const expected = `${base.replace(/\/+$/u, '')}/${m[1]}/${m[2]}/`;
  if (String(frontmatter.iri) === expected) return [];
  return [finding('AGSC-E204', `iri "${frontmatter.iri}" is not the computed item IRI "${expected}" (AGSC-05-05)`,
    { file: filePath, slug: m[2] })];
}

/**
 * AGSC-01-02 / AGSC-01-03 / AGSC-01-11: the file MUST live at
 * `content/<type-plural>/<slug>.md` and its `type` MUST match the folder.
 * Language variants are `<slug>.<lang>.md` (AGSC-01-13) and keep the primary's slug.
 */
function placement(filePath, frontmatter) {
  const findings = [];
  const path = String(filePath).split('\\').join('/');
  const type = frontmatter && frontmatter.type;
  const expected = TYPE_PLURAL[type];
  const m = /^content\/([^/]+)\/([^/]+)\.md$/u.exec(path);
  if (!m) {
    findings.push(finding('AGSC-E205',
      `"${path}" is not content/<type-plural>/<slug>.md (AGSC-01-02)`, { file: path }));
    return findings;
  }
  const [, folder, stem] = m;
  if (!expected) {
    findings.push(finding('AGSC-E205', `unknown item type "${type}" (AGSC-01-03)`, { file: path }));
    return findings;
  }
  if (folder !== expected) {
    findings.push(finding('AGSC-E205',
      `type "${type}" requires the folder content/${expected}/, found content/${folder}/ (AGSC-01-03)`,
      { file: path }));
  }
  const dot = stem.indexOf('.');
  const slug = dot < 0 ? stem : stem.slice(0, dot);
  const lang = dot < 0 ? null : stem.slice(dot + 1);
  if (lang !== null && frontmatter && frontmatter.lang
      && String(frontmatter.lang).toLowerCase() !== lang.toLowerCase()) {
    findings.push(finding('AGSC-E205',
      `language suffix ".${lang}" disagrees with lang: ${frontmatter.lang} (AGSC-01-13)`,
      { file: path, slug }));
  }
  if (frontmatter && frontmatter.id != null && frontmatter.id !== slug) {
    findings.push(finding('AGSC-E204',
      `id "${frontmatter.id}" must equal the slug "${slug}" (AGSC-01-11)`, { file: path, slug }));
  }
  return findings;
}

/**
 * AGSC-00-15 / AGSC-00-17: a reader accepts any file whose `spec_version` MAJOR
 * equals its own (vector bundle-0001).
 */
function majorCompatible(declared, own) {
  if (declared == null) return true;
  const a = /^([0-9]+)\./u.exec(String(declared));
  const b = /^([0-9]+)\./u.exec(String(own));
  return Boolean(a && b && a[1] === b[1]);
}

module.exports = {
  schemas,
  applyTypes,
  item,
  index,
  config,
  itemIri,
  placement,
  unknownKeys,
  majorCompatible,
  sortFindings,
  finding,
  withPosition,
  uniqueFindings,
  codeFor,
  TYPE_PLURAL,
  nfc,
  codePointLength,
};
