/**
 * Spec 36 Suite 3 (§24): the GraphPatch review face over the real kernel
 * (preview → apply is always explicit; stale/invalid patches refuse without
 * touching the draft). Anchors come from the REAL /api/canvas/anchor
 * endpoint - the same surface the panel's architect-instruction copy uses.
 */
import { expect, test, type Page } from "@playwright/test";

import { canvasNode, dragBy, pageTokenInit, readLocalDoc, seed, startKernel, type KernelSession } from "./support/kernel";

let session: KernelSession;

interface CanvasDocShape {
  version: number;
  goal: string;
  identity: { namespace: string; nextNode: number; nextEdge: number };
  nodes: Array<{ key: string; type: string; title: string; x: number; y: number; z: string; task?: Record<string, unknown> }>;
  edges: Array<{ id: string; source: string; target: string; kind: string }>;
  groups: Array<{ id: string; label: string; members: string[] }>;
}

const doc = async (page: Page): Promise<CanvasDocShape> =>
  (await readLocalDoc(page, session.projectId)) as CanvasDocShape;

/** The FULL anchor of the CURRENT draft, from the real anchor endpoint. */
const anchor = async (page: Page): Promise<{ baseRevision: number; baseGraphDigest: string }> => {
  const response = await page.request.post(`${session.url}/api/canvas/anchor`, {
    headers: { authorization: `Bearer ${session.token}` },
    data: { doc: await doc(page) },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as { baseRevision: number; baseGraphDigest: string };
};

const patchJson = (patch: Record<string, unknown>): string => JSON.stringify(patch);

const openPatchPanel = async (page: Page): Promise<void> => {
  await page.getByRole("button", { name: "GraphPatch" }).click();
  await page.getByRole("button", { name: "预览 Patch" }).waitFor({ state: "attached" });
};

const reviewPatch = async (page: Page, patch: Record<string, unknown>): Promise<void> => {
  await page.getByPlaceholder(/GraphPatch/).fill(patchJson(patch));
  await page.getByRole("button", { name: "预览 Patch" }).click();
};

const emptyPatchArrays = {
  addNodes: [],
  removeNodes: [],
  updateNodes: [],
  addEdges: [],
  removeEdges: [],
  updateEdges: [],
  moveScope: [],
};

const openDraft = async (page: Page, draftDoc?: unknown): Promise<void> => {
  session = await startKernel();
  await seed(session, "basic");
  await pageTokenInit(session, draftDoc)(page);
  await page.goto(session.url);
  await expect(page.getByText("palimpsest 图面")).toBeVisible();
  await page.getByRole("button", { name: "手搓模式" }).click();
  await expect(page.getByRole("button", { name: "＋任务" })).toBeVisible();
};

test.afterEach(async () => {
  await session?.close();
  session = undefined as unknown as KernelSession;
});

test("E2E-PATCH-01: a preview is shown first and apply is an explicit action", async ({ page }) => {
  await openDraft(page);
  await page.getByRole("button", { name: "＋任务" }).click();
  await page.getByRole("button", { name: "＋任务" }).click();
  const current = await doc(page);
  const patchAnchor = await anchor(page);
  const patch = {
    ...patchAnchor,
    ...emptyPatchArrays,
    addNodes: [
      {
        id: "n:e2epatch:1",
        kind: "agent",
        label: "补任务",
        scope: "root",
        task: { writePaths: [], requiredArtifacts: [] },
      },
    ],
  };
  await openPatchPanel(page);
  await reviewPatch(page, patch);
  // Preview first: the verdict line and the preview entry, no doc change yet.
  await expect(page.getByText("Patch 可应用（预览如下）")).toBeVisible();
  await expect(page.locator("[data-app-message]")).toBeVisible();
  expect((await doc(page)).nodes).toHaveLength(2);
  // Apply is a separate, explicit action.
  await page.getByRole("button", { name: "应用到草稿" }).click();
  await expect(page.locator("[data-app-message]")).toContainText("Patch 已应用到草稿");
  const applied = await doc(page);
  expect(applied.nodes).toHaveLength(3);
  expect(applied.nodes.find((node) => node.key === "n:e2epatch:1")?.title).toBe("补任务");
  // Surviving semantics untouched.
  expect(applied.nodes.filter((node) => node.type === "task").map((node) => node.key)).toEqual(
    current.nodes.map((node) => node.key).concat("n:e2epatch:1"),
  );
});

test("E2E-PATCH-02: an invalid semantic patch is refused with a visible diagnostic and no draft change", async ({ page }) => {
  await openDraft(page);
  await page.getByRole("button", { name: "＋任务" }).click();
  const before = await doc(page);
  const patchAnchor = await anchor(page);
  const patch = {
    ...patchAnchor,
    ...emptyPatchArrays,
    removeNodes: ["n:missing:99"],
  };
  await openPatchPanel(page);
  await reviewPatch(page, patch);
  await expect(page.getByText("Patch 被拒绝")).toBeVisible();
  await expect(page.getByText(/UNKNOWN_NODE/)).toBeVisible();
  // The draft is byte-unchanged.
  expect(await doc(page)).toEqual(before);
});

test("E2E-PATCH-03: a stale-anchored patch refuses instead of silently applying", async ({ page }) => {
  await openDraft(page);
  await page.getByRole("button", { name: "＋任务" }).click();
  const patchAnchor = await anchor(page);
  const patch = {
    ...patchAnchor,
    ...emptyPatchArrays,
    addNodes: [{ id: "n:e2epatch:9", kind: "agent", label: "过时补任务", scope: "root", task: { writePaths: [], requiredArtifacts: [] } }],
  };
  // The draft moves on semantically AFTER the patch was written.
  await page.getByRole("button", { name: "＋任务" }).click();
  const afterDrift = await doc(page);
  await openPatchPanel(page);
  await reviewPatch(page, patch);
  await expect(page.getByText("Patch 被拒绝")).toBeVisible();
  await expect(page.getByText(/STALE_GRAPH_BASE/)).toBeVisible();
  // No silent application: the refused patch never offers apply, and the
  // drifted draft keeps exactly its own nodes.
  await expect(page.getByRole("button", { name: "应用到草稿" })).toBeHidden();
  expect((await doc(page)).nodes).toHaveLength(afterDrift.nodes.length);
});

test("E2E-PATCH-04: renaming through a patch preserves the stable node key", async ({ page }) => {
  await openDraft(page);
  await page.getByRole("button", { name: "＋任务" }).click();
  await page.getByRole("button", { name: "＋任务" }).click();
  const before = await doc(page);
  const keyA = before.nodes[0]!.key;
  const patchAnchor = await anchor(page);
  const patch = {
    ...patchAnchor,
    ...emptyPatchArrays,
    updateNodes: [{ id: keyA, label: "任务甲·改" }],
  };
  await openPatchPanel(page);
  await reviewPatch(page, patch);
  await expect(page.getByText("Patch 可应用（预览如下）")).toBeVisible();
  await page.getByRole("button", { name: "应用到草稿" }).click();
  const after = await doc(page);
  // Same definition identity, new title - update, never remove+add.
  expect(after.nodes.find((node) => node.key === keyA)?.title).toBe("任务甲·改");
  expect(after.nodes.map((node) => node.key)).toEqual(before.nodes.map((node) => node.key));
  expect(after.identity).toEqual(before.identity);
});

test("E2E-PATCH-05: a semantic-only patch preserves surviving positions and the visual group", async ({ page }) => {
  await openDraft(page);
  await page.getByRole("button", { name: "＋任务" }).click();
  await page.getByRole("button", { name: "＋任务" }).click();
  await page.getByRole("button", { name: "＋任务" }).click();
  let current = await doc(page);
  const [keyA, keyB] = current.nodes.map((node) => node.key);
  // Move two nodes to irregular positions with real drags, then group them.
  await dragBy(page, canvasNode(page, keyB!), 260, 220);
  await dragBy(page, canvasNode(page, keyA!), 120, 60);
  const before = await doc(page);
  await page.getByRole("button", { name: "＋分组" }).click();
  const memberSelect = page.locator("select").filter({ hasText: "＋ 加入成员…" });
  await memberSelect.selectOption(keyA!);
  await memberSelect.selectOption(keyB!);
  const grouped = await doc(page);
  expect(grouped.groups).toHaveLength(1);
  const groupId = grouped.groups[0]!.id;

  const boxA = await canvasNode(page, keyA!).boundingBox();
  const patchAnchor = await anchor(page);
  const patch = {
    ...patchAnchor,
    ...emptyPatchArrays,
    addNodes: [{ id: "n:e2epatch:5", kind: "agent", label: "语义补节点", scope: "root", task: { writePaths: [], requiredArtifacts: [] } }],
  };
  await openPatchPanel(page);
  await reviewPatch(page, patch);
  await page.getByRole("button", { name: "应用到草稿" }).click();
  const after = await doc(page);
  // Surviving nodes keep their irregular x/y byte-for-byte.
  for (const node of before.nodes) {
    const kept = after.nodes.find((entry) => entry.key === node.key)!;
    expect([kept.x, kept.y]).toEqual([node.x, node.y]);
  }
  // The visual group survives verbatim; the new node is present.
  expect(after.groups).toEqual(grouped.groups);
  expect(after.groups.find((group) => group.id === groupId)!.members.sort()).toEqual([keyA, keyB].sort());
  expect(after.nodes.find((node) => node.key === "n:e2epatch:5")).toBeDefined();
  // DOM geometry agrees with the persisted positions (rendering tolerance).
  const boxAAfter = await canvasNode(page, keyA!).boundingBox();
  expect(Math.abs(boxAAfter!.x - boxA!.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(boxAAfter!.y - boxA!.y)).toBeLessThanOrEqual(2);
});

test("E2E-PATCH-06: a fresh node lands in a free grid cell without moving anything", async ({ page }) => {
  // The default placement grid's first row is occupied by seeded nodes.
  const seededDoc: CanvasDocShape = {
    version: 3,
    goal: "patch grid",
    identity: { namespace: "grid", nextNode: 5, nextEdge: 1 },
    nodes: [
      { key: "n:grid:1", type: "task", title: "任务一", x: 80, y: 80, z: "root", task: {} },
      { key: "n:grid:2", type: "task", title: "任务二", x: 294, y: 80, z: "root", task: {} },
      { key: "n:grid:3", type: "task", title: "任务三", x: 508, y: 80, z: "root", task: {} },
      { key: "n:grid:4", type: "task", title: "任务四", x: 722, y: 80, z: "root", task: {} },
    ],
    edges: [],
    groups: [],
  };
  await openDraft(page, seededDoc);
  const before = await doc(page);
  const patchAnchor = await anchor(page);
  const patch = {
    ...patchAnchor,
    ...emptyPatchArrays,
    addNodes: [{ id: "n:e2epatch:6", kind: "agent", label: "挤进来的节点", scope: "root", task: { writePaths: [], requiredArtifacts: [] } }],
  };
  await openPatchPanel(page);
  await reviewPatch(page, patch);
  await page.getByRole("button", { name: "应用到草稿" }).click();
  const after = await doc(page);
  expect(after.nodes).toHaveLength(5);
  const fresh = after.nodes.find((node) => node.key === "n:e2epatch:6")!;
  // Old nodes did not move (no global relayout).
  for (const node of before.nodes) {
    const kept = after.nodes.find((entry) => entry.key === node.key)!;
    expect([kept.x, kept.y]).toEqual([node.x, node.y]);
  }
  // The fresh node does not obviously overlap any survivor: node rects
  // (190×56 + rendering margin) must not intersect.
  const NODE_W = 190;
  const NODE_H = 56;
  const intersects = (a: { x: number; y: number }, b: { x: number; y: number }): boolean =>
    a.x < b.x + NODE_W + 8 && b.x < a.x + NODE_W + 8 && a.y < b.y + NODE_H + 8 && b.y < a.y + NODE_H + 8;
  for (const node of before.nodes) {
    expect(intersects(fresh, node)).toBe(false);
  }
});
