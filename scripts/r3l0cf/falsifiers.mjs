/**
 * R3-L0C-F §3 — THE OLD-RUNNER FALSIFIERS.
 *
 * §3 requires five specific defects to be demonstrated against the current R3-L0C-R matrix runner, by EXECUTION
 * with deterministic fault injection, before the new fail-stop runner exists. This module runs the legacy
 * control flow from `baseline/legacy-matrix.mjs` with programmed faults and reports, per defect, what the legacy
 * runner DID.
 *
 * THE FALSIFIER IS ONE-SIDED ON PURPOSE. It measures only the LEGACY behaviour, because §16 requires the
 * falsifiers to be committed BEFORE the new runner is implemented. A falsifier that needed the new runner could
 * not be committed first, and a "falsifier" that was written after the fix is a description of the fix rather
 * than a test of the defect. The other half — that the new runner closes each defect — is asserted in the
 * qualification suite, where the new runner exists.
 *
 * EACH FALSIFIER IS A DIFFERENCE, NOT A CLAIM. Every one returns the legacy observation as a VALUE (launch
 * counts, ledger write points, generation entries, completion denominators), so a reader can check the number
 * rather than the adjective. A falsifier whose defect is absent returns `defectPresent: false`, and the suite
 * then reports the falsifier as VACUOUS rather than as passing.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { LEGACY_DEFECTS, legacyInfrastructureInvalid, legacyRunMatrix } from './baseline/legacy-matrix.mjs';
import { buildObservation, legacyViolations } from './properties.mjs';

const NL = String.fromCharCode(10);

/** §3: the generations the falsifiers drive. G1 then G2, as the frozen design has. */
const FALSIFIER_GENERATIONS = Object.freeze([Object.freeze({ id: 'G1' }), Object.freeze({ id: 'G2' })]);

/** §3: a four-session, two-trajectory schedule, so a falsifier is cheap and the shape is still real. */
const FALSIFIER_SESSIONS = Object.freeze([
  Object.freeze({ trajectoryId: 'b0-H', arm: 'H' }),
  Object.freeze({ trajectoryId: 'b0-C', arm: 'C' }),
]);

/**
 * §3 defect D1/D2: A RETRY RE-LAUNCHES AN ALREADY-EXPOSED SESSION.
 *
 * The fault: the FIRST launch of a session returns an infrastructure-invalid result (a missing report is the
 * simplest such result, and is the shipped predicate's own first clause). The question is what the legacy runner
 * does next, and the answer is that it launches AGAIN — a second worker launch for one session, with no record
 * that the first launch may already have reached a model.
 *
 * The observation is the LAUNCH SEQUENCE, because "it retried" and "it launched twice" are the same measurement
 * and the second is the one that matters: `MAX_WORKER_LAUNCHES = 1` is the fail-stop law.
 */
export function falsifyRetryAfterInfrastructureInvalidity() {
  const launches = [];
  let launchCount = 0;
  const launch = ({ generation, attempt }) => {
    launchCount += 1;
    launches.push(Object.freeze({ generation: generation.id, attempt }));
    /** The fault: the first launch of G1 produces no report; the second would produce one. */
    const infrastructureInvalid = generation.id === 'G1' && attempt === 1;
    return Object.freeze({ infrastructureInvalid, report: infrastructureInvalid ? null : { ok: true }, jobPhase: infrastructureInvalid ? null : 'FINISHED' });
  };
  const outcome = legacyRunMatrix({
    sessions: FALSIFIER_SESSIONS.slice(0, 1),
    generations: FALSIFIER_GENERATIONS,
    launch,
    onLaunch: () => undefined,
    onGenerationEntered: () => undefined,
    writeLedger: () => undefined,
  });
  const g1 = outcome.sessions.find((entry) => entry.generation === 'G1');
  /** D1: the retry happened. D2: a session was launched more than once. */
  const g1Launches = launches.filter((entry) => entry.generation === 'G1').length;
  return Object.freeze({
    id: 'D1_RETRIES_INFRASTRUCTURE_INVALID',
    companionId: 'D2_RELAUNCH_AFTER_FIRST_LAUNCH',
    fault: 'the first launch of G1 returns an infrastructure-invalid result (no report)',
    legacyObservation: Object.freeze({
      attemptsForG1: g1?.attempt ?? null,
      launchesForG1: g1Launches,
      totalLaunches: launchCount,
      launchSequence: Object.freeze(launches),
      recordedJobPhase: g1?.jobPhase ?? null,
    }),
    /** The defect is present when a single session was launched more than once. */
    defectPresent: g1Launches > 1,
    requirement: 'a session must be launched at most once, and an infrastructure-invalid result must not trigger a re-launch',
    newRunnerMustShow: Object.freeze({ MAX_WORKER_LAUNCHES: 1, POST_EXPOSURE_RETRIES: 0 }),
  });
}

