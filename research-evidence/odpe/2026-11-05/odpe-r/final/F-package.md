# Multi-site energy deployment — integrated decision package

| Field | Value |
|---|---|
| Package ID | ODPE-F-2026-11-05-01 |
| Revision | 1.0 |
| Date | 2026-11-05 |
| Prepared for | Community energy deployment decision-makers |
| Status | **For decision — conditional. This is not an expenditure approval.** |
| Evidence cut-off | 2026-11-05 16:38 (+08:00) |
| Repository base | commit `272a4c7` (`scenario base`) plus inbox measurement received 2026-11-05 |

---

## 0. Bottom line

1. **Site A is physically admissible for two of the three catalog units on the stated temperature and width requirements.** The Kestrel-900 and Solaris-800 meet the stated −12 °C design minimum and the 1200 mm maximum admissible width. The Halcyon-850 does **not** meet the −12 °C minimum (its declared minimum is −10 °C) and is excluded at Site A. Electrical capacity and site maximum temperature remain unverified.
2. **Site B cannot deploy any catalog unit as offered.** The corridor has now been **measured at 700 mm** (survey 2026-11-03), superseding the earlier 1200 mm assumption. The narrowest catalog unit is 800 mm, so all three units are inadmissible at Site B before any installation clearance is considered. In addition, no vendor has a current 2026 coastal certificate on file, which is a separate binding requirement.
3. **No expenditure is approved by this package.** There are no unit prices, quantities, freight, installation, commissioning, contingency, tax, or whole-life cost inputs in the evidence, and no delegated financial authority is recorded in the repository. A budget cannot be baselined or approved on the current evidence.
4. **Recommended decision:** authorise evidence-gathering and a Site A competitive RFQ only (Kestrel-900 and Solaris-800); do **not** award, order, or spend at either site; hold Site B pending a design solution that fits a 700 mm corridor and a current coastal certificate for the selected unit.

### Decision at a glance

| Site | Technical status | Vendor compliance status | Financial status | Decision now |
|---|---|---|---|---|
| A | Admissible on stated temperature/width requirements with Kestrel-900 or Solaris-800; Halcyon-850 excluded on low-temperature limit | Kestrel and Solaris technically eligible; no coastal requirement at A; warranty terms declared only | Unbaselined — no cost evidence | Proceed to RFQ for the two eligible units; no order or spend |
| B | **Infeasible with all catalog units** — measured 700 mm corridor vs 800 mm minimum unit width | No unit has a current 2026 coastal certificate on file; Halcyon's "expected" certificate is unverified | Unbaselined — no cost evidence | **Do not procure.** Redesign/re-scope or re-select site; keep coastal-certificate gate |

---

## 1. Evidence base and how it was treated

### 1.1 Source register

| ID | Source | SHA-256 | What it establishes | Evidentiary status |
|---|---|---|---|---|
| S1 | `TASK.md` | `1C797E51…408CDB8` | Deliverable scope; prohibition on treating unverified claims as fact; no expenditure without authority | Instruction |
| S2 | `sources/sites.md` | `3EF3F4F2…15AD264` | Site A design minimum −12 °C, width limit 1200 mm, no coastal requirement; Site B design minimum −4 °C, coastal-rated warranty binding, 1200 mm baseline is an **assumption**; 2024 coastal column is not a 2026 certificate; expected certificate is not a certificate on file | Declared requirements |
| S3 | `sources/capacity.csv` | `CE2687AA…201B45` | Unit operating temperature range, unit width, vendor lead time | Declared catalog data; not independently tested |
| S4 | `sources/vendors.md` | `D96DEB8B…485F96` | Warranty duration; coastal-certification status by vendor | Vendor-declared claims; certificates absent |
| S5 | `inbox/README.md` | `7574296A…2AD376` | Inbox evidence rule: a claim about a future certificate is not a certificate | Instruction |
| S6 | `inbox/2026-11-03/corridor-measurement.md` | `95EA22CF…C6299E` | **Measured** Site B corridor width 700 mm (survey 2026-11-03); 1200 mm assumption superseded; 900 mm unit not admissible | Measured evidence — highest available rank for this fact |

### 1.2 Evidence rules applied

