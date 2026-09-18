'use strict';
// Not a test — the representative Bundle the graph tests export.
//
// It exercises every rule of §05 that emits a triple at 1.x: each of the six item
// types (AGSC-05-12), the three literal forms (AGSC-05-31), a language-tagged label
// and an alias (AGSC-05-17), cluster membership and cluster NESTING (AGSC-05-18/19),
// a semantic relation between Concepts (AGSC-05-20), a symmetric Link, a Link with a
// computed inverse (AGSC-05-16), a Source, a Review, an Attachment (AGSC-05-14/15/29)
// and the port and task-state properties of AGSC-05-30. One fixture, used by the
// round-trip check of `graph-0011`, by the isomorphism test and by the RDF/XML test,
// so that "every view expresses the same triples" (AGSC-05-06) is checked on the same
// triples every time.
//
// The clock is fixed: every date here is a literal, and nothing reads `Date`.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

/** The versioned context URL `graph.jsonld` references (AGSC-05-09, AGSC-06-32). */
const CONTEXT_URL = 'https://example.org/ns/1.0.0-draft.1/context.jsonld';

const ITEMS = Object.freeze([
  { type: 'cluster', slug: 'foundations', title: 'Foundations' },
  { type: 'cluster', slug: 'protocols', title: 'Protocols', broader: ['foundations'] },
  {
    type: 'concept',
    slug: 'a2a',
    title: 'A2A',
    description: 'An agent-to-agent protocol.',
    aliases: ['Agent2Agent'],
    kind: 'explainer',
    status: 'stable',
    lang: 'en',
    date: '2026-01-01',
    modified: '2026-02-01',
    stale_after: '2027-01-01',
    clusters: ['protocols'],
    requires: ['mcp'],
    related: ['mcp'],
    broader: ['mcp'],
    uses: ['p1'],
    excludes: ['l1'],
    contradicts: ['l1'],
    implements: ['g1'],
    verifies: ['g1'],
    covers: ['g1'],
    'blocked-by': ['e1'],
    'decided-by': ['e1'],
    produces: ['events', 'metrics'],
    consumes: ['config'],
    task_state: 'TASK_STATE_WORKING',
    verdict_digest: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    prov: { origin: 'human', operator: 'human:andrei', model: 'none', agent: 'planner' },
    generated: { by: 'human:andrei', at: '2026-01-01T00:00:00Z' },
    sources: [{
      resource: 'https://example.org/paper',
      title: 'Notes on the Analytical Engine',
      author: 'Ada Lovelace',
      year: '1843',
      grade: 'primary',
      verified: '2026-01-01',
    }],
    verified: [{ by: 'human:andrei', at: '2026-01-01T00:00:00Z' }],
    attachments: [{ file: 'live.svg', media_type: 'image/svg+xml', alt: 'Live diagram' }],
  },
  { type: 'concept', slug: 'mcp', title: 'MCP', lang: 'en', status: 'retired', modified: '2026-03-01' },
  { type: 'lesson', slug: 'l1', title: 'A lesson', severity: 'warn', lang: 'en' },
  { type: 'episode', slug: 'e1', title: 'An episode', outcome: 'success', lang: 'en' },
  { type: 'gate', slug: 'g1', title: 'A gate', level: 'L1', lang: 'en' },
  {
    type: 'procedure',
    slug: 'p1',
    title: 'A procedure',
    lang: 'en',
    'derived-from': ['a2a'],
    supersedes: ['mcp'],
  },
]);

/** Everything `nquads.dataset`, `turtle.toTurtle` and `jsonld.toJsonLd` need. */
function options(extra = {}) {
  return {
    base: 'https://example.org',
    bundle: {
      id: 'example',
      spec_version: '1.0.0-rc.4',
      license_prose: 'LicenseRef-AgenticSystemCore-Content-Use-1.0',
      usage_info: 'https://example.org/legal/#content-use-terms',
    },
    attachmentBytes: { 'a2a/live.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>' },
    sha256: (bytes) => crypto.createHash('sha256').update(bytes).digest('hex'),
    contextUrl: CONTEXT_URL,
    ...extra,
  };
}

/** The vocabulary as shipped — the context file's only input (AGSC-06-32). */
function ontologyText() {
  return fs.readFileSync(path.join(ROOT, 'ontology', 'agsc.ttl'), 'utf8');
}

module.exports = { ROOT, CONTEXT_URL, ITEMS, options, ontologyText };
