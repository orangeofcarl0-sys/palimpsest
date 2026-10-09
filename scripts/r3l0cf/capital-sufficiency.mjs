/**
 * R3-L0C-I Gate 5 — THE CAPITAL SEMANTIC SUFFICIENCY VERIFICATION.
 *
 * THE QUESTION THIS ANSWERS, and the one it refuses to answer by proxy. R3-L0C-F decided
 * `SELECTED_CAPITAL_SUFFICIENT = YES` from STRUCTURAL evidence: each standing body carried a statement, an
 * applicability and a method, and the selection covered every exposed invariant. Gate 5 says that is not enough —
 * "Do not rely only on presence of statement/method/applicability fields or a token-overlap relevance heuristic."
 *
 * So this module asks the operational question instead:
 *
 *     CAN A DECISION PROCEDURE BUILT ONLY FROM THE CURRENT-STANDING CAPITAL DECIDE THE FROZEN REFERENCE CASES
 *     CORRECTLY?
 *
 * THE METHOD, and why it is stronger than a field-presence check. The capital's `method` is a list of steps in
 * natural language. This module does NOT try to interpret arbitrary prose. Instead it compiles the method into a
 * SMALL, EXPLICIT DECISION PROCEDURE, runs that procedure against the frozen diagnostic cases, and compares its
 * verdicts against the cases' own expected values. The compilation is written by hand and its faithfulness is
 * checked case by case, so the result is a real adjudication with a real failure mode: if the capital's method were
 * wrong or incomplete, the procedure would get cases wrong and the verification would fail.
 *
 * WHY THIS IS NOT CIRCULAR. The procedure is derived from the CAPITAL, and it is judged against the ORACLE's
 * expected values — two independently frozen artifacts. A procedure that merely echoed the oracle would have to
 * have been written from the oracle, and the derivation is written from the capital's own method text, which is
 * quoted beside each step so a reader can check the mapping. The `capitalMethodQuotes` field carries the exact
 * sentences each step came from.
 *
 * THE SUFFICIENCY RULE, and it is deliberately split:
 *
 *   SUFFICIENT   the capital-derived procedure decides EVERY prepaid reference case correctly. The current
 *                standing, as the capital states it, is enough to reach the right answer without the derivation.
 *   INSUFFICIENT the procedure misses at least one case. The capital's method does not determine the answer, so a
 *                reader WOULD have to consult the history — which is the condition Gate 5 says to STOP on.
 *
 * WHY PREPAID CASES ARE THE TEST SET. The prepaid classes (P1-P7) are the ones the experiment's exposures name;
 * X1 is an extension the frozen design marks `prepaid: false`. Judging sufficiency over the prepaid set is judging
 * it over exactly the classes the treatment is supposed to cover.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { DIAGNOSTIC_CASES, DIAGNOSTIC_CLASSES, judgeCase } from '../r3l0c/diagnostic.mjs';
import { STANDING_BODIES } from '../r3l0c/capital.mjs';

const NL = String.fromCharCode(10);

/**
 * Gate 5: THE CAPITAL-DERIVED DECISION PROCEDURE.
 *
 * Each step quotes the capital method sentence it implements, so the derivation is auditable rather than asserted.
 * The procedure is a faithful transcription of the I1 and I2 methods in `STANDING_BODIES`, and it is deliberately
 * SMALL: it implements exactly what those methods say, no more, because anything more would be importing knowledge
 * the capital does not carry — which is the very thing this verification must not do.
 */
export const CAPITAL_PROCEDURE = Object.freeze({
  schemaVersion: 1,
  kind: 'capital-derived decision procedure',
  derivedFrom: Object.freeze(['I1 method', 'I2 method']),
  /** Gate 5: the capital sentences each step implements. */
  capitalMethodQuotes: Object.freeze({
    I1: Object.freeze([...STANDING_BODIES.I1.method]),
    I2: Object.freeze([...STANDING_BODIES.I2.method]),
  }),
});

/** The consolidation the I2 method refers to, taken from the capital's own applicability. */
const CONSOLIDATED = Object.freeze({
  aliases: Object.freeze(['ledger.view', 'ledger.edit', 'ledger.approve']),
  consolidated: 'ledger.operate',
});

/** The capability a name maps to, per the capital's I2 method step 1. */
function capabilityOf(name) {
  return CONSOLIDATED.aliases.includes(name) ? CONSOLIDATED.consolidated : name;
}

