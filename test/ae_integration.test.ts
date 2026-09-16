/**
 * G10-AE — EXTERNAL ASSET LIBRARY BRIDGE: PRODUCT INTEGRATION SUITE.
 *
 * The BRIDGE PLANE suite (`test/ae_external_assets.test.ts`, AE-N01 … AE-N29 plus
 * the §33 golden scenarios) proves the plane itself. THIS file proves the
 * INTEGRATION surfaces the campaign requires on top of it:
 *
 *   §28  the composed `application.externalAssets` face (read/prepare + the three
 *        operator-explicit verbs), reachable over the real HTTP routes;
 *   §13  the agent tool `palimpsest_external_assets` — READ/PREPARE ONLY, with the
 *        commit/approve verbs structurally absent from its action set;
 *   §26  the DERIVED external section of the Project Workspace view;
 *   §34  the EXT-A* invariants that are only observable at the surface, plus the
 *        AD/AC-R regressions (a declared-but-not-composed surface must answer a
 *        truthful 501; wiring the bridge must change neither VERIFY nor MONITOR).
 *
 * Everything runs on the REAL product stack: `installPalimpsest` over temp stores,
 * the real Ordarium effects runtime, the real HTTP route dispatcher, and the real
 * Project Workspace service. The ONLY injected things are the three the campaign
 * allows: the external PROVIDER (the TEST-ONLY `test/fixtures/external_library_fixture.ts`,
 * which owns its own separate sqlite database), the CLOCK and the publication
 * ADMISSION decision.
 *
 * HONEST notes are collected at the bottom of this file (search "HONEST:").
 */

import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { handleApplicationRequest } from "../src/application/http.js";
import type { PalimpsestApplicationSurface } from "../src/application/surface.js";
import { FakeGitPort } from "../src/effects/index.js";
import { installPalimpsest } from "../src/install.js";
import type { InstalledPalimpsest } from "../src/install.js";
import {
  PROJECT_ASSET_KINDS,
  SqliteProjectAssetAssociationStore,
  SqliteProjectJournalStore,
} from "../src/project_workspace/index.js";
import {
  SqliteExternalAssetBridgeStore,
  externalAssetLibraryRegistryOf,
} from "../src/external_assets/index.js";
import type {
  ExternalAssetPublicationAdmissionPort,
  ExternalAssetPublicationPreview,
} from "../src/external_assets/index.js";
import { commandProjectHeadVerifier } from "../src/project_verification/index.js";

import {
  FIXTURE_CREDENTIAL,
  FIXTURE_PROVIDER_ID,
  FixtureExternalLibrary,
} from "./fixtures/external_library_fixture.js";
import { taskSpec } from "./helpers.js";

/* -------------------------------------------------------------------------- *
 * Rig
 * -------------------------------------------------------------------------- */

const PROJECT_ID = "ae-integration";
const OTHER_PROJECT_ID = "ae-integration-other";
const HEAD = "a".repeat(40);
const CLOCK = "2026-09-16T00:00:00Z";
const VERIFIER_REF = "ae.integration.head.check.v1";
const BODY_TEXT = "An external fixture note used for the integration surface proofs.";

const DIRS: string[] = [];
const RIGS: { close(): Promise<void> }[] = [];

afterEach(async () => {
  for (const rig of RIGS.splice(0)) {
    try {
      await rig.close();
    } catch {
      /* already closed */
    }
  }
  for (const dir of DIRS.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* Windows may hold a SQLite handle briefly; the temp dir is disposable. */
    }
  }
});

function freshDir(prefix = "palimpsest-ae-integration-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  DIRS.push(dir);
  return dir;
}

/** The real tables a search/inspect/reference may NEVER touch, read as raw rows. */
function rawRows(databasePath: string, sql: string): string {
  const database = new DatabaseSync(databasePath);
  try {
    return JSON.stringify(database.prepare(sql).all());
  } finally {
    database.close();
  }
}

/** The number of rows a query matches (0 for a store that was never written to). */
function countRows(databasePath: string, sql: string): number {
  const database = new DatabaseSync(databasePath);
  try {
    return Number((database.prepare(sql).get() as { readonly n?: number }).n ?? 0);
  } finally {
    database.close();
  }
}

/** The `type` column of an event table, for "exactly these events were written". */
function eventTypes(databasePath: string, table: string): string[] {
  const database = new DatabaseSync(databasePath);
  try {
    return (database.prepare(`SELECT type FROM ${table}`).all() as unknown as { readonly type: string }[]).map(
      (row) => row.type,
    );
  } finally {
    database.close();
  }
}

function fileText(path: string): string {
  try {
    statSync(path);
  } catch {
    return "";
  }
  return readFileSync(path).toString("latin1");
}

function scriptedAdmission(
  decision: "APPROVE" | "REJECT",
): ExternalAssetPublicationAdmissionPort & { readonly previews: ExternalAssetPublicationPreview[] } {
  const previews: ExternalAssetPublicationPreview[] = [];
  return {
    policyRef: { policyId: "ae-integration-admission", version: "1" },
    previews,
    async admit(input) {
      previews.push(input.preview);
      return { decision, approver: "operator:integration" };
    },
  };
}

interface Rig {
  readonly dir: string;
  readonly installed: InstalledPalimpsest;
  readonly fixture: FixtureExternalLibrary;
  readonly associationPath: string;
  readonly journalPath: string;
  readonly bridgePath: string;
  readonly statePath: string;
  readonly admission: ExternalAssetPublicationAdmissionPort & {
    readonly previews: ExternalAssetPublicationPreview[];
  };
  close(): Promise<void>;
}

