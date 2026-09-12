/**
 * G10-D2 RuntimeCarrierPort — the host-neutral runtime carrier seam.
 *
 * The port is RUNTIME-OWNED (§39): adapters choose model/provider/tools/
 * session strategy internally; those choices never leak back into
 * AgentDefinition or RunConfiguration. Palimpsest consumes only the narrow
 * host-identity refs the port returns.
 *
 * Contract obligations (§44/§45):
 *   - `realize` MUST honor `realizationKey` idempotently: a retry after
 *     crash/uncertainty with the same key returns the same existing carrier
 *     instead of spawning a duplicate. Exactly-once external execution is NOT
 *     assumed; the stable key is the idempotency basis end to end.
 *   - `runtimeAgent`/`session` are host-owned identities — the adapter returns
 *     what the host actually created; `session` stays absent when the host
 *     does not expose session identity (never synthesized).
 *
 * `CallbackRuntimeCarrierPort` (§40) is a PRODUCTION-USABLE adapter for
 * embedding hosts: the callbacks ARE the host integration, not a mock. A
 * deterministic fake for tests may exist separately in test helpers.
 *
 * Observation is deliberately NOT part of this port (§75): realize/release are
 * mutations (Ordarium-admitted); observation is read-only and gets its own
 * port in D4. Keep observe ≠ realize separate.
 */

import type { ActivationId, RuntimeAgentRef, RuntimeContinuityTarget, SessionRef } from "./identity.js";

export interface RuntimeCarrierRealizeRequest {
  /** Stable idempotency basis (activationId + plan/ref basis + continuity target). */
  readonly realizationKey: string;
  readonly activationId: ActivationId;
  readonly agentDefinitionId: string;
  readonly runDefinitionDigest: string;
  readonly bindingResolutionId: string;
  readonly bindingResolutionDigest: string;
  readonly continuityTarget: RuntimeContinuityTarget;
}

export interface RuntimeCarrierRealizeResult {
  readonly runtimeAgent: RuntimeAgentRef;
  readonly session?: SessionRef;
}

export interface RuntimeCarrierReleaseRequest {
  readonly realizationKey: string;
  readonly activationId: ActivationId;
  readonly runtimeAgent: RuntimeAgentRef;
}

export interface RuntimeCarrierPort {
  readonly adapterId: string;
  realize(request: RuntimeCarrierRealizeRequest): Promise<RuntimeCarrierRealizeResult>;
  release?(request: RuntimeCarrierReleaseRequest): Promise<void>;
}

export interface CallbackRuntimeCarrierPortCallbacks {
  onRealize(request: RuntimeCarrierRealizeRequest): Promise<RuntimeCarrierRealizeResult>;
  onRelease?(request: RuntimeCarrierReleaseRequest): Promise<void>;
}

/**
 * Production-usable callback adapter: the embedding host supplies the actual
 * carrier create/release behavior. This is a real port implementation, not a
 * test double.
 */
export function callbackRuntimeCarrierPort(
  adapterId: string,
  callbacks: CallbackRuntimeCarrierPortCallbacks,
): RuntimeCarrierPort {
  return {
    adapterId,
    realize: (request) => callbacks.onRealize(request),
    ...(callbacks.onRelease === undefined ? {} : { release: (request: RuntimeCarrierReleaseRequest) => callbacks.onRelease!(request) }),
  };
}
