/**
 * PLMP-LEAN-1 §D5-a — the CONTINUATION ASSESSMENT: which safe ways forward exist for one result.
 *
 *     Assess → Choose safe continuation → Admit → Continue
 *       ^^^^^ this slice, and it produces NO effect
 *
 * D3 can answer "is this result still usable?" (D3-a currentness, D3-b compatibility) and D3-d can carry a
 * result across a proven divergence. What nothing answered is the question a long-running project actually
 * asks when a concurrent result goes stale:
 *
 *     one result entered canonical, this one did not, its reuse cannot be proved — now WHAT?
 *
 * The answer is not one route. It is a SET of safe paths, and collapsing them into a single enum is the
 * mistake this module refuses:
 *
 *     EXACT         reuse, on the exact basis it was produced from — no divergence to carry
 *     COMPATIBLE    rematerialize onto the target, then re-verify and promote the ordinary way
 *     INCOMPATIBLE  reuse is PROVEN impossible; the work must be redone on the current basis
 *     UNKNOWN       reuse is UNPROVEN; the work may still be redone on the current basis
 *
 * INCOMPATIBLE AND UNKNOWN ARE NOT THE SAME THING, and the distinction is the whole point:
 *
 *     INCOMPATIBLE   a positive conflict witness exists, so NO further evidence makes THIS result reusable
 *     UNKNOWN        no proof was completed, so MORE EVIDENCE still could
 *
 * Both block reuse. Only one of them says why. A single `route = "REWORK"` would erase that, and the erased
 * half is exactly the part a person needs in order to decide whether to gather evidence or to redo the work.
 *
 *     lack of proof blocks REUSE, not FUTURE WORK
 *
 * So `rework.available` deliberately does NOT depend on the compatibility outcome at all. It depends on
 * whether there is a current world to work against and whether the deployment can start an attempt there.
 * A result whose reuse is unprovable is still a result whose WORK is legitimate.
 *
 * WHAT THIS MODULE DOES NOT DO, and each is a boundary rather than an omission:
 *
 *   · it does NOT compute compatibility        — it consumes D3-b's conclusion (`Proof generation ≠ Proof
 *                                                validation`, and one assessor must not become two)
 *   · it does NOT admit anything               — `CrossBasisAdmission` is D3-c's, from a certificate
 *   · it does NOT create an attempt or a world — `REWORK may be available` is a STATEMENT, not a command
 *   · it does NOT choose between the paths     — "system chooses the cheapest one" belongs to a later
 *                                                scheduling/economics layer, and a chooser built here would
 *                                                hide its policy inside an assessment
 *   · it does NOT read anything               — every input is a fact the caller already established, so
 *                                                this is a pure function and cannot drift from its inputs
 *
 * Layer: L2 (`src/project_world/`). Not re-exported from the domain barrel.
 */
import { canonicalDigest } from "../schema/canonical.js";

import { COMPATIBILITY_OUTCOMES, type CompatibilityOutcome } from "./compatibility.js";
import type { ResultSubjectRef } from "./result_resolution.js";

/**
 * The currentness verdicts this assessment consumes, plus the two states an assessment needs and D3-a does
 * not have:
 *
 *   NONE   the attempt never captured a basis at all, so there is nothing to compare (every D2 attempt)
 *   null   the caller did not ask; the assessment reports NOT_ASSESSED rather than inventing a verdict
 */
export const CONTINUATION_CURRENTNESS = ["CURRENT", "STALE", "UNKNOWN", "NONE"] as const;
export type ContinuationCurrentness = (typeof CONTINUATION_CURRENTNESS)[number];

/**
 * The compatibility input, with `NOT_ASSESSED` for "no proof was attempted".
 *
 * `NOT_ASSESSED` is NOT `UNKNOWN` and is deliberately its own value. D3-b's `UNKNOWN` means a proof was
 * attempted and could not be completed — which is information. `NOT_ASSESSED` means nobody tried — which is
 * a different, weaker fact, and a reader deciding whether to spend effort needs to tell them apart.
 */
