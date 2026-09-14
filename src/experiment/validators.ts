/**
 * G10-R experiment validators — the validator PORTS supply evidence verdicts.
 *
 *   Validator ≠ Truth                LLM_JUDGED ≠ SemanticTruth
 *   Evaluation ≠ Governance          A SCORE is not a PASS
 *
 * A validator never throws: every failure mode is represented as a verdict
 * (`FAIL`, `UNRESOLVED`, `ERROR`). A validator that could not run is `ERROR`,
 * explicitly NOT `FAIL` — an infrastructure fault must not masquerade as a
 * semantic judgement.
 */

import { execFile } from "node:child_process";
import { VALIDATOR_VERDICTS } from "../organization_memory/artifacts.js";
import type { ValidatorResult, ValidatorVerdict } from "../organization_memory/artifacts.js";

/** Input handed to every validator for one run. */
export interface ValidatorInput {
  readonly runRef: string;
  readonly workspacePath?: string;
  readonly artifactRefs?: readonly string[];
}

export interface ExperimentValidatorPort {
  readonly validatorRef: string;
  readonly kind: "command" | "artifact" | "llm_judge" | "human_import";
  validate(input: ValidatorInput): Promise<ValidatorResult>;
}

function tailText(text: string, max: number): string {
  return text.length <= max ? text : text.slice(text.length - max);
}

/* ------------------------------------------------------------------ *
 * commandValidator — a subprocess exit is mechanical evidence
 * ------------------------------------------------------------------ */

export interface CommandValidatorOptions {
  readonly validatorRef: string;
  readonly command: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly timeoutMs?: number;
}

/**
 * Execute `command` via `node:child_process.execFile`, wrapped in a promise.
 * Exit 0 -> PASS; non-zero exit -> FAIL (detail = stderr tail); a spawn error
 * or timeout -> ERROR with detail. Never throws.
 */
export function commandValidator(options: CommandValidatorOptions): ExperimentValidatorPort {
  const validatorRef = options.validatorRef;
  const timeoutMs = options.timeoutMs;
  return {
    validatorRef,
    kind: "command",
    validate: (input) =>
      new Promise<ValidatorResult>((resolve) => {
        const args: string[] = options.args === undefined ? [] : [...options.args];
        const execOptions: {
          encoding: "utf8";
          windowsHide: boolean;
          cwd?: string;
          timeout?: number;
        } = {
          encoding: "utf8",
          windowsHide: true,
          ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
          ...(timeoutMs === undefined ? {} : { timeout: timeoutMs }),
        };
        try {
          execFile(options.command, args, execOptions, (error, _stdout, stderr) => {
            try {
              if (error === null) {
                resolve({ validatorRef, verdict: "PASS" });
                return;
              }
              const stderrText = tailText(String(stderr ?? ""), 500).trim();
              const timedOut =
                timeoutMs !== undefined &&
                timeoutMs > 0 &&
                (error.killed === true || error.code === "ETIMEDOUT" || error.signal === "SIGTERM");
              if (timedOut) {
                resolve({
                  validatorRef,
                  verdict: "ERROR",
                  detail: `command timed out after ${timeoutMs}ms`,
                });
                return;
              }
              const exitCode = typeof error.code === "number" ? error.code : undefined;
              if (exitCode !== undefined) {
                resolve({
                  validatorRef,
                  verdict: "FAIL",
                  detail: stderrText.length > 0 ? stderrText : `command exited with code ${exitCode}`,
                });
                return;
              }
              resolve({
                validatorRef,
                verdict: "ERROR",
                detail: `failed to spawn command: ${String(error.code ?? error.message)}`,
              });
            } catch (callbackError) {
              resolve({
                validatorRef,
                verdict: "ERROR",
                detail: callbackError instanceof Error ? callbackError.message : "command validator failed",
              });
            }
          });
        } catch (spawnError) {
          resolve({
            validatorRef,
            verdict: "ERROR",
            detail: spawnError instanceof Error ? spawnError.message : "failed to spawn command",
          });
        }
      }),
  };
}

/* ------------------------------------------------------------------ *
 * artifactValidator — a mechanical check over run artifacts
 * ------------------------------------------------------------------ */

export interface ArtifactCheckResult {
  readonly ok: boolean;
  readonly detail?: string | undefined;
}

export interface ArtifactValidatorOptions {
  readonly validatorRef: string;
  readonly check: (input: ValidatorInput) => ArtifactCheckResult;
}

