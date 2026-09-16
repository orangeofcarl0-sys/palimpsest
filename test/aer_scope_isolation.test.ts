/**
 * G10-AE-R — PROJECT WORKSPACE SCOPE ISOLATION (adversarial suite, AER-N01…N19).
 *
 * The core question (spec §25):
 *   If two projects share the same physical Project Workspace database, can the
 *   installed Project OS for project A prove that every normal project read is
 *   about A and only A?
 *
 * RIG: ONE physical `SqliteProjectAssetAssociationStore` and ONE physical
 * `SqliteProjectJournalStore`, each holding TWO scopes (project-A, project-B).
 * project-B is seeded by its OWN B-bound installation over the SAME two files —
 * that is what a shared store actually looks like — and that installation is
 * disposed before the A-bound reads (exactly as `scripts/scope/aer0-repro.mjs`
 * does). The A-bound installation then shares both files.
 *
 * Everything runs on the REAL product stack (real stores, real HTTP dispatcher,
 * real agent tools); the only injected things are the TEST-ONLY external library
 * fixture, the clock and a fake git port.
 *
 * AER-N20…N24 (AE dogfood / AD verification / AC-R monitor / AB posture / W-X-Y-Z-AA
 * correctness still green) are the FULL-SUITE gate, not assertions here: they are
 * proven by running `pnpm exec vitest run`, the dogfood scripts and Playwright.
 * They are deliberately NOT faked with file-existence checks.
 *
 * The one honest note this suite used to carry — the plane-level external
 * `resolve(foreignId)` read — is CLOSED IN AE-R and asserted at AER-N12b below.
 */

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { handleApplicationRequest } from "../src/application/http.js";
import { FakeGitPort } from "../src/effects/index.js";
import { installPalimpsest, type InstalledPalimpsest } from "../src/install.js";
import {
  SqliteProjectAssetAssociationStore,
  SqliteProjectJournalStore,
} from "../src/project_workspace/index.js";
import {
  SqliteExternalAssetBridgeStore,
  externalAssetLibraryRegistryOf,
  materializeExternalAssetImportCandidate,
  materializeExternalAssetStableRef,
} from "../src/external_assets/index.js";

import {
  FIXTURE_PROVIDER_ID,
  FixtureExternalLibrary,
} from "./fixtures/external_library_fixture.js";
import { taskSpec } from "./helpers.js";

/* -------------------------------------------------------------------------- *
 * Constants
 * -------------------------------------------------------------------------- */

const PROJECT_A = "project-A";
const PROJECT_B = "project-B";
const HEAD_A = "a".repeat(40);
const HEAD_B = "b".repeat(40);
const CLOCK = "2026-09-16T00:00:00Z";

const B_TITLE = "B-SECRET-TITLE";
const B_BODY = "B-SECRET-BODY";
const B_ASSET_ID = "art-b";
const B_EXT_ASSET_ID = "b-ext";
const B_EXT_TITLE = "B-EXT-TITLE";

const A_TITLE = "A-TITLE";
const A_ASSET_ID = "dec-a";
const A_EXT_ASSET_ID = "a-ext";

/** Any string that must NEVER appear in an A-bound read's payload. */
const B_MARKERS = [B_TITLE, B_BODY, B_ASSET_ID, B_EXT_ASSET_ID, B_EXT_TITLE] as const;

/* -------------------------------------------------------------------------- *
 * Rig: one shared store pair, two scopes, one A-bound installation
 * -------------------------------------------------------------------------- */

interface SharedRig {
  readonly dir: string;
  readonly statePath: string;
  readonly associationPath: string;
  readonly journalPath: string;
  readonly installed: InstalledPalimpsest;
  readonly fixture: FixtureExternalLibrary;
  readonly bJournalEntryId: string;
  readonly aJournalEntryId: string;
  readonly bExternalDigest: string;
  close(): Promise<void>;
}

let rig: SharedRig;

/** The raw number of rows in a shared-store table (a direct store-owner read). */
function rawCount(databasePath: string, sql: string): number {
  const database = new DatabaseSync(databasePath);
  try {
    return Number((database.prepare(sql).get() as { readonly n?: number }).n ?? 0);
  } finally {
    database.close();
  }
}

function rawDump(databasePath: string, sql: string): string {
  const database = new DatabaseSync(databasePath);
  try {
    return JSON.stringify(database.prepare(sql).all());
  } finally {
    database.close();
  }
}

