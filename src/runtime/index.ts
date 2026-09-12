/**
 * G10-D runtime grounding package: semantic runtime identity (Activation,
 * RuntimeAgentRef, SessionRef, RuntimeAttachment, PreparedRuntimeRealization)
 * and the pure realization decision kernel. Effect admission lives in the
 * effects surface (Ordarium); host carriers live behind injected ports.
 */

export { callbackRuntimeCarrierPort } from "./carrier_port.js";
export {
  materializeRuntimeReleaseHandle,
  requireActivationContextId,
  RuntimeRealizationError,
  continuityTargetOf,
  materializeActivation,
  materializeRuntimeAttachment,
  prepareRuntimeRealization,
  runtimeRealizationKey,
} from "./identity.js";
export { ContinuityUnavailableError } from "./errors.js";
export { makeRuntimeRealizationService } from "./realize.js";
export { observeBindingState, observeAndCompileGroundedPlan } from "./observation.js";
export type {
  LiveCompileOutcome,
  LiveCompileRequest,
  ObservationDeps,
  ObservationKnowledge,
  ObservationOutcome,
  PersistentPointObservation,
  RuntimeObservationPort,
} from "./observation.js";
export type {
  RealizedActivation,
  RuntimeRealizationDeps,
  RuntimeRealizationOutcome,
  RuntimeRealizationRequest,
  RuntimeRealizationScope,
} from "./realize.js";
export type {
  Activation,
  ActivationContextId,
  ActivationId,
  PreparedRuntimeRealization,
  RuntimeAgentRef,
  RuntimeAttachment,
  RuntimeContinuityTarget,
  RuntimeReleaseHandle,
  SessionRef,
} from "./identity.js";
export type {
  CallbackRuntimeCarrierPortCallbacks,
  RuntimeCarrierPort,
  RuntimeCarrierRealizeRequest,
  RuntimeCarrierRealizeResult,
  RuntimeCarrierReleaseRequest,
} from "./carrier_port.js";
