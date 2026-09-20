# 轻度治理与选择性委派规格（用户只表达标准，机械前置由产品推导；主代理保持直接工作能力）

> **Spec ID**：`PLMP-LEAN-1` ｜ 状态：**第 1 期已交付，第 2 期规划**（2026-09-21）
> **愿景句**：用户只需要**轻度治理**；palimpsest 形成**自洽高效的多执行者协作**，从而提高**最终结果质量**与**项目管理稳定性**。
> **产品身份句**：**Palimpsest 让主代理保持正常工作能力，在值得时选择性委派，并把协作状态、证据、复核与恢复留在项目 sidecar 中，而不是塞进主代理的上下文。**
> **权威序**：系统设计以 `03-system-design-spec.md`（PLMP-SDS）为准；证据/晋升/账本语义沿用既有冻结规格，**本文不改**；"DSH 主代理当架构师、插件零内嵌 LLM"的宿主中立红线沿用 `18-architecture-modes-spec.md`。
> **修订记录**：
> - `LEAN-1` 初版（2026-09-20）：立项自 2026-09-19/20 的六轮 DSH 活体实测（`rs-test/dsh-*.out`、`interaction-report.json`、`probe-*.mjs`）；验收 `LEAN-A01`–`LEAN-A14`。
> - `LEAN-1` 第 1 期交付（2026-09-21，`217214c`）：§1 标准推导 + §4 操作者控件清理落地；`LEAN-A01`–`A04`、`A12`、`A13` 通过；活体验证：操作者只写一句中文，产品推导出命令、门禁、谓词与授权集，闭环 `verdict: PASS | missing: []`。
> - `LEAN-1` **amendment**（2026-09-21）：**主代理身份修正**——新增 §0.5 产品身份与 §0.6 七条不变量；**废除旧 L3**（多执行者默认律），代以 §0.6 `INV-6` 独立执行机会律；§3.1 派发主体从"产品默认派发"改为"主代理选择性委派 + 产品负责汇合"；§3.4 禁止条款加范围限定并显式承认直接工作路径；**§2.3 复核主体修正**——实测确认 `CURRENT_PROJECT_HEAD` 是当前运行时唯一的 subject kind（`src/project_verification/artifacts.ts:207`），其唯一入口 action 名即 `verify_current_head`（`src/adapters/dsh/project.ts:191`），且 §5 一致性规则在仓库 head ≠ 规范 head 时拒绝（`src/project_verification/service.ts:256`），因此 **in-place 执行下独立复核结构性不可能触发**——这是 `CF-AD-01` 的产品触发条件，拆出 §2.6 两层质量模型与第 2B 期；新增附录 A（第 2A 期 Completion Handoff 详细设计）、附录 B（第 2B 期 Attempt-bound Verification 详细设计）、附录 C（`PLMP-DELEGATE-1` 立项）、附录 D（近期不做清单）。

---

## 0. 立项与边界

### 0.1 实测基线：问题不是缺功能，是**错位**

六轮活体会话（fence / token / in-place 三种部署，含一次完整闭环）测出的用户动作清单：

| 用户必须做的动作 | 实际性质 | 实测代价 |
|---|---|---|
| 在 deployment profile 声明 `policy.allowed_commands` | 平台配置 | 写错即**永远产不出证据**；agent 无权修（正确），用户看到的是"活干完了、项目推不动" |
| 声明 release gate（仅 CLI） | 平台配置 | 要选 `tests_pass`/`process_exit_zero` 这类**用户不拥有的词汇**，且必须与 agent 记录的谓词一致 |
| 推调度器（单步 / 机械推进 ×20） | 操作机器 | 操作者面板把 `手搓模式`/`暂停`/`单步`/`机械推进 ×20` 交给用户 |
| 晋升 | 判断（唯一真判断） | 藏在 `Work 图面` 一个按钮里，默认要求一个用户没声明过的 `gate-release` |
| 事后对齐谓词 | 返工 | 实测中操作者只能反过来迁就 agent 已记录的谓词 |

实测中"第二个执行者"只出现过一次，且是**浪费**：机械 pump 替 agent 抢了一次 attempt，报 `completed`、`changed_files: []`、零证据——消耗预算而无产出。真正的多执行者通道（branch 执行器 / `workerDispatch` / federation / crossProject）**一次都没跑过**。

质量侧：闭环里只有 **1 条证据**（agent 自选的一条测试命令），没有第二主体独立复核；`project_verification`（`MECHANICAL_INDEPENDENT`）在更早会话里出现过，但**不在闭环内**。

稳定性侧：账本很稳（幂等、不可变声明、审计链、头对账都按设计拒绝过错误操作）；脆的是**接缝**——六轮里挖出的六个缺陷，三个是 in-place 接缝、两个是配置死路、一个是顺序契约，共同形态是"必须按特定顺序、用特定词汇做对，做错得到诚实但沉重的死胡同"。

### 0.2 一句话诊断

**产品把"操作者"当成了懂平台的工程师，把"协作"当成了调度器的机械动作。** 于是：该由产品推导的（工具链 → 可用命令 → 完成标准 → 该记录哪些证据）交给了用户；该由多执行者分担的（独立任务、独立复核）交给了单个 agent 顺手做；该在判断时刻只呈现结论的，呈现成了一组机器词汇和按钮。

### 0.3 三条设计律（本文最高约束，冲突时以上位者胜）

- **L1 一次表达律**：用户用**自己的语言**表达意图与标准**一次**；一切机械前置（可用命令、门禁条款、谓词、默认命令、调度推进）由产品**推导**并在需要时**提议**，不得要求用户先用机器词汇表达。
- **L2 推导质量律**：质量条由**任务形状**推导（是否触及测试、是否跨边界、风险高低），**独立复核默认在环**；"证据由 agent 自由选择"不再是合法默认。质量条分两层（机械完成 / 独立复核），见 §2.6。
- **L3 独立执行机会律**（**amendment 取代旧"多执行者默认律"**）：**主代理的直接工作是一等公民**；当存在**安全、可分离且具有实际收益**的独立执行边界时，产品默认允许并鼓励利用它；**不存在这种边界时，单执行者是正常形态，不叫退化**。绝不能为凑数制造执行者。完整形式见 §0.6 `INV-6`。

> **旧 L3 为什么废除**：旧表述"多执行者是默认形态，单执行者是它的退化情形"在实测中被证明会导向两个错误——把"主代理自己 read→edit→test→finish"当成需要修正的形态，以及把派发主体交给调度器（旧 §3.1）。G10-R 的既有经验结论也支持废除：人工 planner/reviewer split 在至少一个场景中是**纯开销**。多执行者的价值来自**真实的独立劳动点**，不来自数量。

### 0.4 非目标（明确不做）

- 不新增 runtime registry / discovery / reflection / service locator / 字符串键服务表（沿用 SR-1 §11）。
- 不让 adapter 承载语义策略；不让 agent 侧扩权（策略上界永远在操作者一侧）。
- 不削弱"观察替代申报"：证据仍是产品自己的观察，`exitCode` 之类的申报通道不得复活（SR-1 #134 已封）。
- 不改账本事件形状、晋升链不变式、公共 API 面；不新增 architecture exception 或 SCC。
- 不把"轻度治理"做成"无治理"：用户仍拥有接受/退回与策略上界的最终权力。

