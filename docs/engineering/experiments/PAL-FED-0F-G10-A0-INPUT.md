# PAL-FED-0F — G10-A0 Evidence Input Memo

Status: EXPERIMENTAL evidence input. Do not implement G10 from this.
Labels: **[machine]** / **[observed]** / **[stat]** statistically supported by
0F / **[rejected]** / **[speculative]**.

| Candidate principle | Status | Basis |
|---|---|---|
| PersistentPoint precedes collaboration | **[observed]** | Persistent peers existed independently and formed relations at runtime; no predefined graph or planner. |
| UserFocus != AuthorityRoot | **[machine]** | No hierarchy in the protocol; 0F symmetry probe: focal peer swapped (O focal) with R 4/4 contact, L 0/4 — no Palimpsest-asks-Ordarium role asymmetry. |
| PeerRef != DSH runtime identity | **[machine]** | Unchanged from 0D; peers resumed/created as runtime carriers under a stable `PeerRef`. |
| Runtime collaboration can create graph edges | **[observed]** | Relations formed only when the focal contacted; no edge existed beforehand; delivery 100%. |
| Local WorkGraph remains local | **[machine]**+**[observed]** | No task/plan sync exists; 0F messages stayed small (mean 0.74 events/run; max 7.6 KB). |
| Attention plane != collaboration plane | **[machine]** | Wake ≠ ack; ack alone advances cursors (0D A03/A05; 0F pending-after-idle 8%). |
| Local evidence should precede peer contact | **[stat] supported** | Agents inspected local evidence before contact in 100% of runs in both arms; premature contact 0%. |
| Ownership != automatic contact requirement | **[stat] supported** | P (pinned-contract-sufficient) contact fell to 0% under F1 while R remained 56%; the owner was not contacted when the pinned artifact answered the question (P specificity 100%). |
| Pinned authoritative contract may eliminate contact need | **[stat] supported** | P scenarios: 0/9 contact under F1 (was 2/9 under F0). |
| Peer contact is justified by missing peer-owned load-bearing knowledge/authority | **[speculative / partially supported]** | F1 gained specificity (78%→100%) but lost recall (100%→56%), missing authority/intent questions. The *distinction* is real; the current *sufficiency clause* cannot separate "no local evidence" from "local evidence that cannot settle peer authority". Needs freshness/authority semantics. |
| Capability to inspect local state > explicit contact policy | **[rejected]** | F0 inspected in 100% of runs yet still over-contacted (L/P 22%); inspection alone did not produce selectivity. |
| Contact has low perceived cost / peer availability biases action | **[speculative]** | F0's unnecessary contacts (L/P 22%) occurred after full inspection, consistent with low perceived cost; not directly manipulated in 0F. |

## Behavior of PAL-FED protocol objects (0F evidence)

- **Pending batch + ack:** delivery 100%; ack 85%; pending-after-idle 8% — the
  explicit-ack protocol prevented loss and was *usually* respected once agents
  did realistic work. The 0E ack alarm (24%) was largely a thin-host artifact.
  **Do not add automatic ack; a turn-stopping guard is now weakly justified.**
- **BoundaryContract:** spontaneously touched in **0%** of contacted runs
  (0E: 59%). Strongest evidence yet **against** promoting the current contract
  schema/ceremony. Level C → candidate Level D.
- **Thread (derived view):** used in 27% of contacted runs (0E: 86%). Retain as
  a derived view; not load-bearing.
- **Event taxonomy:** 5 of 8 kinds used (decision 19, question 17, evidence 11,
  proposal 3, need 2; `constraint`/`change_ready`/`blocker` unused). Candidate to
  collapse; do not promote the 8-kind union.
- **Wake latency / polling:** change→wake ≈0.9 s, wake→inbox ≈1.1 s,
  change→response ≈59 s. 2 s polling adequate; no Ordarium primitive justified.

## Recommended G10-A0 treatment

- **Promote the principle (Level A candidate):** inspect local authoritative
  evidence first; contact only for missing peer-owned load-bearing
  knowledge/authority; `ownership != automatic contact requirement`.
- **Do not promote the exact wording:** the current criterion trades recall for
  specificity; it needs explicit freshness/authority semantics before it can be
  a rule.
- **Carry forward as mechanically useful (Level B):** pending-batch + ack,
  DSH-native wake, agent-scoped peer authority, read-only local inspection.
- **Demote:** `BoundaryContract` schema and 8-kind taxonomy (Level C→D
  candidates); `Thread` stays a derived view.
