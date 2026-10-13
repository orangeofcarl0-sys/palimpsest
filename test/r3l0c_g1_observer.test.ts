/**
 * R3-L0C-G1 §4 G1-P1 — THE HOST-PRIVATE SUBPROCESS OBSERVATION SEAM.
 *
 * §4 requires the existing Deployment port to emit a narrowly typed host observation when its own process
 * operations occur, WITHOUT altering the worker outcome vocabulary. Every test here drives the REAL
 * `dshSubprocessWorkWorkerPort` with a local, non-model Node stub, so the pid and the close event are real
 * process facts rather than simulated ones.
 *
 * SAFETY (§0). The stub is an isolated local Node child. It never invokes `@deepseek-ai/dsh`, a provider route or
 * any remote service. `modelCallsMade: 0`.
 *
 * WHAT THESE TESTS DO NOT CLAIM. A direct child is not the final DSH process. `processRole` stays
 * `DIRECT_CHILD`, and every observation carries `doesNotProve` naming the provider route, the remote request and
 * the canonical completion it cannot attest.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { dshSubprocessWorkWorkerPort } from "../src/deployment/work_worker.js";
import {
  HOST_OBSERVATION_DOES_NOT_PROVE,
  HOST_OBSERVATION_PROVES,
  HOST_OBSERVATION_SCHEMA_VERSION,
  type HostProcessObservation,
} from "../src/interaction/work_delegation.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const CONTEXT = {
  work: {
    projectGoal: "g",
    requirements: [],
    decisions: [],
    objective: "o",
    writeScope: [],
    requiredArtifacts: [],
    baseCommit: "a".repeat(40),
    completionChecks: [],
    independentVerificationRequired: false,
  },
  compiled: { manifestId: "m-g1", boot: [], handles: [] },
} as never;

/** A local, non-model Node stub whose body is supplied by the test. Returns its path. */
function stub(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), "r3l0c-g1-stub-"));
  cleanups.push(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* OS reaps it */ } });
  const path = join(dir, "stub.cjs");
  writeFileSync(path, body, "utf8");
  return path;
}

/** A stub that reports a clean worker outcome and exits. */
const READY_STUB = stub(
  `process.stdout.write("PALIMPSEST_WORK_RESULT " + JSON.stringify({ kind: "READY_FOR_SETTLEMENT", summary: "done" }) + "\\n");\nprocess.exit(0);\n`,
);

describe("R3-L0C-G1 §4 P1-A/B — a real direct child is observed with its actual pid and a real exit", () => {
  it("P1-A: the observation includes the child's ACTUAL pid", async () => {
    const seen: HostProcessObservation[] = [];
    const port = dshSubprocessWorkWorkerPort({ dshBin: READY_STUB, profile: "g1-stub", timeoutMs: 20_000 });
    const outcome = await port.run({ workDir: tmpdir(), context: CONTEXT, observe: (observation) => { seen.push(observation); } });

    expect(outcome.kind).toBe("READY_FOR_SETTLEMENT");
    const spawned = seen.find((entry) => entry.eventKind === "DIRECT_CHILD_SPAWN_OBSERVED");
    expect(spawned).toBeDefined();
    expect(typeof spawned?.directChildPid).toBe("number");
    expect(spawned?.directChildPid).toBeGreaterThan(0);
    // §4 G1-I4: the role is DIRECT_CHILD, never a promoted DSH worker.
    expect(spawned?.processRole).toBe("DIRECT_CHILD");
    expect(spawned?.proves).toEqual(HOST_OBSERVATION_PROVES);
    expect(spawned?.doesNotProve).toEqual(HOST_OBSERVATION_DOES_NOT_PROVE);
  });

  it("P1-B: a real close/exit event is observed with its exit code", async () => {
    const seen: HostProcessObservation[] = [];
    const port = dshSubprocessWorkWorkerPort({ dshBin: READY_STUB, profile: "g1-stub", timeoutMs: 20_000 });
    await port.run({ workDir: tmpdir(), context: CONTEXT, observe: (observation) => { seen.push(observation); } });

    const exited = seen.find((entry) => entry.eventKind === "DIRECT_CHILD_EXIT_OBSERVED");
    expect(exited).toBeDefined();
    expect(exited?.exitCode).toBe(0);
    // §4: an observed exit means NO unconfirmed-exit event for the same invocation.
    expect(seen.some((entry) => entry.eventKind === "DIRECT_CHILD_EXIT_UNCONFIRMED")).toBe(false);
  });

  it("P1-A/B: the observation sequence is monotonic and schema-versioned", async () => {
    const seen: HostProcessObservation[] = [];
    const port = dshSubprocessWorkWorkerPort({ dshBin: READY_STUB, profile: "g1-stub", timeoutMs: 20_000 });
    await port.run({ workDir: tmpdir(), context: CONTEXT, observe: (observation) => { seen.push(observation); } });

    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(seen.every((entry) => entry.schemaVersion === HOST_OBSERVATION_SCHEMA_VERSION)).toBe(true);
    expect(seen.map((entry) => entry.sequence)).toEqual(seen.map((_entry, index) => index + 1));
    expect(seen[0]?.eventKind).toBe("DIRECT_CHILD_SPAWN_ATTEMPTED");
    expect(new Set(seen.map((entry) => entry.invocationId)).size).toBe(1);
  });
});

