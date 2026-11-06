/**
 * PLMP-LEAN-1 §D5-b1 / SR-2 §九 — the WORK READ MODEL: the ONE owner of the Work projection reads.
 *
 *     same semantic question  ⇒  one reader
 *
 * SR-2 measured the alternative. The Work projections (`projects`, `tasks`, `attempts`) were being
 * read by the controller, by the continuation composition, by the scheduler, by the promotion
 * eligibility reader and by the graph projector — each with its own SQL, each with its own
 * decoding, and each free to drift on questions like "what is this attempt's authorization?" or
 * "which batch is this task in?". D5-b1 exists because one of those readings DID drift: the
 * attempt's authorization was read from the task's CURRENT envelope, which is a different fact
 * from the envelope that authorized the attempt when it ran.
 *
 * This module answers the Work questions. It produces NO transitions and writes nothing: the
 * aggregate, the scheduler and the event store still own every state change, and the read model
 * never becomes a second place where a state machine lives.
 *
 *     same semantic question ⇒ one reader        (not: all SQL ⇒ one repository class)
 *
 * So this is deliberately NOT a repository for every query in the codebase. It owns the reads SR-2
 * §九 names — project, task, attempt, current batch, envelope, attempt authorization, open attempt —
 * and nothing else. A reader whose SEMANTICS differ (the promotion-eligibility replay reader, which
 * must observe the log at a point in time) stays where it is: folding it in would trade a real
 * replay guarantee for a tidier import graph.
 *
 * Layer: L2 (`src/work/`). Consumed by the controller, the composition, and anything else that
 * needs a Work fact.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import type { DatabaseSync } from "node:sqlite";

import type { WorkAttemptExecution, WorkDirectOutcome } from "../domain/work_state.js";
import { canonicalWorktreeChanges } from "./unseen_inputs.js";

import { DomainValidationError } from "../domain/errors.js";
import { actionKey, stableEntityId } from "../domain/idempotency.js";
import { computeInvalidationSet, type ChangeClass, type DependencyEdge } from "../evidence/invalidation.js";
import { parseNewEvent, parseProjectIr, parseTaskEnvelope, type NewEvent, type ProjectIr, type TaskEnvelope } from "../schema/index.js";
import {
  authorizationEventsFrom,
  resolveAttemptAuthorization,
  type AttemptAuthorization,
} from "../state/attempt_authorization.js";
import { ATTEMPT_OPEN_STATES } from "../domain/state_machine.js";
import type { EventStore } from "../state/index.js";

/** One task row, as the projection stores it. */
export interface WorkTaskRow {
  readonly taskId: string;
  readonly state: string;
  readonly lastEventId: number;
  /** The batch the task currently belongs to, from its own projected state. */
  readonly batchActivationEventId: number | null;
  /** The envelope the task CURRENTLY carries. Null when it carries none. */
  readonly envelopeId: string | null;
}

/** One attempt row, as the projection stores it. */
export interface WorkAttemptRow {
  readonly attemptId: string;
  readonly taskId: string;
  readonly state: string;
  readonly batchActivationEventId: number | null;
}

/** One attempt holding the mutating lane. */
export interface WorkOpenAttempt {
  readonly attemptId: string;
  readonly taskId: string;
  readonly state: string;
}

