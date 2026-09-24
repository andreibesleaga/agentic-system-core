'use strict';
// CONTEXT Distribution (Emission) — the `git-clone` deployment profile: a node read
// straight from a clone of its repository.
//
// A Bundle is a file set under version control, so the substrate is the repository
// itself: whoever holds a clone runs `agsc build` and then `agsc-host serve`, and the
// build is the one the history describes (the ledger and the content version are
// derived from that history, AGSC-08-20a, AGSC-04-25). The profile therefore writes
// nothing; it serves through the `local` profile and it names the substrate in the
// claim.
//
// What a forge's raw-file service is NOT is stated in `limits`: RFC 8615 roots a
// well-known URI "in the top of the path's hierarchy", and a raw-file URL is always
// prefixed by the owner, the repository and the ref, so no raw-file service can serve
// `/.well-known/knowledge-linkset` of an origin.

const { define, nothing } = require('./profile.js');

module.exports = define({
  claim: 'git-clone (built from a clone of the repository and served by agsc-host serve, as the local profile)',
  emit: () => nothing(),
  limits: [
    'A forge\'s raw-file service is not a host: its URLs carry the owner, the repository and the ref before the path, so the well-known location of RFC 8615 is never at the top of an origin; GitHub\'s raw service also answers text/plain with a sandboxing security policy for every file (observed 2026-09-24).',
    'The build output is not committed (only content is), so every reader of a clone builds it; the bytes are the same for the same history and SOURCE_DATE_EPOCH (AGSC-04-02).',
    'Serving is the local profile\'s, with its limits.',
  ],
  name: 'git-clone',
  title: 'A clone of the node\'s repository',
});
