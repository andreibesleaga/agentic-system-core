'use strict';
// verifies AGSC-08-04, AGSC-08-05
// ACCEPTANCE — `features/persona-d-agent-proposer.feature`, run end to end
// through the REAL local MCP server and the REAL command line (owner
// decision).
//
// The persona: an operator-run agent that prepares a change and never pushes on
// its own. What this proves, in the order a person and their assistant
// actually do it:
//
//   1. the assistant finds and reads the memory through the seven tools;
//   2. it asks for a change with `remember` / `propose` and is handed PREPARED
//      TEXT — nothing is written to the Bundle by the server, on either call;
//   3. the person saves that text, runs `agsc lint` and `agsc propose`, and gets
//      `dist/proposal/<n>.patch` and `<n>.md` plus the git commands PRINTED, not
//      run (AGSC-08-04, AGSC-08-05);
//   4. an item with no `prov.operator` is refused by lint, so the agent lane
//      cannot produce an unattributable change (PRD-042).
//
// Deterministic: fixed clock, no network, scratch Bundle under `os.tmpdir()`.
// The two scenarios of the feature that belong to the FORGE — the `Assisted-by:`
// trailer on the merged pull request and the five-open-bot-PR cap — are CI
// behaviour in `templates/github/`, not engine behaviour, and are not claimed here.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const ROOT = path.resolve(__dirname, '..', '..');
const MINIMAL = path.join(ROOT, 'tests', 'fixtures', 'minimal');
const EPOCH = '1767225600';
const ENV = { NO_COLOR: '1', PATH: process.env.PATH, SOURCE_DATE_EPOCH: EPOCH };

const temporaries = [];
test.after(() => {
  for (const dir of temporaries) fs.rmSync(dir, { force: true, recursive: true });
});

function scratchBundle() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-persona-d-'));
  temporaries.push(dir);
  fs.cpSync(MINIMAL, dir, { recursive: true });
  return dir;
}

function cli(cwd, argv) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'agsc.js'), ...argv],
    { cwd, encoding: 'utf8', env: ENV });
  return { err: r.stderr, exit: r.status, out: r.stdout };
}

