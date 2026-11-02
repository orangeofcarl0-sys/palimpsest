---
name: palimpsest-evidence-producer-audit
description: "修改 Gate、Evidence、验证器或接受条件，或发现 caller 可随意选择 Predicate 时使用。"
version: "1.0.0"
---

# palimpsest-evidence-producer-audit


## 要保护的事实

Evidence 的字段类型合法不代表命题真实。普通命令成功不能证明未实际检查的 files_exist/scope/approval。Artifact digest 证明字节，不证明结论。

## 工作步骤

1. 追溯每个 Predicate 的 producer、观察动作、subject digest、basis、environment 和资格；区分 command、filesystem、independent verifier、human decision。
2. 检查模型可指定的参数是否能选择比实际观察更强的 Predicate。记录 parse、producer registration、qualification、gate evaluation 和 promotion 每层是否校验。
3. RED：缺文件但合法无关命令 exit 0；越界文件但 tests_pass；结果改变后旧 evidence；旧 weak atom 在新接受路径被当 qualified；普通文本 approved 冒充 authority。
4. 修复入口限制 + qualified evidence 消费，而不是只在 UI 隐藏选项。复用结构性 observer，自动生成对应 evidence，不由模型伪造观察列表。
5. 历史重放与资格判断分开。不能删除旧 atom，也不能以迁移自动赋予它缺失的证明。需要补验时附新 subject-bound evidence。

## 输出

predicate-producer 表、端到端 exploitability/防线分析、RED/GREEN、历史兼容规则、仍未覆盖路径。只证实入口错配时不能夸称已经证明所有最终 Promotion 可被绕过。
