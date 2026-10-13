/**
 * Trajectory-P2-D2 §6/§13 Group B — CAPSULE CONTRACT HARDENING (C2).
 *
 * Proves the corrected source, budget and vocabulary contracts:
 *
 *   · Durability is SOURCE-DERIVED — an ordinary caller cannot upgrade EPHEMERAL to DURABLE (F5/F6);
 *   · every numeric bound is validated at RUNTIME — NaN/Infinity/negative/fractional/over-ceiling refused (F7);
 *   · the legacy `maxTotalChars` aggregate budget is ENFORCED (F8);
 *   · the declared `IngestionOutcome` and the runtime Recorder outcome agree (F9);
 *   · event omission, summary truncation, essential-metadata overflow and a PARTIAL source are SEPARATE (F10).
 *
 * SAFETY. In-memory/temp SQLite; controlled ports; no DSH, no model, no network, no personal data.
 */
import { mkdtempSync, rmSync } from "node:fs";
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
import {
  buildTrajectoryContextCapsuleChecked,
  CapsuleLimitInvalidError,
  buildTrajectoryContextCapsule,
  TRAJECTORY_CAPSULE_HARD_MAX_SERIALIZED_BYTES,
  type HandoffPreview,
} from "../src/trajectory/index.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const BASIS: TrustedSourceBasis = computeTrustedSourceBasis({ adapterId: "a", workerBin: "/bin/dsh.js", nodeExecPath: "/bin/node.exe" });

function previewFixture(count: number, summary: (index: number) => string = (index) => `event ${String(index)}`): HandoffPreview {
  return {
    canonical: { attemptState: "COMPLETED", resultRefs: [], verificationState: "NOT_OBSERVED_BY_V0", promotionState: "NOT_PROMOTED", reworkState: "NONE" },
    attempt: { historicalAuthorization: { detail: "authorized" } },
    projectContext: { projectionRootId: null, projectionSemanticDigest: null, workSequence: null, projectIrRevision: null, selectedRelations: [], quarantinedRelations: [], unresolvedReferences: [], currentnessCaveats: [], projectionFailureOrigin: null },
    attribution: { eventPageCoverage: "FULL" },
    execution: {
      events: Array.from({ length: count }, (_, index) => ({ seq: index, type: "turn/start", durability: "PERSISTED_DSH_EVENT", inherited: false, summary: summary(index) })),
      bindingSource: "CANONICAL_ATTEMPT_BINDING", bindingDetail: "d", dshSessionId: "s", portInvocationId: "i", sessionBindingStatus: "BOUND_VERIFIED", readWatermark: count - 1, returnedPageSize: count,
    },
    caveats: { sourcesUnavailable: [], contradictoryObservations: [], epistemicLimits: [] },
  } as unknown as HandoffPreview;
}

const BASE = { consumerAttemptId: "attempt-consumer", originAttemptId: "attempt-origin", authorizationBasis: "fixture lineage" } as const;

function makeStack(projectId: string): { repo: string; head: string; installed: ReturnType<typeof installPalimpsest> } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-p2d2-c2-"));
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
      /* windows */
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
        derivedFrom: ["p2d2 c2 fixture"],
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

const READ_OK_HEADER = (sessionId: string) => ({
  readState: "READ_OK" as const,
  header: { sessionId, version: 4, createdAt: 1, cwd: null, parentSession: null, isSeeded: false, origin: null, delegationDepth: null },
  detail: "fixture",
});

function workPortOf(installed: ReturnType<typeof installPalimpsest>) {
  return {
    readAttempt: ({ attemptId }: { readonly attemptId: string }) => {
      const record = installed.controller.attemptWorkRecord(attemptId);
      return record === null ? ({ ok: false as const, reason: "no canonical attempt" }) : ({ ok: true as const, taskId: record.taskId, state: record.state, creationEventId: "ev-1" });
    },
  };
}

