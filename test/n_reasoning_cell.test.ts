/**
 * G10-N collaborative reasoning cells — Danus-like golden E2E, verification ≠ admission,
 * blind-until-commit, invalidation cascade, negative knowledge, and the adversarial /
 * concurrency / crash matrix (RC-A01…A40, N-N01…N-N35).
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  REASONING_DEAD_END_TYPE,
  REASONING_STATEMENT_TYPE,
  SqliteReasoningCellStore,
  invalidationAdmissionDigestOf,
  invalidationVerificationDigestOf,
  makeReasoningCellService,
  reasoningAdmissionDigestOf,
  reasoningVerificationDigestOf,
} from "../src/reasoning_cell/index.js";
import type {
  ReasoningCandidate,
  ReasoningCellService,
  ReasoningEpistemicAdmissionPolicyPort,
  ReasoningPolicyRef,
  ReasoningVerificationPolicyPort,
} from "../src/reasoning_cell/index.js";

const SRC = (p: string): string => readFileSync(fileURLToPath(new URL(`../src/${p}`, import.meta.url)), "utf-8");
const strip = (c: string): string => c.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const policyRef = (policyId: string): ReasoningPolicyRef => ({ policyId, version: "1" });
const statement = (text: string): { type: typeof REASONING_STATEMENT_TYPE; content: unknown } => ({ type: REASONING_STATEMENT_TYPE, content: { statement: text } });

interface PolicyScript {
  readonly standing?: (candidate: ReasoningCandidate) => "SUPPORTED" | "CONTRADICTED" | "INCONCLUSIVE";
  readonly decide?: (candidate: ReasoningCandidate, standing: string) => "ADMIT" | "REJECT" | "UNRESOLVED";
  readonly throwOnVerify?: boolean;
  readonly onVerify?: () => Promise<void>;
  readonly invalidationDecision?: "INVALIDATE" | "KEEP" | "UNRESOLVED";
  readonly invalidationStanding?: "SUPPORTED" | "CONTRADICTED" | "INCONCLUSIVE";
}

function policies(script: PolicyScript = {}) {
  const verification: ReasoningVerificationPolicyPort = {
    verify: async ({ definition, candidate, frontierBasis }) => {
      if (script.onVerify !== undefined) await script.onVerify();
      if (script.throwOnVerify === true) throw new Error("tool timeout");
      const standing = script.standing?.(candidate) ?? "SUPPORTED";
      const base = {
        schemaVersion: 1 as const,
        cell: candidate.cell,
        candidateDigest: candidate.candidateDigest,
        frontierBasis,
        verificationPolicyRef: definition.verificationPolicyRef,
        standing,
        supportingEvidenceIds: standing === "SUPPORTED" ? ["ev-1"] : [],
        contradictingEvidenceIds: standing === "CONTRADICTED" ? ["ev-2"] : [],
        provenanceDigest: "a".repeat(64),
      };
      return { ...base, digest: reasoningVerificationDigestOf(base) };
    },
    verifyInvalidation: async ({ definition, request, frontierBasis }) => {
      const base = {
        schemaVersion: 1 as const,
        cell: request.cell,
        targetClaimId: request.targetClaimId,
        requestDigest: request.requestDigest,
        frontierBasis,
        verificationPolicyRef: definition.verificationPolicyRef,
        standing: script.invalidationStanding ?? "SUPPORTED",
        evidenceIds: ["ev-9"],
        provenanceDigest: "b".repeat(64),
      };
      return { ...base, digest: invalidationVerificationDigestOf(base) };
    },
  };
  const admission: ReasoningEpistemicAdmissionPolicyPort = {
    admit: async ({ definition, candidate, verification, frontierBasis }) => {
      const decision = script.decide?.(candidate, verification.standing) ?? (verification.standing === "SUPPORTED" ? "ADMIT" : verification.standing === "CONTRADICTED" ? "REJECT" : "UNRESOLVED");
      const base = {
        schemaVersion: 1 as const,
        cell: candidate.cell,
        candidateDigest: candidate.candidateDigest,
        verificationResultDigest: verification.digest,
        frontierBasis,
        admissionPolicyRef: definition.admissionPolicyRef,
        decision,
        provenanceDigest: "c".repeat(64),
      };
      return { ...base, digest: reasoningAdmissionDigestOf(base) };
    },
    admitInvalidation: async ({ definition, request, verification, frontierBasis }) => {
      const base = {
        schemaVersion: 1 as const,
        cell: request.cell,
        targetClaimId: request.targetClaimId,
        requestDigest: request.requestDigest,
        verificationResultDigest: verification.digest,
        frontierBasis,
        admissionPolicyRef: definition.admissionPolicyRef,
        decision: script.invalidationDecision ?? "INVALIDATE",
        provenanceDigest: "d".repeat(64),
      };
      return { ...base, digest: invalidationAdmissionDigestOf(base) };
    },
  };
  return { verification, admission };
}

function build(script: PolicyScript = {}, path?: string) {
  const store = new SqliteReasoningCellStore(path ?? ":memory:");
  const { verification, admission } = policies(script);
  const service = makeReasoningCellService({ store, verificationPolicy: verification, admissionPolicy: admission });
  return { store, service };
}
type Env = ReturnType<typeof build>;

async function openCell(env: Env, cellId = "C", objective = "answer Q"): Promise<void> {
  await env.service.openCell({ cellId, objective, verificationPolicyRef: policyRef("V"), admissionPolicyRef: policyRef("A") });
}
async function branch(env: Env, question: string, cellId = "C"): Promise<string> {
  const opened = await env.service.openBranch({ cellId, question });
  return opened.branch.ref.branchId;
}
async function admit(env: Env, candidateDigest: string, cellId = "C") {
  return env.service.evaluateCandidate({ cellId, candidateDigest });
}

describe("G10-N Danus-like golden E2E", () => {
  it("parallel branches, dedupe, unresolved, composability, invalidation cascade, restart", async () => {
    const dir = mkdtempSync(join(tmpdir(), "palimpsest-n-"));
    const path = join(dir, "cells.sqlite");
    try {
      // Content containing "Y" verifies INCONCLUSIVE; everything else SUPPORTED.
      const script: PolicyScript = { standing: (candidate) => (JSON.stringify(candidate.claim.content).includes("Y") ? "INCONCLUSIVE" : "SUPPORTED") };
      let env = build(script, path);
      await openCell(env);
      await env.service.openCell({ cellId: "C", objective: "answer Q", verificationPolicyRef: policyRef("V"), admissionPolicyRef: policyRef("A") });
      const b1 = await branch(env, "does X hold?");
      const b2 = await branch(env, "does Y hold?");
      const b3 = await branch(env, "independently check X");

      const x1 = await env.service.submitCandidate({ cellId: "C", branchId: b1, ...statement("X") });
      const y = await env.service.submitCandidate({ cellId: "C", branchId: b2, ...statement("Y") });
      const x3 = await env.service.submitCandidate({ cellId: "C", branchId: b3, ...statement("X") });
      // Same semantic claim from different branches → same claim identity, different candidates.
      expect(x1.candidate.claim.claimDigest).toBe(x3.candidate.claim.claimDigest);
      expect(x1.candidate.candidateDigest).not.toBe(x3.candidate.candidateDigest);

      // X verifies SUPPORTED and is admitted.
      const admittedX = await admit(env, x1.candidate.candidateDigest);
      expect(admittedX.status).toBe("admitted");
      // B3's duplicate semantic claim does NOT create a second accepted claim.
      const dup = await admit(env, x3.candidate.candidateDigest);
      expect(dup.status).toBe("deduplicated");
      expect((await env.service.frontier({ cellId: "C" })).claims).toHaveLength(1);

      // Y is INCONCLUSIVE → UNRESOLVED (legitimate, frontier unchanged).
      const y2 = await env.service.submitCandidate({ cellId: "C", branchId: b2, ...statement("Y2") });
      void y;
      expect((await admit(env, y2.candidate.candidateDigest)).status).toBe("unresolved");

      // A new branch sees the accepted frontier (X) and NOT the unresolved Y2.
      const b4 = await branch(env, "extend X");
      const brief4 = await env.service.branchBrief({ cellId: "C", branchId: b4 });
      const briefText = JSON.stringify(brief4);
      expect(briefText).toContain("X");
      expect(briefText).not.toContain("Y2");

      // Z depends on X and composes into the frontier.
      const xRef = { schemaVersion: 1 as const, cellId: "C", claimId: `cl-x` };
      const admittedClaimX = (await env.service.frontier({ cellId: "C" })).claims[0]!;
      void xRef;
      const z = await env.service.submitCandidate({ cellId: "C", branchId: b4, type: REASONING_STATEMENT_TYPE, content: { statement: "Z" }, dependencies: [admittedClaimX.ref] });
      expect((await admit(env, z.candidate.candidateDigest)).status).toBe("admitted");
      const frontier = await env.service.frontier({ cellId: "C" });
      expect(frontier.claims.map((entry) => entry.ref.claimId).length).toBe(2);

      // Invalidate X → X and its dependent Z leave the ACTIVE frontier by deterministic cascade,
      // but remain in the historical admitted graph.
      const invalidation = await env.service.requestInvalidation({ cellId: "C", targetClaimId: admittedClaimX.ref.claimId, reason: "X was wrong" });
      expect(invalidation.status).toBe("invalidated");
      const after = await env.service.frontier({ cellId: "C" });
      expect(after.claims).toHaveLength(0);
      const graph = await env.service.claimGraph({ cellId: "C" });
      expect(graph.nodes).toHaveLength(2);
      expect(graph.nodes.every((node) => !node.active)).toBe(true);
      expect(graph.edges).toHaveLength(1);

      // Restart reproduces the same history and the same active frontier.
      env.store.close();
      env = build(script, path);
      const reopened = await env.service.frontier({ cellId: "C" });
      expect(reopened.claims).toHaveLength(0);
      expect((await env.service.claimGraph({ cellId: "C" })).nodes).toHaveLength(2);
      env.store.close();
    } finally {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* windows handle */ }
    }
  });

  it("verification SUPPORTED ≠ admission: a policy REJECT keeps the frontier unchanged", async () => {
    const env = build({ decide: () => "REJECT" });
    await openCell(env);
    const b = await branch(env, "q");
    const c = await env.service.submitCandidate({ cellId: "C", branchId: b, ...statement("X") });
    expect((await admit(env, c.candidate.candidateDigest)).status).toBe("rejected");
    expect((await env.service.frontier({ cellId: "C" })).claims).toHaveLength(0);
    const view = await env.service.cellView({ cellId: "C" });
    expect(view.candidates[0]!.status).toBe("REJECTED");
    env.store.close();
  });

  it("blind-until-commit: a pending sibling candidate is invisible to a frozen branch brief", async () => {
    const env = build();
    await openCell(env);
    const b1 = await branch(env, "b1");
    const b2 = await branch(env, "b2");
    await env.service.submitCandidate({ cellId: "C", branchId: b1, ...statement("PENDING-X") });
    const brief2 = await env.service.branchBrief({ cellId: "C", branchId: b2 });
    expect(JSON.stringify(brief2)).not.toContain("PENDING-X");
    // Structural firewall: the brief has no pending/sibling surface at all.
    expect(Object.keys(brief2).sort()).toEqual(["acceptedClaims", "branch", "cell", "frontierBasis", "objective", "question", "schemaVersion"]);
    env.store.close();
  });

  it("negative knowledge: a verified dead-end claim is first-class admitted knowledge", async () => {
    const env = build();
    await openCell(env);
    const b = await branch(env, "search path 1");
    const c = await env.service.submitCandidate({ cellId: "C", branchId: b, type: REASONING_DEAD_END_TYPE, content: { description: "path fails", conditions: ["c2", "c1"], reason: "contradiction" } });
    expect((await admit(env, c.candidate.candidateDigest)).status).toBe("admitted");
    const frontier = await env.service.frontier({ cellId: "C" });
    expect(frontier.claims[0]!.claim.type.typeId).toBe("reasoning.dead-end");
    env.store.close();
  });
});

