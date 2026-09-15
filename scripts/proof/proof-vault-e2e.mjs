#!/usr/bin/env node
/**
 * G10-T proof-vault synthetic personal-data vertical E2E.
 *
 *   Source ≠ Evidence   Evidence ≠ Claim   Claim ≠ Truth
 *   Verification ≠ PublicationAdmission   PublishedClaim ≠ Authority
 *   ReasoningClaim accepted ≠ Proof claim published   Exported ≠ Received
 *   Preview ≠ Authority   STALE ≠ FALSE   HistoricalSupport ≠ CurrentSupport
 *
 * Runs the WHOLE proof/disclosure vertical over three SYNTHETIC personal-data
 * sources (degree / employment / financial-summary), entirely offline:
 *
 *   import (blob + semantic store, NO model call)
 *     → evidence selections
 *     → degree candidate via a REAL ReasoningCell service (scripted verification
 *       + SEPARATE admission policies; see `extraction.mode` below)
 *     → proof-plane candidate (recording ≠ verifying ≠ publishing)
 *     → deterministic verification + EXPLICIT publication admission
 *     → new `pc-…` published claim (`pc-…` ≠ reasoning `cl-…`)
 *     → read-only Campaign Evidence port standing snapshot
 *     → dependent derived claim, then a newer degree revision ⇒ effective STALE
 *     → education-only disclosure preview (excludes employment/financial)
 *     → preview exports nothing; APPROVE + local export writes manifest + source
 *     → EXPORTED local-receipt (never a delivery receipt)
 *     → close/reopen the proof store and assert FULL chain reconstruction
 *
 * EXTRACTION MODE: deterministic ReasoningCell submission. The real DSH
 * ephemeral-branch path (`dshSubprocessBranchExecutionPort`) is deliberately NOT
 * used: the branch host receives only the frozen brief (objective/question/frozen
 * frontier claim refs) and submits its own candidate, so the proof-plane
 * `evidenceId` for the degree source CANNOT reach the reasoning candidate's
 * `externalEvidenceRefs`. A real DSH branch therefore could not produce a claim
 * that references the imported degree evidence, and the resulting proof candidate
 * would be unverifiable (no supporting evidence) and unpublishable. The real
 * `makeReasoningCellService` IS used (real event chain, real verification +
 * separate admission), with scripted deterministic policies. This is marked
 * `dshUsed:false` / `mode:"deterministic-reasoning-cell"` in the evidence.
 *
 * All fixture bytes are SYNTHETIC and generated inline; the run root lives under
 * the gitignored `.dogfood/` directory. NO real personal data (names, addresses,
 * bank/health records, credentials) is ever written.
 *
 * Usage: node scripts/proof/proof-vault-e2e.mjs
 * Evidence: .dogfood/g10t-proof-vault-e2e.json
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const DIST = join(REPO, "dist", "src");
const DOGFOOD = join(REPO, ".dogfood");
const WORK = join(DOGFOOD, "proof-vault-e2e");
const SOURCE_DIR = join(WORK, "sources");
const BLOB_ROOT = join(WORK, "blobs");
const EXPORT_ROOT = join(WORK, "export");
const PROOF_DB = join(WORK, "proof.sqlite");
const EVIDENCE_PATH = join(DOGFOOD, "g10t-proof-vault-e2e.json");

const startedAt = Date.now();
const timeline = [];
const milestoneResults = {};
const record = (event, detail = {}) => timeline.push({ atMs: Date.now() - startedAt, event, detail });
const log = (message) => process.stderr.write(`[proof-vault-e2e ${Date.now() - startedAt}ms] ${message}\n`);

function milestone(name, check, detail = {}) {
  milestoneResults[name] = check === true ? "PASS" : "FAIL";
  record(check === true ? "milestone_pass" : "milestone_fail", { name, ...detail });
  return check;
}

function bytesOf(text) {
  return new TextEncoder().encode(text);
}

function readUtf8(path) {
  return readFileSync(path, "utf-8");
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

/* ------------------------------------------------------------------ *
 * Synthetic fixtures — 100% invented; no real personal data.
 * ------------------------------------------------------------------ */