export interface WorkReadModel {
  /** The canonical ProjectIR. Throws when the project does not exist — a caller asked for it. */
  project(): ProjectIr;
  /** The canonical ProjectIR, or null when there is no such project. */
  projectOrNull(): ProjectIr | null;
  /** One task row, or null when this project has no such task. */
  task(taskId: string): WorkTaskRow | null;
  /** One attempt row, or null. */
  attempt(attemptId: string): WorkAttemptRow | null;
  /**
   * The envelope the task CURRENTLY carries, or null.
   *
   * `CurrentTaskEnvelope` — explicitly NOT the attempt's authorization. The two agree until a
   * rework rebinds the task, and then they are different facts (§D5-b1).
   */
  taskEnvelope(taskId: string): TaskEnvelope | null;
  /**
   * The envelope that authorized an ATTEMPT when it ran — resolved from the Event Log.
   *
   * `AttemptAuthorization(A0)` stays `E0` forever, however many times the task is reauthorized.
   * Fails closed rather than substituting today's authority.
   */
  attemptAuthorization(attemptId: string): AttemptAuthorization;
  /** Every attempt still holding the mutating lane (CREATED/LEASED/RUNNING). */
  openAttempts(): readonly WorkOpenAttempt[];
  /**
   * Every task's state, in the projection's own order — the quiescence input.
   *
   * A READ the head service and the record-set projections both need; it was being re-derived by
   * each consumer, which is the duplication §九 exists to remove.
   */
  taskStates(): readonly { readonly taskId: string; readonly state: string }[];
  /** Every attempt row, for the projections that report history rather than occupancy. */
  allAttempts(): readonly WorkAttemptRow[];
  /** The nonterminal attempt for one task, when exactly one exists. */
  openAttemptFor(taskId: string): WorkOpenAttempt | null;
}

/** The `envelope_json` column is read HERE and nowhere else in this layer (G10-W firewall). */
function envelopeIdOf(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  try {
    return parseTaskEnvelope(decodeJsonBlob(raw)).envelope_id;
  } catch {
    return null;
  }
}

function batchAnchorOf(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  try {
    const parsed = decodeJsonBlob(raw) as { batch_activation_event_id?: unknown };
    const value = parsed.batch_activation_event_id;
    return value === null || value === undefined ? null : Number(value);
  } catch {
    return null;
  }
}

function decodeJsonBlob(raw: unknown): Record<string, unknown> {
  if (!(raw instanceof Uint8Array)) {
    throw new DomainValidationError("projection JSON must be stored as BLOB bytes");
  }
  const value: unknown = JSON.parse(new TextDecoder().decode(raw));
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DomainValidationError("projection JSON must be an object");
  }
  return value as Record<string, unknown>;
}

