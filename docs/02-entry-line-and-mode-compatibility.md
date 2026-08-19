# Palimpsest 入口产品线（E 线）规划与 DSH 工作模式兼容基线

> Product revision：`PALIMPSEST-PLUGIN-E`
> 状态：规划冻结（本文）。前置：docs/01（P0–P3 合同与工具面已交付/冻结）。
> 本文回答两件事：**入口产品线怎么建**（一句话闭环、装备化 worker、断点续跑），以及 **DSH 工作模式如何影响工具上下文、插件如何兼容**（§3，横切约束，适用于 E 线所有里程碑）。

## 1. 定位

Palimpsest 做**宿主内的多 agent 入口**：易用、包装好、Ordarium 兜底、拓扑自由（manager 随时修订任务图，而非预写图）、worker 复用 DSH 的 skill/插件生态。不与 LangGraph 类框架在"开发者写代码画图"的战场竞争；SDK 化（核心可移植到其他宿主）作为入口线稳定后的独立提案，本文只预埋纪律（§2.4）。

与现状的关系：P0–P3 交付的是**机制**（合同、调度、effects、工具面、并行）；E 线交付的是**入口体验**——用户只说一句话，其余由宿主 agent + 插件循环完成。

## 2. 产品支柱与功能规格

### 2.1 E1 一句话全自动闭环（`palimpsest_run`）

**形态**：工具面与 CLI 同源（均薄封装 controller），新增 `palimpsest_run`。一次调用 = **一个回合**：做出下一个需要 LLM 判断的动作（修订计划 / 派发 worker / 评估报告 / 晋升决策），回合内部的机械步骤（调度推进、允许的 gate 命令、批次重试）由既有 `pump` 内核完成。

**关键决策——无 daemon**：循环的驱动者是宿主 agent（SKILL 指引），不是插件内常驻进程。进程随时可死，事实全部在事件库；重启后 `status` → 续跑。这与 docs/01 §9.3"崩溃是正常路径"一致。

**前置重构（本线唯一的机制性改动）**：`Scheduler.runOnce()` 目前决策与写入一体。拆为：

```text
decide(): Decision | null     纯函数，只读投影，零事件 —— preview 与 run 共用
commit(decision): SchedulerEvent   append 管线（幂等、哈希链、aggregate 校验照旧）
runOnce() = commit(decide())       既有调用点行为不变
```

新增工具 `palimpsest_preview`：只调 `decide()`，返回"下一步会做什么"而不做它——plan mode 勘察与 run 回合的预检共用（§3.1）。

**验收门**：
- 用户单条消息（"用 palimpsest 把 X 做完"）→ 宿主 agent 仅以 palimpsest 工具/CLI 完成全程，中途无需用户理解任何工具；
- 12 项故障场景（docs/01 §7）全量回归；
- plan-mode 全程勘察零事件（§3.1 断言）；
- kill 会话后新会话"继续"可恢复（依赖 E3，联测）。

### 2.2 E2 装备化 worker（envelope → skill/插件提示）

**形态**：`TaskSpec` 增可选字段 `suggested_skills?: string[]`，经 ProjectIR 透传至 TaskEnvelope；worker agent 认领后按提示加载技能（SKILL 教此协议）。"配合相关插件"从口号变成机制：派一个"转换 50 份文档"任务并提示 `document-skills:pptx`，worker 子 agent 自带装备。

**合同安全（决策点，出口前必须二选一并记录）**：
- **选项 A（已采用，2026-08-18）**：`suggested_skills` 作为 TaskSpec 可选字段，序列化**缺省省略、不补默认**——对既有事件 digest 零影响。已实现并经 `[ACC-02]` parity 回归证明（fixture 逐字节不变）；`parseTaskSpec`/`parseTaskEnvelope` 均缺省省略 + permissive（未知可选字段保留），§9 例外条款已入 specs/03。
- **选项 B（退路，未启用）**：若实现发现 payload normalization 强制补默认值导致 parity 破坏，则把提示放 TaskEnvelope 的 advisory 层（不参与 digest），ProjectIR 合同不动。

**约束**：提示是建议非授权——不绕过宿主权限；main-agent-only 技能的路由规则见 §3.4。

**验收门**：schema 校验与透传单测；digest parity 回归（选项 A 时）；未知技能不 fatal（警告、失败可见）；手工 demo：pptx 提示 → worker 加载技能完成任务。

### 2.3 E3 断点续跑体验

