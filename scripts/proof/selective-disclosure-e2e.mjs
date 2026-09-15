#!/usr/bin/env node
/**
 * G10-U selective-disclosure synthetic E2E (CF-T-03).
 *
 *   Source ≠ Evidence   Evidence ≠ Claim   Selection ≠ WholeSource
 *   Preview ≠ Authority   Exported ≠ Received
 *
 * Proves, entirely offline over SYNTHETIC personal-data sources, that a local
 * disclosure exports EXACTLY the recorded selections and never the surrounding
 * source:
 *
 *   import (blob + proof chain, NO model call)
 *     → TEXT_RANGE evidence selecting only the public degree line
 *     → JSON_POINTER evidence selecting only /education
 *     → a published claim supported by both selections
 *     → disclosure preview that RESOLVES each selection and states the exact
 *       materialization (kind, media type, digest, file name)
 *     → export BLOCKED before approval writes nothing
 *     → APPROVE + export writes exactly the degree excerpt + the /education value
 *     → every written byte lacks the private employment/financial lines and
 *       values, and no whole-source file exists for either source
 *     → close/reopen the proof store and assert previews + receipts reconstruct
 *
 * All fixture bytes are SYNTHETIC and generated inline; the run root lives under
 * the gitignored `.dogfood/` directory. NO real personal data is ever written.
 *
 * Usage: node scripts/proof/selective-disclosure-e2e.mjs
 * Evidence: .dogfood/g10u-selective-disclosure-e2e.json
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const DIST = join(REPO, "dist", "src");
const DOGFOOD = join(REPO, ".dogfood");
const WORK = join(DOGFOOD, "g10u-selective-disclosure-e2e");
const BLOB_ROOT = join(WORK, "blobs");
const EXPORT_ROOT = join(WORK, "export");
const PROOF_DB = join(WORK, "proof.sqlite");
const EVIDENCE_PATH = join(DOGFOOD, "g10u-selective-disclosure-e2e.json");

const startedAt = Date.now();
const timeline = [];
const milestoneResults = {};
const record = (event, detail = {}) => timeline.push({ atMs: Date.now() - startedAt, event, detail });
const log = (message) => process.stderr.write(`[selective-disclosure-e2e ${Date.now() - startedAt}ms] ${message}\n`);

function milestone(name, check, detail = {}) {
  milestoneResults[name] = check === true ? "PASS" : "FAIL";
  record(check === true ? "milestone_pass" : "milestone_fail", { name, ...detail });
  return check;
}

function collectFiles(root) {
  if (!existsSync(root)) return [];
  const out = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(path));
    else if (statSync(path).isFile()) out.push(path);
  }
  return out;
}

const readUtf8 = (path) => readFileSync(path, "utf-8");
const bytesOf = (text) => new TextEncoder().encode(text);

/* ------------------------------------------------------------------ *
 * Synthetic fixtures — 100% invented; no real personal data.
 * ------------------------------------------------------------------ */

const PUBLIC_DEGREE_LINE = "PUBLIC DEGREE LINE";
const PRIVATE_EMPLOYMENT_LINE = "PRIVATE EMPLOYMENT LINE";
const PRIVATE_FINANCIAL_LINE = "PRIVATE FINANCIAL LINE";
const TEXT_SOURCE = [PUBLIC_DEGREE_LINE, PRIVATE_EMPLOYMENT_LINE, PRIVATE_FINANCIAL_LINE].join("\n");

const JSON_SOURCE = {
  schemaVersion: 1,
  synthetic: true,
  education: { degree: "BSc Synthetic Computing", institution: "Synthetic Institute", awarded: "2019-06-30" },
  employment: { employer: "PRIVATE EMPLOYER INC", reference: "EMP-PRIVATE-0001", role: "PRIVATE ROLE" },
  financial: { balance: "PRIVATE BALANCE 9999", iban: "PRIVATE IBAN" },
};
const JSON_BYTES = JSON.stringify(JSON_SOURCE, null, 2);