### 0.5 产品身份：Principal-first 的选择性委派 sidecar

**Palimpsest 是一个面向通用主代理的 durable collaboration sidecar。** 主代理始终是**完整的传统 Agent**——可以自己 read / edit / search / shell / 思考 / 把工作做完，甚至一次 palimpsest 调用都不发；Palimpsest 在它**旁边**承担 worker 生命周期、上下文隔离、证据、独立复核、汇合与恢复。只有某块工作值得分离时，主代理才把它委派出去。

五个词都重要：

- **主代理**：完整 Agent，**不是 ManagerAgent**；它管理 worker 状态机的能力不应存在。
- **sidecar**：**不在用户请求的必经路径上**。主代理的直接工作路径（direct path）是一等公民，不是需要被修正的退化形态。
- **selective**：不是每件事都多执行者；不存在有价值的独立边界时，单执行者是正确的。
- **durable**：项目状态、Work、证据、复核可恢复。
- **governed**：委派**不绕开** authority / evidence / promotion。

**结构（与现状一致，不是架构转向）**：主代理的原生工具来自宿主；Palimpsest 的工具作为**附加**注册进同一 registry——`host/dsh/lib/index.js` 的注册是 passthrough（`toRealTool` 只映射 Palimpsest 自己的工具定义），**不拦截**主代理自己的 read/edit/shell。宿主中立红线沿用 `18-architecture-modes-spec.md:21`：DSH 主代理当架构师，插件零内嵌 LLM。

五种**执行位**（execution locus），各有既有 owner，不新造第六种：

| 执行位 | owner | 可否写项目 | 语义 |
|---|---|---|---|
| 主代理直接工作 | 宿主 + Work Attempt | 可以 | 正常直接工作 |
| 认知分支 | ReasoningCell | **不应写** | 临时认知探索 |
| Work 执行者 | Task/Attempt + worktree | 可以 | 真正的项目执行 |
| 独立复核 | Project Verification | **不应写** | 独立协议检查 |
| 远端项目 | Federation / CrossProject | 自己项目内可以 | 主权项目协作 |

已证明的两个既有模式，新能力**复用它们而不是另起炉灶**：

- 认知分支的**上下文隔离**：一个 frozen `ReasoningBranchBrief` 进（`src/reasoning_cell/artifacts.ts:115`），恰好一条 `{statement, evidenceRefs}` 出（`src/deployment/branch_host.ts:47`）。
- 跨项目 Ask 的**异步生命周期**：`ask` 立即返回、不等答案；`status` 是纯派生（"no response yet means WAITING, not failure"）；`receive` 取终态（`src/adapters/dsh/product.ts:91`）。

### 0.6 七条不变量（本文最高约束的完整形式）

以下七条是本规格的**架构不变量**。任何实现、任何后续修订都不得违反；违反者视为缺陷而非取舍。

**`INV-1` 直接工作一等公民（Direct Path First-Class）**

```
任务只有一条自然工作线时：主代理 read → edit → test → finish 就是正确行为。
单执行者不叫退化。
```
产品**不得**要求任何工作先经过委派层。`palimpsest_finish`（附录 A）存在的意义是让这条路径**更短**，不是让它变成必经。

**`INV-2` 委派是叠加，不是模式切换（Delegation Is Additive）**

```
DirectWork XOR MultiAgent        ← 错误模型
DirectWork ∥ OptionalDelegation  ← 本规格模型
```
同一个 turn / session 内"主代理自己改模块 A"与"把调查 B 委派出去"**完全合法且应被支持**。不存在"切换为 multi-agent mode"这种状态。

**`INV-3` 三种上下文互不替代（PrincipalContext ≠ ProjectState ≠ WorkerContext）**

| 上下文 | 归谁 | 保存什么 |
|---|---|---|
| Principal Context | 宿主会话，**昂贵且稀缺** | 用户对话、当前思考、当前直接工作需要的信息、少量可行动结果摘要 |
| Project State | Palimpsest，durable | goal、requirements、tasks、attempts、evidence、verification、history、promotion |
| Worker Context | 隔离、短生命周期 | 自己的 objective、必要项目 refs、必要文件/context、自己的局部工作状态 |

只有**明确需要**的信息才跨边界。今天这条靠构造成立（branch 进出形状），本规格把它写成**显式不变量**，以防未来改动静默破坏。

**`INV-4` 编排噪音不进主上下文（Orchestration Noise Must Not Enter Principal Context）**

默认**不进入**主代理上下文：attempt id、lease、session id、retry count、event sequence、cursor、worker 进程状态、scheduler iteration。

应当**进入**：结论、改动、证据、未解决项、冲突、需要判断的东西。

但必须同时成立：

```
compress orchestration state  ≠  hide decision evidence
```
**证据不能压没。** 判断"要不要接受这次改动"需要结论**加依据**；压缩该删的是机器状态，不是证据。把"压缩"做成"隐瞒"是缺陷。

**`INV-5` 机械事实由产品观察（Product Observes Mechanical Facts）**

**禁止**让 agent 自己申报机械事实（`write_scope_valid = true` / `files_exist = true` / `tests_pass = true`）。正确模型：

```
Palimpsest 观察 diff        → scope_valid
Palimpsest 检查文件系统      → expected_files_exist
Palimpsest 执行授权命令      → tests_pass
```
Agent 只表达"我认为这块工作完成了"。这条直接根治第 1 期活体暴露的 `write_scope_valid` 语义问题（当时那条证据是**同一条测试命令被打上标签**，本身不独立证明范围）。见 §2.6 与附录 A。

**`INV-6` 独立执行机会律（Exploit useful independence; never manufacture agents）**

```
主代理的直接工作是一等公民；
当存在安全、可分离且具有实际收益的独立执行边界时，Palimpsest 默认允许并鼓励利用它；
不存在这种边界时，单执行者是正常形态。
```
判定顺序是**先问要不要委派，再问怎么委派**；"多执行者数量"**不是**产品成功指标。

**`INV-7` 执行前固定完成标准（No Hidden Moving Goalposts）**

任务开始后完成标准**不得**突然改变。质量要求必须是

```
Q_T = f(ProjectStandard, TaskEnvelope, TaskSpec, PolicyVersion)
```
并在**执行前固定**。执行后只能 `observe against Q_T`，**不能**看完结果再发明新标准。第 1 期已把 Q_T 落在 `ProjectStandard` + envelope 上，因此本条是**确认时机**问题（§8 未决项 4），不是新增机制。

---


## 1. 完成标准（Done-ness）一次声明、产品推导

### 1.1 形状：`ProjectStandard`