function pageFixture(sessionId: string, count: number) {
  return {
    schemaVersion: 1, readState: "READ_OK" as const, sessionId, header: null, sourceIdentity: "fixture",
    sourceEvidenceClass: "DSH_QUERY_PORT_FIXTURE" as const, throughSeq: count - 1, knownEventCount: count,
    inheritedEventCount: 0, requestedFromSeq: 0, requestedMaxEvents: 50, returnedCount: count, pageBounded: true,
    diskIoBounded: true, durabilityProvenance: "PERSISTED_AND_SYNTHETIC_SEPARATED" as const, persistedEventCount: count,
    syntheticRecoveryEventCount: 0,
    events: Array.from({ length: count }, (_, index) => ({ sessionId, seq: index, type: "turn/start", inherited: false, durability: "PERSISTED_DSH_EVENT", time: index, surface: null, summary: `event ${String(index)}`, durationMs: null, observedStatus: null })),
    knownParentSession: null, proves: [], doesNotProve: [], detail: "fixture",
  };
}

const EMPTY_EVOLUTION = {
  projectionRootId: null, projectionSemanticDigest: null, workSequence: null, workEventDigest: null, projectIrRevision: null,
  selectedRelations: [], quarantinedRelations: [], unresolvedReferences: [], currentnessCaveats: [], basisCompleteness: null,
  failureOrigin: null, failureKind: null,
} as never;

/**
 * A capsule rig whose association store is either DURABLE (a file path) or EPHEMERAL (:memory:), so the
 * source-derived durability can be observed through the ORDINARY product surface.
 */
