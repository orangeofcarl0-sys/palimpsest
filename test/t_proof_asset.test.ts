/**
 * G10-T authoritative Proof/Evidence plane — source/evidence/claim separation, policy-only
 * standing, immutable revisions, derived views, stale-cascade semantics, the read-only Campaign
 * port, and the install-level proof/disclosure wiring (T-N01…T-N35 semantics).
 *
 * All fixture material here is SYNTHETIC.
 */

import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  PROOF_STATEMENT_TYPE,
  ProofEvidenceServiceError,
  ProofStoreError,
  SqliteProofEvidenceStore,
  localProofBlobStore,
  makeProofEvidenceService,
  materializeProofSourceRevision,
  materializeProofSourceRevisionRef,
  proofCampaignEvidencePort,
  proofRevisionIdentityOf,
} from "../src/proof_asset/index.js";
import type {
  EvidenceSelector,
  ProofEvidenceService,
  ProofPolicyRef,
  ProofPublicationAdmissionPort,
  ProofVerificationPolicyPort,
  ProofClaimStanding,
} from "../src/proof_asset/index.js";

const DIR = mkdtempSync(join(tmpdir(), "palimpsest-t-proof-"));
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

const policyRef = (policyId = "test-verification"): ProofPolicyRef => ({ policyId, version: "v1" });

/** Deterministic test policy whose applied standing can be forced by a test. */
function testVerificationPolicy(script: { forced?: ProofClaimStanding; calls?: { count: number } } = {}): ProofVerificationPolicyPort {
  return {
    policyRef: policyRef(),
    async verify(input) {
      if (script.calls !== undefined) script.calls.count += 1;
      const supporting = input.candidate.supportingEvidence.map((entry) => entry.evidenceId);
      const contradicting = input.candidate.contradictingEvidence.map((entry) => entry.evidenceId);
      const standing: ProofClaimStanding =
        script.forced ??
        (supporting.length > 0 && contradicting.length === 0 ? "SUPPORTED" : supporting.length === 0 && contradicting.length > 0 ? "CONTRADICTED" : "INCONCLUSIVE");
      return { standing, supportingEvidenceIds: supporting, contradictingEvidenceIds: contradicting };
    },
  };
}

interface Built {
  readonly store: SqliteProofEvidenceStore;
  readonly service: ProofEvidenceService;
  readonly root: string;
  readonly calls: { count: number };
}

function build(script: { forced?: ProofClaimStanding; blob?: boolean; file?: boolean; admission?: ProofPublicationAdmissionPort } = {}): Built {
  const store = new SqliteProofEvidenceStore(script.file === true ? nextPath("proof") : ":memory:");
  const root = nextDir("blobs");
  const calls = { count: 0 };
  const service = makeProofEvidenceService({
    store,
    ...(script.blob === false ? {} : { blob: localProofBlobStore(root) }),
    verificationPolicy: testVerificationPolicy({ ...(script.forced === undefined ? {} : { forced: script.forced }), calls }),
    ...(script.admission === undefined ? {} : { publicationAdmission: script.admission }),
  });
  return { store, service, root, calls };
}

const refOf = (sourceId: string, revision: { readonly revision: number; readonly contentDigest: string }) =>
  materializeProofSourceRevisionRef({ sourceId, revision: revision.revision, contentDigest: revision.contentDigest });

async function publish(
  service: ProofEvidenceService,
  input: { sourceId: string; bytes: string; statement: string; selector?: EvidenceSelector; contradicting?: boolean },
) {
  const imported = await service.importSource({ bytes: bytesOf(input.bytes), mediaType: "text/plain", label: `synthetic-${input.sourceId}`, provenance: "LOCAL_IMPORT", sourceId: input.sourceId });
  const evidence = await service.recordEvidence({ sourceRevision: refOf(input.sourceId, imported.revision), selector: input.selector ?? { kind: "WHOLE_SOURCE" } });
  const candidate = await service.prepareCandidate({
    claimType: PROOF_STATEMENT_TYPE,
    content: { statement: input.statement },
    supportingEvidenceIds: input.contradicting === true ? [] : [evidence.evidenceId],
    ...(input.contradicting === true ? { contradictingEvidenceIds: [evidence.evidenceId] } : {}),
    origin: "MANUAL",
  });
  await service.verify({ candidateId: candidate.candidateId });
  const result = await service.decidePublication({ candidateId: candidate.candidateId });
  return { imported, evidence, candidate, result };
}

