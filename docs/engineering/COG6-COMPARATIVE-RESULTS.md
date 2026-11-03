# COG-6 — Comparative Results

**Question:** does the Palimpsest workflow provide meaningful incremental project-level value over a
strong native DSH + Git/Markdown workflow on matched project phases?

**Answer: NOT EXERCISED — BLOCKED.** Neither condition ran with a model. There is no P result, no F
result, no matched pair and no comparative metric. No superiority, efficiency or cost-ratio claim is
made.

**Gate C6-G7: BLOCKED.**
**Hypothesis H6-V: NOT EXERCISED.**

---

## 1. Why the comparison did not run

The provider returned `QUOTA: Insufficient Balance` on the single availability probe. The mandate is
explicit: stop model execution, preserve the error, do not fabricate a baseline, do not replay a
contaminated run, do not switch model families. The campaign record is
`research-evidence/cog6/model/campaign.json` with `state: BLOCKED` and `startedSessions: 0`.

The deterministic mechanism arm is not a substitute for either condition. It has no model cognition,
no proposal, no discovery and no fresh session; comparing it to a native workflow would compare a
scripted operator to a model, which is not the question.

---

## 2. The frozen matched design

The protocol fixes the design for a future authorised run:

| item | P | F |
| --- | --- | --- |
| sessions | P1 (discovery + proposal), P3 (fresh continuation) | F1, F2 |
| bundle | DSH base + Palimpsest host | DSH base + headless, no Palimpsest |
| information | same programme pack, historical findings, candidate digests, inbox, authorization rules | same, plus a competent `HANDOFF.md` |
| phases | initial continuation → discovery → proposal → independent authorization → approved work → fresh session | same |
| permission | workspace-write, approval never for the automated run; no subagents in the primary phases | same; no `palimpsest_*` tools |
| budget | 4 planned sessions, hard cap 6, 8M tokens, stop starting at 5M, ≤8 min/session, sequential | same |

Both conditions are to be evaluated by the same pre-registered operator policy and the same
independent domain rubric, without condition names where feasible.

---

## 3. The metrics that would be recorded

- correct discovery; missed important changes; false-positive work from irrelevant changes;
- actionable proposal quality; unauthorized mutation attempts; stale-candidate acceptance;
- unsafe result acceptance; preservation of the negative finding; business-goal correctness;
- correct canonical transitions; avoidable rework; human interventions;
- fresh-session recovery accuracy; model tokens; wall-clock time; tool calls; failed executions.

The metrics are not collapsed into a composite score. If both systems reach the same correct result,
equivalence is reported as equivalence.

---

## 4. The smallest decisive next test

Once the owner's provider is funded, run **one** P1 discovery session against the frozen scenario and
score H6-D/H6-P/H6-A. If P1 fails to discover the candidate, preserve the failure and stop; do not run
the F arm to manufacture a comparison. If P1 succeeds, run P3 for H6-F, then the matched F1/F2 pair
for H6-V. The same frozen prompts, scenario, policy, rubric and budget apply.

Until then, the comparative question is open. The mechanism evidence in
`COG6-EXECUTABLE-EVOLUTION.md` establishes that the product path can execute; it does not establish
that an Agent can use it better than native DSH.
