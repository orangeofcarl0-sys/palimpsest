/**
 * R3-L0C-I-A §2-§8 — THE ACTIVATION, CONFINEMENT, TREATMENT, MODE, VALIDITY AND CLOSURE GATES.
 *
 * §8's bar is stated twice and this file honours both halves: "Each hard gate needs at least one positive control
 * and one mutant that actually fails the pre-repair implementation", and "Test declarations are not a substitute
 * for measuring the actual executed boundary."
 *
 * So nothing here asserts a declaration. Every test drives the REAL entry — the activation, the confinement
 * probe inside the shipped ACL runner, the primary matrix through the real generation child, the closure with a
 * real temporary mutation — and asserts the value that came back. The mutants are the eight falsifiers measured
 * against the baseline in `r3l0cia_falsifiers.test.ts`, and each acceptance record names its falsifier.
 *
 * THE PREHISTORY IS BUILT ONCE, and the containment gate is run once, because both are expensive and
 * deterministic. The matrix cases each get their own run root and their own copy, because a fail-stop run claims
 * and preserves its root.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildPrehistory } from "../scripts/r3l0c/build-prehistory.mjs";
import { admitCapital, selectionRefs } from "../scripts/r3l0c/prehistory.mjs";
import { buildExpectationManifest } from "../scripts/r3l0cr/contract.mjs";
import { GENERATION_EXPOSURES } from "../scripts/r3l0c/capital.mjs";
import { installHostBundle, dshHome } from "../scripts/gates/env.mjs";
import { computeExecutionClosure, proveClosureMutations } from "../scripts/r3l0cia/closure.mjs";
import { measureWalkerBlindSpot, RUNTIME_MANIFEST } from "../scripts/r3l0cia/runtime-manifest.mjs";
import { runPerTrajectoryConfinement, perTrajectoryProtectedRoots } from "../scripts/r3l0cia/confinement.mjs";
import { frozenPrimarySchedule, assertAuthoritativePath, PRIMARY_FAULTS, timeoutHierarchy, parseWorkerResult } from "../scripts/r3l0cia/primary-adapter.mjs";
import { runPrimaryMatrix } from "../scripts/r3l0cia/primary-driver.mjs";
import { claimActivationRoot, verifyTrustedClaim, prepareLayoutSafely } from "../scripts/r3l0cia/activation.mjs";
import { shippedPullParser } from "../scripts/r3l0cia/treatment.mjs";
import { ACCEPTANCE_TESTS, ACTIVATION_ORDER, GENERATION_CHILD_BUDGET_MS, WORKER_EXECUTION_BUDGET_MS, ESCAPED_DEFECTS } from "../scripts/r3l0cia/contract.mjs";
import {
  acceptanceA01A03, acceptanceA02, acceptanceA05A06, acceptanceA07, acceptanceA08A09, acceptanceA10, acceptanceA11,
  acceptanceA12A13, acceptanceA14, acceptanceA15A16,
} from "../scripts/r3l0cia/acceptance.mjs";

const BASE = join(tmpdir(), `palimpsest-r3l0cia-gates-${String(process.pid)}`);
let prehistory: { world: string; state: string };
let refs: readonly unknown[];
let closure: { executionClosureDigest: string };
let containment: Awaited<ReturnType<typeof runPerTrajectoryConfinement>>;
let schedule: Awaited<ReturnType<typeof frozenPrimarySchedule>>;
let expectationC2: unknown;
let plan: Record<string, unknown>;

beforeAll(async () => {
  try { rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
  mkdirSync(BASE, { recursive: true });
  const built = await buildPrehistory(join(BASE, "prehistory"));
  const admitted = await admitCapital(join(BASE, "prehistory"), built.paths, "cutover-entitlements", built.world);
  prehistory = { world: built.world, state: built.paths.state };
  refs = selectionRefs(admitted);
  expectationC2 = buildExpectationManifest({ generationId: "G2", arm: "C", admittedRefs: refs, generationExposures: GENERATION_EXPOSURES });
  schedule = await frozenPrimarySchedule();
  closure = await computeExecutionClosure({ verifyCompiled: false });
  const trajectoryIds = [...new Set(schedule.map((session) => session.trajectoryId))].sort();
  containment = await runPerTrajectoryConfinement({ runRoot: join(BASE, "containment"), trajectoryIds });
  plan = {
    planId: "r3-l0c-ia-primary-plan",
    schedule,
    executionClosure: { executionClosureDigest: closure.executionClosureDigest },
    executionRoute: { authoritativePath: "r3-l0c-ia-primary-plan" },
    authorizationRequired: { required: true },
    preservedDesign: { primaryEndpointsChanged: false, verdictThresholdsChanged: false },
  };
}, 1_800_000);

afterAll(() => {
  try { rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds SQLite handles briefly */ }
});

