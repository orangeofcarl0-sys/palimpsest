/**
 * SR-1 R3A — the project tool cluster.
 *
 * palimpsest_project, palimpsest_manage, palimpsest_verification, palimpsest_external_assets, kept together because they read the
 * same application face(s). Adapter only: tool metadata, its own argument parsing and a call to
 * the application façade. It reaches no durable store and no semantic service directly (§12).
 */

import type { PalimpsestApplicationSurface } from "../../application/surface.js";
import { PROJECT_JOURNAL_KINDS, ProjectWorkspaceError } from "../../project_workspace/index.js";
import { MANAGEMENT_INVOLVEMENTS } from "../../project_management/index.js";
import { WORK_MODE_BASE_MODES, WORK_MODE_MODIFIERS } from "../../project_operating/work_mode_profile.js";
import type { DshToolDefinition } from "../../tools/dsh_types.js";
import { tool, ToolArgsError, required, requiredString, stringArray } from "./common.js";

export function defineProjectTools(application: PalimpsestApplicationSurface): DshToolDefinition[] {
  const tools: DshToolDefinition[] = [];
if (application.projectWorkspace !== undefined) {
    const workspace = application.projectWorkspace;
    tools.push(
      tool({
        name: "palimpsest_project",
        description:
          "The DERIVED project workspace: read the project overview, associated assets, derived open loops, and history; append a decision through the EXISTING ProjectIR validation; or record a journal entry. It owns no truth and copies no canonical fact. A decision is a ProjectIR lineage append (never an authority grant) and a journal entry is knowledge with no other canonical owner",
        mode: "mutating",
        actions: ["overview", "assets", "open_loops", "history", "decision", "journal"],
        extraProperties: {
          projectId: { type: "string", description: "defaults to this installation's project" },
          statement: { type: "string" },
          rationale: { type: "string" },
          evidenceIds: { type: "array", items: { type: "string" } },
          supersedes: { type: "string" },
          kind: { type: "string", enum: [...PROJECT_JOURNAL_KINDS] },
          title: { type: "string" },
          body: { type: "string" },
          provenance: { type: "string" },
          relatedRefs: { type: "array", items: { type: "object" }, description: "references to assets owned elsewhere (kind/id only; never a copy)" },
        },
        run: async (action, object) => {
          // G10-AE-R §9/§15: a NAMED project is never silently ignored. Every action
          // below is scoped to THIS installation's project, so a caller naming another
          // project must be refused rather than handed this project's data as if it
          // were that one's (the baseline silently dropped the parameter on the read
          // actions, so `{action:"assets", projectId:"project-B"}` answered with A's
          // assets and no indication the scope had been ignored). The mutating actions
          // below forward the id to the service's own fence; this one guard covers both.
          const named =
            typeof object.projectId === "string" && object.projectId.length > 0
              ? object.projectId
              : undefined;
          if (named !== undefined) {
            const current = (await workspace.view()).projectId;
            if (named !== current) {
              throw new ProjectWorkspaceError(
                "invalid_registration",
                `project "${named}" is not this installation's project "${current}"`,
              );
            }
          }
          if (action === "overview") return workspace.view();
          if (action === "assets") return workspace.assets();
          if (action === "open_loops") return workspace.openLoops();
          if (action === "history") return workspace.history();
          if (action === "decision") {
            const evidenceIds = Array.isArray(object.evidenceIds) ? stringArray(object.evidenceIds, "evidenceIds") : [];
            return workspace.appendDecision({
              ...(typeof object.projectId === "string" && object.projectId.length > 0 ? { projectId: object.projectId } : {}),
              statement: requiredString(object, "statement"),
              rationale: requiredString(object, "rationale"),
              evidenceIds,
              ...(object.supersedes === undefined ? {} : { supersedes: requiredString(object, "supersedes") }),
            });
          }
          return workspace.recordJournalEntry({
            ...(typeof object.projectId === "string" && object.projectId.length > 0 ? { projectId: object.projectId } : {}),
            kind: requiredString(object, "kind") as (typeof PROJECT_JOURNAL_KINDS)[number],
            title: requiredString(object, "title"),
            body: requiredString(object, "body"),
            provenance: requiredString(object, "provenance"),
            ...(object.relatedRefs === undefined ? {} : { relatedRefs: object.relatedRefs as never }),
          });
        },
      }),
    );
  }

  if (application.projectManagement !== undefined) {
    const management = application.projectManagement;
    tools.push(
      tool({
        name: "palimpsest_manage",
        description:
          "Graduated project-management autonomy (mode ≠ authority): inspect status, list recommendations, preview the next bounded step, execute one bounded local step or a bounded run through the EXISTING governed services, REQUEST an involvement change, or run the mechanical project-head reconciliation. It can never grant authority/commitment/disclosure, can never set the mode upward — only the operator control plane does — and reconciling the head never promotes an attempt",
        mode: "mutating",
        actions: [
          "status",
          "recommend",
          "preview",
          "step",
          "run",
          "request_mode_change",
          "reconcile_project_head",
          // G10-AB (additive): the derived operating posture, the durable management activity
          // history, and a Work Mode REQUEST. Reading is read-only; the request never persists
          // the user-level default - only the operator control plane does.
          "posture",
          "activity",
          "request_work_mode_change",
        ],
        extraProperties: {
          confirmed: { type: "boolean", description: "confirms a step that sits on a confirmation boundary" },
          maxSteps: { type: "number", description: "bounded run budget; never exceeds the operator profile budget" },
          to: { type: "string", enum: [...MANAGEMENT_INVOLVEMENTS], description: "the involvement being REQUESTED (a request only; never applied here)" },
          baseMode: { type: "string", enum: ["FOCUS", "EXPLORE", "COORDINATE"], description: "the Work Mode being REQUESTED (a request only; never persisted here)" },
          modifiers: { type: "array", items: { type: "string", enum: ["VERIFY", "MONITOR"] }, description: "the Work Mode modifiers being REQUESTED" },
          limit: { type: "number", description: "how many recent activity records to return" },
        },
        run: async (action, object) => {
          if (action === "status") return management.status();
          if (action === "recommend") return management.recommend();
          if (action === "preview") return management.preview();
          // G10-X: the mechanical head reconciliation. No caller head/commit/plan
          // is accepted; it delegates to the canonical controller derivation.
          if (action === "reconcile_project_head") return management.reconcileProjectHead();
          if (action === "posture") return management.posture();
          if (action === "activity") {
            const limit = object.limit;
            if (limit !== undefined && (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1)) {
              throw new ToolArgsError('argument "limit" must be a positive integer');
            }
            return management.activity(limit === undefined ? undefined : limit);
          }
          if (action === "request_work_mode_change") {
            const baseMode = requiredString(object, "baseMode");
            if (!WORK_MODE_BASE_MODES.includes(baseMode as never)) {
              throw new ToolArgsError(`argument "baseMode" must be one of ${WORK_MODE_BASE_MODES.join(", ")}`);
            }
            const modifiers = stringArray(object.modifiers ?? [], "modifiers");
            for (const modifier of modifiers) {
              if (!WORK_MODE_MODIFIERS.includes(modifier as never)) {
                throw new ToolArgsError(`argument "modifiers" entries must be one of ${WORK_MODE_MODIFIERS.join(", ")}`);
              }
            }
            // A REQUEST only: an agent recommendation is never an operator preference change.
            return management.requestWorkModeChange({
              baseMode: baseMode as (typeof WORK_MODE_BASE_MODES)[number],
              modifiers: modifiers as readonly (typeof WORK_MODE_MODIFIERS)[number][],
            });
          }
          if (action === "request_mode_change") {
            const to = requiredString(object, "to");
            if (!(MANAGEMENT_INVOLVEMENTS as readonly string[]).includes(to)) {
              throw new ToolArgsError(`argument "to" must be one of ${MANAGEMENT_INVOLVEMENTS.join(", ")}`);
            }
            return management.requestModeChange({ to: to as (typeof MANAGEMENT_INVOLVEMENTS)[number] });
          }
          if (action === "step") {
            if (object.confirmed !== undefined && typeof object.confirmed !== "boolean") throw new ToolArgsError('argument "confirmed" must be a boolean');
            return management.step(object.confirmed === undefined ? {} : { confirmed: object.confirmed });
          }
          const maxSteps = object.maxSteps;
          if (maxSteps !== undefined && (typeof maxSteps !== "number" || !Number.isSafeInteger(maxSteps) || maxSteps < 1)) {
            throw new ToolArgsError('argument "maxSteps" must be a positive integer');
          }
          return management.run(maxSteps === undefined ? {} : { maxSteps });
        },
      }),
    );
  }

  /*
   * G10-AD §22/§23: the AGENT face of Project Verification.
   *
   *   VerificationResult ≠ Truth, ≠ Work Evidence, ≠ Proof publication,
   *   ≠ Reasoning admission, ≠ task state, ≠ authority
   *
   * The tool can read the DERIVED current-head status and the append-only
   * history, and it can REQUEST a verification of the exact current project head
   * under a REGISTERED verifier ref. It cannot register a verifier, change an
   * independence class, supply a command, or claim its own context is independent:
   * the only verifier-shaped input is a registered `verifierRef` the runtime
   * resolves (and refuses when unknown).
   */
  if (application.verification !== undefined) {
    const verification = application.verification;
    tools.push(
      tool({
        name: "palimpsest_verification",
        description:
          "Project-head verification: read the DERIVED status of the exact current ProjectIR head, read the append-only run history, or request a verification under a REGISTERED verifier protocol. A PASS means only 'that named protocol passed' — it is not truth, not Work Evidence, not Proof publication, not Reasoning admission, not task state and not authority. An agent can never register a verifier, change an independence class, supply a command, or verify an arbitrary commit",
        mode: "mutating",
        actions: ["status", "history", "verify_current_head"],
        extraProperties: {
          verifierRef: { type: "string", description: "a REGISTERED verifier ref to select; never a command" },
          reason: { type: "string" },
          limit: { type: "number", description: "how many recent runs to return (newest first)" },
        },
        run: async (action, object) => {
          if (action === "status") return verification.status();
          if (action === "history") {
            const limit = object.limit;
            if (limit !== undefined && (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1)) {
              throw new ToolArgsError('argument "limit" must be a positive integer');
            }
            return verification.history(limit === undefined ? undefined : limit);
          }
          return verification.verifyCurrentHead({
            ...(object.verifierRef === undefined ? {} : { verifierRef: requiredString(object, "verifierRef") }),
            ...(object.reason === undefined ? {} : { reason: requiredString(object, "reason") }),
          });
        },
      }),
    );
  }

  /*
   * G10-AE §13/§28: the AGENT face of the External Asset Library bridge.
   *
   *   SearchResult != StableAssetRef      ExternalAsset != ProjectContext
   *   Reference != Import                 Import != TruthAdmission
   *   PublicationPreview != Publication   AgentPrepare != OperatorApproval
   *
   * The tool can list providers, search the external library, inspect an exact
   * revision and PREPARE a reference / an import / a publication preview. It
   * deliberately has NO `commit_reference`, NO `commit_import` and NO
   * `approve_publish`: those are operator-explicit operations on the application
   * surface, and publication approval additionally lives behind the plane's
   * separate admission port. The tool is `read-only` in mode because every action
   * it exposes persists nothing — a search page is ephemeral, an inspection is a
   * snapshot, and a prepared candidate is a candidate.
   */
  if (application.externalAssets !== undefined) {
    const externalAssets = application.externalAssets;
    tools.push(
      tool({
        name: "palimpsest_external_assets",
        description:
          "The external asset library bridge (READ/PREPARE ONLY): list the configured providers and their capabilities, search an external library (ephemeral hits, zero project mutation), inspect the EXACT digest-bound revision of one asset, and prepare a read-only reference candidate, import candidate or publication preview for an operator to commit. Search and inspect never enter project context; a search hit is never a durable reference; a prepared preview is not a publication. This tool can NOT commit a reference, can NOT import into the Journal and can NOT approve a publication",
        mode: "read-only",
        actions: ["providers", "search", "inspect", "prepare_reference", "prepare_import", "prepare_publication"],
        extraProperties: {
          providerId: { type: "string", description: "a CONFIGURED provider id (never a URL or a credential)" },
          text: { type: "string", description: "the search text; queries are never persisted by Palimpsest" },
          limit: { type: "number", description: "a positive page bound" },
          assetTypes: { type: "array", items: { type: "string" }, description: "provider-owned asset types to filter by" },
          assetId: { type: "string" },
          contentDigest: { type: "string", description: "the EXACT sha256 revision to resolve; a newer revision never substitutes" },
          externalRef: { type: "object", description: "an exact ExternalAssetStableRef (providerId/assetId/contentDigest/refDigest)" },
          journalKind: { type: "string", enum: [...PROJECT_JOURNAL_KINDS], description: "the EXPLICIT Journal kind an import would target; never derived from a provider type" },
          title: { type: "string" },
          sourceLocator: { type: "string" },
          targetAssetType: { type: "string", description: "the provider-owned type the outbound publication would declare" },
          journalEntryId: { type: "string", description: "the LOCAL journal entry a publication preview would export" },
          projectId: { type: "string", description: "defaults to this installation's project" },
        },
        run: async (action, object) => {
          if (action === "providers") return externalAssets.providers();
          const projectId = typeof object.projectId === "string" && object.projectId.length > 0 ? object.projectId : undefined;
          if (action === "search") {
            const limit = object.limit;
            if (limit !== undefined && (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1)) {
              throw new ToolArgsError('argument "limit" must be a positive integer');
            }
            const assetTypes = Array.isArray(object.assetTypes) ? stringArray(object.assetTypes, "assetTypes") : [];
            return externalAssets.search({
              providerId: requiredString(object, "providerId"),
              text: requiredString(object, "text"),
              ...(limit === undefined ? {} : { limit }),
              ...(assetTypes.length === 0 ? {} : { assetTypes }),
            });
          }
          if (action === "inspect") {
            return externalAssets.inspect({
              providerId: requiredString(object, "providerId"),
              assetId: requiredString(object, "assetId"),
              ...(object.contentDigest === undefined
                ? {}
                : { contentDigest: requiredString(object, "contentDigest") }),
            });
          }
          if (action === "prepare_reference") {
            return externalAssets.prepareReference({
              providerId: requiredString(object, "providerId"),
              assetId: requiredString(object, "assetId"),
              ...(object.contentDigest === undefined
                ? {}
                : { contentDigest: requiredString(object, "contentDigest") }),
              ...(projectId === undefined ? {} : { projectId }),
            });
          }
          if (action === "prepare_import") {
            const journalKind = requiredString(object, "journalKind");
            if (!(PROJECT_JOURNAL_KINDS as readonly string[]).includes(journalKind)) {
              throw new ToolArgsError(`argument "journalKind" must be one of ${PROJECT_JOURNAL_KINDS.join(", ")}`);
            }
            return externalAssets.prepareImport({
              externalRef: required(object, "externalRef") as never,
              journalKind: journalKind as (typeof PROJECT_JOURNAL_KINDS)[number],
              title: requiredString(object, "title"),
              ...(object.sourceLocator === undefined
                ? {}
                : { sourceLocator: requiredString(object, "sourceLocator") }),
              ...(projectId === undefined ? {} : { projectId }),
            });
          }
          return externalAssets.preparePublication({
            providerId: requiredString(object, "providerId"),
            targetAssetType: requiredString(object, "targetAssetType"),
            journalEntryId: requiredString(object, "journalEntryId"),
            ...(projectId === undefined ? {} : { projectId }),
          });
        },
      }),
    );
  }
  return tools;
}
