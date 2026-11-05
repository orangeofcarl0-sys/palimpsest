/**
 * The independent consistency check for the deployment package.
 *
 * It does NOT look for strings it was told to expect. It re-derives the selection from the accepted
 * sources plus the current field survey, then verifies every deliverable that exists against that
 * derivation AND against the other deliverables:
 *
 *   - the deciding constraint and the selected model per site;
 *   - certificate standing (an expected certificate is not a current one);
 *   - quote validity (an expired quote may not be costed);
 *   - the cost arithmetic, recomputed from the price list;
 *   - the schedule arithmetic, recomputed from the lead times;
 *   - the recommendation, against the cost total and the corridor actually in force.
 *
 * `node check.mjs` checks the deliverables that exist, so a task can run it as its own gate.
 * `node check.mjs --final` additionally requires the complete package and is what the operator runs
 * on the accepted head.
 *
 * Exit 0 only when every assertion holds.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const FINAL = process.argv.includes("--final");
const failures = [];
let assertions = 0;

const fail = (message) => failures.push(message);
const expect = (condition, message) => {
  assertions += 1;
  if (!condition) fail(message);
};

const read = (path) => readFileSync(join(ROOT, path), "utf8");
const norm = (text) => text.replace(/\u2212/gu, "-");

// ── sources ──────────────────────────────────────────────────────────────────────────────────────

const sitesText = norm(read("sources/sites.md"));
const sections = sitesText.split(/^## /mu).slice(1);
const sectionOf = (id) => {
  const section = sections.find((entry) => entry.startsWith(id));
  if (section === undefined) throw new Error(`sources/sites.md has no section ${id}`);
  return section;
};
const numberAfter = (text, label) => {
  const match = new RegExp(`${label}[^*]*\\*\\*(-?[\\d,]+)`, "u").exec(text);
  return match === null ? null : Number(match[1].replace(/,/gu, ""));
};
const required = {
  NR: numberAfter(sectionOf("North Ridge"), "Required capacity:"),
  HF: numberAfter(sectionOf("Harbor Flats"), "Required capacity:"),
};
const designMin = numberAfter(sectionOf("North Ridge"), "Design minimum");
const drawingCorridor = numberAfter(sectionOf("Harbor Flats"), "corridor width:");

const vendorRows = read("sources/vendors.md")
  .split("\n")
  .filter((line) => line.startsWith("|") && !line.startsWith("| vendor") && !line.startsWith("|---"))
  .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
  .map(([vendor, model, width, minTemp, certificate, validTo]) => ({
    vendor,
    model,
    width: Number(width.replace(/,/gu, "")),
    minTemp: Number(norm(minTemp)),
    current: /current/iu.test(certificate) && !/expected/iu.test(certificate),
    validTo,
  }));
expect(vendorRows.length === 3, `vendors.md lists ${String(vendorRows.length)} vendor rows, expected 3`);

const csv = (path) =>
  read(path)
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => line.split(","));
const quotes = new Map(csv("sources/quotes.csv").map(([model, unit, freight, validUntil]) => [model, { unit: Number(unit), freight: Number(freight), validUntil }]));
const capacity = new Map(csv("sources/capacity.csv").map(([model, siteId, kw]) => [`${model}:${siteId}`, Number(kw)]));
const leads = new Map(csv("sources/leads.csv").map(([model, weeks]) => [model, Number(weeks)]));

/** The corridor actually in force: a field survey supersedes the drawing it names. */
const surveyDir = join(ROOT, "updates");
const surveys = existsSync(surveyDir)
  ? readdirSync(surveyDir, { recursive: true })
      .map((entry) => String(entry).replace(/\\/gu, "/"))
      .filter((entry) => entry.endsWith("corridor-survey.md"))
      .sort()
  : [];
const survey = surveys.length === 0 ? null : read(join("updates", surveys[surveys.length - 1]));
const surveyCorridor = survey === null ? null : Number(/measured corridor width:\s*(\d+)\s*mm/iu.exec(norm(survey))?.[1] ?? NaN);
const corridor = surveyCorridor ?? drawingCorridor;
expect(Number.isFinite(corridor), "the corridor in force could not be read");

const TODAY = "2026-11-05";
const quoteUsable = (model) => {
  const quote = quotes.get(model);
  return quote !== undefined && quote.validUntil >= TODAY;
};

const eligibleFor = (siteId) =>
  vendorRows.filter((vendor) => {
    if (!vendor.current || !quoteUsable(vendor.model)) return false;
    if ((capacity.get(`${vendor.model}:${siteId}`) ?? 0) < (required[siteId] ?? Infinity)) return false;
    if (siteId === "NR") return vendor.minTemp <= designMin;
    return vendor.width <= corridor;
  });

const cheapest = (siteId) =>
  eligibleFor(siteId).sort((left, right) => {
    const a = quotes.get(left.model);
    const b = quotes.get(right.model);
    return a.unit + a.freight - (b.unit + b.freight);
  })[0];

const expected = { NR: cheapest("NR"), HF: cheapest("HF") };
expect(expected.NR !== undefined, "no vendor qualifies for North Ridge under the sources");
expect(expected.HF !== undefined, `no vendor fits the Harbor Flats corridor (${String(corridor)} mm) with a current certificate`);

// ── deliverables (each checked when present) ────────────────────────────────────────────────────

const DELIVERABLES = [
  "deliverables/technical-capacity.md",
  "deliverables/vendor-compliance.md",
  "deliverables/cost-model.json",
  "deliverables/schedule.md",
  "deliverables/risk-review.md",
  "deliverables/recommendation.md",
];

