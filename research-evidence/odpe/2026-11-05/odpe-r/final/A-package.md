# Multi-Site Energy Deployment — Reviewable Package

**Status: DRAFT FOR OPERATOR REVIEW. Not accepted, not promoted, and not an expenditure approval.**

| Item | Value |
| --- | --- |
| Package | `deliverables/package.md`, candidate version 0.1 |
| Prepared | 2026-11-05 |
| Sites | Site A and Site B |
| Vendors assessed | Kestrel, Solaris, Halcyon |
| Project basis | Project revision 0; base commit `272a4c7` |
| Inputs incorporated | `sources/sites.md`, `sources/capacity.csv`, `sources/vendors.md`, `inbox/README.md`, `inbox/2026-11-03/corridor-measurement.md` |
| Decision authority | None exercised here; acceptance and any spend authority remain with the operator |

This package is a decision-support candidate. It records what the declared sources support, what they do not support, and the conditions that must be met before a deployment decision or any expenditure. It does not accept any source, approve any vendor, or authorize any purchase.

---

## 1. Executive summary

**Site A — conditional technical selection is possible.** The design minimum of −12 °C is the deciding constraint. It excludes the Halcyon-850, which is rated only to −10 °C. The Kestrel-900 (−20 °C minimum) and Solaris-800 (−15 °C minimum) both meet the Site A temperature and 1200 mm width limits. Kestrel-900 is the preferred technical option on cold margin and lead time; Solaris-800 is a compliant alternate with a longer stated warranty.

**Site B — no compliant unit is available from the current catalog.** The measured 700 mm corridor width is the deciding constraint: all three units are wider (800–900 mm), and the source explicitly states that the 900 mm unit is not admissible at Site B. Separately, no vendor has a current 2026 coastal certificate on file, so the binding coastal-rated requirement is also unmet. Halcyon's "expected" certificate is not a certificate, and an older (for example 2024) coastal column is not a current 2026 certificate.

**Cost — cannot be modelled numerically from the declared sources.** No unit prices, freight, installation, civil works, commissioning, spares, operations, contingency, escalation, or discount-rate data are present. This package defines the budget model and its required inputs but states every cost value as undetermined. No budget figure is asserted and no spend is approved.

**Schedule — lead times only.** The only schedule facts are vendor lead times of 8 weeks (Kestrel), 10 weeks (Solaris), and 12 weeks (Halcyon). Installation, commissioning, permitting, and civil-works durations are not in the sources. Site B cannot be scheduled because no compliant unit has been identified.

**Integrated decision.** Proceed only to conditional procurement diligence for Site A, with Kestrel-900 preferred and Solaris-800 as alternate, subject to cost quotes, warranty terms, and operator authorization. Place Site B on hold pending a unit of 700 mm or less with a current 2026 coastal certificate on file, or a separately authorized corridor solution. This package does not support a full two-site deployment authorization and does not approve expenditure.

### 1.1 Deciding constraint by site (binding requirement R1)

| Site | Deciding constraint | Why it decides | Result |
| --- | --- | --- | --- |
| Site A | **Design minimum temperature of −12 °C** | Halcyon-850 is rated only to −10 °C and is therefore ineligible. Width (1200 mm limit) is satisfied by every catalog unit, and no coastal requirement applies. Temperature is the only constraint that removes an otherwise width-compliant option. | Kestrel-900 preferred; Solaris-800 alternate; Halcyon-850 excluded. |
| Site B | **Measured corridor width of 700 mm** | All catalog units are 800–900 mm wide and exceed the measured 700 mm corridor; the source explicitly states the 900 mm unit is not admissible. This excludes every current unit regardless of other merits. The binding coastal-rated requirement is an independent second blocker because no current 2026 certificate is on file. | No compliant selection; Site B held. |

---

## 2. Inputs and evidence status

### 2.1 Inputs read

