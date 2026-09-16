/**
 * G10-AE §19–§25 — OUTBOUND publication: the exact preview, the SEPARATE
 * admission, and the provider's write capability.
 *
 *   PublicationPreview != Publication     PublicationReceipt != Truth
 *   ProviderUnavailable != AssetFalse     Association != Ownership
 *   ManagementMode != PublicationApproval Ordinary HTTP auth != Approval
 *
 * v1 publishes ONLY a `ProjectJournalEntry` (§19). Work Evidence, Proof
 * sources/claims, Decisions, Attempts, Commitments, Boundary artifacts and
 * verification runs each require their own disclosure/admission semantics and are
 * structurally unreachable from this plane.
 *
 * WHAT LEAVES THE PROJECT — exactly, and only through the preview:
 *   the selected journal entry's `title` and `body`, plus the identity labels
 *   `palimpsest_journal_entry_id` / `_digest` / `palimpsest_journal_kind`.
 * Nothing else: no journal `provenance` prose, no `relatedRefs`, no other
 * journal entry, no project id, no goal, no CoT, no retrieved external content.
 * The preview you approve is byte-for-byte what the governed effect sends.
 */

import { canonicalDigest } from "../schema/canonical.js";

import type { ProjectJournalEntry } from "../project_workspace/journal.js";
import { PROJECT_JOURNAL_KINDS } from "../project_workspace/journal.js";
import type { ProjectJournalKind } from "../project_workspace/journal.js";

import {
  eaDigest,
  eaEnum,
  eaFail,
  eaKeys,
  eaObject,
  eaOptionalString,
  eaStableId,
  eaString,
  eaStringRecord,
  parseExternalAssetStableRef,
  type ExternalAssetStableRef,
} from "./refs.js";
import {
  parseExternalAssetProviderDefinition,
  type ExternalAssetProviderDefinition,
} from "./provider.js";

/* ------------------------------------------------------------------ *
 * §20 Outbound payload — the ONLY bytes that leave, and its digest
 * ------------------------------------------------------------------ */

export const EXTERNAL_ASSET_OUTBOUND_PAYLOAD_DOMAIN =
  "palimpsest.external-assets.publication-payload.v1";
export const EXTERNAL_ASSET_PUBLICATION_PREVIEW_DOMAIN =
  "palimpsest.external-assets.publication-preview.v1";
export const EXTERNAL_ASSET_PUBLICATION_ID_DOMAIN =
  "palimpsest.external-assets.publication-id.v1";

export interface ExternalAssetOutboundPayload {
  readonly providerId: string;
  readonly providerDefinitionDigest: string;
  readonly journalEntryId: string;
  readonly journalEntryDigest: string;
  readonly targetAssetType: string;
  readonly title: string;
  readonly body: string;
  readonly metadata: Readonly<Record<string, string>>;
}

export function externalAssetOutboundPayloadDigestOf(
  payload: ExternalAssetOutboundPayload,
): string {
  return canonicalDigest({ domain: EXTERNAL_ASSET_OUTBOUND_PAYLOAD_DOMAIN, payload });
}

/**
 * The identity labels attached to the published artifact. They are the ONLY
 * metadata that leaves and they are visible in the preview.
 */
export function externalAssetOutboundMetadataOf(
  entry: ProjectJournalEntry,
): Readonly<Record<string, string>> {
  return Object.freeze({
    palimpsest_journal_entry_id: entry.entryId,
    palimpsest_journal_entry_digest: entry.digest,
    palimpsest_journal_kind: entry.kind,
  });
}

/**
 * Reconstruct the exact outbound payload from the LOCAL journal entry. The
 * governed effect calls this same function, so the approved preview and the
 * actual send cannot drift: any difference changes `payloadDigest` and the
 * effect refuses before the provider is ever called.
 */
export function externalAssetOutboundPayloadOf(input: {
  readonly providerId: string;
  readonly providerDefinitionDigest: string;
  readonly targetAssetType: string;
  readonly entry: ProjectJournalEntry;
}): ExternalAssetOutboundPayload {
  return Object.freeze({
    providerId: eaStableId(input.providerId, "providerId"),
    providerDefinitionDigest: eaDigest(
      input.providerDefinitionDigest,
      "providerDefinitionDigest",
    ),
    journalEntryId: eaStableId(input.entry.entryId, "journalEntryId"),
    journalEntryDigest: eaDigest(input.entry.digest, "journalEntryDigest"),
    targetAssetType: eaString(input.targetAssetType, "targetAssetType"),
    title: eaString(input.entry.title, "title"),
    body: eaString(input.entry.body, "body"),
    metadata: externalAssetOutboundMetadataOf(input.entry),
  });
}

/* ------------------------------------------------------------------ *
 * §20 The publication preview
 * ------------------------------------------------------------------ */