export function makeWorkReadModel(input: {
  readonly connection: DatabaseSync;
  readonly projectId: string;
  /** The log, for the ONE read that is genuinely historical: attempt authorization. */
  readonly store: Pick<EventStore, "listEvents">;
}): WorkReadModel {
  const { connection, projectId } = input;

  const projectOrNull = (): ProjectIr | null => {
    const row = connection
      .prepare("SELECT state_json FROM projects WHERE project_id=?")
      .get(projectId) as { state_json: Uint8Array } | undefined;
    return row === undefined ? null : parseProjectIr(decodeJsonBlob(row.state_json));
  };

  const task = (taskId: string): WorkTaskRow | null => {
    const row = connection
      .prepare("SELECT state, state_json, last_event_id, envelope_json FROM tasks WHERE project_id=? AND task_id=?")
      .get(projectId, taskId) as
      | { state: unknown; state_json: Uint8Array; last_event_id: unknown; envelope_json: unknown }
      | undefined;
    if (row === undefined) return null;
    return Object.freeze({
      taskId,
      state: String(row.state),
      lastEventId: Number(row.last_event_id),
      batchActivationEventId: batchAnchorOf(row.state_json),
      envelopeId: envelopeIdOf(row.envelope_json),
    });
  };

  const attempt = (attemptId: string): WorkAttemptRow | null => {
    const row = connection
      .prepare("SELECT task_id, state, state_json FROM attempts WHERE project_id=? AND attempt_id=?")
      .get(projectId, attemptId) as
      | { task_id: unknown; state: unknown; state_json: Uint8Array }
      | undefined;
    if (row === undefined) return null;
    return Object.freeze({
      attemptId,
      taskId: String(row.task_id ?? ""),
      state: String(row.state),
      batchActivationEventId: batchAnchorOf(row.state_json),
    });
  };

  const openAttempts = (): readonly WorkOpenAttempt[] => {
    /**
     * An attempt on a RETIRED task is not an open work position. A typed plan revision can stale a
     * task while its attempt row is still CREATED/LEASED/RUNNING; the task is the authority on
     * whether that position still exists. Counting the orphan would hold the in-place single-running
     * lane forever and make every later plan revision fail its quiescence check. The attempt row is
     * preserved as history; this reader reports only positions the task graph still owns.
     */
    const taskStates = new Map(
      (
        connection
          .prepare("SELECT task_id, state FROM tasks WHERE project_id=?")
          .all(projectId) as unknown as readonly { task_id: unknown; state: unknown }[]
      ).map((row) => [String(row.task_id), String(row.state)]),
    );
    const terminalTaskStates = new Set(["STALE", "FAILED", "SATISFIED"]);
    const rows = connection
      .prepare("SELECT attempt_id, task_id, state FROM attempts WHERE project_id=? ORDER BY attempt_id")
      .all(projectId) as unknown as readonly { attempt_id: unknown; task_id: unknown; state: unknown }[];
    return Object.freeze(
      rows
        .filter((row) => {
          const taskId = String(row.task_id ?? "");
          return ATTEMPT_OPEN_STATES.has(String(row.state)) && !terminalTaskStates.has(taskStates.get(taskId) ?? "");
        })
        .map((row) =>
          Object.freeze({
            attemptId: String(row.attempt_id),
            taskId: String(row.task_id ?? ""),
            state: String(row.state),
          }),
        ),
    );
  };

  return Object.freeze({
    project(): ProjectIr {
      const value = projectOrNull();
      if (value === null) throw new DomainValidationError("project does not exist");
      return value;
    },
    projectOrNull,
    task,
    attempt,
    taskEnvelope(taskId: string): TaskEnvelope | null {
      const row = connection
        .prepare("SELECT envelope_json FROM tasks WHERE project_id=? AND task_id=?")
        .get(projectId, taskId) as { envelope_json: unknown } | undefined;
      if (row === undefined) return null;
      const raw = row.envelope_json;
      if (raw === null || raw === undefined) return null;
      try {
        return parseTaskEnvelope(decodeJsonBlob(raw));
      } catch {
        // An unreadable envelope is the CALLER's verdict to make, and the controller turns it into
        // a typed refusal. This reader reports what it can establish rather than throwing here.
        return null;
      }
    },
    attemptAuthorization(attemptId: string): AttemptAuthorization {
      const resolution = resolveAttemptAuthorization({
        projectId,
        attemptId,
        // The store's own list, adapted field-for-field; the resolver names no store implementation.
        events: authorizationEventsFrom((id) => input.store.listEvents(id)).listProjectEvents(projectId),
      });
      if (resolution.state === "UNRESOLVED") {
        throw new DomainValidationError(`ATTEMPT_AUTHORIZATION_UNRESOLVED: ${resolution.reason}: ${resolution.detail}`);
      }
      return resolution.authorization;
    },
    openAttempts,
    taskStates(): readonly { readonly taskId: string; readonly state: string }[] {
      const rows = connection
        .prepare("SELECT task_id, state FROM tasks WHERE project_id=?")
        .all(projectId) as unknown as readonly { task_id: unknown; state: unknown }[];
      return Object.freeze(rows.map((row) => ({ taskId: String(row.task_id), state: String(row.state) })));
    },
    allAttempts(): readonly WorkAttemptRow[] {
      const rows = connection
        .prepare("SELECT attempt_id, task_id, state, state_json FROM attempts WHERE project_id=? ORDER BY last_event_id")
        .all(projectId) as unknown as readonly { attempt_id: unknown; task_id: unknown; state: unknown; state_json: Uint8Array }[];
      return Object.freeze(
        rows.map((row) =>
          Object.freeze({
            attemptId: String(row.attempt_id),
            taskId: String(row.task_id ?? ""),
            state: String(row.state),
            batchActivationEventId: batchAnchorOf(row.state_json),
          }),
        ),
      );
    },
    openAttemptFor(taskId: string): WorkOpenAttempt | null {
      const held = openAttempts().filter((candidate) => candidate.taskId === taskId);
      return held.length === 1 ? held[0]! : null;
    },
  });
}

