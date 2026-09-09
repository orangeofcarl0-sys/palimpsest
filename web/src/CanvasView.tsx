import { Background, Controls, Handle, Position, ReactFlow, type Connection, type Edge, type Node, type NodeProps, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { CanvasDoc, CanvasDiffResult, CanvasNode } from "./types";

/**
 * PLMP-CANVAS-1 §1.3: the draft canvas. The doc is flat (z/g); the viewport
 * maps `z` chains onto React Flow's native parent-child relation - members
 * render inside their subflow with coordinates relative to it, extent
 * clamps their drags, and a collapsed subflow folds its members away.
 * Groups are pure visual bounds boxes behind everything; annotations are
 * sticky notes. All semantics (deps = titles) live in the doc, never here.
 * PLMP-CANVAS-5 INV-C7: visibility is a FULL ancestor-chain property - a
 * node renders only when every subflow ancestor is expanded, so a collapsed
 * grandparent hides everything beneath it (no root-level leaks).
 */

interface TaskData extends Record<string, unknown> {
  node: CanvasNode;
  diff?: "added" | "changed";
  depCount: number;
}
interface SubflowData extends Record<string, unknown> {
  node: CanvasNode;
  memberCount: number;
  expanded: boolean;
  onToggle(key: string): void;
}
interface AnnotationData extends Record<string, unknown> {
  node: CanvasNode;
}
interface GroupBoxData extends Record<string, unknown> {
  label: string;
  count: number;
}

function TaskNodeView({ data, selected }: NodeProps<Node<TaskData>>) {
  const { node, diff, depCount } = data;
  const ring =
    diff === "added" ? "0 0 0 3px #22c55e66" : diff === "changed" ? "0 0 0 3px #f59e0b66" : "none";
  return (
    <div
      // Spec 36 §18: stable presentation-only selector - the DOM reflects the
      // semantic key, it never OWNS identity (36 号 §19 red line).
      data-canvas-node-key={node.key}
      style={{
        width: 190,
        borderRadius: 10,
        border: `2px solid ${selected ? "#a78bfa" : "#7c3aed"}`,
        boxShadow: ring,
        background: "#171032",
        color: "#e2e8f0",
        fontSize: 12,
        padding: "8px 10px",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: "#475569", border: "none", width: 7, height: 7 }} />
      <div style={{ fontWeight: 600 }}>{node.title}</div>
      <div style={{ color: "#94a3b8", marginTop: 2 }}>
        依赖 {depCount}
        {node.task?.role !== undefined ? ` · ${node.task.role}` : ""}
        {(node.task?.suggestedSkills?.length ?? 0) > 0 ? ` · 技能 ${node.task!.suggestedSkills!.length}` : ""}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: "#475569", border: "none", width: 7, height: 7 }} />
    </div>
  );
}

function SubflowNodeView({ data }: NodeProps<Node<SubflowData>>) {
  const { node, memberCount, expanded, onToggle } = data;
  return (
      <div
        data-canvas-node-key={node.key}
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
      <div
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          justifyContent: expanded ? "space-between" : "flex-start",
          background: "#1b2540",
          borderBottom: expanded ? "1px solid #31406b" : "none",
          borderRadius: 10,
          padding: "6px 10px",
          color: "#cbd5e1",
          fontSize: 12,
        }}
      >
        <span style={{ fontWeight: 600 }}>
          子图 {node.title}（{memberCount}）
          {node.mode === "runtime" ? (
            <span
              style={{
                marginLeft: 6,
                background: "#1e3a5f",
                borderRadius: 6,
                padding: "1px 6px",
                fontSize: 10,
                color: "#7dd3fc",
              }}
            >
              运行时
            </span>
          ) : null}
        </span>
        <button
          style={{
            border: "1px solid #334155",
            background: "#0f172a",
            color: "#e2e8f0",
            borderRadius: 6,
            fontSize: 11,
            padding: "2px 8px",
            cursor: "pointer",
          }}
          onClick={(event) => {
            event.stopPropagation();
            onToggle(node.key);
          }}
        >
          {expanded ? "折叠" : "展开"}
        </button>
      </div>
    </div>
  );
}

