/**
 * PLMP-LEAN-1 §D2-c — the WORK WORKER RUNTIME: a capable engineering agent inside the execution world
 * D2-b prepared, exporting only a NON-AUTHORITATIVE outcome.
 *
 *     Give the Worker a powerful execution world, not powerful authority.
 *
 * Three separations hold this module together, and each one has a failure mode it prevents:
 *
 *   `Worker outcome != Work fact`
 *     A worker can say READY_FOR_SETTLEMENT and it is still only TESTIMONY. It never says COMPLETED,
 *     because an attempt's terminal state belongs to the Work owner, and a model deciding "now a
 *     canonical terminal fact may exist" is exactly the executor/owner confusion this slice exists to
 *     prevent. D2-e settles; D2-c only runs.
 *
 *   `Worker experiment != Work Evidence`
 *     The worker may run `npm test` and see it pass; that produces NO `EvidenceAtom`. Which command
 *     results become managed completion evidence is decided by `TaskEnvelope.allowed_commands` and the
 *     product's own completion machinery — `allowed_commands` is NOT a shell ACL for the worker.
 *
 *   `Host worker stopped != canonical Work terminal`
 *     A timeout, a model failure or a PTC failure is `HOST_FAILURE`: a host fact about a process. It
 *     never becomes `ATTEMPT_FAILED` here, and an escalation leaves the attempt RUNNING. D2-d composes
 *     host job state on top; D2-e decides what the ledger does about it.
 *
 * The worker's capability set is deliberately NOT a hand-maintained allowlist. It inherits the host's
 * normal engineering tools and DENIES the inherited Palimpsest semantic surface, so a coding tool DSH
 * adds later is available to workers automatically, and a new `palimpsest_*` authority tool is NOT.
 *
 *     capability-open  +  authority-closed
 *
 * The tool set is enumerated from the scope's own visible schemas rather than hard-coded, because
 * `restrict()` refuses unknown names: a static deny list would break the moment a deployment composes
 * a different Palimpsest surface.
 *
 * Host/deployment packaging (`src/deployment/**`): it imports the tool contract and nothing semantic.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";


/** The ONE host-private tool a worker answers through. Deliberately NOT the branch result tool. */
export const WORK_WORKER_RESULT_TOOL_NAME = "palimpsest_worker_result";

/** Machine-readable line the worker process must print as its final output. */
export const WORK_WORKER_RESULT_PREFIX = "PALIMPSEST_WORK_RESULT ";

/**
 * What a worker is allowed to SAY. Note what is absent: no `COMPLETED`, and no way to assert a changed
 * file, a result commit, a passing test, an evidence id, a gate, a verification or a promotion. Those
 * are observations the product makes for itself.
 */
export const WORK_WORKER_OUTCOME_KINDS = ["READY_FOR_SETTLEMENT", "NEEDS_ESCALATION"] as const;
export type WorkWorkerOutcomeKind = (typeof WORK_WORKER_OUTCOME_KINDS)[number];

export interface WorkWorkerOutcome {
  readonly kind: WorkWorkerOutcomeKind;
  readonly summary: string;
  /** Escalation only: why the worker cannot proceed inside its own authority. */
  readonly reason?: string | undefined;
  /** Escalation only: what it would propose instead. Proposing is not authorizing. */
  readonly proposedAction?: string | undefined;
}

/** The port's result: a worker outcome, or the honest host fact that no outcome was produced. */
export type WorkWorkerExecutionOutcome =
  | WorkWorkerOutcome
  | { readonly kind: "HOST_FAILURE"; readonly detail: string; readonly presentation?: string | undefined };

export type WorkWorkerResultParse =
  | { readonly ok: true; readonly outcome: WorkWorkerOutcome }
  | { readonly ok: false; readonly detail: string };

