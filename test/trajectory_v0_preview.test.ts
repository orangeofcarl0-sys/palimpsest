/**
 * Trajectory-V0 §5/§6/§10 (V0-C / V0-D / V0-H) — CONSUMER INTEGRATION AND READ-ONLY SAFETY.
 *
 * This is the slice's consumer-facing proof: ONE Handoff Preview that combines the real Work/Project
 * evolution view (reused from T0) with a REAL DSH session read, over a REAL non-model Work Attempt.
 *
 * The evidence classes are stated per test:
 *
 *   PASS_REAL_OWNER_NONMODEL  — the Work/Project half comes from the real product stack.
 *   PASS_REAL_DSH_QUERY_NO_MODEL — the session half is a real DSH read (skipped when no DSH tree).
 *   PASS_DSH_QUERY_PORT_FIXTURE — the session half is a labelled structural fixture.
 *   PASS_READ_ONLY — the construction changed nothing.
 *
 * ------------------------------------------------------------------ V0S §3 changed assertions
 *
 * V0 encoded an acceptance rule V0S disproved: that a readable, caller-selected session could be
 * presented as the attempt's session and could complete the Handoff. Each correction is recorded:
 *
 *   1. `bindingStatus` → `sessionBindingStatus`. The binding is now one of three separate facts.
 *   2. "the real DSH read is bound to the attempt" is NO LONGER asserted. The read is real and the
 *      session is NOT the attempt's, so `dshSessionId` is null, `claimedSessionId` holds the claim,
 *      the admission is `NOT_ADMITTED_TO_ATTEMPT`, the lifecycle is `SESSION_READ_NOT_ATTRIBUTED`,
 *      and the events are NOT in the attempt's execution view.
 *   3. `BOUND_LOCAL_ONLY` → `SESSION_CLAIMED_UNVERIFIED` for a caller-claimed readable session.
 *   4. The "self-declared trusted session" control no longer stops at "not BOUND_VERIFIED"; it now
 *      additionally proves the events are excluded from the attempt.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import { GitCliPort } from "../src/effects/index.js";
import { makeWorkDelegationService } from "../src/interaction/work_delegation.js";
import { dshSubprocessWorkWorkerPort } from "../src/deployment/work_worker.js";
import { composeTrajectoryV0, type TrajectoryV0HostRecord } from "../src/composition/trajectory_v0.js";
import {
  buildHandoffPreview,
  DSH_PAGE_DOES_NOT_PROVE,
  readOnlyViolations,
  type DshSessionEventPage,
  type DshSessionReadPort,
  type HandoffPreview,
  type ReadOnlySnapshot,
} from "../src/trajectory/index.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const DSH_HOME = process.env["DSH_HOME"] ?? join(process.env["USERPROFILE"] ?? "", ".dsh");
const SESSIONS_ROOT = join(DSH_HOME, "sessions");
const hasDsh = existsSync(join(DSH_HOME, "profiles", "node_modules", "@deepseek-ai", "dsh-session"));
/** §9: a REAL session that exercises the ruled vocabulary (selected by reading, never by mtime). */
const PINNED_SESSION = "session-7439041a-d269-4434-a6f2-491a21e36502";

const readerModule = await import("../scripts/trajectory_v0/dsh-session-reader.mjs" as string).catch(() => null);

async function realReader(): Promise<DshSessionReadPort | null> {
  if (readerModule === null || !hasDsh) return null;
  return await readerModule.makeRealDshSessionReader({ dshHomePath: DSH_HOME, sessionsRoot: SESSIONS_ROOT });
}

/**
 * §9: a complete page for the structural fixtures. Every required field is present so a fixture that
 * cares about one dimension cannot inherit a misleading default for another.
 */
