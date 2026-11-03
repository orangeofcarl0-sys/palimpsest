/**
 * R3-AE §9/§10/§11 — THE FROZEN EXPERIMENTAL FIXTURE MANIFEST.
 *
 * §9 removes the hard-coded `compliant: true` from the analysis stage. Compliance is EXPERIMENT METADATA
 * that belongs to the FIXTURE, is frozen with it, and is consumed by the gate rather than asserted by the
 * code that computes the verdict.
 *
 * THREE THINGS THIS FILE KEEPS APART, because §11 says they are not the same:
 *
 *   antiOverfitProcess   was the fixture designed from mechanism requirements, or authored around an
 *                        evaluation model's observed failures?
 *   contamination        do construction and evaluation share a model family?
 *   heldOut              is the fixture genuinely held out from the evaluation model?
 *
 * `COMPLIANT` does NOT imply `heldOut`. A fixture can be anti-overfit compliant and still not be held out,
 * because its failure classes may have been authored by an actor whose model family is the same as (or
 * unknown relative to) the evaluation family. §11: when the construction model identity is UNKNOWN,
 * `heldOut` is `false` for claim-ladder purposes unless independence can be demonstrated.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

/** §9: the frozen anti-overfit classifications. */
export const ANTI_OVERFIT_PROCESSES = Object.freeze({ COMPLIANT: 'COMPLIANT', NON_COMPLIANT: 'NON_COMPLIANT' });

/** §9: the frozen contamination classifications. */
export const CONTAMINATION = Object.freeze({ INDEPENDENT: 'INDEPENDENT', SHARED_MODEL_FAMILY: 'SHARED_MODEL_FAMILY', UNKNOWN: 'UNKNOWN' });

/**
 * §9/§11: THE FIXTURE MANIFESTS.
 *
 * For F-A and F-B the local coding agent authored the fixtures. §9 explicitly forbids inventing that agent's
 * model identity, so the model id and family are `UNKNOWN` and contamination is `UNKNOWN`. Consequently
 * `heldOut` is `false` for claim-ladder purposes — NOT because the fixtures are defective, but because
 * independence cannot be demonstrated from the record.
 */
export const FIXTURE_MANIFESTS = Object.freeze([
  Object.freeze({
    fixtureId: 'r3a-f-a-atomic-transaction',
    fixtureRevision: 1,
    contentDigest: '468cfcea8a8e36127ebba9022f21cad1c751f2b18cca7f53867775c6163fc37a',
    antiOverfitProcess: ANTI_OVERFIT_PROCESSES.COMPLIANT,
    /** §9: the evidentiary basis for the COMPLIANT classification, stated rather than assumed. */
    antiOverfitBasis: 'the failure classes were authored from the atomicity obligation BEFORE any qualification run, and were NOT revised after the qualification outcomes were seen; the fixture is byte-identical to its pre-qualification digest',
    constructionActor: 'LOCAL_CODING_AGENT',
    constructionModelId: 'UNKNOWN',
    constructionModelFamily: 'UNKNOWN',
    evaluationModelFamiliesKnownAtConstruction: false,
    contamination: CONTAMINATION.UNKNOWN,
    heldOut: false,
    heldOutReason: 'the construction model identity is UNKNOWN, so independence from the evaluation families cannot be demonstrated (§11)',
  }),
  Object.freeze({
    fixtureId: 'r3a-f-b-versioned-migration',
    fixtureRevision: 1,
    contentDigest: '8e290a4be4ba7f2713b621806113a99fc8e15e009b4a75630be9d593757b7611',
    antiOverfitProcess: ANTI_OVERFIT_PROCESSES.COMPLIANT,
    antiOverfitBasis: 'the failure classes were authored from the forward-compatibility obligation BEFORE any qualification run, and were NOT revised after the qualification outcomes were seen — the ceiling result was recorded rather than repaired, which is the strongest available evidence that the fixture was not tuned',
    constructionActor: 'LOCAL_CODING_AGENT',
    constructionModelId: 'UNKNOWN',
    constructionModelFamily: 'UNKNOWN',
    evaluationModelFamiliesKnownAtConstruction: false,
    contamination: CONTAMINATION.UNKNOWN,
    heldOut: false,
    heldOutReason: 'the construction model identity is UNKNOWN, so independence from the evaluation families cannot be demonstrated (§11)',
  }),
]);

/** The manifest for a fixture id, or undefined. */
export function manifestFor(fixtureId) {
  return FIXTURE_MANIFESTS.find((entry) => entry.fixtureId === fixtureId);
}

/** §10: whether a fixture may count toward the A→B gate. Only COMPLIANT counts. */
export function countsTowardGate(fixtureId) {
  return manifestFor(fixtureId)?.antiOverfitProcess === ANTI_OVERFIT_PROCESSES.COMPLIANT;
}

/**
 * §11: the claim-ladder ceiling a fixture's construction provenance permits, INDEPENDENT of its
 * anti-overfit compliance.
 */
export function claimCeilingFor(fixtureId) {
  const manifest = manifestFor(fixtureId);
  if (manifest === undefined) return 'G0';
  if (manifest.antiOverfitProcess !== ANTI_OVERFIT_PROCESSES.COMPLIANT) return 'G0';
  if (manifest.heldOut === true && manifest.contamination === CONTAMINATION.INDEPENDENT) return 'G4';
  if (manifest.contamination === CONTAMINATION.SHARED_MODEL_FAMILY) return 'G1';
  /** COMPLIANT but not held out: task-family claims are available, model-family generality is not. */
  return 'G1';
}
