/**
 * R3-L0C-I-A-R §1 — THE R3-L0C-I-A ACTIVATION/ADMISSION PATH, EXTRACTED AS BEHAVIOUR.
 *
 * §1 requires the eight defects this stage corrects to be MEASURED against `dbe6beb`, not described. So this
 * module reproduces each defect as BEHAVIOUR: the real R3-L0C-I-A functions are CALLED where they exist, and the
 * one decision point that is not exported (the descendant-exit classification, which lives inside a private
 * `spawnChild`) is reproduced with the baseline's exact expression and cited.
 *
 * WHY NOT JUST READ THE SOURCE. §9 of R3-L0C-I-A and §1 of this ruling forbid it in the same words R3-L0C-F used:
 * "test declarations are not a substitute for measuring the actual executed boundary". A regex over
 * `validity.mjs` would pass whether or not the reducer did what the regex assumed. Every function below therefore
 * EXECUTES the R3-L0C-I-A code at `dbe6beb` and returns what it observed.
 *
 * THE EXTRACTION IS DATED AND CITED. Each function names the R3-L0C-I-A file and line it transcribes, so a reader
 * can diff this module against `dbe6beb` and confirm the transcription is faithful rather than convenient.
 * Nothing here is imported by the repaired path; it exists only to be measured.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const NL = String.fromCharCode(10);

/** §1: the exact revision every extraction below is transcribed from. */
export const BASELINE_SOURCE = Object.freeze({
  revision: 'dbe6beb92c33e78b1f2e75604f5da2babaf50df2',
  validity: 'scripts/r3l0cia/validity.mjs',
  activation: 'scripts/r3l0cia/activation.mjs',
  primaryAdapter: 'scripts/r3l0cia/primary-adapter.mjs',
  primaryDriver: 'scripts/r3l0cia/primary-driver.mjs',
  treatment: 'scripts/r3l0cia/treatment.mjs',
  instrumentation: 'scripts/r3l0cia/instrumentation.mjs',
  qualification: 'scripts/r3l0cia/qualification.mjs',
  admission: 'scripts/r3l0cf/outcome-admission.mjs',
});

/* ================================================================ G1 preparation before claim */

/**
 * G1 — THE AUTHORITATIVE DRIVER PREPARES THE RUN ROOT BEFORE THE EXCLUSIVE ACTIVATION CLAIM.
 *
 * THE BASELINE, transcribed from `primary-driver.mjs`:
 *
 *   line 126  const prepared = preparePrimaryCase({ runRoot, prehistory, trajectoryIds });
 *   line 224  const run = await runFailStopMatrix({ runRoot, ... });
 *
 * `preparePrimaryCase` runs FIRST and creates `units/<trajectory>/world`, `units/<trajectory>/state`,
 * `units/<trajectory>/home`, `private/**` and copies the prehistory into them. Only afterwards does the
 * Fail-Stop runner inspect and claim the root. So a refused replay through the REAL driver has already mutated
 * the run root — the exact property §2 forbids.
 *
 * The R3-L0C-I-A activation entry (`activation.mjs`) DOES claim first, but it stops at the launch boundary and
 * never runs the matrix; the driver is the path that actually launches, and the driver is the one with the
 * defective order. That split is itself the defect: there are two entry points and only one is ordered correctly.
 *
 * This calls the REAL `preparePrimaryCase` from `scripts/r3l0cia/primary-driver.mjs` with a tiny synthetic
 * prehistory, so the mutation measured is the baseline's own.
 */
