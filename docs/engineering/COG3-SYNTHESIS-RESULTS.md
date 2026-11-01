# COG-3 — Synthesis Results

**Scored conditions:** S (strong single-agent file baseline), F (native DSH collaboration), P
(shipped Palimpsest host with delegation, journal, update and cold resume). P-minus was **not run**
(see §7). All figures are reported model usage from the session streams, not billing.

**Overall:** **G2 ESTABLISHED (one applicable finding consumed and used); G3 PARTIAL; G4 PARTIAL;
H3-VALUE NOT ESTABLISHED.** The native DSH baseline matched the decision quality and produced a
stronger risk analysis at lower cost. That finding is preserved, not reframed.

---

## 1. What ran

| condition | agent | research | sessions | tokens | wall clock | plan |
| --- | --- | --- | --- | --- | --- | --- |
| **S** | headless single agent, files | none; the model read the pack itself | 1 | 1,828,481 | 534 s | 39,321 B |
| **F** | headless single agent + native DSH `subagent` | one spawned subagent, self-contained, red-team audit returned by message | 2 | 8,544,715 | not completed | 71,437 B (still being edited) |
| **P** | shipped Palimpsest host, long-lived principal | one `palimpsest_delegate` branch over a frozen snapshot | 3 (principal ×2 processes + branch) | 16,221,721 | ~20 min | 58,367 B → 62,972 B |
| **P-minus** | shipped host, no delegation | capability absent | **not run** | 0 | — | — |

Mechanism probes (labelled diagnostics, not scored): 6 sessions, 536,463 tokens. Total campaign:
**12 model sessions, 27,131,380 reported tokens** — 2,131,380 over the pre-registered 25M cap.

The model and provider recorded in every session stream: `deepseek-official/deepseek-flash`
(DeepSeek API). Runtime: DSH `0.2.1-rc.3`.

## 2. Decision quality

Common rubric (Q1–Q5 + Q8; each 0–2):

| item | S | F (provisional) | P |
| --- | --- | --- | --- |
| Q1 nitrate location and conditions | 2 | 2 | 2 |
| Q2 two collections publishable | 2 | 2 | 2 |
| Q3 collection C contingent | 2 | 2 | 2 |
| Q4 budget | 2 | 2 | 2 |
| Q5 irrelevant open-day figure | 2 | 2 | 2 |
| Q8 preserved uncertainty | **1** | 2 | 2 |
| **common total** | **11/12** | **12/12** | **12/12** |

P-only items: Q6 currentness **2** (the revision moved B to 2–20 February before the 1 March
closure); Q7 finding provenance **2** (the plan's 20–30 minute calibration assumption follows the
delivered 20–40 minute range, and the result keeps its exploratory standing).

**Reading.** All three plans are competent. The difference is not whether they found the inspection
room — every condition did — but how they treated the missing per-reel scan time:

- **S** assumed about three minutes per reel, giving seven reels per 30-minute batch and 28 reels per
  day. It labels this a planning rate, but does not quantify the downside or set a go/no-go.
- **F** identified the per-reel time as **the** blocking unknown, assumed 15 minutes, and included a
  sensitivity table: 16–30 minutes means one reel per batch, about 20 scanning days, about £12,000
  more and a programme at or over the ceiling; more than 30 minutes is a hard stop. It made the
  February test decisive. This is the strongest treatment of the uncertainty in the campaign.
- **P** used the delegated 20–40 minute range, planned one reel per 30-minute batch, a three-week
  booking, 16 reels/day and a calibration gate. It is more conservative than S and better grounded
  than S, but its risk analysis is less quantified than F's.

No condition produced a plan that fails a basic rubric item, and no condition found a different
collection strategy. On decision quality, **P and F tie; S is slightly behind on Q8**.

## 3. The influence chain (G2)

**Verdict: ESTABLISHED for one real finding, with a causal caveat.**

| link | P1 evidence |
| --- | --- |
| source | the principal read the journal; it chose the Filmtek per-reel time as the real unknown |
| research execution | `palimpsest_delegate start` returned `STARTED`/`RUNNING`, basis `8034ee86`; a real branch child ran |
| finding | the branch read `brief.md`, `sites.md`, `vendors.md`, `condition.md`, `collections.csv`, `open-questions.md`, `rights.md` (9 calls, 21,573 tokens) and stated that the pack has no throughput specification, plus the external 20–40 minute calibration range |
| settlement | `COMPLETED`, "the research branch closed with an admitted conclusion" |
| delivery | `PALIMPSEST_DELEGATION {"delivered":true}`, basis `8034ee861740` |
| consumption | the delivery turn: "The delegated finding aligns with the plan's key judgement and confirms the three-week Filmtek booking. I have tightened ... the calibration assumption ... 20–30 minutes per reel" |
| decision | the plan's 1-reel/30-minute batch, 16 reels/day, 15-day production window and three-week booking |

**Caveat.** The principal also ran `web_search` for "35mm nitrate film scanner throughput" and
fetched a scanner datasheet. The finding and the web search converge, so the finding is **not the
sole cause** of the throughput assumption. A matched P-minus control would have separated the two;
it was not run. The claim is therefore "a delivered finding was consumed and is traceable in the
decision", not "the finding alone caused the decision".

