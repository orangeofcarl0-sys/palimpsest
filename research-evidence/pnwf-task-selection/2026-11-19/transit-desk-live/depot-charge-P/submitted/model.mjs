const EPS = 1e-9;

const round = (value, digits = 9) => {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
};

const sum = (values) => values.reduce((total, value) => total + value, 0);

function chargingCaps(night, buildingKw) {
  const siteLimitKw = Number(night.siteLimitKw);
  const chargerKw = Number(night.chargerKw);

  return buildingKw.map((load) =>
    Math.max(0, Math.min(chargerKw, siteLimitKw - load)),
  );
}

function shiftedBuilding(buildingKw, fromSlot, toSlot, shiftKw) {
  const shifted = buildingKw.slice();
  shifted[fromSlot] -= shiftKw;
  shifted[toSlot] += shiftKw;
  return shifted;
}

/**
 * Greedy within each departure window: use the earliest available AC energy
 * first and take only the remainder in later slots. This is physically valid,
 * easy to execute, and leaves later capacity untouched whenever possible.
 */
function dispatch(night, caps, efficiency, slotHours) {
  const acKw = Array(caps.length).fill(0);
  const acEnergyLeft = caps.map((cap) => Math.max(0, cap) * slotHours);
  let feasible = true;

  for (const bus of night.buses) {
    const fromSlot = Math.max(0, Number(bus.fromSlot));
    const untilSlot = Math.min(caps.length, Number(bus.untilSlot));
    const startKwh = Number(bus.startKwh);
    const requiredKwh = Number(bus.requiredKwh);
    const capacityKwh = Number(bus.capacityKwh);

    const neededBatteryKwh = Math.max(0, requiredKwh - startKwh);
    const batteryHeadroomKwh = Math.max(0, capacityKwh - startKwh);
    const amountToDeliverBatteryKwh = Math.min(
      neededBatteryKwh,
      batteryHeadroomKwh,
    );

    let acEnergyToDeliver = amountToDeliverBatteryKwh / efficiency;
    let deliveredAcEnergyKwh = 0;

    for (let slot = fromSlot; slot < untilSlot && acEnergyToDeliver > EPS; slot += 1) {
      const takeKwh = Math.min(acEnergyLeft[slot], acEnergyToDeliver);
      acKw[slot] += takeKwh / slotHours;
      acEnergyLeft[slot] -= takeKwh;
      acEnergyToDeliver -= takeKwh;
      deliveredAcEnergyKwh += takeKwh;
    }

    const deliveredBatteryKwh = deliveredAcEnergyKwh * efficiency;
    if (
      requiredKwh > capacityKwh + EPS ||
      deliveredBatteryKwh + EPS < neededBatteryKwh
    ) {
      feasible = false;
    }
  }

  return {
    acKw: acKw.map((value) => round(Math.max(0, value))),
    feasible,
  };
}

function busWindow(bus, slotCount) {
  const from = Math.max(0, Math.trunc(Number(bus.fromSlot)));
  const until = Math.min(slotCount, Math.trunc(Number(bus.untilSlot)));
  const slots = [];
  for (let slot = from; slot < until; slot += 1) slots.push(slot);
  return slots;
}

/**
 * The only decision variable is the deferred building load s. On an interval
 * between charger/site saturation breakpoints each charging cap is linear in
 * s, so each bus's available AC energy is linear too. Intersect those linear
 * inequalities to find the exact smallest feasible s.
 */
