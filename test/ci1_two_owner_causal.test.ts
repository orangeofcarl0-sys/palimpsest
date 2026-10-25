/**
 * Palimpsest-CI1 §5/§6/§8 — TWO GENUINE OWNER-BOUND WORKER EXECUTIONS.
 *
 * THE QUESTION THIS FILE ANSWERS.
 *
 *   Can two distinct Owners each execute a bounded task through the REAL production stack, produce separately
 *   attributable immutable candidates, have both delivered by the REAL normal consumer, and have their
 *   independence preserved — without execution or delivery order being mistaken for project causality?
 *
 * WHAT IS REAL HERE, AND WHAT IS DECLARED.
 *
 * Real: the Work/Attempt/Event/SQLite stack (`installPalimpsest`), the settlement path
 * (`settleMutatingWork` → `report` → `recordCallback`), the `attempts` table and its terminal state, the Work
 * event log, and the Trajectory projection (`buildProjectTrajectory` over `composeTrajectoryInputs`).
 *
 * Declared, deliberately: the carrier port that turns a Worker session into a real `Activation`, and the two
 * `WorkWorkerRunPort`s that perform the bounded task. The ruling permits this — a real `Activation` REQUIRES a
 * `RuntimeCarrierPort`, and this repository has no production implementation of one (see
 * `docs/engineering/ci1-c1a-architecture-map.md` §2.3). The port goes through the SHIPPED
 * `makeRuntimeRealizationService`, so the `Activation` artifacts are produced by the product's own code; only the
 * carrier callback and the task body are test-owned.
 *
 * THE REAL SUBPROCESS WORKER IS SEPARATELY QUALIFIED AND IS NOT USED HERE. `dshSubprocessWorkWorkerPort` requires
 * a model to do work and cannot complete a deterministic bounded task. Its identity and delivery were established
 * by E4's live gate and re-established at three anchors by CI1's C0-C trace. This file therefore does NOT claim to
 * run two real DSH subprocess workers. It claims two genuine Owner-bound executions through the real Work and
 * Consumer machinery, which is the narrower and true statement.
 *
 * THE CAUSAL ORACLE IS INDEPENDENT. Expected relations are constructed from the fixture's KNOWN constraints — what
 * was written, what was consumed, what was declared — never by calling the projection and reading its output back.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import { GitCliPort } from "../src/effects/index.js";
import { callbackRuntimeCarrierPort } from "../src/runtime/index.js";
import { materializeArchitectureDefinition } from "../src/architecture/index.js";
import type { ArchitectureDefinition } from "../src/architecture/index.js";
import {
  compileGroundedBindingPlan,
  materializeObservationSnapshot,
  type GroundedPlanningState,
} from "../src/binding/index.js";
import { materializeRunConfiguration } from "../src/run/index.js";
import { parseTaskSpec, projectIrDigestOf, type ProjectIr } from "../src/schema/index.js";
import { composeTrajectoryInputs } from "../src/composition/trajectory.js";
import { buildProjectTrajectory } from "../src/trajectory/projection.js";
import type { WorkWorkerRunPort } from "../src/interaction/work_delegation.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

/**
 * A WINDOWS-TOLERANT TREE REMOVAL.
 *
 * A SQLite handle or a git child can still hold the directory when teardown runs, and Windows then refuses with
 * `EPERM`. The repository's own suites meet this the same way — a bounded retry rather than a silent `force`, so a
 * directory that really cannot be removed is left and reported rather than assumed gone. A failure here is a
 * teardown problem, never a test result.
 */
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
    /* left in place; the run's global temp sweep reports what remains */
  }
}

const PROJECT = "ci1";
const HEAD = "c".repeat(40);

/**
 * THE SHARED IMMUTABLE BASELINE.
 *
 * Both Owners start from this exact commit. It is the reason their independence is meaningful: they are not
 * independent because they never touched the same thing, but because they started from the SAME thing and neither
 * consumed the other's output.
 */
const BASE_FILES = Object.freeze({
  "src/shared.ts": "export const shared = 1;\n",
  "README.md": "# baseline\n",
});

function makeBaselineRepo(): { repo: string; head: string } {
  const repo = mkdtempSync(join(tmpdir(), "ci1-repo-"));
  cleanups.push(() => removeTree(repo));
  execFileSync("git", ["init", "-q"], { cwd: repo });
  for (const [path, contents] of Object.entries(BASE_FILES)) {
    mkdirSync(join(repo, path, ".."), { recursive: true });
    writeFileSync(join(repo, path), contents);
  }
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "S0"], { cwd: repo });
  return { repo, head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim() };
}

