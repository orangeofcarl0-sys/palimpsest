import type { CanvasDoc } from "./types";

/**
 * PLMP-CANVAS-5 INV-C9: local shape guard for docs that never crossed the
 * kernel parser - localStorage restore and JSON import. It mirrors the
 * kernel ownership invariants (owner must be a subflow, no self-parent,
 * acyclic z/group chains) so a malformed doc can neither render wrong nor
 * recurse forever. The kernel `parseCanvasDoc` stays the only authority:
 * serve endpoints parse every doc; this is renderer-side stop-gap on an
 * independent build chain, not copied compilation logic.
 */
export function canvasDocShapeError(doc: CanvasDoc): string | null {
  if (doc === null || typeof doc !== "object" || doc.version !== 1) {
    return "不是画布文档（version 1）";
  }
  if (!Array.isArray(doc.nodes) || !Array.isArray(doc.groups)) {
    return "不是画布文档（nodes/groups 缺失）";
  }
  const byKey = new Map(doc.nodes.map((node) => [node.key, node]));
  if (byKey.size !== doc.nodes.length) return "节点 key 重复";
  for (const node of doc.nodes) {
    if (node.z === "root") continue;
    if (node.z === node.key) return `节点 ${node.key} 不能归属自己`;
    const owner = byKey.get(node.z);
    if (owner === undefined) return `节点 ${node.key} 引用未知归属 ${node.z}`;
    if (owner.type !== "subflow") return `节点 ${node.key} 的归属必须是子图`;
  }
  for (const node of doc.nodes) {
    const seen = new Set<string>([node.key]);
    let current = byKey.get(node.key);
    while (current !== undefined && current.z !== "root") {
      if (seen.has(current.z)) return `归属环：${current.z}`;
      seen.add(current.z);
      current = byKey.get(current.z);
    }
  }
  const byId = new Map(doc.groups.map((group) => [group.id, group]));
  for (const group of doc.groups) {
    const seen = new Set<string>([group.id]);
    let current = byId.get(group.id);
    while (current !== undefined && typeof current.g === "string") {
      if (seen.has(current.g)) return `分组嵌套环：${current.g}`;
      seen.add(current.g);
      current = byId.get(current.g);
    }
  }
  return null;
}

/**
 * PLMP-CANVAS-5 INV-C8 support: the transitive descendant key set of a
 * subflow (drop-guard uses it to refuse moving a subflow into its own
 * descendant - that would create the ownership cycle the kernel refuses).
 */
export function descendantKeys(doc: CanvasDoc, rootKey: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const node of doc.nodes) {
    if (node.z === "root") continue;
    const bucket = children.get(node.z) ?? [];
    bucket.push(node.key);
    children.set(node.z, bucket);
  }
  const out = new Set<string>();
  const stack = [...(children.get(rootKey) ?? [])];
  while (stack.length > 0) {
    const key = stack.pop()!;
    if (out.has(key)) continue;
    out.add(key);
    for (const child of children.get(key) ?? []) stack.push(child);
  }
  return out;
}
