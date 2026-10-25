/**
 * Palimpsest-CI2 §7/§8/§9 — COMPLETION EVALUATION, SHARED BY BOTH SETTLEMENT ROUTES.
 *
 *     one derivation, one evaluator, two lifecycle owners
 *
 * WHAT THIS MODULE IS, AND WHAT IT IS NOT.
 *
 * The Completion Contract has always been ONE derivation (`deriveAttemptCompletionContract`,
 * `src/domain/completion_contract.ts`). What did not exist was one EVALUATOR: `finish` executed the
 * contract's mechanical checks inline (`src/tools/controller.ts:3184-3245`), and the delegated
 * settlement path executed none of them at all — so a delegated candidate settled COMPLETED with no
 * evidence atoms. Measured, twice: CI1 C4 and CI2's own RED falsifier.
 *
 * This module is the evaluation half, extracted so both routes can reach it. It is deliberately NOT
 * a settlement owner: it does not report, does not transition an attempt, does not export a commit
 * and does not decide whether an attempt may complete. It answers one question — "what did the
 * product actually observe about THIS candidate against THIS contract?" — and hands back a typed
 * outcome. `finish` and `settle` each keep their own lifecycle control, which is the separation §7
 * asks for:
 *
 *     Completion evaluation  ≠  Completion reporting  ≠  Qualification
 *
 * WHY THE CHECKS ARE THE SAME CHECKS.
 *
 * The three mechanical kinds are the contract's own vocabulary, and each maps to the observation the
 * product already knew how to make:
 *
 *   assert_write_scope          diff(base..HEAD) vs the envelope's write_paths
 *   assert_required_artifacts   existsSync(path) IN THE TREE THE ATTEMPT WORKED IN
 *   run_standard_command        spawn the command, observe the exit code
 *
 * None of them accepts a caller's claim. The exit code is the one this process observed; the changed
 * files are the ones git reported; the artifacts are the ones the filesystem has.
 *
 * WHY EVERY ATOM NAMES THE CANDIDATE.
 *
 * The Finish route's atoms are scoped to the ATTEMPT and name no candidate (`subject_digest` is a
 * digest of `(attempt_id, predicate)`), so no atom can answer "which result was this about?". That is
 * sufficient when one attempt settles once, and insufficient the moment the question is "may THIS
 * candidate be promoted". Each atom here therefore also records the evaluated candidate in its `value`
 * map — which is explicitly open (`src/schema/models.ts:907-909`) and already matchable by a gate
 * clause's `where` (`src/domain/gate_clause.ts:209-216`). No schema change, no new predicate.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";

import type { AttemptCompletionContract, MechanicalCheck } from "../domain/completion_contract.js";
import type { EvidencePredicate } from "../schema/models.js";

/** What one mechanical check observed. `null` means the check did not produce a usable observation. */
export interface MechanicalObservation {
  readonly check: MechanicalCheck;
  readonly outcome: "PASSED" | "FAILED" | "NOT_EVALUABLE";
  /** The evidence predicate this check would record, when it has one. */
  readonly predicate: EvidencePredicate | null;
  /** The `value` map for the atom, already carrying the candidate. Absent when nothing may be recorded. */
  readonly value: Record<string, unknown> | null;
  /** The command and observed exit code, for a process predicate. */
  readonly command: readonly string[] | null;
  readonly exitCode: number | null;
  readonly detail: string;
}

/** The complete answer for one candidate under one contract. */
export interface CompletionEvaluation {
  readonly outcome: "PASSED" | "FAILED" | "NOT_EVALUABLE";
  readonly observations: readonly MechanicalObservation[];
  readonly failed: readonly string[];
  readonly notEvaluable: readonly string[];
  readonly detail: string;
}

/**
 * The candidate identity every atom carries.
 *
 * `result_commit` is the exported commit (a Git object id, resolved by the caller — never a mutable
 * pathname). `candidate_tree` is its tree, so two commits that happen to share content are still
 * distinguishable from two that do not. `base_commit` is the envelope's base, which makes the pair
 * the actual evaluated interval rather than just a name.
 */
export interface EvaluatedCandidate {
  readonly baseCommit: string;
  readonly resultCommit: string;
  readonly candidateTree: string;
}

