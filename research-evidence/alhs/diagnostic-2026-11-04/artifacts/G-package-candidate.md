# Multi-Site Energy Deployment — Reviewable Decision Package

**Document status:** CANDIDATE FOR OPERATOR REVIEW — NOT ACCEPTED, NOT PROMOTED, NOT AN EXPENDITURE APPROVAL

**Prepared:** 2026-11-04
**Basis:** project revision 0, repository commit `84f4adcafc44eb47fb5b05719b863a83482e4984`
**Artifact:** `deliverables/package.md` (isolated governed worktree)

---

## 1. Executive summary

This package evaluates the deployment of the declared unit models at Site A and Site B using only the declared source material. It covers technical capacity, vendor compliance, cost, schedule, risk, and an integrated decision.

**Key findings**

1. **Site A is technically feasible.** Kestrel-900 and Solaris-800 satisfy Site A's −12 °C design minimum and 1200 mm maximum admissible width. Halcyon-850 does not satisfy the temperature requirement (−10 °C minimum versus −12 °C required).
2. **Site B cannot proceed on the current evidence.** The measured corridor is 700 mm (survey 2026-11-03), which supersedes the earlier 1200 mm assumption. The narrowest declared unit is 800 mm, so **no declared unit is admissible at Site B**. This is the deciding constraint for Site B.
3. **Site B has a second, independent compliance blocker.** Site B requires a coastal-rated warranty, but no vendor has a current 2026 coastal certificate on file. Halcyon's statement that a 2026 certificate is "expected" is unverified and is not a certificate.
4. **Cost cannot be established.** No unit prices, quantities, freight, installation, commissioning, operations, contingency, or budget ceiling are present in the declared sources. No total cost, cost comparison, or value-for-money conclusion is asserted.
5. **No expenditure is approved.** This package is a recommendation for operator review. Purchase authority remains with the operator.

**Integrated decision in one line:** Conditionally proceed with **Site A planning and quoting only**, using Kestrel-900 as the technical baseline and Solaris-800 as the compliant alternative; **do not deploy at Site B** unless the measured corridor or the site requirement changes and a current coastal certificate is obtained; **authorize no spend** until cost and scope data are complete.

---

## 2. Scope, sources, and evidence rules

### 2.1 Scope

- Two sites (A and B) and three declared unit models (Kestrel-900, Solaris-800, Halcyon-850).
- Assessment of unit operating envelope, physical fit, declared warranty and certification position, declared lead time, cost-model completeness, schedule basis, and risk.
- No design engineering, electrical sizing, structural survey, legal review, or financial approval is performed here.

### 2.2 Evidence rules applied

- A statement is used only to the extent its own source states it.
- A **2024 coastal column is not a current 2026 coastal certificate**.
- An **expected certificate is not a certificate on file** and is not treated as compliance.
- The measured 700 mm corridor survey **supersedes** the earlier 1200 mm corridor assumption for Site B.
- Missing data is reported as missing; no cost, quantity, load, or performance figure is invented.

### 2.3 Source register

| Ref | Source | Facts used | Limits |
|---|---|---|---|
| S1 | `sources/sites.md` | Site A: −12 °C design minimum, 1200 mm maximum admissible unit width, no coastal requirement. Site B: −4 °C design minimum, coastal-rated warranty binding. | Site conditions only; no load, quantity, or budget. |
| S2 | `sources/capacity.csv` | Unit temperature range, width, and lead time for Kestrel-900, Solaris-800, Halcyon-850. | No electrical capacity (kW/MWh), price, or quantity. |
| S3 | `sources/vendors.md` | Warranty lengths and declared coastal-certification position. | Vendor declarations only; no certificates supplied. |
| S4 | `inbox/2026-11-03/corridor-measurement.md` | Site B measured corridor = 700 mm; the 1200 mm value was an assumption and is superseded; the 900 mm unit is not admissible at Site B. | Single survey item; no survey report or tolerance stated. |
| S5 | `inbox/README.md` | Inbox items are evidence only to the extent their own text states; a future-certificate claim is not a certificate. | Procedural rule. |
| S6 | `TASK.md` | Required package contents and governance constraints. | Task statement. |

