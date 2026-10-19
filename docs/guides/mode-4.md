# Mode 4 — a selection becomes a starting harness

**Who it is for:** an architect or a developer who wants to pick a few patterns,
procedures and decisions and get the files a system — or an agent runtime — starts from;
anyone curious about the opt-in `run` verb.

**What you get:** `agsc compose` checks that a selection fits together (it pulls in what
the selection requires, refuses items that exclude each other, warns about
contradictions) and writes a **Harness**: seven kinds of file — agent instructions
(`AGENTS.md`), a C4 model (`workspace.dsl`), a Mermaid diagram, an arc42 skeleton, one
decision record per selected item, one skill file per selected procedure, and a record
of it all, `harness.jsonld`, in canonical JSON (JCS; despite its name, not an RDF JSON-LD
document) — plus a zip archive. It is a starting point, not a running system: no
rendering for a particular runtime ships, and `agsc run` lists a procedure's steps but
executes nothing without an isolating runner.

**Read after:** [Mode 3](mode-3.md). **Next:** [Mode 5](mode-5.md).

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

## 1. Items with typed links

Composition follows typed links: `requires` pulls the target in; `uses` warns when its
target is not selected; `excludes` refuses the pair; `contradicts` warns when both are
selected. Two concepts and one
procedure whose step is a `run` block:

````bash demo
mkdir -p my-system/content/concepts my-system/content/procedures && cd my-system
cat > content/concepts/retry-with-backoff.md <<'ITEM'
---
type: concept
title: Retry with backoff
description: Call a failing service again after waiting longer each time, up to a fixed number of tries.
prov:
  origin: human
  operator: human:you
kind: explainer
requires:
  - idempotency-key
---

# Retry with backoff

Wait one second, then two, then four; give up after five tries.
ITEM
cat > content/concepts/idempotency-key.md <<'ITEM'
---
type: concept
title: Idempotency key
description: A key sent with a request so that the same request sent twice has the effect of one.
prov:
  origin: human
  operator: human:you
kind: explainer
---

# Idempotency key

The service remembers each key it has seen and answers a repeat with the first result.
ITEM
cat > content/procedures/smoke-test.md <<'ITEM'
---
type: procedure
title: Smoke test
description: The one command that shows the checkout service answers at all.
prov:
  origin: human
  operator: human:you
when: After every deploy of the checkout service
uses:
  - retry-with-backoff
---

## When

After every deploy of the checkout service.

## Steps

```run
echo checkout answers
```

## Checks

```expect
checkout answers
```
ITEM
agsc init > /dev/null
mkdir -p .well-known && printf 'Contact: mailto:security@example.org\n' > .well-known/security.txt
git init -q -b main && git add -A && git commit -q -m 'checkout'
agsc lint
````

```text expect
lint: pass (0 error, 1 warn)
```

## 2. Compose

```bash demo
agsc compose retry-with-backoff smoke-test --zip
find dist/harness -mindepth 2 -type f | sed 's|^dist/harness/[^/]*/||' | sort
```

```text expect
verdict: {"added":[{"path":[["retry-with-backoff","requires","idempotency-key"]],"slug":"idempotency-key"}],"conflicts":[],"hidden":[],"selection":["idempotency-key","retry-with-backoff","smoke-test"],"valid":true,"warnings":[]}
compose: pass (0 error, 0 warn)
AGENTS.md
arc42.md
decisions/0001-retry-with-backoff.md
decisions/0002-idempotency-key.md
diagram.mmd
harness.jsonld
skills/smoke-test/SKILL.md
workspace.dsl
```

`idempotency-key` was **added** because `retry-with-backoff` requires it. The Harness is
in `dist/harness/<name>/` and the archive beside it. On a built site, the page
`/compose/` does the same in the browser, with the same bytes. A rendering for a named
runtime (`--emit crewai` and the others the specification lists) is refused with
`AGSC-E203`; `--emit ./my-emitter.js` runs a rendering you write as a plugin
([PLUGINS.md](../PLUGINS.md)).

## 3. The `run` verb (off by default)

`run` reads a procedure's `run` blocks. It is off until the configuration turns it on
and names the programs a step may start:

```bash demo
agsc run smoke-test --dry-run || echo "run exit $?"
node -e 'const f = "agsc.config.json", fs = require("node:fs"), c = JSON.parse(fs.readFileSync(f, "utf8")); c.run = { enabled: true, allow: ["echo"] }; c.budget = { usd_month: 5 }; fs.writeFileSync(f, JSON.stringify(c, null, 2) + "\n");'
git commit -qam 'run on'
agsc run smoke-test --dry-run
agsc run smoke-test || echo "run exit $?"
```

```text expect
error: AGSC-E004 run is disabled (run.enabled is false; AGSC-09-94)
run exit 2
run: step 1: echo checkout answers
run: --dry-run: 1 step(s) resolved, nothing executed
run exit 1
```

The `node -e` line adds two blocks to `agsc.config.json` (by hand is the same):
`"run": { "enabled": true, "allow": ["echo"] }` and `"budget": { "usd_month": 5 }`, the
node's monthly cap on model spend. With `run` on, `--dry-run` lists the steps; `run`
itself still refuses (`AGSC-E001 run executed nothing: …`), because the engine cannot
promise a step "no network" without an operating-system sandbox, and none ships.

## 4. Record a run that happened elsewhere

A run done by a CI job or an agent becomes an **Episode** with `trace`, and the NOW page
counts its spend against the cap:

```bash demo
STARTED=$(TZ=UTC git log -1 --format=%cd --date=format-local:%Y-%m-%dT%H:%M:%SZ)
cat > run1.json <<JSON
{"actor":"process:deploy-bot","outcome":"success","started":"$STARTED","title":"Smoke test after deploy","usage":{"cost_usd":0.25,"estimate":false,"model":"m","tokens_in":100,"tokens_out":50}}
JSON
agsc trace run1.json
git add -A && git commit -qm 'a recorded run'
agsc build > /dev/null
sed -n '/## Monthly spend/,/^- cap/p' www/now.md
```

```text expect
trace: wrote content/episodes/smoke-test-after-deploy.md (an Episode, through the AGSC-01-22/AGSC-02-14 import path; no process was executed)
- spent: 0.25 USD
- cap: 5 USD
```

The run record is a JSON object: who ran it (`actor`), the `outcome`, when it `started`
(here the time of the last commit stands in for "just now", because the NOW page counts
a run's spend in the month it started), a `title`, and what it used. Unlike the other
verbs, `trace` writes straight into `content/episodes/`; read the file before you commit
it. `trace` works only with `run.enabled` set, as in step 3. The Episode it writes has no
`## What happened`, `## Outcome` and `## Next` sections yet, so `agsc lint` warns three times
with `AGSC-E406`, once for each section, until you add them, and once with `AGSC-E305`
until a cluster or another item links to it.

## What next

- Agents that claim and finish tasks on a shared board: [Mode 5](mode-5.md).
- The same mode on a ready-made folder, with the tool server's verdict and the page's:
  [DEMOS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/DEMOS.md#mode-4--runnable-knowledge).
- What each Harness file holds: [spec/07-composition.md](../../spec/07-composition.md) (AGSC-07-12).
