/**
 * Trajectory-T0 §7 (T0-F) — REAL OWNER REPLAY SCENARIO B:
 * `Reasoning / Proof → Grounded Intent Revision`.
 *
 *     Reasoning Cell → Branch → Candidate → Verification/Admission → admitted Claim
 *     Proof Source → Evidence → Candidate → Verification → Publication → published Claim
 *     Project Association → Intent Ground → Intent Proposal → Accepted Receipt → PROJECT_REVISED
 *
 * Every fact below is produced by the REAL services (`installPalimpsest`, the Reasoning service, the
 * Proof service, the Project Workspace service, the Project Intent service). The fixture's admission
 * authority is a DETERMINISTIC TEST POLICY — not independent real-world approval — and the trajectory
 * reports it as exactly that.
 *
 * The boundaries this file exists to prove:
 *
 *     Candidate      ≠  admitted Claim          (B-N1)
 *     foreign Claim  ⇏  this project's Ground   (B-N2)
 *     historical Receipt is NOT rewritten by a later currentness change (B-N5, B-N6, B-N7)
 *     a Proposal WITHOUT an accepted Receipt is NOT a ProjectIR revision (B-N8)
 *
 * No model executes. No DSH worker launches. No PRIMARY route is enabled.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import { GitCliPort } from "../src/effects/index.js";
import type { ProjectStandard } from "../src/domain/standard.js";
import {
  SqliteProjectAssetAssociationStore,
  SqliteProjectJournalStore,
} from "../src/project_workspace/index.js";
import {
  PROOF_STATEMENT_TYPE,
  SqliteProofEvidenceStore,
  localProofBlobStore,
  materializeProofSourceRevisionRef,
} from "../src/proof_asset/index.js";
import type { ProofClaimStanding, ProofPolicyRef, ProofVerificationPolicyPort } from "../src/proof_asset/index.js";
import {
  REASONING_STATEMENT_TYPE,
  SqliteReasoningCellStore,
  invalidationAdmissionDigestOf,
  invalidationVerificationDigestOf,
  reasoningAdmissionDigestOf,
  reasoningVerificationDigestOf,
} from "../src/reasoning_cell/index.js";
import type {
  ReasoningEpistemicAdmissionPolicyPort,
  ReasoningVerificationPolicyPort,
} from "../src/reasoning_cell/index.js";
import type {
  IntentAdmissionOutcome,
  ProjectIntentAdmissionPort,
} from "../src/project_intent/index.js";
import { parseAcceptedIntentReconciliation } from "../src/project_intent/index.js";
import type { SchedulerEvent } from "../src/schema/index.js";
import { composeTrajectoryInputs } from "../src/composition/trajectory.js";
import {
  buildProjectTrajectory,
  buildTrajectoryReadModel,
  type TrajectoryProjectionInputs,
} from "../src/trajectory/index.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

function standardOf(): ProjectStandard {
  return Object.freeze({
    statement: "tests pass and scope respected",
    clauses: Object.freeze([
      Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze(["node", "-e", "process.exit(0)"]), predicate: "tests_pass" as const }),
      Object.freeze({ kind: "scope_respected" as const }),
    ]),
    derivedFrom: Object.freeze(["trajectory-t0 fixture"]),
    confirmed: true,
    notes: Object.freeze([]),
  });
}

function workspace(): { repo: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-t0b-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "a.ts"), "export const a = 1;\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: repo });
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* windows keeps the directory busy while a git handle is open */
    }
  });
  return { repo, head: git(repo, ["rev-parse", "HEAD"]) };
}

const POLICY = { policyId: "t0b-authority", version: "v1" };

/** A deterministic test authority. It approves the EXACT digest it was shown, and says so. */
function authority(script: { decide?: "ADMIT" | "REJECT" | "UNRESOLVED"; wrongDigest?: boolean } = {}): ProjectIntentAdmissionPort {
  return {
    policyRef: { policyId: POLICY.policyId, version: POLICY.version },
    async decide({ proposal }): Promise<IntentAdmissionOutcome> {
      const decision = script.decide ?? "ADMIT";
      return Object.freeze({
        decision,
        proposalDigest: script.wrongDigest === true ? "0".repeat(64) : proposal.digest,
        policyRef: { policyId: POLICY.policyId, version: POLICY.version },
        provenanceDigest: "a".repeat(64),
        detail: `the deterministic test authority returned ${decision}`,
      });
    },
  };
}

