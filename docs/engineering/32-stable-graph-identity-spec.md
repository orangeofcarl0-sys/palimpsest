# CanvasDoc v3 / 稳定图身份生命周期 规格（PLMP-CANVAS-7，G9-D）

- 日期：2026-09-08
- 母体审计：`audits/G9-D-STABLE-GRAPH-IDENTITY-ASSESSMENT.md`（P1–P10 机器实证先行）
- 上一环节：G9-B3（31 号闭合修订）证明语义 digest 含边 id 而 v2 往返再生边 id，本批次由"功能增强"升级为**新鲜度正确性依赖**
- 批次顺序（G9-B3 §27 + 本轮 §42 纠偏）：**D（本规格 32）→ C（33）→ E（34）→ F（35）→ G（36）**

## 1. 问题（全部先机器复现，见母体审计）

1. **节点 key 自动复用**（P0）：web `genKey()`＝`max(current nK)+1`；kernel `canvasInsertFragment`/`patchFromFragment` 只扫当前存在 id——deleted n2 会被重新分配。G9-A 已钉死 `definition_id = AgentGraph node id`，因此 key 复用＝**一个 definition identity 表示两个不同逻辑定义**，污染 lineage/hold 历史身份/trace 关联/draft-live diff。
2. **边身份不存在**：v2 的 `task.dependsOn[]` 是唯一边真相、无边 id；lift 用局部计数器再生 `e1..eN`，patch 引入的 `pe9` 往返后变 `e1`——`digest(lift(unload(g))) ≠ digest(g)`，B3 只能以响应完整性 bridge hotfix（digest 取 relift 图）掩盖。
3. **同 patch remove+add 同 id 被静默接受**（P3 实证诊断为空）：replacement/revival/unrelated 四种语义读法并存，无裁决。
4. **kind 变更配方冲突**：25 号"换 kind＝remove+add（同 id）"与身份生命周期互斥。
5. **平行 data 边错层报错**：doc 层可构造 `dependsOn:["n1","n1"]`→两条平行 data 边→直到 TaskSpec 合同层才报 `TASK_SPEC_CONTRACT`（错误的名字、错误的层）。
6. **UI 变更制造 parser-invalid 文档**：删节点只 filter nodes（不清 dependsOn/membership），下一次 parse 即炸；web restore 守卫有 members/identity 盲区（kernel 拒、restore 收）。
7. **visual group 双真相**：`node.g` 与 `group.members` 并存且无交叉一致性检查；实证 `node.g` 在 kernel 与渲染层**零读者**（CanvasView 只读 members）。

## 2. 核心裁决

$$
Stable\ Graph\ Identity = Node\ Identity + Edge\ Identity + Identity\ Lifecycle + Mutation\ Integrity
$$

**Identity Lifecycle（节点与边同构）**：

```
CREATE → 分配新身份（单调分配器）
RENAME / PAYLOAD EDIT / MOVE SCOPE / CHANGE PRESENTATION → 身份不变
COPY / DUPLICATE → 新身份（copy ≠ rename ≠ move）
DELETE → 身份退役
NORMAL FUTURE CREATE → 永不复用退役身份
```

边特有：**端点属于逻辑边身份**——reconnect＝删旧边＋fresh 新边，不得原地改接保留 id（UI 操作面在 D6；语义由 EDGE-LIFE-A02 钉住）。

### 2.1 kind 变更＝方案 B（实体类型变化）

kind 是定义类型：改 kind ＝ 删旧节点 ＋ **新身份**建新节点。25/31 号"换 kind＝remove+add 同 id"配方作废（修订流水已登记）。未来如需 restore/revival 必须是独立 `restoreNode` 操作，绝不由 `addNodes` 后门承担。

### 2.2 同 patch remove+add 同 id＝`IDENTITY_REUSE` 拒绝

`addNodes cannot resurrect an identity removed in the same patch`（边同理）。语义空白不允许四种读法，直接拒绝。

### 2.3 ONE EDGE TRUTH（v3 schema）

```ts
interface CanvasDocV3 { version: 3; goal: string; identity: CanvasIdentityState;
  nodes: CanvasNode[];   // payload 无 dependsOn；node.g 退役
  edges: CanvasEdge[];   // { id, source, target, kind: "data" } —— 唯一边真相
  groups: CanvasGroup[]; // 形状不变（id/label/g〔嵌套〕/members）
}
interface CanvasIdentityState { namespace: string; nextNode: number; nextEdge: number }
```

