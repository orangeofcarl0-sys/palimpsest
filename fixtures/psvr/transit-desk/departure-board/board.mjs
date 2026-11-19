// The currently deployed board expands only the query's civil date.
export function departures(feed, stop, start, minutes) {
  const from = Date.parse(start);
  const date = new Date(from).toISOString().slice(0, 10);
  const midnight = Date.parse(date + "T00:00:00Z");
  const rows = [];
  for (const trip of feed.trips) {
    const override = feed.exceptions.find(x => x.service === trip.service && x.date === date);
    if (!(override?.active ?? feed.calendar[trip.service]?.includes(date)) || trip.stop !== stop) continue;
    const [h,m,s] = trip.clock.split(":").map(Number);
    const time = midnight + 1000 * (3600*h + 60*m + s);
    if (time >= from && time < from + minutes*60000) {
      rows.push({tripId:trip.tripId, serviceDate:date, departure:new Date(time).toISOString()});
    }
  }
  return rows.sort((a,b) => a.departure.localeCompare(b.departure) || a.tripId.localeCompare(b.tripId));
}
