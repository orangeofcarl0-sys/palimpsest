/**
 * G10-B4 binding compiler seam: the minimal plan-side carrier that routes
 * real planning facts through the frozen PLMP-BIND-1 kernel.
 *
 * Separation preserved (Compile ≠ Resolve ≠ Realize): this module compiles
 * declarative inputs, resolves via the B3 kernel, constructs an immutable
 * plan-side reference, and validates freshness. It never creates DSH
 * Agents/Sessions, allocates PersistentPoints, realizes providers/tools/
 * workspaces, or persists anything. The plan artifact is a derived, immutable,
 * ref-only join — never a second Work truth and never a second Binding truth.
 *
 * Identity firewall (the central B4 invariant, sharpened by C0): Work identity
 * is never reinterpreted as Architecture identity. This module does not import
 * TaskSpec/TaskProposal/proposalTaskSpecs and has no parameter that accepts a
 * task array; Architecture subjects are derived solely from the supplied
 * ArchitectureDefinition's AgentDefinition membership through an explicit
 * adapter — never WorkGraph, never inferred from tasks, never persisted.
 *
 * Provenance discipline (B4 §2, clarified by G10-C0 Stage 0, strengthened by
 * G10-C0 §34–§39): the seam validates explicit provenance inputs structurally —
 * `WellFormedExplicitProvenance ≠ AuthoritativelyGroundedProvenance`. Since C0,
 * Architecture provenance is no longer a well-formed-but-ungrounded caller ref:
 * the compiler requires an actual ArchitectureDefinition artifact (raw parsed
 * at this boundary, or already trusted) and DERIVES the architecture
 * `DefinitionRevisionRef` and the participating `ArchitectureSubjectRef`s from
 * it through explicit adapters. RunConfiguration digest and planning snapshot
 * remain explicitly caller-supplied (their upstream producers do not exist
 * yet); live resolution stays deferred until they do.
 *
 * The B3 spike fixture types (`ResolverInput`, `SubjectRequirementFixture`,
 * `BindingCatalogPoint`, `ResolverSnapshot`) stay kernel plumbing: this module
 * defines production-neutral input types and translates them across a private
 * boundary. They are not re-exported here.
 */

import type { ProjectIr } from "../schema/index.js";
import type { ArchitectureDefinition } from "../architecture/index.js";
import { parseArchitectureDefinition } from "../architecture/index.js";
import type {
  ArchitectureSubjectRef,
  BindingDefinition,
  BindingResolutionRef,
  DefinitionRevisionRef,
  ResolverPolicyRef,
  SatisfiedBindingResolution,
  UnsatisfiedBindingResolution,
} from "./contract.js";
import { parseBindingDefinition, BindingConfigurationError } from "./parser.js";
import {
  observationRefOf,
  parseObservationSnapshot,
} from "./observation.js";
import type { BindingObservationSnapshot } from "./observation.js";
import { architectureRefOf, workRefOf } from "./refs.js";
import type { RunConfiguration } from "../run/index.js";
import { parseRunConfiguration } from "../run/index.js";
import {
  MINIMAL_RESOLVER_POLICY,
  compileBindingIntentSource,
  materializeResolutionResult,
  resolveBindingCore,
} from "./resolver.js";
import type { FreshnessBasis } from "./freshness.js";
import type { SemanticResolutionResult } from "./resolver.js";
import type { SubjectRequirementFixture } from "./resolver.js";
import type { ResolverSnapshot } from "./resolver.js";
import { evaluateFreshness } from "./freshness.js";

/**
 * The minimal derived plan-side artifact (B4 §18): a ref-only join of the
 * authoritative Work lineage and the single authoritative BindingResolution.
 * Not the full UAS ExecutionPlan ontology — no TaskSpec copies, no full
 * resolution copy, not persisted, no runtime attachment, no authority.
 */
export interface CompiledBindingPlan {
  /** Authoritative Work lineage ref (identity + revision + digest). */
  readonly work: DefinitionRevisionRef;
  /** The one binding truth the plan may carry: resolutionId + digest only. */
  readonly bindingResolution: BindingResolutionRef;
}

