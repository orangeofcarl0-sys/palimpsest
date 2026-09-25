/**
 * PLMP-LEAN-1 §D4-0 — THE AUTHORITY SPLIT, as machine proofs.
 *
 *     SpeculativeMutationAuthority  ≠  CanonicalMutationAuthority
 *
 * D2's "exactly one mutating Work line" was justified by DIVERGENCE — two writers on one tree. That is
 * true for an IN-PLACE lane, where the attempt's tree IS the canonical tree. It is too strong for a PLACED
 * lane, where the attempt owns an isolated `ExecutionWorld` and canonical source is untouched until
 * Promotion accepts a result. So D2 used the CANONICAL-SOURCE authority to forbid SPECULATIVE worlds.
 *
 * The split makes concurrency a property the PLAN declares (`StageGraphDefinition.concurrency`) instead of
 * a product-wide constant:
 *
 *     declared concurrency 1  →  one ACTIVE task; a second is refused BY THE SCHEDULER
 *     declared concurrency N  →  N tasks may hold speculative worlds at once
 *
 * These tests drive BOTH sides, because a rule that only ever refuses proves nothing about a split.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { assessSpeculativeAdmission, type SpeculativeLaneRequest } from "../src/domain/speculative_authority.js";
import { DEFAULT_STAGE_GRAPH, type StageGraphDefinition } from "../src/domain/stage_graph.js";
import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import { GitCliPort } from "../src/effects/index.js";
import type { ProjectStandard } from "../src/domain/standard.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

function standardOf(): ProjectStandard {
  return Object.freeze({
    statement: "tests pass and scope respected",
    clauses: Object.freeze([
      Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze(["node", "-e", "process.exit(0)"]), predicate: "tests_pass" as const }),
      Object.freeze({ kind: "scope_respected" as const }),
    ]),
    derivedFrom: Object.freeze(["test fixture"]),
    confirmed: true,
    notes: Object.freeze([]),
  });
}

/** Two INDEPENDENT tasks, so a second is a genuine candidate for activation. */
function workspace(): { root: string; repo: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-d40-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "a.ts"), "export const a = 1;\n");
  writeFileSync(join(repo, "src", "b.ts"), "export const b = 1;\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: repo });
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // Windows keeps the directory busy while a git handle is open; the OS reaps it.
    }
  });
  return { root, repo, head: git(repo, ["rev-parse", "HEAD"]) };
}

function stack(repo: string) {
  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: "d40",
      databasePath: join(repo, ".palimpsest", "p.sqlite"),
      ordariumDatabasePath: join(repo, ".palimpsest", "o.sqlite"),
      repository: repo,
      git: new GitCliPort(repo, join(repo, ".palimpsest", "worlds")),
      execution: "worktree",
      standard: standardOf(),
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
    } as never,
  );
  cleanups.push(() => void installed.dispose());
  const call = async (name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const tool = installed.tools.find((entry) => entry.name === name);
    if (tool === undefined) throw new Error(`no core tool ${name}`);
    return (await tool.execute(args, {
      callId: `c-${name}`,
      rootCallId: `r-${name}`,
      name,
      arguments: args,
      signal: new AbortController().signal,
    })) as Record<string, unknown>;
  };
  return { installed, controller: installed.controller, call };
}

async function declareTwoTasks(call: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>, head: string) {
  await call("palimpsest_start", {
    projectId: "d40",
    goal: "two independent tasks",
    headCommit: head,
    tasks: [
      { task_id: "t1", objective: "tidy a", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] },
      { task_id: "t2", objective: "tidy b", depends_on: [], write_paths: ["src/b.ts"], required_artifacts: [] },
    ],
  });
}

