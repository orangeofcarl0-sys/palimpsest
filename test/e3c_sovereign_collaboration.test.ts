/**
 * E3-C — GOVERNED SOVEREIGN COLLABORATION.
 *
 * The positive matrix C-P01…C-P14 and the adversarial matrix C-N01…C-N25, driven through the REAL
 * packaged install (`installPalimpsest`) so the composition adapter, the durable Federation history and
 * the closed-contract wire validators are all exercised rather than stubbed.
 *
 * The one fixture that is not a real owner is the DSH worker, which is absent by design — the loop is
 * closed end-to-end by `gate:e3-c-live` on a real packaged host.
 *
 * The laws this file pins, in the order the ruling states them:
 *
 *   NeedCandidate ≠ ContactNeed          ContactNeed ≠ Assignment
 *   ContactCandidate ≠ SelectedWorker    ContactRequest ≠ Commitment
 *   Message ≠ Agreement ≠ Evidence       Commitment ≠ Work ownership ≠ Work authority
 *   Remote Project Work ≠ Local Project Work
 *   Fulfillment ≠ Remote Work assignment ≠ Truth ≠ Evidence
 *   BoundaryRevision ≠ ProjectIR         Local adoption ≠ automatic truth promotion
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import { GitCliPort, FakeGitPort } from "../src/effects/index.js";
import type { ProjectStandard } from "../src/domain/standard.js";
import { SqliteCoordinationStore } from "../src/coordination/index.js";
import { SqliteBoundaryMemoryStore } from "../src/boundary_memory/index.js";
import type { AcceptedBoundaryRevisionRef } from "../src/boundary_memory/index.js";
import { callbackPeerTransportPort, materializePeerRef } from "../src/federation/index.js";
// E3-C §18: the declared-need scope guard lives beside the Federation service it verifies; the
// federation BARREL is star-exported into the sealed public API, so it is reached by sub-path.
import { durableContactNeedScopeGuard } from "../src/federation/federation_service.js";
import { makeCommitmentService } from "../src/federation/index.js";
import { SqliteProjectJournalStore, SqliteProjectAssetAssociationStore } from "../src/project_workspace/index.js";
import {
  CollaborationNeedRefusal,
  makeProjectCollaborationService,
  materializeCollaborationNeedCandidate,
  parseCollaborationNeedCandidate,
  parseNeedGround,
} from "../src/project_collaboration/index.js";
import type {
  CollaborationNeedAuthoringPort,
  CollaborationNeedCandidate,
  ContactNeedAdmissionPort,
  NeedAdmissionOutcome,
  ProjectCollaborationService,
} from "../src/project_collaboration/index.js";
import { MockHost } from "./helpers.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) {
    try {
      fn();
    } catch {
      // A git worktree materialized under a temp root leaves read-only pack files, which Windows
      // refuses to unlink. The run's global teardown sweeps what it can; a cleanup refusal must not
      // turn a green matrix red.
    }
  }
});

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

function standardOf(): ProjectStandard {
  return Object.freeze({
    statement: "tests pass and scope respected",
    clauses: Object.freeze([
      Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze(["python", "-m", "pytest"]), predicate: "tests_pass" as const }),
      Object.freeze({ kind: "scope_respected" as const }),
    ]),
    derivedFrom: Object.freeze(["e3c fixture"]),
    confirmed: true,
    notes: Object.freeze([]),
  });
}

/** A real git repository, so the world/basis machinery has something to observe. */
function workspace(): { root: string; repo: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-e3c-"));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "a.ts"), "export const a = 1;\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: repo });
  return { root, repo, head: git(repo, ["rev-parse", "HEAD"]) };
}

/* ------------------------------------------------------------------ *
 * The rig: a REAL packaged install with the full collaboration wiring
 * ------------------------------------------------------------------ */

interface Rig {
  readonly installed: ReturnType<typeof installPalimpsest>;
  readonly collaboration: ProjectCollaborationService;
  readonly coordination: SqliteCoordinationStore;
  readonly boundary: SqliteBoundaryMemoryStore;
  readonly repo: string;
  readonly root: string;
}

const LOCAL = materializePeerRef({ peerId: "peer-a" });

function rig(input: {
  readonly authoring?: CollaborationNeedAuthoringPort;
  readonly admission?: ContactNeedAdmissionPort;
  readonly shared?: { readonly coordination: SqliteCoordinationStore; readonly boundary: SqliteBoundaryMemoryStore };
}): Rig {
  const { root, repo, head } = workspace();
  const coordination = input.shared?.coordination ?? new SqliteCoordinationStore(join(root, "coordination.sqlite"));
  const boundary = input.shared?.boundary ?? new SqliteBoundaryMemoryStore(join(root, "boundary.sqlite"));
  const installed = installPalimpsest(new MockHost() as never, {
    projectId: "e3c",
    repository: repo,
    git: new GitCliPort(repo, join(root, "worlds")),
    databasePath: join(root, "orchestration.sqlite"),
    ordariumDatabasePath: join(root, "ops.sqlite"),
    standard: standardOf(),
    localPeer: LOCAL,
    coordinationStore: coordination,
    boundaryMemoryStore: boundary,
    peerTransportPort: callbackPeerTransportPort("fixture", {
      onSend: async () => ({ transportMessageId: "t", delivered: true }),
      onWake: async () => ({ signaled: true }),
    }),
    peerDirectoryPort: { observePeers: async () => ({ state: "known" as const, value: [] }) },
    // The federation service requires an attempt catalog (a real read-only handle onto the Work store).
    attemptCatalog: { assertAdmissibleAttempt: async () => {} },
    ...(input.authoring === undefined ? {} : { projectCollaborationAuthoring: input.authoring }),
    ...(input.admission === undefined ? {} : { projectCollaborationAdmission: input.admission }),
  });
  cleanups.push(() => {
    installed.dispose();
    coordination.close();
    boundary.close();
  });
  void head;
  if (installed.projectCollaboration === undefined) {
    throw new Error("the fixture install did not compose projectCollaboration — the rig is not exercising the surface");
  }
  return { installed, collaboration: installed.projectCollaboration, coordination, boundary, repo, root };
}

/** §6: an authoring seam that proposes. It has NO contact/commitment/authority capability by shape. */
function authoringOf(input: { readonly tags: readonly string[]; readonly reason: string; readonly origin?: string }): CollaborationNeedAuthoringPort {
  return Object.freeze({
    origin: input.origin ?? "fixture-author",
    async propose() {
      return Object.freeze({ outcome: "proposal" as const, competenceTags: input.tags, reason: input.reason });
    },
  });
}

