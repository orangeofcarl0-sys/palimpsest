/**
 * CI3 §13/§14 — FINISH-PATH AND DELEGATED COMPATIBILITY, AND THE LIMITED TRAJECTORY CONTINUITY CHECK.
 *
 * THE QUESTION.
 *
 *   The CI3 correction touched the SHARED evidence writer, which both the Finish route and the delegated
 *   route reach. Does the normal Finish path still behave exactly as it did, does the delegated PASS still
 *   hold, and does the Trajectory projection still preserve the evidence identity and the qualification
 *   history without inventing causality?
 *
 * WHY THE FINISH PATH IS ASSERTED FIELD BY FIELD.
 *
 * A convergence change is easy to make and hard to bound: the failure mode is that the Finish route, which
 * records as it goes and stops at the first contradiction, silently starts converging where it used to
 * record fresh. So this file pins the atoms by shape — predicate set, command, exit code, producer — on a
 * genuinely finished attempt, and then checks that the delegated route produces its own distinct set.
 *
 * THE TRAJECTORY SECTION IS DELIBERATELY NARROW (§14).
 *
 * CI1 established that `TEMPORAL_ONLY` edges must not be read as project causality. CI3 does not add a
 * relation kind, does not redesign the projection, and does not make Trajectory a source of authority. What
 * it checks is that the evidence identity and the qualification history survive into the projection and that
 * the projection does not manufacture a cross-Owner dependency out of an `EVIDENCE_STALE` ordering.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import { GitCliPort } from "../src/effects/index.js";
import { callbackRuntimeCarrierPort } from "../src/runtime/index.js";
import type { WorkWorkerRunPort } from "../src/interaction/work_delegation.js";
import type { ProjectStandard } from "../src/domain/standard.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
}, 180_000);

function removeTree(path: string): void {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      rmSync(path, { recursive: true, force: true });
      return;
    } catch {
      /* a live handle; retry after the child closes */
    }
  }
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    /* left in place */
  }
}

const PASSING = ["node", "-e", "process.exit(0)"];

const STANDARD: ProjectStandard = Object.freeze({
  statement: "the artifact exists, the scope is respected and the check command passes",
  clauses: Object.freeze([
    Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze([...PASSING]), predicate: "process_exit_zero" as const }),
    Object.freeze({ kind: "files_exist" as const, paths: Object.freeze(["src/a.ts"]) }),
    Object.freeze({ kind: "scope_respected" as const }),
  ]),
  derivedFrom: Object.freeze(["ci3 compat fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

const TASK = {
  task_id: "task-a",
  objective: "write src/a.ts inside the declared scope",
  depends_on: [] as string[],
  write_paths: ["src/a.ts"],
  required_artifacts: ["src/a.ts"],
};

function worker(): WorkWorkerRunPort {
  return {
    adapterId: "ci3-compat-worker",
    async run(input) {
      const scope = input.context.work.writeScope;
      const file = Array.isArray(scope) && scope.length > 0 ? String(scope[0]) : "src/a.ts";
      mkdirSync(join(input.workDir, file, ".."), { recursive: true });
      writeFileSync(join(input.workDir, file), "export const a = 1;\n");
      execFileSync("git", ["add", "-A"], { cwd: input.workDir });
      execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "candidate"], { cwd: input.workDir });
      return { kind: "READY_FOR_SETTLEMENT" };
    },
  };
}

interface Rig {
  readonly installed: ReturnType<typeof installPalimpsest>;
  readonly projectId: string;
  readonly repo: string;
  readonly head: string;
  readonly connection: {
    prepare: (sql: string) => { all: (...args: never[]) => unknown; get: (...args: never[]) => unknown };
  };
  readonly start: () => Promise<void>;
  readonly taskState: (taskId: string) => string;
}

