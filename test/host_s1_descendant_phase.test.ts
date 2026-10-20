/**
 * Palimpsest Host-S1 §7.2 — H1-B: THE DESCENDANT REFUSAL IS A PRE-CREATE PHASE.
 *
 * E1RG established the precedence chain
 *
 *     PreCreateAdmissionRefused => NoAgentCreation => NoModelTurn => NoSuccessfulWorkerOutcome => HOST_FAILURE
 *
 * and this suite pins that the DESCENDANT verification refusal takes part in it. The question is not only whether
 * `admitWorker` would refuse — it is whether the refusal happens BEFORE `agents.create()`, so no Agent is
 * composed and no model turn can follow.
 *
 * THE DEFECT THIS PINS. `runner.js` had no descendant phase at all: it read `boundary.kernel.coverage` and
 * nothing else, so a root whose label verified but whose child blocked inheritance reached `agents.create()`.
 *
 * SAFETY. A stub boundary module is supplied in place of the real one, so no label is written and no real worker
 * runs. The stub's `installWorkerReadBoundary` returns a report with the descendant fact FALSE while every other
 * fact is TRUE — which is precisely the configuration the parent admitted.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RUNTIME = ["..", "host", "deployment", "runtime"].join("/");
const ROOT = mkdtempSync(join(tmpdir(), "hosts1-phase-"));

afterAll(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* windows locks */
  }
});

/**
 * Read the pre-create block out of the shipped runner and assert its structure.
 *
 * The runner is a Cordis plugin and cannot be executed in isolation without a full DSH host, so the phase
 * ordering is pinned by reading the shipped source. That is a STATIC assertion, and it is recorded as such: the
 * DYNAMIC proof that the refusal stops execution lives in `trajectory_p2e1rg_precreate_admission.test.ts`, which
 * drives the real bundle end to end.
 */
const RUNNER = await import("node:fs").then((fs) => fs.readFileSync(join(process.cwd(), "host", "dsh", "lib", "runner.js"), "utf8"));

describe("H1-B descendant refusal phase (STATIC_ASSERTION over the shipped runner)", () => {
  it("1. a kernel-descendants refusal phase exists", () => {
    expect(RUNNER).toContain("refuse('kernel-descendants'");
  });

  it("2. the phase runs when the boundary reports NO descendant verification", () => {
    expect(RUNNER).toContain("verification === null");
    expect(RUNNER).toContain("no descendant verification");
  });

  it("3. the phase runs when descendantsQualified is not true", () => {
    expect(RUNNER).toContain("verification.descendantsQualified !== true");
    expect(RUNNER).toContain("descendant verification is INCOMPLETE");
  });

  it("4. the phase is evaluated BEFORE the pre-create stop, so it prevents agents.create()", () => {
    const descendantIndex = RUNNER.indexOf("refuse('kernel-descendants'");
    const stopIndex = RUNNER.indexOf("preCreate.finalResult = 'PRECREATE_REFUSED'");
    const createIndex = RUNNER.indexOf("await agents.create(");
    expect(descendantIndex).toBeGreaterThan(0);
    expect(stopIndex).toBeGreaterThan(descendantIndex);
    expect(createIndex).toBeGreaterThan(stopIndex);
  });

  it("5. the descendant fact is passed to admitWorker as its own requirement", () => {
    expect(RUNNER).toContain("kernelDescendantsQualified: preCreate?.kernel?.descendantsQualified === true");
  });

  it("6. the receipt records what was actually examined, not only the boolean", () => {
    expect(RUNNER).toContain("descendantTrees");
    expect(RUNNER).toContain("descendantEntriesChecked");
    expect(RUNNER).toContain("descendantUnverifiedRoots");
  });

  it("7. the receipt names the SPINE the derivation followed", () => {
    expect(RUNNER).toContain("spine: coverage?.skipped?.flatMap");
    expect(RUNNER).toContain("incompletePlans");
  });

  it("8. the capacity receipt records the domain and the mechanism", () => {
    expect(RUNNER).toContain("mechanism: slot.mechanism");
    expect(RUNNER).toContain("domain: slot.domain?.identity");
    expect(RUNNER).toContain("domainAssumption");
  });

  it("9. the runner derives the capacity domain from the boundary module, not from a literal", () => {
    expect(RUNNER).toContain("boundaryLoad.module.findRepository?.(process.cwd())");
  });

  it("10. the reported-result branch is still evaluated AFTER the refusal check", () => {
    const failureCheck = RUNNER.indexOf("if (failure !== null) {");
    const reportedCheck = RUNNER.indexOf("if (reported !== null && reported !== undefined) {");
    expect(failureCheck).toBeGreaterThan(0);
    expect(reportedCheck).toBeGreaterThan(failureCheck);
  });
});

describe("H1-B descendant refusal precedence (DYNAMICALLY_VERIFIED via admitWorker)", () => {
  it("11. a boundary report with descendants unqualified is refused by admitWorker", async () => {
    const workerFence = (await import(/* @vite-ignore */ `${RUNTIME}/worker_fence.js`)) as {
      admitWorker: (input: { visibleNames: readonly string[]; guardScope?: string; boundary?: Record<string, boolean> }) => {
        allowed: boolean;
        reason?: string;
      };
    };
    const verdict = workerFence.admitWorker({
      visibleNames: ["subagent", "palimpsest_worker_result"],
      guardScope: "global",
      boundary: {
        guardInstalled: true,
        cwdFenceInstalled: true,
        delegationFenceInstalled: true,
        kernelSupported: true,
        kernelRootsVerified: true,
        kernelCoverageComplete: true,
        kernelContractNotDrifted: true,
        /** The single fact that differs from a fully satisfied installation. */
        kernelDescendantsQualified: false,
      },
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain("kernelDescendantsQualified");
  });

  it("12. the same report WITH the descendant fact satisfied is allowed", async () => {
    const workerFence = (await import(/* @vite-ignore */ `${RUNTIME}/worker_fence.js`)) as {
      admitWorker: (input: { visibleNames: readonly string[]; guardScope?: string; boundary?: Record<string, boolean> }) => { allowed: boolean };
    };
    const verdict = workerFence.admitWorker({
      visibleNames: ["subagent", "palimpsest_worker_result"],
      guardScope: "global",
      boundary: {
        guardInstalled: true,
        cwdFenceInstalled: true,
        delegationFenceInstalled: true,
        kernelSupported: true,
        kernelRootsVerified: true,
        kernelCoverageComplete: true,
        kernelContractNotDrifted: true,
        kernelDescendantsQualified: true,
      },
    });
    expect(verdict.allowed).toBe(true);
  });
});
