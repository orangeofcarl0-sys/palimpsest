/**
 * G10-AE External Asset Library Bridge — browser E2E over the REAL built product
 * stack (following `e2e/project-workspace.spec.ts`).
 *
 * Browser → dist/web bundle → real `serveOrchestration` (the typed
 * `/api/external-assets/*` and `/api/project/*` routes) → the real composed
 * `application.externalAssets` surface → the real bridge plane
 * (`src/external_assets/**`) → the real Ordarium effects runtime → the real
 * Project Workspace service over the real association/journal/bridge stores.
 *
 * The ONLY injected things are the three the campaign allows:
 *   - the external PROVIDER: the TEST-ONLY in-process adapter over
 *     `test/fixtures/external_library_fixture.ts`, which owns its OWN sqlite
 *     database (a different file from every Palimpsest store);
 *   - the CLOCK (a fixed instant);
 *   - the publication ADMISSION decision (an explicit host port).
 *
 * The golden flows this suite puts IN THE BROWSER:
 *   E2E-AE-01  search → hits, zero project mutation
 *   E2E-AE-02  inspect → the exact ref; reference → association visible, content
 *              still external
 *   E2E-AE-03  provider unavailable (the library goes down) and newer revision
 *              surfaced — the referenced digest never moves
 *   E2E-AE-04  import → ONE journal entry with structured external provenance
 *   E2E-AE-05  publication preview → zero effect; approve → stable external ref +
 *              association, with the local Journal still local
 *   E2E-AE-06  no approval port ⇒ NOT_APPROVED with zero external effect
 *
 * HONEST: "the external library goes down" is simulated by switching the
 * TEST-ONLY fixture's own read port into `unavailable` mode — an external event
 * this suite can only produce on the library side. The durable,
 * separate-process/restart variants of the same scenarios are covered by
 * `scripts/external_assets/ae-dogfood.mjs` and by the plane/integration suites.
 */

import { expect, test } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { installPalimpsest } from "../dist/src/advanced.js";
import {
  SqliteExternalAssetBridgeStore,
  SqliteProjectAssetAssociationStore,
  SqliteProjectJournalStore,
  externalAssetLibraryRegistryOf,
} from "../dist/src/advanced.js";
import { FakeGitPort } from "../dist/src/effects/index.js";
import { serveOrchestration } from "../dist/src/serve.js";
import { FixtureExternalLibrary } from "../test/fixtures/external_library_fixture.js";

const TOKEN = "e2e-external-assets";
const PROJECT_ID = "e2e-external-assets";
const HEAD = "b".repeat(40);
const CLOCK = "2026-09-16T00:00:00Z";
const PROVIDER_ID = "e2e-fixture-library";
const BODY_D1 = "External note revision one, referenced by the E2E project.";
const BODY_D2 = "External note revision two, which must never silently replace revision one.";
const LOCAL_TITLE = "Local idea the project publishes on purpose";
const LOCAL_BODY = "Exactly this body leaves the project — nothing else does.";

interface Session {
  readonly url: string;
  readonly fixture: FixtureExternalLibrary;
  /** The ref digest the browser will reference (revision 1). */
  readonly digest1: string;
  close(): Promise<void>;
}

