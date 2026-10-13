/**
 * Trajectory-P2-D1 §5 — BASELINE FALSIFIERS F1–F14.
 *
 * Each test pins a fact TRUE at the P2-D1 baseline (HEAD 205b413) that P2-D1 must change. Findings are
 * classified as the ruling requires:
 *
 *   DYNAMICALLY_REPRODUCED  the case was actually executed against the shipped code
 *   SOURCE_DEMONSTRATED     the claim is read from the actual source (see scripts/trajectory_p2d1/source-map.mjs)
 *   NOT_ESTABLISHED         could not be established
 *
 * Static source reasoning is NEVER reported as a dynamic reproduction. The source-level findings live in
 * `scripts/trajectory_p2d1/source-map.mjs` and `research-evidence/trajectory-p2d1/source-map.json`; the
 * tests here reproduce the cases that CAN be executed against the shipped code without a DSH runtime.
 *
 * SAFETY. In-memory/temp SQLite; controlled ports; no DSH, no model, no network, no personal data.
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
  type ExecutionAssociationStore,
  type TrustedSourceBasis,
} from "../src/execution_association/index.js";
import {
  buildTrajectoryContextCapsule,
  trajectoryCapsuleBytes,
  TRAJECTORY_CAPSULE_LIMITS,
  type HandoffPreview,
} from "../src/trajectory/index.js";
import { validateObservationWindow } from "../src/execution_association/window_integrity.js";

const REPO = process.cwd();
const readRepo = (relative: string): string | null => {
  const path = join(REPO, relative);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
};

const BASIS: TrustedSourceBasis = computeTrustedSourceBasis({ adapterId: "a", workerBin: "/bin/dsh.js", nodeExecPath: "/bin/node.exe" });
const PROJECT = "p2d1-falsifiers";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

function makeStack(projectId: string): { repo: string; head: string; installed: ReturnType<typeof installPalimpsest> } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-p2d1-"));
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
        derivedFrom: ["p2d1 fixture"],
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

function workPortOf(installed: ReturnType<typeof installPalimpsest>) {
  return {
    readAttempt: ({ attemptId }: { readonly attemptId: string }) => {
      const record = installed.controller.attemptWorkRecord(attemptId);
      return record === null
        ? ({ ok: false as const, reason: "no canonical attempt" })
        : ({ ok: true as const, taskId: record.taskId, state: record.state, creationEventId: "ev-1" });
    },
  };
}

const READ_OK_HEADER = (sessionId: string) => ({
  readState: "READ_OK" as const,
  header: { sessionId, version: 4, createdAt: 1, cwd: null, parentSession: null, isSeeded: false, origin: null, delegationDepth: null },
  detail: "fixture",
});

function pageFixture(sessionId: string, events: readonly unknown[]) {
  return {
    schemaVersion: 1, readState: "READ_OK" as const, sessionId, header: null, sourceIdentity: "fixture",
    sourceEvidenceClass: "DSH_QUERY_PORT_FIXTURE" as const, throughSeq: events.length - 1, knownEventCount: events.length,
    inheritedEventCount: 0, requestedFromSeq: 0, requestedMaxEvents: 50, returnedCount: events.length, pageBounded: true,
    diskIoBounded: true, durabilityProvenance: "PERSISTED_AND_SYNTHETIC_SEPARATED" as const, persistedEventCount: events.length,
    syntheticRecoveryEventCount: 0, events, knownParentSession: null, proves: [], doesNotProve: [], detail: "fixture",
  };
}

const EMPTY_EVOLUTION = {
  projectionRootId: null, projectionSemanticDigest: null, workSequence: null, workEventDigest: null, projectIrRevision: null,
  selectedRelations: [], quarantinedRelations: [], unresolvedReferences: [], currentnessCaveats: [], basisCompleteness: null,
  failureOrigin: null, failureKind: null,
} as never;

const QUALIFIER_PORTS = (installed: ReturnType<typeof installPalimpsest>, store: ExecutionAssociationStore) => ({
  store,
  registry: registryFromSingleBasis(BASIS, "FIRST_PARTY_DSH_HOST"),
  work: workPortOf(installed),
  dsh: { async readHeaderIdentity(sessionId: string) { return READ_OK_HEADER(sessionId); } },
});

/* ================================================================== F1 */

