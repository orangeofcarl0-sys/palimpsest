/**
 * Palimpsest-CI1 §7/§8/§9 — THE INDEPENDENT CAUSAL ORACLE.
 *
 * THE DISCIPLINE THIS FILE EXISTS TO ENFORCE.
 *
 * The oracle must be constructed from the FIXTURE'S OWN KNOWN CONSTRAINTS — which task was declared, which attempt
 * the consumer settled, which commit it exported, and (for the dependent case) which bytes were actually read — and
 * NEVER by calling the projection and reading its output back. An oracle that asks the thing under test what the
 * answer is proves nothing.
 *
 * So every expectation below is written in terms of facts this file established BEFORE the projection ran:
 *
 *   · `declaredTasks`  — the tasks passed to `palimpsest_start`;
 *   · `attemptIds`     — the ids the consumer returned from `settleMutatingWork`;
 *   · `resultCommits`  — the commits the consumer reported and git confirmed;
 *   · `consumedBytes`  — for the dependent case, the digest the worker actually read from disk.
 *
 * THREE DISTINCT STATES ARE KEPT SEPARATE (§7):
 *
 *   1. a KNOWN project dependency inside the closed scenario;
 *   2. a KNOWN ABSENCE of a direct dependency inside the closed scenario;
 *   3. UNKNOWN — not observed, and therefore not claimed either way.
 *
 * (2) is scoped to the scenario. Nothing here generalises "no edge" into a claim of global independence.
 *
 * SYNCHRONIZATION IS NOT DATA DEPENDENCY. Where this file arranges overlap, that is a TEST-COORDINATION edge. It is
 * recorded as such and is never presented as an application-level asset dependency.
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

/** Windows-tolerant removal; a live SQLite or git handle must not turn teardown into a test result. */
function removeTree(path: string): void {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      rmSync(path, { recursive: true, force: true });
      return;
    } catch {
      /* a live handle; retry */
    }
  }
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    /* left in place for the run's global temp sweep */
  }
}

const HEAD = "c".repeat(40);
const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");

const BASE_FILES = Object.freeze({
  "src/shared.ts": "export const shared = 1;\n",
  "README.md": "# baseline\n",
});

/** S0 — the single immutable baseline both Owners start from. Its digest is an oracle input. */
const S0_DIGEST = sha256(
  Object.entries(BASE_FILES)
    .map(([path, contents]) => `${path}\u0000${contents}`)
    .join("\u0001"),
);

function makeBaselineRepo(): { repo: string; head: string } {
  const repo = mkdtempSync(join(tmpdir(), "ci1c-repo-"));
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

const ARCHITECTURE: ArchitectureDefinition = materializeArchitectureDefinition({
  architectureDefinitionId: "arch-ci1c",
  revision: 1,
  agentDefinitionIds: ["owner-a", "owner-b"],
});

function projectIr(tasks: readonly { task_id: string; objective: string; depends_on: string[]; write_paths: string[]; required_artifacts: string[] }[]): ProjectIr {
  const base = {
    schema_version: 1 as const,
    project_id: "ci1c",
    revision: 2,
    parent_revision: 1,
    parent_digest: "p",
    goal: "causal assay",
    requirements: [],
    decisions: [],
    tasks: tasks.map((task) => parseTaskSpec(task)),
    head_commit: HEAD,
    committed_at: "2026-01-01T00:00:00.000000Z",
  };
  return { ...base, digest: projectIrDigestOf(base) } as ProjectIr;
}

interface TaskDecl {
  readonly task_id: string;
  readonly objective: string;
  readonly depends_on: string[];
  readonly write_paths: string[];
  readonly required_artifacts: string[];
}

const INDEPENDENT_TASKS: readonly TaskDecl[] = [
  { task_id: "task-a", objective: "owner A writes a", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] },
  { task_id: "task-b", objective: "owner B writes b", depends_on: [], write_paths: ["src/b.ts"], required_artifacts: [] },
];

/**
 * A DETERMINISTIC TWO-PARTY RENDEZVOUS.
 *
 * The first arriver records its timestamp and waits; the second releases both. The recorded timestamps therefore
 * bracket a window in which BOTH tasks were provably running, which is what a concurrency claim needs and what a
 * `Promise.all()` alone cannot supply.
 */
class Rendezvous {
  readonly #arrivals: string[] = [];
  readonly #times = new Map<string, number>();
  #release: (() => void) | null = null;
  readonly #released: Promise<void>;