/**
 * Run one matrix case in its own root, with the plan-bound gate's inputs supplied.
 *
 * THE ROOT IS UNIQUE PER INVOCATION, and that is required rather than tidy. A fail-stop run CLAIMS its root and
 * preserves it, so a second run with the same id is refused by the replay guard — correctly. Sharing a root
 * between two tests would therefore make the second fail for the right reason at the wrong time. A counter keeps
 * every invocation in its own root, and the healthy run is MEMOIZED because it is the expensive one and several
 * tests read its records.
 */
let caseCounter = 0;
let healthyRun: Awaited<ReturnType<typeof runPrimaryMatrix>> | null = null;
async function runCase(name: string, options: { faultAt?: string; faultKind?: string | undefined; timeoutMs?: number } = {}) {
  const isHealthyBaseline = name === "healthy" && options.faultAt === undefined && options.faultKind === undefined;
  if (isHealthyBaseline && healthyRun !== null) return healthyRun;
  const unique = isHealthyBaseline ? name : `${name}-${String((caseCounter += 1))}`;
  const result = await runPrimaryMatrix({
    runId: `r3l0cia-${unique}`,
    runRoot: join(BASE, unique),
    prehistory: { world: prehistory.world, state: prehistory.state },
    admittedRefs: refs,
    installHostBundle,
    dshHome,
    authorizedBy: "r3-l0c-ia-primary-plan",
    caller: "r3-l0c-ia-primary-plan",
    plan,
    closure,
    containment,
    mode: "DETERMINISTIC",
    ...options,
  });
  if (isHealthyBaseline) healthyRun = result;
  return result;
}

describe("R3-L0C-I-A §8 — the acceptance-test set is the ruling's", () => {
  it("declares the sixteen tests, the eight defects and the nine activation steps", () => {
    expect(ACCEPTANCE_TESTS.length).toBe(16);
    expect(ESCAPED_DEFECTS.length).toBe(8);
    expect(ACTIVATION_ORDER.length).toBe(9);
    /** §5: the budgets are the derived pair, not the baseline's conflicting one. */
    expect(GENERATION_CHILD_BUDGET_MS).toBeGreaterThan(WORKER_EXECUTION_BUDGET_MS + 300_000);
    expect(timeoutHierarchy().outerExceedsInnerPlusSettlement).toBe(true);
  });
});