| Input | Content used | Evidence status |
| --- | --- | --- |
| `sources/sites.md` | Site A: design minimum −12 °C, maximum admissible unit width 1200 mm, no coastal requirement. Site B: design minimum −4 °C, coastal-rated warranty binding, 1200 mm corridor value is an assumption not a measurement. A 2024 coastal column is not a current 2026 certificate; an expected certificate is not a certificate on file. | Declared project source; accepted as descriptive project requirements for this assessment. |
| `sources/capacity.csv` | Unit temperature ranges, widths, and lead times for Kestrel-900, Solaris-800, Halcyon-850. | Declared project source; vendor specifications as stated, not independently verified. |
| `sources/vendors.md` | Warranty lengths and coastal-certification status for the three vendors. | Declared project source; vendor claims as stated, not independently verified. |
| `inbox/README.md` | Instruction to re-check inbox before finalizing; an inbox item is evidence only to the extent its text states; a claim about a future certificate is not a certificate. | Project instruction. |
| `inbox/2026-11-03/corridor-measurement.md` | Measured Site B corridor width 700 mm, survey performed 2026-11-03; earlier 1200 mm value was an assumption and is superseded; 900 mm unit is not admissible at Site B. | Measured update that arrived after the attempt's base; incorporated before finalizing. The note is the evidence; the underlying survey record is not attached. |

### 2.2 Evidence rules applied

1. A vendor statement is treated as a claim, not a verified fact.
2. Absence of a required certificate or document is a compliance gap, not a neutral condition.
3. An "expected" future certificate is not a current certificate and is not accepted as evidence of compliance.
4. A 2024 coastal column or any pre-2026 coastal data is not a current 2026 certificate.
5. A stated warranty length is not by itself evidence of a coastal rating.
6. The measured 2026-11-03 corridor value supersedes the earlier assumed 1200 mm value for Site B.
7. No cost, tariff, or budget figure is inferred where the sources provide none.

### 2.3 Explicitly not verified

- No current 2026 coastal certificate has been seen for any vendor.
- No vendor quotation, price list, budget, or commercial terms have been seen.
- No installation, commissioning, permitting, or civil-works duration has been seen.
- No electrical output, efficiency, or energy-capacity rating is present in `capacity.csv`; this package assesses environmental and dimensional capacity only.
- The 2026-11-03 survey note has no attached survey drawing, instrument record, or independent sign-off.

---

## 3. Technical capacity assessment

### 3.1 Site requirements

| Requirement | Site A | Site B | Source |
| --- | --- | --- | --- |
| Design minimum temperature | −12 °C | −4 °C | `sources/sites.md` |
| Maximum admissible unit width | 1200 mm | 700 mm measured (was an assumed 1200 mm) | `sources/sites.md`; `inbox/2026-11-03/corridor-measurement.md` |
| Coastal-rated warranty | Not required | Binding | `sources/sites.md` |

### 3.2 Catalog technical envelope

| Unit | Minimum temperature | Maximum temperature | Unit width | Lead time |
| --- | --- | --- | --- | --- |
| Kestrel-900 | −20 °C | 45 °C | 900 mm | 8 weeks |
| Solaris-800 | −15 °C | 40 °C | 800 mm | 10 weeks |
| Halcyon-850 | −10 °C | 35 °C | 850 mm | 12 weeks |

Source: `sources/capacity.csv`. These are the units' stated operating limits and dimensions; no output rating is supplied.

### 3.3 Site A capacity assessment

| Unit | Temperature test (−12 °C required) | Cold margin | Width test (≤1200 mm) | Coastal test | Technical result |
| --- | --- | --- | --- | --- | --- |
| Kestrel-900 | Pass: −20 °C rated | 8 °C | Pass: 900 mm | Not required | Compliant |
| Solaris-800 | Pass: −15 °C rated | 3 °C | Pass: 800 mm | Not required | Compliant |
| Halcyon-850 | **Fail: −10 °C rated** | −2 °C (does not reach −12 °C) | Pass: 850 mm | Not required | **Non-compliant** |

**Deciding constraint:** the −12 °C design minimum. Width is not binding at Site A because all three units fit within 1200 mm, and no coastal requirement applies. The temperature limit alone removes Halcyon-850.

**Preferred and alternate:**

