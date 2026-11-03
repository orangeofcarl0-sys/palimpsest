/**
 * R3-L0C-I-A-R-L-C-F-S-H §3 H1 — THE VALIDATED COST ADMISSION BRIDGE.
 *
 * THE DEFECT THIS CLOSES, measured by `baseline/legacy-controls.mjs controlValidatorNotConsumed` against the real
 * `80823c4` code: the previous stage added `validateArtifactEnvelope`, and the authoritative chain never called it.
 * `scripts/r3l0ciarlcf/cost-bridge.mjs:231` still decided interpretability with `interpretArtifact`, whose ONLY
 * content test is `records.length === 0` — so an artifact whose single record is `{"type":"noise"}` was admitted as
 * `MEASURED_FIXTURE` with `rawHistoryArtifactsRead: 0`, indistinguishable from a genuine measured zero.
 *
 * WHAT THIS MODULE DOES. §3 requires the authority chain to be: read the durable journal; identify the admitted
 * trial records; resolve each digest-bound sidecar; validate the session/attempt/artifact identity; verify the
 * artifact content digest; validate the artifact event envelope; admit a cost measurement only when the required
 * validity conditions hold; reuse the frozen reconstruction-cost calculation; classify measured, absent and invalid
 * observations separately; and build the matrix result from the validated per-session states.
 *
 * Steps 1-5 are the FROZEN bridge's own work, so this module CALLS `bridgeMatrixCost` rather than reimplementing
 * them. Step 6 is the envelope validator. Steps 7-10 are the correction: the preliminary attribution is post-
 * validated, an invalid observation's preliminary cost fields are DISCARDED, and every aggregate is recomputed from
 * the validated observations alone.
 *
 * WHY POST-VALIDATION RATHER THAN GATING `reconstructCost`. §3 prefers gating the frozen reconstruction call, and
 * says a stage-owned post-validation adapter is acceptable only if the existing API makes gating impossible without
 * modifying historical files. It does: `attributeSessionFromRecord` calls `interpretArtifact` and then
 * `reconstructCost` INSIDE one function with no injection seam, and §1 freezes that file. So this adapter is the
 * permitted form, and it does what §3 requires of it — "explicitly discard invalid preliminary fields and recompute
 * every aggregate from validated observations". No preliminary value survives into an admitted `measured` array, a
 * measured-count total or a downstream evaluability flag.
 *
 * THE MECHANICAL VERSUS SCIENTIFIC DISTINCTION, EXPRESSED AS THE FROZEN RULE RATHER THAN A STRICTER ONE.
 *
 * The frozen `postMatrixValidityGate` condition 6 is `interpretable === true && rejectedCount === 0`, where the
 * frozen bridge defines `interpretable` as "every planned session is either measured or carries an EXPLICIT,
 * labelled absence". An invalid artifact is precisely such an explicitly classified absence: the session ran
 * mechanically, its artifact exists and is identity-bound, and the measurement is labelled invalid with a named
 * reason. So it belongs in `absent`, NOT in `measured`.
 *
 * That is what keeps the two decisions separate and honest:
 *
 *   MECHANICAL   all 16 sessions accounted for, so `CostAccountingComplete` holds and the matrix may complete
 *   MEASURED     only 15 have a VALIDATED observation, so `CostMeasuredComplete` is FALSE
 *   LIVE         no session has verified PRIMARY provenance, so `LivePrimaryCostComplete` is FALSE
 *   CAUSAL       `CAUSAL_RESULT` stays NOT_EVALUABLE, because the live-primary cost prerequisite is unmet
 *
 * §3 forbids both errors here: an invalid observation must not be promoted to a measured zero, and a missing cost
 * observation must not be silently replaced by zero. Neither happens — the invalid observation is visible, named,
 * counted, and carries NULL cost fields rather than zeros.
 *
 * `rejectedCount` STAYS 0 BECAUSE NOTHING IS UNACCOUNTED FOR, and the invalid count is carried SEPARATELY on
 * `invalidCount` and `invalid`, so a reader sees the number rather than having it folded into a vestigial field.
 * Every caller in this repository has always hardcoded `rejectedCount: 0`; the field has never carried an
 * invalid-observation count, and this module does not invent that meaning for it after seeing a result.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { NL } from './contract.mjs';

/** §3: the validated bridge's outcome vocabulary, so a caller reads the state by name rather than by a boolean. */
export const VALIDATED_COST_OUTCOMES = Object.freeze([
  Object.freeze({ id: 'VALIDATED_MEASURED', measured: true, detail: 'the frozen bridge attributed a cost AND the artifact satisfies the §6 event envelope' }),
  Object.freeze({ id: 'INVALID_ENVELOPE', measured: false, detail: 'the frozen bridge attributed a cost but the artifact failed the §6 event envelope, so the preliminary fields were DISCARDED' }),
  Object.freeze({ id: 'FROZEN_BRIDGE_ABSENCE', measured: false, detail: 'the frozen bridge already classified this session as an explicit labelled absence, which this adapter preserves unchanged' }),
]);

