/**
 * C6-R1 — scenario time and event visibility.
 *
 * COG-6 copied the whole inbox before the Principal began, so the February 14 correction and the
 * duplicate delivery were visible at the February 10 observation time. A prompt telling the model to
 * ignore a file is not isolation; the file must be absent.
 *
 * This module stages a test-owned inbox from the frozen fixture:
 *
 *   · visibility is derived ONLY from the frozen arrival records (`arrivals.jsonl`);
 *   · every copied item is verified against its recorded SHA-256;
 *   · the staged `arrivals.jsonl` contains only the visible records, so no future filename or digest
 *     appears in model-visible metadata;
 *   · the source fixture is never modified;
 *   · a future leak is detected, not assumed absent;
 *   · the effective visible set and its digest are returned for the evidence record.
 *
 * Simulated project time (`observationTime`) and real time (`releasedAt`) are separate fields and are
 * never substituted for each other.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, posix, resolve, sep } from "node:path";

export const T1 = "2026-02-10T09:05:00Z";
export const T2 = "2026-02-14T09:10:00Z";
export const ARRIVALS_FILE = "arrivals.jsonl";

const DIGEST = /^[0-9a-f]{64}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fail(reason, detail) {
  const error = new Error(detail === undefined ? reason : `${reason}: ${detail}`);
  error.code = reason;
  throw error;
}

function assertInstant(value, label) {
  if (typeof value !== "string" || !ISO_INSTANT.test(value) || !Number.isFinite(Date.parse(value))) {
    fail("invalid_observation_time", `${label} must be an ISO instant ending in Z`);
  }
}

function assertSafeItem(item) {
  if (typeof item !== "string" || item.trim() === "") fail("invalid_arrival_item", "item must be a non-empty string");
  if (item.includes("\\") || item.includes(":") || item.startsWith("/") || isAbsolute(item)) {
    fail("invalid_arrival_item", `"${item}" is not a relative POSIX path`);
  }
  const normalized = posix.normalize(item);
  if (normalized !== item || normalized.startsWith("../") || normalized === "..") {
    fail("invalid_arrival_item", `"${item}" escapes its root`);
  }
}

/** Read and validate the frozen arrival records. */
export function readArrivals(source) {
  const file = join(source, ARRIVALS_FILE);
  if (!existsSync(file)) fail("arrivals_missing", file);
  const text = readFileSync(file, "utf8");
  const records = [];
  const seen = new Map();
  let line = 0;
  for (const raw of text.split(/\r?\n/u)) {
    line += 1;
    if (raw.trim() === "") continue;
    let record;
    try {
      record = JSON.parse(raw);
    } catch {
      fail("arrival_record_malformed", `line ${line}`);
    }
    assertInstant(record.arrivedAt, `line ${line} arrivedAt`);
    assertSafeItem(record.item);
    if (typeof record.kind !== "string" || record.kind.trim() === "") fail("arrival_kind_missing", `line ${line}`);
    if (typeof record.sha256 !== "string" || !DIGEST.test(record.sha256)) fail("arrival_digest_malformed", `line ${line}`);
    if (typeof record.status !== "string" || record.status.trim() === "") fail("arrival_status_missing", `line ${line}`);
    const prior = seen.get(record.item);
    if (prior !== undefined) {
      if (prior.sha256 !== record.sha256) {
        fail("inconsistent_arrival_identity", `"${record.item}" appears with two different digests`);
      }
      fail("duplicate_arrival_item", `"${record.item}" appears twice`);
    }
    seen.set(record.item, record);
    const sourcePath = join(source, ...record.item.split("/"));
    if (!existsSync(sourcePath)) fail("arrival_content_missing", record.item);
    const observed = sha256(readFileSync(sourcePath));
    if (observed !== record.sha256) {
      fail("arrival_digest_mismatch", `${record.item} is ${observed}, recorded ${record.sha256}`);
    }
    records.push({ ...record });
  }
  if (records.length === 0) fail("arrivals_empty", file);
  return records;
}

/** The events that have arrived by `observationTime`. Visibility is inclusive. */
export function visibleArrivals(records, observationTime) {
  assertInstant(observationTime, "observationTime");
  const cutoff = Date.parse(observationTime);
  return records
    .filter((record) => Date.parse(record.arrivedAt) <= cutoff)
    .sort((left, right) => {
      const byTime = Date.parse(left.arrivedAt) - Date.parse(right.arrivedAt);
      if (byTime !== 0) return byTime;
      return left.item < right.item ? -1 : left.item > right.item ? 1 : 0;
    });
}

function canonicalRecord(record) {
  return JSON.stringify({
    arrivedAt: record.arrivedAt,
    item: record.item,
    kind: record.kind,
    sha256: record.sha256,
    status: record.status,
  });
}

