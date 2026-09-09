/**
 * Spec 36 Suite 5 (§27/§28): the main scheduler/system E2E. Proves the
 * executable semantics are not merely a topology drawing: with ACTIVE
 * concurrency = 2, two independent tasks are ACTIVE at the same observable
 * point while the dependent stays blocked - driven entirely through the
 * real UI control bar over the real kernel.
 */
import { expect, test } from "@playwright/test";

import { liveNode, pageTokenInit, seed, startKernel, type KernelSession } from "./support/kernel";

let session: KernelSession;

test.afterEach(async () => {
  await session?.close();
  session = undefined as unknown as KernelSession;
});

test("E2E-READY-SET-01: concurrency=2 runs two tasks simultaneously while the dependent stays blocked", async ({ page }) => {
  session = await startKernel();
  await seed(session, "concurrency2");
  await pageTokenInit(session)(page);
  await page.goto(session.url);
  await expect(page.getByText("palimpsest 图面")).toBeVisible();

  const taskA = liveNode(page, "task-a");
  const taskB = liveNode(page, "task-b");
  const taskC = liveNode(page, "task-c");
  await expect(taskA).toHaveAttribute("data-graph-state", "READY");
  await expect(taskB).toHaveAttribute("data-graph-state", "READY");
  await expect(taskC).toHaveAttribute("data-graph-state", "BLOCKED");

  // Drive the real scheduler step-by-step from the UI: each click is one
  // scheduler decision (activation → attempt batch → fall-through
  // activation → attempt batch), mirrored from the kernel ready-set battery.
  const step = page.getByRole("button", { name: "单步", exact: true });
  await step.click();
  await expect(taskA).toHaveAttribute("data-graph-state", "ACTIVE");
  await step.click(); // attempt batch for task-a
  await step.click(); // fall-through: task-b activates although task-a is in flight
  await expect(taskB).toHaveAttribute("data-graph-state", "ACTIVE");
  await step.click(); // attempt batch for task-b

  // THE property: A=ACTIVE ∧ B=ACTIVE at the same observable point, and the
  // dependent has not moved.
  await expect(taskA).toHaveAttribute("data-graph-state", "ACTIVE");
  await expect(taskB).toHaveAttribute("data-graph-state", "ACTIVE");
  await expect(taskC).toHaveAttribute("data-graph-state", "BLOCKED");

  // The latch is full: a further step changes nothing (decide is null).
  await step.click();
  await expect(taskA).toHaveAttribute("data-graph-state", "ACTIVE");
  await expect(taskB).toHaveAttribute("data-graph-state", "ACTIVE");
  await expect(taskC).toHaveAttribute("data-graph-state", "BLOCKED");
});