/**
 * THE TWO OWNERS ARE TWO `agentDefinitionId`s.
 *
 * That is what makes them distinct Activations rather than two labels on one object. The architecture is the
 * product's own type, materialized by the product's own constructor.
 */
const ARCHITECTURE: ArchitectureDefinition = materializeArchitectureDefinition({
  architectureDefinitionId: "arch-ci1",
  revision: 1,
  agentDefinitionIds: ["owner-a", "owner-b"],
});

function projectIr(revision: number): ProjectIr {
  const base = {
    schema_version: 1 as const,
    project_id: PROJECT,
    revision,
    parent_revision: revision > 0 ? revision - 1 : null,
    parent_digest: revision > 0 ? "p" : null,
    goal: "two owners produce independent candidates over a shared baseline",
    requirements: [],
    decisions: [],
    tasks: [
      parseTaskSpec({ task_id: "task-a", objective: "owner A writes a", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] }),
      parseTaskSpec({ task_id: "task-b", objective: "owner B writes b", depends_on: [], write_paths: ["src/b.ts"], required_artifacts: [] }),
    ],
    head_commit: HEAD,
    committed_at: "2026-01-01T00:00:00.000000Z",
  };
  return { ...base, digest: projectIrDigestOf(base) } as ProjectIr;
}

function groundedState(): GroundedPlanningState {
  return {
    architecture: ARCHITECTURE,
    work: projectIr(2),
    runConfiguration: materializeRunConfiguration(),
    observationSnapshot: materializeObservationSnapshot({
      snapshotId: "obs-ci1",
      ephemeralCapabilities: { runtimeFeatures: [], toolCapabilities: [] },
      persistentCandidates: [],
    }),
  };
}

function planned() {
  const state = groundedState();
  const result = compileGroundedBindingPlan({
    architecture: ARCHITECTURE,
    work: state.work,
    runConfiguration: state.runConfiguration,
    observationSnapshot: state.observationSnapshot,
    resolutionId: "res-ci1",
  });
  if (result.status !== "planned") throw new Error(`expected planned, got ${result.status}`);
  return { state, ...result };
}

/**
 * THE BOUNDED TASK.
 *
 * Deterministic and file-scoped: write one file and commit it inside the world it is handed. It optionally
 * CONSUMES an immutable input, which is how Scenario B's cross-Owner dependency becomes a measured fact rather
 * than a claim — the bytes are read from disk and hashed.
 */
interface BoundedWorker extends WorkWorkerRunPort {
  readonly observations: string[];
  readonly consumed: Array<{ path: string; digest: string }>;
}

function boundedWorker(input: {
  readonly owner: string;
  readonly file: string;
  readonly contents: string;
  readonly consume?: { readonly path: string; readonly expectedDigest: string };
}): BoundedWorker {
  const observations: string[] = [];
  const consumed: Array<{ path: string; digest: string }> = [];
  return {
    adapterId: `ci1-bounded-worker:${input.owner}`,
    observations,
    consumed,
    async run({ workDir }) {
      observations.push(`ran:${input.owner}`);
      if (input.consume !== undefined) {
        /**
         * THE REAL DEPENDENCY CHECK. The consumed file is read from the world and hashed. A mismatch is a hard
         * failure, so "B claims to have used A1 but consumed different bytes" cannot be silently accepted.
         */
        const actual = readFileSync(join(workDir, input.consume.path));
        const actualDigest = createHash("sha256").update(actual).digest("hex");
        consumed.push({ path: input.consume.path, digest: actualDigest });
        if (actualDigest !== input.consume.expectedDigest) {
          throw new Error(`CI1 dependency mismatch: consumed ${actualDigest}, expected ${input.consume.expectedDigest}`);
        }
      }
      mkdirSync(join(workDir, input.file, ".."), { recursive: true });
      writeFileSync(join(workDir, input.file), input.contents);
      execFileSync("git", ["add", "-A"], { cwd: workDir });
      execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", `${input.owner} candidate`], { cwd: workDir });
      return { kind: "READY_FOR_SETTLEMENT" };
    },
  };
}

/**
 * THE DECLARED CARRIER PORT.
 *
 * It supplies what a carrier must: a runtime agent identity and a session identity. It goes through the SHIPPED
 * realization service, so the Activation / RuntimeAttachment / ReleaseHandle artifacts are the product's own. The
 * values are obviously synthetic, so nothing downstream can mistake them for a real DSH session.
 */