---

## 3. Binding requirements compliance

### R1 — The package must name the deciding constraint for each site

| Site | Deciding constraint | How it decides | Consequence |
|---|---|---|---|
| **Site A** | **Minimum operating temperature of −12 °C** | Halcyon-850 is rated only to −10 °C and is therefore ineligible. Kestrel-900 (−20 °C) and Solaris-800 (−15 °C) pass. | Halcyon-850 is excluded from Site A. Selection between the two compliant units turns on cost (not available), with schedule and warranty as secondary considerations. |
| **Site B** | **Measured corridor width of 700 mm** | Every declared unit is wider than 700 mm: Kestrel-900 = 900 mm, Solaris-800 = 800 mm, Halcyon-850 = 850 mm. | No declared unit is admissible. Site B deployment is a no-go on physical fit alone. |
| **Site B (independent second constraint)** | **Current coastal certification** | Site B requires a coastal-rated warranty; no vendor has a current 2026 coastal certificate on file. | Even if a unit fitted the corridor, no vendor currently demonstrates the required coastal compliance. |

**R1 status: satisfied.** A single deciding constraint is named for each site, with an additional independent constraint identified for Site B.

### R2 — A 2024 coastal column is not a current 2026 certificate; an expected certificate is not a current certificate

- No 2024 coastal column is treated as a current certificate anywhere in this package.
- Halcyon's statement that a 2026 coastal certificate is "expected" is recorded as an **unverified vendor claim**, not as certification.
- No current coastal certificate is on file for Kestrel, Solaris, or Halcyon.
- Consequently, no vendor is treated as coastally compliant for Site B.

**R2 status: satisfied.** The distinction between a historical column, an expected certificate, and a current certificate on file is applied explicitly.

---

## 4. Technical capacity assessment

### 4.1 Site requirements and declared unit envelope

| Site | Design minimum temperature | Maximum admissible unit width | Coastal requirement |
|---|---:|---:|---|
| Site A | −12 °C | 1200 mm | None |
| Site B | −4 °C | **700 mm measured** (1200 mm assumption superseded) | Coastal-rated warranty binding |

| Unit | Min temperature | Max temperature | Width | Declared lead time |
|---|---:|---:|---:|---:|
| Kestrel-900 | −20 °C | 45 °C | 900 mm | 8 weeks |
| Solaris-800 | −15 °C | 40 °C | 800 mm | 10 weeks |
| Halcyon-850 | −10 °C | 35 °C | 850 mm | 12 weeks |

### 4.2 Site A compliance and margins

| Unit | Temperature check (−12 °C required) | Cold margin | Width check (1200 mm max) | Width spare | Result |
|---|---|---:|---:|---:|---|
| Kestrel-900 | −20 °C ≤ −12 °C — pass | **8 °C** | 900 mm ≤ 1200 mm — pass | 300 mm | **Eligible** |
| Solaris-800 | −15 °C ≤ −12 °C — pass | **3 °C** | 800 mm ≤ 1200 mm — pass | 400 mm | **Eligible** |
| Halcyon-850 | −10 °C is warmer than −12 °C — **fail** | **−2 °C (shortfall)** | 850 mm ≤ 1200 mm — pass | 350 mm | **Ineligible** |

**Site A conclusion:** Two units are technically eligible. Kestrel-900 has the larger cold-weather margin (8 °C versus 3 °C) and the shorter declared lead time (8 versus 10 weeks). Solaris-800 has the longer warranty (7 versus 5 years) and slightly greater width spare. The final choice cannot be made on cost because no cost data exists.

### 4.3 Site B compliance and margins

| Unit | Temperature check (−4 °C required) | Width check (700 mm measured max) | Width overrun | Coastal check | Result |
|---|---|---:|---:|---|---|
| Kestrel-900 | −20 °C ≤ −4 °C — pass | 900 mm > 700 mm — **fail** | **+200 mm** | No current certificate | **Ineligible** |
| Solaris-800 | −15 °C ≤ −4 °C — pass | 800 mm > 700 mm — **fail** | **+100 mm** | No current certificate | **Ineligible** |
| Halcyon-850 | −10 °C ≤ −4 °C — pass | 850 mm > 700 mm — **fail** | **+150 mm** | "Expected" only; not on file | **Ineligible** |

