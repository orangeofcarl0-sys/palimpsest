/**
 * ============================================================================
 * TEST-ONLY FIXTURE PROCESS — an INDEPENDENT external asset library server.
 * ============================================================================
 *
 * THIS FILE IS A TEST FIXTURE, NOT PRODUCT CODE, AND NOT A SHIPPED STORE.
 *
 * It must NOT become a Personal Intellectual Asset System, a global memory, a
 * knowledge graph or an "external truth store" inside Palimpsest. It exists so
 * the G10-AE §32/§38 dogfood can drive a genuinely SEPARATE PROCESS that owns a
 * genuinely SEPARATE sqlite database: a different process, a different file, a
 * different schema, and no shared table with the Palimpsest Work ledger, the
 * association store, the journal store, the bridge store or the Ordarium ledger.
 *
 * It implements exactly the four provider capabilities the campaign declares:
 *
 *   SEARCH               ranked ephemeral hits (`/search`)
 *   INSPECT              EXACT-digest resolution with revision history (`/inspect`)
 *   MATERIALIZE_TEXT     bounded text plus its sha256 (`/materialize`)
 *   PUBLISH              idempotent by `publicationId` AND reconcilable
 *                        (`/publish`, `/reconcile`)
 *
 * CRASH WINDOW: with `mode.crashAfterWrite` set, `/publish` commits its own row
 * and then KILLS THIS PROCESS before answering, so the caller sees an uncertain
 * outcome while the external write has really landed. Recovery is the caller's
 * job: restart this process over the SAME database and reconcile by
 * `publicationId`.
 *
 * The server holds a host credential in memory (never inside Palimpsest) and
 * requires it on every request; it never echoes it back. `mode.leakCredential`
 * exists so the caller can prove that a credential-leaking provider answer is
 * refused rather than persisted.
 *
 * Usage:
 *   node test/fixtures/external_library_server.mjs <databasePath> [port]
 *
 * On startup it prints ONE JSON line:
 *   {"providerId":"...","port":12345,"token":"...","databasePath":"..."}
 * and serves until killed.
 */

import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const PROVIDER_ID = "fixture-process-library";
const PROTOCOL_DIGEST = "7".repeat(64);
const DISPLAY_NAME = "TEST-ONLY separate-process external asset library";
const PROVIDER_VERSION = "1";
/** The provider's OWN bound on text materialization (it never truncates). */
const MAX_TEXT_BYTES = 262144;
/** The host credential: in memory only, required on every call, never echoed. */
const CREDENTIAL = `fixture-process-credential-${randomBytes(6).toString("hex")}`;

const databasePath = process.argv[2];
if (databasePath === undefined || databasePath === "") {
  process.stderr.write("usage: external_library_server.mjs <databasePath> [port]\n");
  process.exit(2);
}
mkdirSync(dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath);
// Its OWN schema. There is no Palimpsest table name anywhere in this file.
database.exec(
  "CREATE TABLE IF NOT EXISTS library_assets (" +
    "asset_id TEXT NOT NULL, revision_seq INTEGER NOT NULL, revision_label TEXT, " +
    "content_digest TEXT NOT NULL, asset_type TEXT NOT NULL, title TEXT NOT NULL, summary TEXT, " +
    "body TEXT NOT NULL, media_type TEXT NOT NULL, tags_json TEXT NOT NULL, metadata_json TEXT NOT NULL, " +
    "source_locator TEXT, search_score REAL, PRIMARY KEY (asset_id, revision_seq))",
);
database.exec(
  "CREATE TABLE IF NOT EXISTS library_publications (" +
    "publication_id TEXT PRIMARY KEY, payload_digest TEXT NOT NULL, provider_definition_digest TEXT NOT NULL, " +
    "target_asset_type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, metadata_json TEXT NOT NULL, " +
    "asset_id TEXT NOT NULL, content_digest TEXT NOT NULL, revision_label TEXT NOT NULL)",
);

