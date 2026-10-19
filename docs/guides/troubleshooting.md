# Troubleshooting — the codes the guides and demos print

**Summary.** A reference page, not a guide: one row for every code that the
[guides](README.md) and the [demos](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/DEMOS.md) print or quote, with what
you see, the usual cause and what to do. Look a code up here when a command says no. The
full list of codes, with the rules behind them, is the code registry of the
specification ([§9.4 of spec/09-conformance.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/spec/09-conformance.md));
`tests/docs/guides.test.js` checks that every code the guides print, and every code the
guides and demos quote, has a row here.

**Read after:** [the guides](README.md).

---

## Reading a finding

Every finding is one line: its severity, its code, a sentence that names the cause and
the rule, and, when the finding is about a file, the file and line after a dash:

```text
error: AGSC-E310 body reference "salting.md" resolves to nothing inside the Bundle (AGSC-03-11) — content/concepts/brewing.md:15
```

An **error** stops the command: nothing is written, and the exit code is 1. A
**warning** (`warn:`) is advice; the command goes on and still passes. Exit code 2 means
the command itself was wrong (an unknown verb or flag, a missing argument, a bad
setting), so nothing was checked. The checker `validate-wellknown` prints the same codes
after the document's name, for example `…/knowledge-linkset:1:1 error AGSC-E201 …`. With
`--json`, every command prints the same findings as JSON objects instead.

## The codes

