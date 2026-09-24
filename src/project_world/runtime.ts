/**
 * PLMP-LEAN-1 §D3-a — EXACT-BASIS CAPTURE and the EXACT CURRENTNESS RUNTIME.
 *
 * This module is where D3-0's pure domain model first meets a real world. It does exactly two things:
 *
 *     capture:   canonical Work  →  dependency footprint  →  resolve against the current world  →  B_0
 *     assess:    B_0  +  current world  →  RE-RESOLVE the same footprint  →  B_1  →  compare  →  verdict
 *
 * and it deliberately stops there. §D3-a answers "is this basis still exactly what it was?" and nothing
 * more:
 *
 *     same bound dependencies      → CURRENT
 *     a bound dependency changed   → STALE
 *     cannot establish a facet     → UNKNOWN
 *
 * It CANNOT return COMPATIBLE. "It changed, but the change looks harmless" is a claim that requires
 * proving something about the change, which is D3-b's problem. A slice that inferred it here would be
 * manufacturing exactly the evidence D3-0 spent its whole vocabulary refusing to fake.
 *
 * TWO RULES SHAPE THE CODE, and both are about not drifting back to a global snapshot:
 *
 *   capture precedes effect
 *     A basis is resolved BEFORE any mutation authority exists. Capturing afterwards would make an
 *     attempt's provenance a reconstruction rather than an observation.
 *
 *   assessment RE-RESOLVES, never compares snapshots
 *     The current world is projected through the SAME `R_w` and the two bases are compared. Comparing a
 *     stored basis against the raw current world would quietly turn `ProjectWorldBasis` back into
 *     `ProjectWorldState` at runtime — the pure type would still say "dependency projection" while the
 *     runtime behaved like "global snapshot", which is the worst of both.
 *
 * Layer: L2 (`src/project_world/`), beside `project_verification/`.
 */
import {
  assessExactCurrentness,
  assessCompatibilityWithoutSolver,
  bound,
  legacyD2Basis,
  materializeProjectWorldBasis,
  NOT_REQUIRED,
  resolveWorkBasis,
  unknown,
  type AssetRevisionBinding,
  type BasisCompatibility,
  type BasisCurrentness,
  type EnvironmentBinding,
  type FacetBinding,
  type ProjectWorldBasis,
  type ProjectWorldState,
  type SourceRevisionBinding,
  type WorkDependency,
} from "../domain/world_basis.js";
import type { CapturedWorldBasis, AttemptWorldBasisStore, CaptureOutcome } from "./basis_store.js";
import { deriveWorkDependency, semanticProjectionDigestOf } from "./dependency.js";

/**
 * What the runtime can observe about the current world.
 *
 * A PORT rather than a concrete read, because "what is the current world" has more than one honest
 * answer: a deployment with a repository can name a source revision, and a deployment whose project
 * never moved can too — but a facet this deployment CANNOT observe must be reported as UNKNOWN rather
 * than omitted, so the omission cannot be mistaken for a `NOT_REQUIRED` claim.
 *
 *   SourceWorldObservation        the current canonical source revision
 *   SemanticProjectionObservation the current SEMANTIC projection digest for a task
 *
 * The two are separate methods because they are separate questions asked at different times: capture
 * resolves both, while an assessment re-resolves both through the SAME footprint.
 */
