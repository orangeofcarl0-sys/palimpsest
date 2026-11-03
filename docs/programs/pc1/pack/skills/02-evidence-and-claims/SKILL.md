---
name: palimpsest-evidence-and-claims
description: "读取报告、审查成功声明、发现来源冲突或形成阶段结论时使用。"
version: "1.0.0"
---

# palimpsest-evidence-and-claims


## 输入

一个待判定 claim、其来源文件/行/事件、代码版本、运行版本、subject identity 与观察时点。

## 执行步骤

1. 把 claim 拆成可以单独判定的命题：能力存在、正常可达、实际调用、真正执行、被消费、实际接受、比较收益。
2. 建立来源分类：用户愿景 / 作者报告 / 实际源码 / 原始运行事件 / 独立复现 / 本次推断。上一轮助手的复述不是独立证据。
3. 检查 source subject：model 参数、canonical event、prepared action input、Git object、accepted head、工作树不是一个对象。查询其中缺失的连接。
4. 遇到矛盾，不用更流畅的叙述消除它。保留双方原文和身份，给 hypothesis/confirmed/refuted/unknown 状态，并指定最小决定性观察。
5. 写结论时限域。例如 deterministic Worker 的 D2 成功只能证明机制，不证明真实第二 Agent 已参与。
6. 发现历史错误，追加 erratum，说明旧结论、反证、影响范围、仍未知事项；不改 raw runs。

## 例子

“模型传入 f1536b8”只能证明 tool input 使用短 SHA。若 controller 观察并覆盖输入、Event 37 持有完整 SHA，就不能说 canonical identity 已短化。继续查 export 和 prepared action，而不是先改 parser。

## 输出

claim ledger：claim ID、source refs、scope、status、counterevidence、next decisive test。所有正式报告中的强断言都可回到 ledger。

## 完成检查

没有把 HASH_OK 当 semantic provenance 正确；没有把 report PASS 当业务结果；没有将 BLOCKED provider 写成模型失败。
