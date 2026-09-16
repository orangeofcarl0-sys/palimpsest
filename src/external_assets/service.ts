/**
 * G10-AE §10–§25 — the External Asset Library bridge SERVICE.
 *
 *   ExternalAsset != ProjectAsset        Reference != Import
 *   Association != Ownership             Import != TruthAdmission
 *   SearchResult != StableAssetRef       SearchRanking != Applicability
 *   PublicationPreview != Publication    PublicationReceipt != Truth
 *   ProviderUnavailable != AssetFalse    ManagementMode != PublicationApproval
 *
 * This plane:
 *   - READS an external library (providers/search/inspect) without persisting
 *     anything and without touching project state;
 *   - prepares READ-ONLY candidates (reference / import / publication) that a
 *     human or an operator-explicit call may then commit;
 *   - commits through the EXISTING owners only: one `EXTERNAL_ASSET`
 *     ProjectAssetAssociation, one `ProjectJournal` entry, and the governed
 *     external-effect path for publication.
 *
 * It can reach no Work, Proof or Reasoning owner (see `refs.ts`), so a "bridge"
 * from an external asset to Work Evidence, Proof evidence/claims, Reasoning
 * claims or Decisions is not merely forbidden — it is unreachable.
 */

import { canonicalDigest, canonicalJsonBytes } from "../schema/canonical.js";

import {
  assetAssociatedEvent,
  associatedAssetsOf,
  materializeProjectAssetAssociation,
  projectWorkspaceOpenedEvent,
  type AssociationKind,
  type ProjectAssetAssociation,
} from "../project_workspace/association.js";
import {
  journalEntryRecordedEvent,
  journalOpenedEvent,
  PROJECT_JOURNAL_KINDS,
  projectJournalView,
  type SqliteProjectJournalStore,
  type ProjectJournalEntry,
  type ProjectJournalKind,
} from "../project_workspace/journal.js";
import type { SqliteProjectAssetAssociationStore } from "../project_workspace/association.js";

import {
  eaDigest,
  eaEnum,
  eaFail,
  eaKeys,
  eaObject,
  eaOptionalString,
  eaPositiveInt,
  eaStableId,
  eaString,
  eaStringArray,
  ExternalAssetError,
  externalAssetStableRefKey,
  parseExternalAssetStableRef,
  type ExternalAssetStableRef,
} from "./refs.js";
import {
  externalAssetTextDigestOf,
  parseExternalAssetInspection,
  parseExternalAssetSearchPage,
  parseExternalAssetTextMaterialization,
  providerSupports,
  EXTERNAL_ASSET_TEXT_MEDIA_TYPES,
  type ExternalAssetInspection,
  type ExternalAssetInspectRequest,
  type ExternalAssetLibraryReadPort,
  type ExternalAssetSearchPage,
} from "./provider.js";
import {
  externalAssetProviderDescriptors,
  type ExternalAssetLibraryProvider,
  type ExternalAssetLibraryRegistry,
  type ExternalAssetProviderDescriptor,
} from "./registry.js";
import {
  materializeExternalAssetImportCandidate,
  parseExternalAssetImportCandidate,
  type ExternalAssetImportCandidate,
} from "./import.js";
import {
  materializeExternalAssetPublicationPreview,
  parseExternalAssetPublicationAdmissionOutcome,
  parseExternalAssetPublicationPreview,
  type ExternalAssetPublicationAdmissionDecision,
  type ExternalAssetPublicationAdmissionPort,
  type ExternalAssetPublicationPreview,
} from "./publication.js";
import {
  externalAssetStableRefFromPublishOutput,
  probeExternalPublication,
  type ExternalAssetPublishEffectInput,
  type ExternalAssetPublishEffectOutput,
} from "./effects.js";
import {
  SqliteExternalAssetBridgeStore,
  type ExternalAssetBridgeRecord,
  type ExternalAssetBridgeRecordInput,
} from "./bridge_store.js";
import { resolveExternalAssetView, type ExternalAssetDerivedView } from "./resolver.js";

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

/**
 * The deployment default text bound. Exceeding it BLOCKS the import — it never
 * truncates, and there is no hidden second bound anywhere in the plane.
 */
export const DEFAULT_MAX_IMPORTED_TEXT_BYTES = 262144;

/* ------------------------------------------------------------------ *
 * Ports (all read-only except the two existing owners' write seams)
 * ------------------------------------------------------------------ */

export interface ExternalAssetProjectBasis {
  readonly projectId: string;
  readonly revision: number;
  readonly digest: string;
}

/** Read-only project scope. `undefined` ⇒ this deployment does not hold that project. */
export interface ExternalAssetProjectScopePort {
  basis(projectId: string): Promise<ExternalAssetProjectBasis | undefined>;
}

/**
 * The write seam onto the EXISTING Project Workspace association owner. The
 * asset kind is pinned to `EXTERNAL_ASSET` and the digest is required, so this
 * plane cannot create another association kind and cannot create a durable
 * external association without an exact digest.
 */
export interface ExternalAssetAssociationInput {
  readonly projectId: string;
  readonly assetKind: "EXTERNAL_ASSET";
  readonly canonicalRef: {
    readonly kind: string;
    readonly id: string;
    readonly digest: string;
  };
  readonly associationKind: AssociationKind;
  readonly provenance: string;
}

export interface ExternalAssetAssociationPort {
  list(projectId: string): Promise<readonly ProjectAssetAssociation[]>;
  associate(input: ExternalAssetAssociationInput): Promise<ProjectAssetAssociation>;
}

/** The read/write seam onto the EXISTING ProjectJournal owner (the ONLY import target). */
export interface ExternalAssetJournalPort {
  read(projectId: string, entryId: string): Promise<ProjectJournalEntry | undefined>;
  /** Idempotent by the content-addressed event id: re-appending the same entry is a no-op. */
  append(entry: ProjectJournalEntry): Promise<ProjectJournalEntry>;
}

/** The governed external-effect path (Ordarium). Absent ⇒ publication is impossible. */
export interface ExternalAssetPublishInvoker {
  invoke(input: ExternalAssetPublishEffectInput): Promise<ExternalAssetPublishEffectOutput>;
}

/* ------------------------------------------------------------------ *
 * §11 Reference candidate (READ-ONLY; commits nothing)
 * ------------------------------------------------------------------ */

export const EXTERNAL_ASSET_REFERENCE_PROVENANCE_DOMAIN =
  "palimpsest.external-assets.reference-provenance.v1";
export const EXTERNAL_ASSET_REFERENCE_CANDIDATE_DOMAIN =
  "palimpsest.external-assets.reference-candidate.v1";

export const EXTERNAL_ASSET_REFERENCE_RELATION = "REFERENCED_FROM_EXTERNAL_LIBRARY";

export interface ExternalAssetReferenceProvenance {
  readonly schemaVersion: 1;
  readonly relation: typeof EXTERNAL_ASSET_REFERENCE_RELATION;
  readonly providerId: string;
  readonly assetId: string;
  readonly contentDigest: string;
  readonly revisionLabel?: string | undefined;
  readonly refDigest: string;
  readonly providerDefinitionDigest: string;
  readonly projectRevision: number;
  readonly projectDigest: string;
  readonly digest: string;
}

export function externalAssetReferenceProvenanceDigestOf(
  input: Omit<ExternalAssetReferenceProvenance, "digest">,
): string {
  return canonicalDigest({ domain: EXTERNAL_ASSET_REFERENCE_PROVENANCE_DOMAIN, provenance: input });
}

