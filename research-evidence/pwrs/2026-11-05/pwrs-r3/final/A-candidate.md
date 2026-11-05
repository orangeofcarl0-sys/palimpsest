# Multi-site energy deployment — reviewable package

**Status:** DECISION-READY FOR REVIEW, NOT APPROVED
**Prepared:** 2026-11-05
**Repository basis:** commit `272a4c7` plus measured inbox input `inbox/2026-11-03/corridor-measurement.md`
**Scope:** Site A and Site B, unit options Kestrel-900, Solaris-800, Halcyon-850

> **Authority boundary.** This package assesses, structures and recommends. It does not approve expenditure, accept a vendor claim, or promote a result. No purchase order, contract or budget commitment may be issued from this document alone. Operator acceptance is required before any expenditure.

---

## 0. Evidence rules used in this package

Every statement below is tagged by its evidentiary standing:

- **[MEASURED]** — stated as a measurement in the declared sources/inbox.
- **[SOURCE]** — stated in the declared sources/inbox as vendor or site data, but not independently verified.
- **[CALC]** — arithmetic derived here from the stated sources.
- **[UNVERIFIED]** — a claim that is not evidenced on file (e.g. an "expected" certificate).
- **[GAP]** — information the sources do not contain. These are flagged, not invented.
- **[ASSUMPTION]** — explicitly labelled baseline assumption that has not been measured.

The binding project rules are respected:

- **R1:** The deciding constraint for each site is named in §1.2 and §2.2.
- **R2:** A 2024 coastal column is not a current 2026 certificate; an expected certificate is not a certificate on file. Nothing in this package treats either as compliance.

The sources do **not** contain prices, required unit counts, electrical capacity per unit, installation costs, or installation durations. Those are treated as **[GAP]**; no numbers have been fabricated to fill them.

---

## 1. Site A — technical capacity and deciding constraint

### 1.1 Site requirements [SOURCE]

| Requirement | Value | Standing |
|---|---|---|
| Design minimum temperature | −12 °C | [SOURCE] |
| Maximum admissible unit width | 1200 mm | [SOURCE] |
| Coastal requirement | None | [SOURCE] |

### 1.2 Deciding constraint

> **The deciding constraint at Site A is the −12 °C design minimum temperature.**

Halcyon-850 has a minimum operating temperature of −10 °C [SOURCE], which does not reach −12 °C. This is the only hard exclusion at Site A. Width and the absence of a coastal requirement are not limiting at this site.

### 1.3 Unit screening at Site A

| Unit | Min °C | Max °C | Width mm | Lead weeks | Meets −12 °C? | Meets ≤1200 mm? | Admissible at A? |
|---|---:|---:|---:|---:|---|---|---|
| Kestrel-900 | −20 | 45 | 900 | 8 | Yes | Yes | **Yes** |
| Solaris-800 | −15 | 40 | 800 | 10 | Yes | Yes | **Yes** |
| Halcyon-850 | −10 | 35 | 850 | 12 | **No** | Yes | **No** |

[CALC] derived by comparison of `sources/capacity.csv` against `sources/sites.md`.

- Admissible options at Site A: **Kestrel-900 and Solaris-800**.
- Excluded option at Site A: **Halcyon-850** — design minimum −10 °C is above the −12 °C requirement.
- Halcyon's longer 12-week lead time does not rescue it: temperature is a hard requirement.

### 1.4 Capacity implication at Site A

[CALC] Unit nameplates and per-unit electrical capacity are not in the declared sources, so total site capacity **cannot be computed** from this package. What can be stated is the portfolio of technically admissible units and the available width envelope:

- Any mix of Kestrel-900 and Solaris-800 fits within the 1200 mm width limit.
- Maximum units per 1200 mm row: one Kestrel-900 (900 mm) or one Solaris-800 (800 mm). Two units do not fit side by side in 1200 mm for any option (2 × 800 = 1600 mm; 2 × 900 = 1800 mm).
- The number of rows / positions, required capacity, and per-unit output are **[GAP]** and must be supplied before a capacity commitment is made.

