/**
 * PLMP-LEAN-1 §D3-c1 — AUTHORITATIVE OBSERVATION, or: where a premise's authority comes from.
 *
 * D3-b proved a theorem: *if* the premises hold, then `COMPATIBLE`. That theorem is sound, and it is not
 * enough — because a premise supplied as a plain object literal is a CLAIM, not a fact:
 *
 *     { coverage: "PROVEN_COMPLETE", evidence: "SANDBOX_ENFORCED" }
 *
 * Nothing in that object shows that anything was enforced. So D3-b's conclusion is really:
 *
 *     if the supplied premises are true, then COMPATIBLE
 *
 * and the missing half is:
 *
 *     Palimpsest has established that COMPATIBLE is true
 *
 * THIS MODULE SUPPLIES THE MISSING HALF, and it does so at the right place. The rule is general, not a
 * patch on the change set:
 *
 *     any premise capable of granting positive authority ⇒ authoritative provenance required
 *
 * EVERY positive premise counts: change coverage, read coverage, write coverage, and the observed write
 * set. Fixing only the change observation would simply move the hole from `change coverage` to
 * `read coverage`.
 *
 * THE MECHANISM / ATTESTATION SPLIT. `CoverageEvidence` names the MECHANISM by which completeness is
 * obtained in principle. It does not show that THIS observation went through it. So an observation is
 * not a footprint plus a label: it is a footprint plus PROVENANCE that records which observer issued it,
 * at which version, over WHICH SCOPE:
 *
 *     completeness is always completeness OVER A SCOPE
 *
 * "complete" without a scope has no quantifier, so `scopeRef` and the revision pair are part of the
 * provenance rather than incidental metadata. And the mechanism is declared BY THE OBSERVER, never by a
 * caller: a party that did not enforce a boundary cannot honestly label one, and the type gives it no
 * way to.
 *
 * AN UNOBSERVED DOMAIN IS `UNAVAILABLE`, NOT AN EMPTY OBSERVATION. "No asset observer exists" and
 * "the asset observer saw nothing change" are different facts, and collapsing them would let a missing
 * capability read as a clean bill of health.
 *
 * Layer: L2 (`src/project_world/`). Not re-exported from the domain barrel.
 */
import { canonicalDigest } from "../schema/canonical.js";
import { canonicallyOrderedSelectors, type ResourceSelector } from "../domain/world_basis.js";
import { covered, provenComplete, type CoverageEvidence, type CoveredFootprint } from "./footprint.js";

export const OBSERVATION_DOMAINS = ["project_semantic", "source", "assets", "environment"] as const;
export type ObservationDomain = (typeof OBSERVATION_DOMAINS)[number];

/** What an observation is complete OVER. Without this, "complete" has no quantifier. */
export interface ObservationScope {
  readonly domain: ObservationDomain;
  /** The thing observed: a repository, an asset namespace, the project's semantic projection. */
  readonly scopeRef: string;
  readonly from: string;
  readonly to: string;
}

/** WHO issued an observation, by which mechanism, over which scope. */
export interface ObservationProvenance {
  readonly observerId: string;
  readonly observerVersion: string;
  readonly mechanism: CoverageEvidence;
  readonly scope: ObservationScope;
}

/**
 * A premise, as an authority-bearing value.
 *
 * `OBSERVED` carries PROVEN_COMPLETE coverage BY CONSTRUCTION: the observer's declared mechanism IS the
 * attestation, so an observed footprint cannot be labelled complete without also naming who says so and
 * by what means. There is deliberately no constructor for "observed but unproven" — an observation that
 * cannot claim completeness is `UNAVAILABLE`, which is the honest answer.
 */
export type PremiseObservation =
  | {
      readonly state: "OBSERVED";
      readonly observationId: string;
      readonly provenance: ObservationProvenance;
      readonly footprint: CoveredFootprint;
      readonly digest: string;
    }
  | {
      readonly state: "UNAVAILABLE";
      readonly domain: ObservationDomain;
      readonly detail: string;
    };

const OBSERVATION_DIGEST_DOMAIN = "palimpsest.premise-observation.v1";

export function premiseObservationDigest(input: {
  readonly provenance: ObservationProvenance;
  readonly selectors: readonly ResourceSelector[];
}): string {
  return canonicalDigest({
    domain: OBSERVATION_DIGEST_DOMAIN,
    provenance: input.provenance,
    selectors: canonicallyOrderedSelectors(input.selectors),
  });
}

/**
 * Materialize an observation.
 *
 * The `mechanism` argument is the OBSERVER's own declaration and the `scope` its own scope: a caller
 * that did not observe anything cannot reach this function with a mechanism it does not implement,
 * because the only way to call it is to be the observer.
 */
export function observedPremise(input: {
  readonly provenance: ObservationProvenance;
  readonly selectors: readonly ResourceSelector[];
}): PremiseObservation {
  const selectors = canonicallyOrderedSelectors(input.selectors);
  const digest = premiseObservationDigest({ provenance: input.provenance, selectors });
  return Object.freeze({
    state: "OBSERVED" as const,
    observationId: `obs-${digest.slice(0, 32)}`,
    provenance: Object.freeze({ ...input.provenance, scope: Object.freeze({ ...input.provenance.scope }) }),
    footprint: covered({
      selectors,
      coverage: provenComplete(
        input.provenance.mechanism,
        `observed by ${input.provenance.observerId}@${input.provenance.observerVersion} over ${input.provenance.scope.scopeRef} (${input.provenance.scope.from}..${input.provenance.scope.to})`,
      ),
    }),
    digest,
  });
}

export function unavailablePremise(domain: ObservationDomain, detail: string): PremiseObservation {
  return Object.freeze({ state: "UNAVAILABLE" as const, domain, detail });
}

/**
 * The complete premise set one compatibility assessment is made from.
 *
 * Explicit typed fields rather than a keyed collection: this is a closed set of premises, and a map
 * keyed by string would let a missing premise look like an absent entry instead of a compile error.
 */
export interface PremiseSet {
  readonly projectSemantic: PremiseObservation;
  readonly source: PremiseObservation;
  readonly assets: PremiseObservation;
  readonly environment: PremiseObservation;
  readonly resultReads: PremiseObservation;
  readonly resultWrites: PremiseObservation;
}

export function materializePremiseSet(input: PremiseSet): PremiseSet {
  return Object.freeze({ ...input });
}

/** Every domain's change observation, in one place, for the change-set walk. */
export function changePremises(set: PremiseSet): readonly (readonly [ObservationDomain, PremiseObservation])[] {
  return Object.freeze([
    ["project_semantic", set.projectSemantic] as const,
    ["source", set.source] as const,
    ["assets", set.assets] as const,
    ["environment", set.environment] as const,
  ]);
}

/** The dependency premises, paired with the side they describe. */
export function dependencyPremises(set: PremiseSet): readonly (readonly ["read" | "write", PremiseObservation])[] {
  return Object.freeze([
    ["read", set.resultReads] as const,
    ["write", set.resultWrites] as const,
  ]);
}

/** The domains a selector set actually touches — used to decide whether an UNOBSERVED domain matters. */
export function domainsOf(selectors: readonly ResourceSelector[]): ReadonlySet<ObservationDomain> {
  const domains = new Set<ObservationDomain>();
  for (const selector of selectors) {
    switch (selector.domain) {
      case "project_semantic":
        domains.add("project_semantic");
        break;
      case "source":
        domains.add("source");
        break;
      case "asset":
        domains.add("assets");
        break;
      case "environment":
        domains.add("environment");
        break;
    }
  }
  return domains;
}
