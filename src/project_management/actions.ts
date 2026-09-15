/**
 * G10-V graduated project-management autonomy — untrusted action candidates.
 *
 *   Candidate ≠ Command        Candidate ≠ Authorization      Candidate ≠ Task
 *
 * A candidate is a DERIVED, content-addressed prompt that says "this looks worth
 * doing, here is why, here is what it would touch". It carries no authority and
 * no score: whether it may actually run is decided later by `policy.ts` (mode,
 * boundaries, capability, semantic authority) and executed only through the
 * existing governed services. Builders only re-arrange the workspace view; they
 * never fabricate a task, requirement, commitment or peer.
 */

import { canonicalDigest } from "../schema/canonical.js";

import type { ProjectWorkspaceView } from "../project_workspace/view.js";

import { MANAGEMENT_ACTION_CLASSES, managementFail, type ManagementActionClass } from "./profile.js";

/* ------------------------------------------------------------------ *
 * Artifact
 * ------------------------------------------------------------------ */

export const MANAGEMENT_RISK_CLASSES = ["LOW", "MEDIUM", "HIGH", "CONSTITUTIONAL"] as const;
export type ManagementRiskClass = (typeof MANAGEMENT_RISK_CLASSES)[number];

export const MANAGEMENT_ACTION_ID_DOMAIN = "palimpsest.project-management.action-id.v1";
export const MANAGEMENT_ACTION_ID_PREFIX = "mac";

export interface ManagementActionSubjectRef {
  readonly kind: string;
  readonly id: string;
}

export interface ManagementActionCandidate {
  readonly actionId: string;
  readonly kind: ManagementActionClass;
  readonly reason: string;
  readonly subjects: readonly ManagementActionSubjectRef[];
  readonly riskClass: ManagementRiskClass;
  readonly requiredConfirmation: boolean;
  readonly capability: string;
  readonly executable: boolean;
}

/* ------------------------------------------------------------------ *
 * Capability names understood by the management service
 * ------------------------------------------------------------------ */

export const CAPABILITY_OBSERVE = "management.observe";
export const CAPABILITY_RECOMMEND = "management.recommend";
export const CAPABILITY_PREPARE = "management.prepare";
export const CAPABILITY_RUN_TURN = "controller.runTurn";
export const CAPABILITY_PLAN = "controller.plan";
export const CAPABILITY_RECIPE_EXECUTION = "recipes.execution";
export const CAPABILITY_VERIFY = "verify";
/**
 * G10-X: the mechanical project-head reconciliation port
 * (`controller.reconcileProjectHead`). It advances the ProjectIR head onto the
 * canonically proven effect head through the ordinary revision batch; it is
 * NOT a promotion port and it can never be used to promote an attempt.
 */
export const CAPABILITY_RECONCILE_HEAD = "controller.reconcileProjectHead";
/** Deliberately unmapped: no authority-bearing port exists in this layer. */
export const CAPABILITY_EXTERNAL = "management.external";

/* ------------------------------------------------------------------ *
 * Strict materialize / parse
 * ------------------------------------------------------------------ */

function actObject(raw: unknown, what: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    managementFail("malformed_artifact", `${what} must be an object`);
  }
  return raw as Record<string, unknown>;
}

function actKeys(object: Record<string, unknown>, allowed: readonly string[], required: readonly string[], what: string): void {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) managementFail("unknown_field", `${what}: unknown field "${key}"`);
  }
  for (const key of required) {
    if (!Object.hasOwn(object, key) || object[key] === undefined) {
      managementFail("malformed_artifact", `${what}: missing required field "${key}"`);
    }
  }
}

function actString(value: unknown, what: string): string {
  if (typeof value !== "string" || value.length === 0) managementFail("invalid_value", `${what} must be a non-empty string`);
  return value;
}

function actReason(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim().length === 0) managementFail("invalid_value", `${what} must be a non-empty reason`);
  return value;
}

