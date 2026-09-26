/**
 * SR-2 §十八 — the PROMOTION RECOVERY CONTRACT.
 *
 * These two types are pure data shared by the promotion engine (`effects/promotion.ts`) and the
 * recovery service (`recovery/recovery.ts`). They lived in the recovery module, which made the
 * engine import its own consumer to name a result — closing the `promotion ↔ recovery` SCC.
 *
 *     Promotion  → durable records / narrow read contract → Recovery
 *
 * The dependency that MATTERS is `recovery → promotion`: the mechanics live on `PromotionManager`,
 * and recovery drives them. The reverse edge existed only for these two type names, so the types
 * move DOWN here — a neutral contract module with no behaviour, no store and no authority — and
 * both sides import it. That is a contract relocation, not a protocol change: not one field, tag or
 * string in this file is different from where it was.
 *
 * Layer: L1 (`src/domain/`). Both consumers are above it.
 */

export type PromotionRecoveryOutcome =
  | {
      promotionId: string;
      outcome: "committed";
      resultingHeadCommit: string;
      /** receipt: Ordarium already held the success; reconcile: the action's
       * reconcile query proved it; redispatch: the record was absent and the
       * invocation re-ran. */
      via: "receipt" | "reconcile" | "redispatch";
    }
  | { promotionId: string; outcome: "failed"; reason: string }
  | { promotionId: string; outcome: "in-flight"; ordariumState: string }
  | { promotionId: string; outcome: "blocked"; reason: string };

export interface RecoveryReport {
  /** PREPARED promotions found (before reconciliation). */
  prepared: number;
  /** Driven to a terminal state (PROMOTION_COMMITTED / PROMOTION_FAILED). */
  terminal: PromotionRecoveryOutcome[];
  /** Ordarium still owns the outcome (claimed/dispatched/redispatching). */
  inFlight: PromotionRecoveryOutcome[];
  /** Reconciliation cannot proceed; the operator must decide (H1-A2). */
  blocked: PromotionRecoveryOutcome[];
}