---

## 2. Site B — technical capacity and deciding constraint

### 2.1 Site requirements and measured corridor

| Requirement | Value | Standing |
|---|---|---|
| Design minimum temperature | −4 °C | [SOURCE] |
| Coastal-rated warranty | Binding | [SOURCE] |
| Corridor width | **700 mm (measured 2026-11-03)** | **[MEASURED]** |
| Original 1200 mm corridor value | Assumption, **superseded** | [ASSUMPTION] — withdrawn |

The inbox measurement (`inbox/2026-11-03/corridor-measurement.md`) states the corridor is 700 mm, that the earlier 1200 mm figure was an assumption and is superseded, and that the 900 mm unit is not admissible at Site B. This package uses **700 mm**, not 1200 mm.

### 2.2 Deciding constraint

> **The deciding constraint at Site B is the binding coastal-certification requirement.** The measured 700 mm corridor is a hard physical constraint that removes Kestrel-900, but even the only width-compatible unit (Solaris-800) has no current coastal certificate on file — so no unit is compliant at Site B on the present evidence.

This is deliberately stated as **no compliant option**, not as "choose the best compromise". Installing a non-coastal-rated unit at Site B would breach a binding warranty requirement and is excluded.

### 2.3 Unit screening at Site B

| Unit | Min °C ≤ −4 °C? | Width ≤ 700 mm? | Current coastal certificate on file? | Admissible at B? |
|---|---|---|---|---|
| Kestrel-900 | Yes (−20) | **No** (900 mm) | No | **No — width** |
| Solaris-800 | Yes (−15) | **No** (800 mm) | No | **No — width and coastal** |
| Halcyon-850 | Yes (−10) | **No** (850 mm) | **No** — "expected" 2026 claim only [UNVERIFIED] | **No — width and coastal** |

[CALC] derived from `sources/capacity.csv`, `sources/vendors.md`, `sources/sites.md` and the measured inbox note.

Findings:

1. **Kestrel-900 is definitively excluded at Site B** by the measured 700 mm corridor (900 mm > 700 mm). This is consistent with the inbox note's explicit statement.
2. **Solaris-800 (800 mm) also exceeds 700 mm.** The measured corridor is narrower than every candidate unit. This is a stronger finding than the inbox note states (it only calls out the 900 mm unit) and it must not be softened: at 700 mm, **no listed unit fits**.
3. **Halcyon's 2026 coastal certificate is not on file.** The source says the certificate is "expected". Under R2 an expected certificate is **not** a current certificate, and a 2024 column would not be a 2026 certificate either. Halcyon is therefore not coastal-compliant on the evidence.
4. **Kestrel and Solaris have no coastal certification in the declared sources at all.** Neither can satisfy Site B's binding coastal warranty requirement as evidenced.

### 2.4 Capacity implication at Site B

Because no unit is admissible, **there is no qualified capacity at Site B** on the current evidence. The capacity assessment at Site B is therefore **0 MW qualified, pending resolution of the width and certification gates**. This is a finding, not a purchase decision.

---

## 3. Vendor compliance assessment

| Criterion | Kestrel | Solaris | Halcyon |
|---|---|---|---|
| Minimum temperature | −20 °C — meets both sites [SOURCE] | −15 °C — meets both sites [SOURCE] | −10 °C — fails Site A (−12 °C) [SOURCE] |
| Maximum temperature | 45 °C [SOURCE] | 40 °C [SOURCE] | 35 °C [SOURCE] |
| Unit width | 900 mm [SOURCE] | 800 mm [SOURCE] | 850 mm [SOURCE] |
| Lead time | 8 weeks [SOURCE] | 10 weeks [SOURCE] | 12 weeks [SOURCE] |
| Warranty | 5 years [SOURCE] | 7 years [SOURCE] | 10 years [SOURCE] |
| Coastal certification | **None in declared sources** | **None in declared sources** | **Not on file** — 2026 certificate merely "expected" [UNVERIFIED] |
| Site A compliance | Compliant | Compliant | **Non-compliant (temperature)** |
| Site B compliance | **Non-compliant (width 900 > 700 mm; no coastal cert)** | **Non-compliant (width 800 > 700 mm; no coastal cert)** | **Non-compliant (width 850 > 700 mm; no current coastal cert)** |