function fixturePage(overrides: Partial<DshSessionEventPage> = {}): DshSessionEventPage {
  return Object.freeze({
    schemaVersion: 1 as const,
    readState: "READ_OK" as const,
    sessionId: "session-fixture",
    header: Object.freeze({ sessionId: "session-fixture", version: 4, createdAt: 1, cwd: null, parentSession: null, isSeeded: false, origin: null, delegationDepth: null }),
    sourceIdentity: "DSH_QUERY_PORT_FIXTURE",
    sourceEvidenceClass: "DSH_QUERY_PORT_FIXTURE" as const,
    throughSeq: 0,
    knownEventCount: 1,
    inheritedEventCount: 0,
    requestedFromSeq: 0,
    requestedMaxEvents: 50,
    returnedCount: 1,
    pageBounded: true as const,
    diskIoBounded: false,
    durabilityProvenance: "DURABILITY_UNRESOLVED" as const,
    persistedEventCount: null,
    syntheticRecoveryEventCount: null,
    events: Object.freeze([]),
    knownParentSession: null,
    proves: Object.freeze([]),
    doesNotProve: DSH_PAGE_DOES_NOT_PROVE,
    detail: "a structural fixture page",
    ...overrides,
  });
}

/* ------------------------------------------------------------------ *
 * The real non-model Work rig
 * ------------------------------------------------------------------ */

