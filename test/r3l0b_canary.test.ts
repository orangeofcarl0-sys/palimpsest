/**
 * R3-L0B §11/§12/§13 — THE CONTAINMENT INTEGRATION TESTS.
 *
 * These are the live proofs, and they are separated from the contract tests because they DRIVE THE SHIPPED
 * RUNTIME: the real Win32 integrity label, the real `dsh-sandbox-windows-acl` runner, and a real Node subject
 * inside the confined token. That is what §11 means by "through the real packaged worker runtime", and it is
 * why the result is a measurement rather than a reading of source.
 *
 * THEY ARE SLOWER THAN THE CONTRACT TESTS, and they are deliberately not skipped when the sandbox is missing:
 * a containment gate that silently skipped on a host without the sandbox would report PASS by absence, which is
 * the failure mode §11's "all declared host-private canaries unavailable" is written to prevent. Instead the
 * suite reports the sandbox as unavailable and the assertions require the gap to be visible.
 */
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rmSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CANARY_ATTEMPTS, CANARY_ROOTS, CANARY_VERDICTS } from "../scripts/r3l0b/contract.mjs";
import { buildIsolatedLayout } from "../scripts/r3l0b/containment.mjs";
import { resolveSandbox, runCanarySuite } from "../scripts/r3l0b/canaries.mjs";
import { canaryLivenessControl, oracleExposureMutation, sharedParentMutation } from "../scripts/r3l0b/mutations.mjs";

const BASE = join(tmpdir(), "r3l0b-integration");
const UNIT_IDS = ["u0-H", "u0-C"];
const sandbox = resolveSandbox();

/** The canary suite is expensive, so it runs once and the assertions read its result. */
let suite: Awaited<ReturnType<typeof runCanarySuite>>;
let liveness: Awaited<ReturnType<typeof canaryLivenessControl>>;

beforeAll(async () => {
  const root = join(BASE, "suite");
  buildIsolatedLayout(root, UNIT_IDS);
  suite = await runCanarySuite({ root, unitIds: UNIT_IDS });
  liveness = await canaryLivenessControl({ root: join(BASE, "liveness"), unitIds: UNIT_IDS });
}, 900_000);

afterAll(() => {
  rmSync(BASE, { recursive: true, force: true });
});

describe("R3-L0B §11 — the deterministic containment canaries", () => {
  it("§11 the shipped sandbox and the kernel fence are both available and verified", () => {
    expect(sandbox.available, `the shipped ACL sandbox is unavailable at ${sandbox.index}`).toBe(true);
    expect(suite.fence.supported, `the kernel label layer is unsupported: ${String(suite.fence.detail)}`).toBe(true);
    expect(suite.fence.rootsVerified).toBe(true);
    expect(suite.fence.treesVerified).toBe(true);
  });

  it("§11 the confined subject actually ran, so an UNREACHABLE result is a measurement", () => {
    expect(suite.probeRan, `the confined probe did not run: ${String(suite.probeError)}`).toBe(true);
  });

  it("§11 EVERY declared root × attempt cell is measured, with no NOT_APPLICABLE gap", () => {
    expect(suite.probes.length).toBe(CANARY_ROOTS.length * CANARY_ATTEMPTS.length);
    expect(suite.containment.notApplicable).toEqual([]);
    for (const probe of suite.probes) expect(probe.verdict, `${probe.rootId}/${probe.attemptId} is ${probe.verdict}`).not.toBe(CANARY_VERDICTS.NOT_APPLICABLE);
  });

  it("§11 ALL declared host-private canaries are UNAVAILABLE", () => {
    expect(suite.containment.reachable, `reachable canaries: ${suite.containment.reachable.join(", ")}`).toEqual([]);
    for (const probe of suite.probes) expect(probe.verdict, `${probe.rootId}/${probe.attemptId} was REACHABLE`).toBe(CANARY_VERDICTS.UNREACHABLE);
  });

  it("§11 EXPERIMENT_CONTAINMENT is PASS", () => {
    expect(suite.containment.EXPERIMENT_CONTAINMENT).toBe("PASS");
  });

  it("§11 the canary-liveness control proves the probe can discriminate, so the gate is not vacuous", () => {
    expect(liveness.probeRan).toBe(true);
    expect(liveness.LIVE, `the unfenced control found nothing reachable, so the gate measures an empty probe: ${String(liveness.basis)}`).toBe(true);
    expect(liveness.directReadsReachable).toBeGreaterThan(0);
  });

  it("§11 the same reads that are BLOCKED under the fence are REACHABLE without it", () => {
    /**
     * The paired assertion that makes the boundary real: for each direct-read attempt, the fenced run must be
     * UNREACHABLE and the unfenced control must be REACHABLE. One without the other proves nothing.
     */
    const fenced = new Map(suite.probes.map((probe) => [`${probe.rootId}/${probe.attemptId}`, probe.verdict]));
    const unfenced = new Set(liveness.reachableCells);
    let pairs = 0;
    for (const [key, verdict] of fenced) {
      if (!unfenced.has(key)) continue;
      pairs += 1;
      expect(verdict, `${key} was reachable unfenced but not blocked by the fence`).toBe(CANARY_VERDICTS.UNREACHABLE);
    }
    expect(pairs, "no attempt was reachable unfenced, so the pair cannot be formed").toBeGreaterThan(0);
  });
});

describe("R3-L0B §12 — the shared-parent mutation", () => {
  it("§12 restoring the R3-L0 shared-parent layout is DETECTED by the containment gate", async () => {
    const result = await sharedParentMutation({ mutatedRoot: join(BASE, "sp-mut"), positiveRoot: join(BASE, "sp-pos"), unitIds: UNIT_IDS });
    expect(result.mutatedLayoutSharesParent, "the mutated layout did not reproduce the shared-parent defect").toBe(true);
    expect(result.mutatedVerdict, "the containment gate did not fail on the mutated layout").toBe("FAIL");
    expect(result.positiveVerdict, "the containment gate did not pass on the corrected layout").toBe("PASS");
    expect(result.mutationDetected).toBe(true);
    expect(result.recordedVerdict).toBe("SHARED_PARENT_MUTATION_DETECTED");
  }, 900_000);
});

describe("R3-L0B §13 — the oracle-exposure mutation", () => {
  it("§13 placing the oracle beneath the worker-readable root is DETECTED by the outcome-blindness gate", async () => {
    const result = await oracleExposureMutation({ mutatedRoot: join(BASE, "ox-mut"), positiveRoot: join(BASE, "ox-pos"), unitIds: UNIT_IDS });
    expect(result.mutatedOracleInsideWorld, "the mutated layout did not place the oracle inside a world").toBe(true);
    expect(result.mutatedVerdict, "the outcome-blindness gate did not fail on the mutated layout").toBe("FAIL");
    expect(result.positiveVerdict, "the outcome-blindness gate did not pass on the corrected layout").toBe("PASS");
    expect(result.mutationDetected).toBe(true);
    expect(result.recordedVerdict).toBe("ORACLE_EXPOSURE_MUTATION_DETECTED");
  }, 900_000);
});
