/**
 * Trajectory-P2-D0 §5 — BASELINE FALSIFIERS F1–F18.
 *
 * Each test pins a fact TRUE at the P2-D0 baseline (HEAD 234d040) that P2-D0 must change. Findings are
 * classified as the ruling requires:
 *
 *   DYNAMICALLY_REPRODUCED  the case was actually executed against the shipped code
 *   SOURCE_DEMONSTRATED     the claim is read from the actual source
 *   NOT_ESTABLISHED         could not be established
 *
 * Static source reasoning is NEVER reported as a dynamic reproduction. The source-level findings live in
 * `scripts/trajectory_p2d0/source-map.mjs` and `research-evidence/trajectory-p2d0/baseline-falsifiers.json`;
 * the tests here reproduce the cases that CAN be executed against the shipped code without a DSH runtime.
 *
 * The mandatory REAL Parent-IPC preservation gate (§6.4) is a controlled Node ChildProcess test and is
 * established in C2 (`trajectory_p2d0_ipc_preservation.test.ts`); the F1 case here reproduces the
 * tracker→sink→recorder logic that the port itself drives, which is the layer the defect lives in.
 *
 * SAFETY. In-memory/temp SQLite; no DSH, no model, no network, no personal data.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import { GitCliPort } from "../src/effects/index.js";
import {
  SqliteExecutionAssociationStore,
  computeTrustedSourceBasis,
  createExecutionAssociationRecorder,
  makeAssociationQualifier,
  registryFromSingleBasis,
  type TrustedSourceBasis,
} from "../src/execution_association/index.js";
import { makeWorkerSessionIdentityTracker } from "../src/interaction/work_delegation.js";
import type { CorrelatedSessionIdentityObservation as Correlated } from "../src/interaction/work_delegation.js";

const REPO = process.cwd();
const readRepo = (relative: string): string | null => {
  const path = join(REPO, relative);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
};

const BASIS: TrustedSourceBasis = computeTrustedSourceBasis({ adapterId: "a", workerBin: "/bin/dsh.js", nodeExecPath: "/bin/node.exe" });
const PROJECT = "p2d0-falsifiers";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

/** A real canonical Work Attempt through the REAL product install, so admission is not a fixture. */
function makeStack(projectId: string): { repo: string; head: string; installed: ReturnType<typeof installPalimpsest> } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-p2d0-"));
  const repo = join(root, "repo");
  const { mkdirSync, writeFileSync } = require("node:fs") as typeof import("node:fs");
  const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "a.ts"), "export const a = 1;\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: repo });
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* windows keeps the directory busy; the OS reaps it */
    }
  });
  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId,
      databasePath: join(repo, ".palimpsest", "p.sqlite"),
      ordariumDatabasePath: join(repo, ".palimpsest", "o.sqlite"),
      repository: repo,
      git: new GitCliPort(repo, join(repo, ".palimpsest", "worlds")),
      execution: "worktree",
      standard: {
        statement: "tests pass and scope respected",
        clauses: [
          { kind: "command_succeeds" as const, command: ["node", "-e", "process.exit(0)"], predicate: "tests_pass" as const },
          { kind: "scope_respected" as const },
        ],
        derivedFrom: ["p2d0 fixture"],
        confirmed: true,
        notes: [],
      },
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
    } as never,
  );
  cleanups.push(() => void installed.dispose());
  return { repo, head, installed };
}

async function prepareAttempt(installed: ReturnType<typeof installPalimpsest>, projectId: string, head: string): Promise<string> {
  installed.controller.start({
    projectId,
    goal: "make the project tidy",
    headCommit: head,
    tasks: [{ task_id: "t1", objective: "tidy a", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] }],
  });
  const prepared = await installed.controller.prepareMutatingWork({ expectedTaskId: "t1" });
  return prepared.attemptId;
}

