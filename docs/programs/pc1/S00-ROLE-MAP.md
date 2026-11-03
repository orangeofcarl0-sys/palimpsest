# S00 — Roles, authority sources, and the normal/expert split

## 1. Role map

| Role | DSH surface | May read | May write | Authority source | Not allowed |
|---|---|---|---|---|---|
| Operator | Host CLI / application API / operator scripts; not a model tool | everything the deployment stores | approve exact proposal; apply intent revision; accept/promote a result; configure profile | caller-supplied ports and explicit host actions; no model boolean | model-authored `approved:true`; self-granted scope; editing Ordarium ledger |
| Principal (project agent) | DSH principal session with the registered tools | project sources, inbox (read-only), its execution world, derived project views | its execution world; Journal; proposals; non-canonical artifacts | the Work task envelope and plan revision current at the time | accepting its own proposal; moving canonical head; promoting its own result; changing requirements |
| Ephemeral worker | DSH native subagent / managed Work worker | the task envelope's declared inputs and its world | its isolated world only | Work admission and `TaskEnvelope.write_paths` | reading other conditions, oracle data, credentials; writing canonical repo |
| Durable peer | separate DSH home/profile, federation transport | its own project + received messages | its own project; replies | its own operator/config | impersonating another peer; auto-importing an answer as Evidence |

The `operator` role is not a new authority root. S04 will adapt the existing `ProjectIntentAdmissionPort` (caller-supplied, host-verified) and the existing Promotion operator path. Where no admission port exists, `apply` must refuse.

## 2. Normal profile (target)

A normal product profile must present one coherent path:

1. `project summary` — goal, requirements, current accepted results, candidates, negatives, open questions, blocked work, next legal actions.
2. `project explain <ref>` — source, basis, time, adoption, applicability, what would reopen it.
3. `work propose` — an action candidate with sources/digests/scope/authority needed; non-authoritative.
4. `review preview` / `review decide` — operator-side exact proposal review; model cannot decide.
5. `work start/observe/complete` — through the existing controller; placement-independent completion.
6. `result inspect/accept/recover` — candidate vs accepted identity; no fake success.
7. `collaboration request/observe` — only when independent contribution is justified.
8. `project resume` — a fresh session gets a bounded capsule with sources, not a transcript.

The normal catalog should expose only the actions needed for this path. Legacy `next/claim/report/finish/preview` remain available under an **expert** profile; they must not be simultaneously advertised with the product facade on the normal profile.

## 3. Expert profile (compatibility)

Everything currently registered stays reachable under an explicit `toolProfile: "expert"` (or `"all"`). This is a compatibility and debugging surface, not a second semantic authority. Tool names and behavior are unchanged; only visibility tiers are added.

## 4. Deployment modes

| Mode | Intended use | Required facts | Default surface |
|---|---|---|---|
| Normal product | Most project work | repository, project id, orchestration DB, Ordarium DB, workspace/journal stores, standard | product facade + minimal project/work/review tools |
| Expert product | Debugging, migration, research | all of the above + optional advanced stores | full legacy + application tools |
| Read-only inspection | `doctor`, `status`, `explain`, `review preview` | no write authority required | read actions only |

## 5. Non-negotiable boundaries

- A model's `mode` field or prose never grants authority; only the host-supplied actor/port does.
- A `PASS` is always scoped: evidence predicates prove protocol observations, not business truth.
- A candidate source is not accepted because it is visible; acceptance is a separate operator action bound to digest.
- A result is not accepted because its Work is `SATISFIED`; acceptance is the existing Promotion path.
- A negative finding can complete an investigation contract; it cannot complete a business objective.
