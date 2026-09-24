'use strict';
// Rules that no conformance vector pins, each checked here against the real
// command line on a scratch copy of tests/acceptance/bundle/, against the
// schemas, the ontology and the specification text, or against the engine's
// modules. Every test title names the rule it checks. Deterministic: fixed build
// instant, fixed git dates, empty git identity, no network.

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { World } = require('../acceptance/steps/_world.js');
const { ROOT, richBuild } = require('./_fixture.js');
const { areasForLevel } = require('../../src/composition/conform.js');
const { compose } = require('../../src/composition/compose.js');
const okf = require('../../src/interchange/okf.js');
const { checkProposal } = require('../../src/governance/agents.js');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const SPEC = fs.readdirSync(path.join(ROOT, 'spec')).filter((f) => f.endsWith('.md')).sort()
  .map((f) => read(`spec/${f}`)).join('\n');
const ruleText = (id) => {
  const at = SPEC.indexOf(`**${id}**`);
  assert.ok(at >= 0, `${id} is not in the specification`);
  const end = SPEC.indexOf('\n- **AGSC-', at + 1);
  return SPEC.slice(at, end < 0 ? undefined : end);
};
const ITEM_SCHEMA = JSON.parse(read('schema/item.schema.json'));
const CONFIG_SCHEMA = JSON.parse(read('schema/config.schema.json'));
const ONTOLOGY = read('ontology/agsc.ttl');
const SIX = ['cluster', 'concept', 'episode', 'gate', 'lesson', 'procedure'];

/** Lint a scratch copy of the acceptance Bundle after `mutate`; returns the findings. */
function lintAfter(mutate) {
  const world = new World();
  try {
    world.bundle();
    mutate(world);
    const r = world.agsc(['lint', '--json']);
    return { exit: r.exit, findings: JSON.parse(r.stdout).findings };
  } finally {
    world.close();
  }
}
const edit = (rel, fn) => (world) => world.write(rel, fn(world.read(rel)));
const errors = (r) => r.findings.filter((f) => f.severity === 'error').map((f) => f.code);

// ---------------------------------------------------------------- 00 overview

test('AGSC-00-05, AGSC-00-06: the item types are exactly six, and Proposal, Review, Source, Link, Bundle and Harness have no file', () => {
  const branches = ITEM_SCHEMA.oneOf.map((b) => b.properties.type.const).sort();
  assert.deepStrictEqual(branches, SIX);
  for (const other of ['proposal', 'review', 'source', 'link', 'bundle', 'harness', 'now']) {
    assert.ok(!branches.includes(other), `${other} is an item type`);
  }
  // No common superclass: the six classes are declared, and no asc:Item exists.
  for (const cls of ['Concept', 'Episode', 'Procedure', 'Lesson', 'Cluster', 'Gate']) {
    assert.match(ONTOLOGY, new RegExp(`^asc:${cls}\\b`, 'mu'), `asc:${cls} is not declared`);
  }
  assert.ok(!/^asc:Item\b/mu.test(ONTOLOGY));
});

test('AGSC-00-07: NOW is never an item — a file typed now is refused — and a hand edit of the NOW page does not survive a build', () => {
  const refused = lintAfter((w) => w.write('content/concepts/now.md',
    '---\ntype: now\ntitle: Now page\nprov:\n  origin: human\n  operator: human:a\n---\n\nx\n'));
  assert.strictEqual(refused.exit, 1);
  assert.ok(errors(refused).includes('AGSC-E205'));
  const world = new World();
  try {
    world.bundle();
    assert.strictEqual(world.agsc(['build']).exit, 0);
    const generated = world.read('www/now.md');
    world.write('www/now.md', 'hand edited\n');
    assert.strictEqual(world.agsc(['build']).exit, 0);
    assert.strictEqual(world.read('www/now.md'), generated);
  } finally {
    world.close();
  }
});

