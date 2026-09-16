# G10-AE — AD / AC-R carry-forward disposition

Every carry-forward item inherited from `G10-AD-CARRY-FORWARD.md` and
`G10-AC-R-CARRY-FORWARD.md` is disposed below against what the AE stage actually
delivered. Nothing is silently dropped: the union of both tables is reproduced in
full (48 ids), each with an explicit disposition.

```text
Rule applied here: an item is CLOSED only when a delivered artefact makes its
trigger impossible, not merely less likely.
```

**Result up front: AE closes NO inherited item.** AE is an isolated new plane
(`src/external_assets/**`) plus one additive enum member and install wiring. It
touches the monitor, management, concurrency, proof, reasoning and web planes not
at all, so none of their residual triggers became impossible. The honest
disposition is therefore `STILL_OPEN — DEFERRED` for the inherited set, with the
three REASSESSED entries called out in §2 because AE changes the *shape* of the
question without firing or removing its trigger.

## 1. Inherited items surfaced by AD (§1 of the AD carry-forward)

| ID | Disposition in AE | Reasoning / evidence | Trigger (unchanged unless noted) |
| --- | --- | --- | --- |
| **CF-AD-01** — v1 verifies only `CURRENT_PROJECT_HEAD` | STILL_OPEN — DEFERRED | AE adds no verification subject and no verification code. `src/project_verification/**` is untouched by this stage. | A product need to verify something that is not the project head, WITH a different admission design. |
| **CF-AD-02** — no model-verifier adapter ships | STILL_OPEN — DEFERRED | AE composes no verifier and no model. | A host that can prove a real provider boundary for a model verifier. |
| **CF-AD-03** — no operator path to register a verifier without host code | STILL_OPEN — DEFERRED (shape now shared) | AE has the same shape for its OWN deployment config: the provider registry is reachable only through `installPalimpsest` options or by hand (`src/install.ts:487-493`, `:1829-1835`); there is no operator CLI/UI to add or rotate a provider. Recorded as `CF-AE-05`. | An operator who wants to add or rotate a verifier (now also: a provider) without a code deployment. |
| **CF-AD-04** — no human verification workflow | STILL_OPEN — DEFERRED | AE ships no human workflow of any kind. (The publication admission port is an approval seam, not a verification workflow.) | A project whose acceptance requires a named human verdict. |
| **CF-AD-05** — no bridge from a verification result to Work Evidence / a gate / Proof / Reasoning | STILL_OPEN — DEFERRED | AE adds an explicit reference/import bridge for EXTERNAL assets — and deliberately does NOT admit the imported content into Work Evidence, Proof or Reasoning (`src/external_assets/import.ts:1-23`; structural firewall `test/ae_external_assets.test.ts:498-527`). It is a second instance of the same discipline, not a closure of the verification item. | A justified need for a SEPARATE, explicit admission design that consumes a verification run. |
| **CF-AD-06** — verification-profile portability | STILL_OPEN — DEFERRED (shape now shared) | The external-provider registry is process-local deployment config exactly like the verifier registry; two processes with different registries disagree. The bridge reports the disagreement honestly as `unknown_provider` / `STALE_REFERENCE_CANDIDATE` rather than merging (`src/external_assets/service.ts:576-616`). Recorded as `CF-AE-06`. | Verification-preference portability, or multi-machine operation of one project. |
| **CF-AD-07** — no chronological basis for verification runs vs Campaign chain positions | STILL_OPEN — DEFERRED | AE adds no history that needs interleaving with Campaign wake events. The bridge receipts DO carry real timestamps (`src/external_assets/bridge_store.ts:241`, `:85`), so the AE history is internally chronological, but it is a separate per-project stream and is not merged into the operating history. | A consumer that must interleave verification runs with Campaign wake events by time. |

## 2. REASSESSED — the question's shape changed, but the trigger did not fire

| ID | Reassessment | Why it is still deferred |
| --- | --- | --- |
| **CF-AB-03** — a caller inferring mutation from an empty canonical-ref list | AE adds no canonical outcome ref kind and no management activity. The bridge has its OWN lineage (`SqliteExternalAssetBridgeStore`) which is explicitly NOT a canonical-outcome channel and is not read by the operating history. | The empty-list ambiguity in `canonicalOutcomeRefs` is untouched. Trigger unchanged. |
| **CF-AB-04** — management-preference portability | The same portability gap now also applies to the external-provider registry and the bridge store path (both deployment-local). | Trigger unchanged, now with a third instance; see `CF-AE-06`. |
| **CF-AA-02** — same-process trust boundary | The AE provider is a host-supplied in-process port (`src/external_assets/registry.ts:29-32`), so a same-process untrusted provider is inside the trust boundary that already exists. AE does NOT create a new admission authority, so it does not widen the boundary; it adds a new place where the existing boundary is exercised. | The item is about untrusted plugins and multi-tenant admission, which AE does not touch. Trigger unchanged. |

