# COG-2 — Final Report

**Question:** can Palimpsest naturally provide cognitive continuity and useful cooperation when the
task actually needs them, without making simple work more complicated?

**Answer:** in this stage, **no compounding advantage was demonstrated**, but one real barrier was
found and fixed: the product's recorded work was invisible at a cold principal's first move. With a
one-sentence, non-semantic launch cue, the same model read the journal and used it. With ordinary
files, it already did.

**Stage label:** `COG-2: PARTIAL — ACTIVATION FIXED, COMPOUNDING NOT DEMONSTRATED`.

---

## 1. Executive summary

- Every comparison condition, and every project-ready condition, produced a competent
  six-month plan. A strong model with ordinary files is enough for this task. That finding is
  preserved, not explained away.
- The product was **readable but not discovered**. With a valid ProjectIR and a populated journal,
  the neutral task made **zero** product calls. A cold second round of the same project, with eight
  recorded entries, also made zero.
- One sentence changed the selection: with a task-shaped invitation, 7 product calls; with the
  production launch seam, 3. The model read `journal_entries` and used the earlier negative result.
- The file baseline did not have the discovery problem: `PRIOR-NOTES.md` was read as one of the
  source files and explicitly cited in the later plan. It was cheaper than the product in the cold
  continuation (77 calls/5.02M tokens vs 104/8.63M) and no worse in quality.
- The bounded correction is a conditional, count-only launch hint. It adds no store, owner,
  authority, semantic constant or tool. It does nothing when the journal is empty, absent or
  unreadable, and it caused no unnecessary work on the negative control.
- Collaboration chose **FOCUS** correctly; an explicit **PARALLEL** request was refused with
  `CAPABILITY_REQUIRED` because reasoning branches are unavailable in this deployment. No
  cross-agent influence is claimed.
- Git governance is now explicit: 250 local and 79 remote branches, 24 distinct graph-divergent
  branches, 8 with genuinely unmerged work, D5 fully integrated by squash merges, `main`
  fast-forward-eligible but **not moved**, and no destructive cleanup.

---

## 2. A. Git governance

| question | answer |
| --- | --- |
| How many branches exist? | 250 local refs and 79 remote refs (329 refs, 250 distinct names). |
| Ancestors of the active development line? | 285 refs (208 local, 77 remote). |
| Truly divergent? | 24 distinct branches (26 refs): 11 G10 documentation records, 5 squash-merged sources, 7 `pal-fed` experiments, 1 `r3-a2`. |
| Patch-equivalent? | 18 local squash-merge source branches with zero non-equivalent patches, plus 16 divergent branches whose content is integrated through their PR merge commits. |
| Protected research milestones? | 17 branches named in freeze records; all contained in the development head. |
| Active or dirty worktrees? | 2 attached; one dirty only because of this stage's producer. One stale temp worktree is dirty and detached. |
| What should `main` mean? | The protected canonical integration branch, per the written policy and the active ruleset — not a release tag and not, in fact, the current development head. |
| Integration readiness? | Technically fast-forward-eligible (0 behind, 352 ahead); **awaiting owner authorization** and the required `unit`/`e2e` checks through a PR. |
| What was performed? | A read-only census, ancestry/patch/PR analysis, one branch created from the verified head, documentation. |
| What needs human review? | Main integration; the 58-name retirement list; the 92 stale worktree registrations and 2 locks; the 8 unmerged branches; the 16 deferred branches. |

Full detail: [`COG2-BRANCH-GOVERNANCE.md`](COG2-BRANCH-GOVERNANCE.md) and
`research-evidence/cog2/branch-inventory.json`.

---

## 3. B. Product readiness

- The **cognitive project context** was genuinely initialized: a real ProjectIR through
  `controller.start`, and five journal entries through the workspace's own write. The reads returned
  bodies, not titles.
- The **managed execution context** was not established: the deployment has no confirmed completion
  standard, and `palimpsest_begin` correctly refuses without one. No fake standard was created.
- A labelled mechanism check read all five entries and reported their kinds and titles. The read
  surface works.
- The failure is at the **moment of selection**, not in the store or the read. A cold principal with
  no cue does not know the journal exists.
- PARALLEL collaboration, live attention activation, delegation delivery, cross-project ask and a
  model-facing knowledge selector are not composed in this deployment. They were reported as
  unavailable, not simulated.

Full detail: [`COG2-PRODUCT-READINESS.md`](COG2-PRODUCT-READINESS.md).

---

## 4. C. Real cognitive behaviour

| question | answer |
| --- | --- |
| Did models naturally select useful project capabilities? | Only after a task-shaped cue. Without one: 0 calls in C and in the cold P round; with one: 7 (D) and 3 (CSEAM), and 1 in the cold P round with the seam. |
| When did they correctly avoid them? | The self-contained rewrite made 0 calls and answered in the reply, with and without the seam. |
| Did earlier knowledge improve later decisions? | Not demonstrably. The earlier conclusions were correct and the plan was good, but the strong file baseline was equally good. The journal was not read in the cold continuation until the seam existed. |
| Did multiple cognitive agents influence each other? | No. FOCUS was chosen; PARALLEL was honestly refused as unavailable; no second cognitive agent ran. |
| Did the system adapt to new information? | Sequentially, yes: the late bus, the 1 March east-hall availability, the £4,000 family-fund cap and the irrelevant website update were all handled correctly in the later round. Continuously, no: no in-progress delivery route existed. |

