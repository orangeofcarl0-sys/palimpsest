/**
 * G10-S Explore branch execution — the canonical HOST-NEUTRAL seam between the
 * descriptive recipe execution layer and a real external cognition host.
 *
 *   Execution ≠ Authority      Branch execution ≠ PeerRef ≠ PersistentPoint
 *
 * A branch execution is EPHEMERAL by construction:
 *
 *   - it creates NO PeerRef and NO PersistentPoint;
 *   - it opens NO durable principal/agent session and writes NO session-id file;
 *   - it owns NO admission authority: the host may ONLY read the frozen brief and
 *     submit structured candidates through the REAL ReasoningCell service
 *     (submit_candidate). It never verifies and never admits by itself — the
 *     ReasoningCell service performs verification and the SEPARATE epistemic
 *     admission on the caller's side.
 *
 * The port here is structurally compatible with the structural
 * `ReasoningBranchExecutionPort` declared by `src/recipes/execution.ts`; that
 * module must keep working without importing this one, so the shape (not the
 * module identity) is the contract.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The host-neutral branch execution port. `brief` is opaque on purpose: the
 * caller never inspects private reasoning and the host never inspects anything
 * but the frozen brief it is handed.
 */
/**
 * PLMP-LEAN-1 §C.12: one branch job's HANDLE. `completion` settles when the child finishes (or the
 * timeout/abort path fires); `cancel()` asks the child to stop without waiting for it.
 *
 * INTERNAL: exported from this module so in-repository consumers can import it directly, but NOT
 * re-exported by the reasoning-cell barrel, so it stays out of the package public API.
 */
export interface BranchExecutionJob {
  readonly completion: Promise<BranchExecutionResult>;
  cancel(): void;
}

/**
 * The ASYNC seam over the SAME cognition backend.
 *
 *   same cognition backend  ·  different interaction lifecycle
 *
 * `run` stays the blocking UX (`palimpsest_collaborate`); `start` returns immediately so a caller can
 * keep working (`palimpsest_delegate`). It EXTENDS `ReasoningBranchExecutionPort` rather than changing
 * it, so an existing implementation keeps working. INTERNAL, for the same reason as the job handle.
 */
export interface AsyncReasoningBranchExecutionPort extends ReasoningBranchExecutionPort {
  start(input: {
    readonly brief: unknown;
    readonly executionBudget?: unknown;
    readonly signal?: AbortSignal;
    readonly evidenceContext?: unknown;
  }): BranchExecutionJob;
}

export interface ReasoningBranchExecutionPort {
  readonly adapterId: string;
  run(input: {
    readonly brief: unknown;
    readonly executionBudget?: unknown;
    /** Cooperative cancellation; a cancelled branch is reported, never fabricated. */
    readonly signal?: AbortSignal;
    /**
     * EXPLICIT, selector-only evidence material for this branch (opaque to the
     * port). A branch may only cite evidence ids inside this context's allowlist.
     */
    readonly evidenceContext?: unknown;
  }): Promise<unknown>;
}

/**
 * The normalized outcome a caller can read from a branch execution. It is
 * permissive: the executor returns whatever the host actually produced, but
 * every host result is normalized into one of these three honest statuses.
 */
export interface BranchExecutionResult {
  readonly status: "completed" | "failed" | "timeout";
  readonly candidateCount: number;
  readonly detail: string;
  /** Evidence ids the branch actually cited (subset of the frozen allowlist). */
  readonly evidenceRefs: readonly string[];
}

/** Machine-readable line the DSH branch process must print as its final output. */
export const DSH_BRANCH_RESULT_PREFIX = "PALIMPSEST_BRANCH_RESULT ";

export interface DshSubprocessBranchExecutionPortInput {
  /** Absolute path to the DSH bin (`.../@deepseek-ai/dsh/lib/bin.js`). */
  readonly dshBin: string;
  /** DSH profile name (resolved under `$DSH_HOME/profiles`). */
  readonly profile: string;
  /** Working directory for the ephemeral host process. */
  readonly workDir: string;
  /** Hard wall-clock budget for one branch; exceeded ⇒ status "timeout". */
  readonly timeoutMs?: number;
  /** Node executable; defaults to the current process executable. */
  readonly nodeExecPath?: string;
}