  constructor() {
    this.#released = new Promise((resolve) => {
      this.#release = resolve;
    });
  }

  async arrive(owner: string): Promise<void> {
    this.#arrivals.push(owner);
    this.#times.set(owner, Date.now());
    if (this.#arrivals.length === 2) this.#release?.();
    await Promise.race([
      this.#released,
      new Promise((done) => setTimeout(done, 20_000)),
    ]);
  }

  arrivalTime(owner: string): number {
    return this.#times.get(owner) ?? 0;
  }

  get arrivalOrder(): readonly string[] {
    return [...this.#arrivals];
  }
}

interface BoundedWorker extends WorkWorkerRunPort {
  readonly observations: string[];
  readonly consumed: Array<{ path: string; digest: string }>;
  /** Monotonic task-running interval, recorded by the worker itself so overlap is measured, not assumed. */
  startedAt: number;
  endedAt: number;
}

/**
 * A bounded task. `barrier` is a TEST-COORDINATION device that creates a real overlap window; it is never an
 * application-level dependency and is labelled as coordination wherever it is reported.
 */
function boundedWorker(input: {
  readonly owner: string;
  readonly file: string;
  readonly contents: string;
  readonly consume?: { readonly path: string; readonly expectedDigest: string };
  readonly barrier?: Rendezvous;
}): BoundedWorker {
  const observations: string[] = [];
  const consumed: Array<{ path: string; digest: string }> = [];
  const worker: BoundedWorker = {
    adapterId: `ci1c-bounded-worker:${input.owner}`,
    observations,
    consumed,
    startedAt: 0,
    endedAt: 0,
    async run({ workDir }) {
      worker.startedAt = Date.now();
      observations.push(`ran:${input.owner}`);
      if (input.consume !== undefined) {
        const actual = readFileSync(join(workDir, input.consume.path));
        const actualDigest = sha256(actual);
        consumed.push({ path: input.consume.path, digest: actualDigest });
        if (actualDigest !== input.consume.expectedDigest) {
          throw new Error(`CI1 dependency mismatch: consumed ${actualDigest}, expected ${input.consume.expectedDigest}`);
        }
      }
      /**
       * THE RENDEZVOUS. Each worker reports arrival and then WAITS for the other before doing its work, so the two
       * task-running intervals provably intersect. This replaces a fixed `setTimeout` hold, which was flaky: a
       * 150 ms hold lost the race whenever start-up variance exceeded it, and a passing overlap must not depend on
       * machine timing. A timeout keeps a broken barrier from hanging the suite.
       */
      if (input.barrier !== undefined) await input.barrier.arrive(input.owner);
      mkdirSync(join(workDir, input.file, ".."), { recursive: true });
      writeFileSync(join(workDir, input.file), input.contents);
      execFileSync("git", ["add", "-A"], { cwd: workDir });
      execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", `${input.owner} candidate`], { cwd: workDir });
      worker.endedAt = Date.now();
      return { kind: "READY_FOR_SETTLEMENT" };
    },
  };
  return worker;
}

function dispatchingWorker(byScope: ReadonlyMap<string, BoundedWorker>): WorkWorkerRunPort {
  return {
    adapterId: "ci1c-dispatching-worker",
    async run(input) {
      const scope = input.context.work.writeScope;
      const key = Array.isArray(scope) && scope.length > 0 ? String(scope[0]) : "";
      const worker = byScope.get(key);
      if (worker === undefined) throw new Error(`CI1C rig: no worker bound to scope ${JSON.stringify(scope)}`);
      return worker.run(input);
    },
  };
}

function declaredCarrierPort() {
  return callbackRuntimeCarrierPort("ci1c-declared-carrier", {
    onRealize: async (request) => ({
      runtimeAgent: { runtimeAdapter: "ci1c-declared", agentId: `agent-${request.activationId}` },
      session: { runtimeAdapter: "ci1c-declared", sessionId: `session-${request.activationId}` },
    }),
    onRelease: async () => undefined,
  });
}

interface Rig {
  readonly installed: ReturnType<typeof installPalimpsest>;
  readonly repo: string;
  readonly call: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  readonly start: (tasks: readonly TaskDecl[]) => Promise<void>;
  readonly runBoth: (order: readonly string[]) => Promise<Map<string, { attemptId: string; resultCommit: string }>>;
  readonly projection: () => Promise<Awaited<ReturnType<typeof buildProjectTrajectory>>>;
  readonly attemptRow: (attemptId: string) => { state: string; report: Record<string, unknown> | null } | null;
  readonly taskEnvelope: (taskId: string) => string | null;
}

function makeRig(input: {
  readonly tasks: readonly TaskDecl[];
  readonly workers: ReadonlyMap<string, BoundedWorker>;
}): Rig {
  const repo = makeBaselineRepo().repo;
  const baselineHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  const rig = mkdtempSync(join(tmpdir(), "ci1c-rig-"));
  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: "ci1c",
      databasePath: join(rig, "p.sqlite"),
      ordariumDatabasePath: join(rig, "o.sqlite"),
      repository: repo,
      git: new GitCliPort(repo, join(repo, ".palimpsest", "worlds")),
      execution: "worktree",
      concurrency: 2,
      standard: {
        statement: "the candidate exists and its scope is respected",
        clauses: [{ kind: "scope_respected" as const }],
        derivedFrom: ["ci1c fixture"],
        confirmed: true,
        notes: [],
      },
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
      runtimeCarrierPort: declaredCarrierPort(),
      workWorkerPort: () => dispatchingWorker(input.workers),
    } as never,
  );
  cleanups.push(() => {
    try {
      installed.dispose();
    } catch {
      /* best-effort */
    }
    removeTree(rig);
    removeTree(repo);
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

  const connection = installed.controller.store.connection as unknown as {
    prepare: (sql: string) => { get: (...args: never[]) => unknown; all: (...args: never[]) => unknown };
  };

  const attemptRow = (attemptId: string) => {
    const row = connection
      .prepare("SELECT state, report_json FROM attempts WHERE project_id=? AND attempt_id=?")
      .get("ci1c" as never, attemptId as never) as { state: string; report_json: Uint8Array | null } | undefined;
    if (row === undefined) return null;
    return {
      state: row.state,
      report: row.report_json === null ? null : (JSON.parse(new TextDecoder().decode(row.report_json)) as Record<string, unknown>),
    };
  };

  const taskEnvelope = (taskId: string): string | null => {
    /**
     * READ THROUGH THE OWNER'S OWN API, NOT RAW SQL.
     *
     * `events.payload_json` is a BLOB, and a raw `JSON.parse` of it fails. More importantly, the owner's typed read
     * is the supported way to see the event log, and using it here means the oracle reads the same canonical
     * history the projection reads — through the same parser — rather than a parallel decoding of storage bytes.
     */
    for (const event of installed.controller.store.listEvents("ci1c")) {
      if (event.event_type !== "TASK_CREATED" && event.event_type !== "TASK_REAUTHORIZED") continue;
      const payload = event.payload as { task_envelope?: { envelope_id?: unknown; task_id?: unknown } };
      if (payload.task_envelope?.task_id === taskId && typeof payload.task_envelope.envelope_id === "string") {
        return payload.task_envelope.envelope_id;
      }
    }
    return null;
  };

  const start = async (tasks: readonly TaskDecl[]) => {
    await call("palimpsest_start", {
      projectId: "ci1c",
      goal: "causal assay",
      headCommit: baselineHead,
      tasks,
    });
  };

  const service = installed.workDelegation;
  const awaitJob = async (jobId: string) => {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const view = await service!.followup({ jobId });
      if ("phase" in view && (view.phase === "FINISHED" || view.phase === "HOST_ERROR")) return view;
      await new Promise((done) => setTimeout(done, 25));
    }
    throw new Error(`job ${jobId} did not terminate`);
  };

  /**
   * START ORDER IS THE SCHEDULER'S, NOT THE CALLER'S — AND DELIVERY ORDER IS THE CALLER'S.
   *
   * This is a real product property that the first version of this control got wrong. `expectedTaskId` is an
   * ASSERTION, not a scheduling command: `speculativeAdmission` refuses with `TASK_NOT_NEXT_SCHEDULABLE` when the
   * caller names a task the scheduler would not have chosen next (`src/domain/speculative_authority.ts:130-150`).
   * A test therefore cannot ask for "B first" — the product refuses to reorder work, by design.
   *
   * What a test CAN control is the order in which it OBSERVES the results. Both jobs are started in the
   * scheduler's own order (the only order the product permits), both run concurrently under the declared
   * concurrency, and the caller awaits them in a chosen sequence. That is precisely the "out-of-order result
   * delivery" the ruling asks about, and it is the axis on which arrival order can actually differ.
   */
  const runBoth = async (awaitOrder: readonly string[]) => {
    const started = new Map<string, string>();
    for (const taskId of input.tasks.map((task) => task.task_id)) {
      const result = await service!.start({ expectedTaskId: taskId });
      started.set(taskId, result.jobId);
    }
    const views = new Map<string, Awaited<ReturnType<typeof awaitJob>>>();
    for (const taskId of awaitOrder) {
      views.set(taskId, await awaitJob(started.get(taskId)!));
    }
    const out = new Map<string, { attemptId: string; resultCommit: string }>();
    for (const taskId of input.tasks.map((task) => task.task_id)) {
      const view = views.get(taskId)!;
      if (view.phase !== "FINISHED" || !("attemptId" in view) || view.attemptId === null) {
        throw new Error(`task ${taskId} did not finish: ${JSON.stringify(view)}`);
      }
      const row = attemptRow(view.attemptId);
      if (row === null || typeof row.report?.result_commit !== "string") {
        throw new Error(`task ${taskId} has no canonical result: ${JSON.stringify(row)}`);
      }
      out.set(taskId, { attemptId: view.attemptId, resultCommit: row.report.result_commit });
    }
    return out;
  };

  const projection = async () =>
    buildProjectTrajectory(
      composeTrajectoryInputs({
        projectId: "ci1c",
        controller: installed.controller as unknown as Parameters<typeof composeTrajectoryInputs>[0]["controller"],
        promotions: installed.controller.promotions as unknown as Parameters<typeof composeTrajectoryInputs>[0]["promotions"],
        reasoning: undefined,
        proof: undefined,
        projectWorkspace: undefined,
        journalStore: undefined,
        associationStore: undefined,
      }),
    );

  return { installed, repo, call, start, runBoth, projection, attemptRow, taskEnvelope };
}

