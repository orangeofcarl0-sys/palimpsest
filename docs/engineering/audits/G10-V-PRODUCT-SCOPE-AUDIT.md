# G10-V — Product Scope Audit

Audit of what the **G10-V Project-as-Asset + management-autonomy vertical** may
truthfully claim to a product user. It answers the seven §44 scope questions with code
evidence from the shipped implementation.

Verdict vocabulary: **NO** (not claimed / not implemented), **PARTIAL** (a narrower
true statement exists), **YES** (claimed and implemented).

Method: read the shipped modules and their wiring — `src/project_workspace/**`,
`src/project_management/**`, `src/install.ts`, `src/application/{surface,http}.ts`,
`src/tools/application_tools.ts`, `src/cli.ts`, `src/deployment/*` — and exercised the
built product surface (`dist/src`) end to end with an in-memory install:

- `installPalimpsest` with `SqliteProjectAssetAssociationStore(":memory:")`,
  `SqliteProjectJournalStore(":memory:")`, `SqliteManagementPreferenceStore(":memory:")`
  produced `application.projectWorkspace` and `application.projectManagement`;
- `GET /api/application/surfaces` reported `projectWorkspace: true`,
  `projectManagement: true`;
- `GET /api/project/workspace` returned a derived view with honest
  `knowledgeWarnings` for the absent proof/reasoning/memory/campaign planes;
- `POST /api/project/journal` + `GET /api/project/open_loops` produced a
  `JOURNAL_OPPORTUNITY` loop (a prompt, not a task);
- `GET /api/manage/status` returned involvement `DIRECT`; `POST
  /api/manage/request_mode_change {to:"DELEGATE"}` returned `{status:"requested"}`
  (nothing applied); `POST /api/manage/step` returned `needs_confirmation`;
- the management surface had no `setModeUpward` / `grantAuthority` members, and the
  tools registered were `palimpsest_project` and `palimpsest_manage`.

---

## Q1. Does the workspace claim all user knowledge as its own?

**Verdict: NO.**

- The project journal may hold **only** knowledge that has no other canonical owner.
  `PROJECT_JOURNAL_KINDS` is exactly `IDEA`, `OPEN_QUESTION`, `NEGATIVE_RESULT`,
  `OPPORTUNITY`, `REFERENCE_NOTE`
  (`src/project_workspace/journal.ts`). The enum STRUCTURALLY excludes `PROOF` /
  `DECISION` / `TASK` / `EXPERIMENT` / `COMMITMENT` / `BOUNDARY` / `SOURCE`; those can
  only be *referenced* (`relatedRefs`, kind/id only) or *associated*.
- Associations store an opaque `CanonicalAssetRef` and never asset content
  (`src/project_workspace/association.ts`; header:
  `ProjectAssetAssociation ≠ AssetContent`, `Associated ≠ Owned`).
- A journal entry is knowledge, not truth (`Journal ≠ Evidence`, `Opportunity ≠ Task`);
  a `NEGATIVE_RESULT` grants no truth to its negation.

**Correction:** none needed; the structural exclusion is the guardrail.

## Q2. Does Palimpsest auto-index outside the project?

**Verdict: NO.**

- The workspace is built only from explicitly-supplied operands. In `src/install.ts`
  the service is created only when `projectAssociationStore`, `projectJournalStore` or
  a proof store is present; the memory/campaign ports are attached only when those
  stores exist. There is no filesystem traversal anywhere in
  `src/project_workspace/**`.
- An operand that is `undefined` produces a `knowledgeWarnings` entry, never a guessed
  value (`knowledgeWarningsOf` in `src/project_workspace/view.ts`): e.g. "proof plane
  not configured: proof claims cannot be read or associated".
- Globally-existing assets (proof claims, experiments, reasoning cells) are shown only
  after an explicit `ASSET_ASSOCIATED` record, and a claim that is associated but not
  available is warned about, not invented.
- The external Personal Asset System is described but never reached; there is no
  `ExternalAssetLibraryPort` type, store, route or tool in `src/**`
  (`PERSONAL-ASSET-SYSTEM-BOUNDARY.md`).

**Correction:** none needed.

## Q3. Does the workspace duplicate canonical stores?

**Verdict: NO.**

- `buildProjectWorkspaceView` (`src/project_workspace/view.ts`) is pure and returns a
  deep-frozen *re-arrangement* of `ProjectIr` + `controller.status()`/graph + the two
  owned histories + explicitly injected read-only snapshots.
- `makeProjectWorkspaceService` (`src/project_workspace/service.ts`) owns exactly three
  mutation paths: the association store, the journal store, and `controller.plan(...)`.
  It imports no other subsystem's store for mutation and keeps no second history.
- Decisions are appended by composing the NEXT full `decisions` array through the
  existing ProjectIR validation and revision lineage (`appendDecision` /
  `composeNextDecisions`); there is no decision store. Promotion of a journal
  `OPPORTUNITY` also goes through `controller.plan(...)` first, so a failed plan never
  records a false `PROMOTED` resolution.
- The new stores own only semantics with no prior owner: association links and journal
  entries. `ProjectWorkspaceView ≠ CanonicalStore`, `View ≠ Truth`.

**Correction:** none needed.

## Q4. Does the Proof Vault dominate onboarding?

**Verdict: NO.**

- The workspace is independent of the Proof Vault plane: it is enabled by the
  association/journal stores even when `proofEvidenceStore` is absent, and
  `palimpsest_project` / `palimpsest_manage` register on their own
  (`defineApplicationTools`, gated by `application.projectWorkspace` /
  `application.projectManagement`, not by `application.proof`).