- **Kestrel-900 (preferred on technical envelope).** Largest cold margin (8 °C), shortest lead time (8 weeks), and width within the Site A limit. Its stated warranty is 5 years.
- **Solaris-800 (compliant alternate).** Adequate cold margin (3 °C), width 800 mm, lead time 10 weeks, and a stated 7-year warranty. The longer warranty is a trade-off against the narrower cold margin and longer lead time.
- **Halcyon-850 (excluded at Site A).** Its −10 °C minimum does not meet the −12 °C design minimum. Its longer 10-year warranty and the unverified expectation of a coastal certificate do not cure the temperature non-compliance.

No cost-based preference is possible because no cost data are supplied. The preference above is technical only.

### 3.4 Site B capacity assessment

| Unit | Temperature test (−4 °C required) | Width test (≤700 mm measured) | Coastal test (binding) | Technical result |
| --- | --- | --- | --- | --- |
| Kestrel-900 | Pass: −20 °C rated | **Fail: 900 mm > 700 mm** (source explicitly states the 900 mm unit is not admissible) | **Fail: no current coastal certificate on file** | **Non-compliant** |
| Solaris-800 | Pass: −15 °C rated | **Fail: 800 mm > 700 mm** | **Fail: no current coastal certificate on file** | **Non-compliant** |
| Halcyon-850 | Pass: −10 °C rated | **Fail: 850 mm > 700 mm** | **Unverified: 2026 certificate said to be "expected"; none on file** | **Non-compliant / unverified** |

**Deciding constraint:** the measured 700 mm corridor width. Temperature is not binding at Site B (−4 °C is easily met by all three units), but width excludes every catalog unit. The source is explicit that the 900 mm unit is not admissible at Site B. The earlier 1200 mm corridor value was an assumption and is superseded; it must not be used to justify any Site B selection.

**Independent compliance blocker:** even if a unit fitted the corridor, the binding coastal-rated requirement is not demonstrated by any vendor. No current 2026 coastal certificate is on file for Kestrel or Solaris. Halcyon's statement that a 2026 certificate is "expected" is not a certificate on file and is treated as unverified.

**Conclusion for Site B:** there is no compliant unit in the assessed catalog. Site B cannot be selected or scheduled on the current evidence. The viable paths are (a) a vendor offering a unit of 700 mm or less with a current 2026 coastal certificate on file, or (b) a separately engineered and authorized corridor modification, followed by a fresh compliance assessment. Neither path is approved by this package.

### 3.5 Capacity scope limitation

`capacity.csv` provides temperature limits, width, and lead time only. It does not provide electrical output, energy capacity, efficiency, derating curves, or site load data. This package therefore does not assert that any unit has sufficient electrical capacity for either site. That is an open technical input, not a satisfied requirement.

---

## 4. Vendor compliance assessment

### 4.1 Compliance matrix

| Vendor / unit | Site A: temperature | Site A: width | Site A: coastal | Site A verdict | Site B: temperature | Site B: width | Site B: coastal | Site B verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Kestrel-900 | Pass | Pass | Not required | **Compliant candidate** | Pass | Fail (900 > 700) | No certificate | **Non-compliant** |
| Solaris-800 | Pass | Pass | Not required | **Compliant alternate** | Pass | Fail (800 > 700) | No certificate | **Non-compliant** |
| Halcyon-850 | **Fail** (−10 °C) | Pass | Not required | **Non-compliant** | Pass | Fail (850 > 700) | Expected only, unverified | **Non-compliant / unverified** |

### 4.2 Vendor notes

**Kestrel**

- Stated 5-year warranty; no coastal certification in the declared sources.
- Site A: temperature and width compliant; no coastal requirement.
- Site B: 900 mm width exceeds the measured 700 mm corridor and is expressly stated not to be admissible; no current coastal certificate. Non-compliant on two independent grounds.
- Warranty length is the shortest of the three and should be weighed commercially, but it is not a technical disqualifier at Site A.

**Solaris**

