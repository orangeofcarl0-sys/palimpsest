# PAL-FED-0E — G10-A0 Evidence Input Memo

Status: EXPERIMENTAL evidence input. **Do not implement G10 from this.**
Evidence labels: **[machine]** proven by 0/0D machine tests; **[observed]**
behaviorally observed; **[stat]** statistically supported by 0E (with its stated
limits); **[speculative]** not established.

| Candidate G10-A0 input | Status | Basis |
|---|---|---|
| PersistentPoint precedes collaboration | **[observed]** | Two persistent peers existed independently and then formed a relation at runtime; the study did not manipulate the ordering, but nothing had to predefine a graph. |
| UserFocus != AuthorityRoot | **[machine]** | No hierarchy exists in the protocol; wake/response were symmetric in the mechanism (0D A04, 0E symmetry probe). No experiment directly tested user-focus bias. |
| PeerRef != DSH Agent/Session identity | **[machine]** | FED-DSH-A02: persistent author = configured `PeerRef`, runtime identity separate; resume keeps the peer. |
| Contact follows owned-boundary dependency | **[speculative — currently unsupported]** | 0E: clear-dependency contact 100% C0 vs 100% C1 (criterion adds nothing), and local-decision contact 50–67% (contact without dependency). Dependency is not yet a discriminating cause under the tested conditions. |
| Runtime collaboration can create graph edges | **[observed]** | Relations (threads, contracts, replies) formed at runtime with no predefined edge and no central planner; 90% reply delivery. |
| Attention plane != collaboration plane | **[machine]** | Wake is an inbox notice; only `collab_ack` advances the durable cursor (0D A03/A05, 0E: 0 wake-derived state changes). |
| Local WorkGraph remains local | **[machine]** + weak **[observed]** | No task/plan synchronization exists in the protocol; 0E saw no full-plan dumps (max event ≈3.7 KB), though 21/36 runs had >2 KB messages. |
| Conversation != Agreement | **[machine]** + **[observed]** | Contract state is separate from messages (0/0D machine); 0E: 59% of contacted runs touched a contract but **0%** reached `agreed`. |
| DSH owns cognition/runtime lifecycle | **[machine]** | FED-DSH-A00/A01/A02: real registry, session, loop, scoped tools, disposal. |
| Palimpsest owns collaboration semantics | **[machine]** | Plugin/service holds peer/event/contract/inbox policy; DSH and Ordarium unchanged. |
| Ordarium owns deterministic durable mechanics | **[machine]** | CAS, revisions, ordered observation via public APIs; frozen 1.3.1. |

## What 0E adds beyond 0D

- **[stat] Mechanism reliability:** pending-batch + ack preserved delivery
  (receipt 100%, response 93%, delivery 90%) across 36 runs.
- **[stat] Wake adequacy:** change→wake ≈1.0 s, wake→inbox ≈1.1 s; 2 s polling is
  adequate; no new Ordarium primitive justified.
- **[stat] Ack gap:** explicit ack is frequently omitted (24% ack, 72% pending
  after idle) → candidate **turn-stopping pending-batch guard** (not implemented).
- **[stat] Taxonomy erosion:** only 5 of 8 event kinds were ever used
  (`decision` dominant; `constraint`/`change_ready`/`evidence` unused).
- **[stat] Contract ceremony mismatch:** commonly touched, never bilaterally
  agreed in 29 contacted runs.
- **[stat] Selectivity defect:** substantial unnecessary contact for local
  decisions in both arms.

## Recommended G10-A0 treatment

- **Carry forward as evidence (not invariant):** the dependency-criterion idea —
  to be re-tested after removing the ambient-guidance confound and the "record"
  prompt cue, and after giving agents read access to the owned interface.
- **Carry forward as mechanically useful:** pending-batch + ack, DSH-native wake,
  agent-scoped peer authority.
- **Carry forward as promising-but-unproven:** `BoundaryContract` (schema and
  acceptance ceremony), `Thread` (derived view), event-kind taxonomy.
- **Do not promote:** the current §41 wording as a sufficient selectivity rule;
  the full 8-kind union; contract acceptance as a default step.