## 3. Full inherited table (union of the AD and AC-R tables)

Every id from `G10-AD-CARRY-FORWARD.md` §2 / `G10-AC-R-CARRY-FORWARD.md` §2 is
listed. Items already closed in an earlier stage keep their held disposition and
are NOT re-opened here.

| ID | Disposition in AE | Trigger (unchanged) |
| --- | --- | --- |
| CF-AC-01 | STILL_OPEN — DEFERRED | An operator who wants to force a monitor tick from the shell, or a CLI-level monitor regression test. |
| CF-AC-02 | STILL_OPEN — DEFERRED | A scoped Campaign count above `maxCampaignsPerTick`, or a latency requirement beyond the budget. |
| CF-AC-03 | CLOSED_IN_AC_R, held | — |
| CF-AC-04 | STILL_OPEN — DEFERRED | A shared Campaign store with a large Campaign count, or a per-project Campaign index. |
| CF-AC-05 | STILL_OPEN — DEFERRED | A host that can only be woken by an HTTP push, webhook or queue consumer. |
| CF-AC-06 | CLOSED_IN_AC_R, held | — |
| CF-AC-R-01 | CLOSED, held (post-closure correction) | — |
| CF-AC-R-02 | STILL_OPEN — DEFERRED | A consumer that must interleave Campaign wake events with dated entries by time. |
| CF-AC-R-03 | STILL_OPEN — DEFERRED | A consumer needing one consistent snapshot of runtime state and preview. |
| CF-AC-R-04 | STILL_OPEN — DEFERRED | A decision to put `web/**` into a typecheck gate, or a web type regression reaching the served bundle. |
| CF-AC-R-05 | STILL_OPEN — DEFERRED | Same trigger as `CF-AC-04`. |
| CF-AC-R-06 | STILL_OPEN — DEFERRED | An operator who needs to observe or force a tick without writing host code. |
| CF-AC-R-07 | STILL_OPEN — DEFERRED | A host that can only be woken by push/webhook/queue consumer (`CF-AC-05`). |
| CF-AC-R-08 | STILL_OPEN — DEFERRED | A scoped set larger than `maxCampaignsPerTick`. |
| CF-AB-01 | STILL_OPEN — DEFERRED | A project whose activity volume makes a full read expensive, or a retention window. |
| CF-AB-02 | STILL_OPEN — DEFERRED | A multi-tenant/tamper-hostile deployment where the activity log must be tamper-evident. |
| CF-AB-03 | REASSESSED, STILL_OPEN — DEFERRED | See §2. |
| CF-AB-04 | REASSESSED, STILL_OPEN — DEFERRED | See §2 and `CF-AE-06`. |
| CF-AB-05 | STILL_OPEN — DEFERRED | A hosted or UI-only operator topology needing a real operator-authority channel (see also `CF-AD-03`, `CF-AE-05`). |
| CF-AA-01 | STILL_OPEN — DEFERRED | An actual host denial, a supported cancel, or an engine emitting a deterministic non-uncertain failure. |
| CF-AA-02 | REASSESSED, STILL_OPEN — DEFERRED | See §2. |
| CF-AA-03 | CLOSED_IN_AA, held | — |
| CF-AA-04 | STILL_OPEN — DEFERRED | A requirement to make terminal provenance tamper-evident. |
| CF-AA-05 | STILL_OPEN — DEFERRED | Importing a foreign log, or a writer that appends a terminal without an intent. |
| CF-W-01 | CLOSED_IN_W, held | — |
| CF-W-02 | CLOSED_IN_X, held | — |
| CF-W-03 | CLOSED_IN_Y, held | — |
| CF-W-04 | STILL_OPEN — DEFERRED | A feature that changes a project revision without settling/re-authorizing in-flight work. |
| CF-W-05 | STILL_OPEN — DEFERRED | A UI change that wants `GET /api/manage/preview` consumed by `web/**`. |
| CF-W-06 | REASSESSED_IN_AC, STILL_OPEN — DEFERRED | An operator expecting a revision/head sync to recompute retained-task states. |
| CF-W-07 | STILL_OPEN — DEFERRED | A project with thousands of tasks where promotions/revisions are frequent. |
| CF-X-01 | STILL_OPEN — DEFERRED | A topology/product need for two concurrent tasks to promote independently from the same base. |
| CF-X-02 | PARTIALLY_ADDRESSED_IN_AB, UNCHANGED_BY_AE | A UI change that wants to show project-head state and promotion provenance. |
| CF-X-03 | STILL_OPEN — DEFERRED | A future internal caller that wants to commit a pre-compiled reconciliation without the wrapper. |
| CF-X-04 | STILL_OPEN — DEFERRED | A CLI-behaviour change, or a request for CLI-level regression coverage. |
| CF-Y-01 | CLOSED_IN_Z, held | — |
| CF-Y-02 | CLOSED_IN_Z (superseded), held | — |
| CF-Z-01 | STILL_OPEN — DEFERRED | A project with a large pending-promotion backlog, or many simultaneous unresolved intents. |
| CF-Z-02 | CLOSED_IN_AA, held | — |
| CF-Z-03 | STILL_OPEN — DEFERRED | A future path that records reports without the aggregate's input-identity check. |
| CF-Z-04 | STILL_OPEN — DEFERRED | A host that calls `reconcileAll()` without a subsequent turn. |
| CF-AD-01 … CF-AD-07 | STILL_OPEN — DEFERRED (CF-AD-03/06 reshaped) | See §1. |
| CF-AC-R-01 … CF-AC-R-08 | see per-id rows above | See `G10-AC-R-CARRY-FORWARD.md` §1; the AD-held dispositions are reproduced verbatim. |

