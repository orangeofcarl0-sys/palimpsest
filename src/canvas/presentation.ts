/**
 * PLMP-CANVAS-8 (33 号, G9-C): presentation reconciliation - the ONE merge
 * rule for `old presentation + new semantic document → new Work Canvas`.
 *
 * Ownership (spec 33 §2): the semantic result owns goal, identity, node
 * identities, semantic payloads, scope, mode, edges, edge identities and
 * order. The `before` doc may contribute ONLY presentation for surviving
 * identities - x/y and VisualGroups. The semantic result's identity state
 * dominates verbatim (PRES-INV-5): old presentation can never rewind the
 * monotonic counters.
 *
 * UAS-D-INV-2: this operates on the current Work Canvas types only. The
 * mechanics (stable-id matching, survivor preservation, deleted-member
 * cleanup, new-item placement) are deliberately reusable, but the schema is
 * not a future ArchitectureCanvas.
 */

import type { CanvasDoc, CanvasGroup, CanvasNode } from "./doc.js";

/** Node visual footprint + clearance (spec 33 §5; CanvasView styles width 190,
 * card ≈ 56 high). A stable conservative constant - not real geometry. */
const NODE_W = 190;
const NODE_H = 56;
const GAP = 24;

const GRID_COLS = 4;
const GRID_ORIGIN = { x: 80, y: 80 };

/** Deterministic collision-aware placement for nodes with no previous
 * presentation. Row-major grid scan from the seed, skipping any slot whose
 * footprint strictly intersects an occupied rect; the first free slot wins.
 * Existing positions always win - occupied nodes are never moved. */
function placeNewNodes(
  placed: readonly CanvasNode[],
  pending: readonly CanvasNode[],
): CanvasNode[] {
  const occupied = placed.map((node) => ({ x: node.x, y: node.y }));
  const byKey = new Map(placed.map((node) => [node.key, node]));
  const out: CanvasNode[] = [];
  for (const node of pending) {
    // Scope-aware seed (spec 33 §5): stored coordinates stay absolute - the
    // seed only chooses WHERE the deterministic scan starts. A subflow owner
    // that already has a final position (preserved or placed earlier in this
    // batch) seeds one row below itself; everything else seeds at the classic
    // grid origin. The owner node is never moved.
    const owner = node.z !== "root" ? byKey.get(node.z) : undefined;
    const seed =
      owner === undefined ? GRID_ORIGIN : { x: owner.x, y: owner.y + NODE_H + GAP };
    let x = seed.x;
    let y = seed.y;
    for (let index = 0; ; index += 1) {
      x = seed.x + (index % GRID_COLS) * (NODE_W + GAP);
      y = seed.y + Math.floor(index / GRID_COLS) * (NODE_H + GAP);
      const collides = occupied.some(
        (rect) => x < rect.x + NODE_W && rect.x < x + NODE_W && y < rect.y + NODE_H && rect.y < y + NODE_H,
      );
      if (!collides) break;
    }
    occupied.push({ x, y });
    byKey.set(node.key, { ...node, x, y });
    out.push(byKey.get(node.key)!);
  }
  return out;
}

/**
 * Merge `before`'s presentation into `semanticResult`'s semantics.
 * PRES-INV-1 surviving nodes keep their exact x/y; PRES-INV-2/3 groups
 * survive verbatim (id/label/g/declaration order) with only semantically
 * deleted members removed - empty groups stay; PRES-INV-4 fresh nodes get
 * deterministic collision-aware placement; PRES-INV-5 identity is the
 * semantic result's, verbatim.
 *
 * PRES-BELT-INV-1 (spec 35 §3): the output node array follows the
 * semanticResult's declaration order EXACTLY, even when fresh ids interleave
 * with surviving ones - placement order (which may process an owner before a
 * child declared after it) is an internal concern, never the output order.
 */
export function reconcileCanvasPresentation(before: CanvasDoc, semanticResult: CanvasDoc): CanvasDoc {
  const beforeByKey = new Map(before.nodes.map((node) => [node.key, node]));
  const survivors = new Set(semanticResult.nodes.map((node) => node.key));
  const kept: CanvasNode[] = [];
  const fresh: CanvasNode[] = [];
  for (const node of semanticResult.nodes) {
    const previous = beforeByKey.get(node.key);
    if (previous === undefined) fresh.push(node);
    else kept.push({ ...node, x: previous.x, y: previous.y });
  }
  const placed = placeNewNodes(kept, fresh);
  const finalByKey = new Map([...kept, ...placed].map((node) => [node.key, node]));
  const nodes = semanticResult.nodes.map((node) => finalByKey.get(node.key)!);
  // Groups are presentation truth owned by `before`: declaration order,
  // id/label/g verbatim; membership keeps its original order minus nodes the
  // semantic patch deleted. A group whose members are all gone remains -
  // deleting groups is a presentation operation, not a semantic side effect.
  const groups: CanvasGroup[] = before.groups.map((group) => ({
    id: group.id,
    label: group.label,
    ...(group.g === undefined ? {} : { g: group.g }),
    members: group.members.filter((member) => survivors.has(member)),
  }));
  return { ...semanticResult, nodes, groups };
}
