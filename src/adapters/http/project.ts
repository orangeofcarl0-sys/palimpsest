/**
 * SR-1 R3B — the project route cluster: the project workspace read model, journal and decisions,
 * management autonomy, the monitor and project-head verification.
 *
 * One cluster because they are one project's own record and its governed operation: what the
 * project knows (workspace/journal/decision/asset association), how it is driven (management
 * recommend/step/run), what it is doing (monitor), and whether its head still verifies.
 *
 * Two routes are surface-first — `/api/project/journal` and, in an unconfigured installation, the
 * whole workspace block: the face is resolved before the method guard, so an absent workspace
 * answers 501 for every method rather than 400 for the wrong one.
 */

import {
  InvalidRequest,
  bodyObject,
  enumValue,
  parseBody,
  queryRequired,
  requireSurface,
  route,
  str,
  type ApplicationRouteDescriptor,
} from "./common.js";
import type { PalimpsestApplicationSurface } from "../../application/surface.js";
import { ProjectWorkspaceError, ASSOCIATION_KINDS, PROJECT_ASSET_KINDS, PROJECT_JOURNAL_KINDS, PROJECT_JOURNAL_RESOLUTION_STATUSES, parseCanonicalAssetRef } from "../../project_workspace/index.js";
import { MANAGEMENT_INVOLVEMENTS } from "../../project_management/index.js";
import {
  WORK_MODE_BASE_MODES,
  WORK_MODE_MODIFIERS,
  type WorkModeBaseMode,
  type WorkModeModifier,
} from "../../project_operating/work_mode_profile.js";

