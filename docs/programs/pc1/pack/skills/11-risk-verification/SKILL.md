---
name: palimpsest-risk-verification
description: "制定测试范围、检查安全回归、判断是否可以集成时使用。"
version: "1.0.0"
---

# palimpsest-risk-verification


## 方法

1. 从 changed files 建 effect/authority/consumer 图。标普通文案、组合、持久数据、证据资格、外部效果、权限六类风险。
2. 每项 requirement 对应 happy、negative、boundary、replay、concurrency 中相关测试。必须记录 subject/effect 真值，不只 mock 期望函数调用。
3. RED 必须解释本期修改前实际失败；已有 bug 不能借新测试同时改变 fixture 规避。关键故障需要真实 Git/数据库/进程可观察的集成测试。
4. authoritative run 前检查 Node/Python/runtime dependency；串行通过不证明并发安全。保留原 parallel failure，原因未知就写 unknown。
5. broad selection 在运行前固定；列 exclusions 及风险理由。target green 不得冒称全仓库 green。
6. API/schema migration 检查旧 log replay、new acceptance qualification、回退、duplicate。架构 ratchet 新 exception 需要实质理由，不为让 CI 绿就改 baseline。
7. 对 protocol/代码/环境修复分别测，防止把 environment workaround 称 production bug 修复。

## 输出

test-plan、case→requirement mapping、命令/exit/log/digest、failures register、integration qualification。完成标准与实际检验范围一致。
