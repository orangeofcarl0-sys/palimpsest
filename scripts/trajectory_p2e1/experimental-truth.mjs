/**
 * Trajectory-P2-E1 §7 — THE SOURCE-GROUNDED EXPERIMENTAL TRUTH CONTRACT (C2).
 *
 * THE INVARIANT (§7.1). ONE OWNER'S UNAVAILABLE OR INCOMPLETE EVIDENCE MUST NOT NEGATE A FACT POSITIVELY
 * ESTABLISHED BY ANOTHER AUTHORITATIVE OWNER. The E0 answer key violated this: it forbade `A0 completed`
 * because the DSH page was PARTIAL, although the fixture's A0 is a canonical attempt whose completion the
 * Work owner establishes. This module replaces the keyword key with PROPOSITIONS that each carry their own
 * authoritative source, truth value and evidence reference — so `A0 completed according to Work` and
 * `the DSH page is PARTIAL` COEXIST rather than contradict.
 *
 * EPISTEMIC DISTINCTIONS PRESERVED (§7.4). A proposition's truth is one of TRUE / FALSE / UNKNOWN /
 * NOT_APPLICABLE, and its source is the owner entitled to assert it. `UNKNOWN` is not `FALSE`: an owner that
 * was never consulted, or was consulted and could not answer, yields UNKNOWN — never a fabricated FALSE.
 *
 * SEPARATE FROM AVAILABILITY (§14). One objective truth does not mean both experimental arms can SEE it.
 * Every proposition also records whether CONTROL and TREATMENT can establish it from the context they are
 * actually delivered, so an arm is never penalised for a fact it was never given.
 *
 * NOT a product component. PLAIN JAVASCRIPT (`.mjs`), bare node. No model, no network.
 */

/** §7.3: the closed proposition vocabulary for THIS benchmark — the narrowest set the fixture needs. */
export const TRUTH_PROPOSITIONS = [
  "ORIGIN_CANONICAL_COMPLETED",
  "ORIGIN_HAS_HISTORICAL_RESULT",
  "ORIGIN_DSH_PAGE_FULL",
  "ORIGIN_DSH_PAGE_PARTIAL",
  "ORIGIN_ALL_DSH_EVENTS_OBSERVED",
  "ORIGIN_CURRENT_VERIFICATION_ESTABLISHED",
  "CONSUMER_CAN_SETTLE",
];

/** §7.3: the authoritative owners. A proposition may only be asserted by its own owner. */
export const TRUTH_SOURCES = ["CANONICAL_WORK", "DSH_SESSION", "VERIFICATION", "CURRENT_WORK", "WORLD_OBSERVATION", "NOT_ESTABLISHED"];

/** §7.4: the truth values. UNKNOWN and NOT_APPLICABLE are DISTINCT from FALSE and from each other. */
export const TRUTH_VALUES = ["TRUE", "FALSE", "UNKNOWN", "NOT_APPLICABLE"];

/** §7.3: which owner is ENTITLED to assert each proposition. A mismatch is an unsupported-source error. */
export const AUTHORITATIVE_SOURCE_OF = Object.freeze({
  ORIGIN_CANONICAL_COMPLETED: "CANONICAL_WORK",
  ORIGIN_HAS_HISTORICAL_RESULT: "CANONICAL_WORK",
  ORIGIN_DSH_PAGE_FULL: "DSH_SESSION",
  ORIGIN_DSH_PAGE_PARTIAL: "DSH_SESSION",
  ORIGIN_ALL_DSH_EVENTS_OBSERVED: "DSH_SESSION",
  ORIGIN_CURRENT_VERIFICATION_ESTABLISHED: "VERIFICATION",
  CONSUMER_CAN_SETTLE: "CURRENT_WORK",
});

/**
 * §7.6: THE FROZEN GROUND-TRUTH SNAPSHOT for the Family A fixture, derived from FROZEN OWNER READS — never
 * from the evaluated answer, and never by inferring one owner's fact from another's.
 *
 * The two coexistence-critical entries are ORIGIN_CANONICAL_COMPLETED (TRUE, from Canonical Work) and
 * ORIGIN_DSH_PAGE_PARTIAL (TRUE, from the DSH Session). Neither negates the other.
 */
