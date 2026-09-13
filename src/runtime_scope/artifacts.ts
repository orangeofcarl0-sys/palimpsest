/**
 * G10-H RuntimeScope artifacts — durable runtime-organization identity above
 * Activation/Participation, distinct from Organization/Work/Continuity/Peer.
 *
 *   RuntimeScopeRef ≠ OrganizationDefinitionRef ≠ Work scope_id ≠ PeerRef
 *   RuntimeScopeMember ≠ OrganizationMemberRef
 *   the recorded Organization basis is provenance, never a runtime mutation
 */

import { canonicalDigest } from "../schema/canonical.js";
import type { ActivationRef } from "../coordination/index.js";
import { parseActivationRef } from "../coordination/index.js";
import type { PeerRef } from "../federation/peer.js";
import { parsePeerRef } from "../federation/peer.js";
import type { OrganizationDefinitionRef } from "../organization/definition.js";
import { parseOrganizationRef } from "../organization/definition.js";
import type { RuntimeScopeRef } from "./ref.js";
import {
  RuntimeScopeArtifactError,
  materializeRuntimeScopeRef,
  parseRuntimeScopeRef,
  requireNonEmpty,
  requireStableId,
} from "./ref.js";

export const RUNTIME_SCOPE_CHAIN_DOMAIN = "palimpsest.runtime-scope-chain.v1";
export const RUNTIME_SCOPE_HOLON_DOMAIN = "palimpsest.runtime-scope-holon.v1";

/** The exact organization revision a scope was opened against (provenance). */
export type OrganizationBasisRef = OrganizationDefinitionRef;

export type RuntimeScopeMember =
  | { readonly kind: "activation"; readonly activation: ActivationRef }
  | { readonly kind: "child_scope"; readonly scope: RuntimeScopeRef };

export function runtimeScopeMemberKey(member: RuntimeScopeMember): string {
  return member.kind === "activation"
    ? `activation:${member.activation.activationId}`
    : `child_scope:${member.scope.scopeId}`;
}

export function runtimeScopeMembersEqual(a: RuntimeScopeMember, b: RuntimeScopeMember): boolean {
  return runtimeScopeMemberKey(a) === runtimeScopeMemberKey(b);
}

/**
 * G10-I CF-H-03: a boundary source is a TAGGED, source-verifiable union — never a bare
 * string. An `organization_interaction` source must be declared by the exact organization
 * revision the scope is grounded to; a `runtime_declared` source is an honest runtime-only
 * declaration usable when the scope has no organization basis.
 */
export type RuntimeScopeBoundarySource =
  | { readonly kind: "organization_interaction"; readonly interactionId: string }
  | { readonly kind: "runtime_declared"; readonly declarationId: string };

/** A runtime boundary surface — carries a verifiable source (§14). */
export interface RuntimeScopeBoundary {
  readonly boundaryId: string;
  readonly protocol: string;
  readonly source: RuntimeScopeBoundarySource;
  readonly exposed: boolean;
}

export interface RuntimeScopeDefinition {
  readonly schemaVersion: 1;
  readonly scopeId: string;
  readonly organizationBasis: OrganizationBasisRef | null;
}

export interface RuntimeScopeBasis {
  readonly scopeId: string;
  readonly throughSeq: number;
  readonly chainDigest: string;
}

export type RuntimeScopeLifecycle = "OPEN" | "CLOSED";

export type RuntimeScopeEventType =
  | "RUNTIME_SCOPE_OPENED"
  | "SCOPE_MEMBER_ADDED"
  | "SCOPE_MEMBER_REMOVED"
  | "SCOPE_PEER_ASSOCIATED"
  | "SCOPE_BOUNDARY_DECLARED"
  // G10-I CF-H-08: explicit, lifecycle-neutral Campaign↔RuntimeScope association.
  | "CAMPAIGN_ASSOCIATED"
  | "CAMPAIGN_DISASSOCIATED"
  | "SCOPE_CLOSED";

/* ------------------------------------------------------------------ *
 * Strict helpers
 * ------------------------------------------------------------------ */