function declaredCarrierPort() {
  return callbackRuntimeCarrierPort("ci1-declared-carrier", {
    onRealize: async (request) => ({
      runtimeAgent: { runtimeAdapter: "ci1-declared", agentId: `agent-${request.activationId}` },
      session: { runtimeAdapter: "ci1-declared", sessionId: `session-${request.activationId}` },
    }),
    onRelease: async () => undefined,
  });
}

interface Stack {
  readonly installed: ReturnType<typeof installPalimpsest>;
  readonly rig: string;
  readonly call: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

/**
 * The port seam hands out ONE port for every world, so the port itself must decide which owner's work this is.
 * It does so from the worker's own context — the `writeScope` the canonical task declared — which is the same
 * information a real worker uses.
 */
function dispatchingWorker(byScope: ReadonlyMap<string, BoundedWorker>): WorkWorkerRunPort {
  return {
    adapterId: "ci1-dispatching-worker",
    async run(input) {
      const scope = input.context.work.writeScope;
      const key = Array.isArray(scope) && scope.length > 0 ? String(scope[0]) : "";
      const worker = byScope.get(key);
      if (worker === undefined) {
        throw new Error(`CI1 rig: no worker is bound to write scope ${JSON.stringify(scope)}`);
      }
      return worker.run(input);
    },
  };
}

function makeStack(input: {
  readonly repo: string;
  readonly workers: ReadonlyMap<string, BoundedWorker>;
}): Stack {
  const rig = mkdtempSync(join(tmpdir(), "ci1-rig-"));
  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: PROJECT,
      databasePath: join(rig, "p.sqlite"),
      ordariumDatabasePath: join(rig, "o.sqlite"),
      repository: input.repo,
      /**
       * THE WORLD ROOT MUST BE THE ONE THE COMPOSITION COMPUTES.
       *
       * `composeCore` derives `worldsRoot = <repository>/.palimpsest/worlds` and uses it for BOTH materializing a
       * world and exporting its result. Supplying a private root here reintroduced the documented defect class —
       * two spellings of one location — and the measured symptom was exactly the one `core.ts:128-140` warns
       * about: settlement returned `RESULT_NOT_EXPORTED / WORLD_MISSING`, and the attempt stayed RUNNING. The port
       * is therefore constructed over the composition's own root.
       */
      git: new GitCliPort(input.repo, join(input.repo, ".palimpsest", "worlds")),
      execution: "worktree",
      concurrency: 2,
      standard: {
        statement: "the candidate exists and its scope is respected",
        clauses: [{ kind: "scope_respected" as const }],
        derivedFrom: ["ci1 fixture"],
        confirmed: true,
        notes: [],
      },
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
      runtimeCarrierPort: declaredCarrierPort(),
      /**
       * THE PORT SEAM CANNOT SELECT BY OWNER, SO IT DISPATCHES BY SCOPE.
       *
       * `workWorkerPort` is called with the WORLD PATH, and the world path is `worlds/attempt-<hash>` — it names
       * the ATTEMPT, not the task or the owner. The first version of this rig tried to match an owner name there,
       * matched nothing, and fell back to owner A's worker, so A ran twice and B never ran. That misbinding was
       * caught by asserting WHICH worker ran, which is why that assertion exists.
       *
       * What a worker actually receives is its own context, whose `work.writeScope` is the scope the canonical task
       * declared. Dispatching on that is correct and faithful to how a real worker learns what to do. A world whose
       * scope matches no owner is a REFUSAL, never a fallback.
       */
      workWorkerPort: () => dispatchingWorker(input.workers),
    } as never,
  );
  /**
   * DISPOSE FIRST, THEN REMOVE. The controller holds the SQLite handle, so removing the rig while it is open is
   * the EPERM this ordering exists to avoid.
   */
  cleanups.push(() => {
    try {
      installed.dispose();
    } catch {
      /* dispose is best-effort at teardown; the tree removal below still runs */
    }
    removeTree(rig);
  });
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
  return { installed, rig, call };
}

/**
 * Wait for a job to reach a terminal phase.
 *
 * The async transport returns BEFORE the work completes, so asserting canonical state immediately after `start`
 * would be asserting a race. Polling the READ-ONLY `followup` is the supported way to observe the transition.
 */
