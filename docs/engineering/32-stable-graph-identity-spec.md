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
- `src/canvas/mutate.ts`（D6 新增）：中心化 mutation 助手——add/remove/duplicate node、add/remove/reconnect edge、moveScope、add/remove group；MUT-INV-1 唯一入口
- `src/canvas/diff.ts`（D7 重写）：identity-aware diff——definitionId 优先、title fallback 仅限无身份侧、changedFields 覆盖 title/dependsOn/writePaths/requiredArtifacts/role/scope/suggestedSkills（gate 建议性不可 diff）
- `src/canvas/lift.ts`：lift 边真相切换 + unload(identity?) + 精确边比对 gate
- `src/canvas/compile.ts`：`canvasInsertFragment` 走分配器 + 边生成；`proposalFragment` **退役删除**（插入唯一路径）
- `src/canvas/layout.ts`：depsOf/force 读 `doc.edges`
- `src/graph/ir.ts`：capability 门 +`UNSUPPORTED_PARALLEL_DATA_EDGE`
- `src/graph/patch.ts`：+`IDENTITY_REUSE`；kind 注释改方案 B；`patchFromFragment` 改 `n:sys:/e:sys:` 家族
- `src/architecture/proposal.ts`（D10）：+`EMPTY_GOAL` 诊断（canonical replay 契约）
- `src/tools/graph.ts`（D7）：GraphTask 投影 +`suggestedSkills`（加法式可选，SDS-4；diff 的 live 侧需要已声明技能负载）
- `src/serve.ts`：patch 端点 digest 复原 + identity 透传；+`POST /api/canvas/anchor`（D8：单次观察 parse→lift→digest→live revision，**永不编译**）；diff 端点 live 侧带 definitionId/scopeId
- web（独立构建链，镜像 + tripwire 钉住）：`types.ts` v3 镜像、`canvasV3.ts`（converter/分配器/namespace 镜像）、`canvasMutate.ts`（D9：mutate.ts 全量镜像——9 个助手，web 变更唯一入口）、`canvasIntegrity.ts` v3 守卫（补 members/identity/edge 盲区）、`App.tsx`（恢复/导入走显式升级＋明示、连线/归入走镜像助手）、`Panels.tsx`（结构变更全部委托镜像、补丁面锚状态三态 FULL/PARTIAL/UNANCHORED、generate 走 anchorCanvas）、`CanvasView.tsx`（边渲染/徽章计数读 `doc.edges`）、`api.ts`（+anchorCanvas）

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

### 4.1 第二会话（D6–D10）验收（全部已交付，2026-09-08）