describe("G10-T proof asset: source/evidence/claim separation", () => {
  it("keeps source, evidence, and claim artifacts distinct (T-N01)", async () => {
    const { service, store } = build();
    const imported = await service.importSource({ bytes: bytesOf("synthetic source body"), mediaType: "text/plain", label: "synthetic-source", provenance: "LOCAL_IMPORT", sourceId: "src-a" });
    expect(imported.revision).not.toHaveProperty("statement");
    expect(imported.revision).not.toHaveProperty("evidenceId");

    const evidence = await service.recordEvidence({ sourceRevision: refOf("src-a", imported.revision), selector: { kind: "WHOLE_SOURCE" } });
    expect(evidence.sourceRevision.sourceId).toBe("src-a");
    expect(evidence.evidenceId).toMatch(/^pev-/);
    expect(evidence).not.toHaveProperty("candidateId");

    const candidate = await service.prepareCandidate({ claimType: PROOF_STATEMENT_TYPE, content: { statement: "synthetic claim" }, supportingEvidenceIds: [evidence.evidenceId], origin: "MANUAL" });
    expect(candidate.candidateId).toMatch(/^pcc-/);
    expect(candidate.supportingEvidence[0]!.evidenceId).toBe(evidence.evidenceId);
    // A recorded candidate is NOT a published claim.
    expect(await service.publishedClaims()).toHaveLength(0);
    store.close();
  });

  it("an evidence selection is a selection over an immutable revision, not the revision itself (T-N02)", async () => {
    const { service } = build();
    const imported = await service.importSource({ bytes: bytesOf("0123456789"), mediaType: "text/plain", label: "synthetic-range", provenance: "LOCAL_IMPORT", sourceId: "src-b" });
    const evidence = await service.recordEvidence({ sourceRevision: refOf("src-b", imported.revision), selector: { kind: "TEXT_RANGE", start: 2, end: 5 } });
    expect(evidence.selector).toEqual({ kind: "TEXT_RANGE", start: 2, end: 5 });
    expect(evidence.selectionDigest).not.toBe(imported.revision.contentDigest);
  });

  it("records a published claim id in the proof namespace, never a reasoning claim id (T-N03)", async () => {
    const { service } = build();
    const { result } = await publish(service, { sourceId: "src-c", bytes: "synthetic", statement: "synthetic claim" });
    expect(result.decision).toBe("PUBLISH");
    expect(result.claimId).toMatch(/^pc-/);
    expect(result.claimId).not.toMatch(/^cl-/);
  });
});

