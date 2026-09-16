# G10-AE-R — Scope-closure anti-waste audit

What this stage deliberately did NOT build, and what it deliberately did not
change. G10-AE-R exists to remove an **accidental** global enumerator from a
project-scoped façade. The cheapest way to get this wrong would have been to
"improve" the situation into a deliberate global surface, a scope-management
feature, or a general store refactor. None of that happened.

## 1. Deliberately NOT built (spec §14)

| Not built | Why | What already covers the real need |
| --- | --- | --- |
| Project switcher | switching projects is a multi-project product, not isolation. A switcher would turn an accidental leak into a designed feature with its own authority questions. | one installation serves one project; a host that needs another project installs another one |
| Global dashboard / cross-project overview | the same reasoning at a larger scale: it needs a product decision about who may see which scope, which this stage does not have. | each installation's own workspace view |
| Cross-project search | searching across scopes requires an authority model that does not exist; adding it here would be the exact over-reach the mission forbids. | per-project reads |
| Cross-project graph | the orchestration graph is already controller-scoped. | `controller.orchestrationGraph()` |
| Shared Journal / shared asset scope | two projects sharing one Journal is a *product* semantics change, not isolation. The stores already support many scopes physically; that is not a licence for a shared semantic scope. | one Journal per project scope, with the fence restored |
| Personal Asset System | the external asset library stays the owner of external assets; G10-AE built a bridge to it and G10-AE-R does not extend it. | `src/external_assets/**` unchanged |
| Workspace administrator role | a privileged cross-project reader is a new authority. Isolation must come from the façade's scope, not from a role that may bypass it. | the fence itself |
| New `all_projects` / `global_assets` / `workspace_scan` tool actions | an agent tool that enumerates scopes is the original defect with a nicer name. | the tool keeps exactly its existing action set |

## 2. Deliberately NOT changed

| Left alone | Why |
| --- | --- |
| `associationStore.projects()` / `journalStore.projects()` | The stores legitimately own multi-scope data and may enumerate it. Removing store capabilities to hide a façade bug would break the ownership model to fix a caller. `Store can enumerate its own data != one ProjectWorkspace façade may enumerate all scopes`. |
| The existing write fences (`assertScopedProject` on `recordJournalEntry`, `resolveJournalEntry`, `associateAsset`, `appendDecision`, `promoteOpportunity`) | They were already correct. `scripts/scope/aer0-repro.mjs` prints the typed refusal on the baseline, before any read is attempted, so rewriting them would be motion without effect. |
| `src/external_assets/**` semantics | G10-AE is PASS and its gate review already closed the publication scope gap (R-03). This stage only MEASURES that the bridge cannot reach a foreign scope from a shared store. |
| `view()`, `openLoops()`, `history()` | Already controller-scoped: they derive from `project.project_id` and from the scoped view. Changing working code to prove a point is waste. |
| The bridge store, the Ordarium ledger, the canonical event store | Not implicated. The defect never touched canonical state; it was a read-model enumeration. |
| Error vocabulary | The stage reuses the existing typed `invalid_registration` fence rather than inventing a parallel scope-error taxonomy, unless a narrow new kind is justified in the fixing commit. |

## 3. Deliberately NOT widened

- **No new contract surface.** The scoping rule is expressed by making three
  functions behave as their names and their façade already promised; no new
  interface member, no new option, no new HTTP route, no new tool action.
- **No store schema change.** Nothing is migrated, no table is added, no index is
  needed. Two projects in one file remain two scopes in one file.
- **No federation change.** `Federation != ProjectWorkspaceScopeBypass`: the stage
  asserts that no existing federation path bypasses the workspace scope rather than
  adding a federated read path.
- **No policy/authority addition.** `ProjectIdParameter != CrossProjectReadAuthority`
  is enforced by removing the parameter's authority, not by gating it behind one.

## 4. The residual cost of doing it narrowly

Recorded honestly rather than hidden:

1. `journal(projectId?)` and `projectScopedAssets(projectId)` keep a parameter that
   can now only ever name the current project. That redundancy is deliberate: the
   spec permits keeping API compatibility (`§6`), the parameter is what callers
   already pass, and deleting it would be a breaking change with no isolation benefit.
   The parameter is documented as a compatibility argument, not an authority.
2. A single-process deployment that genuinely wants to serve several projects must
   run several installations over the same files. That is the supported shape and it
   is what the boundary dogfood exercises — but it does mean this stage does not give
   one process a convenient multi-project view, by design.
3. The asymmetry between store-level enumeration (still available) and façade-level
   reads (now scoped) can look inconsistent to a reader who does not know the rule.
   That is why the rule is stated in one place
   (`PROJECT-WORKSPACE-SCOPE-ISOLATION.md`) and asserted in both directions by the
   adversarial suite (AER-N01/N10).