```ts
/** 用户语言的完成标准；由产品从仓库推导成候选，用户确认或改写。 */
interface ProjectStandard {
  readonly statement: string;                    // 用户的话，如 "测试通过，且不越界改文件"
  readonly clauses: ReadonlyArray<StandardClause>; // 推导出的机器条款（可编辑）
  readonly derivedFrom: readonly string[];       // 推导依据（如 "package.json:scripts.test"）
  readonly confirmedBy: string;                  // 操作者标识；未确认的候选不得作为门禁
}
type StandardClause =
  | { readonly kind: "command_succeeds"; readonly command: readonly string[]; readonly predicate: "process_exit_zero" | "tests_pass" | "lint_pass" }
  | { readonly kind: "files_exist"; readonly paths: readonly string[] }
  | { readonly kind: "scope_respected" };        // → write_scope_valid
```

### 1.2 推导器（`deriveProjectStandard`）

从仓库**只读探测**，产出一个**候选**（绝不自动生效）：

| 探测 | 依据 | 候选条款 |
|---|---|---|
| Node | `package.json` 的 `scripts.test` / `scripts.lint` | `command_succeeds: ["npm","test"]` / `["npm","run","lint"]` |
| Python | `pytest.ini`/`pyproject.toml`/`tests/` 且 `pytest` 可用 | `command_succeeds: ["python","-m","pytest"]` |
| Rust | `Cargo.toml` | `["cargo","test"]` |
| Go | `go.mod` | `["go","test","./..."]` |
| 其它 | 仅源码树 | `scope_respected` + `files_exist`（无命令条款） |

**探测到的命令必须经"可执行性 + 沙箱可 spawn"双重校验**（见 §5.1），不可执行的候选必须**在提议时**说明原因，而不是等用户跑到最后。

### 1.3 与既有 policy / gate / envelope 的关系

```
操作者策略（profile.policy.allowed_commands）  = 上界：绝不允许之外的东西执行
ProjectStandard（本项目完成标准，用户确认）    = 本项目"算完成"的条款
envelope.allowed_commands                      = 探测到的命令 ∩ 策略上界（自动写入，非 agent 编写）
release gate 的 require                        = Standard 的 clauses → GateDefinition
```

三者**一处生成、多处引用**：`ProjectStandard` 确认后，产品**自动声明** release gate（`gate-release`），并把它写进每个 envelope 的 `allowed_commands`。用户从此不再接触谓词词汇，也不再需要在 CLI 声明门禁。

### 1.4 禁止

- **禁止**在任何位置硬编码默认门禁命令。现状有三处：`src/composition/core.ts`（`trustedDefaultPolicy` 的 `allowed_commands`）、`src/cli.ts:344`、`src/serve.ts:461`。默认必须来自探测 + 策略。
- **禁止**由 agent 编写 `allowed_commands`；agent 只能在**已授权集合内**选择，越界必须被拒并指出可选项（现状已如此，保留）。
- **禁止**未确认的 `ProjectStandard` 生效；候选必须显式确认（会话内一句"就按这个来"或面板一次点击）。

### 1.5 验收

- `LEAN-A01`：在 Node 仓库上，**操作者不知道任何谓词词汇**也能完成一次证据记录——标准由探测提议、确认后自动声明门禁与授权命令。
- `LEAN-A02`：探测出的命令不可执行时，**提议阶段**即给出原因与替代项（不是运行时死胡同）。
- `LEAN-A03`：`envelope.allowed_commands` 恒等于"探测 ∩ 策略上界"；构造一个越界命令必须被拒且列出可选项。
- `LEAN-A04`：删除硬编码默认后，未确认标准的项目**不得**产出任何证据（诚实空态），且 readiness 明确报"未确认完成标准"。

---

## 2. 质量条由任务推导，独立复核默认在环

### 2.1 证据要求推导（`deriveTaskEvidenceRequirement`）

任务形状 → 该任务的证据要求（写进 envelope，agent 通过 `nextEvidenceNeeded` 读到）：

| 任务形状 | 要求 |
|---|---|
| 触及测试文件（或仓库有测试且任务改代码） | 至少一条 `tests_pass` 证据 |
| 写入路径跨出单一目录 / 触及边界或契约面 | 追加 `write_scope_valid` 与 `expected_files_exist` |
| 产物为文档/数据而非可执行代码 | `expected_files_exist` + `scope_respected`，不强制测试 |
| 无法判定 | 退化到 `ProjectStandard` 的全局条款（不得放空） |

### 2.2 `gateId` 默认在环（由**产品**给出，不是主代理挑选）

证据要求与门禁条款由**产品**推导并放进 envelope；主代理的正常路径是 `palimpsest_finish`（附录 A）——它一步完成"记录证据 + 结算 attempt + 派生下一步要求"，主代理**从不**自己挑 `gateId`、也从不写谓词。

`palimpsest_gate` 作为**专家通路**保留：显式带 `gateId`（或由产品在 envelope 里给出）时返回 `nextEvidenceNeeded`，供需要逐步控制、调试或研究时使用（`Kernel API = expressive`）。自由谓词（不带 `gateId`）只保留给已确认标准之外的一次性诊断，且**不计入晋升资格**。

> **amendment 修正**：初版 §2.2 写的是"把这条既有通路从专家用法变成**唯一用法**"，与附录 A 的 `finish` 冲突。二者不矛盾——**产品**始终是 `gateId` 与谓词的来源，差别只在主代理是否需要亲手逐步操作。常态是 `finish`，`gate` 是专家路径。

### 2.3 独立复核进环（复核对象必须是**本次尝试的结果**）

`project_verification` 从"可选能力"变成**默认在环**：任务满足任一条件即要求独立复核（`MECHANICAL_INDEPENDENT` 或更强）：

- 触及边界/契约/安全相关路径；
- 证据只有一条命令且任务规模超过阈值（改文件数或行数）；
- `ProjectStandard` 明确要求。

复核由**另一个执行者**承担（§3），产出 `project_verification` 事实；晋升门禁的 `require` 由 §1.3 自动带上该条款。

**但复核对象有一个实测确认的硬约束（本 amendment 的核心修正）。** 当前运行时的 `project_verification` **只能验一种 subject**：

| 实测事实 | 位置 |
|---|---|
| 唯一的 subject kind 是 `CURRENT_PROJECT_HEAD` | `src/project_verification/artifacts.ts:207` |
| subject 由 **canonical ProjectIR 投影**物化（不是工作树） | `src/project_verification/provider.ts:118` |
| 唯一入口 action 名即 `verify_current_head`；描述明写 agent 不得验任意提交 | `src/adapters/dsh/project.ts:191` |
| §5 一致性规则：实际仓库 head ≠ 规范 head 时**拒绝** | `src/project_verification/service.ts:256` |

于是"任务完成 → 跑 Project Verification → 晋升"这条朴素写法在 **in-place 执行**下会落到两个都不对的分支之一：

- **agent 已提交**（in-place 下 `report()` 记录 `resultCommit`，即工作已提交）：仓库 head 已前进到结果提交、规范 head 仍停在 base → 一致性规则**拒绝**。即 **in-place 下独立复核结构性不可能触发**。
- **agent 未提交**：一致性规则通过，但复核的是 base——真正的改动躺在工作树里从未被复核。这正是"**看起来独立复核了，其实复核的是旧世界**"的错觉。