describe("G10-T proof asset: policy-only standing and publication admission", () => {
  it("cannot decide publication before a verification result exists (T-N04)", async () => {
    const { service } = build();
    const evidence = await (async () => {
      const imported = await service.importSource({ bytes: bytesOf("synthetic"), mediaType: "text/plain", label: "synthetic", provenance: "LOCAL_IMPORT", sourceId: "src-d" });
      return service.recordEvidence({ sourceRevision: refOf("src-d", imported.revision), selector: { kind: "WHOLE_SOURCE" } });
    })();
    const candidate = await service.prepareCandidate({ claimType: PROOF_STATEMENT_TYPE, content: { statement: "synthetic" }, supportingEvidenceIds: [evidence.evidenceId], origin: "MANUAL" });
    await expect(service.decidePublication({ candidateId: candidate.candidateId })).rejects.toMatchObject({ kind: "verification_required" });
  });

  it("verification and publication admission are SEPARATE policy seams (T-N05)", async () => {
    let decisions = 0;
    const admission: ProofPublicationAdmissionPort = {
      policyRef: { policyId: "test-admission", version: "v1" },
      async decide() {
        decisions += 1;
        return { decision: "UNRESOLVED" };
      },
    };
    const { service, calls } = build({ admission });
    const { candidate, result } = await publish(service, { sourceId: "src-e", bytes: "synthetic", statement: "synthetic claim" });
    expect(calls.count).toBe(1);
    expect(decisions).toBe(1);
    expect(result.decision).toBe("UNRESOLVED");
    expect(result.claimId).toBeUndefined();
    // The candidate was verified but NOT published: verification ≠ publication.
    expect(await service.publishedClaims()).toHaveLength(0);
    void candidate;
  });

  it("cannot self-report a standing or a publication decision (T-N06)", async () => {
    // A forged selection digest is rejected; the service always recomputes it.
    const { service } = build();
    const imported = await service.importSource({ bytes: bytesOf("synthetic content"), mediaType: "text/plain", label: "synthetic", provenance: "LOCAL_IMPORT", sourceId: "src-f" });
    await expect(
      service.recordEvidence({ sourceRevision: refOf("src-f", imported.revision), selector: { kind: "WHOLE_SOURCE" }, selectionDigest: "f".repeat(64) }),
    ).rejects.toMatchObject({ kind: "selection_digest_mismatch" });

    // A caller-supplied decision is structurally impossible; smuggling one is ignored.
    const contradictingAdmission: ProofPublicationAdmissionPort = {
      policyRef: { policyId: "test-admission", version: "v1" },
      async decide() {
        return { decision: "REJECT" };
      },
    };
    const forced = build({ admission: contradictingAdmission });
    const evidence = await (async () => {
      const imp = await forced.service.importSource({ bytes: bytesOf("synthetic"), mediaType: "text/plain", label: "synthetic", provenance: "LOCAL_IMPORT", sourceId: "src-g" });
      return forced.service.recordEvidence({ sourceRevision: refOf("src-g", imp.revision), selector: { kind: "WHOLE_SOURCE" } });
    })();
    const candidate = await forced.service.prepareCandidate({ claimType: PROOF_STATEMENT_TYPE, content: { statement: "synthetic" }, supportingEvidenceIds: [evidence.evidenceId], origin: "MANUAL" });
    await forced.service.verify({ candidateId: candidate.candidateId });
    const result = await forced.service.decidePublication({ candidateId: candidate.candidateId, decision: "PUBLISH" } as never);
    expect(result.decision).toBe("REJECT");
  });

  it("default admission refuses CONTRADICTED and leaves INCONCLUSIVE unresolved (T-N07)", async () => {
    const { service } = build();
    const contradicted = await publish(service, { sourceId: "src-h", bytes: "synthetic", statement: "synthetic contradicted", contradicting: true });
    expect(contradicted.result.decision).toBe("REJECT");
    expect(contradicted.result.claimId).toBeUndefined();

    const inconclusive = await (async () => {
      const candidate = await service.prepareCandidate({ claimType: PROOF_STATEMENT_TYPE, content: { statement: "synthetic inconclusive" }, supportingEvidenceIds: [], origin: "MANUAL" });
      await service.verify({ candidateId: candidate.candidateId });
      return service.decidePublication({ candidateId: candidate.candidateId });
    })();
    expect(inconclusive.decision).toBe("UNRESOLVED");
    expect(inconclusive.claimId).toBeUndefined();
    expect(await service.publishedClaims()).toHaveLength(0);
  });
});

