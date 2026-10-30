# Mode 1 — memory for an assistant, and nodes that check each other

**Who it is for:** a developer who wants an AI assistant to search, read and cite a
folder of notes; two publishers who want their nodes to name and check each other; an
agent, or its operator, reading someone else's node.

**What you get:** a local tool server, `agsc mcp`, with seven tools over your Bundle —
`search`, `read`, `links`, `compose`, `ask`, `propose`, `remember` — that runs on your
computer, needs no key and writes nothing; two nodes that list each other as peers and a
shipped checker that confirms it; the commands to verify any published node by hand.

**Read after:** [Mode 0](mode-0.md). **Next:** [Mode 2](mode-2.md).

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

## 1. A Bundle with two items

The Bundle from [Mode 0](mode-0.md) works. To follow along, write two items by hand —
this is the whole format of an item: a header between `---` lines, then Markdown. The
`related:` line is a **typed link**, which the graph and the tools follow:

```bash demo
mkdir -p node-a/content/concepts && cd node-a
cat > content/concepts/handoff.md <<'ITEM'
---
type: concept
title: Handoff
description: Passing work and its context from one agent to another, with a record of why it moved.
prov:
  origin: human
  operator: human:you
kind: explainer
related:
  - supervisor
---

# Handoff

The sending agent writes what it knows, names the receiver, and stops acting.
ITEM
cat > content/concepts/supervisor.md <<'ITEM'
---
type: concept
title: Supervisor
description: An agent that splits a task into parts and hands each part to another agent.
prov:
  origin: human
  operator: human:you
kind: explainer
---

# Supervisor

It keeps the plan and checks each result before the next handoff.
ITEM
agsc init > /dev/null 2>&1
mkdir -p .well-known && printf 'Contact: mailto:security@example.org\n' > .well-known/security.txt
git init -q -b main && git add -A && git commit -q -m 'start'
agsc lint
```

```text expect
lint: pass (0 error, 1 warn)
```

`init` found the two items already in place and wrote only the configuration and the
home page. Write `human:<your-id>` instead of `human:you`.

## 2. Connect an assistant

Your assistant starts the tool server itself. For Claude Code, from inside the Bundle:

```bash
claude mcp add --transport stdio my-notes -- npx -y agsc-cli mcp
```