function assertNoB(value: unknown, where: string): void {
  const text = JSON.stringify(value);
  for (const marker of B_MARKERS) {
    expect(text, `${where} leaked ${marker}`).not.toContain(marker);
  }
}

async function http(
  method: string,
  pathname: string,
  body?: unknown,
  query?: Record<string, string>,
): Promise<{ readonly status: number; readonly body: unknown }> {
  const result = await handleApplicationRequest({
    application: rig.installed.application,
    method,
    pathname,
    query: new URLSearchParams(query ?? {}),
    body,
  });
  if (result === undefined) throw new Error(`no application route for ${method} ${pathname}`);
  return result;
}

function toolActions(name: string): readonly string[] | undefined {
  const definition = rig.installed.tools.find((tool) => tool.name === name);
  if (definition === undefined) return undefined;
  const properties = (definition.parameters as { readonly properties?: Record<string, unknown> }).properties;
  return (properties?.["action"] as { readonly enum?: readonly string[] } | undefined)?.enum;
}

function tool(name: string) {
  const definition = rig.installed.tools.find((candidate) => candidate.name === name);
  if (definition === undefined) throw new Error(`the ${name} tool is not registered`);
  return definition;
}

async function buildRig(): Promise<SharedRig> {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-aer-"));
  const statePath = join(dir, "state.sqlite");
  const associationPath = join(dir, "associations.sqlite");
  const journalPath = join(dir, "journal.sqlite");

  const fixture = new FixtureExternalLibrary(join(dir, "external-library.sqlite"));
  const registry = externalAssetLibraryRegistryOf([
    { read: fixture.readPort(), publication: fixture.publicationPort() },
  ]);
  const aExtRev = fixture.addRevision({
    assetId: A_EXT_ASSET_ID,
    assetType: "Note",
    title: "A external note",
    body: "A external body",
  });
  const bExtRev = fixture.addRevision({
    assetId: B_EXT_ASSET_ID,
    assetType: "Note",
    title: B_EXT_TITLE,
    body: "B external body",
  });

  const install = (projectId: string, head: string, label: string) =>
    installPalimpsest({ tools: { register: () => undefined } }, {
      projectId,
      databasePath: join(dir, `state-${label}.sqlite`),
      ordariumDatabasePath: join(dir, `ordarium-${label}.sqlite`),
      clock: () => CLOCK,
      git: new FakeGitPort(head),
      projectAssociationStore: new SqliteProjectAssetAssociationStore(associationPath),
      projectJournalStore: new SqliteProjectJournalStore(journalPath),
      externalAssetProviders: registry,
      externalAssetBridgeStore: new SqliteExternalAssetBridgeStore(join(dir, `bridge-${label}.sqlite`)),
    });

  /* ---- project-B is seeded by its OWN B-bound installation over the shared files ---- */
  const bInstalled = install(PROJECT_B, HEAD_B, "b");
  bInstalled.controller.start({ projectId: PROJECT_B, goal: "B", headCommit: HEAD_B, tasks: [taskSpec("tb")] });
  const bEntry = await bInstalled.projectWorkspace!.recordJournalEntry({
    projectId: PROJECT_B,
    kind: "IDEA",
    title: B_TITLE,
    body: B_BODY,
    provenance: "aer",
  });
  await bInstalled.projectWorkspace!.associateAsset({
    projectId: PROJECT_B,
    assetKind: "PRODUCED_ARTIFACT",
    canonicalRef: { kind: "artifact", id: B_ASSET_ID },
    associationKind: "MANUAL",
    provenance: "aer",
  });
  const bPrep = await bInstalled.externalAssets!.prepareReference({
    projectId: PROJECT_B,
    providerId: FIXTURE_PROVIDER_ID,
    assetId: B_EXT_ASSET_ID,
    contentDigest: bExtRev.contentDigest,
  });
  if (bPrep.status !== "PREPARED") throw new Error(`B external prepare was denied: ${JSON.stringify(bPrep)}`);
  const bCommitted = await bInstalled.externalAssets!.commitReference(bPrep.candidate);
  expect(bCommitted.status).toBe("COMMITTED");
  // `dispose()` closes the SUPPLIED stores, so B's handles are released and A may reopen.
  await bInstalled.dispose();

  /* ---- the installation under test: bound to project-A, sharing BOTH files ---- */
  const installed = install(PROJECT_A, HEAD_A, "a");
  installed.controller.start({ projectId: PROJECT_A, goal: "A", headCommit: HEAD_A, tasks: [taskSpec("ta")] });
  const aEntry = await installed.projectWorkspace!.recordJournalEntry({
    projectId: PROJECT_A,
    kind: "IDEA",
    title: A_TITLE,
    body: "A-BODY",
    provenance: "aer",
  });
  await installed.projectWorkspace!.associateAsset({
    projectId: PROJECT_A,
    assetKind: "DECISION",
    canonicalRef: { kind: "decision", id: A_ASSET_ID },
    associationKind: "MANUAL",
    provenance: "aer",
  });
  const aPrep = await installed.externalAssets!.prepareReference({
    projectId: PROJECT_A,
    providerId: FIXTURE_PROVIDER_ID,
    assetId: A_EXT_ASSET_ID,
    contentDigest: aExtRev.contentDigest,
  });
  if (aPrep.status !== "PREPARED") throw new Error(`A external prepare was denied: ${JSON.stringify(aPrep)}`);
  await installed.externalAssets!.commitReference(aPrep.candidate);

  return {
    dir,
    statePath,
    associationPath,
    journalPath,
    installed,
    fixture,
    bJournalEntryId: bEntry.entryId,
    aJournalEntryId: aEntry.entryId,
    bExternalDigest: bExtRev.contentDigest,
    async close() {
      await installed.dispose();
      fixture.close();
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* Windows may hold a SQLite handle briefly; the temp dir is disposable. */
      }
    },
  };
}

