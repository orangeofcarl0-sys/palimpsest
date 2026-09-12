/**
 * PLMP-BIND-1 freshness validation (G10-B3 spike).
 *
 * `Satisfied ≠ Unsatisfied` and `Current ≠ Stale` are orthogonal axes
 * (BIND1-INV-12): freshness is an admission property of a derived resolution,
 * evaluated by comparing its frozen provenance basis against the current basis.
 * The result is never mutated and never converted to unsatisfied. Applies to
 * satisfied and unsatisfied results alike (both carry provenance).
 */

import { stableStringify } from "./digest.js";
import type {
  BindingIntentSource,
  BindingResolutionResult,
  DefinitionRevisionRef,
  ResolutionProvenance,
  ResolverPolicyRef,
  SnapshotRef,
} from "./contract.js";

export type Freshness = "current" | "stale";

/** The current freshness basis, shaped exactly like the result's provenance inputs. */
export interface FreshnessBasis {
  readonly architecture: DefinitionRevisionRef;
  readonly work: DefinitionRevisionRef;
  readonly intentSource: BindingIntentSource;
  readonly runConfigurationDigest: string;
  readonly snapshot: SnapshotRef;
  readonly resolverPolicy?: ResolverPolicyRef;
}

export function evaluateFreshness(
  result: BindingResolutionResult,
  currentBasis: FreshnessBasis,
): Freshness {
  return sameProvenanceBasis(result.provenance, currentBasis) ? "current" : "stale";
}

function sameProvenanceBasis(
  provenance: ResolutionProvenance,
  basis: FreshnessBasis,
): boolean {
  return (
    sameRef(provenance.architecture, basis.architecture) &&
    sameRef(provenance.work, basis.work) &&
    sameIntentSource(provenance.intentSource, basis.intentSource) &&
    provenance.runConfigurationDigest === basis.runConfigurationDigest &&
    provenance.snapshot.ref === basis.snapshot.ref &&
    sameResolverPolicy(provenance.resolverPolicy, basis.resolverPolicy)
  );
}

function sameRef(a: DefinitionRevisionRef, b: DefinitionRevisionRef): boolean {
  return (
    a.definitionId === b.definitionId && a.revision === b.revision && a.digest === b.digest
  );
}

function sameIntentSource(a: BindingIntentSource, b: BindingIntentSource): boolean {
  return stableStringify(a) === stableStringify(b);
}

function sameResolverPolicy(
  a: ResolverPolicyRef | undefined,
  b: ResolverPolicyRef | undefined,
): boolean {
  return stableStringify(a ?? null) === stableStringify(b ?? null);
}
