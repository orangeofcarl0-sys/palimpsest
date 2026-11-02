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

/** PC1 S07: installed-runtime diagnostics and resource accounting (no new runtime owner). */
export { runDoctor } from "./doctor.js";
export type { DoctorCheck, DoctorInput, DoctorReport, DoctorStatus } from "./doctor.js";
export { DOCTOR_STATUSES } from "./doctor.js";
export { canStartSession, classifyRun, dedupeUsage, sumUsage } from "./usage.js";
export type { BudgetState, BudgetWindow, RunClassification, RunClassificationInput, UsageEntry, UsageTotals } from "./usage.js";
export { terminateProcessTree } from "./process.js";
