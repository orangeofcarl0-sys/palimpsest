/**
 * C6-R1 — the scenario time and visibility contract.
 *
 * These are the two failures that made COG-6's scenario not runnable as frozen:
 *   · the whole inbox was visible before the Principal began;
 *   · the visible set was never verified or recorded.
 *
 * The tests pin the rule mechanically: T1 shows exactly three events, T2 releases exactly two more,
 * every copy is digest-verified, a future leak is detected rather than assumed absent, and the frozen
 * fixture is never modified.
 */
import { describe, expect, it } from "vitest";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  auditStaging,
  findFutureLeaks,
  materializeInboxAsOf,
  readArrivals,
  readStagedArrivals,
  releaseInboxAsOf,
  T1,
  T2,
  treeDigest,
  visibleArrivals,
  visibleSetDigest,
} from "../scripts/c6r/staging.mjs";

const INBOX = join(import.meta.dirname, "..", "scripts", "cog6", "scenario", "inbox");

const A = "0e997cbcc04ac1ee4c9b8d2985e2dd97443136d0f57b838f01d25de2403f920c";
const B = "14ffdd6525d292f33e86f568d9ecfd8fc5dfe47019e1bfaa76bb055ffc07bc91";

function temp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `palimpsest-c6r-${prefix}-`));
}

function fixture(): string {
  const dir = temp("fixture");
  cpSync(INBOX, dir, { recursive: true });
  return dir;
}

