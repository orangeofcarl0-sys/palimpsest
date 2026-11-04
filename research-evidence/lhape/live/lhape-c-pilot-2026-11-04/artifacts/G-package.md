# Multi-Site Energy Deployment — Review Package

| Field | Value |
|---|---|
| Package | Multi-site energy deployment, review package v1.1 |
| Base commit | `948f5c30854404ee87356e29423abe15190ba983` |
| Scope of this package | Technical capacity, vendor compliance, cost/budget, schedule, risk/uncertainty, integrated decision |
| Sites in scope | Site A (cold, inland envelope); Site B (cold + binding coastal requirement) |
| Decisions in force | None. No prior decision is on record; this package binds nothing. |
| Prepared by | Work worker (analysis only — no settlement, verification or approval authority) |
| Package status | **REVIEWABLE — NOT APPROVABLE FOR EXPENDITURE** (see §9) |
| Files changed | `deliverables/package.md` (only; the inbox measurement is an input, not a work output) |

> **Bottom line.** Site A has two technically eligible units and can advance to a priced quote — but not to an order, because no price data exists. Site B is **infeasible as scoped**: the corridor was measured at **700 mm** on 2026-11-03, so no offered unit (800 / 850 / 900 mm) is width-admissible, and independently **no vendor holds a current coastal certificate**. No budget can be set from the declared sources, so **no expenditure is approved by this package**. Every figure below is either arithmetic on sourced or measured values, or explicitly marked as an assumption, an unverified claim, or a gap.

---

## 1. Evidence basis, updates and status legend

All content traces to the declared sources — `sources/sites.md`, `sources/vendors.md`, `sources/capacity.csv` — plus the one measured inbox update received during this work. No external catalogue, price list or certificate was consulted or invented.

### 1.1 Evidence updates received

| Received | Item | Content | Effect on this package |
|---|---|---|---|
| 2026-11-03 | `inbox/2026-11-03/corridor-measurement.md` | Site B corridor **measured at 700 mm**; the 1200 mm value was an assumption and is superseded; "the 900 mm unit is NOT admissible at site B". | **Applied.** Replaces the 1200 mm assumption (R6). All three units now exceed the measured width; Site B compliance outcome changes from "unverified width" to "no admissible unit". See §4.3, §5.1, §9. |

The inbox was re-checked at finalisation: `inbox/README.md` plus the 2026-11-03 measurement above were present, and no other update was found. The inbox states that a claim about a future certificate is not a certificate; that rule is applied in §5.2.

### 1.2 Status legend

| Tag | Meaning |
|---|---|
| **[S]** | Stated in a declared source file. |
| **[M]** | Measured value from an inbox update (authoritative for the measured quantity; date-stamped). |
| **[D]** | Derived by arithmetic from [S]/[M] values. Reproducible from the tables. |
| **[A]** | Assumption — planning placeholder only, **not** a measurement and **not** evidence. |
| **[C]** | Claim made by a party but **unverified** — not accepted, not usable for compliance. |
| **[G]** | Gap — required input absent from all declared sources. |

---

## 2. Executive summary

### 2.1 Deciding constraint per site (required statement)

| Site | Deciding constraint | Effect on the field | Status |
|---|---|---|---|
| **Site A** | **Design minimum temperature of −12 °C** [S] | Eliminates Halcyon-850 (rated −10 °C, short by 2 K) [D]; leaves Kestrel (+8 K) and Solaris (+3 K) [D]. Width (1200 mm admissible) and coastal rating are **not** binding: every candidate is 800–900 mm and Site A has no coastal requirement [S]. | Constraint identified and satisfied by 2 of 3 units |
| **Site B** | **Measured corridor width of 700 mm** [M] — this is what decides today's disposition | Excludes **every** offered unit: Kestrel 900 mm (+200 mm over), Halcyon 850 mm (+150 mm), Solaris 800 mm (+100 mm) [D] — before any allowance for installation clearance. Cold (−4 °C) is satisfied by all three (16 / 11 / 6 K margins) [D]. | **No admissible unit — site infeasible as scoped** |
| **Site B — second, independently binding condition** | **Current coastal-rated warranty certificate** [S] | Also fails: Kestrel and Solaris hold none in the declared sources, and Halcyon's 2026 certificate is only 'expected', with nothing on file [C]. A 2024 coastal column would not be current either. | **Unsatisfied — must be closed even if width is solved** |