export function asObject(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RuntimeScopeArtifactError(`${what} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function exactKeys(object: Record<string, unknown>, keys: readonly string[], what: string): void {
  for (const key of Object.keys(object)) {
    if (!keys.includes(key)) throw new RuntimeScopeArtifactError(`unknown ${what} field "${key}"`);
  }
  for (const key of keys) {
    if (!Object.hasOwn(object, key)) throw new RuntimeScopeArtifactError(`${what}: field "${key}" is required`);
  }
}

function requireNonNegativeInteger(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new RuntimeScopeArtifactError(`${what} must be a non-negative safe integer`);
  }
  return value;
}

/* ------------------------------------------------------------------ *
 * Parsers
 * ------------------------------------------------------------------ */

export function parseOrganizationBasisRef(raw: unknown, what = "OrganizationBasisRef"): OrganizationBasisRef {
  try {
    return parseOrganizationRef(raw, what);
  } catch (error) {
    throw new RuntimeScopeArtifactError(`${what}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function parseRuntimeScopeMember(raw: unknown, what = "RuntimeScopeMember"): RuntimeScopeMember {
  const object = asObject(raw, what);
  if (object.kind === "activation") {
    exactKeys(object, ["kind", "activation"], what);
    return Object.freeze({ kind: "activation" as const, activation: parseActivationRef(object.activation, `${what}.activation`) });
  }
  if (object.kind === "child_scope") {
    exactKeys(object, ["kind", "scope"], what);
    return Object.freeze({ kind: "child_scope" as const, scope: parseRuntimeScopeRef(object.scope, `${what}.scope`) });
  }
  throw new RuntimeScopeArtifactError(`${what}.kind must be "activation" or "child_scope"`);
}

export function parseRuntimeScopeBoundarySource(raw: unknown, what = "RuntimeScopeBoundarySource"): RuntimeScopeBoundarySource {
  const object = asObject(raw, what);
  if (object.kind === "organization_interaction") {
    exactKeys(object, ["kind", "interactionId"], what);
    return Object.freeze({ kind: "organization_interaction" as const, interactionId: requireStableId(object.interactionId, `${what}.interactionId`) });
  }
  if (object.kind === "runtime_declared") {
    exactKeys(object, ["kind", "declarationId"], what);
    return Object.freeze({ kind: "runtime_declared" as const, declarationId: requireStableId(object.declarationId, `${what}.declarationId`) });
  }
  throw new RuntimeScopeArtifactError(`${what}.kind must be "organization_interaction" or "runtime_declared"`);
}

export function parseRuntimeScopeBoundary(raw: unknown, what = "RuntimeScopeBoundary"): RuntimeScopeBoundary {
  const object = asObject(raw, what);
  exactKeys(object, ["boundaryId", "protocol", "source", "exposed"], what);
  if (typeof object.exposed !== "boolean") throw new RuntimeScopeArtifactError(`${what}.exposed must be a boolean`);
  return Object.freeze({
    boundaryId: requireStableId(object.boundaryId, `${what}.boundaryId`),
    protocol: requireNonEmpty(object.protocol, `${what}.protocol`),
    source: parseRuntimeScopeBoundarySource(object.source, `${what}.source`),
    exposed: object.exposed,
  });
}

export function parseRuntimeScopeDefinition(raw: unknown, what = "RuntimeScopeDefinition"): RuntimeScopeDefinition {
  const object = asObject(raw, what);
  exactKeys(object, ["schemaVersion", "scopeId", "organizationBasis"], what);
  if (object.schemaVersion !== 1) throw new RuntimeScopeArtifactError(`${what}.schemaVersion must be 1`);
  const organizationBasis =
    object.organizationBasis === null || object.organizationBasis === undefined
      ? null
      : parseOrganizationBasisRef(object.organizationBasis, `${what}.organizationBasis`);
  return Object.freeze({
    schemaVersion: 1 as const,
    scopeId: requireStableId(object.scopeId, `${what}.scopeId`),
    organizationBasis,
  });
}

export function materializeRuntimeScopeDefinition(input: {
  readonly scopeId: string;
  readonly organizationBasis?: OrganizationBasisRef | null | undefined;
}): RuntimeScopeDefinition {
  return Object.freeze({
    schemaVersion: 1 as const,
    scopeId: requireStableId(input.scopeId, "scopeId"),
    organizationBasis: input.organizationBasis === undefined || input.organizationBasis === null ? null : parseOrganizationBasisRef(input.organizationBasis, "organizationBasis"),
  });
}

export function parseRuntimeScopeBasis(raw: unknown, what = "RuntimeScopeBasis"): RuntimeScopeBasis {
  const object = asObject(raw, what);
  exactKeys(object, ["scopeId", "throughSeq", "chainDigest"], what);
  return Object.freeze({
    scopeId: requireStableId(object.scopeId, `${what}.scopeId`),
    throughSeq: requireNonNegativeInteger(object.throughSeq, `${what}.throughSeq`),
    chainDigest: requireNonEmpty(object.chainDigest, `${what}.chainDigest`),
  });
}

/* ------------------------------------------------------------------ *
 * Event payload parsers
 * ------------------------------------------------------------------ */

export type RuntimeScopeEventPayloadParser = (payload: unknown) => unknown;
export type RuntimeScopeEventParsers = Readonly<Record<string, RuntimeScopeEventPayloadParser>>;

export const RUNTIME_SCOPE_EVENT_PARSERS: RuntimeScopeEventParsers = Object.freeze({
  RUNTIME_SCOPE_OPENED: (payload: unknown) => {
    const object = asObject(payload, "RUNTIME_SCOPE_OPENED");
    exactKeys(object, ["definition"], "RUNTIME_SCOPE_OPENED");
    return Object.freeze({ definition: parseRuntimeScopeDefinition(object.definition) });
  },
  SCOPE_MEMBER_ADDED: (payload: unknown) => {
    const object = asObject(payload, "SCOPE_MEMBER_ADDED");
    exactKeys(object, ["member"], "SCOPE_MEMBER_ADDED");
    return Object.freeze({ member: parseRuntimeScopeMember(object.member) });
  },
  SCOPE_MEMBER_REMOVED: (payload: unknown) => {
    const object = asObject(payload, "SCOPE_MEMBER_REMOVED");
    exactKeys(object, ["memberKey", "reason"], "SCOPE_MEMBER_REMOVED");
    return Object.freeze({
      memberKey: requireNonEmpty(object.memberKey, "memberKey"),
      reason: requireNonEmpty(object.reason, "reason"),
    });
  },
  SCOPE_PEER_ASSOCIATED: (payload: unknown) => {
    const object = asObject(payload, "SCOPE_PEER_ASSOCIATED");
    exactKeys(object, ["peer"], "SCOPE_PEER_ASSOCIATED");
    return Object.freeze({ peer: parsePeerRef(object.peer) });
  },
  SCOPE_BOUNDARY_DECLARED: (payload: unknown) => {
    const object = asObject(payload, "SCOPE_BOUNDARY_DECLARED");
    exactKeys(object, ["boundary"], "SCOPE_BOUNDARY_DECLARED");
    return Object.freeze({ boundary: parseRuntimeScopeBoundary(object.boundary) });
  },
  CAMPAIGN_ASSOCIATED: (payload: unknown) => {
    const object = asObject(payload, "CAMPAIGN_ASSOCIATED");
    exactKeys(object, ["campaignId"], "CAMPAIGN_ASSOCIATED");
    return Object.freeze({ campaignId: requireStableId(object.campaignId, "campaignId") });
  },
  CAMPAIGN_DISASSOCIATED: (payload: unknown) => {
    const object = asObject(payload, "CAMPAIGN_DISASSOCIATED");
    exactKeys(object, ["campaignId", "reason"], "CAMPAIGN_DISASSOCIATED");
    return Object.freeze({
      campaignId: requireStableId(object.campaignId, "campaignId"),
      reason: requireNonEmpty(object.reason, "reason"),
    });
  },
  SCOPE_CLOSED: (payload: unknown) => {
    const object = asObject(payload, "SCOPE_CLOSED");
    exactKeys(object, ["reason"], "SCOPE_CLOSED");
    return Object.freeze({ reason: requireNonEmpty(object.reason, "reason") });
  },
});

/** Integrity/freshness chain digest for one scope's append-only history. */
export function runtimeScopeChainDigest(input: {
  readonly scopeId: string;
  readonly seq: number;
  readonly eventId: string;
  readonly type: string;
  readonly payload: unknown;
  readonly previousChainDigest: string | null;
}): string {
  return canonicalDigest({
    domain: RUNTIME_SCOPE_CHAIN_DOMAIN,
    scopeId: input.scopeId,
    seq: input.seq,
    eventId: input.eventId,
    type: input.type,
    payload: input.payload,
    previous: input.previousChainDigest,
  });
}

/**
 * The external Holon projection digest. It covers ONLY the external surface
 * (scope ref, lifecycle, peer, boundary, organization basis) — never internal
 * constituents — so internal reconfiguration cannot change external identity.
 */
export function holonProjectionDigest(input: {
  readonly scope: RuntimeScopeRef;
  readonly lifecycle: RuntimeScopeLifecycle;
  readonly peer: PeerRef | null;
  readonly boundary: RuntimeScopeBoundary | null;
  readonly organizationBasis: OrganizationBasisRef | null;
}): string {
  return canonicalDigest({
    domain: RUNTIME_SCOPE_HOLON_DOMAIN,
    scope: materializeRuntimeScopeRef({ scopeId: input.scope.scopeId }),
    lifecycle: input.lifecycle,
    peer: input.peer === null ? null : { schemaVersion: input.peer.schemaVersion, peerId: input.peer.peerId },
    boundary: input.boundary,
    organizationBasis: input.organizationBasis,
  });
}
