---
name: palimpsest-architect
description: "Use Palimpsest Architect to turn a one-sentence goal into a validated project architecture (task graph proposal) before any work starts. Use when the user wants a long-horizon goal organized into stages with dependencies, write scopes and gates - as a preset pipeline, an agent-generated proposal, or a hand-edited task graph - and wants to see and confirm the proposed architecture before declaration."
---

# Palimpsest Architect — 架构三模式的声明纪律

把一句话目标变成**经过校验的架构提案**，确认后才落账。三种喂法共用同一个校验器与声明通道：预设流水线、主代理生成（本技能）、手搓编辑——**插件永远不调用 LLM，架构师是你（主代理）**。

## 提案形状（ProjectProposal）

```json
{
  "goal": "一句话目标",
  "changeClass": "metadata_only|backward_compatible|behavior_change|contract_breaking",
  "tasks": [
    {
      "title": "人话阶段名（也是提案内依赖引用键）",
      "dependsOn": ["其他任务的 title"],
      "writePaths": ["该阶段可写路径"],
      "requiredArtifacts": ["该阶段必须产出的产物"],
      "gateId": "建议该阶段晋升所需的门禁（可选，须已声明）"
    }
  ]
}
```

## 三种喂法

1. **预设流水线**：线性阶段链（实现→验证→评审…），每个阶段依赖前一阶段。你按 goal 实例化阶段清单（`pipelinePreset` 语义：顺序即执行序，依赖自动逐级连接）。
2. **主代理生成**：你分析 goal → 拆阶段 → 定依赖、写域、产物与门禁 → 产出提案 JSON。
3. **手搓修订**：用户在图上改（渲染器侧），产出的同样是提案 JSON。

## 声明纪律（硬规则）

```bash
# 1. 写提案文件后先校验（fail-closed，零落账）：
$PAL architect /tmp/proposal.json
#    → {"diagnostics":[],"declared":false}   才允许声明
#    → {"diagnostics":[...]}                  修复后重试，绝不带病声明

# 2. 给用户看提案（阶段清单 + 依赖概述），确认后再声明：

# 3. 空诊断 + 用户确认后声明：
$PAL architect /tmp/proposal.json --declare
#    新项目 → PROJECT_CREATED；运行中项目 → 计划修订（revision+1）
```

- **产出物 ⇒ 写域**：声明了 requiredArtifacts 的阶段必须给 writePaths（否则 MISSING_WRITE_PATHS）。
- **依赖闭合**：dependsOn 只引用本提案内的 title；不自环。
- **门禁已声明**：gateId 必须已在门禁注册表（否则 UNKNOWN_GATE——先用编排技能的 `--gate` 声明）。
- **架构调整即计划修订**：对运行中项目声明新提案 = 一次修订，后续执行照旧被晋升门禁治理。

## 确认点（可控）

声明前把提案翻译成人话给用户：阶段清单、依赖链、每阶段的写域与产物、建议门禁。用户否决 = 不声明；用户要求的调整 = 修改提案重新校验。声明之后，进度与状态用编排技能的 `status` 跟进。
