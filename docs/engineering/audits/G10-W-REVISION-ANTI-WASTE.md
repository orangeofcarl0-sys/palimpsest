# G10-W — Revision Anti-Waste

Baseline: `main @ ea77783d864ccb660d14c9e13c6008a9241e7715`.

The revision work must not become a second system. Every claim below is machine-checked by
`test/w_adversarial.test.ts` ("G10-W source firewall") over the whole `src/**` tree, not by
inspection.

| Anti-waste rule | Status | Evidence |
| --- | --- | --- |
| No second scheduler | PASS | exactly one `new Scheduler(` in `src/**`, in `src/tools/controller.ts`; the reconciliation never decides scheduling |
| No second EventStore / ProjectIR truth | PASS | exactly one `new CoreProjector(` in `src/**`, in `src/state/event_store.ts`; the ProjectIR lives in the `projects` projection and is rebuilt only by replay |
| No second task store | PASS | task state/envelopes are read and written only through the `tasks` projection; the reconciliation takes a plain read-only snapshot (`ReconcileTaskRow[]`) and owns no storage |
| No shadow envelope cache | PASS | `envelope_json` appears only in `state/projector.ts` (write), `state/migrations(+ sql)` (shape), `tools/controller.ts` / `domain/aggregate.ts` / `scheduler/scheduler.ts` (read) — no third module and no in-memory map re-owns envelopes |
| No hidden projection repair | PASS (one documented exception) | the batch is the only structural write. The single repair outside it is `#staleEvidenceForScope`, which is explicit, documented, and fail-open on evidence authority only (never on task authority). It emits no event and cannot join the transaction. |
| Projector imports no policy | PASS | `src/state/projector.ts` contains no `TaskPolicy` / `domain/policy` reference; envelopes are projected as bytes |
| Envelope minting stays with the trusted policy | PASS | `compilePlanRevision` has no clock, no DB handle and no write; the only envelope source is the injected `TaskPolicy.authorize(...)` |
| Service layer owns no second truth | PASS | `src/project_workspace/service.ts` keeps `ProjectController`, `.appendAtomic(`, `controller.plan(`, and contains no `UPDATE tasks`, no `envelope_json`, no `new Scheduler(` |
| No legacy path kept "just in case" | PASS | `#planLegacy` and `#applyTypedInvalidation` deleted; `plan()` is a one-line delegation to `planReconciled`; the source scan asserts neither `planLegacy` nor a fallback branch exists |
| No wire-contract churn for the fix | PASS | no new event type, no payload change, no migration; `TASK_REAUTHORIZED` and `PROJECT_REVISED` already existed |

## Deliberate non-additions

- **No `settleAll` / force flag.** Quiescence is only waived for the exact tasks an explicit typed
  invalidation stales inside the batch; there is no "just do it" escape hatch.
- **No same-id lineage heuristic.** Guessing that a changed task *is* the successor of the old one
  would silently move authority between identities; v1 refuses and requires a new id.
- **No caching of the reconciliation result.** `planReconciled` recompiles from the projections on
  every call; the compiled proposal is never memoized or persisted.
- **No second evidence store.** Evidence staleness reuses the existing `evidence.status` column.
