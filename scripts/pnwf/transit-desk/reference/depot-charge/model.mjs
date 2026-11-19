function dispatch(night, load, efficiency) {
  const acKw = load.map(() => 0);
  const energyPerKw = night.slotHours * efficiency;
  let feasible = true;
  for (const bus of night.buses) {
    let energy = bus.startKwh;
    for (let slot = bus.fromSlot; slot < bus.untilSlot; slot++) {
      const headroom = Math.max(0, Math.min(night.chargerKw, night.siteLimitKw - load[slot]));
      const target = Math.min(bus.requiredKwh, bus.capacityKwh);
      acKw[slot] = Math.min(headroom, Math.max(0, target - energy) / energyPerKw);
      energy += acKw[slot] * energyPerKw;
    }
    if (energy + 1e-8 < bus.requiredKwh) feasible = false;
  }
  return {acKw, feasible};
}

export function plan(night, efficiency) {
  const coldLoad = night.buildingKw.map((kw, slot) => kw + night.coldExtraKw[slot]);
  const normal = dispatch(night, night.buildingKw, efficiency);
  const cold = dispatch(night, coldLoad, efficiency);
  if (cold.feasible) return {normal, cold, shifted: cold, minShiftKw: 0};

  // Only the bus departing first can gain charging capacity from this transfer.
  const donor = night.shiftFromSlot;
  const bus = night.buses.find(b => donor >= b.fromSlot && donor < b.untilSlot);
  let otherKw = 0;
  for (let slot = bus.fromSlot; slot < bus.untilSlot; slot++) {
    if (slot !== donor) otherKw += Math.max(0, Math.min(night.chargerKw, night.siteLimitKw - coldLoad[slot]));
  }
  const neededKw = (bus.requiredKwh - bus.startKwh) / (efficiency * night.slotHours) - otherKw;
  const shift = Math.max(0, neededKw - (night.siteLimitKw - coldLoad[donor]));
  if (shift <= Math.min(night.maxShiftKw, coldLoad[donor]) + 1e-8) {
    const moved = [...coldLoad];
    moved[donor] -= shift;
    moved[night.shiftToSlot] += shift;
    const shifted = dispatch(night, moved, efficiency);
    if (shifted.feasible) return {normal, cold, shifted, minShiftKw: shift};
  }
  return {normal, cold, shifted: null, minShiftKw: null};
}
