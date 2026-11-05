# Multi-Site Energy Deployment — Review Package

**Status:** Review package for decision. **Not** an expenditure approval.
**Scope:** Site A and Site B equipment selection and deployment readiness.
**Evidence base:** `sources/sites.md`, `sources/capacity.csv`, `sources/vendors.md`, and the measured inbox update `inbox/2026-11-03/corridor-measurement.md` (survey 2026-11-03). `inbox/` was re-checked before finalisation.
**Revision:** draft produced by the delegated worker; principal recovery corrected the Site B analysis to use the measured 700 mm corridor, which arrived after the worker's basis. The prior draft's 1200 mm corridor assumption is superseded and is not used as a fact anywhere below.
**Prepared by:** engineering review (non-authorising). No delegation of expenditure authority is recorded in the evidence base, so nothing in this document commits funds.

---

## 0. Decision summary (read this first)

| Site | Deciding constraint | Position | What is authorised now |
|---|---|---|---|
| **A** | **Design minimum temperature (cold margin) — it eliminates Halcyon-850** | **Conditional GO** to award recommendation: Kestrel-900 primary, Solaris-800 qualified alternate. Cold margin and width both satisfied; no coastal requirement applies. | Nothing is *approved* here. Proceed to priced offer + award approval by the accountable authority. |
| **B** | **Measured 700 mm corridor width — every candidate unit is too wide** | **NO-GO on current evidence.** The 2026-11-03 survey measures 700 mm; Kestrel-900 (900 mm), Halcyon-850 (850 mm) and Solaris-800 (800 mm) are all inadmissible. Independently, the binding coastal-rated warranty is unevidenced for all three vendors; Halcyon's "expected 2026" statement is a claim, not a certificate. | No award and no site works. Do **not** re-measure as if the width were unknown. Either select a ≤700 mm coastal-rated unit or scope corridor works, and obtain a current certificate. |

**Integrated decision:** deploy **Site A only**, and only after priced offers and an authority-approved budget exist. **Do not** bundle Site B into the same award: on the measured corridor alone there is no admissible unit, and the coastal-certificate gap independently bars award. **Do not** accept a 2024 coastal document or a promised 2026 certificate as satisfaction of the Site B requirement, and **do not** revive the superseded 1200 mm corridor assumption.

**Two facts that must not be restated as anything stronger:**
- A 2024 coastal column is **not** a current (2026) coastal certificate.
- An "expected" 2026 certificate is **not** a certificate on file.

---

## 1. Evidence discipline used in this package

Every statement below carries one of four labels. A claim never upgrades itself by repetition or by appearing in a vendor document.

| Label | Meaning | May support an award? |
|---|---|---|
| **MEASURED** | A measured value recorded in the declared sources | Yes, for the property measured |
| **SOURCE-STATED** | A datasheet/commercial figure declared in `sources/` | Yes, as declared (not independently tested) |
| **ASSUMPTION** | A working value explicitly flagged as unmeasured | No — must be replaced or bounded before award |
| **UNVERIFIED CLAIM** | A party's assertion about a future or unproduced fact | No — never |

---

## 2. Requirements as recorded

| Item | Site A | Site B | Label |
|---|---|---|---|
| Design minimum ambient | −12 °C | −4 °C | SOURCE-STATED (`sites.md`) |
| Design maximum ambient | **not stated** | **not stated** | **GAP** — maximum-temperature compliance cannot be tested at either site |
| Maximum admissible unit width | 1200 mm | **700 mm — MEASURED 2026-11-03** (survey); the earlier 1200 mm value was an assumption and is superseded | A: SOURCE-STATED / B: MEASURED (`inbox/2026-11-03/corridor-measurement.md`) |
| Coastal-rated warranty | Not required | **Binding** | SOURCE-STATED (`sites.md`) |

Unit data (`capacity.csv`, SOURCE-STATED):

| Unit | Min °C | Max °C | Width mm | Lead weeks |
|---|---|---|---|---|
| Kestrel-900 | −20 | 45 | 900 | 8 |
| Solaris-800 | −15 | 40 | 800 | 10 |
| Halcyon-850 | −10 | 35 | 850 | 12 |

---

## 3. Technical capacity assessment