function data(path) {
  if (!existsSync(join(ROOT, path))) return null;
  if (path.endsWith(".json")) {
    try {
      return JSON.parse(read(path));
    } catch (error) {
      fail(path + " is not valid JSON: " + (error instanceof Error ? error.message : String(error)));
      return null;
    }
  }
  const match = /<!-- data:start -->\s*```json\s*([\s\S]*?)```\s*<!-- data:end -->/u.exec(read(path));
  if (match === null) {
    fail(`${path} has no data block`);
    return null;
  }
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    fail(`${path} has an unparseable data block: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

const technical = data("deliverables/technical-capacity.md");
const compliance = data("deliverables/vendor-compliance.md");
const costFile = data("deliverables/cost-model.json");
const schedule = data("deliverables/schedule.md");
const risk = data("deliverables/risk-review.md");
const recommendation = data("deliverables/recommendation.md");

if (technical !== null) {
  for (const [siteId, choice] of Object.entries(expected)) {
    const stated = technical.sites?.find((entry) => entry.site === siteId)?.model;
    expect(stated === choice.model, `technical-capacity: ${siteId} selects ${String(stated)}, the sources require ${String(choice.model)}`);
  }
}

if (compliance !== null) {
  for (const vendor of vendorRows) {
    const stated = compliance.vendors?.find((entry) => entry.model === vendor.model);
    const expectedStanding = vendor.current ? "CURRENT" : "EXPECTED_NOT_CURRENT";
    expect(stated !== undefined, `vendor-compliance: ${vendor.model} is missing`);
    if (stated !== undefined) {
      expect(stated.certificate === expectedStanding, `vendor-compliance: ${vendor.model} is ${stated.certificate}, the source says ${expectedStanding}`);
    }
  }
}

let total = 0;
if (costFile !== null) {
  expect(Array.isArray(costFile.lines) && costFile.lines.length === 2, "cost-model: expected one line per site");
  for (const line of costFile.lines ?? []) {
    const quote = quotes.get(line.model);
    expect(quote !== undefined, `cost-model: no quote for ${line.model}`);
    if (quote === undefined) continue;
    expect(quoteUsable(line.model), `cost-model: ${line.model} uses a quote that expired ${quote.validUntil}`);
    const lineTotal = quote.unit + quote.freight;
    expect(line.unitPrice === quote.unit && line.freight === quote.freight, `cost-model: ${line.model} prices differ from quotes.csv`);
    expect(line.lineTotal === lineTotal, `cost-model: ${line.model} line total is ${String(line.lineTotal)}, the arithmetic gives ${String(lineTotal)}`);
    total += lineTotal;
    const choice = expected[line.site];
    expect(choice !== undefined && line.model === choice.model, `cost-model: ${line.site} costs ${line.model}, the selection is ${String(choice?.model)}`);
  }
  expect(costFile.total === total, `cost-model: total is ${String(costFile.total)}, the lines sum to ${String(total)}`);
}

if (schedule !== null) {
  const start = new Date(`${schedule.start}T00:00:00Z`);
  const bySite = Object.fromEntries((schedule.installs ?? []).map((entry) => [entry.site, entry]));
  for (const [siteId, choice] of Object.entries(expected)) {
    const entry = bySite[siteId];
    expect(entry !== undefined, `schedule: ${siteId} is missing`);
    if (entry === undefined) continue;
    expect(entry.model === choice.model, `schedule: ${siteId} schedules ${entry.model}, the selection is ${choice.model}`);
    const lead = leads.get(entry.model);
    expect(entry.leadWeeks === lead, `schedule: ${entry.model} lead is ${String(entry.leadWeeks)} weeks, the source says ${String(lead)}`);
    const install = new Date(start.getTime() + lead * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(entry.installStart === install, `schedule: ${siteId} install starts ${String(entry.installStart)}, the lead time gives ${install}`);
    expect(entry.commission >= install, `schedule: ${siteId} commissions before it is installed`);
  }
}

if (risk !== null) {
  if (survey !== null) {
    expect(
      (risk.risks ?? []).some((entry) => String(entry.source).includes("corridor-survey.md")),
      "risk-review: the field survey is in force but no risk names it",
    );
  }
  expect(
    (risk.risks ?? []).some((entry) => /halcyon/iu.test(`${entry.statement} ${entry.source}`)),
    "risk-review: Halcyon's expected certificate is not recorded as a risk",
  );
}

if (recommendation !== null) {
  expect(recommendation.north === expected.NR?.model, `recommendation: north is ${String(recommendation.north)}, the selection is ${String(expected.NR?.model)}`);
  expect(recommendation.harbor === expected.HF?.model, `recommendation: harbor is ${String(recommendation.harbor)}, the selection is ${String(expected.HF?.model)}`);
  expect(recommendation.totalUsd === total, `recommendation: total is ${String(recommendation.totalUsd)}, cost-model says ${String(total)}`);
  expect(recommendation.corridorMm === corridor, `recommendation: corridor is ${String(recommendation.corridorMm)} mm, the value in force is ${String(corridor)} mm`);
}

if (FINAL) {
  for (const path of DELIVERABLES) expect(existsSync(join(ROOT, path)), `final: ${path} is missing`);
}

// ── result ──────────────────────────────────────────────────────────────────────────────────────

if (failures.length > 0) {
  console.error(`check: FAIL (${String(failures.length)} of ${String(assertions)} assertions)`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log(
  `check: PASS${FINAL ? " (final)" : ""} (${String(assertions)} assertions; corridor ${String(corridor)} mm; ` +
    `selection NR=${String(expected.NR?.model)} HF=${String(expected.HF?.model)}; total ${String(total)} USD)`,
);
