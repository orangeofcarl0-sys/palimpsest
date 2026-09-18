/**
 * SR-1 R3B — the product route cluster: one-request cross-project collaboration and the
 * one-request collaboration face.
 *
 * §67: discovery/prepare/status/pending/receive plus a MUTATING Ask route. The mutating route is
 * acceptable only under the existing product user-intent/auth semantics: it is the explicit
 * cross-project Ask (§27 — nothing else may send), it is NOT the expert `/api/federation/message`
 * shape, and plain HTTP authentication grants no new peer authority. `respond` is mutating too: it
 * sends one answer and then acknowledges the request it answered.
 *
 * The HIGH-LEVEL collaboration face: one request in, a plan or a useful result out. `plan` is
 * read-only; `run` executes only the existing governed recipe / verification paths. The body IS the
 * `CollaborationRequest`, parsed strictly by the interaction layer so a caller cannot smuggle a
 * recipe id, an agent id, a command or an authority flag through this route — and a request that
 * carries one is refused (400), never silently ignored.
 */

import { bodyObject, queryRequired, requireSurface, route, str, type ApplicationRouteDescriptor } from "./common.js";

export const PRODUCT_ROUTES: readonly ApplicationRouteDescriptor[] = [
  route({
    path: "/api/cross-project/projects",
    methods: ["GET"],
    face: "crossProject",
    handle: async ({ application, ok, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.crossProject, "crossProject").projects());
    },
  }),
  route({
    path: "/api/cross-project/prepare",
    methods: ["POST"],
    face: "crossProject",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      return ok(await requireSurface(application.crossProject, "crossProject").prepareAsk(body));
    },
  }),
  route({
    path: "/api/cross-project/ask",
    methods: ["POST"],
    face: "crossProject",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      return ok(await requireSurface(application.crossProject, "crossProject").ask(body));
    },
  }),
  route({
    path: "/api/cross-project/status",
    methods: ["GET"],
    face: "crossProject",
    handle: async ({ application, ok, query, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.crossProject, "crossProject").status(queryRequired(query, "requestId")));
    },
  }),
  route({
    path: "/api/cross-project/pending",
    methods: ["GET"],
    face: "crossProject",
    handle: async ({ application, ok, requireGet }) => {
      requireGet();
      return ok(await requireSurface(application.crossProject, "crossProject").pending());
    },
  }),
  route({
    path: "/api/cross-project/respond",
    methods: ["POST"],
    face: "crossProject",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      return ok(
        await requireSurface(application.crossProject, "crossProject").respond(
          str(b.requestId, "requestId"),
          b.answer,
        ),
      );
    },
  }),
  route({
    path: "/api/cross-project/receive",
    methods: ["POST"],
    face: "crossProject",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      return ok(await requireSurface(application.crossProject, "crossProject").receive(str(b.requestId, "requestId")));
    },
  }),
  route({
    path: "/api/cross-project/acknowledge",
    methods: ["POST"],
    face: "crossProject",
    // SC-7: per-`PeerMessage`, never per-id. The body IS the message the caller
    // consumed; the application face strict-parses it.
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      const b = bodyObject(body);
      return ok(await requireSurface(application.crossProject, "crossProject").acknowledge(b.message));
    },
  }),
  route({
    path: "/api/collaboration/plan",
    methods: ["POST"],
    face: "collaboration",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      return ok(await requireSurface(application.collaboration, "collaboration").plan(body));
    },
  }),
  route({
    path: "/api/collaboration/run",
    methods: ["POST"],
    face: "collaboration",
    handle: async ({ application, body, ok, requirePost }) => {
      requirePost();
      return ok(await requireSurface(application.collaboration, "collaboration").run(body));
    },
  }),
];
