/**
 * Trajectory-P2-E1RF §7 — EVIDENCE ADMISSION: RUN-SCOPED IDENTITY, FRESHNESS AND PASS/LIMIT/FAIL.
 *
 * THE WEAKNESS THIS CLOSES. `scripts/trajectory_p2e1re/generate-evidence.mjs` read R1-HR and R1-HC reports from
 * a FIXED user-wide path (`~/.palimpsest-r1hr/conformance/conformance.json`) and reused a pre-existing
 * falsifier file. Nothing bound any of those inputs to the Code Freeze being qualified. A report produced
 * against different code, or by a different DSH, could therefore be recorded as a successful assertion about
 * the code under test — and `outcomes()` mapped `pass === true` to `"PASS"` even when `limit === true`, so a
 * disclosed LIMIT was recorded as a successful assertion.
 *
 * WHAT THIS MODULE IS. A small, pure ADMISSION function plus the run-identity helpers that produce its input.
 * It is NOT a new evidence platform (§7): it validates inputs the stage already has, and it is deliberately
 * small enough to read in one sitting.
 *
 * THE THREE-WAY RESULT IS PRESERVED (§7.4):
 *   PASS  — dynamically verified behaviour.
 *   LIMIT — a disclosed residual, unsupported fixture, or a condition not proved.
 *   FAIL  — an established contradiction to the required contract.
 *
 * A LIMIT is never counted as a PASS, and the final verdict is COMPUTED from the classifications rather than
 * inferred from a process exit code.
 *
 * PLAIN JAVASCRIPT (`.mjs`), bare node. No new dependency, no service, no durable store.
 */

/** The artifact kinds this module can admit, and what each must carry. */
export const ARTIFACT_KINDS = Object.freeze({
  CONFORMANCE: 'conformance',
  FALSIFIER: 'falsifier',
  VITEST: 'vitest',
});

/**
 * The fields that make a report attributable to ONE execution (§7.2).
 *
 * A timestamp is deliberately NOT in this list. A timestamp says when a file was written, not which code
 * produced it, and a stale report can be rewritten at any time.
 */
export const RUN_IDENTITY_FIELDS = Object.freeze([
  'executedCodeHead',
  'executedCodeTree',
  'command',
  'exitCode',
  'runtimeNode',
  'dshIdentity',
  'selection',
  'runId',
]);

/**
 * Classify ONE check row from a conformance report.
 *
 * `limit === true` is checked BEFORE `pass`, because a LIMIT row is written with `pass: true` by the suites —
 * the assertion is "the residual is disclosed", not "the behaviour is verified". Reading `pass` first is the
 * defect §7.4 names.
 *
 * @param {{ pass?: boolean, limit?: boolean, id?: string }} row
 * @returns {'PASS' | 'LIMIT' | 'FAIL'}
 */
export function classifyCheck(row) {
  if (row?.limit === true) return 'LIMIT';
  return row?.pass === true ? 'PASS' : 'FAIL';
}

/**
 * A STABLE identity for a check row (§7.4).
 *
 * `Suite + Check Ordinal + Check ID + Statement`. The ordinal is required because the real R1-HR report
 * contains TWO rows with id `HR-25` and different statements; deduplicating by id alone would silently lose one
 * assertion, and a report that lost an assertion is not a report about the same contract.
 *
 * @param {string} suite
 * @param {number} ordinal
 * @param {{ id?: string, statement?: string }} row
 * @returns {string}
 */
export function checkIdentity(suite, ordinal, row) {
  return `${suite}#${String(ordinal)}:${String(row?.id ?? '')}:${String(row?.statement ?? '')}`;
}

/**
 * Summarize a conformance report WITHOUT collapsing its three-way semantics.
 *
 * @param {string} suite
 * @param {{ results?: readonly { pass?: boolean, limit?: boolean, id?: string, statement?: string }[], failed?: readonly string[], limits?: readonly string[] } | null} record
 * @returns {{
 *   suite: string,
 *   present: boolean,
 *   checks: readonly { identity: string, id: string, statement: string, status: 'PASS' | 'LIMIT' | 'FAIL' }[],
 *   counts: { pass: number, limit: number, fail: number },
 *   duplicateIdentities: readonly string[],
 *   declaredFailed: readonly string[],
 *   declaredLimits: readonly string[],
 *   failDisagreement: readonly string[],
 *   limitDisagreement: readonly string[],
 *   verdict: 'PASS' | 'LIMIT' | 'FAIL' | 'MISSING',
 * }}
 */
