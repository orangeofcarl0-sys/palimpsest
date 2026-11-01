# COG-6 evidence

**Stage:** Agent-Native Project Evolution & Authorized Action.
**Code Freeze:** `c10af086896abc139110eea041fdaccd19135590` / tree `4515f31c3122605d029c7268ff55b0b791940a3a`.
**Evidence Freeze:** the commit adding this tree (its SHA is reported forward).
**Model:** one availability probe; **BLOCKED** (`QUOTA: Insufficient Balance`); zero scored sessions;
zero reported tokens.

---

## What happened

- **C6-0:** the normal tool surface, canonical owners, plan/decision/opportunity/intent distinctions
  and the completion-vs-objective ruling were mapped. No product change.
- **C6-1:** the Sablewick natural-discovery scenario, exact prompts, operator policy, rubric, budget
  controls, deterministic rig and model gate were frozen and committed.
- **C6-2 / Code Freeze:** one bounded correction — the governed reopening now names the current
  ProjectIR revision instead of hardcoding 0. A focused RED/GREEN test covers a rework after a plan
  revision.
- **Deterministic mechanism:** an operator-authored authorised intake, a held current result, a
  packaged `INCOMPATIBLE` assessment, a service-minted rework, a D2 attempt on the accepted basis, a
  negative finding, a normal Promotion and a reconciled head. **This is not an Agent result.**
- **Controls:** changed candidate, duplicate delivery, requirement relaxation, wrong source/head,
  out-of-scope write, direct external commit and an unrelated newsletter update.
- **Model gate:** the provider returned insufficient balance; no scored P or F session was started.
  The budget controller was tested against a local dummy child and killed it with `SIGKILL`.

---

## Layout

| path | content |
| --- | --- |
| `preflight.txt` | read-only Git preflight, protected-resource counts, environment |
| `probe/` | the one provider probe: result JSON, session header, exact script |
| `model/` | budget kill-switch self-test and the BLOCKED campaign record |
| `runs/main/` | the deterministic mechanism: `run.json`, `events.json`, `worktree.json`, `rubric.json`, `candidates.json`, `files/` |
| `runs/outofscope/` | the unapproved-write refusal |
| `runs/irrelevant/` | the unrelated newsletter update (packaged `INCOMPATIBLE`) |
| `verification/` | build, architecture, public API and three targeted test logs |
| `outcomes.json` | the extracted identities, outcomes, controls, rubric and model gate |
| `verification.json` | the Code Freeze, environment, command exits and test counts |
| `manifest.json` | SHA-256 of every artifact in this tree and the reports, with 0 mismatches |

The reports are under `docs/engineering/COG6-*.md`. Start with `COG6-FINAL-REPORT.md`.

---

## What is established and what is not

| claim | verdict |
| --- | --- |
| the normal authority/outcome boundary is mapped | **established** |
| the executable intake → Promotion → Reconciliation → rework → Promotion path works | **established for the mechanism** |
| the negative finding and the unmet objective stay distinct | **established for the mechanism** |
| an Agent discovered the change | **BLOCKED** — no Principal session |
| an Agent proposed the intake | **BLOCKED** — the operator authored it |
| an Agent's proposal was independently approved | **BLOCKED** — no model proposal |
| a fresh session inherited the result | **BLOCKED** — no model session |
| Palimpsest beats a native DSH baseline | **BLOCKED** — no baseline, no superiority claim |

The deterministic runs use a test-owned in-process `WorkWorkerRunPort`, not a model and not the DSH
subprocess worker. The final direct-commit control intentionally leaves the live head ahead of the
project head; that is the preserved `HEAD_BASIS_MISMATCH` case, not a reconciled final state.

---

## Reproduction

See `COG6-ENGINEERING-REPORT.md` §6. The final run directories here are copies of
`.cog6-rig/final-{main,outofscope,irrelevant}`; the full worlds and SQLite databases remain outside the
repository in `.cog6-rig` for local inspection and are not needed to verify the recorded identities.
