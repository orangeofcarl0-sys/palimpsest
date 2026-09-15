/**
 * G10-V Project Workspace — browser E2E over the REAL built product stack.
 *
 * Browser → dist/web bundle → real serveOrchestration (typed /api/project/* and
 * /api/manage/* routes) → real ProjectWorkspaceService / ProjectManagementService → the
 * real Work ledger (ProjectIR + scheduler projection) plus the two append-only histories
 * (ProjectAssetAssociation, ProjectJournal) and the deployment-local operator preference
 * store. Nothing about the workspace or the management layer is mocked.
 *
 * The synthetic project is seeded through the PUBLIC application/workspace surface before
 * any browser action (setup, never the subject under test): a goal with two requirements,
 * one appended decision, two tasks, one journal OPEN_QUESTION, one associated produced
 * artifact, and management involvement ASSIST.
 *
 * The one honest gap this suite reports: the management surface exposes a single step route
 * and no canonical management-action history, so "recent management actions" on the
 * Management tab is UI session state, and "Preview step" is the UNCONFIRMED step (the same
 * deterministic policy evaluation a confirmed step would run).
 */

import { expect, test } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { installPalimpsest } from "../dist/src/advanced.js";
import {
  SqliteManagementPreferenceStore,
  SqliteProjectAssetAssociationStore,
  SqliteProjectJournalStore,
} from "../dist/src/advanced.js";
import { serveOrchestration } from "../dist/src/serve.js";

const TOKEN = "e2e-project";
const PROJECT_ID = "e2e-project";
const GOAL = "Ship the durable project workspace";
const REQUIREMENT_1 = "The workspace derives from canonical owners, never a copy";
const REQUIREMENT_2 = "Open loops are never work tasks";
const DECISION_STATEMENT = "Associations are append-only links, not asset copies";
const DECISION_RATIONALE = "Ownership must stay with the canonical subsystem";
const JOURNAL_TITLE = "Does the derived view need a cache?";
const ASSET_ID = "artifact-1";
const ASSET_PROVENANCE = "e2e seed provenance";
/** controller.start mints the genesis revision (0 before this run's decision);
 * the single appended decision mints the revision this suite observes. */
const EXPECTED_REVISION = 1;

interface WorkspaceSession {
  readonly url: string;
  readonly decisionId: string;
  close(): Promise<void>;
}