/** The canonical Work revalidation the product composition supplies, bound to the real controller. */
function workPortOf(installed: ReturnType<typeof installPalimpsest>, projectId: string) {
  return {
    readAttempt: ({ attemptId }: { readonly attemptId: string }) => {
      const record = installed.controller.attemptWorkRecord(attemptId);
      return record === null
        ? ({ ok: false as const, reason: "no canonical attempt" })
        : ({ ok: true as const, taskId: record.taskId, state: record.state, creationEventId: "ev-1" });
    },
  };
}

const emptyProjectEvolution = async () =>
  ({
    projectionRootId: null, projectionSemanticDigest: null, workSequence: null, workEventDigest: null,
    projectIrRevision: null, selectedRelations: [], quarantinedRelations: [], unresolvedReferences: [],
    currentnessCaveats: [], basisCompleteness: null, failureOrigin: null, failureKind: null,
  }) as never;

const headerOk = async (sessionId: string) => ({
  readState: "READ_OK" as const,
  header: { sessionId, version: 4, createdAt: 1, cwd: null, parentSession: null, isSeeded: false, origin: null, delegationDepth: null },
  detail: "fixture",
});

/**
 * The EXACT chain the shipped port drives (src/deployment/work_worker.ts `spawned.on("message")`):
 * observe the report, then read the tracker's `observation` and hand it to the sink. Reproducing it
 * here rather than calling `recordIdentity` three times is what makes this a test of the transport
 * logic and not merely of the recorder.
 */
function observeThroughTracker(input: { invocationId: string; sessionIds: readonly string[] }): readonly Correlated[] {
  const tracker = makeWorkerSessionIdentityTracker({ invocationId: input.invocationId });
  const correlated: Correlated[] = [];
  for (const sessionId of input.sessionIds) {
    tracker.observe({ sessionId, directChildPid: 7, sourceQualification: "FIRST_PARTY_DSH_QUALIFIED" });
    const observation = tracker.observation;
    if (observation === null) continue;
    correlated.push(
      Object.freeze({
        hostLocalJobId: "wdj-00000000000000000000000000000001",
        attemptId: "attempt-a",
        observation,
      }) as Correlated,
    );
  }
  return Object.freeze(correlated);
}

/* ================================================================== F1 identity preservation */

