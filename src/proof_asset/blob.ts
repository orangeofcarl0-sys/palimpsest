/**
 * G10-T Proof/Evidence plane — local content-addressed blob vault.
 *
 *   VaultBlob ≠ SemanticClaim
 *
 * `localProofBlobStore(root)` stores bytes under their lowercase sha256 content
 * address. Writes are idempotent: re-putting identical bytes is a no-op, and a
 * path whose stored bytes do NOT hash to its name is refused (`digest_mismatch`).
 *
 * Honest security posture: this is a LOCAL content-addressed store. On platforms
 * that honor POSIX modes we attempt `0700` directories and `0600` files; where
 * the platform ignores modes (e.g. Windows) the attempt is simply recorded as
 * best-effort. There is NO encryption-at-rest claim, no key management, no
 * credential/VC/DID/ZK machinery. Opaque to the semantic plane: callers get a
 * content digest, never a semantic claim.
 */

import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const PROOF_BLOB_DIR_MODE = 0o700;
export const PROOF_BLOB_FILE_MODE = 0o600;

export class ProofBlobError extends Error {
  constructor(
    readonly kind: "invalid_digest" | "digest_mismatch" | "io_error",
    message: string,
  ) {
    super(message);
    this.name = "ProofBlobError";
  }
}

export interface LocalProofBlobStore {
  put(bytes: Uint8Array): Promise<{ readonly contentDigest: string }>;
  get(contentDigest: string): Promise<Uint8Array | undefined>;
  close?(): void;
}

/** Lowercase sha256 hex over raw bytes (bytes never decoded as text here). */
export function proofContentDigestOfBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

/** The canonical default blob vault root: $DSH_HOME/palimpsest/proof-vault/blobs. */
export function defaultProofBlobRoot(): string {
  const configured = process.env.DSH_HOME?.trim();
  const dshHome = configured === undefined || configured.length === 0 ? join(homedir(), ".dsh") : configured;
  return join(dshHome, "palimpsest", "proof-vault", "blobs");
}

function blobPathOf(root: string, contentDigest: string): string {
  return join(root, contentDigest.slice(0, 2), contentDigest);
}

function ensureDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: PROOF_BLOB_DIR_MODE });
  try {
    chmodSync(path, PROOF_BLOB_DIR_MODE);
  } catch {
    // Platform does not honor POSIX modes — best-effort only, no encryption claim.
  }
}

export function localProofBlobStore(root: string = defaultProofBlobRoot()): LocalProofBlobStore {
  function readVerified(contentDigest: string): Uint8Array | undefined {
    const path = blobPathOf(root, contentDigest);
    if (!existsSync(path)) return undefined;
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(readFileSync(path));
    } catch (error) {
      throw new ProofBlobError("io_error", `failed to read blob "${contentDigest}": ${error instanceof Error ? error.message : String(error)}`);
    }
    if (proofContentDigestOfBytes(bytes) !== contentDigest) {
      // Fail closed: a path whose bytes do not hash to its name is never returned.
      throw new ProofBlobError("digest_mismatch", `blob "${contentDigest}" does not hash to its content address`);
    }
    return bytes;
  }

  return Object.freeze({
    async put(bytes: Uint8Array): Promise<{ readonly contentDigest: string }> {
      if (!(bytes instanceof Uint8Array)) {
        throw new ProofBlobError("io_error", "blob bytes must be a Uint8Array");
      }
      const contentDigest = proofContentDigestOfBytes(bytes);
      ensureDirectory(join(root, contentDigest.slice(0, 2)));
      const path = blobPathOf(root, contentDigest);
      if (existsSync(path)) {
        readVerified(contentDigest);
        return Object.freeze({ contentDigest });
      }
      try {
        writeFileSync(path, bytes, { mode: PROOF_BLOB_FILE_MODE, flag: "wx" });
        try {
          chmodSync(path, PROOF_BLOB_FILE_MODE);
        } catch {
          // Best-effort mode only; no encryption-at-rest is claimed.
        }
      } catch (error) {
        if (existsSync(path)) {
          // Lost a benign write race; the existing content must still match.
          readVerified(contentDigest);
          return Object.freeze({ contentDigest });
        }
        throw new ProofBlobError("io_error", `failed to write blob "${contentDigest}": ${error instanceof Error ? error.message : String(error)}`);
      }
      return Object.freeze({ contentDigest });
    },

    async get(contentDigest: string): Promise<Uint8Array | undefined> {
      if (!isDigest(contentDigest)) throw new ProofBlobError("invalid_digest", "contentDigest must be a lowercase sha256 digest");
      return readVerified(contentDigest);
    },

    close(): void {
      // No persistent handle: the content-addressed store opens files per call.
    },
  });
}
