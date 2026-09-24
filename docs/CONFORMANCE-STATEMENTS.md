# How to say your implementation conforms

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
> conformance vectors on «date»: «passed» of «total» passed.

For a partial result, say so in the same breath — this is more useful to a
reader than a claim that is technically true:

> «Your implementation name» «version» conforms to AgenticSystemCore
> «specification version», Level «n», for the «named» areas. «passed» of
> «total» vectors passed; the «named» areas are not implemented.

The levels, and the rules and vector areas each one covers, are defined in
`spec/10-implementation-profiles.md`.

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
