'use strict';
// The three tools that read the declared specification version accept a release as
// well as a release candidate (plan item A4 of the 1.0.0 release plan, 2026-10-07).
//
// `spec/00-overview.md` declares the version as `spec_version: "<version>"`. Until
// the regexes read `(?:-rc\.\d+)?`, each of `tools/count-artifacts`,
// `tools/validate-vectors` and the conformance runner took the first `1.0.0-rc.N`
// literal of the file as the declaration, which stops being true the day the version
// is `1.0.0`. This file is the regression test the plan asked for: a copy of the
// distribution that declares `1.0.0` is read by both tools, and the runner's own
// declaration pattern matches both forms.
//
// Deterministic: temporary copies under the system temporary directory, no clock,
// no network; `validate-vectors` runs as a child process because it reads `spec/`
// beside its own file (AGSC-09-90: a checker is independent of the engine).

const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const { REPO, envelope, tmpdir } = require('./helpers');

const CANDIDATE = /1\.0\.0-rc\.\d+/gu;
const RELEASE = '1.0.0';

/** Copy `rel` from the repository into `root`, replacing every candidate version in text files. */
function copyAsRelease(root, rel) {
  const from = path.join(REPO, rel);
  const to = path.join(root, rel);
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const name of fs.readdirSync(from)) copyAsRelease(root, path.join(rel, name));
    return;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (/\.(?:md|json|ttl|html|txt)$/u.test(rel) || path.basename(rel) === 'validate-vectors') {
    fs.writeFileSync(to, fs.readFileSync(from, 'utf8').replace(CANDIDATE, RELEASE));
  } else {
    fs.copyFileSync(from, to);
  }
}

/** A distribution root that declares `1.0.0` everywhere the candidate stood. */
function releaseRoot() {
  const root = tmpdir();
  for (const rel of ['spec', 'ontology', 'tests/vectors', 'docs/SPEC.md', 'w3c/index.html', 'tools/validate-vectors']) {
    copyAsRelease(root, rel);
  }
  // `validate-vectors` stamps its envelope with the version of the package it ships in.
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'agentic-system-core', version: RELEASE }));
  const overview = fs.readFileSync(path.join(root, 'spec', '00-overview.md'), 'utf8');
  assert.match(overview, /spec_version: "1\.0\.0"/u, 'the copy declares 1.0.0');
  assert.doesNotMatch(overview, CANDIDATE, 'no candidate version is left in the copy');
  return root;
}

describe('plan item A4: the tools read a 1.0.0 declaration', () => {
  it('count-artifacts reports spec_version 1.0.0 and finds no disagreement', () => {
    const root = releaseRoot();
    const result = envelope('count-artifacts', [root]);
    assert.equal(result.code, 0, result.err);
    assert.equal(result.json.ok, true);
    assert.deepEqual(result.json.findings, []);
    assert.equal(result.json.counts.spec_version, RELEASE);
  });

  it('validate-vectors compares every vector against the 1.0.0 declaration and passes', () => {
    const root = releaseRoot();
    const run = cp.spawnSync(process.execPath, [path.join(root, 'tools', 'validate-vectors'), '--json', path.join(root, 'tests', 'vectors')], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const json = JSON.parse(run.stdout);
    assert.equal(json.status, 'pass');
    assert.deepEqual(json.findings, []);
  });

  it('the conformance runner declares the version with the same pattern, which matches both forms', () => {
    const source = fs.readFileSync(path.join(REPO, 'tests', 'conformance', 'vector-runner.test.js'), 'utf8');
    const pattern = /\/spec_version: "\(\\d\+\\\.\\d\+\\\.\\d\+\(\?:-rc\\\.\\d\+\)\?\)"\/u/u;
    assert.match(source, pattern, 'the runner reads the declaration with the release-or-candidate pattern');
    const re = /spec_version: "(\d+\.\d+\.\d+(?:-rc\.\d+)?)"/u;
    assert.equal(re.exec('spec_version: "1.0.0"')[1], '1.0.0');
    assert.equal(re.exec('spec_version: "1.0.0-rc.7"')[1], '1.0.0-rc.7');
    for (const tool of ['count-artifacts', 'validate-vectors']) {
      assert.match(fs.readFileSync(path.join(REPO, 'tools', tool), 'utf8'), pattern, `${tool} reads the declaration with the same pattern`);
    }
  });
});

/** Copy `rel` into `root`, turning only the version under test into the release; history literals stay. */
function copyWithOnly(root, rel, from, to) {
  const source = path.join(REPO, rel);
  const target = path.join(root, rel);
  if (fs.statSync(source).isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const name of fs.readdirSync(source)) copyWithOnly(root, path.join(rel, name), from, to);
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, fs.readFileSync(source, 'utf8').split(from).join(to));
}

describe('the declaration is read from its own line, never from a version quoted as history', () => {
  it('validate-spec reports the declared release although the overview quotes earlier candidates', () => {
    const root = tmpdir();
    const declared = /`spec_version: "(\d+\.\d+\.\d+(?:-rc\.\d+)?)"`/u.exec(fs.readFileSync(path.join(REPO, 'spec', '00-overview.md'), 'utf8'))[1];
    for (const rel of ['spec', 'docs/PRD.md']) copyWithOnly(root, rel, `spec_version: "${declared}"`, `spec_version: "${RELEASE}"`);
    const overview = fs.readFileSync(path.join(root, 'spec', '00-overview.md'), 'utf8');
    assert.match(overview, CANDIDATE, 'the copy still quotes an earlier candidate as history');
    const result = envelope('validate-spec', [root]);
    assert.equal(result.json.spec_version, RELEASE);
  });
});

