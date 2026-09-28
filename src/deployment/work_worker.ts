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

import type { WorkWorkerAttemptContext, WorkWorkerTaskContext } from "../context/service.js";


/**
 * R1-L §18 — ONE worker-context contract, not two silently divergent ones.
 *
 * These are the CONTEXT OWNER's own types (L2), re-exported rather than re-declared. Before R1-L this
 * module carried its own copy of `WorkWorkerTaskContext`, the controller carried a third, and the
 * interaction port hid the difference behind `context: unknown` — while the RUNTIME already delivered
 * the nested `{work, compiled}` shape. The host's `context.work ?? context` was the visible symptom of
 * that drift: a lenient reader papering over a type that did not describe what actually arrived.
 *
 * The direction is L5 → L2, which the layer model allows, and the context owner imports nothing from
 * here, so this is not a cycle.
 */
export type { WorkWorkerAttemptContext, WorkWorkerTaskContext } from "../context/service.js";

/** The ONE host-private tool a worker answers through. Deliberately NOT the branch result tool. */
export const WORK_WORKER_RESULT_TOOL_NAME = "palimpsest_worker_result";

/**
 * R1-L §7/§13: the worker-private CONTEXT PULL tool.
 *
 * R1 measured that a selected knowledge handle reached the worker PROCESS PAYLOAD and was then dropped:
 * the model never saw the index, and because every inherited `palimpsest_*` tool is denied to a worker,
 * it had no tool with which to pull a body. The three R1 conditions therefore produced byte-identical
 * model-visible prompts and the primary experiment could not be formed. This tool is the missing mile.
 *
 * It is registered for EVERY worker, including one whose attempt selected no capital (§7), so the R1
 * conditions differ only in the attempt's own visible index and resolvable handles — never in the tool
 * catalogue. It is READ-ONLY, worker-local, noncanonical, and grants no mutation capability.
 */
export const WORK_WORKER_CONTEXT_PULL_TOOL_NAME = "palimpsest_worker_context_pull";

/**
 * R1-L §11: the ONE channel name for the parent↔child pull transport, and the closed response
 * vocabulary. Single constants so the two processes cannot disagree about the protocol string.
 */
export const WORK_WORKER_CONTEXT_CHANNEL = "palimpsest-worker-context-v1";

/** §11: a pull response is exactly one of these. `refused` is distinct from `not_found` on purpose. */
export const WORKER_PULL_STATUSES = ["resolved", "not_found", "refused", "error"] as const;
export type WorkerPullStatus = (typeof WORKER_PULL_STATUSES)[number];

/** §11: what the child sends. Carries the handle and NOTHING else — no attempt, no project, no ref. */
export interface WorkerPullRequest {
  readonly channel: typeof WORK_WORKER_CONTEXT_CHANNEL;
  readonly kind: "pull";
  readonly requestId: string;
  readonly handle: string;
}

/** §11: what the parent answers. `value` is the canonical fetch result, verbatim and unflattened. */
export interface WorkerPullResponse {
  readonly channel: typeof WORK_WORKER_CONTEXT_CHANNEL;
  readonly kind: "pull-result";
  readonly requestId: string;
  readonly status: WorkerPullStatus;
  readonly value?: unknown;
  readonly detail?: string;
}

/** §8: the ONE accepted request shape. `additionalProperties: false` is the schema-level half of this. */
export function workWorkerPullRequestSchemaOk(raw: unknown): raw is { readonly handle: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return false;
  const keys = Object.keys(raw);
  if (keys.length !== 1 || keys[0] !== "handle") return false;
  const handle = (raw as { readonly handle?: unknown }).handle;
  return typeof handle === "string" && handle.length > 0;
}

/**
 * §11: parse the IPC ENVELOPE strictly.
 *
 * The envelope is a different shape from the tool arguments, and both are closed: the arguments admit
 * exactly `{handle}`, and the envelope admits exactly `{channel, kind, requestId, handle}`. A message
 * that does not match EXACTLY is not ours — it is dropped rather than coerced, because a lenient parser
 * on the transport is how a "pull" quietly becomes something else.
 */
