# Security policy

## Reporting a vulnerability

Report it privately, through this repository's **private vulnerability reporting**:
open the repository's **Security** tab and choose **Report a vulnerability**. The
report goes to the maintainer and is not public while it is being handled.

Please do not open a public issue for a security problem, and please do not post the
details anywhere public until a fix is released.

If private reporting is unavailable to you, use the contact page at
<https://andreibesleaga.com/contact/> and ask for a private channel; do not put the
details in the first message. Both routes, in this order, are the `Contact:` lines of
this project's published `security.txt`, at
<https://agenticsystemcore.com/.well-known/security.txt> (RFC 9116).

Useful in a report: what you did, what happened, what you expected, the version or
commit, and — if the finding is about a published site — the exact address.

## What to expect

This project is maintained by one person, in their own time. There is no service
level, no paid support and **no bug bounty**: no payment is offered or made for a
report. Reports are read and answered as soon as the maintainer can, and a reporter
who asks to be credited is credited in the release notes.

## Supported versions

| Version | Supported |
|---|---|
| `1.0.x` | yes (the latest patch) |
| any `1.0.0-rc.*` | no — upgrade to `1.0.0` (the change log says how) |
| anything older | no |

Fixes are made on the current line only, in a new release; there is no
long-term-support branch, and no fix is made to a release candidate. Every released
version stays readable at its tag in this repository and its packages stay
installable, but none of them is supported once a later version is out.

## Coordinated disclosure

A fix is released first, and the advisory follows it. While a report is being
handled, its details stay between the reporter and the maintainer. Once the fixed
release is out, the maintainer publishes a GitHub security advisory for this
repository that names the affected and the fixed versions and credits the reporter
who asked to be credited; a GitHub advisory can carry a CVE identifier. Please keep
the details private until that advisory is published.

## What this project is, and what that means for a report

The engine is a command-line program that reads files and writes files. It has no
database, its verbs open no network listener, and the published sites are static
files. Its network port refuses every call at 1.0 and the release runs offline, so
the main attack surface is the files a Bundle is built from. Two programs in the
package touch a network, each only when a person runs it:

- `agsc-host serve` serves a build directory read-only over plain HTTP. It binds
  `localhost:8080` unless told otherwise (`--bind`, `--port`), answers `GET` and
  `HEAD` only, and never follows a link out of the directory it serves; any origin
  other than loopback needs a TLS terminator in front.
- `tools/validate-wellknown <URL>` fetches the discovery document it is given and
  its targets: `https` only, a closed list of refused addresses checked again on
  the open socket, at most three redirects, a deadline and a byte cap per
  response (AGSC-11-07 to AGSC-11-10).

The interesting reports are therefore usually about **input handling**: a crafted item, attachment, diagram
source, imported corpus or peer document that makes the engine write something it
should not, escape the Bundle root, or produce a surface that misleads a reader or
an agent.

One input is trusted rather than checked: the Bundle's own `.git` directory. The
engine runs `git` in the Bundle to read its history, and git reads that directory's
configuration. The engine switches off the two settings known to start a program
during those reads (`core.fsmonitor` and `log.showSignature`), but a repository
that came from someone else, for example unpacked from an archive, can carry other
configuration. Clone a Bundle you did not make, or inspect its `.git/config`,
before you run the engine in it.

The threat model, and the honest limits of what the checks prove, are written down
in [`docs/SECURITY-CONSIDERATIONS.md`](docs/SECURITY-CONSIDERATIONS.md). The
specification's own rule on the subject (`spec/08-governance.md`, AGSC-08-19) says
of the four agent-safety lints:

> These lints prove neither safety nor the absence of novel injection; hashes and
> attestations prove only that an artefact is what was published. An implementation
> MUST NOT claim more.

That sentence is the standard this project holds itself to. A report that shows the
limit is narrower than claimed is as welcome as a report of a defect.
