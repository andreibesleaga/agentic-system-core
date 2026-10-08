# Mode 2 — a project's decisions, specifications, tasks and gates

**Who it is for:** a team that runs a software project with people and coding
assistants, and wants its decisions, specifications and tasks written down once, checked
on every change, and read by every assistant the same way.

**What you get:** each decision, specification and task as one small file with typed
links between them; a board (`/boards/<name>.json` and a page) that says which tasks are
open and what blocks what; a gate that becomes the files a forge needs to require one
check on every pull request; one steering file with the same bytes for every coding
assistant (`AGENTS.md`, `CLAUDE.md`, a Cursor rule).

**Read after:** [Mode 0](mode-0.md). **Next:** [Mode 3](mode-3.md).

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

## 1. The files to write

Six files, one per thing. Each is a header between `---` lines and a short Markdown body.

| File | `type` / `kind` | What makes it that thing |
|---|---|---|
| `content/clusters/<board>.md` | `type: cluster` | a group of items; the tasks in it form a board |
| `content/concepts/<name>.md` | `kind: decision` | a `## Decision` section |
| `content/concepts/<name>.md` | `kind: spec` | a `## Specification` section; `implements:` the decision |
| `content/concepts/<name>.md` | `kind: task` | `task_state:` — `TASK_STATE_` followed by `SUBMITTED` (new), `WORKING`, `INPUT_REQUIRED`, `AUTH_REQUIRED`, `COMPLETED`, `FAILED`, `CANCELED` or `REJECTED`; `clusters:` names its board; `blocked-by:` other tasks |
| `content/gates/<name>.md` | `type: gate` | `level:` `L1` (schema and links) or `L2` (adds provenance, determinism, review); `checks:`; `enforce:` (`status-check`, `ruleset`, `hook`, `codeowner`) |

The board and the decision:

```bash demo
mkdir -p my-project/content/clusters my-project/content/concepts my-project/content/gates && cd my-project
cat > content/clusters/login.md <<'ITEM'
---
type: cluster
title: Login work
description: Everything about the login form, gathered on one board for people and agents.
prov:
  origin: human
  operator: human:you
---

# Login work

The decision, the specification and the tasks of the login form.
ITEM
cat > content/concepts/decide-the-login.md <<'ITEM'
---
type: concept
title: Decide the login
description: The decision to build a plain password form first and add single sign-on later.
clusters:
  - login
prov:
  origin: human
  operator: human:you
kind: decision
---

## Decision

Build a plain password form first; single sign-on comes later.
ITEM
```

The specification and the two tasks; the second task waits for the first:

```bash demo
cat > content/concepts/login-spec.md <<'ITEM'
---
type: concept
title: Login specification
description: What the login form must do, stated so that tasks can implement it and tests can verify it.
clusters:
  - login
prov:
  origin: human
  operator: human:you
kind: spec
implements:
  - decide-the-login
---

## Specification

The form takes a name and a password and refuses more than five attempts per address.
ITEM
cat > content/concepts/task-login-form.md <<'ITEM'
---
type: concept
title: Build the login form
description: Build the login form as the specification says, one task on the login board.
clusters:
  - login
prov:
  origin: human
  operator: human:you
kind: task
task_state: TASK_STATE_SUBMITTED
implements:
  - login-spec
---

## Task

Build the form.
ITEM
cat > content/concepts/task-login-tests.md <<'ITEM'
---
type: concept
title: Test the login form
description: Test the login form against the specification, once the form exists.
clusters:
  - login
prov:
  origin: human
  operator: human:you
kind: task
task_state: TASK_STATE_SUBMITTED
verifies:
  - login-spec
blocked-by:
  - task-login-form
---

## Task

Test the form.
ITEM
```

The gate:

```bash demo
cat > content/gates/merge-gate.md <<'ITEM'
---
type: gate
title: Merge gate
prov:
  origin: human
  operator: human:you
clusters:
  - login
level: L2
checks:
  - schema
  - links
  - review
enforce:
  - status-check
  - ruleset
---

# Merge gate

Every change passes these checks before it merges.
ITEM
```

Then the configuration, the security contact and a first commit, as in [Mode 0](mode-0.md):

```bash demo
agsc init > /dev/null
find content -name '*.md' | sort
mkdir -p .well-known && printf 'Contact: mailto:security@example.org\n' > .well-known/security.txt
git init -q -b main && git add -A && git commit -q -m 'the login project'
agsc lint
```

```text expect
content/clusters/login.md
content/concepts/decide-the-login.md
content/concepts/login-spec.md
content/concepts/task-login-form.md
content/concepts/task-login-tests.md
content/gates/merge-gate.md
content/index.md
lint: pass (0 error, 1 warn)
```

`init` found the items in place and wrote the configuration and `content/index.md`. The one warning is the placeholder address; [Mode 0](mode-0.md#5-before-you-publish) says
how to set the real one. A wrong value is an error with its file and line, for example
`error: AGSC-E203 /task_state: must be equal to one of the allowed values — content/concepts/task-login-form.md:11`.

## 2. The gate, compiled for a forge

```bash demo
agsc ci
cat dist/forge/status-checks.json
node -e 'console.log(JSON.stringify(require("./dist/forge/ruleset.json").rules.required_status_checks))'
```

```text expect
ci: pass (0 error, 1 warn)
["links","review","schema"]
["agsc ci"]
```

`dist/forge/status-checks.json` lists the gate's checks; `dist/forge/ruleset.json`
requires one status, `agsc ci`, because that is the one job a forge runs and its verdict
(`dist/gate.json`) covers every check. On GitHub, the action in the root
[README](../../README.md#connecting-agents-and-repositories) runs that job; you apply the
ruleset in the repository's settings.

## 3. One steering file for every assistant

```bash demo
agsc export --steer --target agents,claude,cursor
head -1 dist/export/steer/AGENTS.md
```

```text expect
export --steer: 3 targets (agents, claude, cursor), identical bytes at each path (AGSC-01-28)
# my-project — steering for coding agents
```

Copy `dist/export/steer/AGENTS.md`, `CLAUDE.md` and `.cursor/rules/agsc.mdc` into the
repository the assistants work in. The file states the current state of the project and
quotes the items as data, not as instructions; run the command again after a change.

## 4. The board

```bash demo
agsc build
node -e 'const b = require("./www/boards/login.json"); console.log("done:", b.done); for (const t of b.tasks) console.log(t.slug, t.state, "blocked by:", t.blocked_by.join(", ") || "-");'
```

```text expect
build: pass (0 error, 1 warn)
done: false
task-login-form TASK_STATE_SUBMITTED blocked by: -
task-login-tests TASK_STATE_SUBMITTED blocked by: task-login-form
```

The same board is a page at `/boards/login/`; each task, the decision and the gate have
their own pages with their state, level, checks and links. To move a task, change its
`task_state:` and commit; with agents claiming tasks, the board becomes a live board:
[Mode 5](mode-5.md). A board from GitHub, GitLab, Jira, Trello, Linear and other tools
comes in with `agsc import --from board --format <name> <folder>`
([USE-CASES.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/USE-CASES.md#m7--a-teams-board-becomes-a-live-board)).

## What next

- Procedures the team repeats, as installable skills: [Mode 3](mode-3.md).
- The same mode on a ready-made folder, with the pages checked: [DEMOS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/DEMOS.md#mode-2--live-specifications-and-the-memory-of-a-project).