/**
 * PNWF-A/B/C — the bounded status observation.
 *
 * The lifecycle says a RUNNING attempt can be completed; the world and the host's invocation window
 * decide whether that is true NOW. This read-only owner returns the per-attempt execution facts and
 * the physical/canonical head relation. It decides nothing, writes nothing, and never advances the
 * canonical ProjectIR head. It lives here, not in the controller, so the measured orchestration
 * hotspot does not grow.
 */
export interface StatusFactPort {
  readonly attemptWorkRecord: (attemptId: string) => { readonly envelope?: { readonly base_commit?: string } | null } | null;
  readonly observeAttemptResult: (attemptId: string) => {
    readonly observedHead?: string | null;
    readonly uncommittedChanges?: readonly string[];
  } | null;
  readonly executionInvocations: {
    readonly list: (attemptId: string) => readonly { readonly outcome: string }[];
  };
}

export function observeStatusFacts<T extends { readonly attempt_id: string; readonly state: string }>(
  controller: StatusFactPort,
  attempts: readonly T[],
  projectHead: string,
  repository: string | null,
): { readonly attempts: Array<T & { readonly execution?: WorkAttemptExecution }>; readonly directOutcome: WorkDirectOutcome } {
  const rows = attempts.map((attempt) => {
    if (attempt.state !== "RUNNING") return attempt;
    let baseCommit = "";
    try {
      baseCommit = controller.attemptWorkRecord(attempt.attempt_id)?.envelope?.base_commit ?? "";
    } catch {
      baseCommit = "";
    }
    let worldHead: string | null = null;
    let uncommittedChanges: string[] = [];
    try {
      const observed = controller.observeAttemptResult(attempt.attempt_id);
      worldHead = observed?.observedHead ?? null;
      uncommittedChanges = [...(observed?.uncommittedChanges ?? [])];
    } catch {
      worldHead = null;
    }
    let liveness: WorkAttemptExecution["liveness"] = "UNKNOWN";
    try {
      const invocations = controller.executionInvocations.list(attempt.attempt_id);
      const open = invocations.some((invocation) => invocation.outcome === "OPEN");
      const last = invocations[invocations.length - 1];
      /**
       * PNWF-CQ-B: the invocation ledger is HOST-LOCAL and non-durable. An empty list means "this
       * host observed no invocation window", NOT "no worker ever started" and NOT "the previous
       * writer is gone". `UNOBSERVED` is the honest word; settlement still attributes the bytes
       * from its own observation (usually UNATTRIBUTED) and never claims a worker exit.
       */
      liveness = open ? "ACTIVE" : last === undefined ? "UNOBSERVED" : last.outcome === "ENDED" ? "EXITED" : "UNKNOWN";
    } catch {
      liveness = "UNKNOWN";
    }
    return {
      ...attempt,
      execution: Object.freeze({
        attemptId: attempt.attempt_id,
        baseCommit,
        worldHead,
        uncommittedChanges: Object.freeze(uncommittedChanges),
        liveness,
      }),
    };
  });

  const repositoryHead =
    repository === null
      ? null
      : ((): string | null => {
          try {
            return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }).trim();
          } catch {
            return null;
          }
        })();
  let uncommittedPaths: string[] = [];
  if (repository !== null) {
    try {
      uncommittedPaths = [...(canonicalWorktreeChanges(repository) ?? [])];
    } catch {
      uncommittedPaths = [];
    }
  }
  const relation: WorkDirectOutcome["relation"] =
    repositoryHead === null
      ? "UNOBSERVABLE"
      : repositoryHead === projectHead
        ? "IN_SYNC"
        : ((): boolean => {
            try {
              execFileSync("git", ["merge-base", "--is-ancestor", projectHead, repositoryHead], { cwd: repository ?? undefined, stdio: "ignore" });
              return true;
            } catch {
              return false;
            }
          })()
          ? "DIRECT_AHEAD"
          : "DIVERGED";
  return Object.freeze({
    attempts: rows,
    directOutcome: Object.freeze({
      repositoryHead,
      projectHead,
      relation,
      uncommittedPaths: Object.freeze(uncommittedPaths),
    }),
  });
}
export type { ProjectInput, ProjectInputBody, ProjectInputObservation, ProjectInputIdentity } from "./unseen_inputs.js";

