# Metrics and measurement plan

**Scope.** These are the measures for the Evening Access Pilot (Thursday opening +
Northside–Kiln Field minibus, £24,000) and its three supporting strands — additional
Youth Studio sessions, welcome and access training, and the targeted mailer — which
together make up the £37,500 committed against the £48,000 envelope (`budget.md`).

**Principle.** Every number the board will be asked to believe is defined here, before
the quarter starts, with its baseline, its source, its owner and the threshold at which
the plan changes course. Targets are set from the pack's own evidence, not from ambition.

**The uncomfortable starting position.** The centre cannot currently measure the thing
that matters most. There is no postcode, age or disability field anywhere in
`attendance.csv` (`assessment.md` E20). The council requires quarterly equalities
monitoring for Northside and Kiln Field (`constraints.md` Reporting) and the centre
cannot produce it. Two of the metrics below (M2, M6) therefore have a baseline of
*nothing*, and the first task of the quarter is to create the instrument that makes
them measurable. `updates/U1` gives a household-level starting point (15% of estate
households have ever attended; 48% have never heard of the centre), but it is not a
programme-level baseline and cannot be used as one.

---

## 1. Definitions and data rules

| Term | Definition | Why it is stated |
|---|---|---|
| **Visit** | One person attending one session. A person attending three sessions counts as three visits. | `attendance.csv` reports visits above unique participants, so visits are attendances, not people. Mixing the two inflates totals. |
| **Unique participant** | Distinct people within **one month**, as recorded in `attendance.csv`. | It is a **monthly** figure. It is **not** deduplicated across months, so quarterly "unique" totals cannot be produced by summing. All quarterly reporting uses monthly range or peak. This rule exists to stop a plausible-looking but wrong total appearing in the council report. |
| **Priority-neighbourhood resident** | Postcode on the council's Northside or Kiln Field priority list. | The list itself is **not in this pack** (UNC-9). Until the council supplies it, estate share is reported as "postcode captured, not yet mapped" — not guessed. |
| **Evening attendance** | Visits to Evening Talks and Access Cinema sessions scheduled in the pilot's Thursday evening slot. | Matches the Q2 2024 baseline definition (477 visits, 12 sessions), so the comparison is like-for-like. |
| **Baseline quarter** | **Q2 2024 (April–June)**, the same quarter one year earlier. | Seasonally matched. Q1 2025 is carried as a secondary reference because it is the current run-rate, but it is a different season and Family Saturdays alone swings ~25% between Q1 and Q2. |
| **Attributable (mailer)** | A registration or first visit from a Northside or Kiln Field postcode that cites the mailer. | Self-reported, so weak. Treated as directional only. |
| **Evening event** | A programmed Thursday opening of the pilot, including talks, films and any other public event in the evening slot. | The 60-attendee licensing condition attaches to "evening events"; the scope of the term is confirmed with building control in week 0 (UNC-3). |
| **Attendee cap** | **60 people at an evening event**, counted at the door, until the accessible entrance is operable. | A licensing condition, not a target (`updates/U2`). The hall holds 180; the cap binds first. |
| **Turnaway** | A person who seeks entry to an evening event after the count has reached 60 and is not admitted. | Recorded by count, and by postcode where voluntarily offered. It is the only estimate of demand above the cap. |

---

## 2. The metric set

### Primary — is the pilot working?

| ID | Metric | Baseline | Target | Source | Frequency | Owner |
|---|---|---|---|---|---|---|
| **M1** | Evening attendance (visits) | 477 visits, Q2 2024 (12 sessions; 39.8/session) | **≥640 visits** across the quarter (+34%; the 2023 pilot delivered +38% YoY), **or** attendance plus recorded turnaways ≥640 | Box office counts by session | Weekly | FOH coordinator |
| **M2** | Priority-neighbourhood share of evening attendance | **Not measured** — no postcode field exists. First reading week 6 | **≥35%** of evening attenders resident in Northside or Kiln Field by week 13 | Door capture form | Weekly from week 3; reported week 6 and 13 | FOH coordinator |
| **M3** | Minibus utilisation (passengers per return trip) | **None** — no 2023 passenger counts survived into this pack | Mean **≥8** by week 6; **floor of 6** triggers renegotiation (stop rule S3) | Operator manifest, counted by centre contact | Every trip | FOH coordinator |

### Primary — is the Studio constraint relieved?

| ID | Metric | Baseline | Target | Source | Frequency | Owner |
|---|---|---|---|---|---|---|
| **M4** | Youth Studio visits | 524 visits, Q2 2024 (10 sessions; 52.4/session) | **≥1,000 visits** across 18 sessions (55.6/session) | Partner session registers | Monthly | Partner + centre |
| **M5** | Youth Studio monthly unique participants | 109–115 per month, Jan–Mar 2025 (monthly, not cumulative) | **≥140** in month 3 | Partner registers | Monthly | Partner |

### Enabling — can we see anything at all?

