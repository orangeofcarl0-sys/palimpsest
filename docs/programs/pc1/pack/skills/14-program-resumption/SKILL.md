---
name: palimpsest-program-resumption
description: "长期执行被中断、某阶段阻断或需要决定下一任务时使用。"
version: "1.0.0"
---

# palimpsest-program-resumption


## 方法

1. 读取 programme marker、HEAD/tree、工作树和最新 checkpoint，验证不是别人的分支/运行世界。
2. 从 requirements results 找 implementation/verification/behavior 三个维度，不把上一份“阶段完成”文案当全计划完成。
3. 选依赖满足、未完成的最高风险工作。模型资源阻断不影响安全的产品实现、场景和包装；安全阻断不允许对应效果，但独立节点继续。
4. 所有下游用真实前提判断；依赖测试失败的 effect 不能运行。可以先写/测隔离接口，不伪造前置 gate 通过。
5. 每个 checkpoint 写：已改文件、commit、实际 tests、未决 op、下一三个具体动作、允许命令、禁止动作、预算。不要只写“继续审查”。
6. 恢复时先观察 pending effect，不能重复原 action 产生副作用。要重跑模型就是新 run ID。
7. 最终只在全部工程 requirement 处理完才交 completion；未完时准确交接，不承诺无工具后台运行。

## 输出

program-state.json、CHECKPOINT.md、blocker graph 与 next actionable queue。沿同一主分支继续，不反复开新的研究阶段替代交付。
