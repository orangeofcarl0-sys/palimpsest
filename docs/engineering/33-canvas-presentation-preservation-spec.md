# Canvas 表现保真规格（PLMP-CANVAS-8，G9-C）

- 日期：2026-09-08
- 母体：G9-C 指令（§0–§32）；上属批次＝32 号（G9-D COMPLETE，`aedb1b3`）
- 立论：G9-D 钉死了**语义身份在编辑中存活**；G9-C 钉死**用户表现在语义编辑中存活**——且表现永不成为编排真相

## 1. 问题（机器复现在先，指令 §4）

当前 `/api/canvas/patch` 应用语义补丁后经 `unloadToCanvasDoc(patched, { identity: doc.identity })` 重建画布：surviving 节点位置被**确定性网格**覆盖、`groups` 恒为 `[]`。复现器（vitest 实证通过，实现前运行）：

```text
before: A@(701,113)、B@(211,628)、VisualGroup g1"Research" members=[A,B]、identity nextNode=3
patch : 仅 rename A → A2（纯语义）
after : A@(80,80)、B.y@(80)、groups=[]          ← 表现被摧毁
```

一次无害的语义编辑即可摧毁用户精心组织的 Work 画布。裁决：

$$
Semantic\ Change \neq Presentation\ Destruction
$$

## 2. 所有权表（指令 §6）

| 归属 | 字段 |
|---|---|
| **semanticResult 独占** | goal、identity、节点身份、节点语义载荷、scope（z）、mode、edges、边身份、边序、节点序 |
| **before 仅可贡献** | 存活身份的 x/y；VisualGroups（id/label/g/members） |

$$
semanticResult.identity \ MUST\ dominate\ before.identity
$$

## 3. 核心原语（Option B，指令 §13）

`src/canvas/presentation.ts`：

```ts
reconcileCanvasPresentation(before: CanvasDoc, semanticResult: CanvasDoc): CanvasDoc
```

唯一合并规则：`old presentation + new semantic document → new Work Canvas`。`unloadToCanvasDoc` 保持纯 IR→Canvas 结构投影（不偷看旧画布）；表现保全是显式的双输入合并。serve patch 端点委托之（§14 流程），并在端点测试中断言 `lift(returnedCanvas)` 严格等于 patched graph。

## 4. 算法

1. `identity := semanticResult.identity`（逐字，PRES-INV-5）。
2. `nodes := semanticResult.nodes`（序/载荷/身份逐字）；对每个节点：
   - key 存在于 `before` ⇒ `x/y := before` 的 x/y（PRES-INV-1；数值精确相等）；
   - 否则（新增节点）⇒ §5 确定性避让放置（按 semanticResult 声明序逐个）。
3. `groups := before.groups`（声明序不变）；每组 `id/label/g` 逐字保留，`members := members ∩ 存活节点 key`（序不变；只删被语义删除的成员；**空组保留**，PRES-INV-2/3）。
4. edges/goal/scope/mode 全部来自 semanticResult，合并不可触碰。

语义透明性由构造保证（x/y 与 groups 不入 lift），并以 CANVAS-H08 机器断言 `liftToAgentGraph(reconciled)` 严格等于 patched graph。

## 5. 新节点确定性避让放置（指令 §9/§10）

- 足迹常数：`W=190, H=56, GAP=24`（现画布节点几何；不过度工程化）。
- 已占用集合：全部已有最终位置的节点（保留节点＋本批已放新节点）的 `(x,y,W,H)` 矩形。
- 种子：scope 的 owner（subflow）**在放置时已有最终位置** ⇒ 种子＝owner 下方一行（`owner.x, owner.y + H + GAP`）；否则（root 或 owner 未定位）＝经典网格起点 `(80,80)`。**存储坐标恒为绝对 Canvas 坐标**（§8 裁决），不发明相对持久化；不改 owner 位置。
- 扫描：行优先 4 列网格 `x = seed.x + col*(W+GAP)`、`y = seed.y + row*(H+GAP)`，跳过与占用矩形严格相交的槽位，取**第一个自由位**。
- 确定性：同 `before/semanticResult` 输入 ⇒ 逐字节相同位置（声明序＋稳定扫描）；**绝不移动既有节点腾位**（§9.3，既有位置永远赢）。
- scope≠root 的新节点：如上 owner 种子；最小行为，登记于本节，无全局布局。

## 6. moveScope 坐标裁决（指令 §8，即刻冻结）

Canvas 存储恒为**绝对 x/y**（ReactFlow 嵌套渲染只在渲染期换算 `relative = absoluteChild − absoluteParent`，拖拽完成换回绝对）。因此正式冻结：

$$
moveScope\ preserves\ stored\ absolute\ x/y
$$

