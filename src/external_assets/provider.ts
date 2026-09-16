/**
 * G10-AE §7/§8/§9 — the external provider DEFINITION and the READ-ONLY port.
 *
 *   ProviderDefinition = versioned deployment CONFIG, never asset truth
 *   SearchResult       != StableAssetRef        (a hit is EPHEMERAL)
 *   SearchRanking      != Applicability         (provider ranking only, never
 *   SemanticMatch      != Applicability          quality / truth / applicability)
 *   ExternalAsset      != ProjectContext        (nothing here is injected)
 *   ProviderUnavailable != AssetFalse
 *
 * The read port can only read. It owns no store, writes nothing into Palimpsest
 * and can never create a project reference: `search → inspect → exact
 * digest-bound snapshot` is the only route to durability, and the durable step
 * happens in `service.ts` (§10/§11) where an EXPLICIT caller commits it.
 *
 * §6: a provider that cannot expose a stable digest/revision may still be
 * searched and inspected, but a durable reference/import is DENIED with reason
 * `stable_revision_unavailable`.
 */

import { createHash } from "node:crypto";

import { canonicalDigest } from "../schema/canonical.js";

import {
  eaCompareText,
  eaDigest,
  eaEnum,
  eaFail,
  eaKeys,
  eaObject,
  eaOptionalString,
  eaStableId,
  eaString,
  eaStringArray,
  eaStringRecord,
  parseExternalAssetStableRef,
  type ExternalAssetStableRef,
} from "./refs.js";

/* ------------------------------------------------------------------ *
 * §7 Capabilities (exactly these four)
 * ------------------------------------------------------------------ */

export const EXTERNAL_ASSET_PROVIDER_CAPABILITIES = [
  "SEARCH",
  "INSPECT",
  "MATERIALIZE_TEXT",
  "PUBLISH",
] as const;
export type ExternalAssetProviderCapability =
  (typeof EXTERNAL_ASSET_PROVIDER_CAPABILITIES)[number];

/* ------------------------------------------------------------------ *
 * §7 Provider definition — digest-bound versioned config
 * ------------------------------------------------------------------ */

export const EXTERNAL_ASSET_PROVIDER_DEFINITION_DOMAIN =
  "palimpsest.external-assets.provider-definition.v1";

export interface ExternalAssetProviderDefinition {
  readonly providerId: string;
  readonly version: string;
  readonly displayName: string;
  readonly capabilities: readonly ExternalAssetProviderCapability[];
  readonly protocolDigest: string;
  readonly digest: string;
}

export function externalAssetProviderDefinitionDigestOf(
  input: Omit<ExternalAssetProviderDefinition, "digest">,
): string {
  return canonicalDigest({ domain: EXTERNAL_ASSET_PROVIDER_DEFINITION_DOMAIN, definition: input });
}

export function materializeExternalAssetProviderDefinition(input: {
  readonly providerId: string;
  readonly version: string;
  readonly displayName: string;
  readonly capabilities: readonly ExternalAssetProviderCapability[];
  readonly protocolDigest: string;
}): ExternalAssetProviderDefinition {
  const capabilities = normalizeCapabilities(input.capabilities, "capabilities");
  const content: Omit<ExternalAssetProviderDefinition, "digest"> = {
    providerId: eaStableId(input.providerId, "providerId"),
    version: eaString(input.version, "version"),
    displayName: eaString(input.displayName, "displayName"),
    capabilities,
    protocolDigest: eaDigest(input.protocolDigest, "protocolDigest"),
  };
  return Object.freeze({ ...content, digest: externalAssetProviderDefinitionDigestOf(content) });
}

export function parseExternalAssetProviderDefinition(
  raw: unknown,
  what = "ExternalAssetProviderDefinition",
): ExternalAssetProviderDefinition {
  const object = eaObject(raw, what);
  eaKeys(
    object,
    ["providerId", "version", "displayName", "capabilities", "protocolDigest", "digest"],
    ["providerId", "version", "displayName", "capabilities", "protocolDigest", "digest"],
    what,
  );
  if (!Array.isArray(object.capabilities)) {
    eaFail("invalid_value", `${what}.capabilities must be an array`);
  }
  const capabilities = normalizeCapabilities(
    object.capabilities.map((item) =>
      eaEnum(item, EXTERNAL_ASSET_PROVIDER_CAPABILITIES, `${what}.capabilities[]`),
    ),
    `${what}.capabilities`,
  );
  const content: Omit<ExternalAssetProviderDefinition, "digest"> = {
    providerId: eaStableId(object.providerId, `${what}.providerId`),
    version: eaString(object.version, `${what}.version`),
    displayName: eaString(object.displayName, `${what}.displayName`),
    capabilities,
    protocolDigest: eaDigest(object.protocolDigest, `${what}.protocolDigest`),
  };
  const digest = eaDigest(object.digest, `${what}.digest`);
  if (externalAssetProviderDefinitionDigestOf(content) !== digest) {
    eaFail("invalid_value", `${what}.digest does not match its content`);
  }
  return Object.freeze({ ...content, digest });
}

