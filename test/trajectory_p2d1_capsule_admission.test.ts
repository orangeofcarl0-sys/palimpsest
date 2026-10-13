/**
 * Trajectory-P2-D1 §8/§9 — CAPSULE ADMISSION AND WHOLE-BYTE BUDGET.
 *
 * §8.2 separates three judgments that P2-D0 collapsed into AUTHORIZED:
 *
 *   Consumer Authorization   does the current consumer Attempt have canonical lineage for the origin?
 *   Origin Execution Admission  does the origin have a specific, qualified, current, ADMITTED execution?
 *   Capsule Deliverability   can that admitted evidence be represented within the byte budget?
 *
 * §9 enforces a REAL whole-serialized-byte budget on the actual delivery encoding (UTF-8 JSON), with
 * deterministic truncation of event summaries and an explicit refusal when essential metadata cannot fit.
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
  buildTrajectoryContextCapsule,
  CapsuleBudgetExceededError,
  trajectoryCapsuleBytes,
  TRAJECTORY_CAPSULE_HARD_MAX_SERIALIZED_BYTES,
  type HandoffPreview,
} from "../src/trajectory/index.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const BASIS: TrustedSourceBasis = computeTrustedSourceBasis({ adapterId: "a", workerBin: "/bin/dsh.js", nodeExecPath: "/bin/node.exe" });

function makeStack(projectId: string): { repo: string; head: string; installed: ReturnType<typeof installPalimpsest> } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-p2d1-c4-"));
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
        derivedFrom: ["p2d1 c4 fixture"],
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
      return record === null
        ? ({ ok: false as const, reason: "no canonical attempt" })
        : ({ ok: true as const, taskId: record.taskId, state: record.state, creationEventId: "ev-1" });
    },
  };
}

function pageFixture(sessionId: string, count: number, overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1, readState: "READ_OK" as const, sessionId, header: null, sourceIdentity: "fixture",
    sourceEvidenceClass: "DSH_QUERY_PORT_FIXTURE" as const, throughSeq: count - 1, knownEventCount: count,
    inheritedEventCount: 0, requestedFromSeq: 0, requestedMaxEvents: 50, returnedCount: count, pageBounded: true,
    diskIoBounded: true, durabilityProvenance: "PERSISTED_AND_SYNTHETIC_SEPARATED" as const, persistedEventCount: count,
    syntheticRecoveryEventCount: 0,
    events: Array.from({ length: count }, (_, index) => ({ sessionId, seq: index, type: "turn/start", inherited: false, durability: "PERSISTED_DSH_EVENT", time: index, surface: null, summary: `event ${String(index)}`, durationMs: null, observedStatus: null })),
    knownParentSession: null, proves: [], doesNotProve: [], detail: "fixture", ...overrides,
  };
}

const EMPTY_EVOLUTION = {
  projectionRootId: null, projectionSemanticDigest: null, workSequence: null, workEventDigest: null, projectIrRevision: null,
  selectedRelations: [], quarantinedRelations: [], unresolvedReferences: [], currentnessCaveats: [], basisCompleteness: null,
  failureOrigin: null, failureKind: null,
} as never;

interface CapsuleRig {
  readonly attemptId: string;
  readonly store: SqliteExecutionAssociationStore;
  readonly capsuleForConsumer: (reader: unknown, overrides?: Record<string, unknown>) => Promise<{ readonly state: string; readonly capsule: { readonly historicalExecution: { readonly events: readonly unknown[] }; readonly uncertainty: { readonly otherInvocationsUnresolved: readonly string[]; readonly syntheticRecoveryEventCount: number | null; readonly inheritedEventCount: number | null } } | null; readonly serializedBytes?: number }>;
}

async function capsuleRig(projectId: string, invocationCount: number, extra: { readonly failedRead?: boolean; readonly readState?: string } = {}): Promise<CapsuleRig> {
  const stack = makeStack(projectId);
  const attemptId = await prepareAttempt(stack.installed, projectId, stack.head);
  const store = new SqliteExecutionAssociationStore(":memory:");
  const recorder = createExecutionAssociationRecorder({ store, projectId, sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
  for (let index = 0; index < invocationCount; index += 1) {
    const invocationId = `wpi-${String(index)}`;
    recorder.recordIdentity(Object.freeze({ hostLocalJobId: "", attemptId, observation: Object.freeze({ invocationId, dshSessionId: `worker-${String(index)}`, reportedSessionId: `worker-${String(index)}`, source: "DIRECT_CHILD_IPC_REPORT", sourceQualification: "FIRST_PARTY_DSH_QUALIFIED", directChildPid: 7 }) }));
    recorder.finalizeInvocation({ attemptId, invocationId, closeReason: "CHILD_EXIT_OBSERVED" });
  }
  const { composeAttributedPreview } = await import("../src/composition/attributed_preview.js");
  const qualifier = makeAssociationQualifier({
    store,
    registry: registryFromSingleBasis(BASIS, "FIRST_PARTY_DSH_HOST"),
    work: workPortOf(stack.installed),
    dsh: { async readHeaderIdentity(sessionId: string) { return READ_OK_HEADER(sessionId); } },
  });
  const defaultReader = {
    sourceIdentity: "fixture", evidenceClass: "DSH_QUERY_PORT_FIXTURE",
    async readEvents(request: { readonly sessionId: string }) {
      if (extra.failedRead === true) return { ...pageFixture(request.sessionId, 0), readState: extra.readState ?? "BACKEND_UNAVAILABLE", events: [], detail: "the source read failed" } as never;
      return pageFixture(request.sessionId, 3) as never;
    },
  };
  return {
    attemptId,
    store,
    capsuleForConsumer: async (reader: unknown, overrides: Record<string, unknown> = {}) => {
      const service = composeAttributedPreview({
        projectId,
        controller: stack.installed.controller as never,
        promotions: stack.installed.controller.promotions as never,
        qualifier,
        store,
        sessionReader: (reader ?? defaultReader) as never,
        capsuleAuthorization: { resolvePermittedOrigin: () => ({ ok: true as const, originAttemptId: attemptId, basis: "fixture lineage" }) },
        projectEvolutionOf: async () => EMPTY_EVOLUTION,
      });
      return service.capsuleForConsumer({ consumerAttemptId: attemptId, ...overrides }) as never;
    },
  };
}

/* ================================================================== §8.3 admission matrix */

