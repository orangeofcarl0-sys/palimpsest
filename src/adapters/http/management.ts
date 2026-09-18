/**
 * SR-1 R3B — the management autonomy routes.
 *
 * The tail of the canonical dispatch order: the confirmable step, the bounded run, and the explicit
 * mode-change REQUEST. Mode is never authority — an HTTP-authenticated caller may ask, and only the
 * operator control path can apply a change to the user-level project default.
 */

import {
  InvalidRequest,
  bodyObject,
  enumValue,
  requireSurface,
  route,
  type ApplicationRouteDescriptor,
} from "./common.js";
import { MANAGEMENT_INVOLVEMENTS } from "../../project_management/index.js";

export const MANAGEMENT_ROUTES: readonly ApplicationRouteDescriptor[] = [
  route({
    path: "/api/manage/status",
    methods: ["GET"],
    face: "projectManagement",
    handle: async ({ application, ok, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.projectManagement, "projectManagement").status());
    },
  }),
  // G10-W (CF-V-01): canonical read-only recommend/preview endpoints, distinct from an UNCONFIRMED
  // step. Both are pure reads of the same evaluator the step uses; neither mutates the ledger and
  // neither applies a revision.
  route({
    path: "/api/manage/recommend",
    methods: ["GET"],
    face: "projectManagement",
    handle: async ({ application, ok, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.projectManagement, "projectManagement").recommend());
    },
  }),
  route({
    path: "/api/manage/preview",
    methods: ["GET"],
    face: "projectManagement",
    handle: async ({ application, ok, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.projectManagement, "projectManagement").preview());
    },
  }),
  route({
    path: "/api/manage/step",
    methods: ["POST"],
    face: "projectManagement",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      if (b.confirmed !== undefined && typeof b.confirmed !== "boolean") throw new InvalidRequest('"confirmed" must be a boolean');
      return ok(await requireSurface(application.projectManagement, "projectManagement").step(b.confirmed === undefined ? {} : { confirmed: b.confirmed }));
    },
  }),
  route({
    path: "/api/manage/run",
    methods: ["POST"],
    face: "projectManagement",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      const maxSteps = b.maxSteps;
      if (maxSteps !== undefined && (typeof maxSteps !== "number" || !Number.isSafeInteger(maxSteps) || maxSteps < 1)) {
        throw new InvalidRequest('"maxSteps" must be a positive integer');
      }
      return ok(await requireSurface(application.projectManagement, "projectManagement").run(maxSteps === undefined ? {} : { maxSteps }));
    },
  }),
  route({
    path: "/api/manage/request_mode_change",
    methods: ["POST"],
    face: "projectManagement",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      return ok(
        await requireSurface(application.projectManagement, "projectManagement").requestModeChange({
          to: enumValue(b.to, MANAGEMENT_INVOLVEMENTS, "to"),
        }),
      );
    },
  }),
];
