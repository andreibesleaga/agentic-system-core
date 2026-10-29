# Mode 0 — a folder of notes becomes a checked site

**Who it is for:** a person with a folder of Markdown notes, or a team with a handbook,
who wants a website out of it that refuses to publish a broken link.

**What you get:** a static website of your notes, with search and every page also as
Markdown; a graph of the notes; text files an assistant can read (`llms.txt`,
`chunks.jsonl`); a discovery document that lists all of it with SHA-256 digests. No
language model, no server, no account. A change to a note becomes a proposal a person
merges.

**Read after:** [the guides](README.md). **Next:** [Mode 1](mode-1.md).

---

## Before you start

You need Node.js 22.13 or later, `git` with your name and e-mail set, and a POSIX shell
(`bash`; on Windows, Git Bash). Install the package once, in a working folder:

```bash
mkdir agsc-work && cd agsc-work
npm install agentic-system-core
export PATH="$PWD/node_modules/.bin:$PATH"             # puts agsc and agsc-host on the PATH
export ENGINE="$PWD/node_modules/agentic-system-core"  # the package: examples, checkers, licence texts
```

The two `export` lines last for this shell only; run them again in a new terminal.
Every command below was run on the package and printed the lines quoted under it
(other lines it printed are left out). The repository test `tests/docs/guides.test.js`
runs them again on every change.

## 1. Adopt your notes

Use your own folder of `.md` files, or make three notes to follow along:

```bash demo
mkdir my-notes && cd my-notes
printf '# Sourdough starter\n\nFlour and water, fed once a day. How runny it is depends on its [hydration](%s).\n' hydration.md > sourdough.md
cat > hydration.md <<'NOTE'
# Hydration

The weight of the water divided by the weight of the flour.
NOTE
cat > oven-spring.md <<'NOTE'
# Oven spring

The last rise of a loaf, in the first minutes in a hot oven.
NOTE
agsc init
```

```text expect
wrote: content/concepts/hydration.md
wrote: content/concepts/oven-spring.md
wrote: content/concepts/sourdough.md
wrote: agsc.config.json
wrote: content/index.md
before you build: add .well-known/security.txt with a Contact: line (RFC 9116); lint, build and ci report AGSC-E901 until it exists (AGSC-06-36)
before you build: commit once, or set SOURCE_DATE_EPOCH, so the build has an instant (AGSC-04-09); the security contact's expiry is checked against it
init: pass (0 error, 4 warn)
```

What `init` did, so nothing surprises you later:

- it **moved** each note into `content/concepts/` and put a short header at its top
  (a type, a title, `kind: explainer`, and who is accountable for it);
- it wrote `agsc.config.json` (the site's name is the folder's name; the address is the
  placeholder `http://localhost/`), `content/index.md` (the home page), a `.gitignore`
  and a `.env.example`;
- it took the accountable person's id from your git e-mail (the part before `@`). With no
  git e-mail it writes `human:unknown`; change `bundle.operator` in `agsc.config.json`
  and `operator:` in each note to `human:<your-id>` if you want a real name there;
- it **left out** any note that already begins with a header (a first line `---` closed
  by a later `---`), even one with no `type:` line: such a note stays where it is,
  unchanged, and is not published. `init` names each one:

```text
left as is: handoff.md already has a frontmatter block, so init neither changes nor moves it (AGSC-02-91); it is not an item until it has a type and lives under content/<type-plural>/ (AGSC-01-02)
```

To publish such a note, delete its header (keep the text) and run `agsc init` again: it
adopts the note like the others and leaves the rest as they are.

## 2. Add a security contact, commit once, check

A published site must say where to report a security problem (RFC 9116), and a build
needs an instant to stamp on what it writes. The commit gives it one:

```bash demo
mkdir -p .well-known && printf 'Contact: mailto:security@example.org\n' > .well-known/security.txt
git init -q -b main && git add -A && git commit -q -m 'my notes'
agsc ci
```

```text expect
ci: pass (0 error, 7 warn)
warn: AGSC-E506 site.base is the development placeholder http://localhost/; set an https: base before publishing (AGSC-01-19) — agsc.config.json
warn: AGSC-E408 a concept carries no description (AGSC-02-21) — content/concepts/hydration.md
warn: AGSC-E305 "hydration" has no inbound Link and no clusters[] entry (AGSC-03-10) — content/concepts/hydration.md
```

