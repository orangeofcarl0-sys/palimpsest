# S02 — 收敛正常产品路径与模型工具面

依赖 S00/S01；目标不是新建 Agent Runtime，而是让普通模型无需调试 Palimpsest 才能工作。

## 用户结果

普通话语“继续项目”“检查这项结果”“需要谁批准”“请独立核对这个假设”“接受已审阅成果”可通过现有服务组成正确路径。默认工具少而连贯；专家能力仍可显式启用。模式与 authority 不混淆。

### S02-R01 — 正常/专家目录真的分离

审查 base tools 与 application tools 的双路径注册。默认不同时暴露冲突的 legacy next/claim/report/finish 与现代 facade，让模型自己猜工作模式。保留兼容入口但标记 expert，在 profile 中显式选择。必须有 tool-catalogue snapshot 测试；不能只改 README。

### S02-R02 — Placement-independent 完成体验

正常 work.complete/既有等价入口根据真实 execution mode 选择已有路径。Worktree 与 in-place 的完成不依赖模型自行猜 `finish` 能否用；错误模式给可执行 next action，不鼓励绕过。接口可复用 begin/finish/report/gate 的 owner，但自动执行产品负责的结构性观察，不能为模型补写未经观察的成功。

### S02-R03 — 稳定、简短、可展开的状态响应

每个正常 mutation/inspection 返回 result subject、canonical basis、状态、evidence references、阻断原因、所需角色、合法 next actions 与幂等/retry 指示。短摘要与可读取细节分离，避免每次返回全部 Event Log。保证 DSH lossless JSON 序列化，无循环引用、Date/BigInt 隐式漂移。明确只读 canonical 与可能持久化 derived observation 的区别。

### S02-R04 — VERIFYING 不迫使模型重建计划

当当前 Work 仍待接受且 quiescence 不允许 plan mutation，允许模型保存非权威的后续工作提议/Journal opportunity；接受结束后按新的 project basis 重新检查再应用。不得让 pending plan 自动获得旧批准；不得删除 quiescence guard。模型得到解释：“成果待接受；可提交后续候选，不可直接覆盖正式计划”。

### S02-R05 — Authority UX 真实可理解

ProjectIR decision append、task graph revision、source intake、goal/requirement revision、Promotion 各自呈现真实 authority。模型可见 status 不能被当批准。若 missing authority，返回可提交请求而非假执行。operator 端执行已有权限，不能使用 model-authored boolean `approved:true`。

### S02-R06 — 简单任务不强制完整治理

使用现有 involvement/work-mode 组合提供轻量读取/探索路径；无需 formal accepted state 的回答可直接交付，标结果地位。写入共享 canonical source、改变项目承诺或不可逆效果时升级已有 Work/批准要求。轻量模式不是安全绕过；未知风险默认显式边界。

### S02-R07 — 可观察而不要求内部数据库探索

project status/explain 接口足以获得模型正常决策所需的 Task、Result、接受/候选、权限和下一步。调试 raw SQLite/内部源码只允许专家模式，不能成为默认场景成功的必要步骤。现实模型仍越界探索时记录产品摩擦，不悄悄记为正常 tool 成功。

## 实施方式

先选最小 stable facade，画 public action→existing service→canonical owner 映射。修 `preview value is not lossless JSON` 等已观测序列化问题。对旧 profile 保持显式兼容与迁移提示。新 action 名称在 ADR 中固定；本规范逻辑动词不强制一个 tool 对一个 action，也不允许为每个底层状态增加 tool。

## 验收

| Test ID | 对应要求 | Case / 期望 |
|---|---|---|
| T-S02-01 | S02-R01 | normal profile 无重复/矛盾默认工具，expert profile 可访问原兼容入口 |
| T-S02-02 | S02-R02 | 两种 placement 同一用户目标得到正确 complete，不出现误导性 finish 建议 |
| T-S02-03 | S02-R03 | 全部正常 tool result 可 roundtrip 序列化，preview 不写 canonical 状态 |
| T-S02-04 | S02-R04 | VERIFYING 时 proposal 能保存但 plan 不生效；basis 改变后需重评 |
| T-S02-05 | S02-R05 | model decision/plan 不冒充 operator approval；缺 authority 有明确拒绝 |
| T-S02-06 | S02-R06 | 简单分析不创建多余 Work；同一 profile 不允许未批准 canonical 写入 |
| T-S02-07 | S02-R07 | 不读取内部 SQLite 的正常消费测试可走完 status→work→review |

**退出：** 普通 DSH profile、CLI/API、状态解释均连接到相同语义，提供可重复 golden path；不是一组未接入注册器的 TypeScript functions。
