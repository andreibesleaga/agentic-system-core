'use strict';
// tests/docs/docs-accuracy.test.js — statements of the reference documents that a
// reader acts on, kept true: the protocols page, the two orientation pages, the
// implementers' guide, the connectors page and the security considerations. Where a
// statement describes the engine, the engine is asked as well, so the page and the
// code cannot drift apart; where the guide gives an example, the example is run.
//
// Deterministic: reads files of this repository and calls pure functions; the one
// JSON-LD processor run resolves its context from memory. No clock, no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

/** The text of one file of the repository, relative to its root. */
function read(rel) {
  return fs.readFileSync(path.join(ROOT, ...rel.split('/')), 'utf8');
}

/** Lines joined into one string, so that hard-wrapped prose reads as one paragraph. */
function flat(text) {
  return text.replace(/\s+/gu, ' ');
}

/** The text of one `## <heading>` section, up to the next `## ` heading. */
function section(text, heading) {
  const start = text.indexOf(`\n## ${heading}`);
  assert.ok(start >= 0, `no section "## ${heading}"`);
  const next = text.indexOf('\n## ', start + 4);
  return text.slice(start, next < 0 ? text.length : next);
}

/** The one Markdown table row that starts with `| <first cell>`. */
function row(text, firstCell) {
  const line = text.split('\n').find((l) => l.startsWith(`| ${firstCell}`));
  assert.ok(line !== undefined, `no table row "${firstCell}"`);
  return line;
}

// --- docs/PROTOCOLS.md ---------------------------------------------------------------

test('the protocols page names Unencoded-Digest beside Repr-Digest, and says neither is required', () => {
  const digest = row(read('docs/PROTOCOLS.md'), 'RFC 9530');
  assert.match(digest, /`Repr-Digest`/u);
  assert.match(digest, /`Unencoded-Digest`/u, 'the field for the digest of the unencoded bytes is named');
  assert.match(digest, /without a content coding/u, 'Repr-Digest only on a response with no content coding (AGSC-06-17)');
  assert.match(digest, /draft-ietf-httpbis-unencoded-digest/u, 'the document it is defined in');
  assert.match(digest, /does not emit/u, 'the reference engine emits neither field');
});

test('the protocols page does not call the Content-Signal line a licence dialect', () => {
  const robots = row(read('docs/PROTOCOLS.md'), 'RFC 9309');
  assert.doesNotMatch(robots, /AI-usage signals/u);
  assert.match(robots, /per-crawler groups/u);
  assert.match(robots, /`Content-Signal`[^|]*not a dialect/u);
});

// --- the AGSC-00-16 exception: three documents ------------------------------------------

for (const rel of ['docs/CODE-ORIENTATION.md', 'docs/SPEC-ORIENTATION.md', 'docs/IMPLEMENTERS-GUIDE.md']) {
  test(`${rel}: "a released vector is never edited" carries the specification-version exception`, () => {
    const text = flat(read(rel));
    const hits = [...text.matchAll(/never edited/gu)];
    assert.ok(hits.length > 0, 'the page states the immutability of a released vector');
    for (const hit of hits) {
      const around = text.slice(Math.max(0, hit.index - 250), hit.index + 300);
      assert.match(around, /specification-version string/u, `"${around.slice(200, 330)}" names no exception`);
      assert.match(around, /AGSC-00-16/u);
    }
  });
}

// --- docs/SPEC-ORIENTATION.md: the key words and the note form ----------------------------

test('the specification orientation lists every key word of the spec/00 key-words sentence', () => {
  const head = read('spec/00-overview.md').split('\n').find((l) => l.includes('BCP 14'));
  const words = [...head.slice(0, head.indexOf('BCP 14')).matchAll(/"([A-Z ]+)"/gu)].map((m) => m[1]);
  assert.ok(words.length >= 11, `${words.length} key words read from spec/00`);
  const bullet = flat(section(read('docs/SPEC-ORIENTATION.md'), '5.')).match(/\*\*The key words\*\*[^*]*/u);
  assert.ok(bullet !== null, 'the "key words" bullet');
  const listed = bullet[0].slice(0, bullet[0].indexOf(' mean '));
  for (const word of words) assert.match(listed, new RegExp(`(^|[ ,])${word}(,| and| mean|$)`, 'u'), word);
});

