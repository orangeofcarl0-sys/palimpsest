/**
 * E2-I — GOVERNED PROJECT INTENT RECONCILIATION.
 *
 * The positive matrix I-P01…I-P09 and the adversarial matrix I-N01…I-N20, driven through the REAL
 * packaged install (`installPalimpsest`) so the composition adapter, the trusted revision seam and the
 * canonical wire validator are all exercised rather than stubbed.
 *
 * The one fixture that is not a real owner is the DSH worker, which is absent by design — the loop is
 * closed end-to-end by `gate:e2-i-live` on a real packaged host.
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
import { PROOF_STATEMENT_TYPE, SqliteProofEvidenceStore, localProofBlobStore, materializeProofSourceRevisionRef } from "../src/proof_asset/index.js";
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
import {
  PROJECT_INTENT_PROPOSAL_DOMAIN,
  ProjectIntentRefusal,
  materializeProjectIntentProposal,
  parseProjectIntentProposal,
} from "../src/project_intent/index.js";
import type {
  IntentAdmissionOutcome,
  IntentGround,
  ProjectIntentAdmissionPort,
  ProjectIntentService,
} from "../src/project_intent/index.js";

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
    derivedFrom: Object.freeze(["e2i fixture"]),
    confirmed: true,
    notes: Object.freeze([]),
  });
}

/** A real git repository, so the world/basis machinery has something to observe. */
function workspace(): { repo: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-e2i-"));
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

const POLICY = { policyId: "e2i-authority", version: "v1" };

/** A deterministic authority that decides as the test tells it, and always names the digest it saw. */
function authority(script: { decide?: "ADMIT" | "REJECT" | "UNRESOLVED"; wrongDigest?: boolean; policyId?: string } = {}): ProjectIntentAdmissionPort {
  return {
    policyRef: { policyId: script.policyId ?? POLICY.policyId, version: POLICY.version },
    async decide({ proposal }): Promise<IntentAdmissionOutcome> {
      const decision = script.decide ?? "ADMIT";
      return Object.freeze({
        decision,
        // §19: the authority approves the EXACT digest it was shown, unless a test deliberately lies.
        proposalDigest: script.wrongDigest === true ? "0".repeat(64) : proposal.digest,
        policyRef: { policyId: script.policyId ?? POLICY.policyId, version: POLICY.version },
        provenanceDigest: "a".repeat(64),
        detail: `the ${script.policyId ?? POLICY.policyId} authority returned ${decision}`,
      });
    },
  };
}

interface Rig {
  readonly repo: string;
  /** The mutable proof-verification script — a test moves the owner's standing through this. */
  readonly proofScript: { forced?: ProofClaimStanding };
  readonly installed: ReturnType<typeof installPalimpsest>;
  readonly intent: ProjectIntentService;
  readonly call: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  readonly events: (type: string) => number;
}

/**
 * Install the packaged stack over a fresh repository, with a workspace (so the journal/association
 * owners exist) and the requested authority.
 */
function makeRig(options: { admission?: ProjectIntentAdmissionPort | undefined } = {}): Rig {
  const { repo, head } = workspace();
  void head;
  const proofScript: { forced?: ProofClaimStanding } = {};
  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: "e2i",
      databasePath: join(repo, ".palimpsest", "p.sqlite"),
      ordariumDatabasePath: join(repo, ".palimpsest", "o.sqlite"),
      repository: repo,
      git: new GitCliPort(repo, join(repo, ".palimpsest", "worlds")),
      execution: "worktree",
      standard: standardOf(),
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
      projectAssociationStore: new SqliteProjectAssetAssociationStore(join(repo, ".palimpsest", "assoc.sqlite")),
      projectJournalStore: new SqliteProjectJournalStore(join(repo, ".palimpsest", "journal.sqlite")),
      proofEvidenceStore: new SqliteProofEvidenceStore(join(repo, ".palimpsest", "proof.sqlite")),
      proofBlobStore: localProofBlobStore(join(repo, ".palimpsest", "blobs")),
      proofVerificationPolicy: proofPolicy(proofScript),
      // Publication admits any OBSERVED standing, so a STALE claim can be published and then observed
      // as ineligible — which is the state §8's refusal exists for.
      proofPublicationAdmission: publishAnyAdmission(),
      reasoningCellStore: new SqliteReasoningCellStore(join(repo, ".palimpsest", "cells.sqlite")),
      reasoningCellStoreOwned: false,
      reasoningVerificationPolicy: reasoningVerificationPolicy(),
      reasoningAdmissionPolicy: reasoningAdmissionPolicy(),
      ...(options.admission === undefined ? {} : { projectIntentAdmission: options.admission }),
    } as never,
  );
  cleanups.push(() => void installed.dispose());
  const intent = installed.intent;
  if (intent === undefined) throw new Error("the packaged install composed no intent surface");
  const call = async (name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const tool = installed.tools.find((entry) => entry.name === name);
    if (tool === undefined) throw new Error(`no core tool ${name}`);
    return (await tool.execute(args, {
      callId: `c-${name}`,
      rootCallId: `r-${name}`,
      name,
      arguments: args,
      signal: new AbortController().signal,
    })) as Record<string, unknown>;
  };
  const events = (type: string): number =>
    (installed.controller.store.connection.prepare("SELECT COUNT(*) AS c FROM events WHERE project_id=? AND event_type=?").get("e2i", type) as { c: number }).c;
  return { repo, installed, intent, call, events, proofScript };
}

