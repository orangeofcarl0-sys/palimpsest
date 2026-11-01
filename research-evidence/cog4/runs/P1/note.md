# Continuation note — Sablewick Community Energy

## Prior work

The programme goal is to select a compliant battery vendor for each of the three sites and produce a schedule and budget envelope within the £120,000 grant. Project state is at revision 1, with promoted head `95b395b`.

Two work products were planned as independent deliverables:

- **Cost and schedule — delivered and promoted.** `deliverables/cost-schedule.md` (commit `fcc1998`) was promoted as `promotion-09839e1c4ec5124fa819bace5a8ca836` by `attempt-baaf963c5b6bd004409fcfe013219440`. It records a per-site range of £25,800–£36,200, a sequence of A in January–February, B in March–April and C in May–June, a 10-week longest lead time, and a total of £83,592–£117,288 including 8% contingency.
- **Technical fit — attempted, not promoted.** `attempt-d16532bd0851cae20310d8e0ad0fb9f4` committed `4f0eec5` in the isolated worktree `.palimpsest/worlds/attempt-d16532bd0851cae20310d8e0ad0fb9f4/`, selecting A = V1, B = V3 and C = V3. That file never reached the main tree: `deliverables/technical-fit.md` does not exist. The attempt is recorded COMPLETED, no promotion exists for it, and the task is READY again (last event 28). The visible state does not record why it was not promoted. Its worktree is based on seed `5f6002d`, before the source revision described below.

The journal records three facts that remain relevant: the 2023 Marsh Lane V2 trial failed at -8 °C, so V2 must not be specified where the design minimum is below -5 °C; Solaris's cold-weather certificate for the V3 LTO unit is promised but not on file and must be treated as unverified; and the grant conditions include a local installer, no fossil-fuel backup, a coastal-rated warranty at Site B, an 800 mm width limit at Site C, at least 8% contingency and completion by 30 June 2026.

After the promoted head, two commits landed on `master`:

- `31cfc25` (dated 2026-02-10) revised the Solaris V3 minimum operating temperature from **-10 °C to 0 °C** in `sources/vendor-capabilities.csv`.
- `9972619` (dated 2026-02-12) revised only `sources/newsletter.md`; it has no technical or financial bearing.

The repository is therefore ahead of the project head: `95b395b` does not include either source commit. The substantive source revision is not in project state, and the only technical-fit selection predates it.

## Current status

**The V3 revision invalidates the Site B selection.** Applying the current capability and pricing tables:

| Site | Binding constraints | Vendors that comply today | Prior choice | Status |
| --- | --- | --- | --- | --- |
| A — Marsh Lane | Design minimum -12 °C | V1 (-20 °C; £32,500; 6 weeks), V4 (-20 °C; £30,100; 8 weeks). V2 fails (-5 °C) and is barred by the 2023 trial; V3 fails (0 °C). | V1 | Still valid. V1 has the longer warranty (10 vs 5 years) for £2,400 more. |
| B — Harbour Workshop | Design minimum -4 °C **and** coastal-rated warranty | **None.** V1, V2 and V4 meet the temperature requirement but have no coastal warranty; V3 has the coastal warranty but is rated only to 0 °C, above the -4 °C design minimum. | V3 | **Invalid.** Hard compliance blocker. |
| C — School Annexe | Ambient minimum 2 °C and width ≤800 mm | V2 (650 mm; -5 °C; £25,800; 4 weeks; 8-year warranty), V3 (750 mm; 0 °C; £36,200; 10 weeks; 12-year warranty). V1 (900 mm) and V4 (850 mm) fail the width limit. | V3 | Still valid, but not uniquely determined: V2 also complies and is £10,400 cheaper. |

The 2023 trial rule bars V2 only where the design minimum is below -5 °C, so it does not independently exclude V2 at B (-4 °C) or C (2 °C); at B, V2 still fails the coastal warranty. V3 remains valid at C because its 0 °C minimum is below C's 2 °C ambient minimum.

Site B is the material change. The grant makes the coastal warranty mandatory, and the site makes -4 °C mandatory; no vendor in the current set satisfies both. The Solaris certificate is the only possible route back to V3 at B, and only if it documents operation at -4 °C or below; the current datasheet says 0 °C, so the certificate cannot be assumed to restore the selection. The certificate does not help Site A, where V3 fails on temperature, and it is not needed at Site C, where the 0 °C rating already covers a 2 °C minimum.

