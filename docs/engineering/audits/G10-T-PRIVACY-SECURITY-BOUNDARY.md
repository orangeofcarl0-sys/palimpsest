# G10-T Privacy & Security Boundary Audit

Scope: the authoritative Proof/Evidence plane (`src/proof_asset/**`), its install wiring
(`src/install.ts`), the application surface/HTTP/tools (`src/application/**`,
`src/tools/application_tools.ts`), and the Campaign evidence bridge
(`src/proof_asset/campaign_bridge.ts`).

This document states the **actual** security posture of the v1 plane. It deliberately lists what is
**not** implemented and **not** claimed, because over-claiming security is itself a disclosure and
integrity defect.

---

## 1. Storage posture: local by default

- The semantic proof history is a SQLite file at
  `$DSH_HOME/palimpsest/proof-vault/proof.sqlite` (`defaultProofStorePath`, `src/proof_asset/store.ts`).
  With no `proofEvidenceStore` supplied, **no proof surface is built at all** — there is no hidden
  default store.
- Source bytes are held in a **local content-addressed blob vault**
  (`$DSH_HOME/palimpsest/proof-vault/blobs`, `localProofBlobStore`, `src/proof_asset/blob.ts`).
  The vault is opaque: callers get a lowercase sha256 content digest, never a semantic claim.
- There is **no cloud sync, no remote replication, and no federation disclosure** anywhere in the
  plane. The disclosure module's only effect is `localDisclosureExporter`, which writes files under a
  caller-supplied local root. A source scan of `src/proof_asset/**` finds no `federation`,
  `transport`, `upload`, `.send(`, or `http(s)://` token (asserted by
  `test/t_adversarial.test.ts`).
- The proof plane **imports no Organization/RuntimeScope/Boundary/Commitment/effect authority**
  (`src/proof_asset/service.ts`, `src/proof_asset/store.ts` headers). It cannot mutate another
  subsystem.

## 2. Accidental over-disclosure

- **Raw content is never implicit.** Source bytes enter the semantic SQLite rows only as a content
  digest (`contentDigest`), never as bytes or text. `test/t_proof_asset.test.ts` imports a
  recognizable secret and asserts the stored `payload_json` contains neither the raw text nor its
  base64 form.
- **Content access is explicit and POST-only.** Reading bytes requires
  `ProofEvidenceService.readSourceContent` (or the `read_explicit` route/tool), which resolves only
  through the configured `ProofSourceContentPort` / blob vault. The HTTP route
  `/api/proof/sources/read_explicit` and `/api/proof/sources/import` are **POST-only** and reject
  `GET` with 400 (asserted).
- **Publication is gated twice.** A claim becomes visible only after (1) a verification policy
  produces a standing and (2) a **separate** publication-admission policy returns `PUBLISH`. A
  recorded candidate is not a published claim; `proofAssetView`/`why`/`inspectClaim` throw or return
  `unknown` for unpublished ids.
- **Disclosure is a projection, not a copy.** A preview is a description of what *would* be
  disclosed; `approveAndExport` re-derives the published snapshots and writes a bundle manifest plus
  only those source revision bytes whose re-hashed digest matches the recorded address. Bytes that do
  not hash to their address are skipped (fail closed), never written.

## 3. Whole-source over-disclosure

- `WHOLE_SOURCE` selectors disclose the entire source blob. The plane records a **mandatory,
  verbatim warning** (`DISCLOSURE_WHOLE_SOURCE_WARNING`) on any preview whose closure contains a
  whole-source selection. Tested in `test/t_disclosure.test.ts`.
- `LATEST_SOURCE_REVISION` freshness is *not* applied by default: v1 defaults to
  `IMMUTABLE_EVIDENCE`, so a claim does not silently follow a newer revision. A stale freshness
  warning is emitted on the preview when the claim is not fresh.
- Bundle semantic identity (`bundleDigest`) is derived from the **selection only** — never from a
  filesystem root — so an export path can never become part of what was disclosed.

## 4. Selective disclosure and excluded material

- A selective bundle includes the requested claims plus their **published dependency closure**.
  Unrelated sources are excluded by construction.
- Requested ids that are not published are reported in `excludedBySelection` (by id) rather than
  silently omitted.
- `test/t_disclosure.test.ts` publishes claims over two synthetic sources (`alpha`, `beta`),
  requests only `alpha`, exports, and asserts the exported directory contains `alpha` bytes and that
  `beta`'s directory and secret bytes are **absent**.

## 5. Source-content logging and agent prompt leakage

- The service never logs, echoes, or returns source content from `importSource`. The import result is
  only `{ revision }`, and the revision contains a digest, media type, label, provenance, and caller
  metadata — no bytes.
- The proof plane contains **no model/provider call**. Importing a source triggers no policy
  invocation; a verification policy is called only by `verify`/`reassess`
  (`test/t_proof_asset.test.ts` asserts a spy policy count of 0 after two imports).
- The application tools never accept a `task`, `prompt`, `provider`, `model`, or free-form content
  field for import; `content` is an opaque base64 payload. There is no path by which source bytes are
  fed to a language model inside this plane.

