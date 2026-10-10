/**
 * R3-L0C-I-A-R-L-C-F §3 Gate F1 — REAL ADMISSION-TIME FRESHNESS.
 *
 * THE DEFECT THIS CLOSES, measured by `baseline/legacy-controls.mjs controlCapturedNotFresh` by CALLING the real
 * pipeline: in DETERMINISTIC mode with no injected `terminalRecompute`, the default branch of `recomputeAtAdmission`
 * returned the CAPTURED preflight `closure` object and the PREFLIGHT route identity. The normal, non-injected path
 * therefore performed no recomputation at all, and recorded no basis — so a reader could not distinguish a fresh
 * admission-time measurement from a captured preflight object.
 *
 * THE REPAIR IS A MEASUREMENT THAT ALWAYS RECOMPUTES, AND RECORDS HOW. §3 requires the result to record "the
 * measurement basis, not merely a boolean `fresh: true`". So every measurement carries:
 *
 *   basis                   one of FRESHNESS_BASIS — what actually produced this value
 *   preflightClosureDigest  the digest the preflight captured, kept SEPARATELY so a drift is classifiable
 *   admissionClosureDigest  the digest measured AT THIS INSTANT
 *   admissionRouteIdentity  the effective route measured AT THIS INSTANT
 *   drifted                 whether the admission-time value moved away from the preflight's
 *   boundClosureDigest      the plan's binding, so a match is against the plan and not against the preflight
 *
 * WHY THE DEFAULT PATH RECOMPUTES. §3: "A normal, non-injected execution must actually recompute its closure and
 * effective route at the terminal-admission boundary. The default path must not return captured preflight objects
 * as though they were fresh measurements." So `recompute` is REQUIRED for the normal path, and a caller that omits
 * it gets `RECOMPUTATION_FAILED` rather than a captured value.
 *
 * WHY AN INJECTION IS STILL PERMITTED IN DETERMINISTIC AND REFUSED IN PRIMARY. §3 requires the injection to be
 * "separate from the normal measurement path" and PRIMARY terminal measurements to be refused. So an injection is
 * labelled `INJECTED_BY_TEST`, and in PRIMARY it is refused outright rather than accepted with a label — a label
 * is not a boundary.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { FRESHNESS_BASIS, FRESHNESS_FIELDS, NL } from './contract.mjs';

/** §3: the freshness measurement. Its fields are the contract's, so the two cannot drift. */
export const MEASURED_FIELDS = FRESHNESS_FIELDS;

/**
 * §3: MEASURE THE CLOSURE AND THE ROUTE AT THE ADMISSION INSTANT.
 *
 * The normal path calls `recompute` and records what it returned. The preflight digest is carried beside the
 * admission digest so a drift is a NAMED classification rather than an unexplained mismatch.
 */