function makeRig(projectId: string): Rig {
  const repo = mkdtempSync(join(tmpdir(), `ci3x-${projectId}-`));
  cleanups.push(() => removeTree(repo));
  execFileSync("git", ["init", "-q"], { cwd: repo });
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "base.ts"), "export const base = 1;\n");
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "S0"], { cwd: repo });
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  const rigDir = mkdtempSync(join(tmpdir(), `ci3x-rig-${projectId}-`));
  const installed = installPalimpsest({ tools: { register: () => () => undefined } } as never, {
    projectId,
    databasePath: join(rigDir, "p.sqlite"),
    ordariumDatabasePath: join(rigDir, "o.sqlite"),
    repository: repo,
    git: new GitCliPort(repo, join(repo, ".palimpsest", "worlds")),
    execution: "worktree",
    concurrency: 1,
    standard: STANDARD,
    policy: trustedDefaultPolicy({ allowed_commands: [{ executable: PASSING[0]!, argv_prefix: PASSING.slice(1) }] }),
    runtimeCarrierPort: callbackRuntimeCarrierPort(`ci3x-${projectId}`, {
      onRealize: async (request) => ({
        runtimeAgent: { runtimeAdapter: "ci3x", agentId: `agent-${request.activationId}` },
        session: { runtimeAdapter: "ci3x", sessionId: `session-${request.activationId}` },
      }),
      onRelease: async () => undefined,
    }),
    workWorkerPort: () => worker(),
  } as never);
  cleanups.push(() => {
    try {
      installed.dispose();
    } catch {
      /* best effort */
    }
    removeTree(rigDir);
  });
  const connection = installed.controller.store.connection as unknown as Rig["connection"];
  return {
    installed,
    projectId,
    repo,
    head,
    connection,
    start: async () => {
      const tool = installed.tools.find((entry) => entry.name === "palimpsest_start");
      if (tool === undefined) throw new Error("no start tool");
      await tool.execute(
        { projectId, goal: "compat", headCommit: head, tasks: [TASK] },
        { callId: "c", rootCallId: "r", name: "palimpsest_start", arguments: {}, signal: new AbortController().signal },
      );
    },
    taskState: (taskId) => {
      const row = connection.prepare("SELECT state FROM tasks WHERE project_id=? AND task_id=?").get(projectId as never, taskId as never) as
        | { state: string }
        | undefined;
      return row?.state ?? "ABSENT";
    },
  };
}

describe("CI3 D2 — the normal Finish path is unchanged", () => {
  it("finishing an in-place attempt records the standard's atoms with the Finish producer and PASSES the gate", async () => {
    /**
     * FINISH IS THE OTHER ROUTE INTO THE SAME WRITER, so it is the first thing a convergence change can
     * break. The assertions here are the atom SHAPE, not merely that a gate passes: predicate set, command,
     * exit code and producer. A convergence rule that returned an existing atom from the wrong route would
     * show up as a wrong producer, and a rule that suppressed a record would show up as a missing predicate.
     *
     * The deployment is IN-PLACE because that is the Finish route's own placement: the attempt works in the
     * canonical tree, so `finish` can observe it.
     */
    const projectId = "ci3xfin";
    const repo = mkdtempSync(join(tmpdir(), `ci3xfin-repo-`));
    cleanups.push(() => removeTree(repo));
    execFileSync("git", ["init", "-q"], { cwd: repo });
    mkdirSync(join(repo, "src"), { recursive: true });
    writeFileSync(join(repo, "src", "base.ts"), "export const base = 1;\n");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "S0"], { cwd: repo });
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
    const rigDir = mkdtempSync(join(tmpdir(), "ci3xfin-rig-"));
    const installed = installPalimpsest({ tools: { register: () => () => undefined } } as never, {
      projectId,
      databasePath: join(rigDir, "p.sqlite"),
      ordariumDatabasePath: join(rigDir, "o.sqlite"),
      repository: repo,
      git: new GitCliPort(repo, join(repo, ".palimpsest", "worlds")),
      execution: "in-place",
      concurrency: 1,
      standard: STANDARD,
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: PASSING[0]!, argv_prefix: PASSING.slice(1) }] }),
    } as never);
    cleanups.push(() => {
      try {
        installed.dispose();
      } catch {
        /* best effort */
      }
      removeTree(rigDir);
    });
    const connection = installed.controller.store.connection as unknown as Rig["connection"];
    const startTool = installed.tools.find((entry) => entry.name === "palimpsest_start");
    expect(startTool).toBeDefined();
    if (startTool === undefined) return;
    await startTool.execute(
      { projectId, goal: "finish compat", headCommit: head, tasks: [TASK] },
      { callId: "c", rootCallId: "r", name: "palimpsest_start", arguments: {}, signal: new AbortController().signal },
    );

    /** The direct, in-place lifecycle the Finish route uses. */
    installed.controller.step(); // TASK_STARTED
    const created = installed.controller.step(); // ATTEMPT_CREATED
    const attemptId = String(created!.entity_id);
    await installed.controller.claim(attemptId);

    /** The work lands IN the canonical tree — that is what an in-place attempt is. */
    mkdirSync(join(repo, "src"), { recursive: true });
    writeFileSync(join(repo, "src", "a.ts"), "export const a = 1;\n");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "finish candidate"], { cwd: repo });

    /**
     * `finish` closes the one RUNNING attempt of this in-place deployment — it takes no attempt id, because
     * the position it closes is the direct work position `begin` opened. That is the route's own contract.
     */
    const finished = await installed.controller.finish({ summary: "wrote src/a.ts" });
    expect(finished.attemptId).toBe(attemptId);
    expect(finished.state).toBe("COMPLETED");
    expect([...finished.evidenceRecorded].sort()).toEqual(["expected_files_exist", "process_exit_zero", "write_scope_valid"]);

    /** THE ATOM SHAPE, pinned field by field. */
    const rows = connection
      .prepare("SELECT status, evidence_json FROM evidence WHERE project_id=? AND json_extract(evidence_json,'$.subject_id')=?")
      .all(projectId as never, attemptId as never) as Array<{ status: string; evidence_json: Uint8Array }>;
    const atoms = rows.map((row) => JSON.parse(new TextDecoder().decode(row.evidence_json)) as Record<string, unknown>);
    expect(atoms).toHaveLength(3);
    expect(atoms.map((atom) => String(atom.predicate)).sort()).toEqual([
      "expected_files_exist",
      "process_exit_zero",
      "write_scope_valid",
    ]);
    /**
     * THE PRODUCER CONVENTION, as the product actually implements it and as CI2's Finish reference recorded
     * it: a COMMAND atom is `palimpsest-gate` (the command was observed through the gate's runner) and an
     * OBSERVED atom is `palimpsest-finish` (the tree fact came from the finish ladder). The delegated route
     * overrides both with its own producer, which is what makes the routes distinguishable.
     */
    const commandAtom = atoms.find((atom) => atom.predicate === "process_exit_zero")!;
    expect(commandAtom.producer).toBe("palimpsest-gate");
    for (const atom of atoms) {
      if (atom.predicate === "process_exit_zero") continue;
      expect(atom.producer).toBe("palimpsest-finish");
    }
    expect(commandAtom.command).toEqual(PASSING);
    expect(commandAtom.exit_code).toBe(0);
    /** The observed atoms carry no command. */
    for (const atom of atoms) {
      if (atom.predicate === "process_exit_zero") continue;
      expect(atom.command).toBeNull();
      expect(atom.exit_code).toBeNull();
    }
    /** And Finish's atoms name NO candidate — that gap is CI2's finding and CI3 does not change it. */
    for (const atom of atoms) {
      expect((atom.value as Record<string, unknown>)).not.toHaveProperty("result_commit");
    }

    /** The gate passes on them, and the attempt is completed. */
    expect(installed.controller.evaluateGate("gate-release", "attempt", attemptId).verdict).toBe("PASS");
    const state = connection.prepare("SELECT state FROM attempts WHERE project_id=? AND attempt_id=?").get(projectId as never, attemptId as never) as {
      state: string;
    };
    expect(state.state).toBe("COMPLETED");
    /** ATTEMPT_COMPLETED is still not evidence: the conclusion is the atoms', not the event's. */
    const completed = connection
      .prepare("SELECT COUNT(*) AS n FROM events WHERE project_id=? AND event_type='ATTEMPT_COMPLETED'")
      .get(projectId as never) as { n: number };
    expect(Number(completed.n)).toBe(1);
  });
});