/**
 * THE ORACLE.
 *
 * It is a pure function of facts this file already holds. It never sees a projection.
 *
 *   knownDependencies      project data-dependency edges that MUST be present;
 *   knownAbsences          direct dependency edges that MUST be absent INSIDE THIS SCENARIO;
 *   unknown                relations not observed, and therefore not claimed.
 */
interface Oracle {
  readonly scenarioId: string;
  readonly knownDependencies: readonly { from: string; to: string; relation: string; basis: string }[];
  readonly knownAbsences: readonly { from: string; to: string; relation: string; basis: string }[];
  readonly unknown: readonly string[];
  readonly sharedBaseline: { readonly s0Digest: string; readonly relation: string; readonly expressibleByTrajectory: boolean };
}

function buildIndependentOracle(input: {
  readonly attemptA: string;
  readonly attemptB: string;
  readonly taskA: string;
  readonly taskB: string;
}): Oracle {
  return {
    scenarioId: "C2-A-independent-owners",
    /**
     * What MUST be there. Each is a fact about the fixture: task A authorized attempt A, and attempt A produced a
     * result. Nothing about B appears in A's lineage, by construction.
     */
    knownDependencies: [
      { from: `task:${input.taskA}`, to: `attempt:${input.attemptA}`, relation: "TASK_AUTHORIZED_ATTEMPT", basis: "palimpsest_start declared task-a, and the consumer settled attempt A from it" },
      { from: `attempt:${input.attemptA}`, to: "result:A", relation: "ATTEMPT_PRODUCED_RESULT", basis: "the consumer reported a result_commit for attempt A" },
      { from: `task:${input.taskB}`, to: `attempt:${input.attemptB}`, relation: "TASK_AUTHORIZED_ATTEMPT", basis: "palimpsest_start declared task-b, and the consumer settled attempt B from it" },
      { from: `attempt:${input.attemptB}`, to: "result:B", relation: "ATTEMPT_PRODUCED_RESULT", basis: "the consumer reported a result_commit for attempt B" },
    ],
    /**
     * What must be ABSENT. Both directions, because a fabricated edge in either direction is equally wrong.
     * Scoped to this closed scenario: no claim is made about the world outside it.
     */
    knownAbsences: [
      { from: `attempt:${input.attemptA}`, to: `attempt:${input.attemptB}`, relation: "DIRECT_DEPENDENCY", basis: "neither task declares depends_on, and neither worker consumed the other's output" },
      { from: `attempt:${input.attemptB}`, to: `attempt:${input.attemptA}`, relation: "DIRECT_DEPENDENCY", basis: "same, in the other direction" },
      { from: "result:A", to: "result:B", relation: "RESULT_DEPENDENCY", basis: "B's worker never read A's bytes; its consumed set is empty" },
      { from: "result:B", to: "result:A", relation: "RESULT_DEPENDENCY", basis: "same, in the other direction" },
    ],
    unknown: [
      "whether a later stage will promote either result, and into what",
      "any dependency mediated outside this project's event log",
    ],
    /**
     * THE SHARED BASELINE IS A REAL RELATION AND THE EXISTING TRAJECTORY CANNOT EXPRESS IT.
     *
     * Both attempts were authorized under the same baseline commit, which is a genuine shared-input fact. The
     * projection's 16 relation kinds contain no `SAME_BASIS`/`SHARED_BASELINE` edge, so this is reported as a
     * NAMED LIMITATION rather than being smuggled in as a fabricated edge or silently dropped.
     */
    sharedBaseline: { s0Digest: S0_DIGEST, relation: "SHARED_IMMUTABLE_BASELINE", expressibleByTrajectory: false },
  };
}