### 3.1 Compliance conclusion

- **No vendor is compliant for Site B** on the present evidence. This is the single most important procurement finding in the package.
- **Kestrel and Solaris are compliant for Site A.** Halcyon is not.
- The 10-year Halcyon warranty is the longest, but warranty length cannot offset a failed design-temperature requirement or an absent coastal certificate.
- [GAP] The package has no certificate numbers, issuing bodies, validity dates, or warranty terms beyond duration. Those must be obtained and verified before any Site B award.

---

## 4. Cost / budget model

### 4.1 What the sources do and do not support

[GAP] **No unit prices, freight, installation rates, civil works, grid-connection costs, contingency rates, or required unit counts are present in the declared sources.** A currency budget cannot be stated without inventing data. This section therefore provides a **parametric cost model** that becomes a budget once the operator supplies the missing rates and quantities.

### 4.2 Parametric model

For site *s* and unit type *u*, the installed cost is modelled as:

> **C(s,u) = N(s,u) × [P(u) + F(u) + I(u)] + E(s) + X(s) + R**

where:

| Term | Meaning | Status |
|---|---|---|
| `N(s,u)` | number of units | [GAP] — not in sources |
| `P(u)` | unit purchase price | [GAP] — not in sources |
| `F(u)` | freight / logistics per unit | [GAP] — not in sources |
| `I(u)` | installation cost per unit | [GAP] — not in sources |
| `E(s)` | site electrical / interconnection works | [GAP] — not in sources |
| `X(s)` | civil works, foundations, access | [GAP] — not in sources |
| `R` | contingency and risk allowance | Operator-set policy rate [GAP] |

### 4.3 Cost-comparison structure (to be populated by the operator)

The table below is the structure the operator should complete. **It intentionally contains no invented figures.**

| Cost line | Site A — Kestrel-900 | Site A — Solaris-800 | Site B — any unit |
|---|---:|---:|---:|
| Units required | [GAP] | [GAP] | [GAP] |
| Unit price × units | [GAP] | [GAP] | [GAP] |
| Freight | [GAP] | [GAP] | [GAP] |
| Installation | [GAP] | [GAP] | [GAP] |
| Electrical / interconnection | [GAP] | [GAP] | [GAP] |
| Civil works | [GAP] | [GAP] | [GAP] |
| Contingency | [GAP] | [GAP] | [GAP] |
| **Installed total** | **[GAP]** | **[GAP]** | **[GAP]** |
| Cost per qualified unit | [GAP] | [GAP] | Not definable — no qualified unit |

### 4.4 Budget decision rule

1. No budget can be approved until every [GAP] above is filled from a verified commercial source.
2. Site B has **no qualified unit**, so no Site B budget line should be opened; a budget for a non-compliant unit would be a commitment to breach a binding requirement.
3. Any Site A award should be made only after a like-for-like priced comparison of Kestrel-900 vs Solaris-800, including the 2-week lead-time difference (8 vs 10 weeks) and the 2-year warranty difference (5 vs 7 years).
4. Contingency should be set by operator policy, not by this package.

---

## 5. Implementation schedule

### 5.1 Schedule basis

[CALC] Lead times from `sources/capacity.csv`:

| Unit | Lead time |
|---|---:|
| Kestrel-900 | 8 weeks |
| Solaris-800 | 10 weeks |
| Halcyon-850 | 12 weeks |

[GAP] The sources do not state installation, commissioning, certification, permitting or interconnection durations. The schedule below is a **sequence and dependency model**, not a dated programme. Week numbers are relative to a notional notice-to-proceed (NTP) at week 0 and are indicative only for the procurement leg.

### 5.2 Site A — indicative sequence

Assuming an award at week 0:

| Phase | Duration | Dependency / note |
|---|---|---|
| Award and contract | [GAP] | Operator approval required first |
| Unit procurement | 8 weeks (Kestrel) or 10 weeks (Solaris) | [SOURCE] lead time |
| Delivery and site logistics | [GAP] | Not in sources |
| Civil / foundations | [GAP] | Not in sources |
| Installation | [GAP] | Not in sources |
| Electrical / interconnection | [GAP] | Not in sources |
| Commissioning and acceptance | [GAP] | Not in sources |

**Site A critical path:** operator award → procurement (8–10 weeks) → installation/commissioning ([GAP]). The procurement leg is the only quantified part; the remaining legs cannot be scheduled from the sources.

### 5.3 Site B — gated sequence (cannot start procurement)

| Gate | Status | What must close it |
|---|---|---|
| G1 — Width | **OPEN / FAILING** | A unit ≤ 700 mm wide, or a re-measurement/reconfiguration of the corridor approved by the site owner |
| G2 — Current coastal certificate | **OPEN** | A current 2026 coastal certificate on file for the selected unit; not a 2024 column, not an "expected" certificate |
| G3 — Priced compliant offer | **BLOCKED by G1/G2** | Vendor quotation for the qualified unit |
| G4 — Operator approval | **NOT REQUESTED** | Operator acceptance of the compliant package |

**Site B earliest procurement start:** only after G1 and G2 are both closed. No lead time can be applied before then, so **Site B has no defensible completion date**.

### 5.4 Schedule risk

- If Solaris-800 is selected for Site A, the programme is 2 weeks longer than Kestrel-900 on procurement alone.
- Site B's schedule is entirely gated by evidence that does not currently exist. Any date quoted for Site B now would be unsupported.

---

## 6. Risk and uncertainty review

| # | Risk / uncertainty | Type | Likelihood | Impact | Evidence | Mitigation / owner action |
|---|---|---|---|---|---|---|
| 1 | Site B has **no width-compliant unit**: measured corridor 700 mm vs smallest unit 800 mm | Technical / hard constraint | **Certain on current evidence** | **Critical** — Site B cannot proceed | [MEASURED] inbox; [SOURCE] capacity.csv | Re-measure/confirm corridor; evaluate narrower units or corridor reconfiguration; do not order |
| 2 | No current coastal certificate for any vendor at Site B | Compliance / warranty | **Certain on current evidence** | **Critical** — binding requirement unmet | [SOURCE] vendors.md; [UNVERIFIED] Halcyon claim | Obtain and verify a current 2026 certificate on file before any award |
| 3 | Halcyon-850 fails Site A's −12 °C design minimum | Technical | Certain | High — option eliminated at A | [SOURCE] capacity.csv / sites.md | Do not offer Halcyon at Site A |
| 4 | Halcyon's "expected" 2026 certificate is treated as compliance by mistake | Process / compliance | Medium if not controlled | Critical — false compliance | [UNVERIFIED] | Enforce R2: certificate on file or no credit |
| 5 | Unit prices, quantities and capacity data absent | Commercial | Certain | High — no budget or capacity commitment possible | [GAP] | Operator to supply verified commercial and technical data |
| 6 | Installation, commissioning and interconnection durations absent | Schedule | Certain | High — no dated programme possible | [GAP] | Obtain installer and utility programmes |
| 7 | 1200 mm assumption reused for Site B after it was superseded | Process | Medium | High — wrong unit selection | [ASSUMPTION] superseded | This package uses 700 mm; re-check before any change |
| 8 | Longer warranty (Halcyon 10 yr) biases selection despite non-compliance | Commercial bias | Medium | Medium | [SOURCE] vendors.md | Compliance gates precede commercial scoring |
| 9 | Lead-time slippage (8/10/12 weeks quoted, not guaranteed) | Schedule | Medium | Medium | [SOURCE] capacity.csv | Contractual delivery terms and liquidated damages if appropriate |
| 10 | Site A unit count/row layout not defined | Design | Certain | Medium | [GAP] | Confirm layout and required capacity |

### 6.1 Uncertainty statement