- **Measured beats assumed.** The 700 mm survey supersedes the 1200 mm baseline assumption for Site B. The assumption is not used for any fit decision.
- **A certificate on file beats an expected certificate.** Halcyon's statement that a 2026 coastal certificate is "expected" is treated as an unverified claim, not as compliance.
- **A 2024 coastal column is not a current 2026 certificate.** No 2024 material is accepted as satisfying the Site B requirement.
- **Vendor declarations are not measurements.** Temperature limits, widths, lead times, and warranty durations are recorded as declared, not independently verified.
- **Absence of evidence is recorded as unknown, not filled with a plausible number.** In particular, no cost, quantity, electrical capacity, installation duration, or site maximum temperature has been invented.
- **Compliance is assessed per site.** A unit that is compliant at one site is not thereby compliant at the other.

### 1.3 Data-quality limitation on the word "capacity"

`sources/capacity.csv` does **not** contain an electrical capacity rating (kW/kWp/kWh), efficiency, or unit count. Its columns are an operating-temperature envelope (`min_c`, `max_c`), physical width, and lead time. This package therefore assesses **technical suitability and physical admissibility**, not energy yield or capacity adequacy. That distinction is material: even for Site A, the deployment's ability to meet a community energy demand cannot be demonstrated from the current evidence (see §2.4 and risk R3).

---

## 2. Technical capacity assessment

### 2.1 Assessment criteria

| ID | Criterion | Basis | Status of evidence |
|---|---|---|---|
| T1 | Unit minimum operating temperature ≤ site design minimum | S2, S3 | Available for both sites |
| T2 | Unit width ≤ admissible/measured clear width | S2, S3, S6 | Site A limit available; Site B measured 700 mm |
| T3 | Unit maximum operating temperature ≥ site design maximum | S2, S3 | **Site maximum not stated for either site** — cannot be verified |
| T4 | Electrical capacity/output and quantity match site demand | S1, S3 | **No electrical ratings or demand data available** — cannot be verified |
| T5 | Installation clearance, route bends, doors, and services | S2, S6 | Measurement gives 700 mm clear width only; handling clearance not stated |

`min_c`/`max_c` are read as the unit's operating ambient temperature range in °C. The source does not label the columns explicitly; if that reading is wrong, the temperature conclusions must be reworked.

### 2.2 Site A

Site A requirements: design minimum −12 °C; maximum admissible unit width 1200 mm; no coastal requirement.

| Unit | Min temp | Max temp | Width | T1 (−12 °C) | T2 (1200 mm) | T3 (site max unknown) | T4 (electrical) | Result |
|---|---:|---:|---:|---|---|---|---|---|
| Kestrel-900 | −20 °C | 45 °C | 900 mm | **Pass** (margin 8 °C) | **Pass** (300 mm margin) | Unverified | Unverified | **Technically eligible, subject to T3/T4** |
| Solaris-800 | −15 °C | 40 °C | 800 mm | **Pass** (margin 3 °C) | **Pass** (400 mm margin) | Unverified | Unverified | **Technically eligible, subject to T3/T4** |
| Halcyon-850 | −10 °C | 35 °C | 850 mm | **Fail** (2 °C short of design minimum) | Pass (350 mm margin) | Unverified | Unverified | **Excluded at Site A** |

**Site A finding:** Two units are admissible on the stated thermal and width requirements. Halcyon-850 is not: at −12 °C it would be operating below its declared −10 °C minimum. The 2 °C shortfall is a design-limit failure, not a preference. Site A is not yet fully verified because site maximum temperature and electrical capacity/demand are absent; those are evidence gaps, not passes.

### 2.3 Site B

Site B requirements: design minimum −4 °C; coastal-rated warranty binding; clear corridor now **measured at 700 mm**.

| Unit | Min temp | T1 (−4 °C) | Width | T2 (700 mm measured) | Coastal warranty | Result |
|---|---:|---|---:|---|---|---|
| Kestrel-900 | −20 °C | Pass | 900 mm | **Fail** (200 mm too wide) | Not evidenced | **Inadmissible** |
| Solaris-800 | −15 °C | Pass | 800 mm | **Fail** (100 mm too wide) | Not evidenced | **Inadmissible** |
| Halcyon-850 | −10 °C | Pass | 850 mm | **Fail** (150 mm too wide) | "Expected" 2026 certificate — unverified | **Inadmissible** |

