# G10-AC — AB/AA/W/X/Y/Z carry-forward disposition

Every item open after G10-AB is disposed below against the AC work. AC introduces
a new, opt-in plane (the Campaign monitor runtime) and touches no promotion,
Work, Evidence, institution or federation semantics. The disposition is therefore
mostly "unchanged"; the only items AC can influence at all are those that would
have been *reached* by a monitor runtime, and none of them is.

No `BLOCKER_IN_AC`.

## 1. Disposition table

| ID | Kind | Disposition | Reasoning / unchanged trigger |
| --- | --- | --- | --- |
| CF-AB-01 | scale | **STILL_DEFERRED_WITH_TRIGGER** | Unbounded management-activity retention. AC does not read or write the activity log on any automatic path; the monitor driver records no management activity (`AC-N24`). Trigger unchanged: a project whose activity volume makes a full read expensive, or an operator asking for a retention window. |
| CF-AB-02 | security/boundary | **STILL_DEFERRED_WITH_TRIGGER** | The activity chain is local tamper-evidence, not security. AC adds one deployment-local marks table (also tamper-evidence-free), which does not change this boundary. Trigger unchanged: a multi-tenant or tamper-hostile deployment where the log must be tamper-evident against the operator's own environment. |
| CF-AB-03 | coverage | **STILL_DEFERRED_WITH_TRIGGER** | `ADVANCE_MECHANICAL_WORK` / `RUN_LOCAL_VERIFY` legitimately record no canonical ref. Untouched by AC. Trigger unchanged: a UI or audit tool that infers mutation from an empty ref list, or a verify port that starts exposing canonical refs. |
| CF-AB-04 | operability | **STILL_DEFERRED_WITH_TRIGGER** | The Work Mode preference and activity log are deployment-local, so posture is not portable. AC follows the same convention for `monitor_delivery_marks` (its own deployment-local file) but does not solve portability. Trigger unchanged: management-preference portability, or multi-machine operation of one project. |
| CF-AB-05 | product/route | **STILL_DEFERRED_WITH_TRIGGER** | HTTP exposes the Work Mode request, not the operator mutation. AC deliberately mirrors this rule for the monitor: HTTP is read-only (`GET /api/monitor/status`, `GET /api/monitor/preview`, `src/application/http.ts:789-799`) and there is no HTTP force-tick, for exactly the same "HTTP auth ≠ operator semantic authority" reason. Trigger unchanged: a hosted or UI-only operator topology needing a real operator-authority channel. |
| CF-AA-01 | coverage | **STILL_DEFERRED_WITH_TRIGGER** | The deterministic-failure / denied / cancelled / authority-revoked outcome bases remain unreachable through the engine contract. AC adds no engine path and did not synthesize a cancel/deny. Trigger unchanged: an actual host denial, a supported cancel, or an engine emitting a deterministic non-uncertain failure. |
| CF-AA-02 | security/boundary | **STILL_DEFERRED_WITH_TRIGGER** | The AA trust boundary is unchanged: a module importing the admission module can still mint capabilities. AC does not add an out-of-process admission service or capability tokens; the monitor driver cannot admit anything at all (`AC-N08/N09/N10`). Trigger unchanged: an untrusted-plugin or multi-tenant same-process topology. |
| CF-W-06 | semantics | **REASSESSED_IN_AC, STILL_DEFERRED_WITH_TRIGGER** | AC looked for a real public reproduction of a `READY` task with an unsatisfied dependency and found none; G10-AB had already proved no supported public protocol produces one (see `G10-AB-PROJECT-OPERATING-POSTURE-ASSESSMENT.md` §9: `READY` is transition-maintained and the dependency re-check is defence in depth). The monitor runtime does not read or mutate task state. Trigger unchanged: an operator expecting a revision/head sync to recompute retained-task states. |
| CF-X-01 | capability | **STILL_DEFERRED_WITH_TRIGGER** | Real cross-revision/parallel promotion remains unsupported and unfaked; AC does not widen into promotion topology. Trigger unchanged: a topology/product need for two concurrent tasks to promote independently from the same base. |
| CF-X-02 | product/route | **PARTIALLY_ADDRESSED_IN_AB, UNCHANGED_BY_AC** | `project.head` still is not rendered. AC adds a read-only monitor surface but does not render it in `web/**`. Trigger unchanged: a UI change that wants to show project-head state and promotion provenance. |
| CF-X-03 | coverage | **STILL_DEFERRED_WITH_TRIGGER** | Trusted `headAdvance` still has no production caller beyond `reconcileProjectHead`. Untouched by AC. Trigger unchanged. |
| CF-X-04 | coverage | **STILL_DEFERRED_WITH_TRIGGER** | `pump`/`promote` CLI paths still lack CLI-level end-to-end tests. AC adds no CLI command at all (see `CF-AC-01`). Trigger unchanged. |
| CF-W-01 | defect (fixed in W) | **CLOSED_IN_W, held** | `verifyFull`/`rebuildProjections` corruption guard. Unchanged. |
| CF-W-02 | semantics/contract | **CLOSED_IN_X, held** | Canonical head re-anchoring. AC does not touch ProjectIR. |
| CF-W-03 | semantics | **CLOSED_IN_Y, held** | Canonical evidence revocation inside the atomic batch. AC does not touch Evidence. |
| CF-W-04 | coverage | **STILL_DEFERRED_WITH_TRIGGER** | `resume.action = "blocked"` has no dedicated reproduction test. AC adds no revision/resume path. Trigger unchanged. |
| CF-W-05 | product/route | **STILL_DEFERRED_WITH_TRIGGER** | `GET /api/manage/preview` still unconsumed by `web/**`. AC adds `/api/monitor/preview`, also unconsumed by `web/**` (a mirror of the same gap, recorded as `CF-AC-05`). Trigger unchanged: a UI change that wants preview without the step path. |
| CF-W-07 | scale | **STILL_DEFERRED_WITH_TRIGGER** | One revision per promotion still costs O(tasks). AC adds no per-revision work. Trigger unchanged: thousands of tasks with frequent promotions/revisions. |
| CF-Y-01 | semantics/authority | **CLOSED_IN_Z, held** | A retired task's historical result no longer carries promotion authority. AC does not touch promotion. |
| CF-Y-02 | coverage | **CLOSED_IN_Z (superseded), held** | Read-vs-batch atomicity dominated by replay safety. AC's own batch (`recordTriggers`) reads and commits inside one process, same as the Y conclusion. |
| CF-Z-01 | scale | **STILL_DEFERRED_WITH_TRIGGER** | The promotion fence is derived per call. AC does not touch it. Trigger unchanged: a large pending-promotion backlog. |
| CF-Z-02 | coverage/invariant | **CLOSED_IN_AA, held** | Only `PROMOTION_PREPARED` is validated; the AA admission closed the structural gap. AC does not touch promotion. |
| CF-Z-03 | coverage | **STILL_DEFERRED_WITH_TRIGGER** | `input_world_stale` report facet unreachable; asserted as defence in depth. Unchanged. |
| CF-Z-04 | semantics | **STILL_DEFERRED_WITH_TRIGGER** | Recovery alone does not settle Work; the scheduler step must run. AC's activation is explicitly not a Work mutation and does not settle anything (`AC-N07`). Trigger unchanged: a host that calls `reconcileAll()` without a subsequent turn. |