function actBoolean(value: unknown, what: string): boolean {
  if (typeof value !== "boolean") managementFail("invalid_value", `${what} must be a boolean`);
  return value;
}

function actEnum<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    managementFail("unknown_kind", `${what} must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}

function parseSubjects(raw: unknown, what: string): readonly ManagementActionSubjectRef[] {
  if (!Array.isArray(raw)) managementFail("malformed_artifact", `${what} must be an array`);
  const byRef = new Map<string, ManagementActionSubjectRef>();
  for (const [index, entry] of (raw as unknown[]).entries()) {
    const object = actObject(entry, `${what}[${index}]`);
    actKeys(object, ["kind", "id"], ["kind", "id"], `${what}[${index}]`);
    const kind = actString(object.kind, `${what}[${index}].kind`);
    const id = actString(object.id, `${what}[${index}].id`);
    byRef.set(`${kind}\u0000${id}`, Object.freeze({ kind, id }));
  }
  return Object.freeze(
    [...byRef.values()].sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  );
}

type CandidateContent = Omit<ManagementActionCandidate, "actionId">;

/** Deterministic content-addressed candidate id (`mac-<32 hex>`). */
export function managementActionIdOf(content: CandidateContent): string {
  return `${MANAGEMENT_ACTION_ID_PREFIX}-${canonicalDigest({ domain: MANAGEMENT_ACTION_ID_DOMAIN, candidate: content }).slice(0, 32)}`;
}

export interface MaterializeManagementActionCandidateInput {
  readonly kind: ManagementActionClass;
  readonly reason: string;
  readonly subjects: readonly ManagementActionSubjectRef[];
  readonly riskClass: ManagementRiskClass;
  readonly requiredConfirmation: boolean;
  readonly capability: string;
  readonly executable: boolean;
}

export function materializeManagementActionCandidate(input: MaterializeManagementActionCandidateInput): ManagementActionCandidate {
  const content: CandidateContent = {
    kind: actEnum(input.kind, ALL_KINDS, "kind"),
    reason: actReason(input.reason, "reason"),
    subjects: parseSubjects(input.subjects, "subjects"),
    riskClass: actEnum(input.riskClass, MANAGEMENT_RISK_CLASSES, "riskClass"),
    requiredConfirmation: actBoolean(input.requiredConfirmation, "requiredConfirmation"),
    capability: actString(input.capability, "capability"),
    executable: actBoolean(input.executable, "executable"),
  };
  return Object.freeze({ ...content, actionId: managementActionIdOf(content) });
}

const CANDIDATE_KEYS = ["actionId", "kind", "reason", "subjects", "riskClass", "requiredConfirmation", "capability", "executable"] as const;

export function parseManagementActionCandidate(raw: unknown, what = "ManagementActionCandidate"): ManagementActionCandidate {
  const object = actObject(raw, what);
  actKeys(object, CANDIDATE_KEYS, CANDIDATE_KEYS, what);
  const content: CandidateContent = {
    kind: actEnum(object.kind, ALL_KINDS, `${what}.kind`),
    reason: actReason(object.reason, `${what}.reason`),
    subjects: parseSubjects(object.subjects, `${what}.subjects`),
    riskClass: actEnum(object.riskClass, MANAGEMENT_RISK_CLASSES, `${what}.riskClass`),
    requiredConfirmation: actBoolean(object.requiredConfirmation, `${what}.requiredConfirmation`),
    capability: actString(object.capability, `${what}.capability`),
    executable: actBoolean(object.executable, `${what}.executable`),
  };
  const actionId = actString(object.actionId, `${what}.actionId`);
  if (managementActionIdOf(content) !== actionId) managementFail("invalid_value", `${what}.actionId does not match its content`);
  return Object.freeze({ ...content, actionId });
}

/* The runtime list used by the strict parsers. */
const ALL_KINDS: readonly ManagementActionClass[] = MANAGEMENT_ACTION_CLASSES;

/* ------------------------------------------------------------------ *
 * Builders — derived from the workspace view, never fabricated
 * ------------------------------------------------------------------ */

const NON_TERMINAL_ATTEMPT_STATES = new Set(["CREATED", "LEASED", "RUNNING"]);

interface Draft {
  readonly kind: ManagementActionClass;
  readonly reason: string;
  readonly subjects: readonly ManagementActionSubjectRef[];
  readonly riskClass: ManagementRiskClass;
  readonly requiredConfirmation: boolean;
  readonly capability: string;
  readonly executable: boolean;
}

/**
 * Derive the deterministic candidate set a workspace view supports. Pure: the
 * same view always yields the same, content-addressed candidates.
 */
export function deriveManagementActionCandidates(view: ProjectWorkspaceView): readonly ManagementActionCandidate[] {
  const drafts: Draft[] = [];
  const nonTerminalTasks = new Set<string>();
  for (const attempt of view.work.attempts) {
    if (attempt.task_id !== null && NON_TERMINAL_ATTEMPT_STATES.has(attempt.state)) nonTerminalTasks.add(attempt.task_id);
  }

  const subjectsOfLoop = (loop: ProjectWorkspaceView["openLoops"][number]): readonly ManagementActionSubjectRef[] => {
    const base: ManagementActionSubjectRef = { kind: "open_loop", id: loop.id };
    if (loop.subjectRef === undefined) return [base];
    return [base, { kind: loop.subjectRef.kind, id: loop.subjectRef.id }];
  };

  for (const loop of view.openLoops) {
    switch (loop.kind) {
      case "CAMPAIGN_WATCH":
        drafts.push({
          kind: "OBSERVE",
          reason: `campaign watch: ${loop.detail}`,
          subjects: subjectsOfLoop(loop),
          riskClass: "LOW",
          requiredConfirmation: false,
          capability: CAPABILITY_OBSERVE,
          executable: true,
        });
        break;

      case "BLOCKED_WORK":
        drafts.push({
          kind: "RECOMMEND",
          reason: `the scheduler reports blocked work: ${loop.detail}`,
          subjects: subjectsOfLoop(loop),
          riskClass: "MEDIUM",
          requiredConfirmation: false,
          capability: CAPABILITY_RECOMMEND,
          executable: true,
        });
        drafts.push({
          kind: "APPLY_LOCAL_PLAN_REVISION",
          reason: `work is blocked and a local task-plan revision may unblock it: ${loop.detail}`,
          subjects: subjectsOfLoop(loop),
          riskClass: "HIGH",
          requiredConfirmation: true,
          capability: CAPABILITY_PLAN,
          executable: true,
        });
        break;

      case "READY_WORK": {
        const taskId = loop.subjectRef?.id;
        const subject: ManagementActionSubjectRef = taskId === undefined ? { kind: "open_loop", id: loop.id } : { kind: "task", id: taskId };
        if (taskId !== undefined && nonTerminalTasks.has(taskId)) {
          drafts.push({
            kind: "ADVANCE_MECHANICAL_WORK",
            reason: `task ${taskId} is ready and has a non-terminal attempt: ${loop.detail}`,
            subjects: [subject],
            riskClass: "LOW",
            requiredConfirmation: false,
            capability: CAPABILITY_RUN_TURN,
            executable: true,
          });
        } else {
          drafts.push({
            kind: "DISPATCH_LOCAL_WORK",
            reason: `task ${taskId ?? loop.id} is ready and already part of the plan: ${loop.detail}`,
            subjects: [subject],
            riskClass: "MEDIUM",
            requiredConfirmation: false,
            capability: CAPABILITY_PLAN,
            executable: true,
          });
        }
        break;
      }

      case "STALE_PROOF":
        drafts.push({
          kind: "RECOMMEND",
          reason: `proof standing/freshness has degraded: ${loop.detail}`,
          subjects: subjectsOfLoop(loop),
          riskClass: "MEDIUM",
          requiredConfirmation: false,
          capability: CAPABILITY_RECOMMEND,
          executable: true,
        });
        break;

      case "PROJECT_HEAD_DRIFT":
        // G10-X: the ProjectIR head is behind the canonically proven effect head.
        // The candidate is the MECHANICAL CONSISTENCY step (advance the head and
        // re-authorize retained tasks), never a promotion: the attempt that moved
        // the branch was promoted long before this, and this action class carries
        // no promotion authority.
        drafts.push({
          kind: "RECONCILE_PROJECT_HEAD",
          reason: `the project head is behind the proven effect head: ${loop.detail}`,
          subjects: subjectsOfLoop(loop),
          riskClass: "LOW",
          requiredConfirmation: false,
          capability: CAPABILITY_RECONCILE_HEAD,
          executable: true,
        });
        break;

      case "PROJECT_HEAD_CONFLICT":
        // A broken promotion chain is never auto-advanced: observe and recommend
        // an operator investigation instead.
        drafts.push({
          kind: "RECOMMEND",
          reason: `the promotion chain is broken and the project head cannot be advanced automatically: ${loop.detail}`,
          subjects: subjectsOfLoop(loop),
          riskClass: "MEDIUM",
          requiredConfirmation: false,
          capability: CAPABILITY_RECOMMEND,
          executable: true,
        });
        break;

      case "REASONING_UNRESOLVED":
        drafts.push({
          kind: "RECOMMEND",
          reason: `an associated reasoning cell is unresolved: ${loop.detail}`,
          subjects: subjectsOfLoop(loop),
          riskClass: "LOW",
          requiredConfirmation: false,
          capability: CAPABILITY_RECOMMEND,
          executable: true,
        });
        break;

      case "PENDING_COMMITMENT":
        drafts.push({
          kind: "CREATE_EXTERNAL_COMMITMENT",
          reason: `a commitment is pending and would cross an external boundary: ${loop.detail}`,
          subjects: subjectsOfLoop(loop),
          riskClass: "HIGH",
          requiredConfirmation: true,
          capability: CAPABILITY_EXTERNAL,
          executable: false,
        });
        break;

      case "PENDING_BOUNDARY_DECISION":
        drafts.push({
          kind: "APPROVE_DISCLOSURE",
          reason: `a boundary decision is pending and could disclose information: ${loop.detail}`,
          subjects: subjectsOfLoop(loop),
          riskClass: "CONSTITUTIONAL",
          requiredConfirmation: true,
          capability: CAPABILITY_EXTERNAL,
          executable: false,
        });
        break;

      case "JOURNAL_OPEN_QUESTION":
        drafts.push({
          kind: "RECOMMEND",
          reason: `an open journal question has no resolution: ${loop.detail}`,
          subjects: subjectsOfLoop(loop),
          riskClass: "LOW",
          requiredConfirmation: false,
          capability: CAPABILITY_RECOMMEND,
          executable: true,
        });
        break;

      case "JOURNAL_OPPORTUNITY":
        drafts.push({
          kind: "PREPARE",
          reason: `an opportunity is recorded and could be prepared for explicit promotion: ${loop.detail}`,
          subjects: subjectsOfLoop(loop),
          riskClass: "LOW",
          requiredConfirmation: false,
          capability: CAPABILITY_PREPARE,
          executable: true,
        });
        break;
    }
  }

  const byId = new Map<string, ManagementActionCandidate>();
  for (const draft of drafts) {
    const candidate = materializeManagementActionCandidate(draft);
    byId.set(candidate.actionId, candidate);
  }

  const order = new Map<string, number>(MANAGEMENT_ACTION_CLASSES.map((kind, index) => [kind, index]));
  const ordered = [...byId.values()].sort((a, b) => {
    const kindDelta = (order.get(a.kind) ?? 0) - (order.get(b.kind) ?? 0);
    if (kindDelta !== 0) return kindDelta;
    return a.actionId < b.actionId ? -1 : a.actionId > b.actionId ? 1 : 0;
  });
  return Object.freeze(ordered);
}
