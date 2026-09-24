'use strict';
// verifies AGSC-00-03, AGSC-00-16, AGSC-04-04, AGSC-04-07, AGSC-06-10, AGSC-09-05, AGSC-09-15, AGSC-09-91
// The standard is internally consistent. Each test reads the artefacts of the
// distribution (spec/, schema/, tests/vectors/, the Internet-Draft) and, where a
// behaviour is involved, one real build of tests/standard/_fixture.js:
//
//   * every live vector cites a rule that exists and is not retired;
//   * the §9.4 registry and the codes the rules name are the same set, the engine
//     raises only registered, assignable codes, and the registered codes it never
//     raises are a known, explained list;
//   * every schema `$id` and `$ref` resolves;
//   * every relation and extension target attribute the discovery document emits
//     is one the rules admit, and every admitted name is documented;
//   * every text the build emits is UTF-8 NFC with one trailing LF and no BOM,
//     and every JSON artefact is JCS-canonical;
//   * the Internet-Draft's normative lists about the well-known file agree with
//     spec/06 (see the last test for what that extractor can and cannot check).
//
// The ontology ↔ graph-writer closure, both directions, is
// tests/ontology/property-coverage.test.js and is not repeated here.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { canonicalize } = require('json-canonicalize');

const { ROOT, richBuild } = require('./_fixture.js');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const SPEC = fs.readdirSync(path.join(ROOT, 'spec')).filter((f) => f.endsWith('.md')).sort()
  .map((f) => read(`spec/${f}`)).join('\n');

