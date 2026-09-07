# G9-D 稳定图身份只读审计（CanvasDoc v3 / Stable Graph Identity Lifecycle）

- 日期：2026-09-08
- 审计基线：`main` = `e4f5fa6`（G9-B3 交付后，工作树干净），测试基线 57 文件 / 354 项全绿
- 姊妹计划：`audits/G9-C-G-IMPLEMENTATION-PLAN.md`（G9-B3 §27 已重排 B3→D→C→E→F→G）
- 方法纪律：**未审计先改代码为零**。全部缺陷先用 scratch probe（`test/scratch-g9d-audit.test.ts`，取证后已删除）在当前 main 上机器复现，再冻结裁决。下文 P1–P10 输出均为逐字实录。
- 本轮会话边界（母体 §50/§51）：**只执行 D0–D5**（审计 → 身份生命周期冻结 → CanvasDoc v3 + 显式迁移 → 单调分配器 → IR↔Canvas 边身份严格往返 → GraphPatch 身份复用裁决）。D6–D10（中心化 mutation 助手、identity-aware diff、anchor 端点、Web 全面接线、冒烟、交付报告）留给第二会话。

---

## 1. 核心重新定位确认（母体 §0）

旧计划把 G9-D 定义为"稳定边身份"（规格 33 原案）。本轮审计证实真正缺口是四件事的合取：

$$
Stable\ Graph\ Identity = Node\ Identity + Edge\ Identity + Identity\ Lifecycle + Mutation\ Integrity
$$

G9-A 已钉死 `definition_id = AgentGraph node id` 并沿 Canvas→Proposal→TaskSpec→ProjectIR→Runtime→Trace→历史治理传递；因此**节点 key 的自动复用是 canonical 正确性问题**，不是 UI 瑕疵（母体 §3）。

## 2. 机器复现清单（P1–P10，全部为当前 main 实测）

### F-A Web `genKey()`：`max(current nK) + 1`（母体 §3）

`web/src/Panels.tsx:305`：

```ts
const genKey = (): string => {
  let max = 0;
  for (const node of doc.nodes) {
    const match = /^n(\d+)$/.exec(node.key);
    if (match !== null) max = Math.max(max, Number(match[1]));
  }
  return `n${max + 1}`;
};
```

unused ≠ never-used：删除 n2 后新建节点必然复用 n2。

### F-B kernel `canvasInsertFragment()` 同款（母体 §3）

`src/canvas/compile.ts:77-83`：`freshKey` 只扫描 `doc.nodes` 当前 key。实测：

```
P2 fresh fragment key = n2 (n2 was deleted)
```

### F-C `patchFromFragment()` 第三处同款

`src/graph/patch.ts:713-720`（节点 `n${next}` 扫描当前 base）与 `:736-748`（边 `pe${counter}` 扫描当前 base.edges）。三处分配器全部"扫当前存在集合"，无一处有 retired 概念。

### F-D GraphPatch `remove+add same id` 被静默接受（母体 §6）——已实测

```
P3 remove+add same id diagnostics = []
P3 applied node n17 kind = annotation
```

`removeNodes:["n17"] + addNodes:[{id:"n17", kind:"annotation", …}]` 诊断为空、apply 成功——n17 的定义身份在一份草稿内被换成完全不同的逻辑实体。这正是 25 号规格"换 kind＝remove+add"旧配方所依赖的路径（§7.1 冲突点）。

### F-E 边身份在 IR↔Canvas 往返中再生（母体 §8 前提 + B3 伤口）

`src/canvas/lift.ts:35-41`：`liftToAgentGraph` 用局部计数器重生成 `e1..eN`；CanvasDoc v2 的 payload `dependsOn[]` 是唯一边真相、无边 id。实测（patch 引入边 id `pe9` 后往返）：

```
P4 patched edge ids = [ 'pe9' ]  relifted = [ 'e1' ]
```

且 `digest(lift(unload(g))) ≠ digest(g)`。G9-B3 的 bridge hotfix（serve.ts:368-379：digest 取 `lift(returnedDoc)` 而非 `patched`）就是为掩盖此缺口而存在的临时补丁。

