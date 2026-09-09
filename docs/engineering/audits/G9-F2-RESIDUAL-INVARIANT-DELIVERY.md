# G9-F2 交付报告 — Residual Contract / View Invariant Closure（PLMP-PARSE-1 Closure Addendum）

- 日期：2026-09-10
- 母体审计：`G9-F2-RESIDUAL-INVARIANT-ASSESSMENT.md`（8/8 机器探针先行，scratch 复现后删除）
- 规格：`35-contract-discipline-view-freshness-spec.md` §1A + §2.1/2.2/2.3 + 不变量表 + 修订行（**未**新分配规格号；36 号留给 G9-G）
- 基线：7d130aa，58 文件 / 409 测试全绿 → 终态 **59 / 431 全绿**

## 二十问（§41）

**1. 调用方变更能否在 ViewCursor 不变时改动图状态？**
修复前**能**（探针 RES-A：claim 后改 `attribution.model`，viewCursor 字节相同而图从 model-A 变 model-B——VIEW-INV-2 被击穿）；修复后**不能**（VIEW-RES-A01/A02 钉死）。

**2. attribution 现在如何持有/校验？**
新增导出 `parseAttemptAttribution`（`src/tools/controller.ts`）：model 必填非空串、cost 可选有限数 ≥0、taskType 可选非空串、未知键拒。`claim()` **入口先校验后副作用**——畸形 claim 在 worktree/事件任何副作用前整体失败（attempt 保持 CREATED、游标不动）；存入 `#attemptAttribution` 的是 controller 独占的**新鲜普通对象**，永不保留调用方引用。三条入口（HTTP surface、command executor、pump）全部汇于 `controller.claim`，单一收口。公共语义仍恰为三字段，未加宽。

**3. ViewCursor 重启/epoch 最终设计选了什么？**
**Option A**：完整 128 位 `randomUUID()`（去掉 `.slice(0,8)`），令牌格式不变（`v1:<epoch>:<eventCursor>:<viewGeneration>`）。Option B（易变态摘要）被拒：诚实的易变态摘要要么引入逐字段哈希新机器，要么滑向全图哈希（§9 明令禁止）——最小正确设计优先。

**4. 文档现在对 epoch 唯一性作何承诺？**
"意外跨进程等价在**密码学上可忽略**（cryptographically negligible），**非**数学不可能"——spec 35 §2.1 已按此改写；对照检查 spec 32 无该措辞（无需动）。代码注释同步（controller `#viewEpoch`、graph_identity WEB-H01-E 尾注）。

**5. 同时提供 viewCursor 与 legacy cursor 时发生什么？**
**viewCursor 裁决支配（VIEW-INV-6）**：命中 ⇒ `{changed:false}` 不建图；未命中 ⇒ 全图＋`changed:true`＋新 viewCursor。legacy 数字 cursor 在带 viewCursor 的请求里**无法**再否决该裁决。

**6. 因 viewCursor 失效而返回新图时，changed 会是 false 吗？**
**不会**。VIEW-RES-C01 钉死：事件游标未变＋易变态已变 ⇒ 混合请求必须 `changed:true`＋图＋新 viewCursor；新鲜 viewCursor 的快路径照常跳过建图（不受影响）。

**7. `/api/health.projectInitialized` 按项目隔离了吗？**
**是**（HEALTH-INV-2）：`scheduler_control` 查询加 `WHERE project_id=?`；同库 B 项目控制器在 A 已初始化时仍如实报 `false`（HEALTH-RES-A01..A03，含 HTTP 面）。同类洞：`/api/proposal/declare` 的 started 判定同口径收口（否则 A 的控制行会把 B 的声明路由进 plan 而非 start）。

**8. 哪些 GateClause 嵌套 typo 用例当时仍宽松？**
`exists` 内层**任意**未知兄弟键被静默忽略（指令原文 `exists.wheer` 实锤）；`count` 在 gte 存在时忽略未知兄弟键（`{predicate, gte:1, gt:2}` 静默接受）。指令字面 `count.gt` 替换 gte 的写法当时"碰巧"失败——只因必需的 gte 缺失，属运气非策略。

**9. exists/count 内层现已闭合而 where 保持开放？**
**是**（PARSE-INV-4）：exists 闭包 `{predicate, where?}`、count 闭包 `{predicate, where?, gte}`、`not` 递归经同一 `parseClause`；`where` **内容**任意键仍合法（PARSE-RES-A01..A05，PARSE-INV-3 不回退）。

**10. authoring 与 canonical GateDefinition 的确切形状？**
Authoring 面：`{gate_id, version, subject_type, require: {all:[…]} | {any:[…]}}`（人/AI 书写）。Canonical 面：`{gate_id, version, subject_type, require: {mode:"all"|"any", chain:[…]}}`（`GateDefinition` 类型、事件日志、`gate_registry.definition_json`、`GateEngine.evaluate` 实际载体）。CLI 在书写边界即转换（`declareGate(parseGateDefinition(raw))`），日志持久层只见 canonical。

**11. 两面现已显式分开？**
**是**（§22）：`parseGateDefinition`＝authoring 面唯一语法属主（拒 mode/chain）；新 `parseCanonicalGateDefinition`＝durable 面唯一属主（拒 all/any）；显式转换＝authoring parser 输出幂等通过 canonical parser；`declareGate` 现要求 canonical 面（authoring 面在 durable 接缝被拒——DURABLE-PARSE-A05）。

