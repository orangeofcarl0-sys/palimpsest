/**
 * G10-E1/F0 coordination package: the ONE canonical Palimpsest-owned
 * append-only coordination history store plus the explicit Invocation /
 * Participation semantics (the Activation ↔ Attempt relation, recorded —
 * never inferred, never owned).
 *
 * F0 adds the crash-atomic conditional batch primitive (`appendAtomic` +
 * `head`), the granular conflict taxonomy, and the complete strict parser
 * registry (participation + federation + commitment) so the shared store can
 * never persist an unvalidated artifact.
 */

export {
  activationRefOf,
  attemptRefOf,
  materializeInvocation,
  materializeParticipation,
  ParticipationError,
  PARTICIPATION_EVENT_PARSERS,
  parseActivationRef,
  parseAttemptRef,
  parseInvocation,
  parseInvocationRef,
  parseParticipation,
  parseParticipationEndReason,
} from "./participation.js";
export type {
  ActivationRef,
  AttemptRef,
  Invocation,
  InvocationId,
  InvocationRef,
  Participation,
  ParticipationEndReason,
  ParticipationId,
} from "./participation.js";
export {
  COORDINATION_STORE_DOMAIN,
  DEFAULT_COORDINATION_EVENT_PARSERS,
  CoordinationConflictError,
  CoordinationStoreError,
  SqliteCoordinationStore,
  defaultCoordinationPath,
} from "./store.js";
export type {
  CoordinationAppendRequest,
  CoordinationAtomicAppend,
  CoordinationEvent,
  CoordinationEventType,
  CoordinationStore,
  CoordinationEventPayload,
  CoordinationEventParsers,
  CoordinationEventPayloadParser,
  InvocationRecordedPayload,
  ParticipationEndedPayload,
  ParticipationStartedPayload,
  SqliteCoordinationStoreOptions,
} from "./store.js";
export type { CoordinationConflictCategory } from "./errors.js";
export { makeParticipationService } from "./participate.js";
export type { AttemptCatalogPort, ParticipationDeps, ParticipationService } from "./participate.js";
export { SqliteAttemptCatalog } from "./attempts.js";
