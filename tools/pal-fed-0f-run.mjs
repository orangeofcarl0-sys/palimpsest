#!/usr/bin/env node
/**
 * PAL-FED-0F single-replicate runner (EXPERIMENTAL).
 *
 * Runs ONE focal-agent replicate: fresh fabric/DB/session/dirs, two separate
 * DSH host processes on one treatment artifact, real model. Records machine
 * evidence from the public federation API (events, contracts, peerstate) plus
 * DSH session-log facts (user messages, wake notices, tool-call order, wake
 * timestamps). No LLM judging; no hidden reasoning.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
const runId = args.get("--run-id");
const scenarioId = args.get("--scenario-id");
const scenarioClass = args.get("--scenario-class");
const focalPeer = args.get("--focal");
const prompt = args.get("--prompt");
const arm = args.get("--treatment");
const replicate = Number(args.get("--replicate") ?? 1);
const runOrder = Number(args.get("--order") ?? 0);
const artifact = resolve(args.get("--artifact"));
const outRoot = resolve(args.get("--out"));
const maxMs = Number(args.get("--max-ms") ?? 360_000);
const noContactGraceMs = Number(args.get("--no-contact-grace-ms") ?? 150_000);
const palimpsestSnapshot = resolve(args.get("--palimpsest-snapshot"));
const ordariumSnapshot = resolve(args.get("--ordarium-snapshot"));
const responderPeer = focalPeer === "palimpsest.main" ? "ordarium.main" : "palimpsest.main";

const runDir = join(outRoot, runId);
mkdirSync(runDir, { recursive: true });
const db = join(runDir, "coordination.sqlite");
const fabric = `pal-fed-0f-${runId}`;
const focalSession = `${runId}-focal`;
const responderSession = `${runId}-responder`;
const focalCwd = focalPeer === "palimpsest.main" ? palimpsestSnapshot : ordariumSnapshot;
const responderCwd = responderPeer === "palimpsest.main" ? palimpsestSnapshot : ordariumSnapshot;

const fedBase = join(artifact, "package/dist/src/federation");
const impFed = (file) => import(pathToFileURL(join(fedBase, file)).href);
const fed = {
  ...(await impFed("store.js")),
  ...(await impFed("events.js")),
  ...(await impFed("contracts.js")),
  ...(await impFed("peer_state.js")),
  ...(await impFed("fabric.js")),
  ...(await impFed("codec.js")),
};
const artifactMeta = JSON.parse(readFileSync(join(artifact, "package-metadata.json"), "utf8"));

// Fresh fabric.
{
  const store = fed.openFederationStore(db);
  try {
    await fed.initFabric(store, { fabricId: fabric });
  } finally {
    await store.close();
  }
}

const peerScript = join(import.meta.dirname, "pal-fed-0f-peer.mjs");
const startedAt = Date.now();
const status = {
  focal: { wakeCount: 0, lastWakeAt: undefined, ready: false },
  responder: { wakeCount: 0, lastWakeAt: undefined, ready: false },
};
const children = [];
function spawnPeer(peer, session, cwd, peerPrompt) {
  const dir = join(runDir, peer.replace(/\W+/g, "-"));
  const argv = [peerScript, "--peer", peer, "--dir", dir, "--db", db, "--fabric", fabric, "--session", session, "--cwd", cwd, "--artifact", artifact, "--watch-ms", "2000", "--status-ms", "1000"];
  if (peerPrompt !== undefined) argv.push("--prompt", peerPrompt);
  const child = spawn(process.execPath, argv, { stdio: ["ignore", "pipe", "pipe"] });
  const key = peer === focalPeer ? "focal" : "responder";
  const logLines = [];
  child.stderr.on("data", (chunk) => { logLines.push(String(chunk)); });
  child.on("exit", (code) => {
    try { writeFileSync(join(runDir, `${key}.log`), `exit=${code}
${logLines.join("")}`); } catch {}
  });
  let buffer = "";
  child.stdout.on("data", (chunk) => {
    buffer += String(chunk);
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("PAL_FED_READY ")) {
        status[key].ready = true;
      }
      if (line.startsWith("PAL_FED_STATUS ")) {
        try {
          const s = JSON.parse(line.slice("PAL_FED_STATUS ".length));
          status[key].wakeCount = s.wakeCount;
          if (s.lastWakeAt !== null) status[key].lastWakeAt = s.lastWakeAt;
        } catch {}
      }
    }
  });
  children.push(child);
  return child;
}
const stopAll = async () => {
  const exits = children.map((c) => new Promise((res) => c.once("exit", res)));
  for (const c of children) c.kill();
  await Promise.race([Promise.all(exits), new Promise((r) => setTimeout(r, 4_000))]);
};

const readEvents = async () => {
  const store = fed.openFederationStore(db);
  try {
    const events = await fed.readAllEvents(store);
    const contracts = await fed.readAllContractRecords(store);
    const focalState = await fed.readPeerInboxState(store, focalPeer);
    const responderState = await fed.readPeerInboxState(store, responderPeer);
    return { events, contracts, focalState, responderState };
  } finally {
    await store.close();
  }
};

let focalFirstEventAt;
let stopReason = "max-ms";
const deadline = startedAt + maxMs;
const noContactDeadline = startedAt + noContactGraceMs;

spawnPeer(focalPeer, focalSession, focalCwd, prompt);
spawnPeer(responderPeer, responderSession, responderCwd, undefined);
{
  const readyDeadline = Date.now() + 45_000;
  while (!(status.focal.ready && status.responder.ready) && Date.now() < readyDeadline) {
    await new Promise((r) => setTimeout(r, 500));
  }
}

let snapshot = { events: [], contracts: [], focalState: { state: {} }, responderState: { state: {} } };
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 2_000));
  try {
    snapshot = await readEvents();
  } catch {
    continue;
  }
  const focalEvents = snapshot.events.filter((e) => e.event.from === focalPeer);
  const responderEvents = snapshot.events.filter((e) => e.event.from === responderPeer);
  if (focalEvents.length > 0 && focalFirstEventAt === undefined) {
    focalFirstEventAt = focalEvents.map((e) => e.event.createdAt).sort()[0];
  }
  if (focalEvents.length > 0) {
    const settled =
      responderEvents.length > 0 &&
      status.focal.wakeCount >= 1;
    if (settled) { stopReason = "exchange-settled"; break; }
    if (Date.now() > (Date.parse(focalFirstEventAt) + 180_000)) { stopReason = "response-window-elapsed"; break; }
  } else if (Date.now() > noContactDeadline) {
    stopReason = "no-contact-grace-elapsed";
    break;
  }
}

await stopAll();
const final = await readEvents();

// ---- Session-log facts -----------------------------------------------------
function sessionFacts(peer, session) {
  const root = join(runDir, peer.replace(/\W+/g, "-"), "sessions");
  const found = (function find(dir) {
    if (!existsSync(dir)) return [];
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...find(full));
      else if (entry.name === "session.v3.jsonl") out.push(full);
    }
    return out;
  })(root);
  const file = found.find((f) => f.includes(session)) ?? found[0];
  if (file === undefined) {
    return { sessionFile: null, userMessages: 0, pluginWakeNotices: 0, toolSteps: [], firstPostIndex: null, firstNoticeIndex: null, ackCalled: false, inboxCalled: false };
  }
  const lines = readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
  let userMessages = 0;
  let pluginWakeNotices = 0;
  const toolSteps = [];
  let messageIndex = 0;
  let firstPostIndex = null;
  let firstNoticeIndex = null;
  let ackCalled = false;
  let inboxCalled = false;
  for (const line of lines) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    const s = JSON.stringify(e);
    if (e.type === "user/message") {
      messageIndex += 1;
      if (s.includes("PAL-FED collaboration batch")) {
        pluginWakeNotices += 1;
        if (firstNoticeIndex === null) firstNoticeIndex = messageIndex;
      } else {
        userMessages += 1;
      }
    }
    if (e.type === "assistant/message") {
      const names = [...new Set([...s.matchAll(/"type":"tool-call","id":"[^"]*","name":"([a-z_]+)"/g)].map((m) => m[1]))];
      if (names.length) {
        toolSteps.push(names);
        if (names.includes("collab_post") && firstPostIndex === null) firstPostIndex = messageIndex;
        if (names.includes("collab_ack")) ackCalled = true;
        if (names.includes("collab_inbox")) inboxCalled = true;
      }
    }
  }
  const repoPrefix = [];
  let postStepIndex = null;
  toolSteps.forEach((names, i) => {
    if (postStepIndex === null && names.includes("collab_post")) postStepIndex = i;
  });
  const before = postStepIndex === null ? toolSteps : toolSteps.slice(0, postStepIndex);
  const repoCalls = toolSteps.flat().filter((n) => n.startsWith("repo_"));
  const inspectionBeforeContact = postStepIndex !== null && before.some((names) => names.some((n) => n.startsWith("repo_")));
  return { sessionFile: file.replace(runDir, "<run>"), userMessages, pluginWakeNotices, toolSteps, firstPostIndex, firstNoticeIndex, ackCalled, inboxCalled, repoCalls, inspectionBeforeContact };
}

const focalFacts = sessionFacts(focalPeer, focalSession);
const responderFacts = sessionFacts(responderPeer, responderSession);

const focalEvents = final.events.filter((e) => e.event.from === focalPeer);
const responderEvents = final.events.filter((e) => e.event.from === responderPeer);
const contractBy = new Map();
for (const record of final.contracts) {
  const decoded = fed.decodeBoundaryContract(record.value);
  const entry = contractBy.get(decoded.contractId) ?? { contractId: decoded.contractId, revisions: 0, agreed: false, accepts: 0 };
  entry.revisions += 1;
  entry.accepts = Math.max(entry.accepts, decoded.acceptedBy.length);
  if (decoded.status === "agreed") entry.agreed = true;
  contractBy.set(decoded.contractId, entry);
}
const contracts = [...contractBy.values()];
const responseContractChange = responderEvents.length > 0 || contracts.length > 0;

const autonomousInitiation =
  focalEvents.length > 0 &&
  focalFacts.firstPostIndex !== null &&
  (focalFacts.firstNoticeIndex === null || focalFacts.firstPostIndex <= focalFacts.firstNoticeIndex);
const sharedStateInitiation = autonomousInitiation && focalFacts.toolSteps.some((s) => s.includes("contract_update"));
const autonomousReceipt =
  focalEvents.length > 0 &&
  responderFacts.userMessages === 0 &&
  status.responder.wakeCount >= 1 &&
  responderFacts.inboxCalled;
const autonomousResponse = autonomousReceipt && responseContractChange;
const autonomousReplyDelivery = focalEvents.length > 0 && status.focal.wakeCount >= 1;

const batchesDelivered = (final.responderState.state.pending !== undefined ? 1 : 0) + (responderFacts.pluginWakeNotices > 0 ? 1 : 0);
const handledBatches = responderFacts.inboxCalled ? Math.max(1, responderFacts.pluginWakeNotices) : 0;
const ackedBatches = responderFacts.ackCalled ? 1 : 0;
const pendingAfterIdle = final.responderState.state.pending !== undefined;

const eventToWakeMs = focalFirstEventAt !== undefined && status.responder.lastWakeAt !== undefined
  ? Date.parse(status.responder.lastWakeAt) - Date.parse(focalFirstEventAt)
  : null;
const eventToResponseMs = focalFirstEventAt !== undefined && responderEvents.length > 0
  ? Date.parse(responderEvents.map((e) => e.event.createdAt).sort()[0]) - Date.parse(focalFirstEventAt)
  : null;

const result = {
  runId, scenarioId, scenarioClass, focalPeer, responderPeer, treatment: arm, replicate, runOrder,
  validity: "valid", stopReason,
  palimpsestCommit: palimpsestSnapshot.split(/[\\/]/).pop(),
  ordariumCommit: ordariumSnapshot.split(/[\\/]/).pop(),
  dshVersion: artifactMeta.dshVersion, ordarium: artifactMeta.ordarium,
  provider: "deepseek-official", model: "deepseek-flash",
  samplingConfig: "provider-exposed controls not available (no seed)",
  artifactBuildId: artifactMeta.buildId, artifactSha256: artifactMeta.frozenCodeSha256, artifactGuidance: artifactMeta.guidance,
  fabricId: fabric, focalSession, responderSession,
  autonomousInitiation, sharedStateInitiation,
  inspectionBeforeContact: focalFacts.inspectionBeforeContact === true,
  relevantLocalEvidenceTouched: (focalFacts.repoCalls?.length ?? 0) > 0,
  repoCallsFocal: focalFacts.repoCalls ?? [],
  prematureContact: autonomousInitiation && focalFacts.inspectionBeforeContact !== true, autonomousReceipt, autonomousResponse, autonomousReplyDelivery,
  eventCount: final.events.length,
  eventKinds: final.events.map((e) => e.event.kind),
  eventChars: final.events.map((e) => e.event.body.length),
  contractRevisionCount: contracts.reduce((n, c) => n + c.revisions, 0),
  contractAgreement: contracts.some((c) => c.agreed),
  contractAccepts: Math.max(0, ...contracts.map((c) => c.accepts), 0),
  wakeCountFocal: status.focal.wakeCount, wakeCountResponder: status.responder.wakeCount,
  deliveredBatchCount: batchesDelivered, handledBatchCount: handledBatches, ackedBatchCount: ackedBatches, pendingAfterIdle,
  eventToWakeMs, eventToResponseMs,
  userMessagesFocal: focalFacts.userMessages, userMessagesResponder: responderFacts.userMessages,
  pluginWakeNoticesFocal: focalFacts.pluginWakeNotices, pluginWakeNoticesResponder: responderFacts.pluginWakeNotices,
  toolStepsFocal: focalFacts.toolSteps, toolStepsResponder: responderFacts.toolSteps,
  eventBodiesPreview: final.events.map((e) => ({ from: e.event.from, kind: e.event.kind, body: e.event.body.slice(0, 300) })),
  notes: [],
};
writeFileSync(join(runDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(`PAL_FED_0E_RESULT ${JSON.stringify(result)}`);
process.exit(0);