describe("P2D0 F1 — the Parent-observed A/B/C conflict disappears before durability", () => {
  it("the tracker collapses three distinct reports to ONE observation whose id is always the first", () => {
    const correlated = observeThroughTracker({ invocationId: "wpi-1", sessionIds: ["worker-A", "worker-B", "worker-C"] });
    // The port reports the tracker's `observation` on EVERY message; the tracker rebuilds it in place, so
    // the three reports all carry the SAME dshSessionId (the first) and differ only in the conflict field.
    expect(correlated).toHaveLength(3);
    expect(correlated.map((entry) => entry.observation.dshSessionId)).toEqual(["worker-A", "worker-A", "worker-A"]);
    expect(correlated.map((entry) => entry.observation.observationState)).toEqual(["OBSERVED", "CONFLICT", "CONFLICT"]);
  });

  it("the recorder persists ONLY the first identity, so the durable candidate set is {A} not {A,B,C}", () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = createExecutionAssociationRecorder({ store, projectId: PROJECT, sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    for (const entry of observeThroughTracker({ invocationId: "wpi-1", sessionIds: ["worker-A", "worker-B", "worker-C"] })) {
      recorder.recordIdentity(entry);
    }
    const durable = store.replayForAttempt({ projectId: PROJECT, attemptId: "attempt-a" }).filter((event) => event.type === "SESSION_IDENTITY_OBSERVED");
    const distinct = [...new Set(durable.map((event) => (event.payload as { dshSessionId: string }).dshSessionId))];
    // THE DEFECT: B and C were really observed by the Parent and are gone from durable evidence.
    expect(distinct).toEqual(["worker-A"]);
    expect(distinct).not.toContain("worker-B");
    expect(distinct).not.toContain("worker-C");
    store.close();
  });
});

/* ================================================================== F2 mixed-invocation selection */

describe("P2D0 F2 — one qualified + one incomplete Invocation reports SELECTED_UNIQUE", () => {
  it("selectInvocation returns SELECTED_UNIQUE without consulting the unresolved alternatives", async () => {
    const { composeAttributedPreview } = await import("../src/composition/attributed_preview.js");
    const stack = makeStack(PROJECT);
    const attemptId = await prepareAttempt(stack.installed, PROJECT, stack.head);
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = createExecutionAssociationRecorder({ store, projectId: PROJECT, sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    // I-1 is complete and qualifies; I-2 has an observation but no finalization, so it is INCOMPLETE.
    recorder.recordIdentity(Object.freeze({ hostLocalJobId: "", attemptId, observation: Object.freeze({ invocationId: "wpi-1", dshSessionId: "worker-X", source: "DIRECT_CHILD_IPC_REPORT", sourceQualification: "FIRST_PARTY_DSH_QUALIFIED", directChildPid: 7 }) }));
    recorder.finalizeInvocation({ attemptId, invocationId: "wpi-1", closeReason: "INVOCATION_RETURNED" });
    recorder.recordIdentity(Object.freeze({ hostLocalJobId: "", attemptId, observation: Object.freeze({ invocationId: "wpi-2", dshSessionId: "worker-Y", source: "DIRECT_CHILD_IPC_REPORT", sourceQualification: "FIRST_PARTY_DSH_QUALIFIED", directChildPid: 8 }) }));

    const qualifier = makeAssociationQualifier({
      store,
      registry: registryFromSingleBasis(BASIS, "FIRST_PARTY_DSH_HOST"),
      work: workPortOf(stack.installed, PROJECT),
      dsh: { readHeaderIdentity: headerOk },
    });
    const service = composeAttributedPreview({
      projectId: PROJECT,
      controller: stack.installed.controller as never,
      promotions: stack.installed.controller.promotions as never,
      qualifier,
      store,
      sessionReader: undefined,
      projectEvolutionOf: emptyProjectEvolution,
    });
    const result = await service.previewAttempt({ attemptId });
    // THE DEFECT: the whole-invocation set has an unresolved member, yet the selection is SELECTED_UNIQUE.
    expect(result.selection.state).toBe("SELECTED_UNIQUE");
    expect(result.selection.detail).toContain("no unresolved alternative exists");
    store.close();
  });
});

/* ================================================================== F6 attempt-wide finalization */

describe("P2D0 F6 — one Job's terminal closes every Invocation of the Attempt", () => {
  it("finalizeAttempt closes BOTH invocations when only one Job finished", () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = createExecutionAssociationRecorder({ store, projectId: PROJECT, sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    recorder.recordIdentity(Object.freeze({ hostLocalJobId: "", attemptId: "attempt-a", observation: Object.freeze({ invocationId: "wpi-1", dshSessionId: "worker-X", source: "DIRECT_CHILD_IPC_REPORT", sourceQualification: "FIRST_PARTY_DSH_QUALIFIED", directChildPid: 7 }) }));
    recorder.recordIdentity(Object.freeze({ hostLocalJobId: "", attemptId: "attempt-a", observation: Object.freeze({ invocationId: "wpi-2", dshSessionId: "worker-Y", source: "DIRECT_CHILD_IPC_REPORT", sourceQualification: "FIRST_PARTY_DSH_QUALIFIED", directChildPid: 8 }) }));
    const outcomes = recorder.finalizeAttempt({ attemptId: "attempt-a", closeReason: "INVOCATION_RETURNED" });
    // THE DEFECT: a terminal for one Job closes the OTHER invocation's window too.
    expect(outcomes).toHaveLength(2);
    const closed = store.replayForAttempt({ projectId: PROJECT, attemptId: "attempt-a" }).filter((event) => event.type === "INVOCATION_OBSERVATION_FINALIZED");
    expect(closed.map((event) => (event.payload as { invocationId: string }).invocationId).sort()).toEqual(["wpi-1", "wpi-2"]);
    store.close();
  });
});

/* ================================================================== F7 cross-Attempt creator conflict */

describe("P2D0 F7 — two Attempts both qualify the same source-scoped Session identity", () => {
  it("an incompatible second creator claim for the same SessionId qualifies independently", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = createExecutionAssociationRecorder({ store, projectId: PROJECT, sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    for (const [attemptId, invocationId] of [["attempt-a", "wpi-1"], ["attempt-b", "wpi-2"]] as const) {
      recorder.recordIdentity(Object.freeze({ hostLocalJobId: "", attemptId, observation: Object.freeze({ invocationId, dshSessionId: "worker-SHARED", source: "DIRECT_CHILD_IPC_REPORT", sourceQualification: "FIRST_PARTY_DSH_QUALIFIED", directChildPid: 7 }) }));
      recorder.finalizeInvocation({ attemptId, invocationId, closeReason: "INVOCATION_RETURNED" });
    }
    const qualifier = makeAssociationQualifier({
      store,
      registry: registryFromSingleBasis(BASIS, "FIRST_PARTY_DSH_HOST"),
      work: { readAttempt: () => ({ ok: true, taskId: "t1", state: "RUNNING", creationEventId: "ev-1" }) },
      dsh: { async readHeaderIdentity(sessionId: string) { return { readState: "READ_OK" as const, header: { sessionId, version: 4, createdAt: 1, cwd: null, parentSession: null, isSeeded: false, origin: null, delegationDepth: null }, detail: "fixture" }; } },
    });
    const a = await qualifier.qualifyAttempt({ projectId: PROJECT, attemptId: "attempt-a" });
    const b = await qualifier.qualifyAttempt({ projectId: PROJECT, attemptId: "attempt-b" });
    // THE DEFECT: both Attempts qualify the SAME SessionId with no cross-Attempt creator conflict check.
    expect(a.qualifications[0]?.state).toBe("ASSOCIATION_QUALIFIED");
    expect(b.qualifications[0]?.state).toBe("ASSOCIATION_QUALIFIED");
    store.close();
  });
});

/* ================================================================== F9 :memory: durability overclaim */

describe("P2D0 F9 — an in-memory store yields a durable-looking VERIFIED binding", () => {
  it("a :memory: association store produces verification VERIFIED with a durableBindingRef", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = createExecutionAssociationRecorder({ store, projectId: PROJECT, sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    recorder.recordIdentity(Object.freeze({ hostLocalJobId: "", attemptId: "attempt-a", observation: Object.freeze({ invocationId: "wpi-1", dshSessionId: "worker-X", source: "DIRECT_CHILD_IPC_REPORT", sourceQualification: "FIRST_PARTY_DSH_QUALIFIED", directChildPid: 7 }) }));
    recorder.finalizeInvocation({ attemptId: "attempt-a", invocationId: "wpi-1", closeReason: "INVOCATION_RETURNED" });
    const qualifier = makeAssociationQualifier({
      store,
      registry: registryFromSingleBasis(BASIS, "FIRST_PARTY_DSH_HOST"),
      work: { readAttempt: () => ({ ok: true, taskId: "t1", state: "RUNNING", creationEventId: "ev-1" }) },
      dsh: { async readHeaderIdentity(sessionId: string) { return { readState: "READ_OK" as const, header: { sessionId, version: 4, createdAt: 1, cwd: null, parentSession: null, isSeeded: false, origin: null, delegationDepth: null }, detail: "fixture" }; } },
    });
    const result = await qualifier.qualifyAttempt({ projectId: PROJECT, attemptId: "attempt-a" });
    const qualified = result.qualifications[0];
    expect(qualified?.state).toBe("ASSOCIATION_QUALIFIED");
    if (qualified?.state === "ASSOCIATION_QUALIFIED") {
      // THE DEFECT: nothing distinguishes an ephemeral store's commit from a cold-recoverable one.
      expect(qualified.h1Association.verification).toBe("VERIFIED");
      expect(qualified.durableBindingRef).toMatch(/^xas-/u);
    }
    store.close();
  });
});

/* ================================================================== F13 canonical/T0 placeholders */

describe("P2D0 F13 — the attributed adapter replaces real Canonical Work facts with placeholders", () => {
  it("a qualified preview reports empty resultRefs, NOT_OBSERVED_BY_P2C verification and NONE rework", async () => {
    const { composeAttributedPreview } = await import("../src/composition/attributed_preview.js");
    const stack = makeStack(PROJECT);
    const attemptId = await prepareAttempt(stack.installed, PROJECT, stack.head);
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = createExecutionAssociationRecorder({ store, projectId: PROJECT, sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    recorder.recordIdentity(Object.freeze({ hostLocalJobId: "", attemptId, observation: Object.freeze({ invocationId: "wpi-1", dshSessionId: "worker-X", source: "DIRECT_CHILD_IPC_REPORT", sourceQualification: "FIRST_PARTY_DSH_QUALIFIED", directChildPid: 7 }) }));
    recorder.finalizeInvocation({ attemptId, invocationId: "wpi-1", closeReason: "INVOCATION_RETURNED" });
    const qualifier = makeAssociationQualifier({
      store,
      registry: registryFromSingleBasis(BASIS, "FIRST_PARTY_DSH_HOST"),
      work: workPortOf(stack.installed, PROJECT),
      dsh: { readHeaderIdentity: headerOk },
    });
    const service = composeAttributedPreview({
      projectId: PROJECT,
      controller: stack.installed.controller as never,
      promotions: stack.installed.controller.promotions as never,
      qualifier,
      store,
      sessionReader: undefined,
      projectEvolutionOf: emptyProjectEvolution,
    });
    const result = await service.previewAttempt({ attemptId });
    // THE DEFECT: facts the V0 composition can establish are placeholders here.
    expect(result.preview.canonical.resultRefs).toEqual([]);
    expect(result.preview.canonical.verificationState).toBe("NOT_OBSERVED_BY_P2C");
    expect(result.preview.canonical.reworkState).toBe("NONE");
    // The attributed adapter supplies no historical Work basis, so the authorization block carries nulls
    // even though the V0 composition reads a real basis for the same attempt.
    expect(result.preview.attempt.historicalAuthorization.basisDigest).toBeNull();
    store.close();
  });
});

/* ================================================================== F17 historical epoch wiring */

describe("P2D0 F17 — a normal deployment cannot supply trusted historical source epochs", () => {
  it("the install option surface exposes no historicalEpochs and install.ts never passes them", () => {
    const cluster = readRepo("src/composition/execution_association.ts");
    const install = readRepo("src/install.ts");
    expect(cluster).not.toBeNull();
    expect(install).not.toBeNull();
    // The cluster ACCEPTS epochs...
    expect(cluster).toMatch(/historicalEpochs\?: readonly TrustedSourceEpoch\[\]/u);
    // ...but the install option interface does NOT expose them, and install.ts never passes them.
    const installOptions = cluster!.slice(cluster!.indexOf("export interface ExecutionAssociationInstallOptions"));
    expect(installOptions).not.toMatch(/historicalEpochs/u);
    expect(install!).not.toMatch(/historicalEpochs/u);
  });
});

/* ================================================================== source-demonstrated findings */

describe("P2D0 — source-demonstrated findings (no dynamic path exists without a DSH runtime)", () => {
  it("F3 the attributed adapter performs no post-Event-Read relevant-basis recheck", () => {
    const preview = readRepo("src/composition/attributed_preview.ts")!;
    // The qualifier's recheck exists, but the adapter reads the page and builds the binding with no
    // second store-head comparison after the read.
    expect(preview).toMatch(/const page = await readSelectedSession/u);
    const afterRead = preview.slice(preview.indexOf("const page = await readSelectedSession"));
    expect(afterRead.slice(0, afterRead.indexOf("const invariants"))).not.toMatch(/store\.head\(\)/u);
  });

  it("F4 aggregate qualification captures ONE basis for the whole pass", () => {
    const qualifier = readRepo("src/execution_association/qualification.ts")!;
    expect(qualifier).toMatch(/const storeHeadAtStart = input\.store\.head\(\);/u);
    expect(qualifier).toMatch(/storeHeadAtStart,\s*attemptEventCountAtStart,/u);
  });

  it("F5 the delegation finalizes with the single closeReason INVOCATION_RETURNED", () => {
    const continuation = readRepo("src/composition/continuation.ts")!;
    expect(continuation).toMatch(/closeReason: "INVOCATION_RETURNED"/u);
    const contract = readRepo("src/execution_association/contract.ts")!;
    // No close reason distinguishes a confirmed child close from a timeout/abort request.
    expect(contract).toMatch(/INVOCATION_RETURNED/u);
    expect(contract).not.toMatch(/DIRECT_CHILD_EXIT_OBSERVED/u);
  });

  it("F8 lifecycle/coverage/completeness are not gated on the invariant verdict", () => {
    const handoff = readRepo("src/trajectory/handoff_preview.ts")!;
    const lifecycleLine = handoff.split("\n").find((line) => line.includes("const sessionLifecycle = sessionLifecycleOf("))!;
    expect(lifecycleLine).not.toMatch(/invariantsRefused/u);
    const completenessLine = handoff.split("\n").find((line) => line.includes("const completeness = previewCompletenessOf("))!;
    expect(completenessLine).not.toMatch(/invariantsRefused/u);
  });

  it("F10 the OwnedResource close contract is synchronous and the reader's async close is voided", () => {
    expect(readRepo("src/composition/lifecycle.ts")!).toMatch(/readonly close: \(\) => void;/u);
    expect(readRepo("src/composition/execution_association.ts")!).toMatch(/void readerHandle\.close\?\.\(\);/u);
  });

  it("F11 an expert Worker Port still borrows a first-party basis computed from workWorkerBin", () => {
    const cluster = readRepo("src/composition/execution_association.ts")!;
    expect(cluster).toMatch(/if \(options\.workWorkerPort !== undefined\) return options\.workWorkerPort;/u);
    expect(cluster).toMatch(/workerBin: options\.workWorkerBin \?\? ""/u);
  });

  it("F12 no reader is composed unless the host supplies DSH_HOME", () => {
    expect(readRepo("host/dsh/lib/index.js")!).toMatch(/process\.env\.DSH_HOME === undefined \? \{\} : \{ dshHomePath: process\.env\.DSH_HOME \}/u);
  });

  it("F14 a Caller Claim disagreement is not explicitly reported", () => {
    const preview = readRepo("src/composition/attributed_preview.ts")!;
    expect(preview).toMatch(/claimedSessionId: request\.claimedSessionId \?\? null/u);
    expect(preview).not.toMatch(/disagreement|differs from the verified/u);
  });

  it("F15 previewAttempt admits any canonical Attempt with no consumer-Attempt binding", () => {
    const preview = readRepo("src/composition/attributed_preview.ts")!;
    expect(preview).toMatch(/previewAttempt\(input: \{\s*readonly attemptId: string;/u);
    expect(preview).not.toMatch(/consumerAttemptId/u);
  });

  it("F18 Deployment.installed is typed InstalledPalimpsest, not the widened trajectory result", () => {
    expect(readRepo("src/deployment/launch.ts")!).toMatch(/readonly installed: InstalledPalimpsest;/u);
    expect(readRepo("src/install.ts")!).toMatch(/export type InstalledPalimpsestWithTrajectory/u);
  });
});
