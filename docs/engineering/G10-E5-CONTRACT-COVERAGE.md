# G10-E5 — Contract Coverage Matrix

| Proof / invariant | Code face | Machine test | Status |
| --- | --- | --- | --- |
| E5-M01 real need → discovery | `declareContactNeed` + `findCandidates` | §128 step 3–4 + discovery test | implemented + machine-tested |
| E5-M02 discovery assigns nothing | pure matcher; store unchanged | empty-store assertion | implemented + machine-tested |
| E5-M03 outbound offer via Ordarium transport | messaging service | sent-list + delivered assertion | implemented + machine-tested |
| E5-M04 authenticated acceptance | commitment service | §128 step 7–8 | implemented + machine-tested |
| E5-M05 commitment ⇏ automatic participation | explicit call required | before/after event check | implemented + machine-tested |
| E5-M06 ephemeral peer collaboration | no point anywhere | §128 flow + absence audit | implemented + machine-tested |
| E5-M07/M08 view derived, PeerRef-anchored | `manpowerPointView` | view test (no manpowerPointId/runtimeAgent) | implemented + machine-tested |
| E5-M09 focus ≠ authority root | no authority concept in module | static audit | preserved + machine-tested |
| E5-M10 competence ≠ authority | advertisement fields only | E2 carry + audit | preserved |
| E5-M11 coalition derived only | `coalitionView` | empty + shape assertions | implemented + machine-tested |
| E5-M12 scheduler never chooses PeerRef | module import audit | static audit | preserved |
| E5-M13 WorkGraph unchanged | no Work event types in store | §128 step 17 | implemented + machine-tested |
| E5-
