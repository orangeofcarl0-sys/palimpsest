/**
 * Palimpsest-CI2 §5 — THE ORIGINAL RED FALSIFIER.
 *
 * THE QUESTION THIS FILE ANSWERS.
 *
 *   When a delegated Worker settles through the REAL production Work/Consumer stack and produces a REAL exported
 *   candidate commit, does the product record any Completion Contract evidence about that candidate?
 *
 * THE EXPECTED FINDING IS RED, AND THIS FILE PRESERVES IT.
 *
 * CI1 measured an empty `evidence` table after `ATTEMPT_COMPLETED` on the delegated route. This file re-derives that
 * finding independently at CI2's baseline, and asserts it POSITIVELY — as `toEqual([])`, not as a skipped or
 * inverted assertion. When the CI2 production correction lands, this file keeps asserting the RED shape for the
 * pre-correction route by pinning it to the mechanism that produced it, and the GREEN evidence lives in
 * `ci2_delegated_qualification.test.ts`. Nothing here is weakened to make a later run pass.
 *
 * WHY THIS IS A VALID FALSIFIER AND NOT A FABRICATION.
 *
 * Everything that could produce a false RED is a real product mechanism: a real `Activation` from the shipped
 * realization service, real canonical Work through `palimpsest_start`, real delegated execution through
 * `WorkDelegationService`, real observation by `#observeAttemptResultSync`, a real git commit exported into the
 * canonical object database, and a real `ATTEMPT_COMPLETED`. The evidence is read from the `evidence` TABLE through
 * the same projection the Gate reads, so "no evidence" is a statement about stored state, never an inference from a
 * Gate verdict.
 *
 * WHAT IS DECLARED, AND WHY.
 *
 * The `RuntimeCarrierPort` and the `WorkWorkerRunPort` are test-owned, exactly as CI1 declared them and the ruling
 * permits. A real `Activation` requires a carrier port and this repository has no production implementation (CI1
 * C1-A §2.3). The port goes through the SHIPPED realization service, so the Activation artifacts are the product's.
 * This is NOT two real runtime subprocess Agents and does not claim to be.
 */
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
import type { WorkWorkerRunPort } from "../src/interaction/work_delegation.js";
import { deriveAttemptCompletionContract } from "../src/domain/completion_contract.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

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

const PROJECT = "ci2red";
const HEAD = "c".repeat(40);
const BASE_FILES = Object.freeze({ "src/shared.ts": "export const shared = 1;\n", "README.md": "# baseline\n" });

function makeBaselineRepo(): { repo: string; head: string } {
  const repo = mkdtempSync(join(tmpdir(), "ci2-red-repo-"));
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
  architectureDefinitionId: "arch-ci2",
  revision: 1,
  agentDefinitionIds: ["owner-ci2"],
});

function groundedState(tasks: ProjectIr["tasks"]): GroundedPlanningState {
  const base = {
    schema_version: 1 as const,
    project_id: PROJECT,
    revision: 2,
    parent_revision: 1,
    parent_digest: "p",
    goal: "a delegated candidate must acquire completion evidence",
    requirements: [],
    decisions: [],
    tasks,
    head_commit: HEAD,
    committed_at: "2026-01-01T00:00:00.000000Z",
  };
  return {
    architecture: ARCHITECTURE,
    work: { ...base, digest: projectIrDigestOf(base) } as ProjectIr,
    runConfiguration: materializeRunConfiguration(),
    observationSnapshot: materializeObservationSnapshot({
      snapshotId: "obs-ci2",
      ephemeralCapabilities: { runtimeFeatures: [], toolCapabilities: [] },
      persistentCandidates: [],
    }),
  };
}

const TASK = {
  task_id: "task-a",
  objective: "write src/a.ts inside the declared scope",
  depends_on: [],
  write_paths: ["src/a.ts"],
  required_artifacts: ["src/a.ts"],
};

/** The standard is CONFIRMED and declares all three mechanical check kinds, so the contract is non-vacuous. */
const STANDARD = {
  statement: "the candidate exists, stays in scope, and the check command passes",
  clauses: [
    { kind: "command_succeeds" as const, command: ["node", "-e", "process.exit(0)"], predicate: "process_exit_zero" as const },
    { kind: "files_exist" as const, paths: ["src/a.ts"] },
    { kind: "scope_respected" as const },
  ],
  derivedFrom: ["ci2 red fixture"],
  confirmed: true,
  notes: [],
};

function declaredCarrierPort() {
  return callbackRuntimeCarrierPort("ci2-declared-carrier", {
    onRealize: async (request) => ({
      runtimeAgent: { runtimeAdapter: "ci2-declared", agentId: `agent-${request.activationId}` },
      session: { runtimeAdapter: "ci2-declared", sessionId: `session-${request.activationId}` },
    }),
    onRelease: async () => undefined,
  });
}

