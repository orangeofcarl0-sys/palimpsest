# G10-AB — Durable Project Operating Posture & Management History

Campaign specification (executed). Baseline:

```text
orangeofcarl0-sys/palimpsest
main @ 9f29547b0eeccc524b0120ef13e9ce55656429ee
```

Closes `CF-V-02` (no durable management-action history) and `CF-V-03` (the Work
Mode axis was not persisted anywhere reachable).

## 1. Why AB now

Not `CF-AA-02` (a documented trust boundary until untrusted plugins or
multi-tenant same-process code is product scope), not a synthetic cancel/deny path
to make `CF-AA-01` reachable, and not an automatic promotion of `CF-W-06`. The real
user-facing gaps left open from G10-V were the two above.

## 2. Project Operating Posture

Two orthogonal axes, never collapsed into one scalar autonomy level:

```text
Work Mode Preference: FOCUS | EXPLORE | COORDINATE (+ VERIFY / MONITOR)
Management Involvement: DIRECT | ASSIST | MANAGE | DELEGATE
```

```text
OperatingPosture ≠ Authority, ≠ RecipePlan, ≠ Execution, ≠ OrganizationDefinition
WorkModePreference ⟂ ManagementInvolvement
```

## 3. Work Mode is a preference

Persist the semantic mode, never a `CompiledRecipePlan`; resolve the recipe through
the current registry at execution time. The preference changes only how eligible
work is ORGANISED - never what may be done.

## 4. Safe defaults

`FOCUS + []` and `DIRECT`, degrading explicitly as `safe_default` when state is
absent, lost, unreadable or malformed. Autonomy is never silently widened.

## 5. Preferred vs effective

A preference is retained when its capability is unavailable, and the effective
status says so: EXPLORE needs reasoning branches, VERIFY needs a genuine
INDEPENDENT verifier (same-model same-context is not verification), COORDINATE
needs a real peer, MONITOR needs a production condition source. Nothing is
invented to satisfy a preference.

## 6. Operator control

`UserWorkModeControlPort { get, set, history }`, with `set` operator-only. An agent
may inspect, and may REQUEST; it can never persist the user-level default.

```text
AgentRecommendation ≠ OperatorPreferenceChange
AdvisorRecommendation ≠ PreferenceMutation
ManagementMode ≠ WorkModeMutationAuthority
```

## 7. Persistence ownership

Deployment-local, project-scoped operator preference, analogous to management
involvement. Not ProjectIR truth, not an OrganizationDefinition, not Work
EventStore truth, not RecipeStore truth. Append-only change history retained
(from/to base mode, from/to modifiers, updatedBy, at).

## 8. Durable Management Activity (closes CF-V-02)

An append-only, non-authoritative record of selected/attempted/executed decisions,
answering: what was chosen, under which profile, which confirmation boundary
applied, what happened, which canonical mutation was observed, and why it stopped
or refused. Crash-honest two-phase recording; an unresolved record is never
rewritten to claim success.

## 9. Activity is not semantic truth

`ManagementActivityRecord ≠ WorkEvent / Task / ProjectDecision / EffectReceipt /
Authority`. Canonical outcomes stay with their owners and are REFERENCED
(`work_event`, `project_revision`, `head_reconciliation`, `recipe_execution`,
`reasoning_cell`), never copied. A missing canonical ref is shown as an incomplete
audit record.

## 10. What is recorded

`step()`, `runBounded()`, `applyOperatorModeChange()`, an operator Work Mode
change. Not the read-only `status()`, `recommend()`, `previewStep()` - that is
telemetry noise. Confirmation and refusal are both durable, so the product can
answer "what was Palimpsest waiting for" and "why did it refuse".

## 11. Application / tools / HTTP

Cohesive extensions on the existing management surface rather than a parallel
silo: `posture()`, `activity()`, `operatingHistory()`, `requestWorkModeChange()`.
Agent tool actions `posture`, `activity`, `request_work_mode_change`. Routes
`GET /api/project/operating-posture`, `GET /api/manage/activity`,
`GET /api/manage/activity/:id`, `GET /api/project/operating-history`,
`POST /api/manage/request_work_mode_change` (a request, never a mutation). The
operator mutation is CLI-only (`palimpsest work-mode`), because HTTP
authentication is not operator semantic authority.

## 12. Web

The Project Workspace no longer says "not recorded by this installation": it shows
the persisted preference, whether it is a stored value or a safe default, the last
change, the effective availability per capability with warnings, and the durable
management activity with unresolved/interrupted records shown honestly.

## 13. Explicitly out of scope

```text
CF-AA-02 (out-of-process admission, capability tokens, hostile-code sandbox)
CF-AA-01 (synthetic cancel/deny to reach the deterministic-failure branch)
CF-W-06 (task-state redesign - no reachable repro, see the assessment §9)
CF-X-01 (parallel old-base compatibility)
Personal Asset System / External Asset Library / cross-project idea graph
```

## 14. Adversarial items

`AB-N01`…`AB-N30`.

## 15. Machine invariants

`OP-A01`…`OP-A32`.

## 16. PASS criterion

> A Palimpsest project durably remembers the user's operating posture across
> sessions. It has a persistent, non-authoritative Work Mode preference
> (`Focus`, `Explore`, or `Coordinate`, with capability-gated `Verify`/`Monitor`)
> that remains strictly orthogonal to the existing Management Involvement
> (`Direct`, `Assist`, `Manage`, `Delegate`). Neither axis grants authority,
> creates peers, starts unavailable capabilities, or stores a permanent
> RecipePlan. Management decisions that are actually selected or executed leave an
> append-only, non-authoritative project activity history recording the candidate,
> policy/profile basis, confirmation/refusal state and references to canonical
> outcomes without copying canonical truth or hidden reasoning. Restart
> reconstructs the same posture and activity history; loss of preference state
> degrades safely to `Focus + Direct`.

## 17. PARTIAL / STOP conditions

PARTIAL if: Work Mode remains session-only; it is stored as a permanent
`CompiledRecipePlan`; an agent can silently rewrite the project Work Mode; it
grants capability/authority; management actions remain UI-only history; the
activity history duplicates Work truth; a crash marks an unresolved action as
success; `FOCUS+DIRECT` loses conventional single-agent behaviour; an unavailable
VERIFY/MONITOR is shown as active.

STOPPED — SEMANTIC REBASE REQUIRED if: Work Mode persistence requires recipes to
become authority; the activity history requires duplicating Work/EventStore truth;
the axes cannot remain orthogonal; the user preference must live in an
`OrganizationDefinition`; durable history requires CoT; canonical main invalidates
the baseline.

None of the PARTIAL or STOP conditions was hit.

## 18. Series invariant

```text
One major stage at a time; close its invariants; carry real leftovers forward.
```

V→AA closed correctness; AB resumes product closure.