describe("G10-T proof asset: immutable revisions and derived views", () => {
  it("is idempotent for identical bytes and never mutates an older revision (T-N08)", async () => {
    const { service, store } = build();
    const first = await service.importSource({ bytes: bytesOf("synthetic v1"), mediaType: "text/plain", label: "synthetic", provenance: "LOCAL_IMPORT", sourceId: "src-i" });
    const again = await service.importSource({ bytes: bytesOf("synthetic v1"), mediaType: "text/plain", label: "synthetic", provenance: "LOCAL_IMPORT", sourceId: "src-i" });
    expect(again.revision.revision).toBe(first.revision.revision);
    expect(again.revision.contentDigest).toBe(first.revision.contentDigest);

    const second = await service.importSource({ bytes: bytesOf("synthetic v2"), mediaType: "text/plain", label: "synthetic", provenance: "LOCAL_IMPORT", sourceId: "src-i" });
    expect(second.revision.revision).toBe(2);
    const revisions = await service.sourceRevisions("src-i");
    expect(revisions.map((entry) => entry.revision)).toEqual([1, 2]);
    expect(revisions[0]!.contentDigest).toBe(first.revision.contentDigest);
    store.close();
  });

  it("fails closed when the same (sourceId, revision) is re-registered with different content (T-N09)", async () => {
    const { service, store } = build();
    const imported = await service.importSource({ bytes: bytesOf("synthetic v1"), mediaType: "text/plain", label: "synthetic", provenance: "LOCAL_IMPORT", sourceId: "src-j" });
    const basis = await store.basis();
    expect(basis).toBeDefined();
    const conflicting = materializeProofSourceRevision({
      sourceId: "src-j",
      revision: imported.revision.revision,
      contentDigest: "d".repeat(64),
      mediaType: "text/plain",
      label: "synthetic",
      provenance: "LOCAL_IMPORT",
    });
    await expect(
      store.appendAtomic({ expectedBasis: basis!, events: [{ eventId: "forced-conflict-1", type: "SOURCE_REVISION_RECORDED", payload: { revision: conflicting } }] }),
    ).rejects.toBeInstanceOf(ProofStoreError);
    store.close();
  });

  it("a newer revision does not delete evidence recorded against an older one (T-N10)", async () => {
    const { service } = build();
    const v1 = await service.importSource({ bytes: bytesOf("synthetic v1"), mediaType: "text/plain", label: "synthetic", provenance: "LOCAL_IMPORT", sourceId: "src-k" });
    const evidence = await service.recordEvidence({ sourceRevision: refOf("src-k", v1.revision), selector: { kind: "WHOLE_SOURCE" } });
    await service.importSource({ bytes: bytesOf("synthetic v2"), mediaType: "text/plain", label: "synthetic", provenance: "LOCAL_IMPORT", sourceId: "src-k" });
    expect(await service.evidence(evidence.evidenceId)).toEqual(evidence);
    expect(await service.sourceRevisions("src-k")).toHaveLength(2);
  });

  it("derives ProofAssetView with no second store (T-N11)", async () => {
    const { service, store } = build();
    const { result } = await publish(service, { sourceId: "src-l", bytes: "synthetic", statement: "synthetic claim" });
    const claimId = result.claimId!;
    const before = (await store.replay()).length;
    const first = await service.proofAssetView(claimId);
    const second = await service.proofAssetView(claimId);
    expect(first.digest).toBe(second.digest);
    expect(first.claimRef.claimId).toBe(claimId);
    expect((await store.replay()).length).toBe(before);
    expect((await store.replay()).some((event) => (event.type as string) === "ASSET_VIEW_RECORDED")).toBe(false);
  });

  it("reports STALE (not FALSE) for a cascaded dependency and retains the base standing (T-N12)", async () => {
    const mutable: { standing: ProofClaimStanding } = { standing: "SUPPORTED" };
    const store = new SqliteProofEvidenceStore(":memory:");
    const service = makeProofEvidenceService({
      store,
      blob: localProofBlobStore(nextDir("blobs-cascade")),
      verificationPolicy: {
        policyRef: policyRef("mutable"),
        async verify(input) {
          return { standing: mutable.standing, supportingEvidenceIds: input.candidate.supportingEvidence.map((entry) => entry.evidenceId) };
        },
      },
    });
    const a = await publish(service, { sourceId: "src-m", bytes: "synthetic A", statement: "synthetic A" });
    const aId = a.result.claimId!;
    const evidenceB = await (async () => {
      const imported = await service.importSource({ bytes: bytesOf("synthetic B"), mediaType: "text/plain", label: "synthetic", provenance: "LOCAL_IMPORT", sourceId: "src-n" });
      return service.recordEvidence({ sourceRevision: refOf("src-n", imported.revision), selector: { kind: "WHOLE_SOURCE" } });
    })();
    const candidateB = await service.prepareCandidate({ claimType: PROOF_STATEMENT_TYPE, content: { statement: "synthetic B" }, supportingEvidenceIds: [evidenceB.evidenceId], dependencies: [{ claimId: aId }], origin: "MANUAL" });
    await service.verify({ candidateId: candidateB.candidateId });
    const b = await service.decidePublication({ candidateId: candidateB.candidateId });
    expect(b.decision).toBe("PUBLISH");
    const bId = b.claimId!;

    mutable.standing = "INCONCLUSIVE";
    await service.reassess({ claimId: aId, policyRef: { policyId: "mutable", version: "v1" } });
    const whyB = await service.why(bId);
    expect(whyB.baseStanding).toBe("SUPPORTED");
    expect(whyB.effectiveStanding).toBe("STALE");
    expect((await service.why(aId)).effectiveStanding).toBe("INCONCLUSIVE");
    store.close();
  });

  it("retains the append-only assessment history (T-N14)", async () => {
    const mutable: { standing: ProofClaimStanding } = { standing: "SUPPORTED" };
    const store = new SqliteProofEvidenceStore(":memory:");
    const service = makeProofEvidenceService({
      store,
      blob: localProofBlobStore(nextDir("blobs3")),
      verificationPolicy: {
        policyRef: policyRef("mutable"),
        async verify(input) {
          return { standing: mutable.standing, supportingEvidenceIds: input.candidate.supportingEvidence.map((entry) => entry.evidenceId) };
        },
      },
    });
    const a = await publish(service, { sourceId: "src-q", bytes: "synthetic", statement: "synthetic" });
    const aId = a.result.claimId!;
    mutable.standing = "INCONCLUSIVE";
    await service.reassess({ claimId: aId, policyRef: { policyId: "mutable", version: "v1" } });
    await service.reassess({ claimId: aId, policyRef: { policyId: "mutable", version: "v1" } });
    const why = await service.why(aId);
    expect(why.assessments).toHaveLength(2);
    expect(why.assessments[0]!.standing).toBe("INCONCLUSIVE");
    store.close();
  });
});