/** Stable digest of the effective visible event set, independent of record order. */
export function visibleSetDigest(visible) {
  const sorted = [...visible].sort((left, right) => (left.item < right.item ? -1 : left.item > right.item ? 1 : 0));
  return sha256(sorted.map(canonicalRecord).join("\n"));
}

function listFiles(root) {
  const found = [];
  const stack = [""];
  while (stack.length > 0) {
    const current = stack.pop();
    const absolute = current === "" ? root : join(root, ...current.split("/"));
    for (const entry of readdirSync(absolute)) {
      const child = current === "" ? entry : `${current}/${entry}`;
      const childAbsolute = join(absolute, entry);
      if (statSync(childAbsolute).isDirectory()) stack.push(child);
      else found.push(child);
    }
  }
  return found.sort();
}

function treeDigest(root) {
  return sha256(
    listFiles(root)
      .map((path) => `${path}\0${sha256(readFileSync(join(root, ...path.split("/"))))}`)
      .join("\n"),
  );
}

function isInside(child, parent) {
  const childResolved = resolve(child);
  const parentResolved = resolve(parent);
  const same = (left, right) => (process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right);
  if (same(childResolved, parentResolved)) return true;
  const prefix = parentResolved.endsWith(sep) ? parentResolved : `${parentResolved}${sep}`;
  return process.platform === "win32"
    ? childResolved.toLowerCase().startsWith(prefix.toLowerCase())
    : childResolved.startsWith(prefix);
}

function assertDestination(source, destination) {
  if (isInside(destination, source)) fail("destination_inside_source", destination);
  if (isInside(source, destination)) fail("source_inside_destination", destination);
}

/**
 * Detect any future event visible in the staged inbox: its path or basename, any sibling metadata in
 * its event directory, or its unique digest appearing in a visible file's contents.
 *
 * The duplicate delivery shares Candidate A's digest, so a digest that is also visible is not a leak
 * signal — only a digest unique to a future event is.
 */
export function findFutureLeaks(destination, records, observationTime) {
  const visible = visibleArrivals(records, observationTime);
  const visibleItems = new Set(visible.map((record) => record.item));
  const visibleDigests = new Set(visible.map((record) => record.sha256));
  const files = existsSync(destination) ? listFiles(destination) : [];
  const leaks = [];
  for (const record of records) {
    if (visibleItems.has(record.item)) continue;
    const eventDirectory = posix.dirname(record.item);
    for (const file of files) {
      if (file === record.item) {
        leaks.push({ path: file, reason: "future_event_content", identity: record.item });
        continue;
      }
      if (basename(file) === basename(record.item) && posix.dirname(file) === eventDirectory) {
        leaks.push({ path: file, reason: "future_event_filename", identity: record.item });
        continue;
      }
      if (file.startsWith(`${eventDirectory}/`)) {
        leaks.push({ path: file, reason: "future_event_metadata", identity: record.item });
      }
    }
    if (!visibleDigests.has(record.sha256)) {
      for (const file of files) {
        const absolute = join(destination, ...file.split("/"));
        let text;
        try {
          text = readFileSync(absolute, "utf8");
        } catch {
          continue;
        }
        if (text.includes(record.sha256)) {
          leaks.push({ path: file, reason: "future_event_digest", identity: record.item });
        }
        if (text.includes(record.item)) {
          leaks.push({ path: file, reason: "future_event_reference", identity: record.item });
        }
      }
    }
  }
  const unique = new Map(leaks.map((leak) => [`${leak.path}\0${leak.reason}\0${leak.identity}`, leak]));
  return [...unique.values()];
}

function writeVisibleArrivals(destination, visible) {
  const text = visible.map((record) => canonicalRecord(record)).join("\n");
  writeFileSync(join(destination, ARRIVALS_FILE), text === "" ? "" : `${text}\n`, "utf8");
}

function copyVerified(source, destination, record) {
  const from = join(source, ...record.item.split("/"));
  const to = join(destination, ...record.item.split("/"));
  const bytes = readFileSync(from);
  const observed = sha256(bytes);
  if (observed !== record.sha256) fail("arrival_digest_mismatch", `${record.item} is ${observed}, recorded ${record.sha256}`);
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, bytes);
  const copied = sha256(readFileSync(to));
  if (copied !== record.sha256) fail("copied_digest_mismatch", `${record.item} became ${copied}`);
  return { path: record.item, digest: copied, bytes: bytes.length };
}

/**
 * Materialize the inbox state visible at `observationTime` into an empty destination.
 *
 * @param {{
 *   source: string,
 *   observationTime: string,
 *   destination: string,
 *   digest?: (value: string | Buffer) => string,
 * }} input
 */