function reasoningVerificationPolicy(): ReasoningVerificationPolicyPort {
  return {
    async verify({ definition, candidate, frontierBasis }) {
      const base = {
        schemaVersion: 1 as const,
        cell: candidate.cell,
        candidateDigest: candidate.candidateDigest,
        frontierBasis,
        verificationPolicyRef: definition.verificationPolicyRef,
        standing: "SUPPORTED" as const,
        supportingEvidenceIds: ["ev-1"],
        contradictingEvidenceIds: [],
        provenanceDigest: "a".repeat(64),
      };
      return { ...base, digest: reasoningVerificationDigestOf(base) };
    },
    async verifyInvalidation({ definition, request, frontierBasis }) {
      const base = {
        schemaVersion: 1 as const,
        cell: request.cell,
        targetClaimId: request.targetClaimId,
        requestDigest: request.requestDigest,
        frontierBasis,
        verificationPolicyRef: definition.verificationPolicyRef,
        standing: "SUPPORTED" as const,
        evidenceIds: ["ev-9"],
        provenanceDigest: "b".repeat(64),
      };
      return { ...base, digest: invalidationVerificationDigestOf(base) };
    },
  };
}

function reasoningAdmissionPolicy(): ReasoningEpistemicAdmissionPolicyPort {
  return {
    async admit({ definition, candidate, verification, frontierBasis }) {
      const base = {
        schemaVersion: 1 as const,
        cell: candidate.cell,
        candidateDigest: candidate.candidateDigest,
        verificationResultDigest: verification.digest,
        frontierBasis,
        admissionPolicyRef: definition.admissionPolicyRef,
        decision: "ADMIT" as const,
        provenanceDigest: "c".repeat(64),
      };
      return { ...base, digest: reasoningAdmissionDigestOf(base) };
    },
    async admitInvalidation({ definition, request, verification, frontierBasis }) {
      const base = {
        schemaVersion: 1 as const,
        cell: request.cell,
        targetClaimId: request.targetClaimId,
        requestDigest: request.requestDigest,
        verificationResultDigest: verification.digest,
        frontierBasis,
        admissionPolicyRef: definition.admissionPolicyRef,
        decision: "INVALIDATE" as const,
        provenanceDigest: "d".repeat(64),
      };
      return { ...base, digest: invalidationAdmissionDigestOf(base) };
    },
  };
}

/** A Proof verification policy whose standing can be FORCED, so a claim can move after publication. */
function proofPolicy(script: { forced?: ProofClaimStanding }): ProofVerificationPolicyPort {
  return {
    policyRef: { policyId: "t0b-proof-verification", version: "v1" } satisfies ProofPolicyRef,
    async verify({ candidate }) {
      const supporting = candidate.supportingEvidence.map((entry) => entry.evidenceId);
      const contradicting = candidate.contradictingEvidence.map((entry) => entry.evidenceId);
      return {
        standing: script.forced ?? (supporting.length > 0 && contradicting.length === 0 ? "SUPPORTED" : "INCONCLUSIVE"),
        supportingEvidenceIds: supporting,
        contradictingEvidenceIds: contradicting,
      };
    },
  };
}

function publishAnyAdmission() {
  return {
    policyRef: { policyId: "t0b-proof-publication", version: "v1" },
    async decide({ verification }: { readonly verification: { readonly standing: string; readonly provenanceDigest: string } }) {
      return { decision: "PUBLISH" as const, provenanceDigest: verification.provenanceDigest };
    },
  };
}

interface Rig {
  readonly repo: string;
  readonly proofScript: { forced?: ProofClaimStanding };
  readonly installed: ReturnType<typeof installPalimpsest>;
  readonly inputs: TrajectoryProjectionInputs;
  readonly events: () => readonly SchedulerEvent[];
  readonly projectId: string;
}

function makeRig(options: { admission?: ProjectIntentAdmissionPort } = {}): Rig {
  const { repo } = workspace();
  const proofScript: { forced?: ProofClaimStanding } = {};
  const journalStore = new SqliteProjectJournalStore(join(repo, ".palimpsest", "journal.sqlite"));
  const associationStore = new SqliteProjectAssetAssociationStore(join(repo, ".palimpsest", "assoc.sqlite"));
  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: "t0b",
      databasePath: join(repo, ".palimpsest", "p.sqlite"),
      ordariumDatabasePath: join(repo, ".palimpsest", "o.sqlite"),
      repository: repo,
      git: new GitCliPort(repo, join(repo, ".palimpsest", "worlds")),
      execution: "worktree",
      standard: standardOf(),
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
      projectAssociationStore: associationStore,
      projectJournalStore: journalStore,
      proofEvidenceStore: new SqliteProofEvidenceStore(join(repo, ".palimpsest", "proof.sqlite")),
      proofBlobStore: localProofBlobStore(join(repo, ".palimpsest", "blobs")),
      proofVerificationPolicy: proofPolicy(proofScript),
      proofPublicationAdmission: publishAnyAdmission(),
      reasoningCellStore: new SqliteReasoningCellStore(join(repo, ".palimpsest", "cells.sqlite")),
      reasoningCellStoreOwned: false,
      reasoningVerificationPolicy: reasoningVerificationPolicy(),
      reasoningAdmissionPolicy: reasoningAdmissionPolicy(),
      ...(options.admission === undefined ? {} : { projectIntentAdmission: options.admission }),
    } as never,
  );
  cleanups.push(() => void installed.dispose());
  const inputs = composeTrajectoryInputs({
    projectId: "t0b",
    controller: installed.controller,
    promotions: installed.controller.promotions,
    reasoning: installed.reasoningCells?.service,
    proof: installed.proof,
    projectWorkspace: installed.projectWorkspace,
    journalStore,
    associationStore,
  });
  return {
    repo,
    proofScript,
    installed,
    inputs,
    events: () => installed.controller.store.listEvents("t0b"),
    projectId: "t0b",
  };
}

