// index.js — name reservation for a specification under development.
// No runtime is published in the 0.0.x line. These constants mirror the
// specification so that early consumers do not hard-code a superseded value.

// The well-known URI suffix (D60, 2026-09-04): the discovery document lives at
// /.well-known/knowledge-linkset. The link relation and Profile URI keep the
// name `agentic-knowledge`, which D60 did not change.
const WELLKNOWN_SUFFIX = 'knowledge-linkset';
const LINK_RELATION = 'agentic-knowledge';
const PROFILE_URI = 'https://w3id.org/agentic-system-core/profile/agentic-knowledge';

// Deprecated: the published 0.0.1 stub carried the old well-known path here.
// Retained as an alias so a 0.0.1 consumer does not break; removed at 0.1.0.
// `_redirects` aliases the old path itself (AGSC-06-17).
const AGENTIC_KNOWLEDGE_URI = WELLKNOWN_SUFFIX;

module.exports = {
    WELLKNOWN_SUFFIX,
    LINK_RELATION,
    PROFILE_URI,
    AGENTIC_KNOWLEDGE_URI,
    version: '0.0.2',
    info: 'Specification for publishing machine-discoverable knowledge bundles; no runtime published yet'
};