export function parseWorkerPullEnvelope(
  raw: unknown,
): { readonly requestId: string; readonly handle: string } | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== 4 || keys.join(",") !== "channel,handle,kind,requestId") return undefined;
  if (record.channel !== WORK_WORKER_CONTEXT_CHANNEL || record.kind !== "pull") return undefined;
  const { requestId, handle } = record;
  if (typeof requestId !== "string" || requestId.length === 0) return undefined;
  if (typeof handle !== "string" || handle.length === 0) return undefined;
  return Object.freeze({ requestId, handle });
}

/**
 * §8/§9: THE ATTEMPT-BOUND ALLOWLIST.
 *
 * Derived from the attempt's OWN compiled handles, so the pull can never become a global asset lookup:
 * a valid handle from another attempt, from another project, a fabricated handle, and any generic
 * `@ctx/knowledge/*` namespace are all simply "not in this set". There is no fallback path by design.
 */
export function workerPullHandleAllowed(compiledHandles: readonly { readonly handle: string }[], handle: string): boolean {
  for (const entry of compiledHandles) {
    if (entry.handle === handle) return true;
  }
  return false;
}

/**
 * §8/§13: the worker-private pull tool's definition. The schema admits `handle` and nothing else, so the
 * model cannot name an attempt, a project, a claim, a cell, a procedure, a path or an owner — the handle
 * IS the entire request identity, and the parent binds it to the attempt the host already owns.
 */
export interface WorkWorkerContextPullToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  /** §13: the worker-private tools are read-only. A pull reads; it never writes and never settles. */
  readonly mode: "read-only";
}

export function workWorkerContextPullToolDefinition(): WorkWorkerContextPullToolDefinition {
  return Object.freeze({
    name: WORK_WORKER_CONTEXT_PULL_TOOL_NAME,
    description:
      "READ PROJECT CONTEXT: fetch the canonical body behind ONE handle listed in the 'Project context available to this attempt' section. " +
      "Pass exactly one listed handle and nothing else — a handle that was not listed for THIS attempt is refused, and no other argument exists. " +
      "The result is READ-ONLY background: it is never authority, it cannot change what settlement accepts, and it cannot widen your write scope or your allowed commands.",
    parameters: Object.freeze({
      type: "object",
      properties: Object.freeze({
        handle: {
          type: "string",
          description: "exactly one handle from this attempt's own context index, e.g. @ctx/procedure/<id>/<revision>",
        },
      }),
      required: ["handle"],
      additionalProperties: false,
    }),
    mode: "read-only",
  });
}

/** Machine-readable line the worker process must print as its final output. */
export const WORK_WORKER_RESULT_PREFIX = "PALIMPSEST_WORK_RESULT ";

/** §17: the noncanonical telemetry prefix reporting which handles a worker actually pulled. */
export const WORK_WORKER_PULL_PREFIX = "PALIMPSEST_WORKER_PULL ";

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
 *
 * The type itself is the CONTEXT OWNER's (`../context/service.js`) and is re-exported below rather than
 * re-declared — see §18 there. A second, structurally-identical copy is exactly the drift R1-L removes.
 */

export interface WorkWorkerExecutionInput {
  /** The prepared execution world: the worktree D2-b created, and the worker's whole filesystem world. */
  readonly workDir: string;
  /**
   * THIS attempt's delivered context: the task half plus the attempt's own compiled half (its boot
   * references and its pull handles). Typed as the context owner's shape because that is what the
   * standard delegation path actually passes — a worker port that claims the flat task shape would be
   * describing something the product does not send.
   */
  readonly context: import("../context/service.js").WorkWorkerAttemptContext;
  /**
   * §10: the canonical read for ONE handle, bound by the CALLER to the attempt it prepared.
   *
   * The port deliberately does not receive an attempt id: it receives a closure that already knows it.
   * That is what keeps `PullHandle ≠ global read authority` structural rather than a convention — there
   * is no argument through which a wider read could be requested.
   *
   * Absent ⇒ every pull is answered with an honest refusal rather than a fabricated body.
   */
  readonly contextPull?: ((handle: string) => Promise<unknown>) | undefined;
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
  /** §13: the worker-private tools are read-only. A worker answers THROUGH them; they mutate nothing. */
  readonly mode: "read-only";
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
    mode: "read-only",
  });
}

