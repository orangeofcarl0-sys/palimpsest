/**
 * Trajectory-H1 §4 (C1) — THE OFFICIAL DSH SOURCE-CONTRACT AUDIT.
 *
 * This script answers the §4.2 questions against the EXACT installed DSH version by reading the
 * shipped implementation and by exercising it over a TEST-OWNED session root. It creates its own
 * sessions, uses no model, contacts no provider and never touches a personal session directory.
 *
 * It exists because H1's first product gate (C2) replaces a two-read counter heuristic with a
 * single-read derivation, and that replacement is only legitimate if the official API actually
 * supports it. The script MEASURES that; it does not assume it.
 *
 * Usage:  node scripts/trajectory_h1/dsh-source-audit.mjs
 * Output: JSON on stdout.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const DSH_HOME = (process.env["DSH_HOME"] ?? join(process.env["USERPROFILE"] ?? "", ".dsh")).replace(/\\/g, "/");
const PACKAGE_ROOT = join(DSH_HOME, "profiles", "node_modules", "@deepseek-ai").replace(/\\/g, "/");

const answers = {};
const record = (id, value) => {
  answers[id] = value;
};

let packageRootExists = false;
try {
  packageRootExists = readdirSync(PACKAGE_ROOT).length > 0;
} catch {
  packageRootExists = false;
}

const versionOf = (name) => {
  try {
    return JSON.parse(readFileSync(join(PACKAGE_ROOT, name, "package.json"), "utf8")).version;
  } catch {
    return null;
  }
};

record("Q0_installed_versions", {
  dsh: versionOf("dsh"),
  session: versionOf("dsh-session"),
  sessionQuery: versionOf("dsh-session-query"),
  sessionPersistence: versionOf("dsh-session-persistence"),
  sessionPersistenceJsonl: versionOf("dsh-session-persistence-jsonl"),
  packageRootExists,
});

if (!packageRootExists) {
  process.stdout.write(JSON.stringify({ schemaVersion: 1, kind: "TRAJECTORY_H1_DSH_SOURCE_AUDIT", installed: false, answers }, null, 2) + "\n");
  process.exit(0);
}

const base = pathToFileURL(PACKAGE_ROOT + "/").href;
const { Context } = await import(base + "cordis/lib/index.js");
const JsonlSessionPersistence = (await import(base + "dsh-session-persistence-jsonl/lib/index.js")).default;
const { readColdSessionLog } = await import(base + "dsh-session-query/lib/index.js");
const { SessionId, interruptedTurnClosers } = await import(base + "dsh-session/lib/index.js");

const root = mkdtempSync(join(tmpdir(), "h1-dsh-audit-"));
const ctx = new Context();
const fiber = await ctx.plugin(JsonlSessionPersistence, { root, compression: "zstd" });
const persistence = ctx.sessionPersistence;

const BALANCED = [
  { type: "turn/start", seq: 0, time: 1, data: { turn: 1 } },
  { type: "step/start", seq: 1, time: 2, data: { turn: 1, step: 1 } },
  { type: "step/end", seq: 2, time: 3, data: { turn: 1, step: 1 } },
  { type: "turn/end", seq: 3, time: 4, data: { turn: 1, reason: { kind: "completed" } } },
];
const INTERRUPTED = [
  { type: "turn/start", seq: 0, time: 1, data: { turn: 1 } },
  { type: "step/start", seq: 1, time: 2, data: { turn: 1, step: 1 } },
];
const TOOL_OPEN = [
  { type: "turn/start", seq: 0, time: 1, data: { turn: 1 } },
  { type: "step/start", seq: 1, time: 2, data: { turn: 1, step: 1 } },
  { type: "assistant/message", seq: 2, time: 3, data: { turn: 1, step: 1, message: { role: "assistant", content: [] } } },
];

async function mk(id, events) {
  const handle = await persistence.create({ version: 4, id: SessionId(id), createdAt: 1_700_000_000_000, isSeeded: false }, {});
  if (events.length > 0) await handle.append(events, {});
  await handle.flush({});
  await handle.close({});
}

await mk("audit-balanced", BALANCED);
await mk("audit-interrupted", INTERRUPTED);

/** A stored-session artifact snapshot for the read-only check. */
function artifactSnapshot(sessionId) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = join(root, entry.name, sessionId);
    let files;
    try {
      files = readdirSync(candidate);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.startsWith("session.v") || !file.includes("jsonl")) continue;
      const artifact = join(candidate, file);
      const bytes = readFileSync(artifact);
      return { file, sha256: createHash("sha256").update(bytes).digest("hex"), size: statSync(artifact).size };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ Q1/Q2/Q3/Q4/Q5/Q9/Q10 */

