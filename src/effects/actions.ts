/**
 * Palimpsest effects: the five Safe Actions through which every external
 * side effect of the plugin executes, on the shared Ordarium ledger.
 *
 * Profile mapping (docs/01 §5):
 *   - worktree.create   idempotent(durable)  — same worktree id reuses the path
 *   - git.commit        reconcilable         — recover by querying the worktree
 *   - git.promote       reconcilable         — Promotion Crash A/B via reconcile
 *   - gate.command      readOnly             — re-runnable inside a worktree
 *   - worker.dispatch   guarded              — uncertain after dispatch, no blind retry
 *
 * Each action carries a hand-written JSON Schema and a minimal object
 * parser, staying host-neutral the way Ordarium's ActionSchema port intends.
 */

import {
  defineAction,
  effects,
  type JsonValue,
  type ReconcileResult,
} from "@ordarium/core";

import type { GitPort } from "./git_port.js";

interface JsonRecord {
  [key: string]: JsonValue;
}

export interface WorktreeCreateInput extends Record<string, JsonValue> {
  worktreeId: string;
  baseCommit: string;
}

export interface CommitInput extends Record<string, JsonValue> {
  worktreeId: string;
  message: string;
}

export interface PromoteInput extends Record<string, JsonValue> {
  promotionId: string;
  sourceCommit: string;
  expectedHeadCommit: string;
}

export interface GateCommandInput extends Record<string, JsonValue> {
  worktreeId: string;
  executable: string;
  argv: string[];
}

export interface DispatchInput extends Record<string, JsonValue> {
  workerId: string;
  taskId: string;
  attemptId: string;
  envelopeId: string;
}

function objectSchema(
  properties: Record<string, unknown>,
  required: readonly string[],
): Record<string, unknown> {
  return {
    type: "object",
    properties,
    required: [...required],
    additionalProperties: false,
  };
}

function stringFields(input: unknown, expected: readonly string[]): JsonRecord {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new TypeError("input must be an object");
  }
  const record = input as Record<string, unknown>;
  const result: JsonRecord = {};
  for (const key of expected) {
    if (typeof record[key] !== "string") {
      throw new TypeError(`${key} must be a string`);
    }
    result[key] = record[key];
  }
  return result;
}