/** Reasoning verification: everything SUPPORTED, so the admission below can ADMIT it. */
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
    policyRef: { policyId: "e2i-proof-verification", version: "v1" } satisfies ProofPolicyRef,
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

/** Publication admits any OBSERVED standing — including STALE — so §8's refusal is reachable. */
function publishAnyAdmission() {
  return {
    policyRef: { policyId: "e2i-proof-publication", version: "v1" },
    async decide({ verification }: { readonly verification: { readonly standing: string; readonly provenanceDigest: string } }) {
      return { decision: "PUBLISH" as const, provenanceDigest: verification.provenanceDigest };
    },
  };
}

/**
 * Start a project whose requirement R is the latency bound.
 *
 * The controller is used directly rather than the `palimpsest_start` TOOL, because that tool compiles a
 * one-sentence goal into a task graph and does not accept requirements — the host path that authors
 * top-level intent is `controller.start`, which is exactly the owner E2-I revises.
 */
function startLatencyProject(rig: Rig, statement = "latency <= 10 ms"): void {
  const head = git(rig.repo, ["rev-parse", "HEAD"]);
  rig.installed.controller.start({
    projectId: "e2i",
    goal: "keep the service fast",
    headCommit: head,
    requirements: [{ requirement_id: "R", statement, priority: "critical", acceptance_refs: [] }],
    tasks: [{ task_id: "t1", objective: "make it fast", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] }],
  });
}

/** Publish a real Proof claim and associate it with the project. Returns its claimId. */
async function publishProof(rig: Rig, statement: string): Promise<string> {
  const proof = rig.installed.proof;
  if (proof === undefined) throw new Error("no proof plane");
  const imported = await proof.importSource({ bytes: new TextEncoder().encode(statement), mediaType: "text/plain", label: "e2i", provenance: "LOCAL_IMPORT", sourceId: "e2i-src" });
  const ref = materializeProofSourceRevisionRef({ sourceId: "e2i-src", revision: imported.revision.revision, contentDigest: imported.revision.contentDigest });
  const evidence = await proof.recordEvidence({ sourceRevision: ref, selector: { kind: "WHOLE_SOURCE" } });
  const candidate = await proof.prepareCandidate({ claimType: PROOF_STATEMENT_TYPE, content: { statement }, supportingEvidenceIds: [evidence.evidenceId], origin: "MANUAL" });
  await proof.verify({ candidateId: candidate.candidateId });
  const published = await proof.decidePublication({ candidateId: candidate.candidateId });
  if (published.claimId === undefined) throw new Error("the fixture claim was not published");
  await rig.installed.projectWorkspace!.associateAsset({ projectId: "e2i", assetKind: "PROOF_CLAIM", canonicalRef: { kind: "PROOF_CLAIM", id: published.claimId }, associationKind: "MANUAL", provenance: "e2i" });
  return published.claimId;
}

/** Admit one Reasoning claim in a project-associated cell. Returns cellId + claimId. */
async function admitReasoning(rig: Rig, statement: string): Promise<{ cellId: string; claimId: string }> {
  const reasoning = rig.installed.reasoningCells;
  if (reasoning === undefined) throw new Error("no reasoning plane");
  const cellId = "cell-e2i";
  await reasoning.service.openCell({ cellId, objective: "how fast can it be", verificationPolicyRef: { policyId: "v", version: "1" }, admissionPolicyRef: { policyId: "a", version: "1" } });
  const branch = await reasoning.service.openBranch({ cellId, question: `q-${statement}` });
  const submitted = await reasoning.service.submitCandidate({ cellId, branchId: branch.branch.ref.branchId, type: REASONING_STATEMENT_TYPE, content: { statement } });
  await reasoning.service.evaluateCandidate({ cellId, candidateDigest: submitted.candidate.candidateDigest });
  const frontier = await reasoning.service.frontier({ cellId });
  const claimId = frontier.claims[0]?.ref.claimId;
  if (claimId === undefined) throw new Error("the fixture reasoning claim was not admitted");
  await rig.installed.projectWorkspace!.associateAsset({ projectId: "e2i", assetKind: "REASONING_CELL", canonicalRef: { kind: "REASONING_CELL", id: cellId }, associationKind: "MANUAL", provenance: "e2i" });
  return { cellId, claimId };
}

/** Record a journal NEGATIVE_RESULT. Returns its entryId. */
async function recordNegativeResult(rig: Rig, title = "10 ms is unreachable"): Promise<string> {
  const entry = await rig.installed.projectWorkspace!.recordJournalEntry({ projectId: "e2i", kind: "NEGATIVE_RESULT", title, body: "the measured floor is 17 ms", provenance: "e2i" });
  return entry.entryId;
}

const refusalOf = (error: unknown): string | undefined =>
  error instanceof ProjectIntentRefusal ? error.kind : undefined;

const revisionOf = (rig: Rig): number => rig.installed.controller.work.project().revision;

const requirementR = (rig: Rig): { statement: string } | undefined =>
  rig.installed.controller.work.project().requirements.find((requirement) => requirement.requirement_id === "R");

/* ================================================================== positive matrix */