For an assistant that has no project folder (Claude Desktop), give the folder as an
argument instead: `"command": "npx", "args": ["-y", "agsc-cli", "mcp", "/path/to/node-a"]`.
The setup for Claude Desktop, Cursor, VS Code and Codex CLI is in
[USING-WITH-ASSISTANTS.md](../USING-WITH-ASSISTANTS.md#5-setting-it-up).

To see what the assistant sees without one, the package has a small script that starts
`agsc mcp`, makes one tool call and prints the answer:

```bash demo
node "$ENGINE/examples/demos/agents/mcp-call.js" ask '{"question":"who splits a task into parts"}'
node "$ENGINE/examples/demos/agents/mcp-call.js" links '{"slug":"handoff"}'
```

```text expect
  "body": "An agent that splits a task into parts and hands each part to another agent. Content Use Terms: LicenseRef-AgenticSystemCore-Content-Use-1.0.",
    "http://localhost/concepts/supervisor/"
  "trust": "untrusted",
  "type": "answer"
        "key": "related",
        "target": "supervisor"
```

What to know about the answers:

- `ask` calls no model. It returns the **descriptions** of the best-matching items with
  their addresses as citations, so good one-line descriptions give good answers.
- Every tool result is marked `"trust": "untrusted"`: the text of a node is data for the
  assistant to read, never an instruction to follow.
- `propose` and `remember` return prepared text; nothing is written. `remember` needs
  the person operating it (`"operator": "human:<id>"`) or a declared agent lane, **and**
  the `agent` and `model` that helped write the item, unless the call says
  `"origin": "human"`; without an operator it refuses with `AGSC-E003`, and without
  `agent` and `model` the saved item fails `agsc lint` with `AGSC-E202` (AGSC-08-01).
  To cite a single chunk by its id, read `/chunks.jsonl` of the built site; the tools
  cite whole items by address.

## 3. Two nodes that check each other

Make a second node, give both a real address, and let each list the other as a peer
(`peers` in `agsc.config.json`, one discovery address per peer). The small script below
makes that edit; editing the two files by hand does the same:

```bash demo
cd ..
cp -r node-a node-b
cat > set-node.js <<'JS'
// usage: node set-node.js <bundle folder> <its https address> <the peer's https address>
const fs = require('node:fs');
const [dir, base, peer] = process.argv.slice(2);
const file = `${dir}/agsc.config.json`;
const config = JSON.parse(fs.readFileSync(file, 'utf8'));
config.bundle.id = dir;
config.site.base = base;
config.peers = [`${peer}.well-known/knowledge-linkset`];
fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
JS
node set-node.js node-a https://a.example/ https://b.example/
node set-node.js node-b https://b.example/ https://a.example/
(cd node-a && git commit -qam 'peer b' && agsc build > /dev/null 2>&1)
(cd node-b && git commit -qam 'peer a' && agsc build > /dev/null 2>&1)
node "$ENGINE/tools/validate-wellknown" node-a/www/.well-known/knowledge-linkset --level 2 --peer node-b/www/.well-known/knowledge-linkset
```

```text expect
validate-wellknown pass (level 2): 22 input file(s) read, 0 error(s), 0 warning(s)
```

The checker reads both discovery documents, recomputes every digest they declare, and
confirms that each names the other. If only one side lists the other, it fails with
`resolved, not mutual`. Nodes never call each other: a client reads both.

## 4. Read a published node by hand

This needs the network. The discovery document of any node is at one address:

```bash
curl -s https://agenticsystemcore.com/.well-known/knowledge-linkset
curl -s https://agenticsystemcore.com/llms.txt | openssl dgst -sha256 -binary | base64
node "$ENGINE/tools/validate-wellknown" https://agenticsystemcore.com/.well-known/knowledge-linkset --level 2 --peer https://patterns.agenticsystemcore.com/.well-known/knowledge-linkset
```

The second line prints the same value the discovery document gives for `llms.txt`
(`sha-256=:<that value>:`). On 6 October 2026 the third printed
`validate-wellknown pass (level 2): 26 input file(s) read, 0 error(s), 0 warning(s)`.

## 5. Take the memory elsewhere

Exports carry the licence of the prose with them, so copy the licence text in first
(or name another licence in `bundle.license_prose`):

```bash demo
cd node-a
cp "$ENGINE/LICENSE-CONTENT" . && git add LICENSE-CONTENT && git commit -qm 'content terms'
agsc export --okf
agsc export --to llm-context
ls dist/export/okf dist/export/llm-context
```

```text expect
export --okf: 5 files under dist/export/okf/ (AGSC-01-26; the export root carries LICENSE-CONTENT)
LICENSE-CONTENT
content
llms-ctx.txt
chunks-index.toon
```

The first is the Bundle itself, ready to be read back with `agsc import --from okf`; the
second is one text file and one compact index for a model's context window.

`agsc export --to cogx` writes the memory archive that Cognee reads; the routes for
other agent frameworks are in [CONNECTORS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/CONNECTORS.md).

## What next

- Turn a project's decisions, specifications and tasks into the same kind of memory:
  [Mode 2](mode-2.md).
- Everything the tool server does and never does: [USING-WITH-ASSISTANTS.md](../USING-WITH-ASSISTANTS.md).
- Walking several nodes and joining their graphs is a library function at 1.0
  (`src/boundary/federation.js`), not a command; [USE-CASES.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/USE-CASES.md#d2--a-client-that-walks-a-neighbourhood) says what it does.