/**
 * Gate 5: RESOLVE, per the capital's I1 method.
 *
 * The steps, in the capital's own order:
 *   1. read the tenant's cutoverDate; null means every decision is pre-cutover;
 *   2. collect decisions for the tenant+capability recorded on or before the resolution date;
 *   3. if any collected DENY is recorded strictly BEFORE the cutover, resolve DENY;
 *   4. otherwise take the latest recordedAt and return its effect;
 *   5. return DENY when nothing was collected.
 */
function capitalResolve(store, tenantId, capability, atDate) {
  const tenant = store.tenants[tenantId];
  if (tenant === undefined) throw new Error(`unknown tenant: ${tenantId}`);
  const cutover = tenant.cutoverDate ?? null;
  const collected = store.decisions
    .filter((decision) => decision.tenantId === tenantId && capabilityOf(decision.capability) === capabilityOf(capability))
    .filter((decision) => decision.recordedAt <= atDate);
  if (collected.length === 0) return 'DENY';
  /** Step 3: a DENY strictly before the cutover is final. A null cutover means every decision is pre-cutover. */
  const protectedDeny = collected.some((decision) => decision.effect === 'DENY' && (cutover === null || decision.recordedAt < cutover));
  if (protectedDeny) return 'DENY';
  /** Step 4: otherwise the latest wins. */
  const latest = collected.reduce((best, decision) => (decision.recordedAt > best.recordedAt ? decision : best), collected[0]);
  return latest.effect;
}

/**
 * Gate 5: REVOKE, per the capital's I2 method.
 *
 * The steps: map the named capability; check the tenant HOLDS the name it names (refuse otherwise, changing
 * nothing); remove every record of the tenant whose capability maps to the same capability.
 */
function capitalRevoke(store, tenantId, capability) {
  const tenant = store.tenants[tenantId];
  if (tenant === undefined) throw new Error(`unknown tenant: ${tenantId}`);
  /** Step 2: the tenant must HOLD the name it names, or the revocation removes nothing. */
  const holds = store.decisions.some((decision) => decision.tenantId === tenantId && decision.capability === capability);
  if (!holds) throw new Error(`the tenant does not hold ${capability}`);
  /** Step 3: remove EVERY record mapping to the same capability. */
  const target = capabilityOf(capability);
  store.decisions = store.decisions.filter((decision) => !(decision.tenantId === tenantId && capabilityOf(decision.capability) === target));
  return store;
}

/** The candidate the frozen oracle judges, built from the capital-derived procedure alone. */
export const CAPITAL_CANDIDATE = Object.freeze({
  resolveEntitlement: capitalResolve,
  revokeEntitlement: capitalRevoke,
});

/**
 * Gate 5: RUN THE CAPITAL PROCEDURE AGAINST EVERY FROZEN REFERENCE CASE.
 *
 * The judgement uses the frozen `judgeCase`, so the comparison is the oracle's own, not a second implementation of
 * it. The cases are the frozen `DIAGNOSTIC_CASES`, and the prepaid ones are the test set.
 */
export function runCapitalSufficiency(input = {}) {
  const cases = input.cases ?? DIAGNOSTIC_CASES;
  const classes = input.classes ?? DIAGNOSTIC_CLASSES;
  const results = cases.map((testCase) => {
    const judged = judgeCase(CAPITAL_CANDIDATE, testCase);
    return Object.freeze({
      id: judged.id,
      classId: judged.classId,
      prepaid: classes.find((entry) => entry.id === judged.classId)?.prepaid === true,
      pass: judged.pass,
      detail: judged.detail,
    });
  });
  const prepaid = results.filter((result) => result.prepaid === true);
  const failedPrepaid = prepaid.filter((result) => !result.pass);
  const failed = results.filter((result) => !result.pass);
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I',
    kind: 'capital semantic sufficiency verification',
    /** Gate 5: the procedure's verdicts, case by case, with the oracle's own judgement. */
    results: Object.freeze(results),
    totalCases: results.length,
    prepaidCases: prepaid.length,
    passed: results.filter((result) => result.pass).length,
    failed: Object.freeze(failed.map((result) => `${result.id}:${result.detail}`)),
    failedPrepaid: Object.freeze(failedPrepaid.map((result) => `${result.id}:${result.detail}`)),
    /**
     * Gate 5: THE DETERMINATION.
     *
     * `SUFFICIENT` means a procedure built only from the current-standing capital decides every prepaid reference
     * case correctly, so the capital supplies the standing without the derivation.
     */
    CAPITAL_SEMANTIC_SUFFICIENCY: failedPrepaid.length === 0 ? 'PASS' : 'FAIL',
    /** Gate 5: what a FAIL means, carried so it cannot be softened. */
    onFailure: 'STOP — the capital does not determine the standing, so a reader would have to consult the history',
    method: 'compile the capital method into an explicit procedure, run it against the frozen reference cases, and compare against the oracle\'s own expected values',
    reliedOnFieldPresence: false,
    reliedOnTokenOverlap: false,
    oracleCases: cases.length,
  });
}