export function summarizeConformance(suite, record) {
  if (record === null || record === undefined) {
    return { suite, present: false, checks: [], counts: { pass: 0, limit: 0, fail: 0 }, duplicateIdentities: [], declaredFailed: [], declaredLimits: [], failDisagreement: [], limitDisagreement: [], verdict: 'MISSING' };
  }
  const rows = Array.isArray(record.results) ? record.results : [];
  const checks = rows.map((row, index) => ({
    identity: checkIdentity(suite, index, row),
    id: String(row?.id ?? ''),
    statement: String(row?.statement ?? ''),
    status: classifyCheck(row),
  }));
  const counts = { pass: 0, limit: 0, fail: 0 };
  for (const check of checks) counts[check.status.toLowerCase()] += 1;
  /** A duplicate ID is reported, not deduplicated: the reader must see that two rows share a name. */
  const byId = new Map();
  for (const check of checks) byId.set(check.id, (byId.get(check.id) ?? 0) + 1);
  const duplicateIdentities = [...byId.entries()].filter(([, count]) => count > 1).map(([id]) => id);
  const declaredFailed = Array.isArray(record.failed) ? record.failed.map(String) : [];
  const declaredLimits = Array.isArray(record.limits) ? record.limits.map(String) : [];
  /**
   * CROSS-CHECK THE SUITE'S OWN TALLIES AGAINST ITS ROWS.
   *
   * A suite that reported `failed: []` while a row said FAIL would otherwise be admitted on the tally alone.
   * Both directions are checked: a row-level FAIL the tally does not name, and a tally FAIL no row supports.
   */
  const rowFailed = [...new Set(checks.filter((check) => check.status === 'FAIL').map((check) => check.id))].sort();
  const failDisagreement = [...new Set([...rowFailed.filter((id) => !declaredFailed.includes(id)), ...declaredFailed.filter((id) => !rowFailed.includes(id))])].sort();
  const rowLimits = [...new Set(checks.filter((check) => check.status === 'LIMIT').map((check) => check.id))].sort();
  const limitDisagreement = [...new Set([...rowLimits.filter((id) => !declaredLimits.includes(id)), ...declaredLimits.filter((id) => !rowLimits.includes(id))])].sort();
  const verdict = counts.fail > 0 || failDisagreement.length > 0 ? 'FAIL' : counts.limit > 0 || declaredLimits.length > 0 ? 'LIMIT' : checks.length === 0 ? 'MISSING' : 'PASS';
  return { suite, present: true, checks, counts, duplicateIdentities, declaredFailed, declaredLimits, failDisagreement, limitDisagreement, verdict };
}

/**
 * ADMIT one run-scoped artifact.
 *
 * Every refusal names the specific reason, so a rejected input produces a diagnosis rather than a bare false.
 *
 * @param {{
 *   kind: string,
 *   path: string,
 *   content: unknown,
 *   digest: string | null,
 *   expectedDigest?: string | null,
 *   expectedCodeHead?: string | null,
 *   expectedTree?: string | null,
 *   expectedDsh?: string | null,
 *   expectedRuntime?: string | null,
 *   expectedRunId?: string | null,
 * }} input
 * @returns {{ admitted: boolean, reasons: readonly string[], identity: Record<string, unknown> | null, summary: unknown }}
 */