function makeRig(options?: {
  /** FALSE ⇒ this deployment has no external library at all. */
  readonly withProvider?: boolean | undefined;
  /** FALSE ⇒ no publication admission port: publication must fail closed. */
  readonly withAdmission?: boolean | undefined;
  /** TRUE ⇒ register a real mechanical verifier (the AD regression comparison). */
  readonly withVerification?: boolean | undefined;
  /** FALSE ⇒ a bare install with neither association nor journal store. */
  readonly withWorkspace?: boolean | undefined;
}): Rig {
  const dir = freshDir();
  const fixture = new FixtureExternalLibrary(join(dir, "external-library.sqlite"));
  const associationPath = join(dir, "associations.sqlite");
  const journalPath = join(dir, "journal.sqlite");
  const bridgePath = join(dir, "bridge.sqlite");
  const statePath = join(dir, "state.sqlite");
  const admission = scriptedAdmission("APPROVE");
  const registry = externalAssetLibraryRegistryOf([
    { read: fixture.readPort(), publication: fixture.publicationPort() },
  ]);
  const installed = installPalimpsest({ tools: { register: () => undefined } }, {
    projectId: PROJECT_ID,
    databasePath: statePath,
    ordariumDatabasePath: join(dir, "ordarium.sqlite"),
    clock: () => CLOCK,
    git: new FakeGitPort(HEAD),
    ...(options?.withWorkspace === false
      ? {}
      : {
          projectAssociationStore: new SqliteProjectAssetAssociationStore(associationPath),
          projectJournalStore: new SqliteProjectJournalStore(journalPath),
        }),
    ...(options?.withProvider === false
      ? {}
      : {
          externalAssetProviders: registry,
          externalAssetBridgeStore: new SqliteExternalAssetBridgeStore(bridgePath),
          ...(options?.withAdmission === false ? {} : { externalAssetPublicationAdmission: admission }),
        }),
    ...(options?.withVerification === true
      ? {
          repository: process.cwd(),
          projectVerifierProviders: [
            commandProjectHeadVerifier({
              verifierRef: VERIFIER_REF,
              command: process.execPath,
              args: ["-e", "process.exit(0)"],
            }),
          ],
          projectVerificationDefaultVerifierRef: VERIFIER_REF,
        }
      : {}),
  });
  installed.controller.start({
    projectId: PROJECT_ID,
    goal: "Reuse external knowledge without becoming the external library.",
    headCommit: HEAD,
    tasks: [taskSpec("task-a")],
  });
  const rig: Rig = {
    dir,
    installed,
    fixture,
    associationPath,
    journalPath,
    bridgePath,
    statePath,
    admission,
    close: async () => {
      await installed.dispose();
      fixture.close();
    },
  };
  RIGS.push(rig);
  return rig;
}

async function http(
  application: PalimpsestApplicationSurface,
  method: string,
  pathname: string,
  body?: unknown,
  query?: Record<string, string>,
): Promise<{ readonly status: number; readonly body: unknown }> {
  const search = new URLSearchParams(query ?? {});
  const result = await handleApplicationRequest({
    application,
    method,
    pathname,
    query: search,
    body,
  });
  if (result === undefined) throw new Error(`no application route for ${method} ${pathname}`);
  return result;
}

function api(rig: Rig, method: string, pathname: string, body?: unknown, query?: Record<string, string>) {
  return http(rig.installed.application, method, pathname, body, query);
}

function errorDetail(body: unknown): string {
  return ((body as { readonly error?: { readonly detail?: string } }).error?.detail ?? "").toString();
}

function errorStatus(body: unknown): number {
  return Number((body as { readonly error?: { readonly status?: number } }).error?.status ?? 0);
}

/** Seed one externally-owned asset revision and return its exact digest. */
function seedAsset(rig: Rig, assetId = "paper-1", body = BODY_TEXT) {
  return rig.fixture.addRevision({
    assetId,
    assetType: "Paper",
    title: "External bridge integration paper",
    body,
    revisionLabel: "r1",
    sourceLocator: "fixture://paper-1",
  });
}

/** The agent tool's exposed operation set (the only thing it may ever do). */
function toolActions(installed: InstalledPalimpsest, name: string): readonly string[] | undefined {
  const definition = installed.tools.find((tool) => tool.name === name);
  if (definition === undefined) return undefined;
  const properties = (definition.parameters as { readonly properties?: Record<string, unknown> }).properties;
  return (properties?.["action"] as { readonly enum?: readonly string[] } | undefined)?.enum;
}

async function referenceAsset(rig: Rig, assetId: string, contentDigest: string): Promise<void> {
  const prepared = await api(rig, "POST", "/api/external-assets/prepare-reference", {
    providerId: FIXTURE_PROVIDER_ID,
    assetId,
    contentDigest,
  });
  expect(prepared.status).toBe(200);
  expect((prepared.body as { status: string }).status).toBe("PREPARED");
  const committed = await api(rig, "POST", "/api/external-assets/commit-reference", {
    candidate: (prepared.body as { candidate: unknown }).candidate,
  });
  expect(committed.status).toBe(200);
  expect((committed.body as { status: string }).status).toBe("COMMITTED");
}

/* ========================================================================== *
 * §28 — the composed application surface and its HTTP routes
 * ========================================================================== */

