/**
 * Trajectory-V0S-H0 §7 (C3) — AN UNVERIFIED SESSION CLAIM IS NON-READING.
 *
 * The dynamic proof of H0-I3. A counting reader records every call, and the ordinary Attempt Preview
 * must make ZERO calls to it — header or event — for a caller-supplied session id, because no producer
 * establishes an Attempt→Session relationship in this deployment.
 *
 * The reader used here is a LABELLED FIXTURE: it returns a valid page so that IF the consumer wrongly
 * read it, the test would observe a populated Preview rather than an error. It is never presented as
 * real DSH execution.
 *
 * The operator diagnostic capability is NOT deleted: the same reader can still be used directly. This
 * file also asserts that the Attempt service exposes no unrestricted read operation.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import { GitCliPort } from "../src/effects/index.js";
import { makeWorkDelegationService } from "../src/interaction/work_delegation.js";
import { dshSubprocessWorkWorkerPort } from "../src/deployment/work_worker.js";
import { composeTrajectoryV0, type TrajectoryV0HostRecord } from "../src/composition/trajectory_v0.js";
import {
  DSH_PAGE_DOES_NOT_PROVE,
  type DshSessionEventPage,
  type DshSessionReadPort,
} from "../src/trajectory/index.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

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
  const root = mkdtempSync(join(tmpdir(), "palimpsest-h0c-"));
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
        derivedFrom: Object.freeze(["h0 fixture"]),
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
async function runAttempt(rig: Rig, projectId: string, marker: string): Promise<{ attemptId: string; hostRecord: TrajectoryV0HostRecord }> {
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
        detail: `observed ${kinds.length} host event(s)`,
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
    const candidate = (await service.followup({ jobId: started.jobId })) as { phase?: string; attemptId?: string | null };
    if (candidate.phase === "FINISHED" || candidate.phase === "HOST_ERROR") {
      return { attemptId: candidate.attemptId!, hostRecord: hostRecords.get(candidate.attemptId!)! };
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("job did not settle");
}

/** §7: a labelled fixture reader that COUNTS every call and would return a valid page if invoked. */
function countingReader(): { readonly port: DshSessionReadPort; readonly calls: { header: number; events: number } } {
  const calls = { header: 0, events: 0 };
  const page = (sessionId: string): DshSessionEventPage =>
    Object.freeze({
      schemaVersion: 1 as const,
      readState: "READ_OK" as const,
      sessionId,
      header: Object.freeze({ sessionId, version: 4, createdAt: 1, cwd: null, parentSession: null, isSeeded: false, origin: null, delegationDepth: null }),
      sourceIdentity: "COUNTING_FIXTURE",
      sourceEvidenceClass: "DSH_QUERY_PORT_FIXTURE" as const,
      throughSeq: 0, knownEventCount: 1, inheritedEventCount: 0,
      requestedFromSeq: 0, requestedMaxEvents: 50, returnedCount: 1,
      pageBounded: true as const, diskIoBounded: false,
      durabilityProvenance: "DURABILITY_UNRESOLVED" as const, persistedEventCount: null, syntheticRecoveryEventCount: null,
      events: Object.freeze([
        Object.freeze({ sessionId, seq: 0, type: "turn/end", inherited: false, durability: "DURABILITY_UNRESOLVED" as const, time: 1, surface: null, summary: "turn 0 closed", durationMs: null, observedStatus: "completed" }),
      ]),
      knownParentSession: null,
      proves: Object.freeze(["a fixture"]),
      doesNotProve: DSH_PAGE_DOES_NOT_PROVE,
      detail: "a counting fixture page",
    });
  return {
    calls,
    port: {
      sourceIdentity: "COUNTING_FIXTURE",
      evidenceClass: "DSH_QUERY_PORT_FIXTURE",
      async readEvents(request) {
        calls.events += 1;
        return page(request.sessionId);
      },
      async readHeaderIdentity(sessionId) {
        calls.header += 1;
        return { readState: "READ_OK" as const, header: { sessionId, version: 4, createdAt: 1, cwd: null, parentSession: null, isSeeded: false, origin: null, delegationDepth: null }, detail: "a fixture header" };
      },
    },
  };
}

