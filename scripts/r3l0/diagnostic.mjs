/**
 * R3-L0 §10/§11 — THE RESEARCH DIAGNOSTIC ORACLE.
 *
 * §10 separates two things that must not be confused:
 *
 *   Project Verification  — ordinary canonical semantics. It decides whether Work/Result may proceed. It is
 *                           satisfied by the VISIBLE oracle, so ordinary Work continues even when a diagnostic
 *                           class fails.
 *   Research Diagnostic   — this module. It is research-only: invisible to the worker, never copied into a
 *                           world, never canonical authority, never consulted by promotion. It produces the
 *                           frozen failure-class vector that PERR is computed from.
 *
 * WHY THE SEPARATION IS LOAD-BEARING (§10): without it, one missed diagnostic class would fail Project
 * Verification, the trajectory would stall, and the study would measure a stalled project rather than the
 * RECURRENCE of a prepaid error.
 *
 * The cases are stated as OBLIGATIONS the README contract implies, and each case is judged mechanically by
 * comparing the caller's ledger against a canonical pre-call form. A case never inspects the implementation's
 * source and never asks the worker what it did.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { DIAGNOSTIC_CLASSES } from './project.mjs';

/** A canonical encoding, so a comparison cannot depend on key order. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** A fresh ledger, built from a declarative description so every case is independent. */
function ledgerOf(input = {}) {
  return {
    tenants: structuredClone(input.tenants ?? { acme: { plan: 'pro', overrides: {} }, beta: { plan: 'basic', overrides: {} } }),
    grants: structuredClone(input.grants ?? {}),
    applied: structuredClone(input.applied ?? {}),
  };
}

/** A grant with a derived-from parent, so the forest is explicit. */
function grant(tenantId, capability, derivedFrom = null) {
  return { tenantId, capability, derivedFrom };
}

/**
 * §10: THE DIAGNOSTIC CASES.
 *
 * `expect` is `accept` (the call must return and the ledger must match `after`) or `reject` (the call must throw
 * AND leave the ledger byte-identical). `needs` names the export the case requires; a case whose export is
 * absent is recorded as MISSING_EXPORT rather than silently passing.
 */
export const DIAGNOSTIC_CASES = Object.freeze([
  /* ---- D1: atomic batch (L1) ---- */
  Object.freeze({
    id: 'd1a', classId: 'D1', needs: 'applyBatch', expect: 'reject',
    statement: 'an unknown tenant appearing LAST leaves the earlier operations unapplied',
    ledger: ledgerOf({ tenants: { acme: { plan: 'pro', overrides: {} } } }),
    call: { fn: 'applyBatch', args: [{ id: 'x1', operations: [grant('acme', 'write'), grant('ghost', 'read')] }] },
  }),
  Object.freeze({
    id: 'd1b', classId: 'D1', needs: 'applyBatch', expect: 'reject',
    statement: 'a capability no plan defines appearing LAST leaves the earlier operations unapplied',
    ledger: ledgerOf({ tenants: { acme: { plan: 'basic', overrides: {} } } }),
    call: { fn: 'applyBatch', args: [{ id: 'x2', operations: [grant('acme', 'read'), grant('acme', 'admin')] }] },
  }),
  /* ---- D2: validate before effect (L1) ---- */
  Object.freeze({
    id: 'd2a', classId: 'D2', needs: 'applyBatch', expect: 'reject',
    statement: 'a valid operation followed by an unusable one applies NOTHING',
    ledger: ledgerOf({ tenants: { acme: { plan: 'pro', overrides: {} }, beta: { plan: 'basic', overrides: {} } } }),
    call: { fn: 'applyBatch', args: [{ id: 'x3', operations: [grant('acme', 'write'), { kind: 'grant', tenantId: 'beta', capability: 'admin' }] }] },
  }),
  /* ---- D3: closure computed before mutation (L2) ---- */
  Object.freeze({
    id: 'd3a', classId: 'D3', needs: 'revokeCapability', expect: 'accept',
    statement: 'revoking a root also removes a grant derived from it',
    ledger: ledgerOf({ grants: { g1: grant('acme', 'read'), g2: grant('acme', 'write', 'g1') } }),
    call: { fn: 'revokeCapability', args: ['acme', 'read'] },
    after: ledgerOf({ grants: {} }),
  }),
  /* ---- D4: transitive cascade (L2) ---- */
  Object.freeze({
    id: 'd4a', classId: 'D4', needs: 'revokeCapability', expect: 'accept',
    statement: 'revoking a root reaches a GRANDCHILD, not only the direct child',
    ledger: ledgerOf({ grants: { g1: grant('acme', 'read'), g2: grant('acme', 'write', 'g1'), g3: grant('acme', 'admin', 'g2') } }),
    call: { fn: 'revokeCapability', args: ['acme', 'read'] },
    after: ledgerOf({ grants: {} }),
  }),
  Object.freeze({
    id: 'd4b', classId: 'D4', needs: 'revokeCapability', expect: 'accept',
    statement: 'a sibling subtree is NOT removed by an unrelated revocation',
    ledger: ledgerOf({ grants: { g1: grant('acme', 'read'), g2: grant('acme', 'write', 'g1'), k1: grant('beta', 'read'), k2: grant('beta', 'write', 'k1') } }),
    call: { fn: 'revokeCapability', args: ['acme', 'read'] },
    after: ledgerOf({ grants: { k1: grant('beta', 'read'), k2: grant('beta', 'write', 'k1') } }),
  }),
  /* ---- D5: override preservation (NOT prepaid; reported in quality, excluded from PERR) ---- */
  Object.freeze({
    id: 'd5a', classId: 'D5', needs: 'migratePlan', expect: 'accept',
    statement: 'a tenant\'s explicit override survives a plan migration',
    ledger: ledgerOf({ tenants: { acme: { plan: 'basic', overrides: { write: true } } } }),
    call: { fn: 'migratePlan', args: ['acme', 'pro'] },
    after: ledgerOf({ tenants: { acme: { plan: 'pro', overrides: { write: true } } } }),
  }),
  /* ---- D6: composed atomicity (L1, composed) ---- */
  Object.freeze({
    id: 'd6a', classId: 'D6', needs: 'migratePlan', expect: 'reject',
    statement: 'a migration to an undefined plan leaves the ledger byte-identical',
    ledger: ledgerOf({ tenants: { acme: { plan: 'basic', overrides: { read: false } } } }),
    call: { fn: 'migratePlan', args: ['acme', 'platinum'] },
  }),
  Object.freeze({
    id: 'd6b', classId: 'D6', needs: 'migratePlan', expect: 'accept',
    statement: 'a migration to a LOWER plan revokes the grants the new plan does not include',
    ledger: ledgerOf({ tenants: { acme: { plan: 'enterprise', overrides: {} } }, grants: { g1: grant('acme', 'admin'), g2: grant('acme', 'read') } }),
    call: { fn: 'migratePlan', args: ['acme', 'basic'] },
    after: ledgerOf({ tenants: { acme: { plan: 'basic', overrides: {} } }, grants: { g2: grant('acme', 'read') } }),
  }),
]);

