const dayMs = 86_400_000;

export function departures(feed, stop, start, minutes) {
  const from = Date.parse(start);
  const until = from + minutes * 60_000;
  const midnight = Math.floor(from / dayMs) * dayMs;
  const rows = [];
  for (let day = midnight - dayMs; day < until; day += dayMs) {
    const serviceDate = new Date(day).toISOString().slice(0, 10);
    for (const trip of feed.trips) {
      if (trip.stop !== stop) continue;
      const exception = feed.exceptions.find(row => row.service === trip.service && row.date === serviceDate);
      if (!(exception?.active ?? feed.calendar[trip.service]?.includes(serviceDate))) continue;
      const [hours, minutes, seconds] = trip.clock.split(":").map(Number);
      const departureMs = day + ((hours * 60 + minutes) * 60 + seconds) * 1000;
      if (departureMs >= from && departureMs < until) {
        rows.push({tripId: trip.tripId, serviceDate, departure: new Date(departureMs).toISOString()});
      }
    }
  }
  return rows.sort((left, right) => {
    if (left.departure !== right.departure) return left.departure < right.departure ? -1 : 1;
    if (left.tripId === right.tripId) return 0;
    return left.tripId < right.tripId ? -1 : 1;
  });
}
