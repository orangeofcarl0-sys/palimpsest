/**
 * Trajectory-P2-B §12 — THE EXECUTION-ASSOCIATION DOMAIN BARREL.
 *
 * One typed, append-only durable concern for observed execution identity, divided into:
 *
 *   contract.ts        the typed event schemas and their strict parsers
 *   store.ts           the dedicated append-only SQLite substrate
 *   ingestion.ts       the trusted write path, bound to the deployment's own source basis
 *   qualification.ts   the source-verifying read side (the ONLY place a binding is qualified)
 *
 * Layer: L2 (`src/execution_association/`). It owns durable evidence and decides nothing about Work:
 * no settlement, no verification, no promotion, no handoff.
 */
export {
  EXECUTION_ASSOCIATION_SCHEMA_VERSION,
  EXECUTION_ASSOCIATION_DOMAIN,
  EXECUTION_ASSOCIATION_EVENT_TYPES,
  EXECUTION_ASSOCIATION_EVENT_PARSERS,
  OBSERVATION_WINDOW_STATES,
  OBSERVATION_WINDOW_CLOSE_REASONS,
  SOURCE_KINDS,
  associationEventId,
  parseSessionIdentityObserved,
  parseInvocationObservationFinalized,
} from "./contract.js";
export type {
  ExecutionAssociationEventType,
  ExecutionAssociationEvent,
  ExecutionAssociationAppendRequest,
  ExecutionAssociationPayload,
  SessionIdentityObservedPayload,
  InvocationObservationFinalizedPayload,
  ObservationWindowState,
  ObservationWindowCloseReason,
  TrustedSourceBasis,
  SourceKind,
  ObservedIdentityInput,
} from "./contract.js";

export {
  SqliteExecutionAssociationStore,
  ExecutionAssociationStoreError,
  ExecutionAssociationConflictError,
  defaultExecutionAssociationPath,
} from "./store.js";
export type { ExecutionAssociationStore, AssociationAppendOutcome } from "./store.js";

export { computeTrustedSourceBasis, createExecutionAssociationRecorder } from "./ingestion.js";
export type { ExecutionAssociationRecorder, IngestionOutcome } from "./ingestion.js";

export { ASSOCIATION_QUALIFICATION_STATES, makeAssociationQualifier } from "./qualification.js";
export type {
  AssociationQualificationState,
  AssociationQualification,
  QualifiedAssociation,
  UnqualifiedAssociation,
  AssociationQualifier,
  WorkRevalidationPort,
  DshSourceRevalidationPort,
  QualificationBasis,
} from "./qualification.js";

export {
  SUPPORTED_PRODUCER_SOURCE_KINDS,
  makeTrustedSourceRegistry,
  registryFromSingleBasis,
  qualifyRecordSource,
} from "./source.js";
export type { TrustedSourceEpoch, TrustedSourceRegistry, SourceQualificationOutcome } from "./source.js";

export { WINDOW_INTEGRITY_STATES, WINDOW_INTEGRITY_REASONS, validateObservationWindow } from "./window_integrity.js";
export type { WindowIntegrityState, WindowIntegrityReason, WindowIntegrityVerdict } from "./window_integrity.js";
