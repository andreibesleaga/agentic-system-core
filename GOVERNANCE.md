# How this project is governed

AgenticSystemCore is maintained by one person. This file says who decides
what, how a change is proposed, what is guaranteed not to change inside a
version, and what happens if the maintainer stops. It is short on purpose.

## Who decides

Andrei N. Besleaga is the maintainer and has the final word on the
specification, the conformance vectors, the reference implementation and the
ontology. There is no committee and no sponsoring organisation. Decisions are
recorded in the repository's changelog and, where they change a rule, in the
specification itself.

This is a deliberate choice, not a temporary arrangement. A small
specification with one maintainer changes coherently; a small specification
with a committee that does not exist changes by accident. If the project ever
acquires several regular contributors, this file will be revised in public
before the way decisions are made changes.

## Who stands behind this

AgenticSystemCore is maintained by one person, with no company, no funding and
no organisation behind it. That is worth knowing before you build on it, so
here is what it means in practice.

What you can rely on: the specification, the schemas, the vocabulary and the
conformance vectors are published under licences that let you continue without
anyone's permission; the vocabulary addresses do not depend on this project's
domain; every release is archived independently; and conformance is defined by
published bytes, not by anyone's opinion.

What you cannot rely on: a release schedule, a support channel, or a
guarantee that any question will be answered quickly.

If you are deciding whether to depend on this for something that matters,
the honest answer is: depend on the format and the vectors, which survive this
project, and treat the reference implementation as one implementation among the
ones that could exist.

## What anyone may do without asking

- Read, implement, fork and redistribute the specification, the schemas, the
  vocabulary and the conformance vectors.
- Write an independent implementation in any language, and say that it
  conforms — see [`docs/CONFORMANCE-STATEMENTS.md`](docs/CONFORMANCE-STATEMENTS.md)
  for the wording.
- Publish a knowledge node of your own, with your own content and your own
  terms, using this format.
- Open an issue or a pull request.

The software licence and the licences covering the schemas, the vocabulary and
the written material are in `LICENSE`, `LICENSE-CONTENT` and the licence table
of `README.md`. Nothing in this file narrows them. The use of the project's name
is described in [`TRADEMARK-POLICY.md`](TRADEMARK-POLICY.md).

## How a change is proposed

1. Open an issue that says what is wrong or missing, and what the change
   would be. For a rule, quote the rule.
2. If the change touches the specification, the schemas, the vocabulary or the
   conformance vectors, expect it to take longer than a code change. Those four
   are the parts other people's software depends on byte for byte.
3. A pull request is welcome, and a pull request that includes a conformance
   vector proving the new behaviour is welcome twice over.
4. The maintainer answers, accepts, asks for changes, or declines with a
   reason. A decline is recorded with its reason.
5. Every accepted change carries a sign-off, as
   [`CONTRIBUTING.md`](CONTRIBUTING.md) describes, and an item written with the
   help of a software assistant says so in its provenance record.

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).

## What is fixed inside a version

- The specification's version number follows semantic versioning. Conformance
  is always to a **numbered version and a level**, never to "the standard".
- Inside a major version, changes are additive. A reader must ignore what it
  does not recognise and must preserve it on a round trip; a writer must not
  emit something that the version it claims does not define. The compatibility
  rules are in the specification itself.
- The conformance vectors are normative. A vector changes only through the
  procedure the specification sets out, and a changed vector means a new
  version.
- The extension points are a closed list of plugin kinds, documented in
  [`docs/PLUGINS.md`](docs/PLUGINS.md), with an additive-only promise inside a
  major version.

## What is not promised

- No release date is promised.
- No support is promised, and there is no service level of any kind.
- No security guarantee is made beyond what the specification's own text says,
  which is that the checks it defines prove neither safety nor the absence of
  attacks it does not know about.
- No standards body has reviewed or adopted this work, and no such review or
  adoption is claimed anywhere.

## Security

Report a security problem privately, through this repository's private
vulnerability reporting (the **Security** tab, **Report a vulnerability**). If
that is not available to you, use the second route named in
`/.well-known/security.txt` on either site, the contact page. Please do not open
a public issue for a security problem first. [`SECURITY.md`](SECURITY.md) has
the details.

## If the maintainer stops

This project has one maintainer, so it is worth saying plainly what happens if
that person cannot continue.

- The specification, the schemas, the vocabulary and the conformance vectors
  are published under licences that let anyone continue from them. A fork does
  not need permission.
- The vocabulary addresses are `w3id.org` permanent identifiers, not addresses
  on this project's own domain, so they can be pointed elsewhere if the domain
  lapses.
- Every published release is archived independently of this project, so the
  bytes survive the loss of any single account.
- If the maintainer stops, the repositories are archived with a notice saying
  so, and the licences keep every permission they gave.

## Changes to this file

This file is versioned with the repository. A change to how decisions are made
is announced in the changelog before it takes effect.

## Notice

AgenticSystemCore™ is a trademark of Andrei N. Besleaga. Other names belong to
their owners.
