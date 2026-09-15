/**
 * G10-T adversarial / firewall tests — authority-field absence, inactive-reasoning blocking,
 * no federation send, no encryption/VC/DID/ZK claim, synthetic fixtures, HTTP route strictness, and
 * the Work-only install regression (T-N23…T-N35, PA-A20…PA-A35 adversarial semantics).
 *
 * All fixture material here is SYNTHETIC.
 */

import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PROOF_STATEMENT_TYPE,
  SqliteProofEvidenceStore,
  localProofBlobStore,
  makeProofEvidenceService,
  materializeProofSourceRevisionRef,
  reasoningClaimPublicationSource,
} from "../src/proof_asset/index.js";
import {
  REASONING_STATEMENT_TYPE,
  SqliteReasoningCellStore,
  invalidationAdmissionDigestOf,
  invalidationVerificationDigestOf,
  makeReasoningCellService,
  reasoningAdmissionDigestOf,
  reasoningVerificationDigestOf,
} from "../src/reasoning_cell/index.js";
import type { ReasoningEpistemicAdmissionPolicyPort, ReasoningVerificationPolicyPort } from "../src/reasoning_cell/index.js";
import { handleApplicationRequest } from "../src/application/http.js";

const DIR = mkdtempSync(join(tmpdir(), "palimpsest-t-adv-"));
afterAll(() => {
  try {
    rmSync(DIR, { recursive: true, force: true });
  } catch {
    /* windows handle */
  }
});
let seq = 0;
const nextPath = (name: string): string => join(DIR, `${name}-${++seq}.sqlite`);
const nextDir = (name: string): string => join(DIR, `${name}-${++seq}`);
const bytesOf = (text: string): Uint8Array => new TextEncoder().encode(text);

const strip = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const PROOF_DIR = fileURLToPath(new URL("../src/proof_asset", import.meta.url));
function proofSources(): { readonly file: string; readonly code: string }[] {
  return readdirSync(PROOF_DIR)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => ({ file, code: strip(readFileSync(join(PROOF_DIR, file), "utf-8")) }));
}

/* ------------------------------------------------------------------ *
 * Adversarial source scans
 * ------------------------------------------------------------------ */