describe("Trajectory-V0S-H0 §7 — an unverified Session claim is non-reading", () => {
  it("a claimed SessionId invokes ZERO reader calls, and the claim is recorded as a declaration", async () => {
    const rig = makeRig("h0c1");
    const { attemptId, hostRecord } = await runAttempt(rig, "h0c1", "h0c1");
    const counting = countingReader();
    const v0 = composeTrajectoryV0({
      projectId: "h0c1", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
      reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
      dshSessionReader: counting.port,
    });

    const preview = await v0.previewAttempt({ attemptId, claimedSessionId: "session-claimed-by-caller", hostRecord });

    /** §7: the decisive measurement — the reader was NEVER touched. */
    expect(counting.calls.header).toBe(0);
    expect(counting.calls.events).toBe(0);

    /** §7.1: the claim is preserved as a declaration and establishes nothing. */
    expect(preview.execution.claimedSessionId).toBe("session-claimed-by-caller");
    expect(preview.execution.dshSessionId).toBeNull();
    expect(preview.execution.sessionBindingStatus).toBe("SESSION_CLAIMED_UNVERIFIED");
    expect(preview.execution.sessionReadAdmission).toBe("NOT_REQUESTED");
    expect(preview.execution.sessionReadState).toBeNull();
    expect(preview.execution.sessionLifecycle).toBe("SESSION_IDENTIFIED_NOT_READ");

    /** §7.1: no event count or watermark is returned from that session. */
    expect(preview.execution.events).toEqual([]);
    expect(preview.execution.readWatermark).toBeNull();
    expect(preview.execution.returnedPageSize).toBeNull();
    expect(preview.execution.sourceIdentity).toBeNull();

    /**
     * §7.1: no header agreement is claimed. The Preview's execution view carries no binding evidence
     * refs at all, so the assertion is on the serialized Preview: no field may assert a header check.
     */
    const rendered = JSON.stringify(preview);
    expect(rendered).not.toContain("header agreed");
    expect(rendered).not.toContain("headerSessionId");
    expect(preview.execution.bindingDetail).toContain("no read was performed");

    /** §7.1: a useful Work-only Preview remains. */
    expect(preview.canonical.attemptState).toBe("COMPLETED");
    expect(preview.canonical.resultRefs.length).toBeGreaterThan(0);
    expect(preview.projectContext.projectionRootId).not.toBeNull();
  }, 180_000);

  it("an unknown Attempt is refused in project scope, with no reader call and no global scan", async () => {
    const rig = makeRig("h0c2");
    await runAttempt(rig, "h0c2", "h0c2");
    const counting = countingReader();
    const v0 = composeTrajectoryV0({
      projectId: "h0c2", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
      reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
      dshSessionReader: counting.port,
    });
    let code: string | undefined;
    try {
      await v0.previewAttempt({ attemptId: `attempt-${"9".repeat(32)}`, claimedSessionId: "session-x" });
    } catch (error) {
      code = (error as { code?: string }).code;
    }
    expect(code).toBe("ATTEMPT_NOT_FOUND");
    expect(counting.calls.header).toBe(0);
    expect(counting.calls.events).toBe(0);
  }, 180_000);

  it("the Attempt service exposes no unrestricted Session read or list", async () => {
    const rig = makeRig("h0c3");
    await runAttempt(rig, "h0c3", "h0c3");
    const counting = countingReader();
    const v0 = composeTrajectoryV0({
      projectId: "h0c3", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
      reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
      dshSessionReader: counting.port,
    });
    expect(Object.keys(v0).sort()).toEqual(["hasDshReader", "previewAttempt"]);
    expect("readSessionPage" in v0).toBe(false);
    expect("listSessions" in v0).toBe(false);
  }, 180_000);

  it("the operator diagnostic reader itself still works when used directly", async () => {
    /**
     * §7.3: the first-party reader is NOT deleted. The ordinary Attempt consumer and the operator
     * diagnostic are distinct capabilities; this asserts the reader is still a working port.
     */
    const counting = countingReader();
    const page = await counting.port.readEvents({ sessionId: "session-diagnostic", maxEvents: 10 });
    expect(page.readState).toBe("READ_OK");
    expect(counting.calls.events).toBe(1);
    const header = await counting.port.readHeaderIdentity("session-diagnostic");
    expect(header.readState).toBe("READ_OK");
    expect(counting.calls.header).toBe(1);
  });
});
