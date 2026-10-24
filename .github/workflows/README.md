# `.github/workflows/` — the two automated lanes

**Summary.** Two GitHub Actions workflows. `test.yml` runs the whole test suite on
every pull request, every push to `main` or a `release/` branch, and once a week, on Ubuntu, macOS and Windows with Node
22.13.0, 24 and 26, with read-only permissions; on Ubuntu with Node 24 the suite runs
measured, and fails below the coverage bar, and every leg installs the two packed
tarballs together. A further job on Ubuntu runs the browser lane with a pinned
`playwright-core` and a pinned `chrome-headless-shell`, each checked against its
SHA-256; it is not one of the checks branch protection requires. `release.yml`
publishes the npm packages, and runs only when the maintainer pushes a `v*` tag (or
starts it by hand for a version already tagged); it holds no token (npm trusted
publishing), publishes only a tag whose commit is on `main`, uses the dist-tag `next`
for a pre-release and `latest` for a final release, and attests each tarball it
publishes. Every action is pinned to a commit hash.

**Updates.** [`../dependabot.yml`](../dependabot.yml) asks Dependabot, once a month,
for one grouped pull request with every update of the pinned actions and one with
every update of the npm dependencies; each runs `test.yml` like any other pull request.
The weekly run of `test.yml` keeps the advisory check and the runner images current
when nothing is pushed (GitHub turns a schedule off after 60 days with no activity).

**Read after:** [docs/TESTING.md](../../docs/TESTING.md) (what the suite runs) and
[CONTRIBUTING.md](../../CONTRIBUTING.md) (how a change gets in). The same release checks
run locally, without publishing anything:

```bash
npm test                     # what test.yml runs, on one machine
node tools/release --json    # the release lane as a dry run; status "pass"
node tools/release           # the same, with the maintainer's release steps printed
```

Each file's header comment says what it runs, which secrets it needs (none) and why.

**The workflow files are checked too.** A job of `test.yml` runs `actionlint` 1.7.12
over both files — the release binary, refused unless its SHA-256 matches the value
recorded in the job. The same binary checks the workflows of the site, the patterns
node and the Python package from one machine; [docs/ENGINEERING.md](../../docs/ENGINEERING.md)
§5 lays out what each repository's workflow runs.
