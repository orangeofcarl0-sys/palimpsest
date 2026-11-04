# Multi-Site Energy Deployment — Reviewable Package

**Package date:** 2026-11-04
**Revision:** Rev 2 — incorporates the measured Site B corridor survey received in `inbox/` (2026-11-03)
**Status:** Recommendation for review — **not an expenditure approval**
**Scope:** Site A and Site B, multi-site energy deployment
**Basis:** `TASK.md`, `sources/sites.md`, `sources/vendors.md`, `sources/capacity.csv`, and the measured update in `inbox/2026-11-03/` (see §9)

---

## 1. Decision summary

| Item | Decision | Basis |
|---|---|---|
| Site A — technical selection | **Conditional go to procurement preparation** | Two vendors meet the stated cold and width limits; one does not |
| Site B — award | **No-go on the current vendor set** | Measured corridor is 700 mm; all three units are 800–900 mm wide and cannot fit. No coastal certificate is on file either |
| Expenditure | **Not approved** | No cost data on file and no delegated financial authority recorded |
| Budget | **Cannot be set** | No prices, quantities, freight, installation, or contingency inputs exist in the record |
| Schedule | **Relative only** | Vendor lead times are sourced; installation/commissioning durations are not, and no award date can be set |

**Headline recommendation.** Take Site A forward to procurement preparation with **Kestrel-900 as the preferred unit** and **Solaris-800 as the technically eligible alternate**; exclude **Halcyon-850** from Site A because its minimum operating temperature of −10 °C does not cover the −12 °C site design minimum. **Stop Site B procurement:** the measured corridor is **700 mm**, narrower than the smallest unit in the vendor set (800 mm), so no current product is admissible there; the unresolved coastal-certificate requirement is a second, independent bar. No purchase order, contract, or budget commitment is authorized by this package.

---

## 2. Evidence standard used in this package

Statements in this package are tagged by the quality of their support where the distinction matters:

| Tag | Meaning |
|---|---|
| **[S]** | Stated in a source file in this repository |
| **[M]** | Measured update received in `inbox/` |
| **[A]** | Assumption — stated as such, not measured |
| **[U]** | Unverified claim — asserted by a vendor or expected in future, no document on file |
| **[?]** | Absent — required input not present in the record |

A measured update supersedes an assumption. It does not need to agree with the assumption to be accepted.

A vendor claim is not upgraded to fact because it is specific or because a certificate is "expected." A certificate is evidence only when the certificate itself is on file, current for 2026, and covers the site and product.

---

## 3. Technical capacity assessment

### 3.1 What the capacity data actually is

`sources/capacity.csv` provides, per unit: minimum operating temperature (`min_c`), maximum operating temperature (`max_c`), unit width (`unit_width_mm`), and delivery lead time (`lead_weeks`). It does **not** provide electrical capacity, rated power, efficiency, energy yield, unit count, or site load. Accordingly, this section assesses **thermal and dimensional suitability only**. System sizing, annual yield, and electrical capacity cannot be assessed from the record.

### 3.2 Site requirements

| Requirement | Site A | Site B | Evidence |
|---|---|---|---|
| Design minimum temperature | −12 °C | −4 °C | [S] `sources/sites.md` |
| Maximum admissible unit width | 1200 mm | **700 mm measured** (survey 2026-11-03); earlier 1200 mm assumption superseded | [S] for A; [M] for B |
| Coastal-rated warranty | Not required | **Binding** | [S] `sources/sites.md` |
| Design maximum temperature | Not stated | Not stated | [?] |
| Required unit count / load | Not stated | Not stated | [?] |

### 3.3 Vendor data

| Unit | Min °C | Max °C | Width (mm) | Lead (weeks) | Warranty | Coastal evidence |
|---|---:|---:|---:|---:|---|---|
| Kestrel-900 | −20 | 45 | 900 | 8 | 5 years [S] | None in declared sources [S] |
| Solaris-800 | −15 | 40 | 800 | 10 | 7 years [S] | None in declared sources [S] |
| Halcyon-850 | −10 | 35 | 850 | 12 | 10 years [S] | 2026 certificate "expected"; **no certificate on file** [U] |

### 3.4 Cold-temperature compliance

A unit is cold-compliant only if its rated minimum is at or below the site design minimum (i.e. at least as cold-capable).

