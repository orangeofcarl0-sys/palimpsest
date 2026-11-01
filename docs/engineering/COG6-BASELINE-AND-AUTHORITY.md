# COG-6 — Baseline and Authority Map

**Branch:** `palimpsest-cog6-agent-native-evolution`
**Incoming HEAD:** `60be154f7f776729698f316011670abd0bc4c0eb` / tree
`10d22622a70064b5b9f963b59c1476276dcec273` (COG-5 Evidence Freeze)
**COG-5 Code Freeze:** `af4cb65736d82419b151b3c4eccc75621ee1aea5` / tree
`f854222a300f32bd24e0753398469ca86fd9545c`
**Protected `origin/main`:** `044330b2e55198542d545edc42ed9c36e7ce896b`
**Model use:** none in C6-0.

This record accompanies `COG6-PROJECT-OUTCOME-AND-AUTHORITY.md` and
`research-evidence/cog6/preflight.txt`. It is the baseline and consumer map required before product work; it
is not a results report.

---

## 1. Baseline verification

| item | expected | observed |
| --- | --- | --- |
| source branch | `palimpsest-cog5-trustworthy-continuation` | same |
| HEAD | `60be154…` | same |
| tree | `10d2262…` | same |
| worktree | clean | clean (`git status --short` and `--porcelain=v1 -uall` empty) |
| `origin/main` | `044330b…` | same |
| `origin/palimpsest-cog5-…` | `60be154…` | same |
| ancestry | 0 behind / 368 ahead | same |
| COG-6 branch | absent locally and remotely | absent; created once from `60be154` |
| stashes | 0 | 0 |

Protected resources recounted read-only: **95 worktree registrations**, **2 locks** (`locked initializing`,
detached at `50e2d92`), **90 prunable entries**, **19 gate roots** (`~/.palimpsest-gates`), **73 evidence
trees** (`research-evidence/*/`), **0 stashes**. No prune, deletion, lock removal or cleanup was performed.
The retained `F:\Codex_Work_Space\Palimpsest\.cog5-rig\` directory is untouched.

Environment: Node `v24.14.1` (the package requires `>=24.15.0` — mismatch recorded, pnpm reports a warning and
does not enforce it; no alternative Node is installed); pnpm `11.21.0`; Git `2.53.0.windows.2`; Python `3.14.7`
via the `py` launcher (`python`/`python3` are not on PATH); DSH `0.2.1-rc.3`; `palimpsest-dsh-host` `0.1.0`.

The Node engine mismatch is an open environment prerequisite, not a satisfied one. COG-5 built and ran 259
targeted tests on the same runtime; C6 will record the same warning rather than change a global runtime
outside the repository.

---

## 2. What COG-5 established, as inherited

| capability | inherited status | evidence |
| --- | --- | --- |
| lawful external source intake through Work + Promotion | **established** | operator task, accepted blob equal to candidate, resulting head `365c830` |
| head reconciliation and reauthorization | **established** | `PROJECT_REVISED` to `365c830`, `TASK_REAUTHORIZED` at that base |
| governed rework after a real change | **established** | service-minted permit, `TASK_READY` provenance, D2 execution, new result `bb821f0`, promotion `42a8ab4`, `TASK_SATISFIED` |
| direct external-commit protection | **preserved** | `HEAD_BASIS_MISMATCH` at live head `07ca355` |
| positive reuse of a changed result | **not established** | packaged whole-repository read cannot prove disjointness |
| actual read observation | **not established** | `read_paths` is a declaration; the host fence protects durable state, not the source tree |
| model discovery, proposal, approval, fresh session | **not established** | no model was used in COG-5 |

C6 must not inherit stronger claims. In particular, the COG-5 intake task was operator-authored and the worker
was a deterministic in-process port.

---

## 3. The capability graph C6 actually uses

```text
DSH Principal Session
  └─ palimpsest_* tool catalogue (base Work tools + advanced application tools)
       ├─ Project Workspace read / Journal / Decision  →  ProjectJournal, ProjectIR decisions
       ├─ palimpsest_plan                              →  ProjectIR task graph (goal/requirements unchanged)
       ├─ palimpsest_begin / finish                    →  in-place direct Work (one-task projects only)
       ├─ palimpsest_next / claim / report / gate      →  Work ledger, attempt worktree, observed evidence
       ├─ palimpsest_manage step / run                 →  bounded mechanical turns, head reconciliation
       └─ palimpsest_delegate / collaborate            →  exploratory research, no canonical Work

Operator (independent routine, expert APIs)
  ├─ ProjectWorkspaceService.promoteOpportunity       (HTTP operator route)
  ├─ ProjectController.promote                        (exact commit + expected head)
  ├─ ProjectController.reconcileProjectHead            (proven effect head only)
  ├─ ResultContinuationService.inspect / startRework   (V1: VERIFYING candidate only)
  └─ WorkDelegationService.start                      (D2 worker; also used by continuation)
```

The model surface and the operator surface are disjoint at the acceptance boundary: no model tool promotes,
mints a head, applies Intent, admits source content, or starts continuation.

---

## 4. Consumer map for the proposed C6 corrections

No production change is proposed in C6-0. The map is recorded because C6-2 may justify a bounded correction.

| if C6 changes... | direct consumers | tests that pin the behavior |
| --- | --- | --- |
| model-facing presentation of project state or open loops | `palimpsest_project`, `palimpsest_manage`, workspace view | `v_project_workspace`, `v_management_autonomy`, `ci2_project_continuity` |
| a missing proposal/read path over an existing service | adapters, application surface, install assembly | `lean_delegation_surface`, `uxa_collaboration`, `cog2_project_context_hint` |
| completion/objective semantics | `deriveAttemptCompletionContract`, `deriveCompletionReadiness`, promotion eligibility | `lean_completion_contract`, `lean_d5a_continuation_assessment`, `lean_d5d_result_continuation_service` |
| continuation explanation | continuation service, assessment, D3-b issuer | `lean_d5c1_head_sync_composition`, `lean_d5c3_current_basis_reexecution`, `cog5_promotion_lineage` |
| Work/Promotion/head behavior | controller, promotion manager, head service | `x_project_head`, `ci3_promotion_authority`, `ci1_stale_and_duplicate` |

The default decision is **no production change**. A change requires a measured normal-product failure, a
focused RED test, the smallest correction, GREEN, and adjacent regressions (§15).

---

## 5. C6-0 decision

1. No executable change. The authority and outcome semantics are adequate for the experiment's action class.
2. The experiment must supply the journal/association stores so the advanced surface is really composed.
3. The corrective Source Intake Task must not exist initially; creating it is an Agent plan revision or a
   separate operator act, and the two must be distinguished in the evidence.
4. The operator policy binds the exact candidate digest, target path and task objective. A changed digest is
   a different candidate.
5. `TASK_SATISFIED` is recorded as Work acceptance, never as objective attainment. A negative finding is
   preserved in the Journal and judged by an independent domain rubric.
