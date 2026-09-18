'use strict';
// CONTEXT Knowledge — aggregate: Item (synthesis).
// Implements AGSC-02-90 (what adoption prepends and the two TOTAL derivations),
// AGSC-02-91 (idempotence, the slug and its `-2`/`-3` collisions), AGSC-02-92
// (an adopted item validates, warnings only), AGSC-02-93 (where the file lands and
// the alias that records where it came from) and the emitted YAML profile of
// AGSC-04-19.
//
// PURE: no fs, no process, no clock, no network, no cross-context require. This
// module SYNTHESIZES bytes; `distribution/init.js` is what moves files, copies
// assets (AGSC-02-95) and synthesizes the missing configuration (AGSC-02-94).
//
// ADOPTION NEVER ERRORS (AGSC-02-92). Every derivation below is a total function,
// so the worst outcome is a warning: `AGSC-E506` when a value was defaulted or
// normalized. That totality is the whole point of PRD-053's three-command promise.

const YAML = require('yaml');
const frontmatter = require('./frontmatter.js');
const slugs = require('./slug.js');
const { nfc, codePointLength } = require('./unicode.js');
const { finding } = require('./validate.js');

/** AGSC-01-05: never adopted as items, however common they are in a bare folder. */
const NEVER_ADOPTED = Object.freeze(['readme.md', 'index.md', '_index.md']);
/** AGSC-01-02: a file already inside one of these is already in place. */
const CONTENT_FOLDERS = Object.freeze(['concepts', 'episodes', 'procedures', 'lessons', 'clusters', 'gates']);
const TITLE_MAX = 120;
const TITLE_MIN = 3;

/** The AGSC-04-19 emitted YAML profile: block style, two spaces, plain scalars. */
const YAML_PROFILE = Object.freeze({
  schema: 'failsafe',
  indent: 2,
  indentSeq: true,
  lineWidth: 0,
  defaultStringType: 'PLAIN',
  defaultKeyType: 'PLAIN',
  directives: false,
});

/**
 * AGSC-02-90 `operator`, a total function over three sources.
 * @param {object} config `agsc.config.json` (may be empty).
 * @param {string|null} gitUserEmail the local git `user.email`, or null.
 * @returns {{operator:string, source:string, findings:Array<object>}}
 */
function operatorFor(config, gitUserEmail) {
  const findings = [];
  const configured = config && config.bundle && config.bundle.operator;
  if (typeof configured === 'string' && configured !== '') {
    return { operator: configured, source: 'config', findings };
  }
  if (typeof gitUserEmail === 'string' && gitUserEmail.includes('@')) {
    const local = nfc(gitUserEmail.slice(0, gitUserEmail.indexOf('@'))).toLowerCase();
    let id = '';
    for (const ch of local) id += /^[a-z0-9._-]$/u.test(ch) ? ch : '-';
    id = id.replace(/-+/gu, '-').replace(/^-+/u, '').replace(/-+$/u, '').replace(/^[^a-z0-9]+/u, '');
    if (id !== '') {
      findings.push(finding('AGSC-E506',
        'prov.operator was derived from git user.email (AGSC-02-90)', { severity: 'warn' }));
      return { operator: `human:${id}`, source: 'git', findings };
    }
  }
  findings.push(finding('AGSC-E506',
    'prov.operator defaulted to human:unknown (AGSC-02-90)', { severity: 'warn' }));
  return { operator: 'human:unknown', source: 'default', findings };
}

/**
 * AGSC-02-90 `title`, a total function: the first ATX heading, else the filename
 * stem; NFC-normalized and trimmed; clipped to 120 code points; shorter than 3 it
 * becomes the slug, and shorter than 3 again `note-<slug>`.
 * @returns {{title:string, findings:Array<object>}}
 */
function titleFor(body, stem, slug) {
  const findings = [];
  const heading = frontmatter.firstHeading(body);
  let title = nfc(heading == null ? String(stem) : heading).trim();
  if (codePointLength(title) > TITLE_MAX) {
    title = [...title].slice(0, TITLE_MAX).join('');
    findings.push(finding('AGSC-E506',
      `title clipped to ${TITLE_MAX} code points (AGSC-02-90)`, { severity: 'warn' }));
  }
  if (codePointLength(title) < TITLE_MIN) {
    title = slug;
    if (codePointLength(title) < TITLE_MIN) title = `note-${slug}`;
    findings.push(finding('AGSC-E506',
      'title was too short and was replaced by the slug (AGSC-02-90)', { severity: 'warn' }));
  }
  return { title, findings };
}

/** The repository-relative folder an item file already sits in, or null. */
function contentFolderOf(filePath) {
  const m = /^content\/([^/]+)\/[^/]+\.md$/u.exec(filePath);
  return m && CONTENT_FOLDERS.includes(m[1]) ? m[1] : null;
}

/** Serialize a frontmatter object to the AGSC-04-19 block, fences included. */
function serialize(frontmatterObject) {
  return `---\n${YAML.stringify(frontmatterObject, YAML_PROFILE)}---\n`;
}