因此 §2.3 的"默认在环"在当前运行时里**无法表达"复核这次尝试的结果"**。这不是措辞问题，而是 `CF-AD-01` 记录的天花板的产品触发条件（`docs/engineering/audits/G10-AD-CARRY-FORWARD.md:15`）。修正拆成两步：§2.6 定义正确的两层质量模型，附录 B（第 2B 期）新增 `ATTEMPT_RESULT` subject。

### 2.4 禁止

- **禁止**"单证据完成超阈任务"：晋升前若复核要求未被满足，必须拒绝并说明缺哪一条。
- **禁止**把"agent 自选谓词"当作默认路径（现状）。
- **禁止**用一条与 agent 自己相同的命令冒充"独立"复核（复核主体或环境至少有一项不同，且产品记录差异）。

### 2.5 验收

- `LEAN-A05`：改代码且仓库有测试的任务，envelope 自动带 `tests_pass` 要求；agent 不带 `gateId` 记录的证据不构成晋升资格。
- `LEAN-A06`：跨目录写入的任务自动要求 `write_scope_valid` + `expected_files_exist`。
- `LEAN-A07`：超阈任务在缺少独立复核时晋升被拒，拒绝文本点名缺哪条、由谁补。
- `LEAN-A08`：复核事实记录"主体/环境与实现者不同"的可核对差异；同主体同命令的复核被拒。

### 2.6 两层质量模型与晋升就绪

§2.3 的缺陷来自把两种**性质不同**的质量判据混成一层。正确模型是两层，各有 truth owner，**互不转化**。

**第一层：机械完成（Mechanical Completion）**——基于**当前 attempt**，全部由产品观察（`INV-5`），仍属 Work Evidence / Gate 世界：

| 判据 | 产品如何观察 |
|---|---|
| `tests_pass` / `lint_pass` / `process_exit_zero` | 产品在授权命令集内执行（cwd = 该 attempt 的执行位） |
| `write_scope_valid` | 产品观察 `git diff --name-only base..HEAD` + `git status --porcelain`，与 envelope 的 `write_paths` 比对 |
| `expected_files_exist` | 产品检查文件系统 |
| `artifact present` | 产品检查声明的产物 |

**第二层：独立复核（Independent Verification）**——仅当风险政策要求时在环。**subject 必须绑定本次尝试**，而不是当前项目 head：

```
projectId, taskId, attemptId, envelopeId, baseCommit, resultCommit, reportDigest
```
而非 `CURRENT_PROJECT_HEAD`。实现见附录 B。

**晋升就绪**由三个 truth owner 的结果**分别**给出，产品只做汇合：

```
R = G_work ∧ V_required ∧ E_promotion

G_work      = Work Evidence / Gate（产品观察）
V_required  = 独立协议结果（Project Verification）
E_promotion = 既有晋升资格（PromotionEligibility）
```

**冻结（不得违反）**：

- **禁止**把 verification PASS 铸造成 `EvidenceAtom`（不得出现 `verification PASS → mint EvidenceAtom → gate PASS` 这条链）。`PASS` 只是"那个具名协议通过了"，**不是真值**。
- **禁止**用一个旧 head 的 PASS 满足 attempt 级复核要求（附录 B 的 `LEAN-A20` 要求机器证明二者不等价）。
- 三个 truth owner 保持分开，是本层设计的**全部意义**。

---

## 3. 选择性委派：主代理发起，产品汇合

### 3.1 派发主体是**主代理**，不是调度器

**"多执行者"必须拆成三个性质完全不同的问题**，不能设计一个 `spawn_agent()` 然后全往里面塞：

| 类别 | 问题形态 | 既有 owner | 可否写项目 |
|---|---|---|---|
| **A 认知并行** | 这个问题有多种解释/方案 | ReasoningCell（branch） | **WriteSet = ∅** |
| **B Work 并行** | Task A 与 Task B 是真正独立的项目工作 | Task/Attempt + worktree | 可以（治理难度最高） |
| **C 独立复核** | 实现已存在，需要另一独立主体检查 | Project Verification | **不应写** |

```
MultiExecutor = CognitiveParallelism ∪ WorkParallelism ∪ IndependentVerification
```

**派发由主代理发起**（`INV-1`/`INV-2`/`INV-6`）：产品**不默认派发**、不自动把独立任务分给不同执行者。产品的职责是——当主代理选择委派时——承担上下文分片、并发上限、租约、结果回收与汇合。产品可以在被问到时**建议**某块工作适合委派（§8 未决项 6），但建议不是派发。

**当前实现缺口（本 amendment 记录，附录 C 立项修）**：今天多执行者只能由产品在**一次请求内**发起——`palimpsest_collaborate` 是阻塞的 one-request 调用（主代理调它就得等，无法同时干自己的活），`workerDispatch` 只是 effects 层的内部动作（`src/effects/actions.ts:285`），**主代理够不到**。这正是实测中"真正的多执行者通道一次都没跑过"的结构原因：不是通道坏了，是没有给主代理的入口。

### 3.2 汇合与冲突

- 汇合由产品执行：按依赖顺序把各执行者的 `result_commit` 依次晋升，冲突在**晋升前**用既有 `write_paths`/scope 证据暴露，而不是在 git 层撞车。
- 冲突策略必须显式：写路径重叠的任务**不得**并发派发（在计划校验期即拒绝并给出串行化的计划修订）。

**写冲突规则必须覆盖主代理自己**，不是只比较 workers：

```
∀ i ≠ j : Mutating_i ∧ Mutating_j  ⇒  WriteSet_i ∩ WriteSet_j = ∅
其中 i, j ∈ { 主代理的 in-place attempt, Worker A, Worker B, ... }
```

**产品只有在主代理正处于一个受管 in-place attempt 中时才知道 `PrincipalWriteSet`。** 如果主代理完全绕过 Work（直接用 edit 改仓库、没有 active attempt），则 `PrincipalWriteSet = unknown`，此时**不得**宣称 mutating delegation 安全。v1 必须 **fail closed**：

```
现在可以委派认知类工作。
要委派会写项目的工作，请先进入一个受管任务，这样你的写范围才是已知的。
```

**但这句话不得成为推给主代理的机器概念**（否则违反 `INV-1` 与 §0.5）。正确做法是 `palimpsest_delegate` / `palimpsest_finish` **自动完成 claim**，主代理只说"我要委派这块"。§8 未决项 6 记录该选择。

**更深的内核限制（必须显式承认）**：当前 Palimpsest **不支持 old-base 并行晋升**——`A based on H0` 与 `B based on H0`，A 晋升 `H0 → H1` 之后，B **不能**把基于 H0 的结果晋升到 H1（`cross_revision_promotion_not_supported`，`src/domain/promotion_eligibility.ts:46`；G10-X/Z 已冻结）。即使 `WriteSet(A) ∩ WriteSet(B) = ∅` 也一样。因此：

```
write-set 不相交是必要条件，不是充分条件
```

**真正的并行代码 worker 不得在近期的任何一期草率打开**；需要它时走附录 C 的 D3（Result Transplant），**绝不**放松 G10-Z。

### 3.3 空产出的硬规则（收窄：只约束 Work 执行位）

**任何消耗 attempt 预算的 Work 执行者必须留下可观察的工作**：`report(completed)` 在观察到的 `changed_files` 为空、且 `produced_artifacts` 为空时**必须被拒**，并提示改为 `failed`/`cancelled` 或修订计划。这条直接消灭实测中那次"机械 pump 报 completed、零产出、零证据"的浪费。

