# 方案级决策与可替换部分

| ID | 决策 | 理由 | 变更方式 |
|---|---|---|---|
| ADR-PC1-01 | 一次整体执行 S00–S10 | 避免研究阶段无限分裂，用户明确要求完整落实 | 只能因真实依赖/权限/资源阻断分项，不能擅自缩成局部审计 |
| ADR-PC1-02 | DSH 原生、复用现有 owners | 已有工程基础与真实行为证明，不重造 Runtime | 有证据的新 adapter 可加；换 Runtime 另审 |
| ADR-PC1-03 | 正常产品表面与 expert 分层 | 减少模型调试框架成本 | 工具命名/粒度由真实调用图决定，必须兼容 |
| ADR-PC1-04 | 改 predicate 资格，不靠 prose 改真值 | 来源与命题错配是关键风险 | 旧事件保留，versioned requalification |
| ADR-PC1-05 | proposal/approval 是已有 authority 的接入 | 需要实际可用交接但不能自批 | 新 UI metadata 可用，不拥有第二份 canonical truth |
| ADR-PC1-06 | 三种完成地位分离 | negative finding 对项目有价值 | 先 projection+明确 Work contract，不全局新增 ontology |
| ADR-PC1-07 | 两场景 + 强原生基线 | 避免对 Sablewick 过拟合 | 新数据 holdout 在评分前冻结 |
| ADR-PC1-08 | staged events 与 source-bound rubric | 避免未来泄漏和 accepted/live 混用 | 修改需新版本协议与 cohort |
| ADR-PC1-09 | 支持局部真实不确定性 | 不能为了整齐编造恢复成功 | 若缺 authority/outcome evidence，阻断特定效果 |
| ADR-PC1-10 | 默认完整实现，比较收益不预设 | code deliverable 与 empirics 不同 | 无优势时如实交付更窄适用范围 |

这些是本包的新设计决定，不是声称已存在于仓库的 ADR。执行 Agent 应按实际代码完善与落地，保留选择理由与反例。
