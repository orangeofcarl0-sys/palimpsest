# Multi-Site Energy Deployment Package

**Document:** `deliverables/package.md`  
**Status:** Decision-ready for review — recommendations only; **no expenditure authority**  
**Prepared:** 2026-11-05  
**Base commit:** `272a4c7c97352a9f2e48c8b7ab93d9ed28fc9e03`  
**Sites in scope:** Site A and Site B

---

## 1. Executive decision summary

### 1.1 Decision at a glance

| Site | Deciding constraint(s) | Technical outcome | Compliance outcome | Recommendation |
|---|---|---|---|---|
| **Site A** | **Design minimum temperature of −12 °C.** This is the only gate that eliminates a candidate; the 1200 mm width limit does not bind, and no coastal requirement applies. | Kestrel-900 **PASS** (+8 K margin); Solaris-800 **PASS** (+3 K margin); Halcyon-850 **FAIL** (rated only to −10 °C, 2 K short). All three fit the 1200 mm width limit. | Two technically qualified offers: Kestrel-900 and Solaris-800. Halcyon-850 is non-compliant on temperature. | **Conditional go to a priced RFQ only.** Kestrel-900 is the preferred technical option; Solaris-800 is the qualified alternate. **No purchase order and no spend.** |
| **Site B** | **Two independent deciding constraints; either alone rejects every current offer:** (1) measured corridor width of 700 mm; (2) no current 2026 coastal certificate / coastal-rated warranty on file for any vendor. | **Zero admissible offers.** Every offered unit is 800–900 mm wide and therefore exceeds the measured 700 mm corridor on nominal width. All three pass the −4 °C temperature minimum, but temperature is not the deciding issue. | **Zero compliant offers.** No vendor has a current 2026 coastal certificate on file, and no coastal-rated warranty is evidenced. Halcyon's “expected” 2026 certificate is an unverified future claim, not a certificate. | **No-go on all current offers.** Defer/qualify. Do not award, do not order, and do not treat the former 1200 mm assumption as a measurement. |

### 1.2 Why this is the decision

1. **Site A is constrained by cold rating, not width.** Halcyon-850 cannot operate at the −12 °C design minimum. Kestrel-900 and Solaris-800 can, and both fit within 1200 mm. Site A can therefore move to commercial qualification, but only after firm prices and quantities exist.
2. **Site B is constrained by the measured corridor before compliance is reached.** The inbox measurement of **700 mm** supersedes the earlier **1200 mm assumption**. Kestrel-900 (900 mm) is expressly not admissible; Solaris-800 (800 mm) and Halcyon-850 (850 mm) also exceed 700 mm on the declared nominal widths. There is no current offer that fits.
3. **Site B also fails the coastal gate independently.** Kestrel and Solaris have no coastal certification in the declared sources. Halcyon says a 2026 certificate is “expected,” but **an expected certificate is not a certificate on file**. A 2024 coastal column would not be a current 2026 certificate. No coastal-rated warranty is evidenced for any vendor.
4. **There is no price basis in the record.** No unit price, freight rate, installation rate, quantity, tax rate, or budget figure is declared. This package therefore provides a parametric cost model and a budget-authorization gate, not an invented cost estimate.
5. **No expenditure is approved.** This package recommends evidence-gated next steps. It does not award a contract, release a purchase order, commit a budget, or waive a binding requirement.

### 1.3 Deciding constraints — explicit statement

> **Site A — deciding constraint: the −12 °C design minimum temperature.**  
> Halcyon-850 is rated to −10 °C and is excluded. Kestrel-900 and Solaris-800 pass; width (≤1200 mm) and coastal requirements do not eliminate them.
>
> **Site B — deciding constraints (over-determined): the measured 700 mm corridor width, and the absence of a current 2026 coastal certificate / coastal-rated warranty on file.**  
> All offered units are 800–900 mm wide, so no current offer is admissible on width. **Independently, and also sufficient to reject every current offer, no vendor has a current 2026 coastal certificate on file or evidences a coastal-rated warranty.** Either gate alone blocks award; both must be closed before any Site B award.

---

## 2. Scope, authority, and evidence basis

### 2.1 Scope

This package covers:

- technical capacity screening against the declared site envelope;
- vendor compliance against temperature, width, warranty, and coastal requirements;
- a parametric cost and budget model with an explicit authorization gate;
- an implementation schedule based on declared lead times and labelled planning assumptions;
- a risk and uncertainty review;
- an integrated, site-by-site decision recommendation.

It does not cover detailed electrical design, structural design, permitting, energy-yield modelling, tax treatment, or contract negotiation; the declared sources contain no data for those areas.

### 2.2 Authority and spend status

- **Prepared by:** work worker (analysis only).
- **Decision authority:** the principal / authorized budget owner. That authority is not held by the author of this package.
- **Expenditure approved by this package:** none.
- **Purchase orders released by this package:** none.
- **Requirements waived by this package:** none.
- Any procurement action requires separate authority and an approved budget line.

### 2.3 Evidence classification used in this package

| Class | Meaning | How it is used here |
|---|---|---|
| **Binding requirement** | A site constraint declared in the task sources. | Treated as a hard pass/fail gate. |
| **Measured evidence** | A value stated as a measurement in an inbox update. | Accepted for that measurement only; it supersedes an earlier assumption. |
| **Declared product data** | Manufacturer/model values listed in `sources/capacity.csv`. | Used as declared nominal values, not independently tested values. |
| **Vendor assertion** | A vendor statement not supported by a document on file. | Recorded as unverified; never converted into an accepted fact. |
| **Planning assumption** | A value introduced only to structure the schedule or cost model. | Labelled; not used to satisfy a binding gate. |
| **Missing** | No value in the declared sources. | Treated as an open item, not guessed. |

