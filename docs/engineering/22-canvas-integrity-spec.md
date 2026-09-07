# Canvas 完整性规格（所有权不变量 + 祖先链可见性）

> **Spec ID**：`PLMP-CANVAS-5` ｜ 状态：**已交付**（2026-09-07；G1 阶段，母体＝`audits/CURRENT-STATE-ASSESSMENT.md` §4；验收 CANVAS-A11–A17 全绿〔46 文件 / 273 测试，既有 266 项原样通过＝零漂移实证〕+ 真实浏览器三层嵌套冒烟通过：逐级展开视口正确、折叠祖父后孙图/成员/依赖边全消不泄漏、成环文档恢复被拒、布局全链平移、深层画布编译校验通过）
> **权威序**：CanvasDoc 契约以 21 号规格为准；呈现面先例以 19 号规格为准；系统设计与变更控制以 03 号为准。
> **总纲**：本规格只做**画布层完整性硬化**——解析器加法式收紧、布局传递子孙修正、面板祖先链可见性与交互守卫。零编排合同触碰、零事件触碰、零 ProjectIR 触碰；这是 G2+（稳定 id / AgentGraph IR / runtime subgraph / ready-set 调度）之前的可靠性地基。

## 1. Scope（范围）

### 1.1 内核：`parseCanvasDoc` 所有权不变量（fail-closed 加法式收紧）

对 CanvasDoc v1 形状（21 号 §1.1，字段集不变）新增四条结构性拒绝，全部在解析器进入任何渲染/编译之前：

| 不变量 | 规则 | 失败信息 |
|---|---|---|
| INV-C1 owner 类型 | `z ≠ "root"` 的节点，其 owner 必须是 `type === "subflow"` 的节点 | `owner "<key>" must be a subflow node` |
| INV-C2 无 self-parent | `node.z === node.key` 拒绝 | `node "<key>" cannot own itself` |
| INV-C3 z 链无环 | 沿 `z` 链上溯必须终止于 `"root"`；任意深度环（A→B→C→A）拒绝 | `ownership cycle detected at "<key>"` |
| INV-C4 group 链无环 | `group.g`（含自指）上溯必须终止；任意深度环拒绝 | `group nesting cycle detected at "<id>"` |
| INV-C5 类型-字段纪律 | `annotation` 不得携带 `task`；非 annotation 不得携带 `text`（既有 subflow 禁带 `task` 保持）——静默丢字段改为响亮失败 | `node "<key>" must not carry field "<f>"` |

实现纪律：单遍建 `key→node`/`id→group` 索引；环检测用访问标记上溯（O(n)），错误信息携带环入口 key/id。

### 1.2 内核：布局传递子孙修正（INV-C6）

`src/canvas/layout.ts` 的后代集从"直接子代"改为**传递闭包**（沿 owner 链递归收集；INV-C3 保证有限）。根 subflow 平移时整个后代子树随迁，深度 ≥2 包含关系不再断裂；布局纯度承诺（A09：布局只动坐标，compile 前后逐字节一致）不变并推广到深层。

### 1.3 面板：祖先链可见性（INV-C7）

定义（愿景文档原文）：`visible(node) = 每个 subflow 祖先都展开`。`web/src/CanvasView.tsx` 从单层判定改为**全祖先链判定**，统一于一个纯谓词：

- task/annotation：任一 subflow 祖先（含直接 owner）折叠 ⇒ 不渲染；
- subflow 节点：任一**严格**祖先折叠 ⇒ 不渲染（自身折叠态只决定摘要/容器形态，不再泄漏为根层孤儿）；
- 依赖边：`visibleTasks` 用同一谓词过滤（两端点任一不可见 ⇒ 边不画）；
- 展开子图 bounds 与 group 框 bounds：只用链上可见成员参与包围盒；group 全员不可见 ⇒ 框不画。

### 1.4 面板：交互与加载守卫（INV-C8/C9）

- **INV-C8 drop 环守卫**：`onDropInto(key, ownerKey)` 拒绝"被拖节点是 subflow 且 `ownerKey` 落在其自身子树内"（`ownerKey ∈ descendants(key)`，自指含于自身子树）——只有 subflow 能作 owner，task 拖拽永不致环（故从内层子图拖出到外层子图合法，不误伤）；目标非 subflow 亦拒绝；拒绝时状态不变并诚实提示。drop 目标候选只含链上可见 subflow。注：当前面板 drop-into 仅对 task 生效（subflow 拖动只移动坐标），该守卫为纵深防御，供 subflow 重挂载能力上线时即得保护。
- **INV-C9 加载守卫**：localStorage 恢复与 JSON 导入经本地形状守卫（`web/src/canvasIntegrity.ts`：未知 owner、owner 非 subflow、self-parent、z/group 环即拒绝加载，保留原文档并提示）。守卫与内核 INV-C1..C4 同构——**内核 `parseCanvasDoc` 仍是唯一权威**（serve 五端点全过它）；web 守卫是独立构建链（19 号）下的用户面止血，非编译逻辑复制。