describe("G10-T proof asset: read-only Campaign port and content discipline", () => {
  it("exposes the proof plane to Campaign as a read-only port returning known + digest (T-N15)", async () => {
    const { service, store } = build();
    const { result } = await publish(service, { sourceId: "src-r", bytes: "synthetic", statement: "synthetic" });
    const port = proofCampaignEvidencePort(service);
    expect(Object.keys(port)).toEqual(["inspectClaim"]);
    const before = (await store.replay()).length;
    const known = await port.inspectClaim({ claimId: result.claimId! });
    expect(known.state).toBe("known");
    if (known.state === "known") {
      expect(known.value.digest).toMatch(/^[0-9a-f]{64}$/);
      expect(known.value.provenanceDigest.length).toBeGreaterThan(0);
    }
    const unknown = await port.inspectClaim({ claimId: "pc-does-not-exist" });
    expect(unknown.state).toBe("unknown");
    expect((await store.replay()).length).toBe(before);
    expect(port).not.toHaveProperty("verify");
    expect(port).not.toHaveProperty("decidePublication");
    expect(port).not.toHaveProperty("reassess");
  });

  it("keeps raw source bytes out of the semantic SQLite rows (T-N16)", async () => {
    const secret = "SYNTHETIC-SECRET-SOURCE-BYTES-4f8a";
    const path = nextPath("semantic2");
    const store = new SqliteProofEvidenceStore(path);
    const service = makeProofEvidenceService({ store, blob: localProofBlobStore(nextDir("blobs5")) });
    await service.importSource({ bytes: bytesOf(secret), mediaType: "text/plain", label: "synthetic", provenance: "LOCAL_IMPORT", sourceId: "src-t" });
    store.close();

    const reader = new DatabaseSync(path);
    const rows = reader.prepare("SELECT payload_json FROM proof_events").all() as unknown as { payload_json: string }[];
    reader.close();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.payload_json).not.toContain(secret);
      expect(row.payload_json).not.toContain(Buffer.from(secret).toString("base64"));
    }
  });

  it("treats a local file path as no part of semantic identity (T-N17)", async () => {
    const { service } = build();
    const imported = await service.importSource({ bytes: bytesOf("synthetic path bytes"), mediaType: "text/plain", label: "C:\\synthetic\\local\\file.txt", provenance: "LOCAL_IMPORT", sourceId: "src-u" });
    expect(imported.revision.blobRef).toBe(imported.revision.contentDigest);
    const withPath = proofRevisionIdentityOf(imported.revision);
    const noPath = proofRevisionIdentityOf({ ...imported.revision, label: "synthetic" });
    expect(withPath).toBe(noPath);
  });

  it("yields unavailable (not false) for a missing blob and errors on selection (T-N18)", async () => {
    const store = new SqliteProofEvidenceStore(":memory:");
    const service = makeProofEvidenceService({ store });
    const imported = await service.importSource({ bytes: bytesOf("synthetic orphan"), mediaType: "text/plain", label: "synthetic", provenance: "LOCAL_IMPORT", sourceId: "src-v" });
    const ref = refOf("src-v", imported.revision);
    expect(await service.readSourceContent(ref)).toBeUndefined();
    await expect(service.recordEvidence({ sourceRevision: ref, selector: { kind: "WHOLE_SOURCE" } })).rejects.toBeInstanceOf(ProofEvidenceServiceError);
  });

  it("triggers no verification/model call during import (T-N19)", async () => {
    const { service, calls } = build();
    await service.importSource({ bytes: bytesOf("synthetic one"), mediaType: "text/plain", label: "synthetic", provenance: "LOCAL_IMPORT", sourceId: "src-w" });
    await service.importSource({ bytes: bytesOf("synthetic two"), mediaType: "text/plain", label: "synthetic", provenance: "LOCAL_IMPORT", sourceId: "src-x" });
    expect(calls.count).toBe(0);
  });

  it("exposes content only through the explicit read path (T-N20)", async () => {
    const { service } = build();
    const imported = await service.importSource({ bytes: bytesOf("synthetic explicit"), mediaType: "text/plain", label: "synthetic", provenance: "LOCAL_IMPORT", sourceId: "src-y" });
    expect(JSON.stringify(imported.revision)).not.toContain("synthetic explicit");
    const bytes = await service.readSourceContent(refOf("src-y", imported.revision));
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(bytes!)).toBe("synthetic explicit");
  });
});

