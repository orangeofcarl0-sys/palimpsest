/**
 * R3-L0C-I-A-R-L-C-F-S-H §5/§11 — THE PERSISTED-EVIDENCE AND AUTHORITATIVE-ENTRY GATES.
 *
 * These tests require the FROZEN committed plan and the COMMITTED Qualification and Stage Result, so they run
 * against the persisted evidence set rather than against a fixture. §5's whole point is that the final verdict is
 * derived from committed files, so a test that could pass before those files existed would not be testing the
 * property.
 *
 * §10: these are T2 (integration over persisted evidence) and T3 (the actual authoritative entry).
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PLAN_ID, SEAL_PHASES, STAGE_EVIDENCE_PATH } from "../scripts/r3l0ciarlcfsh/contract.mjs";
import { readAndVerifyCommittedPlan, committedPlanPath } from "../scripts/r3l0ciarlcfsh/committed-plan.mjs";
import { checkPlanClosure } from "../scripts/r3l0ciarlcfsh/prospective-plan.mjs";
import { sealPersistedEvidence, readPersistedSeal } from "../scripts/r3l0ciarlcfsh/evidence-seal.mjs";
import { buildFinalVerdicts } from "../scripts/r3l0ciarlcfsh/evidence.mjs";
import { assertCommittedPlanIdentity } from "../scripts/r3l0ciarlcfsh/modes.mjs";

const EVIDENCE = STAGE_EVIDENCE_PATH;

/** §5: read a committed evidence file from the worktree. */
function readEvidence(name: string): any {
  return JSON.parse(readFileSync(join(process.cwd(), EVIDENCE, name), "utf8"));
}

describe("R3-L0C-I-A-R-L-C-F-S-H §11 T2 — the committed plan", () => {
  it("reports the four identity facts separately", async () => {
    const verification = await readAndVerifyCommittedPlan({ verifyCompiled: false });
    expect(verification.checks.COMMITTED_PLAN_SELF_DIGEST).toBe("MATCH");
    expect(verification.checks.COMMITTED_PLAN_GIT_IDENTITY).toBe("MATCH");
    expect(verification.checks.PLAN_SCHEMA_AND_ID).toBe("PASS");
    expect(verification.checks.PLAN_CLOSURE_BINDING).toBe("MATCH");
    expect(verification.verified).toBe(true);
  }, 120_000);

  it("binds the frozen sixteen-session design", async () => {
    const verification = await readAndVerifyCommittedPlan({ verifyCompiled: false });
    expect(verification.scheduleLength).toBe(16);
    expect(verification.plan.planId).toBe(PLAN_ID);
    expect(verification.plan.preservedDesign.sessionCount).toBe(16);
  }, 120_000);

  it("agrees with the current recomputed closure", async () => {
    const closure = await checkPlanClosure({ verifyCompiled: false });
    expect(closure.EXECUTION_CLOSURE).toBe("MATCH");
  }, 120_000);

  it("names the committed plan path inside this stage's own evidence namespace", () => {
    expect(committedPlanPath()).toBe(`${EVIDENCE}/execution-plan.json`);
  });
});

