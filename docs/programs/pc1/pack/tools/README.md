# 工程包工具（无外部依赖）

这些 Python 工具验证文档、工程状态和 fixture 可见性，**不代表 Palimpsest 的实现或产品测试**，也不代替 JSON Schema 完整实现。`validate_pack.py` 内置本包实际使用的 Schema 子集，并对未支持关键词显式报错。

```bash
# 原始 ZIP 内容完整性、需求覆盖、DAG、初始状态与基本证据等级约束
python tools/validate_pack.py

# 修改了自己的执行状态后：语义检查，明确不再声称原始包哈希未变
python tools/validate_pack.py --working-copy

# 不创建分支，不 fetch/checkout，不写仓库
python tools/preflight.py --repo /path/to/palimpsest

# 找下一项可以做的工程工作，不授权模型调用或真实效果
python tools/plan_next.py --state tracking/program-state.json

# 列出 T1 可见的新合成场景材料，不改变文件
python tools/visible_sources.py --as-of 2026-03-02T09:00:00Z

# 可选：复制到一个不存在的新测试目录，只复制可见资料，不复制 Oracle
python tools/visible_sources.py --as-of 2026-03-09T09:00:00Z --output /test-owned/new-world

# 工具本身的自测，所有写入仅发生在临时测试目录
python tools/selftest.py
```

`preflight.py` 在非 exact clean baseline 返回 2，供工程 Agent 检查 programme resume/新 worktree 规则；它不会强制重置用户工作。

`plan_next.py` 只使用工程依赖：某阶段真实模型被 Provider 阻断，但其代码与确定性测试已完成，不会阻止产品包装与报告。前置确定性测试失败则不会让依赖的效果阶段被视为可执行。

请保留解压后的原始包作为 immutable specification，另在仓库中维护工作副本与结果。不能通过修改原 MANIFEST 把产品变更伪装为原始文档未变化。
