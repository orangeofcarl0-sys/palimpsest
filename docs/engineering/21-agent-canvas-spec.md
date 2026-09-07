# Agent 画布规格（定义层 + Inspector/diff + 运行时叠加 + Trace）

> **Spec ID**：`PLMP-CANVAS-1` / `PLMP-CANVAS-2` / `PLMP-CANVAS-3` / `PLMP-CANVAS-4` ｜ 状态：**已交付**（2026-09-07；`6a9598f` 内核 + `f4406a7` 面板 + `ea84098` 冒烟修正；验收 CANVAS-A01–A10 全绿〔46 文件 / 266 测试〕+ 真实浏览器冒烟通过；冻结时三项用户裁决：① subflow 进入子图＝**就地嵌套视口**；② 画布文档持久化＝**本地 localStorage＋显式导入/导出 JSON**；③ 运行时叠加＝**卫星 attempt 节点**）
> **权威序**：数据/控制契约以 `17-visual-orchestration-spec.md`（VIS）、`18-architecture-modes-spec.md`（ARCH）、`20-preset-library-spec.md`（ARCH-3）为准；呈现面先例以 `19-renderer-adaptation-spec.md` 为准；系统设计以 03 为准；素材母体＝`audits/agent-canvas-teardown-2026-09.md`（四系统拆解 + 本仓取用裁决）与用户愿景方案（2026-09-07："Agent Canvas / 复合 Agent 图 / 三张图叠加 / GraphPatch 统一 / IDE Debugger 式人工控制"）；术语隔离红线 `[SDS-18]` 延伸到画布全部人话面。
> **总纲**：愿景文档的"三张图"在 palimpsest **已经是投影关系而非三个系统**——Definition＝ProjectIR（账本）、Runtime＝orchestrationGraph 投影、Trace＝事件时间线投影；本规格只做**画布侧的编辑与叠加呈现**，全部能力零编排合同触碰。

---

## 0. 立项与边界

用户裁定把愿景方案（复合 Agent 图画布）落地为渲染线交付。四系统拆解证实：任意深度嵌套的**序列化**（Node-RED `z`/`g`）、**嵌套视口**、**编译语义**三者无现成品可整搬，但本仓的取用裁决（拆解 §8）给出分级路径——序列化即日采纳、视口本轮自研（React Flow 原生 parentNode 链）、递归执行用**编译期展开**替代后置。

**画布文档的本体地位**：画布文档（CanvasDoc）是**客户端草稿态**——未声明的架构编辑痕迹。服务端唯一真相仍是编排账本；画布文档存 localStorage、显式导入/导出 JSON 文件（裁决②），服务端**零新增状态**。已声明项目的"定义图"＝账本里的 ProjectIR，画布对其只读；对运行中项目改架构＝草稿编译成提案走既有 plan 通道（18 号）。

**节点词汇（V1 调色板）**：Agent（任务：title/dependsOn/写域/产物/建议门禁/角色/skills 提示）、Group（纯视觉）、Subflow（作者期封装片段）、Annotation（画布注记）。Tool/Human/Router/Memory 节点列非目标——Tool 的真实需求（技能提示）由 Agent 的 `suggestedSkills` 字段承载（既有 `suggested_skills` 通道）；Human≈暂停/审批门（既有）；Router＝条件边（内核缺口，独立立项）。

## 1. CANVAS-1 定义层（画布文档契约 + 编译 + 嵌套视口）

### 1.1 CanvasDoc v1（Node-RED `z`/`g` 契约的本仓变体）

```text
CanvasDoc {
  version: 1,
  goal: string,
  nodes: [Node],        // 扁平数组——嵌套关系在字段里，不在结构里
  groups: [Group],      // 纯视觉分组，g 链式任意嵌套
}
Node   { key, type: "task"|"subflow"|"annotation", title, x, y, z, g?,
         // type=task:  task: {dependsOn: title[], writePaths?, requiredArtifacts?,
         //                    gateId?, role?, suggestedSkills?}
         // type=subflow: label（成员即 z === 本节点 key 的节点）
         // type=annotation: text（markdown，编译剔除） }
Group  { id, label, g?, members: key[] }   // 纯视觉，编译透明
```

