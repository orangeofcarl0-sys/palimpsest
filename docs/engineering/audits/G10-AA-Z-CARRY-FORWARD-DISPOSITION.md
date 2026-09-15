# G10-AA — Z carry-forward disposition

Every item from `G10-Z-CARRY-FORWARD.md` is disposed below. `CF-Z-02` is
**CLOSED_IN_AA**. All other items are reassessed without merging unrelated scope.

| ID | Disposition | Reasoning and evidence |
| --- | --- | --- |
| **CF-Z-02** | **CLOSED_IN_AA** | Promotion terminals are no longer generic-appendable. `PROMOTION_COMMITTED` and `PROMOTION_FAILED` now have (a) replay-safe structural validation proving they are the unique terminal of an earlier matching `PROMOTION_PREPARED`, and (b) live-only admission requiring a one-shot, fully bound `PromotionOutcomeWitness`. Synchronously, `PROMOTION_PREPARED` requires an admitted `PromotionIntentPermit`, so the §28 fabricated-fence hole is closed too. Independently reproduced and closed (`scripts/audit/aa0-terminal-ingestion-repro.mjs`: forged COMMITTED no longer moves the head, forged FAILED no longer releases the fence, fabricated PREPARED no longer creates one). Guarded by `AA-N01`…`AA-N10`, `AA-N16`, `AA-N23`, `AA-N24`. |
| **CF-Z-01** | **STILL_DEFERRED_WITH_TRIGGER, weight unchanged** | The promotion fence is still derived per call with no cache. AA adds one projection read per promotion attempt and none per revision. **Trigger (unchanged):** a project with a large pending-promotion backlog. |
| **CF-Z-03** | **REASSESSED_IN_AA, still separate** | The `input_world_stale` report facet is still unreachable through the event store. AA does not change report recording. **Trigger (unchanged):** a path that records reports without the aggregate's input-identity check. |
| **CF-Z-04** | **REASSESSED_IN_AA, still separate** | Recovery still does not settle Work by itself; a scheduler step is required, as `runTurn` does. Unchanged by AA. **Trigger (unchanged):** a host that calls `reconcileAll()` without a subsequent turn. |
| **CF-Y-01** | **CLOSED_IN_Z, held** | Retired Work holds no promotion authority. AA's structural plane deliberately does NOT re-check current Work state, so Z's "effect truth can still be recorded honestly" exception survives (proven by the Crash-B recovery golden path). |
| **CF-Y-02** | **CLOSED_IN_Z, held** | The read-vs-batch concern remains dominated by replay-safety, which AA extends: the structural terminal plane reads the `promotions` projection, never the event log. |
| **CF-W-04** | **STILL_DEFERRED_WITH_TRIGGER** | `resume.action = "blocked"` still has no dedicated reproduction test. **Trigger:** a feature that changes a project revision without settling/re-authorizing in-flight work. |
| **CF-W-05** | **STILL_DEFERRED_WITH_TRIGGER** | `GET /api/manage/preview` still unconsumed by `web/**`. AA adds no route. **Trigger:** a UI change that wants preview without the step path. |
| **CF-W-06** | **STILL_DEFERRED_WITH_TRIGGER** | Retained-task dependency-state reconciliation; AA does not touch it and does not depend on it. **Trigger:** an operator expecting a revision/head sync to recompute retained-task states. |
| **CF-W-07** | **STILL_DEFERRED_WITH_TRIGGER, weight unchanged** | O(tasks)-per-revision unchanged; AA adds no per-revision work. **Trigger:** a project with thousands of tasks where promotions/revisions are frequent. |
| **CF-X-01** | **STILL_DEFERRED_WITH_TRIGGER** | Real cross-revision/parallel promotion remains unsupported and unfaked (its unsafe effect-first path stays closed from Z). `AA-N30` re-asserts no compatibility engine and no parallel surface. **Trigger:** a topology/product need for two concurrent tasks to promote independently from the same base. |
| **CF-X-02** | **STILL_DEFERRED_WITH_TRIGGER** | Project-head state and the promotion fence are still not rendered by `web/**`. **Trigger:** a UI change that wants to show them. |
| **CF-X-03** | **STILL_DEFERRED_WITH_TRIGGER** | Trusted `headAdvance` still has no production caller beyond `reconcileProjectHead`. **Trigger:** a future internal caller wanting to commit a pre-compiled reconciliation without the wrapper. |
| **CF-X-04** | **STILL_DEFERRED_WITH_TRIGGER** | `pump`/`promote` CLI paths still lack CLI-level end-to-end tests. **Trigger:** a CLI-behaviour change or a request for CLI-level coverage. |

## New items surfaced by AA

Recorded in `G10-AA-CARRY-FORWARD.md`:

* **CF-AA-01** — the `deterministic_failure`, `denied`, `cancelled` and
  `authority_revoked_before_dispatch` FAILED bases are implemented and
  admission-correct but not reachable through the current engine contract (a
  provider error becomes `UncertainOperationError`; `orchestrationAuthorization`
  always allows). They are defence in depth.
* **CF-AA-02** — the hostile-writer case within the trust boundary: a module that
  imports the admission module can mint capabilities. Documented as the boundary,
  not defended.
* **CF-AA-03** — a Z-fence gap discovered and **closed** in AA: `invalidateTask`
  bypassed the promotion fence. It now applies the same fence; no production
  caller existed.
