# Host Adapter conformance 规格（G18 首宿主接入，ALN-4② 兑现）

> **Spec ID**：`PLMP-CONF-1` ｜ 状态：**生效**（实现交付前为规范基线，交付时按 03 §8.3 出口审计 bump SDS）
> **权威序**：系统设计以 `03-system-design-spec.md`（PLMP-SDS）为准；G18 合同以 Ordarium `evidence/G18/design-spec.md` + docs/13 §8（`HOST_CONTRACT_VERSION` exact-match）为准；接入协议以对侧确认报告 `ordarium/docs/research/palimpsest-aln4-2-confirmation-2026-09-06.md`（P1–P6）为准；本文＝Palimpsest 侧接入的形状、映射语义与验收权威。
> **修订记录**：`CONF-1`＝初版冻结（2026-09-06）：握手字面量钉住、`hostPort` 全直通映射、runner 四场景、scratch 账本令；验收 CONF-A01–A06。

---

## 0. 立项与边界

G18 已交付（`@ordarium/host-kit`，contract generation 1），ALN-4② 的"待对侧交付"死门解除。本规格落实对侧确认报告的 P1–P6 接入协议：Palimpsest 作为**首宿主 conformance 案例**。

**边界裁决（用户 2026-09-06）**：消费通道不强制等 release，"直接 pull 也行"——实测判死（host-kit 声明 `workspace:*` 互依赖，git 通道无 workspace 上下文必失败；git checkout 无 dist 无 prepare），故走**最小 release**（ordarium-v1.2.0，六包 tarball，两裁决记 07 r8）。

**非目标**：不写第二套 conformance 场景（场景权威留 `@ordarium/testing`，单一事实源）；不改既有 `invoke()` 编排内路径（其 plan-revision 授权推导保持）；`HostAdapterHarness` 深化留后续（runner 四场景已覆盖 G18 最低门槛）；工具面与事件契约零触碰。

## 1. 形状

### 1.1 握手（装配期 fail-closed）

```ts
// createPalimpsestEffects 装配首行
assertHostContract(1);
```

- **字面量 `1` 钉住**：palimpsest 构建与测试所针对的合同代数。若未来依赖 bump 带来合同代数 2 而本行未自觉更新，装配即抛 `HOST_CONTRACT_MISMATCH`——fail-closed，无容忍层（docs/13 §8：tolerated mismatch 即兼容层）。
- 导出来自 `@ordarium/host-kit`（curated 面，宿主适配器线不直连 core）。

### 1.2 映射面（`PalimpsestEffectsRuntime.hostPort`）

```ts
const hostPort: HostInvocationPort = {
  invoke: (action, input, invocation) => action.run(runtime, input, invocation),
};
```

- **零损耗整体直通**：`HostInvocation` 与 core `ActionRunOptions` 字段同构（identity/authorization/providerPrincipalRef/signal），映射不丢不改任何字段；语义（幂等/reconcile/授权门）由 Action 合同与 runtime 拥有，映射只消费。
- **双面并存**：`invoke()`（编排内路径，plan-revision 授权推导）保持不变；`hostPort` 是 G18 对外合同面（外部适配器经它进入）。两者都汇入同一 `action.run`。
- 随 `PalimpsestEffectsRuntime.hostPort` 暴露。

### 1.3 conformance runner（P2）

```ts
await runHostAdapterConformance(effects.hostPort, effects.runtime.ledger);
```

- 场景权威在 `@ordarium/testing`（随 `HOST_CONTRACT_VERSION` 演进的单一事实源）；Palimpsest 侧 vitest 只做**执行与装配**。
- **scratch 账本令**：runner 只允许打临时库（rig 的 `databasePath` 即临时 `operations.sqlite`），严禁指向 `$DSH_HOME` 生产账本。

## 2. 无兼容层

- 合同代数不匹配 → 装配期抛错（无多版本容忍、无 shim，docs/13 §8 纪律）。
- 既有 `invoke()` 路径、事件契约、工具面、parity：零触碰。
- 场景不复制：Palimpsest 不自写场景断言，避免"映射错 vs 场景漂移"不可区分（对侧报告 §4）。

## 3. 验收

| # | 验收 | 方法 |
|---|---|---|
| CONF-A01 | 握手钉住 | `assertHostContract(1)` 装配期通过（全部套件绿即证）；错代数 `assertHostContract(2)` 抛 `HostContractMismatchError`（单元断言） |
| CONF-A02 | 映射面直通 | `hostPort.invoke` 以宿主 identity/authorization 执行 `worktreeCreate`，产物与账本操作带该身份 |
| CONF-A03 | runner 四场景 | `runHostAdapterConformance(hostPort, ledger)` 全过（重放收敛/兄弟分离/授权门/lineage 过缝） |
| CONF-A04 | scratch 账本令 | runner 所用 ledger 即 rig 临时 `operations.sqlite` |
| CONF-A05 | 既有路径零漂移 | 全量 `pnpm check`（35/202 基线 ＋ 新增）绿 |
| CONF-A06 | 登记闭环 | 07 §2 演进清单新增 Host Adapter 行（四元组）+ r8 修订流水 |

交付出口：03 SDS bump；00-heritage 差异登记行（R17）；01 §3 分层图行；工程索引登记。

## 4. 修订流水

| 日期 | 修订 |
|---|---|
| 2026-09-06 | 初版冻结（PLMP-CONF-1）：G18 首宿主接入（ALN-4② 兑现）；握手字面量钉住、`hostPort` 全直通映射（HostInvocation≡ActionRunOptions）、runner 四场景 + scratch 账本令、验收 CONF-A01–A06；通道裁决（release 为最短可行路径）记 07 r8。 |
