# PNWF-CQ-R1：执行资格与产品边界合同

问题：在不调用付费模型的条件下，能否证明每个请求先取得可执行预算、实际容器具备隔离与可读 Git World，且产品不会以不充分事实批准 Head 或误导任务退休？

对象：PNWF Runner、Provider Proxy、Container Adapter、复制的 Git/SQLite 状态，以及既有 Work/Head owner。单位为总 tokens（fresh input + cache input + output），不是费用或模型收益。

本轮 Mock 的计量单位明确规定为 UTF-8 字节构成的合成 token 计数，不等同真实 tokenizer 或账单；只有这个可执行上界合同获得资格。

基线：主线 `6b021dda77ee8c3f8010db5071b0896aee7ab232`；PNWF-CQ 的 2026-11-07 Cohort 保持 INVALID / OVER BUDGET。历史原始证据不修改。

干预：请求前持久预留，终态 usage 精确结算；不确定请求保留预留并停止 cohort；只允许具有可执行上界的已资格化 Provider。真实 DeepSeek 路径在上界未被证明时拒绝运行。Mock 身份必须匹配本次实例，不能继承真实凭证。

不变量：`confirmed + outstanding reservations <= authorized ceiling`，同时约束 session 和 cohort。UNKNOWN 不等于 ZERO；非自然成功不能启动后续 session。资格必须来自本次实际 principal 容器，不能借用旧 JSON。

验收：大请求/晚 usage/并发/中断/坏账本/端口冲突的故障注入；实际 Container Adapter 的零付费纵向运行；每个 attempt 的 basis/result/diff/status 与产品观察；CONFLICT/错误权限/HEAD 竞态/无 Direct 历史负例；现有验收回归。

范围：执行控制、窄产品修复、职责归位、文档一致性。排除付费模型实验、新身份/活性 runtime、大规模架构重构、模型效果或成本收益声明。

交付：实现、可复现命令、新的确定性证据、中文资格报告、同步 handoff，同一次提交。结论限定为被测控制合同；任何未资格化能力明确保持 BLOCKED。

## Energy 项目跨会话交付

验证同一项目的首版直接交付、输入变化后正式 Worker 修订、按 SHA 接受和下一会话使用能否实际闭环。冻结同一初始 Git 树、更正、提示词、模型和资源窗口。两组分别由所有者审核修订候选。Palimpsest 的真实三会话通过后执行强原生 DSH 配对。

观测链为更正提交、受影响成果的实际 diff、仍有效成果的 blob、Worker 进程和账本、Attempt 结算、接受记录、下一会话 HEAD 和交付。一次配对只支持该场景的闭环结论和样本比较。环境或记账失败单独归因，模型的路径选择与停止作为结果保留。[场景与判据](../docs/engineering/ENERGY-PROJECT-CONTINUITY.md)

T2 复跑的干预是把同一份五文件写范围用于 Work 计划、委派前检查和宿主导入，并在两个组的 T2 提示中要求逐字节保留证书。以已批准的基线、相同的更正、模型、账本和会话窗口复跑。先证明六文件声明在启动 Worker 前被拒，再检查真实 Worker 接到的范围、证书 blob、提交判分和结算。所有者核准完整候选 SHA 后才接受和进入 T3。

只写“隔离执行”的首次复跑触发了原生 Subagent 路径，保留该轨迹与账本。后续 Palimpsest T2 在同一业务提示后声明正式 Worker 执行路径和等待状态。原生组维持共同业务提示，自选原生能力。报告分开归因范围与路径选择，单次结果不能分离这两项对用量的影响。

范围修复后的正式 Worker 已成功导入并结算，Principal 到 64 笔上限前未记录等待结论。保留这一失败。定向复验另外增加最多 45 秒的只读宿主等待和结算后的具体工具提示；会话窗口和接受判据不变。实验结论须区分有此帮助的闭环与默认工具行为。

等待式变体的 Palimpsest 与强原生 DSH 均完成三个真实会话，两组 T2 候选分别按 SHA 核准。证据把两条未送审复跑、审批用时和成功周期分别计量。结论限定于该配置、该输入和这一次配对。[结果与局限](../docs/engineering/ENERGY-PROJECT-CONTINUITY.md#配对结论)

Fresh input 复核先把 136 笔 DSH 终态逐一绑定到 Provider 账本，再按会话、角色和首笔/后续请求分解。工具清单长度和峰值前的工具结果是观测线索；原始试验没有记录每个输入块的缓存命中，不能从汇总做逐块因果归因。[分析边界](../docs/engineering/ENERGY-PROJECT-CONTINUITY.md#fresh-input-为什么更多)

T2 上下文试验沿用已批准的完整基线和成功等待式对照。校验回执、定向回读、短版 Pulse 各自开启，分开考察候选检查、文件读取和历史状态摘要。保留五文件范围、证书 blob、正式结算、独立判分和按完整 SHA 审批。Mock 先验证闭环和绕过场景，真实 T2 使用原会话窗口与按量记账。逐笔比较 fresh input、cache read、请求和配对后的展开行为。服务端缓存状态与模型采样仍可能随次变化，比较只描述各单次运行。[试验设计](../docs/engineering/ENERGY-PROJECT-CONTINUITY.md#t2-上下文干预的独立对照)

接续 T3 以两个完整的晋升后 HEAD、产品状态和核准记录为输入，先从各自状态的副本跑零付费资格，再各用新 DSH 会话运行一次。保留原判分、实际 Git 交付、结论和自然退出各项事实。两条使用相同的 T3 提示及工具，比较从不同接受版本接续时的工具序列和逐请求用量。[T3 结果](../docs/engineering/ENERGY-PROJECT-CONTINUITY.md#两个晋升版本的真实-t3)

## 长期项目的协作与适应

在可执行的软件迁移和可追溯的 Energy 决策项目中，验证项目连续性与自主协作能否让新证据改变实际产物，保留仍有效的工作，并形成质量相同或更好、返工更少的交付。主要对照为保留 Git、Subagent、Workflow、测试与交付能力的强原生 DSH。项目上下文的单独贡献在有辨识需要时用轻量消融验证。

冻结项目输入、外部变化、业务任务、独立验收与双方运行条件。证据链连接来源、参与者、决策、实际 Git diff、验收与后续使用。分开报告文件存在、内容正确、持久化、正式结算、适用的接受与自然退出。一个试点配对用于找出路径和故障。重复配对才支持限定场景内的方向判断。

软件试点已通过六会话零付费资格。首组真实配对从主线 `268f14f98099b10b181ec9dd1ea4e07ecbe43d31` 运行，沿用资格封存的业务提示、Fleet 更正和独立判分。按会话交错先运行 P T1、F T1、P T2、F T2，两个 T3 各自等待所有者核准完整候选 SHA。比较实际协作选择、候选文件差异、保留的 blob、自然退出与各角色用量。一次诊断配对保留路径偏离和未完成样本。[软件试点报告](../docs/engineering/SOFTWARE-PROJECT-CONTINUITY.md#真实诊断配对) · [项目发展路线图](../docs/product/PROJECT-ROADMAP.md)

实测四个会话均自然退出。两个 T2 的行为探针均通过，修改 proto 注释导致两组均未通过独立的 blob 保留判据，止于 T2。Palimpsest 的委派拒绝、原生接管和结算可按调用 ID 及实际 Git 对象复核。[证据](../research-evidence/pnwf-software/2026-11-10/live-pair-150630/evidence.json)