async function awaitJob(service: NonNullable<Stack["installed"]["workDelegation"]>, jobId: string, budgetMs = 120_000) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const view = await service.followup({ jobId });
    if ("phase" in view && (view.phase === "FINISHED" || view.phase === "HOST_ERROR")) return view;
    await new Promise((done) => setTimeout(done, 50));
  }
  throw new Error(`job ${jobId} did not reach a terminal phase within ${String(budgetMs)}ms`);
}

/** Read one attempt's canonical row straight from the ledger, so the claim is about stored state. */
function attemptRow(installed: Stack["installed"], attemptId: string): { state: string; report: Record<string, unknown> | null } | null {
  const connection = installed.controller.store.connection as unknown as {
    prepare: (sql: string) => { get: (...args: never[]) => unknown };
  };
  const row = connection
    .prepare("SELECT state, report_json FROM attempts WHERE project_id=? AND attempt_id=?")
    .get(PROJECT as never, attemptId as never) as { state: string; report_json: Uint8Array | null } | undefined;
  if (row === undefined) return null;
  return {
    state: row.state,
    report: row.report_json === null ? null : (JSON.parse(new TextDecoder().decode(row.report_json)) as Record<string, unknown>),
  };
}

const DECLARED_TASKS = [
  { task_id: "task-a", objective: "owner A writes a", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] },
  { task_id: "task-b", objective: "owner B writes b", depends_on: [], write_paths: ["src/b.ts"], required_artifacts: [] },
];