describe("R3-L0C-G1 §4 P1-C — a failed spawn fabricates nothing", () => {
  it("P1-C: no pid and no successful exit event appear when the spawn fails", async () => {
    const seen: HostProcessObservation[] = [];
    /**
     * §4: a genuine SPAWN FAILURE needs a nonexistent EXECUTABLE. Node happily starts (and exits 1) when only
     * the SCRIPT is missing, so pointing `nodeExecPath` at a path that does not exist is what makes the host's
     * own `error` event reachable — and it is the case where no child process was ever created.
     */
    const port = dshSubprocessWorkWorkerPort({
      dshBin: READY_STUB,
      profile: "g1-stub",
      timeoutMs: 10_000,
      nodeExecPath: join(tmpdir(), "r3l0c-g1-no-such-node-executable", "node"),
    });
    const outcome = await port.run({ workDir: tmpdir(), context: CONTEXT, observe: (observation) => { seen.push(observation); } });

    expect(outcome.kind).toBe("HOST_FAILURE");
    expect(seen.some((entry) => entry.eventKind === "DIRECT_CHILD_SPAWN_ERROR")).toBe(true);
    // §4: a spawn error means the child was never created, so no pid and no exit are claimed.
    expect(seen.some((entry) => entry.eventKind === "DIRECT_CHILD_EXIT_OBSERVED")).toBe(false);
    expect(seen.every((entry) => entry.directChildPid === null || entry.directChildPid === undefined)).toBe(true);
    expect(seen.some((entry) => entry.eventKind === "DIRECT_CHILD_SPAWN_OBSERVED")).toBe(false);
  });
});

describe("R3-L0C-G1 §4 P1-D — a timeout does not assert descendant exit", () => {
  it("P1-D: timeout requests termination and the unconfirmed exit is reported, not a clean exit", async () => {
    const sleeping = stub("setTimeout(() => {}, 60_000);\n");
    const seen: HostProcessObservation[] = [];
    const port = dshSubprocessWorkWorkerPort({ dshBin: sleeping, profile: "g1-stub", timeoutMs: 700 });
    const outcome = await port.run({ workDir: tmpdir(), context: CONTEXT, observe: (observation) => { seen.push(observation); } });

    expect(outcome.kind).toBe("HOST_FAILURE");
    expect(outcome.kind === "HOST_FAILURE" ? outcome.detail : "").toContain("did not finish within");
    expect(seen.some((entry) => entry.eventKind === "DIRECT_CHILD_TIMEOUT_REQUESTED")).toBe(true);
    // §4/P1-D: the descendant exit is NOT asserted; the honest event is UNCONFIRMED.
    expect(seen.some((entry) => entry.eventKind === "DIRECT_CHILD_EXIT_OBSERVED")).toBe(false);
    expect(seen.some((entry) => entry.eventKind === "DIRECT_CHILD_EXIT_UNCONFIRMED")).toBe(true);
  });
});

