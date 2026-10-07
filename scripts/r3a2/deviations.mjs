#!/usr/bin/env node
/**
 * R3-A2 §"No primary-fixture smoke"/§"Primary qualification evidence" — RECORD THE PROTOCOL DEVIATIONS.
 *
 * §"No primary-fixture smoke" says: "Any accidental new-fixture worker run outside the schedule is a protocol
 * deviation and does not count toward Nq."
 *
 * Two things happened before the frozen matrix that this stage must put on the record rather than omit:
 *
 *   1. `PRE_EXECUTION_HARNESS_DEFECTS` — the first attempt to launch the matrix aborted 2,395 times without
 *      ever starting a worker. Two defects were found and fixed: a wrong export name in the trial harness
 *      (`MODEL_ROUTES` vs `MODEL_ROUTES_SENTINEL`), and a retry loop whose bound was keyed on the number of
 *      pairs that had any valid run, which for the first pair is always zero and therefore spun without limit.
 *      No model session was created by any of those aborted launches, so no trial and no Nq contribution came
 *      from them. Both fixes were made BEFORE primary trial 1, so the engine-immutability clause was never
 *      engaged.
 *
 *   2. `OUT_OF_PROTOCOL_PREQUALIFICATION_SMOKE` — one F-C × deepseek-flash run was executed directly against
 *      the real fixture to verify the harness end to end before committing the 20-run budget. §"No primary-
 *      fixture smoke" classifies this as a protocol deviation. Its evidence is preserved here, it is NOT one
 *      of the 20 scheduled valid runs, and it does NOT count toward Nq.
 *
 * The post-outcome implementation correction R3-AE had to record does NOT recur here: the two defects above
 * were found before trial 1, and every digest the plan froze was verified unchanged after trial 20.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');
const NL = String.fromCharCode(10);
const SMOKE = process.argv[2] ?? '';

const deviations = [];
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/* -- §"No primary-fixture smoke": the aborted pre-execution launches ----------------------------- */
deviations.push(Object.freeze({
  kind: 'PRE_EXECUTION_HARNESS_DEFECTS',
  when: 'before primary trial 1',
  what: 'the first launch of the matrix aborted 2395 times without ever starting a worker',
  defects: Object.freeze([
    Object.freeze({
      id: 'TRIAL_IMPORT_NAME',
      detail: 'scripts/r3a2/trial.mjs imported `MODEL_ROUTES` from ./models.mjs, which exports `MODEL_ROUTES_SENTINEL`; every launch died at module link time',
      fix: 'the import and both its uses now name MODEL_ROUTES_SENTINEL',
    }),
    Object.freeze({
      id: 'UNBOUNDED_RETRY_LOOP',
      detail: 'the retry loop condition was `validByPair.size === 0 || attemptsHere < MAX_ATTEMPTS_PER_PAIR`, which for the first pair is always true and spun without limit',
      fix: 'the loop is now bounded by its own per-run counter alone',
    }),
  ]),
  nqImpact: 'NONE — no worker process and no model session was created by any aborted launch, so no trial record and no Nq contribution came from them',
  evidence: 'the run directory held no trial.json, no worker transcript and no session artifact after the aborted launch',
  immutabilityImpact: 'NONE — both fixes were made before primary trial 1, so the engine-immutability clause was never engaged',
}));

/* -- §"No primary-fixture smoke": the out-of-protocol smoke run ---------------------------------- */
if (SMOKE !== '' && existsSync(SMOKE)) {
  const record = JSON.parse(readFileSync(SMOKE, 'utf8'));
  const source = existsSync(join(SMOKE, '..', 'final-source.txt')) ? readFileSync(join(SMOKE, '..', 'final-source.txt'), 'utf8') : null;
  deviations.push(Object.freeze({
    kind: 'OUT_OF_PROTOCOL_PREQUALIFICATION_SMOKE',
    when: 'before the frozen matrix, after the plan commit',
    fixtureId: record.fixtureId,
    modelId: record.modelId,
    routeId: record.routeId,
    repetition: record.repetition,
    what: 'one F-C x deepseek-flash run was executed directly to verify the harness end to end before committing the 20-run budget',
    countsTowardNq: false,
    countsAsScheduledRun: false,
    evidence: Object.freeze({
      trialId: record.trialId,
      jobPhase: record.jobPhase,
      classPass: record.classPass,
      classCoverage: record.classCoverage,
      fullSolve: record.fullSolve,
      finalAcceptance: record.finalAcceptance,
      elapsedMs: record.elapsedMs,
      revisions: record.revisions,
      usage: record.usage,
      cost: record.cost,
      treatmentIndependence: record.treatmentIndependence,
      worldHead: record.worldHead,
      sourceSha256: source === null ? null : sha256(source),
      sourceBytes: source === null ? null : Buffer.byteLength(source, 'utf8'),
    }),
    note: 'the run scored 6/6 classes, which is the same ceiling the four scheduled F-C/F-D pairs reached; it is recorded as a deviation and not as evidence of anything',
  }));
}

/* -- §"Engine immutability": the post-matrix digest verification --------------------------------- */
const { ENGINE_DIGESTS } = await import('./plan.mjs');
const drift = Object.entries(ENGINE_DIGESTS).filter(([relative, digest]) => sha256(readFileSync(join(REPO_ROOT, relative), 'utf8')) !== digest);
deviations.push(Object.freeze({
  kind: 'ENGINE_IMMUTABILITY_VERIFICATION',
  when: 'after primary trial 20',
  driftedArtifacts: Object.freeze(drift.map(([relative]) => relative)),
  held: drift.length === 0,
  note: drift.length === 0
    ? 'every digested artifact is byte-identical to the plan the runs were executed against'
    : 'STOP CONDITION: a digested artifact changed after trial 1; the stage must not patch and continue',
}));

const record = Object.freeze({
  schemaVersion: 1,
  stage: 'R3-A2',
  kind: 'protocol deviations',
  deviations: Object.freeze(deviations),
  /** §"Research ruling": the two laws, restated so a reader sees them applied rather than quoted. */
  lawsApplied: Object.freeze({
    portfolioQualificationNotBridgeHunting: 'the four new pairs were qualified whatever their outcome; no fixture was revised to move a verdict',
    noFixtureAuthoredAfterFirstRun: 'no fixture was authored or revised after primary trial 1',
    historicalVerdictsUnchanged: 'the R3-A0/R3-AE verdicts were carried forward from the committed record and not rerun',
  }),
});

mkdirSync(join(REPO_ROOT, 'research-evidence', 'r3-a2'), { recursive: true });
writeFileSync(join(REPO_ROOT, 'research-evidence', 'r3-a2', 'protocol-deviations.json'), `${JSON.stringify(record, null, 2)}${NL}`, 'utf8');
for (const deviation of deviations) process.stdout.write(`${deviation.kind}: ${deviation.what ?? deviation.note ?? ''}${NL}`);
process.stdout.write(`wrote research-evidence/r3-a2/protocol-deviations.json${NL}`);