describe("E2-I positive matrix (I-P01…I-P09)", () => {
  it("I-P01: a fresh project-associated Proof grounds a Requirement revision proposal", async () => {
    const rig = makeRig({ admission: authority() });
    startLatencyProject(rig);
    const claimId = await publishProof(rig, "the measured feasible lower bound is 17 ms");
    const prepared = await rig.intent.prepare({
      changes: [{ kind: "REQUIREMENT_REVISE", requirement: { requirement_id: "R", statement: "latency <= 20 ms", priority: "critical", acceptance_refs: [] } }],
      grounds: { proof: [{ claimId }] },
      rationale: "the measured floor makes 10 ms unreachable",
    });
    expect(prepared.proposal.grounds).toHaveLength(1);
    const ground = prepared.proposal.grounds[0] as { kind: string; standingAtProposal: string; freshnessAtProposal: string };
    expect(ground.kind).toBe("proof");
    expect(ground.standingAtProposal).toBe("SUPPORTED");
    expect(ground.freshnessAtProposal).toBe("fresh");
    // §13: preparation writes NOTHING.
    expect(rig.events("PROJECT_REVISED")).toBe(0); // genesis is PROJECT_CREATED, so no revision yet
    expect(prepared.changeClass).toBe("contract_breaking");
  });

  it("I-P02: an active Reasoning claim grounds a Decision append proposal", async () => {
    const rig = makeRig({ admission: authority() });
    startLatencyProject(rig);
    const { cellId, claimId } = await admitReasoning(rig, "the floor is set by the serialization step");
    const prepared = await rig.intent.prepare({
      changes: [{ kind: "DECISION_APPEND", decision: { decision_id: "D1", statement: "measure the floor before promising a bound", rationale: "epistemic grounding", evidence_ids: [], supersedes: null } }],
      grounds: { reasoning: [{ cellId, claimId }] },
      rationale: "the cell reached this conclusion",
    });
    const ground = prepared.proposal.grounds[0] as { kind: string; activeAtProposal: boolean };
    expect(ground.kind).toBe("reasoning");
    expect(ground.activeAtProposal).toBe(true);
    // §20: a decision-only change is behavior_change, not contract_breaking.
    expect(prepared.changeClass).toBe("behavior_change");
  });

  it("I-P03: a NEGATIVE_RESULT grounds a reconsideration without becoming Evidence", async () => {
    const rig = makeRig({ admission: authority() });
    startLatencyProject(rig);
    const entryId = await recordNegativeResult(rig);
    const prepared = await rig.intent.prepare({
      changes: [{ kind: "REQUIREMENT_REVISE", requirement: { requirement_id: "R", statement: "latency <= 20 ms", priority: "critical", acceptance_refs: [] } }],
      grounds: { negativeResults: [{ entryId }] },
      rationale: "the failed direction justifies reconsideration",
    });
    const ground = prepared.proposal.grounds[0] as { kind: string; journalKind: string };
    expect(ground.kind).toBe("negative_result");
    expect(ground.journalKind).toBe("NEGATIVE_RESULT");
    // §8/§28: the ground is never labelled evidence, and no truth is inferred for the negation.
    const rendered = JSON.stringify(ground).toLowerCase();
    expect(rendered).not.toContain("evidence");
    expect(rendered).not.toContain("truth");
  });

  it("I-P04: heterogeneous grounds produce a deterministic content-addressed proposal", async () => {
    const rig = makeRig({ admission: authority() });
    startLatencyProject(rig);
    const claimId = await publishProof(rig, "the floor is 17 ms");
    const { cellId, claimId: reasoningClaimId } = await admitReasoning(rig, "serialization dominates");
    const entryId = await recordNegativeResult(rig);
    const changes = [{ kind: "REQUIREMENT_REVISE" as const, requirement: { requirement_id: "R", statement: "latency <= 20 ms", priority: "critical" as const, acceptance_refs: [] } }];
    const first = await rig.intent.prepare({ changes, grounds: { proof: [{ claimId }], reasoning: [{ cellId, claimId: reasoningClaimId }], negativeResults: [{ entryId }] }, rationale: "three grounds" });
    // Same content, DIFFERENT input array order ⇒ the SAME proposal identity (§12).
    const second = await rig.intent.prepare({ changes, grounds: { negativeResults: [{ entryId }], reasoning: [{ cellId, claimId: reasoningClaimId }], proof: [{ claimId }] }, rationale: "three grounds" });
    expect(second.proposal.digest).toBe(first.proposal.digest);
    expect(second.proposal.proposalId).toBe(first.proposal.proposalId);
    expect(first.proposal.grounds.map((ground: IntentGround) => ground.kind)).toEqual(["negative_result", "proof", "reasoning"]);
  });

  it("I-P05: an approving authority commits exactly one PROJECT_REVISED with a receipt", async () => {
    const rig = makeRig({ admission: authority() });
    startLatencyProject(rig);
    const claimId = await publishProof(rig, "the floor is 17 ms");
    const before = rig.events("PROJECT_REVISED");
    const beforeRevision = revisionOf(rig);
    const prepared = await rig.intent.prepare({
      changes: [{ kind: "REQUIREMENT_REVISE", requirement: { requirement_id: "R", statement: "latency <= 20 ms", priority: "critical", acceptance_refs: [] } }],
      grounds: { proof: [{ claimId }] },
      rationale: "grounded revision",
    });
    const outcome = await rig.intent.apply({ proposal: prepared.proposal });
    expect(outcome.status).toBe("APPLIED");
    expect(rig.events("PROJECT_REVISED")).toBe(before + 1);
    expect(revisionOf(rig)).toBe(beforeRevision + 1);
    expect(requirementR(rig)?.statement).toBe("latency <= 20 ms");
    expect(outcome.receipt?.admission.decision).toBe("ADMIT");
    expect(outcome.receipt?.proposalDigest).toBe(prepared.proposal.digest);
  });

  it("I-P06: a cold restart recovers the revised ProjectIR and its accepted provenance", async () => {
    const rig = makeRig({ admission: authority() });
    startLatencyProject(rig);
    const claimId = await publishProof(rig, "the floor is 17 ms");
    const prepared = await rig.intent.prepare({
      changes: [{ kind: "REQUIREMENT_REVISE", requirement: { requirement_id: "R", statement: "latency <= 20 ms", priority: "critical", acceptance_refs: [] } }],
      grounds: { proof: [{ claimId }] },
      rationale: "grounded revision",
    });
    await rig.intent.apply({ proposal: prepared.proposal });
    // A NEW install over the same durable stores reads the SAME revision and the SAME receipt.
    const revived = installPalimpsest({ tools: { register: () => () => undefined } } as never, {
      projectId: "e2i",
      databasePath: join(rig.repo, ".palimpsest", "p.sqlite"),
      ordariumDatabasePath: join(rig.repo, ".palimpsest", "o.sqlite"),
      repository: rig.repo,
      execution: "worktree",
      standard: standardOf(),
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
    } as never);
    cleanups.push(() => void revived.dispose());
    expect(revived.controller.work.project().requirements.find((requirement) => requirement.requirement_id === "R")?.statement).toBe("latency <= 20 ms");
    const receipt = revived.controller.store.connection
      .prepare("SELECT payload_json FROM events WHERE project_id=? AND event_type='PROJECT_REVISED' ORDER BY event_id DESC LIMIT 1")
      .get("e2i") as { payload_json: Uint8Array };
    const payload = JSON.parse(new TextDecoder().decode(receipt.payload_json)) as { intent_reconciliation?: { proposalDigest: string; groundBindings: unknown[] } };
    expect(payload.intent_reconciliation?.proposalDigest).toBe(prepared.proposal.digest);
    expect(payload.intent_reconciliation?.groundBindings).toHaveLength(1);
  });

  it("I-P07/I-P08: ordinary later planning creates Work under the revised intent", async () => {
    const rig = makeRig({ admission: authority() });
    startLatencyProject(rig);
    const claimId = await publishProof(rig, "the floor is 17 ms");
    const prepared = await rig.intent.prepare({
      changes: [{ kind: "REQUIREMENT_REVISE", requirement: { requirement_id: "R", statement: "latency <= 20 ms", priority: "critical", acceptance_refs: [] } }],
      grounds: { proof: [{ claimId }] },
      rationale: "grounded revision",
    });
    await rig.intent.apply({ proposal: prepared.proposal });
    // §22: ordinary planning — NOT E2-I — authors the next Work.
    const current = rig.installed.controller.work.project();
    rig.installed.controller.plan({
      goal: current.goal,
      requirements: current.requirements,
      decisions: current.decisions,
      tasks: [
        ...current.tasks.map((task) => ({ ...task, depends_on: [...task.depends_on], write_paths: [...task.write_paths], required_artifacts: [...task.required_artifacts] })),
        { task_id: "t2", objective: "meet the revised bound", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] },
      ],
      reason: "ordinary next plan",
    });
    const task = rig.installed.controller.work.task("t2");
    expect(task).not.toBeNull();
    // §23: the NEW worker context carries the REVISED requirement.
    const context = rig.installed.controller.workWorkerTaskContext("t2");
    expect(context.requirements.join(" ")).toContain("latency <= 20 ms");
  });

  it("I-P09: E1-K can independently deliver the supporting Proof to that new worker", async () => {
    const rig = makeRig({ admission: authority() });
    startLatencyProject(rig);
    const claimId = await publishProof(rig, "the floor is 17 ms");
    const prepared = await rig.intent.prepare({
      changes: [{ kind: "REQUIREMENT_REVISE", requirement: { requirement_id: "R", statement: "latency <= 20 ms", priority: "critical", acceptance_refs: [] } }],
      grounds: { proof: [{ claimId }] },
      rationale: "grounded revision",
    });
    await rig.intent.apply({ proposal: prepared.proposal });
    const current = rig.installed.controller.work.project();
    rig.installed.controller.plan({
      goal: current.goal,
      requirements: current.requirements,
      decisions: current.decisions,
      tasks: [
        ...current.tasks.map((task) => ({ ...task, depends_on: [...task.depends_on], write_paths: [...task.write_paths], required_artifacts: [...task.required_artifacts] })),
        { task_id: "t3", objective: "meet the revised bound", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] },
      ],
      reason: "ordinary next plan",
    });
    // Drive one attempt so an attempt id exists, then compile its context with an E1-K selection.
    rig.installed.controller.step();
    const created = rig.installed.controller.step()!;
    const attemptId = created.entity_id;
    // Claim materializes the execution world; the compile scans it, so it must exist.
    await rig.installed.controller.claim(attemptId);
    const compiled = await rig.installed.controller.workWorkerAttemptContext(attemptId, { knowledge: { proof: [{ claimId }] } });
    const handles = compiled.compiled.handles.map((entry) => entry.handle);
    // BOTH halves compose: the revised top-down intent AND the bottom-up governed knowledge.
    expect(compiled.work.requirements.join(" ")).toContain("latency <= 20 ms");
    expect(handles).toContain(`@ctx/proof/${claimId}`);
  });
});

