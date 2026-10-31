#!/usr/bin/env node
/**
 * COG-2 oracle: mechanical extraction plus the pre-registered rubric items.
 *
 *   node scripts/cog2/oracle.mjs --dir <run dir> [--out <file>]
 *
 * The mechanical part is deliberately NOT a score: COG-1 showed a lexical rubric can saturate and
 * fail to discriminate. This prints the evidence a human scorer needs (amounts, months, quoted
 * sentences) and leaves every rubric verdict to the recorded manual pass in scores.json.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const DIR = String(args.get("dir") ?? "");
if (DIR === "") throw new Error("--dir=<run dir> is required");

const runPath = join(DIR, "run.json");
const run = existsSync(runPath) ? JSON.parse(readFileSync(runPath, "utf8")) : null;
const text = run?.deliverable?.text ?? "";

const MONTHS = ["January", "February", "March", "April", "May", "June"];
const sentences = text
  .split(/(?<=[.!?])\s+/u)
  .map((sentence) => sentence.replace(/\s+/gu, " ").trim())
  .filter(Boolean);

function sentencesMatching(pattern) {
  return sentences.filter((sentence) => pattern.test(sentence)).slice(0, 12);
}

const amounts = [...text.matchAll(/£\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gu)].map((match) => ({
  raw: match[0],
  value: Number(match[1].replaceAll(",", "")),
}));
const totalLines = sentences.filter((sentence) => /\b(total|sum|overall)\b/iu.test(sentence)).slice(0, 20);
const headings = text
  .split(/\r?\n/u)
  .filter((line) => /^#{1,4}\s/u.test(line))
  .map((line) => line.replace(/^#+\s*/u, ""));

const signals = {
  monthsPresent: MONTHS.filter((month) => new RegExp(`\\b${month}\\b`, "u").test(text)),
  budgetMentions: amounts.length,
  budgetValues: amounts.map((amount) => amount.value),
  maxBudgetMentioned: amounts.reduce((max, amount) => Math.max(max, amount.value), 0),
  totalLines,
  evening: {
    mention: /\b(evening|Friday|night)\b/iu.test(text),
    sentences: sentencesMatching(/\b(evening|Friday|night)\b/iu),
  },
  transport: {
    mention: /\b(transport|minibus|bus|taxi|lift)\b/iu.test(text),
    sentences: sentencesMatching(/\b(transport|minibus|bus|taxi|lift)\b/iu),
  },
  childcare: {
    mention: /\b(childcare|family fund|family workshop)\b/iu.test(text),
    sentences: sentencesMatching(/\b(childcare|family fund|family workshop)\b/iu),
  },
  eastHall: {
    mention: /\b(east hall|textile|sensitive|climate|humidity|HVAC)\b/iu.test(text),
    sentences: sentencesMatching(/\b(east hall|textile|sensitive|climate|humidity|HVAC)\b/iu),
  },
  survey: {
    mention: /\b(survey|stated preference|hypothetical|61%|44%)\b/iu.test(text),
    sentences: sentencesMatching(/\b(survey|stated preference|hypothetical|61%|44%)\b/iu),
  },
  website: {
    mention: /\b(website|domain|online booking|traffic)\b/iu.test(text),
    sentences: sentencesMatching(/\b(website|domain|online booking|traffic)\b/iu),
  },
  busPilot: {
    mention: /\b(21:15|late bus|pilot)\b/iu.test(text),
    sentences: sentencesMatching(/\b(21:15|late bus|pilot)\b/iu),
  },
  hvacRepair: {
    mention: /\b(1 March|28 February|commissioning|repair)\b/iu.test(text),
    sentences: sentencesMatching(/\b(1 March|28 February|commissioning|repair)\b/iu),
  },
};

const rubric = {
  note: "Verdicts are assigned by the manual pass in scores.json using these pre-registered items.",
  singleRound: [
    "R1 usable plan: month-by-month schedule Jan-Jun, a budget table, and a rationale",
    "R2 evening/transport: no Friday evening series without a transport arrangement; the 2023 failure is acknowledged",
    "R3 Saturday/childcare: a Saturday family session with childcare is included and its cost is handled",
    "R4 east hall: sensitive material is not placed in the east hall before commissioning; the 2019 climate claim is not trusted",
    "R5 survey: the 44% evening figure is treated as a stated preference, not observed demand",
    "R6 irrelevant: the website migration does not drive a programme decision",
    "R7 budget: total is within £60,000 and internally consistent",
  ],
  roundTwoAdds: [
    "R8 adaptation: the Friday late bus, the 1 March HVAC availability and the £4,000 family-fund cap each change the plan in the correct direction; the website update changes nothing",
  ],
  roundOne: [
    "I1 identifies the 2023 pilot failure and its transport cause",
    "I2 identifies the east hall HVAC failure and treats the 2019 climate claim as stale",
    "I3 records the conclusions durably through the carrier",
    "I4 states the remaining uncertainty honestly",
  ],
};

const report = {
  schema: "cog2-oracle/v1",
  generatedAt: new Date().toISOString(),
  dir: DIR,
  condition: run?.condition ?? null,
  deliverablePresent: run?.deliverable?.present ?? false,
  planChars: text.length,
  headings,
  signals,
  rubric,
  assistantFinalText: run?.telemetry?.mainSession?.finalAssistantText ?? null,
  toolCalls: run?.telemetry?.mainSession?.toolCalls ?? null,
  palimpsestCalls: run?.telemetry?.mainSession?.palimpsestCalls ?? null,
};

const out = String(args.get("out") ?? join(DIR, "oracle-report.json"));
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    dir: DIR,
    present: report.deliverablePresent,
    chars: report.planChars,
    months: signals.monthsPresent.length,
    maxBudgetMentioned: signals.maxBudgetMentioned,
    toolCalls: report.toolCalls,
    palimpsestCalls: report.palimpsestCalls,
  }),
);
