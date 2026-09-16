/**
 * G10-AE-R AER0 — the mandatory baseline reproductions (spec §3, A…E).
 *
 * ONE physical Journal store and ONE physical Association store each holding TWO
 * project scopes (project-A, project-B), with an installed Project Workspace
 * bound to project-A. Every case asks the same question: can the A-bound facade
 * read B?
 *
 * Run: node scripts/scope/aer0-repro.mjs
 * Exit code 0 = the reproductions ran (it does NOT assert isolation; on the
 * baseline it PRINTS the leak, which is the point).
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const DIST = pathToFileURL(join(import.meta.dirname, "..", "..", "dist", "src")).href;
const PROJECT_A = "project-A";
const PROJECT_B = "project-B";

const { installPalimpsest } = await import(`${DIST}/install.js`);
const { FakeGitPort } = await import(`${DIST}/effects/index.js`);
const { SqliteProjectAssetAssociationStore } = await import(
  `${DIST}/project_workspace/association.js`
);
const { SqliteProjectJournalStore } = await import(`${DIST}/project_workspace/journal.js`);
const { serveOrchestration } = await import(`${DIST}/serve.js`);

const dir = mkdtempSync(join(tmpdir(), "palimpsest-aer0-"));
const results = [];

/** The typed refusal of a write, or "accepted" when it was not refused. */
async function refusalOf(operation) {
  try {
    await operation();
    return "accepted";
  } catch (error) {
    return `${error?.name ?? "Error"}/${error?.kind ?? "-"}: ${error?.message ?? String(error)}`;
  }
}

function record(id, question, leaked, detail) {
  results.push({ id, question, leaked, detail });
  console.log(`${leaked ? "LEAK  " : "sealed"} ${id}  ${question}\n        ${detail}`);
}

