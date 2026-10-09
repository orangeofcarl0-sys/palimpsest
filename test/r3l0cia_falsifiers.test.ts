/**
 * R3-L0C-I-A §1 — THE ESCAPED-DEFECT FALSIFIERS, FROZEN AGAINST THE BASELINE.
 *
 * §1 requires the eight defects to fail against `b6c15e6` BEFORE the repairs exist, and it forbids one specific
 * mistake: "Do not write the negative tests after adapting them to the repaired implementation."
 *
 * WHAT EACH TEST ASSERTS, AND WHY IT IS A LOAD-BEARING WITNESS. Every test here asserts a MEASURED observation
 * from the baseline's own code path — a digest that moved, a root set that contains the caller's own world, a
 * field that is absent from the real report, a number the shipped parser returns. None of them asserts a
 * constant, a comment, a file's existence or a directory listing, because R3-L0C-F §3 established that such a
 * test "is not a load-bearing witness".
 *
 * THE PREHISTORY IS BUILT ONCE. It takes about twenty seconds and is deterministic. The falsifiers that need a
 * run root get their own, because F1 measures a run root's own bytes.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildPrehistory } from "../scripts/r3l0c/build-prehistory.mjs";
import { admitCapital, selectionRefs } from "../scripts/r3l0c/prehistory.mjs";
import { buildExpectationManifest } from "../scripts/r3l0cr/contract.mjs";
import { GENERATION_EXPOSURES } from "../scripts/r3l0c/capital.mjs";
import {
  falsifyF1, falsifyF2, falsifyF3, falsifyF4, falsifyF5, falsifyF6, falsifyF7, falsifyF8, runEscapedDefectFalsifiers,
} from "../scripts/r3l0cia/falsifiers.mjs";
import { ESCAPED_DEFECTS, ACTIVATION_ORDER, PULL_LAYERS, EXECUTION_MODES } from "../scripts/r3l0cia/contract.mjs";

const BASE = join(tmpdir(), `palimpsest-r3l0cia-falsifiers-${String(process.pid)}`);
let prehistory: { world: string; state: string };
let expectationC2: unknown;
let visibleHandles: readonly string[];
let transcriptPath: string;

beforeAll(async () => {
  try { rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
  const built = await buildPrehistory(join(BASE, "prehistory"));
  const admitted = await admitCapital(join(BASE, "prehistory"), built.paths, "cutover-entitlements", built.world);
  const refs = selectionRefs(admitted);
  prehistory = { world: built.world, state: built.paths.state };
  expectationC2 = buildExpectationManifest({ generationId: "G2", arm: "C", admittedRefs: refs, generationExposures: GENERATION_EXPOSURES });
  visibleHandles = (expectationC2 as { expectedConsumerVisibleHandles: readonly string[] }).expectedConsumerVisibleHandles;
  /** A transcript carrying the SHIPPED telemetry shape, reporting zero voluntary pulls. */
  transcriptPath = join(BASE, "transcript-zero-pulls.txt");
  writeFileSync(transcriptPath, `PALIMPSEST_WORKER_PULL ${JSON.stringify({ pulled: [] })}\n`, "utf8");
}, 900_000);

afterAll(() => {
  try { rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds SQLite handles briefly */ }
});