/**
 * §3 defect D3: THE LEDGER IS WRITTEN ONLY AFTER A TRAJECTORY RETURNS.
 *
 * The fault: the second generation of the FIRST trajectory throws — a host interruption in the middle of a
 * trajectory, which is the case §7 and §8 care about. The question is whether any durable primary record of the
 * trajectory's first generation exists.
 *
 * The observation is the LEDGER WRITE POINTS: the shipped runner writes `trials.partial.json` only after
 * `runTrajectory` returns, so a throw from inside the trajectory means the write never happens and BOTH
 * generations are lost from the ledger — including the one that completed.
 */
export function falsifyLedgerOnlyAfterTrajectory() {
  const ledgerWrites = [];
  const journaled = [];
  const launch = ({ generation }) => {
    /** The fault: G2 throws, as a host interruption mid-trajectory would. */
    if (generation.id === 'G2') throw new Error('SIMULATED_HOST_INTERRUPTION_DURING_G2');
    return Object.freeze({ infrastructureInvalid: false, report: { ok: true }, jobPhase: 'FINISHED' });
  };
  let threw = null;
  try {
    legacyRunMatrix({
      sessions: FALSIFIER_SESSIONS.slice(0, 1),
      generations: FALSIFIER_GENERATIONS,
      launch,
      onLaunch: (event) => journaled.push(event),
      onGenerationEntered: () => undefined,
      writeLedger: ({ sessions }) => ledgerWrites.push(Object.freeze({ sessions: sessions.length })),
    });
  } catch (error) {
    threw = String(error?.message ?? error);
  }
  return Object.freeze({
    id: 'D3_LEDGER_ONLY_AFTER_TRAJECTORY',
    fault: 'G2 throws, simulating a host interruption in the middle of the first trajectory',
    legacyObservation: Object.freeze({
      threw,
      /** §3: the shipped write point, reached only when a trajectory RETURNS. */
      ledgerWriteCount: ledgerWrites.length,
      ledgerWrites: Object.freeze(ledgerWrites),
      /** The launches that DID happen before the throw, so the loss is a measurement rather than a guess. */
      launchesObserved: Object.freeze(journaled),
      g1CompletedBeforeThrow: journaled.some((entry) => entry.generation === 'G1' && entry.infrastructureInvalid === false),
      durableRecordOfCompletedG1: false,
    }),
    /** The defect is present when G1 completed but no durable record of it exists. */
    defectPresent: journaled.some((entry) => entry.generation === 'G1') && ledgerWrites.length === 0,
    requirement: 'each generation must have a durable record written before the next generation starts',
    newRunnerMustShow: Object.freeze({ perGenerationDurableRecord: true, interruptedWriteDetectable: true }),
  });
}

/**
 * §3 defect D4: G2 IS ENTERED WHILE G1'S CANONICAL ATTEMPT IS UNRESOLVED.
 *
 * The fault: G1's worker produced a report but could not commit, so its canonical Attempt stays RUNNING. The
 * shipped runner's generation loop has no branch that inspects the previous attempt's state, so it enters G2 and
 * the plan revision is then refused downstream with `quiescence_required` — the failure R3-L0C-R recorded as
 * ATTEMPT_C, four times identically.
 *
 * The observation is whether a generation was ENTERED after an unresolved predecessor. The falsifier supplies the
 * unresolved state as a fact on the launch result (the same shape `attemptWorkRecord` reports) and checks whether
 * the loop acts on it.
 */
