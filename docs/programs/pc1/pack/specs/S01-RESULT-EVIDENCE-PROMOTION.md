# S01 — 真实 Agent Result、Evidence 与 Promotion 完整性

**目的：把 C6-R 的实际阻断变成已复现、已修复、可恢复的正常产品路径。**
依赖 S00；可零模型完成。影响面：controller.report、execution_world、git port、promotion、safe action reconciliation、work evidence、Gate DSL、对应 runtime adapters。

## 问题基准

用户报告把 `f1536b8` 当作短 canonical Result Commit；当前 controller.report 在能观察执行树时用 `observedHead` 覆盖输入。先前审查指出原 Event 37 已保存完整 SHA。**不能直接实施“修短 SHA”以符合叙述。** 在不可变原日志中核验输入、正式事件、Promotion Prepared 和 Ordarium action input 的精确身份，再归因。

### S01-R01 — 建立可检验根因而不是复述报告

固定原 evidence 的 SHA 与读取范围；列假说：输入身份异常、对象未 export、Git alternates 跨 namespace 失效、effect reconcile 对不可观察错误误分类。分别检验，不混成一个“Git 问题”。写前向纠错，原证据不修改。原未决 `op_d0dede...` 只读取；不能用修改 Ledger 终结。

### S01-R02 — 所有正常 Report 路径导出正确 Result

同一正常 Work 必须在 legacy claim/report、当前 product facade、D2 worker 三条路上建立一致结果契约：观察真实 execution world；验证 scope/materialization；取得完整对象身份（适配仓库 object format，不硬编码只支持 SHA-1）；在 canonical ODB 可读取结果对象/必要树后才进入可 Promotion 状态。

复用 ExecutionWorldPort.exportResultCommit 或等价现有 owner 接缝。对象 import 只能改变 object availability，不能移动 branch/project head。export 失败不能谎称提交可接受；保持工作世界、清楚 retry/recover 状态。若 report 已持久化再 export，要定义失败后如何继续，不靠第二个报告改写历史。

### S01-R03 — Git 路径视图与世界身份明确

canonical repo、world GitDir、alternates、mount namespace 与执行位置全部来自 Host 配置，不能由模型随意传入任意路径。分别测试 Windows/WSL 组合中实际支持的配置。普通模式可声明 Linux sandbox supported、Windows mode unsupported；不通过放宽系统写权限解决路径问题。损坏的 alternates 不等于空 repo，不自动重新 clone 覆盖唯一结果。

### S01-R04 — 可观察的 Promotion 与 Recovery

推进既有 safe action/PromotionManager：preflight 对象可读、expectedHead/basis 当前；effect 开始前失败可明确拒绝；开始后异常保留 uncertain 并对账。区分对象不存在、对象不可观察、存在但未 merge、merge 已成功但回执未写。只有真实结果证明才 settle/retry；错误不得一律 `catch → false` 被解释为效果未发生。

重试遵守原 action idempotency/claim/fence。CAS 防止检查后 head 变化；重入/重复 Promotion 返回同一 terminal effect；crash-before、crash-after 和 uncertain 都有独立测试。若需 Ordarium 改动而仓库不拥有该权威，优先修 adapter 的可观察性；外部 SDK API 缺口记录和隔离，不伪造结果。

### S01-R05 — Evidence Predicate 与 producer 资格绑定

命令退出 0 只能支持该命令真正证明的命题。普通模型不得任意把 `tests_pass` 改名为 `write_scope_valid` 或 `expected_files_exist`。结构性命题必须从可信的 Git diff/Result tree/Artifact Observation 取得，绑定 exact subject digest、basis、环境与观察条件。支持扩展 Predicate 时先注册验证契约和 producer，不给 caller 字符串自授权。

若现有 parser 接受历史弱证据，读取/重放不删除旧记录；新接受路径对其标 legacy/unqualified 或要求重新验证，不能悄悄提升旧证据权威。命令重复、结果内容变动、工具环境改变不得沿用不再适用的 Evidence。

### S01-R06 — Gate 与业务语义分开

发布前 Gate PASS 仅代表满足声明的合格证据，不能表示所有真实世界假设成立。正常完成路径自动收集合格 scope/artifact evidence，不逼模型猜 Predicate 或用无关命令凑齐。每个 Gate 返回 which-observation、which-subject、why-pass/fail/missing。S06 再定义领域检查，S01 不建立万能 truth engine。

### S01-R07 — 保留候选、结果与接受身份

记录 originBasis、executionHead、resultCommit、export/readability state、expectedAcceptanceHead、acceptedHead、acceptedBlob。Promotion lineage 继续使用真实受接受事实，不能把 resultCommit 当 acceptedHead。线性、merge、divergent/missing Git 对象都覆盖。Git blob 字节与 Windows working-tree newline 分开。

## 实施步骤

先做独立真实 Git reproducer；再把固定的复现写入正常 test；修 existing owner；跑原 recovery 与 evidence 邻接回归；最后通过正常 model-facing API（可 deterministic invocation）跑完整 Work→Report→Gate→Operator Promotion→Replay。不能只让 reproducer 中的私有函数成功。

## 必须通过的验收

| Test ID | 对应要求 | Case / 期望 |
|---|---|---|
| T-S01-01 | S01-R01 | 原事件与报告冲突会被标记，不把短输入直接等同 canonical identity |
| T-S01-02 | S01-R02 | short input + observable world 得完整 OID；仅 world 存在的 result 合法导出，不动 canonical HEAD |
| T-S01-03 | S01-R02,S01-R03 | missing world / broken alternates 失败可诊断，结果不被重建覆盖 |
| T-S01-04 | S01-R04 | crash before merge / after merge before receipt / unreadable state 三种结局区分 |
| T-S01-05 | S01-R04 | 重复 promotion、并发 target advance、安全恢复不产生双效果 |
| T-S01-06 | S01-R05 | 缺 Required Artifact + 无关 exit-0 命令不能获得 qualified files_exist 或 release |
| T-S01-07 | S01-R05 | 越界改动 + tests_pass 不能伪造 scope；旧 atom 可 replay 但不能扩大资格 |
| T-S01-08 | S01-R05,S01-R06 | evidence 主体/输入变动后需重评，Gate 解释包含真实来源 |
| T-S01-09 | S01-R07 | acceptedHead 与 resultCommit 不同的 merge 情形，blob 与 provenance 正确 |
| T-S01-10 | S01-R02,S01-R04,S01-R06 | 普通产品路径一次完整工作到正式接受，重启可见相同状态 |

**退出：** 两类故障（Result transfer/recovery 与 evidence qualification）均有实际测试、正常产品接入和迁移说明。不得仅新增一个 debug command，仍让正常 Report 永久堵塞。
