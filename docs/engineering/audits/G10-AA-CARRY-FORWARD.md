# G10-AA — Carry-Forward

No `BLOCKER_IN_AA`. `CF-Z-02` is **CLOSED_IN_AA**; `CF-AA-03` is a Z-fence gap
found and **CLOSED_IN_AA**. The items below are surfaced or re-confirmed by the AA
work and do not block the delivered claims.

| ID | Kind | Finding | Concrete trigger |
| --- | --- | --- | --- |
| CF-Z-02 | invariant | **CLOSED_IN_AA.** Promotion terminals require replay-safe structural anchoring to an admitted PREPARED intent **and** a trusted one-shot outcome witness; the intent itself requires an admitted permit. Guarded by the reproducer and `AA-N01`…`AA-N10`, `AA-N16`, `AA-N23`, `AA-N24`. | Closed; keep the reproducer and the AA suites as the regression guard. |
| CF-AA-03 | semantics/authority | **CLOSED_IN_AA.** Z's promotion fence lived only in `planReconciled`, so `invalidateTask` could retire Work across an unresolved external effect and manufacture the state recovery's authority re-check guards. `invalidateTask` now applies the same fence (it had no production callers). | Closed; the Z/AA suites assert every retirement path is refused while an intent is unresolved. |
| CF-AA-01 | coverage | **NEW.** The `deterministic_failure`, `denied`, `cancelled` and `authority_revoked_before_dispatch` outcome bases are implemented and admission-correct, but unreachable through the current engine contract: a provider error is surfaced as `UncertainOperationError` (the engine genuinely cannot tell whether the effect happened) and `orchestrationAuthorization` always returns `allow`. No test had ever produced a `PROMOTION_FAILED` through the manager. | An engine/host change that can establish a deterministic denial or failure (for example a host-adapter authorization denial reaching `promote()`), or a supported cancel path. |
| CF-AA-02 | security/boundary | **NEW (documented, not defended).** A module that imports `promotion_terminal_admission.ts` can mint capabilities. AA defends the protocol - generic append, plugin writers, accidental alternate ingestion - not same-process malicious code, and not DB/hash/memory tampering. | A multi-tenant or untrusted-plugin topology, where an out-of-process or capability-token admission channel would be needed. |
| CF-AA-04 | coverage | **NEW.** The provenance fields (`operation_id`, `outcome_basis`, `outcome_digest`) are written by the governed manager and are therefore an audit aid, not a proof: a within-boundary writer can omit or forge them. | A requirement to make provenance tamper-evident, which would need the witness digest recorded in the event and validated structurally. |
| CF-AA-05 | compatibility | **NEW (no impact found).** The structural rule requires a PREPARED before any terminal. No fixture or canonical history contains an orphan terminal, so replay compatibility holds today. | Importing a foreign log, or a future writer that appends a terminal without an intent. |
| CF-Z-01 | scale | **STILL_DEFERRED_WITH_TRIGGER, weight unchanged.** The promotion fence is derived per call with no cache; AA adds one projection read per promotion attempt. | A project with a large pending-promotion backlog. |
| CF-Y-01 / CF-Y-02 | — | **CLOSED_IN_Z, held by AA**: the structural terminal plane deliberately does not consult current Work state, so effect truth can still be recorded honestly after Work revocation. | — |
| CF-W-04 / CF-W-05 / CF-W-06 / CF-W-07 | various | **STILL_DEFERRED_WITH_TRIGGER**, unchanged and untouched by AA. | Unchanged from the Z disposition. |
| CF-X-01 | semantics/invariant | **STILL_DEFERRED_WITH_TRIGGER.** Real cross-revision/parallel promotion remains unsupported and unfaked. | A topology/product need for two concurrent tasks to promote independently from the same base. |
| CF-X-02 / CF-X-03 / CF-X-04 | product/coverage | **STILL_DEFERRED_WITH_TRIGGER**, unchanged. | Unchanged from the Z disposition. |

## Recommended next stage (assessment only)

Ranked by authority/integrity risk first, then state consistency, operational
capability, product polish, ecosystem:

1. **CF-AA-02** — the trust boundary. It is the only item that bounds the strength
   of what AA just delivered; if untrusted plugins are ever in scope, admission
   must move out of process or to an unforgeable token. Until then it is a
   documented boundary, not a gap.
2. **CF-AA-01** — a reachable deterministic-failure basis. It becomes relevant the
   moment a host-adapter denial or a cancel path can reach the promotion
   protocol, and it is the last unfinished half of §43/§44.
3. **CF-W-06** — retained-task dependency-state reconciliation, which becomes
   load-bearing as concurrency grows (and is CF-X-01's precondition).
4. Everything else is scale, coverage and product surface, in that order.

Explicitly **not** privileged by this ordering: the External Asset Library Bridge.
