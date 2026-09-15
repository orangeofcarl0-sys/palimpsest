/**
 * G10-T Proof/Evidence plane — reference vocabulary and strict parsing helpers.
 *
 *   Source ≠ Evidence        Evidence ≠ Claim        Claim ≠ Truth
 *   Verification ≠ PublicationAdmission             PublishedClaim ≠ Authority
 *   Freshness ≠ Truth        STALE ≠ FALSE
 *   ReasoningClaimRef ≠ EvidenceClaimRef            VaultBlob ≠ SemanticClaim
 *
 * This module owns ONLY identity-shaped references plus the shared fail-closed
 * parsing helpers every proof-plane artifact uses. It carries no truth, no
 * authority, no scoring, and no encryption/credential claims.
 *
 * `ProofClaimRef` is the schema-versioned stored form. The campaign Evidence
 * plane's `EvidenceClaimRef` is exactly `{ claimId }`; `materializeProofClaimRef`
 * therefore produces that port shape (deliberately WITHOUT `schemaVersion`) so a
 * proof-plane service satisfies `CampaignEvidencePort` byte-for-byte.
 */

import { canonicalDigest, type JsonValue } from "../schema/canonical.js";
import { isStableIdentifier, normalizeStableIdentifier } from "../schema/identifier.js";

export type ProofClaimId = string;

export const PROOF_SOURCE_REF_DOMAIN = "palimpsest.proof.source-ref.v1";
export const PROOF_SOURCE_REVISION_REF_DOMAIN = "palimpsest.proof.source-revision-ref.v1";
export const PROOF_CLAIM_REF_DOMAIN = "palimpsest.proof.claim-ref.v1";

export class ProofAssetError extends Error {
  constructor(
    readonly kind:
      | "malformed_artifact"
      | "unknown_field"
      | "invalid_value"
      | "unknown_schema_version"
      | "unknown_kind",
    message: string,
  ) {
    super(message);
    this.name = "ProofAssetError";
  }
}

export function proofFail(kind: ProofAssetError["kind"], message: string): never {
  throw new ProofAssetError(kind, message);
}

/* ------------------------------------------------------------------ *
 * Strict helpers (fail closed; never an unchecked cast)
 * ------------------------------------------------------------------ */

export function proofObject(raw: unknown, what: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    proofFail("malformed_artifact", `${what} must be an object`);
  }
  return raw as Record<string, unknown>;
}

export function proofKeys(
  object: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
  what: string,
): void {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) proofFail("unknown_field", `${what}: unknown field "${key}"`);
  }
  for (const key of required) {
    if (!Object.hasOwn(object, key) || object[key] === undefined) {
      proofFail("malformed_artifact", `${what}: missing required field "${key}"`);
    }
  }
}

export function proofString(value: unknown, what: string): string {
  if (typeof value !== "string" || value.length === 0) proofFail("invalid_value", `${what} must be a non-empty string`);
  return value;
}

export function proofNonEmpty(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim() === "") proofFail("invalid_value", `${what} must be a non-empty string`);
  return value;
}

export function proofOptionalString(value: unknown, what: string): string | undefined {
  return value === undefined ? undefined : proofString(value, what);
}

export function proofBool(value: unknown, what: string): boolean {
  if (typeof value !== "boolean") proofFail("invalid_value", `${what} must be a boolean`);
  return value;
}

