# GraphPatch 规格（AI 改图的正式中间协议）

> **Spec ID**：`PLMP-GRAPH-2` ｜ 状态：**已交付**（2026-09-07；演进线 G4 阶段，母体＝`audits/NEXT-GRAPH-EVOLUTION-PLAN.md` §3；验收 PATCH-A01–A05 全绿〔48 文件 / 287 测试〕+ 浏览器冒烟：粘贴 patch→预览上墙→应用落图）
> **权威序**：IR 以 24 号为准；声明面以 18 号为准；画布契约以 23 号为准。
> **总纲**：AI 自动架构永不直接替换整图。GraphPatch 是对 **AgentGraph IR**（24 号）的正式编辑协议：语义操作、无坐标（Graph/Layout 分离）；应用走既有校验→人话预览→声明治理，零新事件类型。

## 1. Scope

### 1.1 Patch 形状（`src/graph/patch.ts`）

```text
GraphPatch {
  baseRevision?: number          // 声明时锚定的 live revision；缺席＝不主张新鲜度
  addNodes: AgentGraphNode[]     // 完整节点（无坐标字段——IR 无坐标）
  removeNodes: id[]
  updateNodes: { id, label?, task?（整体替换）, text? }[]
  addEdges: AgentGraphEdge[]
  removeEdges: id[]
  updateEdges: { id, kind? }[]
  moveScope: { id, scope }[]
}
```

### 1.2 确定性应用序与 fail-closed 诊断

应用序固定：`removeEdges → removeNodes → addNodes → updateNodes → moveScope → addEdges → updateEdges`（同 patch 两次应用全等）。

| 诊断 | 触发 |
|---|---|
| `STALE_BASE` | baseRevision 存在且 ≠ 基线 revision（governance 边界的新鲜度守卫） |
| `UNKNOWN_NODE` / `UNKNOWN_EDGE` | remove/update/move 的 id 不存在 |
| `DUPLICATE_NODE_ID` / `DUPLICATE_EDGE_ID` | add 与基线或 patch 内部撞 id |
| `NODE_HAS_EDGES` | removeNodes 的节点仍被未删边引用（显式删边，不级联） |
| `EDGE_ENDPOINT_UNKNOWN` / `EDGE_SELF_LOOP` | add 边端点缺失 / 自环 |
| `INVALID_MOVE_SCOPE` | move 目标不存在 / 非 subgraph |
| `SCOPE_CYCLE` | 应用后 scope 链成环（复用 IR containment 不变量，`applyGraphPatch` 出口全图校验） |

`validateGraphPatch(base, patch)` 纯函数诊断表；`applyGraphPatch(base, patch)` 诊断非空即 throw；`diffGraphPatch(base, patch)` 输出人话预览行（add/remove/update/move × node/edge，应用序）。

### 1.3 三入口接线（协议统一，不重复实现）

- **Preset / fragment**：`patchFromFragment(base, proposal)` —— 提案任务→addNodes（id 扫描生成）、title 依赖→addEdges；机器断言"apply → compile"与 `canvasInsertFragment` 路径编译等价。preset 保持 graph fragment generator（提案词汇），patch 是它的 IR 投影。
- **Auto architect（主代理）**：输出 GraphPatch JSON（宿主侧生成，内核只校验）→ 面板粘贴 → serve 预览 → 确认应用。CLI architect 命令不变（提案面既有通道）；架构师指令文案更新提及 patch 协议。
- **Manual**：手搓编辑保持 doc 直改 + 既有"校验→确认声明"（本就逐操作可视可逆，无 patch 中转收益——不做形式统一）。

### 1.4 serve 与面板

- `POST /api/canvas/patch {doc, patch}`（token 门内，零写入）：parse → lift → `patch.baseRevision` 对 live revision 判 STALE_BASE → validate → preview + apply + unload → `doc'` + 编译诊断（knownGateIds 同判）。响应 `{applied, diagnostics, preview, doc?}`。
- `unloadToCanvasDoc(graph, positions?)`（`src/canvas/lift.ts`）：agent→task（dependsOn＝按边序的入边 source key）、subgraph→subflow、annotation→annotation、scope→z；缺位坐标按确定性网格摆放；机器断言 `lift(unload(g)) ≡ g`。
- 面板 CanvasEditor：粘贴 patch JSON →「预览 Patch」（+绿/－红/±黄/move 蓝上墙）→「应用」落到草稿；STALE/诊断诚实呈现。

