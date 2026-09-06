# 架构预设库规格（六系统拓扑原型 · 可选预设）

> **Spec ID**：`PLMP-ARCH-3` ｜ 状态：**冻结**（2026-09-07，四项默认裁决入场——用户未即时应答分歧点询问，按推荐默认冻结，可推翻后重冻结：① 预设集合＝拓扑本质 5+1；② 门禁只建议不落账；③ 内核单源＋草稿直出；④ 中性 id＋来源注记）
> **权威序**：声明面与校验器以 `18-architecture-modes-spec.md`（PLMP-ARCH-1/2）为准；系统设计以 03 为准；调研母体＝`ordarium/docs/research/agent-landscape-2026-08/01-architecture-survey.md`（六系统代码级取证）；角色红线＝未声明角色 fail-closed（genesis 默认角色表：implementer/tester/verifier/scout/analyst，提额走 `declareRoleTable` 既有通道）；术语隔离红线 `[SDS-18]` 延伸到预设元数据（lineage 只说拓扑与来源，零 event_id/哈希）。

---

## 0. 立项与边界

用户请求：**"将调研好的那几个代表性多 agent 系统都作为可选预设实现。"**

预设的本体是**拓扑原型**（任务图形状 + 角色分配 + 门禁建议 + 合理默认参数），不是被调研系统的克隆——每个预设标注 lineage（来源系统与映射偏差），名实关系声明在案。预设是纯函数（零 LLM，ARCH-2 宿主中立红线延伸），产出走既有 `ProjectProposal` 共享校验器与 start/plan 声明面（18 号规格），事件契约零触碰（预设要用的角色分配复用 `TaskSpec.role` 既有可选字段，缺席语义＝implementer 不变）。

**不设预设的两个系统（规格注记）**：Manus 的本质是上下文纪律（todo 复述 / KV-cache 感知 / 文件即外存）——非任务拓扑，且已由 CTX 线（14/15/16 号规格：Requirement、检索、Boot/Pull 分发）承担；OpenManus 是反面教材（复刻了形没复刻到神——观察驱动、模块注入、上下文纪律三缺）——无拓扑可模板化，留作设计警示。

## 1. 预设注册表（六条）

单一实现点：`src/architecture/presets.ts` 导出 `PRESETS`（有序注册表）与 `presetDraft(id, params)`。每条目：`id` / `label`（中文显示名带来源）/ `lineage`（系统与映射注记）/ `paramSpec`（参数字段说明）/ `build(params) → ProjectProposal`（纯函数，坏参数 throw → serve 400）。`changeClass` 全体缺省 `behavior_change`，可参数覆盖。角色只用 genesis 已声明五角色（PRE-A07 机器断言）；门禁建议一律 advisory（`gateId` 进提案，GATE_DEFINED 仍只有 declareGate 一条声明路径）。

| id | 显示名 | lineage | 拓扑（→ 为 depends_on 边） | 角色 | 门禁建议 |
|---|---|---|---|---|---|
| `pipeline` | 流水线 | 18 号规格 ARCH-1（首批预设） | 阶段线性链 | （不设 role） | 每阶段可选 |
| `fan_out` | 扇出-汇聚（Grok Bot·Anthropic 深研式） | Grok 类型化后台子代理；Anthropic orchestrator-worker（+90.2% 实证） | worker×N 并行 → 综合（依赖全部 worker） | worker＝scout、综合＝analyst | 综合可选 |
| `hierarchy` | 角色层级（Kimi Swarm 写作式） | Kimi Swarm 层级写作模式（manager→调研/撰写/编辑） | 调研×N 并行 → 撰写 → 编辑 | 调研＝scout、撰写＝implementer、编辑＝analyst | 撰写/编辑可选 |
| `panel` | 专家团（grok-expert 同题多解式） | grok-expert 聊天室协议（leader 合成，非投票共识——调研 §1.3 已澄清） | 候选×N 同题并行 → 合成评审（依赖全部候选） | 候选＝analyst、合成＝analyst | 合成可选 |
| `verified_dag` | 验证图（Danus 逐单元门禁式） | Danus 事实图（每单元验证后才落图、verifier 只读、main 无写门） | 单元×N（单元间 depends_on 透传）→ 终审（依赖全部单元） | 单元＝implementer、终审＝verifier | 每单元可选＋终审可选 |
| `research_loop` | 研究回路（Magentic ledger 式） | Magentic TaskLedger/ProgressLedger（计划→取证→结构化核验，不过走计划修订） | 计划 → 取证×N 并行 → 核验 → 综合 | 计划＝analyst、取证＝scout、核验＝verifier、综合＝implementer | 核验/综合可选 |

参数形状（`presetDraft` 的 params；全部有内核默认，草稿直出后图上改）：

