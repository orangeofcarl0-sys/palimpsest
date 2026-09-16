/**
 * G10-AE-R §20 — TWO-PROJECT SHARED-STORE BOUNDARY DOGFOOD.
 *
 * Usage: node scripts/scope/aer-boundary-dogfood.mjs   (run `pnpm build` first)
 *
 * ONE physical `SqliteProjectJournalStore` and ONE physical
 * `SqliteProjectAssetAssociationStore`, each holding TWO scopes (project-A,
 * project-B). project-B is seeded by its OWN B-bound installation over the SAME
 * two files (that is what a shared store really looks like); that installation is
 * disposed before the A-bound reads. The A-bound installation then shares BOTH
 * files and is driven through every normal read surface:
 *
 *   - service-level   assets() / journal() / journal(foreign) / projectScopedAssets(foreign)
 *   - HTTP            GET /api/project/assets, /api/project/journal, /api/project/journal?projectId=…
 *   - agent tool      palimpsest_project action=assets (with and without a foreign projectId)
 *
 * It asserts:
 *   - every read is A-only (no B title/body/association appears anywhere);
 *   - a foreign id FAILS closed everywhere it is asked for (typed refusal, real
 *     error response — never a 200 with an empty/silent list);
 *   - B is still PHYSICALLY present: raw sqlite rows AND a direct store handle
 *     (`store.projects()` returns both scopes) — the PSI-A09 asymmetry;
 *   - the external-asset VIEW cannot resolve B's associations from the shared store.
 *
 * CLOSED IN AE-R: the bridge's own `installed.externalAssets.resolve(projectId)` used
 * to accept any explicit id, so a direct caller could read a foreign scope's
 * EXTERNAL_ASSET associations from a shared store (the spec's §22 partial
 * condition). `resolve` now requires a HELD project basis — the same fence
 * `preparePublication`/`approveAndPublish` already apply — so the check below asserts
 * a typed refusal, and the held project still resolves.
 *
 * The script prints a final `pass=true|false` line and exits non-zero on failure.
 * The temp dir is ALWAYS cleaned up in a `finally`.
 */

import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

const DIST = pathToFileURL(join(import.meta.dirname, "..", "..", "dist", "src")).href;
const PROJECT_A = "project-A";
const PROJECT_B = "project-B";

const B_TITLE = "B-SECRET-TITLE";
const B_BODY = "B-SECRET-BODY";
const B_ASSET_ID = "art-b";
const B_EXT_ASSET_ID = "b-ext";
const B_EXT_TITLE = "B-EXT-TITLE";
const A_TITLE = "A-TITLE";
const A_ASSET_ID = "dec-a";
const A_EXT_ASSET_ID = "a-ext";
const B_MARKERS = [B_TITLE, B_BODY, B_ASSET_ID, B_EXT_ASSET_ID, B_EXT_TITLE];

const { installPalimpsest } = await import(`${DIST}/install.js`);
const { FakeGitPort } = await import(`${DIST}/effects/index.js`);
const { handleApplicationRequest } = await import(`${DIST}/application/http.js`);
const { SqliteProjectAssetAssociationStore, SqliteProjectJournalStore } = await import(
  `${DIST}/project_workspace/index.js`
);
const bridge = await import(`${DIST}/external_assets/index.js`);

const evidence = {};
const failures = [];
const honestNotes = {};

function check(name, condition, detail) {
  const ok = condition === true;
  evidence[name] = { ok, detail };
  if (!ok) failures.push(`${name}: ${detail}`);
  return ok;
}

function leakOf(value) {
  const text = JSON.stringify(value) ?? "";
  return B_MARKERS.filter((marker) => text.includes(marker));
}

/**
 * A machine proof that a read is A-only.
 *
 * The stage review found that this used to assert only the ABSENCE of foreign
 * markers, so a completely empty payload would have passed every "is A-only" check.
 * It now takes an optional `content` expectation — `{ ok, why }` computed from the
 * payload's REAL shape (a reference count, a per-row project id) — so a read that
 * answers nothing fails instead of passing silently. `mentionsA` is reported for
 * context but is deliberately NOT the content rule: several payloads (the derived
 * external section, for one) legitimately never contain the project id as a literal.
 */
function checkAOnly(name, value, detail, content = undefined) {
  const leaked = leakOf(value);
  const text = JSON.stringify(value) ?? "";
  const isA = text.includes(PROJECT_A);
  const contentOk = content === undefined ? true : content.ok;
  return check(
    name,
    leaked.length === 0 && contentOk,
    `${detail} (foreign markers=${JSON.stringify(leaked)}; mentionsA=${isA}; ` +
      `content=${content === undefined ? "not-required" : `${contentOk ? "ok" : "MISSING"} - ${content.why}`})`,
  );
}