describe("G10-T adversarial: claim firewalls (source scans)", () => {
  it("makes no encryption / VC / DID / ZK claim anywhere in the proof plane (T-N23)", () => {
    const forbidden = /encrypt|decrypt|verifiable[ _-]?credential|zero[- ]?knowledge|\bzk\b|\bvc\b|\bdid\b/i;
    for (const { file, code } of proofSources()) {
      expect(forbidden.test(code), `${file} must make no encryption/VC/DID/ZK claim`).toBe(false);
    }
  });

  it("contains no federation send, upload, e-mail, or transport call (T-N24)", () => {
    const forbidden = /federation|transport|upload|e-?mail|\.send\(|https?:\/\//i;
    for (const { file, code } of proofSources()) {
      expect(forbidden.test(code), `${file} must contain no federation/network send`).toBe(false);
    }
  });

  it("keeps committed fixtures synthetic (T-N25)", () => {
    for (const name of ["t_proof_asset.test.ts", "t_disclosure.test.ts", "t_adversarial.test.ts"]) {
      const code = readFileSync(join(fileURLToPath(new URL(".", import.meta.url)), name), "utf-8");
      expect(code.toLowerCase()).toContain("synthetic");
      expect(code).not.toMatch(/\b\d{3}-\d{2}-\d{4}\b/);
      expect(code).not.toMatch(/[A-Za-z0-9._%+-]+@(gmail|yahoo|hotmail)\.com/i);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Authority firewalls in the product tools
 * ------------------------------------------------------------------ */

describe("G10-T adversarial: product tools accept no identity/authority", () => {
  it("registers proof tools whose schema carries no standing/decision/identity field (T-N26)", async () => {
    const { installPalimpsest } = await import("../src/install.js");
    const host = { tools: { register: () => undefined } };
    const installed = installPalimpsest(host as never, {
      projectId: "p-adv",
      databasePath: nextPath("adv-state"),
      ordariumDatabasePath: nextPath("adv-ord"),
      proofEvidenceStore: new SqliteProofEvidenceStore(":memory:"),
      proofBlobStore: localProofBlobStore(nextDir("adv-blobs")),
    });
    const byName = new Map(installed.tools.map((definition) => [definition.name, definition]));
    for (const name of ["palimpsest_proof", "palimpsest_proof_source", "palimpsest_disclosure"]) {
      const definition = byName.get(name);
      expect(definition).toBeDefined();
      const properties = ((definition!.parameters as { properties?: Record<string, unknown> }).properties ?? {}) as Record<string, unknown>;
      const keys = Object.keys(properties).map((key) => key.toLowerCase());
      for (const forbidden of ["standing", "decision", "publish", "authenticated", "identity", "actor", "localpeer", "approved", "token", "from", "authority"]) {
        expect(keys).not.toContain(forbidden);
      }
    }
    await installed.dispose();
  });
});

/* ------------------------------------------------------------------ *
 * ReasoningCell → proof publication firewall
 * ------------------------------------------------------------------ */

const policyRef = (policyId: string) => ({ policyId, version: "1" });

function reasoningPolicies(): { verification: ReasoningVerificationPolicyPort; admission: ReasoningEpistemicAdmissionPolicyPort } {
  const verification: ReasoningVerificationPolicyPort = {
    verify: async ({ definition, candidate, frontierBasis }) => {
      const base = { schemaVersion: 1 as const, cell: candidate.cell, candidateDigest: candidate.candidateDigest, frontierBasis, verificationPolicyRef: definition.verificationPolicyRef, standing: "SUPPORTED" as const, supportingEvidenceIds: [], contradictingEvidenceIds: [], provenanceDigest: "a".repeat(64) };
      return { ...base, digest: reasoningVerificationDigestOf(base) };
    },
    verifyInvalidation: async ({ definition, request, frontierBasis }) => {
      const base = { schemaVersion: 1 as const, cell: request.cell, targetClaimId: request.targetClaimId, requestDigest: request.requestDigest, frontierBasis, verificationPolicyRef: definition.verificationPolicyRef, standing: "SUPPORTED" as const, evidenceIds: [], provenanceDigest: "b".repeat(64) };
      return { ...base, digest: invalidationVerificationDigestOf(base) };
    },
  };
  const admission: ReasoningEpistemicAdmissionPolicyPort = {
    admit: async ({ definition, candidate, verification, frontierBasis }) => {
      const base = { schemaVersion: 1 as const, cell: candidate.cell, candidateDigest: candidate.candidateDigest, verificationResultDigest: verification.digest, frontierBasis, admissionPolicyRef: definition.admissionPolicyRef, decision: "ADMIT" as const, provenanceDigest: "c".repeat(64) };
      return { ...base, digest: reasoningAdmissionDigestOf(base) };
    },
    admitInvalidation: async ({ definition, request, verification, frontierBasis }) => {
      const base = { schemaVersion: 1 as const, cell: request.cell, targetClaimId: request.targetClaimId, requestDigest: request.requestDigest, verificationResultDigest: verification.digest, frontierBasis, admissionPolicyRef: definition.admissionPolicyRef, decision: "INVALIDATE" as const, provenanceDigest: "d".repeat(64) };
      return { ...base, digest: invalidationAdmissionDigestOf(base) };
    },
  };
  return { verification, admission };
}

describe("G10-T adversarial: reasoning acceptance is not proof publication", () => {
  it("prepares a candidate from an ACTIVE reasoning claim but never auto-publishes (T-N27)", async () => {
    const proofStore = new SqliteProofEvidenceStore(":memory:");
    const proof = makeProofEvidenceService({ store: proofStore, blob: localProofBlobStore(nextDir("reasoning-blobs")) });
    const imported = await proof.importSource({ bytes: bytesOf("synthetic reasoning evidence"), mediaType: "text/plain", label: "synthetic", provenance: "LOCAL_IMPORT", sourceId: "rsrc" });
    const evidence = await proof.recordEvidence({ sourceRevision: materializeProofSourceRevisionRef({ sourceId: "rsrc", revision: imported.revision.revision, contentDigest: imported.revision.contentDigest }), selector: { kind: "WHOLE_SOURCE" } });

    const cellStore = new SqliteReasoningCellStore(":memory:");
    const { verification, admission } = reasoningPolicies();
    const reasoning = makeReasoningCellService({ store: cellStore, verificationPolicy: verification, admissionPolicy: admission });
    await reasoning.openCell({ cellId: "C", objective: "synthetic", verificationPolicyRef: policyRef("V"), admissionPolicyRef: policyRef("A") });
    const branch = await reasoning.openBranch({ cellId: "C", question: "synthetic question?" });
    const submitted = await reasoning.submitCandidate({
      cellId: "C",
      branchId: branch.branch.ref.branchId,
      type: REASONING_STATEMENT_TYPE,
      content: { statement: "synthetic reasoning claim" },
      externalEvidenceRefs: [{ evidenceId: evidence.evidenceId }],
    });
    const evaluated = await reasoning.evaluateCandidate({ cellId: "C", candidateDigest: submitted.candidate.candidateDigest });
    expect(evaluated.status).toBe("admitted");
    const claimId = evaluated.status === "admitted" ? evaluated.claimId : "";

    const bridge = reasoningClaimPublicationSource({ reasoning });
    const prepared = await bridge.preparePublication({ cellId: "C", claimId });
    expect(prepared.status).toBe("prepared");
    if (prepared.status === "prepared") {
      expect(prepared.candidate.origin).toBe("REASONING_CELL");
      expect(prepared.candidate.supportingEvidence.map((entry) => entry.evidenceId)).toContain(evidence.evidenceId);
    }
    // Accepted reasoning claim ≠ published proof claim.
    expect(await proof.publishedClaims()).toHaveLength(0);

    // Invalidate the reasoning claim; preparation now fails closed.
    const invalidation = await reasoning.requestInvalidation({ cellId: "C", targetClaimId: claimId, reason: "synthetic invalidation" });
    expect(invalidation.status).toBe("invalidated");
    const blocked = await bridge.preparePublication({ cellId: "C", claimId });
    expect(blocked.status).toBe("blocked");
    cellStore.close();
    proofStore.close();
  });
});

/* ------------------------------------------------------------------ *
 * HTTP route strictness + install surface flags
 * ------------------------------------------------------------------ */

describe("G10-T adversarial: HTTP proof routes are strict and explicit", () => {
  it("advertises proof/disclosure surfaces and enforces POST for raw content (T-N28)", async () => {
    const { installPalimpsest } = await import("../src/install.js");
    const host = { tools: { register: () => undefined } };
    const installed = installPalimpsest(host as never, {
      projectId: "p-http",
      databasePath: nextPath("http-state"),
      ordariumDatabasePath: nextPath("http-ord"),
      proofEvidenceStore: new SqliteProofEvidenceStore(":memory:"),
      proofBlobStore: localProofBlobStore(nextDir("http-blobs")),
    });
    const route = (method: string, pathname: string, query = "", body?: unknown) =>
      handleApplicationRequest({ application: installed.application, method, pathname, query: new URLSearchParams(query), body });

    const surfaces = await route("GET", "/api/application/surfaces");
    expect(surfaces?.status).toBe(200);
    expect((surfaces?.body as { proof: boolean; disclosure: boolean }).proof).toBe(true);
    expect((surfaces?.body as { proof: boolean; disclosure: boolean }).disclosure).toBe(true);

    const sources = await route("GET", "/api/proof/sources");
    expect(sources?.status).toBe(200);
    expect(Array.isArray(sources?.body)).toBe(true);

    // Raw-content endpoints are POST-only.
    expect((await route("GET", "/api/proof/sources/import"))?.status).toBe(400);
    expect((await route("GET", "/api/proof/sources/read_explicit"))?.status).toBe(400);

    // Explicit read returns unavailable (not false) for an unknown revision.
    const read = await route("POST", "/api/proof/sources/read_explicit", "", { sourceId: "missing", revision: 0, contentDigest: "0".repeat(64) });
    expect(read?.status).toBe(200);
    expect((read?.body as { state: string }).state).toBe("unavailable");
    await installed.dispose();
  });

  it("returns 501 when the proof surface is not configured (T-N29)", async () => {
    const { installPalimpsest } = await import("../src/install.js");
    const host = { tools: { register: () => undefined } };
    const installed = installPalimpsest(host as never, {
      projectId: "p-no-proof",
      databasePath: nextPath("noproof-state"),
      ordariumDatabasePath: nextPath("noproof-ord"),
    });
    const response = await handleApplicationRequest({ application: installed.application, method: "GET", pathname: "/api/proof/sources", query: new URLSearchParams(), body: undefined });
    expect(response?.status).toBe(501);
    await installed.dispose();
  });
});

/* ------------------------------------------------------------------ *
 * Read-model-only surface
 * ------------------------------------------------------------------ */

describe("G10-T adversarial: proof view is derived, never a second store", () => {
  it("does not mutate proof history when reading the asset view (T-N30)", async () => {
    const store = new SqliteProofEvidenceStore(":memory:");
    const proof = makeProofEvidenceService({ store, blob: localProofBlobStore(nextDir("view-blobs")) });
    const imported = await proof.importSource({ bytes: bytesOf("synthetic view"), mediaType: "text/plain", label: "synthetic", provenance: "LOCAL_IMPORT", sourceId: "view-src" });
    const evidence = await proof.recordEvidence({ sourceRevision: materializeProofSourceRevisionRef({ sourceId: "view-src", revision: imported.revision.revision, contentDigest: imported.revision.contentDigest }), selector: { kind: "WHOLE_SOURCE" } });
    const candidate = await proof.prepareCandidate({ claimType: PROOF_STATEMENT_TYPE, content: { statement: "synthetic view claim" }, supportingEvidenceIds: [evidence.evidenceId], origin: "MANUAL" });
    await proof.verify({ candidateId: candidate.candidateId });
    const published = await proof.decidePublication({ candidateId: candidate.candidateId });
    const before = (await store.replay()).length;
    await proof.proofAssetView(published.claimId!);
    await proof.why(published.claimId!);
    expect((await store.replay()).length).toBe(before);
    store.close();
  });
});
