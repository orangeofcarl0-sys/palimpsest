# 架构契约：真实产品路径，单一事实所有者

## 不变量

I01. Work、Attempt、Result、Source Revision、Accepted Head、Model Session、Operator Decision 是不同身份。
I02. 输出/报告不是证据；证据来源必须与所声称的 Predicate 匹配。
I03. 对象可达性不等于 Canonical 接受；Git fetch/import 不应推进项目 Head。
I04. 接收消息、读取来源、创建 Task，不自动授予接受来源或修改业务要求的权力。
I05. `UNKNOWN` 不能当失败/成功来便捷重试；外部效果不确定时必须对账。
I06. 已接受成果可被新事实重新评估，但历史不得覆盖；候选的事实地位不得被摘要提升。
I07. 调查可成功地产生负面结论；Work acceptance 不自动代表 project objective attained。
I08. Phase/SKILL/Schema 里的工程状态不是新增的 canonical 产品状态机。
I09. 模型可提议新工作，但不能修改评估 Oracle、授权策略、预算上限或历史证据。
I10. 每次状态解释绑定项目版本、来源 revision 与观察时间；不同时间的正确结论可并存。
I11. 临时 branch、原生 subagent、durable peer、fresh session 不得互相冒名。
I12. 所有正常工具的宣称能力与执行环境能力一致；提示中写 read-only 不构成隔离。

## 逻辑产品接口（设计目标，不假称既有 API 名称）

- `project.summary`：当前目标、条件、可采用成果、候选、争议、未决工作、预算与阻断。
- `project.explain`：一个状态/结论的来源、适用范围、谁接受、什么变化会重开。
- `work.propose`：有来源的工作候选；不意味着授权。
- `review.preview/decide`：适用已有 operator authority 的精确对象决策。
- `work.start/observe/complete`：由现有 Work owner 实施生命周期，不让模型提供假 observation。
- `result.inspect/accept/recover`：候选/已接受身份、可执行下一步与真实未知状态。
- `collaboration.request/observe`：限预算、限权限的独立工作与交接。
- `project.resume`：由持久事实构造新上下文，不复制旧模型 transcript 冒充重建。

实现可复用/组合已有工具；不必给每项逻辑能力新增一个 tool。S02 决定最小正常目录，旧 API 保留兼容并移入专家模式。所有 tool result 必须 lossless JSON/协议兼容，不返回循环对象或隐式 BigInt。错误返回稳定 reason code、subject、allowedNextSteps、requiredAuthority、retryability、basis；不返回凭据。

## Owner 映射起点

| 职责 | 现有候选位置 | 本期策略 |
|---|---|---|
| Work 生命周期 | `src/tools/controller.ts`, `src/work/`, `src/scheduler/` | 修复入口差异，不创建第二套任务事实 |
| 外部效果 | `src/effects/` + Ordarium | 对账、幂等与可观察失败；不手写成功 |
| 执行世界 | `src/deployment/execution_world.ts` | 真实 world ownership、结果 export、路径视图 |
| Evidence | `src/tools/work_evidence.ts`, `src/evidence/`, `src/domain/` | producer-qualified 观察，不信任 caller predicate |
| Project 知识 | `src/project_workspace/`, `src/context/` | 派生当前视图+Journal；不复制真值 |
| Intent/任务修订 | `src/project_intent/`, controller plan | 区分任务图与业务承诺的授权 |
| Continuation | `src/continuation/`, `src/composition/continuation.ts` | 正常可解释入口，保留安全的保守性 |
| 协作 | `src/interaction/`, `src/federation/`, `src/project_collaboration/` | 复用 native + durable peer，不造通用 Router |
| 因果历史 | `src/trajectory/` | source-linked 按需投影，不成为 Memory/Planner owner |
| 人类参与 | `src/project_management/`, `src/project_operating/` | 使用已有参与模式，必要审批与无谓协调分开 |

路径是冻结基线上的导航线索。执行时按实际调用图核查；缺失路径不得凭空补文件只为符合清单。

## 向后兼容与迁移

本期允许 additive API 与 versioned adapters。改变权限含义、Evidence 资格或持久 schema 时写 ADR 与旧数据 replay 规则。旧形状合法不代表重新赋予更强证据权威；需要 requalification 时以新记录表示。旧正常路径与新 facade 对同一 canonical effect 不得产生两个事件。
