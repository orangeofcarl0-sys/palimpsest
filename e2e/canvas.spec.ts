/**
 * Spec 36 Suite 2 (§22/§23): canvas composition over the real bundle. The
 * draft doc is client-side scratch (localStorage) - semantic assertions read
 * the persisted CanvasDoc; presentation assertions use DOM bounding boxes,
 * never pixels (§20/§23).
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { canvasNode, dragBy, dragOnto, pageTokenInit, readLocalDoc, seed, startKernel, type KernelSession } from "./support/kernel";

let session: KernelSession;

interface CanvasDocShape {
  version: number;
  goal: string;
  identity: { namespace: string; nextNode: number; nextEdge: number };
  nodes: Array<{ key: string; type: string; title: string; x: number; y: number; z: string; task?: { dependsOn?: string[] } }>;
  edges: Array<{ id: string; source: string; target: string; kind: string }>;
  groups: Array<{ id: string; label: string; members: string[] }>;
}

const doc = async (page: Page): Promise<CanvasDocShape> =>
  (await readLocalDoc(page, session.projectId)) as CanvasDocShape;

const openDraft = async (page: Page): Promise<void> => {
  session = await startKernel();
  await seed(session, "basic");
  await pageTokenInit(session)(page);
  await page.goto(session.url);
  await expect(page.getByText("palimpsest 图面")).toBeVisible();
  await page.getByRole("button", { name: "手搓模式" }).click();
  await expect(page.getByRole("button", { name: "＋任务" })).toBeVisible();
};

test.afterEach(async () => {
  await session?.close();
  session = undefined as unknown as KernelSession;
});

test("E2E-CANVAS-01: add, rename and connect tasks land in the persisted doc", async ({ page }) => {
  await openDraft(page);
  await page.getByRole("button", { name: "＋任务" }).click();
  await page.getByRole("button", { name: "＋任务" }).click();
  let current = await doc(page);
  expect(current.nodes).toHaveLength(2);
  const [keyA, keyB] = current.nodes.map((node) => node.key);
  // Deterministic placement stacks fresh nodes 24px apart - separate B by a
  // real drag so both bodies (and their handles) are individually reachable.
  await dragBy(page, canvasNode(page, keyB!), 260, 160);

  // Rename through the inspector.
  await canvasNode(page, keyA!).click();
  await page.getByRole("textbox", { name: "节点标题" }).fill("任务甲");
  current = await doc(page);
  expect(current.nodes.find((node) => node.key === keyA)?.title).toBe("任务甲");

  // Connect A → B by dragging the source handle onto the target handle.
  const sourceHandle = canvasNode(page, keyA!).locator(".react-flow__handle.source");
  const targetHandle = canvasNode(page, keyB!).locator(".react-flow__handle.target");
  await sourceHandle.dragTo(targetHandle);
  current = await doc(page);
  expect(current.edges).toHaveLength(1);
  expect(current.edges[0]).toMatchObject({ source: keyA, target: keyB, kind: "data" });
  // Identity counters advanced monotonically; keys are namespaced (never reused).
  expect(current.identity.nextNode).toBe(3);
  expect(keyA).toMatch(/^n:/);
});

test("E2E-CANVAS-02: deleting a connected, grouped node cleans every incidence", async ({ page }) => {
  await openDraft(page);
  await page.getByRole("button", { name: "＋任务" }).click();
  await page.getByRole("button", { name: "＋任务" }).click();
  let current = await doc(page);
  const [keyA, keyB] = current.nodes.map((node) => node.key);
  await dragBy(page, canvasNode(page, keyB!), 260, 160);
  await canvasNode(page, keyA!).locator(".react-flow__handle.source").dragTo(
    canvasNode(page, keyB!).locator(".react-flow__handle.target"),
  );
  // Group B, then delete B: the edge and the group membership must both go.
  await page.getByRole("button", { name: "＋分组" }).click();
  current = await doc(page);
  const groupId = current.groups[0]!.id;
  await page.locator("select").filter({ hasText: "＋ 加入成员…" }).selectOption(keyB!);
  current = await doc(page);
  expect(current.groups[0]!.members).toEqual([keyB]);
  await canvasNode(page, keyB!).click();
  await page.getByRole("button", { name: "删除此节点" }).click();
  current = await doc(page);
  expect(current.nodes.find((node) => node.key === keyB)).toBeUndefined();
  expect(current.edges).toHaveLength(0);
  expect(current.groups.find((group) => group.id === groupId)!.members).toEqual([]);
  // The canvas stays usable after the deletion.
  await page.getByRole("button", { name: "＋任务" }).click();
  expect((await doc(page)).nodes).toHaveLength(2);
});

test("E2E-CANVAS-03: drag into a subflow re-parents; dragging out returns to root", async ({ page }) => {
  await openDraft(page);
  await page.getByRole("button", { name: "＋任务" }).click();
  await page.getByRole("button", { name: "＋子图" }).click();
  let current = await doc(page);
  const taskKey = current.nodes.find((node) => node.type === "task")!.key;
  const subKey = current.nodes.find((node) => node.type === "subflow")!.key;
  // The subflow was added last and overlaps the task - move IT first.
  await dragBy(page, canvasNode(page, subKey), 320, 200);

  // Drag the task body onto the subflow body: center-inside reassigns scope.
  await dragOnto(page, canvasNode(page, taskKey), canvasNode(page, subKey));
  current = await doc(page);
  expect(current.nodes.find((node) => node.key === taskKey)?.z).toBe(subKey);
  // A joined member folds into its (collapsed) subflow - expand it first.
  await canvasNode(page, subKey).getByRole("button", { name: "展开" }).click();
  await expect(canvasNode(page, taskKey)).toBeVisible();

  // Drag it back out: zoom the pane out first so the drop corner maps to a
  // flow position clearly outside the subflow bounds, then a stepped drag to
  // the pane corner.
  const zoomOut = page.getByRole("button", { name: "Zoom Out" });
  for (let index = 0; index < 3; index += 1) await zoomOut.click();
  const taskEl = canvasNode(page, taskKey);
  const pane = page.locator(".react-flow").first();
  const paneBox = (await pane.boundingBox())!;
  await taskEl.hover();
  await page.mouse.down();
  await page.mouse.move(paneBox.x + 40, paneBox.y + 40, { steps: 10 });
  await page.mouse.up();
  current = await doc(page);
  expect(current.nodes.find((node) => node.key === taskKey)?.z).toBe("root");
});

test("E2E-CANVAS-04: an automatic layout moves only presentation, never semantics", async ({ page }) => {
  await openDraft(page);
  await page.getByRole("button", { name: "＋任务" }).click();
  await page.getByRole("button", { name: "＋任务" }).click();
  const before = await doc(page);
  const beforeByKey = new Map(before.nodes.map((node) => [node.key, node]));

  await page.getByRole("combobox", { name: "画布布局" }).selectOption("force");
  await expect(page.locator("[data-app-message]")).toContainText("布局 力导向 ✓");
  const after = await doc(page);
  expect(after.nodes.map((node) => node.key)).toEqual(before.nodes.map((node) => node.key));
  expect(after.edges).toEqual(before.edges);
  expect(after.identity).toEqual(before.identity);
  // At least one position actually moved (the layout did its job).
  const moved = after.nodes.some((node) => {
    const past = beforeByKey.get(node.key)!;
    return Math.abs(node.x - past.x) > 1 || Math.abs(node.y - past.y) > 1;
  });
  expect(moved).toBe(true);
});

test("E2E-CANVAS-05: export round-trips v3; importing a v2 draft upgrades with preserved keys", async ({ page }) => {
  await openDraft(page);
  await page.getByRole("button", { name: "＋任务" }).click();
  await page.getByRole("button", { name: "＋任务" }).click();

  // Export the current v3 draft through the real download path.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出" }).click();
  const file = await download;
  const exported = JSON.parse(await readFile(await file.path(), "utf8")) as CanvasDocShape;
  expect(exported.version).toBe(3);
  expect(exported.nodes).toHaveLength(2);

  // Import a known-valid v2 draft: explicit upgrade notice, legacy keys kept,
  // payload dependsOn folded into v3 edges.
  const v2Doc = {
    version: 2,
    goal: "legacy v2 draft",
    nodes: [
      { key: "nK1", type: "task", title: "旧任务一", x: 0, y: 0, z: "root", task: { dependsOn: [] } },
      { key: "nK2", type: "task", title: "旧任务二", x: 260, y: 0, z: "root", task: { dependsOn: ["nK1"] } },
    ],
    groups: [],
  };
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-e2e-import-"));
  const v2Path = join(dir, "v2.json");
  writeFileSync(v2Path, JSON.stringify(v2Doc), "utf8");
  await page.locator('input[type="file"]').setInputFiles(v2Path);
  await expect(page.locator("[data-app-message]")).toContainText("已导入 v2 画布并升级到 v3（2 节点，身份原样保留）");
  const upgraded = await doc(page);
  expect(upgraded.nodes.map((node) => node.key)).toEqual(["nK1", "nK2"]);
  expect(upgraded.edges).toHaveLength(1);
  expect(upgraded.edges[0]).toMatchObject({ source: "nK1", target: "nK2" });

  // Import the exported v3 verbatim: no upgrade notice, exact round-trip.
  const v3Path = join(dir, "v3.json");
  writeFileSync(v3Path, JSON.stringify(exported), "utf8");
  await page.locator('input[type="file"]').setInputFiles(v3Path);
  await expect(page.locator("[data-app-message]")).toContainText("已导入画布（2 节点）");
  const reimported = await doc(page);
  expect(reimported.nodes.map((node) => node.key)).toEqual(exported.nodes.map((node) => node.key));
});