describe("P2D1 §8.3 — the origin admission matrix", () => {
  it("16. valid lineage + a valid admitted Origin ⇒ AUTHORIZED", async () => {
    const rig = await capsuleRig("p2d1-c4-ok", 1);
    const result = await rig.capsuleForConsumer(undefined);
    expect(result.state).toBe("AUTHORIZED");
    expect(result.capsule).not.toBeNull();
    expect(result.capsule!.historicalExecution.events.length).toBeGreaterThan(0);
    rig.store.close();
  });

  it("17. valid lineage + an AMBIGUOUS Origin ⇒ ORIGIN_NOT_SELECTED, no Capsule", async () => {
    const rig = await capsuleRig("p2d1-c4-amb", 2);
    const result = await rig.capsuleForConsumer(undefined);
    expect(result.state).toBe("ORIGIN_NOT_SELECTED");
    expect(result.capsule).toBeNull();
    rig.store.close();
  });

  it("19. valid lineage + an UNAVAILABLE source ⇒ ORIGIN_SOURCE_UNAVAILABLE, no Capsule", async () => {
    const rig = await capsuleRig("p2d1-c4-unavail", 1, { failedRead: true, readState: "BACKEND_UNAVAILABLE" });
    const result = await rig.capsuleForConsumer(undefined);
    expect(result.state).toBe("ORIGIN_SOURCE_UNAVAILABLE");
    expect(result.capsule).toBeNull();
    rig.store.close();
  });

  it("20. valid lineage + an INVALID page ⇒ ORIGIN_PAGE_REFUSED, no Capsule", async () => {
    const rig = await capsuleRig("p2d1-c4-invalid", 1, { failedRead: true, readState: "CORRUPT_SESSION" });
    const result = await rig.capsuleForConsumer(undefined);
    expect(result.state).toBe("ORIGIN_PAGE_REFUSED");
    expect(result.capsule).toBeNull();
    rig.store.close();
  });

  it("21. valid lineage + no qualified association ⇒ NO_QUALIFIED_ORIGIN, no Capsule", async () => {
    const stack = makeStack("p2d1-c4-noassoc");
    const attemptId = await prepareAttempt(stack.installed, "p2d1-c4-noassoc", stack.head);
    const store = new SqliteExecutionAssociationStore(":memory:");
    const { composeAttributedPreview } = await import("../src/composition/attributed_preview.js");
    const qualifier = makeAssociationQualifier({
      store,
      registry: registryFromSingleBasis(BASIS, "FIRST_PARTY_DSH_HOST"),
      work: workPortOf(stack.installed),
      dsh: { async readHeaderIdentity(sessionId: string) { return READ_OK_HEADER(sessionId); } },
    });
    const service = composeAttributedPreview({
      projectId: "p2d1-c4-noassoc",
      controller: stack.installed.controller as never,
      promotions: stack.installed.controller.promotions as never,
      qualifier,
      store,
      sessionReader: { sourceIdentity: "fixture", evidenceClass: "DSH_QUERY_PORT_FIXTURE", async readEvents(request: { readonly sessionId: string }) { return pageFixture(request.sessionId, 1) as never; } } as never,
      capsuleAuthorization: { resolvePermittedOrigin: () => ({ ok: true as const, originAttemptId: attemptId, basis: "fixture lineage" }) },
      projectEvolutionOf: async () => EMPTY_EVOLUTION,
    });
    const result = await service.capsuleForConsumer({ consumerAttemptId: attemptId });
    expect(result.state).toBe("NO_QUALIFIED_ORIGIN");
    expect(result.capsule).toBeNull();
    store.close();
  });
});