**Why width is named as the deciding constraint at Site B.** It is a measurement, not a claim, and it is vendor-independent: no certificate, waiver or price negotiation changes 700 mm of corridor. Coastal certification is a binding requirement that is also unsatisfied and that would gate any future re-scope, but on its own it would still leave candidate units to choose between. The width measurement is what removes the field.

### 2.2 Package-level position

1. **Site A:** conditional go to *quote stage* only — Kestrel-900 primary, Solaris-800 qualified alternate, Halcyon-850 excluded on cold capability.
2. **Site B:** **no-go as scoped.** 700 mm measured corridor excludes all three units; independently, no vendor holds a current coastal certificate. Halcyon's 'expected' certificate cannot be treated as one, and a 2024 coastal column is not current for 2026.
3. **Cost:** the budget is **unestablished**. The declared sources contain no unit price, freight, installation, commissioning, spares or O&M cost — only lead times and warranty terms. No expenditure is approved here; none is within this worker's authority.
4. **Schedule:** floored by sourced lead times (8 / 10 / 12 weeks) plus unsourced installation and commissioning durations. Site B has no startable schedule, and its remedy (corridor works or unit re-specification) has no duration, cost or authority attached to it.
5. **Nothing in this package authorises a purchase order, civil works, a requirement waiver, or a budget commitment.**

---

## 3. Requirement set and its evidence

| ID | Site | Requirement | Source status | Binding? |
|---|---|---|---|---|
| R1 | A | Design minimum temperature −12 °C | [S] sites.md | Yes — technical |
| R2 | A | Maximum admissible unit width 1200 mm | [S] sites.md | Yes — technical |
| R3 | A | No coastal requirement | [S] sites.md | Explicitly not applicable |
| R4 | B | Design minimum temperature −4 °C | [S] sites.md | Yes — technical |
| R5 | B | Coastal-rated warranty is binding | [S] sites.md | Yes — compliance |
| R6 | B | Admissible corridor width — **measured 700 mm** | [M] inbox 2026-11-03; supersedes the 1200 mm [A] baseline | Yes — technical, decisive |
| R7 | B | Coastal evidence must be a **current** certificate; a 2024 coastal column is not a current 2026 certificate | [S] sites.md, inbox/README.md | Yes — evidence standard |
| R8 | B | An expected certificate is not a certificate on file | [S] sites.md, inbox/README.md | Yes — evidence standard |

**Note on R6.** `sites.md` carried 1200 mm as "an ASSUMPTION, not a measurement". The 2026-11-03 survey replaced it with 700 mm and states the 900 mm unit is not admissible. Because 700 mm is below the narrowest unit (800 mm), the change is not a refinement of the sizing — it inverts the Site B conclusion. The superseded assumption is retained in §5.2 for audit.

**Open requirement gaps [G].** The sources give no design *maximum* ambient temperature, no site load/demand, no unit quantity, no redundancy or availability requirement, no electrical interface data, and no noise/emissions/refrigerant constraints. Hot-side compliance therefore **cannot be verified** (§4.5), and this package cannot certify system-level capacity.

---

## 4. Technical capacity assessment

### 4.1 Unit envelope

| Unit | Min operating temp | Max operating temp | Unit width | Lead time | Warranty |
|---|---|---|---|---|---|
| Kestrel-900 | −20 °C | 45 °C | 900 mm | 8 weeks | 5 years |
| Solaris-800 | −15 °C | 40 °C | 800 mm | 10 weeks | 7 years |
| Halcyon-850 | −10 °C | 35 °C | 850 mm | 12 weeks | 10 years |

