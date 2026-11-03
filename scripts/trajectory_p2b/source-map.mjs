/**
 * Trajectory-P2-B §4 — SOURCE MAP FOR THE DURABLE EXECUTION ASSOCIATION.
 *
 * READ-ONLY. This script answers, from the ACTUAL baseline source, the questions P2-B must resolve
 * before it may persist anything:
 *
 *   1. What does the P2-A Level C gate actually MEASURE when it claims "no model turn ran"?
 *   2. What is the real on-disk Session artifact encoding, and can a UTF-8 text scan read it?
 *   3. Which component owns each identity in the chain, and where is it minted?
 *   4. Which existing facilities could physically host a durable association?
 *   5. Where does the source-qualification label come from, and can a caller supply it?
 *   6. What is the real closure boundary for an invocation's observation window?
 *
 * It modifies nothing, launches nothing and contacts nothing. It reads source text and reports what
 * it found, with every absolute personal path SANITIZED out of the output.
 *
 * Usage:  node scripts/trajectory_p2b/source-map.mjs
 * Output: JSON on stdout.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DSH_HOME = process.env["DSH_HOME"] ?? join(process.env["USERPROFILE"] ?? "", ".dsh");

/** §10.4 evidence hygiene: strip any absolute personal path from a reported string. */
function sanitize(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(/[A-Za-z]:\\[^\s"']*/gu, "<local-path>")
    .replace(/[A-Za-z]:\/[^\s"']*/gu, "<local-path>")
    .replace(/(?:\/Users|\/home)\/[^\s"']*/gu, "<local-path>");
}

function readRepo(relative) {
  const path = join(REPO, relative);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

const findings = {};

/* ------------------------------------------------------------------ *
 * 1. WHAT THE P2-A GATE MEASURES
 * ------------------------------------------------------------------ */

const p2aGate = readRepo("scripts/trajectory_p2a/level-c-first-party-gate.mjs");
findings.p2aGateMeasurement = (() => {
  if (p2aGate === null) return { present: false };
  /**
   * The P2-A gate's `inspectSessions()` reads each session artifact as UTF-8 and regex-matches
   * textual event types. This is the exact defect §5 B0-F1 names.
   */
  const readsArtifactAsUtf8 = /readFileSync\(\$\{JSON\.stringify\(artifact\)\},\s*'utf8'\)/u.test(p2aGate);
  const matchesTextualEventTypes = /"type"\\s\*:\\s\*"turn\//u.test(p2aGate) || /turn\\\/\(start\|end\)/u.test(p2aGate);
  const usesOfficialReader = /makeRealDshSessionReader|SessionPersistence|readColdSessionLog/u.test(p2aGate);
  return {
    present: true,
    readsArtifactAsUtf8,
    matchesTextualEventTypes,
    usesOfficialReader,
    verdict: readsArtifactAsUtf8 && !usesOfficialReader ? "MEASUREMENT_DEFECTIVE_COMPRESSED_ARTIFACT" : "UNEXPECTED",
    note: "a UTF-8 text scan cannot read a Zstandard-compressed session artifact, so a zero match proves nothing about the number of turn events",
  };
})();

/* ------------------------------------------------------------------ *
 * 2. THE REAL SESSION ARTIFACT ENCODING
 * ------------------------------------------------------------------ */

findings.sessionArtifactEncoding = (() => {
  /**
   * Measured directly against the P2-A gate's own artifacts: the two sessions it wrote are
   * `session.v4.jsonl.zstd` and begin with the Zstandard frame magic `28 b5 2f fd`. The bytes are
   * reported here rather than a path, so no private location enters evidence.
   */
  return {
    artifactSuffixObserved: "session.v4.jsonl.zstd",
    magicBytes: "28 b5 2f fd",
    magicMeaning: "Zstandard frame magic number",
    /**
     * §5 B0-F1: the installed DSH JSONL backend writes `session.v4.jsonl.zstd` by default. Reading it
     * as UTF-8 yields binary noise in which no textual `"type":"turn/..."` can appear, so a text scan
     * reports zero for EVERY session regardless of how many turns it contains.
     */
    conclusion: "the P2-A zero-turn measurement is VACUOUS: it would report zero even for a session with turns",
    correctMethod: "read the logical Session Event stream through the official DSH SessionPersistence reader",
  };
})();

/* ------------------------------------------------------------------ *
 * 3. IDENTITY OWNERSHIP IN THE CHAIN
 * ------------------------------------------------------------------ */

const delegation = readRepo("src/interaction/work_delegation.ts");
const workerPort = readRepo("src/deployment/work_worker.ts");
const runner = readRepo("host/dsh/lib/runner.js");
const sessionIdentity = readRepo("host/dsh/lib/session-identity.js");

findings.identityOwnership = (() => {
  const has = (text, re) => text !== null && re.test(text);
  return {
    attemptId: {
      owner: "Canonical Work (ProjectController.prepareMutatingWork)",
      observedInDelegation: has(delegation, /prepared\.attemptId/u),
      note: "the delegation service takes it from prepare; the model never receives it",
    },
    hostLocalJobId: {
      owner: "Work Delegation Service",
      observedInDelegation: has(delegation, /`wdj-\$\{randomUUID\(\)\}`/u),
      durable: false,
      note: "host-local and ephemeral; must never be the sole durable anchor",
    },
    invocationId: {
      owner: "Parent Worker Port",
      observedInPort: has(workerPort, /`wpi-\$\{randomUUID\(\)\}`/u),
      note: "minted by the port at run() time, before the spawn",
    },
    dshSessionId: {
      owner: "Real DSH Agent Session",
      mintedWhere: has(runner, /brandString\(`worker-\$\{randomUUID\(\)\}`\)/u) ? "host bundle mints the candidate; DSH stores and publishes it" : "not found",
      reportedBy: has(sessionIdentity, /reportWorkerSessionIdentity/u) ? "host/dsh/lib/session-identity.js" : "not found",
      readFromHandle: has(runner, /handle\?\.agent\?\.session\?\.id/u),
    },
  };
})();

/* ------------------------------------------------------------------ *
 * 4. EXISTING DURABLE FACILITIES
 * ------------------------------------------------------------------ */

const coordinationStore = readRepo("src/coordination/store.ts");
findings.durableFacilities = (() => {
  const coordHas = (re) => coordinationStore !== null && re.test(coordinationStore);
  return {
    coordinationStore: {
      path: "src/coordination/store.ts",
      domain: "palimpsest.coordination-event.v1",
      semanticOwnership: "peer coordination / federation (participation, collaboration, commitment, handoff)",
      appendOnly: coordHas(/append\(event: CoordinationAppendRequest\)/u),
      stableEventId: coordHas(/eventId: string/u),
      byteIdempotency: coordHas(/idempotent no-op/u),
      conflictOnDivergent: coordHas(/CoordinationConflictError/u),
      atomicBatch: coordHas(/appendAtomic/u),
      replay: coordHas(/async replay/u),
      failClosedMalformed: coordHas(/has a malformed payload/u),
      /**
       * §6.2: the decisive composition fact. The coordination store is constructed by the deployment
       * only when the profile names `databases.coordination`, and the participation/federation surface
       * is composed only when the full federation wiring is present. A deployment that composes no
       * peers therefore has no coordination store at all.
       */
      composedOnlyWithFederation: true,
    },
    workEventStore: {
      path: "src/state/event_store.ts",
      semanticOwnership: "canonical Work lifecycle transitions",
      warning: "§6.1: a Host observation is not a Work lifecycle transition; using Work events may introduce a new authority relationship",
    },
    g1bRecorder: {
      path: "scripts/r3l0c_g1/observation-correlation.mjs",
      kind: "research reference",
      warning: "§6.3: not automatically a production Binding Owner",
    },
  };
})();

/* ------------------------------------------------------------------ *
 * 5. SOURCE QUALIFICATION PROVENANCE
 * ------------------------------------------------------------------ */

findings.sourceQualificationProvenance = (() => {
  const callerSupplied =
    workerPort !== null && /sessionSourceQualification\?: WorkerSessionSourceQualification \| undefined;/u.test(workerPort);
  const defaultsToDirectChild = workerPort !== null && /runInput\.sessionSourceQualification \?\? "DIRECT_CHILD_IPC"/u.test(workerPort);
  return {
    field: "sessionSourceQualification",
    callerSupplied,
    defaultsToDirectChild,
    /**
     * §5 B0-C3: the label is a SUPPLIED CLASSIFICATION HINT. Nothing verifies that the executable
     * behind `dshBin` really was a first-party DSH host. A controlled stub could carry
     * `FIRST_PARTY_DSH_QUALIFIED` and the port would record it verbatim.
     */
    canCallerGrantQualification: callerSupplied,
    verdict: callerSupplied ? "CALLER_LABEL_IS_NOT_INDEPENDENT_VERIFICATION" : "UNEXPECTED",
    requiredP2bBehavior:
      "the durable read side must qualify the source from trusted deployment facts and actual reads, never from the message's own declaration",
  };
})();

/* ------------------------------------------------------------------ *
 * 6. THE OBSERVATION-WINDOW CLOSURE BOUNDARY
 * ------------------------------------------------------------------ */

findings.observationWindowClosure = (() => {
  const hasCloseHandler = workerPort !== null && /spawned\.on\("close"/u.test(workerPort);
  const hasExitObserved = workerPort !== null && /exitObserved = true/u.test(workerPort);
  const hasSpawnErrored = workerPort !== null && /spawnErrored = true/u.test(workerPort);
  const hasUnconfirmed = workerPort !== null && /DIRECT_CHILD_EXIT_UNCONFIRMED/u.test(workerPort);
  return {
    ipcMessagesArriveOn: "spawned.on(\"message\")",
    /**
     * §8.2: Node closes the IPC channel before the `close` event fires, so `close` is the last moment
     * an identity message can arrive. The port already distinguishes an OBSERVED exit from an
     * UNCONFIRMED one, so it is the only component that honestly knows the closure.
     */
    closureBoundary: "spawned.on(\"close\")",
    hasCloseHandler,
    distinguishesObservedFromUnconfirmed: hasExitObserved && hasSpawnErrored && hasUnconfirmed,
    portIsClosureOwner: hasCloseHandler && hasExitObserved,
    note: "a Worker Result line does NOT prove IPC delivery is complete; a timeout does NOT prove all earlier messages arrived",
  };
})();

/* ------------------------------------------------------------------ *
 * 7. WHAT P2-A DID NOT ESTABLISH
 * ------------------------------------------------------------------ */

findings.p2aNotEstablished = (() => {
  const p2aVerdicts = readRepo("research-evidence/trajectory-p2a/final-verdicts.json");
  let parsed = null;
  if (p2aVerdicts !== null) {
    try {
      parsed = JSON.parse(p2aVerdicts);
    } catch {
      parsed = "unreadable";
    }
  }
  return {
    recordedP2aVerdictFile: parsed === null ? "absent" : "present",
    gapsP2bMustClose: [
      "a durable Attempt -> Invocation -> Session association",
      "an independent cold-process recovery",
      "a real canonical Work -> DSH Session end-to-end correlation in one run",
      "an official (non-UTF-8-scan) Session Event measurement",
      "a source qualification that a caller cannot grant by label",
      "production BOUND_VERIFIED admission (explicitly NOT P2-B)",
    ],
  };
})();

process.stdout.write(
  `${JSON.stringify(
    {
      schemaVersion: 1,
      kind: "TRAJECTORY_P2B_SOURCE_MAP",
      stage: "Trajectory-P2-B",
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
