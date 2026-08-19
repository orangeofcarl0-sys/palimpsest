/**
 * The seven Palimpsest DSH tools (docs/01 §6): thin, user-friendly bindings
 * over ProjectController. Inputs are validated fail-closed; outputs are
 * plain JSON rendered as text blocks. The agent never sees event hashes or
 * projection internals — only goal/task/attempt/evidence language.
 */

import type { DshToolDefinition } from "./dsh_types.js";
import { ProjectController } from "./controller.js";
import type { TaskSpec } from "../schema/index.js";

interface JsonObject {
  [key: string]: unknown;
}

function objectField(args: unknown): JsonObject {
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    throw new TypeError("arguments must be an object");
  }
  return args as JsonObject;
}

function stringField(args: JsonObject, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${key} must be a non-empty string`);
  }
  return value;
}

function optionalString(args: JsonObject, key: string): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new TypeError(`${key} must be a string`);
  return value;
}

function stringArray(args: JsonObject, key: string): string[] | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new TypeError(`${key} must be an array of strings`);
  }
  return value as string[];
}

function parseTaskSpecs(args: JsonObject): TaskSpec[] {
  const raw = args.tasks;
  if (!Array.isArray(raw)) {
    throw new TypeError("tasks must be an array");
  }
  return raw.map((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new TypeError("each task must be an object");
    }
    const task = item as JsonObject;
    return {
      task_id: stringField(task, "task_id"),
      objective: stringField(task, "objective"),
      depends_on: stringArray(task, "depends_on") ?? [],
      write_paths: stringArray(task, "write_paths") ?? [],
      required_artifacts: stringArray(task, "required_artifacts") ?? [],
    };
  });
}

function textBlock(value: unknown): ReturnType<NonNullable<DshToolDefinition["output"]["render"]>> {
  return [{ type: "text", text: JSON.stringify(value, null, 2) }];
}

function tool(options: {
  name: string;
  description: string;
  properties: JsonObject;
  required: readonly string[];
  execute: (args: JsonObject) => Promise<unknown> | unknown;
}): DshToolDefinition {
  return {
    name: options.name,
    description: options.description,
    parameters: {
      type: "object",
      properties: options.properties,
      required: [...options.required],
      additionalProperties: false,
    },
    output: {
      schema: { type: "object" },
      render: (_args, value) => textBlock(value),
    },
    async execute(args) {
      return options.execute(objectField(args));
    },
  };
}

export function definePalimpsestTools(controller: ProjectController): DshToolDefinition[] {
  return [
    tool({
      name: "palimpsest_start",
      description:
        "Compile a one-sentence goal into a durable project (ProjectIR revision 0) and register its task graph",
      properties: {
        projectId: { type: "string" },
        goal: { type: "string" },
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              task_id: { type: "string" },
              objective: { type: "string" },
              depends_on: { type: "array", items: { type: "string" } },
              write_paths: { type: "array", items: { type: "string" } },
              required_artifacts: { type: "array", items: { type: "string" } },
            },
            required: ["task_id", "objective"],
          },
        },
        headCommit: { type: "string" },
      },
      required: ["projectId", "goal", "tasks"],
      execute: (args) => {
        const event = controller.start({
          projectId: stringField(args, "projectId"),
          goal: stringField(args, "goal"),
          tasks: parseTaskSpecs(args),
          headCommit: optionalString(args, "headCommit"),
        });
        const ir = event.payload.project_ir as { revision: number; digest: string };
        return { projectId: event.project_id, revision: ir.revision, digest: ir.digest };
      },
    }),

    tool({
      name: "palimpsest_plan",
      description: "Revise the project's task graph (new ProjectIR revision; history is preserved)",
      properties: {
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              task_id: { type: "string" },
              objective: { type: "string" },
              depends_on: { type: "array", items: { type: "string" } },
              write_paths: { type: "array", items: { type: "string" } },
              required_artifacts: { type: "array", items: { type: "string" } },
            },
            required: ["task_id", "objective"],
          },
        },
        reason: { type: "string" },
      },
      required: ["tasks"],
      execute: (args) => {
        const event = controller.plan({
          tasks: parseTaskSpecs(args),
          reason: optionalString(args, "reason"),
        });
        const ir = event.payload.project_ir as { revision: number; digest: string };
        return { revision: ir.revision, digest: ir.digest };
      },
    }),

    tool({
      name: "palimpsest_next",
      description:
        "Ask the scheduler for its deterministic next decision (at most one event per call); returns the created attempt/task or nothing to do",
      properties: {},
      required: [],
      execute: async () => {
        const event = controller.step();
        if (event === null) {
          return { decision: "idle" };
        }
        return {
          decision: "dispatched",
          eventType: event.event_type,
          entityId: event.entity_id,
          projectRevision: event.expected_project_revision,
        };
      },
    }),

    tool({
      name: "palimpsest_preview",
      description:
        "Read-only, plan-mode-safe: what the scheduler would do next, without doing it. No event is written; identical to the next palimpsest_next outcome",
      properties: {},
      required: [],
      execute: () => controller.preview(),
    }),

    tool({
      name: "palimpsest_run",
      description:
        "Advance exactly one turn of the project: run bounded mechanical steps (auto gate commands + batch retries), then report the phase and what the host must judge next — dispatch a worker (needs_worker), gate + promote a verified batch (needs_promotion), or done (terminal)",
      properties: { maxMechanicalSteps: { type: "number" } },
      required: [],
      execute: async (args) => {
        const raw = args.maxMechanicalSteps;
        const maxSteps =
          typeof raw === "number" && Number.isFinite(raw)
            ? Math.max(1, Math.floor(raw))
            : undefined;
        return controller.runTurn(maxSteps === undefined ? {} : { maxSteps });
      },
    }),

    tool({
      name: "palimpsest_claim",
      description:
        "Claim one attempt: create its isolated worktree and mark it RUNNING; the claiming agent then does the work",
      properties: { attemptId: { type: "string" } },
      required: ["attemptId"],
      execute: async (args) => {
        const attemptId = stringField(args, "attemptId");
        const { worktreePath } = await controller.claim(attemptId);
        return { attemptId, worktreePath, status: "RUNNING" };
      },
    }),

    tool({
      name: "palimpsest_report",
      description:
        "Submit the attempt report. Claims in the report are never evidence; only deterministic gates produce evidence",
      properties: {
        attemptId: { type: "string" },
        workerStatus: {
          type: "string",
          enum: ["completed", "failed", "cancelled", "expired"],
        },
        summary: { type: "string" },
        changedFiles: { type: "array", items: { type: "string" } },
        producedArtifacts: { type: "array", items: { type: "string" } },
        resultCommit: { type: "string" },
      },
      required: ["attemptId", "workerStatus", "summary"],
      execute: (args) => {
        const workerStatus = stringField(args, "workerStatus") as
          | "completed"
          | "failed"
          | "cancelled"
          | "expired";
        const event = controller.report(stringField(args, "attemptId"), {
          workerStatus,
          summary: stringField(args, "summary"),
          changedFiles: stringArray(args, "changedFiles"),
          producedArtifacts: stringArray(args, "producedArtifacts"),
          resultCommit: optionalString(args, "resultCommit") ?? undefined,
        });
        return { attemptId: event.entity_id, eventType: event.event_type };
      },
    }),

    tool({
      name: "palimpsest_gate",
      description:
        "Run one deterministic gate on an attempt and record the evidence atom; with a gateId, also evaluate that registered gate and report the verdict plus missing evidence",
      properties: {
        attemptId: { type: "string" },
        predicate: {
          type: "string",
          enum: [
            "process_exit_zero",
            "tests_pass",
            "tests_fail",
            "lint_pass",
            "expected_files_exist",
            "write_scope_valid",
          ],
        },
        command: { type: "array", items: { type: "string" } },
        exitCode: { type: "number" },
        gateId: { type: "string" },
      },
      required: ["attemptId"],
      execute: async (args) => {
        const attemptId = stringField(args, "attemptId");
        const gateId = optionalString(args, "gateId");
        const exitCode = args.exitCode;
        const command = stringArray(args, "command") ?? [];
        const predicate = optionalString(args, "predicate") as
          | "process_exit_zero"
          | "tests_pass"
          | "tests_fail"
          | "lint_pass"
          | "expected_files_exist"
          | "write_scope_valid"
          | undefined;
        let result: Record<string, unknown> = {};
        if (predicate !== undefined) {
          if (typeof exitCode !== "number" || !Number.isInteger(exitCode)) {
            throw new TypeError("exitCode must be an integer");
          }
          if (command.length === 0) throw new TypeError("command must be non-empty");
          const event = await controller.gate({
            attemptId,
            predicate,
            command,
            exitCode,
          });
          const evidence = event.payload.evidence as { evidence_id: string; status: string };
          result = { evidenceId: evidence.evidence_id, status: evidence.status };
        }
        if (gateId !== undefined) {
          const verdict = controller.evaluateGate(gateId, "attempt", attemptId);
          result = { ...result, gateVerdict: verdict.verdict, nextEvidenceNeeded: verdict.next_evidence_needed };
        }
        return result;
      },
    }),

    tool({
      name: "palimpsest_status",
      description: "Human-readable project status: revision, scheduler, tasks, attempts, evidence, promotions",
      properties: {},
      required: [],
      execute: () => controller.status(),
    }),
  ];
}