describe('the tree states the version it releases, in every place that carries it', () => {
  const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
  const json = (rel) => JSON.parse(read(rel));
  const declared = /`spec_version: "([^"]+)"`/u.exec(read('spec/00-overview.md'))[1];

  it('the specification declares 1.0.0', () => {
    assert.equal(declared, RELEASE);
    assert.match(read('docs/SPEC.md'), new RegExp(`spec_version: "${RELEASE.replace(/\./gu, '\\.')}"`, 'u'));
  });

  it('the two packages, the alias dependency and the MCP Registry entry carry the same version', () => {
    const pkg = json('package.json');
    const alias = json('packages/agsc-cli/package.json');
    const server = json('server.json');
    assert.equal(pkg.version, RELEASE);
    assert.equal(alias.version, RELEASE);
    assert.equal(alias.dependencies['agentic-system-core'], RELEASE);
    assert.equal(server.version, RELEASE);
    assert.deepEqual(server.packages.map((p) => p.version), [RELEASE]);
    const lock = json('package-lock.json');
    assert.equal(lock.version, RELEASE);
    assert.equal(lock.packages[''].version, RELEASE);
  });

  it('the engine states the declared version as the one it implements', () => {
    assert.match(read('src/application/cli/main.js'), new RegExp(`const SPEC_VERSION = '${declared.replace(/\./gu, '\\.')}';`, 'u'));
  });

  it('the agent skill and its plugin copy name the release', () => {
    for (const rel of ['skills/agentic-system-core/SKILL.md', 'plugins/agentic-system-core/skills/agentic-system-core/SKILL.md']) {
      const text = read(rel);
      assert.match(text, new RegExp(`version: "${RELEASE.replace(/\./gu, '\\.')}"`, 'u'), rel);
      assert.doesNotMatch(text, CANDIDATE, rel);
    }
  });

  it('every Bundle the distribution ships declares the release in its configuration and its root index', () => {
    const roots = ['tests/fixtures/minimal', 'tests/fixtures/with-assets', 'tests/acceptance/bundle',
      ...fs.readdirSync(path.join(REPO, 'examples', 'demos'), { withFileTypes: true }).filter((e) => e.isDirectory()).flatMap((demo) => {
        const base = path.join('examples', 'demos', demo.name);
        return fs.existsSync(path.join(REPO, base, 'agsc.config.json')) ? [base]
          : fs.readdirSync(path.join(REPO, base)).map((sub) => path.join(base, sub)).filter((b) => fs.existsSync(path.join(REPO, b, 'agsc.config.json')));
      })];
    assert.ok(roots.length >= 9, 'the fixtures and the demos are found');
    for (const base of roots) {
      assert.equal(json(path.join(base, 'agsc.config.json')).spec_version, RELEASE, base);
      assert.match(read(path.join(base, 'content', 'index.md')), new RegExp(`^spec_version: "?${RELEASE.replace(/\./gu, '\\.')}"?$`, 'mu'), base);
    }
  });

  it('the vocabulary file records a modification after the last candidate was released', () => {
    const ttl = read('ontology/agsc.ttl');
    const modified = /dcterms:modified "(\d{4}-\d{2}-\d{2})"\^\^xsd:date/u.exec(ttl)[1];
    const candidate = /^## \[1\.0\.0-rc\.7\] - (\d{4}-\d{2}-\d{2})$/mu.exec(read('CHANGELOG.md'))[1];
    assert.ok(modified > candidate, `dcterms:modified ${modified} is after the 1.0.0-rc.7 release of ${candidate}`);
  });

  it('CITATION.cff names the release, its date and the paper it asks to be cited by', () => {
    const YAML = require('yaml');
    const cff = YAML.parse(read('CITATION.cff'));
    assert.equal(String(cff.version), RELEASE);
    const heading = new RegExp(`^## \\[${RELEASE.replace(/\./gu, '\\.')}\\] - (\\d{4}-\\d{2}-\\d{2})$`, 'mu').exec(read('CHANGELOG.md'));
    assert.ok(heading, 'the change log dates the release');
    const released = cff['date-released'] instanceof Date ? cff['date-released'].toISOString().slice(0, 10) : String(cff['date-released']);
    assert.equal(released, heading[1], 'one release day in the change log and the citation file');
    assert.ok((cff.identifiers || []).some((i) => i.type === 'doi' && /^10\.5281\/zenodo\.\d+$/u.test(i.value)), 'the concept DOI is listed');
    assert.equal(cff['preferred-citation'].doi, cff.identifiers.find((i) => i.type === 'doi').value, 'the paper is cited by the same concept DOI');
    assert.equal(cff.doi, undefined, 'no software DOI is claimed');
  });

  it('the change log opens the release section with the upgrade note from the last candidate', () => {
    const log = read('CHANGELOG.md');
    const at = log.search(new RegExp(`^## \\[${RELEASE.replace(/\./gu, '\\.')}\\] - \\d{4}-\\d{2}-\\d{2}$`, 'mu'));
    assert.ok(at > 0, 'the release has its dated heading');
    const section = log.slice(at).split(/^## \[/mu)[1];
    assert.match(section.split('\n').filter(Boolean)[1], /^### Upgrading from 1\.0\.0-rc\.7$/u);
  });
});
