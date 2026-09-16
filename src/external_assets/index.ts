/**
 * G10-AE — External Asset Library Bridge & Explicit Project Reuse (barrel).
 *
 *   ExternalAsset != ProjectAsset        ExternalAsset != ProjectContext
 *   ExternalAsset != WorkEvidence        ExternalAsset != ProofEvidence
 *   ExternalAsset != ReasoningClaim      ExternalAsset != Decision
 *   ExternalAsset != Truth
 *
 *   SearchResult != StableAssetRef       SearchRanking != Applicability
 *   SemanticMatch != Applicability       Reference != Import
 *   Import != TruthAdmission             Import != Task
 *   Import != Evidence                   PublicationPreview != Publication
 *   PublicationReceipt != Truth          ExternalLatest != ReferencedRevision
 *   ProviderUnavailable != AssetFalse    Association != Ownership
 *
 * ONE external owner, ONE durable reference, ONE explicit import, ONE governed
 * publication. External assets stay externally owned; the project stays the
 * project owner; nothing is auto-retrieved, auto-admitted or auto-contextualized.
 *
 * This barrel deliberately exports no "personal asset store", no global memory,
 * no knowledge graph and no external truth store.
 */

export {
  EXTERNAL_ASSET_SCHEMA_VERSION,
  EXTERNAL_ASSET_STABLE_REF_DOMAIN,
  ExternalAssetError,
  eaFail,
  externalAssetStableRefDigestOf,
  externalAssetStableRefKey,
  materializeExternalAssetStableRef,
  parseExternalAssetStableRef,
} from "./refs.js";
export type {
  ExternalAssetErrorKind,
  ExternalAssetStableRef,
} from "./refs.js";

export {
  EXTERNAL_ASSET_PROVIDER_CAPABILITIES,
  EXTERNAL_ASSET_PROVIDER_DEFINITION_DOMAIN,
  EXTERNAL_ASSET_INSPECTION_UNAVAILABLE_REASONS,
  EXTERNAL_ASSET_TEXT_MEDIA_TYPES,
  externalAssetProviderDefinitionDigestOf,
  materializeExternalAssetProviderDefinition,
  parseExternalAssetInspection,
  parseExternalAssetLatestRevision,
  parseExternalAssetProviderDefinition,
  parseExternalAssetSearchHit,
  parseExternalAssetSearchPage,
  parseExternalAssetSnapshot,
  parseExternalAssetTextMaterialization,
  providerSupports,
  unavailableInspection,
} from "./provider.js";
export type {
  ExternalAssetInspection,
  ExternalAssetInspectionUnavailableReason,
  ExternalAssetInspectRequest,
  ExternalAssetLatestRevision,
  ExternalAssetLibraryReadPort,
  ExternalAssetProviderCapability,
  ExternalAssetProviderDefinition,
  ExternalAssetSearchHit,
  ExternalAssetSearchPage,
  ExternalAssetSearchQuery,
  ExternalAssetSnapshot,
  ExternalAssetTextMaterialization,
  ExternalAssetTextMediaType,
} from "./provider.js";

export {
  emptyExternalAssetLibraryRegistry,
  externalAssetLibraryRegistryOf,
  externalAssetProviderDescriptors,
  requireExternalAssetProvider,
} from "./registry.js";
export type {
  ExternalAssetLibraryProvider,
  ExternalAssetLibraryRegistry,
  ExternalAssetProviderDescriptor,
} from "./registry.js";

export {
  EXTERNAL_ASSET_BRIDGE_FAMILIES,
  EXTERNAL_ASSET_BRIDGE_GENESIS,
  EXTERNAL_ASSET_BRIDGE_RECORD_DOMAIN,
  EXTERNAL_ASSET_BRIDGE_RECORD_ID_DOMAIN,
  SqliteExternalAssetBridgeStore,
  defaultExternalAssetBridgePath,
  externalAssetBridgeRecordIdOf,
  parseExternalAssetBridgeRecord,
} from "./bridge_store.js";
export type {
  ExternalAssetBridgeFamily,
  ExternalAssetBridgeRecord,
  ExternalAssetBridgeRecordInput,
} from "./bridge_store.js";

export {
  EXTERNAL_ASSET_IMPORT_CANDIDATE_DOMAIN,
  EXTERNAL_ASSET_IMPORT_OPERATION_DOMAIN,
  EXTERNAL_ASSET_IMPORT_PROVENANCE_DOMAIN,
  EXTERNAL_ASSET_IMPORT_RELATION,
  EXTERNAL_ASSET_PROVENANCE_REF_KIND,
  EXTERNAL_ASSET_RELATED_REF_KIND,
  externalAssetImportCandidateDigestOf,
  externalAssetImportJournalEvent,
  externalAssetImportOperationIdOf,
  externalAssetImportProvenanceDigestOf,
  externalAssetImportProvenanceOf,
  externalAssetImportProvenanceText,
  materializeExternalAssetImportCandidate,
  materializeExternalAssetImportProvenance,
  parseExternalAssetImportCandidate,
  parseExternalAssetImportProvenance,
} from "./import.js";
export type {
  ExternalAssetImportCandidate,
  ExternalAssetImportProvenance,
} from "./import.js";

