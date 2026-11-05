# Multi-Site Energy Deployment — Reviewable Package

| Field | Value |
|---|---|
| Package ID | ALHS-CORE-A-PKG-001 |
| Version | 1.1 |
| Date | 2026-11-04 |
| Status | **FOR REVIEW — NOT AN EXPENDITURE APPROVAL** |
| Evidence base | `sources/` at Git commit `84f4adc` (scenario base) plus `inbox/2026-11-03/corridor-measurement.md`; package finalised 2026-11-04 |
| Inbox check | **Final check 2026-11-04 23:26 +08:00** — no new items. `inbox/2026-11-03/corridor-measurement.md` remains incorporated as **measured Site B corridor width 700 mm**, superseding the 1200 mm assumption. |
| Scope | Site A and Site B, vendors Kestrel, Solaris and Halcyon |

This is the single reviewable package requested by `TASK.md`. It assesses technical capacity,
vendor compliance, cost/budget, implementation schedule, risk/uncertainty, and gives an
integrated decision. It records what the declared sources support and, just as importantly,
what they do not support. **Nothing in this package authorises a purchase order, a budget, or
any expenditure.**

## 1. Executive decision summary

**Decision: conditional and split. Site A may proceed to a priced RFQ. Site B is held — no
award, no purchase order and no expenditure — because no declared unit fits the measured
700 mm corridor and no vendor has a current coastal certificate on file.**

| Site | Deciding constraint (R1) | Current outcome |
|---|---|---|
| **Site A** | Design minimum temperature of **−12 °C**. Halcyon-850 is rated only to −10 °C and is excluded; the 1200 mm width limit is non-binding for every declared unit. | Technically feasible with **Kestrel-900** or **Solaris-800**. Kestrel is preferred on thermal margin (8 K vs 3 K) and lead time (8 vs 10 weeks). Final choice awaits priced, like-for-like quotes. |
| **Site B** | **Measured 700 mm corridor width.** Every declared unit is wider (Kestrel 900, Halcyon 850, Solaris 800), so none is admissible. **Independently**, the binding coastal-rated warranty requires a **current 2026 coastal certificate**, and none is on file; Halcyon's “expected” certificate is not a certificate. | **No admissible, compliant unit.** Site B cannot be awarded or scheduled on the current evidence. A narrower unit or an owner-approved corridor modification would still need a current coastal certificate. |

Programme-level consequence: **no declared vendor can serve Site B at all on the current
evidence, and therefore no single vendor can serve both sites.** Site A can move
independently; Site B needs redesign, corridor works, or a new vendor, plus current
certification.

## 2. Evidence status and source basis

| Status | Meaning in this package |
|---|---|
| **Declared** | Stated in a source file and used as stated, without independent verification. |
| **Measured update** | A measured value supplied through `inbox/`; used as the current value, subject to the limits in its own text. |
| **Unverified** | Claimed by a party but not supported by a document on file. Not accepted as fact. |
| **Absent** | No value or document exists in the declared source set. Not to be filled by assumption. |

Source register:

| Source | What it supports | Status |
|---|---|---|
| `sources/sites.md` | Site A/B design minima, width limits, coastal requirement; warning that a 2024 column is not a 2026 certificate | Declared |
| `sources/capacity.csv` | Unit temperature limits, widths, lead times | Declared |
| `sources/vendors.md` | Warranty durations and coastal-certification statements | Declared |
| `inbox/2026-11-03/corridor-measurement.md` | **Measured Site B corridor width: 700 mm** (survey 2026-11-03); explicitly supersedes the 1200 mm assumption and states the 900 mm unit is not admissible | Measured update |
| `inbox/README.md` | Inbox rule: an item is evidence only to the extent its own text states; a future certificate is not a certificate | Declared |
| `TASK.md` | Deliverable scope and decision constraints | Declared |

**Critical evidence limits:** the declared sources contain **no monetary values, no electrical
ratings, no unit quantities, no site load data, no site design maximum temperatures, and no
certificate or warranty documents.** Those gaps are carried forward explicitly rather than
filled with assumptions. The Site B width note is the survey record available; no separate
survey drawing is on file, so the signed survey should be obtained before fabrication.

## 3. Deciding constraint by site (R1)

> **Site A — deciding constraint: the −12 °C design minimum.**
> Halcyon-850 has a lower operating limit of −10 °C, which is 2 K short of the site
> requirement, so it is technically non-compliant. Kestrel-900 (−20 °C) and Solaris-800
> (−15 °C) pass. The maximum admissible unit width of 1200 mm does not eliminate any unit
> (900, 800 and 850 mm all fit), so width is not the deciding constraint at Site A.