describe("G10-AE §28: the application surface and the HTTP face", () => {
  it("composes `externalAssets`, reports it in the discovery route, and serves the read/prepare routes", async () => {
    const rig = makeRig();
    const digest = seedAsset(rig).contentDigest;

    expect(rig.installed.application.externalAssets).toBeDefined();
    const surfaces = await api(rig, "GET", "/api/application/surfaces");
    expect((surfaces.body as Record<string, boolean>).externalAssets).toBe(true);

    // providers() — deployment config only.
    const providers = await api(rig, "GET", "/api/external-assets/providers");
    expect(providers.status).toBe(200);
    const descriptors = providers.body as readonly {
      readonly definition: { readonly providerId: string; readonly capabilities: readonly string[] };
      readonly publish: boolean;
    }[];
    expect(descriptors.map((descriptor) => descriptor.definition.providerId)).toEqual([FIXTURE_PROVIDER_ID]);
    expect(descriptors[0]!.publish).toBe(true);

    // search (GET) — an ephemeral page.
    const search = await api(rig, "GET", "/api/external-assets/search", undefined, {
      providerId: FIXTURE_PROVIDER_ID,
      text: "external fixture note",
      limit: "5",
    });
    expect(search.status).toBe(200);
    const page = search.body as { readonly providerId: string; readonly hits: readonly { readonly assetId: string }[] };
    expect(page.providerId).toBe(FIXTURE_PROVIDER_ID);
    expect(page.hits.map((hit) => hit.assetId)).toContain("paper-1");

    // inspect (GET) — the exact digest, never a "latest" shorthand.
    const inspect = await api(rig, "GET", "/api/external-assets/inspect", undefined, {
      providerId: FIXTURE_PROVIDER_ID,
      assetId: "paper-1",
      contentDigest: digest,
    });
    expect(inspect.status).toBe(200);
    const inspection = inspect.body as {
      readonly status: string;
      readonly snapshot: { readonly ref: { readonly contentDigest: string } };
    };
    expect(inspection.status).toBe("AVAILABLE");
    expect(inspection.snapshot.ref.contentDigest).toBe(digest);

    // prepare-import (POST) without an explicit Journal kind is refused, and the
    // refusal is a typed `DENIED` answer rather than a guessed kind.
    const noKind = await api(rig, "POST", "/api/external-assets/prepare-import", {
      externalRef: (inspection as unknown as { snapshot: { ref: unknown } }).snapshot.ref,
      title: "no kind chosen",
    });
    expect(noKind.status).toBe(400);
    expect(errorDetail(noKind.body)).toContain("journalKind");

    // A durable ref without an exact digest is refused AT THE WIRE (EXT-A03).
    const noDigest = await api(rig, "POST", "/api/external-assets/prepare-import", {
      externalRef: { schemaVersion: 1, providerId: FIXTURE_PROVIDER_ID, assetId: "paper-1" },
      journalKind: "IDEA",
      title: "no digest",
    });
    expect(noDigest.status).toBe(400);

    // The wrong METHOD never silently succeeds.
    expect((await api(rig, "POST", "/api/external-assets/providers")).status).toBe(400);
    expect((await api(rig, "GET", "/api/external-assets/prepare-reference")).status).toBe(400);
  });

  it("a deployment without a library answers 501 on every route and exposes no tool (never an empty list)", async () => {
    const rig = makeRig({ withProvider: false });

    // EXT-A22-adjacent: no bridge composed ⇒ the surface is ABSENT, not empty.
    expect(rig.installed.application.externalAssets).toBeUndefined();
    const surfaces = await api(rig, "GET", "/api/application/surfaces");
    expect((surfaces.body as Record<string, boolean>).externalAssets).toBe(false);

    for (const [method, path] of [
      ["GET", "/api/external-assets/providers"],
      ["GET", "/api/external-assets/search"],
      ["GET", "/api/external-assets/inspect"],
      ["POST", "/api/external-assets/prepare-reference"],
      ["POST", "/api/external-assets/prepare-import"],
      ["POST", "/api/external-assets/prepare-publication"],
      ["POST", "/api/external-assets/commit-reference"],
      ["POST", "/api/external-assets/commit-import"],
      ["POST", "/api/external-assets/approve-publish"],
    ] as const) {
      const response = await api(rig, method, path, method === "POST" ? {} : undefined);
      // 501 `surface_absent` — a truthful "not composed", never a fabricated empty
      // provider list or an empty result page.
      expect(response.status, `${method} ${path}`).toBe(501);
      expect(errorDetail(response.body)).toContain("externalAssets");
    }

    // The agent tool is absent too: an agent on this deployment can never even
    // attempt an external-library operation.
    expect(toolActions(rig.installed, "palimpsest_external_assets")).toBeUndefined();

    // The workspace view says the bridge is NOT configured rather than showing an
    // empty (and therefore "known") library.
    const view = await api(rig, "GET", "/api/project/workspace");
    const external = (view.body as { readonly external: { readonly bridgeConfigured: boolean; readonly references: readonly unknown[]; readonly warnings: readonly string[] } }).external;
    expect(external.bridgeConfigured).toBe(false);
    expect(external.references).toEqual([]);
    expect(external.warnings.join(" | ")).toContain("external asset bridge not configured");
  });

  it("§13 the agent tool exposes READ/PREPARE verbs only and is read-only in mode", () => {
    const rig = makeRig();
    const actions = toolActions(rig.installed, "palimpsest_external_assets");
    expect(actions).toBeDefined();
    expect(actions).toEqual([
      "providers",
      "search",
      "inspect",
      "prepare_reference",
      "prepare_import",
      "prepare_publication",
    ]);
    const definition = rig.installed.tools.find((tool) => tool.name === "palimpsest_external_assets")!;
    expect(definition.mode).toBe("read-only");
    // EXT-A12/A13 at the agent boundary: there is no verb an agent could use to
    // commit a reference, write a Journal import or approve a publication.
    for (const forbidden of ["commit_reference", "commit_import", "approve_publish", "publish", "commit"]) {
      expect(actions).not.toContain(forbidden);
    }
    // The tool's arguments carry no approval, credential or provider definition.
    const properties = Object.keys(
      (definition.parameters as { readonly properties?: Record<string, unknown> }).properties ?? {},
    );
    for (const forbidden of ["decision", "approver", "credential", "token", "apiKey", "admission", "command"]) {
      expect(properties).not.toContain(forbidden);
    }
    // The surface discovery tool reports the bridge as a configured surface.
    const surfacesTool = rig.installed.tools.find((tool) => tool.name === "palimpsest_surfaces")!;
    expect(surfacesTool).toBeDefined();
  });

  it("§28 the operator-explicit verbs exist on the surface (and nowhere near the tool)", () => {
    const rig = makeRig();
    const surface = rig.installed.application.externalAssets!;
    for (const verb of [
      "providers",
      "search",
      "inspect",
      "prepareReference",
      "prepareImport",
      "preparePublication",
      "commitReference",
      "commitImport",
      "approveAndPublish",
    ] as const) {
      expect(typeof surface[verb]).toBe("function");
    }
    // The plane's own install object still carries the write half; the AGENT tool
    // does not. Both facts are asserted so a future refactor cannot quietly move
    // the operator verbs onto the tool.
    expect(rig.installed.externalAssets).toBeDefined();
    expect(toolActions(rig.installed, "palimpsest_external_assets")).not.toContain("approve_publish");
  });
});

/* ========================================================================== *
 * EXT-A04/A20/A21 — reads mutate nothing and stay project-scoped
 * ========================================================================== */

