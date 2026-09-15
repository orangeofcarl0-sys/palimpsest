# G10-T Product Claims Audit (spec §41)

Audit of what the delivered Proof/Evidence plane and its product surface may truthfully claim. Each
of the seven spec §41 questions is answered with a verdict, the code evidence, and the correction
applied to any wording that could over-claim.

Verdict vocabulary: **NO** (not claimed / not implemented), **PARTIAL** (a narrower true statement
exists), **YES** (claimed and implemented).

---

## Q1. Does the product claim truth?

**Verdict: NO.**

- A `standing` is only ever a policy output (`ProofClaimStanding` in `src/proof_asset/claims.ts`).
  The default policy inspects only evidence *counts*; it asserts nothing about the world
  (`defaultProofVerificationPolicy`, `src/proof_asset/service.ts`).
- The public barrel header (`src/proof_asset/index.ts`) states the firewall: `Claim ≠ Truth`,
  `Freshness ≠ Truth`, `STALE ≠ FALSE`, `PublishedClaim ≠ Authority`.
- `ProofAssetView` carries `baseStanding`/`effectiveStanding`/`freshness` — never a truth value. The
  `PROOF_ASSET_VIEW_DOMAIN` naming and comment describe it as a derived view.

**Correction / guardrail:** product wording must say "evidence-backed claim admitted under a named
verification and publication policy, with a current derived standing" — never "verified true",
"proven", or "fact". The tool description for `palimpsest_proof` and the HTTP routes return
`standing`, not `truth`.

## Q2. Does the product claim legal validity?

**Verdict: NO.**

- There is no legal/notary/identity ontology anywhere in `src/proof_asset/**`. `G10-T` explicitly
  declined `PersonIdentity`/legal identity (see `G10-T-PROOF-ASSET-ASSESSMENT.md`, "T0 decisions").
- A published claim id is an opaque content-addressed `pc-…` reference minted in the proof namespace
  (`src/proof_asset/service.ts`), not a signature, seal, or instrument.
- The disclosure "receipt" is a **local write acknowledgement** (`DisclosureExportReceipt`,
  `src/proof_asset/disclosure.ts`) with fields `bundleDigest`, `purpose`, `audienceLabel`,
  `exportedAt`, `exporterId` — no legal effect.

**Correction:** never describe an export as a "certificate", "legal record", or "notarized
disclosure".

## Q3. Does the product claim encryption?

**Verdict: NO, not implemented and not claimed.**

- `localProofBlobStore` stores raw bytes at their sha256 address. It *attempts* `0700`/`0600` modes;
  the `chmodSync` calls are wrapped in `try/catch` and documented as best-effort. The module header
  states: "There is NO encryption-at-rest claim, no key management, no credential/VC/DID/ZK
  machinery."
- No cipher, key derivation, KMS, or TLS code exists in `src/proof_asset/**`. The adversarial source
  scan in `test/t_adversarial.test.ts` asserts no `encrypt`/`decrypt` token survives comment
  stripping.
- Transport is not implemented at all (no network client), so there is no "in transit" encryption to
  claim either.

**Correction:** documentation must say "local, unencrypted storage with best-effort file modes".
Any deployment requiring confidentiality-at-rest must supply it outside this plane.

## Q4. Does the product claim an authenticated recipient?

**Verdict: NO.**

- `DisclosureService.approveAndExport` produces a `DisclosureExportReceipt` that asserts only that
  **this exporter wrote bytes locally**. It carries no recipient identity, no delivery, no
  acceptance (`src/proof_asset/disclosure.ts`; asserted in `test/t_disclosure.test.ts`: the receipt
  has no `recipient`/`receivedBy`/`accepted` fields).
- HTTP authentication is explicitly **not** semantic approval: no proof/disclosure tool schema
  carries `authenticated`, `token`, `actor`, or `approved` fields (asserted in
  `test/t_adversarial.test.ts`). Export requires a separate `DisclosureAdmissionPort` returning
  `APPROVE`.