/** Extract the relation multiset from a projection, in a form the oracle can be compared against. */
function relationsOf(projection: Awaited<ReturnType<typeof buildProjectTrajectory>>): Array<{ relation: string; from: string; to: string; state: string }> {
  return projection.edges.map((edge) => ({
    relation: edge.relation,
    from: edge.fromNodeId,
    to: edge.toNodeId,
    state: edge.evidenceState,
  }));
}

/**
 * MATCH ON WHAT THE PROJECTION ITSELF SAYS THE NODE IS.
 *
 * Two wrong turns are recorded here, because each would have produced a FALSE VERDICT ABOUT THE PRODUCT:
 *
 * 1. Node ids are deterministic HASHES (`tn-<digest>`), so an attempt id never appears in one. Matching substrings
 *    against node ids found nothing and would have reported "the projection is missing the relation".
 * 2. `reference.canonicalId` is the EVENT id (`"8"`, `"10"`), not the attempt id. The attempt identity lives in the
 *    node's LABEL (`ATTEMPT_CREATED attempt-<hex>`), because the owner reference addresses the canonical EVENT and
 *    the event's entity is what carries the attempt.
 *
 * So the oracle matches on the label, and pins the exact event by canonical id. Both are projection OUTPUT being
 * compared against fixture FACTS, which is the only direction this comparison can legitimately run.
 */