**“On file” in this package means present in the declared sources or the inbox.** A vendor may hold a document that has not been submitted; until it is on file, the requirement is recorded as not demonstrated, not as satisfied.

### 2.4 Source register

| Source | What it establishes |
|---|---|
| `TASK.md` | Required package contents; instruction to re-check `inbox/` before finalizing; prohibition on treating unverified claims as accepted facts and on approving expenditure without authority. |
| `sources/sites.md` | Site A: −12 °C design minimum, 1200 mm maximum admissible width, no coastal requirement. Site B: −4 °C design minimum, coastal-rated warranty binding, 1200 mm corridor value is an **assumption**, not a measurement. Also warns that a 2024 coastal column is not a current 2026 certificate and an expected certificate is not a certificate on file. |
| `sources/capacity.csv` | Declared minimum/maximum temperatures, nominal unit widths, and lead times for Kestrel-900, Solaris-800, Halcyon-850. |
| `sources/vendors.md` | Warranty durations and coastal-certification status/claims. Halcyon's 2026 coastal certificate is “expected,” with no certificate on file. |
| `inbox/2026-11-03/corridor-measurement.md` | Measured Site B corridor width of **700 mm** (survey 2026-11-03); the earlier 1200 mm value is superseded; the 900 mm unit is **not admissible** at Site B. |

### 2.5 Evidence corrections that govern this package

1. **Site B corridor: 700 mm, not 1200 mm.**
   - The 1200 mm value in `sources/sites.md` is expressly an assumption.
   - The 2026-11-03 survey measured 700 mm and states that the earlier value is superseded.
   - This package therefore uses **700 mm** as the Site B width limit. The 1200 mm value is not used for any Site B pass/fail decision.
2. **Coastal certification: current 2026 certificate required.**
   - A 2024 coastal column/listing is not a current 2026 certificate.
   - An “expected” 2026 certificate is not a certificate on file.
   - No current certificate is present in the declared sources for any vendor.
3. **Vendor claims remain claims.**
   - Halcyon's “expected” certificate is recorded as an unverified vendor assertion.
   - A longer warranty (Halcyon: 10 years) is not evidence of coastal certification or of a coastal-rated warranty.
4. **Nominal widths are used as declared.**
   - `capacity.csv` gives nominal unit widths. Installation clearance, packaging, and maneuvering envelopes are not declared. The Site B failures are therefore based on nominal width and are not rescued by an undocumented reduced envelope.

### 2.6 Limits of the evidence

- No electrical output, thermal output, efficiency, refrigerant, voltage, weight, or sound data is declared; “capacity” here is an environmental/geometric envelope only.
- No site maximum ambient temperature is declared.
- No quantities, load profiles, or site demand data are declared.
- No prices, freight rates, installation rates, tax rates, or budget figures are declared.
- Lead times are vendor-declared values and may be indicative rather than contractual.

---

## 3. Technical capacity assessment

### 3.1 Assessment method

Each site/unit combination is screened against hard gates in this order:

1. **Temperature gate:** unit minimum operating temperature must be at or below the site design minimum.
2. **Width gate:** nominal unit width must not exceed the site's admissible width.
3. **Coastal gate (Site B only):** a current 2026 coastal certificate and a coastal-rated warranty must be evidenced.
4. **Maximum-temperature check:** cannot be completed because no site maximum temperature is declared.

A unit is “technically qualified” for a site only if it passes every applicable gate. Passing one gate does not offset failing another.

### 3.2 Declared capacity envelope and gate results

| Unit | Min °C | Max °C | Nominal width (mm) | Lead (weeks) | Site A temp (−12 °C) | Site A width (≤1200 mm) | Site B temp (−4 °C) | Site B width (≤700 mm measured) |
|---|---:|---:|---:|---:|---|---|---|---|
| Kestrel-900 | −20 | 45 | 900 | 8 | **PASS**, 8 K margin | **PASS**, 300 mm spare | **PASS**, 16 K margin | **FAIL**, 200 mm over |
| Solaris-800 | −15 | 40 | 800 | 10 | **PASS**, 3 K margin | **PASS**, 400 mm spare | **PASS**, 11 K margin | **FAIL**, 100 mm over |
| Halcyon-850 | −10 | 35 | 850 | 12 | **FAIL**, 2 K short | **PASS**, 350 mm spare | **PASS**, 6 K margin | **FAIL**, 150 mm over |

Margin calculation: temperature margin = site design minimum − unit minimum. A positive value is margin; a negative value is a shortfall. Width spare = site limit − nominal width; a negative value is an overrun.

### 3.3 Site A — technical findings

**Binding envelope:** design minimum −12 °C; maximum admissible unit width 1200 mm; no coastal requirement.

- **Kestrel-900:** qualified. Rated to −20 °C, giving 8 K of cold margin. Width 900 mm, 300 mm inside the 1200 mm limit. Declared lead time 8 weeks.
- **Solaris-800:** qualified. Rated to −15 °C, giving 3 K of cold margin. Width 800 mm, 400 mm inside the limit. Declared lead time 10 weeks.
- **Halcyon-850:** **not qualified.** Rated only to −10 °C. At the −12 °C design minimum it is 2 K outside its declared operating range. Its 850 mm width is otherwise acceptable, and its 10-year warranty does not cure the temperature shortfall.