/**
 * The canonical, task-sufficient context a worker receives.
 *
 * Enough to work with, and deliberately nothing more:
 *
 *   included   the project's goal, requirements and decisions, the task's objective, the write scope
 *              and required artifacts, the base commit, a plain-language completion summary, whether
 *              independent verification will be required;
 *   excluded   the principal's conversation or scratchpad, the scheduler's sequence, the attempt id,
 *              gate ids, lease state — orchestration state is not a worker's business, and a worker
 *              that knows its attempt id is one step from believing it may settle it.
 *
 * `Context isolation != Context starvation`: the worker gets the task, not the transcript.
 */
export interface WorkWorkerTaskContext {
  readonly projectGoal: string;
  readonly requirements: readonly string[];
  readonly decisions: readonly string[];
  readonly objective: string;
  readonly writeScope: readonly string[];
  readonly requiredArtifacts: readonly string[];
  readonly baseCommit: string;
  readonly completionChecks: readonly string[];
  readonly independentVerificationRequired: boolean;
}

export interface WorkWorkerExecutionInput {
  /** The prepared execution world: the worktree D2-b created, and the worker's whole filesystem world. */
  readonly workDir: string;
  readonly context: WorkWorkerTaskContext;
  readonly signal?: AbortSignal | undefined;
}

/**
 * The host-neutral seam. BLOCKING on purpose for D2-c: `run` may drive a real agent for minutes, but
 * the caller awaits it. D2-d turns this into `start() → completion` with a host-local job map, exactly
 * as D1 did for branches — the slicing order that worked there.
 */
export interface WorkWorkerExecutionPort {
  readonly adapterId: string;
  run(input: WorkWorkerExecutionInput): Promise<WorkWorkerExecutionOutcome>;
}

export class WorkWorkerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkWorkerError";
  }
}

/* ------------------------------------------------------------------ *
 * The ONE tool a worker answers through
 * ------------------------------------------------------------------ */

/**
 * The tool DEFINITION a worker process registers, as DATA.
 *
 * The worker runs in its own process, and the host bundle reaches Palimpsest only through its entry
 * module — so the environment crosses the boundary the same way the context does, as a serialized
 * description, and the host's job is to register it and print what comes back. That is what keeps the
 * outcome vocabulary in ONE place: the enum below IS `WORK_WORKER_OUTCOME_KINDS`, generated here, not a
 * second list maintained in JavaScript.
 *
 * The host's own part is deliberately trivial (register; keep the first report). Every rule that could
 * be gotten wrong — which kinds exist, which arguments are allowed, that an escalation must carry a
 * reason — is enforced when the reported payload comes BACK, in `parseWorkWorkerResult`, on this side
 * of the boundary. A worker that reports something else gets `HOST_FAILURE`, not a lenient reading.
 */
/**
 * The STRICT reading of what a worker reported. This is where every rule about an outcome is enforced,
 * on the way back IN: which kinds exist, which arguments are allowed, that a summary is present, and
 * that an escalation carries a reason. A host that registers the tool leniently therefore cannot widen
 * the vocabulary — whatever it forwards is re-read here, and anything else is `HOST_FAILURE`.
 */
export function parseWorkWorkerResult(raw: unknown): WorkWorkerResultParse {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, detail: "worker result arguments must be an object" };
  }
  const object = raw as Record<string, unknown>;
  for (const key of Object.keys(object)) {
    if (key !== "kind" && key !== "summary" && key !== "reason" && key !== "proposedAction") {
      return { ok: false, detail: `worker result has unknown argument "${key}"` };
    }
  }
  const kind = object.kind;
  if (kind !== "READY_FOR_SETTLEMENT" && kind !== "NEEDS_ESCALATION") {
    return {
      ok: false,
      detail: `worker result kind must be one of ${WORK_WORKER_OUTCOME_KINDS.join(", ")} — a worker reports what it did or what it needs, never that the work IS complete`,
    };
  }
  const summary = object.summary;
  if (typeof summary !== "string" || summary.trim() === "") {
    return { ok: false, detail: "worker result requires a non-empty summary" };
  }
  const optional = (value: unknown, what: string): { readonly value?: string; readonly detail?: string } => {
    if (value === undefined) return {};
    if (typeof value !== "string" || value.trim() === "") return { detail: `worker result ${what} must be a non-empty string when given` };
    return { value };
  };
  const reason = optional(object.reason, "reason");
  if (reason.detail !== undefined) return { ok: false, detail: reason.detail };
  const proposedAction = optional(object.proposedAction, "proposedAction");
  if (proposedAction.detail !== undefined) return { ok: false, detail: proposedAction.detail };
  if (kind === "NEEDS_ESCALATION" && reason.value === undefined) {
    return { ok: false, detail: "an escalation must state WHY the worker cannot proceed (reason) — the principal has to be able to act on it" };
  }
  return {
    ok: true,
    outcome: Object.freeze({
      kind,
      summary,
      ...(reason.value === undefined ? {} : { reason: reason.value }),
      ...(proposedAction.value === undefined ? {} : { proposedAction: proposedAction.value }),
    }),
  };
}

