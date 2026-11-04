# Multi-Site Energy Deployment — Review Package

**Document status:** DRAFT FOR REVIEW — **RECOMMENDATION ONLY. NOT AN APPROVAL. NOT AN AUTHORISATION TO SPEND.**
**Basis commit:** `9b8a94ee6ef1662b4b426f6cdb6b4ebd3c852a9e`
**Decision cycle:** 2026 (current cycle; the binding coastal requirement is expressed in terms of a *current 2026* certificate)
**Declared sources:** `sources/sites.md`, `sources/vendors.md`, `sources/capacity.csv` (registered in Appendix A)
**Later measured updates:** `inbox/` re-checked at finalisation — **one measured update incorporated**: `inbox/2026-11-03/corridor-measurement.md` (Site B corridor measured at **700 mm**, survey 2026-11-03; supersedes the 1200 mm assumption). See §4.3, §4.4 and §10.4.

---

## 0. How to read this document

This package assesses a two-site deployment — **Site A** and **Site B** — against three declared units
(**Kestrel-900**, **Solaris-800**, **Halcyon-850**). It is written so a reviewer can check each conclusion
against the declared sources rather than trust it.

Six checks a reviewer can run:

| # | Check | Where |
|---|---|---|
| 1 | Is the deciding constraint for each site named explicitly? | §2, §4.5, §5.5, §9.1, §9.2 |
| 2 | Is every vendor claim either evidenced or marked unverified? | §3.2, §5.3, §5.4 |
| 3 | Are the 2024 coastal column and the "expected" 2026 certificate both rejected? | §5.4 |
| 4 | Is the measured 700 mm Site B corridor applied, and kept distinct from Site A's 1200 mm rule? | §4.3, §4.4, §10.4 |
| 5 | Does any monetary figure appear that is not in the sources? | §6.1 — none appear, deliberately |
| 6 | Does the document approve expenditure anywhere? | §9.6 — it does not |

---

## 1. Executive summary

**Bottom line: one site is technically ready to move to an award recommendation; the other has no
admissible unit at all — the measured 700 mm corridor excludes every declared unit, and the binding
coastal-certificate requirement is independently unmet by all three. Cost cannot be assessed at all from
the declared sources, and this package deliberately contains no monetary figures.**

| Site | Deciding constraint | Verdict | Who must act next |
|---|---|---|---|
| **Site A** | **Design minimum temperature −12 °C** (cold-end operating envelope) | **Proceed to award recommendation.** Kestrel-900 preferred; Solaris-800 qualified alternate; **Halcyon-850 rejected** (hard technical fail). No expenditure approved. | Project Sponsor (budget authority); Engineering Authority (margin policy, hot-side ambient) |
| **Site B** | **Measured 700 mm corridor width** — every declared unit is 800–900 mm wide. A current coastal certificate is a second, independent binding gate and is also unmet by all three. | **HOLD — no admissible or compliant unit, no award, no commitment.** Gated on re-scope (or corridor change) *and* a current certificate. | Engineering Authority (re-scope/corridor change); Compliance/QA (certificate acceptance) |

Three findings drive everything else:

1. **Site A eliminates exactly one unit, on temperature alone.** Halcyon-850 is rated to −10 °C against a
   −12 °C design minimum: a **2 K shortfall**. No tolerance band, no margin assumption, and no commercial
   term makes a −10 °C rating meet a −12 °C requirement. Kestrel-900 (+8 K margin) and Solaris-800 (+3 K
   margin) pass. The 1200 mm width limit is satisfied by all three and is therefore **not** the deciding
   constraint at Site A.
2. **Site B eliminates all three units on two independent grounds.** First, the corridor has now been
   measured at **700 mm**; every declared unit is **800–900 mm wide**, so **none is admissible** — before
   installation, airflow or service clearance is even considered. Second, the binding **coastal-rated
   warranty** requires a **current coastal certificate on file**. Kestrel and Solaris declare none.
   Halcyon merely *expects* a 2026 certificate. An expectation is not a certificate, and a 2024 coastal
   column is not a current 2026 certificate. **No unit is admissible or compliant at Site B.** The
   earlier 1200 mm corridor was an assumption and is superseded by the measurement.
3. **The strongest warranty in the set belongs to the only unit deployable at neither site.** Halcyon's
   10-year term is commercially attractive and technically irrelevant to both decisions. Selecting on
   warranty length would be a procurement error, and this package explicitly guards against it (§8, R06).

**Cost is unassessable, not merely uncertain.** The declared sources contain no unit price, no quantity, no
freight, no labour rate, no currency and no budget ceiling. §6 therefore delivers a cost *model structure*
and a complete list of missing inputs, and asserts **no monetary value whatsoever**. Any total cost quoted
against this package today would be fabricated.

---

## 2. The two deciding constraints, stated plainly

> **Site A — deciding constraint: the −12 °C design minimum temperature.**
> It is the only binding requirement at Site A that any unit fails (Halcyon-850 at −10 °C). The width limit
> (1200 mm) binds nothing: every declared unit is 800–900 mm wide.

> **Site B — deciding constraint: the measured 700 mm corridor width.**
> Every declared unit is 800–900 mm wide, so **none is admissible** at Site B. This is a measured physical
> exclusion, not an assumption. Independently, the binding **coastal-rated warranty** requirement is also
> unmet by all three units: no current coastal certificate is on file for any of them. Both gates would
> have to be satisfied; neither can cure the other.

These two constraints are independent of each other. Site A's readiness does not help Site B, and Site B's
blockage does not hold Site A back. Treating them as one programme decision would either delay a deployable
site or rush an undeployable one. §9 keeps them separate.

---

## 3. Basis of assessment

### 3.1 What the sources actually declare

