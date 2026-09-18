/**
 * SR-1 R3B — the projections route cluster.
 *
 * Derived read models. Every route here is a GET over an already-computed view of canonical state;
 * none of them is a second truth store and none of them writes.
 */

import { queryRequired, requireSurface, route, type ApplicationRouteDescriptor } from "./common.js";

export const PROJECTIONS_ROUTES: readonly ApplicationRouteDescriptor[] = [
  route({
    path: "/api/projection/work",
    methods: ["GET"],
    face: "projections",
    handle: async ({ application, ok, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.projections, "projections").work());
    },
  }),
  route({
    path: "/api/projection/organization",
    methods: ["GET"],
    face: "projections",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.projections, "projections").organization({ organizationDefinitionId: queryRequired(query, "organizationDefinitionId") }));
    },
  }),
  route({
    path: "/api/projection/collaboration",
    methods: ["GET"],
    face: "projections",
    handle: async ({ application, ok, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.projections, "projections").collaboration());
    },
  }),
  route({
    path: "/api/projection/runtime",
    methods: ["GET"],
    face: "projections",
    handle: async ({ application, ok, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.projections, "projections").runtime());
    },
  }),
  route({
    path: "/api/projection/reasoning",
    methods: ["GET"],
    face: "projections",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.projections, "projections").reasoning({ cellId: queryRequired(query, "cellId") }));
    },
  }),
];
