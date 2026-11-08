# 来源、证据等级与设计边界

制作时间：2026-11-02。本文档包主要依据用户的项目历史、上传总体反思报告、本地 Agent 执行报告，以及本次经 GitHub 连接器读取的冻结源码。**本包是实施设计，不是已经实施完成的报告。**

## 来源等级

`USER_INTENT` 用户目标/授权；`USER_REPORT` 用户提供分析或执行报告；`CODE_READ` 本次实际读取源码；`REMOTE_IDENTITY` 本次实际读取远端；`PRIOR_AUDIT` 会话中先前审查的观察，待本地核验原始材料；`PROGRAM_DECISION` 本包提出的新规范；`HYPOTHESIS` 需要复现的解释。

| ID | 来源 | 支持范围 / 限制 |
|---|---|---|
| U1 | `inputs/Palimpsest_总体分析反思报告.md` | 原始反思，保留术语、经验与证据限制；不是当前产品审计 |
| U2 | `inputs/本地Agent-C6R执行报告.txt` | 原始执行叙述含多个 campaign/根因演变；不能把末段诊断自动当证明 |
| U3 | 当前用户指令及最近总体反思 | 要求新 branch 全面实施；不继续递归 Top-Down/Bottom-Up 架构；连续推进而非逐 Gate 停工 |
| R1 | GitHub branch `palimpsest-c6r-behavioral-qualification` | 本次读取 HEAD=`044b080...`、tree=`1b7caa...`；运行时须重核 |
| R2 | GitHub branch `main` | 本次读取 HEAD=`044330b...`、protected=true；具体 active ruleset/CI 执行时重新读取 |
| C1 | `src/tools/controller.ts` @ base，2250–2385 | report 以真实 observedHead 覆盖 caller resultCommit；不支持仅凭输入短 SHA 宣称 canonical 短化 |
| C2 | `src/tools/work_evidence.ts` @ base，195–286 | command evidence 可携 predicate；存在需要端到端验证的 producer qualification 问题；不能仅凭这一段断言所有接受已被绕过 |
| C3 | `src/deployment/execution_world.ts` @ base | 现有 object-only export seam、world 生命周期；不自动证明 legacy 路径一定调用它 |
| C4 | `package.json` @ base | package 0.1.2/private、Node>=24.15.0、构建/架构/consumer scripts、Ordarium pins；不是所有平台验证 |
| A1 | 本对话此前多轮 Git/模型证据审查 | Event37 完整 SHA、Result Export/路径/recovery 假说、P1 行为统计；本期应核验其原始 frozen artifacts |
| D1 | 本包 S00–S10、schemas、skills | 新的规范/实现方案，不是已有 API 或已经运行的结论 |

冻结基线：`044b08056a0e98b7d7cee207cb36fb7e453907fe`。

以下源码链接指向归因改写后与冻结基线文件树一致的提交。

- https://github.com/orangeofcarl0-sys/palimpsest/blob/a9d8b19540573bdb56fc85439866257535c2d46d/src/tools/controller.ts
- https://github.com/orangeofcarl0-sys/palimpsest/blob/a9d8b19540573bdb56fc85439866257535c2d46d/src/tools/work_evidence.ts
- https://github.com/orangeofcarl0-sys/palimpsest/blob/a9d8b19540573bdb56fc85439866257535c2d46d/src/deployment/execution_world.ts
- https://github.com/orangeofcarl0-sys/palimpsest/blob/a9d8b19540573bdb56fc85439866257535c2d46d/package.json

## 这次没有重新做的事情

没有 checkout/运行整个 Palimpsest，没有独立重放全部 C6-R Session，没有核实上传反思引用的所有外部文章，没有验证同类项目在生产环境的效果，也没有创建新仓库分支或执行产品修改。

上传报告引用的《00_合集.md》、审稿人全文、Mario X 原帖并未作为独立原文在本次可见文件中出现。本包只能把它们作为 U1 已注明限制的二级来源，不假装已经阅读全文。

## 用户最后指令对范围的修订

U1 曾建议下一阶段收窄研究；用户之后要求完整实施总体反思并看结果。因此本包扩大**工程交付范围和持续推进授权**，但不把自适应元架构、通用新 Runtime、任意外部接受权或未经证明的智能优势纳入默认范围。这个调整是显式 programme decision，不是改写 U1 原文。

## 引用纪律

实现 ADR 与最终报告应引用 exact source/ref/event/run。源码证明实现意图与路径，运行证明实际行为，比较试验证明限定条件下的差异。任何一层都不能替代另一层。