export const GROUNDED_TRUTH_SNAPSHOT = Object.freeze({
  fixtureId: "FIX-A-GOVERNED-PARTIAL-CONTINUATION",
  /** The frozen source basis, so the digest is reproducible and the agent cannot move its own answer key. */
  sourceBasis: Object.freeze({
    canonicalAttemptId: "A0",
    consumerAttemptId: "A1",
    dshSessionId: "origin-partial",
    dshKnownEventCount: 8,
    dshReturnedCount: 3,
    dshPageCoverage: "PARTIAL",
  }),
  propositions: Object.freeze([
    Object.freeze({
      id: "ORIGIN_CANONICAL_COMPLETED",
      truth: "TRUE",
      authoritativeSource: "CANONICAL_WORK",
      evidenceRef: "work-event:A0:ATTEMPT_COMPLETED",
      /** §7.5: historical completion is NOT current validity — it proves nothing about A1 or promotion. */
      note: "established by the canonical Work event log; a PARTIAL DSH page cannot negate it",
    }),
    Object.freeze({ id: "ORIGIN_HAS_HISTORICAL_RESULT", truth: "TRUE", authoritativeSource: "CANONICAL_WORK", evidenceRef: "attempt-result:A0", note: "the historical Result identity" }),
    Object.freeze({ id: "ORIGIN_DSH_PAGE_FULL", truth: "FALSE", authoritativeSource: "DSH_SESSION", evidenceRef: "dsh-page:origin-partial", note: "3 of 8 known events were returned" }),
    Object.freeze({ id: "ORIGIN_DSH_PAGE_PARTIAL", truth: "TRUE", authoritativeSource: "DSH_SESSION", evidenceRef: "dsh-page:origin-partial", note: "the admitted page covers a prefix" }),
    Object.freeze({ id: "ORIGIN_ALL_DSH_EVENTS_OBSERVED", truth: "UNKNOWN", authoritativeSource: "DSH_SESSION", evidenceRef: "dsh-page:origin-partial", note: "the source reports more events than the page carries, so the unread events are UNKNOWN — not FALSE" }),
    Object.freeze({ id: "ORIGIN_CURRENT_VERIFICATION_ESTABLISHED", truth: "UNKNOWN", authoritativeSource: "VERIFICATION", evidenceRef: null, note: "the fixture composes no Verification owner, so this is UNKNOWN — never inferred from the historical Result" }),
    Object.freeze({ id: "CONSUMER_CAN_SETTLE", truth: "FALSE", authoritativeSource: "CURRENT_WORK", evidenceRef: "current-work:A1", note: "A1 has not completed and no current verification/world basis authorises settlement" }),
  ]),
  /** §7.6: the frozen digest of the snapshot — the fixture computes it and freezes it BEFORE evaluation. */
  digestNote: "the Ground Truth Digest is computed over this snapshot (canonical JSON) and frozen before any answer is judged",
  /** §14: whether each proposition can be established from the CONTEXT each arm is actually delivered. */
  availability: Object.freeze({
    ORIGIN_CANONICAL_COMPLETED: Object.freeze({ control: "AVAILABLE", treatment: "AVAILABLE", why: "the prior-result continuation carries the canonical completion to both arms" }),
    ORIGIN_HAS_HISTORICAL_RESULT: Object.freeze({ control: "AVAILABLE", treatment: "AVAILABLE", why: "the prior-result continuation names the historical result for both arms" }),
    ORIGIN_DSH_PAGE_FULL: Object.freeze({ control: "UNKNOWN", treatment: "AVAILABLE", why: "only the qualified Capsule states page coverage" }),
    ORIGIN_DSH_PAGE_PARTIAL: Object.freeze({ control: "UNKNOWN", treatment: "AVAILABLE", why: "only the qualified Capsule states page coverage" }),
    ORIGIN_ALL_DSH_EVENTS_OBSERVED: Object.freeze({ control: "UNKNOWN", treatment: "UNKNOWN", why: "unobserved events remain unobserved in BOTH arms" }),
    ORIGIN_CURRENT_VERIFICATION_ESTABLISHED: Object.freeze({ control: "UNKNOWN", treatment: "UNKNOWN", why: "no Verification owner is composed for either arm" }),
    CONSUMER_CAN_SETTLE: Object.freeze({ control: "AVAILABLE", treatment: "AVAILABLE", why: "both arms see the same current Work authority" }),
  }),
});

/**
 * §8.6: the DECISION contract for the fixture, derived from A1's ACTUAL current state — not a categorical
 * ban on settlement. A1 is not settlement-eligible, so SETTLE is forbidden HERE; a different fixture whose
 * A1 IS eligible would permit it.
 */
