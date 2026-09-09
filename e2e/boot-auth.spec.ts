/**
 * Spec 36 Suite 1 (§21): boot / auth / polling — the panel's observable
 * freshness behavior over the REAL kernel. Low-level freshness mechanics
 * (build counters, mixed cursors, epoch) stay pinned by the kernel batteries;
 * here we prove only user-visible composition (§25).
 */
import { expect, test, type Page } from "@playwright/test";

import { pageTokenInit, seed, startKernel, type KernelSession, type Scenario } from "./support/kernel";

let session: KernelSession;

const openAuthorized = async (page: Page, scenario: Scenario): Promise<KernelSession> => {
  session = await startKernel();
  await seed(session, scenario);
  await pageTokenInit(session)(page);
  await page.goto(session.url);
  await expect(page.getByText("palimpsest 图面")).toBeVisible();
  return session;
};

test.afterEach(async () => {
  await session?.close();
  session = undefined as unknown as KernelSession;
});

test("E2E-BOOT-01: an empty service loads honestly with no error churn", async ({ page }) => {
  await openAuthorized(page, "empty");
  // The header shows the dash goal (no ProjectIR); the uninitialized state
  // is represented as a STABLE message - the poll churn guard must keep it
  // byte-identical across cycles, never a repeating toast.
  await expect(page.getByText("—", { exact: true })).toBeVisible();
  const message = await page.locator("[data-app-message]").innerText();
  await page.waitForTimeout(4_500);
  await expect(page.locator("[data-app-message]")).toHaveText(message);
  await expect(page.getByText("palimpsest 图面")).toBeVisible();
});

test("E2E-AUTH-01: the token gate blocks, then a valid token admits", async ({ page }) => {
  session = await startKernel();
  await seed(session, "basic");
  // No injected token: the login screen must appear.
  await page.goto(session.url);
  await expect(page.getByText("输入访问令牌")).toBeVisible();
  await expect(page.getByRole("button", { name: "进入" })).toBeVisible();
  // A WRONG token stays locked out.
  await page.getByRole("textbox").fill("wrong-token");
  await page.getByRole("button", { name: "进入" }).click();
  await expect(page.getByText("输入访问令牌")).toBeVisible();
  // The CORRECT token admits into the panel.
  await page.getByRole("textbox").fill(session.token);
  await page.getByRole("button", { name: "进入" }).click();
  await expect(page.getByText("palimpsest 图面")).toBeVisible();
  // The real seeded project is visible behind the real kernel.
  await expect(page.getByText("e2e basic · revision 0")).toBeVisible();
});

test("E2E-POLL-01: unchanged polling keeps the graph displayed without clearing", async ({ page }) => {
  await openAuthorized(page, "basic");
  const node = page.locator('[data-graph-node-key="task-1"]');
  await expect(node).toBeVisible();
  await expect(node).toHaveAttribute("data-graph-state", "READY");
  // At least one unchanged 2s poll cycle: the graph must never blank out.
  await page.waitForTimeout(5_000);
  await expect(node).toBeVisible();
  await expect(node).toHaveAttribute("data-graph-state", "READY");
  await expect(page.getByText("palimpsest 图面")).toBeVisible();
});

test("E2E-POLL-02: UI pause and resume converge the visible scheduler state", async ({ page }) => {
  await openAuthorized(page, "basic");
  await expect(page.getByText("· revision 0")).toBeVisible();
  // Pause through the real control bar: the header gains 已暂停, the button
  // flips to 恢复 (the explicit refresh, not the background poll).
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await expect(page.getByText("· revision 0 · 已暂停")).toBeVisible();
  await expect(page.getByRole("button", { name: "恢复", exact: true })).toBeVisible();
  // Resume: the paused marker disappears again.
  await page.getByRole("button", { name: "恢复", exact: true }).click();
  await expect(page.getByText("· revision 0 · 已暂停")).toBeHidden();
  await expect(page.getByRole("button", { name: "暂停", exact: true })).toBeVisible();
});
