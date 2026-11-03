# S00 — 基线、产品能力盘点与整体验证准备

**目的：建立可以持续推进全部阶段的起点，而不是完成一次审计后停工。**
依赖：无。后继：所有阶段。默认不使用模型。

## 冻结事实与待核验项

本包已读远端 C6-R branch 为 `044b08056a0e98b7d7cee207cb36fb7e453907fe`，tree `1b7caa156d187e952be8bd90e797f440cb7e2402`。受保护 main 的已读 SHA 为 `044330b2e55198542d545edc42ed9c36e7ce896b`。原报告声称 393 ahead、75 evidence trees、95 worktrees/2 locks；这些在执行时必须重新计数，不作为硬编码通过条件。

先读 references/SOURCE-REGISTER.md 与 HISTORICAL-LESSONS.md。用户总体报告是设计反思，不是所有模块已验证的证明；本地执行报告中的“短 SHA 根因”与源码/先前审查冲突，必须留为待裁决事实。

### S00-R01 — 创建或恢复单一干净开发分支

记录 status、untracked、HEAD/tree、remote refs、ancestry、stashes、worktrees、protected roots。正常从指定基线建立 `palimpsest-product-convergence-v1`。已有同 programme 的分支可恢复；脏树不自动 stash/reset，用新的干净 worktree 隔离。无关同名分支不可覆盖。所有后续工作提交到这一阶段线，避免每个实验创建生产分支。

### S00-R02 — 完整能力与 owner 盘点

沿 `install.ts → composition → adapters/host → actual tool registration` 画调用图，记录模块 implemented/composed/model_reachable/exercised/valuable 五层状态。不得因为类已 export 就标 model-ready。盘点至少 Work、Result、Evidence、Promotion、Context、Workspace、Intent、Collaboration、Trajectory、Management、runtime/security。

分类默认核心/按需高级/保留研究/兼容维护。记录 README 与实际能力的差异，作为 S09 文档义务，而不是立刻删模块。

### S00-R03 — 固定正常模式与专家模式的目标

选定默认主路径支持的部署组合（首选已验证 DSH；系统和工具版本以当前安装为准）。定义 operator、principal、ephemeral worker、durable peer 四种角色能看到/写入的资源。普通模型不默认暴露所有 expert 工具；但不得通过隐藏能力伪造基线优势。

### S00-R04 — 建立整体执行清单和依赖

在仓库 `docs/programs/pc1/` 保存本包或其可追溯副本，维护 `program-state.json` 与 requirement results。每项 requirement 有 owner、phase、实现状态、测试证据和阻断原因。每次检查点更新下一步，不能只写“继续分析”。工作拆分可用并行子 Agent，但必须划分文件/状态写入所有者并由集成人核验；不允许多 Agent 同时改同一关键服务。

### S00-R05 — 环境与历史差异基线

核对 package.json 的 Node ≥24.15.0 要求、pnpm lock、Ordarium release 与 DSH 安装版本。执行最小 build/architecture/public-api 与选定 smoke；保留失败，不以当前故障证明本期回归。完整变更审查用本地 Git，不把 GitHub compare 的 300 项返回上限当全量清单。

### S00-R06 — 资源与权限预先配置

读取现有付费与账户授权，不自动充值或继承耗尽的旧 campaign 余额。确认 model trial 的 allowed provider、总 Token/费用、session 上限、配对预留和安全边界。缺失时把 live model 项标资源阻断，后续工程阶段继续。指定独立 fixture roots 与允许清理的 test-owned 输出，不删除原 COG rig。

## 实施顺序

1. 只读 preflight；记录任何差异。
2. 创建/恢复新分支，提交 programme marker、源记录与初始状态。
3. 建立 actual owner/capability matrix；对 README 的强保证逐项标声明/代码/实测。
4. 快速环境 smoke 后开始 S01；S03/S06/S07 中无依赖的设计和测试骨架可同时推进。
5. 需要决策时写 ADR，默认在已授权 owner 内选择最小完整解法，不把每个 ADR 变成等待审批。

## 验收

| Test ID | 对应要求 | 必须观察到 |
|---|---|---|
| T-S00-01 | S00-R01 | 新分支 ancestry 正确；原 main/历史 refs 无变化；脏树无丢失 |
| T-S00-02 | S00-R02 | 每项正常能力可追至实际注册、服务和 owner，未组成者明确 |
| T-S00-03 | S00-R03 | normal/expert/operator role map 有实际权限来源，无文本自授权 |
| T-S00-04 | S00-R04 | planner 能在一个节点 blocked 时选择另一合法节点；恢复无重复创建 |
| T-S00-05 | S00-R05 | baseline build 与版本记录可复查，失败未抹去 |
| T-S00-06 | S00-R06 | 无资源授权时无付费调用，工程任务仍能继续 |

**退出：** baseline dossier、owner map、初始工程检查点已提交，并实际进入后继阶段。提交这些文件后就结束整个任务不算完成。