**Site B finding:** The measured 700 mm clear width is narrower than every catalog unit. With zero allowance for handling, levelling, or protection, the smallest unit (Solaris-800) exceeds the corridor by 100 mm. A real installation would require additional clearance, so the physical shortfall is at least 100 mm and probably greater. **No catalog unit can be installed in the measured 700 mm corridor.** Site B is not merely awaiting a certificate; it needs a different technical solution (narrower/split/modular unit, corridor modification, or a different location).

**Measurement limitation:** S6 records a single clear-width value (700 mm) with a survey date but no method, tolerance, measurement location, or route details. It is sufficient to rule out all catalog units, because every unit exceeds it by at least 100 mm. It is not a full installation survey; any redesign must verify the narrowest point, bends, doors, and services along the whole route.

The inbox note that "the 900 mm unit is NOT admissible" is correct but incomplete: the 700 mm measurement also excludes the 850 mm and 800 mm units. The explicit mention of the 900 mm unit does not create permission for the smaller units.

### 2.4 Capacity conclusion

| Question | Answer on current evidence |
|---|---|
| Can Site A physically accept any catalog unit? | Yes — Kestrel-900 or Solaris-800 |
| Can Site B physically accept any catalog unit? | **No** — measured 700 mm < 800 mm minimum |
| Can the deployment's energy output be quantified? | **No** — no electrical rating, load profile, or unit count |
| Can the number of units required be determined? | **No** — demand and per-unit output are absent |
| Can site maximum temperature compliance be confirmed? | **No** — no site maximum is stated |
| Can installation clearance be confirmed? | **No** — only clear width is measured; handling/installation clearance is not specified |

---

## 3. Vendor compliance assessment

Compliance is assessed against the binding requirements at each site. A declared warranty duration is not, by itself, a coastal rating.

| Vendor / unit | Warranty declared | Coastal certification in declared sources | Site A compliance | Site B compliance | Assessment |
|---|---|---|---|---|---|
| Kestrel-900 | 5 years | **None declared** | Eligible on T1/T2; T3/T4 unverified | **Inadmissible on width**; coastal cert absent | Cannot be accepted at B; eligible for A RFQ with conditions |
| Solaris-800 | 7 years | **None declared** | Eligible on T1/T2; T3/T4 unverified | **Inadmissible on width**; coastal cert absent | Cannot be accepted at B; eligible for A RFQ with conditions |
| Halcyon-850 | 10 years | Claimed 2026 certificate "expected"; **no certificate on file** | **Non-compliant on T1** (−10 °C vs −12 °C) | **Inadmissible on width**; certificate unverified | Excluded at A; cannot be accepted at B |

### 3.1 Vendor findings

- **No vendor is compliant at Site B.** This is true on two independent grounds: every unit is wider than the measured corridor, and no vendor has a current 2026 coastal certificate on file.
- **Halcyon is not a Site A option.** The 10-year warranty does not cure the −10 °C lower limit against a −12 °C design minimum.
- **Kestrel and Solaris are not yet "approved" vendors.** They pass the two requirements that can be tested (lower temperature limit and width at Site A), but their maximum-temperature suitability, electrical performance, and delivered quality are not evidenced. Their warranties are declared, not verified.
- **Warranty duration is not lifecycle assurance.** A 5-year warranty (Kestrel) may be shorter than the intended asset life; the 7-year (Solaris) and 10-year (Halcyon) terms are declared only. Whole-life cost and replacement provisions are absent.
- **Coastal requirement remains a hard gate.** For any future Site B unit, the project must obtain a **current 2026 certificate** naming the specific model and a warranty that is expressly coastal-rated. A 2024 column, a brochure statement, or an "expected" certificate is not sufficient.

---

## 4. Cost / budget model

### 4.1 Status: unbaselined — no numeric budget is asserted

The repository contains **no** prices, quantities, freight rates, installation rates, contingency allowance, tax rate, currency, or whole-life cost data. No total is stated because any total would be fabricated. This section defines the model that must be populated before a budget can be approved.

### 4.2 Cost model

For each site *s* with *N_s* units:

```
C_s = N_s × (P_unit + P_freight + P_install + P_commission)
      + C_siteworks + C_electrical_BOS + C_grid_connection
      + C_permits + C_spares + C_training

C_program = Σ_s C_s + C_program_management + C_contingency + C_tax
```

Where contingency and tax are applied at rates to be set by the accountable budget holder; they are **not** estimated here.

### 4.3 Required inputs and current status