/** The default graph with the ACTIVE stage's concurrency declared, everything else verbatim. */
function graphWithConcurrency(n: number): StageGraphDefinition {
  return {
    ...DEFAULT_STAGE_GRAPH,
    stages: DEFAULT_STAGE_GRAPH.stages.map((stage) => (stage.state === "ACTIVE" ? { ...stage, concurrency: n } : stage)),
    declared_by: "genesis",
    reason: `test: declared ACTIVE concurrency ${String(n)}`,
  } as StageGraphDefinition;
}

const attempts = (controller: { store: { connection: { prepare: (sql: string) => { all: (...args: never[]) => unknown } } } }) =>
  controller.store.connection
    .prepare("SELECT attempt_id, task_id, state FROM attempts WHERE project_id=? ORDER BY attempt_id")
    .all("d40" as never) as readonly { attempt_id: string; task_id: string; state: string }[];

/* ================================================================== *
 * The rule, in isolation
 * ================================================================== */

describe("§D4-0 the authority split, as a rule", () => {
  const base: Omit<SpeculativeLaneRequest, "placement" | "requestedTaskId" | "nonterminal" | "schedulerDecision"> = {};

  it("IN-PLACE keeps the canonical-source authority: the lane and the tree are one object", () => {
    const admission = assessSpeculativeAdmission({
      ...base,
      placement: "in-place",
      requestedTaskId: undefined,
      nonterminal: [],
      schedulerDecision: { decision: "next", eventType: "TASK_STARTED", entityId: "t1" },
    });
    // Refused even with an EMPTY lane and a scheduler that says go: the placement itself is the reason.
    expect(admission.kind).toBe("REFUSE");
    expect(admission.kind === "REFUSE" && admission.code).toBe("CANONICAL_SOURCE_IS_THE_LANE");
  });

  it("a PLACED lane defers to the scheduler, so concurrency is what the plan declares", () => {
    const go = assessSpeculativeAdmission({
      ...base,
      placement: "worktree",
      requestedTaskId: undefined,
      nonterminal: [],
      schedulerDecision: { decision: "next", eventType: "TASK_STARTED", entityId: "t1" },
    });
    expect(go).toEqual({ kind: "START", taskId: "t1" });

    /**
     * With ONE position in flight and no name given, the answer is a RESUME of that position — which is the
     * retry path, and is why the ambiguity rule is a threshold rather than "a name is required".
     */
    const oneInFlight = assessSpeculativeAdmission({
      ...base,
      placement: "worktree",
      requestedTaskId: undefined,
      nonterminal: [{ attemptId: "a1", taskId: "t1", state: "RUNNING" }],
      schedulerDecision: { decision: "idle" },
    });
    expect(oneInFlight).toEqual({ kind: "RESUME", taskId: "t1", attemptId: "a1" });

    /**
     * And with the scheduler exhausted AND a name that matches nothing in flight, the refusal is the
     * scheduler's: `idle` is what "the declared concurrency is used up" looks like from here.
     */
    const stop = assessSpeculativeAdmission({
      ...base,
      placement: "worktree",
      requestedTaskId: "t2",
      nonterminal: [{ attemptId: "a1", taskId: "t1", state: "RUNNING" }],
      schedulerDecision: { decision: "idle" },
    });
    expect(stop.kind).toBe("REFUSE");
    expect(stop.kind === "REFUSE" && stop.code).toBe("TASK_NOT_NEXT_SCHEDULABLE");
  });

  it("a NAMED task resumes ITS OWN position regardless of how many others are in flight", () => {
    const admission = assessSpeculativeAdmission({
      ...base,
      placement: "worktree",
      requestedTaskId: "t2",
      nonterminal: [
        { attemptId: "a1", taskId: "t1", state: "RUNNING" },
        { attemptId: "a2", taskId: "t2", state: "RUNNING" },
        { attemptId: "a3", taskId: "t3", state: "RUNNING" },
      ],
      schedulerDecision: { decision: "idle" },
    });
    // Three worlds in flight, and the named one is still resumable — the retry path must not depend on
    // how much else is happening.
    expect(admission).toEqual({ kind: "RESUME", taskId: "t2", attemptId: "a2" });
  });

  it("an UNNAMED request with exactly one position resumes it, and with several refuses as ambiguous", () => {
    const one = assessSpeculativeAdmission({
      ...base,
      placement: "worktree",
      requestedTaskId: undefined,
      nonterminal: [{ attemptId: "a1", taskId: "t1", state: "CREATED" }],
      schedulerDecision: { decision: "idle" },
    });
    // The crash-retry path: one position, no name, and demanding a name would turn a recoverable retry
    // into a refusal.
    expect(one).toEqual({ kind: "RESUME", taskId: "t1", attemptId: "a1" });

    const many = assessSpeculativeAdmission({
      ...base,
      placement: "worktree",
      requestedTaskId: undefined,
      nonterminal: [
        { attemptId: "a1", taskId: "t1", state: "RUNNING" },
        { attemptId: "a2", taskId: "t2", state: "RUNNING" },
      ],
      schedulerDecision: { decision: "idle" },
    });
    expect(many.kind).toBe("REFUSE");
    expect(many.kind === "REFUSE" && many.code).toBe("SPECULATIVE_LANE_AMBIGUOUS");
  });

  it("TWO positions for ONE task is a diverged line, and it refuses rather than picking one", () => {
    const admission = assessSpeculativeAdmission({
      ...base,
      placement: "worktree",
      requestedTaskId: "t1",
      nonterminal: [
        { attemptId: "a1", taskId: "t1", state: "RUNNING" },
        { attemptId: "a2", taskId: "t1", state: "LEASED" },
      ],
      schedulerDecision: { decision: "idle" },
    });
    expect(admission.kind).toBe("REFUSE");
    expect(admission.kind === "REFUSE" && admission.code).toBe("MULTIPLE_POSITIONS_FOR_ONE_TASK");
  });
});

