# Agent Canvas 素材母体：四系统代码级拆解（2026-09）

> **来源**：外部拆解报告（2026-09-07），四仓主分支 2026-09 最新版克隆于 `F:\Codex_Work_Space\DSH plugin\_teardown\`（Flowise 3.1.4 / AutoGen Studio 0.4.3 / Node-RED 5.0.6 / Langflow 1.12.0），逐仓库代码级取证，含文件路径与行号。
> **地位**：`21-agent-canvas-spec.md`（PLMP-CANVAS）的素材母体——与 17/18 号规格引用 Ordarium 调研（`ordarium/docs/research/agent-landscape-2026-08/`）同款做法。本仓不复制其代码，只引用结论与裁决。
> **抽查**：2026-09-07 本仓抽查五条承重结论全部属实（四仓在位、Node-RED `Subflow.js` 在、Langflow `NESTED_HITL_UNSUPPORTED` 恰在 `hitl.py:164`、AutoGen maintenance mode 徽章、许可 Apache-2.0/MIT）。一处精度修正：Flowise "Nested iteration" 报错串在 `packages/agentflow/src/core/validation/constraintValidation.ts:23`——即未被主 UI 引用的 SDK 包的校验层。
> **取用裁决**：见文末 §8（本仓附录）。

---

## 一、报告正文（外部拆解，2026-09-07）

**五个改变此前判断的结论：**

1. **没有任何一家实现了真正的画布嵌套。** Flowise 只有单层 Iteration 容器（代码里显式报错 "Nested iteration node is not supported yet"）；Langflow 的 Group 是"代理字段展开"技巧、展开后子节点平铺回父画布，RunFlow 只存子图 id；AutoGen Studio 的画布是"1 个 team + N 个 agent"的星形；唯一在数据模型层面支持任意深度嵌套的是 **Node-RED 的扁平数组 + `z`/`g` 字段契约**——这将是直接可搬的东西。
2. **AutoGen 已进入 maintenance mode**（README 顶部徽章，继任者为 Microsoft Agent Framework）。正确姿势是把 `autogen-agentchat`/`autogen-core` **当 MIT 依赖库用**，不要 fork AutoGen Studio 前端。另：Studio 未暴露 pause——引擎层有、没接线。
3. **Flowise 的 HITL "重启后可继续"不成立**：恢复机制是"同 session 末次 Execution 快照重放"，服务重启不续跑、无逐节点 checkpoint（`executionData` 是整个 run 的 JSON 反复覆写）。
4. **最值得整包搬的是 Langflow 的 `src/lfx`**（MIT）：图引擎 + 持久化 Job + checkpoint 暂停恢复 + 组件 UI 协议，四家里工程完成度最高的运行时底座。代价是与 langchain 值类型耦合，fork 单位必须是整包。
5. **许可全部绿灯**：Flowise/Node-RED Apache-2.0、Langflow MIT、AutoGen 代码 MIT（文档 CC-BY-4.0）、React Flow 12 / AntV X6 / Rete.js v2 全是 MIT。要避开的只有 Flowise 的 `enterprise/` 目录、GoJS（商业）、Dify（修改版 Apache-2.0，多租户 SaaS 受限）。

### 总览

| | Flowise | AutoGen Studio | Node-RED | Langflow |
|---|---|---|---|---|
| 版本（main） | 3.1.4 | 0.4.3（agentchat 0.7.5） | **5.0.6** | 1.12.0 |
| 许可 | Apache-2.0（`server/src/enterprise` 除外） | 代码 MIT / 文档 CC-BY-4.0 | Apache-2.0 | MIT |
| 画布 | reactflow 11.5.6 | React Flow 12.3.5（星形） | **自研 SVG**（jQuery+d3v3，`view.js` 8027 行） | React Flow 12.3.6 |
| 执行模型 | 自研解释器：FIFO 队列 + join 表 | agentchat 消息广播（group chat） | sendEvents 消息管道 | 分层批处理 asyncio（拉式+推混合） |
| 嵌套 | 单层 Iteration 容器 | 无（运行时支持 team 嵌套，UI 没有） | **扁平图 + z/g，任意深度** | Group=proxy 展开 / RunFlow=id 引用 |
| HITL | STOPPED 快照重放（重启丢） | `input_request` + asyncio.Queue（无 pause） | 无（hooks 是唯一挂点） | **checkpoint + job suspend 全闭环** |

### 1. Flowise 3.1.4 — 图 schema 和执行器参考，嵌套是硬伤

结构：6 包 monorepo。意外发现：`packages/agentflow`（独立可嵌入画布 SDK，212 文件/3.3 万行，DDD 四层）和 `packages/observe`（ExecutionsViewer/HitlPanel 执行记录查看器 SDK，74 文件/8 千行）**都没被主 UI 引用**——两个半成品 SDK，许可干净、边界清晰。

画布与图 schema：前端无类型，权威类型在 `packages/server/src/Interface.ts:284-329`——`IReactFlowNode { id; position; type; data; parentNode?; extent?; ... }`（嵌套仅此二字段）、`IReactFlowEdge { source; sourceHandle; target; targetHandle; type; id; data.label }`。`initNode()`（`genericHelper.js:118`）把节点声明拆成 `inputAnchors[]`（handle id 约定 `nodeId-input-name-Type`）、`inputParams[]`（表单 DSL：show/hide 条件显隐、acceptVariable、array 子字段、loadMethods 异步下拉）、`inputs{}`、`outputAnchors[]`。Agentflow V2 画布 `Canvas.jsx`（831 行），`isValidConnectionAgentflowV2` **DFS 禁环＝V2 强制 DAG**。

执行引擎 `buildAgentflow.ts`（2471 行）——FIFO 队列 + join 表：`constructGraphs()` 建正向图+入度表；主循环带 `MAX_ITERATIONS=1000`；多输入 join 挂 `waitingNodes`（条件分支组内任一到达即触发，未命中分支子图 `determineNodesToIgnore()` 整体忽略，最后条件当 else 兜底）；Loop 节点 `output.nodeID` 重新入队、`MAX_LOOP_COUNT=10`；Iteration 节点把 `parentNode === iterationId` 的子图切成 JSON **递归调用执行器**——嵌套语义的全部家底。

节点返回统一信封 `{ id, name, input, output, state }`；流式走 SSE（`agentFlowEvent` 节点状态徽标 INPROGRESS/FINISHED/ERROR、`agentFlowExecutedData` 整份执行数据、`action` HITL 按钮）；worker 模式 BullMQ+Redis 回放 SSE。

HITL 真相：humanInput 节点 → 写 `status:'STOPPED'` executedData → 发 action 按钮 → `shouldStop` 终止；用户点击带 `{type:'proceed'|'reject', startNodeId, feedback}` **重新调 prediction API**，从同 sessionId 末次 Execution 恢复。无逐节点事件溯源，重启即丢。

复用评分：图数据结构 4.5、运行时引擎 4、画布交互 3、SSE+执行树 UI 3.5、编排语义 2、节点组件库 1（10.6 万行全绑 LangChain）。

### 2. AutoGen Studio 0.4.3 — 抄协议与语义，别抄工程

许可：`LICENSE-CODE`（MIT）管代码，`LICENSE`（CC-BY-4.0）管文档。README 明确 maintenance mode。

Team Builder 真相：React Flow 画布但拓扑焊死星形——`convertTeamConfigToGraph()` 固定 1 team + N agent；连线无编排语义（RoundRobin 顺序来自 participants 数组）；拖放 model/tool/termination 直接写进目标 config；编辑走 antd Drawer。`@dagrejs/dagre` 只用于运行态 trace 图（消息流 `source→source` 相邻转移聚合成有向图，边标 "3x (1234 tokens)"）——~575 行可拆用。

最值得抄两样：**`ComponentModel` 声明式封套**（`{provider, component_type, version, config, label}`，`load_component()` 一行还原）+ `component-schema-gen` 从 pydantic 自动生成 JSON schema 给前端表单（"spec 单一来源"现成范本）；**agentchat 引擎层**（作 MIT 依赖非 fork）：`BaseGroupChat` 内嵌 `SingleThreadedAgentRuntime`；`participants` 运行时支持团队嵌套（SocietyOfMindAgent）；`pause()/resume()/save_state()/load_state()` 全实现但 Studio 没接；`GraphFlow`（`teams/_graph/`）带条件边（`DiGraphEdge{condition, activation_group, activation_condition}`）、入度表、环检测、fluent `DiGraphBuilder`——标注 experimental。

数据模型：Team 整体一个 JSON 列；Gallery 组件模板库（概念可取、634 行硬编码要重做）。流式协议：WS `{type: message|message_chunk|result|completion|input_request|error|stop}`，HITL 用 `UserProxyAgent.input_func` + `asyncio.Queue`（3 分钟超时自动 stop）。token 统计**后端不算**（`TeamResult.usage` 恒 `""`），前端累加。Replay 只是前端时间轴回放，不重建状态。

### 3. Node-RED 5.0.6 — 三层骨架直接搬，画布当规格书

前端零框架自研（jQuery+d3v3，`editor-client/src/js/` 63,142 行，`view.js` 8027 行、`nodes.js` 3558 行、`subflow.js` 1418 行、17 态鼠标状态机）。画布=固定 8000×8000 SVG，平移原生 scroll、缩放 transform、端口独立 rect 原生事件 hit-test，d3 data-join 增量重绘。对 React 不可移植，但是最好的交互规格书（splice 划线插入、Alt+Shift junction、Quick Add、跨 tab 虚连接、压线自动插入）。

最值钱三块：
- **扁平图 + `z`/`g` 嵌套契约**：`flows.json` 就是数组；节点 `{id, type, z, x, y, wires:[[targetId...]...]}`——**`z`=所属容器（tab 或 subflow 定义），`g`=所属 group（group 自身也有 `g`，链式任意嵌套）**。subflow 定义与实例只靠 type 字符串关联；"进入子流"=切换渲染 `z===subflowId` 的节点。导出/导入收敛在 `convertNode()`/`parseConfig()` 两个纯函数。
- **subflow 运行时展开**（`runtime/lib/flows/Subflow.js`）：`jsonClone` 模板全部节点 → id 重写 `${instanceId}-${nodeId}` + `_alias` 回指 → 内部 wires 重映射 → **模板内连到 out 端口的节点 wires 直接 concat 实例外部的 wires**（出边焊接）；支持 subflow 嵌套；env 三层合并；错误按实例身份冒泡。
- **消息管道**：`send()` 产 sendEvents `{msg, source, destination, cloneMessage}`，首条共享引用、后续逐目标深拷贝；`done()/error()/complete()` 三通道；catch 节点按 scope 与嵌套距离择近投递、`count===10` 防错误循环；`hooks` 7 个消息路径钩子（`onSend/preRoute/preDeliver/onReceive/postReceive/onComplete`，handler 返回 false **可拦截消息**）——官方唯一干预/断点挂点，node-red-debugger 即基于此。

部署模型：`rev = sha256(flows JSON)` 乐观锁 + `POST /flows` 带 rev（冲突 409）；`diffConfigs` 算 added/changed/removed/rewired 实现 **full/flows/nodes/reload 四级精确停启**；部署时**在途消息直接丢弃**；multiplayer 只有 presence。debug 走 WS（MQTT 风格 topic 通配 + retained 补发 + 50ms 批量）。

复用评分：扁平图+z/g **5**、消息驱动运行时 **5**、subflow 4、deploy/版本模型 4、debug 协议 3、自研画布 2（只抄架构决策与 UX 规格）。

### 4. Langflow 1.12.0 — 运行时底座的最强候选

引擎核心在 **`src/lfx` 独立包**（15.5 万行），服务层 FastAPI 14.2 万行，前端 React 19 + React Flow 12（`flowStore.ts` 1451 行状态中枢）。全 MIT。

组件 UI 协议（最该照抄）：后端扫描 Component 类 → `to_frontend_node()` 产 schema → `GET /api/v1/all` 全量下发；字段拍平进 `template[fieldName]`（`InputFieldType`: `type/required/show/list/password/refresh_button/real_time_refresh/options...`）；`refresh_button` 字段改值 → `POST /build/{id}/` → 后端 `update_build_config()` **增删 template 字段、改 options** → 前端重渲染（"选了模型才出现 temperature"的机制）。Handle id 是 JSON 转义串。

嵌套三种建模并存：Group 节点（选区抽成子图 JSON 嵌 `node.flow` + `proxy:{id,field}` 代理，展开即平铺，**无子画布视口**）；RunFlow 节点（只存 `flow_id_selected` 引用 + 子流输入动态注入 `{vertex_id}|{fieldName}` + 输出动态注册 + 过期检测 + 可选缓存 + `component_as_tool`）；**硬限制 `hitl.py:164` `NESTED_HITL_UNSUPPORTED`——含 HITL 的 flow 不能嵌套运行**（嵌套 run 无法暂停等决策）。

执行引擎（`lfx/graph/`）：`Graph.process()` 分层批处理，`get_next_runnable_vertices` 动态推进；**支持环**（cyclic 须给 `max_iterations`，`CycleEdge` 反馈边）；Loop 是组件层实现（圈 body 顶点集、逐数据项隔离子图，天然嵌套 loop）；frozen 节点走缓存；`StateVertex` 状态驱动重跑。结果统一 `ResultData {results, artifacts, logs, messages, timedelta, token_usage}`。

Job/HITL（四家唯一完整闭环）：`services/jobs` 持久 Job（queued/running/**suspended**/completed/error + checkpoint blob + seq 事件日志 + heartbeat 租约）+ `job_queue`（in-memory/Redis、跨 worker 取消）。HITL 链路：HumanInput 组件 → `graph.request_pause()` → **`GraphCheckpoint`**（`vertex_results` 全量快照）→ job suspended → 前端 `POST /resume {request_id, decision}` → 决策落 `human_input_decisions` → `resume_from_checkpoint` 重放。事件流断线可 `reattach_workflow_events`。前端 `canSuspend` 探测分流；v2 主路径已切 **AG-UI 协议** SSE（`STATE_DELTA` 打回画布）。

trace：原生 `trace`/`span` 表（OTel 风格、`parent_span_id` 树、token/延迟汇总）+ 7 个薄适配器。

### 5. 横向对比：四个关键设计决策

- **嵌套建模**：Node-RED 扁平 `z`/`g`（序列化最优雅，"进入子流"是切换画布）；Flowise `parentNode` 单层 + 执行端切子图递归；Langflow `node.flow` 内嵌 + proxy 展开（无子画布）；AutoGen 运行时嵌套存在但 UI 没画。**结论：任意嵌套 = 扁平 `z`/`g` 持久化 + 嵌套视口渲染 + 递归执行语义，三件都要自己做。**
- **HITL 三种范式**：Flowise STOPPED 整 run 快照重放（最弱）；AutoGen `input_request`+asyncio.Queue（协议最简，Studio 无 pause/checkpoint）；Langflow request_pause → GraphCheckpoint → suspended → decision 注入恢复（最强）。应基于 Langflow 范式升级为**逐节点事件溯源 + 任意点 fork**（LangSmith 式 time travel 四家均无开源实现）。
- **执行模型光谱**：Node-RED 纯推式消息管道 ↔ Flowise FIFO+join（单文件可读蓝本）↔ Langflow 分层批+动态 runnable（批图+缓存恢复）↔ AutoGen 消息广播（agent-to-agent 语义）。
- **节点 UI 协议**：Langflow `template + update_build_config` 最成熟（4.5）；AutoGen `ComponentModel + pydantic schema 自动生成`最优雅；Flowise show/hide/loadMethods 描述符可抄。可合成：**pydantic spec（单一来源）→ JSON schema 下发 → 服务端 update 回调 → 前端表单**。

### 6. 许可证清单

| 项目/库 | 许可 | fork 红线 |
|---|---|---|
| Flowise | Apache-2.0 | `packages/server/src/enterprise/`（130 文件）+ `IdentityManager.ts` 商业；`workspaceId` 渗透执行器签名 |
| AutoGen | 代码 MIT，文档 CC-BY-4.0 | maintenance mode；商标不可用；gallery JSON 保守重写 |
| Node-RED | Apache-2.0（OpenJS） | 无附加条款 |
| Langflow | MIT | 无例外 |
| React Flow 12 / AntV X6 / Rete.js v2 | MIT / MIT / MIT | Rete v1 是 GPL，只取 v2 |
| GoJS | 商业 | 排除 |
| Dify | 修改版 Apache-2.0 | 多租户 SaaS 受限、前端不得移除 LOGO——只做 UX 参考 |
| CrewAI | MIT（库） | AMP 平台闭源 |

### 7. 落地建议（报告原结论）

直接搬：Node-RED 扁平图+z/g 契约（两个纯函数）、Subflow 克隆展开、消息管道+hooks；Langflow 整包 fork `src/lfx` + `template/update_build_config` 协议；Flowise `IReactFlowNode/Edge` schema + `initNode` + handle 命名、`buildAgentflow` join/条件组/循环蓝本、`packages/observe` 回放 UI 参考；AutoGen 作 MIT 依赖（ComponentModel + GraphFlow/pause/save_state/team 嵌套）。

抄设计不搬代码：Node-RED 8 千行画布当交互规格书；AutoGen Studio WS 协议与 trace 图可视化；各家 SSE/WS 事件协议。

必须自研（四家空白）：① 嵌套子画布视口与折叠；② 层级递归图执行引擎；③ 嵌套 HITL；④ 逐节点事件溯源 checkpoint + fork/time-travel；⑤ 多写者并发编辑。

合成底座建议（报告原结论）：React Flow 12 画布壳 + Node-RED `z`/`g` 扁平持久化契约做图 IR + Langflow `lfx` 做 job/checkpoint/执行骨架 + agentchat GraphFlow/Team 语义做 agent 运行时适配器。6 个内置拓扑模板全部可表达在该 IR 上。

---

## 8. 本仓取用裁决（附录，2026-09-07）

报告的合成底座是**绿地配方**；palimpsest 已有事件溯源编排内核（34 事件合同 + ProjectIR + 调度器/attempts/门禁 + 快照重放，256 项测试在案），照搬即引入第二运行时/第二真相源，且 agent 运行时依赖（agentchat）撞宿主中立红线。修正后的取用原则：**搬持久化契约与 UI 协议（定义/渲染面），拒绝全部运行时。**

| 拆解建议 | 裁决 | 理由 |
|---|---|---|
| Node-RED 扁平图 + `z`/`g` | **采纳（画布定义面）** | 任意深度嵌套的最优序列化；画布侧草稿态，落账编译为 ProjectIR |
| subflow 运行时展开 | **编译期展开变体（V1）** | 声明时扁平化为任务集（既有 proposalTaskSpecs 管道）；运行时递归执行=内核项后置 |
| Langflow `lfx` 整包 fork | **拒绝** | Python+langchain 耦合；执行内核已存在且更强（租约/快照/暂停门禁经 SIGKILL 案例验证） |
| agentchat/GraphFlow 依赖 | **拒绝** | 宿主中立红线：agent 执行属宿主（DSH worker），插件零 LLM |
| Node-RED 消息管道做骨 | **不进编排合同**；hooks 拦截思想采纳 | 执行模型已有；hooks"路径钩子+返回 false 拦截"＝未来断点/inject 控制面交互范本 |
| deploy `rev` 乐观锁 + diff 精确停启 | 思想已有对应物（plan revision + changeClass）；diff 粒度作调度器失效传播改进目标 | — |
| Flowise 图 schema/initNode | 不需要 | 已有自有合同类型镜像 |
| AutoGen ComponentModel | 不需要 | 已有更强纪律（声明事件 + schema_version + ACC-02） |
| 组件 UI 协议（schema 单一来源→下发→update 回调） | **采纳模式，单一来源换成自有类型** | paramSpec（ARCH-3）+ 提案/门禁 JSON 类型 → JSON schema 下发，Inspector 表单实现路径 |
| observe 执行树 / AutoGen trace 图 | **当 UI 参考实现** | CANVAS-4 Trace 视图形态来源 |

增量认知（对本仓可行性分析的更新）：

1. **嵌套分级落地**：序列化（z/g）即日采纳；**就地嵌套视口**为渲染线真空白但经裁决纳入本轮（React Flow 原生 parentNode 链 + extent 约束，扁平模型同构——Flowise 单层用法即证据，深度链是同一机制延伸）；**运行时递归执行**为大内核项后置，V1 编译期展开替代。
2. **HITL 是本仓差异化优势**：`NESTED_HITL_UNSUPPORTED` 证明嵌套执行与任意点暂停在四家是结构性互斥；palimpsest 暂停是项目级、全层级事件在同一账本，嵌套（若做）不破坏暂停/恢复语义。
3. **"必须自研④：逐节点事件溯源 checkpoint + fork/time-travel"对本仓不是自研是产品化**——事件溯源+快照重放是内核验收项，fork=账本派生，time-travel=既有重放。⑤多写者才需真设计。
4. 许可：抄设计为主；若取 Node-RED 纯函数体须 NOTICE 署名，建议重写（契约本身无版权问题）。避开清单照准。
5. 报告"定 AgentGraph IR 的 spec"修正为"**画布定义格式的 spec（映射既有 ProjectIR 的编译规则）**"——IR 已存在，新定的只是画布侧序列化与编译约定。
