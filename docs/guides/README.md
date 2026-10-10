# Guides — one short page per mode, and one for publishing

**Summary.** Seven short guides: one for each of the six modes of using a Bundle, and one
that puts a node online and checks it live. Each says who it is for and what you get,
then walks through the exact commands on files you write yourself — not on a ready-made
demo folder — and quotes the lines they print. Every command in them that runs offline
is run by a test, so the pages cannot drift from the engine. Beside them, one reference
page, [troubleshooting](troubleshooting.md), lists every code the guides and the demos
print, with its cause and what to do.

**Who this is for:** anyone who wants to use the engine on their own files. **Read
after:** [START-HERE.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/START-HERE.md); the modes are described in
[plain/modes.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/plain/modes.md), and [DEMOS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/DEMOS.md) runs every mode on
ready-made folders.

| Guide | Who it is for | What you get |
|---|---|---|
| [Mode 0 — a folder of notes becomes a checked site](mode-0.md) | a person with Markdown notes | a static site with search, a graph and files for assistants; changes as proposals |
| [Mode 1 — memory for an assistant, and nodes that check each other](mode-1.md) | a developer connecting an assistant; two publishers | a local tool server with seven tools; two nodes that name and check each other |
| [Mode 2 — a project's decisions, specifications, tasks and gates](mode-2.md) | a team with coding assistants | checked decision, specification and task files; a board; the files a forge needs; one steering file for every assistant |
| [Mode 3 — procedures as installable skills](mode-3.md) | a team with repeatable procedures | one skill pack per cluster with a lockfile; install, publish, bring skills in |
| [Mode 4 — a selection becomes a starting harness](mode-4.md) | an architect | a checked selection written as seven kinds of file and an archive; the opt-in `run` verb |
| [Mode 5 — the live board](mode-5.md) | people and agents sharing tasks | a board with who holds what; agent lanes with owners, budgets and limits; claims as proposals |
| [Publish — put a node online and check it live](publish.md) | anyone with a node that builds | the node at an `https:` address of your own, with the host's settings written for you, checked live by both checkers |

When a command says no, look its code up on the reference page
[Troubleshooting — the codes the guides and demos print](troubleshooting.md).

## Before any guide

Node.js 22.13 or later, `git` with your name and e-mail set, and a POSIX shell (`bash`;
on Windows, Git Bash). Install the package once, in a working folder:

```bash
mkdir agsc-work && cd agsc-work
npm install agentic-system-core
export PATH="$PWD/node_modules/.bin:$PATH"             # puts agsc and agsc-host on the PATH
export ENGINE="$PWD/node_modules/agentic-system-core"  # the package: examples, checkers, licence texts
```

Each guide starts from an empty folder inside the working folder and needs no network,
except where a step says so.

## How these pages stay true

In each guide, a block marked `bash demo` is run and the `text expect` block after it
lists lines it printed, each exactly; a plain `bash` block is shown, not run (the upload
and the live check of the publishing guide need the network, so they are shown).
`tests/docs/guides.test.js` runs every guide from top to bottom in a scratch folder, with
no build instant set (the guides commit instead, as a reader does), and checks that the
troubleshooting page has a row for every code a guide prints and every code the guides
and the demos quote. To check the guides
against the package exactly as it will be published, pack it from a clone of the engine
repository, install the packed file elsewhere, and point the test at it:

```bash
mkdir -p /tmp/agsc-pack /tmp/agsc-installed
npm pack --pack-destination /tmp/agsc-pack
(cd /tmp/agsc-installed && npm install /tmp/agsc-pack/agentic-system-core-*.tgz)
DOCS_ENGINE_PACKAGE=/tmp/agsc-installed/node_modules/agentic-system-core node --test tests/docs/guides.test.js
```