export interface ProjectWorldObservationPort {
  readonly adapterId: string;
  /** The current source revision, or a reason it cannot be observed. */
  observeSource(): { readonly ok: true; readonly revision: SourceRevisionBinding } | { readonly ok: false; readonly detail: string };
  /**
   * The current semantic projection digest for a task, or a reason it cannot be observed.
   *
   * A task the project no longer knows is NOT an error here: it is a fact the caller turns into a
   * verdict. Returning `null` says "this task is not in the current world", which is precisely what
   * makes a retired task's basis STALE rather than unknown.
   */
  observeSemanticProjection(taskId: string): { readonly ok: true; readonly digest: string } | { readonly ok: false; readonly detail: string } | null;
  /**
   * The current ASSET revisions this deployment can see, when it can see any.
   *
   * OPTIONAL, and its absence is meaningful rather than convenient: no canonical field declares an asset
   * dependency yet, so the first-party deployment cannot observe asset revisions at all and correctly
   * omits this method. A port that CAN see assets supplies it, and then a work that declares an asset
   * dependency gets a BOUND facet whose movement makes it STALE — which is the case that proves
   * currentness is no longer `HEAD` equality. Without this method that proof would be unreachable at
   * runtime, and the model would only LOOK general.
   *
   * Absent ⇒ the runtime reports UNKNOWN for the facet, never `NOT_REQUIRED`: an unobservable facet is
   * ignorance, and only the WORK's own footprint may turn it into knowledge.
   */
  observeAssets?(): FacetBinding<readonly AssetRevisionBinding[]>;
  /** The current semantic environment, when this deployment can observe one. Same rules as assets. */
  observeEnvironment?(): FacetBinding<EnvironmentBinding>;
  /** The current global revision, for provenance on a new capture. */
  observeRevision(): number;
}

export class ProjectWorldBasisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectWorldBasisError";
  }
}

/** What a capture produced, including the two cases a caller must tell apart. */
export type BasisCaptureResult =
  | { readonly state: "CAPTURED"; readonly record: CapturedWorldBasis }
  /** The attempt already had a basis: the FIRST one stands. */
  | { readonly state: "ALREADY_CAPTURED"; readonly record: CapturedWorldBasis }
  /** The world could not be observed, so no basis was recorded — a refusal, not a partial capture. */
  | { readonly state: "UNOBSERVABLE"; readonly detail: string };

export interface ProjectWorldBasisRuntime {
  readonly adapterId: string;
  /** Capture the basis for one canonical work, BEFORE any effect. Immutable once recorded. */
  capture(input: {
    readonly attemptId: string;
    readonly taskId: string;
    readonly envelope: Parameters<typeof semanticProjectionDigestOf>[0];
  }): BasisCaptureResult;
  /** The attempt's recorded basis, or null when none was ever captured. */
  read(input: { readonly attemptId: string }): CapturedWorldBasis | null;
  /**
   * Re-resolve the attempt's footprint against the CURRENT world and report exact currentness.
   *
   * Returns null when the attempt has no recorded basis. That is NOT an error and NOT a verdict: an
   * attempt that was never captured (every D2 attempt) has no basis to assess, and inventing one from
   * the current world would manufacture the provenance D3-0 refused to fake.
   */
  assessCurrentness(input: { readonly attemptId: string }): CurrentnessRuntimeAssessment | null;
}

export interface CurrentnessRuntimeAssessment {
  readonly attemptId: string;
  readonly taskId: string;
  /** The basis the attempt was captured with. Unchanged by this call, by construction. */
  readonly basisDigest: string;
  /** The basis RE-RESOLVED against the current world — `B_1 = Resolve(W_1, R_w)`. */
  readonly currentBasisDigest: string;
  readonly currentness: BasisCurrentness;
  /** §D3-a never reports COMPATIBLE; the field exists so the vocabulary is one shape across D3. */
  readonly compatibility: BasisCompatibility;
  readonly reasons: readonly string[];
  readonly detail: string;
}