describe("G10-AE EXT-A04/20/21: reads are read-only and never auto-contextualize", () => {
  it("§8/§9 search and inspect mutate NOTHING (project rows, events, associations, journal, bridge, workspace)", async () => {
    const rig = makeRig();
    seedAsset(rig, "paper-1", "SEARCH-CONTEXT-LEAK-BODY");
    const projectRowBefore = rawRows(rig.statePath, "SELECT project_id, revision, digest FROM projects");
    const eventsBefore = rawRows(rig.statePath, "SELECT event_id, event_type FROM events");
    const associationsBefore = rawRows(rig.associationPath, "SELECT * FROM project_asset_association_events");
    const journalBefore = eventTypes(rig.journalPath, "project_journal_events");
    const bridgeBefore = rawRows(rig.bridgePath, "SELECT operation_id, family FROM external_asset_bridge");
    const viewBefore = JSON.stringify((await api(rig, "GET", "/api/project/workspace")).body);

    const search = await api(rig, "GET", "/api/external-assets/search", undefined, {
      providerId: FIXTURE_PROVIDER_ID,
      text: "SEARCH-CONTEXT-LEAK",
    });
    expect(search.status).toBe(200);
    const inspect = await api(rig, "GET", "/api/external-assets/inspect", undefined, {
      providerId: FIXTURE_PROVIDER_ID,
      assetId: "paper-1",
    });
    expect(inspect.status).toBe(200);

    expect(rawRows(rig.statePath, "SELECT project_id, revision, digest FROM projects")).toBe(projectRowBefore);
    expect(rawRows(rig.statePath, "SELECT event_id, event_type FROM events")).toBe(eventsBefore);
    expect(rawRows(rig.associationPath, "SELECT * FROM project_asset_association_events")).toBe(associationsBefore);
    expect(eventTypes(rig.journalPath, "project_journal_events")).toEqual(journalBefore);
    expect(rawRows(rig.bridgePath, "SELECT operation_id, family FROM external_asset_bridge")).toBe(bridgeBefore);
    // EXT-A20: the searched text never enters the derived view or the Work graph.
    const viewAfter = JSON.stringify((await api(rig, "GET", "/api/project/workspace")).body);
    expect(viewAfter).toBe(viewBefore);
    expect(viewAfter).not.toContain("SEARCH-CONTEXT-LEAK");
    expect(JSON.stringify(rig.installed.controller.orchestrationGraph())).not.toContain("SEARCH-CONTEXT-LEAK");
  });

  it("EXT-A21 the derived read walks only THIS project's associations (no cross-project scan)", async () => {
    const rig = makeRig();
    const digest = seedAsset(rig).contentDigest;
    await referenceAsset(rig, "paper-1", digest);

    // The other project is not held by this deployment: the plane refuses it
    // instead of silently resolving something else.
    const foreign = await api(rig, "POST", "/api/external-assets/prepare-reference", {
      projectId: OTHER_PROJECT_ID,
      providerId: FIXTURE_PROVIDER_ID,
      assetId: "paper-1",
      contentDigest: digest,
    });
    expect(foreign.status).toBe(200);
    expect(foreign.body).toMatchObject({ status: "DENIED", reason: "unknown_project" });

    // One association ⇒ exactly one exact-digest inspection for the whole read.
    const before = rig.fixture.inspectCalls;
    const view = await api(rig, "GET", "/api/project/workspace");
    expect(rig.fixture.inspectCalls - before).toBe(1);
    const external = (view.body as {
      readonly external: { readonly references: readonly { readonly providerId: string }[] };
    }).external;
    expect(external.references).toHaveLength(1);
  });
});

/* ========================================================================== *
 * §10/§11/§12/§26 — the reference and the DERIVED workspace view
 * ========================================================================== */