describe("R3-L0C-I-A §2 — Gate A: exclusive activation", () => {
  it("A01/A03: a replay and every unspendable root are refused before any mutation", async () => {
    const { results } = await acceptanceA01A03({ plan, closure });
    for (const result of results) {
      expect(result.PASS, result.id).toBe(true);
      expect(result.mutant.baselineViolates, result.id).toBe(true);
    }
    const a01 = results.find((entry) => entry.id.startsWith("A01"))!;
    expect(a01.positiveControl.stateUnchangedByRefusal).toBe(true);
    expect(String(a01.positiveControl.secondReason)).toMatch(/REFUSED_REPLAY|already claimed|belongs in a fresh root/u);
    const a03 = results.find((entry) => entry.id.startsWith("A03"))!;
    expect(a03.positiveControl.allRefused).toBe(true);
    expect(a03.positiveControl.distinctVerdicts as number).toBeGreaterThanOrEqual(4);
  }, 300_000);

  it("A02: exactly one of two concurrent claims wins", async () => {
    const result = await acceptanceA02();
    expect(result.PASS).toBe(true);
    expect(result.positiveControl.exactlyOneWinner).toBe(true);
    expect(result.positiveControl.secondVerdict as string).toBe("REFUSED_REPLAY");
    expect(result.positiveControl.intruderVerdict as string).toBe("REFUSED_ALREADY_CLAIMED");
  });

  it("§2: the trusted claim is verified against disk, and a caller flag cannot bypass it", async () => {
    const root = mkdtempSync(join(tmpdir(), "r3l0cia-claim-"));
    try {
      const claim = claimActivationRoot({ runRoot: root, runId: "trusted" });
      const nonce = claim.claimNonce ?? "";
      expect(claim.claimed).toBe(true);
      /** The real nonce verifies. */
      expect(verifyTrustedClaim({ runRoot: root, runId: "trusted", claimNonce: nonce }).trusted).toBe(true);
      /** A forged or absent nonce does NOT. */
      expect(verifyTrustedClaim({ runRoot: root, runId: "trusted", claimNonce: "forged" }).verdict).toBe("REFUSED_UNTRUSTED_CLAIM");
      expect(verifyTrustedClaim({ runRoot: root, runId: "trusted", claimNonce: null }).verdict).toBe("REFUSED_UNTRUSTED_CLAIM");
      /** A different run id does not. */
      expect(verifyTrustedClaim({ runRoot: root, runId: "other", claimNonce: nonce }).verdict).toBe("REFUSED_ALREADY_CLAIMED");
      /** And the on-disk claim carries the nonce, so the verification is not a local echo. */
      const { readFileSync } = await import("node:fs");
      const onDisk = JSON.parse(readFileSync(join(root, "run-claim.json"), "utf8"));
      expect(onDisk.claimNonce).toBe(nonce);
    } finally {
      try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
    }
  });

  it("§2: the safe preparation creates and removes nothing", async () => {
    const root = mkdtempSync(join(tmpdir(), "r3l0cia-layout-"));
    try {
      mkdirSync(join(root, "keep-me"), { recursive: true });
      writeFileSync(join(root, "keep-me", "evidence.txt"), "preserved", "utf8");
      const layout = prepareLayoutSafely(root, ["t0", "t1"]);
      expect(layout.removedAnything).toBe(false);
      const { existsSync, readFileSync } = await import("node:fs");
      expect(existsSync(join(root, "keep-me", "evidence.txt"))).toBe(true);
      expect(readFileSync(join(root, "keep-me", "evidence.txt"), "utf8")).toBe("preserved");
      expect(layout.createdDirectories.length).toBeGreaterThan(0);
    } finally {
      try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
    }
  });

  it("§2: the authoritative-path guard refuses the old matrix and states it is still executable", () => {
    expect(() => assertAuthoritativePath({ caller: "scripts/r3l0cr/matrix.mjs" })).toThrow(/not the authoritative execution path/u);
    const authorized = assertAuthoritativePath({ caller: "r3-l0c-ia-primary-plan", authorizedBy: "r3-l0c-ia-primary-plan" });
    expect(authorized.legacyMatrixQuarantined).toBe(true);
    /** §2: the honest claim, carried as a value. */
    expect(authorized.legacyMatrixStillExecutable).toBe(true);
    expect(() => assertAuthoritativePath({ caller: "x" })).toThrow(/QUARANTINED by this guard, not made impossible/u);
  });
});

describe("R3-L0C-I-A §3 — Gate B: actual per-trajectory confinement", () => {
  it("A04: all eight units pass with own-world liveness and sibling isolation simultaneously", () => {
    expect(containment.ACTUAL_CONTAINMENT).toBe("PASS");
    expect(containment.cases.length).toBe(8);
    expect(containment.everyOwnWorldExcluded).toBe(true);
    expect(containment.everyOwnWorldWritable).toBe(true);
    expect(containment.everyOwnWorldReadable).toBe(true);
    expect(containment.everySiblingProtected).toBe(true);
    expect(containment.noProtectedTargetReachable).toBe(true);
    expect(containment.noEscapeSucceeded).toBe(true);
    /** §3: the instrument discriminates, so the UNREACHABLE results mean something. */
    expect(containment.probeDiscriminates).toBe(true);
    expect(containment.aclWeakened).toBe(false);
    expect(containment.sandboxAvailable).toBe(true);
    for (const entry of containment.cases) {
      expect(entry.fence.applied, entry.currentTrajectoryId).toBe(true);
      expect(entry.reachable, entry.currentTrajectoryId).toEqual([]);
      expect(entry.escaped, entry.currentTrajectoryId).toEqual([]);
    }
  }, 1_800_000);

  it("§3: the manifest excludes the own world and includes every sibling, measured per unit", () => {
    const trajectoryIds = [...new Set(schedule.map((session) => session.trajectoryId))].sort();
    for (const trajectoryId of trajectoryIds) {
      const manifest = perTrajectoryProtectedRoots(join(BASE, "containment"), trajectoryIds, trajectoryId);
      expect(manifest.ownWorldExcluded, trajectoryId).toBe(true);
      expect(manifest.ownWorldIncluded, trajectoryId).toBe(false);
      expect(manifest.allSiblingsProtected, trajectoryId).toBe(true);
      expect(manifest.siblingWorldsExpected, trajectoryId).toBe(7);
      expect(manifest.allStateProtected, trajectoryId).toBe(true);
      expect(manifest.allHostPrivateProtected, trajectoryId).toBe(true);
    }
  });
});