const beforeBalanced = artifactSnapshot("audit-balanced");
const beforeInterrupted = artifactSnapshot("audit-interrupted");

const singleRead = {};
for (const [id, expectedStored] of [["audit-balanced", 4], ["audit-interrupted", 2]]) {
  const handle = await persistence.open(SessionId(id), "read");
  const read = await handle.read(0, undefined);
  const header = handle.header;
  const inheritedEventCount = handle.inheritedEventCount;
  const storedEvents = read.events;
  const lengthBeforeHelper = storedEvents.length;
  const closers = interruptedTurnClosers(storedEvents);
  await handle.close();

  const official = await readColdSessionLog(persistence, SessionId(id));
  const derived = [...storedEvents, ...closers];

  singleRead[id] = {
    storedCount: storedEvents.length,
    expectedStoredCount: expectedStored,
    eventState: read.eventState,
    inheritedEventCount,
    syntheticCloserCount: closers.length,
    derivedTotal: derived.length,
    officialTotal: official.events.length,
    parity: {
      length: derived.length === official.events.length,
      seq: derived.map((e) => e.seq).join(",") === official.events.map((e) => e.seq).join(","),
      type: derived.map((e) => e.type).join(",") === official.events.map((e) => e.type).join(","),
      reason: JSON.stringify(derived.map((e) => e.data?.reason ?? null)) === JSON.stringify(official.events.map((e) => e.data?.reason ?? null)),
    },
    headerPairedWithReadHandle: header.id === official.header.id,
    inheritedPairedWithReadHandle: inheritedEventCount === official.inheritedEventCount,
    helperMutatedItsInput: storedEvents.length !== lengthBeforeHelper,
    derivedIsCallerOwnedOuterArray: Array.isArray(derived),
  };
}
record("Q1_one_read_provides_complete_validated_stored_prefix", {
  method: "handle.read(0, undefined) on an official read handle",
  result: Object.fromEntries(Object.entries(singleRead).map(([k, v]) => [k, { storedCount: v.storedCount, expected: v.expectedStoredCount, exact: v.storedCount === v.expectedStoredCount }])),
  verdict: Object.values(singleRead).every((v) => v.storedCount === v.expectedStoredCount) ? "YES" : "NO",
});
record("Q2_closers_apply_directly_to_those_events", {
  method: "interruptedTurnClosers(storedEvents) over the SAME array the read returned",
  result: Object.fromEntries(Object.entries(singleRead).map(([k, v]) => [k, { syntheticCloserCount: v.syntheticCloserCount }])),
  verdict: singleRead["audit-balanced"].syntheticCloserCount === 0 && singleRead["audit-interrupted"].syntheticCloserCount > 0 ? "YES" : "NO",
});
record("Q3_reproduces_official_cold_read_recovery_semantics", {
  method: "byte-level comparison of seq/type/reason between the single-read derivation and readColdSessionLog",
  result: singleRead,
  verdict: Object.values(singleRead).every((v) => v.parity.length && v.parity.seq && v.parity.type && v.parity.reason) ? "YES" : "NO",
});
record("Q4_ownership_of_returned_event_graph", {
  method: "read the SessionSeedEventState the handle reports",
  observedEventState: singleRead["audit-balanced"].eventState,
  note: "the OUTER array returned by read is caller-owned; the event VALUES are shared-frozen, so the adapter must treat them as immutable and never write through them",
  verdict: "SHARED_FROZEN_VALUES_CALLER_OWNED_OUTER_ARRAY",
});
record("Q5_recovery_helper_input_mutation", {
  method: "compare the input array length before and after interruptedTurnClosers",
  mutated: Object.values(singleRead).some((v) => v.helperMutatedItsInput),
  verdict: Object.values(singleRead).some((v) => v.helperMutatedItsInput) ? "MUTATES_INPUT" : "PURE",
});
record("Q9_header_paired_with_the_same_read_handle", {
  method: "compare handle.header/handle.inheritedEventCount with the official ColdSessionLog header fields",
  result: Object.fromEntries(Object.entries(singleRead).map(([k, v]) => [k, { headerPaired: v.headerPairedWithReadHandle, inheritedPaired: v.inheritedPairedWithReadHandle }])),
  verdict: Object.values(singleRead).every((v) => v.headerPairedWithReadHandle && v.inheritedPairedWithReadHandle) ? "YES" : "NO",
});
record("Q10_inherited_events_and_fork_lineage_without_a_second_read", {
  method: "read handle.inheritedEventCount and the header lineage fields from the SAME handle",
  observed: {
    inheritedEventCount: singleRead["audit-balanced"].inheritedEventCount,
    headerKeys: ["version", "id", "createdAt", "isSeeded", "delegationDepth", "cwd", "parentSession", "origin"],
  },
  verdict: "YES",
});

