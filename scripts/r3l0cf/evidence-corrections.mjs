/**
 * R3-L0C-I Gate 6 — THE EVIDENCE CORRECTIONS AND THE FINAL FREEZE RECORD.
 *
 * Gate 6 asks for two specific corrections, and each is a correction to R3-L0C-F's record rather than a new claim:
 *
 *   1. "Append a correction explaining the final 3926/3926 local test result versus the committed 3925/3925
 *      evidence, citing actual test evidence."
 *   2. "Precisely record which D2/D4/D5 live-gate scripts were attempted, what failed, and whether any model
 *      requests were emitted."
 *
 * WHY THE FIRST CORRECTION IS NEEDED, and it is a small but real discrepancy. R3-L0C-F's committed evidence records
 * `3925/3925`. The suite was subsequently run again and reported `3926/3926`. The difference is ONE test, and the
 * honest explanation is that the count moved between the two runs — the evidence was generated at one point and
 * the suite was re-run later, and the two runs did not agree. Rather than silently prefer either number, this
 * record states both, states which one the committed artifact carries, and states that the count is not treated as
 * a fixed property of the stage.
 *
 * WHY THE SECOND CORRECTION IS NEEDED. R3-L0C-F recorded that the D2/D4/D5 live gates fail identically at baseline
 * and at HEAD. That is true, and Gate 6 asks for the part it did not record: WHICH scripts were attempted, WHAT
 * failed in each, and — the question a reader actually needs answered — WHETHER ANY MODEL REQUEST WAS EMITTED.
 *
 * THE ANSWER TO THAT LAST QUESTION IS NO, and it is measured rather than assumed. Each gate writes its worker's
 * session log to `a session.v4.jsonl.zstd file under the gate home`. Every one of them contains
 * exactly ONE record: the session header. There is no conversation, no tool call and no completion request, so no
 * provider was contacted. The worker transcripts corroborate it: the `PALIMPSEST_WORKER_ACTIONS` line reporting an empty action order
 * and the `PALIMPSEST_WORK_RESULT` line reporting HOST_FAILURE, "the worker finished without reporting an outcome".
 * A worker that contacted a model would have actions to report.
 *
 * THE DISTINCTION THAT MATTERS FOR THE STAGE'S OWN INTEGRITY: the gates FAIL, and they failed BEFORE this stage
 * existed. `src/**`, `host/**` and `scripts/gates/**` are byte-identical to the baseline. So the failures are a
 * pre-existing limitation of this host's live-gate environment, and the absence of model requests means no
 * accidental spend occurred — which is the thing a reader of "the gates failed" most needs to know.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

const NL = String.fromCharCode(10);

/**
 * Gate 6: CORRECTION 1 — THE TEST COUNT.
 *
 * Both numbers are recorded, the committed artifact's number is named, and the difference is stated as a
 * measurement discrepancy rather than explained away.
 */
export const TEST_COUNT_CORRECTION = Object.freeze({
  schemaVersion: 1,
  kind: 'test count correction (append-only)',
  /** What R3-L0C-F committed. */
  committedEvidence: Object.freeze({ value: '3925/3925', artifact: 'research-evidence/r3-l0c-f/regression.json', stage: 'R3-L0C-F' }),
  /** What a later run of the same suite reported. */
  laterRun: Object.freeze({ value: '3926/3926', when: 'a subsequent full local run', stage: 'R3-L0C-F at commit f4e7c44' }),
  difference: 'ONE test',
  explanation: 'the count moved between the run that produced the committed evidence and the later run; the two runs did not agree, and neither number is treated as a fixed property of the stage',
  /** Gate 6: which number a reader should expect where. */
  authoritativeFor: Object.freeze({
    committedEvidence: '3925/3925 — what the artifact says',
    currentSuite: '3926/3926 — what a re-run reports',
  }),
  resolvedByAssertion: false,
  resolvedByRerun: true,
  /** The evidence this stage cites. */
  citing: Object.freeze([
    'research-evidence/r3-l0c-f/regression.json (the committed artifact, 3925/3925)',
    'the R3-L0C-I regression run, recorded in research-evidence/r3-l0c-i/regression.json',
  ]),
  law: 'state both counts and name which one each artifact carries; do not silently prefer either',
});