- Stated 7-year warranty; no coastal certification in the declared sources.
- Site A: temperature and width compliant; no coastal requirement.
- Site B: 800 mm width exceeds the measured 700 mm corridor; no current coastal certificate. Non-compliant on two independent grounds.

**Halcyon**

- Stated 10-year warranty; claims a 2026 coastal certificate is "expected"; no certificate is on file.
- Site A: **fails** the −12 °C design minimum with a −10 °C rating. The longer warranty does not cure this.
- Site B: 850 mm width exceeds the measured 700 mm corridor, and the certificate claim is unverified. The "expected" certificate is not accepted as a current certificate.
- The 10-year warranty is not evidence of a coastal rating. No document in the declared sources establishes that the warranty is coastal-rated.

### 4.3 Application of binding requirement R2

R2 states: a 2024 coastal column is not a current coastal certificate; an expected certificate is not a current certificate.

Applied here:

- No 2024 coastal column or other pre-2026 coastal data is relied upon anywhere in this package.
- Halcyon's "expected" 2026 certificate is recorded as an unverified vendor claim, not as a certificate on file.
- Because no current 2026 coastal certificate is on file for any vendor, **no vendor passes the Site B coastal requirement**, irrespective of warranty length.
- A future certificate, if produced, would require verification of its date, scope, issuing body, and applicability to the offered unit before it could change the Site B verdict.

### 4.4 Compliance conclusion

- **Site A:** Kestrel-900 and Solaris-800 are technically compliant with the stated Site A requirements. Halcyon-850 is not.
- **Site B:** no vendor is compliant. The failures are width (all units) and current coastal certification (all vendors).

---

## 5. Cost / budget model

### 5.1 Status: cost cannot be quantified from the declared sources

No cost data are present in the repository. There are no unit prices, freight quotes, installation rates, civil-works estimates, commissioning costs, spares prices, operations and maintenance costs, contingency allowances, escalation assumptions, taxes, tariffs, financing costs, or discount rates. Consequently:

- No total cost, per-site cost, cost range, or budget request is asserted in this package.
- No vendor can be compared on cost.
- No expenditure can be approved on the basis of this package.
- Any number supplied later must be traced to a quotation or an explicitly labelled planning assumption, and must not be presented as verified until the operator accepts it.

### 5.2 Budget model to be populated

The recommended cost structure for each site is:

```text
Total evaluated cost =
    unit supply
  + freight and logistics
  + installation labour
  + civil / corridor works (if any)
  + electrical balance-of-system
  + commissioning and acceptance testing
  + spares and initial consumables
  + present value of operations and maintenance
  + contingency on quantified base cost
  + escalation to the commitment date
  - residual value at end of assessment period
```

Where a multi-year view is required:

```text
NPV = Σ [ Cash flow(t) / (1 + r)^t ]  for t = 0..N
```

`r` (discount rate), `N` (assessment period), and all cash flows are currently undetermined.

### 5.3 Required cost inputs

| Cost element | Applies to | Required input | Current status |
| --- | --- | --- | --- |
| Unit supply | A, B | Vendor quotation per unit and quantity | Not provided |
| Freight and logistics | A, B | Route, weight, insurance, delivery terms | Not provided |
| Installation labour | A, B | Site labour plan and rates | Not provided |
| Civil / corridor works | B (only if corridor path chosen) | Engineered scope and quote | Not provided; scope not defined |
| Electrical balance-of-system | A, B | Connection and protection design | Not provided |
| Commissioning and acceptance | A, B | Test plan and resource estimate | Not provided |
| Spares and consumables | A, B | Recommended spares list | Not provided |
| Operations and maintenance | A, B | Service contract or cost model | Not provided |
| Contingency | A, B | Risk-based percentage of quantified base | Not provided |
| Escalation | A, B | Index and commitment date | Not provided |
| Discount rate and period | A, B | Operator financial assumptions | Not provided |
| Residual value | A, B | Disposal or residual assumption | Not provided |

### 5.4 Budget decision rule

A cost comparison may be issued only when each material line above is populated from a traceable source or an explicit, operator-approved planning assumption. Until then:

- the budget is **undetermined**, not zero and not "within budget";
- no purchase order, deposit, or other commitment may be issued;
- no vendor may be treated as the lowest-cost or best-value option.

---

## 6. Implementation schedule

### 6.1 What the sources establish

The only schedule data are vendor lead times:

| Unit | Lead time |
| --- | --- |
| Kestrel-900 | 8 weeks |
| Solaris-800 | 10 weeks |
| Halcyon-850 | 12 weeks |

No installation duration, commissioning duration, permitting duration, civil-works duration, delivery buffer, or resource constraint is supplied. The schedule below is therefore an indicative sequence, not a committed plan, and contains no calendar dates.

### 6.2 Indicative Site A sequence (conditional; not authorized)

| Step | Timing | Status / dependency |
| --- | --- | --- |
| Operator review and authorization | Before any commitment | **Not granted**; outside this package's authority |
| Cost and commercial validation | Before award | Blocked: no quotes or budget |
| Purchase order / notice to proceed | After authorization | Not authorized |
| Vendor lead time — Kestrel-900 | 8 weeks from order | Known lead time; start date depends on authorization |
| Vendor lead time — Solaris-800 (alternate) | 10 weeks from order | Known lead time; start date depends on authorization |
| Delivery and site receipt | After lead time | Exact delivery duration and logistics not provided |
| Installation | Duration not provided | Requires site plan and contractor input |
| Commissioning and acceptance | Duration not provided | Requires test plan |
| Operational handover | Duration not provided | Requires completion of the above |

The Site A critical path is: **operator authorization → commercial validation and award → vendor lead time (8 weeks for Kestrel) → delivery → installation → commissioning → handover.** The end date cannot be stated because the post-delivery durations are unknown.

### 6.3 Site B schedule

No Site B implementation schedule can be issued. Site B has no compliant unit: every catalog unit exceeds the measured 700 mm corridor, and no current coastal certificate is on file. Scheduling would presuppose a selection that the evidence does not support.

Site B can be scheduled only after one of the following occurs:

1. a vendor offers a unit of 700 mm or less with a current 2026 coastal certificate on file, verified for the offered unit; or
2. a corridor modification is engineered, costed, and separately authorized, after which the width constraint would be re-baselined.

### 6.4 Schedule caveats

- Lead times are vendor statements, not guaranteed delivery commitments.
- The schedule excludes permitting, grid connection, site access, weather, and inspection delays because no data are provided.
- No schedule float or contingency is asserted.
- Any schedule presented to an operator should be re-issued once installation and commissioning inputs are available.

---

## 7. Risk and uncertainty review

Severity below is a qualitative judgement about decision impact, not a quantified probability.

| ID | Risk or uncertainty | Basis | Consequence | Treatment / status |
| --- | --- | --- | --- | --- |
| RK-01 | Site B corridor is only 700 mm wide | Measured update, 2026-11-03 | All catalog units (800–900 mm) are inadmissible; Site B cannot proceed with current catalog | **Open, blocking.** Hold Site B; require ≤700 mm unit or authorized corridor solution. |
| RK-02 | No current 2026 coastal certificate on file for any vendor | `sources/vendors.md`; R2 | Binding Site B coastal requirement is unmet; selection would be non-compliant | **Open, blocking.** Obtain and verify a current certificate for the specific offered unit. |
| RK-03 | "Expected" certificate or older coastal data mistaken for current certification | Halcyon statement; R2 | Could cause an invalid Site B award | **Controlled by rule.** Expected future certificate and 2024 column are not accepted. |
| RK-04 | Halcyon-850 under-rated for Site A cold | −10 °C rating vs −12 °C design minimum | Unit would operate outside its stated rating at Site A | **Resolved by exclusion** from Site A. |
| RK-05 | No cost or budget data | Source review | No affordable/best-value judgement; no expenditure can be approved | **Open, blocking for commitment.** Populate cost model with quotes and approved assumptions. |
| RK-06 | Installation/commissioning durations unknown | Source review | Completion date and resourcing cannot be committed | **Open.** Obtain contractor and commissioning plans. |
| RK-07 | Warranty trade-off (5 vs 7 vs 10 years) | `sources/vendors.md` | Longer warranty may have value, but coverage terms and coastal rating are unverified | **Open.** Compare warranty terms, exclusions, and cost; do not equate length with coastal rating. |
| RK-08 | Measurement provenance is a single note without attachments | `inbox/2026-11-03/corridor-measurement.md` | Corridor dimension could be challenged or found unrepresentative | **Open, low/medium.** Verify survey record before design or construction. |
| RK-09 | Stale 1200 mm corridor assumption reused downstream | `sources/sites.md` says it was an assumption; update supersedes it | Wrong unit could be selected for Site B | **Controlled.** Use 700 mm measured value; mark 1200 mm as superseded. |
| RK-10 | Electrical/energy capacity is not stated | `capacity.csv` has no output rating | Cannot confirm the units meet site load or energy needs | **Open, potentially blocking.** Obtain output ratings and site demand data. |
| RK-11 | No expenditure authority in this package | Project goal and authority boundary | Any purchase based on this draft would exceed authority | **Controlled.** Package is review-only; operator authorization required. |
| RK-12 | Vendor claims are not independently verified | Source review | Specifications, warranties, and certificates may differ from claims | **Open.** Verify specifications and certificates before award. |

