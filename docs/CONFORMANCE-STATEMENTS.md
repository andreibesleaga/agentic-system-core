# How to say your implementation conforms

**Who this is for:** an implementer about to say publicly that an implementation conforms. **Read after:** [IMPLEMENTERS-GUIDE.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/IMPLEMENTERS-GUIDE.md) §7.

Conformance here means one thing and it is checkable: your implementation
produces the bytes the conformance vectors expect, for a numbered version of
the specification and a stated level. Nobody needs permission to run the
vectors, and nobody needs permission to publish the result.

## The three steps

1. **Run the vectors.** They are published with the specification, in
   `tests/vectors/`. The reference implementation ships a runner
   (`agsc conform --level <n>`); a runner of your own is equally valid, because
   the vectors define the expected bytes and nothing else.
2. **Write down which version and which level you ran**, and how many vectors
   passed out of how many. If any failed, say which.
3. **Publish the sentence** below, next to your software, with a link to your
   own results.

## The sentence to use

> «Your implementation name» «version» conforms to AgenticSystemCore
> «specification version», Level «n». Verified against the published
> conformance vectors on «date»: «passed» of «total» passed in the
> «named» areas, with Unicode «version»«, using «checker» ».

The specification version is the full one (`1.0.0`, not `1.0`; a release
candidate is named with its pre-release part), and the checker part is needed only when you ran the
cases with someone else's checker rather than your own. Every element a claim
states is listed once, in rule AGSC-09-01.

For a partial result, say so in the same breath — this is more useful to a
reader than a claim that is technically true:

> «Your implementation name» «version» conforms to AgenticSystemCore
> «specification version», Level «n», for the «named» areas. «passed» of
> «total» vectors passed; the «named» areas are not implemented.

A node's claim also names where it is served, because
AGSC-06-01 requires a claim to name its deployment profile, and every surface it
declares with what proves it (AGSC-11-19). End either sentence with:

> Deployment profile: «profile» — «its claim». Surfaces: «surface» (proved by
> «case ids or validator run»), …

`agsc-host list` and `agsc-host emit` print each profile's claim text; the profiles
are described in [CONNECTORS.md](https://github.com/andreibesleaga/agentic-system-core/blob/main/docs/CONNECTORS.md#where-a-node-can-live).

The levels, and the rules and vector areas each one covers, are defined in
`spec/10-implementation-profiles.md`.

## The reference engine's claim

The reference engine in this repository publishes its own claim, as AGSC-10-05
asks, in the form above:

> agentic-system-core 1.0.1 conforms to AgenticSystemCore 1.0.0, Level 3.
> Verified against the published conformance vectors on 2026-10-12: 243 of 243
> passed in the 20 populated areas (adopt, boards, boundary, build, bundle,
> chunks, cli, compose, conform, discovery, export, frontmatter, graph, import,
> jcs, ledger, links, lint, prov, slug), 242 required and 1 optional, the 7
> withdrawn cases excluded, with Unicode 17.0. Deployment profile:
> cloudflare-pages — the reference profile: `_headers` and `_redirects` as
> `agsc build` writes them. Surfaces: llms-txt (proved by disc-0013, disc-0014),
> chunks (proved by chk-0001, chk-0002, chk-0003, chk-0004, chk-0005, chk-0006,
> chk-0008), webmcp (proved by cli-0003).

What each part rests on:

- **The run.** `agsc conform --level 3 --to conformance-report.json`, the
  engine's own runner, so the claim names no other checker. The report's summary
  is 243 passed, 0 failed and 7 skipped. The seven skipped are the withdrawn cases,
  which no claim counts for or against (AGSC-09-05); no required case failed or
  was skipped.
- **The runtime.** Node.js 24.21.0, the current release of the Node.js 24 line
  that the continuous-integration run uses, with Unicode 17.0. The same run on
  Node.js 22.13.0 (Unicode 16.0) and on Node.js 26.11.1 (Unicode 17.0) writes
  the same report, byte for byte. Both Unicode versions are inside the window
  AGSC-04-22 states.
- **The deployment profile and the surfaces.** A node that `agsc build` writes
  declares three surfaces in its discovery document, `llms-txt`, `chunks` and
  `webmcp`, and the cases named above prove each of them (AGSC-11-19). It does
  not declare `mcp`: the local tool server, `agsc mcp`, is a program a person
  runs beside a Bundle, not a route of a node, and a 1.0 writer does not declare
  it (AGSC-11-16). Cloudflare Pages is the reference profile of those that
  `agsc-host list` prints; a node served another way names its own profile.
- **What it does not say.** The claim is this project's own assertion about its
  own engine (AGSC-09-03). It certifies nothing, and it says nothing about
  another implementation or about any particular node.

The numbers are re-run for each release, not copied: `node tools/count-artifacts
--json` gives the case counts and the areas, and `tests/docs/release-wording.test.js`
fails when the claim and that count disagree.

## What you must not say

- Do not say "certified", "approved" or "official", or use any word that
  suggests this project vouches for your software. This project certifies
  nobody and approves nobody.
- Do not say "conforms to AgenticSystemCore" with no version and no level.
  Conformance without a version is not a statement about anything.
- Do not describe a partial result as a full one.
- Do not imply that conformance says anything about your software's security,
  speed or correctness beyond the bytes the vectors compare. It does not, and
  the specification says so about itself.

## A public record of results

This project does not yet keep a page listing the implementations and nodes it
has checked. Until one exists on <https://agenticsystemcore.com>, the public
record is the engine repository's issue tracker: open an issue at
<https://github.com/andreibesleaga/agentic-system-core/issues> with a link to
your software or node, the version and level you claim, and your results. The
issue records what was checked, by whom, and on what date, and it records
failures as readily as passes.

Being recorded is not a certification and confers nothing. It is a public
record that someone ran the vectors and what happened.

## If you disagree with a vector

Say so, in an issue, and quote the vector. A vector that is wrong is a defect
in the specification and is treated as one. This has already happened more
than once during development and the vectors changed. What does not happen is
a private exception: a vector applies to the reference implementation exactly
as it applies to yours.

The use of the name itself is described in
[`TRADEMARK-POLICY.md`](../TRADEMARK-POLICY.md).

## Notice

AgenticSystemCore™ is a trademark of Andrei N. Besleaga. Other names belong to
their owners.
