# C6-R3/R4 — Experiment Rig Qualification

**Status:** deterministic qualification complete; the provider is the remaining gate.
**Branch:** `palimpsest-c6r-behavioral-qualification`
**Baseline:** `d1a05a7bfc145258efa34c2710998db04680d266`
**Evidence:** `research-evidence/c6r/p1-host/**`, `research-evidence/c6r/budget/**`
**Label:** every model in this document is a scripted Messages stand-in (`MOCK_MODEL`). No provider
token was spent.

---

## 1. Neutral P1 world

`scripts/c6r/seed_p1.mjs` reuses COG-6's legitimate historical seeding and stops before the decision
under evaluation.

| item | value |
| --- | --- |
| world | a fresh Git repository from the pre-candidate `scenario/sources` |
| historical tasks | `technical-fit`, `cost-schedule` — both `SATISFIED` through genuine deterministic D2 results and normal Promotions |
| current task | `technical-refresh` — `READY` |
| intake task | **absent** |
| ProjectIR revision | 3 |
| project head | `e7eeb903476dc60c598a1824728da567d0944b4d` |
| canonical capabilities digest | `f81576167c284060eb494706e424204d99028823fe71bf56476883d49e4d9373` (pre-candidate) |
| Journal | `NEGATIVE_RESULT` (2023 V2 trial), `OPEN_QUESTION` (Solaris certificate), `OPPORTUNITY` (switch Site B to V2) resolved `DISMISSED` |
| T1 inbox | three events only; visible-set digest `021b639db41a6fbc141b0d1add01e70e66dd674ac718ef0ac0a0bdeac6e5bf3b` |
| future events | `2026-02-14/` is absent; Candidate B and the duplicate are not present |
| evaluator oracle | not copied into the world or inbox |

The initializer refuses to continue if the capability file is not the pre-candidate digest, if the
intake task exists, if the material candidate is missing, or if the future event directory exists.

## 2. The real P1 host over that world

The `palimpsest-dsh-host` bundle was booted inside the isolated runtime over the seeded deployment.
The deployment profile names **sandbox paths** (`/run/p1/world`, `/run/p1/state/*`); naming host
paths there causes the host to create a second, empty deployment inside its own `/home`, which the
first qualification run observed and which is why the state read failed. With the sandbox paths the
host opened the seeded stores:

```text
PALIMPSEST_HOST_READY ... "toolNames":["palimpsest_start","palimpsest_plan","palimpsest_next",
"palimpsest_preview","palimpsest_run","palimpsest_claim","palimpsest_report","palimpsest_gate",
"palimpsest_status","palimpsest_surfaces","palimpsest_finish","palimpsest_begin",
"palimpsest_federation","palimpsest_recipes","palimpsest_advisor","palimpsest_recipe",
"palimpsest_collaborate","palimpsest_project","palimpsest_manage","palimpsest_verification"]
```

The real request header recorded 37 model-visible tools: the 17 base tools plus those 20
`palimpsest_*` tools. This is the actual P catalogue, not a TypeScript export.

The scripted calls executed through the product surface. Their results:

| call | result |
| --- | --- |
| `palimpsest_status` | project `sablewick`, revision 3, head `e7eeb903`, tasks: `cost-schedule SATISFIED`, `technical-fit SATISFIED`, `technical-refresh READY`; two completed attempts; evidence |
| `palimpsest_project action=overview` | goal, revision 3, `IN_SYNC` head, latest Promotion |
| `palimpsest_project action=journal_entries` | the three historical entries, including the dismissed V2 opportunity |
| `read /run/p1/inbox/arrivals.jsonl` | exactly three T1 records |
| `read /run/p1/world/sources/vendor-capabilities.csv` | V3 `-10`, V4 coastal `no` — the pre-candidate data |

The session stream is `research-evidence/c6r/p1-host/session/session.v4.jsonl.zstd`
(`session-c01324f6-afec-47c1-b2f8-a197e522a1f7`, 2 model calls, 2,070 synthetic tokens).

**What this establishes:** the neutral P world is genuinely seeded, the Palimpsest catalogue composes,
the product reads the intended state, and the T1 inbox is the only external evidence visible.
**What it does not establish:** any model cognition. Every call was scripted.