export const PROJECT_ROUTES: readonly ApplicationRouteDescriptor[] = [
  /* ---- project workspace (G10-V; DERIVED read model + two owned histories) ---- */
  /**
   * G10-AE-R §9/§15: these routes are scoped to the INSTALLED project, so a `projectId` query naming
   * a different project is refused rather than ignored. The baseline answered 200 with the current
   * project's payload while silently dropping the parameter, which let a caller believe it had read
   * another scope. The check is deliberately uniform across the project read routes (the journal
   * route's own fence is in the service); the service enforces the same rule again.
   */
  route({
    path: "/api/project/workspace",
    methods: ["GET"],
    face: "projectWorkspace",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(await (await projectReadSurface(application, query)).view());
    },
  }),
  route({
    path: "/api/project/assets",
    methods: ["GET"],
    face: "projectWorkspace",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(await (await projectReadSurface(application, query)).assets());
    },
  }),
  route({
    path: "/api/project/open_loops",
    methods: ["GET"],
    face: "projectWorkspace",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(await (await projectReadSurface(application, query)).openLoops());
    },
  }),
  route({
    path: "/api/project/history",
    methods: ["GET"],
    face: "projectWorkspace",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(await (await projectReadSurface(application, query)).history());
    },
  }),
  route({
    path: "/api/project/journal",
    methods: ["GET", "POST"],
    face: "projectWorkspace",
    resolveFaceFirst: true,
    handle: async ({ application, body, method, ok, query, requirePost }) => {
      const workspace = requireSurface(application.projectWorkspace, "projectWorkspace");
      if (method === "GET") {
        const projectId = query.get("projectId");
        return ok(await workspace.journal(projectId === null || projectId === "" ? undefined : projectId));
      }
      requirePost();
      const b = bodyObject(body);
      return ok(
        await workspace.recordJournalEntry({
          ...(typeof b.projectId === "string" && b.projectId.length > 0 ? { projectId: b.projectId } : {}),
          kind: enumValue(b.kind, PROJECT_JOURNAL_KINDS, "kind"),
          title: str(b.title, "title"),
          body: str(b.body, "body"),
          provenance: str(b.provenance, "provenance"),
          ...(b.relatedRefs === undefined ? {} : { relatedRefs: b.relatedRefs as never }),
        }),
      );
    },
  }),
  route({
    path: "/api/project/journal/resolve",
    methods: ["POST"],
    face: "projectWorkspace",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      return ok(
        await requireSurface(application.projectWorkspace, "projectWorkspace").resolveJournalEntry({
          ...(typeof b.projectId === "string" && b.projectId.length > 0 ? { projectId: b.projectId } : {}),
          entryId: str(b.entryId, "entryId"),
          resolution: {
            status: enumValue(b.status, PROJECT_JOURNAL_RESOLUTION_STATUSES, "status"),
            ...(b.detail === undefined ? {} : { detail: str(b.detail, "detail") }),
          },
        }),
      );
    },
  }),
  route({
    path: "/api/project/decision",
    methods: ["POST"],
    face: "projectWorkspace",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      const evidenceIds = Array.isArray(b.evidenceIds) ? b.evidenceIds.map((id) => str(id, "evidenceIds[]")) : [];
      return ok(
        await requireSurface(application.projectWorkspace, "projectWorkspace").appendDecision({
          ...(typeof b.projectId === "string" && b.projectId.length > 0 ? { projectId: b.projectId } : {}),
          statement: str(b.statement, "statement"),
          rationale: str(b.rationale, "rationale"),
          evidenceIds,
          ...(b.supersedes === undefined ? {} : { supersedes: str(b.supersedes, "supersedes") }),
        }),
      );
    },
  }),
  route({
    path: "/api/project/association",
    methods: ["POST"],
    face: "projectWorkspace",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      const canonicalRef = parseBody(() => parseCanonicalAssetRef(b.canonicalRef, "canonicalRef"));
      return ok(
        await requireSurface(application.projectWorkspace, "projectWorkspace").associateAsset({
          ...(typeof b.projectId === "string" && b.projectId.length > 0 ? { projectId: b.projectId } : {}),
          assetKind: enumValue(b.assetKind, PROJECT_ASSET_KINDS, "assetKind"),
          canonicalRef,
          associationKind: enumValue(b.associationKind, ASSOCIATION_KINDS, "associationKind"),
          provenance: str(b.provenance, "provenance"),
        }),
      );
    },
  }),
  route({
    path: "/api/project/opportunity/promote",
    methods: ["POST"],
    face: "projectWorkspace",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      const taskSpec = b.taskSpec;
      if (typeof taskSpec !== "object" || taskSpec === null || Array.isArray(taskSpec)) throw new InvalidRequest("taskSpec must be an object");
      return ok(
        await requireSurface(application.projectWorkspace, "projectWorkspace").promoteOpportunity({
          ...(typeof b.projectId === "string" && b.projectId.length > 0 ? { projectId: b.projectId } : {}),
          entryId: str(b.entryId, "entryId"),
          taskSpec: taskSpec as never,
        }),
      );
    },
  }),
  // G10-X: mechanical project-head reconciliation (operator/management-driven). The endpoint wraps
  // `reconcileProjectHead()`: the caller supplies NOTHING - there is no head, source commit, expected
  // head or plan field on the wire - and the head can only advance onto the canonically proven effect
  // head when the project is quiescent. It never promotes an attempt.
  route({
    path: "/api/project/reconcile_head",
    methods: ["POST"],
    face: "projectManagement",
    handle: async ({ application, ok, requirePost }) => {
      requirePost();
      return ok(await requireSurface(application.projectManagement, "projectManagement").reconcileProjectHead());
    },
  }),

  /* ---- management autonomy (G10-V; mode ≠ authority, request only) ---- */
  // G10-AB: the derived operating posture - the Work Mode preference with its EFFECTIVE capability
  // status, and the management axis. Read-only.
  route({
    path: "/api/project/operating-posture",
    methods: ["GET"],
    face: "projectManagement",
    handle: async ({ application, ok, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.projectManagement, "projectManagement").posture());
    },
  }),
  // G10-AB: the durable, append-only management activity history. Reads are read-only: the activity
  // log is product/audit history, never authority.
  route({
    path: "/api/manage/activity",
    methods: ["GET"],
    face: "projectManagement",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      const limitRaw = query.get("limit");
      let limit: number | undefined;
      if (limitRaw !== null && limitRaw !== "") {
        const parsed = Number(limitRaw);
        if (!Number.isSafeInteger(parsed) || parsed < 1) {
          throw new InvalidRequest('"limit" must be a positive integer');
        }
        limit = parsed;
      }
      const management = requireSurface(application.projectManagement, "projectManagement");
      return ok(limit === undefined ? await management.activity() : await management.activity(limit));
    },
  }),
  // The second PREFIX route: the canonical adapter matched `/api/manage/activity/` with `startsWith`
  // and looked the record up by the remaining path segment.
  route({
    path: "/api/manage/activity/",
    match: "prefix",
    methods: ["GET"],
    face: "projectManagement",
    covers: [],
    handle: async ({ application, ok, pathname, requireGet }) => {
      requireGet();
      const recordId = decodeURIComponent(pathname.slice("/api/manage/activity/".length));
      if (recordId.length === 0) throw new InvalidRequest("an activity record id is required");
      const records = await requireSurface(application.projectManagement, "projectManagement").activity();
      const record = records.find((entry) => entry.recordId === recordId);
      if (record === undefined) throw new InvalidRequest(`unknown management activity record "${recordId}"`);
      return ok(record);
    },
  }),
  // G10-AB: the DERIVED operating history (references only; ProjectIR stays the canonical owner of
  // every revision).
  route({
    path: "/api/project/operating-history",
    methods: ["GET"],
    face: "projectManagement",
    handle: async ({ application, ok, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.projectManagement, "projectManagement").operatingHistory());
    },
  }),
  // G10-AB: an agent-facing Work Mode REQUEST. It never persists the user-level project default -
  // HTTP authentication is not operator semantic authority, so only the operator CLI control path can
  // apply a change.
  route({
    path: "/api/manage/request_work_mode_change",
    methods: ["POST"],
    face: "projectManagement",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      const baseMode = enumValue(b.baseMode, WORK_MODE_BASE_MODES, "baseMode");
      const modifiersRaw = b.modifiers ?? [];
      if (!Array.isArray(modifiersRaw)) throw new InvalidRequest('"modifiers" must be an array');
      const modifiers = modifiersRaw.map((entry) => enumValue(entry, WORK_MODE_MODIFIERS, "modifiers"));
      return ok(
        await requireSurface(application.projectManagement, "projectManagement").requestWorkModeChange({
          baseMode: baseMode as WorkModeBaseMode,
          modifiers: modifiers as readonly WorkModeModifier[],
        }),
      );
    },
  }),

  /* ---- monitor (G10-AC §39) ---- */
  // READ-ONLY monitor observation. There is deliberately no HTTP force-tick: an HTTP-authenticated
  // caller must not bypass the project's MONITOR preference. The operator/debug tick lives on the CLI.
  route({
    path: "/api/monitor/status",
    methods: ["GET"],
    face: "monitor",
    handle: async ({ application, ok, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.monitor, "monitor").status());
    },
  }),
  route({
    path: "/api/monitor/preview",
    methods: ["GET"],
    face: "monitor",
    handle: async ({ application, ok, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.monitor, "monitor").preview());
    },
  }),

  /* ---- project-head verification (G10-AD §23) ---- */
  // Status and history are pure reads; the run endpoint accepts ONLY the two honest inputs a caller
  // may choose — a REGISTERED verifierRef and a free-text reason. There is deliberately NO route that
  // accepts a verifier DEFINITION, a command, an independence class or a commit: an
  // HTTP-authenticated caller can never register a verifier or retarget the subject, and the subject
  // is always the exact current ProjectIR head.
  route({
    path: "/api/verification/status",
    methods: ["GET"],
    face: "verification",
    handle: async ({ application, ok, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.verification, "verification").status());
    },
  }),
  route({
    path: "/api/verification/history",
    methods: ["GET"],
    face: "verification",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      const limitRaw = query.get("limit");
      if (limitRaw === null) {
        return ok(await requireSurface(application.verification, "verification").history());
      }
      const limit = Number(limitRaw);
      if (!Number.isSafeInteger(limit) || limit < 1) throw new InvalidRequest('"limit" must be a positive integer');
      return ok(await requireSurface(application.verification, "verification").history(limit));
    },
  }),
  route({
    path: "/api/verification/verify_current_head",
    methods: ["POST"],
    face: "verification",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      const verifierRef = b.verifierRef === undefined ? undefined : str(b.verifierRef, "verifierRef");
      const reason = b.reason === undefined ? undefined : str(b.reason, "reason");
      return ok(
        await requireSurface(application.verification, "verification").verifyCurrentHead({
          ...(verifierRef === undefined ? {} : { verifierRef }),
          ...(reason === undefined ? {} : { reason }),
        }),
      );
    },
  }),

];

/**
 * The project read routes are scoped to the INSTALLED project: a `projectId` query naming a
 * different project is refused rather than ignored. Shared by the four read routes.
 */
async function projectReadSurface(application: PalimpsestApplicationSurface, query: URLSearchParams) {
  const workspace = requireSurface(application.projectWorkspace, "projectWorkspace");
  const requested = query.get("projectId");
  if (requested !== null && requested !== "") {
    const current = (await workspace.view()).projectId;
    if (requested !== current) {
      throw new ProjectWorkspaceError(
        "invalid_registration",
        `project "${requested}" is not this installation's project "${current}"`,
      );
    }
  }
  return workspace;
}