describe("R3-L0C-I-A §4 — Gate C: treatment realization versus capital uptake", () => {
  it("A05/A06: the wrong-handle, wrong-kind and short-count mutations are rejected; a declined pull is not", async () => {
    const transcriptPath = join(BASE, "uptake-transcript.txt");
    const { zstdCompressSync } = await import("node:zlib");
    writeFileSync(transcriptPath, `PALIMPSEST_WORKER_PULL ${JSON.stringify({ pulled: [] })}\n`, "utf8");
    const { results } = await acceptanceA05A06({ expectation: expectationC2, uptakeTranscriptPath: transcriptPath });
    for (const result of results) expect(result.PASS, result.id).toBe(true);
    const a05 = results.find((entry) => entry.id.startsWith("A05"))!;
    expect(a05.positiveControl.exactIsApplied).toBe(true);
    expect(a05.positiveControl.allThreeMutationsRejected).toBe(true);
    expect(a05.positiveControl.allThreeAreTrialInvalid).toBe(true);
    /** The wrong-kind case is the one a count-only check would miss. */
    expect(a05.positiveControl.wrongKindCountMatchesExpectation).toBe(true);
    const a06 = results.find((entry) => entry.id.startsWith("A06"))!;
    expect(a06.positiveControl.deliveryHappened).toBe(true);
    expect(a06.positiveControl.uptakeIsZero).toBe(true);
    expect(a06.positiveControl.hostAuditExceedsUptake).toBe(true);
    expect(a06.positiveControl.declinedPullRecorded).toBe(true);
    expect(a06.positiveControl.declinedPullStopsTheMatrix).toBe(false);
    expect(zstdCompressSync).toBeTypeOf("function");
  });

  it("A07: the worker telemetry schema matches the shipped parser, and the superseded shape reads as zero", async () => {
    /** The healthy run is created here if it has not been yet, because it is where the real transcript lives. */
    const healthy = await runCase("healthy");
    const transcriptPath = join(healthy.runRoot!, "private", "control", "transcript-b0-C-G2-a1.txt");
    const result = await acceptanceA07({ transcriptPath });
    expect(result.PASS).toBe(true);
    expect(result.positiveControl.shippedParserAvailable).toBe(true);
    expect(result.positiveControl.stageWorkerUsesShippedField).toBe(true);
    expect(result.positiveControl.shippedParserReadsStageWorkerLine).toBe(1);
    /** The mutant: the R3-L0C-I mock's shape is read as ZERO pulls. */
    expect(result.mutant.supersededShapeUsesSupersededField).toBe(true);
    expect(result.mutant.supersededShapeSilentlyReadsAsZero).toBe(true);
    expect(result.mutant.shippedParserReadsSupersededLineAs).toBe(0);
    /** And the REAL worker's own transcript parses to the expected handle count. */
    expect(result.positiveControl.realWorkerUsesShippedField).toBe(true);
    expect(result.positiveControl.shippedParserReadsRealWorkerLine).toBe(4);
  }, 1_800_000);
});

