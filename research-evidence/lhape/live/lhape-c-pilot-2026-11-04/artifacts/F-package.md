# Multi-Site Energy Deployment — Reviewable Decision Package

**Package ID:** DEP-F-2026-11-04  
**Revision:** 2  
**Prepared for:** Principal / capital authorizing body  
**Prepared by:** Principal's project office  
**Date:** 2026-11-04  
**Sites in scope:** Site A and Site B  
**Status:** For decision. **This package does not approve any expenditure.**

---

## 1. Decision summary

### 1.1 Bottom line

| Workstream | Finding | Recommendation | Spend status |
|---|---|---|---|
| Site A — technical | Kestrel-900 and Solaris-800 meet the stated low-temperature and width requirements. Halcyon-850 fails the low-temperature requirement. | Proceed to firm quotation and technical clarification, with **Kestrel-900 as preferred** and **Solaris-800 as acceptable alternate**. | No equipment order released. |
| Site B — technical | Measured corridor width is **700 mm**. All three listed units are wider (800, 850, 900 mm). **No listed unit is admissible.** The binding coastal requirement is also unmet: no current coastal certificate is on file. | **Do not procure.** Treat Site B as a no-go for the current unit set. Appraise narrower-unit, corridor-modification and descope options before re-tendering. | No equipment order. Options appraisal only, subject to authorization. |
| Vendor compliance | Kestrel and Solaris are eligible for Site A only. Halcyon is not eligible for Site A (temperature) and not eligible for Site B (width and certificate). | Record vendor eligibility as assessed in §4; do not accept an "expected" certificate as evidence. | — |
| Cost / budget | No prices, rates, currency or quotes exist in the repository. The budget is **unbaselined**. | Build the budget only from written quotes using the model in §5. Set a pre-order authorization cap before any commitment. | **0 capital approved; 0 committed.** |
| Schedule | Site A can be scheduled from order release; Site B cannot be scheduled against any listed unit. | Run Site A and Site B on separate tracks so Site B does not delay Site A. | — |
| Risk | Site B carries a realized, high-impact dimensional non-compliance plus a missing-certificate risk. Site A's principal risks are cost and the thin Solaris temperature margin. | Apply the gates in §6 and the controls in §7. | — |

**Package map (TASK requirements):** §3 technical capacity assessment; §4 vendor compliance; §5 cost and budget model; §6 implementation schedule; §7 risk and uncertainty review; §8 integrated decision. Evidence and source traceability are in §2 and §9.

### 1.2 Decision requested

1. **Note** that two units pass the evidence-based Site A screen — Kestrel-900 and Solaris-800 — and that Kestrel-900 is preferred on evidence (widest cold margin, shortest declared lead, 900 mm width within the 1200 mm Site A limit).
2. **Note** that Site B is not deployable with any listed unit: the measured 700 mm corridor is narrower than every listed unit, and no current coastal certificate is on file.
3. **Authorize only bounded pre-order work** — Site A quotation/technical clarification and a Site B options appraisal — with a spending cap set by the principal before work starts. No equipment purchase order is requested in this revision.
4. **Require re-review at Gate G1** (§6.3) before any capital release.

**Authority statement:** No capital expenditure is approved, committed or recommended for approval by this document. Any release requires the principal's explicit authorization and a compliant procurement record. The repository contains no delegated authority, budget resolution or approved cost baseline.

---

## 2. Evidence basis and limitations

### 2.1 Evidence register

| ID | Source | Evidence | Status | How it is used |
|---|---|---|---|---|
| E1 | `sources/capacity.csv` | Operating limits (`min_c`, `max_c`), unit width (`unit_width_mm`) and lead time (`lead_weeks`) for three units | Vendor-declared data; not independently tested | Eligibility screening and schedule basis |
| E2 | `sources/sites.md` | Site A design minimum −12 °C; maximum admissible unit width 1200 mm; no coastal requirement | Project requirement | Site A screening |
| E3 | `sources/sites.md` | Site B design minimum −4 °C; coastal-rated warranty is binding | Project requirement | Site B screening |
| E4 | `sources/sites.md` | Site B corridor 1200 mm | **Assumption — expressly not a measurement** | Superseded by E7; not used |
| E5 | `sources/vendors.md` | Warranties: Kestrel 5 years, Solaris 7 years, Halcyon 10 years; no coastal certification declared for Kestrel or Solaris; Halcyon's 2026 coastal certificate is "expected" | Declared; Halcyon certificate claim **unverified** | Vendor compliance |
| E6 | `inbox/README.md` | Inbox items are evidence only to the extent their own text states; a claim about a future certificate is not a certificate | Evidence rule | Evidence handling |
| E7 | `inbox/2026-11-03/corridor-measurement.md` | **Measured Site B corridor width: 700 mm**, survey performed 2026-11-03; explicitly supersedes the 1200 mm assumption; states the 900 mm unit is not admissible | **Measured** | Decisive Site B constraint |
| E8 | — | Cost, price, currency, installation rate, energy output, site demand, site maximum temperature | **Absent** | Cannot be assessed; see §5 and §9.4 |

