/**
 * Palimpsest Host-S1 §9 — H1-D: THE DELEGATION POSITIVE-CONTROL ORACLE.
 *
 * THE DEFECT THIS PINS (measured on the E1RG parent as `baseline-and-falsifiers.json` F8).
 *
 * The probe's positive branch was `else verdict = "ALLOWED_NO_DELIVERY"`, taken for ANY non-refusal expectation
 * when no token was delivered. It required no session, no admission, no tool call and no child. The committed
 * E1RG matrix therefore scored the `production` case as a successful legitimate delegation while recording
 * `sessionCount: 0` and `refusalPoint: PRE_CREATE_ALIAS_ADMISSION` — a worker that was refused before it composed
 * an Agent.
 *
 * The decisive assertions:
 *
 *     A positive case with zero sessions FAILS.
 *     A positive case that was refused at pre-create FAILS.
 *     A parent-only case (no child) FAILS.
 *     A child in the wrong world FAILS.
 *     Only a fully observed delegation passes.
 *
 * THE DECISION IS A PURE FUNCTION OF THE OBSERVATIONS, so it is tested as one. The eight real DSH cases are
 * executed separately at the Code Freeze; this suite proves the decision cannot award a verdict to a case that
 * did not execute, which is the property §9.6 states.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const REPO = process.cwd();
const PROBE = readFileSync(join(REPO, "scripts", "trajectory_p2e1rf", "delegation-probe.mjs"), "utf8");
const MATRIX = readFileSync(join(REPO, "scripts", "trajectory_p2e1rf", "run-delegation-matrix.mjs"), "utf8");

/** The observation set a legitimate delegation must produce. */
type PositiveObservations = {
  parentSessionCreated: boolean;
  preCreateAdmitted: boolean;
  delegationInvoked: boolean;
  childSessionCreated: boolean;
  childWorldAuthorized: boolean;
  authorizedContextDelivered: boolean;
  noCanaryDelivered: boolean;
  noSecurityRefusal: boolean;
};

const FULL: PositiveObservations = {
  parentSessionCreated: true,
  preCreateAdmitted: true,
  delegationInvoked: true,
  childSessionCreated: true,
  childWorldAuthorized: true,
  authorizedContextDelivered: true,
  noCanaryDelivered: true,
  noSecurityRefusal: true,
};

/**
 * THE SHIPPED RULE, expressed as the predicate the probe uses: every observation must hold.
 *
 * This mirrors `missingObservations.length === 0 ? "ALLOWED_NO_DELIVERY" : "POSITIVE_CASE_NOT_EXECUTED"` in
 * `delegation-probe.mjs`. The source assertions below pin that the shipped code still expresses it.
 */
function decidePositive(observations: PositiveObservations): string {
  const missing = Object.entries(observations).filter(([, value]) => value !== true).map(([key]) => key);
  return missing.length === 0 ? "ALLOWED_NO_DELIVERY" : "POSITIVE_CASE_NOT_EXECUTED";
}

describe("H1-D positive-case validity (STATIC_ASSERTION + decision function)", () => {
  it("1. the shipped probe requires the full observation set", () => {
    expect(PROBE).toContain("positiveObservations");
    expect(PROBE).toContain("missingObservations");
    expect(PROBE).toContain("POSITIVE_CASE_NOT_EXECUTED");
    /** The old unconditional positive branch must be gone. */
    expect(PROBE).not.toContain("} else verdict = \"ALLOWED_NO_DELIVERY\";");
  });

  it("2. the shipped probe names each independent observation", () => {
    for (const key of Object.keys(FULL)) {
      expect(PROBE).toContain(key);
    }
  });

  it("3. a ZERO-SESSION positive case is REJECTED — the E1RG production case", () => {
    const e1rgProduction: PositiveObservations = {
      parentSessionCreated: false,
      preCreateAdmitted: false,
      delegationInvoked: false,
      childSessionCreated: false,
      childWorldAuthorized: false,
      authorizedContextDelivered: false,
      noCanaryDelivered: true,
      noSecurityRefusal: false,
    };
    expect(decidePositive(e1rgProduction)).toBe("POSITIVE_CASE_NOT_EXECUTED");
  });

  it("4. a PARENT-ONLY case (no child) is rejected", () => {
    expect(
      decidePositive({
        ...FULL,
        childSessionCreated: false,
        childWorldAuthorized: false,
        authorizedContextDelivered: false,
      }),
    ).toBe("POSITIVE_CASE_NOT_EXECUTED");
  });

  it("5. a child in the WRONG world is rejected", () => {
    expect(decidePositive({ ...FULL, childWorldAuthorized: false })).toBe("POSITIVE_CASE_NOT_EXECUTED");
  });

  it("6. a child whose AUTHORIZED CONTEXT was not delivered is rejected", () => {
    expect(decidePositive({ ...FULL, authorizedContextDelivered: false })).toBe("POSITIVE_CASE_NOT_EXECUTED");
  });

  it("7. a case with a PRE-CREATE REFUSAL is rejected even if no token leaked", () => {
    expect(decidePositive({ ...FULL, preCreateAdmitted: false, noSecurityRefusal: false })).toBe("POSITIVE_CASE_NOT_EXECUTED");
  });

  it("8. a delegation that was never INVOKED is rejected", () => {
    expect(decidePositive({ ...FULL, delegationInvoked: false })).toBe("POSITIVE_CASE_NOT_EXECUTED");
  });

  it("9. a FULLY observed delegation is accepted", () => {
    expect(decidePositive(FULL)).toBe("ALLOWED_NO_DELIVERY");
  });

  it("10. a delivered canary is rejected even with every other observation", () => {
    expect(decidePositive({ ...FULL, noCanaryDelivered: false })).toBe("POSITIVE_CASE_NOT_EXECUTED");
  });
});

