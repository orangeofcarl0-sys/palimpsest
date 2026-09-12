/**
 * G10-E1 coordination package: the ONE canonical Palimpsest-owned
 * append-only coordination history store plus the explicit Invocation /
 * Participation semantics (the Activation ↔ Attempt relation, recorded —
 * never inferred, never owned).
 */

export { activationRefOf, attemptRefOf, materializeInvocation, materializeParticipation, ParticipationError } from "./participation.js";
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
  CoordinationStoreError,
  SqliteCoordinationStore,
  defaultCoordinationPath,
  COORDINATION_STORE_DOMAIN,
} from "./store.js";
export type {
  CoordinationAppendRequest,
  CoordinationEvent,
  CoordinationEventType,
  CoordinationStore,
  CoordinationEventPayload,
  InvocationRecordedPayload,
  ParticipationEndedPayload,
  ParticipationStartedPayload,
} from "./store.js";
export { makeParticipationService } from "./participate.js";
export type { AttemptCatalogPort, ParticipationDeps, ParticipationService } from "./participate.js";
export { SqliteAttemptCatalog } from "./attempts.js";
