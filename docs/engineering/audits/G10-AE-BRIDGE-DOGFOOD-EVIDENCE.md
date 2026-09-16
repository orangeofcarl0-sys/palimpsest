# G10-AE — Bridge dogfood evidence

The §32/§38 gate: a **separate PROCESS** external library, driven through the REAL
installed Palimpsest stack, asserting the §33 golden E2Es and the §38 evidence
list with raw-row proof.

```text
fixture    test/fixtures/external_library_server.mjs   TEST-ONLY, own sqlite schema
driver     scripts/external_assets/ae-dogfood.mjs
command    node scripts/external_assets/ae-dogfood.mjs
result     pass=true   exit 0   30/30 checks   failures: []
```

## 1. What is actually separate

| Property | Evidence |
| --- | --- |
| Separate PROCESS | the driver spawns the fixture (`child_process.spawn`) and kills it in a `finally`; the run records `pid`, e.g. `11460` |
| Separate OWNERSHIP | the fixture owns its own sqlite file with its own schema (`library_assets`, `library_publications`); no table is shared with the association store, the journal store, the bridge store or the Ordarium ledger |
| Separate TRANSPORT | the adapter talks HTTP to the fixture's own ephemeral port (e.g. `13909`); a restart may bind a DIFFERENT port and the adapter is repointed |
| Test-only | the file's header says so, and nothing under `src/` or `web/` imports it |

The in-process `test/fixtures/external_library_fixture.ts` remains the unit-suite
provider; the process-level artefact is what §38 requires and is what this
document records.

## 2. Checks (all 30, verbatim keys)

Driven through `installPalimpsest` with real stores, real Ordarium ledger and a
real HTTP provider adapter. The only substituted things are the fixture provider
itself, the clock and the publication admission decision.

### Read-only faces

| Check | Evidence from the run |
| --- | --- |
| `separate_process_library_is_healthy_and_separately_owned` | health answers with the fixture provider id and `unavailable:false` |
| `search_returns_the_matching_hit_only` | HTTP 200, hits `["paper-1"]` |
| `search_mutates_nothing` | project/events/association/journal/bridge rows **and** the derived view are byte-identical before and after |
| `inspect_resolves_the_exact_digest` | `paper-1@ab555228…cdd10d22` |
| `inspect_never_substitutes_latest_for_a_requested_digest` | an unknown digest answers `UNAVAILABLE / not_found`, never the latest revision |
| `inspect_mutates_nothing` | no row and no derived-view change after both inspections |

### Reference (§33 Reference / Provider unavailable / Newer revision)

| Check | Evidence from the run |
| --- | --- |
| `reference_commits_one_EXTERNAL_ASSET_association_with_the_exact_digest` | one association, digest-bound |
| `reference_copies_no_content` | the external body appears in no association or journal row |
| `reference_survives_a_restart` | a fresh process over the same state still resolves it |
| `provider_unavailable_keeps_the_association_and_reports_it` | association kept, resolution `PROVIDER_UNAVAILABLE` |
| `newer_revision_is_surfaced_but_the_referenced_digest_never_moves` | the newer identity is reported as a hint; the referenced digest is unchanged |

### Import (§33 Import / Import mismatch / Import crash)

| Check | Evidence from the run |
| --- | --- |
| `import_writes_one_journal_entry_with_structured_provenance` | one entry, verifiable provenance artifact + `relatedRefs` |
| `import_creates_no_work_mutation` | the `projects`/`events` tables and the controller status are unchanged |
| `import_records_exactly_one_terminal_bridge_receipt` | `EXTERNAL_IMPORT_PREPARED` + exactly one `EXTERNAL_IMPORT_COMMITTED` |
| `import_retry_after_the_journal_write_does_not_duplicate_the_entry` | one entry after a retry |
| `import_crash_window_recovers_with_one_entry_and_one_terminal_receipt` | the prepared-then-crashed window leaves one entry and one terminal |

