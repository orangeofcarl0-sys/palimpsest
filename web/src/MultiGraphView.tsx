/**
 * G10-O MultiGraph organizational debugger — presentation-only shell over typed projections.
 *
 *   UI state ≠ canonical truth     GraphProjection ≠ canonical graph
 *   UI action ≠ authority grant    presentation id ≠ canonical identity
 *
 * Every mutation here goes through the SAME typed application route the agent tools use; no
 * store is reachable from the browser, and unknown/stale/error knowledge is shown as text,
 * never as an empty known graph.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Background, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  applicationSurfaces,
  boundaryDecide,
  projection,
  reasoningCells,
  reasoningEvaluate,
  type ApplicationSurfaceAvailability,
  type GraphSpecies,
  type ProjectionEnvelope,
  type ProjectionNode,
  type ReasoningCellListEntry,
} from "./api";

const SPECIES: readonly { readonly id: GraphSpecies; readonly label: string }[] = [
  { id: "work", label: "Work" },
  { id: "organization", label: "Organization" },
  { id: "collaboration", label: "Collaboration" },
  { id: "runtime", label: "Runtime / Holon" },
  { id: "reasoning", label: "Reasoning" },
];

/**
 * A graph node is a HANDLE, not a document.
 *
 * Node boxes are a fixed 190px wide, so rendering a projection label verbatim means one long label
 * (a reasoning branch carries its whole question) fills a box with a paragraph and the graph becomes
 * unreadable. The node shows an excerpt; `选中详情` shows the full text, so nothing is lost — it is
 * moved to where there is room for it.
 */
const NODE_LABEL_LIMIT = 52;

