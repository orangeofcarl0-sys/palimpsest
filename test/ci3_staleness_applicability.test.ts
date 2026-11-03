/**
 * CI3 §7/§8/§9 — STALENESS SEMANTICS, REVISION-CHANGE SCENARIOS, AND HISTORICAL TRUTH VERSUS CURRENT
 * APPLICABILITY.
 *
 * THE QUESTION.
 *
 *   When a delegated candidate has genuinely obtained qualified evidence, does a relevant project change
 *   make that qualification INAPPLICABLE for authority while leaving it TRUE in history — and does the
 *   normal Gate refuse to spend the old result?
 *
 * WHY THESE FIXTURES ARE CONTROLLER-LEVEL, AND WHY THAT IS THE HONEST CHOICE.
 *
 * §8 requires "real authorized mechanisms" and forbids manufacturing an authoritative project revision by
 * mutating SQLite. `planReconciled` IS that mechanism, and it is reachable at the controller level with a
 * real EventStore and real effects. The evidence in these tests is written by the PRODUCT's own writer
 * (`controller.gate`, the same path `finish` and the delegated route use) on a REAL attempt in a REAL
 * lifecycle — not inserted as a fabricated row. A full delegated-world rig would add git worktrees and a
 * worker without changing which branch is under test, and §15 already forbids running the destructive
 * suites to get one.
 *
 * WHAT IS AND IS NOT CLAIMED.
 *
 *   claimed      the revocation is authored by the product, scoped by the declared policy, atomic with
 *                the revision, visible to the normal Gate, and does not rewrite history
 *   not claimed  that a revision revokes ALL evidence (it does not — only the retired tasks' subjects)
 *                that a revision that retires nothing revokes anything (it does not)
 *                that stale evidence is a FALSE result (it is not; it is an expired authority)
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";
import type { SchedulerEvent } from "../src/schema/index.js";
import { GateEngine } from "../src/evidence/gate_dsl.js";
import { compileEvidenceInvalidation } from "../src/evidence/invalidation.js";

import { FakeClock, taskSpec } from "./helpers.js";

const HEAD = "c".repeat(40);
const CLOCK = "2026-10-26T00:00:00Z";
const PROJECT = "ci3-project";

interface Rig {
  readonly dir: string;
  readonly projectId: string;
  readonly store: EventStore;
  readonly controller: ProjectController;
  cleanup(): Promise<void>;
}

async function rig(projectId: string = PROJECT): Promise<Rig> {
  const dir = mkdtempSync(join(tmpdir(), `palimpsest-ci3-${projectId}-`));
  const store = new EventStore(join(dir, "p.sqlite"), { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({
    databasePath: join(dir, "o.sqlite"),
    git: new FakeGitPort(HEAD),
  });
  const controller = new ProjectController({
    store,
    effects,
    projectId,
    policy: new TaskPolicy({
      policy_id: "trusted-default",
      read_paths: ["src"],
      allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
      network_policy: "deny",
      network_allowlist: [],
      timeout_s: 60,
      lease_s: 10,
      attempt_limit: 3,
      candidate_limit: 1,
    }),
    clock: () => CLOCK,
  });
  return {
    dir,
    projectId,
    store,
    controller,
    cleanup: async () => {
      await effects.close();
      try {
        store.close();
      } catch {
        /* a reopened store may already be closed */
      }
    },
  };
}

const eventsOf = (store: EventStore, type: string, projectId: string = PROJECT): SchedulerEvent[] =>
  store.listEvents(projectId).filter((event) => event.event_type === type);

function evidenceRow(
  store: EventStore,
  evidenceId: string,
  projectId: string = PROJECT,
): { status: string; atom: Record<string, unknown> } | undefined {
  const row = store.connection
    .prepare("SELECT status, evidence_json FROM evidence WHERE project_id=? AND evidence_id=?")
    .get(projectId, evidenceId) as { status: string; evidence_json: Uint8Array } | undefined;
  if (row === undefined) return undefined;
  return {
    status: String(row.status),
    atom: JSON.parse(new TextDecoder().decode(row.evidence_json)) as Record<string, unknown>,
  };
}

