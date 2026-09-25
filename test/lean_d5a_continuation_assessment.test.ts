/**
 * PLMP-LEAN-1 §D5-a — the CONTINUATION ASSESSMENT, as machine proofs.
 *
 * The slice's constitutional claim is one sentence:
 *
 *     lack of proof blocks REUSE, not FUTURE WORK
 *
 * so the tests are organised around the ways that could be false. The dangerous inversions are:
 *
 *   · UNKNOWN read as INCOMPATIBLE       (a missing proof becomes a refusal of the work)
 *   · INCOMPATIBLE read as UNKNOWN       (a proven no becomes a "maybe gather more evidence")
 *   · a single route enum collapsing them
 *   · rework gated on reuse's verdict    (which is the first inversion wearing a different hat)
 *   · NOT_ASSESSED read as UNKNOWN       (never having tried, read as having failed)
 *   · contradictory inputs resolved optimistically
 *   · a capability gap reported as a stale fact, or the reverse
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CONTINUATION_COMPATIBILITY_INPUTS,
  CONTINUATION_CURRENTNESS,
  assessContinuation,
  continuationStillAppliesTo,
  type ContinuationFacts,
} from "../src/project_world/index.js";
import type { ResultSubjectRef } from "../src/project_world/index.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The module's own source, so a structural claim is checked against what shipped rather than asserted. */
const source = (): string =>
  execFileSync(process.execPath, ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, "src/project_world/continuation.ts"))},'utf8'))`], {
    encoding: "utf8",
  });

const RESULT: ResultSubjectRef = Object.freeze({ kind: "ATTEMPT_RESULT", ref: "attempt-a" });
const ORIGIN = "b".repeat(64);
const TARGET = "target-world-1";

const both = { rematerialization: true, rework: true } as const;

/** Facts with everything available, so each test changes exactly the one thing it is about. */
function facts(overrides: Partial<ContinuationFacts> = {}): ContinuationFacts {
  return {
    resultSubjectRef: RESULT,
    originBasisDigest: ORIGIN,
    currentTargetDigest: TARGET,
    currentness: "STALE",
    compatibility: "COMPATIBLE",
    capabilities: both,
    ...overrides,
  };
}

/* ================================================================== *
 * The four outcomes, and what each must yield
 * ================================================================== */

describe("§D5-a each compatibility outcome yields its own continuation picture", () => {
  it("EXACT: reuse holds exactly, so nothing needs carrying across a divergence", () => {
    const assessment = assessContinuation(facts({ currentness: "CURRENT", compatibility: "EXACT" }));
    expect(assessment.reuse.exactCurrent).toBe(true);
    // Not "rematerialization is blocked" — there is NOTHING TO CARRY, which is a different statement.
    expect(assessment.reuse.blocker).toBe(null);
    expect(assessment.evidence.moreCouldHelp).toBe(false);
    expect(assessment.detail).toContain("exact basis");
  });

  it("COMPATIBLE + the capability: rematerialization is the reuse path", () => {
    const assessment = assessContinuation(facts({ compatibility: "COMPATIBLE" }));
    expect(assessment.reuse.exactCurrent).toBe(false);
    expect(assessment.reuse.rematerializationAvailable).toBe(true);
    expect(assessment.reuse.blocker).toBe(null);
    expect(assessment.evidence.moreCouldHelp).toBe(true);
  });

  it("INCOMPATIBLE: reuse is PROVEN impossible, and the work must be redone", () => {
    const assessment = assessContinuation(facts({ compatibility: "INCOMPATIBLE" }));
    expect(assessment.reuse.rematerializationAvailable).toBe(false);
    expect(assessment.reuse.blocker).toContain("positive conflict witness");
    // The distinguishing half: no further evidence changes THIS verdict.
    expect(assessment.evidence.moreCouldHelp).toBe(false);
    expect(assessment.evidence.gaps).toEqual([]);
    // And rework is still available — that is the point of the slice.
    expect(assessment.rework.available).toBe(true);
    expect(assessment.detail).toContain("must be redone");
  });

  it("UNKNOWN: reuse is unproven, MORE EVIDENCE could help, and the work may still be redone", () => {
    const assessment = assessContinuation(facts({ compatibility: "UNKNOWN" }));
    expect(assessment.reuse.rematerializationAvailable).toBe(false);
    expect(assessment.reuse.blocker).toContain("unproven rather than refused");
    expect(assessment.evidence.moreCouldHelp).toBe(true);
    expect(assessment.evidence.gaps.length).toBeGreaterThan(0);
    expect(assessment.rework.available).toBe(true);
    expect(assessment.detail).toContain("may still be redone");
  });

  it("UNKNOWN and INCOMPATIBLE are DIFFERENT pictures, not two spellings of one", () => {
    const unknown = assessContinuation(facts({ compatibility: "UNKNOWN" }));
    const conflict = assessContinuation(facts({ compatibility: "INCOMPATIBLE" }));
    /**
     * THE DISTINCTION THE SLICE EXISTS FOR. Both block reuse; only one says whether effort could change the
     * answer. A `route = "REWORK"` enum would make these two states identical and lose exactly the half a
     * person needs in order to decide between gathering evidence and redoing the work.
     */
    expect(unknown.rework.available).toBe(conflict.rework.available);
    expect(unknown.reuse.rematerializationAvailable).toBe(conflict.reuse.rematerializationAvailable);
    expect(unknown.evidence.moreCouldHelp).not.toBe(conflict.evidence.moreCouldHelp);
    expect(unknown.evidence.gaps).not.toEqual(conflict.evidence.gaps);
    expect(unknown.detail).not.toBe(conflict.detail);
    expect(unknown.assessmentDigest).not.toBe(conflict.assessmentDigest);
  });

  it("NOT_ASSESSED is its own state — never having tried is not having failed", () => {
    const notAssessed = assessContinuation(facts({ compatibility: null }));
    expect(notAssessed.compatibility).toBe("NOT_ASSESSED");
    expect(notAssessed.reuse.blocker).toContain("no compatibility proof was attempted");
    expect(notAssessed.evidence.moreCouldHelp).toBe(true);
    // And it is distinguishable from a completed-but-incomplete proof.
    const unknown = assessContinuation(facts({ compatibility: "UNKNOWN" }));
    expect(unknown.assessmentDigest).not.toBe(notAssessed.assessmentDigest);
    expect(notAssessed.compatibility).not.toBe(unknown.compatibility);
  });

  it("the compatibility input vocabulary contains every D3-b outcome plus NOT_ASSESSED", () => {
    expect(CONTINUATION_COMPATIBILITY_INPUTS).toEqual(["EXACT", "COMPATIBLE", "INCOMPATIBLE", "UNKNOWN", "NOT_ASSESSED"]);
    expect(CONTINUATION_CURRENTNESS).toEqual(["CURRENT", "STALE", "UNKNOWN", "NONE"]);
  });
});

/* ================================================================== *
 * Rework is independent of reuse — the constitutional claim
 * ================================================================== */

describe("§D5-a lack of proof blocks REUSE, not FUTURE WORK", () => {
  it("ACROSS EVERY compatibility outcome, rework's availability depends only on target + capability", () => {
    /**
     * The strongest form of the claim: sweep the whole compatibility space and assert that rework does not
     * move. If rework were gated on reuse's verdict, at least one of these comparisons would differ.
     */
    const availability = CONTINUATION_COMPATIBILITY_INPUTS.map((compatibility) => {
      const assessment = assessContinuation(
        compatibility === "NOT_ASSESSED" ? facts({ compatibility: null }) : facts({ compatibility }),
      );
      return assessment.rework.available;
    });
    expect(new Set(availability)).toEqual(new Set([true]));
  });

  it("a proven conflict still permits rework — refusing it would convert 'unprovable reuse' into 'void work'", () => {
    const assessment = assessContinuation(facts({ compatibility: "INCOMPATIBLE" }));
    expect(assessment.reuse.rematerializationAvailable).toBe(false);
    expect(assessment.evidence.moreCouldHelp).toBe(false);
    // The work is legitimate even though THIS result can never be accepted.
    expect(assessment.rework.available).toBe(true);
    expect(assessment.rework.blocker).toBe(null);
  });

  it("rework IS blocked when there is no world to redo the work against, and says so", () => {
    const assessment = assessContinuation(facts({ currentTargetDigest: null }));
    expect(assessment.rework.available).toBe(false);
    expect(assessment.rework.blocker).toContain("cannot be observed");
    // And reuse is blocked for the same underlying reason, each with its own wording.
    expect(assessment.reuse.rematerializationAvailable).toBe(false);
    expect(assessment.reuse.blocker).toContain("no target to prove non-interference against");
  });

  it("rework IS blocked when the deployment cannot start an attempt, and that is a CAPABILITY gap", () => {
    const assessment = assessContinuation(facts({ capabilities: { rematerialization: true, rework: false } }));
    expect(assessment.rework.available).toBe(false);
    expect(assessment.rework.blocker).toContain("cannot start an attempt");
    // Reuse is unaffected by the rework capability — the two capabilities are independent.
    expect(assessment.reuse.rematerializationAvailable).toBe(true);
  });
});

/* ================================================================== *
 * Capability gaps are not stale facts
 * ================================================================== */

describe("§D5-a a capability gap is reported as a capability gap", () => {
  it("COMPATIBLE with no rematerializer: the proof holds, the DEPLOYMENT cannot carry it", () => {
    const assessment = assessContinuation(facts({ capabilities: { rematerialization: false, rework: true } }));
    expect(assessment.compatibility).toBe("COMPATIBLE");
    expect(assessment.reuse.rematerializationAvailable).toBe(false);
    expect(assessment.reuse.blocker).toContain("composes no way to carry the result");
    // The gaps name the missing CAPABILITY, not a missing proof: the proof is fine.
    expect(assessment.evidence.gaps.some((gap) => gap.includes("capability"))).toBe(true);
    /**
     * And `moreCouldHelp` stays true — but for the honest reason: a capability could be composed, which is a
     * different kind of "more" than more evidence. The field says "more COULD help", not "more evidence
     * exists", so a deployment gap is correctly included.
     */
    expect(assessment.evidence.moreCouldHelp).toBe(true);
  });

  it("both capabilities absent: each path names its OWN reason rather than one blanket refusal", () => {
    const assessment = assessContinuation(facts({ capabilities: { rematerialization: false, rework: false } }));
    expect(assessment.reuse.blocker).not.toBe(assessment.rework.blocker);
    expect(assessment.reuse.blocker).toContain("carry the result");
    expect(assessment.rework.blocker).toContain("start an attempt");
  });
});

/* ================================================================== *
 * Contradictory input is refused, not resolved optimistically
 * ================================================================== */

describe("§D5-a contradictory input does not silently take the permissive half", () => {
  it("currentness says STALE while compatibility says EXACT: reuse is REFUSED", () => {
    /**
     * D3-b's `EXACT` means "D3-a's exact currentness already proved the basis holds", so an `EXACT`
     * compatibility alongside a `STALE` currentness is inconsistent input. Granting reuse on the permissive
     * half would be the inversion this project refuses everywhere else.
     *
     * STALE is the only currentness verdict that DENIES the basis holds, so it is the only one that can
     * contradict `EXACT` — see the UNKNOWN and NONE cases below.
     */
    const assessment = assessContinuation(facts({ currentness: "STALE", compatibility: "EXACT" }));
    expect(assessment.reuse.exactCurrent).toBe(false);
    expect(assessment.reuse.rematerializationAvailable).toBe(false);
    expect(assessment.reuse.blocker).toContain("contradict each other");
    expect(assessment.evidence.gaps.some((gap) => gap.includes("reconciled"))).toBe(true);
  });

  it("UNKNOWN currentness with EXACT compatibility is NOT a contradiction — UNKNOWN is not a denial", () => {
    /**
     * The separation this project preserves everywhere: `UNKNOWN` means "neither established", NOT
     * "established false". Reading it as a denial — which my first implementation did — would have made
     * `UNKNOWN` collide with `STALE`, breaking the same distinction as `UNKNOWN ≠ INCOMPATIBLE` and
     * `¬provedOverlap ≠ provedDisjoint`.
     *
     * ONLY `STALE` is a denial, because only `STALE` says the basis does not hold.
     *
     * This test exists because the implementation was WRONG here first: the NONE case below is what exposed
     * it, and the fix narrowed the denial to `STALE` alone.
     */
    const assessment = assessContinuation(facts({ currentness: "UNKNOWN", compatibility: "EXACT" }));
    expect(assessment.reuse.exactCurrent).toBe(true);
    expect(assessment.reuse.blocker).toBe(null);
    expect(assessment.evidence.gaps).toEqual([]);
  });

  it("a NONE currentness (no basis was ever captured) with EXACT is NOT a contradiction", () => {
    /**
     * `NONE` is the ABSENCE of a verdict — a D2 attempt never captured a basis — not a verdict that the
     * basis failed to hold. Treating it as a contradiction would refuse reuse for results that legitimately
     * have no basis record, which is a different situation entirely.
     */
    const assessment = assessContinuation(facts({ currentness: "NONE", compatibility: "EXACT" }));
    expect(assessment.reuse.exactCurrent).toBe(true);
    expect(assessment.reuse.blocker).toBe(null);
  });

  it("CURRENT currentness alone (no compatibility attempted) is enough to hold exactly", () => {
    const assessment = assessContinuation(facts({ currentness: "CURRENT", compatibility: null }));
    expect(assessment.reuse.exactCurrent).toBe(true);
    expect(assessment.evidence.moreCouldHelp).toBe(false);
  });
});

/* ================================================================== *
 * The witness is bound to one target
 * ================================================================== */

describe("§D5-a an assessment is bound to the world it judged", () => {
  it("a verdict for one target does not apply to another", () => {
    const assessment = assessContinuation(facts());
    expect(continuationStillAppliesTo({ assessment, resultSubjectRef: RESULT, currentTargetDigest: TARGET }).applies).toBe(true);
    const moved = continuationStillAppliesTo({ assessment, resultSubjectRef: RESULT, currentTargetDigest: "target-world-2" });
    expect(moved.applies).toBe(false);
    expect(moved.detail).toContain("world has moved");
  });

  it("a verdict about one result does not apply to another, and kind is part of the identity", () => {
    const assessment = assessContinuation(facts());
    expect(
      continuationStillAppliesTo({ assessment, resultSubjectRef: { kind: "ATTEMPT_RESULT", ref: "attempt-b" }, currentTargetDigest: TARGET }).applies,
    ).toBe(false);
    expect(
      continuationStillAppliesTo({ assessment, resultSubjectRef: { kind: "DERIVED_RESULT", ref: RESULT.ref }, currentTargetDigest: TARGET }).applies,
    ).toBe(false);
  });

  it("an unobservable world is bound as null, and does not equal a named world", () => {
    const unobservable = assessContinuation(facts({ currentTargetDigest: null }));
    expect(unobservable.currentTargetDigest).toBe(null);
    // A null target is its OWN identity: it does not silently match a real target.
    expect(continuationStillAppliesTo({ assessment: unobservable, resultSubjectRef: RESULT, currentTargetDigest: TARGET }).applies).toBe(false);
    expect(continuationStillAppliesTo({ assessment: unobservable, resultSubjectRef: RESULT, currentTargetDigest: null }).applies).toBe(true);
  });
});

/* ================================================================== *
 * Purity and determinism
 * ================================================================== */

describe("§D5-a the assessment is pure and deterministic", () => {
  it("the same facts yield the same digest, and different facts do not", () => {
    expect(assessContinuation(facts()).assessmentDigest).toBe(assessContinuation(facts()).assessmentDigest);
    expect(assessContinuation(facts()).assessmentDigest).not.toBe(
      assessContinuation(facts({ compatibility: "UNKNOWN" })).assessmentDigest,
    );
    // The TARGET is part of the identity, because the verdict is about that world.
    expect(assessContinuation(facts()).assessmentDigest).not.toBe(
      assessContinuation(facts({ currentTargetDigest: "target-world-2" })).assessmentDigest,
    );
  });

  it("it performs no effect: no store is touched and nothing is written", () => {
    /**
     * Proven structurally rather than by a spy, because the claim is about the MODULE: it imports no store,
     * no randomness and no clock, so an effect is not expressible rather than merely absent.
     */
    const text = source();
    for (const forbidden of ["DatabaseSync", "randomUUID", "new Date", "execFile", "node:fs", "spawn"]) {
      expect(text, `continuation.ts must not contain "${forbidden}"`).not.toContain(forbidden);
    }
    // And it is genuinely PURE: the same call twice cannot mutate its input.
    const input = facts();
    const before = JSON.stringify(input);
    assessContinuation(input);
    assessContinuation(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("the assessment module does not compute compatibility — it consumes it", () => {
    /**
     * `Proof generation ≠ Proof validation` applies here too: D3-b is the ONE assessor. A continuation module
     * that re-derived compatibility would be a second one, and the two would drift.
     */
    const text = source();
    expect(text).not.toContain("assessCompatibility");
    expect(text).not.toContain("relateSelector");
    expect(text).not.toContain("covered(");
  });
});
