# Palimpsest 全流程产品落实包 · PC1

**版本：1.0.0｜制作日期：2026-11-02｜用途：交给本地工程 Agent，从新分支连续落实整个产品收敛计划。**

本包不是 Palimpsest 已完成能力的声明，也不是另一次只做架构审计的 Prompt。它是一次完整实现计划：把已有可信工程基础转化为可安装、可理解、可恢复、能够形成真实协作收益的长期项目产品。

## 立即开始

1. 将整个文件夹放到本地 Agent 可读的位置，先不要覆盖仓库文件。
2. 把根目录 `AGENT_EXECUTION_PROMPT.md` 的全文交给本地 Agent。
3. Agent 按 `guidance/01-STRATEGY.md`、`guidance/02-EXECUTION-AUTHORITY.md` 和 `tracking/program.json` 执行，从 S00 连续推进到 S10。
4. 需要哪类能力时读取相应 `skills/*/SKILL.md`。技能是工程执行方法，不是产品的额外权限来源。

默认新分支：`palimpsest-product-convergence-v1`。

核对基线：`044b08056a0e98b7d7cee207cb36fb7e453907fe`，tree `1b7caa156d187e952be8bd90e797f440cb7e2402`；历史受保护 main：`044330b2e55198542d545edc42ed9c36e7ce896b`。这些值于本包制作时由 GitHub 连接器读取，不代表执行时自动仍然有效。

## 本包与此前逐阶段 Prompt 的区别

- **一次整体授权，阶段不是默认停工点。** 已授权范围内的接口整理、组合补齐、真实缺陷修复、场景适配、测试、文档、安装与发布候选都应实施；不能只提交审计报告后等下一条 Prompt。
- **安全门阻止不安全效果，不阻止独立工作。** 例如模型额度不可用时继续完成产品、运行器、测试与交付，但不得把真实行为验收伪装成完成。
- **实现与证据分列。** `IMPLEMENTED`、`DETERMINISTICALLY_VERIFIED`、`REAL_AGENT_VERIFIED`、`COMPARATIVELY_SUPPORTED` 是不同证据层级；代码写完不等于产品价值被证明。
- **允许有必要的产品开发。** 不再把所有新增正常工具或适配器都视为越界；但新权限根、破坏历史、资金支出扩张、正式发布和 main 合并仍不是默认授权。
- **收敛而非重造。** 保留现有 owner、事件与安全效果；默认表面简单，高级能力按需使用；不建设递归元架构或另一个 Harness。

## 阅读导航

| 内容 | 入口 |
|---|---|
| 给 Agent 的唯一总入口 | [AGENT_EXECUTION_PROMPT.md](AGENT_EXECUTION_PROMPT.md) |
| 人类总览 | [EXECUTIVE_GUIDE.md](EXECUTIVE_GUIDE.md) |
| 战略、授权、架构与工作流 | `guidance/` |
| 每个阶段的详细实现与验收规格 | `specs/S00-*.md` 至 `specs/S10-*.md` |
| 排障、分析、验证、协作与复现方法 | `skills/*/SKILL.md` |
| Sablewick 与新开放研究场景 | `scenarios/` |
| 非权威工程记录的数据约束 | `schemas/` |
| 可复制的状态、审查与报告模板 | `templates/` |
| 计划 DAG、验收要求与状态 | `tracking/` |
| 材料来源、事实/假说边界、经验映射 | `references/` |
| 包校验、契约自测与阶段选择器 | `tools/` |

## 可直接运行的包检查

```bash
python tools/validate_pack.py
python tools/selftest.py
python tools/plan_next.py --state tracking/program-state.json
```

这些工具只验证文档包/工程状态约束，不验证 Palimpsest 产品正确性，不创建 Git 分支，不调用模型、不访问网络、不执行外部副作用。

## 最终必须交付什么

新分支上的实际代码、统一默认产品路径、可信成果接收与恢复、项目状态/上下文交接、提案与批准交接、两类真实协作支持、两个场景的验收运行器、可重现测试与真实模型证据（资源可用时）、安装/升级/恢复说明、完整变更范围与未解决限制。

**只提交规范、空接口、永远返回 `CAPABILITY_REQUIRED` 的占位、或只在脚本中能工作的旁路，都不能算本计划完整实现。**

本包新增的 DTO/JSON Schema 均为设计目标或评估记录，除非明确映射到现有 owner，否则不得直接变成第二套 canonical 产品数据库。