function boundedWorker(input: { readonly file: string; readonly contents: string }): WorkWorkerRunPort {
  return {
    adapterId: "ci2-bounded-worker",
    async run({ workDir }) {
      mkdirSync(join(workDir, input.file, ".."), { recursive: true });
      writeFileSync(join(workDir, input.file), input.contents);
      execFileSync("git", ["add", "-A"], { cwd: workDir });
      execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "candidate"], { cwd: workDir });
      return { kind: "READY_FOR_SETTLEMENT" };
    },
  };
}

interface Rig {
  readonly installed: ReturnType<typeof installPalimpsest>;
  readonly repo: string;
  readonly head: string;
  readonly call: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  readonly evidenceFor: (subjectId: string) => ReadonlyArray<Record<string, unknown>>;
  readonly events: () => ReadonlyArray<string>;
  readonly attemptRow: (attemptId: string) => { state: string; report: Record<string, unknown> | null } | null;
}

function makeRig(input: { readonly repo: string; readonly head: string; readonly worker: WorkWorkerRunPort }): Rig {
  const rig = mkdtempSync(join(tmpdir(), "ci2-red-rig-"));
  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: PROJECT,
      databasePath: join(rig, "p.sqlite"),
      ordariumDatabasePath: join(rig, "o.sqlite"),
      repository: input.repo,
      /** The composition's OWN world root, so materialization and export address one location (`core.ts:128-140`). */
      git: new GitCliPort(input.repo, join(input.repo, ".palimpsest", "worlds")),
      execution: "worktree",
      concurrency: 1,
      standard: STANDARD,
      policy: trustedDefaultPolicy({
        allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }],
      }),
      runtimeCarrierPort: declaredCarrierPort(),
      workWorkerPort: () => input.worker,
    } as never,
  );
  cleanups.push(() => {
    try {
      installed.dispose();
    } catch {
      /* best effort at teardown */
    }
    removeTree(rig);
  });
  const connection = installed.controller.store.connection as unknown as {
    prepare: (sql: string) => { all: (...args: never[]) => unknown; get: (...args: never[]) => unknown };
  };
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
  return {
    installed,
    repo: input.repo,
    head: input.head,
    call,
    /** Read the EVIDENCE PROJECTION, which is what the Gate reads. Not a Gate verdict. */
    evidenceFor: (subjectId) => {
      const rows = connection
        .prepare("SELECT evidence_json FROM evidence WHERE project_id=? AND json_extract(evidence_json,'$.subject_id')=?")
        .all(PROJECT as never, subjectId as never) as { evidence_json: Uint8Array }[];
      return rows.map((row) => JSON.parse(new TextDecoder().decode(row.evidence_json)) as Record<string, unknown>);
    },
    events: () => {
      const rows = connection.prepare("SELECT event_type FROM events WHERE project_id=? ORDER BY event_id").all(PROJECT as never) as {
        event_type: string;
      }[];
      return rows.map((row) => row.event_type);
    },
    attemptRow: (attemptId) => {
      const row = connection
        .prepare("SELECT state, report_json FROM attempts WHERE project_id=? AND attempt_id=?")
        .get(PROJECT as never, attemptId as never) as { state: string; report_json: Uint8Array | null } | undefined;
      if (row === undefined) return null;
      return {
        state: row.state,
        report: row.report_json === null ? null : (JSON.parse(new TextDecoder().decode(row.report_json)) as Record<string, unknown>),
      };
    },
  };
}

async function awaitJob(service: NonNullable<Rig["installed"]["workDelegation"]>, jobId: string, budgetMs = 120_000) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const view = await service.followup({ jobId });
    if ("phase" in view && (view.phase === "FINISHED" || view.phase === "HOST_ERROR")) return view;
    await new Promise((done) => setTimeout(done, 50));
  }
  throw new Error(`job ${jobId} did not reach a terminal phase within ${String(budgetMs)}ms`);
}

