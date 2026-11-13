# Mode 5 — the live board

**Who it is for:** a team of people and agents working through a project's tasks
together, who want every claim, change and decision to stay reviewable, and someone who
wants to see how an agent lane is declared before connecting a model.

**What you get:** a board per cluster (`/boards/<name>.json` and a page) that says which
tasks are open, who holds which, and whether the board is done; **agent lanes** declared
in the configuration, each with its owner, its budget and its limit of tasks held at once;
claims made as proposals (the tool server returns a patch and writes nothing) that take
effect only when a person commits them; refusals for a task already held and for a lane
over its limit. No model adapter ships with the engine: a live run is made by an agent
outside the engine — Claude Code, a script — as a client of `agsc mcp` or the page tools,
under the lane's declared limits (AGSC-08-28), and the lane's own run is shown here as a
dry run.

**Read after:** [Mode 2](mode-2.md). **Next:** the [guides index](README.md).

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

## 1. A board, its tasks, and one agent lane

The board is a cluster and its tasks, written as in [Mode 2](mode-2.md):

```bash demo
mkdir -p my-board/content/clusters my-board/content/concepts && cd my-board
cat > content/clusters/website.md <<'ITEM'
---
type: cluster
title: Website
description: The work on the project website, as tasks people and agents claim and finish.
prov:
  origin: human
  operator: human:you
---

# Website

The open work on the website.
ITEM
cat > content/concepts/task-write-the-faq.md <<'ITEM'
---
type: concept
title: Write the FAQ
description: Write a page that answers the ten questions people ask most, one task on the website board.
clusters:
  - website
prov:
  origin: human
  operator: human:you
kind: task
task_state: TASK_STATE_SUBMITTED
---

## Task

Collect the ten most asked questions and answer each in three sentences.
ITEM
cat > content/concepts/task-check-the-links.md <<'ITEM'
---
type: concept
title: Check the links
description: Check every link on the website once the FAQ is written, one task on the website board.
clusters:
  - website
prov:
  origin: human
  operator: human:you
kind: task
task_state: TASK_STATE_SUBMITTED
blocked-by:
  - task-write-the-faq
---

## Task

Follow every link and fix the broken ones.
ITEM
```

The agent lane goes into `agsc.config.json`. These are the four blocks to add; the
`node -e` line merges them into the file `init` wrote (by hand is the same):

```bash demo
agsc init > /dev/null 2>&1
mkdir -p .well-known && printf 'Contact: mailto:security@example.org\n' > .well-known/security.txt
cat > lanes.json <<'JSON'
{
  "agents": [{ "name": "worker", "kind": "llm", "model": "your-model-id", "author": "board-bot", "operator": "human:you", "channel": "main", "tasks": ["claim", "work", "plan", "refresh"], "types": ["concept", "episode"], "max_claims": 1, "budget_usd_month": 1, "enabled": true }],
  "channels": [{ "name": "main", "adapter": "github", "author": "board-bot", "owner": "human:you" }],
  "contribute": [{ "mode": "pr", "target": "https://github.com/you/your-site" }],
  "budget": { "usd_month": 5 }
}
JSON
node -e 'const fs = require("node:fs"), c = JSON.parse(fs.readFileSync("agsc.config.json", "utf8")); Object.assign(c, JSON.parse(fs.readFileSync("lanes.json", "utf8"))); fs.writeFileSync("agsc.config.json", JSON.stringify(c, null, 2) + "\n");'
rm lanes.json
```

| Block | What it says |
|---|---|
| `agents[]` | one lane: its `name`; `kind` (`llm` or `process`); the `model` and `budget_usd_month` (both required for `llm`); the forge login it opens pull requests as (`author`); the person who answers for it (`operator`); its `channel`; the `tasks` it may do (`claim`, `work`, `plan`, `refresh`, `create`, `edit`, …); the item `types` it may touch (never a procedure, a gate or a cluster); `max_claims`, the number of tasks it may hold at once; `enabled` |
| `channels[]` | where the lane's proposals arrive: `name`, `adapter`, the same `author`, and the `owner`, the person whose choice `publish` records (`hitl`, the default: a person merges; `auto`: merged under that standing decision, on a forge) |
| `contribute[]` | where outside agents and people may send proposals (`pr`, `form` or `channel`); published in the discovery document |
| `budget` | the node's monthly cap on model spend; the lanes' budgets may not add up to more |

Commit, check and build, and read the board:

```bash demo
git init -q -b main && git add -A && git commit -q -m 'the board'
agsc lint
agsc build > /dev/null 2>&1
node -e 'const b = require("./www/boards/website.json"); console.log("done:", b.done); for (const t of b.tasks) console.log(t.slug, t.state, t.claimed_by || "(unclaimed)");'
```