function normalizeCapabilities(
  value: readonly string[],
  what: string,
): readonly ExternalAssetProviderCapability[] {
  const seen = new Set<string>();
  for (const item of value) {
    const capability = eaEnum(item, EXTERNAL_ASSET_PROVIDER_CAPABILITIES, `${what}[]`);
    if (seen.has(capability)) eaFail("invalid_value", `${what}: duplicate capability "${capability}"`);
    seen.add(capability);
  }
  // Sorted for a deterministic definition digest, independent of declaration order.
  return Object.freeze(
    [...seen].sort(eaCompareText) as readonly ExternalAssetProviderCapability[],
  );
}

export function providerSupports(
  definition: ExternalAssetProviderDefinition,
  capability: ExternalAssetProviderCapability,
): boolean {
  return definition.capabilities.includes(capability);
}

/* ------------------------------------------------------------------ *
 * §8 Search (EPHEMERAL — never persisted, never project context)
 * ------------------------------------------------------------------ */

export interface ExternalAssetSearchQuery {
  readonly text: string;
  readonly limit?: number | undefined;
  readonly assetTypes?: readonly string[] | undefined;
  readonly cursor?: string | undefined;
}

export interface ExternalAssetSearchHit {
  readonly providerId: string;
  readonly assetId: string;
  /** Provider-owned asset type. It never auto-maps to a Palimpsest kind (§5/§14). */
  readonly assetType: string;
  readonly title: string;
  readonly summary?: string | undefined;
  /** Provider RANKING only. Never applicability, quality or truth. */
  readonly searchScore?: number | undefined;
  /**
   * A HINT, not the referenced revision: it is what the provider's index
   * currently points at. It is never sufficient for a durable reference — that
   * requires an exact `inspect` (§8/§9).
   */
  readonly latestDigestHint?: string | undefined;
}

export interface ExternalAssetSearchPage {
  readonly providerId: string;
  readonly hits: readonly ExternalAssetSearchHit[];
  readonly nextCursor?: string | undefined;
}

export function parseExternalAssetSearchHit(
  raw: unknown,
  what = "ExternalAssetSearchHit",
): ExternalAssetSearchHit {
  const object = eaObject(raw, what);
  eaKeys(
    object,
    ["providerId", "assetId", "assetType", "title", "summary", "searchScore", "latestDigestHint"],
    ["providerId", "assetId", "assetType", "title"],
    what,
  );
  const summary = eaOptionalString(object.summary, `${what}.summary`);
  const latestDigestHint =
    object.latestDigestHint === undefined
      ? undefined
      : eaDigest(object.latestDigestHint, `${what}.latestDigestHint`);
  const searchScore =
    object.searchScore === undefined ? undefined : eaScore(object.searchScore, `${what}.searchScore`);
  return Object.freeze({
    providerId: eaStableId(object.providerId, `${what}.providerId`),
    assetId: eaStableId(object.assetId, `${what}.assetId`),
    assetType: eaString(object.assetType, `${what}.assetType`),
    title: eaString(object.title, `${what}.title`),
    ...(summary === undefined ? {} : { summary }),
    ...(searchScore === undefined ? {} : { searchScore }),
    ...(latestDigestHint === undefined ? {} : { latestDigestHint }),
  });
}

export function parseExternalAssetSearchPage(
  raw: unknown,
  what = "ExternalAssetSearchPage",
): ExternalAssetSearchPage {
  const object = eaObject(raw, what);
  eaKeys(object, ["providerId", "hits", "nextCursor"], ["providerId", "hits"], what);
  if (!Array.isArray(object.hits)) eaFail("invalid_value", `${what}.hits must be an array`);
  const nextCursor = eaOptionalString(object.nextCursor, `${what}.nextCursor`);
  return Object.freeze({
    providerId: eaStableId(object.providerId, `${what}.providerId`),
    hits: Object.freeze(object.hits.map((hit) => parseExternalAssetSearchHit(hit, `${what}.hits[]`))),
    ...(nextCursor === undefined ? {} : { nextCursor }),
  });
}

function eaScore(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    eaFail("invalid_value", `${what} must be a finite number`);
  }
  return value;
}

/* ------------------------------------------------------------------ *
 * §9 Snapshot (descriptive; grants nothing) and the exact-digest inspection
 * ------------------------------------------------------------------ */

