# Multi-site energy deployment — Review Package

**Project:** L / `lhape-pilot`  
**Prepared:** 2026-11-04  
**Status:** DRAFT FOR DECISION REVIEW — this is not an approval, a purchase order, or an expenditure authorization.  
**Decision in one line:** Site A may proceed to **priced procurement** with Kestrel-900 or Solaris-800; Site B is a **no-go for the current candidate field** because the measured 700 mm corridor is narrower than every unit and no vendor has a current coastal certificate on file.

---

## 0. How to read this package

This package separates four things that are often blurred together:

| Label | Meaning in this package |
|---|---|
| **Requirement** | A binding project constraint. The package must satisfy it. |
| **Declared** | A statement appearing in a supplied source. It is an input, not an independently verified fact. |
| **Assumption** | A planning value that has not been measured or confirmed. It must be verified before commitment. |
| **Unverified claim** | A vendor or planning statement that cannot be relied on as evidence, including an "expected" certificate. |

Two evidence rules govern the analysis:

- **R2:** A 2024 coastal column is **not** a current 2026 coastal certificate; an expected certificate is **not** a certificate on file. No such document is treated as compliance evidence in this package.
- **R1:** The package must name the deciding constraint for each site. Those constraints are stated in §2 and carried through the integrated decision in §8.

**Source basis:** `sources/sites.md`, `sources/capacity.csv`, `sources/vendors.md`, and `inbox/` as observed at the time of preparation, including the measured corridor update in `inbox/2026-11-03/corridor-measurement.md`. The inbox was re-checked before this revision; see §10 for the check record. If new measured data arrives, this package must be re-verified rather than silently amended.

---

## 1. Source and evidence register

| Ref | Source | What it is used for | Evidence status | Limits |
|---|---|---|---|---|
| S1 | `sources/sites.md` | Site A and Site B design minimums, width limits, coastal requirement | Declared planning input | Not a site survey; the Site B 1200 mm width was expressly an assumption, now superseded by S5 |
| S2 | `sources/capacity.csv` | Unit minimum/maximum operating temperature, unit width, lead time | Declared vendor/datasheet values | Not independently tested; no site load, quantity, or price data |
| S3 | `sources/vendors.md` | Warranty duration and coastal-certification statements | Declared vendor statements | No certificate documents supplied; Halcyon statement is expressly unverified |
| S4 | `inbox/README.md` | Inbox protocol and evidence rule | Process note | No measured update was present at the last check |
| S5 | `inbox/2026-11-03/corridor-measurement.md` | Measured Site B corridor width | Measured survey update (2026-11-03) | Single measurement; supersedes the 1200 mm assumption; says nothing about coastal certification |

**What the sources do not contain.** There is no unit price, freight cost, balance-of-system (BOS) cost, installation cost, commissioning cost, contingency rate, operations-and-maintenance (O&M) cost, site load, unit quantity, site maximum ambient temperature, installation duration, or certificate document. Those gaps are material and are not filled by assumption in this package.

**Authority boundary.** The agent may investigate, analyse and recommend. It may not approve expenditure, accept a source on the operator's behalf, or promote an unverified claim to a fact. All expenditure decisions remain with the authorized operator.

---

## 2. Site requirements and deciding constraints

| Site | Design minimum | Maximum admissible unit width | Coastal requirement | **Deciding constraint (R1)** | Current status |
|---|---|---|---|---|---|
| **Site A** | −12 °C | 1200 mm | None | **Minimum operating temperature.** Halcyon-850 is rated only to −10 °C, a 2 K shortfall against the −12 °C design minimum. | Two units pass the technical screen (Kestrel-900, Solaris-800); final selection is open pending price and authority. |
| **Site B** | −4 °C | **700 mm measured corridor (2026-11-03; supersedes the 1200 mm assumption; installation clearance not stated)** | **Coastal-rated warranty is binding** | **Measured corridor width.** All three candidates are wider than 700 mm (Kestrel 900, Halcyon 850, Solaris 800), so none is admissible. Coastal-rated warranty is a **second, independent binding gate** and is also unmet. | **No-go for the current candidate field:** every unit fails fitment, and no current coastal certificate is on file. |

### 2.1 Site A