## 3. Fair F1 world

`scripts/c6r/build_f1.mjs` builds a plain Git + Markdown workspace from the same facts:

- the same `sources/`, `package.json` and `verify.mjs`;
- the historical `deliverables/technical-fit.md` and `cost-schedule.md`, copied byte-for-byte from
  the P project head;
- a `HANDOFF.md` generated from the P initial state, carrying the goal, all five requirements, the
  historical findings, the three journal facts, the READY task objective and write path, the T1 inbox
  index with digests, the authorization rules and the working rules;
- the same T1 inbox, staged separately;
- **no** expected conclusion, Site B invalidation, recommendation, candidate B or evaluator rubric.

The mechanical equivalence audit compares the two worlds on eight dimensions:

| dimension | same |
| --- | --- |
| goal | yes |
| requirements (id + statement) | yes |
| historical deliverable digests | yes (byte-identical) |
| READY work (task id, objective, write path) | yes |
| journal facts (kind, title, resolution) | yes |
| inbox visible-set digest | yes (`021b639d…`) |
| source-tree digest (same function both sides) | yes |
| observation time (T1) | yes |

**Confounders: 0.** `equivalence.json` records `equivalent: true`. The difference is representation —
ProjectIR/Work/Journal versus Git/Markdown — which is the treatment, not a fact difference.

## 4. Run identity and state machine

`scripts/c6r/runner.mjs`:

- refuses to create a run whose id or directory already exists;
- accepts only the pre-registered transitions;
- keeps P1, F1, P3 and F2 in separate condition records;
- distinguishes `BLOCKED` (no provider turn), `INVALID` (unreadable/contaminated observation) and a
  valid `OBSERVED` result;
- records every transition with a real timestamp.

The labels are research-rig vocabulary only.

## 5. Usage accounting

`scripts/c6r/session_stream.mjs` reads the v4 session stream directly:

- every zstd frame is decoded in order (a single-shot decoder stops after the header);
- usage comes only from `assistant/message` events that carry a `usage` object;
- generation is deduplicated by `(sessionId, seq)`, so a repeated observation, a resumed stream or a
  copied file contributes once;
- independent sessions are **summed**, never maxed;
- a missing usage report is recorded, not filled with zeroes or guesses;
- an incomplete stream or a provider error before a turn is classified `INVALID`/`BLOCKED`, never a
  cognitive observation.

The P1 host stream accounts as one session, two usage events, 2,070 tokens — identical to the
adapter's synthetic usage, with no duplicate events.

## 6. Budget and termination

The pre-registered bounds are coded in `scripts/c6r/budget.mjs`:

| bound | value |
| --- | --- |
| sessions | 6 |
| reported tokens | 8,000,000 |
| stop starting new sessions at | 5,000,000 |
| per-session wall clock | 8 minutes |
| parallelism | 1 |

`scripts/c6r/budget_selftest.mjs` ran **inside WSL** and started a shell in a new process group,
which started a grandchild. The launcher killed the group with `SIGKILL`:

```json
{"before":{"child":true,"grandchild":true},
 "after":{"child":false,"grandchild":false},
 "killed":{"killed":true,"mechanism":"posix_process_group","signal":"SIGKILL"},
 "bothGone":true}
```

This proves the launcher can terminate the tree it starts. It does **not** claim that killing a
`wsl.exe` client on Windows terminates Linux children; that is why the launcher lives in the runtime
and owns the child. A local monitor is not a server-side token cap; both facts are recorded.

## 7. What remains

The only unqualified precondition for a scored run is the provider. The next action is one bounded
availability probe, run **after** the Code Freeze and through the same isolated runtime and
provider-only egress that the qualification used. If it returns insufficient balance, R4–R7 remain
`BLOCKED` and no P/F session is fabricated.

## 8. Gate contribution

- **R3 — Experiment runner readiness: ESTABLISHED.** The P and F worlds are comparable with zero
  confounders, the neutral P initializer is executable, the real P host boots over it, the run state
  machine refuses reuse and illegal transitions, and usage/termination are implemented and tested.
- **R4 — Matched natural discovery: pending the provider.** No real model has run.
