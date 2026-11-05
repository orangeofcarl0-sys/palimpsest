/**
 * SR-1 §26 — the External Asset Library face of the project surface.
 *
 * The read/search/inspect verbs are pure reads; the prepare verbs return read-only candidates; the
 * three operator-explicit verbs are the ONLY mutation/approval entries and they still run through
 * the plane's own re-checks (exact digest, provider definition, project scope) and — for
 * publication — the SEPARATE admission port. Ordinary HTTP authentication never stands in for that
 * approval. This module is extracted from the project cluster so the cluster stays reviewable; it
 * owns no state and defines no second approval path.
 */
import type {
  ExternalAssetImportCandidate,
  ExternalAssetImportCommit,
  ExternalAssetImportPreparation,
  ExternalAssetInspection,
  ExternalAssetInspectInput,
  ExternalAssetPrepareImportInput,
  ExternalAssetPreparePublicationInput,
  ExternalAssetPrepareReferenceInput,
  ExternalAssetProviderDescriptor,
  ExternalAssetPublicationPreview,
  ExternalAssetPublicationResult,
  ExternalAssetReferenceCandidate,
  ExternalAssetReferenceCommit,
  ExternalAssetReferencePreparation,
  ExternalAssetSearchInput,
  ExternalAssetSearchPage,
} from "../external_assets/index.js";

export interface ExternalAssetsApplicationSurface {
  /** Deployment config descriptors (capabilities). Never asset truth. */
  providers(): Promise<readonly ExternalAssetProviderDescriptor[]>;
  /** §8: an EPHEMERAL page of hits. Zero project mutation, zero persistence. */
  search(input: ExternalAssetSearchInput): Promise<ExternalAssetSearchPage>;
  /** §9: an EXACT-digest snapshot (never a silent "latest"). */
  inspect(input: ExternalAssetInspectInput): Promise<ExternalAssetInspection>;
  /** §11: a read-only reference candidate bound to the exact external digest. */
  prepareReference(input: ExternalAssetPrepareReferenceCommand): Promise<ExternalAssetReferencePreparation>;
  /** §14/§15: an explicit Journal kind + exact materialized text, read-only. */
  prepareImport(input: ExternalAssetPrepareImportCommand): Promise<ExternalAssetImportPreparation>;
  /** §20: the EXACT outbound payload, with zero external effect. */
  preparePublication(input: ExternalAssetPreparePublicationCommand): Promise<ExternalAssetPublicationPreview>;
  /** OPERATOR-EXPLICIT: one `EXTERNAL_ASSET` association (copies no content). */
  commitReference(candidate: ExternalAssetReferenceCandidate): Promise<ExternalAssetReferenceCommit>;
  /** OPERATOR-EXPLICIT: one Journal entry with structured external provenance. */
  commitImport(candidate: ExternalAssetImportCandidate): Promise<ExternalAssetImportCommit>;
  /**
   * OPERATOR-EXPLICIT approval + governed publication. The decision itself comes
   * from the separate admission port (or the call returns `NOT_APPROVED`).
   */
  approveAndPublish(preview: ExternalAssetPublicationPreview): Promise<ExternalAssetPublicationResult>;
}

export type ExternalAssetPrepareReferenceCommand = Omit<ExternalAssetPrepareReferenceInput, "projectId"> & {
  readonly projectId?: string | undefined;
};

export type ExternalAssetPrepareImportCommand = Omit<ExternalAssetPrepareImportInput, "projectId"> & {
  readonly projectId?: string | undefined;
};

export type ExternalAssetPreparePublicationCommand = Omit<ExternalAssetPreparePublicationInput, "projectId"> & {
  readonly projectId?: string | undefined;
};

/** The one bridge the face delegates to; a caller cannot widen the project scope. */
export interface ExternalAssetsBridge {
  providers(): Promise<readonly ExternalAssetProviderDescriptor[]>;
  search(input: ExternalAssetSearchInput): Promise<ExternalAssetSearchPage>;
  inspect(input: ExternalAssetInspectInput): Promise<ExternalAssetInspection>;
  prepareReference(input: ExternalAssetPrepareReferenceInput): Promise<ExternalAssetReferencePreparation>;
  prepareImport(input: ExternalAssetPrepareImportInput): Promise<ExternalAssetImportPreparation>;
  preparePublication(input: ExternalAssetPreparePublicationInput): Promise<ExternalAssetPublicationPreview>;
  commitReference(candidate: ExternalAssetReferenceCandidate): Promise<ExternalAssetReferenceCommit>;
  commitImport(candidate: ExternalAssetImportCandidate): Promise<ExternalAssetImportCommit>;
  approveAndPublish(preview: ExternalAssetPublicationPreview): Promise<ExternalAssetPublicationResult>;
}

export function makeExternalAssetsSurface(
  bridge: ExternalAssetsBridge,
  localProjectId: string,
): ExternalAssetsApplicationSurface {
  return {
    providers: () => bridge.providers(),
    search: (input: ExternalAssetSearchInput) => bridge.search(input),
    inspect: (input: ExternalAssetInspectInput) => bridge.inspect(input),
    prepareReference: (input: ExternalAssetPrepareReferenceCommand) =>
      bridge.prepareReference({ ...input, projectId: input.projectId ?? localProjectId }),
    prepareImport: (input: ExternalAssetPrepareImportCommand) =>
      bridge.prepareImport({ ...input, projectId: input.projectId ?? localProjectId }),
    preparePublication: (input: ExternalAssetPreparePublicationCommand) =>
      bridge.preparePublication({ ...input, projectId: input.projectId ?? localProjectId }),
    commitReference: (candidate: ExternalAssetReferenceCandidate) => bridge.commitReference(candidate),
    commitImport: (candidate: ExternalAssetImportCandidate) => bridge.commitImport(candidate),
    approveAndPublish: (preview: ExternalAssetPublicationPreview) => bridge.approveAndPublish(preview),
  };
}
