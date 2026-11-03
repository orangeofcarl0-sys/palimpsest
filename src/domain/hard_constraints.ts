/**
 * PC1-V1 R7 — explicit mechanical checks over explicit inputs.
 *
 * These are NOT a universal truth engine. Each evaluator names the facts it needs, returns PASS /
 * FAIL / UNKNOWN, and discloses its assumptions. The caller cannot choose the status, and no
 * scenario answer is embedded: `schedule({ observationDay: 8, leadTimeDays: 21, latestDay: 28 })`
 * returns 29 and FAIL because the arithmetic says so, not because the Field Study is known.
 */
import { canonicalDigest } from "../schema/canonical.js";

export const HARD_CONSTRAINT_KINDS = [
  "schedule",
  "budget",
  "units",
  "coverage",
  "source-identity",
  "approval",
] as const;
export type HardConstraintKind = (typeof HARD_CONSTRAINT_KINDS)[number];

export type HardConstraintStatus = "PASS" | "FAIL" | "UNKNOWN";

export interface HardConstraintResult {
  readonly schema: "pc1-hard-constraint/v1";
  readonly kind: HardConstraintKind;
  readonly status: HardConstraintStatus;
  readonly facts: Readonly<Record<string, unknown>>;
  readonly assumptions: readonly string[];
  readonly detail: string;
  readonly digest: string;
}

export class HardConstraintInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HardConstraintInputError";
  }
}

function integer(value: unknown, name: string, minimum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw new HardConstraintInputError(`${name} must be an integer >= ${minimum}`);
  }
  return value;
}

function number(value: unknown, name: string, minimum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new HardConstraintInputError(`${name} must be a finite number >= ${minimum}`);
  }
  return value;
}

function text(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HardConstraintInputError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

/**
 * Canonical JSON forbids floats. A computed decimal is therefore reported as a normalized decimal
 * STRING (the digest is still exact), while an integer stays a number. This keeps the result
 * hashable without rounding a business fact to an integer.
 */
function canonicalFact(value: unknown): unknown {
  if (typeof value === "number") {
    if (Number.isInteger(value)) return value;
    return Number(value.toFixed(12)).toString();
  }
  if (Array.isArray(value)) return value.map(canonicalFact);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, canonicalFact(entry)]));
  }
  return value;
}

function result(
  kind: HardConstraintKind,
  status: HardConstraintStatus,
  facts: Record<string, unknown>,
  assumptions: readonly string[],
  detail: string,
): HardConstraintResult {
  const canonicalFacts = canonicalFact(facts) as Readonly<Record<string, unknown>>;
  const content = {
    schema: "pc1-hard-constraint/v1" as const,
    kind,
    status,
    facts: canonicalFacts,
    assumptions: [...assumptions],
    detail,
  };
  return Object.freeze({ ...content, digest: canonicalDigest(content) });
}

function schedule(parameters: Readonly<Record<string, unknown>>): HardConstraintResult {
  const observationDay = integer(parameters.observationDay, "observationDay", 1);
  const leadTimeDays = integer(parameters.leadTimeDays, "leadTimeDays", 0);
  const latestDay = integer(parameters.latestDay, "latestDay", 1);
  const approvalDay = parameters.approvalDay === undefined ? observationDay : integer(parameters.approvalDay, "approvalDay", 1);
  if (approvalDay < observationDay) {
    throw new HardConstraintInputError("approvalDay cannot be earlier than observationDay");
  }
  const completionDay = approvalDay + leadTimeDays;
  const meetsLatest = completionDay <= latestDay;
  return result(
    "schedule",
    meetsLatest ? "PASS" : "FAIL",
    { observationDay, approvalDay, leadTimeDays, completionDay, latestDay, meetsLatest },
    [
      "days are counted as calendar days from the stated observation/approval day",
      "the lead time includes every remaining work and delivery step; no working-day conversion",
      "the latest allowed day is inclusive",
    ],
    meetsLatest
      ? `completion on day ${completionDay} is within the latest allowed day ${latestDay}`
      : `completion on day ${completionDay} is after the latest allowed day ${latestDay}`,
  );
}

function budget(parameters: Readonly<Record<string, unknown>>): HardConstraintResult {
  const rawItems = parameters.lineItems;
  if (!Array.isArray(rawItems)) throw new HardConstraintInputError("lineItems must be an array");
  const items = rawItems.map((entry, index) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new HardConstraintInputError(`lineItems[${index}] must be an object`);
    }
    const item = entry as Record<string, unknown>;
    return {
      label: text(item.label, `lineItems[${index}].label`),
      amount: number(item.amount, `lineItems[${index}].amount`, 0),
    };
  });
  const fixedCosts = parameters.fixedCosts === undefined ? 0 : number(parameters.fixedCosts, "fixedCosts", 0);
  const cap = number(parameters.cap, "cap", 0);
  const lineTotal = items.reduce((sum, item) => sum + item.amount, 0);
  const total = lineTotal + fixedCosts;
  const meetsCap = total <= cap;
  return result(
    "budget",
    meetsCap ? "PASS" : "FAIL",
    { lineItems: items, lineTotal, fixedCosts, total, cap, meetsCap },
    [
      "amounts are in one stated currency/unit; no exchange or tax conversion is performed",
      "fixed costs are added once, not per item",
      "the cap is inclusive",
    ],
    meetsCap ? `total ${total} is within the cap ${cap}` : `total ${total} exceeds the cap ${cap}`,
  );
}

