
# GitHub 维护会话交付复算

本说明对应 `scripts/pnwf/software/self-evolution/github-maintenance-recount.mjs`。它只读取封存证据，不修改 `evidence/`，也不接受、晋升或批准任何候选。报告是原档的再推导，不是新的交付结论。

## 输入

`inspectArchivedDelivery(summary, trace)` 接收两份证据：

| 参数 | 本轮原档 | 用途 |
| --- | --- | --- |
| `summary` | `evidence/git-runtime-original-result.json` | 原判、候选提交是否有效、候选 SHA |
| `trace` | `evidence/git-runtime-paired-facts.json` | 使用结算状态、自然退出、实际工具调用、绑定候选的结论 |

`summary` 和 `trace` 都按原样读取。命令行入口还会核对 `evidence/sources.json` 的文件集合与每个文件的 SHA-256；任何字节变化都会以 `ARCHIVE_BYTES_CHANGED` 拒绝复算，而不是把改动后的文件当作原档。

```powershell
node scripts/pnwf/software/self-evolution/github-maintenance-recount.mjs evidence
node scripts/pnwf/software/self-evolution/github-maintenance-recount.mjs summary.json trace.json
```

## 返回值

函数固定返回以下六个字段。它们分别回答不同事实，不能互相替代：

| 字段 | 含义 | 本轮原档 |
| --- | --- | --- |
| `originalPass` | `summary.pass` 的原判，不因离线复算而重写 | `true` |
| `natural` | `trace.execution.natural`，即普通会话自然退出 | `true` |
| `candidateSaved` | `summary.submission.valid`，即候选已保存且提交有效 | `true` |
| `candidate` | 保存的精确候选 SHA | `248a97730fb3e74948d0b56239876fcd01bbee4a` |
| `projectReadCall` | `trace.calls` 中真实成功的一次 `palimpsest_continuity` / `pulse` 调用 ID | `call_163cdeb6f06442c08e7f9bb2` |
| `delivery` | 绑定该候选的 `DELIVER` 结论事件 ID；不满足则为 `null` | `null` |

`originalPass` 与 `candidateSaved` 不证明已经交付；`natural` 也不证明交付。反过来，`delivery` 只说明存在一条结论及其候选工件绑定，不说明该交付已被 Owner 接受。

命令行额外输出 `settlement`，用于单独回答结算：本轮为 `usageState: "SETTLED"`、`attributionState: "COMPLETE"`、59 笔请求、`unresolved: 0`、`confirmed: 7768304`。该对象不混入函数的六个交付字段。

## 什么才算绑定候选的 `DELIVER`

`delivery` 同时要求：

1. 最新结论的 `intent` 是 `DELIVER`，且有非空 `eventId`；
2. 结论记录中的工件状态 `committed === true`；
3. 工件的 `commit` 与 `summary.submission.candidate` 完全相等；
4. 结论列出的每个工件路径都满足第 3 条。

若配对轨迹带有 `previousConclusion`，与该旧事件相同的结论也不会被重复计为新交付。结论正文支持实际的 `<!-- pc1-episode-conclusion:v1 -->` 标记形式，也支持原档中按行保存的 `{"schema":"pc1-episode-conclusion/v1", ...}` 形式。配对轨迹中的 `conclusion` 优先；只有轨迹没有结论时才回退到原始汇总，避免用旧副本掩盖新结论的错 SHA。

正确结论与错 SHA 的对照：

```js
const candidate = summary.submission.candidate;
const correct = { ...trace, conclusion: {
  intent: "DELIVER", eventId: "conclusion-new",
  body: JSON.stringify({ schema: "pc1-episode-conclusion/v1", intent: "DELIVER",
    artifacts: ["maintenance/git-runtime-handoff.md"],
    check: { artifacts: [{ path: "maintenance/git-runtime-handoff.md", commit: candidate, committed: true }] } }),
} };
inspectArchivedDelivery(summary, correct).delivery; // "conclusion-new"

const wrong = structuredClone(correct);
wrong.conclusion.body = wrong.conclusion.body.replaceAll(candidate, "f".repeat(40));
inspectArchivedDelivery(summary, wrong).delivery;   // null
```

本轮原档的 `summary.conclusion` 与 `trace.conclusion` 都是 `null`，因此即使原判为通过、候选已保存并且实际 `pulse` 成功，`delivery` 仍为 `null`。这保留了“运行结束、候选保存、独立验收、正式交付”之间的边界。

## 复算与回归

```powershell
node --test scripts/pnwf/software/self-evolution/github-maintenance-recount.test.mjs
```

回归用例从 `evidence/` 原字节重算六个字段，并覆盖成功 `pulse` 与失败调用、正确候选 SHA、错误 SHA、未提交工件和缺失必需工件路径。所有输入都是证据；新增报告和说明不改变原档，也不构成对历史会话的重新接受。
