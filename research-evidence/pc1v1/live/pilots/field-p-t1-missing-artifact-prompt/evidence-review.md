# Evidence review — Riverton three-site PM2.5 study

Status: **analysis only; no source accepted; no approval implied.**
Basis: project revision 0, head `d605564`, observed 2026-03-02 09:00 UTC.

## 1. What kind of material each source is

| Material | What it is | Standing |
|---|---|---|
| `PROJECT.md` | Project brief: three sites, requirements, 7200 cap | Requirements R1-R6 are accepted for purpose in the current ProjectIR; the brief itself is project intent |
| `sources/site-conditions.csv` | Declared site humidity, temperature, mains and network conditions | Project observation/assumption; not an independently accepted external source |
| `sources/equipment.csv` | Unit cost, availability, lead time, and vendor humidity/uncertainty claims | Cost/availability/lead are procurement data; `claimed_humidity_*` and `claimed_uncertainty_*` are **manufacturer claims** |
| `sources/lab-samples.csv` | Eight bench samples, all values in ug/m3 | Observed bench data; small, and not yet an accepted source |
| `sources/measurement-notes.md` | Notes on test provenance, small sample, mixed-model needs, battery/offline/install facts | Project notes; some are scenario-established engineering facts, not independent measurements |
| `sources/procurement-summary.md` | Procurement inclination toward Echo | Secondary summary that explicitly transcribes the Echo brochure; **not** a second independent study and not an approval |

Key source-independence point: the Echo brochure and the procurement summary are not two independent conclusions. The procurement summary repeats the brochure. `equipment.csv` labels Reference `vendor_brochure_with_independent_validation`, but the independent validation visible here is only the sparse bench data, not the full RH 20-95% claim or a total uncertainty budget.

## 2. Observed bench errors

Signed error = measured - reference; absolute error in ug/m3.

| ID | Model | RH % | T C | Reference | Measured | Signed | Abs | <=3? |
|---|---|---:|---:|---:|---:|---:|---:|---|
| L01 | Echo | 40 | 20 | 10 | 11.1 | +1.1 | 1.1 | yes |
| L02 | Echo | 45 | 21 | 15 | 14.2 | -0.8 | 0.8 | yes |
| L03 | Echo | 50 | 21 | 20 | 21.2 | +1.2 | 1.2 | yes |
| L04 | Echo | 60 | 22 | 25 | 25.7 | +0.7 | 0.7 | yes |
| L05 | Reference | 45 | 20 | 10 | 10.4 | +0.4 | 0.4 | yes |
| L06 | Reference | 90 | 20 | 20 | 20.6 | +0.6 | 0.6 | yes |
| L07 | Reference | 95 | 18 | 30 | 29.1 | -0.9 | 0.9 | yes |
| L08 | Reference | 75 | 22 | 15 | 15.8 | +0.8 | 0.8 | yes |

Summary: Echo n=4, RH 40-60%, mean signed +0.55, mean absolute error 0.95, max absolute error 1.2. Reference n=4, RH 45-95%, mean signed +0.23, mean absolute error 0.68, max absolute error 0.9. All eight tested points are within +/-3 (and within +/-2). No observed failure signal.

This does **not** mean the +/-3 target is demonstrated across the sites. The samples are point bias checks, not a full uncertainty budget, and coverage is incomplete.

## 3. Coverage against the actual site ranges

| Site | RH range | Echo observed | Reference observed | Evidence status |
|---|---:|---|---|---|
| S1 | 35-65% | 40, 45, 50, 60 (4 points) | 45 (1 point) | Echo partial (40-60); Reference largely unobserved; both ends of 35-65 untested |
| S2 | 80-95% | none | 90, 95 (2 points) | Echo **undetermined** (brochure only); Reference partial (90-95; 80-90 interpolation) |
| S3 | 70-90% | none | 75, 90 (2 points) | Echo **undetermined** (brochure only); Reference supported at 75/90 but 70-75 and the interior sparse |

No site/model cell has observations bracketing both endpoints of its actual humidity range. Echo has **zero** observations above 60% RH; using Echo at S2 or S3 therefore relies entirely on the brochure claim. Reference is the better-covered model at high humidity, but its S1 coverage is one point at 45% RH.

## 4. Units, QA and comparability

- The lab table uses ug/m3 throughout; no conversion error is visible. However, the notes require raw units to be unified before mixing data, and no raw instrument files or conversion records are shown. Treat unit integrity as an open verification item.
- The reference values are treated as error-free; no reference-method uncertainty, traceability, sample dates, instrument IDs or detection limits are supplied.
- Temperature coverage is 18-22 C, while the sites range 9-26 C. Cold-end performance is untested and temperature/humidity are confounded.
- There are no replicates, standard deviations or confidence intervals. Four points per model cannot establish a population-wide confidence interval.
- Bench performance is not field performance. S2 adds no mains and no network; Echo also lacks offline storage. Those are deployment constraints separate from accuracy.
- If two models are mixed, the notes require pre-deployment cross-calibration, a unified time base, data-integrity and anomaly checks, and raw-unit unification. No evidence of those steps is present for the bench data.

## 5. Conclusions

1. **Accepted facts:** R1-R6 and the 7200 cap are the current accepted-for-purpose project requirements. No external source has been accepted; no promotion exists.
2. **Observed:** all eight tested bench points are within +/-3, with max absolute errors 1.2 (Echo) and 0.9 (Reference).
3. **Manufacturer claim only:** Echo RH 20-95%, +/-2 ug/m3. The procurement summary is not independent corroboration.
4. **Undetermined:** Echo at S2 (80-95%) and S3 (70-90%); Reference at most of S1 (35-65%).
5. **Candidate:** Reference is the better-supported model for a high-humidity three-site design, but the current evidence does not fully demonstrate R3 at every site. Echo-only is not supportable at S2/S3 on present evidence.
6. **Required next step:** targeted supplemental humidity verification before deployment, plus source/plan approval by the operator. Do not claim the target is met or the plan is approved.

## 6. Open questions

- Will the operator accept the lab data and the plan as sources for this purpose?
- Can the Reference units be tested at 35, 65 and 80% RH (and Echo, if considered, at 70/80/90/95%) with at least 3 replicates and temperature bracketing 9-26 C?
- Is the existing 600 calibration/cross-check line sufficient, or is a separate chamber-test quote needed?
- What raw-unit and calibration records exist, and who can certify them?
- Is a same-model spare required, given that all three available Reference units are consumed by the baseline?
