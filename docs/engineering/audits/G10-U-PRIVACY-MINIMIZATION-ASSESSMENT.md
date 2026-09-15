# G10-U Privacy-Minimization Assessment

Audit of the delivered **G10-U Proof Vault web vertical** (`web/src/proof_vault/**`, `web/src/api.ts`
proof helpers, `web/src/App.tsx` surface switch) against six privacy-minimization hazards, plus one
additional ingestion hazard. Each hazard is answered with a verdict, the UI evidence, and any wording
correction or guardrail applied.

Verdict vocabulary: **NO** (hazard not present), **PARTIAL** (a narrower true statement exists),
**YES** (hazard present).

Method: read the shipped UI/HTTP code paths (`web/src/proof_vault/ProofVaultView.tsx`,
`web/src/proof_vault/parts.tsx`, `web/src/api.ts`), the server routes it calls
(`src/application/http.ts` proof/disclosure routes), the canonical modules they delegate to
(`src/proof_asset/{evidence,disclosure,materialize_selector,extraction,blob}.ts`), and the browser E2E
that exercises the surface over the real product stack (`e2e/proof-vault.spec.ts`).

---

## Q1. Does the product call a supported claim "truth"?

**Verdict: NO.**

UI evidence:

- The Proof Vault header states the built-in non-claim verbatim: "local, evidence-governed proof
  assets; **no truth, health, or legal assertion**" (`ProofVaultView.tsx`, header).
- The Proof Assets panel exposes only `baseStanding` / `effectiveStanding` (`SUPPORTED`,
  `PARTIALLY_SUPPORTED`, `CONTRADICTED`, `INCONCLUSIVE`, `STALE`) and `freshness` — both are derived
  policy outputs, never a truth value (`web/src/api.ts` `ProofClaimStanding`/`ProofFreshness`).
- The detail view renders the verification **policy** (`proof.default-verification`) next to the
  standing, making clear a named policy produced it.
- A `grep` of `web/src/proof_vault/**`, `web/src/App.tsx`, and the proof helpers in `web/src/api.ts`
  finds no rendered "truth"/"proven"/"fact" wording.

Correction / guardrail: none required in shipped copy. The header's explicit "no truth … assertion"
sentence is the guardrail. Any future copy must say "evidence-backed claim with a derived standing",
never "true" or "proven".

## Q2. Does the product imply legal validity?

**Verdict: NO.**

UI evidence:

- No legal/notary/certificate vocabulary exists in the Proof Vault. The exports are labelled
  "Approve & Export (separate explicit action)"; the receipt is described as a "LOCAL write
  acknowledgement only. It asserts no recipient receipt, no authentication, and no acceptance."
  (`DisclosurePanel`).
- A published claim is shown as an opaque `pc-…` claim id with a claim type (`proof.statement@v1`),
  not as a signed instrument, seal, or credential.
- The audit contract in `src/proof_asset/index.ts` (`Claim ≠ Truth`, `PublishedClaim ≠ Authority`)
  is reflected by the UI's vocabulary; the UI adds no stronger claim.

Correction / guardrail: the disclosure outcome copy explicitly disclaims authentication and acceptance.

## Q3. Does the product hide remote model exposure?

**Verdict: NO** (exposure is surfaced before any analysis; the installation binding is reported
honestly as unknown).

UI evidence:

- The **Analyze with Explore** tab has a dedicated "Exposure — what would go to the model, before
  running" section (`data-testid="analyze-exposure"`) that lists, for every selected EvidenceItem,
  its `evidenceId`, `selector` (the exact source portion), the source revision, and
  "**model / provider: unknown (this installation exposes no model binding for analysis)**". This is
  rendered *before* the Analyze button acts.
- The Sources detail shows "model / provider: unknown (this installation exposes no model binding for
  sources)".
- Analysis is a separate tab, a separate button, and the panel states "Analysis is a separate explicit
  action; it never publishes a proof claim and never approves disclosure."
- The extraction service sends only **selector-materialized** selections to a branch, and only when
  `reasoningBranchExecution` is wired (`src/proof_asset/extraction.ts`
  `buildEvidenceBoundReasoningContext`); an unwired install returns `capability_required` and sends
  nothing. The E2E session leaves branch execution unwired, so `analyze` returns
  `capability_required` — no bytes leave the process.
- Binary (non-textual) media is never decoded into a prompt: extraction substitutes a
  digest/byte-count placeholder (`isTextualMediaType` / `binaryPlaceholder`).

Correction / guardrail: the UI refuses to fabricate a provider name. It reports "unknown" rather than
naming a model that this installation does not expose.

## Q4. Does the product claim excerpt export while writing the whole source?

**Verdict: NO.**

UI evidence:

- A preview lists `preview.materials[]` — one entry per evidence — each with its
  `materializationKind` (`TEXT_EXCERPT` / `JSON_VALUE` / `ORIGINAL_SOURCE`), its `selector`, its media
  type, and the deterministic `fileName` (e.g. `evidence-<evidenceId>.txt` for a text excerpt). The
  UI renders exactly these (`data-testid="disclosure-material-file"`).
- The E2E asserts the previewed excerpt file name for a `TEXT_RANGE` evidence is
  `evidence-<evidenceId>.txt` and that the preview shows `TEXT_EXCERPT`
  (`e2e/proof-vault.spec.ts`, step 11).

