/**
 * R3-L0C §15 — THE RESEARCH DIAGNOSTIC ORACLE.
 *
 * §15 requires every future generation to have hidden project-specific invariant diagnostics, recording a FIRST
 * CANDIDATE vector, a FINAL vector, and project verification. The oracle is the instrument that produces those
 * vectors, and §10 keeps it HOST-PRIVATE: never readable by the worker, never copied into a world, never
 * canonical authority, never consulted by promotion.
 *
 * WHY IT MUST BE SEPARATE FROM THE VISIBLE ORACLE. §15's reliability constraint is the reason: capital cannot be
 * considered beneficial if reconstruction cost falls by simply ignoring history and implementing the wrong
 * current standing. A visible test of the invariants would tell the worker the answer; a test the worker cannot
 * see cannot be gamed, and it is what makes "same answer with less re-derivation" measurable rather than assumed.
 *
 * THE CASES ARE PROJECT-SPECIFIC, not generic. Every one turns on a fact from THIS Project's history — a cutover
 * date, a decision's source, the three consolidated capability names — so a generic prior cannot decide them.
 * That is the property §4 demands, and it is what makes the H arm a real reconstruction task.
 *
 * JUDGEMENT IS MECHANICAL. A case compares the candidate's observable output against a canonical expected value.
 * It never inspects the implementation's source and never asks the worker what it did.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { INVARIANTS } from './contract.mjs';

const NL = String.fromCharCode(10);

/**
 * §15: THE DIAGNOSTIC CLASSES.
 *
 * `invariant` names which project-specific invariant the class exercises, and `prepaid` records whether the class
 * is an exposure of a prepaid lesson (§11). `extension` classes are reported in diagnostic quality but do not
 * enter the primary invariant vector, because the Project never recorded them as a rule.
 */
export const DIAGNOSTIC_CLASSES = Object.freeze([
  Object.freeze({ id: 'P1', invariant: 'I1', prepaid: true, statement: 'a legacy DENY recorded BEFORE the tenant cutover is final against a later ALLOW' }),
  Object.freeze({ id: 'P2', invariant: 'I1', prepaid: true, statement: 'from the tenant cutover onward the newer ALLOW wins, even though the DENY was recorded first' }),
  Object.freeze({ id: 'P3', invariant: 'I1', prepaid: true, statement: 'an ALLOW recorded before the cutover is NOT protected, so a later DENY wins' }),
  Object.freeze({ id: 'P4', invariant: 'I1', prepaid: true, statement: 'two tenants with identical decision histories resolve differently when their cutover dates differ' }),
  Object.freeze({ id: 'P5', invariant: 'I2', prepaid: true, statement: 'revoking an alias the tenant holds removes access even when the tenant also holds the consolidated name' }),
  Object.freeze({ id: 'P6', invariant: 'I2', prepaid: true, statement: 'revoking an alias the tenant does NOT hold removes nothing' }),
  Object.freeze({ id: 'P7', invariant: 'I2', prepaid: true, statement: 'a capability outside the consolidation keeps an independent grant set' }),
  Object.freeze({ id: 'X1', invariant: null, prepaid: false, statement: 'a resolution before the earliest decision sees nothing', extension: true }),
]);

