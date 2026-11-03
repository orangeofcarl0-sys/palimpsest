# S05 — Collaboration contracts, independence and async lifecycle

## 1. Four executors, named honestly

`selectMechanism` chooses between:

- `NATIVE_SUBAGENT` — a short independent read/cross-check;
- `REASONING_BRANCH` — bounded parallel exploration whose findings are exploratory, never Evidence;
- `MANAGED_WORK_WORKER` — independent work that must produce a governed result;
- `DURABLE_PROJECT_PEER` — work that must outlive the session;
- `PRINCIPAL_ONLY` — no extra agent is justified;
- `UNAVAILABLE` — the requested capability is not composed, with the exact missing configuration.

It never pretends an unavailable parallel branch is a serial run of the same executor.

## 2. Handoff and receipt

`makeHandoff` requires: task, intent, at least one constraint, project basis, source standing,
allowed resources, expected artifact, at least one stop condition, a positive budget, and the
decisions the upper layer must make. `makeReceipt` requires the executor identity, findings with
sources/hypothesis/counter-evidence/uncertainty, artifacts, the actual read footprint, and a status
(`COMPLETE|PARTIAL|CONFLICT|INTERRUPTED|REFUSED`). A COMPLETE receipt must state what it read.

## 3. Independence

`assessIndependence` counts ROOT sources, not prose:

- two receipts that read the same root source are not independent verification;
- a claim supported by two receipts with different root sources is marked independently supported;
- a hypothesis is not counted as the positive side of a conflict; the conflict is preserved;
- fewer than two receipts never yields independent verification.

## 4. Async lifecycle

`HandoffLifecycle` separates `CREATED → QUEUED → DELIVERED → CONSUMED → ACTED`, with `CANCELLED`
and `INTERRUPTED` as terminal-for-authority states. Duplicate deliveries are idempotent by
delivery id; a conflicting duplicate is refused; consume-before-deliver is refused; a late delivery
after consume is recorded but does not reopen the handoff; a snapshot restores state; an interrupted
job is never reported as running.

## 5. Product paths

- Path A: the existing `palimpsest_collaborate` / `palimpsest_delegate` tools (reasoning branches).
- Path B: the existing `palimpsest_cross_project` federation ask; it requires a project directory,
  local peer and transport, and is absent rather than stubbed otherwise.

## 6. Tests and evidence

`test/pc1_collaboration.test.ts` (10 tests): handoff/receipt contracts, same-root vs different-root
independence, preserved conflict, mechanism absence, duplicate/out-of-order/cancel/restart,
interrupted state. No live independent agent was run; a deterministic protocol test is not a
behavioral claim.

## 7. Residual limits

- Live path A/B are `BLOCKED` without a spend authorization and a configured peer/federation.
- The handoff/receipt contract is not yet wired into the existing delegation return payload; the
  reasoning branch still returns its own findings. A follow-up can map that return to this receipt
  without changing the executor.
