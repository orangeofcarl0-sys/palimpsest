# 验证与交付原则

## 分离四种结论

- **代码实现完成**：功能连接到了正常产品路径，不是 stub。
- **确定性正确性验证**：实测状态、权限、幂等、恢复与来源约束满足要求。
- **真实 Agent 行为验证**：模型实际完成发现、提议、交接与接受链中的相应环节。
- **比较价值支持**：匹配的强 DSH 对照运行且有可解释优势；单次观察不能宣称统计结论。

最后三者不得由前一层推断。没有资金不妨碍完成代码，但会阻止“已证明协作收益”的宣称。

## 风险分层测试

每个产品修复至少有直接失败复现、正确路径、反例与邻接回归。涉及 authority/evidence/promotion 的变更还须重放旧数据、过期主体、重复请求与外部效果不确定。普通文案修复不必开启完整模型 campaign。

固定 Code Freeze 上完成 full selected suite 与明确排除清单。不得称 target green 等于全仓库 green。排除历史重型 gate 必须说明资源原因、原有资格与影响面；受影响安全 gate 不能被随意排除。

## 公平比较

至少两个场景：A 是 Sablewick 的状态/权限/接受回归；B 是新开放研究项目，测试独立贡献、矛盾、依赖变化与共同决策。P 与 F 同事实、同时间线、同模型/工具能力及授权机会。F 获得良好 handoff、Git 与原生 Subagent，不是空历史弱基线。

不要因 P 失败就取消 F；provider 或安全阻断是试验缺失，不是认知失败。一次运行有不利结果也保留；重测是新的 run。效应评估先固定 rubric 与隐藏 oracle，再运行模型。可先做 paired pilot，再按剩余已批准预算重复；不得追测到出现想要答案。

## 成本

报告 input/output/cache 分项、真实费用（有依据时）、人工协调、time-to-first-useful-action、等待/重试开销。不把缓存 Token 当同价 Token。预留整个 matched pair 的预算，并设置在途安全余量。在线计量必须校准 Session stream，不只 regex stdout。

## 最终交付

交付 RC branch、可安装 package（保持 private，除非另有授权）、说明、迁移 dry-run、恢复演示、正常工具目录、两场景运行器、验收 JSON、原始 evidence 与全量 diff 范围。CI 验证用户可见路径，而不是要求 evaluator 直接调用 private API。

正式发布与 main 合并不包含在本包授权内。必须产生 PR-ready review kit：base/head、所有 changed files、dependency/public API/schema 变化、回滚说明、现有风险以及 required CI 的结果/待执行项。