export function admitArtifact(input) {
  const reasons = [];
  if (input.content === null || input.content === undefined) {
    return { admitted: false, reasons: ['the artifact is missing or unparseable'], identity: null, summary: null };
  }
  if (typeof input.digest !== 'string' || !/^sha256-[0-9a-f]{64}$/u.test(input.digest)) {
    reasons.push('the artifact has no content digest, so the bytes that were admitted cannot be identified');
  }
  if (input.expectedDigest !== undefined && input.expectedDigest !== null && input.digest !== input.expectedDigest) {
    reasons.push(`the artifact digest ${String(input.digest)} does not match the recorded digest ${String(input.expectedDigest)}`);
  }
  const identity = input.content.runIdentity ?? input.content.identity ?? null;
  if (identity === null || typeof identity !== 'object') {
    reasons.push('the artifact carries no run identity, so it cannot be attributed to one execution');
  } else {
    for (const field of RUN_IDENTITY_FIELDS) {
      if (identity[field] === undefined || identity[field] === null || identity[field] === '') reasons.push(`the run identity is missing "${field}"`);
    }
    if (input.expectedCodeHead !== undefined && input.expectedCodeHead !== null && identity.executedCodeHead !== input.expectedCodeHead) {
      reasons.push(`the artifact was produced against ${String(identity.executedCodeHead)}, not the code freeze ${String(input.expectedCodeHead)}`);
    }
    if (input.expectedTree !== undefined && input.expectedTree !== null && identity.executedCodeTree !== input.expectedTree) {
      reasons.push(`the artifact's code tree ${String(identity.executedCodeTree)} is not the frozen tree ${String(input.expectedTree)}`);
    }
    if (input.expectedDsh !== undefined && input.expectedDsh !== null && identity.dshIdentity !== input.expectedDsh) {
      reasons.push(`the artifact was produced against DSH ${String(identity.dshIdentity)}, not ${String(input.expectedDsh)}`);
    }
    if (input.expectedRuntime !== undefined && input.expectedRuntime !== null && identity.runtimeNode !== input.expectedRuntime) {
      reasons.push(`the artifact was produced under Node ${String(identity.runtimeNode)}, not ${String(input.expectedRuntime)}`);
    }
    /**
     * A RESULT FROM ANOTHER RUN (§7.7 case 5). Same code, same DSH, same runtime is not enough: an artifact
     * produced by a different execution is an observation about that execution. When the caller names the run
     * it is admitting for, a mismatch is a refusal.
     */
    if (input.expectedRunId !== undefined && input.expectedRunId !== null && identity.runId !== input.expectedRunId) {
      reasons.push(`the artifact belongs to run ${String(identity.runId)}, not the run being admitted (${String(input.expectedRunId)})`);
    }
    /**
     * A SUCCESS-SHAPED BODY WITH A NONZERO EXIT (§7.3). The exit code is the process's own statement about
     * whether it completed; a report that says PASS while the process exited nonzero is a contradiction, and
     * admitting it would make "the suite passed" unfalsifiable.
     */
    if (Number(identity.exitCode) !== 0) reasons.push(`the producing process exited ${String(identity.exitCode)}, so a success-shaped body is not evidence of success`);
  }

  let summary = null;
  if (input.kind === ARTIFACT_KINDS.CONFORMANCE) {
    summary = summarizeConformance(String(identity?.selection ?? input.path), input.content);
    if (summary.verdict === 'MISSING') reasons.push('the conformance report contains no checks');
    if (summary.verdict === 'FAIL') reasons.push(`the conformance report records a FAIL (${summary.counts.fail} row(s); declared ${JSON.stringify(summary.declaredFailed)})`);
    if (summary.failDisagreement.length > 0) reasons.push(`the report's own FAIL tally disagrees with its rows: ${JSON.stringify(summary.failDisagreement)}`);
    if (summary.limitDisagreement.length > 0) reasons.push(`the report's own LIMIT tally disagrees with its rows: ${JSON.stringify(summary.limitDisagreement)}`);
    if (summary.checks.length === 0) reasons.push('an empty check collection is not a passing suite');
  }
  if (input.kind === ARTIFACT_KINDS.FALSIFIER) {
    const cases = Array.isArray(input.content.cases) ? input.content.cases : [];
    if (cases.length === 0) reasons.push('the falsifier artifact carries no cases');
    if (input.content.provenance === undefined || input.content.provenance === null) reasons.push('the falsifier artifact does not state whether its observations were re-executed or transcribed');
  }

  return { admitted: reasons.length === 0, reasons, identity: identity === null || typeof identity !== 'object' ? null : identity, summary };
}

/**
 * Build the identity block a producer records alongside its artifact.
 *
 * Kept here so every producer in this stage writes the SAME fields, and so the admission function above can
 * require them without a second list drifting from the first.
 *
 * @param {{ executedCodeHead: string, executedCodeTree: string, command: string, exitCode: number, runtimeNode: string, dshIdentity: string, selection: string, runId: string, startedAt?: string, elapsedMs?: number }} input
 * @returns {Record<string, unknown>}
 */
export function runIdentityOf(input) {
  return {
    executedCodeHead: input.executedCodeHead,
    executedCodeTree: input.executedCodeTree,
    command: input.command,
    exitCode: input.exitCode,
    runtimeNode: input.runtimeNode,
    dshIdentity: input.dshIdentity,
    selection: input.selection,
    runId: input.runId,
    /** CONTEXT ONLY. A timestamp is recorded for a human reader and is never used as a freshness proof. */
    startedAt: input.startedAt ?? null,
    elapsedMs: input.elapsedMs ?? null,
    timestampIsNotFreshnessProof: true,
  };
}
