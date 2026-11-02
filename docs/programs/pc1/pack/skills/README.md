# 工程技能库

这些 SKILL.md 面向**执行本计划的本地工程 Agent**，不是让受测产品 Agent 获取 evaluator Oracle 或 operator 权限的 Prompt。调用时只读本次需要的技能；跨阶段共同使用的 workflow 必须保持 source/version attribution。

本包不假设 DSH、Codex 或其他本地 Agent 一定自动发现该目录。先按本地已安装 skill loader 的格式验证；可放入仓库支持的 `.agents/skills/` 或其它实际配置目录，但不能覆盖现有技能。没有 loader 时，按总入口的触发规则直接读文件也可执行。

## 触发路由

| 工作 | 必读技能 |
|---|---|
| S00 / commit / resume | 01、14 |
| 任何强结论或根因 | 02 |
| S01 Git/Promotion | 04、05、11 |
| S02 模型摩擦/工具 | 03、12 |
| S03 上下文 | 06、13 |
| S04/S06 授权/结果 | 07、05 |
| S05 多 Agent | 08、06、10 |
| S07 模型环境与成本 | 10、11 |
| S08 真实试验 | 03、09、13 |
| S09/S10 交付 | 15、01、11 |

技能输出应填到 templates 与 schemas 定义的工程记录，不需要为每次调用写一份长报告。重要的是分析进入代码修复、测试或明确的负面结论。
