/**
 * G10-K Boundary Memory identity & shared reference vocabulary.
 *
 *   BoundaryWorkspaceId ≠ ThreadId ≠ ContactNeedId ≠ CommitmentId
 *                      ≠ OrganizationDefinitionId ≠ CampaignId ≠ RuntimeScopeId
 *   BoundaryArtifactId  ≠ CandidateDigest ≠ AcceptedRevision
 *
 * Boundaries are EXPLICIT identities: a workspace is opened, never derived from a
 * peer-pair digest (the same pair of peers may hold several independent shared
 * boundaries), and an artifact is a long-lived topic whose *revisions* evolve.
 *
 * The id grammar is the repository-wide stable-identifier grammar, so a boundary
 * id can never collide with a path-like or whitespace-bearing string, and string
 * equality against another id namespace implies no relation whatsoever.
 */

import { isStableIdentifier, normalizeStableIdentifier } from "../schema/identifier.js";
import type { OrganizationDefinitionRef } from "../organization/definition.js";
import { parseOrganizationRef } from "../organization/definition.js";
import type { RuntimeScopeRef } from "../runtime_scope/ref.js";
import { parseRuntimeScopeRef } from "../runtime_scope/ref.js";

export type BoundaryWorkspaceId = string;
export type BoundaryArtifactId = string;

export const BOUNDARY_CONTENT_DIGEST_DOMAIN = "palimpsest.boundary-content.v1";

export class BoundaryArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BoundaryArtifactError";
  }
}

export function bmFail(message: string): never {
  throw new BoundaryArtifactError(message);
}

export function bmObject(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) bmFail(`${what} must be an object`);
  return value as Record<string, unknown>;
}

export function bmExactKeys(object: Record<string, unknown>, keys: readonly string[], what: string): void {
  for (const key of Object.keys(object)) if (!keys.includes(key)) bmFail(`unknown ${what} field "${key}"`);
  for (const key of keys) if (!Object.hasOwn(object, key)) bmFail(`${what}: field "${key}" is required`);
}

export function bmStableId(value: unknown, what: string): string {
  if (typeof value !== "string") bmFail(`${what} must be a string`);
  const normalized = normalizeStableIdentifier(value);
  if (!isStableIdentifier(normalized)) bmFail(`${what} must be a stable identifier`);
  return normalized;
}

export function bmNonEmpty(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim() === "") bmFail(`${what} must be a non-empty string`);
  return value;
}

export function bmDigest(value: unknown, what: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) bmFail(`${what} must be a lowercase 64-hex canonical digest`);
  return value;
}

export function bmNonNegativeInteger(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) bmFail(`${what} must be a non-negative integer`);
  return value;
}

export function bmLiteral<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) bmFail(`${what} must be one of ${allowed.join(", ")}`);
  return value as T;
}

/* ------------------------------------------------------------------ *
 * Typed content references (§22) — provenance/linkage, never authority.
 * ------------------------------------------------------------------ */

export type BoundaryContentRef =
  | { readonly kind: "organization"; readonly ref: OrganizationDefinitionRef }
  | { readonly kind: "runtime_scope"; readonly ref: RuntimeScopeRef }
  | { readonly kind: "campaign"; readonly campaignId: string }
  | { readonly kind: "evidence"; readonly evidenceId: string }
  | { readonly kind: "commitment"; readonly commitmentId: string };

export function parseBoundaryContentRef(raw: unknown, what = "BoundaryContentRef"): BoundaryContentRef {
  const object = bmObject(raw, what);
  if (object.kind === "organization") {
    bmExactKeys(object, ["kind", "ref"], what);
    return Object.freeze({ kind: "organization" as const, ref: parseOrganizationRef(object.ref, `${what}.ref`) });
  }
  if (object.kind === "runtime_scope") {
    bmExactKeys(object, ["kind", "ref"], what);
    return Object.freeze({ kind: "runtime_scope" as const, ref: parseRuntimeScopeRef(object.ref, `${what}.ref`) });
  }
  if (object.kind === "campaign") {
    bmExactKeys(object, ["kind", "campaignId"], what);
    return Object.freeze({ kind: "campaign" as const, campaignId: bmStableId(object.campaignId, `${what}.campaignId`) });
  }
  if (object.kind === "evidence") {
    bmExactKeys(object, ["kind", "evidenceId"], what);
    return Object.freeze({ kind: "evidence" as const, evidenceId: bmStableId(object.evidenceId, `${what}.evidenceId`) });
  }
  if (object.kind === "commitment") {
    bmExactKeys(object, ["kind", "commitmentId"], what);
    return Object.freeze({ kind: "commitment" as const, commitmentId: bmStableId(object.commitmentId, `${what}.commitmentId`) });
  }
  bmFail(`${what}.kind must be one of organization, runtime_scope, campaign, evidence, commitment`);
}

