# C6-R — Fresh-Session Continuity Results

**Question:** after the authorized T1 evolution, can a genuinely new DSH Session recover the accepted
basis, the prior negative finding, the unresolved objective, the still-unaccepted Candidate B, the
rejected proposal and a justified next action — without the old transcript?

**Answer: NOT EXERCISED — BLOCKED.** No T1 evolution occurred, because no model proposal and no
operator effect occurred. No P3 or F2 session was created.

**Gate R6: BLOCKED.**
**Hypothesis H6-F: NOT EXERCISED.**

---

## 1. The T2 mechanism that is ready

`scripts/c6r/staging.mjs` implements `releaseInboxAsOf`. At T2 (`2026-02-14T09:10:00Z`) it:

- adds exactly the corrected Candidate B and the duplicate delivery of A;
- verifies every copied SHA-256;
- preserves the T1 files byte-for-byte;
- refuses a backwards observation time, a non-materialized inbox, a changed existing event and a
  duplicate arrival identity;
- detects a future event leak rather than assuming it absent;
- separates the simulated `observationTime` from the real `releasedAt`.

The T1/T2 visibility regressions (15 tests) pass. The P1 host's T1 inbox read returned exactly three
records, with no `2026-02-14/` directory.

## 2. The durable state a new session would inherit (from COG-6)

The inherited deterministic state remains available as a reference, not as a C6-R result:

| item | value |
| --- | --- |
| accepted intake head | `55370b0f5bd7740aba4dcbe3074fb6b545443f61` |
| accepted blob | `0e997cbcc04ac1ee4c9b8d2985e2dd97443136d0f57b838f01d25de2403f920c` (Candidate A) |
| final project head | `22796231660d7915c561a34445aecbd7f1900159` |
| final live control head | `caa543441c4510941e0f228c6991616f75fb3557` (Candidate B, deliberately ahead) |
| negative deliverable | "No compliant vendor exists for Site B … not a completed procurement." |
| requirements | unchanged; Site B `-4 °C` and coastal |

A P3 session in a **new DSH home** would start with the T2 inbox and the same durable project state
(if a T1 evolution had been executed). It must not adopt the direct-control head as project truth.

## 3. What a future session must show

1. the accepted source basis and the accepted intake;
2. the prior negative finding and the still-unmet objective;
3. that the requirement was not relaxed;
4. the certificate as an unverified open question, not a fact;
5. the dismissed V2 proposal as dismissed, not approved work;
6. the accepted intake as distinct from Candidate B and the duplicate;
7. a justified next action, without treating the unapproved correction as canonical.

## 4. What is not claimed

- No new session was created.
- No transcript isolation was exercised.
- No Agent recovery accuracy, cost or failure mode was observed.
- Cross-owner collaboration was not exercised; a new session is not a new owner.
