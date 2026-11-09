# Procurement review

Planning date: **2026-11-05**. Accepted basis: HEAD `caaeb4f1fa8f01681019ba38894dbab43db3222f` (promoted candidate `8e8af7cc510f471e7a0b75ea6d878217307ace93`). This is a review for approval, not a purchase authorization.

## Site configurations

| Site | Configuration | Basis |
|---|---|---|
| North Ridge | **K-900**, 880 kW at -22 °C, 900 mm wide, current IEC 61439 certificate to 2027-03-31 | Meets the 850 kW requirement and the -18 °C design minimum; the only model with a current certificate that qualifies. |
| Harbor Flats | **K-900**, 860 kW, 900 mm wide, current IEC 61439 certificate to 2027-03-31 | Fits the 1,250 mm corridor. The 2026-11-06 correction restates S-1080 at Harbor Flats as 600 kW, below the 620 kW requirement, so S-1080 is no longer eligible; H-1320 is 1,320 mm wide and lacks a current certificate. |

K-900 is now the only eligible model at either site, so there is no compliant fallback if its availability, price or certificate status changes.

## Changes in cost and timing

- **Total cost:** USD **485,000 → 536,000**, an increase of **USD 51,000** (about 10.5%), before any price revalidation.
- **Harbor Flats:** the line moves from S-1080 at USD 217,000 to K-900 at USD 268,000 (USD 250,000 unit price plus USD 18,000 freight), an increase of **USD 51,000**.
- **North Ridge:** unchanged at K-900, USD 268,000.
- **Harbor Flats lead time:** **9 → 14 weeks**, an increase of **5 weeks**.
- **Harbor Flats install start:** **2027-01-07 → 2027-02-11**. North Ridge remains at 2027-02-11; both sites now share the 14-week K-900 lead.
- **Price validity:** the K-900 quotes expire on **2026-12-31**, before either planned install start, so pricing must be revalidated before purchase.

## Decisions requiring approval

1. Approve the Harbor Flats configuration change from S-1080 to K-900 and the resulting single-model dependency at both sites.
2. Approve the revised equipment total of **USD 536,000**, including the **USD 51,000** increase.
3. Approve the revised Harbor Flats install start of **2027-02-11** and the associated five-week schedule shift.
4. Approve revalidation of the K-900 price after the 2026-12-31 quote expiry and before any order.
5. Confirm the remaining technical conditions before order: the 1,250 mm Harbor Flats corridor remains controlling, the K-900 rating is valid at the 2,400 m North Ridge altitude, and the certificate remains valid through commissioning.
6. Authorize any purchase order. **No purchase is authorized by this review.**

<!-- data:start -->
```json
{
  "north": "K-900",
  "harbor": "K-900",
  "previousTotalUsd": 485000,
  "totalUsd": 536000,
  "previousHarborLeadWeeks": 9,
  "harborLeadWeeks": 14,
  "approvedHead": "caaeb4f1fa8f01681019ba38894dbab43db3222f",
  "pendingApprovals": [
    "Approve the Harbor Flats configuration change from S-1080 to K-900",
    "Approve the revised equipment total of USD 536,000 (USD 51,000 increase)",
    "Approve the Harbor Flats install start of 2027-02-11 and the five-week schedule shift",
    "Approve revalidation of the K-900 price after the 2026-12-31 quote expiry",
    "Confirm the Harbor Flats corridor, North Ridge altitude rating and certificate validity before order",
    "Authorize any purchase order; no purchase is authorized by this review"
  ]
}
```
<!-- data:end -->
