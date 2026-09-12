/**
 * G10-D4 live runtime/continuity observation — the read-only half of the
 * runtime seam. Observation NEVER realizes, mutates, attaches, creates, or
 * releases anything (observe ≠ realize, §74); mutations stay behind the
 * Ordarium-admitted carrier port.
 *
 * Knowledge states (§76): every observation fact is explicitly
 * `known | unknown | error`. UNKNOWN is never collapsed into an empty
 * capability set or into "unavailable" — the C2 rule (UNKNOWN ≠ UNAVAILABLE)
 * enforced at the live boundary.
 *
 * Snapshot materialization rule (§77/§79): a `BindingObservationSnapshot` is
 * emitted ONLY when every fact required to state its contents truthfully is
 * known. Any unknown ephemeral fact, or ANY registered canonical point whose
 * availability/capabilities are unknown, refuses the whole snapshot
 * (`observation_incomplete`) — a registered point can never be silently
 * omitted or guessed (§79/§118).
 *
 * Snapshot identity (§81): the observation-instance id comes from an injected
 * allocator (effect-layer may use UUIDs/clock; tests are deterministic). No
 * clock/randomness in the canonicalization path itself — the C2 snapshot
 * materializer stays pure.
 *
 * Availability semantics (§80): `available` means "the runtime adapter
 * currently considers this continuity locus admissible for realization" — it
 * does NOT necessarily mean a carrier is active or a session is open.
 *
 * Closed loop (§83/§84): `observeAndCompileGroundedPlan` keeps observe and
 * compile as distinct steps (the pure Binding compiler never observes), and
 * the D2/D3 realization service re-checks grounded freshness immediately
 * before the effect — the TOCTOU window (§85) is mitigated by the stable
 * realization key, the freshness re-check, and the host-side availability
 * check, and is honestly documented as non-atomic across Palimpsest DB /
 * host runtime / Ordarium.
 */

import type { CapabilityProfile, BindingObservationSnapshot } from "../binding/index.js";
import { materializeObservationSnapshot } from "../binding/index.js";
import type {
  ArchitectureDefinition,
} from "../architecture/index.js";
import type { ProjectIr } from "../schema/index.js";
import type {
  BindingDefinition,
  SatisfiedBindingResolution,
  UnsatisfiedBindingResolution,
} from "../binding/contract.js";
import type {
  CompiledBindingPlan,
  GroundedBindingPlanResult,
} from "../binding/index.js";
import { compileGroundedBindingPlan } from "../binding/index.js";
import type { PersistentPoint, PersistentPointStore } from "../continuity/index.js";

/** Explicit knowledge state at the observation boundary (§76). */
export type ObservationKnowledge<T> =
  | { readonly state: "known"; readonly value: T }
  | { readonly state: "unknown"; readonly detail: string }
  | { readonly state: "error"; readonly detail: string };

/** What `available` means (§80): admissible for realization NOW — not "carrier active". */
export interface PersistentPointObservation {
  readonly available: boolean;
  readonly capabilities: CapabilityProfile;
}

/**
 * Host-neutral READ-ONLY observation port (§75). Ownership may differ from
 * the carrier port, so it is a separate object; an embedder may back both
 * with the same adapter if that fits its runtime.
 */
export interface RuntimeObservationPort {
  observeEphemeralCapabilities(): Promise<ObservationKnowledge<CapabilityProfile>>;
  observePersistentPoint(point: PersistentPoint): Promise<ObservationKnowledge<PersistentPointObservation>>;
}

export interface ObservationDeps {
  readonly pointStore: PersistentPointStore;
  readonly observationPort: RuntimeObservationPort;
  /** Observation-instance identity allocator (§81): injected; deterministic in tests. */
  readonly allocateSnapshotId: () => string;
}

export type ObservationOutcome =
  | { readonly status: "observed"; readonly snapshot: BindingObservationSnapshot }
  | { readonly status: "incomplete"; readonly detail: string };

/**
 * Produce a live `BindingObservationSnapshot` from canonical runtime/
 * continuity sources (§79/§82): the point list comes from the canonical
 * store; ephemeral capabilities and per-point facts come from the
 * observation port. ANY unknown refuses the snapshot (§77) — a registered
 * point is never silently omitted (§79).
 */
