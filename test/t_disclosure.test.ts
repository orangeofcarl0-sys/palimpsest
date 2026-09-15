/**
 * G10-T local, purpose-scoped disclosure — preview ≠ export ≠ recipient receipt, separate
 * admission, whole-source warnings, selective-bundle exclusion, and the absence of any federation
 * send (PA-A01…PA-A35 disclosure semantics). All fixture material is SYNTHETIC.
 */

import { afterAll, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DISCLOSURE_WHOLE_SOURCE_WARNING,
  PROOF_STATEMENT_TYPE,
  SqliteProofEvidenceStore,
  blobBackedSourceContentPort,
  localDisclosureExporter,
  localProofBlobStore,
  makeDisclosureService,
  makeProofEvidenceService,
  materializeProofSourceRevisionRef,
} from "../src/proof_asset/index.js";
import type { DisclosureAdmissionOutcome, DisclosureAdmissionPort, DisclosureService, ProofEvidenceService } from "../src/proof_asset/index.js";

const DIR = mkdtempSync(join(tmpdir(), "palimpsest-t-disc-"));
afterAll(() => {
  try {
    rmSync(DIR, { recursive: true, force: true });
  } catch {
    /* windows handle */
  }
});
let seq = 0;
const nextDir = (name: string): string => join(DIR, `${name}-${++seq}`);
const bytesOf = (text: string): Uint8Array => new TextEncoder().encode(text);

function collectFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(path));
    else if (statSync(path).isFile()) out.push(path);
  }
  return out;
}

interface Env {
  readonly proof: ProofEvidenceService;
  readonly disclosure: DisclosureService;
  readonly exportRoot: string;
}

function buildEnv(admission?: DisclosureAdmissionPort): Env {
  const store = new SqliteProofEvidenceStore(":memory:");
  const blob = localProofBlobStore(nextDir("blobs"));
  const proof = makeProofEvidenceService({ store, blob });
  const exportRoot = nextDir("export");
  const exporter = localDisclosureExporter(exportRoot);
  const disclosure = makeDisclosureService({
    proof,
    exporter,
    content: blobBackedSourceContentPort(blob),
    ...(admission === undefined ? {} : { admission }),
  });
  return { proof, disclosure, exportRoot };
}

async function publishClaim(proof: ProofEvidenceService, input: { sourceId: string; bytes: string; statement: string }): Promise<string> {
  const imported = await proof.importSource({ bytes: bytesOf(input.bytes), mediaType: "text/plain", label: `synthetic-${input.sourceId}`, provenance: "LOCAL_IMPORT", sourceId: input.sourceId });
  const evidence = await proof.recordEvidence({ sourceRevision: materializeProofSourceRevisionRef({ sourceId: input.sourceId, revision: imported.revision.revision, contentDigest: imported.revision.contentDigest }), selector: { kind: "WHOLE_SOURCE" } });
  const candidate = await proof.prepareCandidate({ claimType: PROOF_STATEMENT_TYPE, content: { statement: input.statement }, supportingEvidenceIds: [evidence.evidenceId], origin: "MANUAL" });
  await proof.verify({ candidateId: candidate.candidateId });
  const result = await proof.decidePublication({ candidateId: candidate.candidateId });
  if (result.claimId === undefined) throw new Error("synthetic claim did not publish");
  return result.claimId;
}

const approve: DisclosureAdmissionPort = {
  policyRef: { policyId: "test-disclosure-admission", version: "v1" },
  async admit(): Promise<DisclosureAdmissionOutcome> {
    return { decision: "APPROVE" };
  },
};
const reject: DisclosureAdmissionPort = {
  policyRef: { policyId: "test-disclosure-admission", version: "v1" },
  async admit(): Promise<DisclosureAdmissionOutcome> {
    return { decision: "REJECT" };
  },
};

