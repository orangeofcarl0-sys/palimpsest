/**
 * G10-AE §3/§6 — External Asset Library Bridge: the structural firewalls, the
 * strict value helpers and the ONE durable external reference.
 *
 *   EXTERNAL ASSET FIREWALLS (spec §3, encoded here and structurally true):
 *
 *   ExternalAsset != ProjectAsset      ExternalAsset != ProjectContext
 *   ExternalAsset != WorkEvidence      ExternalAsset != ProofEvidence
 *   ExternalAsset != ReasoningClaim    ExternalAsset != Decision
 *   ExternalAsset != Truth
 *
 *   SearchResult != StableAssetRef     SearchRanking != Applicability
 *   SemanticMatch != Applicability
 *
 *   Reference != Import                Import != TruthAdmission
 *   Import != Task                     Import != Evidence
 *
 *   PublicationPreview != Publication  PublicationReceipt != Truth
 *   ExternalLatest != ReferencedRevision
 *   ProviderUnavailable != AssetFalse  Association != Ownership
 *
 *   GlobalAsset != ProjectContext
 *
 * STRUCTURAL ENFORCEMENT (not comments):
 *   - No module of `src/external_assets/` imports the Work, Proof or Reasoning
 *     owners (no `../tools/controller.js`, no `../proof_asset/**`, no
 *     `../reasoning_cell/**`) — the plane cannot mint Work Evidence, Proof
 *     evidence/claims or Reasoning claims because it cannot reach them.
 *   - `ExternalAssetStableRef.contentDigest` is REQUIRED and must be a sha256:
 *     a durable reference structurally cannot omit the digest (§6).
 *   - Every artifact parser is strict: unknown fields fail closed, so no
 *     provider-supplied credential/token field can ride into a persisted record.
 *   - Nothing in this plane is a ProjectContext source: there is no injection
 *     entry point, no startup/top-k hook and no watcher.
 */

import { canonicalDigest } from "../schema/canonical.js";
import { canonicalDatetime } from "../schema/datetime.js";
import { isStableIdentifier, normalizeStableIdentifier } from "../schema/identifier.js";

/* ------------------------------------------------------------------ *
 * Errors — fail closed, always typed
 * ------------------------------------------------------------------ */

export type ExternalAssetErrorKind =
  | "unknown_provider"
  | "capability_not_available"
  | "unknown_project"
  | "invalid_value"
  | "malformed_artifact"
  | "unknown_field"
  | "unknown_kind"
  | "unknown_schema_version"
  | "stable_revision_unavailable"
  | "provider_reported_unavailable"
  | "stale_reference_candidate"
  | "stale_import_candidate"
  | "import_blocked"
  | "content_too_large"
  | "digest_mismatch"
  | "journal_kind_required"
  | "association_store_unavailable"
  | "journal_store_unavailable"
  | "publication_port_unavailable"
  | "publication_not_approved"
  | "publication_rejected"
  | "admission_port_unavailable"
  | "not_a_journal_entry"
  | "publication_outcome_uncertain"
  | "bridge_unavailable";

export class ExternalAssetError extends Error {
  constructor(
    readonly kind: ExternalAssetErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ExternalAssetError";
  }
}

export function eaFail(kind: ExternalAssetErrorKind, message: string): never {
  throw new ExternalAssetError(kind, message);
}

/* ------------------------------------------------------------------ *
 * Strict value helpers (fail closed; never an unchecked cast)
 * ------------------------------------------------------------------ */

export const EXTERNAL_ASSET_SCHEMA_VERSION = 1;

export function eaCompareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function eaObject(raw: unknown, what: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    eaFail("malformed_artifact", `${what} must be an object`);
  }
  return raw as Record<string, unknown>;
}

export function eaKeys(
  object: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
  what: string,
): void {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) eaFail("unknown_field", `${what}: unknown field "${key}"`);
  }
  for (const key of required) {
    if (!Object.hasOwn(object, key) || object[key] === undefined) {
      eaFail("malformed_artifact", `${what}: missing required field "${key}"`);
    }
  }
}

export function eaString(value: unknown, what: string): string {
  if (typeof value !== "string" || value.length === 0) {
    eaFail("invalid_value", `${what} must be a non-empty string`);
  }
  return value;
}

export function eaOptionalString(value: unknown, what: string): string | undefined {
  return value === undefined ? undefined : eaString(value, what);
}

export function eaEnum<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    eaFail("unknown_kind", `${what} must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}

export function eaStableId(value: unknown, what: string): string {
  if (typeof value !== "string") eaFail("invalid_value", `${what} must be a string`);
  const normalized = normalizeStableIdentifier(value);
  if (!isStableIdentifier(normalized)) eaFail("invalid_value", `${what} must be a stable identifier`);
  return normalized;
}

export function eaDigest(value: unknown, what: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    eaFail("invalid_value", `${what} must be a canonical sha256 digest`);
  }
  return value;
}

export function eaTimestamp(value: unknown, what: string): string {
  const text = eaString(value, what);
  try {
    return canonicalDatetime(text);
  } catch (error) {
    return eaFail(
      "invalid_value",
      `${what} must be an ISO-8601 datetime: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function eaPositiveInt(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    eaFail("invalid_value", `${what} must be a positive safe integer`);
  }
  return value;
}