/** A branch outcome enriched with the host's structured evidence when it had any. */
export interface DshBranchExecutionOutcome extends BranchExecutionResult {
  /** Present when the host reported the digest of the candidate it submitted. */
  readonly candidateDigest?: string;
  /**
   * The statement the host committed to, when it reported one. The recipe layer's
   * `statementFromOutput` reads this to submit the same structured candidate through
   * the SAME branch, which is how the frozen brief reaches the real service.
   */
  readonly statement?: string;
}

interface RawDshOutcome {
  readonly status?: unknown;
  readonly candidateDigest?: unknown;
  readonly detail?: unknown;
  readonly statement?: unknown;
  readonly candidateCount?: unknown;
  readonly evidenceRefs?: unknown;
}

function failed(detail: string): BranchExecutionResult {
  return { status: "failed", candidateCount: 0, detail, evidenceRefs: Object.freeze([]) };
}

function normalizeEvidenceRefs(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) return Object.freeze([]);
  const out = new Set<string>();
  for (const entry of raw) {
    if (typeof entry === "string" && entry.length > 0) out.add(entry);
    else if (typeof entry === "object" && entry !== null && typeof (entry as { readonly evidenceId?: unknown }).evidenceId === "string") {
      const evidenceId = (entry as { readonly evidenceId: string }).evidenceId;
      if (evidenceId.length > 0) out.add(evidenceId);
    }
  }
  return Object.freeze([...out].sort());
}

function parseDshOutcome(stdout: string): RawDshOutcome | undefined {
  const lines = stdout.split(/\r?\n/u);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line === undefined || !line.startsWith(DSH_BRANCH_RESULT_PREFIX)) continue;
    try {
      const parsed: unknown = JSON.parse(line.slice(DSH_BRANCH_RESULT_PREFIX.length));
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as RawDshOutcome;
      }
    } catch {
      // A malformed result line is not evidence of success; keep scanning older lines.
    }
  }
  return undefined;
}

function normalizeOutcome(raw: RawDshOutcome): DshBranchExecutionOutcome {
  const status: BranchExecutionResult["status"] =
    raw.status === "completed" || raw.status === "timeout" || raw.status === "failed" ? raw.status : "failed";
  const candidateDigest = typeof raw.candidateDigest === "string" && raw.candidateDigest.length > 0 ? raw.candidateDigest : undefined;
  const statement =
    typeof raw.statement === "string" && raw.statement.trim() !== ""
      ? raw.statement
      : typeof raw.detail === "string" && raw.detail.trim() !== ""
        ? raw.detail
        : undefined;
  const candidateCount =
    typeof raw.candidateCount === "number" && Number.isSafeInteger(raw.candidateCount) && raw.candidateCount >= 0
      ? raw.candidateCount
      : candidateDigest !== undefined
        ? 1
        : 0;
  const detail = typeof raw.detail === "string" && raw.detail.trim() !== "" ? raw.detail : `branch ${status}`;
  const evidenceRefs = normalizeEvidenceRefs(raw.evidenceRefs);
  return {
    status,
    candidateCount,
    detail,
    evidenceRefs,
    ...(candidateDigest === undefined ? {} : { candidateDigest }),
    ...(statement === undefined ? {} : { statement }),
  };
}

/**
 * Real DSH branch-execution adapter: writes the frozen brief to a temp JSON file
 * and spawns `node <dshBin> --profile <profile> --branch <briefFile>` as ONE
 * EPHEMERAL host cognition.
 *
 * The subprocess opens no durable principal, writes no session-id file, creates
 * no peer and no persistent point, and may only submit structured candidates
 * through the real ReasoningCell service. This adapter never throws on host
 * failure or timeout: both are returned as honest outcomes so the caller can
 * record an unresolved branch instead of a fabricated claim.
 */