**Deciding constraint:** the −12 °C design minimum. It is the gate that removes a candidate. Width is not decisive because the widest unit (900 mm) is still 300 mm inside the 1200 mm limit, and the coastal gate does not apply.

**Qualified set:** Kestrel-900 and Solaris-800.

**Selection between the qualified units:** both pass every Site A gate. Kestrel-900 has the larger cold margin (8 K versus 3 K) and the shorter declared lead time (8 versus 10 weeks); Solaris-800 has the longer warranty (7 versus 5 years). Without prices, the final commercial selection cannot be made. Kestrel-900 is the preferred technical option; Solaris-800 is the qualified alternate.

**Maximum-temperature check:** not assessable. Site A's maximum ambient temperature is not declared. The units' declared maxima are 45 °C (Kestrel), 40 °C (Solaris), and 35 °C (Halcyon). No conclusion is drawn about site maximum conditions.

### 3.4 Site B — technical findings

**Binding envelope:** design minimum −4 °C; measured corridor width **700 mm**; coastal-rated warranty binding.

- **Kestrel-900:** temperature passes with 16 K margin, but width **fails**: 900 mm nominal is 200 mm wider than the 700 mm measurement. The inbox update expressly states the 900 mm unit is not admissible at Site B.
- **Solaris-800:** temperature passes with 11 K margin, but width **fails**: 800 mm nominal is 100 mm wider than 700 mm.
- **Halcyon-850:** temperature passes with 6 K margin, but width **fails**: 850 mm nominal is 150 mm wider than 700 mm.
- **All three:** the coastal gate also fails independently. No current 2026 coastal certificate is on file for any vendor. Halcyon's expected certificate is not a certificate on file, and a 2024 coastal column would not be a current 2026 certificate.

**Deciding constraints:** Site B is over-determined. (1) The measured 700 mm corridor eliminates every current offer on width. (2) The absence of a current 2026 coastal certificate / coastal-rated warranty independently eliminates every current vendor. Screening in the order temperature → width → certification, width is the first gate that eliminates all offers, and the coastal gate is independently sufficient. Either gate alone blocks award.

**Qualified set:** **none.** There is no technically admissible offer for Site B in the declared sources.

**What the former 1200 mm value would have implied — and why it is not used:** under the old 1200 mm assumption, all three nominal widths would have passed. That assumption is superseded by the 2026-11-03 measurement and cannot support an award. No Site B decision in this package relies on 1200 mm.

### 3.5 Deciding constraints by site

| Site | Deciding constraint(s) | Evidence | Consequence |
|---|---|---|---|
| **Site A** | **−12 °C design minimum temperature** | `sources/sites.md`; `sources/capacity.csv` | Halcyon-850 excluded; Kestrel-900 and Solaris-800 remain qualified. |
| **Site B — constraint 1** | **Measured 700 mm corridor width** | `inbox/2026-11-03/corridor-measurement.md` | All current offers excluded on nominal width; no Site B deployment is possible with the current catalogue. |
| **Site B — constraint 2 (independently disqualifying)** | **Current 2026 coastal certificate / coastal-rated warranty** | `sources/sites.md`; `sources/vendors.md` | All current vendors fail; Halcyon's “expected” certificate is unverified and is not a certificate on file. |

### 3.6 Missing technical data

The following are required before a complete technical assessment can be signed off:

- site maximum design ambient temperature (both sites);
- quantities and load/performance requirements;
- electrical and thermal capacity ratings, efficiency, and interface requirements;
- installation clearance and maneuvering envelope at both sites;
- structural, drainage, and services constraints;
- acoustic and emissions requirements, if applicable;
- commissioning and acceptance criteria.

---

## 4. Vendor compliance assessment

### 4.1 Compliance standard applied

| Requirement | Pass condition | Evidence accepted |
|---|---|---|
| Site A temperature | Unit minimum ≤ −12 °C | Declared minimum in `capacity.csv` |
| Site A width | Nominal width ≤ 1200 mm | Declared width in `capacity.csv` |
| Site A coastal | Not applicable | — |
| Site B temperature | Unit minimum ≤ −4 °C | Declared minimum in `capacity.csv` |
| Site B width | Nominal width ≤ **700 mm measured** | Measured inbox update, not the superseded 1200 mm assumption |
| Site B coastal | Current 2026 coastal certificate **and** coastal-rated warranty, model-specific | The binding requirement is a coastal-rated warranty; the certificate is required as evidence that the offered model is coastal-rated, and the warranty terms must show that the rating is carried into the warranty. Certificate on file with identifier, issuer, scope, and validity. A 2024 column is not a current 2026 certificate; an expected certificate is not a certificate on file. |

### 4.2 Compliance matrix

| Vendor / model | Warranty | Coastal evidence in record | Current 2026 certificate? | Site A | Site B | Principal evidence gap |
|---|---:|---|---|---|---|---|
| **Kestrel-900** | 5 years | No coastal certification in the declared sources | **No** | **Qualified** (temp + width pass) | **Not compliant** (width fail + coastal gate fail) | No current coastal certificate; no coastal-rated warranty evidence. |
| **Solaris-800** | 7 years | No coastal certification in the declared sources | **No** | **Qualified** (temp + width pass) | **Not compliant** (width fail + coastal gate fail) | No current coastal certificate; no coastal-rated warranty evidence. |
| **Halcyon-850** | 10 years | Vendor says a 2026 coastal certificate is “expected”; **no certificate on file** | **No — unverified claim** | **Not compliant** (temperature fail) | **Not compliant** (width fail + coastal gate fail) | No certificate on file; “expected” is not evidence. The 10-year warranty does not establish coastal rating. |