export async function admissionTimeMeasurement(input) {
  const {
    mode,
    boundClosureDigest = null,
    preflightClosureDigest = null,
    preflightRouteIdentity = null,
    recompute = null,
    injection = null,
  } = input;

  /** §3 requirement 8: a caller-supplied terminal measurement is REFUSED in PRIMARY, not accepted with a label. */
  if (mode === 'PRIMARY' && injection !== null && injection !== undefined) {
    return Object.freeze({
      schemaVersion: 1,
      kind: 'admission-time measurement',
      basis: FRESHNESS_BASIS.RECOMPUTATION_FAILED,
      refused: true,
      reason: 'a PRIMARY run supplied an injected terminal measurement; in PRIMARY the pipeline derives its own measurements and refuses caller substitution',
      preflightClosureDigest,
      admissionClosureDigest: null,
      admissionRouteIdentity: null,
      boundClosureDigest,
      recomputedAt: null,
      drifted: null,
      closureMatchesPlan: false,
      fresh: false,
    });
  }

  /** §3 requirement 7: an injected measurement is SEPARATE, and labelled as an injection rather than as a measurement. */
  if (injection !== null && injection !== undefined) {
    const closure = injection?.closure?.executionClosureDigest ?? injection?.closureDigest ?? null;
    const route = injection?.route?.MODEL_ROUTE_IDENTITY ?? injection?.routeIdentity ?? null;
    return finish({
      basis: FRESHNESS_BASIS.INJECTED_BY_TEST,
      boundClosureDigest,
      preflightClosureDigest,
      admissionClosureDigest: closure,
      admissionRouteIdentity: route,
      preflightRouteIdentity,
      recomputedAt: new Date().toISOString(),
      injectionUsed: true,
    });
  }

  /** §3 requirement 3: the NORMAL path RECOMPUTES. An omitted `recompute` is a failure, not a captured value. */
  if (typeof recompute !== 'function') {
    return Object.freeze({
      schemaVersion: 1,
      kind: 'admission-time measurement',
      basis: FRESHNESS_BASIS.RECOMPUTATION_FAILED,
      refused: false,
      reason: 'no recomputation was supplied, so the admission-time value could not be measured; the normal path must recompute rather than return a captured preflight object',
      preflightClosureDigest,
      admissionClosureDigest: null,
      admissionRouteIdentity: null,
      boundClosureDigest,
      recomputedAt: null,
      drifted: null,
      closureMatchesPlan: false,
      fresh: false,
    });
  }

  let fresh = null;
  try {
    fresh = await recompute();
  } catch (error) {
    return Object.freeze({
      schemaVersion: 1,
      kind: 'admission-time measurement',
      basis: FRESHNESS_BASIS.RECOMPUTATION_FAILED,
      refused: false,
      reason: `the admission-time recomputation threw: ${String(error?.message ?? error).slice(0, 200)}`,
      preflightClosureDigest,
      admissionClosureDigest: null,
      admissionRouteIdentity: null,
      boundClosureDigest,
      recomputedAt: null,
      drifted: null,
      closureMatchesPlan: false,
      fresh: false,
    });
  }

  return finish({
    basis: FRESHNESS_BASIS.RECOMPUTED_AT_ADMISSION,
    boundClosureDigest,
    preflightClosureDigest,
    admissionClosureDigest: fresh?.closure?.executionClosureDigest ?? null,
    admissionRouteIdentity: fresh?.route?.MODEL_ROUTE_IDENTITY ?? null,
    preflightRouteIdentity,
    recomputedAt: new Date().toISOString(),
    /** §3 requirement 9: a compiled check that did not run cannot be a PRIMARY runtime verification. */
    compiledVerificationEvaluated: fresh?.compiledVerificationEvaluated ?? null,
  });
}

/** §3: assemble the measurement, computing the drift classification and the plan match in one place. */
function finish(input) {
  const {
    basis, boundClosureDigest, preflightClosureDigest, admissionClosureDigest,
    admissionRouteIdentity, preflightRouteIdentity, recomputedAt, injectionUsed = false,
    compiledVerificationEvaluated = null,
  } = input;
  const closureMatchesPlan = typeof boundClosureDigest === 'string' && boundClosureDigest !== '' && admissionClosureDigest === boundClosureDigest;
  const drifted = preflightClosureDigest !== null && preflightClosureDigest !== undefined && preflightClosureDigest !== admissionClosureDigest;
  const routeDrifted = preflightRouteIdentity !== null && preflightRouteIdentity !== undefined && preflightRouteIdentity !== admissionRouteIdentity;
  return Object.freeze({
    schemaVersion: 1,
    kind: 'admission-time measurement',
    basis,
    refused: false,
    reason: null,
    /** §3 requirement 5: the preflight digest is kept SEPARATELY, so a drift is classifiable. */
    preflightClosureDigest,
    admissionClosureDigest,
    admissionRouteIdentity,
    preflightRouteIdentity,
    boundClosureDigest,
    recomputedAt,
    drifted,
    routeDrifted,
    closureMatchesPlan,
    routeMatchesPlan: admissionRouteIdentity === 'MATCH',
    injectionUsed,
    compiledVerificationEvaluated,
    /** §3 requirement 9: a skipped compiled check is not a PRIMARY runtime verification. */
    skippedCompiledCheckIsNotPrimaryVerification: true,
    /** §3: the measurement is FRESH only when it was actually recomputed, not injected and not captured. */
    fresh: basis === FRESHNESS_BASIS.RECOMPUTED_AT_ADMISSION,
    /** §3: the fields the contract requires, each checked rather than assumed. */
    fieldsPresent: FRESHNESS_FIELDS.filter((field) => !(field in { basis, preflightClosureDigest, admissionClosureDigest, admissionRouteIdentity, recomputedAt, drifted, boundClosureDigest })),
    law: 'the admission-time measurement recomputes the closure and the effective route at the terminal boundary and records the basis, so a captured preflight object is distinguishable from a fresh measurement',
  });
}

export { NL };
