/** Local fixture tools. The deployment-owned project tools persist the checkpoint and question. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const name = "local-equipment-fixture";
export const inject = ["tools", "palimpsestHost"];
export const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
export const receiptId = (receipt) => "review-" + digest(JSON.stringify(receipt));
const relation = "local_equipment_review";
const requiredByAction = {
  inspect: [],
  write_recommendation: ["choice", "status", "minutes", "evidence"],
  request_review: ["checkpointId", "question"],
  read_receipt: ["requestId", "checkpointId"],
  resolve_review: ["requestId", "receiptId"],
};

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
    const row = entries.findLast(({ entry }) => entry.relatedRefs.some(({ kind }) => kind === relation) &&
      (entryId === undefined || entry.entryId === entryId));
    if (!row) return null;
    return { id: row.entry.entryId, checkpointId: row.entry.relatedRefs.find(({ kind }) => kind === relation).id,
      question: row.entry.body, state: row.resolution === undefined ? "PENDING" : "RESOLVED" };
  }

  function loadReceipt(request) {
    if (request === null || !existsSync(receiptPath)) return null;
    const { id, ...body } = readJson(receiptPath);
    if (id !== receiptId(body) || body.projectId !== profile.projectId || body.requestId !== request.id ||
        body.checkpointId !== request.checkpointId || body.reviewer !== "bench-custodian") {
      throw new Error("REVIEW_RECEIPT_BINDING_MISMATCH");
    }
    return { id, ...body };
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
  ctx.tools.register({
    name: "equipment_review",
    description: "Inspect the equipment dossier and draft. Use inspect.workbookPath as the exact path for palimpsest_asset_checkpoint. " +
      "write_recommendation requires choice, status, minutes and evidence. Give an integer for minutes or explicit null when unknown. " +
      "The bench custodian can answer a specific question bound to a saved draft.",
    parameters: { type: "object", properties, required: ["action"], additionalProperties: false },
    output: { schema: {}, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] },
    async execute(args) {
      if (Object.keys(args).some((key) => !Object.hasOwn(properties, key))) throw new Error("UNKNOWN_EQUIPMENT_ARGUMENT");
      if (args.action === undefined) throw new Error("MISSING_EQUIPMENT_ARGUMENTS: action");
      if (!Object.hasOwn(requiredByAction, args.action)) throw new Error("UNKNOWN_EQUIPMENT_ACTION");
      const missing = requiredByAction[args.action].filter((key) => !Object.hasOwn(args, key) || args[key] === undefined);
      if (missing.length) throw new Error("MISSING_EQUIPMENT_ARGUMENTS: " + args.action + " requires " + missing.join(", ") +
        (missing.includes("minutes") ? " (pass measured integer minutes or explicit null)" : ""));
      const checkpoint = checkpoints.latest(file);
      const pending = await question(args.requestId);
      if (args.action === "inspect") {
        return { workbookPath: file, facts: readJson(publicFacts), checkpoint, review: pending, draft: existsSync(draft)
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
        await workbook.editWorkbook(draft, args);
        return workbook.readWorkbook(draft);
      }
      if (args.action === "request_review") {
        if (!checkpoint || args.checkpointId !== checkpoint.id || checkpoint.digest !== digest(readFileSync(draft)) ||
            typeof args.question !== "string" || !args.question.trim()) throw new Error("REVIEW_REQUEST_BASIS_MISMATCH");
        if (pending?.state === "PENDING") {
          if (pending.checkpointId === checkpoint.id && pending.question === args.question) return pending;
          throw new Error("OPEN_REVIEW_ALREADY_EXISTS");
        }
        const entry = await workspace.recordJournalEntry({
          kind: "OPEN_QUESTION", title: "记录器联机续航复核", body: args.question, provenance: "local review requested by Principal",
          relatedRefs: [{ kind: relation, id: checkpoint.id }, { kind: "reviewer", id: "bench-custodian" }],
        });
        return { id: entry.entryId, checkpointId: checkpoint.id, question: args.question, state: "PENDING" };
      }
      if (args.action === "read_receipt") {
        if (typeof args.requestId !== "string" || pending?.id !== args.requestId || !checkpoint || args.checkpointId !== checkpoint.id ||
            pending.checkpointId !== checkpoint.id || checkpoint.digest !== digest(readFileSync(draft))) {
          throw new Error("REVIEW_RECEIPT_BASIS_MISMATCH");
        }
        return { request: pending, receipt: loadReceipt(pending) };
      }
      if (args.action === "resolve_review") {
        const receipt = loadReceipt(pending);
        const row = await workbook.readWorkbook(draft);
        if (typeof args.requestId !== "string" || pending?.id !== args.requestId || !receipt || args.receiptId !== receipt.id ||
            !checkpoint || checkpoint.id === pending.checkpointId || checkpoint.digest !== digest(readFileSync(draft)) ||
            row.logger[4] !== receipt.id) {
          throw new Error("REVIEW_RESOLUTION_EVIDENCE_MISMATCH");
        }
        await workspace.resolveJournalEntry({
          entryId: pending.id, resolution: { status: "RESOLVED", detail: receipt.id + " applied in " + checkpoint.id },
        });
        return question(pending.id);
      }
      throw new Error("UNKNOWN_EQUIPMENT_ACTION");
    },
  });
}