const PRIVATE_TOKENS = [
  PRIVATE_EMPLOYMENT_LINE,
  PRIVATE_FINANCIAL_LINE,
  "PRIVATE EMPLOYER INC",
  "EMP-PRIVATE-0001",
  "PRIVATE ROLE",
  "PRIVATE BALANCE 9999",
  "PRIVATE IBAN",
  '"employment"',
  '"financial"',
];

/* ------------------------------------------------------------------ *
 * Model/network guard: the proof plane must be model-free.
 * ------------------------------------------------------------------ */

function installModelCallGuard() {
  const original = globalThis.fetch;
  const counter = { calls: 0 };
  globalThis.fetch = async () => {
    counter.calls += 1;
    throw new Error("synthetic selective-disclosure E2E forbids model/network calls");
  };
  return {
    counter,
    restore() {
      globalThis.fetch = original;
    },
  };
}

async function main() {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  log(`work root ${WORK}`);

  const proofMod = await import(pathToFileURL(join(DIST, "proof_asset", "index.js")).href);
  const {
    SqliteProofEvidenceStore,
    PROOF_STATEMENT_TYPE,
    blobBackedSourceContentPort,
    localDisclosureExporter,
    localProofBlobStore,
    makeDisclosureService,
    makeProofEvidenceService,
    materializeProofSourceRevisionRef,
    proofContentDigestOfBytes,
  } = proofMod;

  let approved = false;
  const admission = {
    policyRef: { policyId: "e2e.selective.disclosure.admission", version: "v1" },
    async admit() {
      return { decision: approved ? "APPROVE" : "UNRESOLVED" };
    },
  };

  const store = new SqliteProofEvidenceStore(PROOF_DB);
  const blob = localProofBlobStore(BLOB_ROOT);
  const proof = makeProofEvidenceService({ store, blob });
  const exporter = localDisclosureExporter(EXPORT_ROOT);
  const content = blobBackedSourceContentPort(blob);
  const disclosure = makeDisclosureService({ proof, exporter, content, admission });

  // ---- 1. Import the two synthetic sources (no model call). ----
  const guard = installModelCallGuard();
  const importedText = await proof.importSource({ bytes: bytesOf(TEXT_SOURCE), mediaType: "text/plain", label: "synthetic-personal-text", provenance: "LOCAL_IMPORT", sourceId: "personal-text" });
  const importedJson = await proof.importSource({ bytes: bytesOf(JSON_BYTES), mediaType: "application/json", label: "synthetic-personal-json", provenance: "LOCAL_IMPORT", sourceId: "personal-json" });
  const modelCallsOnImport = guard.counter.calls;
  guard.restore();
  assert.equal(modelCallsOnImport, 0, "importSource must not make any model/network call");
  assert.equal(importedText.revision.revision, 1);
  assert.equal(importedJson.revision.revision, 1);
  milestone("syntheticImports", true, { modelCallsOnImport, sources: ["personal-text", "personal-json"] });

  // ---- 2. Evidence: a TEXT_RANGE over only the degree line, a JSON_POINTER /education. ----
  const degreeEnd = PUBLIC_DEGREE_LINE.length;
  assert.equal(TEXT_SOURCE.slice(0, degreeEnd), PUBLIC_DEGREE_LINE, "the public range must be exactly the degree line");
  const degreeEvidence = await proof.recordEvidence({
    sourceRevision: materializeProofSourceRevisionRef({ sourceId: "personal-text", revision: importedText.revision.revision, contentDigest: importedText.revision.contentDigest }),
    selector: { kind: "TEXT_RANGE", start: 0, end: degreeEnd },
  });
  const educationEvidence = await proof.recordEvidence({
    sourceRevision: materializeProofSourceRevisionRef({ sourceId: "personal-json", revision: importedJson.revision.revision, contentDigest: importedJson.revision.contentDigest }),
    selector: { kind: "JSON_POINTER", pointer: "/education" },
  });
  assert.equal(degreeEvidence.selector.kind, "TEXT_RANGE");
  assert.equal(educationEvidence.selector.kind, "JSON_POINTER");
  milestone("selectiveEvidence", true, { degreeEvidenceId: degreeEvidence.evidenceId, educationEvidenceId: educationEvidence.evidenceId });

  // ---- 3. Publish one claim supported by BOTH selections. ----
  const candidate = await proof.prepareCandidate({
    claimType: PROOF_STATEMENT_TYPE,
    content: { statement: "The synthetic public degree line and synthetic educational credential are disclosed." },
    supportingEvidenceIds: [degreeEvidence.evidenceId, educationEvidence.evidenceId],
    origin: "MANUAL",
  });
  await proof.verify({ candidateId: candidate.candidateId });
  const publication = await proof.decidePublication({ candidateId: candidate.candidateId });
  assert.equal(publication.decision, "PUBLISH");
  const claimId = publication.claimId;
  assert.ok(typeof claimId === "string" && claimId.startsWith("pc-"), "published claim id must be a pc- proof claim");
  milestone("claimPublished", true, { claimId });

  // ---- 4. Prepare a disclosure; the preview must state the EXACT excerpts. ----
  const preview = await disclosure.preview({ purpose: "synthetic selective verification", audienceLabel: "synthetic-degree-verifier", requestedClaimIds: [claimId] });
  assert.deepEqual(preview.claimIds, [claimId]);
  assert.equal(preview.wholeSourceWarnings.length, 0, "an excerpt-only disclosure must carry no whole-source warning");
  assert.equal(preview.materials.length, 2, "preview must list exactly the two selected materials");
  assert.deepEqual(
    preview.materials.map((material) => material.materializationKind).sort(),
    ["JSON_VALUE", "TEXT_EXCERPT"],
    "materialization kinds must reflect the selectors",
  );

  const degreeMaterial = preview.materials.find((material) => material.evidenceId === degreeEvidence.evidenceId);
  const educationMaterial = preview.materials.find((material) => material.evidenceId === educationEvidence.evidenceId);
  assert.ok(degreeMaterial, "preview must carry the degree material");
  assert.ok(educationMaterial, "preview must carry the education material");
  assert.deepEqual(degreeMaterial.selector, { kind: "TEXT_RANGE", start: 0, end: degreeEnd });
  assert.equal(degreeMaterial.mediaType, "text/plain");
  assert.equal(degreeMaterial.fileName, `evidence-${degreeEvidence.evidenceId}.txt`);
  assert.equal(degreeMaterial.contentDigest, proofContentDigestOfBytes(bytesOf(PUBLIC_DEGREE_LINE)), "degree material digest must be the excerpt digest");
  assert.deepEqual(educationMaterial.selector, { kind: "JSON_POINTER", pointer: "/education" });
  assert.equal(educationMaterial.mediaType, "application/json");
  assert.equal(educationMaterial.fileName, `evidence-${educationEvidence.evidenceId}.json`);
  assert.notEqual(degreeMaterial.contentDigest, importedText.revision.contentDigest, "the material digest must be the excerpt digest, never the whole-source digest");
  milestone("previewStatesExactExcerpts", true, {
    previewId: preview.previewId,
    materials: preview.materials.map((material) => ({ evidenceId: material.evidenceId, kind: material.materializationKind, fileName: material.fileName })),
  });

  // ---- 5. Preview alone writes nothing; export before approval is BLOCKED. ----
  assert.equal(collectFiles(EXPORT_ROOT).length, 0, "a preview alone must not write any file");
  const blocked = await disclosure.approveAndExport({ previewId: preview.previewId });
  assert.equal(blocked.status, "blocked", `export before approval must be blocked, got ${blocked.status}`);
  assert.equal(collectFiles(EXPORT_ROOT).length, 0, "a blocked export must write no file");
  assert.equal((await proof.disclosureReceipts()).length, 0, "a blocked export must record no receipt");
  milestone("blockedBeforeApproval", true, { reason: blocked.status === "blocked" ? blocked.reason : blocked.status });

  // ---- 6. APPROVE + local export. ----
  approved = true;
  const outcome = await disclosure.approveAndExport({ previewId: preview.previewId });
  assert.equal(outcome.status, "exported", `approved export must succeed, got ${outcome.status}${outcome.status === "blocked" ? `: ${outcome.reason}` : ""}`);
  if (outcome.status !== "exported") throw new Error("unreachable");
  const receipt = outcome.receipt;
  const bundleDir = join(EXPORT_ROOT, receipt.bundleDigest);
  const manifestPath = join(bundleDir, "manifest.json");
  assert.ok(existsSync(manifestPath), "export must write manifest.json");
  const manifest = JSON.parse(readUtf8(manifestPath));
  assert.deepEqual(manifest.materials, JSON.parse(JSON.stringify(preview.materials)), "the manifest must carry the preview's materials verbatim");
  assert.equal(manifest.materials.length, 2);
  for (const material of manifest.materials) assert.ok(material.selector && material.materializationKind, "each manifest material must carry its selector and materialization kind");

  const exportedFiles = collectFiles(bundleDir);
  const degreePath = join(bundleDir, degreeMaterial.fileName);
  const educationPath = join(bundleDir, educationMaterial.fileName);
  assert.ok(existsSync(degreePath), "the degree excerpt file must be written");
  assert.ok(existsSync(educationPath), "the /education value file must be written");

  // Exact bytes: only the excerpt, only the selected JSON value.
  assert.equal(readUtf8(degreePath), PUBLIC_DEGREE_LINE, "the degree file must contain exactly the selected range");
  assert.equal(proofContentDigestOfBytes(bytesOf(readUtf8(degreePath))), degreeMaterial.contentDigest);
  const educationValue = JSON.parse(readUtf8(educationPath));
  assert.deepEqual(educationValue, JSON_SOURCE.education, "the education file must contain exactly the selected /education value");
  assert.equal(proofContentDigestOfBytes(bytesOf(readUtf8(educationPath))), educationMaterial.contentDigest);

  // Byte-level exclusion across EVERY written file (including manifest.json).
  const allWrittenText = exportedFiles.map((path) => readUtf8(path)).join("\n");
  for (const secret of PRIVATE_TOKENS) {
    assert.ok(!allWrittenText.includes(secret), `private byte sequence must be absent from every written file: ${secret}`);
  }
  assert.ok(allWrittenText.includes(PUBLIC_DEGREE_LINE), "the public degree line must be present");
  assert.ok(allWrittenText.includes("BSc Synthetic Computing"), "the selected education value must be present");

  // No whole-source file for either source.
  assert.ok(!existsSync(join(bundleDir, "sources")), "no whole-source 'sources/' directory may be written");
  for (const path of exportedFiles) {
    const raw = readFileSync(path);
    assert.notDeepEqual(raw, bytesOf(TEXT_SOURCE), `no file may contain the whole text source: ${path}`);
    assert.notDeepEqual(raw, bytesOf(JSON_BYTES), `no file may contain the whole JSON source: ${path}`);
  }
  const textWholeDigest = importedText.revision.contentDigest;
  const jsonWholeDigest = importedJson.revision.contentDigest;
  assert.ok(exportedFiles.every((path) => !path.includes(textWholeDigest) && !path.includes(jsonWholeDigest)), "no exported file name may reference a whole-source digest");

  assert.equal(receipt.exporterId, "local-disclosure-exporter");
  for (const forbidden of ["recipient", "receivedBy", "accepted", "delivered"]) assert.ok(!(forbidden in receipt), `receipt must not claim ${forbidden}`);
  assert.deepEqual(await disclosure.history(), [receipt]);
  milestone("selectiveExportBytes", true, {
    bundleDigest: receipt.bundleDigest,
    receiptDigest: receipt.digest,
    exportedFileCount: exportedFiles.length,
    exportedFiles: exportedFiles.map((path) => path.slice(bundleDir.length + 1)),
    privateTokensAbsent: PRIVATE_TOKENS.length,
    wholeSourceFilesAbsent: true,
  });

  // ---- 7. Restart reconstruction. ----
  const snapshot = {
    previews: await proof.disclosurePreviews(),
    receipts: await proof.disclosureReceipts(),
    events: await proof.replay(),
  };
  store.close();

  const store2 = new SqliteProofEvidenceStore(PROOF_DB);
  const blob2 = localProofBlobStore(BLOB_ROOT);
  const proof2 = makeProofEvidenceService({ store: store2, blob: blob2 });
  const disclosure2 = makeDisclosureService({ proof: proof2, exporter: localDisclosureExporter(EXPORT_ROOT), content: blobBackedSourceContentPort(blob2), admission });
  assert.deepEqual(await proof2.replay(), snapshot.events, "the full proof chain must replay identically");
  const previews2 = await proof2.disclosurePreviews();
  assert.deepEqual(previews2, snapshot.previews, "disclosure previews must reconstruct exactly");
  assert.deepEqual(await proof2.disclosureReceipts(), snapshot.receipts, "disclosure receipts must reconstruct exactly");
  assert.deepEqual(await disclosure2.history(), snapshot.receipts);
  assert.deepEqual(previews2[0].materials, preview.materials, "the reconstructed preview must retain its selectors + materialization kinds");
  store2.close();
  milestone("restartReconstruction", true, { previews: previews2.length, receipts: snapshot.receipts.length, chainEvents: snapshot.events.length });

  const passed = Object.values(milestoneResults).every((status) => status === "PASS");
  const checks = Object.fromEntries(Object.entries(milestoneResults).map(([name, status]) => [name, status === "PASS"]));

  const evidence = {
    result: passed ? "PASS" : "PARTIAL",
    generatedAt: new Date().toISOString(),
    syntheticOnly: true,
    fixtures: { text: TEXT_SOURCE, json: JSON_SOURCE },
    refs: {
      claimId,
      degreeEvidenceId: degreeEvidence.evidenceId,
      educationEvidenceId: educationEvidence.evidenceId,
      textContentDigest: importedText.revision.contentDigest,
      jsonContentDigest: importedJson.revision.contentDigest,
    },
    disclosure: {
      previewId: preview.previewId,
      bundleDigest: receipt.bundleDigest,
      receiptDigest: receipt.digest,
      materials: preview.materials,
      exportedFiles: exportedFiles.map((path) => path.slice(bundleDir.length + 1)),
      privateTokensAbsent: PRIVATE_TOKENS,
      wholeSourceFilesAbsent: true,
      blockedBeforeApproval: blocked.status,
    },
    restart: { reconstructedExactly: true, chainEvents: snapshot.events.length, previews: previews2.length, receipts: snapshot.receipts.length },
    checks,
    milestoneResults,
    timeline,
    elapsedMs: Date.now() - startedAt,
    note: "All fixture bytes are synthetic and inline; the run root is under the gitignored .dogfood/. No model/network call occurs (fetch guard), and no federation/upload/email exists: the only effect is a local bundle write.",
  };

  mkdirSync(DOGFOOD, { recursive: true });
  writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2));
  process.stdout.write(JSON.stringify({ result: evidence.result, refs: evidence.refs, materials: evidence.disclosure.materials, checks }, null, 2) + "\n");
  process.stdout.write(
    `\nSELECTIVE-DISCLOSURE E2E ${evidence.result}: materials=${preview.materials.length}, exportedFiles=${exportedFiles.length}, ` +
      `privateTokensAbsent=${PRIVATE_TOKENS.length}, elapsedMs=${evidence.elapsedMs}\n`,
  );
  return evidence;
}

let evidence;
try {
  evidence = await main();
} catch (error) {
  record("run_failed", { error: error?.stack ?? String(error) });
  evidence = { result: "PARTIAL", error: String(error?.stack ?? error), timeline, milestoneResults };
  try {
    mkdirSync(DOGFOOD, { recursive: true });
    writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2));
  } catch {
    /* best effort */
  }
  process.stderr.write(`selective-disclosure-e2e failed: ${error?.stack ?? String(error)}\n`);
}
process.exit(evidence.result === "PASS" ? 0 : 2);