- The design minimum of −12 °C excludes Halcyon-850 (−10 °C minimum) on technical grounds, independently of price or warranty.
- All three units are narrower than the 1200 mm admissible width (900, 800 and 850 mm), so width does **not** decide Site A.
- Site A has no coastal requirement, so the missing coastal certification does not disqualify Kestrel or Solaris at Site A.
- The deciding constraint is therefore the **cold-end operating limit**. It is a hard constraint, not a preference.

### 2.2 Site B

- **Measured width: 700 mm** (survey dated 2026-11-03). The earlier 1200 mm value was an assumption, not a measurement, and is **superseded**. The survey states no installation clearance allowance; a unit at or near 700 mm would still need a clearance check.
- Every candidate is wider than the measured corridor: Kestrel-900 by 200 mm, Halcyon-850 by 150 mm and Solaris-800 by 100 mm. **No unit in the current field is admissible at Site B.** The narrowest candidate, Solaris-800, still needs 100 mm more than the site provides.
- The binding coastal requirement is **also** unmet: Kestrel and Solaris declare no coastal certification, and Halcyon's 2026 certificate is only "expected" with no certificate on file. Under R2, that expectation is not evidence and cannot qualify the unit.
- Width is now a **decisive physical failure**, not a verification item. Even a current coastal certificate would not make any of the three units fit. Conversely, finding a narrower unit would not cure the missing coastal evidence. Both gates must be satisfied independently.
- The deciding constraint is therefore the **measured 700 mm corridor width**; the coastal-rated warranty remains a second binding gate. Site B cannot be awarded on the present record.

**Effect of the measured update.** v0.1 of this package treated width as an open assumption and coastal certification as the sole deciding constraint at Site B. The measured 700 mm value replaces that assumption and changes the decision to no-go for all current candidates. The earlier reasoning about coastal evidence remains valid, but it is no longer the only blocker.

---

## 3. Technical capacity assessment

### 3.1 Scope of "capacity"

In `capacity.csv`, "capacity" means the unit's **permissible ambient operating envelope**, plus physical width and lead time — not site kW capacity or annual energy. No site load, unit count, redundancy requirement, or site maximum ambient temperature is supplied, so this section assesses **unit-level environmental and dimensional suitability**, not site sizing or total installed capacity. A site-level capacity conclusion would require data that is not in the sources.

### 3.2 Unit data and screening

Temperature margin is calculated as:

`margin = unit minimum − site design minimum` (positive means the unit can operate colder than the site requires).

Screening uses the **declared** values in `capacity.csv`; no independent test evidence is supplied. If a declared limit is wrong, the pass/fail result changes accordingly.

| Unit | Min °C | Max °C | Width mm | Lead weeks | Site A: min test | Site A: margin | Site A: width test | Site B: min test | Site B: margin | Site B: width test (700 mm) | Site B: coastal test |
|---|---:|---:|---:|---:|---|---:|---|---|---:|---|---|
| Kestrel-900 | −20 | 45 | 900 | 8 | Pass | **8 K** | Pass (300 mm headroom) | Pass | **16 K** | **Fail — 200 mm too wide** | Not demonstrated |
| Solaris-800 | −15 | 40 | 800 | 10 | Pass | **3 K** | Pass (400 mm headroom) | Pass | **11 K** | **Fail — 100 mm too wide** | Not demonstrated |
| Halcyon-850 | −10 | 35 | 850 | 12 | **Fail** | **−2 K** | Pass (350 mm headroom) | Pass | **6 K** | **Fail — 150 mm too wide** | Not demonstrated; certificate merely "expected" |

### 3.3 Findings

