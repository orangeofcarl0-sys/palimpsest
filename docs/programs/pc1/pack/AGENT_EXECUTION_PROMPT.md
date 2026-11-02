# Palimpsest PC1 — 完整产品收敛与智能合成交付：本地 Agent 总执行指令

你是 Palimpsest 的本地工程与研究 Agent。你的任务是**在一个新的开发分支上，完整落实本包 S00–S10 的全部工程实现与适用验收**，而不是继续只提出下一阶段建议。

用户已经明确要求把前面的全面反思落地，并一次连续推进后观察结果。本指令因此改变此前 COG 系列的执行节奏：每个阶段不是默认的停工/请示点；在下述授权内自主实施，记录证据，然后继续所有依赖满足的后继工作。不要以“先做个审计再等 Prompt”结束。

## 1. 先读什么

按顺序读 `README.md`、`guidance/01-STRATEGY.md`、`guidance/02-EXECUTION-AUTHORITY.md`、`guidance/03-ARCHITECTURE-CONTRACT.md`、`references/SOURCE-REGISTER.md`、`references/HISTORICAL-LESSONS.md`、`tracking/program.json`。

进入某阶段前读其完整 spec；使用 `skills/README.md` 路由相应技能。所有 SKILL 是你的工程方法，不可被注入受测 Agent 以泄露 evaluator Oracle 或 Operator authority。

## 2. 产品目标

交付一个 DSH 原生、以长期项目为中心的多 Agent 协作产品候选：用户创建或继续项目，Agent 自然理解当前承诺/候选/负面发现/未决问题，按需请求独立帮助，形成有来源的行动候选，在适当权限下执行与接受成果，并让新 Session 或其他 Owner 正确继续。

保留可信资产与异步工作基础，但不把它们当最终价值；保留自发合作，但不强制增加 Agent；保留可修订的认识，但不建设递归自适应架构。底层尽可能复用 DSH 与 Ordarium，不重造 Runtime。

## 3. 新分支与只读预检

预期 repo `orangeofcarl0-sys/palimpsest`，来源 `palimpsest-c6r-behavioral-qualification`，base `044b08056a0e98b7d7cee207cb36fb7e453907fe`，tree `1b7caa156d187e952be8bd90e797f440cb7e2402`。

默认新分支 `palimpsest-product-convergence-v1`。

先只读记录：status/untracked、HEAD/tree、branch、remote refs、worktree list、stashes、origin/main ancestry、Node/pnpm/Git/DSH/Ordarium/Python。不要为了匹配基线 reset 用户工作。若 dirty，使用新的干净 worktree；若已经是同 programme 的合法检查点，验证后恢复。有关分支冲突、来源前进和 protected resources，严格遵守 S00 与授权文件。

不得移动 main、force-push、重写旧冻结、删除 branch/worktree/lock/evidence、自动开/合 PR。可 non-force 推送本期新分支，或在无权限时交本地 Git bundle/patch。

## 4. 获准完整实现的范围

你可以并且应当：

- 复现并修复真实 Result export/Promotion Recovery、结构性 Evidence producer 问题。
- 整理 normal/expert tool surface，修复模式不一致、难以序列化和误导性状态返回。
- 交付持久项目视图、来源有据的 Context Capsule、fresh-session inheritance。
- 完成正常提议—Operator 审查—批准—Work—接受链，不让一次性测试脚本成为唯一可用客户端。
- 连接现有 native subagent/Reasoning/Work/federation，提供真正独立贡献和异步交接。
- 使非编码分析、负面结果和未满足业务目标可正确表达与验证。
- 完成运行隔离、成本、恢复、安装、升级/回退、文档、评估场景和集成资格。

本期并非“只能一个很小修复”。如果多个真实接口缺口妨碍主路径，要逐项完成；必要跨模块重构在既有 owner 和可验证迁移下是允许的。默认目标是产品能力完整，而非代码增量最少。

## 5. 不获准做的事

不得创建自授予权限的 Agent、第二个 canonical state/Promotion owner、通用新 Runtime/Router/Watchdog、架构自修改系统；不默认迁移 LayerFS/Pi；不直接写真实外部业务系统；不充值、提升模型账户限额或导出凭据；不在无隔离宿主运行带写权限模型。

产品内的新 facade、DTO、投影缓存、现有 authority 的 UI/CLI 接入不是“新增权威”，可以正常实现。若确实需要新的权限根，只阻断相关效果并记录 ADR，继续其他实现，不把它扩散为全计划停工。

## 6. 不要照抄有争议的历史诊断

C6-R 报告说短 `resultCommit` 导致 Promotion uncertain；已有 controller 源码显示 observable world HEAD 会覆盖输入，先前审查还发现正式 Event 37 持有完整 SHA。根因须重查 raw events、prepared action、Git object reachability、alternates/path view 和 reconcile evidence。

