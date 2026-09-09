# G9-D 会话 2（D6–D10）交付报告

- 日期：2026-09-08
- 规格：32 号《CanvasDoc v3 / 稳定图身份生命周期》（PLMP-CANVAS-7）会话 2，**规格就此完成（G9-D COMPLETE）**
- 代码基线：指令所载 `main`＝`0abdc2c`（UAS rebase）之上实现；本报告对应实现提交（会话 2 全量）
- 测试基线：**58 文件 / 384 用例全绿**（58/370 → +14）；kernel `tsc` 干净；web `tsc` 干净、`vite build` 绿；浏览器冒烟 6/6
- 红线：UAS-D-INV-1..6（指令 §3/§30）全程遵守；零新增 UAS schema（§27）；零 AgentGraph→WorkGraph 改名（§28）

## 十六问（指令 §33 逐条）

**1. 现在的第一方 Canvas mutation 唯一真相是什么？**
`src/canvas/mutate.ts`（kernel 权威）＋ `web/src/canvasMutate.ts`（独立构建链的窄镜像，同一算法）。九个助手：`canvasAddNode / canvasRemoveNode / canvasDuplicateNode / canvasAddEdge / canvasRemoveEdge / canvasReconnectEdge / canvasMoveNodeScope / canvasAddGroup / canvasRemoveGroup`。每个助手要么返回合法 CanvasDoc 要么响亮失败（`fail`）；Panels/App 的全部结构变更零内联完整性逻辑（tripwire：WEB-V3-A01 钉 9 个镜像导出存在、禁内联 delete filter、App 连线/归入走镜像）。MUT-INV-1（parse(before) PASS ⇒ parse(变更) PASS）由 CANVAS-MUT-A01..A06 逐助手钉住。

**2. Work 节点被删除时发生什么？**
原子清除三件事：节点本身、全部 incident edges、全部 VisualGroup membership 引用（`groups[].members` 过滤）——无悬挂语义引用。子图成员向上提升一层到被删 scope 的 parent（§6），嵌套后代随各自直接存活父级原样保留，存活身份一律不变；不做静默广谱子树删除。

**3. subflow 被删除时发生什么？**
指令 §6 冻结配方逐字落地：直接子级 → 被删 scope 的 parent；嵌套结构（如 G1 下的 G2→B）保持挂在各自直接父级；只删除端点本身被删的边。CANVAS-MUT-A03 钉住"提升一层、不整体 flatten、id 不变"。

**4. 边被重连时发生什么？**
EDGE-INV-3：删旧边＋fresh id 新边（`e7: A→B` 重连到 C ⇒ e7 退役、新边 `e:…:k: A→C`），绝不原地改接保留 id。这由第一方 mutation API `canvasReconnectEdge` 强制（非约定），且同端点 no-op 重连显式拒绝（"changes nothing"）。UI 无拖拽改接手势——UI 操作面＝删边＋重连（fresh id 语义等价），kernel 层完整（CANVAS-MUT-A05）。

**5. 已删节点/边身份会被自动复用吗？**
不会。GRAPH-ID-INV-1/2：单调分配器（`n:<ns>:<k>`/`e:<ns>:<k>`，计数器只增不减＋碰撞兜底）保证本 draft 自己分配过的 id 永不复现；删除即退役。浏览器冒烟 A（节点 `n:…:1` 删后再建得 `n:…:2`）与 B（边 `e:…:1` 删后重连得 `e:…:2`）实证。

**6. D7 之后 draft/live 如何匹配？**
DIFF-INV-1：definitionId > title。live 侧任一任务带 definitionId ⇒ 进 identity 模式：draft 任务带 id 就按 id 匹配（id 未命中即 add，绝不 title 冒认）；draft 任务无 id（手写草稿）才允许 title fallback，且只匹配未被 id 认领的 live 任务（`Set<LiveTaskView>` 会计，混合模式不串认领）。live 完全无 id（spec-first 项目）⇒ 纯文档化 title fallback。removed＝未被认领的 live 任务。

**7. 改名在 diff 里如何呈现？**
changed(title)，绝非 remove+add（DIFF-ID-A01＋浏览器冒烟 C：UI 声明后实时任务 definitionId＝画布 key，改名 调研→调研（改） 对照实时只出 `± 调研（改）（title）`；改名前＝"与实时图一致"）。反向同样成立：同题不同 id＝remove+add（DIFF-ID-A02）。

