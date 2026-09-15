/**
 * G10-V Project Workspace — barrel.
 *
 *   ProjectWorkspace ≠ CanonicalStore        ProjectAssetAssociation ≠ AssetContent
 *   OpenLoop ≠ WorkTask                      Opportunity ≠ Task
 *   OrganizationMode orthogonal to management mode
 *   NegativeResult grants no truth           Explicit promotion, never automatic
 *
 * Two narrowly-owned append-only stores (asset associations, project journal)
 * plus a DERIVED read-only workspace view and the service that composes them
 * over existing canonical truths. No copied facts and no second history.
 */

export {
  ASSET_ASSOCIATED,
  ASSOCIATION_KINDS,
  PROJECT_ASSET_ASSOCIATION_DOMAIN,
  PROJECT_ASSET_ASSOCIATION_ID_DOMAIN,
  PROJECT_ASSET_KINDS,
  PROJECT_WORKSPACE_CHAIN_DOMAIN,
  PROJECT_WORKSPACE_EVENT_ID_DOMAIN,
  PROJECT_WORKSPACE_OPENED,
  ProjectWorkspaceError,
  SqliteProjectAssetAssociationStore,
  assetAssociatedEvent,
  associatedAssetsOf,
  defaultProjectAssetAssociationPath,
  materializeProjectAssetAssociation,
  parseCanonicalAssetRef,
  parseProjectAssetAssociation,
  projectAssetAssociationDigestOf,
  projectAssetAssociationIdOf,
  projectWorkspaceChainDigest,
  projectWorkspaceEventIdOf,
  projectWorkspaceOpenedEvent,
} from "./association.js";
export type {
  AssociationKind,
  CanonicalAssetRef,
  CanonicalAssetRefInput,
  ProjectAssetAssociation,
  ProjectAssetAssociationStore,
  ProjectAssetKind,
  ProjectWorkspaceBasis,
  ProjectWorkspaceEvent,
  ProjectWorkspaceEventDraft,
  ProjectWorkspaceEventParsers,
  ProjectWorkspaceEventType,
  ProjectWorkspaceStoreErrorKind,
} from "./association.js";

export {
  JOURNAL_ENTRY_RECORDED,
  JOURNAL_ENTRY_RESOLVED,
  JOURNAL_OPENED,
  PROJECT_JOURNAL_CHAIN_DOMAIN,
  PROJECT_JOURNAL_ENTRY_DOMAIN,
  PROJECT_JOURNAL_ENTRY_ID_DOMAIN,
  PROJECT_JOURNAL_EVENT_ID_DOMAIN,
  PROJECT_JOURNAL_KINDS,
  PROJECT_JOURNAL_RESOLUTION_STATUSES,
  SqliteProjectJournalStore,
  defaultProjectJournalPath,
  journalEntryRecordedEvent,
  journalEntryResolvedEvent,
  journalOpenedEvent,
  materializeProjectJournalEntry,
  materializeProjectJournalResolution,
  parseProjectJournalEntry,
  parseProjectJournalRef,
  parseProjectJournalResolution,
  projectJournalChainDigest,
  projectJournalEntryDigestOf,
  projectJournalEntryIdOf,
  projectJournalEventIdOf,
  projectJournalView,
} from "./journal.js";
export type {
  ProjectJournalBasis,
  ProjectJournalEntry,
  ProjectJournalEvent,
  ProjectJournalEventDraft,
  ProjectJournalEventType,
  ProjectJournalKind,
  ProjectJournalRef,
  ProjectJournalResolution,
  ProjectJournalResolutionStatus,
  ProjectJournalStore,
  ProjectJournalViewEntry,
} from "./journal.js";

export { OPEN_LOOP_KINDS, buildProjectWorkspaceView } from "./view.js";
export type {
  MemoryExperimentSnapshot,
  OpenLoop,
  OpenLoopKind,
  OpenLoopSubjectRef,
  PendingKnowledgeRef,
  ProjectWorkspaceAssetsView,
  ProjectWorkspaceRelationsView,
  ProjectWorkspaceView,
  ProjectWorkspaceViewSources,
  ProjectWorkspaceWorkView,
  ProofClaimSnapshot,
  ReasoningCellSnapshot,
  WorkspaceAttemptView,
  WorkspaceEvidenceView,
  WorkspaceHistoryEntry,
  WorkspaceOpenTaskView,
  WorkspaceProjectRef,
  WorkspaceProjectView,
  WorkspacePromotionView,
  WorkspaceResumeView,
  WorkspaceTaskView,
} from "./view.js";

export { DECISION_ID_DOMAIN, makeProjectWorkspaceService } from "./service.js";
export type {
  AppendDecisionInput,
  AppendDecisionResult,
  AssociateAssetInput,
  ProjectWorkspaceCampaignPort,
  ProjectWorkspaceMemoryPort,
  ProjectWorkspaceProofPort,
  ProjectWorkspaceService,
  ProjectWorkspaceServiceDeps,
  PromoteOpportunityInput,
  PromoteOpportunityResult,
  RecordJournalEntryInput,
  ResolveJournalEntryInput,
} from "./service.js";