**Site B conclusion:** No declared unit fits the measured corridor. The narrowest declared unit (Solaris-800, 800 mm) is still 100 mm too wide. The `inbox` measurement also states explicitly that the 900 mm unit is not admissible at Site B. The coastal-certification gap independently disqualifies every declared vendor for Site B.

### 4.4 System-level capacity — not established

The declared sources do not contain site electrical load, required kW/MWh, number of units, redundancy requirement, or energy yield. Therefore:

- system capacity (kW/MWh) cannot be computed;
- unit count cannot be determined;
- capacity adequacy for either site cannot be demonstrated.

The assessment above is consequently limited to **unit operating envelope and physical fit**. It is not a system capacity design.

---

## 5. Vendor compliance assessment

| Vendor / unit | Declared warranty | Coastal certification on file | Site A eligibility | Site B eligibility | Compliance note |
|---|---:|---|---|---|---|
| Kestrel-900 | 5 years | None | Eligible | Ineligible | Meets Site A temperature and width. No coastal certification for Site B. Shortest warranty. |
| Solaris-800 | 7 years | None | Eligible | Ineligible | Meets Site A temperature and width. No coastal certification for Site B. Narrowest unit but still 100 mm too wide for Site B. |
| Halcyon-850 | 10 years | **None — 2026 certificate only "expected"** | Ineligible | Ineligible | Fails Site A temperature. Fails Site B width. Expected certificate is unverified and cannot be accepted as current certification. |

**Vendor compliance conclusion:**

- For **Site A**, Kestrel-900 and Solaris-800 are compliant with the declared technical requirements. Halcyon-850 is not.
- For **Site B**, no vendor is compliant. The width failure is sufficient on its own; the absence of a current coastal certificate is an independent failure.
- No vendor's marketing statement, warranty length, or expected certification is treated as a substitute for a current certificate on file.

---

## 6. Cost / budget model

### 6.1 Data availability

| Cost element | Required input | Available in declared sources? |
|---|---|---|
| Equipment | Unit price × quantity | **No** |
| Logistics | Freight, duties, insurance | **No** |
| Installation | Labor, civil works, lifting, electrical | **No** |
| Commissioning | Testing, certification, training | **No** |
| Operations | O&M, spares, monitoring | **No** |
| Contingency | Risk allowance | **No** |
| Budget | Approved ceiling / funding source | **No** |
| Financial basis | Currency, tax treatment, discount rate | **No** |

### 6.2 Model structure (unpopulated)

If the inputs are later supplied, total cost of ownership should be computed as:

`TCO = N × (unit price + freight per unit) + installation + commissioning + Σ [O&M_t / (1 + r)^t] + contingency + taxes/duties`

where `N` is the number of units, `r` is the operator-approved discount rate, and `t` covers the operator-approved evaluation period.

**No values are entered because none are supported by the declared sources. The model is a framework only.**

### 6.3 Cost conclusion

- Total cost for Site A: **not determinable**.
- Total cost for Site B: **not applicable** while no compliant unit exists; a re-scoped option would require a new cost model.
- Vendor cost comparison: **not possible**.
- Budget compliance: **cannot be assessed**; no budget ceiling has been provided.
- **No expenditure is approved by this package.**

---

## 7. Implementation schedule

### 7.1 Declared lead times

| Unit | Declared lead time | Schedule consequence |
|---|---:|---|
| Kestrel-900 | 8 weeks | Shortest declared equipment lead; Site A technical baseline. |
| Solaris-800 | 10 weeks | Two weeks longer than Kestrel-900; compliant Site A alternative. |
| Halcyon-850 | 12 weeks | Longest lead; not eligible at Site A or B on technical grounds. |

### 7.2 Indicative Site A sequence