### 2.2 What the evidence does and does not support

- `capacity.csv` is an **operating-envelope and dimensional table**, despite its filename. It provides operating temperatures, a unit width in millimetres and a lead time. The model suffixes happen to match the listed widths, but the file does **not** state that the suffix is a capacity rating. The file contains **no kW, kWh, thermal output, efficiency, load or demand data**.
- Consequently this package is an **eligibility and compatibility screen**, not an energy-yield study, equipment-sizing calculation or determination of installed capacity. The number of units and the deployment's energy capacity are **indeterminate** on the current evidence.
- The Site B 1200 mm corridor value was an assumption. It has been superseded by the 700 mm measurement. No part of this package relies on the 1200 mm value for Site B.
- A 2024 coastal column is not a current 2026 certificate. An expected certificate is not a certificate on file. Neither is accepted here as compliance evidence.
- Vendor-declared lead times and warranties are not contractual until confirmed in a signed order.

### 2.3 Inbox check

The inbox was checked at the start of work, when the measured corridor update arrived, and again at **2026-11-04 18:08:59 (UTC+08:00)** immediately before this revision was finalized. The measured corridor update (E7) **has been incorporated**. The final check record is in §9.3. No other measured data was present at the final check.

---

## 3. Technical capacity assessment

### 3.1 Screening criteria

A unit is technically admissible at a site only if all applicable criteria pass:

| Criterion | Test | Consequence if failed |
|---|---|---|
| C1 — Cold limit | Unit `min_c` must be at or below the site design minimum | Unit cannot be accepted for that site |
| C2 — Heat limit | Unit `max_c` must be at or above the site maximum | Unverified: no site maximum is stated in the sources |
| C3 — Width | Unit width must not exceed the admissible/measured clear width, allowing installation clearance | Unit cannot be delivered/installed on that route |
| C4 — Coastal | A current, model-specific coastal-rated warranty/certificate must be on file where required | Unit cannot be accepted for a coastal site |
| C5 — Energy duty | Unit output must meet site demand with redundancy | Unverified: no output or demand data exists |

Only C1, C3 and (partially) C4 can be assessed from the repository. C2 and C5 cannot. For brevity, "eligible" in this package means **provisionally passing the criteria that can be assessed from the evidence**; it is not a final technical acceptance, and it does not confirm energy duty or upper-temperature compliance.

### 3.2 Site A — design minimum −12 °C, width limit 1200 mm

| Unit | `min_c` (°C) | Cold margin vs −12 °C | Width (mm) | Width margin vs 1200 mm | C1 | C3 | Technical verdict |
|---|---:|---:|---:|---:|---|---|---|
| Kestrel-900 | −20 | **+8 °C** | 900 | 300 mm | Pass | Pass | **Eligible — preferred** |
| Solaris-800 | −15 | **+3 °C** | 800 | 400 mm | Pass | Pass | **Eligible — alternate** |
| Halcyon-850 | −10 | **−2 °C (fails)** | 850 | 350 mm | **Fail** | Pass | **Not eligible** |

Site A has no coastal requirement (E2), so C4 does not apply. The 1200 mm figure is stated as the site's maximum admissible unit width, not as an assumption; it is treated as a design requirement. Physical delivery clearance should still be confirmed at the pre-installation survey.

**Site A conclusion:** two eligible units. Kestrel-900 is preferred because it has the largest cold margin (+8 °C), the shortest declared lead (8 weeks) and a 300 mm nominal width margin. Solaris-800 is an acceptable alternate, but its +3 °C margin is thin and must be checked against the site's design basis and any lower ambient excursion before order.