/** §11: which classes a generation exposes, frozen before execution. */
export const INVARIANT_EXPOSURES = Object.freeze({
  G1: Object.freeze(['P1', 'P2', 'P3', 'P4', 'X1']),
  G2: Object.freeze(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7']),
});

/** §15: the prepaid classes a generation is exposed to. */
export function eligibleClasses(generation) {
  return Object.freeze((INVARIANT_EXPOSURES[generation] ?? []).filter((classId) => DIAGNOSTIC_CLASSES.find((entry) => entry.id === classId)?.prepaid === true));
}

/* ================================================================ the store fixtures */

/** A store, built from a declarative description so every case is independent. */
function storeOf(input = {}) {
  return {
    tenants: structuredClone(input.tenants ?? {}),
    decisions: structuredClone(input.decisions ?? []),
  };
}

/** A decision. */
function decision(tenantId, capability, effect, recordedAt, source) {
  return { tenantId, capability, effect, recordedAt, source };
}

/**
 * §15: THE DIAGNOSTIC CASES.
 *
 * `expect` is `allow` or `deny` for a resolution, or `throws` for a refusal. `needs` names the export the case
 * requires; a case whose export is absent is recorded as MISSING_EXPORT rather than silently passing, because an
 * absent export is a failure to implement rather than a correct refusal.
 */
export const DIAGNOSTIC_CASES = Object.freeze([
  /* ---- P1: a legacy DENY before the cutover is final ---- */
  Object.freeze({
    id: 'p1a', classId: 'P1', needs: 'resolveEntitlement', kind: 'resolve', expect: 'deny',
    statement: 'a legacy DENY recorded before the tenant cutover survives a later inherited ALLOW',
    store: storeOf({
      tenants: { acme: { onboardedAt: '2022-01-10', cutoverDate: '2024-01-01' } },
      decisions: [decision('acme', 'ledger.approve', 'DENY', '2023-05-01', 'legacy'), decision('acme', 'ledger.approve', 'ALLOW', '2024-06-01', 'new')],
    }),
    call: ['acme', 'ledger.approve', '2024-07-01'],
  }),
  Object.freeze({
    id: 'p1b', classId: 'P1', needs: 'resolveEntitlement', kind: 'resolve', expect: 'deny',
    statement: 'the same shape with the DENY recorded by the new engine before the cutover',
    store: storeOf({
      tenants: { beta: { onboardedAt: '2021-03-02', cutoverDate: '2024-02-01' } },
      decisions: [decision('beta', 'ledger.edit', 'DENY', '2023-12-01', 'new'), decision('beta', 'ledger.edit', 'ALLOW', '2024-03-01', 'new')],
    }),
    call: ['beta', 'ledger.edit', '2024-04-01'],
  }),

  /* ---- P2: from the cutover onward, latest wins ---- */
  Object.freeze({
    id: 'p2a', classId: 'P2', needs: 'resolveEntitlement', kind: 'resolve', expect: 'allow',
    statement: 'a DENY recorded AFTER the tenant cutover does not beat a later ALLOW',
    store: storeOf({
      tenants: { acme: { onboardedAt: '2022-01-10', cutoverDate: '2024-01-01' } },
      decisions: [decision('acme', 'ledger.approve', 'DENY', '2024-02-01', 'new'), decision('acme', 'ledger.approve', 'ALLOW', '2024-06-01', 'new')],
    }),
    call: ['acme', 'ledger.approve', '2024-07-01'],
  }),
  Object.freeze({
    id: 'p2b', classId: 'P2', needs: 'resolveEntitlement', kind: 'resolve', expect: 'allow',
    statement: 'a legacy DENY recorded after a migrated tenant\'s cutover is not final',
    store: storeOf({
      tenants: { contoso: { onboardedAt: '2022-05-05', cutoverDate: '2024-01-10' } },
      decisions: [decision('contoso', 'ledger.view', 'DENY', '2024-02-01', 'legacy'), decision('contoso', 'ledger.view', 'ALLOW', '2024-05-01', 'new')],
    }),
    call: ['contoso', 'ledger.view', '2024-06-01'],
  }),

  /* ---- P3: only DENYs are protected ---- */
  Object.freeze({
    id: 'p3a', classId: 'P3', needs: 'resolveEntitlement', kind: 'resolve', expect: 'deny',
    statement: 'an ALLOW recorded before the cutover does not protect against a later DENY',
    store: storeOf({
      tenants: { acme: { onboardedAt: '2022-01-10', cutoverDate: '2024-01-01' } },
      decisions: [decision('acme', 'ledger.edit', 'ALLOW', '2023-06-01', 'legacy'), decision('acme', 'ledger.edit', 'DENY', '2024-03-01', 'new')],
    }),
    call: ['acme', 'ledger.edit', '2024-04-01'],
  }),

  /* ---- P4: the cutover date is the key ---- */
  Object.freeze({
    id: 'p4a', classId: 'P4', needs: 'resolveEntitlement', kind: 'resolve', expect: 'deny',
    statement: 'tenant A: DENY before its cutover, ALLOW after — resolves DENY',
    store: storeOf({
      tenants: { tenantA: { onboardedAt: '2022-01-01', cutoverDate: '2024-01-01' } },
      decisions: [decision('tenantA', 'ledger.approve', 'DENY', '2023-08-01', 'legacy'), decision('tenantA', 'ledger.approve', 'ALLOW', '2024-05-01', 'new')],
    }),
    call: ['tenantA', 'ledger.approve', '2024-06-01'],
  }),
  Object.freeze({
    id: 'p4b', classId: 'P4', needs: 'resolveEntitlement', kind: 'resolve', expect: 'allow',
    statement: 'tenant B: the IDENTICAL decisions, but its cutover precedes the DENY — resolves ALLOW',
    store: storeOf({
      tenants: { tenantB: { onboardedAt: '2022-01-01', cutoverDate: '2023-01-01' } },
      decisions: [decision('tenantB', 'ledger.approve', 'DENY', '2023-08-01', 'legacy'), decision('tenantB', 'ledger.approve', 'ALLOW', '2024-05-01', 'new')],
    }),
    call: ['tenantB', 'ledger.approve', '2024-06-01'],
  }),

  /* ---- P5: revoking a held alias removes access even when the consolidated name is also held ---- */
  Object.freeze({
    id: 'p5a', classId: 'P5', needs: 'revokeEntitlement', kind: 'revoke-then-resolve', expect: 'deny',
    statement: 'revoking ledger.view from a tenant holding ledger.view AND ledger.operate removes access',
    store: storeOf({
      tenants: { acme: { onboardedAt: '2022-01-10', cutoverDate: '2023-01-01' } },
      decisions: [decision('acme', 'ledger.view', 'ALLOW', '2023-02-01', 'legacy'), decision('acme', 'ledger.operate', 'ALLOW', '2024-05-01', 'new')],
    }),
    revoke: ['acme', 'ledger.view'],
    resolve: ['acme', 'ledger.operate', '2024-06-01'],
  }),
  Object.freeze({
    id: 'p5b', classId: 'P5', needs: 'revokeEntitlement', kind: 'revoke-then-resolve', expect: 'deny',
    statement: 'revoking ledger.approve from a tenant holding ledger.edit AND ledger.approve removes access',
    store: storeOf({
      tenants: { beta: { onboardedAt: '2022-02-02', cutoverDate: '2023-01-01' } },
      decisions: [decision('beta', 'ledger.edit', 'ALLOW', '2023-03-01', 'legacy'), decision('beta', 'ledger.approve', 'ALLOW', '2023-04-01', 'legacy')],
    }),
    revoke: ['beta', 'ledger.approve'],
    resolve: ['beta', 'ledger.operate', '2024-06-01'],
  }),

  /* ---- P6: revoking an unheld alias removes nothing ---- */
  Object.freeze({
    id: 'p6a', classId: 'P6', needs: 'revokeEntitlement', kind: 'revoke-refused',
    statement: 'revoking ledger.view from a tenant that does not hold it is refused',
    store: storeOf({
      tenants: { acme: { onboardedAt: '2022-01-10', cutoverDate: '2023-01-01' } },
      decisions: [decision('acme', 'ledger.operate', 'ALLOW', '2024-05-01', 'new')],
    }),
    revoke: ['acme', 'ledger.view'],
  }),
  Object.freeze({
    id: 'p6b', classId: 'P6', needs: 'revokeEntitlement', kind: 'revoke-refused-then-resolve', expect: 'allow',
    statement: 'a refused revocation of an unheld alias mutates NOTHING, so the consolidated access is intact',
    store: storeOf({
      tenants: { acme: { onboardedAt: '2022-01-10', cutoverDate: '2023-01-01' } },
      decisions: [decision('acme', 'ledger.operate', 'ALLOW', '2024-05-01', 'new')],
    }),
    revoke: ['acme', 'ledger.edit'],
    resolve: ['acme', 'ledger.operate', '2024-06-01'],
  }),

  /* ---- P7: capabilities outside the consolidation are independent ---- */
  Object.freeze({
    id: 'p7a', classId: 'P7', needs: 'revokeEntitlement', kind: 'revoke-then-resolve', expect: 'allow',
    statement: 'revoking a consolidated alias does not affect ledger.export',
    store: storeOf({
      tenants: { acme: { onboardedAt: '2022-01-10', cutoverDate: '2023-01-01' } },
      decisions: [decision('acme', 'ledger.view', 'ALLOW', '2023-02-01', 'legacy'), decision('acme', 'ledger.export', 'ALLOW', '2023-03-01', 'legacy')],
    }),
    revoke: ['acme', 'ledger.view'],
    resolve: ['acme', 'ledger.export', '2024-06-01'],
  }),
  Object.freeze({
    id: 'p7b', classId: 'P7', needs: 'revokeEntitlement', kind: 'revoke-refused',
    statement: 'revoking ledger.export from a tenant that does not hold it is refused, even though an alias is held',
    store: storeOf({
      tenants: { acme: { onboardedAt: '2022-01-10', cutoverDate: '2023-01-01' } },
      decisions: [decision('acme', 'ledger.view', 'ALLOW', '2023-02-01', 'legacy')],
    }),
    revoke: ['acme', 'ledger.export'],
  }),

  /* ---- X1: extension, not a Project rule ---- */
  Object.freeze({
    id: 'x1a', classId: 'X1', needs: 'resolveEntitlement', kind: 'resolve', expect: 'deny', extension: true,
    statement: 'a resolution before every decision sees nothing',
    store: storeOf({
      tenants: { acme: { onboardedAt: '2022-01-10', cutoverDate: null } },
      decisions: [decision('acme', 'ledger.view', 'ALLOW', '2023-02-01', 'legacy')],
    }),
    call: ['acme', 'ledger.view', '2022-06-01'],
  }),
]);

/** §15: the classes with their case counts, for the record. */
export function classSummary() {
  return Object.freeze(DIAGNOSTIC_CLASSES.map((entry) => Object.freeze({
    ...entry,
    cases: DIAGNOSTIC_CASES.filter((testCase) => testCase.classId === entry.id).length,
  })));
}

/* ================================================================ judging */

/** A canonical encoding, so a comparison cannot depend on key order. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

/**
 * §15: JUDGE ONE CASE against a candidate.
 *
 * The candidate is called with a FRESH clone of the case's store, so a case can never be affected by another's
 * mutation. A thrown error is a REFUSAL, which is a correct outcome for `revoke-refused` and a failure otherwise.
 */
export function judgeCase(candidate, testCase) {
  const required = testCase.needs;
  if (typeof candidate[required] !== 'function') {
    return Object.freeze({ id: testCase.id, classId: testCase.classId, pass: false, detail: `MISSING_EXPORT:${required}` });
  }
  const store = structuredClone(testCase.store);
  try {
    if (testCase.kind === 'resolve') {
      const actual = candidate.resolveEntitlement(store, ...testCase.call);
      const pass = String(actual).toLowerCase() === testCase.expect;
      return Object.freeze({ id: testCase.id, classId: testCase.classId, pass, detail: pass ? 'ok' : `expected ${testCase.expect}, got ${String(actual)}` });
    }
    if (testCase.kind === 'revoke-then-resolve') {
      candidate.revokeEntitlement(store, ...testCase.revoke);
      const actual = candidate.resolveEntitlement(store, ...testCase.resolve);
      const pass = String(actual).toLowerCase() === testCase.expect;
      return Object.freeze({ id: testCase.id, classId: testCase.classId, pass, detail: pass ? 'ok' : `after revoke expected ${testCase.expect}, got ${String(actual)}` });
    }
    if (testCase.kind === 'revoke-refused-then-resolve') {
      /**
       * A refusal must be BOTH a throw and a non-mutation. A naive implementation that throws AFTER removing the
       * record would pass a bare refusal check while having already destroyed the tenant's state, so the case
       * asserts the refusal AND the surviving access.
       */
      try {
        candidate.revokeEntitlement(store, ...testCase.revoke);
        return Object.freeze({ id: testCase.id, classId: testCase.classId, pass: false, detail: 'expected a refusal, but the revocation was accepted' });
      } catch {
        const actual = candidate.resolveEntitlement(store, ...testCase.resolve);
        const pass = String(actual).toLowerCase() === testCase.expect;
        return Object.freeze({ id: testCase.id, classId: testCase.classId, pass, detail: pass ? 'refused and mutated nothing' : `refused, but the resolve then returned ${String(actual)}` });
      }
    }
    if (testCase.kind === 'revoke-refused') {
      try {
        candidate.revokeEntitlement(store, ...testCase.revoke);
        return Object.freeze({ id: testCase.id, classId: testCase.classId, pass: false, detail: 'expected a refusal, but the revocation was accepted' });
      } catch {
        return Object.freeze({ id: testCase.id, classId: testCase.classId, pass: true, detail: 'refused as required' });
      }
    }
    return Object.freeze({ id: testCase.id, classId: testCase.classId, pass: false, detail: `UNKNOWN_KIND:${String(testCase.kind)}` });
  } catch (error) {
    return Object.freeze({ id: testCase.id, classId: testCase.classId, pass: false, detail: `THREW:${String(error?.message ?? error).slice(0, 120)}` });
  }
}

/**
 * §15: THE DIAGNOSTIC VECTOR.
 *
 * `invariantVector` is the frozen shape the outcomes record: one boolean per class, plus the failed class ids and
 * the coverage. It is computed for the FIRST candidate and for the FINAL promoted source, which is what lets the
 * analysis see whether a cheaper reconstruction came at the cost of the wrong current standing.
 */
export function diagnosticVector(candidate) {
  const results = DIAGNOSTIC_CASES.map((testCase) => judgeCase(candidate, testCase));
  const classes = classSummary().map((entry) => {
    const members = results.filter((result) => result.classId === entry.id);
    return Object.freeze({
      classId: entry.id,
      invariant: entry.invariant,
      prepaid: entry.prepaid,
      extension: entry.extension === true,
      cases: members.length,
      passed: members.filter((result) => result.pass).length,
      pass: members.every((result) => result.pass),
      failures: Object.freeze(members.filter((result) => !result.pass).map((result) => `${result.id}:${result.detail}`)),
    });
  });
  const prepaidClasses = classes.filter((entry) => entry.prepaid === true);
  const failed = classes.filter((entry) => !entry.pass).map((entry) => entry.classId);
  const failedPrepaid = prepaidClasses.filter((entry) => !entry.pass).map((entry) => entry.classId);
  return Object.freeze({
    kind: 'InvariantVector',
    results: Object.freeze(results),
    classes: Object.freeze(classes),
    classPass: Object.freeze(Object.fromEntries(classes.map((entry) => [entry.classId, entry.pass]))),
    failedClasses: Object.freeze(failed),
    failedPrepaidClasses: Object.freeze(failedPrepaid),
    coverage: (classes.length - failed.length) / classes.length,
    prepaidCoverage: prepaidClasses.length === 0 ? 1 : (prepaidClasses.length - failedPrepaid.length) / prepaidClasses.length,
    invariantsExercised: Object.freeze([...new Set(classes.filter((entry) => entry.invariant !== null).map((entry) => entry.invariant))]),
  });
}

/** §15: the invariant ids the oracle can decide, so a plan can record what is actually instrumented. */
export function instrumentedInvariants() {
  return Object.freeze([...new Set(DIAGNOSTIC_CLASSES.filter((entry) => entry.invariant !== null).map((entry) => entry.invariant))]);
}

/** §4: the invariants the oracle does NOT instrument, which would be a gap rather than a pass. */
export function uninstrumentedInvariants() {
  const instrumented = instrumentedInvariants();
  return Object.freeze(INVARIANTS.filter((entry) => !instrumented.includes(entry.id)).map((entry) => entry.id));
}
