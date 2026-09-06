import { useCallback, useEffect, useState } from "react";

import { ApiError, getGraph, getToken, health, listPresets, setToken } from "./api";
import { GraphView, liveLinks, liveNodes } from "./GraphView";
import {
  ArchitectureBar,
  ControlBar,
  DraftEditor,
  GateForm,
  PromoteForm,
  TaskDetails,
  type DraftTask,
} from "./Panels";
import type { OrchestrationGraph, PresetMeta } from "./types";

type Mode = "live" | "draft";

export function App() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [graph, setGraph] = useState<OrchestrationGraph | null>(null);
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const [presets, setPresets] = useState<PresetMeta[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("live");
  const [draft, setDraft] = useState<{ goal: string; tasks: DraftTask[] }>({ goal: "", tasks: [] });
  const [message, setMessage] = useState("");

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
  const nodes = mode === "draft" ? draftTasksAsNodes(draft) : liveNodes(graphTasks);
  const links = mode === "draft" ? draftLinks(draft) : liveLinks(graphTasks);
  const attemptIds = graphTasks.flatMap((task) => task.attempts.map((attempt) => attempt.attemptId));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 12, height: "100vh", boxSizing: "border-box", padding: 12, background: "#020617" }}>
      <div style={{ display: "grid", gridTemplateRows: "auto auto 1fr auto", gap: 8, minHeight: 0 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "baseline", color: "#e2e8f0" }}>
          <b>palimpsest 图面</b>
          <span style={{ color: "#94a3b8", fontSize: 12 }}>
            {graph === null ? "—" : `${graph.project.goal} · revision ${graph.project.revision}${graph.project.paused ? " · 已暂停" : ""}`}
          </span>
          <span style={{ flex: 1 }} />
          <button
            onClick={() => setMode(mode === "live" ? "draft" : "live")}
            style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #334155", background: mode === "draft" ? "#7c3aed" : "#1e293b", color: "#e2e8f0", cursor: "pointer", fontSize: 12 }}
          >
            {mode === "live" ? "手搓模式" : "回到实时"}
          </button>
        </div>
        <ControlBar paused={graph?.project.paused === true} onMessage={setMessage} refresh={() => void refresh()} />
        <div style={{ minHeight: 0, border: "1px solid #1e293b", borderRadius: 10, overflow: "hidden" }}>
          <GraphView
            nodes={nodes}
            links={links}
            selectedKey={selectedKey}
            editable={mode === "draft"}
            onSelect={setSelectedKey}
            onConnect={(from, to) => {
              const sourceTitle = draft.tasks.find((task) => task.key === from)?.title;
              if (sourceTitle === undefined) return;
              setDraft({
                ...draft,
                tasks: draft.tasks.map((task) =>
                  task.key === to && !task.dependsOn.includes(sourceTitle)
                    ? { ...task, dependsOn: [...task.dependsOn, sourceTitle] }
                    : task,
                ),
              });
            }}
          />
        </div>
        <div style={{ color: "#94a3b8", fontSize: 12, minHeight: 18 }}>{message}</div>
      </div>
      <div style={{ overflow: "auto", border: "1px solid #1e293b", borderRadius: 10, padding: 12, background: "#0b1222", display: "grid", gap: 12, alignContent: "start", color: "#e2e8f0" }}>
        {mode === "draft" ? (
          <DraftEditor
            draft={draft}
            selectedKey={selectedKey}
            onMessage={setMessage}
            refresh={() => void refresh()}
            onSelect={setSelectedKey}
            onDraftChange={setDraft}
          />
        ) : (
          <>
            <section style={{ display: "grid", gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 13 }}>架构</h3>
              <ArchitectureBar
                goal={graph?.project.goal ?? ""}
                presets={presets}
                onMessage={setMessage}
                onDraftChange={setDraft}
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

function draftTasksAsNodes(draft: { tasks: DraftTask[] }) {
  return draft.tasks.map((task) => ({
    key: task.key,
    label: task.title,
    sub: task.dependsOn.length > 0 ? `依赖 ${task.dependsOn.length}` : "无依赖",
    color: "#7c3aed",
  }));
}

function draftLinks(draft: { tasks: DraftTask[] }): Array<[number, number]> {
  // Dependencies are titles - the proposal's own vocabulary (ARCH-3 presets
  // and the canvas connect handler both store titles), so the link index is
  // keyed by title too.
  const index = new Map(draft.tasks.map((task, i) => [task.title, i]));
  const links: Array<[number, number]> = [];
  for (const task of draft.tasks) {
    for (const dependency of task.dependsOn) {
      const from = index.get(dependency);
      const to = index.get(task.title);
      if (from !== undefined && to !== undefined) links.push([from, to]);
    }
  }
  return links;
}

function Center(props: { children: React.ReactNode }) {
  return (
    <div style={{ height: "100vh", display: "grid", placeItems: "center", background: "#020617", color: "#e2e8f0" }}>
      {props.children}
    </div>
  );
}