| Item | Value | Source | Nature |
|---|---|---|---|
| Site A design minimum | −12 °C | sites.md | Declared site requirement |
| Site A maximum admissible unit width | 1200 mm | sites.md | Declared admissibility limit |
| Site A coastal requirement | none | sites.md | Declared |
| Site B design minimum | −4 °C | sites.md | Declared site requirement |
| Site B coastal requirement | coastal-rated warranty is **binding** | sites.md | Declared binding requirement |
| Site B corridor width (baseline) | 1200 mm — **"AN ASSUMPTION, not a measurement"** | sites.md | **Assumption — SUPERSEDED** |
| Site B corridor width (measured) | **700 mm** (survey performed 2026-11-03) | inbox/2026-11-03/corridor-measurement.md | **Measured — operative** |
| Kestrel-900 | −20 … +45 °C, 900 mm, 8 wk lead, 5-yr warranty | capacity.csv, vendors.md | Declared vendor specification |
| Solaris-800 | −15 … +40 °C, 800 mm, 10 wk lead, 7-yr warranty | capacity.csv, vendors.md | Declared vendor specification |
| Halcyon-850 | −10 … +35 °C, 850 mm, 12 wk lead, 10-yr warranty | capacity.csv, vendors.md | Declared vendor specification |
| Kestrel / Solaris coastal certification | none declared | vendors.md | **Absent** |
| Halcyon coastal certification | "2026 certificate is *expected*", none on file | vendors.md | **Unverified claim** |

### 3.2 Evidence grading scheme

Every statement in this package carries one of these grades. Nothing graded E4 or E5 is used as an
accepted fact anywhere in the analysis.

| Grade | Meaning | Consequence |
|---|---|---|
| **E1** | Measured and reported by a qualified survey in a declared source (not re-performed by the author) | May be relied on as a measurement within its stated scope |
| **E2** | Declared in a declared source, not independently verified | Relied on **as a vendor/site declaration only**; revalidation required at award (R14) |
| **E3** | Explicitly an assumption, unmeasured | **May not decide a go/no-go alone**; must be converted to E1 before commitment |
| **E4** | Unverified vendor claim, no supporting document | **Not accepted.** Cannot satisfy a binding requirement |
| **E5** | Required and absent | Drives the constraint it belongs to; blocks award where binding |

**The only E1 item in this engagement is the Site B corridor measurement (700 mm).** Every vendor
specification and every site requirement is E2 at best; no vendor claim is E1. That remains a material
limitation of the whole package and is stated again in §8.2.

### 3.3 Late evidence

`TASK.md` warns that new measured updates may appear in `inbox/`. `inbox/` is git-ignored. At the start
of this continuation it contained **one measured update**: the Site B corridor survey of 2026-11-03
(**700 mm**). It has been incorporated in §4.3–§4.4 and drives the Site B conclusion. It is the only inbox
item present at finalisation (§10.4); nothing else is assumed. If further measurements arrive after this
package, §9.7 governs what must be re-run.

---

## 4. Technical capacity assessment

### 4.1 Method

Two independent pass/fail tests are applied per site:

- **Temperature test** — the unit's declared minimum operating temperature must be **≤** the site design
  minimum. (A unit rated to −15 °C can serve a −12 °C site; a unit rated to −10 °C cannot.)
- **Dimensional test** — the unit's declared width must be **≤** the applicable width limit at that site.

A site-level "eligible" verdict requires passing **both** tests. Compliance (§5) is applied *after* these,
and is a further, independent gate at Site B.

A deliberate note on **margin**. No margin or de-rating policy is declared in the sources, so the tests
above are run at **zero margin** — the most permissive defensible reading. This matters because it makes
the Site A result *robust*: Halcyon fails at zero margin and therefore fails under any margin policy
whatsoever. Kestrel and Solaris pass at zero margin, but Solaris's 3 K margin could fall foul of a margin
rule that is not yet written (§8, R05). See §9.1 condition C-A2.

### 4.2 Temperature test

| Unit | Min °C (declared) | Site A (−12 °C): margin | Site A verdict | Site B (−4 °C): margin | Site B verdict |
|---|---|---|---|---|---|
| Kestrel-900 | −20 | **+8 K** | **PASS** | **+16 K** | **PASS** |
| Solaris-800 | −15 | **+3 K** | **PASS** | **+11 K** | **PASS** |
| Halcyon-850 | −10 | **−2 K (shortfall)** | **FAIL** | **+6 K** | **PASS** |

Halcyon's Site A failure is a **hard fail**: the unit's declared minimum is *warmer* than the site's design
minimum, so the unit is outside its declared operating envelope at design conditions. The only ways to
"fix" this are (a) relax the site design minimum, or (b) obtain a re-rated/verified envelope from the
vendor. Both are engineering changes requiring the **Engineering Authority**, not procurement decisions.
Neither is available today, and neither is assumed here (§8, R13).

### 4.3 Dimensional test

| Unit | Width (mm) | Site A limit 1200 mm: headroom | Site A verdict | Site B measured 700 mm corridor: headroom | Site B verdict |
|---|---|---|---|---|---|
| Kestrel-900 | 900 | 300 mm | **PASS** | **−200 mm** | **FAIL** |
| Solaris-800 | 800 | 400 mm | **PASS** | **−100 mm** | **FAIL** |
| Halcyon-850 | 850 | 350 mm | **PASS** | **−150 mm** | **FAIL** |

The dimension is not binding at Site A, but it is the deciding constraint at Site B:

- At **Site A**, 1200 mm is a *declared admissibility limit* — a rule. All units comply, so the test is
  closed and does not decide anything.
- At **Site B**, 700 mm is a *measured physical corridor width*. Every declared unit is wider than the
  corridor by 100–200 mm, so **none fits**, before installation, airflow or service clearance is added.
  This is a hard geometric exclusion.

**Site A's 1200 mm limit and Site B's measured 700 mm corridor are not the same quantity and must never
be pooled.** One is an acceptance criterion; the other is measured geometry at a different site. The
1200 mm figure that previously appeared for Site B was an **assumption**, explicitly "not a measurement";
the 2026-11-03 survey supersedes it.

### 4.4 The measured corridor excludes every declared unit

The survey result is not a small correction to the Site B analysis; it closes the dimensional question
adversely:

