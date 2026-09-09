# G9-F（Contract Discipline + View Freshness，PLMP-PARSE-1 / 规格 35）交付报告

- 日期：2026-09-10
- 代码基线：`main`＝`5646117`（G9-C COMPLETE）之上；母体审计＝`G9-F-CONTRACT-VIEW-FRESHNESS-ASSESSMENT.md`（机器探针先行）
- 测试基线：**58 文件 / 409 用例全绿**（G9-C 收口 58/398 → +11：SCHEMA-AUDIT 反转重写 +3、PARSE-H01+矩阵抽查 +5、PRES-BELT +2、WEB-H01/HEALTH +4、原有 398 项原样绿——gate_dsl/preset_library/schema_audit 的既有用例按冻结裁决更新，无放宽删除）；kernel/web `tsc` 干净、web build 绿；浏览器冒烟 A/B/D 过（C 说明见 Q19）

## 二十问（指令 §37 逐条）

**1. 哪些旧 G9-F 发现在本批之前已修复？**
PARSE-H02（Canvas task payload 静默丢未知字段）＝**ALREADY CLOSED**——G9-D 会话 1 的显式 allowlist 已使 CanvasDoc 未知键抛错（探针实证）。同族核验：AgentGraph 未知节点键也抛错。两者从活跃计划移除，只登记。

**2. 复现了哪些 StageGraph 未知键缺陷？**
三层＋守卫信封全部机器复现（scratch 8/8 探针，记录于审计 A.2）：PARSE-H01-A 根层 `"concurency":8` 被吞；B 阶段层同键被吞（归一输出缺 concurrency）；C 转换层多余键被吞；外加 gate 家族三处：`parseClause({exists…,not…})` 静默取 exists、`parseGateDefinition` 未知键忽略＋require all/any 同给静默取 all、preset 未知参数键静默忽略。修复后全部转为必须抛错的验收测试（test/schema_audit.test.ts）。

**3. 哪些作者书写解析器现在严格？**
CanvasDoc、AgentGraph、GraphPatch、ProjectProposal（本已严格）＋**本批新闭合**：`parseStageGraphDefinition`（根/阶段/转换三层 rejectUnknownFields）、`parseGateDefinition`（信封允许集＋require 恰好 all|any 之一）、`parseClause`（信封恰好 exists|count|not 之一）、`presetDraft`（未知参数键＝错误；goal/changeClass 为通用声明参数进允许集）。守卫子句内容仍唯一归 `parseClause`（PARSE-INV-2），`where` 内容保持开放（PARSE-INV-3）。

**4. 最终 canonical 契约严格性矩阵是什么？**
审计 B 节矩阵（18 行）落地为代码：每个 canonical parser（Requirement/Decision/TaskSpec/AllowedCommand/NetworkEndpoint/RuntimeMetadata/ProjectIr/TaskEnvelope/AttemptReport/EvidenceAtom）与每个 `normalizeEventPayload` case（36 事件族，`EVENT_PAYLOAD_FIELDS` 全枚举）显式声明 required∪optional∪open 并调用 `rejectUnknownFields`；事件信封双面孔（parseNewEvent "new" 面＝请求键集、parseSchedulerEvent 经 "committed" 面＝账本键集）。SDS-4 加法式可选（role/suggested_skills/scope_id/definition_id/context_manifest/semantic/project_revision 等）全部在允许集。

**5. 哪些契约有意保留开放映射？**
三处（全部显式登记并测试钉住）：`EvidenceAtom.value` 内容（谓词域数据）、gate 子句 `where` 映射、`CONTEXT_MANIFEST_ADDED.manifest.requirement`（host 编译输入，CTX-2 历史裁决）。信封级未知键照拒（`valu` 拼写＝错误的测试在册）。

**6. 历史兼容是否需要迁就？**
历史门工作了两次：①fixture 回放（state.replay）把**已提交事件**喂给 new 面孔——修正为显式 `"committed"` 面孔（调用点语义修正，非放宽）；②preset 测试传 `goal`——**A 类（缺已声明字段）**：goal/changeClass 是每个 preset 都读取的通用声明参数，加入允许集。`fixtures/replay/baseline-v1.json` 逐字节 digest parity 保持通过，全量 replay 幂等/重开保持通过——**零历史 fixture 需要改动**，未发现 B/C 类。

**7. models.ts 文档现在与实现一致吗？**
一致。头注释改述：必填严格＋逐合同显式未知键策略（封闭＝拒＝"parser 不理解该版本"；开放容器三例外写明；新字段走显式加法式可选）。

**8. 哪些源为 OrchestrationGraph 供数？**
审计 C.1 表（12 行）：ProjectIr、events（cursor＋timeline＋promotions 折叠）、tasks/attempts/evidence/context_manifests/role_tables/task_holds 投影、scheduler_control——全部 durable；**唯一非事件源＝`#attemptAttribution`（controller 进程易变态，渲染进 runtime attempts 的 model/cost）**。

**9. 哪些图可见状态不被事件游标覆盖？**
`#attemptAttribution`。两条无事件变更路径：①进程重启（Map 随进程死亡，事件游标不变）；②**`evaluateAttemptGate` 结算**——纯读证据视图判 PASS/FAIL 后删 attribution，零事件追加（审计 §C.2 代码路径核对）。

**10. EventCursor 现在定义为什么？**
canonical 追加日志位置——`graph.project.cursor` 字段与其数值语义**原样不动**（§21）。