State plainly: excerpts are materialized by selector. `materializeSelection`
(`src/proof_asset/materialize_selector.ts`) resolves a `TEXT_RANGE` to exactly the selected UTF-8
slice (`.txt`) and a `JSON_POINTER` to exactly the selected canonical-JSON value (`.json`).
Whole-source bytes are used **only** for `WHOLE_SOURCE` evidence, and that case emits the mandatory
warning `"exporting this evidence discloses the entire source blob"`
(`DISCLOSURE_WHOLE_SOURCE_WARNING`), which the UI renders as
`data-testid="disclosure-whole-source-warning"`. The local exporter fails closed: it materializes and
digest-verifies every material before writing anything, and it **never** falls back to the surrounding
source bytes when a selector fails (`localDisclosureExporter.export`, same module).

Correction / guardrail: none required. The preview is byte-level honest because the preview manifest
itself carries the selector and materialization kind that the bundle and export reuse.

## Q5. Does the product imply sharing / delivery?

**Verdict: NO.**

UI evidence:

- The only disclosure action verbs are **Preview** and **Approve & Export**. There is no Send, Email,
  Upload, Share, or deliver affordance anywhere in the Proof Vault.
- The receipt and history rows are labelled `EXPORTED` (a local write acknowledgement) with
  `purpose`, `audienceLabel`, `exportedAt`, `bundleDigest`, and `exporterId` — no recipient identity,
  no delivery, no acceptance.
- The browser E2E asserts that none of the seven capitalized delivery/exposure verbs
  (`Send`, `Share`, `Delivered`, `Email`, `Upload`, `Received`, `Accepted`) are rendered on the
  disclosure surface (`e2e/proof-vault.spec.ts`, final assertion block).
- `DisclosureService` has no federation send, boundary attach, e-mail, or upload path; the only
  effect is the local exporter writing under a caller-supplied root (`src/proof_asset/disclosure.ts`
  header).

Correction / guardrail: the export outcome copy says "It asserts no recipient receipt, no
authentication, and no acceptance." (`Exported ≠ Received`, `Admission APPROVE ≠ Authentication`).

## Q6. Does the product claim encryption?

**Verdict: NO, not implemented and not claimed.**

UI evidence:

- The Proof Vault renders no encryption, security, or "protected" wording. The only storage statements
  are the import facts ("stores the source locally") and the local write acknowledgement.
- The blob vault is plaintext content-addressed storage; its module header
  (`src/proof_asset/blob.ts`) states "There is NO encryption-at-rest claim, no key management, no
  credential/VC/DID/ZK machinery", and its `chmod` calls are best-effort inside `try/catch`.
- Transport is not implemented in the proof/disclosure plane at all.

Correction / guardrail: none required; documentation continues to describe "local, unencrypted
storage with best-effort file modes".

## Q7. Does the product ingest the filesystem implicitly? (additional privacy-minimization check)

**Verdict: NO.**

- Bytes enter only through the import form's explicit file choice / drag-drop and an explicit
  "I confirm this import" checkbox, then POST to `/api/proof/sources/import`
  (`SourcePanel.importSource` via `proofImportSource`).
- Source identity is `(sourceId, revision, contentDigest)`; no absolute path enters semantic identity,
  and the UI shows only metadata plus digests. The import form derives a `sourceId` from the file name
  but never persists a filesystem path.
- Content is read back only by the explicit "Preview content (explicit)" action
  (`proofReadExplicit` → `POST /api/proof/sources/read_explicit`); no automatic content read occurs on
  list or revision inspection.
- The import is bounded client-side at 750 KB of base64 and refuses with no partial write
  (`MAX_IMPORT_BASE64_BYTES`, `SourcePanel`).

---

## Summary table

| # | Hazard | Verdict | Key UI evidence |
| --- | --- | --- | --- |
| 1 | Calls a supported claim "truth" | NO | only derived standings; header states "no truth … assertion" |
| 2 | Implies legal validity | NO | opaque `pc-…` claims; receipt copy disclaims authentication/acceptance |
| 3 | Hides remote model exposure | NO | pre-run Exposure panel; provider reported "unknown" |
| 4 | Claims excerpt, writes whole source | NO | preview lists selector + `materializationKind`; exporter materializes by selector, no fallback |
| 5 | Implies sharing / delivery | NO | only Preview + Approve & Export; E2E asserts no delivery verbs |
| 6 | Claims encryption | NO | no encryption wording; plaintext content-addressed blob vault |
| 7 | Implicit filesystem ingestion | NO | explicit file + confirm; explicit `read_explicit` only |

## Shipped guardrails (corrections applied to copy)

- Proof Vault header: "local, evidence-governed proof assets; no truth, health, or legal assertion".
- Sources empty state: `"Importing stores the source locally and does not send it to a model. Analysis
  is a separate explicit action."` (asserted verbatim in the browser E2E).
- Evidence panel: "Opaque sources allow only WHOLE_SOURCE; no OCR."
- Analyze exposure: provider reported as "unknown" when not exposed; "never publishes a proof claim and
  never approves disclosure".
- Disclosure: whole-source warning rendered verbatim; export outcome is a "LOCAL write
  acknowledgement only … no recipient receipt, no authentication, and no acceptance".

## Residual risks (not claims in either direction)

- The E2E test session wires a `disclosureAdmission` that returns `APPROVE` (a deterministic test
  seam). In a real install without an admission port, export fails closed with
  `capability_required`; the UI renders that honestly.
- The Proof Vault reaches no store directly, but the bearer token is still the only HTTP gate; it is
  authentication of the client, never semantic approval (the export admission is separate).