export function makeProjectWorldBasisRuntime(deps: {
  readonly projectId: string;
  readonly store: AttemptWorldBasisStore;
  readonly observation: ProjectWorldObservationPort;
  readonly clock?: (() => string) | undefined;
}): ProjectWorldBasisRuntime {
  const now = (): string => (deps.clock ?? (() => new Date().toISOString()))();

  /**
   * Build the CURRENT world as far as this deployment can honestly observe it.
   *
   * `assets` and `environment` are UNKNOWN, not NOT_REQUIRED. Nothing in a canonical envelope declares
   * an asset or environment dependency yet, so the deployment cannot claim the work does not depend on
   * them — it can only say it has no way to observe them. `resolveWorkBasis` then narrows each facet
   * using the work's OWN footprint: a work that reads no asset gets NOT_REQUIRED because the projection
   * is exactly the selectors it named, which is a statement about the WORK rather than about the
   * deployment's ignorance.
   */
  function observeWorld(taskId: string): { readonly ok: true; readonly state: ProjectWorldState } | { readonly ok: false; readonly detail: string } {
    const source = deps.observation.observeSource();
    if (!source.ok) return { ok: false, detail: source.detail };
    const semantic = deps.observation.observeSemanticProjection(taskId);
    if (semantic === null) {
      return { ok: false, detail: `task "${taskId}" is not in the current project, so the current world has no semantic projection for it` };
    }
    if (!semantic.ok) return { ok: false, detail: semantic.detail };
    return {
      ok: true,
      state: Object.freeze({
        projectId: deps.projectId,
        revision: deps.observation.observeRevision(),
        semanticProjectionDigest: semantic.digest,
        source: bound(source.revision),
        // An unobservable facet is UNKNOWN — ignorance, never the `NOT_REQUIRED` knowledge claim, which
        // only the WORK's own footprint may produce (via `resolveWorkBasis`).
        assets:
          deps.observation.observeAssets?.() ??
          (unknown("this deployment cannot observe asset revisions, so a work that declares an asset dependency cannot have it resolved") as FacetBinding<readonly AssetRevisionBinding[]>),
        environment:
          deps.observation.observeEnvironment?.() ??
          (unknown("this deployment cannot observe environment revisions") as FacetBinding<EnvironmentBinding>),
      }),
    };
  }

  function capture(input: {
    readonly attemptId: string;
    readonly taskId: string;
    readonly envelope: Parameters<typeof semanticProjectionDigestOf>[0];
  }): BasisCaptureResult {
    // An attempt that already has a basis keeps it. Re-capturing would rewrite provenance, and the
    // world having moved is exactly what `assessCurrentness` is for.
    const existing = deps.store.read({ projectId: deps.projectId, attemptId: input.attemptId });
    if (existing !== null) return Object.freeze({ state: "ALREADY_CAPTURED" as const, record: existing });

    const observed = observeWorld(input.taskId);
    if (!observed.ok) return Object.freeze({ state: "UNOBSERVABLE" as const, detail: observed.detail });

    const dependency = deriveWorkDependency(input.envelope);
    const basis = resolveWorkBasis({ state: observed.state, dependency, taskId: input.taskId });
    const record: CapturedWorldBasis = Object.freeze({
      schemaVersion: 1 as const,
      projectId: deps.projectId,
      attemptId: input.attemptId,
      taskId: input.taskId,
      dependency,
      basis,
      capturedAt: now(),
    });
    const outcome: CaptureOutcome = deps.store.appendOnce(record);
    return Object.freeze({
      state: outcome.state === "APPENDED" ? ("CAPTURED" as const) : ("ALREADY_CAPTURED" as const),
      record: outcome.record,
    });
  }

  function assessCurrentness(input: { readonly attemptId: string }): CurrentnessRuntimeAssessment | null {
    const recorded = deps.store.read({ projectId: deps.projectId, attemptId: input.attemptId });
    if (recorded === null) return null;

    const observed = observeWorld(recorded.taskId);
    /**
     * A task the current project no longer knows is a PROVEN divergence, not an unobservable world: the
     * semantic projection this basis was cut from does not exist any more, so the basis is STALE. Saying
     * UNKNOWN here would understate what is known — and it is the case a retired task actually produces.
     */
    if (!observed.ok) {
      const retired = deps.observation.observeSemanticProjection(recorded.taskId) === null;
      return Object.freeze({
        attemptId: recorded.attemptId,
        taskId: recorded.taskId,
        basisDigest: recorded.basis.basisDigest,
        currentBasisDigest: recorded.basis.basisDigest,
        currentness: retired ? ("STALE" as const) : ("UNKNOWN" as const),
        compatibility: "UNKNOWN" as const,
        reasons: Object.freeze([observed.detail]),
        detail: retired
          ? "the task this basis was cut from is no longer in the current project, so the basis cannot still hold"
          : "the current world cannot be observed, so exactness cannot be established either way",
      });
    }

    // RE-RESOLVE through the SAME footprint — never compare the stored basis to a raw world snapshot.
    const currentBasis = resolveWorkBasis({
      state: observed.state,
      dependency: recorded.dependency,
      taskId: recorded.taskId,
    });
    const exact = assessExactCurrentness({ basis: recorded.basis, current: observed.state });
    const compatibility = assessCompatibilityWithoutSolver({ basis: recorded.basis, current: observed.state });
    return Object.freeze({
      attemptId: recorded.attemptId,
      taskId: recorded.taskId,
      basisDigest: recorded.basis.basisDigest,
      currentBasisDigest: currentBasis.basisDigest,
      currentness: exact.currentness,
      compatibility: compatibility.compatibility,
      reasons: exact.reasons,
      detail: compatibility.detail,
    });
  }

  return Object.freeze({
    adapterId: "first-party-project-world-basis",
    capture,
    read: (input: { readonly attemptId: string }) => deps.store.read({ projectId: deps.projectId, attemptId: input.attemptId }),
    assessCurrentness,
  });
}

