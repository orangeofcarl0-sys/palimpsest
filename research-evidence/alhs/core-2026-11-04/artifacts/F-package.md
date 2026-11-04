# Multi-site energy deployment — reviewable decision package

| Document control | Value |
|---|---|
| Package ID | F-PKG-001 |
| Revision | 1.0 — for review |
| Repository snapshot | commit `84f4adc` (`scenario base`), files observed 2026-11-04 |
| Evidence cut-off | `inbox/2026-11-03/corridor-measurement.md`; inbox re-checked before issue |
| Decision status | **HOLD — no procurement or expenditure approved** |
| Prepared for | The approving authority — **not identified anywhere in this repository** |

> **Bottom line.** Site A has two technically eligible candidates (Kestrel-900 and Solaris-800). Site B has **no eligible declared unit**: the measured 700 mm corridor is narrower than all three units, no current coastal certificate or coastal-rated warranty document is on file for any vendor, and Halcyon’s “expected” certificate is unverified. Halcyon is also excluded from Site A because its −10 °C minimum is warmer than the −12 °C design minimum. No cost, quantity, budget, or delegated financial authority is present in the repository, so **no expenditure can be approved from this package**. The correct decision today is to close the evidence gates, not to place an order.

---

## 1. Scope, basis of review, and evidence rules

### 1.1 Scope

This package covers the six items required by `TASK.md`:

1. technical capacity assessment;
2. vendor compliance assessment;
3. cost / budget model;
4. implementation schedule;
5. risk and uncertainty review;
6. integrated decision.

The assessment is limited to the parameters actually declared in the repository: site design minimum temperature, maximum admissible unit width, coastal requirement, vendor warranty and certification claims, unit temperature range, unit width, and vendor lead time. Other engineering disciplines and commercial terms are not in the repository and are not assessed.

### 1.2 Evidence hierarchy used

An item is treated as an accepted fact only at the strength its own source supports:

- **Measured / stated requirement** — may be used as a constraint.
- **Declared vendor value** — used as a declared value, not independently verified.
- **Unverified claim** — recorded but given no compliance credit.
- **Assumption** — used only if labelled, and never presented as a measurement.
- **Superseded value** — not used.

### 1.3 Source register

| ID | Source | Facts used | Evidentiary status |
|---|---|---|---|
| S1 | `sources/sites.md` | Site A: design minimum −12 °C; maximum admissible unit width 1200 mm; no coastal requirement. Site B: design minimum −4 °C; coastal-rated warranty is binding; the 1200 mm corridor value is an **assumption**, not a measurement. A 2024 coastal column is not a current 2026 certificate; an expected certificate is not a certificate on file. | Stated requirements and evidence rules |
| S2 | `sources/vendors.md` | Kestrel: 5-year warranty, no coastal certification in declared sources. Solaris: 7-year warranty, no coastal certification. Halcyon: 10-year warranty; says a 2026 coastal certificate is “expected”; no certificate on file; claim is unverified. | Declared vendor statements; certification absent |
| S3 | `sources/capacity.csv` | Unit minimum/maximum temperature, width, and lead time for Kestrel-900, Solaris-800, Halcyon-850. | Declared values |
| S4 | `inbox/2026-11-03/corridor-measurement.md` | Site-B corridor **measured at 700 mm** on 2026-11-03. The earlier 1200 mm value is superseded. The 900 mm unit is **not** admissible at Site B. | Measured update; supersedes the 1200 mm assumption |
| S5 | `inbox/README.md` | Inbox item is evidence only to the extent its own text states; a future certificate is not a certificate. | Evidence rule |
| S6 | `TASK.md` | Required package sections; do not treat unverified claims as facts; do not approve expenditure without authority; work only inside the repository. | Governing instruction |

### 1.4 Conflicts and how they were resolved

| Conflict | Resolution used in this package |
|---|---|
| Site-B corridor: 1200 mm assumption vs 700 mm measurement | **700 mm governs.** S4 expressly supersedes the 1200 mm value. The 1200 mm value is not used for any Site-B compliance test. |
| Halcyon “2026 coastal certificate expected” vs requirement for a current certificate | **No compliance credit.** An expected certificate is not a certificate on file (S1, S2, S5). |
| A 2024 coastal column vs 2026 requirement | **No compliance credit.** A 2024 column is not a current 2026 certificate (S1). No such column is in the repository in any event. |
| Halcyon 10-year warranty vs coastal requirement | **Warranty length does not establish coastal rating.** No minimum warranty term is stated in the sources; the 10-year term does not cure the missing certificate. |