/** Start a project whose requirement R is the latency bound. */
function startProject(rig: Rig, statement = "latency <= 10 ms"): void {
  const head = git(rig.repo, ["rev-parse", "HEAD"]);
  rig.installed.controller.start({
    projectId: rig.projectId,
    goal: "keep the service fast",
    headCommit: head,
    requirements: [{ requirement_id: "R", statement, priority: "critical", acceptance_refs: [] }],
    tasks: [{ task_id: "t1", objective: "make it fast", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] }],
  });
}

/** Publish a real Proof claim and associate it with the project. */
async function publishProof(rig: Rig, statement: string, associate = true): Promise<string> {
  const proof = rig.installed.proof!;
  const imported = await proof.importSource({ bytes: new TextEncoder().encode(statement), mediaType: "text/plain", label: "t0b", provenance: "LOCAL_IMPORT", sourceId: "t0b-src" });
  const ref = materializeProofSourceRevisionRef({ sourceId: "t0b-src", revision: imported.revision.revision, contentDigest: imported.revision.contentDigest });
  const evidence = await proof.recordEvidence({ sourceRevision: ref, selector: { kind: "WHOLE_SOURCE" } });
  const candidate = await proof.prepareCandidate({ claimType: PROOF_STATEMENT_TYPE, content: { statement }, supportingEvidenceIds: [evidence.evidenceId], origin: "MANUAL" });
  await proof.verify({ candidateId: candidate.candidateId });
  const published = await proof.decidePublication({ candidateId: candidate.candidateId });
  if (published.claimId === undefined) throw new Error("the fixture claim was not published");
  if (associate) {
    await rig.installed.projectWorkspace!.associateAsset({ projectId: rig.projectId, assetKind: "PROOF_CLAIM", canonicalRef: { kind: "PROOF_CLAIM", id: published.claimId }, associationKind: "MANUAL", provenance: "t0b" });
  }
  return published.claimId;
}

/** Admit one Reasoning claim in a project-associated cell. */
async function admitReasoning(rig: Rig, statement: string, associate = true): Promise<{ cellId: string; claimId: string; branchId: string; candidateDigest: string }> {
  const reasoning = rig.installed.reasoningCells!.service;
  const cellId = "cell-t0b";
  const existing = await reasoning.listCells();
  if (!existing.some((cell) => cell.cellId === cellId)) {
    await reasoning.openCell({ cellId, objective: "how fast can it be", verificationPolicyRef: { policyId: "v", version: "1" }, admissionPolicyRef: { policyId: "a", version: "1" } });
  }
  const branch = await reasoning.openBranch({ cellId, question: `q-${statement}` });
  const submitted = await reasoning.submitCandidate({ cellId, branchId: branch.branch.ref.branchId, type: REASONING_STATEMENT_TYPE, content: { statement } });
  await reasoning.evaluateCandidate({ cellId, candidateDigest: submitted.candidate.candidateDigest });
  const frontier = await reasoning.frontier({ cellId });
  const claimId = frontier.claims[0]?.ref.claimId;
  if (claimId === undefined) throw new Error("the fixture reasoning claim was not admitted");
  if (associate) {
    const associations = await rig.installed.projectWorkspace!.projectScopedAssets(rig.projectId);
    if (!associations.some((entry) => entry.assetKind === "REASONING_CELL" && entry.canonicalRef.id === cellId)) {
      await rig.installed.projectWorkspace!.associateAsset({ projectId: rig.projectId, assetKind: "REASONING_CELL", canonicalRef: { kind: "REASONING_CELL", id: cellId }, associationKind: "MANUAL", provenance: "t0b" });
    }
  }
  return { cellId, claimId, branchId: branch.branch.ref.branchId, candidateDigest: submitted.candidate.candidateDigest };
}

async function recordNegativeResult(rig: Rig, title = "10 ms is unreachable"): Promise<string> {
  const entry = await rig.installed.projectWorkspace!.recordJournalEntry({ projectId: rig.projectId, kind: "NEGATIVE_RESULT", title, body: "the measured floor is 17 ms", provenance: "t0b" });
  return entry.entryId;
}

/* ================================================================== positive assertions */

