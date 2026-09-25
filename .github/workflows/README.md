# `.github/workflows/` — the two automated lanes

**Summary.** Two GitHub Actions workflows. `test.yml` runs the whole test suite on
every push and pull request, on Ubuntu, macOS and Windows with Node 22 and 24, with
read-only permissions. `release.yml` publishes the npm packages, and runs only when the
maintainer pushes a `v*` tag; it holds no token (npm trusted publishing) and attests
each tarball it publishes. Every action is pinned to a commit hash.

**Read after:** [docs/TESTING.md](../../docs/TESTING.md) (what the suite runs) and
[CONTRIBUTING.md](../../CONTRIBUTING.md) (how a change gets in). The same release checks
run locally, without publishing anything:

```bash
npm test                     # what test.yml runs, on one machine
node tools/release --json    # the release lane as a dry run; status "pass"
```

Each file's header comment says what it runs, which secrets it needs (none) and why.

**The workflow files are checked too.** A job of `test.yml` runs `actionlint` 1.7.12
over both files — the release binary, refused unless its SHA-256 matches the value
recorded in the job. The same binary checks the workflows of the site, the patterns
node and the Python package from one machine; [docs/ENGINEERING.md](../../docs/ENGINEERING.md)
§5 lays out what each repository's workflow runs.