export interface ExternalAssetInspectRequest {
  readonly providerId: string;
  readonly assetId: string;
  /**
   * The EXACT digest to resolve. When present, a provider that answers with a
   * different revision is treated as UNAVAILABLE (`requested_digest_mismatch`):
   * the latest revision never silently replaces the requested one (§9/§12).
   */
  readonly contentDigest?: string | undefined;
}

export interface ExternalAssetSnapshot {
  readonly ref: ExternalAssetStableRef;
  readonly assetType: string;
  readonly title: string;
  readonly summary?: string | undefined;
  readonly tags: readonly string[];
  /** Descriptive metadata. It grants no authority and is never copied by a reference. */
  readonly metadata: Readonly<Record<string, string>>;
  readonly sourceLocator?: string | undefined;
}

export const EXTERNAL_ASSET_INSPECTION_UNAVAILABLE_REASONS = [
  "not_found",
  "requested_digest_mismatch",
  "stable_revision_unavailable",
  "provider_unavailable",
] as const;
export type ExternalAssetInspectionUnavailableReason =
  (typeof EXTERNAL_ASSET_INSPECTION_UNAVAILABLE_REASONS)[number];

export type ExternalAssetInspection =
  | { readonly status: "AVAILABLE"; readonly snapshot: ExternalAssetSnapshot }
  | {
      readonly status: "UNAVAILABLE";
      readonly providerId: string;
      readonly assetId: string;
      readonly requestedDigest?: string | undefined;
      readonly reason: ExternalAssetInspectionUnavailableReason;
      readonly detail: string;
    };

export function parseExternalAssetSnapshot(
  raw: unknown,
  what = "ExternalAssetSnapshot",
): ExternalAssetSnapshot {
  const object = eaObject(raw, what);
  eaKeys(
    object,
    ["ref", "assetType", "title", "summary", "tags", "metadata", "sourceLocator"],
    ["ref", "assetType", "title", "tags", "metadata"],
    what,
  );
  const summary = eaOptionalString(object.summary, `${what}.summary`);
  const sourceLocator = eaOptionalString(object.sourceLocator, `${what}.sourceLocator`);
  if (!Array.isArray(object.tags)) eaFail("invalid_value", `${what}.tags must be an array`);
  return Object.freeze({
    ref: parseExternalAssetStableRef(object.ref, `${what}.ref`),
    assetType: eaString(object.assetType, `${what}.assetType`),
    title: eaString(object.title, `${what}.title`),
    ...(summary === undefined ? {} : { summary }),
    tags: eaStringArray(object.tags, `${what}.tags`),
    metadata: eaStringRecord(object.metadata, `${what}.metadata`),
    ...(sourceLocator === undefined ? {} : { sourceLocator }),
  });
}

export function parseExternalAssetInspection(
  raw: unknown,
  what = "ExternalAssetInspection",
): ExternalAssetInspection {
  const object = eaObject(raw, what);
  const status = eaEnum(object.status, ["AVAILABLE", "UNAVAILABLE"] as const, `${what}.status`);
  if (status === "AVAILABLE") {
    eaKeys(object, ["status", "snapshot"], ["status", "snapshot"], what);
    return Object.freeze({
      status: "AVAILABLE" as const,
      snapshot: parseExternalAssetSnapshot(object.snapshot, `${what}.snapshot`),
    });
  }
  eaKeys(
    object,
    ["status", "providerId", "assetId", "requestedDigest", "reason", "detail"],
    ["status", "providerId", "assetId", "reason", "detail"],
    what,
  );
  const requestedDigest =
    object.requestedDigest === undefined
      ? undefined
      : eaDigest(object.requestedDigest, `${what}.requestedDigest`);
  return Object.freeze({
    status: "UNAVAILABLE" as const,
    providerId: eaStableId(object.providerId, `${what}.providerId`),
    assetId: eaStableId(object.assetId, `${what}.assetId`),
    ...(requestedDigest === undefined ? {} : { requestedDigest }),
    reason: eaEnum(object.reason, EXTERNAL_ASSET_INSPECTION_UNAVAILABLE_REASONS, `${what}.reason`),
    detail: eaString(object.detail, `${what}.detail`),
  });
}

export function unavailableInspection(input: {
  readonly providerId: string;
  readonly assetId: string;
  readonly contentDigest?: string | undefined;
  readonly reason: ExternalAssetInspectionUnavailableReason;
  readonly detail: string;
}): ExternalAssetInspection {
  return Object.freeze({
    status: "UNAVAILABLE" as const,
    providerId: input.providerId,
    assetId: input.assetId,
    ...(input.contentDigest === undefined ? {} : { requestedDigest: input.contentDigest }),
    reason: input.reason,
    detail: input.detail,
  });
}

/* ------------------------------------------------------------------ *
 * §15 Optional text materialization (the ONLY content-read capability)
 * ------------------------------------------------------------------ */