### F-P5 平行 data 边在 canvas 层无名，错层报 `TASK_SPEC_CONTRACT`（母体 §12）——已实测

```
P5 lifted parallel data edges = [{"id":"e1","source":"n1","target":"n2","kind":"data"},{"id":"e2","source":"n1","target":"n2","kind":"data"}]
P5 proposal validation = [{"type":"TASK_SPEC_CONTRACT","task":"B","detail":"depends_on: duplicate entries are forbidden"}]
```

v2 的 `dependsOn:["n1","n1"]` 在 doc 层解析通过、lift 出两条平行 data 边（IR 是 multigraph，结构合法），直到 TaskSpec 合同层才以错误的层名报错。缺一个 canvas/IR capability 层的正式名字。

### F-G Visual Group 双真相（母体 §38/§39）——已实测 + 读者清点

```
P6: node.g=G1 with empty G1.members parses fine（无交叉一致性检查）
```

读者清点：**kernel 与渲染层对 `node.g` 的读取次数为零**（`grep "\.g\b"`：只有 doc.ts 的解析/校验分支自己）。CanvasView 画分组框只读 `group.members.includes(node.key)`（CanvasView.tsx:337-349）；first-party UI 只写 members、从不写 `node.g`。结论：`node.g` 是**从未被消费的第二编码**，不是"语义不同的两个真相"（§40 的可疑设计不成立）。裁决见 §3.7。

### F-H UI 变更直接制造 parser-invalid 文档（母体 §20）——已实测

```
P7 parse after UI-style delete = canvas doc: node "n2" depends on unknown key "n1"
```

Panels.tsx 删除节点只 `nodes.filter(...)`（不清 dependsOn、不清 group.members）；删除分组不清成员的 `g` 引用。Web 的自由变更面与 kernel 解析不变量脱节。（本会话只做被 schema 迫使的最小修复；中心化 mutation 助手＝D6/第二会话。）

### F-I Web restore 形状守卫有盲区——已实测

```
P10 shapeError(members ghost) = null
P10 kernel parse = canvas doc: group "G1" references unknown member "ghost"
```

`web/src/canvasIntegrity.ts` 不查 members 引用完整性、不查 identity——localStorage 恢复接受 kernel 会拒绝的文档，到提交时才炸。v3 升级时守卫需与 kernel 同步扩面。

### F-J 提案空 goal 通过校验（母体 §36）——已实测，登记为第二会话

```
P9b validate(goal='', 1 task) = []
P9b specs = [{"task_id":"task-1",...}]
```

`validateProjectProposal({goal:"", tasks:[T1]})` 干净通过，而 canonical ProjectIR 要求非空 goal——validate clean ⇒ 声明合同必成的硬不变量在 goal 维度不成立。**修复（EMPTY_GOAL）＋PROP-DECL-A01 留给第二会话**（与 D6–D10 同批），本会话不实现（母体 §50 边界）。

### F-K `unloadToCanvasDoc` 丢弃 groups/positions——登记为 G9-C 范围（母体 §41）

`lift.ts:90`：`groups: []` 恒定、positions 靠可选参数。本轮**不修**（表现保全是 G9-C）；但本轮给 unload 增加 identity 保留参数（身份完整性属本轮范围），表现元数据问题原样留给 G9-C。

## 3. 设计裁决（D1，本轮冻结）

### 3.1 Identity Lifecycle（母体 §5）

```
CREATE            → 分配新身份（allocator，见 3.4）
RENAME / PAYLOAD EDIT / MOVE SCOPE / CHANGE PRESENTATION
                  → 身份不变
COPY / DUPLICATE  → 新身份（copy ≠ rename ≠ move；copy = 新逻辑定义）
DELETE            → 身份退役（tombstoned by counter 单调性）
NORMAL FUTURE CREATE → 永不复用已退役身份
```

