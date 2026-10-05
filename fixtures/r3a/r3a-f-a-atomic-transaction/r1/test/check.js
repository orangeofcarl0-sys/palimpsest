import assert from "node:assert/strict";
import { applyTransaction } from "../src/ledger.mjs";

const fresh = () => ({ accounts: { a: { balance: 10 }, b: { balance: 5 } }, applied: {} });

// An ordinary transaction applies and records itself.
{
  const store = fresh();
  applyTransaction(store, { id: "t1", operations: [{ kind: "credit", account: "a", amount: 4 }] });
  assert.equal(store.accounts.a.balance, 14, "a credit must be applied");
  assert.equal(store.applied.t1, true, "an applied transaction must be recorded");
}

// A debit within the balance applies.
{
  const store = fresh();
  applyTransaction(store, { id: "t2", operations: [{ kind: "debit", account: "a", amount: 3 }] });
  assert.equal(store.accounts.a.balance, 7, "a covered debit must be applied");
}

// An unusable operation must not leave the caller's store changed.
{
  const store = fresh();
  const before = JSON.stringify(store);
  let threw = false;
  try {
    applyTransaction(store, { id: "t3", operations: [{ kind: "credit", account: "a", amount: 4 }, { kind: "credit", account: "missing", amount: 1 }] });
  } catch {
    threw = true;
  }
  assert.equal(threw, true, "a transaction naming an unknown account must be refused");
  assert.equal(JSON.stringify(store), before, "a refused transaction must leave the store untouched");
}

process.stdout.write("ok" + String.fromCharCode(10));
