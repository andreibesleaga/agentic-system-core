# Mode 3 — procedures as installable skills

**Who it is for:** a team whose procedures (how to cut a release, how to review a change)
should be followed the same way by people and by coding agents, and someone who wants to
bring skills written elsewhere into one checked place.

**What you get:** one skill pack per cluster, in the Agent Skills layout (`SKILL.md`),
holding the cluster's procedures and the notes beside them; a lockfile with the SHA-256
of every pack; one command that installs the packs into an agent's skill folder and
refuses a pack that no longer matches its lock; the same packs published on the site;
foreign skills brought in as procedures.

**Read after:** [Mode 0](mode-0.md). **Next:** [Mode 4](mode-4.md).

---

## Before you start

Node.js 22.13 or later, `git` with your name and e-mail set, a POSIX shell. Install once,
in a working folder:

```bash
mkdir agsc-work && cd agsc-work
npm install agentic-system-core
export PATH="$PWD/node_modules/.bin:$PATH"
export ENGINE="$PWD/node_modules/agentic-system-core"
```

Every command below was run on the package and printed the lines quoted under it
(other lines are left out); `tests/docs/guides.test.js` runs them again on every change.
Write `human:<your-id>` wherever the files say `human:you`.

## 1. A procedure and its cluster

A **procedure** is a file under `content/procedures/` with three sections: `## When`
(the situation), `## Steps` (numbered) and `## Checks` (how to know it worked), plus a
one-line `when:` in its header. Its `clusters:` line names the pack it goes into. Here,
one procedure and one note in the cluster `releasing`:

```bash demo
mkdir -p my-skills/content/clusters my-skills/content/procedures my-skills/content/concepts && cd my-skills
cat > content/clusters/releasing.md <<'ITEM'
---
type: cluster
title: Releasing
description: How this team cuts and checks a release, as steps an agent can follow.
prov:
  origin: human
  operator: human:you
---

# Releasing

The procedures and notes for a release.
ITEM
cat > content/procedures/cut-a-release.md <<'ITEM'
---
type: procedure
title: Cut a release
description: The steps that turn a green main branch into a tagged, published release.
clusters:
  - releasing
prov:
  origin: human
  operator: human:you
when: The main branch is green and the change log is written
---

## When

The main branch is green and the change log names every change.

## Steps

1. Run the whole test suite once more.
2. Set the version in the package file and the change log.
3. Tag the release commit and push the tag.

## Checks

The tag points at a commit whose test run is green.
ITEM
cat > content/concepts/semantic-versioning.md <<'ITEM'
---
type: concept
title: Semantic versioning
description: A version number in three parts, where each part says what kind of change a release holds.
clusters:
  - releasing
prov:
  origin: human
  operator: human:you
kind: explainer
---

# Semantic versioning

Major for a breaking change, minor for a new feature, patch for a fix.
ITEM
agsc init > /dev/null
mkdir -p .well-known && printf 'Contact: mailto:security@example.org\n' > .well-known/security.txt
git init -q -b main && git add -A && git commit -q -m 'release skills'
agsc lint
```

```text expect
lint: pass (0 error, 1 warn)
```

## 2. Emit the packs

```bash demo
agsc skills
grep -E '^(name|description):|^- (members|item):' dist/skills/releasing/SKILL.md
```

```text expect
skills: 1 pack under dist/skills/ (one per Cluster, AGSC-07-19; index.json is the lockfile of AGSC-07-20)
name: releasing
description: How this team cuts and checks a release, as steps an agent can follow.
- members: 2
- item: http://localhost/procedures/cut-a-release/
- item: http://localhost/concepts/semantic-versioning/
```

One pack per cluster, named after it, holding **every** published item of the cluster —
the procedure, which is the part an agent follows, and the note beside it. Each item is
quoted as data in a fenced block; a pack holds no scripts and no links to run.
`dist/skills/index.json` is the lockfile: the SHA-256 of each pack file.

## 3. Install them for an agent

```bash demo
agsc skills install .claude/skills
agsc skills install .claude/skills
```

```text expect
skills install: 1 written, 0 unchanged under .claude/skills (AGSC-07-21; the lockfile of index.json was verified first)
skills install: 0 written, 1 unchanged under .claude/skills (AGSC-07-21; the lockfile of index.json was verified first)
```

Use `.claude/skills` for Claude Code, `.agents/skills` (the default) or
`.github/skills`. The second run writes nothing. If a pack was changed after it was
emitted, nothing is installed: `skills install: nothing was installed — a pack does not
match its lockfile (AGSC-07-20)`.

## 4. Publish them

`agsc build` serves the packs at `/skills/<cluster>/SKILL.md` with the lockfile at
`/skills/index.json`, so an agent that downloads a pack can check it:

```bash demo
agsc build
node -e 'const c = require("node:crypto"), f = require("node:fs"); const i = JSON.parse(f.readFileSync("www/skills/index.json", "utf8")); const p = i.packs.find((x) => x.name === "releasing"); console.log("served file equals its lock:", c.createHash("sha256").update(f.readFileSync("www/skills/releasing/SKILL.md")).digest("hex") === p.lock["SKILL.md"]);'
```

```text expect
build: pass (0 error, 1 warn)
served file equals its lock: true
```

## 5. Bring skills in

A folder of skills in the Agent Skills layout (one `SKILL.md` per skill, as many public
collections are) comes in as procedures in a cluster you name. The package carries a
one-skill example; use your own folder the same way:

```bash demo
agsc import --from skills --list "$ENGINE/examples/demos/mode-3-skills/foreign"
agsc import "$ENGINE/examples/demos/mode-3-skills/foreign" --from skills --cluster releasing
agsc skills > /dev/null
grep '^- item:' dist/skills/releasing/SKILL.md
```

```text expect
skills: [agentskills] skill plain-notes plain-notes/SKILL.md licence Apache-2.0 (license key) -> importable
import: 1 written, 0 replaced, 0 unchanged
- item: http://localhost/procedures/plain-notes/
```

`--list` shows what would come in and under which licence, and writes nothing. The
imported file keeps its own licence (`x-skills-license`) and is marked
`origin: imported`; read it before you commit it. Its title is the skill's name
(`plain-notes`), and until you give it `## When`, `## Steps` and `## Checks` sections,
`agsc lint` warns three times with `AGSC-E406`. A pack this format emitted goes back
into its items with `agsc skills import <file>`
([DEMOS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/DEMOS.md#mode-3--the-evolving-skills-library) shows it).

At 1.0.0 that works into another Bundle, or for a procedure the Bundle does not hold yet.
Into the pack's own Bundle the import is refused with `AGSC-E206` (`… already exists with
other bytes`) for every procedure the Bundle already holds, even when the pack has not
changed, and there is no option to replace them. To bring an improved pack home:

1. copy the pack's `SKILL.md` into the Bundle, for example as `incoming/SKILL.md`;
2. move each procedure the pack holds out of `content/procedures/`, keeping the old files;
3. run `agsc skills import incoming/SKILL.md`;
4. compare each new file with the one you moved aside, and restore by hand what the
   import does not carry: the `description`, the `when` line, the `date` and the `prov`
   block (the import writes `origin: imported` and the operator of the run, and adds an
   `x-skill-license` key you may remove).

Concepts in the pack are reported and not imported. A lossless round trip is planned for
a later version.

## What next

- Put procedures and concepts together into a starting harness: [Mode 4](mode-4.md).
- Every route a skill pack takes into an agent: [CONNECTORS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/CONNECTORS.md#route-2--skill-packs).
