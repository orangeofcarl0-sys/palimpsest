# G10-V Project Asset / Autonomy Assessment (V0)

Baseline: `main @ 2b671d7057ebf7f169d25e980800c873779f6752`. Ordarium v1.3.1. Host: DSH 0.1.5-rc.2.

## Canonical owner matrix (verified)

| Fact | Owner | Project-scoped today? |
| --- | --- | --- |
| goal / requirements / decisions / tasks / revision lineage / head commit | `ProjectIr` (`src/schema/models.ts`) in the Work `EventStore` | yes (`project_id`) |
| tasks / attempts / Work evidence / promotions | Work `EventStore` projections | yes (`project_id` columns) |
| produced artifacts / changed files / result commit | `AttemptReport` (Work `attempts` projection) | yes |
| proof sources / evidence / published claims | `ProofEvidenceStore` | **NO — single global `"proof"` chain** |
| experiments / runs / evaluations | `OrganizationMemoryStore` (per-experiment scope) | **NO project binding** |
| reasoning cell state | `ReasoningCellStore` (per-cell chain) | **NO project binding** |
| campaign hypotheses/beliefs | `CampaignStore` | **linked by `CampaignProjectRef {projectId, revision, digest}`** |
| commitments / peer relations | Coordination/Federation stores | peer-scoped |
| boundaries | `BoundaryMemoryStore` | workspace-scoped |
| organization / runtime structure | Organization / RuntimeScope stores | no project binding |

So proof / experiment / reasoning-cell assets are **global today** and must be *explicitly associated*
with a project — never displayed as "current-project assets" because they exist somewhere globally.

## Decision append gap

`ProjectIr.decisions` is replaced wholesale through `controller.plan({decisions})`; there is no
`appendDecision`/`supersedeDecision` and no decision event type, and the LLM tools (`palimpsest_start` /
`palimpsest_plan`) do not expose `decisions` at all. V adds a high-level **safe** decision action that
composes the next decision list and goes through the existing `controller.plan(...)` / `ProjectIr`
validation (append-only lineage, revision-guarded) — no new decision truth.

## Operator control surface (no LLM tool may escalate)

There is no preferences store; the deployment profile is strict and deliberately rejects
authority-shaped fields. V therefore stores the management involvement as **deployment-local operator
preference** (the `AttentionMarkStore`/`TransportCursorStore` KV idiom), settable only through the
CLI/local operator or a host-injected `UserManagementControlPort` — never through a normal agent tool.
Agent-facing tools may only inspect, request, or suggest a mode.

## V0 decisions

- `ProjectWorkspaceView` is a **derived read model** over existing canonical truths. No
  `ProjectAssetStore`, no copied facts, no second history.
- Two new stores only, both narrowly owning semantics with no current owner:
  `ProjectAssetAssociationStore` (projectId → typed canonical asset ref + kind + provenance; never asset
  content) and `ProjectJournalStore` (append-only project journal limited to `IDEA`,
  `OPEN_QUESTION`, `NEGATIVE_RESULT`, `OPPORTUNITY`, `REFERENCE_NOTE`). The journal may not own PROOF /
  DECISION / TASK / EXPERIMENT / COMMITMENT / BOUNDARY / SOURCE — those are referenced.
- Management involvement (`DIRECT|ASSIST|MANAGE|DELEGATE`) is a user/project preference orthogonal to the
  work mode (`FOCUS|EXPLORE|COORDINATE` + `VERIFY|MONITOR`); effective permission is
  `existing semantic authority ∩ management policy ∩ capability availability`. A management mode can only
  restrict or permit *proactive* behaviour — it never grants authority, and no `ManagerAgent` exists.
- The same persistent project principal serves every mode; Delegate cognition produces only untrusted
  candidates that still pass the management policy and the existing semantic gates.
- README reposition: first-order identity becomes a **durable AI project operating system** (project
  workspace, project assets, graduated management autonomy, Focus/Explore/Coordinate); Proof Vault is a
  project-asset capability, not a top-level identity.
