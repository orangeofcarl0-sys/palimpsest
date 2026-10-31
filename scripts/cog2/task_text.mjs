/**
 * COG-2 task texts. Fixed before any trial; the oracle and the protocol quote these verbatim.
 */

export const DELIVERABLES = ["deliverables/plan.md"];

export const PLAN_TASK = `Produce a six-month programme plan for January to June 2026 for Harrowgate Community Trust.

Use the material in the working directory. The programming budget is £60,000. Write the plan to
deliverables/plan.md. It must contain:

1. a month-by-month schedule;
2. a budget table that adds up to no more than £60,000;
3. a short rationale that states which evidence you relied on and what you are uncertain about.

Do not write any other files.`;

export const TASK_SHAPED_INVITATION =
  "This is an ongoing project. Earlier work on this programme is recorded in the project workspace and may be inspected.";

export const NEGATIVE_CONTROL_TASK = `Rewrite the following paragraph so that it is clearer and no longer than 80 words. Do not create any files or a plan; put the rewritten paragraph in your reply.

"The trust is exploring a range of possible programming directions for the next six months in order to address a decline in attendance which has been observed across a number of sessions, and the board is keen to ensure that any future programme is both attractive to existing members and successful in reaching new audiences, while remaining within the financial and staffing constraints that apply."`;

export const POSITIVE_CONTROL_TASK = `This is a mechanism check. Do not produce a plan and do not write files.

Inspect the project workspace's recorded journal entries. For each entry, report its kind, its
title, and one sentence on what it establishes. Then state which entry (or entries) bear on the
question "should the trust run Friday evening events in 2026?" and why. If an entry is stale or
misleading, say so and say what in the source pack contradicts it.`;

export const ROUND_ONE_TASK = `Investigate two questions for Harrowgate Community Trust and record your conclusions as durable notes for a later programme plan.

The questions:
1. Did the 2023 Friday evening film pilot succeed, and what does it imply for a 2026 evening series?
2. What is the current condition of the east hall, and what material can it hold?

Read the source pack. Do not write the programme plan yet. Record at least two conclusions, each
with the evidence you relied on and any uncertainty you have.`;

export const ROUND_ONE_JOURNAL_INSTRUCTION = `Record your conclusions in the project journal using
palimpsest_project with action "journal": use kind NEGATIVE_RESULT for a failure that should not be
repeated, REFERENCE_NOTE for a factual condition or a positive observation, and OPPORTUNITY for a
promising direction. Give each entry a title, a body, and a provenance of "round-1 investigation".`;

export const ROUND_ONE_FILE_INSTRUCTION = `Append your conclusions to sources/PRIOR-NOTES.md under a
heading "Round 1 investigation (January 2026)". Keep the existing notes intact.`;

export const ROUND_TWO_TASK = `The source pack has been updated. Produce the six-month programme
plan for January to June 2026 for Harrowgate Community Trust, using the current material in the
working directory.

The programming budget is £60,000. Write the plan to deliverables/plan.md. It must contain:

1. a month-by-month schedule;
2. a budget table that adds up to no more than £60,000;
3. a short rationale that states which evidence you relied on, how the January updates changed
   your assumptions, and what you are uncertain about.

Do not write any other files.`;

export const ROUND_TWO_DELIVERABLE = "deliverables/plan.md";

export const NEGATIVE_CONTROL_CONSTRAINT =
  "Answer in the reply only; do not read the project journal, do not create a project, and do not start any work.";
