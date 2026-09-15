# G10-U Product Claims Audit (Proof Vault UI)

Audit of what the **G10-U Proof Vault UI** (`web/src/proof_vault/**`, `web/src/api.ts` proof helpers,
`web/src/App.tsx` surface switch) may truthfully claim to a product user. The seven-question style of
`G10-T-PRODUCT-CLAIMS-AUDIT.md` is reused: each question is answered with a verdict, the UI evidence,
and any wording correction. This audit also confirms that **MultiGraph is not the onboarding surface**
and that **no score (health/truth/synergy) exists** anywhere in the vertical.

Verdict vocabulary: **NO** (not claimed / not implemented), **PARTIAL** (a narrower true statement
exists), **YES** (claimed and implemented).

Method: read the shipped UI and its typed HTTP helpers, the canonical modules behind the routes, and
the browser E2E (`e2e/proof-vault.spec.ts`) that drives the 13-step flow over the real built product
stack (`dist/src` kernel + `dist/web` bundle). The audit reuses the G10-T server-side findings where
the UI is a thin face over the same canonical plane, and adds UI-specific evidence.

---

## Q1. Does the UI claim truth?

**Verdict: NO.**

- The Proof Vault header renders "local, evidence-governed proof assets; **no truth, health, or legal
  assertion**" (`ProofVaultView.tsx`).
- Assets show `baseStanding` / `effectiveStanding` / `freshness` only. `ProofClaimStanding` is a
  five-value derived vocabulary (`web/src/api.ts`), and the Why detail prints the producing
  verification policy (`proof.default-verification`) next to the standing.
- No rendered "truth", "proven", or "fact" wording exists in the proof UI.

**Correction:** none needed; the header sentence is the guardrail. Future copy must stay with
"evidence-backed claim with a derived standing".

## Q2. Does the UI imply legal validity?

**Verdict: NO.**

- No "legal", "notarized", "certificate", or "credential" wording is rendered. Claims are shown as a
  `pc-…` id with a claim type, and exports as `EXPORTED` local write acknowledgements.
- The export outcome text states: "This is a LOCAL write acknowledgement only. It asserts no recipient
  receipt, no authentication, and no acceptance."

**Correction:** the receipt disclaimer is the applied guardrail.

## Q3. Does the UI hide remote model exposure?

**Verdict: NO.**

- The Analyze tab renders an "Exposure — what would go to the model, before running" panel listing each
  selected EvidenceItem's `evidenceId`, selector (exact source portion), and source revision, with
  "model / provider: unknown (this installation exposes no model binding for analysis)".
- Analysis is a separate tab and a separate explicit button; the panel states it "never publishes a
  proof claim and never approves disclosure".
- Extraction fails closed when branch execution/content wiring is absent
  (`capability_required`); the E2E session exercises that honest path.

**Correction:** the UI reports "unknown" rather than inventing a provider/model, and the exposure panel
is rendered before the action, not after.

## Q4. Does the UI claim excerpt export while writing the whole source?

**Verdict: NO.**

- The preview renders each `preview.materials[]` entry with its `materializationKind`, `selector`,
  `mediaType`, and deterministic `fileName`; the E2E asserts the excerpt file name
  (`evidence-<evidenceId>.txt`) and `TEXT_EXCERPT` for a `TEXT_RANGE` evidence.
- Excerpts are materialized by selector (`src/proof_asset/materialize_selector.ts`); whole-source bytes
  are used only for `WHOLE_SOURCE` evidence, and that case renders the mandatory warning
  (`data-testid="disclosure-whole-source-warning"`). The exporter fails closed and never falls back to
  the whole source on a selector failure.

**Correction:** none needed — the preview's per-material manifest is byte-level honest.

## Q5. Does the UI imply sharing / delivery?

**Verdict: NO.**

- The only disclosure verbs are **Preview** and **Approve & Export**. The receipt/history render
  `EXPORTED` with purpose/audience/time/bundle/exporter — no recipient, delivery, or acceptance.
- The E2E asserts that the seven capitalized delivery/exposure verbs (`Send`, `Share`, `Delivered`,
  `Email`, `Upload`, `Received`, `Accepted`) do not appear on the disclosure surface.

**Correction:** the receipt disclaimer ("no recipient receipt, no authentication, no acceptance") is
the applied guardrail; `Exported ≠ Received`.

