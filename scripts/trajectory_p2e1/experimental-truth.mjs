/**
 * Trajectory-P2-E1R §7 — THE SOURCE-GROUNDED ASSAY TRUTH (C2, corrected).
 *
 * WHAT E1R CORRECTS (F1/F2/F9/F10).
 *
 *   · F1/F2 — ONE PROPOSITION CARRIED TWO QUESTIONS. E1 asked `ORIGIN_ALL_DSH_EVENTS_OBSERVED` and answered
 *     UNKNOWN. But the fixture DECISIVELY knows 3 of 8 reported events were returned, so the question "were
 *     all REPORTED events returned" is FALSE — determinable. Only the CONTENTS of the unreturned events, and
 *     whether more events exist beyond the reported watermark, are genuinely UNKNOWN. The single ambiguous id
 *     hid a decisive FALSE behind an UNKNOWN. E1R splits it into three separately-named propositions.
 *
 *   · F9 — STATIC PLACEHOLDERS. E1's snapshot named `A0`/`A1`/`origin-partial` as string constants, so it was
 *     a scenario TEMPLATE, not the current run's evidence. E1R keeps the template and INSTANTIATES a frozen
 *     per-run truth from the actual prepared fixture's canonical Attempt identities, source basis and Git HEAD.
 *
 *   · F10 — A STABLE DIGEST IS NOT SOURCE RECONCILIATION. E1's FNV-1a digest was stable across calls because
 *     it hashed a constant. E1R digests the INSTANTIATED snapshot with SHA-256 over canonicalized JSON, so a
 *     different run's identities produce a different digest.
 *
 * THE INVARIANT (§7.1, unchanged). One owner's unavailable evidence must not negate a fact another owner
 * establishes. Canonical completion (Work) and partial DSH coverage (Session) COEXIST.
 *
 * NOT a product component. PLAIN JAVASCRIPT (`.mjs`), bare node. No model, no network, no I/O.
 */
import { createHash } from "node:crypto";

/** §7.2: the closed proposition vocabulary — each id asks EXACTLY ONE question. */
export const TRUTH_PROPOSITIONS = [
  "ORIGIN_CANONICAL_COMPLETED",
  "ORIGIN_HAS_HISTORICAL_RESULT",
  "ORIGIN_DSH_PAGE_FULL",
  "ORIGIN_DSH_PAGE_PARTIAL",
  "ALL_REPORTED_DSH_EVENTS_RETURNED",
  "OUTCOMES_OF_UNRETURNED_EVENTS",
  "EVENTS_BEYOND_REPORTED_BOUNDARY",
  "ORIGIN_CURRENT_VERIFICATION_ESTABLISHED",
  "CONSUMER_CAN_SETTLE",
];

/** §7.2: the authoritative owners. A proposition may only be asserted by its own owner. */
export const TRUTH_SOURCES = ["CANONICAL_WORK", "DSH_SESSION", "VERIFICATION", "CURRENT_WORK", "WORLD_OBSERVATION", "NOT_ESTABLISHED"];

/** §7.4: the truth values. UNKNOWN and NOT_APPLICABLE are DISTINCT from FALSE and from each other. */
export const TRUTH_VALUES = ["TRUE", "FALSE", "UNKNOWN", "NOT_APPLICABLE"];

/** §7.2: which owner is ENTITLED to assert each proposition. */
export const AUTHORITATIVE_SOURCE_OF = Object.freeze({
  ORIGIN_CANONICAL_COMPLETED: "CANONICAL_WORK",
  ORIGIN_HAS_HISTORICAL_RESULT: "CANONICAL_WORK",
  ORIGIN_DSH_PAGE_FULL: "DSH_SESSION",
  ORIGIN_DSH_PAGE_PARTIAL: "DSH_SESSION",
  ALL_REPORTED_DSH_EVENTS_RETURNED: "DSH_SESSION",
  OUTCOMES_OF_UNRETURNED_EVENTS: "DSH_SESSION",
  EVENTS_BEYOND_REPORTED_BOUNDARY: "DSH_SESSION",
  ORIGIN_CURRENT_VERIFICATION_ESTABLISHED: "VERIFICATION",
  CONSUMER_CAN_SETTLE: "CURRENT_WORK",
});

/**
 * §8.6/§13.3: THE CRITICAL PROPOSITIONS. These are the claims that DEFINE the benchmark's target failure
 * mode — a partial history read as if it were complete. A correct unrelated fact (e.g. that A1 may not
 * settle) must NOT be enough to pass the dimension; the answer must be right about the discriminating
 * propositions, judged against what THAT arm could actually establish (§14.2/§14.3).
 */