**11. ViewCursor 现在定义为什么？**
不透明串 `v1:<epoch>:<eventCursor>:<viewGeneration>`＝完整用户可见编排投影未变的验证器（VIEW-INV-2）；客户端 opaque，人不读。

**12. ViewCursor 如何廉价生成？**
`MAX(event_id)`（一条索引查询）＋进程内存 viewGeneration＋epoch——**不建图、不摘要**（§23；VIEW-INV-4 由 WEB-H01-A 的建图计数器实证）。

**13. 重启如何处理？**
per-process 随机 epoch（randomUUID 8 位）：旧进程发出的 viewCursor 在新进程必然 epoch 失配 → 永不可能错误命中快路径（WEB-H01-E：同账本双进程实证）。

**14. 旧 `?cursor=` 还支持吗？**
支持，语义原样（数值事件位比较＋照常建图——保守、无不安全早退）。Web 面板已迁移到 viewCursor 协议（api.getGraph(viewCursor)、App 轮询 changed:false 跳过 setGraph；project 未初始化的轮询错误不再逐刻度刷屏）。

**15. 匹配的 ViewCursor 会跳过建图吗？**
会——WEB-H01-A：同 viewCursor 响应 `{changed:false, viewCursor}` 无 graph 键，`graphBuildCount()` 不增。

**16. 非事件图可见变更能失效 ViewCursor 吗？**
能且已测（WEB-H01-C）：claim 带 attribution → `evaluateAttemptGate` 判 PASS → attribution 从图上消失、`MAX(event_id)` 不变、viewCursor 因 generation 必变。反向 D 亦测：无 attribution 的同结算早退，viewCursor 不动（不无谓重绘）。

**17. `/api/health` 在项目初始化前可用吗？**
可用——WEB-HEALTH-A01：fresh store ⇒ 200 `{ok:true, projectInitialized:false, eventCursor:0}` 且建图计数不增；start 后 `projectInitialized:true`。浏览器 D 场景：空库下令牌门放行、UI 完整渲染不崩（面板全在，仅 "project does not exist" 轮询信息与 "—" 头）。

**18. G9-C 节点序腰带满足了吗？**
审计发现**违反**（`[...kept,...fresh]` 在交错序下输出序 ≠ semanticResult 序）→ 最小修复：按 semanticResult 序输出（位置仍按 before/避让，内部播种顺序不影响输出序）。两条腰带测试：交错 fresh id 序保持＋child-before-parent 声明序保持（结果可解析、落位无碰撞）。**未重开 G9-C**。

**19. 最终测试/构建/浏览器计数？**
**58 文件 / 409 用例全绿**（398 → +11）；kernel/web tsc 干净；vite build 绿（422.21 kB）；浏览器冒烟 §39：**A**（页面内同 viewCursor → changed:false 无图）✅、**B**（暂停事件 → 旧游标 changed:true，`v1:96b05a3c:4:0`→`v1:96b05a3c:5:0`，resume 后 UI 自行追平）✅、**D**（空库 serve：health 200＋UI 完整渲染）✅；**C**（无事件易变失效）无 worker 端点不可从浏览器触达——由 WEB-H01-C 的控制器/serve 级测试覆盖（该测试同时断言事件游标不变），如实登记。

**20. G9-G 还剩什么？**
把累积的真实浏览器冒烟场景（G9-B2 补丁链、G9-D 六场景、G9-C 十二步、G9-F 轮询/空态）转成**持久的 Playwright E2E 套件**（规格 36，PLMP-WEB-E2E-1）——这是 G10 实现开始前的最后一道回归网。本报告即停针（§41：G9-F 后唯一下一批＝G9-G，不在本会话开工）。

## 退出条件核验（指令 §40 checklist）

| 条件 | 状态 |
|---|---|
| 活跃计划中移除过时 parser 发现（PARSE-H02 已闭合登记） | ✅ |
| StageGraph 拥有层拒绝未知键 | ✅ PARSE-H01-A/B/C |
| 作者书写封闭 JSON 不静默吞 typo | ✅ 四解析器＋preset 参数 |
| canonical 逐合同显式未知键策略 | ✅ 矩阵落地＋EVENT_PAYLOAD_FIELDS |
| 无全局严格性 hack（逐 parser 声明，未改 requireFields 语义） | ✅ |
| 历史合法 fixture 仍可回放 | ✅ parity/replay 全绿（两处调用点/声明集修正属 §14-A 类） |
| 开放 JSON 映射保持开放 | ✅ 三例外有测试 |
| models.ts 注释与实现一致 | ✅ §1.6 |
| OrchestrationGraph 依赖源已文档化 | ✅ 审计 C.1 |
| EventCursor/ViewCursor 正式区分 | ✅ VIEW-INV-1 |
| 全图新鲜度不再假设 MAX(event_id) 充分 | ✅ |
| 安全未变路径跳过建图 | ✅ WEB-H01-A |
| 图可见非事件变更失效 viewCursor | ✅ WEB-H01-C |
| 重启不可能制造假游标等价 | ✅ WEB-H01-E（epoch） |
| 既有数值事件游标语义原样 | ✅ |
| health 无需已初始化项目 | ✅ WEB-HEALTH-A01 |
| G9-C 节点序腰带覆盖 | ✅（发现违反→最小修复→两测试钉住） |
| 全量回归过 | ✅ 58/409 |
| roadmap 推进到 G9-G | ✅ |
| 零 G10 实现 | ✅ |