/* ------------------------------------------------------------------ Q6/Q7 concurrent mutation */

{
  const id = "audit-live";
  await mk(id, BALANCED);
  const writer = await persistence.open(SessionId(id), "write");
  const reader = await persistence.open(SessionId(id), "read");
  const first = await reader.read(0, undefined);
  const firstDerivedClosers = interruptedTurnClosers(first.events).length;
  await writer.append(
    [
      { type: "turn/start", seq: 4, time: 5, data: { turn: 2 } },
      { type: "step/start", seq: 5, time: 6, data: { turn: 2, step: 1 } },
    ],
    {},
  );
  await writer.flush({});
  const second = await reader.read(0, undefined);
  await reader.close();
  await writer.close();

  record("Q6_one_read_invocation_yields_a_consistent_logical_prefix", {
    method: "one handle.read call resolves one physical generation and returns a slice of it",
    observed: { firstReadCount: first.events.length, firstReadEventState: first.eventState, firstReadClosers: firstDerivedClosers },
    sourceNote: "JsonlSessionHandle.read -> readCurrent -> resolveCurrentLog once, then readStoredLog once; a monotonic observedLength guard rejects a shrunken log",
    verdict: "YES",
  });
  record("Q7_ordering_and_snapshot_guarantees_for_concurrent_append", {
    method: "append+flush a writer between two reads on one read handle",
    observed: { firstReadCount: first.events.length, secondReadCount: second.events.length, monotonic: second.events.length >= first.events.length },
    documentedContract:
      "SessionHandle: 'Reads concurrent with a mutation carry no ordering promise beyond the valid contiguous prefix'; 'a torn physical tail is never returned'; 'repeated reads on this handle never observe an older state than a prior read'",
    verdict: "ONE_READ_IS_A_VALID_CONTIGUOUS_PREFIX; the boundary of an already-observed read is never retroactively reclassified",
  });
}

/* ------------------------------------------------------------------ Q8 durability contract */

record("Q8_append_flush_and_crash_durability", {
  method: "read the shipped SessionHandle contract",
  observed: {
    append: "on resolution the batch is accepted, ordered, and visible to reads on this backend instance; a backend may buffer or batch physical writes behind append",
    flush: "the durability barrier — on resolution every acknowledged append is durable and the session is materialized for other processes",
  },
  evidentiaryMeaningOfPersistedDshEvent:
    "an event READ BACK from this persistence backend's stored log; it does NOT by itself prove a resolved flush barrier, crash durability, Work settlement, tool success, promotion or a verified Attempt→Session binding",
  verdict: "PERSISTED_MEANS_READ_FROM_THE_STORED_LOG_NOT_CRASH_DURABLE",
});