/* ================================================================== *
 * The rule, against a real deployment — BOTH directions
 * ================================================================== */

describe("§D4-0 a real deployment: declared concurrency is what allows a second speculative world", () => {
  it("with the DEFAULT graph, a second task is refused by the scheduler (the pre-D4 behaviour, renamed)", async () => {
    const { repo, head } = workspace();
    const { controller, call } = stack(repo);
    await declareTwoTasks(call, head);

    const first = await controller.prepareMutatingWork();
    expect(first.state).toBe("PREPARED");
    expect(first.taskId).toBe("t1");

    // The scheduler's declared concurrency is 1, so it reports `idle` and that is the refusal.
    const preview = controller.preview();
    expect(preview.decision).toBe("idle");
    await expect(controller.prepareMutatingWork({ expectedTaskId: "t2" })).rejects.toThrow(/TASK_NOT_NEXT_SCHEDULABLE/u);
    expect(attempts(controller)).toHaveLength(1);
  }, 120_000);

  it("with a DECLARED concurrency of 2, two speculative worlds open at once", async () => {
    const { repo, head } = workspace();
    const { controller, call } = stack(repo);
    await declareTwoTasks(call, head);
    /**
     * Declared AFTER the plan, because `stage_graphs` is a PROJECTION of the last
     * `STAGE_GRAPH_DEFINED` event and `start()` declares the default itself — a declaration made first
     * would simply be overwritten. That ordering is a property of the projection, not of this rule.
     */
    controller.declareStageGraph(graphWithConcurrency(2), 2);

    const first = await controller.prepareMutatingWork();
    expect(first.taskId).toBe("t1");
    expect(first.state).toBe("PREPARED");

    /**
     * THE SPLIT, MEASURED. Before D4-0 this was refused by a product-wide "one nonterminal attempt" rule
     * that used the canonical-source authority to forbid a speculative world. Now the scheduler's declared
     * concurrency decides, and it declared 2 — so the second task opens its OWN world.
     */
    const second = await controller.prepareMutatingWork({ expectedTaskId: "t2" });
    expect(second.state).toBe("PREPARED");
    expect(second.taskId).toBe("t2");

    // TWO independent positions, each with its OWN execution world.
    const rows = attempts(controller);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.task_id).sort()).toEqual(["t1", "t2"]);
    expect(rows.every((row) => row.state === "RUNNING")).toBe(true);
    expect(first.worldPath).not.toBe(second.worldPath);
    expect(first.attemptId).not.toBe(second.attemptId);

    // And canonical source is untouched by BOTH: the whole point of a speculative world.
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(head);
    expect(git(repo, ["status", "--porcelain"]).split("\n").filter((line) => line.trim() !== "" && !line.endsWith(".palimpsest/"))).toEqual([]);
  }, 120_000);

  it("each speculative world is INDEPENDENT: a resume of one does not disturb the other", async () => {
    const { repo, head } = workspace();
    const { controller, call } = stack(repo);
    await declareTwoTasks(call, head);
    controller.declareStageGraph(graphWithConcurrency(2), 2);

    const first = await controller.prepareMutatingWork();
    const second = await controller.prepareMutatingWork({ expectedTaskId: "t2" });

    // Resuming either one is the retry path, and it is addressed by NAME now that two are in flight.
    const againFirst = await controller.prepareMutatingWork({ expectedTaskId: "t1" });
    expect(againFirst.state).toBe("RESUMED");
    expect(againFirst.attemptId).toBe(first.attemptId);
    expect(againFirst.worldPath).toBe(first.worldPath);

    const againSecond = await controller.prepareMutatingWork({ expectedTaskId: "t2" });
    expect(againSecond.state).toBe("RESUMED");
    expect(againSecond.attemptId).toBe(second.attemptId);

    // No third position was created by any of the resumes.
    expect(attempts(controller)).toHaveLength(2);

    /**
     * And an UNNAMED request with two in flight refuses rather than guessing which one the caller meant.
     * That is the ambiguity rule, and it is why `expectedTaskId` exists.
     */
    await expect(controller.prepareMutatingWork()).rejects.toThrow(/SPECULATIVE_LANE_AMBIGUOUS/u);
    expect(attempts(controller)).toHaveLength(2);
  }, 120_000);

  it("the declared concurrency is the CEILING: a third task waits even when the graph allows two", async () => {
    const { repo, head } = workspace();
    const { controller, call } = stack(repo);
    await call("palimpsest_start", {
      projectId: "d40",
      goal: "three independent tasks",
      headCommit: head,
      tasks: [
        { task_id: "t1", objective: "tidy a", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] },
        { task_id: "t2", objective: "tidy b", depends_on: [], write_paths: ["src/b.ts"], required_artifacts: [] },
        { task_id: "t3", objective: "tidy c", depends_on: [], write_paths: ["src/c.ts"], required_artifacts: [] },
      ],
    });
    controller.declareStageGraph(graphWithConcurrency(2), 2);

    await controller.prepareMutatingWork();
    await controller.prepareMutatingWork({ expectedTaskId: "t2" });
    // Two of three are active, so the scheduler is done and the third is refused.
    expect(controller.preview().decision).toBe("idle");
    await expect(controller.prepareMutatingWork({ expectedTaskId: "t3" })).rejects.toThrow(/TASK_NOT_NEXT_SCHEDULABLE/u);
    expect(attempts(controller)).toHaveLength(2);
  }, 120_000);
});

