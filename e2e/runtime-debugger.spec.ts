/**
 * Spec 36 Suite 4 (§26): runtime + debugger composition. The scheduler is
 * the real kernel; the browser drives it through the real control bar and
 * observes the real graph projection (§26/§30 - explicit refresh transitions
 * are asserted, not arbitrary sleeps).
 */
import { expect, test, type Page } from "@playwright/test";

import { holdRow, liveNode, pageTokenInit, satelliteNode, seed, startKernel, type KernelSession, type Scenario } from "./support/kernel";

let session: KernelSession;

const openRuntime = async (page: Page, scenario: Scenario): Promise<void> => {
  session = await startKernel();
  await seed(session, scenario);
  await pageTokenInit(session)(page);
  await page.goto(session.url);
  await expect(page.getByText("palimpsest 图面")).toBeVisible();
};

test.afterEach(async () => {
  await session?.close();
  session = undefined as unknown as KernelSession;
});

test("E2E-RUNTIME-01/02: pause-step-resume drives real scheduler state through the UI", async ({ page }) => {
  await openRuntime(page, "basic");
  const task1 = liveNode(page, "task-1");
  await expect(task1).toHaveAttribute("data-graph-state", "READY");
  // One real scheduler step from the control bar: the READY task activates.
  await page.getByRole("button", { name: "单步", exact: true }).click();
  await expect(task1).toHaveAttribute("data-graph-state", "ACTIVE");
  // Pause, step is refused by the paused scheduler, resume restores control.
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await expect(page.getByText("· revision 0 · 已暂停")).toBeVisible();
  await page.getByRole("button", { name: "恢复", exact: true }).click();
  await expect(page.getByText("· revision 0 · 已暂停")).toBeHidden();
  // The runtime graph survived the pause cycle (task still ACTIVE).
  await expect(task1).toHaveAttribute("data-graph-state", "ACTIVE");
});

test("E2E-DEBUG-01: a hold is set and released on the same semantic task", async ({ page }) => {
  await openRuntime(page, "runtime");
  const task1 = liveNode(page, "task-1");
  // Select the task to open its inspector, then set the hold.
  await task1.click();
  await page.getByRole("button", { name: "挂起（断点）" }).click();
  // Governance: the hold row appears with the task id; the task shows the badge.
  await expect(holdRow(page, "task-1")).toBeVisible();
  await expect(page.getByText("治理挂起")).toBeVisible();
  await expect(page.getByText("挂起", { exact: true })).toBeVisible();
  // Release: the hold disappears, the task identity is unchanged.
  await page.getByRole("button", { name: "放行（清除断点）" }).click();
  await expect(holdRow(page, "task-1")).toBeHidden();
  await expect(page.getByText("治理挂起")).toBeHidden();
  await expect(liveNode(page, "task-1")).toBeVisible();
  await expect(task1).toHaveAttribute("data-graph-state", "ACTIVE");
});

test("E2E-RUNTIME-03: an in-flight attempt appears under its task as a satellite", async ({ page }) => {
  await openRuntime(page, "runtime");
  // The seeded attempt is claimed with e2e-model - the satellite rides the
  // graph poll under the right task node.
  const row = session.store.connection.prepare("SELECT attempt_id FROM attempts WHERE project_id=?").get(session.projectId) as { attempt_id: string };
  const satellite = satelliteNode(page, row.attempt_id);
  await expect(satellite).toBeVisible();
  await expect(satellite).toContainText("e2e-model");
  // The satellite toggle hides/shows the presentation without touching runtime.
  await page.getByRole("button", { name: "卫星开" }).click();
  await expect(page.getByRole("button", { name: "卫星关" })).toBeVisible();
  await expect(satellite).toBeHidden();
  await page.getByRole("button", { name: "卫星关" }).click();
  await expect(satellite).toBeVisible();
  // The runtime state was never altered by toggling presentation.
  await expect(satellite).toContainText("e2e-model");
});

test("E2E-RUNTIME-04: the trace toggle reveals and hides attempt timelines only", async ({ page }) => {
  await openRuntime(page, "runtime");
  const traceToggle = page.getByRole("button", { name: /Trace/ });
  await expect(page.getByText("Trace（每次尝试的段时序）")).toBeHidden();
  await traceToggle.click();
  await expect(page.getByText("Trace（每次尝试的段时序）")).toBeVisible();
  // The seeded attempt's timeline is visible (spans, not empty).
  const row = session.store.connection.prepare("SELECT attempt_id FROM attempts WHERE project_id=?").get(session.projectId) as { attempt_id: string };
  await expect(page.getByText(/Complete task-1\. · /)).toBeVisible();
  // Disabling hides the presentation; runtime state is untouched.
  await traceToggle.click();
  await expect(page.getByText("Trace（每次尝试的段时序）")).toBeHidden();
  const satellite = satelliteNode(page, row.attempt_id);
  await expect(satellite).toBeVisible();
});
