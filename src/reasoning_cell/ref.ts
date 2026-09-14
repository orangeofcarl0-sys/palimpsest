/**
 * G10-N ReasoningCell identity & shared reference vocabulary.
 *
 *   ReasoningCellId ≠ RuntimeScopeId ≠ CampaignId ≠ BoundaryWorkspaceId
 *                   ≠ OrganizationDefinitionId ≠ PersistentPointId
 *   ReasoningBranchRef ≠ AgentDefinition ≠ PersistentPoint ≠ PeerRef ≠ durable labor point
 *   FrontierBasis ≠ StoreBasis
 *
 * A ReasoningCell is an intra-cell collaborative-cognition archetype with its own stable
 * identity; branches are ephemeral, cell-local search loci whose carrier (an ActivationRef)
 * is attribution only, never branch identity.
 */

import { isStableIdentifier, normalizeStableIdentifier } from "../schema/identifier.js";

export type ReasoningCellId = string;
export type ReasoningBranchId = string;
export type ReasoningClaimId = string;

export const FRONTIER_DIGEST_DOMAIN = "palimpsest.reasoning-frontier.v1";

export class ReasoningCellError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReasoningCellError";
  }
}

export function rcFail(message: string): never {
  throw new ReasoningCellError(message);
}

export function rcObject(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) rcFail(`${what} must be an object`);
  return value as Record<string, unknown>;
}

export function rcExactKeys(object: Record<string, unknown>, keys: readonly string[], what: string): void {
  for (const key of Object.keys(object)) if (!keys.includes(key)) rcFail(`unknown ${what} field "${key}"`);
  for (const key of keys) if (!Object.hasOwn(object, key)) rcFail(`${what}: field "${key}" is required`);
}

export function rcStableId(value: unknown, what: string): string {
  if (typeof value !== "string") rcFail(`${what} must be a string`);
  const normalized = normalizeStableIdentifier(value);
  if (!isStableIdentifier(normalized)) rcFail(`${what} must be a stable identifier`);
  return normalized;
}

export function rcNonEmpty(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim() === "") rcFail(`${what} must be a non-empty string`);
  return value;
}

export function rcDigest(value: unknown, what: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) rcFail(`${what} must be a lowercase 64-hex canonical digest`);
  return value;
}

export function rcLiteral<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) rcFail(`${what} must be one of ${allowed.join(", ")}`);
  return value as T;
}

export function rcNonNegativeInteger(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) rcFail(`${what} must be a non-negative integer`);
  return value;
}

/* ------------------------------------------------------------------ *
 * Policy refs (explicit + versioned)
 * ------------------------------------------------------------------ */

export interface ReasoningPolicyRef {
  readonly policyId: string;
  readonly version: string;
}

export function parseReasoningPolicyRef(raw: unknown, what = "ReasoningPolicyRef"): ReasoningPolicyRef {
  const object = rcObject(raw, what);
  rcExactKeys(object, ["policyId", "version"], what);
  return Object.freeze({ policyId: rcStableId(object.policyId, `${what}.policyId`), version: rcNonEmpty(object.version, `${what}.version`) });
}

/* ------------------------------------------------------------------ *
 * Refs
 * ------------------------------------------------------------------ */

export interface ReasoningCellRef {
  readonly schemaVersion: 1;
  readonly cellId: ReasoningCellId;
}

export function materializeReasoningCellRef(input: { readonly cellId: string }): ReasoningCellRef {
  return Object.freeze({ schemaVersion: 1 as const, cellId: rcStableId(input.cellId, "cellId") });
}

export function parseReasoningCellRef(raw: unknown, what = "ReasoningCellRef"): ReasoningCellRef {
  const object = rcObject(raw, what);
  rcExactKeys(object, ["schemaVersion", "cellId"], what);
  if (object.schemaVersion !== 1) rcFail(`${what}.schemaVersion must be 1`);
  return materializeReasoningCellRef({ cellId: object.cellId as string });
}

export interface ReasoningBranchRef {
  readonly schemaVersion: 1;
  readonly cellId: ReasoningCellId;
  readonly branchId: ReasoningBranchId;
}