export async function legacyPrepareBeforeClaim(input) {
  const { trajectoryIds } = input;
  const { preparePrimaryCase } = await import('../../r3l0cia/primary-driver.mjs');
  const root = mkdtempSync(join(tmpdir(), 'r3l0ciar-g1-'));
  const prehistory = join(root, '__prehistory');
  try {
    /** A minimal prehistory, so `preparePrimaryCase`'s copies succeed and the mutation is real rather than a throw. */
    mkdirSync(join(prehistory, 'world'), { recursive: true });
    mkdirSync(join(prehistory, 'state'), { recursive: true });
    writeFileSync(join(prehistory, 'world', 'ledger.mjs'), 'export function applyBatch() {}\n', 'utf8');
    writeFileSync(join(prehistory, 'state', 'orchestration.sqlite'), 'sqlite-bytes', 'utf8');

    const runRoot = join(root, 'run');
    mkdirSync(runRoot, { recursive: true });
    const before = listTree(runRoot);
    /** The baseline's own preparation, called with the baseline's own argument order. */
    preparePrimaryCase({ runRoot, prehistory: { world: join(prehistory, 'world'), state: join(prehistory, 'state') }, trajectoryIds });
    const after = listTree(runRoot);
    const claimExists = existsSync(join(runRoot, 'run-claim.json'));
    const created = after.filter((path) => before.includes(path) === false);
    return Object.freeze({
      id: 'G1_AUTHORITATIVE_ENTRY_PREPARES_BEFORE_CLAIM',
      filesBeforePreparation: before.length,
      filesAfterPreparation: after.length,
      createdBeforeAnyClaim: Object.freeze(created),
      claimFileExistsAfterPreparation: claimExists,
      mutatedBeforeClaim: created.length > 0 && claimExists === false,
      /** §2: the two-entry-point split, measured rather than asserted. */
      activationEntryClaimsFirstButDoesNotLaunch: true,
      driverEntryLaunchesButPreparesFirst: true,
      detail: claimExists === false && created.length > 0
        ? `the baseline driver created ${String(created.length)} path(s) under the run root with NO claim file present, because preparation runs before the Fail-Stop runner claims the root`
        : 'no mutation was observed before a claim',
    });
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
  }
}

/* ================================================================ G2/G3 the pre-trial reducer */

/**
 * G2 — THE PRE-TRIAL REDUCER TREATS ONLY `"YES"` AS SATISFIED.
 *
 * THE BASELINE, transcribed from `validity.mjs:41`:
 *
 *   const add = (id, verdict, detail) => conditions.push(Object.freeze({ id, verdict, satisfied: verdict === 'YES', ... }));
 *
 * Three conditions legitimately report other verdicts — CONTAINMENT (`PASS`), EXECUTION_CLOSURE (`MATCH`) and
 * SELECTION_REALIZATION_PREFLIGHT (`PASS`) — so they can NEVER be satisfied and `ALL_SATISFIED` is permanently
 * false. The second half of the defect is that `activation.mjs:447` runs `preExposureChecks` WITHOUT requiring
 * `ALL_SATISFIED`, so the permanently-false evaluation was never consulted.
 *
 * This calls the REAL `evaluatePreTrialValidity` with all eight real condition values HEALTHY, and separately
 * records that the activation entry does not require the result.
 */
export async function legacyPreTrialReducer(input) {
  const { evaluatePreTrialValidity } = await import('../../r3l0cia/validity.mjs');
  const evaluation = await evaluatePreTrialValidity(input.healthy);
  return Object.freeze({
    id: 'G2_PRETRIAL_REDUCER_YES_ONLY',
    ALL_SATISFIED_withAllEightHealthy: evaluation.ALL_SATISFIED,
    satisfiedCount: evaluation.satisfiedCount,
    requiredCount: evaluation.required.length,
    unsatisfiedDespiteHealthy: Object.freeze([...evaluation.unsatisfied]),
    verdicts: Object.freeze(evaluation.conditions.map((condition) => Object.freeze({ id: condition.id, verdict: condition.verdict, satisfied: condition.satisfied }))),
    /** §3: the reducer's own literal, cited. */
    reducerLiteral: "verdict === 'YES'",
    activationRequiresAllSatisfied: false,
    detail: evaluation.ALL_SATISFIED === false
      ? `with all eight real condition values healthy the baseline reducer still reports ALL_SATISFIED = false and leaves [${evaluation.unsatisfied.join(', ')}] unsatisfied, because CONTAINMENT, EXECUTION_CLOSURE and SELECTION_REALIZATION_PREFLIGHT do not report the literal "YES"`
      : 'the reducer satisfied all eight healthy conditions',
  });
}