export interface ExternalAssetPublicationJournalRef {
  readonly entryId: string;
  readonly kind: ProjectJournalKind;
}

export interface ExternalAssetPublicationPreview {
  readonly schemaVersion: 1;
  readonly publicationId: string;
  /** The versioned provider definition this publication is addressed to. */
  readonly provider: ExternalAssetProviderDefinition;
  readonly projectId: string;
  readonly localJournalRef: ExternalAssetPublicationJournalRef;
  readonly localJournalDigest: string;
  readonly targetAssetType: string;
  readonly outboundTitle: string;
  readonly outboundBody: string;
  readonly outboundMetadata: Readonly<Record<string, string>>;
  readonly payloadDigest: string;
  readonly digest: string;
}

export function externalAssetPublicationIdOf(input: {
  readonly projectId: string;
  readonly providerId: string;
  readonly providerDefinitionDigest: string;
  readonly journalEntryId: string;
  readonly journalEntryDigest: string;
  readonly targetAssetType: string;
  readonly payloadDigest: string;
}): string {
  return `pub-${canonicalDigest({ domain: EXTERNAL_ASSET_PUBLICATION_ID_DOMAIN, publication: input }).slice(0, 32)}`;
}

type PreviewContent = Omit<ExternalAssetPublicationPreview, "publicationId" | "digest">;

function previewDigestOf(input: PreviewContent & { readonly publicationId: string }): string {
  return canonicalDigest({ domain: EXTERNAL_ASSET_PUBLICATION_PREVIEW_DOMAIN, preview: input });
}

export function materializeExternalAssetPublicationPreview(input: {
  readonly provider: ExternalAssetProviderDefinition;
  readonly projectId: string;
  readonly targetAssetType: string;
  readonly entry: ProjectJournalEntry;
}): ExternalAssetPublicationPreview {
  const provider = parseExternalAssetProviderDefinition(input.provider);
  const projectId = eaStableId(input.projectId, "projectId");
  if (input.entry.projectId !== projectId) {
    eaFail(
      "not_a_journal_entry",
      `journal entry "${input.entry.entryId}" belongs to project "${input.entry.projectId}", not "${projectId}"`,
    );
  }
  const targetAssetType = eaString(input.targetAssetType, "targetAssetType");
  const payload = externalAssetOutboundPayloadOf({
    providerId: provider.providerId,
    providerDefinitionDigest: provider.digest,
    targetAssetType,
    entry: input.entry,
  });
  const payloadDigest = externalAssetOutboundPayloadDigestOf(payload);
  const content: PreviewContent = {
    schemaVersion: 1,
    provider,
    projectId,
    localJournalRef: Object.freeze({ entryId: input.entry.entryId, kind: input.entry.kind }),
    localJournalDigest: input.entry.digest,
    targetAssetType,
    outboundTitle: payload.title,
    outboundBody: payload.body,
    outboundMetadata: payload.metadata,
    payloadDigest,
  };
  const publicationId = externalAssetPublicationIdOf({
    projectId,
    providerId: provider.providerId,
    providerDefinitionDigest: provider.digest,
    journalEntryId: input.entry.entryId,
    journalEntryDigest: input.entry.digest,
    targetAssetType,
    payloadDigest,
  });
  const withId = { ...content, publicationId };
  return Object.freeze({ ...withId, digest: previewDigestOf(withId) });
}