### 4.3 Vendor-by-vendor findings

**Kestrel-900**

- Declared range −20 °C to 45 °C; 900 mm wide; 8-week lead; 5-year warranty.
- Site A: fully qualified on the declared gates.
- Site B: fails width (900 mm > 700 mm measured) and fails the coastal gate (no certification in the declared sources).
- The shorter lead time and larger cold margin are technical advantages at Site A, but they do not offset the Site B failures.

**Solaris-800**

- Declared range −15 °C to 40 °C; 800 mm wide; 10-week lead; 7-year warranty.
- Site A: fully qualified on the declared gates. The 3 K cold margin is the smallest passing margin among the Site A candidates.
- Site B: fails width (800 mm > 700 mm measured) and fails the coastal gate (no certification in the declared sources).
- The longer warranty is a commercial advantage at Site A, but it does not establish coastal compliance and does not cure the Site B width failure.

**Halcyon-850**

- Declared range −10 °C to 35 °C; 850 mm wide; 12-week lead; 10-year warranty.
- Site A: fails the temperature gate by 2 K. The 10-year warranty and 850 mm width do not cure the failure.
- Site B: fails width (850 mm > 700 mm measured) and fails the coastal gate. The statement that a 2026 coastal certificate is “expected” is an unverified vendor assertion; **an expected certificate is not a certificate on file**.
- No inference is drawn that the certificate will be issued, that it will cover the offered model, or that it will be valid for the required period.

### 4.4 Coastal certificate verification standard

A certificate will be accepted only if all of the following are true:

1. It is **current** for the relevant period (2026), not a 2024 column, listing, or historical statement.
2. It is **model-specific** to the exact unit offered, including any variant or accessory that affects coastal exposure.
3. It shows a certificate identifier, issuing body, scope, issue date, and expiry date.
4. It is a **document on file**, not a statement that a certificate is expected, pending, or planned.
5. The warranty terms expressly cover coastal exposure and are consistent with the certificate's scope.

If any of these is missing, the vendor is recorded as **not demonstrated compliant**, not as “probably compliant.”

### 4.5 Vendor compliance conclusion

- **Site A:** two vendors are technically compliant on the declared gates (Kestrel-900, Solaris-800). Neither has a Site A coastal obligation.
- **Site B:** zero vendors are compliant. Width excludes all three current offers; the absence of a current 2026 coastal certificate and coastal-rated warranty independently excludes them as well.
- **No vendor is awarded or recommended for award by this package.**

---

## 5. Cost and budget model

### 5.1 Cost status

**No monetary estimate is asserted in this package.** The declared sources contain no unit prices, freight rates, installation rates, quantities, tax rates, currency, or approved budget. Any specific monetary figure would be an invented claim, not a source-based estimate. **Unpriced does not mean zero cost; it means the record contains no basis for a number.**

The cost model below is therefore **parametric**: it defines the cost structure, the data required to populate it, and the authorization gate that must be passed before any commitment. It is complete as a model, but it is not a priced budget.

### 5.2 Parametric cost model

For site *s* and unit option *u*:

```
Capex(s,u) = Q(s,u) × [P(u) + F(s,u) + I(s,u) + S(u)] + G(s) + T(s)
Total_budget(s,u) = Capex(s,u) + Contingency(s,u) + Escalation(s,u)
LCC(s,u) = Total_budget(s,u) + PV[Energy(s,u) + Maintenance(s,u) + Replacement(s,u)
           + Downtime(s,u) − Residual(s,u)]
```

Where:

- `Q` = quantity of units (not declared);
- `P` = firm unit price (not declared);
- `F` = freight/delivery to site (not declared);
- `I` = installation and commissioning per unit (not declared);
- `S` = spares and accessories (not declared);
- `G` = site-level civil, electrical, and services works (not declared);
- `T` = taxes, duties, and import costs (not declared);
- `Contingency` = risk allowance (planning proposal: 10–15%, not approved and not a source fact);
- `Escalation` = price escalation to the order date (not declared);
- `PV[...]` = present value of operating costs over the evaluation horizon (no energy, maintenance, replacement, downtime, or residual values are declared).

### 5.3 Cost elements and evidence status

| Cost element | Needed input | Status in declared sources | Action required |
|---|---|---|---|
| Unit equipment price | Firm quote per model and quantity | **Missing** | RFQ to Kestrel and Solaris for Site A; no Site B RFQ until a width-compliant, certificated unit is identified. |
| Freight and delivery | Quote to each site, including access constraints | **Missing** | Include in RFQ; confirm delivery point and unloading responsibility. |
| Installation and commissioning | Site survey and contractor quote | **Missing** | Survey both sites; obtain fixed-price or schedule-of-rates quotes. |
| Site works (civil/electrical) | Engineering design and contractor quote | **Missing** | Assess after site survey; separate from unit price. |
| Spares and accessories | Vendor list and quantities | **Missing** | Request recommended spares list. |
| Warranty and service | Contract terms and price | Duration only (5/7/10 years); price and coastal terms missing | Request warranty terms in writing; Site B requires coastal-rated terms. |
| Taxes, duties, import | Jurisdiction and Incoterms | **Missing** | Confirm with finance/procurement. |
| Contingency | Risk-based allowance | **Not approved** | Budget owner to set; 10–15% is a planning proposal only. |
| Energy and maintenance | Load profile, tariffs, service plan | **Missing** | Required for lifecycle comparison; not available. |
| Downtime / lost output | Site criticality and backup arrangement | **Missing** | Site owner input. |

