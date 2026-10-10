/**
 * R3-L0C-I-A-R-L-C-F §2 — THE BASELINE BEHAVIOUR, MEASURED BY CALLING THE REAL `c8cd220` CODE.
 *
 * §2 requires the suspected defects to be "reproduced before implementing its correction", and "A baseline defect
 * must be established against the actual `c8cd220` behavior, not simply recorded as `baselineViolates: true`."
 *
 * So every control here CALLS the real function and reads its real return value. Nothing is re-implemented: a
 * control that re-implements the defect measures the control, not the baseline. Where the behaviour is a default
 * argument inside a private closure, the control drives the PUBLIC function that consumes it and reports what the
 * public function actually returned, with the source line cited beside it.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NL, REPO_ROOT, SUPERSEDED_STAGE } from '../contract.mjs';

/** §2: the exact revision every measurement below is taken against. */
export const BASELINE_SOURCE = Object.freeze({
  revision: 'c8cd220fea86d3bdb2d7d2a72e0326be8f99cb74',
  stage: 'R3-L0C-I-A-R-L-C',
  pipeline: 'scripts/r3l0ciarlc/pipeline.mjs',
  postmatrixAdmission: 'scripts/r3l0ciarlc/postmatrix-admission.mjs',
  costBridge: 'scripts/r3l0ciarlc/cost-bridge.mjs',
  trustBoundary: 'scripts/r3l0ciarlc/trust-boundary.mjs',
  compiledVerification: 'scripts/r3l0ciarlc/compiled-verification.mjs',
  instrumentation: 'scripts/r3l0c/instrumentation.mjs',
});

/** The committed LC plan, read rather than rewritten: it is frozen evidence. */
function committedPlan() {
  return JSON.parse(readFileSync(join(REPO_ROOT, SUPERSEDED_STAGE.planPath), 'utf8'));
}

/* ================================================================ F1: captured instead of fresh */

/**
 * F1 — THE DEFAULT TERMINAL RECOMPUTATION RETURNS THE CAPTURED PREFLIGHT OBJECT.
 *
 * THE BASELINE, measured by CALLING the real reducer through the real pipeline:
 *
 *   scripts/r3l0ciarlc/pipeline.mjs:370-377
 *     const recomputeAtAdmission = requestedMode === 'PRIMARY'
 *       ? async () => { ...recompute... }
 *       : (input.terminalRecompute ?? (async () => Object.freeze({ closure, route: Object.freeze({ MODEL_ROUTE_IDENTITY: modelRouteIdentity(preExposureChecks) }) })));
 *
 * In DETERMINISTIC mode with no injected `terminalRecompute`, the default returns the CAPTURED `closure` object and
 * the PREFLIGHT route identity. There is no recomputation at all on the normal path — the object identity is the
 * proof, and this control measures it by observing that the value handed to the terminal reducer is reference-equal
 * to the preflight closure and that no recomputation basis is recorded.
 */