```text expect
lint: pass (0 error, 1 warn)
done: false
task-check-the-links TASK_STATE_SUBMITTED (unclaimed)
task-write-the-faq TASK_STATE_SUBMITTED (unclaimed)
```

## 2. The lane claims a task

An agent claims a task by proposing its new state through the tool server (or the same
tool on a published page). The answer is a patch; nothing is written:

```bash demo
MC="$ENGINE/examples/demos/agents/mcp-call.js"
node "$MC" propose '{"agent":"worker","at":"2026-09-02","slug":"task-write-the-faq","task_state":"TASK_STATE_WORKING"}' > claim.json
node -e 'const c = require("./claim.json"); console.log(c.type, c.body.path); process.stdout.write(c.body.patch);'
```

```text expect
proposal content/concepts/task-write-the-faq.md
+modified: "2026-09-02"
-task_state: TASK_STATE_SUBMITTED
+task_state: TASK_STATE_WORKING
```

## 3. A person accepts the claim

A person applies the patch and commits it with the trailer `Channel-Auto: <lane>`, which
names the lane; on a forge this is the merge of the lane's pull request. The build reads
the holder from that commit:

```bash demo
node -e 'process.stdout.write(require("./claim.json").body.patch);' > claim.patch
git apply claim.patch && git add content && git commit -q -m 'claim task-write-the-faq' -m 'Channel-Auto: worker'
agsc build > /dev/null 2>&1
node -e 'const b = require("./www/boards/website.json"); for (const t of b.tasks) console.log(t.slug, t.state, t.claimed_by || "(unclaimed)");'
```

```text expect
task-check-the-links TASK_STATE_SUBMITTED (unclaimed)
task-write-the-faq TASK_STATE_WORKING process:worker
```

From now on, any other claim of that task is refused (`AGSC-E511 … the first merged claim
wins`), on the tool server and on the page alike.

## 4. Limits, new tasks and the lane's own run

```bash demo
MC="$ENGINE/examples/demos/agents/mcp-call.js"
node "$MC" propose '{"agent":"worker","at":"2026-09-02","slug":"task-check-the-links","task_state":"TASK_STATE_WORKING"}' | grep '"message"' || true
node "$MC" remember '{"agent":"worker","body":"Add a search box to the FAQ page.","cluster":"website","kind":"task","model":"your-model-id","operator":"human:you","title":"Search the FAQ"}' | grep -E '"(path|task_state|type)"'
agsc refresh --agent worker --dry-run
agsc refresh --agent ghost --dry-run || echo "refresh exit $?"
```

```text expect
    "message": "agent lane \"worker\" already holds 1 task(s) in TASK_STATE_WORKING; max_claims is 1 (AGSC-10-17)"
    "path": "content/concepts/search-the-faq.md",
  "type": "proposal"
wrote: dist/proposal/1.patch
refresh: pass (0 error, 0 warn)
error: AGSC-E509 agent ghost is undeclared or disabled (AGSC-08-28)
refresh exit 1
```

In order: the lane's second claim is refused by its limit of one; a new task filed
through `remember` comes back as a proposal on the board it names; the lane's run, dry,
writes the proposal it would open (with the Episode of the run) and prints the commands a
person may run; a lane that is not declared is refused.

The lane's run stops before it writes anything when the month's spend has reached the
lane's `budget_usd_month` or the node's `budget.usd_month` (the warning `AGSC-E510`,
which the NOW page and the output of `agsc build` repeat), when no board it may touch
holds a task it can claim (it says "nothing can be claimed"), and when it has no date
for its Episode, with no commit and no `SOURCE_DATE_EPOCH` (`AGSC-E204`, as `build`).

## What needs something you may not have

- **A model.** The engine ships no model adapter, so `refresh --agent <lane>` without
  `--dry-run` refuses; the budget and the stop it causes, the lane's limits and the
  Episode are real, the model call is not made. A live run is made by an agent outside
  the engine, with its own model, as a client of `agsc mcp` or the page tools, as the
  claims in this guide are made (AGSC-08-28).
- **A forge.** Pull requests, required checks and `publish: auto` merges happen on
  GitHub, GitLab or similar; `agsc ci` writes the files the forge needs ([Mode 2](mode-2.md)).

## What next

- The same mode on a ready-made folder, with the page tools refusing the same claim:
  [DEMOS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/DEMOS.md#mode-5--the-live-board).
- Import a board from GitHub, Jira, Trello and other tools:
  [USE-CASES.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/USE-CASES.md#m7--a-teams-board-becomes-a-live-board).
- The rules: AGSC-08-28 (agent lanes), AGSC-10-17 (claims) in [spec/](../../spec/).