function walk(rel, keep) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
    const next = `${rel}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(next, keep));
    else if (keep(next)) out.push(next);
  }
  return out.sort();
}

const RULES = (() => {
  const active = new Set();
  const retired = new Set();
  for (const m of SPEC.matchAll(/\*\*(AGSC-\d{2}-\d{2,3}[a-z]?)\*\*( \*\(retired at rc)?/gu)) {
    (m[2] ? retired : active).add(m[1]);
  }
  for (const id of retired) active.delete(id);
  return { active, retired };
})();

const VECTORS = walk('tests/vectors', (f) => f.endsWith('.json')).map((f) => ({ file: f, ...JSON.parse(read(f)) }));

test('every live vector cites an active rule; a withdrawn one carries a reason and a live successor', () => {
  assert.ok(VECTORS.length >= 150, `only ${VECTORS.length} vectors were read`);
  const ids = new Set(VECTORS.map((v) => v.id));
  for (const v of VECTORS) {
    if (v.level === 'withdrawn') {
      assert.ok(typeof v.reason === 'string' && v.reason.length > 0, `${v.id}: withdrawn without a reason (AGSC-09-05)`);
      assert.deepStrictEqual(v.expected, { withdrawn: true }, `${v.id}: a withdrawn vector keeps an expectation`);
      // AGSC-00-03/00-16: the wrong file is republished as withdrawn and a new file
      // carries the correction; supersession is transitive (a successor may itself
      // be withdrawn and superseded), and the chain ends at a live vector.
      const byId = new Map(VECTORS.map((w) => [w.id, w]));
      const next = (w) => {
        const named = /(?:[Ss]uperseded by|successor|republished as|ships as|carried[^.]*? in) ([a-z]+-\d{4})/u.exec(w.reason || '');
        if (named) return named[1];
        const live = VECTORS.find((x) => x.level !== 'withdrawn'
          && new RegExp(`\\b${w.id}\\b`, 'u').test(`${x.description} ${x.note || ''}`));
        return live ? live.id : null;
      };
      let at = v;
      const seen = new Set();
      while (at && at.level === 'withdrawn' && !seen.has(at.id)) {
        seen.add(at.id);
        const id = next(at);
        at = id === null ? null : byId.get(id);
      }
      assert.ok(at && at.level !== 'withdrawn', `${v.id}: withdrawn, and no chain of successors ends at a live vector`);
      assert.ok(ids.has(at.id));
      continue;
    }
    assert.ok(RULES.active.has(v.rule), `${v.id} cites ${v.rule}, which is ${RULES.retired.has(v.rule) ? 'retired' : 'not a rule'}`);
  }
});

const REGISTRY = [...read('spec/09-conformance.md').matchAll(/^\| `(AGSC-E\d{3})` \| (.*?) \|/gmu)]
  .map((m) => ({ code: m[1], text: m[2] }));
const RESERVED = new Set(REGISTRY.filter((r) => /never raised|never emitted|unassigned/iu.test(r.text)).map((r) => r.code));

/**
 * Registered codes the reference engine does not raise, each with the reason. A new
 * entry here is a decision, so the list is asserted exactly.
 */
const NOT_RAISED = Object.freeze({
  'AGSC-E208': 'language variants are not implemented by the reference engine yet (AGSC-01-13)',
  'AGSC-E410': 'language variants are not implemented by the reference engine yet (AGSC-01-13a)',
  'AGSC-E604': 'every emitted text is normalised to NFC by construction, so the fault cannot arise (AGSC-04-07)',
  'AGSC-E706': 'a content-branch commit outside the pull-request path is a forge fact (AGSC-08-26)',
});

test('the §9.4 registry and the codes the rules name are one set (AGSC-09-15, AGSC-09-91)', () => {
  const registered = new Set(REGISTRY.map((r) => r.code));
  assert.strictEqual(registered.size, REGISTRY.length, 'a code has two registry rows');
  const named = new Set(SPEC.match(/AGSC-E\d{3}/gu));
  for (const code of named) assert.ok(registered.has(code), `${code} is named by the specification and not registered`);
  for (const code of registered) assert.ok(named.has(code), `${code} is registered and named nowhere`);
  assert.ok(registered.size >= 90);
});

test('the engine raises only registered, assignable codes, and the ones it never raises are known', () => {
  const sources = [...walk('src', (f) => f.endsWith('.js')), ...walk('bin', () => true)];
  const raised = new Set();
  for (const f of sources) for (const code of read(f).match(/AGSC-E\d{3}/gu) || []) raised.add(code);
  const registered = new Set(REGISTRY.map((r) => r.code));
  for (const code of raised) assert.ok(registered.has(code), `the engine names ${code}, which is not registered`);
  const unraised = [...registered].filter((c) => !raised.has(c) && !RESERVED.has(c)).sort();
  assert.deepStrictEqual(unraised, Object.keys(NOT_RAISED).sort(),
    'the registered codes the engine never raises changed; decide and update NOT_RAISED');
  // A reserved code never appears in a finding the engine builds.
  for (const f of sources) {
    for (const code of RESERVED) {
      assert.ok(!new RegExp(`finding\\(\\s*'${code}'`, 'u').test(read(f)), `${f} raises the reserved ${code}`);
    }
  }
});

test('every schema $id and $ref resolves', () => {
  const schemas = walk('schema', (f) => f.endsWith('.json')).map((f) => ({ file: f, json: JSON.parse(read(f)) }));
  const byId = new Map(schemas.map((s) => [s.json.$id, s.json]));
  assert.ok(schemas.length >= 3);
  for (const s of schemas) {
    // AGSC-06-01 (rc.6): the namespace site publishes each schema at its `$id`.
    assert.strictEqual(s.json.$id, `https://agenticsystemcore.com/ns/schema/${path.basename(s.file)}`, s.file);
  }
  const pointer = (doc, fragment) => fragment.split('/').slice(1)
    .map((p) => p.replace(/~1/gu, '/').replace(/~0/gu, '~'))
    .reduce((node, key) => (node === undefined ? undefined : node[key]), doc);
  let refs = 0;
  const visit = (node, doc, file) => {
    if (node === null || typeof node !== 'object') return;
    if (typeof node.$ref === 'string') {
      refs += 1;
      const [target, fragment = ''] = node.$ref.split('#');
      const base = target === '' ? doc : byId.get(target);
      assert.ok(base, `${file}: $ref ${node.$ref} names no schema of this distribution`);
      assert.notStrictEqual(pointer(base, fragment), undefined, `${file}: $ref ${node.$ref} does not resolve`);
    }
    for (const value of Object.values(node)) visit(value, doc, file);
  };
  for (const s of schemas) visit(s.json, s.json, s.file);
  assert.ok(refs >= 10, `only ${refs} $ref were followed`);
});

/** The names AGSC-06-10 admits, read from its own sentence. */
function admitted() {
  const rule = SPEC.slice(SPEC.indexOf('**AGSC-06-10**'), SPEC.indexOf('**AGSC-06-11**'));
  const list = (from, to) => {
    const at = rule.indexOf(from);
    return [...rule.slice(at, rule.indexOf(to, at)).matchAll(/`([a-z-]*[a-z])`/gu)].map((m) => m[1]);
  };
  return {
    attributes: list('MUST use the prefix `agsc-` (', 'so that they can never collide'),
    extensions: list('with `<name>` ∈', '— of the first six'),
    related: list('admits for a related-system link (', ')'),
    short: list('the five this specification itself emits (', ')'),
  };
}

