import { spawn, type ChildProcess } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { LedgerBusyError, OrdariumError } from "@ordarium/core";
import { SqliteLedger } from "@ordarium/ledger-sqlite";
import { afterEach, describe, expect, it } from "vitest";

import {
  isLedgerBusyError,
  isTransientOperationError,
} from "../src/effects/errors.js";

// The exact configuration createPalimpsestEffects freezes into the ledger
// seam at the 1.1.0 bump (ALN-3; 07-ordarium-alignment.md §4). The tests use
// this constant rather than upstream defaults so a future default drift
// breaks here first.
const PINNED_OPEN_RETRY = { attempts: 5, delayMs: 100 } as const;

// Native v2 ledger generated on @ordarium/ledger-sqlite 1.0.0 right before
// the bump; the tests copy it and open it under 1.1.0.
const FIXTURE_LEDGER_V2 = fileURLToPath(
  new URL("../fixtures/ordarium/ledger-v2.sqlite", import.meta.url),
);

const directories: string[] = [];
const children: ChildProcess[] = [];

afterEach(async () => {
  for (const child of children.splice(0)) {
    child.kill();
  }
  // Killed holders release their file handles asynchronously; give Windows a
  // short grace period before reclaiming the temp directories.
  await wait(150);
  for (const directory of directories.splice(0)) {
    try {
      rmSync(directory, { recursive: true, force: true });
    } catch {
      // The OS reclaims the tmp directory even if a handle lingers.
    }
  }
});

function newTempDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "palimpsest-aln-"));
  directories.push(directory);
  return directory;
}

/**
 * Spawns a child process that holds the database write lock (BEGIN
 * IMMEDIATE) and releases it after `holdMs`. The parent thread blocks inside
 * the SqliteLedger constructor, so the release must happen from a separate
 * process for the retry loop to observe it.
 */
function spawnLockHolder(path: string, holdMs: number): void {
  const child = spawn(
    process.execPath,
    [
      "-e",
      `
      const { DatabaseSync } = require("node:sqlite");
      const db = new DatabaseSync(process.argv[1], { timeout: 50 });
      db.exec("BEGIN IMMEDIATE");
      db.exec("CREATE TABLE IF NOT EXISTS aln_lock_holder(x)");
      db.exec("INSERT INTO aln_lock_holder VALUES (1)");
      setTimeout(() => {
        try { db.exec("COMMIT"); } catch {}
        db.close();
        process.exit(0);
      }, ${holdMs});
      setInterval(() => {}, 50);
      `,
      path,
    ],
    { stdio: "ignore" },
  );
  child.unref();
  children.push(child);
}

/**
 * Polls until a foreign connection provably holds the database write lock: a
 * zero-busy-timeout BEGIN IMMEDIATE failing is the confirmation. A fixed
 * head start would race Node boot time, and constructing before the lock
 * exists would let the first attempt succeed without exercising the retry
 * loop at all.
 */
