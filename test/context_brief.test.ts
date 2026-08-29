import { describe, expect, it } from "vitest";

import {
  compileContextBrief,
  type ContextBriefInput,
} from "../src/context/index.js";

function baseInput(): ContextBriefInput {
  return {
    projectId: "p1",
    evidence: [
      {
        evidenceId: "EVD-1",
        status: "active",
        subjectType: "attempt",
        subjectId: "att-1",
        predicate: "tests_pass",
        exitCode: 0,
      },
      {
        evidenceId: "EVD-2",
        status: "active",
        subjectType: "attempt",
        subjectId: "att-1",
        predicate: "lint_pass",
        exitCode: 0,
      },
    ],
    interpretations: [
      {
        attemptId: "att-1",
        taskId: "task-1",
        workerStatus: "completed",
        summary: "worker believes the shape fix landed",
      },
    ],
    claims: [
      {
        claimId: "CLAIM-1",
        label: "modulation has no gain beyond delay=64",
        status: "CONTRADICTED",
        supportedBy: ["EVD-1"],
        contradictedBy: ["EVD-2"],
      },
    ],
  };
}

describe("context brief compressor (PLMP-CTX-1 P1)", () => {
  it("CTX-A01: facts and interpretations map 1:1 from the projections", () => {
    const brief = compileContextBrief(baseInput());
    expect(brief.facts).toHaveLength(2);
    expect(brief.facts[0]).toEqual({
      evidenceId: "EVD-1",
      status: "active",
      subjectType: "attempt",
      subjectId: "att-1",
      predicate: "tests_pass",
      exitCode: 0,
    });
    expect(brief.interpretations).toHaveLength(1);
    expect(brief.interpretations[0]).toMatchObject({
      attemptId: "att-1",
      workerStatus: "completed",
    });
  });

  it("CTX-A02: the layers never leak into each other", () => {
    const brief = compileContextBrief(baseInput());
    for (const fact of brief.facts) {
      expect("summary" in fact).toBe(false);
      expect("workerStatus" in fact).toBe(false);
    }
    for (const interpretation of brief.interpretations) {
      expect("evidenceId" in interpretation).toBe(false);
      expect("predicate" in interpretation).toBe(false);
    }
  });

  it("CTX-A03: contradicted claims surface with both sides and no blended verdict", () => {
    const brief = compileContextBrief(baseInput());
    expect(brief.conflicts).toHaveLength(1);
    const conflict = brief.conflicts[0]!;
    expect(conflict.claimId).toBe("CLAIM-1");
    expect(conflict.status).toBe("CONTRADICTED"); // R7 verdict copied verbatim
    expect(conflict.supportedBy).toEqual(["EVD-1"]);
    expect(conflict.contradictedBy).toEqual(["EVD-2"]);
    // The compressor generates no blended conclusion text of its own.
    expect(Object.keys(conflict).sort()).toEqual([
      "claimId",
      "contradictedBy",
      "label",
      "status",
      "supportedBy",
    ]);

    // A claim without contradiction never enters the conflict layer.
    const clean = compileContextBrief({
      ...baseInput(),
      claims: [
        {
          claimId: "CLAIM-2",
          label: "supported claim",
          status: "SUPPORTED",
          supportedBy: ["EVD-1"],
          contradictedBy: [],
        },
      ],
    });
    expect(clean.conflicts).toEqual([]);
  });

  it("CTX-A04: the compiler is a pure function of its inputs", () => {
    const input = baseInput();
    expect(JSON.stringify(compileContextBrief(input))).toBe(
      JSON.stringify(compileContextBrief(input)),
    );
  });
});
