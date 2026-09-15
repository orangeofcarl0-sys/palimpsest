# G10-V — Project Workspace & Graduated Project Management (Campaign)

| Step | Deliverable |
| --- | --- |
| V0 | Project-as-asset / autonomy assessment → `audits/G10-V-PROJECT-ASSET-AUTONOMY-ASSESSMENT.md`, `audits/G10-V-PRODUCT-SCOPE-AUDIT.md`, `PROJECT-AS-ASSET-ARCHITECTURE.md`, `MANAGEMENT-AUTONOMY-MODEL.md`, `PERSONAL-ASSET-SYSTEM-BOUNDARY.md` |
| V1 | `ProjectAssetAssociation` + `ProjectJournal` append-only stores (`src/project_workspace/{association,journal}.ts`) |
| V2 | Derived, read-only `ProjectWorkspaceView` + `makeProjectWorkspaceService` (`src/project_workspace/{view,service}.ts`) |
| V3 | Management profile (`DIRECT/ASSIST/MANAGE/DELEGATE`) + operator preference store (`src/project_management/profile.ts`) |
| V4 | Deterministic policy matrix + evaluator (`policy.ts`) and derived action candidates (`actions.ts`) |
| V5 | Bounded management service + untrusted host adapter (`service.ts`, `host_adapter.ts`) |
| V6 | Product wiring: `installPalimpsest` options, application surface, HTTP routes, tools, deployment profile, CLI `manage` |
| V7 | Web Project Workspace (`web/src/project_workspace/**`, default landing; Proof Vault demoted to a project-asset capability) |
| V8 | Browser E2E over the real product stack (`e2e/project-workspace.spec.ts`) |
| V9 | Unit suites (`test/v_project_workspace`, `test/v_management_autonomy`, `test/v_adversarial`) |
| V10 | Management dogfood: one principal × four involvements + real DSH host (`scripts/management/dogfood.mjs`) |
| V11 | Docs / carry-forward (`G10-V-PROJECT-WORKSPACE-SPEC.md`, this campaign, delivery, dogfood evidence, carry-forward) |

## Truth ownership (unchanged)

The two new stores own only semantics with no prior owner: association links and journal entries.
`ProjectIr` stays the owner of goal/requirements/decisions/tasks; Work stays the owner of
tasks/attempts/evidence/promotions; proof/reasoning/memory/campaign planes stay the owners of their
truths and are read through injected read-only ports. There is no second copy of any canonical fact
and no `ProjectAssetStore`. The management service owns no store and no authority.

## Red lines held

`View ≠ Truth`; `Associated ≠ Owned`; `OpenLoop ≠ WorkTask`; `Opportunity ≠ Task`; promotion and
decision appends are explicit and go through existing ProjectIR validation and revision lineage;
`Mode ≠ Authority`; the four authority-shaped classes are unreachable by mode alone; mode changes
are operator-only; a downgrade is immediate; the work mode is orthogonal to the management
involvement; there is no autonomy score and no `ManagerAgent`; the external Personal Asset System
boundary is described, not implemented (no auto-index, no `ExternalAssetLibraryPort` in `src/**`).

## Evidence

- Unit: `test/v_project_workspace.test.ts` (12), `test/v_management_autonomy.test.ts` (15),
  `test/v_adversarial.test.ts` (10).
- Browser: `e2e/project-workspace.spec.ts` (2) over the real `/api/project/*` + `/api/manage/*`
  routes.
- Dogfood: `scripts/management/dogfood.mjs` → `.dogfood/g10v-management-dogfood.json`.