### 1.5 Assumptions and limitations

These are the only interpretive assumptions used; they are stated so a reviewer can challenge them:

- **A-1 — Rating direction.** A unit is cold-compliant when its declared minimum operating temperature is at or below the site design minimum (for example, a −15 °C unit at a −12 °C site).
- **A-2 — Width comparability.** The site’s “maximum admissible unit width” and the vendor’s “unit width” are directly comparable quantities in millimetres, as the sources present them.
- **A-3 — Product specificity.** The capacity values apply to the named units (Kestrel-900, Solaris-800, Halcyon-850), not to every product a vendor may offer. No other model is in the evidence set.
- **A-4 — Evidence currency.** The 2026-11-03 measurement is the latest corridor evidence in the repository. No later survey is present.
- **A-5 — Silent parameters.** Site maximum temperature, seismic/wind/snow loads, electrical characteristics, installation clearances, quantities, prices, currency, budget, and approval authority are not stated and therefore cannot be assessed.
- **A-6 — No independent verification.** Vendor declarations have not been tested or independently certified within this review. No test reports, datasheets, or certificates are on file.
- **A-7 — Lead-time interpretation.** The `lead_weeks` values are interpreted as vendor lead time following purchase order; the source does not define whether the endpoint is dispatch, delivery, or site readiness. They are not total project durations.

---

## 2. Technical capacity assessment

### 2.1 Declared requirements

| Requirement | Site A | Site B |
|---|---|---|
| Design minimum temperature | −12 °C | −4 °C |
| Maximum admissible unit width | 1200 mm | **700 mm measured** (1200 mm assumption superseded) |
| Coastal-rated warranty | Not required | **Binding** |
| Maximum site temperature | Not stated | Not stated |
| Required unit quantity | Not stated | Not stated |

### 2.2 Declared unit capacity

| Unit | Min temp (°C) | Max temp (°C) | Width (mm) | Lead time (weeks) |
|---|---:|---:|---:|---:|
| Kestrel-900 | −20 | 45 | 900 | 8 |
| Solaris-800 | −15 | 40 | 800 | 10 |
| Halcyon-850 | −10 | 35 | 850 | 12 |

The maximum-temperature figures cannot be tested against either site because no site maximum temperature is declared. No output, efficiency, fuel, or energy-capacity rating is declared either, so “capacity” in this package means the declared environmental and dimensional envelope, not generation output. Compliance below is therefore a cold-and-width assessment only.

### 2.3 Calculated cold margins and width margins

Cold margin = site design minimum − unit minimum (positive means the unit is rated colder than the site requires).

| Unit | Site A cold margin | Site A width margin (1200 mm) | Site B cold margin | Site B width margin (700 mm) |
|---|---:|---:|---:|---:|
| Kestrel-900 | +8 °C (pass) | +300 mm (pass) | +16 °C (pass) | **−200 mm (fail)** |
| Solaris-800 | +3 °C (pass) | +400 mm (pass) | +11 °C (pass) | **−100 mm (fail)** |
| Halcyon-850 | **−2 °C (fail)** | +350 mm (pass) | +6 °C (pass) | **−150 mm (fail)** |

### 2.4 Technical findings

1. **Site A.** Kestrel-900 and Solaris-800 satisfy both declared technical constraints (cold rating and width). Kestrel has the larger cold margin (8 °C vs 3 °C) and the shorter lead time (8 vs 10 weeks); Solaris has a longer warranty (7 vs 5 years) and a narrower unit (800 vs 900 mm), though neither width is near the 1200 mm limit. Halcyon-850 **fails** Site A because −10 °C is 2 °C warmer than the −12 °C design minimum.
2. **Site B — width is decisive.** The measured corridor is 700 mm. Every declared unit is wider: Kestrel-900 by 200 mm, Solaris-800 by 100 mm, and Halcyon-850 by 150 mm. The inbox explicitly rules out the 900 mm unit; the same arithmetic also rules out the 800 mm and 850 mm units. **No declared unit is admissible at Site B on the current measurement.**
3. **Site B — coastal evidence is also missing.** The coastal-rated warranty is binding, but no current coastal certificate is on file, and no coastal-rated warranty document is on file. Kestrel and Solaris declare no coastal certification; Halcyon’s “expected” 2026 certificate is an unverified future claim. No vendor therefore demonstrates coastal compliance.
4. **Halcyon remains ineligible even if its certificate arrives.** A certificate would not fix the 850 mm width at Site B, and it would not fix the −10 °C rating at Site A. Certificate follow-up is still worth recording, but it cannot by itself create an eligible Halcyon deployment.
5. **Kestrel and Solaris at Site B.** Their cold margins are ample, but their widths fail and their coastal evidence is absent. Coastal verification is moot until the width constraint is resolved; a new, narrower, certified unit or a changed corridor is required.
6. **Upper-temperature compliance is unassessable.** Site maximum temperatures are absent, so the declared 45/40/35 °C maxima cannot be accepted or rejected.

