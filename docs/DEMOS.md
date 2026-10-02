# Demos — every mode and every persona, run from an empty folder

**Summary.** This page is a set of small, complete demonstrations: one for each of
the six modes of using a Bundle, and one for what each of the thirteen personas of
the scenarios does first. Each demo starts from an empty folder with nothing but the
`agentic-system-core` package, takes under five minutes, gives the exact commands,
quotes the lines a real run printed, and names the one thing it proves. The agent
demos make real tool calls — through the local tool server and through the page
tools — and show the JSON that came back. Where a demo needs something a public
reader may not have (a browser with an assistant, a forge, a model key), the page
says so and shows the dry-run form. Every command on this page is run by a test in
this repository, `tests/docs/demos.test.js`, which compares the printed lines with
the lines quoted here; the page cannot drift from the engine without that test
failing.

**Who this is for:** anyone who wants to see the system do something before reading
about it. **Read after:** [START-HERE.md](START-HERE.md); the modes are explained in
[plain/modes.md](plain/modes.md) and the scenarios in [USE-CASES.md](USE-CASES.md).

---

## Before you start

You need Node.js 22.13 or later, `git`, and a POSIX shell (`bash`; on Windows, Git
Bash). Everything runs offline. In an empty folder:

```bash
mkdir agsc-demos && cd agsc-demos
npm install agentic-system-core          # or, from a clone: npm install /path/to/agentic-system-core
export PATH="$PWD/node_modules/.bin:$PATH"                 # puts `agsc` and `agsc-host` on the PATH
export ENGINE="$PWD/node_modules/agentic-system-core"      # where the demo files and the checkers are
export SOURCE_DATE_EPOCH=1789380000                        # 2026-09-14T10:00:00Z, the build instant of every line below
```

`ENGINE` points at the installed package; from a clone of the repository, point it at
the clone instead and put the clone's `bin/` on the PATH. The fixed `SOURCE_DATE_EPOCH`
is what makes the timestamps below reproducible; without it a build states the last
commit's instant, and nothing else changes. The demo files live under
[examples/demos/](../examples/demos/README.md): one folder per mode, each a tiny Bundle
derived from the engine's own minimal fixture, plus the two scripts an agent demo
uses. Nothing in them is private.

Each demo below is a sequence of steps. A step is a fenced block marked `bash demo`,
followed by a `text expect` block that lists lines the step printed in the run this
page was written from — every one of them exactly, among other lines the step also
prints. A block marked plain `bash` is shown, not run by the test.

---

## Mode 0 — the self-correcting wiki

**Personas:** the drop-in user (0), the human reader (A), the human contributor (B),
the maintainer (I). **What it proves:** plain notes become a checked, linked,
agent-readable site with no model; a broken link stops publication; a person's edit
becomes a proposal a person merges; the review lane reaches no model.

The fixture is three Markdown notes: two without any frontmatter, and one with a
`stale_after` instant that has passed.

Adopt the notes. `init` gives each note a type, a title and a provenance block, moves
it to `content/concepts/`, writes the configuration and the root item, and says what
to do before the first build:

```bash demo
cp -r "$ENGINE/examples/demos/mode-0-wiki" . && cd mode-0-wiki/notes
agsc init
```

```text expect
wrote: content/concepts/brewing.md
wrote: content/concepts/grind-size.md
wrote: agsc.config.json
wrote: content/index.md
before you build: add .well-known/security.txt with a Contact: line (RFC 9116); lint, build and ci report AGSC-E901 until it exists (AGSC-06-36)
init: pass (0 error, 3 warn)
```

Add the security contact and the third note, which already carries a frontmatter
block with a `stale_after` instant, then lint. The warnings are the honest state of
three bare notes — no description, no inbound link — and the placeholder address `init` wrote into `site.base`, reported until a real `https:` address replaces it.

```bash demo
mkdir -p .well-known && cp ../security.txt .well-known/security.txt
cp ../boiling-point.md content/concepts/boiling-point.md
agsc lint
```

```text expect
lint: pass (0 error, 6 warn)
warn: AGSC-E408 a concept carries no description (AGSC-02-21) — content/concepts/brewing.md
```

Break a link and watch the wiki refuse to publish it. `lint` names the file and the
line; `build` writes nothing:

```bash demo
printf 'Salt it like [pasta water](%s).\n' salting.md >> content/concepts/brewing.md
agsc lint || echo "lint exit $?"
agsc build || echo "build exit $?"
test ! -e www/index.html && echo "nothing was published"
```

```text expect
error: AGSC-E310 body reference "salting.md" resolves to nothing inside the Bundle (AGSC-03-11) — content/concepts/brewing.md:4
lint exit 1
error: AGSC-E901 /concepts/brewing/index.html links salting.md, and this build emits no route for it (AGSC-06-01)
build exit 1
nothing was published
```

Fix it and build. The site, the graph, the search index, the agent-facing text file
and the discovery document appear under `www/`; the NOW page lists the note whose
`stale_after` has passed:

```bash demo
grep -v salting content/concepts/brewing.md > brewing.tmp && mv brewing.tmp content/concepts/brewing.md
agsc build
ls www/concepts www/graph.jsonld www/llms.txt www/search.json www/.well-known/knowledge-linkset
grep -A2 '## Stale items' www/now.md
```

```text expect
build: pass (0 error, 3 warn)
boiling-point
brewing
grind-size
www/graph.jsonld
## Stale items
- boiling-point
```

