/**
 * PLMP-CANVAS-1 §1.4: layouts. A layout transforms POSITIONS ONLY - the
 * compile output before and after any layout is byte-identical (CANVAS-A09).
 * Root-level nodes are arranged; whenever a root subflow moves, its whole
 * descendant subtree (the `z` chain) translates with it, so containment
 * never breaks. Group boxes are bounds-derived on render and need no care.
 */

import { ROOT_Z, type CanvasDoc, type CanvasNode } from "./doc.js";

export type CanvasLayoutName = "manual" | "flow_lr" | "flow_tb" | "force" | "compact";

const LAYOUTS: ReadonlySet<string> = new Set([
  "manual",
  "flow_lr",
  "flow_tb",
  "force",
  "compact",
]);

const NODE_W = 190;
const NODE_H = 48;
const GAP_X = 90;
const GAP_Y = 70;

/**
 * PLMP-CANVAS-5 INV-C6: the TRANSITIVE descendant set per owner key. The
 * parser guarantees the z forest is acyclic, so the memoized walk is finite;
 * the pre-seeded cache is defense-in-depth that degrades to a partial set
 * instead of hanging if a cyclic doc ever got here unparsed.
 */
function descendantsByOwner(doc: CanvasDoc): Map<string, string[]> {
  const children = new Map<string, string[]>();
  for (const node of doc.nodes) {
    if (node.z === ROOT_Z) continue;
    const bucket = children.get(node.z) ?? [];
    bucket.push(node.key);
    children.set(node.z, bucket);
  }
  const closed = new Map<string, string[]>();
  const walk = (key: string): string[] => {
    const cached = closed.get(key);
    if (cached !== undefined) return cached;
    closed.set(key, []);
    const acc: string[] = [];
    for (const child of children.get(key) ?? []) {
      acc.push(child, ...walk(child));
    }
    closed.set(key, acc);
    return acc;
  };
  for (const key of children.keys()) walk(key);
  return closed;
}

/** Move a root node and translate its whole descendant subtree by the delta. */
function applyMove(nodes: readonly CanvasNode[], key: string, dx: number, dy: number, descendants: Map<string, string[]>): CanvasNode[] {
  if (dx === 0 && dy === 0) return [...nodes];
  const moving = new Set([key, ...(descendants.get(key) ?? [])]);
  return nodes.map((node) =>
    moving.has(node.key) ? { ...node, x: node.x + dx, y: node.y + dy } : node,
  );
}

function layered(doc: CanvasDoc, horizontal: boolean): CanvasDoc {
  const roots = doc.nodes.filter((node) => node.z === ROOT_Z && node.type !== "annotation");
  const byKey = new Map(roots.map((node) => [node.key, node]));
  const docKeys = new Map(doc.nodes.map((node) => [node.key, node]));
  // PLMP-CANVAS-6: dependencies are node keys; only dependencies that land
  // on a root node shape the root layout (nested members follow their
  // subflow's translation).
  const depsOf = (node: CanvasNode): string[] =>
    (node.task?.dependsOn ?? [])
      .map((key) => docKeys.get(key))
      .filter((dep): dep is CanvasNode => dep !== undefined && byKey.has(dep.key))
      .map((dep) => dep.key);
  const depth = new Map<string, number>();
  const visit = (key: string, level: number): void => {
    const known = depth.get(key);
    if (known !== undefined && known >= level) return;
    depth.set(key, level);
    for (const dependent of roots) {
      if (depsOf(dependent).includes(key)) visit(dependent.key, level + 1);
    }
  };
  for (const node of roots) visit(node.key, 0);
  const layers = new Map<number, CanvasNode[]>();
  for (const node of roots) {
    const level = depth.get(node.key) ?? 0;
    const bucket = layers.get(level) ?? [];
    bucket.push(node);
    layers.set(level, bucket);
  }
  const sorted = [...layers.keys()].sort((a, b) => a - b);
  let nodes: readonly CanvasNode[] = doc.nodes;
  const descendants = descendantsByOwner(doc);
  for (const level of sorted) {
    const bucket = layers.get(level)!;
    bucket.forEach((node, index) => {
      const cross = index * (NODE_H + GAP_Y) + 80;
      const axis = level * (NODE_W + GAP_X) + 80;
      const x = horizontal ? axis : cross;
      const y = horizontal ? cross : axis;
      nodes = applyMove(nodes, node.key, x - node.x, y - node.y, descendants);
    });
  }
  return { ...doc, nodes };
}