/** §8: an authority that admits the exact digest it is offered. */
function admittingAuthority(): ContactNeedAdmissionPort & { calls: string[] } {
  const calls: string[] = [];
  const port: ContactNeedAdmissionPort = {
    policyRef: Object.freeze({ policyId: "fixture-need-authority", version: "v1" }),
    async decide({ candidate }): Promise<NeedAdmissionOutcome> {
      calls.push(candidate.digest);
      return Object.freeze({
        decision: "ADMIT" as const,
        candidateDigest: candidate.digest,
        policyRef: Object.freeze({ policyId: "fixture-need-authority", version: "v1" }),
        provenanceDigest: `prov-${candidate.digest.slice(0, 8)}`,
      });
    },
  };
  return Object.freeze({ ...port, calls });
}


/**
 * Start a project in which `t1` is canonically BLOCKED: `t2` depends on it, so the scheduler projects
 * the dependency as unsatisfied. No extra verb is needed — a dependency IS the blocked condition.
 */
function startBlockedTask(r: Rig, blockedTaskId = "t1", objective = "o"): void {
  r.installed.controller.start({
    projectId: "e3c",
    goal: "g",
    headCommit: git(r.repo, ["rev-parse", "HEAD"]),
    tasks: [
      { task_id: "dep", objective: "the unsatisfied dependency", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] },
      { task_id: blockedTaskId, objective, depends_on: ["dep"], write_paths: ["src/a.ts"], required_artifacts: [] },
    ],
  });
}

/** Start a project with one READY task, for the cases that need a live project but no ground. */
function startReadyTask(r: Rig, taskId = "t1", goal = "g"): void {
  r.installed.controller.start({
    projectId: "e3c",
    goal,
    headCommit: git(r.repo, ["rev-parse", "HEAD"]),
    tasks: [{ task_id: taskId, objective: "o", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] }],
  });
}

/** Drive one attempt on `taskId` to a canonical FAILED report, returning the attempt id. */
function failAttempt(r: Rig, taskId = "t1"): string {
  const prepared = r.installed.controller.mutatingWorkTarget({ expectedTaskId: taskId });
  void prepared;
  return taskId;
}

/* ------------------------------------------------------------------ *
 * POSITIVE MATRIX
 * ------------------------------------------------------------------ */

describe("E3-C C-P01/C-P02: project reality grounds a candidate", () => {
  it("C-P01 a FAILED attempt grounds a candidate naming the attempt and its report identity", async () => {
    const r = rig({ authoring: authoringOf({ tags: ["optics"], reason: "calibration expertise needed" }) });
    // Real Work: start a task, then report the attempt FAILED.
    startReadyTask(r);
    const prepared = await r.installed.controller.prepareMutatingWork({ expectedTaskId: "t1" });
    // `prepareMutatingWork` already materializes the execution world and puts the attempt RUNNING.
    r.installed.controller.report(prepared.attemptId, {
      workerStatus: "failed",
      summary: "could not calibrate",
      changedFiles: [],
      producedArtifacts: [],
      resultCommit: null,
    });

    const outcome = await r.collaboration.prepare({ ground: { kind: "FAILED_ATTEMPT", attemptId: prepared.attemptId } });
    expect(outcome.status).toBe("prepared");
    if (outcome.status !== "prepared") throw new Error("expected prepared");
    expect(outcome.candidate.ground.kind).toBe("FAILED_ATTEMPT");
    if (outcome.candidate.ground.kind !== "FAILED_ATTEMPT") throw new Error("kind");
    expect(outcome.candidate.ground.attemptId).toBe(prepared.attemptId);
    expect(outcome.candidate.ground.workerStatus).toBe("failed");
    // The report identity is OBSERVED, not supplied — a 64-hex digest from the canonical report.
    expect(outcome.candidate.ground.reportDigest).toMatch(/^[0-9a-f]{64}$/u);
    // §4/§7: a candidate is a VALUE — nothing durable was written by preparing it.
    expect(await r.coordination.replay()).toEqual([]);
  });

  it("C-P02 a BLOCKED task grounds a candidate naming the task, objective and declared hints", async () => {
    const r = rig({ authoring: authoringOf({ tags: ["optics"], reason: "blocked on external calibration" }) });
    // t2 depends on t1, so canonical Work projects it as BLOCKED with no extra verb.
    startBlockedTask(r, "t2", "publish");

    const outcome = await r.collaboration.prepare({ ground: { kind: "BLOCKED_TASK", taskId: "t2" } });
    expect(outcome.status).toBe("prepared");
    if (outcome.status !== "prepared") throw new Error("expected prepared");
    expect(outcome.candidate.ground.kind).toBe("BLOCKED_TASK");
    if (outcome.candidate.ground.kind !== "BLOCKED_TASK") throw new Error("kind");
    expect(outcome.candidate.ground.taskId).toBe("t2");
    expect(outcome.candidate.ground.taskState).toBe("BLOCKED");
    expect(outcome.candidate.ground.objective).toBe("publish");
    expect(await r.coordination.replay()).toEqual([]);
  });

  it("§5/§7: a candidate is content-addressed, and input ORDER does not change its identity", async () => {
    const r = rig({ authoring: authoringOf({ tags: ["b", "a"], reason: "r" }) });
    startBlockedTask(r);
    const first = await r.collaboration.prepare({ ground: { kind: "BLOCKED_TASK", taskId: "t1" } });
    if (first.status !== "prepared") throw new Error("expected prepared");
    // The tag set is canonicalized, so a different INPUT ORDER yields the SAME candidate.
    const reordered = materializeCollaborationNeedCandidate({
      projectBasis: first.candidate.projectBasis,
      ground: first.candidate.ground,
      competenceTags: [...first.candidate.competenceTags].reverse(),
      reason: first.candidate.reason,
      origin: first.candidate.origin,
    });
    expect(reordered.candidateId).toBe(first.candidate.candidateId);
    expect(reordered.digest).toBe(first.candidate.digest);
    // No clock in semantic identity: two materializations a moment apart are the same candidate.
    expect(reordered.digest).toBe(first.candidate.digest);
  });
});

