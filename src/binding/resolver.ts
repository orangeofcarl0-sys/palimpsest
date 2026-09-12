/**
 * PLMP-BIND-1 pure resolver (G10-B3 spike).
 *
 * `resolveBindingCore` is referentially transparent: no clock, no randomness,
 * no filesystem, no network, no global state. It deterministically produces the
 * semantic resolution (selections, provenance, satisfiability). Artifact
 * identity (`resolutionId`) is allocated by the materialization layer from a
 * caller-supplied opaque id (PF-03) and never derived from the digest.
 *
 * The resolver never creates, allocates, promotes, or registers a durable
 * point; the snapshot is read-only input. Case E resolves against ephemeral
 * candidates only — durable continuity is strictly opt-in (PF-04).
 *
 * `ResolverInput` is implementation plumbing for the spike (Architecture/Work
 * production contracts do not exist yet), not a new frozen schema.
 */

import type {
  BindingDefinition,
  BindingIntentSource,
  BindingResolutionResult,
  BindingUnsatisfiedReason,
  ContinuityBindingIntent,
  ContinuitySelection,
  DefinitionRevisionRef,
  DurableContinuityRef,
  ResolutionProvenance,
  ResolverPolicyRef,
  SatisfiedBindingResolution,
  SubjectBinding,
} from "./contract.js";
import { BindingConfigurationError, validateSubjectCoverage } from "./parser.js";
import { computeBindingResolutionDigest } from "./digest.js";

/** The one deterministic spike policy. Implementation choice, not frozen universal policy. */
export const MINIMAL_RESOLVER_POLICY: ResolverPolicyRef = {
  id: "minimal.lexicographic",
  version: "1",
};

/**
 * Frozen semantic reason priority (PLMP-BIND-1 §6 deterministic order).
 * Cross-tier order is frozen semantics; within a tier the lexical order is a
 * deterministic implementation choice. Centralized so the ordering exists in
 * exactly one place (BC-02).
 */
const REASON_TIER: Record<BindingUnsatisfiedReason, 0 | 1 | 2> = {
  pinned_target_unavailable: 0,
  pinned_target_incompatible: 0,
  required_capability_unavailable: 1,
  no_matching_persistent_point: 2,
};

export function orderUnsatisfiedReasons(
  reasons: readonly BindingUnsatisfiedReason[],
): readonly BindingUnsatisfiedReason[] {
  return [...new Set(reasons)].sort((a, b) => {
    const tierDelta = REASON_TIER[a] - REASON_TIER[b];
    return tierDelta !== 0 ? tierDelta : a < b ? -1 : a > b ? 1 : 0;
  });
}

/** Spike adapter: per-subject hard requirements from Architecture/Work. NOT a frozen schema. */
export interface SubjectRequirementFixture {
  readonly runtimeFeatures?: readonly string[];
  readonly toolCapabilities?: readonly string[];
}

/** Spike fixture: resolver-observable facts about one durable continuity candidate. NOT a PersistentPoint. */
export interface BindingCatalogPoint {
  readonly point: DurableContinuityRef;
  readonly available: boolean;
  readonly runtimeFeatures?: readonly string[];
  readonly toolCapabilities?: readonly string[];
}

/** Spike fixture: read-only observation basis (ephemeral profile + durable candidates). */
export interface ResolverSnapshot {
  readonly ref: string;
  readonly ephemeralCapabilities: SubjectRequirementFixture;
  readonly persistentCandidates?: readonly BindingCatalogPoint[];
}

export interface ResolverInput {
  readonly participatingSubjects: readonly string[];
  readonly architecture: DefinitionRevisionRef;
  readonly work: DefinitionRevisionRef;
  readonly architectureHard: Readonly<Record<string, SubjectRequirementFixture>>;
  readonly workHard: Readonly<Record<string, SubjectRequirementFixture>>;
  readonly intentSource: BindingIntentSource;
  readonly explicitDefinition?: BindingDefinition;
  readonly runConfigurationDigest: string;
  readonly snapshot: ResolverSnapshot;
  readonly resolverPolicy?: ResolverPolicyRef;
}

