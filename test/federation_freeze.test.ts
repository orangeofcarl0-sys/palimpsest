/**
 * PAL-FED-0 Ordarium freeze proof (§55) — EXPERIMENTAL.
 *
 * PAL-FED-0 must run on the pinned released 1.3.1 artifacts, not a live
 * Ordarium HEAD. This probe asserts the exact package versions, host-contract
 * generation 1 and the availability of the StateChangeFeed primitive the
 * inbox depends on — through public APIs only.
 */

import { readFileSync } from "node:fs";

import {
  HOST_CONTRACT_VERSION,
  assertHostContract,
  createStateStore,
  supportsStateChangeFeed,
  type JsonObject,
} from "@ordarium/core";
import { assertHostContract as assertHostContractFromKit } from "@ordarium/host-kit";
import { SqliteLedger } from "@ordarium/ledger-sqlite";
import { describe, expect, it } from "vitest";

const PACKAGES = ["core", "host-kit", "ledger-sqlite", "testing"] as const;

function installedVersion(pkg: (typeof PACKAGES)[number]): string {
  const path = new URL(`../node_modules/@ordarium/${pkg}/package.json`, import.meta.url);
  return (JSON.parse(readFileSync(path, "utf8")) as { version: string }).version;
}

describe("Ordarium freeze proof (§55)", () => {
  it("pins the released 1.3.1 packages, not a workspace HEAD", () => {
    for (const pkg of PACKAGES) {
      expect(installedVersion(pkg), `@ordarium/${pkg}`).toBe("1.3.1");
    }
  });

  it("asserts HOST_CONTRACT_VERSION = 1, fail-closed", () => {
    expect(HOST_CONTRACT_VERSION).toBe(1);
    expect(assertHostContract(1)).toBeUndefined();
    expect(assertHostContractFromKit(1)).toBeUndefined();
    expect(() => assertHostContract(2)).toThrow();
  });

  it("offers the state change feed capability through the public surface", async () => {
    const ledger = new SqliteLedger(":memory:");
    try {
      expect(ledger.capabilities.stateChangeFeed).toBe(true);
      expect(ledger.capabilities.stateRevisions).toBe(true);
      expect(supportsStateChangeFeed(ledger)).toBe(true);
      const state = createStateStore({ ledger });
      const identity = { source: "pal-fed-probe", scope: "freeze", callId: "probe-1" };
      await state.write({
        namespace: "probe.ns",
        key: "a",
        expectedRevision: 0,
        value: { n: 1 } as JsonObject,
        identity,
      });
      await state.write({
        namespace: "probe.ns",
        key: "b",
        expectedRevision: 0,
        value: { n: 2 } as JsonObject,
        identity,
      });
      const page = await state.changes({ namespace: "probe.ns" });
      expect(page.changes.map((record) => record.key)).toEqual(["a", "b"]);
      expect(typeof page.cursor).toBe("string");
      expect(page.hasMore).toBe(false);
      // Resuming after the returned cursor observes no already-delivered change.
      const resumed = await state.changes({ namespace: "probe.ns" }, page.cursor);
      expect(resumed.changes).toHaveLength(0);
    } finally {
      await ledger.close?.();
    }
  });
});
