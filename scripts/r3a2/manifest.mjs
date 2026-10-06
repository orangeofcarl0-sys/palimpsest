/**
 * R3-A2 §"Construction contamination" — THE FROZEN MANIFESTS FOR THE TWO NEW SENTINEL FAMILIES.
 *
 * §"Construction contamination" is explicit that DeepSeek and GLM are KNOWN evaluation families during this
 * construction, so the record must say so honestly:
 *
 *   evaluationModelFamiliesKnownAtConstruction = true
 *   heldOut = false
 *
 * and §"Construction contamination" states that this does NOT automatically make the fixture anti-overfit
 * `NON_COMPLIANT`. `antiOverfitProcess = COMPLIANT` is allowed only when all three hold:
 *
 *   · every failure class and hidden oracle was authored BEFORE any new baseline run;
 *   · they were derived from the DECLARED MECHANISM rather than from prior DeepSeek/GLM failure traces;
 *   · they were NOT revised after qualification outcomes exist.
 *
 * All three hold here, and the basis is recorded per fixture rather than asserted. The claim ceiling is
 * limited accordingly: `heldOut` is `false`, so `claimCeilingFor` returns G1 — task-family claims are
 * available, model-family generality is not.
 *
 * §"Construction contamination": the ceiling is recorded, not argued away.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { ANTI_OVERFIT_PROCESSES, CONTAMINATION } from '../r3a/fixture-manifest.mjs';
import { allContentDigests } from './fixtures.mjs';

export { ANTI_OVERFIT_PROCESSES, CONTAMINATION };

/**
 * §"Construction contamination": THE NEW FIXTURE MANIFESTS.
 *
 * `constructionActor` is the LOCAL CODING AGENT, exactly as for F-A/F-B. §"Construction contamination" and
 * the R3-AE §9 rule forbid inventing that agent's model identity, so the model id and family stay `UNKNOWN`
 * and `contamination` stays `UNKNOWN`. What CHANGES relative to F-A/F-B is
 * `evaluationModelFamiliesKnownAtConstruction`, which is now `true`: the sentinel families were named before
 * these fixtures were authored, and saying otherwise would be false.
 */
export const PORTFOLIO_MANIFESTS = Object.freeze([
  Object.freeze({
    fixtureId: 'r3a-f-c-policy-resolution',
    fixtureRevision: 1,
    contentDigest: allContentDigests()['r3a-f-c-policy-resolution'],
    antiOverfitProcess: ANTI_OVERFIT_PROCESSES.COMPLIANT,
    antiOverfitBasis: 'the six failure classes and the hidden oracle were authored from the F-C contract (closure, declared precedence, well-formedness) BEFORE any R3-A2 baseline run, and were derived from that mechanism rather than from any DeepSeek or GLM failure trace; the fixture is byte-identical to its pre-execution digest',
    constructionActor: 'LOCAL_CODING_AGENT',
    constructionModelId: 'UNKNOWN',
    constructionModelFamily: 'UNKNOWN',
    /** §"Construction contamination": DeepSeek and GLM were NAMED before this fixture was authored. */
    evaluationModelFamiliesKnownAtConstruction: true,
    evaluationModelFamilies: Object.freeze(['deepseek', 'glm']),
    contamination: CONTAMINATION.UNKNOWN,
    heldOut: false,
    heldOutReason: 'the evaluation model families were KNOWN during construction, so the fixture is not held out from them; the construction model identity is also UNKNOWN, so independence cannot be demonstrated',
  }),
  Object.freeze({
    fixtureId: 'r3a-f-d-rule-resolution',
    fixtureRevision: 1,
    contentDigest: allContentDigests()['r3a-f-d-rule-resolution'],
    antiOverfitProcess: ANTI_OVERFIT_PROCESSES.COMPLIANT,
    antiOverfitBasis: 'the six failure classes and the hidden oracle were authored from the F-D contract (normalization, specificity ranking, ambiguity, segment boundaries) BEFORE any R3-A2 baseline run, and were derived from that mechanism rather than from any DeepSeek or GLM failure trace; the fixture is byte-identical to its pre-execution digest',
    constructionActor: 'LOCAL_CODING_AGENT',
    constructionModelId: 'UNKNOWN',
    constructionModelFamily: 'UNKNOWN',
    evaluationModelFamiliesKnownAtConstruction: true,
    evaluationModelFamilies: Object.freeze(['deepseek', 'glm']),
    contamination: CONTAMINATION.UNKNOWN,
    heldOut: false,
    heldOutReason: 'the evaluation model families were KNOWN during construction, so the fixture is not held out from them; the construction model identity is also UNKNOWN, so independence cannot be demonstrated',
  }),
]);

/** The manifest for a new fixture id, or undefined. */
export function portfolioManifestFor(fixtureId) {
  return PORTFOLIO_MANIFESTS.find((entry) => entry.fixtureId === fixtureId);
}

/** §"Qualification analysis": whether a new fixture may become a graph edge. Only COMPLIANT counts. */
export function portfolioCountsTowardGraph(fixtureId) {
  return portfolioManifestFor(fixtureId)?.antiOverfitProcess === ANTI_OVERFIT_PROCESSES.COMPLIANT;
}

/**
 * §"Construction contamination": the claim-ladder ceiling, computed the SAME way the R3-A0 manifest computes
 * it, so a new family cannot be granted a ceiling its provenance does not support.
 */
export function portfolioClaimCeiling(fixtureId) {
  const manifest = portfolioManifestFor(fixtureId);
  if (manifest === undefined) return 'G0';
  if (manifest.antiOverfitProcess !== ANTI_OVERFIT_PROCESSES.COMPLIANT) return 'G0';
  if (manifest.heldOut === true && manifest.contamination === CONTAMINATION.INDEPENDENT) return 'G4';
  if (manifest.contamination === CONTAMINATION.SHARED_MODEL_FAMILY) return 'G1';
  /** COMPLIANT but not held out: task-family claims are available, model-family generality is not. */
  return 'G1';
}