function AnnotationNodeView({ data, selected }: NodeProps<Node<AnnotationData>>) {
  return (
    <div
      data-canvas-node-key={data.node.key}
      style={{
        width: 170,
        border: `1px dashed ${selected ? "#facc15" : "#65601f"}`,
        background: "#31300f",
        color: "#e7d97c",
        fontSize: 12,
        borderRadius: 8,
        padding: 8,
        whiteSpace: "pre-wrap",
      }}
    >
      {data.node.text}
    </div>
  );
}

function GroupBoxView({ data }: NodeProps<Node<GroupBoxData>>) {
  return (
    <div
      style={{
        height: "100%",
        border: "1px dashed #31406b",
        borderRadius: 12,
        background: "#0b122233",
        color: "#64748b",
        fontSize: 11,
        padding: "6px 10px",
      }}
    >
      ▢ {data.label}（{data.count}）
    </div>
  );
}

const nodeTypes: NodeTypes = {
  canvasTask: TaskNodeView,
  canvasSubflow: SubflowNodeView,
  canvasAnnotation: AnnotationNodeView,
  canvasGroup: GroupBoxView,
};

export interface CanvasViewProps {
  doc: CanvasDoc;
  expanded: ReadonlySet<string>;
  selectedKey: string | null;
  diff: CanvasDiffResult | null;
  onSelect(key: string | null): void;
  onConnect(fromKey: string, toKey: string): void;
  onMove(key: string, x: number, y: number): void;
  onDropInto(key: string, ownerKey: string | null): void;
  onToggleSubflow(key: string): void;
}

const MEMBER_SIZE = { width: 190, height: 56 };