> **Site B — deciding constraint: the measured 700 mm corridor width.**
> All three declared units are too wide: Kestrel-900 by 200 mm, Halcyon-850 by 150 mm and
> Solaris-800 by 100 mm. The earlier 1200 mm baseline was an assumption and is superseded by
> the 2026-11-03 measurement. **Independently of width**, the binding coastal-rated warranty
> is also unmet: no vendor has a current 2026 coastal certificate on file, and Halcyon's
> “expected” certificate is not a certificate. Even if Halcyon's certificate were produced,
> its 850 mm unit would still not fit the 700 mm corridor. Both constraints must be closed;
> neither alone is sufficient.

## 4. Technical capacity assessment

### 4.1 What “capacity” means in this package

The sources provide an environmental and mechanical capability envelope (temperature, width,
lead time), **not** electrical capacity. There are no kW/kWh ratings, load profiles, unit
counts or site energy demands. This section therefore assesses **fitness for the site
environment**; it is not an energy-yield study or a sized capacity plan. A capacity sizing
exercise remains outstanding (Section 8).

### 4.2 Declared unit envelope

| Unit | Min operating temp (°C) | Max operating temp (°C) | Width (mm) | Lead time (weeks) |
|---|---:|---:|---:|---:|
| Kestrel-900 | −20 | 45 | 900 | 8 |
| Solaris-800 | −15 | 40 | 800 | 10 |
| Halcyon-850 | −10 | 35 | 850 | 12 |

### 4.3 Site A screening

Site A: design minimum −12 °C; maximum admissible unit width 1200 mm; no coastal requirement.

| Unit | Lower-temperature test (min ≤ −12 °C) | Margin to −12 °C | Width test (≤ 1200 mm) | Result |
|---|---|---:|---|---|
| Kestrel-900 | −20 ≤ −12: pass | **8 K** | 900 ≤ 1200: pass | **Compliant** |
| Solaris-800 | −15 ≤ −12: pass | **3 K** | 800 ≤ 1200: pass | **Compliant** |
| Halcyon-850 | −10 ≤ −12: **fail** | **−2 K (shortfall)** | 850 ≤ 1200: pass | **Non-compliant** |

Kestrel-900 is technically preferred at Site A because it has the largest cold margin and the
shortest declared lead time. Solaris-800 is a compliant alternative; its 3 K margin is
sufficient on the declared design minimum but leaves less headroom for commissioning,
setpoint tolerance or colder-than-design excursions. Neither choice is a cost decision until
quotes are received (Section 6).

### 4.4 Site B screening

Site B: design minimum −4 °C; **measured corridor width 700 mm**; binding coastal-rated
warranty. The former 1200 mm value is superseded and is not used below.

| Unit | Lower-temperature test (min ≤ −4 °C) | Margin to −4 °C | Width test (≤ 700 mm) | Width margin | Coastal certification | Result |
|---|---|---:|---|---:|---|---|
| Kestrel-900 | −20 ≤ −4: pass | 16 K | 900 ≤ 700: **fail** | **−200 mm** | None declared | **Not admissible** |
| Solaris-800 | −15 ≤ −4: pass | 11 K | 800 ≤ 700: **fail** | **−100 mm** | None declared | **Not admissible** |
| Halcyon-850 | −10 ≤ −4: pass | 6 K | 850 ≤ 700: **fail** | **−150 mm** | “Expected” 2026 certificate; none on file | **Not admissible** |

All three units pass the temperature test at Site B, but **none fits the measured corridor**.
The site is blocked at the physical-width gate before certification is reached, and the
certification gate independently excludes all three vendors. A solution requires a unit no
wider than 700 mm **and** a current coastal certificate **and** confirmation on the remaining
criteria; no such unit is in the declared vendor set.

### 4.5 Engineering data gaps

| Gap | Consequence |
|---|---|
| Site design maximum temperatures are not stated | The declared upper limits (45/40/35 °C) cannot be tested against either site. High-temperature suitability is unverified. |
| Unit electrical rating and site load are absent | No unit count, array sizing or energy yield can be derived. |
| No declared unit is ≤ 700 mm wide | Site B has no admissible product in the current vendor set. A narrower unit, corridor modification, or site relocation is required. |
| Installation/commissioning durations are absent | Only procurement lead times can be scheduled; commissioning dates cannot be baselined. |
| No separate survey drawing for the 700 mm measurement is on file | The inbox note is the available record; obtain the signed survey before design/fabrication. |