## 2. Non-goals（非目标）

稳定节点/边 id（G2）、AgentGraph IR 与 typed edges（G3）、GraphPatch（G4）、runtime subgraph（G5）、调度语义任何变化（G6）、CanvasDoc schema 字段增删（v1 契约冻结不动）、Group 成员约束收紧（纯视觉面维持透明）、web 单测基建引入（面板行为以真实浏览器冒烟验收）。

## 3. 合同触点 / 迁移 / digest 影响

- **事件契约**：零触碰（无新事件、无字段、无 digest 变更；`suggested_skills` 通道原样）。
- **ProjectIR / 调度器 / evidence / Ordarium**：零触碰。
- **CanvasDoc 契约**：字段与 version 不变；解析器对**此前合法文档**行为逐字节不变（新增拒绝只覆盖此前"解析通过但语义畸形"的面——owner 非 subflow、self-parent、环、跨类型字段）。
- **迁移影响**：无（fail-closed 拒绝即修复对象本身，无数据迁移）。
- **Canonical digest 影响**：无。
- **兼容性陈述**：加法式收紧；既有 46 文件 / 266 测试必须全绿原样通过（含 CANVAS-A01–A10、parity fixture、replay）。

## 4. 验收（机器守门项，接续 CANVAS-A10）

| 项 | 断言 |
|---|---|
| CANVAS-A11 | INV-C1：task/annotation 作 owner 拒绝；subflow 作 owner 与 root 合法文档照常 round-trip |
| CANVAS-A12 | INV-C2：`A.z = A` 拒绝（subflow 与 task 同断言） |
| CANVAS-A13 | INV-C3：`A→B→C→A` 任意深度 z 环拒绝；长链（≥4 层）合法通过 |
| CANVAS-A14 | INV-C4：group 自指与 G1↔G2 环拒绝；合法嵌套 group 通过 |
| CANVAS-A15 | INV-C5：annotation+`task`、task+`text` 拒绝；合法文档 JSON round-trip 逐字段保真 |
| CANVAS-A16 | INV-C6：三层 z 链（root > s1 > s2 > m）经任意布局后 m 随 s1 全量平移；compile 输出前后逐字节一致 |
| CANVAS-A17 | serve 端点对畸形文档（环/self-parent/坏 owner）400 且事件数不变（fail-closed 收紧透传到 serve 门） |
| 浏览器冒烟 | 三层嵌套 subflow：逐级展开/折叠不泄漏；折叠祖父后孙图与成员、依赖边全部消失；拖拽 subflow 入自己后代被拒；导入含环 JSON 被拒且原文档保留；布局后深层成员随迁 |

## 5. 红线（继承 21 号 §5 全部六条）

本轮特别重申：**红线 3（内核单源）**——校验权威在 `parseCanvasDoc`，web 守卫同构但从属；**红线 6（布局不改语义）**——A16 将 A09 推广到深层嵌套。

## 6. 修订流水

| 日期 | 修订 |
|---|---|
| 2026-09-07 | 初版冻结（PLMP-CANVAS-5，G1）：九项缺陷（A–I，含审计新发现 F–I）→ 五条解析不变量 INV-C1..C5 + 布局 INV-C6 + 面板 INV-C7..C9；验收 CANVAS-A11–A17 + 三层嵌套浏览器冒烟；零合同/零迁移/零 digest 承诺与兼容性陈述。 |
| 2026-09-07 | **交付**：INV-C1..C5 落 `parseCanvasDoc`（owner 类型/self-parent/z 环/group 环/类型-字段纪律全 fail-closed）、INV-C6 落 `layout.ts` 传递子孙闭包（`descendantsByOwner`，含预置缓存防呆）、INV-C7 落 CanvasView 全祖先链可见性（节点/边/bounds/group 框统一谓词）、INV-C8 落 App drop 环守卫（仅 subflow 入自身子树拒绝，不误伤跨层拖出）、INV-C9 落 `web/src/canvasIntegrity.ts` 恢复/导入形状守卫；A11–A17 全绿（46 文件 / 273 测试，既有 266 项原样通过）；浏览器冒烟：三层嵌套逐级展开/折叠、折叠祖父全隐藏（孙图+成员+边）、成环 localStorage 恢复拒绝（"归属环：s1"）、流式→布局深层整链等差平移（s1/s2/m 同 Δ(-320,-120)）、深层画布校验通过（3 任务 flatten）；规划产物＝`audits/NEXT-GRAPH-EVOLUTION-PLAN.md`（G2–G8）。 |