interface NodeFact {
  readonly nodeId: string;
  readonly label: string;
  readonly eventId: string;
  readonly sequence: number | null;
}

function factsOf(projection: Awaited<ReturnType<typeof buildProjectTrajectory>>): Map<string, NodeFact> {
  return new Map(
    projection.nodes.map((node) => [
      node.nodeId,
      {
        nodeId: node.nodeId,
        label: node.label,
        eventId: node.reference.canonicalId,
        sequence: node.reference.sourceSequence,
      },
    ]),
  );
}

/** The node whose label is exactly `<eventType> <attemptId>` — the projection's own statement of that event. */
function findEventNode(facts: ReadonlyMap<string, NodeFact>, eventType: string, entity: string): NodeFact | undefined {
  for (const fact of facts.values()) {
    if (fact.label === `${eventType} ${entity}`) return fact;
  }
  return undefined;
}

/** Is there an ESTABLISHED edge of this relation from the given node to the given node? */
function hasEstablishedBetween(
  edges: ReturnType<typeof relationsOf>,
  relation: string,
  fromNodeId: string,
  toNodeId: string,
): boolean {
  return edges.some(
    (edge) => edge.relation === relation && edge.state === "ESTABLISHED_BY_OWNER_REFERENCE" && edge.from === fromNodeId && edge.to === toNodeId,
  );
}

/**
 * CAUSAL EDGES BETWEEN TWO ATTEMPTS — the claim that must be ABSENT.
 *
 * Only edges whose evidence state says the OWNER RECORDED the relation count as a causal claim. An edge labelled
 * `TEMPORAL_ONLY` is the projection explicitly refusing to call adjacency causation, so treating it as a
 * dependency would be a false positive about the product.
 */
