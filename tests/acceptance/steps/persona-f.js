'use strict';
// verifies AGSC-01-23, AGSC-01-26a, AGSC-07-15, AGSC-07-16, AGSC-07-19, AGSC-07-20, AGSC-07-21, AGSC-07-22
// Steps of features/persona-f-integrator.feature that run offline: `skills`,
// `skills install <target>` and `skills import <file>` on a scratch copy of the
// acceptance Bundle. `install` installs from the local build, never from a URL.
// A skills collection is imported from a local clone in each of the five layouts
// (`import --from skills`, with `--list` and `--cluster`), over the fixtures of
// `tests/fixtures/skills-<layout>/` that the adapter's own tests read; the
// engine never downloads anything. The phrases "the import plan wrote nothing into
// the Bundle" and "the same import run again …" are persona-g's.

const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT, splitItem } = require('./_world.js');

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
  // ------------------------------------------------- skills collections, cloned
  {
    pattern: /^a local clone of a "(agentskills|claude-plugin|marketplace|cursor|windsurf|awesome-list)" skills collection in the folder "([a-z-]+)"$/u,
    run(world, layout, folder) {
      fs.cpSync(path.join(ROOT, 'tests', 'fixtures', `skills-${layout}`), path.join(world.dir, folder), { recursive: true });
      world.state.clone = folder;
      world.state.contentBefore = world.snapshot('content');
    },
  },
  {
    pattern: /^(\d+) skills arrive as "(procedure|concept)" items, each naming its source file, the layout and its licence, or as a draft when no open licence is found$/u,
    run(world, count, type) {
      const layout = world.last.argv[world.last.argv.indexOf('--layout') + 1];
      const added = [...world.snapshot('content').keys()].filter((rel) => !world.state.contentBefore.has(rel));
      assert.strictEqual(added.length, Number(count), added.join(', '));
      for (const rel of added) {
        const { frontmatter } = splitItem(world.read(`content/${rel}`));
        assert.strictEqual(frontmatter.type, type, rel);
        // A rule explains how to work and has no steps, so it is an explainer (Route 6).
        if (type === 'concept') assert.strictEqual(frontmatter.kind, 'explainer', rel);
        assert.strictEqual(frontmatter.prov.origin, 'imported', rel);
        assert.strictEqual(frontmatter['x-skills-layout'], layout, rel);
        assert.ok(world.exists(`${world.state.clone}/${frontmatter['x-skills-source']}`), `${rel} names no file of the clone`);
        assert.ok(typeof frontmatter['x-skills-license'] === 'string' || frontmatter.status === 'draft',
          `${rel} carries no licence and is not a draft`);
      }
    },
  },
  {
    pattern: /^(\d+) parts that would execute are dropped and reported as "AGSC-E407", and none of them reaches the Bundle$/u,
    run(world, count) {
      const dropped = world.json().findings.filter((f) => f.code === 'AGSC-E407');
      assert.strictEqual(dropped.length, Number(count), JSON.stringify(dropped));
      for (const f of dropped) assert.strictEqual(f.severity, 'warn', JSON.stringify(f));
      // Content only (AGSC-07-15): Markdown items, no executable bit, no pre-approved tools.
      for (const rel of world.snapshot('content').keys()) {
        assert.ok(rel.endsWith('.md'), `content/${rel} is not an item`);
        const stat = fs.statSync(path.join(world.dir, 'content', rel));
        if (process.platform !== 'win32') assert.strictEqual(stat.mode & 0o111, 0, `content/${rel} is executable`);
        assert.doesNotMatch(world.read(`content/${rel}`), /^allowed-tools:/mu, `content/${rel} pre-approves tools`);
      }
    },
  },
  {
    pattern: 'the list names each skill with its file and licence, and says which would arrive as a draft',
    run(world) {
      const said = `${world.last.stdout}${world.last.stderr}`;
      const clone = world.last.argv[1];
      const skills = fs.readdirSync(path.join(world.dir, clone, 'skills')).sort();
      assert.ok(skills.length > 0);
      for (const name of skills) {
        const line = new RegExp(`^skills: \\[agentskills\\] skill ${name} skills/${name}/SKILL\\.md licence [^\\n]* -> (importable|draft)`, 'mu').exec(said);
        assert.ok(line, `${name} is not listed: ${said}`);
        const { frontmatter } = splitItem(world.read(`${clone}/skills/${name}/SKILL.md`));
        // A licence that is not a recognised open one keeps the skill a draft.
        if (/^Proprietary/u.test(String(frontmatter.license))) assert.strictEqual(line[1], 'draft', name);
      }
    },
  },
  {
    pattern: /^the imported skill "([a-z0-9-]+)" joins the cluster "([a-z0-9-]+)"$/u,
    run(world, slug, cluster) {
      const { frontmatter } = splitItem(world.read(`content/procedures/${slug}.md`));
      assert.deepStrictEqual(frontmatter.clusters, [cluster]);
      assert.ok(world.exists(`content/clusters/${cluster}.md`), `${cluster} is not a cluster of this Bundle`);
    },
  },
  {
    pattern: /^the "([a-z0-9-]+)" pack lists the imported skill "([a-z0-9-]+)"$/u,
    run(world, pack, slug) {
      const { body } = splitItem(world.read(`dist/skills/${pack}/SKILL.md`));
      assert.ok(body.includes(`- item: ${BASE}procedures/${slug}/\n- type: procedure\n`), `${slug} is not in the ${pack} pack`);
      const index = JSON.parse(world.read('dist/skills/index.json'));
      assert.ok(index.packs.some((p) => p.name === pack), `${pack} is not in the lockfile`);
    },
  },
];
