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
  materializeDisclosurePreview,
  materializeEvidenceItem,
  materializeProofSourceRevisionRef,
  proofContentDigestOfBytes,
} from "../src/proof_asset/index.js";
import type {
  DisclosureAdmissionOutcome,
  DisclosureAdmissionPort,
  DisclosureMaterial,
  DisclosurePreview,
  DisclosureService,
  EvidenceSelector,
  ProofEvidenceService,
  ProofSourceRevisionRef,
} from "../src/proof_asset/index.js";

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

async function publishSelective(
  proof: ProofEvidenceService,
  input: { sourceId: string; bytes: string; mediaType?: string; selector: EvidenceSelector; statement: string },
): Promise<{ claimId: string; evidenceId: string; revision: ProofSourceRevisionRef }> {
  const imported = await proof.importSource({
    bytes: bytesOf(input.bytes),
    mediaType: input.mediaType ?? "text/plain",
    label: `synthetic-${input.sourceId}`,
    provenance: "LOCAL_IMPORT",
    sourceId: input.sourceId,
  });
  const revision = materializeProofSourceRevisionRef({ sourceId: input.sourceId, revision: imported.revision.revision, contentDigest: imported.revision.contentDigest });
  const evidence = await proof.recordEvidence({ sourceRevision: revision, selector: input.selector });
  const candidate = await proof.prepareCandidate({ claimType: PROOF_STATEMENT_TYPE, content: { statement: input.statement }, supportingEvidenceIds: [evidence.evidenceId], origin: "MANUAL" });
  await proof.verify({ candidateId: candidate.candidateId });
  const result = await proof.decidePublication({ candidateId: candidate.candidateId });
  if (result.claimId === undefined) throw new Error("synthetic selective claim did not publish");
  return { claimId: result.claimId, evidenceId: evidence.evidenceId, revision };
}

/** Record a preview on the chain whose single material substitutes a crafted selector. */
async function recordCraftedPreview(env: Env, preview: DisclosurePreview, material: DisclosureMaterial): Promise<string> {
  const crafted = materializeDisclosurePreview({
    purpose: preview.purpose,
    audienceLabel: preview.audienceLabel,
    claimIds: preview.claimIds,
    claims: preview.claims,
    requiredDependencyIds: preview.requiredDependencyIds,
    evidenceRefs: preview.evidenceRefs,
    sourceRevisionRefs: preview.sourceRevisionRefs,
    materials: [material],
    wholeSourceWarnings: preview.wholeSourceWarnings,
    warnings: preview.warnings,
    excludedBySelection: preview.excludedBySelection,
  });
  await env.proof.recordDisclosurePreview(crafted);
  return crafted.previewId;
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
    // Only the selected alpha material is written; beta contributes no file at all.
    expect(preview.materials.every((material) => material.sourceRevision.sourceId === "alpha")).toBe(true);
    for (const material of preview.materials) {
      expect(existsSync(join(bundleDir, material.fileName))).toBe(true);
    }
    expect(files.some((path) => path.split(/[\\/]/u).some((segment) => segment.startsWith("beta")))).toBe(false);
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

  it("keeps the whole-source warning and materializes a WHOLE_SOURCE evidence as ORIGINAL_SOURCE (CF-T-03)", async () => {
    const env = buildEnv(approve);
    const claimId = await publishClaim(env.proof, { sourceId: "whole", bytes: "SYNTHETIC-WHOLE-SOURCE-BYTES", statement: "synthetic whole claim" });
    const preview = await env.disclosure.preview({ purpose: "synthetic whole review", audienceLabel: "synthetic-audience", requestedClaimIds: [claimId] });
    expect(preview.wholeSourceWarnings).toContain(DISCLOSURE_WHOLE_SOURCE_WARNING);
    expect(preview.materials).toHaveLength(1);
    const material = preview.materials[0]!;
    expect(material.selector).toEqual({ kind: "WHOLE_SOURCE" });
    expect(material.materializationKind).toBe("ORIGINAL_SOURCE");
    expect(material.mediaType).toBe("text/plain");
    expect(material.fileName).toBe(`whole-1-${material.contentDigest}`);

    const outcome = await env.disclosure.approveAndExport({ previewId: preview.previewId });
    expect(outcome.status).toBe("exported");
    if (outcome.status !== "exported") return;
    const bundleDir = join(env.exportRoot, outcome.receipt.bundleDigest);
    const exported = readFileSync(join(bundleDir, material.fileName), "utf-8");
    expect(exported).toBe("SYNTHETIC-WHOLE-SOURCE-BYTES");
    expect(proofContentDigestOfBytes(bytesOf(exported))).toBe(material.contentDigest);
  });
});

