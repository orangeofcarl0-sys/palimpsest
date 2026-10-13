/**
 * Trajectory-P2-D2 §4/§5 — SOURCE MAP FOR MODEL-VISIBLE DELIVERY AND UTILITY ASSAY ENTRY.
 *
 * READ-ONLY. Answers, from the ACTUAL P2-D1 baseline source (HEAD d6c366c), the questions P2-D2 must
 * resolve before a qualified Trajectory Capsule can be said to reach the MODEL-VISIBLE input boundary:
 *
 *   F1  Does baseline `workTask()` render the Capsule into the model-visible prompt?
 *   F2  Is the raw Worker Context JSON ever model visibility?
 *   F3  Is the existing R2-E Prework the SAME experimental factor as a Trajectory Treatment?
 *   F4  Can a normal `ProjectAgentDeploymentProfile` enable the P2-D1 delivery capability?
 *   F5  Is Capsule Durability caller-supplied (upgradable)?
 *   F6  Does the product-composed delivery provider supply source-derived Durability?
 *   F7  Are nonfinite / fractional / negative Capsule budgets handled safely at runtime?
 *   F8  Is the legacy `maxTotalChars` budget actually enforced?
 *   F9  Do the declared `IngestionOutcome` and the runtime Recorder outcome agree?
 *   F10 Is a truncated event summary distinguished from an omitted event?
 *   F11 Can a Treatment delivery failure be silent (and mis-readable as CONTROL)?
 *   F12 Does the Host record a rendered Section Digest / full UserMessage Digest?
 *   F13 Does `request/header` establish the actual UserMessage contents?
 *   F14 Is the current real (3-event, non-model) Session a failure-recovery Treatment?
 *   F15 What does `sanitizeDshEvent()` actually retain, and what can a Capsule NOT establish?
 *   F16 Does a 24-event PREFIX necessarily contain the task-relevant failure evidence?
 *   F17 What must Product/Host enforce so historical instruction-like text stays data, not authority?
 *   F18 Can the implementation prove Control and Treatment differ in UserMessage bytes with identical authority?
 *
 * It modifies nothing, launches nothing and contacts nothing. Absolute personal paths are SANITIZED.
 *
 * Usage:  node scripts/trajectory_p2d2/source-map.mjs
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

const hostRunner = read("host/dsh/lib/runner.js");
const hostEfficacy = read("host/dsh/lib/efficacy.js");
const hostIndex = read("host/dsh/lib/index.js");
const workWorker = read("src/deployment/work_worker.ts");
const contextService = read("src/context/service.ts");
const capsule = read("src/trajectory/context_capsule.ts");
const preview = read("src/composition/attributed_preview.ts");
const cluster = read("src/composition/execution_association.ts");
const ingestion = read("src/execution_association/ingestion.ts");
const store = read("src/execution_association/store.ts");
const launch = read("src/deployment/launch.ts");
const profile = read("src/deployment/profile.ts");
const install = read("src/install.ts");
const execution = read("src/trajectory/execution.ts");
const d2Readiness = read("research-evidence/trajectory-p2d1/utility-benchmark-readiness.json");

const findings = {
  F1_capsuleNotRenderedIntoWorkTask: {
    classification: "SOURCE_DEMONSTRATED",
    // The baseline workTask() reads context.work, context.compiled?.continuation and the index text, but
    // never context.compiled?.trajectoryCapsule — so the Capsule that P2-D1 materialized is dropped here.
    workTaskReadsTrajectoryCapsule: has(hostRunner, /workTask\([\s\S]{0,2600}compiled\?\.trajectoryCapsule/u),
    workTaskReadsContinuation: has(hostRunner, /const continuation = context\.compiled\?\.continuation;/u),
    workTaskReadsIndexText: has(hostRunner, /if \(typeof indexText === 'string' && indexText\.length > 0\) lines\.push\(indexText\);/u),
    promptBuiltFromWorkTask: has(hostRunner, /applyEfficacyReview\(applyAffordance\(workTask\(environment\.context, indexTextForPrompt\), affordanceMode\), efficacyReview\)/u),
    note: "the baseline first engineering UserMessage is `workTask(environment.context, indexTextForPrompt)` wrapped by affordance/efficacy. workTask() reads the task half, the PriorResultContext continuation and the pull index, but NEVER context.compiled?.trajectoryCapsule. The P2-D1 Capsule therefore reaches the worker PROCESS (via the environment JSON) but is dropped before the prompt is composed — the PRIMARY D2 source gap",
  },
  F2_rawWorkerContextIsNotModelVisibility: {
    classification: "SOURCE_DEMONSTRATED",
    // workWorkerEnvironmentPayload() ships the whole context (including compiled.trajectoryCapsule) as JSON.
    payloadCarriesContext: has(workWorker, /workWorkerEnvironmentPayload\(context: WorkWorkerAttemptContext\)/u),
    payloadShipsContextObject: has(workWorker, /return Object\.freeze\(\{\s*context,/u),
    hostReadsContextFromFile: has(hostIndex, /context: raw\.context,/u),
    hostDropsUnrenderedContext: has(hostRunner, /workTask\(environment\.context, indexTextForPrompt\)/u),
    note: "`workWorkerEnvironmentPayload()` returns the FULL attempt context as JSON, and the host adapter forwards `raw.context` to the runner as `environment.context`. JSON transport into the worker PROCESS is not model visibility: only what `workTask()` renders into the UserMessage text is seen by the model. The Capsule is transported but not rendered (F1)",
  },
  F3_r2ePreworkIsADistinctFactor: {
    classification: "SOURCE_DEMONSTRATED",
    // R2-E E1 pulls the attempt's COMPILED HANDLES (Proof/Reasoning/Procedure capital) via the pull tool
    // and renders their BODIES. A Trajectory Capsule is a DIFFERENT object (historical execution evidence
    // over a qualified prior Attempt), delivered by the PRODUCT through compiled.trajectoryCapsule.
    e1PullsCompiledHandles: has(hostRunner, /const selected = \(environment\.context\?\.compiled\?\.handles \?\? \[\]\)/u),
    e1RendersPulledBodies: has(hostEfficacy, /lines\.push\(bodyTextOf\(entry\.body\)\);/u),
    efficacyEnvIsItsOwnSeam: has(hostEfficacy, /EFFICACY_ENV = 'PALIMPSEST_R2E_EFFICACY'/u),
    note: "R2-E's E1 treatment pulls the attempt's compiled HANDLES through the governed pull tool and renders their BODIES (Proof/Reasoning/Procedure capital). A Trajectory Capsule is a different object: a bounded projection of ONE qualified prior Attempt's execution evidence, delivered by the PRODUCT into compiled.trajectoryCapsule. Conflating them would silently merge two experimental factors, so a Trajectory Treatment must occupy its OWN presentation seam and never reuse the R2-E clause",
  },
  F4_deploymentProfileCannotEnableDelivery: {
    classification: "SOURCE_DEMONSTRATED",
    // The expert installPalimpsest() accepts experimentalTrajectoryContextDelivery, but launchDeployment()
    // does not pass it and ProjectAgentDeploymentProfile has no field for it.
    installOptionExists: has(install, /experimentalTrajectoryContextDelivery/u),
    launchPropagatesFlag: has(launch, /experimentalTrajectoryContextDelivery/u) === false,
    profileHasField: has(profile, /experimentalTrajectoryContextDelivery|trajectoryContext/u) === false,
    profileParserIsStrict: has(profile, /function exactKeys\(/u),
    note: "the expert `installPalimpsest()` accepts `experimentalTrajectoryContextDelivery`, but the normal `launchDeployment()` profile path neither propagates it nor declares a profile field, and `parseDeploymentProfile()` is strict exact-key at every level. A normal packaged deployment therefore CANNOT enable the experimental capability; only an expert install call can",
  },
  F5_durabilityIsCallerSupplied: {
    classification: "SOURCE_DEMONSTRATED",
    capsuleDurabilityFromInput: has(capsule, /durability: input\.capsuleInput\.durability \?\? "UNKNOWN"/u),
    capsuleForConsumerTakesDurability: has(preview, /readonly durability\?: "DURABLE" \| "EPHEMERAL" \| "UNKNOWN" \| undefined;/u),
    note: "`assembleCapsule()` sets `attribution.durability = input.durability ?? 'UNKNOWN'`, and `capsuleForConsumer()` accepts a caller-supplied `durability`. Nothing ties the recorded Durability to the ACTUAL trusted Association/Store qualification, so a caller that passes 'DURABLE' for an EPHEMERAL source can present historical evidence as durable",
  },
  F6_productDeliveryDoesNotDeriveDurability: {
    classification: "SOURCE_DEMONSTRATED",
    // The composition's delivery provider calls capsuleForConsumer with NO durability, so the Capsule
    // records UNKNOWN even though the Qualifier already established the real class (storeDurability).
    deliveryProviderPassesDurability: has(cluster, /capsuleForConsumer\(\{[\s\S]{0,400}durability/u),
    compositionKnowsStoreDurability: has(cluster, /const storeDurability: "DURABLE" \| "EPHEMERAL" = storePath === ":memory:" \? "EPHEMERAL" : "DURABLE";/u),
    qualifierExposesDurability: has(read("src/execution_association/qualification.ts"), /readonly durability: "DURABLE" \| "EPHEMERAL";/u),
    note: "the product-composed delivery provider calls `capsuleForConsumer({ consumerAttemptId })` with NO durability, so the delivered Capsule records UNKNOWN — even though the composition ALREADY derived `storeDurability` and the Qualifier ALREADY exposes the real `durability`. The trusted path discards a fact it holds, and the ordinary delivery is therefore LESS informative than the source allows",
  },
  F7_nonfiniteBudgetNotValidated: {
    classification: "SOURCE_DEMONSTRATED",
    effectiveLimitsClampsOnly: has(capsule, /function effectiveLimits\(requested: Partial<TrajectoryCapsuleLimits> \| undefined\): TrajectoryCapsuleLimits/u),
    effectiveLimitsUsesMinMax: has(capsule, /maxSerializedBytes: Math\.max\(0, Math\.min\(merged\.maxSerializedBytes, TRAJECTORY_CAPSULE_HARD_MAX_SERIALIZED_BYTES\)\)/u),
    effectiveLimitsRejectsNonfinite: has(capsule, /Number\.isFinite[\s\S]{0,400}effectiveLimits/u) === false,
    note: "`effectiveLimits()` merges and `Math.max(0, Math.min(...))`-clamps each bound. `Math.min(NaN, x)` is NaN and `Math.min(Infinity, x)` is x, so NaN survives as NaN and Infinity is silently reduced to the ceiling. A fractional or NaN `maxSerializedBytes` then makes every `serializedBytes > limits.maxSerializedBytes` comparison false, so the whole-byte budget is NOT enforced. TypeScript's `number` provides no runtime validation",
  },
  F8_legacyMaxTotalCharsNotEnforced: {
    classification: "SOURCE_DEMONSTRATED",
    // maxTotalChars is declared as a LEGACY bound, but the builder only clamps each summary to
    // maxEventSummaryChars; nothing sums summary lengths against maxTotalChars.
    legacyFieldDeclared: has(capsule, /\/\*\* LEGACY: the sum of event-summary character lengths\. Not the delivery byte bound\. \*\/\s*readonly maxTotalChars: number;/u),
    builderSumsSummaryChars: has(capsule, /usedChars[\s\S]{0,200}maxTotalChars/u) === false,
    note: "`TrajectoryCapsuleLimits.maxTotalChars` is DECLARED as the sum of event-summary character lengths, but `buildTrajectoryContextCapsuleChecked()` only clamps each individual summary to `maxEventSummaryChars`; no code sums summary lengths against `maxTotalChars`. The field is a documented constraint that is silently ignored — a small `maxTotalChars` with a large `maxSerializedBytes` lets summaries exceed the declared legacy budget",
  },
  F9_ingestionOutcomeContractMismatch: {
    classification: "SOURCE_DEMONSTRATED",
    declaredOutcomeIsRecorded: has(ingestion, /\| \{ readonly state: "RECORDED"; readonly eventId: string \}/u),
    storeReturnsAppended: has(store, /\| \{ readonly state: "APPENDED"; readonly event: ExecutionAssociationEvent \}/u),
    recorderCastsOutcome: has(ingestion, /return Object\.freeze\(\{ state: outcome\.state, eventId \}\) as IngestionOutcome;/u),
    note: "the declared `IngestionOutcome` union is RECORDED | IDEMPOTENT | REJECTED, but the store's own append outcome is APPENDED | IDEMPOTENT and the Recorder passes it through with `as IngestionOutcome`. The declared TypeScript contract and the runtime value DISAGREE: no consumer can write `outcome.state === 'RECORDED'` truthfully, and the cast hides the mismatch rather than unifying the vocabulary",
  },
  F10_truncationNotDistinguished: {
    classification: "SOURCE_DEMONSTRATED",
    eventSummaryHasTruncatedFlag: has(capsule, /readonly truncated: boolean;/u),
    capsuleLevelTruncationDetail: has(capsule, /truncated: input\.omitted > 0,/u),
    capsuleLevelDistinguishesSummaryTruncation: has(capsule, /summaryTruncated|summariesTruncated/u) === false,
    capsuleLevelDistinguishesEssentialOverflow: has(capsule, /essentialMetadataExceeded|essentialFloorExceeded/u) === false,
    note: "each `CapsuleEventSummary` carries its own `truncated` flag, but the Capsule-level `truncation` block sets `truncated: omitted > 0` and its detail mentions ONLY omitted events. A Capsule whose summaries were shortened (but no event dropped) reports `truncated: false`; a source page already PARTIAL is not separated from local truncation. The three cases — event omitted, summary shortened, source PARTIAL — are not independently represented",
  },
  F11_treatmentDeliveryFailureCanBeSilent: {
    classification: "SOURCE_DEMONSTRATED",
    // context/service.ts contains the delivery failure (try/catch → no Capsule) and returns a context with
    // NO marker of the failed delivery, so a Treatment trial cannot distinguish "no Capsule was authorized"
    // from "a Capsule was authorized but delivery failed".
    deliveryFailureContained: has(contextService, /\/\* §11: a delivery failure never breaks context compilation; the worker simply receives no Capsule \*\//u),
    contextCarriesDeliveryState: has(contextService, /trajectoryDeliveryState|deliveryPrecondition|CAPSULE_NOT_AVAILABLE/u) === false,
    note: "`workWorkerContext()` wraps the delivery provider in a try/catch and returns a context WITHOUT the Capsule on failure — with NO marker distinguishing 'no lineage / not authorized' from 'authorized but materialization failed'. Because the Capsule is also not rendered (F1), a future Treatment that loses its Capsule would produce a prompt indistinguishable from CONTROL. §8.6 forbids silently relabeling a failed Treatment as CONTROL, so a delivery-precondition state is required",
  },
  F12_noHostSectionDigest: {
    classification: "SOURCE_DEMONSTRATED",
    hostRecordsTrajectorySectionDigest: has(hostRunner, /trajectorySectionDigest|userMessageDigest/u) === false,
    hostRecordsIndexSectionDigest: has(hostRunner, /indexSectionDigest\(indexTextForPrompt\)/u),
    note: "the host already records a digest of the R2-M index section (`indexSectionDigest`), but there is NO rendered Trajectory Section digest and no full UserMessage digest. Without them a reviewer cannot prove WHICH section bytes entered the actual `agent.followup()` UserMessage, nor that the delivered bytes equal the product-rendered bytes",
  },
  F13_requestHeaderDoesNotEstablishMessageContents: {
    classification: "SOURCE_DEMONSTRATED",
    // DSH session: `user/message` is the model-visible surface event carrying the message verbatim;
    // `request/header` is a header snapshot (tools/model), not the message text. Neither the product's
    // sanitizer nor the host's read boundary even NAMES `user/message` today.
    dshSessionDeclaresUserMessage: true,
    productRecognizesUserMessage: has(execution, /"user\/message"/u),
    hostReadsToolNamesFromRequestHeader: has(hostRunner, /event\.type !== 'request\/header'/u),
    note: "for dsh-v0.2.0-rc.2 the model-visible surface event is `user/message` (it projects `content` verbatim and `source` tells the variants apart); `request/header` is a header snapshot that carries tools/model, NOT the message text. The host's own `offeredToolNames()` reads tools from `request/header`, which is correct for tools but must never be read as proof of the UserMessage body, and the product's `RECOGNIZED_DSH_EVENT_TYPES` does not even include `user/message`. Any D2 user-message proof must read the DSH session's `user/message` event directly",
  },
  F14_currentRealCapsuleIsNotAFailureTreatment: {
    classification: "SOURCE_DEMONSTRATED",
    // The P2-D1 real gate creates a real Session via the refusal probe (no model turn); its events are
    // session start / configuration, not a documented engineering failure.
    realGateUsesRefusalProbe: has(read("scripts/trajectory_p2b/rig.mjs"), /refusal-probe-plugin/u),
    realGateNoModelTurn: has(read("scripts/trajectory_p2d1/real-integration-gate.mjs"), /NO model turn runs/u),
    note: "the strongest real P2-D1 evidence is a non-model first-party Session created via the capability-refusal probe: its admitted events are session start / configuration, not a documented engineering failure. §12.2 forbids using a startup-only Session as failure-avoidance evidence, so the current real Capsule is a DELIVERY fixture, not a utility Treatment",
  },
  F15_sanitizerInformationLimits: {
    classification: "SOURCE_DEMONSTRATED",
    sanitizerRetainsTypeSeqDurability: has(execution, /readonly durability: DshEventDurability;/u),
    toolResultStatusIsNotSuccess: has(execution, /observedStatus = data\["message"\] === undefined \? "unknown" : "recorded";/u),
    sanitizerExcludesRawContent: has(execution, /\/\*\* A bounded, sanitized summary — never the raw payload\. \*\//u),
    note: "`sanitizeDshEvent()` deliberately excludes raw content and retains only type, seq, turn/step structure, tool NAME, durability, inheritance and a limited structural status. For `tool/result`, `observedStatus = 'recorded'` is the presence of a message, NOT proof the tool succeeded. A Capsule therefore CANNOT establish: what a tool actually returned, why a command failed, or what an assistant concluded. It CAN establish: which invocations existed, which events were observed, which pages are partial, which events were inherited, whether synthetic recovery appeared, and which areas remain unknown",
  },
  F16_eventWindowSufficiencyNotAssumed: {
    classification: "SOURCE_DEMONSTRATED",
    capsuleDefaultsToMaxEvents: has(capsule, /maxEvents: 24,/u),
    capsuleTakesPrefix: has(capsule, /for \(const event of execution\.events\) \{/u),
    note: "the Capsule defaults to at most 24 events and includes them from the START of the read page (a prefix). Nothing establishes that the task-relevant failure evidence lies within that prefix; a failure at a later sequence would be omitted. §11.4 requires the selection policy (prefix / bounded suffix / explicit segment) to be FROZEN before a utility trial, and forbids assuming a 24-event prefix contains the meaningful failure",
  },
  F17_modelVisibleAuthorityIsolation: {
    classification: "SOURCE_DEMONSTRATED",
    capsuleFramingIsData: has(capsule, /framing: "HISTORICAL_DATA_NOT_INSTRUCTIONS" as const,/u),
    capsuleAuthorityIsReadOnly: has(capsule, /authority: "READ_ONLY_INSPECTION" as const,/u),
    capsuleListsDoesNotAuthorize: has(capsule, /CAPSULE_DOES_NOT_AUTHORIZE = Object\.freeze\(\[/u),
    workerScopeDeniesPalimpsest: has(hostRunner, /agentCtx\.tools\.restrict\(\{ deny: denied \}\)/u),
    note: "the Capsule already carries `framing: HISTORICAL_DATA_NOT_INSTRUCTIONS`, `authority: READ_ONLY_INSPECTION` and an explicit `doesNotAuthorize` list; the worker's scope denies the inherited `palimpsest_` authority surface. What is NOT yet enforced is that the Capsule's TEXT reaches the model under those frames with the authority fields visible and inseparable from the content, so that instruction-like historical text is read as DATA. The enforcement is a presentation obligation (C3/C4), not a new authority",
  },
  F18_controlTreatmentDistinctionNotProven: {
    classification: "SOURCE_DEMONSTRATED",
    noTrajectoryPresentationSeam: has(hostRunner, /trajectoryPresentation|TRAJECTORY_PRESENTATION/u) === false,
    experimentalSeamsAreSeparateEnv: has(hostEfficacy, /EFFICACY_ENV/u) && has(hostRunner, /AFFORDANCE_ENV/u),
    note: "there is no Trajectory presentation seam at all, so the implementation cannot presently produce two arms that differ ONLY in whether the qualified Trajectory Section is present. §13 Group D requires that Control and Treatment differ in actual UserMessage bytes while retaining IDENTICAL Work/tool authority — a property that must be proven, not assumed, once the seam exists",
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
      kind: "TRAJECTORY_P2D2_SOURCE_MAP",
      stage: "Trajectory-P2-D2",
      baseline: "d6c366ca909d6719aab46a04bf717c0b3c352a92",
      readOnly: true,
      modelCallsMade: 0,
      privateSessionsAccessed: false,
      dshHomeReported: sanitize(DSH_HOME),
      priorReadinessPrepared: d2Readiness !== null,
      classificationCounts: counts,
      findings,
    },
    null,
    2,
  )}\n`,
);
