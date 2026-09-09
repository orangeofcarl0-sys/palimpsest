import { useState } from "react";

import {
  compileCanvas,
  control,
  declareProposal,
  diffCanvas,
  insertProposal,
  patchCanvas,
  presetDraft,
  type CanvasPatchResult,
} from "./api";
import {
  CANVAS_ROLES,
  stateColor,
  type CanvasDoc,
  type CanvasNode,
  type CanvasDiffResult,
  type GraphTask,
  type HoldControlView,
  type PresetMeta,
  type ProjectProposal,
  type ProposalDiagnostic,
} from "./types";
import {
  canvasAddGroup,
  canvasAddNode,
  canvasRemoveEdge,
  canvasRemoveGroup,
  canvasRemoveNode,
} from "./canvasMutate";
import { anchorCanvas } from "./api";

const PREDICATES = ["tests_pass", "process_exit_zero", "lint_pass", "tests_fail", "expected_files_exist", "write_scope_valid"];

function button(primary: boolean): React.CSSProperties {
  return {
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid #334155",
    background: primary ? "#3b82f6" : "#1e293b",
    color: "#e2e8f0",
    cursor: "pointer",
    fontSize: 12,
  };
}

const field: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 6,
  color: "#e2e8f0",
  padding: "5px 8px",
  fontSize: 12,
};

