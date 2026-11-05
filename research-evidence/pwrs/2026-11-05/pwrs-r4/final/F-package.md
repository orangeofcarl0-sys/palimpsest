# Multi-site Energy Deployment — Single Review Package

| Document control | |
|---|---|
| Package ID | F-MED-2026-11-05 |
| Version | 1.0 |
| Status | **For decision — not an authority to spend** |
| Prepared | 2026-11-05 (local) |
| Evidence cut-off | 2026-11-05 11:08 local; final inbox re-check recorded in Appendix A |
| Source baseline | Git commit `272a4c7` (`scenario base`) |
| Sites in scope | Site A and Site B |
| Decision owner | Community deployment principal / authorised budget holder (role not named in the repository) |

> **Decision boundary.** This package recommends a course of action. It does **not** approve a budget, a purchase order, a notice to proceed, a contract, or a waiver. No budget authority is documented in the repository. Any expenditure requires a separate authorisation by the properly delegated budget holder.

---

## 1. Executive summary

### 1.1 Bottom line

1. **Site A is technically viable for two of the three units.** Kestrel-900 and Solaris-800 meet the −12 °C design minimum and the 1200 mm width limit. Halcyon-850 does **not** meet the Site A temperature requirement: its minimum is −10 °C, which is 2 K warmer than the −12 °C design minimum.
2. **Site B is not viable with any currently listed unit.** A measured survey dated 2026-11-03 records a **700 mm** corridor width and expressly supersedes the earlier 1200 mm value, which was an assumption. All three units are 800–900 mm wide, so all three are too wide. This is a physical infeasibility, independent of certification.
3. **Site B also has no evidenced coastal compliance.** None of the three vendors has a current 2026 coastal certificate on file. Halcyon's statement that a 2026 certificate is "expected" is an unverified claim, not a certificate. Kestrel and Solaris have no coastal certification in the declared sources.
4. **No cost or budget figures can be calculated from this repository.** There are no unit prices, quantities, freight rates, installation rates, currency, tax basis, discount rate, O&M costs, or approved budget. Any total would be fabricated. Section 5 supplies the cost model structure and the data required to complete it.
5. **The only known durations are vendor lead times.** They are 8 weeks (Kestrel), 10 weeks (Solaris), and 12 weeks (Halcyon), vendor-declared; their start and end points are not stated. Site works, permitting, interconnection, transport, installation, and commissioning durations are absent, so no project completion date can be committed.
6. **Recommendation: split the decision.** Proceed with Site A only to detailed design, survey, and a firm quotation, with Kestrel preferred and Solaris as a qualified alternate. **Do not order.** Hold Site B and re-scope it: find a unit no wider than the measured corridor with a current coastal certificate, or evaluate civil widening/relocation, or record a no-build decision. No Site B award is possible on the present evidence.

### 1.2 Decision at a glance

| Site | Technical envelope | Vendor / coastal compliance | Cost | Schedule | Recommended decision |
|---|---|---|---|---|---|
| **A** | 2 of 3 eligible (Kestrel, Solaris); Halcyon fails cold limit | No coastal requirement; warranty terms incomplete | Unknown — no cost data | Vendor lead 8–10 weeks; start/end basis not stated; full schedule unknown | **Proceed to design, survey, and RFQ, subject to written budget authority. No order.** |
| **B** | **0 of 3 eligible** — measured 700 mm corridor excludes 800–900 mm units | **0 of 3 evidenced** — no current coastal certificate on file | Unknown — and scope must change | Cannot be scheduled until a compliant unit or re-scope exists | **Hold and re-scope. No award.** |

### 1.3 What changed since the baseline

The baseline `sources/sites.md` treated the Site B 1200 mm corridor value as an assumption. A measured inbox update dated 2026-11-03 records **700 mm** and states that the 1200 mm value is superseded. The measurement is later and is explicitly a measurement; it controls. The consequence is decisive: the Site B option set collapses before certification or price is considered.

---

## 2. Scope, sources, and evidence rules

### 2.1 Scope

This package covers:

- technical suitability of the three listed units at Site A and Site B;
- vendor warranty and coastal-certification compliance;
- a cost/budget model and its missing inputs;
- an implementation schedule from the evidence available;
- risk and uncertainty review;
- an integrated, authority-aware decision.

It does **not** cover detailed electrical design, structural design, grid studies, environmental permitting, land tenure, or contract drafting. Those are downstream work and are not assumed to be complete.

### 2.2 Source register