/**
 * §3: THE VALIDATED MATRIX COST.
 *
 * It calls the frozen bridge for steps 1-5, applies the envelope validator as step 6, discards the preliminary
 * fields of every invalid observation, and rebuilds every aggregate from the validated set.
 */
export async function validatedCostBridge(input) {
  const { journalPath, runRoot, plannedSessions = null, artifactRoot = null, dshHomePath = null, witnesses = {} } = input;
  const { bridgeMatrixCost } = await import('../r3l0ciarlcf/cost-bridge.mjs');
  const { validateArtifactEnvelope } = await import('./artifact-validity.mjs');
  const { decompressFrames, sessionRecords } = await import('../r3l0c/instrumentation.mjs');

  /** STEPS 1-5, the frozen bridge's own work: journal, trials, sidecar, identity, content digest, provenance. */
  const preliminary = await bridgeMatrixCost({ journalPath, runRoot, plannedSessions, artifactRoot, dshHomePath, witnesses });

  const measured = [];
  const invalid = [];
  const perSession = [];
  const plannedCount = preliminary.plannedSessions;

  for (const entry of preliminary.perSession) {
    if (entry.measured !== true) {
      /** The frozen bridge's own labelled absence is preserved UNCHANGED, including its named outcome. */
      perSession.push(Object.freeze({
        sessionId: entry.sessionId,
        outcome: entry.outcome.id,
        measured: false,
        provenance: null,
        validated: false,
        /** §3: the cost fields are ABSENT rather than zero, so an absence cannot satisfy a measured level. */
        fields: null,
        costFieldsAbsent: true,
        reason: entry.reason,
        source: 'FROZEN_BRIDGE_ABSENCE',
        frozenOutcome: entry.outcome.id,
      }));
      continue;
    }

    /** STEP 6: THE ENVELOPE VALIDATION, on the exact artifact the frozen bridge resolved and digest-verified. */
    const artifactPath = entry.fields?.sessionArtifactIdentity?.path ?? null;
    const validity = validateArtifactEnvelope({ artifactPath, decompressFrames, sessionRecords });
    if (validity.interpretable !== true) {
      /**
       * STEP 7: NOT ADMITTED. The preliminary cost fields the frozen bridge computed are DISCARDED, and the session
       * becomes an explicitly labelled INVALID observation rather than a measured zero.
       */
      invalid.push(Object.freeze({
        sessionId: entry.sessionId,
        outcome: 'INVALID_ENVELOPE',
        validityState: validity.state,
        reason: validity.reason,
        artifactPath,
      }));
      perSession.push(Object.freeze({
        sessionId: entry.sessionId,
        outcome: 'INVALID_ENVELOPE',
        measured: false,
        provenance: null,
        validated: false,
        /** §3: an invalid observation carries NULL cost fields, never the preliminary values and never zeros. */
        fields: null,
        costFieldsAbsent: true,
        reason: validity.reason,
        validityState: validity.state,
        /** The preliminary attribution is carried for DIAGNOSIS only, under a name that cannot be read as admitted. */
        discardedPreliminaryFields: entry.fields,
        discardedPreliminaryReason: 'the frozen bridge attributed a cost before the envelope validator ran, so these fields are NOT an admitted measurement',
        source: 'INVALID_ENVELOPE',
      }));
      continue;
    }

    /** STEP 7 (positive): ADMITTED. The frozen `reconstructCost` already produced these fields. */
    measured.push(Object.freeze({ ...entry, validityState: validity.state, envelopeValidated: true }));
    perSession.push(Object.freeze({
      sessionId: entry.sessionId,
      outcome: entry.outcome.id,
      measured: true,
      provenance: entry.provenance,
      validated: true,
      fields: entry.fields,
      costFieldsAbsent: false,
      validityState: validity.state,
      envelopeValidated: true,
      reason: null,
      source: 'VALIDATED_MEASURED',
    }));
  }

  /** STEPS 8-10: REBUILD EVERY AGGREGATE FROM THE VALIDATED OBSERVATIONS ALONE. */
  const livePrimary = measured.filter((entry) => entry.provenance === 'LIVE_PRIMARY');
  const fixture = measured.filter((entry) => entry.provenance === 'FIXTURE');
  const absentEntries = perSession.filter((entry) => entry.measured !== true);
  const absentCount = absentEntries.length;
  const accountedFor = measured.length + absentCount;

  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C-F-S-H',
    kind: 'validated durable-evidence reconstruction cost',
    journalPath,
    journalIntact: preliminary.journalIntact,
    journalRecords: preliminary.journalRecords,
    trialRecords: preliminary.trialRecords,
    plannedSessions: plannedCount,
    measuredCount: measured.length,
    absentCount,
    /** §3: the invalid count, carried SEPARATELY so the number is visible rather than folded into a vestigial field. */
    invalidCount: invalid.length,
    invalid: Object.freeze(invalid),
    measured: Object.freeze(measured),
    absent: Object.freeze(absentEntries.map((entry) => Object.freeze({ sessionId: entry.sessionId, outcome: entry.outcome, reason: entry.reason, detail: entry.source }))),
    perSession: Object.freeze(perSession),
    livePrimaryCount: livePrimary.length,
    fixtureCount: fixture.length,
    provenance: livePrimary.length > 0 && livePrimary.length === plannedCount ? 'LIVE_PRIMARY'
      : measured.length === 0 ? 'ABSENT'
        : livePrimary.length > 0 ? 'MIXED' : 'FIXTURE',
    /** §3: accounting completeness means every session is measured or explicitly classified — an invalid one included. */
    interpretable: accountedFor === plannedCount && plannedCount > 0,
    allAttributed: absentCount === 0 && measured.length === plannedCount,
    allSixteenLivePrimary: plannedCount === 16 && livePrimary.length === 16,
    blocksCausalVerdict: livePrimary.length !== plannedCount,
    /**
     * §3: nothing is unaccounted for, so nothing was "rejected". The invalid observations are their own named state
     * on `invalidCount`/`invalid`, which is why this stays 0 rather than being repurposed.
     */
    rejectedCount: 0,
    unaccountedCount: Math.max(0, plannedCount - accountedFor),
    inventedFromMissingEvidence: false,
    selectedLatestArtifactByConvenience: false,
    declarationsAcceptedAsWitness: false,
    /** §3: the validator is now ON the authoritative path, which is the whole correction. */
    envelopeValidatorConsumed: true,
    /** §3: the frozen bridge's preliminary verdict is carried for comparison, never as an admission. */
    frozenPreliminary: Object.freeze({
      measuredCount: preliminary.measuredCount,
      absentCount: preliminary.absentCount,
      interpretable: preliminary.interpretable,
      /** The count the OLD path would have admitted, so the correction's effect is measurable rather than asserted. */
      wouldHaveAdmittedInvalid: preliminary.measuredCount > measured.length,
    }),
    discardedPreliminaryFieldCount: invalid.length,
    law: 'a cost observation is admitted only after the artifact satisfies the event envelope; an invalid observation carries NULL fields rather than the frozen bridge\'s preliminary values or invented zeros, and every aggregate is recomputed from the validated set',
  });
}

/**
 * §3: THE THREE COST-COMPLETENESS LEVELS, computed from a validated bridge result.
 *
 * The frozen `costCompleteness` already implements the levels, so this delegates to it rather than restating the
 * rule — there is still exactly one cost-counting algorithm and one completeness reduction.
 */
export async function validatedCostCompleteness(costAttribution) {
  const { costCompleteness } = await import('../r3l0ciarlcf/durable-reconciliation.mjs');
  const levels = costCompleteness(costAttribution);
  return Object.freeze({
    ...levels,
    /** §3: an invalid observation satisfies NEITHER measured level, and the invalid count is visible beside them. */
    invalidCount: costAttribution?.invalidCount ?? 0,
    invalidSatisfiesMeasuredCompleteness: false,
    law: 'an invalid artifact satisfies neither CostMeasuredComplete nor LivePrimaryCostComplete, while a clearly classified absence may still satisfy CostAccountingComplete',
  });
}

export { NL };