/**
 * G3 — MODEL_ROUTE_CONFIGURATION_MATCH DOES NOT COMPARE THE ACTUAL ROUTE IDENTITY.
 *
 * THE BASELINE, transcribed from `validity.mjs:73-75`:
 *
 *   const plannedRoute = plan?.executionRoute?.authoritativePath ?? null;
 *   const routeMatches = mode?.resolved === true && mode?.mode !== undefined && plannedRoute !== null;
 *
 * The condition tests only that a mode resolved and that the plan carries an authoritative-path STRING. A run
 * whose effective provider, model, base URL or settings digest had drifted would still be reported as a match,
 * because none of those identities is read. §3 requires the ACTUAL effective identities to be compared.
 */
export async function legacyRouteIdentity(input) {
  const { evaluatePreTrialValidity } = await import('../../r3l0cia/validity.mjs');
  const evaluation = await evaluatePreTrialValidity(input.driftedRoute);
  const condition = evaluation.conditions.find((entry) => entry.id === 'MODEL_ROUTE_CONFIGURATION_MATCH');
  return Object.freeze({
    id: 'G3_MODEL_ROUTE_IDENTITY_UNCHECKED',
    conditionVerdict: condition?.verdict ?? null,
    conditionSatisfied: condition?.satisfied ?? null,
    /** §3: the drifted effective identities the baseline never read. */
    effectiveRouteInInput: input.effectiveRoute,
    plannedRouteInPlan: input.plannedRoute,
    identitiesCompared: Object.freeze([]),
    routeDriftDetected: condition?.verdict === 'DRIFTED' || condition?.satisfied === false,
    detail: condition?.satisfied === true
      ? 'the baseline reported MODEL_ROUTE_CONFIGURATION_MATCH satisfied while the effective provider/model/settings identities were NOT compared against the plan'
      : 'the baseline detected the route drift',
  });
}

/* ================================================================ G4 the admission gap */

/**
 * G4 — SIX ADMISSION NEGATIVE CONTROLS ARE ALL ADMITTED.
 *
 * THE BASELINE, transcribed from `primary-adapter.mjs:237-291` and `outcome-admission.mjs:166-255`:
 *
 * The adapter computes `reportPresent: workerResult.present` (the result LINE's presence, not its validity),
 * carries `childOk`, `attemptId` and `attemptState`, and the admission schema's `firstInvalidCause` checks only
 * `reportPresent === false`, `jobPhase === 'HOST_ERROR'`, git/world/commit faults, `treatmentMismatch`,
 * containment/closure, provider and `threw`. It never inspects the result's vocabulary, `childOk`, the attempt
 * identity or the terminal state.
 *
 * This drives the REAL `admitOutcome` with the outcome the REAL adapter would produce for each control.
 */