/**
 * PNWF-CQ-D: the final-owner quiescence read for a plan revision.
 *
 * The DSH adapter sees the host job map just before it calls the plan; a worker can begin in the
 * gap. The invocation ledger is the owner-local fact the transport writes before it runs a worker,
 * so the revision owner can re-read it for the exact tasks the revision would stale.
 */
export interface OpenWorkerInvocation {
  readonly taskId: string;
  readonly attemptId: string;
  readonly invocationId: string;
}

export function findOpenWorkerInvocations(input: {
  readonly connection: DatabaseSync;
  readonly projectId: string;
  readonly taskIds: readonly string[];
  readonly invocations: (attemptId: string) => readonly { readonly invocationId: string; readonly outcome: string }[];
}): readonly OpenWorkerInvocation[] {
  const found: OpenWorkerInvocation[] = [];
  for (const taskId of input.taskIds) {
    const attempts = input.connection
      .prepare("SELECT attempt_id FROM attempts WHERE project_id=? AND task_id=? ORDER BY attempt_id")
      .all(input.projectId, taskId) as Array<{ attempt_id: unknown }>;
    for (const attempt of attempts) {
      const attemptId = String(attempt.attempt_id);
      const open = input.invocations(attemptId).find((invocation) => invocation.outcome === "OPEN");
      if (open !== undefined) found.push({ taskId, attemptId, invocationId: open.invocationId });
    }
  }
  return Object.freeze(found);
}

/* ------------------------------------------------------------------ *
 * PNWF-CQ-H — operator-mediated direct basis admission
 *
 * A direct commit is real repository work, but it is not a governed result. This path admits the
 * CHECKED-OUT commit as the canonical basis through the controller's ONE revision batch. It records
 * a manual approval and never writes ATTEMPT_COMPLETED or PROMOTION_COMMITTED.
 * ------------------------------------------------------------------ */

export interface DirectBasisAdmission {
  readonly commit: string;
  readonly operator: string;
  readonly reason: string;
}

export function directBasisTarget(input: {
  readonly repository: string | undefined;
  readonly currentHead: string;
  readonly commit: string;
  readonly operator: string;
  readonly reason: string;
  readonly promotionState: string;
}): string {
  const fail = (code: string, detail: string): never => {
    throw new DomainValidationError(`${code}: ${detail}`);
  };
  const repository = input.repository;
  if (repository === undefined || repository === "") {
    return fail("DIRECT_BASIS_NO_REPOSITORY", "this deployment has no canonical repository to admit a direct basis from");
  }
  if (input.operator.trim() === "") fail("DIRECT_BASIS_NO_OPERATOR", "a direct basis admission must name the verified operator");
  if (input.reason.trim() === "") fail("DIRECT_BASIS_NO_REASON", "a direct basis admission must state why the commit is an admissible basis");
  if (!/^[0-9a-f]{40}$/u.test(input.commit)) fail("DIRECT_BASIS_NOT_A_COMMIT", `"${input.commit}" is not a full 40-hex commit`);
  if (input.currentHead === input.commit) fail("DIRECT_BASIS_ALREADY_CURRENT", "the canonical ProjectIR head is already at this commit");
  const physicalHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }).trim();
  if (physicalHead !== input.commit) {
    fail(
      "DIRECT_BASIS_NOT_CHECKED_OUT",
      `the repository HEAD is ${physicalHead.slice(0, 12)}, not ${input.commit.slice(0, 12)}; a basis must be the commit the canonical tree actually holds`,
    );
  }
  const dirtyPaths = canonicalWorktreeChanges(repository);
  if (dirtyPaths === null) {
    return fail("DIRECT_BASIS_WORKTREE_UNOBSERVABLE", "the canonical worktree could not be observed; an unobserved tree is not a clean one");
  }
  if (dirtyPaths.length > 0) {
    fail(
      "DIRECT_BASIS_WORKTREE_DIRTY",
      `the canonical worktree still has uncommitted changes (${dirtyPaths.join(", ")}); admit a committed basis, not a working state`,
    );
  }
  if (input.promotionState === "SYNC_REQUIRED") {
    fail(
      "DIRECT_BASIS_PROMOTION_HEAD_AHEAD",
      "a proven promotion effect is ahead of the canonical ProjectIR head; reconcile that effect before admitting a direct basis",
    );
  }
  try {
    execFileSync("git", ["cat-file", "-e", `${input.commit}^{commit}`], { cwd: repository, stdio: "ignore" });
    execFileSync("git", ["merge-base", "--is-ancestor", input.currentHead, input.commit], { cwd: repository, stdio: "ignore" });
  } catch {
    fail(
      "DIRECT_BASIS_NOT_DESCENDANT",
      `the canonical head ${input.currentHead.slice(0, 12)} is not an ancestor of ${input.commit.slice(0, 12)}, or the commit is unknown; a basis advance must not discard the project's history`,
    );
  }
  const distance = Number(
    execFileSync("git", ["rev-list", "--count", `${input.currentHead}..${input.commit}`], { cwd: repository, encoding: "utf8" }).trim(),
  );
  if (!Number.isSafeInteger(distance) || distance < 1) fail("DIRECT_BASIS_NOT_AHEAD", "the target commit adds no history beyond the canonical head");
  return input.commit;
}