边同构：`CREATE → fresh id`；kind 可变（IR 语义内）→ 同 id；`DELETE → retired`；**端点属于逻辑边身份**——reconnect（拖 endpoint 改接）＝删旧边＋fresh 新边（母体 §11），不得保留旧 id。UI reconnect 操作面在 D6；本轮先冻结语义并由 EDGE-LIFE 测试钉住分配器纪律。

### 3.2 kind change 裁决＝**方案 B**（母体 §7.1）

kind 是定义类型，不是可变属性：改 kind ＝ 删除旧节点 ＋ 新身份建新节点。25/31 号"换 kind 用 remove + add（同 id）"的暗示随本裁决作废，两份规格的修订流水行在本轮登记新配方"remove old + add NEW identity"。

### 3.3 remove+add same id 的正式裁决（母体 §6/§7）＝拒绝

同一 patch 内 `removeNodes[n17] + addNodes[id:n17]`（边同理）→ **`IDENTITY_REUSE`** 诊断、拒绝。硬原则：`addNodes cannot resurrect an identity removed in the same patch`。未来若需 restore/revival，必须是独立的 `restoreNode` 操作（带显式历史语义），本轮不做。

### 3.4 单调分配器（母体 §13/§14/§16）

CanvasDoc v3 内置 identity 状态：

```ts
interface CanvasIdentityState {
  namespace: string;   // /^[A-Za-z0-9][A-Za-z0-9_-]*$/（不含冒号，family 正则无歧义）
  nextNode: number;    // ≥1，只增不减
  nextEdge: number;    // ≥1，只增不减
}
```

- 新节点 `n:<namespace>:<counter>`，新边 `e:<namespace>:<counter>`；计数器跨删除单调。
- **namespace 裁决＝方案 A（random once）+ 单调计数器**（母体 §14）：web 创建/升级草稿时一次生成（`crypto.randomUUID()` 去连字符取 12 位十六进制），此后确定性递增。理由：Canvas 是 client draft（红线），两台客户端独立新建草稿不必同 id；真正要求确定性的是"同一 CanvasDoc + 同一 identity 状态输入 ⇒ 同一 kernel 输出"，该性质在 namespace 显式入参下成立（测试传固定 namespace）。
- **v3 新 id 家族与 legacy `nK` 键空间天然不相交**（母体 §16）——转换后新分配永不碰撞 legacy key。
- 分配器带碰撞循环（`while (存在同 id) counter++`）：counter 单调性保证本 draft 自己分配过的 id 永不复现（退役 id 的 counter 早已越过）；碰撞循环兜底外部注入的同族 id。
- kernel 侧 `unloadToCanvasDoc`（AgentGraph→doc）无历史可考：默认 identity＝`{namespace:"sys", counters: family 扫描下界}`；serve patch 路径**透传提交草稿的 identity**（counters 取 max(透传值, family 扫描)），保证 patch 往返不重置计数器。
- IR 内嵌的 patch 通道 `patchFromFragment` 无 doc 语境，改用 `n:sys:<k>` 家族 + 现有扫描；其"跨历史 sys 族复用"限制与 AI 任意 id 同条登记（3.6）。

### 3.5 CanvasDoc v3 schema（母体 §8/§9）＝ONE EDGE TRUTH

```ts
interface CanvasDocV3 {
  version: 3;
  goal: string;
  identity: CanvasIdentityState;
  nodes: CanvasNode[];      // CanvasNode 不再有 g；CanvasTaskPayload 不再有 dependsOn
  edges: CanvasEdge[];      // { id, source, target, kind: "data" } —— 本轮唯一合法 kind
  groups: CanvasGroup[];    // 形状不变（id/label/g〔嵌套〕/members）
}
```