/** Per-subject capability profile, caller-supplied. Production-neutral shape for the kernel's spike fixture. */
export interface SubjectCapabilityProfile {
  readonly runtimeFeatures?: readonly string[];
  readonly toolCapabilities?: readonly string[];
}

export interface BindingPlanCompileInput {
  /** Authoritative Work lineage ref (grounded: ProjectIr via `workRefOf`). */
  readonly work: DefinitionRevisionRef;
  /**
   * Untrusted raw ArchitectureDefinition — parsed at this trust boundary via
   * `parseArchitectureDefinition` (C0 §36). No unchecked architecture object
   * enters provenance. Mutually exclusive with `trustedArchitectureDefinition`.
   */
  readonly rawArchitectureDefinition?: unknown;
  /**
   * Trusted ArchitectureDefinition — already produced by the architecture
   * parser/materializer (C0 §37). This is a trusted API boundary, NOT an
   * unforgeable capability: callers passing arbitrary cast objects bypass
   * validation by their own choice. Mutually exclusive with
   * `rawArchitectureDefinition`. Exactly one source is required (C0 §38).
   */
  readonly trustedArchitectureDefinition?: ArchitectureDefinition;
  /** Caller-supplied hard requirements. No production source exists — pass none unless a future architecture-semantics stage owns them (C0 §40). */
  readonly architectureHard?: Readonly<Record<string, SubjectCapabilityProfile>>;
  /** Caller-supplied hard requirements. No production source exists — pass none (B4 §13). */
  readonly workHard?: Readonly<Record<string, SubjectCapabilityProfile>>;
  /** Untrusted raw BindingDefinition — parsed at this trust boundary via `parseBindingDefinition`. */
  readonly rawBindingDefinition?: unknown;
  /** Trusted already-parsed BindingDefinition (kernel-produced). Mutually exclusive with `rawBindingDefinition`. */
  readonly trustedBindingDefinition?: BindingDefinition;
  /**
   * Untrusted raw RunConfiguration — parsed at this trust boundary via
   * `parseRunConfiguration` (C1 §29). The digest in provenance is DERIVED
   * from the artifact, never a caller-invented string. Mutually exclusive
   * with `trustedRunConfiguration`.
   */
  readonly rawRunConfiguration?: unknown;
  /**
   * Trusted RunConfiguration — already produced by the run-configuration
   * parser/materializer. Trusted API boundary, not an unforgeable capability.
   * Mutually exclusive with `rawRunConfiguration`; exactly one source is
   * required (C1 §29).
   */
  readonly trustedRunConfiguration?: RunConfiguration;
  /**
   * Untrusted raw BindingObservationSnapshot — parsed at this trust boundary
   * via `parseObservationSnapshot` (C2 §48). The SnapshotRef in provenance is
   * DERIVED from the artifact (snapshotId + content digest), never a
   * caller-invented string. Mutually exclusive with
   * `trustedObservationSnapshot`; exactly one source is required. There is no
   * default snapshot: unknown capability must never be evaluated as
   * unavailable (C2 §45/§46).
   */
  readonly rawObservationSnapshot?: unknown;
  /**
   * Trusted BindingObservationSnapshot — already produced by the observation
   * parser/materializer. Trusted API boundary, not an unforgeable capability.
   * Mutually exclusive with `rawObservationSnapshot`.
   */
  readonly trustedObservationSnapshot?: BindingObservationSnapshot;
  readonly resolverPolicy?: ResolverPolicyRef;
  /** Artifact-layer allocation input (PF-03 / B4 §38): supplied by the caller, deterministic, never generated here. */
  readonly resolutionId: string;
  /**
   * The basis admission is evaluated against (B4 §24). Defaults to this
   * input's own basis (by construction current); a caller whose admission
   * basis advanced between resolve and plan supplies the current one, and a
   * drifted basis refuses the plan (stale) instead of admitting it.
   */
  readonly admissionBasis?: FreshnessBasis;
}