### 3.3 Site B — design minimum −4 °C, measured width 700 mm

| Unit | `min_c` (°C) | Cold margin vs −4 °C | Width (mm) | Width vs measured 700 mm | C1 | C3 | Technical verdict |
|---|---:|---:|---:|---:|---|---|---|
| Kestrel-900 | −20 | +16 °C | 900 | **200 mm too wide** | Pass | **Fail** | **Not admissible** |
| Solaris-800 | −15 | +11 °C | 800 | **100 mm too wide** | Pass | **Fail** | **Not admissible** |
| Halcyon-850 | −10 | +6 °C | 850 | **150 mm too wide** | Pass | **Fail** | **Not admissible** |

The measured 700 mm corridor is narrower than every listed unit. The source itself states that the 900 mm unit is not admissible; applying the same measurement, the 800 mm and 850 mm units are also inadmissible. No handling method, disassembly provision, alternative route or corridor modification is evidenced, so none is assumed.

The inbox entry reports the survey result; the underlying survey record and measurement method should be attached before any design freeze or re-tender, so the 700 mm value is traceable to a signed survey.

Even if a unit could be manoeuvred through the corridor, installation and service clearance would still need to be demonstrated. The nominal comparison above already fails before any clearance allowance.

**Coastal requirement (C4):** Site B's coastal-rated warranty is binding (E3). No current coastal certificate is on file for any vendor (E5). Halcyon's "expected" 2026 certificate is an unverified claim, not a certificate. A 2024 column would not satisfy a current 2026 certificate requirement. Therefore every listed unit also fails C4.

**Site B conclusion:** **zero eligible units.** Site B fails on width for all three models and on coastal evidence for all three. The width failure is independent of, and additional to, the certificate failure. Proceeding with any listed unit at Site B would be non-compliant.

### 3.4 Technical capacity statement

- Site A: **2 eligible models**, subject to acceptable commercial terms and a satisfactory installation survey. Installed capacity and unit count remain undetermined.
- Site B: **0 eligible models**. No equipment schedule or capacity figure can be stated.
- Upper-temperature compliance (C2) is **unverified for both sites** because no site maximum temperature is stated; declared unit maxima are 35–45 °C.
- Program: **energy capacity is indeterminate** because the repository contains no per-unit output, site demand, load profile or redundancy requirement. This is a material data gap, not a conclusion that capacity is adequate.

---

## 4. Vendor compliance assessment

### 4.1 Compliance matrix

| Vendor / unit | Warranty (declared) | Coastal certificate on file | Site A eligibility | Site B eligibility | Lead (weeks, declared) | Compliance note |
|---|---:|---|---|---|---:|---|
| Kestrel-900 | 5 years | **No** — none declared | **Eligible** | **Not eligible** | 8 | Site A passes cold/width; coastal status irrelevant at A. |
| Solaris-800 | 7 years | **No** — none declared | **Eligible (alternate)** | **Not eligible** | 10 | Site A passes with only +3 °C cold margin. |
| Halcyon-850 | 10 years | **No** — "expected" 2026 certificate only | **Not eligible** | **Not eligible** | 12 | Fails Site A cold limit (−10 °C vs −12 °C); fails Site B width (850 mm vs 700 mm) and has no certificate. |

### 4.2 Findings

1. **Warranty length is not coastal compliance.** Halcyon's 10-year warranty is the longest declared, but it does not establish a coastal rating, and the model is not admissible at either site on other criteria. Warranty duration must not be scored as a substitute for the binding coastal requirement.
2. **No current coastal certificate is on file.** Kestrel and Solaris declare no coastal certification. Halcyon declares only an expectation of a 2026 certificate. Under the inbox evidence rule, that expectation is not a certificate. The absence of a certificate does not prove a unit is unsuitable, but it prevents acceptance where a coastal-rated warranty is binding.
3. **A 2024 coastal column is not a current 2026 certificate.** Any future submission must be checked for issue date, expiry, issuing body, standard, exact model coverage and warranty linkage. Historical or generic marketing material is insufficient.
4. **Site B is not a certificate-only problem.** Even a valid Halcyon certificate would not cure the 850 mm width against a 700 mm measured corridor. Certificate work should not be treated as the route to Site B deployment unless the corridor is first made adequate.
5. **Warranty terms are unverified.** Only durations are declared. Coastal exclusions, corrosion coverage, service obligations, spares and claim procedures are absent from the evidence and must be reviewed before contract.
6. **Lead times are declared, not guaranteed.** They are suitable for planning only and must be converted into contractual delivery obligations with remedies.