/** What the evaluator needs from its caller. Everything here is an OBSERVATION, none of it a claim. */
export interface CompletionEvaluationPorts {
  /** The derived contract. The caller derives it with the product's own function; this module never re-derives. */
  readonly contract: AttemptCompletionContract;
  /** The candidate that was evaluated. */
  readonly candidate: EvaluatedCandidate;
  /** The tree the attempt actually worked in — where artifacts and commands are observed. */
  readonly workDir: string;
  /** The changed files the product observed against the base. */
  readonly changedFiles: readonly string[];
  /** The envelope's write scope: the contract the observation is checked against. */
  readonly writePaths: readonly string[];
  /**
   * Run one authorized command in the attempt's tree and return the observed exit code.
   *
   * Returns `null` when the process produced no observable exit — which is NOT a failure and NOT a
   * pass: it means the check could not be evaluated, and no evidence may be recorded for it.
   */
  runCommand(command: readonly string[]): Promise<number | null>;
}

const withinScope = (path: string, scope: readonly string[]): boolean =>
  scope.some((allowed) => path === allowed || path.startsWith(`${allowed}/`));

/**
 * Evaluate the contract against the candidate.
 *
 * ORDER IS THE SEMANTICS, and it is the Finish route's order, kept: materialization (held by the
 * caller) → scope → commands → artifacts. A refusal should name the most actionable problem first,
 * and an out-of-scope change is fixed before a failing test is worth reading
 * (`completion_contract.ts:160-166`).
 *
 * This function is PURE with respect to the ledger: it appends nothing and writes nothing. Its caller
 * decides which observations become durable evidence, so a refusal can leave the attempt RUNNING with
 * nothing recorded — or, where an observation was individually true, record exactly that.
 */
