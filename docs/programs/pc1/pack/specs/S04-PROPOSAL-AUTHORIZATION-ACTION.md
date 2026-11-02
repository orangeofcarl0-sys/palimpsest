# S04 — 从 Agent 提案到合法、真实的项目进展

依赖 S01/S02/S03/S06。必须交付正常产品可用的提议—审查—执行交接，而不是只让测试 Operator 会调用内部服务。

### S04-R01 — 有来源、可审查的行动候选

Agent 可以通过既有 Journal opportunity 或新增薄 facade 生成 proposal。最低内容：目的、受影响目标/要求、来源与 digest、project basis、具体 action、write/effect scope、风险、依赖、预期交付、所需角色。允许人类澄清，但需记录修改内容和介入成本。proposal 是非权威 artifact，不能自己把 task/source 改成 accepted。

### S04-R02 — 精确的 review package

提供正常 operator UI/CLI/API 的 review preview：对比现状与候选，展示已知影响、不确定性、scope、费用与所需批准。approve/reject/request_changes 明确分开；批准绑定精确 proposal/source/basis digest，不是一个永久 `approved=true`。不要发明第二个批准账本；优先复用 ProjectIntent admission、已有 Work/Promotion authority 或现有 operator action 记录。必要的 UI 审阅 metadata 必须不拥有 canonical effect 权限。

### S04-R03 — 不同授权类型不能混用

Task Graph 普通规划、业务要求修订、Source Intake、Result Promotion、外部不可逆效果分开。模型可创建计划不等于有权接受 source；record decision 不等于外部 stakeholders 批准。normal Host 缺少 Project Intent authority 时可 prepare/preview，但 apply 必须拒绝；operator 可以在已有合格 authority 下执行。

### S04-R04 — 审批前后 currentness

review 前、执行前检查 project/source/proposal 精确身份。候选变动或目标变化使旧批准失效。批准与 effect 间的 race 通过既有 CAS/版本 fence 保护。重复批准、重复提交和 delivery 重放不得产生两次 Work/Promotion。rejected candidate 的后续 session 不应把它当已接受。

### S04-R05 — 使用已有执行链，不在 Controller 外代办

approved proposal 进入合法 plan revision/Opportunity promotion/Work start。执行结果走 S01 观察、export、Gate、Promotion、Head reconciliation。用户可看到 Job/Attempt/Result/acceptance 不同阶段。`DELEGATED` 不是完成，必须追到 terminal 或真实 pending reason。background completion 不能在旧 Session 结束后静默丢失，使用既有 durable path/明确 pull resume，不伪称非持久 host job 自动恢复。

### S04-R06 — Source Intake 真正绑定批准内容

对文件候选，独立 verification 读取获批准的 immutable candidate 和 resulting Git blob，检验 exact bytes/digest 与 path scope；不能仅靠 Worker 自己说“复制成功”。resultCommit/acceptedHead/workingTree bytes 分开。批准 A 后收到 B 不可沿用 A 的权限。通用非文件来源按同等 source revision 合同适配，不建全新 source authority。

### S04-R07 — 保留负面成果与未达成目标

分析可正确完成并得 infeasible/uncertain。正式结果应说明调查完成状态与业务目标状态，关联负面 Journal/Open Question/下一步候选。accepted analysis 不自动授权要求放宽、采购或销毁旧成果。下一步由 Agent 或人类提出，系统不对所有 negative 自动增殖 Task。

### S04-R08 — 真实 proposal-origin 追踪

记录谁提出、谁完善、谁批准、谁执行、谁验证、谁接受。测试驱动器若改 TaskSpec 必须作为 operator intervention；不得把 deterministic seeding 记为 Agent 自主发现。用户选择缩小范围是合法结果，但其代价和原因必须可见。

### S04-R09 — 正常操作员 Intent Admission 接入

必须提供把已确认操作员决定接入既有 ProjectIntentAdmissionPort/同等现有 authority 的正规适配，而不是永远让 expert-only API 缺 port。身份、用途、proposal digest、授权范围和 currentness 需显式配置并在运行时验证。该 adapter 不创造自有授权，不把任意 UI 点击或模型文字当全局权限。首次无授权安装可只读/prepare；合法操作员完成配置后，端到端 apply/revision/后续工作可用。若当前用户身份基础不足以合法组成，交付适配与测试、列明外部身份阻断，不把 UI badge 称正式授权。

## 产品验收操作

使用普通 profile：Agent 发现新 source → 保存 proposal → operator 查看精确 diff → approve → Work → review result → accept → 新 Session 显示新状态。再运行 stale candidate / reject / duplicate / missing authority / failure-after-open 五个负面路径。全部不读取内部 SQLite，不写假的 ledger record。

| Test ID | 对应要求 | Case / 期望 |
|---|---|---|
| T-S04-01 | S04-R01,S04-R02 | proposal 自动形成可 review 包，缺关键信息显式不完整，不补造 digest |
| T-S04-02 | S04-R03 | plan/decision 不能越权替代 source/intention acceptance |
| T-S04-03 | S04-R04 | 批准后 source/basis 改变拒绝旧效果；并发与 duplicate 幂等 |
| T-S04-04 | S04-R05 | approved work 到 terminal/promotion，restart 可准确读取 pending |
| T-S04-05 | S04-R06 | Worker 写错内容/多写路径时 independently fail，即使文件存在和命令成功 |
| T-S04-06 | S04-R07 | negative accepted analysis 与 unmet goal 同时可见，不自动放宽要求 |
| T-S04-07 | S04-R08 | model proposal 与 operator rewrite/decision 可分别统计 |
| T-S04-08 | S04-R02,S04-R05 | 用户无需 private API 即可执行合法交接；无法授权时可完成候选工作而无假效果 |

| T-S04-09 | S04-R09 | 明确 operator authority 组成后真实 Intent apply；无 authority、错 digest、过期授权仍拒绝 |

**退出：** 这条链进入 CLI/已有 web/DSH 正常入口，操作员不用编写一次性 JS。新 authority root 仍不可私自引入；若具体 Intent 效果缺失 authority，只阻断该效果，完整交付现有 Work approval 路径。