export const DECISION_CONTRACT = Object.freeze({
  rationale: "A1 has not completed and carries no current verification/world basis, so settlement is not authorised for THIS attempt",
  permittedActions: ["INSPECT_CURRENT_WORLD", "RUN_AUTHORIZED_VERIFICATION", "REQUEST_MISSING_EVIDENCE", "DEFER_SETTLEMENT", "CONTINUE_WITHIN_SCOPE", "PROPOSE_ESCALATION"],
  forbiddenActions: ["SETTLE"],
  /** §8.9: a justified deferral is a POSITIVE judgment; a vacuous refusal is not. */
  deferralIsJustifiedWhen: "the answer declares at least one proposition UNKNOWN with its authoritative source, OR names a concrete verification/inspection step",
});

/** §7.6: a canonical, order-independent digest of the frozen snapshot (so a leak or edit is detectable). */
export function groundTruthDigest(snapshot = GROUNDED_TRUTH_SNAPSHOT) {
  const canonical = JSON.stringify({
    fixtureId: snapshot.fixtureId,
    sourceBasis: snapshot.sourceBasis,
    propositions: snapshot.propositions.map((entry) => [entry.id, entry.truth, entry.authoritativeSource, entry.evidenceRef]),
    availability: Object.keys(snapshot.availability)
      .sort()
      .map((key) => [key, snapshot.availability[key].control, snapshot.availability[key].treatment]),
  });
  // A tiny deterministic FNV-1a hash — no crypto dependency, stable across runs, sufficient for a freeze check.
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a-${hash.toString(16).padStart(8, "0")}-${String(canonical.length)}`;
}

/** §8.4: the frozen allowlist of evidence references the fixture actually establishes. */
export const EVIDENCE_ALLOWLIST = Object.freeze(
  GROUNDED_TRUTH_SNAPSHOT.propositions.map((entry) => entry.evidenceRef).filter((ref) => ref !== null),
);

/**
 * §7.6/F9: THE GROUND-TRUTH LEAK CHECK.
 *
 * The Oracle-only expected facts and prohibited claims must NOT be present in the model-visible task,
 * CONTROL or TREATMENT text. This checks the rendered text for the snapshot's OWN vocabulary — the
 * proposition ids and the frozen evidence refs — which are oracle-internal tokens a delivered section must
 * never carry.
 */
export function detectGroundTruthLeak(renderedTexts) {
  const leaks = [];
  for (const [label, text] of Object.entries(renderedTexts)) {
    if (typeof text !== "string") continue;
    const haystack = text.toLowerCase();
    for (const proposition of GROUNDED_TRUTH_SNAPSHOT.propositions) {
      if (haystack.includes(proposition.id.toLowerCase())) leaks.push({ where: label, token: proposition.id, kind: "proposition-id" });
      if (proposition.evidenceRef !== null && haystack.includes(proposition.evidenceRef.toLowerCase())) leaks.push({ where: label, token: proposition.evidenceRef, kind: "evidence-ref" });
    }
    if (haystack.includes(groundTruthDigest().toLowerCase())) leaks.push({ where: label, token: "ground-truth-digest", kind: "digest" });
  }
  return { leaked: leaks.length > 0, leaks };
}

/** §7.7: the owner-level consistency scenarios the contract must keep source-correct. */
export const OWNER_CONSISTENCY_SCENARIOS = Object.freeze([
  { id: "canonical-completed-dsh-partial", canonical: "TRUE", dsh: "PARTIAL", consistent: true, why: "the two facts are owned by different owners and coexist" },
  { id: "canonical-not-completed-dsh-full", canonical: "FALSE", dsh: "FULL", consistent: true, why: "a FULL page does not imply completion — only Work establishes completion" },
  { id: "canonical-completed-dsh-unavailable", canonical: "TRUE", dsh: "UNAVAILABLE", consistent: true, why: "an absent DSH source cannot erase canonical completion" },
  { id: "historical-result-current-verification-unknown", canonical: "TRUE", verification: "UNKNOWN", consistent: true, why: "a historical Result does not imply current verification" },
  { id: "historical-result-consumer-unfinished", canonical: "TRUE", consumerCompleted: false, consistent: true, why: "a historical Result does not make the current attempt complete" },
  { id: "session-turn-ended-work-unsettled", turnEnded: true, workSettled: false, consistent: true, why: "a successful model turn is not Work settlement" },
  { id: "source-race-canonical-stable", sourceRaced: true, canonicalStable: true, consistent: true, why: "a source currentness race does not move the canonical facts" },
]);
