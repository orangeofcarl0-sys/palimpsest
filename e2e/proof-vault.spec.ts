/**
 * G10-U Proof Vault — browser E2E over the REAL built product stack.
 *
 * Browser → dist/web bundle → real serveOrchestration (typed /api/proof/* routes) → real
 * ProofEvidenceService / DisclosureService → real SQLite proof chain + local blob vault.
 * Only the deterministic external seams are supplied: the disclosure admission returns
 * APPROVE and the disclosure exporter root is a temp dir. Nothing about the proof plane is
 * mocked.
 *
 * The 13-step flow (Sources empty state → import → revision → evidence → published asset →
 * standing + Why → newer revision ⇒ STALE → disclosure preview → export → history) is driven
 * through the UI. The published asset is seeded through the exported canonical service over
 * the SAME store: the application surface deliberately cannot accept a caller-declared
 * freshness policy, and the STALE step requires `LATEST_SOURCE_REVISION` provenance. This is
 * reported as an API/UI gap; the seed is setup, never the subject under test.
 */

import { expect, test } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { installPalimpsest } from "../dist/src/advanced.js";
import {
  SqliteProofEvidenceStore,
  blobBackedSourceContentPort,
  localProofBlobStore,
  makeProofEvidenceService,
} from "../dist/src/advanced.js";
import { serveOrchestration } from "../dist/src/serve.js";

const TOKEN = "e2e-proof";
const SOURCE_ID = "degree";
const SOURCE_LABEL = "degree.txt";
const SOURCE_TEXT = "Degree: BSc Computer Science\nIssued: 2020\nInstitution: Example University";
const SOURCE_TEXT_V2 = `${SOURCE_TEXT}\nUpdated: 2021`;
const RANGE = { start: 0, end: 20 };
const IMPORT_NOTICE = "Importing stores the source locally and does not send it to a model. Analysis is a separate explicit action.";

interface ProofSession {
  readonly url: string;
  /** Publish a deterministic proof asset supporting one evidence id; returns the claim id. */
  publish(evidenceId: string): Promise<string>;
  close(): Promise<void>;
}

async function startProof(): Promise<ProofSession> {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-e2e-proof-"));
  const proofStore = new SqliteProofEvidenceStore(join(dir, "proof.sqlite"));
  const blobs = localProofBlobStore(join(dir, "blobs"));
  const contentPort = blobBackedSourceContentPort(blobs);

  const installed = installPalimpsest({ tools: { register: () => undefined } }, {
    projectId: "e2e-proof",
    databasePath: join(dir, "state.sqlite"),
    ordariumDatabasePath: join(dir, "ordarium.sqlite"),
    proofEvidenceStore: proofStore,
    proofBlobStore: blobs,
    proofContentPort: contentPort,
    disclosureExporterRoot: join(dir, "exports"),
    disclosureAdmission: {
      policyRef: { policyId: "e2e.disclosure-admission", version: "v1" },
      admit: async () => ({ decision: "APPROVE" }),
    },
  });

  const handle = await serveOrchestration(installed.controller, {
    host: "127.0.0.1",
    port: 0,
    token: TOKEN,
    application: installed.application,
  });

  // A second canonical service over the SAME store, used only to seed a published asset with
  // an explicit freshness policy (setup, never the subject under test).
  const seedService = makeProofEvidenceService({
    store: proofStore,
    blob: blobs,
    contentPort: {
      resolve: (input: { readonly revision: { readonly sourceId: string; readonly revision: number; readonly contentDigest: string } }) =>
        contentPort.readContent({
          sourceId: input.revision.sourceId,
          revision: input.revision.revision,
          contentDigest: input.revision.contentDigest,
        }),
    },
  });

  return {
    url: handle.url,
    publish: async (evidenceId: string): Promise<string> => {
      const candidate = await seedService.prepareCandidate({
        claimType: { typeId: "proof.statement", version: "v1" },
        content: { statement: "The holder has a BSc in Computer Science (per the imported degree source)." },
        supportingEvidenceIds: [evidenceId],
        origin: "MANUAL",
        provenance: { freshnessPolicy: "LATEST_SOURCE_REVISION" },
      });
      const verification = await seedService.verify({ candidateId: candidate.candidateId });
      if (verification.standing !== "SUPPORTED") throw new Error(`expected SUPPORTED verification, got ${verification.standing}`);
      const publication = await seedService.decidePublication({ candidateId: candidate.candidateId });
      if (publication.claimId === undefined) throw new Error(`expected a PUBLISH decision, got ${publication.decision}`);
      return publication.claimId;
    },
    close: async () => {
      await handle.close();
      await installed.dispose();
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Windows may still hold a SQLite handle briefly; the temp dir is disposable.
      }
    },
  };
}

