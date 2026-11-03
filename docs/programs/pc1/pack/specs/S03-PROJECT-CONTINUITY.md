# S03 — 项目认知连续性、来源与按需上下文

依赖 S00；与 S02 集成。目标：新的 Session 获得当前可用理解，而不是无限历史摘要。

### S03-R01 — 三类信息职责，不建三套真值库

保留原始事件/材料/产物作为可追溯历史；从原 owner 派生当前目标、承诺、可采用成果与未决状态；为当前任务构造有预算的 Context Capsule。缓存必须带 basis/version，失效后重建。不把旧摘要覆盖原 evidence 或复制第二份 ProjectIR。

### S03-R02 — 每条关键结论具有事实地位

区分 observed source、agent interpretation、candidate、accepted-for-purpose、negative finding、uncertain/contested、superseded。具体字段映射现有 owner，不能仅凭 LLM 写 `accepted`。已接受只表示在指定用途/条件下采用，非普遍真理。

每项展示至少有 source refs、formation basis/time、adoption basis（如有）、applicability note、confidence of observation 而非无来源数值 confidence。没有适用性证明时说明“可能受影响/需复核”，不自动计算通用语义依赖。

### S03-R03 — Context 有目标、覆盖和停止条件

默认摘要只包含当前决策需要的目标、硬约束、已采用结果、关键否定、开放问题、相关变化、授权边界和追溯入口。按需读取精确来源。设字节/token 上限，但关键安全事实被裁剪时必须显式标 incomplete 并提供入口，不能声称完整覆盖。

检索停止条件是当前决策需求满足或声明无法补足，不是查遍全仓库。高影响决定要求更强证据；低风险探索可以明确带未知继续。

### S03-R04 — 新 Session 重建，不伪装 transcript 恢复

同一 Session resume 与新 Session inheritance 分开测试。新 Agent 只能读取合法 durable assets/state，不读取旧模型 transcript 或测试 oracle。统计首次有用行动、重复调查量、关键遗漏和对历史理解错误。保留“当时正确、现在不适用”的结论，不简单删旧知识。

### S03-R05 — 防止自引证放大

摘要/交接记录保留来源链。多个 Agent 引用同一原始文档不算独立证据；检索派生结果不能反过来被记为独立验证来源。保存 root source identity 与 derived lineage，冲突来源可同时存在。无来源新判断只能是 hypothesis。

### S03-R06 — Trajectory 只做有依据的投影

用已有 causal projection 说明哪些 Attempt/Source/Result/Decision 影响当前状态，提供按需回溯。没有独立跨 owner 关系证据时不编造因果边。Trajectory 不成为第二个 Planner、执行权威或万能 Memory Server。跨 Session/Owner 的信息披露按现有权限过滤。

### S03-R07 — 历史发现能够转成可选择的工作候选

负面结果不会自动生成 Task，但正常 Agent 能看见它是否关联未解决目标，并形成 opportunity/open question。API 帮助保留精确引用；是否值得启动由 Agent 判断、是否授权由现有 owner 判断。长期静态失败可以保持，不因每次启动反复新增相同机会。

## 具体输出

实现/完善 project summary + explain + task context 组合；给每项 projection 提供 source identity 与 basis。提供在相同项目头上确定性的 projection 测试，以及 head/source 变化后的失效重建测试。记录 prompt/rendered context 的 digest；不要记录隐藏思维链作为证明。

## 验收

| Test ID | 对应要求 | Case / 期望 |
|---|---|---|
| T-S03-01 | S03-R01 | 删除派生缓存后可从原 owner 重建；未知 owner plane 显式缺失 |
| T-S03-02 | S03-R02 | 未获批准候选不会在摘要中变成 accepted，旧版本结论保持历史语境 |
| T-S03-03 | S03-R03 | 超长历史在预算内可用；关键事实裁剪显式 incomplete，可追溯 |
| T-S03-04 | S03-R04 | fresh home 无旧 transcript 仍能发现目标、accepted source 与 pending action |
| T-S03-05 | S03-R05 | 两份同源摘要不增加独立证据计数；派生循环被识别 |
| T-S03-06 | S03-R06 | 无资格跨 owner relation 不产生伪因果，权限过滤可验证 |
| T-S03-07 | S03-R07 | negative→candidate 可记录而不自动授权；重复 resume 不重复创建 |

**退出：** Context 连续性进入正常 Host，不依赖 evaluator 私有文件注入；S08 真实模型试验证明/否定使用价值，代码实现阶段不预写成功。
