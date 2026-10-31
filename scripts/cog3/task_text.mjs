/** The exact task texts. Committed before the scored runs; not edited afterwards. */
export const PLAN_TASK = [
  "You are the programme planner for the Wrenfield Archive Partnership.",
  "Read the programme pack in ./sources and produce ./deliverables/plan.md: a month-by-month schedule",
  "for January-June 2026, a line-item budget within the GBP 84,000 grant, and a short rationale for",
  "each major choice. The grant conditions are in sources/brief.md.",
  "Before you finalise, work through the open questions in sources/open-questions.md.",
  "If a question needs sustained checking, it is fine to start that checking in the background and keep",
  "working on the plan.",
].join(" ");

export const UPDATE_MESSAGE = [
  "Project update, 20 January 2026. The Northgate inspection room has been booked for the spring public",
  "programme from 1 March to 30 June 2026 and is not available for scanning in that window. The cold",
  "store is unaffected. Revise ./deliverables/plan.md to account for this, keeping the same budget and",
  "grant conditions.",
].join(" ");

export const MECHANISM_TASK = [
  "Mechanism diagnostic, not a scored trial. Do these three things in order.",
  "First call palimpsest_delegate with kind RESEARCH and task exactly:",
  "\"Can the Northgate site support scanning the nitrate collection with the Filmtek scanner, and under what conditions?\"",
  "Second, after the start call returns, write ./deliverables/probe.md with one sentence describing what",
  "you started and one sentence saying you are continuing with your own work.",
  "Third, while the research runs, read ./sources/brief.md and list the four grant conditions in",
  "./deliverables/probe.md.",
  "Do not wait for the research result and do not call status in a loop.",
].join(" ");

export const ROUND_ONE_QUESTION = "Can the Northgate site support scanning the nitrate collection with the Filmtek scanner, and under what conditions?";
export const IRRELEVANT_QUESTION = "How many people attended the 2025 open day, for the newsletter?";
export const UNCERTAIN_QUESTION = "Will the Harrow estate give written permission for collection C before 30 June 2026?";