1. **Site A admits Kestrel-900 and Solaris-800.** Both meet the −12 °C design minimum and the 1200 mm width limit. Kestrel has the larger cold margin (8 K versus 3 K) and the shorter declared lead time (8 versus 10 weeks); Solaris carries the longer warranty (7 versus 5 years).
2. **Halcyon-850 is not technically eligible at Site A.** Its −10 °C minimum is 2 K warmer than the −12 °C design minimum. This is a disqualifying shortfall, not a derating opportunity on the supplied evidence.
3. **All three units pass the Site B cold-end test on paper** (margins of 16 K, 11 K and 6 K against −4 °C), but **all three fail the Site B width test** against the measured 700 mm corridor. The cold-end margin does not make any unit admissible, and the coastal requirement is independently unmet.
4. **The upper-temperature limit is unverified for every site.** The sources give no site maximum ambient temperature, so the 35/40/45 °C maxima cannot be tested against actual conditions. This is an open verification item, not a pass.
5. **Site B width is now measured, and it is decisive.** The survey records 700 mm, superseding the 1200 mm assumption. Kestrel-900 exceeds it by 200 mm, Halcyon-850 by 150 mm and Solaris-800 by 100 mm. No candidate fits. A unit of **700 mm or less** would pass the direct width comparison, subject to a clearance check (no clearance allowance is stated), and no such unit is in the supplied field.
6. **Site-level capacity cannot be stated.** Without load and quantity data, the package cannot compute installed kW, unit count, redundancy, or energy output.

---

## 4. Vendor compliance assessment

| Vendor / unit | Warranty (declared) | Coastal evidence in declared sources | Current 2026 certificate on file? | Site A compliance | Site B compliance | Assessment |
|---|---|---|---:|---|---|---|
| **Kestrel-900** | 5 years | None declared | **No** | Technically compliant; commercial terms open | **Not admissible (900 mm > 700 mm)**; coastal not demonstrated | Eligible for Site A shortlist; not qualified for Site B |
| **Solaris-800** | 7 years | None declared | **No** | Technically compliant; commercial terms open | **Not admissible (800 mm > 700 mm)**; coastal not demonstrated | Eligible for Site A shortlist; not qualified for Site B |
| **Halcyon-850** | 10 years | Says a 2026 coastal certificate is "expected"; no certificate on file | **No** | **Not compliant** (−10 °C vs −12 °C) | **Not admissible (850 mm > 700 mm)**; coastal not demonstrated | Not eligible at Site A; not admissible at Site B |

### 4.1 Compliance findings

- **Warranty duration is not coastal rating.** A 5-, 7- or 10-year warranty says nothing, by itself, about coastal certification or the corrosive environment the warranty must cover. The Site B requirement is a **coastal-rated warranty**, and no vendor has produced the underlying current certificate.
- **Halcyon's "expected" certificate is not a certificate.** It is an unverified forward-looking statement. It cannot be promoted to evidence by repetition, by a vendor assurance, or by the passage of time. A document dated 2026, issued for the specific model, currently valid, and covering the Site B environment would be required.
- **A 2024 datasheet column marked "coastal" is not a current 2026 coastal certificate.** Even if a 2024 coastal column appears in a vendor table, R2 says it cannot serve as current proof. Recency, model scope and validity must all be checked.
- **The measured width independently disqualifies every vendor at Site B.** All three units exceed the 700 mm corridor, so the coastal question cannot rescue any of them. A narrower unit would still need a current coastal certificate.
- **No vendor is compliant at Site B today.** The site is therefore not awardable on the present record, regardless of warranty length or price.
- **Site A compliance is technical only.** Kestrel and Solaris pass the environmental and width screen; their commercial compliance (price, delivery, warranty terms, service) is not yet established.

---

## 5. Cost / budget model

### 5.1 Status: no numeric budget can be produced from the supplied sources

The sources contain **no prices and no quantities**. A numeric capital or lifecycle budget at this stage would be fabricated. This package therefore provides a **parametric cost model and a data requirement list**, not a budget figure, and it does not authorize any spend.

### 5.2 Parametric model

For each site `s`:

```text
Capex_s = n_s × (unit_price_s + freight_per_unit_s)
        + BOS_s
        + installation_s
        + commissioning_s
        + permitting_s
        + contingency_s

TCO_s   = Capex_s
        + Σ_t O&M_s,t / (1 + r)^t
        + replacement_s
        − warranty_recovery_s

Budget test: Capex_s ≤ approved_budget_s   (approved_budget_s is an operator decision)
```

Where `n_s` is the number of units, `r` is the operator's discount rate, and every term is currently **unknown** unless listed in §5.3.

### 5.3 Cost-element data status

