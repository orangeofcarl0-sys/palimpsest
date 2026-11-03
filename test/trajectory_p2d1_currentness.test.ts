/**
 * Trajectory-P2-D1 §7 — COMPLETE FINAL ATTRIBUTION CURRENTNESS.
 *
 * P2-D0's post-read check compared only the SELECTED invocation's event ids. C3 replaces it with the
 * COMPLETE relevant association basis (the Attempt Invocation set, the selected invocation's event set,
 * the source-scoped foreign creator claims, the source epoch and the store head), so a relevant change
 * during Event Read cannot silently produce a stale SELECTED_UNIQUE or stale Session ownership.
 *
 * Every race here uses a DETERMINISTIC BARRIER — the reader's own `readEvents` callback performs the
 * mutation — rather than a timing-only sleep.
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
  associationRelevantBasisOf,
  relevantBasisDifference,
  type ExecutionAssociationStore,
  type TrustedSourceBasis,
} from "../src/execution_association/index.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const BASIS: TrustedSourceBasis = computeTrustedSourceBasis({ adapterId: "a", workerBin: "/bin/dsh.js", nodeExecPath: "/bin/node.exe" });

function makeStack(projectId: string): { repo: string; head: string; installed: ReturnType<typeof installPalimpsest> } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-p2d1-c3-"));
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
        derivedFrom: ["p2d1 c3 fixture"],
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

const page = (sessionId: string) => ({
  schemaVersion: 1, readState: "READ_OK" as const, sessionId, header: null, sourceIdentity: "fixture",
  sourceEvidenceClass: "DSH_QUERY_PORT_FIXTURE" as const, throughSeq: 0, knownEventCount: 1, inheritedEventCount: 0,
  requestedFromSeq: 0, requestedMaxEvents: 50, returnedCount: 1, pageBounded: true, diskIoBounded: true,
  durabilityProvenance: "PERSISTED_AND_SYNTHETIC_SEPARATED" as const, persistedEventCount: 1, syntheticRecoveryEventCount: 0,
  events: [{ sessionId, seq: 0, type: "turn/start", inherited: false, durability: "PERSISTED_DSH_EVENT", time: 0, surface: null, summary: "s", durationMs: null, observedStatus: null }],
  knownParentSession: null, proves: [], doesNotProve: [], detail: "fixture",
});

const EMPTY_EVOLUTION = {
  projectionRootId: null, projectionSemanticDigest: null, workSequence: null, workEventDigest: null, projectIrRevision: null,
  selectedRelations: [], quarantinedRelations: [], unresolvedReferences: [], currentnessCaveats: [], basisCompleteness: null,
  failureOrigin: null, failureKind: null,
} as never;

interface Harness {
  readonly attemptId: string;
  readonly store: ExecutionAssociationStore;
  readonly recorder: ReturnType<typeof createExecutionAssociationRecorder>;
  readonly preview: (barrier: () => void) => Promise<{ readonly selection: { readonly state: string }; readonly provenance: { readonly qualificationState: string }; readonly preview: { readonly execution: { readonly sessionBindingStatus: string } } }>;
}

async function harness(projectId: string, setup: (recorder: ReturnType<typeof createExecutionAssociationRecorder>, attemptId: string) => void): Promise<Harness> {
  const stack = makeStack(projectId);
  const attemptId = await prepareAttempt(stack.installed, projectId, stack.head);
  const store = new SqliteExecutionAssociationStore(":memory:");
  const recorder = createExecutionAssociationRecorder({ store, projectId, sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
  setup(recorder, attemptId);
  const { composeAttributedPreview } = await import("../src/composition/attributed_preview.js");
  const qualifier = makeAssociationQualifier({
    store,
    registry: registryFromSingleBasis(BASIS, "FIRST_PARTY_DSH_HOST"),
    work: workPortOf(stack.installed),
    dsh: { async readHeaderIdentity(sessionId: string) { return READ_OK_HEADER(sessionId); } },
  });
  return {
    attemptId,
    store,
    recorder,
    preview: async (barrier: () => void) => {
      const service = composeAttributedPreview({
        projectId,
        controller: stack.installed.controller as never,
        promotions: stack.installed.controller.promotions as never,
        qualifier,
        store,
        sessionReader: {
          sourceIdentity: "fixture", evidenceClass: "DSH_QUERY_PORT_FIXTURE",
          async readEvents(request: { readonly sessionId: string }) {
            barrier();
            return page(request.sessionId) as never;
          },
        } as never,
        projectEvolutionOf: async () => EMPTY_EVOLUTION,
      });
      return service.previewAttempt({ attemptId }) as never;
    },
  };
}

const obs = (attemptId: string, invocationId: string, sessionId: string) =>
  Object.freeze({ hostLocalJobId: "", attemptId, observation: Object.freeze({ invocationId, dshSessionId: sessionId, reportedSessionId: sessionId, source: "DIRECT_CHILD_IPC_REPORT", sourceQualification: "FIRST_PARTY_DSH_QUALIFIED", directChildPid: 7 }) });

/* ================================================================== §7.5 the race matrix */