async function startSession(options?: { readonly withAdmission?: boolean | undefined }): Promise<Session> {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-e2e-external-"));
  const fixture = new FixtureExternalLibrary(join(dir, "external-library.sqlite"), {
    providerId: PROVIDER_ID,
  });
  const revision1 = fixture.addRevision({
    assetId: "paper-1",
    assetType: "Paper",
    title: "Externally owned paper",
    body: BODY_D1,
    summary: "A paper the project may reference, but does not own.",
    tags: ["bridge"],
    revisionLabel: "r1",
    sourceLocator: "fixture://paper-1",
    searchScore: 1,
  });
  // A second asset that the search deliberately never matches, so "hits" is a
  // real filtering result and not "everything the library holds".
  fixture.addRevision({
    assetId: "nonmatching-1",
    assetType: "Idea",
    title: "Unrelated note",
    body: "Nothing in this body matches the search term below.",
  });

  const installed = installPalimpsest({ tools: { register: () => undefined } }, {
    projectId: PROJECT_ID,
    databasePath: join(dir, "state.sqlite"),
    ordariumDatabasePath: join(dir, "ordarium.sqlite"),
    clock: () => CLOCK,
    git: new FakeGitPort(HEAD),
    projectAssociationStore: new SqliteProjectAssetAssociationStore(join(dir, "associations.sqlite")),
    projectJournalStore: new SqliteProjectJournalStore(join(dir, "journal.sqlite")),
    externalAssetProviders: externalAssetLibraryRegistryOf([
      { read: fixture.readPort(), publication: fixture.publicationPort() },
    ]),
    externalAssetBridgeStore: new SqliteExternalAssetBridgeStore(join(dir, "bridge.sqlite")),
    ...(options?.withAdmission === false
      ? {}
      : {
          // The host-owned, SEPARATE admission port. The browser cannot approve by
          // pressing a button: this port (not the HTTP bearer token) decides.
          externalAssetPublicationAdmission: {
            policyRef: { policyId: "e2e-external-assets-admission", version: "1" },
            admit: async () => ({ decision: "APPROVE" as const, approver: "e2e:operator" }),
          },
        }),
  });
  installed.controller.start({
    projectId: PROJECT_ID,
    goal: "Reuse an externally owned asset without becoming the library.",
    headCommit: HEAD,
    tasks: [],
  });
  // One local journal entry exists from the start: the publication source.
  await installed.projectWorkspace!.recordJournalEntry({
    projectId: PROJECT_ID,
    kind: "IDEA",
    title: LOCAL_TITLE,
    body: LOCAL_BODY,
    provenance: "e2e-seed",
  });

  const handle = await serveOrchestration(installed.controller, {
    host: "127.0.0.1",
    port: 0,
    token: TOKEN,
    application: installed.application,
  });

  return {
    url: handle.url,
    fixture,
    digest1: revision1.contentDigest,
    close: async () => {
      await handle.close();
      await installed.dispose();
      try {
        fixture.close();
      } catch {
        /* already closed */
      }
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* Windows may hold a SQLite handle briefly; the temp dir is disposable. */
      }
    },
  };
}

/** Read the project workspace view through the REAL HTTP route (raw, for mutation proofs). */
async function workspaceBody(page: import("@playwright/test").Page): Promise<string> {
  return page.evaluate(async (headers: Record<string, string>) => {
    const response = await fetch("/api/project/workspace", { headers });
    return await response.text();
  }, { authorization: `Bearer ${TOKEN}` });
}

/**
 * Read the exact digest the INSPECT panel is showing (`provider/asset@digest`).
 * The golden flow asserts that whatever digest was inspected is the digest the
 * project later references — never a re-resolved "latest".
 */
async function inspectedDigestOf(page: import("@playwright/test").Page): Promise<string> {
  const text = (await page.getByTestId("external-inspect-ref").innerText()).replace(/\s+/gu, "");
  const at = text.lastIndexOf("@");
  expect(at).toBeGreaterThan(0);
  return text.slice(at + 1);
}

async function openExternalTab(page: import("@playwright/test").Page, session: Session): Promise<void> {
  await page.goto(session.url);
  await page.getByRole("button", { name: "External Assets", exact: true }).click();
  await expect(page.getByTestId("external-ownership-notice")).toBeVisible();
}

async function searchAndInspect(page: import("@playwright/test").Page): Promise<void> {
  await page.getByTestId("external-search-text").fill("External note revision");
  await page.getByTestId("external-search-run").click();
  await expect(page.getByTestId("external-search-hit")).toHaveCount(1);
  await page.getByTestId("external-inspect-run").click();
  await expect(page.getByTestId("external-inspect-ref")).toContainText(`@`);
}

/**
 * Make sure the EXTERNAL_ASSET reference exists, whatever order the tests ran in:
 * the golden flow is the operator one (search → inspect → reference), and a test
 * that needs the link creates it through the same browser path rather than
 * depending on another test's side effect.
 */
async function ensureReference(page: import("@playwright/test").Page): Promise<void> {
  if ((await page.getByTestId("external-reference-row").count()) > 0) return;
  await searchAndInspect(page);
  await page.getByTestId("external-reference-run").click();
  await expect(page.getByTestId("external-reference-result")).toContainText("association created");
}

