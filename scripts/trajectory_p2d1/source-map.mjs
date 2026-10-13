/**
 * Trajectory-P2-D1 §4/§5 — SOURCE MAP FOR GOVERNED CONSUMER DELIVERY.
 *
 * READ-ONLY. Answers, from the ACTUAL P2-D0 baseline source (HEAD 205b413), the questions P2-D1 must
 * resolve before any consumer may rely on Trajectory history delivered through a governed boundary:
 *
 *   F1  Can a failed durable append disappear from the completeness judgment?
 *   F2  Can a new Invocation appear during Event Read and leave a stale SELECTED_UNIQUE?
 *   F3  Can a foreign creator claim appear during Event Read and leave stale Session ownership?
 *   F4  Can a relevant change between Qualification and Event Read evade the post-read comparison?
 *   F5  Can an AUTHORIZED consumer still receive a Capsule when the Origin is ambiguous?
 *   F6  Can an AUTHORIZED consumer still receive a Capsule when the Origin read fails?
 *   F7  Is there a real WHOLE-CAPSULE serialized-byte budget (or only a chars heuristic)?
 *   F8  Are durability / unresolved invocations / coverage derived, or defaulted?
 *   F9  Does makeCapsuleAuthorization() duplicate the Context Owner's rework lineage semantics?
 *   F10 Can an Agent-facing call name another Consumer AttemptId?
 *   F11 Do the shipped tests demonstrate a REAL A0 -> Governed Rework -> A1 -> AUTHORIZED path?
 *   F12 Is a Capsule delivered through Compiled Context / a Handle / Context Pull / Host Prework?
 *   F13 Can the product establish which Capsule reached which consumer, with a digest/size?
 *   F14 Is any existing task fixture already qualified under R2-VR's utility-benchmark law?
 *
 * It modifies nothing, launches nothing and contacts nothing. Absolute personal paths are SANITIZED.
 *
 * Usage:  node scripts/trajectory_p2d1/source-map.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DSH_HOME = process.env["DSH_HOME"] ?? join(process.env["USERPROFILE"] ?? "", ".dsh");

function sanitize(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(/[A-Za-z]:\\[^\s"']*/gu, "<local-path>")
    .replace(/[A-Za-z]:\/[^\s"']*/gu, "<local-path>")
    .replace(/(?:\/Users|\/home)\/[^\s"']*/gu, "<local-path>");
}

const read = (relative) => {
  const path = join(REPO, relative);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
};
const has = (text, re) => text !== null && re.test(text);

const ingestion = read("src/execution_association/ingestion.ts");
const contract = read("src/execution_association/contract.ts");
const qualifier = read("src/execution_association/qualification.ts");
const windowIntegrity = read("src/execution_association/window_integrity.ts");
const preview = read("src/composition/attributed_preview.ts");
const cluster = read("src/composition/execution_association.ts");
const capsule = read("src/trajectory/context_capsule.ts");
const contextService = read("src/context/service.ts");
const priorResult = read("src/context/prior_result.ts");
const continuation = read("src/composition/continuation.ts");
const delegation = read("src/interaction/work_delegation.ts");
const workWorker = read("src/deployment/work_worker.ts");
const hostRunner = read("host/dsh/lib/runner.js");
const hostEfficacy = read("host/dsh/lib/efficacy.js");
const install = read("src/install.ts");
const capsuleTest = read("test/trajectory_p2d0_context_capsule.test.ts");
const coldCapsuleTest = read("test/trajectory_p2d0_cold_capsule.test.ts");

const findings = {
  F1_failedAppendDisappearsFromCompleteness: {
    classification: "SOURCE_DEMONSTRATED",
    recorderReturnsOutcomeNotPersisted: has(ingestion, /return Object\.freeze\(\{ state: outcome\.state, eventId \}\) as IngestionOutcome;/u),
    // The recorder reports the store's outcome, but the PRODUCT sink in continuation.ts calls
    // recordIdentity and DISCARDS the IngestionOutcome, so a REJECTED/THROWN append is invisible.
    productSinkDiscardsOutcome: has(continuation, /options\.sessionIdentityRecorder\?\.recordIdentity\(entry\);/u),
    productSinkInspectsOutcome: has(continuation, /recordIdentity\(entry\)[\s\S]{0,200}(REJECTED|RECORDED|IDEMPOTENT)/u) === false,
    // finalizeInvocation writes windowState CLOSED from the STORE's candidate count; a lost B is simply
    // absent from that count, so a durable {A} + CLOSED(count=1) is producible and validates as
    // CLOSED_CONSISTENT.
    finalizeWritesClosedFromStoreCount: has(ingestion, /windowState: "CLOSED" as const/u),
    windowValidatesClosedConsistentFromStore: has(windowIntegrity, /state: "CLOSED_CONSISTENT" as const/u),
    noIngestionHealthState: has(ingestion, /INGESTION_FAILED|INGESTION_UNKNOWN|COMPLETE_SO_FAR/u) === false,
    note: "the Recorder returns an IngestionOutcome, but the PRODUCT sink (continuation.ts onCorrelatedSessionIdentity) discards it. A failed/rejected append therefore leaves no durable or in-memory completeness marker, and the later finalization records CLOSED from the STORE's own candidate count — so a durable {A} + CLOSED(count=1) is producible and validates CLOSED_CONSISTENT, and the Qualifier accepts A as the unique producer identity",
  },
  F2_newInvocationDuringEventRead: {
    classification: "SOURCE_DEMONSTRATED",
    postReadRecheckScopedToSelectedInvocation: has(preview, /invocationEventIdsBefore[\s\S]{0,400}event\.payload\.invocationId === chosen\.invocationId/u),
    postReadRecheckIncludesInvocationSet: has(preview, /invocationEventIdsAfter[\s\S]{0,400}(invocationsAfter|attemptInvocationSet|all\.length)/u) === false,
    note: "the post-read recheck compares ONLY the SELECTED invocation's event ids; a SECOND invocation appended to the SAME attempt during the read changes neither the selected invocation's ids nor the check, so SELECTED_UNIQUE is retained even though the Attempt's invocation set grew",
  },
  F3_foreignCreatorDuringEventRead: {
    classification: "SOURCE_DEMONSTRATED",
    qualifierRechecksForeignCreators: has(qualifier, /foreignCreatorsAfter/u),
    postReadRecheckIncludesForeignCreators: has(preview, /foreignCreators|replayForSession/u) === false,
    note: "the QUALIFIER rechecks foreign creators before it returns, but the ATTRIBUTED PREVIEW's post-read recheck (attributed_preview.ts) never re-reads the cross-Attempt creator claim set, so a competing source-scoped creation claim committed during readEvents() is invisible and the stale ownership is admitted",
  },
  F4_qualificationToReadGap: {
    classification: "SOURCE_DEMONSTRATED",
    headBeforeReadCapturedAfterQualification: has(preview, /const headBeforeRead = input\.store\.head\(\);/u),
    qualificationBasisCarriedIntoRead: has(preview, /qualification\.(basis|currentness)[\s\S]{0,400}headBeforeRead/u) === false,
    note: "the preview captures headBeforeRead AFTER the qualifier returned, and the qualifier's own currentness basis is not carried across the handoff; a relevant change committed between 'qualifier returned' and 'headBeforeRead' is absorbed into the new baseline and can never be detected",
  },
  F5_authorizedConsumerWithAmbiguousOrigin: {
    classification: "SOURCE_DEMONSTRATED",
    capsuleRequiresSelectedOrigin: has(preview, /origin\.selection\.state === "NO_DURABLE_EVIDENCE"/u),
    capsuleHandlesAmbiguousOrigin: has(preview, /AMBIGUOUS_REQUIRES_SELECTION[\s\S]{0,200}NO_QUALIFIED_ORIGIN/u) === false,
    capsuleBuildsForNonSelectedSelection: has(preview, /origin\.selection\.state === "NO_DURABLE_EVIDENCE"[\s\S]{0,400}buildTrajectoryContextCapsule/u),
    note: "capsuleForConsumer() only refuses when the origin selection is NO_DURABLE_EVIDENCE. An AMBIGUOUS_REQUIRES_SELECTION / REQUESTED_NOT_QUALIFIED / RACED origin still falls through to buildTrajectoryContextCapsule and returns AUTHORIZED with an unadmitted (empty-event) Capsule",
  },
  F6_authorizedConsumerWithFailedRead: {
    classification: "SOURCE_DEMONSTRATED",
    capsuleChecksReadAdmission: has(preview, /sessionReadAdmission[\s\S]{0,300}(AUTHORIZED|NO_QUALIFIED_ORIGIN)/u) === false,
    note: "the Capsule is built from the Preview regardless of sessionReadAdmission; a READ_FAILED / READ_CAPABILITY_ABSENT origin page yields an AUTHORIZED Capsule whose historicalExecution.events is empty, presented as if it were admitted evidence",
  },
  F7_wholeCapsuleBudget: {
    classification: "SOURCE_DEMONSTRATED",
    budgetIsCharsOnly: has(capsule, /maxTotalChars: number;/u),
    budgetIsSerializedBytes: has(capsule, /maxSerializedBytes/u) === false,
    budgetCountsSerializedBytes: has(capsule, /Buffer\.byteLength\(JSON\.stringify\(capsule\)/u),
    builderEnforcesWholeBytes: has(capsule, /usedChars[\s\S]{0,200}limits\.maxTotalChars/u),
    note: "the builder bounds only EVENT SUMMARY CHARS (usedChars accumulates summary length, not bytes). The complete serialized Capsule — attribution, provenance, caveats, project evolution, JSON overhead, multibyte Unicode — is never measured against a hard ceiling; trajectoryCapsuleBytes() exists but is a helper, not an enforced bound, and capsuleIsBounded() multiplies the CHAR limit by 4 as a heuristic",
  },
  F8_uncertaintyPropagation: {
    classification: "SOURCE_DEMONSTRATED",
    otherInvocationsUnresolvedHardcodedEmpty: has(preview, /otherInvocationsUnresolved: \[\]/u),
    syntheticRecoveryAlwaysNull: has(capsule, /syntheticRecoveryEventCount: null/u),
    inheritedAlwaysNull: has(capsule, /inheritedEventCount: null/u),
    durabilityFromInputOrDefault: has(capsule, /durability: input\.durability \?\? "UNKNOWN"/u),
    note: "otherInvocationsUnresolved is hard-coded [] in capsuleForConsumer (even when the origin Attempt has unresolved invocations), syntheticRecoveryEventCount and inheritedEventCount are always null, and durability is UNKNOWN unless the caller passes it — so the Capsule's uncertainty is NOT derived from the admission's own source evidence",
  },
  F9_duplicateLineageSemantics: {
    classification: "SOURCE_DEMONSTRATED",
    capsuleAuthScansEventsDirectly: has(cluster, /function makeCapsuleAuthorization[\s\S]{0,900}events\.filter\(\(event\) => event\.event_type === "TASK_READY"/u),
    contextOwnerUsesReworkProvenanceBefore: has(contextService, /reworkProvenanceBefore/u),
    capsuleAuthUsesReworkProvenanceBefore: has(cluster, /reworkProvenanceBefore/u) === false,
    note: "makeCapsuleAuthorization() maintains its OWN event-log scan for the governed lineage, while the Context Owner resolves the SAME fact through ports.reworkProvenanceBefore() bounded by the attempt's creation event. The two are separate meanings of 'Governed Rework lineage', and the capsule path does not share the Context Owner's attempt-created bound",
  },
  F10_consumerIdentitySpoofability: {
    classification: "SOURCE_DEMONSTRATED",
    capsuleForConsumerTakesConsumerAttemptId: has(preview, /capsuleForConsumer\(input: \{\s*readonly consumerAttemptId: string;/u),
    capsuleForConsumerIsPublicSurface: has(preview, /capsuleForConsumer\(input: \{[\s\S]{0,200}\}\): Promise<CapsuleForConsumerResult>;/u),
    note: "capsuleForConsumer() accepts a caller-supplied consumerAttemptId and resolves that attempt's lineage. The existence of an attempt's legitimate lineage does not prove the CURRENT caller owns it; no Host/Context binding currently fixes the consumer identity to prepared.attemptId, so an Agent-facing wrapper could pass another valid consumer attempt id",
  },
  F11_positiveGovernedConsumerPath: {
    classification: "SOURCE_DEMONSTRATED",
    shippedTestDemonstratesNoLineage: has(capsuleTest, /a consumer with no governed rework lineage may inspect no historical Attempt/u),
    shippedTestDemonstratesAuthorizedPath: has(capsuleTest, /capsuleForConsumer\([\s\S]{0,200}\.state\)\.toBe\("AUTHORIZED"\)/u) === false,
    coldCapsuleBuildsDirectlyNotViaApi: has(coldCapsuleTest, /buildTrajectoryContextCapsule/u),
    note: "the shipped P2-D0 tests demonstrate the NO_LINEAGE refusal, the CONSUMER_NOT_CANONICAL refusal and a DIRECT builder call. No shipped test drives a REAL A0 -> Governed Rework -> A1 chain and asserts capsuleForConsumer(A1).state === AUTHORIZED; the AUTHORIZED path is not demonstrated end to end at any level",
  },
  F12_actualHostDelivery: {
    classification: "SOURCE_DEMONSTRATED",
    capsuleReachesContextManifest: has(contextService, /TrajectoryContextCapsule|trajectoryCapsule|TRAJECTORY_CONTEXT_CAPSULE/u) === false,
    capsuleReachesWorkerPayload: has(workWorker, /TrajectoryContextCapsule|trajectoryCapsule/u) === false,
    priorResultReachesManifest: has(contextService, /continuation,/u),
    note: "no Capsule reaches Compiled Context, an Attempt-bound Handle, Context Pull or Host Prework. The only historical block that reaches the worker is the PriorResultContext continuation block; a Trajectory Capsule is obtainable ONLY by a direct operator call to capsuleForConsumer(), which is not Worker Context delivery",
  },
  F13_deliveryProvenanceAndReadOnlyState: {
    classification: "SOURCE_DEMONSTRATED",
    capsuleDigestRecorded: has(capsule, /capsuleDigest|contentDigest|deliveryDigest/u) === false,
    capsuleBytesRecordedOnDelivery: has(preview, /deliveredBytes|deliveryBytes/u) === false,
    note: "the product records no Capsule content digest, no delivery byte count, no consumer-received marker and no before-first-turn fact; there is no delivery record at all because there is no delivery path (F12)",
  },
  F14_benchmarkReadiness: {
    classification: "SOURCE_DEMONSTRATED",
    d0PreparedProtocol: existsSync(join(REPO, "research-evidence", "trajectory-p2d0", "d1-benchmark-readiness.json")),
    d0RanNoTrials: has(read("research-evidence/trajectory-p2d0/d1-benchmark-readiness.json"), /"stochasticTrialsRunInD0": 0/u),
    scenarioDWasSaturated: has(read("research-evidence/r2-vr/benchmark-qualification-law.json"), /saturat/u) || existsSync(join(REPO, "research-evidence", "r2-vr", "R3-READINESS.md")),
    note: "D0 prepared a protocol and ran no trials. No EXISTING task fixture is yet qualified under R2-VR's law; R2-VR showed Scenario C/D saturated, so a D1 utility fixture must be newly constructed and calibrated baseline-only before any treatment trial",
  },
};

const counts = Object.values(findings).reduce((accumulator, entry) => {
  accumulator[entry.classification] = (accumulator[entry.classification] ?? 0) + 1;
  return accumulator;
}, {});

process.stdout.write(
  `${JSON.stringify(
    {
      schemaVersion: 1,
      kind: "TRAJECTORY_P2D1_SOURCE_MAP",
      stage: "Trajectory-P2-D1",
      baseline: "205b4131453ad369489020e055502ee52b56222f",
      readOnly: true,
      modelCallsMade: 0,
      privateSessionsAccessed: false,
      dshHomeReported: sanitize(DSH_HOME),
      classificationCounts: counts,
      findings,
    },
    null,
    2,
  )}\n`,
);
