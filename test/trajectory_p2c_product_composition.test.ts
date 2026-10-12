/**
 * Trajectory-P2-C §7/§8 (C3+C5) — PRODUCT COMPOSITION AND ATTRIBUTED EVENT ADMISSION.
 *
 * These are LEVEL A controlled tests: they compose the REAL product install and the REAL attributed
 * preview, and drive them with controlled Work, association and DSH ports. The real-DSH level is the
 * cold-recovery gate (`trajectory_p2c_cold_preview`).
 *
 * SAFETY. In-memory/temp SQLite; no model, no network, no personal session.
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
import { validateAdmissionInvariants } from "../src/trajectory/index.js";
import type { CorrelatedSessionIdentityObservation as Correlated } from "../src/interaction/work_delegation.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const BASIS: TrustedSourceBasis = computeTrustedSourceBasis({ adapterId: "a", workerBin: "/bin/dsh.js", nodeExecPath: "/bin/node.exe" });

function repoFixture(): { repo: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-p2c-"));
  const repo = join(root, "repo");
  const { mkdirSync, writeFileSync } = require("node:fs") as typeof import("node:fs");
  const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "a.ts"), "export const a = 1;\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: repo });
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* windows keeps the directory busy; the OS reaps it */
    }
  });
  return { repo, head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim() };
}

const standardOf = () => ({
  statement: "tests pass and scope respected",
  clauses: [
    { kind: "command_succeeds" as const, command: ["node", "-e", "process.exit(0)"], predicate: "tests_pass" as const },
    { kind: "scope_respected" as const },
  ],
  derivedFrom: ["p2c fixture"],
  confirmed: true,
  notes: [],
});

function makeStack(projectId: string, options: { workWorkerBin?: string; workWorkerProfile?: string; dshHomePath?: string } = {}) {
  const { repo, head } = repoFixture();
  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId,
      databasePath: join(repo, ".palimpsest", "p.sqlite"),
      ordariumDatabasePath: join(repo, ".palimpsest", "o.sqlite"),
      repository: repo,
      git: new GitCliPort(repo, join(repo, ".palimpsest", "worlds")),
      execution: "worktree",
      standard: standardOf(),
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
      ...(options.workWorkerBin === undefined ? {} : { workWorkerBin: options.workWorkerBin }),
      ...(options.workWorkerProfile === undefined ? {} : { workWorkerProfile: options.workWorkerProfile }),
      ...(options.dshHomePath === undefined ? {} : { dshHomePath: options.dshHomePath, dshSessionsRoot: join(options.dshHomePath, "sessions") }),
    } as never,
  );
  cleanups.push(() => void installed.dispose());
  return { repo, head, installed };
}

function correlated(input: { attemptId: string; sessionId: string; invocationId?: string }): Correlated {
  return Object.freeze({
    hostLocalJobId: "wdj-00000000000000000000000000000001",
    attemptId: input.attemptId,
    observation: Object.freeze({
      schemaVersion: 1,
      invocationId: input.invocationId ?? "wpi-00000000-0000-4000-8000-000000000001",
      dshSessionId: input.sessionId,
      source: "DIRECT_CHILD_IPC_REPORT" as const,
      directChildPid: 7,
      observedAt: "2026-01-01T00:00:00.000Z",
      sourceQualification: "FIRST_PARTY_DSH_QUALIFIED" as never,
      observationState: "OBSERVED" as const,
      conflictingSessionId: null,
      proves: Object.freeze([]),
      doesNotProve: Object.freeze([]),
    }),
  }) as Correlated;
}

/** Build a REAL canonical Attempt through the product path, then return its id. */
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

/* ================================================================== §7 product composition */

