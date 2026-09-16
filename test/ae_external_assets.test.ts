/**
 * G10-AE — External Asset Library Bridge & Explicit Project Reuse: the
 * adversarial suite (AE-N01 … AE-N29) plus the §33 golden end-to-end scenarios,
 * reachable at the BRIDGE PLANE level.
 *
 * Everything here runs on the REAL product stack:
 *   - real `SqliteProjectAssetAssociationStore` / `SqliteProjectJournalStore` /
 *     `SqliteExternalAssetBridgeStore` on temp files;
 *   - the real `makeExternalAssetBridgeService` plane;
 *   - the real Ordarium effects runtime + ledger (on a temp file) for the
 *     governed `palimpsest.external_asset.publish` action;
 *   - the real `installPalimpsest` wiring for the install-level proofs.
 *
 * The ONLY injected things are the three the campaign allows: the external
 * PROVIDER (the TEST-ONLY `test/fixtures/external_library_fixture.ts`, which owns
 * its own separate sqlite database), the CLOCK, and the publication ADMISSION
 * decision.
 *
 * HONEST notes are collected at the bottom of this file (search "HONEST:").
 */

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { FakeGitPort, createPalimpsestEffects } from "../src/effects/index.js";
import type { PalimpsestEffectsRuntime } from "../src/effects/index.js";
import { installPalimpsest } from "../src/install.js";
import type { InstalledPalimpsest } from "../src/install.js";
import { SqliteManagementPreferenceStore } from "../src/project_management/index.js";
import {
  PROJECT_ASSET_KINDS,
  SqliteProjectAssetAssociationStore,
  SqliteProjectJournalStore,
  materializeProjectAssetAssociation,
  materializeProjectJournalEntry,
  parseProjectAssetAssociation,
  projectJournalView,
} from "../src/project_workspace/index.js";
import type { ProjectJournalEntry } from "../src/project_workspace/index.js";
import {
  EXTERNAL_ASSET_PUBLISH_ACTION_NAME,
  EXTERNAL_ASSET_PUBLISH_INPUT_FIELDS,
  SqliteExternalAssetBridgeStore,
  defineExternalAssetEffects,
  emptyExternalAssetLibraryRegistry,
  externalAssetImportOperationIdOf,
  externalAssetImportProvenanceOf,
  externalAssetLibraryRegistryOf,
  externalAssetOutboundPayloadDigestOf,
  externalAssetOutboundPayloadOf,
  externalAssetPublishEffectInputOf,
  externalAssetStableRefKey,
  makeExternalAssetBridgeService,
  materializeExternalAssetImportCandidate,
  materializeExternalAssetStableRef,
  parseExternalAssetPublicationPreview,
  parseExternalAssetPublicationReconciliation,
  rejectAllExternalAssetPublicationAdmission,
  resolveExternalAssetView,
  sqliteExternalAssetAssociationPort,
  sqliteExternalAssetJournalPort,
} from "../src/external_assets/index.js";
import type {
  ExternalAssetBridgeService,
  ExternalAssetImportCandidate,
  ExternalAssetProjectBasis,
  ExternalAssetPublicationAdmissionPort,
  ExternalAssetPublicationPreview,
  ExternalAssetPublishInvoker,
} from "../src/external_assets/index.js";

import {
  FIXTURE_CREDENTIAL,
  FIXTURE_PROVIDER_ID,
  FixtureExternalLibrary,
} from "./fixtures/external_library_fixture.js";
import { taskSpec } from "./helpers.js";

/* -------------------------------------------------------------------------- *
 * Rig
 * -------------------------------------------------------------------------- */

const PROJECT_ID = "ae-bridge";
const HEAD = "a".repeat(40);
const DEFAULT_TEXT = "An external fixture note about palimpsest bridge semantics.";
const OTHER_TEXT = "A DIFFERENT fixture note that must never leak into a preview.";

const DIRS: string[] = [];
const CLOSERS: (() => void | Promise<void>)[] = [];