export async function observeBindingState(deps: ObservationDeps): Promise<ObservationOutcome> {
  const points = await deps.pointStore.list();

  const ephemeral = await deps.observationPort.observeEphemeralCapabilities();
  if (ephemeral.state !== "known") {
    return Object.freeze({
      status: "incomplete",
      detail: `ephemeral capability observation is ${ephemeral.state}: ${ephemeral.detail} (UNKNOWN is never evaluated as unavailable or empty)`,
    }) as ObservationOutcome;
  }

  const candidates: {
    readonly point: string;
    readonly available: boolean;
    readonly runtimeFeatures?: readonly string[];
    readonly toolCapabilities?: readonly string[];
  }[] = [];
  for (const point of points) {
    const observed = await deps.observationPort.observePersistentPoint(point);
    if (observed.state !== "known") {
      // §79: a registered point with unknown material facts could affect
      // selection — refuse the snapshot rather than omit or guess.
      return Object.freeze({
        status: "incomplete",
        detail: `persistent point "${point.persistentPointId}" observation is ${observed.state}: ${observed.detail}`,
      }) as ObservationOutcome;
    }
    candidates.push({
      point: point.persistentPointId,
      available: observed.value.available,
      ...(observed.value.capabilities.runtimeFeatures === undefined
        ? {}
        : { runtimeFeatures: observed.value.capabilities.runtimeFeatures }),
      ...(observed.value.capabilities.toolCapabilities === undefined
        ? {}
        : { toolCapabilities: observed.value.capabilities.toolCapabilities }),
    });
  }

  const snapshot = materializeObservationSnapshot({
    snapshotId: deps.allocateSnapshotId(),
    ephemeralCapabilities: ephemeral.value,
    persistentCandidates: candidates,
  });
  return Object.freeze({ status: "observed", snapshot }) as ObservationOutcome;
}

export interface LiveCompileRequest {
  readonly architecture: ArchitectureDefinition;
  readonly work: ProjectIr;
  readonly rawBindingDefinition?: unknown;
  readonly trustedBindingDefinition?: BindingDefinition;
  readonly runConfiguration: import("../run/index.js").RunConfiguration;
  readonly resolutionId: string;
}

export type LiveCompileOutcome =
  | { readonly status: "observation_incomplete"; readonly detail: string }
  | {
      readonly status: "planned";
      readonly snapshot: BindingObservationSnapshot;
      readonly runDefinition: import("../run/index.js").RunDefinition;
      readonly resolution: SatisfiedBindingResolution;
      readonly plan: CompiledBindingPlan;
    }
  | { readonly status: "binding_unsatisfied"; readonly result: UnsatisfiedBindingResolution }
  | { readonly status: "stale"; readonly resolution: import("../binding/index.js").SatisfiedSemanticResolution };

/**
 * The observe → compile closure (§83): distinct steps — observe (above), then
 * the pure grounded compiler with the observed snapshot. Observation logic
 * never enters the pure Binding compiler.
 */
export async function observeAndCompileGroundedPlan(
  deps: ObservationDeps,
  request: LiveCompileRequest,
): Promise<LiveCompileOutcome> {
  const observed = await observeBindingState(deps);
  if (observed.status === "incomplete") {
    return Object.freeze({
      status: "observation_incomplete",
      detail: observed.detail,
    }) as LiveCompileOutcome;
  }
  const result: GroundedBindingPlanResult = compileGroundedBindingPlan({
    architecture: request.architecture,
    work: request.work,
    ...(request.rawBindingDefinition === undefined
      ? {}
      : { rawBindingDefinition: request.rawBindingDefinition }),
    ...(request.trustedBindingDefinition === undefined
      ? {}
      : { trustedBindingDefinition: request.trustedBindingDefinition }),
    runConfiguration: request.runConfiguration,
    observationSnapshot: observed.snapshot,
    resolutionId: request.resolutionId,
  });
  if (result.status === "planned") {
    return Object.freeze({
      status: "planned",
      snapshot: observed.snapshot,
      runDefinition: result.runDefinition,
      resolution: result.resolution,
      plan: result.plan,
    }) as LiveCompileOutcome;
  }
  if (result.status === "binding_unsatisfied") {
    return Object.freeze({
      status: "binding_unsatisfied",
      result: result.result,
    }) as LiveCompileOutcome;
  }
  return Object.freeze({
    status: "stale",
    resolution: result.resolution,
  }) as LiveCompileOutcome;
}
