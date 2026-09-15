# G10-V — CF-U Carry-Forward Disposition

Input: `docs/engineering/audits/G10-U-CARRY-FORWARD.md` (CF-U-01 … CF-U-07).
Verdicts: `CLOSED_IN_V` · `RESCOPED_IN_V` · `STILL_DEFERRED_WITH_TRIGGER`.

| ID | Disposition | Reasoning |
| --- | --- | --- |
| CF-U-01 — no evidence enumeration route | **CLOSED_IN_V** | The Project Workspace aggregates proof assets through the explicit project↔asset association, so a project sees exactly its associated evidence/claims without a global enumeration route. |
| CF-U-02 — no model/provider metadata route | STILL_DEFERRED_WITH_TRIGGER | Unchanged; the UI keeps rendering "unknown" rather than inventing a provider. |
| CF-U-03 — freshness policy not settable via the application surface | STILL_DEFERRED_WITH_TRIGGER | V does not touch the proof publication path; the limit is documented. |
| CF-U-04 — base64 bounded browser import | STILL_DEFERRED_WITH_TRIGGER | Streaming/multipart import is future work. |
| CF-U-05 — injected (not model-forced) off-allowlist negative | STILL_DEFERRED_WITH_TRIGGER | A deterministic adversarial model harness is future work. |
| CF-U-06 — excerpts are exports, not revisions | STILL_DEFERRED_WITH_TRIGGER | By design. |
| CF-U-07 — T/U deferred scope | STILL_DEFERRED_WITH_TRIGGER | CF-T-04/05/06/07/08 unchanged; **no remote Proof federation is pulled into V**. |

```text
No BLOCKER_IN_V. Proof-specific carry-forward does not block V.
```