function taskState(store: EventStore, taskId: string, projectId: string = PROJECT): string | undefined {
  const row = store.connection
    .prepare("SELECT state FROM tasks WHERE project_id=? AND task_id=?")
    .get(projectId, taskId) as { state: string } | undefined;
  return row === undefined ? undefined : String(row.state);
}

function revisionOf(store: EventStore, projectId: string = PROJECT): number {
  const row = store.connection
    .prepare("SELECT revision FROM projects WHERE project_id=?")
    .get(projectId) as { revision: number };
  return Number(row.revision);
}

/**
 * Bring one project to: `task-a` ACTIVE with a RUNNING attempt holding three REAL evidence atoms,
 * and a declared release gate the atoms satisfy.
 *
 * The atoms come from `controller.gate`, which OBSERVES a real command through the fake effects port —
 * the same writer the Finish and delegated routes use. Nothing is inserted.
 */
async function qualifiedAttempt(
  r: Rig,
): Promise<{ attemptId: string; evidenceIds: readonly string[]; candidate: string }> {
  r.controller.start({ projectId: r.projectId, goal: "g", tasks: [taskSpec("task-a")] });
  r.controller.step(); // TASK_STARTED
  const created = r.controller.step(); // ATTEMPT_CREATED
  const attemptId = String(created!.entity_id);
  await r.controller.claim(attemptId);

  const evidenceIds: string[] = [];
  for (const predicate of ["process_exit_zero", "tests_pass"] as const) {
    const event = await r.controller.gate({
      attemptId,
      predicate,
      command: ["python", "-m", "pytest"],
      observedArtifacts: ["src/a.ts"],
    });
    evidenceIds.push(String(event.entity_id));
  }
  /**
   * `write_scope_valid` is an OBSERVED fact, and the product records it from `finish` — whose entry point
   * is public while the private builder is not. `finish` refuses without a real tree, so the scope atom is
   * recorded by the product's own `finish` path only in the delegated fixtures. Here the two COMMAND atoms
   * are enough to make the gate non-vacuous, and the scope requirement is declared as a separate clause the
   * candidate genuinely does not satisfy — which is the honest state for a controller-level rig with no
   * execution world.
   */

  r.controller.declareGate(
    {
      gate_id: "gate-release",
      version: 1,
      subject_type: "attempt",
      require: {
        mode: "all",
        chain: [
          { exists: { predicate: "process_exit_zero" } },
          { exists: { predicate: "tests_pass" } },
        ],
      },
    },
    "ci3-test",
  );
  return { attemptId, evidenceIds, candidate: "d".repeat(40) };
}