### 7.1 Key uncertainties that could change the decision

- A verified, current 2026 coastal certificate for a unit that also fits 700 mm would reopen Site B.
- An approved corridor modification at Site B would change the width constraint, but would add cost and schedule risk and requires separate authority.
- Cost data could change the Site A preference between Kestrel-900 and Solaris-800, or show that neither is affordable.
- Site electrical demand and unit output ratings could invalidate a technically compliant selection.
- A survey re-measurement could confirm or alter the 700 mm corridor value.

---

## 8. Integrated decision

### 8.1 Site A

**Decision: conditionally shortlist Kestrel-900 as preferred and Solaris-800 as alternate; exclude Halcyon-850.**

This is a technical shortlist, not an award. It is conditional on:

1. receipt of compliant quotations and completion of the cost model in Section 5;
2. confirmation that the offered unit's temperature rating and dimensions match the declared data;
3. acceptable warranty terms and delivery commitment;
4. operator budget approval and explicit authorization to commit expenditure;
5. confirmation of site electrical demand and unit output capacity.

If those conditions are met, Kestrel-900 is preferred on its larger cold margin and shorter lead time; Solaris-800 remains a compliant alternate whose longer warranty may offset its narrower cold margin and longer lead. No preference is asserted on cost.

### 8.2 Site B

**Decision: do not select a vendor and do not proceed to award. Hold Site B.**

Reasons, each independently sufficient:

1. the measured 700 mm corridor excludes all catalog units (800–900 mm), and the 900 mm unit is expressly inadmissible;
2. no current 2026 coastal certificate is on file for any vendor, so the binding coastal-rated requirement is unmet;
3. the "expected" Halcyon certificate and any 2024 coastal column are not current certification.

Site B may be reopened only when a unit of 700 mm or less has a current, verified 2026 coastal certificate on file, or when a corridor modification is engineered, costed, and separately authorized. Any reopened assessment must repeat the compliance tests in Sections 3 and 4.

### 8.3 Overall deployment decision

| Question | Answer |
| --- | --- |
| Is a two-site deployment supported? | **No.** Site B has no compliant unit. |
| Is a Site A procurement step supported? | **Conditionally, for diligence only.** Preferred Kestrel-900; alternate Solaris-800; subject to cost, warranty, electrical capacity, and operator authorization. |
| Is expenditure approved? | **No.** No budget is established and no authority is exercised by this package. |
| Is any vendor accepted? | **No.** Vendor claims remain unverified; acceptance is an operator action. |
| What is the next decision? | Operator review of this package, then either authorize a Site A quotation/budget step or direct further evidence gathering for Site B. |

---

## 9. Requirement traceability

