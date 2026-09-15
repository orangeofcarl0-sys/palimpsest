# G10-AB — AA carry-forward disposition

Every item from `G10-AA-CARRY-FORWARD.md` is disposed below. `CF-V-02` and
`CF-V-03` are **CLOSED_IN_AB**. Nothing in the AA trust boundary is widened.

| ID | Disposition | Reasoning |
| --- | --- | --- |
| **CF-V-02** | **CLOSED_IN_AB** | Management decisions that are actually selected or executed now leave a durable, append-only, non-authoritative activity record: candidate + digest, action class, subjects, the management profile ref, the Work Mode preference ref, the ProjectIR basis, the decision, the confirmation state, a stable typed reason code, timestamps, canonical outcome refs, and a per-project chained digest. Confirmation and refusal are both durable. Guarded by the AB suites, the crash dogfood, and `AB-N16`/`AB-N17`. |
| **CF-V-03** | **CLOSED_IN_AB** | The Work Mode axis is persisted through `UserWorkModeControlPort` as a strict semantic artifact with an append-only change history, orthogonal to management involvement, and rendered by the Project Workspace. The UI no longer says "not recorded by this installation". Guarded by `AB-N07`/`AB-N21`/`AB-N22` and the multi-session dogfood. |
| **CF-AA-01** | **STILL_DEFERRED_WITH_TRIGGER** | The `deterministic_failure` / `denied` / `cancelled` / `authority_revoked_before_dispatch` bases remain unreachable through the engine contract. AB did **not** invent a synthetic cancel/deny path to make them reachable, as §49 required. **Trigger (unchanged):** an actual host denial, a supported cancel, or an engine that emits a deterministic non-uncertain failure. |
| **CF-AA-02** | **STILL_DEFERRED_WITH_TRIGGER** | The AA trust boundary is unchanged: no out-of-process admission service, no capability tokens, no hostile-code sandbox. **Trigger (unchanged):** an untrusted-plugin or multi-tenant same-process topology. |
| **CF-AA-03** | **CLOSED_IN_AA, held** | The `invalidateTask` fence gap stays closed; AB adds no retirement path. |
| **CF-AA-04** | **STILL_DEFERRED_WITH_TRIGGER** | Terminal provenance remains an audit aid written by the governed manager, not a tamper-evident proof. AB does not touch that plane (`AB-N28`). |
| **CF-AA-05** | **STILL_DEFERRED_WITH_TRIGGER** | The orphan-terminal legacy case still does not exist in this repository. |
| **CF-W-06** | **REASSESSED_IN_AB, STILL_DEFERRED_WITH_TRIGGER** | `AB0` attempted the reachability question the spec asked for and proved **no supported public protocol produces a `READY` task with an unsatisfied dependency** (see `G10-AB-PROJECT-OPERATING-POSTURE-ASSESSMENT.md` §9). `READY` is transition-maintained, and the dependency re-check stands as defence in depth for future concurrency/cross-revision work. AB did not widen into task-state redesign. **Trigger (unchanged):** an operator expecting a revision/head sync to recompute retained-task states. |
| **CF-X-01** | **STILL_DEFERRED_WITH_TRIGGER** | No parallel old-base compatibility in AB. The unsafe effect-first path remains closed. **Trigger (unchanged):** a topology/product need for two concurrent tasks to promote independently from the same base. |
| **CF-W-04** | **STILL_DEFERRED_WITH_TRIGGER** | `resume.action = "blocked"` still has no dedicated reproduction test. |
| **CF-W-05** | **STILL_DEFERRED_WITH_TRIGGER** | `GET /api/manage/preview` is still unconsumed by `web/**`. AB wired the posture/activity reads and kept preview as it was. |
| **CF-W-07** | **STILL_DEFERRED_WITH_TRIGGER** | O(tasks)-per-revision unchanged; AB adds no per-revision work. |
| **CF-X-02** | **PARTIALLY_ADDRESSED_IN_AB** | The Project Workspace now renders the operating posture and the management activity; `web/**` still does not render `ProjectWorkspaceView.project.head`. The remaining part keeps its trigger. |
| **CF-X-03 / CF-X-04** | **STILL_DEFERRED_WITH_TRIGGER** | Trusted `headAdvance` still has no production caller beyond `reconcileProjectHead`; the `pump`/`promote` CLI paths still lack CLI-level end-to-end tests. AB adds a CLI command but no CLI E2E for those paths. |
| **CF-Z-01 / CF-Z-03 / CF-Z-04** | **STILL_DEFERRED_WITH_TRIGGER** | Unchanged by AB: the promotion fence is still derived per call, the `input_world_stale` report facet is still unreachable, and recovery still does not settle Work by itself. |

## New items surfaced by AB

Recorded in `G10-AB-CARRY-FORWARD.md`:

* **CF-AB-01** — unbounded activity retention in v1.
* **CF-AB-02** — the activity chain is local tamper-evidence, not security.
* **CF-AB-03** — two action classes legitimately record no canonical ref.
* **CF-AB-04** — the preference is not portable between installations.