| ID | Source | What it establishes | Evidential status |
|---|---|---|---|
| S1 | `TASK.md` | Required package sections; evidence and authority constraints; re-check inbox | Instruction |
| S2 | `sources/sites.md` | Site A: design minimum −12 °C, max unit width 1200 mm, no coastal requirement. Site B: design minimum −4 °C, coastal-rated warranty binding; 1200 mm corridor is an **assumption** | Source-stated requirements; one explicit assumption |
| S3 | `sources/capacity.csv` | Unit min/max temperature, unit width, vendor lead weeks | Vendor-declared data, not independently tested |
| S4 | `sources/vendors.md` | Warranty lengths; coastal certification position for each vendor | Source-stated; Halcyon certificate is an unverified claim |
| S5 | `inbox/2026-11-03/corridor-measurement.md` | Site B measured corridor width 700 mm (survey 2026-11-03); supersedes 1200 mm assumption; 900 mm unit not admissible | **Measured** |
| S6 | `inbox/README.md` | Inbox items are evidence only to the extent their own text states; a future-certificate claim is not a certificate | Instruction |
| — | `.palimpsest/worlds/retained-baseline/` | Marked inactive world for read-fence sibling coverage | **Not used** — outside the source set |

### 2.3 Evidence grades and acceptance rule

| Grade | Meaning | Counts as compliance? |
|---|---|---|
| **M — Measured** | Dated survey/measurement with a stated value and date | Yes, for the measured parameter only |
| **S — Source-stated** | Declared in a source file; not independently tested or certified | Yes for the declared parameter, subject to verification |
| **A — Assumption** | Explicitly identified as an assumption | **No** |
| **U — Unverified claim** | Assertion about a document, test, or future event not on file | **No** |
| **G — Gap** | No data in the repository | **No** |

**Acceptance rule:** a requirement is met only when M or S evidence directly addresses it. An assumption, an expected certificate, a 2024 document presented as current, or a vendor assurance cannot satisfy a 2026 requirement. Where a measured value conflicts with an assumption, the measured value controls.

### 2.4 Standing evidence rules from the sources

- A **2024 coastal column is not a current 2026 certificate**. It may be retained as historical supporting evidence, but it cannot establish current coastal compliance for a 2026 deployment.
- An **expected certificate is not a certificate on file**. A letter of intent or a statement that certification is "expected" is not compliance evidence; at most it is a contractual condition precedent.
- A **warranty length is not a coastal rating**. A 10-year warranty does not substitute for a coastal-rated warranty where that is binding.
- A **vendor lead time is not a committed delivery date**. It is a planning value until fixed in a contract with a stated order date and delivery basis.

---

## 3. Technical capacity assessment

### 3.1 Site requirements

| Requirement | Site A | Site B | Evidence |
|---|---|---|---|
| Design minimum ambient temperature | −12 °C | −4 °C | S2 |
| Maximum admissible unit width | 1200 mm | 1200 mm was an **assumption**; measured corridor is **700 mm** | S2, S5 |
| Coastal-rated warranty | Not required | **Binding** | S2 |
| Maximum ambient temperature | Not stated | Not stated | G |
| Required unit quantity / rated capacity | Not stated | Not stated | G |
| Load profile / energy target | Not stated | Not stated | G |
| Electrical, structural, and access constraints | Not stated | Not stated | G |

The last four rows are material. "Capacity assessment" here can establish only whether a single unit's declared operating envelope fits the stated site conditions. It cannot establish how many units are needed or whether the site can host them.

### 3.2 Unit envelope (source-declared)

| Unit | Min °C | Max °C | Unit width (mm) | Lead weeks |
|---|---:|---:|---:|---:|
| Kestrel-900 | −20 | 45 | 900 | 8 |
| Solaris-800 | −15 | 40 | 800 | 10 |
| Halcyon-850 | −10 | 35 | 850 | 12 |

### 3.3 Compliance matrix

Legend: **Pass** = declared envelope meets the stated requirement; **Fail** = declared envelope does not meet it; **Unverified** = cannot be established from evidence; **n/a** = requirement not applicable.

| Unit | Site A cold limit (−12 °C) | Site B cold limit (−4 °C) | Site A width (≤1200 mm) | Site B width (≤700 mm measured) | Site B coastal warranty | Site A verdict | Site B verdict |
|---|---|---|---|---|---|---:|---|
| Kestrel-900 | **Pass** — −20 °C, 8 K margin | **Pass** — −20 °C, 16 K margin | **Pass** — 900 mm, 300 mm under limit | **Fail** — 900 mm, 200 mm too wide | No certificate on file | **Eligible** | **Not viable** |
| Solaris-800 | **Pass** — −15 °C, 3 K margin | **Pass** — −15 °C, 11 K margin | **Pass** — 800 mm, 400 mm under limit | **Fail** — 800 mm, 100 mm too wide | No certificate on file | **Eligible** | **Not viable** |
| Halcyon-850 | **Fail** — −10 °C, 2 K short | **Pass** — −10 °C, 6 K margin | **Pass** — 850 mm, 350 mm under limit | **Fail** — 850 mm, 150 mm too wide | Expected only; **unverified** | **Not eligible** | **Not viable** |