/**
 * Gate 5: THE PROCEDURE'S FAITHFULNESS CHECK.
 *
 * A procedure derived from the capital could pass by being RIGHT FOR THE WRONG REASON — for instance by having
 * been written from the oracle. This check makes that visible: it runs a DELIBERATELY WRONG variant of each
 * method step and requires the variant to FAIL cases. A procedure whose mutations all pass would not be measuring
 * anything.
 */
export function runProcedureFalsifiers() {
  /** Variant 1: the naive "latest wins" rule, which is what a reader without the capital would write. */
  const naiveLatest = Object.freeze({
    resolveEntitlement: (store, tenantId, capability, atDate) => {
      const tenant = store.tenants[tenantId];
      if (tenant === undefined) throw new Error(`unknown tenant: ${tenantId}`);
      const collected = store.decisions
        .filter((decision) => decision.tenantId === tenantId && decision.capability === capability)
        .filter((decision) => decision.recordedAt <= atDate);
      if (collected.length === 0) return 'DENY';
      return collected.reduce((best, decision) => (decision.recordedAt > best.recordedAt ? decision : best), collected[0]).effect;
    },
    revokeEntitlement: (store, tenantId, capability) => {
      const index = store.decisions.findIndex((decision) => decision.tenantId === tenantId && decision.capability === capability);
      if (index === -1) throw new Error(`the tenant does not hold ${capability}`);
      store.decisions.splice(index, 1);
      return store;
    },
  });

  /** Variant 2: the capital's I1 method with the cutover comparison dropped — "any DENY is final". */
  const denyAlwaysFinal = Object.freeze({
    resolveEntitlement: (store, tenantId, capability, atDate) => {
      const tenant = store.tenants[tenantId];
      if (tenant === undefined) throw new Error(`unknown tenant: ${tenantId}`);
      const collected = store.decisions
        .filter((decision) => decision.tenantId === tenantId && capabilityOf(decision.capability) === capabilityOf(capability))
        .filter((decision) => decision.recordedAt <= atDate);
      if (collected.length === 0) return 'DENY';
      if (collected.some((decision) => decision.effect === 'DENY')) return 'DENY';
      return collected.reduce((best, decision) => (decision.recordedAt > best.recordedAt ? decision : best), collected[0]).effect;
    },
    revokeEntitlement: capitalRevoke,
  });

  /** Variant 3: the capital's I2 method with the "holds the named capability" precondition dropped. */
  const revokeWithoutHolding = Object.freeze({
    resolveEntitlement: capitalResolve,
    revokeEntitlement: (store, tenantId, capability) => {
      const tenant = store.tenants[tenantId];
      if (tenant === undefined) throw new Error(`unknown tenant: ${tenantId}`);
      const target = capabilityOf(capability);
      store.decisions = store.decisions.filter((decision) => !(decision.tenantId === tenantId && capabilityOf(decision.capability) === target));
      return store;
    },
  });

  const variants = Object.freeze([
    Object.freeze({ id: 'NAIVE_LATEST_WINS_AND_NAMED_REVOKE', candidate: naiveLatest, expects: 'the reader without the capital' }),
    Object.freeze({ id: 'ANY_DENY_IS_FINAL', candidate: denyAlwaysFinal, expects: 'the cutover comparison dropped' }),
    Object.freeze({ id: 'REVOKE_WITHOUT_HOLDING', candidate: revokeWithoutHolding, expects: 'the I2 precondition dropped' }),
  ]);

  const results = variants.map((variant) => {
    const judged = DIAGNOSTIC_CASES.map((testCase) => judgeCase(variant.candidate, testCase));
    const failed = judged.filter((result) => !result.pass);
    return Object.freeze({
      id: variant.id,
      expects: variant.expects,
      failedCases: Object.freeze(failed.map((result) => `${result.id}:${result.detail}`)),
      /** The variant is load-bearing when it FAILS at least one case. */
      DETECTED: failed.length > 0,
    });
  });
  const undetected = results.filter((result) => result.DETECTED !== true).map((result) => result.id);
  return Object.freeze({
    schemaVersion: 1,
    kind: 'capital procedure falsifiers',
    variants: Object.freeze(results),
    ALL_VARIANTS_DETECTED: undetected.length === 0,
    undetected: Object.freeze(undetected),
    law: 'a procedure whose mutations all pass would not be measuring the capital',
  });
}

export { NL };
