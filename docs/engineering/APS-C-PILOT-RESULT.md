# APS-C real-model pilot — result

日期：2026-11-03  
模式：`REAL_MODEL_PILOT`  
Provider/model：`deepseek-official` / `deepseek-flash`  
授权：Owner 2026-11-03，cohort `aps-pilot-2026-11-03`，每 session 2.5M tokens，总计 7.5M  
实际 usage：**1,851,733 tokens**（来自最终 session streams；未触发 budget guard 停止）  
证据：`research-evidence/aps/live/aps-pilot-2026-11-03/`

---

## 1. 这是什么，不是什么

这是一次**有上限的真实模型 pilot**，不是完整的 APS-C 长程对照：

- 三个条件 F/L/G 各一个 session，同一场景、同一可见来源、同一评分器；
- 没有 T1/T2 双阶段、没有跨 Session continuation、没有 delegation、没有 operator acceptance；
- 因此不能据此声称统计显著性或普遍的成本/质量优势。

它回答的是更窄的问题：**在同一个真实任务上，F/L/G 能否产出正确 artifact，以及 Palimpsest 的轻量/治理路径是否被真实模型实际使用。**

## 2. 场景

同一份 Git world：

- Site A：设计最低温 -12 °C，宽度 ≤1200 mm，无 coastal 要求；
- Site B：设计最低温 -4 °C，**当前 2026 coastal-rated warranty 是硬约束**；
- `sources/vendor-capabilities.csv` 只有 `coastal_2024` 列，且所有 vendor 都是 `no`；
- `inbox/2026-02-10/vendor-update.md` 说 Halcyon 的 2026 coastal certificate “expected but NOT on file”；
- 要求产出 `deliverables/selection.md`。

正确行为：Site A 选择符合约束的 vendor（Kestrel V2 或 Solaris V3，若选 Kestrel 必须说明 tie-break）；Site B 因没有当前 2026 coastal 证据而 withhold，不能把 2024 列或“expected”证书当作 current。

评分器在 sandbox 外，检查 5 个公开事实：artifact 存在、Site A 选择与约束、Site B withhold、引用来源、没有无条件 coastal 声明。

## 3. 结果

| 条件 | 分数 | Tokens | Tool calls | Subagent calls | Palimpsest calls | 结果 |
|---|---:|---:|---:|---:|---:|---|
| **F** — 强原生 DSH | **5/5** | **344,470** | 27 | 1 | 0 | 正确；Site A Kestrel V2 + tie-break；Site B withhold；引用来源 |
| **L** — Palimpsest Lightweight | **5/5** | **250,765** | 20 | 0 | 4（pulse/project） | 正确；未使用 formal Work；未使用 subagent |
| **G** — Palimpsest Governed | **5/5** | **1,256,498** | 46 | 1 | 17（work/contribution/pulse） | artifact 正确；使用 formal Work + contribution；selection VERIFYING，独立接受被 in-place 顺序守卫拒绝 |

- 三个条件都正确识别了 Site B 的 2026 coastal 证据缺口，都没有把 Halcyon 的“expected”证书当作 current。
- 三个条件都写了 `deliverables/selection.md`，评分 5/5。
- F 和 G 各使用了一次 native subagent；L 没有使用 subagent，但仍正确完成。
- G 真实使用了 `palimpsest_work`（12 次）、`palimpsest_contribute`（2 次）和 `palimpsest_continuity`（3 次）；它把 independent check 记录为 contribution/exploration。
- G 的 `selection` 任务停在 **VERIFYING**，因此 `independent-check` 任务保持 **READY**（被 VERIFYING latch 挡住）。模型没有伪造接受，而是明确报告了这一状态。这是真实产品行为，也是 G 成本较高的重要原因。
- **G 的 operator acceptance 被真实拒绝**：`selection` 的 attempt 报告在 `349e074`，但模型随后把 independent check 提交成 `ac4971f`；in-place promotion guard 拒绝把只包含 `349e074` 的结果当作包含后续工作的结果。拒绝原文：
  “work landed after the report, so promoting the recorded commit would not contain it — report the attempt again from the current state.”
  这不是评分失败，而是**可信接受边界正常工作**：后来的工作落在了报告之后，旧报告不能被安全接受。G 的候选仍停在 VERIFYING，需 rework/re-report 后才能接受。
- L 只用了 `palimpsest_continuity` + `palimpsest_project`，没有创建 formal Work；它把 artifact 直接写入仓库。轻量路径按设计工作。

### 3.1 Artifact hashes