### 5.4 Site A cost comparison framework

Both qualified Site A options must be priced on the same basis. The comparison should include:

| Criterion | Kestrel-900 | Solaris-800 | Treatment in evaluation |
|---|---|---|---|
| Equipment price | Quote required | Quote required | Firm, like-for-like scope. |
| Freight and installation | Quote required | Quote required | Same delivery point and scope. |
| Declared lead time | 8 weeks | 10 weeks | Value schedule difference; do not assume it is free. |
| Warranty | 5 years | 7 years | Value lifecycle risk; confirm what is covered. |
| Cold margin | 8 K | 3 K | Technical preference to Kestrel; verify site design margin. |
| Width | 900 mm | 800 mm | Both pass; no Site A constraint. |
| Site B suitability | None (width + cert fail) | None (width + cert fail) | Cannot be used to justify a Site B award. |

**Commercial decision rule:** award only the option with a firm, complete quote that is within an approved budget and meets the technical and warranty requirements. If both are within budget, Kestrel-900 is preferred on cold margin and schedule; Solaris-800 is preferred only if its longer warranty and/or lower evaluated lifecycle cost demonstrably outweigh the 2-week schedule difference and the smaller cold margin.

### 5.5 Site B cost model

No Site B cost model is carried forward for the current offers because **no current offer is admissible**. Pricing a non-compliant unit would create a misleading budget anchor for an option that cannot be installed. A Site B cost model will be opened only after a unit with:

- nominal width ≤ 700 mm (including installation clearance), and
- a current 2026 coastal certificate on file, and
- a coastal-rated warranty

has been identified and quoted.

### 5.6 Budget authorization gate

| Gate | Status | Authority required |
|---|---|---|
| Technical shortlist | Site A: complete (2 qualified). Site B: none. | Engineering review. |
| Firm priced quotes | Not obtained. | Procurement. |
| Approved budget line | Not established in the declared sources. | Budget owner / principal. |
| Purchase order | Not released. | Authorized approver only. |
| Contract with warranty terms | Not negotiated. | Procurement / legal. |

**No expenditure is approved by this package, and no budget request is made by it.** The absence of a price basis and an approved budget is itself a bar to any purchase order.

---

## 6. Implementation schedule

### 6.1 Scheduling basis

- **Week 0** is the date of authority to proceed (ATP), which has **not** been granted. All timings are relative, not calendar commitments.
- Lead times are the vendor-declared values in `capacity.csv`: 8 weeks (Kestrel), 10 weeks (Solaris), 12 weeks (Halcyon).
- The 2-week RFQ/award period and 2-week installation/commissioning period are **planning assumptions**, not source facts. They must be replaced by actual procurement and contractor schedules.
- Site B has no start date because its technical and compliance gates are not closed.

### 6.2 Site A schedule

| Step | Start | Duration | Finish | Dependency / note |
|---|---|---|---|---|
| Package review and authority to issue RFQ | W0 | — | W0 | Principal/technical review; no spend. |
| RFQ, clarifications, quote evaluation | W0 | 2 weeks (assumption) | W2 | Firm quotes for Kestrel-900 and Solaris-800; quantity confirmed. |
| Award and purchase order | W2 | — | W2 | Only after budget approval and compliant quote. |
| Kestrel-900 lead time | W2 | 8 weeks (declared) | W10 | Preferred option. |
| Delivery, installation, commissioning | W10 | 2 weeks (assumption) | W12 | Site readiness, access, services. |
| Handover and warranty start | W12 | — | W12 | Acceptance testing. |
| **Solaris-800 alternate** | | | | |
| Solaris-800 lead time | W2 | 10 weeks (declared) | W12 | Alternate option. |
| Delivery, installation, commissioning | W12 | 2 weeks (assumption) | W14 | Two weeks later than Kestrel. |

**Site A earliest indicative operational date:** about **12 weeks after ATP** with Kestrel-900; about **14 weeks after ATP** with Solaris-800. These are planning durations, not guarantees.

### 6.3 Site B schedule

| Step | Status | Timing |
|---|---|---|
| Stop current-offer procurement | Immediate | No award while gates are open. |
| Certificate RFI to all vendors | Required | Start at W0; duration unknown. |
| Market scan for a unit with nominal width ≤700 mm | Required | Start at W0; duration unknown. |
| Re-measure/confirm corridor and installation clearance | Required if any tolerance doubt | Before any award; the 700 mm survey is the current governing measurement. |
| Principal decision if no width-compliant unit exists | Required | After market scan; could be re-scope, requirement change, or deferral. |
| Award and delivery | **Not scheduled** | Cannot be scheduled until a compliant unit and current certificate exist. |

**Site B has no critical path yet** because it is blocked at the admissibility gate. Vendor lead time is not the constraint; product availability and certification are.

### 6.4 Program milestones and gates

