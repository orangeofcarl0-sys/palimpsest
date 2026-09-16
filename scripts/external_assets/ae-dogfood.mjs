/**
 * G10-AE §32/§38 — SEPARATE-PROCESS EXTERNAL-ASSET LIBRARY DOGFOOD.
 *
 * Usage: node scripts/external_assets/ae-dogfood.mjs
 *
 * WHAT IS SEPARATE HERE: the external owner runs as its OWN NODE PROCESS
 * (`test/fixtures/external_library_server.mjs`) over its OWN sqlite DATABASE — a
 * different process, a different file, a different schema, and not one shared
 * table with the Palimpsest Work ledger, the association store, the journal
 * store, the bridge store or the Ordarium ledger. Palimpsest reaches it through a
 * REAL provider ADAPTER over its HTTP API (the declared port shapes), never
 * through an in-process object.
 *
 * Everything else is the REAL product stack, imported from `dist/` with the
 * Windows-safe `pathToFileURL` pattern: `installPalimpsest` over a temp state dir,
 * the real Ordarium effects runtime, the real association/journal/bridge stores,
 * the real composed application surface and the real HTTP route dispatcher.
 *
 * THE §33 GOLDEN E2Es + §38 EVIDENCE LIST, each printed as an explicit check:
 *   1  search                      hits + ZERO project mutation (raw project /
 *                                  events / association / journal / bridge diffs)
 *   2  inspect                     the exact digest-bound ref + ZERO mutation, and
 *                                  a requested-but-absent digest never becomes
 *                                  "latest"
 *   3  reference                   one EXTERNAL_ASSET association, no content
 *   4  reference restart           the association survives the restart
 *   5  provider unavailable        a restart with NO provider ⇒ PROVIDER_UNAVAILABLE
 *   6  newer revision              d1 referenced, d2 merely surfaced
 *   7  explicit Journal import     one Journal entry + structured provenance + one
 *                                  bridge terminal receipt, no Work write
 *   8  import crash/idempotency    a retry after the Journal write records ONE entry,
 *                                  and a crash BETWEEN the two writes recovers with
 *                                  one entry and one terminal receipt
 *   9  publication preview         exact outbound payload + ZERO effect
 *  10  no approval                 NOT_APPROVED with zero provider/Ordarium effect
 *  11  publish                     approval ⇒ stable external ref + association,
 *                                  and the library really holds EXACTLY that body
 *  12  publication crash/recovery  the external write lands, the process dies,
 *                                  restart + retry ⇒ ONE external asset, ONE
 *                                  terminal receipt, ONE association
 *  13  no auto-context/admission   external text never enters the view/graph/ledger,
 *                                  no foreign project is scanned, no credential is
 *                                  persisted
 *
 * `pass` is true only when EVERY check really held; the script prints a final
 * `pass=true|false` line and exits non-zero on any failure. The fixture child
 * process is ALWAYS killed in a `finally`.
 *
 * HONEST NOTES:
 *  - the PUBLICATION crash window is real at the process level: with
 *    `crashAfterWrite` the fixture commits its row and then EXITS, so the caller
 *    sees an uncertain outcome while the external write really landed; recovery
 *    happens after a restart over the SAME library database.
 *  - the IMPORT crash window cannot kill this harness (the bridge runs in-process
 *    here), so it is reproduced faithfully at the STORE level: the Journal write is
 *    landed through the plane's own journal port first and the terminal receipt is
 *    attempted afterwards — exactly the state a crash between the two writes leaves.
 *  - "provider unavailable" in step 5 is the NOT-CONFIGURED reading (a restart
 *    without the library), which the plane reports as `PROVIDER_UNAVAILABLE`; a
 *    configured provider that merely stops answering reports
 *    `REVISION_UNAVAILABLE` with `providerAvailable: false` instead. Both keep the
 *    association and the referenced digest.
 */

import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..", "..");
const mod = (...segments) => pathToFileURL(join(REPO, ...segments)).href;

const PROJECT_ID = "ae-dogfood";
const CLOCK = "2026-09-16T00:00:00Z";
const TEXT_D1 = "External library note revision one, referenced by the dogfood project.";
const TEXT_D2 = "External library note revision two, which must never silently replace revision one.";
const LOCAL_TITLE = "Dogfood local idea published on purpose";
const LOCAL_BODY = "Exactly this body leaves the project; nothing else does.";
/** ONE token for every fixture-process incarnation, so a restart stays reachable. */
const LIBRARY_TOKEN = "dogfood-fixture-token-2f9c1a";

function gitHead() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim();
  } catch {
    return "a".repeat(40);
  }
}
const HEAD = /^[0-9a-f]{40}$/u.test(gitHead()) ? gitHead() : "a".repeat(40);

const tools = await import(mod("dist/src/tools/index.js"));
const effects = await import(mod("dist/src/effects/index.js"));
const workspace = await import(mod("dist/src/project_workspace/index.js"));
const bridge = await import(mod("dist/src/external_assets/index.js"));
const { installPalimpsest } = await import(mod("dist/src/install.js"));
const { handleApplicationRequest } = await import(mod("dist/src/application/http.js"));