### 4.3 Vendor compliance conclusion

- **Site A:** Kestrel-900 and Solaris-800 are eligible on the declared evidence. Kestrel is preferred; Solaris is an alternate subject to cold-margin verification and commercial comparison. Halcyon is excluded on temperature.
- **Site B:** **no vendor is compliant.** All three fail width; all three lack a current coastal certificate. A re-tender or a scope change is required.

---

## 5. Cost and budget model

### 5.1 Status: unbaselined

The repository contains **no equipment prices, installation rates, freight costs, currency, contingency allowance, tax treatment or quotes**. No cost figure in this package is presented as a budget, estimate or market rate. Inventing a rate would create false precision and could lead to an unauthorized commitment.

**Budget status: unbaselined. Approved capital: 0. Committed: 0.**

### 5.2 Cost model

The model is parameterized so that written quotes can populate it without changing its structure. All amounts must be in one stated currency; do not mix currencies.

For each site *s*:

```
C_s = n_s × (P_unit,s + P_install,s)
    + C_delivery,s
    + C_commissioning,s
    + C_civil,s
    + C_compliance,s
    + C_owner,s
```

Program total:

```
C_total = Σ_s C_s
        + C_survey,B
        + C_pm
        + C_contingency
        + C_escalation
```

Where:

| Symbol | Meaning | Current value / evidence |
|---|---|---|
| `n_s` | Number of units at site *s* | **TBD** — cannot be derived without output/demand data |
| `P_unit,s` | Delivered unit price, including coastal variant where required | **TBD** — no quotes |
| `P_install,s` | Installation and balance-of-plant cost per unit | **TBD** — no rates |
| `C_delivery,s` | Freight, lifting, access and duties | **TBD** — no quotes |
| `C_commissioning,s` | Testing, commissioning and handover | **TBD** — no rates |
| `C_civil,s` | Foundations, containment, electrical works, corridor works | **TBD** — scope not defined |
| `C_compliance,s` | Certification, inspection, warranty verification | **TBD** — no fees |
| `C_owner,s` | Permits, insurance, project management, owner's costs | **TBD** — no rates |
| `C_survey,B` | Site B dimensional/options survey | **TBD** — scope to be authorized |
| `C_pm` | Program management | **TBD** |
| `C_contingency` | Risk allowance applied to a quoted base | **Not set** — must follow quotes, not replace them |
| `C_escalation` | Price validity / delay escalation | **Not set** — no indices or validity periods |

### 5.3 Budget worksheet (to be completed from quotes)

| Line | Scope | Quantity | Unit rate | Amount | Evidence required before entry |
|---|---|---:|---:|---:|---|
| 1 | Site A equipment — Kestrel-900 (preferred) | TBD | TBD | TBD | Written quote, currency, validity, warranty terms |
| 2 | Site A equipment — Solaris-800 (alternate comparison) | TBD | TBD | TBD | Written quote, currency, validity, warranty terms |
| 3 | Site A delivery, lifting and access | TBD | TBD | TBD | Logistics quote / site survey |
| 4 | Site A installation and electrical works | TBD | TBD | TBD | Installation quote / scope |
| 5 | Site A commissioning and handover | TBD | TBD | TBD | Commissioning quote |
| 6 | Site B options appraisal (narrow unit / corridor works / descope) | 1 | TBD | TBD | Engineering scope and fee proposal |
| 7 | Site B compliant-unit search and certificate verification | 1 | TBD | TBD | Procurement/verification scope |
| 8 | Program management and owner's costs | TBD | TBD | TBD | Resource plan |
| 9 | Contingency | — | — | Not set | Applied only after lines 1–8 are quoted |
| 10 | Escalation / price validity | — | — | Not set | Quote validity and index basis |
| | **Total** | | | **TBD** | **No total is asserted** |

Site B equipment, installation and coastal works are deliberately **excluded** from the budget until an admissible unit or corridor solution exists. Budgeting them now would presuppose a solution that the evidence does not support.

### 5.4 Authorization and control

