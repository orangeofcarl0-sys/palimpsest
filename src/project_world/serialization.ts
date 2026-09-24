/**
 * PLMP-LEAN-1 §D3-e1/e2/e3 — SERIALIZABLE CONCURRENT RESULT COMPOSITION.
 *
 *     Execute concurrently; canonicalize serially.
 *
 * Two candidates may exist at once, be verified at once, and even both reach eligibility against the same
 * basis. What they may NOT do is enter canonical Project state at once:
 *
 *     ConcurrentExecution  ≠  ConcurrentCanonicalization
 *
 * and, more precisely:
 *
 *     Every canonical result has ONE exact predecessor world.
 *
 * There is deliberately no "accept A and B together" in this slice. If that were ever wanted it would be a
 * NEW effect kind (`ResultComposition`: inputs, a joint compatibility proof, one atomic admission, one
 * canonical promotion) rather than a quiet optimisation of this path — because `B1 → B2` immediately
 * raises "which of A and B produced B2?", and no answer to that question is honest while two results are
 * being accepted simultaneously.
 *
 * WHY NO SECOND CONCURRENCY THEORY. After A is canonicalized, the world change B must survive is exactly
 * `Δ = W_A` — the resources A's result changed. So whether B can follow is:
 *
 *     W_A ∩ R_B = ∅   ∧   W_A ∩ W_B = ∅
 *
 * which is precisely D3-b's compatibility reasoning, already implemented as `compareFootprints`. This
 * module therefore contains NO conflict algebra of its own; it calls the assessor's. A second theory would
 * be a second authority on the same question, and the two would drift.
 *
 * SERIALIZABILITY, NOT COMMUTATIVITY. The first version requires that the final state equals SOME legal
 * serial order. It does NOT require that `A then B` and `B then A` both succeed or produce the same result
 * — and it never compares commit identities, because D2 already measured that independent executions
 * producing byte-identical commits is legitimate and that two orders differ in parents and provenance.
 *
 * ORDER IS SEMANTIC, NOT AN IMPLEMENTATION DETAIL, and that is the point of `assessSuccession`:
 *
 *     A: reads X, writes Y          B: writes X
 *
 *     A then B  →  B's write of X does not touch what A read, so B may still compose
 *     B then A  →  A's read of X is invalidated by B, so A may NOT compose
 *
 * Layer: L2 (`src/project_world/`). Not re-exported from the domain barrel.
 */
import {
  compareFootprints,
  type FootprintConflict,
  type WorkDependency,
} from "../domain/world_basis.js";

export const SUCCESSION_STATES = [
  /** No proven interference between the predecessor's change and the candidate's dependencies. */
  "COMPOSABLE",
  /** A proven interference: the candidate cannot follow this predecessor. */
  "CONFLICT",
] as const;
export type SuccessionState = (typeof SUCCESSION_STATES)[number];

export interface SuccessionAssessment {
  readonly schemaVersion: 1;
  readonly state: SuccessionState;
  readonly conflicts: readonly FootprintConflict[];
  /**
   * WHAT THIS IS, stated in the type so a caller cannot mistake it: PLANNING EVIDENCE.
   *
   * It is always `false` — there is no value of this field that would make the assessment an admission.
   * A succession assessment reasons about a world that does NOT YET EXIST (the one the predecessor would
   * produce), and admitting against a hypothetical world is precisely the "authority for a future world"
   * mistake this project refuses. The real admission still requires the real world to exist and then
   * observe → prove → admit against it.
   */
  readonly isAdmission: false;
  readonly detail: string;
}

/**
 * Can `candidate` follow `predecessor` into canonical state?
 *
 * DIRECTIONAL, and that is the whole point. `compareFootprints` answers a SYMMETRIC question — "may these
 * two results, both cut from one basis, be accepted together?" — and it is the right answer there because
 * neither has happened yet. Succession is not symmetric: the predecessor has ALREADY completed, so the
 * only thing that can invalidate the candidate is what the predecessor CHANGED.
 *
 * The direction is obtained by expressing the predecessor's effect as a CHANGE and asking D3-b's calculus
 * about it:
 *
 *     Δ = { reads: [], writes: predecessor.writes }
 *     conflicts = compareFootprints(Δ, candidate)
 *
 * which checks exactly `W_A ∩ R_B = ∅` and `W_A ∩ W_B = ∅`, and deliberately NOT the reverse — the
 * predecessor's READS cannot invalidate anything, because its result is already fixed. So this reuses the
 * one conflict theory rather than restating it with the arguments swapped, and the asymmetry is a property
 * of the INPUT rather than of a second algorithm.
 *
 * PLANNING EVIDENCE ONLY. See `isAdmission`, which is structurally `false`: this cannot authorize an
 * effect, because the world it reasons about has not happened yet.
 */
export function assessSuccession(input: {
  readonly predecessor: WorkDependency;
  readonly candidate: WorkDependency;
}): SuccessionAssessment {
  const change: WorkDependency = Object.freeze({
    reads: Object.freeze([]),
    writes: input.predecessor.writes,
  });
  const conflicts = compareFootprints(change, input.candidate);
  return Object.freeze({
    schemaVersion: 1 as const,
    state: conflicts.length === 0 ? ("COMPOSABLE" as const) : ("CONFLICT" as const),
    conflicts,
    isAdmission: false as const,
    detail:
      conflicts.length === 0
        ? "the predecessor's change does not touch anything this candidate read or wrote, so it may compose — subject to a FRESH admission against the world the predecessor actually produces"
        : `${String(conflicts.length)} proven interference(s) between the predecessor's change and this candidate's dependencies: it cannot follow that predecessor in this order`,
  });
}

/**
 * The linearization order is chosen by Promotion authority or the caller — never computed here.
 *
 * There is deliberately no `computeOptimalOrdering`, no candidate permutation search, no priority, no
 * retry count and no worker ranking. D3-e is result COMPOSITION SEMANTICS, not a multi-agent scheduler,
 * and a "best order" recommendation would still carry no authority: the real answer always comes from the
 * actual current world plus a fresh proof and a fresh admission.
 */
export const COMPOSITION_ORDER_AUTHORITY =
  "promotion-authority-or-caller: the first canonicalization object is chosen outside this plane, and every remaining candidate is re-assessed against the world that choice actually produced";