- `pipeline`：`{goal, stages:[{title, writePaths?, requiredArtifacts?, gateId?}]}`（18 号签名不变；注册表条目输出与 `pipelinePreset(...)` 逐字节一致，PRE-A10）。
- `fan_out`：`{goal, workers?:[{title, writePaths?, requiredArtifacts?}]（默认 2：调研 A/调研 B）, synthesis?:{title?="综合", writePaths?, gateId?}}`。
- `hierarchy`：`{goal, research?:[{title}]（默认 1：调研）, writing?:{title?="撰写", writePaths?, requiredArtifacts?, gateId?}, editing?:{title?="编辑", gateId?}}`。
- `panel`：`{goal, question?:{title?="解题", writePaths?, requiredArtifacts?}, candidates?:number（默认 2，界 1..4；>2 并行需先经 declareRoleTable 提额，预设不代劳）, synthesis?:{title?="合成评审", gateId?}}`（候选＝"方案 A/方案 B…"）。
- `verified_dag`：`{goal, units?:[{title, dependsOn?:string[]（单元标题，环与坏引用由共享校验器兜底）, writePaths?, requiredArtifacts?, gateId?}]（默认 2：单元 A/单元 B）, review?:{title?="终审", gateId?}}`。
- `research_loop`：`{goal, plan?:{title?="研究计划", writePaths?}, topics?:[{title, writePaths?}]（默认 2：取证 A/取证 B）, verify?:{title?="核验", gateId?}, synthesis?:{title?="综合", gateId?}}`。

`goal` 是唯一必填参数（缺省 `"新目标"`）；预设**不做**参数深校验之外的语义判断，环检测/坏引用/空标题统一由共享校验器（18 号六类诊断）兜底——预设自身零重复校验逻辑。

## 2. 供给三面（内核单源）

- **serve**（19 号通道面延伸）：`GET /api/presets` 只读元数据（id/label/lineage/paramSpec）；`POST /api/preset/<id>/draft` **纯派生**（params → ProjectProposal；未知 id 或坏参数 400；调用前后事件数与 snapshot 不变——零写入，PRE-A08 断言）。两个端点都在既有 token 门之后。
- **面板**（dshweb）：架构节从"流水线 preset 按钮＋客户端复制实现"改为**预设下拉＋生成草稿**——选中即 `POST /api/preset/<id>/draft`（params 只带 goal），草稿上画布后连线/标题图上改；现有 `applyPreset` 客户端线性链复制逻辑**退役**（不留兼容层）。一致性补口：`DraftTask` 加法式可选 `role`，预设草稿保留角色、图上编辑不丢角色、校验/声明透传（角色不是图面术语，不上节点显示）。面板校验带 `knownGateIds`（与 CLI 同源读 `gate_registry`）——预设建议的门禁未声明时面板即见 `UNKNOWN_GATE` 人话诊断，与 CLI 同判。
- **CLI**：`architect --preset <id> --params <json|@file> [--goal ...] [--declare]`——与既有提案文件路径共用校验→空诊断才声明逻辑；`--params` 缺省用内核默认。architect 技能同步：六预设参数表＋**先 `declareGate` 再 `declare` 的两步顺序**（门禁建议生效前提）。

## 3. 红线（机器守门项标 PRE-A）

1. 预设是**拓扑原型非克隆**：每预设标 lineage，映射偏差名实声明在案（§1 表）。
2. **零 LLM**：预设是纯函数；自动架构师仍是 DSH 主代理（ARCH-A04 依赖图断言不动）。
3. **角色 fail-closed**：编译产物 role ∈ 已声明角色表（PRE-A07 断言 genesis 表）。
4. **门禁只建议**：GATE_DEFINED 仍只有 declareGate 一条声明路径（无第二条写路径）。
5. **内核单源**：web/ 零预设复制逻辑（删 applyPreset 复制实现即证）。
6. **声明面不变**：预设产出＝ProjectProposal，只走 start/plan；判官/角色表/阶段图治理仍走 H1 各自声明通道。

## 4. 验收

| 项 | 断言 |
|---|---|
| PRE-A01 | 注册表完备：六预设 id/label/lineage/paramSpec 齐全；各自默认参数 build → 共享校验器零诊断 |
| PRE-A02 | fan_out 拓扑：worker 互不依赖、综合依赖全部 worker；编译 TaskSpec 角色＝scout×N＋analyst×1 |
| PRE-A03 | hierarchy 链：调研并行 → 撰写 → 编辑；角色 scout/implementer/analyst |
| PRE-A04 | panel：候选并行＋合成依赖全部候选；candidates 越界（0 或 >4）参数报错；候选同角色 |
| PRE-A05 | verified_dag：单元 depends_on 透传（坏引用 → UNKNOWN_DEPENDENCY 由共享校验器报，预设不重复造轮子）；终审依赖全部单元；角色 implementer/verifier |
| PRE-A06 | research_loop：计划→取证并行→核验→综合四段；角色 analyst/scout/verifier/implementer |
| PRE-A07 | 角色红线：全部预设编译 TaskSpec 的 role ∈ genesis 默认角色表键集 |
| PRE-A08 | serve 端点：`/api/presets` 六条元数据；draft 端点零诊断提案、未知 id 400、坏参数 400、**纯派生**（调用前后事件数不变）；token 门覆盖 |
| PRE-A09 | 面板同判：serve 校验带 knownGateIds（gate_registry 同源），未声明 gateId 建议 → UNKNOWN_GATE 人话诊断 |
| PRE-A10 | pipeline 兼容：注册表条目与 `pipelinePreset(...)` 输出一致（18 号签名不动） |

## 5. 修订流水

| 日期 | 修订 |
|---|---|
| 2026-09-07 | 初版冻结（PLMP-ARCH-3）：四项默认裁决（拓扑本质 5+1、门禁只建议、内核单源＋草稿直出、中性 id＋来源注记）；注册表六条目、参数形状、供给三面、红线、验收 PRE-A01–A10。 |
