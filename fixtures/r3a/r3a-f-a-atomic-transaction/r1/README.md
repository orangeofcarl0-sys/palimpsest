# F-A — atomic transaction application

`applyTransaction(store, txn)` applies ONE transaction to a caller-owned store.

## The store

```js
{ accounts: { [accountId]: { balance: number } }, applied: { [txnId]: true } }
```

## The transaction

```js
{ id: string, operations: [{ kind: "credit" | "debit", account: string, amount: number }] }
```

## What the contract requires

· `applyTransaction` returns the store.
· An unusable transaction is REFUSED by throwing an error with a `code`, and a refused transaction must
  leave the caller's store exactly as it was.
· A transaction the store has already applied is a no-op.
· A debit may not take an account below zero.
· Accounts the transaction does not name must be left alone.

## Running the checks

```
node test/check.js
```

The visible checks cover the ordinary path. They are not the whole contract.
