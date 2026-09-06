# Context Requirement / 检索 / Manifest / Coverage 规格（Context Compiler 检索半边，含词法检索与 canonical manifest）

> **Spec ID**：`PLMP-CTX-2` ｜ 状态：**已交付**（2026-09-06 三阶段 a6a4a6f / b20cd19，出口 SDS-16）
> **权威序**：系统设计以 `03-system-design-spec.md`（PLMP-SDS）为准；C2 压缩器以 `12`（PLMP-CTX-1）为准；invalidation 语义以 R2（`src/evidence/invalidation.ts`）为准；素材母体＝raw-notes 预算.txt §3/§5–9/§12（非权威，冲突以正式文档为准）。本文＝检索半边 V0 的形状、契约触点与验收权威。
> **修订记录**：`CTX-2`＝初版冻结（2026-09-06）：两项用户裁决（V0 含词法检索、manifest 进 canonical 审计链）经 AskUserQuestion 确认；四器官 + schema 触点（`CONTEXT_MANIFEST_ADDED` 新事件 + AttemptReport 加法式可选字段 + fixture v3 再生）；验收 CTX2-A01–A10。

---

## 0. 立项与边界

C2 压缩器（CTX-1）解决了"已有投影怎么压"；检索半边回答"往 brief/manifest 里放什么"。四器官：**Requirement 编译器**（§3）→ **词法检索**（§5 切片）→ **Manifest**（§9，canonical）→ **Coverage**（§8，advisory）。

**边界裁决（用户 2026-09-06，冻结）**：

| # | 裁决 |
|---|---|
| CTX2-D1 | V0 **含词法检索**：`GitPort` 扩展只读扫描面（Fake/CLI 双实现），检索本地化于本仓 |
| CTX2-D2 | Manifest **进 canonical 审计链**：新事件 `CONTEXT_MANIFEST_ADDED`（哈希链）+ 投影表 + `AttemptReport` 加法式可选字段（SDS-4 例外路径，fixture 重验） |

**非目标**：semantic/embedding 检索（宿主中立红线：无模型访问）；runtime retrieval（traceback/coverage 定位）；token 预算与 Boot/Pull 分层（§12，后续）；§6 选择评分（V0 检索结果直入 manifest，去冗余后置）；coverage→ALC 耦合（V0 仅 advisory）。

## 1. Context Requirement 编译器（§3，纯函数）

`compileContextRequirement(input)` → 五类需求结构性派生：

| 类 | 派生来源 |
|---|---|
| `exact` | `TaskSpec.required_artifacts` ＋ 计划引用（V0＝artifacts 逐条） |
| `code` | `write_paths`（本任务写面）＋ `depends_on` 任务的写面（上游契约） |
| `evidence` | 同任务先验失败 attempt 的证据 subject 集 |
| `historical` | 被修订 supersede 的旧 IR（V0 占位空集，声明） |
| `forbidden` | **R2 invalidation 的 stale 集**（`computeInvalidationSet` 输出直引——§9 `excluded_stale` 的来源） |

纯函数、无 I/O；语义概念提取（"router implementation" 类）是宿主/模型职责，V0 不做。

## 2. 词法检索（CTX2-D1，GitPort 扩展）

```ts
// GitPort 新增只读方法（Fake/CLI 双实现）
scanLexical(worktreeId: string, terms: readonly string[], options?: {
  glob?: string;            // 缺省全仓
  maxMatches?: number;      // 缺省 64
}): Promise<Array<{ path: string; line: number; snippet: string; term: string }>>;
```

- **只读、非副作用**：检索不走 Ordarium Action（不淹共账），审计责任由 Manifest 承担；路径知识留在 GitPort（沙箱边界不外泄）。
- CLI 实现：worktree 目录内文件遍历 + 逐行匹配（大小写不敏感）；Fake 实现：内存 fixture 服务。
- `maxMatches` 截断即停——检索成本有界。

## 3. Context Manifest（CTX2-D2，canonical）

### 3.1 本体（§9 形状）

```ts
interface ContextManifest {
  manifestId: string;                    // actionKey 派生（project+task+revision）
  taskId: string;
  projectRevision: number;
  requirement: ContextRequirement;       // §1 全量
  exact: Array<{ ref: string; digest: string }>;        // artifacts 逐条 digest
  source: Array<{ path: string; line: number; snippet: string; term: string }>;  // 检索结果
  evidence: string[];                    // 关联证据 id（先验失败面）
  excludedStale: string[];               // §9：被排除的 stale 引用
  retrieval: string[];                   // ["lexical"]
  createdAt: string;
}
```

