import {isDeepStrictEqual as equal} from "node:util";

export function checkBrief(evidence) {
  const {asOf, lines, excluded} = evidence;
  const opening = evidence.opening ?? {};
  const terminalLeg = evidence.terminalLeg ?? {};
  const apm = evidence.apm ?? {};
  function sourced(ids, permitted, required) {
    return Array.isArray(ids) && ids.includes(required) && ids.every(id => permitted.includes(id));
  }
  return {
    cutoff: asOf === "2025-07-02",
    opening: opening.date === "2025-06-06" && opening.time === "17:00" &&
      sourced(opening.sources, ["service-june13", "metro-june06"], "service-june13"),
    lines: Array.isArray(lines) && equal([...lines].sort(), ["C", "K"]),
    terminal: terminalLeg.mode === "shuttle" && terminalLeg.fareUsd === 0 &&
      sourced(terminalLeg.sources, ["airport-july02", "metro-june06"], "airport-july02"),
    future: apm.status === "planned" && Array.isArray(apm.sources) && apm.sources.length > 0 &&
      apm.sources.every(id => ["airport-july02", "metro-june06"].includes(id)),
    exclusion: Array.isArray(excluded) && excluded.length > 0 && excluded.every(row =>
      ["riders-sept12", "city-june05"].includes(row?.id) &&
      typeof row.reason === "string" && row.reason.trim().length > 0),
  };
}

const row = (tripId, serviceDate, timestamp) => ({tripId, serviceDate, departure: timestamp + ".000Z"});

// Different researchers may find different primary sources. Source independence and
// whether a page actually supports a sentence remain editorial decisions.
export function checkDiscovery(evidence) {
  const sources = Array.isArray(evidence.sources) ? evidence.sources : [];
  const index = new Map(sources.map(s => [s?.id, s]));
  const nonempty = s => typeof s === "string" && !!s.trim();
  const date = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s)) && new Date(s).toISOString().startsWith(s + "T");
  return {
    cutoff: evidence.asOf === "2025-07-02",
    search: Array.isArray(evidence.queries) && evidence.queries.length > 0 && evidence.queries.every(nonempty),
    register: sources.length > 0 && index.size === sources.length && sources.every(s => s &&
      [s.id, s.issuer, s.title].every(nonempty) && URL.canParse(s.url) && ["http:", "https:"].includes(new URL(s.url).protocol) &&
      date(s.published) && date(s.accessed) && s.accessed >= s.published),
    claimReferences: Array.isArray(evidence.claims) && evidence.claims.length > 0 && evidence.claims.every(c =>
      nonempty(c?.claim) && Array.isArray(c.sources) && c.sources.length > 0 && c.sources.every(id => {
        const s = index.get(id);
        return s && date(s.published) && s.published <= evidence.asOf;
      })),
    exclusions: Array.isArray(evidence.excluded) && evidence.excluded.length > 0 &&
      evidence.excluded.every(e => index.has(e?.id) && nonempty(e?.reason)),
  };
}

export function boardCases(feed) {
  const fri = "2025-07-04";
  const sat = "2025-07-05";
  const late = row("R7", fri, sat + "T00:12:00");
  const extra = row("X3", sat, sat + "T00:19:00");
  const tests = [
    ["complaint", "River", sat + "T00:00:00Z", 30, [late, extra]],
    ["left included, right excluded", "River", sat + "T00:12:00Z", 7, [late]],
    ["query crosses midnight", "River", fri + "T23:59:00Z", 25, [late, extra]],
    ["daytime", "River", fri + "T12:00:00Z", 5, [row("D1", fri, fri + "T12:02:00")]],
    ["other stop", "East", sat + "T00:00:00Z", 15, [row("E2", fri, sat + "T00:10:00")]],
    ["no stop", "Airport", sat + "T00:00:00Z", 30, []],
  ].map(([name, stop, start, minutes, expected]) => ({name, args: [feed, stop, start, minutes], expected}));
  const date = "2025-12-31";
  const next = "2026-01-01";
  const rollover = {calendar: {pre: [date], new: [next]}, exceptions: [], trips: [
    {service: "pre", stop: "Bay", clock: "47:59:59", tripId: "z"},
    {service: "new", stop: "Bay", clock: "23:59:59", tripId: "A"},
    {service: "pre", stop: "Bay", clock: "47:59:59", tripId: "a"},
  ]};
  tests.push({name: "47-hour clock, year boundary and ASCII ties", args: [rollover, "Bay", next + "T23:59:00Z", 1],
    expected: [row("A", next, next + "T23:59:59"), row("a", date, next + "T23:59:59"), row("z", date, next + "T23:59:59")]});
  return tests;
}

export function chargeCases(night) {
  return [
    {name: "rated", args: [night, night.efficiency], shift: 20, normal: true, cold: false},
    {name: "lower efficiency", args: [night, night.lowerEfficiency], shift: null, normal: false, cold: false},
    {name: "higher efficiency", args: [night, 0.95], shift: 54 / (0.5 * 0.95) - 100, normal: true, cold: false},
    {name: "transfer capped", args: [{...night, maxShiftKw: 15}, 0.9], shift: null, normal: true, cold: false},
    {name: "no cold increment", args: [{...night, coldExtraKw: [0, 0, 0, 0]}, 0.9], shift: 0, normal: true, cold: true},
    {name: "binding charger", args: [{...night, chargerKw: 60}, 0.9], shift: null, normal: false, cold: false},
  ];
}

export function checkCharge(test, result) {
  if (!result || typeof result !== "object") return false;
  const [night, efficiency] = test.args;
  const tolerance = 1e-6;
  function physical(scene, load, feasible) {
    if (!scene || scene.feasible !== feasible || !Array.isArray(scene.acKw) || scene.acKw.length !== load.length) return false;
    const limits = load.map(kw => Math.min(night.chargerKw, night.siteLimitKw - kw));
    if (!scene.acKw.every((kw, i) => Number.isFinite(kw) && kw >= -tolerance && kw <= limits[i] + tolerance)) return false;
    return night.buses.every(bus => {
      const sumWindow = powers => powers.slice(bus.fromSlot, bus.untilSlot).reduce((a, b) => a + b, 0);
      const battery = bus.startKwh + sumWindow(scene.acKw) * efficiency * night.slotHours;
      const available = bus.startKwh + sumWindow(limits) * efficiency * night.slotHours;
      return battery >= Math.min(bus.requiredKwh, available, bus.capacityKwh) - tolerance && battery <= bus.capacityKwh + tolerance;
    });
  }
  const cold = night.buildingKw.map((kw, i) => kw + night.coldExtraKw[i]);
  if (!physical(result.normal, night.buildingKw, test.normal) || !physical(result.cold, cold, test.cold)) return false;
  if (test.shift === null) return result.minShiftKw === null && result.shifted === null;
  if (!Number.isFinite(result.minShiftKw) || Math.abs(result.minShiftKw - test.shift) > tolerance) return false;
  cold[night.shiftFromSlot] -= result.minShiftKw;
  cold[night.shiftToSlot] += result.minShiftKw;
  return physical(result.shifted, cold, true);
}