| Measured usable corridor | Units that fit on width alone | Consequence |
|---|---|---|
| ≥ 900 mm | All three | Width non-binding; coastal gate alone decides |
| 850–900 mm | Solaris-800, Halcyon-850 | Kestrel-900 eliminated |
| 800–850 mm | Solaris-800 only | Single eligible unit |
| < 800 mm | **None** | **No declared unit is deployable at Site B** |
| **700 mm (measured)** | **None** | **Site B is not deployable with any declared unit; re-scope required** |

The 700 mm value is below the width of the narrowest declared unit (Solaris-800 at 800 mm). The real
criterion is unit width **plus** required installation, airflow and service clearance, so the shortfall
is larger than the bare 100–200 mm figures. There is no declared unit, option or accessory that changes
this. A smaller unit, a corridor modification, or a different site is required; none is declared or
approved.

### 4.5 Capacity in the sense of *output* — an explicit data gap

The source file is named `capacity.csv` but declares only **temperature limits, width and lead time**.
There is **no rated output (kW/kWh), no efficiency or COP curve, no part-load behaviour, and no
temperature-vs-capacity derating data** for any unit. There are also **no site loads**: no peak demand, no
annual energy requirement, no redundancy or N+1 requirement.

Consequently:

- **Deployed capacity cannot be sized** and unit *counts* cannot be derived. This is why §6's cost model
  carries a symbolic quantity `N` rather than a number.
- **Hot-side adequacy cannot be assessed.** Unit maxima are 35/40/45 °C, but neither site declares a maximum
  ambient or a maximum intake temperature. Kestrel has the widest hot-end rating, but with no site
  requirement this is a preference, not a compliance finding. Recorded as open item A-3.
- **Energy yield and operating cost cannot be projected.** Any such figure would be invented.

The temperature and dimensional envelopes above are therefore the *entire* defensible technical capacity
assessment available. It is a **compatibility** assessment, not a **sizing** assessment, and should be
labelled as such to any reader who expects kW figures. At Site B the compatibility result is negative:
no declared unit is dimensionally admissible.

### 4.6 Technical findings

1. **Site A: two of three units are technically eligible** (Kestrel-900, Solaris-800); **Halcyon-850 is not**.
2. **Site B: all three units pass temperature but all three fail the measured corridor.** No declared unit
   is dimensionally admissible at 700 mm; the Site B problem is both physical and compliance-related.
3. **The Site A deciding constraint is temperature**, specifically the −12 °C design minimum.
4. **The Site B deciding constraint is the measured 700 mm corridor**, which excludes every declared unit.
   The coastal-certificate requirement is a second, independent binding gate that is also unmet (§5.5).
5. All unit specifications are **E2 vendor declarations**. Passing a test here means "the vendor's declared
   envelope covers the site requirement", not "the unit has been shown to work there". A factory acceptance
   test at the site design minimum is the control that converts E2 to a verified measurement (action A-2).

---

## 5. Vendor compliance assessment

### 5.1 The binding requirement, stated precisely

`sources/sites.md` states that at Site B **"a coastal-rated warranty is binding."** That is a
compound requirement, and both parts must hold:

- **(a) the warranty must be coastal-rated** — a term explicitly covering coastal/corrosive exposure, and
- **(b) that rating must be substantiated by a current certificate on file** for the unit being supplied.

No declared vendor satisfies both. Note that satisfying (a) alone is a *statement*; the certificate in (b)
is the *evidence*. A coastal-rated warranty asserted without a certificate is precisely the class of
unverified claim this project forbids accepting.

### 5.2 Evidence acceptance test for a coastal certificate

For a coastal certificate to be accepted at all, **all five** must hold. This test is the control that
prevents the two documented failure modes (stale column, expected certificate) from entering the decision:

| # | Criterion | Why it exists |
|---|---|---|
| A1 | It is a **certificate document** — an instrument with an issuer, a certificate number and a scope | A cell in a spreadsheet column is data, not a certificate |
| A2 | It is **issued for the exact model/variant** being quoted (part number, not product family) | Certificates do not transfer across models (R11) |
| A3 | It is **currently valid at the award date** — i.e. a current 2026 certificate, in date, not withdrawn | A 2024 column is expired as evidence of 2026 compliance |
| A4 | The **issuer is identifiable and the certificate is verifiable** with that issuer | A claim cannot verify itself |
| A5 | Its validity is compatible with how it is being used — e.g. certificate term versus warranty term | A 1-year certificate does not underwrite a 10-year warranty claim (R12) |

Failing any one of A1–A5 means the requirement in §5.1(b) is **unmet**, and Site B cannot be awarded on
that unit. Partial credit does not exist for a binding requirement.

### 5.3 Compliance matrix

| Criterion | Kestrel-900 | Solaris-800 | Halcyon-850 |
|---|---|---|---|
| Warranty term (declared) | 5 years | 7 years | **10 years** |
| Warranty stated as coastal-rated | **No** (not declared) | **No** (not declared) | **No** (not declared) |
| Coastal certification declared | **None** | **None** | **"Expected" 2026 — none on file** |
| Evidence grade for coastal status | **E5 (absent)** | **E5 (absent)** | **E4 (unverified claim)** |
| Passes §5.2 A1–A5 | **No** | **No** | **No** |
| **Site B compliance verdict** | **NOT COMPLIANT** | **NOT COMPLIANT** | **NOT COMPLIANT** |
| Site A compliance burden | None (no coastal requirement at A) | None | None — but unit fails temperature (§4.2) |

**Result: 0 of 3 units are compliant for Site B.** The coastal requirement is unmet across the entire
declared vendor set. This is the deciding constraint at Site B, and it is not close — no unit is one
document away from compliance except in the sense that any of them *could* produce a certificate.

### 5.4 The two claims that must not be accepted

| Claim | Disposition | Reason |
|---|---|---|
| A **2024 coastal column** (a dated table entry asserting coastal qualification) | **REJECTED** as current coastal certification | Fails **A1** (a column entry is not a certificate document) and **A3** (2024 is not a current 2026 certificate). Data tables also carry no issuer, no certificate number, no scope and no validity window — so A2, A4 and A5 fail too. |
| Halcyon's statement that a **2026 coastal certificate is "expected"** | **REJECTED** as evidence | An expected certificate is not a certificate. `vendors.md` itself records "no certificate is on file". Fails A1–A5 by absence. The claim is a **forecast about the vendor's paperwork**, and forecasts do not discharge binding requirements. |

