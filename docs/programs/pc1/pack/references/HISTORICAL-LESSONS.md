# 历史经验转化为本期工程要求

本表不是新的产品事实库。`历史报告` 与 `已复核源码` 区分；完整性以本地读取 frozen artifacts 为准。

| 历史现象 | 应保留的经验 | 本期落实 |
|---|---|---|
| COG-1 保存知识但模型不能读正文 | persisted ≠ reachable | S02/S03 正常工具读取与正文/来源入口 |
| COG-2 中性 Principal 不读 Journal，计数提示后读取 | reachable ≠ activated；少量可信上下文可能有效 | S03 context 预算/发现路径；S08 不把调用次数当质量 |
| COG-2 强 Markdown 同样完成规划 | 文件基线很强 | S08 公平 F 与等价历史 |
| COG-3 read-enabled Branch prompt 声称只有一个工具 | tool catalogue 与 prompt 必须一致 | S02/S07 能力声明契约测试 |
| Branch 把文件路径填成 Evidence ID | citation、artifact 与 authoritative evidence identity 不同 | S01/S05 typed refs 与结构校验 |
| COG-3 P 比 F 多一轮，F truncated | 不等工作量不能推成本倍数 | S08 phase matched、censored cases |
| Cold resume 使用相同 Session | Session persistence 不等于 fresh-agent inheritance | S03/S08 真正新 home 与 Session |
| COG-4 Expert precise read set vs product whole repo | test instrumentation 不等 first-party authority | S01/S03/S08 证据类型标记与 conservative policy诚实呈现 |
| Live Git HEAD 与 ProjectIR 分叉 | 观察变化不授予 execution basis | S04 lawful source intake，不删 HEAD_BASIS_MISMATCH |
| COG-5 接受结果和自己写的文件冲突 | 变化区间必须沿 verified promotion lineage | S01 acceptance/source identity 回归 |
| COG-5 ResultCommit≠AcceptedHead、CRLF≠Git Blob | 身份与字节表示分开 | S01/S08 committed blob provenance |
| COG-6 Reopen 写死 revision 0 | 长期项目会合法修订 | S01/S04 非零/多次 revision 与 concurrency 测试 |
| Candidate B 提前可见/最终 tree覆盖 accepted摘要 | 事件时间与评价世界分开 | S08 staged visibility 与 evaluatedSubject |
| C6-R P1 真实发现并提议，Promotion uncertain | 智能判断成功不等执行闭环 | S01/S04 complete path 与归因复核 |
| 旧报告将短输入归为 canonical 短 SHA | fluent diagnosis 不能代替原事件 | S01-R01、skill02/04 |
| 模型用同一 exit-0 命令生成结构性 predicate | 证据语义要匹配真实观察 | S01-R05、skill05 |
| 126 calls、多 Bash、SQLite 探索和模式误用 | 能恢复错误不等产品经济自然 | S02正常表面、S08摩擦/介入指标 |
| Model quota/budget 未完成 F | blocked 不等 baseline 失败 | S07 pair reserve、S08 preserve missing |
| 研究分支长期未合 main | 研究验证与发布资格不同 | S10 全量 diff/RC/PR kit，不自动 merge |
| 总体反思强调 Context/Temporal Reality | 历史需重建当前适用理解，摘要不可无来源 | S03/S05 |
| 用户拒绝过度展开嵌套 Top-Down/Bottom-Up | 思想不强制新增架构 | guidance/strategy、S00 模块收敛 |

## 必须保持的争议与未知

- 原 Promotion 根因仍需 replay：完整 SHA 观测与外部对象可达性、namespace、reconcile 的关系不能凭报告决定。
- Gate Predicate 错配的完整安全影响范围需 RED/consumer tracing；不夸大也不忽视。
- 历史工具和多数模块已实现不等全产品自然可用。
- 没有完整强 F 配对前，不得声称 Palimpsest 比原生 DSH 更聪明或更便宜。
- read confinement、跨进程恢复、exactly-once 的实际 scope 不能由命名推断。

## 本期故意不延伸的经验

组织策略和架构经验可记录为研究假说，但不新增 MetaCoordinator/ArchitectureExperienceStore。小范围方法可在试验中比较，默认生产组织不由一次模型自评自动改变。