async function capsuleRig(projectId: string, durability: "DURABLE" | "EPHEMERAL"): Promise<{
  readonly attemptId: string;
  readonly capsuleForConsumer: (overrides?: Record<string, unknown>) => Promise<{ readonly state: string; readonly capsule: { readonly attribution: { readonly durability: string } } | null }>;
  readonly close: () => void;
}> {
  const stack = makeStack(projectId);
  const attemptId = await prepareAttempt(stack.installed, projectId, stack.head);
  const store = new SqliteExecutionAssociationStore(durability === "EPHEMERAL" ? ":memory:" : join(stack.repo, ".palimpsest", "assoc.sqlite"));
  const recorder = createExecutionAssociationRecorder({ store, projectId, sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
  recorder.recordIdentity(Object.freeze({ hostLocalJobId: "", attemptId, observation: Object.freeze({ invocationId: "wpi-0", dshSessionId: "worker-0", reportedSessionId: "worker-0", source: "DIRECT_CHILD_IPC_REPORT", sourceQualification: "FIRST_PARTY_DSH_QUALIFIED", directChildPid: 7 }) }));
  recorder.finalizeInvocation({ attemptId, invocationId: "wpi-0", closeReason: "CHILD_EXIT_OBSERVED" });
  const { composeAttributedPreview } = await import("../src/composition/attributed_preview.js");
  const qualifier = makeAssociationQualifier({
    store,
    registry: registryFromSingleBasis(BASIS, "FIRST_PARTY_DSH_HOST"),
    durability,
    work: workPortOf(stack.installed),
    dsh: { async readHeaderIdentity(sessionId: string) { return READ_OK_HEADER(sessionId); } },
  });
  const service = composeAttributedPreview({
    projectId,
    controller: stack.installed.controller as never,
    promotions: stack.installed.controller.promotions as never,
    qualifier,
    store,
    sessionReader: { sourceIdentity: "fixture", evidenceClass: "DSH_QUERY_PORT_FIXTURE", async readEvents(request: { readonly sessionId: string }) { return pageFixture(request.sessionId, 3) as never; } } as never,
    capsuleAuthorization: { resolvePermittedOrigin: () => ({ ok: true as const, originAttemptId: attemptId, basis: "fixture lineage" }) },
    projectEvolutionOf: async () => EMPTY_EVOLUTION,
  });
  return {
    attemptId,
    capsuleForConsumer: async (overrides: Record<string, unknown> = {}) => (await service.capsuleForConsumer({ consumerAttemptId: attemptId, ...overrides })) as never,
    close: () => store.close(),
  };
}

/* ================================================================== Group B: source-derived durability */

describe("P2D2 §6.1/§6.2 — durability is source-derived", () => {
  it("6. an EPHEMERAL source cannot be caller-upgraded to DURABLE", async () => {
    const rig = await capsuleRig("p2d2-c2-eph", "EPHEMERAL");
    // The ordinary product path records the SOURCE's class, not the caller's.
    const honest = await rig.capsuleForConsumer();
    expect(honest.state).toBe("AUTHORIZED");
    expect(honest.capsule!.attribution.durability).toBe("EPHEMERAL");
    // A caller asking for DURABLE is REFUSED, never silently granted.
    const upgraded = await rig.capsuleForConsumer({ durability: "DURABLE" });
    expect(upgraded.state).toBe("CAPSULE_DURABILITY_MISMATCH");
    expect(upgraded.capsule).toBeNull();
    // A caller that AGREES with the source is harmless.
    const agreed = await rig.capsuleForConsumer({ durability: "EPHEMERAL" });
    expect(agreed.state).toBe("AUTHORIZED");
    rig.close();
  });

  it("7. a DURABLE source propagates its actual durability through the ordinary path", async () => {
    const rig = await capsuleRig("p2d2-c2-dur", "DURABLE");
    const result = await rig.capsuleForConsumer();
    expect(result.state).toBe("AUTHORIZED");
    expect(result.capsule!.attribution.durability).toBe("DURABLE");
    rig.close();
  });
});

/* ================================================================== Group B: numeric validation */

describe("P2D2 §6.3 — every bound is validated at runtime", () => {
  it("9/10. NaN and Infinity are REJECTED, not clamped", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const outcome = buildTrajectoryContextCapsuleChecked({ ...BASE, preview: previewFixture(5), limits: { maxSerializedBytes: value } });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) throw new Error("unreachable");
      expect(outcome.state).toBe("CAPSULE_LIMIT_INVALID");
    }
  });

  it("11. negative and fractional limits are handled safely", () => {
    const negative = buildTrajectoryContextCapsuleChecked({ ...BASE, preview: previewFixture(5), limits: { maxEvents: -1 } });
    expect(negative.ok).toBe(false);
    const fractional = buildTrajectoryContextCapsuleChecked({ ...BASE, preview: previewFixture(5), limits: { maxEventSummaryChars: 12.5 } });
    expect(fractional.ok).toBe(false);
    // The unchecked wrapper surfaces the refusal as an error rather than a Capsule.
    expect(() => buildTrajectoryContextCapsule({ ...BASE, preview: previewFixture(5), limits: { maxTotalChars: Number.NaN } })).toThrow(CapsuleLimitInvalidError);
  });

  it("12. the hard serialized-byte ceiling cannot be raised", () => {
    const over = buildTrajectoryContextCapsuleChecked({ ...BASE, preview: previewFixture(5), limits: { maxSerializedBytes: TRAJECTORY_CAPSULE_HARD_MAX_SERIALIZED_BYTES + 1 } });
    expect(over.ok).toBe(false);
    const at = buildTrajectoryContextCapsuleChecked({ ...BASE, preview: previewFixture(5), limits: { maxSerializedBytes: TRAJECTORY_CAPSULE_HARD_MAX_SERIALIZED_BYTES } });
    expect(at.ok).toBe(true);
    if (!at.ok) throw new Error("unreachable");
    expect(at.serializedBytes).toBeLessThanOrEqual(TRAJECTORY_CAPSULE_HARD_MAX_SERIALIZED_BYTES);
  });
});

/* ================================================================== Group B: legacy budget + truncation */