Both are recorded as **E4** and are used nowhere in this package as accepted fact. A reviewer who finds
either one relied upon anywhere in a later version of this package should treat that version as defective.

### 5.5 Compliance findings

1. **The coastal-certificate requirement is a binding gate at Site B**, independent of the measured
   corridor. Both must be satisfied; certification cannot rescue a unit that is too wide.
2. **No declared unit can be awarded at Site B today.** The correct Site B outcome is *no award*, not a
   *conditional award* to the closest vendor (R02, R03).
3. **Warranty length is not a compliance proxy.** Halcyon's 10-year term is the longest and does not
   satisfy a single element of §5.1 (R06).
4. **Warranty term is not portfolio evidence either.** Even if Halcyon later produces a valid 2026
   certificate, the certificate — not the warranty length — will be what discharges the requirement.
5. **Kestrel and Solaris declaring no coastal certification is a real finding, not a documentation gap to
   be assumed away.** "None declared" is E5, and E5 at a binding requirement blocks award exactly as E4 does.
6. **Site B is independently excluded on dimension.** Even a valid 2026 coastal certificate from any
   vendor would not make an 800–900 mm unit fit a measured 700 mm corridor. Certification and dimensional
   admissibility are separate gates; both must be satisfied.

---

## 6. Cost / budget model

### 6.1 Status: cost is not assessable from the declared sources

**No monetary figure appears anywhere in this package, and that is a deliberate, defensible position.**

The declared sources contain **no** unit price, **no** quantity, **no** freight or logistics cost, **no**
installation labour rate, **no** commissioning cost, **no** currency, **no** escalation assumption, and
**no** authorised budget ceiling. There is also no site load data from which a unit count could be derived
(§4.5). A total cost cannot be computed, and any number presented as one would be invented — which would
violate the standing requirement not to treat unverified content as accepted.

What this section *can* deliver honestly: the model's **structure**, the **drivers** that will move it, the
**inputs** that are missing and who must supply them, and the **decision rule** that must apply once real
figures exist.

### 6.2 Model structure

Total cost of ownership, per site, expressed symbolically:

```
TCO(site) =  Σ_units [ N × (P_unit + F_freight + I_install + C_commission) ]
           + K_cert       (coastal certification / testing burden, where applicable)
           + S_survey     (corridor measurement and site verification — now incurred; cost unknown)
           + R_rescope    (Site B re-scope / corridor modification, if pursued)
           + W_reserve    (warranty and service reserve over the warranty term)
           + SP_spares    (critical spares holding)
           + CN_contingency (risk allowance, set as a % of the above)
           + ESC_escalation (price escalation over the lead time and delivery window)
```

and programme total `TCO(programme) = TCO(A) + TCO(B)`, with the Site B term **not
committable** while the measured dimensional exclusion is unresolved and G-B1 is open.

Knowns: exactly one known, and it is not money — **lead time** (8 / 10 / 12 weeks). Everything else in the
expression is an unset symbol. That ratio is the honest summary of the cost position.

### 6.3 Cost-driver ranking (what will actually move the number)

Ranked by expected influence, independent of any price input:

| Rank | Driver | Why it dominates | Leverage available now |
|---|---|---|---|
| 1 | **Unit count `N`** | Not derivable — no load data, no redundancy requirement. Sets the scale of every per-unit line. | Needs site load and redundancy policy (A-1) |
| 2 | **Unit price `P_unit`** | Unknown for all three units; the sources give no basis even for a *ranking* between vendors | Needs quotations (A-4) |
| 3 | **Coastal certification burden `K_cert`** | A real, avoidable cost at Site B. Certification/testing is a one-off programme burden that should be **vendor-borne**, since the certificate is the vendor's own product claim | Make certification a condition of Site B award (A-5) |
| 4 | **Site B re-scope `R_rescope`** | The measured 700 mm corridor excludes every declared unit. A smaller/custom unit, corridor modification or site change is now required; none is scoped or priced | Engineering to define and cost re-scope options (A-6) |
| 5 | **Schedule carrying cost** | 8 vs 10 vs 12 weeks is a 4-week spread across the set; delay cost is unquantified but real | Choose on compliance and margin, not on 2-week lead-time differences |
| 6 | **Warranty reserve `W_reserve`** | 5 / 7 / 10-year terms imply materially different reserve profiles, but only for units that are actually eligible | Cannot be compared until eligibility is settled |

**A crucial negative finding:** because no prices exist, **no cost ranking between Kestrel and Solaris can
be asserted.** Neither can a claim that the longer warranties are "worth" any particular premium. Any
statement of the form "Vendor X is cheaper" or "Vendor Y is better value" is unsupported by the declared
sources.

### 6.4 Input register — what must be supplied before a cost model can run

| # | Missing input | Needed for | Owner | Blocks |
|---|---|---|---|---|
| 1 | Site peak load and annual energy requirement, per site | `N`, sizing | Engineering Authority | Any cost figure |
| 2 | Redundancy / N+1 policy | `N` | Engineering Authority | Any cost figure |
| 3 | Unit prices, per model, quoted with validity period | `P_unit` | Procurement | Any cost figure |
| 4 | Freight, duties, delivery terms (Incoterms) | `F_freight` | Procurement | Total cost |
| 5 | Installation and commissioning scope and rates | `I_install`, `C_commission` | Delivery lead | Total cost |
| 6 | Currency, FX basis, escalation index | `ESC_escalation` | Finance | Total cost |
| 7 | Authorised budget ceiling | The **acceptance threshold** | Project Sponsor | **Any award at all** |
| 8 | Warranty/service contract pricing and reserve policy | `W_reserve` | Finance / Procurement | TCO comparison |
| 9 | Coastal certification cost allocation (vendor vs programme) | `K_cert` | Procurement | Site B business case |
| 10 | Contingency policy (% and basis) | `CN_contingency` | Finance | Total cost |
| 11 | Site B re-scope options (smaller unit, corridor modification, or site change) and their cost | `R_rescope` | Engineering Authority | Site B business case |

