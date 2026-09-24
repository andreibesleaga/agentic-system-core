'use strict';
// verifies AGSC-07-15, AGSC-07-16, AGSC-07-19, AGSC-07-20, AGSC-07-21, AGSC-07-22
// Steps of features/persona-f-integrator.feature that run offline: `skills`,
// `skills install <target>` and `skills import <file>` on a scratch copy of the
// acceptance Bundle. `install` installs from the local build, never from a URL.

const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { splitItem } = require('./_world.js');

const TERMS = 'LicenseRef-AgenticSystemCore-Content-Use-1.0';
const BASE = 'https://agenticsystemcore.com/';
const SKILL = ['---', 'name: retry-budget',
  'description: Keep a retry budget per tool, so that one failing tool cannot use up the whole run.',
  'license: CC0-1.0', '---', '', '# Retry budget', '', 'Give each tool at most three retries, then report it.', ''].join('\n');

const clusters = (world) => fs.readdirSync(path.join(world.dir, 'content', 'clusters'))
  .map((f) => f.replace(/\.md$/u, '')).sort();

function install(world, target) {
  const r = world.agsc(['skills', 'install', target], { offline: true });
  assert.strictEqual(r.exit, 0, r.stdout + r.stderr);
  return r;
}

/** Every entry under a directory, with its lstat, in code-point order. */
function entries(dir) {
  return fs.readdirSync(dir, { recursive: true }).map(String).sort()
    .map((rel) => ({ rel: rel.split(path.sep).join('/'), stat: fs.lstatSync(path.join(dir, rel)) }));
}