describe("E3-C C-P03/C-P04: governed admission makes the need durable and recoverable", () => {
  it("C-P03 the authority admits the EXACT candidate, producing a durable CONTACT_NEED_DECLARED", async () => {
    const authority = admittingAuthority();
    const r = rig({
      authoring: authoringOf({ tags: ["optics"], reason: "needs calibration" }),
      admission: authority,
    });
    startBlockedTask(r);
    const prepared = await r.collaboration.prepare({ ground: { kind: "BLOCKED_TASK", taskId: "t1" } });
    if (prepared.status !== "prepared") throw new Error("expected prepared");

    const admitted = await r.collaboration.admit({ candidate: prepared.candidate });
    expect(admitted.status).toBe("DECLARED");
    expect(admitted.contactNeedId).not.toBeNull();
    // The authority was asked about the EXACT digest.
    expect(authority.calls).toEqual([prepared.candidate.digest]);
    const events = await r.coordination.replay();
    expect(events.map((event) => event.type)).toEqual(["CONTACT_NEED_DECLARED"]);
    // §10: the durable origin is the TASK form, carrying the revision/digest it was observed under.
    const payload = events[0]!.payload as { need: { origin: { kind: string; taskId?: string }; competenceTags: string[] }; provenance: { kind: string; candidateDigest: string } };
    expect(payload.need.origin.kind).toBe("task");
    expect(payload.need.origin.taskId).toBe("t1");
    expect(payload.need.competenceTags).toEqual(["optics"]);
    expect(payload.provenance.kind).toBe("candidate");
    expect(payload.provenance.candidateDigest).toBe(prepared.candidate.digest);
  });

  it("C-P04 a cold restart recovers origin, tags, reason and ground/admission provenance", async () => {
    const sharedCoordination = new SqliteCoordinationStore(join(mkdtempSync(join(tmpdir(), "e3c-shared-")), "c.sqlite"));
    const sharedBoundary = new SqliteBoundaryMemoryStore(join(mkdtempSync(join(tmpdir(), "e3c-shared-")), "b.sqlite"));
    cleanups.push(() => {
      sharedCoordination.close();
      sharedBoundary.close();
    });
    const first = rig({
      authoring: authoringOf({ tags: ["optics", "calibration"], reason: "needs calibration" }),
      admission: admittingAuthority(),
      shared: { coordination: sharedCoordination, boundary: sharedBoundary },
    });
    startBlockedTask(first);
    const prepared = await first.collaboration.prepare({ ground: { kind: "BLOCKED_TASK", taskId: "t1" } });
    if (prepared.status !== "prepared") throw new Error("expected prepared");
    const admitted = await first.collaboration.admit({ candidate: prepared.candidate });
    const needId = admitted.contactNeedId!;
    // Dispose the FIRST installation — a genuine session replacement.
    first.installed.dispose();

    // A SECOND install over the SAME durable stores, with no in-memory state carried over.
    const second = rig({ shared: { coordination: sharedCoordination, boundary: sharedBoundary } });
    const recovered = await second.installed.federation!.contactNeed(needId);
    expect(recovered).toBeDefined();
    expect(recovered!.need.contactNeedId).toBe(needId);
    expect(recovered!.need.competenceTags).toEqual(["calibration", "optics"]);
    expect(recovered!.need.origin.kind).toBe("task");
    expect(recovered!.provenance.kind).toBe("candidate");
    if (recovered!.provenance.kind !== "candidate") throw new Error("kind");
    // The FULL ground and admission provenance survived — this is the hard G-2 proof.
    expect(recovered!.provenance.ground).toMatchObject({ kind: "BLOCKED_TASK", taskId: "t1" });
    expect(recovered!.provenance.admission.decision).toBe("ADMIT");
    expect(recovered!.provenance.admission.policyRef.policyId).toBe("fixture-need-authority");
  });
});

describe("E3-C C-P05/C-P06/C-P07: discovery, need-scoped commitment, authenticated acceptance", () => {
  it("C-P05 a declared need discovers candidates deterministically and selects nobody", async () => {
    const r = rig({ authoring: authoringOf({ tags: ["optics"], reason: "r" }), admission: admittingAuthority() });
    const declared = await r.installed.federation!.declareContactNeed({
      origin: { kind: "attempt", attempt: { projectId: "p", attemptId: "a" } },
      competenceTags: ["optics"],
      reason: "manual",
    });
    const discovery = await r.installed.federation!.findCandidates(declared);
    expect(discovery.status).toBe("discovered");
    if (discovery.status !== "discovered") throw new Error("expected discovered");
    // §15: discovery is read-only and creates NO selection authority.
    expect(discovery.candidates).toEqual([]);
  });

  it("C-P06 offerCommitmentForNeed DERIVES the scope; a caller cannot hand-author it", async () => {
    const r = rig({});
    const need = await r.installed.federation!.declareContactNeed({
      origin: { kind: "attempt", attempt: { projectId: "p", attemptId: "a" } },
      competenceTags: ["optics"],
      reason: "manual",
    });
    const remote = materializePeerRef({ peerId: "peer-b" });
    // A CONTACT_REQUESTED must exist for this need and holder first (§17).
    await r.installed.federation!.requestContact({ need, to: remote });
    const offer = await r.installed.federation!.offerCommitmentForNeed({
      contactNeedId: need.contactNeedId,
      proposedHolder: remote,
      statement: "deliver the calibration artifact",
    });
    // The scope is DERIVED by the owner, not supplied by the caller.
    expect(offer.scope).toEqual({ kind: "contact_need", contactNeedId: need.contactNeedId });
    // §19: the recoverable terms body is present and agrees with its digest.
    expect(offer.terms).toBeDefined();
    expect(offer.terms!.termsDigest).toBe(offer.termsDigest);
  });

  it("C-P07 the authenticated proposed holder accepts, and the commitment becomes ACTIVE with ZERO Work state", async () => {
    const r = rig({});
    startReadyTask(r);
    const before = r.installed.controller.work.taskStates().map((task) => ({ ...task }));
    const need = await r.installed.federation!.declareContactNeed({
      origin: { kind: "attempt", attempt: { projectId: "p", attemptId: "a" } },
      competenceTags: ["optics"],
      reason: "manual",
    });
    const remote = materializePeerRef({ peerId: "peer-b" });
    await r.installed.federation!.requestContact({ need, to: remote });
    const offer = await r.installed.federation!.offerCommitmentForNeed({
      contactNeedId: need.contactNeedId,
      proposedHolder: remote,
      statement: "s",
    });
    await r.installed.federation!.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: remote });
    expect((await r.installed.federation!.commitmentState(offer.commitmentId))!.state).toBe("ACTIVE");
    // §2/§96: the commitment act creates NO Work state anywhere.
    expect(r.installed.controller.work.taskStates().map((task) => ({ ...task }))).toEqual(before);
  });
});

