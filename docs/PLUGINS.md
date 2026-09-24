# Writing a plugin for this engine

**Status:** the engine's own contract, version **1.0.0** of the plugin API, for
specification version `1.0.0-rc.6`. Added at rc.6.

This document is for someone who wants to add a capability to a node without
forking the engine. It says what you may add, what your code may and may not do,
how the engine finds it, and what this project promises not to break.

The **specification** decides what a plugin *is*: `spec/00-overview.md` §0.6,
rule **AGSC-00-24**, closes the extension points of the format at **eight kinds**
and says that "a capability that is none of them is a change to this
specification, not a plugin". This document is the **engine's side** of that
sentence — the shapes, the registries and the promises of this particular
implementation, which any other implementation is free to make differently while
answering the same rules. The code is `src/application/plugins.js`; the samples
are `examples/plugins/`, one per kind, each with tests.

---

## 1. The eight kinds

| kind | what it is | how the engine finds one | owning rules |
|---|---|---|---|
| `memory-adapter` | reads or writes a foreign corpus | `export --to <name>` / `import --from <name>` | AGSC-01-26a, AGSC-01-22 |
| `channel-adapter` | carries a Proposal to a review lane | `channels[].adapter` in `agsc.config.json` | AGSC-01-30, AGSC-08-30 |
| `forge-shim` | renders a Gate as one CI workflow file | a `gate` item's `enforce[]` | AGSC-08-12 |
| `deployment-profile` | maps the served header sets onto one host's file format | `agsc-host emit <path>`; the built-in profiles by name (`agsc-host list`) | AGSC-06-01, AGSC-09-01 |
| `surface` | serves the published projection at its own route | derived from what the writer emits, or `surfaces[]` | AGSC-11-16, AGSC-11-02 |
| `page-tool` | answers a question inside the published page | `registerTool()` in the page | AGSC-09-16 |
| `composition-emitter` | renders a Harness for one runtime | `compose --emit <target>` | AGSC-07-18 |
| `checker` | validates one normative artefact, standalone | one of the nine of AGSC-09-90 | AGSC-09-90…92 |

At `1.0.0-rc.6` this engine loads a plugin you write for **three** of the kinds —
the memory adapter (`export --to <path>` / `import --from <path>`), the composition
emitter (`compose --emit <path>`) and the deployment profile (`agsc-host emit <path>`).
The other five have their registry, their sample under `examples/plugins/` and their
tests, and the selector column names where the specification places them; loading
one of those five from a Bundle's configuration is a 1.1 engine item.

There is no ninth. If what you want to add is not one of these eight, it is a
change to the specification and the place for it is a proposal against
`spec/`, not a plugin.

## 2. The three rules that bind every kind

AGSC-00-24 states them, and `tests/arch/plugin-contract.test.js` enforces them
against every sample in `examples/plugins/`:

1. **Network.** A plugin reaches the network only where its row grants it, and
   **no row grants it during `build`, `lint`, `verify` or `ci`** (AGSC-04-03,
   AGSC-08-30). Exactly one kind may ever reach it: a `channel-adapter`, in the
   CI lane, where the Network port exists at all. Every other kind: never.
2. **Writes.** A plugin writes only the outputs its row names — never inside
   `content/`, never outside the Bundle root, never through a link (AGSC-08-02,
   AGSC-01-16, AGSC-01-35).
3. **Canonical bytes.** A plugin never changes the canonical bytes of a 1.0
   surface (AGSC-04-24, AGSC-06-01). Adding a surface of your own is a plugin;
   changing `/llms.txt` is not.

What each row may read, may emit and may never do is data, not prose:
`src/application/plugins.js#KINDS`. Where a row and the kind's own rule differ,
**the rule wins** — AGSC-00-24 says so itself.

## 3. What a plugin looks like

A plugin is a CommonJS module whose export is an object declaring four members
and then whatever its kind's hooks are:

```js
'use strict';
module.exports = {
  kind: 'checker',                 // one of the eight, exactly
  name: 'validate-example',        // the name its selector uses
  agsc_spec_version: '1.0.0',      // the specification version it targets
  plugin_api_version: '1.0.0',     // the version of THIS contract it targets
  check(inputs) { /* … */ },       // the kind's own hook
};
```

The four declared members are the **capability check**. At load the engine
compares both versions against its own, using AGSC-00-15's compatibility rule —
the same MAJOR, and a MINOR no greater than the host's:

* a plugin targeting a version this engine implements is registered;
* a plugin targeting a newer MINOR, a different MAJOR, a kind this specification
  does not define, or a kind other than the registry it was offered to, is
  **`AGSC-E004`** — a Finding with a registered code, reported like any other, and
  it is simply **not registered**;
* **nothing throws.** A host that crashed on a bad plugin would make the plugin's
  author the author of the host's failure mode.

