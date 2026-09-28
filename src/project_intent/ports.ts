/**
 * E2-I §9/§18/§20/§21 — the CONSUMER-OWNED READ PORTS and the invalidation-strength derivation.
 *
 * ## The port wall (§9)
 *
 * `src/project_intent/**` must not import a concrete Proof service/store, Reasoning service/store,
 * ProjectWorkspace store, `ProjectController` or `EventStore`. It declares the narrow READ capabilities
 * it needs and composition adapts the owners into them. There is deliberately NO mutation method onto
 * Proof, Reasoning or the Journal: a proposal observes knowledge, it never writes it.
 *
 * The single WRITE the module needs is `applyAcceptedRevision`, which is a port over the EXISTING
 * revision owner (`planReconciled`) rather than a new mutation path. Keeping it a port is what lets the
 * service stay ignorant of `ProjectController` while still using the only sanctioned revision seam.
 *
 * ## §20 invalidation strength is DERIVED, never supplied
 *
 * E2-I changes PROJECT MEANING, so it must not let runnable Work survive as though nothing changed. The
 * strength is a function of the change kinds — a caller cannot pass "this one is harmless".
 *
 * Layer: L2 (`src/project_intent/`).
 */
import type { ProjectIntentChange } from "./proposal.js";

/* ------------------------------------------------------------------ *
 * §9 consumer-owned ports
 * ------------------------------------------------------------------ */

/** The project facts a proposal basis is frozen against. */
export interface IntentProjectFacts {
  readonly projectId: string;
  readonly revision: number;
  readonly digest: string;
  readonly headCommit: string;
  readonly goal: string;
  readonly requirements: readonly { readonly requirement_id: string; readonly statement: string; readonly priority: string; readonly acceptance_refs: readonly string[] }[];
  readonly decisions: readonly { readonly decision_id: string; readonly statement: string; readonly rationale: string; readonly evidence_ids: readonly string[]; readonly supersedes: string | null }[];
  /** §20: the CURRENT nonterminal task ids — the set a meaning change retires. */
  readonly nonterminalTaskIds: readonly string[];
}

/** The Proof owner's answer about a claim, mirroring E1-K's classified absence. */
export type IntentProofObservation =
  | { readonly classified: "observed"; readonly effectiveStanding: string; readonly freshness: string }
  | { readonly classified: "NOT_FOUND" }
  | { readonly classified: "NOT_PUBLISHED" };

export interface IntentProofBasis {
  readonly scopeId: string;
  readonly throughSeq: number;
  readonly chainDigest: string;
}

export interface IntentReasoningFrontier {
  readonly cellId: string;
  readonly frontierRevision: number;
  readonly frontierDigest: string;
  readonly activeClaimIds: readonly string[];
}

/** §8/§28: the journal entry the negative-result ground binds, read through its OWNER. */
export interface IntentJournalEntryView {
  readonly entryId: string;
  readonly projectId: string;
  readonly kind: string;
  readonly digest: string;
  readonly resolution: { readonly status: string; readonly detail?: string | undefined } | null;
}

/**
 * THE PORTS. Project association is its own capability because it is a ProjectWorkspace truth, exactly
 * as in E1-K — and for the same reason: Proof and Reasoning do not decide project membership.
 */
export interface ProjectIntentPorts {
  /** The canonical project facts (the basis source and the current intent). */
  readonly project: {
    facts(): Promise<IntentProjectFacts>;
  };
  /** ProjectWorkspace READ: is this asset explicitly associated with THIS project? */
  readonly projectAssets: {
    associated(kind: "PROOF_CLAIM" | "REASONING_CELL", id: string): Promise<boolean>;
  };
  /** Proof owner READ (compile-time observation + the plane basis for the race window). */
  readonly proof: {
    observeBasis(): Promise<IntentProofBasis | undefined>;
    observeClaim(claimId: string): Promise<IntentProofObservation>;
  };
  /** Reasoning owner READ: ONE self-consistent frontier observation. */
  readonly reasoning: {
    observeFrontier(cellId: string): Promise<IntentReasoningFrontier | undefined>;
  };
  /** ProjectJournal READ: one entry by id, with its latest resolution merged. */
  readonly journal: {
    entry(entryId: string): Promise<IntentJournalEntryView | undefined>;
  };
  /**
   * §21: the ONE governed write — the EXISTING revision path, behind a port. Composition binds it to
   * `controller.planReconciled`, so quiescence, the promotion fence, the head-sync fence, Evidence
   * invalidation, task staling and the revision CAS all remain authoritative.
   */
  readonly applyAcceptedRevision: (input: {
    readonly changes: readonly ProjectIntentChange[];
    readonly changeClass: "behavior_change" | "contract_breaking";
    readonly changedIds: readonly string[];
    readonly reason: string;
    readonly acceptedIntentReconciliation: unknown;
  }) => { readonly revision: number; readonly digest: string; readonly staledTaskIds: readonly string[] };
}

/* ------------------------------------------------------------------ *
 * §20 derived invalidation strength
 * ------------------------------------------------------------------ */

/** §20: the conservative derivation. There is no caller-supplied strength. */
export function changeClassForIntentChanges(
  changes: readonly ProjectIntentChange[],
): "behavior_change" | "contract_breaking" {
  // GOAL_REVISE, REQUIREMENT_ADD/REVISE/REMOVE change what "done" MEANS, so they are
  // contract_breaking. DECISION_APPEND/SUPERSEDE change how work is done, which is behavior_change.
  // The stronger class wins when a proposal mixes them.
  const contractBreaking = changes.some(
    (change) =>
      change.kind === "GOAL_REVISE" ||
      change.kind === "REQUIREMENT_ADD" ||
      change.kind === "REQUIREMENT_REVISE" ||
      change.kind === "REQUIREMENT_REMOVE",
  );
  return contractBreaking ? "contract_breaking" : "behavior_change";
}

/**
 * §20: for E2-I V1 top-level changes the changed set is ALL current nonterminal tasks. The old plan was
 * authored under the old intent, so it is not silently reauthorized under changed top-level intent —
 * terminal historical Work remains history.
 */
export function changedIdsForIntentChanges(facts: IntentProjectFacts): readonly string[] {
  return Object.freeze([...facts.nonterminalTaskIds].sort());
}

/**
 * §20: the human-readable reason recorded on the revision. It names the intent change, so a reader of
 * the event knows why the Work was retired without having to fetch the proposal.
 */
export function revisionReasonFor(changes: readonly ProjectIntentChange[]): string {
  const kinds = [...new Set(changes.map((change) => change.kind))].sort();
  return `intent reconciliation: ${kinds.join(", ")}`;
}