export interface ExternalAssetReferenceCandidate {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly externalRef: ExternalAssetStableRef;
  readonly providerDefinitionDigest: string;
  readonly projectBasis: ExternalAssetProjectBasis;
  readonly candidateDigest: string;
}

export function externalAssetReferenceCandidateDigestOf(
  input: Omit<ExternalAssetReferenceCandidate, "candidateDigest">,
): string {
  return canonicalDigest({ domain: EXTERNAL_ASSET_REFERENCE_CANDIDATE_DOMAIN, candidate: input });
}

/* ------------------------------------------------------------------ *
 * §6 denial reasons (a DENIED preparation is not an exception: it is an answer)
 * ------------------------------------------------------------------ */

export const EXTERNAL_ASSET_DENIAL_REASONS = [
  /** §6: the provider cannot expose a stable digest/revision. */
  "stable_revision_unavailable",
  /** The provider is not configured, or did not answer. */
  "provider_unavailable",
  "unknown_provider",
  "capability_not_available",
  /** The provider answered for a DIFFERENT revision: the latest never substitutes. */
  "requested_digest_mismatch",
  "asset_not_found",
  "unknown_project",
  /** §14: the caller must choose a Journal kind explicitly. */
  "journal_kind_required",
  /** §15: no text could be materialized. */
  "content_unavailable",
  /** §15: the content is not bounded text. */
  "binary_content",
  /** §15: the returned digest is not the referenced digest. */
  "digest_mismatch",
  /** §15: the content exceeds `maxImportedTextBytes` (never truncated). */
  "content_too_large",
] as const;
export type ExternalAssetDenialReason = (typeof EXTERNAL_ASSET_DENIAL_REASONS)[number];

export interface ExternalAssetDenied {
  readonly status: "DENIED";
  readonly reason: ExternalAssetDenialReason;
  readonly detail: string;
}

export type ExternalAssetReferencePreparation =
  | { readonly status: "PREPARED"; readonly candidate: ExternalAssetReferenceCandidate }
  | ExternalAssetDenied;

export type ExternalAssetImportPreparation =
  | { readonly status: "PREPARED"; readonly candidate: ExternalAssetImportCandidate }
  | ExternalAssetDenied;

export interface ExternalAssetReferenceCommitted {
  readonly status: "COMMITTED";
  readonly association: ProjectAssetAssociation;
  /** False when the identical association already existed (idempotent re-commit). */
  readonly created: boolean;
}

export interface ExternalAssetReferenceStale {
  readonly status: "STALE_REFERENCE_CANDIDATE";
  readonly reason: "stale_reference_candidate";
  readonly detail: string;
}

export type ExternalAssetReferenceCommit =
  | ExternalAssetReferenceCommitted
  | ExternalAssetReferenceStale;

export interface ExternalAssetImportCommitted {
  readonly status: "COMMITTED";
  readonly entry: ProjectJournalEntry;
  readonly receipt: ExternalAssetBridgeRecord;
  /** False when the Journal entry was already recorded (crash retry). */
  readonly journalCreated: boolean;
  /** True when the terminal bridge receipt already existed. */
  readonly replayed: boolean;
}

export interface ExternalAssetImportStale {
  readonly status: "STALE_IMPORT_CANDIDATE";
  readonly reason: "stale_import_candidate";
  readonly detail: string;
}

export type ExternalAssetImportCommit = ExternalAssetImportCommitted | ExternalAssetImportStale;

export interface ExternalAssetPublicationApprovalRequired {
  readonly status: "NOT_APPROVED";
  readonly decision: ExternalAssetPublicationAdmissionDecision | "UNAVAILABLE";
  readonly detail: string;
}

export interface ExternalAssetPublicationPublished {
  readonly status: "PUBLISHED";
  readonly ref: ExternalAssetStableRef;
  readonly receipt: ExternalAssetBridgeRecord;
  readonly association?: ProjectAssetAssociation | undefined;
  /** True when the external asset was (re)created by this call, false on a replay. */
  readonly created: boolean;
}

export interface ExternalAssetPublicationFailed {
  readonly status: "FAILED";
  readonly reason: "publication_absent" | "publication_outcome_unknown";
  readonly detail: string;
  readonly receipt?: ExternalAssetBridgeRecord | undefined;
}

export type ExternalAssetPublicationResult =
  | ExternalAssetPublicationPublished
  | ExternalAssetPublicationApprovalRequired
  | ExternalAssetPublicationFailed;

/* ------------------------------------------------------------------ *
 * Service
 * ------------------------------------------------------------------ */

export interface ExternalAssetBridgeServiceDeps {
  readonly registry: ExternalAssetLibraryRegistry;
  readonly bridge: SqliteExternalAssetBridgeStore;
  readonly projectScope: ExternalAssetProjectScopePort;
  readonly associations?: ExternalAssetAssociationPort | undefined;
  readonly journal?: ExternalAssetJournalPort | undefined;
  readonly publicationAdmission?: ExternalAssetPublicationAdmissionPort | undefined;
  readonly maxImportedTextBytes?: number | undefined;
  readonly clock?: (() => string) | undefined;
  readonly invokeEffect?: ExternalAssetPublishInvoker | undefined;
}

export interface ExternalAssetSearchInput {
  readonly providerId: string;
  readonly text: string;
  readonly limit?: number | undefined;
  readonly assetTypes?: readonly string[] | undefined;
  readonly cursor?: string | undefined;
}

export interface ExternalAssetInspectInput {
  readonly providerId: string;
  readonly assetId: string;
  readonly contentDigest?: string | undefined;
}

export interface ExternalAssetPrepareReferenceInput {
  readonly projectId: string;
  readonly providerId: string;
  readonly assetId: string;
  /** The EXACT digest to bind. Absent ⇒ the provider's current revision is asked for. */
  readonly contentDigest?: string | undefined;
}

export interface ExternalAssetPrepareImportInput {
  readonly projectId: string;
  readonly externalRef: ExternalAssetStableRef;
  /** The caller's EXPLICIT Journal kind. Nothing maps a provider type to it. */
  readonly journalKind: ProjectJournalKind;
  readonly title: string;
  readonly sourceLocator?: string | undefined;
}

export interface ExternalAssetPreparePublicationInput {
  readonly projectId: string;
  readonly providerId: string;
  readonly targetAssetType: string;
  readonly journalEntryId: string;
}

export interface ExternalAssetBridgeService {
  providers(): Promise<readonly ExternalAssetProviderDescriptor[]>;
  search(input: ExternalAssetSearchInput): Promise<ExternalAssetSearchPage>;
  inspect(input: ExternalAssetInspectInput): Promise<ExternalAssetInspection>;
  prepareReference(input: ExternalAssetPrepareReferenceInput): Promise<ExternalAssetReferencePreparation>;
  commitReference(candidate: ExternalAssetReferenceCandidate): Promise<ExternalAssetReferenceCommit>;
  prepareImport(input: ExternalAssetPrepareImportInput): Promise<ExternalAssetImportPreparation>;
  /** §18 phase 1 — write the PREPARED receipt (also the pre-crash half of the protocol). */
  beginImport(candidate: ExternalAssetImportCandidate): Promise<ExternalAssetBridgeRecord>;
  commitImport(candidate: ExternalAssetImportCandidate): Promise<ExternalAssetImportCommit>;
  preparePublication(input: ExternalAssetPreparePublicationInput): Promise<ExternalAssetPublicationPreview>;
  /** §20/§24 phase 1 — write the PUBLICATION_PREPARED receipt. Zero external effect. */
  beginPublication(preview: ExternalAssetPublicationPreview): Promise<ExternalAssetBridgeRecord>;
  approveAndPublish(preview: ExternalAssetPublicationPreview): Promise<ExternalAssetPublicationResult>;
  resolve(projectId: string): Promise<ExternalAssetDerivedView>;
}