describe("Trajectory-T0 §7 T0-F — Reasoning/Proof → Grounded Intent Revision (real owners)", () => {
  it("Branch, Candidate and admitted Claim have DISTINCT identities, and a Candidate's presence is not Admission", async () => {
    const rig = makeRig({ admission: authority() });
    startProject(rig);
    const { cellId, claimId, branchId, candidateDigest } = await admitReasoning(rig, "the floor is set by the serialization step");
    const reasoning = rig.installed.reasoningCells!.service;
    const view = await reasoning.cellView({ cellId });
    // §7: the three identities are distinct kinds, not one thing at three strengths.
    expect(branchId.startsWith("br-")).toBe(true);
    expect(claimId.startsWith("cl-")).toBe(true);
    expect(candidateDigest).not.toBe(claimId);
    expect(candidateDigest.length).toBe(64);
    // §7: the candidate is readable WITH its status, and an admitted one reports ADMITTED.
    const candidate = view.candidates.find((entry) => entry.candidateDigest === candidateDigest)!;
    expect(candidate.status).toBe("ADMITTED");
    expect(view.admittedClaimIds).toContain(claimId);
    expect(view.activeClaimIds).toContain(claimId);
  });

  it("an accepted Intent Receipt references the EXACT Proposal Digest, and its Grounds name the right owners", async () => {
    const rig = makeRig({ admission: authority() });
    startProject(rig);
    const claimId = await publishProof(rig, "the measured feasible lower bound is 17 ms");
    const { cellId, claimId: reasoningClaimId } = await admitReasoning(rig, "serialization dominates");
    const entryId = await recordNegativeResult(rig);
    const prepared = await rig.installed.intent!.prepare({
      changes: [{ kind: "REQUIREMENT_REVISE", requirement: { requirement_id: "R", statement: "latency <= 20 ms", priority: "critical", acceptance_refs: [] } }],
      grounds: { proof: [{ claimId }], reasoning: [{ cellId, claimId: reasoningClaimId }], negativeResults: [{ entryId }] },
      rationale: "three grounds",
    });
    const outcome = await rig.installed.intent!.apply({ proposal: prepared.proposal });
    expect(outcome.status).toBe("APPLIED");

    // Read the receipt from the CANONICAL Work event history, re-parsed by its owner parser.
    const revised = rig.events().filter((event) => event.event_type === "PROJECT_REVISED");
    expect(revised).toHaveLength(1);
    const receipt = parseAcceptedIntentReconciliation((revised[0]!.payload as Record<string, unknown>)["intent_reconciliation"]);
    expect(receipt.proposalDigest).toBe(prepared.proposal.digest);
    expect(receipt.proposalId).toBe(prepared.proposal.proposalId);
    expect(receipt.admission.decision).toBe("ADMIT");
    expect(receipt.groundBindings).toHaveLength(3);

    // The trajectory reconstructs every grounded relation from the actual owner records.
    const projection = await buildProjectTrajectory(rig.inputs);
    const grounds = projection.edges.filter((edge) => edge.relation === "RECEIPT_REFERENCED_GROUND");
    expect(grounds).toHaveLength(3);
    for (const edge of grounds) expect(edge.evidenceState).toBe("ESTABLISHED_BY_OWNER_REFERENCE");
    const planes = grounds
      .map((edge) => projection.nodes.find((node) => node.nodeId === edge.fromNodeId)!.reference.ownerPlane)
      .sort();
    expect(planes).toEqual(["PROOF", "REASONING", "WORKSPACE"]);
    // §7: the ProjectIR revision is read from the canonical Work event history.
    const governed = projection.edges.filter((edge) => edge.relation === "GOVERNED_INTENT_CHANGED_PROJECT");
    expect(governed).toHaveLength(1);
    expect(governed[0]!.evidenceState).toBe("ESTABLISHED_BY_OWNER_REFERENCE");
  });

  it("a later invalidation does NOT retroactively rewrite the historical Receipt", async () => {
    const rig = makeRig({ admission: authority() });
    startProject(rig);
    const { cellId, claimId } = await admitReasoning(rig, "the floor is set by serialization");
    const prepared = await rig.installed.intent!.prepare({
      changes: [{ kind: "DECISION_APPEND", decision: { decision_id: "D1", statement: "measure before promising", rationale: "grounded", evidence_ids: [], supersedes: null } }],
      grounds: { reasoning: [{ cellId, claimId }] },
      rationale: "the cell reached this conclusion",
    });
    await rig.installed.intent!.apply({ proposal: prepared.proposal });
    const before = await buildProjectTrajectory(rig.inputs);
    const beforeGround = before.edges.find((edge) => edge.relation === "RECEIPT_REFERENCED_GROUND")!;
    const beforeReceipt = parseAcceptedIntentReconciliation((rig.events().find((event) => event.event_type === "PROJECT_REVISED")!.payload as Record<string, unknown>)["intent_reconciliation"]);

    // §7: the claim is INVALIDATED after the revision was accepted.
    await rig.installed.reasoningCells!.service.requestInvalidation({ cellId, targetClaimId: claimId, reason: "superseded by later measurement" });

    const after = await buildProjectTrajectory(rig.inputs);
    const afterReceipt = parseAcceptedIntentReconciliation((rig.events().find((event) => event.event_type === "PROJECT_REVISED")!.payload as Record<string, unknown>)["intent_reconciliation"]);
    // §7 / T0-I4: the historical receipt is byte-identical — a later currentness change rewrote nothing.
    expect(afterReceipt.digest).toBe(beforeReceipt.digest);
    expect(afterReceipt.groundBindings).toEqual(beforeReceipt.groundBindings);

    /**
     * §7: the CURRENT view reports the changed status SEPARATELY from the historical admission. The
     * historical edge still records what was admitted; the node's currentness now says the owner's
     * frontier no longer holds the claim.
     */
    const afterGround = after.edges.find((edge) => edge.relation === "RECEIPT_REFERENCED_GROUND")!;
    expect(afterGround.evidenceState).toBe("ESTABLISHED_BY_OWNER_REFERENCE");
    const afterNode = after.nodes.find((node) => node.nodeId === afterGround.fromNodeId)!;
    expect(afterNode.epistemicStatus).toBe("INVALIDATED");
    expect(afterNode.currentness).toBe("STALE_BY_OWNER");
    // And the historical projection's own edge is unchanged in its established evidence.
    expect(afterGround.evidence!.compared["claimId"]).toBe(beforeGround.evidence!.compared["claimId"]);
    expect(afterGround.evidence!.compared["frontierRevision"]).not.toBe(beforeGround.evidence!.compared["frontierRevision"]);
  });

  it("§9: the read model answers the accepted-grounds question and separates stale from historical", async () => {
    const rig = makeRig({ admission: authority() });
    startProject(rig);
    const claimId = await publishProof(rig, "the floor is 17 ms");
    const prepared = await rig.installed.intent!.prepare({
      changes: [{ kind: "REQUIREMENT_REVISE", requirement: { requirement_id: "R", statement: "latency <= 20 ms", priority: "critical", acceptance_refs: [] } }],
      grounds: { proof: [{ claimId }] },
      rationale: "grounded revision",
    });
    await rig.installed.intent!.apply({ proposal: prepared.proposal });
    const projection = await buildProjectTrajectory(rig.inputs);
    const model = buildTrajectoryReadModel(projection, []);
    expect(model.acceptedIntentGrounds.map((entry) => entry.groundIdentity)).toContain(claimId);
    expect(model.projectChangingEvents.some((entry) => entry.eventType === "PROJECT_REVISED")).toBe(true);
    expect(model.describedBasis.projectIrRevision).toBe(1);
    expect(model.resolvableReferences.some((entry) => entry.canonicalId === claimId && entry.resolvability === "SAFE_TO_RESOLVE")).toBe(true);
  });

  it("§8 G-N16: querying Trajectory leaves every owner's basis and count unchanged", async () => {
    const rig = makeRig({ admission: authority() });
    startProject(rig);
    const claimId = await publishProof(rig, "the floor is 17 ms");
    const prepared = await rig.installed.intent!.prepare({
      changes: [{ kind: "REQUIREMENT_REVISE", requirement: { requirement_id: "R", statement: "latency <= 20 ms", priority: "critical", acceptance_refs: [] } }],
      grounds: { proof: [{ claimId }] },
      rationale: "grounded revision",
    });
    await rig.installed.intent!.apply({ proposal: prepared.proposal });
    const workBefore = rig.events().length;
    const proofBefore = await rig.installed.proof!.basis();
    const reasoningBefore = await rig.installed.reasoningCells!.service.cellView({ cellId: "cell-t0b" }).catch(() => null);
    await buildProjectTrajectory(rig.inputs);
    await buildProjectTrajectory(rig.inputs);
    expect(rig.events().length).toBe(workBefore);
    expect((await rig.installed.proof!.basis())!.chainDigest).toBe(proofBefore!.chainDigest);
    expect(await rig.installed.reasoningCells!.service.cellView({ cellId: "cell-t0b" }).catch(() => null)).toEqual(reasoningBefore);
    // The Work owner's own full verifier still passes.
    expect(() => rig.installed.controller.store.verifyFull()).not.toThrow();
  });
});

