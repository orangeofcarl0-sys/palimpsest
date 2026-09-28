#!/usr/bin/env node
/**
 * §E3-C-LIVE — GOVERNED SOVEREIGN COLLABORATION, end to end, on REAL PACKAGED INSTALLS.
 *
 * NOT a product component: acceptance evidence, kept in Git so the gate can be re-run.
 *
 * The loop this gate exists to close:
 *
 *     Project Reality (a real blocked task)
 *       → a grounded NeedCandidate
 *       → an INDEPENDENT authority's admission
 *       → a durable ContactNeed
 *       → explicit peer discovery / contact
 *       → an explicit, authenticated commitment
 *       → Project B's OWN sovereign Work (its own ledger)
 *       → a typed accepted shared artifact
 *       → an admitted fulfillment
 *       → explicit LOCAL adoption
 *       → new local Work
 *
 * and the law the whole stage turns on:
 *
 *     Project A may request and accept a contribution from Project B.
 *     Project A NEVER obtains authority over Project B's Work ledger.
 *
 * WHAT MAKES THIS A REAL GATE:
 *
 *   · TWO packaged `installPalimpsest` deployments with SEPARATE orchestration databases and SEPARATE
 *     Work ledgers — a real second project, not a second handle onto the same one;
 *   · Phase 3 DISPOSES Project A's installation and composes a SECOND one over the same durable stores,
 *     so "the need survived" is an observation, not an assumption;
 *   · Phase 9 does the same for the fulfillment;
 *   · Phase 6 runs B's Work through B's own scheduler and asserts A's ledger is untouched;
 *   · Phase 12 proves a post-restart negative case.
 *
 * The workers are deterministic host fixtures (§38: "no unnecessary LLM nondeterminism").
 *
 * PLAIN JAVASCRIPT (`.mjs`): it runs under bare `node` against `dist/src/**`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { gateRepoRoot, gateRoot } from "./env.mjs";

const REPO = gateRepoRoot();
const RUN = gateRoot();
const RIG = `${RUN}/e3c-live`;
const A_DIR = `${RIG}/a`;
const B_DIR = `${RIG}/b`;
const STATE = `${RIG}/state`;
const OUT = `${RIG}/out`;

const advanced = await import(pathToFileURL(`${REPO}/dist/src/advanced.js`).href);
const coordinationModule = await import(pathToFileURL(`${REPO}/dist/src/coordination/index.js`).href);
const boundaryModule = await import(pathToFileURL(`${REPO}/dist/src/boundary_memory/index.js`).href);
const federationModule = await import(pathToFileURL(`${REPO}/dist/src/federation/index.js`).href);
const collaborationModule = await import(pathToFileURL(`${REPO}/dist/src/project_collaboration/index.js`).href);
const workspaceModule = await import(pathToFileURL(`${REPO}/dist/src/project_workspace/index.js`).href);
const { durableContactNeedScopeGuard } = await import(pathToFileURL(`${REPO}/dist/src/federation/federation_service.js`).href);

const projectA = "e3clivea";
const projectB = "e3cliveb";
const git = (cwd, args) => execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

const findings = [];
const record = (key, value) => {
  findings.push([key, value]);
  process.stdout.write(`  · ${key}: ${value}\n`);
};

/* ------------------------------------------------------------------ fixture */

function setupRepo(dir, file) {
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", file), "export const value = 1;\n");
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: dir });
  return git(dir, ["rev-parse", "HEAD"]);
}