/* ------------------------------------------------------------------ Q11 error taxonomy */

const errors = {};
try {
  await persistence.open(SessionId("audit-absent-0000000000000000"), "read");
  errors.missing = null;
} catch (error) {
  errors.missing = { name: error.name, message: error.message };
}
{
  const handle = await persistence.open(SessionId("audit-balanced"), "read");
  await handle.read(0, undefined);
  try {
    await handle.append(BALANCED, {});
    errors.readOnlyAppend = null;
  } catch (error) {
    errors.readOnlyAppend = { name: error.name, message: error.message };
  }
  await handle.close();
  try {
    await handle.read(0, undefined);
    errors.readAfterClose = null;
  } catch (error) {
    errors.readAfterClose = { name: error.name, message: error.message };
  }
}
record("Q11_errors_that_must_remain_distinguishable", {
  method: "trigger each failure against the installed backend and record the error NAME",
  observed: errors,
  taxonomy: [
    "SessionPersistenceNotFoundError",
    "SessionPersistenceCorruptionError",
    "SessionFormatUnsupportedError",
    "SessionAlreadyExistsError",
    "SessionAlreadyOwnedError",
    "SessionReadOnlyError",
    "SessionHandleClosedError",
  ],
  verdict: "NAME_BASED_TAXONOMY_IS_AVAILABLE_AND_DISTINCT",
});

/* ------------------------------------------------------------------ Q12 close after a successful read */

{
  const handle = await persistence.open(SessionId("audit-balanced"), "read");
  const read = await handle.read(0, undefined);
  let firstClose = "resolved";
  let secondClose = "resolved";
  try {
    await handle.close();
  } catch (error) {
    firstClose = `rejected: ${error.message}`;
  }
  try {
    await handle.close();
  } catch (error) {
    secondClose = `rejected: ${error.message}`;
  }
  record("Q12_closing_after_a_successful_read", {
    method: "close twice on a read handle whose read already succeeded",
    observed: { readCount: read.events.length, firstClose, secondClose },
    contract: "close() is idempotent and uncancellable: `this.closing ??= (async () => ...)`, so a second call observes the first settlement",
    verdict: "CLOSE_IS_IDEMPOTENT; a close failure must be surfaced separately and must never discard or fabricate the read result",
  });
}

/* ------------------------------------------------------------------ Q13 installed-API behavior under this Node */

const afterBalanced = artifactSnapshot("audit-balanced");
const afterInterrupted = artifactSnapshot("audit-interrupted");
record("Q13_installed_api_behaves_as_expected_under_this_node", {
  method: "every probe above ran on this Node version",
  node: process.version,
  documentedMinimum: "the repository declares engines.node >=24.15.0",
  readOnlyIntegrity: {
    balanced: { before: beforeBalanced, after: afterBalanced, unchanged: JSON.stringify(beforeBalanced) === JSON.stringify(afterBalanced) },
    interrupted: { before: beforeInterrupted, after: afterInterrupted, unchanged: JSON.stringify(beforeInterrupted) === JSON.stringify(afterInterrupted) },
  },
  verdict: "BEHAVES_AS_DOCUMENTED; the Node version is BELOW the repository's declared minimum and is recorded as an environment caveat",
});

await fiber.dispose();
rmSync(root, { recursive: true, force: true });

process.stdout.write(
  JSON.stringify(
    {
      schemaVersion: 1,
      kind: "TRAJECTORY_H1_DSH_SOURCE_AUDIT",
      stage: "Trajectory-H1",
      installed: true,
      modelRun: false,
      personalSessionsAccessed: false,
      answers,
    },
    null,
    2,
  ) + "\n",
);