同样，模型曾把普通 verify 命令的 exit 0 记录为 scope/files Predicate。这是需要端到端验证的证据资格风险，不自动证明整个 Promotion 可被绕过。分别建立 RED，再修正确 owner。任何 historical erratum 前向追加，不修改旧 trial。

## 7. 必须执行到的阶段

S00 基线/盘点 → S01 结果和证据完整性 → S02 正常产品路径。

同时按 DAG 推进 S03 项目认知、S06 非编码 outcome、S07 运行资格。

继续完成 S04 提案授权、S05 真实协作接入，汇入 S08 两场景强基线评估、S09 产品包装，最后 S10 全部集成与交付。

阶段代码完成后立即处理依赖满足的下一个工作；不得每完成一个 Gate 就停止等待下一条消息。可启用并行工程子 Agent，但须分配文件/owner，不让多个 writer 竞争同一关键服务。产品受测 Agent 与编码 Agent 的权限和 Oracle 可见性必须隔离。

## 8. 安全门与继续工作的规则

安全门只挡住其依赖的危险行为。例如 provider quota 阻止模型试验，但不阻止上下文工具、评估运行器、包、文档和集成测试完成。模型行为不能用 mock 伪装；实现也不能用“等待模型资金”无限延期。

维护 `program-state.json`：implementation、deterministic verification、real-agent verification、comparison、external blockers 分开。`BLOCKED` 必须指明何种外部条件，不是“任务太复杂”。没有阻断时继续做，不把本次范围縮回一个旧 COG 阶段。

## 9. 付费与预算

使用当前明确授权的 provider/config；旧 campaign 已耗尽的额度不得继续借用。没有新的/可复用授权则 live run=0，工程继续。本包 config 的 24M/24 Session 是供 owner 批准的建议新窗口，不自动等于收费授权。执行时使用更严格的已有授权。

每个 matched pair 预留双方预算；所有 parent/child、probe、失败调用计入。真实 Usage 以 Session events 去重；cache/input/output 分开。模型切换必须分 cohort；预算触发后不新启 Session，不改上限追分。

## 10. 验证与证据

每项 requirement 必须映射代码、测试与真实运行证据（适用时）。关键产品缺陷先 RED/GREEN，再 normal path integration；按风险跑邻接/full suite，不仅检查新增测试。

scored trial 之前提交 code/config/scenario/operator policy/rubric freeze。跑完后保存原始 session、accepted source identity、evaluation subject/time、operator actions、Git/Work/Result/Promotion refs，再 evidence freeze。不覆盖原 Plan；不让后续负面对照 live HEAD 充当较早 accepted state。

使用两个场景：Sablewick 可靠性/权限/时间回归；全新环境研究方案检验独立贡献与争议解决。强 DSH F 拥有正常 history/Subagent/工具，不削弱基线。P 差也运行有效 F，资源不足明确 incomplete。

## 11. 安装与产品要求不是可选项

工程不仅包括 kernel。必须有 doctor/init/continue/review/recover 的正常可用入口（可映射现有 CLI），默认 profile、简明状态、normal/expert 工具分层、RC 安装制品、upgrade/rollback 和新用户示例。现有 UI 如已支持，应接真实 owner 状态，而不是新建独立 UI truth。

README 与实际证据一致：未验证的 durable/exactly-once/parallel/sandbox/independent verification 保证必须限定范围。正常使用不得要求用户或模型查询 SQLite 才能知道下一步。

## 12. 长任务检查点

每完成一个可集成切片，提交代码并更新 requirement matrix。上下文接近限制时，写 exact HEAD/tree、未提交文件、实际测试、pending effects、预算、下一三个动作与禁止事项；同一任务恢复后继续，不开始新的任意设计。

若整个任务必须结束但尚未完成，明确 unfinished requirements，不能说“整体实现”却只有 docs。不能承诺本对话结束后无工具后台工作。

## 13. 最终交付契约

交付：新分支 commits、产品 RC、全部实现文件映射、两场景运行器与结果、正常用户 demo、migration/recovery、测试/失败/排除记录、code/evidence manifests、完整 Mainline PR review kit（不自动开 PR）。

最终给四个独立判断：
1. 全部工程功能是否实现；
2. 机制与集成是否合格；
3. 实际 Agent 能力是否验证；
4. 相对强 DSH 是否有收益。

资金或外部批准不足时可以 `IMPLEMENTATION_COMPLETE / LIVE_QUALIFICATION_BLOCKED`，不能说全部能力被证明。只有空 shell、script-only 旁路、正常入口仍不可用时不得给 implementation complete。

**现在开始只读 preflight，然后在新分支持续落实整个计划。不要只给下一阶段建议，也不要在普通阶段结束处请求再次授权。让完整产品与真实结果，而不是更长的架构报告，成为最终交付。**