| ID | Milestone / gate | Pass condition |
|---|---|---|
| M0 | Package review | This package accepted for review; open items assigned. |
| M1 | Authority to issue Site A RFQ | Principal/technical approval; no spend. |
| M2 | Site A award | Firm compliant quote + approved budget + delivery terms. |
| M3 | Site A operational | Delivery, installation, commissioning, acceptance. |
| G-B1 | Site B width gate | Unit nominal width ≤700 mm, including documented installation clearance. |
| G-B2 | Site B coastal gate | Current 2026 certificate on file, model-specific and verified. |
| G-B3 | Site B warranty gate | Coastal-rated warranty terms confirmed in writing. |
| M4 | Site B award | G-B1, G-B2, G-B3, price, quantity, and budget all closed. |

### 6.5 Critical path

- **Site A:** RFQ/award → lead time → installation/commissioning. Kestrel-900 is the shorter path.
- **Program:** Site B's unresolved admissibility and certification gates dominate the program risk. No amount of Site A schedule compression resolves Site B.
- **Float:** Site A has roughly 2 weeks of schedule advantage with Kestrel versus Solaris, but that advantage is not a reason to skip commercial or budget gates.

---

## 7. Risk and uncertainty review

### 7.1 Risk register

| ID | Risk | Site | Likelihood | Impact | Rating | Basis | Mitigation / owner |
|---|---|---|---|---|---|---|---|
| R-01 | Measured 700 mm corridor excludes every offered unit (800–900 mm) | B | **Certain** | High | **Critical** | `inbox/2026-11-03/corridor-measurement.md`; `capacity.csv` | No award. Re-scope to a ≤700 mm unit or obtain an authorized corridor/site change. Engineering. |
| R-02 | No current 2026 coastal certificate on file for any vendor | B | **High** (none demonstrated) | High | **Critical** | `vendors.md`; `sites.md` | Require certificate on file; verify issuer, model, scope, expiry. Reject 2024 columns and “expected” claims. Compliance/procurement. |
| R-03 | Coastal-rated warranty not evidenced for any vendor | B | **High** | High | **High** | `sites.md`; `vendors.md` | Written warranty terms expressly covering coastal exposure; align with certificate scope. Procurement/legal. |
| R-04 | Halcyon-850 cannot meet Site A −12 °C | A | **Certain** | Medium | **Medium** | `capacity.csv`: −10 °C minimum | Exclude from Site A. Do not let warranty length override the temperature gate. Engineering. |
| R-05 | Solaris-800 has only 3 K cold margin at Site A | A | Medium | Medium | **Medium** | `capacity.csv` | Prefer Kestrel-900, or verify actual design margin and standby/anti-freeze provisions before selecting Solaris. Engineering. |
| R-06 | No prices, quantities, or approved budget | A/B | **High** | High | **High** | Declared sources contain none | RFQ and budget approval before any PO. Do not use invented figures. Procurement/finance. |
| R-07 | No width-compliant product is identified in the current catalogue | B | **High** | High | **Critical** | All declared widths >700 mm | Market scan; if none, principal decision on re-scope/requirement/deferral. Engineering/procurement. |
| R-08 | A 2024 coastal column or listing is offered as if current | B | Medium | High | **High** | `sites.md` warning | Reject; require current 2026 certificate with validity dates. Compliance. |
| R-09 | The superseded 1200 mm assumption is reused in later documents | B | Medium | High | **High** | `sites.md` says assumption; inbox says superseded | Version control; use 700 mm in all Site B documents; require survey reference. Document control. |
| R-10 | Site maximum temperature and electrical/thermal data missing | A/B | **High** | Medium | **Medium** | Not in sources | Site survey and vendor datasheets. Engineering. |
| R-11 | Declared lead times are not met | A | Medium | Medium | **Medium** | Vendor-declared, not contractual | Contract delivery terms, milestones, and schedule contingency. Procurement. |
| R-12 | Only two qualified Site A vendors; one may fail commercially | A | Medium | Medium | **Medium** | Halcyon excluded by temperature | Keep both Kestrel and Solaris qualified through RFQ; do not sole-source prematurely. Procurement. |
| R-13 | Installation clearance reduces the effective width at either site | A/B | Medium | Medium | **Medium** | Only nominal unit widths are declared | Site survey; confirm maneuvering and clearance. Engineering. |
| R-14 | A binding requirement is changed without authority | B | Low | High | **High** | Coastal warranty and width are binding | Any waiver/re-scope goes to the principal; this package does not authorize it. Principal. |

### 7.2 Uncertainty register

| Uncertainty | Why it matters | Current treatment |
|---|---|---|
| Corridor measurement tolerance and installation clearance | 700 mm is a measured width, but tolerance and maneuvering space are not stated. A nominal 800 mm unit already fails by 100 mm; no near-fit case is assumed. | Use 700 mm as governing; verify tolerance before any future near-fit design. |
| Existence, scope, and validity of a future Halcyon certificate | A certificate might be issued, but it is not on file; its model scope and validity are unknown. | Recorded as unverified; no schedule or compliance credit. |
| Whether any current certificate exists for Kestrel or Solaris | The sources say none is declared, not that none can ever exist. | Treated as not demonstrated; vendor may submit evidence. |
| Unit prices, freight, installation, taxes | No cost basis exists. | Parametric model; no monetary assertion. |
| Quantities and load | Cost, schedule, and technical adequacy scale with quantity/load. | Open item; no assumption used in the decision. |
| Site maximum ambient temperature | The units' maximum ratings differ; a hot site could change the qualified set. | Not assessable; open item. |
| Lead-time reliability | Declared lead times may be indicative. | Planning assumption; contract terms required. |
| Warranty value | 5 vs 7 vs 10 years is not directly comparable without coverage terms. | Duration recorded; coverage and coastal rating still required. |

