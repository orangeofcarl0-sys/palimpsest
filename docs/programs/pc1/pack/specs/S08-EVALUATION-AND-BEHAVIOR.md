# S08 — 两个代表性场景与真实行为/比较验收

依赖 S04/S05/S06/S07。工程代码必须完成；真实运行受已批准资源与安全条件约束。

## 比较目标

不是证明所有任务需要 Palimpsest。要确定哪类长期项目在正确性、成果连续性、独立贡献或人工协调方面获得足以覆盖额外复杂度的收益。P 结果差也必须保留。

### S08-R01 — 场景 A：Sablewick 可靠性与演化回归

复用已冻结 C6-R 事实，不把反复调试过的用例作为唯一智能基准。T1=2026-02-10T09:05Z 只显示当时公告/证书承诺/Newsletter；T2=2026-02-14T09:10Z 才释放更正候选 B 与 duplicate。初始世界有历史 accepted work，不预建本轮正确 Intake Task。项目模拟时间与运行 UTC 分开。

评价 Agent 发现 A、保留 unaccepted standing、辨认 Site B 风险、忽略无关消息、提出具体工作、独立批准、接受正确 Blob、继续 Work、新 Session 理解 A 上的历史负面与 B 的潜在改变。baseline 只能从等价事实开始，不得看到 P 产物。

### S08-R02 — 场景 B：新开放研究方案

使用 `scenarios/field-study/` 的合成环境研究项目（不是现实供应商/科学效果）。至少两个、目标三个独立角色分别研究设计、数据有效性、资源可行性。加入非平凡的新观察、目标约束调整、迟到结果和互相矛盾的结论。最终要给条件化可行研究方案或有依据的不可行结论，不是拼三份报告。

生成未在开发时调优的 holdout 变体；固定数据 seed/visibility/events。硬事实可机械判断；方案质量与不确定性需盲评/独立评估。编码 Agent 可看 oracle，受测 Agents 不得。

### S08-R03 — 强且匹配的 F/P

主比较 F=相同 DSH+Git/Markdown+正常 native Subagent/Workflow；P=相同认知能力+Palimpsest 项目功能。都获得完整合理 handoff、同事件时间、同数据、同模型版本、同授权机会和总资源上限。P 不能为突出 own branch 禁 native subagent 而 F 开启，反之亦然。若只能运行 single-Principal，则准确命名并不声称强多 Agent 比较。

### S08-R04 — 配对、冻结与反事实纪律

每个 scored cohort 前冻结代码/profile/scenario/operator policy/rubric。模型失败不取消另组；环境/额度失败记录 censored，不算能力失败。pilot 用于校准预算不与 confirmatory pool 混用。修代码后重测是新 cohort；不把历史好结果与新 F 拼严格受控比较。

为每一对预留足够预算，正式运行前测可见性/污染/权限。预算用完可结束为 exploratory/unpaired，不能称 superiority。增加 repetitions 需要预先规则与授权，不追分。

### S08-R05 — 真实行为分析管线

解析 raw Session 事件，区分 tool offered/called/accepted/executed/result generated/delivered/consumed/accepted into project。唯一事件按 session+sequence/digest 去重，不根据 overlapping PALIMPSEST_TURN summary 重复计数。分解 Bash 内部数据库访问、tool errors、重复查询、等待、恢复和人工修正。

提案与独立发现必须对应真实模型事件；deterministic test controller 不可扮演 Agent。产物可见原因来自 source ref/工具/版本，不索取隐藏思维链。

### S08-R06 — 评价实际业务和因果贡献

记录硬约束正确性、unsafe acceptance、safe reuse、redundant rework、goal unmet 保留、fresh recovery、人类必要审批与多余协调、actual costs、time-to-useful-progress。第二 Agent 的贡献必须有 source→finding→delivery→recipient action 的链；同源重复不计独立贡献。

对于 causal necessity，单个引用不足以证明，优先匹配的受限消融/对照；有限样本只可说 observed contribution，不说稳定因果优势。

### S08-R07 — 证据与 subject/time 一致

每个 rubric/outcome 记录 evaluated canonicalHead/sourceBlob、observationTime、run/model/profile/code freeze。负面对照改变 live tree 后，不能用最后工作树重建较早 accepted digest。manifest 校验字节，不证明来源标签正确；两者分别测试。小模型/不同 provider trial 不能混用，变更有 cohort ID。

### S08-R08 — 失败分类驱动修复但不无限扩张

分类 perception/discovery、context-selection、reasoning、proposal-shape、authority、execution、effect-recovery、environment、evaluator、provider、budget。只有 root cause 有 evidence 时修对应 owner。一次失败不能推导需要新 Router/Owner/Memory。每个修复都回归真实路径并保留原试验。

| Test ID | 对应要求 | Case / 期望 |
|---|---|---|
| T-S08-01 | S08-R01 | T1 无 B bytes/metadata，T2 release 未自动接受，原失败历史不覆盖 |
| T-S08-02 | S08-R02 | 新场景有相互作用的约束、独立来源、holdout 与 evaluator 隔离 |
| T-S08-03 | S08-R03 | P/F equivalence audit 对事实/能力/预算/授权无未解释差异 |
| T-S08-04 | S08-R04 | 不利 P 不取消有效 F；no quota 不发请求；不同 freeze 不混池 |
| T-S08-05 | S08-R05 | raw events 去重、错误类别与实际 tool catalogue 可复查 |
| T-S08-06 | S08-R06 | 无第二模型或只有复述时 synthesis 未通过；领域 negative 不等于失败 |
| T-S08-07 | S08-R07 | accepted vs final live tree 分离；摘要哈希正确但身份错仍被发现 |
| T-S08-08 | S08-R08 | 根因标 hypothesis/confirmed，修复与失效 case 对应，不扩张无关组件 |

**退出：** 两个可运行、独立冻结的 benchmark/acceptance programs；live 资源可用则运行至少匹配 pilot，资源不足则完整交付运行器和明确 blocked 分项。比较不胜出不是代码可以不交付的理由，也不允许宣称价值成立。
