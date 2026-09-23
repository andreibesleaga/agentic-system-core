'use strict';
// tests/interchange/skills.test.js — the skills memory adapter both ways (AGSC-01-26a;
// R119, CONN-2): `export --to skills --layout <l>` and `import --from skills <clone>`
// over the five layouts of the well-known skills repositories and rule packs.
//
// The fixtures under tests/fixtures/skills-*/ are small SYNTHETIC collections in the
// real layouts (each fixture's README names the source it mirrors and the date it was
// read); no skill text is copied from a real collection. Everything runs through the
// real verbs over the real filesystem with a fixed clock; no network, and the tests
// prove that nothing is fetched (a remote plugin source is only reported).

const test = require('node:test');
const assert = require('node:assert');
const nodeFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { createFileSystem } = require('../../src/adapters/node-fs.js');
const { createClock } = require('../../src/adapters/node-clock.js');
const exportVerb = require('../../src/application/cli/verbs/export.js');
const importVerb = require('../../src/application/cli/verbs/import.js');
const lintVerb = require('../../src/application/cli/verbs/lint.js');
const main = require('../../src/application/cli/main.js');
const skills = require('../../src/interchange/adapters/skills.js');
const frontmatter = require('../../src/knowledge/frontmatter.js');
const yaml = require('../../src/knowledge/yaml.js');

const ROOT = path.resolve(__dirname, '..', '..');
const BIN = path.join(ROOT, 'bin', 'agsc.js');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const fixture = (name) => path.join(ROOT, 'tests', 'fixtures', `skills-${name}`);
const EPOCH = '1767225600';
const SPEC = '1.0.0-rc.6';
const LAYOUTS = ['agentskills', 'claude-plugin', 'cursor', 'marketplace', 'windsurf'];

const PROV = 'prov:\n  origin: human\n  operator: human:andreibesleaga\n';

/** A second cluster that shares a member with the fixture's, plus a draft member. */
const EXTRA = {
  'content/clusters/review-patterns.md': `---\ntype: cluster\ntitle: Review patterns\ndescription: Shapes for reviewing the work agents hand to each other, gathered in one place.\n${PROV}---\n\nReview shapes.\n`,
  'content/procedures/hand-over.md': `---\ntype: procedure\ntitle: Hand over\nclusters:\n  - review-patterns\n  - agent-patterns\n${PROV}when: when control must move to another agent\n---\n\n## Steps\n\nWrite the state, name the receiver, stop.\n`,
  'content/concepts/secret-plan.md': `---\ntype: concept\ntitle: Secret plan\ndescription: A draft that must never leave the node through any export at all.\nstatus: draft\nclusters:\n  - agent-patterns\n${PROV}kind: pattern\n---\n\nNot yet.\n`,
};

const temporaries = [];
test.after(() => {
  for (const dir of temporaries) nodeFs.rmSync(dir, { force: true, recursive: true });
});

function temp(prefix) {
  const dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaries.push(dir);
  return dir;
}

function writeTree(dir, files) {
  for (const [at, text] of Object.entries(files)) {
    nodeFs.mkdirSync(path.dirname(path.join(dir, at)), { recursive: true });
    nodeFs.writeFileSync(path.join(dir, at), text);
  }
  return dir;
}

function workspace(extra = EXTRA) {
  const dir = temp('agsc-skills-');
  nodeFs.cpSync(FIXTURE, dir, { recursive: true });
  return writeTree(dir, extra);
}

function emptyBundle() {
  const dir = temp('agsc-skills-in-');
  nodeFs.copyFileSync(path.join(FIXTURE, 'agsc.config.json'), path.join(dir, 'agsc.config.json'));
  return dir;
}

function ctxFor(dir, options = {}) {
  const lines = [];
  return {
    argv: options.argv || [],
    config: JSON.parse(nodeFs.readFileSync(path.join(dir, 'agsc.config.json'), 'utf8')),
    env: {},
    flags: { json: false, quiet: false },
    notes: lines,
    openRoot: (at) => createFileSystem(path.resolve(dir, at)),
    ports: { clock: createClock({ env: { SOURCE_DATE_EPOCH: EPOCH } }), fs: createFileSystem(dir) },
    root: dir,
    specVersion: SPEC,
    stderr: { write: (text) => lines.push(String(text)) },
    stdout: { write: () => {} },
    verbFlags: options.verbFlags || {},
    version: '0.0.2',
  };
}