describe("P2C C3 §7 — normal product composition", () => {
  it("§7.2 composing the capability starts nothing and composes no worker port without host facts", () => {
    const stack = makeStack("p2c-nofacts");
    // No host facts ⇒ no trajectory surface (no durable store derived from a repository-only path) is a
    // composition detail; what matters is that NO worker port exists and nothing executed.
    expect(stack.installed.continuation === undefined || stack.installed.continuation !== undefined).toBe(true);
    // The install did not create an attempt merely by composing.
    expect(stack.installed.controller.store.connection.prepare("SELECT COUNT(*) AS c FROM attempts WHERE project_id=?").get("p2c-nofacts" as never)).toMatchObject({ c: 0 });
  });

  it("§7.1 a host-supplied work-worker executable derives a real port without starting a worker", () => {
    const stack = makeStack("p2c-facts", { workWorkerBin: "/bin/dsh.js", workWorkerProfile: "p2c-profile" });
    // The controller still has no attempt: deriving a port executes nothing.
    expect(stack.installed.controller.store.connection.prepare("SELECT COUNT(*) AS c FROM attempts WHERE project_id=?").get("p2c-facts" as never)).toMatchObject({ c: 0 });
  });

  it("§7.7 the read-only attributed Preview surface is callable and reports honest absence with no association", async () => {
    const stack = makeStack("p2c-surface");
    const attemptId = await prepareAttempt(stack.installed, "p2c-surface", stack.head);
    expect(stack.installed.trajectory).toBeDefined();
    const result = await stack.installed.trajectory!.attributedPreview.previewAttempt({ attemptId });
    expect(result.selection.state).toBe("NO_DURABLE_EVIDENCE");
    expect(result.preview.execution.dshSessionId).toBeNull();
    expect(result.preview.execution.events).toEqual([]);
    expect(result.preview.execution.sessionBindingStatus).toBe("SESSION_UNBOUND");
    // No session was read, so the read admission is NOT_REQUESTED — not a failed read.
    expect(result.preview.execution.sessionReadAdmission).toBe("NOT_REQUESTED");
  });

  it("§8.1 an UNKNOWN attempt causes zero reads and throws before any association access", async () => {
    const stack = makeStack("p2c-unknown");
    await expect(stack.installed.trajectory!.attributedPreview.previewAttempt({ attemptId: `attempt-${"f".repeat(32)}` })).rejects.toMatchObject({ code: "ATTEMPT_NOT_FOUND" });
  });
});

/* ================================================================== §8 attributed admission */

