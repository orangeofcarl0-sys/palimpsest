# COG-2 — Experimental Protocol (pre-registered)

**Status:** fixed before the scored trials. The scenario, tasks, conditions and rubric below were
committed before conditions A–D and the inheritance rounds were run. The positive control is a
labelled mechanism diagnostic, not a scored trial.

Baseline: COG-1 Evidence Freeze `c8fe505`, tree `13623581`, on branch
`palimpsest-cog2-project-native-continuity`.

---

## 1. Hypotheses

| id | hypothesis | what would distinguish it |
| --- | --- | --- |
| H1 | **Task fit** — the ordinary task does not need project machinery | the file-native baseline reaches the same decision quality with fewer calls; Palimpsest adds no decision-relevant information |
| H2 | **Product readiness** — a capability is not properly initialized or composed | a model that follows the product surface cannot reach the relevant asset after reasonable effort |
| H3 | **Capability activation** — useful capabilities are not selected when needed | the capability is reachable in a mechanism check but is not selected in a task that needs it |
| H4 | **Cognitive compounding** — project capital does not improve later reasoning | the relevant prior conclusion is retrieved but the later decision is unchanged, or is changed without correct applicability judgment |
| H5 | **Adaptive synthesis** — independent work does not influence other work | a second workstream cannot receive and use a source-grounded finding, or only a scripted injection makes it happen |

The experiment does not reward the mere presence of Palimpsest concepts, event records or branch
IDs. A run that reads the journal and learns nothing is not a success. A run that reasonably avoids
the journal on a self-contained task is not a failure.

---

## 2. Scenario

**Harrowgate Community Trust**, a fictional arts centre in a market town. The raw pack is in
`scripts/cog2/scenario/sources/`: brief, 24 months of attendance, a 2025 member survey, staff and
volunteer interviews, room and cost information, prior interventions, constraints, and open
questions.

The pack contains enough raw evidence to re-derive the main lessons, but it does not state the
lessons. Prior conclusions are carried by exactly one channel per condition:

| conclusion | role | carrier |
| --- | --- | --- |
| 2023 Friday evening pilot attendance fell 37 → 19; last minibus 18:40 | relevant negative result | ordinary notes **or** project journal |
| Saturday + childcare raised attendance 27 → 42; £180/session | relevant positive observation | ordinary notes **or** project journal |
| "East hall is climate-controlled" (2019 survey) | tempting stale claim | ordinary notes **or** project journal |
| 61% transport barrier; 44% would attend an evening event | superficially relevant / misleading stated preference | ordinary notes **or** project journal |
| Website migration, traffic +12% | irrelevant negative control | ordinary notes **or** project journal |

The **update pack** (`scripts/cog2/scenario/updates/`) is released only for Round 2:

- **relevant observation:** a Friday late-bus pilot from 6 February (last service 21:15, Fridays
  only, six months, reviewed in July).
- **changed constraint:** the family fund is £4,000, not £4,680; it covers 22 of 26 Saturdays.
- **clarification:** the east hall HVAC repair is funded separately, completes 27 February, and the
  hall is usable from 1 March; "usable from 1 March" is a plan, not a guarantee.
- **irrelevant control:** the website migration is complete and has no programme impact.

The world is a git repository in every condition because the product's Work path is git-shaped; no
condition uses managed Work unless an experiment requires it.

---

## 3. Conditions (COG-2B — task fit and discoverability)

All conditions use the same model, one one-turn session, the same wall-clock cap, the same source
pack, and DSH subagent/workflow tools disabled. The only differences are the Palimpsest surface and
the knowledge carrier.

| condition | agent | Palimpsest | ProjectIR | prior conclusions | task |
| --- | --- | --- | --- | --- | --- |
| **A** | strong single file-native model | no | no | ordinary `PRIOR-NOTES.md` | plan task |
| **B** | Palimpsest installed, uninitialized | yes | **no** | ordinary `PRIOR-NOTES.md` | plan task |
| **C** | project-ready Palimpsest | yes | yes | project journal | plan task (neutral) |
| **D** | project-ready + task-shaped invitation | yes | yes | project journal | invitation + plan task |
| **NEG** | project-ready Palimpsest | yes | yes | project journal | self-contained rewrite task |
| **POS** | project-ready Palimpsest | yes | yes | project journal | explicit mechanism check (diagnostic) |

The plan task asks for `deliverables/plan.md` with a month-by-month schedule, a budget table within
£60,000, and a rationale. D prepends exactly one sentence: *"This is an ongoing project. Earlier
work on this programme is recorded in the project workspace and may be inspected."* It does not name
a tool, a result or a journal action.