async function waitForWriteLock(path: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    let probe: DatabaseSync | undefined;
    try {
      probe = new DatabaseSync(path);
      probe.exec("PRAGMA busy_timeout = 0");
      probe.exec("BEGIN IMMEDIATE");
      probe.exec("COMMIT");
      probe.close();
      await wait(20);
    } catch {
      probe?.close();
      return;
    }
  }
  throw new Error("lock holder never acquired the write lock within 5s");
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Ordarium ledger seam at 1.1.0 (bump checklist)", () => {
  it("migrates a native v2 ledger on open and preserves its records", async () => {
    const path = join(newTempDirectory(), "operations.sqlite");
    copyFileSync(FIXTURE_LEDGER_V2, path);

    const ledger = new SqliteLedger(path, { openRetry: PINNED_OPEN_RETRY });
    try {
      const raw = new DatabaseSync(path);
      expect(raw.prepare("PRAGMA user_version").get()?.user_version).toBe(3);
      raw.close();
      expect((await ledger.get("fixture-proposed-0001"))?.state).toBe("proposed");
      expect((await ledger.get("fixture-succeeded-0002"))?.state).toBe("succeeded");
    } finally {
      ledger.close();
    }
  });

  it("carries a transiently locked open across the release boundary with the pinned backoff", async () => {
    const path = join(newTempDirectory(), "operations.sqlite");
    copyFileSync(FIXTURE_LEDGER_V2, path);
    spawnLockHolder(path, 300);
    await waitForWriteLock(path);

    // A small busy timeout makes every attempt surface LEDGER_BUSY, so the
    // pinned retry loop - not sqlite's busy_timeout - must carry the open
    // across the ~300ms release. The ~300ms release sits inside the pinned
    // horizon (four 100ms backoff sleeps alone), and the elapsed floor
    // proves the first attempt failed and a backoff sleep actually passed.
    const started = Date.now();
    const ledger = new SqliteLedger(path, {
      timeoutMs: 100,
      openRetry: PINNED_OPEN_RETRY,
    });
    const elapsed = Date.now() - started;
    try {
      expect(elapsed).toBeGreaterThanOrEqual(200);
      expect(elapsed).toBeLessThan(5_000);
      const raw = new DatabaseSync(path);
      expect(raw.prepare("PRAGMA user_version").get()?.user_version).toBe(3);
      raw.close();
      expect((await ledger.get("fixture-succeeded-0002"))?.state).toBe("succeeded");
    } finally {
      ledger.close();
    }
  });

  it("surfaces the busy boundary fail-fast when openRetry is attempts: 1", async () => {
    const path = join(newTempDirectory(), "operations.sqlite");
    copyFileSync(FIXTURE_LEDGER_V2, path);
    spawnLockHolder(path, 2_000);
    await waitForWriteLock(path);

    const started = Date.now();
    expect(() => new SqliteLedger(path, { timeoutMs: 100, openRetry: { attempts: 1 } }))
      .toThrowError(expect.objectContaining({ code: "LEDGER_BUSY" }));
    expect(Date.now() - started).toBeLessThan(1_500);
  });

  it("keeps the busy boundary on the LedgerBusyError classification seam", async () => {
    const path = join(newTempDirectory(), "operations.sqlite");
    copyFileSync(FIXTURE_LEDGER_V2, path);
    spawnLockHolder(path, 2_000);
    await waitForWriteLock(path);

    let thrown: unknown;
    try {
      new SqliteLedger(path, { timeoutMs: 50, openRetry: { attempts: 2, delayMs: 10 } });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(LedgerBusyError);
    expect(thrown).toBeInstanceOf(OrdariumError);
    expect(isLedgerBusyError(thrown)).toBe(true);
    // Storage contention never starts the invocation: it must stay outside
    // the transient (outcome-unresolved) classification.
    expect(isTransientOperationError(thrown)).toBe(false);
  });

  it("never retries non-busy open failures even with the pinned backoff", () => {
    const directory = newTempDirectory();

    const corruptPath = join(directory, "corrupt.sqlite");
    writeFileSync(corruptPath, "this is not a sqlite database\n".repeat(40));
    const corruptStarted = Date.now();
    expect(() => new SqliteLedger(corruptPath, { openRetry: PINNED_OPEN_RETRY }))
      .toThrowError(expect.objectContaining({ code: "LEDGER_CORRUPT" }));
    expect(Date.now() - corruptStarted).toBeLessThan(300);

    const newerPath = join(directory, "newer.sqlite");
    const raw = new DatabaseSync(newerPath);
    raw.exec("PRAGMA user_version = 99");
    raw.close();
    expect(() => new SqliteLedger(newerPath, { openRetry: PINNED_OPEN_RETRY }))
      .toThrowError(expect.objectContaining({ code: "LEDGER_NEWER_SCHEMA" }));
  });
});