**收窄（amendment 新增）**：真正只需要分析、不需要修改项目的任务**不应该被硬塞成 Work Attempt**——它应该走认知分支 / 独立复核 / 跨项目 Ask。因此：

- **禁止**给 `TaskSpec` 增加 `allow_empty_output = true` 这类开关；正确做法是**路由**，不是豁免。
- 空产出拒绝文本必须**指出正确的执行位**（"这类任务请走认知分支或跨项目 Ask"），符合 §5.3。

### 3.4 禁止

**适用范围限定（amendment 新增）**：以下禁止条款**仅适用于存在独立任务的任务图**，即"任务图中确有可分离的独立工作"这一前提下。它们**不适用于直接工作路径**——主代理 read → edit → test → finish（`INV-1`）**不是**本节的禁止对象，且不得被任何实现读成禁止对象。

- **禁止**在**存在独立任务的任务图中**把多执行者协作降级为"单个 agent 顺手做完，账本旁观"。
- **禁止**机械 actor 在无可观察产出时占用 attempt 预算（§3.3）。
- **禁止**并发派发写路径重叠的任务（§3.2，比较集合必须含主代理的 in-place attempt）。
- **禁止**为凑数制造执行者（`INV-6`）；"多执行者数量"不得成为任何验收项或指标。
- **禁止**让产品默认派发（§3.1）；派发主体是主代理。

### 3.5 验收

- `LEAN-A10`：写路径重叠的计划在启动校验期被拒，并给出串行化修订建议；比较集合**包含**主代理的 in-place attempt（构造"主代理改 A、委派 worker 也改 A"必须被拒）。
- `LEAN-A11`：**移交第 2A 期**（`palimpsest_finish` 是空产出拒绝的落点，见附录 A `LEAN-A17`）。
- `LEAN-A09`：**移交 `PLMP-DELEGATE-1`（附录 C，D2 阶段）**——它要求"两个执行者完成三任务项目"，在旧 §3.1（产品默认派发）下成立，在新方向下必须由主代理发起委派才成立，故随 §3 重新定界。

---

## 4. 用户的常态动作只剩一个：晋升边界的接受 / 退回

### 4.1 形状

一屏（面板内或会话内等价呈现）给出**结论与依据**，用户只做一次选择：

```
本次改动：src/dedupe.ts、test/dedupe.test.ts（+42 −3）
证据：tests_pass 通过（产品执行，exit 0）｜ scope 校验通过
复核：独立执行者 B 复跑（不同环境），PASS
未验证：无
风险提示：无
[ 接受 ]   [ 退回并说明 ]
```

### 4.2 入口合一

"声明完成标准"与"接受结果"必须在**同一处**可达（面板与 CLI 同源）；默认门禁按 §1.3 自动声明，因此**不存在**"按钮要一个没人声明过的 gate"这种死路。

### 4.3 禁止

- **禁止**任何用户可见的操作者控件出现：谓词词汇、attempt 选择器、**exit code 输入框**。
  （实测缺陷，**已在第 1 期修复**：`web/src/Panels.tsx` 的"记录门禁证据"表单曾收集 `exitCode` 且默认命令写死 `python -m pytest`，而服务端已忽略该字段并改为真实执行——**控件在说谎**。现表单已无 `exitCode` 字段，命令与门禁改为选择，由 `LEAN-A13` 的源码级断言守住。）
- **禁止**把调度推进（单步/机械推进）作为用户的常规动作；它只能是诊断面板里的高级项。
- **禁止**接受/退回按钮依赖用户先手工完成任何机器步骤。

### 4.4 验收

- `LEAN-A12`：从"agent 完成"到"用户接受"的路径上，用户**零次**接触谓词/attempt id/exit code/调度步进。
- `LEAN-A13`：新项目上"接受"按钮**立即可用**（门禁按 §1.3 已声明），不存在 `gate-release is not declared` 死路；面板源码中不再存在 `exitCode` 表单字段（源码级断言）。

---

## 5. 稳定性：接缝必须是前置校验，不是事后发现

### 5.1 readiness 必须校验**操作者自己的配置**

现有 readiness 诚实报告"8 个未配置平面"，但**不校验**用户自己写下的东西。新增校验（全部进 readiness，且进会话开场摘要）：

| 校验 | 失败后果（现状） | 失败后应有 |
|---|---|---|
| `policy.allowed_commands` 是否可执行、是否覆盖探测到的工具链 | 跑到最后才知道永远产不出证据 | 启动即报，并给出建议条款 |
| 探测到的命令在**沙箱内**能否 spawn（如 Node test runner 需要 `--test-isolation=none`） | agent 自行发现并绕行 | 探测期给出可用形式，写入候选标准 |
| 完成标准是否已确认 | 空态无解释 | 开场一句"请确认完成标准" |

### 5.2 顺序契约由产品保证

任何"必须先做 A 才能做 B"的顺序，产品必须在启动时把 A 做完或给出明确入口（例：gate 必须先于证据 → 项目启动时按 §1.3 自动声明默认门禁）。**不得**要求用户用机器词汇、按未文档化的顺序完成前置。

### 5.3 每条拒绝必须给出补救路径

拒绝文本必须命名**具体的补救动作**（哪条命令、哪个路径、哪两个提交、哪个下一步工具）。这是既有方向（#134/#137/#138 已做到），本文把它升格为规格：**没有补救路径的拒绝视为缺陷**。

### 5.4 验收

- `LEAN-A14`：在一个故意配错 `allowed_commands` 的部署上，**启动**即报告失败原因与建议；在一个 Node 仓库上，探测期即给出沙箱可用的测试命令形式。

---

## 6. 依赖与不改的东西（冻结清单）

| 冻结项 | 依据 |
|---|---|
| 证据原子的形状与"观察替代申报" | SR-1 #134；本文不得复活申报通道 |
| 晋升链不变式与 head 对账 | G10-X / G10-Z |
| 账本事件形状、幂等键、不可变声明 | 既有 schema |
| 公共 API 面与 architecture 门禁 | SR-1 §4/§28（`public-api` 0/0/0，0 violation，不新增 exception/SCC） |
| DSH 宿主中立（插件零内嵌 LLM） | `18-architecture-modes-spec.md` 红线 |
| 操作者拥有策略上界与接受权 | 本文 §0.4 |
| **复核 ≠ 证据；`PASS` ≠ 真值** | G10-AD；本文 §2.6 |
| **不放松 G10-Z**（old-base 跨 revision promotion） | G10-X/Z；本文 §3.2、附录 C D3 |
| **不新增 `DelegationStore` / `DelegationEvent` / `DelegationAuthority`** | 本文 §0.5；附录 C（委派是**投影**，不是新的真值种类） |
| **不新增 `UniversalDelegationContext`** | 附录 C（复用各 owner 既有的上下文类型） |
| **主代理的直接工作路径**（direct path） | 本文 §0.6 `INV-1`；任何实现不得使其成为必经委派 |
| **不扩大 canonical `AttentionService` 的语义** | 附录 C（主代理侧注意力在 application/host 层合成） |

