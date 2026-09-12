/**
 * G10-D2 ephemeral runtime realization service — the first executable runtime
 * path: BindingSelection = ephemeral → Activation → RuntimeCarrier, with no
 * PersistentPoint anywhere (§37/§48 hard invariant).
 *
 * Flow (§47):
 *   1. freshness check against the caller-supplied CURRENT grounded state
 *      (G10-C `evaluateGroundedPlanFreshness` — no second algorithm); a stale
 *      plan is refused, never realized;
 *   2. semantic preparation via the D1 kernel (coherence + per-subject
 *      targets, activation ids from the allocator seam);
 *   3. carrier realization THROUGH the Ordarium action (`effects.invoke`) —
 *      the port is never called directly by this service (§42);
 *   4. only after a successful effect: materialize Activation +
 *      RuntimeAttachment (host identities verbatim; session only when the
 *      host supplied one).
 *
 * D2 scope: every prepared target must be ephemeral — a persistent selection
 * is REFUSED (`persistent_selection`), never silently realized or fallen back
 * to ephemeral; D3 extends realization with the continuity store (§64).
 *
 * Failure semantics (§105/§106): `plan_stale` / `persistent_selection`
 * refusals are distinct outcomes; effect failures map to
 * `runtime_realization_failed` (Ordarium authorization failures to
 * `effect_denied`); none of them is a Binding unsatisfied or an Attempt
 * failure. A failure after earlier subjects realized leaves those
 * activations/attachments materialized — each realization is independent and
 * idempotent by realizationKey, so retries repair rather than duplicate.
 *
 * No clock, no randomness here: activation ids come from the injected
 * allocator seam (effect-layer code may use stable UUIDs; §21/§81).
 */

import { ActionDeniedError } from "@ordarium/core";

import type { PalimpsestEffectsRuntime } from "../effects/index.js";
import { defineRuntimeCarrierEffects } from "../effects/runtime_actions.js";
import type { RuntimeCarrierEffects } from "../effects/runtime_actions.js";
import type { ArchitectureDefinition } from "../architecture/index.js";
import type { SatisfiedBindingResolution } from "../binding/contract.js";
import type { CompiledBindingPlan, GroundedPlanningState } from "../binding/index.js";
import { evaluateGroundedPlanFreshness } from "../binding/index.js";
import type { RunDefinition } from "../run/index.js";
import type {
  Activation,
  ActivationId,
  PreparedRuntimeRealization,
  RuntimeAttachment,
} from "./identity.js";
import {
  materializeActivation,
  materializeRuntimeAttachment,
  prepareRuntimeRealization,
} from "./identity.js";

export type AgentDefinitionSubject = string;


export interface RuntimeRealizationDeps {
  readonly effects: PalimpsestEffectsRuntime;
  /** Effect-layer allocator seam (§21): stable UUIDs allowed here; tests inject deterministic allocators. */
  readonly allocateActivationId: (subject: AgentDefinitionSubject) => ActivationId;
}

export interface RuntimeRealizationRequest {
  readonly architecture: ArchitectureDefinition;
  readonly runDefinition: RunDefinition;
  readonly resolution: SatisfiedBindingResolution;
  readonly plan: CompiledBindingPlan;
  /** The CURRENT grounded state — the freshness basis checked immediately before preparation (§47/§84). */
  readonly current: GroundedPlanningState;
}

export interface RealizedActivation {
  readonly activation: Activation;
  readonly attachment: RuntimeAttachment;
}

export type RuntimeRealizationOutcome =
  | { readonly status: "realized"; readonly realizations: readonly RealizedActivation[] }
  | { readonly status: "refused"; readonly reason: "plan_stale" | "persistent_selection"; readonly detail: string }
  | {
      readonly status: "failed";
      readonly reason: "runtime_realization_failed" | "effect_denied";
      readonly subject: AgentDefinitionSubject;
      readonly detail: string;
    };

export interface RuntimeRealizationScope {
  /** Ordarium invocation scope; defaults to "runtime-realization". */
  readonly scope?: string | undefined;
}

/**
 * Realize the ephemeral subjects of a grounded planned result through
 * Ordarium. All-or-nothing per subject; independent across subjects.
 */
/**
 * The production service factory: binds the carrier port's Ordarium actions
 * once (ports are fixed at assembly, §49/§92) and returns the realization
 * and release operations. The port is reachable ONLY inside the action
 * `execute` (§42).
 */
