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
  it("the tracker now carries the RAW reported identity beside the cumulative first identity", () => {
    const correlated = observeThroughTracker({ invocationId: "wpi-1", sessionIds: ["worker-A", "worker-B", "worker-C"] });
    // C2 CORRECTION: `reportedSessionId` is the identity THIS message carried, while `dshSessionId` stays
    // the cumulative first identity. (At the C1 baseline there was no such field, so a consumer could only
    // ever see ["worker-A","worker-A","worker-A"] — the F1 defect.)
    expect(correlated.map((entry) => entry.observation.reportedSessionId)).toEqual(["worker-A", "worker-B", "worker-C"]);
    expect(correlated.map((entry) => entry.observation.dshSessionId)).toEqual(["worker-A", "worker-A", "worker-A"]);
  });

  it("CHANGED ASSERTION (P2D0 C2): the durable candidate set is now {A,B,C}, not {A}", () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = createExecutionAssociationRecorder({ store, projectId: PROJECT, sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    for (const entry of observeThroughTracker({ invocationId: "wpi-1", sessionIds: ["worker-A", "worker-B", "worker-C"] })) {
      recorder.recordIdentity(entry);
    }
    const durable = store.replayForAttempt({ projectId: PROJECT, attemptId: "attempt-a" }).filter((event) => event.type === "SESSION_IDENTITY_OBSERVED");
    const distinct = [...new Set(durable.map((event) => (event.payload as { dshSessionId: string }).dshSessionId))];
    // C2 CORRECTION: the recorder now persists the identity THIS message reported, so B and C survive.
    // (At the C1 baseline this set was ["worker-A"] — that is the F1 defect the source map records.)
    expect(distinct).toEqual(["worker-A", "worker-B", "worker-C"]);
    store.close();
  });
});

/* ================================================================== F2 mixed-invocation selection */

