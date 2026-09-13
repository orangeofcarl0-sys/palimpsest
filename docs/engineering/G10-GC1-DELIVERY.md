# G10-GC1 — Delivery

Baseline `main` @ `9e98b0c`. Branch `experiment/g10-gc1-campaign-institution-grounding`.

Gates: diff check clean; focused suite 4 passed; unit **100 files / 863 tests**;
build + build:web pass; e2e 21 passed (documented flake protocol).

Proofs GC1-M01..M10: known institution allows genesis (M01); nonexistent
refused (M02); unknown refused (M03); error refused (M04); zero events on
failure (M05); owner immutable (M06); replay independent of current
reachability (M07); install gated on an institution source (M08); campaign
survives Organization body replacement (M09); CampaignId unchanged across epoch
advance (M10).

```text
G10-GC1 CAMPAIGN INSTITUTION GROUNDING: PASS
```