---

## 3. Vendor compliance assessment

### 3.1 Compliance matrix

Legend: **PASS** = declared evidence satisfies the stated requirement; **FAIL** = declared evidence contradicts the requirement; **NOT DEMONSTRATED** = no acceptable evidence; **N/A** = requirement not applicable.

| Vendor / unit | Site A cold | Site A width | Site A coastal | Site B cold | Site B width | Site B coastal | Overall status |
|---|---|---|---|---|---|---|---|
| Kestrel-900 | PASS (+8 °C) | PASS | N/A | PASS (+16 °C) | **FAIL** (+200 mm) | **NOT DEMONSTRATED** (none on file) | **Site A conditional shortlist; Site B not eligible** |
| Solaris-800 | PASS (+3 °C) | PASS | N/A | PASS (+11 °C) | **FAIL** (+100 mm) | **NOT DEMONSTRATED** (none on file) | **Site A conditional shortlist; Site B not eligible** |
| Halcyon-850 | **FAIL** (−2 °C) | PASS | N/A | PASS (+6 °C) | **FAIL** (+150 mm) | **NOT DEMONSTRATED** (“expected” only) | **Not eligible at either site** |

### 3.2 Warranty and certification record

| Vendor | Declared warranty | Coastal certification on file | Assessment |
|---|---:|---|---|
| Kestrel | 5 years | None declared | Warranty declared; no coastal evidence. No minimum warranty term is stated, so the 5-year term is recorded but is not a pass/fail gate. |
| Solaris | 7 years | None declared | Warranty declared; no coastal evidence. The longer term is a differentiator, not evidence of coastal compliance. |
| Halcyon | 10 years | **None**; 2026 certificate only “expected” | The 10-year term is the longest declared, but the coastal claim is unverified and cannot be accepted. The unit also fails Site A cold and Site B width. |

### 3.3 Vendor findings

- **No declared vendor/unit combination is compliant for Site B.** Two independent failures apply: every unit exceeds the 700 mm measured width, and no current coastal certificate is on file for any vendor. Either failure alone is sufficient to withhold award.
- **Two vendors are conditional for Site A.** Kestrel-900 and Solaris-800 pass the declared Site A constraints. “Conditional” means subject to cost/budget evidence, model-specific documentation, and written authority — none of which is in the repository.
- **Halcyon is not a fallback.** Its warranty headline is the longest, but it is the only unit that fails the Site A cold requirement, it fails the Site B width requirement, and its coastal claim is unverified. It should be excluded from the current shortlist rather than carried as an option.
- **Warranty length is not a proxy for compliance.** No source sets a minimum warranty term. The 5/7/10-year values are commercial differentiators to be evaluated once cost and lifecycle inputs exist, not technical passes.

---

## 4. Cost / budget model

### 4.1 Model status

**Unpopulated — no cost conclusion is possible.** The repository contains no unit prices, freight rates, installation rates, site-works estimates, quantities, currency, tax/duty treatment, discount rate, contingency rate, budget ceiling, funding source, or delegated financial authority. No cost figure in this section is estimated or invented, because an invented number would be an unverified claim and could be mistaken for a budget.

### 4.2 Cost model structure

For site `s` and candidate unit `u`:

```text
CAPEX_s      = C_site,s + Σ_u n_s,u × (P_u + F_s,u + I_s,u + X_s,u)
TOTAL_CAPEX  = Σ_s CAPEX_s + PM + CONT + TAX
CONT         = c × (Σ_s CAPEX_s + PM)
TCO_H        = TOTAL_CAPEX + Σ_(t=1..H) OM_t / (1 + r)^t − RV_H
```

