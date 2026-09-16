/**
 * G10-AD §10 — verifier INDEPENDENCE (provenance, never a correctness claim).
 *
 *   VerifierIndependence ≠ VerifierCorrectness
 *   DifferentModel      ≠ AutomaticallyIndependent
 *   DifferentPrompt     ≠ Independent
 *   FreshContext        ≠ Truth
 *   SameModelSameContext ≠ Independent
 *
 * The five classes are a PRODUCT interpretation of who ran the protocol and
 * under which context separation. Nothing here is a truth channel: a class only
 * says how much the deployment can prove about the separation between the
 * verifier and the work it verified.
 *
 * This module is pure: it opens no store, executes no verifier and holds no
 * project state. It owns the class vocabulary so the artifacts and the model
 * classifier cannot drift apart.
 */

import type { VerifierDefinition, VerifierProvenance } from "./artifacts.js";

export const VERIFIER_INDEPENDENCE_CLASSES = [
  /** A mechanical protocol (a command, a deterministic check) that does not
   * share the authoring context at all: it consumes the artifact, not an opinion. */
  "MECHANICAL_INDEPENDENT",
  /** A separately-held provider, counted ONLY when its separation contract is explicit. */
  "EXTERNALLY_SEPARATED",
  /** Declared separate by the deployment, but the separation is not established. */
  "DECLARED_SEPARATE",
  /** The verifier shares the model AND the context of the work it verifies. */
  "SHARED_CONTEXT",
  /** The deployment cannot establish the separation at all. */
  "UNKNOWN",
] as const;
export type VerifierIndependenceClass = (typeof VERIFIER_INDEPENDENCE_CLASSES)[number];

export function isVerifierIndependenceClass(value: unknown): value is VerifierIndependenceClass {
  return typeof value === "string" && (VERIFIER_INDEPENDENCE_CLASSES as readonly string[]).includes(value);
}

/**
 * §10 product interpretation, encoded ONCE:
 *
 *   MECHANICAL_INDEPENDENT counts;
 *   EXTERNALLY_SEPARATED counts only with an explicit contract;
 *   DECLARED_SEPARATE never counts (it is displayed as DECLARED);
 *   SHARED_CONTEXT never counts;
 *   UNKNOWN never counts.
 */
export const COUNTING_INDEPENDENCE_CLASSES: ReadonlySet<VerifierIndependenceClass> = new Set([
  "MECHANICAL_INDEPENDENT",
]);

/**
 * WHERE an external separation actually lives. §10: "EXTERNALLY_SEPARATED may
 * count if its contract is explicit" — a bare class value is not a contract, so
 * the definition must name the boundary and the implementation that holds it.
 */
export const SEPARATION_BOUNDARY_KINDS = [
  "SEPARATE_PROCESS",
  "SEPARATE_SERVICE",
  "SEPARATE_HOST",
] as const;
export type SeparationBoundaryKind = (typeof SEPARATION_BOUNDARY_KINDS)[number];

export function isSeparationBoundaryKind(value: unknown): value is SeparationBoundaryKind {
  return (
    typeof value === "string" && (SEPARATION_BOUNDARY_KINDS as readonly string[]).includes(value)
  );
}

export interface ExternalSeparationContract {
  readonly boundary: SeparationBoundaryKind;
  /** The concrete implementation/provider that holds the boundary (never a model name). */
  readonly boundaryRef: string;
  /** Free-form, deployment-authored statement of what is separated from what. */
  readonly statement: string;
}

/**
 * Is the external separation CONTRACT explicit? An EXTERNALLY_SEPARATED
 * definition with no contract (or with a contract that names no boundary) is
 * still DISPLAYED as externally separated, but it does not count.
 */
export function hasExplicitSeparationContract(
  definition: Pick<VerifierDefinition, "independenceClass" | "separationContract">,
): boolean {
  if (definition.independenceClass !== "EXTERNALLY_SEPARATED") return false;
  const contract = definition.separationContract;
  if (contract === null) return false;
  return (
    isSeparationBoundaryKind(contract.boundary) &&
    contract.boundaryRef.trim() !== "" &&
    contract.statement.trim() !== ""
  );
}

/**
 * Does this definition count as an INDEPENDENT verifier for VERIFY availability?
 * Pure and total. `EXTERNALLY_SEPARATED` requires the explicit contract above.
 */