| Unit | Site A (−12 °C) | Margin | Site B (−4 °C) | Margin |
|---|---|---:|---|---:|
| Kestrel-900 | **Pass** (−20 ≤ −12) | 8 °C | **Pass** (−20 ≤ −4) | 16 °C |
| Solaris-800 | **Pass** (−15 ≤ −12) | 3 °C | **Pass** (−15 ≤ −4) | 11 °C |
| Halcyon-850 | **Fail** (−10 > −12) | −2 °C deficit | **Pass** (−10 ≤ −4) | 6 °C |

**Site A:** Halcyon-850 is **not technically eligible**. Its published minimum is 2 °C warmer than the site design minimum. This is a hard exclusion on the declared data, not a preference.

**Site B:** all three units pass the −4 °C cold requirement on declared data.

### 3.5 Width compliance

Site B's corridor has now been surveyed. The measured corridor width is **700 mm** (survey 2026-11-03), and the former 1200 mm figure is an assumption that is **superseded**. The measured value governs.

| Unit | Width | Site A limit 1200 mm [S] | Site B measured 700 mm [M] |
|---|---:|---|---|
| Kestrel-900 | 900 mm | **Pass**, 300 mm headroom | **Fail** — 200 mm too wide |
| Solaris-800 | 800 mm | **Pass**, 400 mm headroom | **Fail** — 100 mm too wide |
| Halcyon-850 | 850 mm | **Pass**, 350 mm headroom | **Fail** — 150 mm too wide |

The decision rule applied to the measured value (a unit fits only if its width is ≤ the measured width *w*):

| Measured width *w* | Kestrel-900 (900 mm) | Solaris-800 (800 mm) | Halcyon-850 (850 mm) |
|---|---|---|---|
| *w* ≥ 900 mm | Pass | Pass | Pass |
| 850 ≤ *w* < 900 mm | **Fail** | Pass | Pass |
| 800 ≤ *w* < 850 mm | **Fail** | Pass | **Fail** |
| *w* < 800 mm | **Fail** | **Fail** | **Fail** |

At *w* = 700 mm the final row applies: **no unit in the current vendor set is admissible at Site B.** The inbox note that the 900 mm unit is not admissible is correct, but the exclusion is broader than that single unit. This is a physical constraint, not a procurement preference, and no coastal certificate can cure it.

The survey states a measured width of 700 mm but does not state a tolerance, method, or drawing reference. The 100 mm margin between 700 mm and the narrowest available unit (Solaris-800) is substantial; the width conclusion would change only if a documented re-survey established a measured width of at least 800 mm. An as-built check before ordering is therefore prudent, but it does not reopen the decision on the present evidence.

### 3.6 Maximum-temperature compliance

No site design maximum temperature is stated, so the `max_c` values (35–45 °C) cannot be tested against a requirement. This is an evidence gap, **not** a pass. It must be closed before unit selection is final because a unit that cannot reject heat at the site's design maximum would be ineligible regardless of its cold rating.

### 3.7 Technical conclusion

- **Site A:** Kestrel-900 and Solaris-800 are thermally and dimensionally eligible. Halcyon-850 is ineligible.
- **Site B:** all units pass the −4 °C cold requirement, but **all fail the measured 700 mm width constraint**, and none has a demonstrated coastal certificate (§4). There is therefore **no technically eligible unit at Site B** from the current vendor set.
- Electrical sizing and unit quantity remain impossible to determine from the record.

---

## 4. Vendor compliance assessment

### 4.1 Binding requirements

For **Site B**, a coastal-rated warranty is binding, and the evidence standard in §2 requires a current 2026 coastal certificate on file to demonstrate that rating. Separately, the measured 700 mm corridor imposes a physical width limit of 700 mm on any unit. The record contains **no current coastal certificate for any vendor**:

- Kestrel: no coastal certification in the declared sources. [S]
- Solaris: no coastal certification in the declared sources. [S]
- Halcyon: states that a 2026 coastal certificate is "expected," but **no certificate is on file**. [U]

An "expected" certificate is a future possibility, not evidence of compliance. A 2024 coastal column, if one were later produced, would not be a current 2026 certificate. No coastal certificate is present in the record for any vendor.

### 4.2 Compliance matrix

| Criterion | Kestrel-900 | Solaris-800 | Halcyon-850 |
|---|---|---|---|
| Site A cold (−12 °C) | **Compliant** | **Compliant** | **Non-compliant** |
| Site A width (≤1200 mm) | Compliant | Compliant | Compliant |
| Site B cold (−4 °C) | Compliant | Compliant | Compliant |
| Site B width (measured 700 mm) | **Fail** (900 mm) | **Fail** (800 mm) | **Fail** (850 mm) |
| Site B coastal-rated warranty | **No evidence** | **No evidence** | **Unverified claim only** |
| Warranty term (differentiator, not a stated requirement) | 5 years | 7 years | 10 years |
| **Site B award status** | **Ineligible — width** | **Ineligible — width** | **Ineligible — width** |