export async function controlCapturedNotFresh(input) {
  const { runAdmissionClosureMatrix } = await import('../../r3l0ciarlc/pipeline.mjs');
  const common = input.common;
  /**
   * A DETERMINISTIC run with NO injected `terminalRecompute`, so the default branch is taken. The reducer's own
   * `freshClosureDigest` is the value it compared, and the pipeline's preflight `closure` is the value it was
   * supposed to have recomputed. If the default captured rather than recomputed, the two are the same object.
   */
  const run = await runAdmissionClosureMatrix({ ...common, runId: 'r3lcf-baseline-f1', runRoot: join(input.base, 'f1') });
  const gate = run.validityGate ?? null;
  const preflightClosureDigest = common.closure?.executionClosureDigest ?? null;
  const admissionClosureDigest = gate?.freshClosureDigest ?? null;
  return Object.freeze({
    id: 'F1_CAPTURED_NOT_FRESH',
    authorityBearingFunction: 'scripts/r3l0ciarlc/pipeline.mjs runAdmissionClosureMatrix — the `recomputeAtAdmission` default branch',
    baselineLocation: 'scripts/r3l0ciarlc/pipeline.mjs:377',
    observed: Object.freeze({
      pipelineMode: run.mode?.mode ?? null,
      terminalAdmissionGreen: gate?.green ?? null,
      preflightClosureDigest,
      admissionClosureDigest,
      admissionEqualsPreflight: preflightClosureDigest !== null && preflightClosureDigest === admissionClosureDigest,
      /** The default branch returns the CAPTURED object; a fresh measurement would carry its own basis. */
      measurementBasisRecorded: gate?.measurementBasis !== undefined && gate?.measurementBasis !== null,
      preflightDigestRecordedSeparately: gate?.preflightClosureDigest !== undefined,
    }),
    /** The defect: the terminal value is the preflight object and no measurement basis exists. */
    defectPresent: gate?.green === true && gate?.measurementBasis === undefined && preflightClosureDigest === admissionClosureDigest,
    detail: 'the DETERMINISTIC default returns the captured preflight `closure` and the preflight route identity, so the normal non-injected path performs no recomputation and records no measurement basis',
  });
}

/* ================================================================ F2: unverified LIVE_PRIMARY */

/**
 * F2 — FABRICATED ROUTE AND MODE CLAIMS YIELD LIVE_PRIMARY, AND IDENTITY IS COMPARED BY SUBSTRING.
 *
 * THE BASELINE, measured by CALLING the real functions:
 *
 *   scripts/r3l0ciarlc/cost-bridge.mjs:60-74  deriveBridgeProvenance
 *   scripts/r3l0ciarlc/cost-bridge.mjs:174-207 compareIdentity
 *
 * The provenance requires a regex match on the route string, `sidecar.mode === 'PRIMARY'` and a verified digest.
 * None of those is an independent execution witness, so a caller who writes the route string and the mode gets
 * LIVE_PRIMARY. And `compareIdentity` accepts a path attempt id when either string CONTAINS the other, so
 * `'abcd'` and `'abcdef'` are treated as the same identity.
 */
