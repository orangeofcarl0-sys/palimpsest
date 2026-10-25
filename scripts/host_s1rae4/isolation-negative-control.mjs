/**
 * Host-S1RA-E4 §A4 / §13 — ISOLATION NEGATIVE CONTROL.
 *
 * The A3 correction moved both suites onto private fixture roots. A correction is only trustworthy if the ORIGINAL
 * observation semantics still fail when the interference is present — otherwise "it passes now" could mean the
 * interference stopped happening rather than that the test stopped depending on it.
 *
 * This script proves three things, in one deterministic sequence:
 *
 *   1. OLD SEMANTICS, SHARED ROOT — an external allocation inside the window makes the original assertion fail.
 *   2. NEW SEMANTICS, PRIVATE ROOT — the same external allocation leaves the private count unchanged, so the
 *      corrected assertion passes while the interference is still genuinely happening.
 *   3. The interference is REAL in arm 2, not absent — proven by reading the shared count from the same process,
 *      which does move.
 *
 * That third arm is what makes arm 2 meaningful. Without it, arm 2 could pass simply because nothing interfered.
 *
 * SAFETY. The external allocation goes through the real allocator and the real quarantine disposal, in the shared
 * gate root, and the harness asserts the shared entry set returns to its baseline. Nothing foreign is touched.
 *
 * Usage:
 *   node scripts/host_s1rae4/isolation-negative-control.mjs [--json=<path>]
 */
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);

const owned = await import("../trajectory_p2e0/owned-root.mjs");
const SHARED = owned.GATE_ROOT;

const count = (path) => {
  try {
    return readdirSync(path).length;
  } catch {
    return 0;
  }
};
const entrySet = (path) => {
  try {
    return readdirSync(path).sort();
  } catch {
    return [];
  }
};

/**
 * THE PRIVATE FIXTURE ROOT, exactly as the corrected suites build one: a sandbox plus a `gate-root` inside it.
 */
const sandbox = mkdtempSync(join(tmpdir(), "s1rae4-negative-"));
const privateGateRoot = join(sandbox, "gate-root");
mkdirSync(privateGateRoot, { recursive: true });

const MUTATOR = `
import { readdirSync } from "node:fs";
const owned = await import(${JSON.stringify(new URL("../trajectory_p2e0/owned-root.mjs", import.meta.url).href)});
const say = (line) => process.stdout.write(line + "\\n");
say("READY");
await new Promise((done) => process.stdin.once("data", done));
const root = owned.allocateOwnedRoot("p2e0-negative-", "e4-negative-control");
say("ALLOCATED " + String(readdirSync(owned.GATE_ROOT).length));
await new Promise((done) => process.stdin.once("data", done));
const result = await owned.safeCleanup(root);
say("DISPOSED " + JSON.stringify({ cleaned: result.cleaned, reason: result.reason ?? null }));
process.exit(result.cleaned === true ? 0 : 1);
`;

const sharedBaseline = entrySet(SHARED);
const child = spawn(process.execPath, ["--input-type=module", "-e", MUTATOR], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, PALIMPSEST_P2E0_GATE_ROOT: SHARED },
});

const lines = [];
const waitFor = (prefix) =>
  new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error(`mutator never emitted ${prefix}`)), 60_000);
    const onData = (chunk) => {
      for (const line of String(chunk).split(/\r?\n/u)) {
        if (line.trim() === "") continue;
        lines.push(line);
        if (line.startsWith(prefix)) {
          clearTimeout(timer);
          child.stdout.off("data", onData);
          done(line);
        }
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", (chunk) => lines.push(`STDERR ${String(chunk).trim()}`));
    child.on("error", fail);
  });

await waitFor("READY");

/* ARM 1 — the OLD semantics: observe the shared root. */
const sharedBefore = count(SHARED);
/* ARM 2 — the NEW semantics: observe the private root. */
const privateBefore = count(privateGateRoot);

/** The external, legitimate allocation. Both observations are taken AFTER it, so the interference is present. */
child.stdin.write("alloc\n");
await waitFor("ALLOCATED ");

const sharedAfter = count(SHARED);
const privateAfter = count(privateGateRoot);

/** ARM 1: the original assertion is `after === before` against the SHARED root. It fails. */
const oldSemanticsWouldPass = sharedAfter === sharedBefore;
/** ARM 2: the corrected assertion is `after === before` against the PRIVATE root. It passes. */
const newSemanticsWouldPass = privateAfter === privateBefore;
/** ARM 3: the interference really happened, proven from the same process. */
const interferenceOccurred = sharedAfter !== sharedBefore;

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

const sharedFinal = entrySet(SHARED);
const restored = sharedFinal.length === sharedBaseline.length && sharedFinal.every((entry, index) => entry === sharedBaseline[index]);

const report = {
  schemaVersion: 1,
  kind: "HOST_S1RAE4_ISOLATION_NEGATIVE_CONTROL",
  stage: "Palimpsest Host-S1RA-E4",
  measuredAt: new Date().toISOString(),
  question: "does the corrected observation pass BECAUSE the interference is handled, or merely because nothing interfered?",
  sharedGateRoot: SHARED,
  privateGateRoot: privateGateRoot.replace(/\\/gu, "/"),
  arms: {
    arm1_oldSemanticsSharedRoot: {
      before: sharedBefore,
      after: sharedAfter,
      delta: sharedAfter - sharedBefore,
      assertionWouldPass: oldSemanticsWouldPass,
      verdict: oldSemanticsWouldPass ? "UNEXPECTEDLY PASSED — the interference did not occur" : "FAILS AS ORIGINALLY OBSERVED",
    },
    arm2_newSemanticsPrivateRoot: {
      before: privateBefore,
      after: privateAfter,
      delta: privateAfter - privateBefore,
      assertionWouldPass: newSemanticsWouldPass,
      verdict: newSemanticsWouldPass ? "PASSES: the private root is not moved by external work" : "FAILED — the private root moved, so the correction is incomplete",
    },
    arm3_interferenceIsReal: {
      sharedMoved: interferenceOccurred,
      detail: interferenceOccurred
        ? "the shared root moved during arm 2's window, so arm 2 passed while genuine interference was present"
        : "the shared root did not move, so arm 2's pass proves nothing about interference",
    },
  },
  mutator: { mechanism: "separate node process using the real allocateOwnedRoot and safeCleanup", lines, disposal },
  sharedGateRootRestored: restored,
  sharedGateRootEntriesBefore: sharedBaseline.length,
  sharedGateRootEntriesAfter: sharedFinal.length,
  verdict:
    !oldSemanticsWouldPass && newSemanticsWouldPass && interferenceOccurred
      ? "NEGATIVE CONTROL HOLDS: the old observation fails under real interference, the new observation passes under the same interference, and the interference was independently shown to be present"
      : "NEGATIVE CONTROL DOES NOT HOLD",
};

/** Remove the private sandbox this script created. It is ours; nothing else writes there. */
try {
  const { rmSync } = await import("node:fs");
  rmSync(sandbox, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  report.privateSandboxRemoved = true;
} catch (error) {
  report.privateSandboxRemoved = false;
  report.privateSandboxRemovalError = String(error?.message ?? error);
}

const jsonPath = args.get("json");
if (jsonPath !== undefined) writeFileSync(resolve(jsonPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(report.verdict.startsWith("NEGATIVE CONTROL HOLDS") && restored ? 0 : 1);
