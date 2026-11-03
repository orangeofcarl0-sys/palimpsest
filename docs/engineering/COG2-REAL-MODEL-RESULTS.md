# COG-2 — Real Model Results

**Model:** `deepseek-official/deepseek-flash` (read from every session stream, not assumed).
**Runtime:** DSH `0.2.1-rc.3`, Node v24.22.0, one run at a time.
**Budget:** 13 of the planned 16 sessions; 44,125,402 total tokens; 20-minute cap per session.
**Records:** `research-evidence/cog2/scores.json`, `runs/`, `sessions/` (raw streams + digests).

No claim in this report is a statistical claim. Each condition was run once.

---

## 1. The matrix at a glance

| condition | what it is | tool calls | Palimpsest calls | wall clock | total tokens | plan | R1–R7 |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| A | strong file-native baseline | 102 | 0 | 702 s | 7,561,141 | 39,800 chars | PASS |
| B | Palimpsest installed, no ProjectIR | 50 | 0 | 309 s | 1,950,389 | 18,812 chars | PASS |
| C | project-ready, neutral task | 50 | **0** | 686 s | 4,043,331 | 33,165 chars | PASS |
| D | C + one task-shaped invitation | 92 | **7** | 579 s | 4,643,097 | 23,338 chars | PASS |
| CSEAM | C + the bounded launch seam | **35** | **3** | **304 s** | **1,058,488** | 23,031 chars | PASS |
| NEG | self-contained rewrite, no seam | 0 | 0 | 14 s | 10,835 | reply only | PASS |
| NEGSEAM | rewrite with the seam | 0 | 0 | 14 s | 10,971 | reply only | PASS |

Every plan was usable: six months, a month-by-month schedule, an arithmetic budget within £60,000,
and a rationale that distinguishes evidence from opinion. The strongest plans named the 2019
climate claim as stale, treated the 44% evening figure as a stated preference, and tested the
transport explanation only with transport actually provided.

**The task did not require Palimpsest.** A strong model with ordinary files reached the same
decision quality in every condition. That is a preserved finding, not a failure to be argued away.

---

## 2. What actually differed: selection

- **C made zero product calls in a valid, populated project.** The same task in D, with one
  sentence saying earlier work may be inspected, made seven.
- CSEAM, with the neutral task but the launch seam present, made three: `journal_entries`,
  `overview`, `open_loops`. It produced a shorter, complete plan in less than half the time and a
  quarter of the tokens of C.
- The model used the product for **the reason the product exists**: the plan says *"No Friday
  evening opening is proposed"* and gives the 2023 pilot and the 18:40 service as the reason.
- D's seven calls included `palimpsest_status`, `palimpsest_preview`, `palimpsest_manage` and
  `palimpsest_surfaces`, i.e. it inspected the surface as well as the knowledge. It did not make
  unnecessary Work, branch or promotion calls.

**B reproduced the COG-1 entry limitation.** With a Palimpsest installation but no ProjectIR, the
model made no initialization attempt and continued with the ordinary files. Its plan was still
good. The product was indistinguishable from a file workspace because it was never started.

---

## 3. The negative control: no unnecessary work

The self-contained rewrite task made **zero** tool calls and answered in the reply, both without
and with the seam (14 s, about 11k tokens). The product did not manufacture work for a task that
needed none. This is the correct behaviour the ruling asks to preserve.

---

## 4. Cognitive inheritance across processes

| condition | round 1 | round 2 (new process) | discovery | use |
| --- | --- | --- | --- | --- |
| P | 27 calls, 11 product, 5 journal entries recorded | 95 calls, **0 product** | **none** | none |
| P + seam | (same round 1) | 104 calls, **1 product** (`journal_entries`) | journal read | plan uses the 2023 numbers, 18:40 and the east-hall analysis |
| F | 11 file calls, notes appended | 77 calls, notes read | file read | plan says *"The Round 1 notes ... were used as a check"* |
| F + seam | n/a (file baseline) | (same) | (same) | (same) |

The Palimpsest journal was durable, correct and directly relevant. In the cold continuation without
the seam, **the later principal never opened it**. The plan was still good because the raw pack was
sufficient, so this is not a quality failure; it is a compounding failure at the discovery step.

The file baseline did not have that failure: `sources/PRIOR-NOTES.md` is one of the files the model
reads anyway. It was read, cited and used. In this sample the ordinary file was **more discoverable
and cheaper** (77 calls, 5.02M tokens, 828 s) than the product with the seam (104 calls, 8.63M
tokens, 769 s). The product was faster but not cheaper, and its plan was not better.

The launch seam fixed the discovery for both the single-round neutral task and the cold continuation.
That is a real behavioural change, not a citation count.

---

## 5. Collaboration and adaptation

**Cross-agent influence was not exercised.** The product's `plan` with `AUTO` chose **FOCUS** and
said why: there is no independent sovereign peer and a single principal locus is the baseline.
An explicit **PARALLEL** request was refused honestly with `CAPABILITY_REQUIRED`: *"reasoning.cell
is UNAVAILABLE ... reasoning branches capability is not available"*. No branch, cell or agent ran.
No source-to-recipient influence claim is made, and no scripted forwarding controller was used.

**Sequential adaptation worked.** Both P (with the seam) and F read the January update pack and
changed the plan correctly: the Friday late bus produced a bounded evening test ending before
21:15; the east hall was gated on the 28 February commissioning and used from March; the £4,000
family-fund cap produced 20–22 funded Saturdays and four unfunded ones; the website update changed
nothing.

**In-progress delivery was not available.** The isolated profile is `attention.activation: "none"`
(pull mode), and the one-shot principal delivers one launch turn and exits. No mid-run human event
or attention signal was delivered. The update pack arrived as a new process with a changed world,
which is a later turn, not continuous interaction. The stage did not build a Router, mailbox or
watchdog to manufacture the missing behaviour.

---

## 6. The bounded correction

| requirement | result |
| --- | --- |
| Original observed failure | C: 0 product calls with a populated journal; P round 2: 0 calls with 8 entries |
| Exact source path | `host/dsh/lib/runner.js` launch delivery; new `host/dsh/lib/project_hint.js` |
| Failing control | C and P round 2 above; the contract test failed before the module existed (5/5 RED) |
| Root-cause hypothesis | the capability is present but invisible at the principal's first move |
| Minimal implementation | one conditional sentence with the journal count; no title, body, kind, id or tool name |
| Positive control | CSEAM 0 → 3 calls; P2SEAM 0 → 1 call and the plan uses the finding |
| Negative control | NEGSEAM 0 calls, 14 s; no unnecessary work |
| Regression selection | the new 5-test contract and COG-1's surfaces; the authoritative suite later passed 21 files / 76 tests |
| Post-correction behaviour | selection changed; plan quality did not measurably improve |
| Cost/complexity | one extra read at launch; no store, owner, schema, authority or new service |

The correction is a presentation fix, not a new knowledge subsystem. It does not inject knowledge,
does not force a tool call, and changes nothing when the journal is empty, absent or unreadable.

---

## 7. What cannot be concluded

- No statistical superiority of any condition: one run each.
- No claim that Palimpsest improves decision quality on this task: every condition passed, and the
  file baseline was at least as good.
- No claim of autonomous collaboration: FOCUS was chosen correctly, PARALLEL was unavailable, and
  no second cognitive agent ran.
- No claim of continuous adaptation: no in-progress delivery was possible.
- No claim of blinded evaluation: one evaluator, same machine, same model family.
- The P round-2 record was overwritten by the seam re-test before copying; it is reconstructed from
  its preserved session stream and labelled as such. The raw stream is retained.