| ID | Metric | Baseline | Target | Source | Frequency | Owner |
|---|---|---|---|---|---|---|
| **M6** | Postcode capture rate | **0%** — field does not exist | **≥80%** of recorded visits from week 6 | Door capture form vs box office count | Weekly | FOH coordinator |
| **M9** | Evening event finish-time compliance | n/a — no evening opening currently | **100%** of evening events finished by **20:55** (hard rule; the 21:30 return depends on it) | Session log | Every event | Responsible person |
| **M10** | Named responsible person on duty | **0%** — the rota does not staff evenings (`constraints.md`) | **100%** of 13 openings | Rota + signing-in sheet | Every event | FOH coordinator |
| **M13** | 60-attendee cap compliance | n/a — the condition is new (`updates/U2`) | **0 events counted above 60**; **100%** of evenings counted at the door; every turnaway logged | Door count and turnaway log | Every event | Responsible person |

### Guardrails — is the pilot costing us something elsewhere?

| ID | Metric | Baseline | Target | Source | Frequency | Owner |
|---|---|---|---|---|---|---|
| **M7** | Family Saturdays visits (guardrail) | 1,807 visits, Q2 2024 (15 sessions) | **≥1,626** — no decline worse than 10% | Box office | Monthly | FOH coordinator |
| **M8** | Community Choir visits (guardrail) | 749 visits, Q2 2024 (12 sessions) | **≥674** — no decline worse than 10% | Box office | Monthly | FOH coordinator |

M7 and M8 are not targets to beat. They are **controls**: if the Choir and Family
Saturdays stay flat while evenings rise, the evening rise is attributable to the pilot
rather than to a good spring. If they fall, the pilot may be displacing existing
activity or stretching the 1.5 FTE front-of-house beyond what the weekday programme
needs — which is a stop signal, not a success.

### Value — is it worth the money?

| ID | Metric | Baseline | Target | Source | Frequency | Owner |
|---|---|---|---|---|---|---|
| **M11** | Cost per additional visit | Not computable — the pack holds no programme cost data (UNC-11) | **≤£59 blended**; **≤£14 Youth Studio**; evening reported separately at ~£147 | Budget ÷ incremental visits | Week 10 and 13 | Finance trustee |
| **M12** | Targeted mailer response | n/a — new activity | **≥30** attributable registrations by end of week 4, else no repeat (stop rule S5) | Registration route + door form | Week 4 | FOH coordinator |

---

## 3. Why these targets and not higher ones

| Target | Derivation |
|---|---|
| M1: +34% (640 visits) | The 2023 pilot with a minibus produced +38% YoY. Setting 34% is deliberately **below** the one observed effect, because 2023 had novelty on its side and this quarter does not. The current run-rate (Q1 2025: 559 visits over 12 sessions = 46.6/session) implies 605 visits over 13 sessions; 640 is only +5.6% per session above that. **The cap is the new constraint:** 640 is 49.2 per opening across 13 (82% of 60) or 53.3 across 12 programmed sessions (89% of 60), and the 2023 effect (54.9/session) would be 91.4% of the cap. The target is retained because it is the same test as round 1, but it is now a near-capacity target, and the reading rule (attendance + turnaways) prevents a cap artefact being read as a transport failure. |
| M2: ≥35% | The 2023 record says "the majority of new evening attendees" came from the two estates, not the majority of all attendees. 35% of all evening attenders is therefore a conservative translation of a qualitative claim. It is also the first figure of its kind the centre will ever hold, so a wrong-but-documented number is more useful than a precise-sounding invention. At 640 visits, 35% is 224 estate visits, about 17 per evening — which may press against a single minibus's capacity before it presses against the 60 cap. |
| M4: ≥1,000 visits | 18 sessions (6 existing + 12 extra) at 55.6/session. Current performance is 74/session; tripling the cadence will not fill every session as reliably, so a **25% discount** is assumed. The block is not linear: the first six extra sessions draw on the partner's 40-name waiting list; the second six have to fill from the same base. If the existing six sessions hold at 74, the twelve extra need to average about 46 — a deliberately modest assumption for the marginal block. A target of 1,200 (66.7/session) would assume the new sessions fill at nine-tenths of current performance, which nothing in the pack supports. If the 60-attendee condition also catches Studio sessions, the hard ceiling is 1,080 (18 × 60) and 1,000 remains achievable only if demand holds; the shortfall would be reported, not hidden. |
| M5: ≥140/month | The Jan–Mar 2025 trend is +3 participants per month (109 → 112 → 115) on a flat session count, plus a 40-name waiting list. 140 is 115 plus 25 from the waiting list — below the 155 ceiling implied by current participants plus the full waitlist, and deliberately not a step change. |
| M7/M8: −10% floor | Normal seasonal variation at this venue is roughly ±5% (Q1 2024 → Q1 2025: Family Saturdays +1.8%, Choir +2.5%). A 10% floor sits outside normal variation, so a breach is a real signal rather than noise. |
| M11: ≤£59 / ≤£14 / ~£147 | 37,500 ÷ 639 additional visits = £58.7; 6,500 ÷ 476 additional Studio visits = £13.7; 24,000 ÷ 163 additional evening visits = £147.2. The evening ratio is unchanged from round 1 because both its cost and target are unchanged. |
| M13: 0 events above 60 | The condition is a licence, not a stretch target. One event above 60 is a breach, not a near miss. Turnaways are logged because they are the only demand floor the cap permits. |