## Q6. Does the UI claim encryption?

**Verdict: NO.**

- No encryption/security wording is rendered anywhere in the Proof Vault.
- Storage statements are limited to the import fact ("stores the source locally") and the local write
  acknowledgement. The underlying blob vault is plaintext content-addressed storage with no
  encryption claim (`src/proof_asset/blob.ts`).

**Correction:** none needed.

## Q7. Does the UI auto-index the filesystem or silently ingest content?

**Verdict: NO.**

- Import requires an explicit file selection (or drag-drop) **and** an explicit confirmation checkbox,
  then a POST to `/api/proof/sources/import`.
- Content is read back only by the explicit "Preview content (explicit)" action
  (`POST /api/proof/sources/read_explicit`); listing/inspecting revisions shows metadata and digests
  only.
- The UI holds no filesystem path in semantic state and has no direct SQLite/blob access: every call
  goes through `fetch` in `web/src/api.ts`.

**Correction:** none needed.

---

## Confirmation: MultiGraph is not the onboarding surface

The Work header now offers **Proof Vault** as the product entry and keeps the existing
**MultiGraph 调试器** ("debugger") button next to it (`App.tsx`). The Proof Vault is a self-contained
product vertical with its own tabs; MultiGraph remains the advanced organizational debugger reached by
an explicit debugger-labelled control. The E2E opens "Proof Vault" directly from the Work header and
never routes through MultiGraph. The MultiGraph E2E still passes unchanged, confirming it is a
separate, non-onboarding entry.

## Confirmation: no score exists

No health, truth, synergy, confidence, or quality score is rendered anywhere in the Proof Vault. The
asset list/detail shows only: claim summary, claim type, `baseStanding`, `effectiveStanding`,
`freshness`, evidence count, the Why chain, dependencies, and append-only assessments. A token scan of
`web/src/proof_vault/**`, `web/src/App.tsx`, and the proof helpers in `web/src/api.ts` finds no
score/health/synergy wording.

---

## Summary table

| # | Question | Verdict | Key UI evidence |
| --- | --- | --- | --- |
| 1 | Truth? | NO | derived standings only; header "no truth … assertion" |
| 2 | Legal validity? | NO | opaque claims; receipt disclaimer |
| 3 | Hidden remote model exposure? | NO | pre-run Exposure panel; "model / provider: unknown" |
| 4 | Excerpt claim vs whole-source write? | NO | per-material selector + kind; whole-source warning; no fallback |
| 5 | Sharing / delivery implication? | NO | only Preview + Approve & Export; E2E asserts no delivery verbs |
| 6 | Encryption? | NO | no encryption wording; plaintext blob vault |
| 7 | Filesystem auto-index / silent ingest? | NO | explicit file + confirm; explicit `read_explicit` |

## Browser E2E evidence (`e2e/proof-vault.spec.ts`)

The single 13-step test asserts, in order: the verbatim Sources empty-state sentence; the imported
source row and revision digest; the explicit content preview; the created EvidenceItem; the published
asset's `SUPPORTED` standing; the Why chain (verification policy + exact evidence id); the newer
revision import; the `STALE` standing with the "newer revision" explanation; the disclosure preview's
exact excerpt file name and `TEXT_EXCERPT`; the separate Approve & Export; and the `EXPORTED` history
receipt with purpose, audience, and exporter. Its final block asserts that none of `Send`, `Share`,
`Delivered`, `Email`, `Upload`, `Received`, `Accepted` are rendered. `e2e/multigraph.spec.ts` re-runs
green, confirming no regression to the advanced debugger surface.

## Residual risks

- The published asset in the E2E is seeded through the exported canonical `ProofEvidenceService` over
  the same store because the application surface intentionally cannot accept a caller-declared
  freshness policy (needed to exercise genuine STALE). This is an honest API/UI gap: a product UI built
  **only** on `installed.application` cannot create a stale-able asset. It is not a truth/claim
  over-reach.
- The Analyze tab renders provider/model as "unknown" because the installation exposes no model
  binding; if an embedder wires a model-backed branch execution, the UI still cannot name the provider
  and continues to report "unknown" — never a fabricated name.
- Disclosure durability and multi-tenant isolation remain deployment responsibilities (see
  `G10-T-PRIVACY-SECURITY-BOUNDARY.md`).
