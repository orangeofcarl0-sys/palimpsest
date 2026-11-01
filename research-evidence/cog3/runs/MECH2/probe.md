# Probe

I started a background research delegation asking whether the Northgate site can support scanning the nitrate collection with the Filmtek scanner, and under what conditions.
I am continuing with my own work while that research runs.

## The four grant conditions (from `sources/brief.md`)

1. At least two of the three priority collections must be fully digitised and published by 30 June 2026.
2. Any orphan works must have a completed rights risk assessment before publication.
3. Programme spend must stay within £84,000, and the application requires a line-item budget.
4. Nitrate film handling must follow the Partnership's conservation policy.

## Outcome of the delegation (step 1)

It did not produce an answer. `inspect` reports state `INTERRUPTED` with `conclusion: null`, and the
delivered notice gives the reason as a schema rejection — `externalEvidenceRefs[].evidenceId must be
a stable identifier` — so the branch could not be settled. A restart/crash left the branch open with no
job, and v1 does not auto-rerun. Re-issuing the identical task on the same basis commit returns the
same record rather than a fresh attempt, so I answered the question from the source files instead.

## My own answer, from the local sources

**Yes — but only in the inspection room, and the binding constraint is dwell time, not environment.**

- **Site.** Northgate is the only candidate. CRO's imaging suite is certified for paper only and is not
  certified for film (`sites.md`); Filmtek cannot operate inside the 4°C cold store (`vendors.md`); and
  MobileScan handles paper only. So scanning happens in the inspection room: 16 °C, 45% RH, fed by the
  pass-through hatch.
- **Environment is compliant, with thin margin.** Filmtek needs 15–20 °C and 40–50% RH; conservation
  requires 15–20 °C and below 50% RH. The room's 16 °C / 45% satisfies both, but 45% sits only five
  points under a hard ceiling — the same failure mode that stopped the 2024 CRO pilot at 62% RH with
  condensation on 14 frames. Continuous humidity logging and an abort threshold are conditions of use,
  not optional extras.
- **Throughput.** Policy allows nitrate out of the cold store in batches of up to 40 reels for at most
  30 minutes *including scanning time*. 240 reels is 6 batches and only ~3 hours at the ceiling — but
  40 reels in 30 minutes implies ≤45 seconds per reel. Unless Filmtek is measured at that speed, 40 is a
  ceiling and not a plan: batch size must be set as floor(30 min ÷ measured per-reel scan time), which at
  a realistic 10 minutes per reel means 3 reels per batch and 80 hatch cycles. **This is the decisive
  unknown and the one thing to measure before booking** — no source states Filmtek's scan speed.
- **No network.** Digitised files must be carried to CRO on encrypted drives, so a chain-of-custody and
  encryption procedure is a precondition, and the drive run happens after reels are back in the store so
  it does not eat the 30-minute window.
- **Cost.** £1,200/day with a two-week booking plus £1,800 transport each way: £20,400 if the fortnight
  is invoiced as 14 days, £15,600 if as 10 working days (~18–24% of the £84,000 award). The two-week
  booking is a fixed commitment, so the budget line item depends on which reading applies — worth
  confirming with Filmtek.
- **Separate gate, same collection.** B is orphan works, so the rights risk assessment (grant condition 2)
  must be complete before publication regardless of site capability. Site feasibility does not unblock
  publishing.