function force(doc: CanvasDoc): CanvasDoc {
  const roots = doc.nodes.filter((node) => node.z === ROOT_Z && node.type !== "annotation");
  if (roots.length === 0) return doc;
  const index = new Map(roots.map((node, i) => [node.key, i]));
  const links: Array<[number, number]> = [];
  for (const node of roots) {
    for (const key of node.task?.dependsOn ?? []) {
      const from = index.get(key);
      const to = index.get(node.key);
      if (from !== undefined && to !== undefined) links.push([from, to]);
    }
  }
  // Deterministic force-directed relaxation (repulsion + springs + centering).
  const count = roots.length;
  const xs = roots.map((node) => node.x);
  const ys = roots.map((node) => node.y);
  const width = 900;
  const height = 620;
  for (let tick = 0; tick < 300; tick += 1) {
    const fx = new Array<number>(count).fill(0);
    const fy = new Array<number>(count).fill(0);    for (let a = 0; a < count; a += 1) {
      for (let b = a + 1; b < count; b += 1) {
        let dx = xs[a]! - xs[b]!;
        let dy = ys[a]! - ys[b]!;
        let dist2 = dx * dx + dy * dy;
        if (dist2 < 1) {
          dx = 0.01 * (a - b);
          dy = 0.01 * (a % 3 - b % 3);
          dist2 = dx * dx + dy * dy || 1;
        }
        const push = 60000 / dist2;
        const dist = Math.sqrt(dist2);
        fx[a] = fx[a]! + (dx / dist) * push;
        fy[a] = fy[a]! + (dy / dist) * push;
        fx[b] = fx[b]! - (dx / dist) * push;
        fy[b] = fy[b]! - (dy / dist) * push;
      }
    }
    for (const [a, b] of links) {
      const dx = xs[b]! - xs[a]!;
      const dy = ys[b]! - ys[a]!;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const pull = (dist - 220) * 0.02;
      fx[a] = fx[a]! + (dx / dist) * pull * dist;
      fy[a] = fy[a]! + (dy / dist) * pull * dist;
      fx[b] = fx[b]! - (dx / dist) * pull * dist;
      fy[b] = fy[b]! - (dy / dist) * pull * dist;
    }
    for (let i = 0; i < count; i += 1) {
      fx[i] = fx[i]! + (width / 2 - xs[i]!) * 0.01;
      fy[i] = fy[i]! + (height / 2 - ys[i]!) * 0.01;
      xs[i] = xs[i]! + Math.max(-24, Math.min(24, fx[i]!));
      ys[i] = ys[i]! + Math.max(-24, Math.min(24, fy[i]!));
    }
  }
  let nodes: readonly CanvasNode[] = doc.nodes;
  const descendants = descendantsByOwner(doc);
  roots.forEach((node, i) => {
    nodes = applyMove(nodes, node.key, Math.round(xs[i]!) - node.x, Math.round(ys[i]!) - node.y, descendants);
  });
  return { ...doc, nodes };
}

function compact(doc: CanvasDoc): CanvasDoc {
  const roots = doc.nodes.filter((node) => node.z === ROOT_Z && node.type !== "annotation");
  let nodes: readonly CanvasNode[] = doc.nodes;
  const descendants = descendantsByOwner(doc);
  roots.forEach((node, i) => {
    const column = i % 3;
    const row = Math.floor(i / 3);
    nodes = applyMove(nodes, node.key, 80 + column * (NODE_W + GAP_X) - node.x, 80 + row * (NODE_H + GAP_Y) - node.y, descendants);
  });
  return { ...doc, nodes };
}

export function canvasLayout(doc: CanvasDoc, layout: CanvasLayoutName): CanvasDoc {
  if (!LAYOUTS.has(layout)) throw new Error(`canvas doc: unknown layout "${layout}"`);
  switch (layout) {
    case "manual":
      return doc;
    case "flow_lr":
      return layered(doc, true);
    case "flow_tb":
      return layered(doc, false);
    case "force":
      return force(doc);
    case "compact":
      return compact(doc);
  }
}