**Every monetary input above remains missing.** The only new input received is a physical measurement, not
a cost; the model still cannot produce a total and should be reviewed as a specification for a model.

### 6.5 Budget authority — explicit statement

There is **no authorised budget in this package**, and this package creates none.

- No expenditure is approved, recommended for approval, or committed here.
- No purchase order, letter of intent, or reservation of manufacturing slot is authorised by this document.
- The **acceptance threshold** for any award is the authorised budget ceiling set by the **Project Sponsor**.
  Since no ceiling is declared in the sources, **no acceptance threshold currently exists** — which means
  no offer can be judged affordable, only technically and commercially compliant.
- Any party reading a monetary total into this package is reading something that is not here.

---

## 7. Implementation schedule

### 7.1 Site A — a real, plannable path

| Stage | Duration | Basis | Status |
|---|---|---|---|
| Award decision | — | Gate G-A (Sponsor authorisation + Engineering margin policy) | **Open** |
| Manufacturing / delivery lead | **8 weeks** (Kestrel-900) / **10 weeks** (Solaris-800) | Declared, E2 | Known |
| Factory acceptance test at −12 °C | not declared | Action A-2 | **To be scheduled** |
| Site preparation and install | not declared | E5 | **Unknown** |
| Commissioning and energisation | not declared | E5 | **Unknown** |

Site A's lead time is the only schedule quantity in the entire package that is known. Site A could
realistically reach delivery **8 weeks after a valid award** on Kestrel-900. The post-delivery stages are
genuinely unknown — no install, commissioning or site-prep durations are declared — so **no energisation
date can be committed.** Quoting one would be fabrication.

### 7.2 Site B — not schedulable, and pretending otherwise is the main schedule risk

Site B sits behind gates whose durations are **not knowable**:

| Gate | What it needs | Status | Confidence |
|---|---|---|---|
| **G-B1** — coastal certificate on file | A current 2026 certificate passing §5.2 A1–A5, from any vendor | **OPEN.** Depends on a third party's certification process that no source describes; Halcyon's own framing is a forecast ("expected"). | **None — do not schedule against it** |
| **G-B2** — corridor measurement | A physical survey of the Site B corridor | **CLOSED — ADVERSE.** Measured **700 mm** on 2026-11-03; every declared unit is 800–900 mm wide, so none is admissible. | **High** — this is a measured exclusion |
| **G-B3** — Site B re-scope | A smaller unit (≤700 mm), a corridor modification, or a site change — whichever is authorised and feasible | **NOT STARTED.** No option is declared, scoped, priced or approved. | **Low until options exist** |

The critical path of the **programme** is therefore the Site B gate path — G-B3 (re-scope) and G-B1
(certificate) — and it is indeterminate. That has a direct planning consequence: **any Site B energisation
date in a programme plan today is unsupported.** The correct planning artefact for Site B is a *decision
review*, not a delivery date.

### 7.3 Decoupling recommendation

Site A and Site B share no dependency: different units, different constraints, different lead times, and
different evidence requirements. Serialising them would delay a deployable site behind an unresolvable one.
**Run Site A on its own gate; hold Site B.**

The one coupling to watch is **supplier concentration**: if Site B eventually resolves to a single vendor,
and Site A also resolves to that vendor, the programme acquires a single-source exposure that neither site
carries alone (R10). This is a commercial consideration for later, not a reason to delay Site A.

### 7.4 Schedule findings

1. **Lead times are 8 / 10 / 12 weeks** (Kestrel / Solaris / Halcyon) — a 4-week spread, small relative to
   the unknowns, and **not** a sound basis for choosing a vendor.
2. **Only the manufacturing lead time is known.** Install, commissioning and site prep are E5.
3. **Site B has no defensible schedule** until G-B1 closes. Do not accept a Site B date.
4. **The programme critical path is the certification gate**, not procurement. Scheduling effort belongs on
   G-B1 and G-B2, not on compressing lead times.

---

## 8. Risk and uncertainty review

### 8.1 Risk register

Likelihood/Impact: **H**igh / **M**edium / **L**ow. "Certain" is used where the risk is not a probability
but a present condition.

| ID | Risk | L | I | Rating | Control / mitigation | Owner |
|---|---|---|---|---|---|---|
| **R01** | **Site B has no compliant unit** — binding coastal requirement unmet by all three vendors. | Certain | H | **Critical** | Gate G-B1. No Site B award or commitment until a certificate passes §5.2. | Compliance/QA |
| **R02** | **A 2024 coastal column is accepted as a current certificate** — stale evidence used to justify award; warranty exposure later. | M | H | **High** | §5.2 A1/A3 mandatory. Reject table entries. Verify with issuer. | Compliance/QA |
| **R03** | **An "expected" 2026 certificate is treated as held** — award made on a forecast. | M | H | **High** | §5.2 A1–A5. Certificate must be *on file* before award, no side letters. | Compliance/QA |
| **R04** | **Site B corridor is measured narrower than the assumed 1200 mm** — assumption hides a real constraint that could eliminate some or all units (§4.4). | M | H | **High** | Gate G-B2: physical survey before any Site B commitment. | Survey / Engineering |
| **R05** | **Site A margin policy is undefined** — Solaris-800's 3 K margin may be unacceptable under a margin rule, collapsing Site A to a single source. | M | M–H | **Medium-High** | Engineering Authority to state the margin policy. Condition C-A2. Fallback: Kestrel-900 alone, +8 K. | Engineering Authority |
| **R06** | **Halcyon is selected on warranty strength** despite failing Site A temperature and Site B certification — the "best warranty" trap. | M | H | **High** | Compliance-first screening (§4, then §5). Warranty length is explicitly a *post-eligibility* criterion only. | Procurement |
| **R07** | **Hot-side ambient unknown** — unit maxima of 35/40/45 °C cannot be tested against an undeclared site maximum. | M | M | **Medium** | Obtain site max ambient/intake temperature (A-3) before award. | Engineering Authority |
| **R08** | **No output capacity data** — units cannot be sized or counted; undersizing discovered post-installation. | H | M–H | **High** | A-1: loads and redundancy policy. Do not fix quantities before this. | Engineering Authority |
| **R09** | **No cost data** — budget set on guesswork, or spend committed without a ceiling. | Certain | H | **Critical** | §6.4 inputs 1–10. No award without an authorised ceiling. | Project Sponsor / Finance |
| **R10** | **Supplier concentration** — if Site B resolves to the Site A vendor, single-source exposure across the programme. | M | M | **Medium** | Keep Solaris-800 qualified at Site A as an alternate (§9.1); revisit after G-B1. | Procurement |
| **R11** | **Certificate scope mismatch** — certificate issued for a different model, variant or part number than the one quoted. | M | H | **High** | §5.2 A2: match on part number, not family name. | Compliance/QA |
| **R12** | **Certificate validity shorter than warranty term** — e.g. a 10-year warranty under an annually renewable certificate. | M | M | **Medium** | §5.2 A5; require certification maintenance or term alignment as a contract term (A-7). | Legal / Procurement |
| **R13** | **Site design minimum relaxed to admit Halcyon at Site A** — a procurement workaround dressed as an engineering change. | L | H | **Medium-High** | Any change to a site design minimum requires **Engineering Authority** sign-off and re-issue of this package. Not a procurement decision. | Engineering Authority |
| **R14** | **Source drift** — declared specs, lead times and warranty terms superseded during the gate period. | M | M | **Medium** | Revalidate all E2 data at award (§9.7). Sources are point-in-time. | Procurement |
| **R15** | **Programme anchored on an expected certificate** — Site B date slips indefinitely and drags the programme. | H | M–H | **High** | No Site B energisation date committed; Site A decoupled (§7.3). | Programme lead |

