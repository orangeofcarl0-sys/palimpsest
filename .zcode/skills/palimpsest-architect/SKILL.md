---
name: palimpsest-architect
description: "Use Palimpsest Architect to turn a one-sentence goal into a validated project architecture (task graph proposal) before any work starts. Use when the user wants a long-horizon goal organized into stages with dependencies, write scopes and gates - as a preset from the preset library (pipeline, fan-out, hierarchy, expert panel, verified DAG, research loop), an agent-generated proposal, or a hand-edited task graph - and wants to see and confirm the proposed architecture before declaration."
---

# Palimpsest Architect — 架构三模式的声明纪律

把一句话目标变成**经过校验的架构提案**，确认后才落账。三种喂法共用同一个校验器与声明通道：预设库、主代理生成（本技能）、手搓编辑——**插件永远不调用 LLM，架构师是你（主代理）**。

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
      "gateId": "建议该阶段晋升所需的门禁（可选，须已声明）",
      "role": "槽位角色（可选，缺席＝implementer；须在已声明角色表内）"
    }
  ]
}
```

## 三种喂法

1. **预设库（PLMP-ARCH-3）**：六个拓扑原型，内核单源，一键出提案草稿。`role` 须从已声明角色表取（genesis 默认：implementer/tester/verifier/scout/analyst）。
2. **主代理生成**：你分析 goal → 拆阶段 → 定依赖、写域、产物与门禁 → 产出提案 JSON。
3. **手搓修订**：用户在图上改（渲染器侧），产出的同样是提案 JSON。

### 预设库六条目

| id | 拓扑 | 参数（全部有内核默认） |
|---|---|---|
| `pipeline` | 阶段线性链（实现→验证→评审） | `stages:[{title,writePaths?,requiredArtifacts?,gateId?}]` |
| `fan_out` | 扇出-汇聚：worker×N 并行→综合（Grok Bot·Anthropic 深研式；worker＝scout、综合＝analyst） | `workers:[{title,writePaths?,requiredArtifacts?}]`、`synthesis:{title?,gateId?}` |
| `hierarchy` | 调研×N→撰写→编辑（Kimi Swarm 写作式；scout/implementer/analyst） | `research:[{title}]`、`writing:{title?,gateId?}`、`editing:{title?,gateId?}` |
| `panel` | 候选×N 同题并行→合成评审（grok-expert 式；候选＝analyst） | `candidates:1..4`（默认 2；>2 需先 declareRoleTable 提额）、`synthesis:{title?,gateId?}` |
| `verified_dag` | 单元×N（可互依）→终审（Danus 式；单元＝implementer、终审＝verifier） | `units:[{title,dependsOn?,writePaths?,gateId?}]`、`review:{title?,gateId?}` |
| `research_loop` | 计划→取证×N→核验→综合（Magentic 式；analyst/scout/verifier/implementer） | `plan:{title?}`、`topics:[{title}]`、`verify:{title?,gateId?}`、`synthesis:{title?,gateId?}` |

```bash
# 用预设出提案（内核默认参数；--goal 覆盖 params.goal）：
$PAL architect --preset fan_out --goal "竞品调研报告"
$PAL architect --preset verified_dag --params @/tmp/params.json
#    → {"diagnostics":[],"declared":false}     校验分支与文件提案完全一致
#    --declare 后照旧：新项目 → PROJECT_CREATED；运行中 → 计划修订
```

预设是**拓扑原型不是克隆**（lineage 已标注映射偏差）；预设建议的 gateId 只是建议——门禁本体仍只有 `declareGate` 一条声明路径。

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
- **门禁两步顺序**：提案带 gateId 建议时，**先用编排技能的 `--gate` 声明门禁，再 declare 提案**（否则 UNKNOWN_GATE）。
- **角色已声明**：role 须在角色表内（否则 claim 时 fail-closed 报"role not declared"）；并行数超过该角色槽位同样须先 declareRoleTable 提额。
- **架构调整即计划修订**：对运行中项目声明新提案 = 一次修订，后续执行照旧被晋升门禁治理。

## 确认点（可控）

声明前把提案翻译成人话给用户：阶段清单、依赖链、每阶段的写域与产物、建议门禁与角色。用户否决 = 不声明；用户要求的调整 = 修改提案重新校验。声明之后，进度与状态用编排技能的 `status` 跟进。
