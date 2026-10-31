/**
 * COG-1 — the quoted costs, as an INDEPENDENT oracle table.
 *
 * These are transcribed from `scenario/sources/resources.md` and the between-round
 * update `scenario/updates/U2-lift-quote-revised.md`. The oracle uses its OWN copy
 * so a participant cannot change the ground truth by editing the pack.
 */
export const ENVELOPE = 48_000;

export const QUOTED = Object.freeze({
  ROUND_1: Object.freeze([
    { key: "EVENING_OPENING", aliases: ["evening opening", "evening programme opening", "evening opening (13 weeks)"], cost: 9600 },
    { key: "LATE_BUS", aliases: ["late bus", "minibus", "late bus subsidy", "bus subsidy"], cost: 14400 },
    { key: "LIFT_REPAIR", aliases: ["lift repair", "lift and accessible entrance", "accessible entrance reinstatement"], cost: 22000 },
    { key: "YOUTH_STUDIO_SESSIONS", aliases: ["additional youth studio sessions", "youth studio sessions", "extra youth studio"], cost: 6500 },
    { key: "PRINT_CAMPAIGN", aliases: ["print and poster campaign", "poster campaign", "print campaign"], cost: 9000 },
    { key: "MAILER", aliases: ["targeted mailer", "mailer to priority", "mailer"], cost: 4200 },
    { key: "STAFF_TRAINING", aliases: ["staff training", "welcome and access awareness training"], cost: 2800 },
    { key: "CAFE_EQUIPMENT", aliases: ["cafe equipment", "café equipment"], cost: 7500 },
  ]),
  ROUND_2: Object.freeze([
    { key: "EVENING_OPENING", aliases: ["evening opening", "evening programme opening"], cost: 9600 },
    { key: "LATE_BUS", aliases: ["late bus", "minibus", "late bus subsidy", "bus subsidy"], cost: 14400 },
    { key: "LIFT_REPAIR", aliases: ["lift repair", "lift and accessible entrance", "accessible entrance reinstatement"], cost: 27500 },
    { key: "YOUTH_STUDIO_SESSIONS", aliases: ["additional youth studio sessions", "youth studio sessions", "extra youth studio"], cost: 6500 },
    { key: "PRINT_CAMPAIGN", aliases: ["print and poster campaign", "poster campaign", "print campaign"], cost: 9000 },
    { key: "MAILER", aliases: ["targeted mailer", "mailer to priority", "mailer"], cost: 4200 },
    { key: "STAFF_TRAINING", aliases: ["staff training", "welcome and access awareness training"], cost: 2800 },
  ]),
});

export const CAFE_REMOVED_IN_ROUND_2 = true;

/** Ground truth the rubric is written against. Never derived from a participant's output. */
export const GROUND_TRUTH = Object.freeze({
  SURVEY_SAMPLE: "310 forms handed out at Family Saturdays on a free-entry weekend; 78% attended with children; 71% by car; no non-attenders, weekday or evening audience sampled",
  YOUTH_STUDIO: "monthly visits fell because delivery dropped from 4 to 2 sessions a month in June 2024; unique participants rose from 71 (Jan 2024) to 115 (Mar 2025); interest did not fall",
  EVENING_PILOT: "the 2023 evening programme's gain disappeared when the minibus stopped, so transport is the active ingredient",
  POSTER_CAMPAIGN: "the 2022 £9,000 poster campaign produced no measurable change; the board minuted not to repeat it without a specific audience and offer",
  LIFT_SEQUENCING: "capital work; 6-week lead time in round 1 and 8 weeks with a £27,500 quote in round 2; first-floor events are not permitted until it is repaired; in round 2 the accessible entrance is required before any evening event with more than 60 attendees",
  ENVELOPE: "£48,000 for 13 weeks, no carry-over; only quoted costs may be used; capital and revenue cannot be swapped",
  ESTATES_SURVEY: "48% of 120 households have never heard of the centre; among those who have, 57% name transport home as the main barrier and 11% programme content",
  CAFE_NOTICE: "information only: the coffee supplier changes and the equipment refresh is deferred; it must not change the plan",
});