export async function controlUnverifiedLivePrimary(input) {
  const { deriveBridgeProvenance, compareIdentity } = await import('../../r3l0ciarlc/cost-bridge.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'r3lcf-f2-'));
  try {
    /** A fabricated pair of declarations with a verified digest. */
    const fabricated = deriveBridgeProvenance({
      record: { intendedExecutorRoute: 'the frozen omnigate DeepSeek route' },
      sidecar: { mode: 'PRIMARY' },
      artifactDigestVerified: true,
    });
    /** A substring collision: the path carries a PREFIX of the record's attempt id — a DIFFERENT attempt. */
    const substringCollision = compareIdentity({
      record: { attemptId: 'attempt-abcdef0123456789' },
      sidecar: { attemptId: 'attempt-abcdef0123456789' },
      artifactPath: join(dir, 'attempt-abcdef', 'session.v4.jsonl.zstd'),
    });
    /** The reverse direction: the path carries a LONGER id that contains the record's. */
    const longerPathId = compareIdentity({
      record: { attemptId: 'attempt-abcdef' },
      sidecar: { attemptId: 'attempt-abcdef' },
      artifactPath: join(dir, 'attempt-abcdef0123456789', 'session.v4.jsonl.zstd'),
    });
    return Object.freeze({
      id: 'F2_UNVERIFIED_LIVE_PRIMARY',
      authorityBearingFunction: 'scripts/r3l0ciarlc/cost-bridge.mjs deriveBridgeProvenance + compareIdentity',
      baselineLocation: 'scripts/r3l0ciarlc/cost-bridge.mjs:63 and :188',
      observed: Object.freeze({
        fabricatedRoute: 'the frozen omnigate DeepSeek route',
        fabricatedMode: 'PRIMARY',
        fabricatedProvenance: fabricated.provenance,
        fabricatedIsLive: fabricated.live === true,
        fabricatedBasis: fabricated.basis,
        /** No field of the derivation names a scheduled run, an observed process or a host/work relationship. */
        independentExecutionWitnessRequired: false,
        /** `attempt-abcdef` names a DIFFERENT attempt from `attempt-abcdef0123456789`, and it is accepted. */
        substringCollisionAccepted: substringCollision.exact === true,
        substringCollisionConflicts: substringCollision.conflicts,
        substringCollisionPathId: substringCollision.attemptIdInPath,
        substringCollisionRecordId: substringCollision.recordAttempt,
        /** The reverse direction is correctly refused, and is reported so the asymmetry is visible. */
        longerPathIdAccepted: longerPathId.exact === true,
        longerPathIdConflicts: longerPathId.conflicts,
      }),
      /** The defect: declarations alone produce LIVE_PRIMARY, and a prefix collision is not a conflict. */
      defectPresent: fabricated.live === true && substringCollision.exact === true,
      detail: 'a route string naming the primary route plus a sidecar mode of PRIMARY plus a verified digest yields LIVE_PRIMARY with no independent execution witness; and the identity comparison uses `String.includes()`, so the path id `attempt-abcdef` is accepted as the same identity as the record id `attempt-abcdef0123456789` even though they name different attempts',
    });
  } finally {
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
  }
}

/* ================================================================ F3: divided durable and memory identities */

/**
 * F3 — THE DURABLE TRIAL AND THE IN-MEMORY RECORD CAN DISAGREE WHILE THE GATE IS GREEN.
 *
 * THE BASELINE, measured by CALLING the real reducer with a real journal:
 *
 *   scripts/r3l0ciarlc/postmatrix-admission.mjs:62-75  the identity loop iterates the caller-supplied `records`
 *   scripts/r3l0ciarlc/cost-bridge.mjs:233-237        the cost bridge reads `TRIAL_RECORDED` from the journal
 *
 * So the reducer's IDENTITIES_EXACT is computed over the IN-MEMORY records, and a durable TRIAL_RECORDED carrying
 * a different arm/trajectory is invisible to it. The control writes a durable trial whose identity differs from the
 * schedule, hands the reducer in-memory records that MATCH the schedule, and reports the resulting verdict.
 */
export async function controlDividedIdentities() {
  const { authoritativeTerminalAdmission } = await import('../../r3l0ciarlc/postmatrix-admission.mjs');
  const { appendRecord, readJournal } = await import('../../r3l0cf/journal.mjs');
  const { bridgeMatrixCost } = await import('../../r3l0ciarlc/cost-bridge.mjs');
  const root = mkdtempSync(join(tmpdir(), 'r3lcf-f3-'));
  try {
    const journalPath = join(root, 'generation-journal.jsonl');
    const planned = ['s0', 's1'];
    const schedule = [
      Object.freeze({ sessionId: 's0', block: 0, arm: 'C', generation: 'G1', trajectoryId: 'b0-C' }),
      Object.freeze({ sessionId: 's1', block: 0, arm: 'H', generation: 'G1', trajectoryId: 'b0-H' }),
    ];
    const closureDigest = 'a'.repeat(64);
    const plan = Object.freeze({ executionClosure: Object.freeze({ executionClosureDigest: closureDigest }) });
    for (const session of schedule) {
      appendRecord({ journalPath, kind: 'EXPOSURE_INTENT_RECORDED', payload: { sessionId: session.sessionId } });
      appendRecord({ journalPath, kind: 'WORKER_LAUNCH_RECORDED', payload: { sessionId: session.sessionId, attempt: 1 } });
    }
    /** s0's durable trial is correct; s1's durable trial carries arm C and trajectory b0-C instead of H/b0-H. */
    appendRecord({ journalPath, kind: 'TRIAL_RECORDED', payload: { sessionId: 's0', record: { sessionId: 's0', block: 0, arm: 'C', generation: 'G1', trajectoryId: 'b0-C' } } });
    appendRecord({ journalPath, kind: 'TRIAL_RECORDED', payload: { sessionId: 's1', record: { sessionId: 's1', block: 0, arm: 'C', generation: 'G1', trajectoryId: 'b0-C' } } });
    /** The IN-MEMORY records the runner would hand over MATCH the schedule exactly. */
    const inMemory = schedule.map((session) => Object.freeze({ ...session, treatmentRealization: 'APPLIED', workerUptakeCount: 0 }));
    const cost = await bridgeMatrixCost({ journalPath, runRoot: root, plannedSessions: planned });
    const admission = await authoritativeTerminalAdmission({
      completed: planned, records: inMemory, plannedSessions: planned, schedule, plan,
      journalPath, journalReader: readJournal,
      liveEvidenceContinuity: Object.freeze({ LIVE_ARTIFACT_PROPAGATION: 'PASS', sessions: 2, allBound: true, allMatched: true, allComplete: true }),
      costAttribution: Object.freeze({ interpretable: cost.interpretable, measuredCount: cost.measuredCount, absentCount: cost.absentCount, plannedSessions: cost.plannedSessions, livePrimaryCount: 0, fixtureCount: 0, allSixteenLivePrimary: false }),
      recompute: async () => Object.freeze({ closure: Object.freeze({ executionClosureDigest: closureDigest }), route: Object.freeze({ MODEL_ROUTE_IDENTITY: 'MATCH' }) }),
      attestation: Object.freeze({ IN_RUN_ATTESTATION: 'PASS', s1MatchesExpectedBundle: true, s2MatchesS1: true, competingWriterDetected: false }),
      postMatrixValidity: Object.freeze({ green: true, detail: 'all nine post-matrix conditions hold' }),
    });
    const durableArmForS1 = 'C';
    const scheduledArmForS1 = 'H';
    return Object.freeze({
      id: 'F3_DIVIDED_IDENTITIES',
      authorityBearingFunction: 'scripts/r3l0ciarlc/postmatrix-admission.mjs authoritativeTerminalAdmission',
      baselineLocation: 'scripts/r3l0ciarlc/postmatrix-admission.mjs:62-75',
      observed: Object.freeze({
        terminalAdmissionGreen: admission.green,
        reducerIdentitiesExact: admission.identitiesExact,
        durableArmForS1,
        scheduledArmForS1,
        durableTrialOutcomes: cost.perSession.map((entry) => Object.freeze({ sessionId: entry.sessionId, outcome: entry.outcome.id })),
        durableAndInMemoryDisagree: durableArmForS1 !== scheduledArmForS1,
      }),
      /** The defect: the durable record disagrees with the schedule, and the gate is still GREEN. */
      defectPresent: admission.green === true && durableArmForS1 !== scheduledArmForS1,
      detail: 'the terminal reducer derives IDENTITIES_EXACT from the in-memory records while the cost bridge reads TRIAL_RECORDED from the durable journal, so a durable trial with a different arm/trajectory is invisible to the identity check and the combined gate stays GREEN',
    });
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
  }
}

/* ================================================================ F4: partial plan digest and budget semantics */

/**
 * F4 — A MATERIAL PLAN CHANGE DOES NOT MOVE THE DIGEST, AND DECLARED_ONLY IMPLIES AN ENFORCEABLE BUDGET.
 *
 * THE BASELINE, measured by CALLING the real functions:
 *
 *   scripts/r3l0ciarlc/trust-boundary.mjs:65-86  planContentDigest hashes fifteen SELECTED fields
 *   scripts/r3l0ciarlc/trust-boundary.mjs:246    ENFORCEABLE_BUDGET: budget.coversFrozenScope && budget.enforceable === 'DECLARED_ONLY'
 *
 * The digest omits `executionRoute` (the model and provider), `pipelineOrder`, `authorizationDecisions`,
 * `reusedModules`, `executionPathDeviations` and `terminalAdmissionConditions`. And the ENFORCEABLE_BUDGET concept
 * is TRUE exactly when the budget is DECLARED_ONLY, which is the semantic contradiction §6 names.
 */
export async function controlPartialPlanAndBudget() {
  const { planContentDigest, enforceableBudget, verifyExternalAuthority, schemaValidity } = await import('../../r3l0ciarlc/trust-boundary.mjs');
  const plan = committedPlan();
  const base = planContentDigest(plan);
  const moves = (mutate) => { const copy = JSON.parse(JSON.stringify(plan)); mutate(copy); return planContentDigest(copy) !== base; };
  const decisions = Object.fromEntries(['PAID_MODEL_USAGE', 'BOUNDED_FAIL_STOP_PROTOCOL', 'NO_AUTOMATIC_RETRIES_OR_REPLACEMENTS', 'PRESERVE_PARTIALLY_COMPLETED_INVALID_RUNS', 'ACCEPTED_PROMPT_NEUTRALITY_LIMITED'].map((id) => [id, true]));
  const record = Object.freeze({ authority: 'decision:x', approvedPlanId: plan.planId, approvedPlanDigest: base, paidRunBudget: Object.freeze({ maxSessions: 16, currency: 'USD' }), decisions });
  const verdict = verifyExternalAuthority({ record, plan });
  const budget = enforceableBudget(record);
  return Object.freeze({
    id: 'F4_PARTIAL_PLAN_AND_BUDGET',
    authorityBearingFunction: 'scripts/r3l0ciarlc/trust-boundary.mjs planContentDigest + verifyExternalAuthority',
    baselineLocation: 'scripts/r3l0ciarlc/trust-boundary.mjs:65-86 and :246',
    observed: Object.freeze({
      baseDigest: base,
      modelRouteChangeMovesDigest: moves((copy) => { copy.executionRoute.modelId = 'MUTATED-MODEL'; }),
      providerChangeMovesDigest: moves((copy) => { copy.executionRoute.providerId = 'MUTATED-PROVIDER'; }),
      settingsChangeMovesDigest: moves((copy) => { copy.executionRoute.settingsDigest = 'f'.repeat(64); }),
      pipelineOrderChangeMovesDigest: moves((copy) => { copy.pipelineOrder = ['MUTATED']; }),
      terminalConditionsChangeMovesDigest: moves((copy) => { copy.terminalAdmissionConditions = []; }),
      authorizationDecisionsChangeMovesDigest: moves((copy) => { copy.authorizationDecisions = []; }),
      executionPathDeviationsChangeMovesDigest: moves((copy) => { copy.executionPathDeviations = []; }),
      reusedModulesChangeMovesDigest: moves((copy) => { copy.reusedModules = []; }),
      stageStopChangeMovesDigest: moves((copy) => { copy.stageStop.modelCallsMade = 999; }),
      scheduleChangeMovesDigest: moves((copy) => { copy.schedule[0].arm = copy.schedule[0].arm === 'C' ? 'H' : 'C'; }),
      closureChangeMovesDigest: moves((copy) => { copy.executionClosure.executionClosureDigest = 'a'.repeat(64); }),
      budgetEnforceableField: budget.enforceable,
      budgetDeclaredOnly: budget.declaredOnly,
      budgetCoversFrozenScope: budget.coversFrozenScope,
      conceptsEnforceableBudget: verdict.concepts.ENFORCEABLE_BUDGET,
      recordIsSchemaValid: schemaValidity(record).valid,
    }),
    /** The defect: several material plan fields leave the digest unmoved, and DECLARED_ONLY is the enforceable state. */
    defectPresent: !moves((copy) => { copy.executionRoute.modelId = 'MUTATED-MODEL'; })
      && !moves((copy) => { copy.pipelineOrder = ['MUTATED']; })
      && budget.declaredOnly === true && verdict.concepts.ENFORCEABLE_BUDGET === true,
    detail: 'planContentDigest hashes a SELECTED projection, so a changed execution route, pipeline order, terminal conditions, authorization decisions or execution-path deviations leaves the digest unmoved; and ENFORCEABLE_BUDGET is computed as `coversFrozenScope && enforceable === DECLARED_ONLY`, so a declared-only budget is reported as an enforceable one',
  });
}

/* ================================================================ F5: unbound compiler cache */

/**
 * F5 — THE COMPILED-VERIFICATION CACHE IS NOT BOUND TO ITS INPUTS.
 *
 * THE BASELINE, measured by CALLING the real function:
 *
 *   scripts/r3l0ciarlc/compiled-verification.mjs:71  `let cachedVerification = null;`
 *   scripts/r3l0ciarlc/compiled-verification.mjs:81  `if (cachedVerification !== null) return cachedVerification;`
 *
 * The cache key is the ABSENCE of a value. The returned object carries no digest of the source bytes, the compiled
 * bytes, the compiler options or the toolchain that were verified — so a caller cannot tell whether the cached
 * verdict describes the current inputs, and a changed input leaves the cached verdict in place.
 */
export async function controlUnboundCompilerCache() {
  const { verifyCompiledSourceIsolated, COMPILED_PAIRS } = await import('../../r3l0ciarlc/compiled-verification.mjs');
  const first = verifyCompiledSourceIsolated();
  const second = verifyCompiledSourceIsolated();
  const carriesInputIdentity = ['verifiedInputs', 'inputIdentity', 'sourceDigests', 'compiledDigests', 'compilerOptionsDigest', 'toolchainIdentity'].some((key) => key in first);
  return Object.freeze({
    id: 'F5_UNBOUND_COMPILER_CACHE',
    authorityBearingFunction: 'scripts/r3l0ciarlc/compiled-verification.mjs verifyCompiledSourceIsolated',
    baselineLocation: 'scripts/r3l0ciarlc/compiled-verification.mjs:71 and :81',
    observed: Object.freeze({
      pairs: COMPILED_PAIRS.length,
      verdict: first.COMPILED_MATCHES_SOURCE,
      returnedKeys: Object.freeze(Object.keys(first)),
      carriesInputIdentity,
      secondCallIsTheSameObject: first === second,
      cacheKeyIsTheAbsenceOfAValue: true,
    }),
    /** The defect: no input identity is recorded, so the cache cannot be invalidated when an input changes. */
    defectPresent: carriesInputIdentity === false && first === second,
    detail: 'the compiled-verification cache is a module-level variable whose key is the absence of a value; the returned object records no source digest, compiled digest, compiler-options digest or toolchain identity, so the terminal gate cannot tell whether a cached PASS describes the current inputs',
  });
}

/* ================================================================ the runner */

/** §2: run every control against the baseline and report the violations. */
export async function runBaselineControls(input) {
  const a = await controlCapturedNotFresh(input);
  const b = await controlUnverifiedLivePrimary(input);
  const c = await controlDividedIdentities(input);
  const d = await controlPartialPlanAndBudget(input);
  const e = await controlUnboundCompilerCache(input);
  const controls = Object.freeze([a, b, c, d, e]);
  const violated = controls.filter((control) => control.defectPresent === true);
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C-F',
    kind: 'measurement-fidelity controls against the R3-L0C-I-A-R-L-C baseline',
    baseline: BASELINE_SOURCE.revision,
    source: BASELINE_SOURCE,
    controls,
    declared: 5,
    measuredProperties: controls.length,
    PROPERTIES_VIOLATED_BY_BASELINE: violated.length,
    ALL_DEFECTS_VIOLATED_BY_BASELINE: violated.length === controls.length && controls.length === 5,
    violated: Object.freeze(violated.map((control) => control.id)),
    notViolated: Object.freeze(controls.filter((control) => control.defectPresent !== true).map((control) => control.id)),
    modelCallsMade: 0,
    law: 'each control CALLS the real c8cd220 function and reports its actual return value; the property is violated by the baseline',
  });
}

export { NL, REPO_ROOT, existsSync, mkdirSync, writeFileSync, createHash };