## 2. Non-goals

patch 持久化/历史（草稿面零服务端状态红线不变）、patch 合并/冲突解决、IR→live IR 的直接写路径（声明仍走 start/plan）、CLI patch 子命令。

## 3. 合同触点 / 迁移 / digest

事件/ProjectIR/调度/digest：零触碰（声明仍 PROJECT_REVISED）。CanvasDoc v2：零变化（unload 产物即 v2）。新增面＝`src/graph/patch.ts` + lift.ts 的 `unloadToCanvasDoc` + 一个纯派生端点。兼容性：无 shim、无双路径——patch 只活在 IR 层。

## 4. 验收

| 项 | 断言 |
|---|---|
| PATCH-A01 | 诊断矩阵：STALE_BASE / UNKNOWN_NODE / UNKNOWN_EDGE / DUPLICATE_* / NODE_HAS_EDGES / EDGE_* / INVALID_MOVE_SCOPE / SCOPE_CYCLE 全数拒绝 |
| PATCH-A02 | 应用确定性：同 patch 两次 apply 全等；全操作覆盖（增删改节点/边 + moveScope）结果图正确 |
| PATCH-A03 | `patchFromFragment` → apply → compile 与 fragment 插入路径编译等价；标题依赖重映射正确 |
| PATCH-A04 | `lift(unload(g)) ≡ g` round-trip；unload 缺位坐标确定性 |
| PATCH-A05 | serve：token 门内、零写入（事件数不变）、applied/诊断/预览/STALE 行为、编译诊断透传 |
| 浏览器 | 粘贴合法 patch → 预览上墙 → 应用落图 → 校验通过；非法 patch 诊断上墙不落图 |

## 5. 修订流水

| 日期 | 修订 |
|---|---|
| 2026-09-08 | G9-D（32 号 PLMP-CANVAS-7）修订：**kind 变更配方改判**——节点 kind 是定义类型（实体类型变化），换 kind ＝ remove 旧节点 + add **新身份**节点；旧"remove + add 同 id"配方与身份生命周期互斥，同 patch remove+add 同 id（node/edge）现为 `IDENTITY_REUSE` 拒绝；`patchFromFragment` 的 id 家族改 `n:sys:<k>`/`e:sys:<k>`（与 doc 身份家族一致，legacy `nK` 不相交）。 |
| 2026-09-07 | 初版冻结（PLMP-GRAPH-2，G4）：patch 形状（无坐标、baseRevision 新鲜度）、确定性应用序、九类 fail-closed 诊断、三入口接线（preset=patchFromFragment / auto=粘贴 patch / manual=doc 直改不中转）、单端点 `/api/canvas/patch` + unloadToCanvasDoc round-trip；与规划初稿"manual 也走 patch"的差异（不做形式统一）在此登记。 |
| 2026-09-07 | **交付**：`src/graph/patch.ts`（GraphPatch、固定应用序、十类诊断〔SCOPE_CYCLE 每次校验只报首个环——环成员各自报告同一破坏，噪声省略〕、diffGraphPatch 人话预览、patchFromFragment）+ `unloadToCanvasDoc`（lift∘unload≡identity、确定性网格摆位）+ serve `/api/canvas/patch`（live revision STALE_BASE 判定、零写入、compileError 诚实字段）+ 面板 GraphPatch 预览/应用双段交互 + 架构师指令补 patch 协议；PATCH-A01–A05 全绿；浏览器冒烟通过（＋Agent 验证者 / ±改名 / ＋边 预览上墙，应用后边挂载、角色徽章正确）。 |
| 2026-09-07 | G9-B（31 号 PLMP-GRAPH-5）修订：validate 从"局部操作检查 + apply 重解析兜底"升级为**结果图验证**（单一结果构造，validate PASS ⇒ apply 结构性必成）；EDGE_ENDPOINT_UNKNOWN 语义修正为结果节点集（原实现错用 base+adds，被移除节点侥幸通过）；`unloadToCanvasDoc` 对 unsupported kind 的静默降级被 31 号应用门拒绝（原"capability-clean graphs unload back"的措辞由 31 号 §2.3 表达门取代）；诊断集加法式扩至 17 类。 |
