/**
 * Host-S1RA-E4 §A2 — DETERMINISTIC RED CONTROL FOR THE P2E0/P2E1 SHARED-ROOT INTERFERENCE.
 *
 * THE DEFECT. `test/trajectory_p2e1_resource_safety.test.ts` case 35 records `readdirSync(GATE_ROOT).length`, runs
 * five allocate/dispose cycles of its OWN roots, and asserts the count is unchanged. `GATE_ROOT` is
 * `~/.palimpsest-gates` — the REAL shared directory, resolved once at module load from
 * `PALIMPSEST_P2E0_GATE_ROOT` or the user profile. `test/trajectory_p2e0_test_runtime_safety.test.ts` allocates and
 * disposes roots in that SAME directory. When the two run in parallel, one suite's legitimate allocation or disposal
 * lands inside the other's observation window, so the count moves for reasons the observing test did not cause.
 *
 * THE ASSERTION IS NOT WRONG ABOUT THE WORLD. It is wrong about SCOPE: it treats a shared, concurrently-mutated
 * directory as though it were this test's private state.
 *
 * HOW THIS CONTROL IS DETERMINISTIC RATHER THAN PROBABILISTIC. There is no race. The observing side is stopped at a
 * barrier, the mutating side performs one legitimate allocation, and only then does the observer read the count.
 * A child process is used, so the mutation is genuinely EXTERNAL — not a function call inside the observer.
 *
 * SAFETY. The mutating side allocates through the real E3 machinery and disposes through the real quarantine path,
 * so nothing is left behind and nothing foreign is touched. The harness records the gate-root entry set before and
 * after and asserts it returns to its baseline; a failure there is reported, not hidden.
 *
 * Usage:
 *   node scripts/host_s1rae4/isolation-red-control.mjs [--json=<path>]
 */
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);

const REPO = resolve(import.meta.dirname, "..", "..");
const owned = await import("../trajectory_p2e0/owned-root.mjs");
const GATE_ROOT = owned.GATE_ROOT;

/** The exact observation the failing case performs, extracted so the control measures the same thing. */
function countGateRoots() {
  try {
    return readdirSync(GATE_ROOT).length;
  } catch {
    return 0;
  }
}

function entrySet() {
  try {
    return readdirSync(GATE_ROOT).sort();
  } catch {
    return [];
  }
}

/**
 * THE MUTATING SIDE. It runs in a SEPARATE PROCESS, so the observer cannot dismiss the change as its own doing.
 *
 * THE BARRIER IS BEFORE THE ALLOCATION, NOT AFTER. A first version of this control had the child allocate first and
 * then signal, which meant the observer's "before" reading already included the mutation and the control reported
 * NOT REPRODUCED for a reason that had nothing to do with the defect. The sequence below is the one that measures
 * the defect: ready → observer reads → release → child allocates → observer reads again.
 */
const MUTATOR = `
import { readdirSync } from "node:fs";
const owned = await import(${JSON.stringify(new URL("../trajectory_p2e0/owned-root.mjs", import.meta.url).href)});
const say = (line) => process.stdout.write(line + "\\n");
/** STEP A: ready, and holding nothing. */
say("READY");
await new Promise((done) => process.stdin.once("data", done));
/** STEP C: the legitimate allocation, after the observer has recorded its baseline. */
const root = owned.allocateOwnedRoot("p2e0-redcontrol-", "e4-red-control");
say("ALLOCATED " + String(readdirSync(owned.GATE_ROOT).length));
await new Promise((done) => process.stdin.once("data", done));
/** STEP F: release, through the real quarantine disposal. */
const result = await owned.safeCleanup(root);
say("DISPOSED " + JSON.stringify({ cleaned: result.cleaned, reason: result.reason ?? null }));
process.exit(result.cleaned === true ? 0 : 1);
`;

const baselineEntries = entrySet();
const baselineCount = baselineEntries.length;

const child = spawn(process.execPath, ["--input-type=module", "-e", MUTATOR], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, PALIMPSEST_P2E0_GATE_ROOT: GATE_ROOT },
});