## 6. Cross-project leakage

- The proof plane is a **single global chain** (`scopeId = "proof"`, `PROOF_SCOPE_ID`). It has no
  `project_id` filter and is not Work-scoped; a proof claim is globally addressable by its
  content-addressed id.
- Consequence: a deployment that shares one proof store across projects exposes every project's
  published sources/claims to any caller with access to that store. **Isolation is a deployment
  responsibility** (separate `$DSH_HOME` / separate store per tenant). The plane does not silently
  merge Work project scopes into proof scope, and it does not read Work's `evidence` projection.
- The Campaign bridge is read-only (`proofCampaignEvidencePort` exposes exactly `inspectClaim`) and
  cannot enumerate sources, evidence, or other claims.

## 7. Missing source / unavailable content

- `readSourceContent` returns `undefined` for an unknown revision or an unresolvable blob; it never
  returns `false` and never returns wrong bytes (`blobBackedSourceContentPort` re-verifies the hash).
- `recordEvidence` fails closed with `content_unavailable` when no blob or content port can resolve
  the revision. The HTTP `read_explicit` route returns `{ state: "unavailable" }` (HTTP 200, honest
  state) rather than a fabricated success.

## 8. Stale proof

- `STALE` is a *freshness/standing* statement, never a truth assertion. `baseStanding` and
  `effectiveStanding` are distinct: a dependency whose effective standing is
  `STALE`/`CONTRADICTED`/`INCONCLUSIVE` cascades an **effective `STALE`** to its dependents while
  each claim's base standing is retained. Historical assessments are append-only and never mutated.
- A stale claim is still disclosed if requested, but the preview emits a freshness warning naming the
  claim and explanation.

## 9. Local file permissions

- `localProofBlobStore` *attempts* `0700` directories and `0600` files. On platforms that ignore POSIX
  modes (notably Windows) `chmodSync` is wrapped in `try/catch` and the attempt is **best-effort
  only**. The code and comments state this explicitly; there is **no encryption-at-rest claim and no
  key management**.
- The disclosure exporter creates its bundle directory with `mkdirSync({ recursive: true })` and
  default modes; it makes no permission claim.

## 10. HTTP access is not disclosure approval

- HTTP authentication (the server's bearer token, if any) only admits a request to the server. It is
  **never** semantic authority: no proof or disclosure method accepts an `authenticated`, `actor`,
  `token`, `standing`, `decision`, or `approved` field (asserted against the tool schemas in
  `test/t_adversarial.test.ts`).
- Export requires a **separate admission port** (`DisclosureAdmissionPort.admit`) returning
  `APPROVE`. If the port is absent the outcome is `capability_required`; if it rejects, the outcome is
  `blocked`. An unknown/forged `previewId` is `blocked` — a client token cannot substitute for a
  preview.

## 11. Model/provider exposure during extraction/verification

- Extraction (`recordEvidence` selectors `WHOLE_SOURCE`, `TEXT_RANGE`, `JSON_POINTER`) is pure
  deterministic byte/JSON handling. No model is involved.
- Verification and publication admission are injected policy ports; the plane never imports a model,
  provider SDK, or network client. Whether an embedder wires an LLM-backed policy is an embedder
  decision outside this plane, and this plane passes only candidate content + evidence metadata +
  dependency standings to that policy — **not** raw source bytes (see `ProofVerificationInput`).

---

## Explicit non-claims (things deliberately NOT implemented)

| Property | Status |
| --- | --- |
| Cloud sync / remote replication | **Not implemented** |
| Federation disclosure / peer send | **Not implemented** |
| Encryption at rest or in transit | **Not implemented, not claimed** |
| Key management / PKI | **Not implemented** |
| Verifiable Credentials (VC) / DID | **Not implemented** |
| Zero-knowledge / cryptographic selective disclosure | **Not implemented** |
| Recipient authentication | **Not implemented** |
| Delivery / recipient receipt | **Not implemented** (export receipt is a **local write acknowledgement only**) |
| Legal validity / notarization | **Not implemented, not claimed** |

## Residual risks / limitations (reported, not papered over)

1. **Single global proof scope.** No per-project isolation; multi-tenant isolation must be provided
   by separate stores/`$DSH_HOME`.
2. **Disclosure durability gap.** `src/proof_asset/disclosure.ts` documents that the proof store has
   no `DISCLOSURE_*` event types, so previews and receipts live only in per-service memory and are
   **not durable across process restarts**. This is an availability concern, not a leakage one.
3. **Sub-range excerpts in export.** The bundle carries evidence refs and source-revision refs, not
   selectors; therefore a sub-range/JSON-pointer excerpt cannot be reconstructed from the bundle
   alone — only the whole source file it is drawn from is exported. Whole-source selectors are exact.
4. **Best-effort file modes.** On non-POSIX platforms the `0600`/`0700` intent is not enforced.

All claims above are exercised by `test/t_proof_asset.test.ts`, `test/t_disclosure.test.ts`, and
`test/t_adversarial.test.ts`.