Cold margin is computed as **site design minimum − unit minimum** (positive = the unit remains inside its rated envelope at the design minimum).

### 3.1 Site A (design minimum −12 °C, width ≤ 1200 mm, no coastal requirement)

| Unit | Cold margin | Cold verdict | Width vs 1200 mm | Max-temp verdict | Overall |
|---|---|---|---|---|---|
| Kestrel-900 | −12 − (−20) = **+8 K** | PASS | 900 mm — PASS (300 mm headroom) | **Cannot verify** (site max not stated) | **FEASIBLE** |
| Solaris-800 | −12 − (−15) = **+3 K** | PASS | 800 mm — PASS (400 mm headroom) | **Cannot verify** | **FEASIBLE** |
| Halcyon-850 | −12 − (−10) = **−2 K** | **FAIL — 2 K short** | 850 mm — PASS | **Cannot verify** | **NOT FEASIBLE** |

**Deciding constraint, Site A: design minimum temperature.** At −12 °C the Halcyon-850 would be operating 2 K below its rated minimum of −10 °C; that is a design-envelope failure, not a derating preference, and no width or warranty advantage repairs it. Width is not the deciding constraint (all three fit, and the 1200 mm limit is stated, not assumed).

**Site A candidate set: {Kestrel-900, Solaris-800}.**