The negative control asks for a self-contained paragraph rewrite. It does not forbid project calls:
the question is whether the model makes unnecessary ones. Extra project calls, branches and latency
count against the system.

The positive control explicitly instructs the model to inspect the journal and report each entry,
and is labelled a **mechanism capability check**, never spontaneous knowledge use.

---

## 4. Conditions (COG-2C — cognitive inheritance)

Two rounds, two processes, two carriers.

| condition | round 1 | round 2 |
| --- | --- | --- |
| **P** (Palimpsest) | project-ready; the journal starts with the three traps; the model investigates the 2023 pilot and the east hall and records its conclusions with `palimpsest_project action=journal` (explicit recording instruction, labelled) | **new process**, new session, update pack released; the plan task; no mention of the journal or the finding |
| **F** (file baseline) | file-native; `PRIOR-NOTES.md` starts with the same three traps; the model investigates the same questions and appends its conclusions to the file | **new process**, new session, update pack released; the plan task; no mention of the notes |

The Round-1 recording instruction is the only explicit product instruction, and it exists in both
conditions in their own idiom (journal action vs append to file). The Round-2 prompt never contains
the correct historical lesson. The later model must discover, retrieve, judge applicability, and
change its plan.

The test of inheritance is not a citation. It is a concrete change in the plan traceable to the
earlier finding, plus a correct judgment about whether the finding still applies after the update
pack.

---

## 5. Evaluation

Dimensions follow the ruling: E1 product readiness, E2 natural task fit, E3 cognitive inheritance,
E4 cross-agent influence, E5 adaptation, E6 quality, E7 economics, E8 engineering integrity. These
are reporting categories, not new schema.

Scored rubric for the plan task (manual, evidence-quoted):

- R1 usable plan (Jan–Jun schedule, budget table, rationale)
- R2 evening/transport: no Friday evening series without transport; the 2023 failure acknowledged
- R3 Saturday/childcare: a family session with childcare and its cost handled
- R4 east hall: no sensitive material before commissioning; the 2019 claim not trusted
- R5 survey: 44% treated as stated preference, not observed demand
- R6 irrelevant: the website update does not drive a programme decision
- R7 budget ≤ £60,000 and internally consistent
- R8 (Round 2 only) adaptation: the bus, the 1 March availability and the £4,000 cap each change the
  plan correctly; the website change changes nothing

Round-1 rubric:

- I1 2023 pilot failure and its transport cause
- I2 east hall HVAC failure; 2019 climate claim stale
- I3 conclusions recorded durably through the carrier
- I4 uncertainty stated honestly

Mechanical extraction (`oracle.mjs`) is evidence, not a score. COG-1's lexical rubric saturated at
11/11 and 7/7, so the verdict is a manual pass over the actual artifacts with quoted evidence. The
scorer records a verdict and a one-line reason per item in `scores.json`.

---

## 6. Budget and stopping rules

| limit | value |
| --- | --- |
| model | `deepseek-official/deepseek-flash` (recorded from the session event; not assumed) |
| runtime | DSH `0.2.1-rc.3` |
| sessions | at most 16; planned: 1 diagnostic, 5 matrix, 4 inheritance, at most 6 for D/E |
| per-session wall clock | 20 minutes (`COG2_TIMEOUT_MS`) |
| parallel sessions | 1 (sequential) |
| exact token count | not exposed by the DSH session format; prompt/response characters, steps and tool calls are recorded instead |

Stopping rules:

- A timeout or nonzero exit is recorded and not silently rerun. A diagnostic rerun is allowed only
  with the failure preserved beside it.
- If three consecutive matrix runs show no product use and no decision difference, the matrix stops:
  the hypothesis is answered negatively for this task.
- No rerun is made to turn a failing result green.
- The inheritance rounds are not repeated with a different prompt to make the finding appear.

---

## 7. Isolation and honesty

- Each run has its own `DSH_HOME`/`runtime_HOME`; the real runtime home is never written.
- Worlds, state databases and profiles are test-owned under `.cog2-rig/`.
- Model credentials are read from the owner's store and never printed or written to evidence.
- The scorer's rubric is in the repository, never in the world. No fixture contains the intended
  plan or the intended answer.
- The positive control is a diagnostic and is not scored as autonomous behaviour.
- A single run per condition supports a bounded observation, not statistical superiority. No claim
  of broad superiority over other agent architectures will be made.
- The evaluator and the participant share a machine and the same model family. Isolation is
  organizational, not blinded. This limitation is stated in the final report.
