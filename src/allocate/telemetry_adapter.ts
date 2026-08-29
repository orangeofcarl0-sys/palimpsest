/**
 * Telemetry→allocation adapter (PLMP-ALC-1 §4, ruling ALC-D2): a pure,
 * conservative remap of the R5 rule-table output. The rule table itself is
 * untouched - telemetry may only widen the candidate count under
 * discriminating verification, trade the worker/strong escalation class,
 * and never touch the structural classes or the hard §44/§35 branches.
 */

import type { Allocation, AllocationEstimates } from "./allocator.js";

/** task_type-level eligibility: below this many pooled attempts the rule output stands. */
export const ELIGIBILITY_MIN_ATTEMPTS = 12;
/** Pooled smoothed success rate at/below which a struggling worker rule escalates. */
export const ESCALATE_BELOW = 0.5;
/** Pooled smoothed success rate at/above which a strong rule downgrades. */
export const DOWNGRADE_ABOVE = 0.85;

export interface AllocationTelemetryStats {
  /** Attempts pooled across models for one task_type. */
  readonly attempts: number;
  readonly successes: number;
  /** Gamma-smoothed pooled success rate (R6 prior: 4 attempts @ 0.5). */
  readonly successRate: number;
}

export interface AdjustAllocationInput {
  readonly estimates: AllocationEstimates;
  /** Host policy ceiling; widening never produces more than this. */
  readonly candidateLimit: number;
  /** Pooled task_type stats; undefined means telemetry does not participate. */
  readonly stats: AllocationTelemetryStats | undefined;
}

function withTelemetryReason(rule: Allocation, clause: string): Allocation {
  return { ...rule, reason: `${rule.reason}; telemetry: ${clause}` };
}

export function adjustAllocation(rule: Allocation, input: AdjustAllocationInput): Allocation {
  const { estimates, candidateLimit, stats } = input;
  if (stats === undefined || stats.attempts < ELIGIBILITY_MIN_ATTEMPTS) return rule;

  // Hard guards ([ALC-INV-1..3]) - a deliberate mirror of the rule table's
  // hard branches (§44 pre-screen, §35 quadrant, structural classes); keep
  // this mirror in sync when the table's hard branches change.
  if (estimates.expensiveExecution) return rule;
  if (rule.escalation === "cheap" || rule.escalation === "design-experiment") return rule;
  const inUvQuadrant = estimates.uncertainty === "high" && estimates.verifiability === "weak";
  const pooled = `pooled success ${stats.successRate.toFixed(2)} over ${stats.attempts} attempts`;

  if (rule.escalation === "worker" && stats.successRate <= ESCALATE_BELOW) {
    // §35 partition: struggling work widens the sample only where
    // verification can actually discriminate, and only with headroom;
    // otherwise add reasoning, not samples ([ALC-INV-2] keeps the U×V
    // candidate count frozen either way).
    if (
      stats.successRate < ESCALATE_BELOW &&
      !inUvQuadrant &&
      (estimates.verifiability === "deterministic" || estimates.verifiability === "easy") &&
      rule.candidates < candidateLimit
    ) {
      return withTelemetryReason(
        { ...rule, candidates: Math.min(rule.candidates * 2, candidateLimit) },
        `${pooled} -> widen candidates`,
      );
    }
    return withTelemetryReason(
      { ...rule, escalation: "strong" },
      `${pooled} -> escalate to strong`,
    );
  }
  if (rule.escalation === "strong" && stats.successRate >= DOWNGRADE_ABOVE) {
    // Observed success overturns §35's conservative prior; the sample count
    // never moves in the U×V quadrant ([ALC-INV-2]).
    return withTelemetryReason(
      { ...rule, escalation: "worker" },
      `${pooled} -> downgrade to worker`,
    );
  }
  return rule;
}