export async function evaluateCompletionContract(
  ports: CompletionEvaluationPorts,
): Promise<CompletionEvaluation> {
  const observations: MechanicalObservation[] = [];
  const failed: string[] = [];
  const notEvaluable: string[] = [];
  const candidateValue = {
    base_commit: ports.candidate.baseCommit,
    result_commit: ports.candidate.resultCommit,
    candidate_tree: ports.candidate.candidateTree,
  } as const;

  for (const check of ports.contract.mechanical) {
    if (check.kind === "assert_write_scope") {
      const outOfScope = ports.changedFiles.filter((path) => !withinScope(path, ports.writePaths));
      if (outOfScope.length > 0) {
        failed.push(`write_scope_valid: ${outOfScope.join(", ")}`);
        observations.push({
          check,
          outcome: "FAILED",
          predicate: null,
          value: null,
          command: null,
          exitCode: null,
          detail: `changed paths outside the envelope's write_paths [${ports.writePaths.join(", ")}]: ${outOfScope.join(", ")}`,
        });
        continue;
      }
      observations.push({
        check,
        outcome: "PASSED",
        predicate: "write_scope_valid",
        value: {
          changed_files: [...ports.changedFiles],
          write_paths: [...ports.writePaths],
          out_of_scope: [],
          ...candidateValue,
        },
        command: null,
        exitCode: null,
        detail: "every changed path is inside the declared write scope",
      });
      continue;
    }

    if (check.kind === "assert_required_artifacts") {
      /**
       * OBSERVED IN `workDir`, WHICH IS THE ATTEMPT'S OWN TREE.
       *
       * `finish` reads the canonical repository because an in-place attempt's tree IS that repository.
       * A delegated attempt's is not: the candidate's file does not reach the canonical tree until
       * promotion, so reading it there would report a present artifact as missing — the
       * `INCOMPLETE`-forever defect this repository already recorded once for a related mistake
       * (`src/domain/standard.ts:62-67`). `workDir` is passed explicitly and recorded in the atom, so
       * the reading is attributable rather than assumed.
       */
      const missing = check.paths.filter((path) => !existsSync(join(ports.workDir, path)));
      if (missing.length > 0) {
        failed.push(`expected_files_exist: ${missing.join(", ")}`);
        observations.push({
          check,
          outcome: "FAILED",
          predicate: null,
          value: null,
          command: null,
          exitCode: null,
          detail: `required artifacts are absent from the evaluated tree: ${missing.join(", ")}`,
        });
        continue;
      }
      observations.push({
        check,
        outcome: "PASSED",
        predicate: "expected_files_exist",
        value: { paths: [...check.paths], missing: [], evaluated_in: "attempt-world", ...candidateValue },
        command: null,
        exitCode: null,
        detail: "every declared artifact is present in the evaluated tree",
      });
      continue;
    }

    /** `run_standard_command`. The exit code is OBSERVED here, so a failure returns as a failure. */
    const command = [...check.command];
    if (command.length === 0) {
      notEvaluable.push(`${check.predicate}: the contract's command is empty`);
      observations.push({
        check,
        outcome: "NOT_EVALUABLE",
        predicate: null,
        value: null,
        command: null,
        exitCode: null,
        detail: "the contract declares a command check with no command",
      });
      continue;
    }
    let exitCode: number | null;
    try {
      exitCode = await ports.runCommand(command);
    } catch (error) {
      /**
       * AN EVALUATOR ERROR IS NOT A PASSING CHECK (§9). It is also not a FAILED check: nothing was
       * observed, so calling it a failure would be asserting a result the product does not have.
       */
      notEvaluable.push(`${check.predicate}: the command could not be executed (${error instanceof Error ? error.message : String(error)})`);
      observations.push({
        check,
        outcome: "NOT_EVALUABLE",
        predicate: null,
        value: null,
        command,
        exitCode: null,
        detail: `the command could not be executed: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }
    if (exitCode === null) {
      notEvaluable.push(`${check.predicate}: the command produced no observable exit code`);
      observations.push({
        check,
        outcome: "NOT_EVALUABLE",
        predicate: null,
        value: null,
        command,
        exitCode: null,
        detail: "no observable exit code, so no evidence is recorded — an unobserved run is not a negative result",
      });
      continue;
    }
    if (exitCode !== 0) {
      failed.push(`${check.predicate}: exit ${String(exitCode)}`);
      observations.push({
        check,
        outcome: "FAILED",
        predicate: null,
        value: null,
        command,
        exitCode,
        detail: `the command exited ${String(exitCode)}`,
      });
      continue;
    }
    observations.push({
      check,
      outcome: "PASSED",
      predicate: check.predicate,
      value: { exit_code: exitCode, ...candidateValue },
      command,
      exitCode,
      detail: `the command exited 0`,
    });
  }

  /**
   * THE THREE-WAY OUTCOME, IN THIS ORDER.
   *
   * `NOT_EVALUABLE` outranks `FAILED` on purpose: if any check could not be evaluated then the
   * contract has NOT been satisfied, whatever the others said, and reporting the whole evaluation as
   * merely "failed" would suggest a fixable defect where the truth is an absent observation. Neither
   * outcome is a pass, and neither records a passing atom for the unevaluable check.
   */
  const outcome: CompletionEvaluation["outcome"] =
    notEvaluable.length > 0 ? "NOT_EVALUABLE" : failed.length > 0 ? "FAILED" : "PASSED";
  const detail =
    outcome === "PASSED"
      ? `every mechanical check held for candidate ${ports.candidate.resultCommit.slice(0, 12)}`
      : outcome === "FAILED"
        ? `the candidate contradicts the contract: ${failed.join("; ")}`
        : `the contract could not be fully evaluated: ${notEvaluable.join("; ")}`;

  return Object.freeze({
    outcome,
    observations: Object.freeze(observations),
    failed: Object.freeze(failed),
    notEvaluable: Object.freeze(notEvaluable),
    detail,
  });
}

/**
 * The candidate identity digest: a content-addressed name for the `(base → result)` interval.
 *
 * This is what goes in an atom's `dependency_digest`. It exists because `subject_digest` is a digest
 * of `(attempt_id, predicate)` and therefore cannot distinguish two different results observed for one
 * attempt — which is exactly the W5 conflict this stage has to detect rather than converge away.
 */
export function candidateDependencyDigest(candidate: EvaluatedCandidate): string {
  return createHash("sha256")
    .update(["ci2-candidate-v1", candidate.baseCommit, candidate.resultCommit, candidate.candidateTree].join("\u0000"), "utf8")
    .digest("hex");
}

/** The predicates and values a PASSED evaluation is allowed to record, in contract order. */
export function recordableObservations(
  evaluation: CompletionEvaluation,
): ReadonlyArray<{ readonly predicate: EvidencePredicate; readonly command: readonly string[] | null; readonly exitCode: number | null; readonly value: Record<string, unknown> }> {
  const out: Array<{ predicate: EvidencePredicate; command: readonly string[] | null; exitCode: number | null; value: Record<string, unknown> }> = [];
  for (const observation of evaluation.observations) {
    if (observation.outcome !== "PASSED") continue;
    if (observation.predicate === null || observation.value === null) continue;
    out.push({
      predicate: observation.predicate,
      command: observation.command,
      exitCode: observation.exitCode,
      value: observation.value,
    });
  }
  return Object.freeze(out);
}
