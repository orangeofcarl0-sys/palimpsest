# PAL-FED-0G — G10-A0 Evidence Input Memo

Status: EXPERIMENTAL evidence input. Do not implement G10 from this.
Labels: **[machine]** / **[observed]** / **[stat]** / **[unsupported]** / **[rejected]**.

| Candidate principle | Status | Basis |
|---|---|---|
| PersistentPoint precedes collaboration | **[observed]** | Persistent peers existed independently; relations formed only at runtime. |
| PeerRef != runtime identity | **[machine]** | Unchanged from 0D; peers created/resumed as runtime carriers under a stable `PeerRef`. |
| UserFocus != AuthorityRoot | **[machine]** | No hierarchy in the protocol; 0G symmetry probe (O focal): local case 0/1 contact, authority case 1/1 contact in every arm. |
| Runtime relation can emerge | **[observed]** | No predefined edge; relations formed on contact only; delivery 98%. |
| Local WorkGraph remains local | **[machine]**+**[observed]** | No task/plan sync; mean 1.05 events/run; max 6.7 KB. |
| Attention != Collaboration | **[machine]** | Wake ≠ ack; ack alone advances cursors. |
| Local evidence should precede peer contact | **[stat]** | Inspection 100% in all classes/arms; premature contact 0%. |
| EvidenceExists != EvidenceSufficient | **[stat, partially]** | P specificity rose 67%→100% under G1/G2 (owners not contacted when the pinned artifact sufficed), showing the distinction is actionable for *version-scoped* claims. |
| Ownership != automatic contact need | **[stat]** | Replicated: 0/6 pinned-contract contacts under G1/G2 (was 2/6 under G0). |
| Pinned contract can eliminate contact need | **[stat]** | Same evidence; `P-pinned-*` 0 contact across G1/G2. |
| Freshness is decision-relative | **[unsupported / untested]** | F recall was 100% in **all** arms including G0; the scenario prompts named the temporal frame, so no arm was stressed. Not evidence against, but not established. |
| Implementation knowledge != commitment authority | **[unsupported / untested]** | U recall 100% in all arms including G0 — ceiling effect; the distinction was not exercised. |
| Peer contact may be an epistemic dependency | **[observed]** | F/U contacts state current/future facts/commitments. |
| Peer contact may be an authority dependency | **[observed]** | U contacts request commitments; peers answered independently. |
| Qualified sufficiency reduces over-localization | **[rejected in this design]** | G2 == G1 exactly on every dimension (recovery metrics 0.00); F/U saturated at 100% and C was unaffected. Underpowered rather than disproven. |
| Conflict/provenance resolution needs the owner | **[unsupported]** | `C-behavior-conflict` contacted 0/9 in every arm: agents resolved document conflicts locally. This is the open semantic gap. |

## Protocol-object evidence

- **BoundaryContract** — touched 14%, agreed 2% (0E 59%/0%; 0F 0%/0%).
  Third study at/near zero. **Recommendation (§72):** do not promote
  `BoundaryContract` as a fundamental persistent-peer primitive; keep it as an
  optional higher-level mechanism.
- **Event taxonomy** — `constraint`, `change_ready`, `blocker` unused for a
  **third** study. **Recommendation (§73):** collapse the strong 8-kind taxonomy
  in future design; the useful distinction appears to be
  question/decision/evidence/need, with artifact refs doing more work than the
  speech-act label.
- **Thread** — 52% usage, always as a derived read view. **Recommendation
  (§74):** retain as `Thread = View(CollaborationEvents)`, not foundational state.
- **Pending batch + ack** — delivery 98%, ack 70%, pending-after-idle 24%:
  acceptable; **no ack guard** (§52).
- **Wake/polling** — change→wake 953 ms, wake→inbox 924 ms; **2 s polling
  adequate**, no new Ordarium primitive (§75).

## Recommended G10-A0 treatment

- **Carry forward (Level A/B):** inspect local authoritative evidence first;
  `ownership != automatic contact need`; a pinned artifact settles that exact
  frozen version; pending-batch + ack; DSH-native wake; agent-scoped peer
  authority.
- **Do not promote:** the G2 qualified-sufficiency wording (no measurable
  effect in this design); the 8-kind taxonomy; the `BoundaryContract` schema.
- **Open problem for structured semantics (not prose):** conflict/provenance
  resolution — the only class where every arm failed. Candidate future
  directions (§66): explicit source temporal scope, authority ownership, and
  contract scope as *structured context* rather than prompt text.
- **Methodology note for future recall claims:** F/U recall here was
  prompt-salience-dependent (100% even in G0). Any future claim about freshness
  or authority recall must use scenarios where the baseline arm genuinely fails.
