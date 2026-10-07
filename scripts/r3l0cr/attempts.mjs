/**
 * R3-L0C-R — THE SECOND EXECUTION ATTEMPT AND ITS OUTCOME.
 *
 * After the executor route was authorized and repaired, the replication was launched twice more. Both runs
 * reached the primary sessions and BOTH STOPPED, and the stop is recorded here because the reasons are different
 * from the first stop and each one is a finding.
 *
 * ATTEMPT A — stopped on a stale-worktree hypothesis that the measurement then refuted.
 *   The prehistory world carries `.palimpsest/worlds/<attempt-id>` directories, and a hypothesis was formed that
 *   copying them propagated an unusable object store. The copy was changed to exclude them. That made the
 *   outcome STRICTLY WORSE: with no worktree tree in the copied world, the controller created each attempt
 *   worktree fresh from an incomplete store, workers could not commit, and the next generation was blocked by
 *   `quiescence_required`. The change was REVERTED, and the revert is committed.
 *
 * ATTEMPT B — stopped because a CAPITALIZED generation's treatment was not applied.
 *   `r-b1-C-G2` reached the realization gate with an EMPTY consumer surface while the frozen expectation named
 *   four handles, so §15's rule fired: a trial whose treatment realization mismatches is INVALID and STOPS the
 *   run rather than being retried as a model outcome. The gate worked exactly as designed.
 *
 * ATTEMPT C — stopped because a generation could not commit, so the NEXT generation was blocked.
 *   The H worker implemented the requirement, could not commit it, submitted `NEEDS_ESCALATION`, and the attempt
 *   stayed RUNNING. The next generation's structural plan revision was then refused with
 *   `plan revision blocked (quiescence_required)`. Four attempts at the same session failed identically.
 *
 * WHAT ATTEMPT C ACTUALLY ESTABLISHES, because it is the most useful finding of the three:
 *
 *   · THE TREATMENT IS DELIVERED. The CAPITALIZED sessions compiled 2 and 4 handles, resolved them through the
 *     governed pull, and reported APPLIED. The delivery defect that stopped the FIRST stage is fixed.
 *   · THE ARMS DIFFER ON THE TREATMENT DIMENSION. C carries 2-4 handles; H carries 0. That is the property the
 *     whole experiment needs, and it now holds.
 *   · THE WORKERS ARE DOING THE WORK. `r-b0-H-G1` promoted with 0.71 prepaid coverage and `r-b1-C-G1` recorded
 *     0.57 — real, varying outcomes rather than the ceiling Run 1 produced.
 *   · THE REMAINING DEFECT IS IN THE WORKER'S GIT ENVIRONMENT, not in the treatment, the containment or the
 *     expectation manifest. A worker's `git commit` fails with `fatal: could not parse HEAD`, and the cause is
 *     the worktree's `objects/info/alternates`, which is written with a MIXED path separator
 *     (`...\units\r-b0-H\world/.git/objects`). Git reports `unable to normalize alternate object path` for that
 *     entry, and a commit that must read the base through the alternate then fails.
 *
 * WHY THIS STAGE STOPS RATHER THAN FIXING IT HERE. The alternates path is written by the SHIPPED world
 * preparation, which is product code outside this stage's scope. Repairing it is a product change, and this
 * stage's ruling authorizes a ROUTE change, not a change to how the runtime prepares a worktree. So the stage
 * stops with the defect localized, reproducible in principle, and documented for whoever owns that code.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT, STAGE_EVIDENCE_PATH } from './contract.mjs';

const NL = String.fromCharCode(10);

/** The three execution attempts, each with its stop reason and what it established. */
export const EXECUTION_ATTEMPTS = Object.freeze([
  Object.freeze({
    id: 'ATTEMPT_A_STALE_WORKTREE_EXCLUSION',
    change: 'exclude .palimpsest/worlds from the trajectory world copy',
    outcome: 'STRICTLY_WORSE — reverted',
    observed: 'attempt worktrees were created fresh from an incomplete store; workers could not commit; the next generation was blocked by quiescence_required',
    verdict: 'the hypothesis was REFUTED by measurement and the change was reverted in a committed fix',
  }),
  Object.freeze({
    id: 'ATTEMPT_B_TREATMENT_NOT_APPLIED',
    change: 'the authorized route, with the world copy unchanged',
    outcome: 'STOPPED_ON_TREATMENT_GATE',
    observed: 'r-b1-C-G2 reached the realization gate with an empty consumer surface while the frozen expectation named four handles',
    verdict: 'the §15 realization gate fired as designed: the trial is INVALID and the run stops rather than recording it',
  }),
  Object.freeze({
    id: 'ATTEMPT_C_COMMIT_FAILURE_BLOCKS_NEXT_GENERATION',
    change: 'the authorized route, world copy unchanged (after the revert)',
    outcome: 'STOPPED_ON_BLOCKED_PLAN_REVISION',
    observed: 'the H worker implemented the requirement but could not commit it, submitted NEEDS_ESCALATION, the attempt stayed RUNNING, and the next generation was refused with plan revision blocked (quiescence_required)',
    verdict: 'the treatment is delivered and the arms differ; the remaining defect is in the worker git environment',
  }),
]);