| Requirement | How this package addresses it | Status |
| --- | --- | --- |
| **R1** — the package must name the deciding constraint for each site. | Site A: design minimum temperature of −12 °C, which excludes Halcyon-850. Site B: measured corridor width of 700 mm, which excludes all catalog units; current coastal certification is an independent second blocker. See Section 1.1 and Sections 3.3–3.4. | Addressed; operator acceptance pending. |
| **R2** — a 2024 coastal column is not a current coastal certificate; an expected certificate is not a current certificate. | No 2024 coastal column is relied on. Halcyon's "expected" 2026 certificate is recorded as unverified and does not satisfy the requirement. No vendor is treated as coastally certified. See Section 4.3. | Addressed; operator acceptance pending. |

---

## 10. Source register and limitations

### 10.1 Sources

| Ref | Path | Used for |
| --- | --- | --- |
| S1 | `sources/sites.md` | Site requirements and evidence rules |
| S2 | `sources/capacity.csv` | Unit temperature limits, widths, lead times |
| S3 | `sources/vendors.md` | Warranty lengths and coastal-certification claims |
| S4 | `inbox/README.md` | Inbox evidence instruction |
| S5 | `inbox/2026-11-03/corridor-measurement.md` | Measured Site B corridor width; supersession of the 1200 mm assumption |

### 10.2 Limitations

- This is a desk assessment of declared repository sources. No vendor was contacted, no certificate was inspected, no site was visited, and no quotation was obtained.
- Vendor-supplied figures are reproduced as claims and are not independently verified.
- The 2026-11-03 corridor measurement is accepted as the current project measurement for this assessment, but its underlying survey record is not attached.
- No electrical capacity, demand, or performance modelling was possible because the necessary data are absent.
- No cost, financing, tax, or tariff analysis was possible because the necessary data are absent.
- The package does not constitute legal, engineering, procurement, or financial advice, and does not grant any approval.

### 10.3 Unverified claims register

| Claim | Source | Treatment |
| --- | --- | --- |
| Halcyon 2026 coastal certificate is "expected" | S3 | Unverified; not a certificate on file; does not satisfy R2 or the Site B coastal requirement. |
| Kestrel/Solaris have no coastal certification in declared sources | S3 | Treated as no current coastal certification on file. |
| 1200 mm Site B corridor | S1 | Assumption, superseded by the 2026-11-03 measured 700 mm. |
| Unit temperature, width, and lead-time figures | S2 | Accepted as declared vendor data for this assessment; to be confirmed against offers. |
| Warranty lengths | S3 | Accepted as stated vendor claims; coverage terms not verified. |

---

## 11. Review and acceptance

### 11.1 Reviewer checklist

- [ ] Confirm the Site A deciding constraint (design minimum temperature) and the exclusion of Halcyon-850.
- [ ] Confirm the Site B deciding constraint (measured 700 mm corridor) and that no catalog unit fits.
- [ ] Confirm that no current 2026 coastal certificate is on file and that Halcyon's expectation is not accepted.
- [ ] Confirm that no cost figure has been asserted and that the budget remains undetermined.
- [ ] Confirm that no expenditure is approved by this package.
- [ ] Confirm the Site A preference is technical only and conditional on cost, warranty, electrical capacity, and authorization.
- [ ] Confirm Site B is held pending a compliant unit or an authorized corridor solution.
- [ ] Decide whether to accept this package, request revisions, or direct further evidence gathering.

### 11.2 Open items requiring input before commitment

1. Vendor quotations and a populated cost model for Site A.
2. Current 2026 coastal certificate(s) for any Site B candidate, verified for the offered unit.
3. A Site B unit of 700 mm or less, or an authorized corridor modification.
4. Site electrical demand and unit output/energy ratings.
5. Installation, commissioning, and permitting plans and durations.
6. Warranty terms, exclusions, and coastal coverage.
7. Operator budget approval and explicit expenditure authorization.

### 11.3 Package status

**Candidate for operator review. Not accepted. Not promoted. No expenditure authorized.**

Acceptance, promotion, and any authority to commit expenditure are operator actions outside the scope of this package.