const UNIT_FACTORS: Readonly<Record<string, number>> = {
  "mg/m3": 1000,
  "ug/m3": 1,
  "µg/m3": 1,
  "μg/m3": 1,
  "mg/m³": 1000,
  "ug/m³": 1,
  "µg/m³": 1,
  "μg/m³": 1,
};

function units(parameters: Readonly<Record<string, unknown>>): HardConstraintResult {
  const value = number(parameters.value, "value", 0);
  const from = text(parameters.from, "from").toLowerCase();
  const to = text(parameters.to, "to").toLowerCase();
  const fromFactor = UNIT_FACTORS[from];
  const toFactor = UNIT_FACTORS[to];
  if (fromFactor === undefined || toFactor === undefined) {
    return result(
      "units",
      "UNKNOWN",
      { value, from, to, converted: null },
      ["only explicitly registered unit conversions are performed"],
      `no registered conversion between ${from} and ${to}`,
    );
  }
  const converted = Number(((value * fromFactor) / toFactor).toFixed(12));
  return result(
    "units",
    "PASS",
    { value, from, to, converted },
    ["conversion is exact for the registered mass-per-volume units"],
    `${value} ${from} = ${converted} ${to}`,
  );
}

function coverage(parameters: Readonly<Record<string, unknown>>): HardConstraintResult {
  const days = integer(parameters.days, "days", 1);
  const overlapDays = integer(parameters.overlapDays, "overlapDays", 0);
  const requiredOverlapDays = integer(parameters.requiredOverlapDays, "requiredOverlapDays", 0);
  const requiredValidRatio = number(parameters.requiredValidRatio, "requiredValidRatio", 0);
  if (requiredValidRatio > 1) throw new HardConstraintInputError("requiredValidRatio cannot exceed 1");
  const rawSites = parameters.sites;
  if (!Array.isArray(rawSites) || rawSites.length === 0) throw new HardConstraintInputError("sites must be a non-empty array");
  const sites = rawSites.map((entry, index) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new HardConstraintInputError(`sites[${index}] must be an object`);
    }
    const site = entry as Record<string, unknown>;
    const id = text(site.id, `sites[${index}].id`);
    const validDays = integer(site.validDays, `sites[${index}].validDays`, 0);
    if (validDays > days) throw new HardConstraintInputError(`sites[${index}].validDays cannot exceed days`);
    const ratio = validDays / days;
    return { id, validDays, ratio, meetsRatio: ratio >= requiredValidRatio };
  });
  const sitesMeet = sites.every((site) => site.meetsRatio);
  const overlapMeets = overlapDays >= requiredOverlapDays;
  const status = sitesMeet && overlapMeets ? "PASS" : "FAIL";
  return result(
    "coverage",
    status,
    { days, overlapDays, requiredOverlapDays, requiredValidRatio, sites, sitesMeet, overlapMeets },
    ["valid days are counted inside the stated observation window", "the required ratio is inclusive"],
    status === "PASS"
      ? "every site meets the valid-day ratio and the overlap requirement"
      : `coverage is short: ${sites.filter((site) => !site.meetsRatio).map((site) => site.id).join(", ") || "overlap"}${overlapMeets ? "" : " and/or overlap"}`,
  );
}

function sourceIdentity(parameters: Readonly<Record<string, unknown>>): HardConstraintResult {
  const expected = text(parameters.expectedSha256, "expectedSha256").toLowerCase();
  const actual = text(parameters.actualSha256, "actualSha256").toLowerCase();
  const hex = /^[0-9a-f]{64}$/u;
  if (!hex.test(expected) || !hex.test(actual)) {
    throw new HardConstraintInputError("expectedSha256 and actualSha256 must be 64 hexadecimal characters");
  }
  const matches = expected === actual;
  return result(
    "source-identity",
    matches ? "PASS" : "FAIL",
    { expectedSha256: expected, actualSha256: actual, matches },
    ["the comparison is over the exact bytes the caller supplied; it does not establish that the source is authoritative"],
    matches ? "the actual bytes match the expected SHA-256" : "the actual bytes do not match the expected SHA-256",
  );
}

function approval(parameters: Readonly<Record<string, unknown>>): HardConstraintResult {
  if (typeof parameters.required !== "boolean") throw new HardConstraintInputError("required must be a boolean");
  if (typeof parameters.approved !== "boolean") throw new HardConstraintInputError("approved must be a boolean");
  const authority = parameters.authority === undefined ? null : text(parameters.authority, "authority");
  const satisfied = !parameters.required || parameters.approved;
  return result(
    "approval",
    satisfied ? "PASS" : "FAIL",
    { required: parameters.required, approved: parameters.approved, authority, satisfied },
    ["approval is a reported fact; this check does not authenticate the approver"],
    satisfied ? "the stated approval requirement is satisfied" : "the stated approval requirement is not satisfied",
  );
}

export function evaluateHardConstraint(input: {
  readonly kind: HardConstraintKind;
  readonly parameters: Readonly<Record<string, unknown>>;
}): HardConstraintResult {
  switch (input.kind) {
    case "schedule":
      return schedule(input.parameters);
    case "budget":
      return budget(input.parameters);
    case "units":
      return units(input.parameters);
    case "coverage":
      return coverage(input.parameters);
    case "source-identity":
      return sourceIdentity(input.parameters);
    case "approval":
      return approval(input.parameters);
    default:
      throw new HardConstraintInputError(`unknown hard-constraint kind "${String(input.kind)}"`);
  }
}
