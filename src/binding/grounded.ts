/**
 * G10-C3 fully-grounded binding compiler (campaign §56–§69).
 *
 * The high-level production planning boundary. Every Binding freshness input
 * is DERIVED here from an owning semantic artifact — the caller supplies
 * artifacts, never derived provenance strings:
 *
 *   Architecture ref       ← ArchitectureDefinition    (architectureRefOf)
 *   subjects               ← AgentDefinitions           (kernel, via compiler)
 *   Work ref               ← ProjectIr                  (workRefOf)
 *   Binding intent         ← BindingDefinition/default  (kernel helper)
 *   RunConfiguration       ← RunConfiguration           (digest)
 *   SnapshotRef            ← BindingObservationSnapshot (observationRefOf)
 *   resolver policy        ← the actual kernel policy (MINIMAL_RESOLVER_POLICY)
 *
 * Escape hatches deliberately ABSENT from this boundary (C3 §58): independent
 * architecture/work refs, subject lists, run-configuration digest strings,
 * SnapshotRefs, admission FreshnessBases, resolver-policy claims, and
 * arbitrary Architecture/Work hard-requirement maps. There is still no
 * production semantic owner for Architecture/Work hard requirements, so the
 * grounded compiler passes none (C3 §59) — an explicit BindingDefinition's
 * own hard requirements remain valid. The lower-level ref-level seam
 * (`compileBindingPlan`) remains generic kernel-adjacent plumbing; it is NOT
 * the production planning boundary.
 *
 * The grounded compiler materializes ONE RunDefinition from the artifacts
 * before resolution (C3 §61) and returns it as the authoritative composite;
 * the plan stores refs only (C3 §65/§66) — the returned RunDefinition and
 * BindingResolution values are the single authoritative artifacts, and the
 * plan's refs are derived from exactly those (coherence, C3-M08).
 *
 * Freshness admission (C3 §68/§69): no arbitrary admission basis is exposed.
 * `evaluateGroundedResolutionFreshness` derives the freshness basis
 * internally from CURRENT artifacts (reusing the kernel intent-source helper
 * and freshness implementation); `evaluateGroundedPlanFreshness` adds the
 * plan's RunDefinition-ref check on top. Rebinding = compile again with
 * current artifacts; nothing is mutated.
 *
 * Trusted-artifact boundary (campaign §8/§82): this function consumes
 * parsed/materialized artifacts. Untrusted transports parse at their own
 * boundaries (`parseArchitectureDefinition`, `parseRunConfiguration`,
 * `parseObservationSnapshot`); the optional binding definition keeps its
 * raw/trusted pair because it is transport-shaped. Trusted inputs are a
 * trusted API boundary, not an unforgeable capability.
 *
 * No runtime realization, no persistence, no scheduler involvement.
 */

import type { ArchitectureDefinition } from "../architecture/index.js";
import type { ProjectIr } from "../schema/index.js";
import type {
  BindingDefinition,
  BindingResolutionResult,
  SatisfiedBindingResolution,
  UnsatisfiedBindingResolution,
} from "./contract.js";
import type { BindingObservationSnapshot } from "./observation.js";
import { observationRefOf } from "./observation.js";
import type {
  RunConfiguration,
  RunDefinition,
} from "../run/index.js";
import { materializeRunDefinition } from "../run/index.js";
import { compileBindingPlan } from "./compiler.js";
import type {
  BindingPlanCompileResult,
  CompiledBindingPlan,
  SatisfiedSemanticResolution,
} from "./compiler.js";
import { parseBindingDefinition, BindingConfigurationError } from "./parser.js";
import { MINIMAL_RESOLVER_POLICY, compileBindingIntentSource } from "./resolver.js";
import { evaluateFreshness } from "./freshness.js";
import type { Freshness } from "./freshness.js";
import { architectureRefOf, workRefOf } from "./refs.js";

export interface GroundedBindingPlanInput {
  /** Owning Architecture artifact (parsed/materialized — trusted artifact boundary). */
  readonly architecture: ArchitectureDefinition;
  /** Authoritative Work artifact (ProjectIr — trusted artifact boundary). */
  readonly work: ProjectIr;
  /** Optional untrusted raw BindingDefinition — parsed at this boundary. */
  readonly rawBindingDefinition?: unknown;
  /** Optional trusted BindingDefinition (kernel-produced). Mutually exclusive with raw. */
  readonly trustedBindingDefinition?: BindingDefinition;
  /** Owning RunConfiguration artifact (parsed/materialized — trusted artifact boundary). */
  readonly runConfiguration: RunConfiguration;
  /** Owning observation artifact (parsed/materialized — trusted artifact boundary). */
  readonly observationSnapshot: BindingObservationSnapshot;
  /** Artifact-layer allocation input (PF-03): caller-supplied, deterministic. */
  readonly resolutionId: string;
}