- **依赖词汇＝title**（与 fcdb585 裁决一致，提案的原生词汇）；`key` 只是渲染身份与 `z`/`g` 归属键，不进依赖。重命名留下的旧依赖＝校验器 UNKNOWN_DEPENDENCY 橙色诊断（诚实呈现，不做静默重绑）。
- **嵌套**：`z`＝所属 subflow 的 key（根层 `z:"root"`）；subflow 自身也是根层节点，可再套 subflow（`z` 链，任意深度，同 Node-RED）。
- **持久化**：localStorage 键 `palimpsest-canvas-<projectId>`；`导出 JSON`/`导入 JSON` 按钮作跨设备/分享通道（裁决②）。服务端零存档端点。

### 1.2 编译（内核单源）

`src/canvas/`（新内核模块，与 ARCH-3 presets 同款纪律）：

- `parseCanvasDoc(value): CanvasDoc`——fail-closed；未知 version、缺字段、坏形状即拒。
- `canvasCompile(doc, {goal?}): ProjectProposal`——**编译期展开**：跨 `z` 链扁平收集全部 task 节点（subflow 边界自动推导：成员的外部依赖＝子图输入、被外部依赖的成员＝子图输出，展开即直接连线）；Annotation 剔除、Group 透明、subflow 节点本身不产生任务；`suggestedSkills` 透传（见 §2.2）。产物即既有 ProjectProposal → 既有共享校验器（六类诊断）→ 既有 start/plan 声明面。
- `canvasInsertFragment(doc, fragment, at?): CanvasDoc`——预设（ARCH-3）从"替换草稿"升级为**向当前画布插入 fragment**（节点带偏移坐标落位、key 重生成防撞、不自动连线；空画布插入＝现行为）。
- serve 纯派生端点（token 门内）：`POST /api/canvas/compile {doc}` → `{proposal, diagnostics}`（含既有 knownGateIds 同判）；`POST /api/canvas/diff {doc|proposal}` → `{added, removed, changed}`（§2.3）。两端正点零写入（PRE 同款事件数不变断言）。

### 1.3 就地嵌套视口（裁决①）

- 渲染＝React Flow **原生 parentNode 链 + extent 约束**：CanvasDoc 的扁平 `z`/`g` 在渲染层映射为父子关系（成员坐标相对父节点；`extent:"parent"` 限拖拽边界；展开时父框自动随成员扩张）。Flowise 的单层用法即该机制可行性的现成证据；深度链是同一机制的延伸。**画布只有一个 ReactFlow 实例**（拆解"每层一个实例"的自研预警不成立——扁平模型与原生父子同构）。
- subflow 节点**折叠/展开**切换：折叠＝显示摘要节点（成员数/入出端口数）；展开＝成员就地渲染于父框内。多级同时展开支持（z 链直接映射）。
- Group 渲染为纯视觉框（可折叠、随成员移动），不参与编译。

### 1.4 布局菜单

`Layout ▼`：Manual / Flow LR / Flow TB / Force（既有 forceLayout）/ Compact。**布局只变换坐标，绝不触碰图语义**——同一 CanvasDoc 经任意布局后 `canvasCompile` 输出逐字节一致（CANVAS-A09 机器守门）。布局状态与文档状态分离（布局选择不写入 CanvasDoc 的语义字段，只写视图字段）。

## 2. CANVAS-2 Inspector 与 diff 预览

### 2.1 schema 驱动 Inspector

采纳拆解的组件 UI 协议**模式**（单一来源 → schema 下发 → 表单），单一来源＝**自有合同类型**：Agent 节点表单字段从提案/任务合同类型生成（title/dependsOn/写域/产物/建议门禁/角色〔已声明角色表枚举〕/suggestedSkills），门禁字段带既有 UNKNOWN_GATE 同判提示（serve 校验已带 declaredGateIds）。不引 Langflow 的服务端 update 回调（本仓字段静态，无动态派生需求）。