async function startWorkspace(): Promise<WorkspaceSession> {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-e2e-project-"));
  const associations = new SqliteProjectAssetAssociationStore(join(dir, "associations.sqlite"));
  const journal = new SqliteProjectJournalStore(join(dir, "journal.sqlite"));
  const management = new SqliteManagementPreferenceStore(join(dir, "management.sqlite"));

  const installed = installPalimpsest({ tools: { register: () => undefined } }, {
    projectId: PROJECT_ID,
    databasePath: join(dir, "state.sqlite"),
    ordariumDatabasePath: join(dir, "ordarium.sqlite"),
    projectAssociationStore: associations,
    projectJournalStore: journal,
    managementPreferenceStore: management,
  });

  // Seed the synthetic project through the PUBLIC application surface: the
  // workspace application fills the project id from the installation wiring, so
  // no caller-supplied project scope is trusted here.
  const workspace = installed.application.projectWorkspace!;
  installed.controller.start({
    projectId: PROJECT_ID,
    goal: GOAL,
    requirements: [
      { requirement_id: "req-1", statement: REQUIREMENT_1, priority: "critical", acceptance_refs: [] },
      { requirement_id: "req-2", statement: REQUIREMENT_2, priority: "high", acceptance_refs: [] },
    ],
    tasks: [
      { task_id: "task-1", objective: "Derive the workspace view.", depends_on: [], write_paths: ["src/view.ts"], required_artifacts: ["src/view.ts"] },
      { task_id: "task-2", objective: "Derive open loops.", depends_on: ["task-1"], write_paths: ["src/loops.ts"], required_artifacts: ["src/loops.ts"] },
    ],
  });
  const decision = await workspace.appendDecision({
    statement: DECISION_STATEMENT,
    rationale: DECISION_RATIONALE,
    evidenceIds: [],
  });
  await workspace.recordJournalEntry({
    kind: "OPEN_QUESTION",
    title: JOURNAL_TITLE,
    body: "The derived view is recomputed per read; is a cache needed before it is?",
    provenance: "e2e-seed",
  });
  await workspace.associateAsset({
    assetKind: "PRODUCED_ARTIFACT",
    canonicalRef: { kind: "artifact", id: ASSET_ID },
    associationKind: "DERIVED_FROM_WORK",
    provenance: ASSET_PROVENANCE,
  });
  await management.set({ projectId: PROJECT_ID, involvement: "ASSIST", updatedBy: "e2e-operator" });

  const handle = await serveOrchestration(installed.controller, {
    host: "127.0.0.1",
    port: 0,
    token: TOKEN,
    application: installed.application,
  });

  return {
    url: handle.url,
    decisionId: decision.decision.decision_id,
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

test.describe("G10-V Project Workspace", () => {
  let session: WorkspaceSession;

  test.beforeAll(async () => {
    session = await startWorkspace();
  });
  test.afterAll(async () => {
    await session.close();
  });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token: string) => {
      window.localStorage.setItem("palimpsest-token", token);
    }, TOKEN);
  });

  test("E2E-PROJECT-01: project is the default landing and every tab shows derived state", async ({ page }) => {
    // 1. Project is the DEFAULT landing (not the Work graph) because this installation
    //    wires the derived workspace surface.
    await page.goto(session.url);
    await expect(page.getByText("palimpsest Project Workspace")).toBeVisible();
    await expect(page.getByTestId("project-home")).toBeVisible();
    await expect(page.getByText("palimpsest 图面")).toHaveCount(0);

    // 2. Overview: goal, ProjectIR revision, requirements, management mode.
    await expect(page.getByTestId("overview-goal")).toContainText(GOAL);
    await expect(page.getByTestId("overview-revision")).toContainText(`revision ${EXPECTED_REVISION}`);
    await expect(page.getByTestId("overview-requirement")).toHaveCount(2);
    await expect(page.getByTestId("overview-requirements")).toContainText(REQUIREMENT_1);
    await expect(page.getByTestId("overview-decisions")).toContainText(DECISION_STATEMENT);
    await expect(page.getByTestId("overview-work-state")).toContainText("RUNNING");
    await expect(page.getByTestId("overview-involvement")).toContainText("ASSIST");
    // The next attention item comes from the derived open loops.
    await expect(page.getByTestId("overview-attention-item")).toBeVisible();

    // 3. Work: the derived task list (read-only, no copy).
    await page.getByRole("button", { name: "Work", exact: true }).click();
    await expect(page.getByTestId("work-task-row")).toHaveCount(2);
    await expect(page.getByTestId("work-task-row").first()).toContainText("task-1");
    await expect(page.getByTestId("work-artifacts")).toContainText(ASSET_ID);

    // 4. Assets: owner + canonical ref + association provenance + derived state.
    await page.getByRole("button", { name: "Assets", exact: true }).click();
    const assetCard = page.getByTestId("asset-card").first();
    await expect(assetCard).toBeVisible();
    await expect(assetCard.getByTestId("asset-owner")).toContainText("Work (controller evidence/artifacts)");
    await expect(assetCard.getByTestId("asset-ref")).toContainText(`artifact:${ASSET_ID}`);
    await expect(assetCard.getByTestId("asset-provenance")).toContainText("DERIVED_FROM_WORK");
    await expect(assetCard.getByTestId("asset-provenance")).toContainText(ASSET_PROVENANCE);
    await expect(assetCard.getByTestId("asset-state")).toContainText("associated");
    await expect(page.getByTestId("assets-open-proof-vault")).toBeVisible();

    // 5. Open Loops: the journal open question, and it is explicitly NOT a work task.
    await page.getByRole("button", { name: "Open Loops", exact: true }).click();
    await expect(page.getByTestId("loops-not-tasks")).toContainText("NOT work tasks");
    await expect(page.getByTestId("loop-row").filter({ hasText: "JOURNAL_OPEN_QUESTION" })).toHaveCount(1);
    await expect(page.getByTestId("loop-row").filter({ hasText: JOURNAL_TITLE })).toHaveCount(1);

    // 6. History: the ProjectIR revision and the decision lineage from the derived summary.
    await page.getByRole("button", { name: "History", exact: true }).click();
    await expect(page.getByTestId("history-revision")).toContainText(`revision ${EXPECTED_REVISION}`);
    await expect(page.getByTestId("history-decision-row")).toContainText(session.decisionId);
    await expect(page.getByTestId("history-associations")).toContainText(ASSET_ID);
    await expect(page.getByTestId("history-journal")).toContainText(JOURNAL_TITLE);

    // 7. Management: two orthogonal axes, the ASSIST policy summary, and a REQUEST-only change.
    await page.getByRole("button", { name: "Management", exact: true }).click();
    await expect(page.getByTestId("management-two-axis")).toHaveText(
      "Work Mode = how work is executed; Management = how proactively Palimpsest manages the project",
    );
    await expect(page.getByTestId("management-work-mode")).toBeVisible();
    await expect(page.getByTestId("management-work-mode")).toContainText("Work Mode");
    await expect(page.getByTestId("management-involvement")).toContainText("ASSIST");
    await expect(page.getByTestId("management-allowed")).toContainText("OBSERVE");
    await expect(page.getByTestId("management-allowed")).toContainText("RECOMMEND");
    await expect(page.getByTestId("management-confirmation")).toContainText("APPROVE_DISCLOSURE");
    await expect(page.getByTestId("management-confirmation")).toContainText("IRREVERSIBLE_EFFECT");

    // A request is NOT a change: the returned status is `requested` and the involvement
    // shown by the surface is unchanged (there is no mode setter on the agent-facing path).
    await page.getByLabel("requested management involvement").selectOption("MANAGE");
    await page.getByTestId("management-request-mode").click();
    await expect(page.getByTestId("management-request-result")).toContainText("requested");
    await expect(page.getByTestId("management-request-result")).toContainText("MANAGE");
    await expect(page.getByTestId("management-involvement")).toContainText("ASSIST");
    // The canonical status route still reports ASSIST (the request persisted nothing).
    await page.getByTestId("project-refresh").click();
    await expect(page.getByTestId("management-involvement")).toContainText("ASSIST");

    // Recommend / Preview step / Step (confirm) all exist and speak only through the
    // one step route.
    await expect(page.getByTestId("management-recommend")).toBeVisible();
    await page.getByTestId("management-preview").click();
    await expect(page.getByTestId("management-step-result")).toBeVisible();

    // 8. No autonomy score and no escalation control is rendered anywhere.
    await expect(page.getByText(/score/i)).toHaveCount(0);
    await expect(page.getByText(/ManagerAgent/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /grant|escalat|set mode|apply mode|set involvement/i })).toHaveCount(0);
    await expect(page.getByText(/autonomy score/i)).toHaveCount(0);
  });

  test("E2E-PROJECT-02: the Proof Vault is reachable but secondary, and the debugger still exists", async ({ page }) => {
    await page.goto(session.url);
    // The proof plane is a project-asset deep capability: it is NOT the landing surface, it is
    // reached from the project header, and exiting it returns to the Project surface (not Work).
    await expect(page.getByText("palimpsest Project Workspace")).toBeVisible();
    const proofButton = page.getByTestId("project-proof-vault");
    await expect(proofButton).toHaveText("Proof Vault");
    await proofButton.click();
    await expect(page.getByText("palimpsest Proof Vault")).toBeVisible();
    await page.getByTestId("proof-exit").click();
    await expect(page.getByText("palimpsest Project Workspace")).toBeVisible();
    await expect(page.getByText("palimpsest 图面")).toHaveCount(0);

    // The MultiGraph debugger still exists on the advanced project header.
    await expect(page.getByRole("button", { name: "MultiGraph 调试器" })).toBeVisible();
  });
});