### 3.2 canonical 化（schema 触点）

- **新事件** `CONTEXT_MANIFEST_ADDED`（EVENT_TYPES 33→34，payload_version 1，payload＝manifest 全量 + 规范化校验）；哈希链 canonical 审计。
- **投影表** `context_manifests`（project_id/manifest_id/task_id/manifest_json，进 `PROJECTION_TABLES` → **snapshotDigest 变更 → parity fixture 再生 v3**，TS 运行时再生，H1 先例）。
- **`AttemptReport` 加法式可选字段** `contextManifest?: string | undefined`（SDS-4 例外路径：缺省省略序列化、permissive 解析、fixture 事件不含该字段 → digest 零扰动）；controller 在 report 构建时自动回填该 attempt 已存在的 manifest id（worker 不感知）。

## 4. Coverage Assessment（§8，纯函数）

`assessCoverage(requirement, manifest)` → 逐类置信度（exact=1.00 全命中递减、code/evidence 按命中比、historical/forbidden 常量）＋ `unresolved` 列表 ＋ `recommendation.additionalExploration`（任一类 < 0.75 即 true）。V0 仅作 advisory 输出，**不耦合 ALC estimates**。

## 5. 控制器组合

```ts
compileTaskContext(taskId: string): {
  requirement: ContextRequirement;
  manifest: ContextManifest;      // 落账（CONTEXT_MANIFEST_ADDED）
  coverage: CoverageAssessment;
}
```

- 只读面（`contextBrief`/`status`）不变；本面是**写面**（manifest 落账），幂等键保证同 revision 重复调用安全。
- 检索词根 V0：`objective` 分词（去停用词）＋ `required_artifacts` 词元——确定性、无模型。

## 6. 无兼容层

- schema 触点全部按正道走：新事件走完整 schema/payload 校验（无 bypass）；AttemptReport 字段走 SDS-4 例外（三条件 + 登记）；fixture v3 再生是**再生**不是放宽（digest 规则不变）。
- 无旧路径 shim；GitPort 旧四方法签名不变（扩展非修改）。

## 7. 验收

| # | 验收 | 方法 |
|---|---|---|
| CTX2-A01 | Requirement 五类派生 | 种子任务（artifacts/写面/先验失败/stale）：五类各自命中预期来源 |
| CTX2-A02 | forbidden＝stale 直引 | invalidation 输出的 stale 项逐条出现在 forbidden |
| CTX2-A03 | 词法检索 | Fake 与 CLI 双实现：term 命中 path/line/snippet；maxMatches 截断；无命中空集 |
| CTX2-A04 | Manifest canonical | `CONTEXT_MANIFEST_ADDED` 落账后事件数 +1、哈希链验证通过、投影表可查 |
| CTX2-A05 | report 回填 | 同 attempt 的 report 携带 `contextManifest` id；未编译 manifest 的 attempt 报告不含该键（digest 零扰动） |
| CTX2-A06 | fixture v3 | 再生 fixture 逐字节自洽；snapshotDigest 与新投影表一致；migration 身份不变 |
| CTX2-A07 | Coverage | 全命中 → 各类 ≥ 阈值且 additionalExploration=false；缺口 → true + unresolved 列出 |
| CTX2-A08 | 纯函数性 | requirement/coverage 双调用全等 |
| CTX2-A09 | 幂等落账 | 同 revision 重复 `compileTaskContext` → 同 manifestId，事件数不增 |
| CTX2-A10 | 术语隔离/咨询面 | brief/status 既有面零漂移（202+ 基线绿） |

交付出口：全量 `pnpm check`；03 SDS bump；00-heritage 差异登记行（R18）；01 §3 分层图行；工程索引登记；raw-notes 素材归档说明。

## 8. 修订流水

| 日期 | 修订 |
|---|---|
| 2026-09-06 | 初版冻结（PLMP-CTX-2）：两项用户裁决（CTX2-D1 含词法检索、CTX2-D2 canonical manifest）；四器官形状、schema 触点（33→34 事件、投影表、AttemptReport 字段、fixture v3）、验收 CTX2-A01–A10。 |
