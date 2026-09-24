'use strict';
// verifies AGSC-10-02
// A Level-0 node produced WITHOUT the reference engine, as AGSC-10-11 asks the
// distribution's own end-to-end run to include: a few lines of plain Node write
// the static files a CMS or wiki export would publish — two Markdown items with
// valid frontmatter, a graph.jsonld, an llms.txt and the discovery document of
// AGSC-06-07…10 with no digest and no agsc-* attribute — and the shipped checker
// passes it at Level 0, while the same document with an unregistered relation
// fails. Nothing from src/ is loaded. Deterministic, offline, scratch directory.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const BASE = 'https://node.example/';

function write(dir, rel, text) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
}

test('a hand-written Level-0 node passes the shipped checker at Level 0', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agsc-level0-'));
  try {
    const items = [
      ['handoff', 'Handoff', 'The transfer of control and context from one agent to another, recorded for audit.'],
      ['supervisor', 'Supervisor', 'A coordinating agent that routes work to specialised workers and collects results.'],
    ];
    for (const [slug, title, description] of items) {
      write(dir, `pages/${slug}.md`, `---\ntype: concept\ntitle: ${title}\ndescription: ${description}\nkind: pattern\nprov:\n  origin: human\n  operator: human:publisher\n---\n\n# ${title}\n\n${description}\n`);
    }
    const graph = {
      '@context': { '@vocab': 'https://w3id.org/agentic-system-core/ns#' },
      '@graph': items.map(([slug, title]) => ({ '@id': `${BASE}concepts/${slug}/`, '@type': 'Concept', prefLabel: title })),
    };
    write(dir, 'graph.jsonld', `${JSON.stringify(graph)}\n`);
    write(dir, 'llms.txt', `# A hand-made node\n\n> Two items, no engine.\n\n## Items\n\n${items.map(([slug, title, d]) => `- [${title}](${BASE}pages/${slug}.md): ${d}`).join('\n')}\n`);
    const document = {
      linkset: [{
        alternate: [{ href: `${BASE}llms.txt`, type: 'text/plain' }],
        anchor: BASE,
        describedby: [{ href: `${BASE}graph.jsonld`, type: 'application/ld+json' }],
      }],
    };
    const at = path.join(dir, '.well-known', 'knowledge-linkset');
    write(dir, '.well-known/knowledge-linkset', `${JSON.stringify(document)}\n`);
    const check = (args) => spawnSync(process.execPath, [path.join(ROOT, 'tools', 'validate-wellknown'), ...args],
      { encoding: 'utf8', env: { NO_COLOR: '1', PATH: process.env.PATH } });
    const pass = check([at, '--level', '0', '--json']);
    assert.strictEqual(pass.status, 0, pass.stdout + pass.stderr);
    assert.strictEqual(JSON.parse(pass.stdout).status, 'pass');
    document.linkset[0]['made-up'] = [{ href: `${BASE}llms.txt` }];
    write(dir, '.well-known/knowledge-linkset', `${JSON.stringify(document)}\n`);
    assert.strictEqual(check([at, '--level', '0', '--json']).status, 1);
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});