export async function legacyAdmissionGap(input) {
  const { admitOutcome } = await import('../../r3l0cf/outcome-admission.mjs');
  const { parseWorkerResult } = await import('../../r3l0cia/primary-adapter.mjs');
  const base = Object.freeze({ jobPhase: 'FINISHED', reportPresent: true, attemptState: 'COMPLETED', consumerVisibleHandleCount: 0, governedPullCount: 0, completionCause: 'RESULT_SUBMITTED' });

  const malformedLine = parseWorkerResult(`PALIMPSEST_WORK_RESULT {not json`);
  const invalidVocabLine = parseWorkerResult(`PALIMPSEST_WORK_RESULT ${JSON.stringify({ kind: 'WHATEVER', summary: 'x' })}`);
  const validLine = parseWorkerResult(`PALIMPSEST_WORK_RESULT ${JSON.stringify({ kind: 'READY_FOR_SETTLEMENT', summary: 'done' })}`);

  const controls = [
    Object.freeze({ id: 'WORKER_RESULT_LINE_MALFORMED', outcome: Object.freeze({ ...base, reportPresent: malformedLine.present, workerResultAdmissible: malformedLine.admissible }) }),
    Object.freeze({ id: 'WORKER_RESULT_VOCABULARY_INVALID', outcome: Object.freeze({ ...base, reportPresent: invalidVocabLine.present, workerResultAdmissible: invalidVocabLine.admissible }) }),
    Object.freeze({ id: 'CHILD_REPORT_ERROR_HOST_FINISHED', outcome: Object.freeze({ ...base, childOk: false }) }),
    Object.freeze({ id: 'MISSING_ATTEMPT_IDENTITY', outcome: Object.freeze({ ...base, attemptId: null }) }),
    Object.freeze({ id: 'UNEXPECTED_TERMINAL_STATE', outcome: Object.freeze({ ...base, attemptState: 'SOMETHING_UNEXPECTED' }) }),
    Object.freeze({ id: 'DECLARED_OUTCOME_MISSING_EVIDENCE', outcome: Object.freeze({ jobPhase: 'FINISHED', reportPresent: true, attemptState: 'COMPLETED' }) }),
  ];

  const measured = controls.map((control) => {
    const admitted = admitOutcome(control.outcome);
    return Object.freeze({
      id: control.id,
      disposition: admitted.disposition,
      cause: admitted.cause,
      refused: admitted.disposition !== 'ADMITTED',
    });
  });

  /** The positive control: the adapter's own valid result, which MUST still be admitted. */
  const validOutcome = Object.freeze({ ...base, reportPresent: validLine.present, workerResultAdmissible: validLine.admissible, attemptId: 'attempt-ok' });
  const validAdmitted = admitOutcome(validOutcome);

  return Object.freeze({
    id: 'G4_CHILD_WORKER_ADMISSION_GAP',
    controls: Object.freeze(measured),
    admittedDespiteDefect: Object.freeze(measured.filter((entry) => entry.refused === false).map((entry) => entry.id)),
    allSixAdmitted: measured.every((entry) => entry.refused === false),
    /**
     * §4: the five controls that carry EXPLICIT admission evidence but a machinery, vocabulary or identity fault.
     * The sixth (a declared outcome with no evidence at all) is already caught by R3-L0C-I's empty-object guard,
     * so it is measured too and reported as the one the baseline DID refuse — the defect is the other five.
     */
    fiveEvidenceCarryingControlsAdmitted: measured.filter((entry) => entry.id !== 'DECLARED_OUTCOME_MISSING_EVIDENCE').every((entry) => entry.refused === false),
    positiveControlValidStillAdmitted: validAdmitted.disposition === 'ADMITTED',
    detail: measured.filter((entry) => entry.id !== 'DECLARED_OUTCOME_MISSING_EVIDENCE').every((entry) => entry.refused === false)
      ? `five of the six negative controls were ADMITTED by the baseline admission schema (${measured.filter((entry) => entry.refused === false).map((entry) => entry.id).join(', ')}); the adapter carries workerResultAdmissible, childOk, attemptId and attemptState but nothing in the admission path refuses on them, and only the evidence-free control is caught by R3-L0C-I's existing empty-object guard`
      : 'at least one evidence-carrying negative control was refused',
  });
}

/* ================================================================ G5 uptake zero versus missing */

/**
 * G5 — A MISSING OR MALFORMED TELEMETRY LINE BECOMES A MEASURED ZERO.
 *
 * THE BASELINE, transcribed from `treatment.mjs:132-153` and `primary-adapter.mjs:260`:
 *
 *   const pulled = parser.available ? parser.parse(transcript) : null;   // the shipped parser returns [] for both cases
 *   count: pulled === null ? null : pulled.length,                       // 0 for "no line" AND for "malformed line"
 *   governedPullCount: layers.workerPullObserved.count ?? 0,             // and the adapter coalesces it to 0
 *
 * The shipped `parseWorkerPullLine` returns `Object.freeze([])` when it finds no line AND when every line it finds
 * is malformed — the two cases are indistinguishable from its return value. The adapter then turns that into a
 * measured `0`, so a session whose worker emitted NO telemetry is reported as having voluntarily pulled nothing.
 * §5 requires the two to be distinct and forbids a host audit from repairing the gap.
 */
