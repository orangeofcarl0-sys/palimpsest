# COG-6 — Fresh-Session Continuity Results

**Question:** can a genuinely new DSH Session recover the accepted changes, the negative findings,
the unfinished objectives and the pending work without replaying the earlier Principal's conversation?

**Answer: NOT EXERCISED — BLOCKED.** No model session was started, so no fresh Principal attempted the
recovery. The durable state a future session would inherit is present and is recorded here.

**Gate C6-G6: BLOCKED.**
**Hypothesis H6-F: NOT EXERCISED.**

---

## 1. The durable state at the final deterministic head

| item | value |
| --- | --- |
| accepted intake head | `55370b0f5bd7740aba4dcbe3074fb6b545443f61` |
| accepted vendor blob | `0e997cbcc04ac1ee4c9b8d2985e2dd97443136d0f57b838f01d25de2403f920c` (equals candidate A) |
| rework result | `7be38267ca994b1529e08e2ad77ebd23e845bc38` at base `55370b0f…` |
| final accepted head | `22796231660d7915c561a34445aecbd7f1900159` |
| ProjectIR revision | 6 |
| task states | `technical-fit` SATISFIED, `cost-schedule` SATISFIED, `technical-refresh` SATISFIED, `intake-vendor-2026-02-10` SATISFIED |
| current-basis deliverable | `deliverables/technical-refresh.md` — "No compliant vendor exists for Site B… not a completed procurement" |
| Journal | `NEGATIVE_RESULT` (2023 V2 trial), `OPEN_QUESTION` (Solaris certificate not on file), `OPPORTUNITY` (switch Site B to V2) resolved **DISMISSED** |
| goal / requirements | unchanged; Site B still requires `-4 °C` and a coastal warranty |
| control residue | live head `caa543441c45…` intentionally ahead of the project head; `post-control` READY, no attempt |

The live head is ahead because the final control committed candidate B directly, bypassing Work and
Promotion. The project head, the proven effect head and every accepted artifact remain at
`22796231660d`; the direct commit granted no authority. A new session must not adopt the live head as
project truth.

---

## 2. What the next session must recover

A future P3 would be a **new session in a separate DSH home** (so the P1 transcript is absent) with
the same deployment state. It should:

1. identify the accepted source basis (`22796231660d`) and the accepted intake (`0e997cbc…`);
2. read the negative finding in `deliverables/technical-refresh.md` and understand that the
   procurement objective is not achieved;
3. see that Site B's requirement was **not** relaxed;
4. see the Solaris certificate as an unverified open question, not a fact;
5. see the V2 proposal as **DISMISSED**, not as approved work;
6. distinguish the accepted intake from the candidate B delivery and the duplicate;
7. propose a justified next action (seek a coastal-rated vendor/qualification, obtain a real
   certificate, or ask the programme lead for an authorised requirement decision).

The state supports all seven. No model has been observed doing it.

---

## 3. The negative control

The state contains a rejected proposal: the Journal `OPPORTUNITY` "Switch Site B to V2 to reduce
cost" is resolved `DISMISSED` with the reason that V2 has no coastal warranty. A future Agent must not
interpret it as approved work. The state also contains an unresolved `OPEN_QUESTION` about the Solaris
certificate; a future Agent must not silently convert the promise into accepted fact.

These controls are present but **not exercised**.

---

## 4. What is not claimed

- No new DSH session was created.
- No Agent read the accepted state.
- No transcript isolation was exercised.
- No cross-owner or cross-session cooperation was exercised.
- A future session's recovery accuracy, token cost and failure modes are unknown.