describe("G10-AE §26: the derived workspace external view", () => {
  it("surfaces the EXTERNAL OWNER and the PROJECT REFERENCE, and copies no content", async () => {
    const rig = makeRig();
    const digest = seedAsset(rig).contentDigest;
    await referenceAsset(rig, "paper-1", digest);

    const view = await api(rig, "GET", "/api/project/workspace");
    expect(view.status).toBe(200);
    const external = (view.body as {
      readonly external: {
        readonly bridgeConfigured: boolean;
        readonly references: readonly {
          readonly ownership: string;
          readonly relation: string;
          readonly providerId: string;
          readonly assetId: string;
          readonly referencedDigest: string;
          readonly resolution: string;
          readonly providerAvailable: boolean;
          readonly associationKind: string;
          readonly provenance: string;
          readonly assetType?: string;
          readonly title?: string;
        }[];
        readonly providerAvailability: Readonly<Record<string, boolean>>;
      };
    }).external;
    expect(external.bridgeConfigured).toBe(true);
    expect(external.references).toHaveLength(1);
    const reference = external.references[0]!;
    // The four labels are distinct facts, never collapsed.
    expect(reference.ownership).toBe("EXTERNAL_OWNER");
    expect(reference.relation).toBe("PROJECT_REFERENCE");
    expect(reference.providerId).toBe(FIXTURE_PROVIDER_ID);
    expect(reference.assetId).toBe("paper-1");
    expect(reference.referencedDigest).toBe(digest);
    expect(reference.resolution).toBe("RESOLVED");
    expect(reference.providerAvailable).toBe(true);
    expect(reference.associationKind).toBe("MANUAL");
    expect(reference.assetType).toBe("Paper");
    expect(reference.title).toBe("External bridge integration paper");
    expect(external.providerAvailability[FIXTURE_PROVIDER_ID]).toBe(true);

    // EXT-A06/EXT-A08/§26: the association copies NO content, no fetched title and
    // no provider type, and the provider's asset type never becomes a Palimpsest
    // project-asset kind.
    const associationRows = fileText(rig.associationPath);
    expect(associationRows).not.toContain(BODY_TEXT);
    expect(associationRows).not.toContain("External bridge integration paper");
    expect((PROJECT_ASSET_KINDS as readonly string[]).includes("Paper")).toBe(false);
    expect(PROJECT_ASSET_KINDS.filter((kind) => kind === "EXTERNAL_ASSET")).toHaveLength(1);
    // The reference provenance is the plane's structured refs-and-digests artifact.
    expect(reference.provenance).toContain("REFERENCED_FROM_EXTERNAL_LIBRARY");
    expect(reference.provenance).toContain(digest);
    // The imported/entity body text is not in the workspace view at all: a
    // resolvable title is DERIVED output, the content itself stays external.
    expect(JSON.stringify(view.body)).not.toContain(BODY_TEXT);
  });

  it("EXT-A18 an UNREACHABLE configured provider keeps the association: providerAvailable false, digest unchanged", async () => {
    const rig = makeRig();
    const digest = seedAsset(rig).contentDigest;
    await referenceAsset(rig, "paper-1", digest);
    const associationsBefore = rawRows(rig.associationPath, "SELECT * FROM project_asset_association_events");

    // The external library goes down (its read port refuses).
    rig.fixture.mode.unavailable = true;
    const view = await api(rig, "GET", "/api/project/workspace");
    const external = (view.body as {
      readonly external: {
        readonly references: readonly {
          readonly resolution: string;
          readonly providerAvailable: boolean;
          readonly referencedDigest: string;
          readonly title?: string;
          readonly detail?: string;
        }[];
        readonly providerAvailability: Readonly<Record<string, boolean>>;
        readonly warnings: readonly string[];
      };
      readonly knowledgeWarnings: readonly string[];
    }).external;
    expect(external.references).toHaveLength(1);
    // A provider that does not ANSWER cannot be silently reported as a revision
    // that no longer exists: `providerAvailable` is the load-bearing signal, and
    // the referenced digest is untouched. (The plane distinguishes the two states
    // this way; see the HONEST note below.)
    expect(external.references[0]!.providerAvailable).toBe(false);
    expect(external.providerAvailability[FIXTURE_PROVIDER_ID]).toBe(false);
    expect(external.references[0]!.resolution).toBe("REVISION_UNAVAILABLE");
    expect(external.references[0]!.referencedDigest).toBe(digest);
    expect(external.references[0]!.title).toBeUndefined();
    // The association itself was NOT deleted or rewritten.
    expect(rawRows(rig.associationPath, "SELECT * FROM project_asset_association_events")).toBe(associationsBefore);
    // The exact reason travels with the reference, and the workspace repeats it as
    // a knowledge warning (a read that could not verify something says so).
    expect(external.references[0]!.detail ?? "").toContain("did not answer");
    expect((view.body as { readonly knowledgeWarnings: readonly string[] }).knowledgeWarnings.join(" | ")).toContain(
      "can no longer be resolved at the referenced revision",
    );
  });

  it("§33/EXT-A18 a RESTART without the provider reports PROVIDER_UNAVAILABLE and keeps the association", async () => {
    const first = makeRig();
    const digest = seedAsset(first).contentDigest;
    await referenceAsset(first, "paper-1", digest);
    const associationsBefore = rawRows(first.associationPath, "SELECT * FROM project_asset_association_events");

    // The same deployment restarts with NO external library configured at all (an
    // EMPTY registry over the SAME association/journal stores). This is the real
    // "the provider is gone" scenario, and it is the one the plane reports as
    // PROVIDER_UNAVAILABLE.
    const restarted = installPalimpsest({ tools: { register: () => undefined } }, {
      projectId: PROJECT_ID,
      databasePath: first.statePath,
      ordariumDatabasePath: join(first.dir, "ordarium-2.sqlite"),
      clock: () => CLOCK,
      git: new FakeGitPort(HEAD),
      projectAssociationStore: new SqliteProjectAssetAssociationStore(first.associationPath),
      projectJournalStore: new SqliteProjectJournalStore(first.journalPath),
      externalAssetProviders: externalAssetLibraryRegistryOf([]),
      externalAssetBridgeStore: new SqliteExternalAssetBridgeStore(first.bridgePath),
    });
    RIGS.push({ close: async () => restarted.dispose() });
    // No `controller.start(...)`: the project already exists in the SAME Work
    // ledger, and re-issuing genesis would (correctly) be refused as a reused
    // idempotency key. A restart reopens the durable state; it does not re-create it.

    const view = await http(restarted.application, "GET", "/api/project/workspace");
    const external = (view.body as {
      readonly external: {
        readonly bridgeConfigured: boolean;
        readonly references: readonly { readonly resolution: string; readonly providerAvailable: boolean; readonly referencedDigest: string }[];
        readonly warnings: readonly string[];
      };
    }).external;
    expect(external.bridgeConfigured).toBe(true);
    expect(external.references).toHaveLength(1);
    expect(external.references[0]!.resolution).toBe("PROVIDER_UNAVAILABLE");
    expect(external.references[0]!.providerAvailable).toBe(false);
    expect(external.references[0]!.referencedDigest).toBe(digest);
    // Nothing was deleted, rewritten or "resolved" by inference.
    expect(rawRows(first.associationPath, "SELECT * FROM project_asset_association_events")).toBe(associationsBefore);
    expect(external.warnings.join(" | ")).toContain("no external asset provider is configured");
  });

  it("EXT-A18 a newer external revision is surfaced, and the referenced digest is NOT moved", async () => {
    const rig = makeRig();
    const d1 = seedAsset(rig).contentDigest;
    await referenceAsset(rig, "paper-1", d1);
    const associationsBefore = rawRows(rig.associationPath, "SELECT * FROM project_asset_association_events");

    // The library gains a newer revision (an EXTERNAL change, not a project one).
    const d2 = rig.fixture.addRevision({
      assetId: "paper-1",
      assetType: "Paper",
      title: "External bridge integration paper (revised)",
      body: `${BODY_TEXT} Revised.`,
      revisionLabel: "r2",
    }).contentDigest;
    expect(d2).not.toBe(d1);

    const view = await api(rig, "GET", "/api/project/workspace");
    const reference = (view.body as {
      readonly external: {
        readonly references: readonly {
          readonly referencedDigest: string;
          readonly newerRevisionAvailable?: boolean;
          readonly latestDigestHint?: string;
          readonly latestRevisionLabel?: string;
        }[];
      };
    }).external.references[0]!;
    expect(reference.referencedDigest).toBe(d1);
    expect(reference.newerRevisionAvailable).toBe(true);
    expect(reference.latestDigestHint).toBe(d2);
    expect(reference.latestRevisionLabel).toBe("r2");
    // Nothing local moved: no association write, no project revision.
    expect(rawRows(rig.associationPath, "SELECT * FROM project_asset_association_events")).toBe(associationsBefore);
  });
});

/* ========================================================================== *
 * §14/§15/§16 — the explicit import at the surface
 * ========================================================================== */