| Symbol | Cost element | Required input | Value in repository |
|---|---|---|---|
| `n_s,u` | Quantity of unit `u` at site `s` | Unit count by site and model | **Not stated** |
| `P_u` | Equipment unit price | Vendor quotation, currency, validity date | **Not stated** |
| `F_s,u` | Freight and logistics to site | Route, incoterm, insurance | **Not stated** |
| `I_s,u` | Installation labour and equipment | Site conditions, access, labour rates | **Not stated** |
| `X_s,u` | Commissioning and testing | Scope, test regime | **Not stated** |
| `C_site,s` | Site-specific enabling/civil works | Especially any Site-B corridor change, if that option is chosen | **Not stated** |
| `PM` | Owner project management and permitting | Internal cost, permits | **Not stated** |
| `c` | Contingency rate | Risk-based allowance | **Not stated** |
| `TAX` | Taxes, duties, FX | Jurisdiction, currency | **Not stated** |
| `OM_t` | Annual operations and maintenance | Service contract, spares, energy | **Not stated** |
| `r` | Discount rate | Owner financial policy | **Not stated** |
| `H` | Evaluation horizon | Owner asset-life policy | **Not stated** |
| `RV_H` | Residual value at horizon | Disposal/second-life assumption | **Not stated** |
| `B_approved` | Approved budget | Written budget allocation | **Not stated** |

### 4.3 Budget decision rule

The package can support an expenditure decision only when **all** of the following are documented:

1. a written approved budget `B_approved` with currency and fiscal year;
2. a populated cost model with dated vendor quotations and a stated contingency;
3. a demonstrated `B_approved` ≥ the approved cost estimate, with the chosen percentile stated if a range is used;
4. a named delegate with authority to approve the amount, evidenced in writing;
5. confirmation that the scope being priced matches the technically eligible scope.

Current result: **the budget test is UNDETERMINED, and approval is withheld.** The absence of cost evidence is not evidence that cost is acceptable; it is evidence that the commercial case has not been made.

### 4.4 Cost-risk drivers to price once inputs exist

- Site-B corridor resolution: widening, re-measurement, or selection of a new ≤700 mm unit. This is a potential scope change and must be priced explicitly, not buried in contingency.
- Coastal certification and any product changes needed to obtain it, including possible re-testing or re-certification delay.
- Lead-time exposure: 8/10/12 weeks are vendor lead times only. Freight, customs, site works, installation, and commissioning durations are not in the repository.
- Model-specific compliance documentation (datasheets, test reports, warranty terms) may impose requirements not visible in the current summaries.
- Quantity, spares, training, warranty administration, and end-of-life costs are absent and may materially change TCO.
- Currency, tax, and price-validity risk cannot be assessed without quotations.

---

## 5. Implementation schedule

### 5.1 Scheduling status

**No committed dates are asserted.** The only duration data in the repository is the declared vendor `lead_weeks`; the source does not define their start or end points (see assumption A-7). Authorization, corridor resolution, certification, budget approval, installation, and commissioning durations are absent. All schedule references below are relative to **T0 = written authorization to proceed**, which has not been given.

### 5.2 Milestones and dependencies

| ID | Activity | Predecessor | Duration / timing | Source status |
|---|---|---|---|---|
| M0 | Close evidence and review this package | — | Complete for this revision | Repository review |
| M1 | Decide Site-B width strategy: confirm measurement basis, and choose corridor change, a new ≤700 mm unit, or escalate descope/deferral to the authority | M0 | **Not stated** | Engineering decision required |
| M2 | Verify current coastal certificate and coastal-rated warranty for any Site-B candidate | M0 | **Not stated** | No certificate on file |
| M3 | Populate cost model; obtain dated quotations; approve budget | M0 | **Not stated** | No cost data |
| M4 | Written authorization to proceed and delegation of expenditure authority | M1, M2, M3 (Site B); M3 (Site A) | **Not stated** | No authority in repository |
| M5 | Purchase order issued | M4 | 0 weeks (milestone) | — |
| M6 | Vendor lead time | M5 | Kestrel **8 weeks**; Solaris **10 weeks**; Halcyon **12 weeks** | S3 |
| M7 | Delivery, installation, commissioning, testing | M6 | **Not stated** | Not in repository |
| M8 | Acceptance and warranty start | M7 | **Not stated** | Not in repository |

