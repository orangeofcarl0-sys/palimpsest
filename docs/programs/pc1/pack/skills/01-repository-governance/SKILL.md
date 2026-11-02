---
name: palimpsest-repository-governance
description: "进入新分支、恢复工作、提交或发布候选时，核对身份与保护历史。"
version: "1.0.0"
---

# palimpsest-repository-governance


## 输入

实际 repo path、program ID、预期 base/head/tree、remote、现有检查点与用户授权范围。没有这些信息时先只读发现，不能从历史聊天推断当前本地状态。

## 执行步骤

1. 记录 `git status --porcelain=v1 -uall`、branch、HEAD/tree、remote refs、worktree list、stashes。若 dirty，列来源，不自动 stash/reset；选择新干净 worktree。
2. 用 `git merge-base --is-ancestor` 核查 lineage，区分 branch graph-divergent 与内容已经 squash-integrated。不要把 diff 数量当未合并业务工作数量。
3. 现有同名 branch 只有在 programme marker 和 ancestry 一致时恢复。禁止覆盖 unrelated refs。单一 program branch 记录多个 checkpoints。
4. 改动前列 touched owner；改后列 tracked/untracked/new generated artifacts。用本地 `git diff --name-status BASE..HEAD` 获取全量，不依赖 API 的 300 个文件上限。
5. Code Freeze 记录 source/tests/evaluator/scenario/config 的 SHA/tree；Evidence Freeze 只加数据/报告。修 executable 就建立新 code freeze，不 amend 旧身份。
6. push 前只读核查 remote 未前进，non-force 推送本期新分支。main/PR/release 不在授权内时只准备 review kit。

## 输出

`baseline.json`、完整变更清单、保护资源差异、checkpoint 与恢复下一步。每个数字说明采集时间，不能把 95 worktrees 当永恒常量。

## 禁止的快捷方式

不运行 broad `git clean -fdx`、不 prune locks、不自动删除实验旧世界、不以“保持干净”为由抹去用户改动。不把 safe fast-forward 等同合并授权。

## 完成检查

能用 exact base/head 重建本期 diff；未提交内容有归属；历史受保护 refs 不变；resume 不会重复创建 Work 或 effect。