/** Deterministic semantic resolution: artifact identity (resolutionId) not yet allocated. */
export type SemanticResolutionResult =
  | {
      readonly status: "satisfied";
      readonly provenance: ResolutionProvenance;
      readonly continuity: Readonly<Record<string, ContinuitySelection>>;
    }
  | {
      readonly status: "unsatisfied";
      readonly provenance: ResolutionProvenance;
      readonly reasons: readonly BindingUnsatisfiedReason[];
    };

/**
 * Compile the binding intent source. Legacy: no explicit definition ⇒ the
 * implicit ephemeral default (`semanticVersion: 1`) — never a fake definition.
 */
export function compileBindingIntentSource(
  explicitDefinition?: BindingDefinition,
): BindingIntentSource {
  if (explicitDefinition === undefined) {
    return { kind: "implicit_ephemeral_default", semanticVersion: 1 };
  }
  return {
    kind: "explicit",
    binding: {
      bindingDefinitionId: explicitDefinition.bindingDefinitionId,
      revision: explicitDefinition.revision,
      digest: explicitDefinition.digest,
    },
  };
}

/**
 * Pure, deterministic resolution over the supplied snapshot. With identical
 * semantic inputs, snapshot, and resolver policy, the result (satisfiability,
 * selections, digest) is identical. `resolutionId` is intentionally absent.
 */
