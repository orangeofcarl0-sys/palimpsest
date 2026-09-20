# 轻度治理与多执行者协作规格（用户只表达标准，机械前置由产品推导）

> **Spec ID**：`PLMP-LEAN-1` ｜ 状态：**规划**（2026-09-20）
> **愿景句**：用户只需要**轻度治理**；palimpsest 形成**自洽高效的多执行者协作**，从而提高**最终结果质量**与**项目管理稳定性**。
> **权威序**：系统设计以 `03-system-design-spec.md`（PLMP-SDS）为准；证据/晋升/账本语义沿用既有冻结规格，**本文不改**；"DSH 主代理当架构师、插件零内嵌 LLM"的宿主中立红线沿用 `18-architecture-modes-spec.md`。
> **修订记录**：`LEAN-1` 初版（2026-09-20）：立项自 2026-09-19/20 的六轮 DSH 活体实测（`rs-test/dsh-*.out`、`interaction-report.json`、`probe-*.mjs`）；验收 `LEAN-A01`–`LEAN-A14`。

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
- **L2 推导质量律**：质量条由**任务形状**推导（是否触及测试、是否跨边界、风险高低），**独立复核默认在环**；"证据由 agent 自由选择"不再是合法默认。
- **L3 多执行者默认律**：多执行者是**默认形态**，单执行者是它的**退化情形**；任何消耗 attempt 预算而不产出可观察工作的执行者都是缺陷。

### 0.4 非目标（明确不做）

- 不新增 runtime registry / discovery / reflection / service locator / 字符串键服务表（沿用 SR-1 §11）。
- 不让 adapter 承载语义策略；不让 agent 侧扩权（策略上界永远在操作者一侧）。
- 不削弱"观察替代申报"：证据仍是产品自己的观察，`exitCode` 之类的申报通道不得复活（SR-1 #134 已封）。
- 不改账本事件形状、晋升链不变式、公共 API 面；不新增 architecture exception 或 SCC。
- 不把"轻度治理"做成"无治理"：用户仍拥有接受/退回与策略上界的最终权力。

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

### 2.2 `gateId` 默认在环

`palimpsest_gate` 的默认行为改为：**必须携带 `gateId`**（或由产品在 envelope 里给出），并把 `nextEvidenceNeeded` 作为返回的一部分——把"先声明门禁、agent 按缺失项记录"这条既有通路从专家用法变成**唯一用法**。自由谓词（不带 `gateId`）只保留给已确认标准之外的一次性诊断，且**不计入晋升资格**。

### 2.3 独立复核进环

`project_verification` 从"可选能力"变成**默认在环**：任务满足任一条件即要求独立复核（`MECHANICAL_INDEPENDENT` 或更强）：

- 触及边界/契约/安全相关路径；
- 证据只有一条命令且任务规模超过阈值（改文件数或行数）；
- `ProjectStandard` 明确要求。

复核由**另一个执行者**承担（§3），产出 `project_verification` 事实；晋升门禁的 `require` 由 §1.3 自动带上该条款。

### 2.4 禁止

- **禁止**"单证据完成超阈任务"：晋升前若复核要求未被满足，必须拒绝并说明缺哪一条。
- **禁止**把"agent 自选谓词"当作默认路径（现状）。
- **禁止**用一条与 agent 自己相同的命令冒充"独立"复核（复核主体或环境至少有一项不同，且产品记录差异）。

### 2.5 验收

- `LEAN-A05`：改代码且仓库有测试的任务，envelope 自动带 `tests_pass` 要求；agent 不带 `gateId` 记录的证据不构成晋升资格。
- `LEAN-A06`：跨目录写入的任务自动要求 `write_scope_valid` + `expected_files_exist`。
- `LEAN-A07`：超阈任务在缺少独立复核时晋升被拒，拒绝文本点名缺哪条、由谁补。
- `LEAN-A08`：复核事实记录"主体/环境与实现者不同"的可核对差异；同主体同命令的复核被拒。

---

## 3. 多执行者协作：默认形态

### 3.1 派发

任务图中**互相独立**的任务（无依赖边、无写路径重叠）默认派给**不同执行者**（branch 执行器或 `workerDispatch`），由产品负责：上下文分片、并发上限、租约、结果回收。单执行者只在依赖链为线性或并发上限为 1 时出现——那是**退化**，不是默认。

### 3.2 汇合与冲突

- 汇合由产品执行：按依赖顺序把各执行者的 `result_commit` 依次晋升，冲突在**晋升前**用既有 `write_paths`/scope 证据暴露，而不是在 git 层撞车。
- 冲突策略必须显式：写路径重叠的任务**不得**并发派发（在计划校验期即拒绝并给出串行化的计划修订）。

### 3.3 空产出的硬规则

**任何消耗 attempt 预算的执行者必须留下可观察的工作**：`report(completed)` 在观察到的 `changed_files` 为空、且 envelope 未声明"空产出任务"时**必须被拒**，并提示改为 `failed`/`cancelled` 或修订计划。这条直接消灭实测中那次"机械 pump 报 completed、零产出、零证据"的浪费。

### 3.4 禁止

- **禁止**把多执行者协作降级为"单个 agent 顺手做完，账本旁观"。
- **禁止**机械 actor 在无可观察产出时占用预算（§3.3）。
- **禁止**并发派发写路径重叠的任务。

### 3.5 验收

- `LEAN-A09`：三任务项目（两条独立 + 一条依赖）在并发上限 ≥2 时由**两个执行者**完成，用户看到合并结果与每个执行者的证据。
- `LEAN-A10`：写路径重叠的计划在启动校验期被拒，并给出串行化修订建议。
- `LEAN-A11`：空产出 attempt 的 `completed` 报告被拒；机械 pump 不再产生零产出 attempt（回归覆盖实测那一次）。

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
  （实测缺陷：`web/src/Panels.tsx` 的"记录门禁证据"表单仍收集 `exitCode` 且默认命令写死 `python -m pytest`；服务端已忽略该字段并改为真实执行——**控件在说谎**，必须删除。）
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

---

## 7. 交付分期与出口

| 阶段 | 内容 | 出口（全部须确定性可验） |
|---|---|---|
| **1** | §1 标准推导 + §4 操作者控件清理 | `LEAN-A01`–`A04`、`A12`、`A13`；`web/src/Panels.tsx` 无 `exitCode` 字段；活体：Node 仓库上操作者零词汇完成一次接受 |
| **2** | §2 质量条推导 + §5 readiness 校验 | `LEAN-A05`–`A08`、`A14`；活体：超阈任务缺复核被拒并点名 |
| **3** | §3 多执行者派发 + 空产出硬规则 | `LEAN-A09`–`A11`；活体：三任务项目两执行者并行、合并、用户一次接受 |

每阶段必须：确定性门禁（`tsc -b`、vitest、`architecture:check`、`check-public-api`、playwright）全绿；新增活体场景脚本落 `rs-test/`；**不得**新增 architecture exception/SCC，不得变更公共 API。

---

## 8. 待操作者裁决（实现前需要一句话）

1. **接受/退回的形态**：面板内为主、会话内等价呈现（推荐），还是只做其中之一？
2. **独立复核阈值**：全部任务默认在环，还是仅超阈任务？（影响成本与延迟）
3. **并发上限与冲突策略**：默认并发数，以及写路径重叠时的处理（拒绝计划 vs 串行化重排）。
4. **`ProjectStandard` 的确认时机**：项目启动时一次确认（推荐），还是每次晋升时确认？