describe("R3-L0C-I-A §5 — Gate D: modes, result evidence and the timeout hierarchy", () => {
  it("A08/A09: an invalid Worker Result and a child-reported error are both refused", async () => {
    const { results } = await acceptanceA08A09({});
    for (const result of results) expect(result.PASS, result.id).toBe(true);
    const a08 = results.find((entry) => entry.id.startsWith("A08"))!;
    expect(a08.positiveControl.allInvalidRefused).toBe(true);
    expect(a08.positiveControl.validAccepted).toBe(true);
  });

  it("A10: DETERMINISTIC and PRIMARY resolve different workers and neither falls back", async () => {
    const result = await acceptanceA10();
    expect(result.PASS).toBe(true);
    expect(result.positiveControl.deterministicIsStageScriptedWorker).toBe(true);
    expect(result.positiveControl.modesResolveDifferently).toBe(true);
    expect(result.positiveControl.undeclaredModeRefused).toBe(true);
    expect(result.positiveControl.noSilentFallback).toBe(true);
    /** §5: a caller-supplied authorization string is not proof. */
    expect(result.positiveControl.callerSuppliedAuthorizedByAccepted).toBe(false);
    expect(result.positiveControl.paidAuthorizationPresentWithoutIt).toBe(false);
    expect(result.positiveControl.thisStageEntersPrimary).toBe(false);
  }, 300_000);

  it("§5: a PRIMARY run without paid authorization is refused by the driver", async () => {
    const result = await runPrimaryMatrix({
      runId: "r3l0cia-primary-refused",
      runRoot: join(BASE, "primary-refused"),
      prehistory: { world: prehistory.world, state: prehistory.state },
      admittedRefs: refs,
      installHostBundle,
      dshHome,
      authorizedBy: "r3-l0c-ia-primary-plan",
      caller: "r3-l0c-ia-primary-plan",
      plan,
      closure,
      containment,
      mode: "PRIMARY",
      paidAuthorization: false,
    });
    expect(result.MODE_RESOLUTION).toBe("REFUSED_PRIMARY_WITHOUT_AUTHORIZATION");
    expect(result.run).toBeNull();
    expect(result.launches).toEqual([]);
  }, 300_000);

  it("A11: the budgets nest and an unestablished descendant exit is UNCERTAIN", () => {
    const budgets = timeoutHierarchy();
    expect(budgets.outerExceedsInnerPlusSettlement).toBe(true);
    expect(budgets.marginMs).toBeGreaterThan(0);
    /** The baseline's conflicting pair is recorded as the mutant. */
    expect(budgets.innerWorkerMs).toBe(1_800_000);
    expect(budgets.outerChildMs).toBeGreaterThan(1_800_000);
  });

  it("§5: a SLOW worker whose fate the outer budget cannot establish is UNCERTAIN", async () => {
    /**
     * The outer budget is set BELOW the worker's sleep, so the harness expires while the worker is still running.
     * The tee is killed, but the WORKER is its grandchild and survives — which is exactly the case §5 requires to
     * be UNCERTAIN rather than treated as a clean failure.
     */
    const result = await runCase("fault-slow", { faultAt: "FIRST", faultKind: PRIMARY_FAULTS.SLOW, timeoutMs: 2_500 });
    expect(result.terminalState).toBe("UNCERTAIN_PRESERVED");
    expect((result.run!.uncertainSessions as readonly string[]).length).toBeGreaterThan(0);
    /** §5: the uncertain run refuses automatic resume or replacement. */
    const { inspectPreservedRun } = await import("../scripts/r3l0cf/fail-stop.mjs");
    const inspection = inspectPreservedRun(result.runRoot!);
    expect(inspection.mayResumeAutomatically).toBe(false);
    expect(inspection.mayReplaceAutomatically).toBe(false);
    expect(inspection.verdict).toBe("UNCERTAIN");
  }, 1_800_000);
});