---

## 7. 交付路线图与出口

| 顺序 | 阶段 | 目的 | 改内核？ | 出口（确定性可验） |
|---:|---|---|---|---|
| **0** | `LEAN-1` amendment（**本文**） | 修正 L3、冻结七条不变量与 direct path、修正复核主体 | 否（仅文档） | 本文合并且全文无自相矛盾；无验收项 |
| **1** | `LEAN-1` 第 1 期（**已交付** `217214c`） | 标准推导 + 操作者控件清理 | 很少 | `A01`–`A04`、`A12`、`A13` |
| **2A** | Completion Handoff | `palimpsest_finish`：主代理做完工作后不再亲自操作治理机器 | 很少 | `A05`、`A06`、`A14`、`A15`–`A18`（`A17` 承接旧 `A11`） |
| **2B** | Attempt-bound Verification | 正确的复核 subject（`ATTEMPT_RESULT`），触发 `CF-AD-01` | 是，小而明确 | `A07`、`A08`、`A19`–`A21` |
| **3** | `PLMP-DELEGATE-1` D1：异步认知委派 | 主代理自己工作 + 后台认知并行 | 否/极少 | `DEL-A01`–`DEL-A04`；且 `WORK` 类委派在写范围未知时 **fail closed**（§3.2） |
| **4** | `PLMP-DELEGATE-1` D2：异步 Work 委派 | isolated worker，exclusive mutation | 中 | `A10`（承接旧 §3.5）；`A09` 随 D2 重新定界；D2 专属活体 |
| **5** | Dogfood checkpoint | 判断是否**真的**需要并发写 | 无 | 一份判断结论（无验收项） |
| **6** | `PLMP-DELEGATE-1` D3：并发写 | Result Transplant + multi-writer | 只有真实需求才做 | D3 专属验收在 `PLMP-DELEGATE-1` 内定义 |
| **7** | Adaptive delegation | 用 empirical history 改善委派选择 | 产品层 | 产品层验收（无内核门禁） |

**第 2 期拆分的理由**：2A 与 2B 解决两个不同问题——2A 是"人不管治理机器"，2B 是"复核对象正确"。2A 几乎不动内核且立刻消除实测中"工作完成但 attempt 停在 RUNNING"的摩擦；2B 必须动 subject kind，风险小而明确。两者不应捆在一起交付。

**验收项去向（amendment 重映射，避免孤儿）**：`A09` 与 `A10` 原本挂在旧 §3（产品默认派发）下；`A11` 原挂在旧 §3.3 下。现分别移交 D2、D2、2A（成为 `A17`）。`A05`–`A08` 保留但改挂到 2A/2B。

每阶段必须：确定性门禁（`tsc -b`、vitest、`architecture:check`、`check-public-api`、playwright）全绿；新增活体场景脚本落 `rs-test/`；**不得**新增 architecture exception/SCC，不得变更公共 API。**任何工具契约变更**（如 2B 新增 action）必须显式登记进 `REVIEWED_TOOL_CONTRACT_CHANGES` 并通过 golden parity，不得顺手改。

---

## 8. 待操作者裁决（实现前需要一句话）

1. **接受/退回的形态**：面板内为主、会话内等价呈现（推荐），还是只做其中之一？
2. **独立复核阈值**：全部任务默认在环，还是仅超阈任务？（影响成本与延迟。**amendment 收窄为 §2.6 的两层模型 + 附录 B 的风险推导表**。）
3. **并发上限与冲突策略**：默认并发数，以及写路径重叠时的处理（拒绝计划 vs 串行化重排）。
4. **`ProjectStandard` 的确认时机**：项目启动时一次确认（推荐），还是每次晋升时确认？（`INV-7` 只要求"执行前固定"，不指定时机。）
5. **in-place 执行与独立复核的关系**（**amendment 新增，第 2B 期前必须裁决**）：§2.3 实测显示 in-place 下当前复核无法触发，三条路——
   - **(a)（推荐）** in-place 下复核改验"**提交后的结果提交**"：`subject.resultCommit` = attempt 记录的提交，在 in-place 下它就等于仓库 head，§5 一致性规则自然通过，**不需要改执行模式**。
   - (b) 独立复核只在 promotion **之后**进行，以结果提交为 subject。
   - (c) 要求需要独立复核的任务改走 **worktree** 执行器（复核对象天然隔离，但放弃 in-place 的即时性）。
6. **委派时的写范围 claim 是否自动**（**amendment 新增**）：§3.2 要求 mutating 委派在 `PrincipalWriteSet` 未知时 fail closed。是把"先进入受管任务"这句话推给主代理（违反 `INV-1`），还是由 `palimpsest_delegate` / `palimpsest_finish` **自动 claim**（**推荐**）？以及产品是否可以在被问到时**建议**某块工作适合委派（`ASSIST` 模式）？

---

## 附录 A（第 2A 期）：Completion Handoff —— `palimpsest_finish`

### A.1 目标

实测最后一次活体会话的形态是：主代理做完了代码，`tests` 通过、scope 通过、gate 可以 PASS，但 **attempt 仍停在 RUNNING**——因为主代理与内核之间还有协议摩擦（它得自己 report、自己挑谓词、自己对齐门禁）。本期的目标是一条不变量：

```
主代理做完工作后，不再亲自操作治理机器。
```

依据：`INV-1`（直接路径一等公民）、`INV-5`（机械事实由产品观察）、`L1`（一次表达）。

### A.2 工具形状

```ts
palimpsest_finish
  input : { summary?: string }        // 只需要"我认为这块完成了"这一句
  拒绝  : attemptId / gateId / predicate / exitCode / changedFiles / workerId / authority
```

不需要主代理提供 `attemptId`、`gateId`、`predicate`、`exitCode`、`changedFiles`——这些全部由产品派生。

> **契约变更提示**：这是**新增工具**，必须显式登记进 `REVIEWED_TOOL_CONTRACT_CHANGES` 并通过 golden parity（§7 的通用要求），不得顺手加。

### A.3 推导链（一次调用内完成）

```
1. 找到当前主代理唯一的 active attempt
     0 个 或 >1 个 → 拒绝，并给出补救（进入/收敛到唯一受管任务）
2. 观察执行位
     in-place → git diff --name-only base..HEAD + git status --porcelain（过滤 .palimpsest/）
     worktree → 该 attempt 的 worktree 观察
3. 派生 changed_files
4. 与 envelope.write_paths 比对            → write_scope_valid      （产品观察，INV-5）
5. 检查声明的产物                          → expected_files_exist   （产品观察）
6. 在授权命令集内执行 CompletionContract 命令 → tests_pass / lint_pass / process_exit_zero
     （授权集 = 探测 ∩ 策略上界，§1.3；产品在正确 cwd 下真实执行并记录**自己观察到的**退出码）
7. 记录产品观察到的 Evidence 原子
8. 生成 AttemptReport
9. 结算 attempt（COMPLETED）
10. 派生 nextEvidenceNeeded（若 §2.3/附录 B 要求复核，则指向复核）
```

### A.4 失败模式：attempt **保持 RUNNING**，绝不结算

