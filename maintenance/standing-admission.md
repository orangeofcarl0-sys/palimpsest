# 维护选择队列的跨轮有限准入

可信宿主可在已启用会话准入的 Maintenance Slot 中，给 `maintenance-selection` 签发一份有限次数的委托。委托在 SQLite 中按项目和模式登记，派发时消费。候选 SHA、构建摘要和镜像标识取自活动安装。启用时可用 `lineage` 进一步限制允许的安装，用 `ticketKinds` 限制工作类型。核准调用由宿主发起。

| 调用 | 输入与结果 |
| --- | --- |
| `grantStandingAdmission(grant, authority)` | 授权边界为 `project`、`mode`、`requestWindow`、`maxSessions` 和 `expiresAt`。操作人和依据取自 `authority.actor` 与 `authority.reason`。返回持久委托和完整标识。 |
| `standingAdmissionDecision(workId)` | 读取待处理工单的准入决定，成功返回 `admitted: true` 和 `delegation.id`，拒绝时返回 `{ admitted: false }`。 |
| `authorizeStandingSession(workId)` | 提前签发绑定工单、检查点、活动安装、请求窗口及委托的回执。签发后仍可撤销，次数在派发时扣除。 |
| `revokeStandingAdmission(id, authority)` | 写入指定委托的撤销记录。签发后、派发前撤销，会拦截已签发且未消费的回执。 |

`windowWithin(request, limit)` 对普通窗口和数字均采用请求在前。完整窗口包括三项正整数 `maxRequests`、`wallClockMs`、`requestTimeoutMs`，以及 `billingCeiling`。有限记账额只覆盖不超过它的正整数请求额度。`billingCeiling: null` 是无金额上限，`expiresAt: null` 是有限次数委托不设到期日期。

结构化策略读取 `evaluateStandingAdmission({ project, mode, active, job, delegation, priorSessions })`，将任务类型、版本和请求窗口与授权比较，并核对已消耗的次数及历史结算状态。位置参数入口 `evaluateStandingAdmission(grant, request, scope, workId, predecessor)` 继续返回决定或 `null`。有序工作项的后继须绑定前一项已验证的完整版本。

每次派发在同一个 SQLite 事务里复核回执和授权，记录一次消费并取得写者租约。重启和并行派发沿用同一记录。余额不足、撤销、安装不符及用量或归因未确认会拒绝新派发。

[GitHub 维护工单](../docs/engineering/GITHUB-MAINTENANCE-PILOT.md#打回自动准入与工单预算)继续沿用仓库、工单及授权链绑定，和维护选择队列复用窗口比较。打回续修继承原工单预算。累计 128 笔触发监督，256 笔硬停，显式封存的历史用量计入工单预算。