/** Satisfied-but-not-yet-materialized semantic resolution (no plan references it; nothing persisted). */
export type SatisfiedSemanticResolution = Extract<SemanticResolutionResult, { status: "satisfied" }>;

/** Planning outcome (B4 §21/§49): configuration problems throw; the semantic outcomes are values. */
export type BindingPlanCompileResult =
  | { readonly status: "planned"; readonly plan: CompiledBindingPlan; readonly resolution: SatisfiedBindingResolution }
  | { readonly status: "binding_unsatisfied"; readonly result: UnsatisfiedBindingResolution }
  | { readonly status: "stale"; readonly resolution: SatisfiedSemanticResolution };

// `workRefOf` / `architectureRefOf` live in ./refs.ts (single home for the
// artifact→ref adapters; re-exported below for the established public surface).
export { architectureRefOf, workRefOf } from "./refs.js";


/**
 * Architecture subject derivation (C0 §32): C0's Binding-addressable
 * Architecture subjects are the AgentDefinitions; their subject refs are
 * derived solely from `AgentDefinitionId` through this explicit adapter.
 * This is NOT a frozen universal equivalence (`ArchitectureSubjectRef ≡
 * AgentDefinitionId`) — future Architecture schemas may add subject species
 * (C0 §33).
 */
export function architectureSubjectRefsOf(
  architecture: ArchitectureDefinition,
): readonly ArchitectureSubjectRef[] {
  return Object.freeze(
    architecture.agentDefinitions.map((agent) => agent.agentDefinitionId),
  );
}

function requireWellFormedRef(
  value: DefinitionRevisionRef | undefined,
  what: string,
): DefinitionRevisionRef {
  if (value === undefined || typeof value !== "object") {
    throw new BindingConfigurationError(`${what}: a well-formed DefinitionRevisionRef is required`);
  }
  if (
    typeof value.definitionId !== "string" ||
    value.definitionId.length === 0 ||
    typeof value.revision !== "number" ||
    !Number.isInteger(value.revision) ||
    value.revision < 0 ||
    typeof value.digest !== "string" ||
    value.digest.length === 0
  ) {
    throw new BindingConfigurationError(
      `${what}: definitionId/revision/digest must be a well-formed non-empty identity ` +
        `(structural validation only — authoritative grounding is an upstream canonical producer's responsibility)`,
    );
  }
  return value;
}

function hardKeysWithinSubjects(
  hard: Readonly<Record<string, SubjectCapabilityProfile>> | undefined,
  subjects: ReadonlySet<string>,
  what: string,
): void {
  for (const subject of Object.keys(hard ?? {})) {
    if (!subjects.has(subject)) {
      throw new BindingConfigurationError(
        `${what}: requirement profile for "${subject}" names a non-participating subject`,
      );
    }
  }
}

// C2 §48/§49: the observation artifact is the only snapshot source; its
// translation into the kernel's spike-fixture `ResolverSnapshot` (ref +
// capability facts) stays a PRIVATE boundary — fixture types do not escape.
function toKernelSnapshot(snapshot: BindingObservationSnapshot): ResolverSnapshot {
  const persistentCandidates = snapshot.persistentCandidates.map((candidate) => ({
    point: candidate.point,
    available: candidate.available,
    ...(candidate.runtimeFeatures === undefined ? {} : { runtimeFeatures: candidate.runtimeFeatures }),
    ...(candidate.toolCapabilities === undefined
      ? {}
      : { toolCapabilities: candidate.toolCapabilities }),
  }));
  return {
    ref: observationRefOf(snapshot),
    ephemeralCapabilities: snapshot.ephemeralCapabilities as SubjectRequirementFixture,
    persistentCandidates,
  };
}