| 情形 | 行为 |
|---|---|
| 测试/命令失败 | attempt 保持 RUNNING；返回**确切失败 + 补救**（哪条命令、观察到什么） |
| scope 越界 | attempt 保持 RUNNING；**点名越界路径** |
| 空产出（§3.3） | 拒绝，并**指出正确的执行位**（认知分支 / 复核 / 跨项目 Ask） |
| 无 active attempt | 拒绝，给出进入受管任务的入口 |

### A.5 禁止

- **禁止** `finish` 接受 `exitCode` / `changedFiles` / `predicate` / `gateId`（`INV-5`、SR-1 #134 不得复活申报通道）。
- **禁止**在机械事实未通过时结算 attempt（不得"先完成、后补证据"）。
- **禁止** `finish` 铸造 Evidence 之外的任何真值。
- **禁止** `finish` 触发晋升——晋升仍是操作者唯一的真判断（§4）。

### A.6 验收

- `LEAN-A15`：主代理 `read → edit → shell → finish`（**一次** `finish` 调用）后 attempt 为 COMPLETED、证据齐、gate PASS；主代理全程**零次**接触 `predicate`/`gateId`/`attemptId`/`exitCode`/`report`（源码级 + 活体双证）。
- `LEAN-A16`：测试失败时 attempt **保持 RUNNING**，返回确切失败与补救，且**不产生** PASS。
- `LEAN-A17`：空产出 `finish` 被拒，拒绝文本指出正确执行位（**取代旧 `LEAN-A11`**）。
- `LEAN-A18`：`finish` 记录的 `write_scope_valid` 是**产品观察**——构造"agent 声称在范围内、实际越界"必须被拒（**根治第 1 期暴露的 scope 证据语义问题**：当时那条证据是同一条测试命令被打上标签，本身不独立证明范围）。

### A.7 活体场景

```
用户给一句标准
→ 主代理直接工作（read / edit / shell）
→ 主代理只调用一次 finish
→ attempt completed、证据完整、gate PASS
→ 操作者看到接受/退回界面（§4.1）
```

---

## 附录 B（第 2B 期）：Attempt-bound Verification

### B.1 触发 `CF-AD-01`

`CF-AD-01` 的原文触发条件是"A product need to verify something that is not the project head, **WITH a different admission design**"（`docs/engineering/audits/G10-AD-CARRY-FORWARD.md:15`）。§2.3 的实测正是这个需求，本期即其产品触发。

### B.2 新 subject 形状（**扩展 subject kind，不新建第二套 Verification**）

```ts
interface AttemptResultVerificationSubject {
  readonly schemaVersion: 1;
  readonly kind: "ATTEMPT_RESULT";
  readonly projectId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly envelopeId: string;
  readonly baseCommit: string;
  readonly resultCommit: string;
  readonly reportDigest: string;
  readonly digest: string;    // canonicalDigest({ domain: ATTEMPT_RESULT_SUBJECT_DOMAIN, subject })
}
```

要点：

- **不是** head subject，故不带 `projectRevision` / `projectDigest` / `headCommit`。
- **不是**新的真值种类。`VerifierRegistry`、`IndependenceClass`、`VerificationHistory`、`PASS|FAIL|SCORE|UNRESOLVED|ERROR` **全部复用**。
- 新增一个 **Work-backed read port** 供物化：从 attempt 的 canonical 记录读 `resultCommit` / `reportDigest`，**调用方永不指定验证目标**（沿用既有 §4 纪律）。

### B.3 §5 一致性规则的推广

保持两条既有纪律不变——"subject 必须由 canonical 状态物化"、"ambient git 永不被当作 subject"——只是比较对象随 subject kind 变化：

| subject kind | 一致性比较 |
|---|---|
| `CURRENT_PROJECT_HEAD`（现状） | 仓库 head == `subject.headCommit` |
| `ATTEMPT_RESULT`（新增）· in-place | 仓库 head == `subject.resultCommit`（attempt 待晋升期间成立：`report()` 记录的 `resultCommit` 就是仓库 HEAD） |
| `ATTEMPT_RESULT`（新增）· worktree | 该 attempt 的 worktree head == `subject.resultCommit` |

不一致 → **拒绝**（与现状同一精神）。

### B.4 风险推导（何时要求独立复核）

| 任务形状 | 复核要求 |
|---|---|
| 小 / 本地 / 机械（单文件、有测试、不触边界） | **不要求**认知复核（机械证据足够） |
| 触及边界 / 契约 / 安全相关路径 | 要求独立复核 |
| 大（改文件数或行数超阈） | 要求独立复核 |
| 只有一条证据命令 | 要求独立复核 |
| `ProjectStandard` 明确要求 | 要求独立复核 |

### B.5 工具契约变更登记

`palimpsest_verification` 现 action 集为 `["status", "history", "verify_current_head"]`（`src/adapters/dsh/project.ts:191`），新增 `verify_attempt_result`：

- 这是**工具契约变更** → 必须登记进 `REVIEWED_TOOL_CONTRACT_CHANGES` 并通过 golden parity。
- 已核：`PROJECT_VERIFICATION_SUBJECT_KINDS` **不在** `architecture/public-api-baseline.json` 中，故公共 API 面 `0/0/0` **不受影响**。即：架构上便宜，但契约可见，**必须显式登记**。

### B.6 禁止

- **禁止**把 attempt 的 PASS 铸造成 `EvidenceAtom`（§2.6）。
- **禁止**用 `CURRENT_PROJECT_HEAD` 的 PASS 满足 attempt 级复核要求（`LEAN-A20` 要求机器证明二者不等价）。
- **禁止**让调用方指定 `resultCommit`。
- **禁止**在 in-place 工作未提交时声称"复核了结果"。

### B.7 验收

- `LEAN-A19`：`ATTEMPT_RESULT` 复核可跑通——in-place 下 attempt 提交后、晋升前，`subject.resultCommit` 成立且复核 PASS。
- `LEAN-A20`：**机器证明** `CURRENT_PROJECT_HEAD` 复核 ≠ `ATTEMPT_RESULT` 复核：一个旧 head 的 PASS **不能**满足 attempt 级要求。
- `LEAN-A21`：风险推导生效——小/本地任务不要求认知复核；边界/大/单证据任务缺复核时晋升被拒并点名缺哪条、由谁补（承接 `LEAN-A07`）。

---

## 附录 C（立项）：`PLMP-DELEGATE-1` —— 选择性委派运行时

> **另起规格的理由**：`LEAN-1` 解决"**人**不操作治理机器"；`PLMP-DELEGATE-1` 解决"**主代理**不管理 worker 机器"。两者关联，但不是同一个问题。本附录只做立项与边界冻结，不写完整设计。

### C.1 问题

主代理今天**没有 agent 发起的委派原语**（§3.1）：`palimpsest_collaborate` 是阻塞的 one-request 调用，`workerDispatch` 是 effects 层内部动作。于是"主代理边自己干活边委派"做不到——这是实测中多执行者通道从未跑过的结构原因。

### C.2 产品接口

