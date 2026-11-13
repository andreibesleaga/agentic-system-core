'use strict';
// tests/tools/validate-wellknown-card.test.js — AGSC-11-16: "a surface whose target does not
// resolve … is AGSC-E210 from validate-wellknown". The checker resolves the target of an
// `a2a-card` declaration on the node's own origin and warns AGSC-E210 when no card is served
// there (a warning, not an error: a 1.0 node declared the surface and served no card, D-15); a
// card on another origin is not fetched, the surface being declaration-only (AGSC-11-17).
//
// Over a real build of the minimal fixture, read from disk the way an operator checks a build
// output before deploying it, with one `a2a-card` declaration added to its discovery document.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { after, describe, it } = require('node:test');

const { buildFixture, cleanup } = require('../distribution/hosts/_build.js');
const { canonicalize } = require('../../src/knowledge/jcs.js');
const { REPO } = require('./helpers');

const SURFACE = 'https://w3id.org/agentic-system-core/rel#surface';
const OWN_CARD = 'https://minimal.example/.well-known/agent-card.json';

/** A fresh build whose discovery document declares an `a2a-card` at `href`; `card` writes the card. */
function checked(href, card = false) {
  const www = path.join(buildFixture(), 'www');
  const file = path.join(www, '.well-known', 'knowledge-linkset');
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const targets = doc.linkset[0][SURFACE];
  targets.push({ 'agsc-access': ['none'], 'agsc-surface': ['a2a-card'], 'agsc-surface-version': ['1.0'], href });
  targets.sort((a, b) => (a.href < b.href ? -1 : 1));
  fs.writeFileSync(file, `${canonicalize(doc)}\n`);
  if (card) fs.writeFileSync(path.join(www, '.well-known', 'agent-card.json'), '{}\n');
  const run = spawnSync(process.execPath, [path.join(REPO, 'tools', 'validate-wellknown'), file, '--json'], { encoding: 'utf8' });
  return { exit: run.status, findings: JSON.parse(run.stdout).findings };
}

const aboutCard = (findings) => findings.filter((f) => /a2a-card/u.test(f.message)).map((f) => [f.code, f.severity]);

after(cleanup);

describe('validate-wellknown: the a2a-card target on the node\'s own origin', () => {
  it('a declared card the node does not serve is the warning AGSC-E210, and the check still passes', () => {
    const { exit, findings } = checked(OWN_CARD);
    assert.deepEqual(aboutCard(findings), [['AGSC-E210', 'warn']]);
    assert.match(findings.find((f) => f.code === 'AGSC-E210').message, /agent-card\.json/u);
    assert.equal(exit, 0);
  });

  it('a card the node serves raises nothing', () => {
    assert.deepEqual(aboutCard(checked(OWN_CARD, true).findings), []);
  });

  it('a card on another origin is not fetched and raises nothing', () => {
    assert.deepEqual(aboutCard(checked('https://cards.example/.well-known/agent-card.json').findings), []);
  });
});
