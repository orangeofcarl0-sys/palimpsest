import { existsSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { makeLocalAssetCheckpoints } from "../src/project_workspace/local_checkpoints.js";

function fixture(check: (paths: { root: string; file: string; draft: string; databasePath: string }) => void) {
  const root = mkdtempSync(join(tmpdir(), "local-asset-checkpoints-"));
  const file = "review.xlsx";
  const draft = join(root, file);
  try { check({ root, file, draft, databasePath: join(root, "state.sqlite") }); }
  finally {
    expect(dirname(realpathSync(root))).toBe(realpathSync(tmpdir()));
    rmSync(root, { recursive: true, force: true });
  }
}

describe("local asset checkpoints", () => {
  it("reopens exact bytes, preserves older versions, and deduplicates replay", () => fixture(({ root, file, draft, databasePath }) => {
    const options = { root, paths: [file], databasePath };
    const basis = () => ({ revision: 1, digest: "test-basis" });
    const store = makeLocalAssetCheckpoints(options, "fixture", basis);
    const original = Buffer.from([0x50, 0x4b, 0x01, 0xff]);
    writeFileSync(draft, original);
    const saved = store.save(file);
    expect(store.save(file)).toEqual(saved);
    writeFileSync(draft, Buffer.from([0x50, 0x4b, 0x02]));
    const newer = store.save(file);
    renameSync(draft, join(root, "stopped.xlsx"));
    const reopened = makeLocalAssetCheckpoints(options, "fixture", basis);
    expect(reopened.latest(file)).toEqual(newer);
    expect(reopened.restore(file, saved.id)).toEqual(saved);
    expect(readFileSync(draft)).toEqual(original);
    expect(reopened.save(file)).toEqual(saved);
    expect(reopened.latest(file)).toEqual(saved);
  }));

  it("refuses overwrites, unrelated scope, stale bases and corrupt checkpoint content", () => fixture(({ root, file, draft, databasePath }) => {
    const options = { root, paths: [file], databasePath };
    let revision = 1;
    const basis = () => ({ revision, digest: "test-basis-" + revision });
    const store = makeLocalAssetCheckpoints(options, "fixture", basis);
    writeFileSync(draft, "accepted bytes in a draft");
    const saved = store.save(file);
    writeFileSync(draft, "new local edit");
    expect(() => store.restore(file, saved.id)).toThrow("different bytes");
    expect(readFileSync(draft, "utf8")).toBe("new local edit");
    expect(() => store.restore("../review.xlsx", saved.id)).toThrow("outside the configured");
    expect(() => makeLocalAssetCheckpoints(options, "other-project", basis).restore(file, saved.id)).toThrow("unavailable");
    renameSync(draft, join(root, "stopped.xlsx"));
    revision = 2;
    expect(() => store.restore(file, saved.id)).toThrow("project basis");
    revision = 1;
    const database = new DatabaseSync(databasePath);
    try {
      database.prepare("UPDATE local_asset_versions SET bytes=? WHERE id=?").run(Buffer.from("corrupted"), saved.id);
    } finally { database.close(); }
    expect(() => store.restore(file, saved.id)).toThrow("checkpoint bytes");
    expect(existsSync(draft)).toBe(false);
    writeFileSync(draft, "accepted bytes in a draft");
    expect(() => store.save(file)).toThrow("stored checkpoint content");
  }));
});