Capability values [S] `sources/capacity.csv`; warranty terms [S] `sources/vendors.md`.

### 4.2 Site A screening (design minimum −12 °C, width ≤ 1200 mm, no coastal requirement)

| Unit | Cold margin vs −12 °C [D] | Cold result | Width margin vs 1200 mm [D] | Width result | Overall |
|---|---|---|---|---|---|
| Kestrel-900 | **+8 K** (−20 vs −12) | Pass | 300 mm | Pass | **Eligible — primary** |
| Solaris-800 | **+3 K** (−15 vs −12) | Pass (thin) | 400 mm | Pass | **Eligible — alternate** |
| Halcyon-850 | **−2 K** (−10 vs −12) | **Fail** | 350 mm | Pass | **Ineligible** |

Halcyon's failure is a *design-envelope* failure, not a performance shortfall: the unit's rated minimum sits above the site design minimum, so no derating, setpoint or operating procedure closes the gap without a rating change from the vendor. Its 10-year warranty and its 'expected' 2026 coastal certificate are irrelevant at Site A — one is commercial, the other unverified and not required here.

### 4.3 Site B screening (design minimum −4 °C, measured width 700 mm, coastal binding)

| Unit | Cold margin vs −4 °C [D] | Cold result | Width vs measured 700 mm [D] | Width result | Coastal evidence | Overall |
|---|---|---|---|---|---|---|
| Kestrel-900 | **+16 K** | Pass | 900 mm — **200 mm over** | **Fail** | None in sources | **Ineligible** |
| Solaris-800 | **+11 K** | Pass | 800 mm — **100 mm over** | **Fail** | None in sources | **Ineligible** |
| Halcyon-850 | **+6 K** | Pass | 850 mm — **150 mm over** | **Fail** | 'Expected' 2026, none on file [C] | **Ineligible** |

Site B is not a close call, and it is not a documentation problem. The narrowest unit in the field is 100 mm wider than the measured corridor before installation clearance, so the site cannot accommodate any offered product. The 1200 mm baseline would have implied a 300–400 mm margin; the measurement removes that margin and reverses the conclusion. Cold capability — the one envelope parameter where all three units are comfortable — is irrelevant to the outcome.

The measurement's own wording singles out the 900 mm unit as not admissible; the same arithmetic excludes the 850 mm and 800 mm units as well, and installation clearance would only widen the shortfall. Any proposal that retains a Site B unit must therefore include a physical corridor remedy or a unit smaller than the corridor with clearance — neither exists in the declared field.

### 4.4 Why the deciding constraints differ between sites

The two sites share one vendor field but invert which requirement bites. Site A is limited by cold capability: Halcyon drops out at −12 °C, and the survivors are ranked by margin. Site B is limited by the 700 mm measurement, which eliminates the whole field before coastal compliance is even reached — and coastal compliance would eliminate it again independently. A single "best unit" answer across both sites would be wrong on both counts: Kestrel is the best technical fit at Site A and physically inadmissible at Site B. Any package naming one winner for both sites has silently traded a binding requirement for warranty length or lead time.

### 4.5 Capacity gaps and the width decision branch

- **Unit quantity per site** is not stated, so no total installed capacity (kW) can be computed.
- **Site load / demand profile** is not stated, so no capacity adequacy or margin can be established — eligibility here means only that a unit's envelope fits the site's stated conditions.
- **Design maximum ambient** is not stated for either site, while the units carry max ratings of 45 / 40 / 35 °C. Hot-side suitability is unverified for all three units.
- **Redundancy (N+1), part-load behaviour, controls integration and electrical interface** are absent; these drive both capacity and cost and cannot be assumed.

**Width decision branch at Site B (recorded, now resolved).** The branch points below were prepared before the measurement arrived; the measured 700 mm falls below the floor, so the branch is decided — **no admissible unit**.

