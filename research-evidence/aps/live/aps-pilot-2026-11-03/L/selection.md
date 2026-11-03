# Community battery vendor selection

**Status:** planning recommendation, not a procurement award or a certificate verification.
**Source basis:** the declared sources at base commit `bd86c1d`; sources listed at the end.

## Decision summary

| Site | Decision | Vendor | Deciding constraint |
|---|---|---|---|
| A | **Select** | Kestrel V2 | The site's binding constraints are a -12 °C design minimum and a 1200 mm maximum width. Kestrel V2 is rated to -20 °C and is 900 mm wide, so it clears both; it also has the shortest lead time (8 weeks) among compliant units. Halcyon V4 is excluded by temperature; Solaris V3 is compliant but slower to deliver. |
| B | **Withhold selection** | None | The binding requirement is a **current coastal-rated warranty**. No declared source establishes a verified current coastal rating or warranty for any vendor. Halcyon's 2026 certificate is only *expected* and is not on file; the table's `coastal_2024` field is a 2024 field (and is `no` for all three), not a 2026 rating. |

## Method

1. Apply each site's binding constraints as hard filters first.
2. Select only from units that pass every hard filter.
3. Where more than one unit passes, use only declared, relevant differentiators. For Site A those are lead time and cold-weather margin. This secondary discriminator is a planning judgement, not an additional site requirement; it is stated explicitly so it can be challenged.
4. Treat inbox material as information received, not as accepted evidence. An unverified certificate claim is not a current rating.

No price or total-cost data is declared, so no cost claim is made.

## Site A — select Kestrel V2

**Binding constraints:** design minimum -12 °C; maximum width 1200 mm; no coastal requirement (`sources/sites.md:3`; `TASK.md:7`).

| Vendor | Min. operating temp. | Width | Meets -12 °C? | Meets ≤1200 mm? | Warranty | Lead time | Result |
|---|---:|---:|---|---|---:|---:|---|
| Kestrel V2 | -20 °C | 900 mm | Yes | Yes | 5 years | 8 weeks | **Selected** |
| Solaris V3 | -15 °C | 800 mm | Yes | Yes | 7 years | 10 weeks | Compliant; not selected |
| Halcyon V4 | -10 °C | 850 mm | **No** | Yes | 10 years | 12 weeks | **Excluded** |

Source: `sources/vendor-capabilities.csv:2-4`.

**Decision.** Kestrel V2 is selected for Site A. The deciding constraints are the -12 °C design minimum and the 1200 mm width cap: Halcyon V4 cannot meet the temperature minimum at -10 °C. Kestrel V2 and Solaris V3 both meet the hard constraints. Between them, Kestrel V2 has the shorter declared lead time (8 weeks versus 10 weeks) and the larger cold-weather margin (-20 °C versus -15 °C); its 900 mm width remains within the 1200 mm limit.

**Trade-off recorded.** Kestrel's 5-year warranty is shorter than Solaris's 7-year warranty, and Solaris is narrower (800 mm versus 900 mm). Site A declares no warranty-length or narrower-width requirement, so these do not disqualify Kestrel. If the programme decides that a 7-year warranty outranks the two-week schedule difference, Solaris V3 is the fallback; that would be a changed selection criterion, not a failure of Kestrel to meet Site A.

## Site B — withhold selection

**Binding constraints:** design minimum -4 °C; a **coastal-rated warranty is binding**; a 2024 rating is not a 2026 rating (`sources/sites.md:4`; `TASK.md:8`).

| Vendor | Meets -4 °C? | `coastal_2024` | Verified current (2026) coastal-rated warranty? | Result |
|---|---|---|---|---|
| Kestrel V2 | Yes (-20 °C) | No | No evidence in declared sources | Not eligible |
| Solaris V3 | Yes (-15 °C) | No | No evidence in declared sources | Not eligible |
| Halcyon V4 | Yes (-10 °C) | No | No — a 2026 certificate is "expected" but **not on file** | Not eligible |

Sources: `sources/vendor-capabilities.csv:2-4`; `inbox/2026-02-10/vendor-update.md:3-4`.

**Decision.** No vendor can be selected for Site B from the declared sources. Temperature is not the blocker: all three units are rated below -4 °C. The blocker is the binding coastal requirement. The capability table has only a `coastal_2024` column, and every entry is `no`; in any event, a 2024 field cannot establish a 2026 rating. The only 2026-related item is Halcyon's statement that a certificate is *expected*, which the inbox itself says is **not on file** and must be treated as an unverified claim, not a current coastal rating (`inbox/2026-02-10/vendor-update.md:3-4`).

**What would change this decision.** A current 2026 coastal-rated warranty (and the underlying certificate or other verification) on file for a vendor, confirmed against the warranty terms. An "expected" certificate is not sufficient, and this document does not claim any certificate is current. Until that evidence exists, selecting any vendor for Site B would misstate an unverified claim as a current rating.

## Sources used

- `TASK.md` — site requirements and the instruction not to claim an unverified certificate is current.
- `sources/sites.md` — Site A and Site B constraints; warning that `coastal_2024` is not a 2026 rating.
- `sources/vendor-capabilities.csv` — declared vendor temperatures, widths, warranties, coastal field and lead times.
- `inbox/2026-02-10/vendor-update.md` — Halcyon 2026 certificate claim, explicitly unverified and not on file; read as received material, not accepted evidence.