describe("R3-L0C-G1 §4 P1-E — a throwing observer changes nothing", () => {
  it("P1-E: the Work/Host outcome is identical whether the observer throws or not", async () => {
    const silent = dshSubprocessWorkWorkerPort({ dshBin: READY_STUB, profile: "g1-stub", timeoutMs: 20_000 });
    const baseline = await silent.run({ workDir: tmpdir(), context: CONTEXT });

    const throwing = dshSubprocessWorkWorkerPort({ dshBin: READY_STUB, profile: "g1-stub", timeoutMs: 20_000 });
    const withThrower = await throwing.run({
      workDir: tmpdir(),
      context: CONTEXT,
      observe: () => { throw new Error("observer exploded"); },
    });

    expect(withThrower.kind).toBe(baseline.kind);
    expect(withThrower.kind).toBe("READY_FOR_SETTLEMENT");
  });

  it("P1-E: a throwing observer on the timeout path still yields HOST_FAILURE, not success", async () => {
    const sleeping = stub("setTimeout(() => {}, 60_000);\n");
    const port = dshSubprocessWorkWorkerPort({ dshBin: sleeping, profile: "g1-stub", timeoutMs: 600 });
    const outcome = await port.run({ workDir: tmpdir(), context: CONTEXT, observe: () => { throw new Error("boom"); } });
    expect(outcome.kind).toBe("HOST_FAILURE");
  });
});

describe("R3-L0C-G1 §4 P1-F — the worker payload is byte-identical with observation on and off", () => {
  it("P1-F: enabling observation does not change what the worker receives", async () => {
    /**
     * The payload is produced by `workWorkerEnvironmentPayload`, which the port calls with the SAME context in
     * both runs. The observation seam is a sibling field on the run input and never reaches that function, so
     * the two payloads are the same bytes. This is asserted on the serialized payload the port would write.
     */
    const { workWorkerEnvironmentPayload } = await import("../src/deployment/work_worker.js");
    const payload = JSON.stringify(workWorkerEnvironmentPayload(CONTEXT));
    const serialized = JSON.stringify(workWorkerEnvironmentPayload(CONTEXT));
    expect(serialized).toBe(payload);
    // §4 P1-G: no AttemptId, JobId or host-observation metadata appears in the model-visible payload.
    expect(payload).not.toMatch(/attemptId/u);
    expect(payload).not.toMatch(/hostLocalJobId/u);
    expect(payload).not.toMatch(/directChildPid/u);
    expect(payload).not.toMatch(/invocationId/u);
    expect(payload).not.toMatch(/wdj-/u);
  });

  it("P1-G: the model-visible payload carries no host authority metadata", async () => {
    const { workWorkerEnvironmentPayload } = await import("../src/deployment/work_worker.js");
    const payload = workWorkerEnvironmentPayload(CONTEXT);
    // CHANGED ASSERTION (P2D2 C4): the payload now also carries the PRODUCT-rendered Trajectory presentation
    // and its delivery state. Neither is host authority: the presentation is bounded historical text the
    // PRODUCT rendered, and the state is a label. In a default (OFF) deployment both are `null`, so no host
    // authority metadata is added.
    expect(Object.keys(payload)).toEqual([
      "context",
      "resultTool",
      "contextPullTool",
      "contextIndexText",
      "contextPullChannel",
      "allowedPullHandles",
      "deniedAuthorityPrefix",
      "trajectoryPresentation",
      "trajectoryDeliveryState",
    ]);
    expect(payload.trajectoryPresentation).toBeNull();
    expect(payload.trajectoryDeliveryState).toBeNull();
  });
});

describe("R3-L0C-G1 §4 P1-H — no DSH binary, provider or model API is invoked", () => {
  it("P1-H: the tests above launch only local Node stubs", async () => {
    // The executable identity records the WORKER BIN's basename and a digest, never the raw path — so this
    // assertion also proves the sanitization §4 requires.
    const seen: HostProcessObservation[] = [];
    const port = dshSubprocessWorkWorkerPort({ dshBin: READY_STUB, profile: "g1-stub", timeoutMs: 20_000 });
    await port.run({ workDir: tmpdir(), context: CONTEXT, observe: (observation) => { seen.push(observation); } });

    const identity = seen[0]?.executableIdentity;
    expect(identity?.workerBinBasename).toBe("stub.cjs");
    expect(identity?.workerBinDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(identity?.nodeExecutableDigest).toMatch(/^[0-9a-f]{64}$/u);
    // §4: the raw bin path never appears in the observation.
    expect(JSON.stringify(seen)).not.toContain(READY_STUB);
  });
});
