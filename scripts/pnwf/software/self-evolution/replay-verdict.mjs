import { digest } from "../../energy/contract.mjs";

export function expectedReplay(condition, candidate = true) {
  if (condition === "clean") return { delivered: candidate, records: Number(candidate) };
  if (condition === "already-recorded") return { delivered: true, records: 1, requests: 4, offers: 0 };
  if (condition === "dirty" || condition === "blocked") return { delivered: false, records: 0, requests: 3, offers: 0 };
  throw new Error("UNKNOWN_REPLAY_CONDITION: " + condition);
}

export function replayFailures(observation, candidate = true) {
  const expected = expectedReplay(observation.condition, candidate);
  const failures = [];
  if (observation.delivered !== expected.delivered) failures.push(expected.delivered ? "BOUND_DELIVERY_MISSING" : "UNEXPECTED_BOUND_DELIVERY");
  if (observation.recorded.length < expected.records) failures.push("PRINCIPAL_DELIVERY_MISSING");
  if (observation.recorded.length > expected.records) failures.push("EXTRA_PRINCIPAL_DELIVERY");
  if (expected.requests !== undefined && observation.requests !== expected.requests) failures.push("REQUEST_COUNT_MISMATCH");
  if (expected.offers !== undefined && observation.offers !== expected.offers) failures.push("UNEXPECTED_CLOSEOUT_OFFER");
  return failures;
}

export function failureKey(receipts) {
  return digest(JSON.stringify(receipts.map(({ arm, condition, failures }) => [arm, condition, ...failures]).sort()));
}

export function receiptFolder({ arm, condition = "clean" }) {
  return arm.toLowerCase() + (condition === "clean" ? "" : "-" + condition);
}