### 2.2 suggestedSkills（提案面加法式字段）

`TaskProposal` 增加法式可选 `suggestedSkills?: string[]`，`proposalTaskSpecs` 透传到既有 `TaskSpec.suggested_skills`（E2 通道，事件合同既有字段——**事件零触碰**，无 digest 影响；提案面缺省省略纪律同 `role` 先例）。画布 Agent 节点的 skills 字段即此——Tool 提示的一等入口，不经任何新节点类型。

### 2.3 diff 预览（AI 提案＝GraphPatch 的落点）

草稿（CanvasDoc 编译产物）对 live ProjectIR 任务的 diff：**added / removed / changed（字段级）**，title 为同一性。愿景文档"Preview → Accept / Reject / Edit"落地为：diff 上墙（新增绿/删除红/变更黄）→ 用户在画布上直接编辑草案（即 Edit）→ 既有"校验→人话确认→声明"收口（Accept 不是新写路径，是既有 declare 的确认点）。主代理自动架构（18 号）的建议从此有了可视评审面。

## 3. CANVAS-3 运行时叠加（裁决③：卫星节点）

- 在途 attempt（CREATED/LEASED/RUNNING）以**虚线卫星小节点**挂在所属任务旁：显示角色＋归因徽章（模型/成本，既有数据）＋耗时；终态 attempt 折叠回任务（晋升折叠语义不变）。
- 点选卫星＝定位 TaskDetails 的对应 attempt 时间线；全部复用 orchestrationGraph 投影（零新查询）。
- 卫星层**总开关**（折叠时画布回到纯任务图）；大规模下节点数可控。
- 非目标：promote-ephemeral（把运行态固化为计划节点）——内核无 attempt 树，动态子 Agent 是内核项；本规格不含。

## 4. CANVAS-4 Trace 面板

- 画布底部**可折叠抽屉**：run 级 span 时间线——每 attempt 一行，段＝创建/认领/门禁证据/报告/晋升（VIS-1 人话标签原样），段宽＝相邻事件时延；按任务/attempt/状态过滤（纯派生函数）。
- 段落点选＝联动画布定位 + TaskDetails。
- 非目标：OTel 导出与宿主侧 LLM/tool span 关联（需要 trace 上下文加法字段，独立立项——拆解确认这是四家空白但属合同扩展）。

## 5. 红线（机器守门项标 CANVAS-A）

1. **账本唯一真相**：画布文档只存客户端（localStorage＋导入导出），服务端零新增状态端点（compile/diff 均为纯派生只读）。
2. **零编排合同触碰**：全部能力从既有投影/通道派生；唯一新字段 `TaskProposal.suggestedSkills` 是提案面加法式可选（SDS-4 例外纪律：缺省省略、事件 digest 不变、逐字节断言）。
3. **内核单源**：parse/compile/insert/diff/trace 派生全部在 `src/canvas/`，serve 暴露；面板零复制编译逻辑（呼应 ARCH-3"退役客户端复制实现"先例）。
4. **宿主中立零 LLM**：画布不引入任何模型调用；自动架构仍是主代理（ARCH-A04 不动）。
5. **术语隔离** `[SDS-18]`：卫星/Trace/Inspector 全人话（goal/task/attempt/verified），零 event_id/哈希。
6. **布局不改语义**（CANVAS-A09）。

## 6. 验收