### 5.3 Critical path

- **Site B:** M1 and M2 gate everything. Because no declared unit passes the measured width and no coastal certificate is on file, Site B **cannot reach M5** on current evidence. A purchase order for Site B would be premature.
- **Site A:** M3 and M4 gate M5. After authorization, the vendor lead-time clock would be **8 weeks for Kestrel** and **10 weeks for Solaris**, before logistics, installation, and commissioning — whose durations are unknown.
- **Halcyon:** the 12-week lead is the longest declared, and the unit is not eligible at either site. It is not on a viable critical path.

### 5.4 Schedule controls

- Re-check `inbox/` immediately before any purchase order; a new measurement or certificate can change the baseline.
- Do not convert the declared lead time into a delivery date; the source does not define its endpoint, and logistics and installation durations are absent.
- Require a resourced schedule with installation, commissioning, and acceptance durations before committing a delivery date.
- Record the Site-B measurement basis (clear opening vs corridor width) and any installation tolerance with the engineering decision.

---

## 6. Risk and uncertainty review

Likelihood and impact are qualitative judgements based on the repository evidence, not statistical estimates.

| ID | Risk / uncertainty | Basis | Likelihood | Impact | Response / owner gate |
|---|---|---|---|---|---|
| R1 | No declared unit fits the 700 mm Site-B corridor | S4 measured 700 mm; all units ≥800 mm | **Certain** | **High** | Do not procure for Site B. Resolve by corridor change or a new ≤700 mm candidate; engineering + authority gate (M1). |
| R2 | Stale 1200 mm assumption is reused | S1 says 1200 mm was an assumption; S4 supersedes it | Medium | High | Single source of truth = 700 mm. Purge 1200 mm from Site-B analysis; change-control any future survey. |
| R3 | Halcyon coastal claim is treated as a certificate | S2 says “expected”, no certificate on file; S5 says a future certificate is not a certificate | High | High | No compliance credit. Require the actual current certificate on file, with scope and validity checked (M2). |
| R4 | Kestrel or Solaris assumed coastal-compliant without evidence | S2 declares no coastal certification | High | High | No compliance credit. If Site B remains in scope, require current certificates before award. |
| R5 | Halcyon selected on warranty length despite technical failure | 10-year warranty headline; −10 °C at a −12 °C site; 850 mm at a 700 mm corridor | Medium | High | Exclude from current shortlist. Record warranty as a differentiator only after technical eligibility. |
| R6 | Budget invented or inferred from absent data | No prices, quantities, currency, or budget in repository | High | High | Leave model unpopulated; obtain dated quotations and approved budget (M3). |
| R7 | Scope/quantity ambiguity makes any estimate meaningless | Unit counts and balance-of-system scope not stated | High | High | Define quantities and scope before pricing; no order without them. |
| R8 | Expenditure approved without authority | No approver, delegation, or limit in repository | High | High | Package withholds approval; identify and evidence the delegate before M5. |
| R9 | Vendor lead time mistaken for total project duration | S3 provides lead weeks only; installation/commissioning absent | Medium | Medium | Build a resourced schedule; do not commit customer dates from lead time alone. |
| R10 | Upper-temperature limits are unverified | Site maximum temperatures absent; unit maxima 35–45 °C | Medium | Medium | Obtain site maximum temperature and model datasheets before design freeze. |
| R11 | Certificate scope does not match the offered model or warranty | No certificates on file; only vendor summaries | Medium | High | Verify certificate holder, model, standard, validity, and warranty linkage. |
| R12 | Measurement basis or installation tolerance is unclear | S4 states “measured width: 700 mm” but no dimension definition | Low–Medium | High | Confirm clear-opening basis and required installation tolerance with engineering; re-measure if needed. |
| R13 | New inbox evidence changes the baseline | S4 is an inbox update that supersedes an older assumption; S5 requires re-check | Medium | Medium | Re-check inbox before issue and before purchase order; version the baseline. |
| R14 | Coastal-rated warranty requirement is conflated with a generic warranty | S1 requires coastal-rated warranty; S2 reports warranty terms and certification separately | Medium | High | Obtain the warranty document and confirm the coastal rating explicitly; do not infer it from term length. |

### 6.1 Unverified claims expressly not accepted