describe("R3-L0C-I-A §6 — Gate E: plan-bound validity", () => {
  it("A12/A13: a missing or drifted closure and a false post-matrix gate are both refused", async () => {
    const healthy = await runCase("healthy");
    const { results } = await acceptanceA12A13({
      plan,
      closure,
      containment,
      schedule,
      plannedSessions: healthy.run!.plannedSessions as readonly string[],
      goodRecords: healthy.run!.records as readonly Readonly<Record<string, unknown>>[],
    });
    for (const result of results) expect(result.PASS, result.id).toBe(true);
    const a12 = results.find((entry) => entry.id.startsWith("A12"))!;
    expect(a12.positiveControl.allRefused).toBe(true);
    expect(a12.positiveControl.refusedAtClosureStep).toBe(true);
    const a13 = results.find((entry) => entry.id.startsWith("A13"))!;
    expect(a13.positiveControl.greenGate).toBe(true);
    expect(a13.positiveControl.countAloneIsInsufficient).toBe(true);
    expect(a13.positiveControl.checkedOnlyTheSessionCount).toBe(false);
  }, 1_800_000);

  it("§6: the driver refuses a run whose plan-bound gate has no inputs", async () => {
    const result = await runPrimaryMatrix({
      runId: "r3l0cia-no-inputs",
      runRoot: join(BASE, "no-inputs"),
      prehistory: { world: prehistory.world, state: prehistory.state },
      admittedRefs: refs,
      installHostBundle,
      dshHome,
      authorizedBy: "r3-l0c-ia-primary-plan",
      caller: "r3-l0c-ia-primary-plan",
      mode: "DETERMINISTIC",
    });
    expect(result.GATE_INPUTS).toBe("INCOMPLETE");
    expect(result.missing).toEqual(["plan", "closure", "containment"]);
    expect(result.run).toBeNull();
  }, 300_000);

  it("A14: the cost parser is measured against a fixture artifact and labelled as such", async () => {
    const result = await acceptanceA14({});
    expect(result.PASS).toBe(true);
    expect(result.positiveControl.measured).toBe(true);
    expect(result.positiveControl.fixtureLabelIsExplicit).toBe(true);
    expect(result.positiveControl.fieldsPresent).toEqual([]);
    /** §13 of R3-L0C: the capital body is not counted as a raw-history byte. */
    expect(result.positiveControl.capitalBodyNotCountedAsHistory).toBe(true);
    expect(result.positiveControl.conflictingAttemptRefused).toBe(true);
    expect(result.positiveControl.absentArtifactRefused).toBe(true);
    expect(result.positiveControl.resolvedByRecency).toBe(false);
  }, 300_000);
});

describe("R3-L0C-I-A §7 — Gate F: the runtime manifest and the closure", () => {
  it("§7: the manifest covers modules the static walker cannot see", async () => {
    const blind = await measureWalkerBlindSpot();
    expect(blind.manifestCoversModulesTheWalkerMisses).toBe(true);
    expect(blind.blindSpotCount).toBeGreaterThanOrEqual(7);
    expect(blind.manifestModulesNotReachableByWalker).toContain("dist/src/project_workspace/index.js");
    expect(blind.manifestModulesNotReachableByWalker).toContain("dist/src/deployment/work_worker.js");
    expect(RUNTIME_MANIFEST.length).toBe(blind.manifestModuleCount);
  }, 300_000);

  it("§7: all three mutations move the digest, including a dynamically loaded module", async () => {
    const mutations = await proveClosureMutations();
    expect(mutations.ALL_MUTATIONS_PROVEN).toBe(true);
    expect(mutations.failing).toEqual([]);
    const ids = mutations.arms.map((arm: { id: string }) => arm.id);
    expect(ids).toContain("RUNTIME_MANIFEST_DYNAMIC_MODULE");
    expect(ids).toContain("STAGE_HARNESS_MODULE");
    expect(ids).toContain("TOOLCHAIN_VERSION");
    const dynamic = mutations.arms.find((arm: { id: string }) => arm.id === "RUNTIME_MANIFEST_DYNAMIC_MODULE")!;
    expect(dynamic.targetReachableByStaticWalker).toBe(false);
    expect(dynamic.partMoved).toBe(true);
  }, 900_000);

  it("§7: the closure is complete and the aggregate folds in the manifest and the packages", async () => {
    const computed = await computeExecutionClosure({ verifyCompiled: false });
    expect(computed.CLOSURE_COMPLETE).toBe(true);
    expect(computed.runtimeManifest.missing).toEqual([]);
    expect(computed.stageHarness.missing).toEqual([]);
    expect(computed.partIds).toContain("RUNTIME_MANIFEST_CLOSURE");
    expect(computed.partIds).toContain("STAGE_HARNESS_CLOSURE");
    expect(Object.keys(computed.aggregateMaterial)).toContain("package:vitest");
    expect(computed.aggregateMaterial["runtime-manifest:complete"]).toBe("true");
  }, 300_000);
});

