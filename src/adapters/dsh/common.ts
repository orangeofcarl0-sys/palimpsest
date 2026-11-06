/**
 * SR-1 R3A — the shared DSH adapter helpers.
 *
 * Argument parsing, the strict tool wrapper and the renderer every cluster uses. Nothing here
 * knows about a capability: the wrapper enforces the shared contract (a closed argument set, a
 * required string action, an error type a host can recognise) and the clusters supply the rest.
 */

import type { DshContentBlock, DshToolDefinition, DshToolRunContext } from "../../tools/dsh_types.js";
import { materializeProofSourceRevisionRef } from "../../proof_asset/index.js";

function textBlock(value: unknown): DshContentBlock[] {
  return [{ type: "text", text: JSON.stringify(value, null, 2) }];
}

class ToolArgsError extends TypeError {}

function argsObject(args: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (typeof args !== "object" || args === null || Array.isArray(args)) throw new ToolArgsError("tool arguments must be an object");
  const object = args as Record<string, unknown>;
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) throw new ToolArgsError(`unknown argument "${key}"`);
  }
  return object;
}

function required(object: Record<string, unknown>, name: string): unknown {
  if (object[name] === undefined || object[name] === null) throw new ToolArgsError(`argument "${name}" is required`);
  return object[name];
}

function requiredString(object: Record<string, unknown>, name: string): string {
  const value = required(object, name);
  if (typeof value !== "string" || value.trim() === "") throw new ToolArgsError(`argument "${name}" must be a non-empty string`);
  return value;
}

function requiredNumber(object: Record<string, unknown>, name: string): number {
  const value = required(object, name);
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new ToolArgsError(`argument "${name}" must be a non-negative integer`);
  return value;
}

function requiredRevisionRef(object: Record<string, unknown>) {
  return materializeProofSourceRevisionRef({
    sourceId: requiredString(object, "sourceId"),
    revision: requiredNumber(object, "revision"),
    contentDigest: requiredString(object, "contentDigest"),
  });
}

function stringArray(value: unknown, what: string): readonly string[] {
  if (!Array.isArray(value)) throw new ToolArgsError(`${what} must be an array of strings`);
  return value.map((entry) => {
    if (typeof entry !== "string" || entry.trim() === "") throw new ToolArgsError(`${what} must contain non-empty strings`);
    return entry;
  });
}

function tool(input: {
  readonly name: string;
  readonly description: string;
  readonly mode: "read-only" | "mutating";
  readonly actions: readonly string[];
  readonly extraProperties?: Readonly<Record<string, unknown>>;
  readonly run: (action: string, object: Record<string, unknown>, context: DshToolRunContext) => Promise<unknown>;
}): DshToolDefinition {
  const properties: Record<string, unknown> = {
    action: { type: "string", enum: [...input.actions], description: "the semantic action to perform" },
    ...(input.extraProperties ?? {}),
  };
  const allowed = ["action", ...Object.keys(input.extraProperties ?? {})];
  return {
    name: input.name,
    description: `${input.description} — [${input.mode}]`,
    parameters: { type: "object", properties, required: ["action"], additionalProperties: false },
    output: { schema: { type: "object" }, render: (_args, value) => textBlock(value) },
    mode: input.mode,
    async execute(args: unknown, context: DshToolRunContext): Promise<unknown> {
      const object = argsObject(args, allowed);
      const action = requiredString(object, "action");
      if (!input.actions.includes(action)) throw new ToolArgsError(`unknown action "${action}"`);
      return input.run(action, object, context);
    },
  };
}
export { ToolArgsError, required, requiredNumber, requiredRevisionRef, requiredString, stringArray, tool };

/** The principal-safe projection of orchestration status. */
export interface ExecutionBoundary {
  readonly placement: "in-place" | "worktree";
  readonly liveRepositoryMutable: boolean;
  readonly isolated: boolean;
  readonly preAcceptance: boolean;
  readonly detail: string;
  readonly warning: string | null;
}