describe("CI3 D2 — both routes reach the same writer and remain distinguishable", () => {
  it("a delegated attempt and a finished attempt produce the same predicates with different producers", async () => {
    /**
     * §13: "If shared evidence semantics are modified, establish whether both Finish and Delegated paths use
     * the same corrected behavior." The answer is structural — there is one builder — and the observable
     * difference is the producer attribution, which is `candidate.producer` and therefore route-specific.
     */
    const delegated = makeRig("ci3xdlg");
    await delegated.start();
    const service = delegated.installed.workDelegation!;
    const started = await service.start({ expectedTaskId: TASK.task_id });
    let attemptId: string | null = null;
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const view = await service.followup({ jobId: started.jobId });
      if ("phase" in view && (view.phase === "FINISHED" || view.phase === "HOST_ERROR")) {
        if ("attemptId" in view && typeof view.attemptId === "string") attemptId = view.attemptId;
        break;
      }
      await new Promise((done) => setTimeout(done, 50));
    }
    expect(attemptId).not.toBeNull();
    if (attemptId === null) return;

    const rows = delegated.connection
      .prepare("SELECT evidence_json FROM evidence WHERE project_id=? AND json_extract(evidence_json,'$.subject_id')=?")
      .all(delegated.projectId as never, attemptId as never) as Array<{ evidence_json: Uint8Array }>;
    const atoms = rows.map((row) => JSON.parse(new TextDecoder().decode(row.evidence_json)) as Record<string, unknown>);
    expect(atoms).toHaveLength(3);
    expect(atoms.map((atom) => String(atom.predicate)).sort()).toEqual([
      "expected_files_exist",
      "process_exit_zero",
      "write_scope_valid",
    ]);
    /** Same predicates as Finish, DIFFERENT producer: one writer, two attributed routes. */
    for (const atom of atoms) {
      expect(atom.producer).toBe("palimpsest-delegated-settlement");
      expect((atom.value as Record<string, unknown>).result_commit).toMatch(/^[0-9a-f]{40}$/u);
    }
    /** Exactly one writer produced them: no atom carries the Finish producer in this project. */
    const finishAtoms = atoms.filter((atom) => atom.producer === "palimpsest-finish");
    expect(finishAtoms).toEqual([]);
  });
});