function resolveObservationSnapshot(input: {
  readonly rawObservationSnapshot?: unknown;
  readonly trustedObservationSnapshot?: BindingObservationSnapshot;
}): BindingObservationSnapshot {
  if (
    input.rawObservationSnapshot !== undefined &&
    input.trustedObservationSnapshot !== undefined
  ) {
    throw new BindingConfigurationError(
      "supply either rawObservationSnapshot (parsed at this boundary) or trustedObservationSnapshot, not both",
    );
  }
  if (input.rawObservationSnapshot !== undefined) {
    // Observation parse errors stay distinct from binding outcomes (C2 §42).
    return parseObservationSnapshot(input.rawObservationSnapshot);
  }
  if (input.trustedObservationSnapshot !== undefined) {
    return input.trustedObservationSnapshot;
  }
  throw new BindingConfigurationError(
    "observationSnapshot: exactly one BindingObservationSnapshot source is required " +
      "(rawObservationSnapshot or trustedObservationSnapshot) — the SnapshotRef is derived from the artifact, never invented by the caller; no default snapshot exists (unknown capability must never be evaluated as unavailable)",
  );
}

function toKernelHard(
  hard: Readonly<Record<string, SubjectCapabilityProfile>> | undefined,
): Readonly<Record<string, SubjectRequirementFixture>> {
  if (hard === undefined) return {};
  return hard as Readonly<Record<string, SubjectRequirementFixture>>;
}

/**
 * Pure, deterministic planning compile (B4 §21 control flow):
 *
 *   validate configuration (throws BindingConfigurationError — never collapsed
 *   into unsatisfied, B4 §23; architecture parse errors are distinct, C0 §74)
 *   → resolve via the frozen kernel → unsatisfied returns a planning condition
 *   and NO plan (B4 §22) → freshness gate against the admission basis (B4 §24)
 *   → stale returns no plan → otherwise materialize with the caller-supplied
 *   resolutionId and construct the frozen ref-only plan.
 */