### 7.3 Scenario and sensitivity tests

1. **Halcyon produces a 2026 coastal certificate.** Site B still fails width (850 mm > 700 mm). Site A still fails temperature (−10 °C vs −12 °C). The certificate would close only one Site B gate; it would not create an admissible unit.
2. **A 2024 coastal column is offered.** It is not a current 2026 certificate. Reject; no change to the decision.
3. **The corridor is re-measured wider than 900 mm.** Width could then pass for all units, but the current 2026 coastal certificate gate would still exclude all current vendors. A new measurement must be documented; the 1200 mm assumption is still not evidence.
4. **The corridor is exactly 800 mm.** Solaris-800 is nominally equal, leaving zero clearance; installation clearance is undeclared. Do not treat this as a pass without a documented clearance assessment. The coastal gate would also remain open.
5. **The Site B coastal requirement is waived.** Width still excludes every current offer. A waiver would also be a change to a binding requirement requiring principal authority, and is not recommended.
6. **Kestrel-900 is commercially unattractive at Site A.** Solaris-800 remains qualified; the schedule extends by about 2 weeks and the cold margin falls to 3 K. Re-evaluate on price and warranty.
7. **Quantities are larger than one unit per site.** Lead times, freight, installation, and budget scale; no quantity is assumed in this package.

### 7.4 Risk conclusion

The dominant risks are not installation risks; they are **admissibility and evidence risks**:

- Site B cannot be served by any unit in the declared catalogue because of the measured 700 mm corridor.
- Site B also has no current 2026 coastal certificate and no coastal-rated warranty on file for any vendor.
- Site A is technically feasible with two vendors, but is not priced or budget-approved.

No risk treatment in this package converts an unverified claim into compliance. The correct treatment for the coastal-certificate risk is documentary verification, not a schedule assumption.

---

## 8. Integrated decision and conditions

### 8.1 Recommendation

**Program-level recommendation: CONDITIONAL PROCEED ON SITE A; HOLD SITE B — with no award and no expenditure.**

| Site | Recommended decision | Scope of the recommendation |
|---|---|---|
| **Site A** | **Recommended conditional go to a priced RFQ, subject to principal approval.** | Technical shortlist only. Kestrel-900 preferred; Solaris-800 alternate. No purchase order until price, quantity, delivery, warranty, and budget are approved. |
| **Site B** | **Recommended no-go on all current offers; the no-go is over-determined by two independent gates.** | No award, no order, no schedule commitment. Reopen only after a ≤700 mm unit with a current 2026 coastal certificate and coastal-rated warranty is on file, or after an authorized requirement/site change. |

### 8.2 Site A — conditions precedent

1. Confirm quantity, load requirement, site maximum temperature, and electrical/thermal interface.
2. Obtain firm, like-for-like quotes from Kestrel-900 and Solaris-800, including freight, installation, commissioning, spares, warranty, and delivery.
3. Confirm the 1200 mm Site A width limit applies to the installed envelope and that access/clearance is adequate.
4. Obtain budget approval from the authorized budget owner.
5. Select Kestrel-900 unless the evaluated commercial/lifecycle case for Solaris-800 is clearly superior; document the basis.
6. Execute a contract with delivery, acceptance, and warranty terms before releasing a purchase order.

**Site A is not approved for expenditure by this package.** The conditional go is a recommendation to prepare a priced RFQ; it is not authority to buy.

### 8.3 Site B — conditions to reopen

All of the following are required before any Site B award:

1. **Width:** a unit with nominal width ≤700 mm, including documented installation clearance, or an authorized corridor/site modification that is re-measured and approved.
2. **Coastal certificate:** a current 2026 certificate on file, model-specific, with identifier, issuer, scope, and validity, verified with the issuer.
3. **Warranty:** written coastal-rated warranty terms consistent with the certificate scope.
4. **Commercial:** firm price, quantity, delivery, and approved budget.
5. **Technical:** confirmation of site maximum temperature and electrical/thermal interface.

If no width-compliant unit can be found, the principal must choose between re-scoping the site/corridor, changing the requirement, or deferring Site B. This package does not recommend waiving the coastal requirement, and it does not authorize a corridor modification.

### 8.4 What would change the decision

| Event | Effect |
|---|---|
| A current 2026 coastal certificate arrives for Halcyon-850 | Does **not** make Site B compliant (850 mm > 700 mm) and does **not** make Site A compliant (−10 °C > −12 °C). Only one Site B gate would close. |
| A ≤700 mm unit with a current certificate and coastal-rated warranty is identified | Site B can move to priced RFQ and technical review. |
| The Site B corridor is re-measured above 900 mm and documented | Width may cease to bind, but the coastal certificate and warranty gates still apply. |
| Site A quotes exceed the approved budget | No award; re-scope, re-tender, or defer. |
| A 2024 coastal column is presented as certification | No effect; it is not a current 2026 certificate. |
| A vendor offers an “expected” certificate | No effect; it is not a certificate on file. |

### 8.5 What this package does not decide

- It does not select a vendor for award.
- It does not approve any expenditure or budget.
- It does not waive the Site B coastal requirement.
- It does not authorize a corridor or site modification.
- It does not commit to a calendar completion date.
- It does not certify any vendor's coastal status.

