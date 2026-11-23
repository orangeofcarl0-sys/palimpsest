
/**
 * Offline readback for an archived GitHub maintenance session.
 *
 * The two inputs are evidence, never authority:
 *   summary — the session's original result (original verdict and retained candidate)
 *   trace   — the paired facts (settlement, transport, natural exit, actual tool calls, conclusion)
 *
 * Nothing here writes to the archive. A report is only a re-derivation from those bytes.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { digest, readJson } from "../../energy/contract.mjs";

const EPISODE_SCHEMA = "pc1-episode-conclusion/v1";
const EPISODE_MARKER = "<!-- pc1-episode-conclusion:v1 -->";

function bodyRecord(body) {
  if (typeof body !== "string") return null;
  const marker = body.indexOf(EPISODE_MARKER);
  if (marker >= 0) {
    try {
      const parsed = JSON.parse(body.slice(marker + EPISODE_MARKER.length).trim());
      if (parsed?.schema === EPISODE_SCHEMA) return parsed;
    } catch { /* fall through to the line-oriented archive form */ }
  }
  for (const line of body.split(/\r?\n/u)) {
    const text = line.trim();
    if (!text.startsWith('{"schema":"' + EPISODE_SCHEMA + '"')) continue;
    try {
      const parsed = JSON.parse(text);
      if (parsed?.schema === EPISODE_SCHEMA) return parsed;
    } catch { /* an unrelated malformed line is not a conclusion */ }
  }
  return null;
}

function conclusionFacts(value) {
  if (!value || typeof value !== "object") return null;
  const record = bodyRecord(value.body) ??
    (value.schema === EPISODE_SCHEMA || value.check ? value : null);
  const intent = typeof value.intent === "string" ? value.intent : record?.intent;
  const eventId = typeof value.eventId === "string" ? value.eventId
    : typeof value.event_id === "string" ? value.event_id : null;
  const artifacts = [];
  for (const list of [record?.check?.artifacts, value.check?.artifacts, record?.artifacts, value.artifacts]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (item && typeof item === "object" && typeof item.path === "string") artifacts.push(item);
    }
  }
  const requiredPaths = [record?.artifacts, value.artifacts].find(list =>
    Array.isArray(list) && list.every(item => typeof item === "string")) ?? [];
  return { intent, eventId, artifacts, requiredPaths };
}

function candidateBoundDelivery(conclusion, candidate, previousConclusion) {
  const facts = conclusionFacts(conclusion);
  if (!facts || facts.intent !== "DELIVER" || !facts.eventId || typeof candidate !== "string" || !candidate) return null;
  if (previousConclusion && facts.eventId === previousConclusion) return null;
  const bound = facts.artifacts.filter(artifact =>
    artifact.committed === true && artifact.commit === candidate && typeof artifact.path === "string");
  if (bound.length === 0) return null;
  if (facts.requiredPaths.length > 0 && !facts.requiredPaths.every(path =>
    bound.some(artifact => artifact.path === path))) return null;
  return facts.eventId;
}

/**
 * Re-derive the delivery boundary from two archived facts.
 *
 * - originalPass   the original result's own verdict (`summary.pass`)
 * - natural        the observed ordinary session exit (`trace.execution.natural`)
 * - candidateSaved the retained submission was valid (`summary.submission.valid`)
 * - candidate      the exact retained candidate SHA, or null
 * - projectReadCall the actual successful pulse tool call ID, or null
 * - delivery       the conclusion event ID only when it is DELIVER and every cited artifact is
 *                  committed at the candidate SHA; otherwise null
 */
