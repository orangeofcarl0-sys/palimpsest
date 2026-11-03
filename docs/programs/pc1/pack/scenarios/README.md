# 场景合同

本包只有两个核心场景，避免用越来越多 fixture 代替实际产品交付。

A（Sablewick）复用已存在项目历史，检验状态、权限、时间与正常接受。历史原始材料从 frozen repository 读取，不凭描述重新生成一份恰好通过评分的 CSV。

B（环境研究方案）是本包新创的**合成实验材料**，检验独立认知贡献、冲突、预算和新事实对研究设计的影响。材料不是现实科学结论或商业报价。`visible/` 是可按时点选择的原始来源；`evaluator-only/` 和所有评分脚本不能放入受测模型可访问的 world。即便源码仓库里存在 oracle，也不得把整个 repo 只读挂给模型。

每次世界初始化须产生 visible-manifest、canonical initial-state、authority configuration、prompt digest 与 absence-of-oracle 检查。不得先执行确定性正确 Intake/Rework 再让 P1 宣称自己发现了要做什么。

强基线 F 应当拥有等价的原生工具、历史与事件；只是不具有 Palimpsest 专属工作语义。给 F 合理 Git/Handoff 不是削弱研究，而是必要反证。