/** PASS/FAIL from a synchronous artifact check; a thrown check is ERROR. */
export function artifactValidator(options: ArtifactValidatorOptions): ExperimentValidatorPort {
  const validatorRef = options.validatorRef;
  return {
    validatorRef,
    kind: "artifact",
    validate: async (input): Promise<ValidatorResult> => {
      try {
        const result = options.check(input);
        if (result.ok) return { validatorRef, verdict: "PASS" };
        return {
          validatorRef,
          verdict: "FAIL",
          ...(result.detail === undefined ? {} : { detail: result.detail }),
        };
      } catch (error) {
        return {
          validatorRef,
          verdict: "ERROR",
          detail: error instanceof Error ? error.message : "artifact check threw",
        };
      }
    },
  };
}

/* ------------------------------------------------------------------ *
 * llmJudgeValidator — an opinion, versioned and blinded
 * ------------------------------------------------------------------ */

export interface LlmJudgeValidatorOptions {
  readonly validatorRef: string;
  readonly judgeModel: string;
  readonly promptVersion: string;
  readonly judge: (input: ValidatorInput) => Promise<number>;
}

/**
 * Call an LLM judge and record its numeric output as a SCORE.
 *
 * LLM_JUDGED is never semantic truth: a judge score is a fallible opinion, not
 * a verdict about correctness. The judge prompt MUST be versioned (recorded via
 * `promptVersion`) so scores are reproducible, and the judge SHOULD be blinded
 * to variant identity wherever possible so it cannot reward a treatment label.
 * A finite number maps to `{ verdict: "SCORE", score }`; a rejection, or a
 * non-finite result, is `ERROR` (never a silent PASS or FAIL). Never throws.
 */
export function llmJudgeValidator(options: LlmJudgeValidatorOptions): ExperimentValidatorPort {
  const validatorRef = options.validatorRef;
  const descriptor = `${options.judgeModel}@${options.promptVersion}`;
  return {
    validatorRef,
    kind: "llm_judge",
    validate: async (input): Promise<ValidatorResult> => {
      try {
        const score = await options.judge(input);
        if (!Number.isFinite(score)) {
          return {
            validatorRef,
            verdict: "ERROR",
            detail: `judge ${descriptor} returned a non-finite score`,
          };
        }
        return { validatorRef, verdict: "SCORE", score };
      } catch (error) {
        return {
          validatorRef,
          verdict: "ERROR",
          detail: error instanceof Error ? error.message : `judge ${descriptor} failed`,
        };
      }
    },
  };
}

/* ------------------------------------------------------------------ *
 * humanImportValidator — externally supplied human verdicts
 * ------------------------------------------------------------------ */

export interface HumanImportValidatorOptions {
  readonly validatorRef: string;
  readonly verdictsByRun:
    | ReadonlyMap<string, ValidatorVerdict>
    | Readonly<Record<string, ValidatorVerdict>>;
}

function isVerdictMap(
  source: ReadonlyMap<string, ValidatorVerdict> | Readonly<Record<string, ValidatorVerdict>>,
): source is ReadonlyMap<string, ValidatorVerdict> {
  return typeof (source as { readonly get?: unknown }).get === "function";
}

function lookupVerdict(
  source: ReadonlyMap<string, ValidatorVerdict> | Readonly<Record<string, ValidatorVerdict>>,
  runRef: string,
): ValidatorVerdict | undefined {
  if (isVerdictMap(source)) return source.get(runRef);
  return Object.prototype.hasOwnProperty.call(source, runRef) ? source[runRef] : undefined;
}

/**
 * Import a human verdict for a run, or `UNRESOLVED` when none was supplied.
 * An unrecognized value is treated as `UNRESOLVED`, never coerced.
 */
export function humanImportValidator(options: HumanImportValidatorOptions): ExperimentValidatorPort {
  const validatorRef = options.validatorRef;
  return {
    validatorRef,
    kind: "human_import",
    validate: async (input): Promise<ValidatorResult> => {
      const mapped = lookupVerdict(options.verdictsByRun, input.runRef);
      if (mapped !== undefined && (VALIDATOR_VERDICTS as readonly string[]).includes(mapped)) {
        return { validatorRef, verdict: mapped };
      }
      return { validatorRef, verdict: "UNRESOLVED" };
    },
  };
}

/* ------------------------------------------------------------------ *
 * validatorVerdictToOutcome
 * ------------------------------------------------------------------ */

/**
 * Map a validator verdict to a run outcome. SCORE maps to PASS because a score
 * is not a pass/fail claim at all; callers that use scores must apply their own
 * explicit, versioned decision rule and must not treat the result as truth.
 */
export function validatorVerdictToOutcome(
  verdict: ValidatorVerdict,
): "PASS" | "FAIL" | "UNRESOLVED" | "ERROR" {
  switch (verdict) {
    case "PASS":
      return "PASS";
    case "FAIL":
      return "FAIL";
    case "SCORE":
      return "PASS";
    case "UNRESOLVED":
      return "UNRESOLVED";
    case "ERROR":
      return "ERROR";
  }
}