export const EXTERNAL_ASSET_TEXT_MEDIA_TYPES = ["text/plain", "text/markdown"] as const;
export type ExternalAssetTextMediaType = (typeof EXTERNAL_ASSET_TEXT_MEDIA_TYPES)[number];

export interface ExternalAssetTextMaterialization {
  readonly text: string;
  /** MUST equal the stable ref's `contentDigest` (§15) AND the digest of `text`. */
  readonly contentDigest: string;
  readonly mediaType: ExternalAssetTextMediaType;
}

/**
 * §15/exact-materialization: the digest of the TEXT ITSELF — the sha256 of its
 * UTF-8 bytes, which is what a provider's `contentDigest` is defined to be.
 *
 * This exists so the plane can check the bytes it is about to copy rather than
 * only comparing two provider-supplied values: without it, a provider that
 * returned the referenced digest while handing over DIFFERENT text would import
 * substituted content carrying genuine-looking external provenance (the campaign
 * review demonstrated exactly that). The exact-text rule is part of the provider
 * contract; a provider with a document-level digest must expose its text digest
 * here.
 */
export function externalAssetTextDigestOf(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function parseExternalAssetTextMaterialization(
  raw: unknown,
  what = "ExternalAssetTextMaterialization",
): ExternalAssetTextMaterialization {
  const object = eaObject(raw, what);
  eaKeys(
    object,
    ["text", "contentDigest", "mediaType"],
    ["text", "contentDigest", "mediaType"],
    what,
  );
  if (typeof object.text !== "string" || object.text.length === 0) {
    // An EMPTY materialization is not importable content: it is reported as
    // binary/unavailable rather than silently imported as an empty note.
    eaFail("invalid_value", `${what}.text must be a non-empty string`);
  }
  const contentDigest = eaDigest(object.contentDigest, `${what}.contentDigest`);
  const actual = externalAssetTextDigestOf(object.text);
  if (actual !== contentDigest) {
    eaFail(
      "digest_mismatch",
      `${what}.contentDigest ${contentDigest} is not the digest of the returned text (${actual})`,
    );
  }
  return Object.freeze({
    text: object.text,
    contentDigest,
    mediaType: eaEnum(object.mediaType, EXTERNAL_ASSET_TEXT_MEDIA_TYPES, `${what}.mediaType`),
  });
}

/** §26: an OPTIONAL read-only observability answer, used ONLY to surface newer revisions. */
export interface ExternalAssetLatestRevision {
  readonly assetId: string;
  readonly assetType: string;
  readonly title: string;
  readonly contentDigest: string;
  readonly revisionLabel?: string | undefined;
}

export function parseExternalAssetLatestRevision(
  raw: unknown,
  what = "ExternalAssetLatestRevision",
): ExternalAssetLatestRevision {
  const object = eaObject(raw, what);
  eaKeys(
    object,
    ["assetId", "assetType", "title", "contentDigest", "revisionLabel"],
    ["assetId", "assetType", "title", "contentDigest"],
    what,
  );
  const revisionLabel = eaOptionalString(object.revisionLabel, `${what}.revisionLabel`);
  return Object.freeze({
    assetId: eaStableId(object.assetId, `${what}.assetId`),
    assetType: eaString(object.assetType, `${what}.assetType`),
    title: eaString(object.title, `${what}.title`),
    contentDigest: eaDigest(object.contentDigest, `${what}.contentDigest`),
    ...(revisionLabel === undefined ? {} : { revisionLabel }),
  });
}

/* ------------------------------------------------------------------ *
 * §8 The read port — read-only by construction
 * ------------------------------------------------------------------ */

export interface ExternalAssetLibraryReadPort {
  readonly definition: ExternalAssetProviderDefinition;
  /** Read-only. Returns EPHEMERAL hits; nothing is persisted and nothing mutates. */
  search(query: ExternalAssetSearchQuery): Promise<unknown>;
  /**
   * Read-only. With `contentDigest` set this is an EXACT-digest resolve: an
   * unavailable old digest returns `UNAVAILABLE`, never the latest revision.
   */
  inspect(request: ExternalAssetInspectRequest): Promise<unknown>;
  /**
   * §15 (optional capability `MATERIALIZE_TEXT`): the exact bounded text of one
   * stable ref. `undefined` means the provider cannot materialize it.
   */
  materializeText?(stableRef: ExternalAssetStableRef): Promise<unknown | undefined>;
  /**
   * §26 (OPTIONAL read-only observability extension, NOT one of the four
   * declared capabilities): what revision the provider currently holds for an
   * asset id. It exists so the DERIVED project view can say "a newer revision is
   * available" WITHOUT ever adopting it. Absent ⇒ the derived view reports that
   * newer-revision status is unknown instead of guessing.
   */
  latestRevision?(assetId: string): Promise<unknown | undefined>;
}
