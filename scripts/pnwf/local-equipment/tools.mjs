/** Local fixture tools. The deployment-owned project tools persist the checkpoint and question. */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, linkSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export const name = "local-equipment-fixture";
export const inject = ["tools", "palimpsestHost"];
export const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
export const receiptId = (receipt) => "review-" + digest(JSON.stringify(receipt));
const relation = "local_equipment_review";
const receiptRef = /\breview-[a-f0-9]{64}\b/gu;
const requiredByAction = {
  inspect: [],
  write_recommendation: ["choice", "status", "minutes", "evidence"],
  request_review: ["checkpointId", "question"],
  read_receipt: ["requestId", "checkpointId"],
  resolve_review: ["requestId", "receiptId"],
};

function receiptFile(slot, requestId) {
  if (!/^pje-[a-f0-9]{32}$/u.test(requestId)) throw new Error("INVALID_REVIEW_REQUEST_ID");
  return join(dirname(slot), "receipts", requestId + ".json");
}

export function publishReviewReceipt(slot, receipt) {
  const path = receiptFile(slot, receipt.requestId);
  const bytes = JSON.stringify(receipt, null, 2) + "\n";
  mkdirSync(dirname(path), { recursive: true });
  const temporary = path + "." + randomUUID();
  try {
    writeFileSync(temporary, bytes, { flag: "wx", flush: true });
    try { linkSync(temporary, path); }
    catch (error) {
      if (error.code !== "EEXIST" || readFileSync(path, "utf8") !== bytes) throw error;
    }
  } finally { rmSync(temporary, { force: true }); }
  writeFileSync(slot, bytes);
}

