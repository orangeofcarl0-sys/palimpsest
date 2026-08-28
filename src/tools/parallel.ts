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
  /** The COMPLETE declared table - there is no silent default merge here. */
  slots: Record<TaskRole, number>;
  /** Absolute ceiling across roles (hard cap); claims beyond it fail closed. */
  hardCap?: number | undefined;
}

export class RoleSlotPolicy {
  readonly #slots: Record<TaskRole, number>;
  readonly #hardCap: number;

  constructor(options: RoleSlotOptions) {
    this.#slots = { ...options.slots };
    this.#hardCap = options.hardCap ?? DEFAULT_HARD_CAP;
  }

  /** The genesis table (H1 §3.4): the previously hardcoded defaults, declared. */
  static defaults(): RoleSlotPolicy {
    return new RoleSlotPolicy({ slots: { ...DEFAULT_ROLE_SLOTS }, hardCap: DEFAULT_HARD_CAP });
  }

  /** The declared table, for re-declaration through declareRoleTable. */
  table(): Array<{ role: string; slots: number }> {
    return Object.entries(this.#slots).map(([role, slots]) => ({ role, slots }));
  }

  get softCap(): number {
    return DEFAULT_SOFT_CAP;
  }

  /**
   * H1 §3.4 D-2: roles come from the declared table; an undeclared role fails
   * closed instead of silently falling back to a default.
   */
  slotOf(role: TaskRole): number {
    const slots = this.#slots[role];
    if (slots === undefined) {
      throw new DomainValidationError(`role "${role}" is not declared in the role table`);
    }
    return slots;
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
    const slot = this.slotOf(role);
    if (current >= slot) {
      throw new DomainValidationError(`role slot exhausted for ${role} (${current}/${slot})`);
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
