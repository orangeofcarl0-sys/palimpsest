/**
 * Trajectory-H1 §8 (C4) — THE BINDING AUTHORITY CONTRACT.
 *
 * The governing invariant, stated once and enforced structurally:
 *
 *     A verified Attempt SessionId is derived from VERIFIED PRODUCER-SIDE BINDING EVIDENCE.
 *     It is NEVER derived from the caller's Session claim.
 *
 * H0 satisfied this only by CONVENTION. Its classifier accepted a bare
 * `canonicalBindingPresent: boolean` and returned `BOUND_VERIFIED` whenever that flag was true, while
 * the composition then derived the established id as
 *
 *     dshSessionId = classification.state === "BOUND_VERIFIED" ? claimedSessionId : null
 *
 * so the boolean — not any evidence about a session — decided that the CALLER's id was the attempt's
 * session. H0 got away with it because the composition always passed `false`. A future P2 integration
 * that wired that boolean to an IPC message would have silently elevated a caller-controlled SessionId
 * into a verified binding. That is the F5 falsifier, and this module removes the possibility.
 *
 * The corrected shape separates three things H0 ran together:
 *
 *     classifySessionBinding       a CLAIM classifier. It CANNOT grant verification.
 *     AttemptSessionAssociation    the logical producer-side evidence record (§8.4).
 *     resolveVerifiedSessionBinding  the ONLY function that can name a verified SessionId, and it
 *                                    takes it from the ASSOCIATION, never from the claim.
 *
 * §8.4: the association is a LOGICAL contract. This module deliberately does not create a database, a
 * store or a durable binding table: H1 prepares the consumer-side contract for the P2 producer, and
 * step 4–7 of the §8.3 pipeline (the real IPC report and the durable association record) are explicitly
 * deferred. A `verified: true` field on a caller-constructed object is NOT sufficient for verification,
 * which is why the resolver also requires a producer observation state, a durable binding reference and
 * an exact identity match against the parent-owned invocation.
 *
 * Layer: L2 (`src/trajectory/`). Pure, read-only, owns no store and decides no authority.
 */
import type { BindingSource } from "./execution.js";

/* ------------------------------------------------------------------ *
 * §8.4 — The logical association record
 * ------------------------------------------------------------------ */

/**
 * §8.4: where an association's session identity came from.
 *
 * A real producer observation is evidence of what a Host/Parent process ACTUALLY observed. A caller
 * declaration is evidence of a request. Only the first can ever participate in verification.
 */
export const ASSOCIATION_OBSERVATION_STATES = [
  /** A Host/Parent component observed this session for this invocation. */
  "PRODUCER_OBSERVED",
  /** The caller supplied it. Evidence of a request, never of an observation. */
  "CALLER_DECLARED",
] as const;
export type AssociationObservationState = (typeof ASSOCIATION_OBSERVATION_STATES)[number];

/**
 * §8.4: the association's verification state.
 *
 * `VERIFIED` means a designated owner revalidated the association against canonical Attempt and
 * Session source facts AND recorded a durable binding. H1 never produces this state itself; the P2
 * producer will, and this contract is what it must satisfy.
 */
export const ASSOCIATION_VERIFICATION_STATES = ["VERIFIED", "UNVERIFIED", "CONFLICTING"] as const;
export type AssociationVerificationState = (typeof ASSOCIATION_VERIFICATION_STATES)[number];

/**
 * §8.4/§8.6: one Attempt→Invocation→Session association, as a logical record.
 *
 * The cardinality the ruling requires is representable: one Attempt may have MANY associations across
 * retries, restarts and renewed invocations, each naming its own invocation and session. H1 does not
 * implement a retry history store; it implements the conflict and cardinality rules a store would need
 * so that a later one cannot silently overwrite or substitute an identity.
 */
export interface AttemptSessionAssociation {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly attemptId: string;
  /** The PARENT-OWNED invocation that launched the worker whose session this is. */
  readonly invocationId: string;
  /** The DSH SessionId the PRODUCER reported. Never the caller's claim. */
  readonly dshSessionId: string;
  /** The producer evidence this observation rests on. */
  readonly producerEvidence: {
    readonly source: BindingSource;
    /** A stable reference to the evidence — an IPC message id, a record id, a log reference. */
    readonly reference: string;
  };
  readonly observationState: AssociationObservationState;
  /** The durable association record, when one exists. Null means no durable binding was established. */
  readonly durableBindingRef: string | null;
  readonly verification: AssociationVerificationState;
  /** A conflict explanation, when the association contradicts another observation. */
  readonly conflictDetail: string | null;
}

/* ------------------------------------------------------------------ *
 * §8.5 — Claim classification (NO verification authority)
 * ------------------------------------------------------------------ */