export function CanvasView(props: CanvasViewProps) {
  const { doc, expanded, selectedKey, diff, onSelect, onConnect, onMove, onDropInto, onToggleSubflow: onToggle } = props;

  const nodesByKey = new Map(doc.nodes.map((node) => [node.key, node]));
  const byOwner = new Map<string, CanvasNode[]>();
  for (const node of doc.nodes) {
    const bucket = byOwner.get(node.z) ?? [];
    bucket.push(node);
    byOwner.set(node.z, bucket);
  }
  const membersOf = (key: string): CanvasNode[] => byOwner.get(key) ?? [];
  // PLMP-CANVAS-7: dependency badges count incoming edge records.
  const incomingCount = new Map<string, number>();
  for (const edge of doc.edges) {
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
  }
  const descendantsAbs = (key: string): CanvasNode[] => {
    const out: CanvasNode[] = [];
    for (const member of membersOf(key)) {
      out.push(member);
      if (member.type === "subflow") out.push(...descendantsAbs(member.key));
    }
    return out;
  };
  // INV-C7: every subflow ancestor of `key` must be expanded. The seen-set
  // makes the walk terminate (and fail closed) even on a malformed chain.
  const ancestorsExpanded = (key: string): boolean => {
    const seen = new Set<string>([key]);
    let current = nodesByKey.get(key);
    while (current !== undefined && current.z !== "root") {
      if (seen.has(current.z) || !expanded.has(current.z)) return false;
      seen.add(current.z);
      current = nodesByKey.get(current.z);
    }
    return true;
  };

  const added = new Set(diff?.added.map((entry) => entry.title) ?? []);
  const changed = new Set(diff?.changed.map((entry) => entry.title) ?? []);

  const flowNodes: Node[] = [];
  const idOf = (key: string): string => `k-${key}`;

  // Expanded subflows first: their bounds derive from members.
  const boundsOf = new Map<string, { x: number; y: number; width: number; height: number }>();
  for (const sub of doc.nodes.filter((node) => node.type === "subflow" && expanded.has(node.key))) {
    const members = descendantsAbs(sub.key).filter((node) => ancestorsExpanded(node.key));
    if (members.length === 0) {
      boundsOf.set(sub.key, { x: sub.x, y: sub.y, width: 190, height: 48 });
      continue;
    }
    const minX = Math.min(sub.x, ...members.map((node) => node.x));
    const minY = Math.min(sub.y, ...members.map((node) => node.y));
    const maxX = Math.max(sub.x + 190, ...members.map((node) => node.x + MEMBER_SIZE.width));
    const maxY = Math.max(sub.y + 60, ...members.map((node) => node.y + MEMBER_SIZE.height));
    boundsOf.set(sub.key, { x: minX, y: minY, width: maxX - minX + 24, height: maxY - minY + 24 });
  }

  const pushNode = (node: Omit<Node, "id">, key: string, parentId?: string): void => {
    flowNodes.push({
      id: idOf(key),
      ...(parentId === undefined ? {} : { parentId }),
      ...node,
    } as Node);
  };

  for (const node of doc.nodes) {
    // INV-C7: a collapsed ancestor anywhere up the chain hides the node -
    // subflow summaries included, so an expanded child of a collapsed
    // subflow cannot leak back at root coordinates.
    if (!ancestorsExpanded(node.key)) continue;
    const owner = node.z === "root" ? null : (nodesByKey.get(node.z) ?? null);
    if (node.type === "subflow") {
      const isExpanded = expanded.has(node.key);
      if (!isExpanded) {
        pushNode(
          {
            type: "canvasSubflow",
            position: { x: node.x, y: node.y },
            data: { node, memberCount: membersOf(node.key).length, expanded: false, onToggle },
            selected: node.key === selectedKey,
            zIndex: 1,
            style: { width: 190, borderRadius: 10 },
          },
          node.key,
        );
      } else {
        const bounds = boundsOf.get(node.key)!;
        const ownerOfSub = owner;
        const parentExpanded = ownerOfSub === null || expanded.has(ownerOfSub.key);
        pushNode(
          {
            type: "canvasSubflow",
            position:
              ownerOfSub === null || !parentExpanded
                ? { x: bounds.x, y: bounds.y }
                : { x: bounds.x - ownerOfSub.x, y: bounds.y - ownerOfSub.y },
            data: { node, memberCount: membersOf(node.key).length, expanded: true, onToggle },
            selected: node.key === selectedKey,
            zIndex: 1,
            style: {
              width: bounds.width,
              height: bounds.height,
              border: "1px solid #31406b",
              borderRadius: 12,
              background: "#0b1222",
            },
          },
          node.key,
          ownerOfSub !== null && parentExpanded ? idOf(ownerOfSub.key) : undefined,
        );
      }
      continue;
    }
    const relOwner = owner !== null && owner.type === "subflow" && expanded.has(owner.key) ? owner : null;
    const position =
      relOwner === null
        ? { x: node.x, y: node.y }
        : { x: node.x - relOwner.x, y: node.y - relOwner.y };
    if (node.type === "annotation") {
      pushNode(
        {
          type: "canvasAnnotation",
          position,
          data: { node },
          selected: node.key === selectedKey,
          zIndex: 2,
        },
        node.key,
        relOwner === null ? undefined : idOf(relOwner.key),
      );
      continue;
    }
    pushNode(
      {
        type: "canvasTask",
        position,
        // G9-G finding: no extent clamp here. With `extent: "parent"` React
        // Flow clamps a member's drag inside its subflow box, so the member's
        // center could never leave the bounds and the drop-OUT reassignment
        // (App.onDropInto → root / "已移出子图") was unreachable by dragging.
        // Scope ownership is decided by the drop detection below, not by the
        // render clamp; inside-own-owner releases keep membership.
        data: {
          node,
          depCount: incomingCount.get(node.key) ?? 0,
          ...(added.has(node.title) ? { diff: "added" as const } : changed.has(node.title) ? { diff: "changed" as const } : {}),
        },
        selected: node.key === selectedKey,
        zIndex: 2,
        style: { width: 190 },
      },
      node.key,
      relOwner === null ? undefined : idOf(relOwner.key),
    );
  }

  // Group boxes behind everything (pure visuals) - bounds from chain-visible
  // members only, and no box at all when every member is hidden.
  for (const group of doc.groups) {
    const members = doc.nodes.filter(
      (node) => group.members.includes(node.key) && ancestorsExpanded(node.key),
    );
    if (members.length === 0) continue;
    const minX = Math.min(...members.map((node) => node.x)) - 14;
    const minY = Math.min(...members.map((node) => node.y)) - 34;
    const maxX = Math.max(...members.map((node) => node.x + 190)) + 14;
    const maxY = Math.max(...members.map((node) => node.y + 56)) + 14;
    flowNodes.push({
      id: `g-${group.id}`,
      type: "canvasGroup",
      position: { x: minX, y: minY },
      data: { label: group.label, count: members.length },
      draggable: false,
      selectable: false,
      zIndex: -1,
      style: { width: maxX - minX, height: maxY - minY },
    } as Node);
  }

  // PLMP-CANVAS-7: edges[] is the one edge truth - dependency records
  // resolve key→visible task; ids stay stable for React Flow.
  const visibleTasks = doc.nodes.filter(
    (node) => node.type === "task" && ancestorsExpanded(node.key),
  );
  const visibleByKey = new Map(visibleTasks.map((node) => [node.key, node]));
  const flowEdges: Edge[] = [];
  for (const edge of doc.edges) {
    const from = visibleByKey.get(edge.source);
    const to = visibleByKey.get(edge.target);
    if (from === undefined || to === undefined) continue;
    flowEdges.push({
      id: `e-${edge.id}`,
      source: idOf(from.key),
      target: idOf(to.key),
      animated: true,
      zIndex: 3,
      style: { stroke: "#475569" },
    });
  }

  return (
    <div style={{ height: "100%", minHeight: 420 }}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        fitView
        onNodeClick={(_, node) => {
          const key = node.id.slice(2);
          if (node.type === "canvasGroup") return;
          onSelect(key);
        }}
        onConnect={(connection: Connection) => {
          if (connection.source && connection.target && connection.source !== connection.target) {
            onConnect(connection.source.slice(2), connection.target.slice(2));
          }
        }}
        onNodeDragStop={(_, node) => {
          const key = node.id.slice(2);
          const docNode = nodesByKey.get(key);
          if (docNode === undefined || node.type === "canvasGroup") return;
          const owner = docNode.z === "root" ? null : (nodesByKey.get(docNode.z) ?? null);
          const relOwner = owner !== null && expanded.has(owner.key) ? owner : null;
          const absX = relOwner === null ? node.position.x : relOwner.x + node.position.x;
          const absY = relOwner === null ? node.position.y : relOwner.y + node.position.y;
          onMove(key, absX, absY);
          if (docNode.type !== "task") return;
          // Drop-into-subflow: center inside another subflow's area reassigns z.
          // INV-C8: candidates are rendered (chain-visible) subflows only -
          // dropping into a hidden subflow is not a user-visible act. The
          // cycle guard (own-descendant rejection) lives in App.onDropInto.
          const centerX = absX + 95;
          const centerY = absY + 24;
          let target: string | null = null;
          for (const sub of doc.nodes.filter(
            (n) => n.type === "subflow" && n.key !== key && n.key !== docNode.z && ancestorsExpanded(n.key),
          )) {
            const bounds = expanded.has(sub.key)
              ? (boundsOf.get(sub.key) ?? { x: sub.x, y: sub.y, width: 190, height: 48 })
              : { x: sub.x, y: sub.y, width: 190, height: 48 };
            if (centerX >= bounds.x && centerX <= bounds.x + bounds.width && centerY >= bounds.y && centerY <= bounds.y + bounds.height) {
              target = sub.key;
              break;
            }
          }
          const insideOwnOwner =
            docNode.z !== "root" &&
            (() => {
              const own = nodesByKey.get(docNode.z)!;
              const bounds = expanded.has(own.key)
                ? (boundsOf.get(own.key) ?? { x: own.x, y: own.y, width: 190, height: 48 })
                : { x: own.x, y: own.y, width: 190, height: 48 };
              return centerX >= bounds.x && centerX <= bounds.x + bounds.width && centerY >= bounds.y && centerY <= bounds.y + bounds.height;
            })();
          if (target !== null) onDropInto(key, target);
          else if (docNode.z !== "root" && !insideOwnOwner) onDropInto(key, null);
        }}
      >
        <Background color="#1e293b" gap={18} />
      <Controls />
      </ReactFlow>
    </div>
  );
}