export async function apply(ctx, config) {
  const { deployment, profile } = ctx.palimpsestHost;
  const workspace = deployment.installed.application.projectWorkspace;
  if (profile.repository !== undefined || deployment.installed.federation !== undefined ||
      deployment.transport.adapterId !== "disabled" || !workspace?.localAssetCheckpoints) {
    throw new Error("equipment fixture requires the local deployment with asset checkpoints");
  }
  const checkpoints = workspace.localAssetCheckpoints;
  const workbook = await import(pathToFileURL(config.workbookModule).href);
  const { file, publicFacts, receiptPath } = config;
  const draft = join(profile.localAssetCheckpoints.root, file);

  async function question(entryId) {
    const entries = await workspace.journal();
    const reviews = entries.filter(({ entry }) => entry.kind === "OPEN_QUESTION" && entry.relatedRefs.some(({ kind }) => kind === relation));
    const row = reviews.findLast(({ entry }) =>
      (entryId === undefined || entry.entryId === entryId));
    if (!row) return null;
    const successor = reviews.find(({ entry }) => entry.supersedes === row.entry.entryId)?.entry.entryId;
    return { id: row.entry.entryId, checkpointId: row.entry.relatedRefs.find(({ kind }) => kind === relation).id,
      question: row.entry.body, state: successor ? "SUPERSEDED" : row.resolution?.status ?? "PENDING",
      ...(row.entry.supersedes === undefined ? {} : { supersedes: row.entry.supersedes }),
      ...(successor === undefined ? {} : { supersededBy: successor }) };
  }

  function loadReceipt(request) {
    if (request === null) return null;
    const history = receiptFile(receiptPath, request.id);
    const path = existsSync(history) ? history : receiptPath;
    if (!existsSync(path)) return null;
    const { id, ...body } = readJson(path);
    if (path === receiptPath && body.requestId !== request.id) return null;
    if (id !== receiptId(body) || body.projectId !== profile.projectId || body.requestId !== request.id ||
        body.checkpointId !== request.checkpointId || body.reviewer !== "bench-custodian") {
      throw new Error("REVIEW_RECEIPT_BINDING_MISMATCH");
    }
    return { id, ...body };
  }

  function digestOfDraft() {
    return existsSync(draft) ? digest(readFileSync(draft)) : null;
  }

  function requireOpen(request) {
    if (request?.state === "SUPERSEDED") throw new Error("REVIEW_REQUEST_SUPERSEDED: use request " + request.supersededBy);
    if (request?.state !== "PENDING") throw new Error("REVIEW_REQUEST_NOT_OPEN");
  }

  const properties = {
    action: { type: "string", enum: Object.keys(requiredByAction), description: Object.entries(requiredByAction)
      .map(([action, fields]) => action + (fields.length ? " requires " + fields.join(", ") : " takes no required fields")).join(". ") + "." },
    choice: { type: "string", enum: ["A", "B"] },
    status: { type: "string", enum: ["建议", "待复核"] },
    minutes: { type: ["integer", "null"], minimum: 0,
      description: "Required for write_recommendation. Give measured minutes as an integer or pass null explicitly when unknown." },
    evidence: { type: "string" },
    checkpointId: { type: "string" },
    question: { type: "string" },
    requestId: { type: "string" },
    receiptId: { type: "string" },
  };
  let operations = Promise.resolve();
  ctx.tools.register({
    name: "equipment_review",
    description: "Inspect the equipment dossier and draft. Use inspect.workbookPath as the exact path for palimpsest_asset_checkpoint. " +
      "write_recommendation requires choice, status, minutes and evidence. Give an integer for minutes or explicit null when unknown. " +
      "If you need the bench custodian, request_review binds the question to the current saved draft. Reissue on the newest checkpoint " +
      "to replace an older pending request after editing. Read and apply a returned receipt on its exact source draft before saving the revised result.",
    parameters: { type: "object", properties, required: ["action"], additionalProperties: false },
    output: { schema: {}, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] },
    execute(args) {
      const result = operations.then(() => execute(args));
      operations = result.catch(() => {});
      return result;
    },
  });
  async function execute(args) {
    if (Object.keys(args).some((key) => !Object.hasOwn(properties, key))) throw new Error("UNKNOWN_EQUIPMENT_ARGUMENT");
    if (args.action === undefined) throw new Error("MISSING_EQUIPMENT_ARGUMENTS: action");
    if (!Object.hasOwn(requiredByAction, args.action)) throw new Error("UNKNOWN_EQUIPMENT_ACTION");
    const missing = requiredByAction[args.action].filter((key) => !Object.hasOwn(args, key) || args[key] === undefined);
    if (missing.length) throw new Error("MISSING_EQUIPMENT_ARGUMENTS: " + args.action + " requires " + missing.join(", ") +
      (missing.includes("minutes") ? " (pass measured integer minutes or explicit null)" : ""));
    const checkpoint = checkpoints.latest(file);
    const pending = await question(args.action === "request_review" || args.action === "write_recommendation" ? undefined : args.requestId);
    if (args.action === "inspect") {
      const replacement = pending?.state === "PENDING" && checkpoint && pending.checkpointId !== checkpoint.id
        ? { reviewBasis: { state: "STALE", currentCheckpointId: checkpoint.id, requestCheckpointId: pending.checkpointId,
          next: "Restore the saved draft when absent. If review is still needed, request_review on the current checkpoint replaces the older request." } }
        : {};
      return { workbookPath: file, facts: readJson(publicFacts), checkpoint, review: pending, ...replacement, draft: existsSync(draft)
        ? { ...await workbook.readWorkbook(draft), digest: digest(readFileSync(draft)) }
        : null };
    }
    if (args.action === "write_recommendation") {
      const valid = {
        choice: ["A", "B"].includes(args.choice), status: ["建议", "待复核"].includes(args.status),
        minutes: args.minutes === null || Number.isSafeInteger(args.minutes) && args.minutes >= 0,
        evidence: typeof args.evidence === "string" && Boolean(args.evidence.trim()),
      };
      const invalid = Object.keys(valid).filter((key) => !valid[key]);
      if (invalid.length) throw new Error("INVALID_EQUIPMENT_RECOMMENDATION: " + invalid.join(", "));
      const cited = args.evidence.match(receiptRef);
      if (cited) {
        requireOpen(pending);
        if (!checkpoint || pending.checkpointId !== checkpoint.id || checkpoint.digest !== digestOfDraft()) {
          throw new Error("REVIEW_RECEIPT_BASIS_MISMATCH: apply evidence on the exact draft named by the current request");
        }
        const receipt = loadReceipt(pending);
        if (!receipt || cited.some((id) => id !== receipt.id)) throw new Error("REVIEW_RECEIPT_BINDING_MISMATCH");
      }
      await workbook.editWorkbook(draft, args);
      return workbook.readWorkbook(draft);
    }
    if (args.action === "request_review") {
      if (!checkpoint || args.checkpointId !== checkpoint.id || checkpoint.digest !== digestOfDraft() ||
          typeof args.question !== "string" || !args.question.trim()) {
        throw new Error("REVIEW_REQUEST_BASIS_MISMATCH: request_review requires the current saved draft bytes and checkpointId");
      }
      if (pending?.state === "PENDING" && pending.checkpointId === checkpoint.id) {
        if (pending.question === args.question) return pending;
        throw new Error("OPEN_REVIEW_ALREADY_EXISTS: this checkpoint already has a pending request " + pending.id);
      }
      const entry = await workspace.recordJournalEntry({
        kind: "OPEN_QUESTION", title: "记录器联机续航复核", body: args.question, provenance: "local review requested by Principal",
        relatedRefs: [{ kind: relation, id: checkpoint.id }, { kind: "reviewer", id: "bench-custodian" }],
        ...(pending?.state === "PENDING" ? { supersedes: pending.id } : {}),
      });
      return question(entry.entryId);
    }
    if (args.action === "read_receipt") {
      requireOpen(pending);
      if (typeof args.requestId !== "string" || pending?.id !== args.requestId || !checkpoint || args.checkpointId !== checkpoint.id ||
          pending.checkpointId !== checkpoint.id || checkpoint.digest !== digestOfDraft()) {
        throw new Error("REVIEW_RECEIPT_BASIS_MISMATCH: read on the exact saved draft for the request; reissue on a newer checkpoint if needed");
      }
      return { request: pending, receipt: loadReceipt(pending) };
    }
    if (args.action === "resolve_review") {
      requireOpen(pending);
      const receipt = loadReceipt(pending);
      const row = await workbook.readWorkbook(draft);
      const cited = typeof row.logger[4] === "string" ? row.logger[4].match(receiptRef) : null;
      if (typeof args.requestId !== "string" || pending?.id !== args.requestId || !receipt || args.receiptId !== receipt.id ||
          !checkpoint || checkpoint.id === pending.checkpointId || checkpoint.digest !== digestOfDraft() ||
          !cited || cited.some((item) => item !== receipt.id)) {
        throw new Error("REVIEW_RESOLUTION_EVIDENCE_MISMATCH");
      }
      await workspace.resolveJournalEntry({
        entryId: pending.id, resolution: { status: "RESOLVED", detail: receipt.id + " applied in " + checkpoint.id },
      });
      return question(pending.id);
    }
    throw new Error("UNKNOWN_EQUIPMENT_ACTION");
  }
}