export function inspectArchivedDelivery(summary, trace) {
  const submission = summary?.submission;
  const candidate = typeof submission?.candidate === "string" ? submission.candidate : null;
  const calls = Array.isArray(trace?.calls) ? trace.calls
    : Array.isArray(trace?.trajectory?.calls) ? trace.trajectory.calls : [];
  const pulse = calls.find(call => call?.tool === "palimpsest_continuity" &&
    call?.action === "pulse" && call?.ok === true && typeof call?.callId === "string" && call.callId !== "");
  // The paired trace is the canonical read; fall back to the original summary when a replay
  // carries the conclusion there. A later wrong-SHA conclusion therefore cannot inherit an old
  // delivery from the other copy: exactly one conclusion is inspected.
  const conclusion = trace?.conclusion ?? summary?.conclusion ?? null;
  const previousConclusion = trace?.previousConclusion ?? summary?.previousConclusion ?? null;
  return {
    originalPass: summary?.pass === true,
    natural: trace?.execution?.natural === true,
    candidateSaved: submission?.valid === true,
    candidate,
    projectReadCall: pulse?.callId ?? null,
    delivery: candidateBoundDelivery(conclusion, candidate, previousConclusion),
  };
}

function verifyArchive(root) {
  const indexPath = join(root, "sources.json");
  const manifest = existsSync(indexPath) ? readJson(indexPath) : null;
  if (manifest) {
    assert.equal(manifest.schema, "pnwf-task-evidence-workset/v1", "ARCHIVE_INDEX_SCHEMA_CHANGED");
    assert(Array.isArray(manifest.sources) && manifest.sources.length > 0, "ARCHIVE_INDEX_EMPTY");
    assert.deepEqual(readdirSync(root).sort(), ["sources.json", ...manifest.sources.map(source => source.file)].sort(),
      "ARCHIVE_FILE_SET_CHANGED");
    for (const source of manifest.sources) {
      assert.equal(digest(readFileSync(join(root, source.file))), source.sha256, "ARCHIVE_BYTES_CHANGED");
    }
  }
  return manifest;
}

function readArchive(root) {
  const manifest = verifyArchive(root);
  const names = manifest?.sources.map(source => source.file) ?? readdirSync(root).filter(file => file.endsWith(".json"));
  const summaryName = names.find(file => file === "git-runtime-original-result.json");
  const traceName = names.find(file => file === "git-runtime-paired-facts.json");
  assert(summaryName && traceName, "ARCHIVE_DELIVERY_FACTS_MISSING");
  const summaryBytes = readFileSync(join(root, summaryName));
  const traceBytes = readFileSync(join(root, traceName));
  return {
    summary: JSON.parse(summaryBytes), trace: JSON.parse(traceBytes),
    inputs: {
      summary: { file: summaryName, sha256: digest(summaryBytes) },
      trace: { file: traceName, sha256: digest(traceBytes) },
      ...(manifest ? { sources: digest(readFileSync(join(root, "sources.json"))) } : {}),
    },
  };
}

function settlementFacts(trace) {
  const accounting = trace?.accounting;
  return {
    settled: trace?.usageState === "SETTLED" && trace?.attributionState === "COMPLETE" &&
      accounting?.unresolved === 0,
    usageState: trace?.usageState ?? null,
    attributionState: trace?.attributionState ?? null,
    accounting: accounting ?? null,
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [path, tracePath] = process.argv.slice(2);
  assert(path, "Usage: github-maintenance-recount.mjs <archived evidence directory> | <summary.json> <trace.json>");
  const archive = tracePath
    ? { summary: readJson(resolve(path)), trace: readJson(resolve(tracePath)),
      inputs: { summary: { file: resolve(path), sha256: digest(readFileSync(resolve(path))) },
        trace: { file: resolve(tracePath), sha256: digest(readFileSync(resolve(tracePath))) } } }
    : readArchive(resolve(path));
  const facts = inspectArchivedDelivery(archive.summary, archive.trace);
  console.log(JSON.stringify({
    inputs: archive.inputs,
    originalPass: facts.originalPass,
    settlement: settlementFacts(archive.trace),
    natural: facts.natural,
    candidateSaved: facts.candidateSaved,
    candidate: facts.candidate,
    projectReadCall: facts.projectReadCall,
    delivery: facts.delivery,
  }, null, 2));
}
