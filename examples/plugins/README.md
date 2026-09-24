# `examples/plugins/` — one minimal plugin of each kind

**Summary.** The specification admits exactly eight kinds of plugin (AGSC-00-24); this
folder holds one small, complete sample of each, to be read and copied. Each file
declares its kind, its name, the specification version and the plugin-API version it
targets, and requires nothing at all.

**Read first:** [docs/PLUGINS.md](../../docs/PLUGINS.md) — what a plugin of each kind
may read, may write and may never do, and how the engine finds it.

| File | Kind | How it is selected |
|---|---|---|
| `memory-adapter.js` | memory adapter | `export --to <path>` / `import --from <path>` |
| `channel-adapter.js` | channel adapter | `channels[].adapter` in the configuration |
| `forge-shim.js` | forge shim | a gate item's `enforce[]` |
| `composition-emitter.js` | composition emitter | `compose --emit <target>` |
| `surface.js` | surface | derived from what is emitted, or `surfaces[]` in the configuration |
| `page-tool.js` | page tool | `registerTool()` in the page |
| `deployment-profile.js` | deployment profile | `agsc-host emit <path>`; the target stated in a conformance claim |
| `checker.js` | checker | one of the nine checkers of AGSC-09-90, run standalone |

```bash
node --test tests/arch/plugin-contract.test.js   # each sample registers into its own kind only, reaches no network
```

A plugin is loaded from a local path or an installed npm package name, never from a
URL (a URL is refused with `AGSC-E905`). Licence: Apache-2.0.
