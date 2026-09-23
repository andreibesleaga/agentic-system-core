'use strict';
// tools/publish-set — the on/off switch of the patterns node (D106).
//
// One list file in the Bundle names the slugs that are PUBLISHED; the tool sets
// `status: stable` on those, `status: draft` on every other item, and derives each
// cluster's own status from whether any published item names it — because a cluster
// page with no published member is a page that lists nothing (AGSC-06-30 keeps a
// draft off every surface, which is exactly what such a cluster should be).
//
// It is a content operation, not a validator: AGSC-09-90's nine command contracts
// are untouched, and this tool adds no rule, no code and no vector.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const { capture, envelope, tmpdir, writeTree } = require('./helpers');

// `tmpdir()` registers one exit listener per throw-away Bundle and this suite makes
// more than ten; the warning that follows is Node's default listener cap and not a
// leak. The cap is lifted for this file's own process only.
process.setMaxListeners(0);

const item = (slug, status, clusters) => [
  '---',
  'type: concept',
  `title: ${slug}`,
  `description: A description of ${slug} that is long enough to stand on its own.`,
  ...(status === null ? [] : [`status: ${status}`]),
  'tags:',
  '  - loop',
  '  - memory',
  ...(clusters ? ['clusters:', ...clusters.map((c) => `  - ${c}`)] : []),
  '---',
  '',
  `# ${slug}`,
  '',
  'A body.',
  '',
].join('\n');

const cluster = (slug, status) => [
  '---',
  'type: cluster',
  `title: ${slug}`,
  `description: A description of the ${slug} cluster that is long enough to stand alone.`,
  ...(status === null ? [] : [`status: ${status}`]),
  'order: 1',
  '---',
  '',
  `# ${slug}`,
  '',
  'Every item that names this cluster is listed here once it is published.',
  '',
].join('\n');

/** A Bundle of four items in two clusters, all published, and a list naming one. */
function bundle(slugs = ['alpha']) {
  return writeTree(tmpdir(), {
    'agsc.config.json': '{}\n',
    'content/index.md': '---\ntype: concept\ntitle: Root\n---\n\n# Root\n',
    'content/concepts/alpha.md': item('alpha', 'stable', ['one']),
    'content/concepts/beta.md': item('beta', 'stable', ['one']),
    'content/concepts/gamma.md': item('gamma', 'stable', ['two']),
    'content/concepts/delta.md': item('delta', null, ['two']),
    'content/clusters/one.md': cluster('one', null),
    'content/clusters/two.md': cluster('two', null),
    'publish-set.json': `${JSON.stringify({ _: 'a note', slugs }, null, 2)}\n`,
  });
}

const statusOf = (root, at) => {
  const m = /^status: (\S+)$/mu.exec(fs.readFileSync(path.join(root, at), 'utf8'));
  return m === null ? null : m[1];
};

describe('tools/publish-set (D106)', () => {
  it('publishes exactly the listed slugs and holds every other item back', () => {
    const root = bundle(['alpha', 'gamma']);
    const { code, json } = envelope('publish-set', [root]);
    assert.equal(code, 0);
    assert.equal(json.status, 'pass');
    assert.equal(json.verb, 'publish-set');
    assert.equal(statusOf(root, 'content/concepts/alpha.md'), 'stable');
    assert.equal(statusOf(root, 'content/concepts/beta.md'), 'draft');
    assert.equal(statusOf(root, 'content/concepts/gamma.md'), 'stable');
    assert.equal(statusOf(root, 'content/concepts/delta.md'), 'draft');
  });

  it('adds the field where the file carries none, in schema order (AGSC-04-19)', () => {
    const root = bundle(['delta']);
    capture('publish-set', [root]);
    const lines = fs.readFileSync(path.join(root, 'content/concepts/delta.md'), 'utf8').split('\n');
    assert.deepEqual(lines.slice(0, 5), ['---', 'type: concept', 'title: delta',
      'description: A description of delta that is long enough to stand on its own.',
      'status: stable']);
  });

  it('derives a cluster: published iff a published item names it', () => {
    const root = bundle(['alpha']);
    capture('publish-set', [root]);
    assert.equal(statusOf(root, 'content/clusters/one.md'), 'stable');
    assert.equal(statusOf(root, 'content/clusters/two.md'), 'draft');
  });

  it('is idempotent: the second run writes nothing and reports no change', () => {
    const root = bundle(['alpha', 'gamma']);
    const first = envelope('publish-set', [root]);
    assert.ok(first.json.findings.some((f) => f.code === 'AGSC-E506'));
    const before = fs.readFileSync(path.join(root, 'content/concepts/beta.md'));
    const second = envelope('publish-set', [root]);
    assert.deepEqual(second.json.findings, []);
    assert.match(second.out === '' ? second.err : second.out, /.*/u);
    assert.deepEqual(fs.readFileSync(path.join(root, 'content/concepts/beta.md')), before);
  });

  it('--check writes nothing and fails while the tree and the list disagree', () => {
    const root = bundle(['alpha', 'gamma']);
    const before = fs.readFileSync(path.join(root, 'content/concepts/beta.md'));
    const check = envelope('publish-set', ['--check', root]);
    assert.equal(check.code, 1);
    assert.equal(check.json.status, 'fail');
    assert.ok(check.json.findings.some((f) => f.code === 'AGSC-E206'
      && f.file === 'content/concepts/beta.md'));
    assert.deepEqual(fs.readFileSync(path.join(root, 'content/concepts/beta.md')), before);
    capture('publish-set', [root]);
    assert.equal(envelope('publish-set', ['--check', root]).code, 0);
  });

  it('a listed slug that names no item is an error, and nothing is written', () => {
    const root = bundle(['alpha', 'ghost']);
    const before = fs.readFileSync(path.join(root, 'content/concepts/beta.md'));
    const { code, json } = envelope('publish-set', [root]);
    assert.equal(code, 1);
    assert.ok(json.findings.some((f) => f.code === 'AGSC-E206' && /ghost/u.test(f.message)));
    assert.deepEqual(fs.readFileSync(path.join(root, 'content/concepts/beta.md')), before);
  });

  it('never passes on nothing: no list, an empty list, or no item file (FV29-10)', () => {
    const noList = writeTree(tmpdir(), { 'content/concepts/a.md': item('a', 'stable') });
    assert.equal(capture('publish-set', [noList]).code, 2);

    const emptyList = writeTree(tmpdir(), {
      'content/concepts/a.md': item('a', 'stable'),
      'publish-set.json': '{"slugs": []}\n',
    });
    const empty = envelope('publish-set', [emptyList]);
    assert.equal(empty.code, 1);
    assert.ok(empty.json.findings.some((f) => f.code === 'AGSC-E901'));

    const noItems = writeTree(tmpdir(), { 'publish-set.json': '{"slugs":["a"]}\n' });
    assert.equal(capture('publish-set', [noItems]).code, 2);
  });

  it('answers --help, rejects an unknown flag, and states what it read', () => {
    const help = capture('publish-set', ['--help']);
    assert.equal(help.code, 0);
    assert.equal(help.err, '');
    assert.match(help.out, /^publish-set /u);
    assert.equal(capture('publish-set', ['--nope', bundle()]).code, 2);
    const human = capture('publish-set', [bundle(['alpha'])]);
    assert.match(human.out, /input file\(s\) read/u);
    assert.match(human.out, /1 published, 3 held back/u);
  });
});