const DEGREE_V1 =
  "SYNTHETIC ACADEMIC RECORD (NOT REAL)\n" +
  "institution: Exampleland Institute of Synthetic Computing\n" +
  "qualification: BSc Synthetic Computing\n" +
  "awarded: 2019-06-30\n" +
  "reference: DEG-SYNTHETIC-0001\n";
const DEGREE_V2 =
  DEGREE_V1 + "revision: 2 — synthetic re-issue (excerpt updated)\n";

const EMPLOYMENT_JSON = {
  schemaVersion: 1,
  synthetic: true,
  employer: "SYNTHETIC-EMPLOYER-INC",
  role: "synthetic software engineer",
  start: "2020-01-06",
  end: "2023-12-15",
  reference: "EMP-SYNTHETIC-7788",
};

const FINANCIAL_TEXT =
  "SYNTHETIC FINANCIAL SUMMARY (NOT REAL)\n" +
  "account: SYNTHETIC-ACCOUNT-0000\n" +
  "iban: SYNTHETIC-IBAN-0000\n" +
  "balance: 4242 SYNTH\n";

function writeFixtures() {
  mkdirSync(SOURCE_DIR, { recursive: true });
  writeFileSync(join(SOURCE_DIR, "degree.txt"), DEGREE_V1, "utf8");
  writeFileSync(join(SOURCE_DIR, "employment.json"), JSON.stringify(EMPLOYMENT_JSON, null, 2), "utf8");
  writeFileSync(join(SOURCE_DIR, "financial-summary.txt"), FINANCIAL_TEXT, "utf8");
}

/* ------------------------------------------------------------------ *
 * Model-call guard: the proof plane must be model-free.
 * ------------------------------------------------------------------ */

function installModelCallGuard() {
  const original = globalThis.fetch;
  const counter = { calls: 0 };
  globalThis.fetch = async () => {
    counter.calls += 1;
    throw new Error("synthetic proof-vault E2E forbids model/network calls");
  };
  return {
    counter,
    restore() {
      globalThis.fetch = original;
    },
  };
}

/* ------------------------------------------------------------------ *
 * Deterministic ReasoningCell scripted policies (parsers still real).
 * ------------------------------------------------------------------ */

function scriptedReasoningPolicies(rc) {
  const verification = {
    async verify({ definition, candidate, frontierBasis }) {
      const base = {
        schemaVersion: 1,
        cell: candidate.cell,
        candidateDigest: candidate.candidateDigest,
        frontierBasis,
        verificationPolicyRef: definition.verificationPolicyRef,
        standing: "SUPPORTED",
        supportingEvidenceIds: [],
        contradictingEvidenceIds: [],
        provenanceDigest: "a".repeat(64),
      };
      return { ...base, digest: rc.reasoningVerificationDigestOf(base) };
    },
  };
  const admission = {
    async admit({ definition, candidate, verification, frontierBasis }) {
      const base = {
        schemaVersion: 1,
        cell: candidate.cell,
        candidateDigest: candidate.candidateDigest,
        verificationResultDigest: verification.digest,
        frontierBasis,
        admissionPolicyRef: definition.admissionPolicyRef,
        decision: "ADMIT",
        provenanceDigest: "b".repeat(64),
      };
      return { ...base, digest: rc.reasoningAdmissionDigestOf(base) };
    },
  };
  return { verification, admission };
}

/* ------------------------------------------------------------------ *
 * Explicit deterministic publication admission (PROOF plane).
 * ------------------------------------------------------------------ */

const PUBLICATION_POLICY_REF = { policyId: "proof.default-publication", version: "v1" };
const publicationAdmission = {
  policyRef: PUBLICATION_POLICY_REF,
  async decide({ verification }) {
    const decision =
      verification.standing === "SUPPORTED" || verification.standing === "PARTIALLY_SUPPORTED"
        ? "PUBLISH"
        : verification.standing === "CONTRADICTED"
          ? "REJECT"
          : "UNRESOLVED";
    return { decision, provenanceDigest: verification.provenanceDigest };
  },
};

const DISCLOSURE_ADMISSION = {
  policyRef: { policyId: "e2e.disclosure.admission", version: "v1" },
  async admit() {
    return { decision: "APPROVE" };
  },
};

