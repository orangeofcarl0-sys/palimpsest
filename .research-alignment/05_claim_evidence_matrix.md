# 主张与证据

| 主张 | 直接证据 | 强度/边界 |
|---|---|---|
| Mock 请求在发送前受 session/cohort 额度约束 | budget-tests；container-final 的请求/refusals/Mock 次数 | established，仅 Mock 合同 |
| 未知 usage 不成为零费用，也不允许下一 session | 中断/超时/缺失 usage/坏账本反例及 held reservation | established，在被测故障范围 |
| 旧 JSON 或端口监听不能冒充资格 | runner 负例、HMAC 反例、占用端口测试 | established，信任 host 控制面 |
| 本次 principal 实际隔离且 copied Worlds 可读 | container ID 绑定的 canary 与 world_preflight | observed，被测 image/config/source |
| Operator/Head 在最终 owner 复核 | Basis 权限与 before_commit 故障注入 | established，不承诺 Git/SQLite 跨系统原子性 |
| Direct 可进入真实治理链 | basis-vertical-final.json 两 PID/两个 completion/一次 promotion/新 basis | observed，确定性 Worker，不是模型自主性 |
| 普通初始 IN_SYNC 不暗示 Direct 成果 | Basis fresh-governed 负例与真实 admission 正例 | established，提示由 canonical 事件派生 |
| 跨 Host 不虚构退出且 principal 可完成 | pnwf_cq_action_coherence 两个回归 | established 的是诚实归属；强静止性 unresolved |
| 真实 paid Provider 已有硬上界 | 没有资格证据；runner 明确拒绝 | unresolved，禁止宣称 |
| 历史 cohort 有效或产品收益改善 | 与历史 OVER BUDGET 相矛盾；本轮无模型样本 | 不成立/未测试 |