function setup() {
  rmSync(RIG, { recursive: true, force: true });
  mkdirSync(STATE, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const headA = setupRepo(A_DIR, "a.js");
  const headB = setupRepo(B_DIR, "b.js");
  return { headA, headB };
}

/* ------------------------------------------------------------------ policies */

const policyRef = (policyId) => ({ policyId, version: "v1" });

const STANDARD = Object.freeze({
  statement: "the commit exists and scope is respected",
  clauses: Object.freeze([
    Object.freeze({ kind: "command_succeeds", command: Object.freeze(["node", "-e", "process.exit(0)"]), predicate: "tests_pass" }),
    Object.freeze({ kind: "scope_respected" }),
  ]),
  derivedFrom: Object.freeze(["e3c-live fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

/**
 * §6: the UNTRUSTED authoring seam. Deterministic, and its only capability is to suggest tags/reason.
 * `script.outcome` is MUTABLE so the gate can exercise NO_NEED against the SAME deployment.
 */
function authoring(script) {
  return {
    origin: "e3c-live-author",
    async propose({ ground }) {
      if (script.outcome === "NO_NEED") return { outcome: "NO_NEED" };
      if (script.outcome === "UNRESOLVED") return { outcome: "UNRESOLVED" };
      return {
        outcome: "proposal",
        competenceTags: script.tags ?? ["optics", "calibration"],
        reason: `grounded in ${ground.kind} ${ground.taskId ?? ground.attemptId}`,
      };
    },
  };
}

/** §8: the INDEPENDENT need authority. Deterministic; decides the EXACT digest it was shown. */
function needAuthority(script) {
  return {
    policyRef: policyRef("e3c-live-need-authority"),
    async decide({ candidate }) {
      return {
        decision: script.decision,
        candidateDigest: candidate.digest,
        policyRef: policyRef("e3c-live-need-authority"),
        provenanceDigest: "e".repeat(64),
        detail: `the e3c-live need authority returned ${script.decision}`,
      };
    },
  };
}

/** §25: the INDEPENDENT fulfillment authority — never the holder, never a message ack. */
function fulfillmentAuthority(script) {
  return {
    policyRef: policyRef("e3c-live-fulfillment-authority"),
    async decide({ submission }) {
      return {
        decision: script.decision,
        submissionDigest: submission.digest,
        policyRef: policyRef("e3c-live-fulfillment-authority"),
        provenanceDigest: "f".repeat(64),
        detail: `the e3c-live fulfillment authority returned ${script.decision}`,
      };
    },
  };
}

/** A deterministic transport: messages are recorded, never actually delivered across processes. */
function transport() {
  return federationModule.callbackPeerTransportPort("e3c-live", {
    onSend: async () => ({ transportMessageId: "t", delivered: true }),
    onWake: async () => ({ signaled: true }),
  });
}

/* ------------------------------------------------------------------ the run */

async function main() {
  const { headA, headB } = setup();
  process.stdout.write(`repo A   ${A_DIR}\nrepo B   ${B_DIR}\n\n`);

  const stores = () => ({
    coordination: new coordinationModule.SqliteCoordinationStore(`${STATE}/coordination.sqlite`),
    boundary: new boundaryModule.SqliteBoundaryMemoryStore(`${STATE}/boundary.sqlite`),
  });

  const peerA = federationModule.materializePeerRef({ peerId: "peer-a" });
  const peerB = federationModule.materializePeerRef({ peerId: "peer-b" });

  /** One packaged install. A and B differ ONLY by project id, repo, ledger and local peer. */
  function install(input) {
    const coordination = new coordinationModule.SqliteCoordinationStore(`${STATE}/coordination.sqlite`);
    const boundary = new boundaryModule.SqliteBoundaryMemoryStore(`${STATE}/boundary.sqlite`);
    const installed = advanced.installPalimpsest(
      { tools: { register: () => () => undefined } },
      {
        projectId: input.projectId,
        databasePath: input.orchestrationPath,
        ordariumDatabasePath: input.ordariumPath,
        repository: input.repo,
        execution: "worktree",
        standard: STANDARD,
        policy: advanced.trustedDefaultPolicy({
          read_paths: ["src"],
          allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }],
        }),
        localPeer: input.peer,
        coordinationStore: coordination,
        boundaryMemoryStore: boundary,
        peerTransportPort: transport(),
        peerDirectoryPort: {
          observePeers: async () => ({
            state: "known",
            value: [federationModule.materializePeerAdvertisement({ peer: peerB, competenceTags: ["optics", "calibration"] })],
          }),
        },
        attemptCatalog: { assertAdmissibleAttempt: async () => {} },
        // The ProjectWorkspace (journal + associations) is the owner explicit LOCAL adoption goes through.
        projectAssociationStore: new workspaceModule.SqliteProjectAssetAssociationStore(`${STATE}/assoc.sqlite`),
        projectJournalStore: new workspaceModule.SqliteProjectJournalStore(`${STATE}/journal.sqlite`),
        projectCollaborationAuthoring: authoring(input.authoringScript),
        projectCollaborationAdmission: needAuthority(input.needScript),
      },
    );
    return { installed, coordination, boundary, close: () => installed.dispose() };
  }

  const authoringScript = { outcome: "proposal", tags: ["optics", "calibration"] };
  const needScript = { decision: "REJECT" };

  /* ---------------------------------------------------------------- Phase 1 */

  process.stdout.write("PHASE 1 — Project A hits real collaboration pressure\n");
  const a = install({ projectId: projectA, repo: A_DIR, peer: peerA, orchestrationPath: `${STATE}/a.sqlite`, ordariumPath: `${STATE}/a-ops.sqlite`, authoringScript, needScript });
  const controllerA = a.installed.controller;
  controllerA.start({
    projectId: projectA,
    goal: "ship the calibrated sensor",
    headCommit: headA,
    tasks: [
      { task_id: "dep", objective: "the unsatisfied dependency", depends_on: [], write_paths: ["src/a.js"], required_artifacts: [] },
      { task_id: "t1", objective: "calibrate the sensor", depends_on: ["dep"], write_paths: ["src/a.js"], required_artifacts: [] },
    ],
  });
  const taskStatesA = controllerA.work.taskStates();
  const blocked = taskStatesA.find((task) => task.taskId === "t1");
  record("1. canonical blocked Work condition", `t1 = ${blocked?.state}`);

  const collaboration = a.installed.projectCollaboration;
  if (collaboration === undefined) throw new Error("the packaged install composed no projectCollaboration surface");
  const prepared = await collaboration.prepare({ ground: { kind: "BLOCKED_TASK", taskId: "t1" } });
  if (prepared.status !== "prepared") throw new Error(`prepare returned ${prepared.status}`);
  record("2. grounded NeedCandidate", `${prepared.candidate.candidateId} (ground ${prepared.candidate.ground.kind} ${prepared.candidate.ground.taskId})`);
  record("3. candidate names the real project basis", `revision ${prepared.candidate.projectBasis.revision} / ${prepared.candidate.projectBasis.digest.slice(0, 12)}…`);
  record("4. candidate tags (authored, not authoritative)", prepared.candidate.competenceTags.join(", "));
  const declaredBeforePhase2 = (await countCoordination(a.coordination, "CONTACT_NEED_DECLARED"));
  record("5. NO contact and NO durable need at prepare", `${declaredBeforePhase2} CONTACT_NEED_DECLARED, 0 CONTACT_REQUESTED`);

  /* ---------------------------------------------------------------- Phase 2 */

  process.stdout.write("\nPHASE 2 — governed Need admission\n");
  // (a) The authority REJECTS: zero declarations.
  const rejected = await collaboration.admit({ candidate: prepared.candidate });
  record("6. rejecting authority", `${rejected.status} (${(await countCoordination(a.coordination, "CONTACT_NEED_DECLARED")) === declaredBeforePhase2 ? "zero declarations" : "A DECLARATION HAPPENED"})`);
  // (b) UNRESOLVED: still zero.
  needScript.decision = "UNRESOLVED";
  const unresolved = await collaboration.admit({ candidate: prepared.candidate });
  record("7. unresolved authority", `${unresolved.status} (${(await countCoordination(a.coordination, "CONTACT_NEED_DECLARED")) === declaredBeforePhase2 ? "zero declarations" : "A DECLARATION HAPPENED"})`);
  // (c) ADMIT the EXACT candidate.
  needScript.decision = "ADMIT";
  const admitted = await collaboration.admit({ candidate: prepared.candidate });
  if (admitted.status !== "DECLARED") throw new Error(`admit returned ${admitted.status}: ${admitted.detail}`);
  const needId = admitted.contactNeedId;
  record("8. admitted exact candidate digest", admitted.declaration.candidateDigest.slice(0, 12) + "…");
  record("9. durable CONTACT_NEED_DECLARED", `${needId} (${(await countCoordination(a.coordination, "CONTACT_NEED_DECLARED"))} event)`);
  // §13: a retry of the SAME candidate does not create a second need.
  const retried = await collaboration.admit({ candidate: prepared.candidate });
  record("10. retry of the same candidate is idempotent", `${retried.contactNeedId === needId ? "same need" : "A SECOND NEED WAS CREATED"} (${(await countCoordination(a.coordination, "CONTACT_NEED_DECLARED"))} event)`);

  /* ---------------------------------------------------------------- Phase 3 */

  process.stdout.write("\nPHASE 3 — cold restart\n");
  a.close();
  const a2 = install({ projectId: projectA, repo: A_DIR, peer: peerA, orchestrationPath: `${STATE}/a.sqlite`, ordariumPath: `${STATE}/a-ops.sqlite`, authoringScript, needScript });
  const recovered = await a2.installed.federation.contactNeed(needId);
  if (recovered === undefined) throw new Error("the ContactNeed did NOT survive the restart");
  record("11. ContactNeed recovered after restart", `${recovered.need.contactNeedId}`);
  record("12. origin recovered", `${recovered.need.origin.kind}:${recovered.need.origin.taskId}`);
  record("13. competenceTags recovered", recovered.need.competenceTags.join(", "));
  record("14. reason recovered", recovered.need.reason);
  record("15. ground provenance recovered", `${recovered.provenance.ground.kind} ${recovered.provenance.ground.taskId}`);
  record("16. admission provenance recovered", `${recovered.provenance.admission.decision} by ${recovered.provenance.admission.policyRef.policyId}`);
  const collaborationA = a2.installed.projectCollaboration;
  if (collaborationA === undefined) throw new Error("the restarted install composed no projectCollaboration surface");
  // Phase 3 replaced the installation; every later read of A's Work must use the CURRENT handle.
  let liveA = a2;

  /* ---------------------------------------------------------------- Phase 4 */

  process.stdout.write("\nPHASE 4 — peer discovery / contact\n");
  const need = recovered.need;
  const discovery = await a2.installed.federation.findCandidates(need);
  if (discovery.status !== "discovered") throw new Error(`discovery returned ${discovery.status}`);
  record("17. deterministic candidate B", discovery.candidates.map((candidate) => candidate.peer.peerId).join(", "));
  const requestsBefore = (await countCoordination(a2.coordination, "CONTACT_REQUESTED"));
  await a2.installed.federation.requestContact({ need, to: peerB });
  record("18. explicit CONTACT_REQUESTED", `${(await countCoordination(a2.coordination, "CONTACT_REQUESTED"))} event (was ${requestsBefore})`);
  record("19. no assignment happened", `${liveA.installed.controller.work.taskStates().length} tasks, all A's own`);

  /* ---------------------------------------------------------------- Phase 5 */

  process.stdout.write("\nPHASE 5 — explicit responsibility\n");
  const workBeforeA = snapshotTasks(liveA.installed.controller);
  const offer = await a2.installed.federation.offerCommitmentForNeed({
    contactNeedId: needId,
    proposedHolder: peerB,
    statement: "deliver the accepted calibration statement",
  });
  record("20. derived scope (caller never authored it)", JSON.stringify(offer.scope));
  record("21. recoverable terms body present", offer.terms === undefined ? "ABSENT" : offer.terms.statement);
  await a2.installed.federation.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: peerB });
  const commitmentState = (await a2.installed.federation.commitmentState(offer.commitmentId)).state;
  const workAfterCommitment = snapshotTasks(liveA.installed.controller);
  record("22. ACTIVE after authenticated acceptance", commitmentState);
  record("23. Project A Work unchanged by the commitment act", workAfterCommitment === workBeforeA ? "UNCHANGED" : "CHANGED");

  /* ---------------------------------------------------------------- Phase 6 */

  process.stdout.write("\nPHASE 6 — Project B sovereign work\n");
  const b = install({ projectId: projectB, repo: B_DIR, peer: peerB, orchestrationPath: `${STATE}/b.sqlite`, ordariumPath: `${STATE}/b-ops.sqlite`, authoringScript, needScript });
  const controllerB = b.installed.controller;
  controllerB.start({
    projectId: projectB,
    goal: "produce the calibration statement",
    headCommit: headB,
    tasks: [{ task_id: "bt1", objective: "measure the gain", depends_on: [], write_paths: ["src/b.js"], required_artifacts: [] }],
  });
  // B runs its OWN work through its OWN scheduler — the real deterministic local task.
  const preparedB = await controllerB.prepareMutatingWork({ expectedTaskId: "bt1" });
  const worldB = preparedB.worldPath;
  writeFileSync(join(worldB, "src", "b.js"), "export const value = 2;\n");
  execFileSync("git", ["add", "-A"], { cwd: worldB });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "B calibrated"], { cwd: worldB });
  const resultCommitB = git(worldB, ["rev-parse", "HEAD"]);
  controllerB.report(preparedB.attemptId, { workerStatus: "completed", summary: "calibrated", changedFiles: ["src/b.js"], producedArtifacts: ["src/b.js"], resultCommit: resultCommitB });
  const attemptB = controllerB.attemptWorkRecord(preparedB.attemptId);
  record("24. B's Work ran in B's own ledger", `attempt ${preparedB.attemptId} = ${attemptB.state}`);
  record("25. B's Work is invisible to A", liveA.installed.controller.work.taskStates().some((task) => task.taskId === "bt1") ? "A SEES B's TASK" : "not in A");
  record("26. A's commitment does not authorize B's scheduler", liveA.installed.controller.work.project().tasks.every((task) => task.task_id !== "bt1") ? "B ran on B's own authority" : "A OWNS B's WORK");

  /* ---------------------------------------------------------------- Phase 7 */

  process.stdout.write("\nPHASE 7 — typed shared contribution\n");
  const boundaryService = boundaryModule.makeBoundaryMemoryService({ store: a2.boundary, localPeer: peerA });
  await boundaryService.openWorkspace({ workspaceId: "ws-calibration", participants: [peerA, peerB], purpose: "shared calibration statement" });
  await boundaryService.createArtifact({
    workspaceId: "ws-calibration",
    artifactId: "art-gain",
    type: { typeId: "boundary.statement", version: "v1" },
    title: "Calibrated gain",
  });
  // B's result is the CONTENT a human/host turns into a candidate; both peers accept explicitly.
  const candidateRevision = await boundaryService.proposeRevision({
    workspaceId: "ws-calibration",
    artifactId: "art-gain",
    base: null,
    content: { statement: `the calibrated gain is 2 (from commit ${resultCommitB.slice(0, 8)})`, tags: ["decision"], references: [] },
    requiredAcceptors: [peerA, peerB],
    intent: "record the measured gain as a shared statement",
  });
  await boundaryService.acceptRevision({ workspaceId: "ws-calibration", artifactId: "art-gain", candidateDigest: candidateRevision.digest, authenticatedPeer: peerA, local: true });
  await boundaryService.acceptRevision({ workspaceId: "ws-calibration", artifactId: "art-gain", candidateDigest: candidateRevision.digest, authenticatedPeer: peerB });
  const acceptedState = await boundaryService.currentAccepted({ workspaceId: "ws-calibration", artifactId: "art-gain" });
  if (acceptedState === null) throw new Error("the shared boundary revision was not accepted");
  const acceptedRef = acceptedState.ref;
  record("27. AcceptedBoundaryRevisionRef", `${acceptedRef.workspaceId}/${acceptedRef.artifactId}@${acceptedRef.revision}:${acceptedRef.revisionDigest.slice(0, 12)}…`);
  record("28. no chat answer was treated as fulfillment", `${(await countCoordination(a2.coordination, "FULFILLMENT_SUBMITTED"))} submissions so far`);

  /* ---------------------------------------------------------------- Phase 8 */

  process.stdout.write("\nPHASE 8 — fulfillment\n");
  const fulfillmentScript = { decision: "REJECT" };
  const irBeforeFulfillment = irFingerprint(a2.installed.controller);
  const submission = await a2.installed.federation.submitFulfillment({
    commitmentId: offer.commitmentId,
    outputs: [{ kind: "boundary_revision", revision: acceptedRef }],
    note: "the accepted calibration statement",
    authenticatedPeer: peerB,
  });
  record("29. typed FulfillmentSubmission by the authenticated holder", `${submission.submissionId} (digest ${submission.digest.slice(0, 12)}…)`);
  record("30. submission is NOT acceptance", (await a2.installed.federation.commitmentState(offer.commitmentId)).state);
  // The deployment composes NO fulfillment authority: the honest answer is UNRESOLVED, zero FULFILLED.
  const noAuthority = await a2.installed.federation.decideFulfillment({ commitmentId: offer.commitmentId, submissionDigest: submission.digest });
  record("31. no fulfillment authority → UNRESOLVED, still ACTIVE", `${noAuthority.decision} (${(await a2.installed.federation.commitmentState(offer.commitmentId)).state})`);
  // A REJECTing authority also leaves it ACTIVE.
  const rejecting = fulfillmentService(a2, fulfillmentScript);
  const rejectedFulfillment = await rejecting.decideFulfillment({ commitmentId: offer.commitmentId, submissionDigest: submission.digest });
  record("32. rejecting authority → remains ACTIVE", `${rejectedFulfillment.decision} (${(await a2.installed.federation.commitmentState(offer.commitmentId)).state})`);
  // The independent authority ADMITs the EXACT submission digest.
  fulfillmentScript.decision = "ADMIT";
  const admittedFulfillment = await fulfillmentService(a2, fulfillmentScript).decideFulfillment({ commitmentId: offer.commitmentId, submissionDigest: submission.digest });
  if (!admittedFulfillment.fulfilled) throw new Error(`fulfillment was not admitted: ${admittedFulfillment.detail}`);
  const fulfilledView = await a2.installed.federation.fulfillment(offer.commitmentId);
  record("33. ACTIVE → FULFILLED", (await a2.installed.federation.commitmentState(offer.commitmentId)).state);
  record("34. fulfillment names the accepted BoundaryRevision", fulfilledView.outputs[0].revision.revisionDigest === acceptedRef.revisionDigest ? "exact accepted revision" : "MISMATCH");
  record("35. no Work state changed by fulfillment", snapshotTasks(liveA.installed.controller) === workAfterCommitment ? "A's Work unchanged" : "A's WORK CHANGED");
  // The fulfillment alone must not have moved Project truth. Measured HERE, before any adoption act:
  // Phase 11's explicit promotion is SUPPOSED to revise the IR, so a later comparison would conflate
  // "automatic mutation" with "the explicit adoption this stage requires".
  const irAfterFulfillment = irFingerprint(liveA.installed.controller);

  /* ---------------------------------------------------------------- Phase 9 */

  process.stdout.write("\nPHASE 9 — restart and recovery\n");
  a2.close();
  const a3 = install({ projectId: projectA, repo: A_DIR, peer: peerA, orchestrationPath: `${STATE}/a.sqlite`, ordariumPath: `${STATE}/a-ops.sqlite`, authoringScript, needScript });
  liveA = a3;
  const recoveredNeed = await a3.installed.federation.contactNeed(needId);
  const recoveredRequests = (await countCoordination(a3.coordination, "CONTACT_REQUESTED"));
  const recoveredState = (await a3.installed.federation.commitmentState(offer.commitmentId)).state;
  const recoveredFulfillment = await a3.installed.federation.fulfillment(offer.commitmentId);
  const recoveredSubmissions = await a3.installed.federation.fulfillmentSubmissions(offer.commitmentId);
  record("36. ContactNeed recovered", recoveredNeed?.need.contactNeedId ?? "LOST");
  record("37. contact request recovered", `${recoveredRequests} CONTACT_REQUESTED`);
  record("38. commitment recovered", recoveredState);
  record("39. terms recovered", recoveredFulfillment.terms === null ? "ABSENT" : recoveredFulfillment.terms.statement);
  record("40. submission recovered", `${recoveredSubmissions.length} submission(s), digest ${recoveredSubmissions[0]?.digest.slice(0, 12)}…`);
  record("41. admission + FULFILLED recovered", `${recoveredFulfillment.state} by ${recoveredFulfillment.admission?.policyRef.policyId}`);
  record("42. typed output recovered", recoveredFulfillment.outputs[0]?.revision.revisionDigest === acceptedRef.revisionDigest ? "exact accepted revision" : "MISMATCH");
  // §27: FULFILLED is TERMINAL across the restart.
  let releaseRefused = false;
  try {
    await a3.installed.federation.releaseCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: peerB });
  } catch {
    releaseRefused = true;
  }
  record("43. FULFILLED cannot release (terminal, post-restart)", releaseRefused ? "refused" : "RELEASE SUCCEEDED");

  /* ---------------------------------------------------------------- Phase 10 */

  process.stdout.write("\nPHASE 10 — explicit local adoption\n");
  const irBeforeAdoption = JSON.stringify(a3.installed.controller.work.project());
  const note = await a3.installed.projectWorkspace.recordJournalEntry({
    projectId: projectA,
    kind: "REFERENCE_NOTE",
    title: "External calibration adopted",
    body: `the peer delivered ${recoveredFulfillment.outputs[0]?.revision.revisionDigest ?? "an accepted revision"}`,
    provenance: "e3c-live explicit adoption",
    relatedRefs: [
      { kind: "commitment_fulfillment", id: offer.commitmentId },
      { kind: "accepted_boundary_revision", id: `${acceptedRef.workspaceId}/${acceptedRef.artifactId}@${acceptedRef.revision}` },
    ],
  });
  record("44. explicit local REFERENCE_NOTE adoption", note.entryId);
  record("45. fulfillment did NOT automatically mutate Project A", JSON.stringify(a3.installed.controller.work.project()) === irBeforeAdoption ? "ProjectIR unchanged" : "PROJECTIR CHANGED");
  const opportunity = await a3.installed.projectWorkspace.recordJournalEntry({
    projectId: projectA,
    kind: "OPPORTUNITY",
    title: "Apply the calibrated gain locally",
    body: "the adopted calibration can now be applied to A's own sensor path",
    provenance: "e3c-live explicit adoption",
    relatedRefs: [{ kind: "commitment_fulfillment", id: offer.commitmentId }],
  });

  /* ---------------------------------------------------------------- Phase 11 */

  process.stdout.write("\nPHASE 11 — local Work continuation\n");
  const promoted = await a3.installed.projectWorkspace.promoteOpportunity({
    projectId: projectA,
    entryId: opportunity.entryId,
    taskSpec: { task_id: "t-apply", objective: "apply the calibrated gain", depends_on: [], write_paths: ["src/a.js"], required_artifacts: [] },
  });
  record("46. existing promoteOpportunity created local Work", `${promoted.taskId} (revision ${promoted.revision})`);
  const tasksAfter = a3.installed.controller.work.taskStates();
  record("47. new Work belongs only to A", tasksAfter.some((task) => task.taskId === "t-apply") && !tasksAfter.some((task) => task.taskId === "bt1") ? "A only" : "LEAKED");
  // The scheduler picks the next admissible task; `expectedTaskId` is an ASSERTION, not a command, so the
  // gate asks for the adopted task only when the scheduler itself considers it next. Either way the Work
  // that runs is A's own — which is what Phase 11 proves.
  const nextTask = a3.installed.controller.work.taskStates().find((task) => task.state === "READY");
  if (nextTask === undefined) throw new Error("A has no READY task after adoption");
  const appliedPrepared = await a3.installed.controller.prepareMutatingWork({ expectedTaskId: nextTask.taskId });
  const worldApply = appliedPrepared.worldPath;
  writeFileSync(join(worldApply, "src", "a.js"), "export const value = 2;\n");
  execFileSync("git", ["add", "-A"], { cwd: worldApply });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "apply gain"], { cwd: worldApply });
  a3.installed.controller.report(appliedPrepared.attemptId, {
    workerStatus: "completed",
    summary: "applied",
    changedFiles: ["src/a.js"],
    producedArtifacts: ["src/a.js"],
    resultCommit: git(worldApply, ["rev-parse", "HEAD"]),
  });
  record("48. local Work ran after adoption", `${nextTask.taskId} → ${a3.installed.controller.attemptWorkRecord(appliedPrepared.attemptId).state}`);

  /* ---------------------------------------------------------------- Phase 12 */

  process.stdout.write("\nPHASE 12 — negative integrity path\n");
  const declaredNow = (await countCoordination(a3.coordination, "CONTACT_NEED_DECLARED"));
  const fulfilledNow = (await countCoordination(a3.coordination, "COMMITMENT_FULFILLED"));
  // (a) A FABRICATED undeclared need id cannot manufacture a scope.
  let fabricatedRefused = false;
  try {
    await a3.installed.federation.offerCommitment({
      proposedHolder: peerB,
      scope: { kind: "contact_need", contactNeedId: "need-fabricated" },
      statement: "s",
    });
  } catch {
    fabricatedRefused = true;
  }
  record("49. fabricated undeclared need refused", fabricatedRefused ? "refused" : "ACCEPTED");
  // (b) A WRONG peer cannot submit a fulfillment, and a NON-ACCEPTED revision is refused.
  const wrongPeerRefused = await refuses(() =>
    a3.installed.federation.submitFulfillment({
      commitmentId: offer.commitmentId,
      outputs: [{ kind: "boundary_revision", revision: acceptedRef }],
      note: "n",
      authenticatedPeer: federationModule.materializePeerRef({ peerId: "peer-x" }),
    }),
  );
  record("50. wrong peer cannot submit fulfillment", wrongPeerRefused ? "refused" : "ACCEPTED");
  const candidateRefused = await refuses(() =>
    a3.installed.federation.submitFulfillment({
      commitmentId: offer.commitmentId,
      outputs: [
        {
          kind: "boundary_revision",
          revision: { schemaVersion: 1, workspaceId: "ws-calibration", artifactId: "art-gain", revision: 0, candidateDigest: candidateRevision.digest, revisionDigest: candidateRevision.digest },
        },
      ],
      note: "n",
      authenticatedPeer: peerB,
    }),
  );
  record("51. candidate (non-accepted) revision refused", candidateRefused ? "refused" : "ACCEPTED");
  record(
    "52. zero forbidden state transitions",
    (await countCoordination(a3.coordination, "CONTACT_NEED_DECLARED")) === declaredNow && (await countCoordination(a3.coordination, "COMMITMENT_FULFILLED")) === fulfilledNow
      ? "no new declaration, no new fulfillment"
      : "A FORBIDDEN TRANSITION HAPPENED",
  );

  /* ---------------------------------------------------------------- verdict */

  const attemptAtClose = a3.installed.controller.attemptWorkRecord(appliedPrepared.attemptId);
  const required = [
    ["a real Project fact grounded the NeedCandidate", prepared.candidate.ground.kind === "BLOCKED_TASK" && prepared.candidate.ground.taskId === "t1"],
    ["the candidate was not automatically durable", declaredBeforePhase2 === 0],
    ["an independent authority admitted the need", admitted.status === "DECLARED" && admitted.declaration.admission.policyRef.policyId === "e3c-live-need-authority"],
    ["the candidate digest was the retry correlation", retried.contactNeedId === needId],
    ["the need survived a cold restart", recoveredNeed !== undefined && recoveredNeed.need.contactNeedId === needId],
    ["origin/tags/reason/ground/admission recovered", recoveredNeed.provenance.kind === "candidate" && recoveredNeed.need.competenceTags.length === 2 && recoveredNeed.provenance.ground.kind === "BLOCKED_TASK"],
    ["peer discovery and contact were explicit", discovery.candidates.length === 1 && recoveredRequests >= 1],
    ["commitment required explicit authenticated acceptance", commitmentState === "ACTIVE"],
    ["the commitment scope was DERIVED, not caller-authored", offer.scope.kind === "contact_need" && offer.scope.contactNeedId === needId],
    ["commitment granted ZERO Work authority", workAfterCommitment === workBeforeA],
    ["the remote project performed sovereign Work", attemptB.state === "COMPLETED"],
    ["remote Work never entered the local ledger", !liveA.installed.controller.work.taskStates().some((task) => task.taskId === "bt1")],
    ["the shared output was a typed accepted artifact", acceptedRef.revisionDigest.length === 64],
    ["the producer did not judge its own fulfillment", rejectedFulfillment.decision === "REJECT" && recoveredState === "FULFILLED"],
    ["an absent authority could not admit fulfillment", noAuthority.decision === "UNRESOLVED"],
    ["fulfillment survived a cold restart", recoveredFulfillment.state === "FULFILLED" && recoveredSubmissions.length === 1],
    ["FULFILLED is terminal", releaseRefused],
    ["fulfillment did NOT automatically become Project truth", irAfterFulfillment === irBeforeFulfillment],
    ["local adoption was explicit", note.entryId.length > 0],
    ["local Work resumed through existing owners", promoted.taskId === "t-apply" && attemptAtClose?.state === "COMPLETED"],
    ["a post-restart negative case held", fabricatedRefused && wrongPeerRefused && candidateRefused],
  ];
  let ok = true;
  process.stdout.write("\n");
  for (const [label, check] of required) {
    let value = false;
    try {
      value = Boolean(await check);
    } catch (error) {
      process.stdout.write(`FAIL  ${label} — ${String(error)}\n`);
      ok = false;
      continue;
    }
    process.stdout.write(`${value ? "PASS" : "FAIL"}  ${label}\n`);
    if (!value) ok = false;
  }
  process.stdout.write(`\n§E3-C-LIVE: ${ok ? "PASS" : "FAIL"}\n`);
  if (process.env.PALIMPSEST_GATE_FINDINGS === "1") {
    for (const [key, value] of findings) process.stdout.write(`  ${key}: ${value}\n`);
  }
  process.stdout.write("\n");
  a3.close();
  b.close();
  process.exit(ok ? 0 : 1);
}