To look at it in a browser, `agsc-host serve` serves `www/` read-only on
`http://127.0.0.1:8080/` (the page for a note is `/concepts/brewing/`, its Markdown
view `/pages/brewing.md`); the search box reads `www/search.json` in the browser and
asks no server. That step is shown, not run by the test:

```bash
agsc-host serve            # serving …/www at http://127.0.0.1:8080/ — read-only; stop with Ctrl-C
```

Now the contributor's loop. Commit the wiki, edit a page, normalise it, and ask for a
proposal: the patch carries the edit, and the printed `git` lines are the commands a
person runs — `propose` runs none of them and touches no remote:

```bash demo
git init -q -b main && git add -A && git commit -q -m 'adopted notes'
printf '\nCoarser for a French press.\n' >> content/concepts/grind-size.md
agsc lint --fix
agsc propose grind-size
grep '^+Coarser' dist/proposal/1.patch
```

```text expect
wrote: dist/proposal/1.patch
wrote: dist/proposal/1.md
run: git checkout -b proposal/1
run: git add content/concepts/grind-size.md && git commit
run: open a pull request with the body of dist/proposal/1.md
propose: pass (0 error, 0 warn)
+Coarser for a French press.
```

The review lane is lint only. It says so itself, and no model can be reached from it:

```bash demo
agsc review
```

```text expect
lane: review is lint-only — no model call is reachable from it (AGSC-08-27, NFR-11)
review: pass (0 error, 6 warn)
```

The maintainer's one command, `ci`, runs lint, builds twice and compares the bytes,
verifies the output and writes the gate record; `verify --ledger` re-derives the
ledger from the git history and checks its chain:

```bash demo
agsc ci
node -e 'const g = require("./dist/gate.json"); console.log("gate:", g.status, "keys:", Object.keys(g).sort().join(","))'
agsc build > /dev/null
agsc verify --ledger
```

```text expect
ci: pass (0 error, 6 warn)
gate: pass keys: checks,gate,level,status
verify: pass (0 error, 0 warn)
```

What a reader without JavaScript gets is in `www/`: every page is static HTML, every
item has a Markdown view under `/pages/`, and `llms.txt` opens with the node's own
provenance block.

---

## An agent on the same wiki — the tool server and the page tools

**Personas:** the agent reader (C), the agent proposer (D), the agent using a node as
memory (H). **What it proves:** an assistant gets seven tools over a Bundle, with
nothing leaving the machine; every answer is marked untrusted and carries its
licence; `propose` and `remember` hand back text and write nothing; the same seven
tools on a published page give the same answers.

The demo uses node `a` of the memory fixture. Two small scripts stand in for an
assistant: [mcp-call.js](../examples/demos/agents/mcp-call.js) starts `agsc mcp` and
sends the three JSON-RPC lines every Model Context Protocol client sends first;
[page-tools.js](../examples/demos/agents/page-tools.js) loads the three scripts an
item page loads and calls a tool the way the page does. Neither needs anything
installed beyond Node.

Build the node and list the tools over the wire. The three request lines are the
whole handshake; the server answers with its name, the protocol revision and the
seven tools:

```bash demo
cp -r "$ENGINE/examples/demos/mode-1-memory/a" wiki && cd wiki && agsc build > /dev/null 2>&1
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"demo","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | agsc mcp | node -e 'let s = ""; process.stdin.on("data", (d) => { s += d; }).on("end", () => { for (const line of s.trim().split("\n")) { const m = JSON.parse(line); if (m.id === 1) console.log("server:", m.result.serverInfo.name, "protocol", m.result.protocolVersion); if (m.id === 2) console.log("tools:", m.result.tools.map((t) => t.name).sort().join(" ")); } });'
```

```text expect
server: agentic-system-core protocol 2025-11-25
tools: ask compose links propose read remember search
```

`search`, then `read`, then `links` — the reading path of an agent, each answer an
envelope with `trust: "untrusted"`, the licence and the source tool:

```bash demo
node "$ENGINE/examples/demos/agents/mcp-call.js" search '{"query":"handoff"}'
node "$ENGINE/examples/demos/agents/mcp-call.js" read '{"slug":"handoff"}' | grep -E '"(slug|title|type|trust)"'
node "$ENGINE/examples/demos/agents/mcp-call.js" links '{"slug":"supervisor"}'
```

```text expect
        "iri": "https://a.example/concepts/handoff/",
        "slug": "handoff",
  "license": "LicenseRef-AgenticSystemCore-Content-Use-1.0",
  "source": "search",
  "trust": "untrusted",
  "type": "items"
      "title": "Handoff",
        "computed": false,
        "key": "uses",
        "source": "supervisor",
        "target": "handoff"
  "type": "links"
```

`ask` answers from this memory only and cites items by address; a question the memory
cannot answer gets exactly one sentence:

```bash demo
node "$ENGINE/examples/demos/agents/mcp-call.js" ask '{"question":"how does a handoff work"}' > ask.json
grep -A4 '"citations"' ask.json
node "$ENGINE/examples/demos/agents/mcp-call.js" ask '{"question":"quantum chromodynamics"}' | grep '"body"'
```

```text expect
  "citations": [
    "https://a.example/clusters/agent-patterns/",
    "https://a.example/concepts/supervisor/",
    "https://a.example/concepts/handoff/"
  "body": "no answer in this memory",
```

`propose` returns an item's prepared text; `remember` turns what an agent was told
into a well-formed item — an episode carries the instant it started and the spend
it cost — and an episode with no instant, or an item naming no human operator, is
refused with the reason. Both tools return a proposal; nothing is written to the
Bundle:

```bash demo
node "$ENGINE/examples/demos/agents/mcp-call.js" propose '{"slug":"handoff"}' | grep -E '"(slug|type)"'
node "$ENGINE/examples/demos/agents/mcp-call.js" remember '{"kind":"episode","title":"Run one","body":"## What happened\n\nAnswered from memory.\n\n## Outcome\n\nsuccess\n\n## Next\n\nNothing.","actor":"process:probe","at":"2026-09-02T10:00:00Z","operator":"human:operator","model":"m","usage":{"cost_usd":0.01,"estimate":false,"model":"m","tokens_in":10,"tokens_out":5}}' | grep -E '"(path|type|started|cost_usd)"'
node "$ENGINE/examples/demos/agents/mcp-call.js" remember '{"kind":"episode","title":"Run one","body":"x","actor":"process:probe"}' || echo "mcp-call exit $?"
node "$ENGINE/examples/demos/agents/mcp-call.js" remember '{"kind":"lesson","title":"No operator","body":"## Lesson\n\nx"}' | grep '"message"'
ls content/episodes 2>/dev/null || echo "content unchanged"
```

```text expect
    "slug": "handoff"
  "type": "proposal"
      "type": "episode",
      "started": "2026-09-02T10:00:00Z",
        "cost_usd": 0.01,
    "path": "content/episodes/run-one.md",
    "code": "AGSC-E003",
    "message": "an episode needs the instant it started, `at` (AGSC-09-14b)"
mcp-call exit 1
    "message": "remember needs the declared human operator, `operator`, or the `agent` of a declared lane (AGSC-09-14b)"
content unchanged
```

The published node carries the same seven tools on every item page and on
`/compose/`, for a browser assistant that supports in-page tools. Calling `ask` the
way the page does gives the same bytes the tool server gave:

```bash demo
node "$ENGINE/examples/demos/agents/page-tools.js" www ask '{"question":"how does a handoff work"}' > page-ask.json
cmp ask.json page-ask.json && echo "the page tools and the tool server gave the same answer"
grep -o 'compose/[a-z-]*\.js' www/concepts/handoff/index.html | sort -u
```

```text expect
the page tools and the tool server gave the same answer
compose/agsc-core.js
compose/agsc-page-tools.js
compose/webmcp.js
```

In a real browser the page registers the tools through `document.modelContext`
(the WebMCP proposal), and a page in a browser without it stays silent; from the
page's own console, `await AGSC_TOOLS.call('ask', { question: 'how does a handoff work' })`
returns the envelope above. The repository's browser lane
(`tests/e2e/modes/browser.test.js`, run with `AGSC_BROWSER=1` and a Chromium binary)
does exactly that and compares it with the tool server; it is not part of this
page's test because it needs a browser.

To connect a real assistant, [USING-WITH-ASSISTANTS.md](USING-WITH-ASSISTANTS.md)
gives the four-line configuration for Claude Desktop, Claude Code, Cursor, VS Code
and Codex CLI: the command is `agsc mcp`, the working directory is the Bundle.

---

## Mode 1 — distributed memory

**Personas:** the standards implementer (J), the port implementer (L), the agent
using a node as memory (H). **What it proves:** two nodes that name each other pass
the mutual check with no server between them; a one-sided claim fails; an agent
walks from the discovery document to the peer, and every link it follows carries a
digest; the memory exports and re-imports without loss; a node written without the
engine passes the shipped checker.

The fixture holds three nodes — `a` and `b` name each other as peers, `c` names `a`
but `a` does not name `c` — and `level-0/`, a node made of five hand-written files.

Give each node a git history (the ledger a Level-2 node publishes is derived from it)
and build all three. Node `b` carries the Content Use Terms file, so it also emits a
`/legal/` page:

```bash demo
cp -r "$ENGINE/examples/demos/mode-1-memory" . && cd mode-1-memory && cp "$ENGINE/LICENSE-CONTENT" b/
for n in a b c; do (cd $n && git init -q -b main && git add -A && git commit -q -m "node $n" && agsc build); done
```

```text expect
build: pass (0 error, 0 warn)
build: pass (0 error, 1 warn)
```

The mutual check, on two local files. Then the one-sided one, which fails and says
why:

```bash demo
node "$ENGINE/tools/validate-wellknown" a/www/.well-known/knowledge-linkset --level 2 --peer b/www/.well-known/knowledge-linkset
node "$ENGINE/tools/validate-wellknown" a/www/.well-known/knowledge-linkset --level 2 --peer c/www/.well-known/knowledge-linkset || echo "checker exit $?"
```

```text expect
validate-wellknown pass (level 2): 22 input file(s) read, 0 error(s), 0 warning(s)
a/www/.well-known/knowledge-linkset:1:1 error AGSC-E907 resolved, not mutual: no rel#peer names https://c.example/.well-known/knowledge-linkset (AGSC-10-12)
validate-wellknown fail (level 2): 22 input file(s) read, 1 error(s), 0 warning(s)
checker exit 1
```

What an agent reads first: the discovery document of `a`. Every link to a file of the
node carries a SHA-256 digest; the peer link leads to `b`; the surfaces say what
access each needs. The agent then reads `b`'s `llms.txt` — no node ever fetched on
its behalf:

```bash demo
node -e 'const l = JSON.parse(require("node:fs").readFileSync("a/www/.well-known/knowledge-linkset", "utf8")).linkset[0]; console.log("anchor", l.anchor); for (const [rel, list] of Object.entries(l)) if (Array.isArray(list)) for (const one of list) console.log(rel.replace("https://w3id.org/agentic-system-core/rel#", "rel#"), one.href, one.digest ? "(digest)" : "");'
head -4 b/www/llms.txt
```