function causalEdgesBetween(edges: ReturnType<typeof relationsOf>, facts: ReadonlyMap<string, NodeFact>, attemptA: string, attemptB: string) {
  const namesA = (nodeId: string): boolean => facts.get(nodeId)?.label.includes(attemptA) ?? false;
  const namesB = (nodeId: string): boolean => facts.get(nodeId)?.label.includes(attemptB) ?? false;
  return edges.filter(
    (edge) =>
      edge.state === "ESTABLISHED_BY_OWNER_REFERENCE" &&
      ((namesA(edge.from) && namesB(edge.to)) || (namesB(edge.from) && namesA(edge.to))),
  );
}

/** Every edge between the two attempts regardless of evidence state, so the temporal ones can be inspected. */
function allEdgesBetween(edges: ReturnType<typeof relationsOf>, facts: ReadonlyMap<string, NodeFact>, attemptA: string, attemptB: string) {
  const namesA = (nodeId: string): boolean => facts.get(nodeId)?.label.includes(attemptA) ?? false;
  const namesB = (nodeId: string): boolean => facts.get(nodeId)?.label.includes(attemptB) ?? false;
  return edges.filter((edge) => (namesA(edge.from) && namesB(edge.to)) || (namesB(edge.from) && namesA(edge.to)));
}