export const CONTINUATION_COMPATIBILITY_INPUTS = [...COMPATIBILITY_OUTCOMES, "NOT_ASSESSED"] as const;
export type ContinuationCompatibilityInput = (typeof CONTINUATION_COMPATIBILITY_INPUTS)[number];

/** What the deployment can actually DO, as capability facts rather than as the presence of an option. */
export interface ContinuationCapabilities {
  /**
   * A rematerializer is composed for this result's facets AND a result resolver can name the result.
   *
   * Both halves are required because either one alone cannot carry anything: a rematerializer with nothing
   * to resolve carries the wrong delta, and a resolver with nothing to apply derives nothing.
   */
  readonly rematerialization: boolean;
  /** An attempt on the current basis could be started: the task is open and the deployment can run work. */
  readonly rework: boolean;
}

export interface ContinuationFacts {
  readonly resultSubjectRef: ResultSubjectRef;
  /** The basis this result was produced from. */
  readonly originBasisDigest: string;
  /**
   * The OBSERVED current target, or null when this deployment cannot observe one.
   *
   * Null is not "no divergence": it is "this deployment cannot say". Both reuse and rework are blocked by
   * it, for the same reason a proof with no target is not a proof — there is nothing to be safe RELATIVE to.
   */
  readonly currentTargetDigest: string | null;
  readonly currentness: ContinuationCurrentness | null;
  /** D3-b's conclusion, or null when no compatibility proof was attempted. */
  readonly compatibility: CompatibilityOutcome | null;
  readonly capabilities: ContinuationCapabilities;
}

/** One safe path, with the reason it is not available when it is not. */
export interface ContinuationPath {
  readonly available: boolean;
  /** Present exactly when `available` is false, so an unavailable path always says why. */
  readonly blocker: string | null;
}

export interface ContinuationAssessment {
  readonly schemaVersion: 1;
  readonly resultSubjectRef: ResultSubjectRef;
  readonly originBasisDigest: string;
  /** The observed world this assessment is bound to. A verdict for one target does not hold for another. */
  readonly currentTargetDigest: string | null;
  readonly currentness: ContinuationCurrentness | null;
  readonly compatibility: ContinuationCompatibilityInput;
  readonly reuse: {
    /**
     * The result still holds at the EXACT basis it was produced from, so there is no divergence to carry and
     * no rematerialization is needed. `EXACT` is deliberately not downgraded to "compatible" here as
     * everywhere else in D3: a stronger fact reported as a weaker one loses information a consumer needs.
     */
    readonly exactCurrent: boolean;
    /** Carrying this result onto the target is a path this deployment could take. */
    readonly rematerializationAvailable: boolean;
    readonly blocker: string | null;
  };
  readonly rework: ContinuationPath;
  readonly evidence: {
    /**
     * Whether MORE EVIDENCE could still make THIS result reusable.
     *
     * `false` when reuse is proven impossible (a conflict witness) or already holds; `true` when the proof is
     * merely incomplete. This is the field that keeps UNKNOWN from being read as INCOMPATIBLE.
     */
    readonly moreCouldHelp: boolean;
    /** What specifically is missing, so "more evidence" is actionable rather than a slogan. */
    readonly gaps: readonly string[];
  };
  readonly detail: string;
  readonly assessmentDigest: string;
}

const CONTINUATION_ASSESSMENT_DOMAIN = "palimpsest.result-continuation-assessment.v1";

function assessmentDigestOf(body: Omit<ContinuationAssessment, "assessmentDigest">): string {
  return canonicalDigest({ domain: CONTINUATION_ASSESSMENT_DOMAIN, ...body });
}

function blocked(reason: string): ContinuationPath {
  return Object.freeze({ available: false, blocker: reason });
}

const AVAILABLE: ContinuationPath = Object.freeze({ available: true, blocker: null });

