# event-reducer

Apply a durable event log to a store's current state.

## Goal

An append-only event log is the source of truth for a small replicated store. The log is shipped
between replicas as an array, and each replica applies it to the state it already holds.

```ts
export function applyEventStream(state: State, events: readonly Event[]): State
```

`state` is the caller's current state — a plain object keyed by entity id — and the caller keeps using
the same object afterwards. An event carries the entity `id` it concerns, the position `seq` the log
assigned it, an `op` of `SET` or `DELETE`, and for a `SET` a value under one of `v` / `value` /
`payload` / `data`.

`applyEventStream` returns the state, and the caller goes on to read that object.

## Acceptance

Run the oracle:

```sh
node test/check.js
```

It reports one line per case:

```
PASS <case id>
FAIL <case id> <failureClass> <detail>
```

The failure classes are `REJECTED_BUT_SHOULD_ACCEPT`, `WRONG_STATE`, `ACCEPTED_INVALID_HISTORY` and
`MUTATED_STATE_BEFORE_REJECTING`. `WRONG_STATE` names the first canonical path that differs from the
expected state.

`test/cases.json` holds the cases this oracle judges, including the expected state for the accepted
ones. The oracle's case list is **not** the whole acceptance contract: the project also has an
independent acceptance oracle covering the same contract with different data, and that one is the
authority. Passing `test/check.js` is necessary but not sufficient.

## Notes

- Replicas must agree: two replicas that hold the same log must end up in the same state.
- The array a replica receives is whatever the transport delivered, not necessarily what the log holds.
- The log is durable, so the same event may be delivered more than once.
- A caller that hands its state to `applyEventStream` still owns that object afterwards.