test.describe("G10-U Proof Vault", () => {
  let session: ProofSession;

  test.beforeAll(async () => {
    session = await startProof();
  });
  test.afterAll(async () => {
    await session.close();
  });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token: string) => {
      window.localStorage.setItem("palimpsest-token", token);
    }, TOKEN);
  });

  test("E2E-PROOF-01: import → evidence → standing/Why → STALE → disclosure preview → export → history", async ({ page }) => {
    // 1. Open the Proof Vault from the Work header.
    await page.goto(session.url);
    await page.getByRole("button", { name: "Proof Vault", exact: true }).click();
    await expect(page.getByRole("button", { name: "Sources", exact: true })).toBeVisible();

    // 2. The Sources empty state states the local-only import fact verbatim.
    await expect(page.getByText(IMPORT_NOTICE)).toBeVisible();

    // 3. Import the synthetic degree source through the explicit local import form.
    await page.getByTestId("source-file").setInputFiles({ name: SOURCE_LABEL, mimeType: "text/plain", buffer: Buffer.from(SOURCE_TEXT) });
    await expect(page.getByLabel("confirm local import")).toBeVisible();
    await page.getByTestId("import-source-id").fill(SOURCE_ID);
    await page.getByLabel("confirm local import").check();
    await page.getByTestId("import-source").click();
    await expect(page.getByTestId("source-row").first()).toBeVisible();
    await expect(page.getByTestId("source-row").first()).toContainText(SOURCE_ID);

    // 4. Inspect revision 1 and explicitly preview its content.
    await expect(page.getByTestId("source-detail")).toBeVisible();
    await expect(page.getByTestId("revision-digest")).toHaveText(/^[0-9a-f]{64}$/u);
    await page.getByTestId("preview-content").click();
    await expect(page.getByTestId("source-content-preview")).toContainText("Degree: BSc Computer Science");

    // 5. Create a TEXT_RANGE EvidenceItem over revision 1.
    await page.getByRole("button", { name: "Evidence", exact: true }).click();
    await page.getByTestId("evidence-selector-kind").selectOption("TEXT_RANGE");
    await page.getByLabel("text range start").fill(String(RANGE.start));
    await page.getByLabel("text range end").fill(String(RANGE.end));
    await page.getByTestId("create-evidence").click();
    const evidenceId = (await page.getByTestId("last-evidence-id").textContent())!.trim();
    expect(evidenceId.length).toBeGreaterThan(0);

    // 6. Publish a deterministic ProofAsset for that exact evidence (seeded via the canonical service).
    const claimId = await session.publish(evidenceId);

    // 7. The Proof Assets list/detail shows the standing and the full Why chain.
    await page.getByRole("button", { name: "Proof Assets", exact: true }).click();
    await page.getByTestId("proof-refresh-claims").click();
    await expect(page.getByTestId("asset-row").first()).toBeVisible();
    await expect(page.getByTestId("asset-standing").first()).toHaveText("SUPPORTED");
    await page.getByTestId("asset-why").first().click();
    await expect(page.getByTestId("asset-why-detail").first()).toContainText("proof.default-verification");
    await expect(page.getByTestId("asset-why-detail").first()).toContainText(evidenceId);

    // 8. Import a NEWER revision of the same source through the UI.
    await page.getByRole("button", { name: "Sources", exact: true }).click();
    await page.getByTestId("source-file").setInputFiles({ name: "degree-v2.txt", mimeType: "text/plain", buffer: Buffer.from(SOURCE_TEXT_V2) });
    await expect(page.getByLabel("confirm local import")).toBeVisible();
    await page.getByTestId("import-source-id").fill(SOURCE_ID);
    await page.getByLabel("confirm local import").check();
    await page.getByTestId("import-source").click();
    await expect(page.getByTestId("source-row").first()).toContainText("2 revision(s)");

    // 9. The asset is now STALE, and the UI explains why (historical support is not current support).
    await page.getByRole("button", { name: "Proof Assets", exact: true }).click();
    await page.getByTestId("proof-refresh-claims").click();
    await expect(page.getByTestId("asset-standing").first()).toHaveText("STALE");
    await expect(page.getByTestId("asset-stale-explanation").first()).toContainText("newer revision");

    // 10. Disclosure selects the education proof and describes the exact export.
    await page.getByRole("button", { name: "Disclosure", exact: true }).click();
    await page.getByLabel(`select claim ${claimId}`).check();
    await page.getByTestId("disclosure-purpose").fill("education verification");
    await page.getByTestId("disclosure-audience").fill("Example University registrar");
    await page.getByTestId("disclosure-preview").click();

    // 11. Preview shows the exact excerpt file name materialized from the selector.
    const expectedFileName = `evidence-${evidenceId}.txt`;
    await expect(page.getByTestId("disclosure-preview-result")).toBeVisible();
    await expect(page.getByTestId("disclosure-material-file").first()).toHaveText(expectedFileName);
    await expect(page.getByTestId("disclosure-preview-result")).toContainText("TEXT_EXCERPT");

    // 12. Approve & Export is a SEPARATE explicit action.
    await page.getByTestId("disclosure-export").click();
    await expect(page.getByTestId("disclosure-outcome")).toBeVisible();
    await expect(page.getByTestId("disclosure-receipt")).toContainText("EXPORTED");

    // 13. History shows the EXPORTED local write acknowledgement with purpose/audience/time/bundle/exporter.
    await expect(page.getByTestId("disclosure-history-row").first()).toBeVisible();
    await expect(page.getByTestId("disclosure-history-row").first()).toContainText("EXPORTED");
    await expect(page.getByTestId("disclosure-history-row").first()).toContainText("education verification");
    await expect(page.getByTestId("disclosure-history-row").first()).toContainText("Example University registrar");
    await expect(page.getByTestId("disclosure-history-row").first()).toContainText("local-disclosure-exporter");

    // The disclosure surface never renders a sharing/delivery verb.
    for (const forbidden of [/\bSend\b/u, /\bShare\b/u, /\bDelivered\b/u, /\bEmail\b/u, /\bUpload\b/u, /\bReceived\b/u, /\bAccepted\b/u]) {
      await expect(page.getByText(forbidden)).toHaveCount(0);
    }
  });
});
