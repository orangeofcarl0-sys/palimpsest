# S06 — 非编码任务、领域验证与负面成果

依赖 S00/S01。目标：让 Git 成为成熟 backend，而不是让文件存在性定义全部项目成功。

### S06-R01 — 三种完成地位同时可表达

输出至少区分 execution/delivery completion、declared Work acceptance、business/objective outcome。沿用已有 state owners，业务地位先作为带依据的 projection/评估结果，不默认新增全局 task enums。结果可为 supported、infeasible、uncertain、contested、partially fulfilled，具体值按可验证领域契约描述，不由模型自填高权威标签。

### S06-R02 — 领域验证契约可插拔且可审计

使用现有 Completion Standard/Verification/Proof 扩展点定义：问题、被评价 artifact/source revisions、required checks、verifier identity、权限、输出与适用条件。代码任务可用测试；数据任务可用 schema/constraints；研究可用独立审查与来源对照；开放方案可需要人类判断。不是每项 conclusion 都可机器判真。

不因文件后缀 `.md`/`.csv` 自动认定业务验证无须执行。需要既有 contract applicability 的修正时，应 additive opt-in domain contract，并明确旧版本行为；不能全仓库改规则让历史效果失去解释。

### S06-R03 — 结构性与领域证据不互相冒名

scope/artifact/command evidence 来自 S01；领域质量由独立适当机制评估。通过 node verify 数据格式不能证明供应商合规；研究者自评不是 independent validation；hash 只证明字节身份。接受结果要说明接受的用途和保留条件。

### S06-R04 — 负面发现是一等可用成果

设计两个 Task：A“调查并报告是否可行”；B“实现满足约束的方案”。相同 infeasible 结论可使 A 合同完成，但不能使 B 的业务目标完成。保留 source、constraint、time、negative reason 与可触发下一步的 open question，不自动改 goal 或创建大量新任务。

### S06-R05 — 非 Git 来源可引用、可版本化

至少支持一个通过现有 External Assets/Proof 输入的非代码来源（immutable document/dataset revision），保留 source identity/digest，不将它强制包装成 fake Git Commit。正式接受/修改来源必须经其实际 owner；若当前不能对外写，仅提供 read/intake candidate 能力，不伪装所有外部副作用已受保证。

### S06-R06 — 独立性与失败可观测

Verifier 的输入、范围、工具和结果独立保存。不可由同一个生成器修改隐藏 Oracle 后验证自己。对于模型评审，明确 provider/model、prompt、blindness 和其局限；单次评分不是客观真理，分歧可保留。不记录隐藏 chain-of-thought 作为证据。

### S06-R07 — 业务 outcome 贯通产品视图

Workspace/status/handoff 应同时显示“分析已完成、Site B 目标仍未满足、候选更新未批准”。下一位 Agent 不必从整份报告猜状态。模型可以记录新的 negative/open question，但 authority 来自既有接受链。对没有领域 verifier 的任务，不显示 verified true。

| Test ID | 对应要求 | Case / 期望 |
|---|---|---|
| T-S06-01 | S06-R01,S06-R04 | 同一负面结论在调查与履约任务中有正确不同解释 |
| T-S06-02 | S06-R02 | 文档任务显式领域 contract 被实际执行，不因后缀静默跳过 |
| T-S06-03 | S06-R03 | files_exist/tests_pass 不能代替领域结论；输出说明证明范围 |
| T-S06-04 | S06-R05 | immutable non-code asset 更新版本后旧结论有可追溯身份 |
| T-S06-05 | S06-R06 | generator 不能写 oracle；评审失败/冲突不抹去 |
| T-S06-06 | S06-R07 | fresh view 正确保留 accepted negative 与 unmet objective |

**退出：** 两个产品场景可在既有 owners 下表达领域正确性，而不是把外部 rubric 脚本的 PASS 冒充产品已具备领域验证。S08 可以额外独立评价产品，但不应代替实际产品约束。