- Halcyon’s “expected” 2026 coastal certificate — **not a certificate on file**.
- Any 2024 coastal column as a current 2026 certificate — **not current**, and not present in the repository.
- Vendor warranty durations as proof of coastal rating — **different attributes**.
- Any cost figure — **none exists in the repository**.
- Any claim that the 1200 mm Site-B corridor remains valid — **superseded by the 700 mm measurement**.

---

## 7. Integrated decision

### 7.1 Decision summary

| Decision area | Finding | Status |
|---|---|---|
| Site A technical eligibility | Kestrel-900 and Solaris-800 pass cold and width; Halcyon-850 fails cold | **Conditional shortlist** |
| Site B technical eligibility | All three units exceed the measured 700 mm width | **No eligible unit** |
| Site B coastal compliance | No current coastal certificate or coastal-rated warranty document is on file for any vendor | **Not demonstrated** |
| Vendor compliance | Kestrel/Solaris conditional for A; Halcyon excluded; none eligible for B | **Mixed; no B award** |
| Cost / budget | Model defined but unpopulated; no budget or authority | **Undetermined** |
| Schedule | Lead times known; authorization and downstream durations unknown | **Not committable** |
| Expenditure | No approved budget and no delegated authority in repository | **NOT APPROVED** |
| **Overall** | **Proceed only with evidence closure and Site-A conditional planning; no purchase order** | **HOLD** |

### 7.2 Integrated judgement

1. **Do not approve any expenditure.** The repository contains no budget, no cost evidence, and no identified authority. Approving spend would breach the governing instruction in `TASK.md` and would be unsupported by the evidence.
2. **Do not award Site B.** There is no technically admissible unit. The measured 700 mm corridor excludes Kestrel-900 (900 mm), Solaris-800 (800 mm), and Halcyon-850 (850 mm). In addition, no evidence is on file of the binding coastal-rated warranty or of a current coastal certificate for any vendor. Site B is a **no-go on current evidence**, not a marginal or price-dependent choice.
3. **Carry Kestrel-900 and Solaris-800 only as a conditional Site-A shortlist.** Both pass the declared Site-A constraints. The choice between them cannot be made responsibly without price, lifecycle cost, model-specific documentation, quantity, and delivery/installation data. Kestrel currently leads on cold margin and lead time; Solaris leads on warranty term and narrower width. That is a trade-off to resolve commercially, not a basis for award.
4. **Exclude Halcyon from the current shortlist.** It fails Site A cold by 2 °C, fails Site B width by 150 mm, and its coastal certificate is unverified. Its 10-year warranty does not offset those failures.
5. **Resolve Site B before any Site-B procurement.** The viable paths are (a) an engineering-approved corridor change with a new measurement, (b) introduction of a new candidate unit of at most 700 mm width with a current coastal certificate/coastal-rated warranty, or (c) a written authority decision to descope or defer Site B. No such unit exists in the current evidence set; none should be assumed.
6. **Close the commercial and governance gaps before revisiting the decision.** Populate the cost model, obtain dated quotations, define quantities and scope, identify the delegated approver, and record written authorization. Until then, the only safe status is HOLD.

### 7.3 Conditions precedent to any purchase order

- **CP-1 — Authority:** named delegate, delegated limit, and written authorization are on file.
- **CP-2 — Budget:** approved budget with currency and fiscal year; populated cost model and dated quotations; documented contingency.
- **CP-3 — Site A technical close-out:** model-specific datasheet confirming the declared cold rating and width; site maximum temperature checked against the unit maximum.
- **CP-4 — Site B width:** an engineering-approved corridor solution or a new candidate ≤700 mm, supported by a current measurement.
- **CP-5 — Site B coastal:** current 2026 coastal certificate and coastal-rated warranty documentation on file for the specific model; “expected” or 2024 evidence is not acceptable.
- **CP-6 — Evidence re-check:** `inbox/` re-checked and any new measurement or certificate reconciled immediately before order.
- **CP-7 — Scope/quantity:** unit counts and balance-of-system scope fixed so the priced scope matches the technical scope.

### 7.4 What would change the decision