describe("F1 §6 — a failed durable append can disappear from the completeness judgment", () => {
  it("DYNAMICALLY_REPRODUCED: A committed + B append FAILS + close ⇒ a durable CLOSED(count=1) window validates and the Qualifier accepts A as unique", async () => {
    /**
     * §6.1: the invariant P2-D1 must establish is that a valid report whose append FAILED leaves a
     * completeness uncertainty that prevents final qualification. This test reproduces the baseline defect:
     * a store wrapper whose second append THROWS is exactly the "Recorder fails to commit B" case (§5 F1).
     */
    const real = new SqliteExecutionAssociationStore(":memory:");
    let calls = 0;
    const flaky: ExecutionAssociationStore = {
      append: (event) => {
        calls += 1;
        if (calls === 2) throw new Error("simulated durable append failure for session B");
        return real.append(event);
      },
      replay: () => real.replay(),
      replayForAttempt: (input) => real.replayForAttempt(input),
      replayForSession: (input) => real.replayForSession(input),
      head: () => real.head(),
      close: () => real.close(),
    };
    const recorder = createExecutionAssociationRecorder({ store: flaky, projectId: PROJECT, sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    const observation = (sessionId: string) =>
      Object.freeze({ hostLocalJobId: "", attemptId: "attempt-f1", observation: Object.freeze({ invocationId: "wpi-1", dshSessionId: sessionId, reportedSessionId: sessionId, source: "DIRECT_CHILD_IPC_REPORT", sourceQualification: "FIRST_PARTY_DSH_QUALIFIED", directChildPid: 7 }) });

    // A commits; B's append throws and the PRODUCT sink would discard the thrown error (F1).
    recorder.recordIdentity(observation("worker-A"));
    expect(() => recorder.recordIdentity(observation("worker-B"))).toThrow(/simulated durable append failure/u);
    // The parent then observes the real child close and finalizes.
    const finalization = recorder.finalizeInvocation({ attemptId: "attempt-f1", invocationId: "wpi-1", closeReason: "CHILD_EXIT_OBSERVED" });
    expect(finalization.state).toBe("APPENDED");

    // The durable history is {A} + CLOSED(count=1), and it VALIDATES as consistent.
    const events = real.replayForAttempt({ projectId: PROJECT, attemptId: "attempt-f1" });
    const window = validateObservationWindow(events);
    expect(window.state).toBe("CLOSED_CONSISTENT");
    expect(window.candidateSessionIds).toEqual(["worker-A"]);

    // The Qualifier accepts worker-A as the unique producer identity — the false-complete window is laundered.
    const qualifier = makeAssociationQualifier(QUALIFIER_PORTS({ controller: { attemptWorkRecord: () => ({ taskId: "t1", state: "RUNNING" }) } } as never, real));
    const qualification = await qualifier.qualifyAttempt({ projectId: PROJECT, attemptId: "attempt-f1" });
    expect(qualification.qualifications[0]!.state).toBe("ASSOCIATION_QUALIFIED");
    real.close();
  });
});

/* ================================================================== F2 / F3 / F4 */

describe("F2/F3/F4 §7 — the post-read recheck is narrower than the admission basis", () => {
  it("DYNAMICALLY_REPRODUCED F2: a second Invocation appended during Event Read leaves SELECTED_UNIQUE", async () => {
    const stack = makeStack("p2d1-f2");
    const attemptId = await prepareAttempt(stack.installed, "p2d1-f2", stack.head);
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = createExecutionAssociationRecorder({ store, projectId: "p2d1-f2", sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    const record = (invocationId: string, sessionId: string) =>
      recorder.recordIdentity(Object.freeze({ hostLocalJobId: "", attemptId, observation: Object.freeze({ invocationId, dshSessionId: sessionId, reportedSessionId: sessionId, source: "DIRECT_CHILD_IPC_REPORT", sourceQualification: "FIRST_PARTY_DSH_QUALIFIED", directChildPid: 7 }) }));
    record("wpi-1", "worker-1");
    recorder.finalizeInvocation({ attemptId, invocationId: "wpi-1", closeReason: "CHILD_EXIT_OBSERVED" });

    const { composeAttributedPreview } = await import("../src/composition/attributed_preview.js");
    const qualifier = makeAssociationQualifier(QUALIFIER_PORTS(stack.installed, store));
    let appended = false;
    const service = composeAttributedPreview({
      projectId: "p2d1-f2",
      controller: stack.installed.controller as never,
      promotions: stack.installed.controller.promotions as never,
      qualifier,
      store,
      sessionReader: {
        sourceIdentity: "fixture", evidenceClass: "DSH_QUERY_PORT_FIXTURE",
        async readEvents(request: { readonly sessionId: string }) {
          // Block the read, then append a SECOND qualified invocation for the SAME attempt (F2).
          if (!appended) {
            appended = true;
            record("wpi-2", "worker-2");
            recorder.finalizeInvocation({ attemptId, invocationId: "wpi-2", closeReason: "CHILD_EXIT_OBSERVED" });
          }
          return pageFixture(request.sessionId, [{ sessionId: request.sessionId, seq: 0, type: "turn/start", inherited: false, durability: "PERSISTED_DSH_EVENT", time: 0, surface: null, summary: "s", durationMs: null, observedStatus: null }]) as never;
        },
      } as never,
      projectEvolutionOf: async () => EMPTY_EVOLUTION,
    });
    const result = await service.previewAttempt({ attemptId });
    // BASELINE DEFECT: a second Invocation appeared during the read and the selection still claims UNIQUE.
    expect(result.selection.state).toBe("SELECTED_UNIQUE");
    expect(result.selection.detail).toContain("no unresolved alternative exists");
    store.close();
  });

  it("DYNAMICALLY_REPRODUCED F3: a foreign creator claim appended during Event Read leaves stale Session ownership", async () => {
    const stack = makeStack("p2d1-f3");
    const attemptId = await prepareAttempt(stack.installed, "p2d1-f3", stack.head);
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = createExecutionAssociationRecorder({ store, projectId: "p2d1-f3", sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    recorder.recordIdentity(Object.freeze({ hostLocalJobId: "", attemptId, observation: Object.freeze({ invocationId: "wpi-1", dshSessionId: "worker-shared", reportedSessionId: "worker-shared", source: "DIRECT_CHILD_IPC_REPORT", sourceQualification: "FIRST_PARTY_DSH_QUALIFIED", directChildPid: 7 }) }));
    recorder.finalizeInvocation({ attemptId, invocationId: "wpi-1", closeReason: "CHILD_EXIT_OBSERVED" });

    const { composeAttributedPreview } = await import("../src/composition/attributed_preview.js");
    const qualifier = makeAssociationQualifier(QUALIFIER_PORTS(stack.installed, store));
    let appended = false;
    const service = composeAttributedPreview({
      projectId: "p2d1-f3",
      controller: stack.installed.controller as never,
      promotions: stack.installed.controller.promotions as never,
      qualifier,
      store,
      sessionReader: {
        sourceIdentity: "fixture", evidenceClass: "DSH_QUERY_PORT_FIXTURE",
        async readEvents(request: { readonly sessionId: string }) {
          if (!appended) {
            appended = true;
            // A DIFFERENT attempt claims the SAME session under the SAME source scope, DURING the read (F3).
            recorder.recordIdentity(Object.freeze({ hostLocalJobId: "", attemptId: "attempt-foreign", observation: Object.freeze({ invocationId: "wpi-x", dshSessionId: "worker-shared", reportedSessionId: "worker-shared", source: "DIRECT_CHILD_IPC_REPORT", sourceQualification: "FIRST_PARTY_DSH_QUALIFIED", directChildPid: 9 }) }));
          }
          return pageFixture(request.sessionId, [{ sessionId: request.sessionId, seq: 0, type: "turn/start", inherited: false, durability: "PERSISTED_DSH_EVENT", time: 0, surface: null, summary: "s", durationMs: null, observedStatus: null }]) as never;
        },
      } as never,
      projectEvolutionOf: async () => EMPTY_EVOLUTION,
    });
    const result = await service.previewAttempt({ attemptId });
    // BASELINE DEFECT: the competing creation claim committed during the read is not re-read, so ownership
    // is still admitted as BOUND_VERIFIED for this attempt.
    expect(result.selection.state).toBe("SELECTED_UNIQUE");
    expect(result.preview.execution.sessionBindingStatus).toBe("BOUND_VERIFIED");
    store.close();
  });

  it("SOURCE_DEMONSTRATED F4: the qualification basis is not carried across the Qualification→Read handoff", () => {
    const preview = readRepo("src/composition/attributed_preview.ts")!;
    expect(preview).toContain("const headBeforeRead = input.store.head();");
    // The qualifier's own currentness basis is never consulted at the read boundary.
    expect(/qualification\.(qualifications|basis)[\s\S]{0,400}headBeforeRead/u.test(preview)).toBe(false);
  });
});

/* ================================================================== F5 / F6 */

describe("F5/F6 §8 — an authorized consumer still receives a Capsule without admitted execution evidence", () => {
  function capsuleStack(projectId: string) {
    return { stack: makeStack(projectId) };
  }

  it("DYNAMICALLY_REPRODUCED F6: valid lineage + a FAILED origin read still yields AUTHORIZED with an empty-event Capsule", async () => {
    const { stack } = capsuleStack("p2d1-f6");
    const attemptId = await prepareAttempt(stack.installed, "p2d1-f6", stack.head);
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = createExecutionAssociationRecorder({ store, projectId: "p2d1-f6", sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    recorder.recordIdentity(Object.freeze({ hostLocalJobId: "", attemptId, observation: Object.freeze({ invocationId: "wpi-1", dshSessionId: "worker-f6", reportedSessionId: "worker-f6", source: "DIRECT_CHILD_IPC_REPORT", sourceQualification: "FIRST_PARTY_DSH_QUALIFIED", directChildPid: 7 }) }));
    recorder.finalizeInvocation({ attemptId, invocationId: "wpi-1", closeReason: "CHILD_EXIT_OBSERVED" });

    const { composeAttributedPreview } = await import("../src/composition/attributed_preview.js");
    const qualifier = makeAssociationQualifier(QUALIFIER_PORTS(stack.installed, store));
    const service = composeAttributedPreview({
      projectId: "p2d1-f6",
      controller: stack.installed.controller as never,
      promotions: stack.installed.controller.promotions as never,
      qualifier,
      store,
      sessionReader: {
        sourceIdentity: "fixture", evidenceClass: "DSH_QUERY_PORT_FIXTURE",
        // The origin session read FAILS (F6).
        async readEvents() { return { ...pageFixture("worker-f6", []), readState: "READ_FAILED", events: [], detail: "the source read failed" } as never; },
      } as never,
      capsuleAuthorization: { resolvePermittedOrigin: () => ({ ok: true as const, originAttemptId: attemptId, basis: "fixture lineage" }) },
      projectEvolutionOf: async () => EMPTY_EVOLUTION,
    });
    const result = await service.capsuleForConsumer({ consumerAttemptId: attemptId });
    // BASELINE DEFECT: a failed origin read still produces an AUTHORIZED Capsule with no admitted events.
    expect(result.state).toBe("AUTHORIZED");
    expect(result.capsule).not.toBeNull();
    expect(result.capsule!.historicalExecution.events.length).toBe(0);
    store.close();
  });

  it("SOURCE_DEMONSTRATED F5: an AMBIGUOUS origin is not refused by capsuleForConsumer", () => {
    const preview = readRepo("src/composition/attributed_preview.ts")!;
    // Only NO_DURABLE_EVIDENCE is refused; AMBIGUOUS/RACED/REQUESTED_NOT_QUALIFIED fall through.
    expect(preview).toContain('origin.selection.state === "NO_DURABLE_EVIDENCE"');
    expect(/AMBIGUOUS_REQUIRES_SELECTION[\s\S]{0,200}NO_QUALIFIED_ORIGIN/u.test(preview)).toBe(false);
  });
});

/* ================================================================== F7 */

describe("F7 §9 — the whole Capsule has no enforced serialized-byte budget", () => {
  it("DYNAMICALLY_REPRODUCED: a Capsule whose EVENT SUMMARIES fit the char budget exceeds it once serialized in bytes", () => {
    const preview = {
      canonical: { attemptState: "COMPLETED", resultRefs: [], verificationState: "NOT_OBSERVED_BY_V0", promotionState: "NOT_PROMOTED", reworkState: "NONE" },
      attempt: { historicalAuthorization: { detail: "authorized" } },
      projectContext: { projectionRootId: null, projectionSemanticDigest: null, workSequence: null, projectIrRevision: null, selectedRelations: [], quarantinedRelations: [], unresolvedReferences: [], currentnessCaveats: [], projectionFailureOrigin: null },
      attribution: { eventPageCoverage: "FULL" },
      execution: {
        // Multibyte Unicode summaries: 240 chars each is <= maxEventSummaryChars, but >240 BYTES each.
        events: Array.from({ length: 24 }, (_, index) => ({ seq: index, type: "assistant/message", durability: "PERSISTED_DSH_EVENT", inherited: false, summary: "漢".repeat(TRAJECTORY_CAPSULE_LIMITS.maxEventSummaryChars) })),
        bindingSource: "CANONICAL_ATTEMPT_BINDING", bindingDetail: "d", dshSessionId: "s", portInvocationId: "i", sessionBindingStatus: "BOUND_VERIFIED", readWatermark: 23, returnedPageSize: 24,
      },
      caveats: { sourcesUnavailable: [], contradictoryObservations: [], epistemicLimits: [] },
    } as unknown as HandoffPreview;
    const capsule = buildTrajectoryContextCapsule({ consumerAttemptId: "c", originAttemptId: "o", authorizationBasis: "b", preview });
    // Every summary passes the CHAR check...
    expect(capsule.historicalExecution.events.every((event) => event.summary.length <= TRAJECTORY_CAPSULE_LIMITS.maxEventSummaryChars)).toBe(true);
    // ...but the SERIALIZED Capsule is far larger than the declared char budget, because chars ≠ bytes.
    const bytes = trajectoryCapsuleBytes(capsule);
    expect(bytes).toBeGreaterThan(TRAJECTORY_CAPSULE_LIMITS.maxTotalChars);
  });
});

/* ================================================================== F8 */

describe("F8 §9.5 — uncertainty is defaulted, not derived from source evidence", () => {
  it("SOURCE_DEMONSTRATED: otherInvocationsUnresolved is hard-coded [] and durability defaults to UNKNOWN", () => {
    const preview = readRepo("src/composition/attributed_preview.ts")!;
    const capsule = readRepo("src/trajectory/context_capsule.ts")!;
    expect(preview).toContain("otherInvocationsUnresolved: []");
    expect(capsule).toContain("syntheticRecoveryEventCount: null");
    expect(capsule).toContain("inheritedEventCount: null");
    expect(capsule).toContain('durability: input.durability ?? "UNKNOWN"');
  });
});

/* ================================================================== F9 / F10 */

describe("F9/F10 §10 — lineage duplication and consumer spoofability", () => {
  it("SOURCE_DEMONSTRATED F9: makeCapsuleAuthorization() scans events itself instead of the Context Owner's reworkProvenanceBefore", () => {
    const cluster = readRepo("src/composition/execution_association.ts")!;
    const context = readRepo("src/context/service.ts")!;
    expect(cluster).toContain("function makeCapsuleAuthorization");
    expect(cluster).not.toContain("reworkProvenanceBefore");
    expect(context).toContain("reworkProvenanceBefore");
  });

  it("SOURCE_DEMONSTRATED F10: capsuleForConsumer accepts a caller-supplied consumerAttemptId", () => {
    const preview = readRepo("src/composition/attributed_preview.ts")!;
    expect(preview).toContain("readonly consumerAttemptId: string;");
  });
});

/* ================================================================== F11 / F12 / F13 / F14 */

describe("F11–F14 §10–§13 — no positive path, no delivery, no digest, no qualified fixture", () => {
  it("SOURCE_DEMONSTRATED F11: no shipped test drives a real A0→Rework→A1→AUTHORIZED path", () => {
    const test = readRepo("test/trajectory_p2d0_context_capsule.test.ts")!;
    expect(test).toContain("a consumer with no governed rework lineage may inspect no historical Attempt");
    expect(/capsuleForConsumer\([\s\S]{0,300}\.state\)\.toBe\("AUTHORIZED"\)/u.test(test)).toBe(false);
  });

  it("SOURCE_DEMONSTRATED F12: no Capsule reaches Compiled Context, a Handle, Context Pull or Host Prework", () => {
    const context = readRepo("src/context/service.ts")!;
    const worker = readRepo("src/deployment/work_worker.ts")!;
    expect(/TrajectoryContextCapsule|trajectoryCapsule/u.test(context)).toBe(false);
    expect(/TrajectoryContextCapsule|trajectoryCapsule/u.test(worker)).toBe(false);
  });

  it("SOURCE_DEMONSTRATED F13: no delivery digest, byte count or before-first-turn fact is recorded", () => {
    const capsule = readRepo("src/trajectory/context_capsule.ts")!;
    expect(/capsuleDigest|contentDigest|deliveryDigest/u.test(capsule)).toBe(false);
  });

  it("SOURCE_DEMONSTRATED F14: D0 prepared a protocol and ran no trials; no fixture is yet qualified", () => {
    const readiness = readRepo("research-evidence/trajectory-p2d0/d1-benchmark-readiness.json")!;
    expect(readiness).toContain('"stochasticTrialsRunInD0": 0');
  });
});