/**
 * Adopt ONE bare Markdown file (AGSC-02-90…93). Never throws, never errors.
 *
 * @param {{path:string, markdown:string}} file
 * @param {{config?:object, gitUserEmail?:string|null, taken?:Set<string>}} [options]
 *   `taken` is the set of slugs already used, mutated with the slug this call takes
 *   so that AGSC-01-23's `-2`, `-3`, … suffixes run in discovery order.
 * @returns {{path:string, output:string, changed:boolean, skipped:boolean,
 *   frontmatter:(object|null), body:string, findings:Array<object>}}
 */
function adoptFile(file, options = {}) {
  const sourcePath = String(file.path).split('\\').join('/');
  const markdown = String(file.markdown);
  const taken = options.taken || new Set();
  const base = { path: sourcePath, output: markdown, changed: false, skipped: false, frontmatter: null, body: markdown, findings: [] };

  const basename = sourcePath.split('/').pop();
  if (NEVER_ADOPTED.includes(basename.toLowerCase())) {
    return {
      ...base,
      skipped: true,
      findings: [finding('AGSC-E506',
        `${basename} is never adopted as an item (AGSC-01-05)`, { file: sourcePath, severity: 'warn' })],
    };
  }
  // AGSC-02-91: the guard is a CLOSED block, not merely a first line of `---`.
  if (frontmatter.hasClosedFrontmatter(markdown)) return base;

  const findings = [];
  const stem = slugs.stemOf(sourcePath);
  let slug = slugs.slugify(stem);
  if (slug !== stem) {
    findings.push(finding('AGSC-E506',
      `slug "${slug}" was derived from the file stem "${stem}" (AGSC-02-91)`,
      { file: sourcePath, severity: 'warn', slug }));
  }
  const deduped = slugs.dedupe(slug, taken);
  if (deduped !== slug) {
    findings.push(finding('AGSC-E506',
      `slug "${slug}" was already taken; using "${deduped}" (AGSC-01-23)`,
      { file: sourcePath, severity: 'warn', slug: deduped }));
    slug = deduped;
  }
  taken.add(slug);

  const inPlaceFolder = contentFolderOf(sourcePath);
  const targetPath = inPlaceFolder ? sourcePath : `content/concepts/${slug}.md`;
  const moved = targetPath !== sourcePath;

  const operator = operatorFor(options.config, options.gitUserEmail);
  findings.push(...operator.findings.map((f) => ({ ...f, file: sourcePath })));
  const title = titleFor(markdown, stem, slug);
  findings.push(...title.findings.map((f) => ({ ...f, file: sourcePath })));

  // AGSC-02-90: exactly these keys, in the schema order of AGSC-04-19 — top-level
  // `properties` order (type, title, aliases, prov) then the concept branch's
  // (kind last). `aliases` only when AGSC-02-93 moved or renamed the file.
  const fm = { type: 'concept', title: title.title };
  if (moved) fm.aliases = [sourcePath];
  fm.prov = { origin: 'human', operator: operator.operator };
  fm.kind = 'explainer';

  return {
    path: targetPath,
    output: `${serialize(fm)}\n${markdown}`,
    changed: true,
    skipped: false,
    frontmatter: fm,
    body: markdown,
    findings,
  };
}

/**
 * Adopt a whole folder in AGSC-01-15 discovery order (a code-point sort of the
 * repository-relative path), so that AGSC-01-23's collision suffixes are
 * deterministic. Idempotent by AGSC-02-91: adopting the result changes nothing.
 *
 * @param {Array<{path:string, markdown:string}>} files
 * @param {{config?:object, gitUserEmail?:string|null}} [options]
 * @returns {{files:Array<object>, findings:Array<object>}}
 */
function adopt(files, options = {}) {
  const ordered = [...files].sort((a, b) => slugs.compareCodePoint(
    String(a.path).split('\\').join('/'), String(b.path).split('\\').join('/')
  ));
  const taken = new Set();
  const results = ordered.map((f) => adoptFile(f, { ...options, taken }));
  return { files: results, findings: results.flatMap((r) => r.findings) };
}

/**
 * AGSC-02-95 (input to distribution/init.js, which owns the copying and AGSC-E507):
 * every relative Markdown link or image reference in a body. Absolute URLs,
 * fragment-only targets and `mailto:` are excluded, exactly as the rule requires.
 * @returns {Array<{reference:string, image:boolean}>}
 */
function relativeReferences(body) {
  const out = [];
  const re = /(!?)\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/gu;
  let m = re.exec(String(body));
  while (m !== null) {
    const target = m[2];
    if (!/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(target) && !target.startsWith('#') && !target.startsWith('//')) {
      out.push({ reference: target, image: m[1] === '!' });
    }
    m = re.exec(String(body));
  }
  return out;
}

module.exports = {
  adopt,
  adoptFile,
  operatorFor,
  titleFor,
  serialize,
  relativeReferences,
  NEVER_ADOPTED,
  YAML_PROFILE,
  TITLE_MAX,
  TITLE_MIN,
};
