# Boot/Pull 上下文分发规格（Context Compiler 复杂度层第二层）

> **Spec ID**：`PLMP-CTX-4` ｜ 状态：**生效**（实现交付前为规范基线，交付时按 03 §8.3 出口审计 bump SDS）
> **权威序**：系统设计以 `03-system-design-spec.md`（PLMP-SDS）为准；manifest 以 `14`（PLMP-CTX-2）为准；素材母体＝raw-notes 预算.txt §12（Boot/Pull 分层）。本文＝上下文分发的形状、句柄语法与验收权威。
> **修订记录**：`CTX-4`＝初版冻结（2026-09-06）：manifest 视图分类（boot 字节预算 + pull 句柄）、`fetchContext` 句柄解析面；验收 CTX4-A01–A05。

---

## 0. 立项与边界

§12：context 分为 **Boot**（一次性内联，20–40K 量级）与 **Pull**（可寻址句柄，按需取回）——"working set + addressable external memory"。本规格把已交付的 manifest（CTX-1/2）变成该分层的载体：**manifest 本体不变，分发视图在其上分类**。

**非目标**：envelope 携带句柄（事件契约不动）；worker 协议中途取件（需 DSH manifest 后议）；token 精确计量（V0 字节近似）；工具面变更（`fetchContext` 为 controller API）。

## 1. 形状

### 1.1 分发分类（纯函数）

```ts
distributeContext(manifest: ContextManifest, options?: {
  bootBudgetBytes?: number;   // 缺省 40_960（§12 的 40K）
}): {
  boot: ReadonlyArray<{ handle: string; kind: "exact" | "source" | "evidence"; bytes: number }>;
  handles: ReadonlyArray<{ handle: string; kind: "exact" | "source" | "evidence"; ref: string }>;
}
```

- **句柄语法**：`@ctx/exact/<ref>`、`@ctx/source/<path>`、`@ctx/evidence/<evidenceId>`；
- **分类顺序**：exact 引用**恒入 boot**（§9 exact 是任务必须尊重的契约）；source/evidence 条目按 manifest 顺序入 boot，**字节预算（snippet/内容近似长度累计）耗尽即转入 handles**；
- `excluded_stale` 永不分发（§9 红线延续）。

### 1.2 句柄解析（`fetchContext`）

```ts
fetchContext(handle: string): Promise<{
  kind: "exact" | "source" | "evidence";
  ref: string;
  // source：manifest 条目（path/line/snippet）；evidence：证据原子全文；
  // exact：引用串 + digest
  body: unknown;
} | undefined>
```

- 未知句柄 → `undefined`（不抛错——句柄是建议性索引，不是合同断言）；
- source 内容抓取走宿主侧路径（worktree 存活时宿主可按 path 读文件；V0 body＝manifest 条目元数据 + snippet）。

## 2. 无兼容层

- manifest 事件/投影/AttemptReport：**零触碰**——分发视图纯派生，每次按需计算，不落账、不持久化；
- `compileTaskContext` 返回增加法式可选 `distribution` 节；既有消费方零影响。

## 3. 验收

| # | 验收 | 方法 |
|---|---|---|
| CTX4-A01 | 分类确定性 | 同 manifest 双调用全等；exact 恒在 boot |
| CTX4-A02 | 字节预算 | 预算内条目入 boot、超出转 handles；预算缺省 40960 |
| CTX4-A03 | 句柄语法 | 三类句柄前缀/引用恰定；excluded_stale 永不出现在两侧 |
| CTX4-A04 | 句柄解析 | source/evidence/exact 句柄各自解析出正确 body；未知句柄 undefined |
| CTX4-A05 | 零契约触碰 | 分发前后事件数与 snapshotDigest 不变；compileTaskContext 既有字段不变 |

交付出口：全量 `pnpm check`；03 SDS bump；00/01 登记行（R21）；工程索引登记。

## 4. 修订流水

| 日期 | 修订 |
|---|---|
| 2026-09-06 | 初版冻结（PLMP-CTX-4）：manifest 分发视图（boot 字节预算 + pull 句柄语法三类）、`fetchContext` 解析面、验收 CTX4-A01–A05。 |
