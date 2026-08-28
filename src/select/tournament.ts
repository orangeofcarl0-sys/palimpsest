/**
 * Recursive pairwise tournament (Research line R4, raw-notes build-system §23,
 * §36). Candidates are compared two at a time in a bracket — never 32 at once
 * in front of a judge — and the judge only ever sees the judge-facing view
 * (structured digest + capped untrusted commentary), never the full
 * trajectory. The winner is picked deterministically: ties resolve to the
 * first candidate so replay with a deterministic judge is stable.
 */

import { DomainValidationError } from "../domain/errors.js";

/** Imported type (kept structural here to avoid a cycle): judge-facing view. */
export interface TournamentEntry {
  readonly id: string;
  /** The judge-facing view: structured digest + capped untrusted commentary. */
  readonly view: {
    structured: {
      attempt_id: string;
      worker_status: string;
      result_commit: string | null;
      changed_files: number;
      produced_artifacts: number;
      duration_ms: number | null;
    };
    commentary: { text: string; origin: "worker-self-report" } | null;
  };
}

export interface TournamentRound {
  readonly left: string;
  readonly right: string;
  readonly winner: string;
  readonly tie: boolean;
}

export interface TournamentResult {
  readonly winner: string | undefined;
  readonly rounds: TournamentRound[];
  readonly comparisons: number;
}

export type PairwiseDecision = "left" | "right" | "tie";

export interface PairwiseJudge {
  /** Compare two candidates; deterministic judges keep tournament replay stable. */
  compare(
    left: TournamentEntry,
    right: TournamentEntry,
  ): Promise<PairwiseDecision> | PairwiseDecision;
}

/**
 * Recursive bracket: pair adjacent entries; the pair winner advances to the
 * next round (an odd entry gets a bye). Runs exactly n-1 comparisons.
 */
export async function runTournament(
  entries: readonly TournamentEntry[],
  judge: PairwiseJudge,
): Promise<TournamentResult> {
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) {
    throw new DomainValidationError("tournament entries must have unique ids");
  }
  const rounds: TournamentRound[] = [];
  let bracket = [...entries];
  while (bracket.length > 1) {
    const next: TournamentEntry[] = [];
    for (let index = 0; index < bracket.length; index += 2) {
      const left = bracket[index]!;
      const right = bracket[index + 1];
      if (right === undefined) {
        next.push(left); // bye
        continue;
      }
      const decision = await judge.compare(left, right);
      const winner = decision === "right" ? right : left;
      next.push(winner);
      rounds.push({
        left: left.id,
        right: right.id,
        winner: winner.id,
        tie: decision === "tie",
      });
    }
    bracket = next;
  }
  return {
    winner: bracket[0]?.id,
    rounds,
    comparisons: rounds.length,
  };
}

/** Convenience wrapper: a judge that prefers an explicit winner id when present. */
export function preferredJudge(winnerId: string): PairwiseJudge {
  return {
    compare(left, right) {
      return left.id === winnerId ? "left" : right.id === winnerId ? "right" : "tie";
    },
  };
}