| Admissible width | Units width-feasible | Status |
|---|---|---|
| ≥ 900 mm + clearance | Kestrel, Solaris, Halcyon | Not the measured case |
| 850–899 mm | Solaris, Halcyon | Not the measured case |
| 800–849 mm | Solaris only | Not the measured case |
| < 800 mm | None | **Measured: 700 mm → this branch** |

The branch table is retained because it is the cheapest way for a reviewer to confirm the conclusion without re-deriving it: 700 mm is 100 mm below the lowest branch boundary.

---

## 5. Vendor compliance assessment

### 5.1 Compliance matrix

| Requirement | Kestrel | Solaris | Halcyon |
|---|---|---|---|
| Site A cold (−12 °C) | ✅ −20 °C | ✅ −15 °C (3 K margin) | ❌ −10 °C |
| Site A width (≤ 1200 mm) | ✅ 900 mm | ✅ 800 mm | ✅ 850 mm |
| Site A coastal | n/a (not required) | n/a | n/a |
| Site B cold (−4 °C) | ✅ −20 °C | ✅ −15 °C | ✅ −10 °C |
| **Site B width (≤ 700 mm measured)** | ❌ 900 mm | ❌ 800 mm | ❌ 850 mm |
| **Site B coastal-rated warranty (binding)** | ❌ none in sources | ❌ none in sources | ❌ unverified claim only |
| Warranty term (commercial, not a compliance criterion) | 5 years | 7 years | 10 years |

Legend: ✅ satisfied by sourced/measured data · ❌ not satisfied or not evidenced.

Every vendor now fails Site B on two independent rows — width and coastal — so no ordering by "least non-compliant" is meaningful.

### 5.2 Coastal evidence standard applied

To satisfy R5/R7/R8 a submission must contain a **certificate on file** that is (a) current as of the 2026 deployment, (b) issued for the specific unit model offered, (c) issued by a recognised body against a named coastal/corrosion standard, and (d) accompanied by the warranty document that carries the coastal rating. No vendor meets (a)–(d) on the declared record.

**Rejected or superseded inputs — recorded so reviewers can see what was *not* accepted:**

| Input | Why rejected | What would make it usable |
|---|---|---|
| "Halcyon says a 2026 coastal certificate is 'expected'" | An expectation is a statement of intent, not a certificate; nothing is on file [S]. Treated as [C], never scored as compliance. | Certificate on file with number, issuing body, issue/expiry dates, model coverage, standard, plus coastal warranty text. |
| A 2024 coastal column / listing | A 2024 column is not a current 2026 certificate; currency is part of the requirement [S]. | A current (2026) certificate, or a documented statement of continued validity from the issuer. |
| Site B 1200 mm corridor baseline | Was an assumption, not a measurement [S]; **superseded by the 2026-11-03 survey at 700 mm** [M]. | Already resolved — measurement on file. |
| Warranty length as a proxy for coastal suitability | 10 years is a duration, not a coastal rating; the two are not interchangeable. | Coastal-rated warranty wording covering the offered model. |
| "The 900 mm unit is the only problem" reading of the survey | Arithmetic: 850 mm and 800 mm also exceed 700 mm [D]. The survey's sentence is a sufficient, not an exhaustive, statement of exclusions. | A unit at or below the measured width with installation clearance. |

### 5.3 Vendor status summary

- **Kestrel** — eligible at Site A (best cold margin, 8 K; 8-week lead; 5-year warranty). Excluded from Site B on width (900 mm vs 700 mm) and on coastal evidence. Commercial position unknown.
- **Solaris** — eligible at Site A with a thin 3 K cold margin; 10-week lead; 7-year warranty. Excluded from Site B on width (800 mm) and coastal evidence. It is the alternate at Site A because margin, not price, can be compared today.
- **Halcyon** — ineligible at Site A on cold rating; ineligible at Site B on width and on evidence. Longest warranty (10 years) and longest lead (12 weeks) in the field; neither offsets two failed binding requirements. **Do not shortlist it on the strength of the 'expected' certificate.**

---

## 6. Cost and budget model

### 6.1 Data availability (the decisive finding for cost)