Use your own address in `Contact:` (`mailto:` or `https:`). `agsc ci` checks every
note, builds the site twice and compares the bytes, and verifies the result. A
**warning** does not stop anything: here, notes without a one-line description, and
notes no other note points at with a *typed* link (a link in the text is fine for
readers but does not count; typed links are explained in the
[data model](https://agenticsystemcore.com/docs/data-model/)). An **error** stops the
build and names the file and line.

## 3. Build, and look at it

`ci` checks; `build` writes the site into `www/`:

```bash demo
agsc build
ls www www/.well-known
```

```text expect
wrote: 47 files under www/
build: pass (0 error, 4 warn)
index.html
llms.txt
graph.jsonld
chunks.jsonl
search.json
knowledge-linkset
security.txt
```

To read it in a browser, serve the folder (stop with Ctrl-C):

```bash
agsc-host serve
```

```text
serving …/my-notes/www at http://localhost:8080/ — read-only; stop with Ctrl-C
```

To run the checkers against this address, see the publishing guide §6 — `localhost`, not
`127.0.0.1`, in `site.base` and on the command line.

Each note has a page under `/concepts/<name>/` and a Markdown copy under
`/pages/<name>.md`; `/.well-known/knowledge-linkset` is the discovery document an agent
reads first.

## 4. Change a note — as a proposal

Give `hydration` a description. A note's header is plain YAML between two `---` lines;
this is the whole file after the edit. Before you copy it: the block writes
`operator: human:unknown`, which is what `init` writes when git has no e-mail. In your
own notes, add only the `description:` line and keep the `operator:` line `init` wrote,
so that your real id is not overwritten:

```bash demo
cat > content/concepts/hydration.md <<'NOTE'
---
type: concept
title: Hydration
description: The weight of the water in a dough divided by the weight of the flour, as a percentage.
aliases:
  - hydration.md
prov:
  origin: human
  operator: human:unknown
kind: explainer
---

# Hydration

The weight of the water divided by the weight of the flour. Many starters use equal weights of both.
NOTE
agsc lint --fix
agsc propose hydration
```

```text expect
wrote: dist/proposal/1.patch
wrote: dist/proposal/1.md
run: git checkout -b proposal/1
run: git add content/concepts/hydration.md && git commit
run: open a pull request with the body of dist/proposal/1.md
propose: pass (0 error, 0 warn)
```

`propose` compares your edit with the last commit and writes a patch and a pull-request
text; it runs nothing. You run the lines it printed (with a commit message of your own):

```bash demo
git checkout -q -b proposal/1
git add content/concepts/hydration.md && git commit -q -m 'hydration: a description'
git log -1 --format=%s
```

```text expect
hydration: a description
```

On a forge (GitHub, GitLab, …) you push the branch and open the pull request; a person
merges it.

## 5. Before you publish

Three things a public site needs: its real `https:` address in `site.base`; the licence
text of your notes (by default the Content Use Terms of the package — copy it in, or name
another licence in `bundle.license_prose`); and the history checked:

```bash demo
cp "$ENGINE/LICENSE-CONTENT" .
node -e 'const fs = require("node:fs"), base = "https://notes.example.org/", f = "agsc.config.json", c = JSON.parse(fs.readFileSync(f, "utf8")); c.site.base = base; fs.writeFileSync(f, JSON.stringify(c, null, 2) + "\n"); const i = "content/index.md"; fs.writeFileSync(i, fs.readFileSync(i, "utf8").replace(/^base: .*$/m, "base: " + base));'
git add -A && git commit -q -m 'ready to publish'
agsc ci
agsc build
agsc verify --ledger
```

```text expect
ci: pass (0 error, 6 warn)
wrote: 48 files under www/
verify: pass (0 error, 0 warn)
```

The `node -e` line sets `site.base` and the `base` of the root document `content/index.md`,
which must agree (AGSC-01-04; from 1.1 `lint` warns when they differ); editing the two by
hand does the same. The new
warning asks for a `PRIVACY.md` beside `LICENSE-CONTENT`, which `/legal/` then shows.
Upload `www/` to any host that serves files over HTTPS; `agsc-host list` names the
profiles the engine can write host settings for, and the [publishing guide](publish.md)
takes the node from here to a live address and checks it there.

## When it says no

| What you see | Why | What to do |
|---|---|---|
| `error: AGSC-E901 no .well-known/security.txt in the Bundle root …` | no security contact | step 2 |
| `error: AGSC-E204 the build instant defaulted to 1970-01-01T00:00:00Z …` | no commit and no `SOURCE_DATE_EPOCH` | commit once, or `export SOURCE_DATE_EPOCH=$(date +%s)` |
| `error: AGSC-E004 environment variable AGSC_… is not a configuration name this engine knows; unset it (AGSC-01-37)` | a shell variable whose name starts with `AGSC_` that the engine does not know; nothing is written until it is gone | `unset` it (`env` lists the variables; when the message names the `.env` file instead, remove that line) |
| `error: AGSC-E310 …` and `build` writes nothing | a link to a note that does not exist | fix the link at the file and line named |
| `agsc: command not found` | the `export PATH=…` line was not run in this shell | run the two `export` lines again from the working folder |

Every other code the guides and the demos print is on the [troubleshooting](troubleshooting.md)
page, with its cause and what to do.

## What next

- Put the site online and check it live: [Publish](publish.md).
- Let an assistant read and cite these notes: [Mode 1](mode-1.md).
- Check every push on GitHub: the action in the root [README](../../README.md#connecting-agents-and-repositories).
- The same mode on a ready-made folder, with more cases (stale notes, a broken link):
  [DEMOS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/DEMOS.md#mode-0--the-self-correcting-wiki).
