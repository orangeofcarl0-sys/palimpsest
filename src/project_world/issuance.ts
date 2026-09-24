/**
 * PLMP-LEAN-1 §D3-c2 — IMMUTABLE ISSUANCE: the authority a compatibility certificate carries.
 *
 *     Proof generation  ≠  Proof validation
 *
 * D3-b is the GENERATOR. It is a pure function over premises, and a pure function must accept whatever
 * it is handed — so a caller can construct `{ changes: [], coverage: PROVEN_COMPLETE }` and receive a
 * logically valid `COMPATIBLE`. That conclusion is sound and it carries NO AUTHORITY:
 *
 *     a logically valid conclusion from untrusted premises  ⇏  system authority
 *
 * This module is the boundary that makes the difference. An assessment becomes usable for admission
 * only by being ISSUED here, from premises that came from accepted observers, and it is remembered:
 *
 *     issue  →  a certificate the system stands behind
 *     recall  →  does this exact certificate exist, and is it still about this result and this target?
 *
 * WHY A REGISTRY RATHER THAN A SIGNATURE FIELD. A boolean or a token inside the assessment object would
 * be constructible by whoever constructs the assessment. The registry is the opposite: the assessment is
 * worthless for admission unless a record exists of THIS authority having issued it from THESE premise
 * observations, and nothing outside this module can create that record.
 *
 * THE ASSESSMENT IS RE-DERIVED FROM THE PREMISES, NEVER ACCEPTED ALONGSIDE THEM. If a caller could pass
 * both a premise set and a pre-built assessment, the two could disagree — and the certificate would
 * attest to a proof nobody performed. So issuance takes the OBSERVATIONS and runs D3-b itself.
 *
 * Layer: L2 (`src/project_world/`). Not re-exported from the domain barrel.
 */
import { canonicalDigest } from "../schema/canonical.js";

import { assessCompatibility, type CompatibilityAssessment } from "./compatibility.js";
import {
  changePremises,
  dependencyPremises,
  materializePremiseSet,
  type PremiseObservation,
  type PremiseSet,
} from "./observation.js";
import { materializeWorldChangeFootprint, type CoveredFootprint, type WorldChangeFootprint } from "./footprint.js";

const ISSUANCE_DIGEST_DOMAIN = "palimpsest.compatibility-issuance.v1";

/** Which observation each premise of a certificate rests on. This is what admission validates. */
export interface PremiseReferences {
  readonly projectSemantic: string | null;
  readonly source: string | null;
  readonly assets: string | null;
  readonly environment: string | null;
  readonly resultReads: string | null;
  readonly resultWrites: string | null;
}

/** A certificate: D3-b's assessment, plus the exact premises it was issued from. */
export interface IssuedCompatibilityAssessment {
  readonly schemaVersion: 1;
  readonly issuerId: string;
  readonly assessment: CompatibilityAssessment;
  readonly premiseRefs: PremiseReferences;
  /** The premise set's own identity, so a re-issue from different observations is visibly different. */
  readonly premiseSetDigest: string;
  readonly issuanceDigest: string;
}

function referenceOf(observation: PremiseObservation): string | null {
  return observation.state === "OBSERVED" ? observation.observationId : null;
}

export function premiseSetDigestOf(set: PremiseSet): string {
  return canonicalDigest({
    domain: "palimpsest.premise-set.v1",
    projectSemantic: set.projectSemantic.state === "OBSERVED" ? set.projectSemantic.digest : `UNAVAILABLE:${set.projectSemantic.detail}`,
    source: set.source.state === "OBSERVED" ? set.source.digest : `UNAVAILABLE:${set.source.detail}`,
    assets: set.assets.state === "OBSERVED" ? set.assets.digest : `UNAVAILABLE:${set.assets.detail}`,
    environment: set.environment.state === "OBSERVED" ? set.environment.digest : `UNAVAILABLE:${set.environment.detail}`,
    resultReads: set.resultReads.state === "OBSERVED" ? set.resultReads.digest : `UNAVAILABLE:${set.resultReads.detail}`,
    resultWrites: set.resultWrites.state === "OBSERVED" ? set.resultWrites.digest : `UNAVAILABLE:${set.resultWrites.detail}`,
  });
}