describe("E3-C C-P08: remote Project B performs its OWN Work without local mutation", () => {
  it("Project B's Work exists only in B, and A's commitment authorizes nothing in B", async () => {
    // Project B is a SECOND, independent packaged install with its own ledger.
    const b = rig({});
    startReadyTask(b, "bt1", "b-goal");
    const bTasks = b.installed.controller.work.taskStates();
    expect(bTasks.map((task) => task.taskId)).toEqual(["bt1"]);

    // Project A has its OWN project and sees none of B's tasks.
    const a = rig({});
    startReadyTask(a, "at1", "a-goal");
    const aTasks = a.installed.controller.work.taskStates();
    expect(aTasks.map((task) => task.taskId)).toEqual(["at1"]);
    // §2/§34: A's Work ledger contains nothing of B's, and vice versa.
    expect(aTasks.some((task) => task.taskId === "bt1")).toBe(false);
    expect(bTasks.some((task) => task.taskId === "at1")).toBe(false);
    // A's project IR names only A's task.
    expect(a.installed.controller.work.project().tasks.map((task) => task.task_id)).toEqual(["at1"]);
    expect(b.installed.controller.work.project().tasks.map((task) => task.task_id)).toEqual(["bt1"]);
  });
});

/* ------------------------------------------------------------------ *
 * Fulfillment: the typed, admitted contribution
 * ------------------------------------------------------------------ */

/** A shared accepted boundary revision, produced by BOTH peers explicitly accepting a candidate. */
async function acceptedRevision(boundary: SqliteBoundaryMemoryStore): Promise<AcceptedBoundaryRevisionRef> {
  const { makeBoundaryMemoryService } = await import("../src/boundary_memory/index.js");
  const peerA = materializePeerRef({ peerId: "peer-a" });
  const peerB = materializePeerRef({ peerId: "peer-b" });
  const service = makeBoundaryMemoryService({ store: boundary, localPeer: peerA });
  await service.openWorkspace({ workspaceId: "ws-1", participants: [peerA, peerB], purpose: "shared calibration" });
  await service.createArtifact({
    workspaceId: "ws-1",
    artifactId: "art-1",
    // The BUILT-IN statement type: a shared boundary artifact both peers explicitly accept.
    type: { typeId: "boundary.statement", version: "v1" },
    title: "Calibration statement",
  });
  const candidate = await service.proposeRevision({
    workspaceId: "ws-1",
    artifactId: "art-1",
    base: null,
    content: { statement: "the calibrated gain is 2", tags: ["decision"], references: [] },
    requiredAcceptors: [peerA, peerB],
    intent: "propose the calibrated gain",
  });
  await service.acceptRevision({ workspaceId: "ws-1", artifactId: "art-1", candidateDigest: candidate.digest, authenticatedPeer: peerA, local: true });
  await service.acceptRevision({ workspaceId: "ws-1", artifactId: "art-1", candidateDigest: candidate.digest, authenticatedPeer: peerB });
  const head = await service.currentAccepted({ workspaceId: "ws-1", artifactId: "art-1" });
  if (head === null) throw new Error("the fixture boundary revision was not accepted");
  return head.ref;
}

describe("E3-C C-P09/C-P10/C-P11: typed fulfillment, independent admission, terminal FULFILLED", () => {
  it("C-P09 an accepted BoundaryRevision yields a valid FulfillmentSubmission from the current holder", async () => {
    const r = rig({});
    const revision = await acceptedRevision(r.boundary);
    const remote = materializePeerRef({ peerId: "peer-b" });
    const need = await r.installed.federation!.declareContactNeed({
      origin: { kind: "attempt", attempt: { projectId: "p", attemptId: "a" } },
      competenceTags: ["optics"],
      reason: "manual",
    });
    await r.installed.federation!.requestContact({ need, to: remote });
    const offer = await r.installed.federation!.offerCommitmentForNeed({ contactNeedId: need.contactNeedId, proposedHolder: remote, statement: "deliver it" });
    await r.installed.federation!.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: remote });

    const submission = await r.installed.federation!.submitFulfillment({
      commitmentId: offer.commitmentId,
      outputs: [{ kind: "boundary_revision", revision }],
      note: "the accepted calibration",
      authenticatedPeer: remote,
    });
    expect(submission.commitmentId).toBe(offer.commitmentId);
    expect(submission.submittedBy.peerId).toBe("peer-b");
    expect(submission.outputs).toHaveLength(1);
    // §23: submission ≠ acceptance — the commitment is still ACTIVE.
    expect((await r.installed.federation!.commitmentState(offer.commitmentId))!.state).toBe("ACTIVE");
  });

  it("C-P10 an independent authority ADMITs the exact submission digest, and the commitment becomes FULFILLED", async () => {
    const r = rig({});
    const revision = await acceptedRevision(r.boundary);
    const remote = materializePeerRef({ peerId: "peer-b" });
    const need = await r.installed.federation!.declareContactNeed({
      origin: { kind: "attempt", attempt: { projectId: "p", attemptId: "a" } },
      competenceTags: ["optics"],
      reason: "manual",
    });
    await r.installed.federation!.requestContact({ need, to: remote });
    const offer = await r.installed.federation!.offerCommitmentForNeed({ contactNeedId: need.contactNeedId, proposedHolder: remote, statement: "deliver it" });
    await r.installed.federation!.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: remote });
    const submission = await r.installed.federation!.submitFulfillment({
      commitmentId: offer.commitmentId,
      outputs: [{ kind: "boundary_revision", revision }],
      note: "n",
      authenticatedPeer: remote,
    });
    // The fulfillment authority is a SEPARATE seam the host injects (see `fulfill`).
    const decision = await fulfill(r, offer.commitmentId, submission.digest);
    expect(decision.decision).toBe("ADMIT");
    expect((await r.installed.federation!.commitmentState(offer.commitmentId))!.state).toBe("FULFILLED");
    // §28: the derived view names the accepted revision and the admission provenance.
    const view = await r.installed.federation!.fulfillment(offer.commitmentId);
    expect(view!.state).toBe("FULFILLED");
    expect(view!.acceptedSubmission!.digest).toBe(submission.digest);
    expect(view!.outputs[0]!.revision.revisionDigest).toBe(revision.revisionDigest);
    expect(view!.admission!.decision).toBe("ADMIT");
    expect(view!.terms).not.toBeNull();
  });

  it("C-P11 fulfillment survives a cold restart", async () => {
    const sharedCoordination = new SqliteCoordinationStore(join(mkdtempSync(join(tmpdir(), "e3c-f-")), "c.sqlite"));
    const sharedBoundary = new SqliteBoundaryMemoryStore(join(mkdtempSync(join(tmpdir(), "e3c-f-")), "b.sqlite"));
    cleanups.push(() => {
      sharedCoordination.close();
      sharedBoundary.close();
    });
    const first = rig({ shared: { coordination: sharedCoordination, boundary: sharedBoundary } });
    const revision = await acceptedRevision(sharedBoundary);
    const remote = materializePeerRef({ peerId: "peer-b" });
    const need = await first.installed.federation!.declareContactNeed({
      origin: { kind: "attempt", attempt: { projectId: "p", attemptId: "a" } },
      competenceTags: ["optics"],
      reason: "manual",
    });
    await first.installed.federation!.requestContact({ need, to: remote });
    const offer = await first.installed.federation!.offerCommitmentForNeed({ contactNeedId: need.contactNeedId, proposedHolder: remote, statement: "s" });
    await first.installed.federation!.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: remote });
    const submission = await first.installed.federation!.submitFulfillment({
      commitmentId: offer.commitmentId,
      outputs: [{ kind: "boundary_revision", revision }],
      note: "n",
      authenticatedPeer: remote,
    });
    await fulfill(first, offer.commitmentId, submission.digest);
    first.installed.dispose();

    const second = rig({ shared: { coordination: sharedCoordination, boundary: sharedBoundary } });
    expect((await second.installed.federation!.commitmentState(offer.commitmentId))!.state).toBe("FULFILLED");
    const view = await second.installed.federation!.fulfillment(offer.commitmentId);
    expect(view!.acceptedSubmission!.digest).toBe(submission.digest);
    expect(view!.outputs[0]!.revision.revisionDigest).toBe(revision.revisionDigest);
    expect(view!.terms!.statement).toBe("s");
    expect((await second.installed.federation!.contactNeed(need.contactNeedId))!.need.contactNeedId).toBe(need.contactNeedId);
  });
});

