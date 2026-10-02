# R2-S — CAPITAL SELECTIVITY UNDER CHOICE PRESSURE

Stage: R2-S
Branch: `r2-s-capital-selectivity`
Baseline: `42b0025b47ec2daba108370fb1a4300997caa7c2`
Verdict: recorded in `research-evidence/r2-s/analysis.json` (see §6 of this document)

---

# 1. What this stage asked

R2-M left a **ceiling, not an effect**: once the selected index was actually model-visible, the opaque
3-handle control pulled 20/20 and the metadata arm pulled 20/20. The previous uptake metric has no
headroom, so it cannot distinguish the arms.

R2-S therefore asks a different question:

```text
When a worker sees a BROADER set of selected project capital
(3 TARGET items it needs + 3 DISTRACTOR items it does not),
does item-level decision metadata improve SELECTIVE retrieval
rather than simply causing pull-all?
```

This is a **selectivity** experiment, not another uptake experiment.

---

# 2. The two conditions

Two arms only, identical in every respect except the index presentation (§10):

```text
S0  the opaque broad index: six `[kind] handle` entries, the current production presentation
S1  the same six handles, the same order, the same bodies, plus the frozen R2-M decision metadata
```

S0 and S1 map exactly onto the already-frozen R2-M presentation modes (`m0`/`m1`). §12 forbids re-tuning:
the projection algorithm, the per-field budget and the P-A Procedure ruling are **unchanged** from R2-M.

---

# 3. The §5 duplicate-handle correction

R2-M's experimental M1 renderer emitted a trailing `Handle: <handle>` line, so an M1 entry named its handle
**twice** while an M0 entry named it once:

```text
M0 handle occurrences = 3
M1 handle occurrences = 6
```

That is a confound for any experiment whose outcome is **which** handles are retrieved — a worker could
react to the repetition rather than to the metadata. The trailing line is removed, so every selected handle
appears **exactly once in both arms**, and the only difference between S0 and S1 is the metadata bytes.

This is an experimental-seam correction only. No canonical Context change; the production default stays
`off` and production M0 is byte-identical to what it was.

---

# 4. The broad candidate set

Each task receives six selected items: three TARGET and three DISTRACTOR, one of each kind.

```text
TARGET      the scenario's OWN prior-generation capital (Proof, Reasoning, Procedure)
DISTRACTOR  an independent, valid, mature bundle from a DIFFERENT domain
```

Distractors are **legitimate admitted capital** — a real Proof claim, a real Reasoning claim, a real
published Procedure, each derived from a recorded exploration — associated with the experimental project
through the same public `ProjectWorkspace.associateAsset({ associationKind: 'MANUAL' })` API the target
uses. They are not fake or garbage strings, and they do not contain the current task's hidden answer.

## 4.1 The §7 association question, answered

§7's literal "first attempt" is a **whole-bundle** distractor: C's task takes D's bundle, D's task takes
C's bundle. That construction is possible **without any canonical semantic change**, because the MANUAL
association API is exactly the existing, legitimate, harness-only association path — it is how the target
items are associated too, and project-scope enforcement is satisfied rather than bypassed.

The literal whole-bundle construction admits only **one** index order per scenario, because the compiler
orders by content-addressed identity and a single bundle fixes all three distractor identities. §11 requires
**five** distinct frozen candidate sets per scenario, so the pool is used **per kind**: each block draws one
proof, one reasoning and one procedure distractor. The B bundle (the config-migration ladder from R1-R)
joins the pool as a genuinely different domain.

## 4.2 What the six items model — and do not

The six items form a deliberately **broad preselected candidate set**. This does **not** model perfect
principal selection. It models:

```text
upstream selection has narrowed the universe
but has not perfectly identified which capital
will matter to this particular implementation.
```

---

# 5. Order, and the honest limit on it

§11 requires the S0 and S1 pair within a block to receive exactly the same order, and asks for the
target/distractor positions to be balanced across blocks "as far as practical".

The production compiler orders the index by **content-addressed identity**, which the harness may not touch
(§25: no canonical change). The only lawful lever on order is **which** distractors are selected. So the
order varies **across blocks** — driven by five pairwise-distinct distractor sets — and is identical
**across the S0/S1 pair within a block**, which is what the pairing requires. The achieved position pattern
is **measured** in the analysis (`orderBalance` in `analysis.json`) rather than asserted here.

---

# 6. Result

See `research-evidence/r2-s/analysis.json`. The verdict is the frozen one, applied mechanically, and it
reads **only** routing/selectivity — task success is recorded and never consulted (§21).

```text
primary outcomes   Target Recall = target_pulls / 3
                   Distractor Pull Rate = distractor_pulls / 3
descriptive        Pull Precision = target_pulls / total_pulls
```

---

# 7. Evidence corrections made before the experiment (§2–§4)

Appended, never rewritten; `adf1615`, `3a4a3c6` and `42b0025` are **not amended**.

```text
R2-M protocol verdict:       NOT_IMPROVED
R2-M inferential status:     NON_DISCRIMINATING DUE TO CONTROL CEILING
```

It must **not** be said that "metadata has no effect". The correct statement is that the metric was
saturated in the control. The frozen new empirical fact is:

```text
visible opaque 3-handle selected index: 20/20 voluntary pull, within tested scope
```

Three append-only records carry this stage's corrections:

- `research-evidence/r2-s/EVIDENCE-CORRECTIONS.md` — the human-readable reconciliation
- `research-evidence/r2-s/cic-amendment.json` — the CIC evidence amendment (§3)
- `research-evidence/r2-s/research-synthesis-amendment.json` — the second synthesis correction (§4)

The CIC amendment retains `Addressability ≠ Discoverability ≠ Decision Relevance` and weakens CI-2A's
**empirical** reading from "decision relevance is required for voluntary retrieval" to "visibility +
actionable affordance may be sufficient when pull-all is acceptable; item-level decision relevance is
required to be tested when selective retrieval among alternatives is expected". No canonical architecture
change accompanies it.

---

# 8. Scope and limits

- single model profile (`deepseek-flash`); no cross-model replication in this stage;
- the six items are a preselected set, not a model of perfect principal selection;
- the two "ordering-first" bundles (C and D) are structurally related, so "distractor" means "independent,
  different-domain, not this task's method" rather than "provably useless";
- order varies only through distractor selection, because canonical compile order is fixed;
- no hard pull budget is imposed (§18); R2-S measures natural model selectivity.

---

# 9. What this stage did NOT do

```text
No cross-model replication.
No productization of the M1 metadata.
No canonical Context change. No new owner. No architecture:write.
No change to the production default, which remains `off`.
```