/**
 * Gate 6: CORRECTION 2 — THE LIVE GATES, PRECISELY.
 *
 * Each gate is named with the command, the observed failure, and the model-request evidence. The evidence is the
 * session log's record count, which is the authoritative artifact rather than an inference.
 */
export const LIVE_GATE_CORRECTION = Object.freeze({
  schemaVersion: 1,
  kind: 'live-gate attempt record (append-only)',
  attempted: Object.freeze([
    Object.freeze({
      script: 'scripts/gates/d2-live-gate.mjs',
      command: 'node scripts/gates/d2-live-gate.mjs',
      outcome: 'FAIL',
      observed: 'the worker finished without reporting an outcome, so the attempt never settled: settlement returned NOT_READY with reason HOST_FAILURE, and the downstream checks (attempt COMPLETED, result exported and readable) therefore failed',
      transcriptEvidence: 'PALIMPSEST_WORK_RESULT {"kind":"HOST_FAILURE","detail":"the worker finished without reporting an outcome"}',
      sessionLogRecords: 1,
      sessionLogKinds: Object.freeze(['session']),
      toolActions: 0,
      modelRequestsEmitted: 0,
    }),
    Object.freeze({
      script: 'scripts/gates/d4-live-gate.mjs',
      command: 'node scripts/gates/d4-live-gate.mjs',
      outcome: 'FAIL',
      observed: 'fatal: Not a valid object name null^{commit}; the rig then failed on `git diff --name-only <base>..null`, so the gate could not resolve a result commit to compare against',
      transcriptEvidence: 'git stderr: fatal: ambiguous argument \'<base>..null\': unknown revision or path not in the working tree',
      sessionLogRecords: 1,
      sessionLogKinds: Object.freeze(['session']),
      toolActions: 0,
      modelRequestsEmitted: 0,
    }),
    Object.freeze({
      script: 'scripts/gates/d5-live-gate.mjs',
      command: 'node scripts/gates/d5-live-gate.mjs',
      outcome: 'FAIL',
      observed: 'the delegated attempts returned NOT_READY with reason HOST_FAILURE, so neither task settled, and the gate then failed with PlanReconciliationError: plan revision blocked (quiescence_required)',
      transcriptEvidence: 'PlanReconciliationError: plan revision blocked (quiescence_required): the project is not quiescent: every ACTIVE/VERIFYING task and every open (CREATED/LEASED/RUNNING) attempt must settle',
      sessionLogRecords: 1,
      sessionLogKinds: Object.freeze(['session']),
      toolActions: 0,
      modelRequestsEmitted: 0,
    }),
  ]),
  /** Gate 6: the answer to the question that matters most. */
  anyModelRequestEmitted: false,
  modelRequestEvidence: 'every worker session log under the session log under each gate home contains exactly ONE record, the session header; there is no conversation record, no tool call and no completion request, and the worker transcripts report zero tool actions',
  modelRequestEvidenceIsMeasured: true,
  modelRequestEvidenceInferred: false,
  /** The pre-existing determination, restated so the correction does not change it. */
  preExisting: true,
  identicalAtBaseline: true,
  baselineComparison: 'verified in a scratch worktree at 19f0c69; the failures are byte-identical',
  introducedByThisStage: false,
  whyNotRepaired: 'the gates require a model route, and this stage is forbidden model calls; src/**, host/** and scripts/gates/** are byte-identical to the baseline, so nothing here caused or could fix them',
  /** The route the gates configure, named so a reader knows what they would have contacted. */
  configuredRoute: Object.freeze({ provider: 'deepseek-official', model: 'deepseek-flash', credentialSupplied: 'none observed in the gate home; no request was attempted' }),
});

/**
 * Gate 6: THE CORRECTIONS, TOGETHER.
 */
export const EVIDENCE_CORRECTIONS = Object.freeze({
  schemaVersion: 1,
  stage: 'R3-L0C-I',
  kind: 'evidence corrections (append-only)',
  testCount: TEST_COUNT_CORRECTION,
  liveGates: LIVE_GATE_CORRECTION,
  /** Gate 6: no old commit was rewritten to make these corrections. */
  historicalCommitsRewritten: false,
  correctionMethod: 'appended to this stage\'s own evidence namespace',
  law: 'append a correction rather than rewriting the commit it corrects',
});

export { NL };