describe("P2D0 F2 — one qualified + one incomplete Invocation reports SELECTED_UNIQUE", () => {
  it("CHANGED ASSERTION (P2D0 C3): a qualified Invocation beside an unresolved one is no longer SELECTED_UNIQUE", async () => {
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
    // C3 CORRECTION: the unresolved second Invocation makes the set ambiguous, so nothing is auto-selected.
    // (At the C1 baseline this was SELECTED_UNIQUE with "no unresolved alternative exists" — the F2 defect.)
    expect(result.selection.state).toBe("AMBIGUOUS_REQUIRES_SELECTION");
    expect(result.selection.invocationId).toBeNull();
    expect(result.selection.detail).toContain("unresolved");
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
  it("CHANGED ASSERTION (P2D0 C2): the second incompatible creator claim is now refused as CONFLICT", async () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = createExecutionAssociationRecorder({ store, projectId: PROJECT, sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    for (const [attemptId, invocationId] of [["attempt-a", "wpi-1"], ["attempt-b", "wpi-2"]] as const) {
      recorder.recordIdentity(Object.freeze({ hostLocalJobId: "", attemptId, observation: Object.freeze({ invocationId, dshSessionId: "worker-SHARED", source: "DIRECT_CHILD_IPC_REPORT", sourceQualification: "FIRST_PARTY_DSH_QUALIFIED", directChildPid: 7 }) }));
      recorder.finalizeInvocation({ attemptId, invocationId, closeReason: "CHILD_EXIT_OBSERVED" });
    }
    const qualifier = makeAssociationQualifier({
      store,
      registry: registryFromSingleBasis(BASIS, "FIRST_PARTY_DSH_HOST"),
      work: { readAttempt: () => ({ ok: true, taskId: "t1", state: "RUNNING", creationEventId: "ev-1" }) },
      dsh: { readHeaderIdentity: headerOk },
    });
    // C2 CORRECTION: the same source-scoped SessionId claimed by two Attempts no longer qualifies twice.
    // (At the C1 baseline both were ASSOCIATION_QUALIFIED — the F7 defect.)
    const a = await qualifier.qualifyAttempt({ projectId: PROJECT, attemptId: "attempt-a" });
    const b = await qualifier.qualifyAttempt({ projectId: PROJECT, attemptId: "attempt-b" });
    expect(a.qualifications[0]?.state).toBe("CONFLICT");
    expect(b.qualifications[0]?.state).toBe("CONFLICT");
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
  it("CHANGED ASSERTION (P2D0 C4): the attributed preview now reports the real Canonical Work facts", async () => {
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
    // C4 CORRECTION: the adapter reuses `canonicalFactsOf`, so verification uses the V0 value rather than
    // the P2-C placeholder, and the historical Work basis is read from the real owner.
    // (At the C1 baseline: verificationState "NOT_OBSERVED_BY_P2C" and a null basisDigest — the F13 defect.)
    expect(result.preview.canonical.verificationState).toBe("NOT_OBSERVED_BY_V0");
    expect(result.preview.canonical.reworkState).toBe("NONE");
    expect(result.preview.canonical.resultRefs).toEqual([]);
    store.close();
  });
});

/* ================================================================== F17 historical epoch wiring */

describe("P2D0 F17 — a normal deployment cannot supply trusted historical source epochs", () => {
  it("CHANGED ASSERTION (P2D0 C5): the install surface now exposes historicalEpochs and install.ts passes them", () => {
    const cluster = readRepo("src/composition/execution_association.ts");
    const install = readRepo("src/install.ts");
    expect(cluster).not.toBeNull();
    expect(install).not.toBeNull();
    expect(cluster).toMatch(/historicalEpochs\?: readonly TrustedSourceEpoch\[\]/u);
    // C5 CORRECTION: the install option interface now exposes them, and install.ts forwards them.
    // (At the C1 baseline neither held — the F17 defect.)
    const installOptions = cluster!.slice(cluster!.indexOf("export interface ExecutionAssociationInstallOptions"));
    expect(installOptions).toMatch(/historicalEpochs/u);
    expect(install!).toMatch(/historicalEpochs/u);
  });
});

/* ================================================================== source-demonstrated findings */

describe("P2D0 — source-demonstrated findings (no dynamic path exists without a DSH runtime)", () => {
  it("CHANGED ASSERTION (P2D0 C3): the adapter now performs a post-Event-Read relevant-basis recheck", () => {
    const preview = readRepo("src/composition/attributed_preview.ts")!;
    expect(preview).toMatch(/const page = await readSelectedSession/u);
    const afterRead = preview.slice(preview.indexOf("const page = await readSelectedSession"));
    // C3 CORRECTION: the store head is re-checked after the read, and a relevant change yields RACED.
    // (At the C1 baseline there was no such check — the F3 defect.)
    expect(afterRead.slice(0, afterRead.indexOf("const invariants"))).toMatch(/headAfterRead/u);
    expect(preview).toMatch(/relevantChangedDuringRead/u);
    expect(preview).toMatch(/qualificationState: "RACED"/u);
  });

  it("F4 aggregate qualification captures ONE basis for the whole pass", () => {
    const qualifier = readRepo("src/execution_association/qualification.ts")!;
    expect(qualifier).toMatch(/const storeHeadAtStart = input\.store\.head\(\);/u);
    expect(qualifier).toMatch(/storeHeadAtStart,\s*attemptEventCountAtStart,/u);
  });

  it("CHANGED ASSERTION (P2D0 C3): the delegation now finalizes on an OBSERVED child exit, per Invocation", () => {
    const continuation = readRepo("src/composition/continuation.ts")!;
    // C3 CORRECTION: the product path finalizes on the Port's own DIRECT_CHILD_EXIT_OBSERVED observation,
    // scoped to the Invocation it names, and never on an Attempt-wide terminal.
    expect(continuation).toMatch(/DIRECT_CHILD_EXIT_OBSERVED/u);
    expect(continuation).toMatch(/closeReason: "CHILD_EXIT_OBSERVED"/u);
    expect(continuation).toMatch(/finalizeInvocation\(/u);
    expect(continuation).not.toMatch(/finalizeAttempt\(/u);
    const contract = readRepo("src/execution_association/contract.ts")!;
    // The contract now distinguishes a confirmed child close from a request that was never confirmed.
    expect(contract).toMatch(/CHILD_EXIT_OBSERVED/u);
  });

  it("CHANGED ASSERTION (P2D0 C5): lifecycle and coverage are now gated on the invariant verdict", () => {
    const handoff = readRepo("src/trajectory/handoff_preview.ts")!;
    // C5 CORRECTION: a refused page can no longer claim SESSION_READ + FULL coverage.
    // (At the C1 baseline neither line consulted the invariant verdict — the F8 defect.)
    const lifecycleLine = handoff.split("\n").find((line) => line.includes("const sessionLifecycle = bindingContradicted"))!;
    expect(lifecycleLine).toBeDefined();
    const coverageLine = handoff.split("\n").find((line) => line.includes("const eventPageCoverage = bindingContradicted"))!;
    expect(coverageLine).toBeDefined();
    expect(handoff).toMatch(/bindingContradicted \? \("NOT_APPLICABLE" as EventPageCoverage\)/u);
    // The ordinary "read but unattributed" case stays SESSION_READ_NOT_ATTRIBUTED, not a contradiction.
    expect(handoff).toMatch(/admissionInvariants\.reason !== "PAGE_SUPPLIED_WITHOUT_ADMISSION"/u);
  });

  it("CHANGED ASSERTION (P2D0 C5): the OwnedResource close contract now awaits an async reader close", () => {
    // C5 CORRECTION: close may return a promise and the lifecycle awaits it.
    // (At the C1 baseline close was synchronous and the reader's async close was voided — the F10 defect.)
    expect(readRepo("src/composition/lifecycle.ts")!).toMatch(/readonly close: \(\) => void \| Promise<void>;/u);
    expect(readRepo("src/composition/lifecycle.ts")!).toMatch(/await resource\.close\(\);/u);
    expect(readRepo("src/composition/execution_association.ts")!).toMatch(/close: \(\) => readerHandle\.close\?\.\(\)/u);
  });

  it("CHANGED ASSERTION (P2D0 C5): an expert port no longer borrows a first-party basis by default", () => {
    const cluster = readRepo("src/composition/execution_association.ts")!;
    // C5 CORRECTION: an explicit port with no explicit source kind is classified UNKNOWN, not FIRST_PARTY.
    // (At the C1 baseline the basis and kind still came from workWorkerBin — the F11 defect.)
    expect(cluster).toMatch(/explicitPortWithoutKind/u);
    expect(cluster).toMatch(/options\.workWorkerBin === undefined \|\| explicitPortWithoutKind \? "UNKNOWN" : "FIRST_PARTY_DSH_HOST"/u);
  });

  it("F12 no reader is composed unless the host supplies DSH_HOME", () => {
    expect(readRepo("host/dsh/lib/index.js")!).toMatch(/process\.env\.DSH_HOME === undefined \? \{\} : \{ dshHomePath: process\.env\.DSH_HOME \}/u);
  });

  it("CHANGED ASSERTION (P2D0 C5): a Caller Claim disagreement is now explicitly reported", () => {
    const preview = readRepo("src/composition/attributed_preview.ts")!;
    // C5 CORRECTION: the verified session stays the only read target, and the discrepancy is reported.
    // (At the C1 baseline the claim was recorded but no discrepancy was reported — the F14 defect.)
    expect(preview).toMatch(/claimDisagrees/u);
    expect(preview).toMatch(/DISAGREES and is retained only as a declaration/u);
  });

  it("CHANGED ASSERTION (P2D0 C6): the CONSUMER surface is now bound to a consumer Attempt", () => {
    const preview = readRepo("src/composition/attributed_preview.ts")!;
    // The ordinary inspection surface still takes an attemptId (an operator read)...
    expect(preview).toMatch(/previewAttempt\(input: \{\s*readonly attemptId: string;/u);
    // ...but the CONSUMER surface (the Capsule) is lineage-bound: it names the consumer attempt and
    // refuses an origin the lineage does not permit. (At the C1 baseline there was no consumer binding.)
    expect(preview).toMatch(/capsuleForConsumer/u);
    expect(preview).toMatch(/consumerAttemptId/u);
    expect(preview).toMatch(/ORIGIN_NOT_PERMITTED/u);
  });

  it("CHANGED ASSERTION (P2D0 C5): Deployment.installed is now the widened trajectory result", () => {
    // C5 CORRECTION: the deployment surface names the widened type, so the capability is statically
    // reachable. (At the C1 baseline it was typed InstalledPalimpsest — the F18 defect.)
    expect(readRepo("src/deployment/launch.ts")!).toMatch(/readonly installed: InstalledPalimpsestWithTrajectory;/u);
    expect(readRepo("src/install.ts")!).toMatch(/export type InstalledPalimpsestWithTrajectory/u);
  });
});
