# Procurement review

Planning date: **2026-11-05**. Basis: the accepted project revision at `3bf8da0006f9c1f72b057a1906afe4f0ba0942a1` (`acceptance.json`). This review records a planning position only; it makes no purchase and authorizes none.

## Site configurations

| Site | Configuration | Capacity and constraints | Cost |
|---|---|---|---:|
| North Ridge | Kestrel **K-900** | 880 kW at -22 °C against an 850 kW requirement and -18 °C design minimum; 900 mm wide; current IEC 61439 certificate to 2027-03-31. It is the only model meeting the cold rating and current-certificate requirement. | USD 268,000 |
| Harbor Flats | Kestrel **K-900** | 860 kW at +42 °C against a 620 kW requirement; 900 mm wide against the 1,250 mm corridor from HF-A-114; current IEC 61439 certificate to 2027-03-31. | USD 268,000 |
| **Total** | **K-900 at both sites** | Quoted unit price plus freight only. | **USD 536,000** |

The Harbor Flats selection changed because the dated **2026-11-06** correction lowers S-1080 there from 900 kW to **600 kW**, below the unchanged 620 kW requirement. H-1320 remains ineligible: its certificate is expected but not current, it is 1,320 mm wide against the 1,250 mm corridor, and its quote expired on 2026-09-30. With no compliant fallback, K-900 is now the only eligible model at either site.

## Changes from the previous package

| Item | Previous | Current | Change |
|---|---:|---:|---:|
| North Ridge cost | USD 268,000 | USD 268,000 | No change |
| Harbor Flats cost | USD 217,000 (S-1080) | USD 268,000 (K-900) | **+USD 51,000** |
| Total cost | USD 485,000 | USD 536,000 | **+USD 51,000 (+10.5%)** |
| Harbor Flats lead time | 9 weeks | 14 weeks | **+5 weeks** |
| Harbor Flats install start | 2027-01-07 | 2027-02-11 | **35 days later** |
| North Ridge install start | 2027-02-11 | 2027-02-11 | No change |

The cost increase is the difference between the S-1080 quote (USD 205,000 + USD 12,000 freight) and K-900 (USD 250,000 + USD 18,000 freight). The timing change follows the switch from S-1080's 9-week lead to K-900's 14-week lead. Both sites now plan to start installation on 2027-02-11 from the common 2026-11-05 planning date; commissioning dates remain placeholders because the sources do not supply a separate installation or commissioning duration.

## Decisions still requiring approval

1. **Configuration and budget:** approve K-900 at both sites and the revised total of USD 536,000.
2. **Pricing:** revalidate the K-900 quote before order. It expires on 2026-12-31, before the planned 2027-02-11 install starts.
3. **Harbor Flats corridor:** confirm that no later field survey under `updates/` supersedes the 1,250 mm figure from HF-A-114 (2024).
4. **Technical compliance:** confirm the K-900 certificate remains current through commissioning (valid to 2027-03-31) and that its 880 kW rating is valid at North Ridge's 2,400 m altitude.
5. **Purchase authority:** approve any purchase separately. No purchase is authorized by this review.

Sources: `acceptance.json`; `sources/sites.md`; `sources/capacity.csv`; `sources/vendors.md`; `sources/quotes.csv`; `sources/leads.csv`; `updates/2026-11-06/hf-capacity-correction.csv`; prior package in `4cf360d`.

<!-- data:start -->
```json
{
  "north": "K-900",
  "harbor": "K-900",
  "previousTotalUsd": 485000,
  "totalUsd": 536000,
  "previousHarborLeadWeeks": 9,
  "harborLeadWeeks": 14,
  "approvedHead": "3bf8da0006f9c1f72b057a1906afe4f0ba0942a1",
  "pendingApprovals": [
    "Approve K-900 at both sites and the revised total of USD 536,000.",
    "Revalidate the K-900 quote, which expires on 2026-12-31, before the planned 2027-02-11 install starts.",
    "Confirm that no later Harbor Flats survey supersedes the 1,250 mm corridor from HF-A-114 (2024).",
    "Confirm the K-900 certificate remains current through commissioning and that its 880 kW rating is valid at North Ridge's 2,400 m altitude.",
    "Authorize any purchase separately; no purchase is authorized by this review."
  ]
}
```
<!-- data:end -->