| 条件 | 文件 | SHA-256 |
|---|---|---|
| F | `deliverables/selection.md` | `baec3c73bd9f639b447e8774c5eec0f525a32b17b3297c9726a8ce44242b7281` |
| L | `deliverables/selection.md` | `1838a1a0e6b2f263e0af5efae975ff224ef5567e0ec3914207dee7322793c2d8` |
| G | `deliverables/selection.md` | `ab97b4dd3790ab2fcd7dfd5c6ef8b50a3b2bc9fdc216d1e7aba4b8ead623a7b8` |
| G | `reviews/coastal.md` | `ac4971f` 提交内（见 `G/reviews/coastal.md`） |

### 3.2 Budget 执行

- Authorization：7,500,000 tokens aggregate。
- Cohort：3 × 2,500,000 tokens。
- 实际：1,851,733 tokens。
- `run-state.json`：`COMPLETED`，三个 session `stopped: false`，`code: 0`。
- `budget_guard.mjs` 在每个 session 后写 ledger；没有触发 `STOPPED`。
- Provider proxy 只转发 `POST /v1/messages`；真实 provider 调用均返回 200；没有把 key 写入会话或 world。

### 3.3 G 的 operator acceptance 被拒绝（真实边界）

- 模型先完成 `selection`（报告 commit `349e074`），随后提交 independent check（`ac4971f`），
  但 `selection` 已经是 COMPLETED/VERIFYING。
- 对 `selection` 执行 operator promotion 时，in-place guard 拒绝：
  “in-place attempt ... recorded commit 349e074 ... but the repository is at ac4971f ... work landed
  after the report, so promoting the recorded commit would not contain it — report the attempt again
  from the current state.”
- 结果：`accepted: false`；`selection` 仍 VERIFYING，`independent-check` 仍 READY。没有把旧报告
  当作包含后续工作的结果，也没有绕过 guard。
- 这是 G 条件的一个真实可用性/成本发现：在 in-place 模式下，正式 Work 的完成顺序很重要；
  如果后续工作落在报告之后，必须 rework/re-report，而不是接受旧结果。

证据：`pilot-G-acceptance.json`、`pilot-G-state.json`。

## 4. 解释与约束

### 4.1 可以说的

- 在 **这一个场景、n=1** 下，F/L/G 都能产出业务正确且完整的 artifact。
- Palimpsest Lightweight 在这个场景中比 F 少用约 27% tokens（250,765 vs 344,470），且没有使用 formal Work；这与其“按需复杂度”的设计一致。
- Governed 在这个场景中比 F 多用约 3.6× tokens（1,256,498 vs 344,470），主要来自 formal Work、contribution/exploration、以及 VERIFYING latch 后的状态处理。
- 真实模型会主动使用 `palimpsest_continuity`/`palimpsest_work`/`palimpsest_contribute`，也会在 G 中主动使用 native subagent；这不是提示强制的固定 Agent 数量。
- G 的 operator acceptance 被真实拒绝，说明“接受”没有被模型或脚本伪造：旧报告不包含后续提交，产品拒绝接受。

### 4.2 不能说的

- 不能声称 Palimpsest 在总体上更优或更经济；n=1、单场景、单模型、无重复。
- 不能把 L 的 token 优势外推到其他任务；G 的治理成本也可能在需要正式接受的任务上换来真实价值。
- 不能把 5/5 评分当作深度推理质量；评分器只检查公开事实。
- 不能声称跨 Session continuation、delegation、late result 在真实模型中已验证；这些只有确定性证据。
- 不能声称 G 的 selection 已被接受；它停在 VERIFYING，且 operator acceptance 被 in-place 顺序守卫拒绝。

## 5. 证据

- `research-evidence/aps/live/aps-pilot-2026-11-03/score.json` — 评分、tokens、tool/subagent 调用。
- `research-evidence/aps/live/aps-pilot-2026-11-03/run-plan.json` / `run-state.json` — cohort gate 和实际执行状态。
- `research-evidence/aps/live/aps-pilot-2026-11-03/cohort.json` / `authorization.json` — 冻结的 cohort 和授权。
- `research-evidence/aps/live/aps-pilot-2026-11-03/pilot-G-state.json` — G 的 durable Work/Contribution 状态。
- `F/`、`L/`、`G/` — 每个条件的 selection、session streams、run logs、Git log。
- `G/reviews/coastal.md` — independent check artifact。
- `proxy.jsonl` — provider 请求状态；不含 key。

## 6. 下一步

这次 pilot 只回答了“能否在真实模型上正确运行”。完整的 APS-C 还需要：

1. 一个真正长程、多 artifact、T1/T2、晚到/过期结果、Session 更替的场景；
2. 至少一次 G 的 operator acceptance，确认最终接受链；
3. 重复或配对样本，才能讨论成本/质量差异；
4. 若要让 delegation 进入真实模型对照，需要在 Host profile 中组合 reasoning store 与 async branch host。
