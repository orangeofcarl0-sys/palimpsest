/**
 * PLMP-LEAN-1 §D3-c4 — the COMPOSED cross-basis admission runtime.
 *
 * Three pieces now exist and this file is only their WIRING:
 *
 *     authoritative observers  →  observations with provenance      (§D3-c1)
 *     the issuer               →  an authority-bearing certificate   (§D3-c2)
 *     the admission gate       →  a decision from a certificate      (§D3-c3)
 *
 * It adds no reasoning of its own. In particular it does NOT assess compatibility — it asks the issuer,
 * which asks D3-b. Two compatibility engines would drift, and the drift would stay invisible until a
 * result was admitted under rules the assessor does not share.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO, and the boundary is the point:
 *
 *     admission  ≠  promotion
 *
 * `ADMITTED` means the basis divergence is no longer a SEMANTIC obstacle. It does not mean the system
 * can carry the result across, because no transplant/re-materialization effect exists yet. So this
 * runtime exposes an ADMISSION READ and is not wired into promotion eligibility: connecting it there
 * would claim a capability the system does not have, and the honest way to avoid that is to leave the
 * existing promotion blockers exactly as they are rather than to redefine `ELIGIBLE`.
 *
 *     COMPATIBLE  ⇏  PROMOTION_ELIGIBLE
 *
 * Layer: L2 (`src/project_world/`). Not re-exported from the domain barrel.
 */
import { canonicalDigest } from "../schema/canonical.js";

import { admitCrossBasis, type CrossBasisAdmissionResult } from "./admission.js";
import {
  unavailablePremise,
  type PremiseObservation,
} from "./observation.js";
import type { CompatibilityIssuer, IssuedCompatibilityAssessment } from "./issuance.js";
import type { ProjectWorldObservationPort } from "./runtime.js";

const TARGET_OBSERVATION_DOMAIN = "palimpsest.target-world-observation.v1";

/**
 * A digest of the OBSERVED target world.
 *
 * The certificate is bound to this value, so "the world moved" is a detectable fact rather than an
 * assumption. It is computed from what the deployment can actually observe, and a facet it cannot
 * observe contributes its UNAVAILABLE marker rather than being omitted — omitting it would let two
 * genuinely different worlds digest identically.
 */
export function targetWorldObservationDigest(input: {
  readonly observation: ProjectWorldObservationPort;
  readonly taskId: string;
}): { readonly digest: string; readonly detail: string } {
  const source = input.observation.observeSource();
  const semantic = input.observation.observeSemanticProjection(input.taskId);
  return Object.freeze({
    digest: canonicalDigest({
      domain: TARGET_OBSERVATION_DOMAIN,
      revision: input.observation.observeRevision(),
      source: source.ok ? { ok: true, revision: source.revision } : { ok: false, detail: source.detail },
      semantic:
        semantic === null
          ? { state: "ABSENT" }
          : semantic.ok
            ? { state: "PRESENT", digest: semantic.digest }
            : { state: "UNREADABLE", detail: semantic.detail },
      assets: input.observation.observeAssets?.() ?? { state: "UNAVAILABLE" },
      environment: input.observation.observeEnvironment?.() ?? { state: "UNAVAILABLE" },
    }),
    detail: source.ok ? `source at ${source.revision.revision.slice(0, 12)}` : source.detail,
  });
}

export interface CrossBasisAdmissionRuntime {
  readonly adapterId: string;
  /** The issuer this runtime admits through. Exposed so a caller can obtain certificates from it. */
  readonly issuer: CompatibilityIssuer;
  /** Compute the target observation digest a certificate must be bound to. */
  observeTarget(taskId: string): { readonly digest: string; readonly detail: string };
  /** Validate a presented certificate against the CURRENT observed target. */
  admit(input: {
    readonly presented: IssuedCompatibilityAssessment | null;
    readonly resultManifestDigest: string;
    readonly originBasisDigest: string;
    readonly taskId: string;
    readonly hasBasis: boolean;
  }): CrossBasisAdmissionResult & { readonly targetObservationDigest: string };
}

export function makeCrossBasisAdmissionRuntime(input: {
  readonly issuer: CompatibilityIssuer;
  readonly observation: ProjectWorldObservationPort;
}): CrossBasisAdmissionRuntime {
  return Object.freeze({
    adapterId: "first-party-cross-basis-admission",
    issuer: input.issuer,

    observeTarget(taskId: string) {
      return targetWorldObservationDigest({ observation: input.observation, taskId });
    },

    admit(admitInput: {
      readonly presented: IssuedCompatibilityAssessment | null;
      readonly resultManifestDigest: string;
      readonly originBasisDigest: string;
      readonly taskId: string;
      readonly hasBasis: boolean;
    }) {
      const target = targetWorldObservationDigest({ observation: input.observation, taskId: admitInput.taskId });
      const decision = admitCrossBasis({
        issuer: input.issuer,
        presented: admitInput.presented,
        resultManifestDigest: admitInput.resultManifestDigest,
        originBasisDigest: admitInput.originBasisDigest,
        targetObservationDigest: target.digest,
        hasBasis: admitInput.hasBasis,
      });
      return Object.freeze({ ...decision, targetObservationDigest: target.digest });
    },
  });
}

/**
 * A dependency premise for a facet this deployment cannot observe.
 *
 * Exported because it is the honest answer a caller must reach for rather than constructing a
 * PROVEN_COMPLETE footprint by hand: with no observer there is no mechanism, and with no mechanism there
 * is no coverage.
 */
export function unobservedDependency(domain: "source" | "assets" | "environment", detail: string): PremiseObservation {
  return unavailablePremise(domain, detail);
}