/**
 * §8.5: the CLAIM classifier lives in `execution.ts` as `classifySessionBinding`, and it has been
 * changed so it cannot grant verification: its `canonicalBindingPresent` input was REMOVED.
 *
 * That boolean authorized an arbitrary SessionId — `classifySessionBinding({claimedSessionId: X,
 * canonicalBindingPresent: true})` returned `BOUND_VERIFIED` for X — and the composition then derived
 * the established id from that state. A classifier with no way to say "verified" cannot be accidentally
 * wired to one, which is why the branch was deleted rather than guarded. The reachable states are
 * exactly the ones a claim alone can justify: CONFLICT, SESSION_UNBOUND, AMBIGUOUS,
 * SOURCE_UNAVAILABLE and SESSION_CLAIMED_UNVERIFIED.
 *
 * Verification lives ONLY in `resolveVerifiedSessionBinding` below.
 */

/* ------------------------------------------------------------------ *
 * §8.5 — Verified binding resolution (the ONLY verification authority)
 * ------------------------------------------------------------------ */

/** §8.5: why a verified resolution could not be produced. */
export const BINDING_RESOLUTION_REFUSAL_CODES = [
  /** No association evidence was supplied at all. */
  "NO_ASSOCIATION_EVIDENCE",
  /** The only candidates name a different Attempt (B2). */
  "ATTEMPT_MISMATCH",
  /** The only candidates are bound to a different invocation than the parent-owned one (B3). */
  "INVOCATION_MISMATCH",
  /** A producer observation exists but no durable association was established (B6). */
  "DURABLE_BINDING_MISSING",
  /** The evidence was never producer-observed — a caller declaration cannot verify (B8). */
  "NOT_PRODUCER_OBSERVED",
  /** The associations contradict one another about the Session identity (B5). */
  "CONFLICTING_SESSION_IDENTITY",
  /** More than one distinct session could satisfy the binding. */
  "AMBIGUOUS_SESSION_IDENTITY",
  /** The association is marked conflicting. */
  "MARKED_CONFLICTING",
] as const;
export type BindingResolutionRefusalCode = (typeof BINDING_RESOLUTION_REFUSAL_CODES)[number];

/**
 * §8.5: the resolution result.
 *
 * `verifiedSessionId` is non-null ONLY for `RESOLVED_VERIFIED`, and it is taken from the ASSOCIATION's
 * own `dshSessionId`. The caller's claim is not an input to this function at all, which is the
 * structural reason it cannot be elevated.
 */
export interface VerifiedSessionBindingResolution {
  readonly outcome: "RESOLVED_VERIFIED" | "UNRESOLVED";
  readonly verifiedSessionId: string | null;
  readonly invocationId: string | null;
  readonly refusal: BindingResolutionRefusalCode | null;
  readonly detail: string;
  /** The associations actually considered, so a reviewer sees the evidence rather than the verdict. */
  readonly considered: readonly {
    readonly invocationId: string;
    readonly dshSessionId: string;
    readonly observationState: AssociationObservationState;
    readonly verification: AssociationVerificationState;
    readonly durableBindingRef: string | null;
  }[];
}

const unresolved = (
  refusal: BindingResolutionRefusalCode,
  detail: string,
  considered: VerifiedSessionBindingResolution["considered"],
): VerifiedSessionBindingResolution =>
  Object.freeze({ outcome: "UNRESOLVED" as const, verifiedSessionId: null, invocationId: null, refusal, detail, considered: Object.freeze([...considered]) });

/**
 * §8.5/§8.6: resolve a VERIFIED Attempt SessionId from producer-side association evidence.
 *
 * This is the only function in the codebase that can name a verified session, and its inputs make the
 * §8.2 invariant structural:
 *
 *   - it does not accept a caller claim, so a claim cannot be elevated;
 *   - it requires `observationState === "PRODUCER_OBSERVED"`, so receiving a message is not enough —
 *     a caller-declared association is refused (B8);
 *   - it requires a non-null `durableBindingRef`, so a real-looking producer observation without a
 *     durable association does not produce `BOUND_VERIFIED` (B6);
 *   - it requires the project and attempt to match exactly (B2);
 *   - when `invocationId` is supplied it requires the association to name THAT invocation (B3);
 *   - duplicate IDENTICAL evidence collapses to one binding (B4), because the dedup key is the full
 *     association identity rather than an insertion order;
 *   - two contradictory Session identities for one invocation are a CONFLICT, never first-wins or
 *     last-wins (B5).
 *
 * §8.6: a SessionId that survives a process restart does not thereby restore Attempt ownership (B7).
 * The resolver has no input describing whether a session could be read: ownership is a fact about a
 * DURABLE ASSOCIATION, not about source availability.
 */