### 8.6 Approval block

| Role | Name | Decision / signature | Date |
|---|---|---|---|
| Prepared by (analysis) | Work worker | Package prepared | 2026-11-05 |
| Technical reviewer |  |  |  |
| Commercial reviewer |  |  |  |
| Compliance reviewer |  |  |  |
| Budget owner |  |  |  |
| Principal / decision-maker |  |  |  |

---

## 9. Open items and evidence requests

| ID | Item | Needed for | Blocking? | Owner |
|---|---|---|---|---|
| OI-01 | Current 2026 coastal certificate for Kestrel-900 | Site B coastal gate | Yes, if Site B proceeds | Vendor / compliance |
| OI-02 | Current 2026 coastal certificate for Solaris-800 | Site B coastal gate | Yes, if Site B proceeds | Vendor / compliance |
| OI-03 | Current 2026 coastal certificate for Halcyon-850 | Site B coastal gate | Yes, but not sufficient alone (width fail) | Vendor / compliance |
| OI-04 | Written coastal-rated warranty terms for all vendors | Site B warranty gate | Yes | Vendor / procurement |
| OI-05 | Unit options with nominal width ≤700 mm | Site B width gate | Yes | Procurement / engineering |
| OI-06 | Corridor re-measurement and tolerance/clearance confirmation | Site B width verification | Recommended before any near-fit design | Engineering |
| OI-07 | Site maximum ambient temperature, both sites | Maximum-temperature check | Yes for full technical sign-off | Engineering |
| OI-08 | Quantities and load/performance requirements | Cost, schedule, technical adequacy | Yes | Site owner |
| OI-09 | Firm quotes: equipment, freight, installation, commissioning, spares | Cost model / budget | Yes for any award | Procurement |
| OI-10 | Electrical/thermal datasheets and interface requirements | Technical design | Yes for detailed design | Vendor / engineering |
| OI-11 | Approved budget line | Expenditure gate | Yes for any PO | Budget owner |
| OI-12 | Contract delivery, acceptance, and warranty terms | Award | Yes for any PO | Procurement / legal |

---

## Appendix A — Source traceability

### A.1 Site requirements (`sources/sites.md`)

> “Site A: design minimum -12 °C; maximum admissible unit width 1200 mm; no coastal requirement.” (line 3)
>
> “Site B: design minimum -4 °C; a coastal-rated warranty is binding. The baseline corridor value of 1200 mm is an ASSUMPTION, not a measurement.” (line 4)
>
> “A 2024 coastal column is not a current 2026 certificate. An expected certificate is not a certificate on file.” (line 6)

### A.2 Declared product data (`sources/capacity.csv`)

| Unit | Min °C | Max °C | Width (mm) | Lead (weeks) |
|---|---:|---:|---:|---:|
| Kestrel-900 | −20 | 45 | 900 | 8 |
| Solaris-800 | −15 | 40 | 800 | 10 |
| Halcyon-850 | −10 | 35 | 850 | 12 |

### A.3 Vendor statements (`sources/vendors.md`)

> “Kestrel: 5-year warranty; no coastal certification in the declared sources.” (line 3)
>
> “Solaris: 7-year warranty; no coastal certification in the declared sources.” (line 4)
>
> “Halcyon: 10-year warranty; says a 2026 coastal certificate is 'expected', but no certificate is on file. Treat the claim as unverified.” (line 5)

### A.4 Inbox measurement (`inbox/2026-11-03/corridor-measurement.md`)

> “Measured width: 700 mm (survey performed 2026-11-03).” (line 3)
>
> “The earlier 1200 mm corridor value was an assumption, not a measurement. It is superseded.” (line 5)
>
> “The 900 mm unit is NOT admissible at site B.” (line 6)

### A.5 Inbox instruction (`inbox/README.md`)

> “An inbox item is evidence only to the extent its own text states; a claim about a future certificate is not a certificate.” (line 4)

---

## Appendix B — Calculations and gate logic

### B.1 Temperature margins

| Unit | Site A: −12 − unit min | Site B: −4 − unit min |
|---|---:|---:|
| Kestrel-900 | −12 − (−20) = **+8 K** | −4 − (−20) = **+16 K** |
| Solaris-800 | −12 − (−15) = **+3 K** | −4 − (−15) = **+11 K** |
| Halcyon-850 | −12 − (−10) = **−2 K (fail)** | −4 − (−10) = **+6 K** |

### B.2 Width margins

| Unit | Site A spare vs 1200 mm | Site B overrun vs 700 mm |
|---|---:|---:|
| Kestrel-900 | 1200 − 900 = **+300 mm** | 900 − 700 = **200 mm over (fail)** |
| Solaris-800 | 1200 − 800 = **+400 mm** | 800 − 700 = **100 mm over (fail)** |
| Halcyon-850 | 1200 − 850 = **+350 mm** | 850 − 700 = **150 mm over (fail)** |

### B.3 Gate order

```
Site A: temperature (−12 °C) → width (1200 mm) → qualified
Site B: temperature (−4 °C) → width (700 mm measured) → coastal certificate (2026)
        → coastal-rated warranty → qualified
```

A failure at any gate is sufficient to disqualify. Passing a later gate cannot cure an earlier failure. This is why Halcyon's 10-year warranty and expected coastal certificate do not make it eligible at either site, and why a future Halcyon certificate would not cure its Site B width overrun.

---

*End of package.*
