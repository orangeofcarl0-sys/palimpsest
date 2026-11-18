# 多 Agent 可视化调研

核对日期为 2026-11-18。参照对象包括能看见并行文件工作的 DSH 插件、能调查多轮执行的观测工具、能设计或研究协作策略的界面。比较时，逐一检查用户选中节点后能否辨认执行者、打开当时的原件，并判断结果是否被采用。dsh-layerfs 的结论来自固定版本源码、上游截图和公开运行档案。其余条目依据官方文档或作者论文。下文关于 Palimpsest 的取舍是设计建议。[系统盘点](SYSTEMS.md) · [落地规划](PLAN.md)

## dsh-layerfs 怎样把并行工作画清楚

核对的是 DSH 插件提交 `d91577e979a022f71627d2451caa44c4f5eded2a`。它另以 `layerfs.json` 固定底层 LayerFS 源码版本。DSH 会话、LayerFS 的 Branch/Commit/Layer 和运行命令的 Sandbox/Workspace 是三组对象。理解这种区分，才能读懂它的界面。这里查阅了源码和上游记录，真实运行数值均来自上游档案。[插件固定快照](https://github.com/Ephemeral-AI-Lab/dsh-layerfs/tree/d91577e979a022f71627d2451caa44c4f5eded2a) · [底层固定版本](https://github.com/Ephemeral-AI-Lab/dsh-layerfs/blob/d91577e979a022f71627d2451caa44c4f5eded2a/layerfs.json)

| 观察面 | 上游实现与具体交互 | 给 Palimpsest 的启发与边界 |
| --- | --- | --- |
| 现在谁在做什么 | Chat、Trajectory 旁边有 Work、History。Work 用 main/Branch 选项切换，项目端看 fork、merge、publish，Workspace 端看挂载、命令和结果。跨会话的项目页还能看 Sandbox。 | 会话留给当前动作，项目页承载长期成果。Palimpsest 的泳道按实际 Principal、Worker、Operator 和宿主观测划分。只有观察到的执行才出现「正在运行」。[集成指南](https://layerfs.ai/docs/integrations/dsh/) · [操作图解](https://github.com/Ephemeral-AI-Lab/dsh-layerfs/blob/d91577e979a022f71627d2451caa44c4f5eded2a/TUTORIAL.md) |
| 哪个版本从哪里来 | History 把主线、分支、提交、合并和发布画成可区分的形状，支持横竖布局、全览定位和播放。同一分支尽量保持原泳道。点击节点可查看该时点的文件或差异。 | 借鉴稳定位置、有限图例、点版本看原件。Palimpsest 给「候选」「核准的候选」「晋升结果」「交付工件」明确动词和版本。只有经 Git 核对的亲缘才画提交父边。[History 源码](https://github.com/Ephemeral-AI-Lab/dsh-layerfs/blob/d91577e979a022f71627d2451caa44c4f5eded2a/packages/view/src/history.js) · [上游实际界面](https://github.com/Ephemeral-AI-Lab/dsh-layerfs/blob/d91577e979a022f71627d2451caa44c4f5eded2a/docs/tutorial/10-history-graph.jpg) |
| 哪行内容发生了变化 | 文件视图可固定到历史节点，File、Diff、Blame 逐步缩小问题。较短的显示 ID 便于阅读，Mirror 维护显示 ID 与底层 ID 的映射。 | 摘要显示短 SHA，详情保留完整 SHA、路径、blob 和原件。按文件展开「允许/必改/必存/保留」。Git blame 说明内容来源，只在存在执行关联时显示写者，在存在审批记录时显示批准人。[文件教程](https://github.com/Ephemeral-AI-Lab/dsh-layerfs/blob/d91577e979a022f71627d2451caa44c4f5eded2a/TUTORIAL.md) · [Mirror](https://github.com/Ephemeral-AI-Lab/dsh-layerfs/blob/d91577e979a022f71627d2451caa44c4f5eded2a/packages/model/src/mirror.js) |
| 如何归属到 Agent | Host 从各 Agent 的 SDK 调用记录增量采集，在调用方会话登记完成记录，并按根会话保留日志。模型层把执行结果与对象对应。快进合并再次指到已有节点时保留原创建者。 | 保留「发起者」「执行者」「结算者」「批准者」四种动作归属。产品使用可信执行关联、绑定回执与 Promotion，工具日志提供另一个观察面。把因多个 Agent 共用路径或名字而无法确定的归属明确标出。[采集器](https://github.com/Ephemeral-AI-Lab/dsh-layerfs/blob/d91577e979a022f71627d2451caa44c4f5eded2a/packages/host/src/collector.js) · [归属实现](https://github.com/Ephemeral-AI-Lab/dsh-layerfs/blob/d91577e979a022f71627d2451caa44c4f5eded2a/packages/model/src/attribution.js) |
| 长历史如何阅读 | History 的界面按项目复用已读历史，对版本发出 `since` 查询，并发读取共享请求。用户手动滚动或缩放后保留位置。公开 Wayfare 档案有 147 个提交、31 个分支、13 层，Quarry 有 913 个提交、56 个分支、9 层。 | 初始只呈现影响成果的节点和异常，保留展开次数与原始顺序。缓存键要包含本地权限范围和所有者依据，切换项目后不可串读。两个上游档案用于选择压力形态。它们没有测量本项目读者的正确率或时延。[历史缓存](https://github.com/Ephemeral-AI-Lab/dsh-layerfs/blob/d91577e979a022f71627d2451caa44c4f5eded2a/packages/client/src/client/historyCache.ts) · [Wayfare](https://github.com/Ephemeral-AI-Lab/dsh-layerfs/blob/d91577e979a022f71627d2451caa44c4f5eded2a/demo/wayfare/README.md) · [Quarry](https://github.com/Ephemeral-AI-Lab/dsh-layerfs/blob/d91577e979a022f71627d2451caa44c4f5eded2a/demo/quarry/README.md) |

**最有启发的是一次真实误发布。** Wayfare 的 Principal 将从空 main 派生的 skeleton 修补分支发布，主线可见测试从 238 项变成 38 项。随后它从已整合版本重建补丁，再发布，并在新分支验证 238/238。历史图回答「哪次发布改变了可见的树」。要回答「这次发布是否保住已接受的工作」，还需要基线、保留义务、对该版本的验证和接受记录。在 Palimpsest 的详情里，这些事实应能同时打开。[Wayfare 事故及恢复记录](https://github.com/Ephemeral-AI-Lab/dsh-layerfs/blob/d91577e979a022f71627d2451caa44c4f5eded2a/demo/wayfare/README.md#incidents)

**移植边界。** 插件的文件系统对象很适合有大量并发写入的任务。Palimpsest 的 Explore 可能只产生反证，跨项目 Ask 可能只产生尚未采用的建议，T3 也可以只有 Principal。首版采用其信息组织和原件下钻方式，沿用 Git、现有 World、DSH 及 Promotion。若以后有实际 LayerFS 项目，可把它作为只读外部证据来源，再验证对象绑定、披露权限和历史可重放性。[LayerFS 集成约束](https://layerfs.ai/docs/integrations/dsh/) · [Palimpsest 既有路线图](../PROJECT-ROADMAP.md)

## 其他路线分别解答什么

| 参照 | 官方资料支持的做法 | 在 Palimpsest 中的取舍 |
| --- | --- | --- |
| LangSmith | 可从 thread 读分轮摘要，再深入子 Agent 和各次运行。thread 视图依赖 `thread_id`。Studio 另有图架构与线程调试入口。 | 采用「项目 → 会话 → 角色 → 调用」及返回时保留上下文。跨会话接续使用完整接受 SHA 和接受凭据。thread ID 只组织消息。普通用户默认看动作、输入来源和结果。[线程阅读](https://docs.langchain.com/langsmith/view-traces) · [Studio](https://docs.langchain.com/langsmith/studio) |
| Langfuse | 同一追踪有聚合和展开两种图。前者按名合并重复步骤并计数，后者逐次呈现实际观察。Session 聚合同一标识下的 traces。 | 对轮询和重复读文件做可逆折叠。键包括角色、Attempt、对象和结果原因。两个 `NOT_READY` 若原因不同必须保留两行。折叠条保留次数、首末序号和所有异常。[Agent Graphs](https://langfuse.com/docs/observability/features/agent-graphs) · [Sessions](https://langfuse.com/docs/observability/features/sessions) |
| AutoGen Studio | Team Builder 中可配置团队、Agent、模型、工具和终止条件，可在可视编辑与 JSON 之间切换并测试团队。 | 适合专家的架构和方案编辑。现有 Canvas 已覆盖这一类需求。看实际过程时按已观察的执行呈现，计划中的 Worker 不占据实跑泳道。[AutoGen Studio 使用文档](https://microsoft.github.io/autogen/stable/user-guide/autogenstudio-user-guide/usage.html) |
| AgentLens | 作者从原始运行事件构造行为结构与分层时间摘要，并提供行为关系调查。其研究以示例和用户研究检验可用性。 | 借鉴多尺度时间线，以及从异常向前查找原事件。程序明确登记的原因、模型声称的原因、分析者提出的解释分别标注。可读性要在本项目读者上另测。[AgentLens 作者论文](https://arxiv.org/abs/2402.08995) |
| AgentCoord | 把协作策略结构化，让用户干预生成阶段、探索策略，然后查看执行结果。研究关注任务依赖、Agent 关系和成果对应。 | 当调查「这次独立探索改变了什么」时，把提议、采纳决定、改动的成果并排。放在调查详情。若链条只到建议，则终止在建议。[AgentCoord 作者论文](https://arxiv.org/abs/2404.11943) |
| OpenTelemetry | Trace、span、parent 与 span link 提供跨执行关联词汇，GenAI 约定描述 Agent 调用。 | 可作为后续互操作出口。一个 span 的完成、耗时或 error 很适合调试。结算要读 AttemptReport、接受要读 Promotion，账本要读终态 usage。将传入的 trace 信息作为补充来源，保留独立判定。[Trace 与 span](https://opentelemetry.io/docs/concepts/signals/traces/) · [GenAI Agent spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/) |

## 三种入口的取舍

| 入口方案 | 对哪类任务最省力 | 在本项目要付出的代价 | 建议位置 |
| --- | --- | --- | --- |
| Agent 关系图作首页 | 找团队定义、谁能向谁发送消息 | 用户必须先识别拓扑，再拼出被接受的版本。直接交付样本几乎无图可看 | 保留现有 MultiGraph/Canvas 的专家入口 |
| 原始聊天或 span 瀑布作首页 | 工程师找失败的调用、并行与等待 | 跨 Session 的项目 Head、保留成果和 Operator 接受会散在多个流里 | 单次会话调查、账本诊断 |
| 已接受成果作首页，按版本联动历程、文件和证据 | 项目所有者接手、审批前定位、跨会话复核和比较 | 要做多来源绑定、权限过滤并处理缺失。完成后可复用现有专门视图 | **第一版。** 用真实 T2 → T3 和非代码 Energy 样本验收 |

实践上的取舍是让默认界面能解释一次工作**改变了什么、谁接受了它、后来谁沿用了它**。并行规模、工具调用量、时间线与 Git 树在解释这些问题时展开。一次调研提供的是设计依据。人是否读得更快、更准，按规划中的任务对照测量。[样本与阅读验收](PLAN.md)