function excerpt(text: string, limit = NODE_LABEL_LIMIT): string {
  const flat = text.replace(/\s+/gu, " ").trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1)}…`;
}

/** Derived presentation node id — never written back to the kernel. */
function toFlowNodes(envelope: ProjectionEnvelope): Node[] {
  return envelope.nodes.map((node, index) => ({
    id: node.presentationId,
    position: { x: (index % 4) * 240, y: Math.floor(index / 4) * 130 },
    data: { label: excerpt(`${node.label}${node.state === null ? "" : ` · ${node.state}`}`) },
    style: {
      border: node.kind.startsWith("external") ? "2px dashed #f59e0b" : "1px solid #334155",
      background: node.state === "inactive" ? "#1e293b" : "#0f172a",
      color: "#e2e8f0",
      fontSize: 11,
      borderRadius: 8,
      padding: 6,
      width: 190,
      opacity: node.state === "rejected" || node.state === "inactive" ? 0.6 : 1,
    },
  }));
}

function toFlowEdges(envelope: ProjectionEnvelope): Edge[] {
  return envelope.edges.map((edge) => ({
    id: edge.presentationId,
    source: edge.from,
    target: edge.to,
    label: edge.kind,
    style: {
      stroke: edge.kind.startsWith("external") ? "#f59e0b" : edge.kind === "commitment_holder" ? "#22c55e" : "#475569",
      strokeDasharray: edge.kind.startsWith("external") ? "4 4" : undefined,
    },
    labelStyle: { fill: "#94a3b8", fontSize: 9 },
  }));
}

export function MultiGraphView({ onExit }: { readonly onExit: () => void }): JSX.Element {
  const [species, setSpecies] = useState<GraphSpecies>("work");
  const [scope, setScope] = useState("");
  const [surfaces, setSurfaces] = useState<ApplicationSurfaceAvailability | null>(null);
  const [envelope, setEnvelope] = useState<ProjectionEnvelope | null>(null);
  const [selected, setSelected] = useState<ProjectionNode | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [candidateDigest, setCandidateDigest] = useState("");
  const [artifactId, setArtifactId] = useState("");
  const [cells, setCells] = useState<readonly ReasoningCellListEntry[] | null>(null);

  /**
   * The reasoning specimen is the one species with no ref of its own in the URL, so the panel used to
   * demand a cell id typed from memory. Fetch the index instead and let a user pick by what the
   * objective SAYS; the id stays the value, out of sight.
   */
  useEffect(() => {
    if (species !== "reasoning") return;
    let current = true;
    void reasoningCells()
      .then((list) => {
        if (current) setCells(list);
      })
      .catch(() => {
        // An unreadable index must not break the panel: the free-text field still works.
        if (current) setCells(null);
      });
    return () => {
      current = false;
    };
  }, [species]);

  useEffect(() => {
    void applicationSurfaces()
      .then(setSurfaces)
      .catch((error: unknown) => setMessage(`surface 查询失败：${error instanceof Error ? error.message : String(error)}`));
  }, []);

  const refresh = useCallback(async () => {
    setSelected(null);
    try {
      const params =
        species === "organization"
          ? { organizationDefinitionId: scope }
          : species === "reasoning"
            ? { cellId: scope }
            : {};
      setEnvelope(await projection(species, params));
      setMessage(null);
    } catch (error) {
      setEnvelope(null);
      setMessage(`投影不可用：${error instanceof Error ? error.message : String(error)}`);
    }
  }, [species, scope]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const nodes = useMemo(() => (envelope === null ? [] : toFlowNodes(envelope)), [envelope]);
  const onNodeClick = useCallback(
    (_event: unknown, node: Node) => {
      setSelected(envelope?.nodes.find((entry) => entry.presentationId === node.id) ?? null);
    },
    [envelope],
  );
  const edges = useMemo(() => (envelope === null ? [] : toFlowEdges(envelope)), [envelope]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 12, height: "100vh", boxSizing: "border-box", padding: 12, background: "#020617" }}>
      <div style={{ display: "grid", gridTemplateRows: "auto auto 1fr", gap: 8, minHeight: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", color: "#e2e8f0" }}>
          <b>palimpsest MultiGraph</b>
          {SPECIES.map((entry) => (
            <button
              key={entry.id}
              onClick={() => setSpecies(entry.id)}
              aria-pressed={species === entry.id}
              style={{
                padding: "5px 10px",
                borderRadius: 8,
                border: "1px solid #334155",
                background: species === entry.id ? "#1d4ed8" : "#1e293b",
                color: "#e2e8f0",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {entry.label}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <button onClick={() => void refresh()} style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #334155", background: "#1e293b", color: "#e2e8f0", fontSize: 12, cursor: "pointer" }}>
            刷新
          </button>
          <button onClick={onExit} style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #334155", background: "#1e293b", color: "#e2e8f0", fontSize: 12, cursor: "pointer" }}>
            返回 Work
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", color: "#94a3b8", fontSize: 12 }}>
          <span>
            {(species === "organization" && "OrganizationDefinitionId") || (species === "reasoning" && "CellId") || "本物种无需 ref"}：
          </span>
          {species === "organization" || species === "reasoning" ? (
            <>
              {species === "reasoning" && cells !== null ? (
                <select
                  aria-label="选择 reasoning cell"
                  data-testid="reasoning-cell-picker"
                  value={cells.some((cell) => cell.cellId === scope) ? scope : ""}
                  onChange={(event) => setScope(event.target.value)}
                  style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: 12, maxWidth: 420 }}
                >
                  <option value="">
                    {cells.length === 0 ? "此部署还没有 cell" : `${String(cells.length)} 个 cell —— 按 objective 选`}
                  </option>
                  {cells.map((cell) => (
                    <option key={cell.cellId} value={cell.cellId}>
                      {excerpt(cell.objective, 70)}
                    </option>
                  ))}
                </select>
              ) : null}
              <input
                aria-label="投影 ref"
                value={scope}
                onChange={(event) => setScope(event.target.value)}
                placeholder={species === "reasoning" ? "或直接粘贴 cell id" : ""}
                style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: 12, width: 260 }}
              />
            </>
          ) : null}
          {envelope !== null ? (
            <span data-testid="projection-knowledge">
              knowledge={envelope.knowledge} · digest={envelope.projectionDigest.slice(0, 10)} · sources={envelope.sourceBases.length}
            </span>
          ) : null}
        </div>
        <div style={{ minHeight: 0, border: "1px solid #1e293b", borderRadius: 10, background: "#0b1220" }}>
          {envelope !== null && envelope.knowledge !== "unknown" ? (
            <ReactFlow nodes={nodes} edges={edges} fitView onNodeClick={onNodeClick}>
              <Background />
              <Controls />
            </ReactFlow>
          ) : (
            <div style={{ padding: 16, color: "#94a3b8", fontSize: 13 }} data-testid="projection-empty">
              {message ?? "无可用投影（未知，不等于空图）"}
            </div>
          )}
        </div>
      </div>
      <div style={{ border: "1px solid #1e293b", borderRadius: 10, padding: 12, background: "#0b1220", color: "#e2e8f0", fontSize: 12, overflow: "auto" }}>
        <b>选中详情</b>
        {selected === null ? (
          <p style={{ color: "#94a3b8" }}>点击节点查看 typed ref（presentation id 不是 canonical identity）。</p>
        ) : (
          <div data-testid="inspector">
            {/* The node shows only an excerpt; the selected node's full text belongs here. */}
            <p style={{ color: "#e2e8f0", marginTop: 4 }} data-testid="inspector-label">
              {selected.label}
            </p>
            <p>
              species=<code>{selected.ref.species}</code> kind=<code>{selected.ref.kind}</code>
            </p>
            <p>
              canonical id=<code data-testid="inspector-ref">{selected.ref.id}</code>
            </p>
            <p>presentation id=<code>{selected.presentationId}</code></p>
            <p>state={selected.state ?? "—"}</p>
          </div>
        )}
        {surfaces !== null ? (
          <>
            <hr style={{ borderColor: "#1e293b" }} />
            {/*
              Two wrapped lines instead of a 22-row bullet list: the same facts, a fraction of the
              text. Each entry keeps its exact `name: 已配置` form, and the configured ones lead
              because that is the question a reader actually has.
            */}
            <b>已配置表面</b>
            {(() => {
              const entries = Object.entries(surfaces)
                .filter(([key]) => key !== "work")
                .map(([key, present]) => `${key}: ${present ? "已配置" : "未配置"}`);
              const present = entries.filter((entry) => entry.endsWith("已配置"));
              const absent = entries.filter((entry) => !entry.endsWith("已配置"));
              return (
                <>
                  <p style={{ color: "#94a3b8", margin: "4px 0" }}>
                    {present.length}/{entries.length} 已配置 · {present.join(" · ")}
                  </p>
                  {absent.length === 0 ? null : (
                    <p style={{ color: "#64748b", margin: "4px 0" }}>未配置 · {absent.join(" · ")}</p>
                  )}
                </>
              );
            })()}
          </>
        ) : null}
        {species === "reasoning" ? (
          <>
            <hr style={{ borderColor: "#1e293b" }} />
            <b>安全动作（经同一 application service）</b>
            <p style={{ color: "#94a3b8" }}>评估候选（服务内部执行 Verification → Admission；无法自报结果）</p>
            <input
              aria-label="candidateDigest"
              placeholder="candidateDigest"
              value={candidateDigest}
              onChange={(event) => setCandidateDigest(event.target.value)}
              style={{ width: "100%", padding: "4px 8px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: 12 }}
            />
            <button
              style={{ marginTop: 6, padding: "5px 10px", borderRadius: 8, border: "1px solid #334155", background: "#1d4ed8", color: "#e2e8f0", fontSize: 12, cursor: "pointer" }}
              onClick={() => {
                void reasoningEvaluate({ cellId: scope, candidateDigest })
                  .then((result) => {
                    setMessage(`评估结果：${JSON.stringify(result)}`);
                    return refresh();
                  })
                  .catch((error: unknown) => setMessage(`评估失败：${error instanceof Error ? error.message : String(error)}`));
              }}
            >
              评估候选
            </button>
          </>
        ) : null}
        {species === "collaboration" ? (
          <>
            <hr style={{ borderColor: "#1e293b" }} />
            <b>边界候选决定（经同一 application service）</b>
            <input
              aria-label="artifactId"
              placeholder="artifactId"
              value={artifactId}
              onChange={(event) => setArtifactId(event.target.value)}
              style={{ width: "100%", padding: "4px 8px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0", fontSize: 12 }}
            />
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              {(["accept", "reject"] as const).map((decision) => (
                <button
                  key={decision}
                  style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #334155", background: "#1e293b", color: "#e2e8f0", fontSize: 12, cursor: "pointer" }}
                  onClick={() => {
                    void boundaryDecide({ workspaceId: scope, artifactId, candidateDigest, decision })
                      .then(() => refresh())
                      .catch((error: unknown) => setMessage(`决定失败：${error instanceof Error ? error.message : String(error)}`));
                  }}
                >
                  {decision === "accept" ? "接受候选" : "拒绝候选"}
                </button>
              ))}
            </div>
          </>
        ) : null}
        {message !== null ? <p style={{ color: "#fbbf24" }} data-testid="multigraph-message">{message}</p> : null}
      </div>
    </div>
  );
}
