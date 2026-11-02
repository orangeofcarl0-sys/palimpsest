# JSON Schema 的使用边界

这些 schema 是 PC1 的工程/评估记录与拟议产品传输契约，不会自动成为 Palimpsest 的 canonical schema，也不覆盖现有 schema/models.ts。实施 DTO 时必须映射实际 owner。任何审批或证书资格不能由本目录的 JSON 校验直接产生。

- `program-state`、`requirement-results`：本地工程任务推进与逐项验收。
- `evaluation-subject`、`run-manifest`：明确一次评价针对哪个世界、来源和代码；字节完整性与命题真实性分开。
- `proposal`、`review-record`、`handoff`：可审查的信息交接形状；actual authority 必须可追至既有 owner。
- `behavior-event`：只记录可见行为；不得保存/索取私有思维链。

JSON Schema 只验证形状；`tools/validate_pack.py` 还检查状态与证据级别的基本一致性，不能替代产品授权、业务评价或真实 Git 对账。
