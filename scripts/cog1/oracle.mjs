#!/usr/bin/env node
/**
 * COG-1 — the INDEPENDENT ORACLE.
 *
 *   node scripts/cog1/oracle.mjs --rig <dir> [--out <json>]
 *
 * It reads each condition's deliverables and scores them against a rubric that was
 * fixed BEFORE any trial ran. The rubric's ground truth is written here, in the
 * oracle's own words, transcribed from the scenario pack and the released updates —
 * never derived from a participant's output.
 *
 * WHAT THIS IS. A deterministic scorer for structural requirements (budget
 * arithmetic, quoted costs, cross-artifact consistency) and a PRE-REGISTERED
 * keyword rubric for the synthesis claims. Every criterion is listed with what it
 * looks for; nothing is adjusted after seeing a result.
 *
 * WHAT THIS IS NOT. It is not a measure of writing quality or of "intelligence".
 * A rubric can be satisfied by a sentence that happens to contain the right words,
 * which is why every rubric item is also inspected by hand and why the report
 * separates MECHANICAL from RUBRIC from OBSERVED findings.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DELIVERABLES } from "./task_text.mjs";
import { ENVELOPE, QUOTED, GROUND_TRUTH } from "./quoted_costs.mjs";

const args = new Map(process.argv.slice(2).map((a) => {
  const [k, ...rest] = a.replace(/^--/u, "").split("=");
  return [k, rest.join("=")];
}));
const RIG = String(args.get("rig") ?? "");
if (RIG === "") throw new Error("--rig=<dir> is required");
const OUT = String(args.get("out") ?? join(RIG, "oracle.json"));

const CONDITIONS = ["A", "B", "C"];

function text(work, rel) {
  const path = join(work, rel);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}
function json(work, rel) {
  const path = join(work, rel);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { __parseError: readFileSync(path, "utf8").slice(0, 400) };
  }
}
function norm(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[\u2018\u2019]/gu, "'")
    .replace(/[\u2013\u2014]/gu, "-")
    .replace(/\s+/gu, " ");
}
function allText(work, files) {
  return files.map((rel) => text(work, rel)).join("\n");
}
function anyOf(haystack, needles) {
  const h = norm(haystack);
  return needles.filter((needle) => h.includes(norm(needle)));
}

/**
 * Mechanical: budget arithmetic and quoted-cost compliance.
 * `quoted` is the round's table; the oracle owns it, not the participant.
 */
function budgetChecks(decisions, quoted) {
  const failures = [];
  if (decisions === undefined) return { ok: false, failures: ["decisions.json missing"], lines: [] };
  if (decisions.__parseError !== undefined) return { ok: false, failures: ["decisions.json is not valid JSON"], lines: [] };
  const allocations = Array.isArray(decisions.allocations) ? decisions.allocations : [];
  if (allocations.length === 0) failures.push("no allocations");
  const total = Number(decisions.total);
  const sum = allocations.reduce((acc, line) => acc + Number(line.cost ?? 0), 0);
  if (!Number.isFinite(total)) failures.push("total is not a number");
  else if (Math.abs(total - sum) > 0.5) failures.push(`total ${total} does not equal the sum of lines ${sum}`);
  if (Number.isFinite(total) && total > ENVELOPE) failures.push(`total ${total} exceeds the £${ENVELOPE} envelope`);
  const resolved = [];
  for (const line of allocations) {
    const item = String(line.item ?? "");
    const cost = Number(line.cost ?? NaN);
    const match = quoted.find((entry) => entry.aliases.some((alias) => norm(item).includes(norm(alias))));
    if (match === undefined) {
      failures.push(`allocation "${item}" matches no quoted cost`);
      resolved.push({ item, cost, quoted: null, ok: false });
      continue;
    }
    const ok = Math.abs(cost - match.cost) <= 0.5;
    if (!ok) failures.push(`allocation "${item}" costs ${cost}, quoted £${match.cost}`);
    resolved.push({ item, cost, quoted: match.key, expected: match.cost, ok });
  }
  const envelopeField = Number(decisions.budget_envelope);
  if (Number.isFinite(envelopeField) && envelopeField !== ENVELOPE) failures.push(`budget_envelope ${envelopeField} is not £${ENVELOPE}`);
  return { ok: failures.length === 0, failures, lines: resolved, total: Number.isFinite(total) ? total : null, sum };
}