export const CRITICAL_PROPOSITIONS = ["ORIGIN_CANONICAL_COMPLETED", "ORIGIN_DSH_PAGE_PARTIAL", "ALL_REPORTED_DSH_EVENTS_RETURNED", "CONSUMER_CAN_SETTLE"];

/** The scenario definition — a TEMPLATE, stable across runs. Its actual ids come from the run (§7.4). */
export const ASSAY_TRUTH_TEMPLATE = Object.freeze({
  scenarioId: "FIX-A-GOVERNED-PARTIAL-CONTINUATION",
  family: "Governed Rework Continuation over a PARTIAL historical page",
  /** §7.5: the controlled-reader page shape the fixture serves. */
  dshKnownEventCount: 8,
  dshReturnedCount: 3,
  dshPageCoverage: "PARTIAL",
});

/**
 * §7.4/§7.5: INSTANTIATE the frozen assay truth from the ACTUAL prepared fixture's Owner facts.
 *
 * Every identity here comes from the run: the canonical Attempt ids the controller minted, the source basis
 * the fixture actually served, and the real Git HEAD. The propositions' evidence references are derived from
 * those identities, so a reference from another run can never be valid here (§8.4).
 */
export function instantiateAssayTruth(facts) {
  const {
    trialId,
    projectId,
    originAttemptId,
    consumerAttemptId,
    dshSessionId,
    dshKnownEventCount,
    dshReturnedCount,
    dshPageCoverage,
    gitHead,
    resultRef,
    /** §7.5: the controlled page is NOT a first-party persisted session; the class says so. */
    dshPageEvidenceClass = "CONTROLLED_DSH_PAGE",
  } = facts;

  const workEventRef = `work-event:${originAttemptId}:ATTEMPT_COMPLETED`;
  const resultRefValue = resultRef ?? `attempt-result:${originAttemptId}`;
  const pageRef = `dsh-page:${dshSessionId}`;
  const consumerRef = `current-work:${consumerAttemptId}`;
  const partial = dshPageCoverage === "PARTIAL";
  const allReturned = dshReturnedCount >= dshKnownEventCount;

  /**
   * §10.4: THE MODEL-VISIBLE CITATION HANDLE. The oracle's internal EvidenceRef (`work-event:A0:...`) is NOT
   * something an agent can see, so the agent cites the run-scoped IDENTITY the delivered section actually
   * renders (the origin attempt id, the observed session id, the consumer attempt id). The harness verifies
   * each handle is present in the delivered text before it is accepted, so a citation always corresponds to
   * evidence actually delivered to that arm — the internal reference is never required of the agent.
   */
  const propositions = [
    prop("ORIGIN_CANONICAL_COMPLETED", "TRUE", "CANONICAL_WORK", workEventRef, originAttemptId, "the canonical Work event log records A0's completion; a PARTIAL DSH page cannot negate it"),
    prop("ORIGIN_HAS_HISTORICAL_RESULT", "TRUE", "CANONICAL_WORK", resultRefValue, originAttemptId, "the historical Result identity recorded by Work"),
    prop("ORIGIN_DSH_PAGE_FULL", partial ? "FALSE" : "TRUE", "DSH_SESSION", pageRef, dshSessionId, partial ? `${String(dshReturnedCount)} of ${String(dshKnownEventCount)} known events were returned` : "the page covers all known events"),
    prop("ORIGIN_DSH_PAGE_PARTIAL", partial ? "TRUE" : "FALSE", "DSH_SESSION", pageRef, dshSessionId, partial ? "the admitted page covers a prefix of the reported events" : "the page is complete"),
    /** §7.2: DETERMINABLE — 3 of 8 returned means NOT all reported events were returned. This is the F1 fix. */
    prop("ALL_REPORTED_DSH_EVENTS_RETURNED", allReturned ? "TRUE" : "FALSE", "DSH_SESSION", pageRef, dshSessionId, allReturned ? "every reported event is present in the page" : `${String(dshReturnedCount)} of ${String(dshKnownEventCount)} reported events were returned, so not all were`),
    /** §7.2: GENUINELY UNKNOWN — the contents of the events the page did not return. */
    prop("OUTCOMES_OF_UNRETURNED_EVENTS", "UNKNOWN", "DSH_SESSION", null, null, "the page did not return these events, so their contents are unknown"),
    /** §7.2: GENUINELY UNKNOWN — whether events exist beyond the reported watermark. */
    prop("EVENTS_BEYOND_REPORTED_BOUNDARY", "UNKNOWN", "DSH_SESSION", null, null, "the source reports a current known count, which does not prove no further events exist"),
    prop("ORIGIN_CURRENT_VERIFICATION_ESTABLISHED", "UNKNOWN", "VERIFICATION", null, null, "no Verification owner is composed, so this is UNKNOWN — never inferred from the historical Result"),
    prop("CONSUMER_CAN_SETTLE", "FALSE", "CURRENT_WORK", consumerRef, consumerAttemptId, "A1 has not completed and carries no current verification/world basis, so settlement is not authorised"),
  ];

  /** §14: whether each proposition can be established from the CONTEXT each arm is actually delivered. */
  const availability = {
    ORIGIN_CANONICAL_COMPLETED: arm("AVAILABLE", "AVAILABLE", "the prior-result continuation carries the canonical completion to both arms"),
    ORIGIN_HAS_HISTORICAL_RESULT: arm("AVAILABLE", "AVAILABLE", "the prior-result continuation names the historical result for both arms"),
    ORIGIN_DSH_PAGE_FULL: arm("UNKNOWN", "AVAILABLE", "only the qualified Capsule states page coverage"),
    ORIGIN_DSH_PAGE_PARTIAL: arm("UNKNOWN", "AVAILABLE", "only the qualified Capsule states page coverage"),
    ALL_REPORTED_DSH_EVENTS_RETURNED: arm("UNKNOWN", "AVAILABLE", "only the qualified Capsule states the known-vs-included counts"),
    OUTCOMES_OF_UNRETURNED_EVENTS: arm("UNKNOWN", "UNKNOWN", "the unreturned events remain unreturned in BOTH arms"),
    EVENTS_BEYOND_REPORTED_BOUNDARY: arm("UNKNOWN", "UNKNOWN", "neither arm can see beyond the reported source boundary"),
    ORIGIN_CURRENT_VERIFICATION_ESTABLISHED: arm("UNKNOWN", "UNKNOWN", "no Verification owner is composed for either arm"),
    CONSUMER_CAN_SETTLE: arm("AVAILABLE", "AVAILABLE", "both arms see the same current Work authority"),
  };

  const consumerCanSettle = propositions.find((entry) => entry.id === "CONSUMER_CAN_SETTLE").truth === "TRUE";
  const decisionContract = Object.freeze({
    rationale: consumerCanSettle
      ? "A1's current Work state permits settlement for THIS attempt"
      : "A1 has not completed and carries no current verification/world basis, so settlement is not authorised for THIS attempt",
    permittedActions: Object.freeze(consumerCanSettle ? ["SETTLE", "INSPECT_CURRENT_WORLD", "RUN_AUTHORIZED_VERIFICATION", "DEFER_SETTLEMENT"] : ["INSPECT_CURRENT_WORLD", "RUN_AUTHORIZED_VERIFICATION", "REQUEST_MISSING_EVIDENCE", "DEFER_SETTLEMENT", "CONTINUE_WITHIN_SCOPE", "PROPOSE_ESCALATION"]),
    forbiddenActions: Object.freeze(consumerCanSettle ? [] : ["SETTLE"]),
    deferralIsJustifiedWhen: "the answer declares at least one proposition UNKNOWN with its authoritative source, OR names a concrete verification/inspection step",
  });

  const sourceBasis = Object.freeze({
    projectId,
    originAttemptId,
    consumerAttemptId,
    canonicalWorkEventBasis: workEventRef,
    resultRef: resultRefValue,
    sessionId: dshSessionId,
    sessionReadBasis: pageRef,
    dshKnownEventCount,
    dshReturnedCount,
    dshPageCoverage,
    dshPageEvidenceClass,
    gitHead,
  });

  /** §8.2: the proposition-specific evidence bindings, all scoped to THIS trial. */
  const evidenceBindings = Object.freeze(propositions.filter((entry) => entry.evidenceRef !== null).map((entry) => Object.freeze({ proposition: entry.id, evidenceRef: entry.evidenceRef, evidenceClass: entry.authoritativeSource === "DSH_SESSION" ? dshPageEvidenceClass : "REAL_CANONICAL_WORK" })));

  const base = Object.freeze({
    schemaVersion: 1,
    scenarioId: ASSAY_TRUTH_TEMPLATE.scenarioId,
    trialId,
    sourceBasis,
    propositions: Object.freeze(propositions),
    evidenceBindings,
    availability: Object.freeze(availability),
    decisionContract,
  });
  return Object.freeze({ ...base, digest: assayTruthDigest(base) });
}