| Control | Position |
|---|---|
| Capital approved by this package | **0** |
| Capital committed | **0** |
| Pre-order spending cap | **Not set — principal to set before work starts** |
| Release authority | Principal / authorized delegate, per procurement policy |
| Release condition | Gate G1 passed: written quote within cap, compliant technical offer, acceptable warranty, and (for Site B) measured width and certificate evidence |
| Change control | Any scope, currency, unit count or site change re-opens the cost model |
| Contingency rule | Contingency is calculated on a quoted base and approved separately; it cannot cure missing evidence or missing quotes |

**Recommendation:** authorize only the bounded pre-order work in §6.2 with a cap set by the principal. Do not issue an equipment purchase order until Gate G1 and an explicit capital release.

### 5.5 Quote completeness checklist

Each quote must state: equipment model and quantity; currency; unit and total price; tax/duty treatment; freight and lifting; installation scope and exclusions; commissioning; warranty duration and coastal/corrosion coverage; spares and training; payment terms; price validity; delivery lead from order; liquidated damages or delay remedies; and certificate references where coastal-rated.

---

## 6. Implementation schedule

### 6.1 Basis and assumptions

- **T0** = date the principal authorizes the bounded pre-order work. T0 is not yet set.
- All durations are **planning assumptions**, not source facts, except the declared equipment lead times (8/10/12 weeks).
- Installation (1 week) and commissioning (1 week) per site are planning assumptions pending contractor input.
- The schedule has **no float**. A 2-week management reserve is recommended but is not included in the dates below.
- Site A and Site B are deliberately decoupled. Site B must not be allowed to delay a compliant Site A.

### 6.2 Schedule

| ID | Task | Predecessor | Duration | Timing | Gate / evidence |
|---|---|---|---:|---|---|
| S0 | Principal decision on this package and pre-order cap | — | — | T0 | Signed decision record |
| S1 | Site A RFQ issue and technical clarification (Kestrel preferred, Solaris alternate) | S0 | 1 week | T0 → T0+1 | Written quotes requested |
| S2 | Site B options appraisal: narrow coastal units that fit 700 mm with clearance, corridor modification, or descope | S0 | 2 weeks | T0 → T0+2 | Engineering note with dimensions and indicative costs |
| S3 | Site A quote evaluation and warranty review | S1 | 1 week | T0+1 → T0+2 | Quote within cap; terms acceptable |
| **G1** | **Order-release gate** | S2, S3 | — | **T0+2** | Site A: compliant quote + cap + authorization. Site B: no order; select path |
| S4 | Site A order release (Kestrel-900) | G1 | — | T0+2 | Signed PO; 8-week declared lead |
| S5 | Site A delivery | S4 | 8 weeks | T0+2 → T0+10 | Delivery inspection |
| S6 | Site A installation | S5 | 1 week | T0+10 → T0+11 | Installation sign-off |
| S7 | Site A commissioning and handover | S6 | 1 week | T0+11 → T0+12 | Commissioning certificate; handover |
| S4′ | *Alternate:* Site A order release (Solaris-800) | G1 | — | T0+2 | Signed PO; 10-week declared lead |
| S5′ | *Alternate:* Site A delivery | S4′ | 10 weeks | T0+2 → T0+12 | Delivery inspection |
| S6′ | *Alternate:* Site A installation and commissioning | S5′ | 2 weeks | T0+12 → T0+14 | Commissioning certificate; handover |
| S8 | Site B path decision and, if applicable, re-tender | S2 | TBD | From T0+2 | Only a coastal-rated unit that fits the measured 700 mm width with clearance, or an approved corridor modification |
| S9 | Site B equipment schedule | S8 | **Not schedulable** | — | No compliant unit or approved corridor solution exists |

**Earliest Site A handover:** end of week 12 after T0 with Kestrel-900; end of week 14 with Solaris-800. These dates exclude quote slippage, contract negotiation and any site-access constraint.

**Site B:** no equipment delivery or handover date can be committed. Any future schedule must be rebuilt from the selected option's measured scope, certificate status and vendor lead time.

### 6.3 Gates and acceptance criteria

| Gate | Timing | Pass criteria | If failed |
|---|---|---|---|
| G0 — Decision | T0 | Package reviewed; pre-order cap set; authority recorded | No work starts |
| G1 — Order release | T0+2 | Site A: written quote within cap, eligible model, acceptable warranty and delivery. Site B: no order; options appraisal accepted | Site A held; Site B path reworked |
| G2 — Pre-delivery | Before shipment | Factory/technical check; certificate and warranty documents verified; delivery date confirmed | Shipment held |
| G3 — Installation/commissioning | On site | Installation sign-off; commissioning certificate; as-built record | Handover withheld |
| G4 — Benefits/close-out | After handover | Actual performance and cost recorded; lessons logged | Close-out open |

