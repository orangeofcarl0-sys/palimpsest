# G10-Q — CF-P Carry-Forward Disposition

Input: `docs/engineering/audits/G10-P-CARRY-FORWARD.md` (CF-P-01 … CF-P-10),
`G10-P-LIVE-FEDERATION-DELIVERY.md`, `G10-P-DOGFOOD-EVIDENCE.md`.
Verdict vocabulary: `CLOSED_IN_Q` · `REQUIRED_FOR_Q_WITH_PROOF` · `STILL_DEFERRED_WITH_TRIGGER`.

| ID | Disposition | Reasoning / where |
| --- | --- | --- |
| CF-P-01 — no ledger epoch binding to a transport cursor | STILL_DEFERRED_WITH_TRIGGER | Q does not forge a ledger UUID in Palimpsest (§50). The fail-closed (`transport_epoch_mismatch`) + explicit operator `clear()` semantics are retained. Trigger: a formal Ordarium ledger epoch primitive. |
| CF-P-02 — durable boundary transport submission-only | REQUIRED_FOR_Q_WITH_PROOF (resolved without a new protocol) | The cognitive dogfood does not need a remote synchronous boundary read: a principal observes canonical boundary state through its own product tools/HTTP surface after the home applies a mutation (§51 allows submit-then-observe). If a chosen host ever requires remote synchronous reads, this becomes a blocker and an honest correlated-reply protocol must be built — not a fake response. |
| CF-P-03 — pump checkpoints per single change (`limit: 1`) | STILL_DEFERRED_WITH_TRIGGER | Correctness-first; unchanged. Trigger: Ordarium per-record feed positions. |
| CF-P-04 — poisoned envelope blocks its mailbox | STILL_DEFERRED_WITH_TRIGGER | No quarantine implemented; not expected on the golden path. If a poisoned envelope appears in the real host dogfood, an operator diagnostic is required (§52). |
| CF-P-05 — attention delivered-set is in-memory (restart may re-signal) | CLOSED_IN_Q (behavior proven) | Q verifies that duplicate attention does **not** duplicate the semantic decision: a second agent turn re-reads canonical state and the semantic services reject/ignore the already-applied fact (§53). No correctness bug; there is no durable delivered-set requirement. |
| CF-P-06 — escalation requires an explicit policy | STILL_DEFERRED_WITH_TRIGGER | Default `requiresUserAttention=false` retained. If the dogfood hits irreconcilable disagreement / missing authority / a value decision, an **explicit static** escalation policy may be supplied; learned escalation is forbidden (§54). |
| CF-P-07 — CF-O leftovers (03/04/05/07/08/09/10 browser push) | STILL_DEFERRED_WITH_TRIGGER | Unchanged from G10-P. |
| CF-P-08 — dogfood was one OS process | CLOSED_IN_Q (if the real run used two OS processes) | Re-adjudicated here: the chosen host (DSH) runs each principal as its own OS process, so the Q golden dogfood requires two separate processes (§42). If the environment forces one process, Q cannot claim real host cognitive federation and must report PARTIAL with an isolation caveat. |
| CF-P-09 — transport authentication is an adapter assertion | STILL_DEFERRED_WITH_TRIGGER | Wording retained: "authenticated as asserted by the adapter". A real host dogfood is not cryptographic identity; README must not claim "secure peer identity" (§55). Trigger: PKI. |
| CF-P-10 — static peer discovery only | STILL_DEFERRED_WITH_TRIGGER | The deployment profile lists known peers; absent ⇒ directory is honestly UNKNOWN. Trigger: a real peer registry. |

## Q-specific carry-forward opened

Recorded in `G10-Q-CARRY-FORWARD.md` (host-bundle distribution, session-id discovery, DSH headless
resume CLI gap, cognitive-run cost controls, etc.).