describe("P2D2 §6.4/§6.6 — legacy budget and honest truncation", () => {
  it("13. the legacy maxTotalChars contract is enforced", () => {
    const outcome = buildTrajectoryContextCapsuleChecked({ ...BASE, preview: previewFixture(5, () => "x".repeat(40)), limits: { maxTotalChars: 50 } });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("unreachable");
    expect(outcome.capsule.historicalExecution.events.reduce((sum, event) => sum + event.summary.length, 0)).toBeLessThanOrEqual(50);
  });

  it("15. event omission and summary truncation are distinguished", () => {
    // Omission: the event-count bound forces whole events out.
    const omitted = buildTrajectoryContextCapsuleChecked({ ...BASE, preview: previewFixture(30), limits: { maxEvents: 5 } });
    expect(omitted.ok).toBe(true);
    if (!omitted.ok) throw new Error("unreachable");
    expect(omitted.capsule.truncation.eventOmittedCount).toBeGreaterThan(0);
    expect(omitted.capsule.truncation.summaryTruncatedCount).toBe(0);
    // Shortening: every event present, a summary clamped.
    const shortened = buildTrajectoryContextCapsuleChecked({ ...BASE, preview: previewFixture(1, () => "z".repeat(500)), limits: { maxEventSummaryChars: 20 } });
    expect(shortened.ok).toBe(true);
    if (!shortened.ok) throw new Error("unreachable");
    expect(shortened.capsule.truncation.eventOmittedCount).toBe(0);
    expect(shortened.capsule.truncation.summaryTruncatedCount).toBe(1);
    // A PARTIAL source is reported as the SOURCE's own limit, not as local truncation.
    const partialPreview = { ...(previewFixture(3) as unknown as Record<string, unknown>), attribution: { eventPageCoverage: "PARTIAL" } } as unknown as HandoffPreview;
    const partial = buildTrajectoryContextCapsuleChecked({ ...BASE, preview: partialPreview });
    expect(partial.ok).toBe(true);
    if (!partial.ok) throw new Error("unreachable");
    expect(partial.capsule.truncation.sourcePageWasPartial).toBe(true);
    expect(partial.capsule.truncation.eventOmittedCount).toBe(0);
    expect(partial.capsule.truncation.summaryTruncatedCount).toBe(0);
  });
});

/* ================================================================== Group B: ingestion outcome vocabulary */

describe("P2D2 §6.5 — the declared IngestionOutcome matches the runtime Recorder outcome", () => {
  it("14. a committed observation reports APPENDED, and a re-delivery reports IDEMPOTENT", () => {
    const store = new SqliteExecutionAssociationStore(":memory:");
    cleanups.push(() => store.close());
    const recorder = createExecutionAssociationRecorder({ store, projectId: "p2d2-c2-ing", sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    const observation = Object.freeze({ hostLocalJobId: "", attemptId: "attempt-ing", observation: Object.freeze({ invocationId: "wpi-x", dshSessionId: "worker-x", reportedSessionId: "worker-x", source: "DIRECT_CHILD_IPC_REPORT" as const, sourceQualification: "FIRST_PARTY_DSH_QUALIFIED" as const, directChildPid: 1 }) });
    const first = recorder.recordIdentity(observation);
    expect(first.state).toBe("APPENDED");
    const again = recorder.recordIdentity(observation);
    expect(again.state).toBe("IDEMPOTENT");
    // The declared vocabulary is exactly {APPENDED, IDEMPOTENT, REJECTED}: no consumer can observe RECORDED.
    expect(["APPENDED", "IDEMPOTENT", "REJECTED"]).toContain(first.state);
    const rejected = recorder.recordIdentity(Object.freeze({ hostLocalJobId: "", attemptId: "attempt-ing", observation: Object.freeze({ invocationId: "wpi-y", dshSessionId: "worker-y", source: "CALLER_DECLARED" as never, sourceQualification: "UNQUALIFIED" as never, directChildPid: 1 }) }));
    expect(rejected.state).toBe("REJECTED");
  });
});