export function materializeReasoningBranchRef(input: { readonly cellId: string; readonly branchId: string }): ReasoningBranchRef {
  return Object.freeze({ schemaVersion: 1 as const, cellId: rcStableId(input.cellId, "cellId"), branchId: rcStableId(input.branchId, "branchId") });
}

export function parseReasoningBranchRef(raw: unknown, what = "ReasoningBranchRef"): ReasoningBranchRef {
  const object = rcObject(raw, what);
  rcExactKeys(object, ["schemaVersion", "cellId", "branchId"], what);
  if (object.schemaVersion !== 1) rcFail(`${what}.schemaVersion must be 1`);
  return materializeReasoningBranchRef({ cellId: object.cellId as string, branchId: object.branchId as string });
}

/**
 * Cell-scoped, content-addressed claim identity. `claimId` derives from the semantic
 * `claimDigest`, so two branches proposing the same semantic claim converge on ONE
 * identity; `claimDigest` itself is independent of branch provenance.
 */
export interface ReasoningClaimRef {
  readonly schemaVersion: 1;
  readonly cellId: ReasoningCellId;
  readonly claimId: ReasoningClaimId;
}

export function materializeReasoningClaimRef(input: { readonly cellId: string; readonly claimId: string }): ReasoningClaimRef {
  return Object.freeze({ schemaVersion: 1 as const, cellId: rcStableId(input.cellId, "cellId"), claimId: rcStableId(input.claimId, "claimId") });
}

export function parseReasoningClaimRef(raw: unknown, what = "ReasoningClaimRef"): ReasoningClaimRef {
  const object = rcObject(raw, what);
  rcExactKeys(object, ["schemaVersion", "cellId", "claimId"], what);
  if (object.schemaVersion !== 1) rcFail(`${what}.schemaVersion must be 1`);
  return materializeReasoningClaimRef({ cellId: object.cellId as string, claimId: object.claimId as string });
}

export function reasoningClaimRefsEqual(a: ReasoningClaimRef, b: ReasoningClaimRef): boolean {
  return a.cellId === b.cellId && a.claimId === b.claimId;
}

/* ------------------------------------------------------------------ *
 * Frontier basis — the accepted ACTIVE epistemic state basis (§25/§26)
 * ------------------------------------------------------------------ */

export interface ReasoningFrontierBasis {
  readonly schemaVersion: 1;
  readonly cellId: ReasoningCellId;
  readonly frontierRevision: number;
  readonly frontierDigest: string;
}

export function frontierBasisOf(input: { readonly cellId: string; readonly frontierRevision: number; readonly activeClaimIds: readonly string[] }): ReasoningFrontierBasis {
  const active = [...new Set(input.activeClaimIds)].sort();
  return Object.freeze({
    schemaVersion: 1 as const,
    cellId: rcStableId(input.cellId, "cellId"),
    frontierRevision: input.frontierRevision,
    frontierDigest: canonicalFrontierDigest(input.cellId, input.frontierRevision, active),
  });
}

import { canonicalDigest as canonicalDigestImpl } from "../schema/canonical.js";
function canonicalFrontierDigest(cellId: string, frontierRevision: number, activeClaimIds: readonly string[]): string {
  return canonicalDigestImpl({ domain: FRONTIER_DIGEST_DOMAIN, cellId, frontierRevision, activeClaimIds: [...activeClaimIds].sort() });
}

export function parseReasoningFrontierBasis(raw: unknown, what = "ReasoningFrontierBasis"): ReasoningFrontierBasis {
  const object = rcObject(raw, what);
  rcExactKeys(object, ["schemaVersion", "cellId", "frontierRevision", "frontierDigest"], what);
  if (object.schemaVersion !== 1) rcFail(`${what}.schemaVersion must be 1`);
  return Object.freeze({
    schemaVersion: 1 as const,
    cellId: rcStableId(object.cellId, `${what}.cellId`),
    frontierRevision: rcNonNegativeInteger(object.frontierRevision, `${what}.frontierRevision`),
    frontierDigest: rcDigest(object.frontierDigest, `${what}.frontierDigest`),
  });
}

export function frontierBasesEqual(a: ReasoningFrontierBasis, b: ReasoningFrontierBasis): boolean {
  return a.cellId === b.cellId && a.frontierRevision === b.frontierRevision && a.frontierDigest === b.frontierDigest;
}