**Temperature calculation.** A unit meets a design minimum if its declared minimum is less than or equal to the site design minimum. Kestrel (−20 ≤ −12; −20 ≤ −4) and Solaris (−15 ≤ −12; −15 ≤ −4) pass both sites on temperature. Halcyon (−10) passes Site B (−10 ≤ −4) but fails Site A because −10 °C is warmer than −12 °C by 2 K. Maximum ambient cannot be assessed for either site because no site maximum was supplied; the unit maxima of 45/40/35 °C are not evidence that they exceed an unknown site maximum.

**Width calculation.** A unit meets the width limit if its width is less than or equal to the admissible clear width. At Site A the limit is 1200 mm, so all three pass. At Site B the controlling measured corridor width is 700 mm: Kestrel is 200 mm too wide, Halcyon 150 mm too wide, Solaris 100 mm too wide. The inbox expressly states the 900 mm unit is not admissible; the same width comparison excludes the 850 mm and 800 mm units. Because installation normally requires clearance beyond the unit's external width, a 700 mm corridor is, if anything, more restrictive than the bare comparison suggests. No listed unit can be installed in that corridor without changing the corridor or the unit.

### 3.4 Site A findings

- **Eligible:** Kestrel-900 (8 K cold margin, 300 mm width margin, 8-week lead) and Solaris-800 (3 K cold margin, 400 mm width margin, 10-week lead).
- **Not eligible:** Halcyon-850. Its −10 °C minimum does not meet the −12 °C design minimum. Its longer warranty and coastal claim do not cure a temperature failure.
- **Trade-off:** Kestrel has the larger thermal margin and shorter lead time; Solaris has the longer warranty (7 vs 5 years) but a narrower 3 K thermal margin and a 2-week longer lead. Both are technically compliant. The choice should be made on firm price, warranty terms, and verified performance, not on the unverified coastal claim of an ineligible unit.
- **Unresolved:** number of units, rated output, site maximum ambient, electrical interface, structural loading, access route, and available footprint. These prevent a complete technical design.

### 3.5 Site B findings

Site B fails on two independent grounds:

1. **Physical width.** Measured clear corridor width is 700 mm. Every listed unit is wider (800, 850, 900 mm). The 1200 mm baseline value was never a measurement and has been superseded. No listed unit is admissible.
2. **Coastal compliance.** A coastal-rated warranty is binding. No vendor has a current 2026 coastal certificate on file. Halcyon's "expected" certificate is unverified; Kestrel and Solaris have none in the declared sources. Even if a unit fitted, no unit is currently evidenced as compliant.

Because the width failure is physical and applies to every listed model, certification work on these models would not rescue Site B. The site needs a different unit, a different corridor, or a different site.

### 3.6 Capacity and sizing gap

The repository contains no unit rated power/energy, no community demand profile, no peak load, no annual energy target, no resilience requirement, and no site footprint. Consequently:

- the number of units per site cannot be calculated;
- the installed capacity (kW/MW) cannot be stated;
- the energy yield and resilience benefit cannot be estimated;
- the cost per unit of capacity cannot be derived;
- "capacity" in this package is limited to the environmental and width envelope of one unit.

These are not optional refinements. They are prerequisites for a deployment-sized design and for any credible budget.

### 3.7 Technical actions before a firm design

1. Obtain the full Site B survey report: method, datum, measurement tolerance, obstructions, and clear width along the entire installation route (not just one cross-section). The 700 mm value is accepted, but its tolerance and route extent are not documented.
2. Confirm Site A corridor measurement against the 1200 mm design limit; the source gives a limit, not a survey.
3. Obtain site maximum ambient temperatures for both sites.
4. Obtain the load/demand study and the selected unit's rated output to size the quantity.
5. Confirm structural, electrical, access, and drainage requirements.
6. For Site B, identify whether a unit of at most 700 mm width (preferably less, allowing clearance) exists with a current coastal certificate; otherwise evaluate corridor widening or relocation.
7. Require datasheets and test evidence for the declared temperature and width values; the CSV is a vendor declaration, not a test report.

---

## 4. Vendor compliance assessment

### 4.1 Warranty and coastal position

| Vendor / unit | Warranty length | Coastal certification evidence | Current 2026 certificate on file? | Site A compliance | Site B compliance |
|---|---|---|---|---|---|
| Kestrel-900 | 5 years | None in declared sources | **No** | Technically eligible; warranty terms incomplete | Not viable (width); no coastal certificate |
| Solaris-800 | 7 years | None in declared sources | **No** | Technically eligible; warranty terms incomplete | Not viable (width); no coastal certificate |
| Halcyon-850 | 10 years | Says a 2026 coastal certificate is "expected"; no certificate on file | **No** | Not eligible (cold limit) | Not viable (width); coastal claim unverified |

### 4.2 What would count as coastal compliance

For Site B, a vendor must provide, for the **exact model and revision offered**:

1. a current coastal/salt-spray certificate or listing, **valid for 2026** installation and not superseded;
2. the certificate number and issuing body, verifiable independently;
3. the test standard and coastal/salt-fog class or severity;
4. the certificate's validity dates and the scope of models covered;
5. a warranty document that expressly provides **coastal-rated** coverage at the site, including duration, exclusions, parts/labour, response times, and transferability;
6. confirmation that the certificate and warranty apply to the unit as installed (including any factory coastal option).

A 2024 coastal column may be retained as historical context but does not satisfy item 1. A statement that a 2026 certificate is "expected" does not satisfy any item. A vendor's promise to obtain certification can be drafted as a condition precedent in a contract, but it is not compliance evidence at the date of this package.

### 4.3 Vendor findings

- **Kestrel.** No technical compliance issue at Site A; 5-year warranty is the shortest of the three. No coastal certification in the declared sources. For Site A, its 8 K thermal margin and 8-week lead make it the technical front-runner, subject to price and warranty review. For Site B it is excluded by width.
- **Solaris.** Site A technically eligible with a 3 K thermal margin and the second-longest warranty (7 years). No coastal certification. For Site B it is excluded by width. It is a credible alternate for Site A if its price and warranty terms are stronger than Kestrel's.
- **Halcyon.** Longest warranty (10 years) and the only vendor with a stated coastal-certification path, but that path is an unverified expectation and no certificate is on file. It fails the Site A cold limit by 2 K. It is also too wide for Site B. It is not eligible for either site on the present evidence. Its 10-year warranty does not offset either failure.

### 4.4 Warranty comparison is incomplete

The repository gives warranty **lengths only**. It does not give exclusions, labour coverage, response times, replacement versus repair, degradation guarantees, consequential-loss treatment, transferability on sale, or coastal-specific terms. A 5-year warranty with strong coverage could be worth more than a 10-year warranty with exclusions. Legal and commercial review is required before ranking vendors on warranty.

---

## 5. Cost and budget model

### 5.1 Status: no usable cost data

The repository contains **no** unit prices, currency, freight rates, installation labour rates, civil costs, electrical balance-of-system costs, interconnection charges, permitting fees, tax treatment, escalation, discount rate, O&M costs, or approved budget. It also contains no quantity, because the load and unit rating are absent.

Therefore:

- no CAPEX total can be calculated;
- no OPEX or lifecycle cost can be calculated;
- no cost per kW, per kWh, or per household can be calculated;
- no budget compliance can be assessed;
- **no expenditure is approved by this package.**

Any specific number in a review package at this stage would be an invention, not an estimate.

### 5.2 Parametric cost model (to be populated)

For site \(s\) and unit option \(v\), with \(N\) units:

\[
\text{CAPEX}_{s,v} = N \times (P_{v} + F_{v} + I_{v} + B_{v}) + C_{s} + O_{s} + K_{s}
\]

\[
\text{LCC}_{s,v} = \text{CAPEX}_{s,v} + \sum_{t=1}^{T} \frac{\text{OPEX}_{t}}{(1+r)^{t}} + D_{s} - R_{s}
\]

Where:

| Symbol | Cost element | Data status |
|---|---|---|
| \(N\) | Number of units (from load and unit rating) | **Gap** |
| \(P_v\) | Unit supply price, including coastal/factory options where required | **Gap** |
| \(F_v\) | Freight, insurance, customs, delivery to site | **Gap** |
| \(I_v\) | Installation labour, plant, mobilisation | **Gap** |
| \(B_v\) | Electrical balance of system, interconnection, protection, metering | **Gap** |
| \(C_s\) | Civil works, foundations, access, security, drainage | **Gap** |
| \(O_s\) | Owner's costs: design, project management, legal, permitting, financing | **Gap** |
| \(K_s\) | Contingency and risk reserve, per finance policy | **Gap** (policy and rate not supplied) |
| \(\text{OPEX}_t\) | O&M, monitoring, insurance, warranty service, replacements | **Gap** |
| \(r\) | Discount rate / cost of capital | **Gap** |
| \(T\) | Evaluation period | **Gap** |
| \(D_s\) | Decommissioning / end-of-life reserve | **Gap** |
| \(R_s\) | Residual value | **Gap** |

### 5.3 Cost build-up template

Every line must be populated from a dated quote, tariff, or policy, with currency and tax basis stated.