/* ================================================================== negative controls B-N1…B-N9 */

describe("Trajectory-T0 §7 — negative controls B-N1…B-N9", () => {
  it("B-N1: a pending Candidate is NOT treated as an admitted claim", async () => {
    const rig = makeRig({ admission: authority() });
    startProject(rig);
    const reasoning = rig.installed.reasoningCells!.service;
    const cellId = "cell-t0b";
    await reasoning.openCell({ cellId, objective: "how fast", verificationPolicyRef: { policyId: "v", version: "1" }, admissionPolicyRef: { policyId: "a", version: "1" } });
    const branch = await reasoning.openBranch({ cellId, question: "pending-question" });
    const submitted = await reasoning.submitCandidate({ cellId, branchId: branch.branch.ref.branchId, type: REASONING_STATEMENT_TYPE, content: { statement: "not yet evaluated" } });
    // The candidate is PENDING — deliberately NOT evaluated.
    const view = await reasoning.cellView({ cellId });
    const candidate = view.candidates.find((entry) => entry.candidateDigest === submitted.candidate.candidateDigest)!;
    expect(candidate.status).toBe("PENDING");
    expect(view.admittedClaimIds).toHaveLength(0);
    expect(view.activeClaimIds).toHaveLength(0);
    // §7 / B-N1: with no admitted claim, a reasoning ground cannot be constructed at all.
    await expect(
      rig.installed.intent!.prepare({
        changes: [{ kind: "GOAL_REVISE", goal: "g2" }],
        grounds: { reasoning: [{ cellId, claimId: "cl-does-not-exist" }] },
        rationale: "should refuse",
      }),
    ).rejects.toThrow();
    // And the trajectory records NO established reasoning ground for this project.
    const projection = await buildProjectTrajectory(rig.inputs);
    expect(projection.edges.filter((edge) => edge.relation === "RECEIPT_REFERENCED_GROUND")).toHaveLength(0);
  });

  it("B-N2: a Claim from another project is supplied as a Ground without association — no established edge", async () => {
    const rig = makeRig({ admission: authority() });
    startProject(rig);
    // A real published proof claim that is deliberately NOT associated with this project.
    const foreignClaimId = await publishProof(rig, "an unassociated claim", false);
    const projection = await buildProjectTrajectory(rig.inputs);
    // With no receipt there is no ground edge; and the unassociated claim cannot become one.
    expect(projection.edges.filter((edge) => edge.relation === "RECEIPT_REFERENCED_GROUND")).toHaveLength(0);
    /**
     * Now force the situation the control names: a receipt that DOES ground on the foreign claim.
     * The Intent owner refuses it at prepare time — so the trajectory can never see it — which is
     * itself the correct outcome: the owner's boundary holds before the projection is reached.
     */
    await expect(
      rig.installed.intent!.prepare({
        changes: [{ kind: "GOAL_REVISE", goal: "g2" }],
        grounds: { proof: [{ claimId: foreignClaimId }] },
        rationale: "should refuse",
      }),
    ).rejects.toThrow();
  });

  it("B-N3: a Receipt whose Proposal Digest disagrees with the source is refused by the owner parser", async () => {
    const rig = makeRig({ admission: authority({ wrongDigest: true }) });
    startProject(rig);
    const claimId = await publishProof(rig, "the floor is 17 ms");
    const prepared = await rig.installed.intent!.prepare({
      changes: [{ kind: "REQUIREMENT_REVISE", requirement: { requirement_id: "R", statement: "latency <= 20 ms", priority: "critical", acceptance_refs: [] } }],
      grounds: { proof: [{ claimId }] },
      rationale: "the authority will lie about the digest",
    });
    const outcome = await rig.installed.intent!.apply({ proposal: prepared.proposal });
    // §19: the authority approving a DIFFERENT digest than it was shown is refused.
    expect(outcome.status).not.toBe("APPLIED");
    expect(rig.events().filter((event) => event.event_type === "PROJECT_REVISED")).toHaveLength(0);
    // §7 / B-N8: with no accepted receipt there is NO ProjectIR revision and no governed-intent edge.
    const projection = await buildProjectTrajectory(rig.inputs);
    expect(projection.edges.filter((edge) => edge.relation === "GOVERNED_INTENT_CHANGED_PROJECT")).toHaveLength(0);
  });

  it("B-N4: a missing Source Ground leaves the relation unresolved, never established", async () => {
    const rig = makeRig({ admission: authority() });
    startProject(rig);
    const claimId = await publishProof(rig, "the floor is 17 ms");
    const prepared = await rig.installed.intent!.prepare({
      changes: [{ kind: "REQUIREMENT_REVISE", requirement: { requirement_id: "R", statement: "latency <= 20 ms", priority: "critical", acceptance_refs: [] } }],
      grounds: { proof: [{ claimId }] },
      rationale: "grounded revision",
    });
    await rig.installed.intent!.apply({ proposal: prepared.proposal });
    // Remove the proof plane from the composition: the ground's SOURCE is now unavailable.
    const projection = await buildProjectTrajectory({ ...rig.inputs, proof: undefined });
    const grounds = projection.edges.filter((edge) => edge.relation === "RECEIPT_REFERENCED_GROUND");
    expect(grounds).toHaveLength(1);
    expect(grounds[0]!.evidenceState).toBe("UNRESOLVED_SOURCE");
    expect(grounds[0]!.evidence).toBeNull();
    expect(projection.unresolved.some((entry) => entry.ownerThatShouldSupply === "PROOF")).toBe(true);
    expect(projection.basisVector.proof.availability).toBe("NOT_COMPOSED");
  });

  it("B-N5: a current Project Revision is NOT substituted for the historical Proposal Basis", async () => {
    const rig = makeRig({ admission: authority() });
    startProject(rig);
    const claimId = await publishProof(rig, "the floor is 17 ms");
    const prepared = await rig.installed.intent!.prepare({
      changes: [{ kind: "REQUIREMENT_REVISE", requirement: { requirement_id: "R", statement: "latency <= 20 ms", priority: "critical", acceptance_refs: [] } }],
      grounds: { proof: [{ claimId }] },
      rationale: "grounded revision",
    });
    await rig.installed.intent!.apply({ proposal: prepared.proposal });
    const receipt = parseAcceptedIntentReconciliation((rig.events().find((event) => event.event_type === "PROJECT_REVISED")!.payload as Record<string, unknown>)["intent_reconciliation"]);
    // §7 / T0-I4: the receipt's proposalBasis names the revision the proposal was made AGAINST (0).
    expect(receipt.proposalBasis.revision).toBe(0);
    const projection = await buildProjectTrajectory(rig.inputs);
    const governed = projection.edges.find((edge) => edge.relation === "GOVERNED_INTENT_CHANGED_PROJECT")!;
    // The edge's compared basis revision is the HISTORICAL one, not the resulting revision.
    expect(governed.evidence!.compared["basisRevision"]).toBe("0");
    expect(governed.evidence!.compared["basisDigest"]).toBe(receipt.proposalBasis.digest);
    // And the basis vector reports the CURRENT revision separately, as its own fact.
    expect(projection.basisVector.work.projectIrRevision).toBe(1);
  });

  it("B-N6: a Reasoning Frontier that moved after observation is reported as STALE_BY_OWNER, not unchanged", async () => {
    const rig = makeRig({ admission: authority() });
    startProject(rig);
    const { cellId, claimId } = await admitReasoning(rig, "the floor is set by serialization");
    const prepared = await rig.installed.intent!.prepare({
      changes: [{ kind: "DECISION_APPEND", decision: { decision_id: "D1", statement: "measure first", rationale: "grounded", evidence_ids: [], supersedes: null } }],
      grounds: { reasoning: [{ cellId, claimId }] },
      rationale: "grounded",
    });
    await rig.installed.intent!.apply({ proposal: prepared.proposal });
    const before = await buildProjectTrajectory(rig.inputs);
    const beforeRevision = before.basisVector.reasoning[0]!.frontierRevision;

    // §7 / B-N6: the frontier MOVES after the projection observed it.
    await rig.installed.reasoningCells!.service.requestInvalidation({ cellId, targetClaimId: claimId, reason: "the frontier must move" });
    const after = await buildProjectTrajectory(rig.inputs);
    expect(after.basisVector.reasoning[0]!.frontierRevision).not.toBe(beforeRevision);
    const node = after.nodes.find((entry) => entry.reference.ownerPlane === "REASONING")!;
    expect(node.currentness).toBe("STALE_BY_OWNER");
    // The historical edge is preserved; only the CURRENTNESS changed.
    expect(after.edges.find((edge) => edge.relation === "RECEIPT_REFERENCED_GROUND")!.evidenceState).toBe("ESTABLISHED_BY_OWNER_REFERENCE");
  });

  it("B-N7: a NEGATIVE_RESULT Journal entry that grounded a proposal is NOT promoted to Proof truth", async () => {
    const rig = makeRig({ admission: authority() });
    startProject(rig);
    const entryId = await recordNegativeResult(rig);
    const prepared = await rig.installed.intent!.prepare({
      changes: [{ kind: "REQUIREMENT_REVISE", requirement: { requirement_id: "R", statement: "latency <= 20 ms", priority: "critical", acceptance_refs: [] } }],
      grounds: { negativeResults: [{ entryId }] },
      rationale: "the failed direction justifies reconsideration",
    });
    await rig.installed.intent!.apply({ proposal: prepared.proposal });
    const projection = await buildProjectTrajectory(rig.inputs);
    const ground = projection.edges.find((edge) => edge.relation === "RECEIPT_REFERENCED_GROUND")!;
    expect(ground.evidenceState).toBe("ESTABLISHED_BY_OWNER_REFERENCE");
    const node = projection.nodes.find((entry) => entry.nodeId === ground.fromNodeId)!;
    expect(node.reference.ownerPlane).toBe("WORKSPACE");
    // §7 / B-N7: the journal entry is RECORDED — never PUBLISHED, never ADMITTED as proof truth.
    expect(node.epistemicStatus).toBe("RECORDED");
    expect(node.authenticity).toBe("OWNER_RECORDED");
    const rendered = JSON.stringify(node).toLowerCase();
    expect(rendered).not.toContain("published");
    expect(rendered).not.toContain("admitted");
  });

  it("B-N8: a Proposal WITHOUT an accepted Receipt produces NO ProjectIR revision", async () => {
    const rig = makeRig({ admission: authority({ decide: "REJECT" }) });
    startProject(rig);
    const claimId = await publishProof(rig, "the floor is 17 ms");
    const before = rig.installed.controller.work.project().revision;
    const prepared = await rig.installed.intent!.prepare({
      changes: [{ kind: "REQUIREMENT_REVISE", requirement: { requirement_id: "R", statement: "latency <= 20 ms", priority: "critical", acceptance_refs: [] } }],
      grounds: { proof: [{ claimId }] },
      rationale: "the authority will reject",
    });
    const outcome = await rig.installed.intent!.apply({ proposal: prepared.proposal });
    expect(outcome.status).not.toBe("APPLIED");
    expect(rig.installed.controller.work.project().revision).toBe(before);
    expect(rig.events().filter((event) => event.event_type === "PROJECT_REVISED")).toHaveLength(0);
    const projection = await buildProjectTrajectory(rig.inputs);
    // §7 / B-N8: a proposal that was never admitted is NOT inferred as a revision.
    expect(projection.edges.filter((edge) => edge.relation === "GOVERNED_INTENT_CHANGED_PROJECT")).toHaveLength(0);
    expect(projection.edges.filter((edge) => edge.relation === "RECEIPT_REFERENCED_GROUND")).toHaveLength(0);
  });

  it("B-N9: a Branch's pending sibling Candidate does NOT leak through the accepted-frontier view", async () => {
    const rig = makeRig({ admission: authority() });
    startProject(rig);
    const reasoning = rig.installed.reasoningCells!.service;
    const cellId = "cell-t0b";
    await reasoning.openCell({ cellId, objective: "how fast", verificationPolicyRef: { policyId: "v", version: "1" }, admissionPolicyRef: { policyId: "a", version: "1" } });
    const admittedBranch = await reasoning.openBranch({ cellId, question: "q-admitted" });
    const submitted = await reasoning.submitCandidate({ cellId, branchId: admittedBranch.branch.ref.branchId, type: REASONING_STATEMENT_TYPE, content: { statement: "admitted statement" } });
    await reasoning.evaluateCandidate({ cellId, candidateDigest: submitted.candidate.candidateDigest });
    const claimId = (await reasoning.frontier({ cellId })).claims[0]!.ref.claimId;

    // A SIBLING branch with a candidate that is deliberately left PENDING.
    const siblingBranch = await reasoning.openBranch({ cellId, question: "q-sibling" });
    const sibling = await reasoning.submitCandidate({ cellId, branchId: siblingBranch.branch.ref.branchId, type: REASONING_STATEMENT_TYPE, content: { statement: "sibling never evaluated" } });

    const frontier = await reasoning.frontier({ cellId });
    // §7 / B-N9: the accepted frontier holds ONLY the admitted claim — the sibling never leaks.
    expect(frontier.claims.map((claim) => claim.ref.claimId)).toEqual([claimId]);
    expect(frontier.claims.map((claim) => claim.ref.claimId)).not.toContain(sibling.candidate.candidateDigest);

    await rig.installed.projectWorkspace!.associateAsset({ projectId: rig.projectId, assetKind: "REASONING_CELL", canonicalRef: { kind: "REASONING_CELL", id: cellId }, associationKind: "MANUAL", provenance: "t0b" });
    const prepared = await rig.installed.intent!.prepare({
      changes: [{ kind: "DECISION_APPEND", decision: { decision_id: "D1", statement: "measure first", rationale: "grounded", evidence_ids: [], supersedes: null } }],
      grounds: { reasoning: [{ cellId, claimId }] },
      rationale: "grounded on the admitted claim only",
    });
    await rig.installed.intent!.apply({ proposal: prepared.proposal });
    const projection = await buildProjectTrajectory(rig.inputs);
    // The trajectory's reasoning nodes are exactly the ADMITTED claim — the pending sibling is absent.
    const reasoningNodes = projection.nodes.filter((node) => node.reference.ownerPlane === "REASONING");
    expect(reasoningNodes.map((node) => node.reference.canonicalId)).toEqual([claimId]);
    expect(reasoningNodes.map((node) => node.reference.canonicalId)).not.toContain(sibling.candidate.candidateDigest);
    // And the ground edge's compared frontier basis records the admitted frontier only.
    const ground = projection.edges.find((edge) => edge.relation === "RECEIPT_REFERENCED_GROUND")!;
    expect(ground.evidence!.compared["activeAtProposal"]).toBe("true");
  });
});