### 8.2 Uncertainty register — what is unknown, and which way the error runs

| Uncertainty | Grade | Direction of error if wrong | Resolution |
|---|---|---|---|
| Site B corridor = 1200 mm | **E3 assumption** | **Adverse only.** Real corridor could be narrower; it cannot be "more than 1200 mm" in a way that helps, since 1200 mm already passes everything. The assumption can only hide a problem. | Survey (G-B2) |
| Halcyon 2026 coastal certificate "expected" | **E4 unverified** | **Adverse.** Treating it as held risks an award on a certificate that may never issue, or may issue for a different model. | Certificate on file (G-B1) |
| No coastal certificate for Kestrel / Solaris | **E5 absent** | **Adverse.** Absence of a declaration is not a declaration of absence of risk. | Certificate on file (G-B1) |
| Unit temperature envelopes | **E2 declared** | Could be optimistic or conservative; no test evidence. | FAT at design minimum (A-2) |
| Unit widths, lead times, warranty terms | **E2 declared** | Point-in-time; may have changed. | Revalidation at award (R14) |
| Site hot-side ambient | **E5 absent** | Could invalidate a unit's hot-end rating. | Site data (A-3) |
| Loads, quantities, costs, budget | **E5 absent** | Blocks sizing and any affordability judgement. | §6.4 |

**The asymmetry is the important part.** Three of the top uncertainties (corridor, expected certificate,
absent certificates) **can only break in the adverse direction**. There is no upside scenario hidden in
them. A cautious decision-maker should therefore treat the Site B position as *worse than unknown* — it is
a known gap, not a coin flip.

### 8.3 Tripwires — conditions that should reopen this package immediately

| # | Trigger | Effect |
|---|---|---|
| T1 | Corridor measures **< 900 mm** | Kestrel-900 drops out of Site B eligibility |
| T2 | Corridor measures **< 850 mm** | Only Solaris-800 remains at Site B |
| T3 | Corridor measures **< 800 mm** | **No declared unit fits Site B** — re-scope required |
| T4 | Any vendor presents a coastal certificate | Run §5.2 A1–A5 in full; a certificate is a claim until verified with its issuer |
| T5 | A **2024** coastal column is submitted as evidence | Reject per §5.4; record the submission |
| T6 | Site A margin policy published with margin > 3 K | Solaris-800 drops out; Site A becomes single-source on Kestrel-900 |
| T7 | Site A or B design minimum changes | Re-run §4.2 entirely; re-issue this package (R13) |
| T8 | Site hot-side ambient exceeds 35 °C at Site B or 40 °C at Site A | Re-run §4.2 on the hot end; may eliminate units |
| T9 | Any price or quantity data arrives | §6 can begin; §6.1's "unassessable" verdict is withdrawn |

---

## 9. Integrated decision

### 9.1 Site A — proceed to award recommendation (not an approval)

**Decision: Site A is technically ready to move to an award recommendation. Kestrel-900 is the preferred
unit; Solaris-800 is the qualified alternate; Halcyon-850 is rejected.**

| Rank | Unit | Rationale |
|---|---|---|
| **1 — Preferred** | **Kestrel-900** | Widest cold margin (**+8 K** vs −12 °C) — robust to any future margin policy; shortest lead time (**8 weeks**); 300 mm within the 1200 mm limit. Its 5-year warranty is the shortest in the set — a real disadvantage, but a **post-eligibility** one that cannot outweigh a 2 K envelope failure elsewhere. |
| **2 — Qualified alternate** | **Solaris-800** | Passes on temperature but with only **+3 K** margin, which may not survive a margin policy (R05); 10-week lead; 7-year warranty. Retained deliberately as a second source (R10) and as the fallback if a margin rule of > 3 K is imposed — in which case it is not eligible at all. |
| **3 — Rejected** | **Halcyon-850** | **Hard technical fail:** −10 °C declared minimum against a −12 °C design minimum. Rejected regardless of its 10-year warranty, its 850 mm width and its 12-week lead. Not eligible at Site A on any commercial basis. |

**Conditions before any Site A award** — the recommendation does not survive these being unmet:

- **C-A1 — Budget authority.** Project Sponsor sets an authorised ceiling. Until then no offer is
  affordable or unaffordable; it is unjudged (§6.5).
- **C-A2 — Margin policy.** Engineering Authority states whether a margin applies above the −12 °C design
  minimum. If > 3 K, Solaris-800 is withdrawn and Site A becomes single-source on Kestrel-900 (T6).