| # | Cost line | Driver | Required source | Status |
|---:|---|---|---|---|
| 1 | Unit supply | \(N \times P_v\) | Vendor quotation, 2026 price basis | Open |
| 2 | Coastal/factory options | Per unit, included in \(P_v\) | Vendor quotation, only if certified option exists | Open |
| 3 | Freight and insurance | Route, weight, volume | Freight quote | Open |
| 4 | Duties and taxes | Jurisdiction, classification | Finance/tax ruling | Open |
| 5 | Site survey and design | Scope | Engineering quote | Open |
| 6 | Civil, foundations, access | Site conditions | Contractor quote | Open |
| 7 | Electrical BOS and interconnection | Single-line design, utility requirements | Electrical contractor / utility | Open |
| 8 | Installation and mobilisation | Unit count, site access | Contractor quote | Open |
| 9 | Commissioning and training | Scope | Vendor/commissioning quote | Open |
| 10 | Spares and consumables | O&M policy | Vendor/ops plan | Open |
| 11 | Contingency and risk reserve | Finance policy | Budget holder | Open |
| 12 | Owner's costs | Project duration | Finance/PM estimate | Open |
| 13 | O&M and insurance | Annual, contract term | O&M provider / insurer | Open |
| 14 | Decommissioning reserve | End-of-life policy | Finance policy | Open |

### 5.4 Budget authority

No approved budget, budget ceiling, delegated financial authority, funding source, or approval threshold is documented in the repository. The task instruction is explicit: **do not approve expenditure without authority.** Accordingly:

- this package may recommend **only** design, survey, and quotation work that is itself authorised and funded;
- no purchase order, notice to proceed, contract, or supplier commitment may be issued on the basis of this package;
- the budget holder must confirm in writing the available budget, currency, contingency policy, and delegated approval route before any commitment;
- if the cost of the required Site B re-scope (narrow unit, civil widening, or relocation) exceeds the available authority, the decision returns to the budget holder, not to the project team.

### 5.5 Affordability test (cannot yet be performed)

Once populated, the test should be:

1. compare like-for-like scope, including coastal compliance and Site B re-scope costs;
2. compare lifecycle cost, not just equipment price;
3. include the cost of the measured-width remediation and any certification delay;
4. test sensitivity to unit count, freight, installation, and O&M;
5. confirm the result against the authorised budget and contingency policy.

No conclusion on affordability is possible at this evidence cut-off.

---

## 6. Implementation schedule

### 6.1 Known durations

| Item | Duration | Basis | Status |
|---|---:|---|---|
| Kestrel-900 lead time | 8 weeks | Vendor-declared | Planning value, not a committed delivery |
| Solaris-800 lead time | 10 weeks | Vendor-declared | Planning value, not a committed delivery |
| Halcyon-850 lead time | 12 weeks | Vendor-declared | Planning value, not a committed delivery |
| Design, survey, permitting, interconnection | Not stated | — | **Gap** |
| Transport to site | Not stated | — | **Gap** |
| Installation and commissioning | Not stated | — | **Gap** |
| Site B re-scope / certification | Not stated | — | **Gap** |

The source does not state the start or end point of the lead times. If they run from a firm order, no order date exists, so no calendar date can be derived. The lead times also do not state whether they include factory testing, transport, or site delivery.

### 6.2 Schedule logic and gates

| Gate | Name | Entry condition | Exit condition | Duration |
|---|---|---|---|---|
| G0 | Evidence and authority gate | This package reviewed | Site A design/RFQ authorised and funded; Site B re-scope authorised; no outstanding compliance assumption | Decision |
| G1 | Survey and design | G0 passed | Site survey complete; load/rating confirmed; design freeze | **TBD** |
| G2 | RFQ and evaluation | G1 passed | Like-for-like quotes; warranty/legal review; budget confirmed | **TBD** |
| G3 | Purchase order | G2 passed; budget authority evidenced | PO issued with delivery basis and acceptance terms | **TBD** |
| G4 | Manufacture and delivery | G3 | Equipment delivered; factory acceptance if required | 8 / 10 / 12 weeks vendor lead; transport inclusion **TBD** |
| G5 | Installation | G4; site ready | Installation complete | **TBD** |
| G6 | Commissioning and acceptance | G5 | Tests passed; training complete; warranty starts | **TBD** |

Site B adds a **pre-G0 physical gate**: a unit that fits the measured 700 mm corridor and holds a current coastal certificate. Until that exists, Site B has no orderable scope and cannot be scheduled. A coastal certificate obtained for an 800–900 mm unit would not clear this gate.

### 6.3 Conditional relative windows

These are **not project completion dates**. They show only the procurement floor if every prior gate were somehow complete at week 0.

| Scenario | Order at | Earliest end of vendor lead | Notes |
|---|---|---|---|
| Site A — Kestrel | Week 0 | Week 8 | Not a delivery date; transport inclusion not stated; excludes site works, installation, commissioning |
| Site A — Solaris | Week 0 | Week 10 | Not a delivery date; transport inclusion not stated; excludes site works, installation, commissioning |
| Site B — any listed unit | Not orderable | — | Fails measured width; no coastal certificate |
| Site B — future compliant unit | Unknown | Unknown | Depends on unit availability, certification, and possibly civil works |

### 6.4 Schedule risks