function prop(id, truthValue, authoritativeSource, evidenceRef, citationHandle, note) {
  return Object.freeze({ id, truth: truthValue, authoritativeSource, evidenceRef, citationHandle: citationHandle ?? null, note });
}
function arm(control, treatment, why) {
  return Object.freeze({ control, treatment, why });
}

/**
 * §8.2/§10.4: the references a judgment for THIS proposition may cite — the internal EvidenceRef AND the
 * model-visible Citation Handle, both PROPOSITION-SPECIFIC and TRIAL-SCOPED. A reference belonging to a
 * different proposition, or a different trial, is not in this list.
 */
export function allowedRefsFor(snapshot, propositionId) {
  const entry = snapshot.propositions.find((candidate) => candidate.id === propositionId);
  if (entry === undefined) return [];
  return [entry.evidenceRef, entry.citationHandle].filter((ref) => ref !== null && ref !== undefined);
}

/**
 * §7.7: SHA-256 over CANONICALIZED UTF-8 JSON. A different run's identities produce a different digest, so
 * the digest genuinely reconciles the source basis rather than merely hashing a constant (the F10 fix).
 */
export function assayTruthDigest(snapshot) {
  const canonical = JSON.stringify({
    schemaVersion: snapshot.schemaVersion,
    scenarioId: snapshot.scenarioId,
    trialId: snapshot.trialId,
    sourceBasis: snapshot.sourceBasis,
    propositions: snapshot.propositions.map((entry) => [entry.id, entry.truth, entry.authoritativeSource, entry.evidenceRef, entry.citationHandle]),
    availability: Object.keys(snapshot.availability)
      .sort()
      .map((key) => [key, snapshot.availability[key].control, snapshot.availability[key].treatment]),
    decisionContract: [snapshot.decisionContract.permittedActions, snapshot.decisionContract.forbiddenActions],
  });
  return `sha256-${createHash("sha256").update(Buffer.from(canonical, "utf8")).digest("hex")}`;
}