/** Mechanical: the same plan must be described by every artifact. */
function consistencyChecks(work, decisions) {
  const failures = [];
  const pilot = String(decisions?.chosen_pilot?.name ?? "");
  const pilotTokens = norm(pilot).split(/[^a-z0-9]+/u).filter((t) => t.length >= 4);
  const distinctive = pilotTokens.slice(0, 6);
  if (pilot === "") failures.push("chosen_pilot.name is empty");
  else {
    const corpus = norm(allText(work, ["deliverables/pilot.md", "deliverables/plan.md", "deliverables/budget.md"]));
    const hits = distinctive.filter((token) => corpus.includes(token));
    if (hits.length === 0) failures.push("the chosen pilot is named nowhere outside decisions.json");
  }
  const budgetText = norm(text(work, "deliverables/budget.md"));
  const total = Number(decisions?.total);
  if (Number.isFinite(total) && total > 0) {
    const totalPattern = new RegExp(`(?:£|gbp\\s*)?${total.toLocaleString("en-GB").replace(/,/gu, ",?")}`, "u");
    const plain = new RegExp(String(total), "u");
    if (!totalPattern.test(budgetText) && !plain.test(budgetText)) failures.push("budget.md does not state the decisions.json total");
  }
  const metrics = Array.isArray(decisions?.metrics) ? decisions.metrics : [];
  if (metrics.length === 0) failures.push("no metrics declared");
  const metricsText = norm(text(work, "deliverables/metrics.md"));
  if (metrics.length > 0 && metricsText.trim() === "") failures.push("metrics.md is empty though decisions.json declares metrics");
  return { ok: failures.length === 0, failures };
}

/**
 * PRE-REGISTERED RUBRIC.
 *
 * Each item names the ground-truth fact, the artifacts searched, and the phrase
 * families that express it. A `require` of 2 means the item passes only when at
 * least two distinct families appear — one lucky phrase is not enough.
 */
const RUBRIC = [
  {
    id: "SURVEY_SAMPLE",
    weight: 2,
    question: "Does the plan refuse to generalize the 92% satisfaction figure beyond the people surveyed?",
    groundTruth: GROUND_TRUTH.SURVEY_SAMPLE,
    families: [
      ["sample", "only", "saturdays"],
      ["self-selected", "self selected", "biased sample", "sample bias", "non-representative", "not representative", "representativeness"],
      ["non-attender", "non attendee", "does not cover", "cannot be generalized", "cannot generalise", "not generalize", "not generalise", "does not represent"],
      ["weekend", "family saturdays", "free-entry weekend", "free entry weekend"],
    ],
    require: 2,
  },
  {
    id: "YOUTH_SUPPLY",
    weight: 2,
    question: "Does the plan explain the Youth Studio fall as a supply/session-frequency change rather than lost interest?",
    groundTruth: GROUND_TRUTH.YOUTH_STUDIO,
    families: [
      ["session", "sessions", "frequency", "fewer sessions", "halved"],
      ["supply", "delivery", "staffing", "funding change", "partner"],
      ["not interest", "not lost interest", "interest has not", "demand", "waiting list", "unique participants"],
    ],
    require: 2,
  },
  {
    id: "EVENING_TRANSPORT",
    weight: 3,
    question: "Does the plan treat transport as the active ingredient of the 2023 evening success?",
    groundTruth: GROUND_TRUTH.EVENING_PILOT,
    families: [
      ["minibus", "bus", "transport"],
      ["stopped", "when the bus", "without the bus", "removed", "fell back", "returned to"],
      ["active ingredient", "necessary", "depended", "depends on", "conditional", "paired"],
    ],
    require: 2,
  },
  {
    id: "POSTER_EVIDENCE",
    weight: 1,
    question: "Does the plan avoid repeating the 2022 print campaign as a primary intervention, citing the evidence?",
    groundTruth: GROUND_TRUTH.POSTER_CAMPAIGN,
    families: [
      ["2022", "poster", "print campaign"],
      ["no measurable", "no effect", "did not work", "within seasonal", "word of mouth"],
      ["specific offer", "specific audience", "targeted", "not repeat", "avoid"],
    ],
    require: 2,
  },
  {
    id: "LIFT_SEQUENCING",
    weight: 2,
    question: "Does the plan respect the capital lead time and the first-floor restriction?",
    groundTruth: GROUND_TRUTH.LIFT_SEQUENCING,
    families: [
      ["lift", "accessible entrance"],
      ["capital", "lead time", "weeks", "6-week", "6 week", "8-week", "8 week", "sequenc"],
      ["first floor", "first-floor", "not permitted", "before any", "prerequisite"],
    ],
    require: 2,
  },
  {
    id: "ENVELOPE",
    weight: 1,
    question: "Does the plan stay inside the fixed envelope and use only quoted costs?",
    groundTruth: GROUND_TRUTH.ENVELOPE,
    families: [
      ["48,000", "48000", "48k"],
      ["quote", "quoted", "envelope", "no carry-over", "no carry over"],
    ],
    require: 2,
  },
];