- **Site B re-scope is the critical path.** Finding a ≤700 mm coastal-certified unit, or widening the corridor, is not a procurement delay; it is a scope change with unknown duration and cost.
- **Site A can proceed independently.** Holding Site B should not hold Site A's design and quotation work, provided the budget for that work is authorised.
- **Lead times are single-point vendor statements.** No buffer, expedite option, or liquidated-delivery term is documented. Do not represent them as guaranteed.
- **Permitting and interconnection are unassessed.** They can dominate the schedule and are not included in vendor lead times.
- **No committed completion date is possible.** Any date in a downstream document must carry its assumptions and be re-baselined after G1/G2.

---

## 7. Risk and uncertainty review

### 7.1 Risk register

Ratings are qualitative (H/M/L). "Realised" means the risk has already occurred in the evidence.

| ID | Risk / uncertainty | Category | Likelihood | Impact | Rating | Basis | Mitigation / trigger | Owner |
|---|---|---|---|---|---|---|---|---|
| R1 | Site B corridor is too narrow for every listed unit | Technical | **Realised** | H | **Critical** | Measured 700 mm vs 800–900 mm units (S5) | Re-scope: ≤700 mm certified unit, corridor widening, relocation, or no-build. Trigger: no compliant unit at G0. | Technical lead |
| R2 | No current 2026 coastal certificate for any vendor | Compliance | H | H | **Critical** | S4; no certificate on file | Certificate gate before any Site B order. A 2024 document or "expected" claim does not pass. | Procurement / legal |
| R3 | A 2024 coastal column is mistaken for a current certificate | Compliance | M | H | **High** | S2 evidence rule | Date and validity check; require 2026 certificate for exact model. | Compliance reviewer |
| R4 | Halcyon's "expected" certificate is treated as fact | Compliance | M | H | **High** | S4 | Record as unverified; condition precedent only; no reliance until on file. | Procurement |
| R5 | Halcyon selected for Site A despite −10 °C limit | Technical | Certain if proposed | H | **High** | −10 °C vs −12 °C design minimum | Exclude Halcyon from Site A; check every quote against the cold limit. | Technical lead |
| R6 | No load, demand, or unit rating → wrong quantity/size | Technical | H | H | **High** | G | Commission load study and confirm unit rating before design freeze. | Technical lead |
| R7 | No cost data → budget cannot be set or tested | Commercial | H | H | **High** | G | Obtain dated quotes for all cost lines; no estimate presented as a price. | Finance / procurement |
| R8 | Expenditure without documented authority | Governance | M | H | **High** | No budget authority in repository | Written budget confirmation and delegated approval before any PO/NTP. | Budget holder |
| R9 | Vendor lead times slip or are not contractual | Schedule | M | M | **Medium** | Single-point vendor values | Contract delivery terms, buffer, expedite options; re-baseline at PO. | Procurement |
| R10 | Site B survey tolerance/route extent unresolved | Technical | M | M | **Medium** | S5 gives one width, no tolerance or route | Obtain full survey report; verify entire route and installation clearance. | Surveyor |
| R11 | Coastal warranty exclusions or service limits | Commercial | M | M | **Medium** | S4 gives length only | Legal review of warranty terms and coastal coverage. | Legal |
| R12 | Splitting vendors across sites increases spares/O&M complexity | Commercial | M | L–M | **Medium** | Site A eligible vendors differ from any future Site B unit | Assess commonality only after compliant options exist; do not sacrifice compliance for commonality. | Operations |
| R13 | Late inbox evidence changes the basis | Governance | M | M | **Medium** | S6; one late measurement already arrived | Change-control log; re-check inbox at each gate and before finalising. | Principal |
| R14 | Permitting/interconnection delay | Schedule | M | M | **Medium** | G | Early utility and permitting review; do not treat vendor lead as project duration. | Project manager |
| R15 | Site maximum ambient exceeds unit rating | Technical | Unknown | M | **Medium** | No site maximum; unit maxima 35–45 °C | Obtain site design maximum before selection. | Technical lead |

### 7.2 Blocking uncertainties

| ID | Question | Why it blocks | Resolution needed |
|---|---|---|---|
| U1 | Is 700 mm the clear width along the whole Site B route, with what tolerance? | Determines whether any unit can physically pass | Full survey report, route section, tolerance |
| U2 | Does any vendor hold a current 2026 coastal certificate for a ≤700 mm unit? | Site B compliance | Certificate for exact model, valid 2026 |
| U3 | What load/energy/resilience duty must each site serve? | Unit quantity and capacity | Demand study and design basis |
| U4 | What is the authorised budget and delegated authority? | Any commitment | Written budget confirmation |
| U5 | What are the firm prices, freight, installation, and O&M costs? | Affordability | Dated like-for-like quotes |
| U6 | What is each site's design maximum ambient? | Upper temperature compliance | Site design data |
| U7 | What are realistic design, permitting, installation, and commissioning durations? | Schedule | Project plan and utility/authority inputs |
| U8 | Are warranty terms (not just lengths) acceptable? | Vendor ranking and risk | Full warranty documents and legal review |