/** The localized defect, with the evidence that establishes it. */
export const LOCALIZED_DEFECT = Object.freeze({
  id: 'WORKTREE_ALTERNATE_PATH_NOT_NORMALIZABLE',
  where: 'the shipped world preparation that writes `.palimpsest/worlds/<attempt-id>/.git/objects/info/alternates`',
  symptom: 'a worker commit fails with `fatal: could not parse HEAD`; the worker then escalates instead of settling',
  evidence: Object.freeze([
    Object.freeze({ id: 'MIXED_SEPARATOR', detail: 'the alternates entry is written as `...\\\\units\\\\r-b0-H\\\\world/.git/objects` — backslashes for the directory and a forward slash before `.git`' }),
    Object.freeze({ id: 'GIT_WARNING', detail: 'git reports `error: unable to normalize alternate object path` for that entry' }),
    Object.freeze({ id: 'WORKER_ESCALATION', detail: 'the worker transcript shows the failed commit followed by a NEEDS_ESCALATION result' }),
    Object.freeze({ id: 'DOWNSTREAM_BLOCK', detail: 'the unfinished attempt blocks the next generation with `plan revision blocked (quiescence_required)`' }),
  ]),
  /** A comparison that isolates it: the working run wrote the same mixed form, but its worktrees pointed at the PREHISTORY, whose objects were complete. */
  contrast: 'in the earlier working run the attempt worktrees pointed at `prehistory/world/.git/objects`; here a fresh worktree points at the trajectory world own `.git/objects`',
  isProductCode: true,
  changedInThisStage: false,
  reasonNotFixed: 'the alternates path is written by shipped world-preparation code, which is product scope; this stage is authorized to change the executor ROUTE, not how the runtime prepares a worktree',
});

/** What the attempts establish about the treatment, which is the part that matters for the research question. */
export function treatmentEvidence(runRoot) {
  const matrixPath = join(REPO_ROOT, STAGE_EVIDENCE_PATH, 'matrix.json');
  const partialPath = runRoot === null || runRoot === undefined ? null : join(runRoot, 'private', 'evidence', 'trials.partial.json');
  const source = partialPath !== null && existsSync(partialPath) ? JSON.parse(readFileSync(partialPath, 'utf8')) : (existsSync(matrixPath) ? JSON.parse(readFileSync(matrixPath, 'utf8')) : null);
  const sessions = source?.sessions ?? [];
  const compiledOf = (session) => session.payload?.compiledHandleCount ?? 0;
  const cSessions = sessions.filter((session) => session.arm === 'C');
  const hSessions = sessions.filter((session) => session.arm === 'H');
  return Object.freeze({
    sessions: sessions.length,
    cSessions: cSessions.length,
    hSessions: hSessions.length,
    /** THE PROPERTY THE EXPERIMENT NEEDS: the arms differ on the treatment dimension. */
    cHandlesCompiled: cSessions.map((session) => compiledOf(session)),
    hHandlesCompiled: hSessions.map((session) => compiledOf(session)),
    treatmentDelivered: cSessions.some((session) => compiledOf(session) > 0),
    armsDifferOnTreatment: cSessions.every((session) => compiledOf(session) > 0) && hSessions.every((session) => compiledOf(session) === 0),
    outcomes: Object.freeze(sessions.map((session) => Object.freeze({
      sessionId: session.sessionId,
      arm: session.arm,
      generation: session.generation,
      promoted: session.promoted === true,
      prepaidCoverage: session.finalVector?.prepaidCoverage ?? null,
      handles: compiledOf(session),
    }))),
  });
}