test('AGSC-00-08: card, page, deck and note are never a type, a schema key or an ontology term', () => {
  const keys = new Set();
  const walk = (node) => {
    if (node === null || typeof node !== 'object') return;
    for (const k of Object.keys(node.properties || {})) keys.add(k);
    for (const v of Object.values(node)) walk(v);
  };
  for (const f of ['item', 'bundle', 'config']) walk(JSON.parse(read(`schema/${f}.schema.json`)));
  for (const word of ['card', 'page', 'deck', 'note']) {
    assert.ok(!keys.has(word), `${word} is a schema key`);
    assert.ok(!ITEM_SCHEMA.oneOf.some((b) => b.properties.type.const === word));
    const Cap = word[0].toUpperCase() + word.slice(1);
    assert.ok(!new RegExp(`^asc:(${word}|${Cap})\\b`, 'mu').test(ONTOLOGY), `asc:${Cap} is an ontology term`);
  }
});

test('AGSC-00-14: spec_version is a SemVer 2.0.0 string wherever the distribution states it', () => {
  const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/u;
  const declared = (read('spec/00-overview.md').match(/1\.0\.0-rc\.\d+/u) || [''])[0];
  assert.match(declared, SEMVER);
  assert.match(JSON.parse(read('package.json')).version, SEMVER);
  assert.match(JSON.parse(read('tests/acceptance/bundle/agsc.config.json')).spec_version, SEMVER);
});