| Code | What you see | Cause | What to do |
|---|---|---|---|
| `AGSC-E001` | `unknown verb "help"`; `run executed nothing: …`; `refresh --agent` without `--dry-run` refused | a verb the engine does not have, or a form of a verb this engine does not ship (running steps needs an isolating runner, an agent lane's live run is made by an agent outside the engine) | `agsc --help` lists the sixteen verbs and `agsc <verb> --help` the flags of one; for `run` and `refresh`, use `--dry-run` |
| `AGSC-E002` | `unknown option '--…'` | a flag the verb does not take, or an extra argument | `agsc <verb> --help` |
| `AGSC-E003` | `refresh requires --agent <name>`; from the tool server, `an episode needs the instant it started` (the member `at`) | an argument the command or the tool call needs is missing | add the argument the message names |
| `AGSC-E004` | `environment variable AGSC_… is not a configuration name this engine knows; unset it`; `AGSC_… in the .env file …; remove that line`; an unknown key of `agsc.config.json` | a variable or key whose name the engine does not know; a name reserved to a later version (such as `build.feed`) is refused the same way | `unset` the variable (`env` lists them; their names start with `AGSC_`), remove the `.env` line, or remove the key; nothing is written until it is gone |
| `AGSC-E201` | `relation …: digest does not match the bytes of https://…`; `link context members are not ordered …`; a value of the wrong type | a file differs from the one the discovery document names (a host rewrote it, or another build was uploaded), or a file breaks the shape the rules give it | upload the checked build again, unchanged, and turn off host features that rewrite pages; for a file you wrote, fix it at the place named |
| `AGSC-E202` | `no Access-Control-Allow-Origin …`, `no ETag …`, `Cache-Control is …`; a required key or field missing | the host sent a response without a header a node needs, or a required value is missing (such as the `Contact:` line of `security.txt`) | apply the host settings `agsc-host emit <profile>` writes (the [publishing guide](publish.md), step 4); add the missing value |
| `AGSC-E203` | `/task_state: must be equal to one of the allowed values`; `compose --emit crewai: … this distribution ships no rendering for it`; `the program "curl" is not in run.allow[]` | a value outside a closed list: a task state, an export or compose target this engine does not ship, a program a procedure may not run | use one of the listed values; for `compose`, leave out `--emit` or name a plugin; add the program to `run.allow[]` only if you mean it |
| `AGSC-E204` | `the build instant defaulted to 1970-01-01T00:00:00Z …`; a slug, address or date in the wrong form | the build has no instant (no commit and no `SOURCE_DATE_EPOCH`), or a value does not match its pattern | commit once, or `export SOURCE_DATE_EPOCH=$(date +%s)`; fix the value at the place named |
| `AGSC-E206` | `content/procedures/<name>.md already exists with other bytes; an import never writes over an item the Bundle holds` | an import, such as `agsc skills import` of a pack back into its own Bundle, would replace an item the Bundle already holds; at 1.0.0 this happens even for a pack that has not changed | move the item aside, import, then restore by hand what the import does not carry; the [Mode 3 guide](mode-3.md#5-bring-skills-in) gives the steps |
| `AGSC-E209` | `relation "made-up" is neither a registered name … nor a …/rel#<name> extension URI` | a discovery document or a boundary setting (`federation`, `chunks`, `budget`, `visibility`, …) with a value the rules do not allow | use a registered relation name or the extension form; keep the setting inside its bounds |
| `AGSC-E301` | `Link "implements" target "no-such-item" resolves to no item` | a typed link in a header names an item the Bundle does not hold; at 1.0.0 `build` passes and leaves the link out of the graph, while `lint` and `ci` refuse it | fix the slug, or add the missing item; run `agsc ci` before you publish |
| `AGSC-E305` | `"hydration" has no inbound Link and no clusters[] entry` (warning) | no other note points at this one with a typed link, and no cluster lists it | add a typed link to it in a related note's header (a key such as `related:`; the [data model](https://agenticsystemcore.com/docs/data-model/) lists all fourteen), or list it in a cluster; a link in the text does not count |
| `AGSC-E310` | `body reference "salting.md" resolves to nothing inside the Bundle`; `build` writes nothing | a link in the text to a note or file that does not exist | fix the link at the file and line named, or add the missing note |
| `AGSC-E406` | `no PRIVACY.md in the Bundle root …` (warning); a section a page or kind expects is missing | a published page has no text of yours to show, or a note lacks a section its kind lists | add `PRIVACY.md` beside `LICENSE-CONTENT`; add the missing section |
| `AGSC-E408` | `a concept carries no description` (warning) | the note's header has no `description:` | add a one-line `description:` of 40 to 200 characters |
| `AGSC-E413` | `login/SKILL.md: the bytes do not match the SHA-256 the lockfile records …; nothing was installed` | a skill pack was changed after it was locked | leave the installed packs as they are and run `agsc skills` again from the source, which writes the packs and their lockfile together; then install |
| `AGSC-E506` | `site.base was set to the development placeholder http://localhost/ …`; `title was too short and was replaced by the slug`; `index.md is never adopted as an item` (warnings) | the engine chose, normalised or left out a value for you, and says so | read the line; set a real `https:` address in `site.base` before publishing; change any value it chose that you want otherwise |
| `AGSC-E509` | `agent ghost is undeclared or disabled` | an agent lane named on the command line or in a tool call is not declared, or is turned off, in `agsc.config.json` | declare the lane in `agents[]` of `agsc.config.json` with `enabled: true` (the [Mode 5 guide](mode-5.md)), or use a declared one |
| `AGSC-E510` | a model call skipped because a monthly budget is reached (warning; also on the NOW page) | the lane's `budget_usd_month` or the node's `budget.usd_month` is spent | raise the budget, or wait for the next month |
| `AGSC-E511` | `the task "…" is already TASK_STATE_WORKING under …; the first merged claim wins`; `… max_claims is 1` | a claim of a task someone else holds, or more claims than the lane may hold | pick another task, or finish one first |
| `AGSC-E603` | `SOURCE_DATE_EPOCH "abc" is not an integer number of seconds` | the variable is set to something other than an integer number of seconds; an empty value counts as unset | `export SOURCE_DATE_EPOCH=$(git log -1 --format=%ct)` or `unset SOURCE_DATE_EPOCH` |
| `AGSC-E901` | `no .well-known/security.txt in the Bundle root …`; `target not found on disk: …`; a file a command needs is missing | a file that must exist does not: the security contact, a file the discovery document lists, `LICENSE-CONTENT` for an export | add the file (the [Mode 0 guide](mode-0.md), step 2, for the security contact); build again before checking |
| `AGSC-E905` | `scheme not allowed: http:`; `address refused: …` | the checker refused to fetch an address: not `https:`, or a private or loopback address | publish over HTTPS; for your own machine, add `--dev` |
| `AGSC-E907` | `HTTP 404 for https://…`; `anchor … is not on the origin the document was retrieved from`; `resolved, not mutual: no rel#peer names …` | a node or one of its files could not be fetched, it names another address in `site.base`, or two peers do not name each other | upload the contents of `www/` to the address in `site.base`; list each node in the other's `peers` (the [Mode 1 guide](mode-1.md)) |

## Not a code

| What you see | Why | What to do |
|---|---|---|
| `agsc: command not found` | the `export PATH=…` line was not run in this shell | run the two `export` lines of [the guides](README.md#before-any-guide) again from the working folder |
| `left as is: <note>.md already has a frontmatter block …` | `init` adopts only notes without a header; a note that already has one is left where it is and not published | the [Mode 0 guide](mode-0.md), step 1 |
| `skipped: /feed.xml (reserved to 1.1 …)` and the other `skipped:` lines | routes this build does not write, each with its reason | nothing; they are information |