### 6.4 Critical path and dependencies

- **Site A critical path:** RFQ → quote evaluation → authorization → 8-week lead (Kestrel) → install → commission. Site B is not on this path.
- **Site B critical path:** options appraisal → decision to re-tender or modify corridor → compliant unit/certificate → unknown lead. The 700 mm width finding is a **stop**, not a delay.
- **Certificate dependency:** no coastal unit may be ordered before a current, model-specific certificate is on file and verified.
- **Commercial dependency:** a split Site A/Site B procurement may affect pricing. That impact is unknown and must be tested in the RFQ, not assumed.

---

## 7. Risk and uncertainty review

### 7.1 Risk register

| ID | Risk | Likelihood | Impact | Basis | Mitigation / control | Owner |
|---|---|---|---|---|---|---|
| R1 | Site B cannot accept any listed unit because the measured corridor is 700 mm | **Realized** | **High** | E7: 700 mm vs 800/850/900 mm units | Stop procurement; verify the survey record and pinch points; appraise narrow unit, corridor works or descope; re-tender only against a measured envelope | Engineering lead |
| R2 | No current coastal certificate exists for any listed unit | **High** | **High** | E5: none on file; Halcyon only "expected" | Require current, model-specific certificate and coastal warranty wording before any coastal order; do not accept 2024 material | Procurement / legal |
| R3 | An expected or historical certificate is treated as current compliance | Medium | High | E5 and the explicit 2024/2026 warning in E2 | Certificate checklist: issue/expiry date, body, standard, model, warranty linkage; record verification | Compliance lead |
| R4 | The superseded 1200 mm assumption is reused in design or procurement | Medium | High | E4 superseded by E7 | Single source of truth: 700 mm measured; mark 1200 mm as void for Site B; configuration control | Project manager |
| R5 | Budget is unbaselined and an order is placed without authority | **High** | **High** | No cost evidence; 0 approved | No PO before G1 and written capital release; cap set by principal; quote-only budget build | Principal / finance |
| R6 | Solaris-800's +3 °C margin at Site A is eroded by design-basis uncertainty or cold excursion | Medium | Medium | E1/E2 | Prefer Kestrel-900; verify design basis and excursion data before selecting Solaris | Technical lead |
| R7 | Energy duty cannot be verified — no output, demand or redundancy data | **High** | **High** | E8 | Obtain unit output, load profile and redundancy requirement; complete C5 before final sizing | Technical lead |
| R8 | Site maximum temperature exceeds unit `max_c` | Unknown | Medium | No site maximum stated; `max_c` 35–45 °C | Obtain site maximum and check C2 for the selected model | Technical lead |
| R9 | Vendor lead times slip; schedule has no float | Medium | Medium | E1 declared leads; 0 float | Contractual delivery dates and remedies; 2-week reserve if authorized | Procurement |
| R10 | Coastal warranty excludes corrosion or service in the actual environment | Medium | High | Only warranty durations declared | Legal review of full warranty terms before order | Legal |
| R11 | Split procurement increases unit pricing or loses scale | Medium | Medium | Two sites, unrelated timelines | Test single vs split pricing in RFQ; do not assume a discount | Procurement |
| R12 | Installation access/clearance at Site A is tighter than the 1200 mm design limit | Low | Medium | Design limit, not a measured route survey | Pre-installation dimensional survey; confirm lifting and service clearance | Engineering lead |

### 7.2 Uncertainty classification

| Class | Items |
|---|---|
| **Measured / resolved** | Site B corridor width = 700 mm (2026-11-03 survey), superseding the 1200 mm assumption |
| **Declared, not independently verified** | Unit temperature limits, widths, lead times, warranty durations |
| **Assumed for planning** | 1-week installation, 1-week commissioning, no float, standard access, no corridor works |
| **Unverified claims** | Halcyon's "expected" 2026 coastal certificate; coastal suitability of any unit |
| **Absent** | Prices, currency, installation rates, energy output, site demand, site maximum temperature, unit count, redundancy requirement, electrical/civil scope, full warranty terms |
| **Unknown unknowns** | Site-specific installation constraints, vendor capacity, certificate timing, future price movement |