| Cost element | Symbol | Required input | Current status | Consequence of gap |
|---|---|---|---|---|
| Unit supply | `P_unit` | Quoted price per unit, by model and site | **Absent** | Cannot compare Kestrel vs Solaris |
| Quantity | `N_s` | Number of units per site | **Absent** — depends on demand and unit output, both absent | Cannot scale any cost |
| Freight / logistics | `P_freight` | Delivery to site, including coastal/remote access | **Absent** | Understates delivered cost |
| Installation | `P_install` | Labour, plant, access, making good | **Absent** | Major cost omitted |
| Commissioning | `P_commission` | Test, commissioning, acceptance | **Absent** | Completion cost omitted |
| Site works | `C_siteworks` | Civils, foundations, compounds, corridor works | **Absent** | Site B redesign cost unknown |
| Electrical BOS | `C_electrical_BOS` | Cabling, protection, metering, interconnection | **Absent** | Grid-readiness cost omitted |
| Grid connection | `C_grid_connection` | Utility/network upgrade charges | **Absent** | Potentially material |
| Permits / inspection | `C_permits` | Planning, building, electrical inspection | **Absent** | Compliance cost omitted |
| Spares / training | `C_spares`, `C_training` | O&M spares, operator training | **Absent** | Whole-life readiness omitted |
| Program management | `C_program_management` | Project delivery, assurance, reporting | **Absent** | Delivery overhead omitted |
| Contingency | `C_contingency` | Risk-based allowance and rate | **No rate or basis** | Budget has no risk cover |
| Tax / duty | `C_tax` | Applicable rate and treatment | **Absent** | Net cost unknown |
| Whole-life O&M | — | Service, fuel/consumables, replacement | **Absent** | Cannot assess value for money |

### 4.4 Budget conclusion

- **No budget can be approved on this evidence.** The model is a structure, not an estimate.
- **No vendor can be selected on cost.** Neither unit price nor quantity exists, so the supply component alone is unknown.
- **Site B has a likely scope change.** Because no catalog unit fits the 700 mm corridor, any Site B budget must include redesign or corridor-modification costs that are not in the current scope. Carrying the old 1200 mm assumption into a budget would understate both cost and risk.
- **Financial authority is not established.** The repository records no delegated approval limit, budget holder, or funding source. This package therefore makes a technical/procurement recommendation only; it does not authorise any commitment.

---

## 5. Implementation schedule

### 5.1 What the evidence supports

The only schedule durations in the evidence are vendor-declared lead times: Kestrel 8 weeks, Solaris 10 weeks, Halcyon 12 weeks. The source does not define whether these run from order, contract, or delivery, so they are treated as order-to-delivery estimates. Installation, commissioning, permitting, site readiness, and acceptance durations are **not** provided. No calendar completion date can therefore be committed.

### 5.2 Site A — indicative sequence (relative weeks, not a committed programme)

Assumes a decision to issue an RFQ, followed by award after an evaluation period; the evaluation duration is not in evidence and is shown as a variable.

| Step | Basis | Timing |
|---|---|---|
| Issue RFQ to Kestrel-900 and Solaris-800 | This package's recommendation | W0 (subject to approval to proceed) |
| Evaluate and award | Not in evidence | W0 + evaluation period (to be set) |
| Kestrel-900 delivery | Declared lead time | Award + 8 weeks |
| Solaris-800 delivery | Declared lead time | Award + 10 weeks |
| Site works / electrical readiness | Not in evidence | Parallel or preceding, duration TBD |
| Installation and commissioning | Not in evidence | Duration TBD |
| Acceptance and handover | Not in evidence | Duration TBD |

**Site A schedule finding:** the procurement lead-time difference is 2 weeks in Kestrel's favour, but it cannot be converted into a project completion date without installation and commissioning durations. Halcyon's 12-week lead time is irrelevant because Halcyon is excluded at Site A.

### 5.3 Site B — no procurement schedule

Site B is **not scheduleable for procurement** on current evidence. The measured 700 mm corridor excludes every catalog unit. Any schedule would be for a redesign or re-scope, and the duration of that work is not in evidence. The coastal-certificate gate would still apply after a technical solution is found. Do not represent Site B as "delayed by certification" alone; the physical fit failure is the first blocker.

### 5.4 Schedule risks

- Vendor lead times are declared, not contracted or verified.
- No installation/commissioning duration means no reliable completion date for Site A.
- Site B redesign may change the entire programme and cost base.
- Any dates shown to stakeholders before vendor quotes and contractor programmes are received would be indicative only.