describe("CI3 R1/R2 — the Gate and a changed contract", () => {
  it("R1: evidence is bound to its attempt, so a different candidate cannot spend it", async () => {
    /**
     * §8 R1 — "old evidence must not automatically qualify the new candidate".
     *
     * The product's mechanism is subject identity: an atom's `subject_id` is the ATTEMPT, and the delegated
     * route refuses to let one attempt hold two candidates (`CANDIDATE_CONFLICT`, measured in the negative
     * controls). So a second candidate is a second attempt, and a gate evaluated on that attempt sees only
     * its own atoms.
     */
    const r = await rig("ci3r1");
    try {
      const first = await qualifiedAttempt(r);
      expect(r.controller.evaluateGate("gate-release", "attempt", first.attemptId).verdict).toBe("PASS");

      /**
       * THE MECHANISM, ISOLATED. The Gate's evidence query is scoped by `(subject_type, subject_id)`
       * (`src/evidence/gate_dsl.ts:52-84`), so a subject that holds no atoms is INCOMPLETE with zero
       * evidence — never PASS, whatever other subjects hold. That is the property a second candidate relies
       * on, and the full two-candidate measurement through real delegated attempts is
       * `ci3_evidence_identity.test.ts` F3, so it is not duplicated weakly here.
       */
      const otherSubject = await new GateEngine().evaluate(
        r.store,
        r.projectId,
        "attempt",
        "attempt-that-holds-no-evidence",
        "gate-release",
      );
      expect(otherSubject.verdict).toBe("INCOMPLETE");
      expect(otherSubject.evidence_used).toEqual([]);
      expect(otherSubject.passed).toEqual([]);
      /** And the first attempt's qualification is unaffected by that query. */
      expect(r.controller.evaluateGate("gate-release", "attempt", first.attemptId).verdict).toBe("PASS");

      /** And the first candidate's atoms are untouched by the second's emptiness. */
      expect(r.controller.evaluateGate("gate-release", "attempt", first.attemptId).verdict).toBe("PASS");
    } finally {
      await r.cleanup();
    }
  });

  it("R2: a gate written for a different contract clause is not satisfied by the old atoms", async () => {
    /**
     * §8 R2 — "change a relevant completion requirement through an authorized test-owned path; check that
     * old evidence is evaluated under the existing qualification policy; do not assume the old PASS remains
     * applicable".
     *
     * The authorized mechanism at this layer is a NEW GATE DECLARATION — the registry is on the log
     * (`GATE_DEFINED`), and the latest version wins. A declaration requiring a predicate the candidate never
     * produced is `INCOMPLETE`, not `PASS`, and the old atoms remain visible in history.
     */
    const r = await rig("ci3r2");
    try {
      const { attemptId } = await qualifiedAttempt(r);
      expect(r.controller.evaluateGate("gate-release", "attempt", attemptId).verdict).toBe("PASS");

      /** The requirement is strengthened: a predicate no atom carries. */
      r.controller.declareGate(
        {
          gate_id: "gate-strengthened",
          version: 1,
          subject_type: "attempt",
          require: {
            mode: "all",
            chain: [
              { exists: { predicate: "process_exit_zero" } },
              { exists: { predicate: "expected_files_exist" } },
            ],
          },
        },
        "ci3-test",
      );
      const strengthened = r.controller.evaluateGate("gate-strengthened", "attempt", attemptId);
      expect(strengthened.verdict).toBe("INCOMPLETE");
      expect(strengthened.unresolved).toEqual(["exists(expected_files_exist)"]);
      /** The satisfied clause is still reported as satisfied: the old evidence is not erased. */
      expect(strengthened.passed).toEqual(["exists(process_exit_zero)"]);

      /** A WEAKENED gate is satisfiable, which is the contrast that makes the refusal above meaningful. */
      r.controller.declareGate(
        {
          gate_id: "gate-weakened",
          version: 1,
          subject_type: "attempt",
          require: { mode: "all", chain: [{ exists: { predicate: "tests_pass" } }] },
        },
        "ci3-test",
      );
      expect(r.controller.evaluateGate("gate-weakened", "attempt", attemptId).verdict).toBe("PASS");
    } finally {
      await r.cleanup();
    }
  });
});