| Step | Duration | Basis / status |
|---|---|---|
| Operator review and authorization to quote | Not estimated | Operator decision; no authority delegated. |
| Cost and quantity data collection | Not estimated | Required before award. |
| Purchase order and equipment lead | **8 weeks for Kestrel-900** (10 weeks for Solaris-800) | Declared lead time only. |
| Site preparation and installation | **Not estimated** | No installation duration, scope, or site-access data in sources. |
| Commissioning and acceptance | **Not estimated** | No commissioning scope or duration in sources. |

Only the equipment lead time is quantified. No delivery date, installation date, or completion date is committed. The critical path cannot be fully established without installation and commissioning durations.

### 7.3 Site B sequence

No implementation schedule is proposed. Site B has no compliant unit under the measured 700 mm corridor and no current coastal certificate. Scheduling a deployment before those constraints are resolved would create a false plan.

---

## 8. Risk and uncertainty review

Ratings are qualitative (likelihood × impact) and are not statistical probabilities.

| ID | Risk / uncertainty | Site | Likelihood | Impact | Rating | Mitigation / next action |
|---|---|---|---|---|---|---|
| R-01 | Measured 700 mm corridor is narrower than every declared unit; no product fits. | B | High (measured) | Critical | **Critical** | Treat 700 mm as binding. Verify survey and tolerance. Re-scope site or source a ≤700 mm unit before any deployment planning. |
| R-02 | No current 2026 coastal certificate on file for any vendor. | B | High | Critical | **Critical** | Obtain a current certificate from the vendor/authority. Do not accept a 2024 column or an "expected" certificate. |
| R-03 | Halcyon's 2026 certificate claim is unverified. | A/B | Medium | High | **High** | Do not rely on the claim. If Halcyon is reconsidered, require the certificate on file. |
| R-04 | Cost data absent; budget and value cannot be established. | A/B | High | High | **High** | Obtain written quotes, quantities, and an approved budget ceiling before any award. |
| R-05 | System load, unit count, and required capacity absent. | A/B | High | High | **High** | Complete demand and sizing study; do not infer capacity from the unit table. |
| R-06 | Solaris-800 has only 3 °C cold margin at Site A. | A | Medium | Medium | **Medium** | Prefer Kestrel-900 (8 °C margin) or confirm design margin and cold-weather performance. |
| R-07 | Installation and commissioning durations unknown. | A | Medium | Medium | **Medium** | Obtain contractor schedules and site-access constraints before committing dates. |
| R-08 | Kestrel-900 has the shortest warranty (5 years). | A | Medium | Medium | **Medium** | Compare lifecycle cost and warranty terms once cost data exists; do not select on lead time alone. |
| R-09 | Earlier 1200 mm Site B corridor assumption could be reused by mistake. | B | Medium | High | **High** | Mark the assumption superseded in all planning documents; use only the 700 mm measurement. |
| R-10 | Inbox may receive further measured updates before finalization. | A/B | Low | Medium | **Medium** | Re-check `inbox/` immediately before completing the package; incorporate only what the item itself states. |

**Risk conclusion:** Site B carries two independent critical blockers (physical fit and coastal certification). Site A carries no critical technical blocker, but its commercial case is unresolved because cost, quantity, and load data are missing.

---

## 9. Integrated decision

### 9.1 Decision by site

| Site | Decision | Basis | Conditions before any purchase |
|---|---|---|---|
| **Site A** | **Conditional GO — planning and quoting only** | Kestrel-900 and Solaris-800 meet the −12 °C and 1200 mm requirements. Halcyon-850 fails temperature. | Complete cost/quantity/load data; confirm design temperature and corridor; obtain written quotes; operator approves budget. |
| **Site B** | **NO-GO under current evidence** | Deciding constraint: measured 700 mm corridor; all units are 800–900 mm wide. Independent blocker: no current coastal certificate. | Re-verify the 700 mm measurement. If confirmed, re-scope the site or source a ≤700 mm unit with a current 2026 coastal certificate; restart technical review. |

### 9.2 Recommended technical baseline for Site A

**Kestrel-900** is the recommended technical baseline because:

- it has the largest cold-weather margin at Site A (8 °C versus 3 °C for Solaris-800);
- it has the shortest declared lead time (8 weeks versus 10 weeks);
- it fits the 1200 mm width limit with 300 mm spare.