test('the specification orientation gives the one form of a dated amendment note', () => {
  const notes = flat(section(read('docs/SPEC-ORIENTATION.md'), '5.')).match(/\*\*Amendment notes\.\*\*.*?(?= - \*\*|$)/u);
  assert.ok(notes !== null);
  assert.match(notes[0], /\*\(Amended YYYY-MM-DD for <version>: <what changed>\)\*/u);
  assert.match(notes[0], /validate-spec/u, 'and that the checker holds every note to it');
});

// --- docs/IMPLEMENTERS-GUIDE.md ---------------------------------------------------------

test('the implementers\' guide: Level 0 does not inherit prov (AGSC-E501 at every Level)', () => {
  const step3 = row(section(read('docs/IMPLEMENTERS-GUIDE.md'), '1a.'), '3 ');
  assert.doesNotMatch(step3, /inherited from the Bundle/u);
  assert.match(step3, /`prov`[^|]*`origin`[^|]*`operator`[^|]*`AGSC-E501`/u);
});

test('the implementers\' guide: the validate-spec row names the editorial checks', () => {
  const spec = row(section(read('docs/IMPLEMENTERS-GUIDE.md'), '5.'), '`validate-spec`');
  assert.match(spec, /BCP 14 forms/u);
  assert.match(spec, /dated-note form/u);
});

test('the implementers\' guide: the JSON-LD framing example runs and gives plain nested JSON', async () => {
  const jsonldProcessor = require('jsonld');
  const jsonld = require('../../src/knowledge/jsonld.js');
  const turtle = require('../../src/knowledge/turtle.js');
  const fixture = require('../knowledge/_graph-fixture.js');

  const part = section(read('docs/IMPLEMENTERS-GUIDE.md'), '4b.');
  assert.match(part, /JSON-LD 1\.1 Framing/u);
  const block = /```json\n([\s\S]*?)```/u.exec(part);
  assert.ok(block !== null, 'the section carries a JSON frame');
  const frame = JSON.parse(block[1]);
  assert.equal(frame['@type'], 'Cluster');

  const context = jsonld.context(turtle.ontologyTerms(fixture.ontologyText()), jsonld.allExternalProperties());
  const document = jsonld.toJsonLd(fixture.ITEMS, fixture.options({ context }));
  const loader = async (url) => {
    if (url === fixture.CONTEXT_URL) return { contextUrl: null, document: context, documentUrl: url };
    throw new Error(`no URL but the context is resolved here: ${url}`);
  };
  // The page tells the reader to use the context URL its own graph.jsonld names.
  const framed = await jsonldProcessor.frame(document, { ...frame, '@context': document['@context'] }, { documentLoader: loader });
  const clusters = framed['@graph'] || [framed];
  assert.ok(clusters.length >= 1);
  let members = 0;
  for (const cluster of clusters) {
    assert.equal(cluster['@type'], 'Cluster');
    for (const member of [].concat(cluster.member || [])) {
      members += 1;
      assert.equal(typeof member, 'object', 'a member is embedded, not an IRI');
      for (const key of Object.keys(member)) assert.ok(['@id', '@type', 'prefLabel', 'definition'].includes(key), key);
    }
  }
  assert.ok(members >= 1, 'at least one member was embedded');
});

test('the implementers\' guide states the property-graph position and names GQL', () => {
  const part = flat(section(read('docs/IMPLEMENTERS-GUIDE.md'), '4b.'));
  assert.match(part, /property graph/u);
  assert.match(part, /ISO\/IEC 39075:2024/u);
  assert.match(part, /AGSC-11-13/u, 'no node answers queries');
});

