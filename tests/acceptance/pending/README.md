# `tests/acceptance/pending/`

**Summary.** One JSON file per persona scenario of `features/` that does not run as
written in the offline acceptance lane, named `<feature-stem>--<scenario-slug>.json`.
The runner (`../features.test.js`, rules in `../_runner.js`) reports each such scenario
as skipped, with its class and reason, and counts it; the members of a file are listed
in [../README.md](../README.md), "The pending files".

**Read after:** [../README.md](../README.md).

| Class | The scenario … |
|---|---|
| `forge` | needs a forge or a hosting platform (a pull request, a workflow run, a deploy, an issue, a release) |
| `model` | runs an agent lane for real, which needs a model adapter and a channel adapter; the reference engine ships neither |
| `external` | needs a third-party service or application (the w3id redirect service, an Obsidian install, a Zenodo deposit) |
| `conditional` | runs where the thing named in `needs` is present on the machine, as its probe `../steps/_<needs>.js` decides without the network, and is skipped with the reason elsewhere; with no probe module yet it runs nowhere and counts as pending |
| `gap` | shows a behaviour a rule requires and the reference engine does not have yet; `closes_in` names the change that makes it run, and that change deletes the file |

There is no `drift` class: a scenario whose text asks for something the specification
does not define, or defines differently, is rewritten, never pended.