/** §20: the stage result for this continuation. */
export function stageResult(input) {
  const { treatment, closureFrozen, closureCurrent } = input;
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-R',
    kind: 'treatment realization and repair replication stage result (continuation)',
    status: 'BLOCKED',
    statusReason: 'the authorized route is verified and the treatment is delivered, but the replication stops on a worker git-environment defect that is product scope',

    /** The route change, which succeeded. */
    executorRoute: Object.freeze({
      provider: 'omnigate-route',
      model: 'deepseek-v4.1-flash',
      verified: true,
      verification: 'the plumbing check completes a real worker on the route with promoted=true and the oracle green',
      classification: 'EXPLICITLY_RECORDED_DEVIATION',
      classifiedAsModelStackChange: false,
    }),

    /** THE CENTRAL FINDING OF THIS CONTINUATION: the treatment now reaches the worker. */
    treatmentRealization: Object.freeze({
      TREATMENT_DELIVERED: treatment.treatmentDelivered,
      ARMS_DIFFER_ON_TREATMENT: treatment.armsDifferOnTreatment,
      cHandlesCompiled: treatment.cHandlesCompiled,
      hHandlesCompiled: treatment.hHandlesCompiled,
      /** The delivery defect that stopped the FIRST stage is fixed; this is the measurement that says so. */
      note: 'the CAPITALIZED arm compiled and pulled capital while the RAW_HISTORY arm compiled none, which is the treatment difference the experiment requires',
    }),

    /** The remaining defect, localized and attributed. */
    localizedDefect: LOCALIZED_DEFECT,
    executionAttempts: EXECUTION_ATTEMPTS,

    /** §9: the closure still matches, because the route change was pre-exposure and re-frozen. */
    executionClosure: Object.freeze({ frozen: closureFrozen, current: closureCurrent, matches: closureFrozen === closureCurrent }),

    /** §16: the four dimensions. */
    validity: Object.freeze({
      SYSTEM_VALID: 'YES',
      EXPERIMENT_ENVIRONMENT_VALID: 'YES',
      TREATMENT_REALIZATION_VALID: 'NO',
      TREATMENT_REALIZATION_NOTE: 'delivery is proven on the sessions that ran, but the replication did not complete, so realization is not established for the full 16-session schedule',
      ANALYSIS_PLAN_VALID: 'YES',
      CAUSAL_EXPERIMENT_VALID: 'NO',
    }),

    verdicts: Object.freeze({
      R3_L0C_R: 'BLOCKED',
      RUN_1: 'TREATMENT_NOT_APPLIED',
      RECONSTRUCTION_PRESSURE: 'PRESENT',
      EXECUTOR_ROUTE: 'REPLACED_UNDER_EXPLICIT_AUTHORIZATION',
      CAPITAL_UPTAKE: 'NOT_EVALUABLE',
      RECONSTRUCTION_COMPRESSION: 'NOT_EVALUABLE',
      NET_COGNITIVE_COST: 'NOT_EVALUABLE',
      NEXT: 'STOP',
      NEXT_REASON: 'the remaining defect is in shipped world-preparation code, which this stage is not authorized to change',
    }),
  });
}

export { NL };
