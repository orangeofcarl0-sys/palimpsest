---
name: palimpsest-release-claim-audit
description: "生成 README、最终报告、RC、PR review kit 或评估整体成熟度时使用。"
version: "1.0.0"
---

# palimpsest-release-claim-audit


## 方法

1. 把每条产品声明映射到真实能力/测试/run/source。区分代码存在、正常组成、模型使用、项目效果、比较收益。
2. 核对文档中的 exactly-once、sandbox、parallel、durable、verified、autonomous 是否带实际范围。未验证的跨进程保证不能从 Session persistence 推出。
3. 核对所有 executable/fixture/evaluator 在 freeze 前、outputs 在 freeze 后，修代码后 cohorts 是否分离。
4. consumer install 从实际 tarball/bundle，而非源码 checkout 才可证明 packaging。测试升级/restore/doctor；不能删除用户数据来让初始化成功。
5. 汇总全量 diff/API/schema/dependency/permission 与必要 CI。main 未授权只生成 PR kit，不创建/合并。
6. 原始失败、无优势、provider blocked、角色混杂与 manual interventions 进入报告，不被漂亮 summary 遮盖。

## 输出

RC manifest、CLAIM-EVIDENCE-MAP、完整结果矩阵、已知限制、真实后续 owner 决策。最终推荐只有一个主方向，来源是证据而不是希望。