export function eaStringArray(value: unknown, what: string): readonly string[] {
  if (!Array.isArray(value)) eaFail("invalid_value", `${what} must be an array`);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const text = eaString(item, `${what}[]`);
    if (seen.has(text)) eaFail("invalid_value", `${what}: duplicate entry "${text}"`);
    seen.add(text);
    out.push(text);
  }
  return Object.freeze(out);
}

/** Deterministic, sorted, frozen `Record<string,string>` (tags/metadata/headers). */
export function eaStringRecord(value: unknown, what: string): Readonly<Record<string, string>> {
  const object = eaObject(value, what);
  const out: Record<string, string> = {};
  for (const key of Object.keys(object).sort(eaCompareText)) {
    if (key.length === 0) eaFail("invalid_value", `${what}: keys must be non-empty`);
    out[key] = eaString(object[key], `${what}.${key}`);
  }
  return Object.freeze(out);
}

/* ------------------------------------------------------------------ *
 * §6 ExternalAssetStableRef — contentDigest is MANDATORY for durability
 * ------------------------------------------------------------------ */

export const EXTERNAL_ASSET_STABLE_REF_DOMAIN = "palimpsest.external-assets.stable-ref.v1";

export interface ExternalAssetStableRef {
  readonly schemaVersion: 1;
  readonly providerId: string;
  readonly assetId: string;
  /** §6: mandatory. A reference without an exact digest is not durable. */
  readonly contentDigest: string;
  /** Provider-owned revision label. Descriptive only; it grants nothing. */
  readonly revisionLabel?: string | undefined;
  readonly refDigest: string;
}

export function externalAssetStableRefDigestOf(
  input: Omit<ExternalAssetStableRef, "refDigest">,
): string {
  return canonicalDigest({ domain: EXTERNAL_ASSET_STABLE_REF_DOMAIN, ref: input });
}

export function materializeExternalAssetStableRef(input: {
  readonly providerId: string;
  readonly assetId: string;
  readonly contentDigest: string;
  readonly revisionLabel?: string | undefined;
}): ExternalAssetStableRef {
  const content: Omit<ExternalAssetStableRef, "refDigest"> = {
    schemaVersion: EXTERNAL_ASSET_SCHEMA_VERSION,
    providerId: eaStableId(input.providerId, "providerId"),
    assetId: eaStableId(input.assetId, "assetId"),
    contentDigest: eaDigest(input.contentDigest, "contentDigest"),
    ...(input.revisionLabel === undefined
      ? {}
      : { revisionLabel: eaString(input.revisionLabel, "revisionLabel") }),
  };
  return Object.freeze({ ...content, refDigest: externalAssetStableRefDigestOf(content) });
}

export function parseExternalAssetStableRef(
  raw: unknown,
  what = "ExternalAssetStableRef",
): ExternalAssetStableRef {
  const object = eaObject(raw, what);
  eaKeys(
    object,
    ["schemaVersion", "providerId", "assetId", "contentDigest", "revisionLabel", "refDigest"],
    ["schemaVersion", "providerId", "assetId", "contentDigest", "refDigest"],
    what,
  );
  if (object.schemaVersion !== EXTERNAL_ASSET_SCHEMA_VERSION) {
    eaFail("unknown_schema_version", `${what}.schemaVersion must be ${EXTERNAL_ASSET_SCHEMA_VERSION}`);
  }
  const revisionLabel = eaOptionalString(object.revisionLabel, `${what}.revisionLabel`);
  const content: Omit<ExternalAssetStableRef, "refDigest"> = {
    schemaVersion: EXTERNAL_ASSET_SCHEMA_VERSION,
    providerId: eaStableId(object.providerId, `${what}.providerId`),
    assetId: eaStableId(object.assetId, `${what}.assetId`),
    contentDigest: eaDigest(object.contentDigest, `${what}.contentDigest`),
    ...(revisionLabel === undefined ? {} : { revisionLabel }),
  };
  const refDigest = eaDigest(object.refDigest, `${what}.refDigest`);
  if (externalAssetStableRefDigestOf(content) !== refDigest) {
    eaFail("invalid_value", `${what}.refDigest does not match its content`);
  }
  return Object.freeze({ ...content, refDigest });
}

/**
 * The canonical identity of one exact external revision. Two stable refs compare
 * equal iff provider, asset AND exact content digest agree — a newer revision of
 * the same asset is deliberately a DIFFERENT key (§12: `ExternalLatest !=
 * ReferencedRevision`).
 */
export function externalAssetStableRefKey(ref: ExternalAssetStableRef): string {
  return `${ref.providerId}/${ref.assetId}@${ref.contentDigest}`;
}