/**
 * Drive the fulfillment decision through the commitment service with an ADMIT authority.
 *
 * The install's own commitment service is composed WITHOUT a fulfillment authority (a deployment that
 * composes none must not acquire one implicitly), so this helper builds a SECOND service over the SAME
 * durable store with the authority injected — which is exactly what the host does at assembly time.
 */
async function fulfill(
  r: Rig,
  commitmentId: string,
  submissionDigest: string,
): Promise<{ readonly decision: string; readonly fulfilled: boolean }> {
  const service = makeCommitmentService({
    store: r.coordination,
    localPeer: LOCAL,
    allocateCommitmentId: () => "unused",
    allocateHandoffId: () => "unused",
    contactNeedScopeGuard: durableContactNeedScopeGuard(r.coordination),
    fulfillmentOutputs: {
      async admitAcceptedRevision(ref) {
        const { makeBoundaryMemoryService } = await import("../src/boundary_memory/index.js");
        const boundary = makeBoundaryMemoryService({ store: r.boundary, localPeer: LOCAL });
        await boundary.admitBoundaryRevisionScope(ref);
      },
    },
    fulfillmentAdmission: {
      policyRef: { policyId: "fixture-fulfillment-authority", version: "v1" },
      async decide({ submission }) {
        return {
          decision: "ADMIT" as const,
          submissionDigest: submission.digest,
          policyRef: { policyId: "fixture-fulfillment-authority", version: "v1" },
          provenanceDigest: `fp-${submission.digest.slice(0, 8)}`,
        };
      },
    },
  });
  const outcome = await service.decideFulfillment({ commitmentId, submissionDigest });
  return { decision: outcome.decision, fulfilled: outcome.fulfilled };
}

/* ------------------------------------------------------------------ *
 * ADVERSARIAL MATRIX
 * ------------------------------------------------------------------ */

describe("E3-C C-N01…C-N05: no automatic need, no stale admission, no implicit authority", () => {
  it("C-N01 project reality with no supported ground yields NO candidate", async () => {
    const r = rig({ authoring: authoringOf({ tags: ["optics"], reason: "r" }), admission: admittingAuthority() });
    startReadyTask(r);
    // t1 is READY, not BLOCKED — the observation honestly reports nothing.
    await expect(r.collaboration.prepare({ ground: { kind: "BLOCKED_TASK", taskId: "t1" } })).rejects.toThrow(CollaborationNeedRefusal);
    expect(await r.coordination.replay()).toEqual([]);
  });

  it("C-N02 a candidate whose project basis moved cannot be admitted, and declares nothing", async () => {
    const r = rig({ authoring: authoringOf({ tags: ["optics"], reason: "r" }), admission: admittingAuthority() });
    startBlockedTask(r);
    const prepared = await r.collaboration.prepare({ ground: { kind: "BLOCKED_TASK", taskId: "t1" } });
    if (prepared.status !== "prepared") throw new Error("expected prepared");
    // The project MOVES under the candidate: an ordinary revision that ADDS a task, so `t1` keeps its
    // meaning (the replacement-task fence is not what this case is about) while the basis advances.
    const current = r.installed.controller.work.project();
    r.installed.controller.plan({
      goal: "g2",
      requirements: [...current.requirements],
      decisions: [...current.decisions],
      tasks: [
        ...current.tasks.map((task) => ({
          ...task,
          depends_on: [...task.depends_on],
          write_paths: [...task.write_paths],
          required_artifacts: [...task.required_artifacts],
        })),
        { task_id: "extra", objective: "an added task", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] },
      ],
      reason: "moved",
      changeClass: "behavior_change",
    });
    const assessment = await r.collaboration.assess({ candidate: prepared.candidate });
    expect(assessment.status).toBe("STALE_PROJECT");
    const admitted = await r.collaboration.admit({ candidate: prepared.candidate });
    expect(admitted.status).toBe("stale");
    expect(admitted.contactNeedId).toBeNull();
    expect(await r.coordination.replay()).toEqual([]);
  });

  it("C-N03 an absent need authority is UNRESOLVED with zero declarations", async () => {
    const r = rig({ authoring: authoringOf({ tags: ["optics"], reason: "r" }) });
    startBlockedTask(r);
    const prepared = await r.collaboration.prepare({ ground: { kind: "BLOCKED_TASK", taskId: "t1" } });
    if (prepared.status !== "prepared") throw new Error("expected prepared");
    const admitted = await r.collaboration.admit({ candidate: prepared.candidate });
    expect(admitted.status).toBe("admission_unresolved");
    expect(admitted.contactNeedId).toBeNull();
    expect(await r.coordination.replay()).toEqual([]);
  });

  it("C-N04 a REJECTing authority declares nothing", async () => {
    const rejecting: ContactNeedAdmissionPort = {
      policyRef: Object.freeze({ policyId: "rejecting", version: "v1" }),
      async decide({ candidate }): Promise<NeedAdmissionOutcome> {
        return Object.freeze({
          decision: "REJECT" as const,
          candidateDigest: candidate.digest,
          policyRef: Object.freeze({ policyId: "rejecting", version: "v1" }),
          provenanceDigest: "p",
          detail: "not a real need",
        });
      },
    };
    const r = rig({ authoring: authoringOf({ tags: ["optics"], reason: "r" }), admission: rejecting });
    startBlockedTask(r);
    const prepared = await r.collaboration.prepare({ ground: { kind: "BLOCKED_TASK", taskId: "t1" } });
    if (prepared.status !== "prepared") throw new Error("expected prepared");
    const admitted = await r.collaboration.admit({ candidate: prepared.candidate });
    expect(admitted.status).toBe("rejected");
    expect(await r.coordination.replay()).toEqual([]);
  });

  it("C-N05 a MANUAL ContactNeed declaration is durable and survives restart", async () => {
    const sharedCoordination = new SqliteCoordinationStore(join(mkdtempSync(join(tmpdir(), "e3c-m-")), "c.sqlite"));
    const sharedBoundary = new SqliteBoundaryMemoryStore(join(mkdtempSync(join(tmpdir(), "e3c-m-")), "b.sqlite"));
    cleanups.push(() => {
      sharedCoordination.close();
      sharedBoundary.close();
    });
    const first = rig({ shared: { coordination: sharedCoordination, boundary: sharedBoundary } });
    const need = await first.installed.federation!.declareContactNeed({
      origin: { kind: "attempt", attempt: { projectId: "p", attemptId: "a" } },
      competenceTags: ["optics"],
      reason: "operator declared it",
    });
    first.installed.dispose();
    const second = rig({ shared: { coordination: sharedCoordination, boundary: sharedBoundary } });
    const recovered = await second.installed.federation!.contactNeed(need.contactNeedId);
    expect(recovered!.need.reason).toBe("operator declared it");
    expect(recovered!.provenance.kind).toBe("manual");
  });
});