export function proofEnum<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    proofFail("unknown_kind", `${what} must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}

export function proofNonNegInt(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    proofFail("invalid_value", `${what} must be a non-negative safe integer`);
  }
  return value;
}

export function proofDigestHex(value: unknown, what: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    proofFail("invalid_value", `${what} must be a canonical sha256 digest`);
  }
  return value;
}

export function proofStableId(value: unknown, what: string): string {
  if (typeof value !== "string") proofFail("invalid_value", `${what} must be a string`);
  const normalized = normalizeStableIdentifier(value);
  if (!isStableIdentifier(normalized)) proofFail("invalid_value", `${what} must be a stable identifier`);
  return normalized;
}

/** A strict `Record<string,string>` — no nested values, no non-string leaves. */
export function proofStringRecord(value: unknown, what: string): Readonly<Record<string, string>> {
  const object = proofObject(value, what);
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(object)) {
    if (key.length === 0) proofFail("invalid_value", `${what}: keys must be non-empty`);
    if (typeof item !== "string") proofFail("invalid_value", `${what}.${key} must be a string`);
    out[key] = item;
  }
  return Object.freeze(out);
}

export function proofOptionalStringRecord(value: unknown, what: string): Readonly<Record<string, string>> {
  return value === undefined ? Object.freeze({} as Record<string, string>) : proofStringRecord(value, what);
}

/** Strict canonical-JSON value: safe-integer numbers only, no undefined/NaN. */
export function proofJsonValue(value: unknown, what: string): JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) proofFail("invalid_value", `${what} must be a safe-integer JSON number`);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => proofJsonValue(entry, `${what}[${index}]`));
  }
  if (typeof value === "object" && value !== null && !(value instanceof Date) && !(value instanceof Uint8Array)) {
    const out: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = proofJsonValue(item, `${what}.${key}`);
    }
    return out;
  }
  proofFail("invalid_value", `${what} must be a canonical JSON value`);
}

/** Unique, sorted, frozen list of stable evidence ids. */
export function proofEvidenceIdArray(value: unknown, what: string): readonly string[] {
  if (!Array.isArray(value)) proofFail("invalid_value", `${what} must be an array`);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const id = proofStableId(item, `${what}[]`);
    if (seen.has(id)) proofFail("invalid_value", `${what}: duplicate value "${id}"`);
    seen.add(id);
    out.push(id);
  }
  return Object.freeze(out);
}

export function proofRefDigest(domain: string, digest: string, prefix: string): string {
  return `${prefix}-${canonicalDigest({ domain, digest }).slice(0, 32)}`;
}

/**
 * Wrap an artifact parser in a single-key event-payload envelope: EXACTLY one
 * top-level key is allowed (the artifact name) and it is required. Mirrors the
 * OrganizationMemory chain idiom.
 */
export function proofSingleKeyParser(
  key: string,
  parse: (raw: unknown, what?: string) => unknown,
): (payload: unknown) => unknown {
  return (payload: unknown): unknown => {
    const object = proofObject(payload, key);
    const keys = Object.keys(object);
    for (const candidate of keys) {
      if (candidate !== key) proofFail("unknown_field", `${key} event payload has unknown field "${candidate}"`);
    }
    if (keys.length !== 1 || !Object.hasOwn(object, key) || object[key] === undefined) {
      proofFail("malformed_artifact", `${key} event payload must carry exactly the "${key}" field`);
    }
    return Object.freeze({ [key]: parse(object[key], key) });
  };
}

/* ------------------------------------------------------------------ *
 * Source refs
 * ------------------------------------------------------------------ */

export interface ProofSourceRef {
  readonly schemaVersion: 1;
  readonly sourceId: string;
}

export function materializeProofSourceRef(input: { readonly sourceId: string }): ProofSourceRef {
  return Object.freeze({ schemaVersion: 1 as const, sourceId: proofStableId(input.sourceId, "sourceId") });
}

export function parseProofSourceRef(raw: unknown, what = "ProofSourceRef"): ProofSourceRef {
  const object = proofObject(raw, what);
  proofKeys(object, ["schemaVersion", "sourceId"], ["schemaVersion", "sourceId"], what);
  if (object.schemaVersion !== 1) proofFail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  return materializeProofSourceRef({ sourceId: object.sourceId as string });
}

export interface ProofSourceRevisionRef {
  readonly schemaVersion: 1;
  readonly sourceId: string;
  readonly revision: number;
  readonly contentDigest: string;
}

export function materializeProofSourceRevisionRef(input: {
  readonly sourceId: string;
  readonly revision: number;
  readonly contentDigest: string;
}): ProofSourceRevisionRef {
  return Object.freeze({
    schemaVersion: 1 as const,
    sourceId: proofStableId(input.sourceId, "sourceId"),
    revision: proofNonNegInt(input.revision, "revision"),
    contentDigest: proofDigestHex(input.contentDigest, "contentDigest"),
  });
}

export function parseProofSourceRevisionRef(raw: unknown, what = "ProofSourceRevisionRef"): ProofSourceRevisionRef {
  const object = proofObject(raw, what);
  proofKeys(object, ["schemaVersion", "sourceId", "revision", "contentDigest"], ["schemaVersion", "sourceId", "revision", "contentDigest"], what);
  if (object.schemaVersion !== 1) proofFail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  return materializeProofSourceRevisionRef({
    sourceId: object.sourceId as string,
    revision: object.revision as number,
    contentDigest: object.contentDigest as string,
  });
}

export function proofSourceRevisionRefsEqual(a: ProofSourceRevisionRef, b: ProofSourceRevisionRef): boolean {
  return a.sourceId === b.sourceId && a.revision === b.revision && a.contentDigest === b.contentDigest;
}

export function proofSourceRevisionRefKey(ref: ProofSourceRevisionRef): string {
  return `${ref.sourceId}\u0000${ref.revision}\u0000${ref.contentDigest}`;
}

/* ------------------------------------------------------------------ *
 * Claim refs
 * ------------------------------------------------------------------ */

/** Schema-versioned stored claim reference. */
export interface ProofClaimRef {
  readonly schemaVersion: 1;
  readonly claimId: ProofClaimId;
}

/**
 * The port-shaped claim reference consumed by `CampaignEvidencePort` (and by the
 * campaign's `EvidenceClaimRef` parser, which accepts EXACTLY `{ claimId }`).
 */
export interface ProofClaimPortRef {
  readonly claimId: ProofClaimId;
}

export function parseProofClaimPortRef(raw: unknown, what = "ProofClaimRef"): ProofClaimPortRef {
  const object = proofObject(raw, what);
  proofKeys(object, ["claimId"], ["claimId"], what);
  return Object.freeze({ claimId: proofStableId(object.claimId, `${what}.claimId`) });
}

/**
 * Produce the campaign-port claim reference: `{ claimId }` with NO `schemaVersion`.
 * This is what `CampaignEvidencePort` requires; `parseProofClaimRef` handles the
 * schema-versioned stored form separately.
 */
export function materializeProofClaimRef(input: { readonly claimId: string }): ProofClaimPortRef {
  return Object.freeze({ claimId: proofStableId(input.claimId, "claimId") });
}

export function parseProofClaimRef(raw: unknown, what = "ProofClaimRef"): ProofClaimRef {
  const object = proofObject(raw, what);
  proofKeys(object, ["schemaVersion", "claimId"], ["schemaVersion", "claimId"], what);
  if (object.schemaVersion !== 1) proofFail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  return Object.freeze({ schemaVersion: 1 as const, claimId: proofStableId(object.claimId, `${what}.claimId`) });
}

/**
 * Accept either stored form (`{ schemaVersion, claimId }`) or port form
 * (`{ claimId }`) and normalize to the port shape. Used only for embedded
 * dependency/claim references inside proof-plane artifacts.
 */
export function parseProofClaimRefLike(raw: unknown, what = "ProofClaimRef"): ProofClaimPortRef {
  const object = proofObject(raw, what);
  if (Object.hasOwn(object, "schemaVersion")) {
    return materializeProofClaimRef({ claimId: parseProofClaimRef(object, what).claimId });
  }
  return parseProofClaimPortRef(object, what);
}