export function defineEffects(git: GitPort) {
  const worktreeCreate = defineAction({
    name: "palimpsest.worktree.create",
    version: "1",
    description:
      "Create (or reuse) the isolated git worktree for one attempt at its base commit",
    input: {
      jsonSchema: objectSchema(
        { worktreeId: { type: "string" }, baseCommit: { type: "string" } },
        ["worktreeId", "baseCommit"],
      ) as Record<string, JsonValue>,
      parse: (input) =>
        stringFields(input, ["worktreeId", "baseCommit"]) as unknown as WorktreeCreateInput,
    },
    output: {
      jsonSchema: objectSchema({ worktreePath: { type: "string" } }, ["worktreePath"]) as Record<
        string,
        JsonValue
      >,
      parse: (input) =>
        stringFields(input, ["worktreePath"]) as unknown as { worktreePath: string },
    },
    effect: effects.idempotent(),
    async execute(input) {
      const result = await git.createWorktree({
        worktreeId: input.worktreeId,
        baseCommit: input.baseCommit,
      });
      return { worktreePath: result.worktreePath };
    },
  });

  const gitCommit = defineAction({
    name: "palimpsest.git.commit",
    version: "1",
    description: "Commit the current state of one worktree",
    input: {
      jsonSchema: objectSchema(
        { worktreeId: { type: "string" }, message: { type: "string" } },
        ["worktreeId", "message"],
      ) as Record<string, JsonValue>,
      parse: (input) =>
        stringFields(input, ["worktreeId", "message"]) as unknown as CommitInput,
    },
    output: {
      jsonSchema: objectSchema({ commit: { type: "string" } }, ["commit"]) as Record<
        string,
        JsonValue
      >,
      parse: (input) =>
        stringFields(input, ["commit"]) as unknown as { commit: string },
    },
    effect: effects.reconcilable({ cancellable: false }),
    async execute(input) {
      const result = await git.commit({
        worktreeId: input.worktreeId,
        message: input.message,
      });
      return { commit: result.commit };
    },
    async reconcile(input): Promise<ReconcileResult<{ commit: string }>> {
      // The worktree is a private branch; in a real deploy a git query port
      // would surface it. Absence here means the commit did not land yet and
      // a retry is safe — the effect wraps the external system entirely.
      const committed = await git.contains(`commit:${input.worktreeId}`);
      if (committed) {
        return { status: "succeeded", value: { commit: `commit:${input.worktreeId}` } };
      }
      return { status: "absent", retrySafe: true };
    },
  });

  const gitPromote = defineAction({
    name: "palimpsest.git.promote",
    version: "1",
    description:
      "Apply an accepted attempt's source commit onto the expected canonical head",
    input: {
      jsonSchema: objectSchema(
        {
          promotionId: { type: "string" },
          sourceCommit: { type: "string" },
          expectedHeadCommit: { type: "string" },
        },
        ["promotionId", "sourceCommit", "expectedHeadCommit"],
      ) as Record<string, JsonValue>,
      parse: (input) =>
        stringFields(input, ["promotionId", "sourceCommit", "expectedHeadCommit"]) as unknown as PromoteInput,
    },
    output: {
      jsonSchema: objectSchema({ resultingHeadCommit: { type: "string" } }, [
        "resultingHeadCommit",
      ]) as Record<string, JsonValue>,
      parse: (input) =>
        stringFields(input, ["resultingHeadCommit"]) as unknown as {
          resultingHeadCommit: string;
        },
    },
    effect: effects.reconcilable({ cancellable: false }),
    async execute(input) {
      const result = await git.promote({
        promotionId: input.promotionId,
        sourceCommit: input.sourceCommit,
        expectedHeadCommit: input.expectedHeadCommit,
      });
      return { resultingHeadCommit: result.resultingHeadCommit };
    },
    async reconcile(input): Promise<
      ReconcileResult<{ resultingHeadCommit: string }>
    > {
      const head = await git.head();
      const applied = await git.contains(input.sourceCommit);
      if (applied) {
        // Crash B: the merge landed before the ledger recorded success. Report
        // the true outcome using the authoritative current head.
        return { status: "succeeded", value: { resultingHeadCommit: head } };
      }
      if (head === input.expectedHeadCommit) {
        // Crash A: nothing was merged yet; the promote may be retried safely.
        return { status: "absent", retrySafe: true };
      }
      return { status: "unknown" };
    },
  });

  const gateCommand = defineAction({
    name: "palimpsest.gate.command",
    version: "1",
    description: "Run one deterministic gate command inside an attempt worktree",
    input: {
      jsonSchema: objectSchema(
        {
          worktreeId: { type: "string" },
          executable: { type: "string" },
          argv: { type: "array", items: { type: "string" } },
        },
        ["worktreeId", "executable", "argv"],
      ) as Record<string, JsonValue>,
      parse: (input) => {
        if (typeof input !== "object" || input === null || Array.isArray(input)) {
          throw new TypeError("input must be an object");
        }
        const record = input as Record<string, unknown>;
        const result: JsonRecord = {};
        for (const key of ["worktreeId", "executable"]) {
          if (typeof record[key] !== "string") {
            throw new TypeError(`${key} must be a string`);
          }
          result[key] = record[key];
        }
        if (!Array.isArray(record.argv)) {
          throw new TypeError("argv must be an array of strings");
        }
        result.argv = record.argv.map((item) => {
          if (typeof item !== "string") throw new TypeError("argv entries must be strings");
          return item;
        });
        return result as unknown as GateCommandInput;
      },
    },
    output: {
      jsonSchema: objectSchema({ exitCode: { type: "number" } }, ["exitCode"]) as Record<
        string,
        JsonValue
      >,
      parse: (input) => {
        if (typeof input !== "object" || input === null || Array.isArray(input)) {
          throw new TypeError("input must be an object");
        }
        const record = input as Record<string, unknown>;
        if (record.exitCode !== null && (typeof record.exitCode !== "number" || !Number.isInteger(record.exitCode))) {
          throw new TypeError("exitCode must be an integer or null");
        }
        return { exitCode: record.exitCode as number | null };
      },
    },
    effect: effects.readOnly(),
    async execute(input) {
      const result = await git.runGate({
        worktreeId: input.worktreeId,
        executable: input.executable,
        argv: input.argv,
      });
      return { exitCode: result.exitCode };
    },
  });

  const workerDispatch = defineAction({
    name: "palimpsest.worker.dispatch",
    version: "1",
    description:
      "Dispatch one attempted task to an external worker; outcome may stay uncertain",
    input: {
      jsonSchema: objectSchema(
        {
          workerId: { type: "string" },
          taskId: { type: "string" },
          attemptId: { type: "string" },
          envelopeId: { type: "string" },
        },
        ["workerId", "taskId", "attemptId", "envelopeId"],
      ) as Record<string, JsonValue>,
      parse: (input) =>
        stringFields(input, ["workerId", "taskId", "attemptId", "envelopeId"]) as unknown as DispatchInput,
    },
    output: {
      jsonSchema: objectSchema({ dispatched: { type: "boolean" } }, ["dispatched"]) as Record<
        string,
        JsonValue
      >,
      parse: (input) => {
        if (typeof input !== "object" || input === null || Array.isArray(input)) {
          throw new TypeError("input must be an object");
        }
        const record = input as Record<string, unknown>;
        if (typeof record.dispatched !== "boolean") {
          throw new TypeError("dispatched must be a boolean");
        }
        return { dispatched: record.dispatched };
      },
    },
    effect: effects.guarded(),
    async execute(input) {
      void input;
      // A real integration would POST to a worker provider. P1 asserts the
      // guarded contract: dispatch happens at most once per operation key and
      // an unknown outcome stays uncertain instead of being retried blindly.
      return { dispatched: true };
    },
  });

  return { worktreeCreate, gitCommit, gitPromote, gateCommand, workerDispatch };
}

export type PalimpsestEffects = ReturnType<typeof defineEffects>;