| Cost element | Needed input | Status in sources | Consequence |
|---|---|---|---|
| Unit price | Per-model quoted price, validity, currency, Incoterms | **Missing** | Cannot rank Kestrel vs Solaris or test affordability |
| Quantity `n_s` | Site load, unit rating, redundancy policy | **Missing** | Cannot size the order or total capex |
| Freight | Route, weight, duties, insurance | **Missing** | Material for a coastal/island site; unknown |
| BOS | Electrical, controls, mounting, protection | **Missing** | Usually a significant share of capex; unknown |
| Installation | Labor, plant, civils, access | **Missing** | Schedule and cost unknown |
| Commissioning | Test regime, witnessing, grid connection | **Missing** | Handover date unknown |
| Permitting | Local approvals, environmental, coastal | **Missing** | Could gate Site B independently |
| Contingency | Risk allowance, operator policy | **Missing** | Cannot set a defensible reserve |
| O&M | Service contract, consumables, inspections | **Missing** | TCO cannot be compared |
| Warranty value | Terms, exclusions, coastal scope, remedies | Partial: duration only (5/7/10 years) | Duration is not comparable without scope and remedies |
| Cost of delay | Lost revenue/service, price escalation | **Missing** | Cannot value the shorter Kestrel lead time |

### 5.4 What the model implies for the decision

- **Cost cannot discriminate between Kestrel-900 and Solaris-800 today.** Both pass the Site A technical screen; the cheaper unit on a whole-life basis cannot be identified without the inputs above.
- **Site B has no cost case to evaluate.** There is no candidate that is both width-admissible (≤700 mm) and coastal-certified, so pricing the current units would create a false comparison. A re-scoped Site B would start a new cost exercise; it cannot inherit Site A's assumptions.
- **No budget envelope is proposed.** Setting one without quantities and quotes would anchor the procurement to an invented number. The operator should set the envelope after priced RFQs, or provide a cap that the RFQ must test.
- **No expenditure is approved by this package.** A purchase order requires, at minimum: a priced and accepted offer, an authorized budget, and a compliant technical/certification basis.

---

## 6. Implementation schedule

### 6.1 What is known

Only **declared lead times** are supplied: Kestrel 8 weeks, Solaris 10 weeks, Halcyon 12 weeks. Installation, commissioning, permitting and certification durations are not supplied. Calendar dates therefore cannot be committed. The schedule below is **relative to a notional purchase order at week 0** and deliberately leaves non-lead-time durations as `TBD` rather than inventing them.

### 6.2 Site A — relative schedule after a purchase order

| Stage | Kestrel-900 | Solaris-800 | Basis |
|---|---:|---:|---|
| Purchase order / award | Week 0 | Week 0 | Requires operator authority and priced offer |
| Manufacturing / delivery lead | 8 weeks | 10 weeks | Declared lead time (S2) |
| Delivery to site | Week 8 | Week 10 | Assumes lead time starts at PO and runs without slip |
| Installation | TBD | TBD | Duration not in sources |
| Commissioning / handover | TBD | TBD | Duration not in sources |
| **Earliest equipment availability** | **Week 8** | **Week 10** | Not a handover date |

Kestrel-900 is **2 weeks faster** than Solaris-800 on declared lead time. That advantage is only one input; it does not override the longer Solaris warranty or unknown price. Neither option has a committed delivery date.

### 6.3 Site B — gated schedule

Site B cannot enter the procurement schedule yet. Its critical path is **evidence and qualification**, not manufacturing:

| Gate | What must be true | Status |
|---|---|---|
| B0 — Coastal evidence | A current 2026 coastal certificate is on file for a specific candidate, with scope covering Site B | **Open — no certificate on file** |
| B1 — Fitment | A candidate unit fits the measured 700 mm corridor (no wider than 700 mm; clearance allowance to be confirmed) | **Failed for every current candidate** — 800, 850 and 900 mm units all exceed 700 mm |
| B2 — Technical screen | Candidate meets −4 °C, the measured width, and has a coastal-rated warranty | **Blocked by B0 and B1** |
| B3 — Commercial | Priced offer, delivery, warranty terms reviewed | **Not started** |
| B4 — Authority | Operator approves budget and award | **Not requested** |