```text expect
anchor https://a.example/
alternate https://a.example/llms.txt (digest)
describedby https://a.example/graph.jsonld (digest)
rel#graph https://a.example/graph.nq (digest)
rel#ledger https://a.example/ledger.jsonl (digest)
rel#now https://a.example/now.md (digest)
rel#peer https://b.example/.well-known/knowledge-linkset
rel#skills https://a.example/skills/index.json (digest)
rel#surface https://a.example/chunks.jsonl
# b demo
bundle: https://b.example/
```

An agent on `a` records a lesson that cites `b` — through `sources[]`, never through a
link, so nothing is fetched and the citation keeps its origin:

```bash demo
(cd a && node "$ENGINE/examples/demos/agents/mcp-call.js" remember '{"kind":"lesson","title":"Pair retries with a breaker","body":"## Lesson\n\nPair retries with a breaker.\n\n## Evidence\n\nThe supervisor page of node b.\n\n## Check before\n\nA retry loop exists.","operator":"human:operator","sources":[{"id":"b-supervisor","resource":"https://b.example/concepts/supervisor/"}]}' | grep -E '"(resource|path|type)"')
```

```text expect
          "resource": "https://b.example/concepts/supervisor/"
    "path": "content/lessons/pair-retries-with-a-breaker.md",
  "type": "proposal"
```

The memory leaves and comes back without loss. The compact context file states the
same content version as the published `llms.txt`; the exported graph is the published
graph byte for byte; the Markdown and OKF exports carry the terms beside the prose;
and importing the OKF export into a fresh Bundle twice writes three items once and
then reports them unchanged:

```bash demo
(cd b && agsc export --to llm-context && agsc export --markdown && agsc export --okf && agsc export --jsonld)
grep -m1 '^bundle_version' b/www/llms.txt | sed 's/+.*//'; grep -m1 '^bundle_version' b/dist/export/llm-context/llms-ctx.txt | sed 's/+.*//'
cmp b/dist/export/graph.jsonld b/www/graph.jsonld && echo "the graph export equals the published graph"
mkdir fresh && cd fresh && agsc init > /dev/null 2>&1
agsc import ../b/dist/export/okf --from okf
agsc import ../b/dist/export/okf --from okf
ls content/concepts
cd ..
```

```text expect
adapter: llm-context (2 files, outside build.out — declare them with a related[] link, rel "alternate" (AGSC-06-35))
export --markdown: 5 files under dist/export/markdown/ (AGSC-01-26; the export root carries LICENSE-CONTENT)
export --okf: 6 files under dist/export/okf/ (AGSC-01-26; the export root carries LICENSE-CONTENT)
bundle_version: 0.0.0
bundle_version: 0.0.0
the graph export equals the published graph
import: 3 written, 0 replaced, 0 unchanged
import: 0 written, 0 replaced, 3 unchanged
handoff.md
supervisor.md
```

A node written without the engine. `level-0/` is two Markdown items, a `graph.jsonld`,
an `llms.txt` and a discovery document with no digest and no engine attribute — what
a wiki export could publish — and the shipped checker passes it at Level 0. The same
document with a made-up relation name fails:

```bash demo
node "$ENGINE/tools/validate-wellknown" level-0/.well-known/knowledge-linkset --level 0
sed 's/"anchor"/"made-up":[{"href":"https:\/\/node.example\/llms.txt"}],"anchor"/' level-0/.well-known/knowledge-linkset > made-up.linkset
node "$ENGINE/tools/validate-wellknown" made-up.linkset --level 0 || echo "checker exit $?"
```

```text expect
validate-wellknown pass (level 0): 1 input file(s) read, 0 error(s), 0 warning(s)
checker exit 1
```

Walking a whole neighbourhood over the network — hop limit, fan-out cap, HTTPS only,
private addresses refused — is a library function of the engine
(`src/boundary/federation.js`); it needs live peers, so it is described in
[USE-CASES.md](USE-CASES.md) (D2) and proved by `tests/boundary/federation.test.js`
with an injected fetch, not run here.

---

## Mode 2 — live specifications and the memory of a project

**Persona:** the project team (G). **What it proves:** a project's decisions,
specifications, tasks and gates are ordinary items; a gate compiles into forge files
whose one required check is a check a CI job really reports; the steering files an
assistant reads are the same bytes for every assistant; a person reading the pages
sees a task's state and dependency, a gate's level and checks, and a decision's
typed links without opening the graph.

The fixture is the two-concept Bundle plus a `login` board: a decision, a
specification that implements it, two tasks (one working, blocked by the other), a
procedure, and a gate with three checks.

`ci` writes the gate record and the forge files. `status-checks.json` keeps the gate's
own check names; the ruleset requires only `agsc ci`, the job the shipped action
runs — requiring "schema" or "links" as separate statuses would block every merge,
because no job reports them:

```bash demo
cp -r "$ENGINE/examples/demos/mode-2-project" . && cd mode-2-project
agsc ci
cat dist/forge/status-checks.json
node -e 'console.log("ruleset requires", JSON.stringify(require("./dist/forge/ruleset.json").rules.required_status_checks))'
```

```text expect
ci: pass (0 error, 1 warn)
["links","review","schema"]
ruleset requires ["agsc ci"]
```

The steering files for coding agents come from the current state and the items, and
`AGENTS.md` and `CLAUDE.md` are one set of bytes:

```bash demo
agsc export --steer
cmp dist/export/steer/AGENTS.md dist/export/steer/CLAUDE.md && echo "AGENTS.md and CLAUDE.md are the same bytes"
head -2 dist/export/steer/AGENTS.md
```

```text expect
export --steer: 2 targets (agents, claude), identical bytes at each path (AGSC-01-28)
AGENTS.md and CLAUDE.md are the same bytes
# project demo — steering for coding agents
```

Build, and read the pages as a person would. The task page states its state and its
dependency, the gate page its level and checks, the decision page its typed link; the
board export lists the tasks and whether the board is done:

```bash demo
agsc build > /dev/null 2>&1
grep -o '<dt>Task state</dt><dd><code>[A-Z_]*</code></dd>' www/concepts/task-login-tests/index.html
grep -o '<code>blocked-by</code>: <a href="[^"]*">' www/concepts/task-login-tests/index.html
grep -o '<dt>Level</dt><dd><code>L2</code></dd>' www/gates/merge-gate/index.html
grep -o '<dt>Checks</dt><dd>.*</dd>' www/gates/merge-gate/index.html
grep -o '<code>contradicts</code>: <a href="[^"]*">' www/concepts/decide-the-login/index.html
node -e 'const b = JSON.parse(require("node:fs").readFileSync("www/boards/login.json", "utf8")); console.log("done:", b.done); for (const t of b.tasks) console.log(t.slug, t.state);'
```

```text expect
<dt>Task state</dt><dd><code>TASK_STATE_WORKING</code></dd>
<code>blocked-by</code>: <a href="/concepts/task-login-form/">
<dt>Level</dt><dd><code>L2</code></dd>
<dt>Checks</dt><dd><code>schema</code>, <code>links</code>, <code>review</code></dd>
<code>contradicts</code>: <a href="/concepts/supervisor/">
done: false
task-login-form TASK_STATE_SUBMITTED
task-login-tests TASK_STATE_WORKING
```

Importing a board from a project tool (GitHub, GitLab, Jira, Trello, Linear, Asana,
Notion, Obsidian Kanban, Markdown, Todo.txt) and exporting it back is
`agsc import --from board --format <name> <dir>` and `agsc export --to board --format <name>`;
it needs that tool's export file, so it is described in [USE-CASES.md](USE-CASES.md)
(M7) and proved by `tests/interchange/board.test.js`.

---

## Mode 3 — the evolving skills library

**Persona:** the integrator (F). **What it proves:** procedures become skill packs,
one per cluster, with a lockfile of digests; a pack installs into an agent's skill
tree with one command, a second run changes nothing, an update shows its diff, and a
pack that no longer matches its lockfile installs nothing; a published pack's lock is
the hash of the served bytes; a pack of this format imports back into its procedures,
and a foreign skill comes in as a procedure in the cluster you name.

Emit the packs, install them into a Claude Code skill tree, and run the install again:

```bash demo
cp -r "$ENGINE/examples/demos/mode-3-skills" . && cd mode-3-skills
agsc skills
agsc skills install .claude/skills
agsc skills install .claude/skills
head -4 .claude/skills/login/SKILL.md
```

```text expect
skills: 2 packs under dist/skills/ (one per Cluster, AGSC-07-19; index.json is the lockfile of AGSC-07-20)
skills install: 2 written, 0 unchanged under .claude/skills (AGSC-07-21; the lockfile of index.json was verified first)
skills install: 0 written, 2 unchanged under .claude/skills (AGSC-07-21; the lockfile of index.json was verified first)
name: login
license: LicenseRef-AgenticSystemCore-Content-Use-1.0
```

Change an installed file, and the next install shows the diff before it writes.
Change a pack after it was emitted, and nothing installs:

```bash demo
printf '\nA local note.\n' >> .claude/skills/login/SKILL.md
agsc skills install .claude/skills
printf '\nInjected.\n' >> dist/skills/login/SKILL.md
agsc skills install .agents/skills || echo "install exit $?"
test ! -e .agents/skills/login/SKILL.md && echo "nothing was installed"
```

```text expect
-A local note.
skills install: 1 written, 1 unchanged under .claude/skills (AGSC-07-21; the lockfile of index.json was verified first)
skills install: nothing was installed — a pack does not match its lockfile (AGSC-07-20)
install exit 1
nothing was installed
```

Re-emit, build, and check the served pack the way an agent does: the lock in
`/skills/index.json` is the SHA-256 of the served `SKILL.md`:

```bash demo
agsc skills > /dev/null 2>&1 && agsc build > /dev/null 2>&1
node -e 'const c = require("node:crypto"), f = require("node:fs"); const i = JSON.parse(f.readFileSync("www/skills/index.json", "utf8")); const p = i.packs.find((x) => x.name === "login"); console.log("served hash equals the lock:", c.createHash("sha256").update(f.readFileSync("www/skills/login/SKILL.md")).digest("hex") === p.lock["SKILL.md"]);'
```

```text expect
served hash equals the lock: true
```

Bring skills back as procedures. A pack this format emitted splits into its
procedures, filed in the pack's cluster; a foreign skill in the Agent Skills layout
comes in as a procedure in the cluster you name, and the next `skills` run packs it:

```bash demo
cd .. && cp -r "$ENGINE/examples/demos/mode-1-memory/a" other && cd other
mkdir -p incoming && cp ../mode-3-skills/www/skills/login/SKILL.md incoming/SKILL.md
agsc skills import incoming/SKILL.md
sed -n '1,5p' content/procedures/run-the-tests.md
agsc import "$ENGINE/examples/demos/mode-3-skills/foreign" --from skills --cluster agent-patterns
agsc skills > /dev/null 2>&1 && grep '^- item:' dist/skills/agent-patterns/SKILL.md
```