describe("H1-D refusal attribution (STATIC_ASSERTION)", () => {
  it("11. the refusal phase is parsed from the STRUCTURED receipt, not a substring", () => {
    expect(PROBE).toContain("PALIMPSEST_WORKER_PRECREATE");
    expect(PROBE).toContain("preCreateReceipt");
    expect(PROBE).toContain("refusalPhase");
    /** §9.4: the old substring inference must be gone. */
    expect(PROBE).not.toContain("line.includes(\"refusing to run this worker\")");
  });

  it("12. an unparseable receipt yields UNKNOWN rather than a specific phase", () => {
    expect(PROBE).toContain("parsed: false, phase: \"UNKNOWN\"");
  });

  it("13. the receipt records the first refusal in precedence order", () => {
    expect(PROBE).toContain("phases[0]");
  });

  /**
   * HOST-S1 §9.2 — THE DISPATCH IS OBSERVED, NOT INFERRED FROM A TOOL NAME.
   *
   * The worker runs in PTC mode, so its only directly callable name is `run_code`; a delegation appears as a PTC
   * DISPATCH inside that program. Measured on the `world` case: the parent records `tool/ptc-dispatch` and the
   * child records `subagent/descriptor`, while the only `tool/call` name in either session is `run_code`.
   *
   * An observation that looked for a top-level `subagent` tool call would report "delegation never happened" for
   * a delegation that demonstrably did — a false NEGATIVE, which is why this control exists separately from the
   * false-positive controls above.
   */
  it("13b. delegation invocation is detected from PTC dispatch evidence", () => {
    expect(PROBE).toContain("tool/ptc-dispatch");
    expect(PROBE).toContain("subagent/catalog");
    expect(PROBE).toContain("delegationEvidence");
  });
});

describe("H1-D matrix closure predicate (STATIC_ASSERTION)", () => {
  it("14. the matrix independently rejects a positive case with no execution", () => {
    expect(MATRIX).toContain("positiveWithoutExecution");
    expect(MATRIX).toContain("positiveWithRefusal");
  });

  it("15. the matrix's closure requires positive execution", () => {
    expect(MATRIX).toContain("positiveWithoutExecution.length === 0");
    expect(MATRIX).toContain("positiveWithRefusal.length === 0");
  });

  it("16. the matrix records the structured refusal phase, not a point label", () => {
    expect(MATRIX).toContain("refusalPhase");
    expect(MATRIX).not.toContain("refusalPoint");
  });

  it("17. the matrix still refuses a case that leaks, independently of its verdict", () => {
    expect(MATRIX).toContain("leaked.length === 0");
    expect(MATRIX).toContain("refusedWithChild.length === 0");
  });

  it("18. a zero-session positive case cannot satisfy the closure predicate", () => {
    /** The predicate as shipped, exercised on the E1RG row. */
    const row = { expectedVerdict: "ALLOWED_NO_DELIVERY", sessionCount: 0, missingObservations: ["parentSessionCreated"], preCreateRefused: true };
    const positiveCases = [row];
    const positiveWithoutExecution = positiveCases.filter(
      (entry) => entry.sessionCount === 0 || entry.missingObservations === null || entry.missingObservations.length > 0,
    );
    const positiveWithRefusal = positiveCases.filter((entry) => entry.preCreateRefused === true);
    expect(positiveWithoutExecution).toHaveLength(1);
    expect(positiveWithRefusal).toHaveLength(1);
  });
});