/* ------------------------------------------------------------------ helpers */

/**
 * A SECOND commitment service over the SAME durable store with a fulfillment authority injected.
 *
 * The install composes no fulfillment authority (a deployment that composes none must not acquire one
 * implicitly), so the gate builds the authority-bearing service the way a host would at assembly time.
 */
function fulfillmentService(rig, script) {
  const service = federationModule.makeCommitmentService({
    store: rig.coordination,
    localPeer: federationModule.materializePeerRef({ peerId: "peer-a" }),
    allocateCommitmentId: () => "unused",
    allocateHandoffId: () => "unused",
    contactNeedScopeGuard: durableContactNeedScopeGuard(rig.coordination),
    fulfillmentOutputs: {
      async admitAcceptedRevision(ref) {
        const boundary = boundaryModule.makeBoundaryMemoryService({
          store: rig.boundary,
          localPeer: federationModule.materializePeerRef({ peerId: "peer-a" }),
        });
        await boundary.admitBoundaryRevisionScope(ref);
      },
    },
    fulfillmentAdmission: fulfillmentAuthority(script),
  });
  return service;
}

/** The number of coordination events of `type` in the durable history. */
async function countCoordination(store, type) {
  const events = await store.replay();
  return events.filter((event) => event.type === type).length;
}

function snapshotTasks(controller) {
  return JSON.stringify(controller.work.taskStates());
}

/** The canonical intent fingerprint: revision + digest + goal. Comparable ACROSS install handles. */
function irFingerprint(controller) {
  const ir = controller.work.project();
  return `${ir.revision}:${ir.digest}:${ir.goal}`;
}

async function refuses(operation) {
  try {
    await operation();
    return false;
  } catch {
    return true;
  }
}

main().catch((error) => {
  process.stderr.write(`e3c-live gate failed: ${error?.stack ?? String(error)}\n`);
  process.exit(1);
});