```text expect
skills import: a pack of this format — 1 procedure(s), 1 written (AGSC-07-19, AGSC-07-22)
type: procedure
title: Run the tests
  - login
import: skills layout agentskills (detected)
import: 1 written, 0 replaced, 0 unchanged
- item: https://a.example/procedures/plain-notes/
```

Outside a Bundle, the verbs that need one refuse rather than do nothing:

```bash demo
mkdir ../nowhere && cd ../nowhere && (agsc skills || echo "skills exit $?")
```

```text expect
error: AGSC-E901 agsc.config.json is missing: `agsc skills` runs inside a Bundle — its root holds agsc.config.json (AGSC-01-01); `agsc init` makes one
skills exit 1
```

---

## Mode 4 — runnable knowledge

**Persona:** the architect (E). **What it proves:** a selection of items becomes a
Harness — the seven file kinds and an archive — from the command line, and the tool
server gives the same verdict for the same selection; the runtime renderings the
specification names are not shipped, and the engine says so; `run --dry-run` lists a
procedure's steps and refuses a program outside the allow list; `run` refuses to
execute without an isolating runner; a traced run becomes an Episode whose spend the
NOW page counts.

The fixture is the login board plus two runnable procedures (`greet`, whose one step
is `echo hello`; `fetch`, whose step is `curl`) and a configuration that enables the
`run` verb for `echo` only.

Compose three items into a Harness with its archive. `AGENTS.md` names the Bundle and
each member with its kind:

```bash demo
cp -r "$ENGINE/examples/demos/mode-4-compose" . && cd mode-4-compose
git init -q -b main && git add -A && git commit -q -m 'runnable knowledge'
agsc compose handoff run-the-tests task-login-form --zip
find dist/harness -type f -name '*.md' -o -type f -name '*.jsonld' -o -type f -name '*.dsl' -o -type f -name '*.mmd' | sed 's|dist/harness/[^/]*/||' | sort
grep -m1 '^bundle:' dist/harness/*/AGENTS.md
grep -m1 'type: concept (task)' dist/harness/*/AGENTS.md
```

```text expect
verdict: {"added":[],"conflicts":[],"hidden":[],"selection":["handoff","run-the-tests","task-login-form"],"valid":true,"warnings":[]}
harness_emitted: true
compose: pass (0 error, 0 warn)
AGENTS.md
arc42.md
decisions/0001-handoff.md
decisions/0002-task-login-form.md
diagram.mmd
harness.jsonld
skills/run-the-tests/SKILL.md
workspace.dsl
bundle: https://compose.example/
- type: concept (task)
```

A rendering for another runtime is named by the specification and not shipped; the
engine refuses honestly instead of writing something else:

```bash demo
agsc compose handoff --emit crewai || echo "compose exit $?"
```

```text expect
error: AGSC-E001 compose --emit crewai is named by AGSC-07-18 but is not implemented at this milestone: a target rendering is a single template plus a registry row, and this distribution ships neither — no conformance Level is claimed before 1.0.0 (AGSC-10-05)
compose exit 1
```

The same selection through the tool server, and through the page tools of the built
node — one verdict, twice:

```bash demo
node "$ENGINE/examples/demos/agents/mcp-call.js" compose '{"selection":["handoff","run-the-tests","task-login-form"]}' > verdict.json
agsc build > /dev/null 2>&1
node "$ENGINE/examples/demos/agents/page-tools.js" www compose '{"selection":["handoff","run-the-tests","task-login-form"]}' > page-verdict.json
grep -E '"(valid|type)"' verdict.json
cmp verdict.json page-verdict.json && echo "the page tools and the tool server gave the same verdict"
```

```text expect
    "valid": true,
  "type": "verdict"
the page tools and the tool server gave the same verdict
```

A person on the built node's `/compose/` page ticks the same three items and
downloads the archive; its bytes equal the archive `compose --zip` wrote. That needs
a browser, so the repository's browser lane proves it (`tests/e2e/modes/browser.test.js`);
here the archive is beside the Harness:

```bash demo
ls dist/harness | grep -c '\.zip$'
```

```text expect
1
```

`run --dry-run` resolves a procedure's steps without executing them and refuses a
program the configuration does not allow; `run` itself refuses to execute, because
the runner this engine ships cannot promise a step "no network", and says what would
change that:

```bash demo
agsc run greet --dry-run
agsc run fetch --dry-run || echo "run exit $?"
agsc run greet || echo "run exit $?"
```

```text expect
run: step 1: echo hello
run: --dry-run: 1 step(s) resolved, nothing executed
run: pass (0 error, 0 warn)
run: step 1: curl https://example.org/   [REFUSED: not in run.allow[]]
error: AGSC-E203 fetch: the program "curl" is not in run.allow[] (echo), so AGSC-09-94 refuses it — content/procedures/fetch.md:8
run exit 1
run: fail (1 error, 0 warn)
```

A run recorded elsewhere becomes an Episode through `trace`, and the NOW page counts
its spend in the month it started, against the node's cap:

```bash demo
agsc trace run1.json
sed -n '1,8p' content/episodes/first-run.md
agsc build > /dev/null 2>&1
sed -n '/## Monthly spend/,/^- cap/p' www/now.md
```