The declared sources contain **no monetary data of any kind**: no unit price, freight, installation, commissioning, spares, maintenance, energy, or currency/tariff figures. The only commercial quantities available are **lead time (weeks)** and **warranty term (years)**. Consequently:

- A budget cannot be set.
- Vendors cannot be ranked on cost.
- Any numeric total in this document would be fabricated, so none is given.

This is a package defect to be closed before an expenditure decision, not a presentational gap.

### 6.2 Cost breakdown structure to be priced (parametric, all terms open)

```
Total cost of ownership (per site, over the analysis period)
  = n × (Unit price [G] + Freight & logistics [G] + Duties/currency adjustment [G])
  + Installation & civil works [G]          # Site B now also needs corridor remedy [G]
  + Commissioning & controls integration [G]
  + Spares & consumables [G]
  + Maintenance/service outside warranty [G]
  + Energy/operating cost over the analysis period [G]
  + Risk allowance (see §8) [G]
```

Where `n` = unit count per site, itself **[G]**. The model is linear in an unknown quantity with unknown coefficients — which is why no budget figure can be defended today.

### 6.3 What the sources *do* tell us about cost drivers

| Driver | Sourced / measured value | Cost consequence | Status |
|---|---|---|---|
| Lead time | 8 / 10 / 12 weeks (Kestrel / Solaris / Halcyon) | Longer lead extends site readiness, storage, float and financing exposure; magnitude unpriced. Halcyon's 12 weeks is unusable at either site (non-compliant at A on cold, at B on width). | [S] fact, [G] cost |
| Warranty term | 5 / 7 / 10 years | Longer warranty shifts lifecycle risk to the vendor, usually at a premium; the premium cannot be tested without prices. | [S] fact, [G] cost |
| Coastal certification | absent for all | Site B needs a compliant vendor or a re-scope; both change cost, neither is priced. | [S] fact, [G] cost |
| Corridor remedy at Site B | measured 700 mm vs 800–900 mm units | Now a **real** civil-works / re-specification cost line, not a contingency: widening a corridor is capital works requiring separate authority and budget. Unpriced and unauthorised. | [M] fact, [G] cost |

### 6.4 Budget position

| Item | Position |
|---|---|
| Approved budget | **None.** No budget authority is exercised by this package; no expenditure is approved. |
| Cost estimate | **Not established.** No prices and no quantities in declared sources. |
| Contingency | Cannot be sized without a base estimate; Site B's corridor remedy is not yet even scoped. |
| Commercial recommendation | RFQ to Kestrel and Solaris for Site A requesting firm unit price, freight, installation, commissioning, spares, service rates and warranty exclusions. For Site B, first establish whether a corridor remedy is feasible and authorised — an RFQ to compliant vendors is pointless until a unit physically fits. |

**Explicit non-approval.** Nothing in this section authorises spend, a purchase order, civil works, a letter of intent or a budget reservation. A costed business case must return for approval once prices and the Site B feasibility question are resolved.

---

## 7. Implementation schedule

### 7.1 Sourced timing facts

Only one duration class is sourced: **manufacturing/delivery lead time** — Kestrel 8 weeks, Solaris 10 weeks, Halcyon 12 weeks [S]. Installation, commissioning, permitting, site works and corridor remedy durations are **not** in the sources [G]; they appear as named placeholders, not invented numbers.

### 7.2 Site A — indicative sequence from award (T0 = purchase order)

| # | Activity | Timing | Source status |
|---|---|---|---|
| A1 | Close-out of quote evaluation and budget approval | Before T0 | Gate — **not yet met** (§9.2) |
| A2 | Purchase order / award to Kestrel-900 (primary) | T0 | Decision D1 (§9.1) |
| A3 | Manufacture and delivery to site | T0 + 8 weeks | [S] lead time |
| A4 | Site preparation and installation | T0 + 8 weeks → + D_inst,A | [G] duration |
| A5 | Commissioning, controls integration, acceptance test | after A4, duration D_cx,A | [G] duration |
| A6 | Handover and warranty start | after A5 | [D] |