`N(x=620,y=240,z=root)` 经 `moveScope N→S` 后 `(620,240,z=S)`——containment 变、Canvas 世界位置不变，绝不因 z 变化换算坐标。D6 mutation 层 `canvasMoveNodeScope` 已满足（只改 z）；语义 patch 路径由 PRES-INV-1 自动满足（被移动节点身份存活 ⇒ 拿 before x/y）。

## 7. Invariants

```text
PRES-INV-1  存活语义节点不动（GraphPatch 是语义操作，不得移动存活节点）
PRES-INV-2  VisualGroups 存活：id/label/g/声明序逐字保留（referential 清理除外）
PRES-INV-3  被删节点仅从 members 移除；空组合法且保留，绝不自动删组
PRES-INV-4  新节点确定性放置，且与保留位置避碰
PRES-INV-5  after.identity = semanticResult.identity（逐字；旧表现永不回卷计数器）
PRES-INV-6  liftToAgentGraph(after) = liftToAgentGraph(semanticResult)（严格；digest 表现无关）
```

并保持 G9-D 全部不变量（GRAPH-ID-INV-1..5、EDGE-INV-1..3、MUT-INV-1、DIFF-INV-1、ANCHOR-INV-1/2）与 UAS-D-INV-1..6。

## 8. 合同触点

- `src/canvas/presentation.ts`（新增）：reconcileCanvasPresentation + 避让分配器（机制可复用：稳定 id 匹配/存活保留/被删成员清理/新项放置——只操作 CanvasDoc 类型，不编码"node id＝AgentDefinition"类假设）
- `src/serve.ts`：patch 端点 `unload → reconcile(before, semantic)`（§14 流程）
- 测试：`test/canvas.test.ts`（CANVAS-H01..H10 纯函数层）、`test/graph_identity.test.ts`（PATCH-PRES-A01..A04 端点层，含 PRES-ID-A01）

## 9. 验收

- **CANVAS-H01** 存活位置逐字节保留（A@(701,113)/B@(211,628) 在 role/title/skills-only patch 后不变）
- **CANVAS-H02** VisualGroup 全表现字段逐字节保留
- **CANVAS-H03** 删成员仅清 members（G1 [A,B]→[B]，组其余不变）
- **CANVAS-H04** 空组存活（[A]→[]，组仍在）
- **CANVAS-H05** 新节点避碰＋同输入同选择＋既有节点不动
- **CANVAS-H06** 多新节点（C/D/E）重复应用位次与坐标逐字节一致
- **CANVAS-H07** moveScope 绝对 x/y 不变
- **CANVAS-H08** 语义透明：lift(reconciled) === patched graph
- **CANVAS-H09 / PRES-ID-A01** 计数器不回卷（before nextNode=3，patch 加 n:…:7 ⇒ after nextNode≥8 保持）
- **CANVAS-H10** 嵌套 VisualGroup（g 链/members/声明序）存活，仅被删成员移除
- **PATCH-PRES-A01..A04** 端点级：语义更新（位置+组+digest 正确）/加节点（旧固定+新避让+计数器推进）/删节点（组清空保留）/moveScope（绝对坐标不变）
- 回归门：kernel/web tsc、全量 vitest、web build、真实浏览器冒烟（指令 §18 十二步）

## 10. 明确非目标

viewport/selection/expanded/ReactFlow 内部态持久化（瞬态 UI 态不入 CanvasDoc，§19）；GraphPatch 增加表现操作（movePosition/addVisualGroup/removeVisualGroup/resize/collapse/viewport——§12 纪律：GraphPatch=语义 patch，画布直改/布局=表现操作）；ArchitectureCanvas/SystemGraph/AgentDefinition/Binding/Invocation 等 UAS 对象（§21）；G9-F/G9-G/G10/G11；全局自动布局。

## 11. UAS 红线

CanvasDoc v3 ＝ WorkCanvas（UAS-D-INV-2）不变；本批机制日后可被 ArchitectureCanvas 复用，但现 schema 不是那个未来 schema；零新增 UAS schema；零改名。README 措辞保持事实性（不夸大为已完成普适 agent OS）。

## 12. 修订流水

| 日期 | 修订 |
|---|---|
| 2026-09-08 | 初版冻结（PLMP-CANVAS-8）：复现器先行（rename-only patch 摧毁位置+分组，vitest 实证）；Option B 显式合并原语；所有权表（semanticResult 独占语义+identity，before 仅贡献存活表现）；PRES-INV-1..6；moveScope 绝对坐标冻结；避让分配器（190×56+24 网格扫描，owner 种子）；空组/嵌套组保留；验收 CANVAS-H01..H10 + PATCH-PRES-A01..A04 + PRES-ID-A01。 |