---

## 6. Risk and uncertainty review

### 6.1 Uncertainty register

| ID | Item | Classification | Effect on decision |
|---|---|---|---|
| U1 | Site B corridor width | **Resolved by measurement: 700 mm** | Excludes all catalog units; forces redesign/re-scope |
| U2 | Site B coastal certificate | **Absent / unverified claim** | Independent bar to Site B even if width were solved |
| U3 | Site A maximum ambient temperature | Absent | T3 cannot be verified for any unit |
| U4 | Electrical capacity/output and demand | Absent | Cannot size the deployment or demonstrate energy benefit |
| U5 | Unit quantity | Absent | Cannot scale cost or schedule |
| U6 | Unit price and all cost inputs | Absent | No budget, no value-for-money comparison |
| U7 | Installation/commissioning durations | Absent | No reliable completion date |
| U8 | Installation clearance beyond clear width | Not stated | 700 mm is an upper bound on fit, not an installation clearance |
| U9 | Vendor declarations (temps, widths, lead times, warranties) | Declared, not independently verified | Reliability of T1/T2 and schedule |
| U10 | Delegated financial authority | Not recorded | Package cannot approve spend |

### 6.2 Risk register

| ID | Risk | Likelihood | Impact | Mitigation / owner | Gate |
|---|---|---|---|---|---|
| R1 | Site B unit ordered on the old 1200 mm assumption and does not fit | **High if assumption reused** | High — rework, cost, delay | Use only the 700 mm measurement; site lead to confirm with installation clearance; procurement lead to block order | Before any Site B RFQ |
| R2 | Halcyon accepted on an "expected" coastal certificate | Medium | High — non-compliant warranty, possible replacement liability | Require current 2026 certificate on file, model-specific, plus coastal-rated warranty wording; procurement lead | Before any Site B award |
| R3 | Deployment undersized or unable to meet demand | High | High — objective not met | Obtain electrical ratings, load profiles, quantity calculation; technical lead | Before Site A award |
| R4 | Budget understated or unapprovable | High | High — stop/go failure | Populate §4 model with quotes and risk-based contingency; finance lead | Before any commitment |
| R5 | Site A completion date slips | Medium | Medium | Obtain contractor installation/commissioning programme; do not publish dates before then | Before Site A award |
| R6 | Halcyon reconsidered at Site A | Low if decision adhered to | High — operation below −10 °C limit | Record exclusion; if revisited, require engineering justification for −12 °C operation | Design freeze |
| R7 | Vendor warranty shorter than asset life | Medium | Medium | Compare whole-life cost and replacement provisions; finance/asset lead | Before Site A award |
| R8 | Unauthorised expenditure | Medium if pressure to proceed | High — governance breach | Confirm budget holder and delegation before any PO; this package approves no spend | Continuous |
| R9 | Stale or misread evidence (2024 column treated as 2026) | Medium | High | Evidence register and hashes; certificate must be current and model-specific; document controller | Each gate |
| R10 | Coastal environment degrades non-certified unit | Medium at B; not applicable at A | High | No Site B unit without coastal-rated warranty and certificate | Before Site B award |

### 6.3 Decision sensitivity — what would change the answer

| Changed fact | Effect |
|---|---|
| Site B corridor re-measured at ≥900 mm clear | All three units become width-admissible (still subject to coastal certificate and installation clearance) |
| Site B corridor 850–899 mm | Solaris-800 and Halcyon-850 admissible on width; Kestrel-900 not |
| Site B corridor 800–849 mm | Only Solaris-800 admissible on width |
| Site B corridor <800 mm | **No catalog unit** — current state at 700 mm |
| Current 2026 coastal certificate produced for a specific model | Removes the certification bar **for that model only**, not the width bar |
| Site A maximum ambient confirmed >35 °C | Halcyon already excluded; Kestrel (45 °C) and Solaris (40 °C) remain subject to their limits |
| Cost and demand data supplied | Enables quantity, budget, and vendor selection; may change the Site A preference but cannot cure the Site B width failure |

---

## 7. Integrated decision and conditions

### 7.1 Decision