/**
 * Assess the safe continuations for one result.
 *
 * PURE: it reads nothing and effects nothing. Every fact arrives as an argument, so the assessment cannot
 * disagree with the state it describes — which is what lets a caller show it to a person as an explanation
 * rather than as an opaque verdict.
 */
export function assessContinuation(facts: ContinuationFacts): ContinuationAssessment {
  const compatibility: ContinuationCompatibilityInput = facts.compatibility ?? "NOT_ASSESSED";
  const gaps: string[] = [];

  /**
   * ── REUSE ────────────────────────────────────────────────────────────────────────────────────────
   *
   * Two ways a result may still be reused, and the ORDER matters because they are different facts:
   * holding exactly, or being provably portable. Neither is inferred from the other.
   *
   * `EXACT` here is D3-b's short-circuit, which is by definition "D3-a's exact currentness already proved
   * the basis holds" — so the two inputs report the SAME fact, and either may be absent. They may not,
   * however, CONTRADICT.
   *
   * ONLY `STALE` IS A DENIAL. A verdict that the basis does NOT hold, alongside a verdict that it DOES, is a
   * genuine contradiction, and the honest response is to refuse reuse rather than to take whichever half
   * permits it. `UNKNOWN` is deliberately NOT a denial: it means "neither established", not "established
   * false", and reading it as a refusal here would break the very distinction this vocabulary exists to
   * preserve — the same one as `UNKNOWN ≠ INCOMPATIBLE` and `¬provedOverlap ≠ provedDisjoint`. `NONE` is not
   * a denial either: it says no basis was ever captured, so the question does not arise, rather than that it
   * was answered no.
   */
  const currentnessDeniesHolding = facts.currentness === "STALE";
  const contradictory = currentnessDeniesHolding && compatibility === "EXACT";
  const exactCurrent = !contradictory && (facts.currentness === "CURRENT" || compatibility === "EXACT");
  if (contradictory) {
    gaps.push(
      "the currentness verdict says the basis no longer holds while the compatibility verdict says it holds exactly, so neither may be used until they are reconciled",
    );
  }

  /**
   * Rematerialization requires a proven non-interference, a target to carry onto, AND the capability. All
   * three, and the refusal names which one is missing — an unavailable path with no reason is a dead end
   * rather than an answer.
   */
  let rematerializationAvailable = false;
  let reuseBlocker: string | null = null;
  if (exactCurrent) {
    /**
     * Nothing needs carrying. Reported as NOT needing rematerialization rather than as a blocker: the reuse
     * path IS available, it simply does not run through the effect.
     */
    reuseBlocker = null;
  } else if (contradictory) {
    reuseBlocker =
      "the currentness verdict says the basis no longer holds while the compatibility verdict says it holds exactly: the inputs contradict each other, so reuse is refused rather than granted on whichever half is more permissive";
  } else if (facts.currentTargetDigest === null) {
    reuseBlocker =
      "this deployment cannot observe the current world, so there is no target to prove non-interference against — a compatibility proof is relative to a named world";
    gaps.push("the current world cannot be observed");
  } else if (compatibility === "COMPATIBLE") {
    if (facts.capabilities.rematerialization) {
      rematerializationAvailable = true;
    } else {
      reuseBlocker =
        "the basis divergence is provably non-interfering, but this deployment composes no way to carry the result onto the target (a rematerializer for its facets and a resolver that can name it are BOTH required)";
      gaps.push("no rematerialization capability is composed for this result's facets");
    }
  } else if (compatibility === "INCOMPATIBLE") {
    reuseBlocker =
      "a positive conflict witness exists: accepting both this result and the current world would supersede an input it was computed from, or collide with a resource it writes — no further evidence makes THIS result reusable";
  } else if (compatibility === "NOT_ASSESSED") {
    reuseBlocker =
      "no compatibility proof was attempted, so there is no evidence that the divergence is non-interfering — reuse is unproven rather than refused";
    gaps.push("no compatibility assessment was made against the current target");
  } else {
    reuseBlocker =
      "a compatibility proof was attempted and could not be completed, so non-interference is unproven rather than refused";
    gaps.push("the compatibility proof is incomplete: a complete change observation or an enforced read boundary could complete it");
  }

  /**
   * ── REWORK ───────────────────────────────────────────────────────────────────────────────────────
   *
   * DELIBERATELY INDEPENDENT OF `compatibility`. This is the constitutional point of the slice: a result
   * whose reuse is unprovable is still a result whose WORK is legitimate, and refusing to let the work
   * continue would turn "I could not prove non-interference" into "your work is void".
   *
   * Rework needs exactly two things: a world it can be redone AGAINST, and the ability to start an attempt
   * there. It does not need the old result's permission.
   */
  const rework =
    facts.currentTargetDigest === null
      ? blocked(
          "the current world cannot be observed, so there is no basis to redo the work against — a rework is a new attempt ON a named world, and an unnameable world is not one",
        )
      : facts.capabilities.rework
        ? AVAILABLE
        : blocked(
            "this deployment cannot start an attempt on the current basis (the task is not open, or no work execution is composed)",
          );

  /**
   * ── EVIDENCE ─────────────────────────────────────────────────────────────────────────────────────
   *
   * `moreCouldHelp` is about REUSE only, and it is the field that separates the two blocked reasons:
   *
   *   a proven conflict      → FALSE: the answer is already no, and no evidence changes it
   *   an incomplete proof    → TRUE:  the answer is "not yet", and evidence could make it yes
   */
  const moreCouldHelp = !exactCurrent && compatibility !== "INCOMPATIBLE";

  const detail = exactCurrent
    ? "this result still holds at the exact basis it was produced from, so it needs no carrying across a divergence"
    : rematerializationAvailable
      ? "the divergence is provably non-interfering and this deployment can carry the result onto the target"
      : compatibility === "INCOMPATIBLE"
        ? `this result cannot be reused (${String(reuseBlocker)}), and its work must be redone on the current basis`
        : `reuse is not proven (${String(reuseBlocker)}); the work may still be redone on the current basis`;

  const body: Omit<ContinuationAssessment, "assessmentDigest"> = {
    schemaVersion: 1 as const,
    resultSubjectRef: facts.resultSubjectRef,
    originBasisDigest: facts.originBasisDigest,
    currentTargetDigest: facts.currentTargetDigest,
    currentness: facts.currentness,
    compatibility,
    reuse: Object.freeze({
      exactCurrent,
      rematerializationAvailable,
      blocker: reuseBlocker,
    }),
    rework,
    evidence: Object.freeze({ moreCouldHelp, gaps: Object.freeze(gaps) }),
    detail,
  };
  return Object.freeze({ ...body, assessmentDigest: assessmentDigestOf(body) });
}

/**
 * Is this assessment still about the world it was made against?
 *
 * Same discipline as D3-b's witness: `A(R, B_0, B_1)` does not authorize `B_2`. A continuation assessment is
 * planning evidence, and planning evidence that silently applied to a moved world would authorize a route
 * nobody re-checked.
 */
export function continuationStillAppliesTo(input: {
  readonly assessment: ContinuationAssessment;
  readonly resultSubjectRef: ResultSubjectRef;
  readonly currentTargetDigest: string | null;
}): { readonly applies: boolean; readonly detail: string } {
  const { assessment } = input;
  if (
    assessment.resultSubjectRef.kind !== input.resultSubjectRef.kind ||
    assessment.resultSubjectRef.ref !== input.resultSubjectRef.ref
  ) {
    return { applies: false, detail: "the assessment was made about a different result" };
  }
  if (assessment.currentTargetDigest !== input.currentTargetDigest) {
    return {
      applies: false,
      detail:
        "the world has moved since this assessment was made: a continuation decision for one target does not hold for another, so it must be re-assessed",
    };
  }
  return { applies: true, detail: "the assessment is about this exact result and current target" };
}