export function dshSubprocessBranchExecutionPort(
  input: DshSubprocessBranchExecutionPortInput,
): AsyncReasoningBranchExecutionPort {
  const timeoutMs = input.timeoutMs ?? 180_000;
  const nodeExecPath = input.nodeExecPath ?? process.execPath;
  const adapterId = `dsh-subprocess-branch:${input.profile}`;

  return {
    adapterId,
    /**
     * §C.12: return a HANDLE immediately — the brief is serialized and the child spawned here, and
     * only the RESULT is deferred. A pre-flight failure yields a handle whose completion is already a
     * failed outcome, so a caller has one shape to handle either way.
     */
    start(runInput): BranchExecutionJob {
      const signal = runInput.signal;
      if (signal?.aborted === true) {
        return {
          completion: Promise.resolve(failed("branch execution aborted by caller before start")),
          cancel: () => undefined,
        };
      }

      let briefJson: string;
      try {
        // Backward compatible: a bare brief is written when no evidence context is
        // supplied; otherwise the host receives `{ brief, evidenceContext }`.
        briefJson = JSON.stringify(
          runInput.evidenceContext === undefined ? runInput.brief : { brief: runInput.brief, evidenceContext: runInput.evidenceContext },
        );
      } catch {
        return { completion: Promise.resolve(failed("branch brief is not JSON-serializable")), cancel: () => undefined };
      }
      if (typeof briefJson !== "string" || briefJson === "undefined") {
        return { completion: Promise.resolve(failed("branch brief could not be serialized")), cancel: () => undefined };
      }

      const dir = mkdtempSync(join(tmpdir(), "palimpsest-branch-"));
      const briefFile = join(dir, "brief.json");
      let child: ReturnType<typeof spawn> | undefined;
      {
        writeFileSync(briefFile, briefJson, "utf8");

        const completion = new Promise<BranchExecutionResult>((resolve) => {
          let settled = false;
          let stdout = "";
          let stderr = "";

          const spawned = spawn(nodeExecPath, [input.dshBin, "--profile", input.profile, "--branch", briefFile], {
            cwd: input.workDir,
            stdio: ["ignore", "pipe", "pipe"],
          });
          child = spawned;

          let timer: NodeJS.Timeout | undefined;

          const finish = (result: BranchExecutionResult): void => {
            if (settled) return;
            settled = true;
            if (timer !== undefined) clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
            resolve(result);
          };

          const onAbort = (): void => {
            try {
              spawned.kill();
            } catch {
              /* the process may already be gone */
            }
            finish(failed("branch execution aborted by caller"));
          };

          timer = setTimeout(() => {
            try {
              spawned.kill();
            } catch {
              /* the process may already be gone */
            }
            finish({ status: "timeout", candidateCount: 0, detail: `branch timed out after ${timeoutMs}ms`, evidenceRefs: Object.freeze([]) });
          }, timeoutMs);

          signal?.addEventListener("abort", onAbort, { once: true });

          spawned.stdout?.on("data", (chunk: Buffer | string) => {
            stdout += chunk.toString();
          });
          spawned.stderr?.on("data", (chunk: Buffer | string) => {
            stderr += chunk.toString();
          });
          spawned.on("error", (error: Error) => {
            finish(failed(`branch host failed to start: ${error.message}`));
          });
          spawned.on("close", (code: number | null) => {
            const raw = parseDshOutcome(stdout);
            if (raw !== undefined) {
              finish(normalizeOutcome(raw));
              return;
            }
            const tail = stderr.trim().split(/\r?\n/u).slice(-4).join(" | ");
            finish(failed(`branch host exited ${code ?? "unknown"} without a result line${tail === "" ? "" : `: ${tail}`}`));
          });
        });

        return {
          // Cleanup rides on the COMPLETION rather than an enclosing `await`: a caller that returns
          // immediately and never awaits the frame still cannot leak the temp directory.
          completion: completion.finally(() => rmSync(dir, { recursive: true, force: true })),
          cancel: (): void => {
            try {
              child?.kill();
            } catch {
              /* the process may already be gone */
            }
          },
        };
      }
    },
    /** The blocking UX, unchanged: start, then wait. Never a second subprocess implementation. */
    run(runInput): Promise<BranchExecutionResult> {
      return this.start(runInput).completion;
    },
  };
}