/* ================================================================== §9 whole-byte budget */

describe("P2D1 §9 — the whole serialized Capsule satisfies its byte budget", () => {
  function previewWith(events: readonly { readonly summary: string }[]): HandoffPreview {
    return {
      canonical: { attemptState: "COMPLETED", resultRefs: [], verificationState: "NOT_OBSERVED_BY_V0", promotionState: "NOT_PROMOTED", reworkState: "NONE" },
      attempt: { historicalAuthorization: { detail: "authorized" } },
      projectContext: { projectionRootId: null, projectionSemanticDigest: null, workSequence: null, projectIrRevision: null, selectedRelations: [], quarantinedRelations: [], unresolvedReferences: [], currentnessCaveats: [], projectionFailureOrigin: null },
      attribution: { eventPageCoverage: "FULL" },
      execution: {
        events: events.map((event, index) => ({ seq: index, type: "assistant/message", durability: "PERSISTED_DSH_EVENT", inherited: false, summary: event.summary })),
        bindingSource: "CANONICAL_ATTEMPT_BINDING", bindingDetail: "d", dshSessionId: "s", portInvocationId: "i", sessionBindingStatus: "BOUND_VERIFIED", readWatermark: events.length - 1, returnedPageSize: events.length,
      },
      caveats: { sourcesUnavailable: [], contradictoryObservations: [], epistemicLimits: [] },
    } as unknown as HandoffPreview;
  }

  it("26/27/28. multibyte Unicode and JSON escaping are counted in BYTES, and the bound holds", () => {
    const preview = previewWith(Array.from({ length: 24 }, () => ({ summary: "漢字\"\\\n".repeat(30) })));
    const outcome = buildTrajectoryContextCapsuleChecked({ consumerAttemptId: "c", originAttemptId: "o", authorizationBasis: "b", preview, limits: { maxSerializedBytes: 5_000 } });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("unreachable");
    expect(outcome.serializedBytes).toBeLessThanOrEqual(5_000);
    expect(Buffer.byteLength(JSON.stringify(outcome.capsule), "utf8")).toBeLessThanOrEqual(5_000);
    expect(outcome.capsule.truncation.truncated).toBe(true);
  });

  it("29/30. long caveats and long authorization details cannot bypass the budget", () => {
    const base = previewWith([]);
    const preview = { ...base, caveats: { sourcesUnavailable: Array.from({ length: 40 }, (_, i) => `caveat ${String(i)} ${"x".repeat(200)}`), contradictoryObservations: [], epistemicLimits: [] } } as unknown as HandoffPreview;
    const outcome = buildTrajectoryContextCapsuleChecked({ consumerAttemptId: "c", originAttemptId: "o", authorizationBasis: "a".repeat(4_000), preview, limits: { maxSerializedBytes: 6_000 } });
    // Either it fits, or it refuses — it never returns an over-budget Capsule.
    if (outcome.ok) {
      expect(outcome.serializedBytes).toBeLessThanOrEqual(6_000);
    } else {
      expect(outcome.state).toBe("CAPSULE_BUDGET_EXCEEDED");
    }
  });

  it("31. essential provenance is never silently truncated away", () => {
    const preview = previewWith(Array.from({ length: 24 }, () => ({ summary: "z".repeat(300) })));
    const outcome = buildTrajectoryContextCapsuleChecked({ consumerAttemptId: "c", originAttemptId: "o", authorizationBasis: "b", preview, limits: { maxSerializedBytes: 4_000 } });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("unreachable");
    // The identity, authority boundary, framing and binding status survive regardless of truncation.
    expect(outcome.capsule.consumerAttemptId).toBe("c");
    expect(outcome.capsule.originAttemptId).toBe("o");
    expect(outcome.capsule.authority).toBe("READ_ONLY_INSPECTION");
    expect(outcome.capsule.framing).toBe("HISTORICAL_DATA_NOT_INSTRUCTIONS");
    expect(outcome.capsule.attribution.bindingStatus).toBe("BOUND_VERIFIED");
    expect(outcome.capsule.doesNotAuthorize.length).toBeGreaterThan(0);
  });

  it("32. an oversized essential metadata block returns CAPSULE_BUDGET_EXCEEDED", () => {
    const preview = previewWith([]);
    const outcome = buildTrajectoryContextCapsuleChecked({ consumerAttemptId: "c", originAttemptId: "o", authorizationBasis: "b", preview, limits: { maxSerializedBytes: 32 } });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("unreachable");
    expect(outcome.state).toBe("CAPSULE_BUDGET_EXCEEDED");
    expect(() => buildTrajectoryContextCapsule({ consumerAttemptId: "c", originAttemptId: "o", authorizationBasis: "b", preview, limits: { maxSerializedBytes: 32 } })).toThrow(CapsuleBudgetExceededError);
  });

  it("33. a caller cannot raise the hard ceiling", () => {
    const preview = previewWith([]);
    const outcome = buildTrajectoryContextCapsuleChecked({ consumerAttemptId: "c", originAttemptId: "o", authorizationBasis: "b", preview, limits: { maxSerializedBytes: 10_000_000 } });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("unreachable");
    expect(outcome.serializedBytes).toBeLessThanOrEqual(TRAJECTORY_CAPSULE_HARD_MAX_SERIALIZED_BYTES);
    // trajectoryCapsuleBytes agrees with the reported serialized size.
    expect(trajectoryCapsuleBytes(outcome.capsule)).toBe(outcome.serializedBytes);
  });

  it("34. near-limit and over-limit payloads behave deterministically", () => {
    const preview = previewWith(Array.from({ length: 10 }, () => ({ summary: "a".repeat(100) })));
    // A generous budget keeps everything.
    const generous = buildTrajectoryContextCapsuleChecked({ consumerAttemptId: "c", originAttemptId: "o", authorizationBasis: "b", preview, limits: { maxSerializedBytes: 16_384 } });
    expect(generous.ok).toBe(true);
    if (!generous.ok) throw new Error("unreachable");
    expect(generous.capsule.historicalExecution.omittedEventCount).toBe(0);
    // A tight budget omits events but still fits.
    const tight = buildTrajectoryContextCapsuleChecked({ consumerAttemptId: "c", originAttemptId: "o", authorizationBasis: "b", preview, limits: { maxSerializedBytes: 2_500 } });
    expect(tight.ok).toBe(true);
    if (!tight.ok) throw new Error("unreachable");
    expect(tight.serializedBytes).toBeLessThanOrEqual(2_500);
    expect(tight.capsule.historicalExecution.omittedEventCount).toBeGreaterThan(0);
  });
});