describe("CI1 §5 — two Owners execute through the real Work stack", () => {
  it("creates two distinct real Activations from the shared baseline and settles both attempts", async () => {
    const baseline = makeBaselineRepo();
    const workerA = boundedWorker({ owner: "owner-a", file: "src/a.ts", contents: "export const a = 'A1';\n" });
    const workerB = boundedWorker({ owner: "owner-b", file: "src/b.ts", contents: "export const b = 'B1';\n" });
    const stack = makeStack({ repo: baseline.repo, workers: new Map([["src/a.ts", workerA], ["src/b.ts", workerB]]) });

    /**
     * STEP 1 — TWO REAL OWNERS.
     *
     * Created through the shipped realization service. The assertion is on the ids the SERVICE allocated, so a
     * label written by this test cannot satisfy it.
     */
    const grounded = planned();
    const realize = async (context: string) =>
      stack.installed.runtime!.realize!({
        architecture: ARCHITECTURE,
        runDefinition: grounded.runDefinition,
        resolution: grounded.resolution,
        plan: grounded.plan,
        current: grounded.state,
        activationContext: context,
      });
    const realizationA = await realize("ctx-owner-a");
    const realizationB = await realize("ctx-owner-b");
    expect(realizationA.status).toBe("realized");
    expect(realizationB.status).toBe("realized");
    if (realizationA.status !== "realized" || realizationB.status !== "realized") return;

    const ownerA = realizationA.realizations.find((entry) => entry.activation.agentDefinitionId === "owner-a");
    const ownerB = realizationB.realizations.find((entry) => entry.activation.agentDefinitionId === "owner-b");
    expect(ownerA).toBeDefined();
    expect(ownerB).toBeDefined();
    if (ownerA === undefined || ownerB === undefined) return;

    /** §5: distinct Owners, and the SAME immutable baseline — sharing a baseline is not a dependency. */
    expect(ownerA.activation.activationId).not.toBe(ownerB.activation.activationId);
    expect(ownerA.activation.runDefinition.digest).toBe(ownerB.activation.runDefinition.digest);
    const baselineHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: baseline.repo, encoding: "utf8" }).trim();
    expect(baselineHead).toBe(baseline.head);

    /**
     * STEP 2 — CANONICAL WORK.
     *
     * Declared through the product's own tool surface, so the Attempts the consumer will complete are real.
     */
    await stack.call("palimpsest_start", {
      projectId: PROJECT,
      goal: "two owners produce independent candidates over a shared baseline",
      headCommit: baseline.head,
      tasks: DECLARED_TASKS,
    });

    /**
     * STEP 3 — BOTH EXECUTE, AND THE NORMAL CONSUMER SETTLES THEM.
     *
     * Both jobs are started before either is awaited, so the two executions genuinely overlap rather than being
     * serialized by this test's own await structure.
     */
    const service = stack.installed.workDelegation;
    expect(service).toBeDefined();
    if (service === undefined) return;

    const startedA = await service.start({ expectedTaskId: "task-a" });
    const startedB = await service.start({ expectedTaskId: "task-b" });
    const [finishedA, finishedB] = await Promise.all([awaitJob(service, startedA.jobId), awaitJob(service, startedB.jobId)]);

    expect(finishedA.phase).toBe("FINISHED");
    expect(finishedB.phase).toBe("FINISHED");
    expect("attemptId" in finishedA ? finishedA.attemptId : null).toBeTruthy();
    expect("attemptId" in finishedB ? finishedB.attemptId : null).toBeTruthy();
    if (!("attemptId" in finishedA) || !("attemptId" in finishedB)) return;
    const attemptA = finishedA.attemptId!;
    const attemptB = finishedB.attemptId!;

    /** Each owner's own worker ran, and neither ran the other's. */
    expect(workerA.observations).toEqual(["ran:owner-a"]);
    expect(workerB.observations).toEqual(["ran:owner-b"]);

    /**
     * STEP 4 — THE CONSUMER'S CANONICAL RESULT.
     *
     * Read from the `attempts` table, so this is stored project state rather than a return value.
     */
    const rowA = attemptRow(stack.installed, attemptA);
    const rowB = attemptRow(stack.installed, attemptB);
    expect(rowA).not.toBeNull();
    expect(rowB).not.toBeNull();
    if (rowA === null || rowB === null) return;
    expect(rowA.state).toBe("COMPLETED");
    expect(rowB.state).toBe("COMPLETED");

    /** §6: the candidates are IMMUTABLE and separately identifiable by content, not by filename. */
    const commitA = rowA.report?.result_commit;
    const commitB = rowB.report?.result_commit;
    expect(typeof commitA).toBe("string");
    expect(typeof commitB).toBe("string");
    expect(commitA).not.toBe(commitB);

    /**
     * The candidate CONTENT identity is the git tree of the commit the consumer exported. Two distinct trees is
     * the content-level statement of independence, and it is checked by asking git, not by trusting the report.
     */
    const treeOf = (commit: unknown): string =>
      execFileSync("git", ["rev-parse", `${String(commit)}^{tree}`], { cwd: baseline.repo, encoding: "utf8" }).trim();
    const treeA = treeOf(commitA);
    const treeB = treeOf(commitB);
    expect(treeA).not.toBe(treeB);

    /** The changed files are exactly the declared scope, so neither owner touched the other's file. */
    expect(rowA.report?.changed_files).toEqual(["src/a.ts"]);
    expect(rowB.report?.changed_files).toEqual(["src/b.ts"]);

    /**
     * STEP 5 — THE PROJECTION.
     *
     * The real adapter, over the real event log. Both attempts must be visible and attributed.
     */
    const inputs = composeTrajectoryInputs({
      projectId: PROJECT,
      controller: stack.installed.controller as unknown as Parameters<typeof composeTrajectoryInputs>[0]["controller"],
      promotions: stack.installed.controller.promotions as unknown as Parameters<typeof composeTrajectoryInputs>[0]["promotions"],
      reasoning: undefined,
      proof: undefined,
      projectWorkspace: undefined,
      journalStore: undefined,
      associationStore: undefined,
    });
    const projection = await buildProjectTrajectory(inputs);
    expect(projection.projectId).toBe(PROJECT);
    expect(projection.nodes.length).toBeGreaterThan(0);

    const nodeIds = new Set(projection.nodes.map((node) => node.nodeId));
    const nodesNamingA = projection.nodes.filter((node) => JSON.stringify(node).includes(attemptA));
    const nodesNamingB = projection.nodes.filter((node) => JSON.stringify(node).includes(attemptB));
    expect(nodesNamingA.length).toBeGreaterThan(0);
    expect(nodesNamingB.length).toBeGreaterThan(0);
    expect(nodeIds.size).toBe(projection.nodes.length);

    /**
     * THE INDEPENDENCE CLAIM, FROM THE PROJECTION'S OWN OUTPUT.
     *
     * There must be NO edge asserting that A's result produced B's, or B's produced A's. This is a NEGATIVE
     * assertion about the projection, and it is meaningful only because both attempts are demonstrably present
     * above — a projection that lost one of them would satisfy the negative vacuously, which is why the positive
     * checks come first.
     */
    const crossEdges = projection.edges.filter((edge) => {
      const from = edge.fromNodeId;
      const to = edge.toNodeId;
      return (from.includes(attemptA) && to.includes(attemptB)) || (from.includes(attemptB) && to.includes(attemptA));
    });
    expect(crossEdges).toEqual([]);
  }, 180_000);
});
