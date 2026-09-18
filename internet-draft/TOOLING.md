# Internet-Draft build toolchain

How `build.sh` in this directory was set up, what it checks, and how to run
it. The tools themselves are **not** installed in this repository — see
"Where the tools live" below.

## Versions installed (2026-09-18)

| Tool | Version | Installed via |
|---|---|---|
| Ruby | 3.2.3 (2024-01-18, x86_64-linux-gnu) | already on the machine |
| RubyGems | 3.4.20 | already on the machine |
| kramdown-rfc (gem) | 1.7.43 | `gem install kramdown-rfc --install-dir <scratch>/idtools/gems --no-document` |
| kramdown-rfc2629 (dependency of the above) | 1.7.43 | pulled in by the same install |
| Python | 3.12.3 | already on the machine |
| xml2rfc | 3.34.1 | `pip install xml2rfc` inside `<scratch>/idtools/venv` |
| idnits v3 (`@ietf-tools/idnits`, CLI `idnits`) | 3.1.0 | `npm install @ietf-tools/idnits` inside `<scratch>/idtools/npm`, using Node 22.22.3 (nvm) |
| Node.js | 24.18.0 at run time (any recent Node works; installed with 22.22.3) | already on the machine (nvm) |
| idnits (legacy, 2002-2022 IETF script) | 2.17.1 | downloaded from `https://raw.githubusercontent.com/ietf-tools/idnits/main/idnits`, `chmod +x` — **installed for reference only, not used by `build.sh`** (the current requirement is that the nits check match idnits v3, the check the Datatracker runs on every upload) |

`pip install idnits` was tried first, per the setup instructions; there is no
such PyPI package (`ERROR: Could not find a version that satisfies the
requirement idnits`), which is why the legacy script and, per the later
requirement, the npm `@ietf-tools/idnits` package were fetched directly
instead.

No repository file other than `build.sh` and this `TOOLING.md` was created or
modified to do any of this.

## Where the tools live

Everything above is installed under this machine's Claude Code scratch
directory for the session that set it up:

```
<scratch>/idtools/
  gems/                     GEM_HOME for kramdown-rfc  (gems/bin/kramdown-rfc, gems/bin/kdrfc, ...)
  venv/                     Python venv for xml2rfc     (venv/bin/xml2rfc)
  npm/node_modules/.bin/idnits   idnits v3 CLI (npm package @ietf-tools/idnits)
  idnits                    legacy idnits 2.17.1 (present, unused by build.sh)
```

where `<scratch>` was, at setup time:

```
/tmp/claude-1000/-home-andrei-work/bdd762f0-439c-4558-b2b8-714f1210078f/scratchpad
```

That path is session-scoped temporary storage — it will not survive past the
Claude Code session that created it. `build.sh` defaults its `KDRFC`,
`XML2RFC` and `IDNITS` variables to the paths above so it works immediately
in that session, but **for a permanent setup, reinstall the three tools
somewhere durable** (e.g. `~/.local/share/gem` for kramdown-rfc, matching the
layout the `rfc-sustainability-wellknown` project already uses; a venv under
`~/.cache`; `npm install -g @ietf-tools/idnits` or a project-local
`node_modules`) and point the three environment variables at the new
locations — see "Running it" below. Nothing about `build.sh`'s logic depends
on the scratch path other than these three defaults.

### Exact install commands used

```bash
IDTOOLS=<scratch>/idtools

# kramdown-rfc (Ruby 3.2.3 is new enough for the latest release; no pin needed)
gem install kramdown-rfc --install-dir "$IDTOOLS/gems" --no-document

# xml2rfc (Python venv)
python3 -m venv "$IDTOOLS/venv"
"$IDTOOLS/venv/bin/pip" install --upgrade pip
"$IDTOOLS/venv/bin/pip" install xml2rfc

# idnits v3 (npm package; used Node 22.22.3 via nvm to install, but any
# Node the idnits binary is run with afterwards works — it has no version
# pin of its own beyond a modern Node)
mkdir -p "$IDTOOLS/npm" && cd "$IDTOOLS/npm"
npm init -y
PATH="/home/andrei/.nvm/versions/node/v22.22.3/bin:$PATH" npm install @ietf-tools/idnits

# legacy idnits 2.17.1 (downloaded for reference; not wired into build.sh)
curl -sS -o "$IDTOOLS/idnits" \
  https://raw.githubusercontent.com/ietf-tools/idnits/main/idnits
chmod +x "$IDTOOLS/idnits"
```

## What `build.sh` does

```
./build.sh <revision> [draft-dir]
./build.sh --no-idnits <revision> [draft-dir]
./build.sh --help
```

- `<revision>` is required (e.g. `00`); it selects
  `draft-besleaga-agentic-knowledge-wellknown-<revision>.md`.
- `[draft-dir]` (or the `DRAFT_DIR` environment variable) selects the
  directory to build in; it defaults to `build.sh`'s own directory
  (this one). This is how the toolchain was proven against a stub draft
  kept entirely outside the repository — see "How it was proven" below —
  and it is also how you would build a draft kept anywhere else without
  copying it into this directory first.
- `--no-idnits` skips the idnits v3 check (e.g. if Node is unavailable).

Steps, each printed with `OK`/`FAIL`, in order:

1. **docname check** — the `docname:` front-matter field in `<draft>.md`
   must equal the file's own base name. Catches a stale or copy-pasted
   front matter block before it goes any further.