/** The authoritative artifacts a grounded freshness evaluation is measured against (C3 §68). */
export interface GroundedPlanningState {
  readonly architecture: ArchitectureDefinition;
  readonly work: ProjectIr;
  readonly bindingDefinition?: BindingDefinition;
  readonly runConfiguration: RunConfiguration;
  readonly observationSnapshot: BindingObservationSnapshot;
}

export type GroundedBindingPlanResult =
  | {
      readonly status: "planned";
      /** The authoritative derived composite (the plan stores its ref only). */
      readonly runDefinition: RunDefinition;
      /** The authoritative derived resolution (single Binding truth; the plan stores its ref only). */
      readonly resolution: SatisfiedBindingResolution;
      /** Ref-only plan: {runDefinition digest, bindingResolution id+digest}. */
      readonly plan: CompiledBindingPlan;
    }
  | { readonly status: "binding_unsatisfied"; readonly result: UnsatisfiedBindingResolution }
  | { readonly status: "stale"; readonly resolution: SatisfiedSemanticResolution };

function resolveBindingDefinition(input: GroundedBindingPlanInput): BindingDefinition | undefined {
  if (input.rawBindingDefinition !== undefined && input.trustedBindingDefinition !== undefined) {
    throw new BindingConfigurationError(
      "supply either rawBindingDefinition (parsed at this boundary) or trustedBindingDefinition, not both",
    );
  }
  if (input.rawBindingDefinition !== undefined) {
    return parseBindingDefinition(input.rawBindingDefinition);
  }
  return input.trustedBindingDefinition;
}

/**
 * The one high-level production planning function (C3 §57): semantic
 * artifacts in → grounded RunDefinition + BindingResolution + ref-only plan
 * out. Configuration errors throw; unsatisfied and stale are values (B4 §21).
 */
export function compileGroundedBindingPlan(
  input: GroundedBindingPlanInput,
): GroundedBindingPlanResult {
  const bindingDefinition = resolveBindingDefinition(input);

  // C3 §61: materialize ONE RunDefinition from the artifacts before resolution.
  const runDefinition = materializeRunDefinition({
    architecture: input.architecture,
    work: input.work,
    ...(bindingDefinition === undefined ? {} : { bindingDefinition }),
    runConfiguration: input.runConfiguration,
  });

  const result = compileBindingPlan({
    trustedArchitectureDefinition: input.architecture,
    work: workRefOf(input.work),
    ...(bindingDefinition === undefined ? {} : { trustedBindingDefinition: bindingDefinition }),
    trustedRunConfiguration: input.runConfiguration,
    trustedObservationSnapshot: input.observationSnapshot,
    resolutionId: input.resolutionId,
  });

  if (result.status === "binding_unsatisfied") {
    return Object.freeze({
      status: "binding_unsatisfied",
      result: result.result,
    }) as GroundedBindingPlanResult;
  }
  if (result.status === "stale") {
    return Object.freeze({
      status: "stale",
      resolution: result.resolution,
    }) as GroundedBindingPlanResult;
  }

  return Object.freeze({
    status: "planned",
    runDefinition,
    resolution: result.resolution,
    plan: result.plan,
  }) as GroundedBindingPlanResult;
}

/**
 * Grounded freshness admission for a resolution (C3 §68): the basis is
 * DERIVED internally from the current artifacts — no caller-written basis can
 * lie about the current state. Reuses the kernel intent-source helper and the
 * existing kernel freshness implementation.
 */
export function evaluateGroundedResolutionFreshness(
  resolution: BindingResolutionResult,
  current: GroundedPlanningState,
): Freshness {
  return evaluateFreshness(resolution, {
    architecture: architectureRefOf(current.architecture),
    work: workRefOf(current.work),
    intentSource: compileBindingIntentSource(current.bindingDefinition),
    runConfigurationDigest: current.runConfiguration.digest,
    snapshot: { ref: observationRefOf(current.observationSnapshot) },
    // The grounded boundary has no policy claim input (C3 §60): the derived
    // basis records the ACTUAL kernel policy — the same one the resolution's
    // provenance carries — so same-state admission is current.
    resolverPolicy: MINIMAL_RESOLVER_POLICY,
  });
}

/**
 * Grounded plan admission (C3 §69): the plan is current iff its RunDefinition
 * ref equals the currently materialized composite (definition drift:
 * architecture/work/binding-intent/run-configuration) AND its resolution is
 * fresh against the current state (observation drift: the snapshot).
 */
export function evaluateGroundedPlanFreshness(
  plan: CompiledBindingPlan,
  resolution: BindingResolutionResult,
  current: GroundedPlanningState,
): Freshness {
  const currentRunDefinition = materializeRunDefinition({
    architecture: current.architecture,
    work: current.work,
    ...(current.bindingDefinition === undefined ? {} : { bindingDefinition: current.bindingDefinition }),
    runConfiguration: current.runConfiguration,
  });
  if (plan.runDefinition.digest !== currentRunDefinition.digest) return "stale";
  return evaluateGroundedResolutionFreshness(resolution, current);
}