**Earliest credible delivery to site: T0 + 8 weeks** with Kestrel; T0 + 10 weeks with the Solaris alternate [S]. Total project duration is *not* determinable because D_inst and D_cx are unsourced; no float is claimed. If Solaris is substituted, add 2 weeks to A3 [D], and note the 3 K cold margin may justify extra commissioning verification.

### 7.3 Site B — blocked before scheduling

| # | Activity | Timing | Status |
|---|---|---|---|
| B1 | Obtain a current 2026 coastal certificate on file (any vendor) with covered model and coastal warranty text | Should start immediately | **Open — blocking** |
| B2 | Measure the corridor | Done: 700 mm on 2026-11-03 [M] | **Closed — fail (all units exceed)** |
| B3 | Establish a width remedy: corridor works with clearance, or a unit ≤ 700 mm with clearance | After B2 result | **Open — blocking, no duration/cost/authority assigned** |
| B4 | RFQ, evaluation, award once B1 and B3 are satisfied | After B1/B3 | Cannot start — zero compliant bidders |
| B5 | Manufacture/delivery | Award + 8/10/12 weeks depending on vendor | [S] lead time, vendor-dependent |
| B6 | Installation, commissioning, handover | after B5 | [G] duration |

**Site B schedule status: indeterminate and currently unbounded.** The vendor that would set the lead time does not exist in the compliant and width-admissible set, and the corridor remedy has no programme, price or approval path. Any Site B date offered today would be an assumption dressed as a plan. B1 remains worth starting in parallel because it is cheap, independent, and would be needed for any future re-scope; B2 is closed and should not be re-opened unless the physical corridor changes.

### 7.4 Schedule risks

- Lead time is quoted to *delivery*, not *energisation*; the gap is unpriced and unscheduled [G].
- Site B's front-end delay is unbounded: certificate lead time is vendor/issuer dependent and the width remedy is unscoped.
- A corridor remedy, if pursued, will likely require outage planning and building works — neither costed nor scheduled, and outside this package's authority.
- Single-source exposure at Site A: only Kestrel and Solaris are eligible, and Solaris's 3 K margin makes substitution a performance decision, not a drop-in swap.

---

## 8. Risk and uncertainty review

### 8.1 Risk register (likelihood/impact are analyst judgement, not sourced data)

| ID | Risk | Basis | L | I | Rating | Mitigation / owner |
|---|---|---|---|---|---|---|
| R-01 | **Site B physically infeasible** — measured 700 mm corridor excludes every unit | [M] 700 mm vs 800–900 mm units | High | High | **Critical (realised)** | Scope a corridor remedy (works + clearance) or re-specify a smaller unit; both need engineering, budget and authority. Owner: site engineering + package owner. |
| R-02 | **Site B has no compliant coastal vendor** — binding requirement unmet | [S] no cert for Kestrel/Solaris; Halcyon unverified | High | High | **Critical** | Current 2026 certificate on file, or a documented requirement waiver from the requirement owner. Owner: procurement + requirement owner. |
| R-03 | 'Expected' certificate treated as fact and an award made on it | [S]/[C] Halcyon claim | Medium | High | **High** | Evidence gate: no award without certificate on file (number, issuer, dates, model, standard, warranty text). Owner: procurement. |
| R-04 | A 2024 coastal column accepted as a current certificate | [S] currency rule | Medium | High | **High** | Date/currency check at submission; reject anything not current for 2026. Owner: compliance reviewer. |
| R-05 | Corridor remedy costs/schedule exceed the value of the Site B deployment | [M] + [G] | Medium | High | **High** | Treat Site B as an options study: remedy cost vs relocation vs deferral, before any commitment. Owner: package owner. |
| R-06 | Site A cold margin too thin (Solaris 3 K) causing derating or shortfall in a cold snap | [D] margin | Medium | Medium | **Medium** | Prefer Kestrel (8 K); if Solaris is used, require low-ambient evidence and cold-start verification at commissioning. Owner: package engineering. |
| R-07 | No cost data → budget set on guesswork, over- or under-commitment | [G] | High | High | **Critical** | RFQ with firm pricing before any approval; no estimate presented as a budget. Owner: finance. |
| R-08 | Hot-side suitability unverified (no design max ambient in sources) | [G] | Medium | Medium | **Medium** | Obtain site design maximum; compare to 45 / 40 / 35 °C ratings before selection. Owner: site engineering. |
| R-09 | Lead-time slip or single-source dependency delays Site A energisation | [S] leads, [G] install durations | Medium | Medium | **Medium** | Dual-source Site A (Kestrel/Solaris); set float once install durations are known. Owner: procurement + scheduler. |
| R-10 | Warranty shorter than intended asset life (Kestrel 5 yr) creates lifecycle cost exposure | [S] warranty terms | Medium | Medium | **Medium** | Price extended warranty / service contract in the RFQ; compare total cost of ownership. Owner: finance. |
| R-11 | Quantity and load unknown → system sized on assumption | [G] | High | Medium | **High** | Establish unit count and demand profile before final selection. Owner: site engineering. |
| R-12 | Unrecorded assumption re-entering the decision record (the 1200 mm value had this property) | Process; [M] showed a 500 mm error | Medium | Medium | **Medium** | This package tags every non-sourced value [A]/[C]/[G]; measurements must carry a date and surveyor. Owner: package owner. |

