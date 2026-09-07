# G9-B3 交付报告 — Cross-Layer Closure

- 日期：2026-09-08
- 基线：`1a8d688` → 本轮交付 `2a1e558`（审计）+ 实现提交（见文末）
- 测试基线：56 文件 / 337 → **57 文件 / 354 全绿**（既有 337 项原样绿）；kernel `tsc -b` + web typecheck + vite build 全过；真实浏览器冒烟通过。

---

## 1. Reproducer 结果（全部先红后绿，经真实 endpoint / scratch 实证）

| 探针 | 复现（修复前） | 修复 |
| --- | --- | --- |
| P1 digest↔doc | `response.graphDigest: 418b7a55…` vs `digest(lift(doc)): 1803a3f7…`（MATCH: false）——含 addEdges 的 patch 必现 | A |
| P2 hold 定义身份 | r1(n17) hold、r2(n99) 复用 task-1 → `controls.holds[0].definitionId === "n99"` | C |
| P3 重复 title | `validateProjectProposal → []`（依赖词汇歧义被放行） | D |
| P4 updateEdges {id} | parse 接受（updateNodes 有 EMPTY_UPDATE 而 updateEdges 没有） | E |

## 2. 规格修订

- **31 号（G9-B3 跨层闭合修订，SDS-40）**：§B3-A 响应完整性硬不变量；§B3-B web 接线与锚纪律；§B3-C hold 历史定义身份（M9）；§B3-D 提案可编译闭合；§B3-E EMPTY_UPDATE 对称。
- **30 号（一行修订）**：`HoldControlView.definitionId`＝设置时身份；`GraphTask.held` 徽章归属规则（active 恒显；错配仅历史身份 === 当前身份才显 stale；缺失/不同不显——保守 fallback 登记）。
- 未占用 32 号（仍留给 G9-D/Canvas 阶段）。

## 3. 变更合同

- `serve` `/api/canvas/patch`：成功响应 `graphDigest = digest(lift(returnedDoc))`；失败响应 `digest(lift(请求 doc))`。API 合同：`response.graphDigest === agentGraphSemanticDigest(liftToAgentGraph(response.doc))`。
- `web/src/api.ts`：`compileCanvas` 返回 + `CanvasPatchResult` 增 `graphDigest: string`（后端恒存在 ⇒ 非 optional）。
- `web/src/types.ts`：TaskProposal 补 `suggestedSkills/scopeId/definitionId`；`ProjectProposal.changeClass` 改字面量联合 `ChangeClass`。
- `ArchitectureBar` 增 `revision` prop；"从需求生成"指令生成时内嵌真实 `baseRevision`+`baseGraphDigest`（经 compileCanvas）；patch 面板显示 锚状态（已锚定/未锚定），review 时绝不注入。
- `task_holds` + `definition_id` 列（**M9**：ALTER TEXT + `json_each` 自 PROJECT_CREATED/PROJECT_REVISED 载荷按 (revision, task_id) 可证明回填）；projector `#applyHoldSet` 从**当时** projects 行派生。
- `validateProjectProposal`：+`DUPLICATE_TITLE`、+`TASK_SPEC_CONTRACT`（试编译 `proposalTaskSpecs → parseTaskSpec`，ContractError 转结构化诊断）。
- `parseGraphPatch`：`updateEdges` 条目无 `kind` ⇒ parse 层 `EMPTY_UPDATE`；程序化 patch 无 kind ⇒ validator `NO_OP_OPERATION`。

## 4. 验收（全部新增即绿）

PATCH-FRESH-A04（endpoint 级 doc↔digest 一致）、PATCH-FRESH-A05（返回锚链式第二个 patch 不 stale；错锚拒绝并携带当前锚供 rebase）、PATCH-GRAMMAR-A05、WEB-FRESH-A01/A02（源级 conformance tripwire）、WEB-CONTRACT-A01（TaskProposal 九字段 + ChangeClass 联合）、HOLD-ID-A01（stale hold 保留 n17 不取 n99，徽章不显于新身份）、HOLD-ID-A02（orphan 保留 n17）、HOLD-ID-A03（历史缺席恒缺席，不合成）、HOLD-ID-A04（M9 回填实测 n17）、PROP-COMPILE-A01..A07（A07 property belt 含全部 preset）。

## 5. 迁移 / 回放影响

- **M9**（v8→v9）：新列 `definition_id TEXT` + 可证明回填（`json_each` 精确匹配历史 ProjectIR 的 (revision, task_id)；`json_valid` 守门；不基于推测）。回放路径（新库）由 projector 在 apply 时派生，HOLD-ID-A01..A03 即回放实证；存量路径由 HOLD-ID-A04 实证（执行的就是随库发布的 M9 回填语句本身）。投影表变更 ⇒ 无 digest/fixture 再生。
- FAIL-OPEN 面消失：G9-B2 的"NULL=stale"之外新增"definitionId 缺席＝诚实缺席"，两处均已明文登记（无沉默回退）。

## 6. 四条退出不变量（机械证明）

1. `response.graphDigest === semanticDigest(response.doc)`（PATCH-FRESH-A04/A05）。
2. `ProjectProposal validation=clean ⇒ canonical TaskSpec compilation succeeds`（PROP-COMPILE-A07）。
3. `historical governance identity === historical definition identity`（HOLD-ID-A01..A04）。
4. 设计红线登记：`ArchitectureRevision ≠ Topology revision alone`（G9-E 原子性前置写入计划；本轮不实现 multi-event transaction）。

## 7. 遗留缺口（登记不动）

- patched IR **边身份**在 IR→Canvas v2→IR 仍会重生成——G9-D（v3 显式 edges[]）闭合，已升级为新鲜度正确性依赖（批次顺序 B3→D→C→E→F→G）。
- web mirror 为源级 tripwire 守门（无 runtime 契约面）；真实行为由浏览器冒烟 + G9-G Playwright 承接。
- models.ts 13 parser 未知字段容忍（SCHEMA-AUDIT tripwire 在册）——G9-F 逐合同裁决。
- 架构原子性三案比较——G9-E 开工前置。

## 8. 提交

- `2a1e558` docs(g9-b3): 跨层闭合审计
- 实现提交：feat(g9-b3)（见 git log）

之后按 §28 停止；下一轮进入 **G9-D — CanvasDoc v3 / 稳定边身份**。
