/**
 * G10-D1 runtime identity kernel — the semantic entities that execute an
 * AgentDefinition without collapsing it into the host carrier.
 *
 * Identity boundaries (the campaign's decisive distinctions, all load-bearing
 * and machine-proven):
 *
 *   AgentDefinition ≠ Activation      (definition ≠ one runtime activation)
 *   Activation      ≠ Attempt         (no task/attempt identity here — the
 *                                      Activation ↔ Attempt relation stays
 *                                      OPEN through Invocation/Participation)
 *   ActivationId    ≠ AgentDefinitionId ≠ RuntimeAgentRef ≠ SessionRef
 *                                     ≠ PersistentPointId
 *   RuntimeAgentRef ≠ SessionRef      (host-owned carrier vs host-owned session;
 *                                      Session is OPTIONAL and never synthesized)
 *   BindingResolution ≠ RuntimeAttachment (what continuity locus SHOULD be used
 *                                      vs what carrier/session DOES realize it now)
 *
 * Prepared vs final (G10-D §22): `PreparedRuntimeRealization` exists BEFORE any
 * external effect; `Activation`/`RuntimeAttachment` are materialized only after
 * a successful carrier realization — an effect failure never leaves canonical
 * runtime state claiming an activation exists.
 *
 * Identity allocation (§21): `ActivationId` comes from an explicit allocator
 * seam — never derived from agentDefinitionId/taskId/sessionId/runtimeAgentId.
 * Pure kernels receive already-allocated ids; effect-layer allocators may use
 * stable UUIDs; tests use deterministic allocators.
 *
 * Every artifact is deep-frozen with caller inputs detached (B3C2 standard).
 * No host calls, no Ordarium effects, no point creation — this module is
 * semantic preparation only (§28); purity is machine-audited.
 */

import type { AgentDefinitionId } from "../architecture/index.js";
import type { ArchitectureDefinition } from "../architecture/index.js";
import type {
  BindingResolutionRef,
  DurableContinuityRef,
  SatisfiedBindingResolution,
} from "../binding/contract.js";
import type { CompiledBindingPlan } from "../binding/compiler.js";
import { evaluateGroundedPlanFreshness } from "../binding/index.js";
import type { RunDefinition, RunDefinitionRef } from "../run/index.js";
import { canonicalDigest } from "../schema/canonical.js";

export type ActivationId = string;

/** Host-owned runtime carrier identity. Never a Palimpsest semantic id. */
export interface RuntimeAgentRef {
  readonly runtimeAdapter: string;
  readonly agentId: string;
}

/** Host-owned session identity. OPTIONAL — never synthesized when the host does not expose one. */
export interface SessionRef {
  readonly runtimeAdapter: string;
  readonly sessionId: string;
}

/** The continuity locus a realization targets (runtime vocabulary, derived from the Binding selection). */
export type RuntimeContinuityTarget =
  | { readonly kind: "ephemeral" }
  | { readonly kind: "persistent"; readonly point: DurableContinuityRef };

/**
 * One runtime activation of one AgentDefinition under one grounded run/plan.
 * Deliberately minimal: no taskId/attemptId (Activation↔Attempt OPEN), no
 * model/provider/session ownership/PersistentPoint state/prompt/memory.
 */
export interface Activation {
  readonly schemaVersion: 1;
  readonly activationId: ActivationId;
  readonly agentDefinitionId: AgentDefinitionId;
  readonly runDefinition: RunDefinitionRef;
  readonly bindingResolution: BindingResolutionRef;
}

/**
 * Which host runtime carrier currently realizes one Activation. Derived
 * Runtime state — never Binding truth, never Definition truth.
 */
export interface RuntimeAttachment {
  readonly schemaVersion: 1;
  readonly activationId: ActivationId;
  readonly runtimeAgent: RuntimeAgentRef;
  readonly session?: SessionRef;
  readonly continuityTarget: RuntimeContinuityTarget;
}

/**
 * The semantic realization decision for ONE Architecture subject, prepared
 * BEFORE any external effect. Carries the stable idempotency basis
 * (`realizationKey`) so host ports can provide idempotent create/resume
 * behavior across retries and crashes (§44/§45).
 */
