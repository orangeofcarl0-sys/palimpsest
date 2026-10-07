/**
 * R3-L0C §23/§24 — THE PROTOCOL DEVIATION RECORD.
 *
 * §23 states the rule this module exists to honour:
 *
 *   "If a load-bearing harness/analysis defect is discovered after behavioral exposure: STOP and preserve
 *    completed runs."
 *
 * The defect was found after all 16 sessions had run, and it is load-bearing: the CAPITALIZED arm received NO
 * capital at all, so the treatment was never delivered and the run cannot speak to the research question. This
 * module records that fact, preserves the run, and states what may and may not be concluded from it.
 *
 * WHY THE RUN IS PRESERVED RATHER THAN DISCARDED. The defect is itself a finding: it shows that a knowledge
 * selection can be ACCEPTED, reported as selected, and silently compile nothing — which is exactly the failure
 * mode a consumer-boundary witness exists to catch, and which no host-side assertion had caught before. Deleting
 * the run would delete the evidence of that failure.
 *
 * WHY THE RUN IS NOT A PRIMARY RESULT. Both arms' workers saw an identical capital surface (empty), so any
 * difference between them is noise and any similarity is uninformative. Reporting a verdict from it would be
 * reporting the absence of a treatment as a finding about the treatment.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT, STAGE_EVIDENCE_PATH } from './contract.mjs';

const NL = String.fromCharCode(10);

/**
 * §23: THE DEFECT.
 *
 * Recorded with the exact mechanism, because a deviation record that says "a harness bug" is not auditable.
 */
export const DEVIATION = Object.freeze({
  id: 'CAPITAL_SELECTION_SHAPE_REJECTED_SILENTLY',
  discoveredAt: 'after all 16 scheduled sessions had completed',
  loadBearing: true,
  /** What the harness did. */
  mechanism: 'the generation selection was sent as `{ handles: [ ... ] }`, but the host contract `KnowledgeSelectionRequest` is `{ proof?, reasoning?, procedure? }`; the unknown field was ignored, so no handle was compiled and no pull was possible',
  /** Why it was silent. */
  whySilent: 'the delegation accepted the request and the attempt reported `knowledgeSelected: true`, so every host-side signal said the selection had been made; only the CONSUMER-BOUNDARY payload showed zero compiled handles',
  /** What the worker actually saw. */
  workerSurface: 'the CAPITALIZED worker received exactly the RAW_HISTORY surface: no compiled handle, no capital index entry, no pullable capital handle',
  /** The repair, and its verification. */
  repair: 'the selection is now sent in the owner shape (`proof`/`reasoning`/`procedure`), each entry carrying the owner own reference fields',
  repairVerified: 'a real generation child driven with the corrected selection compiled 2 handles, delivered both to the consumer boundary, and resolved both through the governed pull (257 and 2136 body bytes)',
  /** §23: the plan is immutable, and the repair post-dates exposure. */
  planImmutabilityActivated: true,
  planAmended: false,
  harnessDigestDrift: 'scripts/r3l0c/capital.mjs changed after the plan recorded its digest, so the committed plan no longer matches the working tree',
});

/** §23: the affected run, preserved. */
export function preservedRunRecord(runRoot) {
  const matrixPath = join(REPO_ROOT, STAGE_EVIDENCE_PATH, 'matrix.json');
  const matrix = existsSync(matrixPath) ? JSON.parse(readFileSync(matrixPath, 'utf8')) : null;
  const sessions = matrix?.sessions ?? [];
  const cSessions = sessions.filter((session) => session.arm === 'C');
  const hSessions = sessions.filter((session) => session.arm === 'H');
  const compiledOf = (session) => (session.payload?.compiledHandleCount ?? 0);
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C',
    kind: 'preserved run after a protocol deviation',
    runId: matrix?.runId ?? null,
    runRoot: runRoot ?? matrix?.runRoot ?? null,
    preservedBy: 'a PRESERVE marker in the run root, which the sweep routine honours as ACTIVE regardless of lease state',
    sessionsExecuted: sessions.length,
    validSessions: matrix?.validSessions ?? 0,
    /** The measurement that makes the run unusable as a primary result. */
    capitalDelivered: Object.freeze({
      cSessions: cSessions.length,
      cSessionsReportingSelected: cSessions.filter((session) => session.knowledgeSelected === true).length,
      cSessionsWithCompiledHandles: cSessions.filter((session) => compiledOf(session) > 0).length,
      cGovernedPulls: cSessions.reduce((total, session) => total + (session.governedPulls?.length ?? 0), 0),
      hSessions: hSessions.length,
      hCompiledHandles: hSessions.reduce((total, session) => total + compiledOf(session), 0),
      /** The comparison that matters: the two arms were IDENTICAL on the treatment dimension. */
      armsIdenticalOnTreatment: cSessions.every((session) => compiledOf(session) === 0),
    }),
    /** §23: what may NOT be concluded. */
    notUsableFor: Object.freeze([
      'the reconstruction-compression verdict, because the treatment was absent',
      'the net cognitive-cost verdict, for the same reason',
      'any claim about capital effectiveness or capital overhead',
    ]),
    /** What the run DOES establish. */
    usableFor: Object.freeze([
      'the harness defect is real and was reachable in the scheduled configuration',
      'the consumer-boundary witness catches a silent delivery failure that no host-side signal reports',
      'the preflight, containment and validity gates all passed on the executed run',
    ]),
    /** §23: the stop, stated as a value. */
    stageOutcome: 'BLOCKED',
    stopReason: 'a load-bearing harness defect was discovered after behavioral exposure, and §23 forbids a plan amendment afterwards',
  });
}

/** §23: the digest of the preserved matrix, so the preserved run is identifiable. */
export function preservedMatrixDigest() {
  const path = join(REPO_ROOT, STAGE_EVIDENCE_PATH, 'matrix.json');
  if (!existsSync(path)) return null;
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function main() {
  const record = Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C',
    deviation: DEVIATION,
    preservedRun: preservedRunRecord(),
    preservedMatrixDigest: preservedMatrixDigest(),
  });
  writeFileSync(join(REPO_ROOT, STAGE_EVIDENCE_PATH, 'protocol-deviation.json'), `${JSON.stringify(record, null, 2)}${NL}`, 'utf8');
  process.stdout.write(`R3-L0C PROTOCOL DEVIATION: ${DEVIATION.id}${NL}`);
  process.stdout.write(`  stage outcome: ${record.preservedRun.stageOutcome}${NL}`);
  process.stdout.write(`  C sessions with compiled handles: ${String(record.preservedRun.capitalDelivered.cSessionsWithCompiledHandles)}/${String(record.preservedRun.capitalDelivered.cSessions)}${NL}`);
  return record;
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  main();
}

export { main };