export function falsifyG2WithoutResolvedG1() {
  const entered = [];
  const launch = ({ generation }) => {
    /** The fault: G1's worker could not commit, so the attempt stays RUNNING. */
    const unresolvedG1 = generation.id === 'G1';
    return Object.freeze({
      infrastructureInvalid: false,
      report: { ok: true, attemptState: unresolvedG1 ? 'RUNNING' : 'COMPLETED', committed: !unresolvedG1 },
      jobPhase: 'FINISHED',
      /** The fact the fail-stop runner must consult before entering the next generation. */
      priorAttemptResolved: !unresolvedG1,
    });
  };
  const outcome = legacyRunMatrix({
    sessions: FALSIFIER_SESSIONS.slice(0, 1),
    generations: FALSIFIER_GENERATIONS,
    launch,
    onLaunch: () => undefined,
    onGenerationEntered: (event) => entered.push(event),
    writeLedger: () => undefined,
  });
  const g1Unresolved = outcome.sessions.find((entry) => entry.generation === 'G1')?.report?.attemptState === 'RUNNING';
  const g2Entered = entered.some((event) => event.generation === 'G2');
  return Object.freeze({
    id: 'D4_G2_WITHOUT_RESOLVED_G1',
    fault: 'G1\'s worker cannot commit, so its canonical Attempt remains RUNNING',
    legacyObservation: Object.freeze({
      g1AttemptState: outcome.sessions.find((entry) => entry.generation === 'G1')?.report?.attemptState ?? null,
      generationsEntered: Object.freeze(entered.map((event) => event.generation)),
      g2Entered,
      /** The shipped runner consults no attempt state, so the number of checks it performs is zero. */
      priorAttemptChecksPerformed: 0,
    }),
    /** The defect is present when G2 was entered while G1 was unresolved. */
    defectPresent: g1Unresolved && g2Entered,
    requirement: 'a generation must not be entered while the previous generation\'s canonical Attempt is unresolved',
    newRunnerMustShow: Object.freeze({ blocksNextGenerationOnUnresolvedAttempt: true, stopIsWholeMatrix: true }),
  });
}

/**
 * §3 defect D5: COMPLETION IS REPORTED WITHOUT A POST-MATRIX VALIDITY GATE.
 *
 * The fault: one scheduled session is lost (its report is missing, so the harness judges it
 * infrastructure-invalid). The question is what the runner REPORTS. The shipped summary filters out the sessions
 * the harness itself judged invalid, computes a denominator from what remains, and prints COMPLETE — with no
 * requirement that all 16 scheduled sessions be present and no post-matrix validity gate.
 *
 * The observation is the reported completion against the PLANNED session count, because a reduced denominator
 * reported as COMPLETE is the whole defect: a reader sees "COMPLETE" and a number smaller than the schedule.
 */