- `task.dependsOn` 从 payload 与语法中删除（解析拒绝）；`dependsOn` 继续存在于 ProjectProposal/TaskSpec（编译输出词汇）。
- 本轮 canvas 语法 kind 仅 `"data"`（message/control 等仍 IR-only，capability 门拒）；self-loop 解析拒绝；边 source 必须存在且为 task（承 v2 INV-D2：只能依赖 task），target 必须存在。
- `node.g` 退役（零读者的第二编码）：转换器把 `node.g` 折叠进 `group.members`（并集）；`group.g`（分组嵌套）语义不同、保留。

### 2.4 单调分配器 + namespace 裁决

- 新 id：`n:<namespace>:<counter>` / `e:<namespace>:<counter>`；计数器只增不减；分配器带碰撞循环（兜底外部注入的同族 id）。counter 单调性保证**本 draft 自己分配过的 id 永不复现**（退役 id 的 counter 早已越过）。
- **namespace＝方案 A（random once）+ 单调计数**：web 创建/升级草稿一次生成（UUID 去连字符 12 位 hex），此后确定性；kernel 默认家族 `sys`（IR 直源 doc 无历史可考时），unload 以家族扫描为 counter 下界。真正要求确定性的是"同一 CanvasDoc + 同一 identity 输入 ⇒ 同一 kernel 输出"，namespace 显式入参下成立；两客户端独立建草稿 id 不同**不**是缺陷（Canvas 是 client draft）。
- `n:<ns>:<k>` 家族与 legacy `nK` 键空间天然不相交；`<ns>` 限 `[A-Za-z0-9][A-Za-z0-9_-]*`（无冒号，family 正则无歧义）。

### 2.5 v2→v3＝显式 converter（非 dual parse）

`parseCanvasDoc` 只接受 version 3（v1/v2 响亮拒绝，错误信息指向 converter）；`upgradeCanvasV2ToV3(value, namespace)` 是唯一 v2 入口（localStorage 恢复 / JSON 导入 / 显式迁移动作），内部先做严格 v2 校验（fail-closed，同 v2 解析不变量）。**红线：转换逐字保留全部已有 node key**（否则 ProjectIR.definition_id 与 Canvas lineage 断裂）；规则冻结：payload dependsOn 按节点声明×依赖序展平为 `e:<ns>:<k>`；`node.g` 折叠进 members；identity counter＝家族扫描下界；web 必须向用户明示升级。

### 2.6 平行 data 边＝capability 门 `UNSUPPORTED_PARALLEL_DATA_EDGE`

IR 保持 multigraph（结构合法、解析通过）；`agentGraphCapabilities` 加法式新增：同一 (source,target) 重复 data 边 → 拒绝（与 UNSUPPORTED_RUNTIME_CYCLE 同层——画出≠能编译），不静默 collapse。

### 2.7 GraphPatch AI id 与 tombstone 裁决（轻方案 + 限制显式登记）

Palimpsest 生成的身份永不全等复用（计数器单调）；同 patch remove+add 拒绝；AI/用户可继续提供任意 fresh id（addNodes.id 必填不变）。**跨历史草稿的任意外部 id 复用当前不可证明**（无持久 tombstone registry）——登记为已知限制；不为它加服务端 Canvas ledger（Canvas 仍是 client draft）。

### 2.8 B3 bridge 退役＝强不变量恢复

$$
liftToAgentGraph(unloadToCanvasDoc(g)) = g
$$

严格包含 node ids、edge ids、node order、edge order、语义载荷。serve patch 端点恢复 `graphDigest = digest(patched)`（relift 摘要删除，不叠第二个 workaround）；PATCH-FRESH-A04/A05 保留为 belt（两端由构造恒等）。`canvasRoundTripDiff` 边比较升级为有序 (id, source, target, kind) 精确比对。unload 增加 `identity` 透传（serve 传提交草稿的 identity，patch 往返不重置计数器）。

## 3. 合同触点

- `src/canvas/doc.ts`：v3 类型/解析/`emptyCanvasDoc(goal, namespace)`/`upgradeCanvasV2ToV3`/`allocateCanvasNodeId`/`allocateCanvasEdgeId`/`familyCountersOf`
- `src/canvas/lift.ts`：lift 边真相切换 + unload(identity?) + 精确边比对 gate
- `src/canvas/compile.ts`：`canvasInsertFragment` 走分配器 + 边生成；`proposalFragment` **退役删除**（插入唯一路径）
- `src/canvas/layout.ts`：depsOf/force 读 `doc.edges`
- `src/graph/ir.ts`：capability 门 +`UNSUPPORTED_PARALLEL_DATA_EDGE`
- `src/graph/patch.ts`：+`IDENTITY_REUSE`；kind 注释改方案 B；`patchFromFragment` 改 `n:sys:/e:sys:` 家族
- `src/serve.ts`：patch 端点 digest 复原 + identity 透传
- web（独立构建链，镜像 + tripwire 钉住）：`types.ts` v3 镜像、`canvasV3.ts`（converter/分配器/namespace 镜像）、`canvasIntegrity.ts` v3 守卫（补 members/identity/edge 盲区）、`App.tsx`（恢复/导入走显式升级＋明示、连线→边记录）、`Panels.tsx`（genKey 删除→分配器、删除节点清 incident edges+membership、依赖 chips 读边、删分组重挂嵌套子组）、`CanvasView.tsx`（边渲染/徽章计数读 `doc.edges`）

