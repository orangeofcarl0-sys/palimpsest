---
name: palimpsest-behavior-analysis
description: "解析真实 Session、检查 Agent 是否自然使用能力、分析工具摩擦与自主性时使用。"
version: "1.0.0"
---

# palimpsest-behavior-analysis


## 输入

原始 Session streams、request tool catalogue、Host/tool events、project event log、operator actions、artifact snapshots、runtime/version 与 evaluation window。

## 执行步骤

1. 按 sessionId + event sequence/稳定 event digest 去重。`PALIMPSEST_TURN` 是 summary，不保证互不重叠；保留其覆盖区间但不重复计数。
2. 建序列：offered → called → accepted → executed → produced → delivered → consumed → changed decision → accepted canonical effect。每项缺口明确，不把 queued 当 consumed。
3. 给行为打观察标签：discovery、source-standing、independent-analysis、proposal、authority-check、work-execution、verification、recovery、unnecessary-search、manual-correction。标签是分析层，不进入产品权限。
4. 分出模型决策、操作者决定、deterministic fixture 行为。任何由测试脚本补齐的任务目标不得归为模型 initiative。
5. 统计 tool errors、重复信息读取、Bash/internal SQLite/source inspection、context expansion、waiting、tokens 分项。错误恢复成功并不意味着接口无需改进。
6. 评判自然发现时检查初始 prompt 是否指名工具/答案、未来信息是否可见、模型是否读 oracle。污染 trial 不得评分。
7. 生成可复核的短行为时间线，不要求或引用隐藏思维链。对决策归因使用可见引用、tool results 与结果变化，不能从“提到某发现”推断必要因果。

## 输出

`behavior-events.jsonl`、工具调用分布、错误分类、source→decision 桥、人工介入账、结论和混杂因素。使用 schemas/behavior-event.schema.json。

## 自测

构造重复 summary、两 Session 同 sequence、仅交付未消费、controller 代替模型执行、provider 拒绝未调用五例；分析结果必须不同。
