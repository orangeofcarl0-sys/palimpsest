import { useState } from "react";

import {
  control,
  declareProposal,
  presetDraft,
  validateProposal,
  type ProposalDiagnostic,
} from "./api";
import {
  stateColor,
  type GraphTask,
  type PresetMeta,
  type ProjectProposal,
  type TaskProposal,
} from "./types";

export interface DraftTask extends TaskProposal {
  key: string;
}

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

export function TaskDetails({ task }: { task: GraphTask }) {
  return (
    <div style={{ display: "grid", gap: 8, fontSize: 12 }}>
      <div>
        <div style={{ color: "#94a3b8" }}>任务</div>
        <div>
          {task.taskId} · {task.objective}
        </div>
        <div>
          状态 <b style={{ color: stateColor(task.state) }}>{task.state}</b> · 角色 {task.role}
        </div>
        <div style={{ color: "#94a3b8" }}>写域 {task.writePaths.join(", ") || "—"}</div>
        <div style={{ color: "#94a3b8" }}>产物 {task.requiredArtifacts.join(", ") || "—"}</div>
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

export function DraftEditor(props: {
  draft: { goal: string; tasks: DraftTask[] };
  selectedKey: string | null;
  onMessage(message: string): void;
  refresh(): void;
  onSelect(key: string): void;
  onDraftChange(draft: { goal: string; tasks: DraftTask[] }): void;
}) {
  const { draft, selectedKey } = props;
  const selected = draft.tasks.find((task) => task.key === selectedKey) ?? null;
  const [diagnostics, setDiagnostics] = useState<ProposalDiagnostic[] | null>(null);
  const [confirming, setConfirming] = useState(false);

  const proposal = (): ProjectProposal => ({
    goal: draft.goal,
    changeClass: "behavior_change",
    tasks: draft.tasks.map(({ key: _key, ...rest }) => rest),
  });

  const update = (key: string, patch: Partial<TaskProposal>): void => {
    props.onDraftChange({
      ...draft,
      tasks: draft.tasks.map((task) => (task.key === key ? { ...task, ...patch } : task)),
    });
  };

  return (
    <div style={{ display: "grid", gap: 8, fontSize: 12 }}>
      <div>
        <div style={{ color: "#94a3b8" }}>目标</div>
        <input
          style={field}
          value={draft.goal}
          onChange={(event) => props.onDraftChange({ ...draft, goal: event.target.value })}
        />
      </div>
      <div>
        <div style={{ color: "#94a3b8" }}>任务（{draft.tasks.length}）— 连线建依赖，点选编辑</div>
        <button
          style={button(false)}
          onClick={() => {
            const key = `draft-${draft.tasks.length + 1}-${Date.now() % 1000}`;
            props.onDraftChange({
              ...draft,
              tasks: [...draft.tasks, { key, title: `新阶段 ${draft.tasks.length + 1}`, dependsOn: [] }],
            });
            props.onSelect(key);
          }}
        >
          ＋ 加阶段
        </button>
      </div>
      {selected === null ? (
        <div style={{ color: "#475569" }}>点选图上节点编辑。</div>
      ) : (
        <div style={{ display: "grid", gap: 6, borderTop: "1px solid #1e293b", paddingTop: 8 }}>
          <input style={field} value={selected.title} onChange={(event) => update(selected.key, { title: event.target.value })} />
          <input
            style={field}
            placeholder="写域（逗号分隔）"
            value={(selected.writePaths ?? []).join(", ")}
            onChange={(event) =>
              update(selected.key, {
                writePaths: event.target.value.split(",").map((s) => s.trim()).filter((s) => s !== ""),
              })
            }
          />
          <input
            style={field}
            placeholder="产物（逗号分隔）"
            value={(selected.requiredArtifacts ?? []).join(", ")}
            onChange={(event) =>
              update(selected.key, {
                requiredArtifacts: event.target.value.split(",").map((s) => s.trim()).filter((s) => s !== ""),
              })
            }
          />
          <input
            style={field}
            placeholder="建议门禁 id（可选）"
            value={selected.gateId ?? ""}
            onChange={(event) => update(selected.key, event.target.value === "" ? { gateId: undefined } : { gateId: event.target.value })}
          />
          <button
            style={button(false)}
            onClick={() => {
              props.onDraftChange({ ...draft, tasks: draft.tasks.filter((task) => task.key !== selected.key) });
              props.onSelect("");
            }}
          >
            删除此阶段
          </button>
        </div>
      )}
      <div style={{ borderTop: "1px solid #1e293b", paddingTop: 8, display: "grid", gap: 6 }}>
        <button
          style={button(true)}
          onClick={() =>
            void (async () => {
              const result = await validateProposal(proposal());
              setDiagnostics(result.diagnostics);
              setConfirming(result.diagnostics.length === 0);
            })()
          }
        >
          校验提案
        </button>
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
        {confirming && (
          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ color: "#cbd5e1" }}>
              将声明 {draft.tasks.length} 个阶段：{draft.tasks.map((t) => t.title).join(" → ")}
            </div>
            <button
              style={button(true)}
              onClick={() =>
                void (async () => {
                  try {
                    const result = await declareProposal(proposal());
                    if (result.declared) {
                      props.onMessage(`已声明（${result.eventType}）✓`);
                      setConfirming(false);
                      setDiagnostics(null);
                      props.refresh();
                    } else {
                      setDiagnostics(result.diagnostics);
                      setConfirming(false);
                    }
                  } catch (error) {
                    props.onMessage(`声明 ✕ ${error instanceof Error ? error.message : String(error)}`);
                  }
                })()
              }
            >
              确认声明
            </button>
            <button style={button(false)} onClick={() => setConfirming(false)}>
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
  onMessage(message: string): void;
  onDraftChange(draft: { goal: string; tasks: DraftTask[] }): void;
  onHandcraft(): void;
}) {
  const [presetId, setPresetId] = useState("");
  const selected = props.presets.find((preset) => preset.id === presetId) ?? props.presets[0] ?? null;
  // PLMP-ARCH-3: the kernel builds the draft (single source) - the panel only
  // maps the returned proposal onto the editable canvas. The old client-side
  // pipeline copy is retired, not kept behind a flag.
  const applyPreset = (): void => {
    if (selected === null) {
      props.onMessage("预设清单尚未加载");
      return;
    }
    void (async () => {
      try {
        const result = await presetDraft(selected.id, {
          goal: props.goal === "" ? "新目标" : props.goal,
        });
        props.onDraftChange({
          goal: result.proposal.goal,
          tasks: result.proposal.tasks.map((task, index) => ({
            ...task,
            key: `preset-${index}-${Date.now() % 1000}`,
          })),
        });
        props.onMessage("预设草稿已就绪（手搓模式可编辑）");
        props.onHandcraft();
      } catch (error) {
        props.onMessage(`预设草稿 ✕ ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  };
  const generate = (): void => {
    const instruction = `用 palimpsest-architect 为以下目标生成架构提案：「${props.goal}」。产出提案 JSON 后先用 architect 命令校验（空诊断才可声明），把阶段清单给我确认。`;
    void navigator.clipboard?.writeText(instruction).catch(() => undefined);
    props.onMessage("架构师指令已复制——粘贴给主代理会话");
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
          生成草稿
        </button>
      </div>
      {selected !== null && <div style={{ color: "#475569" }}>{selected.description}</div>}
      <button style={button(false)} onClick={generate}>
        从需求生成（复制架构师指令）
      </button>
    </div>
  );
}