export function makeRuntimeRealizationService(deps: {
  readonly effects: PalimpsestEffectsRuntime;
  readonly allocateActivationId: (subject: AgentDefinitionSubject) => ActivationId;
  readonly port: import("./carrier_port.js").RuntimeCarrierPort;
}) {
  const actions = defineRuntimeCarrierEffects(deps.port);

  async function realizeEphemeral(
    request: RuntimeRealizationRequest,
    scope: RuntimeRealizationScope = {},
  ): Promise<RuntimeRealizationOutcome> {
    if (evaluateGroundedPlanFreshness(request.plan, request.resolution, request.current) === "stale") {
      return Object.freeze({
        status: "refused",
        reason: "plan_stale",
        detail:
          "the plan/BindingResolution is stale against the current grounded state — re-observe and re-resolve",
      }) as RuntimeRealizationOutcome;
    }

    const activationIds: Record<string, ActivationId> = {};
    for (const agent of request.architecture.agentDefinitions) {
      activationIds[agent.agentDefinitionId] = deps.allocateActivationId(agent.agentDefinitionId);
    }
    let prepared: readonly PreparedRuntimeRealization[];
    try {
      prepared = prepareRuntimeRealization({
        architecture: request.architecture,
        runDefinition: request.runDefinition,
        resolution: request.resolution,
        plan: request.plan,
        activationIds,
        current: request.current,
      });
    } catch (error) {
      // Coherence failures are configuration errors (§105): fail loudly.
      throw error;
    }

    const persistent = prepared.find((entry) => entry.continuityTarget.kind === "persistent");
    if (persistent !== undefined) {
      return Object.freeze({
        status: "refused",
        reason: "persistent_selection",
        detail: `subject "${persistent.agentDefinitionId}" selected persistent continuity — persistent realization requires the continuity store (G10-D3)`,
      }) as RuntimeRealizationOutcome;
    }

    const realizations: RealizedActivation[] = [];
    const intentRevision = request.runDefinition.work.revision;
    for (const entry of prepared) {
      try {
        const result = await deps.effects.invoke(
          actions.runtimeCarrierRealize,
          {
            realizationKey: entry.realizationKey,
            activationId: entry.activationId,
            agentDefinitionId: entry.agentDefinitionId,
            runDefinitionDigest: entry.runDefinition.digest,
            bindingResolutionId: entry.bindingResolution.resolutionId,
            bindingResolutionDigest: entry.bindingResolution.digest,
            continuityKind: entry.continuityTarget.kind,
            continuityPoint:
              entry.continuityTarget.kind === "persistent" ? entry.continuityTarget.point : null,
          },
          {
            scope: scope.scope ?? "runtime-realization",
            callId: entry.realizationKey,
            revision: intentRevision,
          },
        );
        const activation = materializeActivation({
          activationId: entry.activationId,
          agentDefinitionId: entry.agentDefinitionId,
          runDefinition: entry.runDefinition,
          bindingResolution: entry.bindingResolution,
        });
        const attachment = materializeRuntimeAttachment({
          activationId: entry.activationId,
          runtimeAgent: { runtimeAdapter: result.runtimeAdapter, agentId: result.agentId },
          ...(result.sessionId === null ? {} : { session: { runtimeAdapter: result.runtimeAdapter, sessionId: result.sessionId } }),
          continuityTarget: entry.continuityTarget,
        });
        realizations.push(Object.freeze({ activation, attachment }));
      } catch (error) {
        // §105: effect denial (Ordarium ActionDeniedError) is distinct from a
        // failed realization (port/host failure, including Ordarium-wrapped
        // OperationFailedError). Neither is a Binding unsatisfied or an
        // Attempt failure.
        const denied = error instanceof ActionDeniedError;
        return Object.freeze({
          status: "failed",
          reason: denied ? "effect_denied" : "runtime_realization_failed",
          subject: entry.agentDefinitionId,
          detail: error instanceof Error ? error.message : String(error),
        }) as RuntimeRealizationOutcome;
      }
    }
    return Object.freeze({ status: "realized", realizations: Object.freeze(realizations) }) as RuntimeRealizationOutcome;
  }

  async function releaseCarrier(request: {
    readonly realizationKey: string;
    readonly activationId: ActivationId;
    readonly runtimeAgent: { runtimeAdapter: string; agentId: string };
  }, scope: RuntimeRealizationScope = {}): Promise<{ status: "released" } | { status: "failed"; reason: "runtime_realization_failed" | "effect_denied"; detail: string }> {
    try {
      await deps.effects.invoke(
        actions.runtimeCarrierRelease,
        {
          realizationKey: request.realizationKey,
          activationId: request.activationId,
          runtimeAdapter: request.runtimeAgent.runtimeAdapter,
          agentId: request.runtimeAgent.agentId,
        },
        {
          scope: scope.scope ?? "runtime-realization",
          callId: `release:${request.realizationKey}`,
          revision: 0,
        },
      );
      return { status: "released" };
    } catch (error) {
      const denied = error instanceof ActionDeniedError;
      return {
        status: "failed",
        reason: denied ? "effect_denied" : "runtime_realization_failed",
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return { realizeEphemeral, releaseCarrier };
}
