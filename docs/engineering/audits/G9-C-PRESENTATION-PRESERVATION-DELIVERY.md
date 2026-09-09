# G9-C（Canvas Presentation Preservation / PLMP-CANVAS-8）交付报告

- 日期：2026-09-08
- 规格：33 号《Canvas 表现保真》（`33-canvas-presentation-preservation-spec.md`）
- 代码基线：`aedb1b3`（G9-D COMPLETE）之上；实现提交见 git log（feat(g9-c)）
- 测试基线：**58 文件 / 398 用例全绿**（G9-D 收口实测 58/384 → +14：CANVAS-H01..H10 + PATCH-PRES-A01..A04）；kernel/web `tsc` 干净、web build 绿、浏览器冒烟 12 步全过

## 十八问（指令 §28 逐条）

**1. CanvasDoc v3 里现存哪些表现数据？**
`node.x / node.y`（绝对 Canvas 坐标）与 `groups[]`（`id / label / g? / members[]`——嵌套组的 `g` 链是表现关系）。此外无：v3 已把 dependsOn/node.g 退役（32 号）。

**2. 哪些数据刻意保持瞬态 UI 态？**
`expanded`（子图折叠集）、`selected`、viewport/fitView、ReactFlow 内部态——全部留在组件 state/localStorage 之外，不入 CanvasDoc（指令 §19；本批零触碰）。

**3. 修复前的语义 patch 表现丢失复现器是什么？**
实现前以 vitest 草稿测试机器实证（后删除，证据录规格 33 §1）：`before`＝A@(701,113)、B@(211,628)、组 g1"Research"[A,B]；patch 仅 rename A ⇒ after＝A@(80,80)、B.y→80、`groups: []`。根因＝serve 端点 `unloadToCanvasDoc(patched, {identity})` 无 positions、无 groups。

**4. 现在唯一的 reconcile 真相是什么？**
`src/canvas/presentation.ts` 的 `reconcileCanvasPresentation(before, semanticResult)`——唯一合并规则（`old presentation + new semantic document → new Work Canvas`）。serve patch 端点委托之（`unload → reconcile`）；`unloadToCanvasDoc` 保持纯 IR→Canvas 投影（Option B，不偷看旧画布）。

**5. 最终 identity 计数器归谁？**
`semanticResult.identity`，逐字（PRES-INV-5/CANVAS-H09/PRES-ID-A01）。before 的表现元数据永不回卷 `nextNode/nextEdge`；patch 引入同族 id（如 `n:sys:7`）经 familyCountersOf floor 推进（浏览器实证 nextNode 5→10）。

**6. 存活节点位置如何匹配？**
按稳定 node key（`beforeByKey`）——身份匹配，不是序号匹配。key 同时存在于 before 与 semanticResult ⇒ x/y 逐字取 before 值（PRES-INV-1）；语义结果中的节点序/载荷/身份不动。

**7. 新节点如何放置？**
`placeNewNodes` 确定性避让分配器（§5）：种子（scope owner 已定位 ⇒ owner 下方一行；否则经典网格原点 (80,80)）→ 行优先 4 列网格扫描 → 跳过与占用矩形（190×56+24 间距）严格相交的槽位 → 第一个自由位。存储坐标恒为绝对 Canvas 坐标（§8 裁决），owner 位置不被改动。

**8. 避碰如何做到确定性？**
纯函数：占用集合＝保留节点最终位置＋本批已放新节点（按声明序累加）；固定足迹常数与固定扫描序 ⇒ 同输入逐字节同输出（CANVAS-H05/H06 两次运行 deep-equal 实证）。绝不移动既有节点腾位（§9.3）。

**9. VisualGroups 到底发生了什么？**
before.groups 是组的唯一真相（声明序/id/label/g 逐字保留）；members 按原序过滤掉被语义删除的节点 key；新语义节点**不**自动入组（GraphPatch 无分组语义，§12）；嵌套 g 链逐字保留（CANVAS-H02/H03/H10）。

**10. 空组保留吗？**
保留（CANVAS-H04/PATCH-PRES-A03：`[A]→[]` 后组对象原样存在）——删组是表现操作，不是语义副作用。

**11. moveScope 坐标冻结规则是什么？**
`moveScope 保留存储的绝对 x/y`（规格 33 §6）：`N(620,240,z=root)` 经 moveScope→S 后 `(620,240,z=S)`。ReactFlow 的相对换算只存在于渲染期。D6 `canvasMoveNodeScope` 只改 z（已满足）；语义 patch 路径由 PRES-INV-1 自动满足（CANVAS-H07/PATCH-PRES-A04/浏览器第 11-12 步）。

**12. 语义 digest 因 reconcile 改变吗？**
不变。PRES-INV-6：`liftToAgentGraph(reconciled) === patched`（CANVAS-H08 严格断言）；digest 表现无关（x/y/groups 不入 lift）。端点级亦断言 `digest(lift(response.doc)) === response.graphDigest`（PATCH-PRES-A01）。

