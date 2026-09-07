# 稳定图身份规格（Canvas 依赖词汇 = node key）

> **Spec ID**：`PLMP-CANVAS-6` ｜ 状态：**已交付**（2026-09-07；演进线 G2 阶段，母体＝`audits/NEXT-GRAPH-EVOLUTION-PLAN.md` §1；验收 CANVAS-A18–A21 全绿〔46 文件 / 277 测试〕+ 浏览器冒烟：连线→改名→边保持、依赖 chip 跟随新 title、校验通过）
> **权威序**：CanvasDoc 契约以 21 号为基、由本规格**修订**（v2）；其余以 19/22 号与 03 号为准。
> **总纲**：rename 不断边。`key`＝图身份（唯一、不可变、`z`/`g`/依赖共用），`title`＝显示元数据与编译输出词汇。CanvasDoc **v2**：任务依赖从 title 数组改为 key 数组——单一格式，**无 v1 解析路径、无自动升级 shim**（SDS-8"不留兼容层"先例；0.1.x 客户端草稿，旧 v1 草稿响亮拒绝即正式迁移）。

## 1. Scope

### 1.1 CanvasDoc v2（唯一格式）

- `version: 2`；`CanvasTaskPayload.dependsOn: key[]`（引用同文档 task 节点的 key）。
- `parseCanvasDoc` 新增引用完整性（fail-closed，与 owner/group/member 同纪律）：
  - INV-D1：依赖 key 必须存在于文档（`depends on unknown key "<k>"`）；
  - INV-D2：依赖目标必须是 task 节点（`depends on "<k>" which is not a task`）——顺带消除 v1 中"subflow title 混入依赖命名空间"的歧义；
  - version ≠ 2 一律拒绝（错误信息明示 v1 不再受支持）。
- 循环依赖不在解析器检查——仍由共享提案校验器 `DEPENDENCY_CYCLE` 在编译出口报告（单一职责）。

### 1.2 编译（key→title 是编译器职责，不是兼容层）

- `canvasCompile`：扁平收集 task 节点（不变）；`dependsOn` key → 所引节点的 title 生成 `TaskProposal.dependsOn`（提案合同冻结、title 词汇不变）；重复 title 仍拒绝。
- `proposalFragment` / `canvasInsertFragment`：生成 key 并把提案的 title 依赖**重映射为 fragment 内部 key**（提案依赖经共享校验器保证闭合，映射全函数）。
- compile/diff/insert/layout/derive serve 端点合同形状零变化（请求响应仍是 doc/proposal JSON）。

### 1.3 面板

- 连线＝push source **key**；边解析＝key→可见 task 节点；Inspector 依赖 chip 显示 key→title 解析结果（悬空 key 显示原始 key——诚实）；`canvasDocShapeError` 守卫升到 v2。

## 2. Non-goals

GraphEdge 类型/typed edges（G3）、GraphPatch（G4）、服务端任何状态、diff 算法变化（仍消费编译产物）、布局算法变化（仅依赖解析从 title 改 key）。

## 3. 合同触点 / 迁移 / digest

- **事件/ProjectIR/调度/digest**：零触碰（编译输出与 v1 逐字节同形——TaskProposal 仍 title 依赖）。
- **CanvasDoc**：**破坏性 v1→v2**（字段集不变、依赖语义变更）；旧 v1 文档解析即拒，无迁移代码——正式迁移＝版本 bump + 拒绝信息（本节即迁移记录）。
- **兼容性陈述**：不存在双格式分支；`dependsOn` 字段名保持（语义由 version 2 钉住）。

## 4. 验收

| 项 | 断言 |
|---|---|
| CANVAS-A18 | rename task title 后 compile 输出逐字节不变（依赖挂 key 不断边）；依赖 key 悬空 / 指向非 task 节点 / version 1 → 解析即拒 |
| CANVAS-A19 | fragment 插入：key 重生成且依赖重映射到新 key；compile 输出与源提案逐字节一致 |
| CANVAS-A20 | 深层嵌套 + key 依赖：A03/A09/A16 场景在 v2 下原样通过（compile 等价、布局纯度、整链平移） |
| CANVAS-A21 | serve compile/diff 对 v2 文档行为不变；v1 文档 400 |
| 浏览器 | 连线→rename→校验：依赖 chip 跟随新 title 显示、编译诊断为空、对照实时无假阳性 |

## 5. 修订流水

| 日期 | 修订 |
|---|---|
| 2026-09-08 | G9-D（32 号 PLMP-CANVAS-7）修订：v2 退役为显式转换入口——`parseCanvasDoc` 只接受 v3（edges[] 唯一边真相 + identity 单调家族）；本规格的 INV-D1/D2 语义在 v3 中由边记录承载（source 必须 task＝只能依赖 task），节点 key 不变（定义身份红线）；v2 文档迁移走 `upgradeCanvasV2ToV3`（非 dual parse，节点 key 逐字保留）。 |
| 2026-09-07 | 初版冻结（PLMP-CANVAS-6，G2）：依赖词汇 title→key、CanvasDoc v2 单格式（v1 响亮拒绝，无 shim）、INV-D1/D2 引用完整性、编译器 key→title 映射、fragment key 重映射、面板 key 化；与 NEXT-GRAPH-EVOLUTION-PLAN §1"v1 兜底升级"的差异（改为 v2-only）及其理由（禁止兼容层）在此登记。 |
| 2026-09-07 | **交付**：doc/compile/layout 内核 v2 + 面板连线/chip/守卫 v2；A18–A21 全绿（46 文件 / 277 测试，G1 的 A01–A17 原样通过＝零编排漂移）；浏览器冒烟：注入 v2 双任务文档→选中改名→边保持（依赖 1）、chip 显示"← 起点（已改名）"、校验通过（声明预览"起点（已改名） → 终点"）；A20 由深层嵌套跨边界 key 依赖的 rename + 四布局纯度断言覆盖。 |
