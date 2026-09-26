/**
 * Recovery service (H1 spec §3.1): the startup reconciliation pass over
 * PREPARED promotions. The mechanics live on PromotionManager (it owns the
 * promotion state machine and its appends); this module is the public
 * recovery surface the controller and hosts consume.
 */

import type { EventStore } from "../state/index.js";
import type { PalimpsestEffectsRuntime } from "../effects/runtime.js";
import { PromotionManager } from "../effects/promotion.js";

/**
 * SR-2 §十八: the outcome and report types MOVED to `src/domain/promotion_recovery_contract.ts`,
 * a neutral contract module, so the promotion engine no longer imports this service to name a
 * result type. Re-exported here so every existing import path is unchanged.
 */
export type { PromotionRecoveryOutcome, RecoveryReport } from "../domain/promotion_recovery_contract.js";
// Imported as well as re-exported: this module's own signatures USE them.
import type { PromotionRecoveryOutcome as PromotionRecoveryOutcomeLocal, RecoveryReport as RecoveryReportLocal } from "../domain/promotion_recovery_contract.js";

export interface PromotionRecoveryService {
  reconcileAll(): Promise<RecoveryReportLocal>;
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