export interface PreparedRuntimeRealization {
  readonly schemaVersion: 1;
  readonly activationId: ActivationId;
  readonly agentDefinitionId: AgentDefinitionId;
  readonly runDefinition: RunDefinitionRef;
  readonly bindingResolution: BindingResolutionRef;
  readonly continuityTarget: RuntimeContinuityTarget;
  /** Stable idempotency key: H(domain, {activationId, runDefinition, bindingResolution, continuityTarget}). */
  readonly realizationKey: string;
}

export class RuntimeRealizationError extends Error {
  constructor(
    readonly kind: "incoherent" | "plan_stale",
    message: string,
  ) {
    super(message);
    this.name = "RuntimeRealizationError";
  }
}

/** The stable idempotency basis for one prepared realization (§44). */
export function runtimeRealizationKey(input: {
  readonly activationId: ActivationId;
  readonly runDefinition: RunDefinitionRef;
  readonly bindingResolution: BindingResolutionRef;
  readonly continuityTarget: RuntimeContinuityTarget;
}): string {
  return canonicalDigest({
    domain: "palimpsest.runtime-realization-key.v1",
    activationId: input.activationId,
    runDefinition: { ...input.runDefinition },
    bindingResolution: { ...input.bindingResolution },
    continuityTarget:
      input.continuityTarget.kind === "persistent"
        ? { kind: "persistent", point: input.continuityTarget.point }
        : { kind: "ephemeral" },
  });
}

/** Explicit adapter: Binding selection vocabulary → runtime continuity target (§26 firewall kept visible). */
export function continuityTargetOf(
  selection: SatisfiedBindingResolution["continuity"][string],
): RuntimeContinuityTarget {
  return selection.kind === "persistent"
    ? Object.freeze({ kind: "persistent", point: selection.point })
    : Object.freeze({ kind: "ephemeral" });
}

/** Materialize the final Activation (only after successful carrier realization, §22). Deep-frozen. */
export function materializeActivation(input: {
  readonly activationId: ActivationId;
  readonly agentDefinitionId: AgentDefinitionId;
  readonly runDefinition: RunDefinitionRef;
  readonly bindingResolution: BindingResolutionRef;
}): Activation {
  return Object.freeze({
    schemaVersion: 1 as const,
    activationId: input.activationId,
    agentDefinitionId: input.agentDefinitionId,
    runDefinition: Object.freeze({ ...input.runDefinition }),
    bindingResolution: Object.freeze({ ...input.bindingResolution }),
  });
}

/** Materialize the final RuntimeAttachment. `session` is carried only when the host supplied one. Deep-frozen. */
export function materializeRuntimeAttachment(input: {
  readonly activationId: ActivationId;
  readonly runtimeAgent: RuntimeAgentRef;
  readonly session?: SessionRef;
  readonly continuityTarget: RuntimeContinuityTarget;
}): RuntimeAttachment {
  return Object.freeze({
    schemaVersion: 1 as const,
    activationId: input.activationId,
    runtimeAgent: Object.freeze({ ...input.runtimeAgent }),
    ...(input.session === undefined ? {} : { session: Object.freeze({ ...input.session }) }),
    continuityTarget: Object.freeze({ ...input.continuityTarget }),
  });
}

function requireRefShape(value: unknown, what: string): void {
  if (typeof value !== "object" || value === null) {
    throw new RuntimeRealizationError("incoherent", `${what} must be an object`);
  }
}

/**
 * The PURE runtime realization decision kernel (§27): a grounded planned
 * result + the ArchitectureDefinition → one `PreparedRuntimeRealization` per
 * Architecture subject, with each continuity target derived EXACTLY from the
 * BindingResolution's continuity selection for that subject.
 *
 * Coherence, fail-closed (§29):
 *   - plan.runDefinition ref matches the returned RunDefinition;
 *   - plan.bindingResolution ref matches the returned BindingResolution;
 *   - the Architecture subject set EQUALS the resolution's continuity subject set.
 *
 * Staleness gate (§30): when `current` (the grounded planning state) is
 * supplied, the plan/resolution must be CURRENT against it — reuse of the
 * G10-C grounded freshness implementation, never a second algorithm. A stale
 * plan/resolution cannot be prepared for runtime realization.
 *
 * No host calls, no Ordarium effects, no point creation (§28/§12-audit).
 */