```text expect
trace: wrote content/episodes/first-run.md (an Episode, through the AGSC-01-22/AGSC-02-14 import path; no process was executed)
type: episode
title: First run
started: "2026-09-02T10:00:00Z"
- month: 2026-09
- spent: 0.25 USD
- cap: 1 USD
```

---

## Mode 5 — the live board

**Personas:** the self-driving team (K), the agent proposer (D). **What it proves:**
a cluster of tasks is a board published as JSON; an agent lane claims a task by
proposing its working state through the tool server, which returns a patch and
writes nothing; once a person applies and commits that patch, the build derives who
holds the task from the commit; from then on every other claim of that task is
refused — for a stranger, on the page as on the tool server — and the lane's
work-in-progress limit refuses its second claim; a dry run of the lane proposes the
Episode of the run, which the NOW page then counts.

The fixture is the login board with one agent lane, `worker` (one task at a time, one
dollar a month), its channel and a contribution target.

Build and read the board: two tasks, nobody holding them, not done:

```bash demo
cp -r "$ENGINE/examples/demos/mode-5-board" . && cd mode-5-board
git init -q -b main && git add -A && git commit -q -m 'the board'
agsc build > /dev/null 2>&1
node -e 'const b = JSON.parse(require("node:fs").readFileSync("www/boards/login.json", "utf8")); console.log("done:", b.done); for (const t of b.tasks) console.log(t.slug, t.state, t.claimed_by || "(unclaimed)");'
```

```text expect
done: false
task-login-form TASK_STATE_SUBMITTED (unclaimed)
task-login-tests TASK_STATE_SUBMITTED (unclaimed)
```

The lane claims a task. The tool server answers with a proposal whose patch changes
only the task's state and its `modified` date:

```bash demo
node "$ENGINE/examples/demos/agents/mcp-call.js" propose '{"agent":"worker","at":"2026-09-14","slug":"task-login-form","task_state":"TASK_STATE_WORKING"}' > claim.json
node -e 'const c = require("./claim.json"); console.log(c.type, c.body.path); process.stdout.write(c.body.patch);'
```

```text expect
proposal content/concepts/task-login-form.md
+modified: "2026-09-14"
-task_state: TASK_STATE_SUBMITTED
+task_state: TASK_STATE_WORKING
```

A person applies the patch and commits it with the channel trailer (on a forge this
is the merge of the lane's pull request). The next build derives the holder from that
commit — on the board export and on the board page:

```bash demo
node -e 'process.stdout.write(require("./claim.json").body.patch);' > claim.patch
git apply claim.patch && git add content && git commit -q -m 'claim task-login-form' -m 'Channel-Auto: worker'
agsc lint > /dev/null 2>&1 && agsc build > /dev/null 2>&1
node -e 'const b = JSON.parse(require("node:fs").readFileSync("www/boards/login.json", "utf8")); for (const t of b.tasks) console.log(t.slug, t.state, t.claimed_by || "(unclaimed)");'
grep -o 'claimed by <span>[^<]*</span>' www/boards/login/index.html
```

```text expect
task-login-form TASK_STATE_WORKING process:worker
task-login-tests TASK_STATE_SUBMITTED (unclaimed)
claimed by <span>process:worker</span>
```

Every other claim of the held task is refused, on the tool server and on the page
alike; the lane's second claim is refused by its work-in-progress limit; the holder
may finish its task:

```bash demo
node "$ENGINE/examples/demos/agents/mcp-call.js" propose '{"agent":"someone-else","at":"2026-09-14","slug":"task-login-form","task_state":"TASK_STATE_WORKING"}' > refused.json || echo "mcp-call exit $?"
node "$ENGINE/examples/demos/agents/page-tools.js" www propose '{"agent":"someone-else","at":"2026-09-14","slug":"task-login-form","task_state":"TASK_STATE_WORKING"}' > page-refused.json || echo "page-tools exit $?"
grep -E '"(code|message)"' refused.json
cmp refused.json page-refused.json && echo "the page refuses with the same answer"
node "$ENGINE/examples/demos/agents/mcp-call.js" propose '{"agent":"worker","at":"2026-09-14","slug":"task-login-tests","task_state":"TASK_STATE_WORKING"}' | grep '"message"' || true
node "$ENGINE/examples/demos/agents/mcp-call.js" propose '{"agent":"worker","at":"2026-09-14","slug":"task-login-form","task_state":"TASK_STATE_COMPLETED"}' | grep -E '"(task_state|type)"'
```

```text expect
mcp-call exit 1
page-tools exit 1
    "code": "AGSC-E511",
    "message": "the task \"task-login-form\" is already TASK_STATE_WORKING under process:worker; the first merged claim wins (AGSC-10-17)"
the page refuses with the same answer
    "message": "agent lane \"worker\" already holds 1 task(s) in TASK_STATE_WORKING; max_claims is 1 (AGSC-10-17)"
    "task_state": "TASK_STATE_COMPLETED"
  "type": "proposal"
```

A new task filed through the tools lands on the board it names, as a proposal:

```bash demo
node "$ENGINE/examples/demos/agents/mcp-call.js" remember '{"agent":"worker","body":"Limit attempts per address.","cluster":"login","kind":"task","model":"test-model","operator":"human:operator","title":"Add rate limiting to login"}' | grep -E '"(path|task_state|type)"'
```

```text expect
      "type": "concept",
      "task_state": "TASK_STATE_SUBMITTED",
    "path": "content/concepts/add-rate-limiting-to-login.md",
  "type": "proposal"
```

The lane's own run, dry. No model adapter ships with the engine, so a live run needs
one; the dry run shows the shape of what the lane would open — a proposal carrying
the Episode of the run — and prints the commands a person may run. Applied and
built, the NOW page counts the run in the lane's row (enabled, one run, its spend, its
cap). An undeclared lane is refused:

```bash demo
agsc refresh --agent worker --dry-run
git apply dist/proposal/1.patch && agsc lint > /dev/null 2>&1 && agsc build > /dev/null 2>&1
grep '^| worker ' www/now.md
agsc refresh --agent ghost --dry-run || echo "refresh exit $?"
```

```text expect
wrote: dist/proposal/1.patch
wrote: dist/proposal/1.md
run: git apply dist/proposal/1.patch
refresh: pass (0 error, 0 warn)
| worker | yes | 1 | 0 | 0 | 1 |
error: AGSC-E509 agent ghost is undeclared or disabled (AGSC-08-28)
refresh exit 1
```

Automatic merging under a standing decision (`publish: auto` on the channel) happens
on a forge, so it is not run here; the conditions are in
[plain/modes.md](plain/modes.md) and the enforcement files a forge needs are the ones
Mode 2 wrote.

---

## The thirteen personas, by demo

| Persona | First thing they do | Demo | The one thing it proves |
|---|---|---|---|
| 0 — drop-in user | `agsc init` on a folder of notes | Mode 0 | three commands take bare notes to a full local site |
| A — human reader | opens the built pages, `llms.txt`, the search index | Mode 0 | the site is static, readable without JavaScript, with every item's Markdown view |
| B — human contributor | edits a page, `lint --fix`, `propose` | Mode 0 | the patch carries the edit and a person runs the git commands |
| C — agent reader | `search`, `read`, `links` over `agsc mcp` | An agent on the same wiki | seven tools, every answer untrusted and licensed, nothing leaves the machine |
| D — agent proposer | `propose`, `remember` | An agent on the same wiki; Mode 5 | the tools hand back text and write nothing |
| E — architect | `compose … --zip` | Mode 4 | a selection becomes seven file kinds, the same verdict from the tool server |
| F — integrator | `skills install` | Mode 3 | packs are content only, lock-verified, idempotent, and come back as procedures |
| G — project team | `ci`, `export --steer` | Mode 2 | a gate compiles to a forge ruleset a CI job can satisfy; steer files are one set of bytes |
| H — agent as memory | `export --markdown`, `--okf`, `--jsonld`; `import --from okf` | Mode 1 | the memory leaves and returns without loss, and a second import changes nothing |
| I — maintainer | `ci`, `verify --ledger` | Mode 0 | one pipeline, offline; the ledger re-derives from the history |
| J — standards implementer | `validate-wellknown --level 2 --peer` | Mode 1 | one discovery file, checked with a shipped tool, no server code |
| K — self-driving team | a lane claims a task through the tools | Mode 5 | claims are proposals; the commit decides the holder; refusals are the same everywhere |
| L — port implementer | `validate-wellknown --level 0` on a hand-written node | Mode 1 | the checker judges the files, not the engine that wrote them |

---

## What needs something you may not have

- **A browser with an assistant** (the in-page tools, the `/compose/` download): the
  page-tools demo above runs the page's own scripts without a browser; the real
  browser lane is `AGSC_BROWSER=1 CHROME_EXE=<chromium> node --test tests/e2e/modes/browser.test.js`
  in a clone of the repository, with `playwright-core` installed outside it.
- **A forge** (the pull request, the required check, automatic merging): `propose`
  prints the commands, `ci` writes `dist/forge/ruleset.json` and
  `dist/forge/status-checks.json`, and the shipped `action.yml` runs `agsc ci`; opening
  and merging the pull request is the forge's.
- **A model key** (an agent lane that writes pages): the engine ships no model adapter,
  so `refresh --agent <name> --dry-run` is the whole of what runs; the budget, the
  lane gates and the Episode are real, the model call is not made.
- **An isolating runner** (`agsc run` executing a step): none ships; `run --dry-run`
  resolves the steps and `run` refuses with the reason.

---

## How this page stays true

`tests/docs/demos.test.js` reads this file, takes every `bash demo` block under a
heading as one step of that heading's demo, runs the steps in order in one shell in
a fresh scratch directory — with `SOURCE_DATE_EPOCH=1789380000`, an empty git
identity with fixed author dates, `ENGINE` set to the repository and `agsc` resolved
to its own `bin/agsc.js` — and asserts that every line of the following `text expect`
block was printed by that step, exactly. A step that exits with an error fails the
demo. The lines quoted here are the lines that test saw; when the engine changes what
it prints, the test fails and this page is corrected, never the other way round. The
git identity and dates fix only the content version (`0.0.0+1.g…`), which no expected
line quotes in full.

*Specification rules behind these demos, for looking up: AGSC-02-90…95 (adoption),
AGSC-03-11 (link resolution), AGSC-08-04 and AGSC-08-27 (proposals and the lint-only
review), AGSC-09-13 and AGSC-09-16 (the seven tools, on the tool server and on the
page), AGSC-10-02 and AGSC-10-12 (the checker at Level 0, the mutual peer check),
AGSC-08-09 and AGSC-08-12 (gates into forge files), AGSC-07-19…22 (skill packs),
AGSC-07-12 and AGSC-07-13 (the Harness, byte-identical from page and command line),
AGSC-09-94 (the opt-in run verb), AGSC-08-25 (the monthly spend), AGSC-10-13 and
AGSC-10-17 (boards, claims and holders). Where this page and a rule disagree, the
rule wins.*
