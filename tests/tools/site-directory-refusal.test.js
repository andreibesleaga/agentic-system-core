'use strict';
// SITE4-05 (ENG-9): pointed at a directory that is not their contract's input — a
// published site — `validate-vectors` judged the site's JSON files as vectors (29
// missing-member errors about `/.well-known/tdmrep.json` and `/skills/index.json`)
// and `validate-diagrams` reported `/now.md` as a diagram file with no mermaid block.
// AGSC-09-90: a validator MUST fail with AGSC-E901 when "the inputs its contract
// names are absent, or are present and carry nothing it can validate". Judging other
// files instead is the same trap from the other side: both now refuse, with E901 only.

const assert = require('node:assert/strict');
const path = require('node:path');
const { describe, it } = require('node:test');

const { REPO, capture, envelope, tmpdir, writeTree } = require('./helpers');

/** The shape of a published node's output directory. */
function siteDir() {
  return writeTree(tmpdir(), {
    '.well-known/knowledge-linkset': '{"linkset":[]}\n',
    '.well-known/tdmrep.json': '[{"location":"/","tdm-reservation":1}]\n',
    'graph.jsonld': '{}\n',
    'index.html': '<!DOCTYPE html>\n',
    'now.md': '# Now\n\nNothing yet.\n',
    'pages/a.md': '---\ntype: concept\n---\n',
    'skills/index.json': '{"skills":[]}\n',
  });
}

describe('checkers refuse a site directory (SITE4-05)', () => {
  it('validate-vectors: AGSC-E901 and nothing else — no site file is judged as a vector', () => {
    const { code, json } = envelope('validate-vectors', [siteDir()]);
    assert.equal(code, 1);
    assert.deepEqual([...new Set(json.findings.map((f) => f.code))], ['AGSC-E901']);
    assert.match(json.findings[0].message, /not a vector/u);
    const human = capture('validate-vectors', [siteDir()]);
    assert.match(human.out, /0 input file\(s\) read/u);
  });

  it('validate-vectors: a vector tree with a misplaced file still judges that file (AGSC-E205)', () => {
    const vector = JSON.parse(require('node:fs').readFileSync(
      path.join(REPO, 'tests', 'vectors', 'jcs', 'jcs-0001-canonical-output.json'), 'utf8'));
    const tree = writeTree(tmpdir(), {
      'jcs/jcs-0001-canonical-output.json': `${JSON.stringify(vector)}\n`,
      'misc/jcs-0002-x.json': '{}\n',
    });
    const { json } = envelope('validate-vectors', [tree]);
    assert.ok(json.findings.some((f) => f.file.endsWith('misc/jcs-0002-x.json')), JSON.stringify(json.findings));
  });

  it('validate-diagrams: AGSC-E901 and nothing else — /now.md is not a diagram file', () => {
    const { code, json } = envelope('validate-diagrams', [siteDir()]);
    assert.equal(code, 1);
    assert.deepEqual([...new Set(json.findings.map((f) => f.code))], ['AGSC-E901']);
    assert.match(json.findings[0].message, /not a diagram pack/u);
    const human = capture('validate-diagrams', [siteDir()]);
    assert.match(human.err, /AGSC-E901 .*not a diagram pack/u);
    assert.match(human.out, /0 input file\(s\) read/u);
    assert.equal(capture('validate-diagrams', ['--quiet', siteDir()]).out, '');
  });

  it('the shipped inputs still pass', () => {
    assert.equal(envelope('validate-vectors', []).code, 0);
    assert.equal(envelope('validate-diagrams', []).code, 0);
  });
});