**Site B is not schedulable with the current candidate field.** B1 is a hard failure, not an open survey: the measured corridor is 700 mm and no supplied unit fits. Reopening Site B requires either (a) a clearance-checked unit of 700 mm or less with a current 2026 coastal certificate, or (b) an authorized engineering decision to change the corridor or relocate/re-scope the site — a decision outside this package and outside the agent's authority. The certification gate (B0) remains critical, but finding a certificate alone would not make any current unit installable. **The certification and fitment gates may both take longer than any manufacturing lead time.**

### 6.4 Schedule assumptions and exclusions

- Lead times are vendor declarations, not guaranteed dates; no liquidated damages or delivery commitments are in the sources.
- Week 0 is not a real date. A real start date requires an authorized award.
- Installation and commissioning durations, permitting, grid connection, and weather windows are excluded because they are unknown.
- Site A and Site B are scheduled independently; Site B must not delay a Site A award.

---

## 7. Risk and uncertainty review

### 7.1 Risk register

| ID | Risk | Category | Likelihood | Impact | Evidence | Mitigation / gate | Residual |
|---|---|---|---|---|---|---|---|
| R-01 | Site B has no coastal-compliant vendor; the binding requirement cannot be met from the current field | Compliance | High | High | S3: no current certificate for any vendor | Obtain a current 2026 certificate on file, or re-plan Site B. Do not procure. | High until certificate verified |
| R-02 | Halcyon's "expected" certificate is treated as a certificate | Evidence / compliance | Medium | High | S3; R2 | Require the original certificate: issuer, model scope, validity dates, coastal rating. Vendor assurance alone is insufficient. | Low if gate enforced |
| R-03 | A 2024 coastal column is mistaken for a current 2026 certificate | Evidence / compliance | Medium | High | R2 | Check document date and validity period; reject 2024 material as current proof. | Low if gate enforced |
| R-04 | Site B corridor is too narrow for every candidate | Technical / fitment | **Realized** | **High** | S5: measured 700 mm; Kestrel 900, Halcyon 850, Solaris 800 | Do not procure. Identify a clearance-checked unit ≤700 mm, or obtain an authorized corridor/site re-scope. Re-measure if the site changes. | **High — no current candidate fits** |
| R-05 | No cost data; budget and affordability unknown | Cost | High | High | S2/S3 contain no prices or quantities | Priced RFQ with quantities, freight, BOS, install, commissioning, contingency, O&M. | High until quotes |
| R-06 | Site maximum ambient temperature exceeds a unit's maximum rating | Technical | Medium | Medium | No site maximum in S1 | Obtain site design maximum; compare with 35/40/45 °C limits. | Medium until data |
| R-07 | Declared lead times slip | Schedule | Medium | Medium | S2 lead times are declarations | Contractual delivery terms, buffer, expediting; do not promise a handover date. | Medium |
| R-08 | Warranty scope does not cover coastal corrosion or the installed environment | Commercial / lifecycle | Medium | High | S3 gives duration only | Review full warranty terms and coastal certification scope, not just years. | Medium until review |
| R-09 | Unit count / load is unknown, leading to wrong sizing | Technical / cost | High | High | No load data in sources | Site load study and sizing calculation before RFQ. | High until study |
| R-10 | Decisions rest on vendor declarations rather than verified evidence | Governance | High | Medium | Most sources are declarations; S5 is a measured update | Independent verification of certificates, datasheets, and test evidence; label claims as declared and measurements as sourced. | Medium |

### 7.2 Principal uncertainties (known unknowns)

1. **Site B coastal certificate:** does a current 2026 certificate exist for any candidate, and does its scope cover Site B?
2. **Site B fitment path:** does a unit of 700 mm or less exist, and is an authorized corridor/site re-scope technically and financially feasible? The 700 mm width itself is now measured, not uncertain.
3. **Site maximum ambient temperature:** are the units' upper limits adequate at either site?
4. **Site load and unit quantity:** what installed capacity is actually required?
5. **Prices and total cost:** what are the unit, freight, BOS, installation and O&M costs?
6. **Installation and commissioning duration:** how long after delivery until handover?
7. **Warranty terms:** what is excluded, and what remedy is provided, beyond the stated duration?
8. **Lead-time reliability:** are the declared 8/10/12 weeks achievable and contractually backed?

### 7.3 Risk posture