export function safeStatus(status: unknown, boundary?: ExecutionBoundary): Record<string, unknown> {
  const view = status as {
    revision?: unknown;
    headCommit?: unknown;
    schedulerState?: unknown;
    tasks?: Array<{ task_id?: unknown; state?: unknown }>;
    attempts?: Array<{
      attempt_id?: unknown;
      task_id?: unknown;
      state?: unknown;
      execution?: {
        baseCommit?: unknown;
        worldHead?: unknown;
        uncommittedChanges?: unknown;
        liveness?: unknown;
      };
    }>;
    evidence?: Array<{ status?: unknown }>;
    promotions?: Array<{ promotion_id?: unknown; state?: unknown }>;
    promotionFence?: Array<{ state?: unknown }>;
    holds?: unknown[];
    nextAction?: {
      kind?: unknown;
      executable?: unknown;
      action?: unknown;
      detail?: unknown;
      taskId?: unknown;
      blockers?: unknown;
      session?: {
        mayEnd?: unknown;
        action?: unknown;
        detail?: unknown;
      };
      semantic?: {
        question?: unknown;
        facts?: unknown;
        options?: unknown;
      };
    };
    directOutcome?: {
      repositoryHead?: unknown;
      projectHead?: unknown;
      relation?: unknown;
      uncommittedPaths?: unknown;
    };
  };
  const tasks = (view.tasks ?? []).map((task) => ({ task_id: String(task.task_id), state: String(task.state) }));
  const attempts = (view.attempts ?? []).map((attempt) => ({
    attempt_id: String(attempt.attempt_id ?? ""),
    task_id: typeof attempt.task_id === "string" ? attempt.task_id : null,
    state: String(attempt.state),
    ...(attempt.execution === undefined
      ? {}
      : {
          execution: {
            baseCommit: String(attempt.execution.baseCommit ?? ""),
            worldHead: typeof attempt.execution.worldHead === "string" ? attempt.execution.worldHead : null,
            uncommittedChanges: Array.isArray(attempt.execution.uncommittedChanges)
              ? attempt.execution.uncommittedChanges.map((entry) => String(entry))
              : [],
            liveness: String(attempt.execution.liveness ?? "UNKNOWN"),
          },
        }),
  }));
  const attemptStates = attempts.map((attempt) => attempt.state);
  const promotions = (view.promotions ?? []).map((promotion) => ({
    promotion_id: String(promotion.promotion_id ?? ""),
    state: String(promotion.state),
  }));
  const evidence = view.evidence ?? [];
  const nextAction =
    view.nextAction === undefined
      ? undefined
      : {
          kind: String(view.nextAction.kind),
          executable: view.nextAction.executable === true,
          action: typeof view.nextAction.action === "string" ? view.nextAction.action : null,
          detail: String(view.nextAction.detail ?? ""),
          taskId: typeof view.nextAction.taskId === "string" ? view.nextAction.taskId : null,
          blockers: Array.isArray(view.nextAction.blockers)
            ? view.nextAction.blockers.map((entry) => String(entry))
            : [],
          ...(view.nextAction.session === undefined
            ? {}
            : {
                session: {
                  mayEnd: view.nextAction.session.mayEnd === true,
                  action:
                    typeof view.nextAction.session.action === "string" ? view.nextAction.session.action : null,
                  detail: String(view.nextAction.session.detail ?? ""),
                },
              }),
          ...(view.nextAction.semantic === undefined
            ? {}
            : {
                semantic: {
                  question: String(view.nextAction.semantic.question ?? ""),
                  facts: Array.isArray(view.nextAction.semantic.facts)
                    ? view.nextAction.semantic.facts.map((entry) => String(entry))
                    : [],
                  options: Array.isArray(view.nextAction.semantic.options)
                    ? view.nextAction.semantic.options.map((entry) => String(entry))
                    : [],
                },
              }),
        };
  const nextActions =
    nextAction === undefined
      ? [
          ...(attemptStates.includes("RUNNING") ? ["palimpsest_work action=complete"] : []),
          ...(tasks.some((task) => task.state === "VERIFYING") ? ["an operator must review and accept the delivered result"] : []),
          ...(tasks.some((task) => task.state === "READY") ? ["palimpsest_work action=next"] : []),
        ]
      : nextAction.executable && nextAction.action !== null
        ? [nextAction.action]
        : [
            `${nextAction.kind.startsWith("WAIT_OPERATOR") ? "operator" : "agent"}: ${nextAction.detail}`,
            ...(nextAction.session?.mayEnd === true && nextAction.session.action !== null
              ? [`session: ${nextAction.session.action}`]
              : []),
          ];
  if (nextAction?.semantic !== undefined) {
    nextActions.push(`decision: ${String(nextAction.semantic.question ?? "")}`);
  }
  const directOutcome =
    view.directOutcome === undefined
      ? undefined
      : {
          repositoryHead:
            typeof view.directOutcome.repositoryHead === "string" ? view.directOutcome.repositoryHead : null,
          projectHead: String(view.directOutcome.projectHead ?? ""),
          relation: String(view.directOutcome.relation ?? "UNOBSERVABLE"),
          uncommittedPaths: Array.isArray(view.directOutcome.uncommittedPaths)
            ? view.directOutcome.uncommittedPaths.map((entry) => String(entry))
            : [],
        };
  return {
    revision: view.revision,
    headCommit: view.headCommit,
    ...(directOutcome === undefined ? {} : { directOutcome }),
    schedulerState: view.schedulerState,
    ...(boundary === undefined ? {} : { boundary }),
    holds: (view.holds ?? []).map((taskId) => String(taskId)),
    nextAction,
    tasks,
    attempts,
    promotions,
    summary: {
      tasksTotal: tasks.length,
      tasksSatisfied: tasks.filter((task) => task.state === "SATISFIED").length,
      tasksVerifying: tasks.filter((task) => task.state === "VERIFYING").length,
      attemptsRunning: attemptStates.filter((state) => state === "RUNNING").length,
      attemptsCompleted: attemptStates.filter((state) => state === "COMPLETED").length,
      evidenceActive: evidence.filter((atom) => atom.status === "active").length,
      evidenceStale: evidence.filter((atom) => atom.status === "stale").length,
      promotionsPrepared: (view.promotions ?? []).filter((promotion) => promotion.state === "PREPARED").length,
      promotionFencePending: (view.promotionFence ?? []).length,
    },
    nextActions,
  };
}