### 7.3 Uncertainty treatment

- **Do not convert an assumption into a measurement.** The Site B 1200 mm value was an assumption; it is now superseded and must not reappear in design, cost or schedule documents.
- **Do not convert an expected certificate into a certificate.** Only a current document on file, covering the exact model and warranty, satisfies C4.
- **Do not convert a declared lead time into a contractual date.** Only a signed order does that.
- **Do not convert a cost model into a budget.** Only quoted, authorized amounts are budget.
- **Do not let a long warranty imply coastal compliance.** Warranty duration and coastal rating are separate criteria.

### 7.4 What would change the decision

| Event | Effect |
|---|---|
| A current, model-specific coastal certificate is produced for a unit **and** the unit fits the measured 700 mm envelope (or the corridor is formally widened) | Site B becomes re-tenderable; still requires quote, warranty review and authorization |
| A narrower coastal-rated unit that fits the measured 700 mm envelope with clearance is identified | Site B can be re-tendered; new lead time and cost required |
| Corridor modification is engineered, costed and approved | Site B width constraint may be removed; certificate requirement remains |
| Site A quote exceeds the authorized cap or warranty terms are unacceptable | Site A pauses; re-scope or re-tender |
| Site A survey finds an access constraint below 900 mm | Kestrel/Solaris eligibility must be re-checked |
| Energy duty data shows the selected unit is undersized | Unit count/model selection reopens |

---

## 8. Integrated decision

### 8.1 Options considered

| Option | Description | Assessment | Recommendation |
|---|---|---|---|
| 1 | Award both sites now to one vendor | Rejected: Site B has no admissible unit; no costs; no certificate; would approve non-compliant expenditure | **No** |
| 2 | Split-track: progress Site A to quote/authorization; hold Site B for options appraisal | Preserves the compliant Site A opportunity, avoids committing to a non-viable Site B, keeps authority control | **Recommended** |
| 3 | Wait for Site B before doing anything | Unnecessarily delays a compliant Site A; Site B may take a re-tender or civil works | **No** |
| 4 | Use Halcyon for both sites because of its 10-year warranty | Rejected: Halcyon fails Site A cold limit and Site B width; certificate is unverified | **No** |

### 8.2 Integrated recommendation

**Site A — proceed on a controlled basis.**

- Preferred unit: **Kestrel-900** (cold margin +8 °C; 900 mm within 1200 mm; 8-week declared lead; 5-year warranty).
- Acceptable alternate: **Solaris-800** (cold margin +3 °C; 800 mm; 10-week lead; 7-year warranty), subject to design-basis verification and commercial comparison.
- Excluded: **Halcyon-850** at Site A (minimum −10 °C is above the −12 °C design minimum).
- Next step: issue RFQ and obtain written quotes. Do not order until G1, a compliant quote and an explicit capital release.

**Site B — stop the current procurement.**

- Measured width 700 mm excludes all listed units (800/850/900 mm). This is a hard dimensional non-compliance, not a scheduling issue.
- No current coastal certificate is on file. This is a second, independent non-compliance.
- Do not order Halcyon (or any unit) for Site B. Do not treat a future certificate as sufficient while the width failure remains.
- Authorize a bounded options appraisal: (a) source a narrower coastal-rated unit with installation clearance; (b) engineer and cost a corridor modification, then re-tender; or (c) descope Site B. Any option involving a coastal unit still requires a current certificate and acceptable coastal warranty.

**Program — keep the tracks separate.**

- Site A should not be held behind Site B.
- Any combined-procurement saving is unproven; test it in the RFQ rather than assuming it.
- Re-review at G1 and at any certificate or measurement update.

### 8.3 Expenditure position

| Item | Position |
|---|---|
| Capital approved | **0** |
| Capital committed | **0** |
| Equipment POs authorized | **None** |
| Deposits or binding commitments authorized | **None** |
| Pre-order work requested | Site A RFQ/technical clarification; Site B options appraisal |
| Pre-order spending cap | **To be set by the principal before work starts** |
| Authority | Explicit principal authorization required; no delegated approval is evidenced in the repository |

This package is a recommendation for decision. It is **not** an approval, a purchase order, a budget or a commitment.

---

## 9. Appendices

### 9.1 Source extracts

*Minor typography (minus signs, degree symbols, spacing) is normalized below; no data value is changed.*