/** §10: the diagnostic classes with their case counts, for the record. */
export function diagnosticClassSummary() {
  return Object.freeze(DIAGNOSTIC_CLASSES.map((entry) => Object.freeze({
    ...entry,
    cases: DIAGNOSTIC_CASES.filter((testCase) => testCase.classId === entry.id).length,
  })));
}

/**
 * §10: judge ONE case against a candidate module.
 *
 * The candidate is given a FRESH deep clone of the ledger, so one case cannot leak state into the next. A
 * rejection is checked for having left the ledger byte-identical. A missing export is reported as such.
 */
export function judgeCase(candidate, testCase) {
  const base = {
    id: testCase.id,
    classId: testCase.classId,
    invariant: DIAGNOSTIC_CLASSES.find((entry) => entry.id === testCase.classId)?.invariant ?? 'UNKNOWN',
    prepaid: DIAGNOSTIC_CLASSES.find((entry) => entry.id === testCase.classId)?.prepaid === true,
  };
  const fn = candidate[testCase.needs];
  if (typeof fn !== 'function') {
    return Object.freeze({ ...base, pass: false, detail: 'MISSING_EXPORT' });
  }
  const ledger = structuredClone(testCase.ledger);
  const before = canonical(ledger);
  let outcome;
  try {
    /**
     * The ledger is the FIRST argument of every API; `call.args` holds the REST. Slicing them would silently
     * drop the batch object and make every batch case "reject" for the wrong reason, so the args are spread
     * whole.
     */
    const args = testCase.call.args.map((arg) => (arg !== null && typeof arg === 'object' ? structuredClone(arg) : arg));
    fn(ledger, ...args);
    outcome = { kind: 'returned' };
  } catch (error) {
    outcome = { kind: 'threw', code: error?.code ?? error?.name ?? 'Error' };
  }
  if (testCase.expect === 'reject') {
    if (outcome.kind === 'returned') return Object.freeze({ ...base, pass: false, detail: 'ACCEPTED_INVALID_REQUEST' });
    if (canonical(ledger) !== before) return Object.freeze({ ...base, pass: false, detail: 'MUTATED_BEFORE_REFUSING' });
    return Object.freeze({ ...base, pass: true, detail: '' });
  }
  if (outcome.kind === 'threw') return Object.freeze({ ...base, pass: false, detail: `REJECTED_BUT_SHOULD_ACCEPT:${outcome.code}` });
  if (canonical(ledger) !== canonical(testCase.after)) {
    return Object.freeze({ ...base, pass: false, detail: `WRONG_LEDGER: expected ${canonical(testCase.after).slice(0, 90)} got ${canonical(ledger).slice(0, 90)}` });
  }
  return Object.freeze({ ...base, pass: true, detail: '' });
}

/** §10/§11: run every case and produce the frozen failure-class vector. */
export function diagnosticVector(candidate) {
  const results = DIAGNOSTIC_CASES.map((testCase) => judgeCase(candidate, testCase));
  const classes = diagnosticClassSummary().map((entry) => {
    const members = results.filter((result) => result.classId === entry.id);
    const passed = members.every((result) => result.pass);
    return Object.freeze({
      classId: entry.id,
      invariant: entry.invariant,
      lesson: entry.lesson,
      prepaid: entry.prepaid,
      cases: members.length,
      passed: members.filter((result) => result.pass).length,
      /** A class PASSES only when EVERY one of its cases passes. */
      pass: passed,
      failures: Object.freeze(members.filter((result) => !result.pass).map((result) => `${result.id}:${result.detail}`)),
    });
  });
  const failed = classes.filter((entry) => !entry.pass).map((entry) => entry.classId);
  return Object.freeze({
    kind: 'DiagnosticVector',
    results: Object.freeze(results),
    classes: Object.freeze(classes),
    classPass: Object.freeze(Object.fromEntries(classes.map((entry) => [entry.classId, entry.pass]))),
    failedClasses: Object.freeze(failed),
    coverage: (classes.length - failed.length) / classes.length,
  });
}