**8. 运行期非法环还能拿到 FULL Work 新鲜度锚吗？**
能。ANCHOR-INV-1/2：anchor 端点只做 parse→lift→语义 digest→live revision，路径里不存在 compile/capability 调用。ANCHOR-A01（环图 parse PASS＋anchor PASS＋compile 400）＋浏览器冒烟 E（UI 连出 调研→综合→环C→调研：画布合法、校验提案显示 `UNSUPPORTED_RUNTIME_CYCLE`、同草稿页面 fetch `/api/canvas/anchor` → 200 `{baseGraphDigest:"fa803edf…", baseRevision:1}`）双实证。

**9. `/api/canvas/anchor` 无副作用吗？**
是。ANCHOR-A05：事件计数不变、canonical Project 状态不变；未鉴权 401（与其他 canvas 面同门禁）。baseRevision/baseGraphDigest 取自**同一次服务端观察**（一次 parse+lift 后同时取两值，无"一个来自陈旧 UI 态、一个来自稍后端点"的窗口）。

**10. `goal=""` 是真实声明闭合缺陷吗？**
是，且比指令表述更重：PROP-DECL-A01 复现链＝`buildProjectIr` 接受空 goal ⇒ 事件照常入账 ⇒ canonical replay `parseProjectIr` 抛 "goal: must not be empty" ⇒ **账本出现永远无法 replay 的事件（毒化）**。修复收敛在唯一校验器：`validateProjectProposal` +`EMPTY_GOAL`；build 侧保持宽松，无第二声明解析器（firstPartyValidationClean ⇒ canonicalDeclarationContractConstructible）。

**11. 哪些真实浏览器场景通过？**
6/6（真实 serve＋真实浏览器 UI 驱动，身份证据逐条读 `localStorage['palimpsest-canvas-project']`）：
- **A 节点身份退役** ✅（`n:…:1` 删→`n:…:2`，不复用）
- **B 边生命周期** ✅（`e:…:1` 删→重连 `e:…:2`；UI 无拖拽改接手势，remove+reconnect 即 UI 面，登记 Q15）
- **C 改名身份** ✅（UI 校验提案→确认声明＝事件 `PROJECT_REVISED`，实时获 definitionId；改名后 `± title` 非 remove+add）
- **D 删除完整性** ✅（带边且入子图的任务删除：边清、子图原样、画布可解析；空子图再删干净退役）
- **E 运行期非法 authoring 图** ✅（环＋`UNSUPPORTED_RUNTIME_CYCLE` 可见＋FULL 锚可得）
- **F 锚定补丁链** ✅（anchor(D1)→P1 应用→D2（计数器 floor 推进）；**同 P1 重放被拒**：`STALE_GRAPH_BASE` 锚 `b03e7c5e…` vs 现草稿 `40ae366d…` ＋ `DUPLICATE_NODE_ID`；anchor(D2)→P2 新锚应用→D3 四节点）

**12. 最终测试/类型检查/构建计数？**
kernel `tsc --noEmit` 干净；**vitest 58 文件 / 384 用例全绿**（基线 58/370 → +14：CANVAS-MUT-A01..A06、DIFF-ID-A01..A06、ANCHOR-A01..A05、PROP-DECL-A01）；web `tsc` 干净；`vite build` 绿（422.21 kB JS）；浏览器冒烟 6/6。无既有用例放宽或删除（WEB-FRESH-A02/WEB-V3-A01 为原地强化）。

**13. CanvasDoc v3 现在被明确文档化为 Work 手搓文档了吗？**
是（指令 §24 两条澄清已写入 32 号 §5，纯术语、零改名零 schema）："**CanvasDoc v3 是当前 Work 手搓文档（current Work-authoring document）**——只含 task/subflow/annotation/data 边"；"**现行 definition_id 是 legacy 图节点所代表的当前 task/work 定义的稳定标识**"。并逐条钉死"不向 agent instructions/models/message edges/handoff edges/Organization/Holon/Channel/StateDefinition 演进"（UAS-D-INV-2）。

**14. 现行 definition_id 与未来 AgentDefinition 身份明确区分了吗？**
是（UAS-D-INV-1）：现行 `canvas node key → IR node id → TaskProposal.definitionId → TaskSpec.definition_id` 链继续只表示当前 Work/Task 定义身份；未来真 AgentDefinitionId 在 G10 获**全新独立身份命名空间/lineage**，不是对本字段的改名或加宽。G10-A0 预检注（`G10-G11-ROADMAP.md`）已把该裁决列为必审项。

