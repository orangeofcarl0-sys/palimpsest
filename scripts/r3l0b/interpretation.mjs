/**
 * R3-L0B §2/§19/§20 — THE CORRECTED CAUSAL INTERPRETATION AND THE PRE-RULING.
 *
 * §2 requires the R3-L0 causal reading to be CORRECTED rather than deleted, and the correction is a specific
 * shape: the mechanism facts stay valid, the behavioral causal status becomes not identifiable, and the
 * preregistered verdict is preserved as protocol output whose causal interpretation is superseded.
 *
 * §19 requires the next trajectory NOT to be authored, and permits only its design requirements to be frozen.
 * §20 requires the future primary outcomes to be RECOMMENDED with no numerical threshold frozen.
 *
 * This module assembles those three things into the artifacts a later stage reads. It is deliberately a
 * separate file from the interference and containment work, because the causal reading and the design
 * pre-ruling are conclusions drawn FROM the measurements rather than measurements themselves, and a reader
 * should be able to see which is which.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import {
  EXPERIMENT_LAWS,
  FUTURE_OUTCOME_SCOPE,
  PRE_RULING_SCOPE,
  R3L0_EVIDENCE_CLASSES,
  RECONSTRUCTION_PRIMARY_OUTCOMES,
  RECONSTRUCTION_PRESSURE_REQUIREMENTS,
} from './contract.mjs';

/**
 * §2: THE CORRECTED CAUSAL INTERPRETATION.
 *
 * Every field is either a measured count from the interference graph or a frozen constant from the contract, so
 * the correction cannot drift away from the evidence it rests on.
 */
export function correctedCausalInterpretation(input) {
  const graph = input.graph;
  const spillover = graph?.spilloverSummary ?? null;
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0B',
    kind: 'corrected R3-L0 causal interpretation',
    /** §2: what the containment adjudication does NOT change. */
    mechanismEvidenceUnchanged: R3L0_EVIDENCE_CLASSES.stillValidMechanismEvidence,
    /** §2: what it does change, with the measured basis for each reason. */
    behavioralCausalStatus: Object.freeze({
      id: R3L0_EVIDENCE_CLASSES.behavioralCausalStatus.id,
      value: R3L0_EVIDENCE_CLASSES.behavioralCausalStatus.value,
      reasons: R3L0_EVIDENCE_CLASSES.behavioralCausalStatus.reasons,
      measuredBasis: Object.freeze({
        HISTORY_ONLY_FLOOR: 'HISTORY_ONLY reached PERR 0.000 in all four blocks, so the primary endpoint had no room to discriminate',
        OUTCOME_ORACLE_EXPOSURE: graph === null ? 'not measured on this host' : `${String(graph.oracleExposures.length)} session(s) reached the outcome instrument: ${graph.oracleExposures.map((row) => row.sessionId).join(', ')}`,
        CROSS_TRAJECTORY_INTERFERENCE: spillover === null ? 'not measured on this host' : `${String(spillover.sessionsWithSiblingReads)} session(s) read a sibling unit across ${String(spillover.siblingReadRows)} unit pair(s)`,
      }),
    }),
    /** §2: the preregistered verdict is preserved; only its causal reading is superseded. */
    preservedPreregisteredVerdict: R3L0_EVIDENCE_CLASSES.preservedPreregisteredVerdict,
    /** The correction in one sentence, so a report can quote it without re-deriving it. */
    statement: 'The R3-L0 mechanism result stands; the R3-L0 behavioral capital effect is NOT IDENTIFIABLE, because the primary endpoint had no room to discriminate and two further reasons independently block a causal reading.',
    /** What a later stage may and may not say about R3-L0. */
    permittedClaims: Object.freeze([
      'the long-horizon capital mechanism was delivered, governed, and consumed',
      'the containment defect is measured, located, and repaired for future experiments',
    ]),
    forbiddenClaims: Object.freeze([
      'that capital improved or harmed task reliability, because the effect is not identifiable',
      'that project history caused the HISTORY_ONLY result, which requires a no-history arm this stage is not permitted to add',
      'that a clean-subset re-analysis is a primary result',
    ]),
  });
}

/**
 * §19: THE PRE-RULING FOR THE NEXT TRAJECTORY.
 *
 * §19 forbids authoring the next trajectory and permits ONLY freezing its design requirements, so this artifact
 * contains requirements and a prohibition — never a fixture, never a case, never an answer.
 */
export function reconstructionPressurePreRuling() {
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0B',
    kind: 'project-specific reconstruction-pressure pre-ruling',
    authoringScope: PRE_RULING_SCOPE,
    /** §19: the requirements a future lesson must satisfy, frozen as checkable properties. */
    designRequirements: RECONSTRUCTION_PRESSURE_REQUIREMENTS,
    /**
     * §19: the two properties that keep the experiment honest, stated separately because they are the ones a
     * designer is most likely to violate while chasing a measurable effect.
     */
    integrityConstraints: Object.freeze([
      Object.freeze({ id: 'RAW_HISTORY_ARM_CAN_SUCCEED', why: 'a raw-history arm that cannot succeed measures an oracle, not a reconstruction burden' }),
      Object.freeze({ id: 'CAPITAL_REDUCES_BURDEN_NOT_ORACLE', why: 'capital must make reconstruction cheaper, not supply information the raw history does not contain' }),
    ]),
    /** §19: the prohibition, carried in the artifact so a later stage reads it before writing bytes. */
    prohibition: 'no trajectory, fixture, lesson, diagnostic case or acceptance case was authored in this stage',
    /** §20: the recommended outcomes, with no threshold frozen. */
    futurePrimaryOutcomes: RECONSTRUCTION_PRIMARY_OUTCOMES,
    futureOutcomeScope: FUTURE_OUTCOME_SCOPE,
    /** §17/§18: the laws that bind the future experiment, carried with the pre-ruling. */
    applicableLaws: EXPERIMENT_LAWS,
  });
}

/** The one-line header both artifacts share, for a report. */
export function preRulingSummary() {
  return Object.freeze({
    requirements: RECONSTRUCTION_PRESSURE_REQUIREMENTS.length,
    integrityConstraints: 2,
    futurePrimaryOutcomes: RECONSTRUCTION_PRIMARY_OUTCOMES.length,
    thresholdsFrozen: false,
    trajectoryAuthored: false,
  });
}