afterEach(async () => {
  for (const close of CLOSERS.splice(0)) {
    try {
      await close();
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

function freshDir(prefix = "palimpsest-ae-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  DIRS.push(dir);
  return dir;
}

function rawRows(databasePath: string, sql: string): string {
  const database = new DatabaseSync(databasePath);
  try {
    return JSON.stringify(database.prepare(sql).all());
  } finally {
    database.close();
  }
}

/** The source-level firewall checks look at CODE, not prose. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^[ \t]*\/\/.*$/gmu, "");
}

interface PlaneRig {
  readonly dir: string;
  readonly projectId: string;
  readonly fixture: FixtureExternalLibrary;
  readonly effects: PalimpsestEffectsRuntime;
  readonly bridge: SqliteExternalAssetBridgeStore;
  readonly associations: SqliteProjectAssetAssociationStore;
  readonly journal: SqliteProjectJournalStore;
  readonly service: ExternalAssetBridgeService;
  readonly invokeEffect: ExternalAssetPublishInvoker;
  readonly journalPort: ReturnType<typeof sqliteExternalAssetJournalPort>;
  basis(): ExternalAssetProjectBasis;
  setBasis(next: ExternalAssetProjectBasis | undefined): void;
  clock(): string;
  setClock(next: string): void;
  /** A registry WITHOUT the fixture provider (a later restart of the deployment). */
  restarted(options?: {
    readonly withProvider?: boolean;
    readonly admission?: ExternalAssetPublicationAdmissionPort | undefined;
    readonly maxImportedTextBytes?: number | undefined;
  }): PlaneRig;
}

function makePlaneRig(options?: {
  readonly projectId?: string;
  readonly admission?: ExternalAssetPublicationAdmissionPort | undefined;
  readonly maxImportedTextBytes?: number | undefined;
  readonly providerId?: string | undefined;
}): PlaneRig {
  const dir = freshDir();
  const projectId = options?.projectId ?? PROJECT_ID;
  const fixture = new FixtureExternalLibrary(join(dir, "external-library.sqlite"), {
    ...(options?.providerId === undefined ? {} : { providerId: options.providerId }),
  });
  const registry = externalAssetLibraryRegistryOf([
    { read: fixture.readPort(), publication: fixture.publicationPort() },
  ]);
  const bridge = new SqliteExternalAssetBridgeStore(join(dir, "bridge.sqlite"));
  const associations = new SqliteProjectAssetAssociationStore(join(dir, "associations.sqlite"));
  const journal = new SqliteProjectJournalStore(join(dir, "journal.sqlite"));
  const effects = createPalimpsestEffects({
    databasePath: join(dir, "ordarium.sqlite"),
    git: new FakeGitPort(HEAD),
  });
  let at = "2026-09-16T00:00:00Z";
  let basisValue: ExternalAssetProjectBasis | undefined = {
    projectId,
    revision: 3,
    digest: "d".repeat(64),
  };
  const journalPort = sqliteExternalAssetJournalPort(journal);
  const publicationEffects = defineExternalAssetEffects({
    publicationPort: (providerId) => registry.get(providerId)?.publication,
    journal: journalPort,
  });
  const invokeEffect: ExternalAssetPublishInvoker = {
    invoke: (input) =>
      effects.invoke(publicationEffects.publishExternalAsset, input, {
        scope: projectId,
        callId: `external-asset-publish:${input.publicationId}`,
        revision: basisValue?.revision ?? 0,
      }),
  };
  const service = makeExternalAssetBridgeService({
    registry,
    bridge,
    projectScope: { basis: async (id) => (id === projectId ? basisValue : undefined) },
    associations: sqliteExternalAssetAssociationPort(associations, () => at),
    journal: journalPort,
    ...(options?.admission === undefined ? {} : { publicationAdmission: options.admission }),
    ...(options?.maxImportedTextBytes === undefined
      ? {}
      : { maxImportedTextBytes: options.maxImportedTextBytes }),
    clock: () => at,
    invokeEffect,
  });
  const closeAll = (): void => {
    fixture.close();
    bridge.close();
    associations.close();
    journal.close();
  };
  const rig: PlaneRig = {
    dir,
    projectId,
    fixture,
    effects,
    bridge,
    associations,
    journal,
    service,
    invokeEffect,
    journalPort,
    basis: () => basisValue!,
    setBasis: (next) => {
      basisValue = next;
    },
    clock: () => at,
    setClock: (next) => {
      at = next;
    },
    restarted: (restartOptions) =>
      makeRestartedRig(dir, {
        ...restartOptions,
        ...(restartOptions?.withProvider === false ? {} : { withProvider: true }),
      }),
  };
  CLOSERS.push(async () => {
    closeAll();
    await effects.close();
  });
  return rig;
}

/** Reopen the SAME association/journal/bridge files after a "restart". */
function makeRestartedRig(
  dir: string,
  options?: {
    readonly withProvider?: boolean | undefined;
    readonly admission?: ExternalAssetPublicationAdmissionPort | undefined;
    readonly maxImportedTextBytes?: number | undefined;
  },
): PlaneRig {
  const projectId = PROJECT_ID;
  const fixture = new FixtureExternalLibrary(join(dir, "external-library.sqlite"));
  const registry =
    options?.withProvider === false
      ? emptyExternalAssetLibraryRegistry()
      : externalAssetLibraryRegistryOf([
          { read: fixture.readPort(), publication: fixture.publicationPort() },
        ]);
  const bridge = new SqliteExternalAssetBridgeStore(join(dir, "bridge.sqlite"));
  const associations = new SqliteProjectAssetAssociationStore(join(dir, "associations.sqlite"));
  const journal = new SqliteProjectJournalStore(join(dir, "journal.sqlite"));
  const effects = createPalimpsestEffects({
    databasePath: join(dir, "ordarium.sqlite"),
    git: new FakeGitPort(HEAD),
  });
  let at = "2026-09-16T02:00:00Z";
  let basisValue: ExternalAssetProjectBasis | undefined = {
    projectId,
    revision: 3,
    digest: "d".repeat(64),
  };
  const journalPort = sqliteExternalAssetJournalPort(journal);
  const publicationEffects = defineExternalAssetEffects({
    publicationPort: (providerId) => registry.get(providerId)?.publication,
    journal: journalPort,
  });
  const invokeEffect: ExternalAssetPublishInvoker = {
    invoke: (input) =>
      effects.invoke(publicationEffects.publishExternalAsset, input, {
        scope: projectId,
        callId: `external-asset-publish:${input.publicationId}`,
        revision: basisValue?.revision ?? 0,
      }),
  };
  const service = makeExternalAssetBridgeService({
    registry,
    bridge,
    projectScope: { basis: async (id) => (id === projectId ? basisValue : undefined) },
    associations: sqliteExternalAssetAssociationPort(associations, () => at),
    journal: journalPort,
    ...(options?.admission === undefined ? {} : { publicationAdmission: options.admission }),
    ...(options?.maxImportedTextBytes === undefined
      ? {}
      : { maxImportedTextBytes: options.maxImportedTextBytes }),
    clock: () => at,
    invokeEffect,
  });
  CLOSERS.push(async () => {
    fixture.close();
    bridge.close();
    associations.close();
    journal.close();
    await effects.close();
  });
  return {
    dir,
    projectId,
    fixture,
    effects,
    bridge,
    associations,
    journal,
    service,
    invokeEffect,
    journalPort,
    basis: () => basisValue!,
    setBasis: (next) => {
      basisValue = next;
    },
    clock: () => at,
    setClock: (next) => {
      at = next;
    },
    restarted: () => makeRestartedRig(dir, {}),
  };
}

/** An admission port whose decision the test controls. */
function scriptedAdmission(
  decision: "APPROVE" | "REJECT",
  approver = "operator:test",
): ExternalAssetPublicationAdmissionPort & { readonly previews: ExternalAssetPublicationPreview[] } {
  const previews: ExternalAssetPublicationPreview[] = [];
  return {
    policyRef: { policyId: "test-admission", version: "1" },
    previews,
    async admit(input) {
      previews.push(input.preview);
      return { decision, approver };
    },
  };
}

interface InstallRig {
  readonly dir: string;
  readonly installed: InstalledPalimpsest;
  readonly fixture: FixtureExternalLibrary;
  readonly bridgePath: string;
  readonly associationPath: string;
  readonly journalPath: string;
  readonly statePath: string;
  readonly admission: ExternalAssetPublicationAdmissionPort & {
    readonly previews: ExternalAssetPublicationPreview[];
  };
}

function makeInstallRig(options?: {
  readonly withExternal?: boolean | undefined;
  readonly admissionDecision?: "APPROVE" | "REJECT" | "NONE" | undefined;
  readonly externalBridgeStore?: SqliteExternalAssetBridgeStore | undefined;
  readonly maxImportedTextBytes?: number | undefined;
  readonly bare?: boolean | undefined;
  readonly management?: boolean | undefined;
  readonly campaignScope?: boolean | undefined;
}): InstallRig {
  const dir = freshDir("palimpsest-ae-install-");
  const fixture = new FixtureExternalLibrary(join(dir, "external-library.sqlite"));
  const registry = externalAssetLibraryRegistryOf([
    { read: fixture.readPort(), publication: fixture.publicationPort() },
  ]);
  const admission = scriptedAdmission(options?.admissionDecision === "REJECT" ? "REJECT" : "APPROVE");
  const associationPath = join(dir, "associations.sqlite");
  const journalPath = join(dir, "journal.sqlite");
  const bridgePath = join(dir, "bridge.sqlite");
  const statePath = join(dir, "state.sqlite");
  const management =
    options?.management === true ? new SqliteManagementPreferenceStore(join(dir, "management.sqlite")) : undefined;
  const installed = installPalimpsest({ tools: { register: () => undefined } }, {
    projectId: PROJECT_ID,
    databasePath: statePath,
    ordariumDatabasePath: join(dir, "ordarium.sqlite"),
    clock: () => "2026-09-16T00:00:00Z",
    git: new FakeGitPort(HEAD),
    ...(options?.bare === true
      ? {}
      : {
          projectAssociationStore: new SqliteProjectAssetAssociationStore(associationPath),
          projectJournalStore: new SqliteProjectJournalStore(journalPath),
        }),
    ...(management === undefined ? {} : { managementPreferenceStore: management }),
    ...(options?.withExternal === false
      ? {}
      : {
          externalAssetProviders: registry,
          externalAssetBridgeStore:
            options?.externalBridgeStore ?? new SqliteExternalAssetBridgeStore(bridgePath),
          ...(options?.maxImportedTextBytes === undefined
            ? {}
            : { maxImportedTextBytes: options.maxImportedTextBytes }),
          ...(options?.admissionDecision === "NONE"
            ? {}
            : { externalAssetPublicationAdmission: admission }),
        }),
  });
  installed.controller.start({
    projectId: PROJECT_ID,
    goal: "Bridge one project to an external library without becoming it.",
    headCommit: HEAD,
    tasks: [taskSpec("task-a")],
  });
  CLOSERS.push(async () => {
    await installed.dispose();
    fixture.close();
  });
  return {
    dir,
    installed,
    fixture,
    bridgePath,
    associationPath,
    journalPath,
    statePath,
    admission,
  };
}

function journalEntries(store: SqliteProjectJournalStore, projectId = PROJECT_ID) {
  return store.replay(projectId).then((events) => projectJournalView(events));
}

async function prepareReferenceOk(rig: PlaneRig, assetId: string, contentDigest?: string) {
  const prepared = await rig.service.prepareReference({
    projectId: rig.projectId,
    providerId: FIXTURE_PROVIDER_ID,
    assetId,
    ...(contentDigest === undefined ? {} : { contentDigest }),
  });
  if (prepared.status !== "PREPARED") {
    throw new Error(`expected a prepared reference candidate, got ${prepared.status}: ${prepared.reason}`);
  }
  return prepared.candidate;
}

async function prepareImportOk(
  rig: PlaneRig,
  assetId: string,
  contentDigest: string,
  journalKind: "IDEA" | "OPEN_QUESTION" | "NEGATIVE_RESULT" | "OPPORTUNITY" | "REFERENCE_NOTE" = "REFERENCE_NOTE",
  title = "Imported external note",
): Promise<ExternalAssetImportCandidate> {
  const prepared = await rig.service.prepareImport({
    projectId: rig.projectId,
    externalRef: materializeExternalAssetStableRef({
      providerId: FIXTURE_PROVIDER_ID,
      assetId,
      contentDigest,
    }),
    journalKind,
    title,
  });
  if (prepared.status !== "PREPARED") {
    throw new Error(`expected a prepared import candidate, got ${prepared.status}: ${prepared.reason}`);
  }
  return prepared.candidate;
}

/* -------------------------------------------------------------------------- *
 * §34 AE-N01 … AE-N10
 * -------------------------------------------------------------------------- */

describe("G10-AE §3 firewalls are STRUCTURAL, not comments", () => {
  const moduleNames = [
    "index",
    "refs",
    "provider",
    "registry",
    "service",
    "resolver",
    "import",
    "publication",
    "bridge_store",
    "effects",
  ] as const;
  const sources = new Map<string, string>(
    moduleNames.map((name) => [
      name,
      readFileSync(fileURLToPath(new URL(`../src/external_assets/${name}.ts`, import.meta.url)), "utf8"),
    ]),
  );
  // The plane's own header comments deliberately NAME the firewalls they enforce,
  // so the CODE checks below run on comment-stripped sources.
  const code = new Map<string, string>(
    [...sources].map(([name, source]) => [name, stripComments(source)]),
  );

  it("no module of the plane imports the Work, Proof or Reasoning owners", () => {
    const forbidden = [
      "proof_asset",
      "reasoning_cell",
      "tools/controller",
      "tools/tools",
      "tools/graph",
      "tools/application_tools",
      "project_verification",
      "monitor",
      "campaign",
      "domain/policy",
      "scheduler",
      "evidence",
      "federation",
      "project_management",
      "project_operating",
    ];
    for (const [name, source] of sources) {
      const importSpecifiers = [...source.matchAll(/from\s+"([^"]+)"/gu)].map((match) => match[1]!);
      for (const specifier of importSpecifiers) {
        for (const banned of forbidden) {
          expect(
            specifier.includes(banned),
            `${name}.ts imports "${specifier}" (forbidden owner: ${banned})`,
          ).toBe(false);
        }
      }
    }
  });

  it("no module of the plane is a watcher, an auto-retriever or a context injector", () => {
    for (const [name, source] of code) {
      for (const banned of ["setInterval", "watchFile", "fs.watch", "chokidar"]) {
        expect(source.includes(banned), `${name}.ts contains "${banned}"`).toBe(false);
      }
      for (const banned of ["personal_asset_store", "global_memory", "knowledge_graph", "external_truth_store"]) {
        expect(source.includes(banned), `${name}.ts contains "${banned}"`).toBe(false);
      }
    }
  });

  it("AE-N17: the bridge service takes no management mode, autonomy profile or credential", () => {
    const serviceSource = sources.get("service")!;
    const depsInterface = serviceSource.slice(
      serviceSource.indexOf("export interface ExternalAssetBridgeServiceDeps"),
      serviceSource.indexOf("export interface ExternalAssetSearchInput"),
    );
    expect(depsInterface.length).toBeGreaterThan(200);
    for (const banned of [
      "ManagementMode",
      "ManagementInvolvement",
      "managementProfile",
      "autonomy",
      "credential",
      "apiKey",
      "bearer",
    ]) {
      expect(
        stripComments(depsInterface).includes(banned),
        `ExternalAssetBridgeServiceDeps exposes "${banned}"`,
      ).toBe(false);
    }
  });

  it("AE-N10 (structural): the import path never even sees a provider asset type", () => {
    expect(code.get("import")!.includes("assetType")).toBe(false);
    const serviceSource = sources.get("service")!;
    const importRegion = serviceSource.slice(
      serviceSource.indexOf("async function prepareImport"),
      serviceSource.indexOf("async function beginImport"),
    );
    expect(importRegion.length).toBeGreaterThan(100);
    expect(stripComments(importRegion).includes("assetType")).toBe(false);
  });

  it("AE-N07: EXTERNAL_ASSET is the ONLY kind added to ProjectAssetKind", () => {
    expect([...PROJECT_ASSET_KINDS]).toEqual([
      "DECISION",
      "PRODUCED_ARTIFACT",
      "PROOF_CLAIM",
      "EXPERIMENT",
      "JOURNAL_ENTRY",
      "CAMPAIGN",
      "REASONING_CELL",
      "EXTERNAL_ASSET",
    ]);
    for (const providerType of ["Paper", "Idea", "Method", "Dataset", "Example", "Zotero", "Note"]) {
      expect((PROJECT_ASSET_KINDS as readonly string[]).includes(providerType)).toBe(false);
    }
  });
});

describe("G10-AE §8/§33 search and inspect are read-only", () => {
  it("AE-N02: search returns ephemeral hits and mutates NOTHING", async () => {
    const rig = makePlaneRig();
    rig.fixture.addRevision({
      assetId: "paper-1",
      assetType: "Paper",
      title: "Bridge paper",
      body: DEFAULT_TEXT,
      summary: "a summary",
      searchScore: 0.9,
    });

    const page = await rig.service.search({ providerId: FIXTURE_PROVIDER_ID, text: "bridge" });
    expect(page.hits).toHaveLength(1);
    const hit = page.hits[0]!;
    expect(hit.assetId).toBe("paper-1");
    expect(hit.searchScore).toBe(0.9);
    // The hit is a HINT, not a durable reference: no digest was persisted anywhere.
    expect(hit.latestDigestHint).toMatch(/^[0-9a-f]{64}$/u);

    expect(rig.fixture.searchCalls).toBe(1);
    expect(await rig.associations.replay(PROJECT_ID)).toEqual([]);
    expect(await journalEntries(rig.journal)).toEqual([]);
    expect(rig.bridge.list(PROJECT_ID)).toEqual([]);
    expect(rig.bridge.verifyChain(PROJECT_ID)).toEqual({ ok: true });
  });

  it("AE-N01: a search result is NOT a project reference", async () => {
    const rig = makePlaneRig();
    rig.fixture.addRevision({ assetId: "paper-1", assetType: "Paper", title: "T", body: DEFAULT_TEXT });
    const page = await rig.service.search({ providerId: FIXTURE_PROVIDER_ID, text: "fixture" });
    expect(page.hits).toHaveLength(1);

    // Nothing in the project references it: the association history is empty, and
    // there is no "commit" verb on the read surface that a search could trigger.
    expect(await rig.associations.replay(PROJECT_ID)).toEqual([]);
    const key = externalAssetStableRefKey(
      materializeExternalAssetStableRef({
        providerId: FIXTURE_PROVIDER_ID,
        assetId: "paper-1",
        contentDigest: "a".repeat(64),
      }),
    );
    expect(key.startsWith(`${FIXTURE_PROVIDER_ID}/paper-1@`)).toBe(true);
  });

  it("AE-N03: inspect resolves an exact digest and mutates NOTHING", async () => {
    const rig = makePlaneRig();
    const revision = rig.fixture.addRevision({
      assetId: "paper-1",
      assetType: "Paper",
      title: "T",
      body: DEFAULT_TEXT,
      tags: ["bridge"],
      metadata: { venue: "fixture" },
    });

    const inspection = await rig.service.inspect({
      providerId: FIXTURE_PROVIDER_ID,
      assetId: "paper-1",
      contentDigest: revision.contentDigest,
    });
    expect(inspection.status).toBe("AVAILABLE");
    if (inspection.status !== "AVAILABLE") throw new Error("unreachable");
    expect(inspection.snapshot.ref.contentDigest).toBe(revision.contentDigest);
    expect(inspection.snapshot.tags).toEqual(["bridge"]);
    expect(inspection.snapshot.metadata).toEqual({ venue: "fixture" });

    expect(await rig.associations.replay(PROJECT_ID)).toEqual([]);
    expect(await journalEntries(rig.journal)).toEqual([]);
    expect(rig.bridge.list(PROJECT_ID)).toEqual([]);
  });

  it("AE-N05: the latest revision never silently replaces the requested digest", async () => {
    const rig = makePlaneRig();
    const d1 = rig.fixture.addRevision({ assetId: "paper-1", assetType: "Paper", title: "V1", body: DEFAULT_TEXT });
    const d2 = rig.fixture.addRevision({ assetId: "paper-1", assetType: "Paper", title: "V2", body: OTHER_TEXT });
    expect(d2.contentDigest).not.toBe(d1.contentDigest);

    const inspection = await rig.service.inspect({
      providerId: FIXTURE_PROVIDER_ID,
      assetId: "paper-1",
      contentDigest: d1.contentDigest,
    });
    expect(inspection.status).toBe("AVAILABLE");
    if (inspection.status !== "AVAILABLE") throw new Error("unreachable");
    expect(inspection.snapshot.ref.contentDigest).toBe(d1.contentDigest);
    expect(inspection.snapshot.title).toBe("V1");
  });

  it("AE-N05 (hostile provider): a provider answering the latest revision is refused", async () => {
    const rig = makePlaneRig();
    const d1 = rig.fixture.addRevision({ assetId: "paper-1", assetType: "Paper", title: "V1", body: DEFAULT_TEXT });
    rig.fixture.addRevision({ assetId: "paper-1", assetType: "Paper", title: "V2", body: OTHER_TEXT });
    rig.fixture.mode.mangleDigest = true;

    const inspection = await rig.service.inspect({
      providerId: FIXTURE_PROVIDER_ID,
      assetId: "paper-1",
      contentDigest: d1.contentDigest,
    });
    expect(inspection.status).toBe("UNAVAILABLE");
    if (inspection.status !== "UNAVAILABLE") throw new Error("unreachable");
    expect(inspection.reason).toBe("requested_digest_mismatch");
  });

  it("AE-N04: a durable reference requires a digest; an unstable provider is DENIED", async () => {
    const rig = makePlaneRig();
    rig.fixture.addRevision({ assetId: "paper-1", assetType: "Paper", title: "T", body: DEFAULT_TEXT });
    rig.fixture.mode.omitStableDigest = true;

    const prepared = await rig.service.prepareReference({
      projectId: rig.projectId,
      providerId: FIXTURE_PROVIDER_ID,
      assetId: "paper-1",
    });
    expect(prepared.status).toBe("DENIED");
    if (prepared.status !== "DENIED") throw new Error("unreachable");
    expect(prepared.reason).toBe("stable_revision_unavailable");
    // A denied preparation writes nothing at all.
    expect(rig.bridge.list(PROJECT_ID)).toEqual([]);
    expect(await rig.associations.replay(PROJECT_ID)).toEqual([]);
  });

  it("AE-N04 (artifact): an EXTERNAL_ASSET association can never be digest-less", () => {
    // §6/EXT-A03 hold on the bridge port; this pins them on the SHARED artifact,
    // so the generic workspace writer cannot create a durable external reference
    // that names no exact revision (`ExternalLatest != ReferencedRevision`, §12).
    const base = {
      projectId: PROJECT_ID,
      associationKind: "MANUAL" as const,
      provenance: "external reference",
      recordedAt: "2026-01-01T00:00:00.000Z",
    };
    const digest = "a".repeat(64);
    expect(() =>
      materializeProjectAssetAssociation({
        ...base,
        assetKind: "EXTERNAL_ASSET",
        canonicalRef: { kind: FIXTURE_PROVIDER_ID, id: "paper-1" },
      }),
    ).toThrow(/EXTERNAL_ASSET reference must carry the exact external contentDigest/u);
    // Every OTHER kind keeps its optional-digest semantics, unchanged.
    expect(
      materializeProjectAssetAssociation({
        ...base,
        assetKind: "REASONING_CELL",
        canonicalRef: { kind: "reasoning_cell", id: "rc-1" },
      }).canonicalRef.digest,
    ).toBeUndefined();
    // The read path enforces the same rule, so a hand-written row cannot smuggle
    // a digest-less external reference back in either.
    const valid = materializeProjectAssetAssociation({
      ...base,
      assetKind: "EXTERNAL_ASSET",
      canonicalRef: { kind: FIXTURE_PROVIDER_ID, id: "paper-1", digest },
    });
    expect(valid.canonicalRef.digest).toBe(digest);
    expect(() =>
      parseProjectAssetAssociation({
        ...valid,
        canonicalRef: { kind: FIXTURE_PROVIDER_ID, id: "paper-1" },
      }),
    ).toThrow(/EXTERNAL_ASSET reference must carry the exact external contentDigest/u);
  });

  it("AE-N16 (plane): search and inspect never enter project context or state", async () => {
    const rig = makePlaneRig();
    rig.fixture.addRevision({ assetId: "paper-1", assetType: "Paper", title: "T", body: DEFAULT_TEXT });
    const before = rawRows(join(rig.dir, "associations.sqlite"), "SELECT * FROM project_asset_association_events");
    await rig.service.search({ providerId: FIXTURE_PROVIDER_ID, text: "fixture" });
    await rig.service.inspect({ providerId: FIXTURE_PROVIDER_ID, assetId: "paper-1" });
    const after = rawRows(join(rig.dir, "associations.sqlite"), "SELECT * FROM project_asset_association_events");
    expect(after).toBe(before);
    // No digest of any hit was persisted, and the plane exposes no context hook.
    expect(JSON.stringify(rig.bridge.list(PROJECT_ID))).not.toContain("paper-1");
  });

  it("AE-N26: a provider that leaks its credential into a reply is refused", async () => {
    const rig = makePlaneRig();
    rig.fixture.addRevision({ assetId: "paper-1", assetType: "Paper", title: "T", body: DEFAULT_TEXT });
    rig.fixture.mode.leakCredentialInResponse = true;

    await expect(rig.service.search({ providerId: FIXTURE_PROVIDER_ID, text: "fixture" })).rejects.toThrow(
      /unknown field "apiToken"/u,
    );
    await expect(
      rig.service.inspect({ providerId: FIXTURE_PROVIDER_ID, assetId: "paper-1" }),
    ).rejects.toThrow(/unknown field "apiToken"/u);
    expect(rawRows(join(rig.dir, "bridge.sqlite"), "SELECT * FROM external_asset_bridge")).not.toContain(
      FIXTURE_CREDENTIAL,
    );
  });

  it("AE-N26: the fixture's credential never reaches a persisted artifact", async () => {
    const rig = makePlaneRig();
    const revision = rig.fixture.addRevision({
      assetId: "paper-1",
      assetType: "Paper",
      title: "T",
      body: DEFAULT_TEXT,
    });
    const candidate = await prepareReferenceOk(rig, "paper-1", revision.contentDigest);
    await rig.service.commitReference(candidate);

    const dump = [
      rawRows(join(rig.dir, "bridge.sqlite"), "SELECT * FROM external_asset_bridge"),
      rawRows(join(rig.dir, "associations.sqlite"), "SELECT * FROM project_asset_association_events"),
      rawRows(join(rig.dir, "journal.sqlite"), "SELECT * FROM project_journal_events"),
    ].join("\n");
    expect(dump).not.toContain(FIXTURE_CREDENTIAL);
    expect(dump).not.toContain("apiToken");
  });
});

/* -------------------------------------------------------------------------- *
 * §33 golden: reference / provider unavailable / newer revision
 * -------------------------------------------------------------------------- */

describe("G10-AE §10/§11/§12 explicit reference", () => {
  it("§33 reference: prepare + explicit commit → ONE EXTERNAL_ASSET association", async () => {
    const rig = makePlaneRig();
    const revision = rig.fixture.addRevision({
      assetId: "paper-1",
      assetType: "Paper",
      title: "Bridge paper",
      body: DEFAULT_TEXT,
      summary: "SENSITIVE-SUMMARY",
      tags: ["BRIDGE-TAG"],
      metadata: { venue: "META-VENUE" },
      revisionLabel: "v1",
    });
    const candidate = await prepareReferenceOk(rig, "paper-1", revision.contentDigest);
    expect(candidate.externalRef.contentDigest).toBe(revision.contentDigest);
    expect(candidate.projectBasis.revision).toBe(3);

    const committed = await rig.service.commitReference(candidate);
    expect(committed.status).toBe("COMMITTED");
    if (committed.status !== "COMMITTED") throw new Error("unreachable");
    expect(committed.created).toBe(true);
    expect(committed.association.assetKind).toBe("EXTERNAL_ASSET");
    expect(committed.association.associationKind).toBe("MANUAL");
    expect(committed.association.canonicalRef).toEqual({
      kind: FIXTURE_PROVIDER_ID,
      id: "paper-1",
      digest: revision.contentDigest,
    });

    const recorded = await rig.associations.replay(PROJECT_ID);
    expect(recorded).toHaveLength(2); // PROJECT_WORKSPACE_OPENED + ASSET_ASSOCIATED
    expect(await journalEntries(rig.journal)).toEqual([]);
    // Reference-only durability is NOT duplicated into the bridge receipts.
    expect(rig.bridge.list(PROJECT_ID)).toEqual([]);

    // AE-N08: the association copies NO external content.
    const serialized = JSON.stringify(recorded);
    for (const content of ["SENSITIVE-SUMMARY", "BRIDGE-TAG", "META-VENUE", "Bridge paper"]) {
      expect(serialized).not.toContain(content);
    }
  });

  it("AE-N08: the association copies no content, only an opaque ref + structured provenance", async () => {
    const rig = makePlaneRig();
    const revision = rig.fixture.addRevision({
      assetId: "paper-2",
      assetType: "Paper",
      title: "TITLE-ONLY-EXTERNAL",
      body: "BODY-ONLY-EXTERNAL",
    });
    const candidate = await prepareReferenceOk(rig, "paper-2", revision.contentDigest);
    const committed = await rig.service.commitReference(candidate);
    if (committed.status !== "COMMITTED") throw new Error("unreachable");
    const provenance = JSON.parse(committed.association.provenance) as Record<string, unknown>;
    expect(provenance.relation).toBe("REFERENCED_FROM_EXTERNAL_LIBRARY");
    expect(provenance.contentDigest).toBe(revision.contentDigest);
    expect(provenance.providerId).toBe(FIXTURE_PROVIDER_ID);
    expect(Object.keys(provenance)).not.toContain("title");
    expect(Object.keys(provenance)).not.toContain("body");
    expect(Object.keys(provenance)).not.toContain("summary");
    expect(committed.association.provenance).not.toContain("TITLE-ONLY-EXTERNAL");
    expect(committed.association.provenance).not.toContain("BODY-ONLY-EXTERNAL");
  });

  it("§33 reference is idempotent: a second commit creates no second association", async () => {
    const rig = makePlaneRig();
    const revision = rig.fixture.addRevision({ assetId: "paper-1", assetType: "Paper", title: "T", body: DEFAULT_TEXT });
    const candidate = await prepareReferenceOk(rig, "paper-1", revision.contentDigest);
    const first = await rig.service.commitReference(candidate);
    const second = await rig.service.commitReference(candidate);
    expect(first.status).toBe("COMMITTED");
    expect(second.status).toBe("COMMITTED");
    if (second.status !== "COMMITTED") throw new Error("unreachable");
    expect(second.created).toBe(false);
    expect(second.association.associationId).toBe(first.status === "COMMITTED" ? first.association.associationId : "");
  });

  it("§11 commit re-checks: a stale project scope fails with stale_reference_candidate and ZERO writes", async () => {
    const rig = makePlaneRig();
    const revision = rig.fixture.addRevision({ assetId: "paper-1", assetType: "Paper", title: "T", body: DEFAULT_TEXT });
    const candidate = await prepareReferenceOk(rig, "paper-1", revision.contentDigest);
    rig.setBasis({ projectId: rig.projectId, revision: 4, digest: "e".repeat(64) });

    const committed = await rig.service.commitReference(candidate);
    expect(committed).toMatchObject({
      status: "STALE_REFERENCE_CANDIDATE",
      reason: "stale_reference_candidate",
    });
    expect(await rig.associations.replay(PROJECT_ID)).toEqual([]);
  });

  it("§11 commit re-checks: the exact digest no longer resolves → ZERO writes", async () => {
    const rig = makePlaneRig();
    const d1 = rig.fixture.addRevision({ assetId: "paper-1", assetType: "Paper", title: "V1", body: DEFAULT_TEXT });
    const candidate = await prepareReferenceOk(rig, "paper-1", d1.contentDigest);
    // The library gains a newer revision and starts answering with it.
    rig.fixture.addRevision({ assetId: "paper-1", assetType: "Paper", title: "V2", body: OTHER_TEXT });
    rig.fixture.mode.mangleDigest = true;

    const committed = await rig.service.commitReference(candidate);
    expect(committed.status).toBe("STALE_REFERENCE_CANDIDATE");
    if (committed.status !== "STALE_REFERENCE_CANDIDATE") throw new Error("unreachable");
    expect(committed.reason).toBe("stale_reference_candidate");
    expect(await rig.associations.replay(PROJECT_ID)).toEqual([]);
  });

  it("§11 commit re-checks: a provider that vanished entirely → ZERO writes", async () => {
    const rig = makePlaneRig();
    const revision = rig.fixture.addRevision({ assetId: "paper-1", assetType: "Paper", title: "T", body: DEFAULT_TEXT });
    const candidate = await prepareReferenceOk(rig, "paper-1", revision.contentDigest);
    // A service whose registry no longer holds the provider.
    const restartedService = makeExternalAssetBridgeService({
      registry: emptyExternalAssetLibraryRegistry(),
      bridge: rig.bridge,
      projectScope: { basis: async () => rig.basis() },
      associations: sqliteExternalAssetAssociationPort(rig.associations, () => rig.clock()),
      clock: () => rig.clock(),
    });
    const committed = await restartedService.commitReference(candidate);
    expect(committed.status).toBe("STALE_REFERENCE_CANDIDATE");
    expect(await rig.associations.replay(PROJECT_ID)).toEqual([]);
  });

  it("AE-N06/§33: a missing provider leaves the association and reports PROVIDER_UNAVAILABLE", async () => {
    const rig = makePlaneRig();
    const revision = rig.fixture.addRevision({ assetId: "paper-1", assetType: "Paper", title: "T", body: DEFAULT_TEXT });
    const candidate = await prepareReferenceOk(rig, "paper-1", revision.contentDigest);
    await rig.service.commitReference(candidate);
    const before = await rig.associations.replay(PROJECT_ID);

    // A deployment restart WITHOUT the provider configured.
    const restarted = rig.restarted({ withProvider: false });
    const view = await restarted.service.resolve(PROJECT_ID);
    expect(view.external).toHaveLength(1);
    expect(view.external[0]!.resolution).toBe("PROVIDER_UNAVAILABLE");
    expect(view.external[0]!.providerAvailable).toBe(false);
    expect(view.external[0]!.referencedDigest).toBe(revision.contentDigest);
    // §12: the association was never deleted or rewritten.
    expect(await restarted.associations.replay(PROJECT_ID)).toEqual(before);
    expect(view.providerAvailability[FIXTURE_PROVIDER_ID]).toBe(false);
  });

  it("§33 newer revision: D1 stays referenced while D2 is merely SURFACED", async () => {
    const rig = makePlaneRig();
    const d1 = rig.fixture.addRevision({ assetId: "paper-1", assetType: "Paper", title: "V1", body: DEFAULT_TEXT });
    const candidate = await prepareReferenceOk(rig, "paper-1", d1.contentDigest);
    await rig.service.commitReference(candidate);
    const d2 = rig.fixture.addRevision({
      assetId: "paper-1",
      assetType: "Paper",
      title: "V2",
      body: OTHER_TEXT,
      revisionLabel: "v2",
    });

    const view = await rig.service.resolve(PROJECT_ID);
    expect(view.external).toHaveLength(1);
    expect(view.external[0]!.referencedDigest).toBe(d1.contentDigest);
    expect(view.external[0]!.newerRevisionAvailable).toBe(true);
    expect(view.external[0]!.latestDigestHint).toBe(d2.contentDigest);
    expect(view.external[0]!.latestRevisionLabel).toBe("v2");

    // The association still names D1, unchanged.
    const recorded = await rig.associations.replay(PROJECT_ID);
    expect(JSON.stringify(recorded)).toContain(d1.contentDigest);
    expect(JSON.stringify(recorded)).not.toContain(d2.contentDigest);

    // A provider that no longer resolves D1 reports REVISION_UNAVAILABLE rather
    // than silently answering with D2.
    const hostile = makePlaneRig();
    void hostile;
    rig.fixture.mode.mangleDigest = true;
    const afterMangle = await rig.service.resolve(PROJECT_ID);
    expect(afterMangle.external[0]!.resolution).toBe("REVISION_UNAVAILABLE");
    expect(afterMangle.external[0]!.referencedDigest).toBe(d1.contentDigest);
  });

  it("§26 the derived view never invents a title when the revision is unavailable", async () => {
    const rig = makePlaneRig();
    const revision = rig.fixture.addRevision({
      assetId: "paper-1",
      assetType: "Paper",
      title: "EXTERNAL-TITLE",
      body: DEFAULT_TEXT,
    });
    const candidate = await prepareReferenceOk(rig, "paper-1", revision.contentDigest);
    await rig.service.commitReference(candidate);
    rig.fixture.mode.unavailable = true;

    const view = await rig.service.resolve(PROJECT_ID);
    expect(view.external[0]!.resolution).toBe("REVISION_UNAVAILABLE");
    expect(view.external[0]!.title).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain("EXTERNAL-TITLE");
  });
});

/* -------------------------------------------------------------------------- *
 * §14/§15/§16 explicit import
 * -------------------------------------------------------------------------- */

describe("G10-AE §14/§15/§16 explicit import into the ProjectJournal", () => {
  it("§33 import: one Journal entry + stable provenance + a committed bridge receipt", async () => {
    const rig = makePlaneRig();
    const revision = rig.fixture.addRevision({
      assetId: "paper-1",
      assetType: "Paper",
      title: "Bridge paper",
      body: DEFAULT_TEXT,
    });
    const candidate = await prepareImportOk(rig, "paper-1", revision.contentDigest, "IDEA", "Imported idea");
    const result = await rig.service.commitImport(candidate);
    expect(result.status).toBe("COMMITTED");
    if (result.status !== "COMMITTED") throw new Error("unreachable");
    expect(result.journalCreated).toBe(true);
    expect(result.replayed).toBe(false);
    expect(result.receipt.family).toBe("EXTERNAL_IMPORT_COMMITTED");

    const entries = await journalEntries(rig.journal);
    expect(entries).toHaveLength(1);
    const entry: ProjectJournalEntry = entries[0]!.entry;
    expect(entry.kind).toBe("IDEA");
    expect(entry.title).toBe("Imported idea");
    expect(entry.body).toBe(DEFAULT_TEXT);

    // §16: STRUCTURED provenance back to the EXACT stable external ref.
    const provenance = externalAssetImportProvenanceOf(entry);
    expect(provenance).toBeDefined();
    expect(provenance!.providerId).toBe(FIXTURE_PROVIDER_ID);
    expect(provenance!.assetId).toBe("paper-1");
    expect(provenance!.contentDigest).toBe(revision.contentDigest);
    expect(provenance!.importOperationId).toBe(candidate.operationId);

    // §18: the operation id is DERIVED from the campaign's five inputs.
    expect(
      externalAssetImportOperationIdOf({
        projectId: rig.projectId,
        externalRef: candidate.externalRef,
        journalKind: "IDEA",
        textDigest: revision.contentDigest,
        providerDefinitionDigest: candidate.providerDefinitionDigest,
      }),
    ).toBe(candidate.operationId);

    expect(rig.bridge.verifyChain(PROJECT_ID)).toEqual({ ok: true });
    expect(rig.bridge.list(PROJECT_ID).map((record) => record.family)).toEqual([
      "EXTERNAL_IMPORT_PREPARED",
      "EXTERNAL_IMPORT_COMMITTED",
    ]);
    // AE-N27: the bridge history stores refs/digests, never content.
    const dump = rawRows(join(rig.dir, "bridge.sqlite"), "SELECT record_json FROM external_asset_bridge");
    expect(dump).not.toContain(DEFAULT_TEXT);
    expect(dump).not.toContain("Bridge paper");
    expect(dump).toContain(revision.contentDigest);
  });

  it("AE-N09: an import requires an EXPLICIT Journal kind", async () => {
    const rig = makePlaneRig();
    const revision = rig.fixture.addRevision({ assetId: "paper-1", assetType: "Paper", title: "T", body: DEFAULT_TEXT });
    const prepared = await rig.service.prepareImport({
      projectId: rig.projectId,
      externalRef: materializeExternalAssetStableRef({
        providerId: FIXTURE_PROVIDER_ID,
        assetId: "paper-1",
        contentDigest: revision.contentDigest,
      }),
      journalKind: "DECISION" as never,
      title: "T",
    });
    expect(prepared.status).toBe("DENIED");
    if (prepared.status !== "DENIED") throw new Error("unreachable");
    expect(prepared.reason).toBe("journal_kind_required");
    expect(await journalEntries(rig.journal)).toEqual([]);
    expect(rig.bridge.list(PROJECT_ID)).toEqual([]);
  });

  it("AE-N10: a provider asset type never auto-maps to a Journal kind", async () => {
    const rig = makePlaneRig();
    const revision = rig.fixture.addRevision({
      assetId: "paper-1",
      // The provider calls it a "Method"; the caller asks for REFERENCE_NOTE.
      assetType: "Method",
      title: "T",
      body: DEFAULT_TEXT,
    });
    const candidate = await prepareImportOk(rig, "paper-1", revision.contentDigest, "REFERENCE_NOTE", "T");
    expect(candidate.journalKind).toBe("REFERENCE_NOTE");
    expect(candidate.entry.kind).toBe("REFERENCE_NOTE");
    const result = await rig.service.commitImport(candidate);
    if (result.status !== "COMMITTED") throw new Error("unreachable");
    expect(result.entry.kind).toBe("REFERENCE_NOTE");
  });

  it("AE-N11: a materialization whose digest differs is BLOCKED with zero Journal write", async () => {
    const rig = makePlaneRig();
    const revision = rig.fixture.addRevision({ assetId: "paper-1", assetType: "Paper", title: "T", body: DEFAULT_TEXT });
    rig.fixture.mode.mangleDigest = true;
    const prepared = await rig.service.prepareImport({
      projectId: rig.projectId,
      externalRef: materializeExternalAssetStableRef({
        providerId: FIXTURE_PROVIDER_ID,
        assetId: "paper-1",
        contentDigest: revision.contentDigest,
      }),
      journalKind: "IDEA",
      title: "T",
    });
    expect(prepared.status).toBe("DENIED");
    if (prepared.status !== "DENIED") throw new Error("unreachable");
    expect(prepared.reason).toBe("digest_mismatch");
    expect(await journalEntries(rig.journal)).toEqual([]);
    expect(rig.bridge.list(PROJECT_ID)).toEqual([]);
  });

  it("AE-N12: an oversized import is BLOCKED, never truncated", async () => {
    const rig = makePlaneRig({ maxImportedTextBytes: 64 });
    const long = "x".repeat(200);
    const revision = rig.fixture.addRevision({ assetId: "paper-1", assetType: "Paper", title: "T", body: long });
    const prepared = await rig.service.prepareImport({
      projectId: rig.projectId,
      externalRef: materializeExternalAssetStableRef({
        providerId: FIXTURE_PROVIDER_ID,
        assetId: "paper-1",
        contentDigest: revision.contentDigest,
      }),
      journalKind: "IDEA",
      title: "T",
    });
    expect(prepared.status).toBe("DENIED");
    if (prepared.status !== "DENIED") throw new Error("unreachable");
    expect(prepared.reason).toBe("content_too_large");
    expect(prepared.detail).toContain("200 bytes");
    expect(prepared.detail).toContain("maxImportedTextBytes=64");
    expect(await journalEntries(rig.journal)).toEqual([]);
    // Reference-only remains possible for the same asset.
    const reference = await rig.service.prepareReference({
      projectId: rig.projectId,
      providerId: FIXTURE_PROVIDER_ID,
      assetId: "paper-1",
      contentDigest: revision.contentDigest,
    });
    expect(reference.status).toBe("PREPARED");
  });

  it("§15: binary content blocks the import while a reference stays possible", async () => {
    const rig = makePlaneRig();
    const revision = rig.fixture.addRevision({ assetId: "blob-1", assetType: "Dataset", title: "D", body: DEFAULT_TEXT });
    rig.fixture.mode.binaryMediaType = true;
    const prepared = await rig.service.prepareImport({
      projectId: rig.projectId,
      externalRef: materializeExternalAssetStableRef({
        providerId: FIXTURE_PROVIDER_ID,
        assetId: "blob-1",
        contentDigest: revision.contentDigest,
      }),
      journalKind: "REFERENCE_NOTE",
      title: "D",
    });
    expect(prepared.status).toBe("DENIED");
    if (prepared.status !== "DENIED") throw new Error("unreachable");
    expect(prepared.reason).toBe("binary_content");
    expect(await journalEntries(rig.journal)).toEqual([]);
  });

  it("§18 import crash: a retry after the local write does NOT duplicate the entry", async () => {
    const rig = makePlaneRig();
    const revision = rig.fixture.addRevision({ assetId: "paper-1", assetType: "Paper", title: "T", body: DEFAULT_TEXT });
    const candidate = await prepareImportOk(rig, "paper-1", revision.contentDigest, "IDEA", "Crash idea");

    // The crash state: PREPARED receipt written, the Journal entry already landed,
    // no terminal receipt. Everything below uses the REAL stores.
    await rig.service.beginImport(candidate);
    await rig.journalPort.append(candidate.entry);
    expect(await journalEntries(rig.journal)).toHaveLength(1);

    const retried = await rig.service.commitImport(candidate);
    expect(retried.status).toBe("COMMITTED");
    if (retried.status !== "COMMITTED") throw new Error("unreachable");
    expect(retried.journalCreated).toBe(false);
    expect(retried.replayed).toBe(false);
    expect(await journalEntries(rig.journal)).toHaveLength(1);

    // A second retry is a pure replay.
    const replayed = await rig.service.commitImport(candidate);
    expect(replayed.status).toBe("COMMITTED");
    if (replayed.status !== "COMMITTED") throw new Error("unreachable");
    expect(replayed.replayed).toBe(true);
    expect(await journalEntries(rig.journal)).toHaveLength(1);
    expect(rig.bridge.list(PROJECT_ID)).toHaveLength(2);
    expect(rig.bridge.verifyChain(PROJECT_ID)).toEqual({ ok: true });
  });

  it("§18 a RE-prepared candidate for the same operation is refused with zero writes", async () => {
    const rig = makePlaneRig();
    const revision = rig.fixture.addRevision({ assetId: "paper-1", assetType: "Paper", title: "T", body: DEFAULT_TEXT });
    const first = await prepareImportOk(rig, "paper-1", revision.contentDigest, "IDEA", "T");
    await rig.service.beginImport(first);

    rig.setClock("2026-09-16T00:05:00Z");
    const second = await prepareImportOk(rig, "paper-1", revision.contentDigest, "IDEA", "T");
    expect(second.operationId).toBe(first.operationId);
    expect(second.candidateDigest).not.toBe(first.candidateDigest);

    const result = await rig.service.commitImport(second);
    expect(result).toMatchObject({ status: "STALE_IMPORT_CANDIDATE", reason: "stale_import_candidate" });
    expect(await journalEntries(rig.journal)).toEqual([]);
    expect(rig.bridge.list(PROJECT_ID)).toHaveLength(1);
  });

  it("§18 a project that vanished refuses the import commit with zero writes", async () => {
    const rig = makePlaneRig();
    const revision = rig.fixture.addRevision({ assetId: "paper-1", assetType: "Paper", title: "T", body: DEFAULT_TEXT });
    const candidate = await prepareImportOk(rig, "paper-1", revision.contentDigest);
    rig.setBasis(undefined);
    const result = await rig.service.commitImport(candidate);
    expect(result.status).toBe("STALE_IMPORT_CANDIDATE");
    expect(await journalEntries(rig.journal)).toEqual([]);
  });

  it("§16 the OPPORTUNITY case: import is not a Task and only promoteOpportunity makes Work", async () => {
    const rig = makeInstallRig();
    const revision = rig.fixture.addRevision({ assetId: "paper-1", assetType: "Paper", title: "T", body: DEFAULT_TEXT });
    const externalAssets = rig.installed.externalAssets!;
    const prepared = await externalAssets.prepareImport({
      projectId: PROJECT_ID,
      externalRef: materializeExternalAssetStableRef({
        providerId: FIXTURE_PROVIDER_ID,
        assetId: "paper-1",
        contentDigest: revision.contentDigest,
      }),
      journalKind: "OPPORTUNITY",
      title: "Opportunity from the library",
    });
    if (prepared.status !== "PREPARED") throw new Error("expected a prepared import");
    const committed = await externalAssets.commitImport(prepared.candidate);
    expect(committed.status).toBe("COMMITTED");
    if (committed.status !== "COMMITTED") throw new Error("unreachable");
    expect(committed.entry.kind).toBe("OPPORTUNITY");

    // AE-N28: the imported OPPORTUNITY is NOT a Task.
    const projectBefore = rig.installed.controller.status();
    expect(projectBefore.tasks.map((task) => task.task_id)).toEqual(["task-a"]);

    // Only the EXISTING explicit promotion turns it into Work.
    const promoted = await rig.installed.projectWorkspace!.promoteOpportunity({
      projectId: PROJECT_ID,
      entryId: committed.entry.entryId,
      taskSpec: taskSpec("task-from-opportunity"),
    });
    expect(promoted.taskId).toBe("task-from-opportunity");
    expect(rig.installed.controller.status().tasks.map((task) => task.task_id)).toEqual([
      "task-a",
      "task-from-opportunity",
    ]);
  });
});

/* -------------------------------------------------------------------------- *
 * §17/§18 bridge history
 * -------------------------------------------------------------------------- */

describe("G10-AE §17 bridge history is narrow, append-only and crash-honest", () => {
  it("the chain is tamper-evident per project and rejects a rewritten row", async () => {
    const rig = makePlaneRig();
    const revision = rig.fixture.addRevision({ assetId: "paper-1", assetType: "Paper", title: "T", body: DEFAULT_TEXT });
    const candidate = await prepareImportOk(rig, "paper-1", revision.contentDigest);
    await rig.service.commitImport(candidate);

    expect(rig.bridge.verifyChain(PROJECT_ID)).toEqual({ ok: true });
    expect(rig.bridge.projects()).toEqual([PROJECT_ID]);
    expect(rig.bridge.lineage(PROJECT_ID, candidate.operationId)).toHaveLength(2);

    // §29: no arbitrary search query/result is ever persisted.
    const dump = rawRows(join(rig.dir, "bridge.sqlite"), "SELECT record_json FROM external_asset_bridge");
    expect(dump).not.toContain("fixture note about palimpsest");
    expect(dump).not.toContain("searchScore");
  });

  it("a malformed receipt family contract is refused on the way in", async () => {
    const rig = makePlaneRig();
    expect(() =>
      rig.bridge.append({
        projectId: PROJECT_ID,
        family: "EXTERNAL_IMPORT_COMMITTED",
        operationId: "imp-incomplete",
        providerId: FIXTURE_PROVIDER_ID,
        providerDefinitionDigest: "a".repeat(64),
        recordedAt: rig.clock(),
      }),
    ).toThrow(/requires "journalEntryId"/u);
  });
});

/* -------------------------------------------------------------------------- *
 * §19–§25 outbound publication
 * -------------------------------------------------------------------------- */

describe("G10-AE §19–§25 outbound publication", () => {
  async function publishableRig(admission?: ExternalAssetPublicationAdmissionPort) {
    const rig = makePlaneRig(admission === undefined ? {} : { admission });
    const revision = rig.fixture.addRevision({
      assetId: "paper-1",
      assetType: "Paper",
      title: "T",
      body: DEFAULT_TEXT,
    });
    const entry = await rig.journalPort.append(
      materializeProjectJournalEntry({
        projectId: PROJECT_ID,
        kind: "REFERENCE_NOTE",
        title: "Local note title",
        body: "Local note body that will be published verbatim.",
        provenance: "operator: recorded locally",
        createdAt: rig.clock(),
      }),
    );
    return { rig, revision, entry };
  }

  it("AE-N18/§33: a publication preview has ZERO effect", async () => {
    const { rig, entry } = await publishableRig();
    const preview = await rig.service.preparePublication({
      projectId: PROJECT_ID,
      providerId: FIXTURE_PROVIDER_ID,
      targetAssetType: "Note",
      journalEntryId: entry.entryId,
    });
    expect(preview.outboundBody).toBe(entry.body);
    expect(preview.outboundTitle).toBe(entry.title);
    expect(preview.localJournalDigest).toBe(entry.digest);
    expect(preview.publicationId).toMatch(/^pub-[0-9a-f]{32}$/u);

    expect(rig.fixture.publishCalls).toBe(0);
    expect(rig.fixture.publicationCount()).toBe(0);
    expect(rig.bridge.list(PROJECT_ID)).toEqual([]);
    expect(await rig.associations.replay(PROJECT_ID)).toEqual([]);
    const operations = await rig.effects.runtime.ledger.list();
    expect(operations.records).toEqual([]);
  });

  it("§25: without an association owner publication fails closed BEFORE any effect", async () => {
    const rig = makePlaneRig();
    const service = makeExternalAssetBridgeService({
      registry: externalAssetLibraryRegistryOf([
        { read: rig.fixture.readPort(), publication: rig.fixture.publicationPort() },
      ]),
      bridge: rig.bridge,
      projectScope: { basis: async () => rig.basis() },
      journal: rig.journalPort,
      publicationAdmission: scriptedAdmission("APPROVE"),
      clock: () => rig.clock(),
      invokeEffect: rig.invokeEffect,
    });
    const entry = await rig.journalPort.append(
      materializeProjectJournalEntry({
        projectId: PROJECT_ID,
        kind: "IDEA",
        title: "T",
        body: "B",
        provenance: "p",
        createdAt: rig.clock(),
      }),
    );
    const preview = await service.preparePublication({
      projectId: PROJECT_ID,
      providerId: FIXTURE_PROVIDER_ID,
      targetAssetType: "Note",
      journalEntryId: entry.entryId,
    });
    await expect(service.approveAndPublish(preview)).rejects.toThrow(/no project association owner/u);
    expect(rig.fixture.publishCalls).toBe(0);
    expect(rig.bridge.list(PROJECT_ID)).toEqual([]);
    expect((await rig.effects.runtime.ledger.list()).records).toEqual([]);
  });

  it("AE-N20/§19: publication sources ONLY a project journal entry", async () => {
    const { rig } = await publishableRig();
    await expect(
      rig.service.preparePublication({
        projectId: PROJECT_ID,
        providerId: FIXTURE_PROVIDER_ID,
        targetAssetType: "Note",
        journalEntryId: "task-a",
      }),
    ).rejects.toThrow(/is not recorded in project/u);
    expect(rig.fixture.publishCalls).toBe(0);
  });

  it("AE-N19/§21: without an admission port publication is BLOCKED with zero mutation", async () => {
    const { rig, entry } = await publishableRig();
    const preview = await rig.service.preparePublication({
      projectId: PROJECT_ID,
      providerId: FIXTURE_PROVIDER_ID,
      targetAssetType: "Note",
      journalEntryId: entry.entryId,
    });
    const result = await rig.service.approveAndPublish(preview);
    expect(result).toMatchObject({ status: "NOT_APPROVED", decision: "UNAVAILABLE" });
    expect(rig.fixture.publishCalls).toBe(0);
    expect(rig.fixture.publicationCount()).toBe(0);
    expect(rig.bridge.list(PROJECT_ID)).toEqual([]);
    expect(await rig.associations.replay(PROJECT_ID)).toEqual([]);
    const operations = await rig.effects.runtime.ledger.list();
    expect(operations.records).toEqual([]);
  });

  it("AE-N19/§21: an explicit REJECT blocks publication with zero mutation", async () => {
    const { rig, entry } = await publishableRig(rejectAllExternalAssetPublicationAdmission());
    const preview = await rig.service.preparePublication({
      projectId: PROJECT_ID,
      providerId: FIXTURE_PROVIDER_ID,
      targetAssetType: "Note",
      journalEntryId: entry.entryId,
    });
    const result = await rig.service.approveAndPublish(preview);
    expect(result).toMatchObject({ status: "NOT_APPROVED", decision: "REJECT" });
    expect(rig.fixture.publishCalls).toBe(0);
    expect(rig.bridge.list(PROJECT_ID)).toEqual([]);
    expect((await rig.effects.runtime.ledger.list()).records).toEqual([]);
  });

  it("AE-N17: a preview cannot smuggle a management mode or an approval field", async () => {
    const { rig, entry } = await publishableRig();
    const preview = await rig.service.preparePublication({
      projectId: PROJECT_ID,
      providerId: FIXTURE_PROVIDER_ID,
      targetAssetType: "Note",
      journalEntryId: entry.entryId,
    });
    for (const banned of ["managementMode", "involvement", "operatorApproval", "autonomyProfile"]) {
      expect(() =>
        parseExternalAssetPublicationPreview({ ...preview, [banned]: "MANAGE" }),
      ).toThrow(/unknown field/u);
    }
    // The effect input has NO field for approval or mode either.
    const input = externalAssetPublishEffectInputOf(preview);
    expect(Object.keys(input).sort()).toEqual([...EXTERNAL_ASSET_PUBLISH_INPUT_FIELDS].sort());
    for (const banned of ["approval", "approved", "managementMode", "token", "credential"]) {
      expect(Object.keys(input)).not.toContain(banned);
    }

    // The admission port is handed EXACTLY the preview and nothing else: there is
    // no channel through which a mode, a credential or an agent claim could travel.
    let observedKeys: string[] = [];
    const observingRig = makePlaneRig({
      admission: {
        policyRef: { policyId: "observing", version: "1" },
        async admit(admissionInput) {
          observedKeys = Object.keys(admissionInput).sort();
          return { decision: "APPROVE" };
        },
      },
    });
    const observingEntry = await observingRig.journalPort.append(
      materializeProjectJournalEntry({
        projectId: PROJECT_ID,
        kind: "IDEA",
        title: "T",
        body: "B",
        provenance: "p",
        createdAt: observingRig.clock(),
      }),
    );
    const observingPreview = await observingRig.service.preparePublication({
      projectId: PROJECT_ID,
      providerId: FIXTURE_PROVIDER_ID,
      targetAssetType: "Note",
      journalEntryId: observingEntry.entryId,
    });
    const observingResult = await observingRig.service.approveAndPublish(observingPreview);
    expect(observingResult.status).toBe("PUBLISHED");
    expect(observedKeys).toEqual(["preview"]);
  });

  it("AE-N21: publication runs through the governed Ordarium effect path", async () => {
    const admission = scriptedAdmission("APPROVE");
    const { rig, entry } = await publishableRig(admission);
    const preview = await rig.service.preparePublication({
      projectId: PROJECT_ID,
      providerId: FIXTURE_PROVIDER_ID,
      targetAssetType: "Note",
      journalEntryId: entry.entryId,
    });
    const result = await rig.service.approveAndPublish(preview);
    expect(result.status).toBe("PUBLISHED");

    const operations = await rig.effects.runtime.ledger.list();
    expect(operations.records).toHaveLength(1);
    const operation = operations.records[0]!;
    expect(operation.actionName).toBe(EXTERNAL_ASSET_PUBLISH_ACTION_NAME);
    expect(operation.effectKind).toBe("reconcilable");
    expect(operation.idempotencyMode).toBe("operation-key");
    expect(operation.state).toBe("succeeded");
  });

  it("AE-N22: a retry of the SAME publication reuses the Ordarium operation", async () => {
    const admission = scriptedAdmission("APPROVE");
    const { rig, entry } = await publishableRig(admission);
    const preview = await rig.service.preparePublication({
      projectId: PROJECT_ID,
      providerId: FIXTURE_PROVIDER_ID,
      targetAssetType: "Note",
      journalEntryId: entry.entryId,
    });
    const input = externalAssetPublishEffectInputOf(preview);
    const first = await rig.invokeEffect.invoke(input);
    const second = await rig.invokeEffect.invoke(input);
    expect(second).toEqual(first);
    expect(rig.fixture.publishCalls).toBe(1);
    expect(rig.fixture.publicationCount()).toBe(1);
  });

  it("§23 an uncertain NON-idempotent publication is NEVER blind-retried", async () => {
    const rig = makePlaneRig();
    let publishCalls = 0;
    let reconcileCalls = 0;
    const nonIdempotent = externalAssetLibraryRegistryOf([
      {
        read: rig.fixture.readPort(),
        publication: {
          definition: rig.fixture.definition,
          semantics: "RECONCILABLE",
          async publish() {
            publishCalls += 1;
            return { status: "UNCERTAIN", detail: "the request timed out after being sent" };
          },
          async reconcile() {
            reconcileCalls += 1;
            return { status: "UNKNOWN", detail: "the remote system is unreachable" };
          },
        },
      },
    ]);
    const effects = createPalimpsestEffects({
      databasePath: join(rig.dir, "ordarium-nonidempotent.sqlite"),
      git: new FakeGitPort(HEAD),
    });
    CLOSERS.push(async () => {
      await effects.close();
    });
    const actionEffects = defineExternalAssetEffects({
      publicationPort: (providerId) => nonIdempotent.get(providerId)?.publication,
      journal: rig.journalPort,
    });
    const service = makeExternalAssetBridgeService({
      registry: nonIdempotent,
      bridge: rig.bridge,
      projectScope: { basis: async () => rig.basis() },
      associations: sqliteExternalAssetAssociationPort(rig.associations, () => rig.clock()),
      journal: rig.journalPort,
      publicationAdmission: scriptedAdmission("APPROVE"),
      clock: () => rig.clock(),
      invokeEffect: {
        invoke: (input) =>
          effects.invoke(actionEffects.publishExternalAsset, input, {
            scope: PROJECT_ID,
            callId: `external-asset-publish:${input.publicationId}`,
            revision: 1,
          }),
      },
    });
    const entry = materializeProjectJournalEntry({
      projectId: PROJECT_ID,
      kind: "IDEA",
      title: "T",
      body: "B",
      provenance: "p",
      createdAt: rig.clock(),
    });
    await rig.journalPort.append(entry);
    const preview = await service.preparePublication({
      projectId: PROJECT_ID,
      providerId: FIXTURE_PROVIDER_ID,
      targetAssetType: "Note",
      journalEntryId: entry.entryId,
    });

    const first = await service.approveAndPublish(preview);
    expect(first.status).toBe("FAILED");
    if (first.status !== "FAILED") throw new Error("unreachable");
    expect(first.reason).toBe("publication_outcome_unknown");
    expect(publishCalls).toBe(1);

    const second = await service.approveAndPublish(preview);
    expect(second.status).toBe("FAILED");
    // The retry went through the Ordarium reconcile path, which stayed UNKNOWN, so
    // the provider's write path was NEVER called a second time.
    expect(publishCalls).toBe(1);
    expect(reconcileCalls).toBeGreaterThanOrEqual(1);
    expect(rig.fixture.publicationCount()).toBe(0);
  });

  it("AE-N25: the preview is byte-for-byte the only content that leaves", async () => {
    const admission = scriptedAdmission("APPROVE");
    const { rig, entry } = await publishableRig(admission);
    const other = (
      await import("../src/project_workspace/index.js")
    ).materializeProjectJournalEntry({
      projectId: PROJECT_ID,
      kind: "IDEA",
      title: "OTHER-ENTRY-TITLE",
      body: "OTHER-ENTRY-BODY",
      provenance: "operator: local only",
      createdAt: rig.clock(),
    });
    await rig.journalPort.append(other);
    const preview = await rig.service.preparePublication({
      projectId: PROJECT_ID,
      providerId: FIXTURE_PROVIDER_ID,
      targetAssetType: "Note",
      journalEntryId: entry.entryId,
    });

    // The payload is exactly the entry's title/body + identity labels.
    expect(preview.outboundTitle).toBe(entry.title);
    expect(preview.outboundBody).toBe(entry.body);
    expect(Object.keys(preview.outboundMetadata).sort()).toEqual([
      "palimpsest_journal_entry_digest",
      "palimpsest_journal_entry_id",
      "palimpsest_journal_kind",
    ]);
    const payload = externalAssetOutboundPayloadOf({
      providerId: FIXTURE_PROVIDER_ID,
      providerDefinitionDigest: rig.fixture.definition.digest,
      targetAssetType: "Note",
      entry,
    });
    expect(externalAssetOutboundPayloadDigestOf(payload)).toBe(preview.payloadDigest);

    const result = await rig.service.approveAndPublish(preview);
    expect(result.status).toBe("PUBLISHED");
    const externalDump = rig.fixture.rawDump();
    expect(externalDump).toContain(entry.body);
    expect(externalDump).not.toContain("OTHER-ENTRY-TITLE");
    expect(externalDump).not.toContain("OTHER-ENTRY-BODY");
    expect(externalDump).not.toContain("operator: local only");
    expect(externalDump).not.toContain(PROJECT_ID);
  });

  it("§33 publish: approval → governed publish → stable ref + terminal + association", async () => {
    const admission = scriptedAdmission("APPROVE");
    const { rig, entry } = await publishableRig(admission);
    const preview = await rig.service.preparePublication({
      projectId: PROJECT_ID,
      providerId: FIXTURE_PROVIDER_ID,
      targetAssetType: "Note",
      journalEntryId: entry.entryId,
    });
    const result = await rig.service.approveAndPublish(preview);
    expect(result.status).toBe("PUBLISHED");
    if (result.status !== "PUBLISHED") throw new Error("unreachable");

    // AE-N24: the result is an exact stable external ref.
    expect(result.ref.providerId).toBe(FIXTURE_PROVIDER_ID);
    expect(result.ref.contentDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(result.ref.assetId).toBe(`ext-${preview.publicationId}`);
    const probe = parseExternalAssetPublicationReconciliation(
      await rig.fixture.publicationPort().reconcile!({
        publicationId: preview.publicationId,
        providerDefinitionDigest: rig.fixture.definition.digest,
        payloadDigest: preview.payloadDigest,
      }),
    );
    expect(probe).toMatchObject({ status: "PUBLISHED" });
    if (probe.status !== "PUBLISHED") throw new Error("unreachable");
    expect(probe.ref.contentDigest).toBe(result.ref.contentDigest);

    // §25: one EXTERNAL_ASSET association with associationKind PUBLISHED.
    expect(result.association?.assetKind).toBe("EXTERNAL_ASSET");
    expect(result.association?.associationKind).toBe("PUBLISHED");
    expect(result.association?.canonicalRef).toEqual({
      kind: FIXTURE_PROVIDER_ID,
      id: result.ref.assetId,
      digest: result.ref.contentDigest,
    });

    // The LOCAL journal stays local canonical history.
    const entries = await journalEntries(rig.journal);
    expect(entries.map((view) => view.entry.entryId)).toContain(entry.entryId);
    expect(entries).toHaveLength(1);
    expect(rig.bridge.list(PROJECT_ID).map((record) => record.family)).toEqual([
      "EXTERNAL_PUBLICATION_PREPARED",
      "EXTERNAL_PUBLICATION_COMMITTED",
    ]);
    expect(rig.bridge.verifyChain(PROJECT_ID)).toEqual({ ok: true });

    // A second call is a pure replay: no second external asset.
    const replay = await rig.service.approveAndPublish(preview);
    expect(replay.status).toBe("PUBLISHED");
    if (replay.status !== "PUBLISHED") throw new Error("unreachable");
    expect(replay.created).toBe(false);
    expect(rig.fixture.publicationCount()).toBe(1);
    expect(rig.fixture.publishCalls).toBe(1);
    expect(rig.bridge.list(PROJECT_ID)).toHaveLength(2);
  });

  it("AE-N23/§24: a crash AFTER the external success does not double-publish", async () => {
    const admission = scriptedAdmission("APPROVE");
    const { rig, entry } = await publishableRig(admission);
    const preview = await rig.service.preparePublication({
      projectId: PROJECT_ID,
      providerId: FIXTURE_PROVIDER_ID,
      targetAssetType: "Note",
      journalEntryId: entry.entryId,
    });
    rig.fixture.mode.crashAfterPublish = true;

    const crashed = await rig.service.approveAndPublish(preview);
    // The external asset exists; the plane RECOVERED it from the provider instead
    // of publishing again.
    expect(crashed.status).toBe("PUBLISHED");
    expect(rig.fixture.publicationCount()).toBe(1);
    if (crashed.status !== "PUBLISHED") throw new Error("unreachable");
    expect(crashed.created).toBe(false);

    rig.fixture.mode.crashAfterPublish = false;
    const retried = await rig.service.approveAndPublish(preview);
    expect(retried.status).toBe("PUBLISHED");
    if (retried.status !== "PUBLISHED") throw new Error("unreachable");
    expect(retried.ref.refDigest).toBe(crashed.ref.refDigest);
    expect(rig.fixture.publicationCount()).toBe(1);
    expect(rig.fixture.publishCalls).toBe(1);

    // Exactly one external asset, one local terminal record, one association.
    const terminal = rig.bridge
      .list(PROJECT_ID)
      .filter((record) => record.family === "EXTERNAL_PUBLICATION_COMMITTED");
    expect(terminal).toHaveLength(1);
    const associations = await rig.associations.replay(PROJECT_ID);
    expect(associations.filter((event) => event.type === "ASSET_ASSOCIATED")).toHaveLength(1);
    expect(rig.bridge.verifyChain(PROJECT_ID)).toEqual({ ok: true });
  });

  it("a provider FAILED outcome is recorded as a failed receipt with no association", async () => {
    const admission = scriptedAdmission("APPROVE");
    const { rig, entry } = await publishableRig(admission);
    rig.fixture.mode.rejectPublication = "the library refuses anonymous submissions";
    const preview = await rig.service.preparePublication({
      projectId: PROJECT_ID,
      providerId: FIXTURE_PROVIDER_ID,
      targetAssetType: "Note",
      journalEntryId: entry.entryId,
    });
    const result = await rig.service.approveAndPublish(preview);
    expect(result.status).toBe("FAILED");
    if (result.status !== "FAILED") throw new Error("unreachable");
    expect(result.reason).toBe("publication_absent");
    expect(rig.fixture.publicationCount()).toBe(0);
    expect(
      (await rig.associations.replay(PROJECT_ID)).filter((event) => event.type === "ASSET_ASSOCIATED"),
    ).toHaveLength(0);
    expect(rig.bridge.list(PROJECT_ID).map((record) => record.family)).toEqual([
      "EXTERNAL_PUBLICATION_PREPARED",
      "EXTERNAL_PUBLICATION_FAILED",
    ]);
    expect(rig.bridge.verifyChain(PROJECT_ID)).toEqual({ ok: true });
  });

  it("§22 the effect refuses a caller field the preview never bound", async () => {
    const admission = scriptedAdmission("APPROVE");
    const { rig, entry } = await publishableRig(admission);
    const preview = await rig.service.preparePublication({
      projectId: PROJECT_ID,
      providerId: FIXTURE_PROVIDER_ID,
      targetAssetType: "Note",
      journalEntryId: entry.entryId,
    });
    const input = externalAssetPublishEffectInputOf(preview);
    await expect(
      rig.invokeEffect.invoke({ ...input, body: "a caller-supplied body" } as never),
    ).rejects.toThrow(/unexpected field "body"/u);
    expect(rig.fixture.publishCalls).toBe(0);
  });

  it("§22 the effect refuses a drifted journal entry before calling the provider", async () => {
    const admission = scriptedAdmission("APPROVE");
    const { rig, entry } = await publishableRig(admission);
    const preview = await rig.service.preparePublication({
      projectId: PROJECT_ID,
      providerId: FIXTURE_PROVIDER_ID,
      targetAssetType: "Note",
      journalEntryId: entry.entryId,
    });
    const input = externalAssetPublishEffectInputOf(preview);
    // The governed action refuses the drifted binding BEFORE the provider is called;
    // Ordarium then records the operation as uncertain rather than retrying it.
    await expect(
      rig.invokeEffect.invoke({ ...input, journalEntryDigest: "f".repeat(64) }),
    ).rejects.toThrow(/uncertain|blind retry/u);
    expect(rig.fixture.publishCalls).toBe(0);
  });
});

/* -------------------------------------------------------------------------- *
 * §29 privacy + §30/§31 no scope creep
 * -------------------------------------------------------------------------- */

describe("G10-AE §29/§30/§31 privacy and scope", () => {
  it("§29 arbitrary search queries are never persisted", async () => {
    const rig = makePlaneRig();
    rig.fixture.addRevision({ assetId: "paper-1", assetType: "Paper", title: "T", body: DEFAULT_TEXT });
    await rig.service.search({ providerId: FIXTURE_PROVIDER_ID, text: "UNPERSISTED-QUERY-TOKEN" });
    const dump = [
      rawRows(join(rig.dir, "bridge.sqlite"), "SELECT * FROM external_asset_bridge"),
      rawRows(join(rig.dir, "associations.sqlite"), "SELECT * FROM project_asset_association_events"),
      rawRows(join(rig.dir, "journal.sqlite"), "SELECT * FROM project_journal_events"),
    ].join("\n");
    expect(dump).not.toContain("UNPERSISTED-QUERY-TOKEN");
  });

  it("§30 no automatic applicability relation is created anywhere", async () => {
    const rig = makePlaneRig();
    const revision = rig.fixture.addRevision({ assetId: "paper-1", assetType: "Method", title: "T", body: DEFAULT_TEXT });
    const candidate = await prepareReferenceOk(rig, "paper-1", revision.contentDigest);
    await rig.service.commitReference(candidate);
    const serialized = JSON.stringify(await rig.associations.replay(PROJECT_ID));
    for (const banned of ["appliesTo", "applies_to", "applicability", "targetTask", "recommendation"]) {
      expect(serialized).not.toContain(banned);
    }
  });

  it("§31 no external-asset watcher, webhook or auto-refresh exists", async () => {
    const rig = makePlaneRig();
    const revision = rig.fixture.addRevision({ assetId: "paper-1", assetType: "Paper", title: "T", body: DEFAULT_TEXT });
    const candidate = await prepareReferenceOk(rig, "paper-1", revision.contentDigest);
    await rig.service.commitReference(candidate);
    const before = rig.bridge.list(PROJECT_ID);
    const inspectCallsBefore = rig.fixture.inspectCalls;
    // Time passes; nothing watches the library.
    rig.setClock("2026-09-17T00:00:00Z");
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(rig.bridge.list(PROJECT_ID)).toEqual(before);
    expect(rig.fixture.inspectCalls).toBe(inspectCallsBefore);
  });
});

/* -------------------------------------------------------------------------- *
 * Install-level integration (§5/§7/§28 + the Work/Proof/Decision firewalls)
 * -------------------------------------------------------------------------- */

describe("G10-AE install wiring", () => {
  it("a bare Work-only install composes NOTHING extra", () => {
    const rig = makeInstallRig({ withExternal: false, bare: true });
    expect(rig.installed.externalAssets).toBeUndefined();
    expect(rig.installed.projectWorkspace).toBeUndefined();
    expect(rig.installed.projectManagement).toBeUndefined();
    expect(rig.installed.verification).toBeUndefined();
    expect(rig.installed.monitor).toBeUndefined();
  });

  it("§28 the install exposes the read/prepare/commit surface", async () => {
    const rig = makeInstallRig();
    const externalAssets = rig.installed.externalAssets;
    expect(externalAssets).toBeDefined();
    const descriptors = await externalAssets!.providers();
    expect(descriptors.map((descriptor) => descriptor.definition.providerId)).toEqual([FIXTURE_PROVIDER_ID]);
    expect(descriptors[0]!.search && descriptors[0]!.inspect && descriptors[0]!.publish).toBe(true);
  });

  it("the install's default bridge store is deployment-local and closed by dispose()", async () => {
    const rig = makeInstallRig();
    expect(rig.installed.externalAssets!.store).toBeInstanceOf(SqliteExternalAssetBridgeStore);
    await rig.installed.dispose();
    // A second dispose is a no-op (the same discipline as the other stores).
    await rig.installed.dispose();
  });

  it("AE-N13/N14/N15: an import creates NO Work, Proof or Decision mutation", async () => {
    const rig = makeInstallRig();
    const revision = rig.fixture.addRevision({ assetId: "paper-1", assetType: "Paper", title: "T", body: DEFAULT_TEXT });
    const before = rig.installed.controller.status();
    const projectRowBefore = rawRows(rig.statePath, "SELECT project_id, revision, digest FROM projects");
    const eventsBefore = rawRows(rig.statePath, "SELECT event_id, event_type FROM events");

    const prepared = await rig.installed.externalAssets!.prepareImport({
      projectId: PROJECT_ID,
      externalRef: materializeExternalAssetStableRef({
        providerId: FIXTURE_PROVIDER_ID,
        assetId: "paper-1",
        contentDigest: revision.contentDigest,
      }),
      journalKind: "IDEA",
      title: "T",
    });
    if (prepared.status !== "PREPARED") throw new Error("expected a prepared import");
    const committed = await rig.installed.externalAssets!.commitImport(prepared.candidate);
    expect(committed.status).toBe("COMMITTED");

    const after = rig.installed.controller.status();
    expect(after.tasks).toEqual(before.tasks);
    expect(after.evidence).toEqual(before.evidence);
    expect(after.attempts).toEqual(before.attempts);
    expect(rawRows(rig.statePath, "SELECT project_id, revision, digest FROM projects")).toBe(projectRowBefore);
    expect(rawRows(rig.statePath, "SELECT event_id, event_type FROM events")).toBe(eventsBefore);
    // The proof plane was never composed, and the plane cannot reach one anyway.
    expect(rig.installed.proof).toBeUndefined();
    // Exactly ONE journal event was written.
    const journalEvents = rawRows(rig.journalPath, "SELECT type FROM project_journal_events");
    expect(journalEvents).toContain("JOURNAL_ENTRY_RECORDED");
    expect(JSON.parse(journalEvents) as unknown[]).toHaveLength(2);
  });

  it("AE-N16: search never auto-enters project context", async () => {
    const rig = makeInstallRig();
    rig.fixture.addRevision({
      assetId: "paper-1",
      assetType: "Paper",
      title: "CONTEXT-LEAK-TITLE",
      body: "CONTEXT-LEAK-BODY",
    });
    const viewBefore = JSON.stringify(await rig.installed.projectWorkspace!.view());
    await rig.installed.externalAssets!.search({ providerId: FIXTURE_PROVIDER_ID, text: "CONTEXT" });
    await rig.installed.externalAssets!.inspect({ providerId: FIXTURE_PROVIDER_ID, assetId: "paper-1" });
    const viewAfter = JSON.stringify(await rig.installed.projectWorkspace!.view());
    expect(viewAfter).toBe(viewBefore);
    expect(viewAfter).not.toContain("CONTEXT-LEAK-TITLE");
    expect(viewAfter).not.toContain("CONTEXT-LEAK-BODY");
    expect(JSON.stringify(rig.installed.controller.orchestrationGraph())).not.toContain("CONTEXT-LEAK");
    expect(rawRows(rig.statePath, "SELECT event_id FROM events")).not.toContain("CONTEXT-LEAK");
  });

  it("AE-N29: wiring external assets changes neither VERIFY nor MONITOR", () => {
    const withoutExternal = makeInstallRig({ withExternal: false });
    const withExternal = makeInstallRig();
    expect(withExternal.installed.verification !== undefined).toBe(
      withoutExternal.installed.verification !== undefined,
    );
    expect(withExternal.installed.monitor).toBeUndefined();
    expect(withoutExternal.installed.monitor).toBeUndefined();
    expect(withExternal.installed.projectWorkspace !== undefined).toBe(true);
    expect(withoutExternal.installed.projectWorkspace !== undefined).toBe(true);
    /*
     * G10-AE integration pass: this assertion was written when the bridge plane had
     * no agent face at all, and it pinned the tool list to be IDENTICAL. §13/§28 of
     * the same campaign require an agent-facing `palimpsest_external_assets` tool
     * exposing ONLY the read/prepare verbs, so an identical list is no longer the
     * correct expectation. The invariant AE-N29 actually protects — wiring the
     * bridge changes neither VERIFY nor MONITOR — is asserted above, and the delta
     * is now pinned to EXACTLY the one read/prepare tool, with the three
     * operator-explicit verbs absent from its action set.
     */
    const extra = withExternal.installed.tools
      .map((tool) => tool.name)
      .filter((name) => !withoutExternal.installed.tools.some((tool) => tool.name === name));
    expect(extra).toEqual(["palimpsest_external_assets"]);
    const externalTool = withExternal.installed.tools.find(
      (tool) => tool.name === "palimpsest_external_assets",
    )!;
    expect(externalTool.mode).toBe("read-only");
    const actions = (
      (externalTool.parameters as { readonly properties?: Record<string, unknown> }).properties?.["action"] as
        | { readonly enum?: readonly string[] }
        | undefined
    )?.enum;
    expect(actions).toEqual([
      "providers",
      "search",
      "inspect",
      "prepare_reference",
      "prepare_import",
      "prepare_publication",
    ]);
    // The agent can never commit or approve: those three verbs exist only on the
    // operator-explicit application/HTTP face.
    for (const forbidden of ["commit_reference", "commit_import", "approve_publish"]) {
      expect(actions).not.toContain(forbidden);
    }
  });

  it("AE-N17 (install): MANAGE involvement still grants no publication approval", async () => {
    const rig = makeInstallRig({ management: true, admissionDecision: "NONE" });
    const profile = await rig.installed.projectManagement!.applyOperatorModeChange({
      to: "MANAGE",
      updatedBy: "operator:test",
    });
    expect(profile.involvement).toBe("MANAGE");

    const entry = await rig.installed.projectWorkspace!.recordJournalEntry({
      projectId: PROJECT_ID,
      kind: "IDEA",
      title: "Local note",
      body: "Local body",
      provenance: "operator:test",
    });
    const preview = await rig.installed.externalAssets!.preparePublication({
      projectId: PROJECT_ID,
      providerId: FIXTURE_PROVIDER_ID,
      targetAssetType: "Note",
      journalEntryId: entry.entryId,
    });
    const result = await rig.installed.externalAssets!.approveAndPublish(preview);
    expect(result).toMatchObject({ status: "NOT_APPROVED", decision: "UNAVAILABLE" });
    expect(rig.fixture.publishCalls).toBe(0);
    expect(rig.fixture.publicationCount()).toBe(0);
  });

  it("§33 (install) an end-to-end reference + import + publication on the real stack", async () => {
    const rig = makeInstallRig();
    const externalAssets = rig.installed.externalAssets!;
    const d1 = rig.fixture.addRevision({
      assetId: "paper-1",
      assetType: "Paper",
      title: "Bridge paper",
      body: DEFAULT_TEXT,
    });

    // reference
    const reference = await externalAssets.prepareReference({
      projectId: PROJECT_ID,
      providerId: FIXTURE_PROVIDER_ID,
      assetId: "paper-1",
      contentDigest: d1.contentDigest,
    });
    if (reference.status !== "PREPARED") throw new Error("expected a prepared reference");
    const committed = await externalAssets.commitReference(reference.candidate);
    expect(committed.status).toBe("COMMITTED");

    // import
    const imported = await externalAssets.prepareImport({
      projectId: PROJECT_ID,
      externalRef: reference.candidate.externalRef,
      journalKind: "NEGATIVE_RESULT",
      title: "Imported negative result",
    });
    if (imported.status !== "PREPARED") throw new Error("expected a prepared import");
    const importCommit = await externalAssets.commitImport(imported.candidate);
    expect(importCommit.status).toBe("COMMITTED");
    if (importCommit.status !== "COMMITTED") throw new Error("unreachable");
    expect(externalAssetImportProvenanceOf(importCommit.entry)).toBeDefined();

    // publish the (unrelated) local note
    const entry = await rig.installed.projectWorkspace!.recordJournalEntry({
      projectId: PROJECT_ID,
      kind: "REFERENCE_NOTE",
      title: "Local note",
      body: "Local note body",
      provenance: "operator:test",
    });
    const preview = await externalAssets.preparePublication({
      projectId: PROJECT_ID,
      providerId: FIXTURE_PROVIDER_ID,
      targetAssetType: "Note",
      journalEntryId: entry.entryId,
    });
    const published = await externalAssets.approveAndPublish(preview);
    expect(published.status).toBe("PUBLISHED");
    if (published.status !== "PUBLISHED") throw new Error("unreachable");
    expect(published.association?.associationKind).toBe("PUBLISHED");

    // The derived project view sees BOTH external associations, and the local
    // journal remains its own canonical history.
    const view = await externalAssets.resolve(PROJECT_ID);
    expect(view.external).toHaveLength(2);
    expect(view.external.map((resolution) => resolution.resolution)).toEqual(["RESOLVED", "RESOLVED"]);
    expect(rig.admission.previews).toHaveLength(1);
    expect(rig.admission.previews[0]!.outboundBody).toBe("Local note body");
    expect(rig.installed.externalAssets!.store.verifyChain(PROJECT_ID)).toEqual({ ok: true });
  });

  it("§33 provider-unavailable restart on the install stack keeps the association", async () => {
    const dir = freshDir("palimpsest-ae-restart-");
    const fixturePath = join(dir, "external-library.sqlite");
    const fixture = new FixtureExternalLibrary(fixturePath);
    const revision = fixture.addRevision({
      assetId: "paper-1",
      assetType: "Paper",
      title: "T",
      body: DEFAULT_TEXT,
    });
    const first = installPalimpsest({ tools: { register: () => undefined } }, {
      projectId: PROJECT_ID,
      databasePath: join(dir, "state.sqlite"),
      ordariumDatabasePath: join(dir, "ordarium.sqlite"),
      clock: () => "2026-09-16T00:00:00Z",
      git: new FakeGitPort(HEAD),
      projectAssociationStore: new SqliteProjectAssetAssociationStore(join(dir, "associations.sqlite")),
      projectJournalStore: new SqliteProjectJournalStore(join(dir, "journal.sqlite")),
      externalAssetProviders: externalAssetLibraryRegistryOf([
        { read: fixture.readPort(), publication: fixture.publicationPort() },
      ]),
      externalAssetBridgeStore: new SqliteExternalAssetBridgeStore(join(dir, "bridge.sqlite")),
    });
    first.controller.start({ projectId: PROJECT_ID, goal: "G", headCommit: HEAD, tasks: [taskSpec("task-a")] });
    const reference = await first.externalAssets!.prepareReference({
      projectId: PROJECT_ID,
      providerId: FIXTURE_PROVIDER_ID,
      assetId: "paper-1",
      contentDigest: revision.contentDigest,
    });
    if (reference.status !== "PREPARED") throw new Error("expected a prepared reference");
    await first.externalAssets!.commitReference(reference.candidate);
    await first.dispose();
    fixture.close();

    // Restart WITHOUT the provider: an empty registry and the SAME association store.
    const restarted = installPalimpsest({ tools: { register: () => undefined } }, {
      projectId: PROJECT_ID,
      databasePath: join(dir, "state.sqlite"),
      ordariumDatabasePath: join(dir, "ordarium.sqlite"),
      clock: () => "2026-09-16T00:00:00Z",
      git: new FakeGitPort(HEAD),
      projectAssociationStore: new SqliteProjectAssetAssociationStore(join(dir, "associations.sqlite")),
      projectJournalStore: new SqliteProjectJournalStore(join(dir, "journal.sqlite")),
      externalAssetProviders: emptyExternalAssetLibraryRegistry(),
      externalAssetBridgeStore: new SqliteExternalAssetBridgeStore(join(dir, "bridge.sqlite")),
    });
    restarted.controller.start({ projectId: PROJECT_ID, goal: "G", headCommit: HEAD, tasks: [taskSpec("task-a")] });
    CLOSERS.push(async () => {
      await restarted.dispose();
    });
    const view = await restarted.externalAssets!.resolve(PROJECT_ID);
    expect(view.external).toHaveLength(1);
    expect(view.external[0]!.resolution).toBe("PROVIDER_UNAVAILABLE");
    expect(view.external[0]!.referencedDigest).toBe(revision.contentDigest);
  });
});

/* -------------------------------------------------------------------------- *
 * Gate-review hardening (G10-AE review findings R-01 … R-05)
 *
 * The campaign's adversarial gate review broke five claims. Each test below is
 * the review's own attack, executed against the fix: the assertions fail on the
 * pre-fix code and pass on the fixed code, so they are regressions, not
 * restatements.
 * -------------------------------------------------------------------------- */

describe("G10-AE gate-review hardening", () => {
  it("R-01: a provider that reports the referenced digest but hands over DIFFERENT text is refused", async () => {
    const rig = makePlaneRig();
    const revision = rig.fixture.addRevision({
      assetId: "paper-1",
      assetType: "Paper",
      title: "Real title",
      body: DEFAULT_TEXT,
    });
    rig.fixture.mode.substituteText = true;
    const prepared = await rig.service.prepareImport({
      projectId: PROJECT_ID,
      externalRef: materializeExternalAssetStableRef({
        providerId: FIXTURE_PROVIDER_ID,
        assetId: "paper-1",
        contentDigest: revision.contentDigest,
      }),
      journalKind: "REFERENCE_NOTE",
      title: "Imported",
    });
    // The provider echoed the genuine digest while returning different bytes; the
    // plane hashes what it HOLDS, so the substitution is visible and blocks.
    expect(prepared.status).toBe("DENIED");
    if (prepared.status !== "DENIED") throw new Error("unreachable");
    expect(prepared.reason).toBe("digest_mismatch");
    expect(await rig.journal.replay(PROJECT_ID)).toEqual([]);
    expect(rig.bridge.list(PROJECT_ID)).toEqual([]);
  });

  it("R-02: a hand-built import candidate cannot attach external provenance without the provider", async () => {
    const rig = makePlaneRig();
    // A candidate anyone can recompute: no provider is consulted to produce it.
    const text = "text the provider never returned";
    const contentDigest = createHash("sha256").update(text, "utf8").digest("hex");
    const externalRef = materializeExternalAssetStableRef({
      providerId: "leaky",
      assetId: "paper-1",
      contentDigest,
    });
    const candidate = materializeExternalAssetImportCandidate({
      projectId: PROJECT_ID,
      externalRef,
      providerDefinitionDigest: "c".repeat(64),
      journalKind: "NEGATIVE_RESULT",
      title: "Forged provenance",
      text,
      textDigest: contentDigest,
      createdAt: rig.clock(),
    });
    const committed = await rig.service.commitImport(candidate);
    // The provider is not configured in this deployment, so the first commit
    // refuses and NOTHING is written.
    expect(committed.status).toBe("STALE_IMPORT_CANDIDATE");
    expect(await rig.journal.replay(PROJECT_ID)).toEqual([]);
    expect(rig.bridge.list(PROJECT_ID)).toEqual([]);
  });

  it("R-02b: a configured provider that no longer resolves the revision blocks a first commit", async () => {
    const rig = makePlaneRig();
    const revision = rig.fixture.addRevision({
      assetId: "paper-1",
      assetType: "Paper",
      title: "T",
      body: DEFAULT_TEXT,
    });
    const externalRef = materializeExternalAssetStableRef({
      providerId: FIXTURE_PROVIDER_ID,
      assetId: "paper-1",
      contentDigest: revision.contentDigest,
    });
    const candidate = materializeExternalAssetImportCandidate({
      projectId: PROJECT_ID,
      externalRef,
      providerDefinitionDigest: rig.fixture.definition.digest,
      journalKind: "IDEA",
      title: "T",
      text: DEFAULT_TEXT,
      textDigest: revision.contentDigest,
      createdAt: rig.clock(),
    });
    // The provider loses the revision between prepare and commit.
    rig.fixture.mode.unavailable = true;
    const committed = await rig.service.commitImport(candidate);
    expect(committed.status).toBe("STALE_IMPORT_CANDIDATE");
    expect(await rig.journal.replay(PROJECT_ID)).toEqual([]);
    // And replays are unaffected: the same call against an ALREADY committed
    // import stays a pure replay once the provider comes back.
    rig.fixture.mode.unavailable = false;
    const first = await rig.service.commitImport(candidate);
    expect(first.status).toBe("COMMITTED");
    rig.fixture.mode.unavailable = true;
    const replayed = await rig.service.commitImport(candidate);
    expect(replayed.status).toBe("COMMITTED");
    if (replayed.status !== "COMMITTED") throw new Error("unreachable");
    expect(replayed.replayed).toBe(true);
    expect(await journalEntries(rig.journal)).toHaveLength(1);
  });

  it("R-03: publication refuses a project this deployment does not hold", async () => {
    const rig = makePlaneRig();
    const entry = materializeProjectJournalEntry({
      projectId: PROJECT_ID,
      kind: "IDEA",
      title: "SECRET TITLE",
      body: "SECRET BODY",
      provenance: "p",
      createdAt: rig.clock(),
    });
    await rig.journalPort.append(entry);
    // The deployment stops holding the project (a restart without it, a foreign id).
    rig.setBasis(undefined);
    await expect(
      rig.service.preparePublication({
        projectId: PROJECT_ID,
        providerId: FIXTURE_PROVIDER_ID,
        targetAssetType: "Note",
        journalEntryId: entry.entryId,
      }),
    ).rejects.toThrow(/is not held by this deployment/u);
    // The entry's own content never even reaches a caller-visible preview: nothing
    // was prepared, so nothing could be approved or sent.
    expect(rig.bridge.list(PROJECT_ID)).toEqual([]);
  });

  it("R-03b: an already-approved preview cannot be published for a project the deployment no longer holds", async () => {
    const rig = makePlaneRig({ admission: scriptedAdmission("APPROVE") });
    const entry = materializeProjectJournalEntry({
      projectId: PROJECT_ID,
      kind: "IDEA",
      title: "T",
      body: "B",
      provenance: "p",
      createdAt: rig.clock(),
    });
    await rig.journalPort.append(entry);
    const preview = await rig.service.preparePublication({
      projectId: PROJECT_ID,
      providerId: FIXTURE_PROVIDER_ID,
      targetAssetType: "Note",
      journalEntryId: entry.entryId,
    });
    rig.setBasis(undefined);
    await expect(rig.service.approveAndPublish(preview)).rejects.toThrow(
      /is not held by this deployment/u,
    );
    expect(rig.bridge.list(PROJECT_ID)).toEqual([]);
    expect(rig.fixture.publicationCount()).toBe(0);
  });

  it("R-04: a failure after the external write appends exactly ONE terminal receipt", async () => {
    const rig = makePlaneRig({ admission: scriptedAdmission("APPROVE") });
    const entry = materializeProjectJournalEntry({
      projectId: PROJECT_ID,
      kind: "IDEA",
      title: "T",
      body: "B",
      provenance: "p",
      createdAt: rig.clock(),
    });
    await rig.journalPort.append(entry);
    const preview = await rig.service.preparePublication({
      projectId: PROJECT_ID,
      providerId: FIXTURE_PROVIDER_ID,
      targetAssetType: "Note",
      journalEntryId: entry.entryId,
    });
    // The association owner dies AFTER the external write would land - the §25
    // projection cannot be recorded even though the asset exists externally. That
    // is the window in which the retry path re-enters the terminal write.
    rig.associations.close();
    await expect(rig.service.approveAndPublish(preview)).rejects.toThrow();
    const lineage = rig.bridge
      .lineage(PROJECT_ID, preview.publicationId)
      .map((record) => record.family);
    expect(lineage.filter((family) => family === "EXTERNAL_PUBLICATION_COMMITTED")).toHaveLength(1);
    // The external write itself happened exactly once: no blind retry, no duplicate.
    expect(rig.fixture.publishCalls).toBe(1);
    expect(rig.fixture.publicationCount()).toBe(1);
  });

  it("R-05: the generic workspace writer cannot mint an EXTERNAL_ASSET association", async () => {
    const dir = freshDir("palimpsest-ae-r05-");
    const installed = installPalimpsest({ tools: { register: () => undefined } }, {
      projectId: PROJECT_ID,
      databasePath: join(dir, "state.sqlite"),
      ordariumDatabasePath: join(dir, "ops.sqlite"),
      git: new FakeGitPort(HEAD),
      projectAssociationStore: new SqliteProjectAssetAssociationStore(
        join(dir, "associations.sqlite"),
      ),
      projectJournalStore: new SqliteProjectJournalStore(join(dir, "journal.sqlite")),
      externalAssetProviders: emptyExternalAssetLibraryRegistry(),
    });
    CLOSERS.push(async () => installed.dispose());
    installed.controller.start({
      projectId: PROJECT_ID,
      goal: "g",
      headCommit: HEAD,
      tasks: [taskSpec("t1")],
    });
    const workspace = installed.projectWorkspace;
    expect(workspace).toBeDefined();
    // A caller asserting "published to ghost-provider at digest D" with no provider
    // ever consulted is exactly what the bridge's re-checks exist to prevent.
    await expect(
      workspace!.associateAsset({
        projectId: PROJECT_ID,
        assetKind: "EXTERNAL_ASSET",
        canonicalRef: { kind: "ghost-provider", id: "ghost-asset", digest: "a".repeat(64) },
        associationKind: "PUBLISHED",
        provenance: "forged",
      }),
    ).rejects.toThrow(/external asset bridge/u);
    // Other kinds are unaffected.
    const plain = await workspace!.associateAsset({
      projectId: PROJECT_ID,
      assetKind: "REASONING_CELL",
      canonicalRef: { kind: "reasoning_cell", id: "rc-1" },
      associationKind: "MANUAL",
      provenance: "linked",
    });
    expect(plain.assetKind).toBe("REASONING_CELL");
  });
});


/* -------------------------------------------------------------------------- *
 * HONEST notes
 * -------------------------------------------------------------------------- *
 *
 * HONEST: the plane has no controller and therefore no ProjectIR. The plane-level
 * rig supplies the project scope/basis through the declared
 * `ExternalAssetProjectScopePort`; the install-level tests exercise the REAL
 * ProjectIR-backed basis (`SELECT revision, digest FROM projects`). "No Work
 * mutation" is therefore proven at the install level by diffing the real
 * `projects`/`events` tables and the controller status.
 *
 * HONEST: `§24`'s crash window is reproduced with the provider throwing
 * `SimulatedProcessCrash` immediately AFTER its own database write. The surface
 * shows the recovered outcome because the plane asks the provider (read-only
 * `reconcile`) which asset it holds; the Ordarium operation itself stays
 * dispatched/uncertain and is only finalized by a later invocation. A retry
 * therefore cannot produce a second external asset — asserted on the provider's
 * own row count.
 *
 * HONEST: `resolver.ts` needs a read-only "what revision does the provider hold
 * now" probe to surface §12's "newer revision available". `latestRevision` is an
 * OPTIONAL port extension, NOT a fifth provider capability: when a provider does
 * not implement it the derived view reports nothing rather than guessing.
 *
 * HONEST: the TEST-ONLY provider runs IN-PROCESS, over its OWN separate sqlite
 * database (a different file, a different schema, no shared table with the
 * association/journal stores, the bridge store or the Ordarium ledger). Ownership
 * separation is therefore real at the storage and type level; a separate-PROCESS
 * fixture harness is part of the campaign's §38 gate dogfood, not of this plane.
 */