### 4.3 Vendor conclusion

- **Site A:** two technically eligible bidders exist (Kestrel, Solaris), so the process is competitive on the stated technical criteria.
- **Site B:** **zero compliant bidders exist.** All three units are physically too wide for the measured 700 mm corridor, which is a hard exclusion independent of documentation. Separately, none has a current coastal certificate: the 10-year Halcyon warranty is longer than its competitors', but warranty length does not satisfy a coastal-certification requirement. Selecting Halcyon on the strength of an expected certificate would convert an unverified claim into an accepted fact, which this package does not do.
- The absence of coastal evidence is a **documentation failure that may be curable**. The width failure is **not** curable by documentation — it requires narrower equipment, corridor remediation, or a different site. The correct action is a re-scope, not a certificate request alone.

---

## 5. Cost / budget model

### 5.1 Status: not costable from the record

There is **no cost, price, tariff, currency, discount, escalation, or budget data anywhere in the record**. A credible budget cannot be produced by assigning invented numbers. This section therefore provides the **cost structure and the closing actions**, and explicitly withholds a total.

### 5.2 Cost breakdown structure (unpopulated)

Capital expenditure for site *s*:

```
CapEx(s) = n(s) × [ P_unit(s) + C_freight(s) + C_install(s) ]
         + C_BOS(s) + C_civil(s) + C_grid(s) + C_commissioning(s)
         + C_spares(s) + C_contingency(s)
```

Whole-programme cost:

```
Programme = CapEx(A) + CapEx(B) + O&M(A,B) + C_financing + C_tax/duty
```

Year-one operating cost:

```
O&M(s) = n(s) × C_service(s) + C_monitoring(s) + C_insurance(s)
```

### 5.3 Input register

| Input | Needed for | Status | Consequence |
|---|---|---|---|
| Unit price per vendor | CapEx | **[?] not provided** | Cannot compare bids or set budget |
| Unit quantity per site | CapEx, O&M | **[?] not provided** (no load or sizing data) | Cannot scale any cost |
| Freight / delivery to site | CapEx | **[?] not provided** | Landed cost unknown |
| Installation and commissioning rates | CapEx | **[?] not provided** | Labour cost unknown |
| Balance of system, civils, grid connection | CapEx | **[?] not provided** | Major scope unquantified |
| Site B corridor remediation or narrower-unit redesign | CapEx | **[?] not scoped** | New scope created by the 700 mm measurement; cost unknown |
| Contingency policy / risk allowance | Budget | **[?] not provided** | Contingency cannot be set by assumption |
| Currency, tax, duty, escalation | Budget | **[?] not provided** | Totals not comparable |
| O&M, service, insurance, spares | Whole life | **[?] not provided** | Whole-life cost unknown |
| Funding source and delegated limit | Approval | **[?] not recorded** | **No authority to commit funds** |

### 5.4 Budget position

- **Budget total: not established.** Do not read the absence of a number as a low cost.
- **Funds committed: none.**
- **Expenditure approved: none.** This package is prepared without a recorded delegation of financial authority. It may recommend, but it may not authorize spend.
- **Site B cost basis: none.** The 700 mm measurement invalidates the assumed 1200 mm access basis; possible corridor works, narrower units, or relocation are unscoped and would need their own quotations.
- Any figure later inserted into this model must carry a source, date, currency, and validity period; vendor "indicative" prices must be labeled as indicative and must not be treated as firm.

### 5.5 Actions to make the model costable

1. Obtain firm, dated quotations per eligible unit, delivered to each site.
2. Obtain the demand/sizing study to fix unit quantities.
3. Obtain installation, civils, grid-connection, and commissioning quotes.
4. For Site B, scope and price the alternatives: corridor remediation, narrower equipment, or relocation.
5. Have finance set contingency, escalation, tax, and currency conventions.
6. Record the delegated approval limit and approver before any commitment.

---

## 6. Implementation schedule

### 6.1 What is actually known

The only sourced durations are **vendor delivery lead times**: Kestrel 8 weeks, Solaris 10 weeks, Halcyon 12 weeks. These are lead times from order, not total project durations. Site survey, design, permitting, installation, grid connection, and commissioning durations are **not in the record** and are not estimated here.

