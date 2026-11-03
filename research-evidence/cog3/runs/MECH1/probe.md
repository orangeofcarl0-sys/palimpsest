# Probe

I started a research delegation asking whether the Northgate site can support scanning the nitrate collection with the Filmtek scanner, and under what conditions.

I am continuing with my own work while that research runs in the background.

## The four grant conditions (from `sources/brief.md`)

1. At least two of the three priority collections must be fully digitised and published by 30 June 2026.
2. Any orphan works must have a completed rights risk assessment before publication.
3. Programme spend must stay within £84,000, and the application requires a line-item budget.
4. Nitrate film handling must follow the Partnership's conservation policy.

## The delegated result

The delegation returned **undetermined**: zero accepted claims in the frontier, and on its account no
Northgate site specifications or Filmtek scanner requirements, so it could not establish support or
state conditions.

That is true of the frontier and misleading about the project. `sources/sites.md` and
`sources/vendors.md` are both tracked at `ba4c73c` — the delegation's own basis commit. The branch
reported on the *admitted* state of the reasoning cell, which is empty, rather than reading the
documents in the tree it was pinned to. So "undetermined on the supplied basis" records an absence of
accepted claims, not an absence of information. Standing is correctly non-evidentiary either way; the
substantive answer below is my own reading, not the branch's, and carries no greater standing than
that.

## Answer from the source documents

**Yes, conditionally — and only in the inspection room, never in the cold store.**

The constraint is a two-sided envelope that only one room in the Partnership satisfies:

| Requirement | Source | Inspection room | Cold store |
|---|---|---|---|
| Filmtek operating range 15–20°C, 40–50% RH | `vendors.md` | 16°C, 45% RH ✓ | 4°C ✗ (cannot operate) |
| Film scanner at 15–20°C and below 50% RH | `condition.md` | ✓ | ✗ |
| Nitrate storage, licensed | `sites.md` | — | ✓ |

Conditions:

1. **Scan in the inspection room.** 16°C / 45% RH sits inside Filmtek's range and inside the
   conservation policy's sub-50% ceiling. The cold store is licensed for nitrate but is a scanning
   non-starter at 4°C.
2. **Use the pass-through hatch, not acclimatisation.** `condition.md` states the hatch removes the
   need for acclimatisation — that is what makes a 30-minute window workable at all.
3. **Batches of at most 40 reels, at most 30 minutes, including scanning time.** 240 reels is
   therefore a floor of six batches, each a closed cold-store-to-cold-store cycle.
4. **Continuous humidity logging with a written stop rule.** The 2024 CRO pilot failed at 62% RH with
   condensation on 14 frames; the inspection room has only five points of headroom below the 50%
   ceiling. The binding risk variable is humidity, and the trigger is door and hatch traffic.
5. **Files leave on encrypted drives.** Northgate has no network, so publication happens at CRO and
   the transfer is a scheduled step, not an afterthought, against the 30 June deadline.
6. **Budget as line items**: £1,200/day, £1,800 transport each way, two-week booking block.

## What is still missing

Per-reel scan time. Without it the batch count is fixed at six but throughput per 30-minute window
cannot be sized, and that number decides whether the two-week booking block is comfortable or
impossible. It is not in the pack; it is a question for Filmtek.

Separately, the grant needs two of three collections finished. Collection C is gated on estate
permission the solicitor expects no earlier than autumn 2026, so the realistic pair is A + B — which
puts B's per-reel rights assessment (about three weeks of staff time each) on the critical path
alongside the scanning window.