/** Every row of a list carries the installed project id. */
function rowsAreProjectA(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const ids = [...new Set(list.map((row) => row?.projectId ?? row?.entry?.projectId ?? row?.asset?.projectId))];
  return {
    ok: list.length > 0 && ids.length === 1 && ids[0] === PROJECT_A,
    why: `${list.length} row(s), project ids ${JSON.stringify(ids)}`,
  };
}

/** The derived workspace view names the installed project and carries its data. */
function viewIsProjectA(view) {
  return { ok: view?.projectId === PROJECT_A, why: `view.projectId=${view?.projectId}` };
}

/**
 * The project's external reference(s) are present. The DERIVED WORKSPACE section is
 * `{references: [...]}` (project_workspace/view.ts) while the bridge's own derived
 * view is a bare array (`external: [...]`), so the count reads both shapes.
 */
function externalSectionHasReferences(view) {
  const external = view?.external;
  const count = Array.isArray(external) ? external.length : (external?.references?.length ?? 0);
  return { ok: count > 0, why: `${count} external reference(s)` };
}

function rawRows(databasePath, sql) {
  const database = new DatabaseSync(databasePath);
  try {
    return JSON.stringify(database.prepare(sql).all());
  } finally {
    database.close();
  }
}

async function refusalOf(operation) {
  try {
    const value = await operation();
    return { refused: false, value };
  } catch (error) {
    return { refused: true, name: error?.name ?? "Error", kind: error?.kind ?? "-", message: error?.message ?? String(error) };
  }
}

/* -------------------------------------------------------------------------- *
 * A minimal TEST provider (an inline stand-in for a separately-owned library).
 * -------------------------------------------------------------------------- */

function makeLibraryRegistry() {
  const digestOf = (text) => createHash("sha256").update(text, "utf8").digest("hex");
  const assets = {
    [A_EXT_ASSET_ID]: { title: "A external note", body: "A-EXT-BODY" },
    [B_EXT_ASSET_ID]: { title: B_EXT_TITLE, body: "B-EXT-BODY" },
  };
  const definition = bridge.materializeExternalAssetProviderDefinition({
    providerId: "dogfood-boundary-lib",
    version: "1",
    displayName: "G10-AE-R boundary dogfood library",
    capabilities: ["SEARCH", "INSPECT", "MATERIALIZE_TEXT", "PUBLISH"],
    protocolDigest: "9".repeat(64),
  });
  const read = {
    definition,
    async search() {
      return { providerId: definition.providerId, hits: [] };
    },
    async inspect(request) {
      const asset = assets[request.assetId];
      if (asset === undefined) {
        return { status: "UNAVAILABLE", providerId: definition.providerId, assetId: request.assetId, reason: "not_found", detail: "unknown asset" };
      }
      const digest = digestOf(asset.body);
      if (request.contentDigest !== undefined && request.contentDigest !== digest) {
        return { status: "UNAVAILABLE", providerId: definition.providerId, assetId: request.assetId, requestedDigest: request.contentDigest, reason: "not_found", detail: "digest is not held" };
      }
      return {
        status: "AVAILABLE",
        snapshot: {
          ref: bridge.materializeExternalAssetStableRef({ providerId: definition.providerId, assetId: request.assetId, contentDigest: digest }),
          assetType: "Note",
          title: asset.title,
          tags: [],
          metadata: {},
        },
      };
    },
    async materializeText(stableRef) {
      const asset = assets[stableRef.assetId];
      if (asset === undefined) return undefined;
      return { text: asset.body, contentDigest: stableRef.contentDigest, mediaType: "text/plain" };
    },
    async latestRevision(assetId) {
      const asset = assets[assetId];
      if (asset === undefined) return undefined;
      return { assetId, assetType: "Note", title: asset.title, contentDigest: digestOf(asset.body) };
    },
  };
  const publication = {
    definition,
    semantics: "IDEMPOTENT_BY_PUBLICATION_ID",
    async publish() {
      return { status: "FAILED", reason: "the boundary dogfood never publishes" };
    },
    async reconcile() {
      return { status: "ABSENT_RETRY_SAFE" };
    },
  };
  return bridge.externalAssetLibraryRegistryOf([{ read, publication }]);
}