try {
  // ---- ONE physical store pair, TWO scopes ---------------------------------
  // project-B is seeded by its OWN installation over the SAME two files: that is
  // what "a shared store holds another project's data" actually looks like, and it
  // is the situation any later A-bound read must not be able to enumerate.
  const bStorePaths = { journal: join(dir, "journal.sqlite"), associations: join(dir, "associations.sqlite") };
  const bAssociations = new SqliteProjectAssetAssociationStore(bStorePaths.associations);
  const bJournal = new SqliteProjectJournalStore(bStorePaths.journal);
  const bInstall = installPalimpsest({ tools: { register: () => undefined } }, {
    projectId: PROJECT_B,
    databasePath: join(dir, "state-b.sqlite"),
    ordariumDatabasePath: join(dir, "ops-b.sqlite"),
    git: new FakeGitPort("b".repeat(40)),
    projectAssociationStore: bAssociations,
    projectJournalStore: bJournal,
  });
  bInstall.controller.start({
    projectId: PROJECT_B,
    goal: "B",
    headCommit: "b".repeat(40),
    tasks: [
      { task_id: "tb", objective: "b", depends_on: [], write_paths: [], required_artifacts: [] },
    ],
  });
  const entryB = await bInstall.projectWorkspace.recordJournalEntry({
    projectId: PROJECT_B, kind: "IDEA", title: "B-SECRET-TITLE", body: "B-SECRET-BODY", provenance: "aer0",
  });
  const assetB = await bInstall.projectWorkspace.associateAsset({
    projectId: PROJECT_B, assetKind: "PRODUCED_ARTIFACT",
    canonicalRef: { kind: "artifact", id: "art-b" }, associationKind: "MANUAL", provenance: "aer0",
  });
  await bInstall.dispose();
  // `dispose()` closes the SUPPLIED stores (the G10-V discipline), so B's handles
  // are already released and the A install may reopen the same two files.

  // ---- the install under test: bound to project-A, sharing BOTH files ------
  const associationStore = new SqliteProjectAssetAssociationStore(bStorePaths.associations);
  const journalStore = new SqliteProjectJournalStore(bStorePaths.journal);
  const installed = installPalimpsest({ tools: { register: () => undefined } }, {
    projectId: PROJECT_A,
    databasePath: join(dir, "state.sqlite"),
    ordariumDatabasePath: join(dir, "ops.sqlite"),
    git: new FakeGitPort("c".repeat(40)),
    projectAssociationStore: associationStore,
    projectJournalStore: journalStore,
  });
  installed.controller.start({
    projectId: PROJECT_A,
    goal: "A",
    headCommit: "c".repeat(40),
    tasks: [
      { task_id: "ta", objective: "a", depends_on: [], write_paths: [], required_artifacts: [] },
    ],
  });

  const workspace = installed.projectWorkspace;
  if (workspace === undefined) throw new Error("the workspace is not composed");

  // ---- seed A's own scope through the workspace's writers ------------------
  const entryA = await workspace.recordJournalEntry({
    projectId: PROJECT_A, kind: "IDEA", title: "A-TITLE", body: "A-BODY", provenance: "aer0",
  });
  const assetA = await workspace.associateAsset({
    projectId: PROJECT_A, assetKind: "DECISION",
    canonicalRef: { kind: "decision", id: "dec-a" }, associationKind: "MANUAL", provenance: "aer0",
  });
  console.log(`seeded: A journal ${entryA.entryId}, B journal ${entryB.entryId}`);
  console.log(`seeded: A asset ${assetA.associationId}, B asset ${assetB.associationId}`);
  console.log(
    `        (the A-bound WRITE path already refuses B: ` +
      `${await refusalOf(() => workspace.recordJournalEntry({ projectId: PROJECT_B, kind: "IDEA", title: "x", body: "y", provenance: "z" }))})\n`,
  );

  const handle = await serveOrchestration(installed.controller, {
    port: 0,
    token: "aer0",
    application: installed.application,
  });
  const get = async (path) => {
    const response = await fetch(`${handle.url}${path}`, {
      headers: { authorization: "Bearer aer0" },
    });
    return { status: response.status, body: await response.json() };
  };

  const mentionsB = (value) => JSON.stringify(value).includes("B-SECRET") || JSON.stringify(value).includes("art-b");

  // ---- A. GET /api/project/journal ----------------------------------------
  const httpJournal = await get("/api/project/journal");
  record("A", "GET /api/project/journal (no projectId)", mentionsB(httpJournal.body),
    `status ${httpJournal.status}, ${JSON.stringify(httpJournal.body).slice(0, 160)}`);

  // ---- B. GET /api/project/journal?projectId=project-B --------------------
  const httpForeign = await get(`/api/project/journal?projectId=${PROJECT_B}`);
  record("B", `GET /api/project/journal?projectId=${PROJECT_B}`, mentionsB(httpForeign.body),
    `status ${httpForeign.status}, ${JSON.stringify(httpForeign.body).slice(0, 160)}`);

  // ---- C. GET /api/project/assets ----------------------------------------
  const httpAssets = await get("/api/project/assets");
  record("C", "GET /api/project/assets", mentionsB(httpAssets.body),
    `status ${httpAssets.status}, ${JSON.stringify(httpAssets.body).slice(0, 160)}`);

  // ---- D. palimpsest_project action=assets -------------------------------
  const tool = installed.tools.find((candidate) => candidate.name === "palimpsest_project");
  let toolLeak = false;
  let toolDetail = "the palimpsest_project tool is not registered in this installation";
  if (tool !== undefined) {
    const listed = await tool.execute({ action: "assets" }, {});
    toolLeak = mentionsB(listed);
    toolDetail = JSON.stringify(listed).slice(0, 200);
  }
  record("D", "palimpsest_project action=assets", toolLeak, toolDetail);

  // ---- E. projectScopedAssets("project-B") ------------------------------
  let scopedLeak = false;
  let scopedDetail = "";
  try {
    const foreign = await workspace.projectScopedAssets(PROJECT_B);
    scopedLeak = foreign.length > 0;
    scopedDetail = `${foreign.length} association(s) returned for a FOREIGN project`;
  } catch (error) {
    scopedDetail = `rejected: ${error instanceof Error ? error.message : String(error)}`;
  }
  record("E", `projectScopedAssets(${PROJECT_B})`, scopedLeak, scopedDetail);

  // ---- extras the audit must not miss ------------------------------------
  const directAssets = await workspace.assets();
  record("F", "workspace.assets() (service level)", mentionsB(directAssets),
    `${directAssets.length} association(s): ${directAssets.map((a) => a.projectId).join(", ")}`);
  const directJournal = await workspace.journal();
  record("G", "workspace.journal() (service level)", mentionsB(directJournal),
    `${directJournal.length} entr(y/ies): ${directJournal.map((e) => e.entry.projectId).join(", ")}`);
  const view = await workspace.view();
  record("H", "workspace.view() derived workspace", mentionsB(view),
    `projectId=${view.projectId} (the view itself reports ONE project)`);

  await handle.close();
  await installed.dispose();

  const leaked = results.filter((row) => row.leaked).length;
  console.log(`\n=== AER0 baseline: ${leaked}/${results.length} surfaces leak B ===`);
  // the install owns its supplied stores; dispose() closes them.

} finally {
  // Windows keeps a handle on a just-closed sqlite file; a failed cleanup must not
  // hide the reproductions that already printed.
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    console.log(`(temp dir left in place: ${dir})`);
  }
}
