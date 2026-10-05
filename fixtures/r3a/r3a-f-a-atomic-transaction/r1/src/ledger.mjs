/**
 * F-A — ATOMIC TRANSACTION APPLICATION (starting point H0).
 *
 * The store is the CALLER'S object: the caller keeps using it, so a transaction that fails part-way
 * through has already changed state the caller still holds.
 *
 * This implementation takes the obvious first move — walk the operations and apply each one as it
 * arrives — and therefore:
 *
 *   · validates nothing before mutating;
 *   · leaves a partial effect behind when a later operation is unusable;
 *   · re-applies a transaction it has already applied;
 *   · lets a balance go negative.
 */

export class LedgerError extends Error {
  /**
   * @param {string} code a stable, machine-readable failure code
   * @param {string} message a human-readable explanation
   */
  constructor(code, message) {
    super(message);
    this.name = "LedgerError";
    this.code = code;
  }
}

/**
 * Apply ONE transaction to the store.
 *
 * @param {{ accounts: Record<string, { balance: number }>, applied: Record<string, boolean> }} store
 *   the CALLER'S store; the caller keeps using the same object
 * @param {{ id: string, operations: ReadonlyArray<{ kind: string, account: string, amount: number }> }} txn
 * @returns the store
 */
export function applyTransaction(store, txn) {
  for (const operation of txn.operations) {
    const account = store.accounts[operation.account];
    if (operation.kind === "credit") {
      account.balance += operation.amount;
    } else {
      account.balance -= operation.amount;
    }
  }
  store.applied[txn.id] = true;
  return store;
}
