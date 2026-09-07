import { useCallback, useEffect, useRef, useState } from "react";

import {
  ApiError,
  deriveCanvas,
  getGraph,
  getToken,
  health,
  layoutCanvas,
  listPresets,
  setToken,
} from "./api";
import { CanvasView } from "./CanvasView";
import { GraphView, liveLinks, liveNodes } from "./GraphView";
import {
  ArchitectureBar,
  CanvasEditor,
  ControlBar,
  GateForm,
  PromoteForm,
  TaskDetails,
} from "./Panels";
import type {
  CanvasDoc,
  CanvasLayoutName,
  OrchestrationGraph,
  PresetMeta,
  SatelliteAttempt,
  TraceRow,
} from "./types";
import { canvasDocShapeError, descendantKeys } from "./canvasIntegrity";

type Mode = "live" | "draft";

const LAYOUTS: Array<{ id: CanvasLayoutName; label: string }> = [
  { id: "manual", label: "手动" },
  { id: "flow_lr", label: "流式 →" },
  { id: "flow_tb", label: "流式 ↓" },
  { id: "force", label: "力导向" },
  { id: "compact", label: "紧凑" },
];

function emptyDoc(): CanvasDoc {
  return { version: 1, goal: "", nodes: [], groups: [] };
}

export function App() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [graph, setGraph] = useState<OrchestrationGraph | null>(null);
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const [presets, setPresets] = useState<PresetMeta[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("live");
  const [doc, setDoc] = useState<CanvasDoc>(emptyDoc());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [satellitesOn, setSatellitesOn] = useState(true);
  const [traceOn, setTraceOn] = useState(false);
  const [satellites, setSatellites] = useState<SatelliteAttempt[]>([]);
  const [traces, setTraces] = useState<TraceRow[]>([]);
  const [message, setMessage] = useState("");
  const docLoadedFor = useRef<string | null>(null);

  const projectId = graph?.project.projectId ?? null;
  const refresh = useCallback(async (): Promise<void> => {
    try {
      const response = await getGraph(cursor);
      if (response.changed) {
        setGraph(response.graph);
        setCursor(response.graph.project.cursor);
      }
      setAuthorized(true);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setAuthorized(false);
      else setMessage(error instanceof Error ? error.message : String(error));
    }
  }, [cursor]);

  useEffect(() => {
    void (async () => {
      try {
        await health();
        setAuthorized(true);
      } catch (error) {
        setAuthorized(!(error instanceof ApiError && error.status === 401));
        if (!(error instanceof ApiError && error.status === 401)) {
          setMessage(error instanceof Error ? error.message : String(error));
        }
      }
    })();
  }, []);

  useEffect(() => {
    if (authorized !== true) return;
    const timer = setInterval(() => void refresh(), 2000);
    void refresh();
    return () => clearInterval(timer);
  }, [authorized, refresh]);

  useEffect(() => {
    if (authorized !== true) return;
    void listPresets()
      .then((result) => setPresets(result.presets))
      .catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
  }, [authorized]);

  // PLMP-CANVAS-1: the doc is client-side scratch - localStorage + import/export.
  useEffect(() => {
    if (projectId === null || docLoadedFor.current === projectId) return;
    docLoadedFor.current = projectId;
    const raw = localStorage.getItem(`palimpsest-canvas-${projectId}`);
    if (raw !== null) {
      try {
        const parsed = JSON.parse(raw) as CanvasDoc;
        // PLMP-CANVAS-5 INV-C9: local docs never crossed the kernel parser -
        // a malformed/cyclic doc is refused instead of rendered.
        const shapeError = canvasDocShapeError(parsed);
        if (shapeError !== null) {
          setMessage(`本地画布草稿被拒绝：${shapeError}`);
        } else {
          setDoc(parsed);
        }
      } catch {
        setMessage("本地画布草稿解析失败，已从空白开始");
      }
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId === null) return;
    try {
      localStorage.setItem(`palimpsest-canvas-${projectId}`, JSON.stringify(doc));
    } catch {
      // Storage full/unavailable - the doc still lives in memory this session.
    }
  }, [doc, projectId]);

  useEffect(() => {
    if (authorized !== true || mode !== "live" || (!satellitesOn && !traceOn)) return;
    void deriveCanvas()
      .then((result) => {
        setSatellites(result.satellites);
        setTraces(result.traces);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : String(error)));
  }, [authorized, mode, satellitesOn, traceOn, cursor]);

  if (authorized === null) {
    return <Center>连接中…</Center>;
  }
  if (authorized === false) {
    return (
      <Center>
        <div style={{ display: "grid", gap: 10, maxWidth: 380 }}>
          <div>输入访问令牌（palimpsest serve 启动时打印）</div>
          <input
            value={tokenInput}
            onChange={(event) => setTokenInput(event.target.value)}
            style={{ padding: 8, borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#e2e8f0" }}
          />
          <button
            onClick={() => {
              setToken(tokenInput);
              void (async () => {
                try {
                  await health();
                  setAuthorized(true);
                } catch {
                  setAuthorized(false);
                }
              })();
            }}
          >
            进入
          </button>
        </div>
      </Center>
    );
  }

  const graphTasks = graph?.tasks ?? [];
  const selectedTask = graphTasks.find((task) => task.taskId === selectedKey) ?? null;
  const attemptIds = graphTasks.flatMap((task) => task.attempts.map((attempt) => attempt.attemptId));
  const visibleTraces = traceOn ? traces : [];

  const applyLayout = (layout: CanvasLayoutName): void => {
    void (async () => {
      try {
        const result = await layoutCanvas(doc, layout);
        setDoc(result.doc);
        setMessage(`布局 ${LAYOUTS.find((entry) => entry.id === layout)?.label ?? layout} ✓`);
      } catch (error) {
        setMessage(`布局 ✕ ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  };

  const exportDoc = (): void => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `canvas-${projectId ?? "draft"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importDoc = (file: File): void => {
    void (async () => {
      try {
        const parsed = JSON.parse(await file.text()) as CanvasDoc;
        // PLMP-CANVAS-5 INV-C9: imports run the same shape guard as restore.
        const shapeError = canvasDocShapeError(parsed);
        if (shapeError !== null) throw new Error(shapeError);
        setDoc(parsed);
        setMessage(`已导入画布（${parsed.nodes.length} 节点）`);
      } catch (error) {
        setMessage(`导入 ✕ ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 12, height: "100vh", boxSizing: "border-box", padding: 12, background: "#020617" }}>
      <div style={{ display: "grid", gridTemplateRows: mode === "draft" ? "auto 1fr auto" : "auto auto 1fr auto", gap: 8, minHeight: 0 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "baseline", color: "#e2e8f0" }}>
          <b>palimpsest 图面</b>
          <span style={{ color: "#94a3b8", fontSize: 12 }}>
            {graph === null ? "—" : `${graph.project.goal} · revision ${graph.project.revision}${graph.project.paused ? " · 已暂停" : ""}`}
          </span>
          <span style={{ flex: 1 }} />
          {mode === "draft" ? (
            <>
              <select
                onChange={(event) => applyLayout(event.target.value as CanvasLayoutName)}
                value=""
                style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #334155", background: "#1e293b", color: "#e2e8f0", fontSize: 12, cursor: "pointer" }}
              >
                <option value="">布局 ▾</option>
                {LAYOUTS.map((layout) => (
                  <option key={layout.id} value={layout.id}>
                    {layout.label}
                  </option>
                ))}
              </select>
              <button onClick={exportDoc} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #334155", background: "#1e293b", color: "#e2e8f0", cursor: "pointer", fontSize: 12 }}>
                导出
              </button>
              <label style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #334155", background: "#1e293b", color: "#e2e8f0", cursor: "pointer", fontSize: 12 }}>
                导入
                <input
                  type="file"
                  accept="application/json"
                  style={{ display: "none" }}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file !== undefined) importDoc(file);
                    event.target.value = "";
                  }}
                />
              </label>
            </>
          ) : (
            <>
              <button
                onClick={() => setSatellitesOn(!satellitesOn)}
                style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #334155", background: satellitesOn ? "#1e3a5f" : "#1e293b", color: "#e2e8f0", cursor: "pointer", fontSize: 12 }}
              >
                卫星{satellitesOn ? "开" : "关"}
              </button>
              <button
                onClick={() => setTraceOn(!traceOn)}
                style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #334155", background: traceOn ? "#1e3a5f" : "#1e293b", color: "#e2e8f0", cursor: "pointer", fontSize: 12 }}
              >
                Trace{traceOn ? "开" : "关"}
              </button>
            </>
          )}
          <button
            onClick={() => setMode(mode === "live" ? "draft" : "live")}
            style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #334155", background: mode === "draft" ? "#7c3aed" : "#1e293b", color: "#e2e8f0", cursor: "pointer", fontSize: 12 }}
          >
            {mode === "live" ? "手搓模式" : "回到实时"}
          </button>
        </div>
        {mode === "draft" ? null : <ControlBar paused={graph?.project.paused === true} onMessage={setMessage} refresh={() => void refresh()} />}
        <div style={{ minHeight: 0, border: "1px solid #1e293b", borderRadius: 10, overflow: "hidden", display: "grid", gridTemplateRows: traceOn && mode === "live" ? "1fr auto" : "1fr" }}>
          <div style={{ minHeight: 0 }}>
            {mode === "draft" ? (
              <CanvasView
                doc={doc}
                expanded={expanded}
                selectedKey={selectedKey}
                diff={null}
                onSelect={setSelectedKey}
                onConnect={(fromKey, toKey) => {
                  const source = doc.nodes.find((node) => node.key === fromKey);
                  const target = doc.nodes.find((node) => node.key === toKey);
                  if (source === undefined || target?.task === undefined || source.type !== "task") return;
                  if (target.task.dependsOn.includes(source.title)) return;
                  setDoc({
                    ...doc,
                    nodes: doc.nodes.map((node) =>
                      node.key === toKey && node.task !== undefined
                        ? { ...node, task: { ...node.task, dependsOn: [...node.task.dependsOn, source.title] } }
                        : node,
                    ),
                  });
                }}
                onMove={(key, x, y) => {
                  setDoc({
                    ...doc,
                    nodes: doc.nodes.map((node) => (node.key === key ? { ...node, x, y } : node)),
                  });
                }}
                onDropInto={(key, ownerKey) => {
                  // PLMP-CANVAS-5 INV-C8: re-parenting must not create an
                  // ownership cycle - that is only possible when a subflow
                  // lands inside its own subtree (a task can never own).
                  // Kernel parse refuses such docs; the UI refuses first.
                  if (ownerKey !== null) {
                    const ownerNode = doc.nodes.find((node) => node.key === ownerKey);
                    const dragged = doc.nodes.find((node) => node.key === key);
                    if (ownerNode === undefined || ownerNode.type !== "subflow") {
                      setMessage("归入失败：目标不是子图");
                      return;
                    }
                    if (dragged !== undefined && dragged.type === "subflow" && descendantKeys(doc, key).has(ownerKey)) {
                      setMessage("归入失败：不能把子图移入它自己的后代");
                      return;
                    }
                  }
                  setDoc({
                    ...doc,
                    nodes: doc.nodes.map((node) =>
                      node.key === key ? { ...node, z: ownerKey ?? "root" } : node,
                    ),
                  });
                  setMessage(ownerKey === null ? "已移出子图" : "已归入子图");
                }}
                onToggleSubflow={(key) => {
                  setExpanded((current) => {
                    const next = new Set(current);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  });
                }}
              />
            ) : (
              <GraphView
                nodes={liveNodes(graphTasks)}
                links={liveLinks(graphTasks)}
                selectedKey={selectedKey}
                editable={false}
                satellites={satellitesOn ? satellites : []}
                onSelect={setSelectedKey}
              />
            )}
          </div>
          {mode === "live" && traceOn && (
            <div style={{ maxHeight: 220, overflow: "auto", borderTop: "1px solid #1e293b", background: "#0b1222", padding: "8px 12px", fontSize: 12 }}>
              <div style={{ color: "#94a3b8", marginBottom: 4 }}>Trace（每次尝试的段时序）</div>
              {visibleTraces.length === 0 && <div style={{ color: "#475569" }}>暂无尝试时间线。</div>}
              {visibleTraces.map((row) => {
                const times = row.spans.flatMap((span) => [Date.parse(span.start), Date.parse(span.end)]);
                const t0 = Math.min(...times);
                const t1 = Math.max(...times);
                const spanMs = Math.max(t1 - t0, 1);
                return (
                  <div key={row.attemptId} style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 8, alignItems: "center", padding: "2px 0" }}>
                    <div style={{ color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.taskTitle} · {row.role}
                    </div>
                    <div style={{ position: "relative", height: 16, background: "#0f172a", borderRadius: 4 }}>
                      {row.spans.map((span, index) => {
                        const start = Date.parse(span.start);
                        const end = Date.parse(span.end);
                        const left = ((start - t0) / spanMs) * 100;
                        const width = Math.max(((end - start) / spanMs) * 100, 1.5);
                        const ms = end - start;
                        return (
                          <div
                            key={index}
                            title={`${span.label} · ${ms}ms`}
                            style={{
                              position: "absolute",
                              left: `${left}%`,
                              width: `${width}%`,
                              top: 2,
                              bottom: 2,
                              background: "#3b82f6",
                              borderRadius: 3,
                              minWidth: 4,
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div style={{ color: "#94a3b8", fontSize: 12, minHeight: 18 }}>{message}</div>
      </div>
      <div style={{ overflow: "auto", border: "1px solid #1e293b", borderRadius: 10, padding: 12, background: "#0b1222", display: "grid", gap: 12, alignContent: "start", color: "#e2e8f0" }}>
        {mode === "draft" ? (
          <CanvasEditor
            doc={doc}
            selectedKey={selectedKey}
            onMessage={setMessage}
            refresh={() => void refresh()}
            onSelect={setSelectedKey}
            onDocChange={setDoc}
          />
        ) : (
          <>
            <section style={{ display: "grid", gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 13 }}>架构</h3>
              <ArchitectureBar
                goal={graph?.project.goal ?? ""}
                presets={presets}
                doc={doc}
                onMessage={setMessage}
                onDocChange={(next) => {
                  setDoc(next);
                  setMode("draft");
                }}
                onHandcraft={() => setMode("draft")}
              />
            </section>
            <section style={{ display: "grid", gap: 8, borderTop: "1px solid #1e293b", paddingTop: 10 }}>
              <h3 style={{ margin: 0, fontSize: 13 }}>门禁证据</h3>
              <GateForm attemptIds={attemptIds} onMessage={setMessage} refresh={() => void refresh()} />
            </section>
            <section style={{ display: "grid", gap: 8, borderTop: "1px solid #1e293b", paddingTop: 10 }}>
              <h3 style={{ margin: 0, fontSize: 13 }}>晋升</h3>
              <PromoteForm onMessage={setMessage} refresh={() => void refresh()} />
            </section>
            <section style={{ display: "grid", gap: 8, borderTop: "1px solid #1e293b", paddingTop: 10 }}>
              <h3 style={{ margin: 0, fontSize: 13 }}>选中任务</h3>
              {selectedTask === null ? (
                <div style={{ color: "#475569" }}>点选图上任务节点。</div>
              ) : (
                <TaskDetails task={selectedTask} />
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Center(props: { children: React.ReactNode }) {
  return (
    <div style={{ height: "100vh", display: "grid", placeItems: "center", background: "#020617", color: "#e2e8f0" }}>
      {props.children}
    </div>
  );
}