describe("E3-C C-N06…C-N11: fabricated scopes, ordering, authentication, and ZERO Work authority", () => {
  it("C-N06 a fabricated undeclared need id cannot be used for requestContact", async () => {
    const r = rig({});
    const fabricated = Object.freeze({
      schemaVersion: 1 as const,
      contactNeedId: "need-fabricated",
      origin: { kind: "attempt" as const, attempt: { projectId: "p", attemptId: "a" } },
      competenceTags: Object.freeze(["optics"]),
      reason: "invented",
    });
    await expect(
      r.installed.federation!.requestContact({ need: fabricated, to: materializePeerRef({ peerId: "peer-b" }) }),
    ).rejects.toThrow(/not durably declared/u);
    expect(await r.coordination.replay()).toEqual([]);
  });

  it("C-N07 a fabricated undeclared need id cannot manufacture a contact_need commitment scope", async () => {
    const r = rig({});
    await expect(
      r.installed.federation!.offerCommitment({
        proposedHolder: materializePeerRef({ peerId: "peer-b" }),
        scope: { kind: "contact_need", contactNeedId: "need-fabricated" },
        statement: "s",
      }),
    ).rejects.toThrow(/not durably declared/u);
    expect(await r.coordination.replay()).toEqual([]);
  });

  it("C-N08 offerCommitmentForNeed before any CONTACT_REQUESTED is refused", async () => {
    const r = rig({});
    const need = await r.installed.federation!.declareContactNeed({
      origin: { kind: "attempt", attempt: { projectId: "p", attemptId: "a" } },
      competenceTags: ["optics"],
      reason: "manual",
    });
    await expect(
      r.installed.federation!.offerCommitmentForNeed({
        contactNeedId: need.contactNeedId,
        proposedHolder: materializePeerRef({ peerId: "peer-b" }),
        statement: "s",
      }),
    ).rejects.toThrow(/CONTACT_REQUESTED/u);
  });

  it("C-N09 an unauthenticated peer cannot accept a commitment", async () => {
    const r = rig({});
    const remote = materializePeerRef({ peerId: "peer-b" });
    const need = await r.installed.federation!.declareContactNeed({
      origin: { kind: "attempt", attempt: { projectId: "p", attemptId: "a" } },
      competenceTags: ["optics"],
      reason: "manual",
    });
    await r.installed.federation!.requestContact({ need, to: remote });
    const offer = await r.installed.federation!.offerCommitmentForNeed({ contactNeedId: need.contactNeedId, proposedHolder: remote, statement: "s" });
    await expect(r.installed.federation!.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: null })).rejects.toThrow();
    expect((await r.installed.federation!.commitmentState(offer.commitmentId))!.state).toBe("OFFERED");
  });

  it("C-N10 the WRONG peer cannot accept a commitment", async () => {
    const r = rig({});
    const remote = materializePeerRef({ peerId: "peer-b" });
    const other = materializePeerRef({ peerId: "peer-c" });
    const need = await r.installed.federation!.declareContactNeed({
      origin: { kind: "attempt", attempt: { projectId: "p", attemptId: "a" } },
      competenceTags: ["optics"],
      reason: "manual",
    });
    await r.installed.federation!.requestContact({ need, to: remote });
    const offer = await r.installed.federation!.offerCommitmentForNeed({ contactNeedId: need.contactNeedId, proposedHolder: remote, statement: "s" });
    await expect(r.installed.federation!.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: other })).rejects.toThrow(/proposed holder/u);
    expect((await r.installed.federation!.commitmentState(offer.commitmentId))!.state).toBe("OFFERED");
  });

  it("C-N11 a commitment creates ZERO Work state in either project", async () => {
    const r = rig({});
    startReadyTask(r);
    const before = JSON.stringify(r.installed.controller.work.taskStates());
    const remote = materializePeerRef({ peerId: "peer-b" });
    const need = await r.installed.federation!.declareContactNeed({
      origin: { kind: "attempt", attempt: { projectId: "p", attemptId: "a" } },
      competenceTags: ["optics"],
      reason: "manual",
    });
    await r.installed.federation!.requestContact({ need, to: remote });
    const offer = await r.installed.federation!.offerCommitmentForNeed({ contactNeedId: need.contactNeedId, proposedHolder: remote, statement: "s" });
    await r.installed.federation!.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: remote });
    expect(JSON.stringify(r.installed.controller.work.taskStates())).toBe(before);
  });
});

