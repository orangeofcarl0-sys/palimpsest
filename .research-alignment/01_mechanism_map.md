# 机制到实现

本任务是执行系统资格，不是物理仿真；“作用机制”指请求、进程、文件权限与状态提交的可观察因果关系。

| 机制 | 合同 | 实现 | 近端观测 | 区分反例 | 结论边界 |
|---|---|---|---|---|---|
| 请求预留 | C + R + b <= session/cohort ceiling | execution_budget.mjs + bounded_provider.mjs | RESERVED 在 POST 前持久化；refusals 记录拒绝操作数 | 并发进程、晚 usage、中断、坏账本 | 只有 Mock 的 b 已获可执行资格 |
| 实际隔离 | 本次 container ID 的部署事实决定资格 | container_runtime.mjs + container_bridge.mjs | 实际 network/user/mount/canary/文件摘要 | 旧 JSON + host adapter；占用端口；无外部路由 | 信任 host/Docker，不承诺防管理员篡改 |
| World 可读 | basis/result Git 对象与产品观察一致 | world_preflight.mjs | alternates、cat-file、diff/status、observedHead | 复制的 Windows 绝对 alternates | 仅被测 recorded sources |
| Head 准入 | 部署 Operator + IN_SYNC + 当前 Git 事实 | head.ts；unseen_inputs.ts 提供观察；controller 原事务 | approval/revision 成对；提交前复核 | CONFLICT、无权限、HEAD 变化、权限失效 | 最后读 Git 后的外部写入仍需后续 fence 检测 |
| 行动提示 | Direct 成果须有可归因的准入事实 | read_model.ts + work_state.ts | 关联 approval/revision | 初始 IN_SYNC 无 Direct 提示 | 不判断用户业务成果是否完成 |

完整解释与证据见 [资格报告](../docs/engineering/PNWF-CQ-R1-QUALIFICATION.md)。
