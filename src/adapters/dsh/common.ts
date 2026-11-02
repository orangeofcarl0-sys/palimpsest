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
    attempts?: Array<{ state?: unknown }>;
    evidence?: Array<{ status?: unknown }>;
    promotions?: Array<{ state?: unknown }>;
    promotionFence?: Array<{ state?: unknown }>;
    holds?: unknown[];
    nextAction?: {
      kind?: unknown;
      executable?: unknown;
      action?: unknown;
      detail?: unknown;
      taskId?: unknown;
    };
  };
  const tasks = (view.tasks ?? []).map((task) => ({ task_id: String(task.task_id), state: String(task.state) }));
  const attemptStates = (view.attempts ?? []).map((attempt) => String(attempt.state));
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
        : [`${nextAction.kind.startsWith("WAIT_OPERATOR") ? "operator" : "agent"}: ${nextAction.detail}`];
  return {
    revision: view.revision,
    headCommit: view.headCommit,
    schedulerState: view.schedulerState,
    ...(boundary === undefined ? {} : { boundary }),
    holds: (view.holds ?? []).map((taskId) => String(taskId)),
    nextAction,
    tasks,
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
