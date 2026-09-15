# G10-U — CF-T Carry-Forward Disposition

Input: `docs/engineering/audits/G10-T-CARRY-FORWARD.md` (CF-T-01 … CF-T-08).
Verdicts: `CLOSED_IN_U` · `RESCOPED_IN_U` · `STILL_DEFERRED_WITH_TRIGGER`.

| ID | Disposition | Reasoning |
| --- | --- | --- |
| CF-T-01 — no Proof Vault web vertical | **CLOSED_IN_U** | A new Proof Vault surface (Sources / Proof Assets / Disclosure) is driven only through the typed application/HTTP surface, with a browser E2E. |
| CF-T-02 — real DSH extraction cannot attach proof evidence ids | **CLOSED_IN_U** | `EvidenceBoundReasoningContext` carries an evidence allowlist + selected content into the frozen brief; the tool/HTTP now accept `externalEvidenceRefs`; candidate refs are structurally constrained to the allowlist; a real DSH extraction E2E proves exact ids. |
| CF-T-03 — disclosure exports whole source bytes | **CLOSED_IN_U** | The bundle manifest gains per-evidence `selector` + `materializationKind` + excerpt digest; the exporter materializes `TEXT_EXCERPT` / `JSON_VALUE` / `ORIGINAL_SOURCE`; a selector failure BLOCKS rather than falling back; byte-level minimization is proven. |
| CF-T-04 — local-only disclosure | INTENTIONALLY_DEFERRED | Cross-app/federation disclosure is G10-V scope. |
| CF-T-05 — deterministic verification only | STILL_DEFERRED_WITH_TRIGGER | Independent verifier provider is future work. |
| CF-T-06 — no blob erasure | STILL_DEFERRED_WITH_TRIGGER | Erasure workflow (showing dependents first) is future work. |
| CF-T-07 — no person identity ontology | STILL_DEFERRED_WITH_TRIGGER | Unchanged by design. |
| CF-T-08 — explicit local-file import only | RESCOPED_IN_U | U adds a bounded browser import path (explicit confirmation, size limit) but still no filesystem crawler or external connector. |

```text
No BLOCKER_IN_U. CF-T-01, CF-T-02 and CF-T-03 closed by the local Proof Vault product closure.
```