export function resolveVerifiedSessionBinding(input: {
  readonly projectId: string;
  readonly attemptId: string;
  /** The parent-owned invocation, when the parent knows which worker it launched. */
  readonly invocationId?: string | null | undefined;
  readonly associations: readonly AttemptSessionAssociation[];
}): VerifiedSessionBindingResolution {
  const considered = (entries: readonly AttemptSessionAssociation[]) =>
    entries.map((entry) =>
      Object.freeze({
        invocationId: entry.invocationId,
        dshSessionId: entry.dshSessionId,
        observationState: entry.observationState,
        verification: entry.verification,
        durableBindingRef: entry.durableBindingRef,
      }),
    );

  if (input.associations.length === 0) {
    return unresolved("NO_ASSOCIATION_EVIDENCE", "no producer-side association evidence was supplied for this attempt", []);
  }

  /* ---- identity scoping: an association for another project or attempt is not this attempt's. ---- */
  const forThisAttempt = input.associations.filter((entry) => entry.projectId === input.projectId && entry.attemptId === input.attemptId);
  if (forThisAttempt.length === 0) {
    const foreignAttempts = [...new Set(input.associations.map((entry) => `${entry.projectId}/${entry.attemptId}`))];
    return unresolved(
      "ATTEMPT_MISMATCH",
      `every supplied association names a different attempt (${foreignAttempts.join(", ")}), so none can bind session identity to attempt ${input.attemptId}`,
      considered(input.associations),
    );
  }

  /* ---- §8.6 invocation scoping: only the parent-owned invocation's evidence may bind. ---- */
  const scoped =
    input.invocationId === undefined || input.invocationId === null
      ? forThisAttempt
      : forThisAttempt.filter((entry) => entry.invocationId === input.invocationId);
  if (scoped.length === 0) {
    const named = [...new Set(forThisAttempt.map((entry) => entry.invocationId))];
    return unresolved(
      "INVOCATION_MISMATCH",
      `the evidence for this attempt is bound to invocation(s) ${named.join(", ")}, not to the parent-owned invocation ${String(input.invocationId)}`,
      considered(forThisAttempt),
    );
  }

  /* ---- §8.2: a marked conflict is never resolved. ---- */
  const marked = scoped.filter((entry) => entry.conflictDetail !== null || entry.verification === "CONFLICTING");
  if (marked.length > 0) {
    return unresolved(
      "MARKED_CONFLICTING",
      `an association for this invocation is marked conflicting: ${marked[0]!.conflictDetail ?? "no detail supplied"}`,
      considered(scoped),
    );
  }

  /* ---- §8.5: only a producer observation can verify. ---- */
  const observed = scoped.filter((entry) => entry.observationState === "PRODUCER_OBSERVED");
  if (observed.length === 0) {
    return unresolved(
      "NOT_PRODUCER_OBSERVED",
      "the supplied association is a CALLER DECLARATION; receiving a claim is not evidence of a producer observation, so it establishes no binding",
      considered(scoped),
    );
  }

  /* ---- §8.2: an observation alone is not a durable association. ---- */
  const durable = observed.filter((entry) => entry.durableBindingRef !== null && entry.verification === "VERIFIED");
  if (durable.length === 0) {
    return unresolved(
      "DURABLE_BINDING_MISSING",
      "a producer observation exists but no durable, verified association was established, so the observation does not establish a binding",
      considered(observed),
    );
  }

  /**
   * §8.6 B4/B5: cardinality. Duplicate IDENTICAL evidence collapses to one binding, because the
   * deduplication key is the association's full identity rather than an arrival order. Two DISTINCT
   * Session identities for the same invocation are a conflict — never first-wins or last-wins.
   */
  const distinctSessions = [...new Set(durable.map((entry) => entry.dshSessionId))];
  if (distinctSessions.length > 1) {
    return unresolved(
      "CONFLICTING_SESSION_IDENTITY",
      `the same invocation is reported as producing ${String(distinctSessions.length)} different sessions (${distinctSessions.join(", ")}), so no single identity is established`,
      considered(durable),
    );
  }

  const sessionId = distinctSessions[0]!;
  const matching = durable.filter((entry) => entry.dshSessionId === sessionId);
  const distinctInvocations = [...new Set(matching.map((entry) => entry.invocationId))];
  if (distinctInvocations.length > 1) {
    return unresolved(
      "AMBIGUOUS_SESSION_IDENTITY",
      `session ${sessionId} is claimed by ${String(distinctInvocations.length)} invocations (${distinctInvocations.join(", ")}), so it is not attributable to one`,
      considered(matching),
    );
  }

  return Object.freeze({
    outcome: "RESOLVED_VERIFIED" as const,
    verifiedSessionId: sessionId,
    invocationId: distinctInvocations[0]!,
    refusal: null,
    detail: `a durable, verified producer association establishes session ${sessionId} for invocation ${distinctInvocations[0]!} of attempt ${input.attemptId}`,
    considered: Object.freeze(considered(matching)),
  });
}