const childLines = [];
let ready = false;
const waitFor = (prefix) =>
  new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error(`the mutator never emitted ${prefix}`)), 60_000);
    const onData = (chunk) => {
      for (const line of String(chunk).split(/\r?\n/u)) {
        if (line.trim() === "") continue;
        childLines.push(line);
        if (line.startsWith(prefix)) {
          clearTimeout(timer);
          child.stdout.off("data", onData);
          done(line);
        }
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", (chunk) => childLines.push(`STDERR ${String(chunk).trim()}`));
    child.on("error", fail);
  });

/** STEP A — the mutator is ready and has allocated NOTHING. */
await waitFor("READY");
ready = true;

/**
 * STEP B — THE OBSERVER RECORDS SHARED STATE. This is exactly what case 35 does before its loop.
 */
const observedBefore = countGateRoots();

/** STEP C — release the mutator; it performs ONE legitimate allocation. */
child.stdin.write("alloc\n");
const allocatedLine = await waitFor("ALLOCATED ");

/**
 * STEP D — THE OBSERVER SEES A CHANGE IT DID NOT CAUSE. Case 35's own five cycles have not run at all.
 */
const observedAfterExternalMutation = countGateRoots();
const movedByExternalActor = observedAfterExternalMutation !== observedBefore;

/**
 * STEP E — THE ORIGINAL ASSERTION WOULD FAIL. Case 35 asserts the count equals its own `before`.
 */
const originalAssertionWouldPass = observedAfterExternalMutation === observedBefore;

/** STEP F — release the mutator to dispose, and confirm it cleaned up. */
child.stdin.write("dispose\n");
const disposal = await new Promise((done) => {
  let cleaned = null;
  let reason = null;
  let exited = null;
  child.stdout.on("data", (chunk) => {
    for (const line of String(chunk).split(/\r?\n/u)) {
      if (line.startsWith("DISPOSED ")) {
        try {
          const parsed = JSON.parse(line.slice("DISPOSED ".length));
          cleaned = parsed.cleaned;
          reason = parsed.reason;
        } catch {
          /* recorded by the exit code */
        }
      }
    }
  });
  child.on("exit", (code) => {
    exited = code;
    done({ cleaned, reason, exited });
  });
});

const afterEntries = entrySet();
const restored = afterEntries.length === baselineEntries.length && afterEntries.every((entry, index) => entry === baselineEntries[index]);

const report = {
  schemaVersion: 1,
  kind: "HOST_S1RAE4_ISOLATION_RED_CONTROL",
  stage: "Palimpsest Host-S1RA-E4",
  measuredAt: new Date().toISOString(),
  method:
    "a child process performs one legitimate allocation in the shared gate root; the observer records the count BEFORE releasing it, then records it again. The observer is parked at a barrier, so the ordering is deterministic rather than a race",
  gateRoot: GATE_ROOT,
  gateRootIsShared: true,
  gateRootResolution: "scripts/trajectory_p2e0/owned-root.mjs resolves GATE_ROOT once at module load from PALIMPSEST_P2E0_GATE_ROOT or the user profile",
  sequence: [
    "mutator READY with nothing allocated",
    "observer records the count (this is case 35's `before`)",
    "mutator performs one legitimate allocation",
    "observer records the count again (this is the value case 35 asserts against)",
    "mutator disposes through the real quarantine path",
  ],
  observation: {
    observerRecordedBefore: observedBefore,
    afterExternalAllocation: observedAfterExternalMutation,
    delta: observedAfterExternalMutation - observedBefore,
    movedByExternalActor,
    originalAssertionWouldPass,
    case35WouldCompare: { before: observedBefore, after: observedAfterExternalMutation },
  },
  mutator: {
    mechanism: "a separate node process calling the real allocateOwnedRoot and safeCleanup",
    childLines,
    readyBeforeAllocating: ready,
    allocatedLine,
    disposal,
  },
  redVerdict: movedByExternalActor
    ? "REPRODUCED: a legitimate allocation by an external process moved the count inside the observation window, so case 35's assertion fails for a reason case 35 did not cause"
    : "NOT REPRODUCED: the count did not move",
  gateRootRestored: restored,
  gateRootEntriesBefore: baselineCount,
  gateRootEntriesAfter: afterEntries.length,
  residualDifference: restored ? null : { before: baselineEntries, after: afterEntries },
};

const jsonPath = args.get("json");
if (jsonPath !== undefined) writeFileSync(resolve(jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(movedByExternalActor && restored ? 0 : 1);
