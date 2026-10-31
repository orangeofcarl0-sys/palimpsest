/**
 * COG-1 — the ONE task text every condition receives, byte for byte.
 *
 * The text is the experiment's public instrument: it states the goal, the
 * deliverables and the machine-readable schema, and it deliberately does NOT
 * supply a decomposition, a priority order or any part of the analysis.
 */

export const DELIVERABLES = [
  "deliverables/assessment.md",
  "deliverables/options.md",
  "deliverables/pilot.md",
  "deliverables/budget.md",
  "deliverables/metrics.md",
  "deliverables/plan.md",
  "deliverables/uncertainties.md",
  "deliverables/decisions.json",
];

const SCHEMA = `{
  "round": 1,
  "budget_envelope": <number, the envelope you were given>,
  "allocations": [{ "item": "<string>", "cost": <number> }],
  "total": <number, must equal the sum of allocations>,
  "chosen_pilot": { "name": "<string>", "why": "<string>", "target_segments": ["<string>"] },
  "evidence_assessment": [{ "source": "<file or record>", "claim": "<what it says>", "limitation": "<what it does not support>" }],
  "metrics": [{ "name": "<string>", "baseline": "<string>", "target": "<string>" }],
  "uncertainties": ["<string>"],
  "changed_since_round_1": ["<string>"]   // round 2 only; omit in round 1
}`;

export function roundOneTask() {
  return `You are the planning lead for the Riversdale Community Arts Centre (fictional; the working files are synthetic).

Goal: improve participation and service accessibility over the next quarter while respecting a fixed resource envelope.

The working directory contains a source pack:
  sources/README.md, attendance.csv, survey.md, interviews.md,
  constraints.md, resources.md, prior-interventions.md, open-questions.md

Read what you need. Then produce a coherent quarterly plan.

Write ALL of these files (create the deliverables/ directory):
${DELIVERABLES.map((d) => "  " + d).join("\n")}

The Markdown files carry the reasoning and the plan. decisions.json is a machine-readable summary with exactly this shape:
${SCHEMA}

Rules:
- The plan must obey the resource envelope in sources/resources.md and the operating constraints in sources/constraints.md.
- Budget lines must come from the quoted costs; do not invent costs.
- The deliverables must agree with each other: the chosen pilot, the budget and the metrics must describe the same plan.
- Do not pre-solve anything you were not given; where the evidence is insufficient, say so in uncertainties.md.

When you are done, reply with one short paragraph naming your chosen pilot and its total cost.`;
}

export function roundTwoTask() {
  return `This is the second round for the Riversdale Community Arts Centre plan.

Your earlier work is in this same working directory: sources/ (the original pack) and deliverables/ (your round-1 outputs). New material has arrived in updates/ — read every file there.

Revise or continue the plan for the same quarter in the light of the new material. Preserve what the new material does not change; revise what it does.

Rewrite ALL of these files so they describe the CURRENT plan:
${DELIVERABLES.map((d) => "  " + d).join("\n")}

decisions.json must have the same shape as before, with:
  "round": 2,
  plus "changed_since_round_1": a list of concrete things you changed and why.

Rules:
- The plan must obey the CURRENT resource envelope and the CURRENT operating constraints.
- Budget lines must come from the quoted costs; do not invent costs.
- If new material makes part of your earlier plan wrong or unaffordable, change it and say so. If it changes nothing, say what you checked and why it changes nothing.
- The deliverables must agree with each other.

When you are done, reply with one short paragraph naming your current pilot, its total cost, and the single most important change you made.`;
}

export const ROUND_ONE_UPDATES = [];