export {
  EXTERNAL_ASSET_OUTBOUND_PAYLOAD_DOMAIN,
  EXTERNAL_ASSET_PUBLICATION_ADMISSION_DECISIONS,
  EXTERNAL_ASSET_PUBLICATION_ID_DOMAIN,
  EXTERNAL_ASSET_PUBLICATION_PREVIEW_DOMAIN,
  EXTERNAL_ASSET_PUBLICATION_SEMANTICS,
  externalAssetOutboundMetadataOf,
  externalAssetOutboundPayloadDigestOf,
  externalAssetOutboundPayloadOf,
  externalAssetPublicationIdOf,
  materializeExternalAssetPublicationPreview,
  parseExternalAssetPublicationAdmissionOutcome,
  parseExternalAssetPublicationOutcome,
  parseExternalAssetPublicationPreview,
  parseExternalAssetPublicationReconciliation,
  rejectAllExternalAssetPublicationAdmission,
} from "./publication.js";
export type {
  ExternalAssetOutboundPayload,
  ExternalAssetPublicationAdmissionDecision,
  ExternalAssetPublicationAdmissionInput,
  ExternalAssetPublicationAdmissionOutcome,
  ExternalAssetPublicationAdmissionPort,
  ExternalAssetPublicationJournalRef,
  ExternalAssetPublicationOutcome,
  ExternalAssetPublicationPort,
  ExternalAssetPublicationPreview,
  ExternalAssetPublicationReconciliation,
  ExternalAssetPublicationRequest,
  ExternalAssetPublicationSemantics,
} from "./publication.js";

export {
  EXTERNAL_ASSET_PUBLISH_ACTION_NAME,
  EXTERNAL_ASSET_PUBLISH_INPUT_FIELDS,
  defineExternalAssetEffects,
  externalAssetStableRefFromPublishOutput,
  probeExternalPublication,
} from "./effects.js";
export type {
  ExternalAssetEffects,
  ExternalAssetEffectsDeps,
  ExternalAssetPublicationEffectJournalPort,
  ExternalAssetPublishEffectInput,
  ExternalAssetPublishEffectOutput,
} from "./effects.js";

export {
  EXTERNAL_ASSET_RESOLUTION_STATES,
  resolveExternalAssetView,
} from "./resolver.js";
export type {
  ExternalAssetDerivedView,
  ExternalAssetResolutionInput,
  ExternalAssetResolutionState,
  ExternalAssetResolutionView,
} from "./resolver.js";

export {
  DEFAULT_MAX_IMPORTED_TEXT_BYTES,
  EXTERNAL_ASSET_DENIAL_REASONS,
  EXTERNAL_ASSET_REFERENCE_CANDIDATE_DOMAIN,
  EXTERNAL_ASSET_REFERENCE_PROVENANCE_DOMAIN,
  EXTERNAL_ASSET_REFERENCE_RELATION,
  externalAssetPublishEffectInputOf,
  externalAssetReferenceCandidateDigestOf,
  externalAssetReferenceProvenanceDigestOf,
  makeExternalAssetBridgeService,
  materializeExternalAssetReferenceProvenance,
  parseExternalAssetReferenceCandidate,
  parseExternalAssetReferenceProvenance,
  sqliteExternalAssetAssociationPort,
  sqliteExternalAssetJournalPort,
} from "./service.js";
export type {
  ExternalAssetAssociationInput,
  ExternalAssetAssociationPort,
  ExternalAssetBridgeService,
  ExternalAssetBridgeServiceDeps,
  ExternalAssetDenialReason,
  ExternalAssetDenied,
  ExternalAssetImportCommit,
  ExternalAssetImportCommitted,
  ExternalAssetImportPreparation,
  ExternalAssetImportStale,
  ExternalAssetInspectInput,
  ExternalAssetJournalPort,
  ExternalAssetPrepareImportInput,
  ExternalAssetPreparePublicationInput,
  ExternalAssetPrepareReferenceInput,
  ExternalAssetProjectBasis,
  ExternalAssetProjectScopePort,
  ExternalAssetPublicationApprovalRequired,
  ExternalAssetPublicationFailed,
  ExternalAssetPublicationPublished,
  ExternalAssetPublicationResult,
  ExternalAssetPublishInvoker,
  ExternalAssetReferenceCandidate,
  ExternalAssetReferenceCommit,
  ExternalAssetReferenceCommitted,
  ExternalAssetReferencePreparation,
  ExternalAssetReferenceProvenance,
  ExternalAssetReferenceStale,
  ExternalAssetSearchInput,
} from "./service.js";