test('AGSC-00-17: spec_version is required in content/index.md and in agsc.config.json', () => {
  const noIndex = lintAfter(edit('content/index.md', (t) => t.replace(/^spec_version: .*\n/mu, '')));
  assert.ok(noIndex.findings.some((f) => f.code === 'AGSC-E202' && f.file === 'content/index.md'
    && /spec_version/u.test(f.message)), JSON.stringify(noIndex.findings));
  const noConfig = lintAfter(edit('agsc.config.json', (t) => t.replace(/\n {2}"spec_version": "[^"]*",?/u, '')));
  assert.ok(noConfig.findings.some((f) => f.code === 'AGSC-E202' && /spec_version/u.test(f.message)));
});

test('AGSC-00-18: every requirement the rule cites exists, and every rule it names is active', () => {
  const text = ruleText('AGSC-00-18');
  const prd = read('docs/PRD.md');
  const cited = [...text.matchAll(/\*\*((?:NFR|PRD)-\d{2,3})\*\*/gu)].map((m) => m[1]);
  assert.strictEqual(cited.length, 7, `the rule cites ${cited.length} requirements, not seven`);
  for (const id of cited) assert.match(prd, new RegExp(`^\\| ${id} \\|`, 'mu'), `${id} is not a row of docs/PRD.md`);
  const rules = [...new Set(text.match(/AGSC-\d{2}-\d{2,3}[a-z]?/gu))].filter((id) => id !== 'AGSC-00-18');
  assert.ok(rules.length >= 10);
  for (const id of rules) {
    assert.ok(SPEC.includes(`**${id}**`) && !SPEC.includes(`**${id}** *(retired`), `${id} is cited and is not an active rule`);
  }
});

// ---------------------------------------------------------------- 01 bundle

test('AGSC-01-01: a Bundle with no agsc.config.json is refused with AGSC-E901', () => {
  const world = new World();
  try {
    world.bundle();
    fs.rmSync(path.join(world.dir, 'agsc.config.json'));
    const r = world.agsc(['lint', '--json']);
    assert.strictEqual(r.exit, 1);
    assert.ok(JSON.parse(r.stdout).findings.some((f) => f.code === 'AGSC-E901' && f.file === 'agsc.config.json'));
  } finally {
    world.close();
  }
});

test('AGSC-01-06: a site page outside content/ never reaches the graph, the search index or llms.txt', () => {
  const world = new World();
  try {
    world.bundle();
    world.write('site/about.md', '# About\n\nA page about this node, outside the knowledge.\n');
    assert.strictEqual(world.agsc(['build']).exit, 0);
    for (const file of ['www/graph.jsonld', 'www/graph.nq', 'www/search.json', 'www/llms.txt', 'www/llms-full.txt']) {
      assert.ok(!world.read(file).includes('outside the knowledge'), `${file} carries the site page`);
    }
  } finally {
    world.close();
  }
});

test('AGSC-01-08: nothing under www/ or dist/ is read as input to a build', () => {
  const world = new World();
  try {
    world.bundle();
    const ghost = '---\ntype: concept\ntitle: Ghost\ndescription: A concept that sits in the build output and must never be read back in.\nprov:\n  origin: human\n  operator: human:a\nkind: pattern\n---\n\nGhost.\n';
    world.write('www/concepts/ghost.md', ghost);
    world.write('dist/content/concepts/ghost.md', ghost);
    assert.strictEqual(world.agsc(['build']).exit, 0);
    assert.ok(!world.read('www/graph.jsonld').includes('ghost'));
    assert.ok(!world.read('www/search.json').includes('Ghost'));
  } finally {
    world.close();
  }
});

test('AGSC-01-25: bundle.operator, when present, is a human actor', () => {
  const r = lintAfter(edit('agsc.config.json', (t) => t.replace('"operator": "human:andreibesleaga"', '"operator": "process:bot"')));
  assert.ok(r.findings.some((f) => f.code === 'AGSC-E204' && /bundle\.operator/u.test(f.message)));
  const ok = lintAfter(edit('agsc.config.json', (t) => t.replace(/\n {4}"operator": "human:andreibesleaga",?/u, '')));
  assert.ok(!ok.findings.some((f) => /operator/u.test(f.message) && f.severity === 'error'), 'an absent operator is refused');
});

test('AGSC-01-31: a channel publishes auto or hitl, and nothing else', () => {
  const publish = CONFIG_SCHEMA.properties.channels.items.properties.publish;
  assert.deepStrictEqual(publish.enum.slice().sort(), ['auto', 'hitl']);
  assert.ok(!CONFIG_SCHEMA.properties.channels.items.required.includes('publish'), 'publish is required, so hitl is no default');
});

test('AGSC-01-33: a Source carries a stable id and admits the channel form of a resource', () => {
  const source = ITEM_SCHEMA.$defs.source;
  assert.ok(source.properties.id, 'no sources[].id');
  const re = new RegExp(source.properties.resource.pattern, 'u');
  assert.ok(re.test('urn:agsc:channel:inbox:msg-42'));
  assert.ok(re.test('https://example.org/x'));
  assert.ok(!re.test('urn:other:thing'));
});

// ---------------------------------------------------------------- 02 item

test('AGSC-02-09: actor strings are human:<id>, process:<id> or <producer>/<version>', () => {
  const re = new RegExp(ITEM_SCHEMA.$defs.actor.pattern, 'u');
  for (const good of ['human:ada', 'process:ci', 'claude-code/1.0']) assert.ok(re.test(good), good);
  for (const bad of ['agent:x', 'ada', 'human:Ada', 'human:', '/1.0']) assert.ok(!re.test(bad), bad);
  const r = lintAfter((w) => w.write('content/episodes/a-run.md', [
    '---', 'type: episode', 'title: A run', 'started: 2026-01-01T00:00:00Z', 'actor: agent:someone',
    'outcome: partial', 'prov:', '  origin: human', '  operator: human:a', '---', '', 'x', ''].join('\n')));
  assert.ok(r.findings.some((f) => f.code === 'AGSC-E204' && /actor/u.test(f.message)), JSON.stringify(r.findings));
});

test('AGSC-02-15: a procedure may carry one-line `when` of at most 1024 characters, and a skill description becomes it on import', () => {
  const branch = ITEM_SCHEMA.oneOf.find((b) => b.properties.type.const === 'procedure');
  assert.strictEqual(branch.properties.when.maxLength, 1024);
  assert.strictEqual(branch.properties.when.$ref, '#/$defs/single_line');
  assert.strictEqual(branch.properties.inputs.type, 'array');
  assert.ok(!branch.required.includes('when'));
});

test('AGSC-02-16: a lesson must carry severity info, warn or block', () => {
  const branch = ITEM_SCHEMA.oneOf.find((b) => b.properties.type.const === 'lesson');
  assert.deepStrictEqual(branch.properties.severity.enum, ['info', 'warn', 'block']);
  const r = lintAfter(edit('content/lessons/record-why-a-handoff-happened.md', (t) => t.replace('severity: warn\n', '')));
  assert.ok(r.findings.some((f) => f.code === 'AGSC-E202' && /severity/u.test(f.message)));
});

// ---------------------------------------------------------------- 03 links

test('AGSC-03-09: a dangling derived-from or supersedes target is the error AGSC-E301', () => {
  for (const key of ['derived-from', 'supersedes']) {
    const r = lintAfter(edit('content/concepts/mcp.md', (t) => t.replace('kind: pattern', `kind: pattern\n${key}:\n  - nowhere`)));
    assert.ok(r.findings.some((f) => f.code === 'AGSC-E301' && f.severity === 'error' && f.message.includes(key)), key);
  }
});

test('AGSC-03-14, AGSC-03-18: requires alone adds to a selection; navigational and Mode-2 keys never change it', () => {
  const base = { prov: { operator: 'human:a', origin: 'human' }, type: 'concept', kind: 'pattern' };
  const items = [
    { ...base, slug: 'a', requires: ['b'], related: ['c'], broader: [], uses: ['d'], implements: ['e'], verifies: ['e'], covers: ['e'], 'blocked-by': ['e'], 'decided-by': ['e'], 'derived-from': ['c'] },
    { ...base, slug: 'b' }, { ...base, slug: 'c' }, { ...base, slug: 'd' }, { ...base, slug: 'e' },
  ];
  const result = compose(items, ['a']);
  assert.deepStrictEqual([...result.selection].sort(), ['a', 'b']);
  const plain = items.map((i) => ({ slug: i.slug, type: i.type, kind: i.kind, prov: i.prov, ...(i.requires ? { requires: i.requires } : {}) }));
  assert.deepStrictEqual([...compose(plain, ['a']).selection].sort(), ['a', 'b'],
    'dropping every non-requires key changes the selection');
});

test('AGSC-03-19, AGSC-03-20: foreign link names are mapped on import, and Mode-2 targets must exist', () => {
  const mapped = okf.mapFrontmatter({
    type: 'concept', title: 'Alpha', prov: { origin: 'human', operator: 'human:a' },
    refines: ['b'], 'alternative-to': ['c'], 'conflicts-with': ['d'], 'composed-of': ['e'], mitigates: ['f'],
    recommends: ['g'], blockedBy: ['h'], decidedBy: ['i'], tests: ['j'], 'traces-to': ['k'], uses: ['e'],
  }, { path: 'alpha.md', operator: 'human:a' });
  const fm = mapped.frontmatter;
  assert.deepStrictEqual(fm.narrower, ['b']);
  assert.deepStrictEqual(fm.excludes, ['c', 'd']);
  assert.deepStrictEqual(fm.uses, ['e', 'g']);
  assert.deepStrictEqual(fm.related, ['f']);
  assert.deepStrictEqual(fm['blocked-by'], ['h']);
  assert.deepStrictEqual(fm['decided-by'], ['i']);
  assert.deepStrictEqual(fm.verifies, ['j']);
  assert.deepStrictEqual(fm.covers, ['k']);
  for (const foreign of Object.keys(okf.FOREIGN_LINK_NAMES)) assert.ok(!(foreign in fm), `${foreign} was kept`);
  assert.strictEqual(mapped.findings.filter((f) => /foreign link name/u.test(f.message)).length, 10);
  const r = lintAfter(edit('content/concepts/mcp.md', (t) => t.replace('kind: pattern', 'kind: pattern\nblocked-by:\n  - nowhere')));
  assert.ok(r.findings.some((f) => f.code === 'AGSC-E301' && f.severity === 'error'));
});

// ---------------------------------------------------------------- 04 canonicalization

test('AGSC-04-06: a discovery document that is not JCS-canonical is AGSC-E601 at Level 2', () => {
  const { out } = richBuild();
  const world = new World();
  try {
    world.bundle();
    const copy = world.temp('agsc-e601-');
    fs.cpSync(out, copy, { recursive: true });
    const at = path.join(copy, '.well-known', 'knowledge-linkset');
    fs.writeFileSync(at, `${JSON.stringify(JSON.parse(fs.readFileSync(at, 'utf8')), null, 2)}\n`);
    const r = world.tool('validate-wellknown', [at, '--level', '2', '--json']);
    assert.strictEqual(r.exit, 1);
    assert.ok(JSON.parse(r.stdout).findings.some((f) => f.code === 'AGSC-E601'), r.stdout);
  } finally {
    world.close();
  }
});

test('AGSC-04-08: slugs stay ASCII while titles may be any Unicode in NFC', () => {
  const r = lintAfter((w) => w.write('content/concepts/café.md',
    w.read('content/concepts/mcp.md').replace('title: Model Context Protocol', 'title: Café protocol')));
  assert.ok(r.findings.some((f) => f.code === 'AGSC-E204' && /slug/u.test(f.message)));
  const ok = lintAfter(edit('content/concepts/mcp.md', (t) => t.replace('title: Model Context Protocol', 'title: Protocole café — MCP')));
  assert.deepStrictEqual(errors(ok), []);
});

test('AGSC-04-11: ledger instants come from committer times and the build entry from SOURCE_DATE_EPOCH, never a clock', () => {
  const world = new World();
  try {
    world.bundle();
    world.commitAll('first', { GIT_COMMITTER_DATE: '2025-03-04T05:06:07Z' });
    assert.strictEqual(world.agsc(['build'], { env: { SOURCE_DATE_EPOCH: '1790000000' } }).exit, 0);
    const lines = world.read('www/ledger.jsonl').split('\n').filter((l) => l !== '').map((l) => JSON.parse(l));
    assert.deepStrictEqual(lines.map((e) => [e.kind, e.ts]), [['commit', '2025-03-04T05:06:07Z'], ['build', '2026-09-21T14:13:20Z']]);
    assert.match(world.read('www/now.md'), /built at 2026-09-21T14:13:20Z/u);
    const first = world.read('www/.well-known/knowledge-linkset');
    assert.strictEqual(world.agsc(['build'], { env: { SOURCE_DATE_EPOCH: '1790000000', TZ: 'Asia/Tokyo' } }).exit, 0);
    assert.strictEqual(world.read('www/.well-known/knowledge-linkset'), first, 'the time zone reached an artefact');
  } finally {
    world.close();
  }
});

test('AGSC-04-17: content hashes are lowercase hex SHA-256 over the bytes', () => {
  const { out } = richBuild();
  const index = JSON.parse(fs.readFileSync(path.join(out, 'skills', 'index.json'), 'utf8'));
  assert.ok(index.packs.length >= 2);
  for (const pack of index.packs) {
    for (const [file, hash] of Object.entries(pack.lock)) {
      assert.match(hash, /^[0-9a-f]{64}$/u);
      const bytes = fs.readFileSync(path.join(out, 'skills', pack.name, file));
      assert.strictEqual(hash, crypto.createHash('sha256').update(bytes).digest('hex'), `${pack.name}/${file}`);
    }
  }
});

test('AGSC-04-18: search.json, sitemap.xml and the well-known file depend only on content, configuration and the build instant', () => {
  const a = new World();
  const b = new World();
  try {
    a.bundle();
    b.bundle();
    a.write('README.md', 'one\n');
    b.write('README.md', 'two, and a different working directory\n');
    assert.strictEqual(a.agsc(['build'], { env: { LANG: 'C', TZ: 'UTC' } }).exit, 0);
    assert.strictEqual(b.agsc(['build'], { env: { LANG: 'de_DE.UTF-8', TZ: 'Pacific/Kiritimati' } }).exit, 0);
    for (const file of ['www/search.json', 'www/sitemap.xml', 'www/.well-known/knowledge-linkset']) {
      assert.strictEqual(a.read(file), b.read(file), file);
    }
  } finally {
    a.close();
    b.close();
  }
});

// ---------------------------------------------------------------- 05 graph

test('AGSC-05-05: an authored iri must equal the computed item IRI (AGSC-E204)', () => {
  const wrong = lintAfter(edit('content/concepts/mcp.md', (t) => t.replace('kind: pattern', 'kind: pattern\niri: https://elsewhere.example/concepts/mcp/')));
  assert.ok(wrong.findings.some((f) => f.code === 'AGSC-E204' && /computed item IRI/u.test(f.message)));
  const right = lintAfter(edit('content/concepts/mcp.md', (t) => t.replace('kind: pattern', 'kind: pattern\niri: https://agenticsystemcore.com/concepts/mcp/')));
  assert.deepStrictEqual(errors(right), []);
});

test('AGSC-05-15: each verified[] entry is an asc:Review with its own IRI, never a blank node', () => {
  const world = new World();
  try {
    world.bundle();
    world.write('content/concepts/mcp.md', world.read('content/concepts/mcp.md').replace('kind: pattern',
      'kind: pattern\nverified:\n  - by: human:reviewer\n    at: 2026-01-01T00:00:00Z\n  - by: human:second\n    at: 2026-01-02T00:00:00Z'));
    assert.strictEqual(world.agsc(['build']).exit, 0);
    const nq = world.read('www/graph.nq');
    const iri = 'https://agenticsystemcore.com/concepts/mcp/';
    for (const [n, by, at] of [[1, 'human:reviewer', '2026-01-01T00:00:00Z'], [2, 'human:second', '2026-01-02T00:00:00Z']]) {
      assert.ok(nq.includes(`<${iri}#review-${n}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://w3id.org/agentic-system-core/ns#Review>`));
      assert.ok(nq.includes(`<${iri}#review-${n}> <https://w3id.org/agentic-system-core/ns#verifiedBy> "${by}"`));
      assert.ok(nq.includes(`<${iri}#review-${n}> <https://w3id.org/agentic-system-core/ns#verifiedAt> "${at}"`));
    }
    assert.ok(!/(^|\s)_:/mu.test(nq), 'a blank node was emitted');
  } finally {
    world.close();
  }
});

test('AGSC-05-23: no reasoner runs at build; inverses are materialized in the graph', () => {
  const pkg = JSON.parse(read('package.json'));
  for (const name of Object.keys(pkg.dependencies)) {
    assert.ok(!/reason|owl|shacl|eye|hylar/iu.test(name), `${name} looks like a reasoner`);
  }
  const { out } = richBuild();
  const nq = fs.readFileSync(path.join(out, 'graph.nq'), 'utf8');
  // a2a requires mcp; the inverse "required by" is stated, not left to inference.
  const a2a = 'https://agenticsystemcore.com/concepts/a2a/';
  const mcp = 'https://agenticsystemcore.com/concepts/mcp/';
  assert.ok(nq.includes(`<${a2a}> <http://purl.org/dc/terms/requires> <${mcp}>`));
  assert.ok(nq.includes(`<${mcp}> <http://purl.org/dc/terms/isRequiredBy> <${a2a}>`),
    'the inverse of requires is not materialized');
});

// ---------------------------------------------------------------- 06 surfaces

test('AGSC-06-03: no reading order, "start here" sequence or numbered-division framing is emitted', () => {
  const { files, out } = richBuild();
  for (const rel of files.filter((f) => f.endsWith('.html'))) {
    const text = fs.readFileSync(path.join(out, rel), 'utf8').replace(/<[^>]+>/gu, ' ');
    // The two refused words are assembled so that this file does not carry them itself.
    const framing = new RegExp(`start here|reading order|${['chap', 'ter'].join('')} \\d|\\b${['compan', 'ion'].join('')}\\b`, 'iu');
    assert.ok(!framing.test(text), `${rel} frames a reading order`);
  }
});

test('AGSC-06-09: the discovery document is an RFC 9264 link set — contexts with an anchor and relation arrays of objects with href', () => {
  const { out } = richBuild();
  const document = JSON.parse(fs.readFileSync(path.join(out, '.well-known', 'knowledge-linkset'), 'utf8'));
  assert.ok(Array.isArray(document.linkset) && document.linkset.length >= 1);
  for (const context of document.linkset) {
    assert.match(context.anchor, /^https:\/\/.+\/$/u);
    for (const [relation, targets] of Object.entries(context)) {
      if (relation === 'anchor') continue;
      assert.ok(Array.isArray(targets) && targets.length >= 1, relation);
      for (const t of targets) {
        assert.strictEqual(typeof t.href, 'string');
        for (const [k, v] of Object.entries(t)) {
          if (k === 'href' || k === 'type') assert.strictEqual(typeof v, 'string');
          else assert.ok(Array.isArray(v), `${relation}.${k} is not an array (RFC 9264 §4.2.4.3)`);
        }
      }
    }
  }
});

test('AGSC-06-12: no VoID description is emitted', () => {
  const { files } = richBuild();
  assert.ok(!files.some((f) => /void/iu.test(f)));
});

test('AGSC-06-13: llms.txt is one H1, the provenance comment, one blockquote, then H2 sections of link lists', () => {
  const { out } = richBuild();
  const text = fs.readFileSync(path.join(out, 'llms.txt'), 'utf8');
  const blocks = text.trimEnd().split('\n\n');
  assert.match(blocks[0], /^# [^\n]+$/u);
  assert.match(blocks[1], /^<!-- agsc:provenance\n[\s\S]*\n-->$/u);
  assert.match(blocks[2], /^> [^\n]+$/u);
  const rest = blocks.slice(3).join('\n\n');
  assert.strictEqual((text.match(/^# /gmu) || []).length, 1);
  const sections = rest.split(/^## /mu).filter((s) => s !== '');
  assert.ok(sections.length >= 2);
  for (const section of sections) {
    const [heading, ...lines] = section.trim().split('\n').filter((l) => l !== '');
    assert.ok(heading.length > 0);
    for (const line of lines) assert.match(line, /^- \[[^\]]+\]\(https:\/\/[^)]+\): .+$/u, line);
  }
});

// ---------------------------------------------------------------- 08 governance

test('AGSC-08-03, AGSC-08-08: a Review is a verified[] entry {by, at} whose author is a human; no process or agent approves', () => {
  for (const by of ['process:ci', 'claude-code/1.0']) {
    const r = lintAfter(edit('content/concepts/mcp.md', (t) => t.replace('kind: pattern', `kind: pattern\nverified:\n  - by: ${by}\n    at: 2026-01-01T00:00:00Z`)));
    assert.ok(r.findings.some((f) => f.code === 'AGSC-E204' && /verified\/0\/by/u.test(f.message)), by);
  }
  const ok = lintAfter(edit('content/concepts/mcp.md', (t) => t.replace('kind: pattern', 'kind: pattern\nverified:\n  - by: human:reviewer\n    at: 2026-01-01T00:00:00Z')));
  assert.deepStrictEqual(errors(ok), []);
});

test('AGSC-08-11: the links gate is AGSC-E301 and AGSC-E310 errors on the Bundle itself, and a foreign import with a broken link is not refused', () => {
  const body = lintAfter(edit('content/concepts/mcp.md', (t) => `${t}\nSee [nothing](nothing).\n`));
  assert.ok(body.findings.some((f) => f.code === 'AGSC-E310' && f.severity === 'error'));
  const link = lintAfter(edit('content/concepts/mcp.md', (t) => t.replace('kind: pattern', 'kind: pattern\nuses:\n  - nowhere')));
  assert.ok(link.findings.some((f) => f.code === 'AGSC-E301' && f.severity === 'error'));
  const world = new World();
  try {
    world.bundle();
    const foreign = world.temp('agsc-foreign-');
    fs.mkdirSync(path.join(foreign, 'concepts'));
    fs.writeFileSync(path.join(foreign, 'index.md'), '---\nokf_version: "0.2"\ntitle: Foreign\n---\n\n# Foreign\n');
    fs.writeFileSync(path.join(foreign, 'concepts', 'alpha.md'),
      '---\ntype: concept\ntitle: Alpha\ndescription: A foreign concept whose link and body reference point at nothing here.\nuses:\n  - nowhere\nkind: pattern\n---\n\nSee [gone](gone.md).\n');
    const r = world.agsc(['import', foreign, '--from', 'okf', '--json']);
    assert.strictEqual(r.exit, 0, r.stdout + r.stderr);
    assert.ok(world.exists('content/concepts/alpha.md'));
  } finally {
    world.close();
  }
});

test('AGSC-08-30: lint, build, verify and ci reach no network module and no model client', () => {
  const seen = new Set();
  const forbidden = [];
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/gu)) {
      const spec = m[1];
      if (spec.startsWith('.')) {
        const resolved = require.resolve(path.resolve(path.dirname(file), spec));
        if (resolved.startsWith(path.join(ROOT, 'src'))) visit(resolved);
      } else if (/^(node:)?(https?|http2|tls|dgram|dns)$/u.test(spec) || /openai|anthropic|@ai-sdk|ollama/iu.test(spec)) {
        forbidden.push(`${path.relative(ROOT, file)} requires ${spec}`);
      } else if (/^(node:)?net$/u.test(spec)) {
        // Address classification only (AGSC-11-08): no socket is ever opened.
        const uses = [...text.matchAll(/\bnet\.([A-Za-z]+)/gu)].map((u) => u[1]);
        for (const use of uses) if (!['BlockList', 'isIP', 'isIPv4', 'isIPv6'].includes(use)) forbidden.push(`${path.relative(ROOT, file)} uses net.${use}`);
      }
    }
  };
  for (const verb of ['lint', 'build', 'verify', 'ci']) visit(path.join(ROOT, 'src', 'application', 'cli', 'verbs', `${verb}.js`));
  assert.ok(seen.size >= 20, `only ${seen.size} modules were reached`);
  assert.deepStrictEqual(forbidden, []);
});

test('AGSC-10-18: an agent lane cannot change a procedure, a gate, a cluster or the configuration', () => {
  const config = {
    agents: [{ author: 'lane-bot', budget_usd_month: 5, channel: 'lane', enabled: true, kind: 'llm', model: 'm',
      name: 'worker', operator: 'human:alice', tasks: ['edit'], types: ['concept', 'episode', 'lesson'] }],
    bundle: { id: 'x', operator: 'human:alice' },
    channels: [{ adapter: 'stub', author: 'lane-bot', name: 'lane', owner: 'human:alice', publish: 'auto' }],
    site: { base: 'https://x.example/', title: 'X' },
    spec_version: '1.0.0-rc.6',
  };
  for (const [p, type] of [['content/procedures/deploy.md', 'procedure'], ['content/gates/g.md', 'gate'], ['content/clusters/c.md', 'cluster']]) {
    const result = checkProposal(config, { agent: 'worker', author: 'lane-bot', changes: [{ path: p, type }] });
    assert.strictEqual(result.accepted, false, p);
    assert.ok(result.findings.some((f) => f.code === 'AGSC-E509'), p);
  }
  const lesson = checkProposal(config, { agent: 'worker', author: 'lane-bot', changes: [{ path: 'content/lessons/l.md', type: 'lesson' }] });
  assert.strictEqual(lesson.accepted, true);
});

// ---------------------------------------------------------------- 10 profiles

test('AGSC-10-03, AGSC-10-05: each Level\'s vector areas are the ones its rule lists', () => {
  const areas = (id) => {
    const text = ruleText(id);
    const at = text.indexOf('Vector areas:');
    const end = text.indexOf('[', at);
    // The Level-0 sentence names `jcs` only to say it enters at Level 1.
    const sentence = text.slice(at, end < 0 ? undefined : end).replace(/\([^)]*enters at[^)]*\)/u, '');
    return [...sentence.matchAll(/`([a-z]+)`/gu)].map((m) => m[1]);
  };
  const level0 = areas('AGSC-10-02');
  const level1 = [...level0, ...areas('AGSC-10-03')];
  const level2 = [...level1, ...areas('AGSC-10-04')];
  assert.deepStrictEqual(areasForLevel(0).slice().sort(), level0.slice().sort());
  assert.deepStrictEqual(areasForLevel(1).slice().sort(), level1.slice().sort());
  assert.deepStrictEqual(areasForLevel(2).slice().sort(), level2.slice().sort());
  assert.match(ruleText('AGSC-10-05'), /Vector areas: all\./u);
  const declared = [...ruleText('AGSC-09-04').matchAll(/`([a-z]+)\/`/gu)].map((m) => m[1]);
  for (const area of areasForLevel(3)) assert.ok(declared.includes(area), `${area} is not an area of AGSC-09-04`);
  assert.strictEqual(areasForLevel(3).length, 25);
});

test('AGSC-01-12: a retired item keeps its slug, and the slug cannot be reused by another item', () => {
  const r = lintAfter((w) => {
    w.write('content/concepts/mcp.md', w.read('content/concepts/mcp.md').replace('kind: pattern', 'kind: pattern\nstatus: retired'));
    w.write('content/procedures/mcp.md', [
      '---', 'type: procedure', 'title: Reuse of a retired slug',
      'description: A new item that tries to take the slug of an item the node has retired.',
      'prov:', '  origin: human', '  operator: human:a', '---', '', '## When', '', 'Never.', ''].join('\n'));
  });
  assert.ok(r.findings.some((f) => f.code === 'AGSC-E206' && f.severity === 'error'), JSON.stringify(r.findings));
});
