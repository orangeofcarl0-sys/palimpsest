# 架构三模式规格（预设 / 自动架构师 / 手搓共用声明面）

> **Spec ID**：`PLMP-ARCH-1` / `PLMP-ARCH-2` ｜ 状态：**冻结**（2026-09-07，用户裁决入场；交付时按 03 §8.3 出口审计 bump SDS）
> **权威序**：系统设计以 `03-system-design-spec.md`（PLMP-SDS）为准；声明面以 H1 治理上链（GATE/ROLE/STAGE 声明事件）为准；架构调整通道＝对侧章程愿景句"架构调整＝一次计划修订 + 通过晋升门禁——系统只能通过自己的证据门禁重构自己"；素材母体＝六系统调研（`ordarium/docs/research/agent-landscape-2026-08/01-architecture-survey.md`：Grok Build 代码即编排 / Magentic ledger 编排器 / Manus 上下文纪律）。本文＝三种架构喂法共用的内核校验与声明面。
> **修订记录**：`ARCH`＝初版冻结（2026-09-07）：两项用户裁决（**DSH 主代理当架构师**——插件零内嵌 LLM，宿主中立红线；首批 preset＝**流水线**）；手搓＝可视编辑器（渲染器侧）经同一校验/声明面；验收 ARCH-A01–A05。

---

## 0. 立项与边界

dshweb 里的架构选择三模式，在内核侧收敛为**一个声明面的三种喂法**：

| 模式 | 喂法 | 产出物 |
|---|---|---|
| 预设架构 | 模板填参（ARCH-1） | ProjectIR 提案 |
| 自动架构 | 主代理按提示词技能编译 goal（ARCH-2） | ProjectIR 提案 |
| 手搓架构 | 可视编辑器拖拽（渲染器适配线，双图形态见 17 号） | ProjectIR 提案 |

三种提案走**同一个校验器 + 同一个声明通道**（`start()` / `plan()`），天然无兼容层。**架构调整即重构**：对运行中项目提交新提案 = 一次计划修订，后续执行照旧被门禁治理——系统只能通过自己的证据门禁重构自己。

**宿主中立红线（本规格最高约束）**：插件**零内嵌 LLM 调用**。自动架构由 DSH 主代理充当架构师——palimpsest 只提供 (a) 架构师提示词技能（告诉主代理如何把 goal 编译成提案）与 (b) 提案校验/声明面。主代理自有的模型能力不进插件依赖图。

## 1. 形状

### 1.1 预设架构：流水线 preset（ARCH-1 首批唯一模板）

```ts
interface PipelineStageInput {
  readonly title: string;            // 人话阶段名（如 "实现" "验证" "评审"）
  readonly writePaths?: readonly string[];
  readonly requiredArtifacts?: readonly string[];
  readonly gateId?: string;          // 缺省沿 genesis 默认门禁
}
function pipelinePreset(input: {
  readonly goal: string;
  readonly stages: ReadonlyArray<PipelineStageInput>;  // ≥1，顺序即执行序
}): ProjectProposal;                  // 纯函数 → 提案（不落账）
```

- 阶段链自动生成 `depends_on` 线性边（stage[i] 依赖 stage[i-1]）；上游 `writePaths` 汇入下游任务的上下文需求（CTX-2 `upstreamWritePaths` 语义，零新概念）。
- **提案 ≠ 状态**：`pipelinePreset` 永不写库；声明走 `start()`（新项目）/ `plan()`（修订运行中项目）既有通道。

### 1.2 提案校验面（三模式共用）

```ts
interface ProjectProposal {
  readonly goal: string;
  readonly changeClass: "metadata_only" | "backward_compatible" | "behavior_change" | "contract_breaking";
  readonly tasks: ReadonlyArray<TaskProposal>;
}
interface TaskProposal {
  readonly title: string;
  readonly dependsOn: readonly string[];      // 引用本提案内其他任务 title/id
  readonly writePaths?: readonly string[];
  readonly requiredArtifacts?: readonly string[];
  readonly gateId?: string;
}
function validateProjectProposal(proposal: ProjectProposal): ProposalDiagnostic[];
```

诊断类型（typed，不落账）：`EMPTY_TASKS` / `UNKNOWN_DEPENDENCY` / `DEPENDENCY_CYCLE` / `MISSING_WRITE_PATHS`（有产出物却无可写路径）/ `UNKNOWN_GATE`（gateId 不在已声明门禁注册表）/ `EMPTY_TITLE`。空诊断 = 合法提案。

### 1.3 声明面（零新语义）

- 新项目：`start({ projectId, goal, tasks: <提案编译的 TaskSpec[]> })`——既有通道。
- 修订：`plan({ tasks, changeClass, changedIds })`——既有通道；图面（17 号 VIS-A06）反映新 revision。
- 手搓编辑器（渲染器侧）产出的也是 `ProjectProposal`——三模式同校验、同声明。

### 1.4 自动架构师（ARCH-2，主代理驱动）

- **架构师技能**（`.zcode/skills/palimpsest-architect/`，独立于编排技能）：指导主代理把一句话 goal 编译为 `ProjectProposal`——拆阶段、定 depends_on、按产出物定 writePaths/requiredArtifacts、按验证点定 gateId；产出后**必须先经 `validateProjectProposal`**，空诊断才可声明。
- **用户确认点**：提案以人话卡片呈现（阶段清单 + 依赖图概述），用户确认后主代理才调用声明面——控制权在人（可控）。
- 代码红线：插件依赖图无任何 LLM/API 客户端（ARCH-A04 机器断言）。

## 2. 无兼容层

- 校验器/预设为纯函数新模块；`start()`/`plan()`/事件契约/工具面零触碰。
- 预设提案经既有事件落账（PROJECT_CREATED / PROJECT_PLAN_REVISED），无新事件类型。
- 架构师技能只写文档 + 调既有面，无新运行时依赖。

## 3. 验收

| ID | 判据 | 断言 |
|---|---|---|
| ARCH-A01 | 流水线确定性 | 同输入双调用提案全等；阶段链 depends_on 逐级正确；上游 writePaths 进入下游上下文需求 |
| ARCH-A02 | 声明走既有通道 | preset 提案经 start/plan 落 PROJECT_CREATED / PLAN 修订；事件类型集合零新增 |
| ARCH-A03 | 校验器 fail-closed | 五类诊断各自可触发；非法提案零落账（事件数不变） |
| ARCH-A04 | 架构师零 LLM | 端到端：模拟主代理产出提案 → validate 空诊断 → declare → 17 号图面可见；插件依赖图无 LLM/API 客户端（依赖断言） |
| ARCH-A05 | 修订即重构 | 对 VERIFYING 项目提交修订提案 → plan 落账 → 图面新 revision；晋升门禁治理不变 |

交付出口：全量 `pnpm check`；03 SDS bump；00/01 登记行；工程索引登记；架构师技能文档在仓。

## 4. 修订流水

| 日期 | 修订 |
|---|---|
| 2026-09-07 | 初版冻结（PLMP-ARCH-1/2）：两项用户裁决（主代理当架构师、首批流水线 preset）；三模式共用校验/声明面、提案形状、五类诊断、验收 ARCH-A01–A05。 |