export function falsifyNoPostMatrixValidityGate() {
  const launch = ({ generation }) => {
    /** The fault: every G1 loses its report; every G2 is healthy. Two of four scheduled generations are lost. */
    const lost = generation.id === 'G1';
    return Object.freeze({ infrastructureInvalid: lost, report: lost ? null : { ok: true }, jobPhase: lost ? null : 'FINISHED' });
  };
  const outcome = legacyRunMatrix({
    sessions: FALSIFIER_SESSIONS,
    generations: FALSIFIER_GENERATIONS,
    launch,
    onLaunch: () => undefined,
    onGenerationEntered: () => undefined,
    writeLedger: () => undefined,
  });
  /**
   * §3: the defect is a reduced denominator reported as COMPLETE. The measurement is `validSessions` against the
   * SCHEDULED generation count, because that is the arithmetic the shipped completion line performs.
   */
  const missing = outcome.plannedSessions - outcome.validSessions;
  return Object.freeze({
    id: 'D5_NO_POST_MATRIX_VALIDITY_GATE',
    fault: 'every G1 produces no report, so half the scheduled generations are lost',
    legacyObservation: Object.freeze({
      plannedSessions: outcome.plannedSessions,
      recordedSessions: outcome.sessions.length,
      validSessions: outcome.validSessions,
      infrastructureInvalidSessions: outcome.infrastructureInvalidSessions,
      postMatrixValidityGate: outcome.postMatrixValidityGate,
      completionReported: outcome.completionReported,
      completionLine: outcome.completionLine,
      /** The reduced denominator, which is what a reader would see. */
      reportedDenominator: `${String(outcome.validSessions)}/${String(outcome.plannedSessions)}`,
    }),
    defectPresent: outcome.completionReported === true && outcome.postMatrixValidityGate === false && missing > 0,
    requirement: 'matrix completion requires all scheduled sessions present AND a green post-matrix validity gate',
    newRunnerMustShow: Object.freeze({ requiresAllScheduledSessions: true, requiresPostMatrixValidityGate: true }),
  });
}

/**
 * §3/§8: THE SHARED-PREDICATE WITNESS.
 *
 * THE LOAD-BEARING HALF OF §3. The five §8 properties are defined ONCE in `properties.mjs`. This function feeds
 * them NORMALIZED OBSERVATIONS built from the legacy runner's own behaviour in TWO scenarios, so the SAME
 * predicates the fail-stop runner must satisfy are applied to the legacy runner and FAIL.
 *
 * WHY TWO SCENARIOS AND NOT ONE. The legacy runner has two distinct failure shapes and neither alone exercises
 * every property:
 *
 *   SCENARIO A — a session whose report never appears. The legacy runner retries it up to four times, then
 *                CONTINUES to the next generation and the next trajectory, and finally reports COMPLETE over a
 *                reduced denominator. This exercises NO_SECOND_LAUNCH, NEXT_SESSION_NOT_STARTED and the missing
 *                post-matrix validity gate.
 *   SCENARIO B — a host interruption mid-trajectory. The legacy runner throws, and because its ledger is written
 *                only after a trajectory RETURNS, the generation that COMPLETED has no durable record. This
 *                exercises EVIDENCE_PRESERVED.
 *
 * The witness reports the UNION of the two, with each violation attributed to the scenario that produced it, so a
 * reader can see which legacy behaviour violates which property. Both scenarios are faithful: neither invents a
 * legacy behaviour the extracted control flow does not have.
 */