describe("G10-T disclosure: selector-aware selective export (CF-T-03)", () => {
  const TEXT = "PUBLIC DEGREE LINE\nPRIVATE EMPLOYMENT LINE\nPRIVATE FINANCIAL LINE";
  const DEGREE_END = TEXT.indexOf("\n");

  it("records the selector + materializationKind in the manifest and preview materials equal the exported bytes (parity)", async () => {
    const env = buildEnv(approve);
    const { claimId, revision, evidenceId } = await publishSelective(env.proof, {
      sourceId: "selective-text",
      bytes: TEXT,
      selector: { kind: "TEXT_RANGE", start: 0, end: DEGREE_END },
      statement: "synthetic selective degree claim",
    });
    const preview = await env.disclosure.preview({ purpose: "synthetic selective review", audienceLabel: "synthetic-audience", requestedClaimIds: [claimId] });
    expect(preview.materials).toHaveLength(1);
    const material = preview.materials[0]!;
    expect(material.evidenceId).toBe(evidenceId);
    expect(material.sourceRevision).toEqual(revision);
    expect(material.selector).toEqual({ kind: "TEXT_RANGE", start: 0, end: DEGREE_END });
    expect(material.materializationKind).toBe("TEXT_EXCERPT");
    expect(material.mediaType).toBe("text/plain");
    expect(material.fileName).toBe(`evidence-${evidenceId}.txt`);
    // No whole-source warning: this disclosure is a bounded excerpt.
    expect(preview.wholeSourceWarnings).toHaveLength(0);

    const outcome = await env.disclosure.approveAndExport({ previewId: preview.previewId });
    expect(outcome.status).toBe("exported");
    if (outcome.status !== "exported") return;

    const bundleDir = join(env.exportRoot, outcome.receipt.bundleDigest);
    const manifest = JSON.parse(readFileSync(join(bundleDir, "manifest.json"), "utf-8")) as {
      materials: readonly { selector: unknown; materializationKind: string }[];
    };
    expect(manifest.materials).toEqual(JSON.parse(JSON.stringify(preview.materials)));
    expect(manifest.materials[0]!.selector).toEqual({ kind: "TEXT_RANGE", start: 0, end: DEGREE_END });
    expect(manifest.materials[0]!.materializationKind).toBe("TEXT_EXCERPT");
    // Preview/export parity: the digest the preview computed is the digest written.
    const exported = readFileSync(join(bundleDir, material.fileName));
    expect(proofContentDigestOfBytes(new Uint8Array(exported))).toBe(material.contentDigest);
  });

  it("writes only the exact TEXT_RANGE excerpt and never the surrounding source lines", async () => {
    const env = buildEnv(approve);
    const { claimId } = await publishSelective(env.proof, {
      sourceId: "range-source",
      bytes: TEXT,
      selector: { kind: "TEXT_RANGE", start: 0, end: DEGREE_END },
      statement: "synthetic range-only claim",
    });
    const preview = await env.disclosure.preview({ purpose: "synthetic range review", audienceLabel: "synthetic-audience", requestedClaimIds: [claimId] });
    const outcome = await env.disclosure.approveAndExport({ previewId: preview.previewId });
    expect(outcome.status).toBe("exported");
    if (outcome.status !== "exported") return;

    const bundleDir = join(env.exportRoot, outcome.receipt.bundleDigest);
    const files = collectFiles(bundleDir);
    const excerptFiles = files.filter((path) => path.endsWith(".txt"));
    expect(excerptFiles).toHaveLength(1);
    expect(readFileSync(excerptFiles[0]!, "utf-8")).toBe("PUBLIC DEGREE LINE");

    const allText = files.map((path) => readFileSync(path, "utf-8")).join("\n");
    expect(allText).toContain("PUBLIC DEGREE LINE");
    expect(allText).not.toContain("PRIVATE EMPLOYMENT LINE");
    expect(allText).not.toContain("PRIVATE FINANCIAL LINE");
    // No whole-source file for this source: the exporter never falls back.
    expect(existsSync(join(bundleDir, "sources"))).toBe(false);
    expect(allText).not.toContain(TEXT);
  });

  it("writes only the selected JSON_POINTER value and never the other numbers", async () => {
    const env = buildEnv(approve);
    const json = JSON.stringify({
      education: { degree: "BSc Synthetic Computing", institution: "Synthetic Institute" },
      employment: { employer: "PRIVATE EMPLOYER INC", reference: "EMP-PRIVATE-0001" },
      financial: { balance: "PRIVATE BALANCE 9999" },
    });
    const { claimId } = await publishSelective(env.proof, {
      sourceId: "json-source",
      bytes: json,
      mediaType: "application/json",
      selector: { kind: "JSON_POINTER", pointer: "/education" },
      statement: "synthetic education-only claim",
    });
    const preview = await env.disclosure.preview({ purpose: "synthetic json review", audienceLabel: "synthetic-audience", requestedClaimIds: [claimId] });
    expect(preview.materials[0]!.materializationKind).toBe("JSON_VALUE");
    expect(preview.materials[0]!.mediaType).toBe("application/json");

    const outcome = await env.disclosure.approveAndExport({ previewId: preview.previewId });
    expect(outcome.status).toBe("exported");
    if (outcome.status !== "exported") return;

    const bundleDir = join(env.exportRoot, outcome.receipt.bundleDigest);
    const files = collectFiles(bundleDir);
    const jsonFiles = files.filter((path) => path.endsWith(".json") && !path.endsWith("manifest.json"));
    expect(jsonFiles).toHaveLength(1);
    const selected = JSON.parse(readFileSync(jsonFiles[0]!, "utf-8"));
    expect(selected).toEqual({ degree: "BSc Synthetic Computing", institution: "Synthetic Institute" });

    const allText = files.map((path) => readFileSync(path, "utf-8")).join("\n");
    expect(allText).not.toContain("PRIVATE EMPLOYER INC");
    expect(allText).not.toContain("EMP-PRIVATE-0001");
    expect(allText).not.toContain("PRIVATE BALANCE 9999");
    expect(allText).not.toContain('"employment"');
    expect(allText).not.toContain('"financial"');
    expect(existsSync(join(bundleDir, "sources"))).toBe(false);
  });

  it("blocks (and writes nothing) when a material's selector no longer materializes", async () => {
    const env = buildEnv(approve);
    // --- an out-of-range TEXT_RANGE ---
    const range = await publishSelective(env.proof, {
      sourceId: "bad-range",
      bytes: "SYNTHETIC-HEADER\nSYNTHETIC-BODY",
      selector: { kind: "TEXT_RANGE", start: 0, end: 8 },
      statement: "synthetic bad-range claim",
    });
    const rangePreview = await env.disclosure.preview({ purpose: "synthetic bad-range review", audienceLabel: "synthetic-audience", requestedClaimIds: [range.claimId] });
    const rangeSelector: EvidenceSelector = { kind: "TEXT_RANGE", start: 0, end: 100_000 };
    const rangeDigest = "a".repeat(64);
    const rangeEvidence = materializeEvidenceItem({ sourceRevision: range.revision, selector: rangeSelector, selectionDigest: rangeDigest });
    const rangePreviewId = await recordCraftedPreview(env, rangePreview, {
      evidenceId: rangeEvidence.evidenceId,
      sourceRevision: range.revision,
      selector: rangeSelector,
      materializationKind: "TEXT_EXCERPT",
      mediaType: "text/plain",
      contentDigest: rangeDigest,
      fileName: `evidence-${rangeEvidence.evidenceId}.txt`,
    });
    const rangeOutcome = await env.disclosure.approveAndExport({ previewId: rangePreviewId });
    expect(rangeOutcome.status).toBe("blocked");
    if (rangeOutcome.status === "blocked") expect(rangeOutcome.reason).toMatch(/TEXT_RANGE/u);
    expect(collectFiles(env.exportRoot)).toHaveLength(0);

    // --- an invalid JSON pointer ---
    const jsonEnv = buildEnv(approve);
    const json = JSON.stringify({ education: { degree: "BSc" }, employment: { employer: "PRIVATE" } });
    const pointer = await publishSelective(jsonEnv.proof, {
      sourceId: "bad-pointer",
      bytes: json,
      mediaType: "application/json",
      selector: { kind: "JSON_POINTER", pointer: "/education" },
      statement: "synthetic bad-pointer claim",
    });
    const pointerPreview = await jsonEnv.disclosure.preview({ purpose: "synthetic bad-pointer review", audienceLabel: "synthetic-audience", requestedClaimIds: [pointer.claimId] });
    const pointerSelector: EvidenceSelector = { kind: "JSON_POINTER", pointer: "/does-not-exist" };
    const pointerDigest = "b".repeat(64);
    const pointerEvidence = materializeEvidenceItem({ sourceRevision: pointer.revision, selector: pointerSelector, selectionDigest: pointerDigest });
    const pointerPreviewId = await recordCraftedPreview(jsonEnv, pointerPreview, {
      evidenceId: pointerEvidence.evidenceId,
      sourceRevision: pointer.revision,
      selector: pointerSelector,
      materializationKind: "JSON_VALUE",
      mediaType: "application/json",
      contentDigest: pointerDigest,
      fileName: `evidence-${pointerEvidence.evidenceId}.json`,
    });
    const pointerOutcome = await jsonEnv.disclosure.approveAndExport({ previewId: pointerPreviewId });
    expect(pointerOutcome.status).toBe("blocked");
    if (pointerOutcome.status === "blocked") expect(pointerOutcome.reason).toMatch(/does not exist/u);
    expect(collectFiles(jsonEnv.exportRoot)).toHaveLength(0);
  });

  it("blocks (and writes nothing) when the source content is unavailable", async () => {
    const env = buildEnv(approve);
    const { claimId } = await publishSelective(env.proof, {
      sourceId: "vanishing",
      bytes: "SYNTHETIC-VANISHING-BYTES",
      selector: { kind: "TEXT_RANGE", start: 0, end: 9 },
      statement: "synthetic vanishing claim",
    });
    const preview = await env.disclosure.preview({ purpose: "synthetic vanishing review", audienceLabel: "synthetic-audience", requestedClaimIds: [claimId] });
    // A service whose content port refuses every read must block, not fall back.
    const brokenContent = { readContent: async (): Promise<Uint8Array | undefined> => undefined };
    const noContent = makeDisclosureService({ proof: env.proof, exporter: localDisclosureExporter(env.exportRoot), admission: approve, content: brokenContent });
    const outcome = await noContent.approveAndExport({ previewId: preview.previewId });
    expect(outcome.status).toBe("blocked");
    if (outcome.status === "blocked") expect(outcome.reason).toMatch(/unavailable/u);
    expect(collectFiles(env.exportRoot)).toHaveLength(0);
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
    const reconstructedPreviews = await proof2.disclosurePreviews();
    expect(reconstructedPreviews.map((entry) => entry.previewId)).toEqual([preview.previewId]);
    expect(reconstructedPreviews[0]!.materials).toEqual(preview.materials);
    expect(reconstructedPreviews[0]!.materials[0]!.materializationKind).toBe("ORIGINAL_SOURCE");
    store2.close();
  });
});