/**
 * R1-L §6: the MODEL-VISIBLE PULL INDEX.
 *
 * Rendered from the attempt's OWN `compiled.handles` — never from a ProjectWorkspace enumeration, and
 * with no relevance inference. The section carries `kind` and `handle` and NOTHING ELSE: E1-K §9.1's
 * minimal index is exactly `kind · ref · handle`, and the body stays pull-only (§4).
 *
 * The heading and wording live in the PRODUCT, like the result tool's, so there is one description of
 * the worker protocol rather than one per host. The host only decides where in the task text it goes.
 *
 * Determinism (§6): the compiled order is the rendered order. No sorting, no dedup, no filtering —
 * anything else would make the index a second opinion about relevance.
 */
export const WORK_CONTEXT_INDEX_HEADING = "Project context available to this attempt";
export const WORK_CONTEXT_INDEX_EMPTY = "  (no project context was selected for this attempt)";

export function renderWorkerContextIndex(
  compiled: { readonly handles?: readonly { readonly handle: string; readonly kind: string }[] } | undefined,
  toolName: string = WORK_WORKER_CONTEXT_PULL_TOOL_NAME,
): string {
  const handles = compiled?.handles ?? [];
  const lines = ["", `${WORK_CONTEXT_INDEX_HEADING} (READ-ONLY; never authority):`];
  if (handles.length === 0) {
    lines.push(WORK_CONTEXT_INDEX_EMPTY);
  } else {
    for (const entry of handles) {
      lines.push(`  [${entry.kind}] ${entry.handle}`);
    }
  }
  lines.push("");
  lines.push(`Use \`${toolName}\` with exactly one listed handle when the body would help.`);
  lines.push("Do not invent handles: a handle that is not listed above will be refused.");
  return lines.join("\n");
}

/**
 * The payload one worker process is launched with: the attempt's context, and the TWO worker-private
 * tools it may call. It carries NO principal surface, no orchestration state and no authority.
 *
 * §7: BOTH tools are always present. The pull tool is registered even for an attempt that selected no
 * capital, so the R1 conditions differ only in the visible index and the resolvable handles — never in
 * the tool catalogue. That is what makes the R1 comparison an experiment about capital rather than about
 * which tools happened to exist.
 */