- **C-A3 — Hot-side ambient.** Site maximum ambient/intake temperature confirmed against the unit's hot-end
  rating (35/40/45 °C). Currently unassessable (R07).
- **C-A4 — Sizing.** Loads and redundancy policy supplied so a unit count can be set (§4.5, R08).
- **C-A5 — Commercial verification.** Prices, delivery terms and warranty terms confirmed in writing and
  current at award (R14).

Note that C-A1 through C-A4 are **inputs this package could not obtain**, not formalities. Site A is
"ready to move to a recommendation" precisely because its *technical* constraint is decidable; it is not
"ready to buy".

**Halcyon at Site A is not recoverable commercially.** The only routes are relaxing the site design minimum
or obtaining a verified re-rated envelope — both Engineering Authority decisions, both absent, and neither
assumed here (R13).

### 9.2 Site B — hold. No award. No commitment.

**Decision: Site B cannot be awarded to any declared vendor. The deciding constraint is current coastal
certification evidence. Hold the site; do not commit expenditure; do not set an energisation date.**

- All three units satisfy Site B's **temperature** requirement (−4 °C: +16 / +11 / +6 K margin).
- All three satisfy the **dimensional** requirement *conditionally*, on an unmeasured assumption.
- **None** satisfies the **binding coastal requirement**. Kestrel and Solaris declare no certification
  (E5); Halcyon's is merely "expected" (E4). **0 of 3 compliant.**
- The requirement is **compound**: a coastal-rated warranty *and* a current certificate substantiating it.
  No vendor satisfies both (§5.1).

**The two Site B gates, both hard:**

- **G-B1 — Coastal certificate on file.** A certificate passing **all** of §5.2 A1–A5: a certificate
  document (not a table entry), for the exact quoted model, **currently valid in 2026**, verifiable with a
  named issuer, with validity compatible with its intended use. A 2024 coastal column does **not** satisfy
  G-B1. An expected certificate does **not** satisfy G-B1. Only a certificate **on file** does.
- **G-B2 — Corridor measured.** A physical survey of the usable corridor, including installation, airflow
  and service clearance. The 1200 mm baseline is an **assumption and is not a measurement**; it cannot
  close this gate, only the survey can.

**Explicitly not permitted at Site B:**

- A **conditional or "subject to certification" award** to Halcyon, or to anyone. The requirement is
  binding, and a conditional award converts a compliance gap into a contractual dispute later (R03).
- **Ordering units now** in anticipation of a certificate. That is at-risk inventory and may only be done
  if the Project Sponsor accepts the cancellation and restocking exposure **in writing**, with the
  certificate still not deemed to exist.
- **Substituting a 2024 column, a datasheet claim, or a verbal assurance** for a current certificate.
- **Setting an energisation date.** No defensible date exists (§7.2).

### 9.3 What this package does not do

- It does **not approve expenditure**, commit funds, authorise a purchase order, or reserve manufacturing
  capacity.
- It does **not** declare any vendor compliant for Site B.
- It does **not** accept the 1200 mm corridor as measured, or Halcyon's 2026 certificate as held.
- It does **not** treat the 2024 coastal column as a current certificate.
- It does **not** assert any cost, price, budget or total.
- It does **not** approve a Site B schedule.
- It does **not** decide any change to a site design requirement.

### 9.4 Decision summary table

| | Site A | Site B |
|---|---|---|
| **Deciding constraint** | Design minimum **−12 °C** | **Current coastal certificate** |
| **Eligible units** | Kestrel-900 ✓, Solaris-800 ✓, Halcyon-850 ✗ | **None** |
| **Recommended unit** | Kestrel-900 (Solaris-800 alternate) | None — hold |
| **Confidence** | Medium-High (contingent on margin policy and hot-side data) | **High** — the gap is explicit in the sources |
| **Cost position** | Unassessable | Unassessable |
| **Schedule position** | 8-week lead known; downstream durations unknown | **Not schedulable** |
| **Next action** | Sponsor sets ceiling; Engineering states margin policy | Compliance runs G-B1; Survey runs G-B2 |
| **Authority required** | Project Sponsor (budget) | Compliance/QA (certificate acceptance) |

### 9.5 Actions

| # | Action | Owner | Gate | Priority |
|---|---|---|---|---|
| A-1 | Supply site loads, peak demand and redundancy policy | Engineering Authority | C-A4 | **P1** |
| A-2 | Define FAT protocol at the site design minimum (−12 °C Site A) | Engineering Authority | C-A2/A-4 | **P1** |
| A-3 | Confirm site maximum ambient / intake temperature, both sites | Engineering Authority | C-A3, T8 | **P1** |
| A-4 | Obtain written quotations: price, delivery terms, warranty, validity | Procurement | C-A5, §6.4 | **P1** |
| A-5 | Make a current coastal certificate a **condition of Site B award**, vendor-borne cost | Procurement / Legal | G-B1 | **P1** |
| A-6 | Commission the Site B corridor survey | Survey / Engineering | G-B2 | **P1** |
| A-7 | Require certification maintenance or term alignment versus warranty term | Legal | R12 | P2 |
| A-8 | State the Site A margin policy explicitly | Engineering Authority | C-A2, T6 | **P1** |
| A-9 | Set the authorised budget ceiling | Project Sponsor | C-A1, R09 | **P1** |
| A-10 | Re-run §5.2 on any certificate received; record rejections | Compliance/QA | T4, T5 | Ongoing |
| A-11 | Revalidate all E2 vendor data at award | Procurement | R14 | At award |

### 9.6 Authority statement

**This package is a recommendation to a decision-maker. It is not a decision.**

Expenditure authority is not held by the author of this package and is not exercised here. No line of this
document authorises spend, commits funds, or binds the organisation. The decisions described in §9.1 and
§9.2 require, at minimum:

| Decision | Required authority | Status |
|---|---|---|
| Site A award and budget | Project Sponsor (with Finance) | **Not given** |
| Site A technical eligibility and margin policy | Engineering Authority | **Not given** |
| Site B coastal certificate acceptance | Compliance/QA | **Not given** |
| Any change to a site design minimum | Engineering Authority | **Not sought** — and not recommended as a workaround |