export function directBasisApprovalEvent(input: {
  readonly projectId: string;
  readonly expectedProjectRevision: number;
  readonly revision: number;
  readonly admission: DirectBasisAdmission;
}): NewEvent {
  return parseNewEvent({
    schema_version: 1,
    project_id: input.projectId,
    event_type: "MANUAL_APPROVAL_RECORDED",
    payload_version: 1,
    entity_type: "project",
    entity_id: input.projectId,
    payload: {
      approver: input.admission.operator,
      subject_type: "commit",
      subject_id: input.admission.commit,
      subject_digest: createHash("sha256").update(input.admission.commit).digest("hex"),
      risk_summary: input.admission.reason,
    },
    causation_id: null,
    correlation_id: `basis:${input.admission.commit}`,
    idempotency_key: actionKey("direct-basis-approval-v1", {
      project_id: input.projectId,
      revision: input.revision,
      commit: input.admission.commit,
      operator: input.admission.operator,
    }),
    expected_project_revision: input.expectedProjectRevision,
  });
}

export function directBasisEntityId(input: {
  readonly projectId: string;
  readonly revision: number;
  readonly commit: string;
}): string {
  return stableEntityId("basis", actionKey("direct-basis-admission-v1", input));
}

/**
 * PNWF-CQ-H — validate a trusted head advance. A promotion advance is delegated to the head owner;
 * a direct basis is validated against the checked-out commit, the clean tree, ancestry and the
 * promotion fence. The controller still commits the actual revision through ONE batch.
 */
export function validatedHeadAdvance(input: {
  readonly current: ProjectIr;
  readonly advance:
    | {
        readonly source?: "PROMOTION" | "DIRECT_BASIS" | undefined;
        readonly fromPromotionEventId?: string | undefined;
        readonly toHead: string;
        readonly operator?: string | undefined;
        readonly reason?: string | undefined;
      }
    | undefined;
  readonly repository: string | undefined;
  readonly promotionState: string;
  readonly validatePromotion: (input: {
    readonly current: ProjectIr;
    readonly toHead: string;
    readonly fromPromotionEventId: string;
  }) => string;
}): string {
  if (input.advance === undefined) return input.current.head_commit;
  if (input.advance.source === "DIRECT_BASIS") {
    return directBasisTarget({
      repository: input.repository,
      currentHead: input.current.head_commit,
      commit: input.advance.toHead,
      operator: input.advance.operator ?? "",
      reason: input.advance.reason ?? "",
      promotionState: input.promotionState,
    });
  }
  if (input.advance.fromPromotionEventId === undefined) {
    throw new DomainValidationError("HEAD_ADVANCE_UNPROVEN: a head advance must name either a promotion effect or a direct basis admission");
  }
  return input.validatePromotion({
    current: input.current,
    toHead: input.advance.toHead,
    fromPromotionEventId: input.advance.fromPromotionEventId,
  });
}