describe("G10-T proof asset: install wiring", () => {
  it("exposes proof/disclosure on a proof-wired install and keeps Work-only installs at nine tools (T-N21)", async () => {
    const { installPalimpsest } = await import("../src/install.js");
    const host = { tools: { register: () => undefined } };
    // A bare Work-only install must stay at exactly nine Work tools and expose no proof surface.
    const bare = installPalimpsest(host as never, {
      projectId: "p-bare-proof",
      databasePath: nextPath("bare-state"),
      ordariumDatabasePath: nextPath("bare-ord"),
    });
    expect(bare.tools).toHaveLength(9);
    expect(bare.tools.every((definition) => definition.name.startsWith("palimpsest_"))).toBe(true);
    expect(bare.proof).toBeUndefined();
    expect(bare.disclosure).toBeUndefined();
    expect(bare.application.proof).toBeUndefined();
    await bare.dispose();

    const store = new SqliteProofEvidenceStore(":memory:");
    const installed = installPalimpsest(host as never, {
      projectId: "p-proof",
      databasePath: nextPath("proof-state"),
      ordariumDatabasePath: nextPath("proof-ord"),
      proofEvidenceStore: store,
      proofBlobStore: localProofBlobStore(nextDir("installed-blobs")),
    });
    expect(installed.proof).toBeDefined();
    expect(installed.disclosure).toBeDefined();
    expect(installed.application.proof).toBeDefined();
    expect(installed.application.disclosure).toBeDefined();
    expect(installed.tools.map((definition) => definition.name)).toContain("palimpsest_proof");
    expect(installed.tools.map((definition) => definition.name)).toContain("palimpsest_proof_source");
    expect(installed.tools.map((definition) => definition.name)).toContain("palimpsest_disclosure");
    await installed.dispose();
  });

  it("passes a Campaign evidence port derived from the proof plane when none is supplied (T-N22)", async () => {
    const { installPalimpsest } = await import("../src/install.js");
    const { SqliteCampaignStore } = await import("../src/campaign/index.js");
    const { SqliteInstitutionStore } = await import("../src/institution/index.js");
    const host = { tools: { register: () => undefined } };
    const campaignStore = new SqliteCampaignStore(":memory:");
    const institutionStore = new SqliteInstitutionStore(":memory:");
    const store = new SqliteProofEvidenceStore(":memory:");
    const installed = installPalimpsest(host as never, {
      projectId: "p-proof-campaign",
      databasePath: nextPath("camp-state"),
      ordariumDatabasePath: nextPath("camp-ord"),
      proofEvidenceStore: store,
      proofBlobStore: localProofBlobStore(nextDir("camp-blobs")),
      campaignStore,
      institutionStore,
    });
    expect(installed.campaign).toBeDefined();
    await installed.dispose();
  });
});