async function connect(cwd) {
  const transport = new StdioClientTransport({
    args: [path.join(ROOT, 'bin', 'agsc.js'), 'mcp'],
    command: process.execPath,
    cwd,
    env: ENV,
  });
  const client = new Client({ name: 'persona-d', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
  return client;
}

const envelopeOf = (result) => result.structuredContent;

/** Every file of the Bundle, so "the server wrote nothing" can be measured. */
function snapshot(dir) {
  const out = [];
  const walk = (rel) => {
    for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const next = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(next);
      else out.push(`${next}:${fs.readFileSync(path.join(dir, next)).length}`);
    }
  };
  walk('');
  return out;
}

test('persona-d: an assistant reads the memory, is handed prepared text, and writes nothing', async () => {
  const dir = scratchBundle();
  const before = snapshot(dir);
  const client = await connect(dir);
  let remembered;
  let proposed;
  try {
    // 1. It finds the memory the way any assistant does.
    const hits = envelopeOf(await client.callTool({ arguments: { query: 'handoff' }, name: 'search' })).body.hits;
    assert.ok(hits.length >= 1);
    const item = envelopeOf(await client.callTool({ arguments: { slug: hits[0].slug }, name: 'read' }));
    assert.strictEqual(item.type, 'item');

    // 2a. `remember` — the assistant declares who it is; the item is SYNTHESIZED
    // and handed back. AGSC-09-14b: `prov.origin` is `ai-generated` unless the
    // caller asserts `human`, and no clock is read.
    remembered = envelopeOf(await client.callTool({
      arguments: {
        actor: 'process:persona-d',
        agent: 'claude-code/1.0',
        body: 'Two agents lost the reason a handoff happened, so the audit trail broke.',
        kind: 'lesson',
        model: 'an assistant model',
        operator: 'human:andreibesleaga',
        title: 'Record why a handoff happened',
      },
      name: 'remember',
    }));
    assert.strictEqual(remembered.type, 'proposal');
    assert.strictEqual(remembered.body.path, 'content/lessons/record-why-a-handoff-happened.md');
    assert.strictEqual(remembered.body.frontmatter.prov.origin, 'ai-generated');
    assert.strictEqual(remembered.body.frontmatter.prov.operator, 'human:andreibesleaga');
    assert.strictEqual(remembered.body.frontmatter.actor, 'process:persona-d');
    // fixed by on both transports: AGSC-09-14b says `remember`
    // MUST synthesize a CONFORMING item and that `severity` defaults to `info`;
    // the default used to reach an `episode` only, so a remembered `lesson` came
    // back without the key its own schema branch requires.
    assert.strictEqual(remembered.body.frontmatter.severity, 'info');

    // 2b. `propose` — the payload for an existing item, and no write.
    proposed = envelopeOf(await client.callTool({ arguments: { slug: 'handoff' }, name: 'propose' }));
    assert.strictEqual(proposed.type, 'proposal');
    assert.match(proposed.body.markdown, /^---\ntype: concept\n/u);
  } finally {
    await client.close();
  }

  // AGSC-08-04 / AGSC-09-16: not one byte of the Bundle changed. The server
  // never writes — the person does, after reading what was prepared.
  assert.deepStrictEqual(snapshot(dir), before);
  assert.strictEqual(fs.existsSync(path.join(dir, 'dist')), false);
  assert.strictEqual(fs.existsSync(path.join(dir, '.git')), false);

  // 3. The person saves the prepared text and runs the command line.
  const fm = remembered.body.frontmatter;
  const lines = ['---', `type: ${fm.type}`, `title: ${JSON.stringify(fm.title)}`,
    'description: A lesson recorded by an assistant and reviewed by a person, before it was merged.',
    'date: "2026-01-01"', 'severity: info', 'prov:', `  origin: ${fm.prov.origin}`,
    `  operator: ${fm.prov.operator}`, `  agent: ${JSON.stringify(fm.prov.agent)}`,
    `  model: ${JSON.stringify(fm.prov.model)}`, '---', '',
    '## Lesson', '', remembered.body.body, '',
    '## Evidence', '', 'The audit trail of a two-agent run had no reason recorded for the handoff.', '',
    '## Check before', '', 'A handoff records why control moved, not only that it moved.', ''];
  fs.mkdirSync(path.join(dir, 'content', 'lessons'), { recursive: true });
  fs.writeFileSync(path.join(dir, remembered.body.path), lines.join('\n'));

  const lint = cli(dir, ['lint']);
  assert.strictEqual(lint.exit, 0, lint.err || lint.out);

  const propose = cli(dir, ['propose', 'record-why-a-handoff-happened']);
  assert.strictEqual(propose.exit, 0, propose.err || propose.out);
  assert.ok(fs.existsSync(path.join(dir, 'dist', 'proposal', '1.patch')));
  const body = fs.readFileSync(path.join(dir, 'dist', 'proposal', '1.md'), 'utf8');
  // AGSC-08-05: the marker, the rationale, the affected slug and the provenance.
  assert.match(body, /^<!-- agsc:proposal v1 -->/u);
  assert.match(body, /- record-why-a-handoff-happened/u);
  assert.match(body, /- prov\.origin: ai-generated/u);
  assert.match(body, /- prov\.operator: human:andreibesleaga/u);

  // AGSC-08-04: the git commands are PRINTED, never run — there is still no
  // repository here, and no network write was attempted.
  assert.match(propose.err, /run: git apply dist\/proposal\/1\.patch/u);
  assert.match(propose.err, /run: git checkout -b proposal\/1/u);
  assert.match(propose.err, /run: open a pull request with the body of dist\/proposal\/1\.md/u);
  assert.strictEqual(fs.existsSync(path.join(dir, '.git')), false);
});

test('persona-d / PRD-042: an item with no prov.operator does not pass lint', () => {
  const dir = scratchBundle();
  fs.writeFileSync(path.join(dir, 'content', 'concepts', 'unattributed.md'), [
    '---', 'type: concept', 'title: "Unattributed"',
    'description: A change with no human behind it.', 'date: "2026-01-01"',
    'prov:', '  origin: ai-generated', 'kind: explainer', '---', '', '## Intent', '', 'Nothing.', '',
  ].join('\n'));
  const lint = cli(dir, ['lint']);
  assert.strictEqual(lint.exit, 1, lint.err || lint.out);
  assert.match(`${lint.out}${lint.err}`, /operator/u);
});