export function materializeInboxAsOf(input) {
  const digest = input.digest ?? sha256;
  assertInstant(input.observationTime, "observationTime");
  assertDestination(input.source, input.destination);
  const records = readArrivals(input.source);
  const visible = visibleArrivals(records, input.observationTime);
  if (visible.length === 0) fail("no_visible_events", input.observationTime);
  if (existsSync(input.destination)) {
    const entries = readdirSync(input.destination);
    if (entries.length > 0) fail("destination_not_empty", input.destination);
  } else {
    mkdirSync(input.destination, { recursive: true });
  }
  const files = visible.map((record) => copyVerified(input.source, input.destination, record));
  writeVisibleArrivals(input.destination, visible);
  const leaks = findFutureLeaks(input.destination, records, input.observationTime);
  if (leaks.length > 0) fail("future_event_leaked", JSON.stringify(leaks));
  return {
    observationTime: input.observationTime,
    releasedAt: null,
    visibleEvents: visible.map((record) => ({ ...record })),
    visibleSetDigest: visibleSetDigest(visible),
    treeDigest: treeDigest(input.destination),
    files,
    leaks: [],
    sourceTreeDigest: treeDigest(input.source),
    digest: digest(JSON.stringify(visible.map(canonicalRecord))),
  };
}

/**
 * Release newly eligible events into an already materialized inbox, after the first phase.
 *
 * Only additions are written. An existing event whose bytes differ, or an observation time that
 * moves backwards, is refused.
 *
 * @param {{
 *   source: string,
 *   observationTime: string,
 *   destination: string,
 *   releasedAt?: string,
 *   digest?: (value: string | Buffer) => string,
 * }} input
 */
export function releaseInboxAsOf(input) {
  const digest = input.digest ?? sha256;
  assertInstant(input.observationTime, "observationTime");
  assertDestination(input.source, input.destination);
  if (!existsSync(join(input.destination, ARRIVALS_FILE))) {
    fail("not_materialized", input.destination);
  }
  const releasedAt = input.releasedAt ?? new Date().toISOString();
  assertInstant(releasedAt, "releasedAt");

  const records = readArrivals(input.source);
  const visible = visibleArrivals(records, input.observationTime);
  const existing = readArrivals(input.destination);
  const existingItems = new Set(existing.map((record) => record.item));

  const newestExisting = Math.max(...existing.map((record) => Date.parse(record.arrivedAt)));
  if (Date.parse(input.observationTime) < newestExisting) {
    fail("observation_time_not_monotonic", input.observationTime);
  }

  const sourceByItem = new Map(records.map((record) => [record.item, record]));
  for (const record of existing) {
    const sourceRecord = sourceByItem.get(record.item);
    if (sourceRecord === undefined) fail("existing_event_not_in_source", record.item);
    if (sourceRecord.sha256 !== record.sha256) fail("existing_event_digest_changed", record.item);
    const onDisk = sha256(readFileSync(join(input.destination, ...record.item.split("/"))));
    if (onDisk !== record.sha256) fail("existing_event_content_changed", record.item);
  }

  for (const record of visible) {
    if (!existingItems.has(record.item)) continue;
    const staged = sha256(readFileSync(join(input.destination, ...record.item.split("/"))));
    if (staged !== record.sha256) fail("existing_event_content_changed", record.item);
  }

  const newlyVisible = visible.filter((record) => !existingItems.has(record.item));
  const files = newlyVisible.map((record) => copyVerified(input.source, input.destination, record));
  writeVisibleArrivals(input.destination, visible);

  const leaks = findFutureLeaks(input.destination, records, input.observationTime);
  if (leaks.length > 0) fail("future_event_leaked", JSON.stringify(leaks));

  return {
    observationTime: input.observationTime,
    releasedAt,
    previouslyVisibleSetDigest: visibleSetDigest(existing),
    visibleEvents: visible.map((record) => ({ ...record })),
    newlyVisible: newlyVisible.map((record) => ({ ...record })),
    visibleSetDigest: visibleSetDigest(visible),
    treeDigest: treeDigest(input.destination),
    files,
    leaks: [],
    digest: digest(JSON.stringify(visible.map(canonicalRecord))),
  };
}

/** Read the staged arrival records (the model-visible set), for an evidence check. */
export function readStagedArrivals(destination) {
  return readArrivals(destination);
}

/**
 * A one-way check used by the evaluator: the staged tree contains no future event. Returns the leak
 * list; an empty list is the only passing result.
 */
export function auditStaging(destination, source, observationTime) {
  const records = readArrivals(source);
  const staged = readArrivals(destination);
  const expected = visibleArrivals(records, observationTime);
  const stagedItems = new Set(staged.map((record) => record.item));
  const missing = expected.filter((record) => !stagedItems.has(record.item)).map((record) => record.item);
  const unexpected = staged.filter((record) => !expected.some((entry) => entry.item === record.item)).map((record) => record.item);
  return {
    observationTime,
    expectedVisibleSetDigest: visibleSetDigest(expected),
    stagedVisibleSetDigest: visibleSetDigest(staged),
    missing,
    unexpected,
    leaks: findFutureLeaks(destination, records, observationTime),
  };
}

export { listFiles, treeDigest, isInside };