### 8.2 Uncertainty log (what would change the decision)

| ID | Uncertainty | Current handling | What resolves it | Decision impact |
|---|---|---|---|---|
| U-01 | Coastal certificate availability/currency | Treated as absent for all | Certificate on file from any vendor | Necessary but **not sufficient** at Site B while width fails |
| U-02 | Site B corridor width | **Closed:** measured 700 mm [M] | — | Removes all units; makes Site B infeasible as scoped |
| U-03 | Cost of a Site B width remedy (works, outage, approval) | Not scoped | Engineering option study with costed alternatives | Decides whether Site B proceeds, relocates, or defers |
| U-04 | Unit price, freight, install, O&M | Absent | Vendor quotes | Required before any budget approval |
| U-05 | Unit quantity and site load | Absent | Site design documents | Changes capacity totals and cost linearly |
| U-06 | Design maximum ambient | Absent | Site design conditions | Could eliminate a unit on hot-side rating |
| U-07 | Installation/commissioning durations | Absent | Contractor programme | Sets the real completion date; lead time alone does not |
| U-08 | Coastal warranty scope and exclusions | Absent for all | Warranty documents | Determines whether a certificate alone would suffice |
| U-09 | Currency, duties, tariff exposure | Absent | Commercial terms | Affects total cost and vendor ranking |

**Correlation note.** R-01, R-02 and R-07 are the conditions that make the package non-approvable. Treating them as ordinary risks ("monitor and proceed") would be a category error — they are gates (§9.2), not watch items.

---

## 9. Integrated decision

### 9.1 Site decisions

**D1 — Site A: CONDITIONAL GO to priced-quote stage; no order.**
- Primary: **Kestrel-900** (+8 K cold margin, 900 mm, 8-week lead, 5-year warranty).
- Qualified alternate: **Solaris-800** (+3 K cold margin, 800 mm, 10-week lead, 7-year warranty) — only with low-ambient evidence and a commissioning cold-start check.
- Excluded: **Halcyon-850** — rated minimum −10 °C against a −12 °C design minimum; no derating or procedure closes a 2 K envelope gap.
- Deciding constraint: **−12 °C design minimum temperature**.
- Conditions: firm pricing; hot-side design maximum confirmed against the unit's max rating; quantity/load confirmed.

