# Work 修订义务与候选回执

宿主可为正式 Work 任务签发四类精确文件义务。Work 负责观察 Git、检查授权和结算，独立验证器负责判断业务正确性。操作员用通过门禁的完整候选 SHA 核准接受。

## 声明与授权

宿主按任务 ID 提供 `TaskObligations`。普通 DSH 通过部署的 host 配置提供，外部 TypeScript 宿主通过 `installProduct` 的 `taskObligations` 提供。路径是区分大小写的仓库相对文件路径。声明用 `schemaVersion: 1`，路径列表规范化排序后生成摘要。

| 字段 | 检查 |
| --- | --- |
| `mayWrite` | 计划可从这组路径选择更窄的授权。实际候选的净差异必须属于有效授权。 |
| `mustChange` | 计划必须覆盖这些路径。候选与基线的内容对象须有差异，单独改变模式不满足。 |
| `mustExist` | 候选提交中的条目须为普通文件。已存在且适用的内容可原样沿用。 |
| `mustPreserve` | 基线和候选都须有同一普通文件条目，Git 模式及 blob 须一致。 |

授权把规范化规则和摘要与项目修订、完整基线 SHA 一同写进 `TaskEnvelope`。重启、委派恢复和接管读取 Attempt 的原授权。现有任务重新授权时保留已登记规则，改变规则使用新的任务 ID。旧信封使用现有完成路径，旧事件及摘要可原样回放。

gRPC 的三个必改项是 Server、集成测试和迁移说明。Server 单测允许更新且必须存在。proto、wire codec、客户端和 REST 测试逐字节保留。Energy 的五个受影响成果都须更新，供应商证书文件逐字节保留。独立 HTTP/2 探针和 Energy 业务判分仍从确切候选执行。

## 回执、拒绝与核准

Worker 提交后使用私有的 `palimpsest_worker_receipt` 观察 `PREVIEW`。Worker、正式结算、Principal 完成和接管共用 Git 检查。Work 在异步验证后写最终报告前再次核对候选、基线和工作树。持久的 `SETTLED` 回执随 `AttemptReport` 写入，包含任务、Attempt、授权、义务摘要、完整基线与候选 SHA，以及逐项检查结果。预检和正式回执通过确定性的 `receiptId` 关联。

普通 DSH 在 `work workers` 返回摘要。使用 `work receipt` 按 Attempt 查看完整检查，传入原始 `basis`、`candidate` 和 `path` 可展开单文件检查。SDK 使用同源的 `revision.readReceipt`。失败回执说明原因及受影响路径。例如 `TASK_OBLIGATION_SCOPE_MISMATCH` 指向 `CORRECT_PLAN`，`PROTECTED_FILE_CHANGED` 指向 `FIX_CANDIDATE`，`RESULT_DRIFT` 指向 `REOBSERVE`。

可信宿主经 `revision.accept` 提交 Attempt、完整基线、完整候选、回执 ID 和已验证的 Operator。接受沿用门禁、Promotion 和项目 Head 对账。核准前后均可核对候选 SHA 与晋升后 HEAD。对同一候选的重复提交与重复接受分别返回原结算回执和原晋升结果。不同 SHA 会触发明确拒绝。

## 零付费复现

先从真实打包产物安装一个临时外部消费者，再运行两个领域的 T2 资格。外部消费者的 TypeScript 代码通过 `palimpsest-dsh/product` 导入。普通 DSH 使用既有 PNWF 容器、Mock Provider 和请求账本。SDK Worker 使用独立 Git 副本及实际子进程执行冻结夹具。

```sh
node scripts/release/consumer-smoke.mjs
node scripts/pnwf/revision/qualify.mjs --run=<new-directory> --consumer=<smoke-directory>/embedder
```

每个领域的两条路径使用同一个冻结基线，独立提交和接受。资格记录包含候选回执、错误核准拒绝、业务评分及重启读回的接受 HEAD。已有三会话 Mock 可分别用 `scripts/pnwf/software/run.mjs` 和 `scripts/pnwf/energy/run.mjs` 的 `--action=qualify --run=<new-directory>` 复验。

2026-11-10 的最终资格四条全部通过。每个领域的两种入口产出同一候选树。gRPC 两条均通过七项独立 HTTP/2 探针和十项公开测试，候选修改三个必改文件，Server 单测仍存在。Energy 两条均通过 45 项业务断言，五个成果更新，证书 blob 保留。普通 DSH 两条都记录 `WAIT_FOR_OPERATOR` 后自然退出，共 38 笔 Mock 请求全部对账。打包 SDK 两条使用确定性子进程，模型请求为 0。[资格与 Git 证据](../../research-evidence/pnwf-work-revision/2026-11-10/qualification.json)

从发布主线在原 gRPC 和 Energy T2 基线各跑了一条普通 DSH 真实会话。两条均经正式 Worker 预检、结算、独立评分和按完整 SHA 接受。Energy 记录等待结论，gRPC 保留等待结论缺项。[真实复跑报告](WORK-REVISION-LIVE-T2.md)
