---
name: palimpsest-context-continuity
description: "构造项目摘要、任务上下文、跨 Session 交接或控制历史检索成本时使用。"
version: "1.0.0"
---

# palimpsest-context-continuity


## 输入

当前 goal/constraints、project revision、accepted/candidate result refs、source changes、task need、权限、预算与历史索引。

## 工作步骤

1. 先定义本次需要作什么判断，再挑相关信息；不以“尽量多给历史”为目标。
2. 形成最小充分包：目标、硬约束、当前承诺、关键支持/反证、未决事项、允许动作、来源入口。每个结论带 standing 与时间/条件，不用摘要覆盖原事实。
3. 对长来源引用精确片段与完整 artifact 路径，按需读取。关键约束无法内联时显式 incomplete。保留模型继续检索新现实的能力。
4. 检查源谱系：多个摘要共享 root source 时不重复增加独立证据权重。缓存写时绑定 project/source digest；恢复时查有效性。
5. fresh-session 测试禁止旧 transcript；工具/文件路径实际不可见 oracle。区分新 session、旧 session resume 与新 owner。
6. 以 first useful action、遗漏关键约束、重复检索、错误继承和 token 成本评价，不只看摘要漂亮程度。

## 输出

context capsule、source lineage、coverage/omission record、rendered context digest、fresh-session behavior result。所有派生状态可从原 owner 重建。

## 反例

历史 A 在旧条件正确，当前 B 未接受；摘要不得写“A 错误、B 已生效”。正确写法分别保留 historical accepted 与 pending candidate。