/**
 * PNWF-CQ-D — the invalidation set and the owner-local OPEN-invocation read, in one place.
 */
export function invalidationAffectedForPlan(input: {
  readonly project: ProjectIr;
  readonly from: number;
  readonly to: number;
  readonly changeClass: ChangeClass;
  readonly changedIds: readonly string[];
  readonly projectId: string;
  readonly connection: DatabaseSync;
  readonly invocations: (attemptId: string) => readonly { readonly invocationId: string; readonly outcome: string }[];
  readonly onOpenWorker: (open: OpenWorkerInvocation) => never;
}): readonly string[] {
  const edges: DependencyEdge[] = input.project.tasks.flatMap((task) =>
    task.depends_on.map((dependency) => ({
      from: dependency,
      to: task.task_id,
      sensitive_to: ["behavior_change", "contract_breaking"] as const,
    })),
  );
  const affected = [
    ...computeInvalidationSet(
      { from: input.from, to: input.to, change_class: input.changeClass, changed_ids: input.changedIds },
      edges,
    ),
  ].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const openWorkerInvocations = findOpenWorkerInvocations({
    connection: input.connection,
    projectId: input.projectId,
    taskIds: affected,
    invocations: input.invocations,
  });
  if (openWorkerInvocations.length > 0) input.onOpenWorker(openWorkerInvocations[0]!);
  return Object.freeze(affected);
}

/** The revision receipt identity: a promotion-backed plan or an operator-mediated direct basis. */
export function directBasisReceipt(input: {
  readonly projectId: string;
  readonly revision: number;
  readonly commit: string;
  readonly operator: string;
}): { readonly promotionId: string; readonly correlationId: string; readonly idempotencyKey: string } {
  return {
    promotionId: directBasisEntityId(input),
    correlationId: `basis:${input.commit}`,
    idempotencyKey: actionKey("direct-basis-admission-v1", input),
  };
}

/** A direct basis admission is head-only; a task graph change belongs to a separate revision. */
export function assertDirectBasisHeadOnly(diffs: readonly { readonly class: string }[]): void {
  const graphChanged = diffs.some((diff) => diff.class !== "RETAIN_UNCHANGED" && diff.class !== "TERMINAL_HISTORICAL");
  if (graphChanged) {
    throw new DomainValidationError(
      "DIRECT_BASIS_GRAPH_CHANGED: a direct basis admission is head-only; admit the basis first, then revise the task graph separately",
    );
  }
}

/** Append the manual approval that names the exact admitted commit and reason. */
export function appendDirectBasisApproval(
  requests: NewEvent[],
  input: {
    readonly projectId: string;
    readonly expectedProjectRevision: number;
    readonly revision: number;
    readonly commit: string;
    readonly operator: string;
    readonly reason: string;
  },
): void {
  requests.push(
    directBasisApprovalEvent({
      projectId: input.projectId,
      expectedProjectRevision: input.expectedProjectRevision,
      revision: input.revision,
      admission: { commit: input.commit, operator: input.operator, reason: input.reason },
    }),
  );
}

/** The revision receipt: promotion-backed plan identity, or the direct-basis identity. */
export function planReceipt(input: {
  readonly projectId: string;
  readonly revision: number;
  readonly directBasis?: { readonly toHead: string; readonly operator?: string | undefined } | undefined;
}): { readonly promotionId: string; readonly correlationId: string; readonly idempotencyKey: string } {
  if (input.directBasis !== undefined) {
    return directBasisReceipt({
      projectId: input.projectId,
      revision: input.revision,
      commit: input.directBasis.toHead,
      operator: input.directBasis.operator ?? "",
    });
  }
  return {
    promotionId: stableEntityId("plan", actionKey("plan-revision-v1", { project_id: input.projectId, revision: input.revision })),
    correlationId: `plan:${input.revision}`,
    idempotencyKey: actionKey("plan-revision-v1", { project_id: input.projectId, revision: input.revision }),
  };
}