### 6.2 Gated schedule (relative; week 0 = authorized purchase order)

| Gate | Activity | Site A | Site B | Duration evidence |
|---|---|---|---|---|
| G0 | Authority, budget, and evidence closure | Required | Required | Not scheduled — no approval recorded |
| G1 | Award / PO release | After G0 | After G0 **and** a documented width solution (§8.1) **and** a current 2026 coastal certificate | Not scheduled |
| G2 | Vendor delivery | Week 8 (Kestrel) or week 10 (Solaris) after PO | No delivery basis: no current unit is admissible at 700 mm. Halcyon's 12-week lead applies only if a compliant width route is established | [S] lead times |
| G3 | Installation | Duration not established | Duration not established | [?] |
| G4 | Commissioning / acceptance | Duration not established | Duration not established | [?] |

### 6.3 Critical path and constraints

- **Site A:** authority → PO → 8–10 week delivery → installation (duration unknown). Kestrel shortens delivery by 2 weeks versus Solaris; that is the only schedule difference supported by the record.
- **Site B:** the corridor has now been measured, and the measurement **confirms** the barrier rather than clearing it. At 700 mm, no current unit fits, so a width solution — a narrower unit, corridor remediation, or relocation — now controls the start date. Coastal-certificate verification is a second, independent gate that applies after a width-compliant unit exists.
- No calendar completion date is committed. Any date offered without the missing durations would be fabricated precision.
- Halcyon's 12-week lead time is 2 weeks longer than Solaris and 4 weeks longer than Kestrel; that is a schedule penalty, not a reason by itself to reject it.

### 6.4 Schedule conditions

1. Do not release a purchase order before the G0 authority and budget gate.
2. Do not release a Site B order before a width-compliant solution is documented and the coastal certificate is on file.
3. Re-baseline the schedule once installation and commissioning durations are quoted.

---

## 7. Risk and uncertainty review

### 7.1 Principal uncertainties

| ID | Risk / uncertainty | Type | Rating | Basis | Mitigation / decision rule |
|---|---|---|---|---|---|
| R1 | Halcyon coastal certificate never issued, or issued for a different product/scope | Evidence | **High** | "Expected" is not a certificate [U] | Require the current 2026 certificate on file before any Site B award; verify product and site coverage. A certificate alone does not cure the width exclusion |
| R2 | Site B corridor is narrower than the narrowest unit in the record | Technical | **High — materialized** | Measured 700 mm on 2026-11-03 [M]; narrowest unit 800 mm | **Occurred.** No award on the current vendor set; re-scope to ≤700 mm units, corridor remediation, or relocation |
| R3 | No cost basis, leading to an unfundable or mis-scoped budget | Commercial | **High** | No prices or quantities in the record [?] | Close §5.5 inputs; no budget figure until then |
| R4 | Unit count and electrical sizing unknown | Technical | **High** | No load, demand, or rated-power data [?] | Commission a sizing study; do not infer from `capacity.csv` |
| R5 | Halcyon specified at Site A despite failing the cold limit | Technical | **Medium** | −10 °C vs −12 °C requirement [S] | Hard exclusion at Site A |
| R6 | Thin cold margin for Solaris at Site A (3 °C) | Technical | **Medium** | −15 °C vs −12 °C [S] | Confirm design margin policy; Kestrel offers 8 °C if margin is valued |
| R7 | Design maximum temperature unstated | Technical | **Medium** | Site data absent [?] | Obtain site design maximum and test `max_c` before final selection |
| R8 | Warranty length mistaken for coastal compliance | Evidence | **Medium** | 10-year warranty ≠ coastal rating | Keep warranty as a differentiator only; certificate is the gate |
| R9 | Outdated certificate offered as current | Evidence | **Medium** | 2024 column is not a 2026 certificate | Check issue date and validity; reject stale documents |
| R10 | Installation/commissioning duration and cost unknown | Schedule / commercial | **Medium** | Not in the record [?] | Obtain contractor quotes and re-baseline |
| R11 | Supplier concentration / limited competition at Site B | Commercial | **Medium** | No width-compliant bidder at 700 mm | Market search for narrower units; certificate requests only after a unit is width-eligible |
| R12 | Unauthorized commitment | Governance | **High** | No delegated authority recorded | No PO or contract without recorded approval |
| R13 | Survey tolerance or as-built clearance differs from the 700 mm measurement | Technical | **Low–Medium** | Single measurement; method, tolerance, and drawing reference not stated [M] | 100 mm margin to the narrowest unit; verify as-built before order. Only a documented measured width ≥800 mm would bring a current unit back into contention |