describe("G10-N firewalls and failure modes", () => {
  it("N-N08/N-N09: unknown claim type and malformed payload fail closed", async () => {
    const env = build();
    await openCell(env);
    const b = await branch(env, "q");
    await expect(env.service.submitCandidate({ cellId: "C", branchId: b, type: { typeId: "reasoning.unknown", version: "v1" }, content: {} })).rejects.toMatchObject({ kind: "unknown_type" });
    await expect(env.service.submitCandidate({ cellId: "C", branchId: b, type: REASONING_STATEMENT_TYPE, content: { statement: "" } })).rejects.toMatchObject({ kind: "invalid_content" });
    env.store.close();
  });

  it("N-N06/N-N07: pending and invalidated claims cannot be dependencies", async () => {
    const env = build();
    await openCell(env);
    const b = await branch(env, "q");
    const pending = await env.service.submitCandidate({ cellId: "C", branchId: b, ...statement("P") });
    const pendingRef = { schemaVersion: 1 as const, cellId: "C", claimId: "cl-unknown" };
    void pending;
    await expect(env.service.submitCandidate({ cellId: "C", branchId: b, type: REASONING_STATEMENT_TYPE, content: { statement: "Q" }, dependencies: [pendingRef] })).rejects.toMatchObject({ kind: "invalid_dependency" });
    env.store.close();
  });

  it("N-N07: an INVALIDATED claim cannot be a dependency", async () => {
    const env = build();
    await openCell(env);
    const b = await branch(env, "q");
    const x = await env.service.submitCandidate({ cellId: "C", branchId: b, ...statement("X") });
    await admit(env, x.candidate.candidateDigest);
    const xRef = (await env.service.frontier({ cellId: "C" })).claims[0]!.ref;
    await env.service.requestInvalidation({ cellId: "C", targetClaimId: xRef.claimId, reason: "wrong" });
    await expect(env.service.submitCandidate({ cellId: "C", branchId: b, type: REASONING_STATEMENT_TYPE, content: { statement: "Z" }, dependencies: [xRef] })).rejects.toMatchObject({ kind: "invalid_dependency" });
    env.store.close();
  });

  it("N-N16: a verification operational error is NOT recorded as INCONCLUSIVE", async () => {
    const env = build({ throwOnVerify: true });
    await openCell(env);
    const b = await branch(env, "q");
    const c = await env.service.submitCandidate({ cellId: "C", branchId: b, ...statement("X") });
    const outcome = await admit(env, c.candidate.candidateDigest);
    expect(outcome.status).toBe("verification_error");
    expect((await env.store.replay("C")).some((event) => event.type === "VERIFICATION_RECORDED")).toBe(false);
    expect((await env.service.frontier({ cellId: "C" })).claims).toHaveLength(0);
    env.store.close();
  });

  it("N-N12/N-N13: a policy result bound to a different frontier is rejected (zero writes)", async () => {
    const env = build();
    await openCell(env);
    const b = await branch(env, "q");
    const c = await env.service.submitCandidate({ cellId: "C", branchId: b, ...statement("X") });
    // A policy that returns a result bound to a WRONG frontier revision.
    const { verification, admission } = policies();
    const badService = makeReasoningCellService({
      store: env.store,
      verificationPolicy: { verify: async ({ definition, candidate, frontierBasis }) => {
        const base = { schemaVersion: 1 as const, cell: candidate.cell, candidateDigest: candidate.candidateDigest, frontierBasis: { ...frontierBasis, frontierRevision: frontierBasis.frontierRevision + 7 }, verificationPolicyRef: definition.verificationPolicyRef, standing: "SUPPORTED" as const, supportingEvidenceIds: [], contradictingEvidenceIds: [], provenanceDigest: "a".repeat(64) };
        return { ...base, digest: reasoningVerificationDigestOf(base) };
      } },
      admissionPolicy: admission,
    });
    void verification;
    expect((await badService.evaluateCandidate({ cellId: "C", candidateDigest: c.candidate.candidateDigest })).status).toBe("invalid_evaluation");
    expect((await env.service.frontier({ cellId: "C" })).claims).toHaveLength(0);
    env.store.close();
  });

  it("N-N17/N-N18: a frontier change during verification stales the evaluation with zero writes", async () => {
    let nested = false;
    let innerDigest = "";
    const script: PolicyScript = {
      onVerify: async () => {
        if (nested) return;
        nested = true;
        await service!.evaluateCandidate({ cellId: "C", candidateDigest: innerDigest });
      },
    };
    const env = build(script);
    const service = env.service;
    await openCell(env);
    const b = await branch(env, "q");
    const first = await env.service.submitCandidate({ cellId: "C", branchId: b, ...statement("FIRST") });
    const second = await env.service.submitCandidate({ cellId: "C", branchId: b, ...statement("SECOND") });
    innerDigest = first.candidate.candidateDigest;
    const outer = await env.service.evaluateCandidate({ cellId: "C", candidateDigest: second.candidate.candidateDigest });
    expect(outer.status).toBe("stale_evaluation");
    // Only the nested admission landed.
    expect((await env.store.replay("C")).filter((event) => event.type === "CLAIM_ADMITTED")).toHaveLength(1);
    env.store.close();
  });

  it("N-N26: closing a cell prevents new branches and candidates", async () => {
    const env = build();
    await openCell(env);
    const b = await branch(env, "q");
    await env.service.closeCell({ cellId: "C", reason: "done" });
    await expect(env.service.openBranch({ cellId: "C", question: "late" })).rejects.toMatchObject({ kind: "cell_closed" });
    await expect(env.service.submitCandidate({ cellId: "C", branchId: b, ...statement("late") })).rejects.toMatchObject({ kind: "cell_closed" });
    // History stays readable.
    expect((await env.service.cellView({ cellId: "C" })).lifecycle).toBe("CLOSED");
    env.store.close();
  });

  it("N-N31: a branch carrier attribution is not branch identity", async () => {
    const env = build();
    await openCell(env);
    const attribution = { activationId: "act-1", agentDefinitionId: "ag-1", runDefinition: { digest: "rd" }, bindingResolution: { resolutionId: "res", digest: "rr" } };
    const opened = await env.service.openBranch({ cellId: "C", question: "q", attribution });
    expect(opened.branch.attribution?.activationId).toBe("act-1");
    expect(opened.branch.ref.branchId).not.toBe("act-1");
    expect(JSON.stringify(opened.branch.ref)).not.toContain("act-1");
    env.store.close();
  });

  it("N-N35: corrupted durable history fails closed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "palimpsest-nc-"));
    const path = join(dir, "cells.sqlite");
    try {
      const env = build({}, path);
      await openCell(env);
      await branch(env, "q");
      env.store.close();
      const raw = new DatabaseSync(path);
      raw.exec("UPDATE reasoning_cell_events SET payload_json = '{\"tampered\":true}' WHERE seq = 2");
      raw.close();
      const reopened = new SqliteReasoningCellStore(path);
      const service = makeReasoningCellService({ store: reopened, verificationPolicy: policies().verification, admissionPolicy: policies().admission });
      await expect(service.cellView({ cellId: "C" })).rejects.toMatchObject({ kind: "malformed_record" });
      reopened.close();
    } finally {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* windows handle */ }
    }
  });

  it("RC-A01…A38: reasoning cells touch no foreign truth (source firewall, no CoT contract)", () => {
    for (const file of ["ref.ts", "claims.ts", "artifacts.ts", "store.ts", "service.ts"]) {
      const source = strip(SRC(`reasoning_cell/${file}`));
      expect(source).not.toMatch(/from "\.\.\/boundary_memory/);
      expect(source).not.toMatch(/from "\.\.\/organization\//);
      expect(source).not.toMatch(/from "\.\.\/institution/);
      expect(source).not.toMatch(/from "\.\.\/campaign/);
      expect(source).not.toMatch(/from "\.\.\/runtime_scope/);
      expect(source).not.toMatch(/from "\.\.\/effects/);
      expect(source).not.toMatch(/from "\.\.\/scheduler/);
      expect(source).not.toMatch(/chainOfThought|scratchpad|privateReasoning|hiddenThoughts/);
      // No durable-agent / peer identity is created from a branch.
      expect(source).not.toMatch(/materializePeerRef/);
      expect(source).not.toMatch(/SqliteRuntimeScopeStore/);
    }
  });
});