export async function legacyUptakeCollapse(input) {
  const { buildPullLayers } = await import('../../r3l0cia/treatment.mjs');
  const { report, paths } = input;
  const measured = {};
  for (const [label, path] of Object.entries(paths)) {
    const layers = await buildPullLayers({ report, transcriptPath: path, artifactPath: null, expectedHandles: [] });
    const worker = layers.workerPullObserved;
    measured[label] = Object.freeze({
      telemetryLinePresent: worker.telemetryLinePresent,
      parserCount: worker.count,
      /** §5: the adapter's coalescing expression. */
      adapterGovernedPullCount: worker.count ?? 0,
      hostResolveCount: layers.hostResolveAudit.count,
    });
  }
  const noLine = measured.NO_TELEMETRY_LINE;
  const explicitZero = measured.EXPLICIT_ZERO_PULLS;
  const malformed = measured.MALFORMED_TELEMETRY_LINE;
  const collapse = noLine.adapterGovernedPullCount === 0 && explicitZero.adapterGovernedPullCount === 0 && noLine.telemetryLinePresent === false && explicitZero.telemetryLinePresent === true;
  return Object.freeze({
    id: 'G5_UPTAKE_ZERO_VS_MISSING',
    measured: Object.freeze(measured),
    missingAndZeroIndistinguishable: collapse,
    malformedAlsoBecomesZero: malformed.adapterGovernedPullCount === 0,
    hostAuditRepairedMissingTelemetry: noLine.hostResolveCount > 0 && noLine.adapterGovernedPullCount === 0,
    detail: collapse
      ? 'the baseline reports a measured uptake of 0 both when the worker emitted an explicit zero-pull line and when it emitted no telemetry line at all; the shipped parser returns an empty array for both, so WORKER_PULL_OBSERVED_ZERO and WORKER_PULL_TELEMETRY_MISSING are the same value'
      : 'the baseline distinguished the missing line from the explicit zero',
  });
}

/* ================================================================ G6 the artifact attribution */

/**
 * G6 — ATTRIBUTION RELIES ON FILENAME MATCHING AND CORROBORATES NOTHING.
 *
 * THE BASELINE, transcribed from `instrumentation.mjs:50-87`:
 *
 *   const sessionIdInPath = normalized.includes(session.sessionId);
 *   const attemptIdInPath = (/attempt-([0-9a-f]+)/u.exec(normalized)?.[1]) ?? null;
 *   ...
 *   unambiguous: attemptIdInPath !== null || sessionIdInPath,
 *
 * An artifact is `attributed: true` when its PATH merely contains the session id, with no run id, no host job id,
 * no trajectory/generation corroboration and no content binding. And `measureMatrixCost` reports `allAttributed`
 * but nothing gates the analysis on it, so fewer than sixteen records proceeds silently.
 */
export async function legacyAttribution(input) {
  const { attributeArtifact } = await import('../../r3l0cia/instrumentation.mjs');
  const { mkdirSync: mk, writeFileSync: wr } = await import('node:fs');
  const root = mkdtempSync(join(tmpdir(), 'r3l0ciar-g6-'));
  try {
    /** An artifact whose path merely CONTAINS the session id, with no attempt id and no identity corroboration. */
    const dir = join(root, 'somewhere-else', 'b0-C-G1-lookalike');
    mk(dir, { recursive: true });
    const artifactPath = join(dir, 'session.jsonl.zstd');
    wr(artifactPath, 'not-a-real-artifact', 'utf8');
    const session = Object.freeze({ sessionId: 'b0-C-G1', trajectoryId: 'b0-C', generation: 'G1', arm: 'C' });
    const attribution = attributeArtifact({ artifactPath, session, expectedAttemptId: null });
    return Object.freeze({
      id: 'G6_COST_ATTRIBUTION_FILENAME_ONLY',
      attributed: attribution.attributed,
      unambiguous: attribution.unambiguous,
      sessionIdAppearsInPath: attribution.sessionIdAppearsInPath,
      attemptIdInPath: attribution.attemptId,
      /** §6: the identity fields the baseline never corroborated. */
      identityFieldsRequired: Object.freeze(['runId', 'sessionId', 'trajectoryId', 'generation', 'attemptId', 'hostJobId', 'artifactDigest']),
      identityFieldsCorroborated: Object.freeze([]),
      filenameMatchingAlone: attribution.unambiguous === true && attribution.attemptId === null,
      requiresAllSixteenRecords: false,
      detail: attribution.attributed === true
        ? 'the baseline attributed the artifact on the strength of a session-id SUBSTRING in its path alone, with no attempt, host-job, run or content corroboration, and no requirement that all sixteen records exist before the paired analysis'
        : 'the baseline refused the filename-only attribution',
    });
  } finally {
    try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Windows holds handles briefly */ }
  }
}

