const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(date, days) {
  return new Date(Date.parse(date + "T00:00:00Z") + days * DAY_MS).toISOString().slice(0, 10);
}

function isActive(feed, service, date) {
  const override = (feed.exceptions ?? []).find(x => x.service === service && x.date === date);
  if (override) return override.active;
  return (feed.calendar?.[service] ?? []).includes(date);
}

// A service date owns its whole timetable: clocks below 24:00 run on that
// civil date, and clocks at or above 24:00 run on the following civil date.
// The query window can therefore contain departures from both the previous
// service date (late-night trips) and the window's own service dates.
export function departures(feed, stop, start, minutes) {
  const from = Date.parse(start);
  const until = from + minutes * 60000;
  const firstDate = new Date(from).toISOString().slice(0, 10);
  const lastDate = new Date(until).toISOString().slice(0, 10);

  // A trip departs on its service date, or one civil date later when its
  // clock is >= 24:00. Starting one day before the window is thus sufficient
  // to catch late-night services that continue past midnight.
  const serviceDates = [];
  for (let date = addDays(firstDate, -1); date <= lastDate; date = addDays(date, 1)) {
    serviceDates.push(date);
  }

  const rows = [];
  for (const trip of feed.trips) {
    if (trip.stop !== stop) continue;
    const [h, m, s] = trip.clock.split(":").map(Number);
    const clockMs = 1000 * (3600 * h + 60 * m + s);
    for (const serviceDate of serviceDates) {
      if (!isActive(feed, trip.service, serviceDate)) continue;
      const time = Date.parse(serviceDate + "T00:00:00Z") + clockMs;
      if (time >= from && time < until) {
        rows.push({tripId: trip.tripId, serviceDate, departure: new Date(time).toISOString()});
      }
    }
  }

  return rows.sort((a, b) => {
    if (a.departure !== b.departure) return a.departure < b.departure ? -1 : 1;
    if (a.tripId !== b.tripId) return a.tripId < b.tripId ? -1 : 1;
    return 0;
  });
}