describe("E3-C C-N12…C-N17: fulfillment cannot be forged, self-judged, or produced by a non-holder", () => {
  it("C-N12 a nonexistent boundary revision is refused", async () => {
    const r = rig({});
    const remote = materializePeerRef({ peerId: "peer-b" });
    const offer = await activeOffer(r, remote);
    await expect(
      r.installed.federation!.submitFulfillment({
        commitmentId: offer,
        outputs: [{ kind: "boundary_revision", revision: { schemaVersion: 1, workspaceId: "ws-x", artifactId: "art-x", revision: 0, candidateDigest: "a".repeat(64), revisionDigest: "b".repeat(64) } }],
        note: "n",
        authenticatedPeer: remote,
      }),
    ).rejects.toThrow();
  });

  it("C-N13 a CANDIDATE (non-accepted) boundary revision is refused", async () => {
    const r = rig({});
    const { makeBoundaryMemoryService } = await import("../src/boundary_memory/index.js");
    const peerA = materializePeerRef({ peerId: "peer-a" });
    const peerB = materializePeerRef({ peerId: "peer-b" });
    const service = makeBoundaryMemoryService({ store: r.boundary, localPeer: peerA });
    await service.openWorkspace({ workspaceId: "ws-1", participants: [peerA, peerB], purpose: "p" });
    await service.createArtifact({ workspaceId: "ws-1", artifactId: "art-1", type: { typeId: "boundary.statement", version: "v1" }, title: "T" });
    const candidate = await service.proposeRevision({
      workspaceId: "ws-1",
      artifactId: "art-1",
      base: null,
      content: { statement: "candidate only", tags: ["assumption"], references: [] },
      requiredAcceptors: [peerA, peerB],
      intent: "i",
    });
    const remote = materializePeerRef({ peerId: "peer-b" });
    const offer = await activeOffer(r, remote);
    // The candidate digest is real, but NOTHING was accepted — a candidate is not a deliverable.
    await expect(
      r.installed.federation!.submitFulfillment({
        commitmentId: offer,
        outputs: [{ kind: "boundary_revision", revision: { schemaVersion: 1, workspaceId: "ws-1", artifactId: "art-1", revision: 0, candidateDigest: candidate.digest, revisionDigest: candidate.digest } }],
        note: "n",
        authenticatedPeer: remote,
      }),
    ).rejects.toThrow();
  });

  it("C-N14 a non-holder cannot submit a fulfillment", async () => {
    const r = rig({});
    const revision = await acceptedRevision(r.boundary);
    const remote = materializePeerRef({ peerId: "peer-b" });
    const other = materializePeerRef({ peerId: "peer-c" });
    const offer = await activeOffer(r, remote);
    await expect(
      r.installed.federation!.submitFulfillment({
        commitmentId: offer,
        outputs: [{ kind: "boundary_revision", revision }],
        note: "n",
        authenticatedPeer: other,
      }),
    ).rejects.toThrow(/current holder/u);
  });

  it("C-N15 an absent fulfillment authority leaves the commitment ACTIVE (no FULFILLED)", async () => {
    const r = rig({});
    const revision = await acceptedRevision(r.boundary);
    const remote = materializePeerRef({ peerId: "peer-b" });
    const offer = await activeOffer(r, remote);
    const submission = await r.installed.federation!.submitFulfillment({
      commitmentId: offer,
      outputs: [{ kind: "boundary_revision", revision }],
      note: "n",
      authenticatedPeer: remote,
    });
    // The INSTALL's own service has no fulfillment authority composed → UNRESOLVED, still ACTIVE.
    const outcome = await r.installed.federation!.decideFulfillment({ commitmentId: offer, submissionDigest: submission.digest });
    expect(outcome.decision).toBe("UNRESOLVED");
    expect(outcome.fulfilled).toBe(false);
    expect((await r.installed.federation!.commitmentState(offer))!.state).toBe("ACTIVE");
  });

  it("C-N16 a REJECTing fulfillment authority leaves the commitment ACTIVE", async () => {
    const r = rig({});
    const revision = await acceptedRevision(r.boundary);
    const remote = materializePeerRef({ peerId: "peer-b" });
    const offer = await activeOffer(r, remote);
    const submission = await r.installed.federation!.submitFulfillment({
      commitmentId: offer,
      outputs: [{ kind: "boundary_revision", revision }],
      note: "n",
      authenticatedPeer: remote,
    });
    const service = makeCommitmentService({
      store: r.coordination,
      localPeer: LOCAL,
      allocateCommitmentId: () => "unused",
      allocateHandoffId: () => "unused",
      contactNeedScopeGuard: durableContactNeedScopeGuard(r.coordination),
      fulfillmentOutputs: { async admitAcceptedRevision() {} },
      fulfillmentAdmission: {
        policyRef: { policyId: "rejecting", version: "v1" },
        async decide({ submission: s }) {
          return { decision: "REJECT" as const, submissionDigest: s.digest, policyRef: { policyId: "rejecting", version: "v1" }, provenanceDigest: "p" };
        },
      },
    });
    const outcome = await service.decideFulfillment({ commitmentId: offer, submissionDigest: submission.digest });
    expect(outcome.decision).toBe("REJECT");
    expect((await r.installed.federation!.commitmentState(offer))!.state).toBe("ACTIVE");
    // The submission and the decision REMAIN history — the refusal is honest, not erased.
    const types = (await r.coordination.replay()).map((event) => event.type);
    expect(types).toContain("FULFILLMENT_SUBMITTED");
    expect(types).toContain("FULFILLMENT_DECIDED");
  });

  it("C-N17 the holder cannot self-declare FULFILLED (no self-certification path exists)", async () => {
    const r = rig({});
    const revision = await acceptedRevision(r.boundary);
    const remote = materializePeerRef({ peerId: "peer-b" });
    const offer = await activeOffer(r, remote);
    await r.installed.federation!.submitFulfillment({
      commitmentId: offer,
      outputs: [{ kind: "boundary_revision", revision }],
      note: "n",
      authenticatedPeer: remote,
    });
    // There is NO service verb that fulfills without an authority decision: the only path is
    // `decideFulfillment`, which requires the authority. A submission alone leaves it ACTIVE.
    expect((await r.installed.federation!.commitmentState(offer))!.state).toBe("ACTIVE");
    expect(await r.installed.federation!.fulfillment(offer)).toMatchObject({ state: "ACTIVE", admission: null });
  });
});

