/**
 * Palimpsest-CI2 §12 — THE MANDATORY LEGITIMATE DELEGATED PASS.
 *
 * THE DECISIVE QUESTION OF THIS STAGE, in one test:
 *
 *   Can Palimpsest independently evaluate the actual immutable result of a completed delegated Agent task,
 *   produce correct durable completion evidence, and allow a valid candidate — while rejecting invalid ones —
 *   to pass through the EXISTING qualification mechanism?
 *
 * WHY THIS FILE IS THE ACCEPTANCE TEST AND NOT A DEMONSTRATION.
 *
 * Every one of §12's seven separately-recorded facts is asserted here, and each has a NON-VACUITY precondition
 * that would fail if the fact were true only by construction:
 *
 *   execution completed   — the attempt row says COMPLETED, and it was not set by this test
 *   candidate exported    — the commit RESOLVES from the canonical object database, read through git plumbing
 *   contract evaluated    — the derived contract's three check kinds are asserted BEFORE the work runs
 *   evidence persisted    — the atoms are read from the `evidence` TABLE, through the Gate's own projection
 *   evidence projected    — the same rows are what the Gate's query returns
 *   Gate passed           — the PRODUCT's own release gate, declared at genesis from the operator's standard
 *   promotion status      — NOT promoted, because a local gate pass is not promotion authority
 *
 * WHAT WOULD MAKE THIS TEST FAIL, DELIBERATELY.
 *
 *   · no completion evidence                     → the length assertion fails
 *   · no check actually ran                      → the per-predicate assertions fail
 *   · the Gate never evaluated the candidate     → `subject_id` and `evidence_used` assertions fail
 *   · the candidate identity is absent           → the per-atom `result_commit` assertion fails
 *   · a test-only direct database write          → the producer assertion fails (every atom is
 *                                                  `palimpsest-delegated-settlement`, written by the product)
 *   · the normal consumer route was bypassed     → the fixture goes through `WorkDelegationService.start`
 *
 * THE HONEST BOUNDARY, STATED ONCE.
 *
 * The `RuntimeCarrierPort` and `WorkWorkerRunPort` are test-owned, exactly as the ruling permits and CI1
 * declared. A real `Activation` requires a carrier port and this repository has no production implementation.
 * This is therefore a genuine Owner-bound execution through the real Work/Consumer/Evidence/Gate stack with a
 * bounded test-owned worker adapter — NOT two real runtime subprocess Agents, and it does not claim to be.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
import type { ProjectStandard } from "../src/domain/standard.js";
import { deriveAttemptCompletionContract } from "../src/domain/completion_contract.js";
import { GateEngine } from "../src/evidence/gate_dsl.js";

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

const PROJECT = "ci2c1";
const HEAD = "c".repeat(40);
const PASSING = ["node", "-e", "process.exit(0)"];

const ARCHITECTURE: ArchitectureDefinition = materializeArchitectureDefinition({
  architectureDefinitionId: "arch-ci2c1",
  revision: 1,
  agentDefinitionIds: ["owner-ci2c1"],
});

/** All three mechanical check kinds, so the bar is non-vacuous. */
const STANDARD: ProjectStandard = Object.freeze({
  statement: "the candidate stays inside its scope, produces the declared artifact, and the check command passes",
  clauses: Object.freeze([
    Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze([...PASSING]), predicate: "process_exit_zero" as const }),
    Object.freeze({ kind: "files_exist" as const, paths: Object.freeze(["src/candidate.ts"]) }),
    Object.freeze({ kind: "scope_respected" as const }),
  ]),
  derivedFrom: Object.freeze(["ci2 acceptance fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

const TASK = {
  task_id: "task-candidate",
  objective: "produce src/candidate.ts inside the declared write scope",
  depends_on: [],
  write_paths: ["src/candidate.ts"],
  required_artifacts: ["src/candidate.ts"],
};

const CANDIDATE_CONTENT = "export const candidate = (value: readonly number[]): number[] => [...new Set(value)].sort((a, b) => a - b);\n";

function makeBaselineRepo(): { repo: string; head: string } {
  const repo = mkdtempSync(join(tmpdir(), "ci2c1-repo-"));
  cleanups.push(() => removeTree(repo));
  execFileSync("git", ["init", "-q"], { cwd: repo });
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "existing.ts"), "export const existing = 1;\n");
  writeFileSync(join(repo, "README.md"), "# baseline\n");
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "S0"], { cwd: repo });
  return { repo, head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim() };
}

