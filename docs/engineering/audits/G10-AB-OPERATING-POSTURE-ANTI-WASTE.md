# G10-AB — Operating-posture anti-waste audit

| Claim | Evidence |
| --- | --- |
| **No RecipeStore** | `src/recipes/**` contains no `CREATE TABLE`, no `DatabaseSync` and no `store.ts` (`AB-N01`). The Work Mode preference stores only the SEMANTIC mode; the recipe is resolved from the current registry at execution time. |
| **No authority plane** | `AB-N02` scans every file under `src/project_operating/` (comments stripped) for `PalimpsestEffectsRuntime`, `grantAuthority`, `EffectAuthority`, `/federation/`, `proof_asset`, `ManagerAgent`, `HistoryStore`, `RecipeStore`, `crossRevisionCompat` and finds none. `AB-N28` additionally asserts the plane never touches `PROMOTION_*` or the AA admission module. |
| **No universal HistoryStore** | Exactly ONE table is created in `activity_store.ts` (`management_activity`); the operating history is a DERIVED view (`buildProjectOperatingHistory`) that interleaves references to owners. |
| **No ManagerAgent** | No agent type is introduced; the management layer still has no promotion action class, and `FORBIDDEN_AGENTS` remains enforced by the existing V firewall. |
| **No duplicate ProjectIR/Work truth** | The activity record REFERENCES canonical owners (`work_event:<id>`, `project_revision:<n>`, `head_reconciliation:<n>`, `reasoning_cell:<id>`) and copies no body (`AB-N13`/`AB-N14` assert no `project_ir`, `task_envelope`, `event_digest`, `requirements` or `decisions` appear in a record). The ProjectIR module is untouched. |
| **No CoT store** | `AB-N19` scans a real record for chain-of-thought/scratchpad/prompt markers; the record type has no such field. |
| **No external-asset scope** | `AB-N30` scans the plane for `PersonalAsset`, `ExternalAssetLibrary`, `globalAsset`, `autoIndex`. |
| **No second management-mode truth** | The involvement value and its append-only history stay in `SqliteManagementPreferenceStore`; AB only added an optional `history?` read on the port. An operator change additionally writes ONE activity entry so the activity log is a complete answer to "what happened", which is a reference-style audit row, not a second mode value. |
| **No work-mode-driven escalation** | The preference is a stable partition ON TOP of the existing execution-priority order (`AB-N27`, `AB-N12`): it cannot add, remove or make eligible any candidate. |

## Cost added at runtime

* Two `CREATE TABLE IF NOT EXISTS` statements on a deployment-local SQLite file
  (its own file, `project_operating.sqlite`, shared by the preference and activity
  tables with separate logical ownership).
* Per `step()`: one SELECTED insert and one terminal insert (two small rows).
* Per posture read: one preference read, one history read, one registry lookup per
  mode, one management profile + history read.
* No external call, no new network surface, no background job, no timer.

## Deliberately NOT built

```text
a RecipeStore                     a universal Project HistoryStore
an autonomy score                 a ManagerAgent
a Work Mode driven scheduler       a Monitor condition poller
a second management-mode table     an External Asset Library bridge
a CoT or scratchpad store
```

## Honest limitations

* **The activity chain is local tamper-evidence, not security.** It detects a
  rewritten body, a sequence gap or a broken pointer under normal application
  assumptions; it does not defend against a hostile database administrator.
* **Retention is unbounded in v1.** Every record is kept; pagination/retention is
  carried forward as an explicit trigger rather than being invented now.
* **The verify port exposes no canonical ref**, so a `RUN_LOCAL_VERIFY` activity
  record has none. No ref is fabricated for it.
* **`ADVANCE_MECHANICAL_WORK` names no single canonical event** (it is a composite
  of scheduler steps); it records a TYPED summary instead of a ref.
* **The preference is not portable.** It lives in a deployment-local file like the
  management profile; portability between installations is a carried-forward
  trigger, not a delivered capability.