export function ControlBar(props: { paused: boolean; onMessage(message: string): void; refresh(): void }) {
  const act = async (op: string, body?: unknown, label = op): Promise<void> => {
    try {
      await control(op, body);
      props.onMessage(`${label} ✓`);
      props.refresh();
    } catch (error) {
      props.onMessage(`${label} ✕ ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {props.paused ? (
        <button style={button(true)} onClick={() => void act("resume", { reason: "面板恢复" }, "恢复")}>
          恢复
        </button>
      ) : (
        <button style={button(false)} onClick={() => void act("pause", { reason: "面板暂停" }, "暂停")}>
          暂停
        </button>
      )}
      <button style={button(false)} onClick={() => void act("next", undefined, "单步")}>
        单步
      </button>
      <button style={button(false)} onClick={() => void act("run", { maxSteps: 20 }, "机械推进")}>
        机械推进 ×20
      </button>
    </div>
  );
}

export function GateForm(props: {
  attemptIds: string[];
  onMessage(message: string): void;
  refresh(): void;
}) {
  const [predicate, setPredicate] = useState("tests_pass");
  const [exitCode, setExitCode] = useState("0");
  const [command, setCommand] = useState("python -m pytest");
  const [attemptId, setAttemptId] = useState(props.attemptIds[0] ?? "");
  const effective = props.attemptIds.includes(attemptId) ? attemptId : (props.attemptIds[0] ?? "");
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <select style={field} value={effective} onChange={(event) => setAttemptId(event.target.value)}>
          {(props.attemptIds.length > 0 ? props.attemptIds : [""]).map((id) => (
            <option key={id} value={id}>
              {id || "（无 attempt）"}
            </option>
          ))}
        </select>
        <select style={field} value={predicate} onChange={(event) => setPredicate(event.target.value)}>
          {PREDICATES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input style={{ ...field, width: 70 }} value={exitCode} onChange={(event) => setExitCode(event.target.value)} />
        <input style={field} value={command} onChange={(event) => setCommand(event.target.value)} />
      </div>
      <button
        style={button(true)}
        disabled={effective === ""}
        onClick={() =>
          void (async () => {
            try {
              await control("gate", {
                attemptId: effective,
                predicate,
                exitCode: Number(exitCode) || 0,
                command: command.trim().split(/\s+/),
              });
              props.onMessage("门禁证据已记录 ✓");
              props.refresh();
            } catch (error) {
              props.onMessage(`门禁 ✕ ${error instanceof Error ? error.message : String(error)}`);
            }
          })()
        }
      >
        记录门禁证据
      </button>
    </div>
  );
}

export function PromoteForm(props: { onMessage(message: string): void; refresh(): void }) {
  const [gateId, setGateId] = useState("gate-release");
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <input style={field} value={gateId} onChange={(event) => setGateId(event.target.value)} />
      <button
        style={button(true)}
        onClick={() =>
          void (async () => {
            try {
              const { result } = await control("promote", { gateId });
              const promoted = (result as { promoted?: boolean }).promoted === true;
              props.onMessage(promoted ? "已晋升 ✓" : "门禁未 PASS，未晋升");
              props.refresh();
            } catch (error) {
              props.onMessage(`晋升 ✕ ${error instanceof Error ? error.message : String(error)}`);
            }
          })()
        }
      >
        晋升
      </button>
    </div>
  );
}

/** PLMP-GRAPH-5 §B2-D: every debugger hold as governance state - stale and
 * orphan controls stay observable even when the task graph moved on. */
export function ControlsPanel(props: { holds: readonly HoldControlView[] }) {
  if (props.holds.length === 0) return null;
  const statusColor = (status: HoldControlView["status"]): string =>
    status === "active" ? "#f87171" : status === "stale" ? "#fbbf24" : "#94a3b8";
  return (
    <div style={{ display: "grid", gap: 6, fontSize: 12 }}>
      <div style={{ color: "#94a3b8" }}>治理挂起（全部 hold，含过期与孤儿）</div>
      {props.holds.map((hold) => (
        <div key={hold.taskId} data-hold-task-id={hold.taskId}>
          <code style={{ color: "#7dd3fc" }}>{hold.taskId}</code>{" "}
          <b style={{ color: statusColor(hold.status) }}>{hold.status}</b>
          <span style={{ color: "#94a3b8" }}>
            {" "}
            · 锚定 r{hold.setAtRevision ?? "?"} / 现 r{hold.currentRevision} · {hold.reason}（
            {hold.declaredBy}）
          </span>
          {hold.definitionId !== undefined && (
            <span style={{ color: "#475569" }}> · def {hold.definitionId}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export function TaskDetails(props: {  task: GraphTask;
  onMessage?(message: string): void;
  refresh?(): void;
}) {
  const { task } = props;
  const hold = async (set: boolean): Promise<void> => {
    try {
      const op = set
        ? control("holdSet", { taskId: task.taskId, reason: "调试断点" })
        : control("holdClear", { taskId: task.taskId, reason: "调试放行" });
      await op;
      props.onMessage?.(set ? "已挂起 ✓" : "已放行 ✓");
      props.refresh?.();
    } catch (error) {
      props.onMessage?.(`${set ? "挂起" : "放行"} ✕ ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  return (
    <div style={{ display: "grid", gap: 8, fontSize: 12 }}>
      <div>
        <div style={{ color: "#94a3b8" }}>任务</div>
        <div>
          {task.taskId} · {task.objective}
        </div>
        <div>
          状态 <b style={{ color: stateColor(task.state) }}>{task.state}</b> · 角色 {task.role}
          {task.held === "active" ? (
            <span style={{ marginLeft: 6, background: "#7f1d1d", borderRadius: 6, padding: "1px 6px", fontSize: 10 }}>
              挂起
            </span>
          ) : null}
          {task.held === "stale" ? (
            <span style={{ marginLeft: 6, background: "#78350f", borderRadius: 6, padding: "1px 6px", fontSize: 10 }}>
              挂起·已过期（修订前断点，不再拦截）
            </span>
          ) : null}
        </div>
        <div style={{ color: "#94a3b8" }}>写域 {task.writePaths.join(", ") || "—"}</div>
        {task.scopeId !== undefined && <div style={{ color: "#94a3b8" }}>scope {task.scopeId}</div>}
        {task.definitionId !== undefined && <div style={{ color: "#94a3b8" }}>definition {task.definitionId}</div>}
        <div style={{ color: "#94a3b8" }}>产物 {task.requiredArtifacts.join(", ") || "—"}</div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {task.held !== undefined ? (
          <button style={button(false)} onClick={() => void hold(false)}>
            放行（清除断点）
          </button>
        ) : (
          <button style={button(false)} onClick={() => void hold(true)}>
            挂起（断点）
          </button>
        )}
      </div>
      {task.attempts.map((attempt) => (
        <div key={attempt.attemptId} style={{ borderTop: "1px solid #1e293b", paddingTop: 6 }}>
          <div>
            <code style={{ color: "#7dd3fc" }}>{attempt.attemptId.slice(0, 16)}…</code>{" "}
            <b style={{ color: stateColor(attempt.state) }}>{attempt.state}</b>
            {attempt.attribution === undefined ? null : (
              <span style={{ color: "#94a3b8" }}> · {attempt.attribution.model}（{attempt.attribution.cost}）</span>
            )}
          </div>
          {attempt.evidence.length > 0 && (
            <div style={{ color: "#94a3b8" }}>证据 {attempt.evidence.length} 条</div>
          )}
          <div style={{ marginTop: 4, display: "grid", gap: 2 }}>
            {attempt.timeline.map((entry, index) => (
              <div key={index} style={{ color: "#cbd5e1" }}>
                · {entry.label}
                <span style={{ color: "#475569" }}>　{entry.at.slice(11, 19)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** PLMP-CANVAS-2: the doc inspector - compile/diff are kernel derivations. */
export function CanvasEditor(props: {
  doc: CanvasDoc;
  selectedKey: string | null;
  onMessage(message: string): void;
  refresh(): void;
  onSelect(key: string | null): void;
  onDocChange(doc: CanvasDoc): void;
}) {
  const { doc, selectedKey } = props;
  const selected = doc.nodes.find((node) => node.key === selectedKey) ?? null;
  const selectedGroup = doc.groups.find((group) => group.id === selectedKey) ?? null;
  // PLMP-CANVAS-6: dependencies are node keys; chips display the resolved
  // title (a dangling key shows raw - honest).
  const titleByKey = new Map(doc.nodes.map((node) => [node.key, node.title]));
  const [diagnostics, setDiagnostics] = useState<ProposalDiagnostic[] | null>(null);
  const [diff, setDiff] = useState<CanvasDiffResult | null>(null);
  const [confirming, setConfirming] = useState<ProjectProposal | null>(null);
  // PLMP-GRAPH-2: the patch review face - preview first, apply on confirm.
  const [patchText, setPatchText] = useState<string | null>(null);
  const [patchReview, setPatchReview] = useState<CanvasPatchResult | null>(null);

  const patchNode = (key: string, patch: Partial<CanvasNode>): void => {
    props.onDocChange({
      ...doc,
      nodes: doc.nodes.map((node) => (node.key === key ? { ...node, ...patch } : node)),
    });
  };
  const patchTask = (key: string, patch: Partial<NonNullable<CanvasNode["task"]>>): void => {
    const node = doc.nodes.find((entry) => entry.key === key);
    if (node?.task === undefined) return;
    patchNode(key, { task: { ...node.task, ...patch } });
  };
  // PLMP-CANVAS-7 D6/D9: every structural mutation goes through the
  // centralized mutation mirror (MUT-INV-1) - no inline integrity logic.
  const addNode = (type: CanvasNode["type"]): void => {
    try {
      const title =
        type === "task"
          ? `新任务 ${doc.nodes.filter((n) => n.type === "task").length + 1}`
          : type === "subflow"
            ? `子图 ${doc.nodes.filter((n) => n.type === "subflow").length + 1}`
            : "注记";
      const added = canvasAddNode(doc, { type, title, ...(type === "annotation" ? { text: "备注…" } : {}) });
      props.onDocChange(added.doc);
      props.onSelect(added.id);
    } catch (error) {
      props.onMessage(`新增 ✕ ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const compileAndShow = (): void => {
    void (async () => {
      try {
        const result = await compileCanvas(doc);
        setDiagnostics(result.diagnostics);
        setConfirming(result.diagnostics.length === 0 ? result.proposal : null);
      } catch (error) {
        setDiagnostics([{ type: "CANVAS_DOC", detail: error instanceof Error ? error.message : String(error) }]);
        setConfirming(null);
      }
    })();
  };

  const showDiff = (): void => {
    void (async () => {
      try {
        const result = await diffCanvas({ doc });
        setDiff(result.diff);
      } catch (error) {
        props.onMessage(`对照 ✕ ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  };

  const reviewPatch = (): void => {
    void (async () => {
      try {
        const patch = JSON.parse(patchText ?? "") as unknown;
        const result = await patchCanvas(doc, patch);
        setPatchReview(result);
      } catch (error) {
        props.onMessage(`Patch ✕ ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  };

  const applyPatch = (): void => {
    if (patchReview?.doc === undefined) return;
    props.onDocChange(patchReview.doc);
    setPatchReview(null);
    setPatchText(null);
    props.onMessage("Patch 已应用到草稿");
  };

  const patchPreviewColor = (op: string): string =>
    op === "add" ? "#22c55e" : op === "remove" ? "#ef4444" : op === "move" ? "#38bdf8" : "#f59e0b";

  return (
    <div style={{ display: "grid", gap: 8, fontSize: 12 }}>
      <div>
        <div style={{ color: "#94a3b8" }}>目标</div>
        <input
          style={field}
          aria-label="画布目标"
          value={doc.goal}
          onChange={(event) => props.onDocChange({ ...doc, goal: event.target.value })}
        />
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button style={button(false)} onClick={() => addNode("task")}>＋任务</button>
        <button style={button(false)} onClick={() => addNode("subflow")}>＋子图</button>
        <button style={button(false)} onClick={() => addNode("annotation")}>＋注记</button>
        <button
          style={button(false)}
          onClick={() => {
            try {
              const group = canvasAddGroup(doc, { label: `分组 ${doc.groups.length + 1}` });
              props.onDocChange(group.doc);
              props.onSelect(group.id);
            } catch (error) {
              props.onMessage(`建组 ✕ ${error instanceof Error ? error.message : String(error)}`);
            }
          }}
        >
          ＋分组
        </button>
      </div>
      <div style={{ color: "#475569" }}>连线建依赖；把任务拖进子图框内即归入。</div>
      {selectedGroup !== null ? (
        <div style={{ display: "grid", gap: 6, borderTop: "1px solid #1e293b", paddingTop: 8 }}>
          <input
            style={field}
            value={selectedGroup.label}
            onChange={(event) =>
              props.onDocChange({
                ...doc,
                groups: doc.groups.map((group) =>
                  group.id === selectedGroup.id ? { ...group, label: event.target.value } : group,
                ),
              })
            }
          />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {selectedGroup.members.map((member) => (
              <span key={member} style={{ background: "#1e293b", borderRadius: 6, padding: "2px 6px" }}>
                {doc.nodes.find((node) => node.key === member)?.title ?? member}
                <button
                  style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", marginLeft: 4 }}
                  onClick={() =>
                    props.onDocChange({
                      ...doc,
                      groups: doc.groups.map((group) =>
                        group.id === selectedGroup.id
                          ? { ...group, members: group.members.filter((entry) => entry !== member) }
                          : group,
                      ),
                    })
                  }
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <select
            style={field}
            value=""
            onChange={(event) => {
              if (event.target.value === "") return;
              props.onDocChange({
                ...doc,
                groups: doc.groups.map((group) =>
                  group.id === selectedGroup.id && !group.members.includes(event.target.value)
                    ? { ...group, members: [...group.members, event.target.value] }
                    : group,
                ),
              });
            }}
          >
            <option value="">＋ 加入成员…</option>
            {doc.nodes
              .filter((node) => node.type === "task" && node.z === "root" && !selectedGroup.members.includes(node.key))
              .map((node) => (
                <option key={node.key} value={node.key}>
                  {node.title}
                </option>
              ))}
          </select>
          <button
            style={button(false)}
            onClick={() => {
              // PLMP-CANVAS-7 D6: nested child groups lift to the top level
              // inside the helper - no dangling `g` reference remains.
              props.onDocChange(canvasRemoveGroup(doc, selectedGroup.id));
              props.onSelect(null);
            }}
          >
            删除分组
          </button>
        </div>
      ) : selected === null ? (
        <div style={{ color: "#475569" }}>点选图上节点编辑。</div>
      ) : (
        <div style={{ display: "grid", gap: 6, borderTop: "1px solid #1e293b", paddingTop: 8 }}>
          {selected.type === "annotation" ? (
            <>
              <textarea
                style={{ ...field, minHeight: 64 }}
                aria-label="注记内容"
                value={selected.text ?? ""}
                onChange={(event) => patchNode(selected.key, { text: event.target.value })}
              />
            </>
          ) : (
            <>
              <input
                style={field}
                aria-label="节点标题"
                value={selected.title}
                onChange={(event) => patchNode(selected.key, { title: event.target.value })}
              />
            </>
          )}
          {selected.type === "subflow" && (
            <select
              style={field}
              value={selected.mode === "runtime" ? "runtime" : "editorial"}
              onChange={(event) =>
                patchNode(selected.key, {
                  mode: event.target.value === "runtime" ? "runtime" : undefined,
                })
              }
            >
              <option value="editorial">编辑期子图（编译展开）</option>
              <option value="runtime">运行时子图（scope 归属）</option>
            </select>
          )}
          {selected.type === "task" && selected.task !== undefined && (
            <>
              <input
                style={field}
                placeholder="写域（逗号分隔）"
                value={(selected.task.writePaths ?? []).join(", ")}
                onChange={(event) =>
                  patchTask(selected.key, {
                    writePaths: event.target.value.split(",").map((s) => s.trim()).filter((s) => s !== ""),
                  })
                }
              />
              <input
                style={field}
                placeholder="产物（逗号分隔）"
                value={(selected.task.requiredArtifacts ?? []).join(", ")}
                onChange={(event) =>
                  patchTask(selected.key, {
                    requiredArtifacts: event.target.value.split(",").map((s) => s.trim()).filter((s) => s !== ""),
                  })
                }
              />
              <input
                style={field}
                placeholder="建议门禁 id（可选）"
                value={selected.task.gateId ?? ""}
                onChange={(event) =>
                  patchTask(selected.key, event.target.value === "" ? { gateId: undefined } : { gateId: event.target.value })
                }
              />
              <div style={{ display: "flex", gap: 6 }}>
                <select
                  style={field}
                  value={selected.task.role ?? ""}
                  onChange={(event) =>
                    patchTask(selected.key, event.target.value === "" ? { role: undefined } : { role: event.target.value })
                  }
                >
                  <option value="">角色（缺省 implementer）</option>
                  {CANVAS_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>
              <input
                style={field}
                placeholder="技能提示（逗号分隔）"
                value={(selected.task.suggestedSkills ?? []).join(", ")}
                onChange={(event) =>
                  patchTask(selected.key, {
                    suggestedSkills: event.target.value.split(",").map((s) => s.trim()).filter((s) => s !== ""),
                  })
                }
              />
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {doc.edges
                  .filter((edge) => edge.target === selected.key)
                  .map((edge) => (
                    <span key={edge.id} style={{ background: "#1e293b", borderRadius: 6, padding: "2px 6px" }}>
                      ← {titleByKey.get(edge.source) ?? edge.source}
                      <button
                        style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", marginLeft: 4 }}
                        onClick={() => props.onDocChange(canvasRemoveEdge(doc, edge.id))}
                      >
                        ×
                      </button>
                    </span>
                  ))}
              </div>
            </>
          )}
          <button
            style={button(false)}
            onClick={() => {
              try {
                // PLMP-CANVAS-7 D6: the one mutation truth - incident edges,
                // membership and the one-level child lift are the helper's
                // job, not the component's.
                props.onDocChange(canvasRemoveNode(doc, selected.key));
                props.onSelect(null);
              } catch (error) {
                props.onMessage(`删除 ✕ ${error instanceof Error ? error.message : String(error)}`);
              }
            }}
          >
            {selected.type === "subflow" ? "删除子图（成员回到上一层）" : "删除此节点"}
          </button>
        </div>
      )}
      <div style={{ borderTop: "1px solid #1e293b", paddingTop: 8, display: "grid", gap: 6 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button style={button(true)} onClick={compileAndShow}>
            校验提案
          </button>
          <button style={button(false)} onClick={showDiff}>
            对照实时
          </button>
          <button
            style={button(false)}
            onClick={() => {
              setPatchText(patchText === null ? "" : null);
              setPatchReview(null);
            }}
          >
            GraphPatch
          </button>
        </div>
        {patchText !== null && (
          <div style={{ display: "grid", gap: 4 }}>
            <textarea
              style={{ ...field, minHeight: 96, fontFamily: "monospace" }}
              placeholder='粘贴 GraphPatch JSON（主代理产出；{"addNodes":[…],"addEdges":[…]}）'
              value={patchText}
              onChange={(event) => setPatchText(event.target.value)}
            />
            {patchText.trim() !== "" && (
              <div style={{ color: "#94a3b8" }}>
                锚状态：
                {(() => {
                  try {
                    const parsed = JSON.parse(patchText) as {
                      baseGraphDigest?: unknown;
                      baseRevision?: unknown;
                    };
                    const hasDigest = typeof parsed.baseGraphDigest === "string";
                    const hasRevision = typeof parsed.baseRevision === "number";
                    // PLMP-CANVAS-7 D8 §13: FULL / PARTIAL / UNANCHORED -
                    // a single anchor is PARTIAL, never "anchored".
                    if (hasDigest && hasRevision) return "FULL（baseRevision + baseGraphDigest）";
                    if (hasDigest || hasRevision) {
                      return `PARTIAL（仅 ${hasDigest ? "baseGraphDigest" : "baseRevision"}——更新保护不完整）`;
                    }
                    return "UNANCHORED 未锚定——丢失更新保护不生效（协议允许，但生成时应全锚）";
                  } catch {
                    return "JSON 未完成";
                  }
                })()}
              </div>
            )}
            <div style={{ display: "flex", gap: 6 }}>
              <button style={button(false)} disabled={patchText.trim() === ""} onClick={reviewPatch}>
                预览 Patch
              </button>
              {patchReview !== null && patchReview.doc !== undefined && (
                <button style={button(true)} onClick={applyPatch}>
                  应用到草稿
                </button>
              )}
            </div>
            {patchReview !== null && (
              <div style={{ display: "grid", gap: 2 }}>
                <div style={{ color: "#94a3b8" }}>
                  {patchReview.applied ? "Patch 可应用（预览如下）" : "Patch 被拒绝"}
                </div>
                {patchReview.preview.map((entry, index) => (
                  <div key={index} style={{ color: patchPreviewColor(entry.op) }}>
                    {entry.op === "add" ? "＋" : entry.op === "remove" ? "－" : entry.op === "move" ? "⇒" : "±"}{" "}
                    {entry.detail}
                  </div>
                ))}
                {patchReview.diagnostics.map((d, index) => (
                  <div key={index} style={{ color: "#f59e0b" }}>
                    {d.type}
                    {d.id === undefined ? "" : `（${d.id}）`}： {d.detail}
                  </div>
                ))}
                {patchReview.compileError !== undefined && (
                  <div style={{ color: "#f59e0b" }}>编译： {patchReview.compileError}</div>
                )}
              </div>
            )}
          </div>
        )}
        {diagnostics !== null && (
          <div>
            {diagnostics.length === 0 ? (
              <div style={{ color: "#22c55e" }}>校验通过——确认后声明。</div>
            ) : (
              diagnostics.map((d, index) => (
                <div key={index} style={{ color: "#f59e0b" }}>
                  {d.type}
                  {d.task === undefined ? "" : `（${d.task}）`}： {d.detail}
                </div>
              ))
            )}
          </div>
        )}
        {diff !== null && (
          <div style={{ display: "grid", gap: 2 }}>
            <div style={{ color: "#94a3b8" }}>对照实时图（新增/移除/变更）</div>
            {diff.added.map((entry) => (
              <div key={entry.title} style={{ color: "#22c55e" }}>＋ {entry.title}</div>
            ))}
            {diff.removed.map((entry) => (
              <div key={entry.title} style={{ color: "#ef4444" }}>－ {entry.title}</div>
            ))}
            {diff.changed.map((entry) => (
              <div key={entry.title} style={{ color: "#f59e0b" }}>
                ± {entry.title}（{entry.fields.join("、")}）
              </div>
            ))}
            {diff.added.length + diff.removed.length + diff.changed.length === 0 && (
              <div style={{ color: "#475569" }}>与实时图一致。</div>
            )}
          </div>
        )}
        {confirming !== null && (
          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ color: "#cbd5e1" }}>
              将声明 {confirming.tasks.length} 个任务：{confirming.tasks.map((task) => task.title).join(" → ")}
            </div>
            <button
              style={button(true)}
              onClick={() =>
                void (async () => {
                  try {
                    const result = await declareProposal(confirming);
                    if (result.declared) {
                      props.onMessage(`已声明（${result.eventType}）✓`);
                      setConfirming(null);
                      setDiagnostics(null);
                      props.refresh();
                    } else {
                      props.onMessage("声明被拒（诊断见上）");
                    }
                  } catch (error) {
                    props.onMessage(`声明 ✕ ${error instanceof Error ? error.message : String(error)}`);
                  }
                })()
              }
            >
              确认声明
            </button>
            <button style={button(false)} onClick={() => setConfirming(null)}>
              取消
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ArchitectureBar(props: {
  goal: string;
  presets: PresetMeta[];
  doc: CanvasDoc;
  onMessage(message: string): void;
  onDocChange(doc: CanvasDoc): void;
  onHandcraft(): void;
}) {
  const [presetId, setPresetId] = useState("");
  const selected = props.presets.find((preset) => preset.id === presetId) ?? props.presets[0] ?? null;
  // PLMP-ARCH-3 + CANVAS-1: presets are fragments inserted into the current
  // canvas (empty canvas = the whole draft), built kernel-side.
  const applyPreset = (): void => {
    if (selected === null) {
      props.onMessage("预设清单尚未加载");
      return;
    }
    void (async () => {
      try {
        const goal = props.doc.goal.trim() !== "" ? props.doc.goal : props.goal === "" ? "新目标" : props.goal;
        const draft = await presetDraft(selected.id, { goal });
        const result = await insertProposal(props.doc, draft.proposal);
        props.onDocChange(result.doc);
        props.onMessage("预设已插入画布（手搓模式可编辑）");
        props.onHandcraft();
      } catch (error) {
        props.onMessage(`预设 ✕ ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  };
  // PLMP-CANVAS-7 D8: the copied instruction carries a FULL anchor of the
  // draft the architect will edit against - revision + digest from ONE
  // /api/canvas/anchor observation, computed at generation time, never
  // injected later at review time. Runtime-invalid drafts still anchor.
  const generate = (): void => {
    void (async () => {
      let anchorLines: string;
      try {
        const anchor = await anchorCanvas(props.doc);
        anchorLines = [
          `当前画布草稿的锚（FULL：生成 patch 时必须原样携带，二者缺一即拒绝）：`,
          `"baseRevision": ${anchor.baseRevision},`,
          `"baseGraphDigest": "${anchor.baseGraphDigest}"`,
        ].join("\n");
      } catch (error) {
        anchorLines = `当前草稿无法取锚（${error instanceof Error ? error.message : String(error)}）——请让用户先修正草稿，或产出未锚定 patch（丢失更新保护不生效）。`;
      }
      const instruction = `用 palimpsest-architect 为以下目标生成架构提案：「${props.goal}」。产出提案 JSON 后先用 architect 命令校验（空诊断才可声明）；若要修改当前画布草稿，产出 GraphPatch JSON（七个操作数组齐全，样式同 EMPTY_PATCH）并携带当前锚：\n${anchorLines}\n把 patch JSON 交我在画布 GraphPatch 面预览应用。`;
      void navigator.clipboard?.writeText(instruction).catch(() => undefined);
      props.onMessage("架构师指令已复制（含草稿锚）——粘贴给主代理会话");
    })();
  };
  return (
    <div style={{ display: "grid", gap: 6, fontSize: 12 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <select
          style={{ ...field, flex: 1 }}
          value={selected?.id ?? ""}
          onChange={(event) => setPresetId(event.target.value)}
        >
          {props.presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
        <button style={button(false)} onClick={applyPreset}>
          插入画布
        </button>
      </div>
      {selected !== null && <div style={{ color: "#475569" }}>{selected.description}</div>}
      <button style={button(false)} onClick={generate}>
        从需求生成（复制架构师指令）
      </button>
    </div>
  );
}