function groundedState(): GroundedPlanningState {
  const base = {
    schema_version: 1 as const,
    project_id: PROJECT,
    revision: 2,
    parent_revision: 1,
    parent_digest: "p",
    goal: "a delegated candidate must qualify through the normal gate",
    requirements: [],
    decisions: [],
    tasks: [parseTaskSpec(TASK)],
    head_commit: HEAD,
    committed_at: "2026-01-01T00:00:00.000000Z",
  };
  return {
    architecture: ARCHITECTURE,
    work: { ...base, digest: projectIrDigestOf(base) } as ProjectIr,
    runConfiguration: materializeRunConfiguration(),
    observationSnapshot: materializeObservationSnapshot({
      snapshotId: "obs-ci2c1",
      ephemeralCapabilities: { runtimeFeatures: [], toolCapabilities: [] },
      persistentCandidates: [],
    }),
  };
}

function declaredCarrierPort() {
  return callbackRuntimeCarrierPort("ci2c1-carrier", {
    onRealize: async (request) => ({
      runtimeAgent: { runtimeAdapter: "ci2c1", agentId: `agent-${request.activationId}` },
      session: { runtimeAdapter: "ci2c1", sessionId: `session-${request.activationId}` },
    }),
    onRelease: async () => undefined,
  });
}

/** The bounded task: write the declared file and commit it inside the world it is handed. */
function boundedWorker(): WorkWorkerRunPort {
  return {
    adapterId: "ci2c1-bounded-worker",
    async run({ workDir }) {
      mkdirSync(join(workDir, "src"), { recursive: true });
      writeFileSync(join(workDir, "src", "candidate.ts"), CANDIDATE_CONTENT);
      execFileSync("git", ["add", "-A"], { cwd: workDir });
      execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "candidate"], { cwd: workDir });
      return { kind: "READY_FOR_SETTLEMENT" };
    },
  };
}

interface Connection {
  prepare: (sql: string) => { all: (...args: never[]) => unknown; get: (...args: never[]) => unknown };
}

