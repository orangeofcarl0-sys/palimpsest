# G10-AB — Carry-Forward

No `BLOCKER_IN_AB`. `CF-V-02` and `CF-V-03` are **CLOSED_IN_AB**. The items below
are surfaced or re-confirmed by the AB work and do not block the delivered claims.

| ID | Kind | Finding | Concrete trigger |
| --- | --- | --- | --- |
| CF-V-02 | product/audit | **CLOSED_IN_AB.** Durable, append-only, non-authoritative management activity with candidate/profile/basis/decision/confirmation/canonical-refs and a chained digest. | Closed; keep the AB suites and the crash dogfood as the regression guard. |
| CF-V-03 | product | **CLOSED_IN_AB.** The Work Mode is a persisted, capability-gated, non-authoritative preference orthogonal to management involvement, rendered by the Project Workspace. | Closed; keep the multi-session dogfood as the guard. |
| CF-AB-01 | scale | **NEW.** v1 keeps every activity record. There is no pagination or retention policy, and `activity()` returns everything unless a limit is given. | A project whose activity volume makes a full read expensive, or an operator asking for a retention window. |
| CF-AB-02 | security/boundary | **NEW (documented, not defended).** The per-project chain (sequence + previous digest + recomputed content digest) detects a rewritten body, a sequence gap or a broken pointer under normal application assumptions. It is NOT security against a hostile database administrator, and is not marketed as such. | A multi-tenant or tamper-hostile deployment where the activity log must be tamper-EVIDENT against the operator's own environment. |
| CF-AB-03 | coverage | **NEW.** `ADVANCE_MECHANICAL_WORK` (a composite of scheduler steps, no single canonical event) and `RUN_LOCAL_VERIFY` (the port returns no ref) legitimately record no `canonicalOutcomeRefs`; they record a TYPED summary instead. A reader must not treat an empty ref list as "nothing happened" - the decision and reason are still there. | A UI or audit tool that infers mutation from an empty ref list, or a verify port that starts exposing canonical refs. |
| CF-AB-04 | operability | **NEW.** The Work Mode preference and the activity log are deployment-local files, like the management profile. Moving a project between installations does not carry its posture. | Management preference portability, or multi-machine operation of one project. |
| CF-AB-05 | product/route | **NEW.** The HTTP surface exposes the Work Mode REQUEST but not the operator mutation (CLI-only, by the "HTTP auth ≠ operator semantic authority" rule). An operator who only has the web UI cannot change the project default. | A hosted or UI-only operator topology, which would need a real operator-authority channel rather than reusing request auth. |
| CF-W-06 | semantics | **REASSESSED_IN_AB, STILL_DEFERRED_WITH_TRIGGER.** `AB0` proved no supported public protocol can produce a `READY` task with an unsatisfied dependency, so `READY` is transition-maintained and the dependency re-check is defence in depth. | An operator expecting a revision/head sync to recompute retained-task states. |
| CF-X-01 | capability | **STILL_DEFERRED_WITH_TRIGGER.** Real cross-revision/parallel promotion remains unsupported and unfaked. | A topology/product need for two concurrent tasks to promote independently from the same base. |
| CF-AA-01 | coverage | **STILL_DEFERRED_WITH_TRIGGER.** The deterministic-failure and authority-revoked outcome bases remain unreachable through the engine contract; AB deliberately did not synthesize a cancel/deny to reach them. | An actual host denial, a supported cancel, or an engine emitting a deterministic non-uncertain failure. |
| CF-AA-02 | security/boundary | **STILL_DEFERRED_WITH_TRIGGER.** The AA trust boundary is unchanged: a module importing the admission module can still mint capabilities. | An untrusted-plugin or multi-tenant same-process topology. |
| CF-X-02 | product/route | **PARTIALLY_ADDRESSED_IN_AB.** The operating posture and the activity history are rendered; `project.head` still is not. | A UI change that wants to show project-head state and promotion provenance. |
| CF-W-05, CF-X-03, CF-X-04, CF-Z-01, CF-Z-03, CF-Z-04, CF-AA-04, CF-AA-05, CF-W-04, CF-W-07 | various | **STILL_DEFERRED_WITH_TRIGGER**, all unchanged and untouched by AB. | Unchanged from the AA disposition. |

## Recommended next stage (assessment only)

Ranked by authority/integrity risk, then state consistency, operational
capability, product polish, ecosystem:

1. **CF-AA-02** — still the only item bounding the strength of the AA guarantee,
   and it becomes real the moment plugins or multi-tenancy are in scope.
2. **CF-AA-01** — a reachable deterministic-failure basis; it is the last
   unfinished half of the AA failure semantics and matters as soon as a host
   denial or cancel path can reach the promotion protocol.
3. **CF-W-06** — retained-task dependency-state reconciliation. `AB0` proved it is
   not currently reachable; it becomes load-bearing together with CF-X-01 when
   concurrency allows more than one in-flight authorization per base.
4. **CF-AB-05 / CF-AB-04** — operator authority and posture portability, which are
   the two product gaps AB knowingly left (CLI-only mutation, deployment-local
   state). They matter for a hosted or multi-machine operator.
5. Everything else is scale, coverage and product surface, in that order.

Explicitly **not** privileged: the External Asset Library Bridge. The strategic
question the spec poses - more autonomous over time, more epistemically
independent, or more connected to external reusable knowledge - should be answered
from a real product need, and AB produced no evidence for any of the three.