/* ================================================================== *
 * The boundary: canonical-source authority is unchanged
 * ================================================================== */

describe("§D4-0 the canonical-source authority is untouched by the split", () => {
  it("in-place keeps strict single-writer, enforced at claim", () => {
    const source = execFileSync(
      process.execPath,
      ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, "src/tools/controller.ts"))},'utf8'))`],
      { encoding: "utf8" },
    );
    // The in-place exclusivity check still exists, and it is the SAME one it always was.
    expect(source).toContain("in-place execution allows one RUNNING attempt at a time");
    expect(source).toMatch(/this\.execution === "in-place"/u);
  });

  it("the split adds NO promotion path and NO second authority vocabulary", () => {
    const text = execFileSync(
      process.execPath,
      ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, "src/domain/speculative_authority.ts"))},'utf8'))`],
      { encoding: "utf8" },
    ).replace(/\/\*[\s\S]*?\*\//gu, "");
    for (const forbidden of [
      "promoteAttempt",
      "assessPromotionEligibility",
      "ATTEMPT_COMPLETED",
      "recordCallback",
      "execFileSync",
      "node:fs",
    ]) {
      expect(text, `speculative_authority.ts must not contain "${forbidden}"`).not.toContain(forbidden);
    }
    // It is a PURE rule: no store, no clock, no I/O.
    expect(text).not.toContain("DatabaseSync");
    expect(text).not.toContain("new Date(");
  });

  it("both mutating entrances consume the ONE rule rather than restating it", () => {
    const source = execFileSync(
      process.execPath,
      ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, "src/tools/controller.ts"))},'utf8'))`],
      { encoding: "utf8" },
    ).replace(/\/\*[\s\S]*?\*\//gu, "");
    // Two definitions of "may this lane open" over one project is how two entrances start disagreeing, so
    // the shared read is used by both and the old inline rule is gone.
    expect(source.match(/#speculativeAdmission\(/gu)?.length).toBe(3); // 1 declaration + 2 call sites
    expect(source).not.toContain("D2 keeps exactly one mutating Work line");
  });
});

/* ================================================================== *
 * D4-a — the OPERATOR surface for capacity
 * ================================================================== */

describe("§D4-a the operator declares capacity, and the genesis pipeline is otherwise verbatim", () => {
  it("a deployment that states concurrency 2 runs two speculative worlds, with canonical untouched", async () => {
    const { repo, head } = workspace();
    // The OPERATOR surface: profile → launch → install → controller. No test reaches for declareStageGraph.
    const installed = installPalimpsest(
      { tools: { register: () => () => undefined } } as never,
      {
        projectId: "d4a",
        databasePath: join(repo, ".palimpsest", "p.sqlite"),
        ordariumDatabasePath: join(repo, ".palimpsest", "o.sqlite"),
        repository: repo,
        git: new GitCliPort(repo, join(repo, ".palimpsest", "worlds")),
        execution: "worktree",
        concurrency: 2,
        standard: standardOf(),
        policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
      } as never,
    );
    cleanups.push(() => void installed.dispose());
    const controller = installed.controller;
    const call = async (name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> => {
      const tool = installed.tools.find((entry) => entry.name === name);
      if (tool === undefined) throw new Error(`no core tool ${name}`);
      return (await tool.execute(args, {
        callId: `c-${name}`,
        rootCallId: `r-${name}`,
        name,
        arguments: args,
        signal: new AbortController().signal,
      })) as Record<string, unknown>;
    };
    await call("palimpsest_start", {
      projectId: "d4a",
      goal: "two independent tasks",
      headCommit: head,
      tasks: [
        { task_id: "t1", objective: "tidy a", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] },
        { task_id: "t2", objective: "tidy b", depends_on: [], write_paths: ["src/b.ts"], required_artifacts: [] },
      ],
    });

    const first = await controller.prepareMutatingWork();
    const second = await controller.prepareMutatingWork({ expectedTaskId: "t2" });
    expect(first.state).toBe("PREPARED");
    expect(second.state).toBe("PREPARED");
    expect(first.worldPath).not.toBe(second.worldPath);

    // And canonical source is untouched by BOTH — the whole point of a speculative world.
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(head);
  }, 120_000);

  it("an ABSENT concurrency is the pre-D4 behaviour: the scheduler refuses the second task", async () => {
    const { repo, head } = workspace();
    const { controller, call } = stack(repo);
    await declareTwoTasks(call, head);
    await controller.prepareMutatingWork();
    await expect(controller.prepareMutatingWork({ expectedTaskId: "t2" })).rejects.toThrow(/TASK_NOT_NEXT_SCHEDULABLE/u);
  }, 120_000);

  it("the profile rejects a concurrency that is not a positive integer", async () => {
    const { parseDeploymentProfile } = await import("../src/deployment/profile.js");
    const base = {
      schemaVersion: 1,
      profileId: "p",
      projectId: "p",
      localPeer: "peer",
      transport: { namespace: "n", databasePath: "t.sqlite" },
      databases: {
        orchestration: "o.sqlite",
        ordarium: "r.sqlite",
        coordination: "c.sqlite",
        transportCursors: "u.sqlite",
      },
    };
    // A capacity of 0 would forbid all work, and a fraction is not a count: both are refused rather than
    // coerced, because a silently-adjusted bound is not an operator's bound.
    for (const bad of [0, -1, 1.5, "2"]) {
      expect(() => parseDeploymentProfile({ ...base, concurrency: bad } as never), JSON.stringify(bad)).toThrow(/concurrency must be a positive integer/u);
    }
    // And a stated 1 is accepted, meaning exactly what an absent one means.
    expect(parseDeploymentProfile({ ...base, concurrency: 1 } as never).concurrency).toBe(1);
    expect(parseDeploymentProfile(base as never).concurrency).toBeUndefined();
  });

  it("the genesis pipeline is otherwise VERBATIM: only the ACTIVE stage's concurrency changes", async () => {
    const { repo, head } = workspace();
    const installed = installPalimpsest(
      { tools: { register: () => () => undefined } } as never,
      {
        projectId: "d4a-verbatim",
        databasePath: join(repo, ".palimpsest", "p2.sqlite"),
        ordariumDatabasePath: join(repo, ".palimpsest", "o2.sqlite"),
        repository: repo,
        git: new GitCliPort(repo, join(repo, ".palimpsest", "worlds")),
        execution: "worktree",
        concurrency: 3,
        standard: standardOf(),
        policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
      } as never,
    );
    cleanups.push(() => void installed.dispose());
    const tool = installed.tools.find((entry) => entry.name === "palimpsest_start");
    await tool!.execute(
      {
        projectId: "d4a-verbatim",
        goal: "one task",
        headCommit: head,
        tasks: [{ task_id: "t1", objective: "tidy a", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] }],
      },
      { callId: "c1", rootCallId: "r1", name: "palimpsest_start", arguments: {}, signal: new AbortController().signal },
    );
    const row = installed.controller.store.connection
      .prepare("SELECT graph_json FROM stage_graphs WHERE project_id=?")
      .get("d4a-verbatim") as { graph_json: Uint8Array };
    const graph = JSON.parse(new TextDecoder().decode(row.graph_json)) as {
      stages: readonly { id: string; state: string; concurrency?: number }[];
      transitions: readonly unknown[];
    };
    // The declared capacity, on the ACTIVE stage only.
    expect(graph.stages.find((stage) => stage.state === "ACTIVE")?.concurrency).toBe(3);
    // Everything else is the genesis pipeline, unchanged: same stage ids/states, same transitions.
    expect(graph.stages.map((stage) => `${stage.id}:${stage.state}`)).toEqual(
      DEFAULT_STAGE_GRAPH.stages.map((stage) => `${stage.id}:${stage.state}`),
    );
    expect(graph.transitions).toEqual(DEFAULT_STAGE_GRAPH.transitions);
    // No OTHER stage gained a capacity: a latch declaration belongs to ACTIVE/VERIFYING, and only ACTIVE
    // was touched.
    expect(graph.stages.filter((stage) => stage.concurrency !== undefined)).toHaveLength(1);
  }, 120_000);
});