### 7.2 Claim audit

| Statement in the record | Correct treatment |
|---|---|
| Halcyon "says a 2026 coastal certificate is expected" | **Unverified claim.** Not a certificate, not compliance, not an award basis |
| "Baseline corridor value of 1200 mm" at Site B | **Assumption, now withdrawn.** Superseded by the measured 700 mm [M]; must not be used for design or award |
| "The 900 mm unit is NOT admissible at Site B" | **Correct but incomplete.** At 700 mm, the 800 mm and 850 mm units are also inadmissible |
| "A 2024 coastal column is not a current 2026 certificate" | Consistent with this package: currency and document identity must be checked |
| "10-year warranty" | A longer warranty term; it does **not** establish coastal rating |
| `capacity.csv` | Thermal envelope, width, and lead time — **not** electrical capacity |

### 7.3 Residual risk position

Site A's technical risk is moderate and manageable: two technically eligible units, one strong cold margin, and known lead times; the dominant unknowns are cost, sizing, and maximum temperature. Site B now carries a **measured technical exclusion**, not merely an evidence gap: the measured 700 mm corridor is 100 mm narrower than the narrowest unit, so no current product can be installed there. The coastal-certificate gap remains as a second, independent evidence risk that would still block award even if the width were resolved. Proceeding to award at Site B now would require ignoring both a measurement and an unsupported vendor claim, which the evidence standard in §2 prohibits.

---

## 8. Integrated decision

### 8.1 Decision

**Site A — CONDITIONAL GO (preparation only).**
- Preferred: **Kestrel-900** — passes the −12 °C cold limit with 8 °C margin, passes the 1200 mm width limit with 300 mm headroom, and has the shortest sourced lead time (8 weeks).
- Technically eligible alternate: **Solaris-800** — passes cold (−15 °C, 3 °C margin) and width (800 mm); 10-week lead; 7-year warranty. Use if its quoted cost or availability is materially better.
- **Excluded: Halcyon-850** — minimum −10 °C does not cover the −12 °C design minimum.
- This is a recommendation to prepare a procurement package, **not** authority to issue an RFQ or purchase order. Conditions 1–4 in §8.2 remain open.

**Site B — NO-GO on the current vendor set; re-scope required.**
- **Width (physical, decisive):** the measured corridor width is **700 mm**. Every current unit is 800–900 mm wide; the narrowest is still 100 mm too wide. No certificate, price, or warranty term can cure this.
- **Coastal evidence (independent, also blocking):** no current coastal certificate is on file for any vendor. Halcyon-850 is the only vendor that claims a 2026 certificate is forthcoming, and it has the longest warranty, but the claim is **unverified** and cannot be an award basis.
- Because the width bar is independent of certification, **a coastal certificate alone does not change the Site B decision.**
- Required before re-decision: (a) a width-compliant solution — a unit width ≤700 mm, verified corridor remediation to at least the selected unit's width, or relocation; (b) a current 2026 coastal certificate on file for the specific product and site scope; (c) the −4 °C cold requirement, which all three current units already pass; (d) the cost and authority conditions in §8.2.

**Expenditure — NOT APPROVED.**
- No budget is set, no funds are committed, and no purchase order or contract may be issued on the strength of this package. Approval requires a named authority with a recorded delegated limit.

### 8.2 Conditions precedent to any award