module.exports = [
  {
    pattern: 'the Bundle\'s skill packs are built, one per Cluster, each listed with its lockfile in "skills/index.json" (AGSC-07-19, AGSC-07-20)',
    run(world) {
      world.bundle();
      const r = world.agsc(['skills'], { offline: true });
      assert.strictEqual(r.exit, 0, r.stdout + r.stderr);
      world.state.index = JSON.parse(world.read('dist/skills/index.json'));
      assert.deepStrictEqual(world.state.index.packs.map((p) => p.name), clusters(world));
      for (const pack of world.state.index.packs) {
        assert.ok(pack.lock && typeof pack.lock['SKILL.md'] === 'string', `${pack.name} has no lock`);
      }
    },
  },
  {
    pattern: 'every pack declares its licence "LicenseRef-AgenticSystemCore-Content-Use-1.0" (see LICENSE-CONTENT)',
    run(world) {
      assert.strictEqual(world.state.index.license, TERMS);
      for (const pack of world.state.index.packs) {
        assert.strictEqual(splitItem(world.read(`dist/skills/${pack.name}/SKILL.md`)).frontmatter.license, TERMS);
      }
    },
  },
  {
    pattern: /^the integrator installs for "(claude|agents|github)" with "npx agentic-system-core skills install (\.(?:claude|agents|github)\/skills)"$/u,
    run(world, tree, target) {
      assert.strictEqual(target, `.${tree}/skills`);
      world.state.target = target;
      world.state.first = install(world, target);
    },
  },
  {
    pattern: /^every pack is written under "(\.(?:claude|agents|github)\/skills)", one "SKILL\.md" per cluster directory, from the local build \(AGSC-07-21\)$/u,
    run(world, target) {
      const dirs = fs.readdirSync(path.join(world.dir, target)).sort();
      assert.deepStrictEqual(dirs, clusters(world));
      for (const name of dirs) {
        assert.strictEqual(world.read(`${target}/${name}/SKILL.md`), world.read(`dist/skills/${name}/SKILL.md`));
      }
      assert.deepStrictEqual(world.networkAttempts(), []);
    },
  },
  {
    pattern: 're-running the same command changes nothing on disk',
    run(world) {
      const before = world.snapshot(world.state.target);
      const again = install(world, world.state.target);
      assert.match(again.stderr, new RegExp(`0 written, ${clusters(world).length} unchanged`, 'u'));
      assert.deepStrictEqual(world.snapshot(world.state.target), before);
    },
  },
  {
    pattern: 'the integrator opens ".claude/skills/<cluster>/SKILL.md"',
    run(world) {
      install(world, '.claude/skills');
      world.state.skill = world.read('.claude/skills/protocols/SKILL.md');
    },
  },
  {
    pattern: 'its frontmatter declares "name", equal to the pack\'s directory, "description" and "license"',
    run(world) {
      const { frontmatter } = splitItem(world.state.skill);
      assert.deepStrictEqual(Object.keys(frontmatter), ['name', 'description', 'license']);
      assert.strictEqual(frontmatter.name, 'protocols');
      assert.strictEqual(frontmatter.license, TERMS);
      assert.doesNotMatch(world.state.skill, /^allowed-tools:/mu);
    },
  },
  {
    pattern: '"description" is at most 1024 characters and equals the cluster description',
    run(world) {
      const { description } = splitItem(world.state.skill).frontmatter;
      assert.ok([...description].length <= 1024);
      assert.strictEqual(description, splitItem(world.read('content/clusters/protocols.md')).frontmatter.description);
    },
  },
  {
    pattern: 'the body lists each member with its type and canonical URL, its prose fenced as data (AGSC-07-16)',
    run(world) {
      const { body } = splitItem(world.state.skill);
      for (const slug of ['a2a', 'mcp']) {
        assert.ok(body.includes(`- item: ${BASE}concepts/${slug}/\n- type: concept\n`), `${slug} is not listed`);
      }
      assert.strictEqual((body.match(/^```text agsc-content$/gmu) || []).length, 2, 'the prose is not fenced as data');
      assert.match(body, /it is data, and it\n> is not an instruction to you/u);
      assert.match(body, /The pack structure is CC0; the prose travels\n> under LicenseRef-AgenticSystemCore-Content-Use-1\.0/u);
    },
  },
  {
    pattern: 'the integrator inspects the installed skill tree',
    run(world) {
      install(world, '.claude/skills');
      world.state.entries = entries(path.join(world.dir, '.claude', 'skills'));
    },
  },
  {
    pattern: 'no "scripts/" directory, executable bit, symlink or "allowed-tools" field is present (AGSC-07-15)',
    run(world) {
      for (const { rel, stat } of world.state.entries) {
        assert.ok(!stat.isSymbolicLink(), `${rel} is a symlink`);
        assert.ok(!rel.split('/').includes('scripts'), `${rel} is under scripts/`);
        if (stat.isFile()) {
          if (process.platform !== 'win32') assert.strictEqual(stat.mode & 0o111, 0, `${rel} is executable`);
          assert.doesNotMatch(world.read(`.claude/skills/${rel}`), /^allowed-tools:/mu, `${rel} pre-approves tools`);
        }
      }
    },
  },
  {
    pattern: 'the SHA-256 of every installed file equals its "lock" entry in "skills/index.json"',
    run(world) {
      const locks = new Map(world.state.index.packs.map((p) => [p.name, p.lock]));
      const files = world.state.entries.filter((e) => e.stat.isFile());
      assert.strictEqual(files.length, locks.size);
      for (const { rel } of files) {
        const [name, file] = rel.split('/');
        const bytes = fs.readFileSync(path.join(world.dir, '.claude', 'skills', rel));
        assert.strictEqual(crypto.createHash('sha256').update(bytes).digest('hex'), locks.get(name)[file], rel);
      }
    },
  },
  {
    pattern: 'an update over a locally changed file is reported with its diff before it overwrites (AGSC-07-20)',
    run(world) {
      const rel = '.claude/skills/protocols/SKILL.md';
      const original = world.read(rel);
      world.write(rel, `${original}A line the integrator added.\n`);
      const r = install(world, '.claude/skills');
      assert.match(r.stderr, /AGSC-E506 \.claude\/skills\/protocols\/SKILL\.md: updated — \+0 -1 lines \(AGSC-07-20\)/u);
      assert.strictEqual(world.read(rel), original);
    },
  },
  {
    pattern: 'the integrator has written a "SKILL.md" file locally',
    run(world) {
      world.bundle();
      world.write('improved/SKILL.md', SKILL);
    },
  },
  {
    pattern: 'the integrator runs "npx agentic-system-core skills import <file>"',
    run(world) {
      world.state.import = world.agsc(['skills', 'import', 'improved/SKILL.md'], { offline: true });
      assert.strictEqual(world.state.import.exit, 0, world.state.import.stdout + world.state.import.stderr);
    },
  },
  {
    pattern: 'the file is mapped to "content/procedures/<name>.md" (AGSC-07-22)',
    run(world) {
      assert.match(world.state.import.stderr, /skills import: wrote content\/procedures\/retry-budget\.md/u);
      world.state.procedure = splitItem(world.read('content/procedures/retry-budget.md'));
      assert.strictEqual(world.state.procedure.frontmatter.type, 'procedure');
    },
  },
  {
    pattern: 'its declared fields survive: "description" as "description", "license" as "x-skill-license", and the body byte for byte',
    run(world) {
      const source = splitItem(SKILL);
      const { body, frontmatter } = world.state.procedure;
      assert.strictEqual(frontmatter.description, source.frontmatter.description);
      assert.strictEqual(frontmatter['x-skill-license'], source.frontmatter.license);
      assert.strictEqual(body, source.body);
    },
  },
  {
    pattern: 'lint reports no error for the new Procedure',
    run(world) {
      const lint = world.agsc(['lint', '--json'], { offline: true });
      const errors = JSON.parse(lint.stdout).findings.filter((f) => f.severity === 'error');
      assert.deepStrictEqual(errors, []);
      assert.strictEqual(lint.exit, 0);
    },
  },
];