- `hasAdvancedSurface` (`src/install.ts`) includes `application.projectWorkspace` and
  `application.projectManagement` alongside `application.proof`; a proof store is
  merely ONE possible source for the workspace, not its entry point.
- Proof is positioned as a **project-asset capability** (a `PROOF_CLAIM` association
  kind), not a top-level product identity (`G10-V-TU-REPOSITION-DISPOSITION.md`; the
  proof plane is an optional port in `PROJECT-AS-ASSET-ARCHITECTURE.md` §2).

**Correction:** product copy must keep Proof Vault described as a project-asset
capability; the workspace/manage surfaces are independently reachable.

## Q5. Does a management mode imply semantic authority?

**Verdict: NO.**

- `evaluateManagementAction` (`src/project_management/policy.ts`) treats existing
  semantic authority as a hard intersection term. For `AUTHORITY_REQUIRED_ACTIONS`
  (`CREATE_EXTERNAL_COMMITMENT`, `APPROVE_DISCLOSURE`, `EVOLVE_ORGANIZATION`,
  `IRREVERSIBLE_EFFECT`) it refuses unless the caller attests
  `hasSemanticAuthority`.
- The management service has **no authority port**: `evaluateCandidate` always passes
  `hasSemanticAuthority: false` (`src/project_management/service.ts`). A mode can never
  grant it and confirmation cannot substitute.
- Non-executable classes fail closed with a stated reason (`refusalReason`):
  commitments/disclosures/evolution/irreversible effects require authority or a
  governance act that lives outside this layer.

**Correction:** none needed.

## Q6. Does `DELEGATE` imply unrestricted autonomy?

**Verdict: NO.**

- `DELEGATE` is still a per-class matrix row (`DEFAULT_ACTION_POLICY`), not a scalar.
  Plan-shaped work is bounded by `within_envelope` / `existing_plan` and the
  `withinEnvelope` check (`service.ts`); `SEND_PEER_REQUEST` remains on a confirmation
  boundary; the four authority-shaped classes stay forbidden.
- There is no self-escalation: the surface/tools expose only
  `requestModeChange({to})`, which returns `{status:"requested"}` and applies nothing.
  Only `SqliteManagementPreferenceStore` + `applyOperatorModeChange` (CLI/host) persist
  a change.
- A downgrade is immediate: `runBounded` re-reads the profile every step with no grace
  budget.
- There is no `ManagerAgent` and no autonomy score; every non-observational action runs
  through an EXISTING governed service (`controller.runTurn`, `controller.plan`, the
  recipe execution service, an injected verify port).

**Correction:** none needed.

## Q7. Is the conventional single-agent path still usable?

**Verdict: YES.**

- All new install options are **additive and optional** (`projectAssociationStore?`,
  `projectJournalStore?`, `managementPreferenceStore?`). With none supplied, the
  workspace and management surfaces are absent (`undefined`), and the advanced
  application tools are only registered when a surface exists
  (`hasAdvancedSurface`); a bare Work install keeps the base Work tools, and no tool or
  route shape changed.
- The existing CLI commands (`new`, `plan`, `next`, `preview`, `run`, `claim`, `gate`,
  `report`, `promote`, `pump`, `context`, `telemetry`, `architect`, `serve`, `tui`,
  `status`) are unchanged; `manage` is a new additive command, and `serve` still works
  without `--profile`.
- The conventional single-agent path (a human + the Work controller + `controller.pump`)
  requires none of the new stores.

**Correction:** none needed.

---

## Summary table

| # | Question | Verdict | Key evidence |
| --- | --- | --- | --- |
| 1 | All-user knowledge ownership? | NO | journal kind enum excludes PROOF/DECISION/TASK/… ; association is a ref only |
| 2 | Auto-index outside project? | NO | service built only from supplied stores; absent plane ⇒ `knowledgeWarnings`; no `ExternalAssetLibraryPort` in `src/**` |
| 3 | Duplicates canonical stores? | NO | derived deep-frozen view; mutations = 2 owned stores + `controller.plan` |
| 4 | Proof Vault dominates onboarding? | NO | workspace/manage enable with no proof store; Proof = a `PROOF_CLAIM` capability |
| 5 | Management mode implies authority? | NO | `AUTHORITY_REQUIRED_ACTIONS`; service always attests `hasSemanticAuthority:false` |
| 6 | Delegate implies unrestricted autonomy? | NO | per-class matrix + envelope; request-only mode change; no `ManagerAgent`/score |
| 7 | Conventional single-agent path usable? | YES | additive optional stores; advanced tools gated; existing CLI unchanged |

## Residual risks

- The workspace surface is only as honest as its configured ports: with no proof /
  memory / campaign wiring it reports warnings rather than data. This is intentional
  and truthful, but a product UI must render those warnings rather than treat the view
  as complete.
- `campaignProjectRefPort` (`src/install.ts`) skips a campaign whose linked-project
  projection reports `project_identity_conflict` rather than guessing; relations are
  therefore incomplete-but-honest for that campaign.
- The management preference store is deployment-local and non-authoritative. A
  deployment that loses it silently degrades to `DIRECT`; operators should treat the
  store path as part of their deployment config (now listed under
  `databases.management` in the deployment profile).
- No `web/**` surface was modified or added in this change; the vertical is reachable
  through tools, typed HTTP, and the CLI only.