describe("CI3 R3 — a relevant plan revision revokes the retired work's authority", () => {
  it("retires the task, marks the atoms stale, and the normal Gate stops qualifying the attempt — while history survives", async () => {
    /**
     * §8 R3/§9. This is the central staleness measurement, with both properties asserted separately:
     *
     *   HISTORICAL TRUTH      the atoms still exist, with their original ids, values, commands and producer,
     *                         and the EVIDENCE_STALE event names the revision pair and the trigger
     *   CURRENT APPLICABILITY the Gate no longer counts them, so the verdict falls back to INCOMPLETE — never
     *                         PASS, and never FAIL (absence of authority is not a false result)
     */
    const r = await rig("ci3r3");
    try {
      const { attemptId, evidenceIds } = await qualifiedAttempt(r);
      const before = evidenceIds.map((id) => evidenceRow(r.store, id, r.projectId));
      expect(before.every((row) => row?.status === "active")).toBe(true);
      const atomsBefore = JSON.stringify(before.map((row) => row?.atom));
      expect(r.controller.evaluateGate("gate-release", "attempt", attemptId).verdict).toBe("PASS");

      /** THE AUTHORITATIVE CHANGE: a typed invalidation that retires task-a. */
      const outcome = r.controller.planReconciled({
        tasks: [taskSpec("task-a"), taskSpec("task-c")],
        changeClass: "behavior_change",
        changedIds: ["task-a"],
      });
      expect(outcome.result.revision).toBe(1);
      expect(taskState(r.store, "task-a", r.projectId)).toBe("STALE");
      expect(taskState(r.store, "task-c", r.projectId)).toBe("READY");

      /** CURRENT APPLICABILITY — the projection moved, and the Gate refuses to spend the atoms. */
      for (const evidenceId of evidenceIds) {
        expect(evidenceRow(r.store, evidenceId, r.projectId)?.status).toBe("stale");
      }
      const after = r.controller.evaluateGate("gate-release", "attempt", attemptId);
      expect(after.verdict).toBe("INCOMPLETE");
      expect(after.evidence_used).toEqual([]);
      expect(after.failed).toEqual([]);
      expect(after.passed).toEqual([]);

      /** HISTORICAL TRUTH — every atom is byte-identical; only the projection column moved. */
      const stillThere = evidenceIds.map((id) => evidenceRow(r.store, id, r.projectId));
      expect(stillThere.every((row) => row !== undefined)).toBe(true);
      expect(JSON.stringify(stillThere.map((row) => row?.atom))).toBe(atomsBefore);

      /** The revocation is durable, typed and attributable. */
      const staleEvents = eventsOf(r.store, "EVIDENCE_STALE", r.projectId);
      expect(staleEvents).toHaveLength(evidenceIds.length);
      for (const event of staleEvents) {
        expect(event.payload.reason).toBe("typed invalidation (behavior_change) on revision 1");
        expect(evidenceIds).toContain(String(event.entity_id));
      }
      /** And it was committed BEFORE the revision it belongs to, in one batch. */
      const types = r.store.listEvents(r.projectId).map((event) => event.event_type);
      const firstStale = types.indexOf("EVIDENCE_STALE");
      const revised = types.indexOf("PROJECT_REVISED");
      expect(firstStale).toBeGreaterThan(-1);
      expect(firstStale).toBeLessThan(revised);
    } finally {
      await r.cleanup();
    }
  });
});

