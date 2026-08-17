/**
 * Wire-format datetime handling for the ported contracts.
 *
 * The Python baseline emits the same instant in three different textual
 * forms, and each is load-bearing for a different surface:
 *
 *  1. wire (pydantic mode="json"):        "2026-08-13T00:00:00Z"
 *  2. canonical (strftime micro, UTC):    "2026-08-13T00:00:00.000000Z"
 *     - inside canonical digests, payload_json blobs, the committed_at
 *       column and schema_migrations.applied_at
 *  3. isoformat (datetime.isoformat()):   "2026-08-13T00:00:00+00:00"
 *     - projection updated_at columns
 *
 * Accept 1/2/3 plus explicit ±HH:MM offsets on input; require an offset
 * (naive datetimes fail closed, mirroring the Python validators).
 */

export class DatetimeFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatetimeFormatError";
  }
}

const DATETIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/u;

interface ParsedDatetime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  microsecond: number;
  offsetMinutes: number;
}

function parseDatetime(value: string): ParsedDatetime {
  const match = DATETIME_RE.exec(value);
  if (match === null) {
    throw new DatetimeFormatError(
      `datetime must be ISO-8601 with an explicit UTC offset: ${value}`,
    );
  }
  const fraction = match[7];
  if (fraction !== undefined && fraction.length > 6 && !/^\d{6}0+$/u.test(fraction)) {
    throw new DatetimeFormatError(
      "sub-microsecond precision is not representable in the V0 contract",
    );
  }
  const micro = fraction === undefined ? 0 : Number(fraction.slice(0, 6).padEnd(6, "0"));
  const zone = match[8]!;
  const offsetMinutes =
    zone === "Z" ? 0 : signOf(zone) * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6)));
  const parsed: ParsedDatetime = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6]),
    microsecond: micro,
    offsetMinutes,
  };
  const daysInMonth = new Date(Date.UTC(parsed.year, parsed.month, 0)).getUTCDate();
  if (
    parsed.month < 1 || parsed.month > 12 ||
    parsed.day < 1 || parsed.day > daysInMonth ||
    parsed.hour > 23 || parsed.minute > 59 || parsed.second > 59
  ) {
    throw new DatetimeFormatError(`datetime is out of range: ${value}`);
  }
  return parsed;
}

function signOf(zone: string): number {
  return zone[0] === "-" ? -1 : 1;
}

function pad(value: number, width: number): string {
  return value.toString().padStart(width, "0");
}

/** Validate offset presence and return the instant as epoch microseconds. */
export function datetimeToEpochMicros(value: string): number {
  const parsed = parseDatetime(value);
  const utcMillis = Date.UTC(
    parsed.year,
    parsed.month - 1,
    parsed.day,
    parsed.hour,
    parsed.minute,
    parsed.second,
  );
  // Daylight rollover beyond 24h must still be rejected, Date.UTC normalizes;
  // we already range-checked components, and ms precision suffices for micros.
  const shifted = utcMillis - parsed.offsetMinutes * 60_000;
  return shifted * 1000 + parsed.microsecond;
}

/** Convert any accepted wire datetime to the canonical micro form (form 2). */
export function canonicalDatetime(value: string): string {
  const parsed = parseDatetime(value);
  const shifted = shiftToUtc(parsed);
  const secondsWithinDay =
    shifted.hour * 3600 + shifted.minute * 60 + shifted.second;
  void secondsWithinDay;
  const base = `${pad(shifted.year, 4)}-${pad(shifted.month, 2)}-${pad(shifted.day, 2)}T${pad(shifted.hour, 2)}:${pad(shifted.minute, 2)}:${pad(shifted.second, 2)}`;
  return `${base}.${pad(parsed.microsecond, 6)}Z`;
}

/** Convert any accepted wire datetime to datetime.isoformat() output (form 3). */
export function isoformatDatetime(value: string): string {
  const parsed = parseDatetime(value);
  const shifted = shiftToUtc(parsed);
  const base = `${pad(shifted.year, 4)}-${pad(shifted.month, 2)}-${pad(shifted.day, 2)}T${pad(shifted.hour, 2)}:${pad(shifted.minute, 2)}:${pad(shifted.second, 2)}`;
  const micro = parsed.microsecond === 0 ? "" : `.${pad(parsed.microsecond, 6)}`;
  const offset =
    parsed.offsetMinutes === 0
      ? "+00:00"
      : `${parsed.offsetMinutes < 0 ? "-" : "+"}${pad(Math.floor(Math.abs(parsed.offsetMinutes) / 60), 2)}:${pad(Math.abs(parsed.offsetMinutes) % 60, 2)}`;
  return `${base}${micro}${offset}`;
}

interface Shifted {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function shiftToUtc(parsed: ParsedDatetime): Shifted {
  const local = Date.UTC(
    parsed.year,
    parsed.month - 1,
    parsed.day,
    parsed.hour,
    parsed.minute,
    parsed.second,
  );
  const shifted = new Date(local - parsed.offsetMinutes * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}