**12. 畸形 GATE_DEFINED 能进账本吗？**
**不能**。`normalizeEventPayload` 的 GATE_DEFINED case 跑 `parseCanonicalGateDefinition`（完整子句语法），位于 `EventStore.append` 的 BEGIN IMMEDIATE 事务内——DURABLE-PARSE-A01/A05：拒绝、事件数不变、投影快照不变、gate_registry 零残行，且接缝不被楔死（随后事件照常追加）。

**13. 畸形 STAGE_GRAPH_DEFINED 能进账本吗？**
**不能**。同一接缝跑 `parseStageGraphDefinition`（闭 when 注册表/状态-事件一致/守卫键全量）；直接 `store.append` 探针（transition to:"DONE"）在提交前被拒（DURABLE-PARSE-A02）。修复前该声明能进账本且 replay 通过、scheduler 首次读取该投影时才崩（EMPTY_GOAL 同类）。

**14. 完整持久声明校验在哪执行？**
`src/schema/models.ts` 的 `normalizeEventPayload`（共享 durable 接缝）：**所有** append 路径（controller.declareGate/declareStageGraph、直接 store.append）与**所有** replay 重读（rowToEvent → parseSchedulerEvent → parseNewEvent）都过它；`verifyFull()` 的 clean-replay 对账叠加保证。EventStore 保持有意义的 canonical seam。

**15. tie 与 replayable 现在是严格布尔吗？**
**是**（WIRE-INV-4）：`field(x, …, expectBool)`——缺失/`"true"`/`1`/`{}`/`null` 全拒（CANON-RES-A01..A04）；真实生产方（tournament `decision === "tie"`、`declared.kind === "rubric"`）产真布尔，CANON-RES-A05 赛事全链回环（canonical 读者 digest 失闭重算）字节稳定。

**16. 历史 replay/digest fixture 是否保持全绿？**
**是**：parity fixture（baseline-v1.json 逐字节 digest parity）、state.replay、scheduler.replay、ordarium ledger conformance 全绿。根因：STAGE_GRAPH_DEFINED 的 parse 幂等于自身输出、fixture 的 genesis guards 为空；fixture 无 GATE_DEFINED/CANDIDATE_SELECTED 事件。既有测试无一弱化或删除（+22 全为新增）。

**17. 其他定向嵌套归一缺陷浮出了吗？**
**没有**（§28 定向扫，非全库重写）：`projector.ts:627` 的 `=== true` 读的是已过严格解析的载荷（冗余但无害）；`evidence/graph.ts:148` 与 `context/manifest.ts:111` 的 `?? false` 是内部可选派生（claim 图节点标志、semantic 可选覆盖项），皆非作者书写合同解析。仅 A3 与 G 两处真实缺陷，均已修。

**18. 最终测试/构建计数？**
**59 文件 / 431 测试全绿**（基线 58/409 → +22：VIEW-RES×5＋HEALTH-RES×1（A01..A03 合一）＋PARSE-RES×6（A01..A05＋faces）＋DURABLE-PARSE×5＋CANON-RES×4＋CANON-RES-A05×1）；kernel tsc、web tsc、vite build 全绿；dist 重建后浏览器冒烟过。

**19. G9-G 还剩什么？**
全部：Playwright E2E 套件（规格 36）把累积冒烟转成持久覆盖。F2 补记进 G9-G 计划：混合游标裁决、畸形 claim 400、项目隔离健康已由 F2 内核电池钉死——E2E 只测用户可见行为，不重复低层不变量（指令 §40）。本批浏览器冒烟 A（轮询稳定）/B（暂停恢复失效）/D（面板无行为变化）过，C 由 HEALTH-RES-A02 的 HTTP 面覆盖。

**20. 开工了任何 G10 语义工作吗？**
**没有**。零 ArchitectureDefinition/AgentDefinition/SystemGraph/Binding 等；未分配规格 36；G9-G 未开工；roadmap 活跃序列已指向 G9-G（F2 ✅）。

## 退出条件对账（§42）

| 条件 | 状态 |
|---|---|
| 调用方 mutation 不能在未变 ViewCursor 后改图 | ✅ VIEW-RES-A01/A02 |
| 图可见 attribution ＝ 内部持有已校验快照 | ✅ VIEW-RES-A03 |
| 重启令牌语义诚实且足够强 | ✅ 128 位 nonce＋§29 措辞 |
| 混合游标不能"新图＋changed:false" | ✅ VIEW-RES-C01 |
| projectInitialized 按项目隔离 | ✅ HEALTH-RES-A01..A03 |
| exists/count 嵌套信封拒 typo；where 保持开放 | ✅ PARSE-RES-A01..A05 |
| 持久 Gate/Stage 声明提交前全语法校验 | ✅ DURABLE-PARSE-A01..A05 |
| authoring/canonical 面不混淆 | ✅ 两 parser 显式分立 |
| 被拒声明零事件/投影残写 | ✅ DURABLE-PARSE-A05 |
| CANDIDATE_SELECTED 必填布尔拒缺失/错型 | ✅ CANON-RES-A01..A04 |
| G9-F 快路径仍安全跳过建图 | ✅ WEB-H01-A..E 保持全绿＋C01 尾段 |
| 历史 replay fixture 有效 | ✅ parity/replay 全绿 |
| 全量回归绿 | ✅ 59/431＋三门 |
| 活跃 roadmap 指向 G9-G | ✅ |
| 未开工 Playwright / G10 | ✅ |

## 保持不变（§32）

EventCursor ≠ ViewCursor；`graph.project.cursor` 数字语义；旧 `?cursor=` 兼容；viewCursor 未变快路径；显式开放映射三例外（where / EvidenceAtom.value / manifest.requirement）；逐合同 canonical allowlist；历史 fixture；无 ProjectIR 健康；PRES-BELT 节点序。G9-C 表现 reconcile 未触碰。
