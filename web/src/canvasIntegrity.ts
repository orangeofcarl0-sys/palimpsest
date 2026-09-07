import type { CanvasDoc } from "./types";

/**
 * PLMP-CANVAS-5 INV-C9 + PLMP-CANVAS-7 (32 号): local shape guard for docs
 * that never crossed the kernel parser - localStorage restore and JSON
 * import. It mirrors the kernel v3 invariants (identity state, owner must
 * be a subflow, no self-parent, acyclic z/group chains, edge endpoints
 * exist and target a task, group member references resolve) so a malformed
 * doc can neither render wrong nor recurse forever. The kernel
 * `parseCanvasDoc` stays the only authority: serve endpoints parse every
 * doc; this is renderer-side stop-gap on an independent build chain, not
 * copied compilation logic. v2 drafts do not pass here - they migrate
 * through `upgradeCanvasV2ToV3` (canvasV3.ts) first.
 */
export function canvasDocShapeError(doc: CanvasDoc): string | null {
  if (doc === null || typeof doc !== "object" || doc.version !== 3) {
    return "不是画布文档（version 3，edges[] 边真相）";
  }
  const identity = doc.identity;
  if (
    identity === undefined ||
    identity === null ||
    typeof identity !== "object" ||
    typeof identity.namespace !== "string" ||
    identity.namespace === "" ||
    !Number.isInteger(identity.nextNode) ||
    identity.nextNode < 1 ||
    !Number.isInteger(identity.nextEdge) ||
    identity.nextEdge < 1
  ) {
    return "不是画布文档（identity 状态缺失）";
  }
  if (!Array.isArray(doc.nodes) || !Array.isArray(doc.edges) || !Array.isArray(doc.groups)) {
    return "不是画布文档（nodes/edges/groups 缺失）";
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
  // PLMP-CANVAS-7: edge reference integrity (kernel INV-D1/D2 edge-keyed).
  const edgeIds = new Set(doc.edges.map((edge) => edge.id));
  if (edgeIds.size !== doc.edges.length) return "边 id 重复";
  for (const edge of doc.edges) {
    const source = byKey.get(edge.source);
    if (source === undefined) return `边 ${edge.id} 引用未知起点 ${edge.source}`;
    if (source.type !== "task") return `边 ${edge.id} 的起点 ${edge.source} 不是任务`;
    const target = byKey.get(edge.target);
    if (target === undefined) return `边 ${edge.id} 引用未知终点 ${edge.target}`;
    if (edge.source === edge.target) return `边 ${edge.id} 不能连接自身`;
    if (edge.kind !== "data") return `边 ${edge.id} 的 kind 必须是 data`;
  }
  // Group integrity incl. member references (G9-D: restore used to accept
  // dangling members the kernel refuses - the blind spot is closed).
  const byId = new Map(doc.groups.map((group) => [group.id, group]));
  if (byId.size !== doc.groups.length) return "分组 id 重复";
  for (const group of doc.groups) {
    if (group.g !== undefined && !byId.has(group.g)) {
      return `分组 ${group.id} 引用未知父分组 ${group.g}`;
    }
    for (const member of group.members) {
      if (!byKey.has(member)) return `分组 ${group.id} 引用未知成员 ${member}`;
    }
  }
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