- **边唯一真相＝`doc.edges[]`**；`task.dependsOn` 从 payload 与语法中删除（解析拒绝该字段）。`dependsOn` 继续存在于 ProjectProposal/TaskSpec（编译输出词汇，母体 §9.1）。
- `node.g` 退役（3.7）；`group.g`（分组嵌套）保留，语义不同名同字，修订流水登记。
- 语法边界：kind 仅 `"data"`（message/control 等仍只在 IR 合法、capability 门拒）；self-loop 边解析拒绝（与 IR 同纪律）；边端点必须存在、target 必须 task（承 v2 INV-D1/D2）；平行 (source,target,kind) 相同的 data 边**解析通过**（multigraph 结构合法）但被 capability 门拒绝（3.6）。
- 解析为 fail-closed：未知字段/形状/引用错误全响亮拒绝；v2 文档不再被 `parseCanvasDoc` 接受（单格式纪律，错误信息指向显式转换器）。

### 3.6 平行 data 边裁决（母体 §12）＝capability 门 `UNSUPPORTED_PARALLEL_DATA_EDGE`

在 `agentGraphCapabilities`（IR 层 capability 门）加法式新增：同一 (source,target) 的重复 data 边 → 拒绝（与 UNSUPPORTED_RUNTIME_CYCLE 同层——画出≠能编译）。IR 保持 multigraph；不静默 collapse（编译器现状会产出重复 dependsOn title，被 TaskSpec 合同晚炸——F-P5）。该诊断同服务 patch 应用后的 compileError 面。

### 3.7 Visual Group 双真相裁决（母体 §38/§39）＝`group.members` 唯一真相

`node.g` 退役：v3 解析将 `node.g` 视为未知字段（响亮拒绝）；显式转换器把 `node.g` 折叠进对应 group 的 `members`（并集）。理由（§39 优先案）：first-party UI 全部经 members 操作、group 是显式容器、`node.g` 零读者（F-G）。分组嵌套 `group.g` 不动。表现层（框边界、G9-C 的位置保全）不受影响。

### 3.8 v2→v3 显式转换器（母体 §15/§16/§17）

- `parseCanvasDoc()` **只接受 version 3**；`upgradeCanvasV2ToV3(value, namespace)` 是唯一 v2 入口（localStorage 恢复 / JSON 导入 / 显式迁移动作），语义：`v2 input → strict v2 validation（内部私有 v2 严格校验，fail-closed）→ v3 → parseCanvasDocV3`。不是 dual parser、不是透明 shim；web 必须向用户明示"画布草稿已从 v2 升级到 v3"。
- **红线**：转换保留全部已有 node key（n1/n2/n17 原样），否则已声明 ProjectIR.definition_id 与 Canvas lineage 断裂（V3-MIG-A01）。
- 转换规则（冻结）：payload `dependsOn[]` 按"节点声明序×依赖序"展平为 `doc.edges[]`（id=`e:<ns>:<k>` 确定性、k 从 1 起）；`nextEdge=k_max+1`；`nextNode=family 扫描下界`（legacy `nK` 不入族，故为 1，新分配从 `n:<ns>:1` 起）；`node.g` 折叠进 members；goal/nodes 顺序/groups 原样。

### 3.9 GraphPatch AI id 与 tombstone 裁决（母体 §24/§25）＝轻方案 + 限制显式登记

- Palimpsest 生成的身份（allocator 家族）**永不全等复用**（计数器单调）。
- 同 patch remove+add 同 id 拒绝（3.3）。
- AI/用户可继续提供任意 fresh id（addNodes.id 必填不变）；**跨历史草稿的任意外部 id 复用当前不可证明**（无持久 tombstone registry）——登记为已知限制，不为它加服务端 Canvas ledger（Canvas 仍是 client draft，红线）。未来 Definition Graph canonical 化后再引入 global tombstone registry。

### 3.10 B3 bridge hotfix 退役（母体 §18/§46）＝强不变量恢复

v3 稳定边 id 后恢复：

$$
liftToAgentGraph(unloadToCanvasDoc(g)) = g
$$

严格包含 node ids、edge ids、node order、edge order、语义载荷。serve patch 端点恢复 `graphDigest = agentGraphSemanticDigest(patched)`（B3 的 relift 摘要代码删除，不叠第二个 workaround）；PATCH-FRESH-A04/A05（`response.graphDigest === digest(lift(response.doc))`）保留为 belt 断言——两端从"必须靠 relift 才相等"变为"恒等"。`canvasRoundTripDiff` 的边比较升级为有序 (id, source, target, kind) 全等（31 号的"边 id 再生＝登记差异"措辞随之作废）。