/* ================================================================== §9.5 uncertainty propagation */

describe("P2D1 §9.5 — uncertainty is carried from the admission", () => {
  it("35/36/37/38. unresolved invocations, durability, synthetic and inherited counts are source-supported", async () => {
    // One qualified + one unresolved invocation ⇒ the origin is AMBIGUOUS, so use a direct builder call
    // with the provenance a real admission would supply, and assert it is carried verbatim.
    const preview = {
      canonical: { attemptState: "COMPLETED", resultRefs: [], verificationState: "NOT_OBSERVED_BY_V0", promotionState: "NOT_PROMOTED", reworkState: "NONE" },
      attempt: { historicalAuthorization: { detail: "authorized" } },
      projectContext: { projectionRootId: null, projectionSemanticDigest: null, workSequence: null, projectIrRevision: null, selectedRelations: [], quarantinedRelations: [], unresolvedReferences: [], currentnessCaveats: [], projectionFailureOrigin: null },
      attribution: { eventPageCoverage: "PARTIAL" },
      execution: { events: [], bindingSource: "CANONICAL_ATTEMPT_BINDING", bindingDetail: "d", dshSessionId: "s", portInvocationId: "i", sessionBindingStatus: "BOUND_VERIFIED", readWatermark: 5, returnedPageSize: 6 },
      caveats: { sourcesUnavailable: [], contradictoryObservations: [], epistemicLimits: [] },
    } as unknown as HandoffPreview;
    const outcome = buildTrajectoryContextCapsuleChecked({
      consumerAttemptId: "c", originAttemptId: "o", authorizationBasis: "b", preview, durability: "DURABLE",
      attributionProvenance: {
        qualificationState: "ASSOCIATION_QUALIFIED", sourceEpochId: "epoch-1", durableBindingRef: "xas-1",
        invocationSelectionState: "SELECTED_REQUESTED", otherInvocationsUnresolved: ["wpi-2 (OBSERVATION_INCOMPLETE)"],
        knownEventCount: 10, syntheticRecoveryEventCount: 2, inheritedEventCount: 1,
      },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("unreachable");
    expect(outcome.capsule.uncertainty.otherInvocationsUnresolved).toEqual(["wpi-2 (OBSERVATION_INCOMPLETE)"]);
    expect(outcome.capsule.uncertainty.syntheticRecoveryEventCount).toBe(2);
    expect(outcome.capsule.uncertainty.inheritedEventCount).toBe(1);
    expect(outcome.capsule.attribution.durability).toBe("DURABLE");
    expect(outcome.capsule.uncertainty.coverage).toBe("PARTIAL");
    expect(outcome.capsule.uncertainty.unreadHistory).toContain("read 6 of 10");
  });
});
