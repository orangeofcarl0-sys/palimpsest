# COG-3 — Experimental Protocol (pre-registered)

**Status:** fixed before the scored S/F/P/P-minus runs. The mechanism probes that precede them are
labelled diagnostics and are not scored. This document was committed before the scored trials; the
scenario, tasks, rubric and stopping rules below were not changed afterwards.

**Branch:** `palimpsest-cog3-native-synthesis`
**Incoming baseline:** COG-2 final HEAD `2928adc187ea3598639c5bd1e42828448d6ce56d`
**Model / runtime:** recorded from the session stream; the observed provider/model and DSH version
are reported in `COG3-SYNTHESIS-RESULTS.md`. No identity is assumed here.

---

## 1. Hypotheses

| id | hypothesis | what would distinguish it |
| --- | --- | --- |
| H3-SYN | an independent agent's evidence-bearing result, delivered through the normal product path, correctly influences another agent's subsequent decision and becomes useful project continuity | a real second model execution produces a source-grounded finding; the terminal result is delivered to the principal session; a later decision changes in a way traceable to it |
| H3-COMP | the existing DSH Host + Palimpsest composition supports this without a new runtime | the shipped host composes the branch port, frozen snapshot, reasoning store, activation and delivery; no replacement service is needed |
| H3-ACT | a principal selects useful collaboration in a naturally presented task without being told which tool to call | the scored task invites background checking in ordinary language and the principal chooses `palimpsest_delegate` (or explains why not) |
| H3-CUR | the receiving agent distinguishes applicable from stale, contradicted or irrelevant findings | applicable finding used; a result computed before the later change is not silently adopted; an irrelevant result creates no work; a conflicting question is left uncertain |
| H3-VALUE | Palimpsest provides measurable incremental value over strong file-native and native DSH collaboration baselines | S and F solve the same task with the same information; the comparison scores decision quality, influence, cost and coordination separately |
| H3-RELIABILITY | failure, stale delivery, repeated requests and missing capabilities are handled without fabricated completion or unauthorized project-state changes | honest FAILED/INTERRUPTED/EXISTING outcomes; no duplicate work; no invented Evidence or ProjectIR revision |

A passing mechanism probe does not establish H3-SYN. A delivered message does not establish H3-CUR.
A correct plan does not establish H3-VALUE.

---

## 2. Scenario

**Wrenfield Archive Partnership** (fictional): a six-month digitisation programme for three
collections across two sites, with an £84,000 grant.

The raw pack in `scripts/cog3/scenario/sources/` is identical in every condition:

- `brief.md` — objective and four grant conditions;
- `collections.csv` — three collections, rights status, condition notes;
- `sites.md` — CRO imaging suite; Northgate cold store and adjacent inspection room (16°C/45% RH,
  pass-through hatch, 40-reel/30-minute conservation limit, no network);
- `rights.md` — public domain, orphan works, and a donor restriction whose two sources conflict;
- `condition.md` — brittle bindings, nitrate cold-storage/scanning limits, mould;
- `vendors.md` — Filmtek nitrate scanner (15–20°C, 40–50% RH, cannot operate at 4°C), Bindwell,
  MobileScan;
- `open-questions.md` — three questions.

The historical finding is carried by **one channel per condition**:

| conclusion | role | carrier |
| --- | --- | --- |
| 2024 nitrate pilot at CRO failed at 62% RH; do not repeat unchanged | prior negative result | project journal **or** `sources/prior-notes.md` |
| 2025 open day drew 2,340 visitors | irrelevant control | same |
| Harrow estate permission outstanding; solicitor vs liaison conflict | uncertain | same |

The **later project change** is `scenario/updates/2026-01-20-northgate-booking.md`: the Northgate
inspection room is booked from 1 March to 30 June 2026 and cannot be used for scanning in that
window. It is committed only after the delegated finding has been delivered, so the finding was
computed against the earlier basis.

No fixture contains the intended plan, the rubric or the evaluator's answer.

---

## 3. Conditions

| condition | agent | prior findings | research capability | rounds |
| --- | --- | --- | --- | --- |
| **S** | strong single-agent file baseline (`dsh-base` + `dsh-headless`) | `sources/prior-notes.md` | no subagents; the model reads files itself | one headless session |
| **F** | native DSH collaboration baseline (same headless profile) | `sources/prior-notes.md` | the installed `subagent` / `subagent_fork` / `workflow` tools enabled; the headless runner waits for child completion notices | one headless session + any children |
| **P** | shipped Palimpsest host (`palimpsest-dsh-host`, long-lived principal) | project journal, 4 entries, written through the product | `palimpsest_delegate` over a frozen snapshot; unrelated native subagent tools disabled in this profile to isolate the Palimpsest path (recorded) | phase 1 plan + delegated research; phase 2 cold-resumes the SAME session after the update |
| **P-minus** | the same shipped host with `attention.activation: "none"` and no `reasoning` bundle | project journal | **no** delegation (capability absent); the principal may read the journal and files | phase 1 + phase 2, same tasks |

