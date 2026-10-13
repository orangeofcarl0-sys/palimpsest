/**
 * Trajectory-P2-D0 §5 — SOURCE MAP FOR CONSUMER INTEGRITY.
 *
 * READ-ONLY. Answers, from the ACTUAL P2-C baseline source (HEAD 234d040), the questions P2-D0 must
 * resolve before any consumer may treat real DSH execution evidence as trusted history:
 *
 *   1.  Does every Parent-observed IPC Session identity survive into durable ingestion?
 *   2.  Can a mixed Invocation set be reported SELECTED_UNIQUE?
 *   3.  Is there a post-Event-Read currentness recheck?
 *   4.  Is aggregate qualification currentness established after the whole pass?
 *   5.  Does Timeout/Abort finalize an unclosed Invocation window?
 *   6.  Does one Job's terminal close every Invocation of the Attempt?
 *   7.  Can two Attempts both qualify the same source-scoped Session identity?
 *   8.  Can an invariant-refused Preview still claim FULL/COMPLETE/SESSION_READ?
 *   9.  Can an in-memory association store produce a durable-looking verified binding?
 *   10. Is the Reader's asynchronous close actually awaited by disposal?
 *   11. Can an expert-supplied Worker Port borrow a first-party source basis?
 *   12. Does the normal Host resolve DSH Home / the production reader specifier?
 *   13. Which Canonical Work / T0 facts does the attributed adapter replace with placeholders?
 *   14. Is a Caller Claim disagreement with a verified SessionId explicitly reported?
 *   15. Can a consumer reach another Attempt's history by naming its AttemptId?
 *   16. What existing Context mechanism is the narrowest correct Capsule delivery path?
 *   17. Can a normal deployment supply trusted historical source epochs?
 *   18. Is the extended installed Trajectory capability statically reachable?
 *
 * It modifies nothing, launches nothing and contacts nothing. Absolute personal paths are SANITIZED.
 *
 * Usage:  node scripts/trajectory_p2d0/source-map.mjs
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

const delegation = read("src/interaction/work_delegation.ts");
const workWorker = read("src/deployment/work_worker.ts");
const ingestion = read("src/execution_association/ingestion.ts");
const contract = read("src/execution_association/contract.ts");
const qualifier = read("src/execution_association/qualification.ts");
const store = read("src/execution_association/store.ts");
const cluster = read("src/composition/execution_association.ts");
const preview = read("src/composition/attributed_preview.ts");
const handoff = read("src/trajectory/handoff_preview.ts");
const invariants = read("src/trajectory/admission_invariants.ts");
const lifecycle = read("src/composition/lifecycle.ts");
const v0 = read("src/composition/trajectory_v0.ts");
const priorResult = read("src/context/prior_result.ts");
const contextService = read("src/context/service.ts");
const manifest = read("src/context/manifest.ts");
const install = read("src/install.ts");
const installContract = read("src/composition/install_contract.ts");
const launch = read("src/deployment/launch.ts");
const hostIndex = read("host/dsh/lib/index.js");

const findings = {
  F1_ipcConflictDisappearsFromPersistence: {
    classification: "DYNAMICALLY_REPRODUCED",
    trackerRetainsFirstId: has(delegation, /dshSessionId: sessionId/u),
    trackerCarriesOnlyLastConflict: has(delegation, /conflictingSessionId = report\.sessionId/u),
    recorderPersistsTrackerField: has(ingestion, /dshSessionId: identity\.dshSessionId/u),
    recorderReadsConflictingSessionId: has(ingestion, /conflictingSessionId/u),
    note: "the Tracker rebuilds ONE observation whose dshSessionId is always the FIRST observed id; the Recorder persists only that field and never reads conflictingSessionId, so A/B/C collapse to a durable candidate set of {A}",
  },
  F2_multiInvocationMixedStateSelection: {
    classification: "DYNAMICALLY_REPRODUCED",
    uniqueCaseConsultsAllStates: has(preview, /SELECTED_UNIQUE[\s\S]{0,400}unresolved/u),
    uniqueCaseIgnoresUnresolvedAlternatives: has(preview, /qualified\.length === 1[\s\S]{0,200}SELECTED_UNIQUE/u),
    note: "selectInvocation returns SELECTED_UNIQUE for exactly one qualified invocation WITHOUT consulting the unresolved states of the other invocations, so I-1 QUALIFIED + I-2 OBSERVATION_INCOMPLETE reports 'no unresolved alternative exists'",
  },
  F3_raceDuringEventRead: {
    classification: "SOURCE_DEMONSTRATED",
    qualifierRechecksCurrentness: has(qualifier, /relevantChanged/u),
    previewRechecksAfterEventRead: has(preview, /readSelectedSession[\s\S]{0,900}headAfter|store\.head\(\)[\s\S]{0,200}page/u),
    note: "the qualifier rechecks currentness BEFORE returning; the attributed adapter then reads the session page and builds the binding with no second relevant-basis check, so a conflict committed during Event Read is admitted as current",
  },
  F4_aggregateQualificationCurrentness: {
    classification: "SOURCE_DEMONSTRATED",
    oneBasisForWholePass: has(qualifier, /storeHeadAtStart[\s\S]{0,600}for \(const invocationId of invocations\)/u),
    postPassRecheck: has(qualifier, /qualifications[\s\S]{0,400}headAfter/u),
    note: "qualifyAttempt captures ONE basis before the pass and each invocation rechecks only against that snapshot; an early invocation can already have been returned ASSOCIATION_QUALIFIED while a later invocation's read reveals a change, so the aggregate result is not bound to one confirmed basis",
  },
  F5_prematureTerminalFinalization: {
    classification: "SOURCE_DEMONSTRATED",
    portResolvesBeforeClose: has(workWorker, /finish\(hostFailure\(`the worker did not finish within/u),
    delegationFinalizesOnReturn: has(ingestion, /INVOCATION_RETURNED/u),
    closeReasonDistinguishesTimeout: has(contract, /TIMEOUT|ABORT_REQUESTED/u),
    note: "the port resolves the promise from the timeout/abort handler BEFORE any child close is observed, and the delegation finalizes the window with the single closeReason INVOCATION_RETURNED, so an unclosed Invocation is recorded CLOSED",
  },
  F6_attemptWideFinalizationScope: {
    classification: "DYNAMICALLY_REPRODUCED",
    finalizeAttemptExists: has(ingestion, /finalizeAttempt\(/u),
    finalizeAttemptClosesEveryInvocation: has(ingestion, /invocations\.map\(\(invocationId\)/u),
    delegationCallsFinalizeAttempt: has(read("src/composition/continuation.ts"), /finalizeAttempt\(\{ attemptId: terminal\.attemptId/u),
    note: "onTerminal calls finalizeAttempt, which closes EVERY invocation the store knows for the attempt, so a terminal for one Job finalizes unrelated Invocations",
  },
  F7_crossAttemptDuplicateProducerIdentity: {
    classification: "DYNAMICALLY_REPRODUCED",
    eventIdIncludesAttemptId: has(contract, /attemptId: input\.attemptId, invocationId: input\.invocationId, dshSessionId/u),
    crossAttemptUniquenessCheck: has(store, /SELECT .*dsh_session_id|session_id TEXT UNIQUE|creator conflict/u),
    note: "the observation event id is scoped by attemptId, so the same source-scoped SessionId claimed by two Attempts yields two distinct records that qualify independently; there is no source-scoped cross-attempt creator check",
  },
  F8_invariantRefusedPreviewMetadata: {
    classification: "SOURCE_DEMONSTRATED",
    invariantsValidated: has(invariants, /validateAdmissionInvariants/u),
    lifecycleUsesInvariantVerdict: has(handoff, /sessionLifecycleOf\([^)]*invariantsRefused/u),
    coverageUsesInvariantVerdict: has(handoff, /eventPageCoverage = pageIntegrity\.coverage[\s\S]{0,200}invariantsRefused/u),
    note: "events ARE refused when invariants fail, but sessionLifecycle, eventPageCoverage and completeness are computed from the page and the admission flag only, so a refused page can still report SESSION_READ + FULL + COMPLETE",
  },
  F9_memoryDurabilityOverclaim: {
    classification: "DYNAMICALLY_REPRODUCED",
    memoryPathAccepted: has(cluster, /databasePath === ":memory:"\) return ":memory:"/u),
    storeIsInMemory: has(store, /new DatabaseSync\(databasePath === ":memory:" \? ":memory:"/u),
    verifiedBindingUnconditional: has(qualifier, /verification: "VERIFIED" as const/u),
    note: "deriveExecutionAssociationPath accepts ':memory:' and the qualifier sets verification VERIFIED with a durableBindingRef for any record, so an in-memory store yields a BOUND_VERIFIED-looking result that cannot survive process termination",
  },
  F10_readerAsyncDisposal: {
    classification: "SOURCE_DEMONSTRATED",
    readerCloseIsAsync: has(read("host/deployment/runtime/session_reader.js"), /async close\(\)/u),
    ownedResourceCloseVoided: has(cluster, /close: \(\) => \{ void readerHandle\.close\?\.\(\); \}/u),
    lifecycleAwaitsResourceClose: has(lifecycle, /for \(const resource of input\.ownedResources\) resource\.close\(\)/u),
    ownedResourceCloseIsSync: has(lifecycle, /readonly close: \(\) => void/u),
    note: "OwnedResource.close is synchronous and the reader's async close is voided, so dispose() returns before the mounted Cordis fiber is disposed",
  },
  F11_sourceConfigurationMismatch: {
    classification: "SOURCE_DEMONSTRATED",
    expertPortShortCircuitsFactory: has(cluster, /if \(options\.workWorkerPort !== undefined\) return options\.workWorkerPort/u),
    basisStillFromConfiguredBin: has(cluster, /computeTrustedSourceBasis\(\{ adapterId: `dsh-subprocess-work-worker:/u),
    sourceKindDefaultsFromBin: has(cluster, /options\.workWorkerBin === undefined \? "UNKNOWN" : "FIRST_PARTY_DSH_HOST"/u),
    note: "an explicitly supplied Worker Port replaces the derived one, but the trusted basis and FIRST_PARTY_DSH_HOST kind are still computed from workWorkerBin, so a stub port with a claimed first-party bin is source-qualified as first-party",
  },
  F12_normalDshEnvironment: {
    classification: "SOURCE_DEMONSTRATED",
    hostDerivesWorkerFacts: has(hostIndex, /deriveWorkWorkerFacts/u),
    hostSetsDshHomeOnlyWhenConfigured: has(hostIndex, /process\.env\.DSH_HOME === undefined \? \{\} : \{ dshHomePath: process\.env\.DSH_HOME \}/u),
    launchDerivesSessionsRoot: has(launch, /dshSessionsRoot: join\(options\.host\.dshHomePath, "sessions"\)/u),
    defaultReaderSpecifier: has(cluster, /palimpsest-host-deployment\/runtime\/session_reader\.js/u),
    note: "the reader is composed only when the host supplies DSH_HOME; without an explicit DSH_HOME no reader exists, so the supported default-home behavior is not exercised by the product path",
  },
  F13_incompleteCanonicalT0View: {
    classification: "DYNAMICALLY_REPRODUCED",
    adapterPlaceholderResultRefs: has(preview, /resultRefs: Object\.freeze\(\[\]\)/u),
    adapterPlaceholderVerification: has(preview, /verificationState: "NOT_OBSERVED_BY_P2C"/u),
    adapterPlaceholderRework: has(preview, /reworkState: "NONE"/u),
    adapterPlaceholderBasis: has(preview, /basisDigest: null, capturedAtRevision: null, taskId: record\?\.taskId/u),
    v0ComputesRealFacts: has(v0, /function canonicalFactsOf/u),
    clusterEmptyProjectEvolution: has(cluster, /does not compose the T0 project-evolution projection/u),
    note: "the attributed adapter supplies resultRefs [], verificationState NOT_OBSERVED_BY_P2C, reworkState NONE and a null basis, and the product cluster supplies an empty project-evolution projection, so facts the V0 composition can establish are replaced by placeholders",
  },
  F14_callerClaimDisagreement: {
    classification: "SOURCE_DEMONSTRATED",
    claimRecordedOnBinding: has(preview, /claimedSessionId: request\.claimedSessionId \?\? null/u),
    claimDisagreementReported: has(preview, /claimed.*differs|disagree|contradicts the observed/u),
    note: "the Caller Claim is recorded on the binding, but when it differs from the source-verified SessionId the discrepancy is not explicitly reported as a discrepancy",
  },
  F15_crossAttemptContextReachability: {
    classification: "SOURCE_DEMONSTRATED",
    previewTakesArbitraryAttemptId: has(preview, /previewAttempt\(request: \{\s*readonly attemptId: string/u),
    consumerAttemptBinding: has(preview, /consumerAttemptId|consumerAttempt/u),
    note: "previewAttempt admits ANY canonical Attempt of the project by its AttemptId with no consumer-Attempt binding, so a consumer can inspect another Attempt's history by naming it",
  },
  F16_existingConsumerDeliveryMechanism: {
    classification: "SOURCE_DEMONSTRATED",
    priorResultContextExists: has(priorResult, /export interface PriorResultContext/u),
    manifestCarriesContinuation: has(manifest, /readonly continuation\?: PriorResultContext/u),
    attemptBoundPullHandles: has(contextService, /compilePriorResultContext/u),
    handleAllowlistIsAttemptBound: has(workWorker, /workerPullHandleAllowed/u),
    note: "PriorResultContext compiled into the per-Attempt ContextManifest, delivered through the attempt-bound pull allowlist, is the narrowest existing mechanism; no unrestricted session-read tool exists",
  },
  F17_historicalSourceEpochProductWiring: {
    classification: "DYNAMICALLY_REPRODUCED",
    clusterAcceptsHistoricalEpochs: has(cluster, /historicalEpochs\?: readonly TrustedSourceEpoch\[\]/u),
    installOptionsExposeHistoricalEpochs: has(cluster, /readonly historicalEpochs\?: readonly TrustedSourceEpoch\[\] \| undefined;[\s\S]{0,600}export interface ExecutionAssociationInstallResult/u) === false,
    installPassesHistoricalEpochs: has(install, /historicalEpochs/u),
    note: "the cluster accepts historical epochs, but the install options do not expose them and install.ts never passes them, so a normal deployment cannot supply a trusted historical epoch after an upgrade",
  },
  F18_publicTypeCompatibility: {
    classification: "SOURCE_DEMONSTRATED",
    installReturnsWidened: has(install, /InstalledPalimpsestWithTrajectory/u),
    deploymentInstalledIsBase: has(launch, /readonly installed: InstalledPalimpsest;/u),
    note: "installPalimpsest returns InstalledPalimpsestWithTrajectory and the runtime object carries trajectory, but Deployment.installed is typed InstalledPalimpsest, so the extended capability is not statically reachable through the supported deployment surface",
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
      kind: "TRAJECTORY_P2D0_SOURCE_MAP",
      stage: "Trajectory-P2-D0",
      baseline: "234d040c234f9bfdda0bd210b91b45292588a7b6",
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