test('every relation and extension attribute the discovery document emits is admitted (AGSC-06-10)', () => {
  const names = admitted();
  assert.deepStrictEqual(names.short, ['describedby', 'alternate', 'license', 'service-doc', 'author']);
  assert.ok(names.extensions.length >= 11 && names.extensions.includes('ledger'), names.extensions.join(' '));
  const { out } = richBuild();
  const document = JSON.parse(fs.readFileSync(path.join(out, '.well-known', 'knowledge-linkset'), 'utf8'));
  assert.deepStrictEqual(Object.keys(document), ['linkset']);
  const REL = 'https://w3id.org/agentic-system-core/rel#';
  const allowed = new Set([...names.short, ...names.related, ...names.extensions.map((n) => `${REL}${n}`)]);
  const attributes = new Set();
  for (const context of document.linkset) {
    for (const [relation, links] of Object.entries(context)) {
      if (relation === 'anchor') continue;
      assert.ok(allowed.has(relation), `the document emits the relation ${relation}`);
      for (const link of links) for (const key of Object.keys(link)) if (key.startsWith('agsc-')) attributes.add(key);
    }
  }
  assert.ok(attributes.size >= 6, `only ${attributes.size} extension attributes were emitted`);
  for (const attribute of attributes) {
    assert.ok(SPEC.includes(`\`${attribute}\``), `${attribute} is emitted and no rule names it`);
  }
  for (const attribute of names.attributes) assert.ok(attributes.has(attribute), `${attribute} is admitted and not emitted`);
});

test('every emitted text is UTF-8 NFC, LF-terminated, one trailing LF, no BOM; every JSON artefact is JCS (AGSC-04-04, AGSC-04-07)', () => {
  const { files, out } = richBuild();
  let texts = 0;
  let jsons = 0;
  for (const rel of files) {
    const bytes = fs.readFileSync(path.join(out, rel));
    if (/\.(svg|png|jpg|webp)$/u.test(rel)) continue;
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    texts += 1;
    assert.ok(!text.startsWith('﻿'), `${rel} starts with a BOM`);
    assert.ok(!text.includes('\r'), `${rel} carries a CR`);
    assert.strictEqual(text, text.normalize('NFC'), `${rel} is not NFC`);
    if (rel !== '_redirects' || text.length > 0) {
      assert.ok(text.endsWith('\n') && !text.endsWith('\n\n'), `${rel} does not end with exactly one LF`);
    }
    if (/\.json$|\.jsonld$|knowledge-linkset$/u.test(rel)) {
      jsons += 1;
      assert.strictEqual(text, `${canonicalize(JSON.parse(text))}\n`, `${rel} is not JCS-canonical`);
    }
    if (rel.endsWith('.jsonl')) {
      for (const line of text.split('\n').filter((l) => l !== '')) assert.strictEqual(line, canonicalize(JSON.parse(line)), `${rel} has a non-canonical line`);
    }
  }
  assert.ok(texts >= 60 && jsons >= 10, `${texts} texts and ${jsons} JSON artefacts were read`);
});

test('the Internet-Draft and spec/06 agree on the well-known file (extractor, with its limits)', () => {
  // What this extractor CAN check: the lists and literals both documents state —
  // the URI suffix, the media type, the profile URI, the registered short names,
  // the closed set of extension relations and the bundle-fact target attributes —
  // and that every declaration attribute the draft defines is named by a rule.
  // What it CANNOT check: the meaning of the prose (client behaviour, caching,
  // security and privacy considerations), which stays a reading task.
  const draft = read('internet-draft/draft-besleaga-agentic-knowledge-wellknown-00.md');
  const section = (anchor) => {
    const at = draft.indexOf(`{#${anchor}}`);
    assert.ok(at > 0, `the draft has no section {#${anchor}}`);
    const next = draft.indexOf('\n#', at + 1);
    return draft.slice(at, next < 0 ? undefined : next);
  };
  const names = admitted();
  assert.match(section('iana-well-known-uri'), /\*\*URI suffix\*\*: knowledge-linkset/u);
  assert.match(SPEC, /`\/\.well-known\/knowledge-linkset`/u);
  const profile = 'https://w3id.org/agentic-system-core/profile/agentic-knowledge';
  assert.ok(section('iana-profile-uri').includes(profile));
  assert.ok(SPEC.includes(`application/linkset+json; profile="${profile}"`), 'spec/06 names another profile literal');
  const relations = section('relations');
  const ticks = (text) => [...text.matchAll(/`([a-z-]+)`/gu)].map((m) => m[1]);
  const shortInDraft = ticks(relations.slice(0, relations.indexOf('The extension relations')));
  assert.deepStrictEqual(shortInDraft.slice().sort(), [...names.short, ...names.related].sort());
  const table = [...relations.matchAll(/^\| `([a-z]+)` \|/gmu)].map((m) => m[1]);
  assert.deepStrictEqual(table, names.extensions, 'the closed set of extension relations differs');
  const facts = [...section('bundle-fact-attributes').matchAll(/^`(agsc-[a-z-]+)`:/gmu)].map((m) => m[1]);
  assert.deepStrictEqual(facts.slice().sort(), names.attributes.slice().sort(), 'the bundle-fact attributes differ');
  const declarations = [...section('declaration-attributes').matchAll(/`(agsc-[a-z-]+)`/gu)].map((m) => m[1]);
  assert.ok(declarations.length >= 5);
  for (const attribute of new Set(declarations)) assert.ok(SPEC.includes(`\`${attribute}\``), `${attribute} is in the draft and in no rule`);
});