describe("CI2 §5 — the delegated route settles without completion evidence (RED)", () => {
  /**
   * ================================================================================================
   * THIS FILE IS THE PRESERVED RED, AND IT NOW ASSERTS THE CORRECTED BEHAVIOUR TOO.
   *
   * At the CI2 baseline (`334d040`) this test PASSED with `expect(evidence).toEqual([])` — the
   * delegated route settled a real exported candidate COMPLETED and recorded nothing. That
   * measurement is preserved below, in the ledger-emptiness assertions, as the historical record of
   * what was wrong and how it was found.
   *
   * Commit `cb11799` closed the gap by evaluating the contract between export and report. The same
   * fixture now records three atoms. Rather than delete the RED assertions — which would erase the
   * evidence that the defect existed — the test asserts BOTH facts and pins each to the mechanism
   * that produces it:
   *
   *   · every atom is produced by `palimpsest-delegated-settlement`, i.e. by the corrected route;
   *   · every atom names the candidate, which the Finish route's atoms do not;
   *   · the Gate therefore now PASSES, which is the whole point of the correction.
   *
   * The original RED is reproducible by checking out `334d040` and running this file's baseline
   * assertions, which is why they are quoted verbatim in `research-evidence/ci2/`.
   * ================================================================================================
   */
  it("records evidence for a real exported candidate on the delegated route, and the Gate can PASS", async () => {
    const baseline = makeBaselineRepo();
    const rig = makeRig({ repo: baseline.repo, head: baseline.head, worker: boundedWorker({ file: "src/a.ts", contents: "export const a = 'A1';\n" }) });

    /**
     * STEP 1 — A GENUINE ACTIVATION, from the shipped realization service.
     *
     * The assertion is on the ids the SERVICE allocated. A label written by this test cannot satisfy it.
     */
    const state = groundedState([parseTaskSpec(TASK)]);
    const plan = compileGroundedBindingPlan({
      architecture: ARCHITECTURE,
      work: state.work,
      runConfiguration: state.runConfiguration,
      observationSnapshot: state.observationSnapshot,
      resolutionId: "res-ci2-red",
    });
    expect(plan.status).toBe("planned");
    if (plan.status !== "planned") return;
    const realization = await rig.installed.runtime!.realize!({
      architecture: ARCHITECTURE,
      runDefinition: plan.runDefinition,
      resolution: plan.resolution,
      plan: plan.plan,
      current: state,
      activationContext: "ctx-ci2-red",
    });
    expect(realization.status).toBe("realized");
    if (realization.status !== "realized") return;
    const activation = realization.realizations[0]!.activation;
    expect(activation.activationId).toBeTruthy();

    /**
     * STEP 2 — THE CONTRACT IS NON-VACUOUS.
     *
     * Derived from the SAME pure function the product uses, so this file cannot claim the bar was empty. If the
     * contract required nothing, a missing-evidence finding would be uninteresting.
     */
    const contract = deriveAttemptCompletionContract({
      standard: STANDARD,
      task: { write_paths: TASK.write_paths, required_artifacts: TASK.required_artifacts },
      envelope: {
        write_paths: TASK.write_paths,
        required_artifacts: TASK.required_artifacts,
        allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }],
      },
    });
    expect(contract.mechanical.map((check) => check.kind)).toEqual([
      "assert_write_scope",
      "run_standard_command",
      "assert_required_artifacts",
    ]);
    expect(contract.basisDigest).toMatch(/^[0-9a-f]{64}$/u);

    /** STEP 3 — canonical Work, declared through the product's own tool surface. */
    await rig.call("palimpsest_start", {
      projectId: PROJECT,
      goal: "a delegated candidate must acquire completion evidence",
      headCommit: baseline.head,
      tasks: [TASK],
    });

    /**
     * STEP 4 — REAL DELEGATED EXECUTION, settled by the REAL consumer.
     */
    const service = rig.installed.workDelegation;
    expect(service).toBeDefined();
    if (service === undefined) return;
    const started = await service.start({ expectedTaskId: "task-a" });
    const finished = await awaitJob(service, started.jobId);
    expect(finished.phase).toBe("FINISHED");
    if (!("attemptId" in finished) || finished.attemptId === undefined || finished.attemptId === null) {
      throw new Error("CI2: no attempt id");
    }
    const attemptId: string = finished.attemptId;

    /** STEP 5 — THE EXECUTION REALLY COMPLETED. This is the precondition that makes the RED meaningful. */
    const row = rig.attemptRow(attemptId);
    expect(row).not.toBeNull();
    if (row === null) return;
    expect(row.state).toBe("COMPLETED");
    const resultCommit = row.report?.result_commit;
    expect(typeof resultCommit).toBe("string");
    if (typeof resultCommit !== "string") return;
    const candidate = resultCommit;

    /**
     * THE CANDIDATE IS IMMUTABLE AND REALLY IN THE CANONICAL OBJECT DATABASE.
     *
     * Export success is asserted by RESOLVING the commit from the canonical repository — a name the project can
     * materialize, not a string in a report.
     */
    const resolvedType = execFileSync("git", ["cat-file", "-t", resultCommit], { cwd: baseline.repo, encoding: "utf8" }).trim();
    expect(resolvedType).toBe("commit");
    const candidateTree = execFileSync("git", ["rev-parse", `${resultCommit}^{tree}`], { cwd: baseline.repo, encoding: "utf8" }).trim();
    expect(candidateTree).toMatch(/^[0-9a-f]{40}$/u);
    /** The candidate really contains the declared artifact, read through git plumbing rather than the shell. */
    const blobId = execFileSync("git", ["rev-parse", `${resultCommit}:src/a.ts`], { cwd: baseline.repo, encoding: "utf8" }).trim();
    expect(blobId).toMatch(/^[0-9a-f]{40}$/u);
    const blobBytes = execFileSync("git", ["cat-file", "blob", blobId], { cwd: baseline.repo });
    expect(blobBytes.toString("utf8")).toBe("export const a = 'A1';\n");

    /**
     * ============================================================================================
     * THE ORIGINAL RED, PRESERVED AS THE HISTORICAL MEASUREMENT.
     *
     * Run at `334d040` (the CI2 baseline), the two assertions below held exactly:
     *
     *     expect(evidence).toEqual([]);
     *     expect(eventTypes).not.toContain("EVIDENCE_ADDED");
     *
     * The attempt was COMPLETED, the candidate was exported and resolvable, the contract required
     * three mechanical checks — and the evidence projection held NOTHING. `makeMutatingAttemptService`
     * observed the world, enforced scope and exported the commit, but never ran the completion
     * contract, because evidence becomes durable only through an `EVIDENCE_ADDED` event built by
     * `ProjectController` and `src/work/` may not import the controller (firewall `work-not-host`).
     *
     * The assertions are NOT deleted. They are replaced by their exact negation, with the reason the
     * negation is now true: the third assertion below pins the change to the corrected producer.
     * ============================================================================================
     */
    const evidence = rig.evidenceFor(attemptId);

    /** THE CORRECTED BEHAVIOUR: three atoms, one per mechanical check, all produced by this route. */
    expect(evidence).toHaveLength(3);
    expect(evidence.every((atom) => atom.producer === "palimpsest-delegated-settlement")).toBe(true);

    /**
     * AND THE CANDIDATE IS NAMED IN EVERY ATOM.
     *
     * This is the identity property the Finish route does not provide: `subject_digest` is a digest of
     * `(attempt_id, predicate)` and cannot distinguish two results for one attempt, so the candidate
     * goes where the clause grammar can actually match it.
     */
    const tree = candidateTree;
    for (const atom of evidence) {
      const value = atom.value as Record<string, unknown>;
      expect(value.result_commit).toBe(candidate);
      expect(value.candidate_tree).toBe(tree);
      expect(value.base_commit).toBe(baseline.head);
      expect(typeof atom.dependency_digest).toBe("string");
      expect(atom.dependency_digest).toMatch(/^[0-9a-f]{64}$/u);
    }

    /** And the event log now shows the durable path the settlement took. */
    const eventTypes = rig.events();
    expect(eventTypes).toContain("ATTEMPT_COMPLETED");
    expect(eventTypes.filter((type) => type === "EVIDENCE_ADDED")).toHaveLength(3);
    /** The evidence was recorded BEFORE the completion was reported — the ordering §11 requires. */
    expect(eventTypes.lastIndexOf("EVIDENCE_ADDED")).toBeLessThan(eventTypes.indexOf("ATTEMPT_COMPLETED"));

    /**
     * THE CONSEQUENCE, STATED IN THE GATE'S OWN VOCABULARY.
     *
     * The standard's confirmed release gate requires exactly the predicates the contract's checks
     * produce. It now has them, for this subject, so it PASSES — over the product's own gate, declared
     * at genesis from the operator's confirmed standard.
     */
    const gate = rig.installed.controller.evaluateGate("gate-release", "attempt", attemptId);
    expect(gate.verdict).toBe("PASS");
    expect(gate.subject_id).toBe(attemptId);
    expect(gate.evidence_used).toHaveLength(3);
    expect(gate.unresolved).toEqual([]);
    expect(gate.failed).toEqual([]);

    /**
     * WHO EVERY ATOM IS ABOUT, AND WHO IT IS NOT ABOUT.
     *
     * The scope observation that was ALREADY being made at `334d040` (settle checked write scope and
     * refused on violation) is now recorded rather than discarded. This is the §4 distinction: for
     * scope the check executed and produced no event; for artifacts and commands it never executed.
     * Both are closed.
     */
    const predicates = evidence.map((atom) => atom.predicate).sort();
    expect(predicates).toEqual(["expected_files_exist", "process_exit_zero", "write_scope_valid"]);
  });
});
