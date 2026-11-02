# 失败记录

failure ID / requirement / run / code freeze：

实际 exit/event/error 与原始日志：

分类：application / authority / effect-uncertain / environment / provider / budget / test-isolation / evaluator / unknown。

## 不要跳过

失败是否先于模型 turn？是否 effect 已发生但 receipt 丢失？当前 source/target/version 是否一致？是否只是序列化错误？重复运行会不会产生外部效果？

## 处理

一次有理由的诊断、观察结果、根因状态、修复或外部阻断；原失败记录仍保留。
