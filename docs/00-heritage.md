# 设计传承与权威来源

## 1. 本仓库是什么

本仓库是 **Palimpsest 复兴线**（2026-08-17 决议）的工程落点：以 DSH 插件形态重建 Palimpsest，作为 Ordarium 的典型产品。合同与教训从下列来源移植，**代码不移植**——Python 实现是可恢复的历史基线，不是本仓库的运行时依赖。

## 2. 权威来源

| 来源 | 位置 | 权威范围 |
|---|---|---|
| 规范 00–11（合同层） | `palimpsest-repo/docs/00-identity.md` … `11-phase0-2-unified-baseline.md` | 移植期间被逐条对照的合同文本；`02-contracts.md` 与 `11` 是 P0 的直接来源 |
| Python Runtime（冻结快照） | `palimpsest-repo/palimpsest/src/palimpsest/` | schema/domain/state 的行为参照；101 项测试定义了验收语义 |
| 唯一 replay fixture | `palimpsest-repo/palimpsest/fixtures/replay/baseline-v1.json` | 跨语言 parity 的黄金基准（本仓库 `fixtures/replay/` 为其逐字节副本） |
| 原始设计稿（非权威） | `palimpsest-repo/palimpsest/archive/raw-notes/` | 推导过程记录；与正式文档冲突时以正式文档为准 |
| Ordarium | https://github.com/orangeofcarl0-sys/ordarium | 副作用执行层的全部合同（docs/12–17） |

## 3. 移植纪律

- **合同不发明**：P0 的每个 schema 字段、状态转换、校验规则都来自冻结基线；如需偏离，必须先在本文档登记差异及其理由。
- **parity 是验收**：digest（canonical JSON + SHA-256）、事件哈希链、migration 身份（`PLMP` application_id、migration 1 checksum `ca8b417a…ff5ad9`）、snapshot digest 必须与 Python 输出逐字节一致，由测试机器把关。
- **失败关闭**：未知 `schema_version`/`payload_version`、损坏哈希链、漂移投影一律拒绝（docs/11 §5），无 historical bypass。

## 4. 已登记的实现差异

| 差异 | 理由 |
|---|---|
| `EventStore.append` 增加可选 `committedAt` 覆盖参数 | Python 侧确定性时间由 FakeClock 隐式提供；TS 侧显式传入原时间戳以支持 fixture 重放，语义等价 |
| `Error.cause` 以消息内联方式表达 | 运行时目标环境的 Error 构造器限制；错误类型与消息文本保持与 Python 对齐 |
| canonical int64 范围额外受 `Number.isSafeInteger` 收窄 | JS number 无法精确表示完整 int64；拒绝而非静默截断，失败关闭 |
| TaskPolicy 为 class 而非 pydantic model | TS 无隐式模型校验；digest 覆盖相同字段集，fixture 中 `trusted-default` policy digest 已验证一致 |
| `AggregateValidator.currentBatch` 公开（Python `_current_batch`） | Scheduler 需要按 causation 查询批次锚点；语义与行为不变 |
| Scheduler 方法为 camelCase（`registerTask`/`startAttempt`/`recordCallback`） | TS 命名约定；调用序列与 fixture 生成脚本一致（fixture 从零重放逐事件验证） |
| 新增 PromotionManager / 执行器 / GitPort（Python 基线无对应物） | P1 将"注入的 PROMOTION_COMMITTED 事实"升级为真实执行流：PREPARED → `palimpsest.git.promote`（Ordarium reconcilable）→ COMMITTED；执行器抽象（claim/report、command、mock）是 P2 工具面的地基 |
| `palimpsest.git.commit.reconcile` 以 worktree 提交存在性为查询键 | 真实部署中以 git 查询端口暴露；P1 用 `git.contains` 近似，语义（absent→retrySafe）一致 |
| FakeGitPort merge 为双亲提交（parents=[head, source]） | 与 `git merge --no-ff` 的祖先语义一致，是 Crash B reconcile 识别的前提 |
| `createPalimpsestEffects` 暴露 `leaseMs` | 测试用 ManualClock 驱动 lease 过期以模拟崩溃重启；生产默认 30s 不变 |
| 新增 `dshDefaultStatePath()`（`$DSH_HOME/palimpsest/palimpsest.sqlite`） | Python 基线的 `defaultStatePath` 是仓库相对路径（保留）；DSH 部署形态下编排账与 Ordarium 账同宿于 `$DSH_HOME`（双存储拓扑，docs/01 §4） |

| 新增 ProjectController / 7 工具 / installPalimpsest | P2 把 claim/report 协议、gate→EvidenceAtom、pause/resume（control generation fencing）收束为宿主可注册的工具面；结构性 DSH 宿主合同（tools/dsh_types.ts）镜像 @ordarium/dsh，待真实 DSH manifest 发布后合同零改动切换（G9 遗留项） |
| controller.gate 的 evidence 幂等键 = actionKey("evidence-v1", {project_id, attempt_id, predicate, command}) | gate 结果可安全重放；subject_digest 绑定 attempt+command |
| gate.command 输出允许 exitCode=null | readOnly 记录真实执行结果，未知结果（如进程被终止）如实为 null 而非伪造整数 |

| TaskSpec.role 为可选字段（P3 扩展） | 缺席时按 implementer 处理；canonical digest 只含 present 字段，故冻结 fixture 的 digest 逐字节不变（parity 测试全绿）；Python 线已冻结，无对应实现 |
| candidate_limit 放宽为 1\|2\|4（P3 扩展） | docs/02 冻结值为 1\|2；2 仍在合法集故 fixture 兼容；aggregate/scheduler 的 planned 计算逻辑不变 |
| RoleSlotPolicy / BudgetLedger 为宿主层准入（P3） | 不改 Event 语义与 aggregate：槽位与预算只在 controller.claim 时检查，超限抛 DomainValidationError；默认值来自 Sparse Cognitive Parallelism 结论（implementer 2、硬上限 20） |

| GateEngine / parseGateDefinition（Research 线 R1） | 声明式门禁（预算.txt §13–22）：纯查询、无副作用；evidence 投影表无 subject 列，按 evidence_json 内 subject 的 json_extract 过滤查证；未登记 gate 与 subject 类型不匹配失败关闭 |

| computeInvalidationSet / classifyLateResult（R2） | 语义兼容演算（预算.txt §23–32）：changed 实体自身 + 沿敏感于该 change_class 的依赖边传播；metadata_only/backward_compatible 不失效任何下游；迟到结果分四类（current/compatible/stale_but_informative/unsafe_stale）。controller.plan 可选 changeClass/changedIds 触发，省略即原行为（无失效） |

## 5. P1 起的来源

Ordarium 侧合同（effect profiles、Operations、live lease、reconcile 语义）以 Ordarium 仓库 docs/12–17 与 `evidence/` 为准；本仓库不复制其文本，只引用。

P1 依赖安装路径（`link:` + workspace overrides，五 tarball 自洽）即 Ordarium 记录在案的分发方式二；`tools/sync-ordarium.mjs` 打包自同级 checkout，公共发布后切换为 GitHub Release URL。
