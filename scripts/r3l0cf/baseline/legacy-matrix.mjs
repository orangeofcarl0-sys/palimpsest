/**
 * R3-L0C-F §3 — THE LEGACY RUNNER, EXTRACTED VERBATIM FOR FALSIFICATION.
 *
 * §3 requires the old runner's five defects to be demonstrated BEFORE the new runner is implemented, and it
 * requires the demonstration to come from OBSERVED EXECUTION rather than from reading the file. So the old
 * runner's control flow is extracted here — the retry loop, the ledger write point, the generation-2 entry and
 * the completion summary — with the two side effects that need fault injection (the child launch and the ledger
 * write) made INJECTABLE. Everything else is the shipped logic.
 *
 * THIS IS A BASELINE COPY, AND IT IS LABELLED AS ONE. It is the established pattern in this repository: R3-WR5
 * kept `baseline/git_port.r3wr4.mjs` compiled from the earlier stage's source so a witness could be run against
 * the FIXED baseline and could therefore still fail. A witness that compared against an already-repaired
 * implementation could never fail, which is the vacuous-gate failure this file exists to avoid.
 *
 * FIDELITY IS ASSERTED, NOT ASSUMED. Each extracted function names the exact source lines it reproduces in
 * `scripts/r3l0cr/matrix.mjs` at baseline `19f0c69`, and `scripts/r3l0cf/falsifiers.mjs` carries a structural
 * comparison of the extracted retry loop against the shipped one. The comparison is a SUPPLEMENT: the five
 * defects are measured by EXECUTING this module, not by matching its text.
 *
 * WHAT IS DELIBERATELY NOT EXTRACTED. The real `runGeneration` spawns a child process, drives the packaged DSH
 * worker and requires the frozen sentinel route. That path cannot be exercised without a model call, and §0
 * forbids model calls in this stage. So the spawn is replaced by an injected `launch` seam with the SAME
 * contract — it returns `{ infrastructureInvalid }` and may throw — and the retry/ledger/entry logic around it is
 * copied unchanged. The defects §3 names are all in that surrounding logic, not in the spawn.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

const NL = String.fromCharCode(10);

/** §3: the source this baseline reproduces, so a reader can diff it. */
export const BASELINE_SOURCE = Object.freeze({
  path: 'scripts/r3l0cr/matrix.mjs',
  revision: '19f0c69833f33c51ada8642379980c490cb75d04',
  /** The exact shipped constructs each extraction reproduces. */
  reproduces: Object.freeze([
    Object.freeze({ id: 'RETRY_LOOP', shippedLines: '118-121', construct: 'while (attempt < 4) { attempt += 1; result = runGeneration(...); if (!result.infrastructureInvalid) break; }' }),
    Object.freeze({ id: 'INFRASTRUCTURE_INVALIDITY', shippedLines: '97', construct: 'const infrastructureInvalid = report === null || report.ok !== true || report.jobPhase === \'HOST_ERROR\';' }),
    Object.freeze({ id: 'GENERATION_ORDER', shippedLines: '109', construct: 'for (const generation of GENERATIONS) { ... }' }),
    Object.freeze({ id: 'PARTIAL_LEDGER', shippedLines: '314', construct: 'writeFileSync(join(runRoot, \'private\', \'evidence\', \'trials.partial.json\'), ...) — inside the trajectory loop, AFTER the trajectory returns' }),
    Object.freeze({ id: 'COMPLETION_SUMMARY', shippedLines: '318-345', construct: 'const validSessions = sessions.filter((entry) => entry.infrastructureInvalid !== true); ... summary written and COMPLETE printed' }),
  ]),
  /** §3: the shipped code paths this extraction does NOT reproduce, with the reason. */
  notReproduced: Object.freeze([
    Object.freeze({ id: 'CHILD_SPAWN', reason: 'spawns the packaged DSH worker on the frozen sentinel route, which requires a model call; §0 forbids model calls' }),
    Object.freeze({ id: 'PREFLIGHT_AND_PROBES', reason: 'requires the real prehistory and the packaged runtime; not part of the retry/ledger/entry defect' }),
  ]),
});

/** §3: the old runner's infrastructure-invalidity predicate, copied from shipped line 97. */
export function legacyInfrastructureInvalid(report) {
  return report === null || report.ok !== true || report.jobPhase === 'HOST_ERROR';
}

/**
 * §3: THE LEGACY PER-GENERATION LAUNCH LOOP, copied from shipped lines 118-121.
 *
 * The loop is the first defect: it re-launches a session up to four times whenever the result is judged
 * infrastructure-invalid, with NO record that a model may already have been invoked. It is also the second
 * defect: a re-launch is a second worker launch for the same session, which is exactly what strict fail-stop
 * forbids.
 *
 * The `onLaunch` hook exists so a falsifier can OBSERVE each launch; it does not change the loop.
 */
export function legacyRunGeneration(input) {
  const { generation, launch, onLaunch } = input;
  let attempt = 0;
  let result = null;
  /** VERBATIM: while (attempt < 4) { attempt += 1; result = runGeneration(...); if (!result.infrastructureInvalid) break; } */
  while (attempt < 4) {
    attempt += 1;
    result = launch({ generation, attempt });
    onLaunch?.({ generation: generation.id, attempt, infrastructureInvalid: result?.infrastructureInvalid === true });
    if (!result?.infrastructureInvalid) break;
  }
  return Object.freeze({ generation, attempt, result });
}

