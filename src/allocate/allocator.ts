/**
 * Dynamic Compute Allocator (Research line R5, raw-notes 预算.txt §33–43,
 * §51). A pure rule-based policy converting a six-dimensional estimate into
 * an allocation — how many candidates to sample, how many independent
 * verifiers to run, and when to escalate the model class or redesign the
 * verification.
 *
 * The central rule (§35): high uncertainty with easy verification deserves
 * many parallel candidates; high uncertainty with weak verification deserves
 * strong reasoning and a discriminative experiment design — NOT more samples
 * (64 unverifiable opinions stay unverifiable). V0 keeps the table
 * rule-based; a learned policy may replace it after telemetry accumulates.
 */

export type Uncertainty = "low" | "medium" | "high";
export type Verifiability = "deterministic" | "easy" | "weak";

export type Escalation =
  | "cheap"
  | "worker"
  | "strong"
  | "design-experiment";

export interface AllocationEstimates {
  readonly uncertainty: Uncertainty;
  readonly verifiability: Verifiability;
  /** Fan-out / downstream impact: how much depends on getting this right. */
  readonly impact: "low" | "medium" | "high";
  /** Missing evidence for the gate (0 = none missing). */
  readonly evidenceDeficit: number;
  /** Whether this task sits on the critical path. */
  readonly critical: boolean;
  /** Whether execution is expensive (e.g. GPU hours). */
  readonly expensiveExecution: boolean;
}

export interface Allocation {
  readonly candidates: number;
  readonly verifiers: number;
  readonly escalation: Escalation;
  readonly reason: string;
}

/** Rule table (§51): condition → initial allocation. First match wins. */
export function allocate(input: AllocationEstimates): Allocation {
  // GPU-expensive work never gets a wide fan-out: pre-screen aggressively
  // instead (§44: cheap reasoning first, few full runs).
  if (input.expensiveExecution) {
    if (input.critical || input.impact === "high") {
      return {
        candidates: 2,
        verifiers: 2,
        escalation: "worker",
        reason: "expensive execution: pre-screen with 2 candidates + independent verification",
      };
    }
    return {
      candidates: 1,
      verifiers: 1,
      escalation: "cheap",
      reason: "expensive execution: single cheap pre-screen, escalate only on evidence",
    };
  }

  // The U×V quadrant (§35): high uncertainty + weak verification is the only
  // case that must NOT widen the sample.
  if (input.uncertainty === "high" && input.verifiability === "weak") {
    return {
      candidates: 2,
      verifiers: 1,
      escalation: "strong",
      reason:
        "high uncertainty + weak verification: strong reasoning and a discriminative experiment, not more samples",
    };
  }

  if (input.critical || input.impact === "high") {
    return {
      candidates: 4,
      verifiers: 2,
      escalation: "worker",
      reason: "critical/high-impact contract: 4 candidates + independent verification",
    };
  }

  if (input.uncertainty === "high") {
    return {
      candidates: 8,
      verifiers: 1,
      escalation: input.verifiability === "deterministic" ? "worker" : "worker",
      reason: "high uncertainty, easy verification: wide parallel sampling (8 candidates)",
    };
  }

  if (input.uncertainty === "medium") {
    return {
      candidates: 4,
      verifiers: 1,
      escalation: "worker",
      reason: "medium uncertainty: 4 candidates",
    };
  }

  return {
    candidates: 1,
    verifiers: 1,
    escalation: "cheap",
    reason: "low uncertainty, deterministic verification: single cheap worker",
  };
}