- `CANVAS-MUT-A01..A06`（D6）：中心化 mutation 层——MUT-INV-1（parse(before) PASS ⇒ parse(变更) PASS，全部助手逐个钉住）；删除 subflow 成员**向上提升一层到删除 scope 的 parent**（非根层）、嵌套后代随各自 scope 保留；duplicate＝子树 fresh id＋内部边 fresh，外部边与 membership 排除；reconnect＝删旧＋fresh（同端点 no-op 拒绝）；addEdge 拒非 task source/完全重复/self-loop；cycle guard＝`descendantKeys(doc, key).has(scope)`（只拒真正成环的归入）
- `DIFF-ID-A01..A06`（D7）：identity-aware diff——live 有 definitionId ⇒ 按 id 匹配（改名＝changed(title)，非 remove+add；同题不同 id＝remove+add，题等不越身份）；title fallback 仅当**该 live 任务未被 id 认领**且 draft 无 id（spec-first live / 手写草稿混合模式不串行认领）；changedFields 覆盖 §12 全部当前可代表字段：title/dependsOn/writePaths/requiredArtifacts/role/scope/**suggestedSkills**（集合比较；`suggested_skills` 自 E2 起入 TaskSpec，本轮加法式进 GraphTask 投影与 serve diff 映射）——**gate 不可 diff**（20 号：proposal gateId 仅建议，走 declareGate 单声明路径，永不进 TaskSpec，无 live 字段可比，A06 钉死）；removed＝未被认领的 live 任务
- `DIFF-ID-A05`（§13 要求）：纯布局移动后 compile 语义全等＋diff 为空（位置是视觉态，身份/边全不动）
- `ANCHOR-A01..A05`（D8）：`POST /api/canvas/anchor {doc}` → `{baseRevision, baseGraphDigest}` **单次观察**（一次 parse+lift 后同时取 digest 与 live revision，无二次读取窗口）；**永不编译/永不 capability-check**（环图草稿照样 FULL 锚定）；FULL（双锚）/PARTIAL（单锚）/UNANCHORED（无锚）三态语义
- `PROP-DECL-A01`（D10）：EMPTY_GOAL 复现链——`buildProjectIr` 接受空 goal ⇒ 事件入账 ⇒ canonical replay `parseProjectIr` 抛 "goal: must not be empty" ⇒ **毒化账本**（比"校验缺诊断"更重的缺陷）；修复收敛在唯一校验器（`validateProjectProposal` +EMPTY_GOAL），build 侧保持宽松
- D9 Web 完成：结构变更 100% 委托 `canvasMutate.ts` 镜像（9 助手与 kernel mutate.ts 一一对应）；`WEB-V3-A01` tripwire 扩展（9 个镜像导出钉住 + 禁内联删除过滤 + App 连线/归入走镜像）；补丁面锚状态三态 + ArchitectureBar generate 用 anchorCanvas 取 FULL 锚
- 浏览器冒烟 6 场景全过（真实浏览器、UI 驱动，证据见 `audits/G9-D-SESSION-2-DELIVERY.md` 十六问 Q11）
- 测试基线 58/370 → **58/384**（+14：6 CANVAS-MUT + 7 DIFF-ID describe + 1 PROP-DECL）；web tsc + vite build 绿

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
MUT-INV-1       first-party Canvas 变更永不产出 parser-invalid CanvasDoc（D6 起由中心化 mutate 层唯一入口保证，web 走镜像委托）
ANCHOR-INV-1    草稿新鲜度身份独立于 runtime 可执行性（digest 含边 id ⇒ v3 往返恒等后成立）
ANCHOR-INV-2    anchor 端点＝单次观察且永不编译（环图/不可编译草稿照样给出 FULL 锚，D8）
DIFF-INV-1      definition 身份在 draft/live 比对中优先于 title（D7 实现）
```

**UAS 语义解释红线（指令 §3/§24/§30，UAS-D-INV-1..6，全程遵守）**。两条术语澄清（§24，纯解释、零改名零 schema）：**CanvasDoc v3 是当前 Work 手搓文档（current Work-authoring document）**——只含 task/subflow/annotation/data 边，不是未来 ArchitectureCanvas；**现行 definition_id 是 legacy 图节点所代表的当前 task/work 定义的稳定标识**（canvas node key → IR node id → TaskProposal.definitionId → TaskSpec.definition_id 全链一义）。六条不变量：
- UAS-D-INV-1　现行 definitionId ≠ 未来 AgentDefinitionId（后者在 G10 获独立身份命名空间；REDLINE-1）
- UAS-D-INV-2　CanvasDoc v3 ＝ WorkCanvas，不向 agent instructions/models/message/handoff edges/Organization/Holon/Channel/StateDefinition 演进（REDLINE-2）
- UAS-D-INV-3　`/api/canvas/anchor` 只锚当前 Work 手搓图新鲜度；不发明 architectureRevision/architectureDigest/bindingRevision/runRevision（REDLINE-3）
- UAS-D-INV-4　本 diff 是 Work 定义 diff，不是 SystemGraph/ArchitectureDefinition/AgentDefinition diff（REDLINE-4）
- UAS-D-INV-5　Attempt 语义原样未动；Attempt vs Activation vs Invocation 留 G10-A0 审计（REDLINE-5）
- UAS-D-INV-6　role/scopeId/definitionId/dependsOn 不被偷用作未来 Binding 语义；G9 无 Binding（REDLINE-6）

本轮零新增 UAS schema（指令 §27）、零 AgentGraph→WorkGraph 改名（指令 §28：只正注释与规格术语，API 原样，正式改名/适配/退役策略留 G10-A0）。

## 6. 明确非目标（本轮不碰）

patch 位置/分组框保全与 moveScope 位置语义（G9-C/33 号）；ArchitectureBundle/架构原子事务（G9-E/34 号）；models.ts parser 收紧/poll 快路径（G9-F/35 号）；Playwright（G9-G/36 号）；Tool/Router/Memory/Human 运行时、消息总线、runtime cycles、edge breakpoint、force route、fork、time travel、手工 retry、消息注入、分布式调度；AgentDefinition/TaskDefinition 拆分；服务端 Canvas ledger / tombstone registry。

## 7. 修订流水

| 日期 | 修订 |
|---|---|
| 2026-09-08 | 初版冻结（PLMP-CANVAS-7，G9-D 会话 1＝D0–D5）：v3 单格式（edges[] 唯一边真相 + identity 单调家族 + dependsOn/node.g 退役）、显式 v2→v3 converter（节点 key 逐字保留红线）、IDENTITY_REUSE 同 patch 裁决、kind 变更方案 B、UNSUPPORTED_PARALLEL_DATA_EDGE capability 门、B3 relift bridge 退役（digest(patched) 恢复）、lift∘unload 严格全等、web 镜像 v3 适配＋tripwire；母体审计 P1–P10 机器实证先行；测试基线 57/354 → 58/370。 |
| 2026-09-08 | 会话 2（D6–D10）交付，规格完成：中心化 mutation 层 `src/canvas/mutate.ts`（MUT-INV-1 唯一入口；subflow 删除一层提升、duplicate 排除外部边、reconnect＝删旧＋fresh、cycle guard）＋ web 全量镜像 `canvasMutate.ts`（结构变更零内联完整性逻辑，tripwire 扩展钉住）；identity-aware diff（definitionId 优先、title fallback 不串认领、changedFields 覆盖 §12 可代表字段含 suggestedSkills；gate 保持建议性不可 diff）；`POST /api/canvas/anchor`（单次观察、永不编译、FULL/PARTIAL/UNANCHORED）；EMPTY_GOAL 收敛修复（PROP-DECL-A01 毒化账本实证）；浏览器冒烟 6 场景全过；UAS-D-INV-1..6 语义解释红线全登记（Work 手搓文档澄清，零新增 UAS schema、零改名）；测试基线 58/370 → 58/384。交付报告＝`audits/G9-D-SESSION-2-DELIVERY.md`。 |