| New evidence / decision | Effect |
|---|---|
| Corridor widened and re-measured to at least the selected unit width, with engineering approval | Removes the Site-B width failure; coastal and commercial gates still apply. |
| New candidate unit ≤700 mm with a minimum rating ≤ −4 °C and a current coastal certificate | Creates a Site-B candidate; still subject to cost, warranty, and authority. |
| Current 2026 coastal certificate for Kestrel or Solaris plus a width solution | Could make that vendor eligible at Site B. Certificate alone is insufficient. |
| Current 2026 coastal certificate for Halcyon | Does not cure Halcyon’s Site-A cold failure or Site-B width failure. |
| Approved budget and authority with populated costs | Allows the Site-A commercial choice to be made; does not fix Site B. |
| Site B removed from scope by the authority | Site A can proceed to commercial evaluation, subject to CP-1 to CP-3 and CP-6 to CP-7. |

### 7.5 Recommended next actions (no spend)

1. Record this package as **HOLD** and do not issue a purchase order.
2. Obtain the authority’s written decision on Site-B scope: corridor change, new-unit search, or deferral.
3. Confirm the 700 mm measurement basis and any installation tolerance with engineering; re-measure only if the basis is disputed.
4. Request current model-specific datasheets and any current coastal certificates from all three vendors; do not accept “expected” or 2024 evidence.
5. Populate the cost model with quantities, dated quotations, and a stated contingency; identify the budget and delegated approver.
6. Re-check `inbox/` before the next decision gate and before any order.
7. Reissue this package at revision 2.0 once CP-1 to CP-7 are addressed.

---

## 8. Review and approval record

This package is a **review artifact, not an approval**. The table is intentionally blank because no reviewer or approver is identified in the repository.

| Role | Name | Decision | Date | Signature / reference |
|---|---|---|---|---|
| Technical reviewer |  |  |  |  |
| Commercial / finance reviewer |  |  |  |  |
| Coastal / warranty reviewer |  |  |  |  |
| Authorised approver (delegated authority required) |  |  |  |  |

**Approval status: NOT APPROVED — HOLD.**

---

### Appendix A — Compliance test detail

| Test | Site A | Site B |
|---|---|---|
| Cold test | Unit min ≤ −12 °C | Unit min ≤ −4 °C |
| Width test | Unit width ≤ 1200 mm | Unit width ≤ 700 mm (measured) |
| Coastal test | N/A | Current coastal certificate / coastal-rated warranty on file |
| Upper-temperature test | Cannot be performed: site maximum not stated | Cannot be performed: site maximum not stated |

| Unit | Site A cold | Site A width | Site B cold | Site B width | Site B coastal |
|---|---|---|---|---|---|
| Kestrel-900 | −20 ≤ −12: pass | 900 ≤ 1200: pass | −20 ≤ −4: pass | 900 ≤ 700: **fail** | none on file |
| Solaris-800 | −15 ≤ −12: pass | 800 ≤ 1200: pass | −15 ≤ −4: pass | 800 ≤ 700: **fail** | none on file |
| Halcyon-850 | −10 ≤ −12: **fail** | 850 ≤ 1200: pass | −10 ≤ −4: pass | 850 ≤ 700: **fail** | “expected” only — unverified |

### Appendix B — Open data requests

| # | Data needed | Why it matters | Owner (to be assigned) |
|---|---|---|---|
| 1 | Written delegation and approver for this expenditure | Authority to approve | Authority |
| 2 | Approved budget, currency, fiscal year | Budget test | Finance |
| 3 | Unit quantities by site | Cost and schedule | Operations / project owner |
| 4 | Dated vendor quotations and price validity | Cost model | Procurement |
| 5 | Freight, installation, commissioning, site-works rates | Cost model | Procurement / engineering |
| 6 | Site maximum temperatures | Full temperature compliance | Engineering |
| 7 | Site-B dimension basis and engineering decision | Width compliance | Engineering |
| 8 | Current 2026 coastal certificates and warranty documents | Coastal compliance | Vendor / procurement |
| 9 | Model-specific datasheets and test reports | Verification of declared capacity | Engineering |
| 10 | Installation, commissioning, and acceptance durations | Committable schedule | Project delivery |

### Appendix C — Package traceability

| Package section | Primary evidence |
|---|---|
| 2. Technical capacity | S1, S3, S4 |
| 3. Vendor compliance | S1, S2 |
| 4. Cost / budget model | No cost source in repository; model structure only |
| 5. Implementation schedule | S3 (lead times only); other durations absent |
| 6. Risk and uncertainty | S1–S5 |
| 7. Integrated decision | Synthesis of S1–S5 and `TASK.md` |

---

*End of package. This revision is based only on repository evidence available at the stated snapshot. It approves no expenditure and commits no delivery date.*