/**
 * §3: THE LEGACY TRAJECTORY LOOP, copied from shipped line 109.
 *
 * The generation loop carries the FOURTH defect: it enters the next generation without any check that the
 * PREVIOUS generation's canonical Attempt resolved. In the shipped runner the consequence was measured — an H
 * worker that could not commit left its attempt RUNNING, and the next generation's plan revision was then refused
 * with `quiescence_required` (recorded in `scripts/r3l0cr/attempts.mjs` as ATTEMPT_C). The loop has no branch
 * that would notice.
 */
export function legacyRunTrajectory(input) {
  const { generations, launch, onLaunch, onGenerationEntered, session } = input;
  const recorded = [];
  for (const generation of generations) {
    /** §3 defect 4: entering a generation is unconditional; no prior-attempt-resolution check exists. */
    onGenerationEntered?.({ generation: generation.id, sessionId: session === undefined ? null : `${session.trajectoryId}-${generation.id}`, prior: recorded.map((entry) => entry.generation.id) });
    const outcome = legacyRunGeneration({ generation, session, launch, onLaunch });
    recorded.push(Object.freeze({
      generation: generation.id,
      sessionId: session === undefined ? generation.id : `${session.trajectoryId}-${generation.id}`,
      attempt: outcome.attempt,
      infrastructureInvalid: outcome.result?.infrastructureInvalid === true,
      report: outcome.result?.report ?? null,
      jobPhase: outcome.result?.jobPhase ?? null,
    }));
  }
  return Object.freeze({ generations: Object.freeze(recorded) });
}

/**
 * §3: THE LEGACY MATRIX LOOP, copied from shipped lines 109/314/318-345.
 *
 * The THIRD defect is the ledger write point: the shipped runner writes `trials.partial.json` once per trajectory,
 * INSIDE the trajectory loop and AFTER the trajectory has returned. So a crash in the middle of a trajectory
 * loses every generation of that trajectory, and the file the harness would need to diagnose the crash is the
 * file it had not yet written.
 *
 * The FIFTH defect is the completion summary: `validSessions` is computed by filtering out sessions the harness
 * itself judged infrastructure-invalid, and the summary is then written and `REPAIR REPLICATION COMPLETE` is
 * printed. There is no post-matrix validity gate and no requirement that every scheduled session be present, so a
 * run that lost sessions reports COMPLETE with a reduced denominator.
 */
export function legacyRunMatrix(input) {
  const { sessions, generations, launch, onLaunch, onGenerationEntered, writeLedger } = input;
  const trajectories = [];
  const recorded = [];
  const ledgerWrites = [];
  /** The shipped schedule: one entry per SESSION, with each trajectory's generations pushed when it runs. */
  for (const session of sessions) {
    if (trajectories.some((entry) => entry.trajectoryId === session.trajectoryId)) continue;
    const trajectory = legacyRunTrajectory({ generations, session, launch, onLaunch, onGenerationEntered });
    trajectories.push(Object.freeze({ trajectoryId: session.trajectoryId, generations: trajectory.generations }));
    recorded.push(...trajectory.generations.map((entry) => Object.freeze({ ...entry, trajectoryId: session.trajectoryId, arm: session.arm })));
    /** §3 defect 3: the partial ledger is written ONLY here, after the whole trajectory returned. */
    writeLedger?.({ trajectories, sessions: recorded });
    ledgerWrites.push(Object.freeze({ afterTrajectory: session.trajectoryId, trajectories: trajectories.length, sessions: recorded.length }));
  }
  /** §3 defect 5: completion is reported from whatever sessions were recorded; no post-matrix validity gate. */
  const validSessions = recorded.filter((entry) => entry.infrastructureInvalid !== true);
  /** The scheduled generation count, which is what a complete matrix must contain. */
  const plannedGenerations = new Set(sessions.map((session) => session.trajectoryId)).size * generations.length;
  return Object.freeze({
    trajectories: Object.freeze(trajectories),
    sessions: Object.freeze(recorded),
    validSessions: validSessions.length,
    plannedSessions: plannedGenerations,
    infrastructureInvalidSessions: recorded.filter((entry) => entry.infrastructureInvalid === true).length,
    /** §3 defect 5, stated as the value the shipped runner does NOT compute. */
    postMatrixValidityGate: false,
    completionReported: true,
    completionLine: `REPAIR REPLICATION COMPLETE — ${String(validSessions.length)}/${String(plannedGenerations)} valid sessions`,
  });
}

/**
 * §3: THE FIVE NAMED DEFECTS.
 *
 * Carried as data so a falsifier and a report agree on what was required, and so the new runner's counterpart
 * checks can be named one-for-one.
 */
export const LEGACY_DEFECTS = Object.freeze([
  Object.freeze({ id: 'D1_RETRIES_INFRASTRUCTURE_INVALID', requirement: 'the old runner retries infrastructure-invalid generations' }),
  Object.freeze({ id: 'D2_RELAUNCH_AFTER_FIRST_LAUNCH', requirement: 'the old runner can relaunch a worker after the first launch' }),
  Object.freeze({ id: 'D3_LEDGER_ONLY_AFTER_TRAJECTORY', requirement: 'the old runner writes its primary partial ledger only after a trajectory returns' }),
  Object.freeze({ id: 'D4_G2_WITHOUT_RESOLVED_G1', requirement: 'the old runner can enter G2 when G1\'s canonical Attempt remains unresolved' }),
  Object.freeze({ id: 'D5_NO_POST_MATRIX_VALIDITY_GATE', requirement: 'the old runner does not establish a complete post-matrix validity gate before reporting matrix completion' }),
]);

export { NL };
