/**
 * G10-D runtime grounding package: semantic runtime identity (Activation,
 * RuntimeAgentRef, SessionRef, RuntimeAttachment, PreparedRuntimeRealization)
 * and the pure realization decision kernel. Effect admission lives in the
 * effects surface (Ordarium); host carriers live behind injected ports.
 */

export {
  RuntimeRealizationError,
  continuityTargetOf,
  materializeActivation,
  materializeRuntimeAttachment,
  prepareRuntimeRealization,
  runtimeRealizationKey,
} from "./identity.js";
export type {
  Activation,
  ActivationId,
  PreparedRuntimeRealization,
  RuntimeAgentRef,
  RuntimeAttachment,
  RuntimeContinuityTarget,
  SessionRef,
} from "./identity.js";