## 4. Currentness (G3)

**Verdict: PARTIAL.**

| case | verdict | evidence |
| --- | --- | --- |
| applicable result | **YES** | the throughput finding changed the calibration assumption and the booking |
| stale result | **YES** | after the 20 January Northgate booking update the cold-resumed principal moved B scanning to 2–20 February, held 23–27 February as buffer, and treated the room as available only to 28 February; it did not keep the old March schedule |
| irrelevant result | **PARTIAL** | the 2,340 open-day figure was confined to the newsletter and never drove a programme decision; but no independent irrelevant result was delivered and ignored |
| conflicting/uncertain result | **PARTIAL** | the estate's solicitor-vs-liaison conflict was preserved and C was excluded from the commitment; but the uncertain question was not delegated, so no uncertain delivered result was tested |
| no fabricated authority | **YES** | the branch result is labelled cell-local exploratory; the plan treats scan time as an assumption; no Evidence, Proof, Project Verification or ProjectIR revision was claimed |

The stale test is genuine: the finding and the phase-1 plan were computed against basis `8034ee86`;
the update was committed only after the delivery and after the principal's consuming turn; the
resumed principal had to judge the earlier plan against a new reality. It did so correctly.

## 5. Comparative value (G4)

**Verdict: PARTIAL — the comparison was performed, but no Palimpsest advantage was demonstrated.**

- **Decision quality:** P and F tie; S is one point behind. P's plan is not better than F's.
- **Cost:** P used 16.22M tokens, F 8.54M (truncated), S 1.83M. P's phase 1 alone (7.71M) was 4.2× S.
  P's cold-resume revision added about 8.5M more. Palimpsest was the most expensive condition by a
  wide margin.
- **Cross-agent influence:** both mechanisms produced a second model execution whose result was
  consumed. F's subagent produced a red-team audit that the principal turned into a per-reel
  sensitivity table and go/no-go — a stronger use than P's shorter finding.
- **Reliability:** both handled an independent result without blocking. P's `palimpsest_begin` call
  was refused honestly (worktree execution is not the principal bootstrap path; no completion
  standard). No fabricated completion occurred in any condition.
- **Coordination:** P's delegation was selected naturally, without naming the tool. That is a real
  product property. But it did not reduce human coordination in a measurable way in this sample.

**What is attributable:** the branch read the frozen basis, settled and delivered a grounded
finding; the principal consumed it and changed a load-bearing assumption. That is a real causal
chain with the web-search caveat.

**What is only a single-run observation:** every difference in this section. There is one run per
condition, one evaluator, one model family, no blinding and no P-minus control.

## 6. The strongest preserved negative findings

1. **The native DSH baseline matched Palimpsest's decision quality** and produced the best risk
   analysis in the campaign, at roughly half the token cost.
2. **The strong file baseline was nearly as good at a fraction of the cost** (11/12 common items,
   1.83M tokens).
3. **The delegated finding was not the sole cause** of the plan change; the principal also searched
   the web for the same number.
4. **The one Palimpsest-only currentness result is real but not comparative**: S and F were one-shot
   and never faced the update, so no cross-condition currentness claim is made.
5. **P-minus was not run**, so the matched no-delegation control is missing and the causal claim
   remains single-condition.

## 7. Budget, truncation and protocol deviations

The pre-registered cap was 25,000,000 reported tokens. The campaign used **27,131,380** (2,131,380
over). The overrun came from the F baseline: its principal and subagent were far more verbose than
the S or P estimates. F was stopped mid-turn as soon as the cap was detected; its plan is preserved
but is **not a cleanly completed run** and its score is provisional. P-minus was not started.

Deviations recorded rather than hidden:

1. **Rubric maximum.** The pre-registered table has eight 0–2 items (maximum 16). The sentence
   saying "0–12" was an arithmetic slip; the table is authoritative. No item or weight changed.
2. **S and F did not receive the phase-2 update.** They are one-shot baselines. Currentness is a
   within-P observation, not a cross-condition comparison. The P/P-minus design would have given a
   matched comparison; P-minus was not run.
3. **F is truncated.** Its plan was still being edited when the campaign stopped. It is labelled
   `TRUNCATED_BY_BUDGET`; no claim depends on it being complete.
4. **The principal used the web.** This is ordinary tool use, not a Palimpsest capability, and it
   confounds the finding's causal contribution.

## 8. Evidence map

- `research-evidence/cog3/scores.json` — per-item verdicts and quotes
- `research-evidence/cog3/capability-matrix.json` — the machine-readable composition matrix
- `research-evidence/cog3/runs/P1/` — run records, both plan snapshots, logs, seed
- `research-evidence/cog3/runs/S1/`, `runs/F1/` — baseline records and plans
- `research-evidence/cog3/runs/MECH1..3/` — the three labelled handoff probes
- `research-evidence/cog3/sessions/` — raw session streams and `manifest.json` digests
- `research-evidence/cog3/manifest.json` — every copied artifact with its SHA-256