beforeAll(async () => {
  rig = await buildRig();
});

afterAll(async () => {
  await rig.close();
});

/* -------------------------------------------------------------------------- *
 * Service-level scope isolation
 * -------------------------------------------------------------------------- */

describe("G10-AE-R service-level scope isolation", () => {
  it("AER-N01: assets() never enumerates all store projects", async () => {
    const assets = await rig.installed.projectWorkspace!.assets();
    // A's own scope holds the DECISION association plus the EXTERNAL_ASSET
    // association its own bridge committed; NEITHER entry is project-B's.
    expect(assets.length).toBe(2);
    expect(assets.every((association) => association.projectId === PROJECT_A)).toBe(true);
    expect(assets.map((association) => association.canonicalRef.id)).not.toContain(B_ASSET_ID);
    // The store still physically holds BOTH scopes; assets() does not mirror that.
    const store = new SqliteProjectAssetAssociationStore(rig.associationPath);
    try {
      const scopes = await store.projects();
      expect([...scopes].sort()).toEqual([PROJECT_A, PROJECT_B]);
      // Concatenating every scope would return more than assets() does.
      let all = 0;
      for (const scope of scopes) all += (await store.replay(scope)).length;
      expect(all).toBeGreaterThan(assets.length);
    } finally {
      store.close();
    }
    // Structural: the facade source no longer enumerates store scopes at all.
    const code = readFileSync(join(process.cwd(), "src/project_workspace/service.ts"), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    expect(code).not.toMatch(/\.projects\(\)/u);
  });

  it("AER-N02: journal() default = current project", async () => {
    const journal = await rig.installed.projectWorkspace!.journal();
    expect(journal.length).toBe(1);
    expect(journal.every((entry) => entry.entry.projectId === PROJECT_A)).toBe(true);
    expect(journal.map((entry) => entry.entry.entryId)).toContain(rig.aJournalEntryId);
    expect(journal.map((entry) => entry.entry.entryId)).not.toContain(rig.bJournalEntryId);
    assertNoB(journal, "workspace.journal()");
  });

  it("AER-N03: journal(foreign) fails closed, journal(current) is allowed", async () => {
    await expect(rig.installed.projectWorkspace!.journal(PROJECT_B)).rejects.toMatchObject({
      kind: "invalid_registration",
    });
    // API compatibility: naming the CURRENT project is still allowed.
    const current = await rig.installed.projectWorkspace!.journal(PROJECT_A);
    expect(current.map((entry) => entry.entry.entryId)).toContain(rig.aJournalEntryId);
    assertNoB(current, "workspace.journal(current)");
  });

  it("AER-N04: projectScopedAssets(foreign) fails closed, projectScopedAssets(current) is allowed", async () => {
    await expect(rig.installed.projectWorkspace!.projectScopedAssets(PROJECT_B)).rejects.toMatchObject({
      kind: "invalid_registration",
    });
    const current = await rig.installed.projectWorkspace!.projectScopedAssets(PROJECT_A);
    expect(current.every((association) => association.projectId === PROJECT_A)).toBe(true);
    assertNoB(current, "workspace.projectScopedAssets(current)");
  });

  it("AER-N09: a shared physical DB is NOT a shared semantic scope", async () => {
    // The raw files physically hold B…
    expect(rawCount(rig.journalPath, "SELECT COUNT(*) AS n FROM project_journal_events")).toBeGreaterThan(1);
    expect(rawDump(rig.journalPath, "SELECT scope_id FROM project_journal_events")).toContain(PROJECT_B);
    expect(rawDump(rig.associationPath, "SELECT scope_id FROM project_asset_association_events")).toContain(PROJECT_B);
    // …while every normal A-bound read reports only A.
    const view = await rig.installed.projectWorkspace!.view();
    assertNoB(view, "workspace.view()");
    assertNoB(await rig.installed.projectWorkspace!.assets(), "workspace.assets()");
    assertNoB(await rig.installed.projectWorkspace!.journal(), "workspace.journal()");
  });

  it("AER-N10: a direct store owner may still enumerate scopes (the deliberate asymmetry)", async () => {
    const associations = new SqliteProjectAssetAssociationStore(rig.associationPath);
    const journal = new SqliteProjectJournalStore(rig.journalPath);
    try {
      expect([...(await associations.projects())].sort()).toEqual([PROJECT_A, PROJECT_B]);
      expect([...(await journal.projects())].sort()).toEqual([PROJECT_A, PROJECT_B]);
      // The store can also replay B directly: store ownership is real (PSI-A09).
      const bAssets = await associations.replay(PROJECT_B);
      expect(JSON.stringify(bAssets)).toContain(B_ASSET_ID);
    } finally {
      associations.close();
      journal.close();
    }
  });

  it("AER-N11: the derived workspace view stays current-project scoped", async () => {
    const view = await rig.installed.projectWorkspace!.view();
    expect(view.projectId).toBe(PROJECT_A);
    expect(view.assets.associations.every((association) => association.projectId === PROJECT_A)).toBe(true);
    expect(view.project.goal).toBe("A");
    assertNoB(view, "workspace.view()");
  });
});

/* -------------------------------------------------------------------------- *
 * HTTP routes
 * -------------------------------------------------------------------------- */

describe("G10-AE-R HTTP scope isolation", () => {
  it("AER-N05: GET /api/project/assets exposes the current project only", async () => {
    const result = await http("GET", "/api/project/assets");
    expect(result.status).toBe(200);
    const body = result.body as readonly { readonly projectId: string }[];
    expect(body.every((association) => association.projectId === PROJECT_A)).toBe(true);
    assertNoB(result.body, "GET /api/project/assets");
  });

  it("AER-N06: GET /api/project/journal exposes the current project only", async () => {
    const result = await http("GET", "/api/project/journal");
    expect(result.status).toBe(200);
    const body = result.body as readonly { readonly entry: { readonly projectId: string } }[];
    expect(body.every((entry) => entry.entry.projectId === PROJECT_A)).toBe(true);
    assertNoB(result.body, "GET /api/project/journal");
  });

  it("AER-N07: a foreign projectId fails closed with a real error response", async () => {
    const result = await http("GET", "/api/project/journal", undefined, { projectId: PROJECT_B });
    expect(result.status).toBe(400);
    const error = (result.body as { readonly error?: { readonly status?: number; readonly detail?: string } }).error;
    expect(error?.status).toBe(400);
    expect(error?.detail ?? "").toContain(PROJECT_B);
    // Not a silent success and not a leaked payload.
    assertNoB(result.body, "GET /api/project/journal?projectId=project-B");
    // A foreign id never silently degrades to the current project either.
    expect(JSON.stringify(result.body)).not.toContain(A_TITLE);
  });

  it("AER-N15: management/history exposes no foreign workspace data", async () => {
    const history = await http("GET", "/api/project/history");
    expect(history.status).toBe(200);
    assertNoB(history.body, "GET /api/project/history");
    const workspace = await http("GET", "/api/project/workspace");
    expect(workspace.status).toBe(200);
    assertNoB(workspace.body, "GET /api/project/workspace");
    const management = rig.installed.application.projectManagement;
    if (management !== undefined) {
      assertNoB(await management.status(), "projectManagement.status()");
      assertNoB(await management.operatingHistory(), "projectManagement.operatingHistory()");
      const route = await http("GET", "/api/manage/status");
      expect(route.status).toBe(200);
      assertNoB(route.body, "GET /api/manage/status");
    }
  });

  it("AER-N16: the web payload cannot render foreign asset/journal data", async () => {
    // The Web client (web/src/api.ts) reads exactly these three payloads; the
    // served JSON — not the renderer — is what is asserted here.
    for (const pathname of ["/api/project/assets", "/api/project/journal", "/api/project/workspace"]) {
      const result = await http("GET", pathname);
      expect(result.status).toBe(200);
      assertNoB(result.body, `web payload ${pathname}`);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Agent tool surface
 * -------------------------------------------------------------------------- */

describe("G10-AE-R agent tool scope isolation", () => {
  it("AER-N08: palimpsest_project action=assets exposes the current project only", async () => {
    const definition = tool("palimpsest_project");
    const listed = await definition.execute({ action: "assets" }, {} as never);
    expect(Array.isArray(listed)).toBe(true);
    expect((listed as readonly { readonly projectId: string }[]).every((a) => a.projectId === PROJECT_A)).toBe(true);
    assertNoB(listed, "palimpsest_project action=assets");
    // No global-enumeration action was added.
    expect(toolActions("palimpsest_project")).toEqual(["overview", "assets", "open_loops", "history", "decision", "journal"]);
  });

  it("AER-N08b (gate review MINOR-2): a foreign projectId is REFUSED, never silently ignored", async () => {
    // The baseline read actions dropped a supplied `projectId` and answered with the
    // installed project's data, so a caller naming project-B could not tell the scope
    // had been ignored — spec §15's "hide the violation" shape. The tool now refuses.
    const definition = tool("palimpsest_project");
    for (const action of ["overview", "assets", "open_loops", "history"]) {
      await expect(
        definition.execute({ action, projectId: PROJECT_B }, {} as never),
        `palimpsest_project ${action}`,
      ).rejects.toThrow(/project-B/u);
    }
    // Naming the CURRENT project stays allowed — the guard is about scope, not syntax.
    const named = await definition.execute({ action: "assets", projectId: PROJECT_A }, {} as never);
    expect((named as readonly { readonly projectId: string }[]).every((a) => a.projectId === PROJECT_A)).toBe(true);
  });

  it("AER-N05b (gate review MINOR-2): the project read routes refuse a foreign projectId", async () => {
    // These routes are scoped to the installed project and declare no projectId; the
    // baseline answered 200 with A's payload while silently ignoring the parameter.
    for (const pathname of [
      "/api/project/workspace",
      "/api/project/assets",
      "/api/project/open_loops",
      "/api/project/history",
    ]) {
      const foreign = await http("GET", pathname, undefined, { projectId: PROJECT_B });
      expect(foreign.status, `${pathname} should refuse a foreign scope`).not.toBe(200);
      expect(JSON.stringify(foreign.body), `${pathname} did not name the refused scope`).toContain(PROJECT_B);
      assertNoB(foreign.body, `${pathname}?projectId=project-B`);
      // Naming the current project is still allowed (compatibility, spec §9).
      const own = await http("GET", pathname, undefined, { projectId: PROJECT_A });
      expect(own.status, `${pathname} with the current id`).toBe(200);
    }
  });

  it("AER-N18: no global workspace admin surface was added", async () => {
    // The workspace's own key set is unchanged (PW-A01 pins it too).
    expect(Object.keys(rig.installed.projectWorkspace!).sort()).toEqual([
      "appendDecision",
      "assets",
      "associateAsset",
      "history",
      "journal",
      "openLoops",
      "projectScopedAssets",
      "promoteOpportunity",
      "recordJournalEntry",
      "resolveJournalEntry",
      "view",
    ]);
    // The application surface's project members are exactly the two derived faces.
    const projectMembers = Object.keys(rig.installed.application).filter((key) => key.toLowerCase().includes("project"));
    expect(projectMembers.sort()).toEqual(["projectManagement", "projectWorkspace"]);
    // No tool anywhere exposes a global enumeration action.
    const forbidden = new Set(["all_projects", "global_assets", "workspace_scan"]);
    for (const definition of rig.installed.tools) {
      const actions = toolActions(definition.name) ?? [];
      for (const action of actions) expect(forbidden.has(action), `${definition.name}.${action}`).toBe(false);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * External Asset bridge regression (no G10-AE semantic change)
 * -------------------------------------------------------------------------- */

describe("G10-AE-R external asset bridge regression", () => {
  it("AER-N12: the external-asset view resolves only the installed project", async () => {
    const view = await rig.installed.projectWorkspace!.view();
    const references = view.external?.references ?? [];
    expect(references.length).toBe(1);
    expect(references.every((reference) => reference.assetId === A_EXT_ASSET_ID)).toBe(true);
    assertNoB(view, "workspace external view");
    const resolved = await rig.installed.externalAssets!.resolve(PROJECT_A);
    expect(resolved.external.every((reference) => reference.assetId === A_EXT_ASSET_ID)).toBe(true);
    assertNoB(resolved, "externalAssets.resolve(project-A)");
  });

  it("AER-N13b (gate review MINOR-1): the bridge's phase-1 receipt writers refuse a foreign scope", async () => {
    // The gate review DEMONSTRATED that `beginImport` had no basis fence: an
    // installation bound to project-A could append project-B's
    // `EXTERNAL_IMPORT_PREPARED` receipt to a shared bridge store. Inert for reads
    // (commitImport re-fences) but a real cross-scope WRITE on an unfenced writer, and
    // spec §11 requires the fences kept on reference/import/publication.
    const text = "external text for the phase-1 fence test";
    const contentDigest = createHash("sha256").update(text, "utf8").digest("hex");
    const externalRef = materializeExternalAssetStableRef({
      providerId: FIXTURE_PROVIDER_ID,
      assetId: "phase1-asset",
      contentDigest,
    });
    const candidate = materializeExternalAssetImportCandidate({
      projectId: PROJECT_B,
      externalRef,
      providerDefinitionDigest: rig.fixture.definition.digest,
      journalKind: "REFERENCE_NOTE",
      title: "phase-1 candidate for B",
      text,
      textDigest: contentDigest,
      createdAt: CLOCK,
    });
    const bridgeRowsBefore = rawCount(
      join(rig.dir, "bridge-a.sqlite"),
      "SELECT COUNT(*) AS n FROM external_asset_bridge",
    );
    await expect(rig.installed.externalAssets!.beginImport(candidate)).rejects.toMatchObject({
      kind: "unknown_project",
    });
    // ZERO receipts written for the foreign scope — the demonstrated write is gone.
    expect(
      rawCount(join(rig.dir, "bridge-a.sqlite"), "SELECT COUNT(*) AS n FROM external_asset_bridge"),
    ).toBe(bridgeRowsBefore);
    expect(
      rawDump(
        join(rig.dir, "bridge-a.sqlite"),
        "SELECT project_id FROM external_asset_bridge WHERE project_id = 'project-B'",
      ),
    ).toBe("[]");
  });

  it("AER-N12b (CLOSED IN AE-R): the bridge resolve refuses a project the deployment does not hold", async () => {
    // G10-AE-R §12/§22: this was the LAST foreign read in the stage. Before the fix
    // the plane's `resolve(projectId)` accepted any explicit id, so a shared store
    // let one installation resolve another scope's EXTERNAL_ASSET references — the
    // §22 partial condition "external bridge can resolve foreign associations"
    // verbatim (reproduced with a standalone probe against the pre-fix build).
    // `resolve` now requires a held project basis, the same fence
    // `preparePublication`/`approveAndPublish` already apply (the G10-AE gate
    // review's R-03).
    await expect(rig.installed.externalAssets!.resolve(PROJECT_B)).rejects.toMatchObject({
      kind: "unknown_project",
    });
    // The installed project still resolves — the fence is about AUTHORITY, not data.
    const own = await rig.installed.externalAssets!.resolve(PROJECT_A);
    expect(own.external.every((reference) => reference.assetId === A_EXT_ASSET_ID)).toBe(true);
    // The direct resolve is not reachable through HTTP at all (no such route).
    const routed = await handleApplicationRequest({
      application: rig.installed.application,
      method: "GET",
      pathname: "/api/external-assets/resolve",
      query: new URLSearchParams({ projectId: PROJECT_B }),
      body: undefined,
    });
    expect(routed).toBeUndefined();
    // The agent tool's action set exposes no resolve/enumeration verb.
    expect(toolActions("palimpsest_external_assets")).toEqual([
      "providers",
      "search",
      "inspect",
      "prepare_reference",
      "prepare_import",
      "prepare_publication",
    ]);
  });

  it("AER-N13: external import cannot write a foreign Journal", async () => {
    const before = rawCount(rig.journalPath, "SELECT COUNT(*) AS n FROM project_journal_events");
    const externalRef = materializeExternalAssetStableRef({
      providerId: FIXTURE_PROVIDER_ID,
      assetId: B_EXT_ASSET_ID,
      contentDigest: rig.bExternalDigest,
    });
    const result = await rig.installed.externalAssets!.prepareImport({
      projectId: PROJECT_B,
      externalRef,
      journalKind: "REFERENCE_NOTE",
      title: "smuggled",
    });
    expect(result.status).toBe("DENIED");
    if (result.status === "DENIED") expect(result.reason).toBe("unknown_project");
    expect(rawCount(rig.journalPath, "SELECT COUNT(*) AS n FROM project_journal_events")).toBe(before);
    await expect(
      rig.installed.projectWorkspace!.recordJournalEntry({
        projectId: PROJECT_B,
        kind: "IDEA",
        title: "smuggled",
        body: "x",
        provenance: "aer",
      }),
    ).rejects.toMatchObject({ kind: "invalid_registration" });
  });

  it("AER-N14: external publication cannot read a foreign Journal", async () => {
    await expect(
      rig.installed.externalAssets!.preparePublication({
        projectId: PROJECT_B,
        providerId: FIXTURE_PROVIDER_ID,
        targetAssetType: "Note",
        journalEntryId: rig.bJournalEntryId,
      }),
    ).rejects.toMatchObject({ kind: "unknown_project" });
  });
});

/* -------------------------------------------------------------------------- *
 * Boundary / cross-plane
 * -------------------------------------------------------------------------- */

describe("G10-AE-R boundary and cross-plane", () => {
  it("AER-N17 (NOT PROVEN HERE — carried as CF-AE-R-05): no federation path exists to drive", async () => {
    // HONEST, per the gate review: this rig composes NO federation surface, and the
    // review verified that `toolActions("palimpsest_federation")` is undefined as well.
    // Spec §16's AER-N17 property — "federation does not bypass workspace scope" — is
    // therefore NOT proven by this test, and PSI-A11 is likewise unproven. What the
    // test CAN assert truthfully is the negative that makes the property vacuous in
    // this rig: no federation surface is composed, so there is no bypass path to
    // attempt. Driving the real property needs the §132–§135 peer/messaging wiring,
    // which is carried as CF-AE-R-05 rather than faked with an unreachable branch.
    expect(rig.installed.application.federation).toBeUndefined();
    expect(toolActions("palimpsest_federation")).toBeUndefined();
    expect(
      Object.keys(rig.installed.application).filter((key) => key.toLowerCase().includes("federat")),
    ).toEqual([]);
  });

  it("AER-N19: no cross-project graph was added", async () => {
    const graph = rig.installed.controller.orchestrationGraph();
    const text = JSON.stringify(graph);
    expect(text).toContain(PROJECT_A);
    expect(text).not.toContain(PROJECT_B);
    // The derived view graph is the controller's own project graph.
    const view = await rig.installed.projectWorkspace!.view();
    expect(JSON.stringify(view)).not.toContain(PROJECT_B);
    // The service source declares no new store or cross-project table.
    const code = readFileSync(join(process.cwd(), "src/project_workspace/service.ts"), "utf-8");
    expect(code).not.toMatch(/CREATE TABLE/u);
  });

  it("AER-SMOKE (labelled cross-plane): the composed A install still answers truthfully", async () => {
    const surfaces = await http("GET", "/api/application/surfaces");
    expect(surfaces.status).toBe(200);
    const body = surfaces.body as Record<string, boolean>;
    expect(body["projectWorkspace"]).toBe(true);
    expect(body["projectManagement"]).toBe(true);
    expect(body["externalAssets"]).toBe(true);

    const providers = await http("GET", "/api/external-assets/providers");
    expect(providers.status).toBe(200);
    expect(JSON.stringify(providers.body)).toContain(FIXTURE_PROVIDER_ID);

    const workspace = await http("GET", "/api/project/workspace");
    expect(workspace.status).toBe(200);
    expect((workspace.body as { readonly projectId: string }).projectId).toBe(PROJECT_A);
  });
});