export function parseExternalAssetPublicationPreview(
  raw: unknown,
  what = "ExternalAssetPublicationPreview",
): ExternalAssetPublicationPreview {
  const object = eaObject(raw, what);
  eaKeys(
    object,
    [
      "schemaVersion",
      "publicationId",
      "provider",
      "projectId",
      "localJournalRef",
      "localJournalDigest",
      "targetAssetType",
      "outboundTitle",
      "outboundBody",
      "outboundMetadata",
      "payloadDigest",
      "digest",
    ],
    [
      "schemaVersion",
      "publicationId",
      "provider",
      "projectId",
      "localJournalRef",
      "localJournalDigest",
      "targetAssetType",
      "outboundTitle",
      "outboundBody",
      "outboundMetadata",
      "payloadDigest",
      "digest",
    ],
    what,
  );
  if (object.schemaVersion !== 1) {
    eaFail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  }
  const refObject = eaObject(object.localJournalRef, `${what}.localJournalRef`);
  eaKeys(refObject, ["entryId", "kind"], ["entryId", "kind"], `${what}.localJournalRef`);
  const content: PreviewContent = {
    schemaVersion: 1,
    provider: parseExternalAssetProviderDefinition(object.provider, `${what}.provider`),
    projectId: eaStableId(object.projectId, `${what}.projectId`),
    localJournalRef: Object.freeze({
      entryId: eaStableId(refObject.entryId, `${what}.localJournalRef.entryId`),
      kind: eaEnum(refObject.kind, PROJECT_JOURNAL_KINDS, `${what}.localJournalRef.kind`),
    }),
    localJournalDigest: eaDigest(object.localJournalDigest, `${what}.localJournalDigest`),
    targetAssetType: eaString(object.targetAssetType, `${what}.targetAssetType`),
    outboundTitle: eaString(object.outboundTitle, `${what}.outboundTitle`),
    outboundBody: eaString(object.outboundBody, `${what}.outboundBody`),
    outboundMetadata: eaStringRecord(object.outboundMetadata, `${what}.outboundMetadata`),
    payloadDigest: eaDigest(object.payloadDigest, `${what}.payloadDigest`),
  };
  const publicationId = eaString(object.publicationId, `${what}.publicationId`);
  const expectedPublicationId = externalAssetPublicationIdOf({
    projectId: content.projectId,
    providerId: content.provider.providerId,
    providerDefinitionDigest: content.provider.digest,
    journalEntryId: content.localJournalRef.entryId,
    journalEntryDigest: content.localJournalDigest,
    targetAssetType: content.targetAssetType,
    payloadDigest: content.payloadDigest,
  });
  if (expectedPublicationId !== publicationId) {
    eaFail("invalid_value", `${what}.publicationId does not match its content`);
  }
  const expectedPayloadDigest = externalAssetOutboundPayloadDigestOf({
    providerId: content.provider.providerId,
    providerDefinitionDigest: content.provider.digest,
    journalEntryId: content.localJournalRef.entryId,
    journalEntryDigest: content.localJournalDigest,
    targetAssetType: content.targetAssetType,
    title: content.outboundTitle,
    body: content.outboundBody,
    metadata: content.outboundMetadata,
  });
  if (expectedPayloadDigest !== content.payloadDigest) {
    eaFail("invalid_value", `${what}.payloadDigest does not match its outbound payload`);
  }
  const withId = { ...content, publicationId };
  const digest = eaDigest(object.digest, `${what}.digest`);
  if (previewDigestOf(withId) !== digest) {
    eaFail("invalid_value", `${what}.digest does not match its content`);
  }
  return Object.freeze({ ...withId, digest });
}

/* ------------------------------------------------------------------ *
 * §21 SEPARATE publication admission — explicit APPROVE | REJECT
 * ------------------------------------------------------------------ */

export const EXTERNAL_ASSET_PUBLICATION_ADMISSION_DECISIONS = ["APPROVE", "REJECT"] as const;
export type ExternalAssetPublicationAdmissionDecision =
  (typeof EXTERNAL_ASSET_PUBLICATION_ADMISSION_DECISIONS)[number];

export interface ExternalAssetPublicationAdmissionInput {
  /** The EXACT preview the approver sees — byte-for-byte what would be sent. */
  readonly preview: ExternalAssetPublicationPreview;
}

/**
 * §21: a SEPARATE, explicit authority port. An agent may PREPARE a preview; it
 * can never approve, because approval is not a method of this plane's
 * read/prepare surface — it lives behind this host-owned port only.
 *
 * The port receives NO management mode, NO autonomy profile, NO HTTP
 * credential and NO agent identity: `DIRECT/ASSIST/MANAGE/DELEGATE` never grant
 * approval, and ordinary HTTP authentication is not semantic approval.
 */
export interface ExternalAssetPublicationAdmissionPort {
  readonly policyRef: { readonly policyId: string; readonly version: string };
  admit(input: ExternalAssetPublicationAdmissionInput): Promise<unknown>;
}

export interface ExternalAssetPublicationAdmissionOutcome {
  readonly decision: ExternalAssetPublicationAdmissionDecision;
  readonly approver?: string | undefined;
  readonly note?: string | undefined;
}

/**
 * Strict-parse an admission answer. An unparseable/absent answer is a FAILURE,
 * never an implicit APPROVE.
 */
export function parseExternalAssetPublicationAdmissionOutcome(
  raw: unknown,
  what = "ExternalAssetPublicationAdmissionOutcome",
): ExternalAssetPublicationAdmissionOutcome {
  const object = eaObject(raw, what);
  eaKeys(object, ["decision", "approver", "note"], ["decision"], what);
  const approver = eaOptionalString(object.approver, `${what}.approver`);
  const note = eaOptionalString(object.note, `${what}.note`);
  return Object.freeze({
    decision: eaEnum(
      object.decision,
      EXTERNAL_ASSET_PUBLICATION_ADMISSION_DECISIONS,
      `${what}.decision`,
    ),
    ...(approver === undefined ? {} : { approver }),
    ...(note === undefined ? {} : { note }),
  });
}