describe("G10-T disclosure: preview is not export", () => {
  it("previews without invoking the exporter or writing any file (PA-A01)", async () => {
    const env = buildEnv(approve);
    const claimId = await publishClaim(env.proof, { sourceId: "alpha", bytes: "synthetic alpha body", statement: "synthetic alpha claim" });
    const preview = await env.disclosure.preview({ purpose: "synthetic review", audienceLabel: "synthetic-audience", requestedClaimIds: [claimId] });
    expect(preview.previewId).toMatch(/^dsp-/);
    expect(preview.claimIds).toEqual([claimId]);
    expect(existsSync(env.exportRoot)).toBe(false);
    expect(await env.disclosure.history()).toHaveLength(0);
    expect(preview).not.toHaveProperty("approved");
    expect(preview).not.toHaveProperty("exportedAt");
  });

  it("requires a SEPARATE admission before export and refuses without one (PA-A02)", async () => {
    const noAdmission = buildEnv();
    const claimId = await publishClaim(noAdmission.proof, { sourceId: "alpha", bytes: "synthetic alpha body", statement: "synthetic alpha claim" });
    const preview = await noAdmission.disclosure.preview({ purpose: "synthetic review", audienceLabel: "synthetic-audience", requestedClaimIds: [claimId] });
    const outcome = await noAdmission.disclosure.approveAndExport({ previewId: preview.previewId });
    expect(outcome.status).toBe("capability_required");
    expect(existsSync(noAdmission.exportRoot)).toBe(false);
  });

  it("blocks export when the separate admission rejects, and exports only on APPROVE (PA-A03)", async () => {
    const denied = buildEnv(reject);
    const claimId = await publishClaim(denied.proof, { sourceId: "alpha", bytes: "synthetic alpha body", statement: "synthetic alpha claim" });
    const deniedPreview = await denied.disclosure.preview({ purpose: "synthetic review", audienceLabel: "synthetic-audience", requestedClaimIds: [claimId] });
    const deniedOutcome = await denied.disclosure.approveAndExport({ previewId: deniedPreview.previewId });
    expect(deniedOutcome.status).toBe("blocked");
    expect(existsSync(denied.exportRoot)).toBe(false);

    const approved = buildEnv(approve);
    const approvedClaim = await publishClaim(approved.proof, { sourceId: "alpha", bytes: "synthetic alpha body", statement: "synthetic alpha claim" });
    const preview = await approved.disclosure.preview({ purpose: "synthetic review", audienceLabel: "synthetic-audience", requestedClaimIds: [approvedClaim] });
    const outcome = await approved.disclosure.approveAndExport({ previewId: preview.previewId });
    expect(outcome.status).toBe("exported");
    if (outcome.status === "exported") {
      expect(existsSync(join(approved.exportRoot, outcome.receipt.bundleDigest, "manifest.json"))).toBe(true);
    }
    expect(await approved.disclosure.history()).toHaveLength(1);
  });

  it("treats an HTTP-ish token/unknown preview id as no approval at all (PA-A04)", async () => {
    const env = buildEnv(approve);
    const claimId = await publishClaim(env.proof, { sourceId: "alpha", bytes: "synthetic alpha body", statement: "synthetic alpha claim" });
    await env.disclosure.preview({ purpose: "synthetic review", audienceLabel: "synthetic-audience", requestedClaimIds: [claimId] });
    const outcome = await env.disclosure.approveAndExport({ previewId: "dsp-forged-token" } as never);
    expect(outcome.status).toBe("blocked");
    expect(existsSync(env.exportRoot)).toBe(false);
  });
});