**D2 — Site B: NO-GO as scoped; no award, no order, no schedule baseline.**
- **Deciding constraint: measured 700 mm corridor width** [M] — no offered unit fits, before clearance.
- **Independently binding and also unsatisfied: a current coastal-rated warranty certificate** [S] — none on file for any vendor; Halcyon's is an expectation, not a document.
- Neither condition can be waived by this package. A coastal waiver would not fix 700 mm; a corridor remedy would not produce a certificate.
- Re-entry conditions: (i) a width remedy proven feasible, authorised and costed (corridor works with clearance, or a unit ≤ 700 mm with clearance and the right ratings); (ii) a current 2026 coastal certificate on file covering the offered model, with the coastal warranty text; (iii) then re-run §5 against both.
- No Site B expenditure, works or waiver is proposed or authorised here.

**D3 — Package: NOT APPROVED for expenditure.**
Reasons, in order of severity:
1. No cost data exists in the declared sources — a budget cannot be set or defended.
2. Site B is physically infeasible as scoped (700 mm measured), with the coastal requirement also unmet.
3. Load, quantity, hot-side design conditions and installation durations are unknown, so system capacity and completion date cannot be certified.

**D4 — What this package *is*:** a reviewable, traceable basis for the next decision — RFQ and price Site A, establish whether a Site B width remedy exists and is affordable, obtain coastal evidence, and return with priced, evidence-backed options. It commits no funds, selects no Site B vendor, and accepts no unverified claim as fact.

### 9.2 Gates before any commitment (in order)

| Gate | Condition | Evidence required | Owner | Status |
|---|---|---|---|---|
| G1 | Site B width remedy | Feasibility, cost and authorisation for corridor works, or a compliant unit ≤ 700 mm with clearance | Site engineering + budget holder | **Open — decisive** |
| G2 | Site B coastal evidence | Current 2026 certificate on file + coastal warranty text for the offered model | Procurement / compliance | **Open** |
| G3 | Priced offers, Site A | Firm unit price, freight, install, commissioning, spares, service, warranty exclusions | Procurement | **Open** |
| G4 | Costed business case | Total-cost model per §6.2, contingency sized on real numbers | Finance / package owner | Not started |
| G5 | Site data completeness | Quantity, load profile, design max ambient, install/commissioning durations | Site engineering | **Open** |
| G6 | Budget approval | Named authority signs the costed case | Budget holder | **Not sought** |

Only G6 can authorise expenditure, and it is outside this worker's authority. G1 and G2 are independent; both must close before Site B can be re-evaluated. G3 can proceed now for Site A.

### 9.3 Standing statement of limits

- No unverified claim has been promoted to accepted fact; §5.2 records what was rejected and why.
- A 2024 coastal column was not treated as a current 2026 certificate; an 'expected' certificate was not treated as a certificate on file.
- The 1200 mm Site B baseline was treated as an assumption and is now superseded by measurement — not the reverse.
- No expenditure, works or waiver has been approved, reserved or implied.
- Verification of this package against canonical requirements is outside this worker's authority; it is submitted for review as-is.

---

## 10. Reviewer checklist

- [ ] Is the Site A deciding constraint (−12 °C design minimum) named once, unambiguously, with Halcyon excluded on that basis?
- [ ] Is the Site B deciding constraint (measured 700 mm corridor) named, with coastal certification recorded as an independent binding failure rather than the sole reason?
- [ ] Is the 1200 mm value shown as superseded everywhere, and is the 700 mm measurement dated and attributed to `inbox/2026-11-03/corridor-measurement.md`?
- [ ] Does the Site B screen show all **three** units failing width (900 / 850 / 800 mm vs 700 mm), not only the 900 mm unit?
- [ ] Are the 'expected' certificate and any 2024 coastal material recorded as rejected evidence?
- [ ] Is any cost figure present? (Correct answer: no — the sources contain none.)
- [ ] Does any statement approve expenditure, civil works or a waiver? (Correct answer: no.)
- [ ] Are the gates in §9.2 assigned to owners outside this worker's authority?

---

*Prepared against base commit 948f5c30854404ee87356e29423abe15190ba983. Sources: sources/sites.md, sources/vendors.md, sources/capacity.csv; inbox/README.md; inbox/2026-11-03/corridor-measurement.md (applied). Inbox re-checked at finalisation.*
