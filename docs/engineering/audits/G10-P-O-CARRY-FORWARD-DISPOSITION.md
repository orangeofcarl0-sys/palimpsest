# G10-P — CF-O Carry-Forward Disposition

Input: `docs/engineering/audits/G10-O-CARRY-FORWARD.md` (CF-O-01 … CF-O-10).
Verdict vocabulary: `CLOSED_IN_P` · `REQUIRED_FOR_P_WITH_PROOF` · `STILL_DEFERRED_WITH_TRIGGER` · `OBSOLETE`.

The default expectations in spec §10 were re-checked against the P0 audit
(`G10-P-LIVE-FEDERATION-ASSESSMENT.md`), not applied mechanically.

| ID | Disposition | Where / why |
| --- | --- | --- |
| CF-O-01 — collaboration graph omits commitments | **CLOSED_IN_P** | A read-only commitment enumeration is added (`CommitmentService.listCommitments`, surfaced through `FederationService.commitments`, the application `federation.commitments` route/tool, and the collaboration projection's commitment nodes/edges). Proof: P9 enumeration + restart-reconstruction tests. |
| CF-O-02 — CLI `serve` is Work-only | **CLOSED_IN_P** | A typed deployment profile plus `palimpsest serve --profile <path>` builds the full stack through `installPalimpsest` and serves the advanced application (P3). Proof: profile launch test asserting `/api/application/surfaces`, federation and boundary routes, and the collaboration projection. |
| CF-O-03 — layout/positions ephemeral | STILL_DEFERRED_WITH_TRIGGER | Presentation-only; not on the live-collaboration path. Trigger unchanged: a user needing stable saved layouts. |
| CF-O-04 — inspector depth | STILL_DEFERRED_WITH_TRIGGER | The MultiGraph inspector already renders canonical ref/kind/state; deeper per-species panels remain presentation work. Trigger: deeper debug workflows. |
| CF-O-05 — boundary/campaign/institution inspectors minimal | STILL_DEFERRED_WITH_TRIGGER | Boundary/membership stay reachable via tools/routes; a full operational console is presentation work. Trigger: an operational boundary/membership console. |
| CF-O-06 — no WebSocket/SSE push | **CLOSED_IN_P (machine attention) / STILL_DEFERRED_WITH_TRIGGER (browser push)** | Machine/agent attention now observes durable change through Ordarium `StateChangeFeed` + the attention policy (P4/P6) — no WebSocket/SSE is required for that. The browser debugger remains poll-based; its live push stays deferred with the unchanged trigger "live multi-client UI sync". |
| CF-O-07 — multi-tenant local identity | STILL_DEFERRED_WITH_TRIGGER | One process still carries one configured local peer; a per-request actor is never accepted. Trigger: a host serving several sovereign local peers. |
| CF-O-08 — campaign read-only / org-evolution mutation surfaces | STILL_DEFERRED_WITH_TRIGGER | Unchanged from O. Trigger: a governed organization-evolution console. |
| CF-O-09 — reasoning branch execution host-side (CF-N-03) | STILL_DEFERRED_WITH_TRIGGER | G10-P's host adapter is an **attention/activation** seam, not a branch runner. Trigger: a standard host branch-runner seam. |
| CF-O-10 — projection digest is a read-model digest only | STILL_DEFERRED_WITH_TRIGGER | Still true by design (no new semantic identity, no cross-session cache). Trigger: projection caching/ETag support. |

## New carry-forward opened by P

Recorded in `G10-P-CARRY-FORWARD.md`; the load-bearing one is the **ledger epoch limitation**
(§18): v1.3.1 binds no ledger UUID to a `StateChangeFeed` cursor, so pointing a consumer at a different
ledger file must fail closed (future cursor) or require an explicit operator reset. G10-P does not pretend
to solve it.

```text
No BLOCKER_IN_P. CF-O-01 and CF-O-02 closed; CF-O-06 closed for machine attention only.
```