- **Site A** carries ordinary technical and commercial risk: two compliant units, a clear cold-end margin, and a width limit that all candidates satisfy. The dominant open risks are cost (no data) and schedule reliability (declared lead times only).
- **Site B** carries a **realized physical blocker plus a binding compliance blocker**. The measured 700 mm corridor excludes every unit, and no current coastal certificate is on file. Either one is sufficient to prevent award. Proceeding would require both a narrower unit and verified coastal evidence, not one or the other.

---

## 8. Integrated decision

### 8.1 Decision by site

| Site | Decision | Deciding constraint (R1) | Basis | Conditions before any commitment | Authority |
|---|---|---|---|---|---|
| **Site A** | **CONDITIONAL PROCEED — to priced procurement only** | **Minimum operating temperature (−12 °C)** excludes Halcyon-850 | Kestrel-900 and Solaris-800 pass the cold-end and width screens; Halcyon fails cold-end by 2 K | Confirm site max ambient and load/quantity; obtain priced quotes including freight, BOS, install, commissioning, O&M; confirm Site A width; operator sets budget and approves award | Operator only; this package grants nothing |
| **Site B** | **NO-GO for the current candidate field — no procurement** | **Measured 700 mm corridor width** excludes every candidate; coastal-rated warranty is a second, independent unmet gate | S5: Kestrel 900, Halcyon 850 and Solaris 800 all exceed 700 mm; no current coastal certificate on file; Halcyon's is only "expected" | A clearance-checked unit ≤700 mm with a current 2026 coastal certificate, or an authorized corridor/site re-scope; then full technical, commercial and authority review | Operator only; reopen only on new evidence or an authorized re-scope |

### 8.2 Portfolio decision

1. **Advance Site A separately.** Site A's technical screen is complete enough to justify a priced RFQ. Kestrel-900 is the schedule-and-cold-margin option; Solaris-800 is the longer-warranty option. Final selection is deferred until price, warranty terms and delivery commitments are known. **No purchase order is authorized.**
2. **Stop Site B for the current field.** Do not bundle Site B's approval with Site A. The measured 700 mm corridor excludes all three units, and the binding coastal requirement is also unmet. There is no compliant offer to evaluate. Bundling would either delay Site A for no technical reason or import an unverified certificate claim into an award. The realistic Site B paths are: find a clearance-checked ≤700 mm coastal-certified unit, obtain authority for a corridor/site re-scope, or defer/abandon the site.
3. **Do not approve a budget from this package.** The cost model is structurally complete but numerically empty. An expenditure approval now would be unsupported. The operator should authorize the RFQ and the Site B options work first, then set the budget against priced offers.
4. **Do not promote any claim.** Halcyon's expected certificate and all lead times remain declared or assumed until independently verified. The 1200 mm corridor assumption is **superseded** by the measured 700 mm value and must not reappear in later analysis. No statement in this package converts a claim into an accepted fact.

### 8.3 What the reviewer is asked to decide

- **A1:** Authorize a priced RFQ for Site A for Kestrel-900 and Solaris-800, with quantities and full cost elements. *(Recommendation: yes.)*
- **A2:** Authorize Site B options work: search for a clearance-checked ≤700 mm coastal-certified unit and assess an authorized corridor/site re-scope; continue the coastal-certificate evidence request. *(Recommendation: yes, as evidence-gathering only — not procurement.)*
- **A3:** Set or defer the budget envelope. *(Recommendation: defer until priced offers; if a cap is required now, state it explicitly as an operator constraint.)*
- **A4:** Confirm the Site A and Site B maximum ambient temperatures and site loads, or commission the surveys needed to obtain them.

**No expenditure is approved by this package, and no vendor is awarded.** Items A1–A4 are requests for operator authority, not approvals.

---

## 9. Evidence required before final commitment