function rewriteArrivals(source: string, records: readonly unknown[]): void {
  writeFileSync(join(source, "arrivals.jsonl"), `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8");
}

function records(): Record<string, unknown>[] {
  return readFileSync(join(INBOX, "arrivals.jsonl"), "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function allStagedText(destination: string): string {
  const text: string[] = [];
  const stack = [""];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    const absolute = current === "" ? destination : join(destination, ...current.split("/"));
    for (const entry of readdirSync(absolute)) {
      const child = current === "" ? entry : `${current}/${entry}`;
      const childAbsolute = join(absolute, entry);
      if (statSync(childAbsolute).isDirectory()) {
        stack.push(child);
      } else {
        text.push(readFileSync(childAbsolute, "utf8"));
      }
    }
  }
  return text.join("\n");
}

describe("C6-R1 T1/T2 scenario visibility", () => {
  it("T1 materializes exactly the three events that had arrived", () => {
    const destination = temp("t1");
    const record = materializeInboxAsOf({ source: INBOX, observationTime: T1, destination });
    expect(record.visibleEvents.map((event: { item: string }) => event.item)).toEqual([
      "2026-02-08/solaris-certificate-claim.md",
      "2026-02-10/vendor-capabilities.csv",
      "2026-02-10/newsletter.md",
    ]);
    expect(record.visibleSetDigest).toBe(visibleSetDigest(record.visibleEvents));
    expect(existsSync(join(destination, "2026-02-14"))).toBe(false);
    expect(readStagedArrivals(destination)).toHaveLength(3);
    expect(readFileSync(join(destination, "2026-02-10", "vendor-capabilities.csv")).length).toBeGreaterThan(0);
  });

  it("T1 contains no Candidate B content, digest, filename or arrival record", () => {
    const destination = temp("t1-leak");
    materializeInboxAsOf({ source: INBOX, observationTime: T1, destination });
    const text = allStagedText(destination);
    expect(text).not.toContain("2026-02-14");
    expect(text).not.toContain(B);
    expect(text).not.toContain("vendor-capabilities-corrected");
    expect(text).not.toContain("candidate-corrected");
    expect(text).not.toContain("duplicate");
    const files = auditStaging(destination, INBOX, T1);
    expect(files.missing).toEqual([]);
    expect(files.unexpected).toEqual([]);
    expect(files.leaks).toEqual([]);
  });

  it("T1 is idempotent in content and refuses a non-empty destination", () => {
    const destination = temp("t1-idempotent");
    const first = materializeInboxAsOf({ source: INBOX, observationTime: T1, destination });
    expect(() => materializeInboxAsOf({ source: INBOX, observationTime: T1, destination })).toThrow(/destination_not_empty/);
    expect(treeDigest(destination)).toBe(first.treeDigest);
  });

  it("T2 releases exactly the two later events and preserves the T1 bytes", () => {
    const destination = temp("t2");
    const first = materializeInboxAsOf({ source: INBOX, observationTime: T1, destination });
    const before = {
      certificate: readFileSync(join(destination, "2026-02-08", "solaris-certificate-claim.md")),
      capabilities: readFileSync(join(destination, "2026-02-10", "vendor-capabilities.csv")),
      newsletter: readFileSync(join(destination, "2026-02-10", "newsletter.md")),
    };
    const release = releaseInboxAsOf({
      source: INBOX,
      observationTime: T2,
      destination,
      releasedAt: "2026-11-02T09:30:00.000Z",
    });
    expect(release.newlyVisible.map((event: { item: string }) => event.item)).toEqual([
      "2026-02-14/vendor-capabilities-corrected.csv",
      "2026-02-14/vendor-capabilities.csv",
    ]);
    expect(release.visibleEvents).toHaveLength(5);
    expect(release.previouslyVisibleSetDigest).toBe(first.visibleSetDigest);
    expect(release.visibleSetDigest).not.toBe(first.visibleSetDigest);
    expect(release.releasedAt).toBe("2026-11-02T09:30:00.000Z");
    expect(readFileSync(join(destination, "2026-02-08", "solaris-certificate-claim.md"))).toEqual(before.certificate);
    expect(readFileSync(join(destination, "2026-02-10", "vendor-capabilities.csv"))).toEqual(before.capabilities);
    expect(readFileSync(join(destination, "2026-02-10", "newsletter.md"))).toEqual(before.newsletter);
    expect(readFileSync(join(destination, "2026-02-14", "vendor-capabilities-corrected.csv")).length).toBe(196);
    expect(readFileSync(join(destination, "2026-02-14", "vendor-capabilities.csv")).length).toBe(195);
    expect(readStagedArrivals(destination)).toHaveLength(5);
    expect(auditStaging(destination, INBOX, T2).leaks).toEqual([]);
  });

  it("T2 does not accept Candidate B into the canonical source", () => {
    const destination = temp("t2-unaccepted");
    materializeInboxAsOf({ source: INBOX, observationTime: T1, destination });
    releaseInboxAsOf({ source: INBOX, observationTime: T2, destination, releasedAt: "2026-11-02T09:30:00.000Z" });
    const staged = readStagedArrivals(destination);
    const candidateB = staged.find((event: { item: string }) => event.item === "2026-02-14/vendor-capabilities-corrected.csv");
    expect(candidateB?.status).toBe("UNACCEPTED");
    expect(candidateB?.sha256).toBe(B);
    // The canonical capability file in the staged inbox is still the February 10 bulletin.
    expect(readFileSync(join(destination, "2026-02-10", "vendor-capabilities.csv")).toString()).not.toBe(
      readFileSync(join(destination, "2026-02-14", "vendor-capabilities-corrected.csv")).toString(),
    );
  });

  it("detects a future event that was injected after staging", () => {
    const destination = temp("leak");
    materializeInboxAsOf({ source: INBOX, observationTime: T1, destination });
    const future = join(destination, "2026-02-14");
    cpSync(join(INBOX, "2026-02-14"), future, { recursive: true });
    const audit = auditStaging(destination, INBOX, T1);
    expect(audit.leaks.length).toBeGreaterThan(0);
    expect(audit.leaks.some((leak: { path: string }) => leak.path.includes("vendor-capabilities-corrected.csv"))).toBe(true);
    expect(findFutureLeaks(destination, readArrivals(INBOX), T1).length).toBeGreaterThan(0);
  });

  it("never modifies the frozen source fixture", () => {
    const before = treeDigest(INBOX);
    const destination = temp("immutable");
    materializeInboxAsOf({ source: INBOX, observationTime: T1, destination });
    releaseInboxAsOf({ source: INBOX, observationTime: T2, destination, releasedAt: "2026-11-02T09:30:00.000Z" });
    expect(treeDigest(INBOX)).toBe(before);
    expect(readArrivals(INBOX)).toHaveLength(5);
  });

  it("refuses a destination inside the source fixture", () => {
    expect(() =>
      materializeInboxAsOf({ source: INBOX, observationTime: T1, destination: join(INBOX, "staged") }),
    ).toThrow(/destination_inside_source/);
  });

  it("refuses a release without a materialized inbox", () => {
    const destination = temp("not-materialized");
    expect(() =>
      releaseInboxAsOf({ source: INBOX, observationTime: T2, destination, releasedAt: "2026-11-02T09:30:00.000Z" }),
    ).toThrow(/not_materialized/);
  });

  it("refuses an observation time that moves backwards", () => {
    const destination = temp("backwards");
    materializeInboxAsOf({ source: INBOX, observationTime: T2, destination });
    expect(() =>
      releaseInboxAsOf({ source: INBOX, observationTime: T1, destination, releasedAt: "2026-11-02T09:30:00.000Z" }),
    ).toThrow(/observation_time_not_monotonic/);
  });

  it("rejects a duplicate arrival identity", () => {
    const source = fixture();
    try {
      const base = records();
      rewriteArrivals(source, [...base, base[1]]);
      expect(() => readArrivals(source)).toThrow(/duplicate_arrival_item/);
    } finally {
      rmSync(source, { recursive: true, force: true });
    }
  });

  it("rejects one item recorded with two different digests", () => {
    const source = fixture();
    try {
      const base = records();
      rewriteArrivals(source, [...base, { ...(base[1] as Record<string, unknown>), sha256: B }]);
      expect(() => readArrivals(source)).toThrow(/inconsistent_arrival_identity/);
    } finally {
      rmSync(source, { recursive: true, force: true });
    }
  });

  it("rejects an arrival whose content is missing", () => {
    const source = fixture();
    try {
      rmSync(join(source, "2026-02-10", "newsletter.md"));
      expect(() => readArrivals(source)).toThrow(/arrival_content_missing/);
    } finally {
      rmSync(source, { recursive: true, force: true });
    }
  });

  it("rejects an arrival whose content does not match its recorded digest", () => {
    const source = fixture();
    try {
      const base = records();
      const changed = { ...(base[1] as Record<string, unknown>), sha256: B };
      rewriteArrivals(source, [base[0], changed, base[2], base[3], base[4]]);
      expect(() => readArrivals(source)).toThrow(/arrival_digest_mismatch/);
    } finally {
      rmSync(source, { recursive: true, force: true });
    }
  });

  it("computes the visible set from time alone, not from record order", () => {
    const base = readArrivals(INBOX);
    const shuffled = [...base].reverse();
    expect(visibleArrivals(shuffled, T1).map((event: { item: string }) => event.item)).toEqual(
      visibleArrivals(base, T1).map((event: { item: string }) => event.item),
    );
    expect(visibleSetDigest(visibleArrivals(shuffled, T1))).toBe(visibleSetDigest(visibleArrivals(base, T1)));
  });
});