describe("R3-L0C-I-A §1 — the eight escaped defects, measured against b6c15e6", () => {
  it("the frozen contract declares eight defects, nine activation steps, three pull layers and two modes", () => {
    expect(ESCAPED_DEFECTS.length).toBe(8);
    expect(ACTIVATION_ORDER.length).toBe(9);
    expect(PULL_LAYERS.length).toBe(3);
    expect(EXECUTION_MODES.map((mode: { id: string }) => mode.id)).toEqual(["DETERMINISTIC", "PRIMARY"]);
    /** The order is the contract: the claim is step 4, and steps 5-9 are the mutations it must precede. */
    expect(ACTIVATION_ORDER[3]?.id).toBe("ACQUIRE_EXCLUSIVE_RUN_ROOT");
    expect(ACTIVATION_ORDER.slice(0, 3).every((step: { mutates: boolean }) => step.mutates === false)).toBe(true);
    expect(ACTIVATION_ORDER.slice(3).some((step: { mutates: boolean }) => step.mutates === true)).toBe(true);
  });

  it("F1: the baseline REWRITES preserved evidence and does NOT refuse the replay", async () => {
    /**
     * THE MEASURED FINDING, and it is worse than the ruling's phrasing. The baseline does not merely mutate
     * before refusing — it never refuses. `preparePrimaryCase` -> `prepareRunLayout` -> `buildIsolatedLayout`
     * removes the run root, so the claim file, the generation journal, the abort manifest and the PRESERVE marker
     * are all destroyed, and the second run proceeds as NEW.
     */
    const f1 = await falsifyF1({ prehistory, trajectoryIds: ["f-t0"] });
    expect(f1.PROPERTY_VIOLATED_BY_BASELINE).toBe(true);
    expect(f1.stateChangedBeforeRefusal).toBe(true);
    expect(f1.secondRunRefused).toBe(false);
    /** Every one of the five preserved artifacts was present after the first run and carries different bytes after the second. */
    const rewritten = f1.evidenceRewritten as readonly string[];
    expect(rewritten.length).toBeGreaterThanOrEqual(4);
    expect(rewritten).toContain("generation-journal.jsonl");
    expect(rewritten).toContain("run-claim.json");
    expect(f1.secondRunTerminal).toBe("MATRIX_COMPLETE");
  }, 300_000);

  it("F2: every trajectory has its OWN world in its own protected roots", async () => {
    const f2 = await falsifyF2({ runRoot: join(BASE, "f2-roots"), trajectoryIds: ["f-t0", "f-t1", "f-t2"] });
    expect(f2.PROPERTY_VIOLATED_BY_BASELINE).toBe(true);
    expect(f2.currentTrajectoryIdArgument).toBeNull();
    expect(f2.ownWorldProtectedCount).toBe(3);
    /** The mechanism: the baseline passes two arguments, so the third parameter is null and the skip never fires. */
    expect(f2.callerArgumentCount).toBe(2);
  });

  it("F3: the frozen contract says NOT_APPLIED while the baseline reports no mismatch", async () => {
    const f3 = await falsifyF3({ expectation: expectationC2, observedHandles: visibleHandles.slice(0, 2) });
    expect(f3.PROPERTY_VIOLATED_BY_BASELINE).toBe(true);
    expect(f3.frozenRealization).toBe("NOT_APPLIED");
    /** The mechanism: the baseline reads a field the generation child never writes. */
    expect(f3.baselineFieldPresentOnTheRealReport).toBe(false);
    expect(f3.baselineDetectsMismatch).toBe(false);
  });

  it("F4: the baseline reads four HOST audit resolutions as governed pulls while the worker pulled none", async () => {
    const f4 = await falsifyF4({ expectation: expectationC2, transcriptPath, visibleHandles });
    expect(f4.PROPERTY_VIOLATED_BY_BASELINE).toBe(true);
    expect(f4.hostResolveAuditCount).toBe(4);
    /** The worker's own telemetry, through the SHIPPED parser: zero voluntary pulls. */
    expect(f4.shippedParserUsed).toBe(true);
    expect(f4.workerPullObservedCount).toBe(0);
    expect(f4.baselineWouldReportUptake).toBe(true);
    expect(f4.actualWorkerUptakeIsZero).toBe(true);
  });

  it("F5: the primary driver cannot select a real model worker", async () => {
    const f5 = await falsifyF5();
    expect(f5.PROPERTY_VIOLATED_BY_BASELINE).toBe(true);
    expect(f5.baselineIsAScriptedWorker).toBe(true);
    expect(f5.inputCanSelectShippedWorker).toBe(false);
    /** The shipped DSH executable DOES resolve on this host, so the gap is the selection, not the availability. */
    expect(f5.primaryWorkerResolved).toBe(true);
  });

  it("F6: the baseline's default post-matrix gate is satisfied by a session count", async () => {
    const schedule = Array.from({ length: 16 }, (_, index) => ({ sessionId: `s-${String(index)}` }));
    const f6 = await falsifyF6({ schedule });
    expect(f6.PROPERTY_VIOLATED_BY_BASELINE).toBe(true);
    expect(f6.baselineGateGreen).toBe(true);
    expect(f6.baselineChecksAnyOfThem).toBe(false);
    expect((f6.requiredBeyondCount as readonly string[]).length).toBeGreaterThan(0);
  });

  it("F7: an omitted, null and drifted closure digest are all accepted", async () => {
    const f7 = await falsifyF7();
    expect(f7.PROPERTY_VIOLATED_BY_BASELINE).toBe(true);
    expect(f7.allAccepted).toBe(true);
    const results = f7.results as readonly { label: string; accepted: boolean; recordedClosureDigest: string | null }[];
    expect(results.map((entry) => entry.label)).toEqual(["OMITTED", "NULL", "DRIFTED"]);
    /** The drifted digest is recorded verbatim and compared to nothing. */
    expect(results.find((entry) => entry.label === "DRIFTED")?.recordedClosureDigest).toBe("f".repeat(64));
  }, 300_000);

  it("F8: the outer child budget expires before the inner worker budget", async () => {
    const f8 = await falsifyF8();
    expect(f8.PROPERTY_VIOLATED_BY_BASELINE).toBe(true);
    expect(f8.outerChildMs).toBe(900_000);
    expect(f8.innerWorkerMs).toBe(1_800_000);
    expect(f8.outerExpiresFirst).toBe(true);
    expect(f8.baselineDistinguishesUnresolvedExposure).toBe(false);
  });

  it("ALL EIGHT properties are violated by the baseline, measured in one run", async () => {
    const report = await runEscapedDefectFalsifiers({
      prehistory,
      trajectoryIds: ["f-t0"],
      expectation: expectationC2,
      observedHandles: visibleHandles.slice(0, 2),
      visibleHandles,
      transcriptPath,
      runRoot: join(BASE, "all-roots"),
    });
    expect(report.ALL_EIGHT_VIOLATED_BY_BASELINE).toBe(true);
    expect(report.ESCAPED_DEFECTS_PRESENT).toBe(8);
    expect(report.notViolated).toEqual([]);
    expect(report.modelCallsMade).toBe(0);
    /** Every declared defect id has a measured falsifier. */
    expect(new Set(report.falsifiers.map((entry) => entry.id))).toEqual(new Set(ESCAPED_DEFECTS.map((defect: { id: string }) => defect.id)));
  }, 600_000);

  it("the falsifiers are load-bearing: they observe state, not declarations", async () => {
    /**
     * THE ANTI-VACUITY CHECK. Each falsifier's evidence is a value the baseline PRODUCED — a moved digest, a
     * root set, a parser's return, a read budget — rather than a constant or a file's presence. This test asserts
     * that shape directly, so a future edit that replaced a measurement with a constant would fail here.
     */
    const f1 = await falsifyF1({ prehistory, trajectoryIds: ["f-t0"] });
    expect(f1.stateDigestBefore).not.toBe(f1.stateDigestAfter);
    expect(typeof f1.stateDigestBefore).toBe("string");
    expect((f1.stateDigestBefore as string).length).toBe(64);
    /** The evidence artifacts are read from disk, so their digests are real content digests of real files. */
    const evidence = f1.firstRunEvidence as Record<string, string>;
    const journalDigest = evidence["generation-journal.jsonl"];
    expect(journalDigest).not.toBe("ABSENT");
    expect(journalDigest).toMatch(/^[0-9a-f]{16}$/u);
    expect(journalDigest).not.toBe(evidence["abort-manifest.json"]);
    expect(evidence["PRESERVE"]).toMatch(/^[0-9a-f]{16}$/u);
    /** F2's measurement is a REAL root set built by the shipped function, not a hand-written list. */
    const f2 = await falsifyF2({ runRoot: join(BASE, "load-bearing-roots"), trajectoryIds: ["f-t0", "f-t1"] });
    expect((f2.roots as readonly string[]).length).toBeGreaterThan(0);
    expect((f2.roots as readonly string[]).some((root) => root.includes("private"))).toBe(true);
    /** F4's measurement is the SHIPPED parser's return value, not a local re-implementation. */
    const f4 = await falsifyF4({ expectation: expectationC2, transcriptPath, visibleHandles });
    expect(f4.shippedParserUsed).toBe(true);
    expect(Array.isArray(f4.workerPullObservedHandles)).toBe(true);
  }, 300_000);
});