export function compileBindingPlan(input: BindingPlanCompileInput): BindingPlanCompileResult {
  const work = requireWellFormedRef(input.work, "work");
  // C0 §34–§39: Architecture provenance is DERIVED from an actual
  // ArchitectureDefinition artifact — the arbitrary caller ref/subject seams
  // are gone. Exactly one raw/trusted source; raw is parsed before anything
  // else (architecture parse errors stay distinct from binding outcomes).
  if (
    input.rawArchitectureDefinition !== undefined &&
    input.trustedArchitectureDefinition !== undefined
  ) {
    throw new BindingConfigurationError(
      "supply either rawArchitectureDefinition (parsed at this boundary) or trustedArchitectureDefinition, not both",
    );
  }
  let architecture: ArchitectureDefinition;
  if (input.rawArchitectureDefinition !== undefined) {
    // Architecture parse errors propagate distinct from binding outcomes (C0 §74).
    architecture = parseArchitectureDefinition(input.rawArchitectureDefinition);
  } else if (input.trustedArchitectureDefinition !== undefined) {
    architecture = input.trustedArchitectureDefinition;
  } else {
    throw new BindingConfigurationError(
      "architecture: exactly one ArchitectureDefinition source is required " +
        "(rawArchitectureDefinition or trustedArchitectureDefinition) — provenance is derived from the artifact, never invented by the caller",
    );
  }
  const architectureRef = architectureRefOf(architecture);
  const subjects = architectureSubjectRefsOf(architecture);
  // C1 §29: the RunConfiguration digest is DERIVED from the artifact — the
  // arbitrary caller-supplied digest string is gone. RunConfiguration parse
  // errors stay distinct from binding outcomes.
  if (
    input.rawRunConfiguration !== undefined &&
    input.trustedRunConfiguration !== undefined
  ) {
    throw new BindingConfigurationError(
      "supply either rawRunConfiguration (parsed at this boundary) or trustedRunConfiguration, not both",
    );
  }
  let runConfiguration: RunConfiguration;
  if (input.rawRunConfiguration !== undefined) {
    runConfiguration = parseRunConfiguration(input.rawRunConfiguration);
  } else if (input.trustedRunConfiguration !== undefined) {
    runConfiguration = input.trustedRunConfiguration;
  } else {
    throw new BindingConfigurationError(
      "runConfiguration: exactly one RunConfiguration source is required " +
        "(rawRunConfiguration or trustedRunConfiguration) — the provenance digest is derived from the artifact, never invented by the caller",
    );
  }
  const runConfigurationDigest = runConfiguration.digest;
  const observation = resolveObservationSnapshot(input);
  const snapshot = toKernelSnapshot(observation);
  if (typeof input.resolutionId !== "string" || input.resolutionId.length === 0) {
    throw new BindingConfigurationError(
      "resolutionId: required (artifact-layer allocation input, supplied by the caller — never generated inside semantic resolution)",
    );
  }

  hardKeysWithinSubjects(input.architectureHard, new Set(subjects), "architectureHard");
  hardKeysWithinSubjects(input.workHard, new Set(subjects), "workHard");

  // Trust boundary (B4 §37): raw definitions are parsed here; a trusted
  // already-parsed definition is a distinct input; supplying both is ambiguous.
  let explicitDefinition: BindingDefinition | undefined;
  if (input.rawBindingDefinition !== undefined && input.trustedBindingDefinition !== undefined) {
    throw new BindingConfigurationError(
      "supply either rawBindingDefinition (parsed at this boundary) or trustedBindingDefinition, not both",
    );
  }
  if (input.rawBindingDefinition !== undefined) {
    explicitDefinition = parseBindingDefinition(input.rawBindingDefinition);
  } else if (input.trustedBindingDefinition !== undefined) {
    explicitDefinition = input.trustedBindingDefinition;
  }
  // B4 §31: an explicit definition without participating subjects is a
  // configuration failure — never a task→subject mapping.
  if (explicitDefinition !== undefined && subjects.length === 0) {
    throw new BindingConfigurationError(
      "an explicit BindingDefinition requires participating ArchitectureSubjects; the supplied ArchitectureDefinition contributes none",
    );
  }

  const semantic = resolveBindingCore({
    participatingSubjects: subjects,
    architecture: architectureRef,
    work,
    architectureHard: toKernelHard(input.architectureHard),
    workHard: toKernelHard(input.workHard),
    intentSource: compileBindingIntentSource(explicitDefinition),
    ...(explicitDefinition === undefined ? {} : { explicitDefinition }),
    runConfigurationDigest,
    snapshot,
    ...(input.resolverPolicy === undefined ? {} : { resolverPolicy: input.resolverPolicy }),
  });

  if (semantic.status === "unsatisfied") {
    // Pre-execution planning condition (B4 §22): no plan, no task, no event.
    const unsatisfied = materializeResolutionResult(semantic);
    if (unsatisfied.status !== "unsatisfied") {
      throw new BindingConfigurationError("unsatisfied semantic resolution failed to materialize");
    }
    return Object.freeze({
      status: "binding_unsatisfied",
      result: unsatisfied,
    }) as BindingPlanCompileResult;
  }

  // Materialize (pure) so the kernel's digest feeds the freshness gate (B4
  // §24): a stale verdict returns the pre-materialization semantic result —
  // no plan ever references the inadmissible artifact.
  const resolution = materializeResolutionResult(semantic, input.resolutionId);
  if (resolution.status !== "satisfied") {
    throw new BindingConfigurationError("satisfied semantic resolution failed to materialize");
  }
  const ownBasis: FreshnessBasis = {
    architecture: architectureRef,
    work,
    intentSource: compileBindingIntentSource(explicitDefinition),
    runConfigurationDigest,
    snapshot: { ref: snapshot.ref },
    resolverPolicy: input.resolverPolicy ?? MINIMAL_RESOLVER_POLICY,
  };
  if (evaluateFreshness(resolution, input.admissionBasis ?? ownBasis) === "stale") {
    return Object.freeze({ status: "stale", resolution: semantic }) as BindingPlanCompileResult;
  }

  return Object.freeze({
    status: "planned",
    resolution,
    // Ref-only join (B4 §19/§20/§56): the plan stores resolutionId + digest,
    // never a full resolution copy; deep-frozen, no caller-input aliasing.
    plan: Object.freeze({
      work: Object.freeze({ ...work }),
      bindingResolution: Object.freeze({
        resolutionId: input.resolutionId,
        digest: resolution.digest,
      }),
    }),
  }) as BindingPlanCompileResult;
}