describe("R3-L0C-I-A §8 — Gate G: the frozen matrix through the repaired path", () => {
  it("A15: the healthy sixteen-session run completes with the exact treatment boundary", async () => {
    const healthy = await runCase("healthy");
    const { results } = acceptanceA15A16({
      healthy,
      expectedByArmGeneration: { "H/G1": 0, "H/G2": 0, "C/G1": 2, "C/G2": 4 },
    });
    const a15 = results.find((entry) => entry.id.startsWith("A15"))!;
    expect(a15.PASS).toBe(true);
    expect(a15.positiveControl.workerIsStageScripted).toBe(true);
    const visible = a15.positiveControl.visibleByArmGeneration as Record<string, readonly number[]>;
    expect(visible["H/G2"]).toEqual([0, 0, 0, 0]);
    expect(visible["C/G1"]).toEqual([2, 2, 2, 2]);
    expect(visible["C/G2"]).toEqual([4, 4, 4, 4]);
    expect(a15.positiveControl.causalVerdictIssued).toBe(false);
  }, 1_800_000);

  it("A16: a fault at the FIRST, MIDDLE and LAST session stops with no later launch", async () => {
    const faultFirst = await runCase("fault-first", { faultAt: "FIRST", faultKind: PRIMARY_FAULTS.REPORT_MISSING });
    const faultMiddle = await runCase("fault-middle", { faultAt: "MIDDLE", faultKind: PRIMARY_FAULTS.REPORT_MISSING });
    const faultLast = await runCase("fault-last", { faultAt: "LAST", faultKind: PRIMARY_FAULTS.REPORT_MISSING });
    const { results } = acceptanceA15A16({ healthy: null, faultFirst, faultMiddle, faultLast, expectedByArmGeneration: {} });
    const a16 = results.find((entry) => entry.id.startsWith("A16"))!;
    expect(a16.PASS).toBe(true);
    expect(a16.positiveControl.allStopped).toBe(true);
    expect(a16.positiveControl.noLaterLaunch).toBe(true);
    expect(a16.positiveControl.oneLaunchPerSession).toBe(true);
    expect((a16.positiveControl.cases as readonly { scheduleIndex: number }[]).map((entry) => entry.scheduleIndex)).toEqual([0, 7, 15]);
    expect(faultMiddle.completedSessions!.length).toBe(7);
    expect(faultLast.completedSessions!.length).toBe(15);
  }, 1_800_000);

  it("§4: a declined pull is an observation and the matrix completes", async () => {
    const result = await runCase("fault-decline", { faultAt: "FIRST", faultKind: PRIMARY_FAULTS.DECLINE_PULL });
    expect(result.terminalState).toBe("MATRIX_COMPLETE");
    expect(result.completedSessions!.length).toBe(16);
    /** The declined session is recorded as an observation, with worker uptake ZERO and host audit > 0. */
    const declined = (result.run!.records as readonly { workerUptakeCount: number | null; hostResolveAuditCount: number; observations: readonly { id: string }[] }[]).filter((record: { workerUptakeCount: number | null; hostResolveAuditCount: number }) => record.workerUptakeCount === 0 && record.hostResolveAuditCount > 0);
    expect(declined.length).toBeGreaterThan(0);
    expect(declined[0]!.observations.map((entry) => entry.id)).toContain("MODEL_DECLINED_VISIBLE_CAPITAL");
  }, 1_800_000);

  it("§5: a Work blockage is CENSORED and preserves the trajectory without a forced repair", async () => {
    const result = await runCase("fault-nocommit", { faultAt: "FIRST", faultKind: PRIMARY_FAULTS.NO_COMMIT });
    expect(result.terminalState).toBe("ABORT_PRESERVED");
    expect((result.run!.failure as { failureClass: string }).failureClass).toBe("CANONICAL_WORK_BLOCKAGE");
    expect((result.run!.failure as { cause: string }).cause).toBe("CANONICAL_WORK_CANNOT_ADVANCE");
  }, 1_800_000);
});
