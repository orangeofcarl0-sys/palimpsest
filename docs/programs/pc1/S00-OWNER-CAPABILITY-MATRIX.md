# S00 — Owner and capability map

The map follows `installPalimpsest` → composition clusters → adapters/DSH tools → owners. "Composed" means the install actually constructs the capability under some configuration; it does not mean a model can reach it or that its product value has been shown.

Status vocabulary (five layers, deliberately separate):

- **I** implemented (source exists with tests)
- **C** composed into the install (condition stated)
- **M** model-reachable through a registered DSH tool in the default/qualified deployment
- **X** exercised by a real run or a recorded deterministic end-to-end
- **V** product value established by evidence (none at S00)

## 1. Work, Result, Evidence, Promotion

| Capability | Owner (source) | I | C | M | X | Notes |
|---|---|---|---|---|---|---|
| Work plan / task graph | `src/tools/controller.ts`, `src/work/`, `src/scheduler/` | yes | always | `palimpsest_start/plan/next/run/claim/report/status` | C6-R P1 + suite | Quiescence and revision CAS present |
| Attempt placement (in-place / world) | controller claim, `src/deployment/execution_world.ts` | yes | when `repository` set | via Work tools | P1 (world) | World owns mutable Git state |
| Result observation | controller `observeAttemptResult` | yes | always | via report/finish | P1 | Full OID observed; caller claim overwritten |
| Result export to canonical ODB | `ExecutionWorldPort.exportResultCommit` | yes | when repository set | **not on the legacy report path** | delegated settlement only | **S01 defect**: report records an OID the canonical ODB may not read |
| ATTEMPT_REPORT | `src/schema`, projector | yes | always | via report/finish | P1 | Event 37 in C6-R held the full OID |
| Promotion prepare/commit | `src/effects/promotion.ts` (`PromotionManager`) | yes | always | **no** — operator/controller only | C6-R operator | Uncertain recovery is the S01 target |
| Promotion recovery | `PromotionManager.reconcileAll` | yes | always | no | C6-R operator (blocked) | Drives Ordarium reconcile; must not fake success |
| Evidence atoms | `src/tools/work_evidence.ts` | yes | always | via gate/finish | P1 + suite | **S01 defect**: gate accepts structural predicates from the caller |
| Gate evaluation | `src/domain/gate_*`, `src/tools/gate_runner.ts` | yes | always | `palimpsest_gate` | P1 | PASS means declared evidence present, not world truth |
| ProjectIR revision | controller, projector | yes | always | `palimpsest_plan`, `palimpsest_project decision` | P1 (revision 3) | Decision append ≠ authority grant |

## 2. Project cognition and continuity

| Capability | Owner | I | C | M | X | Notes |
|---|---|---|---|---|---|---|
| Project workspace view | `src/project_workspace/` | yes | when `projectWorkspace` composed (workspace store or derived) | `palimpsest_project overview/assets/history` | P1 overview | Derived projection; no second truth |
| Journal | `src/project_workspace/journal.ts` | yes | when journal store supplied | `palimpsest_project journal/journal_entries` | P1 wrote 4 entries | Full digest per entry |
| Open loops | workspace | yes | with workspace | `palimpsest_project open_loops` | not yet measured with a fresh agent | S03 target |
| Context capsule / summary / explain | **no first-party continuity facade** | partial (workspace/history) | n/a | no dedicated action | no | **S03 to implement** as a derived facade with standing + basis |
| Fresh-session inheritance | DSH session + durable stores | infrastructure only | n/a | no dedicated resume package | C6-R used a fresh env but not a product resume package | S03 target |
| Trajectory | `src/trajectory/`, `src/composition/trajectory*.ts` | yes | optional | expert only | tests | Not a planner/memory owner |

## 3. Authorization, proposal, collaboration

| Capability | Owner | I | C | M | X | Notes |
|---|---|---|---|---|---|---|
| Project Intent proposal | `src/project_intent/` | yes | when workspace/owners exist | no first-party tool | tests | Needs an operator admission adapter (S04) |
| Intent admission | caller-supplied `ProjectIntentAdmissionPort` | interface only | absent by default | no | no | Missing authority must refuse, not self-grant |
| Plan decision | ProjectIR append | yes | always | `palimpsest_project decision` | P1 | Non-authoritative for sources/goals |
| Operator review/approve | scattered (`manage`, verification, external assets) | partial | optional | expert actions | P1 operator used a script | S04 normal review package |
| Source intake | not a first-class product object | no | no | no | no | S04 may compose existing Work/Promotion + exact-bytes verification |
| Local collaboration | `src/interaction/collaboration.ts` | yes | requires recipe layer | `palimpsest_collaborate` | tests, no live | Branch findings are exploratory, not Evidence |
| Async delegation | `src/interaction/delegation.ts` | yes | requires reasoning store + branch host | `palimpsest_delegate` | tests, no live | S05 handoff/receipt lifecycle |
| Cross-project Ask | `src/interaction/cross_project.ts` + federation | yes | requires peer + directory + transport | `palimpsest_cross_project` | tests, no live | Ask ≠ commitment |
| Managed Work worker | `src/deployment/work_worker.ts`, continuation | yes | when configured | `palimpsest_begin/finish` | tests | D2/D3 paths |

## 4. Domain results, runtime, management

| Capability | Owner | I | C | M | X | Notes |
|---|---|---|---|---|---|---|
| Three-level completion | controller state + no domain outcome projection | partial | no | no | no | **S06 to implement** as projection over existing owners |
| Domain verification contract | `src/project_verification/`, completion contracts | yes | optional | expert verification tool | tests | Not a universal truth engine |
| Non-Git external asset | `src/external_assets/` | yes | optional | `palimpsest_external_assets` | tests | Read/prepare verbs; operator verbs live on the application surface |
| Project management | `src/project_management/` | yes | with workspace | `palimpsest_manage` | C6-R used status/reconcile attempts | Mode ≠ authority |
| Runtime/organization/campaign/evolution | many modules | yes | optional stores | expert tools | tests | Not required for the normal path |
| Doctor/install/upgrade | `src/cli.ts` partial | partial | n/a | CLI | C6-R rigs used scripts | **S07/S09 to implement** a real doctor/init/continue/review/recover surface |
| Usage/budget accounting | C6-R `scripts/c6r/*` | yes, outside `src/` | no | no | C6-R | **S07 to promote** a product-level accounting/gate module |
| Isolation policy | WSL2/bwrap rig | C6-R rig | not in product install path | n/a | C6-R qualification | Product must fail fast on unsupported platforms |

## 5. Default-path reading

The normal path today is the legacy Work tool chain (`start → plan → next/run → report → gate → status`) plus the application tools that happen to be composed. This is exactly the S02 problem: overlapping legacy and product spellings are exposed together, the model must discover which route applies, and the structural predicates are caller-selectable.

## 6. README claims that need scope correction (S09)

- "耐久、证据治理、可恢复" — true for the ledger and Work state, but the Result export gap and the uncertain Promotion show recovery is not universal.
- "正常说话即可" — true for the collaboration tool descriptions, not yet true for create/continue/review/accept without scripts.
- The README does not claim OS-level sandboxing, exactly-once external effects, or universal cross-platform support; the final docs must keep that honest and add the measured limits (Windows write-confinement only; Linux/WSL2 qualified by C6-R; live model comparison not yet run under PC1).
