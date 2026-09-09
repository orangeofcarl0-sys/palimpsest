import { useMemo } from "react";

import { Background, Controls, ReactFlow, type Connection, type Edge, type Node, type NodeProps, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { forceLayout } from "./forceLayout";
import { stateColor, type SatelliteAttempt } from "./types";

export interface GraphNodeData extends Record<string, unknown> {
  key: string;
  label: string;
  sub: string;
  state: string;
  color: string;
}

interface SatelliteData extends Record<string, unknown> {
  attemptId: string;
  label: string;
}

/** Spec 36 §18: stable presentation-only selectors - the DOM exposes the
 * semantic ids/state for the browser suite, it never OWNS identity
 * (36 号 §19 red line). Visual output is unchanged (label only). */
function LiveNodeView({ data }: NodeProps<Node<GraphNodeData>>) {
  return (
    <div data-graph-node-key={data.key} data-graph-state={data.state}>
      {data.label}
    </div>
  );
}

function SatelliteNodeView({ data }: NodeProps<Node<SatelliteData>>) {
  return <div data-attempt-id={data.attemptId}>{data.label}</div>;
}

const liveNodeTypes: NodeTypes = { live: LiveNodeView, satellite: SatelliteNodeView };

interface Props {
  nodes: GraphNodeData[];
  links: Array<[number, number]>;
  selectedKey: string | null;
  editable: boolean;
  satellites?: SatelliteAttempt[];
  onSelect(key: string | null): void;
  onConnect?(from: string, to: string): void;
}

export function GraphView({ nodes, links, selectedKey, editable, satellites, onSelect, onConnect }: Props) {
  const layout = useMemo(
    () => forceLayout(nodes.length, links, 900, 620),
    // The layout only re-runs when the shape changes; dragging stays put.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes.length, JSON.stringify(links)],
  );

  const flowNodes: Node[] = [];
  nodes.forEach((node, index) => {
    flowNodes.push({
      id: node.key,
      type: "live",
      position: layout[index] ?? { x: 80, y: 80 },
      data: node,
      selected: node.key === selectedKey,
      zIndex: 1,
      style: {
        width: 190,
        borderRadius: 10,
        border: `2px solid ${node.color}`,
        background: "#0f172a",
        color: "#e2e8f0",
        fontSize: 12,
        padding: 10,
      },
    } as Node);
  });
  // PLMP-CANVAS-3: in-flight attempts as dashed satellites beside their task.
  for (const satellite of satellites ?? []) {
    const taskIndex = nodes.findIndex((node) => node.key === satellite.taskId);
    if (taskIndex < 0) continue;
    const cost = satellite.attribution === undefined ? "" : ` · ${satellite.attribution.model}`;
    flowNodes.push({
      id: `sat-${satellite.attemptId}`,
      type: "satellite",
      parentId: satellite.taskId,
      extent: undefined,
      position: { x: 200, y: 18 },
      data: { attemptId: satellite.attemptId, label: `${satellite.role} · ${satellite.state}${cost}` },
      selectable: true,
      zIndex: 2,
      style: {
        width: 150,
        borderRadius: 8,
        border: "1px dashed #64748b",
        background: "#0b1222",
        color: "#94a3b8",
        fontSize: 11,
        padding: 6,
      },
    } as Node);
  }

  const flowEdges: Edge[] = links.map(([from, to]) => ({
    id: `e-${nodes[from]!.key}-${nodes[to]!.key}`,
    source: nodes[from]!.key,
    target: nodes[to]!.key,
    animated: true,
    zIndex: 3,
    style: { stroke: "#475569" },
  }));

  return (
    <div style={{ height: "100%", minHeight: 420 }}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={liveNodeTypes}
        fitView
        onNodeClick={(_, node) => onSelect(node.id.startsWith("sat-") ? null : node.id)}
        onConnect={(connection: Connection) => {
          if (editable && onConnect && connection.source && connection.target && connection.source !== connection.target) {
            onConnect(connection.source, connection.target);
          }
        }}
      >
        <Background color="#1e293b" gap={18} />
        <Controls />
      </ReactFlow>
    </div>
  );
}

export function liveNodes(tasks: { taskId: string; objective: string; state: string; attempts: { state: string }[] }[]): GraphNodeData[] {
  return tasks.map((task) => ({
    key: task.taskId,
    label: task.objective,
    sub: `${task.state}${task.attempts.length > 0 ? ` · ${task.attempts.length} attempt` : ""}`,
    state: task.state,
    color: stateColor(task.state),
  }));
}

export function liveLinks(tasks: { taskId: string; dependsOn: string[] }[]): Array<[number, number]> {
  const index = new Map(tasks.map((task, i) => [task.taskId, i]));
  const links: Array<[number, number]> = [];
  for (const task of tasks) {
    for (const dependency of task.dependsOn) {
      const from = index.get(dependency);
      const to = index.get(task.taskId);
      if (from !== undefined && to !== undefined) links.push([from, to]);
    }
  }
  return links;
}