const ROUND_2_RUBRIC = [
  {
    id: "LIFT_REQUOTE",
    weight: 3,
    question: "Was the revised lift quote (£27,500, 8 weeks, entrance required before evening events over 60) incorporated?",
    groundTruth: GROUND_TRUTH.LIFT_SEQUENCING,
    families: [
      ["27,500", "27500"],
      ["8 week", "8-week", "eight week"],
      ["60", "sixty", "more than 60", "over 60"],
    ],
    require: 1,
  },
  {
    id: "ESTATES_SURVEY",
    weight: 2,
    question: "Was the estates survey used, including the awareness finding that contradicts the old board minute?",
    groundTruth: GROUND_TRUTH.ESTATES_SURVEY,
    families: [
      ["120", "households", "doorstep"],
      ["48%", "half", "never heard"],
      ["57%", "transport", "get home", "getting home"],
    ],
    require: 2,
  },
  {
    id: "CAFE_NO_CHANGE",
    weight: 2,
    question: "Did the plan correctly treat the café notice as NOT changing the plan?",
    groundTruth: GROUND_TRUTH.CAFE_NOTICE,
    families: [
      ["cafe", "café", "coffee", "supplier"],
      ["no change", "does not change", "doesn't change", "not relevant", "irrelevant", "no effect on the plan", "does not affect"],
    ],
    require: 2,
  },
  {
    id: "CHANGED_DECLARED",
    weight: 1,
    question: "Does decisions.json declare concrete round-2 changes?",
    groundTruth: "the update pack changes the lift economics and the youth supply; the café does not",
    families: [],
    require: 0,
  },
];

function rubricScore(work, items) {
  const corpus = allText(work, DELIVERABLES.filter((d) => d.endsWith(".md")));
  const results = [];
  for (const item of items) {
    const hitFamilies = item.families.filter((family) => anyOf(corpus, family).length > 0);
    const pass = hitFamilies.length >= item.require && item.families.length > 0 ? true : item.families.length === 0 ? null : false;
    results.push({
      id: item.id,
      weight: item.weight,
      pass,
      hitFamilies: hitFamilies.length,
      of: item.families.length,
      require: item.require,
      question: item.question,
      evidence: hitFamilies.map((family) => anyOf(corpus, family)[0]).slice(0, 6),
    });
  }
  const scored = results.filter((r) => r.pass !== null);
  const weight = scored.reduce((acc, r) => acc + r.weight, 0);
  const achieved = scored.reduce((acc, r) => acc + (r.pass === true ? r.weight : 0), 0);
  return { items: results, achieved, weight, ratio: weight === 0 ? null : achieved / weight };
}

function roundTwoDeclared(decisions) {
  const changes = Array.isArray(decisions?.changed_since_round_1) ? decisions.changed_since_round_1 : [];
  return { count: changes.length, changes };
}

function scoreCondition(condition) {
  const dir = join(RIG, condition.toLowerCase());
  const work = join(dir, "work");
  const record = (round) => {
    const path = join(dir, `round-${round}.json`);
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
  };
  if (!existsSync(work)) return { condition, present: false };
  const decisions = json(work, "deliverables/decisions.json");
  const budget = budgetChecks(decisions, QUOTED.ROUND_2);
  const consistency = consistencyChecks(work, decisions);
  const rubric = rubricScore(work, RUBRIC);
  const rubricTwo = rubricScore(work, ROUND_2_RUBRIC);
  const changes = roundTwoDeclared(decisions);
  const missing = DELIVERABLES.filter((rel) => !existsSync(join(work, rel)));
  return {
    condition,
    present: true,
    missing,
    rounds: { one: record(1) ?? null, two: record(2) ?? null },
    budget,
    consistency,
    rubric,
    rubricRound2: rubricTwo,
    changedSinceRound1: changes,
    declaredPilot: decisions?.chosen_pilot ?? null,
    declaredRound: decisions?.round ?? null,
  };
}

const result = { schemaVersion: 1, generatedAt: new Date().toISOString(), envelope: ENVELOPE, conditions: {} };
for (const condition of CONDITIONS) result.conditions[condition] = scoreCondition(condition);
writeFileSync(OUT, JSON.stringify(result, null, 2));
for (const condition of CONDITIONS) {
  const row = result.conditions[condition];
  if (!row.present) {
    console.log(`${condition}: NOT RUN`);
    continue;
  }
  const r1 = row.rounds.one;
  const r2 = row.rounds.two;
  console.log(`${condition}: exit(1)=${r1?.exitCode ?? "-"} exit(2)=${r2?.exitCode ?? "-"} budgetOK=${row.budget.ok} consistencyOK=${row.consistency.ok} rubric=${row.rubric.achieved}/${row.rubric.weight} r2rubric=${row.rubricRound2.achieved}/${row.rubricRound2.weight} changes=${row.changedSinceRound1.count}`);
  for (const failure of [...row.budget.failures, ...row.consistency.failures]) console.log(`   ! ${failure}`);
  for (const item of row.rubric.items) console.log(`   ${item.pass === true ? "PASS" : item.pass === false ? "FAIL" : "n/a "} ${item.id} (${item.hitFamilies}/${item.of} families)`);
  for (const item of row.rubricRound2.items) console.log(`   r2 ${item.pass === true ? "PASS" : item.pass === false ? "FAIL" : "n/a "} ${item.id} (${item.hitFamilies}/${item.of} families)`);
}
console.log(`\nwrote ${OUT}`);