describe("R3-L0C-I-A-R-L-C-F-S-H §5 T2 — the persisted evidence seal", () => {
  it("seals the committed plan against the PERSISTED Qualification and Stage Result", async () => {
    const seal = await sealPersistedEvidence({});
    expect(seal.evaluationPhase).toBe(SEAL_PHASES.PHASE_B.id);
    expect(seal.isFinalVerdict).toBe(true);
    expect(seal.qualificationReadFromDisk).toBe(true);
    expect(seal.stageResultReadFromDisk).toBe(true);
    expect(seal.result).toBe("MATCH");
    expect(seal.failing).toEqual([]);
  }, 120_000);

  it("reports the committed blobs and the phase, so a reader sees the exact bytes", async () => {
    const seal = await sealPersistedEvidence({});
    expect(seal.planCommittedGitBlob).toBeTruthy();
    expect(seal.qualificationCommittedGitBlob).toBeTruthy();
    expect(seal.stageResultCommittedGitBlob).toBeTruthy();
    expect(seal.qualificationGitBlobMatchesWorktree).toBe(true);
    expect(seal.stageResultGitBlobMatchesWorktree).toBe(true);
    expect(seal.sourceFiles.plan).toBe(`${EVIDENCE}/execution-plan.json`);
    expect(seal.sourceFiles.qualification).toBe(`${EVIDENCE}/qualification.json`);
    expect(seal.sourceFiles.stageResult).toBe(`${EVIDENCE}/stage-result.json`);
  }, 120_000);

  it("leaves no contradictory seal status inside the persisted Qualification", () => {
    const qualification = readEvidence("qualification.json");
    expect(qualification.prePersistenceSealStatus.evaluationPhase).toBe(SEAL_PHASES.PHASE_A.id);
    expect(qualification.prePersistenceSealStatus.CROSS_ARTIFACT_PLAN_BINDING).toBe("NOT_EVALUATED");
    expect(qualification.prePersistenceSealStatus.isNotAFailedFinalSeal).toBe(true);
    expect(qualification.prePersistenceSealStatus.isNotAPassedFinalSeal).toBe(true);
    /** The prior stage's defect: a MISMATCH seal beside a MATCH verdict. This stage records the seal as not yet evaluated. */
    expect(qualification.verdicts.PERSISTED_CROSS_ARTIFACT_SEAL).toBe("NOT_ESTABLISHED");
    expect(qualification.verdicts.CROSS_ARTIFACT_PLAN_BINDING).toBeUndefined();
  });

  it("derives the final verdict from the persisted seal", async () => {
    const seal = await sealPersistedEvidence({});
    const qualification = readEvidence("qualification.json");
    const verdicts = buildFinalVerdicts({ seal, qualification });
    expect(verdicts.sealReference.evaluationPhase).toBe(SEAL_PHASES.PHASE_B.id);
    expect(verdicts.verdicts.PERSISTED_CROSS_ARTIFACT_SEAL).toBe("MATCH");
    expect(verdicts.verdicts.FINAL_VERDICT_DERIVED_FROM_SEAL).toBe("PASS");
    expect(verdicts.combinedReadinessFlagComputed).toBe(false);
  }, 120_000);

  it("keeps the unearned verdicts at their honest values", () => {
    const qualification = readEvidence("qualification.json");
    const persisted = readPersistedSeal();
    const verdicts = buildFinalVerdicts({
      seal: persisted ?? { result: "MATCH", evaluationPhase: SEAL_PHASES.PHASE_B.id, thisSealIsTheFinalVerdict: true },
      qualification,
    });
    expect(verdicts.verdicts.LIVE_PRIMARY_PROVENANCE).toBe("NOT_ESTABLISHED");
    expect(verdicts.verdicts.EXTERNAL_AUTHORITY).toBe("NOT_ESTABLISHED");
    expect(verdicts.verdicts.HOST_SPEND_ENFORCEMENT).toBe("NOT_ESTABLISHED");
    expect(verdicts.verdicts.PAID_EXECUTION).toBe("NOT_RUN");
    expect(verdicts.verdicts.CAUSAL_RESULT).toBe("NOT_EVALUABLE");
  });
});

describe("R3-L0C-I-A-R-L-C-F-S-H §8 T3 — the authoritative entry", () => {
  it("refuses a PRIMARY invocation at the prohibition, after the committed-plan guard passed", async () => {
    const { runTerminalEnforcementMatrix } = await import("../scripts/r3l0ciarlcfsh/pipeline.mjs");
    const root = mkdtempSync(join(tmpdir(), "r3lcfsh-primary-"));
    try {
      const run = await runTerminalEnforcementMatrix({
        mode: "PRIMARY", runId: "gate-primary", runRoot: join(root, "primary"),
        authorizedBy: PLAN_ID, caller: PLAN_ID,
      });
      expect(run.PIPELINE).toBe("REFUSED");
      expect(run.refusedAt).toBe("PRIMARY_PROHIBITION");
      expect(run.guard.passed).toBe(true);
      expect(run.launched).toBe(false);
      expect(run.modelCallsMade).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }, 120_000);

  it("refuses when the committed plan does not verify, before the run root is touched", async () => {
    const guard = await assertCommittedPlanIdentity({ expectedPlanId: PLAN_ID, planPath: join(tmpdir(), "absent-plan.json") });
    expect(guard.passed).toBe(false);
    expect(guard.regeneratesPlan).toBe(false);
    expect(guard.dominatesExecutionEntry).toBe(true);
  });
});