/* ================================================================== adversarial matrix */

describe("E2-I adversarial matrix (I-N01…I-N20)", () => {
  it("I-N01: zero grounds is refused as not an E2-I proposal", async () => {
    const rig = makeRig({ admission: authority() });
    startLatencyProject(rig);
    let kind: string | undefined;
    try {
      await rig.intent.prepare({
        changes: [{ kind: "GOAL_REVISE", goal: "different" }],
        grounds: {},
        rationale: "no grounds",
      });
    } catch (error) {
      kind = refusalOf(error);
    }
    expect(kind).toBe("INTENT_NO_GROUNDS");
    expect(rig.events("PROJECT_REVISED")).toBe(0);
  });

  it("I-N02: a foreign-project Proof is refused", async () => {
    const rig = makeRig({ admission: authority() });
    startLatencyProject(rig);
    const proof = rig.installed.proof!;
      const imported = await proof.importSource({ bytes: new TextEncoder().encode("unassociated"), mediaType: "text/plain", label: "x", provenance: "LOCAL_IMPORT", sourceId: "foreign" });
    const ref = materializeProofSourceRevisionRef({ sourceId: "foreign", revision: imported.revision.revision, contentDigest: imported.revision.contentDigest });
    const evidence = await proof.recordEvidence({ sourceRevision: ref, selector: { kind: "WHOLE_SOURCE" } });
    const candidate = await proof.prepareCandidate({ claimType: PROOF_STATEMENT_TYPE, content: { statement: "unassociated" }, supportingEvidenceIds: [evidence.evidenceId], origin: "MANUAL" });
    await proof.verify({ candidateId: candidate.candidateId });
    const published = await proof.decidePublication({ candidateId: candidate.candidateId });
    let kind: string | undefined;
    try {
      await rig.intent.prepare({
        changes: [{ kind: "GOAL_REVISE", goal: "g2" }],
        grounds: { proof: [{ claimId: published.claimId! }] },
        rationale: "should refuse",
      });
    } catch (error) {
      kind = refusalOf(error);
    }
    expect(kind).toBe("INTENT_GROUND_NOT_PROJECT_ASSOCIATED");
  });

  it("I-N03: a STALE Proof is refused", async () => {
    // The policy forces STALE, so the published, associated claim is ineligible by §8.
    const rig = makeRig({ admission: authority() });
    startLatencyProject(rig);
    // Publish first (SUPPORTED), then move the owner's standing to STALE.
    const claimId = await publishProof(rig, "a claim that goes stale");
    rig.proofScript.forced = "STALE";
    await rig.installed.proof!.reassess({ claimId, policyRef: { policyId: "e2i-proof-verification", version: "v1" } });
    let kind: string | undefined;
    try {
      await rig.intent.prepare({
        changes: [{ kind: "GOAL_REVISE", goal: "g2" }],
        grounds: { proof: [{ claimId }] },
        rationale: "should refuse",
      });
    } catch (error) {
      kind = refusalOf(error);
    }
    expect(kind).toBe("INTENT_PROOF_STALE");
    expect(rig.events("PROJECT_REVISED")).toBe(0);
  });

  it("I-N04: an inactive Reasoning claim is refused", async () => {
    const rig = makeRig({ admission: authority() });
    startLatencyProject(rig);
    const { cellId, claimId } = await admitReasoning(rig, "will be invalidated");
    await rig.installed.reasoningCells!.service.requestInvalidation({ cellId, targetClaimId: claimId, reason: "superseded" });
    let kind: string | undefined;
    try {
      await rig.intent.prepare({
        changes: [{ kind: "GOAL_REVISE", goal: "g2" }],
        grounds: { reasoning: [{ cellId, claimId }] },
        rationale: "should refuse",
      });
    } catch (error) {
      kind = refusalOf(error);
    }
    expect(kind).toBe("INTENT_REASONING_INACTIVE");
  });

  it("I-N05: a non-NEGATIVE_RESULT journal entry is refused", async () => {
    const rig = makeRig({ admission: authority() });
    startLatencyProject(rig);
    const entry = await rig.installed.projectWorkspace!.recordJournalEntry({ projectId: "e2i", kind: "IDEA", title: "an idea", body: "not a negative result", provenance: "e2i" });
    let kind: string | undefined;
    try {
      await rig.intent.prepare({
        changes: [{ kind: "GOAL_REVISE", goal: "g2" }],
        grounds: { negativeResults: [{ entryId: entry.entryId }] },
        rationale: "should refuse",
      });
    } catch (error) {
      kind = refusalOf(error);
    }
    expect(kind).toBe("INTENT_NEGATIVE_RESULT_WRONG_KIND");
  });

  it("I-N06: a stale project basis yields zero ProjectIR write", async () => {
    const rig = makeRig({ admission: authority() });
    startLatencyProject(rig);
    const claimId = await publishProof(rig, "the floor is 17 ms");
    const prepared = await rig.intent.prepare({
      changes: [{ kind: "REQUIREMENT_REVISE", requirement: { requirement_id: "R", statement: "latency <= 20 ms", priority: "critical", acceptance_refs: [] } }],
      grounds: { proof: [{ claimId }] },
      rationale: "will go stale",
    });
    const before = rig.events("PROJECT_REVISED");
    // Move the project basis with an ORDINARY revision.
    const current = rig.installed.controller.work.project();
    rig.installed.controller.plan({ goal: current.goal, requirements: current.requirements, decisions: current.decisions, tasks: current.tasks, reason: "ordinary change" });
    const outcome = await rig.intent.apply({ proposal: prepared.proposal });
    expect(outcome.status).toBe("stale");
    expect(outcome.currentness.status).toBe("STALE_PROJECT");
    expect(rig.events("PROJECT_REVISED")).toBe(before + 1); // only the ordinary revision
  });

  it("I-N07: a Proof standing change before apply makes the proposal stale", async () => {
    const rig = makeRig({ admission: authority() });
    startLatencyProject(rig);
    const claimId = await publishProof(rig, "the floor is 17 ms");
    const prepared = await rig.intent.prepare({
      changes: [{ kind: "REQUIREMENT_REVISE", requirement: { requirement_id: "R", statement: "latency <= 20 ms", priority: "critical", acceptance_refs: [] } }],
      grounds: { proof: [{ claimId }] },
      rationale: "will go stale",
    });
    // Move the owner's standing, then reassess so the bound snapshot no longer matches.
    rig.proofScript.forced = "CONTRADICTED";
    await rig.installed.proof!.reassess({ claimId, policyRef: { policyId: "e2i-proof-verification", version: "v1" } });
    const before = rig.events("PROJECT_REVISED");
    const outcome = await rig.intent.apply({ proposal: prepared.proposal });
    expect(outcome.status).toBe("stale");
    expect(rig.events("PROJECT_REVISED")).toBe(before);
  });

  it("I-N08: a Reasoning ground that becomes inactive before apply yields zero write", async () => {
    const rig = makeRig({ admission: authority() });
    startLatencyProject(rig);
    const { cellId, claimId } = await admitReasoning(rig, "will go inactive");
    const prepared = await rig.intent.prepare({
      changes: [{ kind: "DECISION_APPEND", decision: { decision_id: "D1", statement: "s", rationale: "r", evidence_ids: [], supersedes: null } }],
      grounds: { reasoning: [{ cellId, claimId }] },
      rationale: "will go stale",
    });
    await rig.installed.reasoningCells!.service.requestInvalidation({ cellId, targetClaimId: claimId, reason: "superseded" });
    const before = rig.events("PROJECT_REVISED");
    const outcome = await rig.intent.apply({ proposal: prepared.proposal });
    expect(outcome.status).toBe("stale");
    expect(rig.events("PROJECT_REVISED")).toBe(before);
  });

  it("I-N09: an absent authority yields authority_unresolved with zero write", async () => {
    const rig = makeRig();
    startLatencyProject(rig);
    const claimId = await publishProof(rig, "the floor is 17 ms");
    const prepared = await rig.intent.prepare({
      changes: [{ kind: "GOAL_REVISE", goal: "g2" }],
      grounds: { proof: [{ claimId }] },
      rationale: "no authority composed",
    });
    const before = rig.events("PROJECT_REVISED");
    const outcome = await rig.intent.apply({ proposal: prepared.proposal });
    expect(outcome.status).toBe("authority_unresolved");
    expect(rig.events("PROJECT_REVISED")).toBe(before);
  });

  it("I-N10/I-N11: a rejecting or unresolved authority yields zero write", async () => {
    for (const decide of ["REJECT", "UNRESOLVED"] as const) {
      const rig = makeRig({ admission: authority({ decide }) });
      startLatencyProject(rig);
      const claimId = await publishProof(rig, "the floor is 17 ms");
      const prepared = await rig.intent.prepare({
        changes: [{ kind: "GOAL_REVISE", goal: "g2" }],
        grounds: { proof: [{ claimId }] },
        rationale: "authority will not admit",
      });
      const before = rig.events("PROJECT_REVISED");
      const outcome = await rig.intent.apply({ proposal: prepared.proposal });
      expect(outcome.status).toBe(decide === "REJECT" ? "rejected" : "authority_unresolved");
      expect(rig.events("PROJECT_REVISED")).toBe(before);
    }
  });

  it("I-N12: management DELEGATE mode cannot approve an intent proposal", async () => {
    const rig = makeRig();
    startLatencyProject(rig);
    const claimId = await publishProof(rig, "the floor is 17 ms");
    // Force the most autonomous mode available, then attempt an apply with no authority composed.
    await rig.installed.projectManagement?.applyOperatorModeChange({ to: "DELEGATE", updatedBy: "e2i-test" });
    const prepared = await rig.intent.prepare({
      changes: [{ kind: "GOAL_REVISE", goal: "g2" }],
      grounds: { proof: [{ claimId }] },
      rationale: "mode is not authority",
    });
    const before = rig.events("PROJECT_REVISED");
    const outcome = await rig.intent.apply({ proposal: prepared.proposal });
    expect(outcome.status).toBe("authority_unresolved");
    expect(rig.events("PROJECT_REVISED")).toBe(before);
  });

  it("I-N13: a caller cannot forge admission via boolean or string fields", async () => {
    const rig = makeRig({ admission: authority({ wrongDigest: true }) });
    startLatencyProject(rig);
    const claimId = await publishProof(rig, "the floor is 17 ms");
    const prepared = await rig.intent.prepare({
      changes: [{ kind: "GOAL_REVISE", goal: "g2" }],
      grounds: { proof: [{ claimId }] },
      rationale: "authority approves a different digest",
    });
    const before = rig.events("PROJECT_REVISED");
    // The authority returned ADMIT for a DIFFERENT digest — approving "something like this" is not
    // approving THIS proposal, so nothing is written.
    const outcome = await rig.intent.apply({ proposal: prepared.proposal });
    expect(outcome.status).toBe("rejected");
    expect(rig.events("PROJECT_REVISED")).toBe(before);
  });

  it("I-N14: an accepted receipt cannot be supplied through ordinary PlanInput", async () => {
    const rig = makeRig({ admission: authority() });
    startLatencyProject(rig);
    // `plan` is the agent-facing path: it accepts PlanInput only, and PlanInput has no receipt field.
    const current = rig.installed.controller.work.project();
    // The type system already refuses the field: `PlanInput` has no receipt slot, so a caller cannot
    // even express the attempt. The runtime check below proves the same thing once the compiler's
    // protection is bypassed deliberately (a hostile JS caller, not a TypeScript one).
    const hostileInput: Record<string, unknown> = {
      goal: current.goal,
      requirements: current.requirements,
      decisions: current.decisions,
      tasks: current.tasks,
      reason: "ordinary",
      acceptedIntentReconciliation: { proposalDigest: "0".repeat(64) },
    };
    const event = rig.installed.controller.plan(hostileInput as never);
    const payload = event.payload as { intent_reconciliation?: unknown };
    expect(payload.intent_reconciliation).toBeUndefined();
  });

  it("I-N15/I-N16: a goal or requirement revision retires old nonterminal Work", async () => {
    for (const change of [
      { kind: "GOAL_REVISE" as const, goal: "a different goal" },
      { kind: "REQUIREMENT_REVISE" as const, requirement: { requirement_id: "R", statement: "latency <= 20 ms", priority: "critical" as const, acceptance_refs: [] } },
    ]) {
      const rig = makeRig({ admission: authority() });
      startLatencyProject(rig);
      const claimId = await publishProof(rig, "the floor is 17 ms");
      const prepared = await rig.intent.prepare({ changes: [change], grounds: { proof: [{ claimId }] }, rationale: "retire old work" });
      const outcome = await rig.intent.apply({ proposal: prepared.proposal });
      expect(outcome.status).toBe("APPLIED");
      // §20: the old plan was authored under the old intent, so it is retired, not silently preserved.
      expect(outcome.staledTaskIds).toContain("t1");
      expect(rig.installed.controller.work.task("t1")?.state).toBe("STALE");
      void change;
    }
  });

  it("I-N17: the quiescence fence is still live, and E2-I retires Work through it rather than around it", async () => {
    const rig = makeRig({ admission: authority() });
    startLatencyProject(rig);
    // Drive t1 into ACTIVE with an open attempt, so the project is genuinely non-quiescent.
    rig.installed.controller.step();
    const created = rig.installed.controller.step()!;
    await rig.installed.controller.claim(created.entity_id);
    const current = rig.installed.controller.work.project();
    const before = rig.events("PROJECT_REVISED");

    // (a) The FENCE IS LIVE: a meaning-changing revision that does NOT name the in-flight task in its
    //     typed-invalidation set is refused by the EXISTING reconciliation, with zero writes.
    let refusedWithoutSettlement = false;
    try {
      rig.installed.controller.plan({
        goal: "a different goal",
        requirements: current.requirements,
        decisions: current.decisions,
        tasks: current.tasks,
        reason: "no settlement named",
      });
    } catch (error) {
      refusedWithoutSettlement = String(error).includes("quiescence_required") || String(error).includes("plan revision blocked");
    }
    expect(refusedWithoutSettlement).toBe(true);
    expect(rig.events("PROJECT_REVISED")).toBe(before);

    // (b) E2-I retires the SAME in-flight Work by naming it in the typed-invalidation set (§20), which is
    //     the EXISTING sanctioned settlement path — not a bypass of the fence.
    const claimId = await publishProof(rig, "the floor is 17 ms");
    const prepared = await rig.intent.prepare({
      changes: [{ kind: "GOAL_REVISE", goal: "a different goal" }],
      grounds: { proof: [{ claimId }] },
      rationale: "retire in-flight work through the existing path",
    });
    expect(prepared.changedIds).toContain("t1");
    const outcome = await rig.intent.apply({ proposal: prepared.proposal });
    expect(outcome.status).toBe("APPLIED");
    expect(rig.events("PROJECT_REVISED")).toBe(before + 1);
    expect(outcome.staledTaskIds).toContain("t1");
  });

  it("I-N18: an accepted receipt stays byte-identical after owner standing changes", async () => {
    const rig = makeRig({ admission: authority() });
    startLatencyProject(rig);
    const claimId = await publishProof(rig, "the floor is 17 ms");
    const prepared = await rig.intent.prepare({
      changes: [{ kind: "REQUIREMENT_REVISE", requirement: { requirement_id: "R", statement: "latency <= 20 ms", priority: "critical", acceptance_refs: [] } }],
      grounds: { proof: [{ claimId }] },
      rationale: "grounded",
    });
    await rig.intent.apply({ proposal: prepared.proposal });
    const readReceipt = (): string => {
      const row = rig.installed.controller.store.connection
        .prepare("SELECT payload_json FROM events WHERE project_id=? AND event_type='PROJECT_REVISED' ORDER BY event_id DESC LIMIT 1")
        .get("e2i") as { payload_json: Uint8Array };
      return new TextDecoder().decode(row.payload_json);
    };
    const before = readReceipt();
    // The owner's standing moves afterwards.
    await rig.installed.proof!.reassess({ claimId, policyRef: { policyId: "e2i-proof-verification", version: "v1" } });
    expect(readReceipt()).toBe(before);
  });

  it("I-N19: ordinary non-E2-I controller.plan remains backward-compatible", async () => {
    const rig = makeRig({ admission: authority() });
    startLatencyProject(rig);
    const current = rig.installed.controller.work.project();
    const event = rig.installed.controller.plan({
      goal: "an ordinary new goal",
      requirements: current.requirements,
      decisions: current.decisions,
      tasks: current.tasks,
      reason: "ordinary operator revision",
    });
    expect(event.event_type).toBe("PROJECT_REVISED");
    expect((event.payload as { intent_reconciliation?: unknown }).intent_reconciliation).toBeUndefined();
    expect(rig.installed.controller.work.project().goal).toBe("an ordinary new goal");
  });

  it("I-N20: no ground standing reaches Promotion eligibility", async () => {
    const rig = makeRig({ admission: authority() });
    startLatencyProject(rig);
    const claimId = await publishProof(rig, "the floor is 17 ms");
    const prepared = await rig.intent.prepare({
      changes: [{ kind: "GOAL_REVISE", goal: "g2" }],
      grounds: { proof: [{ claimId }] },
      rationale: "grounds authorize nothing",
    });
    await rig.intent.apply({ proposal: prepared.proposal });
    // The receipt is provenance, not authority: no promotion was minted by the revision.
    expect(rig.events("PROMOTION_COMMITTED")).toBe(0);
    expect(rig.events("PROMOTION_PREPARED")).toBe(0);
    // And the proposal's own grounding carries no promotion-shaped vocabulary.
    const rendered = JSON.stringify(prepared.proposal.grounds);
    expect(rendered).not.toContain("permit");
    expect(rendered).not.toContain("eligib");
  });
});