1. Recorded financial authority and approved budget for the specific scope.
2. Firm, dated quotations and a costed model per §5.
3. Sizing study fixing unit quantities and electrical configuration.
4. Site design maximum temperature obtained and checked against `max_c`.
5. Site B only: a documented width solution (a unit width ≤700 mm, verified corridor remediation to at least the selected unit's width, or relocation) **and** a current 2026 coastal certificate on file for the specific product and site scope. The existing 700 mm measurement is a **failed gate**, not an open item.

### 8.3 What would change this decision

| New evidence | Effect |
|---|---|
| Current 2026 coastal certificate for Halcyon **alone** | **Does not change Site B eligibility.** The 700 mm width still excludes all three units; the certificate cures only the documentation bar |
| Verified corridor remediation to ≥900 / ≥850 / ≥800 mm | At ≥900 mm all three are width-eligible; at ≥850 mm Solaris and Halcyon are; at ≥800 mm only Solaris is. Each still needs a current coastal certificate |
| A vendor offers a unit width ≤700 mm with a current 2026 coastal certificate | Creates a Site B-eligible bidder; subject to cold rating, cost, sizing, and authority |
| Documented re-survey establishing a measured width ≥800 mm | Reopens Solaris-800 on width (Halcyon at ≥850, Kestrel at ≥900); the coastal certificate is still required |
| Coastal certificate for Kestrel or Solaris while width remains 700 mm | Adds coastal evidence but **cannot cure the width failure** |
| Design maximum temperature above a unit's `max_c` | Excludes that unit at that site |
| Firm pricing and recorded authority | Converts the recommendation into an approvable award package |

### 8.4 Sign-off

| Role | Name | Status |
|---|---|---|
| Prepared by | AI analysis agent | Prepared 2026-11-04; no delegated financial authority |
| Technical review | — | Pending |
| Financial review / budget authority | — | Pending; no delegation recorded |
| Approval to spend | — | **Not granted** |

---

## 9. Inbox re-check at finalization

`inbox/` was re-checked immediately before this package was finalized.

- Contents at finalization:
  - `inbox/README.md` — the inbox evidence rule.
  - `inbox/2026-11-03/corridor-measurement.md` — measured Site B corridor width **700 mm**, survey dated 2026-11-03. **Incorporated** in §3.2, §3.5, §4.2, §6, §7, and §8. The earlier 1200 mm figure is withdrawn as an assumption (Appendix B, A1).
- No coastal certificate, price, sizing/load study, or delegated-authority record arrived.
- The inbox rule was applied: an inbox item is evidence only to the extent its own text states. The measurement is accepted as [M]. Its statement that the 900 mm unit is not admissible is accepted as far as it goes, and calculation extends the exclusion to all three units.
- Review note: `.gitignore` excludes `inbox/` from version control. The measurement is present in the working repository and is used as evidence, but it is not in the committed tree; the review record should attach or commit the survey if the evidence must be auditable downstream.
- If further measured data arrives after this package, it must be incorporated by revision. The first items to re-test are the Site B width solution and the coastal certificate; Site A's maximum temperature and the programme-wide sizing study remain the principal open technical inputs.

---

## Appendix A — Source register

| Source | What it establishes | Limitations |
|---|---|---|
| `TASK.md` | Required package sections; evidence and authority constraints | No technical or cost data |
| `sources/sites.md` | Site A/B design minima; Site A width limit; Site B coastal requirement; Site B width stated only as an assumption | No maximum temperature, load, or quantity; Site B width assumption superseded by the inbox measurement |
| `sources/vendors.md` | Warranty terms; absence of coastal certification; Halcyon certificate "expected" only | No prices; no certificates |
| `sources/capacity.csv` | Unit min/max temperature, width, lead time | Not electrical capacity; no cost |
| `inbox/README.md` | Inbox evidence rule | No measured data |
| `inbox/2026-11-03/corridor-measurement.md` | Site B measured corridor width 700 mm (survey 2026-11-03); 1200 mm assumption superseded | No tolerance, method, or drawing; no other site data |
| `.palimpsest/worlds/retained-baseline/README.md` | Inactive retained world; not used as evidence | Out of scope |

## Appendix B — Assumption register

| ID | Assumption | Status | Treatment |
|---|---|---|---|
| A1 | Site B corridor width is 1200 mm | **Withdrawn — assumption, not measurement** | Superseded by the measured 700 mm [M]; not used anywhere in this revision |
| A2 | `min_c` / `max_c` are the applicable operating-temperature limits | Declared data | Used as stated; installation-specific derating not assessed |
| A3 | `lead_weeks` runs from purchase-order release | Reasonable reading of the column | Confirm in contract; not a committed date |
| A4 | Warranty term is a differentiator, not a compliance criterion at Site A | Derived from `sites.md` | Does not offset the Site B coastal requirement |
| A5 | No electrical sizing can be inferred from `capacity.csv` | Explicit data limitation | Sizing study required |
| A6 | The measured 700 mm corridor width is treated as the available clear width for unit fit | Interpretation of the measurement; the survey states width only | Used as stated; the 100 mm margin to the narrowest unit makes the conclusion insensitive to this reading |
| A7 | A unit fits if its width is ≤ the measured width; no extra installation clearance is added | Method assumption; no clearance allowance is stated in the record | Immaterial here: every current unit exceeds 700 mm by at least 100 mm, so a clearance allowance would only tighten the exclusion |