### 3.11 layout / fragment / editor 的边真相切换

`canvasLayout` 的 depsOf、`CanvasView` 的依赖边渲染、`CanvasEditor` 的依赖 chips 全部改读 `doc.edges`；`canvasInsertFragment` 走 3.4 分配器 + 边生成；`proposalFragment`（非插入式碎片构建器，src 内零调用者）**退役删除**——插入唯一路径是 `canvasInsertFragment`（结构直接简洁，无双构建器）。

## 4. 本会话范围与退出门

会话 1（D0–D5，母体 §50）＋两项被 schema 迫使的最小伴随：

1. serve patch 端点 digest 复原（3.10——B3 workaround 删除是 §46 明文红线，不是可选项）；
2. Web 最小 v3 适配（类型镜像、恢复/导入走显式转换、genKey→分配器镜像、连线/删除变更面 v3 化）——否则 web 仍产 v2 文档，所有提交被解析拒绝；中心化 mutation 助手与 UI 重构仍留 D6。

退出门（母体 §51）：

- [ ] Node identity 不会自动复用（ID-LIFE-A01/A02/A05）
- [ ] Edge identity 在 Canvas 往返中逐字存续（EDGE-H01/H02/H03）
- [ ] CanvasDoc v3 恰好一个语义边真相（EDGE-INV-1，payload dependsOn 解析拒绝）
- [ ] v2 迁移保留既有 definition 身份（V3-MIG-A01/A02）
- [ ] GraphPatch same-id resurrection 有机器强制裁决（IDENTITY_REUSE，推荐拒绝已采纳）

## 5. 第二会话预留（D6–D10 + 母体 §36/§38 收尾）

- D6 中心化 kernel mutation 助手（canvasAddNode/canvasRemoveNode/…，MUT-INV-1，CANVAS-MUT-A01..A03，reconnect 操作面）
- D7 identity-aware diff（definitionId 优先、title fallback、DIFF-ID-A01..A03、changed fields + title）
- D8 compile 独立 anchor（`/api/canvas/anchor`，ANCHOR-A01..A04，Full/Partial/Unanchored UI 三态——28/29/30/31 号裁决）
- D9 Web 全面接线 + 版本明示；D10 全回归 + 浏览器冒烟 + `G9-D-DELIVERY-REPORT.md`（母体 §54 十五问）
- PROP-DECL-A01（EMPTY_GOAL）+ `node.g`/`members` 审计结论落规格（母体 §36/§38）
- 规格编号按母体 §42 重排：32=G9-D（PLMP-CANVAS-7）、33=G9-C（PLMP-CANVAS-8）、34=E、35=F、36=G

## 6. 红线复核（母体 §46/§47）

| 红线 | 本轮影响 |
|---|---|
| validate PASS ⇒ apply 结构成功 | 保持（computePatchedGraph 单构造不动） |
| accepted 非空 patch ⇒ digest 必变 | 保持（digest belt 不动；IDENTITY_REUSE 在 belt 之前显式拒绝） |
| UNREPRESENTABLE_IN_CANVAS 仍拒不支持 IR | 保持（非 data 边仍拒；losses 门不动） |
| STALE_BASE＝project revision、STALE_GRAPH_BASE＝草稿语义 | 语义不变；v3 后 digest(lift(unload(g)))==digest(g)，锚语义更强 |
| definition_id ≠ task_id | 不触碰 |
| worker report ≠ evidence / LLM 意见 ≠ canonical 状态 | 不触碰 |
| Canvas 仍是 client draft（无服务端 draft 状态、无 canvas_versions/draft 事件） | identity 状态在 doc 内，随草稿走；无服务端化 |
| replay fixtures/digest 字节恒等 | 事件层零触碰；投影表零触碰 |
| 缺省并发＝1 | 不触碰 |

（机器证据：P1–P10 上文逐字；scratch probe 文件取证后已删除，不入库。）