/* -------------------------------------------------------------------------- *
 * Evidence
 * -------------------------------------------------------------------------- */

const evidence = {};
const failures = [];
const disposers = [];

function check(name, condition, detail) {
  const ok = condition === true;
  evidence[name] = { ok, detail };
  if (!ok) failures.push(`${name}: ${detail}`);
  return ok;
}

function rawRows(databasePath, sql) {
  const database = new DatabaseSync(databasePath);
  try {
    return JSON.stringify(database.prepare(sql).all());
  } finally {
    database.close();
  }
}

function fileText(path) {
  try {
    statSync(path);
  } catch {
    return "";
  }
  return readFileSync(path).toString("latin1");
}

function countOf(text, needle) {
  return text.split(needle).length - 1;
}

/** The number of rows a query matches (0 for a store that was never written to). */
function countRows(databasePath, sql) {
  const database = new DatabaseSync(databasePath);
  try {
    return Number(database.prepare(sql).get().n ?? 0);
  } finally {
    database.close();
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* -------------------------------------------------------------------------- *
 * The separate-process fixture library + the real provider adapter
 * -------------------------------------------------------------------------- */

async function startLibrary(databasePath) {
  const child = spawn(
    process.execPath,
    [join(REPO, "test", "fixtures", "external_library_server.mjs"), databasePath, "0"],
    { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, FIXTURE_LIBRARY_TOKEN: LIBRARY_TOKEN } },
  );
  const info = await new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => reject(new Error("the fixture library did not announce itself in time")), 15_000);
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const line = buffer.split("\n").find((entry) => entry.trim().startsWith("{"));
      if (line === undefined) return;
      clearTimeout(timer);
      resolve(JSON.parse(line));
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`the fixture library exited before announcing itself (code ${code})`));
    });
    child.stderr.on("data", () => {
      /* the fixture logs nothing: keep stderr out of the evidence stream */
    });
  });
  return { child, info };
}

function killLibrary(child) {
  if (child === undefined || child === null) return;
  try {
    child.kill("SIGKILL");
  } catch {
    /* already gone */
  }
}

/**
 * The provider ADAPTER over the fixture's HTTP API — the declared port shapes.
 *
 * `endpoint` is a MUTABLE holder: the fixture process is restarted during the
 * crash-window proof, and a restart may bind a different ephemeral port. The
 * adapter therefore resolves the address per call instead of caching it, so the
 * SAME adapter (and the SAME registered provider) survives the restart.
 */
