# G10-G1 — Delivery

Stage G10-G1 Campaign identity + commitment registry + CampaignStore.
Baseline `main` @ `5557484`. Branch `experiment/g10-g1-campaign-identity-store`.

Gates: `git diff --check` clean; focused suite 10 passed; unit **92 files /
810 tests**; `pnpm build` + `build:web` pass; e2e 21 passed (documented flake
protocol).

Adversarial checks: campaign≠institution (G1-M01), campaign≠project (G1-M02),
zero-runtime campaign (G1-M03), body-replacement survival (G1-M04),
CampaignCommitment≠federation Commitment (G1-M05), immutable/event-derived
commitments (G1-M06), supersession without rewrite (G1-M07), basis freshness
(G1-M08), stale basis rejected (G1-M09), restart replay (G1-M10), chain
corruption fail-closed (G1-M11), per-campaign conflict isolation (G1-M12).

Verdict:

```text
G10-G1 CAMPAIGN IDENTITY: PASS
```