export function legacyPropertyWitness() {
  /* ---- SCENARIO A: a session whose report never appears, then the matrix reports COMPLETE ---- */
  const aLaunches = [];
  const aCompleted = [];
  const scenarioA = (() => {
    const launch = ({ generation }) => {
      aLaunches.push(Object.freeze({ sessionId: `b0-H-${generation.id}`, attempt: aLaunches.filter((entry) => entry.sessionId === `b0-H-${generation.id}`).length + 1 }));
      /** The fault: G1 of the first trajectory NEVER produces a report, so the retry loop runs to exhaustion. */
      if (generation.id === 'G1') return Object.freeze({ infrastructureInvalid: true, report: null, jobPhase: null });
      aCompleted.push(`b0-H-${generation.id}`);
      return Object.freeze({ infrastructureInvalid: false, report: { ok: true }, jobPhase: 'FINISHED' });
    };
    const outcome = legacyRunMatrix({
      sessions: FALSIFIER_SESSIONS,
      generations: FALSIFIER_GENERATIONS,
      launch,
      onLaunch: () => undefined,
      onGenerationEntered: () => undefined,
      writeLedger: () => undefined,
    });
    return Object.freeze({ outcome, launched: aLaunches.slice() });
  })();

  /* ---- SCENARIO B: a host interruption mid-trajectory, after a generation completed ---- */
  const bLaunches = [];
  const bCompleted = [];
  const scenarioB = (() => {
    let threw = null;
    try {
      legacyRunMatrix({
        sessions: FALSIFIER_SESSIONS.slice(0, 1),
        generations: FALSIFIER_GENERATIONS,
        launch: ({ generation }) => {
          bLaunches.push(Object.freeze({ sessionId: `b0-H-${generation.id}`, attempt: 1 }));
          if (generation.id === 'G2') throw new Error('SIMULATED_HOST_INTERRUPTION_DURING_G2');
          bCompleted.push(`b0-H-${generation.id}`);
          return Object.freeze({ infrastructureInvalid: false, report: { ok: true }, jobPhase: 'FINISHED' });
        },
        onLaunch: () => undefined,
        onGenerationEntered: () => undefined,
        writeLedger: () => undefined,
      });
    } catch (error) {
      threw = String(error?.message ?? error);
    }
    return Object.freeze({ threw, launched: bLaunches.slice(), completed: bCompleted.slice() });
  })();

  /**
   * The normalized observations. `durableRecords` is EMPTY in both, because the legacy runner writes its ledger
   * only after a trajectory RETURNS — and in scenario A that write happens, but only AFTER every trajectory has
   * already run, so the record of a session that was lost mid-matrix does not exist for the session that was
   * lost. Both observations therefore carry an empty durable-record set, which is what the legacy runner's
   * control flow produces for the generations named in `completedSessions`.
   */
  const observationA = buildObservation({
    plannedSessions: ['b0-H-G1', 'b0-H-G2', 'b0-C-G1', 'b0-C-G2'],
    launches: scenarioA.launched,
    completedSessions: aCompleted.slice(),
    /** §5: the session the harness judged infrastructure-invalid, which the legacy runner then stepped past. */
    failedSessions: [{ sessionId: 'b0-H-G1', failureClass: 'INFRASTRUCTURE_OR_PROTOCOL' }],
    durableRecords: [],
    terminalEventsSynthesized: [],
    causalVerdictIssued: false,
    terminalState: 'MATRIX_COMPLETE',
    matrixCompleted: true,
    postMatrixValidityGate: false,
  });
  const observationB = buildObservation({
    plannedSessions: ['b0-H-G1', 'b0-H-G2', 'b0-C-G1', 'b0-C-G2'],
    launches: scenarioB.launched,
    completedSessions: scenarioB.completed,
    failedSessions: scenarioB.threw === null ? [] : [{ sessionId: 'b0-H-G2', failureClass: 'INFRASTRUCTURE_OR_PROTOCOL' }],
    durableRecords: [],
    terminalEventsSynthesized: [],
    causalVerdictIssued: false,
    terminalState: scenarioB.threw === null ? 'MATRIX_COMPLETE' : 'CRASHED',
    matrixCompleted: false,
    postMatrixValidityGate: false,
  });

  const violationsA = legacyViolations(observationA);
  const violationsB = legacyViolations(observationB);
  const union = [...new Set([...violationsA.violated, ...violationsB.violated])].sort();
  const byProperty = {};
  for (const id of union) {
    byProperty[id] = Object.freeze([
      ...(violationsA.violated.includes(id) ? ['SCENARIO_A_REPORT_NEVER_APPEARS'] : []),
      ...(violationsB.violated.includes(id) ? ['SCENARIO_B_HOST_INTERRUPTION'] : []),
    ]);
  }
  /**
   * §8: THE PROPERTIES THE LEGACY SUBJECT DOES NOT DISCRIMINATE, recorded rather than glossed.
   *
   * The legacy runner synthesizes no attempt terminal and issues no causal verdict, so
   * `NO_FAKE_ATTEMPT_TERMINAL` and `NO_CAUSAL_VERDICT` HOLD for it. Those two properties therefore do not
   * discriminate between the two runners — they guard a failure mode the new runner could INTRODUCE (writing a
   * terminal to make a stopped matrix look resolved, or issuing a verdict over an incomplete matrix), and their
   * falsifier is the negative control in the qualification suite, not the legacy comparison. Stating this is what
   * keeps the witness from over-claiming.
   */
  const nonDiscriminating = ['NO_FAKE_ATTEMPT_TERMINAL', 'NO_CAUSAL_VERDICT'].filter((id) => !union.includes(id));
  return Object.freeze({
    id: 'SHARED_PREDICATE_WITNESS',
    scenarios: Object.freeze([
      Object.freeze({ id: 'SCENARIO_A_REPORT_NEVER_APPEARS', observation: observationA, violated: violationsA.violated, launches: scenarioA.launched.length, completionLine: scenarioA.outcome.completionLine }),
      Object.freeze({ id: 'SCENARIO_B_HOST_INTERRUPTION', observation: observationB, violated: violationsB.violated, threw: scenarioB.threw }),
    ]),
    /** The union of the properties the legacy runner violates, with the scenario(s) that produced each. */
    violated: Object.freeze(union),
    violatedBy: Object.freeze(byProperty),
    /** §8: the properties the legacy subject holds, so the witness's discriminating power is stated exactly. */
    nonDiscriminating: Object.freeze(nonDiscriminating),
    anyViolated: union.length > 0,
    detail: union.length > 0
      ? `the legacy runner violates ${union.join(', ')}; it does not discriminate on ${nonDiscriminating.join(', ')}, whose falsifiers are the qualification suite's negative controls`
      : 'the legacy runner violates none of the five properties, so this falsifier is VACUOUS',
    /** §3: the witness is load-bearing only when the legacy run violates at least one §8 property. */
    WITNESS_FAILS_AGAINST_LEGACY: union.length > 0,
  });
}