const mode = {
  unavailable: false,
  crashAfterWrite: false,
  leakCredential: false,
};
const counters = { search: 0, inspect: 0, materialize: 0, publish: 0, reconcile: 0 };

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Canonical JSON (keys sorted by code point, no insignificant whitespace) — the
 * SAME serialization the Palimpsest contract uses, so the stable-ref digest this
 * library returns is the caller's own `refDigest` and not a lookalike.
 */
function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function canonicalDigest(payload) {
  return sha256(canonicalJson(payload));
}

function stableRefOf(row) {
  const content = {
    schemaVersion: 1,
    providerId: PROVIDER_ID,
    assetId: row.asset_id,
    contentDigest: row.content_digest,
    ...(row.revision_label === null ? {} : { revisionLabel: row.revision_label }),
  };
  return {
    ...content,
    refDigest: canonicalDigest({ domain: "palimpsest.external-assets.stable-ref.v1", ref: content }),
  };
}

function latestRevisionOf(assetId) {
  return database
    .prepare("SELECT * FROM library_assets WHERE asset_id = ? ORDER BY revision_seq DESC LIMIT 1")
    .get(assetId);
}

function publicationOf(publicationId) {
  return database.prepare("SELECT * FROM library_publications WHERE publication_id = ?").get(publicationId);
}