describe("CI2 §12 — a legitimate delegated candidate acquires evidence and PASSES the normal Gate", () => {
  it("completes, exports, evaluates, persists, projects and passes — without being promoted", async () => {
    const baseline = makeBaselineRepo();
    const rig = mkdtempSync(join(tmpdir(), "ci2c1-rig-"));
    const installed = installPalimpsest({ tools: { register: () => () => undefined } } as never, {
      projectId: PROJECT,
      databasePath: join(rig, "p.sqlite"),
      ordariumDatabasePath: join(rig, "o.sqlite"),
      repository: baseline.repo,
      git: new GitCliPort(baseline.repo, join(baseline.repo, ".palimpsest", "worlds")),
      execution: "worktree",
      concurrency: 1,
      standard: STANDARD,
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: PASSING[0]!, argv_prefix: PASSING.slice(1) }] }),
      runtimeCarrierPort: declaredCarrierPort(),
      workWorkerPort: () => boundedWorker(),
    } as never);
    cleanups.push(() => {
      try {
        installed.dispose();
      } catch {
        /* best effort */
      }
      removeTree(rig);
    });
    const connection = installed.controller.store.connection as unknown as Connection;

    /**
     * FACT 1 — A GENUINE ACTIVATION, from the shipped realization service.
     *
     * This is what makes the execution Owner-bound rather than an anonymous job. The assertion is on the ids the
     * SERVICE allocated.
     */
    const state = groundedState();
    const plan = compileGroundedBindingPlan({
      architecture: ARCHITECTURE,
      work: state.work,
      runConfiguration: state.runConfiguration,
      observationSnapshot: state.observationSnapshot,
      resolutionId: "res-ci2c1",
    });
    expect(plan.status).toBe("planned");
    if (plan.status !== "planned") return;
    const realization = await installed.runtime!.realize!({
      architecture: ARCHITECTURE,
      runDefinition: plan.runDefinition,
      resolution: plan.resolution,
      plan: plan.plan,
      current: state,
      activationContext: "ctx-ci2c1",
    });
    expect(realization.status).toBe("realized");
    if (realization.status !== "realized") return;
    const activation = realization.realizations[0]!.activation;
    expect(activation.activationId).toBeTruthy();

    /**
     * FACT 3 (PRECONDITION) — THE CONTRACT IS NON-VACUOUS, asserted before the work starts.
     */
    const contract = deriveAttemptCompletionContract({
      standard: STANDARD,
      task: TASK,
      envelope: {
        write_paths: TASK.write_paths,
        required_artifacts: TASK.required_artifacts,
        allowed_commands: [{ executable: PASSING[0]!, argv_prefix: PASSING.slice(1) }],
      },
    });
    expect(contract.mechanical.map((check) => check.kind)).toEqual([
      "assert_write_scope",
      "run_standard_command",
      "assert_required_artifacts",
    ]);

    /** Canonical Work, declared through the product's own tool surface. */
    const startTool = installed.tools.find((entry) => entry.name === "palimpsest_start");
    expect(startTool).toBeDefined();
    if (startTool === undefined) return;
    await startTool.execute(
      { projectId: PROJECT, goal: "a delegated candidate must qualify through the normal gate", headCommit: baseline.head, tasks: [TASK] },
      { callId: "c-start", rootCallId: "r-start", name: "palimpsest_start", arguments: {}, signal: new AbortController().signal },
    );

    /**
     * THE NORMAL CONSUMER ROUTE. `WorkDelegationService.start` is the production entry a host uses; nothing here
     * calls `settleMutatingWork` directly, and no evidence is written by this test.
     */
    const service = installed.workDelegation;
    expect(service).toBeDefined();
    if (service === undefined) return;
    const started = await service.start({ expectedTaskId: TASK.task_id });
    const deadline = Date.now() + 120_000;
    let finished: Awaited<ReturnType<typeof service.followup>> | null = null;
    while (Date.now() < deadline) {
      const view = await service.followup({ jobId: started.jobId });
      if ("phase" in view && (view.phase === "FINISHED" || view.phase === "HOST_ERROR")) {
        finished = view;
        break;
      }
      await new Promise((done) => setTimeout(done, 50));
    }
    expect(finished).not.toBeNull();
    if (finished === null || !("attemptId" in finished) || typeof finished.attemptId !== "string") {
      throw new Error("CI2 C1: no settled attempt");
    }
    const attemptId: string = finished.attemptId;
    expect(finished.phase).toBe("FINISHED");

    /**
     * FACT 1 — EXECUTION COMPLETED. Read from the `attempts` table.
     */
    const attemptRow = connection
      .prepare("SELECT state, report_json FROM attempts WHERE project_id=? AND attempt_id=?")
      .get(PROJECT as never, attemptId as never) as { state: string; report_json: Uint8Array | null };
    expect(attemptRow.state).toBe("COMPLETED");
    const report = JSON.parse(new TextDecoder().decode(attemptRow.report_json!)) as Record<string, unknown>;

    /**
     * FACT 2 — THE CANDIDATE IS EXPORTED AND IMMUTABLE.
     *
     * The commit is resolved from the CANONICAL object database through git plumbing, and its content is read
     * from the blob rather than from the working tree, so this is the immutable object and not a mutable file.
     */
    const resultCommit = String(report.result_commit);
    expect(resultCommit).toMatch(/^[0-9a-f]{40}$/u);
    expect(resultCommit).not.toBe(baseline.head);
    expect(execFileSync("git", ["cat-file", "-t", resultCommit], { cwd: baseline.repo, encoding: "utf8" }).trim()).toBe("commit");
    const candidateTree = execFileSync("git", ["rev-parse", `${resultCommit}^{tree}`], { cwd: baseline.repo, encoding: "utf8" }).trim();
    const blobId = execFileSync("git", ["rev-parse", `${resultCommit}:src/candidate.ts`], { cwd: baseline.repo, encoding: "utf8" }).trim();
    /** The authored bytes are LF; the materialized checkout is CRLF under `core.autocrlf=true`, so the blob is
     *  compared against its own authored form rather than against a filesystem read. */
    const blobBytes = execFileSync("git", ["cat-file", "blob", blobId], { cwd: baseline.repo });
    expect(blobBytes.toString("utf8")).toBe(CANDIDATE_CONTENT);

    /**
     * FACT 4 — EVIDENCE PERSISTED. Read from the `evidence` table through the Gate's own projection.
     */
    const evidenceRows = connection
      .prepare("SELECT evidence_json FROM evidence WHERE project_id=? AND json_extract(evidence_json,'$.subject_id')=?")
      .all(PROJECT as never, attemptId as never) as { evidence_json: Uint8Array }[];
    const atoms = evidenceRows.map((row) => JSON.parse(new TextDecoder().decode(row.evidence_json)) as Record<string, unknown>);
    expect(atoms).toHaveLength(3);

    /** Every atom is the PRODUCT's, produced by the delegated route, and names the actual candidate. */
    for (const atom of atoms) {
      expect(atom.producer).toBe("palimpsest-delegated-settlement");
      expect(atom.subject_type).toBe("attempt");
      expect(atom.subject_id).toBe(attemptId);
      expect(atom.status).toBe("active");
      const value = atom.value as Record<string, unknown>;
      expect(value.result_commit).toBe(resultCommit);
      expect(value.candidate_tree).toBe(candidateTree);
      expect(value.base_commit).toBe(baseline.head);
    }

    /** FACT 3 — THE CONTRACT REALLY WAS EVALUATED: one atom per check kind, with real observations. */
    const byPredicate = new Map(atoms.map((atom) => [String(atom.predicate), atom]));
    expect([...byPredicate.keys()].sort()).toEqual(["expected_files_exist", "process_exit_zero", "write_scope_valid"]);

    const commandAtom = byPredicate.get("process_exit_zero")!;
    expect(commandAtom.exit_code).toBe(0);
    expect(commandAtom.command).toEqual(PASSING);
    expect(commandAtom.command).not.toBeNull();

    const scopeAtom = byPredicate.get("write_scope_valid")!;
    expect(scopeAtom.value).toMatchObject({ changed_files: ["src/candidate.ts"], write_paths: ["src/candidate.ts"], out_of_scope: [] });
    /** The observed atoms carry no command and no exit code — they are tree facts, not protocol runs. */
    expect(scopeAtom.command).toBeNull();
    expect(scopeAtom.exit_code).toBeNull();

    const artifactAtom = byPredicate.get("expected_files_exist")!;
    expect(artifactAtom.value).toMatchObject({ paths: ["src/candidate.ts"], missing: [], evaluated_in: "attempt-world" });

    /**
     * FACT 5 — THE EVIDENCE IS PROJECTED, i.e. the Gate's own query returns exactly these rows.
     */
    const engine = new GateEngine();
    const gate = engine.evaluate(installed.controller.store, PROJECT, "attempt", attemptId, "gate-release");
    expect(gate.verdict).toBe("PASS");
    expect(gate.subject_id).toBe(attemptId);
    expect(gate.evidence_used).toHaveLength(3);
    expect([...gate.evidence_used].sort()).toEqual([...atoms.map((atom) => String(atom.evidence_id))].sort());
    expect(gate.failed).toEqual([]);
    expect(gate.unresolved).toEqual([]);
    expect(gate.next_evidence_needed).toEqual([]);

    /**
     * AND THE GATE IS THE PRODUCT'S OWN, not one this test invented to be satisfiable: it was declared at
     * genesis from the confirmed standard (`controller.ts:1241-1253`), and its clauses are the standard's.
     */
    const declared = engine.get(installed.controller.store, PROJECT, "gate-release");
    expect(declared).toBeDefined();
    expect(declared?.subject_type).toBe("attempt");

    /**
     * FACT 7 — PROMOTION STATUS: NOT PROMOTED.
     *
     * A local Gate PASS is not promotion authority (§12). Nothing promoted this attempt, and the attempt is
     * COMPLETED rather than VERIFYING/SATISFIED — the promotion ladder was never entered.
     */
    const after = connection
      .prepare("SELECT state FROM attempts WHERE project_id=? AND attempt_id=?")
      .get(PROJECT as never, attemptId as never) as { state: string };
    expect(after.state).toBe("COMPLETED");
    const promotions = connection
      .prepare("SELECT COUNT(*) AS n FROM events WHERE project_id=? AND event_type LIKE 'PROMOTION%'")
      .get(PROJECT as never) as { n: number };
    expect(Number(promotions.n)).toBe(0);
    /** And the canonical repository is still at the base: the candidate has not become the project's head. */
    expect(execFileSync("git", ["rev-parse", "HEAD"], { cwd: baseline.repo, encoding: "utf8" }).trim()).toBe(baseline.head);

    /**
     * FACT 6 — THE CANDIDATE IDENTITY IS BOUND, NOT MERELY PRESENT.
     *
     * A gate clause scoped to a DIFFERENT candidate does not match these atoms, and the same clause scoped to
     * THIS candidate does. That is the subject precision §8 asks for, exercised through the existing grammar.
     */
    installed.controller.declareGate(
      {
        gate_id: "gate-other-candidate",
        version: 1,
        subject_type: "attempt",
        require: { mode: "all", chain: [{ exists: { predicate: "write_scope_valid", where: { result_commit: "f".repeat(40) } } }] },
      },
      "ci2-c1-acceptance",
    );
    const wrong = engine.evaluate(installed.controller.store, PROJECT, "attempt", attemptId, "gate-other-candidate");
    expect(wrong.verdict).toBe("INCOMPLETE");

    installed.controller.declareGate(
      {
        gate_id: "gate-this-candidate",
        version: 1,
        subject_type: "attempt",
        require: {
          mode: "all",
          chain: [
            { exists: { predicate: "write_scope_valid", where: { result_commit: resultCommit } } },
            { exists: { predicate: "process_exit_zero", where: { result_commit: resultCommit } } },
            { exists: { predicate: "expected_files_exist", where: { result_commit: resultCommit } } },
          ],
        },
      },
      "ci2-c1-acceptance",
    );
    const right = engine.evaluate(installed.controller.store, PROJECT, "attempt", attemptId, "gate-this-candidate");
    expect(right.verdict).toBe("PASS");
  });
});