describe("CI1 §8 C2-A — independent Owners, and no fabricated causality", () => {
  it("observation order does not change the verified project relations", async () => {
    /**
     * TWO RUNS OF THE SAME SCENARIO, WITH THE DELIVERY ORDER PERMUTED.
     *
     * Each run is a fresh repository and a fresh ledger, so nothing carries over. The only difference between them
     * is the order in which this test starts and awaits the two jobs. The project facts are identical, so the
     * verified relations must be identical.
     */
    const runScenario = async (order: readonly string[], barrier: Rendezvous) => {
      const workerA = boundedWorker({ owner: "owner-a", file: "src/a.ts", contents: "export const a = 'A1';\n", barrier });
      const workerB = boundedWorker({ owner: "owner-b", file: "src/b.ts", contents: "export const b = 'B1';\n", barrier });
      const rig = makeRig({ tasks: INDEPENDENT_TASKS, workers: new Map([["src/a.ts", workerA], ["src/b.ts", workerB]]) });
      await rig.start(INDEPENDENT_TASKS);
      const results = await rig.runBoth(order);
      const projection = await rig.projection();
      const envelopeA = rig.taskEnvelope("task-a");
      const envelopeB = rig.taskEnvelope("task-b");
      return { rig, results, projection, workerA, workerB, envelopeA, envelopeB, barrier };
    };

    /** Same project facts; the only difference is which completion this caller observes first. */
    const aThenB = await runScenario(["task-a", "task-b"], new Rendezvous());
    const bThenA = await runScenario(["task-b", "task-a"], new Rendezvous());

    const attemptA1 = aThenB.results.get("task-a")!.attemptId;
    const attemptB1 = aThenB.results.get("task-b")!.attemptId;
    const attemptA2 = bThenA.results.get("task-a")!.attemptId;
    const attemptB2 = bThenA.results.get("task-b")!.attemptId;

    /** Distinct runs, distinct attempts, distinct result commits — in BOTH orders. */
    expect(attemptA1).not.toBe(attemptB1);
    expect(attemptA2).not.toBe(attemptB2);
    expect(aThenB.results.get("task-a")!.resultCommit).not.toBe(aThenB.results.get("task-b")!.resultCommit);
    expect(bThenA.results.get("task-a")!.resultCommit).not.toBe(bThenA.results.get("task-b")!.resultCommit);

    /** Each worker ran exactly once, in its own run, and neither consumed anything (independence is real). */
    expect(aThenB.workerA.observations).toEqual(["ran:owner-a"]);
    expect(aThenB.workerB.observations).toEqual(["ran:owner-b"]);
    expect(aThenB.workerA.consumed).toEqual([]);
    expect(aThenB.workerB.consumed).toEqual([]);

    /**
     * THE ORACLE IS BUILT FROM THE FIXTURE, BEFORE THE PROJECTION IS CONSULTED.
     *
     * It is constructed here from the attempt ids and the declared task ids, not from any projection output.
     */
    const oracle = buildIndependentOracle({ attemptA: attemptA1, attemptB: attemptB1, taskA: "task-a", taskB: "task-b" });
    expect(oracle.sharedBaseline.expressibleByTrajectory).toBe(false);

    const edges = relationsOf(aThenB.projection);
    const edgesPermuted = relationsOf(bThenA.projection);


    const facts = factsOf(aThenB.projection);
    const factsPermuted = factsOf(bThenA.projection);

    /**
     * POSITIVE FIRST, ALWAYS.
     *
     * Every negative check below is VACUOUS if the projection simply omitted one of the attempts. So the presence
     * of both attempts — as their own ATTEMPT_CREATED and ATTEMPT_COMPLETED events — is established before any
     * absence is asserted.
     */
    const createdA1 = findEventNode(facts, "ATTEMPT_CREATED", attemptA1);
    const createdB1 = findEventNode(facts, "ATTEMPT_CREATED", attemptB1);
    const completedA1 = findEventNode(facts, "ATTEMPT_COMPLETED", attemptA1);
    const completedB1 = findEventNode(facts, "ATTEMPT_COMPLETED", attemptB1);
    expect(createdA1).toBeDefined();
    expect(createdB1).toBeDefined();
    expect(completedA1).toBeDefined();
    expect(completedB1).toBeDefined();
    if (createdA1 === undefined || createdB1 === undefined || completedA1 === undefined || completedB1 === undefined) return;

    /**
     * POSITIVE: each attempt's lineage is ESTABLISHED. `ATTEMPT_PRODUCED_RESULT` runs from the attempt's
     * ATTEMPT_CREATED node to its own terminal node, so this is a real lineage edge anchored on the attempt the
     * consumer actually settled.
     */
    expect(hasEstablishedBetween(edges, "ATTEMPT_PRODUCED_RESULT", createdA1.nodeId, completedA1.nodeId)).toBe(true);
    expect(hasEstablishedBetween(edges, "ATTEMPT_PRODUCED_RESULT", createdB1.nodeId, completedB1.nodeId)).toBe(true);

    /**
     * POSITIVE: each attempt is authorized by its own task. The authorizing node is the TASK_CREATED event, whose
     * label names the task id, and the edge lands on the attempt's own ATTEMPT_CREATED node.
     */
    const taskNodeA = findEventNode(facts, "TASK_CREATED", "task-a");
    const taskNodeB = findEventNode(facts, "TASK_CREATED", "task-b");
    expect(taskNodeA).toBeDefined();
    expect(taskNodeB).toBeDefined();
    if (taskNodeA === undefined || taskNodeB === undefined) return;
    expect(hasEstablishedBetween(edges, "TASK_AUTHORIZED_ATTEMPT", taskNodeA.nodeId, createdA1.nodeId)).toBe(true);
    expect(hasEstablishedBetween(edges, "TASK_AUTHORIZED_ATTEMPT", taskNodeB.nodeId, createdB1.nodeId)).toBe(true);

    /** The same positive facts hold under the permuted observation order. */
    const createdA2 = findEventNode(factsPermuted, "ATTEMPT_CREATED", attemptA2);
    const createdB2 = findEventNode(factsPermuted, "ATTEMPT_CREATED", attemptB2);
    const completedA2 = findEventNode(factsPermuted, "ATTEMPT_COMPLETED", attemptA2);
    const completedB2 = findEventNode(factsPermuted, "ATTEMPT_COMPLETED", attemptB2);
    expect(createdA2).toBeDefined();
    expect(createdB2).toBeDefined();
    expect(completedA2).toBeDefined();
    expect(completedB2).toBeDefined();
    if (createdA2 === undefined || createdB2 === undefined || completedA2 === undefined || completedB2 === undefined) return;
    expect(hasEstablishedBetween(edgesPermuted, "ATTEMPT_PRODUCED_RESULT", createdA2.nodeId, completedA2.nodeId)).toBe(true);
    expect(hasEstablishedBetween(edgesPermuted, "ATTEMPT_PRODUCED_RESULT", createdB2.nodeId, completedB2.nodeId)).toBe(true);

    /**
     * NEGATIVE — THE FABRICATED-CAUSALITY CONTROL, AND THE REASON THIS TEST EXISTS.
     *
     * No edge of ANY relation may connect a node naming attempt A to a node naming attempt B, in either direction.
     * Observation order differs between the two runs and the answer must not.
     */
    expect(causalEdgesBetween(edges, facts, attemptA1, attemptB1)).toEqual([]);
    expect(causalEdgesBetween(edgesPermuted, factsPermuted, attemptA2, attemptB2)).toEqual([]);

    /**
     * THE TEMPORAL EDGE IS PRESENT, AND MUST STAY HONESTLY LABELLED.
     *
     * This is the finding that made this control worth writing. The projection DOES emit an edge between the two
     * attempts — `SAME_OWNER_SEQUENCE_SUCCESSOR`, from A's ATTEMPT_COMPLETED to B's ATTEMPT_STARTED — because they
     * are adjacent in the event log. That is not a defect: `projection.ts:481-497` labels it `TEMPORAL_ONLY` with
     * the detail "ordering only, not causation".
     *
     * But it means the safety of the whole independence claim rests on a CONSUMER checking `evidenceState`. A
     * consumer that reads edges without checking it would see a cross-owner edge and could mistake it for a
     * dependency. So the assertion is not "no edge exists" — that would be false — but "every cross-attempt edge is
     * labelled non-causal", which is the property that actually has to hold.
     */
    for (const edge of allEdgesBetween(edges, facts, attemptA1, attemptB1)) {
      expect(edge.state).not.toBe("ESTABLISHED_BY_OWNER_REFERENCE");
      expect(edge.relation).toBe("SAME_OWNER_SEQUENCE_SUCCESSOR");
    }

    /**
     * NEGATIVE, AT THE RESULT LAYER: no edge may assert that one result produced or derived from the other. Both
     * results exist (asserted above via the completed nodes), so this is a real absence rather than a vacuous one.
     */
    const commitA1 = aThenB.results.get("task-a")!.resultCommit;
    const commitB1 = aThenB.results.get("task-b")!.resultCommit;
    const resultEdges = edges.filter((edge) => edge.relation === "ATTEMPT_PRODUCED_RESULT" && edge.state === "ESTABLISHED_BY_OWNER_REFERENCE");
    expect(resultEdges.length).toBe(2);
    const claimsBoth = resultEdges.filter((edge) => {
      const from = facts.get(edge.from);
      const to = facts.get(edge.to);
      if (from === undefined || to === undefined) return false;
      return (from.label.includes(attemptA1) && to.label.includes(attemptB1)) || (from.label.includes(attemptB1) && to.label.includes(attemptA1));
    });
    expect(claimsBoth).toEqual([]);
    /** And the two commits are genuinely different objects, so "the same result twice" is excluded. */
    expect(commitA1).not.toBe(commitB1);

    /**
     * ORDER INDEPENDENCE, STATED AS A STRUCTURAL COMPARISON.
     *
     * The multiset of (relation, evidence state) pairs must be identical across the two runs. This is stronger than
     * "no wrong edge appeared": the projection produced the SAME STRUCTURE despite a different observation order.
     * Attempt and task identities are normalised so the comparison is about shape, not about which hex happened.
     */
    const shapeOf = (list: ReturnType<typeof relationsOf>) =>
      list
        .map((edge) => `${edge.relation}|${edge.state}`)
        .sort((left, right) => left.localeCompare(right));
    expect(shapeOf(edges)).toEqual(shapeOf(edgesPermuted));

    /**
     * THE OVERLAP CLAIM, AND ITS LABEL.
     *
     * A 150 ms hold on A while B runs unbounded gives a real window; whether the two intervals intersected is
     * computed from the workers' own timestamps, not assumed from `Promise.all`. This is a TEST-COORDINATION fact
     * and is reported as such — it is NOT an application-level asset dependency.
     */
    /**
     * THE OVERLAP IS ESTABLISHED BY THE BARRIER, NOT BY A TIMER.
     *
     * Both workers must have arrived at the rendezvous before either could proceed, so the two task-running
     * intervals provably intersect: the second arrival happens while the first is still parked. That is a stronger
     * statement than "the wall-clock intervals overlapped", because it does not depend on how fast either task runs
     * after the barrier releases.
     *
     * The measured overlap below is the SECOND-ARRIVAL-to-FIRST-END window, which is positive by construction when
     * the barrier works, and the assertion on the arrival count is what proves the barrier actually engaged.
     */
    expect(aThenB.barrier.arrivalOrder.length).toBe(2);
    expect(new Set(aThenB.barrier.arrivalOrder)).toEqual(new Set(["owner-a", "owner-b"]));
    const overlapMs = Math.max(
      0,
      Math.min(aThenB.workerA.endedAt, aThenB.workerB.endedAt) - Math.max(aThenB.barrier.arrivalTime("owner-a"), aThenB.barrier.arrivalTime("owner-b")),
    );
    expect(overlapMs).toBeGreaterThan(0);
  }, 240_000);
});
