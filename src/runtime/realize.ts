/**
 * G10-D2 ephemeral runtime realization service — the first executable runtime
 * path: BindingSelection = ephemeral → Activation → RuntimeCarrier, with no
 * PersistentPoint anywhere (§37/§48 hard invariant).
 *
 * Flow (§47/§64):
 *   1. freshness check against the caller-supplied CURRENT grounded state
 *      (G10-C `evaluateGroundedPlanFreshness` — no second algorithm); a stale
 *      plan is refused, never realized;
 *   2. semantic preparation via the D1 kernel (coherence + per-subject
 *      targets, activation ids from the allocator seam);
 *   3. persistent targets: verify the selected point EXISTS in the canonical
 *      continuity store before any effect (fail closed, §64/§65);
 *   4. carrier realization THROUGH the Ordarium action (`effects.invoke`) —
 *      the port is never called directly by this service (§42);
 *   5. only after a successful effect: materialize Activation +
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
import type { PersistentPointStore } from "../continuity/index.js";
import { durableContinuityRefOf } from "../continuity/index.js";
import { ContinuityUnavailableError } from "./errors.js";

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
  ActivationContextId,
  ActivationId,
  PreparedRuntimeRealization,
  RuntimeAttachment,
  RuntimeReleaseHandle,
} from "./identity.js";
import {
  materializeActivation,
  materializeRuntimeAttachment,
  materializeRuntimeReleaseHandle,
  prepareRuntimeRealization,
  requireActivationContextId,
} from "./identity.js";

export type AgentDefinitionSubject = string;


export interface RuntimeRealizationDeps {
  readonly effects: PalimpsestEffectsRuntime;
  /**
   * Effect-layer allocator seam (§21): stable UUIDs allowed here; tests
   * inject deterministic allocators. The `context` distinguishes a RETRY of
   * the same activation (same context ⇒ same ids ⇒ Ordarium idempotent dedupe)
   * from a genuinely NEW activation such as post-release carrier replacement
   * (new context ⇒ new ids ⇒ a fresh operation, §67).
   */
  readonly allocateActivationId: (subject: AgentDefinitionSubject, context: string) => ActivationId;
  /**
   * The canonical continuity store (D3 §64). REQUIRED for realizing
   * persistent selections — a persistent target without a store is a
   * configuration error at assembly, and a selected-but-unregistered point
   * fails closed at realization (never auto-created, §59/§65).
   */
  readonly pointStore?: PersistentPointStore;
}

export interface RuntimeRealizationRequest {
  readonly architecture: ArchitectureDefinition;
  readonly runDefinition: RunDefinition;
  readonly resolution: SatisfiedBindingResolution;
  readonly plan: CompiledBindingPlan;
  /** The CURRENT grounded state — the freshness basis checked immediately before preparation (§47/§84). */
  readonly current: GroundedPlanningState;
  /**
   * Explicit activation context (G10-E0 D-API-01): the same context id is a
   * retry of the same activation (Ordarium-deduped); a new context id is a
   * genuinely new activation / carrier replacement. REQUIRED — never
   * defaulted — so retry-vs-replacement cannot be confused by omission.
   */
  readonly activationContext: ActivationContextId;
}

export interface RealizedActivation {
  readonly activation: Activation;
  readonly attachment: RuntimeAttachment;
  /** Release authority artifact — the ONLY sanctioned argument for release (D-AUTH-01). */
  readonly release: RuntimeReleaseHandle;
}