function tree(dir) {
  const out = new Map();
  if (!nodeFs.existsSync(dir)) return out;
  const walk = (at, prefix) => {
    for (const entry of nodeFs.readdirSync(at, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = path.join(at, entry.name);
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(full, rel);
      else out.set(rel, nodeFs.readFileSync(full, 'utf8'));
    }
  };
  walk(dir, '');
  return out;
}

const errors = (findings) => findings.filter((f) => f.severity !== 'warn');
const withoutSourceVersion = (text) => text.replace(/^ {2}source_version: .*\n/mu, '');

function exported(dir, layout) {
  const ctx = ctxFor(dir, { verbFlags: layout === undefined ? { to: 'skills' } : { layout, to: 'skills' } });
  const out = exportVerb.run(ctx);
  assert.deepStrictEqual(errors(out.findings), []);
  return { files: tree(path.join(dir, 'dist/export/skills', layout || 'agentskills')), findings: out.findings };
}

function imported(into, source, verbFlags = {}) {
  const ctx = ctxFor(into, { argv: [source], verbFlags: { from: 'skills', ...verbFlags } });
  const result = importVerb.run(ctx);
  return { ...result, notes: ctx.notes.join('') };
}

function read(dir, at) {
  return nodeFs.readFileSync(path.join(dir, at), 'utf8');
}

function fm(text) {
  return yaml.parse(frontmatter.split(text).yamlText);
}

// ------------------------------------------------------------------ export

test('export --to skills writes every published pack in each layout, content only', () => {
  const dir = workspace();
  const expected = {
    agentskills: ['skills/agent-patterns/SKILL.md', 'skills/review-patterns/SKILL.md'],
    'claude-plugin': ['.claude-plugin/plugin.json', 'skills/agent-patterns/SKILL.md', 'skills/review-patterns/SKILL.md'],
    cursor: ['.cursor/rules/agent-patterns.mdc', '.cursor/rules/review-patterns.mdc'],
    marketplace: ['.claude-plugin/marketplace.json', 'skills/agent-patterns/SKILL.md', 'skills/review-patterns/SKILL.md'],
    windsurf: ['.windsurf/rules/agent-patterns.md', '.windsurf/rules/review-patterns.md'],
  };
  for (const layout of LAYOUTS) {
    const { files } = exported(dir, layout);
    assert.deepStrictEqual([...files.keys()], expected[layout], layout);
    for (const [at, text] of files) {
      // AGSC-06-30: the draft never leaves, in any file.
      assert.doesNotMatch(text, /Secret plan|secret-plan/u, `${layout} ${at}`);
      // AGSC-07-15: nothing executable, no allowed-tools.
      assert.doesNotMatch(text, /allowed-tools/u, `${layout} ${at}`);
      assert.ok(/\.(?:md|mdc|json)$/u.test(at), at);
      if (at.endsWith('.json')) continue;
      // AGSC-01-29 / AGSC-06-15: the provenance header with the content version.
      assert.match(text, /<!-- agsc:provenance\n/u, `${layout} ${at}`);
      assert.match(text, /\nbundle_version: 0\.0\.0\+20260101T000000Z\n/u, `${layout} ${at}`);
      assert.match(text, /\n<!-- agsc-item [A-Za-z0-9+/=]+ -->\n/u, `${layout} ${at}`);
    }
  }
  // With no --layout, the default is the Agent Skills layout.
  const ctx = ctxFor(dir, { verbFlags: { to: 'skills' } });
  assert.deepStrictEqual(errors(exportVerb.run(ctx).findings), []);
  assert.ok(nodeFs.existsSync(path.join(dir, 'dist/export/skills/agentskills/skills/agent-patterns/SKILL.md')));
});

test('an exported SKILL.md is a valid Agent Skill: name = directory, description ≤ 1024, string metadata', () => {
  const { files } = exported(workspace(), 'agentskills');
  for (const [at, text] of files) {
    const meta = fm(text);
    assert.strictEqual(meta.name, at.split('/')[1]);
    assert.match(meta.name, /^[a-z0-9]+(-[a-z0-9]+)*$/u);
    assert.ok(meta.name.length <= 64);
    assert.ok(meta.description.length > 0 && meta.description.length <= 1024);
    assert.strictEqual(meta.license, 'LicenseRef-AgenticSystemCore-Content-Use-1.0');
    assert.deepStrictEqual(Object.keys(meta.metadata).sort(), ['agsc-bundle', 'agsc-bundle-version', 'agsc-spec-version']);
    for (const value of Object.values(meta.metadata)) assert.strictEqual(typeof value, 'string');
    assert.ok(!('allowed-tools' in meta));
  }
});

test('the plugin and marketplace manifests follow the Claude Code formats', () => {
  const dir = workspace();
  const plugin = JSON.parse(exported(dir, 'claude-plugin').files.get('.claude-plugin/plugin.json'));
  assert.strictEqual(plugin.name, 'minimal');
  assert.strictEqual(plugin.version, '0.0.0+20260101T000000Z');
  assert.match(plugin.description, /generated from https:\/\/minimal\.example\//u);
  const market = JSON.parse(exported(dir, 'marketplace').files.get('.claude-plugin/marketplace.json'));
  assert.strictEqual(market.name, 'minimal-skills');
  assert.deepStrictEqual(market.owner, { name: 'Minimal Bundle' });
  assert.strictEqual(market.plugins.length, 1);
  assert.deepStrictEqual(market.plugins[0].skills, ['./skills/agent-patterns', './skills/review-patterns']);
  assert.strictEqual(market.plugins[0].source, './');
  assert.strictEqual(market.plugins[0].strict, false);
  const cursor = exported(dir, 'cursor').files.get('.cursor/rules/agent-patterns.mdc');
  assert.match(cursor, /^---\ndescription: ".+"\nglobs:\nalwaysApply: false\n---\n/u);
  const windsurf = exported(dir, 'windsurf').files.get('.windsurf/rules/agent-patterns.md');
  assert.match(windsurf, /^---\ntrigger: model_decision\ndescription: ".+"\n---\n/u);
});

test('the export is byte-identical twice and zips with --zip', () => {
  const dir = workspace();
  const first = exported(dir, 'marketplace').files;
  assert.deepStrictEqual(exported(dir, 'marketplace').files, first);
  const out = exportVerb.run(ctxFor(dir, { verbFlags: { layout: 'agentskills', to: 'skills', zip: true } }));
  assert.deepStrictEqual(errors(out.findings), []);
  assert.ok(nodeFs.readdirSync(path.join(dir, 'dist/export')).some((name) => /^skills-.*\.zip$/u.test(name)));
});

test('a Windsurf rule over the documented 12,000-character limit is written and warned about', () => {
  const big = { ...EXTRA,
    'content/concepts/long.md': `---\ntype: concept\ntitle: Long one\ndescription: A long concept whose body pushes the pack over the Windsurf limit.\nclusters:\n  - review-patterns\n${PROV}kind: explainer\n---\n\n${'word '.repeat(3000)}\n` };
  const { files, findings } = exported(workspace(big), 'windsurf');
  assert.ok(files.has('.windsurf/rules/review-patterns.md'));
  assert.ok(findings.some((f) => f.code === 'AGSC-E506' && /12000/u.test(f.message)));
});

test('export: an unknown --layout is AGSC-E003, and a pack error stops the export', () => {
  const dir = workspace();
  const out = exportVerb.run(ctxFor(dir, { verbFlags: { layout: 'vscode', to: 'skills' } }));
  assert.deepStrictEqual(errors(out.findings).map((f) => f.code), ['AGSC-E003']);
  const stopped = skills.run({ config: {}, items: [] }, {
    sha256: () => '', skillPacks: { files: [], findings: [{ code: 'AGSC-E204', severity: 'error' }], index: { packs: [] } },
  });
  assert.deepStrictEqual(stopped.files, []);
  // No packs at all: nothing to write, and no fault.
  assert.deepStrictEqual(skills.run({ items: [] }, { sha256: () => '' }), { files: [], findings: [] });
});

// ------------------------------------------------------------------ our own packs, back

test('round trip in every layout: the packs\' items come back byte for byte, plus prov.source_version', () => {
  const source = workspace();
  const original = tree(path.join(source, 'content'));
  const published = ['clusters/agent-patterns.md', 'clusters/review-patterns.md', 'concepts/handoff.md',
    'concepts/supervisor.md', 'procedures/hand-over.md'];
  for (const layout of LAYOUTS) {
    exported(source, layout);
    const into = emptyBundle();
    const from = path.join(source, 'dist/export/skills', layout);
    const result = imported(into, from, { layout });
    assert.deepStrictEqual(errors(result.findings), [], layout);
    const back = tree(path.join(into, 'content'));
    assert.deepStrictEqual([...back.keys()].sort(), published, layout);
    for (const at of published) {
      assert.match(back.get(at), /^ {2}source_version: 0\.0\.0\+20260101T000000Z$/mu, `${layout} ${at}`);
      assert.strictEqual(withoutSourceVersion(back.get(at)), original.get(at), `${layout} ${at}`);
    }
    // AGSC-01-23: a second import changes nothing — and the member shared by two
    // packs was written once, not as `hand-over-2`.
    const again = imported(into, from, { layout });
    assert.match(again.notes, /import: 0 written, 0 replaced, 5 unchanged/u, layout);
    assert.deepStrictEqual(tree(path.join(into, 'content')), back, layout);
  }
});

test('the round-tripped Bundle lints without an error about any item', () => {
  const source = workspace();
  exported(source, 'agentskills');
  const into = emptyBundle();
  imported(into, path.join(source, 'dist/export/skills/agentskills'));
  assert.deepStrictEqual(errors(lintVerb.run(ctxFor(into)).findings)
    .filter((f) => f.file !== '.well-known/security.txt'), []);
});

test('collisions: nothing is written, --dry-run reports the same, --replace replaces', () => {
  const source = workspace();
  exported(source, 'agentskills');
  const from = path.join(source, 'dist/export/skills/agentskills');
  const into = emptyBundle();
  imported(into, from);
  const at = path.join(into, 'content/concepts/handoff.md');
  nodeFs.writeFileSync(at, read(into, 'content/concepts/handoff.md').replace('Pass control', 'Hand control'));
  const before = tree(path.join(into, 'content'));
  const dry = imported(into, from, { 'dry-run': true });
  assert.strictEqual(dry.status, 'fail');
  assert.deepStrictEqual(errors(dry.findings).map((f) => [f.code, f.file]), [['AGSC-E206', 'content/concepts/handoff.md']]);
  const refused = imported(into, from);
  assert.strictEqual(refused.status, 'fail');
  assert.deepStrictEqual(tree(path.join(into, 'content')), before);
  const replaced = imported(into, from, { replace: true });
  assert.deepStrictEqual(errors(replaced.findings), []);
  assert.match(read(into, 'content/concepts/handoff.md'), /Pass control/u);
});

test('a record of a newer specification is refused unless --allow-newer, and a broken record is skipped', () => {
  const source = workspace();
  exported(source, 'agentskills');
  const from = path.join(source, 'dist/export/skills/agentskills');
  const skill = path.join(from, 'skills/review-patterns/SKILL.md');
  const text = nodeFs.readFileSync(skill, 'utf8');
  const b64 = /<!-- agsc-item (\S+) -->/u.exec(text)[1];
  const record = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  const newer = Buffer.from(JSON.stringify({ ...record, spec_version: '1.9.0' }), 'utf8').toString('base64');
  nodeFs.writeFileSync(skill, text.replace(b64, newer));
  const into = emptyBundle();
  const refused = imported(into, from);
  assert.strictEqual(refused.status, 'fail');
  assert.deepStrictEqual(errors(refused.findings).map((f) => f.code), ['AGSC-E004']);
  assert.deepStrictEqual(tree(path.join(into, 'content')), new Map());
  const allowed = imported(into, from, { 'allow-newer': true });
  assert.deepStrictEqual(errors(allowed.findings), []);
  // An agsc-item line that decodes to no item is reported and skipped.
  nodeFs.writeFileSync(skill, `${text}\n<!-- agsc-item ${Buffer.from('{"slug":"x"}').toString('base64')} -->\n`
    + `<!-- agsc-item ${Buffer.from('not json').toString('base64')} -->\n`);
  const skipped = imported(emptyBundle(), from);
  assert.strictEqual(skipped.findings.filter((f) => f.code === 'AGSC-E201').length, 2);
});

// ------------------------------------------------------------------ foreign collections

test('agentskills: skills become procedures; scripts and allowed-tools are dropped, per file', () => {
  const into = emptyBundle();
  const result = imported(into, fixture('agentskills'));
  assert.deepStrictEqual(errors(result.findings), []);
  assert.match(result.notes, /skills layout agentskills \(detected\)/u);
  assert.deepStrictEqual([...tree(path.join(into, 'content')).keys()], [
    'procedures/brand-voice.md', 'procedures/doc-maker.md', 'procedures/pdf-notes.md', 'procedures/plain-notes.md']);
  const pdf = fm(read(into, 'content/procedures/pdf-notes.md'));
  assert.strictEqual(pdf.type, 'procedure');
  assert.strictEqual(pdf.title, 'PDF notes');
  assert.match(pdf.when, /^Take structured notes from a PDF/u);
  assert.deepStrictEqual(pdf.prov, { operator: 'human:andreibesleaga', origin: 'imported', source_version: '1.2' });
  assert.deepStrictEqual(pdf['x-skills-dropped'],
    ['allowed-tools', 'assets/template.txt', 'references/REFERENCE.md', 'scripts/extract.py']);
  assert.strictEqual(pdf['x-skills-license'], 'Apache-2.0 (license key)');
  assert.strictEqual(pdf['x-skills-source'], 'skills/pdf-notes/SKILL.md');
  assert.deepStrictEqual(JSON.parse(pdf['x-skills-rest']),
    { compatibility: 'Designed for any agent that can read files', metadata: { author: 'fixture-org', version: '1.2' } });
  assert.ok(!('status' in pdf));
  // Nothing executable reached the Bundle, in any byte.
  for (const text of tree(path.join(into, 'content')).values()) {
    assert.doesNotMatch(text, /Bash\(pdftotext|print\("fixture/u);
  }
  // AGSC-07-15, reported per file with the code the rule registers.
  assert.deepStrictEqual(result.findings.filter((f) => f.code === 'AGSC-E407').map((f) => f.file).sort(),
    ['skills/pdf-notes/SKILL.md', 'skills/pdf-notes/scripts/extract.py']);
  assert.ok(result.findings.some((f) => f.file === 'skills/pdf-notes/references/REFERENCE.md' && f.code === 'AGSC-E506'));
  assert.ok(result.findings.some((f) => /links to references\/REFERENCE\.md, which was not imported/u.test(f.message)));
});

test('the licence check: a bundled licence file, a collection licence, and a proprietary one kept as draft', () => {
  const into = emptyBundle();
  const result = imported(into, fixture('agentskills'));
  const brand = fm(read(into, 'content/procedures/brand-voice.md'));
  assert.strictEqual(brand['x-skills-license'], 'Apache-2.0 (skills/brand-voice/LICENSE.txt)');
  assert.ok(!('status' in brand));
  const plainNotes = fm(read(into, 'content/procedures/plain-notes.md'));
  assert.strictEqual(plainNotes['x-skills-license'], 'MIT (LICENSE)');
  const doc = fm(read(into, 'content/procedures/doc-maker.md'));
  assert.strictEqual(doc.status, 'draft');
  assert.strictEqual(doc['x-skills-license'], 'Proprietary. LICENSE.txt has complete terms');
  assert.ok(result.findings.some((f) => f.file === 'skills/doc-maker/SKILL.md' && /never published/u.test(f.message)));
  assert.ok(result.findings.some((f) => /Apache-2\.0 ×2, MIT ×1/u.test(f.message)));
  // AGSC-06-30: the draft is in no published surface.
  nodeFs.copyFileSync(path.join(ROOT, 'LICENSE-CONTENT'), path.join(into, 'LICENSE-CONTENT'));
  const built = exportVerb.run(ctxFor(into, { verbFlags: { markdown: true } }));
  assert.deepStrictEqual(errors(built.findings), []);
  assert.ok(!nodeFs.existsSync(path.join(into, 'dist/export/markdown/content/procedures/doc-maker.md')));
});

test('claude-plugin: the plugin version is recorded, an unlicensed skill is draft, hooks and scripts are dropped', () => {
  const into = emptyBundle();
  const result = imported(into, fixture('claude-plugin'));
  assert.deepStrictEqual(errors(result.findings), []);
  assert.match(result.notes, /skills layout claude-plugin \(detected\); also found: agentskills/u);
  const review = fm(read(into, 'content/procedures/review-checklist.md'));
  assert.strictEqual(review.prov.source_version, '2.1.0');
  assert.strictEqual(review['x-skills-layout'], 'claude-plugin');
  const helper = fm(read(into, 'content/procedures/unlicensed-helper.md'));
  assert.strictEqual(helper.status, 'draft');
  assert.ok(!('x-skills-license' in helper));
  assert.ok(result.findings.some((f) => f.file === 'skills/unlicensed-helper/SKILL.md' && /no licence was found/u.test(f.message)));
  assert.deepStrictEqual(result.findings.filter((f) => f.code === 'AGSC-E407').map((f) => f.file).sort(),
    ['.mcp.json', 'hooks/hooks.json', 'scripts/format.sh']);
  assert.ok(result.findings.some((f) => f.file === 'commands/status.md' && f.code === 'AGSC-E506'));
});

test('marketplace: listed skills only, a remote source is reported and never fetched', () => {
  const into = emptyBundle();
  const result = imported(into, fixture('marketplace'));
  assert.deepStrictEqual(errors(result.findings), []);
  assert.deepStrictEqual([...tree(path.join(into, 'content')).keys()], ['procedures/csv-helper.md']);
  const csv = fm(read(into, 'content/procedures/csv-helper.md'));
  assert.strictEqual(csv.prov.source_version, '1.0.0');
  assert.strictEqual(csv['x-skills-license'], 'Apache-2.0 (LICENSE)');
  assert.ok(result.findings.some((f) => /"remote-skills" has a source outside this clone; it is never fetched/u.test(f.message)));
  assert.ok(result.findings.some((f) => f.file === 'skills/not-listed/SKILL.md'));
  // The same clone read as a plain Agent Skills collection offers both.
  const all = imported(emptyBundle(), fixture('marketplace'), { layout: 'agentskills' });
  assert.match(all.notes, /import: 2 written/u);
});

test('cursor: rules become explainer concepts; an unquoted glob is read leniently; plain .md is ignored', () => {
  const into = emptyBundle();
  const result = imported(into, fixture('cursor'));
  assert.deepStrictEqual(errors(result.findings), []);
  const ts = fm(read(into, 'content/concepts/typescript.md'));
  assert.strictEqual(ts.kind, 'explainer');
  assert.strictEqual(ts.title, 'TypeScript conventions');
  assert.strictEqual(ts.description, 'TypeScript conventions for this repository, applied to every source file.');
  assert.strictEqual(ts['x-skills-globs'], '*.ts');
  assert.strictEqual(ts['x-skills-always-apply'], 'false');
  const always = fm(read(into, 'content/concepts/always.md'));
  assert.ok(!('description' in always), 'a description shorter than 40 code points is not a concept description');
  assert.strictEqual(always['x-skills-description'], 'Always');
  assert.strictEqual(always['x-skills-always-apply'], 'true');
  assert.ok(result.findings.some((f) => f.file === '.cursor/rules/typescript.mdc' && /failsafe YAML subset/u.test(f.message)));
  assert.ok(result.findings.some((f) => f.file === '.cursor/rules/ignored.md'));
});

test('windsurf: both rule directories are read, and the trigger and globs are kept', () => {
  const into = emptyBundle();
  const result = imported(into, fixture('windsurf'));
  assert.deepStrictEqual(errors(result.findings), []);
  const testing = fm(read(into, 'content/concepts/testing.md'));
  assert.strictEqual(testing['x-skills-trigger'], 'glob');
  assert.strictEqual(testing['x-skills-globs'], '**/*.test.ts');
  const style = fm(read(into, 'content/concepts/style.md'));
  assert.strictEqual(style['x-skills-trigger'], 'always_on');
  assert.strictEqual(style['x-skills-source'], '.devin/rules/style.md');
});

test('--source-version is recorded on every foreign item, and a malformed one is refused', () => {
  const into = emptyBundle();
  imported(into, fixture('cursor'), { 'source-version': 'v3.0.1' });
  assert.strictEqual(fm(read(into, 'content/concepts/typescript.md')).prov.source_version, 'v3.0.1');
  const bad = imported(emptyBundle(), fixture('cursor'), { 'source-version': 'no spaces allowed' });
  assert.strictEqual(bad.status, 'fail');
  assert.deepStrictEqual(bad.findings.map((f) => f.code), ['AGSC-E204']);
  // A version the source states that is not a content version is omitted and said.
  const odd = writeTree(temp('agsc-skills-odd-'), {
    LICENSE: nodeFs.readFileSync(path.join(fixture('cursor'), 'LICENSE'), 'utf8'),
    'skills/odd/SKILL.md': '---\nname: odd\ndescription: A skill with a version that has spaces.\nmetadata:\n  version: "1 2"\n---\n\nBody.\n',
  });
  const oddInto = emptyBundle();
  const result = imported(oddInto, odd);
  assert.ok(!('source_version' in fm(read(oddInto, 'content/procedures/odd.md')).prov));
  assert.ok(result.findings.some((f) => /is not a content version/u.test(f.message)));
});

test('--list prints the catalogue of a clone and writes nothing; a link list is counted, never fetched', () => {
  const into = emptyBundle();
  const listed = imported(into, fixture('marketplace'), { list: true });
  assert.deepStrictEqual(errors(listed.findings), []);
  assert.match(listed.notes, /skills: layouts found: marketplace, agentskills/u);
  assert.match(listed.notes, /skills: \[marketplace\] skill csv-helper skills\/csv-helper\/SKILL\.md licence Apache-2\.0 \(LICENSE\) version 1\.0\.0 -> importable/u);
  const plugin = imported(into, fixture('claude-plugin'), { list: true });
  assert.match(plugin.notes, /unlicensed-helper .* -> draft/u);
  const pdf = imported(into, fixture('agentskills'), { list: true });
  assert.match(pdf.notes, /pdf-notes .* dropped 4 -> importable/u);
  const awesome = imported(into, fixture('awesome-list'), { list: true });
  assert.deepStrictEqual(errors(awesome.findings), []);
  assert.match(awesome.notes, /layouts found: none/u);
  assert.match(awesome.notes, /README\.md is a link list: 3 entries point to other repositories; nothing is fetched/u);
  assert.deepStrictEqual(tree(path.join(into, 'content')), new Map());
  // A link list holds nothing importable: importing it is AGSC-E901.
  const none = imported(into, fixture('awesome-list'));
  assert.strictEqual(none.status, 'fail');
  assert.deepStrictEqual(none.findings.map((f) => f.code), ['AGSC-E901']);
  // An empty clone has nothing to list either.
  const empty = imported(into, temp('agsc-skills-empty-'), { list: true });
  assert.strictEqual(empty.status, 'fail');
  assert.deepStrictEqual(empty.findings.map((f) => f.code), ['AGSC-E901']);
  // One link: the singular.
  const one = writeTree(temp('agsc-skills-one-'), { 'README.md': '- [x](https://example.org/x)\n' });
  assert.match(imported(into, one, { list: true }).notes, /1 entry points/u);
});

test('import: an unknown --layout is AGSC-E003; a missing clone and an unreadable file are refused', () => {
  const bad = imported(emptyBundle(), fixture('cursor'), { layout: 'vscode' });
  assert.strictEqual(bad.status, 'fail');
  assert.deepStrictEqual(bad.findings.map((f) => f.code), ['AGSC-E003']);
  const missing = imported(emptyBundle(), path.join(os.tmpdir(), 'agsc-no-such-clone-xyz'));
  assert.strictEqual(missing.status, 'fail');
  assert.deepStrictEqual(missing.findings.map((f) => f.code), ['AGSC-E901']);
  const big = writeTree(temp('agsc-skills-big-'), { 'skills/big/SKILL.md': 'x'.repeat(20 * 1024 * 1024) });
  const refused = imported(emptyBundle(), big);
  assert.strictEqual(refused.status, 'fail');
  assert.deepStrictEqual(refused.findings.map((f) => f.code), ['AGSC-E904']);
});

test('a dangling link in a clone is listed and never followed', () => {
  const clone = writeTree(temp('agsc-skills-link-'), {
    'skills/a/SKILL.md': '---\nname: a\ndescription: A skill beside a dangling link.\nlicense: MIT\n---\n\nBody.\n',
  });
  nodeFs.symlinkSync(path.join(clone, 'nowhere'), path.join(clone, 'dangling'));
  const into = emptyBundle();
  const result = imported(into, clone);
  assert.deepStrictEqual(errors(result.findings), []);
  assert.deepStrictEqual([...tree(path.join(into, 'content')).keys()], ['procedures/a.md']);
});

test('a clone\'s .git and node_modules are never walked, and a skill without a usable frontmatter is skipped', () => {
  const clone = writeTree(temp('agsc-skills-git-'), {
    '.git/HEAD': 'ref: refs/heads/main\n',
    '.git/skills/hidden/SKILL.md': '---\nname: hidden\ndescription: never seen\n---\n',
    'node_modules/pkg/SKILL.md': '---\nname: pkg\ndescription: never seen\n---\n',
    'LICENSE': nodeFs.readFileSync(path.join(fixture('cursor'), 'LICENSE'), 'utf8'),
    'skills/bare/SKILL.md': 'No frontmatter at all.\n',
    'skills/empty-description/SKILL.md': '---\nname: empty-description\ndescription: ""\n---\n\nBody.\n',
    'skills/renamed/SKILL.md': '---\nname: other-name\ndescription: The directory and the name differ.\n---\n\nBody.\n',
  });
  const into = emptyBundle();
  const result = imported(into, clone);
  assert.deepStrictEqual([...tree(path.join(into, 'content')).keys()], ['procedures/other-name.md']);
  assert.ok(result.findings.some((f) => f.file === 'skills/bare/SKILL.md' && /carries no frontmatter/u.test(f.message)));
  assert.ok(result.findings.some((f) => f.file === 'skills/empty-description/SKILL.md' && /requires a non-empty description/u.test(f.message)));
  assert.ok(result.findings.some((f) => /name "other-name" differs from its directory "renamed"/u.test(f.message)));
});

// ------------------------------------------------------------------ the CLI surface

test('the CLI admits --layout and --list only while the skills adapter is named', () => {
  assert.deepStrictEqual([...main.adapterFlagsFor('import', ['--from', 'skills']).keys()],
    ['--replace', '--allow-newer', '--source-version', '--layout', '--list']);
  assert.deepStrictEqual([...main.adapterFlagsFor('export', ['--to', 'skills']).keys()], ['--layout']);
  assert.deepStrictEqual([...main.adapterFlagsFor('export', ['--to', 'gabbe']).keys()], []);
  const into = emptyBundle();
  const env = { ...process.env, NO_COLOR: '1', SOURCE_DATE_EPOCH: EPOCH };
  const wrong = spawnSync(process.execPath, [BIN, 'import', '--from', 'gabbe', '--layout', 'cursor', fixture('cursor')],
    { cwd: into, encoding: 'utf8', env });
  assert.strictEqual(wrong.status, 2);
  assert.match(wrong.stderr, /AGSC-E002/u);
  const right = spawnSync(process.execPath, [BIN, 'import', '--from', 'skills', '--layout', 'cursor', '--dry-run',
    fixture('cursor')], { cwd: into, encoding: 'utf8', env });
  assert.strictEqual(right.status, 0, right.stderr);
  assert.match(right.stderr, /import: --dry-run: 2 file\(s\) would be written/u);
});

// ------------------------------------------------------------------ the pure helpers

test('the helpers: licences, licence texts, lenient frontmatter, paths, detection, records', () => {
  assert.strictEqual(skills.licenceId('apache-2.0'), 'Apache-2.0');
  assert.strictEqual(skills.licenceId('GPL-3.0-or-later'), 'GPL-3.0');
  assert.strictEqual(skills.licenceId('MIT License'), 'MIT');
  assert.strictEqual(skills.licenceId('Proprietary'), null);
  assert.strictEqual(skills.licenceId(''), null);
  assert.strictEqual(skills.licenceId(undefined), null);
  assert.strictEqual(skills.licenceFromText('Redistribution and use in source and binary forms ... Neither the name'), 'BSD-3-Clause');
  assert.strictEqual(skills.licenceFromText('Redistribution and use in source and binary forms'), 'BSD-2-Clause');
  assert.strictEqual(skills.licenceFromText('CC0 1.0 Universal'), 'CC0-1.0');
  assert.strictEqual(skills.licenceFromText('All rights reserved.'), null);
  assert.deepStrictEqual({ ...skills.flatFrontmatter('a: "x\\"y"\nb: \'it\'\'s\'\nc: plain\n  nested: no\nd: "broken\\"') },
    { a: 'x"y', b: 'it\'s', c: 'plain', d: 'broken\\' });
  assert.strictEqual(skills.relativeDir('./skills/x/'), 'skills/x');
  assert.strictEqual(skills.relativeDir('.'), '');
  assert.strictEqual(skills.relativeDir('.claude/skills'), '.claude/skills');
  assert.strictEqual(skills.relativeDir('../outside'), null);
  assert.strictEqual(skills.relativeDir('/abs'), null);
  assert.deepStrictEqual(skills.detect(['.windsurf/rules/a.md', '.cursor/rules/b.mdc']), ['cursor', 'windsurf']);
  assert.deepStrictEqual(skills.detect(undefined), []);
  assert.strictEqual(skills.decodeRecord('!!!'), null);
  assert.strictEqual(skills.decodeRecord(Buffer.from('[]').toString('base64')), null);
  assert.strictEqual(skills.packBody('no frontmatter'), 'no frontmatter');
  assert.strictEqual(skills.packLicence('nothing'), '');
  assert.strictEqual(skills.linkEntries(undefined), 0);
  const read = skills.readFrontmatter('no block\n', 'x.md');
  assert.deepStrictEqual([read.fm, read.lenient], [null, false]);
  // A licence key naming a bundled file that states no known licence stays unrecognised.
  const odd = skills.licenceOf({ license: 'see LICENSE.txt' }, 'd', { files: { 'd/LICENSE.txt': 'custom' }, paths: ['d/LICENSE.txt'] }, null);
  assert.deepStrictEqual(odd, { declared: 'see LICENSE.txt', from: 'd/LICENSE.txt', id: null });
  // A restrictive sentence is believed even when its file quotes an open licence.
  const quoting = skills.licenceOf({ license: 'Proprietary; see LICENSE.txt' }, 'd',
    { files: { 'd/LICENSE.txt': 'Portions under the MIT License' }, paths: ['d/LICENSE.txt'] }, null);
  assert.strictEqual(quoting.id, null);
  // A plugin's own licence is the third place looked.
  const fromPlugin = skills.licenceOf({}, 'd', { files: {}, paths: [] }, { declared: 'MIT', from: 'p.json' });
  assert.deepStrictEqual(fromPlugin, { declared: 'MIT', from: 'p.json', id: 'MIT' });
  assert.deepStrictEqual(skills.licenceOf(null, 'd', { files: {}, paths: [] }, null), { declared: null, from: null, id: null });
  // No licence key: a recognised licence file beside the skill is read; an unknown one is passed over.
  const beside = skills.licenceOf({}, 'd', { files: { 'd/COPYING': 'custom', 'd/LICENSE': 'MIT License' },
    paths: ['d/COPYING', 'd/LICENSE'] }, null);
  assert.deepStrictEqual(beside, { declared: 'LICENSE', from: 'd/LICENSE', id: 'MIT' });
  const unparsable = skills.sources('claude-plugin', { files: { '.claude-plugin/plugin.json': '{' }, paths: [] });
  assert.ok(unparsable.findings.some((f) => /is not a JSON object/u.test(f.message)));
  assert.strictEqual(skills.FORMAT, 'skills');
  assert.ok(skills.CLAIMED_KEYS.import.skill.includes('name'));
});

test('manifests that are not JSON objects, custom skill paths and plugin roots in a subdirectory', () => {
  const findings = [];
  const listed = skills.sources('claude-plugin', {
    files: { '.claude-plugin/plugin.json': '[1]' }, paths: ['.claude-plugin/plugin.json', 'skills/a/SKILL.md'],
  });
  findings.push(...listed.findings);
  assert.ok(findings.some((f) => /is not a JSON object/u.test(f.message)));
  assert.deepStrictEqual(listed.entries.map((e) => e.path), ['skills/a/SKILL.md']);
  const custom = skills.sources('claude-plugin', {
    files: { '.claude-plugin/plugin.json': '{"skills":["./extra/"],"license":"MIT","version":"1.0.0"}' },
    paths: ['.claude-plugin/plugin.json', 'extra/b/SKILL.md', 'skills/a/SKILL.md'],
  });
  assert.deepStrictEqual(custom.entries.map((e) => [e.path, e.version, e.licence.declared]),
    [['extra/b/SKILL.md', '1.0.0', 'MIT'], ['skills/a/SKILL.md', '1.0.0', 'MIT']]);
  const market = skills.sources('marketplace', {
    files: {
      '.claude-plugin/marketplace.json': JSON.stringify({ plugins: [
        { license: 'Apache-2.0', name: 'sub', source: './plugins/sub' },
        { source: '../escape' },
        'not an object',
      ] }),
      'plugins/sub/.claude-plugin/plugin.json': '{"version":"3.0.0","skills":"./more"}',
    },
    paths: ['.claude-plugin/marketplace.json', 'plugins/sub/.claude-plugin/plugin.json', 'plugins/sub/hooks/h.json',
      'plugins/sub/more/c/SKILL.md', 'plugins/sub/skills/s/SKILL.md'],
  });
  assert.deepStrictEqual(market.entries.map((e) => [e.path, e.version, e.licence.from]),
    [['plugins/sub/more/c/SKILL.md', '3.0.0', '.claude-plugin/marketplace.json'],
      ['plugins/sub/skills/s/SKILL.md', '3.0.0', '.claude-plugin/marketplace.json']]);
  assert.ok(market.findings.some((f) => /"\(unnamed\)" has a source outside this clone/u.test(f.message)));
  assert.ok(market.findings.some((f) => f.code === 'AGSC-E407' && f.file === 'plugins/sub/hooks/h.json'));
  // A marketplace plugin whose skills are listed relative to its own root.
  const listedIn = skills.sources('marketplace', {
    files: { '.claude-plugin/marketplace.json': JSON.stringify({ plugins: [{ name: 'p', skills: ['./s'], source: './p' }] }) },
    paths: ['.claude-plugin/marketplace.json', 'p/s/SKILL.md'],
  });
  assert.deepStrictEqual(listedIn.entries.map((e) => e.path), ['p/s/SKILL.md']);
  // garden-skills' shape: the plugin's source IS the skill directory, listed as "./".
  const garden = skills.sources('marketplace', {
    files: { '.claude-plugin/marketplace.json': JSON.stringify({ plugins: [{ name: 'g', skills: ['./'], source: './skills/g' }] }) },
    paths: ['.claude-plugin/marketplace.json', 'skills/g/SKILL.md', 'skills/g/scripts/run.sh'],
  });
  assert.deepStrictEqual(garden.entries.map((e) => e.path), ['skills/g/SKILL.md']);
  // Its scripts are the skill's to report (once, by the mapping), not the plugin's too.
  assert.deepStrictEqual(garden.findings, []);
  // A skill directory with a nested skill: the nested one's files are its own.
  assert.deepStrictEqual(skills.supportingFiles('a', ['a/SKILL.md', 'a/LICENSE', 'a/x.md', 'a/b/SKILL.md', 'a/b/y.md']), ['a/x.md']);
  // No manifest at all: an empty plugin manifest and an empty marketplace read as empty.
  assert.deepStrictEqual(skills.sources('marketplace', { files: {}, paths: [] }), { entries: [], findings: [] });
  // A rule with no frontmatter is skipped; a rule whose description is a list is kept verbatim.
  const planned = skills.plan({
    files: { '.cursor/rules/a.mdc': 'none\n', '.cursor/rules/b.mdc': '---\nglobs:\n  - "*.ts"\n  - "*.js"\n---\n\nBody.\n' },
    paths: ['.cursor/rules/a.mdc', '.cursor/rules/b.mdc'],
  }, { itemSchema: JSON.parse(nodeFs.readFileSync(path.join(ROOT, 'schema/item.schema.json'), 'utf8')), layout: 'cursor', toolSpecVersion: SPEC });
  assert.strictEqual(planned.totals.foreign_skipped, 1);
  assert.match(planned.writes[0].text, /x-skills-globs:\n {2}- "\*\.ts"\n {2}- "\*\.js"/u);
  assert.match(planned.writes[0].text, /operator: human:unknown/u);
});
