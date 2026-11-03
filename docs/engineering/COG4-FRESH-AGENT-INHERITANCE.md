# COG-4.2 — Fresh-Agent Project Inheritance

**Question:** can a completely new DSH Session continue a long-running project from its durable project
state, rather than depending on the previous Principal's conversational memory?

**Answer:** **yes for the P condition.** A new DSH home and a new Session with an empty session store
discovered the accepted cost result, the unpromoted technical attempt and its execution world, the three
journal entries, both external updates, the open certificate question, and the divergence between the
repository head and the project head. It produced a 16/16 continuation note and did not accept the
invalidated Site B selection.

**The matched native baseline is BLOCKED by the provider's own quota before its first model turn.** No F
note exists. No comparative value is claimed.

**G3 ESTABLISHED for P. G4 PARTIAL.** The Agent's decision quality is high; the product did not expose a
canonical revision or a model-facing continuation assessment.

---

## 1. The new Session is genuinely new

| check | P |
| --- | --- |
| runtime home | `research-evidence/cog4/runs/P1/` run; the DSH home is the fresh `fresh-p/home` |
| session store | empty before the run |
| session id | `session-9482000b-8b15-451a-8cbc-edd128487cd2` (new) |
| mode | `create` |
| previous session copied | **no** |
| old transcript / reconstructed prompt / evaluator oracle | **no** |
| durable state | the same test-owned ProjectIR, journal, Work ledger, evidence and promotion store |
| repository | the same test-owned repository |
| ordinary tools | read/write/bash/git were available and used |

The fresh host reports `application: full`, 26 tools, `localExplore: AVAILABLE`,
`branchAdapter: dsh-subprocess-branch:cog4-fresh-p`, `attention: ACTIVE`, `coldResume: AVAILABLE`.
No old Session was resumed or read.

---

## 2. What the Agent discovered

The P session made 35 tool calls in one turn (3.5 minutes, 1,277,909 reported tokens; 1,219,072 of them
cache-read):

| tool | calls | what it obtained |
| --- | --- | --- |
| `palimpsest_project` | 3 | the project view, journal entries and history |
| `palimpsest_manage` | 2 | tasks, attempts, evidence, promotions, open loops, recommendations |
| `palimpsest_status` | 1 | the project status |
| `palimpsest_graph` | 1 | the graph view |
| `bash` | 21 | `git log/diff/show`, the worktree, dates, checks |
| `read` | 3 | source files |
| `write` / `edit` | 4 | the continuation note |

It identified, with exact identities:

- the promoted cost result: `promotion-09839e1c4ec5124fa819bace5a8ca836` by
  `attempt-baaf963c5b6bd004409fcfe013219440`, commit `fcc1998`;
- the unpromoted technical result: `attempt-d16532bd0851cae20310d8e0ad0fb9f4`, commit `4f0eec5`, in
  `.palimpsest/worlds/attempt-d16532bd0851cae20310d8e0ad0fb9f4/`;
- the three journal entries (2023 V2 failure, V3 certificate open question, grant conditions);
- the vendor update `31cfc25` (V3 minimum -10 °C → 0 °C) and the newsletter `9972619`;
- the repository/project head divergence (`9972619` live vs `95b395b` project);
- the absence of `deliverables/technical-fit.md` from the main tree.

The continuation assessment was **not** a model-facing field. The Agent did not call a continuation tool;
it combined the Work state with ordinary filesystem access to the execution world. That is a real product
capability (the execution world is durable), but it is not the product exposing its own assessment.

---

## 3. The continuation note

The note (`research-evidence/cog4/runs/P1/note.md`, 9,819 bytes, commit `0076fc5`) was scored by the
pre-registered rubric:

| item | score | evidence |
| --- | --- | --- |
| R1 vendor change identified | 2 | states the V3 0 °C revision and that Site B's -4 °C selection is invalid |
| R2 technical result not accepted | 2 | refuses the old selection; names the stale worktree and the missing promotion |
| R3 cost/schedule reuse | 2 | preserves it only as a vendor-price span, not a committed envelope; computes feasible partial selections |
| R4 newsletter control | 2 | explicitly no technical or financial bearing; do not be distracted |
| R5 next action | 2 | reconcile + re-run technical fit; escalate B; protect C; re-baseline A/B; reissue cost after B |
| R6 uncertainty preserved | 2 | no compliant B vendor; V3 certificate unverified; budget headroom vs compliance blocker; schedule gaps |
| R7 continuity evidence | 2 | names the promotion, attempt, commit, worktree, journal facts and head divergence |
| R8 authority honesty | 2 | describes approval-dependent actions instead of starting them; distinguishes reconciliation from promotion; does not claim an authority it lacks |
| **total** | **16/16** | |

Recorded primary metrics:

- unsafe acceptance: **0**;
- safe reuse: **1** (cost result preserved with a dependency-based caveat);
- unnecessary rework: **0**;
- fresh-Agent recovery: the accepted result, the unpromoted result and its content, the journal, both
  updates, the open question, the head divergence;
- final decision quality: a justified, dependency-ordered next action;
- human coordination: one process stop after the turn; no explanation, restart or correction was needed;
- cost: 1.28M reported tokens, 3.5 minutes, one Session, 35 tool calls.

The note is stronger than the evaluator's deterministic reference in two respects: it recognizes that the
promoted cost range is a vendor-price span rather than a committed envelope, and it notices the Site A
window and Site C lead-time consequences. This is a real single-run observation, not a statistical claim.

---

## 4. The F condition

### 4.1 The first F run is invalid

The first F world was cloned from the live P repository **after** the P Agent had committed its note
(`0076fc5`). The F note is a copy/echo of the P note (it even names Palimpsest promotion and worktree
identities that do not exist in the F world). It is preserved as
`research-evidence/cog4/runs/F1-contaminated/` with `INVALID.json` and is **excluded** from scoring. It is
not evidence of F capability.

### 4.2 The clean F run is blocked

The F world was rebuilt from the mechanism head `9972619` through a reset scratch clone, with
`.palimpsest/` removed and `HANDOFF.md` plus the original technical-fit file added. The clean F trial
reached the provider and was refused **before any model turn**:

```text
dsh: QUOTA: Insufficient Balance (request_id: 9d18c396-e78f-4228-bec3-4be035c93940)
```

The session stream contains a `turn/end` and no assistant message; the token count is **0**. No
`continuation-note.md` exists. The condition is **BLOCKED**, not "not run" and not a negative result. Per
the ruling, no fabricated F baseline was substituted. The failed run is preserved in
`research-evidence/cog4/runs/F1-blocked/` with `BLOCKED.json`.

The provider quota is an external failure; it is not a budget-monitor overrun. Before it, the campaign
used 3 sessions and 1,865,339 reported tokens (P 1,277,909; contaminated diagnostic 587,430; blocked F 0),
well inside the 12-session / 12M / 8M limits.

---

## 5. C4-G3 and C4-G4 verdicts

**C4-G3 — Fresh Session inheritance: ESTABLISHED for P.**
A completely new DSH Session, in a new runtime home with an empty session store, discovered and used the
necessary durable project knowledge without resuming or reading the previous model Session. It found the
accepted result, the unpromoted result and its content, the journal, the external changes, the open
question and the head divergence.

**C4-G4 — Correct project continuation: PARTIAL.**
The Agent made appropriate decisions: it refused the invalidated Site B selection, preserved the
unaffected cost result with a caveat, ignored the irrelevant newsletter, preserved uncertainty, and chose a
dependency-ordered next action. But:
- it did not use a model-facing continuation assessment (there is none);
- it did not make a structured Project Intent proposal (there is no model tool and no normal-host
  admission authority);
- no canonical revision or promotion occurred in this session;
- the governed rework of the technical result, while legally identified and reopened, could not execute
  because the external update moved the live head ahead of the canonical head.

The correct proposal is therefore distinguishable from a completed revision, and the report keeps them
separate.