Two plugins of one kind may not share a name: a name selects exactly one.

## 4. How the engine finds a plugin

Discovery has exactly **two shapes, both local**:

* a **path** — `./plugins/my-adapter.js`, `../shared/x.js`, an absolute path —
  resolved against the Bundle root;
* an **npm package name a person installed** — `tsv-adapter`, `@acme/agsc-adapter` —
  looked up from the Bundle root the way Node looks up any package.

A specifier that carries a protocol (`https:`, `file:`, `npm:`, `data:`, …) is
refused with **`AGSC-E905`** and **the resolver is never reached**. There is no
fetching, no cache and no fallback: a plugin is a file a person put on this
machine. A specifier that cannot be resolved, or that throws while loading, is
`AGSC-E901` — a plugin that is not there is an I/O fact, not a version fault. A
bare name that is one of the engine's own adapters or formats selects that one
first; a bare name no installed package answers is refused exactly as an unknown
adapter always was.

The engine also never scans a directory for plugins and never reads one out of an
environment variable. A plugin is named **where its kind's selector says**, in the
table of §1 and nowhere else. `agsc.config.json` gains no `plugins` key: the
configuration is closed (AGSC-01-18), and every kind already has a place the
rules admit.

**What the verbs load.** Three verbs take a plugin on the command line, each
through the registry of its kind, so every plugin passes the capability check of
§3 before it runs:

| verb and flag | kind | the hook the engine calls | what is written |
|---|---|---|---|
| `export --to <path or package>` | `memory-adapter` | `exportFiles(items, context)` → `{files: [{path, text}], findings?}` | the files, under `dist/export/<name>/` |
| `import --from <path or package> <dir>` | `memory-adapter` | `importFiles(files, context)` → `{documents: [{path, text}], findings?}` | the documents, mapped exactly as an OKF bundle is (AGSC-01-22), with the same collision survey, `--dry-run` and `--replace` |
| `compose <slug…> --emit <path or package>` | `composition-emitter` | `emit(harnessFiles, harnessDir)` → one `{path, text}` or a list | beside the Harness directory, never inside it (AGSC-07-18) |

`items` is a frozen copy of the published items; `files` a frozen copy of every
file of the source directory, read by the engine; `context` carries the
specification version, and on export the content version and the build instant. A
plugin never touches the file system: it answers data, and the engine checks every
path before it writes anything — a path that is absolute, contains `..`, leaves the
plugin's own directory, lands inside the Harness or inside `content/` is
`AGSC-E902`, and then nothing of that run is written. A plugin's own findings are
kept when they carry a registered code. `--replace` is admitted for a plugin named
by a path; a plugin declares no flags of its own at plugin API 1.0. A deployment
profile is loaded the same way by `agsc-host emit <path>`. The other five kinds are
selected where §1 says, and none of them is loaded from the command line at 1.0.

## 5. The stability promise

**Additive within 1.x.** Concretely, for as long as this engine implements
specification version 1.x:

* a plugin that registers against plugin API `1.0.0` **keeps registering** against
  every later 1.x engine;
* a row of `KINDS` may **gain** a member; a member is never removed or given a new
  meaning within 1.x;
* a hook may **gain an optional argument**; an argument is never removed and its
  meaning never changes;
* the **kind list never grows**, because it is the specification's and closed
  (AGSC-00-24). A new kind is a new MINOR **of the specification**, not of this
  API;
* `PLUGIN_API_VERSION` moves MINOR for an addition, and MAJOR only with the
  specification's own MAJOR.

What is **not** promised: that a plugin targeting a newer MINOR than the host will
run. It will not: the host refuses it with `AGSC-E004` and says so, rather than
running it half-understood. That refusal is the promise working, not failing.

## 6. The samples

`examples/plugins/` holds one minimal, complete plugin per kind. Each is a leaf
module — it requires nothing at all — and `tests/arch/plugin-contract.test.js`
proves, for every one of them:

* it declares the four members and registers into **its own** registry and into no
  other;
* it reaches no network and spawns no process, checked both in its source text and
  at run time through the real module loader;
* it writes nothing, and every path it *names* is Bundle-relative and outside
  `content/`;
* building the fixture Bundle with all eight loaded and called produces **the same
  bytes, file for file** as building it with none.

Copy the one whose kind you need; the longest is under seventy lines.

## 7. Reading further

* `spec/00-overview.md` §0.6 — the compatibility rules and the closed kind list
  (AGSC-00-21…25).
* `docs/ARCHITECTURE-DDD.md` §"The plugin points" — where in the engine each kind
  attaches.
* `src/application/plugins.js` — the registries and the capability check.
* `docs/IMPLEMENTERS-GUIDE.md` — what an implementation of the whole
  specification, rather than one plugin, has to do.