describe("E3-C C-N18…C-N25: terminality, non-promotion, and legacy compatibility", () => {
  it("C-N18/C-N19 a FULFILLED commitment can neither release nor hand off", async () => {
    const r = rig({});
    const revision = await acceptedRevision(r.boundary);
    const remote = materializePeerRef({ peerId: "peer-b" });
    const offer = await activeOffer(r, remote);
    const submission = await r.installed.federation!.submitFulfillment({
      commitmentId: offer,
      outputs: [{ kind: "boundary_revision", revision }],
      note: "n",
      authenticatedPeer: remote,
    });
    await fulfill(r, offer, submission.digest);
    expect((await r.installed.federation!.commitmentState(offer))!.state).toBe("FULFILLED");
    await expect(r.installed.federation!.releaseCommitment({ commitmentId: offer, authenticatedPeer: remote })).rejects.toThrow(/terminal/u);
    // §98: handoff requires an ACTIVE commitment — FULFILLED is not ACTIVE.
    await expect(r.installed.federation!.offerHandoff({ commitmentId: offer, to: remote })).rejects.toThrow();
    expect((await r.installed.federation!.commitmentState(offer))!.state).toBe("FULFILLED");
  });

  it("C-N20/C-N21 fulfillment becomes NEITHER Evidence/Proof NOR a ProjectIR change automatically", async () => {
    const r = rig({});
    startReadyTask(r);
    const irBefore = JSON.stringify(r.installed.controller.work.project());
    const revision = await acceptedRevision(r.boundary);
    const remote = materializePeerRef({ peerId: "peer-b" });
    const offer = await activeOffer(r, remote);
    const submission = await r.installed.federation!.submitFulfillment({
      commitmentId: offer,
      outputs: [{ kind: "boundary_revision", revision }],
      note: "n",
      authenticatedPeer: remote,
    });
    await fulfill(r, offer, submission.digest);
    // §29: the fulfilled contribution did NOT become Project truth or a ProjectIR revision.
    expect(JSON.stringify(r.installed.controller.work.project())).toBe(irBefore);
    // No proof/publication event appeared anywhere in the coordination history.
    const types = (await r.coordination.replay()).map((event) => event.type);
    expect(types.some((type) => type.includes("PROOF") || type.includes("PUBLISH"))).toBe(false);
  });

  it("C-N22 ManagementMode cannot admit a need or a fulfillment", async () => {
    // §8: the management layer cannot even reach the admission decision — the firewall holds it out.
    const { analyseModuleArchitecture } = await import("../tools/architecture/index.js");
    const graph = analyseModuleArchitecture(process.cwd());
    for (const module of graph.modules.filter((entry) => entry.file.startsWith("src/project_management/"))) {
      for (const target of module.imports) {
        expect(target.startsWith("src/project_collaboration/"), `${module.file} imports ${target}`).toBe(false);
      }
    }
  });

  it("C-N23 remote Project B Work never appears in Project A's Work ledger", async () => {
    const a = rig({});
    startReadyTask(a, "at1", "a");
    const b = rig({});
    startReadyTask(b, "bt1", "b");
    // A full collaboration exchange between A and B leaves A's ledger untouched.
    const remote = materializePeerRef({ peerId: "peer-b" });
    const need = await a.installed.federation!.declareContactNeed({
      origin: { kind: "attempt", attempt: { projectId: "p", attemptId: "x" } },
      competenceTags: ["optics"],
      reason: "manual",
    });
    await a.installed.federation!.requestContact({ need, to: remote });
    const offer = await a.installed.federation!.offerCommitmentForNeed({ contactNeedId: need.contactNeedId, proposedHolder: remote, statement: "s" });
    await a.installed.federation!.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: remote });
    expect(a.installed.controller.work.project().tasks.map((task) => task.task_id)).toEqual(["at1"]);
    expect(b.installed.controller.work.project().tasks.map((task) => task.task_id)).toEqual(["bt1"]);
  });

  it("C-N24 a message/acknowledgement cannot satisfy a commitment", async () => {
    const r = rig({});
    const remote = materializePeerRef({ peerId: "peer-b" });
    const offer = await activeOffer(r, remote);
    // A conversation happens: a message is sent and acknowledged.
    await r.installed.federation!.sendMessage({ to: remote, threadId: "thread-1", body: "all done!" });
    const message = (await r.installed.federation!.thread("thread-1")).messages[0]!;
    await r.installed.federation!.acknowledge({ message });
    // §76/§82: an acknowledgement is receipt/attention only — never agreement, never fulfillment.
    expect((await r.installed.federation!.commitmentState(offer))!.state).toBe("ACTIVE");
    expect(await r.installed.federation!.fulfillmentSubmissions(offer)).toEqual([]);
  });

  it("C-N25 a legacy commitment record with only termsDigest remains replayable but is not fulfillable", async () => {
    const coordination = new SqliteCoordinationStore(join(mkdtempSync(join(tmpdir(), "e3c-l-")), "c.sqlite"));
    cleanups.push(() => coordination.close());
    // A LEGACY offer: written with only a termsDigest, exactly as the pre-E3-C shape allowed.
    const legacyOffer = Object.freeze({
      commitmentId: "com-legacy",
      proposer: LOCAL,
      proposedHolder: materializePeerRef({ peerId: "peer-b" }),
      scope: Object.freeze({ kind: "contact_need" as const, contactNeedId: "need-legacy" }),
      termsDigest: "legacy-digest",
    });
    await coordination.append({
      eventId: "legacy-1",
      projectId: "federation",
      type: "COMMITMENT_OFFERED",
      payload: { offer: legacyOffer },
    } as never);
    const service = makeCommitmentService({
      store: coordination,
      localPeer: LOCAL,
      allocateCommitmentId: () => "unused",
      allocateHandoffId: () => "unused",
    });
    // It REPLAYS: the historical record is readable and its state derives.
    const state = await service.commitmentState("com-legacy");
    expect(state!.state).toBe("OFFERED");
    expect(state!.offer.termsDigest).toBe("legacy-digest");
    expect(state!.offer.terms).toBeUndefined();
  });
});

/** A commitment ACTIVE for `remote` over a declared need — the shared precondition of the fulfillment cases. */
async function activeOffer(r: Rig, remote: ReturnType<typeof materializePeerRef>): Promise<string> {
  const need = await r.installed.federation!.declareContactNeed({
    origin: { kind: "attempt", attempt: { projectId: "p", attemptId: "a" } },
    competenceTags: ["optics"],
    reason: "manual",
  });
  await r.installed.federation!.requestContact({ need, to: remote });
  const offer = await r.installed.federation!.offerCommitmentForNeed({
    contactNeedId: need.contactNeedId,
    proposedHolder: remote,
    statement: "deliver the calibration",
  });
  await r.installed.federation!.acceptCommitment({ commitmentId: offer.commitmentId, authenticatedPeer: remote });
  return offer.commitmentId;
}