export function makeExternalAssetBridgeService(
  deps: ExternalAssetBridgeServiceDeps,
): ExternalAssetBridgeService {
  const now = (): string => (deps.clock ?? (() => new Date().toISOString()))();
  const maxImportedTextBytes =
    deps.maxImportedTextBytes === undefined
      ? DEFAULT_MAX_IMPORTED_TEXT_BYTES
      : eaPositiveInt(deps.maxImportedTextBytes, "maxImportedTextBytes");

  function requireProvider(providerId: string): ExternalAssetLibraryProvider {
    const provider = deps.registry.get(providerId);
    if (provider === undefined) {
      eaFail("unknown_provider", `external provider "${providerId}" is not configured`);
    }
    return provider;
  }

  async function basisOf(projectId: string): Promise<ExternalAssetProjectBasis | undefined> {
    try {
      return await deps.projectScope.basis(projectId);
    } catch {
      return undefined;
    }
  }

  /* ----- provider lookup + capability gates ----- */

  function readPortWith(
    providerId: string,
    capability: "SEARCH" | "INSPECT" | "MATERIALIZE_TEXT",
  ): ExternalAssetLibraryReadPort {
    const provider = requireProvider(providerId);
    if (!providerSupports(provider.read.definition, capability)) {
      eaFail(
        "capability_not_available",
        `external provider "${providerId}" does not declare the ${capability} capability`,
      );
    }
    return provider.read;
  }

  /* ----- §8 reads ----- */

  async function providers(): Promise<readonly ExternalAssetProviderDescriptor[]> {
    return externalAssetProviderDescriptors(deps.registry);
  }

  async function search(input: ExternalAssetSearchInput): Promise<ExternalAssetSearchPage> {
    const read = readPortWith(input.providerId, "SEARCH");
    const text = eaString(input.text, "text");
    const page = parseExternalAssetSearchPage(
      await read.search({
        text,
        ...(input.limit === undefined ? {} : { limit: eaPositiveInt(input.limit, "limit") }),
        ...(input.assetTypes === undefined
          ? {}
          : { assetTypes: eaStringArray(input.assetTypes, "assetTypes") }),
        ...(input.cursor === undefined ? {} : { cursor: eaString(input.cursor, "cursor") }),
      }),
    );
    if (page.providerId !== read.definition.providerId) {
      eaFail(
        "invalid_value",
        `external provider "${read.definition.providerId}" answered a search page for "${page.providerId}"`,
      );
    }
    for (const hit of page.hits) {
      if (hit.providerId !== read.definition.providerId) {
        eaFail(
          "invalid_value",
          `external provider "${read.definition.providerId}" returned a hit for "${hit.providerId}"`,
        );
      }
    }
    // Nothing above touched a store: search is read-only and its hits are ephemeral.
    return page;
  }

  async function inspect(input: ExternalAssetInspectInput): Promise<ExternalAssetInspection> {
    const read = readPortWith(input.providerId, "INSPECT");
    return inspectThrough(read, {
      providerId: input.providerId,
      assetId: input.assetId,
      ...(input.contentDigest === undefined
        ? {}
        : { contentDigest: eaDigest(input.contentDigest, "contentDigest") }),
    });
  }

  /**
   * The ONE exact-resolve helper. With a requested digest, the answer is either
   * that exact revision or `UNAVAILABLE` — the latest revision never substitutes,
   * and a provider that answers for a different digest is reported as a mismatch
   * by `parseExternalAssetInspection` + this cross-check.
   */
  async function inspectThrough(
    read: ExternalAssetLibraryReadPort,
    request: ExternalAssetInspectRequest,
  ): Promise<ExternalAssetInspection> {
    const providerId = read.definition.providerId;
    const assetId = eaStableId(request.assetId, "assetId");
    let raw: unknown;
    try {
      raw = await read.inspect({
        providerId,
        assetId,
        ...(request.contentDigest === undefined ? {} : { contentDigest: request.contentDigest }),
      });
    } catch (error) {
      return Object.freeze({
        status: "UNAVAILABLE" as const,
        providerId,
        assetId,
        ...(request.contentDigest === undefined ? {} : { requestedDigest: request.contentDigest }),
        reason: "provider_unavailable" as const,
        detail: `external provider "${providerId}" did not answer the inspection: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
    const inspection = parseExternalAssetInspection(raw);
    if (inspection.status === "UNAVAILABLE") return inspection;
    const snapshot = inspection.snapshot;
    if (snapshot.ref.providerId !== providerId || snapshot.ref.assetId !== assetId) {
      eaFail(
        "invalid_value",
        `external provider "${providerId}" answered for ${snapshot.ref.providerId}/${snapshot.ref.assetId}`,
      );
    }
    if (request.contentDigest !== undefined && snapshot.ref.contentDigest !== request.contentDigest) {
      // §9/§12: never silently return latest for a requested digest.
      return Object.freeze({
        status: "UNAVAILABLE" as const,
        providerId,
        assetId,
        requestedDigest: request.contentDigest,
        reason: "requested_digest_mismatch" as const,
        detail: `the provider answered for digest ${snapshot.ref.contentDigest}, not the requested ${request.contentDigest}`,
      });
    }
    return inspection;
  }

  /* ----- §10/§11 explicit reference ----- */

  async function prepareReference(
    input: ExternalAssetPrepareReferenceInput,
  ): Promise<ExternalAssetReferencePreparation> {
    const provider = deps.registry.get(input.providerId);
    if (provider === undefined) {
      return denied("unknown_provider", `external provider "${input.providerId}" is not configured`);
    }
    if (!providerSupports(provider.read.definition, "INSPECT")) {
      return denied(
        "capability_not_available",
        `external provider "${input.providerId}" does not declare the INSPECT capability`,
      );
    }
    const assetId = eaStableId(input.assetId, "assetId");
    const requestedDigest =
      input.contentDigest === undefined ? undefined : eaDigest(input.contentDigest, "contentDigest");
    const basis = await basisOf(input.projectId);
    if (basis === undefined) {
      return denied("unknown_project", `project "${input.projectId}" is not held by this deployment`);
    }
    const inspection = await inspectThrough(provider.read, {
      providerId: input.providerId,
      assetId,
      ...(requestedDigest === undefined ? {} : { contentDigest: requestedDigest }),
    });
    if (inspection.status === "UNAVAILABLE") {
      return denied(denialOfInspection(inspection.reason), inspection.detail);
    }
    const snapshot = inspection.snapshot;
    if (requestedDigest !== undefined && snapshot.ref.contentDigest !== requestedDigest) {
      return denied(
        "requested_digest_mismatch",
        `the provider answered for digest ${snapshot.ref.contentDigest}, not the requested ${requestedDigest}`,
      );
    }
    const content: Omit<ExternalAssetReferenceCandidate, "candidateDigest"> = {
      schemaVersion: 1,
      projectId: eaStableId(input.projectId, "projectId"),
      externalRef: snapshot.ref,
      providerDefinitionDigest: provider.read.definition.digest,
      projectBasis: basis,
    };
    const candidate: ExternalAssetReferenceCandidate = Object.freeze({
      ...content,
      candidateDigest: externalAssetReferenceCandidateDigestOf(content),
    });
    return Object.freeze({ status: "PREPARED" as const, candidate });
  }

  async function commitReference(
    candidate: ExternalAssetReferenceCandidate,
  ): Promise<ExternalAssetReferenceCommit> {
    const parsed = parseExternalAssetReferenceCandidate(candidate);
    const stale = (detail: string): ExternalAssetReferenceStale =>
      Object.freeze({ status: "STALE_REFERENCE_CANDIDATE" as const, reason: "stale_reference_candidate" as const, detail });

    // (1) the project scope still matches — same project, same revision, same digest
    const basis = await basisOf(parsed.projectId);
    if (basis === undefined) return stale(`project "${parsed.projectId}" is no longer held by this deployment`);
    if (basis.revision !== parsed.projectBasis.revision || basis.digest !== parsed.projectBasis.digest) {
      return stale(
        `project "${parsed.projectId}" advanced from revision ${parsed.projectBasis.revision} to ${basis.revision}`,
      );
    }
    // (2) the provider definition still matches
    const provider = deps.registry.get(parsed.externalRef.providerId);
    if (provider === undefined) {
      return stale(`external provider "${parsed.externalRef.providerId}" is no longer configured`);
    }
    if (provider.read.definition.digest !== parsed.providerDefinitionDigest) {
      return stale(
        `external provider "${parsed.externalRef.providerId}" definition changed since the candidate was prepared`,
      );
    }
    if (!providerSupports(provider.read.definition, "INSPECT")) {
      return stale(`external provider "${parsed.externalRef.providerId}" no longer declares INSPECT`);
    }
    // (3) the EXACT digest still resolves
    const inspection = await inspectThrough(provider.read, {
      providerId: parsed.externalRef.providerId,
      assetId: parsed.externalRef.assetId,
      contentDigest: parsed.externalRef.contentDigest,
    });
    if (inspection.status === "UNAVAILABLE") {
      return stale(`the referenced revision no longer resolves: ${inspection.detail}`);
    }
    if (inspection.snapshot.ref.contentDigest !== parsed.externalRef.contentDigest) {
      return stale("the provider answered for a different revision than the candidate referenced");
    }

    const associations = deps.associations;
    if (associations === undefined) {
      eaFail("association_store_unavailable", "no project association owner is configured");
    }
    const existing = (await associations.list(parsed.projectId)).find(
      (association) =>
        association.assetKind === "EXTERNAL_ASSET" &&
        association.associationKind === "MANUAL" &&
        association.canonicalRef.kind === parsed.externalRef.providerId &&
        association.canonicalRef.id === parsed.externalRef.assetId &&
        association.canonicalRef.digest === parsed.externalRef.contentDigest,
    );
    if (existing !== undefined) {
      return Object.freeze({ status: "COMMITTED" as const, association: existing, created: false });
    }
    const association = await associations.associate({
      projectId: parsed.projectId,
      assetKind: "EXTERNAL_ASSET",
      canonicalRef: {
        kind: parsed.externalRef.providerId,
        id: parsed.externalRef.assetId,
        digest: parsed.externalRef.contentDigest,
      },
      associationKind: "MANUAL",
      // Structured provenance (refs + digests only): the association copies NO content.
      provenance: canonicalTextOf(
        materializeExternalAssetReferenceProvenance({
          externalRef: parsed.externalRef,
          providerDefinitionDigest: parsed.providerDefinitionDigest,
          projectBasis: parsed.projectBasis,
        }),
      ),
    });
    return Object.freeze({ status: "COMMITTED" as const, association, created: true });
  }

  /* ----- §14/§15/§16 explicit import ----- */

  async function prepareImport(
    input: ExternalAssetPrepareImportInput,
  ): Promise<ExternalAssetImportPreparation> {
    // §14: the Journal kind is an EXPLICIT caller choice and never derived.
    if (
      typeof input.journalKind !== "string" ||
      !(PROJECT_JOURNAL_KINDS as readonly string[]).includes(input.journalKind)
    ) {
      return denied(
        "journal_kind_required",
        "an import requires an explicit target Journal kind (IDEA, OPEN_QUESTION, NEGATIVE_RESULT, OPPORTUNITY, REFERENCE_NOTE)",
      );
    }
    const externalRef = parseExternalAssetStableRef(input.externalRef);
    const provider = deps.registry.get(externalRef.providerId);
    if (provider === undefined) {
      return denied("unknown_provider", `external provider "${externalRef.providerId}" is not configured`);
    }
    if (!providerSupports(provider.read.definition, "MATERIALIZE_TEXT")) {
      return denied(
        "capability_not_available",
        `external provider "${externalRef.providerId}" does not declare the MATERIALIZE_TEXT capability`,
      );
    }
    const materialize = provider.read.materializeText;
    if (materialize === undefined) {
      return denied(
        "capability_not_available",
        `external provider "${externalRef.providerId}" declares MATERIALIZE_TEXT but exposes no materialization port`,
      );
    }
    const basis = await basisOf(input.projectId);
    if (basis === undefined) {
      return denied("unknown_project", `project "${input.projectId}" is not held by this deployment`);
    }
    let rawMaterialization: unknown | undefined;
    try {
      rawMaterialization = await materialize.call(provider.read, externalRef);
    } catch (error) {
      return denied("provider_unavailable", messageOf(error));
    }
    if (rawMaterialization === undefined) {
      return denied(
        "content_unavailable",
        `external provider "${externalRef.providerId}" cannot materialize the text of ${externalAssetStableRefKey(externalRef)}`,
      );
    }
    const raw = rawMaterialization as Record<string, unknown>;
    // §6: a materialization that carries no stable digest cannot be imported.
    if (typeof raw.contentDigest !== "string") {
      return denied(
        "stable_revision_unavailable",
        "the materialized content carries no stable digest",
      );
    }
    // §15: binary content blocks the import (reference-only remains possible).
    if (typeof raw.mediaType === "string" && !(EXTERNAL_ASSET_TEXT_MEDIA_TYPES as readonly string[]).includes(raw.mediaType)) {
      return denied("binary_content", `the content media type "${raw.mediaType}" is not text`);
    }
    // §15: the returned digest MUST equal the stable ref.
    if (raw.contentDigest !== externalRef.contentDigest) {
      return denied(
        "digest_mismatch",
        `the materialized digest ${raw.contentDigest} is not the referenced digest ${externalRef.contentDigest}`,
      );
    }
    let materialization: ReturnType<typeof parseExternalAssetTextMaterialization>;
    try {
      materialization = parseExternalAssetTextMaterialization(rawMaterialization);
    } catch (error) {
      // The parser also hashes the returned TEXT; a provider that echoes the
      // referenced digest while handing over different bytes is a digest
      // mismatch, not merely unavailable content, so the reason is preserved.
      if (error instanceof ExternalAssetError && error.kind === "digest_mismatch") {
        return denied("digest_mismatch", error.message);
      }
      return denied("content_unavailable", messageOf(error));
    }
    // §15: an explicit bound. Exceeding it BLOCKS the import; nothing is truncated.
    const byteLength = new TextEncoder().encode(materialization.text).length;
    if (byteLength > maxImportedTextBytes) {
      return denied(
        "content_too_large",
        `the materialized content is ${byteLength} bytes, above maxImportedTextBytes=${maxImportedTextBytes}`,
      );
    }
    const candidate = materializeExternalAssetImportCandidate({
      projectId: input.projectId,
      externalRef,
      providerDefinitionDigest: provider.read.definition.digest,
      journalKind: input.journalKind,
      title: input.title,
      text: materialization.text,
      textDigest: materialization.contentDigest,
      createdAt: now(),
      ...(input.sourceLocator === undefined ? {} : { sourceLocator: input.sourceLocator }),
    });
    return Object.freeze({ status: "PREPARED" as const, candidate });
  }

  async function beginImport(candidate: ExternalAssetImportCandidate): Promise<ExternalAssetBridgeRecord> {
    const parsed = parseExternalAssetImportCandidate(candidate);
    const lineage = deps.bridge.lineage(parsed.projectId, parsed.operationId);
    const prepared = lineage.find((record) => record.family === "EXTERNAL_IMPORT_PREPARED");
    if (prepared !== undefined) return prepared;
    return deps.bridge.append(importPreparedReceipt(parsed, now()));
  }

  async function commitImport(
    candidate: ExternalAssetImportCandidate,
  ): Promise<ExternalAssetImportCommit> {
    const parsed = parseExternalAssetImportCandidate(candidate);
    const stale = (detail: string): ExternalAssetImportStale =>
      Object.freeze({ status: "STALE_IMPORT_CANDIDATE" as const, reason: "stale_import_candidate" as const, detail });

    const basis = await basisOf(parsed.projectId);
    if (basis === undefined) return stale(`project "${parsed.projectId}" is no longer held by this deployment`);
    const journal = deps.journal;
    if (journal === undefined) {
      eaFail("journal_store_unavailable", "no project journal owner is configured");
    }

    const lineage = deps.bridge.lineage(parsed.projectId, parsed.operationId);
    const committed = lineage.find((record) => record.family === "EXTERNAL_IMPORT_COMMITTED");
    if (committed !== undefined) {
      // §18: a terminal receipt makes the retry a pure replay — zero writes, and
      // no provider round trip: the import is already a fact about local history.
      const entry = await journal.read(parsed.projectId, parsed.entry.entryId);
      if (entry === undefined) {
        return stale(
          `the bridge recorded import ${parsed.operationId} as committed but journal entry "${parsed.entry.entryId}" is missing`,
        );
      }
      return Object.freeze({
        status: "COMMITTED" as const,
        entry,
        receipt: committed,
        journalCreated: false,
        replayed: true,
      });
    }

    // §11-style re-checks, mirrored from `commitReference`: an import records a
    // DURABLE claim that this local entry is the exact text of one external
    // revision, so the first commit re-establishes the provider side of that
    // claim instead of trusting a candidate any caller could have hand-built.
    const provider = deps.registry.get(parsed.externalRef.providerId);
    if (provider === undefined) {
      return stale(`external provider "${parsed.externalRef.providerId}" is no longer configured`);
    }
    if (provider.read.definition.digest !== parsed.providerDefinitionDigest) {
      return stale(
        `external provider "${parsed.externalRef.providerId}" definition changed since the import was prepared`,
      );
    }
    if (!providerSupports(provider.read.definition, "INSPECT")) {
      return stale(`external provider "${parsed.externalRef.providerId}" no longer declares INSPECT`);
    }
    const inspection = await inspectThrough(provider.read, {
      providerId: parsed.externalRef.providerId,
      assetId: parsed.externalRef.assetId,
      contentDigest: parsed.externalRef.contentDigest,
    });
    if (inspection.status === "UNAVAILABLE") {
      return stale(`the imported revision no longer resolves: ${inspection.detail}`);
    }
    if (inspection.snapshot.ref.contentDigest !== parsed.externalRef.contentDigest) {
      return stale("the provider answered for a different revision than the import references");
    }
    // The bytes that will be copied must BE the referenced revision: the candidate
    // carries the exact Journal entry the import appends, so its BODY is hashed
    // rather than trusted to match a digest the same candidate supplied.
    if (externalAssetTextDigestOf(parsed.entry.body) !== parsed.externalRef.contentDigest) {
      return stale(
        `the prepared text is not the digest of the referenced revision ${parsed.externalRef.contentDigest}`,
      );
    }

    const prepared = lineage.find((record) => record.family === "EXTERNAL_IMPORT_PREPARED");
    if (prepared !== undefined && prepared.journalEntryId !== parsed.entry.entryId) {
      // The caller re-prepared the SAME operation with DIFFERENT local content
      // (typically a new timestamp). Writing either version could duplicate the
      // import, so NOTHING is written.
      return stale(
        `import ${parsed.operationId} was already prepared for journal entry "${prepared.journalEntryId}"; ` +
          "reuse the existing candidate or resolve the earlier attempt before importing again",
      );
    }
    if (prepared === undefined) deps.bridge.append(importPreparedReceipt(parsed, now()));

    const existingEntry = await journal.read(parsed.projectId, parsed.entry.entryId);
    let journalCreated = false;
    if (existingEntry === undefined) {
      // The content-addressed event id makes this append idempotent: a crash retry
      // after the write landed re-appends the SAME event and the store dedupes it.
      await journal.append(parsed.entry);
      journalCreated = true;
    }
    const receipt = deps.bridge.append({
      projectId: parsed.projectId,
      family: "EXTERNAL_IMPORT_COMMITTED",
      operationId: parsed.operationId,
      providerId: parsed.externalRef.providerId,
      providerDefinitionDigest: parsed.providerDefinitionDigest,
      journalEntryId: parsed.entry.entryId,
      journalEntryDigest: parsed.entry.digest,
      journalKind: parsed.journalKind,
      externalAssetId: parsed.externalRef.assetId,
      externalContentDigest: parsed.externalRef.contentDigest,
      externalRefDigest: parsed.externalRef.refDigest,
      ...(parsed.externalRef.revisionLabel === undefined
        ? {}
        : { externalRevisionLabel: parsed.externalRef.revisionLabel }),
      candidateDigest: parsed.candidateDigest,
      recordedAt: now(),
    });
    return Object.freeze({
      status: "COMMITTED" as const,
      entry: parsed.entry,
      receipt,
      journalCreated,
      replayed: false,
    });
  }

  /* ----- §19–§25 outbound publication ----- */

  async function preparePublication(
    input: ExternalAssetPreparePublicationInput,
  ): Promise<ExternalAssetPublicationPreview> {
    const provider = requireProvider(input.providerId);
    if (!providerSupports(provider.read.definition, "PUBLISH")) {
      eaFail(
        "capability_not_available",
        `external provider "${input.providerId}" does not declare the PUBLISH capability`,
      );
    }
    if (provider.publication === undefined) {
      eaFail(
        "publication_port_unavailable",
        `external provider "${input.providerId}" declares PUBLISH but exposes no publication port`,
      );
    }
    const journal = deps.journal;
    if (journal === undefined) {
      eaFail("journal_store_unavailable", "no project journal owner is configured");
    }
    const projectId = eaStableId(input.projectId, "projectId");
    const entryId = eaStableId(input.journalEntryId, "journalEntryId");
    // The project scope is checked exactly as it is for a reference or an import:
    // without this, naming another project could pull ITS journal entry into this
    // caller's context and prepare it for outbound disclosure. The bridge only
    // ever acts inside a project this deployment holds.
    const basis = await basisOf(projectId);
    if (basis === undefined) {
      eaFail("unknown_project", `project "${projectId}" is not held by this deployment`);
    }
    const entry = await journal.read(projectId, entryId);
    if (entry === undefined) {
      eaFail(
        "not_a_journal_entry",
        `journal entry "${entryId}" is not recorded in project "${projectId}"`,
      );
    }
    // §19: v1 sources ONLY a project journal entry. Nothing else is reachable here.
    return materializeExternalAssetPublicationPreview({
      provider: provider.read.definition,
      projectId,
      targetAssetType: input.targetAssetType,
      entry,
    });
  }

  async function beginPublication(
    preview: ExternalAssetPublicationPreview,
  ): Promise<ExternalAssetBridgeRecord> {
    const parsed = parseExternalAssetPublicationPreview(preview);
    const lineage = deps.bridge.lineage(parsed.projectId, parsed.publicationId);
    const prepared = lineage.find((record) => record.family === "EXTERNAL_PUBLICATION_PREPARED");
    if (prepared !== undefined) return prepared;
    return deps.bridge.append({
      projectId: parsed.projectId,
      family: "EXTERNAL_PUBLICATION_PREPARED",
      operationId: parsed.publicationId,
      providerId: parsed.provider.providerId,
      providerDefinitionDigest: parsed.provider.digest,
      publicationId: parsed.publicationId,
      targetAssetType: parsed.targetAssetType,
      payloadDigest: parsed.payloadDigest,
      previewDigest: parsed.digest,
      journalEntryId: parsed.localJournalRef.entryId,
      journalEntryDigest: parsed.localJournalDigest,
      recordedAt: now(),
    });
  }

  async function approveAndPublish(
    preview: ExternalAssetPublicationPreview,
  ): Promise<ExternalAssetPublicationResult> {
    const parsed = parseExternalAssetPublicationPreview(preview);
    const provider = requireProvider(parsed.provider.providerId);
    // The same project scope fence as every other bridge operation: an approved
    // preview for a project this deployment does not hold must never reach the
    // admission port, the ledger or a provider.
    if ((await basisOf(parsed.projectId)) === undefined) {
      eaFail("unknown_project", `project "${parsed.projectId}" is not held by this deployment`);
    }
    // §25 requires ONE EXTERNAL_ASSET association on success. Without an
    // association owner the project could not see its published counterpart, so
    // publication is refused BEFORE any receipt, Ordarium operation or provider
    // call rather than leaving an unrecorded external asset behind.
    if (deps.associations === undefined) {
      eaFail(
        "association_store_unavailable",
        "no project association owner is configured: a published asset could not be recorded",
      );
    }
    const port = provider.publication;
    if (port === undefined) {
      eaFail(
        "publication_port_unavailable",
        `external provider "${parsed.provider.providerId}" exposes no publication port`,
      );
    }
    if (port.definition.digest !== parsed.provider.digest) {
      eaFail(
        "invalid_value",
        `external provider "${parsed.provider.providerId}" definition changed since the preview was prepared`,
      );
    }
    const invoker = deps.invokeEffect;
    if (invoker === undefined) {
      eaFail(
        "publication_port_unavailable",
        "no governed external-effect path is configured: publication is impossible",
      );
    }
    // §21: the SEPARATE, explicit approval — BEFORE any receipt, any Ordarium
    // operation and any provider call.
    const admission = deps.publicationAdmission;
    if (admission === undefined) {
      return notApproved(
        "UNAVAILABLE",
        "no publication admission port is configured: an agent-prepared preview cannot be published",
      );
    }
    let decision: ExternalAssetPublicationAdmissionDecision;
    try {
      decision = parseExternalAssetPublicationAdmissionOutcome(
        await admission.admit({ preview: parsed }),
      ).decision;
    } catch (error) {
      return notApproved("UNAVAILABLE", `the publication admission port did not answer: ${messageOf(error)}`);
    }
    if (decision !== "APPROVE") {
      return notApproved("REJECT", "the publication admission port REJECTED this preview");
    }

    // A prior terminal receipt makes this call a pure replay.
    const replay = deps.bridge
      .lineage(parsed.projectId, parsed.publicationId)
      .find((record) => record.family === "EXTERNAL_PUBLICATION_COMMITTED");
    if (replay !== undefined) {
      const ref = stableRefOfReceipt(replay);
      const association = await ensurePublishedAssociation(parsed, ref);
      return Object.freeze({
        status: "PUBLISHED" as const,
        ref,
        receipt: replay,
        ...(association === undefined ? {} : { association }),
        created: false,
      });
    }

    await beginPublication(parsed);
    try {
      const output = await invoker.invoke(externalAssetPublishEffectInputOf(parsed));
      const ref = externalAssetStableRefFromPublishOutput(output);
      return await finishPublication(parsed, ref, true);
    } catch (error) {
      const probe = await probeExternalPublication({
        port,
        publicationId: parsed.publicationId,
        providerDefinitionDigest: parsed.provider.digest,
        payloadDigest: parsed.payloadDigest,
      });
      if (probe.status === "PUBLISHED") {
        // §24: the external write landed; recover it instead of publishing again.
        return await finishPublication(parsed, probe.ref, false);
      }
      const reason = probe.status === "ABSENT_RETRY_SAFE" ? "publication_absent" : "publication_outcome_unknown";
      const receipt = deps.bridge.append({
        projectId: parsed.projectId,
        family: "EXTERNAL_PUBLICATION_FAILED",
        operationId: parsed.publicationId,
        providerId: parsed.provider.providerId,
        providerDefinitionDigest: parsed.provider.digest,
        publicationId: parsed.publicationId,
        targetAssetType: parsed.targetAssetType,
        payloadDigest: parsed.payloadDigest,
        previewDigest: parsed.digest,
        journalEntryId: parsed.localJournalRef.entryId,
        journalEntryDigest: parsed.localJournalDigest,
        reason,
        recordedAt: now(),
      });
      return Object.freeze({
        status: "FAILED" as const,
        reason,
        detail:
          reason === "publication_absent"
            ? `the governed publication did not land (${messageOf(error)}); the provider holds no record of it`
            : `the governed publication outcome is unknown and was NOT blind-retried (${messageOf(error)})`,
        receipt,
      });
    }
  }

  async function finishPublication(
    preview: ExternalAssetPublicationPreview,
    ref: ExternalAssetStableRef,
    created: boolean,
  ): Promise<ExternalAssetPublicationPublished> {
    // §24: the terminal receipt is written ONCE. A retry can reach here again -
    // because the association write below failed after the external success, or
    // because a recovered attempt is finalized - and appending a second terminal
    // would corrupt an append-only lineage that recovery reads. An existing
    // terminal is reused, so the retry stays idempotent.
    const existingTerminal = deps.bridge
      .lineage(preview.projectId, preview.publicationId)
      .find((record) => record.family === "EXTERNAL_PUBLICATION_COMMITTED");
    const receipt =
      existingTerminal ??
      deps.bridge.append({
        projectId: preview.projectId,
        family: "EXTERNAL_PUBLICATION_COMMITTED",
        operationId: preview.publicationId,
        providerId: preview.provider.providerId,
        providerDefinitionDigest: preview.provider.digest,
        publicationId: preview.publicationId,
        targetAssetType: preview.targetAssetType,
        payloadDigest: preview.payloadDigest,
        previewDigest: preview.digest,
        journalEntryId: preview.localJournalRef.entryId,
        journalEntryDigest: preview.localJournalDigest,
        externalAssetId: ref.assetId,
        externalContentDigest: ref.contentDigest,
        externalRefDigest: ref.refDigest,
        ...(ref.revisionLabel === undefined ? {} : { externalRevisionLabel: ref.revisionLabel }),
        recordedAt: now(),
      });
    const association = await ensurePublishedAssociation(preview, ref);
    return Object.freeze({
      status: "PUBLISHED" as const,
      ref,
      receipt,
      ...(association === undefined ? {} : { association }),
      created,
    });
  }

  /**
   * §25: on success ONE `EXTERNAL_ASSET` association records the published
   * counterpart with `associationKind: PUBLISHED`. The LOCAL journal stays local
   * canonical history; publication neither erases nor transfers ownership.
   */
  async function ensurePublishedAssociation(
    preview: ExternalAssetPublicationPreview,
    ref: ExternalAssetStableRef,
  ): Promise<ProjectAssetAssociation | undefined> {
    const associations = deps.associations;
    if (associations === undefined) return undefined;
    const existing = (await associations.list(preview.projectId)).find(
      (association) =>
        association.assetKind === "EXTERNAL_ASSET" &&
        association.associationKind === "PUBLISHED" &&
        association.canonicalRef.kind === ref.providerId &&
        association.canonicalRef.id === ref.assetId &&
        association.canonicalRef.digest === ref.contentDigest,
    );
    if (existing !== undefined) return existing;
    return associations.associate({
      projectId: preview.projectId,
      assetKind: "EXTERNAL_ASSET",
      canonicalRef: { kind: ref.providerId, id: ref.assetId, digest: ref.contentDigest },
      associationKind: "PUBLISHED",
      provenance: canonicalTextOf({
        schemaVersion: 1,
        relation: "PUBLISHED_TO_EXTERNAL_LIBRARY",
        providerId: ref.providerId,
        assetId: ref.assetId,
        contentDigest: ref.contentDigest,
        ...(ref.revisionLabel === undefined ? {} : { revisionLabel: ref.revisionLabel }),
        refDigest: ref.refDigest,
        providerDefinitionDigest: preview.provider.digest,
        publicationId: preview.publicationId,
        projectId: preview.projectId,
        journalEntryId: preview.localJournalRef.entryId,
        journalEntryDigest: preview.localJournalDigest,
        payloadDigest: preview.payloadDigest,
      }),
    });
  }

  /* ----- §12/§26 derived view ----- */

  async function resolve(projectId: string): Promise<ExternalAssetDerivedView> {
    const associations = deps.associations;
    const listed = associations === undefined ? [] : await associations.list(projectId);
    return resolveExternalAssetView({ projectId, associations: listed, registry: deps.registry });
  }

  function importPreparedReceipt(
    candidate: ExternalAssetImportCandidate,
    recordedAt: string,
  ): ExternalAssetBridgeRecordInput {
    return {
      projectId: candidate.projectId,
      family: "EXTERNAL_IMPORT_PREPARED",
      operationId: candidate.operationId,
      providerId: candidate.externalRef.providerId,
      providerDefinitionDigest: candidate.providerDefinitionDigest,
      journalEntryId: candidate.entry.entryId,
      journalEntryDigest: candidate.entry.digest,
      journalKind: candidate.journalKind,
      externalAssetId: candidate.externalRef.assetId,
      externalContentDigest: candidate.externalRef.contentDigest,
      externalRefDigest: candidate.externalRef.refDigest,
      ...(candidate.externalRef.revisionLabel === undefined
        ? {}
        : { externalRevisionLabel: candidate.externalRef.revisionLabel }),
      candidateDigest: candidate.candidateDigest,
      recordedAt,
    };
  }

  return Object.freeze({
    providers,
    search,
    inspect,
    prepareReference,
    commitReference,
    prepareImport,
    beginImport,
    commitImport,
    preparePublication,
    beginPublication,
    approveAndPublish,
    resolve,
  });
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function denied(reason: ExternalAssetDenialReason, detail: string): ExternalAssetDenied {
  return Object.freeze({ status: "DENIED" as const, reason, detail });
}

function notApproved(
  decision: ExternalAssetPublicationAdmissionDecision | "UNAVAILABLE",
  detail: string,
): ExternalAssetPublicationApprovalRequired {
  return Object.freeze({ status: "NOT_APPROVED" as const, decision, detail });
}

function denialOfInspection(reason: string): ExternalAssetDenialReason {
  switch (reason) {
    case "stable_revision_unavailable":
      return "stable_revision_unavailable";
    case "provider_unavailable":
      return "provider_unavailable";
    case "requested_digest_mismatch":
      return "requested_digest_mismatch";
    default:
      return "asset_not_found";
  }
}

function canonicalTextOf(value: unknown): string {
  return new TextDecoder().decode(canonicalJsonBytes(value));
}

export function materializeExternalAssetReferenceProvenance(input: {
  readonly externalRef: ExternalAssetStableRef;
  readonly providerDefinitionDigest: string;
  readonly projectBasis: ExternalAssetProjectBasis;
}): ExternalAssetReferenceProvenance {
  const externalRef = parseExternalAssetStableRef(input.externalRef);
  const content: Omit<ExternalAssetReferenceProvenance, "digest"> = {
    schemaVersion: 1,
    relation: EXTERNAL_ASSET_REFERENCE_RELATION,
    providerId: externalRef.providerId,
    assetId: externalRef.assetId,
    contentDigest: externalRef.contentDigest,
    ...(externalRef.revisionLabel === undefined ? {} : { revisionLabel: externalRef.revisionLabel }),
    refDigest: externalRef.refDigest,
    providerDefinitionDigest: eaDigest(input.providerDefinitionDigest, "providerDefinitionDigest"),
    projectRevision: input.projectBasis.revision,
    projectDigest: eaString(input.projectBasis.digest, "projectDigest"),
  };
  return Object.freeze({ ...content, digest: externalAssetReferenceProvenanceDigestOf(content) });
}

export function parseExternalAssetReferenceProvenance(
  raw: unknown,
  what = "ExternalAssetReferenceProvenance",
): ExternalAssetReferenceProvenance {
  const object = eaObject(raw, what);
  eaKeys(
    object,
    [
      "schemaVersion",
      "relation",
      "providerId",
      "assetId",
      "contentDigest",
      "revisionLabel",
      "refDigest",
      "providerDefinitionDigest",
      "projectRevision",
      "projectDigest",
      "digest",
    ],
    [
      "schemaVersion",
      "relation",
      "providerId",
      "assetId",
      "contentDigest",
      "refDigest",
      "providerDefinitionDigest",
      "projectRevision",
      "projectDigest",
      "digest",
    ],
    what,
  );
  if (object.schemaVersion !== 1) eaFail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  const revisionLabel = eaOptionalString(object.revisionLabel, `${what}.revisionLabel`);
  if (typeof object.projectRevision !== "number" || !Number.isSafeInteger(object.projectRevision)) {
    eaFail("invalid_value", `${what}.projectRevision must be a safe integer`);
  }
  const content: Omit<ExternalAssetReferenceProvenance, "digest"> = {
    schemaVersion: 1,
    relation: eaEnum(object.relation, [EXTERNAL_ASSET_REFERENCE_RELATION] as const, `${what}.relation`),
    providerId: eaStableId(object.providerId, `${what}.providerId`),
    assetId: eaStableId(object.assetId, `${what}.assetId`),
    contentDigest: eaDigest(object.contentDigest, `${what}.contentDigest`),
    ...(revisionLabel === undefined ? {} : { revisionLabel }),
    refDigest: eaDigest(object.refDigest, `${what}.refDigest`),
    providerDefinitionDigest: eaDigest(object.providerDefinitionDigest, `${what}.providerDefinitionDigest`),
    projectRevision: object.projectRevision,
    projectDigest: eaString(object.projectDigest, `${what}.projectDigest`),
  };
  const digest = eaDigest(object.digest, `${what}.digest`);
  if (externalAssetReferenceProvenanceDigestOf(content) !== digest) {
    eaFail("invalid_value", `${what}.digest does not match its content`);
  }
  return Object.freeze({ ...content, digest });
}

export function parseExternalAssetReferenceCandidate(
  raw: unknown,
  what = "ExternalAssetReferenceCandidate",
): ExternalAssetReferenceCandidate {
  const object = eaObject(raw, what);
  eaKeys(
    object,
    ["schemaVersion", "projectId", "externalRef", "providerDefinitionDigest", "projectBasis", "candidateDigest"],
    ["schemaVersion", "projectId", "externalRef", "providerDefinitionDigest", "projectBasis", "candidateDigest"],
    what,
  );
  if (object.schemaVersion !== 1) eaFail("unknown_schema_version", `${what}.schemaVersion must be 1`);
  const basisObject = eaObject(object.projectBasis, `${what}.projectBasis`);
  eaKeys(
    basisObject,
    ["projectId", "revision", "digest"],
    ["projectId", "revision", "digest"],
    `${what}.projectBasis`,
  );
  if (typeof basisObject.revision !== "number" || !Number.isSafeInteger(basisObject.revision)) {
    eaFail("invalid_value", `${what}.projectBasis.revision must be a safe integer`);
  }
  const projectBasis: ExternalAssetProjectBasis = Object.freeze({
    projectId: eaStableId(basisObject.projectId, `${what}.projectBasis.projectId`),
    revision: basisObject.revision,
    digest: eaString(basisObject.digest, `${what}.projectBasis.digest`),
  });
  const content: Omit<ExternalAssetReferenceCandidate, "candidateDigest"> = {
    schemaVersion: 1,
    projectId: eaStableId(object.projectId, `${what}.projectId`),
    externalRef: parseExternalAssetStableRef(object.externalRef, `${what}.externalRef`),
    providerDefinitionDigest: eaDigest(object.providerDefinitionDigest, `${what}.providerDefinitionDigest`),
    projectBasis,
  };
  if (content.projectBasis.projectId !== content.projectId) {
    eaFail("invalid_value", `${what}.projectBasis belongs to another project`);
  }
  const candidateDigest = eaDigest(object.candidateDigest, `${what}.candidateDigest`);
  if (externalAssetReferenceCandidateDigestOf(content) !== candidateDigest) {
    eaFail("invalid_value", `${what}.candidateDigest does not match its content`);
  }
  return Object.freeze({ ...content, candidateDigest });
}

/**
 * §22: the effect input is DERIVED from the approved preview alone, field for
 * field. There is no parameter for a caller-supplied field, so no caller field
 * can differ from what was approved.
 */
export function externalAssetPublishEffectInputOf(
  preview: ExternalAssetPublicationPreview,
): ExternalAssetPublishEffectInput {
  const parsed = parseExternalAssetPublicationPreview(preview);
  return Object.freeze({
    publicationId: parsed.publicationId,
    providerId: parsed.provider.providerId,
    providerDefinitionDigest: parsed.provider.digest,
    projectId: parsed.projectId,
    journalEntryId: parsed.localJournalRef.entryId,
    journalEntryDigest: parsed.localJournalDigest,
    targetAssetType: parsed.targetAssetType,
    payloadDigest: parsed.payloadDigest,
  });
}

function stableRefOfReceipt(receipt: ExternalAssetBridgeRecord): ExternalAssetStableRef {
  if (
    receipt.externalAssetId === undefined ||
    receipt.externalContentDigest === undefined ||
    receipt.externalRefDigest === undefined
  ) {
    eaFail("malformed_artifact", "a committed publication receipt is missing its external ref");
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    providerId: receipt.providerId,
    assetId: receipt.externalAssetId,
    contentDigest: receipt.externalContentDigest,
    ...(receipt.externalRevisionLabel === undefined || receipt.externalRevisionLabel === null
      ? {}
      : { revisionLabel: receipt.externalRevisionLabel }),
    refDigest: receipt.externalRefDigest,
  });
}

/* ------------------------------------------------------------------ *
 * Adapters over the EXISTING project-workspace stores
 * ------------------------------------------------------------------ */

/**
 * The ProjectJournal write seam (the ONLY import target). `append` re-appends the
 * identical content-addressed event, which the journal store deduplicates, so a
 * crash retry cannot duplicate the entry.
 */
export function sqliteExternalAssetJournalPort(
  store: SqliteProjectJournalStore,
): ExternalAssetJournalPort {
  return Object.freeze({
    async read(projectId: string, entryId: string): Promise<ProjectJournalEntry | undefined> {
      const view = projectJournalView(await store.replay(projectId));
      return view.find((entry) => entry.entry.entryId === entryId)?.entry;
    },
    async append(entry: ProjectJournalEntry): Promise<ProjectJournalEntry> {
      const existing = await store.replay(entry.projectId);
      const tail = existing[existing.length - 1];
      const basis =
        tail === undefined
          ? { scopeId: entry.projectId, throughSeq: 0, chainDigest: "" }
          : { scopeId: entry.projectId, throughSeq: tail.seq, chainDigest: tail.chainDigest };
      const events =
        existing.length === 0
          ? [journalOpenedEvent(entry.projectId), journalEntryRecordedEvent(entry)]
          : [journalEntryRecordedEvent(entry)];
      await store.appendAtomic({ expectedBasis: basis, events });
      return entry;
    },
  });
}

/** The ProjectAssetAssociation write seam. `assetKind` is pinned to `EXTERNAL_ASSET`. */
export function sqliteExternalAssetAssociationPort(
  store: SqliteProjectAssetAssociationStore,
  clock?: (() => string) | undefined,
): ExternalAssetAssociationPort {
  const now = (): string => (clock ?? (() => new Date().toISOString()))();
  return Object.freeze({
    async list(projectId: string): Promise<readonly ProjectAssetAssociation[]> {
      return associatedAssetsOf(await store.replay(projectId));
    },
    async associate(input: ExternalAssetAssociationInput): Promise<ProjectAssetAssociation> {
      if (input.assetKind !== "EXTERNAL_ASSET") {
        eaFail("invalid_value", `this plane may only associate EXTERNAL_ASSET, not "${input.assetKind}"`);
      }
      const association = materializeProjectAssetAssociation({
        projectId: input.projectId,
        assetKind: "EXTERNAL_ASSET",
        canonicalRef: {
          kind: eaString(input.canonicalRef.kind, "canonicalRef.kind"),
          id: eaString(input.canonicalRef.id, "canonicalRef.id"),
          digest: eaDigest(input.canonicalRef.digest, "canonicalRef.digest"),
        },
        associationKind: input.associationKind,
        provenance: input.provenance,
        recordedAt: now(),
      });
      const existing = await store.replay(input.projectId);
      const tail = existing[existing.length - 1];
      const basis =
        tail === undefined
          ? { scopeId: input.projectId, throughSeq: 0, chainDigest: "" }
          : { scopeId: input.projectId, throughSeq: tail.seq, chainDigest: tail.chainDigest };
      const events =
        existing.length === 0
          ? // The scope is opened by this very batch when the project had none.
            [projectWorkspaceOpenedEvent(input.projectId), assetAssociatedEvent(association)]
          : [assetAssociatedEvent(association)];
      await store.appendAtomic({ expectedBasis: basis, events });
      return association;
    },
  });
}