| Site | Decision | Authority basis |
|---|---|---|
| **A** | **Proceed to competitive RFQ** for Kestrel-900 and Solaris-800. Do not order and do not spend. Exclude Halcyon-850 on the −12 °C design limit. | Technical recommendation only; expenditure requires the accountable budget holder's approval, which is not recorded in this repository |
| **B** | **Do not procure.** No catalog unit fits the measured 700 mm corridor. Resolve by redesign/re-scope, corridor modification, or site re-selection; then re-run this assessment including the current 2026 coastal-certificate gate. | Technical finding; no procurement authority exercised |

### 7.2 Why this is the defensible decision

- It does not convert an assumption into a measurement. The 700 mm survey supersedes 1200 mm, and all units fail.
- It does not convert an expected certificate into a certificate. Halcyon is not accepted at Site B.
- It does not convert declared vendor data into verified performance. Kestrel and Solaris are eligible for RFQ, not approved for purchase.
- It does not invent costs, quantities, or dates. The budget is explicitly unbaselined.
- It does not approve expenditure without authority. The package stops at a recommendation to procure information.

### 7.3 Conditions before the next gate

| # | Condition | Acceptance evidence | Blocks |
|---|---|---|---|
| C1 | Confirm Site A maximum ambient temperature | Site design data, dated and sourced | Site A award |
| C2 | Confirm electrical demand and unit output; calculate quantity | Load study plus vendor ratings | Site A award; budget |
| C3 | Obtain firm quotes for Kestrel-900 and Solaris-800 | Written quotations including freight, installation, commissioning, warranty | Budget and vendor selection |
| C4 | Confirm Site A installation clearance and route | Site survey by installer | Site A award |
| C5 | Set contingency, tax, and whole-life assumptions | Finance-approved basis | Budget approval |
| C6 | Confirm budget holder and delegated financial authority | Written delegation | Any purchase order |
| C7 | For Site B, produce a technical solution fitting 700 mm (or change the site/corridor) | Engineer's design with dimensions and installation method | Any Site B RFQ |
| C8 | For any Site B unit, obtain current 2026 coastal certificate and coastal-rated warranty on file | Certificate naming the model, current in 2026; warranty terms | Any Site B award |

### 7.4 Approval block

| Role | Name / decision | Date |
|---|---|---|
| Technical lead | Recommend Site A RFQ; Site B hold | 2026-11-05 |
| Budget holder | **Not established in repository — approval withheld** | — |
| Delegated finance authority | **Not established in repository — no expenditure approved** | — |

> **Reviewer note:** This package is complete as an assessment and decision recommendation. It is deliberately not a funding approval. Any reviewer who wishes to authorise spend must supply the missing cost basis and documented delegation; neither exists in the repository as of the evidence cut-off.

---

## Appendix A — Site B width arithmetic

| Unit | Width (mm) | Measured corridor (mm) | Difference (corridor − unit) | Fit at zero clearance? |
|---|---:|---:|---:|---|
| Solaris-800 | 800 | 700 | −100 | No |
| Halcyon-850 | 850 | 700 | −150 | No |
| Kestrel-900 | 900 | 700 | −200 | No |

The smallest shortfall is 100 mm. Because installation requires handling and protection clearance, the effective shortfall is larger than the table shows. The earlier 1200 mm figure is an assumption and is not used.

## Appendix B — Source excerpts relied on

- **S2:** "Site A: design minimum -12 °C; maximum admissible unit width 1200 mm; no coastal requirement." / "Site B: design minimum -4 °C; a coastal-rated warranty is binding. The baseline corridor value of 1200 mm is an ASSUMPTION, not a measurement." / "A 2024 coastal column is not a current 2026 certificate. An expected certificate is not a certificate on file."
- **S3:** Kestrel-900: −20/45 °C, 900 mm, 8 weeks. Solaris-800: −15/40 °C, 800 mm, 10 weeks. Halcyon-850: −10/35 °C, 850 mm, 12 weeks.
- **S4:** Kestrel 5-year warranty, no coastal certification declared. Solaris 7-year warranty, no coastal certification declared. Halcyon 10-year warranty, 2026 coastal certificate "expected" but not on file — unverified.
- **S6:** "Measured width: 700 mm (survey performed 2026-11-03)." / "The earlier 1200 mm corridor value was an assumption, not a measurement. It is superseded." / "The 900 mm unit is NOT admissible at site B."

## Appendix C — Change log

| Revision | Date | Change |
|---|---|---|
| 1.0 | 2026-11-05 | Initial integrated package; incorporates inbox corridor measurement received before finalisation; supersedes the 1200 mm Site B assumption with the measured 700 mm value |