### 7.3 Risk treatment rules

- **Do not transfer an unresolved compliance risk into a signed contract** by treating a vendor assurance as evidence. Use a condition precedent and a termination/refund right if the certificate is not delivered.
- **Do not let Site A schedule pressure force a Site B waiver.** The width failure is physical; a waiver cannot make an 800–900 mm unit fit a 700 mm corridor.
- **Do not treat the 1200 mm assumption as still live.** It is superseded by the 2026-11-03 measurement.
- **Record every late inbox item** with its date, what it changes, and whether it supersedes an assumption. The package must be re-issued if a material item arrives.

---

## 8. Integrated decision

### 8.1 Options considered

| Option | Description | Assessment | Decision |
|---|---|---|---|
| O1 | Award both sites now | No compliant Site B unit, no certificate, no cost data, no budget authority | **Rejected** |
| O2 | Proceed with Site A only; hold and re-scope Site B | Site A has two eligible units; Site B needs a different physical solution | **Recommended** |
| O3 | Hold both sites pending full evidence | Defensible but unnecessarily delays Site A design; may forfeit lead-time benefit | Permissible fallback |
| O4 | Use Halcyon at Site A | Fails −12 °C design minimum by 2 K | **Rejected** |
| O5 | Waive Site B width/coastal requirements | Physical width failure cannot be waived; no authority for coastal waiver | **Rejected** |
| O6 | Widen Site B corridor and retain a listed unit | Could resolve width but adds civil cost/time and still needs coastal certificate | **Study only** — no approval |

### 8.2 Recommendation

**Site A — conditional proceed to design, survey, and RFQ; no order.**

- Shortlist **Kestrel-900 as preferred** on thermal margin (8 K) and lead time (8 weeks), with **Solaris-800 as qualified alternate** on warranty (7 years) and 3 K margin.
- Exclude **Halcyon-850** from Site A: −10 °C does not meet the −12 °C design minimum.
- Complete the load/rating study, site survey, and firm quotations before selecting between Kestrel and Solaris.
- Do not issue a purchase order or notice to proceed until budget authority and price are confirmed.

**Site B — hold and re-scope; no award, no order.**

- The measured 700 mm corridor excludes all three listed units. The 1200 mm figure was an assumption and is superseded.
- No vendor has a current 2026 coastal certificate on file; Halcyon's expected certificate is unverified.
- Authorise a focused re-scope: (a) identify a unit of at most 700 mm width, preferably narrower to allow installation clearance, with a current coastal certificate; or (b) evaluate corridor widening or relocation, including cost, consent, and schedule; or (c) record a no-build decision.
- Do not accept a 2024 coastal document as a 2026 certificate. Do not accept a vendor's expectation as compliance.
- If a compliant unit is found, re-run the technical, compliance, cost, and schedule assessment before any award.

**Portfolio — keep the two decisions separate.** Site A's viable path should not be delayed by Site B's re-scope, and Site B's problems should not be concealed by bundling it with Site A.

### 8.3 Conditions precedent to any commitment

| # | Condition | Applies to | Evidence required | Status |
|---:|---|---|---|---|
| C1 | Written budget authority and ceiling | Both sites | Budget holder authorisation | **Open** |
| C2 | Firm like-for-like quotation | Both sites | Dated vendor quote with scope and tax basis | **Open** |
| C3 | Load/rating study and design freeze | Both sites | Signed design basis | **Open** |
| C4 | Site survey, including full route width | Both sites | Survey report with tolerance | Partly open (Site B 700 mm measured; report pending) |
| C5 | Current 2026 coastal certificate for exact model | Site B | Certificate on file, independently verified | **Open — no vendor** |
| C6 | Unit width ≤ measured clear width, with clearance | Site B | Dimensioned drawing vs survey | **Open — all listed units fail** |
| C7 | Warranty/legal review | Both sites | Full warranty documents | **Open** |
| C8 | Signed contract with delivery and acceptance terms | Both sites | Executed contract | **Open** |

### 8.4 Decisions requested from the review authority

| # | Decision requested | Recommended | Authority |
|---:|---|---|---|
| D1 | Note that Site B is not viable with any listed unit and authorise re-scope | Approve | Principal / budget holder |
| D2 | Authorise Site A design, survey, and RFQ only (no PO) | Approve, subject to funded budget | Budget holder |
| D3 | Confirm the authorised budget, currency, and delegated approval route | Provide in writing | Budget holder |
| D4 | Require a current 2026 coastal certificate before any Site B order | Approve as condition precedent | Principal / legal |
| D5 | Adopt change control for late inbox evidence | Approve | Principal |

### 8.5 What this package does not approve

- No purchase order, notice to proceed, or supplier commitment.
- No budget, budget increase, or contingency drawdown.
- No waiver of the Site B coastal requirement.
- No acceptance of the 1200 mm Site B corridor assumption.
- No final selection between Kestrel and Solaris for Site A.
- No civil works, corridor widening, or site relocation.
- No contractual terms or warranty acceptance.