async function main() {
  // Fresh run root (all under the gitignored .dogfood/).
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  writeFixtures();

  const proofMod = await import(pathToFileURL(join(DIST, "proof_asset", "index.js")).href);
  const rc = await import(pathToFileURL(join(DIST, "reasoning_cell", "index.js")).href);

  const {
    SqliteProofEvidenceStore,
    PROOF_STATEMENT_TYPE,
    DISCLOSURE_WHOLE_SOURCE_WARNING,
    blobBackedSourceContentPort,
    defaultProofVerificationPolicy,
    localDisclosureExporter,
    localProofBlobStore,
    makeDisclosureService,
    makeProofEvidenceService,
    materializeProofSourceRevisionRef,
    proofCampaignEvidencePort,
    reasoningClaimPublicationSource,
  } = proofMod;

  const degreeBytesV1 = bytesOf(DEGREE_V1);
  const employmentBytes = bytesOf(JSON.stringify(EMPLOYMENT_JSON, null, 2));
  const financialBytes = bytesOf(FINANCIAL_TEXT);
  const degreeBytesV2 = bytesOf(DEGREE_V2);

  // ---- 1+2. Explicit import through the proof service (blob + semantic store). ----
  const store = new SqliteProofEvidenceStore(PROOF_DB);
  const blob = localProofBlobStore(BLOB_ROOT);
  const proof = makeProofEvidenceService({
    store,
    blob,
    verificationPolicy: defaultProofVerificationPolicy(),
    publicationAdmission,
  });

  const guard = installModelCallGuard();
  const importedDegree = await proof.importSource({ bytes: degreeBytesV1, mediaType: "text/plain", label: "synthetic-degree", provenance: "LOCAL_IMPORT", sourceId: "degree" });
  const importedEmployment = await proof.importSource({ bytes: employmentBytes, mediaType: "application/json", label: "synthetic-employment", provenance: "LOCAL_IMPORT", sourceId: "employment" });
  const importedFinancial = await proof.importSource({ bytes: financialBytes, mediaType: "text/plain", label: "synthetic-financial", provenance: "LOCAL_IMPORT", sourceId: "financial" });
  const modelCallsOnImport = guard.counter.calls;
  guard.restore();

  assert.equal(modelCallsOnImport, 0, "importSource must not make any model/network call");
  assert.equal(importedDegree.revision.revision, 1);
  assert.equal(importedEmployment.revision.revision, 1);
  assert.equal(importedFinancial.revision.revision, 1);
  milestone("syntheticFixturesAndImports", true, { modelCallsOnImport, sources: ["degree", "employment", "financial"] });

  // ---- 3. Evidence selections (WHOLE_SOURCE / TEXT_RANGE / JSON_POINTER). ----
  const degreeEvidence = await proof.recordEvidence({
    sourceRevision: materializeProofSourceRevisionRef({ sourceId: "degree", revision: importedDegree.revision.revision, contentDigest: importedDegree.revision.contentDigest }),
    selector: { kind: "WHOLE_SOURCE" },
  });
  const employmentEvidence = await proof.recordEvidence({
    sourceRevision: materializeProofSourceRevisionRef({ sourceId: "employment", revision: importedEmployment.revision.revision, contentDigest: importedEmployment.revision.contentDigest }),
    selector: { kind: "JSON_POINTER", pointer: "/role" },
  });
  const financialEvidence = await proof.recordEvidence({
    sourceRevision: materializeProofSourceRevisionRef({ sourceId: "financial", revision: importedFinancial.revision.revision, contentDigest: importedFinancial.revision.contentDigest }),
    selector: { kind: "WHOLE_SOURCE" },
  });
  assert.ok(degreeEvidence.evidenceId.startsWith("pev-"));
  assert.equal(employmentEvidence.selector.kind, "JSON_POINTER");
  milestone("evidenceSelections", true, { degree: degreeEvidence.evidenceId, employment: employmentEvidence.evidenceId, financial: financialEvidence.evidenceId });

  // ---- 4. REAL ReasoningCell path (deterministic scripted policies). ----
  const reasoningStore = new rc.SqliteReasoningCellStore(":memory:");
  const { verification, admission } = scriptedReasoningPolicies(rc);
  const reasoning = rc.makeReasoningCellService({ store: reasoningStore, verificationPolicy: verification, admissionPolicy: admission });
  const CELL_ID = "cell-degree-extraction";
  await reasoning.openCell({
    cellId: CELL_ID,
    objective: "Extract the qualification recorded by the synthetic degree source as an admissible candidate statement.",
    verificationPolicyRef: { policyId: "e2e.reasoning.verify", version: "v1" },
    admissionPolicyRef: { policyId: "e2e.reasoning.admit", version: "v1" },
  });
  const branch = await reasoning.openBranch({ cellId: CELL_ID, question: "Which qualification does the synthetic degree source record, and when was it awarded?" });
  const submitted = await reasoning.submitCandidate({
    cellId: CELL_ID,
    branchId: branch.branch.ref.branchId,
    type: rc.REASONING_STATEMENT_TYPE,
    content: { statement: "The synthetic degree source records a BSc in Synthetic Computing awarded 2019-06-30." },
    externalEvidenceRefs: [{ evidenceId: degreeEvidence.evidenceId }],
  });
  const evaluated = await reasoning.evaluateCandidate({ cellId: CELL_ID, candidateDigest: submitted.candidate.candidateDigest });
  assert.equal(evaluated.status, "admitted", `reasoning candidate was not admitted: ${JSON.stringify(evaluated)}`);
  const reasoningClaimRef = evaluated.claimId;
  assert.ok(reasoningClaimRef.startsWith("cl-"), "reasoning claim id must be in the cl- namespace");
  milestone("reasoningCellAdmitted", true, { cellId: CELL_ID, reasoningClaimRef, extractionMode: "deterministic-reasoning-cell" });

  // ---- 5. Bridge → proof candidate; recording ≠ verifying ≠ publishing. ----
  const bridge = reasoningClaimPublicationSource({ reasoning });
  const prepared = await bridge.preparePublication({ cellId: CELL_ID, claimId: reasoningClaimRef });
  assert.equal(prepared.status, "prepared", `reasoning claim could not be prepared: ${prepared.status === "blocked" ? prepared.reason : ""}`);
  const bridgeCandidate = prepared.candidate;
  assert.equal(bridgeCandidate.origin, "REASONING_CELL");
  assert.ok(bridgeCandidate.supportingEvidence.some((entry) => entry.evidenceId === degreeEvidence.evidenceId), "bridge candidate must carry the degree evidence id");

  const prePublishClaims = await proof.publishedClaims();
  const prePublishEvents = await proof.replay();
  assert.equal(prePublishClaims.length, 0, "no EvidenceClaim may exist before publication");
  assert.ok(!prePublishEvents.some((event) => event.type === "CLAIM_PUBLISHED"), "no CLAIM_PUBLISHED event may exist before publication");
  assert.ok(!prePublishEvents.some((event) => event.type === "CANDIDATE_RECORDED"), "preparePublication must not record a proof candidate");
  milestone("noEvidenceClaimBeforePublish", true, { publishedClaims: 0, proofEvents: prePublishEvents.length });

  const degreeCandidate = await proof.prepareCandidate({
    claimType: bridgeCandidate.claimType,
    content: bridgeCandidate.content,
    supportingEvidenceIds: bridgeCandidate.supportingEvidence.map((entry) => entry.evidenceId),
    contradictingEvidenceIds: bridgeCandidate.contradictingEvidence.map((entry) => entry.evidenceId),
    dependencies: bridgeCandidate.dependencies,
    origin: bridgeCandidate.origin,
    // Embedder decision: this claim's evidence must track the LATEST source revision.
    provenance: { ...bridgeCandidate.provenance, freshnessPolicy: "LATEST_SOURCE_REVISION" },
  });
  await proof.verify({ candidateId: degreeCandidate.candidateId });
  const degreePublication = await proof.decidePublication({ candidateId: degreeCandidate.candidateId });
  assert.equal(degreePublication.decision, "PUBLISH");
  const evidenceClaimRef = degreePublication.claimId;
  assert.ok(typeof evidenceClaimRef === "string" && evidenceClaimRef.startsWith("pc-"), "published proof claim id must be in the pc- namespace");
  assert.notEqual(evidenceClaimRef, reasoningClaimRef, "ReasoningClaimRef ≠ EvidenceClaimRef");
  milestone("degreePublished", true, { reasoningClaimRef, evidenceClaimRef, distinctRefs: evidenceClaimRef !== reasoningClaimRef });

  // Employment + financial published too, so exclusion below is a REAL exclusion.
  const employmentCandidate = await proof.prepareCandidate({
    claimType: PROOF_STATEMENT_TYPE,
    content: { statement: "The synthetic employment record lists the role synthetic software engineer." },
    supportingEvidenceIds: [employmentEvidence.evidenceId],
    origin: "MANUAL",
    provenance: { freshnessPolicy: "IMMUTABLE_EVIDENCE" },
  });
  await proof.verify({ candidateId: employmentCandidate.candidateId });
  const employmentPublication = await proof.decidePublication({ candidateId: employmentCandidate.candidateId });
  assert.equal(employmentPublication.decision, "PUBLISH");
  const employmentClaimRef = employmentPublication.claimId;

  const financialCandidate = await proof.prepareCandidate({
    claimType: PROOF_STATEMENT_TYPE,
    content: { statement: "The synthetic financial summary records a 4242 SYNTH balance." },
    supportingEvidenceIds: [financialEvidence.evidenceId],
    origin: "MANUAL",
    provenance: { freshnessPolicy: "IMMUTABLE_EVIDENCE" },
  });
  await proof.verify({ candidateId: financialCandidate.candidateId });
  const financialPublication = await proof.decidePublication({ candidateId: financialCandidate.candidateId });
  assert.equal(financialPublication.decision, "PUBLISH");
  const financialClaimRef = financialPublication.claimId;

  // ---- 6. Read-only Campaign Evidence port → known ClaimStandingSnapshot. ----
  const campaignPort = proofCampaignEvidencePort(proof);
  const knownStanding = await campaignPort.inspectClaim({ claimId: evidenceClaimRef });
  assert.equal(knownStanding.state, "known");
  assert.equal(knownStanding.value.status, "SUPPORTED");
  assert.match(knownStanding.value.digest, /^[0-9a-f]{64}$/);
  milestone("campaignPortKnown", true, { status: knownStanding.value.status, snapshotDigest: knownStanding.value.digest });

  // ---- 7. Dependent derived claim + newer revision ⇒ effective STALE. ----
  const dependentCandidate = await proof.prepareCandidate({
    claimType: PROOF_STATEMENT_TYPE,
    content: { statement: "The subject holds a synthetic computing qualification (derived claim)." },
    supportingEvidenceIds: [degreeEvidence.evidenceId],
    dependencies: [{ claimId: evidenceClaimRef }],
    origin: "MANUAL",
    provenance: { freshnessPolicy: "IMMUTABLE_EVIDENCE", derivedFrom: evidenceClaimRef },
  });
  await proof.verify({ candidateId: dependentCandidate.candidateId });
  const dependentPublication = await proof.decidePublication({ candidateId: dependentCandidate.candidateId });
  assert.equal(dependentPublication.decision, "PUBLISH");
  const dependentClaimRef = dependentPublication.claimId;
  assert.notEqual(dependentClaimRef, evidenceClaimRef);

  const newerDegree = await proof.importSource({ bytes: degreeBytesV2, mediaType: "text/plain", label: "synthetic-degree", provenance: "LOCAL_IMPORT", sourceId: "degree" });
  assert.equal(newerDegree.revision.revision, 2, "a newer degree revision must be minted, never overwrite revision 1");

  const degreeView = await proof.proofAssetView(evidenceClaimRef);
  const dependentView = await proof.proofAssetView(dependentClaimRef);
  assert.equal(degreeView.freshness, "stale");
  assert.equal(degreeView.baseStanding, "SUPPORTED", "base standing is retained even when stale");
  assert.equal(degreeView.effectiveStanding, "STALE", "own stale freshness must yield an effective STALE");
  assert.equal(dependentView.baseStanding, "SUPPORTED");
  assert.equal(dependentView.effectiveStanding, "STALE", "a dependency's effective STALE cascades to the dependent");
  const degreeRevisions = await proof.sourceRevisions("degree");
  assert.equal(degreeRevisions.length, 2, "history is retained: both degree revisions remain recorded");
  assert.ok((await proof.evidence(degreeEvidence.evidenceId)) !== undefined);
  milestone("staleCascade", true, {
    degreeBaseStanding: degreeView.baseStanding,
    degreeEffectiveStanding: degreeView.effectiveStanding,
    degreeFreshness: degreeView.freshness,
    dependentEffectiveStanding: dependentView.effectiveStanding,
    degreeRevisions: degreeRevisions.length,
  });

  // ---- 8. Education-only disclosure preview. ----
  const exporter = localDisclosureExporter(EXPORT_ROOT);
  const contentPort = blobBackedSourceContentPort(blob);
  const disclosure = makeDisclosureService({ proof, exporter, content: contentPort, admission: DISCLOSURE_ADMISSION });

  const preview = await disclosure.preview({
    purpose: "synthetic education verification",
    audienceLabel: "synthetic-degree-verifier",
    requestedClaimIds: [evidenceClaimRef],
  });
  const previewClaimIds = preview.claims.map((view) => view.claimRef.claimId);
  const previewEvidenceIds = preview.evidenceRefs.map((ref) => ref.evidenceId);
  const previewSourceIds = preview.sourceRevisionRefs.map((ref) => ref.sourceId);
  const excludedClaimIds = [employmentClaimRef, financialClaimRef, dependentClaimRef];
  const excludedEvidenceIds = [employmentEvidence.evidenceId, financialEvidence.evidenceId];

  assert.deepEqual(preview.claimIds, [evidenceClaimRef]);
  assert.ok(previewClaimIds.includes(evidenceClaimRef), "preview must include the degree claim");
  assert.ok(previewEvidenceIds.includes(degreeEvidence.evidenceId), "preview must include the degree evidence");
  assert.ok(preview.wholeSourceWarnings.includes(DISCLOSURE_WHOLE_SOURCE_WARNING), "whole-source disclosure must warn");
  for (const id of excludedClaimIds) assert.ok(!previewClaimIds.includes(id), `preview must exclude claim ${id}`);
  for (const id of excludedEvidenceIds) assert.ok(!previewEvidenceIds.includes(id), `preview must exclude evidence ${id}`);
  assert.ok(!previewSourceIds.includes("employment"), "preview must exclude the employment source");
  assert.ok(!previewSourceIds.includes("financial"), "preview must exclude the financial source");
  milestone("educationOnlyPreview", true, {
    previewId: preview.previewId,
    includedClaim: evidenceClaimRef,
    excludedClaimIds,
    excludedEvidenceIds,
    excludedSourceIds: ["employment", "financial"],
  });

  // ---- 9. Preview alone exports nothing; APPROVE + export records a local receipt. ----
  assert.equal((await disclosure.history()).length, 0, "a preview alone must not produce a receipt");
  assert.equal((await proof.disclosureReceipts()).length, 0, "a preview alone must not record a receipt event");
  const preExportFiles = collectFiles(EXPORT_ROOT);
  assert.equal(preExportFiles.length, 0, "a preview alone must not write any file");

  const exportOutcome = await disclosure.approveAndExport({ previewId: preview.previewId });
  assert.equal(exportOutcome.status, "exported", `export was not approved: ${exportOutcome.status === "blocked" ? exportOutcome.reason : exportOutcome.status}`);
  const receipt = exportOutcome.receipt;
  const bundleDir = join(EXPORT_ROOT, receipt.bundleDigest);
  const manifestPath = join(bundleDir, "manifest.json");
  assert.ok(existsSync(manifestPath), "export must write manifest.json");
  const exportedFiles = collectFiles(bundleDir);
  assert.ok(exportedFiles.length > 0, "export must write files");
  const allExportedText = exportedFiles.map((path) => readUtf8(path)).join("\n");
  for (const secret of ["SYNTHETIC-EMPLOYER-INC", "EMP-SYNTHETIC-7788", "SYNTHETIC-IBAN-0000", "SYNTHETIC-ACCOUNT-0000"]) {
    assert.ok(!allExportedText.includes(secret), `excluded bytes must not appear in any export: ${secret}`);
  }
  const degreeSourceFiles = exportedFiles.filter((path) => path.includes(`${join("sources", "degree")}`));
  assert.ok(degreeSourceFiles.length > 0, "the selected degree source must be written");
  assert.ok(degreeSourceFiles.some((path) => readUtf8(path) === DEGREE_V1), "the exported degree bytes must match revision 1");
  // A local export receipt asserts a LOCAL write only — never delivery/recipient.
  assert.equal(receipt.exporterId, "local-disclosure-exporter");
  assert.deepEqual(Object.keys(receipt).sort(), ["audienceLabel", "bundleDigest", "digest", "exportedAt", "exporterId", "purpose", "schemaVersion"].sort());
  for (const forbidden of ["recipient", "receivedBy", "accepted", "delivered"]) assert.ok(!(forbidden in receipt), `receipt must not claim ${forbidden}`);
  const receiptsAfterExport = await proof.disclosureReceipts();
  assert.equal(receiptsAfterExport.length, 1);
  assert.deepEqual(receiptsAfterExport[0], receipt);
  assert.deepEqual(await disclosure.history(), [receipt]);
  milestone("exportAndLocalReceipt", true, {
    bundleDigest: receipt.bundleDigest,
    receiptDigest: receipt.digest,
    exportedFileCount: exportedFiles.length,
    excludedBytesAbsent: true,
  });

  // ---- 10. Restart reconstruction. ----
  const snapshot = {
    events: await proof.replay(),
    sources: await proof.sources(),
    degreeRevisions: await proof.sourceRevisions("degree"),
    employmentRevisions: await proof.sourceRevisions("employment"),
    financialRevisions: await proof.sourceRevisions("financial"),
    evidence: {
      [degreeEvidence.evidenceId]: await proof.evidence(degreeEvidence.evidenceId),
      [employmentEvidence.evidenceId]: await proof.evidence(employmentEvidence.evidenceId),
      [financialEvidence.evidenceId]: await proof.evidence(financialEvidence.evidenceId),
    },
    publishedClaims: await proof.publishedClaims(),
    whys: {
      [evidenceClaimRef]: await proof.why(evidenceClaimRef),
      [dependentClaimRef]: await proof.why(dependentClaimRef),
      [employmentClaimRef]: await proof.why(employmentClaimRef),
      [financialClaimRef]: await proof.why(financialClaimRef),
    },
    assetViews: {
      [evidenceClaimRef]: await proof.proofAssetView(evidenceClaimRef),
      [dependentClaimRef]: await proof.proofAssetView(dependentClaimRef),
    },
    disclosurePreviews: await proof.disclosurePreviews(),
    disclosureReceipts: await proof.disclosureReceipts(),
    inspectClaim: await proof.inspectClaim({ claimId: evidenceClaimRef }),
  };
  store.close();
  record("store_closed", { proofDb: PROOF_DB });

  const store2 = new SqliteProofEvidenceStore(PROOF_DB);
  const blob2 = localProofBlobStore(BLOB_ROOT);
  const proof2 = makeProofEvidenceService({
    store: store2,
    blob: blob2,
    verificationPolicy: defaultProofVerificationPolicy(),
    publicationAdmission,
  });
  const disclosure2 = makeDisclosureService({ proof: proof2, exporter: localDisclosureExporter(EXPORT_ROOT), content: blobBackedSourceContentPort(blob2), admission: DISCLOSURE_ADMISSION });

  assert.deepEqual(await proof2.replay(), snapshot.events, "the full proof chain (including candidates/verification/publication/assessments) must replay identically");
  assert.deepEqual(await proof2.sources(), snapshot.sources, "sources must reconstruct exactly");
  assert.deepEqual(await proof2.sourceRevisions("degree"), snapshot.degreeRevisions, "degree revisions must reconstruct exactly");
  assert.deepEqual(await proof2.sourceRevisions("employment"), snapshot.employmentRevisions);
  assert.deepEqual(await proof2.sourceRevisions("financial"), snapshot.financialRevisions);
  for (const [evidenceId, item] of Object.entries(snapshot.evidence)) {
    assert.deepEqual(await proof2.evidence(evidenceId), item, `evidence ${evidenceId} must reconstruct exactly`);
  }
  assert.deepEqual(await proof2.publishedClaims(), snapshot.publishedClaims, "published claims must reconstruct exactly");
  for (const [claimId, why] of Object.entries(snapshot.whys)) {
    assert.deepEqual(await proof2.why(claimId), why, `why(${claimId}) must reconstruct exactly (verification/publication/assessments)`);
  }
  for (const [claimId, view] of Object.entries(snapshot.assetViews)) {
    assert.deepEqual(await proof2.proofAssetView(claimId), view, `assetView(${claimId}) must reconstruct exactly`);
  }
  assert.deepEqual(await proof2.disclosurePreviews(), snapshot.disclosurePreviews, "disclosure previews must reconstruct exactly");
  assert.deepEqual(await proof2.disclosureReceipts(), snapshot.disclosureReceipts, "disclosure receipts must reconstruct exactly");
  assert.deepEqual(await disclosure2.history(), snapshot.disclosureReceipts, "history() must read receipts from the proof plane after restart");
  assert.deepEqual(await proof2.inspectClaim({ claimId: evidenceClaimRef }), snapshot.inspectClaim);
  milestone("restartReconstruction", true, {
    chainEvents: snapshot.events.length,
    sources: snapshot.sources.length,
    publishedClaims: snapshot.publishedClaims.length,
    disclosurePreviews: snapshot.disclosurePreviews.length,
    disclosureReceipts: snapshot.disclosureReceipts.length,
  });

  store2.close();
  reasoningStore.close();

  const checks = { ...Object.fromEntries(Object.entries(milestoneResults).map(([name, status]) => [name, status === "PASS"])) };
  const passed = Object.values(milestoneResults).every((status) => status === "PASS");

  const evidence = {
    result: passed ? "PASS" : "PARTIAL",
    generatedAt: new Date().toISOString(),
    syntheticOnly: true,
    extraction: {
      mode: "deterministic-reasoning-cell",
      dshUsed: false,
      realReasoningCellService: true,
      reason:
        "The real DSH ephemeral-branch path cannot attach the proof-plane evidenceId: the branch host receives only the frozen brief and submits its own candidate, so a DSH-produced reasoning claim would carry no degree externalEvidenceRefs and the proof candidate would be unverifiable/unpublishable. A real makeReasoningCellService (real event chain, real verification + separate admission) is used with scripted deterministic policies; this is explicitly marked deterministic, not a fake DSH run.",
    },
    fixtures: ["degree.txt", "employment.json", "financial-summary.txt"],
    refs: {
      reasoningClaimRef,
      evidenceClaimRef,
      dependentClaimRef,
      employmentClaimRef,
      financialClaimRef,
      degreeEvidenceId: degreeEvidence.evidenceId,
      employmentEvidenceId: employmentEvidence.evidenceId,
      financialEvidenceId: financialEvidence.evidenceId,
    },
    disclosure: {
      previewId: preview.previewId,
      bundleDigest: receipt.bundleDigest,
      receiptDigest: receipt.digest,
      exportedFileCount: exportedFiles.length,
      excludedClaimIds,
      excludedEvidenceIds,
      excludedSourceIds: ["employment", "financial"],
    },
    staleCascade: {
      degreeBaseStanding: degreeView.baseStanding,
      degreeEffectiveStanding: degreeView.effectiveStanding,
      degreeFreshness: degreeView.freshness,
      dependentEffectiveStanding: dependentView.effectiveStanding,
      degreeRevisionCount: degreeRevisions.length,
    },
    restart: { reconstructedExactly: true, chainEvents: snapshot.events.length, disclosureReceiptCount: snapshot.disclosureReceipts.length, disclosurePreviewCount: snapshot.disclosurePreviews.length },
    checks,
    milestoneResults,
    timeline,
    elapsedMs: Date.now() - startedAt,
    note: "All fixture bytes are synthetic and generated inline; the run root is under the gitignored .dogfood/. No model/network call occurs on import (asserted via a fetch guard), and no federation send exists: the only effect is a local bundle write.",
  };

  mkdirSync(DOGFOOD, { recursive: true });
  writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2));
  process.stdout.write(JSON.stringify({ result: evidence.result, refs: evidence.refs, checks }, null, 2) + "\n");
  process.stdout.write(
    `\nPROOF-VAULT E2E ${evidence.result}: mode=${evidence.extraction.mode}, dshUsed=${evidence.extraction.dshUsed}, ` +
      `reasoningClaim=${reasoningClaimRef}, evidenceClaim=${evidenceClaimRef}, dependent=${dependentClaimRef}, ` +
      `receipts=${snapshot.disclosureReceipts.length}, elapsedMs=${evidence.elapsedMs}\n`,
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
  process.stderr.write(`proof-vault-e2e failed: ${error?.stack ?? String(error)}\n`);
}
process.exit(evidence.result === "PASS" ? 0 : 2);