/** An admission port that can only REJECT — the honest "no approver wired" stand-in. */
export function rejectAllExternalAssetPublicationAdmission(
  policyId = "external-asset-publication-none",
): ExternalAssetPublicationAdmissionPort {
  return Object.freeze({
    policyRef: Object.freeze({ policyId, version: "1" }),
    async admit(): Promise<unknown> {
      return { decision: "REJECT", note: "no publication approver is configured in this deployment" };
    },
  });
}

/* ------------------------------------------------------------------ *
 * §23 The provider's SEPARATE write capability
 * ------------------------------------------------------------------ */

export const EXTERNAL_ASSET_PUBLICATION_SEMANTICS = [
  /** The provider deduplicates by `publicationId`: a retry cannot double-publish. */
  "IDEMPOTENT_BY_PUBLICATION_ID",
  /** The provider supports an outcome probe: an uncertain attempt is reconciled. */
  "RECONCILABLE",
] as const;
export type ExternalAssetPublicationSemantics =
  (typeof EXTERNAL_ASSET_PUBLICATION_SEMANTICS)[number];

export interface ExternalAssetPublicationRequest {
  readonly publicationId: string;
  readonly providerDefinitionDigest: string;
  readonly journalEntryId: string;
  readonly journalEntryDigest: string;
  readonly targetAssetType: string;
  readonly payloadDigest: string;
  /** The exact outbound content (the approved preview's bytes). */
  readonly title: string;
  readonly body: string;
  readonly metadata: Readonly<Record<string, string>>;
}

export type ExternalAssetPublicationOutcome =
  | { readonly status: "PUBLISHED"; readonly ref: ExternalAssetStableRef }
  | { readonly status: "FAILED"; readonly reason: string }
  | { readonly status: "UNCERTAIN"; readonly detail: string };

export type ExternalAssetPublicationReconciliation =
  | { readonly status: "PUBLISHED"; readonly ref: ExternalAssetStableRef }
  | { readonly status: "ABSENT_RETRY_SAFE" }
  | { readonly status: "UNKNOWN"; readonly detail: string };

export interface ExternalAssetPublicationPort {
  /** The provider's OWN definition; it must equal the read definition (§7). */
  readonly definition: ExternalAssetProviderDefinition;
  readonly semantics: ExternalAssetPublicationSemantics;
  /** §23: success MUST return an exact `ExternalAssetStableRef`. */
  publish(request: ExternalAssetPublicationRequest): Promise<unknown>;
  /**
   * The read-only outcome probe. A RECONCILABLE provider implements it so an
   * uncertain attempt can be resolved; `undefined` means "no record", which is
   * authoritative absence for the non-idempotent contract.
   */
  reconcile?(request: {
    readonly publicationId: string;
    readonly providerDefinitionDigest: string;
    readonly payloadDigest: string;
  }): Promise<unknown | undefined>;
}

export function parseExternalAssetPublicationOutcome(
  raw: unknown,
  what = "ExternalAssetPublicationOutcome",
): ExternalAssetPublicationOutcome {
  const object = eaObject(raw, what);
  const status = eaEnum(object.status, ["PUBLISHED", "FAILED", "UNCERTAIN"] as const, `${what}.status`);
  if (status === "PUBLISHED") {
    eaKeys(object, ["status", "ref"], ["status", "ref"], what);
    return Object.freeze({
      status: "PUBLISHED" as const,
      ref: parseExternalAssetStableRef(object.ref, `${what}.ref`),
    });
  }
  if (status === "FAILED") {
    eaKeys(object, ["status", "reason"], ["status", "reason"], what);
    return Object.freeze({ status: "FAILED" as const, reason: eaString(object.reason, `${what}.reason`) });
  }
  eaKeys(object, ["status", "detail"], ["status", "detail"], what);
  return Object.freeze({ status: "UNCERTAIN" as const, detail: eaString(object.detail, `${what}.detail`) });
}

export function parseExternalAssetPublicationReconciliation(
  raw: unknown,
  what = "ExternalAssetPublicationReconciliation",
): ExternalAssetPublicationReconciliation {
  const object = eaObject(raw, what);
  const status = eaEnum(
    object.status,
    ["PUBLISHED", "ABSENT_RETRY_SAFE", "UNKNOWN"] as const,
    `${what}.status`,
  );
  if (status === "PUBLISHED") {
    eaKeys(object, ["status", "ref"], ["status", "ref"], what);
    return Object.freeze({
      status: "PUBLISHED" as const,
      ref: parseExternalAssetStableRef(object.ref, `${what}.ref`),
    });
  }
  if (status === "ABSENT_RETRY_SAFE") {
    eaKeys(object, ["status"], ["status"], what);
    return Object.freeze({ status: "ABSENT_RETRY_SAFE" as const });
  }
  eaKeys(object, ["status", "detail"], ["status", "detail"], what);
  return Object.freeze({ status: "UNKNOWN" as const, detail: eaString(object.detail, `${what}.detail`) });
}