| 项 | 断言 |
|---|---|
| CANVAS-A01 | `parseCanvasDoc` fail-closed：坏形状/未知 version 拒绝；合法文档 round-trip |
| CANVAS-A02 | 编译：扁平任务画布 → 提案与手写提案一致（title 依赖/角色/写域/产物/门禁原样；Annotation 剔除、Group 透明） |
| CANVAS-A03 | subflow 编译：外部依赖↔子图输入、外部被依赖↔子图输出自动接驳；两层 `z` 链嵌套展开正确 |
| CANVAS-A04 | fragment 插入：非空画布插入预设 fragment（key 重生成防撞、坐标偏移、不破坏既有节点） |
| CANVAS-A05 | diff：added/removed/changed（字段级）对 live 任务判定正确 |
| CANVAS-A06 | serve 端点：compile/diff 在 token 门内、零写入（事件数不变）、坏文档 400、unknown 字段诚实报错 |
| CANVAS-A07 | suggestedSkills 透传：提案面 → TaskSpec.suggested_skills；缺席＝键省略（既有事件 digest 断言不破） |
| CANVAS-A08 | Trace 派生：VIS 时间线 → span 段（时延/排序/过滤）纯函数正确 |
| CANVAS-A09 | 布局纯度：任意布局前后 `canvasCompile` 输出逐字节一致 |
| CANVAS-A10 | 卫星派生：在途 attempt 集合（状态过滤）纯函数正确；折叠开关只影响渲染不改数据 |

出口加真实浏览器可视冒烟：subflow 就地嵌套展开/折叠、fragment 插入、diff 上墙、卫星叠加、Trace 抽屉。

## 7. 非目标（内核扩展队列，各自独立立项）

调试器控制面（断点/bypass/force route/inject message/kill activation——hooks 拦截范式为交互蓝本）；真运行时嵌套（嵌套实体 + attempt 树 + 嵌套 HITL——本仓单一账本天然规避四家的 `NESTED_HITL_UNSUPPORTED` 互斥）；typed edges 与每边 policy；Router 条件边；多写者并发编辑；OTel 导出 + 宿主 span 关联；promote-ephemeral。每项走完整合同纪律（schema bump + ACC-02 + 迁移 + fixture 再生），加法式扩展，不推倒既有 IR。

**交付时实证的既有边界（非本规格缺口，H1 声明式管线）**：已启动项目经 plan/declare 追加**新任务**只进 ProjectIR，不落 `TASK_CREATED` 行——任务行注册是宿主授权路径（`scheduler.registerTask(policy.authorize(...))`，仅 `start()` 内建），调度器扫描以 tasks 表为准，故冒烟中新任务不派发（单步空转）。画布"声明即运行"的最后一公里＝把 plan 修订的新任务走一次授权注册，记入上方扩展队列（或由宿主代理承担，与 DSH worker 自举一致）。

## 8. 修订流水

| 日期 | 修订 |
|---|---|
| 2026-09-07 | 初版冻结（PLMP-CANVAS-1/2/3/4）：三项用户裁决（就地嵌套视口、本地＋导入导出、卫星节点叠加）；CanvasDoc v1 契约（z/g 变体、title 依赖）、编译期展开与边界自动推导、suggestedSkills 提案面加法字段、Inspector/diff/卫星/Trace 四件、红线六条、验收 CANVAS-A01–A10；素材母体＝`audits/agent-canvas-teardown-2026-09.md`。 |
| 2026-09-07 | **交付**（`6a9598f` 内核 + `f4406a7` 面板 + `ea84098` 冒烟修正）：A01–A10 全绿（46 文件/266 测试）；浏览器冒烟全项通过——边挂载（Handle 修正）、drop-into-subflow 归入、就地嵌套视口（成员渲染于父框内）、校验→确认声明（PROJECT_REVISED rev 0→1）、对照实时 diff（＋未声明任务）、布局流式→（根层重排+子孙随迁+边保持）、卫星 RUNNING attempt 叠加、Trace span 抽屉；§7 补记 plan/declare 新任务注册边界（冒烟实证）。 |
| 2026-09-07 | **完整性硬化**（PLMP-CANVAS-5，22 号规格，G1 轮）：§1.2 `parseCanvasDoc` 加法式收紧——z owner 必须是 subflow、self-parent/z 链/group 链无环、类型-字段纪律（annotation 禁带 task、非 annotation 禁带 text）；§1.4 布局纯度推广到深层（传递子孙平移，A16）；面板全祖先链可见性（折叠祖父下孙图/成员/边全隐藏，修复单层判定的根层泄漏）+ 恢复/导入形状守卫 + drop 环守卫；验收 CANVAS-A11–A17；本规格 A01–A10 原样全绿（零漂移）。 |
