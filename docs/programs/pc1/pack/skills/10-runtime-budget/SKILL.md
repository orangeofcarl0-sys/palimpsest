---
name: palimpsest-runtime-budget
description: "运行任何真实模型、子进程或跨平台实验前使用。"
version: "1.0.0"
---

# palimpsest-runtime-budget


## 硬前提

已批准的 provider/预算与真实可用额度；安全隔离已验证；真实 usage source 可读；实际进程树可终止。少任一项，live run 不启动，工程继续。

## 方法

1. doctor 检查 installed DSH 的 bash/fs executor、sandboxMode、permissions 与 secrets path。plugin active 不等于全部边界生效。
2. synthetic canary 测 Inbox 只读、跨 P/F 世界不可读、Oracle/未来文件不可见、runtime credentials 不可见、子进程不继承秘密。禁止用真实 secret 做测试。
3. Session usage 以稳定 identity 去重。分 input/output/cache 与 provider reported/estimated/unknown；不能对累计 counter 求重复和，也不能拿多个 Session 的 max 当 total。
4. 预算含 parent+child、已结束+在途。预留 matched pair；stop-start 阈值和 hard-local-stop 不同。额度不足仅阻断模型节点。
5. 终止测试验证平台真实 child cleanup；保存 raw stream 和实际 exit，不把 killed run 的旧产物当本轮交付。
6. 模型/provider 改变要新 cohort，禁止绕过账户/权限限制。报告 token 与货币账单不同。

## 输出

runtime qualification、effective catalogue、canary results、usage reconciliation、预算 decision ledger、cancellation/cleanup proof。stdout regex 可作辅助，不是唯一真实计量。