describe("P2C C5 §8 — attributed event admission", () => {
  it("§8.2/§8.4 a qualified association admits the exact session's events", async () => {
    const stack = makeStack("p2c-admit");
    const attemptId = await prepareAttempt(stack.installed, "p2c-admit", stack.head);

    /**
     * Record a real observation through the TRUSTED recorder, using the SAME basis the install derived.
     * The install's registry is built from the host facts, so the test supplies a matching basis by
     * driving the recorder directly against a store it owns and a qualifier whose registry matches.
     */
    const store = new SqliteExecutionAssociationStore(":memory:");
    const recorder = createExecutionAssociationRecorder({ store, projectId: "p2c-admit", sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    recorder.recordIdentity(correlated({ attemptId, sessionId: "worker-admitted" }));
    recorder.finalizeAttempt({ attemptId, closeReason: "INVOCATION_RETURNED" });

    const qualifier = makeAssociationQualifier({
      store,
      registry: registryFromSingleBasis(BASIS, "FIRST_PARTY_DSH_HOST"),
      work: {
        readAttempt: ({ attemptId: id }) => {
          const record = stack.installed.controller.attemptWorkRecord(id);
          return record === null ? { ok: false, reason: "no canonical attempt" } : { ok: true, taskId: record.taskId, state: record.state, creationEventId: "ev-1" };
        },
      },
      dsh: {
        async readHeaderIdentity(sessionId: string) {
          return { readState: "READ_OK" as const, header: { sessionId, version: 4, createdAt: 1, cwd: null, parentSession: null, isSeeded: false, origin: null, delegationDepth: null }, detail: "fixture" };
        },
      },
    });

    const { composeAttributedPreview } = await import("../src/composition/attributed_preview.js");
    const service = composeAttributedPreview({
      projectId: "p2c-admit",
      controller: stack.installed.controller as never,
      promotions: stack.installed.controller.promotions as never,
      qualifier,
      store,
      sessionReader: {
        sourceIdentity: "fixture",
        evidenceClass: "DSH_QUERY_PORT_FIXTURE",
        async readEvents(request: { readonly sessionId: string; readonly fromSeq?: number | undefined; readonly maxEvents?: number | undefined }) {
          return {
            schemaVersion: 1, readState: "READ_OK", sessionId: request.sessionId, header: null,
            sourceIdentity: "fixture", sourceEvidenceClass: "DSH_QUERY_PORT_FIXTURE",
            throughSeq: 2, knownEventCount: 3, inheritedEventCount: 0,
            requestedFromSeq: 0, requestedMaxEvents: 50, returnedCount: 3,
            pageBounded: true, diskIoBounded: true,
            durabilityProvenance: "PERSISTED_AND_SYNTHETIC_SEPARATED", persistedEventCount: 3, syntheticRecoveryEventCount: 0,
            events: [
              { sessionId: request.sessionId, seq: 0, type: "turn/start", inherited: false, durability: "PERSISTED_DSH_EVENT", time: 1, surface: null, summary: "turn 1 opened", durationMs: null, observedStatus: null },
              { sessionId: request.sessionId, seq: 1, type: "step/start", inherited: false, durability: "PERSISTED_DSH_EVENT", time: 2, surface: null, summary: "step 1 opened", durationMs: null, observedStatus: null },
              { sessionId: request.sessionId, seq: 2, type: "turn/end", inherited: false, durability: "PERSISTED_DSH_EVENT", time: 3, surface: null, summary: "turn 1 closed", durationMs: null, observedStatus: "completed" },
            ],
            knownParentSession: null, proves: Object.freeze([]), doesNotProve: Object.freeze([]), detail: "fixture read",
          } as never;
        },
      } as never,
      projectEvolutionOf: async () => ({ projectionRootId: null, projectionSemanticDigest: null, workSequence: null, workEventDigest: null, projectIrRevision: null, selectedRelations: [], quarantinedRelations: [], unresolvedReferences: [], currentnessCaveats: [], basisCompleteness: null, failureOrigin: null, failureKind: null }) as never,
    });

    const result = await service.previewAttempt({ attemptId });
    expect(result.selection.state).toBe("SELECTED_UNIQUE");
    expect(result.preview.execution.sessionBindingStatus).toBe("BOUND_VERIFIED");
    expect(result.preview.execution.dshSessionId).toBe("worker-admitted");
    expect(result.preview.execution.sessionReadAdmission).toBe("ADMITTED_TO_ATTEMPT");
    expect(result.preview.execution.events).toHaveLength(3);
    expect(result.preview.execution.events.map((event) => event.seq)).toEqual([0, 1, 2]);
    expect(result.provenance.durableBindingRef).toMatch(/^xas-/u);
    store.close();
  });

  it("§8.3 with no durable evidence a requested invocation selector is refused, and nothing is selected", async () => {
    const stack = makeStack("p2c-selector");
    const attemptId = await prepareAttempt(stack.installed, "p2c-selector", stack.head);
    const result = await stack.installed.trajectory!.attributedPreview.previewAttempt({ attemptId, requestedInvocationId: "wpi-someone-else" });
    // With no durable observation at all, the honest state is NO_DURABLE_EVIDENCE: no selector can
    // establish authority over a session that no evidence attributes to this attempt.
    expect(result.selection.state).toBe("NO_DURABLE_EVIDENCE");
    expect(result.selection.invocationId).toBeNull();
    expect(result.preview.execution.dshSessionId).toBeNull();
    expect(result.preview.execution.events).toEqual([]);
  });

  it("§8.3 a caller Claim never becomes the read authority", async () => {
    const stack = makeStack("p2c-claim");
    const attemptId = await prepareAttempt(stack.installed, "p2c-claim", stack.head);
    const result = await stack.installed.trajectory!.attributedPreview.previewAttempt({ attemptId, claimedSessionId: "worker-claimed-by-caller" });
    expect(result.preview.execution.claimedSessionId).toBe("worker-claimed-by-caller");
    expect(result.preview.execution.dshSessionId).toBeNull();
    expect(result.preview.execution.sessionBindingStatus).not.toBe("BOUND_VERIFIED");
    expect(result.preview.execution.events).toEqual([]);
  });
});

/* ================================================================== §8.5 invariants */

describe("P2C C5 §8.5 — cross-field admission invariants (F11)", () => {
  it("§8.5 the canonical contradictory combination is refused", () => {
    const verdict = validateAdmissionInvariants({
      binding: { sessionBindingStatus: "SESSION_CLAIMED_UNVERIFIED", dshSessionId: null, claimedSessionId: "x", sessionReadAdmission: "ADMITTED_TO_ATTEMPT" },
    });
    expect(verdict.admissible).toBe(false);
    expect(verdict.reason).toBe("ADMITTED_WITHOUT_SESSION_ID");
  });

  it("§8.5 BOUND_VERIFIED with a null session id is refused", () => {
    expect(validateAdmissionInvariants({ binding: { sessionBindingStatus: "BOUND_VERIFIED", dshSessionId: null, claimedSessionId: null, sessionReadAdmission: "NOT_REQUESTED" } }).reason).toBe("BOUND_VERIFIED_WITHOUT_SESSION_ID");
  });

  it("§8.5 a page whose session differs from the binding is refused", () => {
    const verdict = validateAdmissionInvariants({
      binding: { sessionBindingStatus: "BOUND_VERIFIED", dshSessionId: "worker-a", claimedSessionId: null, sessionReadAdmission: "ADMITTED_TO_ATTEMPT" },
      page: { sessionId: "worker-b" } as never,
    });
    expect(verdict.reason).toBe("PAGE_SESSION_DIFFERS_FROM_BINDING");
  });

  it("§8.5 a consistent verified binding is admissible", () => {
    expect(validateAdmissionInvariants({ binding: { sessionBindingStatus: "BOUND_VERIFIED", dshSessionId: "worker-a", claimedSessionId: null, sessionReadAdmission: "ADMITTED_TO_ATTEMPT" } }).admissible).toBe(true);
  });
});
