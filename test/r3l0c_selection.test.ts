/**
 * R3-L0C §9/§10/§17 — THE CAPITAL DELIVERY BOUNDARY TEST.
 *
 * This is the test that would have caught the defect the first run exposed, and it is the only place the C
 * boundary is proven, because it is the only place it CAN be: a selection compiles handles only against a
 * project whose associations exist, so a dummy fixture refuses it with `KNOWLEDGE_NOT_PROJECT_ASSOCIATED`.
 *
 * THE DEFECT IT EXISTS FOR. The first primary run sent its selection as `{ handles: [...] }`. The host contract
 * is `KnowledgeSelectionRequest = { proof?, reasoning?, procedure? }`, so the unknown field was IGNORED: the
 * delegation accepted the request, the attempt reported `knowledgeSelected: true`, and NO handle was compiled.
 * All 16 sessions ran with an empty capital surface and the treatment was never delivered. No host-side signal
 * reported a problem; the failure was visible only at the CONSUMER BOUNDARY.
 *
 * SO THIS TEST DRIVES THE REAL GENERATION CHILD, against the REAL prehistory, with a REAL selection, and asserts
 * that handles reach the payload the consumer was handed and that the governed pull returns a canonical body.
 * A test that asserted the selection object instead would have passed while the defect was live.
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { admitCapital, selectionRefs } from "../scripts/r3l0c/prehistory.mjs";
import { buildPrehistory } from "../scripts/r3l0c/build-prehistory.mjs";
import { selectionFor } from "../scripts/r3l0c/capital.mjs";
import { acquireLease } from "../scripts/r3l0c/run-root.mjs";
import { TEE_PATH, makeProfile, prepareTrajectory, runProtectedRoots, trajectoryHome } from "../scripts/r3l0c/trajectory.mjs";
import { buildIsolatedLayout } from "../scripts/r3l0b/containment.mjs";
import { dshBin, dshHome, installHostBundle } from "../scripts/gates/env.mjs";
import { PRIMARY_EXECUTOR } from "../scripts/r3l0c/plan.mjs";

const REPO_ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, "$1");
const BASE = join(tmpdir(), "palimpsest-r3l0c-selection");
const CHILD = join(REPO_ROOT, "scripts", "r3l0c", "generation-child.mjs");

/** The evidence this file produces, so the assertions can run once and be read many times. */
let evidence: Record<string, unknown> = {};