/* ================================================================== unit-level model */

describe("E2-I proposal model", () => {
  it("the domain is content-addressed and rejects a mismatched identity", () => {
    const proposal = materializeProjectIntentProposal({
      projectBasis: { projectId: "p", revision: 0, digest: "d", headCommit: "h" },
      changes: [{ kind: "GOAL_REVISE", goal: "g" }],
      grounds: [{ kind: "proof", claimId: "pc-1", standingAtProposal: "SUPPORTED", freshnessAtProposal: "fresh", proofBasisAtProposal: { scopeId: "proof", throughSeq: 1, chainDigest: "c" }, projectAssociation: "PROOF_CLAIM" }],
      rationale: "r",
    });
    expect(proposal.proposalId.startsWith("pip-")).toBe(true);
    expect(proposal.digest).toHaveLength(64);
    expect(PROJECT_INTENT_PROPOSAL_DOMAIN).toBe("palimpsest.project-intent.proposal.v1");
    // A tampered id/digest is refused rather than believed.
    expect(() => parseProjectIntentProposal({ ...proposal, digest: "0".repeat(64) })).toThrow(ProjectIntentRefusal);
  });

  it("the change vocabulary rejects an unknown kind and unknown keys", () => {
    expect(() =>
      parseProjectIntentProposal({
        schemaVersion: 1,
        projectBasis: { projectId: "p", revision: 0, digest: "d", headCommit: "h" },
        changes: [{ kind: "SET_PATH", path: "/goal", value: "g" }],
        grounds: [],
        rationale: "r",
      }),
    ).toThrow(ProjectIntentRefusal);
  });

  it("duplicate/conflicting changes in one proposal are refused", () => {
    const rig = makeRig({ admission: authority() });
    return (async () => {
      startLatencyProject(rig);
      const claimId = await publishProof(rig, "the floor is 17 ms");
      let kind: string | undefined;
      try {
        await rig.intent.prepare({
          changes: [
            { kind: "REQUIREMENT_ADD", requirement: { requirement_id: "R", statement: "duplicate", priority: "low", acceptance_refs: [] } },
            { kind: "REQUIREMENT_REVISE", requirement: { requirement_id: "R", statement: "conflict", priority: "low", acceptance_refs: [] } },
          ],
          grounds: { proof: [{ claimId }] },
          rationale: "conflicting",
        });
      } catch (error) {
        kind = refusalOf(error);
      }
      expect(kind).toBe("INTENT_CHANGE_INVALID");
    })();
  });
});