---

## 4. What would make us change course

Pre-registered in `pilot.md` §6 and repeated here because these are the numbers that
will actually be used in the room:

| Rule | Trigger | Threshold | Action |
|---|---|---|---|
| **S1** | Rota failure | No named responsible person for an evening | **That evening is cancelled, not run.** Two consecutive failures suspend the strand |
| **S2** | Safety | Any incident at an evening event or on the minibus | Suspend the strand pending review |
| **S3** | Minibus under-used | < 6 passengers/trip averaged over 4 consecutive weeks | Renegotiate route and times with the operator; if no improvement by week 10, recommend not renewing |
| **S4** | Reach off trajectory | Estate share < 15% by week 8 (i.e. under half the linear path to 35%) | The mechanism is not working. Stop the mailer, refer the evening strand to the board |
| **S5** | Mailer ineffective | < 30 attributable registrations by week 4 | Do not repeat; no second wave |
| **S6** | Partner delivery shortfall | Fewer than the confirmed 4 extra sessions/month | Run what can be staffed and report the shortfall; the £6,500 is a block price, so underspend arises only if the block does not run at all |
| **S7** | Cap saturation | 3+ evenings at 60 with recorded turnaways before week 8 | Report at G2 with turnaway evidence; recommend instructing the capital bid; do not raise the cap or add a second wave |
| **C1** | Cap breach | Any event counted above 60 | Licensing incident: entry stops, responsible person records it, report to board and council within 5 working days; board reviews suspension, and a second breach suspends the strand |
| — | Overrun | Any event finishing after 20:55 | Recorded as an incident; recurring overruns force a programme change (shorter films, earlier start) |
| — | Displacement | Choir or Family Saturdays down more than 10% | Investigate front-of-house capacity before continuing the evening strand |

---

## 5. Known weaknesses in this measurement plan

Recorded so the board can discount appropriately:

1. **Self-reported postcode capture.** Door capture at a busy event will be incomplete
   and skewed towards people who queue patiently. The 80% target is a mitigation, not a
   cure. Estate share will carry a margin of error that cannot be quantified without a
   capture-rate audit.
2. **No control group.** The comparison programmes are a proxy control, not a randomised
   one. The pilot changes *when* events happen as well as how people reach them, and
   this design cannot separate the two.
3. **Thirteen weeks is too short to observe durability.** The 2023 evidence suggests the
   effect decays without transport; a single quarter cannot confirm or refute that.
4. **M2 has no baseline.** The first quarter's figure is a baseline, not a change. The
   week-13 report must say "35% of evening attenders were from the two estates, and this
   is the first time we have been able to measure it" — not "reach improved by 35%".
   `updates/U1`'s 15% "ever attended" is a household-level figure and is not comparable.
5. **Visits, not people.** M1 and M4 count attendances. A small number of very frequent
   attenders can move the visit count without widening reach. M2 and M5 exist to catch
   exactly that, and should be read alongside M1 and M4, never instead of them.
6. **The cap censors the top of the demand curve.** M1 can understate demand because
   entry stops at 60. The turnaway log (M13) is the correction, but it is self-selected:
   people who do not queue, or who see a full sign and leave, are not counted. The report
   must say "demand was at least" rather than "demand was".
7. **`updates/U1` measures stated barriers, not behaviour.** 57% naming transport and 22%
   naming cost is strong corroboration for the pilot's direction, but it is not proof that
   removing either barrier converts anyone. The quarter tests transport; nothing tests cost.
8. **The cost barrier is unaddressed.** No quoted line can subsidise tickets or fares
   (UNC-10). The report should not claim the pilot has removed cost as a barrier.

---

## 6. Reporting calendar

| When | What | To whom |
|---|---|---|
| Weekly, from week 1 | One-page dashboard: evening headcount, cap count/turnaways, estate share, capture rate, minibus passengers, incidents | FOH coordinator → finance trustee |
| Week 4 | Mailer and utilisation checkpoint (G1) | Board |
| **Week 6** | **Interim equalities report**: first postcode-based estate figures, capture rate, method and its limits | **Council** (required) |
| Week 10 | Cost per additional visit; cap/turnaway evidence; funding decision paper (G2) | Board |
| **Week 13** | **Quarterly report**: attendance by programme, equalities monitoring for both priority neighbourhoods, pilot result against pre-registered thresholds, cap and turnaway record, and a recommendation | **Council** (required) + board |

The week-13 report states the pilot result against the thresholds in §4 **whether or not
it is flattering**. If volume was met and reach was not, the report says the pilot
failed on its purpose. If volume fell short and turnaways account for the gap, the report
says the cap censored the result and gives the demand floor. It does not choose whichever
reading is kinder.