export interface WorkWorkerResultToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

export function workWorkerResultToolDefinition(): WorkWorkerResultToolDefinition {
  return Object.freeze({
    name: WORK_WORKER_RESULT_TOOL_NAME,
    description:
      "REPORT YOUR WORKER OUTCOME: call this ONCE when you are done working in this execution world. " +
      "READY_FOR_SETTLEMENT means you believe the work is done and you have committed what you want delivered — it is a REPORT, not a completion: the product observes the tree itself and decides what happens next, so do not claim files, commits, tests, evidence or verification results here. " +
      "NEEDS_ESCALATION means the task as defined cannot be finished inside your authority (the write scope is too narrow, the task is wrong, a person must decide, or an irreversible external action is needed) — say why, and optionally what you would propose instead; proposing is not authorizing.",
    parameters: Object.freeze({
      type: "object",
      properties: Object.freeze({
        kind: {
          type: "string",
          enum: [...WORK_WORKER_OUTCOME_KINDS],
          description: "READY_FOR_SETTLEMENT | NEEDS_ESCALATION",
        },
        summary: { type: "string", description: "what you did (or what you need), in one or two sentences" },
        reason: { type: "string", description: "NEEDS_ESCALATION only: why the work cannot be finished as defined" },
        proposedAction: { type: "string", description: "NEEDS_ESCALATION only: what you would propose instead" },
      }),
      required: ["kind", "summary"],
      additionalProperties: false,
    }),
  });
}

/**
 * The payload one worker process is launched with: the canonical task context, and the ONE tool it
 * answers through. It carries NO principal surface, no orchestration state and no authority.
 */
export function workWorkerEnvironmentPayload(context: WorkWorkerTaskContext): {
  readonly context: WorkWorkerTaskContext;
  readonly resultTool: WorkWorkerResultToolDefinition;
  /** The Palimpsest tool-name prefix a worker must not inherit (enumerated by the host at run time). */
  readonly deniedAuthorityPrefix: string;
} {
  return Object.freeze({
    context,
    resultTool: workWorkerResultToolDefinition(),
    deniedAuthorityPrefix: "palimpsest_",
  });
}

/* ------------------------------------------------------------------ *
 * The first-party port: a real worker process in the prepared world
 * ------------------------------------------------------------------ */

export interface DshSubprocessWorkWorkerPortInput {
  /** Absolute path to the DSH bin (`.../@deepseek-ai/dsh/lib/bin.js`). */
  readonly dshBin: string;
  /** DSH profile name (resolved under `$DSH_HOME/profiles`). */
  readonly profile: string;
  /** Hard wall-clock budget for one worker; exceeded ⇒ HOST_FAILURE. */
  readonly timeoutMs?: number;
  /** Node executable; defaults to the current process executable. */
  readonly nodeExecPath?: string;
}

function hostFailure(detail: string): WorkWorkerExecutionOutcome {
  return Object.freeze({ kind: "HOST_FAILURE" as const, detail });
}