/* -------------------------------------------------------------------------- *
 * main
 * -------------------------------------------------------------------------- */

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-aer-boundary-"));
  const associationPath = join(dir, "associations.sqlite");
  const journalPath = join(dir, "journal.sqlite");
  const registry = makeLibraryRegistry();
  const installedRigs = [];

  try {
    /* ---- project-B, seeded by its OWN B-bound install over the SHARED files ---- */
    const bInstalled = installPalimpsest({ tools: { register: () => undefined } }, {
      projectId: PROJECT_B,
      databasePath: join(dir, "state-b.sqlite"),
      ordariumDatabasePath: join(dir, "ordarium-b.sqlite"),
      git: new FakeGitPort("b".repeat(40)),
      projectAssociationStore: new SqliteProjectAssetAssociationStore(associationPath),
      projectJournalStore: new SqliteProjectJournalStore(journalPath),
      externalAssetProviders: registry,
      externalAssetBridgeStore: new bridge.SqliteExternalAssetBridgeStore(join(dir, "bridge-b.sqlite")),
    });
    installedRigs.push(bInstalled);
    bInstalled.controller.start({
      projectId: PROJECT_B,
      goal: "B",
      headCommit: "b".repeat(40),
      tasks: [{ task_id: "tb", objective: "b", depends_on: [], write_paths: [], required_artifacts: [] }],
    });
    const bEntry = await bInstalled.projectWorkspace.recordJournalEntry({
      projectId: PROJECT_B, kind: "IDEA", title: B_TITLE, body: B_BODY, provenance: "aer-dogfood",
    });
    await bInstalled.projectWorkspace.associateAsset({
      projectId: PROJECT_B, assetKind: "PRODUCED_ARTIFACT",
      canonicalRef: { kind: "artifact", id: B_ASSET_ID }, associationKind: "MANUAL", provenance: "aer-dogfood",
    });
    const bPrep = await bInstalled.externalAssets.prepareReference({
      projectId: PROJECT_B, providerId: "dogfood-boundary-lib", assetId: B_EXT_ASSET_ID,
    });
    if (bPrep.status === "PREPARED") await bInstalled.externalAssets.commitReference(bPrep.candidate);
    check("project_B_seeded_through_its_own_installation", bPrep.status === "PREPARED", `B external prepare=${bPrep.status}`);
    // dispose() closes the SUPPLIED stores, so the A install may reopen the same files.
    await bInstalled.dispose();
    installedRigs.pop();

    /* ---- the installation under test: bound to project-A, sharing BOTH files ---- */
    const installed = installPalimpsest({ tools: { register: () => undefined } }, {
      projectId: PROJECT_A,
      databasePath: join(dir, "state-a.sqlite"),
      ordariumDatabasePath: join(dir, "ordarium-a.sqlite"),
      git: new FakeGitPort("a".repeat(40)),
      projectAssociationStore: new SqliteProjectAssetAssociationStore(associationPath),
      projectJournalStore: new SqliteProjectJournalStore(journalPath),
      externalAssetProviders: registry,
      externalAssetBridgeStore: new bridge.SqliteExternalAssetBridgeStore(join(dir, "bridge-a.sqlite")),
    });
    installedRigs.push(installed);
    installed.controller.start({
      projectId: PROJECT_A,
      goal: "A",
      headCommit: "a".repeat(40),
      tasks: [{ task_id: "ta", objective: "a", depends_on: [], write_paths: [], required_artifacts: [] }],
    });
    const workspace = installed.projectWorkspace;
    const aEntry = await workspace.recordJournalEntry({
      projectId: PROJECT_A, kind: "IDEA", title: A_TITLE, body: "A-BODY", provenance: "aer-dogfood",
    });
    await workspace.associateAsset({
      projectId: PROJECT_A, assetKind: "DECISION",
      canonicalRef: { kind: "decision", id: A_ASSET_ID }, associationKind: "MANUAL", provenance: "aer-dogfood",
    });
    const aPrep = await installed.externalAssets.prepareReference({
      projectId: PROJECT_A, providerId: "dogfood-boundary-lib", assetId: A_EXT_ASSET_ID,
    });
    if (aPrep.status === "PREPARED") await installed.externalAssets.commitReference(aPrep.candidate);
    check("project_A_installed_share_both_files", aPrep.status === "PREPARED", `A external prepare=${aPrep.status}`);

    const route = async (method, pathname, query) => {
      const result = await handleApplicationRequest({
        application: installed.application, method, pathname, query: new URLSearchParams(query ?? {}), body: undefined,
      });
      if (result === undefined) throw new Error(`no application route for ${method} ${pathname}`);
      return result;
    };

    /* ---- 1. service-level reads ---------------------------------------------- */
    checkAOnly("service_assets_is_A_only", await workspace.assets(), "workspace.assets()", rowsAreProjectA(await workspace.assets()));
    checkAOnly("service_journal_is_A_only", await workspace.journal(), "workspace.journal()", rowsAreProjectA(await workspace.journal()));
    checkAOnly("service_view_is_A_only", await workspace.view(), "derived workspace view", viewIsProjectA(await workspace.view()));
    checkAOnly("service_journal_current_id_is_A_only", await workspace.journal(PROJECT_A), "explicit current project id", rowsAreProjectA(await workspace.journal(PROJECT_A)));
    checkAOnly("service_projectScopedAssets_current_is_A_only", await workspace.projectScopedAssets(PROJECT_A), "explicit current project id", rowsAreProjectA(await workspace.projectScopedAssets(PROJECT_A)));

    const foreignJournal = await refusalOf(() => workspace.journal(PROJECT_B));
    check(
      "service_journal_foreign_fails_closed",
      foreignJournal.refused === true && foreignJournal.kind === "invalid_registration",
      JSON.stringify(foreignJournal),
    );
    const foreignAssets = await refusalOf(() => workspace.projectScopedAssets(PROJECT_B));
    check(
      "service_projectScopedAssets_foreign_fails_closed",
      foreignAssets.refused === true && foreignAssets.kind === "invalid_registration",
      JSON.stringify(foreignAssets),
    );

    /* ---- 2. HTTP routes ------------------------------------------------------ */
    const httpAssets = await route("GET", "/api/project/assets");
    check("http_assets_status_200", httpAssets.status === 200, `status ${httpAssets.status}`);
    checkAOnly("http_assets_is_A_only", httpAssets.body, "GET /api/project/assets", rowsAreProjectA(httpAssets.body?.value ?? httpAssets.body));

    const httpJournal = await route("GET", "/api/project/journal");
    check("http_journal_status_200", httpJournal.status === 200, `status ${httpJournal.status}`);
    checkAOnly("http_journal_is_A_only", httpJournal.body, "GET /api/project/journal", rowsAreProjectA(httpJournal.body?.value ?? httpJournal.body));

    const httpCurrent = await route("GET", "/api/project/journal", { projectId: PROJECT_A });
    check("http_journal_current_id_status_200", httpCurrent.status === 200, `status ${httpCurrent.status}`);
    checkAOnly("http_journal_current_id_is_A_only", httpCurrent.body, `GET /api/project/journal?projectId=${PROJECT_A}`, rowsAreProjectA(httpCurrent.body?.value ?? httpCurrent.body));

    const httpForeign = await route("GET", "/api/project/journal", { projectId: PROJECT_B });
    check(
      "http_journal_foreign_fails_closed",
      httpForeign.status !== 200 && (httpForeign.body?.error?.detail ?? "").includes(PROJECT_B),
      `status ${httpForeign.status}, body ${JSON.stringify(httpForeign.body).slice(0, 160)}`,
    );
    check("http_journal_foreign_leaks_nothing", leakOf(httpForeign.body).length === 0, JSON.stringify(leakOf(httpForeign.body)));

    /* ---- 3. agent tool ------------------------------------------------------- */
    const tool = installed.tools.find((candidate) => candidate.name === "palimpsest_project");
    if (tool === undefined) {
      check("agent_tool_assets", false, "palimpsest_project is not registered");
    } else {
      const listed = await tool.execute({ action: "assets" }, {});
      checkAOnly("agent_tool_assets_is_A_only", listed, "palimpsest_project action=assets", rowsAreProjectA(listed));
      // G10-AE-R §9/§15: a foreign projectId on ANY action is REFUSED, never silently
      // ignored. Before the fix the read actions dropped the parameter and answered
      // with A's assets, so a caller naming project-B could not tell it had been
      // ignored — the "hide the violation" shape the stage forbids.
      let foreignToolOutcome;
      try {
        const withForeignId = await tool.execute({ action: "assets", projectId: PROJECT_B }, {});
        foreignToolOutcome = `ANSWERED (leak=${JSON.stringify(leakOf(withForeignId))})`;
      } catch (error) {
        foreignToolOutcome = `${error?.name}: ${error?.message}`;
      }
      check(
        "agent_tool_with_foreign_id_is_refused_not_ignored",
        foreignToolOutcome.includes(PROJECT_B) && !foreignToolOutcome.startsWith("ANSWERED"),
        foreignToolOutcome,
      );
      const actions = tool.parameters?.properties?.action?.enum ?? [];
      check(
        "agent_tool_has_no_global_enumeration_action",
        !actions.some((action) => ["all_projects", "global_assets", "workspace_scan"].includes(action)),
        JSON.stringify(actions),
      );
    }

    /* ---- 4. B is still PHYSICALLY present (PSI-A09 asymmetry) ---------------- */
    const rawJournal = rawRows(journalPath, "SELECT scope_id FROM project_journal_events");
    const rawAssociations = rawRows(associationPath, "SELECT scope_id FROM project_asset_association_events");
    check(
      "shared_store_physically_holds_B_rows",
      rawJournal.includes(PROJECT_B) && rawAssociations.includes(PROJECT_B),
      `journal scopes=${rawJournal}, association scopes=${rawAssociations}`,
    );
    const directAssociations = new SqliteProjectAssetAssociationStore(associationPath);
    const directJournal = new SqliteProjectJournalStore(journalPath);
    try {
      const associationScopes = [...(await directAssociations.projects())].sort();
      const journalScopes = [...(await directJournal.projects())].sort();
      check(
        "direct_store_owner_can_enumerate_both_scopes",
        associationScopes.join(",") === [PROJECT_A, PROJECT_B].sort().join(",") &&
          journalScopes.join(",") === [PROJECT_A, PROJECT_B].sort().join(","),
        `association scopes=[${associationScopes}], journal scopes=[${journalScopes}]`,
      );
      const replayedB = await directAssociations.replay(PROJECT_B);
      check(
        "direct_store_owner_can_replay_B",
        JSON.stringify(replayedB).includes(B_ASSET_ID),
        `${replayedB.length} B event(s) readable by the store owner`,
      );
    } finally {
      directAssociations.close();
      directJournal.close();
    }

    /* ---- 5. the external-asset VIEW cannot resolve B from the shared store ---- */
    const view = await workspace.view();
    checkAOnly("external_view_is_A_only", view.external, "workspace external section", externalSectionHasReferences(view));
    check(
      "external_view_resolves_only_the_installed_project",
      (view.external?.references ?? []).length === 1 && view.external.references[0].assetId === A_EXT_ASSET_ID,
      `references=${JSON.stringify((view.external?.references ?? []).map((reference) => reference.assetId))}`,
    );
    const resolvedA = await installed.externalAssets.resolve(PROJECT_A);
    checkAOnly("external_resolve_current_project_is_A_only", resolvedA, "externalAssets.resolve(project-A)", externalSectionHasReferences(resolvedA));
    check(
      "external_resolve_current_project_has_A_reference",
      resolvedA.external.map((reference) => reference.assetId).join(",") === A_EXT_ASSET_ID,
      JSON.stringify(resolvedA.external.map((reference) => reference.assetId)),
    );

    // CLOSED IN AE-R: the plane-level resolve(foreignId) is refused. This was the
    // last foreign read in the stage; it is asserted, not merely noted.
    let foreignResolve = "no error";
    try {
      const resolvedForeign = await installed.externalAssets.resolve(PROJECT_B);
      foreignResolve = JSON.stringify(resolvedForeign.external.map((reference) => reference.assetId));
    } catch (error) {
      foreignResolve = `${error?.kind ?? error?.name}: ${error?.message ?? String(error)}`;
    }
    check(
      "external_resolve_refuses_a_project_the_deployment_does_not_hold",
      foreignResolve.startsWith("unknown_project:"),
      foreignResolve,
    );
    // What the Project Workspace exposes stays A-only regardless of the plane read.
    checkAOnly("workspace_external_view_never_uses_the_foreign_resolve", view.external, "workspace external section (A-bound)", externalSectionHasReferences(view));

    /* ---- 6. no cross-project read through the reconcile/management faces ----- */
    const history = await route("GET", "/api/project/history");
    checkAOnly("management_history_is_A_only", history.body, "GET /api/project/history");
    check(
      "shared_db_is_not_a_shared_semantic_scope",
      rawJournal.includes(PROJECT_B) && leakOf(view).length === 0 && leakOf(await workspace.assets()).length === 0,
      "the raw store holds B while every A-bound read is B-free",
    );

    void aEntry;
    void bEntry;
  } finally {
    for (const rig of installedRigs.splice(0)) {
      try {
        await rig.dispose();
      } catch {
        /* best effort */
      }
    }
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* Windows may hold a SQLite handle briefly; the temp dir is disposable. */
    }
  }

  const summary = {
    evidence,
    // Empty because the one honest note this script used to carry — the plane-level
    // `resolve(foreignId)` read — is now CLOSED and is asserted above as
    // `external_resolve_refuses_a_project_the_deployment_does_not_hold`.
    honestNotes,
    failures,
    pass: failures.length === 0,
  };
  console.log(JSON.stringify(summary, null, 2));
  console.log(`pass=${failures.length === 0}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

await main();
