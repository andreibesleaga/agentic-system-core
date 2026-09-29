# Using a knowledge node with an AI assistant

**Who this is for:** someone who wants an AI assistant to use a Bundle. **Read after:** [START-HERE.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/START-HERE.md).

**Summary.** A Bundle is a folder of Markdown files that this engine publishes as a
knowledge node. One command turns that same folder into a **local tool server** your
assistant can use: `agsc mcp`. The assistant can then search the memory, read an item,
follow its links, check a selection of items for conflicts, and ask a question and get an
answer with citations. It can also *prepare* a new page or a change to one — and that is
where it stops. Nothing is ever written to your files or to your repository by the server.
The prepared text comes back to you, you read it, and you open the pull request. This page
explains the whole of that, in order, and ends with the setup for five assistants.

---

## 1. What is running, in plain words

- It runs **on your own computer**, as a child process of your assistant. There is no
  account, no key, no hosted service, and nothing leaves your machine.
- It speaks the **Model Context Protocol** over standard input and output. That is the
  same protocol Claude Desktop, Claude Code, Cursor, VS Code and Codex CLI already speak,
  which is why the setup below is four lines of configuration in each of them.
- It serves **one Bundle**: the folder you start it in. Start it again somewhere else and
  it serves that memory instead.
- It reads the Bundle **once, at start**. If you edit a file, restart the server (in most
  assistants, reconnecting the server is a menu item or a command).

## 2. What the assistant can do

Seven tools, and no more (specification rule AGSC-09-13 — the rule ids are here only so
you can look them up; you never need them to use this):

| Tool | What it does |
|---|---|
| `search` | finds items in this memory that match some words |
| `read` | returns one item: its frontmatter and its text |
| `links` | returns the typed links authored on one item |
| `compose` | takes a selection of items and reports whether they fit together |
| `ask` | answers a question **from this memory only**, citing at least one item |
| `propose` | returns the prepared text of a change to one existing item |
| `remember` | turns something you told it into a new, well-formed item — as text |

Beside the tools it offers:

- **Resources** — every published item as Markdown, plus the node's `graph.jsonld` and
  its `llms.txt`. These are the same bytes the node publishes; the server does not
  re-render them. An assistant that supports resources can attach an item to the
  conversation without calling a tool at all.
- **One prompt**, called *answer from this memory with citations*. Picking it (usually a
  slash command or a menu) sets the assistant up to answer from this memory, cite items,
  and say exactly `no answer in this memory` when the memory does not hold the answer.

Every result carries `trust: "untrusted"` and the content terms. That is deliberate: the
text in a knowledge node is **data the assistant reads**, never instructions it obeys. If
someone writes "ignore your instructions" into a page, it comes back marked as untrusted
prose like any other sentence.

## 3. What it never does

- **It never writes.** Not to your content files, not to your repository, not over the
  network. `propose` and `remember` return text; they do not save it.
- **It never opens a network connection.** Not to fetch a page, not to call a model, not
  to check for updates.
- **No tool takes a path or a shell string.** Every tool argument is a slug or plain
  text, so there is nothing an assistant could point at a file outside the Bundle. (The
  one place a path appears is your own configuration in §5, where you say which folder to
  serve.)
- **It needs no key**, and there is nothing to sign up for.

## 4. How a person creates or edits a page through an assistant

This is the whole loop. The assistant does the preparation; you do the writing.

1. **Ask for it in words.** "Record what we learned about handoffs as a lesson", or
   "propose a tidy-up of the `handoff` page".
2. **The assistant calls `remember` or `propose`.** It gets back prepared text: for
   `remember`, a suggested file path, the frontmatter and the body; for `propose`, the
   item's canonical Markdown. Provenance is filled in for you — who the assistant is,
   which model, and **which person is operating it**.
3. **You read it.** This is the review. Nothing has happened to your files yet.
4. **You save it** into the Bundle at the path the assistant suggested, and fix anything
   you disagree with. The assistant can write the file for you if it has a file tool of
   its own — that is your assistant's file tool doing it, with your approval, not this
   server.
5. **You run two commands**:

   ```bash
   agsc lint --fix       # normalises key order, links and the byte profile
   agsc propose <slug>   # writes dist/proposal/<n>.patch and dist/proposal/<n>.md
   ```

   `agsc propose` prints the git commands to run. It does not run them, and it performs
   no network write.

6. **You open the pull request** with those commands and the body it wrote for you. From
   there it is an ordinary pull request: the same checks, the same review, the same merge
   as a change typed by hand.

An item that names no human operator does not pass `agsc lint`. That is the point of the
loop: every change in the memory can be traced to a person who agreed to it.

## 5. Setting it up

You need **Node.js 22.13 or newer** and a Bundle on disk (clone the repository that holds
the content, or run `agsc init` in an empty folder). Then point your assistant at it.

