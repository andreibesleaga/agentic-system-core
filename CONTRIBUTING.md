# Contributing

Thank you for reading this before writing code or prose. This repository holds two
different things, and they are changed in two different ways.

- **The standard** — `spec/`, `schema/`, `ontology/`, `tests/vectors/` and
  `docs/SPEC.md`. These are **frozen** between release candidates: a released rule
  id keeps its meaning, a released vector is never edited (it is withdrawn and a new
  one added), and an ontology term is deprecated rather than deleted
  (`spec/00-overview.md`, AGSC-00-14…17). A change here is a change to the format
  every implementation must follow.
- **The engine** — `src/`, `bin/`, `tools/`, `tests/` and the rest. This is one
  implementation of the standard. It can be fixed, refactored and extended freely,
  as long as it still does exactly what the rules say.

## Proposing a change to the standard

Open an issue first and say which rule is wrong, not which code is wrong. A good
proposal names:

1. the rule id (`AGSC-nn-nn`) and the file and line it is on;
2. what the rule says today, quoted;
3. what goes wrong if an implementer follows it — ideally two conforming
   implementations that disagree, or a rule that cannot be satisfied;
4. the exact replacement wording;
5. the conformance vector that would prove it.

The maintainer keeps a list of accepted items and applies them at the next release
candidate, all at once: a tag that has been published does not move. Expect a rule
change to take longer than a code change, and expect "the rule is the truth, the
engine is wrong" to be the usual answer.

## Proposing a change to the engine

Normal pull request. Before you open it:

```bash
npm install                      # dev dependencies only
npm test                         # the whole suite, node:test, offline
npm run test:coverage            # line coverage of src/ must stay at or above 99%
npm run audit                    # npm audit must report 0 vulnerabilities
node tools/count-artifacts --json   # the rule, code, vector and term counts
node tools/validate-vectors --json  # every conformance vector is well formed
node --test tests/arch/*.test.js    # the context boundaries and the purity rules
```

All of these must pass, and the test comes first: write the failing test, then the
smallest change that makes it pass. Every test is deterministic — a fixed clock
(`SOURCE_DATE_EPOCH`), no network, no wall clock, no randomness — because the build
is reproducible byte for byte and the tests are what hold it that way.

To lint a Bundle (a content repository, not this one):

```bash
node bin/agsc.js lint --json     # run from the Bundle's own root
```

Keep to the architecture: `src/knowledge/` and `src/governance/` are pure — no file
system, no clock, no network, no process — and reach the outside world only through
the ports in `src/ports/`. `tests/arch/` enforces this and will fail the build if a
module reaches across a boundary.

## Signing off — and one thing that is not settled

Every accepted contribution carries a trailer block. The rule is `AGSC-08-06` in
`spec/08-governance.md`, and this is its grammar, quoted in full:

```abnf
trailer-block = signoff *( LF assisted )
signoff       = "Signed-off-by:" SP name SP "<" email ">" SP "(" agreement ")"
assisted      = "Assisted-by:" SP producer "/" version SP "(operator:" SP actor ")"
agreement     = "CA-v1"
actor         = "human:" idstart *idchar
```

So a commit message ends with a line of this shape:

```
Signed-off-by: Ada Lovelace <ada@example.org> (CA-v1)
```

and, when the prose or code was drafted with an AI assistant — `prov.origin` is
`ai-assisted` or `ai-generated` — an extra line naming the accountable human
(`AGSC-08-07`; a missing or malformed trailer is `AGSC-E504`, and an AI-origin change
whose operator does not match is `AGSC-E505`):

```
Assisted-by: claude/opus-4 (operator: human:ada)
```

**What `CA-v1` means.** The token names the file `CONTRIBUTOR-AGREEMENT` at the root
of this repository. Read it before your first commit. In short: you certify that you
may submit the work, you keep your copyright and may use your contribution anywhere
else, you allow the maintainer to publish and maintain it here, and you accept that
your name, the address you commit under and your sign-off are published permanently.

The file is the project's own text, written by the project and read by no lawyer. It
is the Developer Certificate of Origin 1.1 reproduced unchanged, plus one further
clause (e) that belongs to this project. `spec/08-governance.md` (AGSC-08-06) names
the file and pins its SHA-256, so a distribution that ships different text has to
name it with a different token: what you sign under `CA-v1` stays under `CA-v1`.

What the licences already say: the engine is Apache-2.0 (whose section 5 already
carries an inbound grant on the same terms), the schemas, ontology, identifiers and
discovery document are CC0-1.0, and the prose is under the Content Use Terms in
`LICENSE-CONTENT`, whose clause 5 reads:

> 5. Contributions. A proposal you submit through this node's published contribution
> channels is licensed by you to the node's operator under these same terms, with
> your authorship recorded in the item's provenance.

## What you are agreeing to make public

Contributions are public and stay public. Your name, the address you commit under
and your sign-off line become part of the repository's history and of any change
ledger derived from it. That is by design — the project's whole subject is
provenance — but it is worth knowing before your first commit. If you would rather
not publish an address, GitHub's `users.noreply.github.com` address works, and is
what the maintainer's own commits use.

## Prose, items and patterns

If you are contributing an item rather than code, read `docs/plain/` first. Every
item carries a provenance record that says whether its prose is `human`,
`ai-assisted`, `ai-generated` or `imported` and names the human accountable for it
(`spec/02-item.md`, AGSC-02-07). Fill it in honestly; nothing else in the system
works if that field is decorative.

## Releases

Releases are tagged `vX.Y.Z` and published by the tag-triggered workflow in
`.github/workflows/release.yml`; nothing is published from a laptop. The procedure
around it is kept by the maintainer outside this repository, and `node tools/release`
prints the checklist it checks against.

## Conduct

Be decent. Disagree about the work, not about the person. The maintainer will remove
comments that are abusive and will stop engaging with anyone who makes the project
unpleasant to work on.