describe("G10-T disclosure: whole-source warning and selection discipline", () => {
  it("warns that a whole-source disclosure emits the entire source (PA-A05)", async () => {
    const env = buildEnv(approve);
    const claimId = await publishClaim(env.proof, { sourceId: "alpha", bytes: "synthetic alpha body", statement: "synthetic alpha claim" });
    const preview = await env.disclosure.preview({ purpose: "synthetic review", audienceLabel: "synthetic-audience", requestedClaimIds: [claimId] });
    expect(preview.wholeSourceWarnings).toContain(DISCLOSURE_WHOLE_SOURCE_WARNING);
  });

  it("excludes unpublished requested ids by id (PA-A06)", async () => {
    const env = buildEnv(approve);
    const preview = await env.disclosure.preview({ purpose: "synthetic review", audienceLabel: "synthetic-audience", requestedClaimIds: ["pc-unpublished-synthetic"] });
    expect(preview.excludedBySelection).toContain("pc-unpublished-synthetic");
    expect(preview.claims).toHaveLength(0);
  });

  it("excludes an unrelated source from a selective bundle and never exports its bytes (PA-A07)", async () => {
    const env = buildEnv(approve);
    const betaSecret = "SYNTHETIC-BETA-SECRET-BYTES-9c1";
    const alphaId = await publishClaim(env.proof, { sourceId: "alpha", bytes: "SYNTHETIC-ALPHA-BYTES-0a1", statement: "synthetic alpha claim" });
    await publishClaim(env.proof, { sourceId: "beta", bytes: betaSecret, statement: "synthetic beta claim" });

    const preview = await env.disclosure.preview({ purpose: "synthetic selective review", audienceLabel: "synthetic-audience", requestedClaimIds: [alphaId] });
    expect(preview.sourceRevisionRefs.every((ref) => ref.sourceId === "alpha")).toBe(true);

    const outcome = await env.disclosure.approveAndExport({ previewId: preview.previewId });
    expect(outcome.status).toBe("exported");
    if (outcome.status !== "exported") return;

    const bundleDir = join(env.exportRoot, outcome.receipt.bundleDigest);
    const files = collectFiles(bundleDir);
    expect(files.length).toBeGreaterThan(0);
    const allText = files.map((path) => readFileSync(path, "utf-8")).join("\n");
    expect(allText).not.toContain(betaSecret);
    expect(existsSync(join(bundleDir, "sources", "beta"))).toBe(false);
    expect(existsSync(join(bundleDir, "sources", "alpha"))).toBe(true);
  });

  it("produces a local receipt that makes no recipient claim (PA-A08)", async () => {
    const env = buildEnv(approve);
    const claimId = await publishClaim(env.proof, { sourceId: "alpha", bytes: "synthetic alpha body", statement: "synthetic alpha claim" });
    const preview = await env.disclosure.preview({ purpose: "synthetic review", audienceLabel: "synthetic-audience", requestedClaimIds: [claimId] });
    const outcome = await env.disclosure.approveAndExport({ previewId: preview.previewId });
    expect(outcome.status).toBe("exported");
    if (outcome.status !== "exported") return;
    expect(Object.keys(outcome.receipt).sort()).toEqual(["audienceLabel", "bundleDigest", "digest", "exportedAt", "exporterId", "purpose", "schemaVersion"].sort());
    expect(outcome.receipt).not.toHaveProperty("recipient");
    expect(outcome.receipt).not.toHaveProperty("receivedBy");
    expect(outcome.receipt).not.toHaveProperty("accepted");
  });
});

describe("G10-T disclosure: durable previews and receipts (restart reconstruction)", () => {
  it("reconstructs a recorded receipt and preview from the proof chain after the store is reopened (PA-A09)", async () => {
    const storePath = join(DIR, `proof-restart-${++seq}.sqlite`);
    const blob = localProofBlobStore(nextDir("blobs-restart"));
    const exporter = localDisclosureExporter(nextDir("export-restart"));
    const content = blobBackedSourceContentPort(blob);

    // --- process 1: record a preview, approve + export, then close the store ---
    const store1 = new SqliteProofEvidenceStore(storePath);
    const proof1 = makeProofEvidenceService({ store: store1, blob });
    const disclosure1 = makeDisclosureService({ proof: proof1, exporter, content, admission: approve });
    const claimId = await publishClaim(proof1, { sourceId: "restart-alpha", bytes: "SYNTHETIC-RESTART-ALPHA-BYTES", statement: "synthetic restart claim" });
    const preview = await disclosure1.preview({ purpose: "synthetic restart review", audienceLabel: "synthetic-audience", requestedClaimIds: [claimId] });
    const outcome = await disclosure1.approveAndExport({ previewId: preview.previewId });
    expect(outcome.status).toBe("exported");
    if (outcome.status !== "exported") return;
    const receipt = outcome.receipt;
    expect(await disclosure1.history()).toEqual([receipt]);
    store1.close();

    // --- process 2: reopen the SAME store path; the chain replays the receipt + preview ---
    const store2 = new SqliteProofEvidenceStore(storePath);
    const proof2 = makeProofEvidenceService({ store: store2, blob });
    const disclosure2 = makeDisclosureService({ proof: proof2, exporter, content, admission: approve });
    expect(await disclosure2.history()).toEqual([receipt]);
    expect(await proof2.disclosureReceipts()).toEqual([receipt]);
    expect((await proof2.disclosurePreviews()).map((entry) => entry.previewId)).toEqual([preview.previewId]);
    store2.close();
  });
});
