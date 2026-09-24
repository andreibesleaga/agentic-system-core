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
| the latest release | yes |
| release candidates (`1.0.0-rc.*`) | yes, until `1.0.0` is released |
| anything older | no |

Fixes are made on the current line only. There is no long-term-support branch.

## What this project is, and what that means for a report

The engine is a command-line program that reads files and writes files. It has no
server, no network listener and no database; the published sites are static files.
Its network port refuses every call at 1.0 and the release runs offline, so the
attack surface is the files a Bundle is built from — which is why the interesting
reports are usually about **input handling**: a crafted item, attachment, diagram
source, imported corpus or peer document that makes the engine write something it
should not, escape the Bundle root, or produce a surface that misleads a reader or
an agent.

The threat model, and the honest limits of what the checks prove, are written down
in [`docs/SECURITY-CONSIDERATIONS.md`](docs/SECURITY-CONSIDERATIONS.md). The
specification's own rule on the subject (`spec/08-governance.md`, AGSC-08-19) says
of the four agent-safety lints:

> These lints prove neither safety nor the absence of novel injection; hashes and
> attestations prove only that an artefact is what was published. An implementation
> MUST NOT claim more.

That sentence is the standard this project holds itself to. A report that shows the
limit is narrower than claimed is as welcome as a report of a defect.
