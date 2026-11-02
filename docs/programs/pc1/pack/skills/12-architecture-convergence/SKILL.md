---
name: palimpsest-architecture-convergence
description: "决定新增接口、重构 owner、保留高级模块或处理架构冲突时使用。"
version: "1.0.0"
---

# palimpsest-architecture-convergence


## 方法

1. 写具体用户行为和阻断证据，不从新名词开始。
2. 查既有 owner、正常入口与 expert 入口，区分 missing implementation 与 missing composition/accessibility。
3. 比较三种方案：复用+修复、薄 facade/adapter、必要的向后兼容扩展。明确不实施更复杂候选的理由。
4. 本期有权完成正常工具、批准交接、上下文与协作接入，不以“以前只允许几行修复”为借口不做。新增 authority root 则不可自批。
5. 新字段说明 canonical owner/派生来源/生命周期/失效；不能为方便在 facade 复制 project truth。高级模块按默认/可选/研究分类，不因目录存在继续扩张。
6. 若行为可由强 DSH 同样完成，保留可替换执行接口，不用新 Runtime 强行突出产品。
7. 架构经验记录为带条件的 hypothesis，不自动改变评价标准或生产组织方式。

## 输出

短 ADR：problem/evidence/options/choice/owner/compatibility/security/migration/reject conditions。ADR 是本期可执行决策，不是默认等待批准的停工单。