function refOfPublication(row) {
  return stableRefOf({
    asset_id: row.asset_id,
    content_digest: row.content_digest,
    revision_label: row.revision_label,
  });
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 4_000_000) {
        reject(new Error("request body too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function json(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(body);
}

function unavailableError(response) {
  json(response, 503, { error: "the external library is unreachable (fault injection)" });
}

/* ------------------------------------------------------------------ *
 * The library's own operator surface (TEST-ONLY seeding + fault injection)
 * ------------------------------------------------------------------ */

function addRevision(input) {
  const previous = database
    .prepare("SELECT MAX(revision_seq) AS max_seq FROM library_assets WHERE asset_id = ?")
    .get(input.assetId);
  const revisionSeq = (previous.max_seq ?? 0) + 1;
  const contentDigest = sha256(input.body);
  database
    .prepare(
      "INSERT INTO library_assets (asset_id, revision_seq, revision_label, content_digest, asset_type, title, summary, body, media_type, tags_json, metadata_json, source_locator, search_score) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      input.assetId,
      revisionSeq,
      input.revisionLabel ?? null,
      contentDigest,
      input.assetType,
      input.title,
      input.summary ?? null,
      input.body,
      input.mediaType ?? "text/plain",
      JSON.stringify(input.tags ?? []),
      JSON.stringify(input.metadata ?? {}),
      input.sourceLocator ?? null,
      input.searchScore ?? null,
    );
  return { assetId: input.assetId, revisionSeq, contentDigest, title: input.title, assetType: input.assetType };
}

/* ------------------------------------------------------------------ *
 * The four capabilities
 * ------------------------------------------------------------------ */

function search(input) {
  counters.search += 1;
  const text = String(input.text ?? "").toLowerCase();
  const rows = database
    .prepare("SELECT * FROM library_assets WHERE revision_seq = 1")
    .all()
    .filter(
      (row) =>
        row.title.toLowerCase().includes(text) ||
        row.body.toLowerCase().includes(text) ||
        row.asset_id.toLowerCase().includes(text),
    );
  const limit = typeof input.limit === "number" && input.limit > 0 ? Math.floor(input.limit) : 20;
  const hits = rows.slice(0, limit).map((row) => {
    const latest = latestRevisionOf(row.asset_id);
    return {
      providerId: PROVIDER_ID,
      assetId: row.asset_id,
      assetType: row.asset_type,
      title: row.title,
      ...(row.summary === null ? {} : { summary: row.summary }),
      ...(row.search_score === null ? {} : { searchScore: row.search_score }),
      ...(latest === undefined ? {} : { latestDigestHint: latest.content_digest }),
      ...(mode.leakCredential ? { apiToken: CREDENTIAL } : {}),
    };
  });
  return { providerId: PROVIDER_ID, hits };
}

function inspect(input) {
  counters.inspect += 1;
  const assetId = String(input.assetId ?? "");
  const requested = typeof input.contentDigest === "string" ? input.contentDigest : undefined;
  const row =
    requested === undefined
      ? latestRevisionOf(assetId)
      : database
          .prepare("SELECT * FROM library_assets WHERE asset_id = ? AND content_digest = ?")
          .get(assetId, requested);
  if (row === undefined) {
    return {
      status: "UNAVAILABLE",
      providerId: PROVIDER_ID,
      assetId,
      ...(requested === undefined ? {} : { requestedDigest: requested }),
      reason: "not_found",
      detail: `asset "${assetId}" has no revision ${requested ?? "<latest>"}`,
    };
  }
  return {
    status: "AVAILABLE",
    snapshot: {
      ref: stableRefOf(row),
      assetType: row.asset_type,
      title: row.title,
      ...(row.summary === null ? {} : { summary: row.summary }),
      tags: JSON.parse(row.tags_json),
      metadata: JSON.parse(row.metadata_json),
      ...(row.source_locator === null ? {} : { sourceLocator: row.source_locator }),
      ...(mode.leakCredential ? { apiToken: CREDENTIAL } : {}),
    },
  };
}

function materialize(input) {
  counters.materialize += 1;
  const assetId = String(input.assetId ?? "");
  const contentDigest = String(input.contentDigest ?? "");
  const row = database
    .prepare("SELECT * FROM library_assets WHERE asset_id = ? AND content_digest = ?")
    .get(assetId, contentDigest);
  if (row === undefined) return { state: "absent" };
  const bytes = Buffer.byteLength(row.body, "utf8");
  if (row.media_type !== "text/plain" && row.media_type !== "text/markdown") {
    // Non-text content is reported AS non-text: the caller must block the import.
    return { state: "not_text", mediaType: row.media_type, bytes };
  }
  if (bytes > MAX_TEXT_BYTES) {
    // The provider NEVER truncates: over the bound is a refusal, not a haircut.
    return { state: "too_large", bytes, maxTextBytes: MAX_TEXT_BYTES };
  }
  return { state: "available", text: row.body, contentDigest: row.content_digest, mediaType: row.media_type, bytes };
}

function publish(input) {
  counters.publish += 1;
  const publicationId = String(input.publicationId ?? "");
  const payloadDigest = String(input.payloadDigest ?? "");
  const existing = publicationOf(publicationId);
  if (existing !== undefined) {
    if (existing.payload_digest !== payloadDigest) {
      return {
        state: "conflict",
        detail: `publication ${publicationId} was already used for a different payload`,
      };
    }
    // IDEMPOTENT BY publicationId: the SAME external asset comes back.
    return { state: "published", ref: refOfPublication(existing), created: false };
  }
  const assetId = `pub-${publicationId}`;
  const contentDigest = sha256(`${input.title}\u0000${input.body}`);
  const revisionLabel = `pub:${publicationId}`;
  try {
    database.exec("BEGIN IMMEDIATE");
    database
      .prepare(
        "INSERT INTO library_publications (publication_id, payload_digest, provider_definition_digest, target_asset_type, title, body, metadata_json, asset_id, content_digest, revision_label) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        publicationId,
        payloadDigest,
        String(input.providerDefinitionDigest ?? ""),
        String(input.targetAssetType ?? ""),
        String(input.title ?? ""),
        String(input.body ?? ""),
        JSON.stringify(input.metadata ?? {}),
        assetId,
        contentDigest,
        revisionLabel,
      );
    // The library INDEXES what it stores: the published asset becomes a normal,
    // inspectable asset of this provider with its own revision.
    database
      .prepare(
        "INSERT INTO library_assets (asset_id, revision_seq, revision_label, content_digest, asset_type, title, summary, body, media_type, tags_json, metadata_json, source_locator, search_score) " +
          "VALUES (?, 1, ?, ?, ?, ?, NULL, ?, 'text/plain', '[]', ?, NULL, NULL)",
      )
      .run(
        assetId,
        revisionLabel,
        contentDigest,
        String(input.targetAssetType ?? "Note"),
        String(input.title ?? ""),
        String(input.body ?? ""),
        JSON.stringify(input.metadata ?? {}),
      );
    database.exec("COMMIT");
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      /* the transaction may already be gone */
    }
    return { state: "failed", detail: error instanceof Error ? error.message : String(error) };
  }
  const row = publicationOf(publicationId);
  const ref = refOfPublication(row);
  if (mode.crashAfterWrite) {
    // THE CRASH WINDOW: the external write LANDED (committed above) and this
    // process dies before it can answer. The caller sees an uncertain outcome.
    process.exit(9);
  }
  return { state: "published", ref, created: true };
}

function reconcile(input) {
  counters.reconcile += 1;
  const publicationId = String(input.publicationId ?? "");
  const row = publicationOf(publicationId);
  if (row === undefined) return { state: "absent" };
  if (typeof input.payloadDigest === "string" && row.payload_digest !== input.payloadDigest) {
    return { state: "unknown", detail: "the recorded payload digest differs" };
  }
  return { state: "published", ref: refOfPublication(row) };
}

/* ------------------------------------------------------------------ *
 * HTTP face
 * ------------------------------------------------------------------ */

const token = process.env.FIXTURE_LIBRARY_TOKEN ?? randomBytes(16).toString("base64url");

const server = createServer((request, response) => {
  void (async () => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (request.method === "GET" && url.pathname === "/health") {
      json(response, 200, { ok: true, providerId: PROVIDER_ID, unavailable: mode.unavailable });
      return;
    }
    if (request.headers.authorization !== `Bearer ${token}`) {
      json(response, 401, { error: "the external library requires its own credential" });
      return;
    }
    if (mode.unavailable && !url.pathname.startsWith("/__")) {
      // The library is DOWN for callers, while its own operator surface stays up
      // so the harness can turn the outage off again.
      unavailableError(response);
      return;
    }
    if (url.pathname.startsWith("/__") && request.method !== "POST") {
      json(response, 405, { error: "the library operator surface is POST-only" });
      return;
    }
    try {
      if (request.method === "GET" && url.pathname === "/ping") {
        json(response, 200, { ok: true });
        return;
      }
      if (request.method !== "POST") {
        json(response, 405, { error: "method not allowed" });
        return;
      }
      const rawBody = await readBody(request);
      const body = rawBody === "" ? {} : JSON.parse(rawBody);
      if (url.pathname === "/__add_revision") return json(response, 200, addRevision(body));
      if (url.pathname === "/__mode") {
        if (typeof body.unavailable === "boolean") mode.unavailable = body.unavailable;
        if (typeof body.crashAfterWrite === "boolean") mode.crashAfterWrite = body.crashAfterWrite;
        if (typeof body.leakCredential === "boolean") mode.leakCredential = body.leakCredential;
        return json(response, 200, { ...mode });
      }
      if (url.pathname === "/__stats") {
        const assets = database.prepare("SELECT COUNT(DISTINCT asset_id) AS n FROM library_assets").get();
        const revisions = database.prepare("SELECT COUNT(*) AS n FROM library_assets").get();
        const publications = database.prepare("SELECT COUNT(*) AS n FROM library_publications").get();
        return json(response, 200, {
          providerId: PROVIDER_ID,
          counters: { ...counters },
          assets: assets.n,
          revisions: revisions.n,
          publications: publications.n,
        });
      }
      if (url.pathname === "/search") return json(response, 200, search(body));
      if (url.pathname === "/inspect") return json(response, 200, inspect(body));
      if (url.pathname === "/materialize") return json(response, 200, materialize(body));
      if (url.pathname === "/publish") return json(response, 200, publish(body));
      if (url.pathname === "/reconcile") return json(response, 200, reconcile(body));
      json(response, 404, { error: "unknown endpoint" });
    } catch (error) {
      json(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  })();
});

const port = Number(process.argv[3] ?? 0);
server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  const bound = typeof address === "object" && address !== null ? address.port : port;
  process.stdout.write(
    `${JSON.stringify({
      providerId: PROVIDER_ID,
      displayName: DISPLAY_NAME,
      version: PROVIDER_VERSION,
      protocolDigest: PROTOCOL_DIGEST,
      databasePath,
      port: bound,
      token,
      maxTextBytes: MAX_TEXT_BYTES,
    })}\n`,
  );
});