function providerAdapter(info, endpoint = { port: info.port }) {
  const headers = { "content-type": "application/json", authorization: `Bearer ${info.token}` };
  const calls = { search: 0, inspect: 0, materialize: 0, publish: 0, reconcile: 0 };

  async function call(path, body) {
    const response = await fetch(`http://127.0.0.1:${endpoint.port}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
    const text = await response.text();
    if (!response.ok) throw new Error(`fixture library ${path} answered ${response.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  }

  const definition = bridge.materializeExternalAssetProviderDefinition({
    providerId: info.providerId,
    version: info.version,
    displayName: info.displayName,
    capabilities: ["SEARCH", "INSPECT", "MATERIALIZE_TEXT", "PUBLISH"],
    protocolDigest: info.protocolDigest,
  });

  const read = {
    definition,
    async search(query) {
      calls.search += 1;
      return call("/search", { text: query.text, ...(query.limit === undefined ? {} : { limit: query.limit }) });
    },
    async inspect(request) {
      calls.inspect += 1;
      return call("/inspect", {
        assetId: request.assetId,
        ...(request.contentDigest === undefined ? {} : { contentDigest: request.contentDigest }),
      });
    },
    async materializeText(stableRef) {
      calls.materialize += 1;
      const answer = await call("/materialize", {
        assetId: stableRef.assetId,
        contentDigest: stableRef.contentDigest,
      });
      if (answer.state === "available") {
        return { text: answer.text, contentDigest: answer.contentDigest, mediaType: answer.mediaType };
      }
      if (answer.state === "not_text" || answer.state === "too_large") {
        // Bounded text only: over the bound / non-text is a REFUSAL, reported as a
        // non-text media type so the plane blocks the import instead of truncating.
        return { text: "not materializable", contentDigest: stableRef.contentDigest, mediaType: "application/octet-stream" };
      }
      return undefined;
    },
    async latestRevision(assetId) {
      const snapshot = await call("/inspect", { assetId });
      if (snapshot.status !== "AVAILABLE") return undefined;
      return {
        assetId: snapshot.snapshot.ref.assetId,
        assetType: snapshot.snapshot.assetType,
        title: snapshot.snapshot.title,
        contentDigest: snapshot.snapshot.ref.contentDigest,
        ...(snapshot.snapshot.ref.revisionLabel === undefined
          ? {}
          : { revisionLabel: snapshot.snapshot.ref.revisionLabel }),
      };
    },
  };

  const publication = {
    definition,
    semantics: "IDEMPOTENT_BY_PUBLICATION_ID",
    async publish(request) {
      calls.publish += 1;
      const answer = await call("/publish", {
        publicationId: request.publicationId,
        providerDefinitionDigest: request.providerDefinitionDigest,
        payloadDigest: request.payloadDigest,
        targetAssetType: request.targetAssetType,
        title: request.title,
        body: request.body,
        metadata: request.metadata,
      });
      if (answer.state === "published") return { status: "PUBLISHED", ref: answer.ref };
      if (answer.state === "conflict") return { status: "FAILED", reason: answer.detail };
      return { status: "UNCERTAIN", detail: answer.detail ?? "the library did not answer definitively" };
    },
    async reconcile(request) {
      calls.reconcile += 1;
      const answer = await call("/reconcile", {
        publicationId: request.publicationId,
        payloadDigest: request.payloadDigest,
      });
      if (answer.state === "published") return { status: "PUBLISHED", ref: answer.ref };
      if (answer.state === "absent") return { status: "ABSENT_RETRY_SAFE" };
      return { status: "UNKNOWN", detail: answer.detail ?? "the library could not decide" };
    },
  };

  return { definition, read, publication, calls, operator: (path, body) => call(path, body) };
}

/* -------------------------------------------------------------------------- *
 * Palimpsest rig
 * -------------------------------------------------------------------------- */

function install(options) {
  return installPalimpsest({ tools: { register: () => undefined } }, {
    projectId: PROJECT_ID,
    databasePath: options.statePath,
    ordariumDatabasePath: join(options.dir, `ordarium-${options.label}.sqlite`),
    clock: () => CLOCK,
    git: new effects.FakeGitPort(HEAD),
    repository: REPO,
    projectAssociationStore: new workspace.SqliteProjectAssetAssociationStore(options.associationPath),
    projectJournalStore: new workspace.SqliteProjectJournalStore(options.journalPath),
    ...(options.registry === undefined ? {} : { externalAssetProviders: options.registry }),
    ...(options.registry === undefined
      ? {}
      : { externalAssetBridgeStore: new bridge.SqliteExternalAssetBridgeStore(options.bridgePath) }),
    ...(options.admission === undefined ? {} : { externalAssetPublicationAdmission: options.admission }),
  });
}

/** The REAL HTTP route dispatcher (the same one `serve` uses). */
async function route(installed, method, pathname, body, query) {
  const result = await handleApplicationRequest({
    application: installed.application,
    method,
    pathname,
    query: new URLSearchParams(query ?? {}),
    body,
  });
  if (result === undefined) throw new Error(`no application route for ${method} ${pathname}`);
  return result;
}

/* -------------------------------------------------------------------------- *
 * main
 * -------------------------------------------------------------------------- */

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-ae-dogfood-"));
  const statePath = join(dir, "state.sqlite");
  const associationPath = join(dir, "associations.sqlite");
  const journalPath = join(dir, "journal.sqlite");
  const bridgePath = join(dir, "bridge.sqlite");
  const libraryPath = join(dir, "external-library.sqlite");
  const paths = { dir, statePath, associationPath, journalPath, bridgePath };

  let child;
  const summary = {};

  try {
    /* 0. The SEPARATE process, its OWN database, and the real adapter. --------- */
    let library = await startLibrary(libraryPath);
    child = library.child;
    const endpoint = { port: library.info.port };
    const adapter = providerAdapter(library.info, endpoint);
    summary.libraryProcess = {
      pid: child.pid,
      port: library.info.port,
      databasePath: libraryPath,
      providerId: library.info.providerId,
    };
    const health = await fetch(`http://127.0.0.1:${library.info.port}/health`).then((response) => response.json());
    check(
      "separate_process_library_is_healthy_and_separately_owned",
      health.ok === true && libraryPath !== statePath && libraryPath !== associationPath && libraryPath !== journalPath && libraryPath !== bridgePath,
      JSON.stringify({ health, libraryPath }),
    );

    const d1 = await adapter.operator("/__add_revision", {
      assetId: "paper-1",
      assetType: "Paper",
      title: "Externally owned dogfood paper",
      body: TEXT_D1,
      summary: "Owned by the separate-process library.",
      revisionLabel: "r1",
      sourceLocator: "fixture-process://paper-1",
      searchScore: 1,
    });
    await adapter.operator("/__add_revision", {
      assetId: "nonmatching-1",
      assetType: "Idea",
      title: "Unrelated note",
      body: "Nothing here matches the dogfood search term.",
    });

    const registry = bridge.externalAssetLibraryRegistryOf([
      { read: adapter.read, publication: adapter.publication },
    ]);
    const admissionPreviews = [];
    const admission = {
      policyRef: { policyId: "dogfood-admission", version: "1" },
      async admit({ preview }) {
        admissionPreviews.push(preview);
        return { decision: "APPROVE", approver: "dogfood:operator" };
      },
    };

    let installed = install({ ...paths, label: "first", registry, admission });
    disposers.push(installed);
    installed.controller.start({
      projectId: PROJECT_ID,
      goal: "Reuse an externally owned asset without becoming the library.",
      headCommit: HEAD,
      tasks: [],
    });
    const localEntry = await installed.projectWorkspace.recordJournalEntry({
      projectId: PROJECT_ID,
      kind: "IDEA",
      title: LOCAL_TITLE,
      body: LOCAL_BODY,
      provenance: "dogfood:operator",
    });

    /* 1. SEARCH — hits, ZERO project mutation, both faces. ------------------- */
    const snapshot = () => ({
      projects: rawRows(statePath, "SELECT project_id, revision, digest FROM projects"),
      events: rawRows(statePath, "SELECT event_id, event_type FROM events"),
      associations: rawRows(associationPath, "SELECT event_id FROM project_asset_association_events"),
      journal: rawRows(journalPath, "SELECT event_id, type FROM project_journal_events"),
      bridge: rawRows(bridgePath, "SELECT operation_id, family FROM external_asset_bridge"),
    });
    const before = snapshot();
    const viewBefore = JSON.stringify(await route(installed, "GET", "/api/project/workspace"));

    const searchViaHttp = await route(installed, "GET", "/api/external-assets/search", undefined, {
      providerId: adapter.definition.providerId,
      text: "External library note",
    });
    const searchViaPlane = await installed.externalAssets.search({
      providerId: adapter.definition.providerId,
      text: "External library note",
    });
    const hitIds = searchViaPlane.hits.map((hit) => hit.assetId);
    summary.search = { httpStatus: searchViaHttp.status, hits: hitIds };
    check(
      "search_returns_the_matching_hit_only",
      JSON.stringify(hitIds) === JSON.stringify(["paper-1"]) && searchViaHttp.status === 200,
      JSON.stringify(summary.search),
    );
    const afterSearch = snapshot();
    check(
      "search_mutates_nothing",
      JSON.stringify(afterSearch) === JSON.stringify(before) &&
        JSON.stringify(await route(installed, "GET", "/api/project/workspace")) === viewBefore,
      "project/events/association/journal/bridge rows and the derived view are byte-identical",
    );

    /* 2. INSPECT — the exact ref, still ZERO mutation. ---------------------- */
    const inspectViaHttp = await route(installed, "GET", "/api/external-assets/inspect", undefined, {
      providerId: adapter.definition.providerId,
      assetId: "paper-1",
      contentDigest: d1.contentDigest,
    });
    const inspection = await installed.externalAssets.inspect({
      providerId: adapter.definition.providerId,
      assetId: "paper-1",
      contentDigest: d1.contentDigest,
    });
    if (inspection.status !== "AVAILABLE") throw new Error("the exact-digest inspection did not resolve");
    const exactRef = inspection.snapshot.ref;
    check(
      "inspect_resolves_the_exact_digest",
      exactRef.contentDigest === d1.contentDigest && inspectViaHttp.status === 200,
      `${exactRef.assetId}@${exactRef.contentDigest}`,
    );
    const absentDigest = await installed.externalAssets.inspect({
      providerId: adapter.definition.providerId,
      assetId: "paper-1",
      contentDigest: "f".repeat(64),
    });
    check(
      "inspect_never_substitutes_latest_for_a_requested_digest",
      absentDigest.status === "UNAVAILABLE" && absentDigest.reason === "not_found",
      JSON.stringify({ status: absentDigest.status, reason: absentDigest.reason }),
    );
    check(
      "inspect_mutates_nothing",
      JSON.stringify(snapshot()) === JSON.stringify(before) &&
        JSON.stringify(await route(installed, "GET", "/api/project/workspace")) === viewBefore,
      "no row and no derived-view change after both inspections",
    );

    /* 3. REFERENCE — one association, no content copied. -------------------- */
    const prepared = await installed.externalAssets.prepareReference({
      projectId: PROJECT_ID,
      providerId: adapter.definition.providerId,
      assetId: "paper-1",
      contentDigest: d1.contentDigest,
    });
    if (prepared.status !== "PREPARED") throw new Error(`the reference was denied: ${prepared.reason}`);
    const committed = await installed.externalAssets.commitReference(prepared.candidate);
    const associationCount = () =>
      countRows(associationPath, "SELECT COUNT(*) AS n FROM project_asset_association_events WHERE type='ASSET_ASSOCIATED'");
    check(
      "reference_commits_one_EXTERNAL_ASSET_association_with_the_exact_digest",
      committed.status === "COMMITTED" &&
        committed.created === true &&
        committed.association.assetKind === "EXTERNAL_ASSET" &&
        committed.association.canonicalRef.kind === adapter.definition.providerId &&
        committed.association.canonicalRef.id === "paper-1" &&
        committed.association.canonicalRef.digest === d1.contentDigest,
      JSON.stringify(committed.status === "COMMITTED" ? committed.association.canonicalRef : committed),
    );
    const associationRows = rawRows(associationPath, "SELECT * FROM project_asset_association_events");
    check(
      "reference_copies_no_content",
      !associationRows.includes(TEXT_D1) &&
        !JSON.stringify(await route(installed, "GET", "/api/project/workspace")).includes(TEXT_D1),
      "the external body is in neither the association store nor the derived view",
    );

    /* 4. REFERENCE SURVIVES A RESTART. ------------------------------------- */
    await installed.dispose();
    disposers.pop();
    installed = install({ ...paths, label: "restart", registry, admission });
    disposers.push(installed);
    const restartedRef = (await route(installed, "GET", "/api/project/workspace")).body.external.references[0];
    check(
      "reference_survives_a_restart",
      (await route(installed, "GET", "/api/project/workspace")).body.external.references.length === 1 &&
        restartedRef.referencedDigest === d1.contentDigest &&
        restartedRef.resolution === "RESOLVED",
      JSON.stringify({ digest: restartedRef.referencedDigest, resolution: restartedRef.resolution }),
    );

    /* 5. PROVIDER UNAVAILABLE — the association survives. ------------------ */
    // A restart with NO external library configured at all: the honest "the
    // provider is gone" scenario.
    const withoutProvider = install({ ...paths, label: "no-provider", registry: bridge.emptyExternalAssetLibraryRegistry() });
    const unavailableView = await route(withoutProvider, "GET", "/api/project/workspace");
    const unavailableRef = unavailableView.body.external.references[0];
    check(
      "provider_unavailable_keeps_the_association_and_reports_it",
      unavailableRef.resolution === "PROVIDER_UNAVAILABLE" &&
        unavailableRef.providerAvailable === false &&
        unavailableRef.referencedDigest === d1.contentDigest &&
        associationCount() === 1,
      JSON.stringify({ resolution: unavailableRef.resolution, digest: unavailableRef.referencedDigest }),
    );
    await withoutProvider.dispose();

    /* 6. NEWER REVISION — surfaced, never adopted. ------------------------- */
    const associationsBeforeNewer = rawRows(associationPath, "SELECT event_id FROM project_asset_association_events");
    const d2 = await adapter.operator("/__add_revision", {
      assetId: "paper-1",
      assetType: "Paper",
      title: "Externally owned dogfood paper (revised)",
      body: TEXT_D2,
      revisionLabel: "r2",
    });
    const newerView = await route(installed, "GET", "/api/project/workspace");
    const newerRef = newerView.body.external.references[0];
    check(
      "newer_revision_is_surfaced_but_the_referenced_digest_never_moves",
      newerRef.referencedDigest === d1.contentDigest &&
        newerRef.newerRevisionAvailable === true &&
        newerRef.latestDigestHint === d2.contentDigest &&
        !JSON.stringify(newerView.body).includes(TEXT_D2) &&
        rawRows(associationPath, "SELECT event_id FROM project_asset_association_events") === associationsBeforeNewer,
      JSON.stringify({
        referenced: newerRef.referencedDigest,
        newerAvailable: newerRef.newerRevisionAvailable,
        hint: newerRef.latestDigestHint,
      }),
    );

    /* 7. EXPLICIT JOURNAL IMPORT. ------------------------------------------ */
    const workBeforeImport = rawRows(statePath, "SELECT event_id, event_type FROM events");
    const entriesBeforeImport = countRows(journalPath, "SELECT COUNT(*) AS n FROM project_journal_events WHERE type='JOURNAL_ENTRY_RECORDED'");
    const importPrepared = await installed.externalAssets.prepareImport({
      projectId: PROJECT_ID,
      externalRef: exactRef,
      journalKind: "REFERENCE_NOTE",
      title: "Imported separate-process note",
      sourceLocator: "fixture-process://paper-1",
    });
    if (importPrepared.status !== "PREPARED") throw new Error(`the import was denied: ${importPrepared.reason}`);
    const importCommitted = await installed.externalAssets.commitImport(importPrepared.candidate);
    if (importCommitted.status !== "COMMITTED") throw new Error("the import did not commit");
    const journalRecorded = () =>
      countRows(journalPath, "SELECT COUNT(*) AS n FROM project_journal_events WHERE type='JOURNAL_ENTRY_RECORDED'");
    const provenance = bridge.externalAssetImportProvenanceOf(importCommitted.entry);
    check(
      "import_writes_one_journal_entry_with_structured_provenance",
      journalRecorded() === entriesBeforeImport + 1 &&
        provenance !== undefined &&
        provenance.contentDigest === d1.contentDigest &&
        provenance.providerId === adapter.definition.providerId &&
        importCommitted.entry.kind === "REFERENCE_NOTE",
      JSON.stringify({
        entriesBefore: entriesBeforeImport,
        entriesAfter: journalRecorded(),
        kind: importCommitted.entry.kind,
        entryId: importCommitted.entry.entryId,
      }),
    );
    check(
      "import_creates_no_work_mutation",
      rawRows(statePath, "SELECT event_id, event_type FROM events") === workBeforeImport,
      "the Work ledger gained no event",
    );
    const importLineage = installed.externalAssets.store
      .lineage(PROJECT_ID, importPrepared.candidate.operationId)
      .map((record) => record.family);
    check(
      "import_records_exactly_one_terminal_bridge_receipt",
      JSON.stringify(importLineage) === JSON.stringify(["EXTERNAL_IMPORT_PREPARED", "EXTERNAL_IMPORT_COMMITTED"]),
      JSON.stringify(importLineage),
    );

    /* 8. IMPORT CRASH / IDEMPOTENCY. --------------------------------------- */
    const entriesBeforeRetry = journalRecorded();
    const retriedImport = await installed.externalAssets.commitImport(importPrepared.candidate);
    check(
      "import_retry_after_the_journal_write_does_not_duplicate_the_entry",
      retriedImport.status === "COMMITTED" &&
        retriedImport.replayed === true &&
        journalRecorded() === entriesBeforeRetry,
      JSON.stringify({
        replayed: retriedImport.status === "COMMITTED" ? retriedImport.replayed : null,
        entries: journalRecorded(),
      }),
    );

    /* 8b. IMPORT CRASH WINDOW — the Journal write landed, the terminal did not. */
    // A process that dies between the two writes leaves exactly this state, and it
    // is reproduced here without killing the harness: the SAME Journal write is
    // landed through the plane's own journal port, and only then is the terminal
    // receipt attempted. Nothing may be duplicated.
    const crashImportPrepared = await installed.externalAssets.prepareImport({
      projectId: PROJECT_ID,
      externalRef: exactRef,
      journalKind: "OPEN_QUESTION",
      title: "Imported across a crash window",
    });
    if (crashImportPrepared.status !== "PREPARED") throw new Error("the crash-window import was denied");
    const entriesBeforeCrashImport = journalRecorded();
    const journalPort = bridge.sqliteExternalAssetJournalPort(
      new workspace.SqliteProjectJournalStore(journalPath),
    );
    await installed.externalAssets.beginImport(crashImportPrepared.candidate);
    await journalPort.append(crashImportPrepared.candidate.entry);
    const recoveredImport = await installed.externalAssets.commitImport(crashImportPrepared.candidate);
    const crashImportLineage = installed.externalAssets.store
      .lineage(PROJECT_ID, crashImportPrepared.candidate.operationId)
      .map((record) => record.family);
    check(
      "import_crash_window_recovers_with_one_entry_and_one_terminal_receipt",
      recoveredImport.status === "COMMITTED" &&
        recoveredImport.journalCreated === false &&
        journalRecorded() === entriesBeforeCrashImport + 1 &&
        JSON.stringify(crashImportLineage) === JSON.stringify(["EXTERNAL_IMPORT_PREPARED", "EXTERNAL_IMPORT_COMMITTED"]),
      JSON.stringify({
        journalCreated: recoveredImport.status === "COMMITTED" ? recoveredImport.journalCreated : null,
        entries: journalRecorded(),
        lineage: crashImportLineage,
      }),
    );

    /* 9. PUBLICATION PREVIEW — exact payload, ZERO effect. ----------------- */
    const beforePreview = snapshot();
    const libraryBeforePreview = await adapter.operator("/__stats", {});
    const preview = await installed.externalAssets.preparePublication({
      projectId: PROJECT_ID,
      providerId: adapter.definition.providerId,
      targetAssetType: "Note",
      journalEntryId: localEntry.entryId,
    });
    check(
      "publication_preview_is_the_exact_outbound_payload",
      preview.outboundTitle === LOCAL_TITLE &&
        preview.outboundBody === LOCAL_BODY &&
        JSON.stringify(Object.keys(preview.outboundMetadata).sort()) ===
          JSON.stringify(["palimpsest_journal_entry_digest", "palimpsest_journal_entry_id", "palimpsest_journal_kind"]),
      JSON.stringify({ title: preview.outboundTitle, payloadDigest: preview.payloadDigest }),
    );
    check(
      "publication_preview_has_zero_effect",
      JSON.stringify(snapshot()) === JSON.stringify(beforePreview) &&
        (await adapter.operator("/__stats", {})).counters.publish === libraryBeforePreview.counters.publish &&
        admissionPreviews.length === 0,
      "no bridge receipt, no association, no provider call and no admission",
    );

    /* 10. NO APPROVAL — zero external effect. ------------------------------ */
    const noApproval = install({ ...paths, label: "no-approval", registry });
    const refused = await noApproval.externalAssets.approveAndPublish(preview);
    const libraryAfterRefusal = await adapter.operator("/__stats", {});
    check(
      "publication_without_an_admission_port_is_refused_with_zero_effect",
      refused.status === "NOT_APPROVED" &&
        libraryAfterRefusal.counters.publish === libraryBeforePreview.counters.publish &&
        libraryAfterRefusal.publications === libraryBeforePreview.publications &&
        noApproval.externalAssets.store.lineage(PROJECT_ID, preview.publicationId).length === 0,
      JSON.stringify({ status: refused.status, publishCalls: libraryAfterRefusal.counters.publish }),
    );
    await noApproval.dispose();

    /* 11. PUBLISH — approval, stable external ref, association. ------------ */
    const published = await installed.externalAssets.approveAndPublish(preview);
    if (published.status !== "PUBLISHED") throw new Error(`the publication did not succeed: ${JSON.stringify(published)}`);
    const libraryAfterPublish = await adapter.operator("/__stats", {});
    check(
      "publication_requires_the_separate_admission_port_and_returns_a_stable_ref",
      admissionPreviews.length === 1 &&
        admissionPreviews[0].payloadDigest === preview.payloadDigest &&
        admissionPreviews[0].publicationId === preview.publicationId &&
        published.ref.providerId === adapter.definition.providerId &&
        /^[0-9a-f]{64}$/u.test(published.ref.contentDigest) &&
        /^[0-9a-f]{64}$/u.test(published.ref.refDigest),
      JSON.stringify({ approvals: admissionPreviews.length, ref: published.ref.assetId }),
    );
    const publishLineage = installed.externalAssets.store
      .lineage(PROJECT_ID, preview.publicationId)
      .map((record) => record.family);
    check(
      "publication_records_one_terminal_receipt_and_one_PUBLISHED_association",
      JSON.stringify(publishLineage) === JSON.stringify(["EXTERNAL_PUBLICATION_PREPARED", "EXTERNAL_PUBLICATION_COMMITTED"]) &&
        published.association?.associationKind === "PUBLISHED" &&
        published.association?.assetKind === "EXTERNAL_ASSET",
      JSON.stringify(publishLineage),
    );
    // The library really holds EXACTLY the approved payload (and nothing else).
    const materializedBack = await adapter.read.materializeText(published.ref);
    const publishedSnapshot = await adapter.operator("/inspect", {
      assetId: published.ref.assetId,
      contentDigest: published.ref.contentDigest,
    });
    check(
      "what_left_the_project_is_exactly_the_approved_payload",
      materializedBack !== undefined &&
        materializedBack.text === LOCAL_BODY &&
        materializedBack.contentDigest === published.ref.contentDigest &&
        publishedSnapshot.snapshot.metadata.palimpsest_journal_entry_id === localEntry.entryId &&
        publishedSnapshot.snapshot.metadata.palimpsest_journal_kind === "IDEA" &&
        !materializedBack.text.includes("dogfood:operator"),
      JSON.stringify({ bytes: materializedBack === undefined ? 0 : materializedBack.text.length }),
    );
    check(
      "publication_leaves_the_local_journal_as_local_history",
      (await installed.projectWorkspace.journal(PROJECT_ID)).some((entry) => entry.entry.entryId === localEntry.entryId),
      "the local journal entry is still readable",
    );
    const replay = await installed.externalAssets.approveAndPublish(preview);
    const libraryAfterReplay = await adapter.operator("/__stats", {});
    check(
      "publication_replay_cannot_duplicate_the_external_asset",
      replay.status === "PUBLISHED" &&
        replay.created === false &&
        libraryAfterReplay.publications === libraryAfterPublish.publications,
      JSON.stringify({ publications: libraryAfterReplay.publications, replayed: replay.created === false }),
    );

    /* 12. PUBLICATION CRASH / RECOVERY. ------------------------------------ */
    const crashEntry = await installed.projectWorkspace.recordJournalEntry({
      projectId: PROJECT_ID,
      kind: "REFERENCE_NOTE",
      title: "Dogfood crash-window note",
      body: "This note is published while the external library dies mid-write.",
      provenance: "dogfood:operator",
    });
    const crashPreview = await installed.externalAssets.preparePublication({
      projectId: PROJECT_ID,
      providerId: adapter.definition.providerId,
      targetAssetType: "Note",
      journalEntryId: crashEntry.entryId,
    });
    await adapter.operator("/__mode", { crashAfterWrite: true });
    const crashed = await installed.externalAssets.approveAndPublish(crashPreview);
    // The external process is GONE. The external write LANDED before it died.
    killLibrary(child);
    await sleep(250);
    library = await startLibrary(libraryPath);
    child = library.child;
    // The restart may bind a different ephemeral port: point the SAME adapter at it.
    endpoint.port = library.info.port;
    await adapter.operator("/__mode", { crashAfterWrite: false });
    const libraryAfterCrash = await adapter.operator("/__stats", {});
    const crashedLineage = installed.externalAssets.store
      .lineage(PROJECT_ID, crashPreview.publicationId)
      .map((record) => record.family);
    check(
      "publication_crash_after_the_external_write_leaves_no_local_terminal",
      crashed.status === "FAILED" &&
        crashed.reason === "publication_outcome_unknown" &&
        libraryAfterCrash.publications === libraryAfterPublish.publications + 1 &&
        !crashedLineage.includes("EXTERNAL_PUBLICATION_COMMITTED"),
      JSON.stringify({
        status: crashed.status,
        reason: crashed.status === "FAILED" ? crashed.reason : null,
        publications: libraryAfterCrash.publications,
        lineage: crashedLineage,
      }),
    );

    const recovered = await installed.externalAssets.approveAndPublish(crashPreview);
    const libraryAfterRecovery = await adapter.operator("/__stats", {});
    const recoveryLineage = installed.externalAssets.store
      .lineage(PROJECT_ID, crashPreview.publicationId)
      .map((record) => record.family);
    const crashAssociations =
      recovered.status === "PUBLISHED"
        ? (await installed.externalAssets.resolve(PROJECT_ID)).external.filter(
            (ref) => ref.assetId === recovered.ref.assetId,
          )
        : [];
    check(
      "publication_recovery_yields_one_asset_one_terminal_receipt_and_one_association",
      recovered.status === "PUBLISHED" &&
        libraryAfterRecovery.publications === libraryAfterCrash.publications &&
        countOf(JSON.stringify(recoveryLineage), "EXTERNAL_PUBLICATION_COMMITTED") === 1 &&
        crashAssociations.length === 1 &&
        crashAssociations[0].associationKind === "PUBLISHED",
      JSON.stringify({
        status: recovered.status,
        publications: libraryAfterRecovery.publications,
        lineage: recoveryLineage,
        associations: crashAssociations.length,
      }),
    );

    /* 13. NO AUTO-CONTEXT / NO FOREIGN SCAN / NO CREDENTIALS. -------------- */
    const finalView = JSON.stringify(await route(installed, "GET", "/api/project/workspace"));
    const finalGraph = JSON.stringify(installed.controller.orchestrationGraph());
    const finalEvents = rawRows(statePath, "SELECT event_id, event_type FROM events");
    const finalProjects = rawRows(statePath, "SELECT state_json FROM projects");
    const finalJournal = rawRows(journalPath, "SELECT payload_json FROM project_journal_events");
    const finalAssociations = rawRows(associationPath, "SELECT payload_json FROM project_asset_association_events");
    check(
      "external_content_never_becomes_canonical_project_state",
      !finalView.includes(TEXT_D1) &&
        !finalView.includes(TEXT_D2) &&
        !finalGraph.includes("dogfood paper") &&
        !finalEvents.includes("dogfood paper") &&
        !finalProjects.includes("dogfood paper") &&
        !finalJournal.includes("dogfood paper") &&
        !finalAssociations.includes(TEXT_D1) &&
        !finalAssociations.includes(TEXT_D2),
      "neither external body is in the view; the external title/body is in no Work ledger row, ProjectIR row, journal row or association row (the DERIVED title in the external section is a read, not a copy)",
    );
    const inspectCallsBefore = adapter.calls.inspect;
    const resolved = await installed.externalAssets.resolve(PROJECT_ID);
    const spentInspections = adapter.calls.inspect - inspectCallsBefore;
    check(
      "the_derived_read_walks_only_this_projects_associations",
      // ONE exact-digest inspection per association of THIS project, and no more:
      // there is no global library scan behind the derived view.
      resolved.external.length === countRows(associationPath, "SELECT COUNT(*) AS n FROM project_asset_association_events WHERE type='ASSET_ASSOCIATED'") &&
        spentInspections === resolved.external.length,
      JSON.stringify({ references: resolved.external.length, inspections: spentInspections }),
    );
    const foreign = await installed.externalAssets.resolve("some-other-project");
    check(
      "no_foreign_project_is_scanned_or_invented",
      foreign.external.length === 0 &&
        foreign.providerAvailability !== undefined &&
        foreign.warnings.includes("no external asset association is recorded for this project"),
      JSON.stringify({ references: foreign.external.length, warnings: foreign.warnings }),
    );
    await adapter.operator("/__mode", { leakCredential: true });
    const leaky = await installed.externalAssets
      .search({ providerId: adapter.definition.providerId, text: "External library note" })
      .then(
        (page) => ({ refused: false, page }),
        (error) => ({ refused: true, detail: error instanceof Error ? error.message : String(error) }),
      );
    await adapter.operator("/__mode", { leakCredential: false });
    check(
      "provider_credentials_never_reach_a_result_or_a_persisted_artifact",
      JSON.stringify(leaky).includes(LIBRARY_TOKEN) === false &&
        !fileText(bridgePath).includes(LIBRARY_TOKEN) &&
        !finalView.includes(LIBRARY_TOKEN),
      JSON.stringify({ refused: leaky.refused === true }),
    );

    summary.libraryCounters = (await adapter.operator("/__stats", {})).counters;
    summary.final = {
      projectId: PROJECT_ID,
      projectRevision: installed.controller.status().revision,
      associations: associationCount(),
      journalEntryRecords: journalRecorded(),
      bridgeRecords: countRows(bridgePath, "SELECT COUNT(*) AS n FROM external_asset_bridge"),
      libraryPublications: libraryAfterRecovery.publications,
    };
  } finally {
    for (const disposable of disposers.splice(0)) {
      try {
        await disposable.dispose();
      } catch {
        /* best effort */
      }
    }
    killLibrary(child);
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* Windows may hold a SQLite handle briefly; the temp dir is disposable. */
    }
  }

  summary.evidence = evidence;
  summary.failures = failures;
  summary.pass = failures.length === 0;
  console.log(JSON.stringify(summary, null, 2));
  console.log(`pass=${failures.length === 0}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

await main();