describe("CI3 D3 — limited Trajectory continuity", () => {
  it("the projection preserves the evidence identity and the qualification history without inventing causality", async () => {
    /**
     * §14: "Trajectory may observe the history of qualification changes. It must not become the source of
     * promotion authority."
     *
     * THE MEASUREMENT. The Trajectory projection is a VIEW over the event log, so the facts CI3 depends on
     * must survive into it: the evidence id, the predicate, the stale event, and the ordering. What must NOT
     * appear is a causal relation between the revision and an unrelated subject — CI1's `TEMPORAL_ONLY`
     * finding. Both halves are asserted.
     */
    const rig = makeRig("ci3xtraj");
    await rig.start();
    const service = rig.installed.workDelegation!;
    const started = await service.start({ expectedTaskId: TASK.task_id });
    let attemptId: string | null = null;
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const view = await service.followup({ jobId: started.jobId });
      if ("phase" in view && (view.phase === "FINISHED" || view.phase === "HOST_ERROR")) {
        if ("attemptId" in view && typeof view.attemptId === "string") attemptId = view.attemptId;
        break;
      }
      await new Promise((done) => setTimeout(done, 50));
    }
    expect(attemptId).not.toBeNull();
    if (attemptId === null) return;

    /** The evidence ids before the revocation. */
    const before = rig.connection
      .prepare("SELECT evidence_id FROM evidence WHERE project_id=? AND json_extract(evidence_json,'$.subject_id')=? ORDER BY evidence_id")
      .all(rig.projectId as never, attemptId as never) as Array<{ evidence_id: string }>;
    const idsBefore = before.map((row) => String(row.evidence_id));
    expect(idsBefore).toHaveLength(3);

    /** An authorized revision revokes them. */
    rig.installed.controller.planReconciled({
      tasks: [
        { ...TASK, task_id: "task-a" },
        { ...TASK, task_id: "task-z", write_paths: ["src/z.ts"], required_artifacts: ["src/z.ts"] },
      ],
      changeClass: "behavior_change",
      changedIds: ["task-a"],
    });

    /**
     * PRESERVATION. The same evidence ids are still in the projection, now stale, and the stale events name
     * them. So a reader of history can still attribute the original PASS to its original subject.
     */
    const after = rig.connection
      .prepare("SELECT evidence_id, status FROM evidence WHERE project_id=? AND json_extract(evidence_json,'$.subject_id')=? ORDER BY evidence_id")
      .all(rig.projectId as never, attemptId as never) as Array<{ evidence_id: string; status: string }>;
    expect(after.map((row) => String(row.evidence_id))).toEqual(idsBefore);
    expect(after.every((row) => row.status === "stale")).toBe(true);

    const staleEvents = rig.connection
      .prepare("SELECT entity_id, payload_json FROM events WHERE project_id=? AND event_type='EVIDENCE_STALE' ORDER BY event_id")
      .all(rig.projectId as never) as Array<{ entity_id: string; payload_json: Uint8Array }>;
    expect(staleEvents).toHaveLength(3);
    expect(staleEvents.map((event) => String(event.entity_id)).sort()).toEqual([...idsBefore].sort());
    for (const event of staleEvents) {
      const payload = JSON.parse(new TextDecoder().decode(event.payload_json)) as Record<string, unknown>;
      expect(String(payload.reason)).toMatch(/typed invalidation/u);
    }

    /**
     * NO FABRICATED CAUSALITY. The stale events carry no `causation_id` to another subject — they are
     * revision-level facts, not a dependency relation. That is what keeps `TEMPORAL_ONLY` ordering from
     * being read as project causality (§14, and CI1's finding).
     */
    const causation = rig.connection
      .prepare("SELECT causation_id FROM events WHERE project_id=? AND event_type='EVIDENCE_STALE'")
      .all(rig.projectId as never) as Array<{ causation_id: number | null }>;
    for (const row of causation) {
      expect(row.causation_id).toBeNull();
    }

    /** AND TRAJECTORY IS NOT AUTHORITY: the Gate reads the evidence projection, not any trajectory view. */
    expect(rig.installed.controller.evaluateGate("gate-release", "attempt", attemptId).verdict).toBe("INCOMPLETE");
  });
});
