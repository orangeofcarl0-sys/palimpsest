# G10-AA — Outcome-witness evidence

Consolidated evidence that a promotion terminal fact can no longer be created by
constructing a valid Event and calling the generic EventStore.

## 1. Before / after, on the same production code

`scripts/audit/aa0-terminal-ingestion-repro.mjs`:

| Scenario | Before | After |
| --- | --- | --- |
| A. `append(PROMOTION_COMMITTED, invented head)` over a genuine PREPARED | `ACCEPTED`; proven effect head `cc…cc → …09` | `REJECTED: a new PROMOTION_COMMITTED requires a trusted effect-outcome witness` |
| B. `append(PROMOTION_FAILED)` over a genuine PREPARED with the merge **already landed** | `ACCEPTED`; fence `[]`; revision `COMMITTED`; task `STALE` | `REJECTED: a new PROMOTION_FAILED requires a trusted effect-outcome witness`; fence intact |
| C. `append(PROMOTION_PREPARED)` for an eligible attempt | `ACCEPTED`; fence created | `REJECTED: a PROMOTION_PREPARED intent requires a trusted intent permit` |

## 2. Structural plane — even a witness cannot violate it

`test/aa_terminal_admission.test.ts`:

| Case | Result |
| --- | --- |
| terminal with no PREPARED, WITH a witness | refused: "no PREPARED intent" |
| terminal whose `source_commit` / `expected_head_commit` / `attempt_id` differs from its PREPARED | refused: "is not a valid promotion terminal" |
| COMMITTED with `resulting_head_commit: null` | refused (kind rule) |
| FAILED with a non-null `resulting_head_commit` | refused (kind rule) |
| second terminal over an already-terminal promotion | refused: "is already COMMITTED; exactly one terminal transition is allowed" |
| identical terminal repeated | resolves to the stored event (idempotency, not a transition) |
| FAILED over a PREPARED with a FAILED witness | **admitted**, records no head, releases the fence |

## 3. Capability plane

| Case | Result |
| --- | --- |
| a plain object passed as a witness | refused: "not issued by the trusted promotion admission module" |
| `Object.create(Witness.prototype)` with copied fields | refused (instanceof passes, registry membership fails) |
| witness bound to another promotion / project / outcome kind | refused: binding mismatch |
| witness for head `H1` presented with a claim of `H2` | refused: resulting-head mismatch |
| second use of a consumed witness | refused: no longer live |
| a mismatched request | does **not** consume the capability (retry remains possible) |

## 4. Golden paths

| Path | Evidence |
| --- | --- |
| normal success | terminal recorded from the invocation result; `outcome_basis: invoke_result`; `operation_id: op_…`; `TASK_SATISFIED` still separate |
| Crash-B recovery | a proven effect records `ledger_receipt`/`reconciled_result`; the merge is never repeated (`merges` stays 1) |
| uncertain / in-flight | no terminal at all, after the failed attempt **and** after a recovery pass; fence intact |
| repeated terminal call | returns the stored event; no new effect; no capability required |
| deterministic failure / denied / cancelled / authority-revoked | bases implemented and admission-correct, but **not reachable** through the current engine contract (`CF-AA-01`) |

## 5. Head and fence integrity

* A forged COMMITTED cannot advance `ProjectHeadStatus`: `AA-N03`/`AA-N04` assert
  the head state and `provenEffectHeadCommit` are unchanged across the attempt.
* A forged FAILED cannot release Z's fence: `AA-N23` re-runs the whole attack and
  asserts the fence survives, the task stays `VERIFYING`, and the revision that
  the fake failure used to unlock is still blocked with
  `promotion_settlement_required`.
* A fabricated PREPARED cannot create a fence: `AA-N24` asserts the deny and that
  no fence appears.

## 6. Replay

| Property | Evidence |
| --- | --- |
| `verifyFull()` / `rebuildProjections()` need no Ordarium, Git, or capability | run with the effects runtime **closed** and a git port that rejects every call; both succeed, twice, deterministically |
| Plane B never runs during replay | the same store replays a terminal that was written under a one-shot capability which no longer exists |
| legacy terminals replay | no canonical history contains a terminal without a PREPARED, so the structural rule holds for all of it |
| legacy payload digests unmoved | a 6-key terminal payload normalizes to exactly those 6 keys; absent provenance keys are dropped by canonical JSON (`AA-N20`) |

## 7. Cross-plane regressions

| Plane | Evidence |
| --- | --- |
| Z promotion eligibility + fence | Z suites, `AA-N23`, and the new `invalidateTask` fence check |
| Y Evidence atomicity | `AA-N25` batch-order assertion; the Y suites |
| X head evolution / sequential multi-promotion | `AA-N25`/`AA-N26`; the X suites and dogfood |
| W revision atomicity | `AA-N27` contiguous-sequence assertion; the W suites |
| Projector stays dumb | `AA-N21` scans `projector.ts` for any effect-runtime or git reference |
| Head derivation unchanged | `AA-N22`; `promotionFactsSync()` still derives from `PROMOTION_COMMITTED` only |