## 2. Why AC moves nothing in this set

The monitor runtime is authority-free by construction. It:

* writes only watch/wake/reconciliation-family Campaign events, never
  `PROJECT_ADMITTED`, `WAIT_ADMITTED`, `NEXT_ACTION_COMPILED`,
  `CAMPAIGN_COMMITMENT_RESOLVED`, `PROOF_PUBLISHED` or `BOUNDARY_DECLARED`
  (`test/ac_monitor_runtime.test.ts:510-543`, `AC-N08/N09/N10`);
* creates no Work event and no management activity (`AC-N07`, `AC-N24`);
* owns no canonical store and mints no Agent identity (`AC-N04`).

So an item that concerns promotion, Work revision, Evidence authority, the
management activity log or the RecipeStore is structurally out of reach of this
stage.

## 3. Newly addressed by AC

| ID | Disposition | Reasoning |
| --- | --- | --- |
| CF-V-03 (Work Mode axis) | **EXTENDED_IN_AC, not closed** | The MONITOR modifier is now backed by a real runtime, so its effective availability no longer reads as a bare declaration: `deriveEffectiveModeStatus` reports `AVAILABLE` with provenance `first_party` when a driver is composed, and `UNAVAILABLE` with an explicit reason otherwise (`src/project_operating/posture.ts:181-204`, `AC-N29`). The `monitor.v1` recipe readiness moves `PREVIEW_ONLY → CONDITIONAL` (`src/recipes/registry.ts:67-87`, `AC-N28`). This is an extension of a closed item, not a new open one. |

New items *surfaced* by AC are recorded in `G10-AC-CARRY-FORWARD.md` as
`CF-AC-01`…`CF-AC-05`.
