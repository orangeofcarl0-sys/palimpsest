/**
 * Palimpsest Parallel: role-slot concurrency and base budgets (P3).
 *
 * The frozen aggregate keeps a single ACTIVE logical task and a bounded
 * candidate batch; P3 adds host-level concurrency discipline on top of that
 * contract — role slots (sparse cognitive parallelism defaults) and a
 * minimal attempt budget. Nothing here changes Event semantics: slots and
 * budgets are admission checks enforced at claim time by ProjectController.
 */

import { DomainValidationError } from "../domain/errors.js";
import type { TaskRole } from "../schema/index.js";

/** Sparse Cognitive Parallelism defaults, shrunk to a small-team plugin. */
export const DEFAULT_ROLE_SLOTS: Record<TaskRole, number> = {
  implementer: 2,
  tester: 1,
  verifier: 1,
  scout: 2,
  analyst: 2,
};

export const DEFAULT_HARD_CAP = 20;
export const DEFAULT_SOFT_CAP = 8;

export interface RoleSlotOptions {
  slots?: Partial<Record<TaskRole, number>> | undefined;
  /** Absolute ceiling across roles (hard cap); claims beyond it fail closed. */
  hardCap?: number | undefined;
}

export class RoleSlotPolicy {
  readonly #slots: Record<TaskRole, number>;
  readonly #hardCap: number;

  constructor(options: RoleSlotOptions = {}) {
    this.#slots = { ...DEFAULT_ROLE_SLOTS, ...options.slots };
    this.#hardCap = options.hardCap ?? DEFAULT_HARD_CAP;
  }

  slotOf(role: TaskRole): number {
    return this.#slots[role];
  }

  get hardCap(): number {
    return this.#hardCap;
  }

  /** Headroom left under the global cap after `running` attempts are in flight. */
  hardCapRemaining(running: number): number {
    return Math.max(0, this.#hardCap - running);
  }

  /**
   * Admission check at claim time. `running` maps each attempt id to its
   * role; only open attempts (CREATED/LEASED/RUNNING) occupy a slot.
   */
  assertAdmissible(
    role: TaskRole,
    runningRoles: readonly TaskRole[],
  ): void {
    const occupied = new Map<TaskRole, number>();
    for (const running of runningRoles) {
      occupied.set(running, (occupied.get(running) ?? 0) + 1);
    }
    const current = occupied.get(role) ?? 0;
    if (current >= this.#slots[role]) {
      throw new DomainValidationError(
        `role slot exhausted for ${role} (${current}/${this.#slots[role]})`,
      );
    }
    if (runningRoles.length >= this.#hardCap) {
      throw new DomainValidationError(
        `global concurrency cap reached (${runningRoles.length}/${this.#hardCap})`,
      );
    }
  }
}

export interface BudgetOptions {
  /** Total attempts admitted per project; undefined = unlimited. */
  maxAttempts?: number | undefined;
}

export class BudgetLedger {
  readonly #maxAttempts: number | undefined;
  #admitted = 0;
  #rejected = 0;

  constructor(options: BudgetOptions = {}) {
    this.#maxAttempts = options.maxAttempts;
  }

  get admitted(): number {
    return this.#admitted;
  }

  get rejected(): number {
    return this.#rejected;
  }

  /** Reserve one attempt slot; throws when the budget is exhausted. */
  admit(): void {
    if (this.#maxAttempts !== undefined && this.#admitted >= this.#maxAttempts) {
      this.#rejected += 1;
      throw new DomainValidationError(
        `attempt budget exhausted (${this.#admitted}/${this.#maxAttempts})`,
      );
    }
    this.#admitted += 1;
  }
}

export interface ParallelOptions {
  slots?: RoleSlotPolicy | undefined;
  budget?: BudgetLedger | undefined;
}