P-minus is the matched no-delegation control. It is not a delivery ablation: it removes the whole
delegation path, and therefore measures the marginal value of the independent research, not the
delivery seam alone. The ruling's delivery-ablation condition is **not** available without adding a
new seam; no such seam is added.

`S` keeps ordinary files and tools; nothing Palimpsest-specific is present. `F` keeps the strongest
native collaboration the installed DSH actually offers; it is not deliberately weakened.

---

## 4. Tasks (exact)

All conditions receive the same plan task and the same phase-2 update:

> You are the programme planner for the Wrenfield Archive Partnership. Read the programme pack in
> ./sources and produce ./deliverables/plan.md: a month-by-month schedule for January-June 2026, a
> line-item budget within the GBP 84,000 grant, and a short rationale for each major choice. The
> grant conditions are in sources/brief.md. Before you finalise, work through the open questions in
> sources/open-questions.md. If a question needs sustained checking, it is fine to start that
> checking in the background and keep working on the plan.

> Project update, 20 January 2026. The Northgate inspection room has been booked for the spring
> public programme from 1 March to 30 June 2026 and is not available for scanning in that window.
> The cold store is unaffected. Revise ./deliverables/plan.md to account for this, keeping the same
> budget and grant conditions.

The task never names `palimpsest_delegate`, a subagent tool, or a frontier mechanism. The mechanism
probes use a separate, explicitly labelled diagnostic prompt and are not scored.

---

## 5. Evaluation

The primary measure is **decision correctness and consequence**, judged by a manual pass over the
actual deliverables with quoted evidence. Mechanical extraction (schedules, budget totals, named
sites) is supporting evidence, not a score. There is no lexical rubric score.

Plan rubric (0–12):

| id | item | 0 | 1 | 2 |
| --- | --- | --- | --- | --- |
| Q1 | nitrate location and conditions | CRO / cold store / none | inspection room but a condition missing | inspection room, 15–20°C/40–50% and 40-reel/30-min respected, not at CRO |
| Q2 | two collections publishable by June | not addressed | one complete chain | A + B with stabilisation and three-week rights assessment scheduled before publication |
| Q3 | collection C | assumed publishable | mentioned as risk only | contingent on written permission; conflicting sources stated |
| Q4 | budget | over £84,000 or missing | present but inconsistent | ≤ £84,000, line items consistent, scanner transport included |
| Q5 | irrelevant control | 2,340 drives a decision | mentioned only | correctly ignored |
| Q6 | phase-2 currentness | old nitrate schedule retained | partially revised | nitrate moved out of March–June with the new constraint reflected |
| Q7 | finding provenance | no traceable use | vague reference | a delivered detail (inspection room / 40-reel / no-network transfer) is used and its exploratory standing is not overstated |
| Q8 | preserved uncertainty | invented facts | one gap named | per-reel speed and estate permission left unresolved honestly |

Influence chain (I1–I6), reported separately and not added to the plan score:

- I1 the research execution actually read ≥ 3 relevant sources from its frozen basis;
- I2 its statement contains the applicable conclusion;
- I3 settlement is COMPLETED/ADMITTED (not FAILED, not a fabricated conclusion);
- I4 the terminal text appears in the principal session's delivered follow-up;
- I5 the principal's later artifact changes in a way traceable to I2/I4;
- I6 the matched P-minus control reaches or misses the same decision without delegation.

Currentness (C1–C5):

- C1 applicable result used;
- C2 stale result not silently adopted after the update;
- C3 irrelevant result creates no work;
- C4 conflicting result stays uncertain;
- C5 no Evidence/Proof/verification/ProjectIR authority is fabricated for the finding.

A passing C1 does not imply C2. A correct plan that could have been derived from ordinary files is
not proof of compounding.

---

## 6. Budget and stopping rules

| limit | value |
| --- | --- |
| total model sessions (including spawned research branches and native subagents) | 18 |
| per-session wall clock | 20 minutes |
| total reported model tokens | 25,000,000 |
| parallelism | scored conditions run sequentially |
| scored trials | one initial trial per condition; no rerun to make a result appear |

Stopping rules:

- A timeout or nonzero exit is recorded, not silently rerun. A diagnostic rerun is labelled.
- If P naturally makes no delegation and no product call, the scored natural-activation claim is
  reported as negative; the mechanism probes remain labelled diagnostics.
- If the budget is exhausted, the campaign stops and reports partial results. Counters are not reset.
- No rubric, oracle, scenario or hidden answer is edited after a scored run to improve it.

---

## 7. Isolation and honesty

- Every run has its own `DSH_HOME`, profile, state databases and test-owned Git world under
  `.cog3-rig/`; the real runtime home is never written.
- Credentials are read from the owner's store and never printed or copied into evidence.
- The principal is the shipped long-lived host, not a direct `launchDeployment` call. The branch is
  the shipped subprocess branch host; the snapshot is the product's detached worktree.
- A deterministic callback is never substituted for a real-model worker, and a scripted finding is
  never injected into a delegation.
- The evaluator, the participant and the model family share one machine. Isolation is
  organizational, not blinded; no strong blinded-comparison claim is made.
- Single runs support bounded observations, not statistical superiority. The report preserves every
  negative and null finding.