export function boundaryContentRefKey(ref: BoundaryContentRef): string {
  switch (ref.kind) {
    case "organization":
      return `organization:${ref.ref.organizationDefinitionId}@${ref.ref.revision}:${ref.ref.digest}`;
    case "runtime_scope":
      return `runtime_scope:${ref.ref.scopeId}`;
    case "campaign":
      return `campaign:${ref.campaignId}`;
    case "evidence":
      return `evidence:${ref.evidenceId}`;
    case "commitment":
      return `commitment:${ref.commitmentId}`;
  }
}

/** Canonical content reference SET: duplicates rejected, lexical order. */
export function parseBoundaryContentRefs(raw: unknown, what: string): readonly BoundaryContentRef[] {
  if (!Array.isArray(raw)) bmFail(`${what} must be an array`);
  const parsed = raw.map((entry, index) => parseBoundaryContentRef(entry, `${what}[${index}]`));
  const seen = new Set<string>();
  for (const ref of parsed) {
    const key = boundaryContentRefKey(ref);
    if (seen.has(key)) bmFail(`${what}: duplicate reference "${key}" (semantic set)`);
    seen.add(key);
  }
  return Object.freeze([...parsed].sort((a, b) => (boundaryContentRefKey(a) < boundaryContentRefKey(b) ? -1 : 1)));
}

/* ------------------------------------------------------------------ *
 * Artifact type reference
 * ------------------------------------------------------------------ */

export interface BoundaryArtifactTypeRef {
  readonly typeId: string;
  readonly version: string;
}

export function parseBoundaryArtifactTypeRef(raw: unknown, what = "BoundaryArtifactTypeRef"): BoundaryArtifactTypeRef {
  const object = bmObject(raw, what);
  bmExactKeys(object, ["typeId", "version"], what);
  return Object.freeze({
    typeId: bmStableId(object.typeId, `${what}.typeId`),
    version: bmNonEmpty(object.version, `${what}.version`),
  });
}

export function boundaryArtifactTypeRefKey(type: BoundaryArtifactTypeRef): string {
  return `${type.typeId}@${type.version}`;
}

export function boundaryArtifactTypeRefsEqual(a: BoundaryArtifactTypeRef, b: BoundaryArtifactTypeRef): boolean {
  return a.typeId === b.typeId && a.version === b.version;
}

/* ------------------------------------------------------------------ *
 * Workspace / artifact refs
 * ------------------------------------------------------------------ */

export interface BoundaryWorkspaceRef {
  readonly schemaVersion: 1;
  readonly workspaceId: BoundaryWorkspaceId;
}

export function materializeBoundaryWorkspaceRef(input: { readonly workspaceId: string }): BoundaryWorkspaceRef {
  return Object.freeze({ schemaVersion: 1 as const, workspaceId: bmStableId(input.workspaceId, "workspaceId") });
}

export function parseBoundaryWorkspaceRef(raw: unknown, what = "BoundaryWorkspaceRef"): BoundaryWorkspaceRef {
  const object = bmObject(raw, what);
  bmExactKeys(object, ["schemaVersion", "workspaceId"], what);
  if (object.schemaVersion !== 1) bmFail(`${what}.schemaVersion must be 1`);
  return materializeBoundaryWorkspaceRef({ workspaceId: object.workspaceId as string });
}

