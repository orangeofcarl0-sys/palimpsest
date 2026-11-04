# Multi-Site Energy Deployment — Reviewable Package

**Status:** **HOLD — verification only. No award, purchase order, or expenditure commitment.**
**Package date:** 2026-11-05
**Repository revision:** `9b8a94e` (`scenario base`)
**Evidence cut-off:** 2026-11-05, after re-checking `inbox/`, including the measured corridor update at `inbox/2026-11-03/corridor-measurement.md`.

> **Decision in one line:** Proceed to verify and price Site A; do not procure. **Site A** has two units that pass the stated screens (Kestrel-900 and Solaris-800); Halcyon-850 fails the cold screen. **Site B** has **no eligible unit or vendor**: the measured corridor is **700 mm**, which is narrower than all three listed units, and no current 2026 coastal certificate is on file for any vendor.

---

## Contents

1. [Decision summary](#1-decision-summary)
2. [Basis of review and evidence rules](#2-basis-of-review-and-evidence-rules)
3. [Technical capacity assessment](#3-technical-capacity-assessment)
4. [Vendor compliance assessment](#4-vendor-compliance-assessment)
5. [Cost and budget model](#5-cost-and-budget-model)
6. [Implementation schedule](#6-implementation-schedule)
7. [Risk and uncertainty review](#7-risk-and-uncertainty-review)
8. [Integrated decision](#8-integrated-decision)
9. [Conditions precedent and next evidence](#9-conditions-precedent-and-next-evidence)
10. [Evidence ledger and source register](#10-evidence-ledger-and-source-register)

---

## 1. Decision summary

| Item | Finding | Decision |
|---|---|---|
| **Site A technical** | Kestrel-900 and Solaris-800 pass the stated cold and width screens. Halcyon-850 fails the cold screen by 2 K. Site maximum temperatures are not stated. | Shortlist Kestrel-900 and Solaris-800. Exclude Halcyon-850. |
| **Site B technical** | All three units pass the cold screen. The measured corridor is **700 mm**; all three units are **100–200 mm too wide**. No current 2026 coastal certificate is on file. | **No eligible unit.** Hold. |
| **Vendor compliance** | No vendor has coastal certification in the declared sources. Halcyon's "expected" 2026 certificate is an unverified claim and is not a certificate on file. | Do not accept any vendor as compliant for Site B. |
| **Cost / budget** | No unit prices, quantities, freight, installation rates, currency, tax basis, corridor-works cost, or approved budget exist in the repository. | Cost model is symbolic only. **Budget cannot be set and no spend is approved.** |
| **Schedule** | Only equipment lead times are sourced (8 / 10 / 12 weeks). No PO date, survey-to-remediation duration, certification duration, installation, or commissioning duration is sourced. | Indicative *equipment availability* only. No committed energization date. |
| **Authority** | No delegated financial authority or approval record is present. | **Authorized commitment evidenced: zero.** The accountable approver must set any pre-award cap. |
| **Overall** | The evidence supports a gated verification step for Site A, not a deployment award. Site B is blocked by two independent physical/documentary failures. | **Conditional proceed to verification; no procurement.** |

### Recommended action to the accountable approver

1. Do **not** approve capex, issue a purchase order, or sign a supply contract on the current evidence.
2. Authorize a **capped pre-award verification budget** for Site A RFQ evaluation and the Site B option study. The cap must be set by the approver; this package cannot set it.
3. Issue an RFQ for **Site A** to Kestrel and Solaris only. Do not invite Halcyon-850 for Site A.
4. **Do not run a Site B unit selection on the current table.** Either establish a corridor width that fits a listed unit, or obtain a unit no wider than the measured corridor (with installation clearance), and obtain a current 2026 coastal certificate on file. Then re-open Site B.
5. Return to the decision gate with the evidence listed in [Section 9](#9-conditions-precedent-and-next-evidence).

---

## 2. Basis of review and evidence rules

### 2.1 Scope

This package covers the six items required by `TASK.md`: technical capacity, vendor compliance, cost/budget, implementation schedule, risk/uncertainty, and the integrated decision. It is based only on the repository: `TASK.md`, `sources/`, and `inbox/`. No external data, market price, or design value has been introduced.

### 2.2 Evidence classes used

Every material statement in this package is labelled with one of the following:

| Class | Meaning | Treatment in this package |
|---|---|---|
| **Declared** | Stated in a repository source. | Used as an input, subject to the source's own limits. |
| **Measured** | A site measurement stated in an inbox item. | Used for screening, bounded by the item's own text. |
| **Derived** | Calculated from declared or measured values. | Shown with the calculation. |
| **Assumption** | A value explicitly identified as an assumption, or a planning method introduced here. | Never treated as measured fact. |
| **Unverified** | A vendor or third-party claim not supported by a document on file. | Not accepted. Requires primary evidence. |
| **Missing** | No value or document in the repository. | Recorded as an open item; not filled by invention. |
| **Stale / superseded** | A value displaced by a later measured update. | Not used for decisions. |

### 2.3 Source limitations that bound this package

- `sources/capacity.csv` is a **compatibility and lead-time table**, not a capacity-rating table. It contains no kW, kWh, efficiency, performance, degradation, or quantity data.
- `sources/sites.md` gives **design minimum** temperatures but **no design maximum** temperatures.
- Site A's maximum admissible width is stated (1200 mm). Site B's baseline 1200 mm value is explicitly an **assumption, not a measurement** (`sources/sites.md:4`).
- `inbox/2026-11-03/corridor-measurement.md` supplies the **measured Site B width of 700 mm**, states that the 1200 mm value is superseded, and states that the 900 mm unit is **not admissible** at Site B.
- `sources/vendors.md` gives warranty **durations** but no warranty terms, no coastal rating, and no certificate.
- The repository contains **no cost, quantity, tariff, budget, or authority data**.
- The measurement text does not state whether 700 mm includes installation clearance or tolerance. A fit at exactly 700 mm is therefore not assumed.

### 2.4 Screening convention

For the temperature screen, this package treats `min_c` and `max_c` as the unit's admissible ambient operating limits, as implied by the column names. The sources do not state the test conditions behind those values. A unit passes the cold screen when:

```text
unit min_c  <=  site design minimum
```

A positive margin means the unit can operate at a temperature colder than the site design minimum. A negative margin is a shortfall. This is a **screening test**, not a full thermal-performance or certification review; datasheet test conditions and any performance derating must be confirmed before contract award.

For the width screen, a unit passes when:

```text
unit width  <=  measured maximum admissible width
```

Site A uses the declared 1200 mm limit. Site B uses the measured **700 mm** corridor from the inbox update. The 1200 mm Site B assumption is **not** used. The measured width is applied as the governing width because the inbox item expressly states that the 900 mm unit is not admissible at Site B; the same arithmetic test is then applied to the 800 mm and 850 mm units.

For the coastal screen, a vendor passes only with a **current 2026 coastal certificate on file** covering the exact offered model, plus a coastal-rated warranty. A 2024 reference is stale under the source rule. An expected future certificate is not a certificate on file.

### 2.5 What this package does not do

It does not produce an engineering design, a capacity rating, a cost estimate, a legal opinion, a tax analysis, a financing model, or an authorization to spend. Where the evidence is absent, the package says so rather than filling the gap.

---

## 3. Technical capacity assessment

### 3.1 What can and cannot be concluded

**Can be concluded:** whether each declared unit fits the stated temperature and width screens at each site.

**Cannot be concluded:** the installed capacity of either site, annual energy yield, redundancy, or system performance. The repository contains no unit power/energy rating, no site load, and no unit count. `capacity.csv` should not be read as a capacity rating.

### 3.2 Screening summary

| Site | Unit | Cold screen | Width screen | Coastal screen | Result |
|---|---|---|---|---|---|
| A (−12 °C, 1200 mm) | Kestrel-900 | PASS (+8 K) | PASS (900 ≤ 1200) | Not required | **Eligible on stated screens**; max-temp open |
| A | Solaris-800 | PASS (+3 K) | PASS (800 ≤ 1200) | Not required | **Eligible on stated screens**; max-temp open |
| A | Halcyon-850 | **FAIL (−2 K)** | PASS (850 ≤ 1200) | Not required | **Not eligible** |
| B (−4 °C, **700 mm measured**) | Kestrel-900 | PASS (+16 K) | **FAIL (900 > 700 by 200 mm)** | **No certificate on file** | **Not eligible** |
| B | Solaris-800 | PASS (+11 K) | **FAIL (800 > 700 by 100 mm)** | **No certificate on file** | **Not eligible** |
| B | Halcyon-850 | PASS (+6 K) | **FAIL (850 > 700 by 150 mm)** | **No certificate on file; "expected" only** | **Not eligible** |

### 3.3 Site A — design minimum −12 °C, maximum admissible width 1200 mm, no coastal requirement

Source: `sources/sites.md:3`; unit data: `sources/capacity.csv:2-4`.

| Unit | Unit min °C | Site A design min °C | Cold screen | Margin | Unit width (mm) | Width limit (mm) | Width screen | Margin | Unit max °C | Site A design max °C | Overall |
|---|---:|---:|---|---:|---:|---:|---|---:|---:|---|---|
| Kestrel-900 | −20 | −12 | **PASS** | +8 K | 900 | 1200 | **PASS** | 300 mm | 45 | not stated | **Eligible on stated screens**; max-temp confirmation required |
| Solaris-800 | −15 | −12 | **PASS** | +3 K | 800 | 1200 | **PASS** | 400 mm | 40 | not stated | **Eligible on stated screens**; max-temp confirmation required |
| Halcyon-850 | −10 | −12 | **FAIL** | **−2 K** | 850 | 1200 | PASS | 350 mm | 35 | not stated | **Not eligible** — cannot meet the stated design minimum |

**Site A conclusion:** Halcyon-850 is excluded on the cold screen; its width passes, but width cannot compensate for a 2 K cold shortfall. Kestrel-900 and Solaris-800 pass both stated screens. Neither can be declared fully compliant until the site design maximum temperature is confirmed and datasheet conditions are checked. The repository does not state a Site A maximum, so the 45 °C, 40 °C, and 35 °C unit maxima cannot be tested against a site requirement.

### 3.4 Site B — design minimum −4 °C, measured corridor 700 mm, coastal-rated warranty binding

Sources: `sources/sites.md:4`; `sources/capacity.csv:2-4`; `inbox/2026-11-03/corridor-measurement.md:3-6`.

| Unit | Unit min °C | Site B design min °C | Cold screen | Margin | Unit width (mm) | Measured corridor (mm) | Width screen | Width delta | Current 2026 coastal certificate | Overall |
|---|---:|---:|---|---:|---:|---:|---|---:|---|---|
| Kestrel-900 | −20 | −4 | **PASS** | +16 K | 900 | 700 | **FAIL** | **200 mm too wide** | None on file | **Not eligible** |
| Solaris-800 | −15 | −4 | **PASS** | +11 K | 800 | 700 | **FAIL** | **100 mm too wide** | None on file | **Not eligible** |
| Halcyon-850 | −10 | −4 | **PASS** | +6 K | 850 | 700 | **FAIL** | **150 mm too wide** | "Expected" only; not on file | **Not eligible** |

**Site B conclusion:** the cold screen is satisfied by all three units, but **none is eligible**. There are two independent failures:

1. **Width:** the measured corridor is 700 mm; the narrowest listed unit is 800 mm. Every listed unit is too wide. The inbox item expressly confirms that the 900 mm unit is not admissible; the same test excludes the 800 mm and 850 mm units by 100 mm and 150 mm respectively.
2. **Coastal evidence:** no vendor has a current 2026 coastal certificate on file. Halcyon's "expected" certificate is an unverified vendor claim, not a certificate.

The 1200 mm Site B corridor value in `sources/sites.md:4` was an assumption. It is **superseded** by the 2026-11-03 measurement and is not used in any screen or selection in this package.

The measurement text does not state installation clearance or tolerance. Even a future unit of exactly 700 mm would need the measurement scope and clearance confirmed; a 700 mm unit is not automatically admissible.

### 3.5 Coastal evidence test

For Site B, a vendor passes only if **all** of the following are on file:

1. A **current 2026** coastal certificate — not a 2024 column, not a brochure reference, not an expected future certificate.
2. The certificate identifies the **exact model/series** being offered.
3. The certificate is issued by an identifiable body, names the applicable coastal/salt-mist standard and test severity, and is valid for the delivery/installation period.
4. The **warranty document itself** is coastal-rated and is consistent with the certificate (term, exclusions, start date, site scope).

A **2024** coastal reference would be stale for this 2026 decision. An **expected** 2026 certificate is an unverified claim. Neither satisfies the requirement. This applies the rule stated in `sources/sites.md:6` and `inbox/README.md:4` literally.

### 3.6 Capacity quantification — not available

The following are absent, so no MW/kWh capacity figure is stated:

- unit power/energy rating and efficiency;
- number of units per site;
- site load/profile and availability requirement;
- installation losses, derating, and degradation;
- interconnection capacity.

Any capacity number in a later version must cite a measured or datasheet source and show its calculation. It cannot be inferred from `capacity.csv`.

### 3.7 Site B remediation options (not yet selected or priced)

Because all listed units are too wide, Site B cannot proceed on the current unit table. Two alternative routes would need study:

| Route | What would be required | Evidence gap |
|---|---|---|
| **B1 — widen/re-route corridor** | Civil works to achieve a measured width at least equal to the offered unit width plus installation clearance | Structural/civil feasibility, required width, works cost and duration |
| **B2 — narrower unit** | A unit no wider than the measured corridor with clearance, from a vendor with a current 2026 coastal certificate | No listed unit qualifies; no vendor certificate on file; price and lead time absent |

Neither route is recommended over the other today. B1 may preserve the current shortlist but adds civil cost and disruption; B2 avoids civil works but requires a new product and certification. Both require the coastal certificate gate. Neither can be priced from the repository.

---

## 4. Vendor compliance assessment

### 4.1 Vendor matrix

Warranty and certification statements: `sources/vendors.md:3-5`. Unit data: `sources/capacity.csv:2-4`. Site B width: `inbox/2026-11-03/corridor-measurement.md:3-6`.

| Vendor / unit | Declared warranty | Coastal certification evidence | Site A technical | Site B technical | Lead (weeks) | Compliance status |
|---|---:|---|---|---|---:|---|
| **Kestrel-900** | 5 years | None in declared sources | Eligible on cold and width screens; max-temp open | Cold pass; **width fail** (900 > 700); **coastal fail** | 8 | **Conditionally eligible for Site A only**; not eligible for Site B |
| **Solaris-800** | 7 years | None in declared sources | Eligible on cold and width screens; max-temp open | Cold pass; **width fail** (800 > 700); **coastal fail** | 10 | **Conditionally eligible for Site A only**; not eligible for Site B |
| **Halcyon-850** | 10 years | 2026 certificate "expected"; **no certificate on file** | **Cold fail** (−10 °C vs −12 °C); width pass | Cold pass; **width fail** (850 > 700); **coastal fail** | 12 | **Not eligible for either site** |

### 4.2 Findings

1. **No vendor is compliant for Site B.** Kestrel and Solaris have no coastal certification in the declared sources. Halcyon's expected certificate is not a certificate on file and must be treated as unverified. The 10-year warranty is a duration, not a coastal rating.
2. **No listed unit fits Site B.** Even if a coastal certificate were produced, all three units exceed the measured 700 mm corridor. A certificate alone would not make any current unit deployable at Site B.
3. **Halcyon is not a Site A option.** The Halcyon-850 minimum of −10 °C is warmer than Site A's −12 °C design minimum. A longer warranty and a 12-week lead time do not cure a thermal shortfall.
4. **Kestrel and Solaris are shortlisted for Site A, not selected.** They pass the two stated screens. Selection still requires a priced quote, confirmed maximum ambient rating, and spend authority.
5. **"Technically eligible" is not "compliant."** Full compliance also requires contract terms, warranty terms, delivery commitment, quality documentation, and price. None of those is in the repository.
6. **Warranty durations are declared, not contract-verified.** The 5-, 7-, and 10-year figures should be confirmed in the offered warranty documents, including start date and exclusions.

### 4.3 Comparative note

On the evidence available, Kestrel has the shortest lead time (8 weeks) and the shortest warranty (5 years). Solaris has a longer lead (10 weeks) and a longer warranty (7 years). Neither advantage can be converted into a recommendation without price and without the Site A maximum-temperature check. Halcyon's 10-year warranty is not a differentiator while the unit fails Site A and lacks both a Site B width fit and a Site B certificate.

---

## 5. Cost and budget model

### 5.1 Status: unpriced

**No monetary value is stated in this package.** The repository contains no unit price, freight rate, installation rate, currency, tax basis, quantity, contingency policy, corridor-works cost, or approved budget. A budget number produced today would be fabricated, so none is produced.

### 5.2 Cost breakdown structure

All values are `TBD`. The model is deliberately symbolic so that priced inputs can be inserted without changing its structure.

| ID | Cost element | Basis of estimate | Current value | Evidence status |
|---|---|---|---|---|
| C1 | Unit supply | `N_s × P_s` | TBD | **Missing** |
| C2 | Freight and logistics | quote / route survey | TBD | **Missing** |
| C3 | Site civil works and foundations | site design / contractor quote | TBD | **Missing** |
| C4 | Installation labour and equipment | installation plan / quote | TBD | **Missing** |
| C5 | Electrical and grid interconnection | interconnection study / utility quote | TBD | **Missing** |
| C6 | Commissioning and testing | commissioning plan / quote | TBD | **Missing** |
| C7 | Coastal certification and warranty uplift | vendor quote / certificate review | TBD | **Missing** |
| C8 | Spares and consumables | maintenance strategy | TBD | **Missing** |
| C9 | Owner's costs (PM, legal, permitting, insurance) | owner's budget | TBD | **Missing** |
| C10 | Contingency | approver policy against risk register | TBD | **Policy not set** |
| C11 | Escalation and foreign-exchange allowance | quote validity / treasury policy | TBD | **Missing** |
| C12 | Decommissioning / end-of-life | asset policy | TBD | **Missing** |
| C13 | Site B corridor widening / re-route (only if route B1 is pursued) | civil survey and contractor quote | TBD | **Missing** |
| O1 | Annual service and maintenance | `N_s × M_s` | TBD | **Missing** |
| O2 | Warranty and insurance | contract / broker quote | TBD | **Missing** |

### 5.3 Parametric model

```text
Capex(site s) = N_s × (P_s + F_s + I_s + E_s + Cm_s) + S_s + O_s + W_s

Program capex = Σ_s Capex(site s) + Contingency + Escalation

Annual opex   = Σ_s N_s × (M_s + Warr_s + Ins_s)
```

Where, for each site `s`:

- `N_s` = number of units (unknown);
- `P_s` = delivered unit price before freight (unknown);
- `F_s` = freight and logistics per unit (unknown);
- `I_s` = installation per unit (unknown);
- `E_s` = electrical/interconnection per unit (unknown);
- `Cm_s` = commissioning and testing per unit (unknown);
- `S_s` = spares (unknown);
- `O_s` = owner's costs (unknown);
- `W_s` = site-specific works, including any corridor widening for Site B (unknown);
- `M_s` = annual maintenance per unit (unknown);
- `Warr_s` = annual warranty cost per unit (unknown);
- `Ins_s` = insurance per unit (unknown).

### 5.4 Budget gate

A budget may be set only when the following are on file:

1. quantities `N_A` and `N_B`;
2. written vendor quotes with currency, tax basis, freight terms, and validity date;
3. installation and commissioning rates;
4. interconnection and permitting allowances;
5. for Site B, a selected width/compliance route (B1 or B2) and its cost;
6. contingency policy and escalation basis;
7. the accountable approver's written authority and budget envelope.

**Authorized commitment evidenced in the repository: zero.** No approved budget or delegated financial limit is present in the repository. The instruction in `TASK.md:12` — "Do not approve expenditure without authority" — is applied strictly. The package's own recommendation does not create authority. Any pre-award verification cap recommended in Section 1 is a separate, approver-set authorization; it is not a project budget and is not assumed here.

### 5.5 What is not modelled

- Energy revenue, tariffs, grants, or subsidies — no data.
- LCOE, payback, IRR, or NPV — no energy yield, price, or discount rate.
- Taxes and duties — no jurisdiction or tax basis.
- Finance costs — no financing terms.
- Site B corridor widening — no design, quantity, or rate.

These are excluded rather than guessed.

---

## 6. Implementation schedule

### 6.1 Basis and caveat

The only sourced durations are the equipment lead times in `sources/capacity.csv:2-4`: **Kestrel 8 weeks, Solaris 10 weeks, Halcyon 12 weeks**. Survey-to-remediation, certificate acquisition, installation, and commissioning durations are **not** in the repository. No purchase-order date is justified by the evidence. Accordingly, the schedule is expressed as dependencies and as `PO date + lead time`; it is not a committed programme.

### 6.2 Dependency-based schedule

`PO` = purchase order. `TBD` means no sourced duration or date exists.

| Phase | Precondition | Duration basis | Earliest completion |
|---|---|---|---|
| G0 — package acceptance and authority check | Accountable approver confirms delegated authority and any capped pre-award budget | Not sourced | TBD |
| Site A RFQ and evaluation | G0; verified maximum temperatures; priced quotes | Not sourced | TBD |
| G1 — Site A award gate | All Site A conditions in [Section 9](#9-conditions-precedent-and-next-evidence) met | — | TBD |
| Site A PO | G1 | — | TBD |
| Kestrel equipment availability | Site A PO | **8 weeks sourced** | **PO + 8 weeks** |
| Solaris equipment availability | Site A PO | **10 weeks sourced** | **PO + 10 weeks** |
| Site B width/certificate resolution | Civil route B1 or narrower-unit route B2; current 2026 certificate on file | Not sourced | TBD |
| Site B PO | Site B resolution and all Section 9 conditions met | — | TBD |
| Halcyon equipment availability (Site B only) | Site B PO, width fit, and certificate | **12 weeks sourced** | **PO + 12 weeks** |
| Installation and commissioning | Equipment on site; installation plan and resources | Not sourced | TBD |
| Site acceptance / energization | Commissioning complete; utility approval | Not sourced | TBD |

### 6.3 The only schedule arithmetic the evidence supports

| Scenario | Formula | Result |
|---|---|---|
| Site A with Kestrel-900 | PO date + 8 weeks | Equipment available 8 weeks after a PO that has not been justified or authorized |
| Site A with Solaris-800 | PO date + 10 weeks | Equipment available 10 weeks after a PO that has not been justified or authorized |
| Site B with Halcyon-850 (only if the corridor is widened to fit it) | PO date + 12 weeks | Not currently schedulable; requires both width resolution and a current certificate |

No energization date is stated. Equipment availability is not installation, commissioning, or utility approval.

### 6.4 Critical path

- **Site A:** authority → RFQ and evaluation → PO → 8-week Kestrel lead (or 10-week Solaris lead) → installation/commissioning (duration unknown) → energization (duration unknown). The only quantified segment is the equipment lead time.
- **Site B:** certificate and width resolution are **parallel mandatory gates**, followed by a PO and lead time. Neither gate has a sourced duration. Because the current corridor is 700 mm and the narrowest listed unit is 800 mm, a PO cannot be placed on the current unit table at all. Civil works under route B1 or a new narrower product under route B2 would sit on the critical path.
- **No schedule float can be calculated.** Only the three lead times are quantified; every other duration is absent.

### 6.5 Schedule risks

- Certificate acquisition has no sourced duration and may be long; it cannot be assumed to complete within a normal procurement cycle.
- Corridor widening under route B1 has no design, approval, or construction duration; it may be the longest Site B activity.
- A narrower unit under route B2 may have a different lead time from the 8/10/12-week values in the table, which apply to the listed models only.
- No installation resource, weather window, or utility outage plan is in the repository.
- The lead times are declared, not contracted; they are not a delivery commitment.

---

## 7. Risk and uncertainty review

### 7.1 Risk register

Likelihood and impact are qualitative (H/M/L); no numeric probability is implied.

| ID | Risk | L | I | Evidence | Mitigation / trigger |
|---|---|---|---|---|---|
| R-01 | Halcyon-850 cannot meet Site A design minimum | H | H | `capacity.csv:4`: −10 °C vs site −12 °C | Exclude from Site A; no price or warranty trade can cure it |
| R-02 | No current 2026 coastal certificate for any Site B vendor | H | H | `vendors.md:3-5`; `sites.md:6`; `inbox/README.md:4` | Mandatory pass/fail gate; obtain certificate on file before award |
| R-03 | Site B measured corridor (700 mm) is narrower than every listed unit (800–900 mm) | H | H | `inbox/2026-11-03/corridor-measurement.md:3-6` | No unit selection on current table; choose route B1 (widen) or B2 (narrower unit) before RFQ |
| R-04 | Site design maximum temperatures are unknown | M | M | `sites.md:3-4` states minima only | Confirm site maxima against unit maxima (45/40/35 °C) |
| R-05 | No cost basis for any vendor, site, or corridor works | H | H | No prices/quantities in sources | Priced RFQ; no budget until quotes are on file |
| R-06 | No delegated spend authority or approved budget | H | H | No authority record in repository | Accountable approver must issue written authority and cap |
| R-07 | Certificate is stale, out of scope, or for a different model | M | H | 2026 requirement; `sites.md:6` | Acceptance checklist: issuer, number, model, standard, validity |
| R-08 | Warranty is not actually coastal-rated even if a certificate exists | M | H | Warranty terms absent from `vendors.md` | Legal review of warranty document and exclusions |
| R-09 | Lead time or price changes before PO | M | M | Lead times are declared, not contracted | Quote validity; escalation clause; order promptly after gate |
| R-10 | Unit quantities and site load are unknown | H | M | No quantity or load data | Confirm `N_A`, `N_B`, and load requirement |
| R-11 | Installation, commissioning, and interconnection are undefined | M | H | Not in sources | Engineering plan and utility study before PO |
| R-12 | An unverified claim or superseded value is reused as fact | M | H | Halcyon "expected" certificate; 1200 mm assumption superseded by 700 mm measurement | Evidence ledger in Section 10; re-verify at every gate |
| R-13 | Single-vendor dependency if only one Site A RFQ response is usable | M | M | Market response unknown | Dual RFQ for Site A; keep both Kestrel and Solaris active |
| R-14 | Weather/season delays installation | M | M | No weather or site-access data | Schedule float after contract award; not before |
| R-15 | Site B corridor widening is infeasible, disruptive, or disproportionately costly | M | H | No civil/structural survey or cost | Option study with contractor; compare against route B2 before commitment |
| R-16 | The 700 mm measurement's scope, tolerance, or clearance basis is insufficient for construction | M | M | Measurement text states width only | Re-survey with installation clearance and tolerance before design or PO |
| R-17 | A certificate is obtained but no compliant-width unit exists, or vice versa | M | H | Two independent Site B gates | Track both gates together; do not release Site B on one gate alone |

### 7.2 Uncertainty classification

| Type | Items |
|---|---|
| **Known and declared** | Site A design minimum −12 °C; Site A width limit 1200 mm; Site B design minimum −4 °C; Site B coastal-rated warranty requirement; unit temperature limits; unit widths; lead times; declared warranty durations (5/7/10 years) |
| **Measured** | Site B corridor width **700 mm** (survey 2026-11-03) |
| **Known unknown** | Site A and B design maximum temperatures; unit quantities; prices and rates; current certificate status; installation/commissioning durations; grid interconnection capacity; budget authority; installation clearance; corridor-widening feasibility and cost |
| **Assumption** | `min_c`/`max_c` are admissible ambient operating limits; no procurement date is assumed |
| **Unverified claim** | Halcyon 2026 coastal certificate "expected" (`vendors.md:5`); warranty terms, start dates, and exclusions until contract documents are reviewed |
| **Stale / superseded** | Site B corridor = 1200 mm (`sites.md:4`), expressly superseded by the measured 700 mm; any 2024 coastal column |
| **Outside this package** | Permitting, geotechnical conditions, civil design, utility approvals, tax, financing, energy yield |

### 7.3 Risk posture

The dominant risks are **evidence and physical-fit risks**, not a lack of vendor choice. For Site A, the remaining blockers are price, authority, and the unstated maximum temperature. For Site B, the blockers are concrete: a 700 mm corridor that no listed unit fits, and no current 2026 coastal certificate on file. Those are resolvable only by design choice (widen or narrow the unit), certification, and pricing — not by proceeding to award. Proceeding now would transfer an unconfirmed clearance basis and an unverified certificate claim into a contract, which is the outcome this package is designed to prevent.

---

## 8. Integrated decision

### 8.1 Gate results

| Gate | Test | Site A | Site B | Consequence |
|---|---|---|---|---|
| G0 | Evidence complete enough to decide? | **Partial** — technical screens pass for two units; cost and authority missing | **No** — width and coastal evidence fail | Verification only |
| G1 | Technical eligibility? | **2 of 3 pass** (Kestrel, Solaris); Halcyon fails cold | **0 of 3 pass** — all fail width; all fail coastal evidence | A shortlist; B no eligible unit |
| G2 | Commercial comparison possible? | **No** — no prices or quantities | **No** — no prices, quantities, or corridor-works cost | No selection |
| G3 | Spend authority? | **Not evidenced** | **Not evidenced** | No commitment |
| G4 | Award? | **No** | **No** | HOLD |

### 8.2 Decision by site

**Site A — conditional shortlist, no award**

- Technically eligible on the stated screens: **Kestrel-900** and **Solaris-800**.
- Excluded: **Halcyon-850** (cold shortfall of 2 K).
- Next step: priced RFQ to Kestrel and Solaris, plus confirmation of site design maximum temperature.
- No preference between Kestrel and Solaris is justified until price, warranty terms, and delivery are compared. Kestrel has the shorter lead; Solaris has the longer warranty.
- No purchase order until authority, price, and max-temperature confirmation are in place.

**Site B — hold, no eligible unit**

- All three units pass the cold screen, but **all three are too wide** for the measured 700 mm corridor. The 900 mm unit is expressly not admissible (`inbox/2026-11-03/corridor-measurement.md:6`); the 800 mm and 850 mm units fail the same test.
- Independently, **none has a current 2026 coastal certificate on file**. Halcyon's 10-year warranty and "expected" certificate do not satisfy the binding requirement. Kestrel and Solaris have no coastal certification in the declared sources either.
- Do not select a Site B vendor on the current unit table. First choose and price a route: widen/re-route the corridor (B1) or obtain a narrower certified unit (B2). Then obtain the current 2026 certificate and re-run the full screen.
- Re-open Site B only when **both** a width-compliant configuration and a current certificate are on file. There is no basis to prefer Halcyon today.

### 8.3 Overall decision

> **HOLD. Conditional proceed to verification for Site A; no procurement, no award, no expenditure commitment. Site B is not deployable with any currently listed unit.**

This is not a rejection of the project. It is a refusal to convert unverified claims and a physically non-fitting site condition into an approved purchase. The technical path for Site A is clear subject to price and authority. The Site B path requires a design decision and a certificate that no vendor currently has on file.

### 8.4 What would change the decision

| Trigger | Effect |
|---|---|
| Current 2026 coastal certificate on file for a vendor, covering the offered model and coastal warranty | Removes the coastal blocker for that vendor only; width and price still apply |
| Site B corridor measured/widened at or above the offered unit width plus installation clearance | Removes the width blocker for that unit |
| A unit no wider than the measured corridor (with clearance), from a vendor with a current 2026 certificate | Creates a candidate for Site B; still subject to price and authority |
| Site A/B design maximum temperature confirmed within unit maximum | Removes the open upper-temperature condition |
| Priced quotes with quantities, currency, tax, freight, and validity, including any corridor works | Commercial comparison can begin; budget can be drafted |
| Written delegated authority and approved budget envelope | Expenditure can be approved at the authorized level only |
| Halcyon re-rated or a different Halcyon model with min ≤ −12 °C | Halcyon could re-enter the Site A comparison on technical grounds; the current Halcyon-850 remains excluded |

### 8.5 Preferred option if a decision is required today

**Site A only, with a dual RFQ to Kestrel and Solaris; Site B deferred pending a width solution and current coastal certificate.** This preserves competition, avoids the failed Halcyon cold screen, and does not commit capital before prices and authority exist. Selecting a single vendor today would be premature because there is no cost basis. Selecting any Site B unit today would be unsupported because no listed unit fits the measured corridor.

---

## 9. Conditions precedent and next evidence

### 9.1 Conditions precedent to any purchase order

| ID | Condition | Evidence required | Owner |
|---|---|---|---|
| C1 | Delegated spend authority and budget envelope | Written approval naming the approver, amount, and scope | Accountable approver |
| C2 | Site B width resolution | Either a measured corridor at least as wide as the offered unit plus installation clearance (B1), or a unit no wider than the measured corridor with clearance (B2) | Site owner / engineering / vendor |
| C3 | Current 2026 coastal certificate on file (Site B only) | Certificate with issuer, number, model, standard, validity; plus coastal-rated warranty terms | Vendor / legal |
| C4 | Priced quotes | Unit price, quantity, currency, tax, freight, installation, commissioning, validity | Procurement |
| C5 | Site maximum temperatures confirmed | Site design maximum for A and B vs unit max ratings | Site owner / engineering |
| C6 | Installation, commissioning, and interconnection plan | Method, duration, utility approval path, resource plan | Engineering / contractor |
| C7 | Site B route study (if B1 or B2 pursued) | Civil feasibility and cost for B1, or product/lead-time evidence for B2 | Engineering / procurement |
| C8 | Clearance and tolerance confirmation | Re-survey or vendor installation drawing showing required clearance at Site B | Site owner / vendor |

C2 and C3 are **independent** Site B gates. Passing one does not release Site B; both must be satisfied, along with C1, C4, C5, C6, and C7/C8 as applicable.

### 9.2 RFI / RFQ questions

**To all vendors**

1. Provide the current 2026 coastal certificate, including certificate number, issuing body, standard, test severity, covered models, and expiry date.
2. Provide the full coastal-rated warranty document, including term, start date, exclusions, and site applicability.
3. Provide a priced quote at the required quantity, with currency, tax basis, freight terms, installation/commissioning scope, and validity date.
4. Confirm the unit's admissible ambient minimum and maximum, the test conditions behind those values, and any performance derating.
5. Confirm the offered model's width, required installation clearance, and whether the model is available in a width compatible with a 700 mm corridor.
6. Confirm the lead time for the exact offered model; do not rely on the table value for a different model.

**To the site owner**

1. Confirm the 700 mm Site B measurement's scope, tolerance, and whether it includes installation clearance.
2. Provide design maximum ambient temperatures for Sites A and B.
3. Confirm whether widening/re-routing the Site B corridor is physically and commercially feasible, and provide a civil/structural assessment.
4. Confirm unit quantities and load/availability requirements for each site.
5. Confirm the budget authority, delegated threshold, and approval route.
6. Provide interconnection, permitting, and site-access constraints.

### 9.3 Re-check requirement

`inbox/` must be re-checked immediately before any final decision or contract award. A new measured width, certificate, or cost file supersedes the corresponding assumption or missing item in this package. An inbox item is evidence only to the extent its own text states; a claim about a future certificate is still not a certificate.

---

## 10. Evidence ledger and source register

### 10.1 Claim ledger

| Claim used in this package | Class | Source | Treatment |
|---|---|---|---|
| Site A design minimum is −12 °C | Declared | `sources/sites.md:3` | Accepted as design input |
| Site A maximum admissible width is 1200 mm | Declared | `sources/sites.md:3` | Accepted as design constraint |
| Site A has no coastal requirement | Declared | `sources/sites.md:3` | Accepted |
| Site B design minimum is −4 °C | Declared | `sources/sites.md:4` | Accepted as design input |
| Site B coastal-rated warranty is binding | Declared | `sources/sites.md:4` | Accepted as mandatory pass/fail requirement |
| Site B corridor baseline is 1200 mm | **Assumption** | `sources/sites.md:4` | **Superseded** by the measured 700 mm; not used |
| Site B measured width is 700 mm (survey 2026-11-03) | **Measured** | `inbox/2026-11-03/corridor-measurement.md:3` | Accepted as the governing Site B width |
| The 1200 mm corridor value is superseded | Declared | `inbox/2026-11-03/corridor-measurement.md:5` | Applied; 1200 mm not used |
| The 900 mm unit is not admissible at Site B | Declared | `inbox/2026-11-03/corridor-measurement.md:6` | Applied; confirmed by 900 > 700 |
| Solaris-800 and Halcyon-850 also exceed the 700 mm corridor | **Derived** | 800 − 700 = 100 mm; 850 − 700 = 150 mm | Both fail the width screen |
| A 2024 coastal column is not a current 2026 certificate | Declared rule | `sources/sites.md:6` | Applied; any 2024 reference would be rejected |
| An expected certificate is not a certificate on file | Declared rule | `sources/sites.md:6`; `inbox/README.md:4` | Applied; Halcyon claim unverified |
| Kestrel: 5-year warranty; no coastal certification in declared sources | Declared | `sources/vendors.md:3` | Warranty duration noted; coastal evidence absent |
| Solaris: 7-year warranty; no coastal certification in declared sources | Declared | `sources/vendors.md:4` | Warranty duration noted; coastal evidence absent |
| Halcyon: 10-year warranty; 2026 coastal certificate "expected"; none on file | Declared + **unverified claim** | `sources/vendors.md:5` | Warranty noted; certificate claim not accepted |
| Kestrel-900: −20/45 °C, 900 mm, 8 weeks | Declared | `sources/capacity.csv:2` | Used for screening |
| Solaris-800: −15/40 °C, 800 mm, 10 weeks | Declared | `sources/capacity.csv:3` | Used for screening |
| Halcyon-850: −10/35 °C, 850 mm, 12 weeks | Declared | `sources/capacity.csv:4` | Used for screening; fails Site A cold screen |
| No cost, quantity, or budget data in the repository | **Missing** | `sources/`, `inbox/` | No budget number produced |
| No current 2026 coastal certificate on file | **Missing** | `sources/vendors.md` | Site B coastal gate fails |
| No Site B unit fits the measured corridor | **Derived / measured** | `capacity.csv`; `inbox/2026-11-03/corridor-measurement.md` | All listed units fail width |
| No delegated spend authority or approved budget | **Missing** | Repository has no authority record | No authority evidenced; commitment not authorized |

### 10.2 Source register

| File | SHA-256 |
|---|---|
| `TASK.md` | `1C797E519D1523D2135BD70741B2D4BD42FB42E3D2732EE50883772FD408CDB8` |
| `sources/capacity.csv` | `CE2687AAA543F5CBF9D9F347F70518108DD35D5497B11579192D6C17AD201B45` |
| `sources/sites.md` | `3EF3F4F242DBCD1AF19649D9691FF76A75FE8E7B77BB84DF0A8A9E0BB15AD264` |
| `sources/vendors.md` | `D96DEB8B470B14E57E53A03BF650429207139D0C59EB04F9A57CB75F60485F96` |
| `inbox/README.md` | `7574296AA85DC1ADAA3F393F2A2E26B345CE44FF23B6FF303FC9D4D2CA2AD376` |
| `inbox/2026-11-03/corridor-measurement.md` | `95EA22CFE01E4CE07D5D4337EAF19996F07F2EBBB57626D7445F4EF68DC6299E` |
| `.gitignore` | `32B4769342205D9CBE44BC44BAB4B08F0DB83D53D44C6EF1B8C655A26B362B1D` |

Git revision at review: `9b8a94ee6ef1662b4b426f6cdb6b4ebd3c852a9e` (`master`, `scenario base`). The only commit contains `TASK.md`, `.gitignore`, and `sources/`; `inbox/`, `deliverables/`, and `.palimpsest/` are untracked in that commit, and `.gitignore` excludes `inbox/`.

### 10.3 Assumptions and methods introduced by this package

| ID | Assumption / method | Why it is needed | How it is bounded |
|---|---|---|---|
| A-01 | `min_c`/`max_c` are admissible ambient operating limits | Column names imply it; test conditions are not stated | Screening only; confirm datasheet conditions before award |
| A-02 | Unit width is the governing width for the site screen; installation clearance is additional and unstated | No clearance data exists | No exact-fit assumption; clearance confirmation is condition C8 |
| A-03 | No unit quantity is assumed | No quantity data exists | Quantities remain variables `N_A`, `N_B`; cost model is per-unit |
| A-04 | No procurement date is assumed | No schedule date is sourced | Schedule is expressed as `PO date + sourced lead time`; no energization date is committed |

### 10.4 Revision and re-check record

| Date | Event | Result |
|---|---|---|
| 2026-11-03 | Site B corridor survey recorded in `inbox/` | Measured 700 mm; 1200 mm assumption superseded; 900 mm unit not admissible |
| 2026-11-05 | Re-checked `inbox/` and all repository sources; package prepared | All three listed units fail the Site B width screen; no current 2026 certificate on file |
| 2026-11-05 | Evidence cut-off and package finalized | **HOLD — verification only; Site A shortlist, Site B no eligible unit** |

---

*This package is decision support, not an authorization to spend. Any award, purchase order, or contract requires the written authority and budget approval described in Sections 5 and 9. The measured Site B width (700 mm) and the absence of a current 2026 coastal certificate are facts that no commercial negotiation can cure on their own.*
