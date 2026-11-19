// Deterministic digital test stand. Meter registers are kWh; the steady setpoint is on the AC side.
export function collect() {
  const blocks = ["00:00", "00:30", "01:00", "01:30"];
  const nominal = [40, 80, 50, 70]; // After the authorized 20 kW load transfer.
  const observedOffset = [0, 0, 10, -10];
  let meter = 8000;
  return blocks.map((time, slot) => {
    const before = meter;
    const requestedKw = 80;
    const facilityKw = nominal[slot] + observedOffset[slot];
    meter += Math.min(requestedKw, 120 - facilityKw) * 0.5;
    return {time, minutes: 30, requestedKw, facilityKw, acMeterStartKwh: before, acMeterEndKwh: meter};
  });
}

export function replay(plan, samples, efficiency = 0.9) {
  const requested = plan.acKw;
  if (!Array.isArray(requested) || requested.length !== 4 || requested.some(x => !Number.isFinite(x) || x < 0)) {
    throw Error("acKw must contain four nonnegative numeric setpoints");
  }
  const limits = samples.map(s => (s.acMeterEndKwh - s.acMeterStartKwh) * 60 / s.minutes);
  const actual = requested.map((kw, i) => Math.min(kw, limits[i]));
  return {requested, limits, actual, departureKwh: [72 + efficiency * .5 * (actual[0] + actual[1]),
    76 + efficiency * .5 * (actual[2] + actual[3])], withinLimits: requested.every((kw, i) => kw <= limits[i])};
}