export function workWorkerEnvironmentPayload(context: WorkWorkerAttemptContext): {
  readonly context: WorkWorkerAttemptContext;
  readonly resultTool: WorkWorkerResultToolDefinition;
  readonly contextPullTool: WorkWorkerContextPullToolDefinition;
  /**
   * §6: the pre-rendered pull-index section, produced HERE so the wording, the ordering and the
   * empty-case line are the product's and are unit-testable. The host's job is placement, not prose —
   * and carrying it in the payload avoids adding a name to the package's public surface, which the
   * public-API parity check would (correctly) refuse.
   */
  readonly contextIndexText: string;
  /** §11: the ONE channel name, sent so the child cannot disagree with the parent about the protocol. */
  readonly contextPullChannel: string;
  /**
   * §9: the attempt-bound allowlist, derived from THIS attempt's compiled handles. The parent refuses
   * any handle outside it; the list is sent so the child can also refuse locally without a round trip.
   */
  readonly allowedPullHandles: readonly string[];
  /** The Palimpsest tool-name prefix a worker must not inherit (enumerated by the host at run time). */
  readonly deniedAuthorityPrefix: string;
} {
  const handles = context.compiled?.handles ?? [];
  return Object.freeze({
    context,
    resultTool: workWorkerResultToolDefinition(),
    contextPullTool: workWorkerContextPullToolDefinition(),
    contextIndexText: renderWorkerTaskText(context),
    contextPullChannel: WORK_WORKER_CONTEXT_CHANNEL,
    allowedPullHandles: Object.freeze(handles.map((entry: { readonly handle: string }) => entry.handle)),
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
  /** §11: bounded per-request budget for ONE context pull; independent of the worker's wall clock. */
  readonly pullTimeoutMs?: number;
  /** Node executable; defaults to the current process executable. */
  readonly nodeExecPath?: string;
}

function hostFailure(detail: string): WorkWorkerExecutionOutcome {
  return Object.freeze({ kind: "HOST_FAILURE" as const, detail });
}

/**
 * R1-L §6: the task text a worker receives, with the pull index appended.
 *
 * This is the PRODUCT's rendering of the worker protocol. The host decides WHERE the index goes in its
 * own prompt; this function produces the index section itself, so the wording, the ordering and the
 * empty-case line are testable without a DSH runtime — which is the only way §3's regression can be
 * pinned deterministically, since the runner imports `@deepseek-ai/dsh-*` at module scope.
 */
export function renderWorkerTaskText(
  context: WorkWorkerAttemptContext,
  toolName: string = WORK_WORKER_CONTEXT_PULL_TOOL_NAME,
): string {
  return renderWorkerContextIndex(context.compiled, toolName);
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
 * §17: the handles a worker actually pulled, read from its OWN telemetry line.
 *
 * The telemetry carries HANDLES ONLY — never a body — so R1 can answer "did the stochastic worker use
 * the capital?" mechanically, without persisting any model reasoning.
 */
export function parseWorkerPullLine(stdout: string): readonly string[] {
  for (let index = stdout.split(/\r?\n/u).length - 1; index >= 0; index -= 1) {
    const line = stdout.split(/\r?\n/u)[index];
    if (line === undefined || !line.startsWith(WORK_WORKER_PULL_PREFIX)) continue;
    try {
      const parsed: unknown = JSON.parse(line.slice(WORK_WORKER_PULL_PREFIX.length));
      if (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { readonly pulled?: unknown }).pulled)) {
        return Object.freeze(((parsed as { readonly pulled: readonly unknown[] }).pulled).filter((entry): entry is string => typeof entry === "string"));
      }
    } catch {
      /* a malformed telemetry line is not evidence; keep scanning */
    }
  }
  return Object.freeze([]);
}

/**
 * §10: the PARENT-SIDE canonical resolver. This is the ONLY way a body is read, and it is bound to the
 * attempt the host already owns — the model never receives an attempt id, so it cannot choose one.
 *
 * `PullHandle ≠ global read authority`: the resolver is handed a handle the attempt's own manifest
 * bound, and refuses everything else.
 */
export interface WorkWorkerContextPullResolverInput {
  /** §9: the attempt-bound allowlist. A handle outside it is refused without touching any owner. */
  readonly allowedHandles: readonly string[];
  /**
   * The canonical read. The port supplies the attempt internally; the caller never sees it, and the
   * model certainly does not. Returning `undefined` means "this manifest has no such binding".
   */
  readonly fetch: (handle: string) => Promise<unknown>;
}

/**
 * §11: the parent's answer to one pull request.
 *
 * `refused` and `not_found` are deliberately different: "you may not ask that" is not the same fact as
 * "the owner no longer has it", and collapsing them would hide a boundary breach inside a lookup miss.
 */
export async function resolveWorkerPullRequest(
  resolver: WorkWorkerContextPullResolverInput,
  rawEnvelope: unknown,
): Promise<WorkerPullResponse> {
  const requestId = (() => {
    if (typeof rawEnvelope === "object" && rawEnvelope !== null) {
      const candidate = (rawEnvelope as { readonly requestId?: unknown }).requestId;
      if (typeof candidate === "string") return candidate;
    }
    return "unknown";
  })();
  const envelope = parseWorkerPullEnvelope(rawEnvelope);
  if (envelope === undefined) {
    // §21 L-N09: a malformed message can never produce a body, and it is reported as such.
    return Object.freeze({ channel: WORK_WORKER_CONTEXT_CHANNEL, kind: "pull-result", requestId, status: "error", detail: "malformed pull request" });
  }
  if (!workerPullHandleAllowed(resolver.allowedHandles.map((handle) => ({ handle })), envelope.handle)) {
    // §9: no fallback to a global asset lookup, and no hint about what does exist.
    return Object.freeze({
      channel: WORK_WORKER_CONTEXT_CHANNEL,
      kind: "pull-result",
      requestId: envelope.requestId,
      status: "refused",
      detail: "that handle is not part of this attempt's compiled context",
    });
  }
  try {
    const value = await resolver.fetch(envelope.handle);
    if (value === undefined) {
      return Object.freeze({ channel: WORK_WORKER_CONTEXT_CHANNEL, kind: "pull-result", requestId: envelope.requestId, status: "not_found", detail: "the bound owner no longer resolves this handle" });
    }
    return Object.freeze({ channel: WORK_WORKER_CONTEXT_CHANNEL, kind: "pull-result", requestId: envelope.requestId, status: "resolved", value });
  } catch (error) {
    return Object.freeze({
      channel: WORK_WORKER_CONTEXT_CHANNEL,
      kind: "pull-result",
      requestId: envelope.requestId,
      status: "error",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Run ONE worker as an EPHEMERAL DSH process whose working directory is the prepared execution world.
 *
 * §11: the child is spawned with ONE extra IPC channel (`stdio[3]`), which is the parent's only way to
 * answer a pull. The channel is a capability of THIS process: it dies with the worker (§21 L-P15), and
 * the child can reach nothing else — no HTTP port, no shared database, no controller reference.
 *
 * The port NEVER fabricates an outcome: a timeout, a spawn failure, a crash and a silent worker are all
 * `HOST_FAILURE`, which is a statement about a process rather than about the work.
 */
export function dshSubprocessWorkWorkerPort(input: DshSubprocessWorkWorkerPortInput): WorkWorkerExecutionPort {
  const timeoutMs = input.timeoutMs ?? 1_800_000;
  const nodeExecPath = input.nodeExecPath ?? process.execPath;
  /** §11: bounded per-request budget for one pull, independent of the worker's own wall clock. */
  const pullTimeoutMs = input.pullTimeoutMs ?? 15_000;
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
      const allowedHandles = (runInput.context.compiled?.handles ?? []).map((entry) => entry.handle);
      /** §17: the handles this worker actually pulled, for the noncanonical telemetry line. */
      const pulledHandles: string[] = [];

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
            // §11: `stdio[3]` is the pull channel. `ipc` on a `spawn` gives the child exactly one
            // `process.send`/`process.on('message')` pair and nothing else — no port, no socket file,
            // no shared store. The DSH host itself uses no Node IPC (verified), so this does not
            // collide with its own transports.
            stdio: ["ignore", "pipe", "pipe", "ipc"],
          });

          /**
           * §10/§11: answer a pull by delegating to the caller's canonical resolver. The port supplies
           * the ATTEMPT internally — `runInput` closed over it — so the model never sees it.
           *
           * `pullSeen` records the handles actually pulled, for §17 telemetry.
           */
          const pending = new Map<string, NodeJS.Timeout>();
          spawned.on("message", (message: unknown) => {
            const envelope = parseWorkerPullEnvelope(message);
            if (envelope === undefined) return;
            const resolver = runInput.contextPull;
            if (resolver === undefined) {
              // A worker that asks for context when the host composed no resolver gets an honest
              // refusal, never a fabricated body.
              safeSend({ channel: WORK_WORKER_CONTEXT_CHANNEL, kind: "pull-result", requestId: envelope.requestId, status: "error", detail: "this host composed no context resolver" });
              return;
            }
            const timeout = setTimeout(() => {
              pending.delete(envelope.requestId);
              safeSend({ channel: WORK_WORKER_CONTEXT_CHANNEL, kind: "pull-result", requestId: envelope.requestId, status: "error", detail: `the context pull exceeded ${String(pullTimeoutMs)}ms` });
            }, pullTimeoutMs);
            pending.set(envelope.requestId, timeout);
            void resolveWorkerPullRequest(
              {
                allowedHandles,
                fetch: async (handle) => await resolver(handle),
              },
              message,
            ).then(
              (response) => {
                const held = pending.get(envelope.requestId);
                if (held !== undefined) {
                  clearTimeout(held);
                  pending.delete(envelope.requestId);
                }
                if (response.status === "resolved") pulledHandles.push(envelope.handle);
                safeSend(response);
              },
              (error: unknown) => {
                const held = pending.get(envelope.requestId);
                if (held !== undefined) {
                  clearTimeout(held);
                  pending.delete(envelope.requestId);
                }
                safeSend({ channel: WORK_WORKER_CONTEXT_CHANNEL, kind: "pull-result", requestId: envelope.requestId, status: "error", detail: error instanceof Error ? error.message : String(error) });
              },
            );
          });

          function safeSend(response: WorkerPullResponse): void {
            try {
              spawned.send?.(response);
            } catch {
              /* the worker may have exited between its request and our answer */
            }
          }

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
            // §11: the pull capability dies with the worker process. Every in-flight request is
            // abandoned here rather than left to resolve against a child that no longer exists.
            for (const timeout of pending.values()) clearTimeout(timeout);
            pending.clear();
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
