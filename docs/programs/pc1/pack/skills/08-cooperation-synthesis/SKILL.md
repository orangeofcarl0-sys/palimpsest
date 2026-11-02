---
name: palimpsest-cooperation-synthesis
description: "设计独立 Agent 任务、处理交接/冲突、检验真正协作收益时使用。"
version: "1.0.0"
---

# palimpsest-cooperation-synthesis


## 判断是否需要协作

识别缺口：独立证据、互补领域、同一假设的复核、可独立并行执行。简单重复同一问题不自动增加价值。能自己处理时允许不委派。

## 方法

1. 记录执行者类别与权限：native subagent、Reasoning Branch、Managed Work、durable peer。给 task/input/basis/output/budget 明确边界。
2. 分离初始认知材料，确保独立性不是只换了 Session ID；不同 Agent 共享来源必须显式记录。
3. handoff 返回结论、支持与反证、假设、风险、需要决策、完整产物入口。不要要求复杂研究只回一句话，也不要传全部日志。
4. 接收方实际消费后记录它改变了什么选择/计划/要求；如它独立 web search 获得同结论，应标 co-cause。
5. 分歧可保留，启动定向检验或请求人类取舍；不强制多数票/自动 promotion。
6. 验证 delay、cancel、duplicate、restart 后的交付与权限；结果能读取不等于能采用。
7. 额外 Agent 没贡献也作为有效观察，测算其成本。不得以“生成了不同内容”定义增益。

## 输出

handoff receipts、source independence map、conflict decisions、cross-agent influence ledger、行为 vs.机制判定。使用正式 result refs，不增殖影子知识库。