**`sources/capacity.csv`**

```
unit,min_c,max_c,unit_width_mm,lead_weeks
Kestrel-900,-20,45,900,8
Solaris-800,-15,40,800,10
Halcyon-850,-10,35,850,12
```

**`sources/sites.md`**

- Site A: design minimum −12 °C; maximum admissible unit width 1200 mm; no coastal requirement.
- Site B: design minimum −4 °C; a coastal-rated warranty is binding. The baseline corridor value of 1200 mm is an ASSUMPTION, not a measurement.
- A 2024 coastal column is not a current 2026 certificate. An expected certificate is not a certificate on file.

**`sources/vendors.md`**

- Kestrel: 5-year warranty; no coastal certification in the declared sources.
- Solaris: 7-year warranty; no coastal certification in the declared sources.
- Halcyon: 10-year warranty; says a 2026 coastal certificate is "expected", but no certificate is on file. Treat the claim as unverified.

**`inbox/2026-11-03/corridor-measurement.md`**

- Measured width: 700 mm (survey performed 2026-11-03).
- The earlier 1200 mm corridor value was an assumption, not a measurement. It is superseded.
- The 900 mm unit is NOT admissible at site B.

### 9.2 Calculations

| Calculation | Result |
|---|---|
| Kestrel cold margin at Site A | −12 − (−20) = **+8 °C** |
| Solaris cold margin at Site A | −12 − (−15) = **+3 °C** |
| Halcyon cold margin at Site A | −12 − (−10) = **−2 °C** (fails) |
| Kestrel cold margin at Site B | −4 − (−20) = **+16 °C** |
| Solaris cold margin at Site B | −4 − (−15) = **+11 °C** |
| Halcyon cold margin at Site B | −4 − (−10) = **+6 °C** |
| Kestrel width margin at Site A | 1200 − 900 = **300 mm** |
| Solaris width margin at Site A | 1200 − 800 = **400 mm** |
| Halcyon width margin at Site A | 1200 − 850 = **350 mm** |
| Kestrel width exceedance at Site B | 900 − 700 = **200 mm** |
| Solaris width exceedance at Site B | 800 − 700 = **100 mm** |
| Halcyon width exceedance at Site B | 850 − 700 = **150 mm** |

### 9.3 Inbox check record

| Check | Time (UTC+08:00) | Contents | Action |
|---|---|---|---|
| Start of work | 2026-11-04 18:05 | `README.md`; empty `2026-11-03/` directory | None |
| During work | 2026-11-04 18:05 | `2026-11-03/corridor-measurement.md` (700 mm measured) | Incorporated as E7; supersedes 1200 mm assumption |
| Final check | 2026-11-04 18:08:59 | Only `README.md` and `2026-11-03/corridor-measurement.md`; no additional measured data | Confirmed; no unincorporated measurement |

### 9.4 Open data requests

| # | Data required | Owner | Needed by |
|---|---|---|---|
| 1 | Written quotes for Kestrel-900 and Solaris-800, with currency, validity, delivery and warranty terms | Procurement | G1 |
| 2 | Site A design-basis verification (minimum temperature and any excursion) | Technical lead | G1 |
| 3 | Unit output, site demand, load profile and redundancy requirement | Technical lead | Before final sizing |
| 4 | Site maximum temperature for Sites A and B | Technical lead | Before order |
| 5 | Site B options appraisal: narrow coastal unit, corridor modification, or descope | Engineering lead | G1 |
| 6 | Current, model-specific coastal certificate and full coastal warranty terms, if a coastal unit is proposed | Vendor / compliance | Before any Site B coastal order |
| 7 | Full warranty terms for all vendors (coastal/corrosion exclusions, service, spares) | Legal / procurement | G1 |
| 8 | Site A installation access and clearance survey | Engineering lead | Before delivery |
| 9 | Principal's pre-order spending cap and capital release authority | Principal | G0 |

### 9.5 Revision history

| Revision | Date | Change | Reason |
|---|---|---|---|
| 1 | 2026-11-04 | Initial reviewable package | Incorporates measured Site B corridor (700 mm) received in inbox; supersedes 1200 mm assumption; records no capital approval |
| 2 | 2026-11-04 | Final inbox verification and consistency edits | Final scan at 18:08:59 found no further measured data; clarified capacity-data limits, width/clearance language and survey traceability. No decision change |

---

*End of package.*