describe("R3-L0C §9/§10 — the capital delivery boundary", () => {
  it("drives one real generation with a real selection and reads the consumer boundary", async () => {
    rmSync(BASE, { recursive: true, force: true });
    const prehistory = await buildPrehistory(BASE);
    const admitted = await admitCapital(BASE, prehistory.paths, "cutover-entitlements", prehistory.world);
    const refs = selectionRefs(admitted);
    const selection = selectionFor("C", "G1", refs);

    /** §9: the selection must use the owner shape, which is the defect this file pins. */
    expect(Object.keys(selection as object).sort()).toEqual(["procedure", "proof", "reasoning"]);

    const lease = acquireLease({ runId: "run-selection-test", label: "selection" });
    const runRoot = lease.root;
    const trajectoryId = "b0-C";
    buildIsolatedLayout(runRoot, [trajectoryId]);
    const { world, paths } = prepareTrajectory(runRoot, trajectoryId, prehistory);
    const home = trajectoryHome(runRoot, trajectoryId);
    makeProfile(home, PRIMARY_EXECUTOR, "r3l0cseltest", installHostBundle, dshHome);

    const control = join(runRoot, "private", "control");
    mkdirSync(control, { recursive: true });
    const specPath = join(control, "spec.json");
    const reportPath = join(control, "report.json");
    const payloadSink = join(control, "payload.json");
    writeFileSync(specPath, JSON.stringify({
      repoRoot: REPO_ROOT,
      projectId: "cutover-entitlements",
      repo: world,
      paths,
      dshHome: home,
      realDshBin: dshBin(),
      profile: "r3l0cseltest",
      teePath: TEE_PATH,
      payloadSink,
      transcript: join(control, "transcript.txt"),
      workRoot: runRoot,
      reportPath,
      protectedRoots: runProtectedRoots(runRoot, [trajectoryId], trajectoryId).join(";"),
      arm: "C",
      block: 0,
      trajectoryId,
      generation: "G1",
      requirement: "Add resolveEntitlement(store, tenantId, capability, atDate) honouring the Project recorded precedence rules.",
      objective: "apply I1",
      projectGoal: "keep tenant entitlements correct across the legacy cutover",
      knowledge: selection,
      modelId: PRIMARY_EXECUTOR.modelId,
      standard: { statement: "the visible oracle passes", clauses: [{ kind: "scope_respected" }], derivedFrom: ["selection test"], confirmed: true, notes: [] },
    }, null, 2), "utf8");

    let threw: string | null = null;
    try {
      execFileSync(process.execPath, [CHILD, specPath], { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024, timeout: 2_400_000, env: { ...process.env, PALIMPSEST_WORKER_PROTECTED_ROOTS: runProtectedRoots(runRoot, [trajectoryId], trajectoryId).join(";") } });
    } catch (error) {
      threw = String((error as { message?: string }).message ?? error).slice(0, 300);
    }
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    evidence = { report, threw, selection, refs, runRoot };
    lease.release();
  }, 2_400_000);

  it("§9 the generation ran to completion", () => {
    const report = evidence.report as { ok: boolean; jobPhase: string };
    expect(evidence.threw).toBeNull();
    expect(report.ok, `the child reported ok=false: ${String((evidence.report as { error?: string }).error).slice(0, 300)}`).toBe(true);
    expect(report.jobPhase).toBe("FINISHED");
  });

  it("§10 the handles reached the CONSUMER BOUNDARY — the measurement that caught the defect", () => {
    const report = evidence.report as { payload: { compiledHandleCount: number; handles: readonly { handle: string }[] } | null };
    expect(report.payload).not.toBeNull();
    expect(report.payload!.compiledHandleCount, "no handle was compiled, so the treatment was not delivered").toBeGreaterThan(0);
    expect(report.payload!.handles.length).toBe(report.payload!.compiledHandleCount);
  });

  it("§10 the compiled handles are exactly the ones the frozen selection named", () => {
    const report = evidence.report as { payload: { handles: readonly { handle: string }[] } | null };
    const compiled = report.payload!.handles.map((entry) => entry.handle);
    const expected = (evidence.refs as readonly { invariant: string; handle: string }[]).filter((entry) => entry.invariant === "I1").map((entry) => entry.handle);
    expect(expected.length).toBeGreaterThan(0);
    for (const handle of expected) expect(compiled, `${handle} was selected but not compiled`).toContain(handle);
  });

  it("§17 the governed pull returned a canonical body for every handle", () => {
    const report = evidence.report as { governedPulls: readonly { handle: string; resolved: boolean; bodyBytes: number; bodyDigest: string | null }[] };
    expect(report.governedPulls.length).toBeGreaterThan(0);
    for (const pull of report.governedPulls) {
      expect(pull.resolved, `${pull.handle} did not resolve`).toBe(true);
      expect(pull.bodyBytes, `${pull.handle} returned an empty body`).toBeGreaterThan(0);
      expect(pull.bodyDigest, `${pull.handle} has no body digest`).toMatch(/^[0-9a-f]{64}$/u);
    }
  });

  it("§17 the reasoning and procedure halves were BOTH delivered, so neither was silently lost", () => {
    const report = evidence.report as { governedPulls: readonly { handle: string }[] };
    const handles = report.governedPulls.map((entry) => entry.handle).join(" ");
    expect(handles, "no reasoning handle was delivered").toContain("@ctx/reasoning/");
    expect(handles, "no procedure handle was delivered").toContain("@ctx/procedure/");
  });

  afterAll(() => {
    /**
     * Windows refuses to remove a directory while a SQLite handle is still open, and the child's stores are
     * closed asynchronously. The removal is therefore best-effort with retries: a leaked directory is the test
     * runner's global hygiene sweep's business, and failing a PASSING test over cleanup would be a false alarm.
     */
    try {
      rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      /* the temp hygiene sweep collects it */
    }
  });
});