function minimumShift(night, coldBuildingKw, efficiency, slotHours) {
  const fromSlot = Number(night.shiftFromSlot);
  const toSlot = Number(night.shiftToSlot);
  const slotCount = coldBuildingKw.length;
  const maxShiftKw = Math.max(0, Number(night.maxShiftKw ?? 0));

  if (
    !Number.isInteger(fromSlot) ||
    !Number.isInteger(toSlot) ||
    fromSlot < 0 ||
    fromSlot >= slotCount ||
    toSlot < 0 ||
    toSlot >= slotCount
  ) {
    return null;
  }

  for (const bus of night.buses) {
    const requiredKwh = Number(bus.requiredKwh);
    const capacityKwh = Number(bus.capacityKwh);
    if (requiredKwh > capacityKwh + EPS) return null;
  }

  if (fromSlot === toSlot) {
    const caps = chargingCaps(night, coldBuildingKw);
    return dispatch(night, caps, efficiency, slotHours).feasible ? 0 : null;
  }

  const maxS = Math.max(
    0,
    Math.min(maxShiftKw, Number(coldBuildingKw[fromSlot])),
  );

  const capsAt = (shiftKw) => {
    const building = shiftedBuilding(
      coldBuildingKw,
      fromSlot,
      toSlot,
      shiftKw,
    );
    return chargingCaps(night, building);
  };

  const satisfiesAt = (shiftKw) =>
    dispatch(night, capsAt(shiftKw), efficiency, slotHours).feasible;

  if (maxS <= EPS) return satisfiesAt(0) ? 0 : null;

  const siteLimitKw = Number(night.siteLimitKw);
  const chargerKw = Number(night.chargerKw);
  const breakpoints = [0, maxS];
  const addBreakpoint = (value) => {
    if (Number.isFinite(value) && value > EPS && value < maxS - EPS) {
      breakpoints.push(value);
    }
  };

  const fromHeadroom = siteLimitKw - coldBuildingKw[fromSlot];
  const toHeadroom = siteLimitKw - coldBuildingKw[toSlot];

  // Kinks of min(chargerKw, siteLimit - load) at the source and target.
  addBreakpoint(-fromHeadroom);
  addBreakpoint(chargerKw - fromHeadroom);
  addBreakpoint(toHeadroom - chargerKw);
  addBreakpoint(toHeadroom);

  const ordered = [...new Set(breakpoints.map((value) => round(value, 12)))]
    .sort((a, b) => a - b);

  for (const slot of ordered) {
    if (satisfiesAt(slot)) return slot;
  }

  for (let index = 0; index < ordered.length - 1; index += 1) {
    const left = ordered[index];
    const right = ordered[index + 1];
    if (right - left <= EPS) continue;

    const capsLeft = capsAt(left);
    const capsRight = capsAt(right);
    const sourceSlope =
      (capsRight[fromSlot] - capsLeft[fromSlot]) / (right - left);
    const targetSlope =
      (capsRight[toSlot] - capsLeft[toSlot]) / (right - left);

    let lower = left;
    let upper = right;
    let possible = true;

    for (const bus of night.buses) {
      const window = busWindow(bus, slotCount);
      const includesFrom = window.includes(fromSlot);
      const includesTo = window.includes(toSlot);
      const slope =
        slotHours *
        ((includesFrom ? sourceSlope : 0) + (includesTo ? targetSlope : 0));
      const availableAtLeft =
        slotHours * sum(window.map((slot) => capsLeft[slot]));
      const intercept = availableAtLeft - slope * left;
      const neededBatteryKwh = Math.max(
        0,
        Number(bus.requiredKwh) - Number(bus.startKwh),
      );
      const neededAcKwh = neededBatteryKwh / efficiency;

      if (Math.abs(slope) <= EPS) {
        if (intercept + EPS < neededAcKwh) {
          possible = false;
          break;
        }
      } else if (slope > 0) {
        lower = Math.max(lower, (neededAcKwh - intercept) / slope);
      } else {
        upper = Math.min(upper, (neededAcKwh - intercept) / slope);
      }
    }

    if (!possible) continue;
    const candidate = Math.max(left, lower);
    if (candidate <= upper + EPS && candidate <= right + EPS) {
      if (satisfiesAt(candidate)) return round(candidate, 9);
      if (satisfiesAt(right)) return round(right, 9);
    }
  }

  return null;
}

export function plan(night, efficiency = night.efficiency) {
  const eta = Number(efficiency);
  const slotHours = Number(night.slotHours);

  if (!(eta > 0 && eta <= 1)) {
    throw new RangeError("efficiency must be in (0, 1]");
  }
  if (!(slotHours > 0)) {
    throw new RangeError("slotHours must be positive");
  }

  const normalBuildingKw = night.buildingKw.map(Number);
  const coldBuildingKw = normalBuildingKw.map(
    (load, slot) => load + Number(night.coldExtraKw?.[slot] ?? 0),
  );

  const normalCaps = chargingCaps(night, normalBuildingKw);
  const coldCaps = chargingCaps(night, coldBuildingKw);

  const normal = dispatch(night, normalCaps, eta, slotHours);
  const cold = dispatch(night, coldCaps, eta, slotHours);

  const minShiftKw = minimumShift(
    night,
    coldBuildingKw,
    eta,
    slotHours,
  );

  let shifted = null;
  if (minShiftKw !== null) {
    const shiftedCaps = chargingCaps(
      night,
      shiftedBuilding(
        coldBuildingKw,
        Number(night.shiftFromSlot),
        Number(night.shiftToSlot),
        minShiftKw,
      ),
    );
    const candidate = dispatch(night, shiftedCaps, eta, slotHours);
    shifted = candidate.feasible ? candidate : null;
  }

  return {
    normal,
    cold,
    shifted,
    minShiftKw: shifted === null ? null : minShiftKw,
  };
}
