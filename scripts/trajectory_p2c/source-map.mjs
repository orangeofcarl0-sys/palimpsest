/**
 * Trajectory-P2-C §5 — SOURCE MAP FOR ATTRIBUTED EXECUTION ADMISSION.
 *
 * READ-ONLY. Answers, from the ACTUAL baseline source, the questions P2-C must resolve before any
 * Session event may be admitted to an Attempt Preview:
 *
 *   1. Where does the verifier's trusted source basis come from today?
 *   2. Is a source label independently verified, or only value-matched?
 *   3. What identity checks does the durable store perform on append and replay?
 *   4. What does Work revalidation actually prove?
 *   5. How is the observation window finalized, and what does the port really observe?
 *   6. Can an inconsistent binding state expose events through the Handoff Preview?
 *   7. Does normal product composition establish the worker/recorder/qualifier/reader/preview path?
 *
 * It modifies nothing, launches nothing and contacts nothing. Absolute personal paths are SANITIZED.
 *
 * Usage:  node scripts/trajectory_p2c/source-map.mjs
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

const store = read("src/execution_association/store.ts");
const qualifier = read("src/execution_association/qualification.ts");
const ingestion = read("src/execution_association/ingestion.ts");
const contract = read("src/execution_association/contract.ts");
const workWorker = read("src/deployment/work_worker.ts");
const delegation = read("src/interaction/work_delegation.ts");
const handoff = read("src/trajectory/handoff_preview.ts");
const binding = read("src/trajectory/binding.ts");
const v0 = read("src/composition/trajectory_v0.ts");
const install = read("src/install.ts");
const launch = read("src/deployment/launch.ts");
const hostIndex = read("host/dsh/lib/index.js");
const coldGate = read("scripts/trajectory_p2b/cold-recovery-gate.mjs");

const findings = {
  sourceBasisProvenance: {
    computedBy: "src/execution_association/ingestion.ts:computeTrustedSourceBasis",
    hashesWhat: has(ingestion, /createHash\("sha256"\)\.update\(value, "utf8"\)/u) ? "executable PATH STRINGS (not contents, not a signed manifest)" : "unknown",
    coldGateReusesProducerBasis: has(coldGate, /trustedBasis: handoff\.sourceBasis/u),
    note: "the P2-B cold gate supplies Process A's own sourceBasis to Process B, so it establishes VALUE MATCHING, not independent recovery of the verifier's trusted configuration",
  },
  sourceKindEnforcement: {
    recordedOnRecord: has(contract, /sourceKind: SourceKind/u),
    consultedByQualifier: has(qualifier, /sourceKind/u),
    note: "sourceKind is persisted but the qualifier never reads it, so a CONTROLLED_STUB record with a matching basis is not distinguished",
  },
  durableRecordIntegrity: {
    eventIdValidatedAgainstCanonicalIdentity: has(store, /associationEventId\(/u),
    rowColumnVsPayloadCheckedOnReplay: has(store, /row\.attempt_id !== |attempt_id !== .*payload/u),
    malformedFailsClosed: has(store, /has a malformed payload/u),
    note: "the store validates the payload SHAPE and the projectId, but not that eventId equals the canonical identity, nor that the SQLite columns agree with the payload",
  },
  workRevalidation: {
    port: "src/execution_association/qualification.ts:WorkRevalidationPort.readAttempt",
    verifiesExactAttemptCreatedEvent: false,
    note: "the port only requires a non-null Attempt record; it does not verify the exact historical ATTEMPT_CREATED event identity",
    v0AlreadyVerifiesIt: has(v0, /creationCount > 1/u) && has(v0, /ATTEMPT_CREATED/u),
  },
  observationWindow: {
    finalizationEvent: has(contract, /INVOCATION_OBSERVATION_FINALIZED/u),
    qualifierChecksClosed: has(qualifier, /windowState === "CLOSED"/u),
    qualifierChecksCandidateCount: has(qualifier, /observedCandidateCount/u),
    qualifierChecksOrdering: has(qualifier, /finalization.*before|predates/u),
    closeReasonUsedByDelegation: has(delegation, /INVOCATION_RETURNED/u),
    portObservesClose: has(workWorker, /spawned\.on\("close"/u),
    portDistinguishesTimeoutFromExit: has(workWorker, /DIRECT_CHILD_TIMEOUT_REQUESTED/u) && has(workWorker, /DIRECT_CHILD_EXIT_OBSERVED/u),
    note: "finalization is recorded from the delegation boundary returning; the port itself distinguishes close/exit/timeout/abort, but the delegation closeReason collapses them into INVOCATION_RETURNED",
  },
  handoffAdmission: {
    /**
     * §5 F11: there is NO validator that refuses an internally contradictory combination. The events are
     * gated only on the admission FLAG, so an ADMITTED_TO_ATTEMPT binding with a null dshSessionId still
     * exposes the page's events. (The `contradictoryObservations` caveat list is prose, not a check.)
     */
    crossFieldInvariantEnforced: has(handoff, /validateAdmission|admissionInvariant|refuseContradictoryBinding/u),
    eventsGatedOnAdmissionFlagOnly: has(handoff, /sessionReadAdmission === "ADMITTED_TO_ATTEMPT" && !pageRefused/u),
    pageIntegrityFailClosed: has(handoff, /pageIntegrity\.state === "INVALID"/u),
    note: "events are gated on the admission FLAG, but there is no validator that refuses an internally contradictory combination of binding status, session id and admission",
  },
  untrustedAssociations: {
    resolver: "src/trajectory/binding.ts:resolveVerifiedSessionBinding",
    requiresProducerObserved: has(binding, /observationState === "PRODUCER_OBSERVED"/u),
    requiresDurableRef: has(binding, /durableBindingRef !== null/u),
    requiresVerified: has(binding, /verification === "VERIFIED"/u),
    note: "the resolver accepts any association object carrying those three fields; nothing binds the OBJECT to a durable store, so a caller-built object can satisfy it",
    productionBoundaryNeeded: "the product adapter must obtain associations from the durable read side, never from a caller-supplied array",
  },
  productComposition: {
    installSuppliesWorkWorkerPort: has(install, /workWorkerPort: options\.workWorkerPort/u),
    launchSuppliesWorkWorkerPort: has(launch, /workWorkerPort: options\.host\?\.workWorkerPort/u),
    hostDerivesWorkWorkerPort: has(hostIndex, /dshSubprocessWorkWorkerPort/u),
    hostDerivesBranchPort: has(hostIndex, /dshSubprocessBranchExecutionPort/u),
    installComposesTrajectory: has(install, /composeTrajectoryV0|trajectory/u),
    installComposesAssociation: has(install, /execution_association|ExecutionAssociation/u),
    note: "the host derives a BRANCH port but not a WORK worker port; the install composes neither the association concern nor a trajectory surface",
  },
  previewDigest: {
    coversWatermarks: has(handoff, /readWatermark: execution\.readWatermark/u),
    coversKnownCounts: has(handoff, /knownEventCount/u),
    note: "the digest covers execution events and identity but not the read watermark or known event count, so an observation-basis change can leave the digest unchanged",
  },
  readerProductization: {
    path: "scripts/trajectory_v0/dsh-session-reader.mjs",
    isPlainEsm: true,
    importedFromSrc: has(read("src/trajectory/index.ts"), /dsh-session-reader/u),
    note: "the official reader lives under scripts/ and is imported only by tests; no src/ module imports a .mjs script today",
  },
};

process.stdout.write(
  `${JSON.stringify(
    {
      schemaVersion: 1,
      kind: "TRAJECTORY_P2C_SOURCE_MAP",
      stage: "Trajectory-P2-C",
      readOnly: true,
      modelCallsMade: 0,
      privateSessionsAccessed: false,
      dshHomeReported: sanitize(DSH_HOME),
      findings,
    },
    null,
    2,
  )}\n`,
);