describe("P2D1 §7.5 — deterministic race matrix over the complete relevant basis", () => {
  it("1. another Invocation appears during Event Read ⇒ RACED", async () => {
    const h = await harness("p2d1-c3-1", (recorder, attemptId) => {
      recorder.recordIdentity(obs(attemptId, "wpi-1", "worker-1"));
      recorder.finalizeInvocation({ attemptId, invocationId: "wpi-1", closeReason: "CHILD_EXIT_OBSERVED" });
    });
    const result = await h.preview(() => {
      h.recorder.recordIdentity(obs(h.attemptId, "wpi-2", "worker-2"));
      h.recorder.finalizeInvocation({ attemptId: h.attemptId, invocationId: "wpi-2", closeReason: "CHILD_EXIT_OBSERVED" });
    });
    expect(result.provenance.qualificationState).toBe("RACED");
    expect(result.selection.state).toBe("AMBIGUOUS_REQUIRES_SELECTION");
    h.store.close();
  });

  it("2. a foreign creator claim appears during Event Read ⇒ RACED", async () => {
    const h = await harness("p2d1-c3-2", (recorder, attemptId) => {
      recorder.recordIdentity(obs(attemptId, "wpi-1", "worker-shared"));
      recorder.finalizeInvocation({ attemptId, invocationId: "wpi-1", closeReason: "CHILD_EXIT_OBSERVED" });
    });
    const result = await h.preview(() => {
      h.recorder.recordIdentity(obs("attempt-foreign", "wpi-x", "worker-shared"));
    });
    expect(result.provenance.qualificationState).toBe("RACED");
    expect(result.preview.execution.sessionBindingStatus).not.toBe("BOUND_VERIFIED");
    h.store.close();
  });

  it("3. the selected Invocation's own history changes during Event Read ⇒ RACED", async () => {
    const h = await harness("p2d1-c3-3", (recorder, attemptId) => {
      recorder.recordIdentity(obs(attemptId, "wpi-1", "worker-1"));
      recorder.finalizeInvocation({ attemptId, invocationId: "wpi-1", closeReason: "CHILD_EXIT_OBSERVED" });
    });
    const result = await h.preview(() => {
      // A second distinct identity for the SAME invocation is committed during the read.
      h.recorder.recordIdentity(obs(h.attemptId, "wpi-1", "worker-1b"));
    });
    expect(result.provenance.qualificationState).toBe("RACED");
    h.store.close();
  });

  it("4. a duplicate identical observation replayed during Event Read is NOT a conflict ⇒ still admitted", async () => {
    const h = await harness("p2d1-c3-4", (recorder, attemptId) => {
      recorder.recordIdentity(obs(attemptId, "wpi-1", "worker-1"));
      recorder.finalizeInvocation({ attemptId, invocationId: "wpi-1", closeReason: "CHILD_EXIT_OBSERVED" });
    });
    const result = await h.preview(() => {
      // A retry of the SAME logical observation: idempotent, no new event, no relevant change.
      h.recorder.recordIdentity(obs(h.attemptId, "wpi-1", "worker-1"));
    });
    expect(result.selection.state).toBe("SELECTED_UNIQUE");
    expect(result.preview.execution.sessionBindingStatus).toBe("BOUND_VERIFIED");
    h.store.close();
  });

  it("5. an unrelated project's append does not cause a false conflict ⇒ still admitted", async () => {
    const h = await harness("p2d1-c3-5", (recorder, attemptId) => {
      recorder.recordIdentity(obs(attemptId, "wpi-1", "worker-1"));
      recorder.finalizeInvocation({ attemptId, invocationId: "wpi-1", closeReason: "CHILD_EXIT_OBSERVED" });
    });
    // A SEPARATE recorder bound to a DIFFERENT project writes to the SAME store during the read. It moves
    // the GLOBAL store head but touches no fact this association rests on (§7.4), so it must NOT conflict.
    const otherRecorder = createExecutionAssociationRecorder({ store: h.store, projectId: "p2d1-other-project", sourceBasis: BASIS, sourceKind: "FIRST_PARTY_DSH_HOST" });
    const result = await h.preview(() => {
      otherRecorder.recordIdentity(obs("attempt-other", "wpi-other", "worker-other"));
      otherRecorder.finalizeInvocation({ attemptId: "attempt-other", invocationId: "wpi-other", closeReason: "CHILD_EXIT_OBSERVED" });
    });
    // The unrelated append moved the head, but the relevant facts are unchanged, so the page IS admitted.
    expect(result.selection.state).toBe("SELECTED_UNIQUE");
    expect(result.preview.execution.sessionBindingStatus).toBe("BOUND_VERIFIED");
    h.store.close();
  });

  it("6. a source read failure during a relevant Store update does not admit the page", async () => {
    const h = await harness("p2d1-c3-6", (recorder, attemptId) => {
      recorder.recordIdentity(obs(attemptId, "wpi-1", "worker-1"));
      recorder.finalizeInvocation({ attemptId, invocationId: "wpi-1", closeReason: "CHILD_EXIT_OBSERVED" });
    });
    // The barrier mutates the relevant basis AND the reader returns a FAILED page.
    const result = await h.preview(() => {
      h.recorder.recordIdentity(obs(h.attemptId, "wpi-2", "worker-2"));
      h.recorder.finalizeInvocation({ attemptId: h.attemptId, invocationId: "wpi-2", closeReason: "CHILD_EXIT_OBSERVED" });
    });
    // The RACED outcome takes precedence: no page is admitted.
    expect(result.provenance.qualificationState).toBe("RACED");
    h.store.close();
  });
});

