# Palimpsest DSH Plugin

> **A user-friendly multi-agent orchestration plugin for DSH, built on Ordarium.**
> One-sentence goals become durable projects. —— Revision without amnesia.

Palimpsest 把一句话目标编译成耐久项目（ProjectIR + Task DAG），Attempt 在隔离与证据门禁下推进，只有通过确定性 Gate 的工作才被晋升到 canonical 状态；全部外部副作用经姊妹工程 **Ordarium**（Safe Action SDK + Effect Authority，https://github.com/orangeofcarl0-sys/ordarium）以 Safe Action 执行在共享本地 ledger 上。

**源码（GitHub）**：https://github.com/orangeofcarl0-sys/palimpsest-plugin（私有，与 Ordarium 同属一条工程线；版本锚点 tag `palimpsest-v0.1.0`）。

## 用户快速上手（一分钟）

把一句话目标变成"崩不了、忘不了、只收验证过成果"的耐久项目：任务图、并行 worker、证据门禁、版本化晋升都在后台自动完成。

三句话记牢：
1. **一句话目标 → 耐久项目**——进程崩溃、杀会话都能"继续说"；
2. **worker 说"完成了"不算数**——只有确定性验证（gate）过的东西才晋升；
3. **新版本不覆盖历史**——旧证据自动失效，全程可审计回放。

命令行试跑（构建后）：

```bash
CLI="本仓库根/dist/src/cli.js"
node "$CLI" new p "把这份文档转成 pptx" --skills '["document-skills:pptx"]'
node "$CLI" run 20        # 机械部分全自动；剩余阶段会告诉你下一步
node "$CLI" status        # 随时看项目在哪、下一步做什么
```

对 DSH 用户：本机安装后，对 agent 说一句"用 palimpsest 把 X 做完"即可——宿主 agent 按已安装的 palimpsest 技能驱动完整循环；崩溃/关会话后说"继续"就恢复。

## 当前状态（E1–E4 已交付）

| 层 | 状态 |
|---|---|
| `src/schema` 五核心 Schema + canonical digest | ✅ 已移植，跨语言 digest parity 已验证 |
| `src/domain` 状态机 / aggregate 校验 / 受信 Policy | ✅ 已移植 |
| `src/state` 事件存储（SQLite, PLMP）／投影／快照 | ✅ 已移植，snapshot digest 与 Python 逐字节一致 |
| `src/scheduler` 确定性调度决策（Python scheduler 完整移植） | ✅ P1，fixture 从零重放 15 事件 digest 逐字节一致 |
| `src/effects` 五 Ordarium Safe Action + 共享 ledger + PromotionManager + GitPort | ✅ P1，五 action 故障注入 + Promotion Crash A/B 恢复验收通过 |
| `src/executors` claim/report 协议 + 命令执行器 + mock | ✅ P1 |
| DSH 工具面（7 工具）+ `installPalimpsest` + ProjectController | ✅ P2 |
| 多 agent 并行（角色槽位、2–4 候选、基础预算） | ✅ P3 |

系统设计规格（模块/合同/行为/非功能规范、设计推导链、阶段与验收矩阵）见 [`docs/03-system-design-spec.md`](docs/03-system-design-spec.md)；**开发者 SDK 指南**见 [`docs/04-sdk-developer-guide.md`](docs/04-sdk-developer-guide.md)（概念/嵌入/执行器/确定性/错误模型/Ordarium 集成），**API 参考**见 [`docs/05-api-reference.md`](docs/05-api-reference.md)；产品定义、分层架构、Ordarium effect 映射与阶段门见 [`docs/01-plugin-product-baseline.md`](docs/01-plugin-product-baseline.md)；入口产品线（E 线：一句话闭环、装备化 worker、断点续跑）与 DSH 工作模式兼容基线见 [`docs/02-entry-line-and-mode-compatibility.md`](docs/02-entry-line-and-mode-compatibility.md)；设计传承与权威来源声明见 [`docs/00-heritage.md`](docs/00-heritage.md)。

## 验证

```powershell
corepack pnpm install
corepack pnpm run build
corepack pnpm exec vitest run
```

测试套件（144 项）以 `fixtures/replay/baseline-v1.json` 为黄金基准，分三层机器证明：