**Correction:** "export receipt" must never be presented as "delivery confirmation" or "recipient
acknowledgement". `Exported ≠ Received`, `Admission APPROVE ≠ Authentication`, `Bundle manifest ≠
Recipient acceptance`.

## Q5. Does the product claim cryptographic selective disclosure?

**Verdict: NO.**

- Selection is a **plaintext projection** over published claims and their published dependency
  closure (`collectClosure`, `src/proof_asset/disclosure.ts`). The preview, bundle manifest, and
  exported source files are readable by anyone with filesystem access.
- There is no zero-knowledge proof, commitment scheme, accumulator, or attribute-based encryption.
  The adversarial scan asserts no `zero-knowledge`/`zk`/`VC`/`DID` token.

**Correction:** describe the feature as "purpose-scoped **selection and local bundling**", not
"cryptographic selective disclosure".

## Q6. Does the product silently send content to a model?

**Verdict: NO.**

- Source import is explicit and deterministic: `importSource` hashes the supplied bytes and records a
  revision. It invokes no policy and no model. A spy verification policy records **zero** calls after
  two imports (`test/t_proof_asset.test.ts`, "triggers no verification/model call during import").
- The proof plane imports no provider/model/network module (source scan: no `http(s)://`, no
  `transport`, no `.send(`).
- Verification/admission are injected policy ports. If an embedder wires a model-backed policy, the
  input is the candidate + evidence metadata + dependency standings (`ProofVerificationInput`) —
  not raw source bytes.

**Correction:** product copy must say "import performs no model call"; any model-assisted
verification is an explicit embedder-supplied policy, not a hidden behavior of this plane.

## Q7. Does the product auto-index the filesystem?

**Verdict: NO.**

- There is no directory walk, glob, watcher, or path ingestion in `src/proof_asset/**`. Bytes enter
  only through the explicit `importSource({ bytes, … })` call or the POST-only
  `/api/proof/sources/import` route.
- Absolute local paths never enter semantic identity: a `ProofSourceRevision`'s identity is
  `(sourceId, revision, contentDigest)`; `blobRef` is the content digest, never a path
  (`test/t_proof_asset.test.ts`, "treats a local file path as no part of semantic identity").
- The blob vault writes to a root the caller supplies (or the `$DSH_HOME` default) and reads by
  digest; it does not enumerate pre-existing files.

**Correction:** never imply that pointing the product at a directory ingests it. Import is one
explicit byte payload at a time.

---

## Summary table

| # | Question | Verdict | Key evidence |
| --- | --- | --- | --- |
| 1 | Truth? | NO | `ProofClaimStanding` is policy output only |
| 2 | Legal validity? | NO | no legal/notary ontology; `G10-T` T0 decision |
| 3 | Encryption? | NO | `localProofBlobStore` plaintext, best-effort modes |
| 4 | Authenticated recipient? | NO | receipt is a local write ack; no recipient fields |
| 5 | Cryptographic selective disclosure? | NO | plaintext closure projection, no ZK/VC/DID |
| 6 | Silent model send? | NO | import triggers zero policy/model calls |
| 7 | Auto-index filesystem? | NO | explicit `importSource(bytes)` only |

## Corrections applied to shipped wording

- Barrel and `advanced.ts` headers state the firewall vocabulary explicitly and add the non-claims
  (local only, no cloud sync, no federation, no encryption-at-rest, no PKI/VC/DID/ZK, no recipient
  authentication).
- Tool descriptions for `palimpsest_proof_source`, `palimpsest_proof`, and `palimpsest_disclosure`
  describe derived standings, explicit content access, separate admission, and local-only export.
- `docs/engineering/audits/G10-T-PRIVACY-SECURITY-BOUNDARY.md` carries the full non-claim and
  residual-risk list.

## Known limitations that are not claims in either direction

- **Disclosure durability gap**: previews/receipts are per-service in-memory (documented in
  `src/proof_asset/disclosure.ts`), so they do not survive restarts.
- **Single global proof scope**: the plane is not per-project isolated; multi-tenant isolation is a
  deployment responsibility.
- **Sub-range excerpts** cannot be reconstructed from a bundle alone; only whole source files are
  exported for the revisions involved.