export function countsAsIndependent(
  definition: Pick<VerifierDefinition, "independenceClass" | "separationContract">,
): boolean {
  switch (definition.independenceClass) {
    case "MECHANICAL_INDEPENDENT":
      return true;
    case "EXTERNALLY_SEPARATED":
      return hasExplicitSeparationContract(definition);
    case "DECLARED_SEPARATE":
    case "SHARED_CONTEXT":
    case "UNKNOWN":
      return false;
  }
}

/** The honest, human-facing basis for a class (never an upgrade). */
export function independenceBasis(
  definition: Pick<VerifierDefinition, "independenceClass" | "separationContract" | "kind">,
): string {
  switch (definition.independenceClass) {
    case "MECHANICAL_INDEPENDENT":
      return `the verifier protocol is mechanical (kind ${definition.kind}): it checks the artifact, not an opinion, and consumes no shared authoring context`;
    case "EXTERNALLY_SEPARATED":
      return hasExplicitSeparationContract(definition)
        ? `an explicit separation contract is declared (${definition.separationContract!.boundary} via ${definition.separationContract!.boundaryRef}); the separation is a deployment claim about a boundary, not a correctness guarantee`
        : "declared EXTERNALLY_SEPARATED without an explicit separation contract; it is displayed as declared and does not count as independent";
    case "DECLARED_SEPARATE":
      return "declared separate by the deployment, but the separation is not established; displayed as DECLARED_SEPARATE and never silently upgraded";
    case "SHARED_CONTEXT":
      return "the verifier shares the model and/or the context of the verified work; same model + same context is never independent";
    case "UNKNOWN":
      return "the deployment cannot establish the separation; unknown separation is reported honestly and does not count";
  }
}

/* -------------------------------------------------------------------------- *
 * Per-definition summary (§10/§13/§15)
 * -------------------------------------------------------------------------- */

export interface VerifierIndependenceEntry {
  readonly verifierRef: string;
  readonly independenceClass: VerifierIndependenceClass;
  readonly countsAsIndependent: boolean;
  readonly basis: string;
}

export interface VerifierIndependenceSummary {
  readonly entries: readonly VerifierIndependenceEntry[];
  readonly independentRefs: readonly string[];
  /** DECLARED_SEPARATE refs, DISPLAYED as declared (§10). */
  readonly declaredSeparateRefs: readonly string[];
  /** SHARED_CONTEXT and UNKNOWN refs, explicitly named as NOT independent. */
  readonly notIndependentRefs: readonly string[];
  /** TRUE iff at least one definition counts as independent. */
  readonly independentVerifyAvailable: boolean;
  /** The honest one-line summary a posture/view can render verbatim. */
  readonly note: string;
}

export function independenceSummary(
  definitions: readonly Pick<VerifierDefinition, "verifierRef" | "independenceClass" | "separationContract" | "kind">[],
): VerifierIndependenceSummary {
  const entries: VerifierIndependenceEntry[] = [];
  for (const definition of definitions) {
    const counts = countsAsIndependent(definition);
    entries.push(
      Object.freeze({
        verifierRef: definition.verifierRef,
        independenceClass: definition.independenceClass,
        countsAsIndependent: counts,
        basis: independenceBasis(definition),
      }),
    );
  }
  const independentRefs = Object.freeze(
    entries.filter((entry) => entry.countsAsIndependent).map((entry) => entry.verifierRef).sort(),
  );
  const declaredSeparateRefs = Object.freeze(
    entries
      .filter((entry) => entry.independenceClass === "DECLARED_SEPARATE")
      .map((entry) => entry.verifierRef)
      .sort(),
  );
  const notIndependentRefs = Object.freeze(
    entries
      .filter(
        (entry) =>
          !entry.countsAsIndependent &&
          (entry.independenceClass === "SHARED_CONTEXT" || entry.independenceClass === "UNKNOWN"),
      )
      .map((entry) => entry.verifierRef)
      .sort(),
  );
  const independentVerifyAvailable = independentRefs.length > 0;
  return Object.freeze({
    entries: Object.freeze(entries),
    independentRefs,
    declaredSeparateRefs,
    notIndependentRefs,
    independentVerifyAvailable,
    note: independentVerifyAvailable
      ? `${independentRefs.length} registered verifier(s) count as independent (${independentRefs.join(", ")})`
      : "no registered verifier counts as independent: VERIFY is not available from this registry",
  });
}

/* -------------------------------------------------------------------------- *
 * Model verifiers — the rule, not a convention (§10)
 * -------------------------------------------------------------------------- */