1. **合同 parity（P0）**：fixture 全部事件重算 request/event digest、重放进真实 SQLite 并比对 snapshot digest，逐字节一致。
2. **调度器 parity（P1）**：TS Scheduler 从零复现 Python `populate()` 调用序列，重新生成的 15 事件 Event Log（含 committed_at、哈希链、双摘要）与 fixture 逐字节一致。
3. **effects 故障注入（P1）**：五 action 各过 `@ordarium/testing` FaultInjector 崩溃检查点（after-claim / after-dispatch）+ ManualClock 驱动 lease 过期重启；Promotion Crash A（合并前崩溃恢复后恰好合并一次）与 Crash B（合并落地后崩溃，reconcile 恢复且绝不二次合并）均机器验收。
4. **12 项故障验收场景（P2）**：docs/05 §3 的 pause/resume、crash recovery、snapshot rebuild、local retry、lease expiry、late result、revision change、evidence invalidation、write escape、promotion happy path、event idempotency 在插件形态全部通过。
5. **多 agent 并行（P3）**：4-candidate 批次并行、角色槽位准入（默认 implementer 2、硬上限 20）、attempt 预算耗尽拒绝、并发下 stale/late 不回归——7 项机器验收。
6. **Gate DSL（R1）**：声明式、确定性、版本化的门禁定义与求值——缺失证据记 INCOMPLETE（absence ≠ evidence of absence）、`not` 分支一票否决 FAIL、next_evidence_needed 生成证据需求——10 项机器验收。
7. **typed invalidation（R2）**：语义兼容演算——change_class（metadata_only/backward_compatible/behavior_change/contract_breaking）× 依赖边敏感度精确传播失效；metadata_only 计划不动依赖链与证据、contract_breaking 传播链式 STALE；迟到结果四分类——7 项机器验收。
8. **gate 工具集成（R3）**：palimpsest_gate 可按注册 gate 求值并回报 verdict 与缺失证据（旁边保持证据注入的向后兼容路径）——5 项机器验收。
9. **pairwise tournament（R4）**：候选以递归两两淘汰方式选出晋升者——n-1 次比较、tie 确定性、rounds 审计、judge 只见 id+summary（完整报告永不泄漏）——5 项机器验收。
10. **自适应计算分配（R5）**：六维估计（uncertainty/impact/verifiability/evidence deficit/criticality/cost）→ 规则表输出候选拔/验证者数与模型升级建议——U×V 象限防盲目扩样本、critical 强制独立验证、GPU 昂贵激进预筛——7 项机器验收。
11. **模型能力统计表（R6）**：按 task_type+model 累计成功/成本并估算预期成功成本（Gamma 平滑防除零），bestModel 选 C_success 最低者——强模型单次贵但成功率高时可能更省（§43）——6 项机器验收。
12. **科研 evidence graph（R7）**：CLAIM→EVIDENCE→EXPERIMENT→CONFIG→COMMIT→DATA 证明链；claim 状态派生（supported/contradicted/inconclusive/stale）、证据失效自动 STALE、非法边失败关闭、provenance 只沿产生性边——7 项机器验收。
13. **gate 门控晋升（R8）**：promoteWhenGatePasses——注册门禁非 PASS 拒绝晋升并回报缺失证据（INCOMPLETE/FAIL 不落 PROMOTION_COMMITTED）、PASS 才放行；未注册门禁失败关闭——3 项机器验收。
14. **验证→选择→门控晋升（R9）**：selectAndPromoteWhenGatePasses——tournament 从 4 个已验证候选选出胜者、读其 result_commit、经 gate 校验后实际晋升（PASS→PROMOTION_COMMITTED→TASK_SATISFIED；缺证据→拒绝且零 PROMOTION 事件；无候选失败关闭）——3 项机器验收。
15. **分配×槽位联动（R10）**：allocateFor 在纯规则建议上叠加 P3 并发校准——高不确定建议 8 候选时按 implementer 槽位 2 收束（concurrentLimit 2）、verifier 槽位 1 得 1、占用增长时 concurrentLimit 收紧至 0、硬上限吃紧时再收——5 项机器验收。
16. **telemetry 持久化（R11）**：模型能力累计量快照写入编排库独立扩展表，重启后 rebuildTelemetry 重建与内存一致；扩展表不进投影/snapshot，fixture parity 不受影响——3 项机器验收。
17. **命令执行器自动化接线（R12）**：pump 自动执行 claim→gate 命令→退出码映射 report；失败批次自动 settle→READY→重试直到成功（停于 VERIFYING）或预算耗尽（TASK_FAILED）；FakeGitPort 顺序 gate 队列支持‘先败后成’脚本化——4 项机器验收。
18. **入口回合（E1）**：`palimpsest_preview` 零写入、paused 安全、与下一步 `palimpsest_next` 字节一致（plan-mode 勘察面）；`palimpsest_run` 一回合机械推进 + 阶段判定（needs_worker/needs_promotion/terminal）——6 项机器验收。
19. **装备化 worker（E2）**：TaskSpec/TaskEnvelope 增加法可选字段 `suggested_skills`（缺省省略、permissive 解析、既有 fixture digest 逐字节零扰动）；policy 授权信封透传；未知技能不 fatal；宿主级等值验收——真实 git worktree 上 worker 按信封技能提示产出产物、上报、确定性取证——6 项机器验收。
20. **断点续跑（E3）**：status `resume` 恢复区块（用户语言断点 + 在途/开放任务）；杀会话后重开同一库续跑至 promote + SATISFIED；stale-world 时诚实的 `blocked` 降级（观察永不因推进性校验崩溃）——4 项机器验收。
21. **模式矩阵收口（E4）**：9 工具结构化 `mode` 声明（read-only/mutating，宿主权限层可直接消费）；read-only 面（status/preview）零写入；拒绝≠错误协议与 hooks 兼容入 SKILL；三权限模式 CLI 剧本取证——2 项机器验收。

## 依赖 Ordarium

P0 的 schema/domain/state 零外部依赖（仅 `node:sqlite` 内置）。P1 接入 Ordarium 五包（实际使用 core / ledger-sqlite / testing）：

```bash
corepack pnpm run sync:ordarium   # 从同级 Ordarium checkout 打包五 tarball 入 vendor/ordarium/dist/
corepack pnpm install             # link: + workspace overrides 解析（pnpm-workspace.yaml）
```

（单包 git 依赖因 `workspace:*` 无法解析是 Ordarium 记录在案的已知限制；五 tarball 自洽性即其 `test:package` 验证的内容。公共发布后切换为 GitHub Release URL。）

## 三句不可违背的合同

1. **AttemptReport ≠ Evidence** —— Worker 自述的 "tests passed" 不产生证据；证据只来自确定性 Gate。
2. **LLM opinion ≠ Project State** —— Manager/agent 只能提议；项目事实由证据驱动的事件变更。
3. **迟到成功 ≠ 可提交** —— 执行成功与当前可提交是两回事；stale 隔离绝不放松。
