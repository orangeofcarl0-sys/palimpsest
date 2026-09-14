# G10-S — CF-R Carry-Forward Disposition

Input: `docs/engineering/audits/G10-R-CARRY-FORWARD.md` (CF-R-01 … CF-R-09).
Verdicts: `CLOSED_IN_S` · `RESCOPED_IN_S` · `REQUIRED_FOR_S_WITH_PROOF` · `STILL_DEFERRED_WITH_TRIGGER`.

| ID | Disposition | Reasoning |
| --- | --- | --- |
| CF-R-01 — run-ledger→campaign binding is manual | STILL_DEFERRED_WITH_TRIGGER | The advisor reads persisted evaluations, not live trials. Trigger: a streaming telemetry tap. |
| CF-R-02 — token telemetry via session logs | STILL_DEFERRED_WITH_TRIGGER | Unchanged; advisor consumes stored metric observations. |
| CF-R-03 — single provider/model | **RESCOPED_IN_S** | Not solvable here; it becomes a mandatory `transferabilityWarning` (`LIMITED_EMPIRICAL_BASIS`) on every recommendation. |
| CF-R-04 — validator-limited quality | **RESCOPED_IN_S** | The advisor must surface `INSUFFICIENT_EMPIRICAL_EVIDENCE` for quality where no validator exists (e.g. ReasoningCell) and never fill it with 0. |
| CF-R-05 — no empirical overlay in MultiGraph | STILL_DEFERRED_WITH_TRIGGER | MultiGraph stays the debugger; the advisor is a product surface, not an overlay. |
| CF-R-06 — long-horizon outcomes absent | STILL_DEFERRED_WITH_TRIGGER | MONITOR is `PREVIEW_ONLY`; long-horizon evidence remains future work. |
| CF-R-07 — modest statistical power (n=3) | **RESCOPED_IN_S** | Sample count is a required part of every `EmpiricalSupport` and every recommendation carries the limited-basis warning. |
| CF-R-08 — Q residuals | STILL_DEFERRED_WITH_TRIGGER | CF-Q-01/02/03/05/06/08/10 unchanged. |
| CF-R-09 — storage-level corrections | STILL_DEFERRED_WITH_TRIGGER | Unchanged; no operator correction UI in S. |

```text
No BLOCKER_IN_S. CF-R-03/04/07 rescoped into mandatory advisor transferability/sample disclosures.
```