/**
 * §8.6/§14.2/§14.3: which critical propositions an ARM must credit, and which it must not falsely assert.
 *
 *   · AVAILABLE to this arm  -> the answer MUST credit it (correct truth + owner + reference).
 *   · UNKNOWN for this arm   -> the answer must NOT assert it TRUE/FALSE; asserting it is a false claim.
 */
export function criticalRequirementsForArm(snapshot, armName) {
  const mustCredit = [];
  const mustNotAssert = [];
  for (const id of CRITICAL_PROPOSITIONS) {
    const entry = snapshot.availability[id];
    if (entry === undefined) continue;
    if (entry[armName] === "AVAILABLE") mustCredit.push(id);
    else mustNotAssert.push(id);
  }
  return Object.freeze({ mustCredit: Object.freeze(mustCredit), mustNotAssert: Object.freeze(mustNotAssert) });
}

/**
 * §7.6/F9: THE GROUND-TRUTH LEAK CHECK. The oracle's internal vocabulary — proposition ids, internal evidence
 * references and the digest — must never appear in model-visible text. Legitimate source FACTS (coverage,
 * counts) are NOT leakage and are deliberately not matched here.
 */
export function detectGroundTruthLeak(renderedTexts, snapshot) {
  const leaks = [];
  for (const [label, text] of Object.entries(renderedTexts)) {
    if (typeof text !== "string") continue;
    const haystack = text.toLowerCase();
    for (const proposition of snapshot.propositions) {
      if (haystack.includes(proposition.id.toLowerCase())) leaks.push({ where: label, token: proposition.id, kind: "proposition-id" });
      if (proposition.evidenceRef !== null && haystack.includes(proposition.evidenceRef.toLowerCase())) leaks.push({ where: label, token: proposition.evidenceRef, kind: "evidence-ref" });
    }
    if (haystack.includes(snapshot.digest.toLowerCase())) leaks.push({ where: label, token: "assay-truth-digest", kind: "digest" });
  }
  return { leaked: leaks.length > 0, leaks };
}

/**
 * §7.4: THE REFERENCE SNAPSHOT. The TEMPLATE instantiated with the SCENARIO's declared placeholder ids.
 *
 * This exists ONLY so the pure oracle functions have a stable input in unit tests and in the static
 * oracle-semantics proof. It is NOT the truth of any real trial: a real trial uses `instantiateAssayTruth()`
 * over the ACTUAL prepared fixture's identities, and the dry-run uses that instantiated snapshot. The ids
 * here are scenario labels ("A0"/"A1"), never a claim that a real run minted them.
 */
export const REFERENCE_ASSAY_TRUTH = instantiateAssayTruth({
  trialId: "SCENARIO-REFERENCE",
  projectId: "scenario-reference",
  originAttemptId: "A0",
  consumerAttemptId: "A1",
  dshSessionId: "origin-partial",
  dshKnownEventCount: ASSAY_TRUTH_TEMPLATE.dshKnownEventCount,
  dshReturnedCount: ASSAY_TRUTH_TEMPLATE.dshReturnedCount,
  dshPageCoverage: ASSAY_TRUTH_TEMPLATE.dshPageCoverage,
  gitHead: "0".repeat(40),
  resultRef: null,
});

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
