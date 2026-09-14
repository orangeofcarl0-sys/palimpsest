/** G10-P semantic attention: deterministic derivation + separate host activation. */

export {
  ATTENTION_SIGNAL_DOMAIN,
  AttentionSignalError,
  attentionSignalIdOf,
  materializeAttentionCandidate,
  withEscalation,
  parseAttentionSubjectRef,
  parseAttentionSignal,
  type AttentionKind,
  type AttentionSubjectRef,
  type AttentionSignal,
  type AttentionCandidate,
} from "./signals.js";

export {
  SqliteAttentionMarkStore,
  defaultAttentionMarkPath,
  type AttentionMarkStore,
} from "./marks.js";

export {
  defaultAttentionPolicy,
  makeAttentionService,
  type AttentionPolicy,
  type AttentionService,
  type AttentionServiceDeps,
  type AttentionFederationPort,
  type BoundaryAttentionReadPort,
  type PendingBoundaryDecision,
  type BoundaryAcceptedHead,
} from "./service.js";

export {
  nullAttentionAdapter,
  recordingAttentionAdapter,
  dshAgentsAttentionAdapter,
  piAttentionAdapter,
  defaultAttentionText,
  type AttentionActivationPort,
  type AttentionActivationOutcome,
  type RecordingAttentionAdapter,
  type DshAgentLike,
  type DshAgentsServiceLike,
  type PiHostLike,
} from "./host_adapter.js";
