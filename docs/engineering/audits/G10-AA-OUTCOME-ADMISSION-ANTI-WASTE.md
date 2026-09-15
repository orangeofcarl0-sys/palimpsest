# G10-AA — Outcome-admission anti-waste audit

| Claim | Evidence |
| --- | --- |
| **No second promotion ledger** | `AA-N28` asserts the only promotion-named table is `promotions`; no table matches `/promotion\|receipt\|witness\|permit/`. The capability is in-memory and ephemeral. |
| **No duplicate Ordarium receipt store** | No receipt is persisted. The witness carries only an optional `outcome_digest` over the minimal receipt fields, and the full record is never copied. |
| **No background receipt poller** | Nothing schedules work; recovery is still the explicit `reconcileAll()` pass. No timer exists in the admission module. |
| **No second project-head truth** | `promotionFactsSync()` and `canonicalExpectedHead` are unchanged and still derive from `PROMOTION_COMMITTED` facts (`AA-N22`). AA adds no head source; it only narrows who may create those facts. |
| **No custom replacement recovery engine** | `reconcileAll()` still delegates every outcome to Ordarium's engine; AA wraps the two observations it already made (`invoke` result, ledger record) in a witness. No reconcile/retry policy was reimplemented. |
| **No ManagerAgent** | Untouched; the management layer still has no promotion action class. |
| **No new event type / migration / table** | `fixtures/**` untouched; the full suite passes on the existing ledger schema version. |
| **One admission seam, two call sites** | `appendPromotionIntent` and `appendPromotionTerminal` are the only producers of promotion facts; the generic `append` denies them. `PromotionManager` is the only minter. |
| **No duplicated lifecycle rules** | `promotionTerminalProblems` is the single definition, used by the structural plane; the capability module owns all binding rules and is used by the live plane. |

## Cost added at runtime

* Per promotion: one capability allocation (a small object with a digest), one
  extra single-row projection read inside the structural plane (the PREPARED
  intent), and one `promotions` projection read to resolve the intent event ref
  for provenance.
* Per revision: unchanged (AA does not touch the revision path).
* Per replay: one extra single-row projection read per terminal event, and **no**
  capability requirement, no Ordarium, no Git.

Net: no external call was added, no transaction was added, and the only new
persistent bytes are three optional provenance strings on terminal payloads.

## Deliberately NOT built

```text
a receipt store                    a promotion lock/ticket table
a background reconciler            a second head derivation
a distributed transaction          a cross-revision compatibility engine
a ManagerAgent                     an External Asset bridge
a secret/HMAC witness              (see the trust boundary - it would buy nothing
                                    against the threat AA actually defends)
```

## Honest limitations

* **The trust boundary is in-process.** A module that imports
  `promotion_terminal_admission.ts` can mint a capability, and nothing prevents
  it. AA defends the *protocol* - generic append, plugin writers, accidental
  alternate ingestion - not same-process malicious code. Stated in
  `PROMOTION-TERMINAL-ADMISSION.md` §3 and §48 of the spec.
* **Provenance is written by the governed manager, not injected by admission.** A
  caller inside the trust boundary that hand-builds a terminal payload can omit
  it. `outcome_basis` is therefore an audit aid, never a proof.
* **Two terminal bases are unreachable today** (`deterministic_failure`,
  `authority_revoked_before_dispatch`): the engine contract turns a provider error
  into uncertainty and always allows authorization, so those `#appendFailed`
  branches are defence in depth (`CF-AA-01`).
* **The structural rule requires a PREPARED.** That is compatible with all
  canonical history and all fixtures (none contains a terminal without one), but
  it does mean a hypothetical pre-Z log with an orphan terminal would not replay.
  No such log exists in this repository.