/**
 * §D3-a legacy honesty: the basis a D2 attempt WOULD have had, built from what it actually recorded.
 *
 * This is deliberately NOT part of `capture`. A D2 attempt never captured a basis, and this function
 * exists only so a caller can ASSESS an old result without pretending the capture happened. It maps
 * through D3-0's `legacyD2Basis`, which reports `UNKNOWN` for the facets D2 never observed — so the
 * assessment fails closed rather than inheriting a compatibility nobody established.
 *
 * Nothing here writes: no store row is created, because creating one would make a reconstruction
 * indistinguishable from an observation.
 */
export function legacyD2BasisForAssessment(input: {
  readonly projectId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly baseCommit: string;
  readonly semanticProjectionDigest: string;
  readonly capturedAtRevision: number;
  readonly dependency: WorkDependency;
}): CapturedWorldBasis {
  return Object.freeze({
    schemaVersion: 1 as const,
    projectId: input.projectId,
    attemptId: input.attemptId,
    taskId: input.taskId,
    dependency: input.dependency,
    basis: legacyD2Basis({
      projectId: input.projectId,
      taskId: input.taskId,
      baseCommit: input.baseCommit,
      semanticProjectionDigest: input.semanticProjectionDigest,
      capturedAtRevision: input.capturedAtRevision,
    }),
    capturedAt: "1970-01-01T00:00:00.000Z",
  });
}

/** The `NOT_REQUIRED` re-export keeps the facet vocabulary in one import for callers of this module. */
export { NOT_REQUIRED };

/** Build a basis by hand — for a deployment whose world is not observed but IS known. */
export function basisFromKnownWorld(input: {
  readonly projectId: string;
  readonly taskId: string;
  readonly capturedAtRevision: number;
  readonly semanticProjectionDigest: string;
  readonly source: FacetBinding<SourceRevisionBinding>;
  readonly assets?: FacetBinding<readonly AssetRevisionBinding[]> | undefined;
  readonly environment?: FacetBinding<EnvironmentBinding> | undefined;
}): ProjectWorldBasis {
  return materializeProjectWorldBasis({
    projectId: input.projectId,
    taskId: input.taskId,
    capturedAtRevision: input.capturedAtRevision,
    semanticProjectionDigest: input.semanticProjectionDigest,
    source: input.source,
    assets: input.assets ?? (NOT_REQUIRED as FacetBinding<readonly AssetRevisionBinding[]>),
    environment: input.environment ?? (NOT_REQUIRED as FacetBinding<EnvironmentBinding>),
  });
}