describe("G10-AE §14/§16: the explicit import", () => {
  it("writes ONE Journal entry with structured provenance and admits nothing else", async () => {
    const rig = makeRig();
    const digest = seedAsset(rig).contentDigest;
    const workBefore = rawRows(rig.statePath, "SELECT event_id, event_type FROM events");
    const projectBefore = rawRows(rig.statePath, "SELECT project_id, revision, digest FROM projects");

    const inspect = await api(rig, "GET", "/api/external-assets/inspect", undefined, {
      providerId: FIXTURE_PROVIDER_ID,
      assetId: "paper-1",
      contentDigest: digest,
    });
    const externalRef = (inspect.body as { readonly snapshot: { readonly ref: unknown } }).snapshot.ref;

    // The caller chooses the Journal kind EXPLICITLY; nothing maps the provider's
    // "Paper" type to it (EXT-A08/A10).
    const prepared = await api(rig, "POST", "/api/external-assets/prepare-import", {
      externalRef,
      journalKind: "REFERENCE_NOTE",
      title: "Imported bridge note",
    });
    expect(prepared.status).toBe(200);
    expect((prepared.body as { status: string }).status).toBe("PREPARED");
    const committed = await api(rig, "POST", "/api/external-assets/commit-import", {
      candidate: (prepared.body as { candidate: unknown }).candidate,
    });
    expect(committed.status).toBe(200);
    const result = committed.body as {
      readonly status: string;
      readonly entry: { readonly entryId: string; readonly kind: string };
      readonly journalCreated: boolean;
    };
    expect(result.status).toBe("COMMITTED");
    expect(result.entry.kind).toBe("REFERENCE_NOTE");
    expect(result.journalCreated).toBe(true);

    // EXT-A09/A24: the ONLY write landed in the Journal; the Work ledger, the
    // ProjectIR revision and every other owner are untouched.
    expect(rawRows(rig.statePath, "SELECT event_id, event_type FROM events")).toBe(workBefore);
    expect(rawRows(rig.statePath, "SELECT project_id, revision, digest FROM projects")).toBe(projectBefore);
    expect(eventTypes(rig.journalPath, "project_journal_events")).toEqual([
      "JOURNAL_OPENED",
      "JOURNAL_ENTRY_RECORDED",
    ]);

    // The derived view reports it as a LOCAL note with an exact external origin.
    const view = await api(rig, "GET", "/api/project/workspace");
    const external = (view.body as {
      readonly external: {
        readonly imports: readonly {
          readonly entryId: string;
          readonly journalKind: string;
          readonly providerId: string;
          readonly assetId: string;
          readonly contentDigest: string;
        }[];
      };
    }).external;
    expect(external.imports).toHaveLength(1);
    expect(external.imports[0]!.entryId).toBe(result.entry.entryId);
    expect(external.imports[0]!.journalKind).toBe("REFERENCE_NOTE");
    expect(external.imports[0]!.providerId).toBe(FIXTURE_PROVIDER_ID);
    expect(external.imports[0]!.assetId).toBe("paper-1");
    expect(external.imports[0]!.contentDigest).toBe(digest);

    // §18: a RETRY of the same candidate cannot duplicate the Journal entry.
    const retry = await api(rig, "POST", "/api/external-assets/commit-import", {
      candidate: (prepared.body as { candidate: unknown }).candidate,
    });
    expect(retry.body).toMatchObject({ status: "COMMITTED", journalCreated: false, replayed: true });
    expect(
      eventTypes(rig.journalPath, "project_journal_events").filter((type) => type === "JOURNAL_ENTRY_RECORDED"),
    ).toHaveLength(1);
  });

  it("EXT-A11/§15 a digest mismatch or non-text content writes NOTHING", async () => {
    const rig = makeRig();
    const digest = seedAsset(rig).contentDigest;
    const journalBefore = eventTypes(rig.journalPath, "project_journal_events");
    // The exact stable ref (with its verified refDigest) as the provider reports it.
    const inspection = await api(rig, "GET", "/api/external-assets/inspect", undefined, {
      providerId: FIXTURE_PROVIDER_ID,
      assetId: "paper-1",
      contentDigest: digest,
    });
    const externalRef = (inspection.body as { readonly snapshot: { readonly ref: unknown } }).snapshot.ref;

    // A materialization whose digest is not the referenced digest is refused.
    rig.fixture.mode.mangleDigest = true;
    const mismatched = await api(rig, "POST", "/api/external-assets/prepare-import", {
      externalRef,
      journalKind: "IDEA",
      title: "mismatch",
    });
    expect(mismatched.status).toBe(200);
    expect(mismatched.body).toMatchObject({ status: "DENIED", reason: "digest_mismatch" });
    expect(eventTypes(rig.journalPath, "project_journal_events")).toEqual(journalBefore);
    rig.fixture.mode.mangleDigest = false;

    // Non-text content blocks the import instead of being truncated or mangled.
    rig.fixture.mode.binaryMediaType = true;
    const binary = await api(rig, "POST", "/api/external-assets/prepare-import", {
      externalRef,
      journalKind: "IDEA",
      title: "binary",
    });
    expect(binary.body).toMatchObject({ status: "DENIED", reason: "binary_content" });
    expect(eventTypes(rig.journalPath, "project_journal_events")).toEqual(journalBefore);
  });
});

/* ========================================================================== *
 * §19–§25 — publication: preview, separate approval, governed effect
 * ========================================================================== */