Role holders are named by function, not by person, because the sources declare no organisational structure.
The Sponsor must designate accountable individuals before any award.

### 9.7 Re-validation triggers

Re-issue this package, rather than edit conclusions in place, if any of the following occurs: a coastal
certificate is produced (T4) · a corridor measurement arrives (T1–T3) · the margin policy is stated (T6) ·
a site design minimum changes (T7) · hot-side ambient data arrives (T8) · price or quantity data arrives
(T9) · any source in Appendix A is superseded (R14) · anything appears in `inbox/`.

### 9.8 Reviewer's checklist

- [ ] Both deciding constraints are named and are the *actual* binding ones (§2).
- [ ] Halcyon is rejected at Site A on temperature, not on warranty (§9.1).
- [ ] All three units are rejected at Site B on certification — not two of three (§5.3).
- [ ] The 2024 coastal column is rejected on **two** independent grounds, A1 and A3 (§5.4).
- [ ] The "expected" 2026 certificate is rejected as evidence, not deferred (§5.4).
- [ ] The Site B corridor is treated as an unmeasured assumption and can change the eligible set (§4.4).
- [ ] Site A's 1200 mm limit and Site B's 1200 mm corridor are not treated as the same quantity (§4.3).
- [ ] No monetary figure appears, and the absence is justified rather than glossed (§6.1).
- [ ] No expenditure is approved anywhere in the document (§9.6).

---

## 10. Appendices

### 10.1 Appendix A — source register

| Path | Contents | Commit |
|---|---|---|
| `TASK.md` | Task definition; scope; the prohibition on unverified claims and unauthorised spend; the `inbox/` instruction | `9b8a94e` |
| `sources/sites.md` | Site A (−12 °C, 1200 mm limit, no coastal requirement); Site B (−4 °C, binding coastal warranty, 1200 mm corridor **assumption**); the currency rule for coastal evidence | `9b8a94e` |
| `sources/vendors.md` | Warranty terms; coastal status for all three vendors, including Halcyon's unverified "expected" certificate | `9b8a94e` |
| `sources/capacity.csv` | Temperature limits, unit width, lead time for the three units | `9b8a94e` |
| `inbox/` | Expected location for new measured updates | **Absent / empty** |

No source outside these paths was used. No external data, price list, specification sheet or certificate
was consulted, and none is assumed to exist.

### 10.2 Appendix B — calculation tables

**Cold margin** = unit minimum temperature − site design minimum (positive = margin, negative = shortfall):

| Unit | Min °C | Site A: −(−12) | Margin | Site B: −(−4) | Margin |
|---|---|---|---|---|---|
| Kestrel-900 | −20 | −20 + 12 | **+8 K** | −20 + 4 | **+16 K** |
| Solaris-800 | −15 | −15 + 12 | **+3 K** | −15 + 4 | **+11 K** |
| Halcyon-850 | −10 | −10 + 12 | **−2 K** | −10 + 4 | **+6 K** |

**Width headroom** = limit − unit width:

| Unit | Width | Site A (1200 mm rule) | Site B (1200 mm assumption) |
|---|---|---|---|
| Kestrel-900 | 900 | 300 mm | 300 mm * |
| Solaris-800 | 800 | 400 mm | 400 mm * |
| Halcyon-850 | 850 | 350 mm | 350 mm * |

`*` Conditional on an unmeasured corridor; see §4.4 and gate G-B2. All figures are E2 declared
specifications, not measurements.

**Compliance count — Site B:** eligible on temperature = 3/3; compliant on coastal = **0/3**.

### 10.3 Appendix C — coastal certificate acceptance checklist

Use verbatim at any submission. Any "no" fails the requirement.

- [ ] **A1** Is it a certificate document with issuer, certificate number and scope — not a table cell, not a datasheet line?
- [ ] **A2** Does it name the **exact model/variant/part number** being quoted?
- [ ] **A3** Is it **currently valid** — a current 2026 certificate, in date, not expired, not withdrawn? (A 2024 document fails here.)
- [ ] **A4** Is the issuer identifiable, and has the certificate been **verified with that issuer**?
- [ ] **A5** Is its validity compatible with its intended use — certificate term versus warranty term?
- [ ] Is the corresponding **warranty explicitly coastal-rated** in the contract?
- [ ] Is the certificate referenced in the warranty terms, so the two cannot drift apart?
- [ ] Is the submission recorded, with date received and reviewer, in the compliance log?

### 10.4 Appendix D — inbox check log

| Check | Time | Result |
|---|---|---|
| At start of work | — | `inbox/` directory **does not exist** |
| Before finalising | — | `inbox/` directory **does not exist**; no measured update received |

No measured update has been incorporated. Should one arrive, §9.7 requires re-issue rather than in-place
editing of conclusions.

### 10.5 Appendix E — glossary

| Term | Meaning here |
|---|---|
| **Deciding constraint** | The single binding requirement that determines a site's outcome — the one that eliminates candidates or blocks award |
| **Coastal-rated warranty** | A warranty term explicitly covering coastal/corrosive exposure, substantiated by a current certificate |
| **Current certificate** | A certificate valid at the award date in the current (2026) cycle — not a prior-year entry, not a forecast |
| **E1–E5** | Evidence grades defined in §3.2 |
| **Gate (G-xx)** | A condition that must be *closed with evidence* before an award or commitment may proceed |
| **Assumption** | A value used in the absence of measurement, explicitly labelled and **not** decision-grade (Site B corridor) |
| **Unverified claim** | A vendor assertion with no supporting document on file (Halcyon's expected certificate) |
| **Hard fail** | Failure at zero margin, therefore failing under any margin policy — Halcyon at Site A |
| **FAT** | Factory acceptance test; the control that converts declared (E2) performance into verified (E1) performance |
| **TCO** | Total cost of ownership, per the symbolic model in §6.2 — **not computed here** |

---

*End of package. Status: DRAFT FOR REVIEW — RECOMMENDATION ONLY, NOT AN APPROVAL, NOT AN AUTHORISATION TO SPEND.*
