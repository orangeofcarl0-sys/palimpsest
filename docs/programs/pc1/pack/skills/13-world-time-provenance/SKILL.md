---
name: palimpsest-world-time-provenance
description: "设计更新事件、保存评分快照、排查版本污染与摘要错配时使用。"
version: "1.0.0"
---

# palimpsest-world-time-provenance


## 方法

1. 同时记录 real execution time、project simulation time、source arrival time、source effective time；不能从一个推断另一个。
2. T1 staging 只复制可见内容与 metadata，未来文件必须真实不可访问。T2 只发布候选，不自动修改 accepted source。
3. rubric 绑定 evaluated canonicalHead/blob/objective/basis，而不是最后执行目录。负面对照改变 Live HEAD 后仍按原 evaluation subject 收集数据。
4. 分别记录 originBasis、resultCommit、expectedHead、acceptedHead、liveHead、workingTreeDigest、GitBlobDigest。Windows CRLF 与 committed bytes 不混。
5. 输入/产物每次 run 唯一路径，禁止重测覆盖原 Plan。hash manifest 在 artifact 冻结后生成，别让清单证明自己未来 commit。
6. 对 P/F、真实模型/fixture、oracle/visible source 作路径隔离与污染扫描。无效 run 保留 INVALID 原因，排除评分不删除。

## 输出

visibility manifest、evaluation subject record、evidence collection manifest、forward errata。Hash 匹配但 subject 标签错仍判来源不合格。