**13. 哪些端点级测试通过？**
`POST /api/canvas/patch`：PATCH-PRES-A01（语义更新：位置+组+digest 正确）、A02（加节点：旧固定+新避让+计数器 floor≥8+同请求同布局）、A03（删节点：组清空保留，两次删除级联）、A04（moveScope：绝对 x/y 不变）。全过。

**14. 哪些浏览器场景通过？**
指令 §18 十二步全过（serve 4624＋真实浏览器；身份证据读 localStorage）：建 3 节点→手动拖至不规则位（多次拖拽＋力导向铺开＋手调 (295,250)/(552,202)/(444,457)）→建组 grp1[调研,新任务 2]→①patch 改名 调研：三点坐标逐字不变、组完好；②patch 加 综合@80,80：旧点不动、无重叠（Fit View 截图：综合独立于组框外）；③patch 删组员 新任务 2：组存活 members=[调研]；④＋子图＋patch moveScope 调研→子图：z 变 `(295,250)` 不变，组归属不受 scope move 影响。

**15. 实际最终测试计数？**
**58 文件 / 398 用例全绿**（G9-D 实测基线 58/384 → +14）；kernel `tsc --noEmit` 干净；web `tsc` 干净；`vite build` 绿（422.21 kB）；kernel dist 重建后冒烟。

**16. 382/384 记账冲突核对了吗？**
是（§23）：实测 G9-D 收口＝**58/384**（+14 中 2 项为对照指令全文后的对账补齐 DIFF-ID-A05/A06）——正式规格/交付报告的 384 正确；`aedb1b3` **提交信息**里的 58/382 是过时草稿数。按 §23 不改写历史，只在此登记核对结论；当前工程记录统一为 384（本批收口 398）。

**17. G9-F 还剩什么？**
parser 纪律（未知字段 fail-closed 的作者侧行为）、canonical parser 兼容决策、`/api/graph` 轮询快路径、空库 serve 的健康检查空态缺口（G9-C 冒烟再次实证：空库 `/api/health` 400 导致 UI 令牌门进不去，本批仍以 curl 引导项目绕过）。

**18. 哪些 UAS 问题仍推迟给 G10-A0？**
`G10-G11-ROADMAP.md` 的 G10-A0 预检注全清单：SystemGraph≠WorkGraph、CanvasDoc v3＝Work canvas（确认）、definition_id＝Work 身份（确认）、未来 AgentDefinitionId＝全新身份、ArchitectureDefinition/WorkDefinition 独立规范实体、BindingDefinition/RunDefinition、TaskGraphWork⊂WorkDefinition、Attempt vs Activation、Invocation/Participation、RuntimeScope→OrchestrationPolicyInstance、ExecutionPlan＝派生编译目标＋开放问题 A–F。本批的 reconcile 机制（稳定 id 匹配/存活保留/被删清理/新项放置）按 §22 设计为可复用基建，但 schema 仍是 WorkCanvas（UAS-D-INV-2），零新增 UAS schema、零改名。

## 退出条件核验（指令 §30 checklist）

| 条件 | 状态 |
|---|---|
| 语义-only patch 不再移动存活节点 | ✅ CANVAS-H01/PATCH-PRES-A01/冒烟① |
| 语义-only patch 不再删除 VisualGroups | ✅ CANVAS-H02/H10/冒烟① |
| 被删节点仅从 membership 移除 | ✅ CANVAS-H03/PATCH-PRES-A03 |
| 空组存活 | ✅ CANVAS-H04 |
| 嵌套组结构/顺序存活 | ✅ CANVAS-H10 |
| 新节点确定性放置 | ✅ CANVAS-H05/H06/PATCH-PRES-A02 |
| 新节点避让已保留位置 | ✅ CANVAS-H05/冒烟② |
| 既有节点绝不为新节点让位 | ✅（allocator 只扫新位） |
| moveScope 保留绝对 x/y | ✅ CANVAS-H07/PATCH-PRES-A04/冒烟④ |
| reconcile �确保留 patched 语义图 | ✅ CANVAS-H08/PATCH-PRES-A01 |
| reconcile 精确保留语义后 identity | ✅ CANVAS-H09/PRES-ID-A01 |
| digest 表现无关 | ✅ PRES-INV-6 |
| `/api/canvas/patch` 用中央 reconcile 助手 | ✅ serve 委托 |
| G9-D 回归套件绿 | ✅ 58/398（含全部 G9-D 用例） |
| 端点测试过 | ✅ |
| 真实浏览器冒烟过 | ✅ 12/12 |
| CanvasDoc 仍为 WorkCanvas | ✅ |
| 零新增 UAS schema | ✅ |
| 382/384 记账核对 | ✅（本报告 Q16） |
| roadmap 干净指向 G9-F | ✅（§24 清理，见 roadmap 修订） |
