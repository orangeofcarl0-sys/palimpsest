import { createHash, randomUUID } from "node:crypto";
import { closeSync, fstatSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { canonicalDigest } from "../schema/canonical.js";
import { pwFail } from "./association.js";

/** Trusted configuration. Each entry names one plain file in the draft directory. */
export interface LocalAssetCheckpointOptions {
  readonly root: string;
  readonly paths: readonly string[];
  readonly databasePath: string;
}

interface CheckpointBasis {
  readonly revision: number;
  readonly digest: string;
}

interface LocalAssetCheckpoint {
  readonly id: string;
  readonly projectId: string;
  readonly path: string;
  readonly basis: CheckpointBasis;
  readonly digest: string;
  readonly size: number;
}

export interface LocalAssetCheckpoints {
  latest(path: string): LocalAssetCheckpoint | null;
  save(path: string): LocalAssetCheckpoint;
  restore(path: string, checkpointId: string): LocalAssetCheckpoint;
}

const digestOf = (content: Uint8Array): string => createHash("sha256").update(content).digest("hex");

function statFile(path: string) {
  try {
    const stat = lstatSync(path, { bigint: true });
    if (!stat.isFile()) pwFail("invalid_value", "local asset must be a regular file");
    return stat;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function readFile(path: string): Buffer | null {
  const before = statFile(path);
  if (before === null) return null;
  const handle = openSync(path, "r");
  try {
    const opened = fstatSync(handle, { bigint: true });
    if (!opened.isFile() || before.dev !== opened.dev || before.ino !== opened.ino) {
      pwFail("basis_mismatch", "local asset changed before it could be read");
    }
    const bytes = readFileSync(handle);
    const after = statFile(path);
    if (after === null || opened.dev !== after.dev || opened.ino !== after.ino ||
        opened.size !== after.size || opened.mtimeNs !== after.mtimeNs || opened.ctimeNs !== after.ctimeNs ||
        BigInt(bytes.length) !== after.size) {
      pwFail("basis_mismatch", "local asset changed while being read");
    }
    return bytes;
  } finally {
    closeSync(handle);
  }
}

/** Store the bytes and the latest pointer together. A draft never advances the accepted project basis. */
export function makeLocalAssetCheckpoints(
  options: LocalAssetCheckpointOptions,
  projectId: string,
  basis: () => CheckpointBasis,
): LocalAssetCheckpoints {
  const { root, databasePath } = options;
  const allowed = new Set(options.paths);
  if (!isAbsolute(root) || allowed.size === 0 || allowed.size !== options.paths.length ||
      [...allowed].some((path) => !path || path === "." || path === ".." || basename(path) !== path ||
        /[\\/:*?"<>|\x00-\x1f]|[. ]$/u.test(path))) {
    pwFail("invalid_registration", "local asset checkpoints require an absolute draft root and distinct plain file names");
  }

  function file(path: string): string {
    if (!allowed.has(path)) pwFail("invalid_registration", "local asset is outside the configured draft scope");
    if (!lstatSync(root).isDirectory()) pwFail("invalid_registration", "local draft root must be a directory");
    return join(realpathSync(root), path);
  }

  function withDatabase<T>(operation: (db: DatabaseSync) => T): T {
    mkdirSync(dirname(databasePath), { recursive: true });
    const db = new DatabaseSync(databasePath);
    try {
      db.exec(`
        PRAGMA busy_timeout=3000;
        CREATE TABLE IF NOT EXISTS local_asset_versions (
          id TEXT PRIMARY KEY, project_id TEXT NOT NULL, path TEXT NOT NULL, manifest TEXT NOT NULL, bytes BLOB NOT NULL
        );
        CREATE TABLE IF NOT EXISTS local_asset_latest (
          project_id TEXT NOT NULL, path TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY (project_id, path),
          FOREIGN KEY (id) REFERENCES local_asset_versions (id)
        );
      `);
      return operation(db);
    } finally {
      db.close();
    }
  }

  function snapshot(path: string, current: CheckpointBasis, bytes: Uint8Array): LocalAssetCheckpoint {
    const manifest = { projectId, path, basis: current, digest: digestOf(bytes), size: bytes.length };
    return { id: `lac-${canonicalDigest({ domain: "palimpsest.local-asset-checkpoint.v1", ...manifest })}`, ...manifest };
  }

  return {
    latest(path) {
      if (!allowed.has(path)) pwFail("invalid_registration", "local asset is outside the configured draft scope");
      basis();
      return withDatabase((db) => {
        const row = db.prepare(`SELECT v.manifest FROM local_asset_latest h JOIN local_asset_versions v ON v.id=h.id
          WHERE h.project_id=? AND h.path=?`).get(projectId, path);
        return row === undefined ? null : JSON.parse(String(row.manifest)) as LocalAssetCheckpoint;
      });
    },
    save(path) {
      const target = file(path);
      const current = basis();
      const bytes = readFile(target);
      if (bytes === null) pwFail("invalid_value", "local draft file is missing");
      const checkpoint = snapshot(path, current, bytes);
      return withDatabase((db) => {
        db.exec("BEGIN IMMEDIATE");
        try {
          if (basis().digest !== current.digest || !readFile(target)?.equals(bytes)) {
            pwFail("basis_mismatch", "project basis or local draft changed before checkpoint publication");
          }
          const manifest = JSON.stringify(checkpoint);
          const insert = db.prepare("INSERT OR IGNORE INTO local_asset_versions VALUES (?, ?, ?, ?, ?)")
            .run(checkpoint.id, projectId, path, manifest, bytes);
          if (insert.changes === 0) {
            const recorded = db.prepare("SELECT manifest,bytes FROM local_asset_versions WHERE id=?").get(checkpoint.id);
            if (recorded?.manifest !== manifest || !(recorded.bytes instanceof Uint8Array) || !bytes.equals(recorded.bytes)) {
              pwFail("malformed_record", "stored checkpoint content differs from the saved version");
            }
          }
          db.prepare(`INSERT INTO local_asset_latest VALUES (?, ?, ?)
            ON CONFLICT (project_id, path) DO UPDATE SET id=excluded.id`).run(projectId, path, checkpoint.id);
          db.exec("COMMIT");
          return checkpoint;
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      });
    },
    restore(path, checkpointId) {
      const target = file(path);
      const current = basis();
      return withDatabase((db) => {
        const row = db.prepare("SELECT manifest,bytes FROM local_asset_versions WHERE id=? AND project_id=? AND path=?")
          .get(checkpointId, projectId, path);
        if (row === undefined || !(row.bytes instanceof Uint8Array)) pwFail("invalid_registration", "local asset checkpoint is unavailable in this scope");
        const checkpoint = snapshot(path, current, row.bytes);
        if (checkpoint.id !== checkpointId || JSON.stringify(checkpoint) !== row.manifest) {
          pwFail("basis_mismatch", "checkpoint bytes or project basis differ from the recorded version");
        }
        const existing = readFile(target);
        if (existing !== null) {
          if (!existing.equals(row.bytes)) pwFail("basis_mismatch", "local draft already exists with different bytes");
          return checkpoint;
        }
        const temporary = join(dirname(target), `.checkpoint-${randomUUID()}.tmp`);
        writeFileSync(temporary, row.bytes, { flag: "wx", flush: true });
        try {
          if (basis().digest !== current.digest) pwFail("basis_mismatch", "project basis changed during restore");
          // Publish a fully written file. A competing writer keeps its file if the target appeared.
          linkSync(temporary, target);
        } finally {
          unlinkSync(temporary);
        }
        return checkpoint;
      });
    },
  };
}