export function resolveBindingCore(input: ResolverInput): SemanticResolutionResult {
  const intentSource = input.intentSource;
  // BC-03: intent source ↔ definition coherence, and BC-04: the spike supports
  // exactly one resolver policy, so provenance must record that policy — never
  // a caller-claimed one. All input-validation failures are
  // BindingConfigurationError (invalid resolver input), never
  // BindingUnsatisfiedReason (valid-but-unsatisfiable bindings).
  let explicitDefinition: BindingDefinition | undefined;
  if (intentSource.kind === "explicit") {
    if (input.explicitDefinition === undefined) {
      throw new BindingConfigurationError(
        "explicit intent source requires the parsed explicit BindingDefinition",
      );
    }
    explicitDefinition = input.explicitDefinition;
    const claimed = intentSource.binding;
    const actual = {
      bindingDefinitionId: explicitDefinition.bindingDefinitionId,
      revision: explicitDefinition.revision,
      digest: explicitDefinition.digest,
    };
    if (
      claimed.bindingDefinitionId !== actual.bindingDefinitionId ||
      claimed.revision !== actual.revision ||
      claimed.digest !== actual.digest
    ) {
      throw new BindingConfigurationError(
        "explicit intent source does not identify the supplied BindingDefinition " +
          `(claimed ${claimed.bindingDefinitionId}@${claimed.revision}/${claimed.digest}, ` +
          `actual ${actual.bindingDefinitionId}@${actual.revision}/${actual.digest})`,
      );
    }
  } else if (input.explicitDefinition !== undefined) {
    throw new BindingConfigurationError(
      "implicit_ephemeral_default intent source cannot be combined with an explicit BindingDefinition",
    );
  }

  // BC-04: the spike implements exactly MINIMAL_RESOLVER_POLICY; a caller may
  // omit the policy (recorded as the supported one) or assert it exactly.
  const policy = input.resolverPolicy ?? MINIMAL_RESOLVER_POLICY;
  if (
    policy.id !== MINIMAL_RESOLVER_POLICY.id ||
    policy.version !== MINIMAL_RESOLVER_POLICY.version
  ) {
    throw new BindingConfigurationError(
      `unsupported resolver policy ${policy.id}@${policy.version}: the spike implements ` +
        `${MINIMAL_RESOLVER_POLICY.id}@${MINIMAL_RESOLVER_POLICY.version} only`,
    );
  }

  // PF-02: exact subject-set equality via the centralized validation. For the
  // implicit ephemeral default every participating subject implicitly holds
  // Case-E semantics; for an explicit source the parsed definition's bindings
  // are the binding subjects. (BC-01: equality, not subset.)
  validateSubjectCoverage(
    input.participatingSubjects,
    intentSource.kind === "explicit" && explicitDefinition !== undefined
      ? explicitDefinition
      : {
          schemaVersion: 1,
          bindingDefinitionId: "implicit_ephemeral_default",
          revision: 0,
          digest: "implicit_ephemeral_default",
          bindings: Object.fromEntries(
            [...input.participatingSubjects].sort().map((subject) => [
              subject,
              Object.freeze({ continuity: Object.freeze({}) }) as SubjectBinding,
            ]),
          ),
        },
  );

  const provenance: ResolutionProvenance = {
    // BC-06: contract-boundary copies — the frozen resolution must not alias
    // caller-mutable input objects (readonly is not runtime immutability).
    architecture: { ...input.architecture },
    work: { ...input.work },
    intentSource:
      intentSource.kind === "explicit"
        ? { kind: "explicit", binding: { ...intentSource.binding } }
        : { kind: "implicit_ephemeral_default", semanticVersion: 1 },
    runConfigurationDigest: input.runConfigurationDigest,
    snapshot: { ref: input.snapshot.ref },
    resolverPolicy: { ...policy },
  };

  const subjects = [...input.participatingSubjects].sort();
  const reasons = new Set<BindingUnsatisfiedReason>();
  const continuity: Record<string, ContinuitySelection> = {};
  let satisfied = true;

  for (const subject of subjects) {
    const entry = bindingEntryFor(input, subject, intentSource, explicitDefinition);
    const hard = mergedHardRequirements(input, subject, entry);
    const intent = entry?.continuity ?? {};

    const selection = resolveContinuity(input, subject, intent, hard);
    if (selection === null) {
      // Frozen reason order: capability failure dominates continuity absence.
      satisfied = false;
      reasons.add("required_capability_unavailable");
      continue;
    }
    if (typeof selection === "string") {
      satisfied = false;
      reasons.add(selection);
      continue;
    }
    continuity[subject] = selection;
  }

  if (!satisfied) {
    return {
      status: "unsatisfied",
      provenance,
      // BC-02: frozen semantic priority via the centralized ordering; dedup
      // across subjects retained (diagnostic mapping is not frozen).
      reasons: Object.freeze(orderUnsatisfiedReasons([...reasons])),
    };
  }
  return {
    status: "satisfied",
    provenance,
    continuity: Object.freeze(sortMap(continuity)),
  };
}

/** Materialize the frozen artifact: only satisfied results receive a resolutionId (caller-supplied, opaque). */
export function materializeResolutionResult(
  semantic: SemanticResolutionResult,
  suppliedResolutionId?: string,
): BindingResolutionResult {
  if (semantic.status === "unsatisfied") {
    return Object.freeze({
      status: "unsatisfied",
      schemaVersion: 1,
      provenance: semantic.provenance,
      reasons: semantic.reasons,
    });
  }
  if (suppliedResolutionId === undefined || suppliedResolutionId.length === 0) {
    throw new Error("a satisfied resolution requires a caller-supplied opaque resolutionId");
  }
  const base: SatisfiedBindingResolution = {
    status: "satisfied",
    schemaVersion: 1,
    resolutionId: suppliedResolutionId,
    digest: "",
    provenance: semantic.provenance,
    continuity: semantic.continuity,
  };
  return Object.freeze({
    ...base,
    digest: computeBindingResolutionDigest(base),
  });
}