export function boundaryWorkspaceRefsEqual(a: BoundaryWorkspaceRef, b: BoundaryWorkspaceRef): boolean {
  return a.workspaceId === b.workspaceId;
}

export function boundaryWorkspaceRefKey(ref: BoundaryWorkspaceRef): string {
  return ref.workspaceId;
}

export interface BoundaryArtifactRef {
  readonly schemaVersion: 1;
  readonly workspaceId: BoundaryWorkspaceId;
  readonly artifactId: BoundaryArtifactId;
}

export function materializeBoundaryArtifactRef(input: { readonly workspaceId: string; readonly artifactId: string }): BoundaryArtifactRef {
  return Object.freeze({
    schemaVersion: 1 as const,
    workspaceId: bmStableId(input.workspaceId, "workspaceId"),
    artifactId: bmStableId(input.artifactId, "artifactId"),
  });
}

export function parseBoundaryArtifactRef(raw: unknown, what = "BoundaryArtifactRef"): BoundaryArtifactRef {
  const object = bmObject(raw, what);
  bmExactKeys(object, ["schemaVersion", "workspaceId", "artifactId"], what);
  if (object.schemaVersion !== 1) bmFail(`${what}.schemaVersion must be 1`);
  return materializeBoundaryArtifactRef({ workspaceId: object.workspaceId as string, artifactId: object.artifactId as string });
}

export function boundaryArtifactRefKey(ref: BoundaryArtifactRef): string {
  return `${ref.workspaceId}/${ref.artifactId}`;
}

/* ------------------------------------------------------------------ *
 * Accepted revision ref — the ONLY thing a commitment may scope to.
 * ------------------------------------------------------------------ */

export interface AcceptedBoundaryRevisionRef {
  readonly schemaVersion: 1;
  readonly workspaceId: BoundaryWorkspaceId;
  readonly artifactId: BoundaryArtifactId;
  readonly revision: number;
  readonly candidateDigest: string;
  readonly revisionDigest: string;
}

export function materializeAcceptedBoundaryRevisionRef(input: {
  readonly workspaceId: string;
  readonly artifactId: string;
  readonly revision: number;
  readonly candidateDigest: string;
  readonly revisionDigest: string;
}): AcceptedBoundaryRevisionRef {
  return Object.freeze({
    schemaVersion: 1 as const,
    workspaceId: bmStableId(input.workspaceId, "workspaceId"),
    artifactId: bmStableId(input.artifactId, "artifactId"),
    revision: bmNonNegativeInteger(input.revision, "revision"),
    candidateDigest: bmDigest(input.candidateDigest, "candidateDigest"),
    revisionDigest: bmDigest(input.revisionDigest, "revisionDigest"),
  });
}

export function parseAcceptedBoundaryRevisionRef(raw: unknown, what = "AcceptedBoundaryRevisionRef"): AcceptedBoundaryRevisionRef {
  const object = bmObject(raw, what);
  bmExactKeys(object, ["schemaVersion", "workspaceId", "artifactId", "revision", "candidateDigest", "revisionDigest"], what);
  if (object.schemaVersion !== 1) bmFail(`${what}.schemaVersion must be 1`);
  return materializeAcceptedBoundaryRevisionRef({
    workspaceId: object.workspaceId as string,
    artifactId: object.artifactId as string,
    revision: bmNonNegativeInteger(object.revision, `${what}.revision`),
    candidateDigest: bmDigest(object.candidateDigest, `${what}.candidateDigest`),
    revisionDigest: bmDigest(object.revisionDigest, `${what}.revisionDigest`),
  });
}

export function acceptedBoundaryRevisionRefsEqual(a: AcceptedBoundaryRevisionRef, b: AcceptedBoundaryRevisionRef): boolean {
  return (
    a.workspaceId === b.workspaceId &&
    a.artifactId === b.artifactId &&
    a.revision === b.revision &&
    a.candidateDigest === b.candidateDigest &&
    a.revisionDigest === b.revisionDigest
  );
}

export function acceptedBoundaryRevisionRefKey(ref: AcceptedBoundaryRevisionRef): string {
  return `${ref.workspaceId}/${ref.artifactId}@${ref.revision}:${ref.revisionDigest}`;
}