export type RuntimeRealizationOutcome =
  | { readonly status: "realized"; readonly realizations: readonly RealizedActivation[] }
  | { readonly status: "refused"; readonly reason: "plan_stale"; readonly detail: string }
  | {
      readonly status: "failed";
      readonly reason:
        | "runtime_realization_failed"
        | "effect_denied"
        | "persistent_point_missing"
        | "continuity_unavailable";
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
 * The production service factory (D3 §64 extends D2): binds the carrier
 * port's Ordarium actions once (ports are fixed at assembly, §49/§92) and
 * returns the realization and release operations. The port is reachable ONLY
 * inside the action `execute` (§42). With a `pointStore`, persistent
 * selections realize against verified existing points — fail closed on
 * missing points (never auto-created, never downgraded to ephemeral, §65)
 * and on loci that became unavailable after resolution (§66).
 */
export function makeRuntimeRealizationService(deps: RuntimeRealizationDeps & {
  readonly port: import("./carrier_port.js").RuntimeCarrierPort;
}) {
  const actions = defineRuntimeCarrierEffects(deps.port);

  async function realize(
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

    // G10-E0 D-API-01: the context is REQUIRED and grammar-validated — retry
    // vs replacement is explicit at the public boundary.
    const context = requireActivationContextId(request.activationContext);
    const activationIds: Record<string, ActivationId> = {};
    for (const agent of request.architecture.agentDefinitions) {
      activationIds[agent.agentDefinitionId] = deps.allocateActivationId(agent.agentDefinitionId, context);
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

    const realizations: RealizedActivation[] = [];
    const intentRevision = request.runDefinition.work.revision;
    for (const entry of prepared) {
      // D3 §64: a persistent target must reference an EXISTING canonical
      // point — verified before the effect. Fail closed: no auto-create
      // (§59), no other point, no ephemeral downgrade (§65).
      if (entry.continuityTarget.kind === "persistent") {
        if (deps.pointStore === undefined) {
          return Object.freeze({
            status: "failed",
            reason: "persistent_point_missing",
            subject: entry.agentDefinitionId,
            detail:
              "persistent realization requires the canonical continuity store, which was not provided at assembly",
          }) as RuntimeRealizationOutcome;
        }
        const point = await deps.pointStore.get(entry.continuityTarget.point);
        if (point === undefined) {
          return Object.freeze({
            status: "failed",
            reason: "persistent_point_missing",
            subject: entry.agentDefinitionId,
            detail: `BindingResolution selected point "${entry.continuityTarget.point}" but the canonical continuity store does not contain it — re-observe and re-resolve (never auto-created)`,
          }) as RuntimeRealizationOutcome;
        }
      }
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
        // §66: a not-realized typed result means the locus became unavailable
        // before the effect — fail closed, never downgrade to ephemeral.
        if (!result.realized || result.runtimeAdapter === null || result.agentId === null) {
          return Object.freeze({
            status: "failed",
            reason: "continuity_unavailable",
            subject: entry.agentDefinitionId,
            detail:
              result.reason ??
              `continuity locus unavailable for subject "${entry.agentDefinitionId}"`,
          }) as RuntimeRealizationOutcome;
        }
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
        // D-AUTH-01: the release handle is generated HERE (only after effect
        // success) with the authorized Work revision DERIVED from the realized
        // RunDefinition — never caller-supplied.
        const release = materializeRuntimeReleaseHandle({
          realizationKey: entry.realizationKey,
          activationId: entry.activationId,
          runtimeAgent: attachment.runtimeAgent,
          workRevision: request.runDefinition.work.revision,
          runDefinition: entry.runDefinition,
        });
        realizations.push(Object.freeze({ activation, attachment, release }));
      } catch (error) {
        // §105/§107: effect denial (Ordarium ActionDeniedError) and ordinary
        // realization failures stay distinct. Neither is a Binding
        // unsatisfied or an Attempt failure.
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

  /**
   * Release via the handle (G10-E0 D-AUTH-01 §11): the ONLY release API. The
   * Ordarium intent revision is DERIVED from `handle.authorizedWorkRevision` —
   * no caller-written authorization revision exists.
   */
  async function releaseCarrier(handle: RuntimeReleaseHandle, scope: RuntimeRealizationScope = {}): Promise<{ status: "released" } | { status: "failed"; reason: "runtime_realization_failed" | "effect_denied"; detail: string }> {
    try {
      await deps.effects.invoke(
        actions.runtimeCarrierRelease,
        {
          realizationKey: handle.realizationKey,
          activationId: handle.activationId,
          runtimeAdapter: handle.runtimeAgent.runtimeAdapter,
          agentId: handle.runtimeAgent.agentId,
        },
        {
          scope: scope.scope ?? "runtime-realization",
          callId: `release:${handle.realizationKey}`,
          // D-AUTH-01 §12: the authorization evidence names the Work revision
          // that authorized the realization — never a fabricated revision.
          revision: handle.authorizedWorkRevision,
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

  return { realize, releaseCarrier };
}
