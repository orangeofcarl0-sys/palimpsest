---
name: palimpsest-experiment-design
description: "预注册模型实验、选择强基线、建立评分规则或分析比较结果时使用。"
version: "1.0.0"
---

# palimpsest-experiment-design


## 方法

1. 明确 primary hypothesis（认知发现/连续性/协作增益/可靠性），不要用一项指标代替全部价值。
2. 配对 P/F 的目标、事实、事件时间、历史、模型、tool 能力、scope、operator policy 与预算。原生 DSH 拥有合理 Handoff 和 Subagent。
3. 冻结 oracle/score/code/runtime 后运行；oracle 与未来事件在模型环境不可访问。初始条件 digest 在运行前比对。
4. 预留整个 pair 资源；一个条件表现差不取消另一条件。provider failure 是缺失数据，not cognitive failure。
5. 划分 pilot、scored、assisted diagnostic、rerun cohorts。不能将不同模型/冻结/辅助提示的结果当同一个 A/B。
6. 硬约束用机械 checks，开放质量用 blind evaluator/人工评审；记录盲法缺失与样本小。对负面研究成果评估价值，不一律打失败。
7. 留下所有失败、truncated、invalid contaminated、blocked；明确哪些数值可比较。成本只对等工作量比较，cache 分项。
8. 新机制无优势时允许删默认步骤或停止扩张，但不删除测试证据。

## 输出

preregistered protocol、equivalence audit、pair reservation、score rubric、validity classification、confounds、qualified conclusion。不能用 N=1 宣称稳定 superiority。
