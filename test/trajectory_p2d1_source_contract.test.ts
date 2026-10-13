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
  buildTrajectoryContextCapsuleChecked,
  CapsuleBudgetExceededError,
  trajectoryCapsuleBytes,
  TRAJECTORY_CAPSULE_LIMITS,
  TRAJECTORY_CAPSULE_HARD_MAX_SERIALIZED_BYTES,
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
  it("CHANGED ASSERTION (P2D1 C2): the baseline defect is FIXED — a failed append leaves a durable incompleteness marker and no qualification", async () => {
    /**
     * BASELINE (205b413): a committed A + a FAILED B append + an observed close produced a durable
     * {A} + CLOSED(count=1) window that validated CLOSED_CONSISTENT, so the Qualifier accepted A as the
     * unique producer identity (F1). The C2 ingestion-health mechanism corrects this: the Recorder records a
     * durable INGESTION-INCOMPLETE marker, the finalization is UNKNOWN rather than CLOSED, and the Qualifier
     * refuses with OBSERVATION_INCOMPLETE.
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

    // A commits; B's append throws.
    recorder.recordIdentity(observation("worker-A"));
    expect(() => recorder.recordIdentity(observation("worker-B"))).toThrow(/simulated durable append failure/u);
    // The parent then observes the real child close and finalizes.
    recorder.finalizeInvocation({ attemptId: "attempt-f1", invocationId: "wpi-1", closeReason: "CHILD_EXIT_OBSERVED" });

    // The durable history now contains a durable incompleteness marker, and the window is NOT a closure.
    const events = real.replayForAttempt({ projectId: PROJECT, attemptId: "attempt-f1" });
    expect(events.some((event) => event.type === "INVOCATION_INGESTION_INCOMPLETE")).toBe(true);
    const window = validateObservationWindow(events);
    expect(window.state).toBe("CONTRADICTORY");
    expect(window.reason).toBe("INGESTION_INCOMPLETE");

    // The Qualifier REFUSES: a known ingestion failure cannot be laundered into a verified binding.
    const qualifier = makeAssociationQualifier(QUALIFIER_PORTS({ controller: { attemptWorkRecord: () => ({ taskId: "t1", state: "RUNNING" }) } } as never, real));
    const qualification = await qualifier.qualifyAttempt({ projectId: PROJECT, attemptId: "attempt-f1" });
    expect(qualification.qualifications[0]!.state).toBe("OBSERVATION_INCOMPLETE");
    expect(qualification.summary.qualifiedCount).toBe(0);
    real.close();
  });
});

/* ================================================================== F2 / F3 / F4 */

describe("F2/F3/F4 §7 — the post-read recheck now covers the COMPLETE relevant basis", () => {
  it("CHANGED ASSERTION (P2D1 C3) F2: a second Invocation appended during Event Read now yields RACED, not SELECTED_UNIQUE", async () => {
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
    // C3 CORRECTION: the Attempt's Invocation set grew during the read, so the page is NOT admitted as current.
    expect(result.selection.state).toBe("AMBIGUOUS_REQUIRES_SELECTION");
    expect(result.provenance.qualificationState).toBe("RACED");
    expect(result.preview.execution.sessionBindingStatus).not.toBe("BOUND_VERIFIED");
    store.close();
  });

  it("CHANGED ASSERTION (P2D1 C3) F3: a foreign creator claim during Event Read now yields RACED, not stale ownership", async () => {
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
    // C3 CORRECTION: the competing creation claim committed during the read IS re-read, so ownership is RACED.
    expect(result.provenance.qualificationState).toBe("RACED");
    expect(result.preview.execution.sessionBindingStatus).not.toBe("BOUND_VERIFIED");
    store.close();
  });

  it("CHANGED ASSERTION (P2D1 C3) F4: the qualification basis IS carried across the Qualification→Read handoff", () => {
    const preview = readRepo("src/composition/attributed_preview.ts")!;
    // The read boundary now captures the qualifier's OWN relevant basis, not a fresh head snapshot.
    expect(preview).toContain("const basisBeforeRead = chosen.relevantBasis;");
    expect(preview).toContain("relevantBasisDifference(basisBeforeRead, basisAfterRead)");
    expect(preview).not.toContain("const headBeforeRead = input.store.head();");
  });
});

/* ================================================================== F5 / F6 */

describe("F5/F6 §8 — an authorized consumer still receives a Capsule without admitted execution evidence", () => {
  function capsuleStack(projectId: string) {
    return { stack: makeStack(projectId) };
  }

  it("CHANGED ASSERTION (P2D1 C4) F6: valid lineage + a FAILED origin read is now refused, not AUTHORIZED", async () => {
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
    // C4 CORRECTION: a failed origin read is now an explicit refusal, not an AUTHORIZED empty Capsule.
    expect(result.state).not.toBe("AUTHORIZED");
    expect(result.capsule).toBeNull();
    store.close();
  });

  it("CHANGED ASSERTION (P2D1 C4) F5: an AMBIGUOUS origin is refused with ORIGIN_NOT_SELECTED", async () => {
    const { stack } = capsuleStack("p2d1-f5");
    const attemptId = await prepareAttempt(stack.installed, "p2d1-f5", stack.head);
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = createExecutionAssociationRecorder({ store, projectId: "p2d1-f5", sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    // Two qualified invocations ⇒ AMBIGUOUS_REQUIRES_SELECTION for the origin.
    for (const invocationId of ["wpi-1", "wpi-2"]) {
      recorder.recordIdentity(Object.freeze({ hostLocalJobId: "", attemptId, observation: Object.freeze({ invocationId, dshSessionId: `worker-${invocationId}`, reportedSessionId: `worker-${invocationId}`, source: "DIRECT_CHILD_IPC_REPORT", sourceQualification: "FIRST_PARTY_DSH_QUALIFIED", directChildPid: 7 }) }));
      recorder.finalizeInvocation({ attemptId, invocationId, closeReason: "CHILD_EXIT_OBSERVED" });
    }
    const { composeAttributedPreview } = await import("../src/composition/attributed_preview.js");
    const qualifier = makeAssociationQualifier(QUALIFIER_PORTS(stack.installed, store));
    const service = composeAttributedPreview({
      projectId: "p2d1-f5",
      controller: stack.installed.controller as never,
      promotions: stack.installed.controller.promotions as never,
      qualifier,
      store,
      sessionReader: { sourceIdentity: "fixture", evidenceClass: "DSH_QUERY_PORT_FIXTURE", async readEvents(request: { readonly sessionId: string }) { return pageFixture(request.sessionId, [{ sessionId: request.sessionId, seq: 0, type: "turn/start", inherited: false, durability: "PERSISTED_DSH_EVENT", time: 0, surface: null, summary: "s", durationMs: null, observedStatus: null }]) as never; } } as never,
      capsuleAuthorization: { resolvePermittedOrigin: () => ({ ok: true as const, originAttemptId: attemptId, basis: "fixture lineage" }) },
      projectEvolutionOf: async () => EMPTY_EVOLUTION,
    });
    const result = await service.capsuleForConsumer({ consumerAttemptId: attemptId });
    expect(result.state).toBe("ORIGIN_NOT_SELECTED");
    expect(result.capsule).toBeNull();
    store.close();
  });
});

/* ================================================================== F7 */

describe("F7 §9 — the whole Capsule is now bounded by SERIALIZED BYTES", () => {
  it("CHANGED ASSERTION (P2D1 C4): the builder truncates events so the serialized Capsule fits the byte budget", () => {
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
    const outcome = buildTrajectoryContextCapsuleChecked({ consumerAttemptId: "c", originAttemptId: "o", authorizationBasis: "b", preview, limits: { maxSerializedBytes: 4_096 } });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("unreachable");
    // The WHOLE serialized Capsule fits the budget, measured in bytes.
    expect(outcome.serializedBytes).toBeLessThanOrEqual(4_096);
    expect(trajectoryCapsuleBytes(outcome.capsule)).toBeLessThanOrEqual(4_096);
    // Events were omitted to make it fit, and the truncation is reported.
    expect(outcome.capsule.truncation.truncated).toBe(true);
    expect(outcome.capsule.historicalExecution.omittedEventCount).toBeGreaterThan(0);
    // Essential provenance is NOT truncated away.
    expect(outcome.capsule.authority).toBe("READ_ONLY_INSPECTION");
    expect(outcome.capsule.framing).toBe("HISTORICAL_DATA_NOT_INSTRUCTIONS");
    expect(outcome.capsule.attribution.bindingStatus).toBe("BOUND_VERIFIED");
  });

  it("CHANGED ASSERTION (P2D1 C4): an over-large essential metadata block returns an explicit refusal", () => {
    const preview = {
      canonical: { attemptState: "COMPLETED", resultRefs: [], verificationState: "NOT_OBSERVED_BY_V0", promotionState: "NOT_PROMOTED", reworkState: "NONE" },
      attempt: { historicalAuthorization: { detail: "authorized" } },
      projectContext: { projectionRootId: null, projectionSemanticDigest: null, workSequence: null, projectIrRevision: null, selectedRelations: [], quarantinedRelations: [], unresolvedReferences: [], currentnessCaveats: [], projectionFailureOrigin: null },
      attribution: { eventPageCoverage: "FULL" },
      execution: { events: [], bindingSource: "CANONICAL_ATTEMPT_BINDING", bindingDetail: "d", dshSessionId: "s", portInvocationId: "i", sessionBindingStatus: "BOUND_VERIFIED", readWatermark: null, returnedPageSize: 0 },
      caveats: { sourcesUnavailable: [], contradictoryObservations: [], epistemicLimits: [] },
    } as unknown as HandoffPreview;
    // A budget far below the essential floor.
    const outcome = buildTrajectoryContextCapsuleChecked({ consumerAttemptId: "c", originAttemptId: "o", authorizationBasis: "b", preview, limits: { maxSerializedBytes: 16 } });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("unreachable");
    expect(outcome.state).toBe("CAPSULE_BUDGET_EXCEEDED");
    // The unchecked builder throws rather than fabricating a Capsule that drops required provenance.
    expect(() => buildTrajectoryContextCapsule({ consumerAttemptId: "c", originAttemptId: "o", authorizationBasis: "b", preview, limits: { maxSerializedBytes: 16 } })).toThrow(CapsuleBudgetExceededError);
  });

  it("CHANGED ASSERTION (P2D1 C4): a caller cannot RAISE the product ceiling", () => {
    const preview = {
      canonical: { attemptState: "COMPLETED", resultRefs: [], verificationState: "NOT_OBSERVED_BY_V0", promotionState: "NOT_PROMOTED", reworkState: "NONE" },
      attempt: { historicalAuthorization: { detail: "authorized" } },
      projectContext: { projectionRootId: null, projectionSemanticDigest: null, workSequence: null, projectIrRevision: null, selectedRelations: [], quarantinedRelations: [], unresolvedReferences: [], currentnessCaveats: [], projectionFailureOrigin: null },
      attribution: { eventPageCoverage: "FULL" },
      execution: { events: [], bindingSource: "CANONICAL_ATTEMPT_BINDING", bindingDetail: "d", dshSessionId: "s", portInvocationId: "i", sessionBindingStatus: "BOUND_VERIFIED", readWatermark: null, returnedPageSize: 0 },
      caveats: { sourcesUnavailable: [], contradictoryObservations: [], epistemicLimits: [] },
    } as unknown as HandoffPreview;
    // A caller asking for an ENORMOUS budget still gets the product ceiling enforced: the reported bytes
    // never exceed the hard ceiling, and the effective limit is clamped.
    const outcome = buildTrajectoryContextCapsuleChecked({ consumerAttemptId: "c", originAttemptId: "o", authorizationBasis: "b", preview, limits: { maxSerializedBytes: 10_000_000 } });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("unreachable");
    expect(outcome.serializedBytes).toBeLessThanOrEqual(TRAJECTORY_CAPSULE_HARD_MAX_SERIALIZED_BYTES);
  });
});

/* ================================================================== F8 */

describe("F8 §9.5 — uncertainty is derived from source evidence", () => {
  it("CHANGED ASSERTION (P2D1 C4): otherInvocationsUnresolved and the durability/inherited counts come from the admission", () => {
    const preview = readRepo("src/composition/attributed_preview.ts")!;
    const capsule = readRepo("src/trajectory/context_capsule.ts")!;
    // The hard-coded empty array is gone; the unresolved set is derived from the qualification.
    expect(preview).not.toContain("otherInvocationsUnresolved: [],");
    expect(preview).toContain("otherInvocationsUnresolved: Object.freeze(qualification.qualifications.filter");
    // The counts come from the page/input, not constants.
    expect(capsule).toContain("syntheticRecoveryEventCount: input.attributionProvenance?.syntheticRecoveryEventCount ?? null");
    expect(capsule).toContain("inheritedEventCount: input.attributionProvenance?.inheritedEventCount ?? null");
  });
});

/* ================================================================== F9 / F10 */

describe("F9/F10 §10 — lineage reuse and consumer spoofability", () => {
  it("CHANGED ASSERTION (P2D1 C5) F9: makeCapsuleAuthorization reuses the Context Owner's lineage, not its own scan", () => {
    const cluster = readRepo("src/composition/execution_association.ts")!;
    const context = readRepo("src/context/service.ts")!;
    // The cluster now delegates to the Context Owner's governedReworkOriginOf.
    expect(cluster).toContain("governedReworkOriginOf");
    // It no longer scans the event log for TASK_READY itself.
    expect(cluster).not.toContain('event.event_type === "TASK_READY"');
    expect(context).toContain("governedReworkOriginOf");
    expect(context).toContain("reworkProvenanceBefore");
  });

  it("SOURCE_DEMONSTRATED F10: capsuleForConsumer accepts a caller-supplied consumerAttemptId", () => {
    const preview = readRepo("src/composition/attributed_preview.ts")!;
    expect(preview).toContain("readonly consumerAttemptId: string;");
  });
});

/* ================================================================== F11 / F12 / F13 / F14 */

describe("F11–F14 §10–§13 — positive path, delivery, digest, qualified fixture", () => {
  it("CHANGED ASSERTION (P2D1 C5) F11: a shipped test NOW drives a real A0→Rework→A1→AUTHORIZED path", () => {
    const test = readRepo("test/trajectory_p2d1_governed_authorization.test.ts")!;
    expect(test).toContain("governedReworkOriginOf");
    expect(test).toContain("appendReworkReopening");
    expect(/capsuleForConsumer\([\s\S]{0,300}state\)\.toBe\("AUTHORIZED"\)/u.test(test)).toBe(true);
  });

  it("CHANGED ASSERTION (P2D1 C6) F12: a Capsule NOW reaches the Worker Context boundary through the Context Owner", () => {
    const context = readRepo("src/context/service.ts")!;
    const worker = readRepo("src/deployment/work_worker.ts")!;
    // The Context Owner now carries the experimental Attempt-bound Capsule in the worker context.
    expect(context).toContain("trajectoryCapsule");
    expect(context).toContain("trajectoryCapsuleFor");
    // The worker payload shape is unchanged (the Capsule rides in `context.compiled`), so the host needs no change.
    expect(/TrajectoryContextCapsule|trajectoryCapsule/u.test(worker)).toBe(false);
  });

  it("CHANGED ASSERTION (P2D1 C6) F13: the delivery carries a digest and byte count", () => {
    const context = readRepo("src/context/service.ts")!;
    // The delivered projection carries a content digest and serialized byte count.
    expect(context).toContain("contentDigest");
    expect(context).toContain("serializedBytes");
  });

  it("SOURCE_DEMONSTRATED F14: D0 prepared a protocol and ran no trials; no fixture is yet qualified", () => {
    const readiness = readRepo("research-evidence/trajectory-p2d0/d1-benchmark-readiness.json")!;
    expect(readiness).toContain('"stochasticTrialsRunInD0": 0');
  });
});
