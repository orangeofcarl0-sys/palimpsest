# G10-GC0 — Delivery

Baseline `main` @ `126c11e`. Branch `experiment/g10-gc0-campaign-history-hardening`.

Gates: diff check clean; focused suite 9 passed; unit **99 files / 859 tests**;
build + build:web pass; e2e 21 passed (documented flake protocol).

Proofs GC0-M01..M12: identical completed retry succeeds (M01); retry after head
advance (M02); partial -> recovery_required (M03); conflicting eventId (M04);
chain corruption fails on retry (M05); malformed watch condition rejected at
compiler parse (M06); invalid Claim status (M07); non-string evidence id (M08);
invalid project standing (M09); malformed WorldSnapshot (M10); historical
replay (M11); multi-writer safety (M12).

```text
G10-GC0 CAMPAIGN HISTORY HARDENING: PASS
```
