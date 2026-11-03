# Community Battery Vendor Selection

**Review date:** 2026-11-03

**Scope:** Site A and Site B, using only the declared sources in this repository. Inbox material is evidence to be assessed, not accepted automatically (`TASK.md:5`).

## Decision summary

| Site | Decision | Vendor / unit | Deciding constraint(s) |
|---|---|---|---|
| A | **Select** | **Kestrel V2** | Rated to **-20 °C**, meeting the **-12 °C** design minimum, and **900 mm** wide, within the **1200 mm** maximum. Two vendors meet the hard constraints; Kestrel is selected on the documented tie-break in "Site A" below. |
| B | **Withhold selection** | **None** | No vendor has a verified **current (2026) coastal-rated warranty**. Halcyon's 2026 coastal certificate is only *expected* and is not on file; the 2024 column is not 2026 evidence. |

## Screening against the declared data

Source: `sources/vendor-capabilities.csv:1-4` (all columns below are taken from that table). Site requirements: `sources/sites.md:3-4` and `TASK.md:7-8`.

| Vendor / unit | Min. rating (°C) | Width (mm) | Site A cold (-12 °C) | Site A width (≤1200 mm) | Coastal 2024 | Site B cold (-4 °C) | Current 2026 coastal evidence | Lead (weeks) | Warranty (years) |
|---|---:|---:|---|---|---|---|---|---:|---:|
| Kestrel V2 | -20 | 900 | Pass | Pass | no | Pass | None | 8 | 5 |
| Solaris V3 | -15 | 800 | Pass | Pass | no | Pass | None | 10 | 7 |
| Halcyon V4 | -10 | 850 | **Fail** | Pass | no | Pass | Unverified 2026 claim only | 12 | 10 |

The width constraint does not eliminate any listed vendor: all three are narrower than 1200 mm.

## Site A — select Kestrel V2

**Binding requirements:** design minimum **-12 °C**, maximum width **1200 mm**, no coastal requirement (`sources/sites.md:3`; `TASK.md:7`).

**Constraint analysis:**

- **Kestrel V2** is rated to -20 °C, which is below the -12 °C design minimum, and is 900 mm wide, within the 1200 mm limit (`sources/vendor-capabilities.csv:2`).
- **Solaris V3** also passes both hard constraints: -15 °C and 800 mm (`sources/vendor-capabilities.csv:3`).
- **Halcyon V4** is eliminated by the cold requirement: its -10 °C rating is warmer than the -12 °C design minimum (`sources/vendor-capabilities.csv:4`). Its width is not the issue.

The binding constraints therefore eliminate Halcyon but do **not** uniquely decide between Kestrel and Solaris. The source set declares no price, scoring rule, or priority among lead time, warranty length, and cold margin. A selection can still be made by applying an explicit programme tie-break to declared attributes, without treating a secondary attribute as a site requirement. The tie-break used here is:

1. **Greatest cold-weather headroom:** Kestrel's -20 °C rating gives 8 °C of margin below the -12 °C design minimum; Solaris's -15 °C rating gives 3 °C (`sources/vendor-capabilities.csv:2-3`).
2. **Then shortest lead time:** Kestrel 8 weeks versus Solaris 10 weeks (`sources/vendor-capabilities.csv:2-3`).

**Decision:** select **Kestrel V2**. The binding constraints are the cold rating and width; the cold rating excludes Halcyon, while width excludes no vendor. Kestrel is the compliant unit with the largest declared cold margin and the shortest declared lead time. Solaris remains compliant and has the longer warranty (7 years versus Kestrel's 5), but Site A declares no warranty threshold or warranty-led ranking. This is a documented programme judgement, not a source-mandated ranking. If the programme adopts a warranty-led or other mandatory tie-break, the Site A selection should be reopened.

## Site B — withhold selection

**Binding requirements:** design minimum **-4 °C**, and a **coastal-rated warranty is binding**; a 2024 rating is not a 2026 rating (`sources/sites.md:4`; `TASK.md:8`).

**Constraint analysis:**

- The cold requirement is not the blocker: Kestrel (-20 °C), Solaris (-15 °C), and Halcyon (-10 °C) are all rated below -4 °C (`sources/vendor-capabilities.csv:2-4`).
- The coastal warranty is the blocker. The table's only coastal field is `coastal_2024`, and it is **no** for all three vendors (`sources/vendor-capabilities.csv:2-4`). A 2024 value cannot establish a 2026 rating (`sources/sites.md:4,6`).
- The `warranty_years` values (5, 7, and 10 years) are generic warranty lengths; nothing in the sources ties them to a coastal rating, so they do not satisfy the binding coastal-warranty criterion (`sources/vendor-capabilities.csv:2-4`).
- Halcyon is the only vendor with a 2026-related claim: the manufacturer says a 2026 coastal certificate is **expected**, but the certificate is **NOT on file** (`inbox/2026-02-10/vendor-update.md:3`). That is an unverified claim, not a current coastal rating (`inbox/2026-02-10/vendor-update.md:3-4`).

No vendor therefore has verified evidence of the binding current coastal-rated warranty. **Selection for Site B is withheld.** The selection cannot be made from the declared sources; awarding on the expectation of a certificate, or on the 2024 column, would misstate the evidence.

**What would unblock a decision:** an actual 2026 coastal certificate on file, reviewed against the warranty requirement. If verified, Halcyon would be the natural candidate because it is the only vendor with a 2026 claim and it meets the -4 °C requirement. Until then, no vendor should be treated as coastally certified for 2026.

## Assumptions and limitations

- This decision uses only `TASK.md`, `sources/`, and the inbox material present at review. No pricing, independent test data, full warranty terms, or certificate documents were available.
- The inbox item is treated as a claim to verify, not as proof: "expected" is not the same as issued or current (`inbox/2026-02-10/vendor-update.md:3-4`).
- The Site A choice depends on the stated tie-break. The hard constraints alone leave both Kestrel and Solaris eligible; if the programme supplies a different mandatory tie-break, the Site A selection should be reopened.
- No unverified certificate is asserted to be current in this document.

## Sources cited

- `TASK.md:5` — inbox material is not accepted merely by reading it.
- `TASK.md:7-8` — Site A and Site B requirements, including the 2024/2026 warning.
- `TASK.md:10` — do not claim an unverified certificate is current.
- `sources/sites.md:3` — Site A: -12 °C, 1200 mm, no coastal requirement.
- `sources/sites.md:4,6` — Site B: -4 °C, binding coastal-rated warranty, and the instruction not to treat 2024 as 2026.
- `sources/vendor-capabilities.csv:1-4` — vendor chemistry, temperature ratings, warranty years, `coastal_2024`, width, and lead time.
- `inbox/2026-02-10/vendor-update.md:1-4` — Halcyon's 2026 coastal certificate is expected but not on file; unverified claim.
