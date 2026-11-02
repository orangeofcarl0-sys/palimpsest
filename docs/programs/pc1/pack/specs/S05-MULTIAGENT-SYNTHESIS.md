# S05 — 真实独立贡献、异步协作与合成

依赖 S02/S03/S07；与 S04/S06 汇合。此阶段是产品差异化核心，不能缩成“开两个 Session”或“返回两份摘要”。

### S05-R01 — 明确四种执行者

native DSH subagent：在 Harness 支持内短期执行；Reasoning Branch：有界探索、非事实权威；Managed Work Worker：有正式 Attempt/Result；durable project peer：独立身份、历史、生命周期与权限。产品/UI/报告准确命名。系统建议哪种机制时说明 why/use/cost/capability，不把不可用 PARALLEL 假装为串行多次 prompt。

### S05-R02 — 协作由实际需求触发

正常 Agent 能在问题存在独立信息、交叉检查、互补领域或真实并行收益时请求协作。无关更新或简单问题不强制创建更多 Agent。native 能力允许使用，不为突出 Palimpsest 而禁用成熟工具。严格限并发、嵌套深度、总预算和作用域；子任务不得扩大父授权。

### S05-R03 — 可用的结构化交接

每项 handoff 包含 task/intent、constraint、project basis、source standing、允许访问资源、预期 artifact、已知缺口、停止条件、剩余预算和需要上层决定事项。返回包含独立发现、来源、假设、反证、不确定性、产物引用、当前适用范围、follow-up。复杂研究不被强制压成一句 claim；可以交完整 artifact + concise receipt，复用已有 asset/result 引用，不新建并行结论库。

### S05-R04 — 独立性与因果影响可检查

记录每个执行者实际看到什么、读了什么、什么来源是共有的，不能称所有不同模型输出为独立证据。合成过程要指出哪些发现改变了选择/约束/行动，哪些重复、冲突或尚未验证。候选消融（移除一项真实发现）是独立实验，不在生产历史中抹除已发生事件。

### S05-R05 — 分歧是合法状态，不强行投票

当不同结果冲突，系统支持并存、按来源重评、请求定向验证、条件化结论或交给人类决策。多数 Agent 复述同一来源不胜过独立反证。Principal 不能将探索 Branch 的 admitted claim 自动升级为 Evidence/Proof。部分结果保留为 partial，合成产物引用真实来源。

### S05-R06 — 异步与生命周期正确

结果可迟到、重复、逆序到达；取消后新消息不自动重开权威；ProjectIR/source/permission 改变后，旧结果可以保存但 effect 必须重新检查。保存 origin/target/causation/session/work IDs 与 receive/consume/accept 三种不同事实。支持已有 durable transport 的重启恢复；非 durable native job 中断时明确 interrupted，而不是伪装继续运行。

### S05-R07 — 至少两项真实产品路径

A. 单项目 Principal 按需请求独立研究，结果正常返回且影响下一步。
B. 两个独立项目/Owner 通过已有 cross-project Ask/commitment 语义交换有来源成果；至少经历一次不同 Session 的接续。若研究只用临时 branch，路径 B 不能标完成。不得为了满足 B 发明新联邦协议，复用已有 transport/federation 与项目目录。

正式产品若 B 运行依赖显式 peer 配置，安装工具自动生成安全样例并检查，不让用户手填所有内部引用。没有 peer 时可靠降级到“能力未组成”，但不能把该降级当该 requirement 已实现。

### S05-R08 — 合作的价值可被否定

S08 中与强 DSH 原生协作比较质量、反证覆盖、错误接受、人工协调和费用。若额外审查没有收益，默认策略可以不启用；保留该能力不意味强制所有任务使用。自动架构学习和组织演化仅记录经验，不进入本期在线控制。

## 验收

| Test ID | 对应要求 | Case / 期望 |
|---|---|---|
| T-S05-01 | S05-R01,S05-R02 | 机制选择与实际能力一致；缺 capability 不伪造 Agent |
| T-S05-02 | S05-R03 | 长报告可交 artifact + 依据 receipt，摘要未覆盖的关键假设仍可展开 |
| T-S05-03 | S05-R04 | 共享根来源不会被重复计为独立验证；来源与 decision change 可连线 |
| T-S05-04 | S05-R05 | 两个相反结论不会靠多数票自动接受，未解决争议保留 |
| T-S05-05 | S05-R06 | delay/duplicate/reorder/cancel/restart/currentness 全部有可复现对照 |
| T-S05-06 | S05-R07 | 单项目真实执行与独立 peer 两条正常产品机制均可运行 |
| T-S05-07 | S05-R02,S05-R06 | budget exhausted/permission revoked 不启动新工作或扩大作用域 |
| T-S05-08 | S05-R04,S05-R08 | real-agent finding 改变行动的证据与对照；无 live run 时诚实 BLOCKED |

**退出：** 机制完整实现、异步控制有测试、真实行为测试入口就绪。只有真的跑过的 live independent agents 才标 behavioral verified。deterministic agents 可验证协议但不能证明合成智能。