The two decisive uncertainties — Site B corridor width and Site B coastal certification — are **not** soft estimates. The corridor is measured at 700 mm, and no current certificate exists on file. The package therefore does not present a "most likely" Site B option; it records that **no compliant Site B option exists on the present evidence**.

---

## 7. Integrated decision

### 7.1 Decision summary

| Site | Qualified capacity | Deciding constraint | Recommendation | Authority |
|---|---|---|---|---|
| **Site A** | Admissible units: Kestrel-900, Solaris-800. Total capacity [GAP]. | **−12 °C design minimum** (excludes Halcyon-850) | **Proceed to priced comparison of Kestrel-900 vs Solaris-800; no award until prices and quantities are supplied and the operator approves.** | Operator |
| **Site B** | **0 qualified** on current evidence | **Binding coastal certification**; measured 700 mm corridor also excludes every listed unit | **HOLD. Do not procure.** Close width and current-certificate gates first, then re-run the assessment. | Operator |

### 7.2 Integrated recommendation

1. **Site A — conditional proceed.** Both Kestrel-900 and Solaris-800 meet the −12 °C requirement and the 1200 mm width limit. Select between them only on a verified like-for-like cost comparison; the trade-off is 8 vs 10 weeks lead time and 5 vs 7 years warranty. Halcyon-850 is excluded on temperature.
2. **Site B — hold, no award.** There is no unit that is both ≤ 700 mm wide and covered by a current coastal certificate. Proceeding would breach a binding requirement. The operator should either (a) obtain a re-measurement/engineering confirmation of the corridor and a current 2026 certificate for a qualifying unit, or (b) formally re-scope Site B. Neither action is authorised by this package.
3. **Budget — not approvable yet.** The cost model is structurally complete but has no verified rates or quantities. No expenditure is approved or recommended for approval in this package; the operator must supply the missing commercial data and accept the result before any commitment.
4. **Schedule — only the procurement leg is quantified.** Site A can be sequenced from award; Site B cannot be scheduled until its gates close.
5. **Evidence discipline.** Halcyon's "expected" certificate is recorded as unverified, not as compliance. The superseded 1200 mm assumption is not used.

### 7.3 What would change this decision

| Trigger | Effect |
|---|---|
| A current 2026 coastal certificate is verified on file for a unit | Re-open Site B compliance for that unit only |
| Corridor re-measured/confirmed ≥ 800 mm (or site reconfigured) | Solaris-800 becomes width-eligible at Site B; certification still required |
| Corridor confirmed ≥ 900 mm | Kestrel-900 also becomes width-eligible; certification still required |
| Verified prices, quantities and capacity data supplied | Cost and capacity sections can be completed and a budget recommendation made |
| Operator revises a binding requirement | Re-run the affected screening; this package's conclusions are based on the current requirements |

---

## 8. Operator actions requested

This package is submitted for **operator review and acceptance**. It does **not** accept itself, approve expenditure, or promote its own result.

1. **Review and accept/reject** the Site A and Site B conclusions in §7.
2. **Supply** verified unit prices, required unit counts, per-unit capacity, installation and interconnection costs/durations — or direct who should provide them.
3. **For Site B:** commission a corridor confirmation and obtain a current 2026 coastal certificate on file, or formally re-scope Site B.
4. **Do not issue** any purchase order or budget commitment on the basis of this document alone.

---

## 9. Source traceability

| Ref | Used for |
|---|---|
| `sources/sites.md` | Site A/B requirements; R1/R2 statements; 1200 mm baseline explicitly flagged as assumption |
| `sources/capacity.csv` | Unit temperatures, widths, lead times |
| `sources/vendors.md` | Warranties; coastal certification status (including Halcyon's unverified "expected" claim) |
| `inbox/2026-11-03/corridor-measurement.md` | Measured 700 mm Site B corridor; supersession of 1200 mm assumption; 900 mm unit inadmissible at B |
| `inbox/README.md` | Inbox evidence rule: a claim about a future certificate is not a certificate |
| `TASK.md` | Package scope and authority limits |

*End of package.*