**形态**：
- `palimpsest_status` 输出增加**恢复区块**：当前断点（下一步该做什么、哪个 attempt 挂在 RUNNING、租约是否过期）、全部恢复所需 ID 自描述——status 单独一屏即可重建全部上下文（§3.5 的锚点）。
- SKILL 增"继续"协议：新会话中用户说"继续/palimpsest 还在跑吗" → `status` → 恢复区块 → 从断点续跑；租约过期的 attempt 走 stale 作废与重派，不复活旧结果（合同 3）。

**验收门**：双会话 E2E——会话 1 推进至 VERIFYING 后关闭（等同 kill）；会话 2 重开同一 SQLite 文件，从 `resume` 恢复至 promote 并断言完整事件序列与终态（机器验收，2026-08-18）。

### 2.4 SDK 预埋纪律（非里程碑）

E 线期间禁止让 DSH 渲染/宿主概念渗入 controller 与 scheduler（工具面、SKILL、CLI 是仅有的宿主接触层）；`decide()/commit()` 拆分本身就是 SDK 面的改善。SDK 拆包另立提案，不在本线。

## 3. DSH 工作模式兼容（横切约束）

### 3.0 事实清单（设计输入，来源＝宿主运行时合同）

1. 工具调用运行在**用户选择的权限模式**后；一次拒绝＝用户否决，不应原样重试。
2. **Plan mode**：只读勘察，直至计划获批；获批前不得产生写操作。
3. **子代理类型工具面不同**：如只读检索型代理无 Write/Edit；通用型有全部工具。
4. **部分技能仅限主代理**（如 browser-use 明确禁止子代理加载）。
5. **长会话上下文会被摘要**：早前工具结果（projectId、attemptId）可能从上下文消失。
6. **后台任务跨回合存活**：CLI 子进程可脱离会话上下文运行，结果落库。
7. **Hooks** 可在 PreToolUse / PermissionRequest / PostToolUse 等七个事件上拦截或审计工具调用。
8. **并行派发**＝一条消息内多个 Agent 调用。

以上任何一条语义漂移（宿主升级）时，重审本节矩阵并更新本文。

### 3.1 工具模式安全矩阵

| 工具 | 纯读 | 写事件 | 外部效果 | plan mode | 说明 |
|---|---|---|---|---|---|
| `palimpsest_status` | ✅ | — | — | ✅ | 勘察锚点，永远可用 |
| `palimpsest_gate`（仅 gateId 评估） | ✅ | — | — | ✅ | evaluateGate 纯读 |
| `palimpsest_preview`（E1 新增） | ✅ | — | — | ✅ | `decide()` 纯函数 |
| `palimpsest_gate`（运行 predicate） | — | ✅ | ✅ worktree 内命令 | ❌ | 证据产生是写 |
| `palimpsest_next` | — | ✅ ≤1 事件 | — | ❌ | 用 preview 替代勘察 |
| `palimpsest_start` / `plan` / `claim` / `report` | — | ✅ | claim 含 worktree 创建 | ❌ | 获批后执行阶段 |

**原则：plan mode 下插件必须零事件**——与宿主语义一致。SKILL 教勘察协议：plan mode 里只用 status/preview/评估，把"开工"放进获批后的执行阶段。

### 3.2 权限提示前置与聚批

- 回合制 run（§2.1）天然把授权聚成小批：每回合的机械动作在回合意图明确后一次推进。
- effect profile 已经把绝大多数动作定为 readOnly / idempotent / reconcilable（docs/01 §5），这些是宿主白名单友好的；guarded（外部 dispatch）保持显式。
- 长机械循环（全量测试、批量 gate）走 CLI 后台任务（§3.6），不在对话内逐次触发提示。
- 文档化约定：用户批准一份 plan，即视为批准该轮机械执行——这是语义约定，不发明宿主机制。

### 3.3 拒绝 ≠ 错误

工具被权限系统或 hook 拒绝时：SKILL 规定**不原样重试**；agent 将受影响 attempt 以 cancelled/expired 上报，或修订计划（plan）——拒绝是用户否决，不是系统故障。与合同 3 呼应：被拒轮次的迟到结果同样不可提交。

### 3.4 子代理类型与角色映射

| 角色 | 宿主代理类型 | 依据 |
|---|---|---|
| implementer | 通用型（全工具） | 需要写文件与命令 |
| scout | 只读检索型 | 勘察无写需求 |
| verifier / gate 运行 | 只读型即可 | 判定走确定性命令 |

