import { useMemo } from "react";

import { Background, Controls, ReactFlow, type Connection, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { forceLayout } from "./forceLayout";
import { stateColor } from "./types";

export interface GraphNodeData {
  key: string;
  label: string;
  sub: string;
  color: string;
}

interface Props {
  nodes: GraphNodeData[];
  links: Array<[number, number]>;
  selectedKey: string | null;
  editable: boolean;
  onSelect(key: string): void;
  onConnect?(from: string, to: string): void;
}

export function GraphView({ nodes, links, selectedKey, editable, onSelect, onConnect }: Props) {
  const layout = useMemo(
    () => forceLayout(nodes.length, links, 900, 620),
    // The layout only re-runs when the shape changes; dragging stays put.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes.length, JSON.stringify(links)],
  );

  const flowNodes: Node<GraphNodeData>[] = nodes.map((node, index) => ({
    id: node.key,
    position: layout[index] ?? { x: 80, y: 80 },
    data: node,
    selected: node.key === selectedKey,
    style: {
      width: 190,
      borderRadius: 10,
      border: `2px solid ${node.color}`,
      background: "#0f172a",
      color: "#e2e8f0",
      fontSize: 12,
      padding: 10,
    },
  }));

  const flowEdges: Edge[] = links.map(([from, to]) => ({
    id: `e-${nodes[from]!.key}-${nodes[to]!.key}`,
    source: nodes[from]!.key,
    target: nodes[to]!.key,
    animated: true,
    style: { stroke: "#475569" },
  }));

  return (
    <div style={{ height: "100%", minHeight: 420 }}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        fitView
        onNodeClick={(_, node) => onSelect(node.id)}
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
