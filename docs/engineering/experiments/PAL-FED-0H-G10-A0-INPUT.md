# PAL-FED-0H — G10-A0 Evidence Input Memo

Status: EXPERIMENTAL evidence input. Do not implement G10 from this.
Labels: [machine] / [observed] / [stat] / [unsupported] / [rejected].

| Candidate principle | Status | Basis |
|---|---|---|
| PersistentPoint precedes collaboration | [observed] | Persistent peers existed independently; relations formed only on contact. |
| UserFocus != AuthorityRoot | [machine] | No hierarchy in the protocol; 0H symmetry is direction-symmetric. |
| PeerRef != runtime identity | [machine] | Unchanged from 0D. |
| Runtime collaboration can create relations | [observed] | Relations formed only on contact; delivery 100% when contacted. |
| Local evidence precedes peer contact | [stat] | Repo inspection in every run; no premature escalation. |
| Ownership != automatic contact need | [stat] | V/L 100% no-contact in all arms. |
| Pinned version contract can settle local decisions | [stat] | V and N specificity 100%. |
| Evidence conflict != automatic peer contact | [stat] | L specificity 100% in all arms. |
| Version/temporal scope can locally adjudicate conflict | [stat] | V specificity 100% in all arms. |
| Local normative precedence can locally adjudicate conflict | [stat] | L specificity 100% in all arms. |
| Irreducible peer-owned conflict may justify contact | [unsupported] | I recall ≤33% (H0), 0% under guidance; silent collapse 67–100%. |
| Structured provenance metadata adds value | [rejected] | H2−H1: I recall lift 0.00, adjudication lift −0.17, specificity retention 0.00. |
| Unresolved source authority acts as an action gate | [rejected] | Agents silently collapse irreducible conflicts; one invented a supersession basis the fixture contradicts. |

## Protocol-object decisions (four studies)

- **BoundaryContract:** touched/agreed — 0E 59%/0%, 0F 0%/0%, 0G 14%/2%,
  0H 0%/0%. Formally **not part of a Minimal Persistent Peer Core**; keep as an
  optional higher-level capability.
- **Event taxonomy:** `constraint` / `change_ready` / `blocker` unused across
  four studies. Do not inherit the 8-kind union; prefer one generic immutable
  boundary event plus an optional lightweight kind and provenance refs.
- **Thread:** always a derived convenience view; never canonical.
- **Polling / Ordarium:** 2 s adequate; no new wake primitive. Closed.

## Recommended G10-A0 treatment

- Carry forward: inspect local evidence first; `ownership != contact need`;
  a pinned contract settles version-scoped questions; local scope/supersession
  and legitimate precedence resolve apparent conflicts; pending-batch + ack;
  DSH-native wake; agent-scoped peer authority.
- Do not promote: structured provenance metadata; the 8-kind taxonomy;
  `BoundaryContract` as core.
- Open structural problem (not prose): **unresolved source authority is not an
  action gate.** Candidate mechanisms (none implemented here): deterministic
  conflict gate, authority registry, source precedence service, verification
  policy.