## 4. Items AE touches without closing

| ID | Why AE touches it | Why it is NOT closed |
| --- | --- | --- |
| **CF-AD-03** | AE's provider registry is deployment config reachable only through install options, which is the *same* shape the verifier registry has. | Trigger unchanged; the operator path is still missing, now for two registries. Recorded as `CF-AE-05`. |
| **CF-AD-05** | AE implements an explicit reference/import bridge that terminates at the Journal and proves no Work/Proof/Reasoning reachability. | The verification→admission bridge does not exist and AE was explicitly forbidden from adding one (§3/§30). |
| **CF-AD-06 / CF-AB-04** | AE's provider registry and bridge path are deployment-local and non-portable. | Trigger unchanged; now three instances. Recorded as `CF-AE-06`. |
| **CF-AA-02** | AE hands the host a new in-process provider port. | The admission trust boundary is not touched. |
| **CF-AC-R-04** | The AE surface work touches `web/**` (the External Assets tab) in the concurrent surface pass. | `web/tsconfig.json` is still outside `pnpm build`; the item stays open until the web layer is typechecked or the regression is fixed. |
| **CF-AC-R-05 / CF-AC-04** | Not touched: AE composes no Campaign scan. | Trigger unchanged. |

## 5. New items AE surfaces

Recorded in full in `G10-AE-CARRY-FORWARD.md`:

```text
CF-AE-01  binary / large source import
CF-AE-02  native Proof-source import adapter
CF-AE-03  outbound publication of additional local asset kinds
CF-AE-04  a real Personal Intellectual Asset System provider (and Zotero/GitHub/institutional adapters)
CF-AE-05  an operator path to register/rotate a provider without host code
CF-AE-06  external-provider-profile portability
CF-AE-07  CLOSED IN AE — the digest requirement is now structural in the shared
          association artifact (write AND read path), pinned by AE-N04 (artifact)
CF-AE-08  provider-change webhooks / watchers
CF-AE-09  applicability-aware retrieval
CF-AE-10  cross-project asset relations
CF-AE-11  CLOSED IN AE — the §38 dogfood runs against a separate PROCESS fixture
CF-AE-12  CLOSED IN AE — surface/web/e2e/dogfood all landed and pinned
CF-AE-13  seven declared error kinds are never thrown
CF-AE-14  CLOSED IN AE — one unused exported search-hit domain constant, removed
CF-AE-15  resolve() does one provider round trip per reference and caches nothing
```

## 6. Honest limitations

1. This disposition is a claim about the AE stage only. It does not re-open or
   re-litigate the AD or AC-R dispositions.
2. Every `STILL_OPEN — DEFERRED` above is deliberate: AE was scoped to build ONE
   bridge to an external owner. Widening it to close monitor, concurrency,
   proof, reasoning or web-coverage items would have been exactly the scope creep
   §2/§31 forbid.
3. No inherited item was closed by assertion. Each row names the reason it stays
   open; where AE changes the shape of the question, that is called out as
   REASSESSED rather than as a closure.
