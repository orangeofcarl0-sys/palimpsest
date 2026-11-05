# Vendor compliance assessment

The certificate standing is the one thing a price comparison must not flatten: a certificate that is
*expected* is not a certificate the deployment may rely on today.

| model | certificate | valid to | standing |
|---|---|---|---|
| Kestrel K-900 | IEC 61439 | 2027-03-31 | current |
| Solaris S-1080 | IEC 61439 | 2027-01-31 | current |
| Halcyon H-1320 | expected 2026, not issued | — | **not current** |

- Halcyon H-1320 is named as a future option only. It may not be selected for either site, and its
  price may not enter the cost model: the quote expired on 2026-09-30.
- Kestrel and Solaris certificates cover their scheduled installation and commissioning windows.
  The Solaris certificate expires 2027-01-31; the schedule commissions that unit before that date.

<!-- data:start -->
```json
{
  "vendors": [
    { "model": "K-900", "certificate": "CURRENT", "validTo": "2027-03-31" },
    { "model": "S-1080", "certificate": "CURRENT", "validTo": "2027-01-31" },
    { "model": "H-1320", "certificate": "EXPECTED_NOT_CURRENT", "validTo": null }
  ]
}
```
<!-- data:end -->