/**
 * The facts a model-verifier path must be able to establish. Absent facts are
 * NOT a licence to assume separation: `establishable: false` is UNKNOWN.
 */
export interface ModelVerifierFacts {
  /** The verifier's model identity. */
  readonly model: string;
  /** The verifier's context identity (the isolation boundary the host can prove). */
  readonly contextId: string;
  /** The verifier's prompt/role version. NEVER an independence input. */
  readonly promptVersion: string | null;
  /** The model that produced the work being verified. */
  readonly principalModel: string;
  /** The context that produced the work being verified. */
  readonly principalContextId: string;
  /**
   * TRUE only when the host can PROVE a real provider boundary (a separate
   * process/service/host that holds the verifier's context) — a different prompt
   * or role is explicitly NOT such a proof.
   */
  readonly providerBoundaryProven: boolean;
  /** FALSE when the host cannot establish the facts at all. */
  readonly establishable: boolean;
}

/**
 * The classifier the model-verifier path MUST use. It refuses to label
 * same-model/same-context anything better than SHARED_CONTEXT — different
 * prompt, different role and different "agent identity" change nothing.
 */
export function classifyModelIndependence(facts: ModelVerifierFacts): VerifierIndependenceClass {
  if (!facts.establishable) return "UNKNOWN";
  const sameModel = facts.model.trim() !== "" && facts.model === facts.principalModel;
  const sameContext =
    facts.contextId.trim() !== "" && facts.contextId === facts.principalContextId;
  // The hard rule: same model AND same context can never be better than
  // SHARED_CONTEXT, whatever the prompt/role version says.
  if (sameModel && sameContext) return "SHARED_CONTEXT";
  if (sameModel || sameContext) {
    // One axis differs (a different model in the same context, or the same model
    // in a fresh context). Without a PROVEN provider boundary this is a
    // declaration, not an established separation.
    return facts.providerBoundaryProven ? "EXTERNALLY_SEPARATED" : "DECLARED_SEPARATE";
  }
  return facts.providerBoundaryProven ? "EXTERNALLY_SEPARATED" : "DECLARED_SEPARATE";
}

/**
 * "Never upgrade": the effective class is the WEAKER of what the deployment
 * declared and what the facts establish. A model adapter that declares
 * MECHANICAL_INDEPENDENT while running the same model in the same context is
 * reduced to SHARED_CONTEXT.
 */
const INDEPENDENCE_RANK: Readonly<Record<VerifierIndependenceClass, number>> = Object.freeze({
  MECHANICAL_INDEPENDENT: 3,
  EXTERNALLY_SEPARATED: 2,
  DECLARED_SEPARATE: 1,
  SHARED_CONTEXT: 0,
  // UNKNOWN is the absence of information: weakest, and never independent.
  UNKNOWN: 0,
});

export function weakerIndependenceClass(
  left: VerifierIndependenceClass,
  right: VerifierIndependenceClass,
): VerifierIndependenceClass {
  if (left === right) return left;
  const leftRank = INDEPENDENCE_RANK[left];
  const rightRank = INDEPENDENCE_RANK[right];
  if (leftRank !== rightRank) return leftRank < rightRank ? left : right;
  // Equal rank, different class (the two rank-0 values): prefer the DEFINITE
  // statement of non-independence over the absence of information.
  return left === "SHARED_CONTEXT" || right === "SHARED_CONTEXT" ? "SHARED_CONTEXT" : left;
}

/** The class a model-verifier definition may honestly carry. */
export function effectiveModelIndependenceClass(input: {
  readonly declared: VerifierIndependenceClass;
  readonly facts: ModelVerifierFacts;
}): VerifierIndependenceClass {
  return weakerIndependenceClass(input.declared, classifyModelIndependence(input.facts));
}

/**
 * Does the DECLARED independence of a definition survive its model facts?
 * Used by the model-verifier path before a definition is registered, so a
 * same-context verifier can never be registered as independent by accident.
 */
export function modelIndependenceIsHonest(input: {
  readonly declared: VerifierIndependenceClass;
  readonly facts: ModelVerifierFacts;
}): boolean {
  return effectiveModelIndependenceClass(input) === input.declared;
}

/** A model verifier's provenance must be versioned, or it cannot be registered. */
export function modelProvenanceIsVersioned(provenance: VerifierProvenance): boolean {
  return (
    provenance.model !== null &&
    provenance.model.trim() !== "" &&
    provenance.promptVersion !== null &&
    provenance.promptVersion.trim() !== ""
  );
}