```ts
palimpsest_delegate
  actions : prepare | start | status | receive | inspect
  常规路径 : start
  input   : { task: string, kind?: AUTO|RESEARCH|WORK, paths?: string[], projectRefs?: string[] }
  拒绝    : workerId / sessionId / attemptId / lease / authority / admissionDecision
  返回    : { delegationRef, kind, state: "STARTED", detail }   // 立即返回
```

`status()` **保留**给 debug / restart recovery / explicit inspection，**不是正常工作流**（见 C.6）。

### C.3 不建立 `DelegationStore`

真实状态已各有 owner：

| delegation kind | canonical owner |
|---|---|
| `RESEARCH` | ReasoningCell |
| `WORK` | Work Task/Attempt |
| `VERIFY` | Project Verification |
| `CROSS_PROJECT` | Federation / thread |

```
Delegation is a projection, not a new truth species.
```

`delegationRef` 只是一个**可解析的 routing reference**，概念形状：

```
dlg:v1:reasoning:<cell>:<branch>
dlg:v1:work:<attempt>
dlg:v1:verify:<run>
dlg:v1:project:<request>
```

**禁止** `DelegationStore` / `DelegationEvent` / `DelegationAuthority`——它不是新的 identity ontology。

### C.4 上下文类型复用（不发明万能 capsule）

| kind | 复用既有类型 |
|---|---|
| `RESEARCH` | `ReasoningBranchBrief` |
| `WORK` | `TaskEnvelope` + `ContextManifest` |
| `VERIFY` | `VerificationSubject` |
| `CROSS_PROJECT` | `PROJECT_ASK` packet |

**禁止** `UniversalDelegationContext`（会形成第二套语义体系）。真正需要冻结的只有一条：

```
任何 backend 都不得默认收到主代理的全部 conversation / session。
```

### C.5 worker → principal 只返回 result projection

主代理**不接收** worker session，只接收统一投影：

```
Delegated result completed.
结论：
可观察的工作：
证据：
复核：
未解决项：
冲突：
```

需要深入时用 `inspect(ref)` 做 **progressive disclosure**。`INV-4` 同时生效：压缩的是编排状态（attempt id / lease / session / event id / cursor），**不是**决策证据。

### C.6 不要求主代理 polling

- 新增 **`PrincipalAttentionComposer`**（application/host 层）合成：既有 federation/boundary attention ＋ 委派终态投影 ＋ 复核 needs-attention ＋ 需要主代理的 Work 阻塞。
- 输出仍是一小组**可行动项**；host runner 继续 `agent.followup(...)`。
- **禁止**扩大 canonical `AttentionService` 的语义。
- 主代理**不得**需要 `status? status? status?`。

### C.7 三代与 Result Transplant

| Stage | 能力 | 主要风险 |
|---|---|---|
| **D1** | 异步 **RESEARCH** 委派 | 很低 |
| **D2** | **exclusive** mutating WORK 委派 | 中 |
| **D3** | **concurrent** mutating 委派 + Result Transplant | 高 |

**D1 最先做**：`WriteSet(worker) = ∅`，不引入 git/head 问题，且直接验证核心体验——

```
主代理：delegate research B → 调用立即返回
主代理：继续修改 A
worker：完成 B
attention：B 就绪
主代理：吸收摘要
```

**D2**：后台 worker 可以修改项目，但项目同时**只有一条 mutating line**。主代理此时可以 read / reason / search / 委派认知 / 与用户对话，但**不应**同时开展另一条 mutating Work 路径。证明：isolated worktree + 真 attempt + 真 evidence + 真 report + 真 promotion + 异步返回 + attention 完成通知。

**D3**：只有真实 dogfood 证明 D2 的串行 mutation 是**瓶颈**以后才做。这时引入 **Result Transplant**，而**不是**弱化晋升 authority：

```
Worker B 在 H0 完成        → B 的结果历史留存
主代理 A 晋升 H0 → H1
Palimpsest 在 H1 上开一个【新的】B attempt
机械移植 B 的 patch
检查写路径兼容
重跑全部机械证据
重跑要求的独立复核
正常 H1 晋升
```

即 `Attempt_{B,H0} ≠ Attempt_{B,H1}`：**不修改历史、不假装旧 authority 仍有效**。

> **绝不**放松 G10-Z 允许"旧 attempt 跨 revision promote"——那会重新打开一批已封住的 authority 问题。

### C.8 `AttemptExecutionPlacement`（先研究派生，不马上改 schema）

现状 `ProjectController.execution = "in-place" | "worktree"` 是 **controller 级**，长期需要 **attempt 级**（主代理 attempt → in-place；Worker A/B → worktree）。但：

- **不马上修改 event schema**；
- 先研究能否从既有 `worktree.create` effect / attempt id / Ordarium operation **可靠派生** placement；
- **可派生就不要**把 placement 变成新的 canonical field；只有重启后无法可靠推导时，才考虑增加持久绑定。

### C.9 与管理模式的关系（不新增 autonomy scalar）

现有 `MANAGEMENT_INVOLVEMENTS = ["DIRECT", "ASSIST", "MANAGE", "DELEGATE"]`（`src/project_management/profile.ts:35`）已足以约束委派的产品行为，**不需要**新增 `auto_multi_agent = true` 这类 scalar：

| Mode | 产品行为 |
|---|---|
| `DIRECT` | 不自动启动委派；主代理可显式调用 |
| `ASSIST` | 可以**建议**"这个调查适合委派" |
| `MANAGE` | 可自动启动安全的 read-only / 机械复核 |
| `DELEGATE` | 可在既有计划与预算内自动调度允许的 worker |

仍满足 `effective permission = semantic authority ∩ management policy ∩ capability availability`。

### C.10 验收（D1 出口）

- `DEL-A01`：`start` 立即返回 `delegationRef`，主代理在同一 turn 内**继续直接编辑**；后台完成后经 attention 呈现终态投影。
- `DEL-A02`：worker 上下文 == `ReasoningBranchBrief`，**不含**主代理对话（断言 brief 形状）。
- `DEL-A03`：主代理全程**不需要** status 轮询（源码 + 活体断言）。
- `DEL-A04`：架构断言——**不存在** `Delegation*` 类型 / 事件 / 存储。

---

## 附录 D：近期明确不做（anti-waste）

1. 不新增 `ManagerAgent`。
2. 不新增 `DelegationStore` / `DelegationEvent` / `DelegationAuthority`。
3. 不把主代理全上下文复制给 worker。
4. 不把认知分支（Reasoning branch）改成代码 worker。
5. 不把 Project Verification 的 `PASS` 伪装成 Work Evidence。
6. 不让 old-base worker 结果直接跨 revision promotion。
7. 不为并发把 execution mutex 写成 Task dependency。
8. 不把"多 Agent 数量"做成产品成功指标。
9. 不让主代理 poll worker。
10. 不删除既有 low-level kernel tools（`palimpsest_reasoning` / `palimpsest_recipe` / `palimpsest_verification` / `palimpsest_manage` / 低层 Work 工具等**全部保留**）。

因此：

```
Kernel API   = expressive   （可操作的多 Agent 内核，研究/调试/自定义能力不损失）
Principal API = opinionated （主代理的首选路径是少量高层工具）
```