function parseWorkerResultLine(stdout: string): WorkWorkerResultParse | undefined {
  const lines = stdout.split(/\r?\n/u);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line === undefined || !line.startsWith(WORK_WORKER_RESULT_PREFIX)) continue;
    try {
      const parsed: unknown = JSON.parse(line.slice(WORK_WORKER_RESULT_PREFIX.length));
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parseWorkWorkerResult(parsed);
      }
    } catch {
      // A malformed result line is not evidence of success; keep scanning older lines.
    }
  }
  return undefined;
}

/**
 * Run ONE worker as an EPHEMERAL DSH process whose working directory is the prepared execution world.
 *
 * The port NEVER fabricates an outcome: a timeout, a spawn failure, a crash and a silent worker are all
 * `HOST_FAILURE`, which is a statement about a process rather than about the work.
 */
export function dshSubprocessWorkWorkerPort(input: DshSubprocessWorkWorkerPortInput): WorkWorkerExecutionPort {
  const timeoutMs = input.timeoutMs ?? 1_800_000;
  const nodeExecPath = input.nodeExecPath ?? process.execPath;
  return {
    adapterId: `dsh-subprocess-work-worker:${input.profile}`,
    async run(runInput): Promise<WorkWorkerExecutionOutcome> {
      if (runInput.signal?.aborted === true) return hostFailure("worker execution aborted by the caller before it started");

      let payloadJson: string;
      try {
        payloadJson = JSON.stringify(workWorkerEnvironmentPayload(runInput.context));
      } catch {
        return hostFailure("the worker environment is not JSON-serializable");
      }
      const dir = mkdtempSync(join(tmpdir(), "palimpsest-worker-"));
      const contextFile = join(dir, "worker-context.json");
      writeFileSync(contextFile, payloadJson, "utf8");

      try {
        return await new Promise<WorkWorkerExecutionOutcome>((resolve) => {
          let settled = false;
          let stdout = "";
          let stderr = "";
          const finish = (outcome: WorkWorkerExecutionOutcome): void => {
            if (settled) return;
            settled = true;
            if (timer !== undefined) clearTimeout(timer);
            runInput.signal?.removeEventListener("abort", onAbort);
            resolve(outcome);
          };

          const spawned = spawn(nodeExecPath, [input.dshBin, "--profile", input.profile, "--work", contextFile], {
            // The worker's WHOLE filesystem world is the prepared worktree. This is the one capability
            // condition D2-c insists on: freedom inside the world, not freedom to leave it.
            cwd: runInput.workDir,
            stdio: ["ignore", "pipe", "pipe"],
          });

          const onAbort = (): void => {
            try {
              spawned.kill();
            } catch {
              /* the process may already be gone */
            }
            finish(hostFailure("worker execution aborted by the caller"));
          };
          const timer = setTimeout(() => {
            try {
              spawned.kill();
            } catch {
              /* the process may already be gone */
            }
            finish(hostFailure(`the worker did not finish within ${String(timeoutMs)}ms`));
          }, timeoutMs);
          runInput.signal?.addEventListener("abort", onAbort, { once: true });

          spawned.stdout?.on("data", (chunk: Buffer | string) => {
            stdout += chunk.toString();
          });
          spawned.stderr?.on("data", (chunk: Buffer | string) => {
            stderr += chunk.toString();
          });
          spawned.on("error", (error: Error) => finish(hostFailure(`the worker host failed to start: ${error.message}`)));
          spawned.on("close", (code: number | null) => {
            const parsed = parseWorkerResultLine(stdout);
            if (parsed !== undefined && parsed.ok) {
              finish(parsed.outcome);
              return;
            }
            const tail = stderr.trim().split(/\r?\n/u).slice(-4).join(" | ");
            const why = parsed === undefined ? `exited ${String(code ?? "unknown")} without reporting an outcome` : `reported an unusable outcome: ${parsed.detail}`;
            finish(hostFailure(`the worker ${why}${tail === "" ? "" : `: ${tail}`}`));
          });
        });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}