`npx -y agsc-cli mcp` fetches the command the first time and runs it; if you would rather
install it, `npm i -g agsc-cli` and then use `agsc` as the command with `["mcp"]` as the
arguments.

**One thing decides which memory you get: the working directory.** `agsc mcp` serves the
Bundle it is started in — the folder that holds `agsc.config.json`. In an editor or a
terminal assistant that is the project folder you opened, so **open the Bundle as the
project** and the four configurations below need nothing else. Claude Desktop has no
project folder, so its snippet changes directory first.

### Claude Desktop

Claude menu → **Settings…** → **Developer** → **Edit Config**, then add the server. The
file is `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS and
`%APPDATA%\Claude\claude_desktop_config.json` on Windows. Restart Claude Desktop
afterwards — it reads this file at start. Replace `/path/to/your-bundle` with your folder.

```json
{
  "mcpServers": {
    "my-knowledge": {
      "command": "sh",
      "args": ["-c", "cd /path/to/your-bundle && exec npx -y agsc-cli mcp"]
    }
  }
}
```

On Windows, use the shell that is there:

```json
{
  "mcpServers": {
    "my-knowledge": {
      "command": "cmd",
      "args": ["/c", "cd /d C:\\path\\to\\your-bundle && npx -y agsc-cli mcp"]
    }
  }
}
```

The documented configuration for this file has three members — `command`, `args` and
`env` — and none of them names a working directory, which is why the command changes
directory itself. (The Model Context Protocol SDK's own stdio transport does accept a
`cwd`; if your build of the application passes it through, `"cwd": "/path/to/your-bundle"`
beside `command` and `args` is the tidier form.)

### Claude Code

One command, from inside the Bundle:

```bash
claude mcp add --transport stdio my-knowledge -- npx -y agsc-cli mcp
```

Everything after `--` is the command that runs the server. Add `--scope project` to share
it with everyone who clones the repository, which writes a `.mcp.json` file:

```json
{
  "mcpServers": {
    "my-knowledge": {
      "command": "npx",
      "args": ["-y", "agsc-cli", "mcp"]
    }
  }
}
```

### Cursor

Create `.cursor/mcp.json` in the Bundle for that project alone, or `~/.cursor/mcp.json`
for every project:

```json
{
  "mcpServers": {
    "my-knowledge": {
      "command": "npx",
      "args": ["-y", "agsc-cli", "mcp"]
    }
  }
}
```

### VS Code

Create `.vscode/mcp.json` in the Bundle. The top-level key here is `servers`, not
`mcpServers`:

```json
{
  "servers": {
    "my-knowledge": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "agsc-cli", "mcp"]
    }
  }
}
```

If the Bundle is a folder inside a larger workspace rather than the workspace itself, add
`"cwd": "${workspaceFolder}/path/to/your-bundle"` beside `command`; a working directory is
part of the documented configuration here.

### Codex CLI

One command, from inside the Bundle:

```bash
codex mcp add my-knowledge -- npx -y agsc-cli mcp
```

Or write it into `~/.codex/config.toml` (or a project's `.codex/config.toml`):

```toml
[mcp_servers.my-knowledge]
command = "npx"
args = ["-y", "agsc-cli", "mcp"]
```

Here too a working directory is part of the documented configuration, so
`cwd = "/path/to/your-bundle"` in that table serves a Bundle you did not start in.

## 6. Checking that it works

From inside the Bundle, run the server by hand and send it one line. It answers with one
line of protocol and then waits:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"check","version":"0"}}}' \
  | agsc mcp
```

If you see a JSON line naming `agentic-system-core`, the server works and any remaining
problem is in your assistant's configuration. Two things to check first: the working
directory must be the Bundle (the folder with `agsc.config.json`), and the assistant has
to be restarted after the configuration file changes.

The server writes nothing but protocol to standard output, which is what lets an assistant
read it. If you want to see what it is doing, your assistant keeps a log; in Claude
Desktop those are `mcp.log` and `mcp-server-<name>.log` under `~/Library/Logs/Claude` on
macOS and `%APPDATA%\Claude\logs` on Windows.

## 7. The same tools without any installation

A published node registers the **same seven tools in the browser**, on its `/compose/`
page and on every item page, wherever the browser exposes them. Nothing is installed and
no server runs: the page reads the node's own published files. There too, `propose` and
`remember` only ever hand back text — a web page holds no repository identity and cannot
write on your behalf.

---

*Specification rules behind this page: AGSC-09-13 and AGSC-09-13a (the seven tools, the
error shape, no stray output), AGSC-09-14a and AGSC-09-14b (`ask`, `remember`, the
resources and the prompt), AGSC-09-16 (the same tools in a browser), AGSC-08-04 and
AGSC-08-18 (human-gated writes, untrusted results), AGSC-11-18 (the security floor a
surface inherits). The normative text is in `spec/`; where this page and a rule disagree,
the rule is right.*
