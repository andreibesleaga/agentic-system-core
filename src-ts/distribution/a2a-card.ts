// src-ts/distribution/a2a-card.ts — CONTEXT Distribution (Emission) — the Agent2Agent agent card
// `/.well-known/agent-card.json`, built on the OFFICIAL A2A JavaScript SDK (`@a2a-js/sdk`).
//
// Implements AGSC-06-34 (the A2A 1.0 Agent Card with every member that version requires and no
// other, the skill `tags`, JCS plus one LF) with AGSC-06-07 (no card unless the node declares the
// `a2a-card` surface AND a `responder` surface; a card without an endpoint is AGSC-E210) and
// AGSC-11-16/11-21 (the declaration-only surfaces of `surfaces[]`). Requirements: PRD-024.
//
// Why on the SDK: the card is a message of the A2A protocol, and the SDK's `AgentCard` codec is
// the protocol's own JSON form of it (`AgentCard.toJSON`, generated from the A2A 1.0 protobuf
// definition). The card is typed as the SDK's `AgentCard`, so a member the protocol does not
// define cannot be written, and the SDK's JSON writer decides which members appear.
//
// Own code, each because the SDK has no option for it (audit record `B8-library-choice.md`):
//   1. `skills` `[]` on a node with no skill pack: the codec leaves an empty list out (the protobuf
//      JSON mapping omits an empty repeated field), while A2A 1.0 §4.4.1 makes `skills` REQUIRED
//      and AGSC-06-34 says a node with no pack has `skills` `[]`;
//   2. the bytes: JCS (AGSC-04-05) through the engine's one canonicalizer and one trailing LF. The
//      SDK's `canonicalizeAgentCard` is the signing input of A2A §8.4: it drops `signatures` and
//      every empty member, `capabilities` `{}` among them, which the card must carry.
//
// A read-only local MCP tool server is not an A2A endpoint: only a declared `responder` makes a
// node eligible (AGSC-06-34). PURE: no file, no clock, no network.

import { AgentCard } from '@a2a-js/sdk';
import type { AgentCard as Card, AgentInterface, AgentSkill } from '@a2a-js/sdk';

import { A2A_CARD_ROUTE } from '../../src/boundary/surfaces.js';
import { canonicalize } from '../../src/knowledge/jcs.js';
import { finding } from '../../src/knowledge/validate.js';

/** AGSC-06-34: the well-known URI the IANA registry lists as permanent (one constant, `surfaces.js`). */
export const CARD_PATH: string = A2A_CARD_ROUTE;
/** AGSC-06-34 with AGSC-01-18: the `protocolBinding` of a responder entry that names none. */
export const DEFAULT_BINDING = 'JSONRPC';
/** AGSC-06-34: the `tags` of every skill (A2A 1.0 §4.4.5 requires them). */
export const SKILL_TAGS: readonly string[] = Object.freeze(['knowledge', 'skill-pack']);

/** One entry of `surfaces[]` (AGSC-01-18, AGSC-11-16). */
export interface SurfaceEntry {
  readonly access?: string;
  readonly binding?: string;
  readonly surface: string;
  readonly target: string;
  readonly version?: string;
}

/** One pack of `/skills/index.json` (AGSC-07-20). */
export interface Pack {
  readonly description?: string;
  readonly name: string;
}

/** What the card is made of: the node's configuration and the build's own facts. */
export interface CardInput {
  /** The Bundle description (the front matter of `content/index.md`). */
  readonly description?: string | null;
  /** The content version of AGSC-04-25. */
  readonly bundleVersion: string;
  readonly packs: readonly Pack[];
  readonly specVersion: string;
  readonly surfaces: readonly SurfaceEntry[];
  readonly tagline?: string | null;
  readonly title: string;
  readonly visibility?: string;
}

const declared = (surfaces: readonly SurfaceEntry[], name: string): SurfaceEntry[] =>
  surfaces.filter((entry) => entry !== null && typeof entry === 'object' && entry.surface === name);

/** AGSC-06-34: the node declares both the `a2a-card` and a `responder` surface. */
export function eligible(surfaces: readonly SurfaceEntry[]): boolean {
  return declared(surfaces, 'a2a-card').length > 0 && declared(surfaces, 'responder').length > 0;
}

/** AGSC-06-07: an `a2a-card` declared with no `responder` behind it is a card without an endpoint. */
export function cardFindings(surfaces: readonly SurfaceEntry[]): object[] {
  if (declared(surfaces, 'a2a-card').length === 0 || declared(surfaces, 'responder').length > 0) return [];
  return [finding('AGSC-E210', 'surfaces[] declares a2a-card but no responder surface: a card without an endpoint is not'
    + ' published (AGSC-06-07, AGSC-06-34; a local MCP tool server is not an A2A endpoint)', { file: 'agsc.config.json' })];
}

/** A text member: the first value that is a non-empty string. */
function firstText(...values: ReadonlyArray<string | null | undefined>): string {
  return values.find((value): value is string => typeof value === 'string' && value !== '') ?? '';
}

/** AGSC-06-34: one interface per `responder` entry, in the order of `surfaces[]`. */
function interfaces(surfaces: readonly SurfaceEntry[], protocolVersion: string): AgentInterface[] {
  return declared(surfaces, 'responder').map((entry) => ({
    protocolBinding: firstText(entry.binding, DEFAULT_BINDING),
    protocolVersion,
    tenant: '',
    url: String(entry.target),
  }));
}

/** AGSC-06-34: one skill per pack of `/skills/index.json`, in index order. */
function skills(packs: readonly Pack[]): AgentSkill[] {
  return packs.map((pack) => ({
    description: firstText(pack.description),
    examples: [],
    id: pack.name,
    inputModes: [],
    name: pack.name,
    outputModes: [],
    securityRequirements: [],
    tags: [...SKILL_TAGS],
  }));
}

/**
 * AGSC-06-34: the card, as the SDK's `AgentCard` message. `version` is the content version, and on
 * a `restricted` node the specification version (AGSC-11-20 stamps no content version where an
 * unauthenticated reader can read it).
 */
export function card(input: CardInput): Card {
  const [declaration] = declared(input.surfaces, 'a2a-card');
  return {
    capabilities: { extensions: [] },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['application/json'],
    description: firstText(input.description, input.tagline, input.title),
    name: input.title,
    provider: undefined,
    securityRequirements: [],
    securitySchemes: {},
    signatures: [],
    skills: skills(input.packs),
    supportedInterfaces: interfaces(input.surfaces, firstText(declaration?.version)),
    version: input.visibility === 'restricted' ? input.specVersion : input.bundleVersion,
  };
}

/**
 * AGSC-06-34: the bytes of `/.well-known/agent-card.json` — the SDK's JSON form of the card, JCS,
 * one trailing LF — or null when the node is not eligible (AGSC-06-07).
 */
export function cardBytes(input: CardInput): string | null {
  if (!eligible(input.surfaces)) return null;
  const json = AgentCard.toJSON(card(input)) as Record<string, unknown>;
  // A2A 1.0 §4.4.1: `skills` is required; the codec leaves an empty list out (own code 1).
  if (json['skills'] === undefined) json['skills'] = [];
  return `${canonicalize(json)}\n`;
}
