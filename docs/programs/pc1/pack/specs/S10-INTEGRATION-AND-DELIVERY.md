# S10 — 全面集成资格与最终成果交付

依赖所有工程阶段；实证被外部阻断时允许交付 qualified RC，但不能称全目标完成。

### S10-R01 — 全量变更核对

从真实基线到 HEAD 输出全部 commit/files/stat/API/schema/dependency/permission/default changes，使用本地 Git，不依赖 GitHub 截断 compare。记录与 origin/main 的差异只是集成风险，不等于能 fast-forward 获授权。检查所有相关 documentation 与 generated build 是否来自同一 freeze。

### S10-R02 — 风险合适的最终回归

固定 targeted suite、full ordinary suite、web build/e2e、consumer install smoke、历史 replay、故障恢复、两场景 deterministic acceptance 与 normal tool registry。可按资源隔离顺序执行；每项 exit/status 保存。失败要修复本期回归，历史失败明确 baseline 证据；排除受影响关键 gate 不能叫通过。

### S10-R03 — 双冻结与精确身份

全部 executable source、tests、scenario、operator policy、evaluators 先 code freeze；之后运行评分/验证或从 exact freeze 重跑必要测量；最后 evidence/docs freeze。新的 executable fix 建立新 freeze，不把前后样本混合成同一比较。artifact manifest 由 committed bytes 求 hash，CRLF working tree 另存；不让 manifest 包含自己未来 hash。

### S10-R04 — 三层最终验收报告

分别报告 implementation_complete、engineering_qualified、behavioral_verified、comparative_value_supported；每项 requirement 映射文件/测试/run ID 与限制。列 actual intelligent participants、operator interventions、尚未验证的 owner/runtime path。不得用 boolean overall PASS 掩盖未运行 F 或未接受 Result。

### S10-R05 — 可恢复交付

提供 RC artifact、安装/升级/恢复说明、已知限制、全部测试命令与环境、最小下一步。生成 LOCAL PR REVIEW KIT：base/head、危险变更、必要 CI、迁移、回退与实际支持范围。不自动创建/合并 PR。

### S10-R06 — 研究结果真正决定后续方向

若 P 优势只在高风险变化任务，默认收窄治理范围而不宣称所有任务更优；若 F 等效更省，保留结果并建议简化默认流程；若只有运行阻断，明确尚无价值结论；若多 Agent 增益可观察，说明贡献和比较范围。不得以“已有很多代码”作为未来继续扩张的理由。

### S10-R07 — 干净完成与复核

新分支 clean，remote 非强制推送（若授权/权限具备），main/历史 refs/locks/evidence 不变。留下 operator 需要决定的真实外部事项，不伪造签字。若上下文结束未完成，交严格 checkpoint 而非 completion claim；继续执行时按同一 programme 恢复。

| Test ID | 对应要求 | Case / 期望 |
|---|---|---|
| T-S10-01 | S10-R01 | 完整 diff manifest，全部 changed files 有用途与需求映射 |
| T-S10-02 | S10-R02 | 最终验证矩阵具命令、exit、范围、失败/排除，关键回归无掩盖 |
| T-S10-03 | S10-R03 | code→runs→evidence 链准确，无执行后偷偷换评分脚本 |
| T-S10-04 | S10-R04 | implemented、live verified 与 comparative 支持可分别机器核对 |
| T-S10-05 | S10-R05 | artifact 可安装、rollback 可测、PR kit 不依赖手工记忆 |
| T-S10-06 | S10-R06 | 负面/无优势结果完整保留，没有只发布成功样本 |
| T-S10-07 | S10-R07 | 新分支状态与推送记录真实，受保护资源未改动 |

## 最终汇报顺序

先一句准确产品裁决；再实际用户主路径与多 Agent 行为；再 Git/代码/权限变化；再测试和两场景比较；再资源与无法验证项；最后一项主要发展建议。不要用几十个内部状态替代用户能够理解的成果，也不要把失败归为模型/infra 而不提供证据。

**本计划完整实施的最低标准：** S00–S09 工程功能与接入全部实现，必要测试和 S10 交付完成。若真实模型或授权环境缺失，可交 `IMPLEMENTATION_COMPLETE / LIVE_QUALIFICATION_BLOCKED`，但必须逐项证明没有用 stub 冒充实现，且不能声称整套产品能力与价值已经全面验证。
