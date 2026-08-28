/**
 * Recovery service (H1 spec §3.1): the startup reconciliation pass over
 * PREPARED promotions. The mechanics live on PromotionManager (it owns the
 * promotion state machine and its appends); this module is the public
 * recovery surface the controller and hosts consume.
 */

import type { EventStore } from "../state/index.js";
import type { PalimpsestEffectsRuntime } from "../effects/runtime.js";
import { PromotionManager } from "../effects/promotion.js";

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

export interface PromotionRecoveryService {
  reconcileAll(): Promise<RecoveryReport>;
}

export function createPromotionRecoveryService(options: {
  store: EventStore;
  effects: PalimpsestEffectsRuntime;
  projectId: string;
}): PromotionRecoveryService {
  const manager = new PromotionManager(options.store, options.effects, options.projectId);
  return {
    async reconcileAll() {
      return manager.reconcileAll();
    },
  };
}