- Kestrel-900 — larger cold margin (8 K vs 3 K), shorter lead (8 vs 10 weeks), narrower warranty (5 vs 7 years), 900 mm width.
- Solaris-800 — adequate cold margin (3 K), 7-year warranty, 10-week lead, 800 mm width (more width headroom if Site A's 1200 mm ever tightens).

**Recommendation:** Kestrel-900 as primary for Site A on robustness (8 K cold margin absorbs a colder-than-design winter) and schedule (2 weeks earlier). Hold Solaris-800 as the qualified alternate. The final choice is a **lifecycle-cost** decision, and lifecycle cost is not yet evidenced (Section 5) — so this recommendation is technical, not economic.

**Residual gap (both sites):** no design maximum ambient is recorded, so `max_c` compliance is **untested** for every unit. Before award, obtain the site design maximum; Halcyon has the least headroom (35 °C) and Kestrel the most (45 °C). This does not change Site A's outcome (Halcyon is already out on cold) but it is a live gate for any future re-selection.

### 3.2 Site B (design minimum −4 °C, binding coastal warranty, measured corridor 700 mm)

The corridor was measured on **2026-11-03 at 700 mm**. The earlier 1200 mm baseline is explicitly an assumption and is **superseded**; the measured item also states that the 900 mm unit is **NOT admissible** at Site B.

| Unit | Cold margin | Cold verdict | Width vs **measured 700 mm** | Coastal verdict | Overall |
|---|---|---|---|---|---|
| Kestrel-900 | −4 − (−20) = **+16 K** | PASS | 900 mm — **FAIL, 200 mm too wide** | **No certification declared** | **NOT ADMISSIBLE** |
| Solaris-800 | −4 − (−15) = **+11 K** | PASS | 800 mm — **FAIL, 100 mm too wide** | **No certification declared** | **NOT ADMISSIBLE** |
| Halcyon-850 | −4 − (−10) = **+6 K** | PASS | 850 mm — **FAIL, 150 mm too wide** | **Claim only ("2026 expected") — no certificate on file** | **NOT ADMISSIBLE** |

**Deciding constraint, Site B: the measured 700 mm corridor width.** Every candidate unit is wider than the measured corridor — by 100 mm (Solaris-800), 150 mm (Halcyon-850) and 200 mm (Kestrel-900). This is a physical admissibility failure that no certificate, price, lead time or warranty can repair. The admissible-unit count against the measured width is **0 of 3**.

**Independent second blocker at Site B: the binding coastal-rated warranty.** Even if a unit were narrow enough, no vendor holds a current coastal certificate on file. The certification gap is therefore not the *deciding* constraint (it is not what first excludes the units), but it independently bars award and would still do so after a width-compatible unit were found.

Temperature is comfortably satisfied by all three units (6–16 K of margin), so the thermal envelope is *not* the constraint at Site B.

**Consequence:** Site B can proceed only by changing the physical or product basis — select a unit no wider than 700 mm, or complete and cost corridor modification works — **and** obtain a current coastal certificate for the selected model. Neither is evidenced today. The 2026-11-03 measurement must not be overwritten by the old 1200 mm assumption.

### 3.3 Capacity conclusion

- Site A has a defensible technical selection **now**, subject to the unrecorded design maximum ambient.
- Site B has **no** admissible technical selection: the measured 700 mm corridor excludes every candidate unit, and the coastal-certificate requirement is independently unevidenced. The first blocker is physical, the second documentary; neither can be substituted by intent or by the old 1200 mm assumption.

---

## 4. Vendor compliance assessment

| Requirement | Kestrel | Solaris | Halcyon |
|---|---|---|---|
| Cold rating, Site A (−12 °C) | COMPLIANT (−20 °C, +8 K) | COMPLIANT (−15 °C, +3 K) | **NON-COMPLIANT** (−10 °C, −2 K) |
| Cold rating, Site B (−4 °C) | COMPLIANT (+16 K) | COMPLIANT (+11 K) | COMPLIANT (+6 K) |
| Width, Site A (≤1200 mm stated) | COMPLIANT (900) | COMPLIANT (800) | COMPLIANT (850) |
| Width, Site B (≤**measured** 700 mm) | **NON-COMPLIANT** (900 mm, +200) | **NON-COMPLIANT** (800 mm, +100) | **NON-COMPLIANT** (850 mm, +150) |
| Max ambient (site max not stated) | UNTESTABLE | UNTESTABLE | UNTESTABLE |
| **Coastal-rated warranty (Site B, binding)** | **NOT EVIDENCED** — none declared | **NOT EVIDENCED** — none declared | **NOT EVIDENCED** — claim of an "expected" 2026 certificate only |
| Warranty duration (declared) | 5 years | 7 years | 10 years |

**Coastal evidence findings**

1. **Halcyon:** the statement that a 2026 coastal certificate is "expected" is an **UNVERIFIED CLAIM**. It is not a certificate on file, it has no issuer, number, scope, or validity period in the record, and it creates no obligation on anyone. It cannot satisfy a binding requirement.
2. **Kestrel and Solaris:** no coastal certification is declared in any source. They are not "provisionally compliant"; they are **not evidenced**.
3. **A 2024 coastal column is not a current certificate.** If a 2024 document is later offered for a 2026 requirement, it is stale on its face and does not close the gap. Only a current, in-date certificate naming the specific unit model and the coastal rating scope will.

**Vendor compliance conclusion:** Site A has two compliant vendors and one disqualified vendor. Site B has **zero** width-admissible units against the measured 700 mm corridor and **zero** vendors with a current coastal certificate on file. Halcyon's 10-year warranty, though the most attractive commercially, is attached to a unit that is disqualified at Site A (cold) and both too wide and uncertified at Site B — it buys nothing in this deployment until the physical and certificate gaps are closed.

---

## 5. Cost / budget model

**Cost evidence status: NO COST DATA EXISTS IN THE DECLARED SOURCES.** No unit price, freight rate, balance-of-system cost, installation rate, commissioning cost, tariff, or escalation index is recorded. No budget figure is presented in this package, because any figure here would be invented rather than evidenced. Consequently **no expenditure is approved, and none should be inferred from this document.**

### 5.1 Cost model (structure fixed now, values supplied at gate G2)

Installed cost per site:

```
TIC_site = N_units x P_unit
         + C_BOS            (mounting, cabling, protection, controls)
         + C_freight        (delivery to site, inclusive of duties)
         + C_install        (labour, plant, access)
         + C_commissioning  (testing, witnessing, handover)
         + C_grid_connection
TIC_program = SUM(TIC_site) + C_project_mgmt + contingency + escalation
```

| Parameter | Value | Status | Needed by |
|---|---|---|---|
| N_units per site | not stated | **GAP** — site load/array sizing absent from sources | G1 |
| P_unit (per model) | not stated | **GAP** | G2 |
| C_BOS, C_install, C_commissioning, C_grid | not stated | **GAP** | G2 |
| C_freight | not stated | **GAP** | G2 |
| Escalation index | not stated | **GAP** | G2 |
| Contingency | **recommendation only:** ≥15% of TIC_program, because two material evidence gaps (coastal certificate, corridor measurement) and one untested parameter (site max ambient) remain open | Recommendation — approving authority to set | G2 |

**Cost consequences of the decision that *are* knowable:**

- Site A award is a **cost commitment** and requires an authority-approved budget that does not yet exist in the record. Lead time 8 weeks (Kestrel) vs 10 weeks (Solaris) affects when spend lands, not how much — the quantum is unknown.
- Site B deferral **defers** its capex; the amount deferred is unknown and must not be quoted as a "saving".
- A single-site (A-only) award loses any multi-site volume leverage; that effect is unquantified and should be priced at G2 if the authority wants the comparison.
- Site B cannot be priced as an equipment-only scope today. It needs either a ≤700 mm coastal-rated unit (market search and pricing) or corridor modification works (survey, design, construction, outage), and both are **unpriced**. Neither may be treated as zero or absorbed into contingency.
- Certification effort for Site B (vendor-side testing/certification) is a vendor cost exposure that will likely be reflected in price if a certificate is later produced; no estimate is possible from the record.

### 5.2 Budget gate

No purchase order, deposit, or framework commitment may be placed until: (a) priced offers are in, (b) TIC_program is calculated from those offers, and (c) the accountable authority approves that number in writing. This review holds no such authority.

---

## 6. Implementation schedule

Installation, commissioning and grid-connection durations are **not stated** in the sources; they are shown as `TBD (G2)` rather than invented. Procurement lead times are SOURCE-STATED.

| Phase | Site A | Site B | Note |
|---|---|---|---|
| G0 — this review | complete | complete | A conditional GO; B HOLD |
| G1 — evidence closure | site max ambient; unit count/sizing | **width-compatible unit (≤700 mm, or completed corridor works)**; **current coastal certificate per model**; site max ambient | Gate for B is hard and double-locked |
| G2 — priced offer + budget approval | award decision Kestrel-900 vs Solaris-800 | none until G1 passes | Authority approval required |
| Procurement lead | 8 weeks (Kestrel) / 10 weeks (Solaris) | **not schedulable** — no width-admissible unit; Halcyon's 12-week lead does not apply because Halcyon-850 is 150 mm too wide | Lead clock starts at PO, not at enquiry |
| Delivery & install | `TBD (G2)` | `TBD (G2)` | Site works cannot start before award |
| Commissioning & handover | `TBD (G2)` | `TBD (G2)` | Witnessed testing recommended |
| Earliest credible energisation | **PO + 8 weeks + TBD install/commission** (Kestrel path) | **unknown** — bounded below by (unit selection or corridor works) + current certificate + lead + TBD installation | B has no credible date, by design |

**Schedule logic**

- Site A's critical path today is the **award decision**, not the factory: 8–10 weeks of lead is short relative to the time an unapproved budget can consume. Compressing procurement by pre-ordering before budget approval is **not** available — that would be unauthorised expenditure.
- Site B's critical path has two independent locks: (1) **physical admissibility** — no candidate fits the measured 700 mm corridor, so a ≤700 mm unit or corridor works must be selected and engineered; and (2) **certification evidence**, which has no committed duration. Treat any date offered for Site B as an **UNVERIFIED CLAIM** until a width-compatible unit and a certificate number both exist. Do not sequence site works, grid bookings, or customer commitments against it.
- Two-site sequencing: A first is safe because A's feasibility is evidence-backed. Running B in parallel is only possible once both G1 locks pass; until then B is a placeholder, not a workstream. Corridor works, if chosen, add their own design and construction sequence that is not in this evidence base.

---

## 7. Risk and uncertainty register

Likelihood/impact are qualitative judgements of this review, not measurements.

| ID | Risk / uncertainty | Evidence status | L | I | Mitigation / treatment | Owner |
|---|---|---|---|---|---|---|
| R1 | **Site B awards without a current coastal certificate**, on the strength of an "expected 2026" claim | UNVERIFIED CLAIM | High if unmanaged | High (warranty void in a coastal environment; remediation at owner's cost) | Hard gate G1: certificate on file, current, model-specific. No PO without it. | Procurement + engineering |
| R2 | A **2024 coastal column** is accepted as if current | Stale document | Medium | High | Document-control rule: check issue/expiry date against the 2026 requirement; reject stale on sight. | Document control |
| R3 | **Measured 700 mm corridor excludes every candidate unit** — Kestrel-900 by 200 mm, Halcyon-850 by 150 mm, Solaris-800 by 100 mm | MEASURED (2026-11-03) | **Realised** | High (no admissible unit) | Do not order any current model for Site B. Select a ≤700 mm coastal-rated unit, or engineer, cost and authorise corridor modification. Re-run the width screen only against verified unit dimensions. | Site engineering + programme lead |
| R4 | **No cost data** → budget approved on guesswork or a verbal figure | GAP | High | High | Cost model in §5; no commitment before priced offers + written authority approval. | Commercial |
| R5 | **Halcyon selected at Site A** by commercial attraction, ignoring the −2 K cold shortfall | Design-envelope failure | Low (documented here) | High (unit outside rated envelope at design minimum; warranty and performance exposure) | Keep Halcyon off the Site A bid list; if proposed, require a re-rated datasheet and re-screen. | Engineering |
| R6 | **Site design maximum ambient unrecorded** → `max_c` untested | GAP | Medium | Medium | Obtain design max at G1; screen all units; Halcyon has least headroom (35 °C). | Engineering |
| R7 | **Lead-time slippage** (8/10/12 weeks are declared, not guaranteed) | SOURCE-STATED | Medium | Medium | Contractual delivery dates, liquidated damages where permissible, buffer in energisation commitments. | Procurement |
| R8 | **Single-site award loses volume leverage** on price | Unquantified | — | Low–Medium | Price A-only and A+B-conditional at G2; compare explicitly. | Commercial |
| R9 | **Scope/authority confusion** — this package mistaken for an approval | Process | Medium | High | This document states repeatedly that no expenditure is approved; award requires written authority. | Reviewer |
| R10 | **Certification chase becomes open-ended**, consuming engineering time | Process | Medium | Low–Medium | Time-box the evidence request; if no certificate by the G1 date, formally close Site B for this cycle. | Programme lead |
| R11 | **Superseded 1200 mm corridor assumption is reused** and a too-wide unit is ordered | Document-control failure | Medium if unmanaged | High | Treat `inbox/2026-11-03/corridor-measurement.md` as the controlling width; mark 1200 mm as superseded in every bid document and drawing. | Document control + engineering |

**Uncertainty that cannot be reduced by more analysis:** whether a coastal certificate will ever be issued for any of these models. That is a vendor fact, not an analytical one — which is exactly why Site B is held rather than estimated.

---

## 8. Integrated decision

### 8.1 Site A — CONDITIONAL GO (award recommendation, not approval)

Proceed on the **Kestrel-900** path (primary), with **Solaris-800** as the qualified alternate, subject to all of:

1. Design maximum ambient obtained and both units screened against it (R6);
2. Priced offer received and TIC_program calculated (§5);
3. Budget approved **in writing by the accountable authority** — an authority this review does not hold;
4. Award recorded with the cold margin (+8 K for Kestrel) and the 900 mm width stated as the accepted basis.

**Deciding constraint at Site A: design minimum temperature (−12 °C), which disqualifies Halcyon-850 at −2 K of margin.**

### 8.2 Site B — NO-GO / HOLD (no award, no works)

Site B cannot be awarded on the current evidence. The measured 700 mm corridor is narrower than every candidate unit, so there is **no admissible unit**; independently, the **binding** coastal-rated warranty is unevidenced for every vendor. This is not a price problem, a schedule problem, or a preference: it is a physical admissibility failure plus the absence of a document the requirement demands.

Exit conditions (all required before any Site B award):

1. A **width-compatible** unit (≤700 mm) selected and verified, **or** corridor modification works engineered, costed and authorised — the measurement is complete and is not to be repeated as if the width were unknown;
2. A **current** coastal certificate for the selected unit, on file, naming the specific model and coastal rating scope, from a recognised certification body — not a 2024 document, not an "expected" 2026 certificate, not a marketing statement;
3. Design maximum ambient obtained and the unit screened;
4. Site B costed (including corridor works if that route is chosen) and separately approved.

If no width-compatible unit or authorised corridor route exists, **or** no certificate is produced by the G1 date, close Site B for this deployment cycle and record it as **not deployable on current evidence** — that is a legitimate outcome, not a failure of the review.

**Deciding constraint at Site B: the measured 700 mm corridor, which excludes all three candidate units. The binding coastal-rated warranty is an independent second blocker.**

### 8.3 Program-level position

| Question | Answer |
|---|---|
| Can the program deploy both sites now? | **No.** Site B has no unit admissible against the measured 700 mm corridor and no current coastal certificate. |
| Can it deploy Site A now? | Technically yes; **commercially no** until budget approval. |
| Is any money approved by this package? | **No.** None. |
| What is the single highest-value next action? | Obtain priced offers for Kestrel-900/Solaris-800 and open the Site A authority approval — then, in parallel, search for a ≤700 mm coastal-rated unit (or scope corridor works) and issue the Site B certificate evidence request. |
| What would reverse the Site B decision? | **Both** a width-compatible (≤700 mm) unit or authorised corridor works **and** a current, model-specific coastal certificate on file. Neither alone is sufficient. |

---

## 9. Claims register — what may and may not be asserted

| Assertion | Permitted? |
|---|---|
| "Halcyon-850 meets Site A's −12 °C requirement" | **No** — it is 2 K short |
| "Halcyon is coastal-certified" | **No** — no certificate on file |
| "Halcyon will be coastal-certified in 2026" | **No** — that is the vendor's expectation, recorded as an unverified claim only |
| "A 2024 coastal column satisfies the coastal requirement" | **No** — not current for 2026 |
| "Site B's corridor is 1200 mm" | **No** — superseded assumption; the measured width is 700 mm |
| "Site B's corridor is 700 mm" | **Yes** — measured 2026-11-03 in `inbox/2026-11-03/corridor-measurement.md` |
| "Kestrel-900, Solaris-800 or Halcyon-850 fits Site B's measured corridor" | **No** — all exceed 700 mm |
| "Site B is blocked only by the coastal certificate" | **No** — the measured corridor independently excludes all candidate units |
| "The deployment is approved / funded" | **No** — no authority, no budget in the record |
| "Site A is technically feasible with Kestrel-900 or Solaris-800" | **Yes** — evidenced by `capacity.csv` vs `sites.md` |

---

## 10. Open items (blocking vs non-blocking)

| # | Item | Site | Blocking? | Needed by |
|---|---|---|---|---|
| 1 | Current coastal certificate, model-specific | B | **Yes** | G1 |
| 2 | **Width-compatible unit (≤700 mm) selected, or corridor works engineered/costed/authorised** — the 700 mm width itself is already measured (2026-11-03) | B | **Yes** | G1 |
| 3 | Design maximum ambient | A, B | Yes (max-temp screen) | G1 |
| 4 | Priced offers (Kestrel-900, Solaris-800; Halcyon only if re-rated) | A | Yes | G2 |
| 5 | Unit count / array sizing basis | A, B | Yes (cost + capacity) | G1 |
| 6 | Written budget approval by accountable authority | A | **Yes** | G2 |
| 7 | Installation / commissioning durations from contractor | A, B | No (schedule precision only) | G2 |
| 8 | Warranty term vs lifecycle cost comparison (5 vs 7 years) | A | No (economic preference) | G2 |

---

## Appendix A — Source excerpts used

- `sources/sites.md` — "Site A: design minimum −12 °C; maximum admissible unit width 1200 mm; no coastal requirement." / "Site B: design minimum −4 °C; a coastal-rated warranty is binding. The baseline corridor value of 1200 mm is an ASSUMPTION, not a measurement." / "A 2024 coastal column is not a current 2026 certificate. An expected certificate is not a certificate on file."
- `sources/capacity.csv` — Kestrel-900 −20/45 °C, 900 mm, 8 wk; Solaris-800 −15/40 °C, 800 mm, 10 wk; Halcyon-850 −10/35 °C, 850 mm, 12 wk.
- `sources/vendors.md` — Kestrel 5-year warranty, no coastal certification declared; Solaris 7-year, no coastal certification declared; Halcyon 10-year, "2026 coastal certificate expected", no certificate on file (unverified).
- `inbox/README.md` — inbox items are evidence only to the extent their own text states; a claim about a future certificate is not a certificate.
