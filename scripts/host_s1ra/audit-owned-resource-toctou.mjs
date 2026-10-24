/**
 * Host-S1RA-E2 §4B — TOCTOU probe for the owned-resource deletion path.
 *
 * THE QUESTION. `attemptReclaim()` calls `revalidateOwnership(owned)` and then, in a SEPARATE call,
 * `rmSync(owned.root, { recursive: true })`. Between those two statements the path could be replaced. This probe
 * measures whether such a replacement is reachable, using a test-owned tree only.
 *
 * WHAT THIS IS NOT. It is not an exploit against the product. It is a bounded measurement of whether the gap is
 * theoretical or observable, so the report can say which.
 */
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const nl = String.fromCharCode(10);
const REPO = "F:/Codex_Work_Space/Palimpsest/palimpsest-sr1";
const resource = await import(pathToFileURL(`${REPO}/scripts/trajectory_p2b/owned-resource.mjs`).href);

const results = [];

/* ---------------------------------------------------------------- 1. baseline ownership */
{
  const gate = mkdtempSync("F:\\s1rae2-toc-");
  const owned = resource.allocateOwnedRoot(gate, "p2b-toc-");
  const proof = resource.revalidateOwnership(owned);
  results.push({
    arm: "1-baseline",
    description: "an untouched allocated root",
    owned: proof.owned,
    checks: proof.checks.map((c) => `${c.check}:${c.passed ? "PASS" : "FAIL"}`),
    note: proof.owned === true ? "the ordinary case is admitted" : "UNEXPECTED: the ordinary case was refused",
  });
  rmSync(gate, { recursive: true, force: true });
}

/* ---------------------------------------------------------------- 2. replacement BETWEEN proof and delete */
{
  const gate = mkdtempSync("F:\\s1rae2-toc-");
  const owned = resource.allocateOwnedRoot(gate, "p2b-toc-");
  const FOREIGN = join(gate, "foreign-payload");
  mkdirSync(FOREIGN, { recursive: true });
  writeFileSync(join(FOREIGN, "must-survive.txt"), "FOREIGN" + nl, "utf8");

  /**
   * THE GAP. Prove ownership of the ORIGINAL root, then — before deleting — move the original aside and put the
   * foreign directory at the same pathname. This is exactly what a concurrent process could do in the window
   * between the two statements, performed here deterministically so the outcome is not a race.
   */
  const proof = resource.revalidateOwnership(owned);
  renameSync(owned.root, owned.root + "-moved-aside");
  renameSync(FOREIGN, owned.root);

  let deleted = null;
  try {
    rmSync(owned.root, { recursive: true, force: true });
    deleted = true;
  } catch (error) {
    deleted = String(error?.code ?? error);
  }

  results.push({
    arm: "2-swap-after-proof",
    description: "the path is replaced AFTER revalidateOwnership returned, BEFORE rmSync",
    proofOwnedOriginal: proof.owned,
    foreignSurvived: existsSync(join(owned.root, "must-survive.txt")),
    rmSyncSucceeded: deleted === true,
    observation:
      deleted === true && !existsSync(join(owned.root, "must-survive.txt"))
        ? "TOCTOU_WINDOW_IS_REAL: a directory swapped in after the proof was deleted"
        : "the swap did not lead to deletion in this arm",
    note: "the helper does not hold a handle across the check and the delete, so the two are not atomic",
  });
  rmSync(gate, { recursive: true, force: true });
}

/* ---------------------------------------------------------------- 3. marker absent */
{
  const gate = mkdtempSync("F:\\s1rae2-toc-");
  const owned = resource.allocateOwnedRoot(gate, "p2b-toc-");
  rmSync(join(owned.root, ".palimpsest-owned.json"), { force: true });
  const proof = resource.revalidateOwnership(owned);
  results.push({
    arm: "3-marker-removed",
    description: "the ownership marker is deleted before revalidation",
    owned: proof.owned,
    markerCheck: proof.checks.find((c) => c.check === "marker"),
    finding:
      proof.owned === true
        ? "A MISSING MARKER IS TREATED AS A PASS. The record falls back to the captured identity, so a root whose marker was removed is still deletable."
        : "refused",
  });
  rmSync(gate, { recursive: true, force: true });
}

/* ---------------------------------------------------------------- 4. marker naming another root */
{
  const gate = mkdtempSync("F:\\s1rae2-toc-");
  const owned = resource.allocateOwnedRoot(gate, "p2b-toc-");
  writeFileSync(
    join(owned.root, ".palimpsest-owned.json"),
    JSON.stringify({ schemaVersion: 1, runId: owned.runId, pid: process.pid, createdAt: new Date().toISOString(), ownedRoot: join(gate, "somewhere-else").replace(/\\/g, "/"), gateRoot: gate.replace(/\\/g, "/"), active: true }, null, 2),
    "utf8",
  );
  const proof = resource.revalidateOwnership(owned);
  results.push({
    arm: "4-marker-names-another-root",
    description: "the marker's runId matches but its ownedRoot names a different directory",
    owned: proof.owned,
    finding:
      proof.owned === true
        ? "ACCEPTED: revalidateOwnership checks only runId, so a marker that names a DIFFERENT root still passes. The reaper checks ownedRoot; this path does not."
        : "refused",
  });
  rmSync(gate, { recursive: true, force: true });
}

/* ---------------------------------------------------------------- 5. weak inode on this platform */
{
  const gate = mkdtempSync("F:\\s1rae2-toc-");
  const owned = resource.allocateOwnedRoot(gate, "p2b-toc-");
  const proof = resource.revalidateOwnership(owned);
  const identityCheck = proof.checks.find((c) => c.check === "identityMatch");
  results.push({
    arm: "5-identity-strength",
    description: "how strong the identity comparison actually is here",
    detail: identityCheck?.detail,
    inoUsable: owned.identity?.inoUsable,
    finding:
      identityCheck?.detail?.startsWith("WEAK") === true
        ? "WEAK: the platform supplies no usable inode, so identity is object-kind-at-same-path only. A replacement by a directory of the same kind is indistinguishable."
        : "dev/ino are usable and compared",
  });
  rmSync(gate, { recursive: true, force: true });
}

process.stdout.write(JSON.stringify({ schemaVersion: 1, kind: "HOST_S1RA_E2_OWNED_RESOURCE_TOCTOU", arms: results }, null, 2) + nl);