| # | Item | Site | Owner | Status |
|---|---|---|---|---|
| 1 | Current 2026 coastal certificate on file, specific model, scope covering Site B, validity checked | B | Operator / vendor | **Open** |
| 2 | Measured corridor width (not the 1200 mm assumption) | B | Site survey | **Closed — 700 mm (2026-11-03)** |
| 3 | Clearance-checked candidate unit ≤700 mm, or an authorized corridor/site re-scope | B | Engineering / operator | **Open — no current candidate qualifies** |
| 4 | Site maximum ambient temperature | A and B | Site survey / operator | **Open** |
| 5 | Site load study and unit quantity / redundancy | A and B | Engineering | **Open** |
| 6 | Priced quotes: unit, freight, BOS, installation, commissioning, contingency | A (and B when qualified) | Procurement | **Open** |
| 7 | O&M and lifecycle cost inputs, discount rate | A and B | Operator / finance | **Open** |
| 8 | Full warranty terms, exclusions, remedies, coastal scope | A and B | Commercial review | **Open** |
| 9 | Contractual delivery commitments and lead-time confirmation | A and B | Procurement | **Open** |
| 10 | Operator budget authorization and award authority | A and B | Operator | **Open** |

---

## 10. Revision and inbox check record

| Version | Date | Change | Inbox check |
|---|---|---|---|
| v0.1 | 2026-11-04 | Initial review package prepared from `sources/`; Site B width treated as an open 1200 mm assumption | `inbox/` contained only `README.md` at first check |
| v0.2 | 2026-11-04 | Incorporated the measured Site B corridor (700 mm); superseded the 1200 mm assumption; changed Site B from "hold" to **no-go for the current candidate field**; re-tested the integrated decision | **New item found on re-check:** `inbox/2026-11-03/corridor-measurement.md` (survey 2026-11-03, measured 700 mm) |

**Re-check instruction:** before this package is finalized or acted on, re-read `inbox/`. A new measured item is evidence only to the extent its own text states. A claim about a future certificate is not a certificate, and a measured value supersedes — but does not retroactively validate — the assumption it replaces. The affected sections must be updated and the decision re-tested.

---

## Appendix A — Calculation notes

**Temperature margin** (`unit min − site design min`; positive is colder-capable):

| Unit | Site A (−12 °C) | Site B (−4 °C) |
|---|---:|---:|
| Kestrel-900 | −20 − (−12) = **+8 K** | −20 − (−4) = **+16 K** |
| Solaris-800 | −15 − (−12) = **+3 K** | −15 − (−4) = **+11 K** |
| Halcyon-850 | −10 − (−12) = **−2 K (fail)** | −10 − (−4) = **+6 K** |

**Width headroom against the applicable limit** (`limit − unit width`; negative means the unit does not fit):

| Unit | Width | Headroom vs Site A 1200 mm limit | Headroom vs Site B **measured** 700 mm corridor |
|---|---:|---:|---:|
| Kestrel-900 | 900 mm | 300 mm | **−200 mm (does not fit)** |
| Solaris-800 | 800 mm | 400 mm | **−100 mm (does not fit)** |
| Halcyon-850 | 850 mm | 350 mm | **−150 mm (does not fit)** |

**Lead-time delta vs fastest** (Kestrel 8 weeks): Solaris **+2 weeks**; Halcyon **+4 weeks**.

**Coastal compliance test:** a candidate passes only if a current certificate/document is on file, covers the specific model and the Site B coastal environment, and is valid for the relevant period. Warranty years alone do not pass this test. No candidate passes on the supplied record.

---

## Appendix B — Requirement traceability

| Requirement | Where satisfied | Evidence |
|---|---|---|
| **R1** — name the deciding constraint for each site | §2 table; §2.1 (Site A: minimum operating temperature); §2.2 (Site B: measured 700 mm width, with coastal certification as a second gate); §8.1 | Site A: Halcyon −10 °C vs −12 °C requirement; Site B: all units 800–900 mm vs measured 700 mm; no current certificate on file |
| **R2** — 2024 column is not a current 2026 certificate; expected is not current | §0; §2.2; §4.1; §7.1 (R-02, R-03); §8.2(4); §10 | Halcyon "expected" certificate treated as unverified; no 2024 material treated as current |
| **No unverified claim treated as accepted** | §0 labels; §1; §4; §7; §8.2(4) | All declarations labelled; the measured corridor is sourced to S5; assumptions and open items listed |
| **No expenditure approved without authority** | §5.1; §5.4; §8.1; §8.2(3); §8.3 | Explicit "no expenditure approved"; operator-only authority |

---

*End of package. This document is decision support, not an authorization.*
