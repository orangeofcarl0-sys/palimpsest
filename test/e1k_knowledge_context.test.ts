/**
 * E1-K — GOVERNED KNOWLEDGE REUSE & CONTEXT CAPITALIZATION.
 *
 * The adversarial suite K-N01…K-N16 and the positive suite K-P01…K-P05, driven through the REAL
 * context owner and REAL owner services (Proof, Reasoning, ProjectWorkspace). No policy is
 * re-implemented here: the tests exercise the same path a deployment uses, including the late-bound
 * provider the composition installs.
 *
 * The one fixture that is not a real owner is the DSH worker, which is absent by design — the
 * delivery path is proven end-to-end by `gate:e1-k-live` on a real packaged host.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  PROOF_STATEMENT_TYPE,
  SqliteProofEvidenceStore,
  localProofBlobStore,
  makeProofEvidenceService,
  materializeProofSourceRevisionRef,
} from "../src/proof_asset/index.js";
import type { ProofClaimStanding, ProofEvidenceService, ProofPolicyRef, ProofVerificationPolicyPort } from "../src/proof_asset/index.js";
import {
  REASONING_STATEMENT_TYPE,
  SqliteReasoningCellStore,
  invalidationAdmissionDigestOf,
  invalidationVerificationDigestOf,
  makeReasoningCellService,
  reasoningAdmissionDigestOf,
  reasoningVerificationDigestOf,
} from "../src/reasoning_cell/index.js";
import type { ReasoningCellService, ReasoningEpistemicAdmissionPolicyPort, ReasoningVerificationPolicyPort } from "../src/reasoning_cell/index.js";
import { SqliteProjectAssetAssociationStore, makeProjectWorkspaceService } from "../src/project_workspace/index.js";
import type { ProjectWorkspaceService } from "../src/project_workspace/index.js";
import { composeContextKnowledgePorts } from "../src/composition/context_knowledge.js";
import { ContextKnowledgeRefusal } from "../src/context/knowledge.js";
import type { ContextKnowledgePorts, KnowledgeSelectionRequest } from "../src/context/knowledge.js";
import { ProjectController, DEFAULT_HEAD_COMMIT } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";

import { FakeClock, taskSpec, tempStatePath } from "./helpers.js";

const PROJECT = "e1k-project";
/**
 * The FakeGitPort must know the project's GENESIS commit, because `claim` materializes the world at
 * `project.head_commit` and an unknown base commit makes the effect throw — surfacing as Ordarium's
 * `UncertainOperationError` rather than as the real cause. The canonical constant is the same one the
 * controller seeds a genesis project with.
 */