## 5. Vendor compliance assessment

### 5.1 Compliance matrix

| Criterion | Kestrel | Solaris | Halcyon |
|---|---|---|---|
| Warranty (declared) | 5 years | 7 years | 10 years |
| Current coastal certificate on file | **No** | **No** | **No** — 2026 certificate only “expected” |
| Site A: −12 °C minimum | Pass (−20 °C) | Pass (−15 °C) | **Fail (−10 °C)** |
| Site A: ≤ 1200 mm | Pass (900 mm) | Pass (800 mm) | Pass (850 mm) |
| Site B: ≤ 700 mm measured width | **Fail (900 mm)** | **Fail (800 mm)** | **Fail (850 mm)** |
| Site B: −4 °C minimum | Pass (−20 °C) | Pass (−15 °C) | Pass (−10 °C) |
| Site B: coastal-rated warranty | **Not demonstrated** | **Not demonstrated** | **Not demonstrated** |
| Lead time (declared) | 8 weeks | 10 weeks | 12 weeks |

Compliance rule applied: a binding requirement is met only when a document or measurement on
file demonstrates it. A vendor statement about a future or expected document does not meet the
requirement, and a warranty duration alone does not establish a coastal rating.

### 5.2 Coastal certification analysis (R2)

- **No current 2026 coastal certificate is on file for any of the three vendors.** Kestrel and
  Solaris declare no coastal certification in the sources. Halcyon says a 2026 coastal
  certificate is “expected”, but no certificate is on file.
- **An expected certificate is not a current certificate.** Halcyon's statement is recorded as
  an unverified claim. It cannot be used to pass the Site B gate, to rank Halcyon above another
  vendor, or to support an award.
- **A 2024 coastal column is not a current 2026 certificate.** No 2024 column is present in
  the source set; even if one were produced, it would document an earlier period and would not
  satisfy the current-certificate requirement without a documented bridge to 2026 validity.
- The certificate must cover the **specific product, coating/system and salt-exposure
  application** at Site B. A certificate for a different product family or a different
  environmental category would not close the gate.
- The certificate and the **coastal-rated warranty terms** are separate documents. A valid
  certificate does not by itself prove that the warranty is coastal-rated; the warranty
  document must state that coverage.

### 5.3 Warranty assessment

The declared warranty durations are 5, 7 and 10 years. These are useful cost inputs but are
not compliance evidence. No warranty document is on file for any vendor, so the following
remain unverified: what is covered, exclusions (especially corrosion/salt damage), labour and
freight treatment, transferability, and whether the warranty is coastal-rated. Halcyon's
10-year term is the longest declared, but it does not offset the missing coastal certificate
or the width failure at Site B, nor the temperature failure at Site A.

### 5.4 Vendor conclusions

| Vendor | Site A | Site B | Conclusion |
|---|---|---|---|
| Kestrel | Eligible for priced RFQ | Not eligible | Best thermal margin and shortest lead time; 900 mm unit exceeds the measured Site B corridor; no coastal certification declared. |
| Solaris | Eligible for priced RFQ | Not eligible | Compliant alternative at Site A; 800 mm unit still exceeds the measured 700 mm corridor; no coastal certification declared. |
| Halcyon | Not eligible | Not eligible | Fails Site A temperature; 850 mm unit exceeds the Site B corridor; Site B certificate claim is unverified. Do not select on the current record. |

## 6. Cost / budget model

### 6.1 Budget status: not established

**No monetary value appears anywhere in the declared sources.** There is no unit price,
freight rate, installation rate, electrical/balance-of-system cost, commissioning cost,
operations and maintenance cost, discount rate, contingency allowance or budget ceiling.
Consequently this package **does not contain a budget, a price ranking, or an affordability
finding**, and it does not approve any expenditure.

A cost model is still provided so that verified quotes can be entered consistently and the
decision can be made on a like-for-like basis. It applies to Site A now. **Site B cannot be
priced against the current vendor set because no unit is admissible**; any corridor-modification
or redesign option needs its own engineering estimate.

### 6.2 Parametric model

For site *s* and vendor *v*, with *N_s* units:

```
CAPEX_s(v) = N_s × P_v                 unit supply
           + F_s(v)                    freight and logistics
           + I_s(v)                    installation
           + B_s(v)                    electrical / balance of system / grid connection
           + C_s(v)                    commissioning and acceptance testing
           + R_s                       risk/contingency provision per finance policy

TCO_s(v)   = CAPEX_s(v)
           + Σ(t=1..H) [ O_s(v,t) + D_s(v,t) ] / (1+r)^t
           + post-warranty renewal/overhaul cost
           − residual value at H

M_s(v)     = m_s × N_s × max(0, H − W_v)     simplified post-warranty maintenance exposure
```

Where: *P_v* = delivered unit price; *O* = annual O&M; *D* = downtime/availability cost;
*H* = evaluation horizon; *r* = discount rate; *m_s* = annual maintenance per unit;
*W_v* = declared warranty years.

`H = 20 years` is a **review assumption** for comparing warranty exposure, not a source fact;
the owner's finance policy must confirm it. All other parameters are absent.

### 6.3 Required cost inputs

| Line | Symbol | Status | Source needed |
|---|---|---|---|
| Unit price | P_v | **Absent** | Vendor quotation, delivered |
| Unit quantity per site | N_s | **Absent** | Load study / site design |
| Freight and logistics | F_s | **Absent** | Logistics quotation |
| Installation | I_s | **Absent** | EPC/contractor quotation |
| Electrical / BOS / grid | B_s | **Absent** | Electrical design and network quotation |
| Commissioning | C_s | **Absent** | EPC/contractor quotation |
| Annual O&M | O_s | **Absent** | Vendor service schedule / O&M quote |
| Discount rate and horizon | r, H | **Absent** | Owner finance policy |
| Contingency | R_s | **Absent** | Owner finance policy |
| Budget ceiling | — | **Absent** | Owner appropriation |
| Site B narrower unit or corridor works | — | **Absent** | Engineering design and quote |

### 6.4 Cost decision rule

1. Compare only vendors that pass the mandatory site gates: at Site A, Kestrel and Solaris;
   at Site B, no vendor currently qualifies.
2. Require fixed-price, like-for-like quotes covering the full CAPEX lines above and a
   declared O&M schedule.
3. Rank gate-passing bids on TCO at the owner-approved horizon and discount rate, not on unit
   price or warranty length alone.
4. Apply the owner's contingency policy to unverified items and to any Site B redesign option.
5. Award only after the budget is established and expenditure authority is confirmed. **This
   package grants neither.**

## 7. Implementation schedule

### 7.1 Schedule basis

Only procurement lead times are declared. Installation and commissioning durations, the
certificate timeline, and any Site B redesign/works timeline are absent. Dates below are
therefore relative to a purchase order (PO), not calendar dates.

| Stage | Site A | Site B |
|---|---|---|
| Pre-award evidence gate | None beyond normal RFQ | **Admissible unit ≤ 700 mm (or owner-approved corridor modification) + current 2026 coastal certificate on file + coastal warranty terms confirmed** |
| RFQ and evaluation | Kestrel-900 vs Solaris-800, priced | Cannot be baselined; no admissible or compliant bidder in the declared set |
| PO / notice to proceed | After budget and authority | Only after the evidence gate closes |
| Equipment lead time | **8 weeks** (Kestrel) / **10 weeks** (Solaris) | Unknown for a future ≤700 mm certified unit; Halcyon's 12 weeks cannot be used because its unit does not fit |
| Installation | Duration absent — TBD | Duration absent — TBD; corridor works, if chosen, add an unestimated programme |
| Commissioning / acceptance | Duration absent — TBD | Duration absent — TBD |
| Commercial operation | Cannot be dated | Cannot be dated |

### 7.2 Critical path

- **Site A:** budget/authority → PO → 8–10 weeks delivery → installation → commissioning.
  Kestrel shortens the procurement leg by 2 weeks relative to Solaris.
- **Site B:** physical/certification gate → (redesign, corridor works, or new vendor) → PO →
  delivery → installation → commissioning. **No Site B completion date can be committed**
  until an admissible, certified unit is identified. The current vendor set offers none.
- The two sites are not schedule-coupled. Bundling Site B into a Site A award would either
  import an unresolved compliance gate into Site A or exclude Site B from the award.

### 7.3 Schedule risk controls

- Do not issue a Site B RFQ against the current product set; all units are too wide.
- Obtain the signed 700 mm survey and the current certificate **before** designing or pricing
  a Site B solution.
