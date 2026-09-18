# RS-1 — branch cleanup plan

Produced AFTER the per-branch audit and BEFORE any deletion (§11). The table is generated from
`repository-audit/branch-classification.json`, so it cannot disagree with the machine record.

## Summary

```text
total remote branches      102
classified A (merged)      83
classified B (PR-equivalent) 0
classified C (superseded)  11
classified F (abandoned)   7
classified E (active)      0
classified G (review)      0
protected (main)           1
safe-delete                101
tag-then-delete            0
active (retained)          0
review-required (retained) 0
```

## Batches (§13)

- **Batch 1 — merged ancestors and merged-PR branches** — 59 branch(es)
- **Batch 2 — checkpoint / closure branches** — 24 branch(es)
- **Batch 3 — superseded historical branches** — 11 branch(es)
- **Batch 4 — abandoned unique-history branches** — 7 branch(es)

## Plan table

| branch | classification | tip | ahead/behind | merged PR | unique | preservation action | delete? | reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `main` | P_PROTECTED_MAIN | `4028b6a30c91` | 0/0 | — | 0 | audit SHA record only | no | §2: main is never deleted, force-pushed, rewritten or rebased |
| `experiment/g10-a0-evidence-grounded-semantic-rebase` | A_MERGED_ANCESTOR | `42127f6671b9` | 0/282 | #8→b31bbd08 | 0 | audit SHA record only | yes | merge-base --is-ancestor 42127f6671b9 origin/main = true |
| `experiment/g10-a1-uas-semantic-consolidation` | A_MERGED_ANCESTOR | `91cdf533a51e` | 0/279 | #10→a3f759a3 | 0 | audit SHA record only | yes | merge-base --is-ancestor 91cdf533a51e origin/main = true |
| `experiment/g10-a2-uas1-formal-freeze-review` | A_MERGED_ANCESTOR | `1319111a37a8` | 0/275 | #11→b18b08b2 | 0 | audit SHA record only | yes | merge-base --is-ancestor 1319111a37a8 origin/main = true |
| `experiment/g10-aa-outcome-admission` | A_MERGED_ANCESTOR | `3d05ae41932d` | 0/72 | #95→75160944 | 0 | audit SHA record only | yes | merge-base --is-ancestor 3d05ae41932d origin/main = true |
| `experiment/g10-ab-operating-posture` | A_MERGED_ANCESTOR | `2e338a149270` | 0/68 | #97→23fd1f30 | 0 | audit SHA record only | yes | merge-base --is-ancestor 2e338a149270 origin/main = true |
| `experiment/g10-ac-monitor-runtime` | A_MERGED_ANCESTOR | `c3d093c48fba` | 0/64 | #99→6a7413df | 0 | audit SHA record only | yes | merge-base --is-ancestor c3d093c48fba origin/main = true |
| `experiment/g10-ac-r-docs` | A_MERGED_ANCESTOR | `7276eb2348c8` | 0/58 | #102→02131caa | 0 | audit SHA record only | yes | merge-base --is-ancestor 7276eb2348c8 origin/main = true |
| `experiment/g10-ad-verification` | A_MERGED_ANCESTOR | `13771271cfe8` | 0/56 | #103→818b58c8 | 0 | audit SHA record only | yes | merge-base --is-ancestor 13771271cfe8 origin/main = true |
| `experiment/g10-ae-cf16` | A_MERGED_ANCESTOR | `9a43a2859501` | 0/48 | #107→0ba32639 | 0 | audit SHA record only | yes | merge-base --is-ancestor 9a43a2859501 origin/main = true |
| `experiment/g10-ae-external-assets` | A_MERGED_ANCESTOR | `762be3e190f2` | 0/52 | #105→cb15a9f6 | 0 | audit SHA record only | yes | merge-base --is-ancestor 762be3e190f2 origin/main = true |
| `experiment/g10-ae-r-scope-isolation` | A_MERGED_ANCESTOR | `c49132994e67` | 0/46 | #108→effaedeb | 0 | audit SHA record only | yes | merge-base --is-ancestor c49132994e67 origin/main = true |
| `experiment/g10-b0-binding-semantics-design` | A_MERGED_ANCESTOR | `7435e48eeab4` | 0/272 | #12→8eab0851 | 0 | audit SHA record only | yes | merge-base --is-ancestor 7435e48eeab4 origin/main = true |
| `experiment/g10-b1-binding-schema-candidate` | A_MERGED_ANCESTOR | `6ae108422bb1` | 0/270 | #13→01a51cbc | 0 | audit SHA record only | yes | merge-base --is-ancestor 6ae108422bb1 origin/main = true |
| `experiment/g10-b2-binding-schema-formal-review` | A_MERGED_ANCESTOR | `269a6b88a329` | 0/267 | #14→7643c771 | 0 | audit SHA record only | yes | merge-base --is-ancestor 269a6b88a329 origin/main = true |
| `experiment/g10-b4-binding-compiler-plan-integration` | A_MERGED_ANCESTOR | `1acf66ce4ccb` | 0/250 | #16→f1c4d2f1 | 0 | audit SHA record only | yes | merge-base --is-ancestor 1acf66ce4ccb origin/main = true |
| `experiment/g10-c0-minimal-architecture-identity` | A_MERGED_ANCESTOR | `34944e6b317a` | 0/245 | #17→637f1535 | 0 | audit SHA record only | yes | merge-base --is-ancestor 34944e6b317a origin/main = true |
| `experiment/g10-c1-run-definition-grounding` | A_MERGED_ANCESTOR | `8ca93193bbae` | 0/242 | #18→f9d3b832 | 0 | audit SHA record only | yes | merge-base --is-ancestor 8ca93193bbae origin/main = true |
| `experiment/g10-c2-binding-observation-grounding` | A_MERGED_ANCESTOR | `ce723958e0fa` | 0/239 | #19→7b50f0c4 | 0 | audit SHA record only | yes | merge-base --is-ancestor ce723958e0fa origin/main = true |
| `experiment/g10-d1-runtime-identity-kernel` | A_MERGED_ANCESTOR | `ac4adb7cff96` | 0/233 | #21→17fa74cf | 0 | audit SHA record only | yes | merge-base --is-ancestor ac4adb7cff96 origin/main = true |
| `experiment/g10-d2-ephemeral-runtime-realization` | A_MERGED_ANCESTOR | `df1c1d69911a` | 0/230 | #22→864ff945 | 0 | audit SHA record only | yes | merge-base --is-ancestor df1c1d69911a origin/main = true |
| `experiment/g10-d3-persistent-continuity` | A_MERGED_ANCESTOR | `e7258ca2d8fc` | 0/227 | #23→ec61d744 | 0 | audit SHA record only | yes | merge-base --is-ancestor e7258ca2d8fc origin/main = true |
| `experiment/g10-e1-participation-grounding` | A_MERGED_ANCESTOR | `37d1fcb8e2a0` | 0/215 | #27→4f34052f | 0 | audit SHA record only | yes | merge-base --is-ancestor 37d1fcb8e2a0 origin/main = true |
| `experiment/g10-e2-peer-contact-grounding` | A_MERGED_ANCESTOR | `5be60a37c3f7` | 0/212 | #28→73f576b0 | 0 | audit SHA record only | yes | merge-base --is-ancestor 5be60a37c3f7 origin/main = true |
| `experiment/g10-e3-collaboration-events` | A_MERGED_ANCESTOR | `e29d49f5bfea` | 0/209 | #29→05b74ece | 0 | audit SHA record only | yes | merge-base --is-ancestor e29d49f5bfea origin/main = true |
| `experiment/g10-e4-commitment-handoff` | A_MERGED_ANCESTOR | `c18e54382653` | 0/206 | #30→1fdcbdd8 | 0 | audit SHA record only | yes | merge-base --is-ancestor c18e54382653 origin/main = true |
| `experiment/g10-e5-federated-workforce` | A_MERGED_ANCESTOR | `a91bccd2b0ec` | 0/203 | #31→d0883a36 | 0 | audit SHA record only | yes | merge-base --is-ancestor a91bccd2b0ec origin/main = true |
| `experiment/g10-f0-coordination-integrity` | A_MERGED_ANCESTOR | `32f556dd9f98` | 0/198 | #33→ae2ca7f8 | 0 | audit SHA record only | yes | merge-base --is-ancestor 32f556dd9f98 origin/main = true |
| `experiment/g10-f2-organization-grounding` | A_MERGED_ANCESTOR | `41ac314478c8` | 0/194 | #35→d784d2b3 | 0 | audit SHA record only | yes | merge-base --is-ancestor 41ac314478c8 origin/main = true |
| `experiment/g10-f3-organization-transformations` | A_MERGED_ANCESTOR | `65e60c0cb196` | 0/192 | #36→c76ca634 | 0 | audit SHA record only | yes | merge-base --is-ancestor 65e60c0cb196 origin/main = true |
| `experiment/g10-f4-durable-institution-kernel` | A_MERGED_ANCESTOR | `e649d1d7a2e0` | 0/190 | #37→4cf7bdbd | 0 | audit SHA record only | yes | merge-base --is-ancestor e649d1d7a2e0 origin/main = true |
| `experiment/g10-f5-agt-pag-integration` | A_MERGED_ANCESTOR | `4cb905afcc3c` | 0/188 | #38→ddea5efd | 0 | audit SHA record only | yes | merge-base --is-ancestor 4cb905afcc3c origin/main = true |
| `experiment/g10-g1-campaign-identity-store` | A_MERGED_ANCESTOR | `b45a04e63bd3` | 0/182 | #41→a76bc3ef | 0 | audit SHA record only | yes | merge-base --is-ancestor b45a04e63bd3 origin/main = true |
| `experiment/g10-g2-epistemic-continuity` | A_MERGED_ANCESTOR | `1ffeab061e5e` | 0/180 | #42→1939083d | 0 | audit SHA record only | yes | merge-base --is-ancestor 1ffeab061e5e origin/main = true |
| `experiment/g10-g3-epistemic-intervention` | A_MERGED_ANCESTOR | `a3b0a7792d45` | 0/178 | #43→624d9874 | 0 | audit SHA record only | yes | merge-base --is-ancestor a3b0a7792d45 origin/main = true |
| `experiment/g10-g4-prospective-memory-wait` | A_MERGED_ANCESTOR | `ddcf86810b65` | 0/176 | #44→b7c2b503 | 0 | audit SHA record only | yes | merge-base --is-ancestor ddcf86810b65 origin/main = true |
| `experiment/g10-g5-wake-reconciliation` | A_MERGED_ANCESTOR | `26f1802c3919` | 0/174 | #45→d79dd4cb | 0 | audit SHA record only | yes | merge-base --is-ancestor 26f1802c3919 origin/main = true |
| `experiment/g10-g6-campaign-compiler` | A_MERGED_ANCESTOR | `010da88cdba4` | 0/172 | #46→d328e2e3 | 0 | audit SHA record only | yes | merge-base --is-ancestor 010da88cdba4 origin/main = true |
| `experiment/g10-gc0-campaign-history-hardening` | A_MERGED_ANCESTOR | `f9ce05181a37` | 0/168 | #48→9e98b0c5 | 0 | audit SHA record only | yes | merge-base --is-ancestor f9ce05181a37 origin/main = true |
| `experiment/g10-gc1-campaign-institution-grounding` | A_MERGED_ANCESTOR | `55315f66ee61` | 0/166 | #49→d19d1279 | 0 | audit SHA record only | yes | merge-base --is-ancestor 55315f66ee61 origin/main = true |
| `experiment/g10-gc2-project-work-grounding` | A_MERGED_ANCESTOR | `62f073ad7ae3` | 0/160 | #52→f9815259 | 0 | audit SHA record only | yes | merge-base --is-ancestor 62f073ad7ae3 origin/main = true |
| `experiment/g10-gc3-pag-freeze` | A_MERGED_ANCESTOR | `d0f3f1c336f0` | 0/154 | #55→fc900879 | 0 | audit SHA record only | yes | merge-base --is-ancestor d0f3f1c336f0 origin/main = true |
| `experiment/g10-gc3-unified-admission` | A_MERGED_ANCESTOR | `f16055faf2ca` | 0/156 | #54→77de1687 | 0 | audit SHA record only | yes | merge-base --is-ancestor f16055faf2ca origin/main = true |
| `experiment/g10-h-runtime-scope` | A_MERGED_ANCESTOR | `87e4bacb92fa` | 0/152 | #56→a855bf25 | 0 | audit SHA record only | yes | merge-base --is-ancestor 87e4bacb92fa origin/main = true |
| `experiment/g10-i-organization-dynamics` | A_MERGED_ANCESTOR | `0020e14a18ae` | 0/148 | #58→bd7ce480 | 0 | audit SHA record only | yes | merge-base --is-ancestor 0020e14a18ae origin/main = true |
| `experiment/g10-j-governed-evolution` | A_MERGED_ANCESTOR | `54998f5ab521` | 0/144 | #60→ff3c42a3 | 0 | audit SHA record only | yes | merge-base --is-ancestor 54998f5ab521 origin/main = true |
| `experiment/g10-k-boundary-memory` | A_MERGED_ANCESTOR | `26f56c87f020` | 0/140 | #62→7fafe3c9 | 0 | audit SHA record only | yes | merge-base --is-ancestor 26f56c87f020 origin/main = true |
| `experiment/g10-l-federated-boundary` | A_MERGED_ANCESTOR | `7f01fda83678` | 0/136 | #64→2059199e | 0 | audit SHA record only | yes | merge-base --is-ancestor 7f01fda83678 origin/main = true |
| `experiment/g10-m-runtime-structural-evolution` | A_MERGED_ANCESTOR | `26a4fe31beef` | 0/132 | #66→90b95211 | 0 | audit SHA record only | yes | merge-base --is-ancestor 26a4fe31beef origin/main = true |
| `experiment/g10-n-reasoning-cells` | A_MERGED_ANCESTOR | `fbd182ceb263` | 0/128 | #68→bf4a19ef | 0 | audit SHA record only | yes | merge-base --is-ancestor fbd182ceb263 origin/main = true |
| `experiment/g10-o-application-surface` | A_MERGED_ANCESTOR | `347406d16734` | 0/124 | #70→c548bff2 | 0 | audit SHA record only | yes | merge-base --is-ancestor 347406d16734 origin/main = true |
| `experiment/g10-y-evidence-authority` | A_MERGED_ANCESTOR | `dbf6fb87f409` | 0/82 | #90→9c372b06 | 0 | audit SHA record only | yes | merge-base --is-ancestor dbf6fb87f409 origin/main = true |
| `experiment/g10-z-promotion-authority` | A_MERGED_ANCESTOR | `15d6e5808f3e` | 0/78 | #92→2761b50e | 0 | audit SHA record only | yes | merge-base --is-ancestor 15d6e5808f3e origin/main = true |
| `experiment/rc-1-live-principal` | A_MERGED_ANCESTOR | `a851848f36f5` | 0/24 | #118→a30a328a #117→b22187cd | 0 | audit SHA record only | yes | merge-base --is-ancestor a851848f36f5 origin/main = true |
| `experiment/ux-a-one-request-collaboration` | A_MERGED_ANCESTOR | `e34dc1aace6f` | 0/42 | #110→86ac2684 | 0 | audit SHA record only | yes | merge-base --is-ancestor e34dc1aace6f origin/main = true |
| `experiment/ux-b-cross-project` | A_MERGED_ANCESTOR | `ffb2d55dd963` | 0/38 | #112→390623b5 | 0 | audit SHA record only | yes | merge-base --is-ancestor ffb2d55dd963 origin/main = true |
| `experiment/ux-c-host-runtime` | A_MERGED_ANCESTOR | `b60685b5c831` | 0/34 | #114→eb8fe90b | 0 | audit SHA record only | yes | merge-base --is-ancestor b60685b5c831 origin/main = true |
| `fix/main-state-path-test-host-native` | A_MERGED_ANCESTOR | `4d75177de9e2` | 0/287 | #9→b02e7baf | 0 | audit SHA record only | yes | merge-base --is-ancestor 4d75177de9e2 origin/main = true |
| `fix/test-temp-hygiene` | A_MERGED_ANCESTOR | `13af60257856` | 0/30 | #116→b7fcb399 | 0 | audit SHA record only | yes | merge-base --is-ancestor 13af60257856 origin/main = true |
| `refactor/sr1-architecture` | A_MERGED_ANCESTOR | `de2d1c143b7a` | 0/3 | #119→74bb1422 | 0 | audit SHA record only | yes | merge-base --is-ancestor de2d1c143b7a origin/main = true |
| `chore/sr1-checkpoint` | A_MERGED_ANCESTOR | `b9078de329e9` | 0/1 | #120→4028b6a3 | 0 | audit SHA record only | yes | merge-base --is-ancestor b9078de329e9 origin/main = true |
| `experiment/g10-aa-closure` | A_MERGED_ANCESTOR | `8dfcb52679c1` | 0/70 | #96→9f29547b | 0 | audit SHA record only | yes | merge-base --is-ancestor 8dfcb52679c1 origin/main = true |
| `experiment/g10-ab-closure` | A_MERGED_ANCESTOR | `3038dc86dd7a` | 0/66 | #98→eca28ecc | 0 | audit SHA record only | yes | merge-base --is-ancestor 3038dc86dd7a origin/main = true |
| `experiment/g10-ac-closure` | A_MERGED_ANCESTOR | `afde6d6c0ea1` | 0/62 | #100→4f5daec1 | 0 | audit SHA record only | yes | merge-base --is-ancestor afde6d6c0ea1 origin/main = true |
| `experiment/g10-ac-r-closure` | A_MERGED_ANCESTOR | `0341db591312` | 0/60 | #101→d83f3098 | 0 | audit SHA record only | yes | merge-base --is-ancestor 0341db591312 origin/main = true |
| `experiment/g10-ad-closure` | A_MERGED_ANCESTOR | `666ee670c19b` | 0/54 | #104→a45f7c81 | 0 | audit SHA record only | yes | merge-base --is-ancestor 666ee670c19b origin/main = true |
| `experiment/g10-ae-closure` | A_MERGED_ANCESTOR | `571c2032dd47` | 0/50 | #106→a7628ab6 | 0 | audit SHA record only | yes | merge-base --is-ancestor 571c2032dd47 origin/main = true |
| `experiment/g10-ae-r-closure` | A_MERGED_ANCESTOR | `ab8703953e31` | 0/44 | #109→437d1c9a | 0 | audit SHA record only | yes | merge-base --is-ancestor ab8703953e31 origin/main = true |
| `experiment/g10-gc2-gc6-production-loop-closure` | A_MERGED_ANCESTOR | `fc8a5b4a75ea` | 0/164 | #50→b417baf7 | 0 | audit SHA record only | yes | merge-base --is-ancestor fc8a5b4a75ea origin/main = true |
| `experiment/g10-gc2-pag-final-closure` | A_MERGED_ANCESTOR | `a0469eb3ce71` | 0/158 | #53→31e8d224 | 0 | audit SHA record only | yes | merge-base --is-ancestor a0469eb3ce71 origin/main = true |
| `experiment/g10-h-closure` | A_MERGED_ANCESTOR | `9d3a20407c4f` | 0/150 | #57→b59fe586 | 0 | audit SHA record only | yes | merge-base --is-ancestor 9d3a20407c4f origin/main = true |
| `experiment/g10-i-closure` | A_MERGED_ANCESTOR | `17a38bc4107c` | 0/146 | #59→b30b0112 | 0 | audit SHA record only | yes | merge-base --is-ancestor 17a38bc4107c origin/main = true |
| `experiment/g10-j-closure` | A_MERGED_ANCESTOR | `1caaf2de90bd` | 0/142 | #61→67b29c9e | 0 | audit SHA record only | yes | merge-base --is-ancestor 1caaf2de90bd origin/main = true |
| `experiment/g10-k-closure` | A_MERGED_ANCESTOR | `0274ec7b927a` | 0/138 | #63→2b7aa481 | 0 | audit SHA record only | yes | merge-base --is-ancestor 0274ec7b927a origin/main = true |
| `experiment/g10-l-closure` | A_MERGED_ANCESTOR | `76a9a4ba3b2e` | 0/134 | #65→dd38147b | 0 | audit SHA record only | yes | merge-base --is-ancestor 76a9a4ba3b2e origin/main = true |
| `experiment/g10-m-closure` | A_MERGED_ANCESTOR | `3ebd8b48e60a` | 0/130 | #67→c08f9603 | 0 | audit SHA record only | yes | merge-base --is-ancestor 3ebd8b48e60a origin/main = true |
| `experiment/g10-n-closure` | A_MERGED_ANCESTOR | `1d69ee06a21c` | 0/126 | #69→d1e128e1 | 0 | audit SHA record only | yes | merge-base --is-ancestor 1d69ee06a21c origin/main = true |
| `experiment/g10-o-closure` | A_MERGED_ANCESTOR | `d1f2acc56401` | 0/122 | #71→74b0a900 | 0 | audit SHA record only | yes | merge-base --is-ancestor d1f2acc56401 origin/main = true |
| `experiment/g10-y-closure` | A_MERGED_ANCESTOR | `8db49c2e7ad0` | 0/80 | #91→d809a908 | 0 | audit SHA record only | yes | merge-base --is-ancestor 8db49c2e7ad0 origin/main = true |
| `experiment/g10-z-closure` | A_MERGED_ANCESTOR | `c7943bc85e08` | 0/76 | #93→ae87cab2 | 0 | audit SHA record only | yes | merge-base --is-ancestor c7943bc85e08 origin/main = true |
| `experiment/g10-z-closure-2` | A_MERGED_ANCESTOR | `d85e2aa89c97` | 0/74 | #94→0164aab7 | 0 | audit SHA record only | yes | merge-base --is-ancestor d85e2aa89c97 origin/main = true |
| `experiment/ux-a-closure` | A_MERGED_ANCESTOR | `71335f9c9731` | 0/40 | #111→2e0f48b2 | 0 | audit SHA record only | yes | merge-base --is-ancestor 71335f9c9731 origin/main = true |
| `experiment/ux-b-closure` | A_MERGED_ANCESTOR | `cd7e672c9d8f` | 0/36 | #113→a36d37b1 | 0 | audit SHA record only | yes | merge-base --is-ancestor cd7e672c9d8f origin/main = true |
| `experiment/ux-c-closure` | A_MERGED_ANCESTOR | `d480f603106e` | 0/32 | #115→6c7181d6 | 0 | audit SHA record only | yes | merge-base --is-ancestor d480f603106e origin/main = true |
| `experiment/g10-b3-minimal-binding-resolver-spike` | C_SUPERSEDED_HISTORY | `4fdb69f8ba65` | 1/258 | #15→8ac32ed4 | 1 | audit SHA record only | yes | work merged via PR #15 (merge 8ac32ed48f02); the 1 remaining commit(s) are post-merge records pushed after the merge |
| `experiment/g10-c3-grounded-binding-plan` | C_SUPERSEDED_HISTORY | `26c592cb7cba` | 1/236 | #20→297ffee5 | 1 | audit SHA record only | yes | work merged via PR #20 (merge 297ffee5ddad); the 1 remaining commit(s) are post-merge records pushed after the merge |
| `experiment/g10-d4-live-runtime-observation` | C_SUPERSEDED_HISTORY | `abeefe4e07ca` | 1/224 | #24→5d8202d8 | 1 | audit SHA record only | yes | work merged via PR #24 (merge 5d8202d85c72); the 1 remaining commit(s) are post-merge records pushed after the merge |
| `experiment/g10-d5-advanced-runtime-integration` | C_SUPERSEDED_HISTORY | `8b6faf7a481a` | 1/221 | #25→e1a3616a | 1 | audit SHA record only | yes | work merged via PR #25 (merge e1a3616acd6b); the 1 remaining commit(s) are post-merge records pushed after the merge |
| `experiment/g10-e0-d-authority-participation-preflight` | C_SUPERSEDED_HISTORY | `60e037444111` | 1/218 | #26→225c20f7 | 1 | audit SHA record only | yes | work merged via PR #26 (merge 225c20f7d429); the 1 remaining commit(s) are post-merge records pushed after the merge |
| `experiment/g10-e6-federation-campaign-closure` | C_SUPERSEDED_HISTORY | `3e51fceaec0a` | 1/200 | #32→6afa2920 | 1 | audit SHA record only | yes | work merged via PR #32 (merge 6afa2920dabc); the 1 remaining commit(s) are post-merge records pushed after the merge |
| `experiment/g10-f1-coalition-grounding` | C_SUPERSEDED_HISTORY | `b826a89f1da3` | 1/196 | #34→3eb70e3b | 1 | FOLD INTO MAIN: the CI evidence the placeholder points at is restored into that document, so main no longer refers to a commit outside main | yes | work merged via PR #34 (merge 3eb70e3bd33c); the 1 remaining commit(s) are post-merge records pushed after the merge |
| `experiment/g10-f6-organization-institution-closure` | C_SUPERSEDED_HISTORY | `aab6ec3c7ac4` | 1/186 | #39→3f3ab6f9 | 1 | audit SHA record only | yes | work merged via PR #39 (merge 3f3ab6f91f31); the 1 remaining commit(s) are post-merge records pushed after the merge |
| `experiment/g10-g0-pag-preflight-governance-closure` | C_SUPERSEDED_HISTORY | `61c1779bea1a` | 1/184 | #40→55574842 | 1 | audit SHA record only | yes | work merged via PR #40 (merge 55574842eb2c); the 1 remaining commit(s) are post-merge records pushed after the merge |
| `experiment/g10-g7-pag-campaign-closure` | C_SUPERSEDED_HISTORY | `b5b8ef186ba8` | 1/170 | #47→126c11ed | 1 | audit SHA record only | yes | work merged via PR #47 (merge 126c11ed0f67); the 1 remaining commit(s) are post-merge records pushed after the merge |
| `experiment/g10-gc7-gc8-installed-pag-closure` | C_SUPERSEDED_HISTORY | `4622c625c9e3` | 1/162 | #51→0c45ac7c | 1 | audit SHA record only | yes | work merged via PR #51 (merge 0c45ac7ce60d); the 1 remaining commit(s) are post-merge records pushed after the merge |
| `experiment/pal-fed-0` | F_ABANDONED_UNMERGED | `2c7a63c12366` | 7/288 | — | 7 | audit SHA record only | yes | 7 unique commit(s) and OPEN PR #1 — requires the §4 E purpose review; §4 E review → F_ABANDONED_UNMERGED (None of the prototype's 15 `src/federation/` files ever appeared in main's histo…) |
| `experiment/pal-fed-0-dsh` | F_ABANDONED_UNMERGED | `c0718c9f790f` | 16/288 | — | 16 | audit SHA record only | yes | 16 unique commit(s) and OPEN PR #2 — requires the §4 E purpose review; §4 E review → F_ABANDONED_UNMERGED (same evidence as `experiment/pal-fed-0`: never in main's history, superseded by …) |
| `experiment/pal-fed-0e` | F_ABANDONED_UNMERGED | `bae56f9184e4` | 19/288 | — | 19 | audit SHA record only | yes | 19 unique commit(s) and OPEN PR #3 — requires the §4 E purpose review; §4 E review → F_ABANDONED_UNMERGED (same evidence as `experiment/pal-fed-0`: never in main's history, superseded by …) |
| `experiment/pal-fed-0f` | F_ABANDONED_UNMERGED | `d1bb38c9fd4a` | 22/288 | — | 22 | audit SHA record only | yes | 22 unique commit(s) and OPEN PR #4 — requires the §4 E purpose review; §4 E review → F_ABANDONED_UNMERGED (same evidence as `experiment/pal-fed-0`: never in main's history, superseded by …) |
| `experiment/pal-fed-0g` | F_ABANDONED_UNMERGED | `b310f96b93fe` | 26/288 | — | 26 | audit SHA record only | yes | 26 unique commit(s) and OPEN PR #5 — requires the §4 E purpose review; §4 E review → F_ABANDONED_UNMERGED (same evidence as `experiment/pal-fed-0`: never in main's history, superseded by …) |
| `experiment/pal-fed-0h` | F_ABANDONED_UNMERGED | `d75b59b3ec7b` | 29/288 | — | 29 | audit SHA record only | yes | 29 unique commit(s) and OPEN PR #6 — requires the §4 E purpose review; §4 E review → F_ABANDONED_UNMERGED (same evidence as `experiment/pal-fed-0`: never in main's history, superseded by …) |
| `experiment/pal-fed-0i` | F_ABANDONED_UNMERGED | `b4a0334b8f34` | 40/288 | — | 40 | audit SHA record only | yes | 40 unique commit(s) and OPEN PR #7 — requires the §4 E purpose review; §4 E review → F_ABANDONED_UNMERGED (same evidence as `experiment/pal-fed-0`: never in main's history, superseded by …) |