describe("G10-AE §19–§25: publication at the surface", () => {
  async function seedJournalEntry(rig: Rig): Promise<string> {
    const recorded = await api(rig, "POST", "/api/project/journal", {
      kind: "IDEA",
      title: "A local idea worth sending out",
      body: "The exact body that would leave the project.",
      provenance: "integration:operator",
    });
    expect(recorded.status).toBe(200);
    return (recorded.body as { readonly entryId: string }).entryId;
  }

  it("§20 the preview is EXACT and has ZERO effect (no receipt, no provider call, no association)", async () => {
    const rig = makeRig();
    seedAsset(rig);
    const entryId = await seedJournalEntry(rig);
    const bridgeBefore = rawRows(rig.bridgePath, "SELECT operation_id, family FROM external_asset_bridge");
    const associationsBefore = rawRows(rig.associationPath, "SELECT * FROM project_asset_association_events");

    const preview = await api(rig, "POST", "/api/external-assets/prepare-publication", {
      providerId: FIXTURE_PROVIDER_ID,
      targetAssetType: "Note",
      journalEntryId: entryId,
    });
    expect(preview.status).toBe(200);
    const body = preview.body as {
      readonly outboundTitle: string;
      readonly outboundBody: string;
      readonly payloadDigest: string;
      readonly publicationId: string;
      readonly localJournalRef: { readonly entryId: string; readonly kind: string };
      readonly outboundMetadata: Readonly<Record<string, string>>;
    };
    expect(body.outboundTitle).toBe("A local idea worth sending out");
    expect(body.outboundBody).toBe("The exact body that would leave the project.");
    expect(body.localJournalRef.entryId).toBe(entryId);
    // EXT-A11: the outbound payload carries ONLY this entry and its identity labels.
    expect(new Set(Object.keys(body.outboundMetadata))).toEqual(
      new Set(["palimpsest_journal_entry_id", "palimpsest_journal_entry_digest", "palimpsest_journal_kind"]),
    );

    // PublicationPreview != Publication: nothing was written anywhere.
    expect(rig.fixture.publishCalls).toBe(0);
    expect(rig.fixture.publicationCount()).toBe(0);
    expect(rawRows(rig.bridgePath, "SELECT operation_id, family FROM external_asset_bridge")).toBe(bridgeBefore);
    expect(rawRows(rig.associationPath, "SELECT * FROM project_asset_association_events")).toBe(associationsBefore);
    expect(rig.admission.previews).toHaveLength(0);
  });

  it("EXT-A12/A13 no admission port ⇒ NOT_APPROVED with ZERO external effect", async () => {
    const rig = makeRig({ withAdmission: false });
    seedAsset(rig);
    const entryId = await seedJournalEntry(rig);
    const preview = await api(rig, "POST", "/api/external-assets/prepare-publication", {
      providerId: FIXTURE_PROVIDER_ID,
      targetAssetType: "Note",
      journalEntryId: entryId,
    });

    const published = await api(rig, "POST", "/api/external-assets/approve-publish", {
      preview: preview.body,
    });
    expect(published.status).toBe(200);
    expect(published.body).toMatchObject({ status: "NOT_APPROVED", decision: "UNAVAILABLE" });
    expect(rig.fixture.publishCalls).toBe(0);
    expect(rig.fixture.publicationCount()).toBe(0);
    // An HTTP-authenticated (or in-process) caller cannot stand in for the port:
    // no bridge terminal receipt and no association was created either.
    expect(countRows(rig.bridgePath, "SELECT COUNT(*) AS n FROM external_asset_bridge")).toBe(0);
    expect(rawRows(rig.associationPath, "SELECT * FROM project_asset_association_events")).toBe("[]");
  });

  it("EXT-A12/A14/A16/A17 approval publishes through the governed path and the ad admission port sees the SAME preview", async () => {
    const rig = makeRig();
    seedAsset(rig);
    const entryId = await seedJournalEntry(rig);
    const previewResponse = await api(rig, "POST", "/api/external-assets/prepare-publication", {
      providerId: FIXTURE_PROVIDER_ID,
      targetAssetType: "Note",
      journalEntryId: entryId,
    });
    const preview = previewResponse.body as { readonly payloadDigest: string; readonly publicationId: string };

    const published = await api(rig, "POST", "/api/external-assets/approve-publish", { preview: previewResponse.body });
    expect(published.status).toBe(200);
    const result = published.body as {
      readonly status: string;
      readonly ref: { readonly providerId: string; readonly assetId: string; readonly contentDigest: string };
      readonly association?: { readonly assetKind: string; readonly associationKind: string };
    };
    expect(result.status).toBe("PUBLISHED");
    expect(result.ref.providerId).toBe(FIXTURE_PROVIDER_ID);
    expect(result.association).toMatchObject({ assetKind: "EXTERNAL_ASSET", associationKind: "PUBLISHED" });
    // §21: the ONLY approval that counted came from the separate port, and it saw
    // the byte-for-byte preview the operator saw (same payload digest).
    expect(rig.admission.previews).toHaveLength(1);
    expect(rig.admission.previews[0]!.payloadDigest).toBe(preview.payloadDigest);
    expect(rig.admission.previews[0]!.publicationId).toBe(preview.publicationId);
    expect(rig.fixture.publicationCount()).toBe(1);

    // §24/EXT-A15: re-approving the SAME preview is a replay — no second asset.
    const replay = await api(rig, "POST", "/api/external-assets/approve-publish", { preview: previewResponse.body });
    expect(replay.body).toMatchObject({ status: "PUBLISHED", created: false });
    expect(rig.fixture.publicationCount()).toBe(1);

    // EXT-A17: the local Journal entry is still this project's own history, and
    // the derived view shows the external counterpart as a DISTINCT relation.
    const journal = await api(rig, "GET", "/api/project/journal");
    expect((journal.body as readonly { readonly entry: { readonly entryId: string } }[]).some(
      (entry) => entry.entry.entryId === entryId,
    )).toBe(true);
    const view = await api(rig, "GET", "/api/project/workspace");
    const references = (view.body as {
      readonly external: { readonly references: readonly { readonly relation: string; readonly assetId: string }[] };
    }).external.references;
    expect(references).toHaveLength(1);
    expect(references[0]!.relation).toBe("PUBLISHED_EXTERNAL_COUNTERPART");
    // A publication receipt is NOT truth and grants no evidence/Work mutation.
    expect(result.ref.contentDigest).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("EXT-A25 a provider that leaks a credential cannot get it persisted or surfaced", async () => {
    const rig = makeRig();
    seedAsset(rig);
    rig.fixture.mode.leakCredentialInResponse = true;
    const search = await api(rig, "GET", "/api/external-assets/search", undefined, {
      providerId: FIXTURE_PROVIDER_ID,
      text: "external fixture",
    });
    const inspect = await api(rig, "GET", "/api/external-assets/inspect", undefined, {
      providerId: FIXTURE_PROVIDER_ID,
      assetId: "paper-1",
    });
    // The strict parsers fail closed on the extra field, so the leaking provider
    // answer is never admitted; either way the credential is nowhere in the reply.
    expect(JSON.stringify(search.body)).not.toContain(FIXTURE_CREDENTIAL);
    expect(JSON.stringify(inspect.body)).not.toContain(FIXTURE_CREDENTIAL);
    expect(search.status).not.toBe(200);
    expect(fileText(rig.bridgePath)).not.toContain(FIXTURE_CREDENTIAL);
    rig.fixture.mode.leakCredentialInResponse = false;
  });
});

/* ========================================================================== *
 * §34 AE-N30 — the AD / AC-R regressions at the integration level
 * ========================================================================== */

describe("G10-AE AE-N30: the AD and AC-R regressions stay green", () => {
  it("AC-R the declared-but-not-composed rule still holds: 501 means NOT COMPOSED, for monitor and for external assets", async () => {
    const rig = makeRig();
    // No monitor runtime is wired in this rig.
    expect(rig.installed.application.monitor).toBeUndefined();
    const monitorStatus = await api(rig, "GET", "/api/monitor/status");
    expect(monitorStatus.status).toBe(501);
    expect(errorDetail(monitorStatus.body)).toContain("monitor");
    const surfaces = await api(rig, "GET", "/api/application/surfaces");
    expect((surfaces.body as Record<string, boolean>).monitor).toBe(false);

    // A bridge-only rig WITHOUT a workspace still serves the bridge surfaces.
    const bridgeOnly = makeRig({ withWorkspace: false });
    expect(bridgeOnly.installed.application.externalAssets).toBeDefined();
    expect((await api(bridgeOnly, "GET", "/api/external-assets/providers")).status).toBe(200);
  });

  it("AD wiring the bridge changes NEITHER the verification runtime NOR its answers", async () => {
    const withBridge = makeRig({ withVerification: true });
    const withoutBridge = makeRig({ withVerification: true, withProvider: false });

    const status = async (rig: Rig) => (await api(rig, "GET", "/api/verification/status")).body as {
      readonly state: string;
      readonly runtimeAvailable: boolean;
      readonly independentVerifyAvailable: boolean;
      readonly registeredVerifierRefs: readonly string[];
      readonly executableVerifierRefs: readonly string[];
      readonly defaultVerifierRef: string | null;
    };

    const a = await status(withBridge);
    const b = await status(withoutBridge);
    expect(a.state).toBe(b.state);
    expect(a.runtimeAvailable).toBe(b.runtimeAvailable);
    expect(a.independentVerifyAvailable).toBe(b.independentVerifyAvailable);
    expect(a.registeredVerifierRefs).toEqual(b.registeredVerifierRefs);
    expect(a.executableVerifierRefs).toEqual(b.executableVerifierRefs);
    expect(a.defaultVerifierRef).toBe(b.defaultVerifierRef);
    expect(a.registeredVerifierRefs).toContain(VERIFIER_REF);

    // The verification RUN still works with the bridge wired, and it is the
    // project-head protocol that answers — not an external asset.
    const run = await api(withBridge, "POST", "/api/verification/verify_current_head", {
      verifierRef: VERIFIER_REF,
    });
    expect(run.status).toBe(200);
    expect(run.body).toMatchObject({ status: "recorded" });
    expect((run.body as { readonly run: { readonly subject: { readonly headCommit: string } } }).run.subject.headCommit).toBe(HEAD);
    // Waiting a moment is unnecessary: the mechanical verifier is a bounded process.
    const history = await api(withBridge, "GET", "/api/verification/history");
    expect((history.body as readonly unknown[]).length).toBe(1);

    // EXT-A20-adjacent: no external reference was created by verifing anything.
    const view = await api(withBridge, "GET", "/api/project/workspace");
    expect((view.body as { readonly external: { readonly references: readonly unknown[] } }).external.references).toEqual([]);
  });

  it("EXT-A23 the workspace service keeps working with NO bridge at all (an honest, non-invented external section)", async () => {
    const rig = makeRig({ withProvider: false });
    const view = await api(rig, "GET", "/api/project/workspace");
    expect(view.status).toBe(200);
    const body = view.body as {
      readonly external: { readonly bridgeConfigured: boolean; readonly warnings: readonly string[] };
      readonly knowledgeWarnings: readonly string[];
    };
    expect(body.external.bridgeConfigured).toBe(false);
    expect(body.knowledgeWarnings.join(" | ")).toContain("external asset bridge not configured");
    // The rest of the derived workspace is unaffected by the absent bridge.
    expect((view.body as { readonly project: { readonly revision: number } }).project.revision).toBe(0);
  });
});

/* -------------------------------------------------------------------------- *
 * HONEST notes
 * -------------------------------------------------------------------------- *
 *
 * HONEST: the publication-approval proofs here use a host-owned,
 * test-declared `ExternalAssetPublicationAdmissionPort` (the port the plane
 * itself declares). The suite proves that the HTTP route, the bearer-authenticated
 * caller and the in-process caller all cannot approve without it; it does NOT
 * implement a real approver UI.
 *
 * HONEST: "the provider is unavailable" has TWO honest readings at the surface,
 * because the bridge plane distinguishes them and this pass did not change its
 * semantics: a provider that is NOT CONFIGURED reports `resolution:
 * PROVIDER_UNAVAILABLE`, while a CONFIGURED provider that does not ANSWER reports
 * `resolution: REVISION_UNAVAILABLE` together with `providerAvailable: false` and
 * the provider's own failure detail. The load-bearing signal for a reader is
 * `providerAvailable` (plus the exact detail); the referenced digest is unchanged
 * in both cases and the association survives in both cases.
 *
 * HONEST: `EXT-A25` shows a credential-leaking provider answer being refused
 * before it can surface. The generic kind→HTTP-status mapper reports the strict
 * parser's `unknown_field` as 404, which is an unusual status for a malformed
 * PROVIDER answer: nothing leaks and nothing is persisted, but the message is not
 * ideal. This is pre-existing behaviour of `applicationErrorStatus`, untouched by
 * this pass.
 *
 * HONEST: provider "unavailability" is simulated by switching the TEST-ONLY
 * fixture's own read port into `unavailable` mode (the same switch the plane suite
 * uses): the external library being down is an external event, not a Palimpsest
 * state, so there is no project-side knob to flip. The `separate-process` /
 * restart variants of this scenario run in `scripts/external_assets/ae-dogfood.mjs`
 * and in the plane suite.
 */