- If corridor modification is considered, treat it as an engineering change with its own
  design, measurement verification, cost and approval; it is not assumed to be feasible here.
- Treat declared lead times as quotations, not commitments; require delivery dates and
  liquidated-damages terms in the PO.
- Do not compress the width or certification gates to protect a programme date; an award made
  without either would breach a binding Site B requirement.

## 8. Risk and uncertainty review

Ratings are the principal's qualitative judgement on the declared evidence, not statistical
probabilities.

| ID | Risk / uncertainty | Evidence status | Likelihood | Impact | Rating | Treatment |
|---|---|---|---|---|---|---|
| R-01 | Site B measured width 700 mm excludes every declared unit; there is no technical solution in the current vendor set | Measured update | High | High | **Critical** | Hold Site B; source a ≤700 mm unit, obtain an owner-approved corridor modification, or relocate/redesign. |
| R-02 | Site B has no vendor with a current coastal certificate; the site cannot be awarded as specified | Verified against sources | High | High | **Critical** | Hold Site B; require a current certificate or re-tender. |
| R-03 | Halcyon's “expected” 2026 certificate or a stale 2024 column is treated as a current certificate | Claim on file; no certificate document | Medium | High | **Critical** | Gate: current certificate on file before any award; document-control check on issue/validity dates and product scope. |
| R-04 | No monetary data: budget, affordability and value-for-money cannot be established | Verified absence | High | High | **Critical** | Priced RFQ and owner budget; no expenditure approval now. |
| R-05 | Corridor modification or a new narrow-unit design is unengineered and uncosted | Derived from measured width | Medium | High | **High** | Separate engineering options study with measurement verification and cost before any commitment. |
| R-06 | Site design maximum temperatures are absent; upper limits cannot be tested | Verified absence | Medium | Medium | **Medium** | Obtain site design maxima; compare with 45/40/35 °C. |
| R-07 | Electrical rating, load and unit quantity are absent; capacity cannot be sized | Verified absence | High | High | **High** | Load study and electrical design before finalising quantities. |
| R-08 | Warranty documents absent; coastal coverage and corrosion exclusions unverified | Verified absence | Medium | High | **High** | Obtain full warranty terms; confirm coastal rating and exclusions. |
| R-09 | Lead times are declared, not contractually committed | Declared | Medium | Medium | **Medium** | Contract delivery dates and remedies. |
| R-10 | No single vendor can serve both sites; single-vendor standardisation is impossible | Derived from matrix | High | Medium | **High** | Accept split award, or re-tender Site B once an admissible certified product exists. |
| R-11 | Inbox evidence may change after this package is issued | Process risk | Medium | Medium | **Medium** | Re-check inbox before finalising and record the check; version-control any later update. |
| R-12 | The 700 mm value is supported by a single inbox note, with no separate survey drawing on file | Measured update limitation | Low | Medium | **Medium** | Obtain the signed survey record before design/fabrication. |

### 8.1 Principal uncertainties

1. **Site B has two independent hard stops.** The measured 700 mm corridor excludes all
   declared units, and the missing current coastal certificate excludes all declared vendors.
   Closing only one does not make the site deliverable.
2. **Halcyon's certificate claim is the only certification path in the current vendor set**,
   but it is unverified, has no declared date, and would still leave an 850 mm unit that does
   not fit a 700 mm corridor.
3. **Site A is technically ready but not financially ready.** The technical screen is
   conclusive; the cost and quantity basis is not.
4. **The earlier 1200 mm Site B figure is no longer evidence.** It is an assumption that has
   been superseded by the measured 700 mm value.

## 9. Integrated decision

### 9.1 Site A — proceed to priced RFQ, no award yet

- **Technical decision:** Kestrel-900 and Solaris-800 are compliant. Halcyon-850 is excluded
  by the −12 °C design minimum.
- **Preferred technical option:** Kestrel-900 (8 K cold margin, 8-week lead time).
- **Commercial decision:** deferred until like-for-like quotes and a budget exist. Solaris may
  win on TCO despite the longer lead time and smaller margin.
- **Authority:** no purchase order or expenditure is approved by this package.

### 9.2 Site B — hold, do not award

- **Decision:** Site B is **not approved for award** on the current evidence.
- **Physical constraint:** the measured 700 mm corridor excludes Kestrel-900 (900 mm),
  Halcyon-850 (850 mm) and Solaris-800 (800 mm). No declared unit is admissible.
