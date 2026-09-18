/**
 * SR-1 R3B — the organization route cluster: runtime scope, institution, campaign, dynamics and
 * governed evolution.
 *
 * These are one cluster because they are one ladder: a runtime scope is where work happens, an
 * institution is how it is governed, a campaign is what it is for, dynamics is what is observed,
 * and evolution is the only path that may transform any of it.
 */

import { bodyObject, queryRequired, requireSurface, route, str, type ApplicationRouteDescriptor } from "./common.js";
import { InvalidRequest } from "./common.js";

export const ORGANIZATION_ROUTES: readonly ApplicationRouteDescriptor[] = [
  /* ---- runtime ---- */
  route({
    path: "/api/runtime/scopes",
    methods: ["GET"],
    face: "runtime",
    handle: async ({ application, ok, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.runtime, "runtime").list());
    },
  }),
  route({
    path: "/api/runtime/scope",
    methods: ["GET"],
    face: "runtime",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.runtime, "runtime").view(queryRequired(query, "scopeId")));
    },
  }),
  route({
    path: "/api/runtime/holon",
    methods: ["GET"],
    face: "runtime",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.runtime, "runtime").holon(queryRequired(query, "scopeId")));
    },
  }),
  /* ---- organization / institution ---- */
  route({
    path: "/api/organization/view",
    methods: ["GET"],
    face: "organization",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.organization, "organization").view(queryRequired(query, "organizationDefinitionId")));
    },
  }),
  route({
    path: "/api/organization/retirements",
    methods: ["GET"],
    face: "organization",
    handle: async ({ application, ok, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.organization, "organization").retirements());
    },
  }),
  route({
    path: "/api/organization/institutions",
    methods: ["GET"],
    face: "organization",
    handle: async ({ application, ok, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.organization, "organization").institutions());
    },
  }),
  route({
    path: "/api/organization/institution",
    methods: ["GET"],
    face: "organization",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.organization, "organization").institutionView(queryRequired(query, "institutionId")));
    },
  }),
  /* ---- campaign ---- */
  route({
    path: "/api/campaign/view",
    methods: ["GET"],
    face: "campaign",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.campaign, "campaign").view(queryRequired(query, "campaignId")));
    },
  }),
  /* ---- dynamics ---- */
  route({
    path: "/api/dynamics/observe",
    methods: ["POST"],
    face: "dynamics",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      return ok(await requireSurface(application.dynamics, "dynamics").observe(bodyObject(body).subject));
    },
  }),
  route({
    path: "/api/dynamics/diagnose",
    methods: ["POST"],
    face: "dynamics",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      return ok(await requireSurface(application.dynamics, "dynamics").diagnose(bodyObject(body).subject));
    },
  }),
  route({
    path: "/api/dynamics/propose",
    methods: ["POST"],
    face: "dynamics",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      return ok(await requireSurface(application.dynamics, "dynamics").propose({ subject: b.subject, ...(b.advisor === undefined ? {} : { advisor: b.advisor }) }));
    },
  }),
  route({
    path: "/api/dynamics/impact",
    methods: ["POST"],
    face: "dynamics",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      return ok(await requireSurface(application.dynamics, "dynamics").proposalImpact({ proposal: b.proposal, subject: b.subject }));
    },
  }),
  route({
    path: "/api/dynamics/freshness",
    methods: ["POST"],
    face: "dynamics",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      return ok(await requireSurface(application.dynamics, "dynamics").freshness(bodyObject(body).proposal));
    },
  }),
  /* ---- evolution ---- */
  // The one PREFIX route in this cluster: the canonical adapter matched `/api/evolution/` with
  // `startsWith`, and an unknown action under it is a 400 naming the path — never a fall-through.
  route({
    path: "/api/evolution/",
    match: "prefix",
    methods: ["POST"],
    face: "evolution",
    covers: [
      "/api/evolution/inspect",
      "/api/evolution/prepare",
      "/api/evolution/advance",
      "/api/evolution/inspect_runtime",
      "/api/evolution/advance_runtime",
    ],
    handle: async ({ application, body, ok, pathname, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      const evolution = requireSurface(application.evolution, "evolution");
      if (pathname === "/api/evolution/inspect") return ok(await evolution.inspectOrganization(str(b.caseRef, "caseRef")));
      if (pathname === "/api/evolution/prepare") return ok(await evolution.prepareOrganization(b.proposal as never));
      if (pathname === "/api/evolution/advance") return ok(await evolution.advanceOrganization(b.proposal as never));
      if (pathname === "/api/evolution/inspect_runtime") return ok(await evolution.inspectRuntime(str(b.caseRef, "caseRef")));
      if (pathname === "/api/evolution/advance_runtime") return ok(await evolution.advanceRuntime(b.proposal as never));
      throw new InvalidRequest(`unknown evolution action "${pathname}"`);
    },
  }),
];
