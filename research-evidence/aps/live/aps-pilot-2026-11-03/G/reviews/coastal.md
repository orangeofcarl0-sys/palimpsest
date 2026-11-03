# Independent check — coastal-rating status

- **Project:** `aps`
- **Task:** `independent-check` — independently check the coastal-rating status.
- **Prepared:** 2026-11-03
- **Basis:** `bd86c1df89342a37f97b3099155618360b1b1dc4` plus the working-tree material listed below.
- **Status:** Review input for operator acceptance. This check does not accept the inbox note, select a vendor, or promote any result.

## Method

An independent read-only review was performed by a separate native subagent. It read `TASK.md`, `sources/sites.md`, `sources/vendor-capabilities.csv`, and `inbox/2026-02-10/vendor-update.md` in full, and listed the full repository tree and Git history to check whether any 2026 coastal certificate exists on file. It made no edits. This record transmits the reported result and its cited basis.

## Finding

**No vendor has a current 2026 coastal-rated warranty established by the declared material.**

| Vendor | `min_c` (°C) | `width_mm` | `coastal_2024` | 2026 coastal certificate on file? | Current 2026 coastal warranty established? | Meets Site B `min_c <= -4`? | Meets Site A `min_c <= -12` and `width_mm <= 1200`? |
|---|---:|---:|---|---|---|---|---|
| Kestrel | -20 | 900 | `no` | No | **No** | Yes | Yes |
| Solaris | -15 | 800 | `no` | No | **No** | Yes | Yes |
| Halcyon | -10 | 850 | `no` | No — inbox says "expected, but the certificate is NOT on file" | **No** (unverified claim only) | Yes | **No** — fails temperature (`-10 > -12`); width passes |

Sources: `sources/vendor-capabilities.csv` header line 1 and vendor lines 2–4; `sources/sites.md` lines 3–6; `inbox/2026-02-10/vendor-update.md` lines 3–4; `TASK.md` lines 5, 7–10.

## Strict distinctions checked

1. **The 2024 column is not a 2026 rating.** The only coastal field in the declared source table is `coastal_2024` (`sources/vendor-capabilities.csv` line 1), and it is `no` for all three vendors (lines 2–4). No vendor holds even a 2024 coastal rating, so the 2024-versus-2026 issue is not the only gap.
2. **Halcyon's inbox note is an unverified expectation, not a certificate on file.** The note says the manufacturer says a 2026 coastal certificate is "expected, but the certificate is NOT on file," and it directs that the statement be treated as an unverified claim, not a current coastal rating (`inbox/2026-02-10/vendor-update.md` lines 3–4). Reading the inbox is not accepting it (`TASK.md` line 5).
3. **No 2026 certificate is on file for any vendor.** The full repository tree and Git history contain only `TASK.md`, `sources/sites.md`, `sources/vendor-capabilities.csv`, and `inbox/2026-02-10/vendor-update.md` outside `.git`. There is no certificate document for Kestrel, Solaris, or Halcyon.
4. **Warranty duration is not coastal coverage.** `warranty_years` records `5`, `7`, and `10` years (`sources/vendor-capabilities.csv` lines 2–4); it does not state that the warranty is coastal-rated. It cannot be used to satisfy Site B's coastal requirement.
5. **`min_c` is a capability specification, not a warranty term.** It was compared to the site design minimums only as recorded.

## Conclusion for Site B

The Site B coastal requirement is **not satisfiable from the declared sources**. All three vendors meet the `-4 °C` minimum (`min_c` of `-20`, `-15`, and `-10`; `sources/vendor-capabilities.csv` lines 2–4), so temperature does not discriminate. The binding current 2026 coastal-rated warranty is the deciding gap, and no vendor has one on file.

**No vendor is selected for Site B on coastal grounds.** Halcyon's inbox note is not sufficient: it is an unverified, unaccepted expectation, and the certificate is expressly not on file. This record does not claim that Halcyon holds a current 2026 coastal certificate.

## Limits and uncertainty

- The inbox is observation material, not an accepted source (`TASK.md` line 5). An actual 2026 coastal certificate, admitted through the source-intake path, would be needed to change this conclusion.
- The inbox describes a certificate, not warranty terms; the scope and terms of any future coastal warranty are unknown.
- No field records a 2025-or-later coastal status, so "2026" is not attested in the accepted sources.
- This review supports the selection record at `deliverables/selection.md`; it does not replace the operator's acceptance decision.