### 8.6 Review and sign-off

| Role | Name | Decision / comment | Date |
|---|---|---|---|
| Prepared by (principal) |  |  |  |
| Technical reviewer |  |  |  |
| Commercial / finance reviewer |  |  |  |
| Legal / compliance reviewer |  |  |  |
| Budget holder (authorised approver) |  |  |  |

### 8.7 Final judgement

**Site A:** conditionally viable for design, survey, and RFQ only, with Kestrel-900 preferred and Solaris-800 as qualified alternate; Halcyon-850 is excluded on the −12 °C cold limit. No order may be placed.

**Site B:** not viable with any listed unit because the measured 700 mm corridor is narrower than every listed unit, and no vendor holds a current 2026 coastal certificate. Site B must be held and re-scoped; no award or order may be made.

**Expenditure:** none is approved by this package. A written budget authority and delegated approval are prerequisites to any commitment.

---

## Appendix A — Source and inbox check log

| Check | Time (local) | Result |
|---|---|---|
| 1 | 2026-11-05 11:02 | Inbox contained `README.md` only. Baseline sources read. |
| 2 | 2026-11-05 11:03 | New directory `inbox/2026-11-03/` appeared with `corridor-measurement.md`. Read: measured 700 mm, survey 2026-11-03; supersedes 1200 mm assumption; 900 mm unit not admissible. |
| 3 | 2026-11-05 11:05 | Re-check before drafting: same two inbox items; no further file. |
| 4 | 2026-11-05 11:08 | Final pre-finalisation re-check: `inbox/README.md` and `inbox/2026-11-03/corridor-measurement.md` only; no later item. Package finalised on this evidence. |

**Inbox evidence incorporated:** `inbox/2026-11-03/corridor-measurement.md`.

**Inbox evidence not incorporated:** none.

**Note on `inbox/README.md`:** it is an instruction file, not measured data. The measurement is the dated file above.

---

## Appendix B — Data request list

| # | Data item | Needed from | Needed for |
|---:|---|---|---|
| 1 | Full Site B corridor survey: method, datum, tolerance, route extent, obstructions | Surveyor | Width compliance; re-scope |
| 2 | Site A corridor survey against the 1200 mm limit | Surveyor | Width verification |
| 3 | Site design maximum ambient, both sites | Site owner / meteorological source | Upper temperature compliance |
| 4 | Load profile, peak demand, annual energy, resilience requirement | Community / utility | Unit quantity and capacity |
| 5 | Unit rated power/energy and performance curves | Vendors | Sizing and yield |
| 6 | Firm unit price, coastal option, freight, and delivery basis | Vendors | CAPEX |
| 7 | Installation, civil, electrical BOS, and interconnection quotes | Contractors / utility | CAPEX |
| 8 | O&M, insurance, and replacement costs | O&M provider / insurer | OPEX and LCC |
| 9 | Discount rate, evaluation period, contingency policy, tax treatment | Finance | LCC and budget |
| 10 | Approved budget, currency, and delegated authority | Budget holder | Authority to commit |
| 11 | Full warranty documents, including coastal terms and exclusions | Vendors / legal | Vendor compliance |
| 12 | Current 2026 coastal certificate for exact model | Vendors | Site B compliance |
| 13 | Permitting and interconnection requirements and durations | Authorities / utility | Schedule |
| 14 | Unit datasheets and independent test evidence for temperature/width | Vendors | Verification of declared data |

---

## Appendix C — Assumptions register

| ID | Assumption | Status | Treatment |
|---|---|---|---|
| A1 | Site B corridor is 1200 mm | **Superseded** by measured 700 mm (S5) | Not used |
| A2 | One unit per site is sufficient | Not stated anywhere | Not used; quantity is a gap |
| A3 | Vendor CSV values are accurate as installed | Unverified | Treated as source-declared, not tested |
| A4 | Lead time starts at order and excludes delivery to site | Not stated | Used only as a relative planning floor; not a delivery commitment |
| A5 | "Warranty length" equals useful warranty coverage | Not stated | Treated as length only; terms are a gap |
| A6 | A 2024 coastal document is acceptable for 2026 | Explicitly rejected by S2 | Not used |
| A7 | Halcyon's expected certificate will be issued | Unverified | Not used; condition precedent only |
| A8 | Site A and Site B can be decided independently | Recommended, not a source fact | Used as a decision-structuring assumption; re-test if shared budget or shared infrastructure emerges |

---

## Appendix D — Revision history

| Version | Date | Change | Author |
|---|---|---|---|
| 1.0 | 2026-11-05 | Initial single review package; incorporates Site B 700 mm measured corridor and supersedes 1200 mm assumption | Principal |

---

*End of package. This document is a decision aid, not an expenditure approval or a contract.*