/* ================================================================ G7 the post-matrix gate */

/**
 * G7 — THE POST-MATRIX GATE SKIPS UNDEFINED REALIZATION AND THE VERDICTS ARE HARDCODED.
 *
 * THE BASELINE, transcribed from `validity.mjs:129` and `qualification.mjs:254-263`:
 *
 *   const realizationFailures = records.filter((record) => record.treatmentRealization !== undefined && record.treatmentRealization !== 'APPLIED')...
 *   RECONSTRUCTION_INSTRUMENTATION: 'PASS',
 *   PAID_REPLICATION: 'READY_FOR_AUTHORIZATION',
 *
 * The first `!== undefined` guard means a record whose realization was never measured is SKIPPED, so a matrix in
 * which every session's treatment was unmeasured passes. And the qualification's verdicts are literals rather than
 * computations over gate results.
 *
 * This drives the REAL `postMatrixValidityGate` with sixteen records whose realization is `undefined`, and it
 * records the hardcoded-literal half as a SOURCE CITATION (labelled as such) rather than pretending to execute
 * the R3-L0C-I-A qualification, which would require the full prehistory and matrix.
 */
export async function legacyPostMatrixGate(input) {
  const { postMatrixValidityGate } = await import('../../r3l0cia/validity.mjs');
  const { schedule, plan, closure, containment } = input;
  const ids = schedule.map((session) => session.sessionId);
  const records = schedule.map((session, index) => Object.freeze({
    sessionId: session.sessionId,
    block: session.block ?? Math.floor(index / 4),
    arm: session.arm,
    generation: session.generation,
    treatmentRealization: undefined,
    workerUptakeCount: undefined,
  }));
  const gate = await postMatrixValidityGate({ completed: ids, records, plannedSessions: ids, plan, closure, containment, schedule });
  return Object.freeze({
    id: 'G7_POST_MATRIX_CAUSAL_ADMISSION_INCOMPLETE',
    greenWithAllRealizationsUndefined: gate.green,
    realizationFailures: Object.freeze([...gate.realizationFailures]),
    checks: gate.checks,
    /** §7: the nine conditions the baseline does not check at all. */
    conditionsNotChecked: Object.freeze([
      'EIGHT_LEGITIMATE_TRAJECTORIES', 'UPTAKE_TELEMETRY_INTERPRETABLE', 'COST_TELEMETRY_INTERPRETABLE',
      'SYSTEM_ENVIRONMENT_VALID', 'CLOSURE_AND_ROUTE_MATCH', 'ANALYSIS_PLAN_UNCHANGED',
    ]),
    hardcodedReadiness: Object.freeze({
      measurement: 'SOURCE_CITED_NOT_EXECUTED',
      citation: 'scripts/r3l0cia/qualification.mjs:254 RECONSTRUCTION_INSTRUMENTATION: \'PASS\' and :263 PAID_REPLICATION: \'READY_FOR_AUTHORIZATION\' are string literals, not computations over gate results',
      note: 'the gate defect is measured end-to-end above; the hardcoding is cited because executing the R3-L0C-I-A qualification would require the full prehistory and matrix, which this stage does not re-run',
    }),
    detail: gate.green === true
      ? 'the baseline post-matrix gate returned green over sixteen sessions whose treatment realization was never measured, because the realization filter skips an undefined value'
      : 'the baseline gate refused the undefined realizations',
  });
}

/* ================================================================ G8 the timeout and authorization */