/**
 * The footprint an observation contributes.
 *
 * `UNAVAILABLE` becomes an UNPROVEN EMPTY footprint, which is exactly right: an unobserved domain
 * contributes no selectors AND no coverage, so D3-b records the obstacle rather than a clean set. The
 * unavailable detail is carried through so a reader sees "no observer" rather than "nothing found".
 */
function footprintOf(observation: PremiseObservation): CoveredFootprint {
  if (observation.state === "OBSERVED") return observation.footprint;
  return Object.freeze({
    selectors: Object.freeze([]),
    coverage: Object.freeze({ status: "UNPROVEN" as const, detail: observation.detail }),
  });
}

/**
 * ISSUE a certificate from observations.
 *
 * The registry is `Map<issuanceDigest, IssuedCompatibilityAssessment>` held by this authority. Only this
 * function writes it, and only this module exposes it, so an assessment that did not come through here
 * cannot be recalled later.
 */
export function makeCompatibilityIssuer(input: { readonly issuerId: string }) {
  const issued = new Map<string, IssuedCompatibilityAssessment>();

  return Object.freeze({
    issuerId: input.issuerId,

    /**
     * Run D3-b over the OBSERVED premises and record the result.
     *
     * Note what is NOT a parameter: an assessment. A caller supplies observations and receives a
     * certificate; it cannot supply a conclusion for the system to bless.
     */
    issue(issueInput: {
      readonly resultManifestDigest: string;
      readonly originBasisDigest: string;
      readonly targetObservationDigest: string;
      readonly exactlyCurrent: boolean;
      readonly premises: PremiseSet;
      readonly unobservedFacets?: readonly string[] | undefined;
    }): IssuedCompatibilityAssessment {
      const premises = materializePremiseSet(issueInput.premises);
      const change: WorldChangeFootprint = materializeWorldChangeFootprint({
        projectSemantic: footprintOf(premises.projectSemantic),
        source: footprintOf(premises.source),
        assets: footprintOf(premises.assets),
        environment: footprintOf(premises.environment),
      });
      const bySide = new Map(dependencyPremises(premises).map(([side, observation]) => [side, observation]));

      const assessment = assessCompatibility({
        resultManifestDigest: issueInput.resultManifestDigest,
        originBasisDigest: issueInput.originBasisDigest,
        targetObservationDigest: issueInput.targetObservationDigest,
        exactlyCurrent: issueInput.exactlyCurrent,
        change,
        reads: footprintOf(bySide.get("read")!),
        writes: footprintOf(bySide.get("write")!),
        ...(issueInput.unobservedFacets === undefined ? {} : { unobservedFacets: issueInput.unobservedFacets }),
      });

      const premiseRefs: PremiseReferences = Object.freeze({
        projectSemantic: referenceOf(premises.projectSemantic),
        source: referenceOf(premises.source),
        assets: referenceOf(premises.assets),
        environment: referenceOf(premises.environment),
        resultReads: referenceOf(premises.resultReads),
        resultWrites: referenceOf(premises.resultWrites),
      });
      const premiseSetDigest = premiseSetDigestOf(premises);
      const issuanceDigest = canonicalDigest({
        domain: ISSUANCE_DIGEST_DOMAIN,
        issuerId: input.issuerId,
        assessmentDigest: assessment.assessmentDigest,
        premiseRefs,
        premiseSetDigest,
      });
      const record: IssuedCompatibilityAssessment = Object.freeze({
        schemaVersion: 1 as const,
        issuerId: input.issuerId,
        assessment,
        premiseRefs,
        premiseSetDigest,
        issuanceDigest,
      });
      issued.set(issuanceDigest, record);
      return record;
    },

    /**
     * Recall a certificate by identity.
     *
     * A structurally perfect assessment that was never issued returns `null`. That is the whole point:
     * the system's authority is a record of issuance, not a property of the object.
     */
    recall(issuanceDigest: string): IssuedCompatibilityAssessment | null {
      return issued.get(issuanceDigest) ?? null;
    },

    /** How many certificates this authority has issued. Diagnostics, never an authority. */
    issuedCount(): number {
      return issued.size;
    },
  });
}

export type CompatibilityIssuer = ReturnType<typeof makeCompatibilityIssuer>;

/** Re-exported so callers of this module have the premise vocabulary in one import. */
export { changePremises };
