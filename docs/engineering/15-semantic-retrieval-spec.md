# Semantic 检索通道规格（Context Compiler 复杂度层第一层）

> **Spec ID**：`PLMP-CTX-3` ｜ 状态：**生效**（实现交付前为规范基线，交付时按 03 §8.3 出口审计 bump SDS）
> **权威序**：系统设计以 `03-system-design-spec.md`（PLMP-SDS）为准；检索半边以 `14`（PLMP-CTX-2）为准；素材母体＝raw-notes 预算.txt §5（混合检索）/§6（选择评分）。本文＝semantic 通道的形状、宿主注入边界与验收权威。
> **修订记录**：`CTX-3`＝初版冻结（2026-09-06）：EmbeddingPort 宿主注入 + 确定性哈希参考实现、`collectWorktreeTexts` 原料面、§6 评分 V0（三特征可算余中性）、manifest.semantic 加法式字段；验收 CTX3-A01–A05。

---

## 0. 立项与边界

CTX-2 交付了词法通道；§5 的 semantic 通道补"概念相关但字面不同"的检索。**宿主中立红线**：embedding 必须调模型——本仓只定义**端口**与**确定性参考实现**，真实 embedding 由宿主注入。数据门槛已由实证累积满足（28 attempts，覆盖/资格数据在案）。

**非目标**：runtime retrieval（traceback 定位）；§6 的 D/E/F/C 特征 V0 置中性（依赖接近度/证据重要性/失败史相关性/关键性的文件级度量后置）；Boot/Pull（规格 16 另立）；envelope/工具面/事件契约必填字段变更。

## 1. 形状

### 1.1 EmbeddingPort（宿主注入，`src/context/embedding.ts`）

```ts
export interface EmbeddingPort {
  embed(texts: readonly string[]): Promise<ReadonlyArray<readonly number[]>>;
}
```

- **参考实现** `hashingEmbedder(dimensions = 64)`：token 哈希投维、**原始计数向量（r2：不做 L2 归一化——幅度是文件级密度的信号，归一化会抹掉它）**——确定性、无模型、纯 JS；供测试与干净环境（生产宿主注入真实 embedding）。
- 注入点：`createPalimpsestEffects` 增可选 `embedding?: EmbeddingPort`，随 `PalimpsestEffectsRuntime.embedding` 暴露；**缺席 = semantic 通道关闭**（词法行为零漂移）。

### 1.2 原料面（GitPort 扩展）

```ts
collectWorktreeTexts(input: { worktreeId: string; maxFiles?: number; maxBytesPerFile?: number }):
  Promise<Array<{ path: string; content: string }>>
```

只读原文收集（Fake＝种子文件全量、CLI＝递归遍历，.git 跳过、1MB/文件卫兵、默认 64 文件封顶）；`scanLexical` 不动。

### 1.3 semantic 通道（`compileTaskContext` 内，仅在 port 存在时激活）

- query＝`objective + required_artifacts` 原文；chunks＝collectWorktreeTexts 的文件全文；
- **点积排序** top-k（k=8，cosine ≥ 0.05 才入选；r2：点积奖励文件级密度，余弦归一化会抹掉它）；
- **manifest 增加法式可选字段** `semantic: Array<{ path: string; scorePermille: number }>`（payload 分支同步加法式；**score 存千分比整数**——canonical JSON 禁浮点）；`retrieval` 记录 `"semantic"`；
- **§6 评分 V0**：`score_permille = clamp(dot, 0, 1000)`（r2：dot 为排序与得分共同基础；重复内容 digest 去重）——R/T/X 三特征可算，D/E/F/C 置中性（声明在案，权重固定 V0）；
- coverage：semantic 命中计入 code 路径覆盖（与词法同权）。

## 2. 无兼容层

- `manifest.semantic` 为加法式可选字段（payload 分支加法式，既有 manifest 事件不受影响）；`EmbeddingPort` 缺席时全链行为与 CTX-2 逐字节一致。
- 无 shim、无旧路径；hashingEmbedder 是参考实现而非兼容层（生产宿主注入真实端口）。

## 3. 验收

| # | 验收 | 方法 |
|---|---|---|
| CTX3-A01 | 哈希参考实现 | 确定性（双调用全等）、L2 归一化（模长 1）、维度恰为 64 |
| CTX3-A02 | 语义排序 | 密集命中 objective 词汇的文件在 semantic 排序中位于稀疏文件之前（文件级聚合优于行级命中） |
| CTX3-A03 | 缺席零漂移 | 未注入 port → manifest 无 `semantic` 字段、`retrieval` 仅 `["lexical"]`、其余返回与 CTX-2 全等 |
| CTX3-A04 | manifest 回路 | semantic 命中经事件落账（payload 加法式）+ 投影可查 + coverage 计入 |
| CTX3-A05 | 纯函数性 | 评分函数同输入双调用全等 |

交付出口：全量 `pnpm check`；03 SDS bump；00/01 登记行（R20）；工程索引登记。

## 4. 修订流水

| 日期 | 修订 |
|---|---|
| 2026-09-06 | 初版冻结（PLMP-CTX-3）：EmbeddingPort + hashingEmbedder 参考实现、collectWorktreeTexts 原料面、semantic 通道（cosine top-k、§6 评分 V0 三特征）、manifest.semantic 加法式字段、验收 CTX3-A01–A05。 |