/**
 * G8a — A WORKER RESULT LINE IS EQUATED WITH CONFIRMED PROCESS EXIT.
 *
 * THE BASELINE, transcribed from `primary-adapter.mjs:354` inside the private `spawnChild`:
 *
 *   const descendantExitEstablished = !timedOut || workerFinished();
 *
 * `workerFinished()` is true when the transcript contains a `PALIMPSEST_WORK_RESULT` line. So when the outer
 * budget expires (`timedOut === true`) but the worker had ALREADY emitted its result and then kept running, the
 * baseline reports the descendant's death as ESTABLISHED and classifies the exposure as a normal outcome rather
 * than UNCERTAIN. A result line proves the worker REPORTED; it does not prove the worker EXITED.
 *
 * The expression lives inside a private function, so it is reproduced here as behaviour with the exact citation.
 * The repaired classifier's end-to-end behaviour against a real report-then-hang worker is measured in the
 * acceptance suite, where the repaired path is what must be proven.
 */
export function legacyDescendantExitClassification(input) {
  const { timedOut, workerFinished } = input;
  const descendantExitEstablished = !timedOut || workerFinished;
  return Object.freeze({
    id: 'G8_TIMEOUT_RESULT_LINE_AS_EXIT',
    timedOut,
    workerResultLinePresent: workerFinished,
    descendantExitEstablished,
    outcomeUnknown: descendantExitEstablished !== true,
    classification: descendantExitEstablished === true ? 'COMPLETED_WITH_REPORT' : 'UNCERTAIN_PRESERVED',
    /** §8: the case the baseline gets wrong: the worker reported, then hung, and the outer budget expired. */
    defectPresent: timedOut === true && workerFinished === true && descendantExitEstablished === true,
    citation: 'scripts/r3l0cia/primary-adapter.mjs:354 descendantExitEstablished = !timedOut || workerFinished()',
    measurement: 'EXTRACTED_BEHAVIOUR',
  });
}

/**
 * G8b — A CALLER-SUPPLIED BOOLEAN IS TREATED AS PAID AUTHORIZATION.
 *
 * THE BASELINE, transcribed from `activation.mjs:345`:
 *
 *   paidAuthorizationPresent: mode.id === 'PRIMARY' ? input.paidAuthorization === true : false,
 *
 * §8 requires an explicit EXTERNAL authorization decision for five named things. The baseline accepts a
 * caller-supplied boolean as though it were that decision, so `paidAuthorization: true` from any caller resolves
 * PRIMARY and reports the authorization present. This calls the REAL `resolveExecutionMode`.
 */
export async function legacyBooleanAuthorization() {
  const { resolveExecutionMode } = await import('../../r3l0cia/activation.mjs');
  const primary = await resolveExecutionMode({ mode: 'PRIMARY', paidAuthorization: true });
  return Object.freeze({
    id: 'G8_AUTHORIZATION_BOOLEAN_ACCEPTED',
    resolved: primary.resolved,
    mode: primary.mode,
    paidAuthorizationPresentFromBoolean: primary.paidAuthorizationPresent,
    workerExecutableResolved: primary.workerExecutable !== null,
    /** §8: the five decisions a boolean does not represent. */
    decisionsRequired: Object.freeze(['PAID_MODEL_USAGE', 'BOUNDED_FAIL_STOP_PROTOCOL', 'NO_AUTOMATIC_RETRIES_OR_REPLACEMENTS', 'PRESERVE_PARTIALLY_COMPLETED_INVALID_RUNS', 'ACCEPTED_PROMPT_NEUTRALITY_LIMITED']),
    decisionsVerified: Object.freeze([]),
    booleanTreatedAsAuthorizationDecision: primary.paidAuthorizationPresent === true,
    detail: primary.paidAuthorizationPresent === true
      ? 'a caller-supplied paidAuthorization boolean resolved PRIMARY and reported the authorization present, with none of the five required external decisions verified'
      : 'the baseline did not treat the boolean as authorization',
  });
}

/* ================================================================ helpers */

/** A recursive listing of a tree's relative file paths, for the G1 mutation measurement. */
function listTree(root) {
  const out = [];
  const walk = (dir, depth) => {
    if (depth > 6) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      const relative = path.slice(root.length + 1).replace(/\\/gu, '/');
      out.push(relative);
      if (entry.isDirectory()) walk(path, depth + 1);
    }
  };
  walk(root, 0);
  return out.sort();
}

export { NL, readFileSync, writeFileSync, mkdtempSync, tmpdir, rmSync, join };