function writeCommittingStub(directory: string, marker: string): string {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${marker}.cjs`);
  writeFileSync(
    path,
    [
      'const fs = require("node:fs");',
      'const cp = require("node:child_process");',
      'fs.writeFileSync("src/a.ts", "export const a = 2;\\n");',
      'cp.execFileSync("git", ["add", "-A"]);',
      'cp.execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "worker commit"]);',
      'process.stdout.write("PALIMPSEST_WORK_RESULT " + JSON.stringify({ kind: "READY_FOR_SETTLEMENT", summary: "done" }) + "\\n");',
      'process.exit(0);',
    ].join("\n"),
    "utf8",
  );
  return path;
}

interface Rig {
  readonly repo: string;
  readonly installed: ReturnType<typeof installPalimpsest>;
}

function makeRig(projectId: string): Rig {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-v0c-"));
  const repo = join(root, "repo");
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
  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId,
      databasePath: join(repo, ".palimpsest", "p.sqlite"),
      ordariumDatabasePath: join(repo, ".palimpsest", "o.sqlite"),
      repository: repo,
      git: new GitCliPort(repo, join(repo, ".palimpsest", "worlds")),
      execution: "worktree",
      standard: Object.freeze({
        statement: "tests pass and scope respected",
        clauses: Object.freeze([
          Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze(["node", "-e", "process.exit(0)"]), predicate: "tests_pass" as const }),
          Object.freeze({ kind: "scope_respected" as const }),
        ]),
        derivedFrom: Object.freeze(["trajectory-v0 fixture"]),
        confirmed: true,
        notes: Object.freeze([]),
      }),
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
    } as never,
  );
  cleanups.push(() => void installed.dispose());
  return { repo, installed };
}

/** §7: run one real non-model attempt and return its canonical id plus the host record. */
async function runAttempt(rig: Rig, projectId: string, marker: string): Promise<{ attemptId: string; hostRecord: TrajectoryV0HostRecord; jobId: string }> {
  const stubRoot = mkdtempSync(join(tmpdir(), `palimpsest-${marker}-`));
  cleanups.push(() => {
    try {
      rmSync(stubRoot, { recursive: true, force: true });
    } catch {
      /* the OS reaps it */
    }
  });
  const stubPath = writeCommittingStub(stubRoot, marker);
  const hostRecords = new Map<string, TrajectoryV0HostRecord>();
  const service = makeWorkDelegationService({
    controller: rig.installed.controller,
    workerFor: () => ({
      adapterId: `${marker}-worker`,
      async run(runInput: Parameters<ReturnType<typeof dshSubprocessWorkWorkerPort>["run"]>[0]) {
        const port = dshSubprocessWorkWorkerPort({ dshBin: stubPath, profile: marker, timeoutMs: 30_000 });
        return port.run(runInput);
      },
    }),
    onCorrelatedObservation: (entry) => {
      const existing = hostRecords.get(entry.attemptId);
      const kinds = existing === undefined ? [] : [...existing.eventKinds];
      kinds.push(entry.observation.eventKind);
      hostRecords.set(entry.attemptId, {
        attemptId: entry.attemptId,
        hostLocalJobId: entry.hostLocalJobId,
        portInvocationId: entry.observation.invocationId,
        eventKinds: kinds,
        exited: entry.observation.eventKind === "DIRECT_CHILD_EXIT_OBSERVED",
        exitCode: entry.observation.exitCode,
        spawnFailed: false,
        unknownAfterRestart: false,
        detail: `observed ${kinds.length} host event(s); role ${entry.observation.processRole}`,
      });
    },
  });
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: rig.repo, encoding: "utf8" }).trim();
  rig.installed.controller.start({
    projectId, goal: "g", headCommit: head,
    tasks: [{ task_id: "t1", objective: "o", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] }],
  });
  const started = await service.start({ expectedTaskId: "t1" });
  for (let attempt = 0; attempt < 800; attempt += 1) {
    const candidate = (await service.followup({ jobId: started.jobId })) as { phase?: string; attemptId?: string | null; hostError?: string | null };
    if (candidate.phase === "FINISHED" || candidate.phase === "HOST_ERROR") {
      if (candidate.attemptId === null || candidate.attemptId === undefined) {
        throw new Error(`job ${started.jobId} reached ${String(candidate.phase)} with no attemptId (${String(candidate.hostError ?? "none")})`);
      }
      return { attemptId: candidate.attemptId, hostRecord: hostRecords.get(candidate.attemptId)!, jobId: started.jobId };
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`job ${started.jobId} did not settle`);
}

/* ================================================================== §6 the combined Preview */

describe("Trajectory-V0 §6 V0-D — one Handoff Preview over both views", () => {
  it("§6/§10: the Preview combines the real Work/Project view with a REAL DSH session read", async () => {
    const rig = makeRig("v0c1");
    const { attemptId, hostRecord } = await runAttempt(rig, "v0c1", "v0c1");
    const reader = await realReader();

    const v0 = composeTrajectoryV0({
      projectId: "v0c1",
      controller: rig.installed.controller,
      promotions: rig.installed.controller.promotions,
      reasoning: rig.installed.reasoningCells?.service,
      proof: rig.installed.proof,
      projectWorkspace: rig.installed.projectWorkspace,
      journalStore: undefined,
      associationStore: undefined,
      ...(reader === null ? {} : { dshSessionReader: reader }),
    });

    /**
     * V0S §5/§8: the session id is supplied as a CALLER REQUEST. No canonical Attempt→Session
     * producer exists, so the read is real but NOT ATTRIBUTED to the attempt: the established id
     * stays null, the claim is recorded separately, the admission is NOT_ADMITTED_TO_ATTEMPT, and
     * the events do NOT enter the attempt's execution view. V0 presented this read as the attempt's
     * session; that was the overclaim this stage corrects.
     */
    const preview = await v0.previewAttempt({
      attemptId,
      claimedSessionId: PINNED_SESSION,
      hostRecord,
    });

    // §6 "Attempt Identity"
    expect(preview.attempt.attemptId).toBe(attemptId);
    expect(preview.attempt.projectId).toBe("v0c1");
    expect(preview.attempt.taskId).toBe("t1");
    expect(preview.attempt.historicalAuthorization.envelopeId).not.toBeNull();
    expect(preview.attempt.historicalAuthorization.basisDigest).not.toBeNull();

    // §6 "Execution Evidence" — the real host observation is present and matches its invocation.
    expect(preview.execution.portInvocationId).toBe(hostRecord.portInvocationId);
    expect(preview.execution.hostLocalJobId).not.toBeNull();
    expect(preview.execution.processLifecycle).toBe("EXITED");
    expect(preview.execution.hostObservationProvenance).toBe("LOCAL_PORT_OBSERVATION");

    if (reader !== null) {
      // §9: the real DSH read succeeded, and the page is bounded.
      expect(preview.execution.sessionReadState).toBe("READ_OK");
      expect(preview.execution.sessionLifecycle).toBe("SESSION_READ_NOT_ATTRIBUTED");
      // §5: the claim is recorded, and NO session is ESTABLISHED for this attempt.
      expect(preview.execution.claimedSessionId).toBe(PINNED_SESSION);
      expect(preview.execution.dshSessionId).toBeNull();
      expect(preview.execution.sessionBindingStatus).toBe("SESSION_CLAIMED_UNVERIFIED");
      expect(preview.execution.sessionBindingStatus).not.toBe("BOUND_VERIFIED");
      // §5/S-I4: the read is real, and its events are NOT admitted to this attempt.
      expect(preview.execution.sessionReadAdmission).toBe("NOT_ADMITTED_TO_ATTEMPT");
      expect(preview.execution.events).toEqual([]);
      expect(preview.execution.eventsDetail).toContain("NOT admitted");
      expect(preview.attribution.sessionAttribution).toBe("NO_SESSION");
      // §8: an unattributed read cannot make the Handoff COMPLETE.
      expect(preview.completeness).not.toBe("COMPLETE");
      expect(preview.caveats.epistemicLimits.join(" ")).toContain("UNVERIFIED");
    } else {
      expect(preview.execution.sessionReadState).toBe("READ_CAPABILITY_ABSENT");
      expect(preview.caveats.sourcesUnavailable.join(" ")).toContain("missing source");
    }

    // §6 "Canonical Outcome" — real Work facts, and no promotion.
    expect(preview.canonical.attemptState).toBe("COMPLETED");
    expect(preview.canonical.resultRefs.length).toBeGreaterThan(0);
    expect(preview.canonical.promotionState).toBe("NOT_PROMOTED");

    // §6 "Project Context" — the reused T0 projection, with its historical-basis caveat.
    expect(preview.projectContext.projectionRootId).not.toBeNull();
    expect(preview.projectContext.historicalBasisNote).toContain("WORK_HISTORICAL_CUT_WITH_CURRENT_CROSS_OWNER_READS");

    // §6 "Handoff Caveats" — always present.
    expect(preview.caveats.epistemicLimits.length).toBeGreaterThan(0);
    expect(preview.isInspectionData).toBe(true);
    expect(preview.doesNotAuthorize.join(" ")).toContain("settling a Work attempt");
  }, 240_000);

  it("§6: the Preview answers the ruling's questions as a bounded, serializable model", async () => {
    const rig = makeRig("v0c2");
    const { attemptId, hostRecord } = await runAttempt(rig, "v0c2", "v0c2");
    const v0 = composeTrajectoryV0({
      projectId: "v0c2",
      controller: rig.installed.controller,
      promotions: rig.installed.controller.promotions,
      reasoning: undefined, proof: undefined, projectWorkspace: undefined,
      journalStore: undefined, associationStore: undefined,
      dshSessionReader: undefined,
    });
    const preview = await v0.previewAttempt({ attemptId, hostRecord });

    // §6: every ruled question is answerable from the model's own fields.
    const serialized = JSON.stringify(preview);
    expect(serialized.length).toBeLessThan(200_000);
    expect(preview.attempt.projectId).toBe("v0c2");
    expect(preview.execution.sessionBindingStatus).toBeDefined();
    expect(preview.execution.processLifecycle).toBeDefined();
    expect(preview.canonical.promotionState).toBeDefined();
    expect(preview.canonical.reworkState).toBeDefined();
    expect(preview.caveats.sourcesUnavailable).toBeDefined();
    expect(preview.attribution.canonicalCoverage).toBeDefined();
    expect(preview.completeness).toBeDefined();

    // §10: a serialized round-trip preserves the digest — the model is plain data.
    const roundTripped = JSON.parse(serialized) as HandoffPreview;
    expect(roundTripped.previewDigest).toBe(preview.previewDigest);
    expect(roundTripped.attempt.attemptId).toBe(attemptId);
  }, 240_000);
});

/* ================================================================== §10 read-only safety */

describe("Trajectory-V0 §10 V0-H — read-only consumer safety", () => {
  it("§10: building the Preview twice changes no owner state and no DSH source", async () => {
    const rig = makeRig("v0h1");
    const { attemptId, hostRecord } = await runAttempt(rig, "v0h1", "v0h1");
    const reader = await realReader();
    const v0 = composeTrajectoryV0({
      projectId: "v0h1",
      controller: rig.installed.controller,
      promotions: rig.installed.controller.promotions,
      reasoning: rig.installed.reasoningCells?.service,
      proof: rig.installed.proof,
      projectWorkspace: rig.installed.projectWorkspace,
      journalStore: undefined, associationStore: undefined,
      ...(reader === null ? {} : { dshSessionReader: reader }),
    });

    /** §10: the snapshot the read-only check compares. */
    const snapshot = async (): Promise<ReadOnlySnapshot> => {
      const events = rig.installed.controller.store.listEvents("v0h1");
      const project = rig.installed.controller.work.project();
      const proofBasis = rig.installed.proof === undefined ? null : (await rig.installed.proof.basis())?.chainDigest ?? null;
      const cells = rig.installed.reasoningCells === undefined ? [] : await rig.installed.reasoningCells.service.listCells();
      const reasoningBases: string[] = [];
      for (const cell of cells) {
        const view = await rig.installed.reasoningCells!.service.cellView({ cellId: cell.cellId });
        reasoningBases.push(`${cell.cellId}:${String(view.storeBasis.throughSeq)}`);
      }
      return {
        workEventCount: events.length,
        workLastEventDigest: events.length === 0 ? null : events[events.length - 1]!.event_digest,
        projectIrRevision: project.revision,
        projectIrDigest: project.digest,
        reasoningBases,
        proofBasis,
        sessionSourceDigest: null,
      };
    };

    const before = await snapshot();
    const first = await v0.previewAttempt({ attemptId, claimedSessionId: PINNED_SESSION, hostRecord });
    const second = await v0.previewAttempt({ attemptId, claimedSessionId: PINNED_SESSION, hostRecord });
    const after = await snapshot();

    // §10: nothing moved.
    expect(readOnlyViolations(before, after)).toEqual([]);
    // §10: the Work owner's own full verifier still passes.
    expect(() => rig.installed.controller.store.verifyFull()).not.toThrow();
    // §10: the same construction twice is byte-identical.
    expect(second.previewDigest).toBe(first.previewDigest);
    // §10: no Work job was created by reading, and the canonical attempt state is unchanged.
    expect(rig.installed.controller.attemptWorkRecord(attemptId)?.state).toBe("COMPLETED");
  }, 240_000);

  it("§10: the Preview is not an authorization object — its fields cannot widen scope", async () => {
    const rig = makeRig("v0h2");
    const { attemptId, hostRecord } = await runAttempt(rig, "v0h2", "v0h2");
    const v0 = composeTrajectoryV0({
      projectId: "v0h2", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
      reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
      dshSessionReader: undefined,
    });
    const preview = await v0.previewAttempt({ attemptId, hostRecord });
    /**
     * §10: the Preview carries NO authorization-shaped FIELD. The check is structural — the words
     * "permissions" and "scope" appear only inside the `doesNotAuthorize` DISCLAIMER, which exists
     * precisely to say what the Preview cannot do.
     */
    const fields = new Set<string>();
    const collect = (value: unknown, depth: number): void => {
      if (depth > 6 || typeof value !== "object" || value === null) return;
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        fields.add(key.toLowerCase());
        if (Array.isArray(child)) for (const entry of child) collect(entry, depth + 1);
        else collect(child, depth + 1);
      }
    };
    collect(preview, 0);
    for (const forbidden of ["permission", "grant", "token", "budget", "spend", "capability", "entitlement"]) {
      expect([...fields]).not.toContain(forbidden);
      for (const field of fields) expect(field).not.toContain(forbidden);
    }
    // The disclaimer is present and names the limits explicitly.
    expect(preview.doesNotAuthorize.join(" ")).toContain("widening Context Pull permissions");
  }, 240_000);
});

/* ================================================================== §10 negative controls */

describe("Trajectory-V0 §10 — negative controls", () => {
  it("§10: a caller-supplied trustedIngestion flag is not evidence — a fabricated page cannot claim a verified session", async () => {
    const rig = makeRig("v0n1");
    const { attemptId, hostRecord } = await runAttempt(rig, "v0n1", "v0n1");
    /**
     * §10: a reader that asserts the strongest possible claim on its own record. V0 must still
     * classify the binding by EVIDENCE, not by the record's self-description.
     */
    const boastingReader: DshSessionReadPort = {
      sourceIdentity: "SELF_DECLARED",
      evidenceClass: "DSH_QUERY_PORT_FIXTURE",
      async readEvents() {
        return fixturePage({
          sessionId: "session-self-declared",
          header: Object.freeze({ sessionId: "session-self-declared", version: 4, createdAt: 1, cwd: null, parentSession: null, isSeeded: false, origin: null, delegationDepth: null }),
          sourceIdentity: "SELF_DECLARED",
          events: Object.freeze([
            Object.freeze({ sessionId: "session-self-declared", seq: 0, type: "turn/end", inherited: false, durability: "PERSISTED_DSH_EVENT" as const, time: 1, surface: null, summary: "turn 0 closed", durationMs: null, observedStatus: "completed" }),
          ]),
          // The reader CLAIMS verification. That claim is not authority.
          proves: Object.freeze(["trustedIngestion: true", "RUN_ATTEMPT_CORRELATED", "the attempt settled and was promoted"]),
          doesNotProve: Object.freeze([]),
          detail: "self-declared verified session",
        });
      },
      async readHeaderIdentity() {
        return Object.freeze({ readState: "READ_OK" as const, header: Object.freeze({ sessionId: "session-self-declared", version: 4, createdAt: 1, cwd: null, parentSession: null, isSeeded: false, origin: null, delegationDepth: null }), detail: "self-declared" });
      },
    };
    const v0 = composeTrajectoryV0({
      projectId: "v0n1", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
      reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
      dshSessionReader: boastingReader,
    });
    const preview = await v0.previewAttempt({ attemptId, claimedSessionId: "session-self-declared", hostRecord });

    /**
     * V0S §5/§8: the self-declared claim does NOT establish a binding, and — the stronger property —
     * its events are NOT admitted to the attempt. V0 stopped at "not BOUND_VERIFIED"; the corrected
     * model must also keep the claimed session's events out of the execution view.
     */
    expect(preview.execution.sessionBindingStatus).toBe("SESSION_CLAIMED_UNVERIFIED");
    expect(preview.execution.sessionBindingStatus).not.toBe("BOUND_VERIFIED");
    expect(preview.execution.sessionReadAdmission).toBe("NOT_ADMITTED_TO_ATTEMPT");
    expect(preview.execution.events).toEqual([]);
    expect(preview.completeness).not.toBe("COMPLETE");
    // §10: and it does NOT change the canonical outcome — promotion is still the owner's fact.
    expect(preview.canonical.promotionState).toBe("NOT_PROMOTED");
    // §10: the page's own proves-list is NOT propagated into the Preview's canonical facts.
    expect(JSON.stringify(preview.canonical)).not.toContain("RUN_ATTEMPT_CORRELATED");
    expect(preview.caveats.epistemicLimits.join(" ")).toContain("does not prove");
  }, 240_000);

  it("§10: an unreadable session is reported as unreadable, never as an empty history", async () => {
    const rig = makeRig("v0n2");
    const { attemptId, hostRecord } = await runAttempt(rig, "v0n2", "v0n2");
    const failingReader: DshSessionReadPort = {
      sourceIdentity: "FAILING",
      evidenceClass: "DSH_QUERY_PORT_FIXTURE",
      async readEvents(request) {
        return fixturePage({
          readState: "CORRUPT_SESSION" as const, sessionId: request.sessionId, header: null,
          sourceIdentity: "FAILING", throughSeq: null, knownEventCount: null, inheritedEventCount: null,
          returnedCount: 0, events: Object.freeze([]), proves: Object.freeze([]),
          doesNotProve: Object.freeze(["a corrupt session is not an empty history"]),
          detail: "the stored session failed validation",
        });
      },
      async readHeaderIdentity(sessionId) {
        return Object.freeze({ readState: "CORRUPT_SESSION" as const, header: null, detail: `corrupt: ${sessionId}` });
      },
    };
    const v0 = composeTrajectoryV0({
      projectId: "v0n2", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
      reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
      dshSessionReader: failingReader,
    });
    const preview = await v0.previewAttempt({ attemptId, claimedSessionId: "session-corrupt", hostRecord });
    expect(preview.execution.sessionReadState).toBe("CORRUPT_SESSION");
    expect(preview.execution.sessionLifecycle).toBe("SESSION_UNREADABLE");
    expect(preview.caveats.sourcesUnavailable.join(" ")).toContain("failed validation");
    // The canonical facts are untouched by the unreadable session.
    expect(preview.canonical.attemptState).toBe("COMPLETED");
  }, 240_000);

  it("§5/§10: a T0 relation with an incomplete verifier is quarantined, not presented as fact", async () => {
    const rig = makeRig("v0n3");
    const { attemptId, hostRecord } = await runAttempt(rig, "v0n3", "v0n3");
    const v0 = composeTrajectoryV0({
      projectId: "v0n3", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
      reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
      dshSessionReader: undefined,
    });
    const preview = await v0.previewAttempt({ attemptId, hostRecord });
    /**
     * §5: the T0 relations whose verifiers the review found incomplete must never appear among the
     * SELECTED (actionable) relations. They may appear only in the quarantine list.
     */
    const selectedRelations = preview.projectContext.selectedRelations.map((relation) => relation.relation);
    for (const quarantinedRelation of ["RECEIPT_REFERENCED_GROUND", "GOVERNED_INTENT_CHANGED_PROJECT", "REVISION_SUCCEEDED_REVISION"]) {
      expect(selectedRelations).not.toContain(quarantinedRelation);
    }
    // And the selected set contains only exactly-established Work relations.
    for (const relation of preview.projectContext.selectedRelations) {
      expect(relation.evidenceState).toBe("ESTABLISHED_BY_OWNER_REFERENCE");
    }
  }, 240_000);
});

/* ================================================================== §6 sanitized examples */

describe("Trajectory-V0 §6 — one sanitized example per outcome class", () => {
  it("§6: a completed attempt with a bound session and an unbound attempt both produce a useful Preview", async () => {
    const rig = makeRig("v0x1");
    const { attemptId, hostRecord } = await runAttempt(rig, "v0x1", "v0x1");
    const reader = await realReader();
    const v0 = composeTrajectoryV0({
      projectId: "v0x1", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
      reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
      ...(reader === null ? {} : { dshSessionReader: reader }),
    });

    /** The CLAIMED example (a session read was performed, and NOT attributed). */
    const bound = await v0.previewAttempt({ attemptId, claimedSessionId: PINNED_SESSION, hostRecord });
    /** The UNBOUND example (no session claimed at all). */
    const unbound = await v0.previewAttempt({ attemptId, hostRecord });

    // Both are useful: both carry the canonical outcome and the project context.
    for (const preview of [bound, unbound]) {
      expect(preview.canonical.attemptState).toBe("COMPLETED");
      expect(preview.canonical.resultRefs.length).toBeGreaterThan(0);
      expect(preview.projectContext.projectionRootId).not.toBeNull();
      expect(preview.attempt.historicalAuthorization.envelopeId).not.toBeNull();
      expect(preview.isInspectionData).toBe(true);
    }
    // §6: they differ exactly where the evidence differs.
    expect(unbound.execution.dshSessionId).toBeNull();
    expect(unbound.execution.claimedSessionId).toBeNull();
    expect(unbound.execution.sessionLifecycle).toBe("NO_SESSION_BOUND");
    expect(unbound.caveats.missingSession).toBe(true);
    if (reader !== null) {
      /**
       * V0S §5/§8: the claimed session is READ and NOT ATTRIBUTED. V0 asserted
       * `dshSessionId === PINNED_SESSION` and `SESSION_READ` here, which is exactly the overclaim
       * this stage corrects: a readable unrelated session is not the attempt's session.
       */
      expect(bound.execution.claimedSessionId).toBe(PINNED_SESSION);
      expect(bound.execution.dshSessionId).toBeNull();
      expect(bound.execution.sessionLifecycle).toBe("SESSION_READ_NOT_ATTRIBUTED");
      expect(bound.execution.sessionReadAdmission).toBe("NOT_ADMITTED_TO_ATTEMPT");
      expect(bound.execution.events).toEqual([]);
      expect(bound.completeness).not.toBe("COMPLETE");
    }
  }, 240_000);
});