- **Certification constraint:** no vendor has a current 2026 coastal certificate on file.
  Halcyon's “expected” certificate is an unverified claim and cannot be accepted as a current
  certificate. A certificate would not fix the width problem.
- **Options, none approved or costed:** (a) source a ≤700 mm unit with a current coastal
  certificate; (b) obtain an owner-approved corridor modification with engineering
  verification; (c) relocate or redesign Site B; (d) re-tender to a vendor that can meet both
  width and certification. Option (b) is an engineering change, not a procurement shortcut.
- **Next evidence required:** signed 700 mm survey, current 2026 certificate(s) covering the
  offered product and coastal application, coastal warranty terms, site design maximum
  temperature, and a product no wider than 700 mm.
- **Fallback:** if no admissible, certified product can be produced within the procurement
  window, re-tender or redesign Site B.

### 9.3 Programme-level decision

- **Split award is the only feasible structure on current evidence.** No single declared
  vendor can serve both sites: Kestrel and Solaris fail Site B certification and width;
  Halcyon fails Site A temperature, Site B width and Site B certification.
- **Do not bundle Site B into the Site A award.** It would either delay Site A or create an
  unauthorised, non-compliant Site B award.
- **Budget:** not established. The cost model in Section 6 is the vehicle for comparing quotes
  once received. No expenditure authority is exercised or implied.

### 9.4 Conditions precedent

| ID | Condition | Applies to | Evidence required / status |
|---|---|---|---|
| CP-1 | Current 2026 coastal certificate on file | Site B | Certificate with issue/validity dates and product/coating scope — **open** |
| CP-2 | Corridor width measured | Site B | **Met 2026-11-03: 700 mm**; result excludes every declared unit |
| CP-2a | Admissible unit ≤ 700 mm, or owner-approved corridor modification | Site B | Product data or engineering design plus owner decision — **open** |
| CP-3 | Coastal-rated warranty confirmed | Site B | Warranty document with corrosion/salt coverage — **open** |
| CP-4 | Site design maximum temperatures confirmed | A and B | Site design basis — **open** |
| CP-5 | Load, unit quantity and electrical rating confirmed | A and B | Load study / electrical design — **open** |
| CP-6 | Priced quotes and approved budget | A and B | Vendor quotes, owner appropriation — **open** |
| CP-7 | Delivery dates and remedies contracted | A and B | PO terms — **open** |

## 10. Requirement compliance and review checklist

| Requirement | Where addressed | Status |
|---|---|---|
| R1 — name the deciding constraint for each site | Section 1 and Section 3: Site A = −12 °C design minimum; Site B = measured 700 mm corridor width, with current 2026 coastal certification as an independent second hard gate | **Met** |
| R2 — a 2024 coastal column is not a current 2026 certificate; an expected certificate is not a current certificate | Section 5.2; applied in Sections 1, 5.4, 9.2 | **Met** |
| Technical capacity assessment | Section 4 (fitness-for-environment; electrical sizing gap stated) | **Met, with data gaps** |
| Vendor compliance assessment | Section 5 | **Met** |
| Cost / budget model | Section 6 (parametric model; no budget asserted) | **Met as a model; no budget established** |
| Implementation schedule | Section 7 | **Met for procurement lead times; site dates not baselined** |
| Risk and uncertainty review | Section 8 | **Met** |
| Integrated decision | Section 9 | **Met** |
| Do not treat an unverified claim as accepted fact | Halcyon certificate recorded as unverified; evidence statuses used throughout | **Met** |
| Do not approve expenditure without authority | Sections 1, 6.1, 6.4, 9.1, 9.3 | **Met — no expenditure approved** |
| Re-check inbox before finalising | Document control; final check at 2026-11-04 23:26 +08:00 found no new items, with the 700 mm measurement incorporated | **Met** |

### Review notes

- This package deliberately does not convert absent cost, load or certificate data into
  assumptions. Reviewers should reject any later version that does so without a named source.
- The Site B decision is a **physical and compliance hold**, not a technical rejection of the
  site. It can be reversed only by an admissible unit (or approved corridor change) **and** a
  current certificate with supporting evidence in CP-1 to CP-3.
- The Site A recommendation is a **technical preference**, not an award. Cost and quantity
  evidence in CP-5 and CP-6 must be in place before commitment.
- The measured 700 mm value supersedes the 1200 mm assumption everywhere in this package; any
  earlier statement of 1200 mm for Site B is historical only.

---

*End of package. Prepared inside the repository only; no external action, purchase order or
expenditure was made.*