**15. 哪些问题推迟给 G10-A0？**
`G10-G11-ROADMAP.md` 的 **G10-A0 — Semantic Entity / Identity / Binding Audit**（纯文档预检闸）登记了全部推迟项：SystemGraph≠WorkGraph、CanvasDoc v3＝Work canvas（确认）、definition_id＝Work 身份（确认）、未来 AgentDefinitionId＝全新身份、ArchitectureDefinition 与 WorkDefinition 作为独立规范实体、BindingDefinition/RunDefinition 所有权、TaskGraphWork ⊂ WorkDefinition、Attempt vs Activation、Invocation/Participation、RuntimeScope→OrchestrationPolicyInstance、ExecutionPlan＝派生编译目标；以及六个开放问题（§26）：A Canvas 拆分、B 类型化 patch 目标、C Invocation 相交、D 动态 agent 生成晋升通道、E capability 词汇三分、F 工具/模型需求与提供方经 Binding 分离。正式 `AgentGraph→WorkGraph` 改名策略同留 A0。

**16. 确切的下一个实现批次是什么？**
**G9-C（33 号，PLMP-CANVAS-8，Canvas 语义保全/表现保真）**。其后机械顺序：G9-F（35 号）→ G9-G（36 号 Playwright E2E）→ **G10-A0（纯文档预检）→ G10-A（34 号）**。本报告即停针（§34：G9-D 干净闭合即停，不以可见进展奖励自己提前开 G10）。

## 语义解释纠正（指令 §24，本轮落进文档的部分）

- 32 号 §5 新增 UAS-D-INV-1..6 全六条（此前只登记 1..3）：4＝diff 是 Work 定义 diff；5＝Attempt 语义原样未动（Activation/Invocation 留 A0）；6＝role/scopeId/definitionId/dependsOn 不被偷用作未来 Binding 语义。
- §12 字段覆盖澄清：changedFields 现覆盖 title/dependsOn/writePaths/requiredArtifacts/role/scope/**suggestedSkills**（本轮把 `suggested_skills` 加法式补进 GraphTask 投影与 serve diff 映射——它是 TaskSpec 既有字段，属"当前可代表"）；**gate 不可 diff**——20 号裁决 proposal gateId 仅建议（走 declareGate 单声明路径、永不进 TaskSpec），故无 live 字段可比，DIFF-ID-A06 钉死该边界，未发明新 schema。

## 已知限制（Q15/Q16 之外的登记）

- UI 无拖拽改接手势（Q4）；直接手势留给 G9-G 评估，kernel 语义已完整。
- serve 空库（未声明项目）时 `/api/health` 因 orchestrationGraph() 抛错返回 400，UI 令牌门进不去（冒烟以 curl 引导项目绕过）——空态 UX 缺口留给 G9-F/serve 打磨。
- 32 号 §2.7 既有登记不变：跨历史草稿的任意外部 id 复用无持久 tombstone registry。

## 退出条件核验（指令 §29–§32）

| 条件 | 状态 |
|---|---|
| D6 mutation 层＋MUT-INV-1＋CANVAS-MUT-A01..A05（含 A06 循环归入） | ✅ |
| D7 identity-aware diff＋DIFF-ID-A01..A05＋§12 字段覆盖 | ✅（A06 为字段覆盖补充） |
| D8 anchor＋单次观察＋永不编译＋ANCHOR-A01..A05 | ✅ |
| D9 web 镜像委托＋三态锚状态（FULL/PARTIAL/UNANCHORED）＋tripwire | ✅ |
| D10 EMPTY_GOAL 复现在前＋修复＋冒烟 6 场景 | ✅ |
| 回归门（kernel/web tsc＋全量 vitest＋web build＋浏览器冒烟） | ✅ 58/384 |
| 交付文档（32 号更新＋本报告＋权威 roadmap 推进＋G10-A0 预检注） | ✅ |
| v2 拒绝/显式 converter/节点 key 逐字保留（§20） | ✅（会话 1 交付，本轮未动） |
| VisualGroup 纪律：members 为唯一归属真相、node.g 退役（§21） | ✅（删除清 membership：CANVAS-MUT-A02） |