## 4. 验收（本会话 D0–D5）

- `ID-LIFE-A01..A05`（分配器不复活已删 key；fragment 同理；copy＝新身份；rename/payload/move 身份不变；退役后永不复现）
- `EDGE-LIFE-A01/A02`（边分配器不复活；reconnect＝删旧＋fresh，同 id 复活被拒）
- `PATCH-IDENTITY-A/B/C`（node/edge 同 patch remove+add＝IDENTITY_REUSE；kind 变更＝新身份配方可用）
- `EDGE-H01 / ROUNDTRIP-V3-A01`（严格全等：node/edge ids + 顺序 + 载荷；digest 恒等）
- `EDGE-H02`（patch 边 id `pe9` 存续至响应图）；`EDGE-H03`（updateEdges/removeEdges 经端点命中同一稳定 id；digest(patched) 即响应锚）
- `UNSUPPORTED-PARALLEL`（capability 门命名平行 data 边）
- `CANVAS-V3-MIG`（converter 保留 n1/n2/n17、边确定性、g 折叠、新分配不碰撞 legacy）
- `WEB-V3-A01`（web 镜像 tripwire：v3 类型/converter/守卫/genKey 退役/连线边记录）
- 测试基线 57/354 → **58/370**（既有 354 项语义等价迁移至 v3 断言，无静默放宽）
- **留待第二会话（D6–D10）**：中心化 kernel mutation 助手（MUT-INV-1 + CANVAS-MUT-A01..A03 + reconnect 操作面）、identity-aware diff（DIFF-ID-A01..A03）、`/api/canvas/anchor`（ANCHOR-A01..A04，Full/Partial/Unanchored）、Web 全面接线、浏览器冒烟、PROP-DECL-A01（EMPTY_GOAL）、交付报告

## 5. Invariants（规格钉死）

```text
GRAPH-ID-INV-1  Palimpsest 生成的节点身份永不自动复用
GRAPH-ID-INV-2  Palimpsest 生成的边身份永不自动复用
GRAPH-ID-INV-3  rename/payload/scope/presentation 编辑保持节点身份
GRAPH-ID-INV-4  copy/duplicate 产生新节点身份
GRAPH-ID-INV-5  正常删除使身份退役
GRAPH-ID-INV-6  GraphPatch 同 patch remove+add 同 id 遵循显式裁决（已采纳：IDENTITY_REUSE 拒绝）
EDGE-INV-1      CanvasDoc 只有一个边 authoring truth：edges[]
EDGE-INV-2      IR↔Canvas 往返边 id 逐字存续
EDGE-INV-3      reconnect 产生新逻辑边身份
MUT-INV-1       first-party Canvas 变更永不产出 parser-invalid CanvasDoc（本会话先达"删除面"清理，中心化助手在 D6）
ANCHOR-INV-1    草稿新鲜度身份独立于 runtime 可执行性（digest 含边 id ⇒ v3 往返恒等后成立）
DIFF-INV-1      definition 身份在 draft/live 比对中优先于 title（D7 实现）
```

## 6. 明确非目标（本轮不碰）

patch 位置/分组框保全与 moveScope 位置语义（G9-C/33 号）；ArchitectureBundle/架构原子事务（G9-E/34 号）；models.ts parser 收紧/poll 快路径（G9-F/35 号）；Playwright（G9-G/36 号）；Tool/Router/Memory/Human 运行时、消息总线、runtime cycles、edge breakpoint、force route、fork、time travel、手工 retry、消息注入、分布式调度；AgentDefinition/TaskDefinition 拆分；服务端 Canvas ledger / tombstone registry。

## 7. 修订流水

| 日期 | 修订 |
|---|---|
| 2026-09-08 | 初版冻结（PLMP-CANVAS-7，G9-D 会话 1＝D0–D5）：v3 单格式（edges[] 唯一边真相 + identity 单调家族 + dependsOn/node.g 退役）、显式 v2→v3 converter（节点 key 逐字保留红线）、IDENTITY_REUSE 同 patch 裁决、kind 变更方案 B、UNSUPPORTED_PARALLEL_DATA_EDGE capability 门、B3 relift bridge 退役（digest(patched) 恢复）、lift∘unload 严格全等、web 镜像 v3 适配＋tripwire；母体审计 P1–P10 机器实证先行；测试基线 57/354 → 58/370。 |