const HEAD = DEFAULT_HEAD_COMMIT;
const DIR = mkdtempSync(join(tmpdir(), "palimpsest-e1k-"));
afterAll(() => {
  try {
    rmSync(DIR, { recursive: true, force: true });
  } catch {
    /* windows handle */
  }
});
let seq = 0;
/** A fresh, EXISTING directory per rig: every durable store (incl. the Ordarium ledger) lives here. */
const nextDir = (): string => {
  const dir = join(DIR, `rig-${++seq}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};
const bytesOf = (text: string): Uint8Array => new TextEncoder().encode(text);

/** The confirmed standard the worker path needs: without one no completion contract can be derived. */
const STANDARD = Object.freeze({
  statement: "tests pass and scope respected",
  clauses: Object.freeze([
    Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze(["node", "-e", "process.exit(0)"]), predicate: "tests_pass" as const }),
    Object.freeze({ kind: "scope_respected" as const }),
  ]),
  derivedFrom: Object.freeze(["e1k fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

function trustedPolicy(): TaskPolicy {
  return new TaskPolicy({
    policy_id: "trusted-default",
    read_paths: ["src"],
    allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
    network_policy: "deny",
    network_allowlist: [],
    timeout_s: 60,
    lease_s: 10,
    attempt_limit: 3,
    candidate_limit: 1,
  });
}

/* ------------------------------------------------------------------ owner fixtures */

/** A mutable script so a test can move the owner's standing AFTER a compile (K-N05). */
interface ProofScript {
  forced: ProofClaimStanding | undefined;
}

function proofPolicy(script: ProofScript): ProofVerificationPolicyPort {
  return {
    policyRef: { policyId: "test-verification", version: "v1" } satisfies ProofPolicyRef,
    async verify({ candidate }) {
      const supporting = candidate.supportingEvidence.map((entry) => entry.evidenceId);
      const contradicting = candidate.contradictingEvidence.map((entry) => entry.evidenceId);
      const standing: ProofClaimStanding =
        script.forced ?? (supporting.length > 0 && contradicting.length === 0 ? "SUPPORTED" : "INCONCLUSIVE");
      return { standing, supportingEvidenceIds: supporting, contradictingEvidenceIds: contradicting };
    },
  };
}

function reasoningVerification(): ReasoningVerificationPolicyPort {
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

function reasoningAdmission(): ReasoningEpistemicAdmissionPolicyPort {
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

/* ------------------------------------------------------------------ the rig */

interface Rig {
  readonly controller: ProjectController;
  readonly store: EventStore;
  readonly git: FakeGitPort;
  readonly proof: ProofEvidenceService;
  readonly reasoning: ReasoningCellService;
  readonly workspace: ProjectWorkspaceService;
  /** The late-bound holder the controller reads through — set once a bridge is composed. */
  readonly holder: { current: ContextKnowledgePorts | undefined };
  readonly proofScript: ProofScript;
  readonly cleanup: () => Promise<void>;
}

/**
 * One rig, one controller. The controller is built with the SAME read-through provider the real
 * composition installs, and `holder.current` is set by `withAttempt` — so every compile in this file
 * goes through the production path rather than a test-only bypass.
 */
function makeRig(): Rig {
  const root = nextDir();
  const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
  const git = new FakeGitPort(HEAD);
  // Per-rig Ordarium ledger: attempt ids are deterministic, so two rigs sharing one ledger would
  // collide on the SAME `worldCreate` operation id and Ordarium would refuse the "retry".
  const effects = createPalimpsestEffects({ databasePath: join(root, "ordarium.sqlite"), git });
  const proofScript: ProofScript = { forced: undefined };
  const proof = makeProofEvidenceService({
    store: new SqliteProofEvidenceStore(join(root, "proof.sqlite")),
    blob: localProofBlobStore(join(root, "proof-blobs")),
    verificationPolicy: proofPolicy(proofScript),
  });
  const reasoning = makeReasoningCellService({
    store: new SqliteReasoningCellStore(join(root, "cells.sqlite")),
    verificationPolicy: reasoningVerification(),
    admissionPolicy: reasoningAdmission(),
  });
  const holder: { current: ContextKnowledgePorts | undefined } = { current: undefined };
  const controller = new ProjectController({
    store,
    effects,
    projectId: PROJECT,
    policy: trustedPolicy(),
    standard: STANDARD,
    contextKnowledge: () => holder.current,
    clock: () => "2026-09-27T00:00:00Z",
  });
  const workspace = makeProjectWorkspaceService({
    controller,
    associations: new SqliteProjectAssetAssociationStore(join(root, "workspace.sqlite")),
    clock: () => "2026-09-27T00:00:00Z",
  });
  return {
    controller,
    store,
    git,
    proof,
    reasoning,
    workspace,
    holder,
    proofScript,
    cleanup: async () => {
      await effects.close();
      store.close();
    },
  };
}

/** Start the project, drive one attempt to RUNNING, and compose the knowledge bridge over it. */
async function withAttempt(rig: Rig): Promise<string> {
  rig.controller.start({ projectId: PROJECT, goal: "g", tasks: [taskSpec("task-1")] });
  rig.controller.step();
  const created = rig.controller.step()!;
  const attemptId = created.entity_id;
  rig.git.seedWorktreeFiles(attemptId, { "src/task-1.py": "task implementation\n" });
  await rig.controller.claim(attemptId);
  if (rig.holder.current === undefined) {
    rig.holder.current = composeContextKnowledgePorts({
      projectId: PROJECT,
      proof: rig.proof,
      reasoning: rig.reasoning,
      projectWorkspace: rig.workspace,
    });
  }
  return attemptId;
}

/** A controller with a DIFFERENT knowledge bridge over the same durable store — used for scoping tests. */
function controllerWith(rig: Rig, ports: ContextKnowledgePorts | undefined): ProjectController {
  const root = nextDir();
  return new ProjectController({
    store: rig.store,
    effects: createPalimpsestEffects({ databasePath: join(root, "ordarium-alt.sqlite"), git: rig.git }),
    projectId: PROJECT,
    policy: trustedPolicy(),
    standard: STANDARD,
    ...(ports === undefined ? {} : { contextKnowledge: () => ports }),
    clock: () => "2026-09-27T00:00:00Z",
  });
}

/* ------------------------------------------------------------------ owner actions */

/** Publish one Proof claim and return its claimId. */
async function publishClaim(proof: ProofEvidenceService, sourceId: string, statement: string): Promise<string> {
  const imported = await proof.importSource({ bytes: bytesOf(`body-${sourceId}`), mediaType: "text/plain", label: sourceId, provenance: "LOCAL_IMPORT", sourceId });
  const ref = materializeProofSourceRevisionRef({ sourceId, revision: imported.revision.revision, contentDigest: imported.revision.contentDigest });
  const evidence = await proof.recordEvidence({ sourceRevision: ref, selector: { kind: "WHOLE_SOURCE" } });
  const candidate = await proof.prepareCandidate({ claimType: PROOF_STATEMENT_TYPE, content: { statement }, supportingEvidenceIds: [evidence.evidenceId], origin: "MANUAL" });
  await proof.verify({ candidateId: candidate.candidateId });
  const result = await proof.decidePublication({ candidateId: candidate.candidateId });
  if (result.claimId === undefined) throw new Error("the fixture's claim was not published");
  return result.claimId;
}

/** Open a cell, admit ONE claim and return its claimId (each test uses a fresh cell). */
async function admitClaim(reasoning: ReasoningCellService, cellId: string, statement: string): Promise<string> {
  await reasoning.openCell({ cellId, objective: "answer Q", verificationPolicyRef: { policyId: "V", version: "1" }, admissionPolicyRef: { policyId: "A", version: "1" } });
  const branch = await reasoning.openBranch({ cellId, question: `q-${statement}` });
  const submitted = await reasoning.submitCandidate({ cellId, branchId: branch.branch.ref.branchId, type: REASONING_STATEMENT_TYPE, content: { statement } });
  await reasoning.evaluateCandidate({ cellId, candidateDigest: submitted.candidate.candidateDigest });
  const frontier = await reasoning.frontier({ cellId });
  const first = frontier.claims[0];
  if (first === undefined) throw new Error("the fixture's reasoning claim was not admitted");
  return first.ref.claimId;
}

async function associate(workspace: ProjectWorkspaceService, kind: "PROOF_CLAIM" | "REASONING_CELL", id: string): Promise<void> {
  await workspace.associateAsset({ projectId: PROJECT, assetKind: kind, canonicalRef: { kind, id }, associationKind: "MANUAL", provenance: "e1k-test" });
}

const refusalOf = (error: unknown): string | undefined =>
  error instanceof ContextKnowledgeRefusal ? error.kind : undefined;

function eventCount(store: EventStore): number {
  return (store.connection.prepare("SELECT COUNT(*) AS c FROM events").get() as { c: number }).c;
}

/** How many CONTEXT_MANIFEST_ADDED events this attempt's compile produced. */
function manifestAppends(store: EventStore, attemptId: string): number {
  return (
    store.connection
      .prepare("SELECT COUNT(*) AS c FROM events WHERE project_id=? AND event_type='CONTEXT_MANIFEST_ADDED' AND entity_id=(SELECT manifest_id FROM context_manifests WHERE project_id=? AND task_id='task-1' LIMIT 1)")
      .get(PROJECT, PROJECT) as { c: number }
  ).c;
}

/** Total manifest events for the project — enough to detect "zero write" precisely. */
function manifestEvents(store: EventStore): number {
  return (store.connection.prepare("SELECT COUNT(*) AS c FROM events WHERE project_id=? AND event_type='CONTEXT_MANIFEST_ADDED'").get(PROJECT) as { c: number }).c;
}

/** A request kept in a variable to satisfy the "no inline literal" reading of the API. */
function request(input: KnowledgeSelectionRequest): KnowledgeSelectionRequest {
  return input;
}

/* ================================================================== negative suite */

describe("E1-K adversarial suite (K-N01…K-N16)", () => {
  it("K-N01: an unassociated Proof request is refused and writes zero manifests", async () => {
    const rig = makeRig();
    try {
      const attemptId = await withAttempt(rig);
      const claimId = await publishClaim(rig.proof, "src-n01", "unassociated claim");
      const before = manifestEvents(rig.store);
      let kind: string | undefined;
      try {
        await rig.controller.compileTaskContext(attemptId, { knowledge: request({ proof: [{ claimId }] }) });
      } catch (error) {
        kind = refusalOf(error);
      }
      expect(kind).toBe("KNOWLEDGE_NOT_PROJECT_ASSOCIATED");
      expect(manifestEvents(rig.store)).toBe(before);
    } finally {
      await rig.cleanup();
    }
  });

  it("K-N02: an inactive Reasoning request is refused and writes zero manifests", async () => {
    const rig = makeRig();
    try {
      const attemptId = await withAttempt(rig);
      const claimId = await admitClaim(rig.reasoning, "cell-n02", "to be invalidated");
      await associate(rig.workspace, "REASONING_CELL", "cell-n02");
      await rig.reasoning.requestInvalidation({ cellId: "cell-n02", targetClaimId: claimId, reason: "superseded" });
      const before = manifestEvents(rig.store);
      let kind: string | undefined;
      try {
        await rig.controller.compileTaskContext(attemptId, { knowledge: request({ reasoning: [{ cellId: "cell-n02", claimId }] }) });
      } catch (error) {
        kind = refusalOf(error);
      }
      expect(kind).toBe("KNOWLEDGE_REASONING_INACTIVE");
      expect(manifestEvents(rig.store)).toBe(before);
    } finally {
      await rig.cleanup();
    }
  });

  it("K-N03: a reasoning claim is never labelled Evidence or Truth", async () => {
    const rig = makeRig();
    try {
      const attemptId = await withAttempt(rig);
      const claimId = await admitClaim(rig.reasoning, "cell-n03", "epistemic claim");
      await associate(rig.workspace, "REASONING_CELL", "cell-n03");
      const compiled = await rig.controller.compileTaskContext(attemptId, { knowledge: request({ reasoning: [{ cellId: "cell-n03", claimId }] }) });
      const binding = compiled.manifest.knowledge!.find((entry) => entry.kind === "reasoning")!;
      expect(binding).toMatchObject({ kind: "reasoning", active_at_compile: true });
      const rendered = JSON.stringify(binding).toLowerCase();
      expect(rendered).not.toContain("evidence");
      expect(rendered).not.toContain("truth");
    } finally {
      await rig.cleanup();
    }
  });

  it("K-N04: a stale proof standing is refused, not silently bound as current", async () => {
    const rig = makeRig();
    try {
      const attemptId = await withAttempt(rig);
      // Publish a CURRENT claim, then move the owner's standing to STALE (a reassessment).
      const claimId = await publishClaim(rig.proof, "src-n04", "claim that goes stale");
      await associate(rig.workspace, "PROOF_CLAIM", claimId);
      rig.proofScript.forced = "STALE";
      await rig.proof.reassess({ claimId, policyRef: { policyId: "test-verification", version: "v1" } });
      let kind: string | undefined;
      try {
        await rig.controller.compileTaskContext(attemptId, { knowledge: request({ proof: [{ claimId }] }) });
      } catch (error) {
        kind = refusalOf(error);
      }
      expect(kind).toBe("KNOWLEDGE_STALE");
      expect(manifestEvents(rig.store)).toBe(0);
    } finally {
      await rig.cleanup();
    }
  });

  it("K-N05: a later standing change does not rewrite an old ContextManifest", async () => {
    const rig = makeRig();
    try {
      const attemptId = await withAttempt(rig);
      const claimId = await publishClaim(rig.proof, "src-n05", "claim that will be reassessed");
      await associate(rig.workspace, "PROOF_CLAIM", claimId);
      const compiled = await rig.controller.compileTaskContext(attemptId, { knowledge: request({ proof: [{ claimId }] }) });
      const frozen = structuredClone(compiled.manifest);
      const events = eventCount(rig.store);
      // The owner's standing MOVES after the compile.
      rig.proofScript.forced = "CONTRADICTED";
      await rig.proof.reassess({ claimId, policyRef: { policyId: "test-verification", version: "v1" } });
      // Recompiling returns the SAME historical manifest, and writes nothing.
      const again = await rig.controller.compileTaskContext(attemptId);
      expect(again.manifest).toEqual(frozen);
      expect(again.manifest.knowledge).toEqual(compiled.manifest.knowledge);
      expect(eventCount(rig.store)).toBe(events);
    } finally {
      await rig.cleanup();
    }
  });

  it("K-N06: selected knowledge grants zero Work/Promotion authority", async () => {
    const rig = makeRig();
    try {
      const attemptId = await withAttempt(rig);
      const claimId = await publishClaim(rig.proof, "src-n06", "authorizes nothing");
      await associate(rig.workspace, "PROOF_CLAIM", claimId);
      const compiled = await rig.controller.compileTaskContext(attemptId, { knowledge: request({ proof: [{ claimId }] }) });
      const knowledge = JSON.stringify(compiled.manifest.knowledge);
      expect(knowledge).not.toContain("permit");
      expect(knowledge).not.toContain("authorization");
      expect(knowledge).not.toContain("eligib");
      // The attempt's own canonical state is untouched by the selection.
      expect(rig.controller.attemptWorkRecord(attemptId)?.state).toBe("RUNNING");
    } finally {
      await rig.cleanup();
    }
  });

  it("K-N07: same basis + same request + same owner bases ⇒ byte-identical binding", async () => {
    const rig = makeRig();
    try {
      const attemptId = await withAttempt(rig);
      const claimId = await publishClaim(rig.proof, "src-n07", "deterministic claim");
      await associate(rig.workspace, "PROOF_CLAIM", claimId);
      const compiled = await rig.controller.compileTaskContext(attemptId, { knowledge: request({ proof: [{ claimId }] }) });
      const rendered = JSON.stringify(compiled.manifest.knowledge);
      // A SECOND attempt over the same owners must bind the identical bytes.
      rig.controller.report(attemptId, { workerStatus: "failed", summary: "retry" });
      let next = rig.controller.step()!;
      for (let step = 0; step < 8 && next.event_type !== "ATTEMPT_CREATED"; step += 1) next = rig.controller.step()!;
      expect(next.event_type).toBe("ATTEMPT_CREATED");
      await rig.controller.claim(next.entity_id);
      const second = await rig.controller.compileTaskContext(next.entity_id, { knowledge: request({ proof: [{ claimId }] }) });
      expect(JSON.stringify(second.manifest.knowledge)).toBe(rendered);
    } finally {
      await rig.cleanup();
    }
  });

  it("K-N08: a bounded context does not inject all project assets", async () => {
    const rig = makeRig();
    try {
      const attemptId = await withAttempt(rig);
      const selected = await publishClaim(rig.proof, "src-n08a", "selected");
      const other = await publishClaim(rig.proof, "src-n08b", "NOT selected");
      await associate(rig.workspace, "PROOF_CLAIM", selected);
      await associate(rig.workspace, "PROOF_CLAIM", other);
      const compiled = await rig.controller.compileTaskContext(attemptId, { knowledge: request({ proof: [{ claimId: selected }] }) });
      expect(compiled.manifest.knowledge).toHaveLength(1);
      expect((compiled.manifest.knowledge![0] as { proof_claim_id: string }).proof_claim_id).toBe(selected);
    } finally {
      await rig.cleanup();
    }
  });

  it("K-N09a: no request + no ports ⇒ ordinary compile succeeds", async () => {
    const rig = makeRig();
    try {
      const attemptId = await withAttempt(rig);
      // A controller with NO provider at all — the pre-E1-K deployment.
      const blind = controllerWith(rig, undefined);
      const compiled = await blind.compileTaskContext(attemptId);
      expect(compiled.manifest.knowledge).toBeUndefined();
    } finally {
      await rig.cleanup();
    }
  });

  it("K-N09b: explicit request + absent port ⇒ KNOWLEDGE_CAPABILITY_UNAVAILABLE, zero write", async () => {
    const rig = makeRig();
    try {
      const attemptId = await withAttempt(rig);
      const blind = controllerWith(rig, undefined);
      const before = manifestEvents(rig.store);
      let kind: string | undefined;
      try {
        await blind.compileTaskContext(attemptId, { knowledge: request({ proof: [{ claimId: "pc-whatever" }] }) });
      } catch (error) {
        kind = refusalOf(error);
      }
      expect(kind).toBe("KNOWLEDGE_CAPABILITY_UNAVAILABLE");
      expect(manifestEvents(rig.store)).toBe(before);
    } finally {
      await rig.cleanup();
    }
  });

  it("K-N10: D5 PriorResultContext remains semantically distinct from knowledge", async () => {
    const rig = makeRig();
    try {
      const attemptId = await withAttempt(rig);
      const claimId = await publishClaim(rig.proof, "src-n10", "distinct from prior result");
      await associate(rig.workspace, "PROOF_CLAIM", claimId);
      const compiled = await rig.controller.compileTaskContext(attemptId, { knowledge: request({ proof: [{ claimId }] }) });
      // A knowledge binding never fabricates a continuation block.
      expect(compiled.manifest.continuation).toBeUndefined();
      expect(compiled.manifest.knowledge).toHaveLength(1);
      // And a knowledge ref is not an exact/source/evidence reference.
      expect(compiled.manifest.exact.map((entry) => entry.ref)).not.toContain(claimId);
    } finally {
      await rig.cleanup();
    }
  });

  it("K-N11: a foreign project id cannot see another project's assets in a shared store", async () => {
    const rig = makeRig();
    try {
      await withAttempt(rig);
      const claimId = await publishClaim(rig.proof, "src-n11", "this project's claim");
      await associate(rig.workspace, "PROOF_CLAIM", claimId);
      // The SAME owners, adapted under a DIFFERENT project scope: membership must be false.
      const foreign = composeContextKnowledgePorts({ projectId: "someone-else", proof: rig.proof, reasoning: rig.reasoning, projectWorkspace: rig.workspace })!;
      expect(await foreign.projectAssets!.associated("someone-else", "PROOF_CLAIM", claimId)).toBe(false);
      // The correctly-scoped bridge still answers true.
      expect(await rig.holder.current!.projectAssets!.associated(PROJECT, "PROOF_CLAIM", claimId)).toBe(true);
    } finally {
      await rig.cleanup();
    }
  });

  it("K-N12: no external/global asset is auto-contextualized", async () => {
    const rig = makeRig();
    try {
      const attemptId = await withAttempt(rig);
      const claimId = await publishClaim(rig.proof, "src-n12", "available but unselected");
      await associate(rig.workspace, "PROOF_CLAIM", claimId);
      // Availability (associated, published, current) yet NO request ⇒ nothing is bound.
      const compiled = await rig.controller.compileTaskContext(attemptId);
      expect(compiled.manifest.knowledge).toBeUndefined();
    } finally {
      await rig.cleanup();
    }
  });

  it("K-N13: recompiling with a DIFFERENT request returns M0 byte-for-byte, zero append", async () => {
    const rig = makeRig();
    try {
      const attemptId = await withAttempt(rig);
      const claimId = await publishClaim(rig.proof, "src-n13", "bound on the first compile");
      await associate(rig.workspace, "PROOF_CLAIM", claimId);
      const compiled = await rig.controller.compileTaskContext(attemptId, { knowledge: request({ proof: [{ claimId }] }) });
      const frozen = structuredClone(compiled.manifest.knowledge);
      const events = eventCount(rig.store);
      const second = await rig.controller.compileTaskContext(attemptId, { knowledge: request({ proof: [{ claimId: "pc-other" }] }) });
      expect(second.manifest).toEqual(compiled.manifest);
      expect(second.manifest.knowledge).toEqual(frozen);
      expect(eventCount(rig.store)).toBe(events);
    } finally {
      await rig.cleanup();
    }
  });

  it("K-N14: a Proof basis change inside the observation window ⇒ KNOWLEDGE_OBSERVATION_RACED", async () => {
    const rig = makeRig();
    try {
      const attemptId = await withAttempt(rig);
      const claimId = await publishClaim(rig.proof, "src-n14", "raced claim");
      await associate(rig.workspace, "PROOF_CLAIM", claimId);
      // A port whose basis ADVANCES between the before/after reads — the exact race §12 guards.
      let call = 0;
      const racing: ContextKnowledgePorts = {
        projectAssets: { associated: async () => true },
        proofAssets: {
          observeBasis: async () => {
            call += 1;
            return { scopeId: "proof", throughSeq: call === 1 ? 1 : 2, chainDigest: `d${call}` };
          },
          observeClaim: async () => ({ classified: "observed", effectiveStanding: "SUPPORTED", freshness: "fresh" }),
          readClaim: async () => undefined,
        },
      };
      const before = manifestEvents(rig.store);
      let kind: string | undefined;
      try {
        await controllerWith(rig, racing).compileTaskContext(attemptId, { knowledge: request({ proof: [{ claimId }] }) });
      } catch (error) {
        kind = refusalOf(error);
      }
      expect(kind).toBe("KNOWLEDGE_OBSERVATION_RACED");
      expect(manifestEvents(rig.store)).toBe(before);
    } finally {
      await rig.cleanup();
    }
  });

  it("K-N15: the standard delegation compile carries the selection to the worker context", async () => {
    const rig = makeRig();
    try {
      const attemptId = await withAttempt(rig);
      const claimId = await publishClaim(rig.proof, "src-n15", "reaches the worker");
      await associate(rig.workspace, "PROOF_CLAIM", claimId);
      // The SAME call the delegation kernel makes, with the selection carried alongside.
      const context = await rig.controller.workWorkerAttemptContext(attemptId, { knowledge: request({ proof: [{ claimId }] }) });
      const handles = context.compiled.handles.map((entry) => entry.handle);
      expect(handles).toContain(`@ctx/proof/${claimId}`);
      // The worker receives the HANDLE only — no proof body is booted.
      expect(context.compiled.boot.some((entry) => entry.kind === "proof")).toBe(false);
    } finally {
      await rig.cleanup();
    }
  });

  it("K-N16: an ordinary execution with NO request is equivalent to pre-E1-K operation", async () => {
    const rig = makeRig();
    try {
      const attemptId = await withAttempt(rig);
      const context = await rig.controller.workWorkerAttemptContext(attemptId);
      expect(context.compiled.boot.map((entry) => entry.kind)).not.toContain("proof");
      expect(context.compiled.handles.map((entry) => entry.kind)).not.toContain("proof");
      const manifest = await rig.controller.compileTaskContext(attemptId);
      expect(manifest.manifest.knowledge).toBeUndefined();
      expect(manifest.distribution.handles.every((entry) => entry.kind === "source" || entry.kind === "evidence")).toBe(true);
    } finally {
      await rig.cleanup();
    }
  });
});

/* ================================================================== positive suite */

describe("E1-K positive suite (K-P01…K-P05)", () => {
  it("K-P01: a published/current project-associated Proof claim binds", async () => {
    const rig = makeRig();
    try {
      const attemptId = await withAttempt(rig);
      const claimId = await publishClaim(rig.proof, "src-p01", "supported");
      await associate(rig.workspace, "PROOF_CLAIM", claimId);
      const compiled = await rig.controller.compileTaskContext(attemptId, { knowledge: request({ proof: [{ claimId }] }) });
      const binding = compiled.manifest.knowledge![0]! as { kind: string; proof_claim_id: string; standing_at_compile: string; handle: string };
      expect(binding.kind).toBe("proof");
      expect(binding.proof_claim_id).toBe(claimId);
      // §11: the vocabulary is preserved verbatim — SUPPORTED is recorded, not coerced to true.
      expect(binding.standing_at_compile).toBe("SUPPORTED");
      expect(binding.handle).toBe(`@ctx/proof/${claimId}`);
    } finally {
      await rig.cleanup();
    }
  });

  it("K-P02: an active admitted claim in a project-associated cell binds", async () => {
    const rig = makeRig();
    try {
      const attemptId = await withAttempt(rig);
      const claimId = await admitClaim(rig.reasoning, "cell-p02", "admitted");
      await associate(rig.workspace, "REASONING_CELL", "cell-p02");
      const compiled = await rig.controller.compileTaskContext(attemptId, { knowledge: request({ reasoning: [{ cellId: "cell-p02", claimId }] }) });
      const binding = compiled.manifest.knowledge![0]! as { kind: string; cell_id: string; claim_id: string; active_at_compile: boolean; handle: string };
      expect(binding.kind).toBe("reasoning");
      expect(binding.cell_id).toBe("cell-p02");
      expect(binding.claim_id).toBe(claimId);
      expect(binding.active_at_compile).toBe(true);
      expect(binding.handle).toBe(`@ctx/reasoning/cell-p02/${claimId}`);
    } finally {
      await rig.cleanup();
    }
  });

  it("K-P03: Proof + Reasoning together produce a deterministic sorted manifest", async () => {
    const rig = makeRig();
    try {
      const attemptId = await withAttempt(rig);
      const claimA = await publishClaim(rig.proof, "src-p03a", "a");
      const claimB = await publishClaim(rig.proof, "src-p03b", "b");
      await associate(rig.workspace, "PROOF_CLAIM", claimA);
      await associate(rig.workspace, "PROOF_CLAIM", claimB);
      const rClaim = await admitClaim(rig.reasoning, "cell-p03", "r");
      await associate(rig.workspace, "REASONING_CELL", "cell-p03");
      // Request in a scrambled order; bindings must come out proof-first, each group sorted.
      const compiled = await rig.controller.compileTaskContext(attemptId, {
        knowledge: request({ reasoning: [{ cellId: "cell-p03", claimId: rClaim }], proof: [{ claimId: claimB }, { claimId: claimA }] }),
      });
      expect(compiled.manifest.knowledge!.map((entry) => entry.kind)).toEqual(["proof", "proof", "reasoning"]);
      const proofIds = compiled.manifest.knowledge!
        .filter((entry) => entry.kind === "proof")
        .map((entry) => (entry as { proof_claim_id: string }).proof_claim_id);
      expect(proofIds).toEqual([...proofIds].sort());
    } finally {
      await rig.cleanup();
    }
  });

  it("K-P04: a cold restart still resolves the same project assets", async () => {
    const rig = makeRig();
    try {
      const attemptId = await withAttempt(rig);
      const claimId = await publishClaim(rig.proof, "src-p04", "survives restart");
      await associate(rig.workspace, "PROOF_CLAIM", claimId);
      await rig.controller.compileTaskContext(attemptId, { knowledge: request({ proof: [{ claimId }] }) });
      // A NEW controller over the same durable store, with a bridge re-derived from the same owners.
      const revived = controllerWith(rig, composeContextKnowledgePorts({ projectId: PROJECT, proof: rig.proof, reasoning: rig.reasoning, projectWorkspace: rig.workspace })!);
      const pulled = await revived.fetchContext(attemptId, `@ctx/proof/${claimId}`);
      expect(pulled).toBeDefined();
      expect((pulled as { body: unknown }).body).toBeDefined();
    } finally {
      await rig.cleanup();
    }
  });

  it("K-P05: an old manifest stays historical after owner standing changes", async () => {
    const rig = makeRig();
    try {
      const attemptId = await withAttempt(rig);
      const claimId = await publishClaim(rig.proof, "src-p05", "historical binding");
      await associate(rig.workspace, "PROOF_CLAIM", claimId);
      const compiled = await rig.controller.compileTaskContext(attemptId, { knowledge: request({ proof: [{ claimId }] }) });
      const boundStanding = (compiled.manifest.knowledge![0] as { standing_at_compile: string }).standing_at_compile;
      // The owner moves; a PULL reports the current view alongside the IMMUTABLE compile-time snapshot.
      rig.proofScript.forced = "CONTRADICTED";
      await rig.proof.reassess({ claimId, policyRef: { policyId: "test-verification", version: "v1" } });
      const pulled = (await rig.controller.fetchContext(attemptId, `@ctx/proof/${claimId}`)) as {
        binding: { standing_at_compile: string };
        current: { effectiveStanding: string } | null;
      };
      expect(pulled.binding.standing_at_compile).toBe(boundStanding);
      expect(pulled.current?.effectiveStanding).toBe("CONTRADICTED");
    } finally {
      await rig.cleanup();
    }
  });
});