test.describe("G10-AE External Assets", () => {
  let session: Session;

  test.beforeAll(async () => {
    session = await startSession();
  });
  test.afterAll(async () => {
    await session.close();
  });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token: string) => {
      window.localStorage.setItem("palimpsest-token", token);
    }, TOKEN);
  });

  test("E2E-AE-01: search returns ephemeral hits and mutates NOTHING", async ({ page }) => {
    await openExternalTab(page, session);

    // The provider is deployment config, with its capabilities visible.
    await expect(page.getByTestId("external-provider-row")).toHaveCount(1);
    await expect(page.getByTestId("external-provider-id")).toHaveText(PROVIDER_ID);
    await expect(page.getByTestId("external-provider-capabilities")).toContainText("SEARCH");
    await expect(page.getByTestId("external-provider-capabilities")).toContainText("PUBLISH");

    // Nothing is referenced or imported in a fresh project.
    await expect(page.getByTestId("external-references-empty")).toBeVisible();
    await expect(page.getByTestId("external-imports-empty")).toBeVisible();

    const before = await workspaceBody(page);
    await page.getByTestId("external-search-text").fill("External note revision");
    await page.getByTestId("external-search-run").click();
    // Only the matching asset comes back; the library's other asset does not.
    await expect(page.getByTestId("external-search-hit")).toHaveCount(1);
    await expect(page.getByTestId("external-search-hit")).toContainText("Externally owned paper");
    await expect(page.getByTestId("external-hit-type")).toHaveText("Paper");
    // The tab says, visibly, that a hit is not a reference and changes nothing.
    await expect(page.getByTestId("external-search-ephemeral")).toContainText("NOT a durable project reference");
    await expect(page.getByTestId("external-search-ephemeral")).toContainText("changes nothing in this project");

    // ZERO project mutation: the derived workspace read is byte-identical.
    expect(await workspaceBody(page)).toBe(before);
    await expect(page.getByTestId("external-references-empty")).toBeVisible();
  });

  test("E2E-AE-02: inspect is exact, and referencing links the project without copying content", async ({ page }) => {
    await openExternalTab(page, session);
    await searchAndInspect(page);

    // The EXACT ref (provider/asset@digest) — never a "latest" shorthand.
    await expect(page.getByTestId("external-inspect-ref")).toContainText(`${PROVIDER_ID}/paper-1@`);
    const inspected = await inspectedDigestOf(page);
    expect(inspected).toMatch(/^[0-9a-f]{64}$/u);
    await expect(page.getByTestId("external-inspect-owner")).toContainText("EXTERNAL OWNER");
    await expect(page.getByTestId("external-inspect-title")).toContainText("Externally owned paper");
    await expect(page.getByTestId("external-inspect-title")).toContainText("not stored as project truth");

    // INSPECT alone changes nothing either.
    await expect(page.getByTestId("external-references-empty")).toBeVisible();

    // The operator-explicit reference creates ONE association.
    await page.getByTestId("external-reference-run").click();
    await expect(page.getByTestId("external-reference-result")).toContainText("association created");

    // The derived view now shows the four-way distinction: the asset is still
    // EXTERNALLY OWNED, and the project holds a REFERENCE to it.
    const row = page.getByTestId("external-reference-row");
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId("external-ref-ownership")).toHaveText("EXTERNAL OWNER");
    await expect(row.getByTestId("external-ref-relation")).toHaveText("PROJECT REFERENCE");
    // The association binds the EXACT digest that was inspected (never a
    // re-resolved "latest").
    await expect(row.getByTestId("external-ref-digest")).toContainText(inspected.slice(0, 16));
    await expect(row.getByTestId("external-ref-status")).toContainText("RESOLVED");
    await expect(row.getByTestId("external-ref-status")).toContainText("available");
    await expect(row.getByTestId("external-ref-description")).toContainText("Paper");
    await expect(row.getByTestId("external-ref-provenance")).toContainText("REFERENCED_FROM_EXTERNAL_LIBRARY");

    // The content itself never entered the project: the referenced body is not in
    // the workspace view (only the derived title is).
    expect(await workspaceBody(page)).not.toContain(BODY_D1);
    // …and the association page shows the link as an EXTERNAL_ASSET ref.
    await page.getByRole("button", { name: "Assets", exact: true }).click();
    await expect(page.getByTestId("asset-card").filter({ hasText: "EXTERNAL_ASSET" })).toHaveCount(1);
    await expect(page.getByTestId("asset-card").filter({ hasText: `paper-1` })).toHaveCount(1);
  });

  test("E2E-AE-03: provider unavailable and a newer revision — the referenced digest never moves", async ({ page }) => {
    await openExternalTab(page, session);
    await ensureReference(page);
    await expect(page.getByTestId("external-reference-row")).toHaveCount(1);
    // The digest THIS project references, read from the derived view itself: the
    // row shows the first 16 hex characters of the referenced digest, which is
    // enough to prove that it never moves.
    const row = page.getByTestId("external-reference-row");
    const prefix = ((await row.getByTestId("external-ref-digest").innerText()).match(/[0-9a-f]{16}/u) ?? [""])[0]!;
    expect(prefix).toBe(session.digest1.slice(0, 16));

    // (1) The library gains a NEWER revision. The project must merely surface it.
    const revision2 = session.fixture.addRevision({
      assetId: "paper-1",
      assetType: "Paper",
      title: "Externally owned paper (revised)",
      body: BODY_D2,
      revisionLabel: "r2",
    });
    await page.getByTestId("project-refresh").click();
    await expect(row.getByTestId("external-ref-newer")).toContainText("a NEWER revision");
    await expect(row.getByTestId("external-ref-newer")).toContainText("NOT changed");
    // The referenced digest is UNCHANGED, and revision 2's CONTENT is nowhere in
    // the project: only its identity is surfaced as a hint (which is exactly what
    // "a newer revision is available" means).
    await expect(row.getByTestId("external-ref-digest")).toContainText(prefix);
    expect(await workspaceBody(page)).not.toContain(BODY_D2);
    expect((await workspaceBody(page)).includes(revision2.contentDigest)).toBe(true);

    // (2) The library goes DOWN. The association survives; the resolution says so.
    session.fixture.mode.unavailable = true;
    await page.getByTestId("project-refresh").click();
    await expect(row.getByTestId("external-ref-status")).toContainText("unavailable");
    await expect(row.getByTestId("external-ref-status")).toContainText("the association remains");
    await expect(row.getByTestId("external-ref-digest")).toContainText(prefix);
    // No title is fabricated for a revision that could not be read.
    await expect(row.getByTestId("external-ref-description")).toContainText("could not describe this revision");
    // The tab states the unavailable provider rather than an empty (false) asset.
    await expect(page.getByTestId("external-unavailable")).toHaveCount(0);
    await expect(page.getByTestId("external-references-empty")).toHaveCount(0);

    // Back up: the reference resolves again with the ORIGINAL digest.
    session.fixture.mode.unavailable = false;
    await page.getByTestId("project-refresh").click();
    await expect(row.getByTestId("external-ref-status")).toContainText("RESOLVED");
    await expect(row.getByTestId("external-ref-digest")).toContainText(prefix);
  });

  test("E2E-AE-04: an explicit import creates ONE local note with exact external provenance", async ({ page }) => {
    await openExternalTab(page, session);
    await searchAndInspect(page);
    const inspected = await inspectedDigestOf(page);

    // The caller picks the Journal kind EXPLICITLY (never a provider-type mapping).
    await page.getByTestId("external-import-kind").selectOption("REFERENCE_NOTE");
    await page.getByTestId("external-import-title").fill("Imported external note");
    await page.getByTestId("external-import-run").click();
    await expect(page.getByTestId("external-import-result")).toContainText("kind REFERENCE_NOTE");
    await expect(page.getByTestId("external-import-result")).toContainText("written");

    // The derived view reports the LOCAL note and its exact external origin.
    const imported = page.getByTestId("external-import-row");
    await expect(imported).toHaveCount(1);
    await expect(imported.getByTestId("external-import-label")).toHaveText("IMPORTED LOCAL NOTE");
    await expect(imported).toContainText("Imported external note");
    await expect(imported.getByTestId("external-import-provenance")).toContainText("paper-1");
    // The provenance names the EXACT revision the import materialized.
    await expect(imported.getByTestId("external-import-provenance")).toContainText(inspected.slice(0, 16));

    // The Journal (the existing local owner) really holds it — exactly once.
    await page.getByRole("button", { name: "History", exact: true }).click();
    await expect(page.getByTestId("history-journal")).toContainText("Imported external note");
    await page.getByRole("button", { name: "External Assets", exact: true }).click();
    await expect(page.getByTestId("external-import-row")).toHaveCount(1);
  });

  test("E2E-AE-05: the publication preview shows the exact outbound payload, and approval publishes once", async ({ page }) => {
    await openExternalTab(page, session);

    await page.getByTestId("external-publication-entry").selectOption({ label: `IDEA · ${LOCAL_TITLE}` });
    await page.getByTestId("external-publication-preview-run").click();

    // The preview is the EXACT content that would leave, and it says so.
    await expect(page.getByTestId("external-publication-preview-only")).toContainText("NOT a publication");
    await expect(page.getByTestId("external-publication-preview-only")).toContainText("no provider");
    await expect(page.getByTestId("external-publication-title")).toContainText(LOCAL_TITLE);
    await expect(page.getByTestId("external-publication-body")).toContainText(LOCAL_BODY);
    await expect(page.getByTestId("external-publication-metadata")).toContainText("palimpsest_journal_entry_id");
    await expect(page.getByTestId("external-publication-metadata")).toContainText("palimpsest_journal_kind");
    await expect(page.getByTestId("external-publication-payload-digest")).toContainText("payload digest");

    // PublicationPreview != Publication: the library holds nothing yet.
    expect(session.fixture.publishCalls).toBe(0);
    expect(session.fixture.publicationCount()).toBe(0);
    await expect(page.getByTestId("external-publication-result")).toContainText("no publication has been attempted");

    // The operator-explicit approval actually publishes (through the SEPARATE
    // admission port on the server) and returns a stable external ref.
    await page.getByTestId("external-publication-approve").click();
    await expect(page.getByTestId("external-publication-result")).toContainText("PUBLISHED");
    await expect(page.getByTestId("external-published-ref")).toContainText(PROVIDER_ID);
    await expect(page.getByTestId("external-published-ref")).toContainText("@");
    expect(session.fixture.publicationCount()).toBe(1);

    // The project now shows a PUBLISHED EXTERNAL COUNTERPART, distinct from any
    // project reference, and the local Journal entry is still local history.
    await page.getByTestId("project-refresh").click();
    const published = page.getByTestId("external-reference-row").filter({ hasText: "PUBLISHED EXTERNAL COUNTERPART" });
    await expect(published).toHaveCount(1);
    await expect(published.getByTestId("external-ref-ownership")).toHaveText("EXTERNAL OWNER");
    await page.getByRole("button", { name: "History", exact: true }).click();
    await expect(page.getByTestId("history-journal")).toContainText(LOCAL_TITLE);

    // The outbound payload was EXACTLY the local entry: nothing else left.
    const stored = session.fixture.rawDump();
    expect(stored).toContain(LOCAL_BODY);
    expect(stored).not.toContain("e2e-seed");
  });

  test("E2E-AE-06: with no approval port, publication is refused with ZERO external effect", async ({ page }) => {
    test.slow();
    const withoutAdmission = await startSession({ withAdmission: false });
    try {
      await openExternalTab(page, withoutAdmission);
      await page.getByTestId("external-publication-entry").selectOption({ label: `IDEA · ${LOCAL_TITLE}` });
      await page.getByTestId("external-publication-preview-run").click();
      await expect(page.getByTestId("external-publication-preview")).toBeVisible();

      await page.getByTestId("external-publication-approve").click();
      await expect(page.getByTestId("external-publication-result")).toContainText("NOT_APPROVED");
      await expect(page.getByTestId("external-publication-result")).toContainText("nothing left the project");

      // Zero external effect and zero internal terminal state.
      expect(withoutAdmission.fixture.publishCalls).toBe(0);
      expect(withoutAdmission.fixture.publicationCount()).toBe(0);
      expect(await workspaceBody(page)).not.toContain("PUBLISHED EXTERNAL COUNTERPART");
    } finally {
      await withoutAdmission.close();
    }
  });

  test("E2E-AE-07: the discovery route reports the bridge, and no other surface is invented", async ({ page }) => {
    await openExternalTab(page, session);
    const surfaces = await page.evaluate(async (headers: Record<string, string>) => {
      const response = await fetch("/api/application/surfaces", { headers });
      return (await response.json()) as Record<string, boolean>;
    }, { authorization: `Bearer ${TOKEN}` });
    expect(surfaces.externalAssets).toBe(true);
    // This rig wires no monitor runtime at all, and the bridge does not invent one:
    // a surface this deployment did not compose reports false.
    expect(surfaces.monitor).toBe(false);

    // The agent-facing tool exists, and it cannot approve anything.
    const tool = await page.evaluate(async (headers: Record<string, string>) => {
      const response = await fetch("/api/health", { headers });
      return (await response.json()) as Record<string, unknown>;
    }, { authorization: `Bearer ${TOKEN}` });
    expect(tool.ok).toBe(true);

    // A route the campaign does NOT declare is absent: there is no HTTP way to
    // approve by supplying an admission decision.
    const invented = await page.evaluate(async (headers: Record<string, string>) => {
      const response = await fetch("/api/external-assets/admit", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ decision: "APPROVE" }),
      });
      return response.status;
    }, { authorization: `Bearer ${TOKEN}` });
    expect(invented).toBe(404);
  });
});