function bindingEntryFor(
  input: ResolverInput,
  subject: string,
  intentSource: BindingIntentSource,
  explicitDefinition: BindingDefinition | undefined,
): SubjectBinding | undefined {
  if (intentSource.kind === "explicit") {
    const entry = explicitDefinition?.bindings[subject];
    if (entry === undefined) {
      // PF-02: validated before resolution; kept fail-closed here too.
      throw new BindingConfigurationError(
        `explicit BindingDefinition is not total: participating subject "${subject}" has no entry`,
      );
    }
    return entry;
  }
  return undefined; // implicit ephemeral default: no association constraints
}

function mergedHardRequirements(
  input: ResolverInput,
  subject: string,
  entry: SubjectBinding | undefined,
): { runtimeFeatures: Set<string>; toolCapabilities: Set<string> } {
  const runtimeFeatures = new Set<string>();
  const toolCapabilities = new Set<string>();
  const sources = [
    input.architectureHard[subject],
    input.workHard[subject],
    entry?.hard,
  ];
  for (const source of sources) {
    for (const feature of source?.runtimeFeatures ?? []) runtimeFeatures.add(feature);
    for (const capability of source?.toolCapabilities ?? []) toolCapabilities.add(capability);
  }
  return { runtimeFeatures, toolCapabilities };
}

function satisfies(
  candidate: SubjectRequirementFixture,
  hard: { runtimeFeatures: Set<string>; toolCapabilities: Set<string> },
): boolean {
  for (const feature of hard.runtimeFeatures) {
    if (!candidate.runtimeFeatures?.includes(feature)) return false;
  }
  for (const capability of hard.toolCapabilities) {
    if (!candidate.toolCapabilities?.includes(capability)) return false;
  }
  return true;
}

/**
 * Continuity resolution per PLMP-BIND-1 §5/§6 and the PF-04 opt-in rule.
 * Returns a selection, an unsatisfied reason string, or null when the required
 * capability cannot be satisfied by any candidate (reason decided by the caller
 * via `capabilityFailureReason`).
 */
function resolveContinuity(
  input: ResolverInput,
  subject: string,
  intent: ContinuityBindingIntent,
  hard: { runtimeFeatures: Set<string>; toolCapabilities: Set<string> },
): ContinuitySelection | BindingUnsatisfiedReason | null {
  const ephemeralSatisfiable = satisfies(input.snapshot.ephemeralCapabilities, hard);
  const candidates = (input.snapshot.persistentCandidates ?? []).filter(
    (candidate) => candidate.available && satisfies(candidate, hard),
  );

  if (intent.pin !== undefined) {
    const pinned = (input.snapshot.persistentCandidates ?? []).find(
      (candidate) => candidate.point === intent.pin,
    );
    if (pinned === undefined || !pinned.available) return "pinned_target_unavailable";
    if (!satisfies(pinned, hard)) return "pinned_target_incompatible";
    return Object.freeze({ kind: "persistent", point: pinned.point });
  }
  if (intent.requirePersistent === true) {
    if (candidates.length > 0) {
      return Object.freeze({ kind: "persistent", point: lexicographicCandidate(candidates) });
    }
    // Reason order (frozen): capability failure dominates continuity absence.
    return ephemeralSatisfiable ? "no_matching_persistent_point" : null;
  }
  if (intent.preferPersistent === true) {
    if (candidates.length > 0) {
      return Object.freeze({ kind: "persistent", point: lexicographicCandidate(candidates) });
    }
    return ephemeralSatisfiable ? Object.freeze({ kind: "ephemeral" }) : null;
  }
  // Case E: ephemeral candidates only (PF-04) — never opportunistically durable.
  return ephemeralSatisfiable ? Object.freeze({ kind: "ephemeral" }) : null;
}

function lexicographicCandidate(
  candidates: readonly { point: DurableContinuityRef }[],
): DurableContinuityRef {
  return [...candidates].map((candidate) => candidate.point).sort()[0] as string;
}

function sortMap<K extends string, V>(map: Record<string, V>): Record<string, V> {
  const out: Record<string, V> = {};
  for (const key of Object.keys(map).sort()) {
    const value = map[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}