Full detail: [`COG2-REAL-MODEL-RESULTS.md`](COG2-REAL-MODEL-RESULTS.md) and
`research-evidence/cog2/scores.json`.

---

## 5. D. Engineering improvement

**The highest-impact measured bottleneck:** recorded project work is invisible at the principal's
first move. The capability existed, the data existed, the read existed; the model never looked.

**Production change:** one conditional launch sentence in the host (`host/dsh/lib/project_hint.js`,
wired in `host/dsh/lib/runner.js`). It reads the existing journal count and says that earlier work
may be inspected. It carries no title, body, kind, entry id, tool name or authority. Empty, absent
or unreadable journals compose the original message byte-identically.

**What improved, observably:**

- C (no seam): 0 product calls, 686 s, 4.04M tokens.
- CSEAM (same task, seam): 3 product calls, 304 s, 1.06M tokens; the plan uses the 2023 negative
  result directly.
- P round 2 (no seam): 0 calls, 1066 s. With the seam: 1 call and the plan uses the earlier
  findings.
- Negative control: 0 calls, 14 s, unchanged.

**What did not improve:** plan quality relative to the strong file baseline. The product's value in
this sample is selection and re-derivation cost, not a better decision.

**What remains unsupported:** managed Work without a completion standard; PARALLEL collaboration;
live attention/delegation; cross-project; continuous in-progress adaptation.

Full detail: [`COG2-ENGINEERING-REPORT.md`](COG2-ENGINEERING-REPORT.md).

---

## 6. E. Comparative value

- **Did Palimpsest outperform a strong file-native baseline?** No, not on decision quality. Every
  condition passed the same rubric. In the cold continuation the file baseline was cheaper and at
  least as effective.
- **At what cost?** The cheapest high-quality product run was the seam run: 35 tool calls, 304 s,
  1.06M tokens. The most expensive plan run was the cold Palimpsest continuation without the seam (95 calls, 10.37M tokens); the plain file-native baseline used 102 calls and 7.56M tokens;
  the cold Palimpsest continuation without the seam was 95 calls and 10.37M tokens.
- **Did human coordination decrease?** The seam replaces a human-written invitation with a product
  fact. That is a real reduction in task-author coordination for making the product reachable. It
  does not reduce the human decision about whether to accept the plan.
- **What cannot be concluded?** Any statistical superiority (n=1 per condition), any quality
  advantage, any autonomous collaboration, any continuous adaptation, or any claim that the result
  generalizes beyond this scenario and this model.

---

## 7. Findings

| id | finding | status |
| --- | --- | --- |
| H1 | Task fit: the ordinary task does not need project machinery | **SUPPORTED** — every condition solved it; files alone were sufficient |
| H2 | Product readiness: a capability is not initialized/composed | **PARTIALLY SUPPORTED** — the cognitive context is ready; Work, PARALLEL and live delivery are not composed |
| H3 | Activation: useful capabilities are not selected | **SUPPORTED** — 0 calls by default; 3–7 with a cue; the seam fixes the first move |
| H4 | Compounding: capital does not improve later reasoning | **NOT DEMONSTRATED** — the journal was read after the seam, but quality did not exceed the file baseline |
| H5 | Adaptive synthesis: independent work does not influence other work | **NOT EXERCISED** — PARALLEL unavailable; no cross-agent claim |

---

## 8. Preserved negative findings

- A simple method outperformed the product on discovery and cost: `PRIOR-NOTES.md` was read by
  default and cited; the journal was not, until a cue was added.
- Reading the journal is not the same as learning from it: C's plan was excellent without it, and
  the seam's plan was not better.
- The product correctly refuses unavailable capabilities (PARALLEL, Work without a standard) rather
  than returning empty results. That is a preserved strength.
- The product makes no unwarranted claims in this report: no quality advantage, no autonomy, no
  continuous adaptation.

---

## 9. Limits

- One run per condition; no statistical claim.
- One evaluator, same machine, same model family; organizational isolation only.
- The P round-2 record was overwritten by the seam re-test before copying; it is reconstructed from
  its preserved session stream and labelled.
- Exact tokens are model usage, not price; the runtime does not expose a billing figure.
- CI4's Contract Basis gap is unchanged and remains visible; this stage did not use old completion
  evidence to approve a new standard.

---

## 10. What would change the conclusion

A later stage would need, at minimum:

1. A task where the raw pack is **not** sufficient, so the prior synthesis is decision-bearing
   rather than convenient.
2. A managed Work or collaboration path that is genuinely composed, with a legitimate completion
   standard and a real second cognitive agent.
3. A cold continuation where the file baseline is also deprived of the prior conclusion (only raw
   evidence), so discovery and use can be separated from re-derivation.
4. More than one run per condition, with an evaluator who does not know the condition.

Until then, the honest conclusion is the one above: the product's cognitive continuity is now
visible and usable, but it has not yet been shown to make the work better.
