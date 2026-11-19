// GTFS service dates are not civil dates: a trip whose clock is 24:00:00 or
// later still belongs to its service date but departs on the following day.
// Conversely, a trip with a 00:xx clock on Saturday belongs to Saturday's
// service date. Expand every service date that can reach the query window.
const DAY_MS = 24 * 60 * 60 * 1000;

function runsOn(feed, service, date) {
  const override = feed.exceptions.find(x => x.service === service && x.date === date);
  return override ? override.active : (feed.calendar[service]?.includes(date) ?? false);
}

function asciiCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function departures(feed, stop, start, minutes) {
  const from = Date.parse(start);
  const to = from + minutes * 60000;
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return [];

  const fromDate = new Date(from).toISOString().slice(0, 10);
  const toDate = new Date(to).toISOString().slice(0, 10);
  // Scan a two-day margin as a safe lower bound. With clocks below 48:00:00,
  // the previous service date is the oldest one that can overlap this window.
  const firstMidnight = Date.parse(fromDate + "T00:00:00Z") - 2 * DAY_MS;
  const lastMidnight = Date.parse(toDate + "T00:00:00Z");

  const rows = [];
  for (let midnight = firstMidnight; midnight <= lastMidnight; midnight += DAY_MS) {
    const serviceDate = new Date(midnight).toISOString().slice(0, 10);
    for (const trip of feed.trips) {
      if (trip.stop !== stop || !runsOn(feed, trip.service, serviceDate)) continue;
      const [h, m, s] = trip.clock.split(":").map(Number);
      const departure = midnight + 1000 * (3600 * h + 60 * m + s);
      if (departure >= from && departure < to) {
        rows.push({
          tripId: trip.tripId,
          serviceDate,
          departure: new Date(departure).toISOString(),
        });
      }
    }
  }

  return rows.sort(
    (a, b) => asciiCompare(a.departure, b.departure) || asciiCompare(a.tripId, b.tripId),
  );
}