Digest mismatch and the size bound are proven in the plane suite (`AE-N11`,
`AE-N12`) and in the gate-review hardening (`R-01`, which now also catches a
provider that echoes the referenced digest while handing over other bytes).

### Publication (§33 Publication preview / No approval / Publish / Publish crash)

| Check | Evidence from the run |
| --- | --- |
| `publication_preview_is_the_exact_outbound_payload` | the preview's title/body/metadata are the payload |
| `publication_preview_has_zero_effect` | zero provider publications, zero bridge rows, zero associations |
| `publication_without_an_admission_port_is_refused_with_zero_effect` | refused with zero Ordarium and provider mutation |
| `publication_requires_the_separate_admission_port_and_returns_a_stable_ref` | `PUBLISHED` with an exact `providerId/assetId@digest` |
| `publication_records_one_terminal_receipt_and_one_PUBLISHED_association` | lineage `[EXTERNAL_PUBLICATION_PREPARED, EXTERNAL_PUBLICATION_COMMITTED]` |
| `what_left_the_project_is_exactly_the_approved_payload` | the recorded publication body is the approved bytes (56 B in this run) |
| `publication_leaves_the_local_journal_as_local_history` | the local entry is still readable after the external write |
| `publication_replay_cannot_duplicate_the_external_asset` | `{"publications":1,"replayed":true}` |
| `publication_crash_after_the_external_write_leaves_no_local_terminal` | the process DIES after committing its row: local `status:"FAILED"`, `reason:"publication_outcome_unknown"`, no `EXTERNAL_PUBLICATION_COMMITTED`, and the library's publication count incremented by exactly one |
| `publication_recovery_yields_one_asset_one_terminal_receipt_and_one_association` | after restarting the library over the SAME database: `PUBLISHED`, publication count **unchanged**, exactly one `EXTERNAL_PUBLICATION_COMMITTED`, exactly one `PUBLISHED` association |

The crash pair is the load-bearing one: the provider performs its own write and
then exits, so the local side genuinely does not know the outcome; recovery asks
the provider what it holds and finalizes, and the provider's own row count proves
no second external asset was created.

### Firewalls and boundaries

| Check | Evidence from the run |
| --- | --- |
| `external_content_never_becomes_canonical_project_state` | neither external body appears in any Work ledger row, ProjectIR row, journal row or association row; the title shown in the derived external section is a READ, not a copy |
| `the_derived_read_walks_only_this_projects_associations` | 3 references → 3 inspections, all from this project's association rows |
| `no_foreign_project_is_scanned_or_invented` | a project with no associations reads `references:0` plus one honest warning — no scan, no invented library |
| `provider_credentials_never_reach_a_result_or_a_persisted_artifact` | the fixture's credential in an undeclared field is refused; the credential does not appear in any result or persisted row |

## 3. Final state of the run

```json
{"projectId":"ae-dogfood","projectRevision":0,"associations":3,
 "journalEntryRecords":4,"bridgeRecords":9,"libraryPublications":2}
```

The library call counters recorded by the restarted process (`search:1,
inspect:18, materialize:0, publish:1, reconcile:0`) are per-process; the
load-bearing facts are the PUBLICATION COUNTS above, which are read from the
library's own database and prove no double-publish.

## 4. What this document does NOT claim

- It does not claim a shipped Personal Asset store: the fixture is TEST-ONLY, is
  not imported from `src/` or `web/`, and owns no Palimpsest table.
- It does not claim process isolation for the UNIT suite (that provider runs
  in-process by design; `CF-AE-11` is closed by THIS harness, not by it).
- It does not claim the dogfood covers every adversarial id: `AE-N01…AE-N30` are
  pinned in `test/ae_external_assets.test.ts` and `test/ae_integration.test.ts`,
  and the coverage table in `G10-AE-EXTERNAL-ASSET-SPEC.md` says which.
