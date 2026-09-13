# G10-G6 — Delivery

Baseline `main` @ `d79dd4c`. Branch `experiment/g10-g6-campaign-compiler`.

Gates: diff check clean; focused suite 8 passed; unit **97 files / 846 tests**;
build + build:web pass; e2e 21 passed (documented flake protocol).

Proofs G6-M01..M18 (`test/g6_campaign_compiler.test.ts`): candidate-only output
(M01); unknown action rejected (M02); canonical ProjectProposal parser reused
(M03); invalid proposal creates no Work (M04); definition_id firewall (M05);
candidate carries Campaign basis (M06); stale candidate refused (M07); stable
admission key (M08); same-admission retry no duplicate Project (M09); changed
candidate under same key fails closed (M10); crash-after-Work-admission
recovery (M11); link recorded once (M12); WAIT never touches Work; compiler
never sets belief (M16); scheduler untouched (M18).

```text
G10-G6 CAMPAIGN COMPILER: PASS
```
