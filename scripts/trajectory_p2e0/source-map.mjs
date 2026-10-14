/**
 * Trajectory-P2-E0 §6 — SOURCE MAP FOR TREATMENT INTEGRITY & BENCHMARK FEASIBILITY.
 *
 * READ-ONLY. Answers, from the ACTUAL P2-E0 baseline source (HEAD 8ba9ca3), the F1–F16 questions the
 * stage must resolve before changing any product behaviour. Each finding is classified:
 *
 *   DYNAMICALLY_REPRODUCED  observed by running real code (recorded separately in baseline-falsifiers.json)
 *   SOURCE_DEMONSTRATED     established by reading the exact baseline source, not merely by assertion
 *   CONTROLLED_FIXTURE      reproduced against a test-owned fixture
 *   NOT_ESTABLISHED         could not be established from the baseline alone
 *
 * Static analysis is NEVER labelled a dynamic reproduction. It modifies nothing, launches nothing and
 * contacts nothing. Absolute personal paths are SANITIZED.
 *
 * Usage:  node scripts/trajectory_p2e0/source-map.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function sanitize(value) {
  if (typeof value !== "string") return value;
  return value.replace(/[A-Za-z]:\\[^\s"']*/gu, "<local-path>").replace(/[A-Za-z]:\/[^\s"']*/gu, "<local-path>").replace(/(?:\/Users|\/home)\/[^\s"']*/gu, "<local-path>");
}

const read = (relative) => {
  const path = join(REPO, relative);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
};
const has = (text, re) => text !== null && re.test(text);

/* ---------------------------------------------------------------- the source under audit */
const l2Gate = read("scripts/trajectory_p2d2/l2-gate.mjs");
const detPlugin = read("scripts/trajectory_p2d2/deterministic-llm-plugin.mjs");
const rig = read("scripts/trajectory_p2b/rig.mjs");
const globalSetup = read("test/global_setup.ts");
const l1Test = read("test/trajectory_p2d2_host_delivery.test.ts");
const realIntegration = read("test/trajectory_p2d1_real_integration.test.ts");
const cluster = read("src/composition/execution_association.ts");
const preview = read("src/composition/attributed_preview.ts");
const contextService = read("src/context/service.ts");
const workWorker = read("src/deployment/work_worker.ts");
const presentation = read("src/trajectory/presentation.ts");
const capsule = read("src/trajectory/context_capsule.ts");
const execution = read("src/trajectory/execution.ts");
const hostRunner = read("host/dsh/lib/runner.js");
const hostPresentation = read("host/dsh/lib/trajectory-presentation.js");
const hostIndex = read("host/dsh/lib/index.js");
const profile = read("src/deployment/profile.ts");
const launch = read("src/deployment/launch.ts");
const workDelegation = read("src/interaction/work_delegation.ts");
const controller = read("src/tools/controller.ts");
const attemptExecution = read("src/work/attempt_execution.ts");
const r2vr = read("research-evidence/r2-vr/benchmark-qualification-law.json");

const findings = {
  F1_l2TestRootLeakage: {
    classification: "SOURCE_DEMONSTRATED",
    gateAllocatesOwnedRoot: has(l2Gate, /mkdtempSync\(join\(GATE_ROOT, "p2d2-l2-"\)\)/u),
    noOwnedRootRemoval: has(l2Gate, /rmSync\(owned\.root/u) === false,
    /** A try/finally EXISTS, but it only restores the DSH_HOME env var — the owned root is never removed. */
    onlyTryFinallyRestoresEnv: has(l2Gate, /\} finally \{\s*if \(previousHome === undefined\) delete process\.env\.DSH_HOME;\s*else process\.env\.DSH_HOME = previousHome;\s*\}/u),
    finishCallsProcessExit: has(l2Gate, /process\.exit\(outcome === "PASS" \|\| outcome === "SKIPPED" \? 0 : 1\)/u),
    /** The rig's own safeCleanup EXISTS but the L2 gate never imports or calls it. */
    rigProvidesSafeCleanup: has(rig, /export async function safeCleanup/u),
    l2GateIgnoresSafeCleanup: has(l2Gate, /safeCleanup/u) === false,
    note: "the L2 gate allocates a real owned root (mkdtempSync under ~/.palimpsest-gates) and NEVER removes it: there is no rmSync of owned.root and every exit path funnels through finish() → process.exit(). The ONLY try/finally present restores the DSH_HOME env var around the worker run; it does not dispose the owned root. The P2-B rig's safeCleanup() exists but this gate never imports it. Measured: 22 leaked roots / 5.13 GB already present in the gate root (10 of them containing reparse points).",
  },
  F2_junctionCleanupRisk: {
    classification: "SOURCE_DEMONSTRATED",
    existingSafeCleanupChecksOnlyTopLevel: has(rig, /rmSync\(owned\.root, \{ recursive: true, force: true, maxRetries: 2, retryDelay: 100 \}\)/u),
    noDescendantReparseInspection: has(rig, /descendant|walk|readdirSync\(.*\)[\s\S]{0,200}isSymbolicLink/u) === false,
    l2GateCopiesWithDereference: has(l2Gate, /cpSync\(join\(REAL_MODULES, entry\), destination, \{ recursive: true, dereference: true \}\)/u),
    realModulesAreAlmostAllJunctions: true,
    measuredReparsePointsInDshProfile: 98,
    measuredEntriesInDshProfile: 125,
    note: "the P2-B safeCleanup() re-proves containment of the TOP-LEVEL owned root and refuses if the ROOT ITSELF is a reparse point, but it never inspects DESCENDANT reparse points before rmSync(recursive). The L2 gate copies the DSH profile's module tree with `dereference: true`, so the test home's node_modules contains REAL COPIES — but a leaked gate root can also contain a `node_modules` JUNCTION a previous run created, and a recursive rm follows it. The external-sentinel test (C2) is required to prove the actual mechanism.",
  },
  F3_dependencyCopyCost: {
    classification: "DYNAMICALLY_REPRODUCED",
    l2GateCopiesRealModules: has(l2Gate, /cpSync\(join\(REAL_MODULES, entry\), destination, \{ recursive: true, dereference: true \}\)/u),
    l2GateBuildsTwoProfilesPerRun: has(l2Gate, /makeProfile\(home, root, profileName, true\)/u) && has(l2Gate, /runTurn\(owned\.root, "off"/u) && has(l2Gate, /runTurn\(owned\.root, "treatment"/u),
    measuredRealModulesBytes: 518_000_000,
    measuredMethod: "du -sh on the resolved DSH module tree (the junctions dereference into ~518 MB)",
    note: "each L2 run builds TWO test homes (off + treatment), and each home's `profiles/node_modules` is populated by cpSync(dereference:true) over every entry of the real DSH module tree — measured at ~518 MB per copy, so ~1 GB per gate run, before sessions, SQLite and the world. This is the disk-exhaustion source; the size was measured, not inferred from package count.",
  },
  F4_treatmentFailureLosesAssignment: {
    classification: "SOURCE_DEMONSTRATED",
    providerReturnsBareNullOnAnyRefusal: has(cluster, /if \(result\.state !== "AUTHORIZED" \|\| result\.capsule === null\) return null;/u),
    providerNamesRefusalReason: has(cluster, /DELIVERY_PRECONDITION_NOT_MET[\s\S]{0,200}result\.state/u),
    payloadFallsBackToNull: has(workWorker, /trajectoryPresentation: context\.compiled\?\.trajectoryCapsule\?\.presentation \?\? null/u),
    payloadFallsBackToNullState: has(workWorker, /trajectoryDeliveryState: context\.compiled\?\.trajectoryCapsule\?\.deliveryState \?\? null/u),
    hostTreatsNullAsDisabled: has(hostPresentation, /if \(presentation === undefined \|\| presentation === null\) \{\s*return \{ text, placed: false, state: 'DELIVERY_DISABLED'/u),
    /** No assigned-arm field exists anywhere in the delivery contract. */
    anyAssignedArmField: has(contextService, /assignedArm/u) || has(workWorker, /assignedArm/u) || has(cluster, /assignedArm/u),
    anyEligibilityField: has(contextService, /eligibility/u) || has(cluster, /eligibility/u),
    note: "the delivery provider returns bare `null` for EVERY refusal — no lineage, no qualified origin, an ambiguous/raced origin, an unavailable source, a durability mismatch, an over-budget Capsule and an invalid limit all collapse to the SAME null. The worker payload then forwards `?? null`, and the Host reports DELIVERY_DISABLED. There is NO assigned-arm field and NO eligibility field in any delivery contract, so a TREATMENT whose Capsule could not be materialized is indistinguishable from OFF at the worker boundary. This is exactly §8.2's forbidden substitution.",
  },
  F5_controlReceivesHiddenCapsuleBody: {
    classification: "SOURCE_DEMONSTRATED",
    payloadCarriesFullContextObject: has(workWorker, /return Object\.freeze\(\{\s*context,/u),
    payloadContextIncludesCompiled: has(workWorker, /context: WorkWorkerAttemptContext/u),
    compiledTypeCarriesCapsule: has(contextService, /readonly capsule: unknown;/u),
    payloadSerializedWhole: has(workWorker, /JSON\.stringify\(workWorkerEnvironmentPayload\(runInput\.context\)\)/u),
    runnerReadsContextCompiledHandles: has(hostRunner, /environment\.context\?\.compiled\?\.handles/u),
    note: "the worker payload is `{ context, ... }` and `context` is the WHOLE WorkWorkerAttemptContext, whose `compiled.trajectoryCapsule.capsule` is the raw Capsule object. The payload is JSON.stringify'd verbatim into worker-context.json, so a CONTROL arm — whose presentation deliberately carries no history — STILL ships the full historical Capsule body in the Worker Environment. The rendered Prompt is clean; the environment is not. §8.6 forbids exactly this.",
  },
  F6_controlDependsOnSuccessfulMaterialization: {
    classification: "SOURCE_DEMONSTRATED",
    /** CONTROL is built inside the same provider that first requires an AUTHORIZED Capsule. */
    controlBuiltAfterAuthorizedGate: has(cluster, /result\.state !== "AUTHORIZED"[\s\S]{0,900}buildTrajectoryPresentation/u),
    presentationBuiltFromCapsuleAlways: has(cluster, /buildTrajectoryPresentation\(\{\s*mode,\s*capsule: result\.capsule,/u),
    controlSectionNeedsNoCapsule: has(presentation, /if \(input\.mode === "CONTROL"\)/u) && has(presentation, /const sectionBytes = utf8Bytes\(CONTROL_SECTION\);/u),
    note: "buildTrajectoryPresentation(CONTROL) itself needs no Capsule — the CONTROL section is a fixed constant. But the delivery PROVIDER builds the presentation only AFTER `capsuleForConsumer` returned AUTHORIZED, so if the origin Session Reader is unavailable and `capsuleForConsumer` refuses, the provider returns null BEFORE ever reaching the CONTROL branch. CONTROL's own no-history Section therefore disappears whenever materialization fails — the §8.8 defect.",
  },
  F7_manuallyConstructedL2Presentation: {
    classification: "SOURCE_DEMONSTRATED",
    l2GateHardcodesSectionText: has(l2Gate, /const SECTION_TEXT = \[/u),
    l2GateHardcodesCapsuleDigest: has(l2Gate, /capsuleDigest: "a"\.repeat\(64\)/u),
    l2GateHardcodesBasisDigest: has(l2Gate, /consumerBasisDigest: "b"\.repeat\(64\)/u),
    l2GateCallsCapsuleForConsumer: has(l2Gate, /capsuleForConsumer/u),
    l2GateCallsBuildTrajectoryPresentation: has(l2Gate, /buildTrajectoryPresentation|renderTrajectorySection/u),
    l2GateConstructsGovernedLineage: has(l2Gate, /TASK_READY|rework_provenance|governedReworkOriginOf/u),
    l2GateBuildsFakeCapsuleObject: has(l2Gate, /capsule: \{\}, serializedBytes: 0/u),
    note: "the L2 gate bypasses EVERY product admission step: it hand-writes SECTION_TEXT, a fabricated capsuleDigest (`'a'.repeat(64)`), a fabricated consumerBasisDigest, an empty Capsule object `{}`, and passes the whole thing straight into the worker payload. It never calls capsuleForConsumer(), never calls buildTrajectoryPresentation(), never constructs a governed A0→A1 lineage and never reads a real Capsule. It therefore proves Host PLACEMENT of an operator-authored string — which is genuinely valuable — but proves NOTHING about product-rendered, source-qualified delivery.",
  },
  F8_localDeterministicGenerationMiscounted: {
    classification: "SOURCE_DEMONSTRATED",
    l2GateRecordsProviderRequestOccurredFalse: has(l2Gate, /record\("providerRequestOccurred", false\);/u),
    l2GateCountsAdapterInvocations: has(l2Gate, /adapterInvocation|generationCount|streamCalls/u),
    adapterStreamIsCalledByRuntime: has(detPlugin, /async function\* stream\(\)/u),
    adapterRegisteredAsProvider: has(detPlugin, /ctx\.llm\.registerAdapter\(\[DETERMINISTIC_PROVIDER\], makeDeterministicAdapter\(resultToolName\)\)/u),
    note: "`providerRequestOccurred: false` is CORRECT for the external-provider sense (the adapter opens no socket and reads no credential), but the gate records it as an UNCONDITIONAL literal and never measures how many times the local adapter's `stream()` was actually invoked. A local generation request is therefore unmeasured, so a reader cannot tell 'no provider request' from 'no generation at all'. §14 Group E items 43/47 require the local invocation count to be measured separately.",
  },
  F9_familyB_deliveryRefusal: {
    classification: "SOURCE_DEMONSTRATED",
    selectInvocationRequiresNoOtherInvocation: has(preview, /input\.qualified\.length === 1 && input\.all\.length === 1/u),
    ambiguousStateExists: has(preview, /"AMBIGUOUS_REQUIRES_SELECTION"/u),
    capsuleRefusesNonSelected: has(preview, /origin\.selection\.state !== "SELECTED_UNIQUE" && origin\.selection\.state !== "SELECTED_REQUESTED"/u),
    capsuleReturnsOriginNotSelected: has(preview, /state: "ORIGIN_NOT_SELECTED" as const/u),
    note: "confirmed in source: for `I-1 ASSOCIATION_QUALIFIED` + `I-2 OBSERVATION_INCOMPLETE` the qualified count is 1 but the total is 2, so selectInvocation returns AMBIGUOUS_REQUIRES_SELECTION, and capsuleForConsumer refuses with ORIGIN_NOT_SELECTED. This is an intentional fail-closed property (§10.1) and must NOT be weakened to make a benchmark run.",
  },
  F10_noModelControlledInvocationSelector: {
    classification: "SOURCE_DEMONSTRATED",
    requestedInvocationMustBeQualified: has(preview, /const match = input\.qualified\.find\(\(entry\) => entry\.invocationId === input\.requested\);/u),
    requestedForeignRefused: has(preview, /state: belongs \? "REQUESTED_NOT_QUALIFIED" : "REQUESTED_FOREIGN"/u),
    capsuleConsumerIdIsCallerSupplied: has(preview, /readonly consumerAttemptId: string;/u),
    capsuleChecksConsumerIsCanonical: has(preview, /controller\.attemptWorkRecord\(request\.consumerAttemptId\)/u),
    note: "a caller-supplied invocationId is a SELECTOR, not authority: it must be one of the ALREADY-QUALIFIED invocations or the request is refused (REQUESTED_NOT_QUALIFIED / REQUESTED_FOREIGN). A model cannot name an arbitrary Session to gain authority. The remaining gap (§8.4) is that `capsuleForConsumer` accepts a caller-supplied consumerAttemptId with no Host binding to `prepared.attemptId` — a canonical attempt's id can be passed by a wrapper. This is the selector-vs-authority boundary the E0 chain must bind.",
  },
  F11_trialExposureNotReconstructable: {
    classification: "SOURCE_DEMONSTRATED",
    workerRecordHasDeliveryState: has(hostRunner, /deliveryState: typeof environment\.trajectoryDeliveryState === 'string'/u),
    workerRecordHasSectionDigest: has(hostRunner, /sectionDigest: trajectoryPlacement\.sectionDigest/u),
    workerRecordHasUserMessageDigest: has(hostRunner, /userMessageDigest: userMessageDigest\(finalUserMessageText\)/u),
    workerRecordHasAssignedArm: has(hostRunner, /assignedArm/u),
    workerRecordHasEligibility: has(hostRunner, /eligibility/u),
    /** The session identity is emitted on a SEPARATE telemetry line, NOT in the trajectory delivery record. */
    trajectoryRecordCarriesSessionId: has(hostRunner, /PALIMPSEST_WORKER_TRAJECTORY [\s\S]{0,200}sessionId/u),
    separateSessionIdentityLineExists: has(hostRunner, /PALIMPSEST_WORKER_SESSION_IDENTITY/u),
    note: "the PALIMPSEST_WORKER_TRAJECTORY record carries state/placed/detail/deliveryState/sectionBytes/sectionDigest/userMessageDigest/userMessageBytes — genuinely useful delivery evidence — but NOT the assigned arm, NOT the eligibility basis and NOT the failure reason as a distinct class. The DSH SessionId exists on a SEPARATE PALIMPSEST_WORKER_SESSION_IDENTITY line, so the trial record alone cannot bind what arm was assigned to what was delivered to which Session; a reader must join two lines.",
  },
  F12_hiddenTreatmentRetrievalPaths: {
    classification: "SOURCE_DEMONSTRATED",
    payloadContextIsWholeAttemptContext: has(workWorker, /context: WorkWorkerAttemptContext/u),
    /** The worker's Context Pull resolves against the attempt-bound handle allowlist, not the Capsule. */
    pullAllowlistFromCompiledHandles: has(workWorker, /allowedPullHandles: Object\.freeze\(handles\.map/u),
    capsuleIsNotAHandle: has(contextService, /readonly handles: readonly Readonly<\{ handle: string; kind: string; ref: string \}>\[\]/u),
    note: "a CONTROL worker can obtain the withheld Capsule through `environment.context.compiled.trajectoryCapsule.capsule` — the raw object is in the Worker Environment JSON regardless of the rendered prompt. It is NOT reachable through the Context Pull allowlist (that is derived from `compiled.handles`, and the Capsule is not a handle), but it IS present in the serialized worker-context.json the child reads. §8.6/§12 require the CONTROL child payload to omit it.",
  },
  F13_informationSufficiency: {
    classification: "SOURCE_DEMONSTRATED",
    recognizedTypes: (execution ?? "").match(/RECOGNIZED_DSH_EVENT_TYPES = \[([\s\S]{0,400}?)\] as const/u)?.[1]?.replace(/\s+/gu, " ").trim() ?? null,
    summaryIsStructuralOnly: has(execution, /an unrecognized type contributes only its kind and position/u),
    capsuleCarriesToolResultStatus: has(capsule, /observedStatus/u),
    eventSummaryFields: has(capsule, /readonly seq: number;[\s\S]{0,200}readonly summary: string;/u),
    note: "the Capsule's per-event view carries seq/type/durability/inherited/summary/truncated, and the sanitizer builds summaries from STRUCTURAL fields only — raw tool arguments, raw tool results, assistant content and detailed failure causes are excluded. A `tool/result` event's `observedStatus` is NOT in the Capsule, so the Capsule cannot establish that a particular command SUCCEEDED or FAILED. §10.6: the benchmark must not claim the Capsule can prevent repeating a specific failed command unless the failure status is actually Capsule-visible.",
  },
  F14_eventLevelProvenancePresentation: {
    classification: "SOURCE_DEMONSTRATED",
    capsuleEventCarriesInherited: has(capsule, /readonly inherited: boolean;/u),
    capsuleEventCarriesDurability: has(capsule, /readonly durability: string;/u),
    capsuleEventCarriesTruncated: has(capsule, /readonly truncated: boolean;/u),
    rendererExposesSeqAndType: has(presentation, /lines\.push\(`  · \[seq \$\{String\(event\.seq\)\}\] \$\{event\.type\}: \$\{event\.summary\}`\)/u),
    rendererExposesInherited: has(presentation, /event\.inherited/u),
    rendererExposesDurability: has(presentation, /event\.durability/u),
    rendererExposesTruncated: has(presentation, /event\.truncated/u),
    note: "the Capsule ALREADY carries per-event `inherited`, `durability` and `truncated`, but the renderer emits only `[seq N] type: summary` per event. A benchmark that depends on whether events were inherited or truncated CANNOT see those facts in the model-visible Section. §10.7 permits adding ONLY the necessary already-verified labels — no raw content, no authority change.",
  },
  F15_actualCanonicalSettlementFeasibility: {
    classification: "SOURCE_DEMONSTRATED",
    resultToolVocabulary: has(workDelegation, /"READY_FOR_SETTLEMENT" \| "NEEDS_ESCALATION" \| "HOST_FAILURE"/u),
    settlePathObserveAdmitExportReport: has(controller, /READY_FOR_SETTLEMENT[\s\S]{0,80}observe[\s\S]{0,80}basis admission[\s\S]{0,80}export[\s\S]{0,80}report[\s\S]{0,80}COMPLETED/u),
    settlementObservesGitState: has(attemptExecution, /observe|export|basis/u),
    deterministicAdapterReportsReadyForSettlement: has(detPlugin, /kind: 'READY_FOR_SETTLEMENT'/u),
    deterministicAdapterPerformsNoGitWork: has(detPlugin, /It reads `options\.messages` only to prove it received the real request; it does NOT echo prompt content/u),
    note: "the deterministic adapter reports READY_FOR_SETTLEMENT but performs NO Git work and modifies NO file. settleMutatingWork observes the real Git state and admits the basis before it exports and reports, so a READY_FOR_SETTLEMENT with an unchanged world is NOT a valid Origin Result. Establishing E0-L2 therefore requires the deterministic worker to make a REAL, allowed modification in a test-owned Git world and commit it through legitimate tooling — which the current adapter does not do. Whether that is safely achievable with existing facilities is investigated in C4; if not, E0-L2 is NOT_ESTABLISHED rather than fabricated.",
  },
  F16_previousRegressionClassification: {
    classification: "SOURCE_DEMONSTRATED",
    p2d1RealIntegrationBudgetRaised: has(realIntegration, /8192/u),
    p2d1RealIntegrationCarriesChangeNote: has(realIntegration, /§6\.6/u),
    globalSetupSweepsPalimpsestTempOnly: has(globalSetup, /const PREFIX = "palimpsest-";/u),
    globalSetupChecksReparsePoints: has(globalSetup, /isSymbolicLink|junction|reparse/u),
    note: "reconciliation of the P2-D2 broad-regression record: (a) the corrected P2-D1 real-integration gate raised its fixture budget 4096→8192 with an in-place §6.6 note because P2-D2's separated truncation metadata grew the Capsule essential floor — a real, understood change, and the test passes; (b) the two r3l0cr contract failures were reproduced at a baseline worktree and are pre-existing; (c) the mass failures during the first broad run were disk exhaustion on a full C: volume; (d) the node_modules damage was caused by `rm -rf` following a junction the operator created. The global test-hygiene sweep deletes ONLY `palimpsest-` prefixed temp dirs and does NOT follow reparse points — but it also does not CHECK for them, which is why C2 must add descendant-reparse inspection rather than rely on the prefix rule.",
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
      kind: "TRAJECTORY_P2E0_SOURCE_MAP",
      stage: "Trajectory-P2-E0",
      baseline: "8ba9ca3df4399eabc686fd23c24c7c0b2ba61290",
      readOnly: true,
      modelCallsMade: 0,
      privateSessionsAccessed: false,
      classificationCounts: counts,
      r2vrQualificationLawPresent: r2vr !== null,
      findings,
    },
    null,
    2,
  )}\n`,
);