export function prepareRuntimeRealization(input: {
  readonly architecture: ArchitectureDefinition;
  readonly runDefinition: RunDefinition;
  readonly resolution: SatisfiedBindingResolution;
  readonly plan: CompiledBindingPlan;
  /** Already-allocated ActivationIds, one per Architecture subject (allocator seam, §21). */
  readonly activationIds: Readonly<Record<AgentDefinitionId, ActivationId>>;
  /** Optional current grounded state: when supplied, a stale plan/resolution is refused (§30). */
  readonly current?: import("../binding/index.js").GroundedPlanningState;
}): readonly PreparedRuntimeRealization[] {
  // §29 coherence: plan refs must match the returned artifacts exactly.
  requireRefShape(input.plan, "plan");
  if (input.plan.runDefinition.digest !== input.runDefinition.digest) {
    throw new RuntimeRealizationError(
      "incoherent",
      `plan.runDefinition digest ${input.plan.runDefinition.digest} does not match the returned RunDefinition ${input.runDefinition.digest}`,
    );
  }
  const expectedResolutionRef = Object.freeze({
    resolutionId: input.resolution.resolutionId,
    digest: input.resolution.digest,
  });
  if (
    input.plan.bindingResolution.resolutionId !== expectedResolutionRef.resolutionId ||
    input.plan.bindingResolution.digest !== expectedResolutionRef.digest
  ) {
    throw new RuntimeRealizationError(
      "incoherent",
      `plan.bindingResolution ${input.plan.bindingResolution.resolutionId}/${input.plan.bindingResolution.digest} does not match the returned BindingResolution ${expectedResolutionRef.resolutionId}/${expectedResolutionRef.digest}`,
    );
  }
  // §29 coherence: Architecture subjects EQUAL the resolution's continuity subjects.
  const subjects = input.architecture.agentDefinitions.map((agent) => agent.agentDefinitionId);
  const continuitySubjects = Object.keys(input.resolution.continuity);
  const sortedSubjects = [...subjects].sort();
  const sortedContinuity = [...continuitySubjects].sort();
  if (
    sortedSubjects.length !== sortedContinuity.length ||
    sortedSubjects.some((subject, index) => subject !== sortedContinuity[index])
  ) {
    throw new RuntimeRealizationError(
      "incoherent",
      `Architecture subjects [${sortedSubjects.join(",")}] do not equal the BindingResolution continuity subjects [${sortedContinuity.join(",")}]`,
    );
  }
  // §30 staleness gate (reuses G10-C grounded freshness).
  if (input.current !== undefined) {
    if (evaluateGroundedPlanFreshness(input.plan, input.resolution, input.current) === "stale") {
      throw new RuntimeRealizationError(
        "plan_stale",
        "the plan/BindingResolution is stale against the current grounded state — re-observe and re-resolve before preparing runtime realization",
      );
    }
  }
  // §21: the allocator seam supplied exactly one id per subject.
  const suppliedIds = Object.keys(input.activationIds);
  if (
    suppliedIds.length !== sortedSubjects.length ||
    sortedSubjects.some((subject) => input.activationIds[subject] === undefined)
  ) {
    throw new RuntimeRealizationError(
      "incoherent",
      "activationIds must cover exactly the Architecture subject set (allocator seam output)",
    );
  }

  return Object.freeze(
    sortedSubjects.map((subject) => {
      const selection = input.resolution.continuity[subject];
      if (selection === undefined) {
        throw new RuntimeRealizationError("incoherent", `missing continuity selection for "${subject}"`);
      }
      const activationId = input.activationIds[subject]!;
      const continuityTarget = continuityTargetOf(selection);
      const runDefinitionRef = Object.freeze({ digest: input.runDefinition.digest });
      const bindingResolutionRef = Object.freeze({ ...expectedResolutionRef });
      return Object.freeze({
        schemaVersion: 1 as const,
        activationId,
        agentDefinitionId: subject,
        runDefinition: runDefinitionRef,
        bindingResolution: bindingResolutionRef,
        continuityTarget,
        realizationKey: runtimeRealizationKey({
          activationId,
          runDefinition: runDefinitionRef,
          bindingResolution: bindingResolutionRef,
          continuityTarget,
        }),
      });
    }),
  );
}