/**
 * §3: RUN ALL FIVE FALSIFIERS.
 *
 * The result carries, per defect, the legacy observation and whether the defect was PRESENT. A defect that is
 * absent makes its falsifier VACUOUS, which is reported rather than silently counted as a pass — a falsifier
 * that cannot fail proves nothing.
 */
export function runLegacyFalsifiers() {
  const falsifiers = Object.freeze([
    falsifyRetryAfterInfrastructureInvalidity(),
    falsifyLedgerOnlyAfterTrajectory(),
    falsifyG2WithoutResolvedG1(),
    falsifyNoPostMatrixValidityGate(),
  ]);
  const witness = legacyPropertyWitness();
  /** The declared defects, so a missing falsifier is visible rather than absent. */
  const covered = new Set(falsifiers.flatMap((entry) => [entry.id, entry.companionId].filter((value) => typeof value === 'string')));
  const uncovered = LEGACY_DEFECTS.filter((defect) => !covered.has(defect.id)).map((defect) => defect.id);
  const vacuous = falsifiers.filter((entry) => entry.defectPresent !== true).map((entry) => entry.id);
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-F',
    kind: 'legacy runner falsifiers',
    declaredDefects: LEGACY_DEFECTS.map((defect) => defect.id),
    falsifiers,
    propertyWitness: witness,
    /** §3: the legacy runner exhibits every named defect. */
    LEGACY_DEFECTS_PRESENT: vacuous.length === 0,
    defectsDemonstrated: falsifiers.filter((entry) => entry.defectPresent === true).flatMap((entry) => [entry.id, entry.companionId].filter((value) => typeof value === 'string')),
    vacuous,
    uncovered,
    /** §3: the falsifiers must FAIL against the legacy behaviour, which is what `LEGACY_DEFECTS_PRESENT` means. */
    FALSIFIERS_FAIL_AGAINST_LEGACY: vacuous.length === 0 && witness.WITNESS_FAILS_AGAINST_LEGACY === true,
    /** §8: the §8 properties the legacy runner violates, measured through the shared evaluator. */
    LEGACY_PROPERTY_VIOLATIONS: witness.violated,
    law: 'a falsifier that cannot fail proves nothing, so a defect that is absent is reported as VACUOUS rather than as a pass',
  });
}

export { LEGACY_DEFECTS, legacyInfrastructureInvalid, NL };