- main-agent-only 技能：`suggested_skills` 含此类技能时，run 循环把该任务路由给**主代理亲自执行**或显式标注"需主代理"；插件不程序化绕行（宿主无判定 API，常用清单以 SKILL 知识维护，失败可见）。
- 并行对齐：一条消息内多个 Agent 调用＝并行 worker；RoleSlotPolicy（软 8/硬 20、角色分槽）即同时派发上限，demand-driven 不填满（docs/01 §6 原样有效）。

### 3.5 上下文丢失韧性

对策四条（前三已具备或近零成本）：
1. **状态外置**：事实在 SQLite，不在会话记忆；`status` 是唯一恢复入口（无参数可用——单活动项目 invariant 保证）。
2. **稳定 ID**：`stableEntityId` 决定论 ID 跨会话一致。
3. **回合自描述**：每个 run 回合的输出携带恢复所需全部 ID；大输出进事件库不进对话。
4. SKILL：每回合开始先 `status` 对齐，不信任记忆中的 ID。

### 3.6 后台任务与进程外执行

长机械循环以后台任务运行 CLI（`pump`），事件落库、进度由 status 反映；agent 不在对话内持有中间态。kill 会话不等价于 kill 后台 CLI——依赖宿主后台任务语义，文档化即可，不做 watcher/daemon（§5 非目标）。

### 3.7 Hooks 互操作

拦截按 §3.3 拒绝路径处理；工具输出保持结构化 JSON（已是），使外部 PostToolUse 治理/审计可直接消费。

## 4. 里程碑与出口门

| 里程碑 | 内容 | 出口门 |
|---|---|---|
| **E1** ✅ 已交付 | `decide()/commit()` 拆分、`palimpsest_preview`、`palimpsest_run`、SKILL 驱动指引 | 12 场景回归；plan-mode 零事件断言（`e1_preview_run`）；全量 23/132 绿；CLI 入口回合冒烟（2026-08-18） |
| **E2** ✅ 已交付 | `suggested_skills`（选项 A 采用：缺省省略+permissive 解析）、envelope 透传、worker SKILL（含 main-only 路由规则） | [ACC-02] parity 回归绿（既有 fixture 零扰动）；`e2_equipped` 5 项机器验收；未知技能不 fatal；pptx 宿主 demo 待真实会话（机制已机器验证）（2026-08-18） |
| **E3** ✅ 已交付 | status `resume` 恢复区块（用户语言断点 + 在途/开放任务自描述）、stale-world `blocked` 降级、"继续"协议入 SKILL | `e3_resume` 4 项机器验收（resume 只读/分类、跨会话续跑至 promote+SATISFIED、paused 跨会话、stale blocked 不崩）；全量 25/141 绿；CLI 每命令独立进程重开库＝跨进程持久性（2026-08-18） |
| **E4** 模式矩阵收口 | 工具描述声明 mode-safety、拒绝协议入 SKILL、hooks 说明、§3.1 矩阵每格测试或文档证据 | 矩阵全格有证据；三个权限模式（plan/default/auto）各走一遍手工剧本 |

每个里程碑退出时同提交更新：docs、SKILL（仓库内与已安装副本同步）、测试。

## 5. 非目标

- 不做后台 daemon / watcher——恢复靠事件库 + status，不靠常驻进程；
- 不程序化判定或绕过宿主权限系统（main-only 技能清单以知识维护，失败可见）；
- 不在本线做 SDK 拆包与多宿主移植（§2.4 只预埋纪律）；
- 不做图形 UI——渲染保持文本块（docs/01 §9）；
- 不改变 P0–P3 已冻结的合同语义；唯一允许的合同触点是 E2 且必须过 digest parity 回归门——已落地（选项 A，§9.2 例外条款记录于 docs/03）。

## 6. 风险与对冲

| 风险 | 对冲 |
|---|---|
| 平台风险：宿主 someday 原生吸收此能力 | SDK 预埋纪律（§2.4）保持核心可移植；Ordarium ledger/effect authority 深度是护城河 |
| 宿主权限/模式语义漂移 | §3.0 事实清单版本化于本文；宿主升级时重审矩阵（E4 出口即审） |
| 回合制循环的 manager 质量随宿主模型浮动 | 合同兜底：坏决策不污染 canonical 状态（事件校验、gate、stale 隔离） |
| E2 合同触点破坏跨语言 parity | 已关闭：选项 A（缺省省略+permissive）落地，`[ACC-02]` parity 全绿；退路选项 B 未启用 |