test('the implementers\' guide states the cost of composition', () => {
  const part = flat(section(read('docs/IMPLEMENTERS-GUIDE.md'), '4c.'));
  assert.match(part, /AGSC-07-04/u);
  assert.match(part, /breadth-first/u);
  assert.match(part, /O\(/u);
  assert.match(part, /AGSC-07-08/u, 'the fixed order of the steps');
});

test('the implementers\' guide: graph.jsonld keeps @graph, and the round trip must keep it too', () => {
  const part = flat(section(read('docs/IMPLEMENTERS-GUIDE.md'), '4.'));
  assert.match(part, /one node/u);
  assert.match(part, /`graph: true`/u);
});

// --- docs/USING-WITH-ASSISTANTS.md and the Mode 1 guide: what remember needs ---------------

for (const [rel, heading] of [['docs/USING-WITH-ASSISTANTS.md', '4.'], ['docs/guides/mode-1.md', '2.']]) {
  test(`${rel}: remember needs the agent and the model too, unless the call asserts a human origin`, () => {
    const text = flat(section(read(rel), heading));
    assert.match(text, /`remember` needs the person operating it \(`"operator": "human:<id>"`\) or a declared agent lane, \*\*and\*\* the `agent` and `model` that helped write the item, unless the call says `"origin": "human"`; without an operator it refuses with `AGSC-E003`, and without `agent` and `model` the saved item fails `agsc lint` with `AGSC-E202` \(AGSC-08-01\)\./u);
    assert.doesNotMatch(text, /records the `model` and `agent` it is given/u, 'the sentence that read as if the operator alone were enough');
  });
}

// --- docs/guides/publish.md: a node served on the author's own machine -----------------------

test('the publishing guide says how to run both checkers against a locally served node', () => {
  const text = flat(section(read('docs/guides/publish.md'), '6.'));
  assert.match(text, /\*\*On your own machine first\.\*\* `agsc-host serve` prints `http:\/\/127\.0\.0\.1:8080\/`/u);
  assert.match(text, /set `site\.base` to `http:\/\/localhost:8080\/`, rebuild, serve, and run each checker on `http:\/\/localhost:8080\/\.well-known\/knowledge-linkset --level 2 --dev` \(the Python checker also needs `--allow-network`\); use `localhost`, not `127\.0\.0\.1`, in both places/u);
  assert.match(text, /`--dev` admits plain `http` to a loopback address and nothing else \(AGSC-09-93\)/u);
  // The paragraph is prose: the guide runner finds no new command block in section 6.
  const blocks = section(read('docs/guides/publish.md'), '6.').match(/^```bash/gmu) || [];
  assert.equal(blocks.length, 2, 'section 6 keeps its two command blocks, one per checker');
  // The sentence of the Mode 0 guide points here.
  assert.match(flat(read('docs/guides/mode-0.md')), /To run the checkers against this address, see the publishing guide §6 — `localhost`, not `127\.0\.0\.1`, in `site\.base` and on the command line\./u);
});

// --- docs/CONNECTORS.md -------------------------------------------------------------

test('the connectors page: an agent name that is no declared lane runs no lane gate, as the engine does', () => {
  const text = flat(read('docs/CONNECTORS.md'));
  assert.match(text, /names none of the node's `agents\[\]` entries[^.]*runs no lane gate/u);
  assert.match(text, /`agsc refresh --agent`[^.]*`AGSC-E509`/u);

  // The engine, asked the same question.
  const boardLanes = require('../../src/governance/board-lanes.js');
  const refresh = require('../../src/application/cli/verbs/refresh.js');
  const config = { agents: [{ name: 'lane-a', enabled: true, operator: 'human:a', tasks: ['claim'], max_claims: 0 }] };
  const task = { slug: 't', type: 'concept', kind: 'task', task_state: 'TASK_STATE_SUBMITTED' };
  const move = { path: 'content/concepts/t.md', slug: 't', task_state: 'TASK_STATE_WORKING' };
  assert.equal(boardLanes.moveRefusal(config, [task], { ...move, agent: 'ghost' }), null, 'no lane gate for an undeclared name');
  assert.notEqual(boardLanes.moveRefusal(config, [task], { ...move, agent: 'lane-a' }), null, 'the declared lane is gated');
  assert.equal(boardLanes.createRefusal(config, { agent: 'ghost', path: 'content/concepts/n.md', type: 'concept', task: 'plan' }), null);
  const refused = refresh.run({ config, verbFlags: { agent: 'ghost' } });
  assert.equal(refused.findings[0].code, 'AGSC-E509');
});

test('the connectors page: the Action in its one pinned form, and the local profile\'s Host limit', () => {
  const text = read('docs/CONNECTORS.md');
  assert.doesNotMatch(text, /@<tag-or-commit-sha>/u);
  assert.match(text, /`uses: andreibesleaga\/agentic-system-core@v\d+\.\d+\.\d+` \(the package tag, or its full commit SHA\)/u);
  assert.match(row(text, '`local`'), /`Host`[^|]*421/u);
});

// --- docs/SECURITY-CONSIDERATIONS.md ------------------------------------------------------

test('the security considerations: a matching digest proves which bytes were read, not that a statement is true', () => {
  const part = flat(section(read('docs/SECURITY-CONSIDERATIONS.md'), '2.'));
  assert.match(part, /proves which bytes were read/u);
  assert.match(part, /not that a statement[^.]* is true/u);
});

// --- docs/USE-CASES.md: a plan names its version ----------------------------------------

/** The text of one `### <id> — …` scenario, up to the next heading. */
function scenario(text, id) {
  const start = text.indexOf(`\n### ${id} — `);
  assert.ok(start >= 0, `no scenario "${id}"`);
  const next = text.slice(start + 4).search(/\n##/u);
  return flat(text.slice(start, next < 0 ? text.length : start + 4 + next));
}

test('use cases: what is not built names 1.1 or says it is not planned for a fixed version', () => {
  const text = read('docs/USE-CASES.md');
  assert.doesNotMatch(flat(text), /\b(wraps it|not runnable|not built) yet\b/u);
  assert.match(scenario(text, 'D2'), /no command wraps it, and none is planned for a fixed version/u);
  assert.match(scenario(text, 'M3'), /channel adapters are planned for 1\.1/u);
  assert.match(scenario(text, 'M5'), /runtime renderings[^.]*are planned for 1\.1/u);
});

// --- the seven file KINDS of a Harness (AGSC-07-12) ----------------------------------------

for (const rel of ['docs/diagrams/user-flows.md', 'src/composition/README.md']) {
  test(`${rel}: a Harness has seven file kinds, not seven files`, () => {
    const text = flat(read(rel));
    assert.doesNotMatch(text, /seven (Harness )?files/u);
    assert.match(text, /seven file kinds/u);
  });
}

// --- docs/plain/11-boundary.md, the agsc-cli page, w3c/README.md ----------------------------

test('the plain boundary chapter: a remote MCP responder is in scope, and the engine ships none', () => {
  const text = flat(read('docs/plain/11-boundary.md'));
  assert.doesNotMatch(text, /served now/u);
  assert.match(text, /A remote MCP responder is in scope at 1\.0; the reference engine ships none/u);
});

test('the agsc-cli page describes the engine with the main package\'s own sentence', () => {
  const page = read('packages/agsc-cli/README.md');
  const description = JSON.parse(read('package.json')).description;
  const first = description.slice(0, description.indexOf('. ') + 1);
  assert.doesNotMatch(page, /Distributed Ontological/u);
  assert.ok(flat(page).includes(first.replace(/^The /u, 'the ')), `the page quotes "${first}"`);
});

test('w3c/README.md does not say the report is hosted anywhere', () => {
  const text = flat(read('w3c/README.md'));
  assert.doesNotMatch(text, /hosted from this repository on GitHub Pages|is published on \*\*GitHub Pages\*\*/u);
  assert.match(text, /not published anywhere at 1\.0\.0/u);
});

// --- docs/RELATED-WORK.md: the rows read on 2026-10-10 --------------------------------------

test('related work: the IETF and WebMCP rows carry the state read on the day', () => {
  const text = read('docs/RELATED-WORK.md');
  const agentproto = row(text, 'IETF agentproto');
  assert.match(agentproto, /working group, active since 2026-10-08/u);
  assert.doesNotMatch(agentproto, /proposed WG|External Review/u);
  const dawn = row(text, 'IETF DAWN');
  assert.doesNotMatch(dawn, /telechat of 8 October/u);
  assert.match(row(text, 'WebMCP'), /the report of 9 October 2026, read 10 October 2026/u);
});

test('related work: the neighbours a reviewer asks about have rows', () => {
  const text = read('docs/RELATED-WORK.md');
  assert.match(row(text, 'SCITT'), /RFC 9943/u);
  assert.match(row(text, 'C2PA'), /2\.4/u);
  assert.match(row(text, '*Knowledge-as-Skill:'), /arXiv 2609\.25991/u);
  assert.match(row(text, '*Complex Knowledge Curation'), /Skillful-Alhazen/u);
  assert.match(flat(row(text, 'MCP Skills extension')), /skill packs are files[^|]*nothing here forecloses/u);
});