/* ================================================================== §7.4 the basis helpers */

describe("P2D1 §7.4 — the relevant-basis helpers compare like with like", () => {
  it("an unchanged basis has no difference; a new Invocation is a difference; a moved head alone is NOT", () => {
    const base = {
      storeHead: 5,
      attemptInvocationIds: Object.freeze(["wpi-1"]),
      selectedInvocationEventIds: Object.freeze(["e1", "e2"]),
      foreignCreatorAttemptIds: Object.freeze([]),
      sourceEpochId: "epoch-1",
      sourceScopeKey: "a::b",
    };
    expect(relevantBasisDifference(base, base)).toBe(null);
    // A moved head with identical semantic facts is NOT a conflict (unrelated append, §7.4).
    expect(relevantBasisDifference(base, { ...base, storeHead: 9 })).toBe(null);
    // A new invocation IS a conflict.
    expect(relevantBasisDifference(base, { ...base, storeHead: 9, attemptInvocationIds: Object.freeze(["wpi-1", "wpi-2"]) })).toContain("Invocation set changed");
    // A foreign creator IS a conflict.
    expect(relevantBasisDifference(base, { ...base, storeHead: 9, foreignCreatorAttemptIds: Object.freeze(["attempt-x"]) })).toContain("creator claim");
  });

  it("associationRelevantBasisOf reads only the Attempt's own rows plus the one-session creator probe", async () => {
    const h = await harness("p2d1-c3-basis", (recorder, attemptId) => {
      recorder.recordIdentity(obs(attemptId, "wpi-1", "worker-1"));
      recorder.finalizeInvocation({ attemptId, invocationId: "wpi-1", closeReason: "CHILD_EXIT_OBSERVED" });
    });
    const basis = associationRelevantBasisOf({ store: h.store, projectId: "p2d1-c3-basis", attemptId: h.attemptId, invocationId: "wpi-1", dshSessionId: "worker-1", sourceEpochId: "epoch-1" });
    expect(basis.attemptInvocationIds).toEqual(["wpi-1"]);
    expect(basis.foreignCreatorAttemptIds).toEqual([]);
    expect(basis.selectedInvocationEventIds.length).toBe(2); // the observation and the finalization
    h.store.close();
  });
});
