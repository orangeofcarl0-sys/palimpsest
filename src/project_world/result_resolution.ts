/**
 * PLMP-LEAN-1 §D5-0 — the AUTHORITATIVE RESULT RESOLVER: the last caller-fact seam in the effect path.
 *
 * D3-R2 made an admission a durable record and had the effect read its TARGET from it, so a caller could
 * no longer admit against one world and effect in another. One seam survived, and an audit of the effect
 * entry point found it:
 *
 *     rematerialize({ admissionRef, originSource, projectId, taskId, producedAssetRefs })
 *
 * `admissionRef` was authoritative, and everything after it was still CALLER-ASSEMBLED: which delta to
 * carry, which project and task the candidate belongs to, which assets the derivation produced. So the
 * system could prove "an admission authorizes an effect" but not "the effect is about the result that
 * admission was issued for". A caller could name a genuine admission and hand it a different delta.
 *
 * THE FIX IS A RESOLVER, NOT A SECOND STORE. Every fact the effect needs already exists somewhere:
 *
 *     ATTEMPT_RESULT   →  the Work owner: the attempt row, its AttemptReport, its TaskEnvelope, and the
 *                         world basis D3-a captured for it
 *     DERIVED_RESULT   →  the candidate store: the derivation record and the candidate's source facet
 *
 * so this module declares a READ-SIDE AGGREGATION over those existing owners and nothing else. It
 * deliberately does NOT parse an ATTEMPT_RESULT itself: the verification plane already owns that parser
 * (`AttemptResultVerificationSource`), and a second one would drift from the first — which is exactly how
 * two readings of "which result did this attempt produce" start disagreeing.
 *
 * WHY THE PORT IS STRUCTURAL. `ResultSubjectRef` and `ResolvedResult` are declared here as plain data so
 * that the effect plane names no verification type and no storage column. The first-party implementation
 * lives at the deployment boundary (`src/deployment/result_resolution.ts`) where it composes the real
 * readers — the same split `ProjectWorldObservationPort` uses.
 *
 * Layer: L2 (`src/project_world/`). Not re-exported from the domain barrel.
 */
import { canonicalDigest } from "../schema/canonical.js";

/**
 * WHICH result, in the namespace of the owner that holds it.
 *
 * The two kinds are the two things that can produce a result, and the distinction is not cosmetic:
 *
 *   ATTEMPT_RESULT   a Work execution's immutable result        (held by the Work owner)
 *   DERIVED_RESULT   a derivation's candidate, which ran no Work (held by the candidate store)
 *
 * A derivation is NOT an attempt — D3-d established that fabricating one would make the execution history
 * assert that a Work ran when none did — so a candidate must never be addressed by an attempt id, and this
 * type gives a caller no way to confuse them.
 */
export const RESULT_SUBJECT_KINDS = ["ATTEMPT_RESULT", "DERIVED_RESULT"] as const;
export type ResultSubjectKind = (typeof RESULT_SUBJECT_KINDS)[number];

export interface ResultSubjectRef {
  readonly kind: ResultSubjectKind;
  /** The durable identity inside that kind's owner: an attempt id, or a candidate id. */
  readonly ref: string;
}

const RESULT_SUBJECT_REF_DOMAIN = "palimpsest.result-subject-ref.v1";

/** A stable identity for a result reference, so an admission can record which result it is about. */
export function resultSubjectRefDigest(ref: ResultSubjectRef): string {
  return canonicalDigest({ domain: RESULT_SUBJECT_REF_DOMAIN, kind: ref.kind, ref: ref.ref });
}

export function resultSubjectRefOf(input: {
  readonly kind: ResultSubjectKind;
  readonly ref: string;
}): ResultSubjectRef {
  return Object.freeze({ kind: input.kind, ref: input.ref });
}

/**
 * WHAT the effect needs about one result, read from its owner.
 *
 * Note what is NOT here: the compatibility assessment, the admission decision, the verification verdict.
 * A resolver answers "which result is this and what does it consist of"; every authority question is
 * answered elsewhere and by records that cannot be manufactured here.
 *
 * `originBasisDigest` is REQUIRED, and that is the point of the type. The admission records the basis it
 * was issued against; a resolver that cannot establish which basis this result actually came from cannot
 * support the claim "this is the result that admission is about", so it reports the result as
 * unresolvable rather than as one with an unknown basis. An unknown basis would make the binding
 * unfalsifiable, and an unfalsifiable binding is not a binding.
 */
export interface ResolvedResult {
  readonly resultSubjectRef: ResultSubjectRef;
  /** The result's own manifest identity, so the admission's digest can be checked against it. */
  readonly resultManifestDigest: string;
  readonly projectId: string;
  readonly taskId: string;
  /** The basis this result was produced from. */
  readonly originBasisDigest: string;
  /**
   * The source facet, or null when the result produced no canonical source revision (an analysis-only
   * outcome). Null is a legitimate answer and the effect reports it as a capability gap rather than
   * inventing an empty delta.
   */
  readonly sourceResult: {
    readonly backend: string;
    readonly baseRevision: string;
    readonly resultRevision: string;
  } | null;
  /** Authoritative outputs the result carries. A result that declares none carries none. */
  readonly producedAssetRefs: readonly string[];
}

/**
 * Resolve a result reference to what it consists of.
 *
 * `null` means "this deployment cannot authoritatively resolve that result" — an unknown identity, an
 * attempt that never completed, a record whose own fields disagree, or a basis that was never captured.
 * It is deliberately ONE answer rather than a reason code: the effect's response to all of them is the
 * same (refuse, no world, no candidate), and a caller that wants the reason can ask the owner directly.
 */
export interface AuthoritativeResultResolver {
  readonly adapterId: string;
  resolve(resultSubjectRef: ResultSubjectRef): ResolvedResult | null;
}