**Solaris-800** remains a compliant alternative if its 7-year warranty and 400 mm width spare are valued more highly than Kestrel's cold margin and two-week schedule advantage. This trade-off cannot be resolved without cost data, and no vendor is selected by this package.

**Halcyon-850 is excluded** from Site A on temperature and from Site B on width and certification.

### 9.3 Overall decision statement

> Proceed only with Site A planning and quotation activity, using Kestrel-900 as the technical baseline and Solaris-800 as the compliant alternative. Do not deploy at Site B. Do not commit expenditure. Return this package to the operator for acceptance and for authorization of the next stage.

This is a **recommendation**, not an approval, acceptance, or promotion.

---

## 10. Open items and operator actions

| # | Action required | Owner | Blocks |
|---|---|---|---|
| 1 | Accept, reject, or request revision of this package. | Operator | Any reliance on the package. |
| 2 | Provide or authorize collection of unit prices, quantities, freight, installation, commissioning, O&M, contingency, currency/tax basis, and budget ceiling. | Operator / procurement | Cost model; vendor selection; any award. |
| 3 | Provide site electrical load, required capacity, unit count, and redundancy requirement. | Operator / engineering | System capacity assessment. |
| 4 | Confirm Site A design minimum (−12 °C) and maximum admissible width (1200 mm). | Operator / engineering | Site A technical baseline. |
| 5 | Re-verify the Site B 700 mm corridor measurement and tolerance. | Operator / survey | Any Site B option. |
| 6 | If Site B is retained, re-scope the corridor or source a unit ≤700 mm wide with a **current 2026 coastal certificate on file**. | Operator / procurement | Site B eligibility. |
| 7 | Do not accept a 2024 coastal column or an "expected" certificate as current compliance. | All reviewers | Site B compliance. |
| 8 | Authorize any purchase only after items 1–6 are resolved. | Operator | Expenditure. |

---

## 11. Traceability of conclusions

| Conclusion | Supporting evidence | Confidence / limit |
|---|---|---|
| Site A minimum is −12 °C and maximum unit width is 1200 mm. | S1 | Declared site requirement. |
| Site B requires a coastal-rated warranty; its 1200 mm corridor was an assumption. | S1 | Declared site requirement and explicit assumption warning. |
| Measured Site B corridor is 700 mm; the 1200 mm assumption is superseded; 900 mm is inadmissible. | S4 | Single measured survey item; no tolerance stated. |
| Kestrel-900: −20…45 °C, 900 mm, 8 weeks. | S2 | Declared datasheet values. |
| Solaris-800: −15…40 °C, 800 mm, 10 weeks. | S2 | Declared datasheet values. |
| Halcyon-850: −10…35 °C, 850 mm, 12 weeks. | S2 | Declared datasheet values. |
| Kestrel and Solaris have no coastal certification in the declared sources. | S3 | Absence of evidence; no certificate supplied. |
| Halcyon's 2026 coastal certificate is only "expected", not on file. | S3 | Unverified vendor claim. |
| No cost, quantity, load, or budget data is available. | S1–S5 | Absence of data in the declared sources. |
| No 2024 column or expected certificate is treated as current. | S3, S5, requirement R2 | Governance rule applied. |

---

## 12. Document control and authority statement

- **Status:** Candidate deliverable for operator review. Not accepted, not promoted, not evidence of approval.
- **Authority:** The preparing agent may investigate, analyze, and write within its work scope. It may not accept a source, approve its own proposal, promote a result, authorize expenditure, or change the goal or binding requirements.
- **Expenditure:** No expenditure is approved, recommended for immediate commitment, or implied by any figure in this package. No cost figures are asserted because none are supported.
- **Promotion:** Acceptance and any promotion are operator actions through the existing governed path.
- **Inbox check:** The `inbox/` directory was checked during preparation; the only measured update present was `inbox/2026-11-03/corridor-measurement.md` (700 mm Site B corridor). A final re-check is performed immediately before the attempt is settled.
- **Revision:** v0.1 — initial complete candidate package, produced after recovery of the interrupted attempt. No prior committed deliverable was present in the attempt worktree.