2. **ASCII check on the source** — `<draft>.md` must be pure ASCII.
3. **Build** — `kramdown-rfc -3 <draft>.md` produces a v2-vocabulary XML,
   which `xml2rfc --v2v3 --strict` rewrites to true RFCXML v3 vocabulary
   (no `<spanx>`/`<list>`/`<vspace>`).
4. **Clean-up (inline, no separate file)** — a small Python step (embedded
   in `build.sh` itself, ported from the pattern in
   `rfc-sustainability-wellknown/internet-drafts/v3-postprocess.py`) then
   strips four toolchain artifacts that idnits v3 flags but that have
   nothing to do with the draft's actual content:
   - leftover `<?line N?>` processing instructions kramdown-rfc emits
   - a combined `<references>` wrapper (idnits v3 wants a Normative and
     an Informative `<references>` block directly under `<back>`, not one
     wrapped inside another)
   - `<abstract>` blocks inside cited-reference records pulled in from
     bibxml (never rendered; occasionally contain wording idnits flags,
     e.g. "US-ASCII")
   - the U+00A0 no-break space kramdown-rfc writes inside "BCP 14"
   It refuses to write the file back if any of these (or any other
   non-ASCII character, or a leftover v2 element) is still present —
   i.e. it fails loudly instead of silently shipping a dirty file.
5. `xml2rfc --v3 --text --html` renders `<draft>.txt` and `<draft>.html`
   from the cleaned XML.
6. **Line-length check** — no line in `<draft>.txt` may exceed 72
   characters.
7. **ASCII check on the rendered text** — `<draft>.txt` must be pure
   ASCII.
8. **idnits v3** (`@ietf-tools/idnits`, "normal" mode — the mode the
   Datatracker runs on every upload, and what
   `https://author-tools.ietf.org/idnits3` runs) — run once on
   `<draft>.xml` and once on `<draft>.txt`. Each run first asks for just
   the nit count (`-o count`); a non-zero count triggers a second run in
   `-o simple` to print the actual findings. Zero nits on both is
   required to pass.

`build.sh` exits non-zero if any step fails, and prints a one-line summary
at the end (`==> <draft> built and checked clean` or `==> <draft> FAILED
one or more checks`).

### Environment variables it reads

| Variable | Default | Purpose |
|---|---|---|
| `KDRFC` | `<scratch>/idtools/gems/bin/kramdown-rfc` | kramdown-rfc binary |
| `XML2RFC` | `<scratch>/idtools/venv/bin/xml2rfc` | xml2rfc binary |
| `IDNITS` | `<scratch>/idtools/npm/node_modules/.bin/idnits` | idnits v3 CLI |
| `DRAFT_DIR` | `build.sh`'s own directory | directory to build in (overridden by a second positional argument) |

`build.sh` also pins `GEM_HOME`/`GEM_PATH` to `KDRFC`'s own gem directory
before invoking it (when that directory looks like a gem home). This was
not cosmetic: without it, on this machine, invoking the scratch-installed
`kramdown-rfc` binary with no `GEM_HOME` set caused Ruby to silently
activate a *different*, older `kramdown-rfc` (1.7.39, left over from this
author's other Internet-Draft project) instead of the one just installed
(1.7.43) — verified while testing this script. Pinning `GEM_HOME`/
`GEM_PATH` makes the tool actually used match the one `KDRFC` points at,
regardless of what else happens to be on the machine.

## How it was proven

A 20-odd-line stub draft (`draft-besleaga-agentic-knowledge-wellknown-00.md`,
same front-matter keys as the real draft: `docname`, `submissiontype:
independent`, `category: info`, `ipr: trust200902`, author block for Andrei
Nicolae Besleaga / Independent / andrei.besleaga.nicolae@gmail.com, an
abstract, an Introduction section citing `{{RFC8615}}` as its one normative
reference, plus minimal Security Considerations and IANA Considerations
sections so a full clean run was demonstrated end to end) was kept entirely
outside the repository, in the scratch directory
(`<scratch>/stub/draft-besleaga-agentic-knowledge-wellknown-00.md`), and
built with:

```bash
./build.sh 00 <scratch>/stub
```

Result: every check passed, including idnits v3 reporting zero nits on both
the `.xml` and the `.txt`, in a shell with no `GEM_HOME`/`GEM_PATH`
pre-set (to specifically exercise the isolation fix above). The stub's own
`.xml`/`.txt`/`.html` outputs stay in `<scratch>/stub/`, never in this
repository.

## Running it on posting day

From this directory, once the real draft's revision (e.g. `00`, or `01`,
... at a later posting) is ready:

```bash
cd internet-draft
./build.sh 00
```

(reinstall the tools first, per "Exact install commands used" above, if the
original scratch install is gone — any working install on `PATH`, or
pointed at via `KDRFC`/`XML2RFC`/`IDNITS`, is fine). A clean run ends with:

```
==> draft-besleaga-agentic-knowledge-wellknown-00 built and checked clean
```

If it instead ends with `FAILED one or more checks`, fix whatever the
`FAIL:` lines above it named and re-run — do not submit a draft that
`build.sh` reports as failing. Once it is clean, submit
`draft-besleaga-agentic-knowledge-wellknown-<rev>.xml` at
<https://datatracker.ietf.org/submit/>.