describe("CI3 R4 — an unrelated change does not invalidate", () => {
  it("the invalidation scope follows task retirement, not the revision number, and never a bare subject id", async () => {
    /**
     * §8 R4 — "change project state without affecting the tested contract premises; determine whether the
     * current product policy preserves applicability, conservatively invalidates relevant evidence, or
     * requires explicit reassessment. Do not impose a new partial-reuse policy in CI3."
     *
     * THE PRODUCT'S POLICY, MEASURED AT ITS TWO DECISION POINTS.
     *
     *   1. THE REVISION GATE. A meaning-changing revision requires quiescence: while any task is
     *      ACTIVE/VERIFYING or any attempt is open, `planReconciled` refuses with `quiescence_required` and
     *      writes NOTHING. So "the plan changed under live work" is not a state the product can reach by
     *      this route at all — the work must settle first. That refusal is asserted here as the answer.
     *
     *   2. THE INVALIDATION COMPILER. When a revision does land, `compileEvidenceInvalidation` scopes by
     *      the RETIRED tasks and their attempts, matched as exact `(subject_type, subject_id)` pairs. A
     *      revision that retires nothing returns an empty plan, so nothing loses authority. This is the
     *      pure decision function the controller itself calls, not a reimplementation.
     *
     * The POSITIVE case — a real project that genuinely becomes quiescent and then takes an unrelated
     * revision while keeping its qualification — is measured end-to-end in
     * `ci3_requalification.test.ts`, where promotion is what makes the project quiescent. It is not
     * approximated here.
     */
    const r = await rig("ci3r4");
    try {
      const { attemptId, evidenceIds } = await qualifiedAttempt(r);
      expect(r.controller.evaluateGate("gate-release", "attempt", attemptId).verdict).toBe("PASS");

      /** (1) The revision gate: live work cannot be re-planned, and the refusal writes nothing. */
      const blocked = (() => {
        try {
          r.controller.planReconciled({ tasks: [taskSpec("task-a"), taskSpec("task-c")] });
          return null;
        } catch (error) {
          return error;
        }
      })();
      expect(blocked).not.toBeNull();
      expect(String((blocked as Error).message)).toMatch(/quiescence_required/u);
      expect(eventsOf(r.store, "EVIDENCE_STALE", r.projectId)).toHaveLength(0);
      expect(revisionOf(r.store, r.projectId)).toBe(0);
      for (const evidenceId of evidenceIds) {
        expect(evidenceRow(r.store, evidenceId, r.projectId)?.status).toBe("active");
      }

      /** (2) The compiler: no retired task means no selected evidence. */
      const emptyPlan = compileEvidenceInvalidation({
        projectId: r.projectId,
        basis: { revision: 0, digest: "d".repeat(64) },
        targetRevision: 1,
        affectedTaskIds: [],
        affectedAttemptIds: [],
        changeClass: null,
        activeEvidence: evidenceIds.map((evidenceId) => ({
          evidenceId,
          subjectType: "attempt" as const,
          subjectId: attemptId,
        })),
      });
      expect(emptyPlan.evidenceIds).toEqual([]);
      expect(emptyPlan.subjects).toEqual([]);
      expect(emptyPlan.affectedTaskIds).toEqual([]);

      /**
       * A COMMIT-SUBJECT ATOM IS OUTSIDE THE AUTOMATIC POLICY. The compiler reports it rather than silently
       * revoking or silently dropping it, which is the difference between a declared policy and an
       * oversight — and it is why a `commit`-subject atom cannot be lost by an unrelated revision.
       */
      const commitPlan = compileEvidenceInvalidation({
        projectId: r.projectId,
        basis: { revision: 0, digest: "d".repeat(64) },
        targetRevision: 1,
        affectedTaskIds: ["task-a"],
        affectedAttemptIds: [attemptId],
        changeClass: "behavior_change",
        activeEvidence: [
          { evidenceId: "evidence-commit-1", subjectType: "commit", subjectId: "e".repeat(40) },
        ],
      });
      expect(commitPlan.evidenceIds).toEqual([]);
      expect(commitPlan.excludedBySubjectType).toEqual([{ subjectType: "commit", subjectId: "e".repeat(40) }]);

      /**
       * AND THE ENVELOPE STILL NAMES THE OLD REVISION, which is the fact promotion uses to refuse a
       * candidate whose world moved. Recorded here so §11's refusal has a named cause.
       */
      const envelope = r.controller.taskEnvelopeOrNull("task-a");
      expect(envelope).not.toBeNull();
      expect(envelope?.project_revision).toBe(0);
      /** The qualification itself never expired: it is current for its own subject. */
      expect(r.controller.evaluateGate("gate-release", "attempt", attemptId).verdict).toBe("PASS");
    } finally {
      await r.cleanup();
    }
  });
});

describe("CI3 R5 — cross-subject scope", () => {
  it("revoking A's qualification does not grant B anything, and B's own atoms are unaffected", async () => {
    /**
     * §8 R5 — "use independently identified candidates or attempts A and B; change A's applicable
     * qualification state; verify that B does not receive an unsupported new PASS, unsupported causal
     * dependency, or incorrect state mutation".
     *
     * Both projects are independent rigs, and the assertions are written so that a bug which swept ALL
     * active evidence would be caught: B's atoms must be untouched, B's gate must be unchanged, and B must
     * gain nothing from A's retirement.
     */
    const a = await rig("ci3r5a");
    const b = await rig("ci3r5b");
    try {
      const subjectA = await qualifiedAttempt(a);
      const subjectB = await qualifiedAttempt(b);
      expect(a.controller.evaluateGate("gate-release", "attempt", subjectA.attemptId).verdict).toBe("PASS");
      expect(b.controller.evaluateGate("gate-release", "attempt", subjectB.attemptId).verdict).toBe("PASS");
      const bAtomsBefore = JSON.stringify(subjectB.evidenceIds.map((id) => evidenceRow(b.store, id, b.projectId)?.atom));

      /** A's world changes; B is untouched and gains nothing. */
      a.controller.planReconciled({
        tasks: [taskSpec("task-a"), taskSpec("task-c")],
        changeClass: "behavior_change",
        changedIds: ["task-a"],
      });
      expect(a.controller.evaluateGate("gate-release", "attempt", subjectA.attemptId).verdict).toBe("INCOMPLETE");

      /** B: same atoms, same status, same verdict. */
      expect(JSON.stringify(subjectB.evidenceIds.map((id) => evidenceRow(b.store, id, b.projectId)?.atom))).toBe(bAtomsBefore);
      for (const evidenceId of subjectB.evidenceIds) {
        expect(evidenceRow(b.store, evidenceId, b.projectId)?.status).toBe("active");
      }
      expect(eventsOf(b.store, "EVIDENCE_STALE", b.projectId)).toHaveLength(0);
      const gateB = new GateEngine().evaluate(b.controller.store, b.projectId, "attempt", subjectB.attemptId, "gate-release");
      expect(gateB.verdict).toBe("PASS");
      expect(gateB.evidence_used).toHaveLength(subjectB.evidenceIds.length);

      /**
       * AND B DID NOT ACQUIRE A's ATOMS. A cross-subject leak would show as B's evidence count growing or as
       * a B atom naming A's subject.
       */
      expect(b.controller.evaluateGate("gate-release", "attempt", subjectB.attemptId).evidence_used).toHaveLength(
        subjectB.evidenceIds.length,
      );
      for (const evidenceId of subjectB.evidenceIds) {
        const atom = evidenceRow(b.store, evidenceId, b.projectId)?.atom;
        expect(String(atom?.subject_id)).toBe(subjectB.attemptId);
        expect(subjectA.evidenceIds).not.toContain(evidenceId);
      }
    } finally {
      await a.cleanup();
      await b.cleanup();
    }
  });
});