The technical-fit work product is unresolved in the main tree. There is no `deliverables/technical-fit.md`; the only selection that exists is the stale worktree artifact. Re-running the task against current sources would yield A = V1 (or V4), B = no compliant vendor, and C = V2 or V3. Two of the three prior selections survive; B does not.

The promoted cost schedule is arithmetically consistent but is not a committed envelope. Its per-site £25,800 low is V2 at every site, and V2 is ineligible at A and B. Its £36,200 high is V3 at every site, and V3 is ineligible at A and B after the revision. The £83,592–£117,288 total is therefore a vendor-price span, not a feasible combination, and the 8% contingency cannot be fixed until B has a compliant unit. On the sites that can be settled now:

| Feasible partial selection | Known committed cost (A + C) | Maximum B all-in cost that still leaves 8% contingency within £120,000 |
| --- | --- | --- |
| A = V1, C = V2 | £58,300 | about £52,800 |
| A = V1, C = V3 | £68,700 | about £42,400 |

The pre-contingency ceiling is £120,000 ÷ 1.08 ≈ £111,111. Budget headroom therefore exists for a coastal-rated B unit; the blocker is compliance, not affordability.

The schedule is also out of date relative to the latest recorded programme update, 12 February 2026:

- **Site A** cannot meet its 5 January–27 February window on the evidence in the repository. No order is recorded, the A selection was never promoted, and a V1 order placed on 12 February (6-week lead) would arrive around 26 March; V4 would arrive around 9 April. The grant's 30 June finish is not breached by this alone, but the stated A window is.
- **Site B** could not be ready for its 2 March opening under any vendor on the current record; the late-December 2025 order date for a 10-week lead (22 December) has passed. The window itself runs to 24 April, so a unit ordered promptly could still be installed inside it: V1 would arrive around 26 March and V4 around 9 April, but neither has a coastal warranty, so either would need the variance described below. V3, if the certificate restored its eligibility, would arrive around 23 April, one day before the window closes.
- **Site C** is the only site whose order-before-window rule is still achievable. To be on site for the 4 May opening, V3 must be ordered by about 23 February (10-week lead) and V2 by about 6 April (4-week lead). The C window ends 26 June, only four days before the grant deadline, so there is almost no recovery slack.

The Solaris certificate remains an open question. The newsletter commit has no bearing and should not be allowed to distract from the above.

## Next action

I would not place an order or treat the promoted budget as committed. The immediate critical path is to resolve Site B and to protect Site C's lead time; the detailed sequence is:

1. **Reconcile the project head, then re-run technical-fit against current sources.** The project head must move from `95b395b` to the current repository HEAD before a new governed attempt; this is mechanical reconciliation, not a promotion. The new attempt should record A = V1, C = V2 or V3, and B = unresolved. It should not force a non-compliant B vendor into the table to make the deliverable look complete. This is needed because the only existing selection predates the 10 February revision and was never promoted.

2. **Escalate Site B to the programme board and the funder.** The specific questions are: (a) does Solaris's cold-weather certificate cover operation at -4 °C despite the revised 0 °C datasheet, or is the claim withdrawn? and (b) will the funder grant a variance to grant condition 3, or approve procurement of a coastal-rated unit outside the current four-vendor set? A variance would still need a technical solution for flood exposure, such as a non-coastal V1/V4 unit with enhanced protection; it is not a decision I can take. This is an external approval and commitment, so I am describing it rather than starting it.

3. **Protect Site C in parallel, because it is independent of B.** Choose between V3 (the prior selection, 12-year warranty, £36,200, order by about 23 February) and V2 (£25,800, 8-year warranty, order by about 6 April), and seek approval to order before the relevant cutoff. Waiting for B would consume C's lead time and put the 26 June window at risk. Placing the order is a financial commitment and needs approval.

4. **Re-baseline Sites A and B with the board.** A's January–February window is no longer achievable and needs a revised installation date that still finishes by 30 June 2026; B's order-before-window date has passed and needs either a compliant unit quickly or a revised plan. The dates should be changed explicitly, not silently, and the funder should be told if the 30 June finish is at risk.

5. **Reissue the cost schedule only after B is resolved.** Replace the all-vendor range with one committed selection per site, recompute the 8% contingency on that committed total, and confirm the result is within £120,000. The brief requires the technical and cost products to be combined before any order is placed; the current cost schedule cannot serve as that combined product.

The order above follows the dependencies: B is a compliance blocker that analysis cannot solve; C has the nearest irreversible lead-time deadline; A and B need an approval to re-baseline; and the cost schedule is only meaningful once every site has a compliant selection.
