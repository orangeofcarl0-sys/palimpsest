# G10-V Project Workspace & Graduated Project Management — Delivery

Baseline: `main @ 2b671d7057ebf7f169d25e980800c873779f6752`. Ordarium v1.3.1. Host: DSH 0.1.5-rc.2.

## Delivered

| Area | Files |
| --- | --- |
| Project workspace read model | `src/project_workspace/{view,service,index}.ts` |
| Association + journal stores | `src/project_workspace/{association,journal}.ts` |
| Management profile + operator store | `src/project_management/profile.ts` |
| Policy matrix + candidates | `src/project_management/{policy,actions}.ts` |
| Management service + host adapter | `src/project_management/{service,host_adapter,index}.ts` |
| Product wiring | `src/install.ts` (additive `projectAssociationStore`/`projectJournalStore`/`managementPreferenceStore`), `src/deployment/{profile,launch}.ts` (`databases.{projectAssociations,projectJournal,management}`) |
| Product surface | `src/application/{surface,http}.ts` (`ProjectWorkspaceApplicationSurface`, `ProjectManagementApplicationSurface`; `/api/project/**`, `/api/manage/{status,step,run,request_mode_change}`), `src/tools/application_tools.ts` (`palimpsest_project`, `palimpsest_manage`) |
| CLI operator control | `src/cli.ts` (`manage <DIRECT|ASSIST|MANAGE|DELEGATE> [--project] [--management]`) |
| Web Project Workspace | `web/src/project_workspace/{ProjectWorkspaceView,parts}.tsx`, `web/src/api.ts` (typed `/api/project/*` + `/api/manage/*` helpers), `web/src/App.tsx` (project is the default landing) |
| Tests | `test/v_project_workspace.test.ts`, `test/v_management_autonomy.test.ts`, `test/v_adversarial.test.ts` |
| E2E | `e2e/project-workspace.spec.ts` |
| Dogfood | `scripts/management/dogfood.mjs` |
| Docs | `G10-V-PROJECT-WORKSPACE-SPEC.md`, `G10-V-PROJECT-MANAGEMENT-CAMPAIGN.md`, `audits/G10-V-PROJECT-WORKSPACE-DELIVERY.md`, `audits/G10-V-MANAGEMENT-DOGFOOD-EVIDENCE.md`, `audits/G10-V-CARRY-FORWARD.md`, updated `README.md`, `docs/engineering/README.md` |

## Golden proofs

- **Project as asset**: the derived view composes from canonical owners with honest
  `knowledgeWarnings`; only the association/journal histories are owned; `appendDecision` and
  `promoteOpportunity` go through the existing `ProjectIr` validation and revision lineage.
- **Two orthogonal axes / four involvements**: the deterministic policy matrix is the only
  interpretation of an involvement; the authority-shaped classes are unreachable by mode alone.
- **One principal**: the G10-V management dogfood drove ONE principal
  (`peer-g10v-project` / `pp-g10v-project`) through all four involvements and booted ONE real DSH
  host principal over a deployment profile wiring the same stores — one `PALIMPSEST_HOST_READY`
  line, one `localPeer`, one `persistentPoint`, all four modes reported by the same process.
- **Downgrade + continuity**: a mid-run operator downgrade stopped proactive work immediately
  (exactly one revision applied); close/reopen reconstructed the workspace project, management
  preference, associations, decisions and open loops identically.

## Local gates

| Gate | Result |
| --- | --- |
| `pnpm run build` | PASS |
| `pnpm exec vitest run` | PASS — **142 files / 1280 tests** (baseline 139 / 1243; +37 = v_project_workspace 12, v_management_autonomy 15, v_adversarial 10) |
| `pnpm run build:web` | PASS |
| `pnpm exec playwright test` | PASS — **27 / 27** (incl. the new Project Workspace spec, 2 tests) |
| `node scripts/management/dogfood.mjs` | PASS — `dshPrincipal: true`, 54/54 assertions |

## Deviations (honest)

1. **No `/api/manage/recommend` or `/api/manage/preview` route.** Recommend re-derives the
   candidate set from `GET /api/manage/status` (the assessment already returns `candidates`);
   Preview calls `POST /api/manage/step` with `confirmed:false` — the SAME deterministic policy
   evaluation a confirmed step would run, stopped at the confirmation boundary. The UI states this
   verbatim (CF-V-01).
2. **No canonical management-action-history route.** "Recent management actions" on the Management
   tab is UI session state only; the surface says so. There is no durable record of past management
   actions (CF-V-02).
3. **The Work-Mode axis is not persisted or recorded anywhere reachable.** FOCUS/EXPLORE/COORDINATE
   (± VERIFY/MONITOR) remain per-task advisor recommendations; the UI renders "not recorded by this
   installation". Only the management involvement is persisted (as a non-authoritative operator
   preference) (CF-V-03).
4. **`historySummary` does not include ProjectIR revision lineage or proof standing changes.** It
   merges only `ASSET_ASSOCIATED` and `JOURNAL_*` records; revision lineage is read from the
   canonical ProjectIR, and proof standing from the proof plane, elsewhere in the view (CF-V-04).
5. **Pre-existing Work-layer defect surfaced by the dogfood (CF-V-05).** A `controller.plan(...)`
   revision after task registration leaves the scheduler's stored task envelope at the OLD revision,
   so the first *activation* after a plan revision fails its revision guard
   (`StateStoreError: expected revision N, current revision M`). Not introduced by G10-V; the
   management *plan*-shaped actions are unaffected, but MANAGE's mechanical `controller.runTurn`
   must run before any plan revision. Reproduced minimally with `start() → plan() → step()`.
6. **`ADVANCE_MECHANICAL_WORK` derivation.** The candidate is derivable only for a READY task with
   a non-terminal attempt. The deterministic dogfood injects that derived-view fact (as the unit
   test does); the executed `controller.runTurn` and its attempt are real (`attemptsRun=1`). The
   refusal scenarios isolate a single open loop (and, for the DELEGATE goal case, narrow the
   operator allowed set) so the refusal is not shadowed by a higher-priority permitted candidate.
7. **External Personal Asset System** remains described (`PERSONAL-ASSET-SYSTEM-BOUNDARY.md`), not
   implemented: there is no `ExternalAssetLibraryPort` type, store, route or tool in `src/**`.

## Required CI (canonical gate)

| Checkpoint | Value |
| --- | --- |
| Implementation PR | _left for the closure commit_ |
| Tested branch HEAD | _left for the closure commit_ |
| PR run | _left for the closure commit_ |
| Merge | _left for the closure commit_ |
| Tree identity | _left for the closure commit_ |
| Canonical main run | _left for the closure commit_ |

The required CI checkpoint is recorded by the G10-V closure commit; this delivery records only the
local gates above. Required checks must be GREEN before merge (read the real exit status /
`gh run view --json conclusion`, never an assumption).