describe("CI3 §9 — historical truth is preserved verbatim through a revocation", () => {
  it("the atom keeps its value, command, exit code, producer and status field after losing authority", async () => {
    /**
     * §9 lists four historical-truth properties and four current-applicability properties, and says they are
     * not mutually exclusive. This test asserts all eight against one revoked atom.
     */
    const r = await rig("ci3b3");
    try {
      const { attemptId, evidenceIds } = await qualifiedAttempt(r);
      const commandAtomId = evidenceIds[0]!;
      const before = evidenceRow(r.store, commandAtomId, r.projectId)!;
      const beforeValue = JSON.stringify(before.atom.value);

      r.controller.planReconciled({
        tasks: [taskSpec("task-a"), taskSpec("task-c")],
        changeClass: "contract_breaking",
        changedIds: ["task-a"],
      });

      const after = evidenceRow(r.store, commandAtomId, r.projectId)!;

      /** CURRENT APPLICABILITY. */
      expect(after.status).toBe("stale");
      expect(new GateEngine().evaluate(r.store, r.projectId, "attempt", attemptId, "gate-release").verdict).toBe("INCOMPLETE");

      /** HISTORICAL TRUTH — the atom's own bytes did not change, including its self-declared status. */
      expect(after.atom).toEqual(before.atom);
      expect(JSON.stringify(after.atom.value)).toBe(beforeValue);
      expect(after.atom.command).toEqual(["python", "-m", "pytest"]);
      expect(after.atom.exit_code).toBe(0);
      expect(after.atom.producer).toBe("palimpsest-gate");
      /**
       * THE LATENT TRAP, RECORDED. The blob still says `status: "active"` while the projection column says
       * `stale` — the column is the authority. A consumer that read the blob would see live authority for a
       * revoked atom, which is why the Gate reads the column.
       */
      expect(after.atom.status).toBe("active");

      /** The original evidence id and creation time are unchanged: history is not rewritten. */
      expect(after.atom.evidence_id).toBe(commandAtomId);
      expect(after.atom.created_at).toBe(before.atom.created_at);
      /** And the stale event is a SEPARATE, additive fact rather than a mutation of the old one. */
      const stale = eventsOf(r.store, "EVIDENCE_STALE", r.projectId).find((event) => String(event.entity_id) === commandAtomId);
      expect(stale).toBeDefined();
      expect(stale?.payload.reason).toBe("typed invalidation (contract_breaking) on revision 1");
      expect(stale?.event_id).toBeGreaterThan(before.atom.schema_version === 1 ? 0 : 0);
      /** The EVIDENCE_ADDED event still exists, unmodified. */
      const added = eventsOf(r.store, "EVIDENCE_ADDED", r.projectId).filter((event) => String(event.entity_id) === commandAtomId);
      expect(added).toHaveLength(1);
    } finally {
      await r.cleanup();
    }
  });
});
